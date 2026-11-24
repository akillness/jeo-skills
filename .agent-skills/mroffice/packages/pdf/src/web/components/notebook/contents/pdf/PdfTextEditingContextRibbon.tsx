"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PdfInsertRibbonIcon } from "./PdfInsertRibbonIcons";
import { OfficeWordArtPreview } from "@mrnote/core/web/components/office-ribbon/OfficeWordArtStyleGallery.tsx";
import { OFFICE_WORDART_GALLERY_RECIPES, officeWordArtRecipeName } from "@mrnote/core/web/lib/office-wordart-gallery.ts";
import { sameOfficeTextPaint, type OfficeTextPaint } from "@mrnote/core/web/lib/office-text-paint.ts";
import { pdfTextBoxTextPaint } from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import { MoveHorizontal } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { officeFamilyDisplayNames } from "@mrnote/core/web/lib/office-fonts/localized-names.ts";
import { PDF_SYSTEM_FAMILY_CANDIDATES, pdfPageFontDisplayFamily } from "../../../../lib/pdf/page-fonts";

import {
  OfficeHomeCheckbox,
  OfficeHomeCommand,
  OfficeHomeCommandRow,
  OfficeHomeCommandStack,
  OfficeHomeMenuTrigger,
  OfficeHomeRibbonGroup,
  OfficeHomeSplitLayout,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import { OfficeRibbonNumberField } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonNumberField.tsx";
import { OfficeColorPalettePopover } from "@mrnote/core/web/components/office-ribbon/OfficeColorPalettePopover.tsx";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import {
  RibbonFontFamilyPicker,
  type RibbonFontPickerLabels,
  type RibbonFontFamilySection,
} from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import {
  chineseFontSizePoints,
  formatOfficeFontSize,
  officeFontSizeOptions,
  parseOfficeFontSizeInput,
} from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { RibbonValueCombobox } from "@mrnote/core/web/components/office-ribbon/RibbonValueCombobox.tsx";
import type { OfficeFormatPreviewPatch } from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import { RibbonDropdownMenuContent as DropdownMenuContent } from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart } from "lucide-react";
import { IconAlignTextMenu, IconBulletStyle, IconNumberStyle, IconTextColumns, IconTextVertical } from "@mrnote/slides/web/components/notebook/contents/PresentationRibbonIcons.tsx";
import { OfficeListGalleryMenuContent, OfficeListGalleryPreview, OfficeListGalleryTile } from "@mrnote/core/web/components/office-ribbon/OfficeListGallery.tsx";
import { POWERPOINT_BULLET_LIBRARY, powerPointNumberLibrary } from "@mrnote/core/web/lib/presentation-bullet-library.ts";
import type { PdfTextListStyle } from "../../../../lib/pdf/text-list";
import { useLocale } from "@mrnote/core/host/next-intl.tsx";

import styles from "./PdfTextEditingContextRibbon.module.css";
import type { ChangeCaseMode } from "@mrnote/core/web/lib/presentation-text-case.ts";
import { DocsHomeIcon, type DocsHomeIconName } from "@mrnote/core/web/components/console/editor/DocumentHomeRibbonIcons.tsx";
import type { PdfRibbonTranslator } from "./pdfRibbonTranslator";

export type PdfTextEditingControl =
  | "hand"
  | "select"
  | "formatPainter"
  | "insertText"
  | "insertSymbol"
  | "fontFamily"
  | "fontSize"
  | "fontSizeIncrease"
  | "fontSizeDecrease"
  | "changeCase"
  | "clearFormatting"
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "subscript"
  | "superscript"
  | "highlight"
  | "fontColor"
  | "indentDecrease"
  | "indentIncrease"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "alignDistributed"
  | "verticalAlign"
  | "textDirection"
  | "columns"
  | "wordArt"
  | "bullets"
  | "numbering"
  | "lineSpacing"
  | "characterSpacing"
  | "firstLineIndent"
  | "wordSpacing"
  | "leftIndent"
  | "rightIndent"
  | "spaceBefore"
  | "spaceAfter"
  | "tabStops"
  | "horizontalScale"
  | "keyboardInput"
  | "save"
  | "exit"
  | "convertKind"
  | "rotateLeft"
  | "rotateRight"
  | "delete";

export type PdfTextEditingCapability = Readonly<{
  enabled: boolean;
  reason?: string;
}>;

export type PdfTextEditingCapabilities = Readonly<
  Record<PdfTextEditingControl, PdfTextEditingCapability>
>;

export type PdfTextEditingNumberControl =
  | "lineSpacing"
  | "characterSpacing"
  | "firstLineIndent"
  | "wordSpacing"
  | "leftIndent"
  | "rightIndent"
  | "spaceBefore"
  | "spaceAfter"
  | "horizontalScale";

export interface PdfTextEditingContextRibbonLabels {
  tools: string;
  hand: string;
  select: string;
  formatPainter: string;
  insert: string;
  insertText: string;
  /** WPS's 插入符号 (CT_TextEdit RB_Insert: Edit_InsertSymbol). */
  insertSymbol: string;
  font: string;
  fontFamily: string;
  /** The shared font picker's own strings (Theme / Recent / All Fonts, search, Browse). */
  fontPicker: RibbonFontPickerLabels;
  fontSize: string;
  fontSizeIncrease: string;
  fontSizeDecrease: string;
  changeCase: string;
  changeCaseModes: Readonly<Record<PdfTextCaseMode, string>>;
  clearFormatting: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  subscript: string;
  superscript: string;
  /** The 上标/下标 split's menu (WPS: X²▾). */
  script: string;
  highlight: string;
  fontColor: string;
  paragraph: string;
  indentDecrease: string;
  indentIncrease: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  alignDistributed: string;
  /** Word's / PowerPoint's Align Text (a text box's rows in its frame). */
  alignText: string;
  /** 项目符号 / 编号 and their galleries (the presentation editor's words). */
  bullets: string;
  numbering: string;
  bulletLibrary: string;
  numberingLibrary: string;
  bulletStyleMenu: string;
  numberingStyleMenu: string;
  listNone: string;
  listItems: Readonly<Record<string, string>>;
  verticalAlignModes: Readonly<Record<PdfTextVerticalAlign, string>>;
  textDirection: string;
  textDirectionModes: Readonly<Record<PdfTextDirection, string>>;
  columns: string;
  columnCounts: Readonly<Record<1 | 2 | 3, string>>;
  columnsMore: string;
  wordArt: string;
  clearWordArt: string;
  /** Each WordArt style's name (PowerPoint's), by recipe id. */
  wordArtStyles: Readonly<Record<string, string>>;
  lineSpacing: string;
  characterSpacing: string;
  firstLineIndent: string;
  keyboardInput: string;
  actions: string;
  object: string;
  save: string;
  saving: string;
  saved: string;
  exit: string;
  more: string;
  moreSpacing: string;
  /** Word's Tabs… (the paragraph's tab stops). */
  tabStops: string;
  /** The right-hand settings pane. */
  settingsPane: string;
  wordSpacing: string;
  leftIndent: string;
  spaceBefore: string;
  spaceAfter: string;
  rightIndent: string;
  horizontalScale: string;
  convertToFormula: string;
  convertToText: string;
  delete: string;
  rotateLeft: string;
  rotateRight: string;
  themeColors: string;
  standardColors: string;
  recentColors: string;
  moreColors: string;
  mixed: string;
  unavailable: string;
}

export function createPdfTextEditingContextRibbonLabels(
  t: PdfRibbonTranslator,
): PdfTextEditingContextRibbonLabels {
  return {
    tools: t("pdfContextRibbon.text.tools"),
    hand: t("pdfContextRibbon.text.hand"),
    select: t("pdfContextRibbon.text.select"),
    formatPainter: t("pdfContextRibbon.text.formatPainter"),
    insert: t("pdfContextRibbon.text.insert"),
    insertText: t("pdfContextRibbon.text.insertText"),
    insertSymbol: t("toolbar.symbolDialogTitle"),
    font: t("pdfContextRibbon.text.font"),
    fontFamily: t("pdfContextRibbon.text.fontFamily"),
    fontPicker: {
      browse: t("toolbar.fontPickerBrowse"),
      search: t("toolbar.fontPickerSearch"),
      searchPlaceholder: t("toolbar.fontPickerSearchPlaceholder"),
      recent: t("toolbar.recentFonts"),
      pinned: t("toolbar.fontPickerPinned"),
      officeFonts: t("toolbar.fontPickerOfficeFonts"),
      allFonts: t("toolbar.fontPickerAllFonts"),
      pin: t("toolbar.fontPickerPin"),
      unpin: t("toolbar.fontPickerUnpin"),
      available: t("toolbar.fontPickerAvailable"),
      missing: t("toolbar.fontPickerMissing"),
      unverified: t("toolbar.fontPickerUnverified"),
      browseUnsupported: t("toolbar.fontPickerBrowseUnsupported"),
      browseDenied: t("toolbar.fontPickerBrowseDenied"),
      browseFailed: t("toolbar.fontPickerBrowseFailed"),
      noResults: t("toolbar.fontPickerNoResults"),
      variants: t("toolbar.fontPickerVariants"),
      mixed: t("toolbar.fontPickerMixed"),
    },
    fontSize: t("pdfContextRibbon.text.fontSize"),
    fontSizeIncrease: t("pdfContextRibbon.text.fontSizeIncrease"),
    fontSizeDecrease: t("pdfContextRibbon.text.fontSizeDecrease"),
    // Word's own command and words (the document editor's 更改大小写).
    changeCase: t("toolbar.changeCase"),
    changeCaseModes: {
      sentence: t("toolbar.changeCaseSentence"),
      lower: t("toolbar.changeCaseLower"),
      upper: t("toolbar.changeCaseUpper"),
      title: t("toolbar.changeCaseTitle"),
      toggle: t("toolbar.changeCaseToggle"),
      halfWidth: t("toolbar.changeCaseHalfWidth"),
      fullWidth: t("toolbar.changeCaseFullWidth"),
    },
    clearFormatting: t("pdfContextRibbon.text.clearFormatting"),
    bold: t("pdfContextRibbon.text.bold"),
    italic: t("pdfContextRibbon.text.italic"),
    underline: t("pdfContextRibbon.text.underline"),
    strikethrough: t("pdfContextRibbon.text.strikethrough"),
    subscript: t("pdfContextRibbon.text.subscript"),
    superscript: t("pdfContextRibbon.text.superscript"),
    script: t("pdfContextRibbon.text.script"),
    highlight: t("pdfContextRibbon.text.highlight"),
    fontColor: t("pdfContextRibbon.text.fontColor"),
    paragraph: t("pdfContextRibbon.text.paragraph"),
    indentDecrease: t("pdfContextRibbon.text.indentDecrease"),
    indentIncrease: t("pdfContextRibbon.text.indentIncrease"),
    alignLeft: t("pdfContextRibbon.text.alignLeft"),
    alignCenter: t("pdfContextRibbon.text.alignCenter"),
    alignRight: t("pdfContextRibbon.text.alignRight"),
    alignJustify: t("pdfContextRibbon.text.alignJustify"),
    alignDistributed: t("pdfContextRibbon.text.alignDistributed"),
    // The presentation editor's own command and words.
    alignText: t("presentation.home.alignText"),
    bullets: t("presentation.home.bullets"),
    numbering: t("presentation.home.numbering"),
    bulletLibrary: t("toolbar.bulletLibrary"),
    numberingLibrary: t("toolbar.numberingLibrary"),
    bulletStyleMenu: t("toolbar.bulletListStyleMenu"),
    numberingStyleMenu: t("toolbar.numberedListStyleMenu"),
    listNone: t("toolbar.listNone"),
    listItems: Object.fromEntries(
      [...POWERPOINT_BULLET_LIBRARY, ...powerPointNumberLibrary("zh"), ...powerPointNumberLibrary("en")]
        .map((item) => [item.id, t(`presentation.bulletsLibrary.${item.id}` as "presentation.bulletsLibrary.arrow")]),
    ),
    verticalAlignModes: {
      top: t("presentation.valign.top"),
      middle: t("presentation.valign.middle"),
      bottom: t("presentation.valign.bottom"),
    },
    textDirection: t("presentation.writingModeLabel"),
    textDirectionModes: {
      horizontal: t("presentation.writingMode.horizontal"),
      vertical: t("presentation.writingMode.vertical"),
      rotate90: t("presentation.home.textDirectionRotate90"),
      rotate270: t("presentation.home.textDirectionRotate270"),
    },
    columns: t("presentation.textColumnsLabel"),
    columnCounts: {
      1: t("presentation.home.columns.1"),
      2: t("presentation.home.columns.2"),
      3: t("presentation.home.columns.3"),
    },
    columnsMore: t("presentation.columnsDialog.more"),
    wordArt: t("office.wordArt.title"),
    clearWordArt: t("presentation.tableRibbon.clearWordArt"),
    wordArtStyles: Object.fromEntries(OFFICE_WORDART_GALLERY_RECIPES.map((recipe) => [
      recipe.id,
      officeWordArtRecipeName(recipe, t as unknown as (key: string, values?: Record<string, string>) => string),
    ])),
    lineSpacing: t("pdfContextRibbon.text.lineSpacing"),
    characterSpacing: t("pdfContextRibbon.text.characterSpacing"),
    firstLineIndent: t("pdfContextRibbon.text.firstLineIndent"),
    keyboardInput: t("pdfContextRibbon.text.keyboardInput"),
    actions: t("pdfContextRibbon.text.actions"),
    object: t("pdfContextRibbon.text.object"),
    save: t("pdfContextRibbon.text.save"),
    saving: t("pdfContextRibbon.text.saving"),
    saved: t("pdfContextRibbon.text.saved"),
    exit: t("pdfContextRibbon.text.exit"),
    more: t("pdfContextRibbon.text.more"),
    moreSpacing: t("pdfContextRibbon.text.moreSpacing"),
    tabStops: t("toolbar.tabStops"),
    settingsPane: t("pdf.settingsPane.title"),
    wordSpacing: t("pdfContextRibbon.text.wordSpacing"),
    leftIndent: t("pdfContextRibbon.text.leftIndent"),
    spaceBefore: t("toolbar.spaceBefore"),
    spaceAfter: t("toolbar.spaceAfter"),
    rightIndent: t("pdfContextRibbon.text.rightIndent"),
    horizontalScale: t("pdfContextRibbon.text.horizontalScale"),
    convertToFormula: t("pdfContextRibbon.text.convertToFormula"),
    convertToText: t("pdfContextRibbon.text.convertToText"),
    delete: t("pdfContextRibbon.text.delete"),
    rotateLeft: t("pdfContextRibbon.text.rotateLeft"),
    rotateRight: t("pdfContextRibbon.text.rotateRight"),
    themeColors: t("pdfContextRibbon.text.themeColors"),
    standardColors: t("pdfContextRibbon.text.standardColors"),
    recentColors: t("pdfContextRibbon.text.recentColors"),
    moreColors: t("pdfContextRibbon.text.moreColors"),
    mixed: t("pdfContextRibbon.text.mixed"),
    unavailable: t("pdfContextRibbon.text.unavailable"),
  };
}

export interface PdfTextEditingContextRibbonModel {
  target: "native-list" | "overlay-box";
  fontSections: readonly RibbonFontFamilySection[];
  activeFontLabel: string;
  activeFontFamily?: string;
  /** The selection is drawn in several faces (the picker reads Mixed). */
  fontFamilyMixed?: boolean;
  fontSize: number | null;
  bold: boolean | "mixed";
  italic: boolean | "mixed";
  underline: boolean | "mixed";
  strikethrough: boolean | "mixed";
  subscript: boolean | "mixed";
  superscript: boolean | "mixed";
  highlight: boolean | "mixed";
  color?: string;
  alignment: "left" | "center" | "right" | "justify" | "distributed" | null;
  /** A text box's Align Text (overlay boxes only). */
  verticalAlign?: PdfTextVerticalAlign | null;
  /** A text box's Text Direction (overlay boxes only). */
  textDirection?: PdfTextDirection | null;
  /** A text box's Columns (overlay boxes only): the count, 1 for none. */
  columns?: Readonly<{ count: number }> | null;
  /** A text box's WordArt (overlay boxes only): its paint, null for none. */
  textPaint?: OfficeTextPaint | null;
  /** The list the text is (absent: the host offers no lists). */
  list?: Readonly<{ kind: "bullet"; glyph: string } | { kind: "number" }> | null;
  lineSpacing: number | null;
  characterSpacing: number | null;
  firstLineIndent: number | null;
  wordSpacing: number | null;
  leftIndent: number | null;
  /** Word's paragraph Spacing Before / After (points); a box's only. */
  spaceBefore?: number | null;
  spaceAfter?: number | null;
  rightIndent: number | null;
  horizontalScale: number | null;
  keyboardInput: boolean;
  /** The right-hand settings pane is shown. */
  settingsPane?: boolean;
  kind?: "text" | "formula";
  saveState: "ready" | "saving" | "saved" | "blocked";
  /** 格式刷 armed for one paint or until Escape (pressed while armed). */
  formatPainter?: "single" | "sticky" | null;
}

export type PdfTextVerticalAlign = "top" | "middle" | "bottom";
/** Word's Text Direction for a text box (PowerPoint's and ONLYOFFICE's set). */
export type PdfTextDirection = "horizontal" | "vertical" | "rotate90" | "rotate270";
const PDF_TEXT_DIRECTION_MENU = ["horizontal", "vertical", "rotate90", "rotate270"] as const;
const PDF_TEXT_VERTICAL_ALIGN_MENU = [
  ["top", AlignVerticalJustifyStart],
  ["middle", AlignVerticalJustifyCenter],
  ["bottom", AlignVerticalJustifyEnd],
] as const;

/** Word's 更改大小写 (ONLYOFFICE's and WPS's too): the five cases and the
 * half- / full-width forms. */
export type PdfTextCaseMode = ChangeCaseMode | "halfWidth" | "fullWidth";
/** The menu's rows and icons, in the document editor's order. */
const PDF_TEXT_CASE_MENU: readonly (readonly (readonly [PdfTextCaseMode, DocsHomeIconName])[])[] = [
  [["sentence", "changeCaseSentence"], ["upper", "changeCaseUpper"], ["lower", "changeCaseLower"],
    ["title", "changeCaseTitle"], ["toggle", "changeCaseToggle"]],
  [["halfWidth", "characterWidthHalf"], ["fullWidth", "characterWidthFull"]],
];

export type PdfTextEditingContextRibbonAction =
  | Readonly<{
      type: "tool";
      tool: "hand" | "select" | "formatPainter";
      /** 格式刷 double-clicked: paint until Escape (Office). */
      sticky?: boolean;
    }>
  | Readonly<{ type: "insertText" }>
  | Readonly<{ type: "insertSymbol" }>
  | Readonly<{ type: "fontFamily"; value: string }>
  /** `draft`: a value being typed in the box (a preview), not committed. */
  | Readonly<{ type: "fontSize"; value: number; draft?: true }>
  | Readonly<{ type: "fontSizeStep"; delta: -1 | 1 }>
  /** 更改大小写 on the selected words, or the whole text when none are. */
  | Readonly<{ type: "changeCase"; mode: PdfTextCaseMode }>
  | Readonly<{
      type: "toggle";
      control:
        | "bold"
        | "italic"
        | "underline"
        | "strikethrough"
        | "subscript"
        | "superscript"
        | "highlight"
        | "clearFormatting";
    }>
  | Readonly<{ type: "fontColor"; value: string }>
  | Readonly<{
      type: "alignment";
      value: "left" | "center" | "right" | "justify" | "distributed";
    }>
  | Readonly<{ type: "verticalAlign"; value: PdfTextVerticalAlign }>
  | Readonly<{ type: "textDirection"; value: PdfTextDirection }>
  /** Columns: a count from the menu, or the Columns dialog (count and spacing). */
  | Readonly<{ type: "columns"; count: number }>
  | Readonly<{ type: "columnsDialog" }>
  /** Word's Tabs dialog, for the box's tab stops. */
  | Readonly<{ type: "tabsDialog" }>
  /** The right-hand settings pane (ONLYOFFICE's right panel), shown or hidden. */
  | Readonly<{ type: "settingsPane" }>
  /** WordArt Styles: a gallery paint, or none (清除艺术字). */
  | Readonly<{ type: "textPaint"; paint: OfficeTextPaint | null }>
  /** 项目符号 / 编号: the list style the text is set in (null: none). */
  | Readonly<{ type: "list"; style: PdfTextListStyle | null }>
  | Readonly<{ type: "indent"; direction: "decrease" | "increase" }>
  | Readonly<{
      type: "number";
      control: PdfTextEditingNumberControl;
      value: number;
    }>
  | Readonly<{ type: "keyboardInput"; value: boolean }>
  | Readonly<{ type: "save" }>
  | Readonly<{ type: "exit" }>
  | Readonly<{ type: "kind"; value: "text" | "formula" }>
  | Readonly<{ type: "rotate"; direction: "left" | "right" }>
  | Readonly<{ type: "delete" }>;

const ALL_CONTROLS: readonly PdfTextEditingControl[] = [
  "hand",
  "select",
  "formatPainter",
  "insertText",
  "insertSymbol",
  "fontFamily",
  "fontSize",
  "fontSizeIncrease",
  "fontSizeDecrease",
  "changeCase",
  "clearFormatting",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "subscript",
  "superscript",
  "highlight",
  "fontColor",
  "indentDecrease",
  "indentIncrease",
  "alignLeft",
  "alignCenter",
  "alignRight",
  "alignJustify",
  "alignDistributed",
  "verticalAlign",
  "textDirection",
  "columns",
  "wordArt",
  "bullets",
  "numbering",
  "lineSpacing",
  "characterSpacing",
  "firstLineIndent",
  "wordSpacing",
  "leftIndent",
  "rightIndent",
  "spaceBefore",
  "spaceAfter",
  "tabStops",
  "horizontalScale",
  "keyboardInput",
  "save",
  "exit",
  "convertKind",
  "rotateLeft",
  "rotateRight",
  "delete",
] as const;

export function createPdfTextEditingCapabilities(
  disabledReason: string,
  enabled: readonly PdfTextEditingControl[],
  disabledReasons: Partial<Record<PdfTextEditingControl, string>> = {},
): PdfTextEditingCapabilities {
  const enabledSet = new Set(enabled);
  return Object.freeze(
    Object.fromEntries(
      ALL_CONTROLS.map((control) => [
        control,
        enabledSet.has(control)
          ? Object.freeze({ enabled: true })
          : Object.freeze({
              enabled: false,
              reason: disabledReasons[control] ?? disabledReason,
            }),
      ]),
    ) as Record<PdfTextEditingControl, PdfTextEditingCapability>,
  );
}

// Word's Font Size list, from the shared Office catalog every editor lists.


// box (小四) still sets its size.
const FONT_SIZE_OPTIONS = officeFontSizeOptions("pdf");
const NOOP = () => undefined;

/** A size as the box takes it: a point size, or a Chinese size name. */
function parsePdfFontSizeInput(raw: string): number | undefined {
  return chineseFontSizePoints(raw) ?? parseOfficeFontSizeInput(raw, "pdf");
}

function pressed(value: boolean | "mixed"): boolean | "mixed" {
  return value;
}

/** Live Preview of a format toggle: what pressing it would set. */
function formatTogglePreview(
  control: string,
  active: boolean | "mixed" | undefined,
): OfficeFormatPreviewPatch | undefined {
  const next = active !== true;
  switch (control) {
    case "bold":
      return { bold: next };
    case "italic":
      return { italic: next };
    case "underline":
      return { underline: next };
    case "strikethrough":
      return { strike: next };
    default:
      return undefined;
  }
}

export function PdfTextEditingContextRibbon({
  model,
  capabilities,
  labels,
  fontPickerLabels,
  onAction,
  onRememberSelection = NOOP,
  status,
}: {
  model: PdfTextEditingContextRibbonModel;
  capabilities: PdfTextEditingCapabilities;
  labels: PdfTextEditingContextRibbonLabels;
  /** Supplying these turns on the shared rich font picker for this editor. */
  fontPickerLabels?: RibbonFontPickerLabels;
  onAction: (action: PdfTextEditingContextRibbonAction) => void;
  onRememberSelection?: () => void;
  status?: ReactNode;
}): React.JSX.Element {
  const [colorOpen, setColorOpen] = useState(false);
  const colorTriggerRef = useRef<HTMLButtonElement | null>(null);
  const locale = useLocale();
  // WPS's font list in a Chinese interface: 宋体 for SimSun, the families
  // named in Chinese first (the value written is still the family).
  const familyLabels = officeFamilyDisplayNames(locale);
  const fontSections = useMemo(
    () => Object.keys(familyLabels).length
      ? model.fontSections.map((section) => ({
          ...section,
          options: section.options.map((option) =>
            typeof option.value === "string" && familyLabels[option.value]
              ? { ...option, label: familyLabels[option.value] }
              : option),
        }))
      : model.fontSections,
    [familyLabels, model.fontSections],
  );
  // What the person is typing in the size box, kept until Enter or leaving
  // it: a host that previews no draft (a box of several rows set by row
  // formats) gave the box its size in force back at each keystroke, and
  
  const [fontSizeDraftText, setFontSizeDraftText] = useState<string | null>(null);
  // A size the host now states for another reason (the selection moved to
  // other characters) is shown, not the one typed before: kept, the box
  // showed 18 over a part set at 24.
  const shownFontSizeRef = useRef(model.fontSize);
  useEffect(() => {
    if (shownFontSizeRef.current === model.fontSize) return;
    shownFontSizeRef.current = model.fontSize;
    setFontSizeDraftText((draft) => draft !== null && parsePdfFontSizeInput(draft) === model.fontSize ? draft : null);
  }, [model.fontSize]);
  const fontSizeText = fontSizeDraftText ?? (model.fontSize == null ? "" : formatOfficeFontSize(model.fontSize));

  const disabledLabel = (control: PdfTextEditingControl, label: string) => {
    const capability = capabilities[control];
    return capability.enabled
      ? label
      : `${label}: ${capability.reason ?? labels.unavailable}`;
  };
  const dispatch = (
    control: PdfTextEditingControl,
    action: PdfTextEditingContextRibbonAction,
  ) => {
    if (!capabilities[control].enabled) return;
    onAction(action);
  };
  const formatCommands = [
    {
      control: "bold" as const,
      label: labels.bold,
      semanticId: "text.bold" as const,
      active: model.bold,
    },
    {
      control: "italic" as const,
      label: labels.italic,
      semanticId: "text.italic" as const,
      active: model.italic,
    },
    {
      control: "underline" as const,
      label: labels.underline,
      semanticId: "text.underline" as const,
      active: model.underline,
    },
    {
      control: "strikethrough" as const,
      label: labels.strikethrough,
      semanticId: "text.strikethrough" as const,
      active: model.strikethrough,
    },
  ] as const;
  // WPS's X²▾: one button for the script in use (superscript until a
  // subscript is set), and a menu holding both.
  const scriptControl: "superscript" | "subscript" =
    model.subscript === true ? "subscript" : "superscript";
  const scriptEnabled =
    capabilities.superscript.enabled || capabilities.subscript.enabled;
  const alignmentCommands = [
    {
      control: "alignLeft" as const,
      value: "left" as const,
      label: labels.alignLeft,
      semanticId: "paragraph.align.left" as const,
    },
    {
      control: "alignCenter" as const,
      value: "center" as const,
      label: labels.alignCenter,
      semanticId: "paragraph.align.center" as const,
    },
    {
      control: "alignRight" as const,
      value: "right" as const,
      label: labels.alignRight,
      semanticId: "paragraph.align.right" as const,
    },
    {
      control: "alignJustify" as const,
      value: "justify" as const,
      label: labels.alignJustify,
      semanticId: "paragraph.align.justify" as const,
    },
    {
      control: "alignDistributed" as const,
      value: "distributed" as const,
      label: labels.alignDistributed,
      semanticId: "paragraph.align.distributed" as const,
    },
  ] as const;
  const visibleNumbers = [
    {
      control: "lineSpacing" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.spacing.line" />,
      label: labels.lineSpacing,
      max: 1000,
      min: 0.1,
      step: 0.5,
      value: model.lineSpacing,
      testId: "line-spacing",
    },
    {
      control: "characterSpacing" as const,
      icon: <OfficeSemanticIcon semanticId="text.spacing.character" />,
      label: labels.characterSpacing,
      max: 1000,
      min: -1000,
      step: 0.1,
      value: model.characterSpacing,
      testId: "character-spacing",
    },
    {
      control: "firstLineIndent" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.indent.firstLine" />,
      label: labels.firstLineIndent,
      max: 1000,
      min: -1000,
      step: 0.1,
      value: model.firstLineIndent,
      testId: "first-line-indent",
    },
  ] as const;
  const advancedNumbers = [
    {
      control: "wordSpacing" as const,
      icon: <OfficeSemanticIcon semanticId="text.spacing.character" />,
      label: labels.wordSpacing,
      max: 1000,
      min: -1000,
      value: model.wordSpacing,
      step: 0.1,
      testId: "word-spacing",
    },
    {
      control: "leftIndent" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.indent.decrease" />,
      label: labels.leftIndent,
      max: 1000,
      min: -1000,
      value: model.leftIndent,
      step: 0.5,
      testId: "left-indent",
    },
    {
      control: "rightIndent" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.indent.increase" />,
      label: labels.rightIndent,
      max: 1000,
      min: -1000,
      value: model.rightIndent,
      step: 0.5,
      testId: "right-indent",
    },
    {
      control: "spaceBefore" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.spacing.line" />,
      label: labels.spaceBefore,
      max: 1584,
      min: 0,
      value: model.spaceBefore ?? null,
      step: 6,
      testId: "space-before",
    },
    {
      control: "spaceAfter" as const,
      icon: <OfficeSemanticIcon semanticId="paragraph.spacing.line" />,
      label: labels.spaceAfter,
      max: 1584,
      min: 0,
      value: model.spaceAfter ?? null,
      step: 6,
      testId: "space-after",
    },
    {
      control: "horizontalScale" as const,
      icon: <MoveHorizontal aria-hidden size={18} />,
      label: labels.horizontalScale,
      max: 1000,
      min: 1,
      value: model.horizontalScale,
      step: 1,
      testId: "horizontal-scale",
    },
  ] as const;
  const advancedSpacingEnabled = advancedNumbers.some(
    (entry) => capabilities[entry.control].enabled,
  );

  return (
    <Fragment>
      <OfficeHomeRibbonGroup
        label={labels.tools}
        ribbon="context text-format"
        testId="pdf-text-editing-context-ribbon"
      >
        <OfficeHomeCommandRow testId="pdf-text-context-tools-group">
          <OfficeHomeCommandStack>
            <OfficeHomeCommand
              active={false}
              disabled={!capabilities.hand.enabled}
              displayLabel={labels.hand}
              icon={<OfficeSemanticIcon semanticId="edit.hand" />}
              label={disabledLabel("hand", labels.hand)}
              onClick={() => dispatch("hand", { type: "tool", tool: "hand" })}
              testId="pdf-text-context-hand"
              variant="compact"
            />
            <OfficeHomeCommand
              active
              disabled={!capabilities.select.enabled}
              displayLabel={labels.select}
              icon={<OfficeSemanticIcon semanticId="edit.select" />}
              label={disabledLabel("select", labels.select)}
              onClick={() =>
                dispatch("select", { type: "tool", tool: "select" })
              }
              testId="pdf-text-context-select"
              variant="compact"
            />
          </OfficeHomeCommandStack>
          <OfficeHomeCommand
            active={Boolean(model.formatPainter)}
            armedState={model.formatPainter ?? undefined}
            disabled={!capabilities.formatPainter.enabled}
            displayLabel={labels.formatPainter}
            icon={<OfficeSemanticIcon semanticId="format.painter" />}
            label={disabledLabel("formatPainter", labels.formatPainter)}
            onClick={() =>
              dispatch("formatPainter", {
                type: "tool",
                tool: "formatPainter",
              })
            }
            // Office: a double click keeps the painter until Escape.
            onDoubleClick={() =>
              dispatch("formatPainter", {
                type: "tool",
                tool: "formatPainter",
                sticky: true,
              })
            }
            testId="pdf-text-context-format-painter"
            variant="large"
          />
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>

      <OfficeHomeRibbonGroup
        label={labels.insert}
        ribbon="context text-format"
        testId="pdf-text-context-insert-group"
      >
        <OfficeHomeCommandRow>
          <OfficeHomeCommand
            disabled={!capabilities.insertText.enabled}
            displayLabel={labels.insertText}
            icon={<OfficeSemanticIcon semanticId="textBox.insert" />}
            label={disabledLabel("insertText", labels.insertText)}
            onClick={() => dispatch("insertText", { type: "insertText" })}
            testId="pdf-text-context-insert-text"
            variant="large"
          />
          <OfficeHomeCommand
            disabled={!capabilities.insertSymbol.enabled}
            displayLabel={labels.insertSymbol}
            icon={<OfficeSemanticIcon semanticId="symbol.insert" />}
            label={disabledLabel("insertSymbol", labels.insertSymbol)}
            onClick={() => dispatch("insertSymbol", { type: "insertSymbol" })}
            testId="pdf-text-context-insert-symbol"
            variant="large"
          />
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>

      <OfficeHomeRibbonGroup
        label={labels.font}
        ribbon="context text-format"
        testId="pdf-text-context-font-group"
      >
        <OfficeHomeCommandStack>
          <OfficeHomeCommandRow>
            <span
              title={disabledLabel("fontFamily", labels.fontFamily)}
              onPointerDownCapture={onRememberSelection}
            >
              <RibbonFontFamilyPicker
                activeFontFamily={model.activeFontFamily}
                activeLabel={(model.activeFontFamily && familyLabels[model.activeFontFamily]) ||
                  familyLabels[model.activeFontLabel] || pdfPageFontDisplayFamily(model.activeFontLabel)}
                familyLabels={familyLabels}
                eastAsianFirst={Object.keys(familyLabels).length > 0}
                // Safari cannot read installed fonts: Browse finds the
                // common ones by drawing them (set in the nearest served).
                systemFamilyCandidates={PDF_SYSTEM_FAMILY_CANDIDATES}
                disabled={!capabilities.fontFamily.enabled}
                label={labels.fontFamily}
                // Rich discovery needs both halves; the host owns the strings,
                // so the compact menu stays until it supplies them.
                {...(fontPickerLabels ?? labels.fontPicker
                  ? { labels: fontPickerLabels ?? labels.fontPicker, preferenceScope: "pdf" as const }
                  : {})}
                priorityFamilies={
                  model.activeFontFamily ? [model.activeFontFamily] : []
                }
                onRememberSelection={onRememberSelection}
                onSelect={(value) => {
                  if (value != null) {
                    dispatch("fontFamily", { type: "fontFamily", value });
                  }
                }}
                retainObjectSelection
                mixed={model.fontFamilyMixed === true}
                sections={fontSections}
                testId="pdf-text-context-font-family"
              />
            </span>
            <RibbonValueCombobox
              testId="pdf-text-context-font-size"
              label={disabledLabel("fontSize", labels.fontSize)}
              placeholder="12"
              mixedLabel={labels.mixed}
              inputMode="decimal"
              className="note-editor-ribbon-value-combobox--font-size"
              value={fontSizeText}
              options={FONT_SIZE_OPTIONS}
              formatPreview={(value) => {
                const fontSizePt = parsePdfFontSizeInput(value);
                return fontSizePt === undefined ? null : { fontSizePt };
              }}
              retainObjectSelection
              selectOnFocus
              onDraftChange={(value) => {
                setFontSizeDraftText(value);
                const parsed = parsePdfFontSizeInput(value);
                if (capabilities.fontSize.enabled && parsed !== undefined) {
                  onAction({ type: "fontSize", value: parsed, draft: true });
                }
              }}
              onFocusChange={(focused) => {
                if (!focused) setFontSizeDraftText(null);
              }}
              onRememberSelection={onRememberSelection}
              onCommit={(value) => {
                // Word's box: 1 to 1638 in half points (shared Office rule),
                // or a Chinese size name.
                const parsed = parsePdfFontSizeInput(value);
                if (!capabilities.fontSize.enabled || parsed === undefined) {
                  return false;
                }
                setFontSizeDraftText(null);
                onAction({ type: "fontSize", value: parsed });
                return true;
              }}
              disabled={!capabilities.fontSize.enabled}
              mixed={model.fontSize == null}
            />
            <OfficeHomeCommand
              disabled={!capabilities.fontSizeIncrease.enabled}
              icon={<OfficeSemanticIcon semanticId="text.fontSize.increase" />}
              label={disabledLabel("fontSizeIncrease", labels.fontSizeIncrease)}
              onClick={() =>
                dispatch("fontSizeIncrease", { type: "fontSizeStep", delta: 1 })
              }
              testId="pdf-text-context-font-increase"
              textFormatControl
              variant="icon"
            />
            <OfficeHomeCommand
              disabled={!capabilities.fontSizeDecrease.enabled}
              icon={<OfficeSemanticIcon semanticId="text.fontSize.decrease" />}
              label={disabledLabel("fontSizeDecrease", labels.fontSizeDecrease)}
              onClick={() =>
                dispatch("fontSizeDecrease", {
                  type: "fontSizeStep",
                  delta: -1,
                })
              }
              testId="pdf-text-context-font-decrease"
              textFormatControl
              variant="icon"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger
                  disabled={!capabilities.changeCase.enabled}
                  disabledReason={capabilities.changeCase.enabled ? undefined : capabilities.changeCase.reason}
                  hasMenuIndicator
                  icon={<DocsHomeIcon name="changeCase" size={16} />}
                  label={labels.changeCase}
                  onPointerDown={onRememberSelection}
                  testId="pdf-text-context-change-case"
                  data-office-text-format-control="true"
                  variant="icon"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                data-ribbon-object-selection-retain="true"
                data-testid="pdf-text-context-change-case-menu"
              >
                {PDF_TEXT_CASE_MENU.map((rows, group) => [
                  group > 0 ? <DropdownMenuSeparator key={`separator-${group}`} /> : null,
                  ...rows.map(([mode, icon]) => (
                    <DropdownMenuItem
                      key={mode}
                      data-testid={`pdf-text-context-change-case-${mode}`}
                      onSelect={() => dispatch("changeCase", { type: "changeCase", mode })}
                    >
                      <DocsHomeIcon name={icon} size={16} />
                      {labels.changeCaseModes[mode]}
                    </DropdownMenuItem>
                  )),
                ])}
              </DropdownMenuContent>
            </DropdownMenu>
          </OfficeHomeCommandRow>
          {/* WPS order: 加粗 · 倾斜 · 下划线 · 删除线 · 上标/下标▾ · 文字高亮 ·
              字体颜色▾ · 清除格式; the rotations and Delete this editor adds
              come after them. */}
          <OfficeHomeCommandRow>
            {formatCommands.map((command) => (
              <OfficeHomeCommand
                key={command.control}
                active={pressed(command.active)}
                disabled={!capabilities[command.control].enabled}
                icon={<OfficeSemanticIcon semanticId={command.semanticId} />}
                label={disabledLabel(command.control, command.label)}
                onClick={() =>
                  dispatch(command.control, {
                    type: "toggle",
                    control: command.control,
                  })
                }
                testId={`pdf-text-context-${command.control}`}
                formatPreview={formatTogglePreview(command.control, pressed(command.active))}
                textFormatControl
                variant="icon"
              />
            ))}
            <DropdownMenu modal={false}>
              <OfficeHomeSplitLayout
                testId="pdf-text-context-script-split"
                primary={
                  <OfficeHomeCommand
                    active={pressed(model[scriptControl])}
                    disabled={!capabilities[scriptControl].enabled}
                    icon={<OfficeSemanticIcon semanticId={`text.${scriptControl}`} />}
                    label={disabledLabel(scriptControl, labels[scriptControl])}
                    onClick={() =>
                      dispatch(scriptControl, { type: "toggle", control: scriptControl })
                    }
                    testId={`pdf-text-context-${scriptControl}`}
                    textFormatControl
                    variant="icon"
                  />
                }
                trigger={
                  <DropdownMenuTrigger asChild>
                    <OfficeHomeMenuTrigger
                      className="note-editor-office-toolbar__split-chevron"
                      disabled={!scriptEnabled}
                      disabledReason={
                        scriptEnabled ? undefined : capabilities.superscript.reason
                      }
                      icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                      label={labels.script}
                      onPointerDown={onRememberSelection}
                      testId="pdf-text-context-script-menu"
                      variant="icon"
                    />
                  </DropdownMenuTrigger>
                }
              />
              <DropdownMenuContent
                align="start"
                data-ribbon-object-selection-retain="true"
                data-testid="pdf-text-context-script-menu-content"
              >
                {(["superscript", "subscript"] as const).map((control) => (
                  <DropdownMenuCheckboxItem
                    key={control}
                    checked={model[control] === true}
                    disabled={!capabilities[control].enabled}
                    onSelect={() => dispatch(control, { type: "toggle", control })}
                    data-testid={`pdf-text-context-${control}-item`}
                  >
                    {labels[control]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <OfficeHomeCommand
              active={pressed(model.highlight)}
              disabled={!capabilities.highlight.enabled}
              icon={<OfficeSemanticIcon semanticId="text.highlight" />}
              label={disabledLabel("highlight", labels.highlight)}
              onClick={() =>
                dispatch("highlight", { type: "toggle", control: "highlight" })
              }
              testId="pdf-text-context-highlight"
              textFormatControl
              variant="icon"
            />
            <span style={{ position: "relative" }}>
              <OfficeHomeMenuTrigger
                ref={colorTriggerRef}
                disabled={!capabilities.fontColor.enabled}
                disabledReason={capabilities.fontColor.reason}
                icon={<OfficeSemanticIcon semanticId="text.fontColor" />}
                label={labels.fontColor}
                onClick={() => setColorOpen((open) => !open)}
                testId="pdf-text-context-font-color"
                data-office-text-format-control="true"
                variant="icon"
              />
              {colorOpen && capabilities.fontColor.enabled ? (
                <OfficeColorPalettePopover
                  anchorRef={colorTriggerRef}
                  value={model.color}
                  labels={{
                    themeColors: labels.themeColors,
                    standardColors: labels.standardColors,
                    recentColors: labels.recentColors,
                    moreColors: labels.moreColors,
                  }}
                  onDismiss={() => setColorOpen(false)}
                  onPick={(value) => {
                    if (value)
                      dispatch("fontColor", { type: "fontColor", value });
                    setColorOpen(false);
                  }}
                  testIdPrefix="pdf-text-context-font-color"
                  formatPreview="color"
                />
              ) : null}
            </span>
            <OfficeHomeCommand
              disabled={!capabilities.clearFormatting.enabled}
              icon={<OfficeSemanticIcon semanticId="format.clear" />}
              label={disabledLabel("clearFormatting", labels.clearFormatting)}
              onClick={() =>
                dispatch("clearFormatting", {
                  type: "toggle",
                  control: "clearFormatting",
                })
              }
              testId="pdf-text-context-clear-format"
              variant="icon"
            />
          </OfficeHomeCommandRow>
        </OfficeHomeCommandStack>
      </OfficeHomeRibbonGroup>

      <OfficeHomeRibbonGroup
        className={styles.statusHost}
        label={labels.paragraph}
        ribbon="context text-format"
        testId="pdf-text-context-paragraph-group"
      >
        <OfficeHomeCommandStack>
          <OfficeHomeCommandRow>
            <OfficeHomeCommand
              disabled={!capabilities.indentDecrease.enabled}
              icon={
                <OfficeSemanticIcon semanticId="paragraph.indent.decrease" />
              }
              label={disabledLabel("indentDecrease", labels.indentDecrease)}
              onClick={() =>
                dispatch("indentDecrease", {
                  type: "indent",
                  direction: "decrease",
                })
              }
              testId="pdf-text-context-indent-decrease"
              variant="icon"
            />
            <OfficeHomeCommand
              disabled={!capabilities.indentIncrease.enabled}
              icon={
                <OfficeSemanticIcon semanticId="paragraph.indent.increase" />
              }
              label={disabledLabel("indentIncrease", labels.indentIncrease)}
              onClick={() =>
                dispatch("indentIncrease", {
                  type: "indent",
                  direction: "increase",
                })
              }
              testId="pdf-text-context-indent-increase"
              variant="icon"
            />
            {alignmentCommands.map((command) => (
              <OfficeHomeCommand
                key={command.control}
                active={model.alignment === command.value}
                disabled={!capabilities[command.control].enabled}
                icon={<OfficeSemanticIcon semanticId={command.semanticId} />}
                label={disabledLabel(command.control, command.label)}
                onClick={() =>
                  dispatch(command.control, {
                    type: "alignment",
                    value: command.value,
                  })
                }
                testId={`pdf-text-context-align-${command.value}`}
                variant="icon"
              />
            ))}
            {/* Word's Align Text (Shape Format > Text), ONLYOFFICE's text box
                vertical alignment: a text box's rows at the top, middle or
                foot of its frame. Page text has no frame to align in: the
                host offers it (verticalAlign) only for a box. */}
            {model.verticalAlign !== undefined && model.verticalAlign !== null ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    disabled={!capabilities.verticalAlign.enabled}
                    disabledReason={capabilities.verticalAlign.enabled ? undefined : capabilities.verticalAlign.reason}
                    hasMenuIndicator
                    icon={<IconAlignTextMenu size={14} />}
                    label={labels.alignText}
                    testId="pdf-text-context-vertical-align"
                    variant="icon"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PDF_TEXT_VERTICAL_ALIGN_MENU.map(([value, Icon]) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={(model.verticalAlign ?? "top") === value}
                      onSelect={() => dispatch("verticalAlign", { type: "verticalAlign", value })}
                      data-testid={`pdf-text-context-vertical-align-${value}`}
                    >
                      <Icon size={14} />
                      {labels.verticalAlignModes[value]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {/* Word's Text Direction (PowerPoint's 文字方向, ONLYOFFICE's text
                box direction): horizontal, 竖排, or all text turned 90 or
                270 degrees. A box only, as Align Text. */}
            {model.textDirection !== undefined && model.textDirection !== null ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    disabled={!capabilities.textDirection.enabled}
                    disabledReason={capabilities.textDirection.enabled ? undefined : capabilities.textDirection.reason}
                    hasMenuIndicator
                    icon={<IconTextVertical size={14} />}
                    label={labels.textDirection}
                    testId="pdf-text-context-text-direction"
                    variant="icon"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PDF_TEXT_DIRECTION_MENU.map((value) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={model.textDirection === value}
                      onSelect={() => dispatch("textDirection", { type: "textDirection", value })}
                      data-testid={`pdf-text-context-text-direction-${value}`}
                    >
                      {labels.textDirectionModes[value]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {/* Word's and PowerPoint's Columns (the presentation editor's 分栏
                menu: one, two or three, and More Columns... for the count
                up to 16 and the spacing). A box only. */}
            {model.columns !== undefined && model.columns !== null ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    disabled={!capabilities.columns.enabled}
                    disabledReason={capabilities.columns.enabled ? undefined : capabilities.columns.reason}
                    hasMenuIndicator
                    icon={<IconTextColumns size={14} />}
                    label={labels.columns}
                    testId="pdf-text-context-columns"
                    variant="icon"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {([1, 2, 3] as const).map((count) => (
                    <DropdownMenuCheckboxItem
                      key={count}
                      checked={model.columns?.count === count}
                      onSelect={() => dispatch("columns", { type: "columns", count })}
                      data-testid={`pdf-text-context-columns-${count}`}
                    >
                      {labels.columnCounts[count]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => dispatch("columns", { type: "columnsDialog" })}
                    data-testid="pdf-text-context-columns-more"
                  >
                    {labels.columnsMore}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {/* Convert to Equation / to Text (Word: select the words, Insert >
                Equation): a box only -- its words set as a formula, or a
                formula's words set as text again. */}
            {model.kind !== undefined ? (
              <OfficeHomeCommand
                active={model.kind === "formula"}
                disabled={!capabilities.convertKind.enabled}
                disabledReason={capabilities.convertKind.enabled ? undefined : capabilities.convertKind.reason}
                displayLabel={model.kind === "formula" ? labels.convertToText : labels.convertToFormula}
                icon={<PdfInsertRibbonIcon name="equation" size={18} />}
                label={model.kind === "formula" ? labels.convertToText : labels.convertToFormula}
                onClick={() => dispatch("convertKind", {
                  type: "kind", value: model.kind === "formula" ? "text" : "formula",
                })}
                testId="pdf-text-context-convert-kind"
                variant="icon"
              />
            ) : null}
            {/* WordArt Styles (艺术字样式: Word's and PowerPoint's Shape Format
                > WordArt Styles, ONLYOFFICE's Text Art): the Office gallery's
                twenty paints, five to a row, and Clear WordArt. A box only. */}
            {model.textPaint !== undefined ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <OfficeHomeMenuTrigger
                    active={model.textPaint !== null}
                    disabled={!capabilities.wordArt.enabled}
                    disabledReason={capabilities.wordArt.enabled ? undefined : capabilities.wordArt.reason}
                    hasMenuIndicator
                    icon={<OfficeWordArtPreview paint={model.textPaint ?? OFFICE_WORDART_GALLERY_RECIPES[0]!.paint} sample="A" />}
                    label={labels.wordArt}
                    testId="pdf-text-context-wordart"
                    variant="icon"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" data-testid="pdf-text-context-wordart-menu">
                  <div
                    role="group"
                    aria-label={labels.wordArt}
                    style={{ display: "grid", gridTemplateColumns: "repeat(5, 44px)", gap: 4, padding: 6 }}
                  >
                    {OFFICE_WORDART_GALLERY_RECIPES.map((recipe) => {
                      const name = labels.wordArtStyles[recipe.id] ?? labels.wordArt;
                      const current = model.textPaint
                        ? sameOfficeTextPaint(pdfTextBoxTextPaint(recipe.paint), model.textPaint) : false;
                      return (
                        <DropdownMenuItem
                          key={recipe.id}
                          aria-label={name}
                          title={name}
                          data-checked={current ? "true" : undefined}
                          data-testid={`pdf-text-context-wordart-${recipe.id}`}
                          onSelect={() => dispatch("wordArt", { type: "textPaint", paint: pdfTextBoxTextPaint(recipe.paint) })}
                          style={{ justifyContent: "center", height: 40, padding: 0 }}
                        >
                          <OfficeWordArtPreview paint={recipe.paint} sample="A" />
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={model.textPaint === null}
                    data-testid="pdf-text-context-wordart-clear"
                    onSelect={() => dispatch("wordArt", { type: "textPaint", paint: null })}
                  >
                    {labels.clearWordArt}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {/* 项目符号 / 编号 (Word, ONLYOFFICE, the presentation editor's
                galleries): the markers written at each paragraph's start
                (lib/pdf/text-list.ts). The face toggles the default; its
                chevron opens the library. */}
            {model.list !== undefined ? (
              (["bullets", "numbering"] as const).map((control) => {
                const bullets = control === "bullets";
                const active = bullets ? model.list?.kind === "bullet" : model.list?.kind === "number";
                const items = bullets ? POWERPOINT_BULLET_LIBRARY : powerPointNumberLibrary(locale);
                const styleOf = (id: string): PdfTextListStyle => bullets
                  ? { kind: "bullet", id, glyph: POWERPOINT_BULLET_LIBRARY.find((item) => item.id === id)?.preview ?? "•" }
                  : { kind: "number", id };
                const fallbackId = bullets ? "filled-round" : "decimal";
                return (
                  <OfficeHomeSplitLayout
                    key={control}
                    testId={`pdf-text-context-${control}-split`}
                    primary={
                      <OfficeHomeCommand
                        active={active}
                        disabled={!capabilities[control].enabled}
                        icon={bullets ? <IconBulletStyle size={16} /> : <IconNumberStyle size={16} />}
                        label={disabledLabel(control, bullets ? labels.bullets : labels.numbering)}
                        onClick={() => dispatch(control, { type: "list", style: active ? null : styleOf(fallbackId) })}
                        testId={`pdf-text-context-${control}`}
                        variant="icon"
                      />
                    }
                    trigger={
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <OfficeHomeMenuTrigger
                            variant="icon"
                            disabled={!capabilities[control].enabled}
                            icon={<OfficeSemanticIcon semanticId="menu.chevron.down" size={12} />}
                            label={bullets ? labels.bulletStyleMenu : labels.numberingStyleMenu}
                            testId={`pdf-text-context-${control}-style`}
                          />
                        </DropdownMenuTrigger>
                        <OfficeListGalleryMenuContent
                          variant={bullets ? "bullets" : "numbering"}
                          heading={bullets ? labels.bulletLibrary : labels.numberingLibrary}
                        >
                          <OfficeListGalleryTile
                            active={!active}
                            columns={bullets ? 6 : 3}
                            label={labels.listNone}
                            onSelect={() => dispatch(control, { type: "list", style: null })}
                            preview={<span aria-hidden>∅</span>}
                            testId={`pdf-text-context-${control}-none`}
                          />
                          {items.map((item) => (
                            <OfficeListGalleryTile
                              key={item.id}
                              active={bullets && model.list?.kind === "bullet" && model.list.glyph === item.preview}
                              columns={bullets ? 6 : 3}
                              label={labels.listItems[item.id] ?? item.id}
                              onSelect={() => dispatch(control, { type: "list", style: styleOf(item.id) })}
                              preview={bullets
                                ? <span aria-hidden style={{ fontSize: 23 }}>{item.preview}</span>
                                : <OfficeListGalleryPreview markers={item.preview.split(" ")} />}
                              testId={`pdf-text-context-${control}-${item.id}`}
                            />
                          ))}
                        </OfficeListGalleryMenuContent>
                      </DropdownMenu>
                    }
                  />
                );
              })
            ) : null}
            {/* WPS: the 键盘输入触发编辑 box ends the alignment row; the spacing
                fields fill the row under it. */}
            <span title={disabledLabel("keyboardInput", labels.keyboardInput)}>
              <OfficeHomeCheckbox
                checked={model.keyboardInput}
                disabled={!capabilities.keyboardInput.enabled}
                label={labels.keyboardInput}
                onCheckedChange={(value) =>
                  dispatch("keyboardInput", { type: "keyboardInput", value })
                }
                testId="pdf-text-context-keyboard-input"
              />
            </span>
          </OfficeHomeCommandRow>
          <OfficeHomeCommandRow>
            {visibleNumbers.map((entry) => (
              <OfficeRibbonNumberField
                key={entry.control}
                disabled={!capabilities[entry.control].enabled}
                disabledReason={capabilities[entry.control].reason}
                icon={entry.icon}
                label={disabledLabel(entry.control, entry.label)}
                max={entry.max}
                min={entry.min}
                mixed={entry.value == null}
                mixedLabel={labels.mixed}
                // Written when the value is committed (Enter, leaving the field, a
                // step), as WPS writes it: written on every keystroke, "1.5" wrote 1
                
                onCommit={(raw) => {
                  const parsed = Number(raw);
                  if (Number.isFinite(parsed)) {
                    dispatch(entry.control, {
                      type: "number",
                      control: entry.control,
                      value: parsed,
                    });
                  }
                }}
                onRememberSelection={onRememberSelection}
                step={entry.step}
                testId={`pdf-text-context-${entry.testId}`}
                value={entry.value == null ? "" : String(entry.value)}
              />
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <OfficeHomeMenuTrigger
                  disabled={!advancedSpacingEnabled}
                  disabledReason={
                    advancedSpacingEnabled ? undefined : labels.unavailable
                  }
                  hasMenuIndicator
                  icon={
                    <OfficeSemanticIcon semanticId="paragraph.spacing.line" />
                  }
                  label={labels.moreSpacing}
                  onPointerDown={onRememberSelection}
                  testId="pdf-text-context-more-spacing"
                  variant="icon"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                data-ribbon-object-selection-retain="true"
              >
                <DropdownMenuLabel>{labels.moreSpacing}</DropdownMenuLabel>
                <div className="grid gap-2 p-2">
                  {advancedNumbers.map((entry) => (
                    <OfficeRibbonNumberField
                      key={entry.control}
                      disabled={!capabilities[entry.control].enabled}
                      disabledReason={capabilities[entry.control].reason}
                      icon={entry.icon}
                      label={disabledLabel(entry.control, entry.label)}
                      max={entry.max}
                      min={entry.min}
                      mixed={entry.value == null}
                      mixedLabel={labels.mixed}
                      // Written when the value is committed (Enter, leaving the field, a
                      // step), as WPS writes it: written on every keystroke, "1.5" wrote 1
                      
                      onCommit={(raw) => {
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          dispatch(entry.control, {
                            type: "number",
                            control: entry.control,
                            value: parsed,
                          });
                        }
                      }}
                      onRememberSelection={onRememberSelection}
                      step={entry.step}
                      testId={`pdf-text-context-${entry.testId}`}
                      unit={
                        entry.control === "horizontalScale" ? "%" : undefined
                      }
                      value={entry.value == null ? "" : String(entry.value)}
                    />
                  ))}
                </div>
                {/* Word's Tabs…, as its Paragraph dialog opens it. */}
                <DropdownMenuItem
                  disabled={!capabilities.tabStops.enabled}
                  onSelect={() => dispatch("tabStops", { type: "tabsDialog" })}
                  data-testid="pdf-text-context-tab-stops"
                >
                  {disabledLabel("tabStops", labels.tabStops)}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* ONLYOFFICE's right panel: every setting of the box at once. */}
            {model.settingsPane !== undefined ? (
              <OfficeHomeCommand
                variant="icon"
                active={model.settingsPane}
                icon={<OfficeSemanticIcon semanticId="layout.panel.right" />}
                label={labels.settingsPane}
                onClick={() => onAction({ type: "settingsPane" })}
                testId="pdf-text-context-settings-pane"
              />
            ) : null}
          </OfficeHomeCommandRow>
        </OfficeHomeCommandStack>
        {status ? <div className={styles.status}>{status}</div> : null}
      </OfficeHomeRibbonGroup>

      {/* WPS 文本编辑: rotate and delete act on the whole text object, so they
          sit in their own group after the character/paragraph groups, not
          among the font controls. */}
      <OfficeHomeRibbonGroup
        label={labels.object}
        ribbon="context text-format"
        testId="pdf-text-context-object-group"
      >
        <OfficeHomeCommandRow>
          {(
            [
              ["rotateLeft", labels.rotateLeft],
              ["rotateRight", labels.rotateRight],
            ] as const
          ).map(([control, label]) => (
            <OfficeHomeCommand
              key={control}
              disabled={!capabilities[control].enabled}
              disabledReason={capabilities[control].reason}
              icon={
                // 20px, the icon command's glyph; the mirrored one sits in
                // a span, out of reach of the module's direct-child rule.
                control === "rotateLeft" ? (
                  <span
                    aria-hidden
                    style={{ display: "inline-flex", transform: "scaleX(-1)" }}
                  >
                    <OfficeSemanticIcon semanticId="object.rotate" size={20} />
                  </span>
                ) : (
                  <OfficeSemanticIcon semanticId="object.rotate" size={20} />
                )
              }
              label={disabledLabel(control, label)}
              onClick={() =>
                dispatch(control, {
                  type: "rotate",
                  direction: control === "rotateLeft" ? "left" : "right",
                })
              }
              testId={`pdf-text-context-${control}`}
              variant="icon"
            />
          ))}
          <OfficeHomeCommand
            disabled={!capabilities.delete.enabled}
            disabledReason={capabilities.delete.reason}
            icon={<OfficeSemanticIcon semanticId="edit.delete" size={20} />}
            label={disabledLabel("delete", labels.delete)}
            onClick={() => dispatch("delete", { type: "delete" })}
            testId="pdf-text-context-delete"
            variant="icon"
          />
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>

      {/* WPS: every contextual tab ends with 退出编辑. */}
      <OfficeHomeRibbonGroup
        label={labels.actions}
        ribbon="context text-format"
        testId="pdf-text-context-exit-group"
      >
        <OfficeHomeCommandRow>
          <OfficeHomeCommand
            disabled={!capabilities.exit.enabled}
            displayLabel={labels.exit}
            icon={<OfficeSemanticIcon semanticId="edit.exit" size={24} />}
            label={disabledLabel("exit", labels.exit)}
            onClick={() => dispatch("exit", { type: "exit" })}
            testId="pdf-text-context-exit"
            variant="large"
          />
        </OfficeHomeCommandRow>
      </OfficeHomeRibbonGroup>
    </Fragment>
  );
}

/** Value equality of plain data: primitives, arrays and plain objects. A
 * function, a React element or any other instance is equal only to itself. */
export function samePlainValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => samePlainValue(value, right[index]));
  }
  const prototype = Object.getPrototypeOf(left);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getPrototypeOf(right) !== prototype ||
    "$$typeof" in left || "$$typeof" in right) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && samePlainValue(a[key], b[key]));
}

/** The Text Editing tab as an editor that renders on every key holds it:
 * the same model, capabilities and labels by value (the editor builds them
 * afresh each render) render nothing again. The callbacks and the status
 * line must be stable for this to hold; they are compared by identity. */
export const PdfTextEditingContextRibbonMemo = memo(PdfTextEditingContextRibbon, (before, after) =>
  before.onAction === after.onAction &&
  before.onRememberSelection === after.onRememberSelection &&
  before.status === after.status &&
  samePlainValue(before.model, after.model) &&
  samePlainValue(before.capabilities, after.capabilities) &&
  samePlainValue(before.labels, after.labels) &&
  samePlainValue(before.fontPickerLabels, after.fontPickerLabels));
