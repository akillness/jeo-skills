"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Format Cells dialog (设置单元格格式) — Excel/WPS parity.
 *
 * A modal dialog with a category list on the left and per-category controls on
 * the right, plus a live preview bar. On OK, the caller receives the resulting
 * Excel format code and applies it to the selection via the existing
 * setCellStyleForSelection path.
 *
 * FORMAT CODE GENERATION: entirely delegated to lib/spreadsheet/format-code-builder.ts.
 * LIVE PREVIEW: calls applyNumberFormat from lib/spreadsheet/number-format.ts.
 * No formatting logic is implemented in this component.
 */

import { ptToPx, pxToPt } from "@mrnote/core/web/lib/office-units.ts";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useId,
} from "react";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  officeDialogClassName,
  officeDialogParts as dialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  type FormatCategory,
  type FormatDialogState,
  type NegativeStyle,
  type FractionType,
  type DatePreset,
  type TimePreset,
  FORMAT_CATEGORIES,
  FRACTION_TYPE_CODES,
  DATE_TYPE_SAMPLE_SERIAL,
  buildFormatCode,
  currencySymbolOptions,
  customTypeList,
  dateTypeList,
  inferDialogState,
  negativeStylesFor,
  numberFormatRegion,
  specialTypeList,
  timeTypeList,
  type NumberFormatTypeEntry,
  type SpecialTypeId,
} from "@mrnote/core/web/lib/spreadsheet/format-code-builder.ts";
import {
  DATE_FORMAT_LOCALES,
  calendarOptionsFor,
  dateCodeLocale,
  dateTypesFor,
  regionLocaleId,
  timeTypesFor,
  type DateCalendarId,
} from "../../../lib/spreadsheet/date-format-locales";
import { applyCellNumberFormat, applyNumberFormat, applyTextFormat, formatGeneralNumberWith } from "@mrnote/core/web/lib/spreadsheet/number-format.ts";
import { viewerNumberSeparators } from "@mrnote/core/web/lib/spreadsheet/locale-number-separators.ts";
import { regionalSystemDateDisplayCode } from "@mrnote/core/web/lib/spreadsheet/number-format-gallery.ts";
import FillEffectsDialog from "./spreadsheet/FillEffectsDialog";
import { cellUnderlineIsDouble, cellUnderlineKind } from "@mrnote/core/web/lib/spreadsheet/cell-text-effects.ts";
import {
  AUTOMATIC_BORDER_COLOR,
  BORDER_LINE_STYLES,
  borderLineStrokeSpec,
  cellHorizontalChoicePatch,
  cellIndentPatch,
  type BorderLineStyle,
  type CellBorderEdges,
  type CellHorizontalChoice,
} from "@mrnote/core/web/lib/spreadsheet/cell-format.ts";
import {
  ColorPalettePanel,
  ColorPalettePopover,
} from "../../../lib/spreadsheet/ColorPalettePopover";
import { normalizeHexColor } from "@mrnote/core/web/lib/spreadsheet/color-palette.ts";
import {
  AUTOMATIC_PATTERN_BACKGROUND,
  AUTOMATIC_PATTERN_COLOR,
  spreadsheetFillPatternCss,
  spreadsheetGradientFillCss,
  type SpreadsheetFillPattern,
  type SpreadsheetFillPatternType,
  type SpreadsheetGradientFill,
} from "@mrnote/core/web/lib/spreadsheet/fill-pattern.ts";
import { resolveThemeStyle, themeColorsAfterPatch, type SpreadsheetThemeColors, type SpreadsheetThemeColor } from "@mrnote/core/web/lib/spreadsheet/theme-colors.ts";
import {
  OFFICE_FONT_FAMILY_LABELS,
  OFFICE_FONT_FAMILY_VALUES,
  OFFICE_FONT_SIZE_POINTS,
} from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import { ribbonFontFamilyLabel } from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import {
  OFFICE_SYSTEM_FONT_FAMILY_VALUE,
  officePrimaryFontFamily,
} from "@mrnote/core/web/components/office-ribbon/officeTypographyCatalog.ts";
import {
  formatOfficeFontSize,
  parseOfficeFontSizeInput,
} from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { OfficeBorderPresetIcon } from "@mrnote/core/web/components/office-ribbon/OfficeBorderPresetIcon.tsx";
import { officeFontFamilies } from "@mrnote/core/web/lib/office-fonts/substitutes.ts";
import {
  FONT_DIALOG_STYLE_VALUES,
  fontDialogStyleFromMarks,
  fontDialogStyleMarks,
  type FontDialogStyle,
} from "@mrnote/core/web/components/console/editor/native-document/DocumentFontDialogFontPage.tsx";
import { SPREADSHEET_DEFAULT_FONT_PT } from "@mrnote/core/web/lib/spreadsheet/cell-buttons.ts";
import {
  FORMAT_CELLS_BORDER_LINES,
  formatCellsBorderSummaryOfEdges,
  type FormatCellsBorderLine,
  type FormatCellsBorderLineState,
  type FormatCellsBorderLineValue,
  type FormatCellsBorderLinesPatch,
  type FormatCellsBorderSummary,
} from "@mrnote/core/web/lib/spreadsheet/format-cells-border.ts";
import { type ExcelDateSystemArg } from "@mrnote/core/web/lib/spreadsheet/excel-1900-calendar.ts";

// ── Props ─────────────────────────────────────────────────────────────────────

/**
 * The alignment half of the dialog, mirroring Excel / WPS's 对齐 tab. Every
 * field here already exists on a cell's style; the dialog is where they stop
 * being six scattered ribbon buttons and become one place to set them.
 */
export interface FormatCellsAlignment {
  textAlign?: "left" | "center" | "right";
  /** Excel's "Center Across Selection" horizontal alignment; exclusive with
   * textAlign, as the two are one list in the dialog. */
  centerAcross?: boolean;
  /** Fill, Justify and Distributed (Indent): the rest of Excel's Horizontal
   * list, kept beside textAlign (XLS-A058). */
  horizontalFill?: boolean;
  horizontalJustify?: "justify" | "distributed";
  verticalAlign?: "top" | "middle" | "bottom";
  /** Vertical Justify / Distributed, beside verticalAlign. */
  verticalJustify?: "justify" | "distributed";
  /** "Justify distributed" (Distributed only). */
  justifyLastLine?: boolean;
  /** Right-to-left > Text direction: Context (absent), LTR or RTL. */
  readingOrder?: "ltr" | "rtl";
  wrapText?: boolean;
  shrinkToFit?: boolean;
  indent?: number;
  textRotation?: number;
  /** Excel's Orientation ▸ vertical "Text": stacked letters, exclusive with
   * an angle (XLSX textRotation 255). */
  verticalText?: boolean;
  /** Excel's Text control "Merge cells": not a cell style but a sheet-level
   * merge of the selection, carried here so one OK commits it with the rest. */
  mergeCells?: boolean;
}

/** The Horizontal list as the dialog shows it; the model splits it in two. */
type FormatCellsHorizontal = CellHorizontalChoice;

/** One pick of the list, shared with the AI's Alignment command. */
function horizontalPatch(next: FormatCellsHorizontal): FormatCellsAlignment {
  return cellHorizontalChoicePatch(next);
}

function horizontalChoice(alignment: FormatCellsAlignment): FormatCellsHorizontal {
  if (alignment.centerAcross) return "centerAcross";
  if (alignment.horizontalFill) return "fill";
  if (alignment.horizontalJustify) return alignment.horizontalJustify;
  return alignment.textAlign ?? "";
}

/** The font half, mirroring Excel / WPS's 字体 tab. */
export interface FormatCellsFont {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  // Double, or Excel's Single / Double Accounting (cell formats only; see
  // lib/spreadsheet/cell-text-effects). Absent with `underline` = Single.
  underlineStyle?: "double" | "singleAccounting" | "doubleAccounting";
  strikethrough?: boolean;
  /** Effects ▸ Superscript / Subscript, exclusive with each other. A cell
   * carries them whole-cell (font/vertAlign, XLS-A059); a conditional
   * format's font cannot. */
  superscript?: boolean;
  subscript?: boolean;
  color?: string;
  themeColors?: SpreadsheetThemeColors;
  /** The cell's binding to the theme's heading / body font. A font chosen by
   * name, and Normal font, clear it. */
  themeFontRole?: "heading" | "body";
}

/** The border, fill and protection halves. */
export interface FormatCellsBox {
  borderEdges?: CellBorderEdges;
  backgroundColor?: string;
  /** Excel's Fill page is one fill: a solid colour, or a two-colour pattern
   * whose background IS the cell shading. A fill pick therefore always states
   * both keys (and clears any gradient), never one without the other. */
  fillPattern?: SpreadsheetFillPattern;
  gradientFill?: SpreadsheetGradientFill;
  locked?: boolean;
  /** Format Cells > Protection > Hidden. */
  formulaHidden?: boolean;
}

export type FormatCellsStyle = FormatCellsAlignment &
  FormatCellsFont &
  FormatCellsBox;

export type FormatCellsMixedFontField =
  | "fontFamily"
  | "fontSize"
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "superscript"
  | "subscript";

export type {
  FormatCellsBorderLine,
  FormatCellsBorderLinePatch,
  FormatCellsBorderLinesPatch,
  FormatCellsBorderSummary,
} from "@mrnote/core/web/lib/spreadsheet/format-cells-border.ts";

export interface FormatCellsResult {
  /** Present only after a number-format control actually changed. */
  formatCode?: string;
  /** Exact touched fields across every style tab, applied in one edit. */
  style: FormatCellsStyle;
  /** Border tab: the lines of the selection the author drew or removed, the
   * selection read as one block (XLS-A060). Untouched lines are absent, so a
   * mixed line is never overwritten by the active cell's. */
  borderLinesPatch?: FormatCellsBorderLinesPatch;
}

const FORMAT_CELLS_PANES = [
  "number",
  "alignment",
  "font",
  "border",
  "fill",
  "protection",
] as const;
export type FormatCellsPane = (typeof FORMAT_CELLS_PANES)[number];

/** The tabs Excel keeps in Format Cells for a conditional-format rule. */
const CONDITIONAL_FORMAT_PANES: readonly FormatCellsPane[] = [
  "number",
  "font",
  "border",
  "fill",
];

/** A conditional format's border list: Excel offers only the thin lines. */
const CONDITIONAL_BORDER_LINE_STYLES: readonly BorderLineStyle[] = [
  "hair",
  "dotted",
  "dashDotDot",
  "dashDot",
  "dashed",
  "thin",
];

interface FormatCellsDialogProps {
  paletteId?: string;
  themeBindingEnabled?: boolean;
  /** The active cell's raw numeric value (for live preview). Non-finite or
   *  non-numeric uses a fallback preview number. */
  previewValue: number | string | null | undefined;
  /** The workbook reads serials in the 1904 date system: a date sample
   *  previews the day the cell shows. */
  date1904?: ExcelDateSystemArg;
  /** The currently-applied format code (pre-populates the dialog). */
  currentFormat: string | undefined;
  /** The active cell's current style, pre-populating every tab. */
  currentAlignment?: FormatCellsStyle;
  /** Font fields whose selected cells disagree. Untouched mixed fields stay
   *  absent from the result patch instead of inheriting the active cell. */
  mixedFontFields?: readonly FormatCellsMixedFontField[];
  /** The selection's border lines (lib/spreadsheet/format-cells-border).
   *  Without it the dialog reads `currentAlignment.borderEdges` as one cell. */
  borderLines?: FormatCellsBorderSummary;
  /** False when the range carries malformed border custody. */
  borderAuthorityAvailable?: boolean;
  /** More than one cell is selected; Excel dims the Inside preset otherwise. */
  selectionIsRange?: boolean;
  /** The selection's rows and columns: Inside Horizontal needs two rows,
   *  Inside Vertical two columns (XLS-A060). */
  selectionSize?: { rows: number; columns: number };
  /** The workbook's Normal font, which a cell stating no font wears: the
   *  Font list's first entry and what Normal font returns to (XLS-A059).
   *  `themeBody` when it is the theme's body font. */
  normalFont?: { family: string; themeBody?: boolean };
  /** The sheet is protected: Locked and Hidden can't change (Excel greys
   *  them; Format cells may still restyle the cells). */
  protectionLocked?: boolean;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  /** PivotTable Value Field Settings reuses only Excel's Number tab. */
  numberOnly?: boolean;
  /**
   * The Format… button of a conditional-format rule. Excel shows only the
   * Number, Font, Border and Fill tabs there; font name and size are
   * unavailable, borders are thin lines on the four sides, a fill is a colour
   * (the rule model carries no pattern), and a Clear button empties the
   * rule's format.
   */
  conditionalFormat?: boolean;
  /**
   * Excel's Font dialog for header/footer text (Page Setup ▸ Custom Header ▸
   * Format Text): the Font tab alone, with Effects ▸ Superscript and
   * Subscript, and a font sample for Preview. The dialog's result is part of
   * the host's own draft, so it carries no Home command identity.
   */
  fontOnly?: boolean;
  /**
   * The tab the dialog opens on. Excel opens Format Cells on the page of the
   * command that asked for it: More Borders on Border, the Font group's
   * launcher on Font, the Alignment group's on Alignment. Defaults to Number.
   */
  initialPane?: FormatCellsPane;
  /** Optional surface-specific title while preserving the shared dialog. */
  title?: string;
  /** Canonical control identity for a non-Home launcher. */
  dialogControlId?: string;
  /** Buttons at the start of the footer (Find Format's Choose Format From
   *  Cell… and Clear, XLS-A103). */
  footerStartActions?: ReactNode;
  /** XLS-A056: the workbook's own number formats, listed under Custom after
   *  the built-in codes; Delete is offered for these only. */
  workbookCustomFormats?: readonly string[];
  /** Delete a workbook format: every cell wearing it goes back to General. */
  onDeleteCustomFormat?: (code: string) => void;
  onConfirm: (result: FormatCellsResult) => void;
  onCancel: () => void;
}

/** Excel's calendar type names (XLS-A055). */
const CALENDAR_LABEL_KEY: Record<DateCalendarId, string> = {
  1: "spreadsheet.fmtCalendarGregorian",
  3: "spreadsheet.fmtCalendarJapanese",
  4: "spreadsheet.fmtCalendarTaiwan",
  5: "spreadsheet.fmtCalendarKorean",
  6: "spreadsheet.fmtCalendarHijri",
  7: "spreadsheet.fmtCalendarThai",
  8: "spreadsheet.fmtCalendarHebrew",
  0x17: "spreadsheet.fmtCalendarUmmAlQura",
};

const MAX_INDENT = 15;
const MIN_ROTATION = -90;
const MAX_ROTATION = 90;

/** `.app-modal-overlay` sits at 11001 (styles/globals.css); a colour popup
 * opened from inside this dialog is portalled to the viewport and must paint
 * above that overlay rather than under it. */
const FORMAT_CELLS_POPOVER_Z_INDEX = 11002;

/** Excel's Fill page: a pattern with no Pattern Color draws black, and one
 * with no Background Color draws on white (Microsoft Learn, "Control settings
 * in the Format Cells dialog box", Patterns tab). */

/** Excel's Pattern Style grid order (Solid first, which is the no-pattern
 * case here), each named as the dialog's tooltip names it. */
const FILL_PATTERN_STYLE_ORDER: readonly SpreadsheetFillPatternType[] = [
  "darkGray",
  "mediumGray",
  "lightGray",
  "gray125",
  "gray0625",
  "darkHorizontal",
  "darkVertical",
  "darkDown",
  "darkUp",
  "darkGrid",
  "darkTrellis",
  "lightHorizontal",
  "lightVertical",
  "lightDown",
  "lightUp",
  "lightGrid",
  "lightTrellis",
] as const;

/** One draft of the Fill page, read back from the style it will write. */
interface FillDraft {
  background?: string;
  backgroundTheme?: SpreadsheetThemeColor;
  patternType: SpreadsheetFillPatternType | "";
  patternColor?: string;
  patternTheme?: SpreadsheetThemeColor;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET_CATEGORY"; category: FormatCategory; customCode?: string }
  | { type: "SET_DECIMALS"; decimals: number }
  | { type: "SET_THOUSANDS"; thousands: boolean }
  | { type: "SET_SYMBOL"; symbol: string }
  | { type: "SET_NEG_STYLE"; negativeStyle: NegativeStyle }
  | { type: "SET_DATE_PRESET"; datePreset: DatePreset }
  | { type: "SET_TIME_PRESET"; timePreset: TimePreset }
  | { type: "SET_FRACTION_TYPE"; fractionType: FractionType }
  | { type: "SET_CUSTOM_CODE"; customCode: string };

function reducer(state: FormatDialogState, action: Action): FormatDialogState {
  switch (action.type) {
    case "SET_CATEGORY":
      return {
        ...state,
        category: action.category,
        ...(action.customCode !== undefined ? { customCode: action.customCode } : {}),
        // A negative style another category or region offers falls back to
        // the first of this one's list.
        ...(negativeStylesFor(action.category, state.region ?? "en").includes(state.negativeStyle)
          ? {}
          : { negativeStyle: "minus" as const }),
      };
    case "SET_DECIMALS":
      return { ...state, decimals: Math.max(0, Math.min(30, action.decimals)) };
    case "SET_THOUSANDS":
      return { ...state, thousands: action.thousands };
    case "SET_SYMBOL":
      return { ...state, symbol: action.symbol };
    case "SET_NEG_STYLE":
      return { ...state, negativeStyle: action.negativeStyle };
    case "SET_DATE_PRESET":
      return { ...state, datePreset: action.datePreset };
    case "SET_TIME_PRESET":
      return { ...state, timePreset: action.timePreset };
    case "SET_FRACTION_TYPE":
      return { ...state, fractionType: action.fractionType };
    case "SET_CUSTOM_CODE":
      return { ...state, customCode: action.customCode };
    default:
      return state;
  }
}

// ── Category i18n keys ────────────────────────────────────────────────────────

const CATEGORY_KEY: Record<FormatCategory, string> = {
  General: "spreadsheet.fmtCatGeneral",
  Number: "spreadsheet.fmtCatNumber",
  Currency: "spreadsheet.fmtCatCurrency",
  Accounting: "spreadsheet.fmtCatAccounting",
  Date: "spreadsheet.fmtCatDate",
  Time: "spreadsheet.fmtCatTime",
  Percentage: "spreadsheet.fmtCatPercentage",
  Fraction: "spreadsheet.fmtCatFraction",
  Scientific: "spreadsheet.fmtCatScientific",
  Text: "spreadsheet.fmtCatText",
  Special: "spreadsheet.fmtCatSpecial",
  Custom: "spreadsheet.fmtCatCustom",
} as const;

// ── Date preset display labels ────────────────────────────────────────────────








function typeListEntries(
  list: readonly NumberFormatTypeEntry[],
  current: string,
  locale: string,
): { code: string; example: string }[] {
  const entries = list.some((entry) => entry.code === current)
    ? list
    : [...list, { code: current }];
  return entries.map(({ code, system }) => ({
    code,
    example: `${system ? "*" : ""}${applyNumberFormat(
      DATE_TYPE_SAMPLE_SERIAL,
      regionalSystemDateDisplayCode(code, locale),
    )}`,
  }));
}

/** Excel's Fraction Type labels with their samples (XLS-A057). */
const FRACTION_TYPE_LABEL_KEY: Record<FractionType, string> = {
  "up-to-one-digit": "spreadsheet.fmtFractionUpToOne",
  "up-to-two-digits": "spreadsheet.fmtFractionUpToTwo",
  "up-to-three-digits": "spreadsheet.fmtFractionUpToThree",
  halves: "spreadsheet.fmtFractionHalves",
  quarters: "spreadsheet.fmtFractionQuarters",
  eighths: "spreadsheet.fmtFractionEighths",
  sixteenths: "spreadsheet.fmtFractionSixteenths",
  tenths: "spreadsheet.fmtFractionTenths",
  hundredths: "spreadsheet.fmtFractionHundredths",
};

const SPECIAL_TYPE_LABEL_KEY: Record<SpecialTypeId, string> = {
  postalCodeZh: "spreadsheet.fmtSpecialPostalCodeZh",
  chineseLower: "spreadsheet.fmtSpecialChineseLower",
  chineseUpper: "spreadsheet.fmtSpecialChineseUpper",
  zipCode: "spreadsheet.fmtSpecialZipCode",
  zipCodePlus4: "spreadsheet.fmtSpecialZipCodePlus4",
  phoneNumber: "spreadsheet.fmtSpecialPhoneNumber",
  socialSecurity: "spreadsheet.fmtSpecialSocialSecurity",
};

/** The negative sample Excel draws its "Negative numbers" list with. */
const NEGATIVE_SAMPLE = -1234.1;

// ── Preview helper ─────────────────────────────────────────────────────────────

const PREVIEW_FALLBACK = 1234.5;

function makePreviewValue(raw: number | string | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return PREVIEW_FALLBACK;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormatCellsDialog({
  paletteId = "office",
  themeBindingEnabled = true,
  previewValue,
  date1904 = false,
  currentFormat,
  currentAlignment,
  mixedFontFields,
  borderLines,
  borderAuthorityAvailable = true,
  selectionIsRange = false,
  selectionSize,
  normalFont,
  protectionLocked = false,
  confirmDisabled = false,
  confirmDisabledReason,
  numberOnly = false,
  conditionalFormat = false,
  fontOnly = false,
  initialPane,
  title,
  dialogControlId = "XLSCTL.HOME.FORMAT_CELLS.DIALOG",
  workbookCustomFormats,
  onDeleteCustomFormat,
  footerStartActions,
  onConfirm,
  onCancel,
}: FormatCellsDialogProps) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const fontFamilyLabels = useMemo(() => ({
    ...OFFICE_FONT_FAMILY_LABELS,
    "system-ui, sans-serif": t("spreadsheet.systemDefaultFont"),
  }), [t]);
  const fontLabel = (family: string) =>
    ribbonFontFamilyLabel(family, fontFamilyLabels);

  const categoryListId = useId();
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => inferDialogState(currentFormat ?? "", locale),
  );
  const [formatTouched, setFormatTouched] = useState(false);
  // XLS-A055: the Locale / Calendar the user picked on the Date or Time page
  // (null = read from the format code).
  const [dateLocaleChoice, setDateLocaleChoice] = useState<{ lid: number; calendar: DateCalendarId } | null>(null);
  const [timeLocaleChoice, setTimeLocaleChoice] = useState<number | null>(null);
  const [pane, setPane] = useState<FormatCellsPane>(() =>
    fontOnly
      ? "font"
      : initialPane &&
          (conditionalFormat ? CONDITIONAL_FORMAT_PANES : FORMAT_CELLS_PANES).includes(initialPane)
        ? initialPane
        : "number",
  );
  // Excel's cell Underline list goes on to Single / Double Accounting, the
  // rules across the whole cell; header/footer text and a conditional
  // format's font underline only the characters.
  const accountingUnderlines = !fontOnly && !conditionalFormat;
  // Esc belongs to a nested modal (Fill Effects) while it is open: it closes
  // that one alone and keeps this dialog's draft (live audit S-196).
  const nestedModalOpenRef = useRef(false);
  const fillEffectsOpenerRef = useRef<HTMLButtonElement>(null);
  const [fillEffectsOpen, setFillEffectsOpen] = useState(false);
  useEffect(() => {
    nestedModalOpenRef.current = fillEffectsOpen;
  }, [fillEffectsOpen]);
  const [colorTarget, setColorTarget] = useState<"font" | "pattern" | null>(
    null,
  );
  // Border tab (XLS-A060): Excel's pen — a Line Style (None removes) and a
  // Colour (null = Automatic) — and the eight lines of the selection's block.
  // A line the author never touches stays out of the result, so a mixed one
  // keeps every cell's own edge.
  const [borderPen, setBorderPen] = useState<{
    style: BorderLineStyle | null;
    color: string | null;
    themeColor?: SpreadsheetThemeColor;
  }>({ style: "thin", color: null });
  const [borderPenColorOpen, setBorderPenColorOpen] = useState(false);
  const borderPenColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [borderDraft, setBorderDraft] = useState<{
    lines: Record<FormatCellsBorderLine, FormatCellsBorderLineState>;
    patch: FormatCellsBorderLinesPatch;
  }>(() => ({
    lines: {
      ...(borderLines ??
        formatCellsBorderSummaryOfEdges(currentAlignment?.borderEdges)),
    },
    patch: {},
  }));
  // Each colour popup is placed against the button that opened it; without an
  // anchor the portalled popup would measure the first button in the document.
  const fontColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  const patternColorAnchorRef = useRef<HTMLButtonElement | null>(null);
  // Keep the complete display draft separate from the exact touched patch.
  // That distinction is what lets a mixed selection show one active-cell
  // preview without silently copying every untouched field on OK.
  const [styleDraft, setStyleDraft] = useState<{
    value: FormatCellsStyle;
    patch: FormatCellsStyle;
  }>(
    () => ({
      value: { ...(currentAlignment ?? {}) },
      patch: {},
    }),
  );
  const alignment = resolveThemeStyle(styleDraft.value, paletteId);
  // Excel's Font list is every font (XLS-A059): the ribbon's All Fonts — the
  // shared catalogue's stacks and every Office family the served stand-ins
  // cover — plus the cell's own font when it is none of them. The first entry
  // is the workbook's Normal font, which a cell naming no font wears.
  const ownFontFamily = currentAlignment?.fontFamily;
  const fontFamilyOptions = useMemo(() => {
    const seen = new Set<string>();
    const listed: string[] = [];
    for (const family of [
      ...(ownFontFamily ? [ownFontFamily] : []),
      // "System default" is a browser stack, not a font a workbook can
      // name: listed only for a cell that already wears it, as the ribbon.
      ...OFFICE_FONT_FAMILY_VALUES.filter(
        (stack) => stack !== OFFICE_SYSTEM_FONT_FAMILY_VALUE,
      ),
      ...officeFontFamilies(),
    ]) {
      const key = officePrimaryFontFamily(family).toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      listed.push(family);
    }
    return listed.sort((left, right) =>
      fontLabel(left).localeCompare(fontLabel(right)),
    );
    // fontLabel reads the live labels map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamilyLabels, ownFontFamily]);
  const fontSizePoints = typeof alignment.fontSize === "number"
    ? alignment.fontSize * .75
    : undefined;
  const fontSizeOptions = fontSizePoints !== undefined &&
    Number.isFinite(fontSizePoints) && fontSizePoints > 0 &&
    !OFFICE_FONT_SIZE_POINTS.some((size) => size === fontSizePoints)
    ? [fontSizePoints, ...OFFICE_FONT_SIZE_POINTS.filter(
        (size) => Number(size.toFixed(2)) !== Number(fontSizePoints.toFixed(2)),
      )]
    : OFFICE_FONT_SIZE_POINTS;
  const mergeStylePatch = (current: FormatCellsStyle, patch: FormatCellsStyle) => {
    const next = {...current, ...patch};
    const bindings = themeColorsAfterPatch(current, patch);
    if (bindings) next.themeColors = bindings;
    else delete next.themeColors;
    return next;
  };
  const patchAlignment = (patch: FormatCellsStyle) =>
    setStyleDraft((current) => ({
      value: mergeStylePatch(current.value, patch),
      patch: mergeStylePatch(current.patch, patch),
    }));
  // The Fill page as Excel lays it out: Background Color is the cell shading,
  // and when a Pattern Style is chosen that shading becomes the pattern's
  // background while Pattern Color paints its marks.
  const fillDraft: FillDraft = (() => {
    const pattern = alignment.fillPattern;
    const bindings = styleDraft.value.themeColors ?? {};
    return pattern
      ? {
          background: pattern.backgroundColor,
          backgroundTheme: bindings["fillPattern.backgroundColor"],
          patternType: pattern.type,
          patternColor: pattern.foregroundColor,
          patternTheme: bindings["fillPattern.foregroundColor"],
        }
      : {
          background: alignment.backgroundColor,
          backgroundTheme: bindings.backgroundColor,
          patternType: "",
        };
  })();
  const patchFill = (change: {
    background?: string | null;
    backgroundTheme?: SpreadsheetThemeColor;
    patternType?: SpreadsheetFillPatternType | "";
    patternColor?: string | null;
    patternTheme?: SpreadsheetThemeColor;
  }) => {
    const background =
      change.background === null
        ? undefined
        : (change.background ?? fillDraft.background);
    const backgroundTheme =
      change.background !== undefined
        ? change.backgroundTheme
        : fillDraft.backgroundTheme;
    const patternType = change.patternType ?? fillDraft.patternType;
    const patternColor =
      change.patternColor === null
        ? undefined
        : (change.patternColor ?? fillDraft.patternColor);
    const patternTheme =
      change.patternColor !== undefined
        ? change.patternTheme
        : fillDraft.patternTheme;
    const themeColors: SpreadsheetThemeColors = {};
    if (patternType === "") {
      if (background && backgroundTheme) {
        themeColors.backgroundColor = backgroundTheme;
      }
      patchAlignment({
        backgroundColor: background,
        fillPattern: undefined,
        gradientFill: undefined,
        themeColors,
      });
      return;
    }
    const paper = background ?? AUTOMATIC_PATTERN_BACKGROUND;
    const ink = patternColor ?? AUTOMATIC_PATTERN_COLOR;
    if (background && backgroundTheme) {
      themeColors.backgroundColor = backgroundTheme;
      themeColors["fillPattern.backgroundColor"] = backgroundTheme;
    }
    if (patternColor && patternTheme) {
      themeColors["fillPattern.foregroundColor"] = patternTheme;
    }
    patchAlignment({
      backgroundColor: paper,
      fillPattern: {
        type: patternType,
        foregroundColor: ink,
        backgroundColor: paper,
      },
      gradientFill: undefined,
      themeColors,
    });
  };
  // Excel's Sample box: the fill exactly as the grid will paint it (a pattern
  // wins over a gradient, which wins over the flat colour, as in cellStyleCss).
  const fillSample =
    spreadsheetFillPatternCss(alignment.fillPattern) ??
    spreadsheetGradientFillCss(alignment.gradientFill) ??
    (alignment.backgroundColor
      ? { backgroundColor: alignment.backgroundColor }
      : undefined);
  const patternColorIsAutomatic =
    fillDraft.patternColor === undefined ||
    (fillDraft.patternColor === AUTOMATIC_PATTERN_COLOR &&
      !fillDraft.patternTheme);
  const patchFormat = (action: Action) => {
    const next = reducer(state, action);
    const changed = (
      Object.keys(next) as Array<keyof FormatDialogState>
    ).some((key) => next[key] !== state[key]);
    if (!changed) return;
    setFormatTouched(true);
    dispatch(action);
  };
  const isMixedFontField = (field: keyof FormatCellsFont) =>
    mixedFontFields?.includes(field as FormatCellsMixedFontField) === true &&
    !Object.prototype.hasOwnProperty.call(styleDraft.patch, field);
  // ── Border tab (XLS-A060) ──
  // Inside Horizontal needs two rows of the block, Inside Vertical two
  // columns; a conditional format borders one cell at a time, on its four
  // sides only (Excel offers neither inside nor diagonal lines there).
  const blockRows = selectionSize?.rows ?? (selectionIsRange ? 2 : 1);
  const blockColumns = selectionSize?.columns ?? (selectionIsRange ? 2 : 1);
  const borderLineAvailable = (line: FormatCellsBorderLine): boolean => {
    if (!borderAuthorityAvailable) return false;
    if (conditionalFormat) {
      return line === "top" || line === "bottom" || line === "left" || line === "right";
    }
    if (line === "insideHorizontal") return blockRows > 1;
    if (line === "insideVertical") return blockColumns > 1;
    return true;
  };
  const penValue = (): FormatCellsBorderLineValue | undefined =>
    borderPen.style === null
      ? undefined
      : {
          style: borderPen.style,
          ...(borderPen.color ? { color: borderPen.color } : {}),
        };
  /** Sets (or, with the None style, removes) lines with the current pen. */
  const drawBorderLines = (
    targets: readonly FormatCellsBorderLine[],
    remove = false,
  ) => {
    const drawn = remove ? undefined : penValue();
    setBorderDraft((current) => {
      const lines = { ...current.lines };
      const patch = { ...current.patch };
      for (const line of targets) {
        if (!borderLineAvailable(line)) continue;
        lines[line] = drawn ? { value: drawn, mixed: false } : { mixed: false };
        patch[line] = drawn
          ? {
              style: drawn.style,
              color: drawn.color ?? null,
              ...(drawn.color && borderPen.themeColor
                ? { themeColor: borderPen.themeColor }
                : {}),
            }
          : { style: null };
      }
      // A cell keeps one diagonal style: drawing either direction restyles
      // the other one the cells already show.
      if (drawn) {
        for (const [line, other] of [
          ["diagonalUp", "diagonalDown"],
          ["diagonalDown", "diagonalUp"],
        ] as const) {
          if (
            targets.includes(line) &&
            !targets.includes(other) &&
            lines[other].value
          ) {
            lines[other] = { value: drawn, mixed: false };
          }
        }
      }
      return { lines, patch };
    });
  };
  /** A border button or a click on the preview: a line already drawn in the
   * pen's style and colour comes off; any other line takes the pen. */
  const toggleBorderLine = (line: FormatCellsBorderLine) => {
    const state = borderDraft.lines[line];
    const pen = penValue();
    const same =
      !state.mixed &&
      state.value !== undefined &&
      pen !== undefined &&
      state.value.style === pen.style &&
      (state.value.color ?? null) === (pen.color ?? null);
    drawBorderLines([line], pen === undefined || same);
  };
  const applyBorderPreset = (preset: "none" | "outline" | "inside") => {
    if (preset === "none") {
      drawBorderLines(FORMAT_CELLS_BORDER_LINES, true);
      return;
    }
    drawBorderLines(
      preset === "outline"
        ? ["top", "bottom", "left", "right"]
        : ["insideHorizontal", "insideVertical"],
      borderPen.style === null,
    );
  };
  const borderLineLabel = (line: FormatCellsBorderLine): string => {
    switch (line) {
      case "top":
        return t("spreadsheet.fmtBorderTop");
      case "bottom":
        return t("spreadsheet.fmtBorderBottom");
      case "left":
        return t("spreadsheet.fmtBorderLeft");
      case "right":
        return t("spreadsheet.fmtBorderRight");
      case "insideHorizontal":
        return t("toolbar.tableBordersInsideHorizontal");
      case "insideVertical":
        return t("toolbar.tableBordersInsideVertical");
      case "diagonalUp":
        return t("spreadsheet.fmtBorderDiagonalUp");
      case "diagonalDown":
        return t("spreadsheet.fmtBorderDiagonalDown");
    }
  };
  /** One of the eight buttons around the preview: pressed when the line is
   * drawn across the whole block, mixed when only some of it is. */
  const borderLineButton = (line: FormatCellsBorderLine) => {
    // A rule's format borders one cell: no inside or diagonal buttons.
    if (
      conditionalFormat &&
      line !== "top" &&
      line !== "bottom" &&
      line !== "left" &&
      line !== "right"
    ) {
      return <span key={line} style={{ width: 36, height: 36 }} />;
    }
    const state = borderDraft.lines[line];
    const label = borderLineLabel(line);
    return (
      <button
        key={line}
        type="button"
        disabled={!borderLineAvailable(line)}
        aria-label={label}
        title={label}
        aria-pressed={state.mixed ? "mixed" : state.value !== undefined}
        onClick={() => toggleBorderLine(line)}
        data-testid={`format-cells-border-line-${line}`}
        className={dialogParts.compactButton}
        style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }}
      >
        <OfficeBorderPresetIcon
          preset={
            line === "insideHorizontal"
              ? "insideH"
              : line === "insideVertical"
                ? "insideV"
                : line
          }
          size={22}
        />
      </button>
    );
  };
  // ── Font tab (XLS-A059) ──
  const fontStyleChoice = (): FontDialogStyle | "__mixed__" =>
    isMixedFontField("bold") || isMixedFontField("italic")
      ? "__mixed__"
      : (fontDialogStyleFromMarks(
          alignment.bold === true,
          alignment.italic === true,
          false,
        ) as FontDialogStyle);
  const fontStyleLabel = (style: FontDialogStyle) =>
    style === "regular"
      ? t("spreadsheet.fmtFontRegular")
      : style === "bold"
        ? t("spreadsheet.fmtFontBold")
        : style === "italic"
          ? t("spreadsheet.fmtFontItalic")
          : t("spreadsheet.fmtFontBoldItalic");
  // Normal font: font, size, style, underline, colour and effects back to
  // the workbook's Normal style, which is a cell stating none of them.
  const NORMAL_FONT_FIELDS = [
    "fontFamily",
    "fontSize",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "superscript",
    "subscript",
  ] as const;
  const fontIsNormal =
    NORMAL_FONT_FIELDS.every(
      (field) => !isMixedFontField(field) && !styleDraft.value[field],
    ) &&
    !styleDraft.value.underlineStyle &&
    !styleDraft.value.themeFontRole &&
    !styleDraft.value.color;
  const normalFontLabel = normalFont
    ? normalFont.themeBody
      ? t("toolbar.fontPickerThemeBody", { font: fontLabel(normalFont.family) })
      : fontLabel(normalFont.family)
    : t("spreadsheet.fmtAlignGeneral");
  const [fontFamilyText, setFontFamilyText] = useState<string | null>(null);
  const [fontSizeText, setFontSizeText] = useState<string | null>(null);
  const fontFamilyShown = isMixedFontField("fontFamily")
    ? ""
    : alignment.fontFamily
      ? fontLabel(alignment.fontFamily)
      : normalFontLabel;
  const fontSizeShown = isMixedFontField("fontSize")
    ? ""
    : formatOfficeFontSize(fontSizePoints ?? SPREADSHEET_DEFAULT_FONT_PT);
  const commitFontFamilyText = () => {
    const typed = fontFamilyText?.trim();
    setFontFamilyText(null);
    if (!typed || typed === fontFamilyShown) return;
    if (typed.toLocaleLowerCase() === normalFontLabel.toLocaleLowerCase()) {
      patchAlignment({ fontFamily: undefined, themeFontRole: undefined });
      return;
    }
    // A listed font by its name; otherwise the typed name itself, as Excel
    // takes a font that is not installed.
    const listed = fontFamilyOptions.find(
      (family) =>
        fontLabel(family).toLocaleLowerCase() === typed.toLocaleLowerCase(),
    );
    patchAlignment({ fontFamily: listed ?? typed, themeFontRole: undefined });
  };
  const commitFontSizeText = () => {
    const typed = fontSizeText;
    setFontSizeText(null);
    if (typed === null || typed.trim() === "" || typed.trim() === fontSizeShown) return;
    // Excel's Size box: 1 to 409 in half points (officeFontSizeCatalog).
    const points = parseOfficeFontSizeInput(typed, "excel");
    if (points === undefined) return;
    patchAlignment({ fontSize: ptToPx(points) });
  };
  const fontTypeAheadMatch =
    fontFamilyText && fontFamilyText.trim()
      ? fontFamilyOptions.find((family) =>
          fontLabel(family)
            .toLocaleLowerCase()
            .startsWith(fontFamilyText.trim().toLocaleLowerCase()),
        )
      : undefined;

  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap / Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (nestedModalOpenRef.current) return;
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const formatCode = buildFormatCode(state);
  const previewNum = makePreviewValue(previewValue);
  // The sample is drawn as the cell will be: with the viewer's decimal and
  // thousands separators (Excel's system separators); the code keeps "." and ",".
  const previewSeparators = viewerNumberSeparators(locale);
  // A cell holding text shows that text under every number format (Excel
  // formats numbers only), not the 1234.5 sample (live audit B432).
  const previewIsText =
    typeof previewValue === "string" &&
    previewValue !== "" &&
    !Number.isFinite(Number(previewValue));
  // ...through the code's text section, as the cell draws it: 甲乙 under
  // `"文字:"@` previews 文字:甲乙 (live audit S-088). An error stays itself.
  const previewText = previewIsText
    ? /^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|CIRCULAR!|ERROR!|BUSY!|CONNECT!|BLOCKED!|GETTING_DATA|FIELD!|UNKNOWN!)$/.test(previewValue as string)
      ? (previewValue as string)
      : applyTextFormat(previewValue as string, formatCode)
    : state.category === "Text"
      ? String(previewValue ?? PREVIEW_FALLBACK)
      : state.category === "General"
        ? formatGeneralNumberWith(previewNum, previewSeparators)
        : applyCellNumberFormat(
            previewNum,
            regionalSystemDateDisplayCode(formatCode, locale),
            previewSeparators ? { date1904, separators: previewSeparators } : { date1904 },
          );

  const hasDecimals =
    state.category === "Number" ||
    state.category === "Currency" ||
    state.category === "Accounting" ||
    state.category === "Percentage" ||
    state.category === "Scientific";

  const hasSymbol =
    state.category === "Currency" || state.category === "Accounting";

  const hasThousands = state.category === "Number";

  const hasNegativeStyle =
    state.category === "Number" || state.category === "Currency";

  const hasDatePreset = state.category === "Date";
  const hasTimePreset = state.category === "Time";
  const region = numberFormatRegion(locale);
  // XLS-A055: Locale (location) and Calendar type. Read from the code until
  // the user picks one; the region's own curated list keeps the region.
  const regionLid = regionLocaleId(locale);
  const derivedDateLocale = (code: string, list: readonly NumberFormatTypeEntry[]) =>
    list.some((entry) => entry.code === code)
      ? { lid: regionLid, calendar: 1 as DateCalendarId }
      : dateCodeLocale(code, regionLid);
  const dateLocale = dateLocaleChoice ?? derivedDateLocale(state.datePreset, dateTypeList(region));
  const timeLocaleLid = timeLocaleChoice ?? derivedDateLocale(state.timePreset, timeTypeList(region)).lid;
  const dateTypeOptions = dateTypesFor(dateLocale.lid, dateLocale.calendar, regionLid, dateTypeList(region));
  const timeTypeOptions = timeTypesFor(timeLocaleLid, regionLid, timeTypeList(region));
  const datePresets = typeListEntries(dateTypeOptions, state.datePreset, locale);
  const timePresets = typeListEntries(timeTypeOptions, state.timePreset, locale);
  const localeNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  })();
  const localeLabel = (tag: string) => localeNames?.of(tag) ?? tag;
  const hasFractionType = state.category === "Fraction";
  const symbolOptions = (() => {
    const options = currencySymbolOptions(region);
    return options.some((option) => option.token === state.symbol)
      ? options
      : [...options, { token: state.symbol, glyph: state.symbol }];
  })();
  const languageNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  })();
  const symbolLabel = (option: { token: string; glyph: string; locale?: string }) => {
    if (option.token === "") return t("spreadsheet.fmtBorderNone");
    if (!option.locale) return option.glyph;
    return `${option.glyph} ${languageNames?.of(option.locale) ?? option.locale}`;
  };
  const negativeStyles = negativeStylesFor(state.category, state.region ?? region);
  const specialTypes = specialTypeList(region);
  const customTypes = (() => {
    // Built-in codes, then the workbook's own formats (XLS-A056).
    const list = [...customTypeList(region)];
    for (const code of workbookCustomFormats ?? []) {
      if (!list.includes(code)) list.push(code);
    }
    const own = state.customCode.trim();
    return own && !list.includes(own) ? [...list, own] : list;
  })();
  const deletableCustomCode =
    onDeleteCustomFormat && (workbookCustomFormats ?? []).includes(state.customCode.trim())
      ? state.customCode.trim()
      : null;
  // Excel spells General 「G/通用格式」 in a Chinese list, and shows the system
  // short date in the region's order.
  const customTypeLabel = (code: string) =>
    code === "General" && region === "zh" ? "G/通用格式" : regionalSystemDateDisplayCode(code, locale);

  const borderLineStyles = conditionalFormat
    ? CONDITIONAL_BORDER_LINE_STYLES
    : BORDER_LINE_STYLES;
  // Excel's Clear in a rule's Format Cells: every member of the rule's format
  // goes back to "not set" (the number format to General), and OK keeps that.
  const clearConditionalFormat = () => {
    setStyleDraft({
      value: {},
      patch: {
        color: undefined,
        backgroundColor: undefined,
        fillPattern: undefined,
        gradientFill: undefined,
        bold: undefined,
        italic: undefined,
        underline: undefined,
        underlineStyle: undefined,
        strikethrough: undefined,
      },
    });
    drawBorderLines(FORMAT_CELLS_BORDER_LINES, true);
    setColorTarget(null);
    setBorderPenColorOpen(false);
    dispatch({ type: "SET_CATEGORY", category: "General" });
    setFormatTouched(true);
  };

  const hasCustomCode = state.category === "Custom";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="app-modal-overlay"
      role="presentation"
      onClick={onCancel}
      data-testid="format-cells-overlay"
    >
      <div
        ref={dialogRef}
        className={officeDialogClassName({ tone: "spreadsheet", size: "xl" })}
        role="dialog"
        aria-modal="true"
        aria-labelledby="format-cells-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = dialogRef.current
            ? Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                  'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ),
              ).filter((candidate) => candidate.isConnected)
            : [];
          if (focusable.length === 0) return;
          const index = focusable.indexOf(
            document.activeElement as HTMLElement,
          );
          const backward = event.shiftKey && index <= 0;
          const forward =
            !event.shiftKey && (index < 0 || index === focusable.length - 1);
          if (!backward && !forward) return;
          event.preventDefault();
          focusable[backward ? focusable.length - 1 : 0]?.focus({
            preventScroll: true,
          });
        }}
        data-control-id={fontOnly ? undefined : dialogControlId}
        data-testid="format-cells-dialog"
        data-format-cells-mode={fontOnly ? "font" : undefined}
        style={{ overflow: "hidden" }}
      >
        {/* Title bar */}
        <div className={dialogParts.header}>
          <h2
            id="format-cells-title"
            className={dialogParts.title}
          >
            {title ?? t("spreadsheet.fmtCellsTitle")}
          </h2>
          <button
            type="button"
            className={dialogParts.close}
            onClick={onCancel}
            aria-label={t("common.close")}
            data-testid="format-cells-dialog-close"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Tab strip: Excel / WPS put every cell setting behind one dialog. */}
        {numberOnly || fontOnly ? null : <div
          role="tablist"
          aria-label={t("spreadsheet.fmtCellsTitle")}
          className={dialogParts.tabs}
        >
          {(conditionalFormat ? CONDITIONAL_FORMAT_PANES : FORMAT_CELLS_PANES).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              onClick={() => setPane(id)}
              data-testid={`format-cells-tab-${id}`}
              className={dialogParts.tab}
            >
              {t(
                `spreadsheet.fmtTab${id.charAt(0).toUpperCase()}${id.slice(1)}` as "spreadsheet.fmtTabNumber",
              )}
            </button>
          ))}
        </div>}

        {pane === "font" ? (
          <div
            role="tabpanel"
            data-testid="format-cells-font"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            {/* Excel's Font tab (XLS-A059): Font, Font style and Size, each a
                box over its list; Underline, Color and Normal font; Effects
                beside the Preview. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 0.7fr)",
                gap: 12,
              }}
            >
              <div className={dialogParts.field}>
                <label
                  className={dialogParts.label}
                  htmlFor={`${categoryListId}-font-family`}
                >
                  {t("spreadsheet.fmtFontFamily")}
                </label>
                <input
                  id={`${categoryListId}-font-family`}
                  type="text"
                  value={fontFamilyText ?? fontFamilyShown}
                  disabled={conditionalFormat}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setFontFamilyText(event.target.value)}
                  onBlur={commitFontFamilyText}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitFontFamilyText();
                  }}
                  data-testid="format-cells-font-family-input"
                />
                <select
                  size={7}
                  aria-label={t("spreadsheet.fmtFontFamily")}
                  value={
                    fontTypeAheadMatch ??
                    (isMixedFontField("fontFamily")
                      ? "__mixed__"
                      : (alignment.fontFamily ?? ""))
                  }
                  onChange={(event) => {
                    setFontFamilyText(null);
                    patchAlignment({
                      fontFamily: event.target.value || undefined,
                      themeFontRole: undefined,
                    });
                  }}
                  disabled={conditionalFormat}
                  data-testid="format-cells-font-family"
                >
                  <option value="__mixed__" disabled hidden />
                  <option value="">{normalFontLabel}</option>
                  {fontFamilyOptions.map((family) => (
                    <option key={family} value={family}>
                      {fontLabel(family)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={dialogParts.field}>
                <label
                  className={dialogParts.label}
                  htmlFor={`${categoryListId}-font-style`}
                >
                  {t("spreadsheet.fmtFontStyle")}
                </label>
                <input
                  type="text"
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  value={
                    fontStyleChoice() === "__mixed__"
                      ? ""
                      : fontStyleLabel(fontStyleChoice() as FontDialogStyle)
                  }
                />
                <select
                  id={`${categoryListId}-font-style`}
                  size={7}
                  value={fontStyleChoice()}
                  onChange={(event) => {
                    const marks = fontDialogStyleMarks(
                      event.target.value as FontDialogStyle,
                    );
                    // A conditional format's Regular is a direct "not bold /
                    // not italic" over the cell's own font (B495); a cell's
                    // Regular is the absence of the mark.
                    patchAlignment({
                      bold: conditionalFormat ? marks.bold : marks.bold || undefined,
                      italic: conditionalFormat ? marks.italic : marks.italic || undefined,
                    });
                  }}
                  data-testid="format-cells-font-style"
                >
                  <option value="__mixed__" disabled hidden />
                  {FONT_DIALOG_STYLE_VALUES.map((style) => (
                    <option key={style} value={style}>
                      {fontStyleLabel(style)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={dialogParts.field}>
                <label
                  className={dialogParts.label}
                  htmlFor={`${categoryListId}-font-size`}
                >
                  {t("spreadsheet.fmtFontSize")}
                </label>
                <input
                  id={`${categoryListId}-font-size`}
                  type="text"
                  inputMode="decimal"
                  value={fontSizeText ?? fontSizeShown}
                  disabled={conditionalFormat}
                  autoComplete="off"
                  onChange={(event) => setFontSizeText(event.target.value)}
                  onBlur={commitFontSizeText}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitFontSizeText();
                  }}
                  data-testid="format-cells-font-size-input"
                />
                <select
                  size={7}
                  aria-label={t("spreadsheet.fmtFontSize")}
                  // The size in effect, as the box above shows it: a cell
                  // with no size of its own is at the default 11, and the
                  // list selects 11 too. An empty value selected the first
                  // option (5), and ArrowDown from it set 5.5 (B525).
                  value={
                    isMixedFontField("fontSize")
                      ? "__mixed__"
                      : typeof alignment.fontSize === "number"
                        ? fontSizePoints
                        : conditionalFormat
                          ? ""
                          : SPREADSHEET_DEFAULT_FONT_PT
                  }
                  onChange={(event) => {
                    setFontSizeText(null);
                    patchAlignment({
                      fontSize: event.target.value
                        ? Number(event.target.value) / .75
                        : undefined,
                    });
                  }}
                  disabled={conditionalFormat}
                  data-testid="format-cells-font-size"
                >
                  <option value="__mixed__" disabled hidden />
                  {fontSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {/* Keep the exact value; hide pixel conversion noise in its label. */}
                      {Number(size.toFixed(2))}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1.7fr) minmax(0, 1.7fr)",
                gap: 12,
                alignItems: "end",
              }}
            >
              <label className={dialogParts.field}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.fmtFontUnderline")}
                </span>
                <select
                  value={
                    isMixedFontField("underline")
                      ? "__mixed__"
                      : !accountingUnderlines
                        ? alignment.underline === true
                          ? cellUnderlineIsDouble(alignment)
                            ? "double"
                            : "single"
                          : "none"
                        : (cellUnderlineKind(alignment) ?? "none")
                  }
                  onChange={(event) => {
                    const variant = event.target.value;
                    if (
                      variant === "double" ||
                      variant === "singleAccounting" ||
                      variant === "doubleAccounting"
                    ) {
                      patchAlignment({
                        underline: true,
                        underlineStyle: variant,
                      });
                    } else if (variant === "single") {
                      patchAlignment({
                        underline: true,
                        underlineStyle: undefined,
                      });
                    } else if (variant === "none") {
                      patchAlignment({
                        underline: undefined,
                        underlineStyle: undefined,
                      });
                    }
                  }}
                  data-testid="format-cells-font-underline"
                >
                  <option value="__mixed__" disabled hidden />
                  <option value="none">{t("spreadsheet.fmtBorderNone")}</option>
                  <option value="single">{t("spreadsheet.underline")}</option>
                  <option value="double">
                    {t("spreadsheet.doubleUnderline")}
                  </option>
                  {accountingUnderlines ? (
                    <>
                      <option value="singleAccounting">
                        {t("spreadsheet.singleAccountingUnderline")}
                      </option>
                      <option value="doubleAccounting">
                        {t("spreadsheet.doubleAccountingUnderline")}
                      </option>
                    </>
                  ) : null}
                </select>
              </label>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ position: "relative", display: "inline-flex", gap: 6 }}>
                  <button
                    ref={fontColorAnchorRef}
                    type="button"
                    onClick={() =>
                      setColorTarget((current) => (current === "font" ? null : "font"))
                    }
                    data-testid="format-cells-font-color-toggle"
                    className={dialogParts.compactButton}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 3,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: alignment.color ?? "#183c38",
                      }}
                    />
                    {t("spreadsheet.fmtFontColor")}
                  </button>
                  {colorTarget === "font" ? (
                    <ColorPalettePopover
                      anchorRef={fontColorAnchorRef}
                      zIndex={FORMAT_CELLS_POPOVER_Z_INDEX}
                      value={alignment.color ?? "#183c38"}
                      automaticSelected={alignment.color === undefined}
                      labels={{
                        automatic: t("toolbar.textColorAutomatic"),
                        themeColors: t("spreadsheet.themeColors"),
                        standardColors: t("spreadsheet.standardColors"),
                        recentColors: t("spreadsheet.recentColors"),
                        moreColors: t("spreadsheet.moreColors"),
                      }}
                      testIdPrefix="format-cells-font-color"
                      paletteId={paletteId}
                      onPickTheme={themeBindingEnabled ? (color, ref) => {
                        patchAlignment({color, themeColors:{color:ref}});
                        setColorTarget(null);
                      } : undefined}
                      onPick={(color) => {
                        if (color) patchAlignment({ color });
                        setColorTarget(null);
                      }}
                      onAutomatic={() => {
                        patchAlignment({ color: undefined });
                        setColorTarget(null);
                      }}
                    />
                  ) : null}
                </span>
                {/* Excel's Normal font: the font, style, size, underline,
                    colour and effects of the workbook's Normal style. Header
                    and footer text and a rule's format have no Normal. */}
                {!fontOnly && !conditionalFormat ? (
                  <label className={dialogParts.check}>
                    <input
                      type="checkbox"
                      checked={fontIsNormal}
                      onChange={(event) => {
                        if (!event.target.checked) return;
                        setFontFamilyText(null);
                        setFontSizeText(null);
                        patchAlignment({
                          fontFamily: undefined,
                          themeFontRole: undefined,
                          fontSize: undefined,
                          bold: undefined,
                          italic: undefined,
                          underline: undefined,
                          underlineStyle: undefined,
                          strikethrough: undefined,
                          superscript: undefined,
                          subscript: undefined,
                          color: undefined,
                        });
                      }}
                      data-testid="format-cells-font-normal"
                    />
                    {t("spreadsheet.fmtFontNormal")}
                  </label>
                ) : null}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  fontOnly ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 2fr)",
                gap: 12,
              }}
            >
              <fieldset>
                <legend>{t("spreadsheet.fmtFontEffects")}</legend>
                <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(
                    [
                      ["strikethrough", t("spreadsheet.fmtFontStrike")],
                      // Superscript and subscript exclude each other:
                      // checking one clears the other. A rule's format has
                      // no baseline, so Excel dims both there.
                      ["superscript", t("toolbar.superscript")],
                      ["subscript", t("toolbar.subscript")],
                    ] as const
                  ).map(([field, label]) => {
                    const mixed = isMixedFontField(field);
                    return (
                      <label
                        key={field}
                        className={dialogParts.check}
                      >
                        <input
                          ref={(element) => {
                            if (element) element.indeterminate = mixed;
                          }}
                          type="checkbox"
                          disabled={conditionalFormat && field !== "strikethrough"}
                          checked={!mixed && alignment[field] === true}
                          aria-checked={mixed ? "mixed" : alignment[field] === true}
                          onChange={(event) =>
                            patchAlignment({
                              [field]: event.target.checked || undefined,
                              ...(event.target.checked && field === "superscript"
                                ? { subscript: undefined }
                                : event.target.checked && field === "subscript"
                                  ? { superscript: undefined }
                                  : {}),
                            })
                          }
                          data-testid={`format-cells-font-${field}`}
                        />
                        {label}
                      </label>
                    );
                  })}
                </span>
              </fieldset>
              {fontOnly ? null : (
                <div className={dialogParts.field}>
                  <span className={dialogParts.label}>
                    {t("toolbar.fontDialogPreview")}
                  </span>
                  <div
                    className={dialogParts.well}
                    data-testid="format-cells-font-preview"
                    style={{
                      height: 64,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      // A cell is white whatever the card behind it shows.
                      background: "#ffffff",
                    }}
                  >
                    <span style={formatCellsFontPreviewCss(alignment, normalFont?.family)}>
                      {t("toolbar.fontDialogPreviewSample")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : pane === "border" ? (
          <div
            role="tabpanel"
            data-testid="format-cells-border"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            {/* Excel's Border tab (XLS-A060): the Line (Style, Color) on the
                left; Presets, the preview and its eight border buttons on the
                right. A preset, a button or a click on the preview draws the
                chosen line; drawing a line again in the same pen removes it. */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 150px) minmax(0, 1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <fieldset disabled={!borderAuthorityAvailable}>
                <legend>{t("spreadsheet.fmtBorderLine")}</legend>
                <span className={dialogParts.label}>
                  {t("spreadsheet.fmtBorderStyle")}
                </span>
                <div
                  role="radiogroup"
                  aria-label={t("spreadsheet.fmtBorderStyle")}
                  className={dialogParts.well}
                  data-testid="format-cells-border-style-list"
                  style={{
                    display: "grid",
                    gridTemplateRows: `repeat(${Math.ceil(
                      (borderLineStyles.length + 1) / (conditionalFormat ? 1 : 2),
                    )}, 20px)`,
                    gridAutoFlow: "column",
                    gap: 2,
                    padding: 4,
                  }}
                >
                  {([null, ...borderLineStyles] as const).map((style) => {
                    const checked = borderPen.style === style;
                    return (
                      <button
                        key={style ?? "none"}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={
                          style === null
                            ? t("spreadsheet.fmtBorderNone")
                            : t(`spreadsheet.borderStyle.${style}`)
                        }
                        title={
                          style === null
                            ? t("spreadsheet.fmtBorderNone")
                            : t(`spreadsheet.borderStyle.${style}`)
                        }
                        onClick={() =>
                          setBorderPen((current) => ({ ...current, style }))
                        }
                        data-testid={`format-cells-border-style-${style ?? "none"}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 56,
                          padding: "0 4px",
                          border: checked
                            ? "1px solid var(--office-dialog-accent, #2563eb)"
                            : "1px solid transparent",
                          borderRadius: 4,
                          background: "transparent",
                          color: "#000000",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {style === null ? (
                          t("spreadsheet.fmtBorderNone")
                        ) : (
                          <BorderLineSample style={style} />
                        )}
                      </button>
                    );
                  })}
                </div>
                <span className={dialogParts.label}>
                  {t("spreadsheet.fmtBorderColor")}
                </span>
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <button
                    ref={borderPenColorAnchorRef}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={borderPenColorOpen}
                    onClick={() => setBorderPenColorOpen((open) => !open)}
                    data-testid="format-cells-border-color"
                    data-value={borderPen.color ?? "auto"}
                    className={dialogParts.compactButton}
                    style={{ minWidth: 110, justifyContent: "flex-start" }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "block",
                        width: 28,
                        height: 10,
                        borderRadius: 2,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: borderPen.color ?? AUTOMATIC_BORDER_COLOR,
                      }}
                    />
                    {borderPen.color === null
                      ? t("toolbar.textColorAutomatic")
                      : null}
                  </button>
                  {borderPenColorOpen && borderAuthorityAvailable ? (
                    <ColorPalettePopover
                      anchorRef={borderPenColorAnchorRef}
                      zIndex={FORMAT_CELLS_POPOVER_Z_INDEX}
                      value={borderPen.color ?? undefined}
                      automaticSelected={borderPen.color === null}
                      labels={{
                        automatic: t("toolbar.textColorAutomatic"),
                        themeColors: t("spreadsheet.themeColors"),
                        standardColors: t("spreadsheet.standardColors"),
                        recentColors: t("spreadsheet.recentColors"),
                        moreColors: t("spreadsheet.moreColors"),
                      }}
                      testIdPrefix="format-cells-border-color"
                      paletteId={paletteId}
                      onPickTheme={
                        themeBindingEnabled
                          ? (color, ref) => {
                              const normalized = normalizeHexColor(color);
                              if (normalized) {
                                setBorderPen((current) => ({
                                  ...current,
                                  color: normalized,
                                  themeColor: ref,
                                }));
                              }
                              setBorderPenColorOpen(false);
                            }
                          : undefined
                      }
                      onDismiss={() => setBorderPenColorOpen(false)}
                      onPick={(color) => {
                        const normalized = color ? normalizeHexColor(color) : null;
                        if (normalized) {
                          setBorderPen((current) => ({
                            ...current,
                            color: normalized,
                            themeColor: undefined,
                          }));
                        }
                        setBorderPenColorOpen(false);
                      }}
                      onAutomatic={() => {
                        setBorderPen((current) => ({
                          ...current,
                          color: null,
                          themeColor: undefined,
                        }));
                        setBorderPenColorOpen(false);
                      }}
                    />
                  ) : null}
                </span>
              </fieldset>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <fieldset disabled={!borderAuthorityAvailable}>
                  <legend>{t("spreadsheet.fmtBorderPresets")}</legend>
                  <span style={{ display: "flex", gap: 18, paddingInlineStart: 44 }}>
                    {(
                      [
                        ["none", "none", t("spreadsheet.fmtBorderNone"), false],
                        ["outline", "outside", t("spreadsheet.fmtBorderOutline"), false],
                        // Excel dims Inside for a single cell: it has no
                        // interior. A rule's format has none either.
                        [
                          "inside",
                          "inside",
                          t("spreadsheet.fmtBorderInside"),
                          blockRows < 2 && blockColumns < 2,
                        ],
                      ] as const
                    )
                      .filter(([preset]) => !conditionalFormat || preset !== "inside")
                      .map(([preset, icon, label, dimmed]) => (
                        <span
                          key={preset}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 3,
                            fontSize: 11,
                          }}
                        >
                          <button
                            type="button"
                            disabled={!borderAuthorityAvailable || dimmed}
                            aria-label={label}
                            title={label}
                            onClick={() => applyBorderPreset(preset)}
                            data-testid={`format-cells-border-preset-${preset}`}
                            className={dialogParts.compactButton}
                            style={{ width: 36, height: 36, padding: 0, justifyContent: "center" }}
                          >
                            <OfficeBorderPresetIcon preset={icon} size={26} />
                          </button>
                          <span aria-hidden="true">{label}</span>
                        </span>
                      ))}
                  </span>
                </fieldset>
                <fieldset disabled={!borderAuthorityAvailable}>
                  <legend>{t("spreadsheet.fmtTabBorder")}</legend>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "36px minmax(160px, 1fr) 36px",
                      gridTemplateRows: "110px 36px",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      {(["top", "insideHorizontal", "bottom"] as const).map(
                        (line) => borderLineButton(line),
                      )}
                    </span>
                    <FormatCellsBorderPreview
                      lines={borderDraft.lines}
                      rows={conditionalFormat ? 1 : Math.min(blockRows, 2)}
                      columns={conditionalFormat ? 1 : Math.min(blockColumns, 2)}
                      text={t("spreadsheet.fmtBorderText")}
                      available={borderLineAvailable}
                      onToggle={toggleBorderLine}
                    />
                    <span />
                    {borderLineButton("diagonalUp")}
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      {(["left", "insideVertical", "right"] as const).map(
                        (line) => borderLineButton(line),
                      )}
                    </span>
                    {borderLineButton("diagonalDown")}
                  </div>
                </fieldset>
              </div>
            </div>
            <span className={dialogParts.hint}>
              {t("spreadsheet.fmtBorderHint")}
            </span>
          </div>
        ) : pane === "fill" ? (
          <div
            role="tabpanel"
            data-testid="format-cells-fill"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span className={dialogParts.label}>
                  {t("spreadsheet.fmtFillBackground")}
                </span>
                {/* No frame of its own: the card is the only box, and the
                    panel's inset lines its swatches up under the caption. */}
                <div style={{ marginInlineStart: -8 }}>
                  {/* The palette IS this page, so it renders in place rather
                      than as a popup placed against a button. */}
                  <ColorPalettePanel
                    value={fillDraft.background ?? ""}
                    allowNoFill
                    noFillSelected={
                      fillDraft.background === undefined &&
                      fillDraft.patternType === ""
                    }
                    focusOnMount={false}
                    labels={{
                      themeColors: t("spreadsheet.themeColors"),
                      standardColors: t("spreadsheet.standardColors"),
                      recentColors: t("spreadsheet.recentColors"),
                      moreColors: t("spreadsheet.moreColors"),
                      noFill: t("spreadsheet.fmtFillNoColor"),
                    }}
                    testIdPrefix="format-cells-fill-color"
                    paletteId={paletteId}
                    onPickTheme={
                      themeBindingEnabled
                        ? (color, ref) =>
                            patchFill({
                              background: color,
                              backgroundTheme: ref,
                            })
                        : undefined
                    }
                    onPick={(color) =>
                      color === null
                        ? // Excel's No Color returns the whole fill to its
                          // default: shading and pattern alike.
                          patchFill({
                            background: null,
                            patternType: "",
                            patternColor: null,
                          })
                        : patchFill({ background: color })
                    }
                  />
                </div>
              </div>
              <div
                style={{
                  // A conditional format's fill is one colour in the model.
                  display: conditionalFormat ? "none" : "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 190,
                }}
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <button
                    ref={patternColorAnchorRef}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={colorTarget === "pattern"}
                    onClick={() =>
                      setColorTarget((current) =>
                        current === "pattern" ? null : "pattern",
                      )
                    }
                    data-testid="format-cells-fill-pattern-color-toggle"
                    className={dialogParts.compactButton}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 3,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background:
                          fillDraft.patternColor ?? AUTOMATIC_PATTERN_COLOR,
                      }}
                    />
                    {t("spreadsheet.fmtFillPatternColor")}
                  </button>
                  {colorTarget === "pattern" ? (
                    <ColorPalettePopover
                      anchorRef={patternColorAnchorRef}
                      zIndex={FORMAT_CELLS_POPOVER_Z_INDEX}
                      value={fillDraft.patternColor ?? AUTOMATIC_PATTERN_COLOR}
                      automaticSelected={patternColorIsAutomatic}
                      labels={{
                        automatic: t("toolbar.textColorAutomatic"),
                        themeColors: t("spreadsheet.themeColors"),
                        standardColors: t("spreadsheet.standardColors"),
                        recentColors: t("spreadsheet.recentColors"),
                        moreColors: t("spreadsheet.moreColors"),
                      }}
                      testIdPrefix="format-cells-fill-pattern-color"
                      paletteId={paletteId}
                      onPickTheme={
                        themeBindingEnabled
                          ? (color, ref) => {
                              patchFill({
                                patternColor: color,
                                patternTheme: ref,
                              });
                              setColorTarget(null);
                            }
                          : undefined
                      }
                      onDismiss={() => setColorTarget(null)}
                      onPick={(color) => {
                        if (color) patchFill({ patternColor: color });
                        setColorTarget(null);
                      }}
                      onAutomatic={() => {
                        patchFill({ patternColor: null });
                        setColorTarget(null);
                      }}
                    />
                  ) : null}
                </span>
                <label
                  className={dialogParts.field}
                >
                  <span
                    className={dialogParts.label}
                  >
                    {t("spreadsheet.fmtFillPatternStyle")}
                  </span>
                  <select
                    value={fillDraft.patternType}
                    onChange={(event) =>
                      patchFill({
                        patternType: event.target
                          .value as SpreadsheetFillPatternType | "",
                      })
                    }
                    data-testid="format-cells-fill-pattern-style"
                  >
                    <option value="">{t("spreadsheet.fmtBorderNone")}</option>
                    {FILL_PATTERN_STYLE_ORDER.map((type) => (
                      <option key={type} value={type}>
                        {t(
                          `spreadsheet.fillPattern.${type}` as "spreadsheet.fillPattern.gray125",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                {/* Excel's Fill Effects… (two-colour gradient, XLS-A061). */}
                <button
                  type="button"
                  className={dialogParts.compactButton}
                  ref={fillEffectsOpenerRef}
                  onClick={() => setFillEffectsOpen(true)}
                  data-testid="format-cells-fill-effects-open"
                >
                  {t("spreadsheet.fmtFillEffects")}
                </button>
                {fillEffectsOpen ? (
                  <FillEffectsDialog
                    current={alignment.gradientFill}
                    paletteId={paletteId}
                    zIndex={FORMAT_CELLS_POPOVER_Z_INDEX}
                    returnFocusRef={fillEffectsOpenerRef}
                    onCancel={() => setFillEffectsOpen(false)}
                    onConfirm={(gradient) => {
                      setFillEffectsOpen(false);
                      // A gradient replaces the shading and any pattern; its
                      // first stop is the flat colour under it (cellStyleCss).
                      patchAlignment({
                        backgroundColor: gradient.stops[0]?.color,
                        fillPattern: undefined,
                        gradientFill: gradient,
                        themeColors: {},
                      });
                    }}
                  />
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtFillSample")}
              </span>
              <div
                aria-hidden="true"
                data-testid="format-cells-fill-sample"
                style={{
                  height: 44,
                  // An unfilled cell is white, as on the sheet, whatever the
                  // card behind it shows.
                  backgroundColor: "#ffffff",
                  border: "1px solid var(--office-dialog-control-border)",
                  borderRadius: 6,
                  ...(fillSample ?? {}),
                }}
              />
            </div>
          </div>
        ) : pane === "protection" ? (
          <div
            role="tabpanel"
            data-testid="format-cells-protection"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minHeight: 0,
            }}
          >
            <label
              className={dialogParts.check}
            >
              <input
                type="checkbox"
                // Excel's default is locked. Keep an explicitly re-checked true
                // in the touched patch so a mixed range is fully locked; the
                // worksheet commit seam prunes that default from persistence.
                checked={alignment.locked !== false}
                disabled={protectionLocked}
                onChange={(event) =>
                  patchAlignment({ locked: event.target.checked })
                }
                data-testid="format-cells-protection-locked"
              />
              {t("spreadsheet.fmtProtectionLocked")}
            </label>
            <label className={dialogParts.check}>
              <input
                type="checkbox"
                // Excel's Hidden: the formula bar withholds the contents of
                // the cell once the sheet is protected.
                checked={alignment.formulaHidden === true}
                disabled={protectionLocked}
                onChange={(event) =>
                  patchAlignment({ formulaHidden: event.target.checked })
                }
                data-testid="format-cells-protection-hidden"
              />
              {t("spreadsheet.fmtProtectionHidden")}
            </label>
            <span className={dialogParts.hint}>
              {t("spreadsheet.fmtProtectionHintWithHidden")}
            </span>
          </div>
        ) : pane === "alignment" ? (
          <div
            role="tabpanel"
            data-testid="format-cells-alignment"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtAlignHorizontal")}
              </span>
              <select
                value={horizontalChoice(alignment)}
                onChange={(event) => {
                  // Excel's Horizontal list is one choice; the model keeps
                  // Center Across, Fill and Justify/Distributed beside
                  // textAlign, so picking any entry states all of them.
                  patchAlignment(horizontalPatch(event.target.value as FormatCellsHorizontal));
                }}
                data-testid="format-cells-align-horizontal"
              >
                <option value="">{t("spreadsheet.fmtAlignGeneral")}</option>
                <option value="left">{t("spreadsheet.fmtAlignLeft")}</option>
                <option value="center">{t("spreadsheet.fmtAlignCenter")}</option>
                <option value="right">{t("spreadsheet.fmtAlignRight")}</option>
                <option value="fill">{t("spreadsheet.fmtAlignFill")}</option>
                <option value="justify">{t("spreadsheet.fmtAlignJustify")}</option>
                <option value="centerAcross">
                  {t("spreadsheet.centerAcross")}
                </option>
                <option value="distributed">{t("spreadsheet.fmtAlignDistributedIndent")}</option>
              </select>
            </label>
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtAlignVertical")}
              </span>
              {/* Excel's Vertical list has no General: an unaligned cell sits
                  at the bottom, so that is what an untouched cell shows. */}
              <select
                value={alignment.verticalJustify ?? alignment.verticalAlign ?? "bottom"}
                onChange={(event) => {
                  const next = event.target.value;
                  patchAlignment(
                    next === "justify" || next === "distributed"
                      ? { verticalAlign: undefined, verticalJustify: next }
                      : {
                          verticalAlign: next as "top" | "middle" | "bottom",
                          verticalJustify: undefined,
                        },
                  );
                }}
                data-testid="format-cells-align-vertical"
              >
                <option value="top">{t("spreadsheet.fmtAlignTop")}</option>
                <option value="middle">{t("spreadsheet.fmtAlignMiddle")}</option>
                <option value="bottom">{t("spreadsheet.fmtAlignBottom")}</option>
                <option value="justify">{t("spreadsheet.fmtAlignJustify")}</option>
                <option value="distributed">{t("spreadsheet.fmtAlignDistributed")}</option>
              </select>
            </label>
            {/* Excel's "Justify distributed": only for Distributed (Indent). */}
            <label className={dialogParts.check}>
              <input
                type="checkbox"
                checked={alignment.justifyLastLine === true}
                disabled={alignment.horizontalJustify !== "distributed"}
                onChange={(event) =>
                  patchAlignment({ justifyLastLine: event.target.checked || undefined })
                }
                data-testid="format-cells-align-justify-distributed"
              />
              {t("spreadsheet.fmtAlignJustifyDistributed")}
            </label>
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtAlignIndent")}
              </span>
              <input
                type="number"
                min={0}
                max={MAX_INDENT}
                value={alignment.indent ?? 0}
                // Excel greys Indent under Center, Fill, Justify and Center
                // Across Selection; under General an indent makes the cell
                // Left (Indent) (`cellIndentPatch`).
                disabled={["center", "fill", "justify", "centerAcross"].includes(horizontalChoice(alignment))}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  patchAlignment(
                    cellIndentPatch(alignment, {
                      level: Number.isFinite(next) ? Math.max(0, Math.min(MAX_INDENT, Math.round(next))) : 0,
                    }),
                  );
                }}
                data-testid="format-cells-align-indent"
                style={{ width: 90 }}
              />
            </label>
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtAlignRotation")}
              </span>
              <input
                type="number"
                min={MIN_ROTATION}
                max={MAX_ROTATION}
                value={alignment.verticalText === true ? 0 : (alignment.textRotation ?? 0)}
                disabled={alignment.verticalText === true}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  patchAlignment({
                    verticalText: undefined,
                    textRotation: Number.isFinite(next)
                      ? Math.max(
                          MIN_ROTATION,
                          Math.min(MAX_ROTATION, Math.round(next)),
                        )
                      : 0,
                  });
                }}
                data-testid="format-cells-align-rotation"
                style={{ width: 90 }}
              />
            </label>
            <label className={dialogParts.check}>
              <input
                type="checkbox"
                checked={alignment.verticalText === true}
                onChange={(event) =>
                  patchAlignment(
                    event.target.checked
                      ? { verticalText: true, textRotation: undefined }
                      : { verticalText: undefined },
                  )
                }
                data-testid="format-cells-align-vertical-text"
              />
              {t("spreadsheet.rotateTextVertical")}
            </label>
            <label
              className={dialogParts.check}
            >
              {/* Excel greys out Shrink to fit while Wrap text is checked and
                  vice versa: text cannot both wrap onto more lines and shrink
                  to fit one. */}
              <input
                type="checkbox"
                checked={alignment.wrapText === true}
                disabled={alignment.shrinkToFit === true}
                onChange={(event) =>
                  patchAlignment({
                    wrapText: event.target.checked || undefined,
                    ...(event.target.checked ? { shrinkToFit: undefined } : {}),
                  })
                }
                data-testid="format-cells-align-wrap"
              />
              {t("spreadsheet.fmtAlignWrap")}
            </label>
            <label
              className={dialogParts.check}
            >
              <input
                type="checkbox"
                checked={alignment.shrinkToFit === true}
                disabled={alignment.wrapText === true}
                onChange={(event) =>
                  patchAlignment({
                    shrinkToFit: event.target.checked || undefined,
                    ...(event.target.checked ? { wrapText: undefined } : {}),
                  })
                }
                data-testid="format-cells-align-shrink"
              />
              {t("spreadsheet.fmtAlignShrink")}
            </label>
            <label
              className={dialogParts.check}
            >
              <input
                type="checkbox"
                checked={alignment.mergeCells === true}
                onChange={(event) =>
                  patchAlignment({ mergeCells: event.target.checked })
                }
                data-testid="format-cells-align-merge"
              />
              {t("spreadsheet.mergeCells")}
            </label>
            {/* Right-to-left > Text direction (alignment/@readingOrder). */}
            <label className={dialogParts.field}>
              <span className={dialogParts.label}>
                {t("spreadsheet.fmtAlignTextDirection")}
              </span>
              <select
                value={alignment.readingOrder ?? ""}
                onChange={(event) =>
                  patchAlignment({
                    readingOrder:
                      event.target.value === "ltr" || event.target.value === "rtl"
                        ? event.target.value
                        : undefined,
                  })
                }
                data-testid="format-cells-align-text-direction"
              >
                <option value="">{t("spreadsheet.fmtAlignDirContext")}</option>
                <option value="ltr">{t("spreadsheet.fmtAlignDirLtr")}</option>
                <option value="rtl">{t("spreadsheet.fmtAlignDirRtl")}</option>
              </select>
            </label>
          </div>
        ) : (
        /* Body: category list + controls */
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Category list */}
          {/* One Tab stop, the arrows move the category (selection follows
              focus, as in Excel's list): the keyboard can reach it (live
              audit B425). */}
          <div
            role="listbox"
            tabIndex={0}
            aria-label={t("spreadsheet.fmtCatLabel")}
            aria-activedescendant={`${categoryListId}-${state.category}`}
            data-testid="format-cells-category-list"
            className={dialogParts.list}
            style={{ width: 140, flexShrink: 0, padding: "2px 0" }}
            onKeyDown={(event) => {
              const index = FORMAT_CATEGORIES.indexOf(state.category);
              const target =
                event.key === "ArrowDown" ? Math.min(FORMAT_CATEGORIES.length - 1, index + 1)
                : event.key === "ArrowUp" ? Math.max(0, index - 1)
                : event.key === "Home" ? 0
                : event.key === "End" ? FORMAT_CATEGORIES.length - 1
                : -1;
              if (target < 0) return;
              event.preventDefault();
              event.stopPropagation();
              const category = FORMAT_CATEGORIES[target];
              if (category !== state.category) patchFormat({ type: "SET_CATEGORY", category });
              event.currentTarget
                .querySelector<HTMLElement>(`[data-testid="format-cells-cat-${category.toLowerCase()}"]`)
                ?.scrollIntoView?.({ block: "nearest" });
            }}
          >
            {FORMAT_CATEGORIES.map((cat) => (
              <div
                key={cat}
                id={`${categoryListId}-${cat}`}
                role="option"
                aria-selected={state.category === cat}
                data-testid={`format-cells-cat-${cat.toLowerCase()}`}
                onClick={() =>
                  patchFormat({
                    type: "SET_CATEGORY",
                    category: cat,
                    // Custom opens on the code the cell has now; Special on its
                    // first type (Excel).
                    ...(cat === "Custom" && state.category !== "Custom"
                      ? { customCode: formatCode }
                      : cat === "Special" && state.category !== "Special"
                        ? { customCode: specialTypes[0]?.code ?? "" }
                        : {}),
                  })
                }
                className={dialogParts.listItem}
                style={{ userSelect: "none" }}
              >
                {t(CATEGORY_KEY[cat] as Parameters<typeof t>[0])}
              </div>
            ))}
          </div>

          {/* Controls panel */}
          <div
            style={{
              flex: 1,
              padding: "2px 0 2px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
            data-testid="format-cells-controls"
          >
            {/* Decimal places */}
            {hasDecimals && (
              <label
                className={dialogParts.row}
              >
                <span style={{ minWidth: 130 }}>
                  {t("spreadsheet.fmtDecimalPlaces")}
                </span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={state.decimals}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_DECIMALS",
                      decimals: Math.round(Number(e.target.value)),
                    })
                  }
                  data-testid="format-cells-decimals"
                  style={{ width: 60 }}
                />
              </label>
            )}

            {/* Thousands separator */}
            {hasThousands && (
              <label
                className={dialogParts.check}
              >
                <input
                  type="checkbox"
                  checked={state.thousands}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_THOUSANDS",
                      thousands: e.target.checked,
                    })
                  }
                  data-testid="format-cells-thousands"
                />
                {t("spreadsheet.fmtThousandsSep")}
              </label>
            )}

            {/* Currency / Accounting symbol */}
            {hasSymbol && (
              <label
                className={dialogParts.row}
              >
                <span style={{ minWidth: 130 }}>
                  {t("spreadsheet.fmtSymbol")}
                </span>
                <select
                  value={state.symbol}
                  onChange={(e) =>
                    patchFormat({ type: "SET_SYMBOL", symbol: e.target.value })
                  }
                  data-testid="format-cells-symbol"
                >
                  {symbolOptions.map((option) => (
                    <option key={option.token || "none"} value={option.token}>
                      {symbolLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Negative number style */}
            {hasNegativeStyle && (
              <div className={dialogParts.field}>
                <div className={dialogParts.label}>
                  {t("spreadsheet.fmtNegativeStyle")}
                </div>
                <div
                  role="listbox"
                  aria-label={t("spreadsheet.fmtNegativeStyle")}
                  data-testid="format-cells-negative-style"
                  className={dialogParts.list}
                >
                  {negativeStyles.map((style) => {
                    // Each choice is the sample drawn through the code it
                    // writes, so it follows the decimals, the separator and
                    // the symbol; red ones are drawn red (XLS-A054).
                    const red = style === "red" || style === "red-parens" || style === "red-minus";
                    const sample = applyNumberFormat(
                      NEGATIVE_SAMPLE,
                      buildFormatCode({ ...state, negativeStyle: style }),
                      previewSeparators ? { separators: previewSeparators } : undefined,
                    ).trimEnd();
                    return (
                      <div
                        key={style}
                        role="option"
                        aria-selected={state.negativeStyle === style}
                        aria-label={red ? t("spreadsheet.fmtNegativeRed", { value: sample }) : sample}
                        onClick={() =>
                          patchFormat({
                            type: "SET_NEG_STYLE",
                            negativeStyle: style,
                          })
                        }
                        data-testid={`format-cells-neg-${style}`}
                        className={dialogParts.listItem}
                        style={red ? { color: "var(--office-dialog-danger)" } : undefined}
                      >
                        {sample}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date presets */}
            {hasDatePreset && (
              <div className={dialogParts.field}>
                <div className={dialogParts.label}>
                  {t("spreadsheet.fmtDateFormat")}
                </div>
                <select
                  value={state.datePreset}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_DATE_PRESET",
                      datePreset: e.target.value as DatePreset,
                    })
                  }
                  data-testid="format-cells-date-preset"
                  style={{ width: "100%" }}
                  size={Math.min(datePresets.length, 10)}
                >
                  {datePresets.map(({ code, example }) => (
                    <option key={code} value={code} title={code}>
                      {example}
                    </option>
                  ))}
                </select>
                <label className={dialogParts.row}>
                  <span style={{ minWidth: 130 }}>{t("spreadsheet.fmtDateLocale")}</span>
                  <select
                    value={dateLocale.lid}
                    onChange={(e) => {
                      const lid = Number(e.target.value);
                      const next = { lid, calendar: 1 as DateCalendarId };
                      setDateLocaleChoice(next);
                      const first = dateTypesFor(lid, 1, regionLid, dateTypeList(region))[0];
                      if (first) patchFormat({ type: "SET_DATE_PRESET", datePreset: first.code });
                    }}
                    data-testid="format-cells-date-locale"
                  >
                    {DATE_FORMAT_LOCALES.map((entry) => (
                      <option key={entry.lid} value={entry.lid}>
                        {localeLabel(entry.tag)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={dialogParts.row}>
                  <span style={{ minWidth: 130 }}>{t("spreadsheet.fmtCalendarType")}</span>
                  <select
                    value={dateLocale.calendar}
                    onChange={(e) => {
                      const calendar = Number(e.target.value) as DateCalendarId;
                      setDateLocaleChoice({ lid: dateLocale.lid, calendar });
                      const first = dateTypesFor(dateLocale.lid, calendar, regionLid, dateTypeList(region))[0];
                      if (first) patchFormat({ type: "SET_DATE_PRESET", datePreset: first.code });
                    }}
                    data-testid="format-cells-calendar-type"
                  >
                    {calendarOptionsFor(dateLocale.lid).map((calendar) => (
                      <option key={calendar} value={calendar}>
                        {t(CALENDAR_LABEL_KEY[calendar] as Parameters<typeof t>[0])}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={dialogParts.hint} style={{ margin: 0 }}>
                  {t("spreadsheet.fmtDateSystemNote")}
                </p>
              </div>
            )}

            {/* Time presets */}
            {hasTimePreset && (
              <div className={dialogParts.field}>
                <div className={dialogParts.label}>
                  {t("spreadsheet.fmtTimeFormat")}
                </div>
                <select
                  value={state.timePreset}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_TIME_PRESET",
                      timePreset: e.target.value as TimePreset,
                    })
                  }
                  data-testid="format-cells-time-preset"
                  style={{ width: "100%" }}
                  size={Math.min(timePresets.length, 10)}
                >
                  {timePresets.map(({ code, example }) => (
                    <option key={code} value={code} title={code}>
                      {example}
                    </option>
                  ))}
                </select>
                <label className={dialogParts.row}>
                  <span style={{ minWidth: 130 }}>{t("spreadsheet.fmtDateLocale")}</span>
                  <select
                    value={timeLocaleLid}
                    onChange={(e) => {
                      const lid = Number(e.target.value);
                      setTimeLocaleChoice(lid);
                      const first = timeTypesFor(lid, regionLid, timeTypeList(region))[0];
                      if (first) patchFormat({ type: "SET_TIME_PRESET", timePreset: first.code });
                    }}
                    data-testid="format-cells-time-locale"
                  >
                    {DATE_FORMAT_LOCALES.map((entry) => (
                      <option key={entry.lid} value={entry.lid}>
                        {localeLabel(entry.tag)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={dialogParts.hint} style={{ margin: 0 }}>
                  {t("spreadsheet.fmtTimeSystemNote")}
                </p>
              </div>
            )}

            {/* Fraction type */}
            {hasFractionType && (
              <div className={dialogParts.field}>
                <div className={dialogParts.label}>
                  {t("spreadsheet.fmtFractionType")}
                </div>
                <select
                  value={state.fractionType}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_FRACTION_TYPE",
                      fractionType: e.target.value as FractionType,
                    })
                  }
                  data-testid="format-cells-fraction-type"
                  style={{ width: "100%" }}
                  size={FRACTION_TYPE_CODES.length}
                >
                  {FRACTION_TYPE_CODES.map(([type, code]) => (
                    <option key={type} value={type} title={code}>
                      {t(FRACTION_TYPE_LABEL_KEY[type] as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Special types (XLS-A056) */}
            {state.category === "Special" && (
              <div className={dialogParts.field}>
                <div className={dialogParts.label}>
                  {t("spreadsheet.fmtCustomCode")}
                </div>
                <select
                  value={state.customCode}
                  onChange={(e) =>
                    patchFormat({ type: "SET_CUSTOM_CODE", customCode: e.target.value })
                  }
                  data-testid="format-cells-special-type"
                  style={{ width: "100%" }}
                  size={specialTypes.length}
                >
                  {specialTypes.map(({ id, code }) => (
                    <option key={id} value={code} title={code}>
                      {t(SPECIAL_TYPE_LABEL_KEY[id] as Parameters<typeof t>[0])}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom / Special code box */}
            {hasCustomCode && (
              <label
                className={dialogParts.field}
              >
                <span>{t("spreadsheet.fmtCustomCode")}</span>
                <input
                  type="text"
                  value={state.customCode}
                  onChange={(e) =>
                    patchFormat({
                      type: "SET_CUSTOM_CODE",
                      customCode: e.target.value,
                    })
                  }
                  data-testid="format-cells-custom-code"
                  style={{ fontFamily: "monospace" }}
                  spellCheck={false}
                />
              </label>
            )}
            {/* Custom: Excel's Type list of built-in codes (XLS-A056) */}
            {state.category === "Custom" && (
              <select
                value={customTypes.includes(state.customCode.trim()) ? state.customCode.trim() : ""}
                onChange={(e) =>
                  patchFormat({ type: "SET_CUSTOM_CODE", customCode: e.target.value })
                }
                aria-label={t("spreadsheet.fmtCustomCode")}
                data-testid="format-cells-custom-list"
                style={{ width: "100%", fontFamily: "monospace" }}
                size={10}
              >
                {customTypes.map((code) => (
                  <option key={code} value={code}>
                    {customTypeLabel(code)}
                  </option>
                ))}
              </select>
            )}
            {state.category === "Custom" && onDeleteCustomFormat ? (
              <div className={dialogParts.row} style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className={dialogParts.compactButton}
                  disabled={deletableCustomCode === null}
                  onClick={() => {
                    if (deletableCustomCode === null) return;
                    const index = customTypes.indexOf(deletableCustomCode);
                    onDeleteCustomFormat(deletableCustomCode);
                    // Excel selects the entry above the deleted one.
                    const previous = customTypes[index - 1] ?? "General";
                    patchFormat({ type: "SET_CUSTOM_CODE", customCode: previous });
                  }}
                  data-testid="format-cells-custom-delete"
                >
                  {t("spreadsheet.fmtCustomDelete")}
                </button>
              </div>
            ) : null}

            {/* General / Text / Accounting info text */}
            {state.category === "General" && (
              <p
                className={dialogParts.hint} style={{ margin: 0, opacity: 0.7 }}
                data-testid="format-cells-info"
              >
                {t("spreadsheet.fmtGeneralInfo")}
              </p>
            )}
            {state.category === "Text" && (
              <p
                className={dialogParts.hint} style={{ margin: 0, opacity: 0.7 }}
                data-testid="format-cells-info"
              >
                {t("spreadsheet.fmtTextInfo")}
              </p>
            )}
            {state.category === "Accounting" && (
              <p
                className={dialogParts.hint} style={{ margin: 0, opacity: 0.7 }}
                data-testid="format-cells-info"
              >
                {t("spreadsheet.fmtAccountingInfo")}
              </p>
            )}
          </div>
        </div>
        )}

        {/* Live preview */}
        <div
          data-testid="format-cells-preview"
          style={{
            paddingTop: 10,
            borderTop: "1px solid var(--office-dialog-divider)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className={dialogParts.label} style={{ flexShrink: 0 }}>
            {/* Excel's Number tab calls it Sample (示例), the Font tab Preview. */}
            {t(fontOnly ? "spreadsheet.fmtPreview" : "spreadsheet.fmtFillSample")}
          </span>
          {fontOnly ? (
            // Excel's Font Preview: a sample drawn in the chosen font.
            <span
              data-testid="format-cells-preview-text"
              style={{
                flex: 1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textAlign: "center",
                fontFamily: alignment.fontFamily || undefined,
                fontSize:
                  typeof alignment.fontSize === "number"
                    ? Math.min(alignment.fontSize, 40)
                    : undefined,
                fontWeight: alignment.bold ? 700 : 400,
                fontStyle: alignment.italic ? "italic" : "normal",
                textDecorationLine:
                  [
                    alignment.underline ? "underline" : "",
                    alignment.strikethrough ? "line-through" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || "none",
                textDecorationStyle:
                  cellUnderlineIsDouble(alignment) ? "double" : undefined,
                verticalAlign: alignment.superscript
                  ? "super"
                  : alignment.subscript
                    ? "sub"
                    : undefined,
                color: alignment.color,
              }}
            >
              AaBbCcYyZz
            </span>
          ) : (
            <>
              <span
                data-testid="format-cells-preview-text"
                style={{
                  flex: 1,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {previewText}
              </span>
              {/* Excel shows a code only in Custom's Type box (XLS-A054). */}
              {state.category === "Custom" ? null : (
                <span hidden data-testid="format-cells-preview-code">{formatCode}</span>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className={dialogParts.footer}>
          {conditionalFormat ? (
            <button
              type="button"
              className={`${dialogParts.button} ${dialogParts.footerStart}`}
              onClick={clearConditionalFormat}
              data-testid="format-cells-clear"
            >
              {t("spreadsheet.cfDialog.clear")}
            </button>
          ) : null}
          {footerStartActions ? (
            <span className={`${dialogParts.footerStart} inline-flex gap-2`}>{footerStartActions}</span>
          ) : null}
          <button
            type="button"
            className={dialogParts.button}
            onClick={onCancel}
            data-control-id={fontOnly ? undefined : "XLSCTL.HOME.FORMAT_CELLS.CANCEL"}
            data-testid="format-cells-cancel"
          >
            {t("spreadsheet.fmtCancel")}
          </button>
          <button
            type="button"
            className={dialogParts.primaryButton}
            disabled={confirmDisabled}
            title={confirmDisabledReason}
            onClick={() =>
              onConfirm({
                formatCode: formatTouched ? formatCode : undefined,
                style: styleDraft.patch,
                borderLinesPatch:
                  Object.keys(borderDraft.patch).length > 0
                    ? borderDraft.patch
                    : undefined,
              })
            }
            data-control-id={fontOnly ? undefined : "XLSCTL.HOME.FORMAT_CELLS.OK"}
            data-testid="format-cells-ok"
          >
            {t("spreadsheet.fmtOk")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Font tab preview (XLS-A059) ───────────────────────────────────────────────

/** Excel's Font Preview: the sample in the drafted font, as a cell draws it
 * (Automatic is black, a size is capped so the box keeps its height). */
function formatCellsFontPreviewCss(
  font: FormatCellsFont,
  normalFamily: string | undefined,
): CSSProperties {
  const points =
    typeof font.fontSize === "number" && Number.isFinite(font.fontSize)
      ? pxToPt(font.fontSize)
      : SPREADSHEET_DEFAULT_FONT_PT;
  const decorations = [
    font.underline ? "underline" : "",
    font.strikethrough ? "line-through" : "",
  ].filter(Boolean);
  const script = font.superscript ? "super" : font.subscript ? "sub" : undefined;
  return {
    fontFamily: font.fontFamily || normalFamily || undefined,
    fontSize: `${Math.min(points, 28) * (script ? 0.75 : 1)}pt`,
    fontWeight: font.bold ? 700 : 400,
    fontStyle: font.italic ? "italic" : "normal",
    textDecorationLine: decorations.join(" ") || "none",
    textDecorationStyle:
      font.underline && cellUnderlineIsDouble(font) ? "double" : undefined,
    verticalAlign: script,
    color: font.color ?? AUTOMATIC_BORDER_COLOR,
  };
}

// ── Border tab drawing (XLS-A060) ─────────────────────────────────────────────

/** Grey, as Excel draws a line the selection does not agree on. */
const MIXED_BORDER_INK = "#9ca3af";

/** One stroke of a border line between two points, in its style. */
function BorderStroke({
  x1,
  y1,
  x2,
  y2,
  value,
  mixed,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value?: FormatCellsBorderLineValue;
  mixed?: boolean;
}) {
  if (mixed) {
    return (
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MIXED_BORDER_INK} strokeWidth={2} />
    );
  }
  if (!value) return null;
  const spec = borderLineStrokeSpec(value.style);
  const ink = value.color ?? AUTOMATIC_BORDER_COLOR;
  const dash = spec.dash ? spec.dash.join(" ") : undefined;
  if (!spec.double) {
    return (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={ink}
        strokeWidth={spec.width}
        strokeDasharray={dash}
      />
    );
  }
  // Two hairlines either side of the line's path.
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / length) * 1.5;
  const ny = ((x2 - x1) / length) * 1.5;
  return (
    <g stroke={ink} strokeWidth={1}>
      <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} />
      <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} />
    </g>
  );
}

/** A line style as the Style list shows it. */
function BorderLineSample({ style }: { style: BorderLineStyle }) {
  return (
    <svg width={48} height={8} viewBox="0 0 48 8" aria-hidden="true">
      <BorderStroke x1={0} y1={4} x2={48} y2={4} value={{ style }} />
    </svg>
  );
}

const PREVIEW_W = 200;
const PREVIEW_H = 110;
const PREVIEW_PAD = 14;

type PreviewSegment = readonly [number, number, number, number];

/**
 * Excel's Border preview: the selection as one, two or four cells (a block
 * of two rows shows the inside horizontal line, of two columns the inside
 * vertical one), each with its "Text" sample, the drawn lines in their own
 * style and colour, and a mixed line in grey. A click near a line toggles it,
 * as the button for that line does.
 */
function FormatCellsBorderPreview({
  lines,
  rows,
  columns,
  text,
  available,
  onToggle,
}: {
  lines: Readonly<Record<FormatCellsBorderLine, FormatCellsBorderLineState>>;
  rows: number;
  columns: number;
  text: string;
  available: (line: FormatCellsBorderLine) => boolean;
  onToggle: (line: FormatCellsBorderLine) => void;
}) {
  const x0 = PREVIEW_PAD;
  const x1 = PREVIEW_W - PREVIEW_PAD;
  const y0 = PREVIEW_PAD;
  const y1 = PREVIEW_H - PREVIEW_PAD;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const colEdges = columns > 1 ? [x0, xm, x1] : [x0, x1];
  const rowEdges = rows > 1 ? [y0, ym, y1] : [y0, y1];
  const cells: Array<{ cx0: number; cy0: number; cx1: number; cy1: number }> = [];
  for (let r = 0; r < rowEdges.length - 1; r += 1) {
    for (let c = 0; c < colEdges.length - 1; c += 1) {
      cells.push({
        cx0: colEdges[c]!,
        cx1: colEdges[c + 1]!,
        cy0: rowEdges[r]!,
        cy1: rowEdges[r + 1]!,
      });
    }
  }
  const segments: Array<{
    line: FormatCellsBorderLine;
    points: readonly PreviewSegment[];
  }> = [
    { line: "top", points: [[x0, y0, x1, y0]] },
    { line: "bottom", points: [[x0, y1, x1, y1]] },
    { line: "left", points: [[x0, y0, x0, y1]] },
    { line: "right", points: [[x1, y0, x1, y1]] },
    ...(rows > 1
      ? [{ line: "insideHorizontal" as const, points: [[x0, ym, x1, ym] as const] }]
      : []),
    ...(columns > 1
      ? [{ line: "insideVertical" as const, points: [[xm, y0, xm, y1] as const] }]
      : []),
    {
      line: "diagonalUp",
      points: cells.map(({ cx0, cy0, cx1, cy1 }) => [cx0, cy1, cx1, cy0] as const),
    },
    {
      line: "diagonalDown",
      points: cells.map(({ cx0, cy0, cx1, cy1 }) => [cx0, cy0, cx1, cy1] as const),
    },
  ];
  const tick = 6;
  return (
    <svg
      className={dialogParts.well}
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      preserveAspectRatio="none"
      width="100%"
      height={PREVIEW_H}
      data-testid="format-cells-border-preview"
      style={{ background: "#ffffff" }}
    >
      {/* Excel's corner marks: where each line would run. */}
      <g stroke="#b8b8b8" strokeWidth={1}>
        {colEdges.map((x) =>
          rowEdges.map((y) => (
            <path
              key={`${x}:${y}`}
              d={`M${x - tick} ${y}H${x - 2}M${x + 2} ${y}H${x + tick}M${x} ${y - tick}V${y - 2}M${x} ${y + 2}V${y + tick}`}
            />
          )),
        )}
      </g>
      {cells.map(({ cx0, cy0, cx1, cy1 }) => (
        <text
          key={`${cx0}:${cy0}`}
          x={(cx0 + cx1) / 2}
          y={(cy0 + cy1) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fill="#595959"
        >
          {text}
        </text>
      ))}
      {segments.map(({ line, points }) =>
        points.map(([ax, ay, bx, by], index) => (
          <BorderStroke
            key={`${line}:${index}`}
            x1={ax}
            y1={ay}
            x2={bx}
            y2={by}
            value={lines[line].value}
            mixed={lines[line].mixed}
          />
        )),
      )}
      {/* The click targets, wider than the lines they toggle. */}
      {segments
        .filter(({ line }) => available(line))
        .map(({ line, points }) =>
          points.map(([ax, ay, bx, by], index) => (
            <line
              key={`hit:${line}:${index}`}
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke="transparent"
              strokeWidth={10}
              style={{ cursor: "pointer" }}
              onClick={() => onToggle(line)}
              data-testid={`format-cells-border-preview-${line}${index ? `-${index}` : ""}`}
            />
          )),
        )}
    </svg>
  );
}
