"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { ptToPx, pxToPt } from "@mrnote/core/web/lib/office-units.ts";
import {
  useId,
  useInsertionEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { officeLocaleUsesInches } from "@mrnote/core/web/lib/office-measurement-units.ts";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { enterKeepsNativeMeaning } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { OfficeDraftNumberInput } from "@mrnote/core/web/components/office-ribbon/OfficeDraftNumberInput.tsx";
import {
  officeDialogParts as dialogParts,
  spreadsheetDialogClassName,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import FormatCellsDialog, {
  type FormatCellsMixedFontField,
  type FormatCellsStyle,
} from "../FormatCellsDialog";
import {
  headerFooterRunCss,
  headerFooterStyledRuns,
  type HeaderFooterFormatField,
  type HeaderFooterFormatPatch,
  type HeaderFooterRunStyle,
} from "../../../../lib/spreadsheet/header-footer-rich-text";
import {
  HEADER_FOOTER_PICTURE_MARK,
  HEADER_FOOTER_TOKENS,
  headerFooterSectionRoom,
  PAPER_SIZE_NATIVE_IDS,
  resolveMargins,
  resolvePaperSizePoints,
  spreadsheetPaperSizeLabels,
  spreadsheetPaperSizeOptions,
  substituteHeaderFooterTokens,
  headerFooterTextHasPicture,
  type PrintHeaderFooter,
  type PrintHeaderFooterPicture,
  type PrintHeaderFooterRun,
  type PrintMargins,
  type PrintPaperSize,
  type PrintSettings,
  regionalDefaultPaperSize,
} from "@mrnote/core/web/lib/spreadsheet/print-settings.ts";

import SpreadsheetHeaderFooterSectionBox, {
  type HeaderFooterSectionBoxHandle,
} from "./SpreadsheetHeaderFooterSectionBox";
import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { withHeaderFooterPicture } from "./SpreadsheetHeaderFooterPicture";
import { SpreadsheetHeaderFooterPictureDialog } from "./SpreadsheetHeaderFooterPictureDialog";
import styles from "./SpreadsheetPageSetupDialog.module.css";
import { SpreadsheetCollapseDialogButton } from "./SpreadsheetRangePicker";
import type { SpreadsheetRangePick, SpreadsheetRangePickStyle } from "./useSpreadsheetRangePick";
import { SpreadsheetDialogIcon } from "@mrnote/core/web/components/notebook/contents/spreadsheet/SpreadsheetDialogIcon.tsx";

/**
 * Excel's Page Setup dialog (Page Layout ▸ Page Setup launcher; Microsoft
 * Support "Page Setup", "Set page margins before printing a worksheet",
 * "Print headings or titles on every page", "Headers and footers in a
 * worksheet"): four tabs over ONE draft of the sheet's print settings, applied
 * together on OK and dropped on Cancel/Escape.
 *
 * Presentation only. The window owns the draft (`draft` / `onDraftChange`),
 * validates it and writes it as one PAGE_SETUP.APPLY transaction; the
 * dialog never touches the workbook. Every tab panel stays mounted (hidden
 * when inactive) so a launcher can land on any field, and the inactive panels
 * keep their draft state without re-initialisation.
 *
 * Units follow Excel's regional rule: inches for US English, centimetres in
 * every other locale (`usesInches`). The model keeps points; conversion happens only on the edited
 * field, so untouched values round-trip byte-for-byte.
 */
export type SpreadsheetPageSetupTab =
  | "page"
  | "margins"
  | "headerFooter"
  | "sheet";

export const SPREADSHEET_PAGE_SETUP_TABS: readonly SpreadsheetPageSetupTab[] = [
  "page",
  "margins",
  "headerFooter",
  "sheet",
];

type HfBand =
  | "header"
  | "footer"
  | "evenHeader"
  | "evenFooter"
  | "firstHeader"
  | "firstFooter";
type HfSide = "left" | "center" | "right";
const HF_SIDES: readonly HfSide[] = ["left", "center", "right"];

const HF_BAND_TEST_ID: Record<HfBand, string> = {
  header: "header",
  footer: "footer",
  evenHeader: "even-header",
  evenFooter: "even-footer",
  firstHeader: "first-header",
  firstFooter: "first-footer",
};

/** The field codes Excel's custom header/footer buttons insert, in its order. */
const HF_CODE_BUTTONS = [
  { id: "page", token: HEADER_FOOTER_TOKENS.page },
  { id: "pages", token: HEADER_FOOTER_TOKENS.pages },
  { id: "date", token: HEADER_FOOTER_TOKENS.date },
  { id: "time", token: HEADER_FOOTER_TOKENS.time },
  { id: "path", token: HEADER_FOOTER_TOKENS.filePath },
  { id: "file", token: HEADER_FOOTER_TOKENS.fileName },
  { id: "tab", token: HEADER_FOOTER_TOKENS.sheetName },
] as const;

type HfPresetId =
  | "none"
  | "page"
  | "pageOfPages"
  | "sheet"
  | "confidential"
  | "file"
  | "sheetPage"
  | "filePage"
  | "pageSheet"
  | "pageFile";

const HF_PRESET_IDS: readonly HfPresetId[] = [
  "none",
  "page",
  "pageOfPages",
  "sheet",
  "confidential",
  "file",
  "sheetPage",
  "filePage",
  "pageSheet",
  "pageFile",
];

interface HfPresetTexts {
  page: string;
  pageOfPages: string;
  confidential: string;
}

type HfTriple = readonly [string, string, string];

/**
 * Excel's built-in header/footer list, as the three aligned sections it
 * writes: "Page 1" is centred; "Confidential, date, Page 1" spreads over the
 * left/centre/right sections; the "Sheet1, Page 1" family splits left/right.
 */
function hfPresetSections(id: HfPresetId, texts: HfPresetTexts): HfTriple {
  const { date, sheetName, fileName } = HEADER_FOOTER_TOKENS;
  switch (id) {
    case "none":
      return ["", "", ""];
    case "page":
      return ["", texts.page, ""];
    case "pageOfPages":
      return ["", texts.pageOfPages, ""];
    case "sheet":
      return ["", sheetName, ""];
    case "confidential":
      return [texts.confidential, date, texts.page];
    case "file":
      return ["", fileName, ""];
    case "sheetPage":
      return [sheetName, "", texts.page];
    case "filePage":
      return [fileName, "", texts.page];
    case "pageSheet":
      return [texts.page, "", sheetName];
    case "pageFile":
      return [texts.page, "", fileName];
  }
}

function bandTriple(band: PrintHeaderFooter | undefined): HfTriple {
  return [
    (band?.left ?? "").trim(),
    (band?.center ?? "").trim(),
    (band?.right ?? "").trim(),
  ];
}

/**
 * The Font dialog's draft for a run format (Excel's Format Text opens the
 * Format Cells Font tab on the selection): the dialog speaks CSS pixels and
 * one underline list, the run model points and two underline flags.
 */
function fontDraftFromRunStyle(style: HeaderFooterRunStyle): FormatCellsStyle {
  return {
    ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
    ...(style.fontSize ? { fontSize: ptToPx(style.fontSize) } : {}),
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline || style.doubleUnderline ? { underline: true } : {}),
    ...(style.doubleUnderline ? { underlineStyle: "double" as const } : {}),
    ...(style.strikethrough ? { strikethrough: true } : {}),
    ...(style.superscript ? { superscript: true } : {}),
    ...(style.subscript ? { subscript: true } : {}),
    ...(style.color ? { color: style.color } : {}),
  };
}

function fontMixedFields(
  mixed: readonly HeaderFooterFormatField[],
): FormatCellsMixedFontField[] {
  const out = new Set<FormatCellsMixedFontField>();
  for (const field of mixed) {
    if (field === "doubleUnderline" || field === "underline") out.add("underline");
    else if (field !== "color") out.add(field);
  }
  return [...out];
}

/** The run format change the Font dialog's touched fields spell. */
function runPatchFromFont(style: FormatCellsStyle): HeaderFooterFormatPatch {
  const has = (key: keyof FormatCellsStyle) =>
    Object.prototype.hasOwnProperty.call(style, key);
  const patch: HeaderFooterFormatPatch = {};
  if (has("fontFamily")) patch.fontFamily = style.fontFamily || undefined;
  if (has("fontSize")) {
    // Excel's &nn header/footer size is a whole number of points.
    patch.fontSize =
      typeof style.fontSize === "number" && Number.isFinite(style.fontSize)
        ? Math.max(1, Math.min(409, Math.round(pxToPt(style.fontSize))))
        : undefined;
  }
  for (const key of [
    "bold",
    "italic",
    "strikethrough",
    "superscript",
    "subscript",
  ] as const) {
    if (has(key)) patch[key] = style[key] === true || undefined;
  }
  if (has("underline") || has("underlineStyle")) {
    const on = style.underline === true;
    const double = on && style.underlineStyle === "double";
    patch.underline = on && !double ? true : undefined;
    patch.doubleUnderline = double ? true : undefined;
  }
  if (has("color")) patch.color = style.color || undefined;
  return patch;
}

/** Dialog-preview drawing of a run's point size (scaled down to fit the strip). */
const previewPointToPx = (points: number) => ptToPx(Math.min(points, 20)) * 0.85;

const POINTS_PER_INCH = 72;
const POINTS_PER_CM = 72 / 2.54;
/** Excel bounds every margin to 0–288 points (4 inches). */
const MAX_MARGIN_POINTS = 288;

interface MeasureUnit {
  readonly id: "in" | "cm";
  readonly pointsPer: number;
  readonly decimals: number;
  readonly step: number;
}

const INCH_UNIT: MeasureUnit = {
  id: "in",
  pointsPer: POINTS_PER_INCH,
  decimals: 2,
  step: 0.05,
};
const CM_UNIT: MeasureUnit = {
  id: "cm",
  pointsPer: POINTS_PER_CM,
  decimals: 1,
  step: 0.1,
};

/**
 * Excel shows margins in the region's measurement system: inches for US
 * English (this app's "en"; en-GB is a locale of its own), centimetres
 * everywhere else. Only the display unit follows it; margins stay in points.
 * The rule is shared with the Presentation editor (lib/office-measurement-units).
 */
const usesInches = officeLocaleUsesInches;

function formatMeasure(points: number, unit: MeasureUnit): string {
  const value = points / unit.pointsPer;
  const rounded = Number(value.toFixed(unit.decimals));
  return String(rounded);
}

function parseMeasure(text: string, unit: MeasureUnit): number | null {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  return value * unit.pointsPer;
}

/** Excel's tiny page-order pictures: four pages walked down-then-over or over-then-down. */
function PageOrderGlyph({ order }: { order: "downThenOver" | "overThenDown" }) {
  const pages: Array<[number, number]> =
    order === "downThenOver"
      ? [
          [2, 2],
          [2, 24],
          [24, 2],
          [24, 24],
        ]
      : [
          [2, 2],
          [24, 2],
          [2, 24],
          [24, 24],
        ];
  const path =
    order === "downThenOver"
      ? "M11 6 V32 M11 32 L33 12 M33 12 V38"
      : "M6 11 H38 M38 11 L10 31 M10 31 H38";
  return (
    <svg
      className={styles.pageOrderGlyph}
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      {pages.map(([x, y], index) => (
        <g key={index}>
          <rect x={x} y={y} width="18" height="18" />
          <text x={x + 3} y={y + 15}>
            {index + 1}
          </text>
        </g>
      ))}
      <path d={path} />
    </svg>
  );
}

/** Margins preview: the paper, dashed margin lines, and the printed block. */
function MarginPreview({
  draft,
  label,
}: {
  draft: PrintSettings;
  label: string;
}) {
  const paper = resolvePaperSizePoints(draft.paperSize);
  const landscape = draft.orientation === "landscape";
  const paperWidth = landscape ? Math.max(paper.width, paper.height) : Math.min(paper.width, paper.height);
  const paperHeight = landscape ? Math.min(paper.width, paper.height) : Math.max(paper.width, paper.height);
  const scale = 132 / Math.max(paperWidth, paperHeight);
  const width = paperWidth * scale;
  const height = paperHeight * scale;
  const margins = resolveMargins(draft.margins);
  const left = margins.left * scale;
  const right = margins.right * scale;
  const top = margins.top * scale;
  const bottom = margins.bottom * scale;
  const header = (draft.headerMargin ?? 21.6) * scale;
  const footer = (draft.footerMargin ?? 21.6) * scale;
  const innerWidth = Math.max(0, width - left - right);
  const innerHeight = Math.max(0, height - top - bottom);
  const blockWidth = innerWidth * 0.62;
  const blockHeight = innerHeight * 0.55;
  const blockX = left + (draft.centerHorizontally ? (innerWidth - blockWidth) / 2 : 0);
  const blockY = top + (draft.centerVertically ? (innerHeight - blockHeight) / 2 : 0);
  const pad = 6;
  return (
    <svg
      className={styles.marginPreview}
      width={width + pad * 2}
      height={height + pad * 2}
      viewBox={`0 0 ${width + pad * 2} ${height + pad * 2}`}
      role="img"
      aria-label={label}
      data-testid="spreadsheet-ps-margin-preview"
      data-center-horizontally={draft.centerHorizontally ? "true" : "false"}
      data-center-vertically={draft.centerVertically ? "true" : "false"}
    >
      <g transform={`translate(${pad} ${pad})`}>
        <rect className={styles.marginPreviewPage} x="0" y="0" width={width} height={height} />
        <line className={styles.marginPreviewLine} x1={left} y1="0" x2={left} y2={height} />
        <line className={styles.marginPreviewLine} x1={width - right} y1="0" x2={width - right} y2={height} />
        <line className={styles.marginPreviewLine} x1="0" y1={top} x2={width} y2={top} />
        <line className={styles.marginPreviewLine} x1="0" y1={height - bottom} x2={width} y2={height - bottom} />
        <line className={styles.marginPreviewLine} x1={left} y1={header} x2={width - right} y2={header} />
        <line className={styles.marginPreviewLine} x1={left} y1={height - footer} x2={width - right} y2={height - footer} />
        <rect
          className={styles.marginPreviewContent}
          x={blockX}
          y={blockY}
          width={blockWidth}
          height={blockHeight}
        />
      </g>
    </svg>
  );
}

export interface SpreadsheetPageSetupDialogProps {
  readonly tab: SpreadsheetPageSetupTab;
  readonly onTabChange: (tab: SpreadsheetPageSetupTab) => void;
  readonly draft: PrintSettings;
  readonly onDraftChange: (next: PrintSettings) => void;
  /** The validation message from the last OK attempt, or null. */
  readonly error: string | null;
  readonly sheetName: string;
  readonly fileName: string;
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly onCancel: () => void;
  /**
   * Authority attributes and state for OK (PAGE_SETUP.APPLY): the rendered
   * control identity plus `disabled`/`hidden`/`title` from the window's
   * visible-command state, spread onto the button as-is.
   */
  readonly applyProps: Record<string, string | boolean | undefined>;
  /** Same for Clear (PAGE_SETUP.CLEAR). */
  readonly clearProps: Record<string, string | boolean | undefined>;
  /**
   * Excel's Print… and Print Preview buttons (XLS-A069): each applies the
   * draft first, as OK does, then prints or shows the pages. Absent: no
   * button (an embedded workbook prints from its parent document).
   */
  readonly onPrint?: () => void;
  readonly onPrintPreview?: () => void;
  /** Why printing is unavailable here, shown on a disabled Print…. */
  readonly printUnavailableReason?: string;
  /**
   * The field the launcher aimed at (Custom Margins lands on Top, More Pages
   * on the page-width box). It receives `data-initial-focus` so the modal
   * dimmer's first-focus rule picks it; the window also focuses it explicitly.
   */
  readonly initialFocusTestId?: string;
  /**
   * Reads a file chosen with Insert Picture into a header/footer picture at
   * its original size, or null when it is not a picture the sheet takes (the
   * window says why). Absent: no Insert Picture button.
   */
  readonly readHeaderFooterPicture?: (file: File) => Promise<PrintHeaderFooterPicture | null>;
  /** The window's RefEdit: Print area and the print titles get a Collapse
   * Dialog button, as in Excel's Sheet tab. */
  readonly rangePick?: SpreadsheetRangePick;
}

export function SpreadsheetPageSetupDialog(
  props: SpreadsheetPageSetupDialogProps,
): React.JSX.Element {
  const {
    tab,
    onTabChange,
    draft,
    onDraftChange,
    error,
    sheetName,
    fileName,
    onApply,
    onClear,
    onCancel,
    applyProps,
    clearProps,
    initialFocusTestId,
    readHeaderFooterPicture,
    onPrint,
    onPrintPreview,
    printUnavailableReason,
    rangePick,
  } = props;
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  const unit = usesInches(locale) ? INCH_UNIT : CM_UNIT;
  const ids = useId();
  const [headerBand, setHeaderBand] = useState<HfBand>("header");
  const [footerBand, setFooterBand] = useState<HfBand>("footer");
  const sectionRefs = useRef<
    Partial<Record<string, HeaderFooterSectionBoxHandle | null>>
  >({});
  const activeSectionRef = useRef<Partial<Record<"header" | "footer", { band: HfBand; side: HfSide }>>>({});
  // Format Text's Font dialog, open on one section's selection.
  const [fontTarget, setFontTarget] = useState<{
    band: HfBand;
    side: HfSide;
    style: HeaderFooterRunStyle;
    mixed: HeaderFooterFormatField[];
  } | null>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  // Two edits in one event (a picture, then its &[Picture] code typed into
  // the section box) both build on the latest draft, not this render's.
  const draftRef = useRef(draft);
  useInsertionEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  // The section box a header or footer group's buttons act on, as state so
  // Format Picture follows the caret.
  const [activeSection, setActiveSection] = useState<
    Partial<Record<"header" | "footer", { band: HfBand; side: HfSide }>>
  >({});
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const pictureTargetRef = useRef<{ band: HfBand; side: HfSide; kind: "header" | "footer" } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{
    band: HfBand;
    side: HfSide;
    kind: "header" | "footer";
    picture: PrintHeaderFooterPicture;
  } | null>(null);
  const [formatPictureTarget, setFormatPictureTarget] = useState<{
    band: HfBand;
    side: HfSide;
    kind: "header" | "footer";
  } | null>(null);

  const patch =(next: Partial<PrintSettings>) => {
    const merged: PrintSettings = { ...draftRef.current, ...next };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete merged[key as keyof PrintSettings];
    }
    draftRef.current = merged;
    onDraftChange(merged);
  };
  const setFlag = (key: keyof PrintSettings, on: boolean) =>
    patch({ [key]: on ? true : undefined } as Partial<PrintSettings>);

  const isFocus = (testId: string) => initialFocusTestId === testId;

  // ── Page ────────────────────────────────────────────────────────────────
  const scaling = draft.scaling;
  const fitMode = scaling?.kind === "fitToWidth" || scaling?.kind === "fitToPages";
  const percent = scaling?.kind === "percent" ? scaling.percent : 100;
  const fitWidth =
    scaling?.kind === "fitToWidth"
      ? scaling.pages
      : scaling?.kind === "fitToPages"
        ? "pages" in scaling
          ? scaling.pages
          : scaling.widthPages
        : 1;
  const fitHeight =
    scaling?.kind === "fitToWidth"
      ? 0
      : scaling?.kind === "fitToPages"
        ? "pages" in scaling
          ? 1
          : scaling.heightPages
        : 1;
  const setFit = (widthPages: number, heightPages: number) =>
    patch({ scaling: { kind: "fitToPages", widthPages, heightPages } });
  const setPercent = (value: number) =>
    patch({ scaling: value === 100 ? undefined : { kind: "percent", percent: value } });
  const paperSize: PrintPaperSize = draft.paperSize ?? regionalDefaultPaperSize();
  const dpi = draft.printerResolution?.horizontalDpi ?? draft.printerResolution?.verticalDpi;

  // ── Margins ─────────────────────────────────────────────────────────────
  const margins = resolveMargins(draft.margins);
  const setMargin = (side: keyof PrintMargins, points: number) =>
    patch({
      margins: {
        ...margins,
        [side]: Math.max(0, Math.min(MAX_MARGIN_POINTS, points)),
      },
    });
  const measureProps = {
    format: (points: number) => formatMeasure(points, unit),
    parse: (text: string) => parseMeasure(text, unit),
    min: 0,
    max: Number((MAX_MARGIN_POINTS / unit.pointsPer).toFixed(unit.decimals)),
    step: unit.step,
  };
  const marginField = (
    side: keyof PrintMargins,
    testId: string,
    label: string,
  ) => (
    <label className={styles.marginField}>
      <span>{label}</span>
      <OfficeDraftNumberInput
        className={styles.number}
        {...measureProps}
        value={margins[side]}
        onCommit={(points) => {
          if (points !== null) setMargin(side, points);
        }}
        testId={testId}
        initialFocus={isFocus(testId)}
      />
    </label>
  );
  const distanceField = (
    key: "headerMargin" | "footerMargin",
    testId: string,
    label: string,
  ) => (
    <label className={styles.marginField}>
      <span>{label}</span>
      <OfficeDraftNumberInput
        className={styles.number}
        {...measureProps}
        value={draft[key] ?? 21.6}
        onCommit={(points) => {
          if (points !== null) {
            patch({ [key]: Math.max(0, Math.min(MAX_MARGIN_POINTS, points)) });
          }
        }}
        testId={testId}
      />
    </label>
  );

  // ── Header / footer ─────────────────────────────────────────────────────
  const presetTexts: HfPresetTexts = {
    page: t("spreadsheet.pageSetupDialog.hfText.page"),
    pageOfPages: t("spreadsheet.pageSetupDialog.hfText.pageOfPages"),
    confidential: t("spreadsheet.pageSetupDialog.hfText.confidential"),
  };
  const today = new Date();
  const previewContext = {
    pageNumber: 1,
    totalPages: 1,
    date: today.toLocaleDateString(locale),
    time: today.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    sheetName,
    fileName,
  };
  const previewText = (text: string, pictureMark = false) =>
    substituteHeaderFooterTokens(
      text.replace(/&\[pages\]/gi, "?"),
      previewContext,
      pictureMark ? { pictureMark: HEADER_FOOTER_PICTURE_MARK } : {},
    );
  const presetLabel = (id: HfPresetId): string => {
    const [left, center, right] = hfPresetSections(id, presetTexts).map((text) => previewText(text));
    if (id === "none") return t("spreadsheet.pageSetupDialog.hfPreset.none");
    return [left, center, right]
      .filter((part) => part !== "")
      .join(t("spreadsheet.pageSetupDialog.hfPresetSeparator"));
  };
  const matchedPreset = (band: PrintHeaderFooter | undefined): HfPresetId | "custom" => {
    const triple = bandTriple(band);
    for (const id of HF_PRESET_IDS) {
      const preset = hfPresetSections(id, presetTexts);
      if (preset.every((text, index) => text === triple[index])) return id;
    }
    return "custom";
  };
  const setBand = (band: HfBand, next: PrintHeaderFooter | undefined) =>
    patch({ [band]: next });
  // A section's text and its formatted runs change together, so the two
  // never disagree; the band is trimmed and normalized on OK.
  const setSection = (
    band: HfBand,
    side: HfSide,
    text: string,
    runs: PrintHeaderFooterRun[] | undefined,
  ) => {
    const current = draftRef.current[band];
    const next: PrintHeaderFooter = { ...current, [side]: text };
    const runsKey = `${side}Runs` as const;
    if (runs && runs.length > 0) next[runsKey] = runs;
    else delete next[runsKey];
    setBand(band, next);
  };
  const applyPreset = (band: HfBand, id: HfPresetId | "custom") => {
    if (id === "custom") return;
    const [left, center, right] = hfPresetSections(id, presetTexts);
    if (id === "none") {
      setBand(band, undefined);
      return;
    }
    const next: PrintHeaderFooter = {};
    if (left) next.left = left;
    if (center) next.center = center;
    if (right) next.right = right;
    setBand(band, next);
  };
  // The section a button acts on: the band's last-focused box (Excel keeps
  // the insertion point of the box you were in), the centre one otherwise.
  const activeSide = (kind: "header" | "footer", band: HfBand): HfSide => {
    const active = activeSectionRef.current[kind];
    return active?.band === band ? active.side : "center";
  };
  // Insert Picture (Excel's Custom Header button): the chosen picture goes
  // in at the caret of the section box as &[Picture]; a section holds one
  // picture, so one already there is replaced after Excel's question.
  const openInsertPicture = (kind: "header" | "footer", band: HfBand) => {
    pictureTargetRef.current = { kind, band, side: activeSide(kind, band) };
    const input = pictureInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };
  const placePicture = (
    target: { band: HfBand; side: HfSide; kind: "header" | "footer" },
    picture: PrintHeaderFooterPicture,
  ) => {
    const pictureKey = `${target.side}Picture` as const;
    const current = draftRef.current[target.band];
    setBand(target.band, { ...current, [pictureKey]: picture });
    const box = sectionRefs.current[`${target.band}-${target.side}`];
    if (!headerFooterTextHasPicture(current?.[target.side])) {
      box?.insert(HEADER_FOOTER_TOKENS.picture);
    }
    box?.focus();
  };
  const onPictureFile = async (file: File | null) => {
    const target = pictureTargetRef.current;
    pictureTargetRef.current = null;
    if (!file || !target || !readHeaderFooterPicture) return;
    const picture = await readHeaderFooterPicture(file);
    if (!picture) return;
    const current = draftRef.current[target.band];
    if (
      headerFooterTextHasPicture(current?.[target.side]) &&
      current?.[`${target.side}Picture` as const]
    ) {
      setReplaceTarget({ ...target, picture });
      return;
    }
    placePicture(target, picture);
  };
  const sectionPicture = (band: HfBand, side: HfSide): PrintHeaderFooterPicture | undefined => {
    const value = draft[band];
    return headerFooterTextHasPicture(value?.[side]) ? value?.[`${side}Picture` as const] : undefined;
  };
  const focusedSide = (kind: "header" | "footer", band: HfBand): HfSide => {
    const active = activeSection[kind];
    return active?.band === band ? active.side : "center";
  };
  const insertCode = (kind: "header" | "footer", band: HfBand, token: string) => {
    const box = sectionRefs.current[`${band}-${activeSide(kind, band)}`];
    if (!box) return;
    // The field goes in at the caret (over a selection), in the format of
    // the text it is typed into; a field that would not fit is not added.
    box.insert(token);
    box.focus();
  };
  const openFormatText = (kind: "header" | "footer", band: HfBand) => {
    const side = activeSide(kind, band);
    const box = sectionRefs.current[`${band}-${side}`];
    if (!box) return;
    const { style, mixed } = box.rangeFormat();
    setFontTarget({ band, side, style, mixed });
  };
  const closeFormatText = (patch: HeaderFooterFormatPatch | null) => {
    const target = fontTarget;
    setFontTarget(null);
    if (!target) return;
    const box = sectionRefs.current[`${target.band}-${target.side}`];
    if (!box) return;
    if (patch && Object.keys(patch).length > 0) box.format(patch);
    box.focus();
  };

  const bandsFor = (kind: "header" | "footer"): HfBand[] => {
    const odd: HfBand = kind;
    const even: HfBand = kind === "header" ? "evenHeader" : "evenFooter";
    const first: HfBand = kind === "header" ? "firstHeader" : "firstFooter";
    const bands: HfBand[] = [odd];
    if (draft.differentOddEven) bands.push(even);
    if (draft.differentFirstPage) bands.push(first);
    return bands;
  };
  const bandLabel = (band: HfBand): string => {
    switch (band) {
      case "header":
        return draft.differentOddEven
          ? t("spreadsheet.pageSetupDialog.hfBand.oddHeader")
          : t("spreadsheet.pageSetupDialog.hfBand.header");
      case "footer":
        return draft.differentOddEven
          ? t("spreadsheet.pageSetupDialog.hfBand.oddFooter")
          : t("spreadsheet.pageSetupDialog.hfBand.footer");
      case "evenHeader":
        return t("spreadsheet.pageSetupDialog.hfBand.evenHeader");
      case "evenFooter":
        return t("spreadsheet.pageSetupDialog.hfBand.evenFooter");
      case "firstHeader":
        return t("spreadsheet.pageSetupDialog.hfBand.firstHeader");
      case "firstFooter":
        return t("spreadsheet.pageSetupDialog.hfBand.firstFooter");
    }
  };

  const renderBandGroup = (kind: "header" | "footer") => {
    const bands = bandsFor(kind);
    const selected = kind === "header" ? headerBand : footerBand;
    const band: HfBand = bands.includes(selected) ? selected : kind;
    const setSelected = kind === "header" ? setHeaderBand : setFooterBand;
    const value = draft[band];
    const presetId = matchedPreset(value);
    const kindTestId = HF_BAND_TEST_ID[kind];
    const bandTestId = HF_BAND_TEST_ID[band];
    // The preview strip draws each section as it prints: fields filled in,
    // each run in its own format.
    const previewSection = (side: HfSide) => {
      const picture = sectionPicture(band, side);
      // The strip is one line tall: a picture is drawn to fit it.
      const pictureToPx = (points: number) =>
        ptToPx(points) *
        (picture ? Math.min(1, 22 / Math.max(1, ptToPx(picture.height))) : 1);
      let pictureShown = false;
      return headerFooterStyledRuns(value?.[side] ?? "", value?.[`${side}Runs` as const]).map(
        (run, index) => {
          let text = previewText(run.text, Boolean(picture) && !pictureShown);
          if (pictureShown) text = text.split(HEADER_FOOTER_PICTURE_MARK).join("");
          if (text.includes(HEADER_FOOTER_PICTURE_MARK)) pictureShown = true;
          return (
            <span
              // Runs are positional and may repeat text.
              key={index}
              data-hf-preview-run={index}
              style={headerFooterRunCss(run.style, { pointToPx: previewPointToPx })}
            >
              {withHeaderFooterPicture(
                text,
                picture,
                pictureToPx,
                `spreadsheet-ps-hf-preview-picture-${side}`,
              )}
            </span>
          );
        },
      );
    };
    return (
      <fieldset className={styles.group}>
        <legend>
          {kind === "header"
            ? t("spreadsheet.pageSetupHeader")
            : t("spreadsheet.pageSetupFooter")}
        </legend>
        <div
          className={styles.hfPreview}
          aria-hidden="true"
          data-testid={`spreadsheet-ps-${bandTestId}-preview`}
        >
          {HF_SIDES.map((side) => (
            <span key={side} data-hf-preview-section={side}>
              {previewSection(side)}
            </span>
          ))}
        </div>
        <div className={styles.row}>
          <select
            className={styles.select}
            value={presetId}
            aria-label={
              kind === "header"
                ? t("spreadsheet.pageSetupHeader")
                : t("spreadsheet.pageSetupFooter")
            }
            onChange={(event) =>
              applyPreset(band, event.target.value as HfPresetId | "custom")
            }
            data-testid={`spreadsheet-ps-${bandTestId}-preset`}
            style={{ flex: 1 }}
          >
            {presetId === "custom" ? (
              <option value="custom">
                {t("spreadsheet.pageSetupDialog.hfPreset.custom")}
              </option>
            ) : null}
            {HF_PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {presetLabel(id)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.row}>
          <span className={styles.muted}>
            {kind === "header"
              ? t("spreadsheet.pageSetupDialog.customHeader")
              : t("spreadsheet.pageSetupDialog.customFooter")}
          </span>
          {bands.length > 1 ? (
            <div className={styles.hfBands} role="group">
              {bands.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={dialogParts.compactButton}
                  aria-pressed={candidate === band}
                  onClick={() => setSelected(candidate)}
                  data-testid={`spreadsheet-ps-hf-band-${HF_BAND_TEST_ID[candidate]}`}
                >
                  {bandLabel(candidate)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {/* Excel's Custom Header buttons, in its order: Format Text, then
            the fields. A button keeps the box's selection (no focus steal on
            press), so it acts where the caret is. */}
        <div className={styles.hfCodes}>
          <button
            type="button"
            className={dialogParts.compactButton}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openFormatText(kind, band)}
            data-testid={`spreadsheet-ps-hf-format-text-${kindTestId}`}
          >
            {t("spreadsheet.pageSetupDialog.hfCode.formatText")}
          </button>
          {HF_CODE_BUTTONS.map(({ id, token }) => (
            <button
              key={id}
              type="button"
              className={dialogParts.compactButton}
              title={token}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertCode(kind, band, token)}
              data-testid={`spreadsheet-ps-hf-code-${id}-${kindTestId}`}
            >
              {t(`spreadsheet.pageSetupDialog.hfCode.${id}`)}
            </button>
          ))}
          {readHeaderFooterPicture ? (
            <>
              <button
                type="button"
                className={dialogParts.compactButton}
                title={HEADER_FOOTER_TOKENS.picture}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => openInsertPicture(kind, band)}
                data-testid={`spreadsheet-ps-hf-insert-picture-${kindTestId}`}
              >
                {t("spreadsheet.pageSetupDialog.hfCode.picture")}
              </button>
              <button
                type="button"
                className={dialogParts.compactButton}
                disabled={!sectionPicture(band, focusedSide(kind, band))}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  setFormatPictureTarget({ kind, band, side: focusedSide(kind, band) })
                }
                data-testid={`spreadsheet-ps-hf-format-picture-${kindTestId}`}
              >
                {t("spreadsheet.pageSetupDialog.hfCode.formatPicture")}
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.hfSections}>
          {HF_SIDES.map((side) => {
            const label = t(`spreadsheet.pageSetupDialog.hfSection.${side}`);
            return (
              <div key={side} className={styles.hfSection} data-align={side}>
                <span className={styles.muted} aria-hidden="true">
                  {label}
                </span>
                <SpreadsheetHeaderFooterSectionBox
                  // One box per band and section: switching the odd/even/first
                  // band shows that band's own text and caret.
                  key={`${band}-${side}`}
                  ref={(handle) => {
                    sectionRefs.current[`${band}-${side}`] = handle;
                  }}
                  className={styles.hfSectionBox}
                  text={value?.[side] ?? ""}
                  runs={value?.[`${side}Runs` as const]}
                  maxLength={headerFooterSectionRoom(value, side)}
                  ariaLabel={label}
                  onFocus={() => {
                    activeSectionRef.current[kind] = { band, side };
                    setActiveSection((current) =>
                      current[kind]?.band === band && current[kind]?.side === side
                        ? current
                        : { ...current, [kind]: { band, side } },
                    );
                  }}
                  onChange={(next) =>
                    setSection(band, side, next.text, next.runs)
                  }
                  testId={`spreadsheet-ps-${bandTestId}-${side}`}
                />
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  };

  // ── Frame ───────────────────────────────────────────────────────────────
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = SPREADSHEET_PAGE_SETUP_TABS.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? SPREADSHEET_PAGE_SETUP_TABS[(index + 1) % SPREADSHEET_PAGE_SETUP_TABS.length]
        : event.key === "ArrowLeft"
          ? SPREADSHEET_PAGE_SETUP_TABS[
              (index - 1 + SPREADSHEET_PAGE_SETUP_TABS.length) %
                SPREADSHEET_PAGE_SETUP_TABS.length
            ]
          : event.key === "Home"
            ? SPREADSHEET_PAGE_SETUP_TABS[0]
            : event.key === "End"
              ? SPREADSHEET_PAGE_SETUP_TABS[SPREADSHEET_PAGE_SETUP_TABS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    onTabChange(next);
    const strip = event.currentTarget.parentElement;
    const target = strip?.querySelector<HTMLButtonElement>(
      `[data-testid="spreadsheet-ps-tab-${next}"]`,
    );
    target?.focus();
  };
  const tabLabel: Record<SpreadsheetPageSetupTab, string> = {
    page: t("spreadsheet.pageSetupDialog.tabPage"),
    margins: t("spreadsheet.pageSetupDialog.tabMargins"),
    headerFooter: t("spreadsheet.pageSetupDialog.tabHeaderFooter"),
    sheet: t("spreadsheet.pageSetupDialog.tabSheet"),
  };
  const panel = (id: SpreadsheetPageSetupTab, children: ReactNode) => (
    <div
      role="tabpanel"
      id={`${ids}-panel-${id}`}
      aria-labelledby={`${ids}-tab-${id}`}
      className={styles.panel}
      hidden={tab !== id}
      data-testid={`spreadsheet-ps-panel-${id}`}
    >
      {children}
    </div>
  );

  // Format Text's Font dialog sits beside the Page Setup dialog, not inside
  // it, so its Escape and Enter close the Font dialog alone.
  // Excel's Sheet tab writes a picked print area as $A$1:$F$40, rows to
  // repeat as $1:$2 and columns as $A:$B.
  const pickButton = (
    id: "print-area" | "repeat-rows" | "repeat-cols",
    style: SpreadsheetRangePickStyle,
    label: string,
    key: "printArea" | "repeatTitleRows" | "repeatTitleCols",
  ) =>
    rangePick ? (
      <SpreadsheetCollapseDialogButton
        label={t("spreadsheet.cfDialog.collapse")}
        onClick={() =>
          rangePick.start({
            id: `spreadsheet-ps-${id}`,
            dialogLabel: t("spreadsheet.pageSetupMenu"),
            inputLabel: label,
            style,
            value: draftRef.current[key] ?? "",
            onChange: (text) => patch({ [key]: text === "" ? undefined : text }),
          })
        }
        testId={`spreadsheet-ps-${id}-pick`}
      />
    ) : null;

  const fontDialog = fontTarget ? (
    <FormatCellsDialog
      fontOnly
      title={t("spreadsheet.fmtTabFont")}
      themeBindingEnabled={false}
      previewValue={null}
      currentFormat={undefined}
      currentAlignment={fontDraftFromRunStyle(fontTarget.style)}
      mixedFontFields={fontMixedFields(fontTarget.mixed)}
      onConfirm={(result) => closeFormatText(runPatchFromFont(result.style))}
      onCancel={() => closeFormatText(null)}
    />
  ) : null;

  // Collapsed to the RefEdit bar while one of its ranges is picked.
  if (rangePick?.picking("spreadsheet-ps-")) return <></>;
  return (
    <>
    <div
      className={`${spreadsheetDialogClassName()} ${styles.dialog}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("spreadsheet.pageSetupMenu")}
      data-control-id="XLSCTL.PAGE_LAYOUT.PAGE_SETUP.DIALOG"
      data-testid="spreadsheet-page-setup-dialog"
      data-page-setup-tab={tab}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          return;
        }
        // Enter in a box is OK, as in Excel's dialog; buttons, lists and
        // tabs keep their own Enter.
        if (
          event.key === "Enter" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.nativeEvent.keyCode !== 229 &&
          !enterKeepsNativeMeaning(event.target)
        ) {
          event.preventDefault();
          applyButtonRef.current?.click();
        }
      }}
    >
      <div className={dialogParts.header}>
        <strong className={dialogParts.title}>{t("spreadsheet.pageSetupMenu")}</strong>
        <button
          type="button"
          className={dialogParts.close}
          onClick={onCancel}
          aria-label={t("common.close")}
          data-testid="spreadsheet-ps-close"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div
        className={dialogParts.tabs}
        role="tablist"
        aria-label={t("spreadsheet.pageSetupMenu")}
      >
        {SPREADSHEET_PAGE_SETUP_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${ids}-tab-${id}`}
            aria-controls={`${ids}-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={dialogParts.tab}
            onClick={() => onTabChange(id)}
            onKeyDown={onTabKeyDown}
            data-testid={`spreadsheet-ps-tab-${id}`}
          >
            {tabLabel[id]}
          </button>
        ))}
      </div>

      {panel(
        "page",
        <>
          <fieldset className={styles.group}>
            <legend>{t("spreadsheet.pageSetupOrientation")}</legend>
            <div
              className={styles.row}
              role="radiogroup"
              aria-label={t("spreadsheet.pageSetupOrientation")}
              data-testid="spreadsheet-ps-orientation"
            >
              {(["portrait", "landscape"] as const).map((orientation) => (
                <label key={orientation} className={styles.radio}>
                  <input
                    type="radio"
                    name={`${ids}-orientation`}
                    value={orientation}
                    checked={(draft.orientation ?? "portrait") === orientation}
                    onChange={() => patch({ orientation })}
                    data-initial-focus={
                      isFocus("spreadsheet-ps-orientation") &&
                      (draft.orientation ?? "portrait") === orientation
                        ? ""
                        : undefined
                    }
                    data-testid={`spreadsheet-ps-orientation-${orientation}`}
                  />
                  <SpreadsheetDialogIcon
                    name={orientation === "portrait" ? "orientationPortrait" : "orientationLandscape"}
                  />
                  {orientation === "portrait"
                    ? t("spreadsheet.pageSetupPortrait")
                    : t("spreadsheet.pageSetupLandscape")}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>{t("spreadsheet.pageSetupScaling")}</legend>
            <div
              role="radiogroup"
              aria-label={t("spreadsheet.pageSetupScaling")}
              data-testid="spreadsheet-ps-scaling-kind"
              data-scaling-mode={fitMode ? "fit" : "percent"}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div className={styles.row}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name={`${ids}-scaling`}
                    value="percent"
                    checked={!fitMode}
                    onChange={() => setPercent(percent)}
                    data-initial-focus={
                      isFocus("spreadsheet-ps-scaling-kind") ? "" : undefined
                    }
                    data-testid="spreadsheet-ps-scaling-percent-mode"
                  />
                  {t("spreadsheet.pageSetupDialog.adjustTo")}
                </label>
                <OfficeDraftNumberInput
                  className={styles.number}
                  value={percent}
                  onCommit={(value) => {
                    if (value !== null) setPercent(Math.trunc(value));
                  }}
                  format={String}
                  parse={(text) => {
                    const value = Number.parseInt(text, 10);
                    return Number.isFinite(value) ? value : null;
                  }}
                  min={10}
                  max={400}
                  step={1}
                  disabled={fitMode}
                  ariaLabel={t("spreadsheet.pageSetupScalePercent")}
                  testId="spreadsheet-ps-scaling-percent"
                />
                <span>{t("spreadsheet.pageSetupDialog.percentNormalSize")}</span>
              </div>
              <div className={styles.row}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name={`${ids}-scaling`}
                    value="fit"
                    checked={fitMode}
                    onChange={() => setFit(fitWidth, fitHeight)}
                    data-testid="spreadsheet-ps-scaling-fit"
                  />
                  {t("spreadsheet.pageSetupDialog.fitTo")}
                </label>
                <OfficeDraftNumberInput
                  className={styles.number}
                  value={fitWidth === 0 ? null : fitWidth}
                  onCommit={(value) => setFit(Math.max(0, Math.trunc(value ?? 0)), fitHeight)}
                  format={String}
                  parse={(text) => {
                    const value = Number.parseInt(text, 10);
                    return Number.isFinite(value) ? value : null;
                  }}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!fitMode}
                  placeholder={t("spreadsheet.formulas.calculationAutomatic")}
                  ariaLabel={t("spreadsheet.pageSetupDialog.pagesWide")}
                  initialFocus={isFocus("spreadsheet-ps-scaling-width-pages")}
                  testId="spreadsheet-ps-scaling-width-pages"
                />
                <span>{t("spreadsheet.pageSetupDialog.pagesWide")}</span>
                <OfficeDraftNumberInput
                  className={styles.number}
                  value={fitHeight === 0 ? null : fitHeight}
                  onCommit={(value) => setFit(fitWidth, Math.max(0, Math.trunc(value ?? 0)))}
                  format={String}
                  parse={(text) => {
                    const value = Number.parseInt(text, 10);
                    return Number.isFinite(value) ? value : null;
                  }}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!fitMode}
                  placeholder={t("spreadsheet.formulas.calculationAutomatic")}
                  ariaLabel={t("spreadsheet.pageSetupDialog.pagesTall")}
                  initialFocus={isFocus("spreadsheet-ps-scaling-height-pages")}
                  testId="spreadsheet-ps-scaling-height-pages"
                />
                <span>{t("spreadsheet.pageSetupDialog.pagesTall")}</span>
              </div>
            </div>
          </fieldset>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor={`${ids}-paper-size`}>
              {t("spreadsheet.pageSetupDialog.paperSize")}
            </label>
            <select
              id={`${ids}-paper-size`}
              className={styles.select}
              value={paperSize}
              onChange={(event) => {
                const next = event.target.value as PrintPaperSize;
                patch({
                  paperSize: next,
                  paperSizeNativeId: PAPER_SIZE_NATIVE_IDS[next],
                });
              }}
              data-initial-focus={
                isFocus("spreadsheet-ps-paper-size") ? "" : undefined
              }
              data-testid="spreadsheet-ps-paper-size"
              style={{ flex: 1 }}
            >
              {spreadsheetPaperSizeOptions(paperSize).map(({ id }) => (
                <option key={id} value={id}>
                  {spreadsheetPaperSizeLabels(id, t).title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>
              {t("spreadsheet.pageSetupDialog.printQuality")}
            </span>
            <select
              className={styles.select}
              value="current"
              disabled
              aria-label={t("spreadsheet.pageSetupDialog.printQuality")}
              onChange={() => undefined}
              data-testid="spreadsheet-ps-print-quality"
              style={{ flex: 1 }}
            >
              <option value="current">
                {dpi
                  ? t("spreadsheet.pageSetupDialog.dpi", { dpi })
                  : t("spreadsheet.pageSetupDialog.printQualityDefault")}
              </option>
            </select>
          </div>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor={`${ids}-first-page`}>
              {t("spreadsheet.pageSetupDialog.firstPageNumber")}
            </label>
            <OfficeDraftNumberInput
              className={styles.number}
              id={`${ids}-first-page`}
              value={draft.firstPageNumber ?? null}
              onCommit={(value) =>
                patch({
                  firstPageNumber:
                    value === null ? undefined : Math.trunc(value),
                })
              }
              format={String}
              parse={(text) => {
                const value = Number.parseInt(text, 10);
                return Number.isFinite(value) ? value : null;
              }}
              min={0}
              max={32767}
              step={1}
              placeholder={t("spreadsheet.pageSetupDialog.firstPageAuto")}
              testId="spreadsheet-ps-first-page-number"
            />
          </div>
        </>,
      )}

      {panel(
        "margins",
        <>
          <div className={styles.marginsGrid}>
            {marginField("top", "spreadsheet-ps-margin-top", t("spreadsheet.pageSetupDialog.marginTop"))}
            {distanceField("headerMargin", "spreadsheet-ps-margin-header", t("spreadsheet.pageSetupDialog.marginHeader"))}
            <span />
            {marginField("left", "spreadsheet-ps-margin-left", t("spreadsheet.pageSetupDialog.marginLeft"))}
            <MarginPreview draft={draft} label={t("spreadsheet.pageSetupDialog.previewLabel")} />
            {marginField("right", "spreadsheet-ps-margin-right", t("spreadsheet.pageSetupDialog.marginRight"))}
            {marginField("bottom", "spreadsheet-ps-margin-bottom", t("spreadsheet.pageSetupDialog.marginBottom"))}
            {distanceField("footerMargin", "spreadsheet-ps-margin-footer", t("spreadsheet.pageSetupDialog.marginFooter"))}
            <span />
          </div>
          <span className={styles.muted} data-testid="spreadsheet-ps-margin-unit" data-unit={unit.id}>
            {t(
              unit.id === "cm"
                ? "spreadsheet.pageSetupDialog.unitCentimeters"
                : "spreadsheet.pageSetupDialog.unitInches",
            )}
          </span>
          <fieldset className={styles.group}>
            <legend>{t("spreadsheet.pageSetupDialog.centerOnPage")}</legend>
            <div className={styles.row}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.centerHorizontally === true}
                  onChange={(event) => setFlag("centerHorizontally", event.target.checked)}
                  data-testid="spreadsheet-ps-center-horizontally"
                />
                {t("spreadsheet.pageSetupDialog.centerHorizontally")}
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.centerVertically === true}
                  onChange={(event) => setFlag("centerVertically", event.target.checked)}
                  data-testid="spreadsheet-ps-center-vertically"
                />
                {t("spreadsheet.pageSetupDialog.centerVertically")}
              </label>
            </div>
          </fieldset>
        </>,
      )}

      {panel(
        "headerFooter",
        <>
          {renderBandGroup("header")}
          {renderBandGroup("footer")}
          <div className={styles.checks}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.differentOddEven === true}
                onChange={(event) => setFlag("differentOddEven", event.target.checked)}
                data-testid="spreadsheet-ps-different-odd-even"
              />
              {t("spreadsheet.pageSetupDialog.differentOddEven")}
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.differentFirstPage === true}
                onChange={(event) => setFlag("differentFirstPage", event.target.checked)}
                data-testid="spreadsheet-ps-different-first"
              />
              {t("spreadsheet.pageSetupDialog.differentFirstPage")}
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.headerFooterScaleWithDoc !== false}
                onChange={(event) =>
                  patch({
                    headerFooterScaleWithDoc: event.target.checked ? undefined : false,
                  })
                }
                data-testid="spreadsheet-ps-scale-with-doc"
              />
              {t("spreadsheet.pageSetupDialog.scaleWithDoc")}
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={draft.headerFooterAlignWithMargins !== false}
                onChange={(event) =>
                  patch({
                    headerFooterAlignWithMargins: event.target.checked ? undefined : false,
                  })
                }
                data-testid="spreadsheet-ps-align-with-margins"
              />
              {t("spreadsheet.pageSetupDialog.alignWithMargins")}
            </label>
          </div>
        </>,
      )}

      {panel(
        "sheet",
        <>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor={`${ids}-print-area`}>
              {t("spreadsheet.pageSetupPrintArea")}
            </label>
            <input
              id={`${ids}-print-area`}
              className={styles.text}
              value={draft.printArea ?? ""}
              placeholder="A1:F40"
              onChange={(event) =>
                patch({ printArea: event.target.value === "" ? undefined : event.target.value })
              }
              data-initial-focus={
                isFocus("spreadsheet-ps-print-area") ? "" : undefined
              }
              data-testid="spreadsheet-ps-print-area"
            />
            {pickButton("print-area", "absolute", t("spreadsheet.pageSetupPrintArea"), "printArea")}
          </div>
          <fieldset className={styles.group}>
            <legend>{t("spreadsheet.pageSetupDialog.printTitles")}</legend>
            <div className={styles.row}>
              <label className={styles.rowLabel} htmlFor={`${ids}-repeat-rows`} style={{ minWidth: 168 }}>
                {t("spreadsheet.pageSetupDialog.rowsToRepeat")}
              </label>
              <input
                id={`${ids}-repeat-rows`}
                className={styles.text}
                value={draft.repeatTitleRows ?? ""}
                placeholder="$1:$2"
                onChange={(event) =>
                  patch({
                    repeatTitleRows:
                      event.target.value === "" ? undefined : event.target.value,
                  })
                }
                data-initial-focus={
                  isFocus("spreadsheet-ps-repeat-rows") ? "" : undefined
                }
                data-testid="spreadsheet-ps-repeat-rows"
              />
              {pickButton("repeat-rows", "rows", t("spreadsheet.pageSetupDialog.rowsToRepeat"), "repeatTitleRows")}
            </div>
            <div className={styles.row}>
              <label className={styles.rowLabel} htmlFor={`${ids}-repeat-cols`} style={{ minWidth: 168 }}>
                {t("spreadsheet.pageSetupDialog.colsToRepeat")}
              </label>
              <input
                id={`${ids}-repeat-cols`}
                className={styles.text}
                value={draft.repeatTitleCols ?? ""}
                placeholder="$A:$B"
                onChange={(event) =>
                  patch({
                    repeatTitleCols:
                      event.target.value === "" ? undefined : event.target.value,
                  })
                }
                data-testid="spreadsheet-ps-repeat-cols"
              />
              {pickButton("repeat-cols", "columns", t("spreadsheet.pageSetupDialog.colsToRepeat"), "repeatTitleCols")}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>{t("toolbar.print")}</legend>
            <div className={styles.checks}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.showGridlines === true}
                  onChange={(event) => setFlag("showGridlines", event.target.checked)}
                  data-testid="spreadsheet-ps-gridlines"
                />
                {t("spreadsheet.pageSetupDialog.gridlines")}
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.blackAndWhite === true}
                  onChange={(event) => setFlag("blackAndWhite", event.target.checked)}
                  data-testid="spreadsheet-ps-black-and-white"
                />
                {t("spreadsheet.pageSetupDialog.blackAndWhite")}
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.draft === true}
                  onChange={(event) => setFlag("draft", event.target.checked)}
                  data-testid="spreadsheet-ps-draft"
                />
                {t("spreadsheet.pageSetupDialog.draftQuality")}
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.showHeadings === true}
                  onChange={(event) => setFlag("showHeadings", event.target.checked)}
                  data-testid="spreadsheet-ps-headings"
                />
                {t("spreadsheet.pageSetupDialog.rowColHeadings")}
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.rowLabel} htmlFor={`${ids}-comments`} style={{ minWidth: 168 }}>
                {t("spreadsheet.pageSetupDialog.comments")}
              </label>
              <select
                id={`${ids}-comments`}
                className={styles.select}
                value={draft.printCellComments ?? "none"}
                onChange={(event) =>
                  patch({
                    printCellComments:
                      event.target.value === "atEnd" || event.target.value === "asDisplayed"
                        ? event.target.value
                        : undefined,
                  })
                }
                data-testid="spreadsheet-ps-comments"
              >
                <option value="none">{t("spreadsheet.pageSetupDialog.commentsNone")}</option>
                <option value="atEnd">{t("spreadsheet.pageSetupDialog.commentsAtEnd")}</option>
                <option value="asDisplayed">{t("spreadsheet.pageSetupDialog.commentsAsDisplayed")}</option>
              </select>
            </div>
            <div className={styles.row}>
              <label className={styles.rowLabel} htmlFor={`${ids}-errors`} style={{ minWidth: 168 }}>
                {t("spreadsheet.pageSetupDialog.cellErrorsAs")}
              </label>
              <select
                id={`${ids}-errors`}
                className={styles.select}
                value={draft.printErrorsAs ?? "displayed"}
                onChange={(event) =>
                  patch({
                    printErrorsAs:
                      event.target.value === "blank" ||
                      event.target.value === "dash" ||
                      event.target.value === "na"
                        ? event.target.value
                        : undefined,
                  })
                }
                data-testid="spreadsheet-ps-errors"
              >
                <option value="displayed">{t("spreadsheet.pageSetupDialog.errorsDisplayed")}</option>
                <option value="blank">{t("spreadsheet.pageSetupDialog.errorsBlank")}</option>
                <option value="dash">--</option>
                <option value="na">#N/A</option>
              </select>
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>{t("spreadsheet.pageSetupDialog.pageOrder")}</legend>
            <div
              className={styles.pageOrder}
              role="radiogroup"
              aria-label={t("spreadsheet.pageSetupDialog.pageOrder")}
            >
              {(["downThenOver", "overThenDown"] as const).map((order) => (
                <label key={order} className={styles.radio}>
                  <input
                    type="radio"
                    name={`${ids}-page-order`}
                    value={order}
                    checked={(draft.pageOrder ?? "downThenOver") === order}
                    onChange={() =>
                      patch({ pageOrder: order === "overThenDown" ? "overThenDown" : undefined })
                    }
                    data-testid={`spreadsheet-ps-page-order-${order}`}
                  />
                  {t(`spreadsheet.pageSetupDialog.${order}`)}
                  <PageOrderGlyph order={order} />
                </label>
              ))}
            </div>
          </fieldset>
        </>,
      )}

      {error ? (
        <span className={dialogParts.error} role="alert" data-testid="spreadsheet-ps-error">
          {error}
        </span>
      ) : null}

      {/* Clear, Print… and Print Preview on the left; Cancel, then OK last,
          as in every command dialog's footer. */}
      <div className={dialogParts.footer}>
        <span
          className={dialogParts.footerStart}
          style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}
        >
        <button
          {...clearProps}
          type="button"
          className={dialogParts.button}
          onClick={onClear}
          data-testid="spreadsheet-ps-clear"
        >
          <SpreadsheetDialogIcon name="clear" />
          {t("spreadsheet.pageSetupClear")}
        </button>
        {/* Excel's Print… and Print Preview (XLS-A069), each applying the
            draft first. */}
        {onPrint ? (
          <button
            type="button"
            className={dialogParts.button}
            onClick={onPrint}
            disabled={Boolean(printUnavailableReason)}
            title={printUnavailableReason}
            data-testid="spreadsheet-ps-print"
          >
            <SpreadsheetDialogIcon name="print" />
            {t("spreadsheet.pageSetupPrint")}
          </button>
        ) : null}
        {onPrintPreview ? (
          <button
            type="button"
            className={dialogParts.button}
            onClick={onPrintPreview}
            data-testid="spreadsheet-ps-print-preview"
          >
            <SpreadsheetDialogIcon name="printPreview" />
            {t("spreadsheet.pageSetupPrintPreview")}
          </button>
        ) : null}
        </span>
        <button
          type="button"
          className={dialogParts.button}
          onClick={onCancel}
          data-testid="spreadsheet-ps-cancel"
        >
          {t("common.cancel")}
        </button>
        <button
          {...applyProps}
          ref={applyButtonRef}
          type="button"
          className={dialogParts.primaryButton}
          onClick={onApply}
          data-testid="spreadsheet-ps-apply"
        >
          {t("spreadsheet.fmtOk")}
        </button>
      </div>
    </div>
    {fontDialog}
    <input
      ref={pictureInputRef}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
      hidden
      aria-hidden="true"
      tabIndex={-1}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0] ?? null;
        event.currentTarget.value = "";
        void onPictureFile(file);
      }}
      data-testid="spreadsheet-ps-hf-picture-input"
    />
    <OfficeDialogShell
      open={replaceTarget !== null}
      title={t("spreadsheet.pageSetupDialog.hfPicture.replaceTitle")}
      description={
        replaceTarget?.kind === "footer"
          ? t("spreadsheet.pageSetupDialog.hfPicture.replaceFooter")
          : t("spreadsheet.pageSetupDialog.hfPicture.replaceHeader")
      }
      defaultActionLabel={t("spreadsheet.pageSetupDialog.hfPicture.replace")}
      cancelActionLabel={t("common.cancel")}
      onDefaultAction={() => {
        const target = replaceTarget;
        setReplaceTarget(null);
        if (target) placePicture(target, target.picture);
      }}
      onCancel={() => setReplaceTarget(null)}
      testIdPrefix="spreadsheet-ps-hf-replace-picture"
    />
    {formatPictureTarget && sectionPicture(formatPictureTarget.band, formatPictureTarget.side) ? (
      <SpreadsheetHeaderFooterPictureDialog
        open
        picture={sectionPicture(formatPictureTarget.band, formatPictureTarget.side)!}
        unit={unit.id}
        onConfirm={(next) => {
          const target = formatPictureTarget;
          setFormatPictureTarget(null);
          const current = draftRef.current[target.band];
          setBand(target.band, { ...current, [`${target.side}Picture` as const]: next });
        }}
        onCancel={() => setFormatPictureTarget(null)}
      />
    ) : null}
    </>
  );
}

export default SpreadsheetPageSetupDialog;
