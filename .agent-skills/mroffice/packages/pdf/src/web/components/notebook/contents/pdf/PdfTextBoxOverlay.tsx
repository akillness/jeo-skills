"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { holdOfficeTextBoxForChrome } from "@mrnote/core/web/lib/office-inactive-selection.ts";
import { officeCaretFontScale, setOfficeCaretFontScale } from "@mrnote/core/web/lib/office-painted-caret.ts";
import type { PdfTextBoxTabStop, PdfTextBoxTypographyFields } from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import {
  applyPdfTextBoxBarRules,
  applyPdfTextBoxTabStops,
  PDF_TEXT_BOX_BARS_ATTR,
  PDF_TEXT_BOX_TAB_ATTR,
  pdfTextBoxDefaultTabStop,
  pdfTextBoxTabStopsPx,
} from "../../../../lib/pdf/text-box-tabs";
import { characterBoundaryIndexes, textOffsetFromCharacterRects } from "../../../../lib/pdf/text-caret";
import { pdfRangeGlyphRect } from "../../../../lib/pdf/range-glyph-rect";

import { chainForBox, inferBoxChains } from "../../../../lib/pdf/box-chain";
import { joinBoxTexts } from "../../../../lib/pdf/box-reflow";
import {
  reflowChainStyled,
  type StyledReflowBox,
} from "../../../../lib/pdf/styled-reflow";
import {
  compileFormulaFunction,
  computeFormulaValue,
  samplePlotSegments,
} from "../../../../lib/pdf/formula-compute";
import { normalizeBoxAngle, rotatePointAround, rotatedBoundingBox } from "@mrnote/core/web/lib/pdf/rotated-box.ts";
import { pointerRetainsPdfObjectSelection } from "../../../../lib/pdf/object-selection-retain";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent as ReactCompositionEvent,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import "katex/dist/katex.min.css";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { applyPdfTextList, pdfTextListKindOf, pdfTextListMarkerWidth, type PdfTextListStyle } from "../../../../lib/pdf/text-list";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Italic,
  RotateCcw,
  RotateCw,
  Sigma,
  Trash2,
  Type,
  Underline,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeRibbonNumberField } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonNumberField.tsx";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import type { TextBox } from "../../../../lib/pdf/text-boxes";
import { pdfTextBoxDrawnOrderIs, pdfTextBoxesInDrawnOrder } from "../../../../lib/pdf/text-box-drawn-order";
import {
  normalizePdfTextLineLayout,
  reconcilePdfTextLineLayout,
  type PdfTextLineLayout,
} from "@mrnote/core/web/lib/pdf/text-line-layout.ts";
import { pdfTextBoxLaneWrites, type NativePdfFreeTextAnnotationSource } from "../../../../lib/pdf/native-free-text-annotations";
import {
  fallbackTextFromPdfFormulaLatex,
  latexForPdfFormulaTextEdit,
  latexFromPdfFormulaText,
  normalizePdfFormulaLatexSource,
  preservePdfFormulaLatexForTextEdit,
} from "@mrnote/core/web/lib/pdf/formula-latex.ts";
import {
  pdfFormulaBoxDrawsLatex,
  pdfFormulaLatexValidationError as formulaLatexValidationError,
  pdfFormulaBoxRect,
  pdfFormulaPreviewRectPx,
} from "@mrnote/core/web/lib/pdf/formula-render.ts";
import {
  applyPdfFormulaSourceTemplate,
  type PdfFormulaSourceTemplate,
} from "../../../../lib/pdf/formula-source-edit";
import {
  effectiveTextBoxKind,
  latexForTextBoxKind,
} from "@mrnote/core/web/lib/pdf/text-box-kind.ts";
import {
  CJK_SANS_STACK,
  CJK_SERIF_STACK,
  FONT_STACK,
  pdfDisplayFontFamily,
  fontFamilyForPdfText,
  withEastAsianFallback,
  resolvePdfFontFamily,
  EAST_ASIAN_FALLBACK_FAMILY,
} from "../../../../lib/pdf/font-resolve";
import { ensurePdfEastAsianFace } from "../../../../lib/pdf/east-asian-face";
import { TEXTBOX_FONT_FAMILY_OPTIONS, type TextBoxFontFamilyOption } from "../../../../lib/pdf/text-box-font-options";
import {
  notePdfTextBoxEditGiven,
  pdfTextBoxEditsWithAhead,
  settlePdfTextBoxEditsAhead,
  type PdfTextBoxEditsAhead,
} from "../../../../lib/pdf/text-box-edits-ahead";
import { pdfTextBoxOfficeFamily, pdfTextBoxRunCssFamily } from "../../../../lib/pdf/text-box-runs";
import { classifyFontName } from "../../../../lib/pdf/font-resolve";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { usePdfPageFontsInWindow } from "./window/usePdfPageFonts";
import { pdfPageFontDisplayFamily } from "../../../../lib/pdf/page-fonts";
import { isSafeCssColor } from "@mrnote/core/web/lib/pdf/safe-color.ts";
import {
  PDF_TEXT_BOX_MAX_COLUMNS,
  PDF_TEXT_DEFAULT_HIGHLIGHT,
  pdfTextBoxTextPaint,
  hasPdfTextBoxTypography,
  pdfTextBoxColumnWidth,
  pdfTextBoxHorizontalScaleFrame,
  pdfTextBoxTypographyStyle,
  pdfCreatedTextBoxNeedsTextBoxWriter,
  pdfTextBoxParagraphRanges,
  pdfTextBoxParagraphSpacingPx,
  readPdfTextBoxTypography,
} from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import {
  normalizePdfTextStyleRuns,
  patchPdfTextStyleRuns,
  patchPdfTextStyleRunsRange,
  persistablePdfTextStyleRuns,
  reconcilePdfTextStyleRuns,
  type PdfTextStyleRun,
} from "@mrnote/core/web/lib/pdf/text-style-runs.ts";
import { PDF_TEXTBOX_LINE_HEIGHT_RATIO } from "../../../../lib/pdf/text-run-layout";
import {
  BOX_RECT_EPSILON,
  boxRectContains,
  clampCoverToNeighbors,
  coverRectForEdit,
  expandRectForGlyphCover,
  moveBox,
  unionBoxRects,
  RESIZE_HANDLES,
  type BoxRect,
  type ResizeHandle,
} from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";
import { measureTextAdvancePx } from "../../../../lib/pdf/text-box-content-probe";
import {
  estimateWrappedLineCount,
  lineLayoutContentHeight,
  rebaseLineLayoutForHeight,
  resizeTextBoxToFitContent,
  textBoxContentHeightForLines,
  textBoxWrapsToWidth,
} from "../../../../lib/pdf/text-box-fit-resize";
import { textBoxOverlayFill } from "../../../../lib/pdf/text-box-background";
import { pdfTextEditStabilityV2Enabled } from "../../../../lib/pdf/pdf-flags";
import {
  formulaTranscribeFailure,
  type FormulaTranscribeFailure,
} from "../../../../lib/pdf/formula-transcribe-failure";
import { DEFAULT_NEW_BOX_FONT_SIZE } from "@mrnote/core/web/lib/pdf/text-box-create.ts";
import PdfFormulaPreview from "./PdfFormulaPreview";
import pdfSelectionChromeStyles from "./PdfSelectionChrome.module.css";
import PdfFormulaVisualEditorDialog from "./PdfFormulaVisualEditorDialog";
import { registerPdfTextBoxSelectionReader } from "./pdfFormatPreview";
import { textBoxHitMargins, type TextBoxHitMargin } from "./textBoxHitMargins";

function pdfFormulaLatexSourceError(latex: string): string | null {
  return formulaLatexValidationError(latex);
}

type FormulaSourceErrorLabels = {
  empty: string;
  incomplete: string;
  weak: string;
  syntax: string;
};

// Controlled value updates (setState on every keystroke, template insertion,
// programmatic revert) break the browser's native textarea undo stack, so the
// formula source editor keeps its own bounded draft history.
const FORMULA_SOURCE_UNDO_HISTORY_CAP = 50;

type FormulaSourceSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function pushFormulaSourceSnapshot(
  stack: FormulaSourceSnapshot[],
  snapshot: FormulaSourceSnapshot,
) {
  stack.push(snapshot);
  if (stack.length > FORMULA_SOURCE_UNDO_HISTORY_CAP) stack.shift();
}

function formulaSourceErrorLabel(
  error: string | null,
  labels: FormulaSourceErrorLabels,
): string | null {
  if (!error) return null;
  if (/source is empty/i.test(error)) return labels.empty;
  if (/source is incomplete/i.test(error)) return labels.incomplete;
  if (/too weak/i.test(error)) return labels.weak;
  return labels.syntax;
}

export const PDF_FORMULA_SOURCE_FLUSH_EVENT = "mrnote:pdf-formula-source-flush";

export interface PdfTextBoxEdit extends PdfTextBoxTypographyFields {
  sourceText?: import("../../../../lib/pdf/source-text-box").PdfSourceTextBoxBinding;
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Clockwise rotation in degrees about the box's CENTRE. Carried from the
   * extracted run when the source text was not upright, so editing a watermark
   * and downloading gives back a watermark rather than a horizontal line of
   * text across the page. Absent means upright, which is every box written
   * before this existed.
   */
  angle?: number;
  /**
   * Vertical CJK writing: upright glyphs, columns running down and stacking
   * right to left. Distinct from `angle` — turning a box 90 degrees lays every
   * character on its side, which is not what vertical writing looks like.
   */
  writingMode?: "vertical-rl";
  text: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  /** Text boxes extracted from display math get formula-specific editing UI. */
  kind?: "text" | "formula";
  /**
   * Best-effort semantic source for a formula box. `text` remains the visual
   * PDF replacement fallback; `latex` lets the editor, AI, and future export
   * paths reason about the formula instead of only OCR-like glyph text.
   */
  latex?: string;
  /**
   * The original run's font, carried from the extracted box so a flatten-export
   * can bake the edited text in a matching face (serif/sans/mono). Additive and
   * optional — older persisted edits simply omit it (bake falls back to sans).
   */
  fontFamily?: string;
  /** Original PDF/PostScript font name, used for export-time face matching. */
  sourceFontName?: string;
  bold?: boolean;
  italic?: boolean;
  /** Per-span typography for mixed-format source paragraphs. */
  runs?: PdfTextStyleRun[];
  /**
   * The Office font family (lib/office-fonts catalog name) the whole box is
   * set in, chosen from the font list's All Fonts; the text-box writer
   * embeds its served substitute (lib/pdf/text-box-runs.ts). `fontFamily`
   * then holds the CSS stack of that substitute.
   */
  officeFamily?: string;
  /** Per-line indentation and unequal leading, relative to the box. */
  lineLayout?: PdfTextLineLayout[];
  underline?: boolean;
  /** Word's Strikethrough for the whole box: a line through every line. */
  strikethrough?: boolean;
  /**
   * Word's Justify for the whole box: every line but a paragraph's last is
   * stretched to the frame width. `align` stays "left" while it is on.
   */
  justify?: boolean;
  /**
   * Marks a box the user created from scratch on a blank area ("Add Text"), as
   * opposed to an edit of an extracted line. A created box has no underlying
   * glyphs, so the export masks only its own footprint. Additive — edits of
   * extracted lines omit it.
   */
  created?: boolean;
  /**
   * The user set this frame's width by hand (dragged a handle), or the typing
   * auto-fit ran out of room. From then on the text wraps inside that width
   * and the frame grows downward to hold it (WPS "frame follows text"); the
   * single-line auto-fit that widens an untouched extracted line no longer
   * applies. Additive — untouched lines and older edits omit it.
   */
  fixedWidth?: boolean;
  /**
   * Marks an EXTRACTED line the user deleted as an object. The record is kept
   * (with empty text) so the origin-pinned cover/export mask still hides the
   * original glyphs, while the overlay hides the editable box entirely
   * instead of showing an empty editable. Undo (host history) restores the
   * pre-delete record. Created boxes never carry it — deleting one removes
   * its record outright. Additive — ordinary edits omit it.
   */
  deleted?: boolean;
  /**
   * The ORIGINAL extracted glyph region (page fractions), captured the first
   * time this box is edited and never changed by a move/resize. The opaque
   * cover (here) and the export mask (flatten) paint over THIS rect, so the
   * underlying PDF text stays hidden even after the box is dragged elsewhere.
   * Additive — edits persisted before origin tracking omit it (the cover then
   * falls back to the live rect, i.e. the old behaviour).
   */
  originX?: number;
  originY?: number;
  originWidth?: number;
  originHeight?: number;
  /**
   * Page background sampled from the PDF canvas under the original glyph region.
   * The cover/export mask uses this instead of assuming every page is white.
   */
  backgroundColor?: string;
  /**
   * Exact third-party `/FreeText` object identity. The shared overlay treats it
   * like an additive box for interaction, while save routes it through native
   * source-object patchback instead of flattening.
   */
  nativeSource?: NativePdfFreeTextAnnotationSource;
  sourceAction?: "content_style_geometry";
  /**
   * Imported `/FreeText` whose alignment the user has never chosen. pdf.js does
   * not report `/Q`, so `align` is only this overlay's layout fallback and the
   * alignment buttons stay unselected until one is pressed; the saved PDF keeps
   * the author's own quadding meanwhile.
   */
  alignFromSource?: boolean;
  /**
   * Solid border declared by an imported `/FreeText`, as a fraction of page
   * height. Drawn in the text colour: the real stroke colour lives in the
   * source `/DA`, which pdf.js does not report, and the saved appearance is
   * rebuilt from the object itself rather than from this approximation.
   */
  sourceBorderWidth?: number;
  /** An imported `/FreeText`'s inner text area (/RD) as edge insets: left and
   *  right in page-width fractions, top and bottom in page-height fractions. */
  sourceInsets?: { left: number; top: number; right: number; bottom: number };
  /** An imported `/FreeText`'s own opacity below 1: its text, fill and border
   *  are drawn at it while edited, as the saved appearance keeps it. */
  sourceOpacity?: number;
  nativeAppearanceImage?: string;
}

export interface PdfTextBoxEditEmitOptions {
  /**
   * Housekeeping emission (origin-cover widening / single-line auto-fit): not
   * a user action, so hosts must NOT record it in an undo history — undoing
   * it would just make the same effect re-emit and fight the user.
   */
  transient?: boolean;
  /**
   * Continuous-gesture marker: consecutive same-marker emissions for the same
   * box (repeated font-size steps, color scrubbing) may fold into ONE undo
   * entry in the host's history.
   */
  fold?: "fontSize" | "color" | "text";
}

const NO_DRAWN_TEXT_BOXES: readonly string[] = Object.freeze([]);

export interface PdfTextBoxOverlayProps {
  /** Extracted text boxes for the current page (page-relative fractions). */
  boxes: TextBox[];
  /** Each box's place, back first, among the annotations the reader draws
   * in its own layers (lib/pdf/annotation-stack-order.ts): a box not being
   * edited is stacked at it, so the screen keeps the page's /Annots order. */
  stackRanks?: ReadonlyMap<string, number>;
  /** The current page index these boxes belong to. */
  page: number;
  /** Rendered page size in CSS px (the boxes are positioned within it). */
  pageWidth: number;
  pageHeight: number;
  /**
   * Page height at PDF viewport scale 1. Ribbon font sizes use this stable
   * document unit while box rendering continues to use responsive CSS px.
   */
  documentPageHeight?: number;
  /** Persisted edits keyed by box id (overrides the extracted text/geometry). */
  editsById: Record<string, PdfTextBoxEdit>;
  /** Called when a box's text or geometry changes (WPS-style inline edit). */
  onEditBox: (
    edit: PdfTextBoxEdit,
    options?: PdfTextBoxEditEmitOptions,
  ) => void;
  /** Uncommitted formula source drafts keyed by `${page}:${boxId}`. */
  formulaDraftsByKey?: Record<string, string>;
  /** Persist formula source drafts outside this overlay when it unmounts. */
  onFormulaDraftsChange?: (
    drafts:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  /** Whether this page is the active editing page in a continuous editor stack. */
  active?: boolean;
  /**
   * "Add Text" mode: when true, clicking a blank area of the page creates a NEW
   * editable text box at that spot (via {@link onCreateBox}). The overlay then
   * captures pointer events on the empty canvas (it normally lets them through).
   */
  addMode?: boolean;
  /**
   * Create a new box at fractional (x, y) — the click position on the page. The
   * host builds the {@link PdfTextBoxEdit} (assigns an id, clamps on-page) and
   * persists it. Required for `addMode` to do anything.
   */
  onCreateBox?: (xFrac: number, yFrac: number, size?: Readonly<{ width: number; height: number }>) => void;
  /**
   * Delete a box by id. The selected box's toolbar shows a trash affordance when
   * this is provided — primarily for a user-CREATED "Add Text" box (which has no
   * underlying glyphs, so blanking its text would leave an empty floating box).
   * Absent -> no delete button.
   */
  onDeleteBox?: (id: string) => void;
  /**
   * A user-CREATED box lost focus with the given text. Hosts that can write
   * the text into the page itself use this as the commit point instead of
   * persisting every keystroke as an annotation draft.
   */
  onCreatedBoxCommit?: (id: string, text: string) => void;
  /**
   * Ask AI vision to transcribe a transcription-needed formula box (the host
   * crops the rendered canvas and calls the transcription endpoint). Resolves
   * to the LaTeX body; the source editor loads it as a draft for the user to
   * review and Apply. Absent -> no AI-transcribe affordance.
   */
  onTranscribeFormula?: (box: TextBox) => Promise<string>;
  /** Live write authority. A revoked editor remains visible but inert. */
  disabled?: boolean;
  /** Publishes the selected source text object to the host ribbon. */
  onSelectionChange?: (selection: PdfTextBoxSelection | null) => void;
  /** Forces selection chrome to clear when a sibling/context leaves. */
  selectionResetKey?: number;
  /** Put the caret in this box (at the end of its text) once it is shown:
   * a text box comment double-clicked on the page is edited here. One
   * request per `nonce`. */
  focusBoxRequest?: Readonly<{ id: string; nonce: number }> | null;
  /** Contextual-ribbon request for the selected source text object. */
  contextCommand?: PdfTextBoxContextCommand | null;
  /**
   * A host that publishes the selection (`onSelectionChange`) but has no
   * ribbon command to delete with (the reader's text box layer): the
   * selected CREATED box shows its own delete button beside its frame.
   */
  showDeleteButton?: boolean;
  




  findMatches?: ReadonlyArray<PdfTextBoxFindMatch>;
}

/** One find hit inside a text box: a range of the box's effective text. */
export interface PdfTextBoxFindMatch {
  boxId: string;
  start: number;
  end: number;
  active: boolean;
}

export interface PdfTextBoxSelection {
  page: number;
  id: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough?: boolean;
  align: "left" | "center" | "right" | "justify" | "distributed" | null;
  /** The box is written into the PDF as an MRAI text box, whose writer
   * carries Strikethrough and Justify; an imported note keeps its own. */
  extendedFormats?: boolean;
  textScript?: "superscript" | "subscript" | null;
  highlight?: boolean;
  distributed?: boolean;
  verticalAlign?: "top" | "middle" | "bottom";
  /** Word's Text Direction: the box's columns (竖排), or its text turned a
   * quarter (a box turned 90 or 270 degrees keeps its frame on the page). */
  textDirection?: PdfTextBoxTextDirection;
  /** Word's and PowerPoint's Columns: the count (1 = none) and the spacing
   * between them in document points. */
  columns?: Readonly<{ count: number; spacingDocumentUnit: number }>;
  /** Word's and PowerPoint's WordArt the box is painted with (null: none). */
  textPaint?: import("@mrnote/core/web/lib/office-text-paint.ts").OfficeTextPaint | null;
  /** The list the box's paragraphs are (their markers). */
  list?: ReturnType<typeof pdfTextListKindOf>;
  /** Whole-box spacing and indents in document points (null = none set). */
  lineSpacingDocumentUnit?: number | null;
  characterSpacingDocumentUnit?: number | null;
  wordSpacingDocumentUnit?: number | null;
  /** Percent; null when the box is not scaled. */
  horizontalScale?: number | null;
  firstLineIndentDocumentUnit?: number | null;
  leftIndentDocumentUnit?: number | null;
  rightIndentDocumentUnit?: number | null;
  /** Word's paragraph Spacing Before / After, points. */
  spaceBeforeDocumentUnit?: number | null;
  spaceAfterDocumentUnit?: number | null;
  /** Word's Tabs: the stops (points from the text area's left edge) and the
   * default interval (points; null: Word's 0.5 in). */
  tabStopsDocumentUnit?: readonly Readonly<{ positionDocumentUnit: number; align: PdfTextBoxTabStop["align"]; leader: PdfTextBoxTabStop["leader"] }>[];
  defaultTabDocumentUnit?: number | null;
  alignmentProven: boolean;
  fontFamilyId: string | null;
  fontFamilyLabel: string;
  fontOptions: readonly Readonly<{
    id: string;
    label: string;
    fontFamily: string;
    sourceFontName: string;
  }>[];
  fontSizeDocumentUnit: number;
  color: string;
  textKind: "text" | "formula";
  canDelete: boolean;
  created: boolean;
}

interface PdfTextBoxContextCommandTarget {
  requestId: number;
  page: number;
  id: string;
}

export type PdfTextBoxContextAction =
  | Readonly<{
      action:
        | "bold"
        | "italic"
        | "underline"
        | "strikethrough"
        | "align-left"
        | "align-center"
        | "align-right"
        | "align-justify"
        | "align-distributed"
        | "superscript"
        | "subscript"
        | "highlight"
        | "clear-formatting"
        | "delete";
    }>
  | Readonly<{
      action: "typography";
      control:
        | "lineSpacing"
        | "characterSpacing"
        | "wordSpacing"
        | "horizontalScale"
        | "firstLineIndent"
        | "leftIndent"
        | "rightIndent"
        | "spaceBefore"
        | "spaceAfter";
      /** Points (horizontal scale: percent); 0 (100 %) clears the format. */
      valueDocumentUnit: number;
    }>
  | Readonly<{ action: "indent"; direction: "increase" | "decrease" }>
  /** Word's Align Text: the rows at the top, middle or foot of the frame. */
  | Readonly<{ action: "vertical-align"; value: "top" | "middle" | "bottom" }>
  /** Word's Text Direction (文字方向). */
  | Readonly<{ action: "text-direction"; value: PdfTextBoxTextDirection }>
  /** Word's and PowerPoint's Columns (分栏): the count, and the spacing in
   * document points when the Columns dialog set one. */
  | Readonly<{ action: "columns"; count: number; spacingDocumentUnit?: number }>
  /** Word's Tabs: the box's stops (points from the text area's left edge)
   * and its default interval (points; null: Word's 0.5 in). */
  | Readonly<{
      action: "tab-stops";
      stops: readonly Readonly<{ positionDocumentUnit: number; align: PdfTextBoxTabStop["align"]; leader: PdfTextBoxTabStop["leader"] }>[];
      defaultDocumentUnit: number | null;
    }>
  /** WordArt Styles (艺术字样式): the box's words painted with an Office
   * WordArt paint, or plain again (null). */
  | Readonly<{ action: "text-paint"; paint: import("@mrnote/core/web/lib/office-text-paint.ts").OfficeTextPaint | null }>
  | Readonly<{ action: "rotate"; direction: "left" | "right" }>
  | Readonly<{ action: "font-family"; optionId: string }>
  | Readonly<{ action: "font-size"; valueDocumentUnit: number }>
  | Readonly<{ action: "font-size-step"; deltaDocumentUnit: -2 | 2 }>
  | Readonly<{ action: "color"; value: string }>
  | Readonly<{ action: "kind"; value: "text" | "formula" }>
  /** 项目符号 / 编号: each paragraph's markers written at its start (null: off). */
  | Readonly<{ action: "list"; style: PdfTextListStyle | null }>;

export type PdfTextBoxContextCommand = PdfTextBoxContextCommandTarget &
  PdfTextBoxContextAction;

export type PdfTextBoxTextDirection = "horizontal" | "vertical" | "rotate90" | "rotate270";

/** A box made vertical in MRAI (Word's 竖排, text-box-vertical.ts); an
 * imported vertical line is not one. */
function isMadeVerticalTextBox(edit: Pick<PdfTextBoxEdit, "created" | "writingMode"> | undefined): boolean {
  return edit?.created === true && edit.writingMode === "vertical-rl";
}

/** The box is set in Word's and PowerPoint's Columns. */
function hasTextBoxColumns(edit: Pick<PdfTextBoxEdit, "columnCount"> | undefined): boolean {
  return typeof edit?.columnCount === "number" && edit.columnCount > 1;
}

/** The size a box's text is set at. */
function nextFontSizeOf(edit: Pick<PdfTextBoxEdit, "fontSize"> | undefined, box: Pick<TextBox, "fontSize">): number {
  return edit?.fontSize ?? box.fontSize;
}

/** The box's Text Direction as Word shows it. */
function textDirectionOfBox(edit: PdfTextBoxEdit | undefined, angle: number): PdfTextBoxTextDirection {
  if (isMadeVerticalTextBox(edit)) return "vertical";
  const turn = ((Math.round(angle) % 360) + 360) % 360;
  return turn === 90 ? "rotate90" : turn === 270 ? "rotate270" : "horizontal";
}

interface DragState {
  id: string;
  key: string;
  mode: "move" | "rotate" | ResizeHandle;
  startX: number;
  startY: number;
  startRect: BoxRect;
  /** Rotation only: the angle the gesture started from. */
  startAngle?: number;
  /**
   * Rotation only: the box's centre in CLIENT coordinates.
   *
   * Worked out from the grip's own position rather than read off the DOM: the
   * grip sits a known distance above the centre in the box's own frame, so the
   * centre is that offset subtracted. Measuring the container instead would
   * need its origin, which nothing else in this drag loop needs.
   */
  centreClientX?: number;
  centreClientY?: number;
  /** The one pointer the gesture follows (absent from a synthetic event). */
  pointerId?: number;
}

interface TextPointerState {
  id: string;
  startX: number;
  startY: number;
}

interface TextBoxInputRule {
  box: TextBox;
  formula: boolean;
  /** No hard line break yet: the box's own key and line-break rules apply. */
  singleLine: boolean;
  /** A created or multi-line box keeps a pasted or typed line break. */
  preserveLineBreaks: boolean;
}

interface TextSelectionSnapshot {
  start: number;
  end: number;
}

interface SelectionSnapshot extends TextSelectionSnapshot {
  id: string;
}

interface CaretPoint {
  clientX: number;
  clientY: number;
}

function textBoxStateKey(page: number, id: string): string {
  return `${page}:${id}`;
}

function isPlainTextEditableNode(node: HTMLElement): boolean {
  return node.getAttribute("contenteditable") !== "false";
}

type DocumentWithCaretPoint = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

const HANDLE_PX = 10;
/** The shared Office grip paints its 8px square centred in the box's own
 * 10px resize target, so the hit areas stay exactly where they were. */
const TEXTBOX_GRIP_HIT_STYLE = {
  "--office-drawing-grip-size": `${HANDLE_PX}px`,
} as CSSProperties;
/** Half the shared round rotate grip in WPS's look (16px). */
const ROTATE_GRIP_HALF_PX = 8;
/** The move band round a selected box: this far outside its frame and this
 * far inside it. A text box moves by its frame, as the native text frame
 * and Word's text box do (no separate grip above it). */
const TEXTBOX_MOVE_BAND_OUTSIDE_PX = 5;
const TEXTBOX_MOVE_BAND_INSIDE_PX = 2;
/** The band's ring: its whole rectangle less the part inside the band. */
const TEXTBOX_MOVE_BAND_HOLE_PX =
  TEXTBOX_MOVE_BAND_OUTSIDE_PX + TEXTBOX_MOVE_BAND_INSIDE_PX;
const textBoxMoveBandClipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${TEXTBOX_MOVE_BAND_HOLE_PX}px ${TEXTBOX_MOVE_BAND_HOLE_PX}px, ${TEXTBOX_MOVE_BAND_HOLE_PX}px calc(100% - ${TEXTBOX_MOVE_BAND_HOLE_PX}px), calc(100% - ${TEXTBOX_MOVE_BAND_HOLE_PX}px) calc(100% - ${TEXTBOX_MOVE_BAND_HOLE_PX}px), calc(100% - ${TEXTBOX_MOVE_BAND_HOLE_PX}px) ${TEXTBOX_MOVE_BAND_HOLE_PX}px, ${TEXTBOX_MOVE_BAND_HOLE_PX}px ${TEXTBOX_MOVE_BAND_HOLE_PX}px)`;
/** Gap between the box's top edge and the rotation grip's centre, in CSS px. */
const ROTATE_HANDLE_GAP_PX = 22;
/** Hold Shift to step the angle. */
const ROTATE_SNAP_DEGREES = 15;
/** Within this many degrees of a right angle, snap to it. */
const ROTATE_SQUARE_TOLERANCE = 2;

/**
 * The angle a rotation gesture settles on.
 *
 * Right angles are what people actually want — a sideways caption, an upside
 * down stamp — and landing on 89.6 by hand is not possible, so they snap.
 * Shift steps instead, for the cases that are deliberately off-square.
 */
export function snapBoxRotation(angle: number, stepped: boolean): number {
  const normalized = normalizeBoxAngle(angle);
  if (stepped) {
    return normalizeBoxAngle(
      Math.round(normalized / ROTATE_SNAP_DEGREES) * ROTATE_SNAP_DEGREES,
    );
  }
  const square = Math.round(normalized / 90) * 90;
  return Math.abs(normalized - square) <= ROTATE_SQUARE_TOLERANCE
    ? normalizeBoxAngle(square)
    : normalized;
}
const TOOLBAR_ICON_SIZE = 14;
const TOOLBAR_BUTTON_PX = 28;
const COLOR_SWATCH_PX = 20;
const TOOLBAR_GAP_PX = 4;
const TOOLBAR_PADDING_X_PX = 10;
const TEXTBOX_MOVE_GRIP_HEIGHT_PX = 14;
const TEXTBOX_MOVE_GRIP_TOP_OFFSET_PX = 16;
const TEXTBOX_FLOATING_GAP_PX = 8;
// Two 28px control rows + 4px row gap + 4px vertical padding on both sides.
const TEXTBOX_TOOLBAR_HEIGHT_PX = 68;
const FONT_FAMILY_SELECT_WIDTH_PX = 128;
const TEXTBOX_NUMBER_FIELD_WIDTH_PX = 120;
const COLOR_INPUT_WIDTH_PX = 28;
const FORMULA_PANEL_HEIGHT_PX = 196;
const FORMULA_PANEL_MIN_WIDTH_PX = 300;
const TEXTBOX_AUTO_FIT_PADDING_PX = 6;
const TEXTBOX_PAGE_EDGE_PADDING_FRAC = 0.01;
const MIN_TEXTBOX_WIDTH_FRAC = 0.01;
const ALIGN_CONTROLS = [
  { value: "left", Icon: AlignLeft, labelKey: "pdf.textbox.align.left" },
  {
    value: "center",
    Icon: AlignCenter,
    labelKey: "pdf.textbox.align.center",
  },
  { value: "right", Icon: AlignRight, labelKey: "pdf.textbox.align.right" },
] as const;
const FORMULA_EDITOR_FONT_FAMILY =
  '"Cambria Math", "STIX Two Math", "Latin Modern Math", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TEXTBOX_HITAREA_Z_BASE = 1_000_000;
const TEXTBOX_SELECTED_Z_INDEX = TEXTBOX_HITAREA_Z_BASE + 10;
const FORMULA_SOURCE_TEMPLATE_TOOLS: Array<{
  template: PdfFormulaSourceTemplate;
  labelKey: string;
  symbol: string;
}> = [
  {
    template: "fraction",
    labelKey: "pdf.textbox.formulaTemplate.fraction",
    symbol: "a/b",
  },
  {
    template: "sqrt",
    labelKey: "pdf.textbox.formulaTemplate.sqrt",
    symbol: "√",
  },
  {
    template: "superscript",
    labelKey: "pdf.textbox.formulaTemplate.superscript",
    symbol: "x²",
  },
  {
    template: "subscript",
    labelKey: "pdf.textbox.formulaTemplate.subscript",
    symbol: "xᵢ",
  },
  {
    template: "sum",
    labelKey: "pdf.textbox.formulaTemplate.sum",
    symbol: "∑",
  },
  {
    template: "integral",
    labelKey: "pdf.textbox.formulaTemplate.integral",
    symbol: "∫",
  },
  {
    template: "parentheses",
    labelKey: "pdf.textbox.formulaTemplate.parentheses",
    symbol: "( )",
  },
  {
    template: "text",
    labelKey: "pdf.textbox.formulaTemplate.text",
    symbol: "文",
  },
];

type LastTextEmit = {
  text: string;
  generation: number;
};

const PDFJS_SYNTHETIC_FONT_RE = /\bg_d\d+_f\d+\b/i;

function hasPdfJsSyntheticFont(family?: string | null): boolean {
  return PDFJS_SYNTHETIC_FONT_RE.test(family || "");
}

function stableFontFamilyFromHints(
  sourceFontName?: string | null,
  family?: string | null,
): string {
  return resolvePdfFontFamily({
    fontName: sourceFontName,
    styleFamily: family,
  }).fontFamily;
}

function isCjkSourceFontFamily(family?: string | null): boolean {
  return family === CJK_SERIF_STACK || family === CJK_SANS_STACK;
}

function renderFontFamily(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
): string | undefined {
  const family = renderFontFamilyStack(box, edit);
  // The saved box draws what its face lacks (CJK) in the PDF's own Noto Sans
  // SC subset; the overlay stood in for it in the system's CJK face until
  // the page painted, so the line changed face while it was being saved and
  
  return family ? withEastAsianFallback(family, edit?.text ?? box.text) : family;
}

function renderFontFamilyStack(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
): string | undefined {
  // An explicit toolbar font pick must drive the rendered face; the extracted
  // run's displayFontFamily preference below would otherwise keep painting the
  // original font and make the picker look like a no-op.
  const picked = pickedFontFamilyOption(edit);
  if (picked) return fontFamilyForPdfText(edit?.text ?? box.text, picked.stack);
  const stable = persistedFontFamily(box, edit);
  const text = edit?.text ?? box.text;
  if (edit?.created) {
    // A plain new box is written as page text in the bundled Noto Sans SC
    // (the content append's one face), Latin included: typed in that face,
    // it does not change face when it is written and the native editor
    
    if (edit.kind !== "formula" && !pdfCreatedTextBoxNeedsTextBoxWriter(edit)) {
      void ensurePdfEastAsianFace();
      return `${EAST_ASIAN_FALLBACK_FAMILY}, ${fontFamilyForPdfText(text, stable)}`;
    }
    return fontFamilyForPdfText(text, stable);
  }
  if (stable && isCjkSourceFontFamily(stable)) {
    const scriptStable = fontFamilyForPdfText(text, stable);
    return scriptStable === stable &&
      box.displayFontFamily &&
      hasPdfJsSyntheticFont(box.displayFontFamily)
      ? pdfDisplayFontFamily(box.displayFontFamily, stable)
      : scriptStable;
  }
  return (
    fontFamilyForPdfText(text, box.displayFontFamily) ??
    fontFamilyForPdfText(text, stable)
  );
}

function persistedFontFamily(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
): string | undefined {
  const family = edit?.fontFamily || box.fontFamily;
  const sourceFamily = stableFontFamilyFromHints(
    edit?.sourceFontName ?? box.sourceFontName,
    family,
  );
  if (isCjkSourceFontFamily(sourceFamily)) {
    return fontFamilyForPdfText(edit?.text ?? box.text, sourceFamily);
  }
  if (family && !hasPdfJsSyntheticFont(family)) {
    return fontFamilyForPdfText(edit?.text ?? box.text, family);
  }
  if (box.fontFamily && !hasPdfJsSyntheticFont(box.fontFamily)) {
    return fontFamilyForPdfText(edit?.text ?? box.text, box.fontFamily);
  }
  if (box.sourceFontName || edit?.sourceFontName || family) {
    return sourceFamily;
  }
  return undefined;
}

function textStyleRunsForBox(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
  text: string,
): PdfTextStyleRun[] | undefined {
  const edited = normalizePdfTextStyleRuns(edit?.runs, {
    expectedText: text,
    allowDisplayFont: true,
  });
  if (edited) return edited;
  // Same question, same answer as the persist path: a text change moves the
  // runs' offsets, it does not take their faces and colours away.
  if (edit && edit.text !== box.text) {
    return reconcilePdfTextStyleRuns(box.runs, box.text, text);
  }
  return normalizePdfTextStyleRuns(box.runs, {
    expectedText: text,
    allowDisplayFont: true,
  });
}

function persistableRunsForBoxText(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
  text: string,
): PdfTextStyleRun[] | undefined {
  const previousText = edit?.text ?? box.text;
  const source =
    edit?.runs ?? (previousText === box.text ? box.runs : undefined);
  if (previousText === text) {
    return persistablePdfTextStyleRuns(source, text);
  }
  return reconcilePdfTextStyleRuns(source, previousText, text);
}

function textLineLayoutForBox(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
  text: string,
): PdfTextLineLayout[] | undefined {
  const edited = normalizePdfTextLineLayout(edit?.lineLayout, text);
  if (edited) return edited;
  // A line's geometry is the source's own: typing moves the offsets, never
  // the lines. Answering "no layout" here the moment the text changed is a
  // different answer from the one the persist path gives (which reconciles),
  // and it dropped every line's own origin mid-edit: the run fell out of its
  // absolutely placed lines into ordinary inline flow until the box was left.
  if (edit && edit.text !== box.text) {
    return reconcilePdfTextLineLayout(box.lineLayout, box.text, text);
  }
  return normalizePdfTextLineLayout(box.lineLayout, text);
}

function persistableLineLayoutForBoxText(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
  text: string,
): PdfTextLineLayout[] | undefined {
  const previousText = edit?.text ?? box.text;
  const source =
    edit?.lineLayout ??
    (previousText === box.text ? box.lineLayout : undefined);
  if (previousText === text) return normalizePdfTextLineLayout(source, text);
  return reconcilePdfTextLineLayout(source, previousText, text);
}

function matchingExtractedRun(
  run: PdfTextStyleRun,
  box: TextBox,
): PdfTextStyleRun | undefined {
  const sourceRuns = normalizePdfTextStyleRuns(box.runs, {
    expectedText: box.text,
    allowDisplayFont: true,
  });
  return sourceRuns?.find((candidate) => {
    if (run.sourceFontName && candidate.sourceFontName) {
      return run.sourceFontName === candidate.sourceFontName;
    }
    return Boolean(run.fontFamily && candidate.fontFamily === run.fontFamily);
  });
}

function renderFontFamilyForRun(
  run: PdfTextStyleRun,
  box: TextBox,
): string | undefined {
  const source = matchingExtractedRun(run, box);
  if (
    !run.sourceFontName &&
    !source?.sourceFontName &&
    !run.fontFamily &&
    !source?.fontFamily &&
    !run.displayFontFamily &&
    !source?.displayFontFamily
  ) {
    return undefined;
  }
  const stable = stableFontFamilyFromHints(
    run.sourceFontName ?? source?.sourceFontName,
    run.fontFamily ?? source?.fontFamily,
  );
  const display = run.displayFontFamily ?? source?.displayFontFamily;
  if (display && hasPdfJsSyntheticFont(display)) {
    return pdfDisplayFontFamily(display, stable);
  }
  return fontFamilyForPdfText(run.text, display ?? stable);
}

const PDF_TEXT_LINE_MIN_HORIZONTAL_SCALE = 0.25;
const PDF_TEXT_LINE_MAX_HORIZONTAL_SCALE = 4;

/**
 * Fit the invisible editable line onto the advance width extracted from PDF.
 *
 * Before the first mutation the user still sees the immutable canvas, while
 * the native caret belongs to this transparent DOM text. pdf.js can apply a
 * horizontal text scale that ordinary DOM font layout does not inherit. A
 * logically correct caret then lands inside the canvas glyph beside it. Keep
 * the DOM line's natural layout width and scale its paint/hit geometry onto the
 * source line width, reusing MRAI's existing text-layer width-fit contract
 * without touching the canvas or the persisted edit model.
 */
function fitTextStyleLinesToSourceWidth(
  node: HTMLElement,
  lineLayout: PdfTextLineLayout[] | undefined,
  boxWidth: number,
): number[] | undefined {
  if (!lineLayout || node.style.writingMode.startsWith("vertical")) return;
  const lineNodes = node.querySelectorAll<HTMLElement>("[data-pdf-text-line]");
  const scales: number[] = [];
  lineNodes.forEach((lineNode, index) => {
    const line = lineLayout[index];
    if (!line) return;
    const targetWidth = line.width * boxWidth;
    lineNode.style.removeProperty("transform");
    lineNode.style.removeProperty("transform-origin");
    lineNode.removeAttribute("data-pdf-text-line-scale");
    lineNode.style.width = "max-content";
    const naturalWidth = lineNode.scrollWidth;
    if (
      !Number.isFinite(targetWidth) ||
      targetWidth <= 0 ||
      !Number.isFinite(naturalWidth) ||
      naturalWidth <= 0
    ) {
      lineNode.style.width = `${Math.max(1, targetWidth)}px`;
      return;
    }
    const scale = targetWidth / naturalWidth;
    if (
      !Number.isFinite(scale) ||
      scale < PDF_TEXT_LINE_MIN_HORIZONTAL_SCALE ||
      scale > PDF_TEXT_LINE_MAX_HORIZONTAL_SCALE
    ) {
      lineNode.style.width = `${Math.max(1, targetWidth)}px`;
      return;
    }
    lineNode.style.width = `${naturalWidth}px`;
    lineNode.style.transformOrigin = "left top";
    lineNode.style.transform = `scaleX(${scale})`;
    lineNode.dataset.pdfTextLineScale = String(scale);
    scales[index] = scale;
  });
  return scales.length > 0 ? scales : undefined;
}

/**
 * Keep a line at the condensation the PDF set it in, while its text changes.
 *
 * The fit above measures a line against the advance width the source drew it
 * at; that ratio is a property of the run's typography (a PDF sets a
 * horizontal scale that DOM font layout does not inherit), not of how long
 * the text happens to be. Re-measuring against the source width after every
 * keystroke would squeeze the glyphs a little further with each character;
 * dropping the fit altogether -- which is what happened before, because it
 * only ran while the box was untouched -- let every line lay out at its
 * natural DOM width and spill past the box it is drawn in. Applying the
 * remembered ratio instead lets the line grow the way the page would, so it
 * reaches beyond its frame exactly when the edit itself would.
 */
function applyRememberedTextStyleLineScales(
  node: HTMLElement,
  scales: number[] | undefined,
) {
  if (!scales || node.style.writingMode.startsWith("vertical")) return;
  const lineNodes = node.querySelectorAll<HTMLElement>("[data-pdf-text-line]");
  lineNodes.forEach((lineNode, index) => {
    const scale = scales[index];
    if (!Number.isFinite(scale) || scale <= 0) return;
    lineNode.style.width = "max-content";
    lineNode.style.transformOrigin = "left top";
    lineNode.style.transform = `scaleX(${scale})`;
    lineNode.dataset.pdfTextLineScale = String(scale);
  });
}

/**
 * Word's Tabs in a box's words (the node's data, set from its typography:
 * text-box-tabs.ts): each tab drawn reaching its stop. A box whose stops
 * went keeps its tabs as the browser draws them.
 */
function layOutBoxTabs(node: HTMLElement): void {
  if (!node.isConnected) return;
  const raw = node.dataset.pdfTextboxTabs;
  if (!raw) {
    for (const span of node.querySelectorAll<HTMLElement>(`span[${PDF_TEXT_BOX_TAB_ATTR}]`)) {
      span.replaceWith(...span.childNodes);
    }
    applyPdfTextBoxBarRules(node, { stops: [] }, 0);
    return;
  }
  try {
    const layout = JSON.parse(raw) as Parameters<typeof applyPdfTextBoxTabStops>[1];
    applyPdfTextBoxTabStops(node, layout, Number(node.dataset.pdfTextboxTabIndent ?? 0) || 0);
  } catch {
    // An unreadable layout leaves the browser's own tabs.
  }
}

function writeTextStyleRunsToDom({
  node,
  text,
  runs,
  lineLayout,
  box,
  boxWidth,
  boxHeight,
  pageHeight,
  showRunColors,
  fitSourceLineWidths = false,
}: {
  node: HTMLElement;
  text: string;
  runs: PdfTextStyleRun[] | undefined;
  lineLayout: PdfTextLineLayout[] | undefined;
  box: TextBox;
  boxWidth: number;
  boxHeight: number;
  pageHeight: number;
  showRunColors: boolean;
  fitSourceLineWidths?: boolean;
}): number[] | undefined {
  const validRuns =
    runs && runs.map((run) => run.text).join("") === text ? runs : undefined;
  const createRunSpan = (run: PdfTextStyleRun, index: number) => {
    const span = document.createElement("span");
    span.dataset.pdfTextRun = String(index);
    span.textContent = run.text;
    const family = renderFontFamilyForRun(run, box);
    if (family) span.style.fontFamily = family;
    if (typeof run.fontSize === "number" && run.fontSize > 0) {
      span.style.fontSize = `${Math.max(1, run.fontSize * pageHeight)}px`;
    }
    if (typeof run.bold === "boolean") {
      span.style.fontWeight = run.bold ? "bold" : "normal";
    }
    if (typeof run.italic === "boolean") {
      span.style.fontStyle = run.italic ? "italic" : "normal";
    }
    // A text box's run carries its own decorations and script
    // (lib/pdf/text-box-runs.ts); the box's own apply where it says none.
    if (typeof run.underline === "boolean" || typeof run.strikethrough === "boolean") {
      const lines = [run.underline ? "underline" : "", run.strikethrough ? "line-through" : ""].filter(Boolean);
      span.style.textDecorationLine = lines.join(" ") || "none";
    }
    if (run.script) {
      span.style.fontSize = typeof run.fontSize === "number" && run.fontSize > 0
        ? `${Math.max(1, run.fontSize * pageHeight * 0.65)}px` : "0.65em";
      span.style.verticalAlign = run.script === "superscript" ? "super" : "sub";
    }
    if (isSafeCssColor(run.color)) {
      // Keep the validated source colour separately from its current painted
      // state. A contenteditable cannot be structurally rewritten while it is
      // focused without moving the caret, but the parent can prune an edit as
      // soon as its text matches the PDF source again. In that transition the
      // source canvas becomes visible immediately, so nested run colours must
      // be removable without replacing the run nodes.
      span.dataset.pdfTextRunColor = run.color;
      if (showRunColors) span.style.color = run.color;
    }
    return span;
  };
  const validLines = normalizePdfTextLineLayout(lineLayout, text);
  // Word's Spacing Before / After (the node's data, set from the box's
  // typography): each paragraph a block padded above and below, its line
  // break the block's last character -- a trailing break draws no line, so
  // the text read back is the text written, and the caret's offsets stand.
  const spaceBefore = Number(node.dataset.pdfTextboxSpaceBefore ?? 0);
  const spaceAfter = Number(node.dataset.pdfTextboxSpaceAfter ?? 0);
  if (!validLines && (spaceBefore > 0 || spaceAfter > 0)) {
    const ranges = pdfTextBoxParagraphRanges(text);
    let runIndex = 0;
    let runOffset = 0;
    const blocks = ranges.map((range, index) => {
      const block = document.createElement("span");
      block.dataset.pdfTextParagraph = String(index);
      block.style.display = "block";
      block.style.paddingTop = `${Math.max(0, spaceBefore)}px`;
      block.style.paddingBottom = `${Math.max(0, spaceAfter)}px`;
      const end = index < ranges.length - 1 ? range.end + 1 : range.end;
      if (!validRuns) {
        block.textContent = text.slice(range.start, end);
        return block;
      }
      let at = range.start;
      while (at < end && runIndex < validRuns.length) {
        const run = validRuns[runIndex]!;
        const take = Math.min(run.text.length - runOffset, end - at);
        block.appendChild(createRunSpan({ ...run, text: run.text.slice(runOffset, runOffset + take) }, runIndex));
        at += take;
        runOffset += take;
        if (runOffset >= run.text.length) { runIndex += 1; runOffset = 0; }
      }
      return block;
    });
    node.replaceChildren(...blocks);
    layOutBoxTabs(node);
    return undefined;
  }
  if (validLines) {
    let runIndex = 0;
    let runOffset = 0;
    const sliceRuns = (start: number, end: number) => {
      if (!validRuns) return [];
      const sliced: PdfTextStyleRun[] = [];
      let cursor = 0;
      for (const run of validRuns) {
        const runStart = cursor;
        const runEnd = cursor + run.text.length;
        cursor = runEnd;
        if (runEnd <= start || runStart >= end) continue;
        const localStart = Math.max(start, runStart) - runStart;
        const localEnd = Math.min(end, runEnd) - runStart;
        const runText = run.text.slice(localStart, localEnd);
        if (runText) sliced.push({ ...run, text: runText });
      }
      return sliced;
    };
    const lineNodes = validLines.map((line, lineIndex) => {
      const lineNode = document.createElement("span");
      lineNode.dataset.pdfTextLine = String(lineIndex);
      // PDF extraction and export both define a line's alphabetic baseline
      // at `line top + max font size`. Browser inline layout otherwise uses
      // the font's own ascent metrics and paints the editable glyphs a few
      // pixels too high. The zero-width ::after strut supplied by this class
      // makes the line baseline exactly one em below its top without adding
      // editable DOM content or disturbing caret offsets.
      lineNode.classList.add("pdf-textbox-source-baseline");
      lineNode.style.position = "absolute";
      lineNode.style.left = `${line.x * boxWidth}px`;
      lineNode.style.top = `${line.y * boxHeight}px`;
      lineNode.style.width = `${Math.max(1, line.width * boxWidth)}px`;
      lineNode.style.minHeight = `${Math.max(1, line.height * boxHeight)}px`;
      lineNode.style.whiteSpace = "pre";
      lineNode.style.lineHeight = String(PDF_TEXTBOX_LINE_HEIGHT_RATIO);
      const lineRuns = sliceRuns(line.start, line.end);
      if (lineRuns.length > 0) {
        for (const run of lineRuns) {
          lineNode.appendChild(createRunSpan(run, runIndex));
          runIndex += 1;
          runOffset += run.text.length;
        }
      } else {
        lineNode.appendChild(
          document.createTextNode(text.slice(line.start, line.end)),
        );
        runOffset += line.end - line.start;
      }
      if (lineIndex < validLines.length - 1) {
        const breakNode = document.createElement("span");
        breakNode.dataset.pdfTextLineBreak = "true";
        breakNode.style.display = "none";
        breakNode.textContent = "\n";
        lineNode.appendChild(breakNode);
        runOffset += 1;
      }
      return lineNode;
    });
    node.replaceChildren(...lineNodes);
    if (runOffset === text.length) {
      return fitSourceLineWidths
        ? fitTextStyleLinesToSourceWidth(node, validLines, boxWidth)
        : undefined;
    }
  }
  if (!validRuns) {
    if (node.textContent !== text) node.textContent = text;
    return undefined;
  }
  node.replaceChildren(
    ...validRuns.map((run, index) => createRunSpan(run, index)),
  );
  return undefined;
}

/**
 * Synchronise only the paint state of styled text runs.
 *
 * This deliberately leaves text nodes and element identity untouched. It is
 * safe to call while `node` owns the live selection, unlike
 * `writeTextStyleRunsToDom`, which must replace children when runs change.
 */
function setTextStyleRunColorsVisible(node: HTMLElement, visible: boolean) {
  for (const run of node.querySelectorAll<HTMLElement>("[data-pdf-text-run]")) {
    if (!visible) {
      run.style.removeProperty("color");
      continue;
    }
    const color = run.dataset.pdfTextRunColor;
    if (isSafeCssColor(color)) run.style.color = color;
  }
}

/**
 * An edit counts as an explicit user font pick only when BOTH persisted fields
 * match a curated option pair — that is exactly what the picker writes. A
 * carried-over classification can only coincide when the source font truly is
 * that face (e.g. a real Helvetica run), where rendering the curated stack is
 * visually equivalent.
 */
function pickedFontFamilyOption(
  edit: PdfTextBoxEdit | undefined,
): TextBoxFontFamilyOption | undefined {
  if (!edit?.fontFamily || !edit.sourceFontName) return undefined;
  return TEXTBOX_FONT_FAMILY_OPTIONS.find(
    (option) =>
      option.stack === edit.fontFamily &&
      option.sourceFontName === edit.sourceFontName,
  );
}

/** The select value: explicit pick first, else the stable classified stack. */
function selectedFontFamilyOptionId(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
): string {
  const picked = pickedFontFamilyOption(edit);
  if (picked) return picked.id;
  const stable = persistedFontFamily(box, edit);
  return (
    TEXTBOX_FONT_FAMILY_OPTIONS.find((option) => option.stack === stable)?.id ??
    ""
  );
}

/** The character formats a bare caret holds for what is typed next. */
type PendingTypingPatch = Partial<
  Pick<PdfTextBoxEdit, "fontFamily" | "sourceFontName" | "officeFamily" | "fontSize" | "bold" | "italic" | "color">
>;
interface PendingTypingFormat {
  readonly patch: PendingTypingPatch;
  /** Where the caret stood: words typed there take the formats. */
  readonly caret: number;
}
const PENDING_TYPING_KEYS = ["fontFamily", "sourceFontName", "officeFamily", "fontSize", "bold", "italic", "color"] as const;
/** The character formats a box holds for all its words (no run of them is
 * made by this layer): a caret holds none of them for the words typed next. */
const BOX_OWN_CHARACTER_KEYS = ["underline", "strikethrough"] as const;

/** The characters `next` added to `previous` at one place, or null. */
function insertedTextRange(previous: string, next: string): { start: number; end: number } | null {
  if (next.length <= previous.length) return null;
  let start = 0;
  while (start < previous.length && previous[start] === next[start]) start += 1;
  let tail = 0;
  while (
    tail < previous.length - start &&
    previous[previous.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }
  const end = next.length - tail;
  return previous.length - tail - start === 0 && end > start ? { start, end } : null;
}

/** A font name as the file names it, without its subset tag (ABCDEF+). */
function readableSourceFontName(name: string | undefined): string | null {
  const cleaned = (name ?? "").replace(/^[A-Z]{6}\+/, "").trim();
  return cleaned || null;
}

/**
 * Normalize any persisted CSS color to the #rrggbb form `<input type=color>`
 * requires (edits may carry #rgb or rgb()/rgba() strings from older paths).
 */
function hexForColorInput(color: string | undefined): string {
  const raw = (color ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  const short = raw.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }
  const rgb = raw.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[,)]/,
  );
  if (rgb) {
    const channel = (value: string) =>
      Math.min(255, Number.parseInt(value, 10)).toString(16).padStart(2, "0");
    return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
  }
  return "#111827";
}

function textboxBackgroundColor(edit: PdfTextBoxEdit | undefined): string {
  // One rule with the read view (lib/pdf/text-box-background): a box over
  // source text is clear, since its run is hidden in the bytes; a fill is
  // made opaque, as a translucent cover showed the original under the
  // edited text (doubled text); an imported FreeText keeps its look.
  return textBoxOverlayFill(edit);
}

function compactSourceComparableText(text: string | undefined): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[;:,.，。；：·\s]+/g, "");
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function textLooksLikeSameExtractedSource(
  box: TextBox,
  edit: PdfTextBoxEdit,
): boolean {
  const extracted = compactSourceComparableText(box.text);
  const edited = compactSourceComparableText(edit.text);
  if (!extracted || !edited) return false;
  if (extracted.includes(edited) || edited.includes(extracted)) return true;
  const sharedPrefix = commonPrefixLength(extracted, edited);
  const minimumShared = Math.min(
    12,
    Math.max(4, Math.min(extracted.length, edited.length) * 0.55),
  );
  return sharedPrefix >= minimumShared;
}

function rectsLookLikeSameSourceLine(
  source: BoxRect,
  extracted: BoxRect,
  fontSize: number,
): boolean {
  const sourceBottom = source.y + source.height;
  const extractedBottom = extracted.y + extracted.height;
  const verticalOverlap =
    Math.min(sourceBottom, extractedBottom) - Math.max(source.y, extracted.y);
  const minHeight = Math.max(0.0001, Math.min(source.height, extracted.height));
  if (verticalOverlap / minHeight < 0.35) {
    const sourceCenter = source.y + source.height / 2;
    const extractedCenter = extracted.y + extracted.height / 2;
    if (
      Math.abs(sourceCenter - extractedCenter) > Math.max(fontSize * 1.5, 0.01)
    ) {
      return false;
    }
  }

  const sourceRight = source.x + source.width;
  const extractedRight = extracted.x + extracted.width;
  const horizontalGap = Math.max(
    0,
    Math.max(source.x, extracted.x) - Math.min(sourceRight, extractedRight),
  );
  return horizontalGap <= Math.max(fontSize * 4, 0.04);
}

function rectsMostlyOverlapHorizontally(source: BoxRect, extracted: BoxRect) {
  const sourceRight = source.x + source.width;
  const extractedRight = extracted.x + extracted.width;
  const overlap =
    Math.min(sourceRight, extractedRight) - Math.max(source.x, extracted.x);
  if (overlap <= 0) return false;
  const minWidth = Math.max(0.0001, Math.min(source.width, extracted.width));
  return overlap / minWidth >= 0.6;
}

function sourceRectForExtractedTextEdit(
  box: TextBox,
  edit: PdfTextBoxEdit,
): BoxRect {
  const source = coverRectForEdit(edit);
  if (edit.created) return source;

  const extracted = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
  if (boxRectContains(source, extracted)) return source;

  const fontSize = Math.max(edit.fontSize ?? 0, box.fontSize, 0.001);
  if (
    !rectsLookLikeSameSourceLine(source, extracted, fontSize) ||
    (!textLooksLikeSameExtractedSource(box, edit) &&
      !rectsMostlyOverlapHorizontally(source, extracted))
  ) {
    return source;
  }

  return unionBoxRects(source, extracted);
}

function sourceOriginFieldsForExtractedTextEdit(
  box: TextBox,
  existing: PdfTextBoxEdit | undefined,
) {
  if (!existing) {
    return {
      originX: box.x,
      originY: box.y,
      originWidth: box.width,
      originHeight: box.height,
    };
  }
  const rect = sourceRectForExtractedTextEdit(box, existing);
  return {
    originX: rect.x,
    originY: rect.y,
    originWidth: rect.width,
    originHeight: rect.height,
  };
}

function originFieldsNeedUpdate(
  edit: PdfTextBoxEdit,
  origin: ReturnType<typeof sourceOriginFieldsForExtractedTextEdit>,
): boolean {
  return (
    Math.abs((edit.originX ?? edit.x) - origin.originX) > 0.0001 ||
    Math.abs((edit.originY ?? edit.y) - origin.originY) > 0.0001 ||
    Math.abs((edit.originWidth ?? edit.width) - origin.originWidth) > 0.0001 ||
    Math.abs((edit.originHeight ?? edit.height) - origin.originHeight) > 0.0001
  );
}

function boxRectsNearlyEqual(a: BoxRect, b: BoxRect, epsilon = 0.002): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/**
 * A paragraph's extraction rectangle is the bounding box of every line. Its
 * whitespace is not owned by the paragraph: inline formulas and continuation
 * boxes can legitimately sit inside that bounding rectangle. Mask each source
 * line instead of whitening the whole paragraph whenever the persisted origin
 * still matches the current extraction.
 */
function sourceLineRectsForTextBox(box: TextBox, source: BoxRect): BoxRect[] {
  const extracted = {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
  const lines = normalizePdfTextLineLayout(box.lineLayout, box.text);
  if (!lines || lines.length <= 1 || !boxRectsNearlyEqual(source, extracted)) {
    return [source];
  }
  const rects = lines
    .map((line) => ({
      x: extracted.x + line.x * extracted.width,
      y: extracted.y + line.y * extracted.height,
      width: line.width * extracted.width,
      height: line.height * extracted.height,
    }))
    .filter((line) => line.width > 0 && line.height > 0);
  return rects.length > 1 ? rects : [source];
}

function hasHardLineBreak(text: string): boolean {
  return /[\r\n]/.test(text);
}

function formulaLatexForTextEdit(
  box: TextBox,
  edit: PdfTextBoxEdit | undefined,
  nextText: string,
): string | undefined {
  if (effectiveTextBoxKind(box, edit) !== "formula") {
    return undefined;
  }
  const previousText = edit?.text ?? box.text;
  const currentLatex = edit?.latex ?? box.latex;
  if (!currentLatex) {
    return latexFromPdfFormulaText(nextText);
  }
  const previousGenerated = latexFromPdfFormulaText(previousText);
  if (currentLatex === previousGenerated) {
    return latexFromPdfFormulaText(nextText);
  }
  if (edit?.latex) {
    const sourceFallback = fallbackTextFromPdfFormulaLatex(edit.latex);
    if (previousText === sourceFallback) {
      const preserved = preservePdfFormulaLatexForTextEdit({
        currentLatex: edit.latex,
        previousText,
        nextText,
      });
      return preserved ?? latexFromPdfFormulaText(nextText);
    }
  }
  const preserved = preservePdfFormulaLatexForTextEdit({
    currentLatex,
    previousText,
    nextText,
  });
  if (preserved) return preserved;
  return latexForPdfFormulaTextEdit({
    currentLatex,
    previousText,
    nextText,
  });
}

/** Under this far each way a press in Add Text mode is a click. */
const PLACING_DRAG_MIN_PX = 6;

function rectsCloseEnough(a: BoxRect, b: BoxRect) {
  return (
    Math.abs(a.x - b.x) <= 0.003 &&
    Math.abs(a.y - b.y) <= 0.003 &&
    Math.abs(a.width - b.width) <= 0.003 &&
    Math.abs(a.height - b.height) <= 0.003
  );
}

function formulaAutoFitBaseRect({
  box,
  existing,
  currentRect,
  fontSizeFraction,
  pageWidth,
  pageHeight,
}: {
  box: TextBox;
  existing: PdfTextBoxEdit | undefined;
  currentRect: BoxRect;
  fontSizeFraction: number;
  pageWidth: number;
  pageHeight: number;
}) {
  if (!existing || existing.created) return currentRect;
  const originRect = {
    x: existing.originX ?? box.x,
    y: existing.originY ?? box.y,
    width: existing.originWidth ?? box.width,
    height: existing.originHeight ?? box.height,
  };
  const existingLatex = normalizePdfFormulaLatexSource(
    existing.latex ?? box.latex ?? latexFromPdfFormulaText(existing.text),
  );
  const expectedAutoRect = pdfFormulaBoxRect({
    rect: originRect,
    latex: existingLatex,
    fontSizeFraction,
    pageWidth,
    pageHeight,
  });
  return rectsCloseEnough(currentRect, expectedAutoRect)
    ? originRect
    : currentRect;
}

export function formulaPanelTopForBox({
  top,
  displayHeight,
  toolbarTop,
  pageHeight,
}: {
  top: number;
  displayHeight: number;
  toolbarTop: number;
  pageHeight: number;
}) {
  const belowTop = Math.max(
    top + displayHeight + TEXTBOX_FLOATING_GAP_PX,
    toolbarTop + TEXTBOX_TOOLBAR_HEIGHT_PX + TEXTBOX_FLOATING_GAP_PX,
  );
  if (belowTop + FORMULA_PANEL_HEIGHT_PX <= pageHeight) return belowTop;

  const aboveTop =
    Math.min(top, toolbarTop) -
    TEXTBOX_FLOATING_GAP_PX -
    FORMULA_PANEL_HEIGHT_PX;
  if (aboveTop >= 0) return aboveTop;

  // Last resort: the panel cannot fully avoid the box. Clamp to whichever
  // page edge overlaps the box the least; ties keep the below-side clamp.
  const boxBottom = top + displayHeight;
  const overlapWithBox = (candidate: number) =>
    Math.max(
      0,
      Math.min(candidate + FORMULA_PANEL_HEIGHT_PX, boxBottom) -
        Math.max(candidate, top),
    );
  const belowClamp = Math.max(
    0,
    Math.min(Math.max(0, pageHeight - FORMULA_PANEL_HEIGHT_PX), belowTop),
  );
  return overlapWithBox(0) < overlapWithBox(belowClamp) ? 0 : belowClamp;
}

/** Numeric font size in the same shared layout-field anatomy used by Docs. */
function ToolbarFontSizeInput({
  valueDocumentUnit,
  ariaLabel,
  onCommitDocumentUnit,
}: {
  valueDocumentUnit: number;
  ariaLabel: string;
  onCommitDocumentUnit: (value: number) => void;
}) {
  return (
    <span
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ display: "inline-flex", width: TEXTBOX_NUMBER_FIELD_WIDTH_PX }}
    >
      <OfficeRibbonNumberField
        icon={<Type aria-hidden size={16} />}
        inputWidthPx={54}
        label={ariaLabel}
        max={1000}
        min={1}
        onCommit={(raw) => {
          const parsed = Number.parseFloat(raw);
          if (Number.isFinite(parsed) && parsed > 0) {
            onCommitDocumentUnit(parsed);
          }
        }}
        step={1}
        testId="pdf-textbox-font-size-input"
        value={String(valueDocumentUnit)}
      />
    </span>
  );
}

function PdfFormulaSourceEditor({
  latex,
  draftLatex,
  shouldCommitOnUnmount,
  color,
  label,
  applyLabel,
  revertLabel,
  dirtyLabel,
  cleanLabel,
  invalidLabel,
  errorLabels,
  templateLabels,
  visualModeLabel,
  transcriptionHint,
  transcribeLabels,
  onTranscribe,
  onCommit,
  onDraftChange,
  onDraftClear,
  onDismiss,
}: {
  latex: string;
  draftLatex?: string;
  shouldCommitOnUnmount?: () => boolean;
  color: string;
  label: string;
  applyLabel: string;
  revertLabel: string;
  dirtyLabel: string;
  cleanLabel: string;
  invalidLabel: string;
  errorLabels: FormulaSourceErrorLabels;
  templateLabels: Record<PdfFormulaSourceTemplate, string>;
  visualModeLabel: string;
  /**
   * Shown instead of the "empty source" error when the PDF's own formula text
   * is unreliable (broken math-font ToUnicode) and no LaTeX seed exists: the
   * user must transcribe the formula from the rendered glyphs.
   */
  transcriptionHint?: string;
  transcribeLabels?: {
    action: string;
    loading: string;
    failed: string;
    /** The model found no readable formula in the crop. */
    unreadable?: string;
    /** The AI service gave no usable answer. */
    unavailable?: string;
  };
  /**
   * AI vision transcription for the selected formula's rendered glyphs. The
   * result loads into the draft (undoable, not auto-applied) so the user can
   * review against the page before pressing Apply.
   */
  onTranscribe?: () => Promise<string>;
  onCommit: (latex: string) => void;
  onDraftChange?: (latex: string) => void;
  onDraftClear?: () => void;
  onDismiss?: () => void;
}) {
  const initialDraft = draftLatex ?? latex;
  const [draft, setDraft] = useState(initialDraft);
  const [committed, setCommitted] = useState(latex);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const externalLatexRef = useRef(latex);
  const lastCommittedRef = useRef(latex);
  const draftRef = useRef(initialDraft);
  const onCommitRef = useRef(onCommit);
  const onDraftChangeRef = useRef(onDraftChange);
  const onDraftClearRef = useRef(onDraftClear);
  const shouldCommitOnUnmountRef = useRef(shouldCommitOnUnmount);
  const undoStackRef = useRef<FormulaSourceSnapshot[]>([]);
  const redoStackRef = useRef<FormulaSourceSnapshot[]>([]);
  const visualOpenRef = useRef(false);
  const [visualSeed, setVisualSeed] = useState<string | null>(null);
  // Selection captured on keydown, i.e. before the DOM mutates: onChange only
  // sees the post-edit caret, which is the wrong place to restore on undo.
  const selectionBeforeEditRef = useRef<{ start: number; end: number } | null>(
    null,
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    onDraftClearRef.current = onDraftClear;
  }, [onDraftClear]);

  useEffect(() => {
    shouldCommitOnUnmountRef.current = shouldCommitOnUnmount;
  }, [shouldCommitOnUnmount]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    const initialEndOffset = source.value.length;
    const focusSource = (forceSelection: boolean) => {
      source.focus({ preventScroll: true });
      if (!forceSelection) {
        const selectionMoved =
          source.value.length !== initialEndOffset ||
          source.selectionStart !== initialEndOffset ||
          source.selectionEnd !== initialEndOffset;
        if (selectionMoved) return;
      }
      const endOffset = source.value.length;
      source.setSelectionRange(endOffset, endOffset);
    };
    focusSource(true);
    const timeout = window.setTimeout(() => focusSource(false), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (latex === externalLatexRef.current) return;

    const wasDirty = draftRef.current !== lastCommittedRef.current;
    externalLatexRef.current = latex;
    lastCommittedRef.current = latex;
    setCommitted(latex);

    if (wasDirty && draftRef.current !== latex) {
      return;
    }

    draftRef.current = latex;
    setDraft(latex);
    // The history predates the externally supplied source; restoring those
    // snapshots would resurrect content the external update replaced.
    undoStackRef.current = [];
    redoStackRef.current = [];
    onDraftClearRef.current?.();
  }, [latex]);

  const commitLatex = useCallback((nextLatex: string, updateState: boolean) => {
    if (nextLatex === lastCommittedRef.current) return true;
    lastCommittedRef.current = nextLatex;
    externalLatexRef.current = nextLatex;
    if (updateState) setCommitted(nextLatex);
    onCommitRef.current(nextLatex);
    return true;
  }, []);

  const commitDraft = useCallback(
    (nextLatex = draftRef.current) => {
      if (pdfFormulaLatexSourceError(nextLatex)) return false;
      commitLatex(nextLatex, true);
      onDraftClearRef.current?.();
      return true;
    },
    [commitLatex],
  );

  const currentSnapshot = useCallback((): FormulaSourceSnapshot => {
    const source = sourceRef.current;
    const value = draftRef.current;
    return {
      value,
      selectionStart: source?.selectionStart ?? value.length,
      selectionEnd: source?.selectionEnd ?? value.length,
    };
  }, []);

  const recordUndoSnapshot = useCallback((snapshot: FormulaSourceSnapshot) => {
    pushFormulaSourceSnapshot(undoStackRef.current, snapshot);
    redoStackRef.current = [];
  }, []);

  const restoreSnapshot = useCallback((snapshot: FormulaSourceSnapshot) => {
    draftRef.current = snapshot.value;
    setDraft(snapshot.value);
    onDraftChangeRef.current?.(snapshot.value);
    const restoreSelection = () => {
      const liveSource = sourceRef.current;
      if (!liveSource) return;
      liveSource.focus({ preventScroll: true });
      const maxOffset = liveSource.value.length;
      liveSource.setSelectionRange(
        Math.min(snapshot.selectionStart, maxOffset),
        Math.min(snapshot.selectionEnd, maxOffset),
      );
    };
    if (typeof window !== "undefined") {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(restoreSelection);
      } else {
        window.setTimeout(restoreSelection, 0);
      }
    }
  }, []);

  const undoDraftEdit = useCallback(() => {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    pushFormulaSourceSnapshot(redoStackRef.current, currentSnapshot());
    restoreSnapshot(snapshot);
  }, [currentSnapshot, restoreSnapshot]);

  const redoDraftEdit = useCallback(() => {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return;
    pushFormulaSourceSnapshot(undoStackRef.current, currentSnapshot());
    restoreSnapshot(snapshot);
  }, [currentSnapshot, restoreSnapshot]);

  const revertDraft = useCallback(() => {
    const nextLatex = lastCommittedRef.current;
    if (draftRef.current !== nextLatex) {
      // Reverting discards the visible draft; keep it reachable via undo.
      recordUndoSnapshot(currentSnapshot());
    }
    externalLatexRef.current = nextLatex;
    draftRef.current = nextLatex;
    setCommitted(nextLatex);
    setDraft(nextLatex);
    onDraftClearRef.current?.();
  }, [currentSnapshot, recordUndoSnapshot]);

  const [transcribeState, setTranscribeState] = useState<
    "idle" | "loading" | "failed"
  >("idle");
  const [transcribeFailure, setTranscribeFailure] =
    useState<FormulaTranscribeFailure>("failed");
  const onTranscribeRef = useRef(onTranscribe);
  useEffect(() => {
    onTranscribeRef.current = onTranscribe;
  }, [onTranscribe]);

  const runTranscribe = useCallback(async () => {
    const transcribe = onTranscribeRef.current;
    if (!transcribe) return;
    setTranscribeState("loading");
    try {
      const latexBody = (await transcribe()).trim();
      if (!latexBody) {
        setTranscribeFailure("unreadable");
        setTranscribeState("failed");
        return;
      }
      // Load as an undoable draft — never auto-apply: the model can misread
      // and the user must verify against the rendered glyphs first.
      recordUndoSnapshot(currentSnapshot());
      draftRef.current = latexBody;
      setDraft(latexBody);
      onDraftChangeRef.current?.(latexBody);
      setTranscribeState("idle");
      sourceRef.current?.focus({ preventScroll: true });
    } catch (error) {
      // Unreadable crop, unavailable service and anything else read
      // differently: the first wants the source typed, the second a retry.
      setTranscribeFailure(formulaTranscribeFailure(error));
      setTranscribeState("failed");
    }
  }, [currentSnapshot, recordUndoSnapshot]);

  const applyTemplate = useCallback(
    (template: PdfFormulaSourceTemplate) => {
      const source = sourceRef.current;
      const currentDraft = draftRef.current;
      const selectionStart = source?.selectionStart ?? currentDraft.length;
      const selectionEnd = source?.selectionEnd ?? selectionStart;
      const next = applyPdfFormulaSourceTemplate({
        source: currentDraft,
        selectionStart,
        selectionEnd,
        template,
      });
      if (next.source !== currentDraft) {
        recordUndoSnapshot({
          value: currentDraft,
          selectionStart,
          selectionEnd,
        });
      }
      draftRef.current = next.source;
      setDraft(next.source);
      onDraftChangeRef.current?.(next.source);

      const restoreSelection = () => {
        const liveSource = sourceRef.current;
        if (!liveSource) return;
        liveSource.focus({ preventScroll: true });
        liveSource.setSelectionRange(next.selectionStart, next.selectionEnd);
      };
      if (typeof window !== "undefined") {
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(restoreSelection);
        } else {
          window.setTimeout(restoreSelection, 0);
        }
      }
    },
    [recordUndoSnapshot],
  );

  const focusSource = useCallback(() => {
    const restoreFocus = () =>
      sourceRef.current?.focus({ preventScroll: true });
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restoreFocus);
    } else {
      window.setTimeout(restoreFocus, 0);
    }
  }, []);

  const closeVisualEditor = useCallback(() => {
    visualOpenRef.current = false;
    setVisualSeed(null);
    focusSource();
  }, [focusSource]);

  const acceptVisualDraft = useCallback(
    (nextLatex: string) => {
      const seed = visualSeed;
      // The shared editor validates before Done. Repeat the PDF boundary check
      // and require the source draft to still be the exact seed so a late
      // visual completion can never overwrite a newer external/source edit.
      if (
        seed === null ||
        draftRef.current !== seed ||
        pdfFormulaLatexSourceError(nextLatex)
      ) {
        closeVisualEditor();
        return;
      }
      if (nextLatex !== seed) {
        recordUndoSnapshot(currentSnapshot());
        draftRef.current = nextLatex;
        setDraft(nextLatex);
        onDraftChangeRef.current?.(nextLatex);
      }
      closeVisualEditor();
    },
    [closeVisualEditor, currentSnapshot, recordUndoSnapshot, visualSeed],
  );

  useEffect(() => {
    return () => {
      if (shouldCommitOnUnmountRef.current?.() === false) return;
      if (pdfFormulaLatexSourceError(draftRef.current)) return;
      commitLatex(draftRef.current, false);
      onDraftClearRef.current?.();
    };
  }, [commitLatex]);

  useEffect(() => {
    const flushSource = (event: Event) => {
      const nextLatex = draftRef.current;
      const isDirtyDraft = nextLatex !== lastCommittedRef.current;
      if (pdfFormulaLatexSourceError(nextLatex)) {
        if (!isDirtyDraft) return;
        event.preventDefault();
        sourceRef.current?.focus({ preventScroll: true });
        return;
      }
      if (isDirtyDraft) commitDraft(nextLatex);
    };
    window.addEventListener(PDF_FORMULA_SOURCE_FLUSH_EVENT, flushSource);
    return () =>
      window.removeEventListener(PDF_FORMULA_SOURCE_FLUSH_EVENT, flushSource);
  }, [commitDraft]);

  const isDirty = draft !== committed;
  const validationError = useMemo(
    () => pdfFormulaLatexSourceError(draft),
    [draft],
  );
  const validationReason = formulaSourceErrorLabel(
    validationError,
    errorLabels,
  );
  // An untranscribed formula (no reliable PDF source text) starts empty by
  // design: guide the user instead of flagging an "empty source" error.
  const showTranscriptionHint = Boolean(transcriptionHint) && !draft.trim();
  const validationTitle = validationError
    ? `${invalidLabel}: ${validationReason ?? validationError}`
    : label;
  const canApply = isDirty && !validationError;
  const keepTextareaFocused = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  const handleSourceBlur = useCallback(
    (event: ReactFocusEvent<HTMLTextAreaElement>) => {
      // The visual editor is a portaled continuation of this exact draft, not
      // a departure from the PDF formula editor. Do not let its focus transfer
      // trigger the source textarea's ordinary blur-to-Apply compatibility.
      if (visualOpenRef.current) return;
      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        editorRef.current?.contains(nextTarget)
      ) {
        return;
      }
      commitDraft();
    },
    [commitDraft],
  );
  const sourceButtonStyle: CSSProperties = {
    lineHeight: 1,
    padding: 0,
    border: "1px solid var(--pdf-chrome-field-border, #d1d5db)",
    borderRadius: 4,
    background: "var(--pdf-chrome-field, #fff)",
    cursor: canApply ? "pointer" : "default",
    color: "var(--pdf-chrome-ink, #0f172a)",
    width: 28,
    height: 24,
    minWidth: 28,
    minHeight: 24,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      <div
        ref={editorRef}
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div
          data-testid="pdf-formula-source-tools"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 4,
            minHeight: 24,
          }}
        >
          <button
            type="button"
            data-testid="pdf-formula-visual-open"
            aria-haspopup="dialog"
            aria-expanded={visualSeed !== null}
            aria-label={visualModeLabel}
            title={validationError ? validationTitle : visualModeLabel}
            disabled={Boolean(validationError)}
            onMouseDown={keepTextareaFocused}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (pdfFormulaLatexSourceError(draftRef.current)) return;
              visualOpenRef.current = true;
              setVisualSeed(draftRef.current);
            }}
            style={{
              height: 24,
              minHeight: 24,
              padding: "0 7px",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: "1px solid var(--pdf-chrome-accent-line, var(--console-border-flat, #99f6e4))",
              borderRadius: 4,
              background: "var(--pdf-chrome-accent-soft, var(--console-accent-tint-soft, #f0fdfa))",
              color: "var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0f766e))",
              fontSize: 11,
              lineHeight: 1,
              cursor: validationError ? "not-allowed" : "pointer",
              opacity: validationError ? 0.45 : 1,
            }}
          >
            <Sigma aria-hidden="true" size={13} />
            {visualModeLabel}
          </button>
          {FORMULA_SOURCE_TEMPLATE_TOOLS.map(({ template, symbol }) => (
            <button
              key={template}
              type="button"
              data-testid="pdf-formula-source-template"
              data-template={template}
              aria-label={templateLabels[template]}
              title={templateLabels[template]}
              onMouseDown={keepTextareaFocused}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                applyTemplate(template);
              }}
              style={{
                width: 30,
                height: 24,
                minWidth: 30,
                minHeight: 24,
                padding: 0,
                border: "1px solid var(--pdf-chrome-accent-line-soft, var(--console-border-flat, #ccfbf1))",
                borderRadius: 4,
                background: "var(--pdf-chrome-accent-soft, var(--console-accent-tint-soft, #f0fdfa))",
                color: "var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0f766e))",
                fontFamily: FORMULA_EDITOR_FONT_FAMILY,
                fontSize: 12,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              {symbol}
            </button>
          ))}
        </div>
        <textarea
          ref={sourceRef}
          data-testid="pdf-formula-source"
          data-dirty={isDirty ? "true" : undefined}
          data-invalid={validationError ? "true" : undefined}
          data-error={validationError ?? undefined}
          aria-label={label}
          aria-invalid={validationError ? true : undefined}
          title={validationTitle}
          value={draft}
          autoFocus
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            if (nextDraft === draftRef.current) return;
            const selection = selectionBeforeEditRef.current;
            recordUndoSnapshot({
              value: draftRef.current,
              selectionStart: selection?.start ?? draftRef.current.length,
              selectionEnd: selection?.end ?? draftRef.current.length,
            });
            draftRef.current = nextDraft;
            setDraft(nextDraft);
            onDraftChangeRef.current?.(nextDraft);
          }}
          onBlur={handleSourceBlur}
          onKeyDown={(event) => {
            const target = event.currentTarget;
            selectionBeforeEditRef.current = {
              start: target.selectionStart ?? target.value.length,
              end: target.selectionEnd ?? target.value.length,
            };
            if (
              (event.metaKey || event.ctrlKey) &&
              !event.altKey &&
              event.key.toLowerCase() === "z"
            ) {
              // Native undo cannot work on a controlled textarea; route the
              // shortcut through the editor's own draft history instead.
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) {
                redoDraftEdit();
              } else {
                undoDraftEdit();
              }
            } else if (
              (event.metaKey || event.ctrlKey) &&
              event.key === "Enter"
            ) {
              event.preventDefault();
              event.stopPropagation();
              if (commitDraft()) {
                event.currentTarget.blur();
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (isDirty) {
                revertDraft();
              } else {
                onDismiss?.();
              }
            } else if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === "f"
            ) {
              return;
            } else {
              event.stopPropagation();
            }
          }}
          spellCheck={false}
          rows={4}
          style={{
            width: "100%",
            minHeight: 0,
            flex: "1 1 auto",
            boxSizing: "border-box",
            resize: "none",
            border: validationError
              ? "1px solid var(--pdf-chrome-danger-border, #fca5a5)"
              : "1px solid var(--pdf-chrome-accent-line-soft, var(--console-border-flat, #ccfbf1))",
            borderRadius: 4,
            padding: "5px 7px",
            outline: "none",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.35,
            color: "var(--pdf-chrome-ink, #0f172a)",
            background: "var(--pdf-chrome-accent-soft, var(--console-accent-tint-soft, #f0fdfa))",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            minHeight: 24,
          }}
        >
          <span
            data-testid="pdf-formula-source-status"
            data-error={
              showTranscriptionHint ? undefined : (validationError ?? undefined)
            }
            data-transcription-needed={
              showTranscriptionHint ? "true" : undefined
            }
            title={
              showTranscriptionHint
                ? transcriptionHint
                : validationError
                  ? validationTitle
                  : undefined
            }
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: showTranscriptionHint
                ? "var(--pdf-chrome-warning-hint, #b45309)"
                : validationError
                  ? "var(--pdf-chrome-danger, #b91c1c)"
                  : isDirty
                    ? "var(--pdf-chrome-accent-ink, #0f766e)"
                    : "var(--pdf-chrome-muted, #64748b)",
              fontSize: 11,
              lineHeight: 1.2,
            }}
          >
            {showTranscriptionHint
              ? transcriptionHint
              : validationError
                ? `${invalidLabel}: ${validationReason ?? validationError}`
                : isDirty
                  ? dirtyLabel
                  : cleanLabel}
          </span>
          <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              data-testid="pdf-formula-source-revert"
              onMouseDown={keepTextareaFocused}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                revertDraft();
              }}
              disabled={!isDirty}
              aria-label={revertLabel}
              title={revertLabel}
              style={{
                ...sourceButtonStyle,
                opacity: isDirty ? 1 : 0.45,
              }}
            >
              <RotateCcw aria-hidden="true" size={13} />
            </button>
            <button
              type="button"
              data-testid="pdf-formula-source-apply"
              onMouseDown={keepTextareaFocused}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commitDraft();
              }}
              disabled={!canApply}
              aria-label={applyLabel}
              // A disabled Apply must explain itself: surface the blocking
              // validation error (or transcription hint) instead of the
              // action label.
              title={
                showTranscriptionHint
                  ? transcriptionHint
                  : validationError
                    ? validationTitle
                    : applyLabel
              }
              style={{
                ...sourceButtonStyle,
                color: "var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0f766e))",
                borderColor: "var(--pdf-chrome-accent-line, var(--console-border-flat, #99f6e4))",
                opacity: canApply ? 1 : 0.45,
              }}
            >
              <Check aria-hidden="true" size={14} />
            </button>
          </span>
        </div>
      </div>
      {visualSeed !== null ? (
        <PdfFormulaVisualEditorDialog
          latex={visualSeed}
          onAccept={acceptVisualDraft}
          onCancel={closeVisualEditor}
        />
      ) : null}
      {showTranscriptionHint ? (
        <div
          data-testid="pdf-formula-preview"
          data-transcription-needed="true"
          title={transcriptionHint}
          style={{
            minHeight: 56,
            maxHeight: 104,
            width: "100%",
            overflow: "auto",
            color: "var(--pdf-chrome-warning-ink, #92400e)",
            background: "var(--pdf-chrome-warning-bg, #fffbeb)",
            border: "1px solid var(--pdf-chrome-warning-border, #fde68a)",
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 12,
            lineHeight: 1.35,
            boxSizing: "border-box",
          }}
        >
          <div>{transcriptionHint}</div>
          {onTranscribe && transcribeLabels ? (
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {null}
              {transcribeState === "failed" ? (
                <span
                  data-testid="pdf-formula-transcribe-failed"
                  data-failure={transcribeFailure}
                  role="status"
                  style={{
                    color: "var(--pdf-chrome-danger, #b91c1c)",
                    fontSize: 11,
                  }}
                >
                  {(transcribeFailure === "failed"
                    ? undefined
                    : transcribeLabels[transcribeFailure]) ??
                    transcribeLabels.failed}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : validationError ? (
        <div
          data-testid="pdf-formula-preview"
          data-invalid="true"
          data-error={validationError}
          title={validationTitle}
          style={{
            minHeight: 56,
            maxHeight: 104,
            width: "100%",
            overflow: "auto",
            color: "var(--pdf-chrome-danger, #b91c1c)",
            background: "var(--pdf-chrome-error-bg, #fff7ed)",
            border: "1px solid var(--pdf-chrome-error-border, #fed7aa)",
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 12,
            lineHeight: 1.35,
            boxSizing: "border-box",
          }}
        >
          {validationReason ?? invalidLabel}
        </div>
      ) : (
        <>
          <PdfFormulaPreview latex={draft} color={color} />
          {(() => {
            // The arithmetic subset computes right here — showing the value
            // turns this panel into a calculator for exactly the formulas a
            // textbook page contains. Anything symbolic stays silent: a wrong
            // number under a formula is worse than no number.
            const computed = computeFormulaValue(draft);
            if (computed.ok) {
              return (
                <div
                  data-testid="pdf-formula-computed-value"
                  style={{
                    fontSize: 12,
                    color:
                      "var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0a7d72))",
                    padding: "2px 2px 0",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {`= ${computed.display}`}
                </div>
              );
            }
            // One free variable: a curve. Sampled over a fixed window; poles
            // break the path rather than drawing their asymptotes.
            const compiled = compileFormulaFunction(draft);
            if (!compiled) return null;
            const segments = samplePlotSegments(compiled);
            const points = segments.flatMap((segment) => segment.points);
            if (points.length < 2) return null;
            const ys = points.map((point) => point.y);
            let minY = Math.min(...ys);
            let maxY = Math.max(...ys);
            if (maxY - minY < 1e-9) {
              minY -= 1;
              maxY += 1;
            }
            const W = 220;
            const H = 72;
            const sx = (x: number) => ((x + 5) / 10) * W;
            const sy = (y: number) => H - ((y - minY) / (maxY - minY)) * H;
            return (
              <svg
                data-testid="pdf-formula-plot"
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: "100%", height: H, display: "block" }}
                role="img"
                aria-label={`f(${compiled.variable})`}
              >
                {minY < 0 && maxY > 0 ? (
                  <line
                    x1={0}
                    x2={W}
                    y1={sy(0)}
                    y2={sy(0)}
                    stroke="var(--pdf-chrome-plot-axis, #d1d5db)"
                    strokeWidth={1}
                  />
                ) : null}
                <line
                  x1={sx(0)}
                  x2={sx(0)}
                  y1={0}
                  y2={H}
                  stroke="var(--pdf-chrome-plot-axis, #d1d5db)"
                  strokeWidth={1}
                />
                {segments.map((segment, index) => (
                  <path
                    key={index}
                    d={segment.points
                      .map(
                        (point, at) =>
                          `${at === 0 ? "M" : "L"}${sx(point.x).toFixed(1)} ${sy(point.y).toFixed(1)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke="var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0a7d72))"
                    strokeWidth={1.5}
                  />
                ))}
              </svg>
            );
          })()}
        </>
      )}
    </>
  );
}

function firstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }
  for (const child of Array.from(node.childNodes)) {
    const text = firstTextNode(child);
    if (text) return text;
  }
  return null;
}

function setCaret(node: HTMLElement, textNode: Text, offset: number): boolean {
  const doc = node.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return false;
  const textLength = textNode.textContent?.length ?? 0;
  const safeOffset = Math.max(0, Math.min(textLength, offset));
  const range = doc.createRange();
  range.setStart(textNode, safeOffset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function textLengthAtNodeOffset(node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.max(0, Math.min(node.textContent?.length ?? 0, offset));
  }
  return Array.from(node.childNodes)
    .slice(0, Math.max(0, offset))
    .reduce((total, child) => total + (child.textContent?.length ?? 0), 0);
}

function textOffsetFromNodeOffset(
  root: HTMLElement,
  offsetNode: Node,
  offset: number,
): number | null {
  let total = 0;
  let found = false;

  const visit = (node: Node) => {
    if (found) return;
    if (node === offsetNode) {
      total += textLengthAtNodeOffset(node, offset);
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child);
      if (found) return;
    }
  };

  visit(root);
  return found ? total : null;
}

function setCaretByTextOffset(node: HTMLElement, offset: number): boolean {
  const safeOffset = Math.max(0, offset);
  let remaining = safeOffset;
  let lastTextNode: Text | null = null;

  const visit = (current: Node): boolean => {
    if (current.nodeType === Node.TEXT_NODE) {
      const textNode = current as Text;
      lastTextNode = textNode;
      const length = textNode.textContent?.length ?? 0;
      if (remaining <= length) {
        return setCaret(node, textNode, remaining);
      }
      remaining -= length;
      return false;
    }
    for (const child of Array.from(current.childNodes)) {
      if (visit(child)) return true;
    }
    return false;
  };

  if (visit(node)) return true;
  const fallbackTextNode = lastTextNode as Text | null;
  if (fallbackTextNode) {
    return setCaret(
      node,
      fallbackTextNode,
      fallbackTextNode.textContent?.length ?? 0,
    );
  }
  const emptyText = node.ownerDocument.createTextNode("");
  node.appendChild(emptyText);
  return setCaret(node, emptyText, 0);
}

function textPositionAtOffset(
  node: HTMLElement,
  offset: number,
): { textNode: Text; offset: number } {
  let remaining = Math.max(0, offset);
  let lastTextNode: Text | null = null;

  const visit = (current: Node): { textNode: Text; offset: number } | null => {
    if (current.nodeType === Node.TEXT_NODE) {
      const textNode = current as Text;
      lastTextNode = textNode;
      const length = textNode.textContent?.length ?? 0;
      if (remaining <= length) {
        return { textNode, offset: remaining };
      }
      remaining -= length;
      return null;
    }
    for (const child of Array.from(current.childNodes)) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };

  const found = visit(node);
  if (found) return found;
  const fallbackTextNode = lastTextNode as Text | null;
  if (fallbackTextNode) {
    return {
      textNode: fallbackTextNode,
      offset: fallbackTextNode.textContent?.length ?? 0,
    };
  }
  const emptyText = node.ownerDocument.createTextNode("");
  node.appendChild(emptyText);
  return { textNode: emptyText, offset: 0 };
}

function setSelectionByTextOffsets(
  node: HTMLElement,
  start: number,
  end: number,
  graphemeSafe = false,
): boolean {
  const doc = node.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return false;
  let safeStart = Math.max(0, Math.min(start, end));
  let safeEnd = Math.max(0, Math.max(start, end));
  if (graphemeSafe) {
    const text = node.textContent ?? "";
    if (safeStart === safeEnd) {
      safeStart = closestCharacterBoundary(text, safeStart);
      safeEnd = safeStart;
    } else {
      safeStart = characterBoundaryAtOrBefore(text, safeStart);
      safeEnd = characterBoundaryAtOrAfter(text, safeEnd);
    }
  }
  const rangeStart = textPositionAtOffset(node, safeStart);
  const rangeEnd = textPositionAtOffset(node, safeEnd);
  const range = doc.createRange();
  range.setStart(rangeStart.textNode, rangeStart.offset);
  range.setEnd(rangeEnd.textNode, rangeEnd.offset);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function setCaretFromNodeOffset(
  node: HTMLElement,
  offsetNode: Node | null | undefined,
  offset: number | null | undefined,
  graphemeSafe = false,
): boolean {
  if (!offsetNode || offset == null) return false;
  if (graphemeSafe) {
    // Chromium can report the contenteditable root itself at offset 0 for a
    // click near the right edge. That is not a real "home" click; let glyph
    // geometry resolve it. Non-zero root offsets are meaningful boundaries
    // between styled child spans and can be converted to a global text offset.
    if (
      offsetNode === node &&
      offset === 0 &&
      (node.textContent?.length ?? 0) > 0
    ) {
      return false;
    }
    if (offsetNode !== node && !node.contains(offsetNode)) return false;
    const textOffset = textOffsetFromNodeOffset(node, offsetNode, offset);
    if (textOffset == null) return false;
    return setCaretByTextOffset(
      node,
      closestCharacterBoundary(node.textContent ?? "", textOffset),
    );
  }
  if (offsetNode.nodeType === Node.TEXT_NODE && node.contains(offsetNode)) {
    return setCaret(node, offsetNode as Text, offset);
  }
  // Chrome can report the contenteditable root itself at offset 0 for a click
  // near the right edge of a one-line box. Treat that as inconclusive so the
  // caller can fall back to glyph geometry instead of jumping the caret home.
  if (offsetNode === node) return false;
  return false;
}

function offsetFromCharacterRects(
  node: HTMLElement,
  textNode: Text,
  clientX: number,
): number | null {
  const text = textNode.textContent ?? "";
  if (!text) return 0;
  const doc = node.ownerDocument;
  for (let index = 0; index < text.length; index += 1) {
    const range = doc.createRange();
    range.setStart(textNode, index);
    range.setEnd(textNode, index + 1);
    if (typeof range.getBoundingClientRect !== "function") {
      range.detach();
      return null;
    }
    const rect = pdfRangeGlyphRect(range);
    range.detach();
    if (rect.width <= 0 && rect.height <= 0) continue;
    if (clientX < rect.left + rect.width / 2) return index;
  }
  return text.length;
}


function approximateTextOffsetFromBox(
  node: HTMLElement,
  clientX: number,
): number | null {
  const text = node.textContent ?? "";
  if (!text) return 0;
  const rect = node.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return text.length;
  const edgePad = Math.max(2, Math.min(12, rect.width * 0.06));
  if (clientX <= rect.left + edgePad) return 0;
  if (clientX >= rect.right - edgePad) return text.length;

  const boundaries = characterBoundaryIndexes(text);
  if (boundaries.length <= 1) return text.length;
  const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const boundaryIndex = Math.max(
    0,
    Math.min(
      boundaries.length - 1,
      Math.round(fraction * (boundaries.length - 1)),
    ),
  );
  return boundaries[boundaryIndex] ?? text.length;
}

function edgeTextOffsetFromBox(
  node: HTMLElement,
  clientX: number,
): number | null {
  const text = node.textContent ?? "";
  if (!text) return 0;
  const rect = node.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width <= 0) return null;
  const edgePad = Math.max(2, Math.min(12, rect.width * 0.06));
  if (clientX <= rect.left + edgePad) return 0;
  if (clientX >= rect.right - edgePad) return text.length;
  return null;
}

function placeCaretFromPoint(
  node: HTMLElement,
  clientX: number,
  clientY: number,
  stable = false,
): boolean {
  const edgeOffset = edgeTextOffsetFromBox(node, clientX);
  if (edgeOffset != null) {
    return setCaretByTextOffset(node, edgeOffset);
  }

  const doc = node.ownerDocument as DocumentWithCaretPoint;
  if (stable) {
    // Chromium can return a valid-looking caret from a different visual line
    // when a contenteditable paragraph is composed from positioned style-run
    // spans. For explicit multi-line boxes, Range geometry is the reliable
    // source of truth because it scores every grapheme in both axes. This also
    // keeps a click after a short final line from jumping into an earlier line.
    if (hasHardLineBreak(node.textContent ?? "")) {
      const textOffset = textOffsetFromCharacterRects(node, clientX, clientY);
      if (textOffset != null) {
        return setCaretByTextOffset(node, textOffset);
      }
    }
    // Let the browser's layout engine answer first. It understands ligatures,
    // bidi, kerning, and run boundaries better than any width heuristic.
    const caretPosition = doc.caretPositionFromPoint?.(clientX, clientY);
    if (
      setCaretFromNodeOffset(
        node,
        caretPosition?.offsetNode,
        caretPosition?.offset,
        true,
      )
    ) {
      return true;
    }
    const caretRange = doc.caretRangeFromPoint?.(clientX, clientY);
    if (
      setCaretFromNodeOffset(
        node,
        caretRange?.startContainer,
        caretRange?.startOffset,
        true,
      )
    ) {
      return true;
    }
    if (!hasHardLineBreak(node.textContent ?? "")) {
      const textOffset = textOffsetFromCharacterRects(node, clientX, clientY);
      if (textOffset != null) {
        return setCaretByTextOffset(node, textOffset);
      }
    }
  }

  const textNode = firstTextNode(node);
  if (!stable && textNode && !hasHardLineBreak(node.textContent ?? "")) {
    const characterOffset = offsetFromCharacterRects(node, textNode, clientX);
    if (characterOffset != null) {
      return setCaret(node, textNode, characterOffset);
    }
  }

  const caretPosition = doc.caretPositionFromPoint?.(clientX, clientY);
  if (
    setCaretFromNodeOffset(
      node,
      caretPosition?.offsetNode,
      caretPosition?.offset,
    )
  ) {
    return true;
  }

  const caretRange = doc.caretRangeFromPoint?.(clientX, clientY);
  if (
    setCaretFromNodeOffset(
      node,
      caretRange?.startContainer,
      caretRange?.startOffset,
    )
  ) {
    return true;
  }

  if (!textNode) return false;
  const fallbackOffset = offsetFromCharacterRects(node, textNode, clientX);
  const approximateOffset =
    fallbackOffset ?? approximateTextOffsetFromBox(node, clientX);
  return approximateOffset == null
    ? false
    : setCaretByTextOffset(node, approximateOffset);
}

function clampTextSelection(
  selection: TextSelectionSnapshot,
  textLength: number,
): TextSelectionSnapshot {
  const start = Math.max(0, Math.min(textLength, selection.start));
  const end = Math.max(0, Math.min(textLength, selection.end));
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function isCollapsedRootHomeSelection(
  node: HTMLElement,
  range: Range,
): boolean {
  return (
    range.collapsed &&
    range.startContainer === node &&
    range.endContainer === node &&
    range.startOffset === 0 &&
    range.endOffset === 0 &&
    (node.textContent?.length ?? 0) > 0
  );
}

function selectionOffsetsInNode(
  node: HTMLElement,
  fallbackSelection: TextSelectionSnapshot | null = null,
): TextSelectionSnapshot | null {
  const selection = node.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !node.contains(range.startContainer) ||
    !node.contains(range.endContainer)
  ) {
    return null;
  }
  if (
    isCollapsedRootHomeSelection(node, range) &&
    fallbackSelection &&
    fallbackSelection.start === fallbackSelection.end
  ) {
    return clampTextSelection(fallbackSelection, node.textContent?.length ?? 0);
  }
  const start = textOffsetFromNodeOffset(
    node,
    range.startContainer,
    range.startOffset,
  );
  const end = textOffsetFromNodeOffset(
    node,
    range.endContainer,
    range.endOffset,
  );
  if (start == null || end == null) return null;
  return clampTextSelection(
    { start: Math.min(start, end), end: Math.max(start, end) },
    node.textContent?.length ?? 0,
  );
}




function closestCharacterBoundary(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(text.length, offset));
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const boundary of characterBoundaryIndexes(text)) {
    const distance = Math.abs(boundary - clamped);
    // On an exact tie prefer the boundary after the glyph. This matches a
    // click on the glyph's right half and never leaves the caret mid-surrogate.
    if (distance <= closestDistance) {
      closest = boundary;
      closestDistance = distance;
    }
  }
  return closest;
}

function characterBoundaryAtOrBefore(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(text.length, offset));
  let result = 0;
  for (const boundary of characterBoundaryIndexes(text)) {
    if (boundary > clamped) break;
    result = boundary;
  }
  return result;
}

function characterBoundaryAtOrAfter(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(text.length, offset));
  for (const boundary of characterBoundaryIndexes(text)) {
    if (boundary >= clamped) return boundary;
  }
  return text.length;
}

function previousCharacterBoundary(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(text.length, offset));
  const boundaries = characterBoundaryIndexes(text);
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const boundary = boundaries[index] ?? 0;
    if (boundary < clamped) return boundary;
  }
  return 0;
}

function nextCharacterBoundary(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(text.length, offset));
  const boundaries = characterBoundaryIndexes(text);
  for (const boundary of boundaries) {
    if (boundary > clamped) return boundary;
  }
  return text.length;
}

function applyPlainTextDeletion(
  node: HTMLElement,
  key: "Backspace" | "Delete",
  fallbackSelection: TextSelectionSnapshot | null = null,
): TextSelectionSnapshot | null {
  const text = node.textContent ?? "";
  const selection = selectionOffsetsInNode(node, fallbackSelection);
  if (!selection) return null;

  let { start, end } = selection;
  if (start === end) {
    if (key === "Backspace") {
      if (start <= 0) return { start, end };
      start = previousCharacterBoundary(text, start);
    } else {
      if (end >= text.length) return { start: end, end };
      end = nextCharacterBoundary(text, end);
    }
  }

  const nextText = `${text.slice(0, start)}${text.slice(end)}`;
  node.textContent = nextText;
  setCaretByTextOffset(node, start);
  return { start, end: start };
}

function applyPlainTextInsertion(
  node: HTMLElement,
  insertedText: string,
  fallbackSelection: TextSelectionSnapshot | null = null,
): TextSelectionSnapshot | null {
  const selection = selectionOffsetsInNode(node, fallbackSelection);
  if (!selection) return null;

  const text = node.textContent ?? "";
  const nextText = `${text.slice(0, selection.start)}${insertedText}${text.slice(
    selection.end,
  )}`;
  const nextOffset = selection.start + insertedText.length;
  node.textContent = nextText;
  setCaretByTextOffset(node, nextOffset);
  return { start: nextOffset, end: nextOffset };
}

function normalizeSingleLineInputText(text: string): string {
  return text.replace(/[\r\n]+/g, " ");
}







function pastedPlainText(text: string, preserveLineBreaks: boolean): string {
  return preserveLineBreaks
    ? text.replace(/\r\n?/g, "\n")
    : normalizeSingleLineInputText(text);
}









export function editableNodePlainText(node: HTMLElement): string {
  if (!node.querySelector("br, div, p")) return node.textContent ?? "";
  let out = "";
  const walk = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3) {
        out += (child as Text).data;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const element = child as HTMLElement;
      const tag = element.tagName;
      if (tag === "BR") {
        if (element === parent.lastChild && out.length > 0) continue;
        out += "\n";
        continue;
      }
      if ((tag === "DIV" || tag === "P") && out && !out.endsWith("\n")) {
        out += "\n";
      }
      walk(element);
    }
  };
  walk(node);
  return out;
}

function autoFitSignature({
  boxId,
  text,
  fontSize,
  pageWidth,
  pageHeight,
}: {
  boxId: string;
  text: string;
  fontSize: number;
  pageWidth: number;
  pageHeight: number;
}): string {
  return `${boxId}\u0000${text}\u0000${fontSize}\u0000${pageWidth}x${pageHeight}`;
}

type TextMutationIntent = "delete" | "insert" | "other";

function intrinsicSingleLineTextWidth(node: HTMLDivElement): number | null {
  // Measure the content at its intrinsic inline size instead of adding padding
  // to a fixed-width element's scrollWidth. scrollWidth is local layout space,
  // so unlike a Range's viewport rect it is not distorted by box rotation.
  const previous = {
    width: node.style.width,
    minWidth: node.style.minWidth,
    maxWidth: node.style.maxWidth,
  };
  try {
    node.style.width = "max-content";
    node.style.minWidth = "0";
    node.style.maxWidth = "none";
    const width = node.scrollWidth;
    if (Number.isFinite(width) && width > 0) return width;
  } finally {
    node.style.width = previous.width;
    node.style.minWidth = previous.minWidth;
    node.style.maxWidth = previous.maxWidth;
  }

  // jsdom has no intrinsic layout. A Range keeps deterministic DOM tests
  // useful and is also a defensive fallback for unusual browser engines.
  try {
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    range.detach();
    return Number.isFinite(rect.width) && rect.width > 0 ? rect.width : null;
  } catch {
    return null;
  }
}

function fitSingleLineTextBox({
  node,
  text,
  rect,
  fontSize,
  pageWidth,
  pageHeight,
  created,
  kind,
  stabilityV2 = false,
  mutation = "other",
  minimumWidthFraction,
  maxWidthFraction,
}: {
  node: HTMLDivElement | null | undefined;
  text: string;
  rect: BoxRect;
  fontSize: number;
  pageWidth: number;
  pageHeight: number;
  created?: boolean;
  kind?: TextBox["kind"];
  stabilityV2?: boolean;
  mutation?: TextMutationIntent;
  minimumWidthFraction?: number;
  maxWidthFraction?: number;
}): { rect: BoxRect; fontSize: number; saturated: boolean } | null {
  if (
    created ||
    kind === "formula" ||
    hasHardLineBreak(text) ||
    !node ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return null;
  }
  const contentWidth = stabilityV2
    ? intrinsicSingleLineTextWidth(node)
    : node.scrollWidth;
  if (contentWidth == null) return null;
  const measuredWidth = Math.ceil(contentWidth + TEXTBOX_AUTO_FIT_PADDING_PX);
  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) return null;
  const currentWidth = rect.width * pageWidth;
  const pageAvailableWidthFraction = Math.max(
    MIN_TEXTBOX_WIDTH_FRAC,
    1 - rect.x - TEXTBOX_PAGE_EDGE_PADDING_FRAC,
  );
  const boundedAvailableWidthFraction =
    Number.isFinite(maxWidthFraction) && (maxWidthFraction as number) > 0
      ? Math.min(
          pageAvailableWidthFraction,
          Math.max(MIN_TEXTBOX_WIDTH_FRAC, maxWidthFraction as number),
        )
      : pageAvailableWidthFraction;
  const availableWidth = boundedAvailableWidthFraction * pageWidth;
  if (availableWidth <= 0) return null;

  let nextWidth = currentWidth;
  // The frame is as wide as the page edge / neighbour allows and the line is
  // still longer. The text is never shrunk to fit (WPS keeps the font size in
  // every case): the caller fixes the width and lets the text wrap inside it.
  let saturated = false;
  if (stabilityV2 && mutation === "delete") {
    // Deleting glyphs cannot legitimately require a wider box when font/style
    // stay constant. The legacy fixed-width scrollWidth measurement added its
    // 6px padding to the box on every Backspace. A real intrinsic measurement
    // can also repair that prior creep, but never below the original/manual
    // width floor supplied by the caller.
    const floorFraction =
      Number.isFinite(minimumWidthFraction) &&
      (minimumWidthFraction as number) > 0
        ? Math.min(rect.width, minimumWidthFraction as number)
        : Math.min(rect.width, MIN_TEXTBOX_WIDTH_FRAC);
    const floorWidth = Math.max(
      MIN_TEXTBOX_WIDTH_FRAC * pageWidth,
      floorFraction * pageWidth,
    );
    nextWidth = Math.max(
      floorWidth,
      Math.min(currentWidth, measuredWidth, availableWidth),
    );
  } else if (measuredWidth > currentWidth + 1) {
    nextWidth = Math.min(measuredWidth, availableWidth);
    saturated = measuredWidth > availableWidth + 1;
  }

  const widthChanged = Math.abs(nextWidth - currentWidth) > 1;
  if (!widthChanged && !saturated) return null;

  return {
    rect: {
      ...rect,
      width: Math.min(
        1,
        Math.max(MIN_TEXTBOX_WIDTH_FRAC, nextWidth / pageWidth),
      ),
    },
    fontSize,
    saturated,
  };
}

interface TextBoxContentHeightMeasurer {
  /** Content height in CSS px for a frame `widthPx` wide. */
  heightPx: (widthPx: number) => number;
  dispose: () => void;
}

/**
 * How tall `text` is when wrapped inside a frame of a given width, in the
 * box's own typography. A hidden probe is laid out by the browser's real line
 * breaker (the same `pre-wrap` + `break-word` the editable box uses) so the
 * frame the editor settles on is the frame the text actually fills; where no
 * layout engine exists the greedy estimate stands in. The probe lives until
 * `dispose` so a drag measures every pointer move against one element.
 */
function createTextBoxContentHeightMeasurer({
  node,
  text,
  runs,
  box,
  fontSizePx,
  pageHeight,
}: {
  node: HTMLElement | null | undefined;
  text: string;
  runs: PdfTextStyleRun[] | undefined;
  box: TextBox;
  fontSizePx: number;
  pageHeight: number;
}): TextBoxContentHeightMeasurer {
  const probe = document.createElement("div");
  const computed = node ? getComputedStyle(node) : null;
  Object.assign(probe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    margin: "0",
    padding: "0",
    border: "0",
    height: "auto",
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontSize: `${fontSizePx}px`,
    lineHeight: String(PDF_TEXTBOX_LINE_HEIGHT_RATIO),
    fontFamily: computed?.fontFamily || FONT_STACK.sans,
    fontWeight: computed?.fontWeight || "normal",
    fontStyle: computed?.fontStyle || "normal",
    letterSpacing: computed?.letterSpacing || "normal",
  });
  // A box with Word's spacing/indent/script formats wraps by its own
  // paragraph layout (text-box-typography.ts); measure it the same way.
  if (computed && node?.dataset.pdfTextboxTypography === "true") {
    Object.assign(probe.style, {
      fontSize: computed.fontSize,
      lineHeight: computed.lineHeight,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight,
      textIndent: computed.textIndent,
    });
  }
  probe.classList.add("pdf-textbox-source-baseline");
  if (node?.dataset.pdfTextboxSpaceBefore) probe.dataset.pdfTextboxSpaceBefore = node.dataset.pdfTextboxSpaceBefore;
  if (node?.dataset.pdfTextboxSpaceAfter) probe.dataset.pdfTextboxSpaceAfter = node.dataset.pdfTextboxSpaceAfter;
  writeTextStyleRunsToDom({
    node: probe,
    text,
    runs,
    lineLayout: undefined,
    box,
    boxWidth: 0,
    boxHeight: 0,
    pageHeight,
    showRunColors: false,
  });
  document.body.appendChild(probe);
  // Its tabs at their stops, as the box draws them.
  if (node?.dataset.pdfTextboxTabs) {
    probe.dataset.pdfTextboxTabs = node.dataset.pdfTextboxTabs;
    if (node.dataset.pdfTextboxTabIndent) probe.dataset.pdfTextboxTabIndent = node.dataset.pdfTextboxTabIndent;
    layOutBoxTabs(probe);
  }
  const fallbackMeasure = (value: string) =>
    measureTextAdvancePx(
      value,
      fontSizePx,
      probe.style.fontFamily,
      probe.style.fontWeight,
      probe.style.fontStyle,
    );
  return {
    heightPx(widthPx) {
      // A horizontally scaled box lays its text out in a frame 1/k as wide.
      const scale = Number(node?.dataset.pdfTextboxHscale ?? 100) / 100 || 1;
      probe.style.width = `${Math.max(1, widthPx / scale)}px`;
      const measured = probe.getBoundingClientRect().height;
      if (measured > 0) return Math.max(measured, fontSizePx * 1.25);
      return textBoxContentHeightForLines(
        estimateWrappedLineCount(text, widthPx, fallbackMeasure),
        fontSizePx,
      );
    },
    dispose() {
      probe.remove();
    },
  };
}

/**
 * WPS-style editable text boxes layered over a rendered PDF page. Each extracted
 * line is an inline-editable box positioned by page fraction; selecting a box
 * shows a frame with a move grip and eight resize handles. Editing the text or
 * moving/resizing a box emits a persisted PdfTextBoxEdit.
 */
export default function PdfTextBoxOverlay({
  boxes: givenBoxes,
  stackRanks,
  page,
  pageWidth,
  pageHeight,
  documentPageHeight,
  editsById: shownEditsById,
  onEditBox: giveEditBox,
  formulaDraftsByKey,
  onFormulaDraftsChange,
  active = true,
  addMode = false,
  onCreateBox,
  onDeleteBox,
  onCreatedBoxCommit,
  onTranscribeFormula,
  disabled = false,
  onSelectionChange,
  selectionResetKey = 0,
  focusBoxRequest = null,
  contextCommand,
  showDeleteButton = false,
  findMatches,
}: PdfTextBoxOverlayProps) {
  const t = useTranslations("console-notebooks");
  const locale = useLocale();
  // Each box as the newest this layer knows of it: the page's, or the one
  // this layer last gave the page while the page has not given it back
  // (lib/pdf/text-box-edits-ahead.ts). The page hands a changed box down a
  // task or a transition later, and a key typed before that was built from
  // the box of one or more keys ago: Bold pressed in a new box and a word
  // typed at once kept its bold run on the first key's box only.
  // The map is this layer's own copy, written to as a box is given
  // (onEditBox below), so a handler made by the last render reads the box
  // just given too -- no render stands between two keys.
  const [editsAhead] = useState<PdfTextBoxEditsAhead<PdfTextBoxEdit>>(() => new Map());
  const editsById = useMemo(
    () => pdfTextBoxEditsWithAhead(editsAhead, shownEditsById),
    [editsAhead, shownEditsById],
  );
  const editsByIdRef = useRef(editsById);
  const shownEditsByIdRef = useRef(shownEditsById);
  // Settled when the render is the page's for good, and before any other
  // effect of this layer gives a box: a render thrown away (a transition a
  // key cut short) has shown the page nothing.
  useLayoutEffect(() => {
    settlePdfTextBoxEditsAhead(editsAhead, shownEditsById);
    editsByIdRef.current = editsById;
    shownEditsByIdRef.current = shownEditsById;
  }, [editsAhead, editsById, shownEditsById]);
  const onEditBox = useCallback(
    (...given: Parameters<PdfTextBoxOverlayProps["onEditBox"]>) => {
      const [edit] = given;
      // A box the page keeps as a record of its own (one made here, a PDF
      // text box). A change to the page's own text has no such record: the
      // page answers it in its own way (the line's editor, or a refusal),
      // and the layer goes on from what the page shows.
      if (pdfTextBoxLaneWrites(edit)) {
        notePdfTextBoxEditGiven(editsAhead, edit.id, edit, shownEditsByIdRef.current[edit.id]);
        editsByIdRef.current[edit.id] = edit;
      }
      giveEditBox(...given);
    },
    [editsAhead, giveEditBox],
  );
  // A box that is drawn keeps its place among the boxes drawn with it: given
  // in another order (a box passing from one of the host's lists to another),
  // the element of the box being typed in was moved in the document, and
  // the caret went to its start (text-box-drawn-order.ts).
  const [drawnOrder, setDrawnOrder] = useState<readonly string[]>(NO_DRAWN_TEXT_BOXES);
  const boxes = useMemo(
    () => pdfTextBoxesInDrawnOrder(givenBoxes, drawnOrder),
    [drawnOrder, givenBoxes],
  );
  if (!pdfTextBoxDrawnOrderIs(boxes, drawnOrder)) setDrawnOrder(boxes.map((box) => box.id));
  // The fonts from readers' computers the page window keeps (Browse).
  const pageFontsInWindow = usePdfPageFontsInWindow();
  const findMarkByBoxId = useMemo(() => {
    const marks = new Map<string, "active" | "match">();
    for (const match of findMatches ?? []) {
      if (match.active) marks.set(match.boxId, "active");
      else if (!marks.has(match.boxId)) marks.set(match.boxId, "match");
    }
    return marks;
  }, [findMatches]);
  const activeFindBoxId =
    findMatches?.find((match) => match.active)?.boxId ?? null;
  const textEditStabilityV2 = pdfTextEditStabilityV2Enabled();
  const fontSizeDocumentHeight =
    typeof documentPageHeight === "number" &&
    Number.isFinite(documentPageHeight) &&
    documentPageHeight > 0
      ? documentPageHeight
      : pageHeight;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The box selected as an object (its frame clicked, no caret in its
  // words): Delete or Backspace removes it, as WPS and Word remove a text
  // box selected by its border.
  const [objectSelectedKey, setObjectSelectedKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewAngle, setPreviewAngle] = useState<number | null>(null);
  const [previewRect, setPreviewRect] = useState<BoxRect | null>(null);
  const [localFormulaDraftsByKey, setLocalFormulaDraftsByKey] = useState<
    Record<string, string>
  >({});
  const effectiveFormulaDraftsByKey =
    formulaDraftsByKey ?? localFormulaDraftsByKey;
  const setFormulaDrafts = useCallback(
    (
      drafts:
        | Record<string, string>
        | ((current: Record<string, string>) => Record<string, string>),
    ) => {
      if (onFormulaDraftsChange) {
        onFormulaDraftsChange(drafts);
      } else {
        setLocalFormulaDraftsByKey(drafts);
      }
    },
    [onFormulaDraftsChange],
  );
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const textBoxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Every box's tabs at its stops after each render (its words or its
  // stops may have changed): layOutBoxTabs keeps the text as it is.
  useLayoutEffect(() => {
    for (const node of textBoxRefs.current.values()) {
      if (node.dataset.pdfTextboxTabs || node.hasAttribute(PDF_TEXT_BOX_BARS_ATTR) ||
        node.querySelector(`span[${PDF_TEXT_BOX_TAB_ATTR}]`)) layOutBoxTabs(node);
    }
  });
  // What the last render decided each mounted box's input may do, for the
  // DOM beforeinput listener (handleNativeBeforeInput).
  const textBoxInputRulesRef = useRef<Map<string, TextBoxInputRule>>(
    new Map(),
  );
  // The horizontal condensation each line was measured at while it still
  // held the source's own text, kept so an edited line can be drawn the
  // way the page draws it instead of at the DOM's natural width.
  const lineScalesRef = useRef<Map<string, number[]>>(new Map());
  const renderGenerationRef = useRef(0);
  const lastTextEmitRef = useRef<Map<string, LastTextEmit>>(new Map());
  const lastAutoFitSignatureRef = useRef<Map<string, string>>(new Map());
  const deletingIdsRef = useRef<Set<string>>(new Set());
  const pointerDeletedIdsRef = useRef<Set<string>>(new Set());
  const skipFormulaSourceUnmountCommitRef = useRef<Set<string>>(new Set());
  const composingTextBoxKeysRef = useRef<Set<string>>(new Set());
  const textPointerStateRef = useRef<TextPointerState | null>(null);
  const deferredCaretRef = useRef<{ cancel: () => void } | null>(null);
  const caretOwnerRef = useRef({
    page,
    selectionResetKey,
    selectedId,
    active,
    disabled,
  });
  caretOwnerRef.current = {
    page,
    selectionResetKey,
    selectedId,
    active,
    disabled,
  };
  const pendingSelectionRef = useRef<SelectionSnapshot | null>(null);
  const lastSelectionRef = useRef<Map<string, TextSelectionSnapshot>>(
    new Map(),
  );
  // The box whose words are being typed in (focused, or held while the
  // ribbon has the pointer): a bare caret there formats no character.
  const typingBoxKeyRef = useRef<string | null>(null);
  // A format chosen at a bare caret in a box being typed in: no existing
  // character changes, the ribbon shows it, and the words typed next take
  
  // size went back to 14 and nothing happened).
  const [pendingTypingFormats, setPendingTypingFormats] = useState<
    Readonly<Record<string, PendingTypingFormat>>
  >({});
  const pendingTypingFormatsRef = useRef(pendingTypingFormats);
  const putPendingTypingFormat = useCallback((key: string, value: PendingTypingFormat | null) => {
    const current = pendingTypingFormatsRef.current;
    if (!value && !(key in current)) return;
    const next = { ...current };
    if (value) next[key] = value;
    else delete next[key];
    pendingTypingFormatsRef.current = next;
    setPendingTypingFormats(next);
  }, []);
  const lastContextCommandRef = useRef(0);
  const lastSelectionResetKeyRef = useRef(selectionResetKey);
  const disabledRef = useRef(disabled);
  const dragAuthorityGenerationRef = useRef(0);
  if (disabledRef.current !== disabled) {
    disabledRef.current = disabled;
    dragAuthorityGenerationRef.current += 1;
  }

  const stateKeyForId = useCallback(
    (id: string) => textBoxStateKey(page, id),
    [page],
  );

  const cancelDeferredCaret = useCallback(() => {
    const pending = deferredCaretRef.current;
    deferredCaretRef.current = null;
    pending?.cancel();
  }, []);

  // A box asked for from outside (a text box comment double-clicked on the
  // page): the caret goes in at the end of its text as soon as the box is
  // shown, once per request.
  const focusedBoxRequestRef = useRef<number | null>(null);
  // The pending WordArt placeholder selection (below): it outlives the
  // re-renders the box's own creation sets off, not the overlay.
  const placedWordArtSelectRef = useRef<(() => void) | null>(null);
  useEffect(() => () => placedWordArtSelectRef.current?.(), []);
  useEffect(() => {
    if (!focusBoxRequest || disabled || focusedBoxRequestRef.current === focusBoxRequest.nonce) return;
    const node = textBoxRefs.current.get(stateKeyForId(focusBoxRequest.id));
    if (!node) return;
    focusedBoxRequestRef.current = focusBoxRequest.nonce;
    node.focus({ preventScroll: true });
    // A WordArt just placed: its placeholder words selected, typed over as
    // in Word and PowerPoint. The box is made on the press, its words laid
    // in a frame or two later, and the press's own release would put a
    // caret where it ends: selected once the words are there, and again
    // when the press is let go.
    const placed = editsById[focusBoxRequest.id];
    placedWordArtSelectRef.current?.();
    placedWordArtSelectRef.current = null;
    if (placed?.created && placed.textPaint) {
      const key = stateKeyForId(focusBoxRequest.id);
      let frames = 0;
      let frame = 0;
      const select = () => {
        const target = textBoxRefs.current.get(key);
        const length = target?.textContent?.length ?? 0;
        if (target && length > 0) {
          if (target.ownerDocument.activeElement !== target) target.focus({ preventScroll: true });
          setSelectionByTextOffsets(target, 0, length, textEditStabilityV2);
          return;
        }
        if ((frames += 1) < 30) frame = requestAnimationFrame(select);
      };
      select();
      const document = node.ownerDocument;
      const reselect = () => { cancelAnimationFrame(frame); frames = 0; frame = requestAnimationFrame(select); };
      document.addEventListener("pointerup", reselect, { capture: true, once: true });
      const stop = window.setTimeout(() => document.removeEventListener("pointerup", reselect, true), 1500);
      placedWordArtSelectRef.current = () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(stop);
        document.removeEventListener("pointerup", reselect, true);
      };
      return;
    }
    setCaretByTextOffset(node, node.textContent?.length ?? 0);
  }, [focusBoxRequest, boxes, disabled, editsById, stateKeyForId, textEditStabilityV2]);

  useLayoutEffect(() => {
    cancelDeferredCaret();
    return cancelDeferredCaret;
  }, [active, cancelDeferredCaret, disabled, page, selectionResetKey]);

  // Like the presentation editor's selection receipts, a delayed caret belongs
  // to one intent and one live owner. Pointer, keyboard and focus changes win.
  // Listeners exist only while a request is pending, not for every idle page.
  const scheduleClickCaret = useCallback(
    (id: string, apply: (node: HTMLDivElement) => void) => {
      cancelDeferredCaret();
      const key = stateKeyForId(id);
      const node = textBoxRefs.current.get(key);
      if (!node) return;
      const owner = caretOwnerRef.current;
      const text = node.textContent;
      const document = node.ownerDocument;
      const cancelOnIntent = () => cancelDeferredCaret();
      const cancelOnFocus = (event: FocusEvent) => {
        if (event.target !== node) cancelDeferredCaret();
      };
      const cancelOnMultiClick = (event: MouseEvent) => {
        if (event.detail > 1) cancelDeferredCaret();
      };
      const release = () => {
        document.removeEventListener("pointerdown", cancelOnIntent, true);
        document.removeEventListener("keydown", cancelOnIntent, true);
        document.removeEventListener("beforeinput", cancelOnIntent, true);
        document.removeEventListener("compositionstart", cancelOnIntent, true);
        document.removeEventListener("focusin", cancelOnFocus, true);
        document.removeEventListener("click", cancelOnMultiClick, true);
      };
      const request = {
        cancel: () => {
          window.clearTimeout(timeout);
          release();
        },
      };
      const timeout = window.setTimeout(() => {
        if (deferredCaretRef.current !== request) return;
        deferredCaretRef.current = null;
        release();
        const current = caretOwnerRef.current;
        if (
          current.page !== owner.page ||
          current.selectionResetKey !== owner.selectionResetKey ||
          current.selectedId !== key ||
          !current.active ||
          current.disabled ||
          !node.isConnected ||
          textBoxRefs.current.get(key) !== node ||
          node.textContent !== text
        )
          return;
        apply(node);
      }, 0);
      deferredCaretRef.current = request;
      document.addEventListener("pointerdown", cancelOnIntent, true);
      document.addEventListener("keydown", cancelOnIntent, true);
      document.addEventListener("beforeinput", cancelOnIntent, true);
      document.addEventListener("compositionstart", cancelOnIntent, true);
      document.addEventListener("focusin", cancelOnFocus, true);
      document.addEventListener("click", cancelOnMultiClick, true);
    },
    [cancelDeferredCaret, stateKeyForId],
  );

  useEffect(() => {
    renderGenerationRef.current += 1;
  });

  
  useEffect(() => {
    if (!activeFindBoxId) return;
    const node = textBoxRefs.current.get(stateKeyForId(activeFindBoxId));
    if (typeof node?.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [activeFindBoxId, findMatches, stateKeyForId]);

  const rememberTextEmit = useCallback((key: string, text: string) => {
    lastTextEmitRef.current.set(key, {
      text,
      generation: renderGenerationRef.current,
    });
  }, []);

  const selectionForBox = useCallback(
    (id: string, node: HTMLElement) => {
      const selection = selectionOffsetsInNode(
        node,
        lastSelectionRef.current.get(stateKeyForId(id)) ?? null,
      );
      if (!selection || !textEditStabilityV2) return selection;
      const text = node.textContent ?? "";
      if (selection.start === selection.end) {
        const offset = closestCharacterBoundary(text, selection.start);
        return { start: offset, end: offset };
      }
      return {
        start: characterBoundaryAtOrBefore(text, selection.start),
        end: characterBoundaryAtOrAfter(text, selection.end),
      };
    },
    [stateKeyForId, textEditStabilityV2],
  );

  const rememberSelection = useCallback(
    (id: string, selection: TextSelectionSnapshot | null) => {
      if (!selection) return;
      const key = stateKeyForId(id);
      lastSelectionRef.current.set(key, selection);
      pendingSelectionRef.current = { id: key, ...selection };
    },
    [stateKeyForId],
  );
  // The reader moved the caret elsewhere, or highlighted words: the format
  // held at the caret is let go (typing moves it along with the words).
  const releaseMovedTypingFormat = useCallback(
    (id: string, selection: TextSelectionSnapshot | null) => {
      if (!selection) return;
      const key = stateKeyForId(id);
      const held = pendingTypingFormatsRef.current[key];
      if (held && (selection.start !== selection.end || selection.start !== held.caret)) {
        putPendingTypingFormat(key, null);
      }
    },
    [putPendingTypingFormat, stateKeyForId],
  );

  const rememberFormulaDraft = useCallback(
    (id: string, latex: string) => {
      const key = stateKeyForId(id);
      setFormulaDrafts((current) =>
        current[key] === latex ? current : { ...current, [key]: latex },
      );
    },
    [setFormulaDrafts, stateKeyForId],
  );

  const clearFormulaDraft = useCallback(
    (id: string) => {
      const key = stateKeyForId(id);
      setFormulaDrafts((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [setFormulaDrafts, stateKeyForId],
  );

  const shouldCommitFormulaSourceOnUnmount = useCallback(
    (id: string) => {
      const key = stateKeyForId(id);
      if (!skipFormulaSourceUnmountCommitRef.current.delete(key)) return true;
      return false;
    },
    [stateKeyForId],
  );

  const focusTextBox = useCallback(
    (id: string, point?: CaretPoint) => {
      const key = stateKeyForId(id);
      const node = textBoxRefs.current.get(key);
      if (!node) return;
      node.focus({ preventScroll: true });
      if (!isPlainTextEditableNode(node)) return;
      if (
        point &&
        placeCaretFromPoint(
          node,
          point.clientX,
          point.clientY,
          textEditStabilityV2,
        )
      ) {
        const selection = selectionOffsetsInNode(node);
        if (selection) {
          lastSelectionRef.current.set(key, selection);
        }
        return;
      }
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // Focus is the important part; caret placement can fail in non-browser DOMs.
      }
      const selection = selectionOffsetsInNode(node);
      if (selection) {
        lastSelectionRef.current.set(key, selection);
      }
    },
    [stateKeyForId, textEditStabilityV2],
  );

  const revealTextBox = useCallback((key: string) => {
    const reveal = () => {
      const node = textBoxRefs.current.get(key);
      node?.scrollIntoView?.({ block: "center", inline: "nearest" });
      node?.focus?.({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(reveal);
    } else {
      window.setTimeout(reveal, 0);
    }
  }, []);

  const clearSelection = useCallback(
    (id: string | null = selectedId) => {
      if (id) {
        const node = textBoxRefs.current.get(id);
        if (node && document.activeElement === node) {
          node.blur();
        }
      }
      const overlay = overlayRef.current;
      const activeElement = document.activeElement;
      if (
        overlay &&
        activeElement instanceof HTMLElement &&
        overlay.contains(activeElement)
      ) {
        activeElement.blur();
      }
      setSelectedId(null);
    },
    [selectedId],
  );

  useEffect(() => {
    if ((active && !disabled) || !selectedId) return;
    const timeout = window.setTimeout(() => clearSelection(selectedId), 0);
    return () => window.clearTimeout(timeout);
  }, [active, clearSelection, disabled, selectedId]);

  useLayoutEffect(() => {
    if (lastSelectionResetKeyRef.current === selectionResetKey) return;
    lastSelectionResetKeyRef.current = selectionResetKey;
    clearSelection();
  }, [clearSelection, selectionResetKey]);

  const currentTextForBox = useCallback(
    (box: TextBox, existing: PdfTextBoxEdit | undefined) => {
      const kind = effectiveTextBoxKind(box, existing);
      if (kind === "formula") return existing?.text ?? box.text;
      return (
        textBoxRefs.current.get(stateKeyForId(box.id))?.textContent ??
        existing?.text ??
        box.text
      );
    },
    [stateKeyForId],
  );

  const syncTextBoxDomText = useCallback(
    (
      box: TextBox,
      edit: PdfTextBoxEdit | undefined,
      text: string,
      force = false,
    ) => {
      const key = stateKeyForId(box.id);
      const node = textBoxRefs.current.get(key);
      if (!node) return;
      const rect = edit
        ? { x: edit.x, y: edit.y, width: edit.width, height: edit.height }
        : { x: box.x, y: box.y, width: box.width, height: box.height };
      const lineLayout = textLineLayoutForBox(box, edit, text);
      const fitSourceLineWidths =
        textEditStabilityV2 && !edit && selectedId === key;
      const rememberScales = (scales: number[] | undefined) => {
        if (scales) lineScalesRef.current.set(key, scales);
      };
      // Once the text has changed the line can no longer be measured against
      // the source's advance width without squeezing it further on every
      // keystroke, so it keeps the condensation measured while it was still
      // the source's own.
      const rememberedScales =
        textEditStabilityV2 && edit ? lineScalesRef.current.get(key) : undefined;
      if (
        !force &&
        (document.activeElement === node ||
          pendingSelectionRef.current?.id === key)
      ) {
        // Do not rebuild a focused contenteditable: that destroys or moves its
        // native caret. Still synchronise presentation-only state. In
        // particular, PdfTextEditor removes a restored-to-source edit while the
        // node remains focused; leaving an inline run colour behind would paint
        // DOM glyphs over the newly revealed PDF canvas and create ghost text.
        setTextStyleRunColorsVisible(node, Boolean(edit));
        if (fitSourceLineWidths) {
          rememberScales(
            fitTextStyleLinesToSourceWidth(
              node,
              lineLayout,
              rect.width * pageWidth,
            ),
          );
        } else {
          applyRememberedTextStyleLineScales(node, rememberedScales);
        }
        return;
      }
      const written = writeTextStyleRunsToDom({
        node,
        text,
        runs: textStyleRunsForBox(box, edit, text),
        lineLayout,
        box,
        boxWidth: rect.width * pageWidth,
        boxHeight: rect.height * pageHeight,
        pageHeight,
        showRunColors: Boolean(edit),
        fitSourceLineWidths,
      });
      if (fitSourceLineWidths) rememberScales(written);
      else applyRememberedTextStyleLineScales(node, rememberedScales);
    },
    [pageHeight, pageWidth, selectedId, stateKeyForId, textEditStabilityV2],
  );

  const triggerDeleteBox = useCallback(
    (id: string) => {
      const key = stateKeyForId(id);
      deletingIdsRef.current.add(key);
      const node = textBoxRefs.current.get(key);
      if (node && document.activeElement === node) {
        node.blur();
      }
      setSelectedId(null);
      onDeleteBox?.(id);
      window.setTimeout(() => {
        deletingIdsRef.current.delete(key);
      }, 0);
    },
    [onDeleteBox, stateKeyForId],
  );

  // Auto-select a freshly CREATED box (Add-Text) so its frame + toolbar appear
  // and the user can type immediately — an empty white box on white paper would
  // otherwise be invisible. We select the newest created id that wasn't present
  // on the previous render (created ids are unique + monotonic per placement).
  const knownIdsRef = useRef<Set<string> | null>(null);
  const knownPageRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = knownIdsRef.current;
    const currentKeys = new Set(boxes.map((b) => stateKeyForId(b.id)));
    if (prev === null || knownPageRef.current !== page) {
      knownIdsRef.current = currentKeys;
      knownPageRef.current = page;
      return;
    }
    const newlyCreated = boxes.find(
      (b) => editsById[b.id]?.created && !prev.has(stateKeyForId(b.id)),
    );
    if (newlyCreated) {
      setSelectedId(stateKeyForId(newlyCreated.id));
      // A WordArt's placeholder is selected, to be typed over (the focus
      // request above holds it so past the press that placed the box).
      const node = textBoxRefs.current.get(stateKeyForId(newlyCreated.id));
      const length = node?.textContent?.length ?? 0;
      if (node && editsById[newlyCreated.id]?.textPaint && length > 0) {
        node.focus({ preventScroll: true });
        setSelectionByTextOffsets(node, 0, length, textEditStabilityV2);
      } else {
        focusTextBox(newlyCreated.id);
      }
    }
    knownIdsRef.current = currentKeys;
    knownPageRef.current = page;
  }, [boxes, editsById, focusTextBox, page, stateKeyForId, textEditStabilityV2]);

  // Selection should behave like a real document editor: a box stays selected
  // while the user edits it or uses its inline toolbar, but clicking anywhere
  // outside the overlay (PDF toolbar, page chrome, another window) or pressing
  // Escape clears the frame/handles. Without this, selection chrome could stick
  // around after focus moved elsewhere.
  useEffect(() => {
    if (!selectedId) return;

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const overlay = overlayRef.current;
      const target = event.target;
      if (overlay && target instanceof Node && overlay.contains(target)) {
        return;
      }
      if (pointerRetainsPdfObjectSelection(event)) return;
      clearSelection(selectedId);
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection(selectedId);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [clearSelection, selectedId]);

  const boxesByKey = useMemo(() => {
    const map: Record<string, TextBox> = {};
    for (const box of boxes) map[stateKeyForId(box.id)] = box;
    return map;
  }, [boxes, stateKeyForId]);

  // A created box selected as an object (its frame clicked, no caret in
  // it): Delete or Backspace removes it, as the delete button does. With
  // the caret in its words the keys edit the words.
  const objectSelectedBox =
    objectSelectedKey && objectSelectedKey === selectedId ? boxesByKey[objectSelectedKey] : undefined;
  const objectSelectedDeletable = Boolean(
    objectSelectedBox && !disabled && onDeleteBox &&
      editsById[objectSelectedBox.id]?.created && !editsById[objectSelectedBox.id]?.deleted,
  );
  useEffect(() => {
    if (!objectSelectedBox || !objectSelectedDeletable) return;
    const id = objectSelectedBox.id;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== "Delete" && event.key !== "Backspace")) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]"))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setObjectSelectedKey(null);
      triggerDeleteBox(id);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [objectSelectedBox, objectSelectedDeletable, triggerDeleteBox]);

  useEffect(() => {
    if (!onSelectionChange || disabled || !selectedId) return;
    const box = boxesByKey[selectedId];
    const node = box ? textBoxRefs.current.get(selectedId) : undefined;
    if (!box || !node) return;
    const rememberLiveSelection = () => {
      rememberSelection(box.id, selectionForBox(box.id, node));
    };
    document.addEventListener("selectionchange", rememberLiveSelection);
    return () =>
      document.removeEventListener("selectionchange", rememberLiveSelection);
  }, [
    boxesByKey,
    disabled,
    onSelectionChange,
    rememberSelection,
    selectedId,
    selectionForBox,
  ]);

  useEffect(() => {
    const flushFormulaDrafts = (event: Event) => {
      for (const [key, draftLatex] of Object.entries(
        effectiveFormulaDraftsByKey,
      )) {
        const box = boxesByKey[key];
        if (!box) continue;
        const edit = editsById[box.id];
        if (effectiveTextBoxKind(box, edit) !== "formula") continue;
        if (!pdfFormulaLatexSourceError(draftLatex)) continue;

        event.preventDefault();
        setSelectedId(key);
        revealTextBox(key);
        return;
      }
    };

    window.addEventListener(PDF_FORMULA_SOURCE_FLUSH_EVENT, flushFormulaDrafts);
    return () =>
      window.removeEventListener(
        PDF_FORMULA_SOURCE_FLUSH_EVENT,
        flushFormulaDrafts,
      );
  }, [boxesByKey, editsById, effectiveFormulaDraftsByKey, revealTextBox]);

  useLayoutEffect(() => {
    const activeIds = new Set<string>();
    for (const box of boxes) {
      activeIds.add(stateKeyForId(box.id));
      const edit = editsById[box.id];
      const kind = effectiveTextBoxKind(box, edit);
      if (kind !== "formula") {
        syncTextBoxDomText(box, edit, edit?.text ?? box.text);
      }
    }
    const staleSelectedId =
      selectedId && !activeIds.has(selectedId) ? selectedId : null;
    for (const id of Array.from(textBoxRefs.current.keys())) {
      if (!activeIds.has(id)) textBoxRefs.current.delete(id);
    }
    const pendingSelection = pendingSelectionRef.current;
    if (pendingSelection) {
      const node = textBoxRefs.current.get(pendingSelection.id);
      if (
        node &&
        isPlainTextEditableNode(node) &&
        (document.activeElement === node || selectedId === pendingSelection.id)
      ) {
        if (document.activeElement !== node) {
          node.focus({ preventScroll: true });
        }
        if (
          setSelectionByTextOffsets(
            node,
            pendingSelection.start,
            pendingSelection.end,
            textEditStabilityV2,
          )
        ) {
          lastSelectionRef.current.set(pendingSelection.id, {
            start: pendingSelection.start,
            end: pendingSelection.end,
          });
        }
      }
      pendingSelectionRef.current = null;
    }
    if (!staleSelectedId) return;
    const timeout = window.setTimeout(() => {
      setSelectedId((current) =>
        current === staleSelectedId ? null : current,
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    boxes,
    editsById,
    selectedId,
    stateKeyForId,
    syncTextBoxDomText,
    textEditStabilityV2,
  ]);

  // The original glyph region to persist on an edit: keep an already-recorded
  // origin stable across moves, but widen stale origins when the current
  // extracted source line proves it is the same line and now covers absorbed PDF
  // fragments (for example a legacy title box that stopped before `;ion`).
  const originFields = useCallback(
    (box: TextBox, existing: PdfTextBoxEdit | undefined) =>
      sourceOriginFieldsForExtractedTextEdit(box, existing),
    [],
  );

  // The current geometry of a box: a persisted edit overrides the extracted box.
  const rectOf = useCallback(
    (box: TextBox): BoxRect => {
      const edit = editsById[box.id];
      return edit
        ? { x: edit.x, y: edit.y, width: edit.width, height: edit.height }
        : { x: box.x, y: box.y, width: box.width, height: box.height };
    },
    [editsById],
  );

  /**
   * The height (page fraction) `text` needs inside `box` wrapped at
   * `widthFraction`, or null when the box is not text that wraps (a formula).
   */
  const contentHeightFractionFor = useCallback(
    (
      box: TextBox,
      existing: PdfTextBoxEdit | undefined,
      text: string,
      widthFraction: number,
    ): number | null => {
      if (pageWidth <= 0 || pageHeight <= 0) return null;
      if (effectiveTextBoxKind(box, existing) === "formula") return null;
      const measurer = createTextBoxContentHeightMeasurer({
        node: textBoxRefs.current.get(stateKeyForId(box.id)),
        text,
        runs: persistableRunsForBoxText(box, existing, text),
        box,
        fontSizePx: Math.max(6, (existing?.fontSize ?? box.fontSize) * pageHeight),
        pageHeight,
      });
      const heightPx = measurer.heightPx(widthFraction * pageWidth);
      measurer.dispose();
      return heightPx / pageHeight;
    },
    [pageHeight, pageWidth, stateKeyForId],
  );

  /** `rect` grown downward so it is at least as tall as its content (WPS). */
  const growRectToContent = useCallback(
    (rect: BoxRect, contentHeight: number | null): BoxRect => {
      if (contentHeight === null || !Number.isFinite(contentHeight)) return rect;
      const height = Math.max(
        rect.height,
        Math.min(contentHeight, Math.max(rect.height, 1 - rect.y)),
      );
      return height > rect.height + BOX_RECT_EPSILON ? { ...rect, height } : rect;
    },
    [],
  );

  // A format that makes the text taller (a larger size, a wider letter or
  // line spacing, indents, a scale) grows a created box's frame down to hold
  // it, as typing does (WPS "frame follows text"). The saved frame is what
  // the writer lays the text into: a frame left at the old height made the
  // writer shrink the whole box's font to fit, silently.
  useLayoutEffect(() => {
    if (disabled || pageHeight <= 0) return;
    for (const [key, node] of textBoxRefs.current) {
      const box = boxesByKey[key];
      const existing = box ? editsById[box.id] : undefined;
      if (
        !box ||
        !existing?.created ||
        existing.deleted ||
        // An imported FreeText nobody has edited is the author's object: a
        
        (existing.nativeSource && !existing.sourceAction) ||
        
        // measured in the line's metrics; this overlay's CSS line height
        // reads it 1.4x taller, and entering Add Text rewrote every such box
        
        existing.sourceText !== undefined ||
        effectiveTextBoxKind(box, existing) === "formula" ||
        (Array.isArray(existing.lineLayout) && existing.lineLayout.length > 0) ||
        !node.isConnected
      ) {
        continue;
      }
      const rect = rectOf(box);
      const grown = growRectToContent(rect, node.scrollHeight / pageHeight);
      if (grown !== rect) {
        onEditBox({ ...existing, height: grown.height }, { transient: true });
      }
    }
  }, [boxesByKey, disabled, editsById, growRectToContent, onEditBox, pageHeight, rectOf]);

  const maxAutoFitWidthForBox = useCallback(
    (box: TextBox, rect: BoxRect): number | undefined => {
      if (!textEditStabilityV2 || pageWidth <= 0) return undefined;
      const boxEdit = editsById[box.id];
      const boxAngle = normalizeBoxAngle(
        (boxEdit as { angle?: number } | undefined)?.angle ??
          (box as { angle?: number }).angle,
      );
      const boxWritingMode =
        (boxEdit as { writingMode?: string } | undefined)?.writingMode ??
        (box as { writingMode?: string }).writingMode;
      // This boundary is expressed on the page's horizontal x-axis. Rotated
      // and vertical-writing boxes need a separate oriented-neighbor model;
      // leave their existing page-edge auto-fit unchanged in this slice.
      if (boxAngle !== 0 || boxWritingMode === "vertical-rl") return undefined;

      let rightBoundary = 1 - TEXTBOX_PAGE_EDGE_PADDING_FRAC;
      const minHeight = Math.max(0.0001, rect.height);
      const gap = Math.max(1 / pageWidth, 0.0005);

      for (const other of boxes) {
        if (other.id === box.id) continue;
        const otherEdit = editsById[other.id];
        if (otherEdit?.deleted) continue;
        const otherAngle = normalizeBoxAngle(
          (otherEdit as { angle?: number } | undefined)?.angle ??
            (other as { angle?: number }).angle,
        );
        const otherWritingMode =
          (otherEdit as { writingMode?: string } | undefined)?.writingMode ??
          (other as { writingMode?: string }).writingMode;
        if (otherAngle !== 0 || otherWritingMode === "vertical-rl") continue;
        const neighbor = rectOf(other);
        // A sibling whose left edge is to our right constrains future growth,
        // even if legacy auto-fit has already crossed that edge. The max()
        // below preserves that existing/manual overlap but cannot worsen it.
        if (neighbor.x <= rect.x + gap) continue;
        const verticalOverlap =
          Math.min(rect.y + rect.height, neighbor.y + neighbor.height) -
          Math.max(rect.y, neighbor.y);
        const overlapRatio =
          verticalOverlap /
          Math.max(0.0001, Math.min(minHeight, neighbor.height));
        if (overlapRatio < 0.25) continue;
        rightBoundary = Math.min(rightBoundary, neighbor.x - gap);
      }

      return Math.max(rect.width, rightBoundary - rect.x);
    },
    [boxes, editsById, pageWidth, rectOf, textEditStabilityV2],
  );

  useEffect(() => {
    for (const box of boxes) {
      const existing = editsById[box.id];
      if (!existing || existing.created) continue;
      const nextOrigin = originFields(box, existing);
      if (!originFieldsNeedUpdate(existing, nextOrigin)) continue;
      onEditBox(
        {
          ...existing,
          ...nextOrigin,
        },
        { transient: true },
      );
    }
  }, [boxes, editsById, onEditBox, originFields]);

  // Delete an EXTRACTED line as an object. Unlike a created box (whose record
  // is removed outright via onDeleteBox), an extracted line still has glyphs
  // in the source PDF, so deletion PERSISTS an edit with empty text + a
  // `deleted` marker: the origin-pinned cover/export mask keeps hiding the
  // original glyphs while the overlay stops rendering the box. Routed through
  // `onEditBox` (non-transient) so the host records it in the SAME undo
  // history as every other gesture — undo restores the pre-delete record.
  const emitDeleteExtractedBox = useCallback(
    (box: TextBox) => {
      const existing = editsById[box.id];
      const key = stateKeyForId(box.id);
      // Suppress the blur-commit that firing below would otherwise re-emit
      // the box's current DOM text over the deletion (same guard as
      // triggerDeleteBox).
      deletingIdsRef.current.add(key);
      const node = textBoxRefs.current.get(key);
      if (node && document.activeElement === node) {
        node.blur();
      }
      setSelectedId(null);
      const rect = rectOf(box);
      onEditBox({
        ...existing,
        id: box.id,
        page,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize: existing?.fontSize ?? box.fontSize,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs: undefined,
        lineLayout: undefined,
        color: existing?.color ?? box.color,
        kind: effectiveTextBoxKind(box, existing),
        // Deletion clears BOTH content channels so nothing can bake/render.
        latex: undefined,
        text: "",
        deleted: true,
        ...originFields(box, existing),
      });
      window.setTimeout(() => {
        deletingIdsRef.current.delete(key);
      }, 0);
    },
    [editsById, onEditBox, originFields, page, rectOf, stateKeyForId],
  );

  // ---- Cross-box reflow (R3) --------------------------------------------
  // Chains are inferred per page render from geometry + text. Cross-page
  // links never form here (every box is handed in as page 1), which is the
  // honest scope of an overlay that only sees one page.
  const pageChains = useMemo(
    () =>
      inferBoxChains(
        boxes.map((box) => ({
          id: box.id,
          page: 1,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          fontSize: box.fontSize,
          text: (editsById[box.id]?.text ?? box.text) || "",
        })),
      ),
    [boxes, editsById],
  );
  // Boxes whose prompt the user waved away; do not nag again this mount.
  const [reflowDismissed, setReflowDismissed] = useState<Set<string>>(
    () => new Set(),
  );

  /** Width measure for reflow, in page fractions. Canvas when available;
   *  a character-count heuristic in environments without 2d contexts. */
  const reflowMeasure = useCallback(
    (text: string, fontSize: number): number => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const px = fontSize * pageHeight;
      if (ctx) {
        ctx.font = `${px}px ${FONT_STACK.sans}`;
        return ctx.measureText(text).width / (pageWidth || 1);
      }
      return (text.length * px * 0.5) / (pageWidth || 1);
    },
    [pageHeight, pageWidth],
  );

  /**
   * Apply the reflow the user just confirmed: every changed box downstream of
   * the edited one gets a text edit. This is the ONLY path that writes to a
   * box the user did not edit, and it runs on an explicit click.
   */
  const applyReflow = useCallback(
    (editedBox: TextBox) => {
      const chain = chainForBox(pageChains, editedBox.id);
      if (!chain) return;
      const startAt = chain.boxIds.indexOf(editedBox.id);
      const chainBoxes: StyledReflowBox[] = chain.boxIds
        .map((id) => boxesByKey[stateKeyForId(id)])
        .filter((box): box is TextBox => !!box)
        .map((box) => {
          const boxEdit = editsById[box.id];
          return {
            id: box.id,
            width: box.width,
            height: box.height,
            fontSize: boxEdit?.fontSize ?? box.fontSize,
            text: (boxEdit?.text ?? box.text) || "",
            runs: boxEdit?.runs ?? box.runs,
          };
        });
      const editedText = editsById[editedBox.id]?.text ?? editedBox.text ?? "";
      const editedRuns =
        editsById[editedBox.id]?.runs ??
        (editsById[editedBox.id]?.text === undefined
          ? editedBox.runs
          : undefined);
      // Styled reflow: every non-whitespace character keeps the style it
      // entered with, wherever it lands; overflow is absorbed inside.
      const result = reflowChainStyled(
        chainBoxes,
        editedBox.id,
        editedText,
        editedRuns,
        reflowMeasure,
      );
      if (!result) return;
      for (const boxId of result.changedBoxIds) {
        const target = boxesByKey[stateKeyForId(boxId)];
        if (!target) continue;
        const output = result.outputs.get(boxId);
        if (output === undefined) continue;
        const nextText = output.text;
        const existing = editsById[boxId];
        if ((existing?.text ?? target.text) === nextText) continue;
        const rect = rectOf(target);
        onEditBox({
          ...existing,
          id: target.id,
          page,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          fontSize: existing?.fontSize ?? target.fontSize,
          fontFamily: persistedFontFamily(target, existing),
          sourceFontName: existing?.sourceFontName ?? target.sourceFontName,
          bold: existing?.bold ?? target.bold,
          italic: existing?.italic ?? target.italic,
          color: existing?.color ?? target.color,
          kind: effectiveTextBoxKind(target, existing),
          latex: undefined,
          // Styling rides with the characters; the layout is recomputed, so
          // only lineLayout is dropped.
          runs: output.runs,
          lineLayout: undefined,
          text: nextText,
          ...originFields(target, existing),
        });
      }
      setReflowDismissed((current) => new Set(current).add(editedBox.id));
      void startAt;
    },
    [
      boxesByKey,
      editsById,
      onEditBox,
      originFields,
      page,
      pageChains,
      rectOf,
      reflowMeasure,
      stateKeyForId,
    ],
  );

  const emitText = useCallback(
    (
      box: TextBox,
      text: string,
      node?: HTMLDivElement | null,
      mutation: TextMutationIntent = "other",
      /** A composition in flight: the DOM already holds what the user sees and
       * the IME owns it, so the model is told without the node being rewritten
       * and without a history entry -- composition end writes that one. */
      composing = false,
      /** Paragraph formats that go with the words in the same step (a
       * list's hanging indent). */
      paragraph?: Partial<Pick<PdfTextBoxEdit, "leftIndent" | "firstLineIndent">>,
    ) => {
      const existing = editsById[box.id];
      const previousText = existing?.text ?? box.text;
      const emitKey = stateKeyForId(box.id);
      const lastEmittedText = lastTextEmitRef.current.get(emitKey);
      if (existing?.text === text || (!existing && box.text === text)) return;
      if (
        lastEmittedText?.text === text &&
        lastEmittedText.generation === renderGenerationRef.current
      ) {
        return;
      }
      const rect = rectOf(box);
      const fontSize = existing?.fontSize ?? box.fontSize;
      const kind = effectiveTextBoxKind(box, existing);
      const recordedOriginWidth = Number(existing?.originWidth);
      const sourceWidth =
        Number.isFinite(recordedOriginWidth) && recordedOriginWidth > 0
          ? recordedOriginWidth
          : box.width;
      // A frame the user sized (or that ran out of room) keeps its width and
      // wraps; the single-line auto-fit only widens an untouched line.
      const wrapsToWidth = textBoxWrapsToWidth(existing);
      const madeVertical = isMadeVerticalTextBox(existing);
      const fit = wrapsToWidth || madeVertical
        ? null
        : fitSingleLineTextBox({
            node: node ?? textBoxRefs.current.get(emitKey),
            text,
            rect,
            fontSize,
            pageWidth,
            pageHeight,
            created: existing?.created,
            kind,
            stabilityV2: textEditStabilityV2,
            mutation,
            minimumWidthFraction: Math.min(rect.width, sourceWidth),
            maxWidthFraction: maxAutoFitWidthForBox(box, rect),
          });
      const fixedWidth = Boolean(existing?.fixedWidth) || Boolean(fit?.saturated);
      let nextRect = fit?.rect ?? rect;
      if (madeVertical) {
        // Columns past the frame's left edge (they spill there, the block
        // runs leftward): the frame grows left to hold them, as a Word text
        // box set to fit its text does, never past the page.
        const columnsNode = node ?? textBoxRefs.current.get(emitKey);
        const needed = columnsNode && pageWidth > 0 ? columnsNode.scrollWidth / pageWidth : 0;
        if (needed > nextRect.width + 1e-6) {
          const grow = Math.min(needed - nextRect.width, nextRect.x);
          nextRect = { ...nextRect, x: nextRect.x - grow, width: nextRect.width + grow };
        }
      } else if (hasTextBoxColumns(existing)) {
        // Columns: the rows the text takes at a column's width, shared out
        // over the columns; the frame grows down only once all are full.
        const count = existing!.columnCount!;
        const columnWidth = pdfTextBoxColumnWidth(
          nextRect.width, count, ((existing!.columnSpacing ?? 0) * pageHeight) / (pageWidth || 1),
        );
        const stacked = contentHeightFractionFor(box, existing, text, columnWidth);
        const pitch = existing!.lineSpacing ?? nextFontSizeOf(existing, box) * PDF_TEXTBOX_LINE_HEIGHT_RATIO;
        if (stacked !== null && pitch > 0) {
          const rows = Math.ceil(Math.max(1, Math.round(stacked / pitch)) / count);
          nextRect = growRectToContent(nextRect, rows * pitch);
        }
      } else if (wrapsToWidth || fixedWidth) {
        // The frame follows the text downward; it never shrinks the text.
        nextRect = growRectToContent(
          nextRect,
          contentHeightFractionFor(box, existing, text, nextRect.width),
        );
      }
      const nextFontSize = fit?.fontSize ?? fontSize;
      const sourceRuns =
        existing?.runs ?? (previousText === box.text ? box.runs : undefined);
      const reconciledRuns = reconcilePdfTextStyleRuns(
        sourceRuns,
        previousText,
        text,
      );
      // Words typed where a bare caret was given formats take them.
      const pendingFormat = pendingTypingFormatsRef.current[emitKey];
      const typedRange = pendingFormat ? insertedTextRange(previousText, text) : null;
      let nextRuns = reconciledRuns;
      if (pendingFormat && typedRange && typedRange.start === pendingFormat.caret) {
        const base = reconciledRuns ?? [
          {
            text,
            bold: existing?.bold ?? box.bold,
            italic: existing?.italic ?? box.italic,
            color: existing?.color ?? box.color,
            fontSize: existing?.fontSize ?? box.fontSize,
            fontFamily: persistedFontFamily(box, existing),
            sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
          },
        ];
        nextRuns = patchPdfTextStyleRunsRange(
          base,
          text,
          typedRange.start,
          typedRange.end,
          pendingFormat.patch,
        );
        putPendingTypingFormat(emitKey, { patch: pendingFormat.patch, caret: typedRange.end });
      }
      const nextLineLayout = persistableLineLayoutForBoxText(
        box,
        existing,
        text,
      );
      const liveNode = node ?? textBoxRefs.current.get(emitKey);
      if (!composing && liveNode && (nextRuns || nextLineLayout ||
        // Spaced paragraphs: a paragraph just made takes its block.
        liveNode.dataset.pdfTextboxSpaceBefore || liveNode.dataset.pdfTextboxSpaceAfter)) {
        const selection = selectionOffsetsInNode(liveNode);
        writeTextStyleRunsToDom({
          node: liveNode,
          text,
          runs: nextRuns,
          lineLayout: nextLineLayout,
          box,
          boxWidth: nextRect.width * pageWidth,
          boxHeight: nextRect.height * pageHeight,
          pageHeight,
          showRunColors: true,
        });
        if (selection) {
          setSelectionByTextOffsets(
            liveNode,
            selection.start,
            selection.end,
            textEditStabilityV2,
          );
        }
      }
      lastAutoFitSignatureRef.current.set(
        emitKey,
        autoFitSignature({
          boxId: box.id,
          text,
          fontSize: nextFontSize,
          pageWidth,
          pageHeight,
        }),
      );
      rememberTextEmit(emitKey, text);
      const nextEdit: PdfTextBoxEdit = {
        ...existing,
        id: box.id,
        page,
        x: nextRect.x,
        y: nextRect.y,
        width: nextRect.width,
        height: nextRect.height,
        fontSize: nextFontSize,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs: nextRuns,
        lineLayout: nextLineLayout,
        color: existing?.color ?? box.color,
        kind,
        latex: formulaLatexForTextEdit(box, existing, text),
        text,
        ...(fixedWidth ? { fixedWidth: true } : {}),
        ...originFields(box, existing),
        ...paragraph,
      };
      if (composing) onEditBox(nextEdit, { transient: true });
      // Keys typed in a row fold into ONE undo step (Word, WPS: a typing run
      // undoes together); each key was its own entry (20 for one line, IPCC
      
      else onEditBox(nextEdit, { fold: "text" });
    },
    [
      putPendingTypingFormat,
      contentHeightFractionFor,
      editsById,
      growRectToContent,
      maxAutoFitWidthForBox,
      onEditBox,
      originFields,
      page,
      pageHeight,
      pageWidth,
      rectOf,
      rememberTextEmit,
      stateKeyForId,
      textEditStabilityV2,
    ],
  );

  useEffect(() => {
    for (const box of boxes) {
      const existing = editsById[box.id];
      if (
        !existing ||
        existing.created ||
        existing.fixedWidth ||
        hasHardLineBreak(existing.text)
      ) {
        continue;
      }
      const key = stateKeyForId(box.id);
      const node = textBoxRefs.current.get(key);
      const rect = rectOf(box);
      const fontSize = existing.fontSize ?? box.fontSize;
      const recordedOriginWidth = Number(existing.originWidth);
      const sourceWidth =
        Number.isFinite(recordedOriginWidth) && recordedOriginWidth > 0
          ? recordedOriginWidth
          : box.width;
      const signature = autoFitSignature({
        boxId: box.id,
        text: existing.text,
        fontSize,
        pageWidth,
        pageHeight,
      });
      if (lastAutoFitSignatureRef.current.get(key) === signature) {
        continue;
      }
      const fit = fitSingleLineTextBox({
        node,
        text: existing.text,
        rect,
        fontSize,
        pageWidth,
        pageHeight,
        created: existing.created,
        kind: effectiveTextBoxKind(box, existing),
        stabilityV2: textEditStabilityV2,
        minimumWidthFraction: Math.min(rect.width, sourceWidth),
        maxWidthFraction: maxAutoFitWidthForBox(box, rect),
      });
      if (!fit) continue;
      lastAutoFitSignatureRef.current.set(
        key,
        autoFitSignature({
          boxId: box.id,
          text: existing.text,
          fontSize: fit.fontSize,
          pageWidth,
          pageHeight,
        }),
      );
      // Out of room: the width is fixed from here and the text wraps below.
      const fitted = fit.saturated
        ? growRectToContent(
            fit.rect,
            contentHeightFractionFor(box, existing, existing.text, fit.rect.width),
          )
        : fit.rect;
      onEditBox(
        {
          ...existing,
          x: fitted.x,
          y: fitted.y,
          width: fitted.width,
          height: fitted.height,
          fontSize: fit.fontSize,
          ...(fit.saturated ? { fixedWidth: true } : {}),
        },
        { transient: true },
      );
    }
  }, [
    boxes,
    contentHeightFractionFor,
    editsById,
    growRectToContent,
    maxAutoFitWidthForBox,
    onEditBox,
    pageHeight,
    pageWidth,
    rectOf,
    stateKeyForId,
    textEditStabilityV2,
  ]);

  const emitGeometry = useCallback(
    (box: TextBox, rect: BoxRect, angleOverride?: number) => {
      const existing = editsById[box.id];
      const kind = effectiveTextBoxKind(box, existing);
      const currentText = currentTextForBox(box, existing);
      const currentRect = rectOf(box);
      const lineLayout = persistableLineLayoutForBoxText(
        box,
        existing,
        currentText,
      );
      const widthChanged =
        Math.abs(rect.width - currentRect.width) > BOX_RECT_EPSILON;
      const heightChanged =
        Math.abs(rect.height - currentRect.height) > BOX_RECT_EPSILON;
      // A new width re-wraps the paragraph at the same font size (its source
      // line layout no longer describes it). A new height alone keeps every
      // line where it is on the page: the layout is stored relative to the
      // frame, so it is rebased rather than stretched with the frame.
      const reflowsParagraph = widthChanged;
      const nextText =
        reflowsParagraph && lineLayout
          ? joinBoxTexts(currentText.split("\n"))
          : currentText;
      const nextLineLayout = reflowsParagraph
        ? undefined
        : heightChanged
          ? rebaseLineLayoutForHeight(
              lineLayout,
              currentRect.height,
              rect.height,
            )
          : lineLayout;
      onEditBox({
        ...existing,
        id: box.id,
        page,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize: existing?.fontSize ?? box.fontSize,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs: persistableRunsForBoxText(box, existing, nextText),
        lineLayout: nextLineLayout,
        color: existing?.color ?? box.color,
        kind,
        latex: latexForTextBoxKind(kind, existing?.latex ?? box.latex),
        text: nextText,
        // A width the user set by hand stays: the text wraps inside it from
        // now on instead of the auto-fit widening the frame again.
        ...(widthChanged ? { fixedWidth: true } : {}),
        // The first geometry change to a turned box builds its edit record
        // from scratch; without this the box would quietly become upright the
        // moment it was moved or resized.
        ...(() => {
          const angle =
            angleOverride ??
            existing?.angle ??
            (box as { angle?: number }).angle;
          // Zero is upright, and upright means no field at all — a box turned
          // back to square must not keep a 0 nobody can see.
          return angle ? { angle: normalizeBoxAngle(angle) } : {};
        })(),
        ...originFields(box, existing),
      });
    },
    [currentTextForBox, editsById, onEditBox, originFields, page, rectOf],
  );

  // Apply a style change (color / alignment / font size / bold / italic /
  // underline) to a box, creating an edit (with current text + geometry) if one
  // doesn't exist yet.
  const emitStyle = useCallback(
    (
      box: TextBox,
      asked: Partial<
        Pick<
          PdfTextBoxEdit,
          | "color"
          | "align"
          | "fontSize"
          | "bold"
          | "italic"
          | "underline"
          | "strikethrough"
          | "justify"
          | "fontFamily"
          | "sourceFontName"
          | "officeFamily"
          | "angle"
          | "x"
          | "y"
          | "width"
          | "height"
          | "fixedWidth"
          | keyof import("@mrnote/core/web/lib/pdf/text-box-typography.ts").PdfTextBoxTypographyFields
        >
      >,
    ) => {
      const existing = editsById[box.id];
      const rect = rectOf(box);
      const kind = effectiveTextBoxKind(box, existing);
      const currentText = currentTextForBox(box, existing);
      const currentRuns = persistableRunsForBoxText(box, existing, currentText);
      let patch = asked;
      // A selection inside THIS box scopes the change to the selected
      // characters. Until now every style change covered the whole box, so
      // bolding a word bolded the sentence — the one thing a text box is
      // supposed to do that a paragraph of baked glyphs cannot.
      const styledNode = textBoxRefs.current.get(stateKeyForId(box.id));
      const activeSelection = styledNode
        ? (selectionOffsetsInNode(
            styledNode,
            lastSelectionRef.current.get(stateKeyForId(box.id)) ?? null,
          ) ??
          lastSelectionRef.current.get(stateKeyForId(box.id)) ??
          null)
        : null;
      const scoped =
        activeSelection && activeSelection.end > activeSelection.start
          ? activeSelection
          : null;
      
      
      // box); paragraph-level changes (alignment, position) still apply.
      const characterPatch = (
        ["fontFamily", "sourceFontName", "officeFamily", "fontSize", "bold", "italic", "underline", "strikethrough", "color"] as const
      ).some((key) => key in patch);
      // A formula has no caret in words: its format is the whole formula's.
      if (!scoped && characterPatch && kind !== "formula" && typingBoxKeyRef.current === stateKeyForId(box.id)) {
        const key = stateKeyForId(box.id);
        const caret = activeSelection?.start ?? currentText.length;
        const held: Record<string, unknown> = {};
        for (const name of PENDING_TYPING_KEYS) if (name in patch) held[name] = patch[name];
        // Underline and Strikethrough are the box's own here (no run of
        // them is made), so a caret cannot hold them for the next words. In
        // a box with no character yet, every word is typed after the press:
        // the box takes them, as Word gives a format toggled at an empty
        // insertion point to the text typed next. (Pressed in a new box
        // before its first word they were let go with nothing said, and the
        // word was typed, and written, without them.) In a box that has
        // words they would reformat those, with nothing highlighted.
        const boxOwn: Record<string, unknown> = {};
        if (currentText.length === 0) {
          for (const name of BOX_OWN_CHARACTER_KEYS) {
            if (name in patch && Boolean(patch[name]) !== Boolean(existing?.[name])) boxOwn[name] = patch[name];
          }
        }
        if (Object.keys(held).length > 0) {
          const prior = pendingTypingFormatsRef.current[key];
          putPendingTypingFormat(key, {
            patch: { ...(prior?.caret === caret ? prior.patch : {}), ...(held as PendingTypingPatch) },
            caret,
          });
          // Back to the words, the caret where it was, as Word returns from
          // its font boxes: what is typed next goes in with the format.
          window.setTimeout(() => {
            const node = textBoxRefs.current.get(key);
            if (!node?.isConnected || pendingTypingFormatsRef.current[key]?.caret !== caret) return;
            // The caret first: the box's focus handler records where it is.
            setSelectionByTextOffsets(node, caret, caret, textEditStabilityV2);
            node.focus({ preventScroll: true });
            setSelectionByTextOffsets(node, caret, caret, textEditStabilityV2);
          }, 0);
        }
        if (Object.keys(boxOwn).length === 0) return;
        patch = boxOwn as typeof asked;
      }
      const runPatch: Partial<
        Omit<PdfTextStyleRun, "text" | "displayFontFamily">
      > = {};
      if ("fontFamily" in patch) runPatch.fontFamily = patch.fontFamily;
      if ("sourceFontName" in patch) {
        runPatch.sourceFontName = patch.sourceFontName;
      }
      // An Office family (or a portable face, which clears it) goes with
      // the face onto the runs it is put on (lib/pdf/text-box-runs.ts).
      if ("officeFamily" in patch) runPatch.officeFamily = patch.officeFamily;
      if ("fontSize" in patch) runPatch.fontSize = patch.fontSize;
      if ("bold" in patch) runPatch.bold = patch.bold;
      if ("italic" in patch) runPatch.italic = patch.italic;
      if ("color" in patch) runPatch.color = patch.color;
      // An extracted line usually carries NO runs — "no runs" means "uniform
      // styling". A whole-box change can stay that way, but a word-scoped one
      // cannot be expressed without runs, so seed one covering the text with
      // the box's current style. Seeding it empty would strip the box's own
      // bold/colour from everything the selection does not cover.
      const baseRuns =
        currentRuns ??
        (scoped
          ? [
              {
                text: currentText,
                bold: existing?.bold ?? box.bold,
                italic: existing?.italic ?? box.italic,
                color: existing?.color ?? box.color,
                fontSize: existing?.fontSize ?? box.fontSize,
                fontFamily: persistedFontFamily(box, existing),
                sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
              },
            ]
          : undefined);
      const nextRuns =
        Object.keys(runPatch).length === 0
          ? currentRuns
          : scoped
            ? patchPdfTextStyleRunsRange(
                baseRuns,
                currentText,
                scoped.start,
                scoped.end,
                runPatch,
              )
            : patchPdfTextStyleRuns(currentRuns, currentText, runPatch);
      if (nextRuns && Object.keys(runPatch).length > 0) {
        const node = styledNode;
        if (node) {
          const selection = activeSelection;
          writeTextStyleRunsToDom({
            node,
            text: currentText,
            runs: nextRuns,
            lineLayout: persistableLineLayoutForBoxText(
              box,
              existing,
              currentText,
            ),
            box,
            boxWidth: rect.width * pageWidth,
            boxHeight: rect.height * pageHeight,
            pageHeight,
            showRunColors: true,
          });
          if (selection) {
            setSelectionByTextOffsets(
              node,
              selection.start,
              selection.end,
              textEditStabilityV2,
            );
          }
        }
      }
      const edit: PdfTextBoxEdit = {
        ...existing,
        id: box.id,
        page,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        fontSize: existing?.fontSize ?? box.fontSize,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs: nextRuns,
        lineLayout: persistableLineLayoutForBoxText(box, existing, currentText),
        color: existing?.color ?? box.color,
        kind,
        latex: latexForTextBoxKind(kind, existing?.latex ?? box.latex),
        text: currentText,
        ...originFields(box, existing),
        ...patch,
      };
      if (scoped) {
        // Box-level flags describe the WHOLE box. A word-scoped change must not
        // set them, or the toolbar would light up as if the box were all bold
        // and the next toggle would clear the run styling that was just made.
        if ("bold" in patch) edit.bold = existing?.bold ?? box.bold;
        if ("italic" in patch) edit.italic = existing?.italic ?? box.italic;
        if ("color" in patch) edit.color = existing?.color ?? box.color;
        if ("fontSize" in patch) {
          edit.fontSize = existing?.fontSize ?? box.fontSize;
        }
        if ("fontFamily" in patch) {
          edit.fontFamily = persistedFontFamily(box, existing);
          edit.sourceFontName = existing?.sourceFontName ?? box.sourceFontName;
        }
        if ("officeFamily" in patch) edit.officeFamily = existing?.officeFamily;
      }
      if (edit.officeFamily === undefined) delete edit.officeFamily;
      // A pressed alignment button is the user's own choice, so the imported
      // object stops inheriting the author's `/Q` from this edit onwards.
      if ("align" in patch) delete edit.alignFromSource;
      // A lone font-size step or color pick is a foldable continuous gesture
      // (repeated +/- clicks / swatch scrubbing = one undo step). Discrete
      // toggles (bold / italic / underline / align) stay one-entry-per-click.
      const patchKeys = Object.keys(patch);
      const fold =
        patchKeys.length === 1 &&
        (patchKeys[0] === "fontSize" || patchKeys[0] === "color")
          ? (patchKeys[0] as "fontSize" | "color")
          : undefined;
      if (fold) {
        onEditBox(edit, { fold });
      } else {
        onEditBox(edit);
      }
    },
    [
      putPendingTypingFormat,
      currentTextForBox,
      editsById,
      onEditBox,
      originFields,
      page,
      pageHeight,
      pageWidth,
      rectOf,
      stateKeyForId,
      textEditStabilityV2,
    ],
  );

  // The effective bold/italic/underline of a box: a persisted edit's flag wins
  // over the extracted run's flag (so a B/I/U toggle reflects live and survives
  // reload); underline is edit-only (extracted runs carry no underline signal).
  const effectiveBold = useCallback(
    (box: TextBox) => Boolean(editsById[box.id]?.bold ?? box.bold),
    [editsById],
  );
  const effectiveItalic = useCallback(
    (box: TextBox) => Boolean(editsById[box.id]?.italic ?? box.italic),
    [editsById],
  );
  const effectiveUnderline = useCallback(
    (box: TextBox) => Boolean(editsById[box.id]?.underline),
    [editsById],
  );
  // What Bold / Italic sets when pressed: off only when every character it
  // will format already has it. With characters selected in the box that is
  // the selection's runs, not the box's own flag -- a word made bold inside
  // a regular box left the flag false, so Bold re-applied bold to it and
  // could never take it off again.
  // The same holds with nothing highlighted. At a bare caret in the words
  // being typed the press is for the words typed next (emitStyle), so it
  // turns over what they would be typed in: the format held at the caret,
  // else that of the character before it (the one typing continues,
  // reconcilePdfTextStyleRuns). And on a box selected as an object it is
  // for every character of the box. Read from the box's flag alone, Bold
  // pressed again after a word typed bold (its run bold, the flag off) set
  // bold once more: the words after it could not be typed regular, nor the
  
  const toggledCharacterFlag = useCallback(
    (box: TextBox, key: "bold" | "italic"): boolean => {
      const existing = editsById[box.id];
      const boxValue = Boolean(existing?.[key] ?? box[key]);
      const boxKey = stateKeyForId(box.id);
      const node = textBoxRefs.current.get(boxKey);
      const remembered = lastSelectionRef.current.get(boxKey) ?? null;
      const selection = node
        ? (selectionOffsetsInNode(node, remembered) ?? remembered)
        : null;
      const text = currentTextForBox(box, existing);
      const runs = persistableRunsForBoxText(box, existing, text);
      if (!selection || selection.end <= selection.start) {
        if (effectiveTextBoxKind(box, existing) === "formula") return !boxValue;
        if (typingBoxKeyRef.current !== boxKey) {
          return runs && runs.length > 0 ? !runs.every((run) => run[key] ?? boxValue) : !boxValue;
        }
        const caret = selection?.start ?? text.length;
        const held = pendingTypingFormatsRef.current[boxKey];
        if (held && held.caret === caret && typeof held.patch[key] === "boolean") return !held.patch[key];
        const before = Math.max(0, caret - 1);
        let end = 0;
        for (const run of runs ?? []) {
          end += run.text.length;
          if (before < end) return !(run[key] ?? boxValue);
        }
        return !boxValue;
      }
      if (!runs) return !boxValue;
      let offset = 0;
      let allOn = true;
      let covered = false;
      for (const run of runs) {
        const start = offset;
        offset += run.text.length;
        if (offset <= selection.start || start >= selection.end) continue;
        covered = true;
        if (!(run[key] ?? boxValue)) allOn = false;
      }
      return covered ? !allOn : !boxValue;
    },
    [currentTextForBox, editsById, stateKeyForId],
  );
  // A text box's Highlight is painted behind its glyphs with the CSS Custom
  // Highlight API: the contenteditable keeps its plain text node (no spans
  // to fight the caret), and the band follows the text as it is typed.
  useLayoutEffect(() => {
    const registry = (globalThis.CSS as unknown as {
      highlights?: Map<string, unknown>;
    } | undefined)?.highlights;
    const HighlightCtor = (globalThis as unknown as {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!registry || !HighlightCtor || typeof document === "undefined") return;
    const byColor = new Map<string, Range[]>();
    for (const [key, node] of textBoxRefs.current) {
      const box = boxesByKey[key];
      const color = box ? editsById[box.id]?.highlight : undefined;
      if (!color || !/^#[0-9A-Fa-f]{6}$/u.test(color) || !node.isConnected) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const ranges = byColor.get(color.toUpperCase()) ?? [];
      ranges.push(range);
      byColor.set(color.toUpperCase(), ranges);
    }
    const names: string[] = [];
    let sheet = document.getElementById("pdf-textbox-highlight-styles") as HTMLStyleElement | null;
    for (const [color, ranges] of byColor) {
      const name = `pdf-textbox-highlight-${page}-${color.slice(1).toLowerCase()}`;
      registry.set(name, new HighlightCtor(...ranges));
      names.push(name);
      const rule = `::highlight(${name}) { background-color: ${color}; }`;
      if (!sheet) {
        sheet = document.createElement("style");
        sheet.id = "pdf-textbox-highlight-styles";
        document.head.appendChild(sheet);
      }
      if (!sheet.textContent?.includes(rule)) sheet.textContent = `${sheet.textContent ?? ""}\n${rule}`;
    }
    return () => {
      for (const name of names) registry.delete(name);
    };
  }, [boxesByKey, editsById, page]);
  const effectiveStrikethrough = useCallback(
    (box: TextBox) => Boolean(editsById[box.id]?.strikethrough),
    [editsById],
  );

  // Only the presence of a delete handler matters to the published selection;
  // depending on its identity re-published the selection on every parent
  // render (an inline handler made that an unbounded effect/setState loop).
  const hasDeleteBox = Boolean(onDeleteBox);
  useEffect(() => {
    if (!onSelectionChange) return;
    const box = selectedId ? boxesByKey[selectedId] : undefined;
    if (!box || disabled) {
      onSelectionChange(null);
      return;
    }
    const held = pendingTypingFormats[selectedId!]?.patch;
    const savedEdit = editsById[box.id];
    // A format held at the caret is what the ribbon shows.
    const edit: PdfTextBoxEdit | undefined = held
      ? ({ ...(savedEdit ?? {}), ...held } as PdfTextBoxEdit)
      : savedEdit;
    const pickedFont = pickedFontFamilyOption(edit) || edit?.officeFamily;
    // Unpicked, the words' own font is read back by its name in the file
    // (MRNoteNotoSansSC, not the generic face it is drawn with here).
    const sourceFontLabel = pickedFont
      ? null
      : readableSourceFontName(edit?.sourceFontName ?? box.sourceFontName);
    const selectedFontId = sourceFontLabel ? "" : selectedFontFamilyOptionId(box, edit);
    const selectedFontOption = TEXTBOX_FONT_FAMILY_OPTIONS.find(
      (option) => option.id === selectedFontId,
    );
    const kind =
      effectiveTextBoxKind(box, edit) === "formula" ? "formula" : "text";
    const documentUnit = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) && value !== 0
        ? Math.round(value * fontSizeDocumentHeight * 100) / 100
        : null;
    onSelectionChange({
      page,
      id: box.id,
      bold: held?.bold ?? effectiveBold(box),
      italic: held?.italic ?? effectiveItalic(box),
      underline: effectiveUnderline(box),
      strikethrough: effectiveStrikethrough(box),
      align:
        edit?.alignFromSource === true
          ? null
          : edit?.distributed
            ? "distributed"
            : edit?.justify
              ? "justify"
              : (edit?.align ?? "left"),
      alignmentProven: edit?.alignFromSource !== true,
      extendedFormats: !edit?.nativeSource,
      textScript: edit?.textScript ?? null,
      highlight: Boolean(edit?.highlight),
      distributed: Boolean(edit?.distributed),
      verticalAlign: edit?.verticalAlign ?? "top",
      textDirection: textDirectionOfBox(edit, Number(edit?.angle ?? box.angle ?? 0)),
      textPaint: edit?.textPaint ? pdfTextBoxTextPaint(edit.textPaint) : null,
      columns: {
        count: edit?.columnCount && edit.columnCount > 1 ? edit.columnCount : 1,
        spacingDocumentUnit: documentUnit(edit?.columnSpacing) ?? 0,
      },
      list: pdfTextListKindOf(currentTextForBox(box, edit)),
      lineSpacingDocumentUnit: documentUnit(edit?.lineSpacing),
      characterSpacingDocumentUnit: documentUnit(edit?.characterSpacing),
      wordSpacingDocumentUnit: documentUnit(edit?.wordSpacing),
      horizontalScale: edit?.horizontalScale ?? null,
      firstLineIndentDocumentUnit: documentUnit(edit?.firstLineIndent),
      leftIndentDocumentUnit: documentUnit(edit?.leftIndent),
      rightIndentDocumentUnit: documentUnit(edit?.rightIndent),
      spaceBeforeDocumentUnit: documentUnit(edit?.spaceBefore),
      spaceAfterDocumentUnit: documentUnit(edit?.spaceAfter),
      tabStopsDocumentUnit: (edit?.tabStops ?? []).map((stop) => ({
        positionDocumentUnit: Math.round(stop.position * fontSizeDocumentHeight * 100) / 100,
        align: stop.align, leader: stop.leader })),
      defaultTabDocumentUnit: documentUnit(edit?.defaultTabStop),
      fontFamilyId: edit?.officeFamily ?? (selectedFontId || null),
      fontFamilyLabel: edit?.officeFamily
        ? edit.officeFamily
        : sourceFontLabel
        ? sourceFontLabel
        : selectedFontOption
        ? t(selectedFontOption.labelKey)
        : t("pdf.textbox.fontFamily.original"),
      fontOptions: TEXTBOX_FONT_FAMILY_OPTIONS.map((option) => ({
        id: option.id,
        label: t(option.labelKey),
        fontFamily: option.stack,
        sourceFontName: option.sourceFontName,
      })),
      // The size as the file has it (14.256 reads 14.26, not 14).
      fontSizeDocumentUnit: Math.max(
        1,
        Math.round(
          (edit?.fontSize ?? box.fontSize) * fontSizeDocumentHeight * 100,
        ) / 100,
      ),
      color: edit?.color ?? box.color ?? "#000000",
      textKind: kind,
      canDelete: edit?.created ? hasDeleteBox : true,
      created: Boolean(edit?.created),
    });
  }, [
    boxesByKey,
    disabled,
    editsById,
    effectiveBold,
    effectiveItalic,
    effectiveUnderline,
    effectiveStrikethrough,
    onSelectionChange,
    hasDeleteBox,
    page,
    fontSizeDocumentHeight,
    pendingTypingFormats,
    selectedId,
    t,
  ]);
  // Another box selected (or none), the held format is let go.
  useEffect(() => {
    const keys = Object.keys(pendingTypingFormatsRef.current);
    for (const key of keys) if (key !== selectedId) putPendingTypingFormat(key, null);
  }, [putPendingTypingFormat, selectedId]);
  // A size held at the caret draws the caret at that size, on the box being
  // typed in: the browser's own caret kept the height of the words already
  
  // `office-painted-caret.ts`). Beside the words typed with it the two agree
  // and the browser's caret is back.
  useLayoutEffect(() => {
    for (const [key, node] of textBoxRefs.current) {
      const held = pendingTypingFormats[key];
      const box = boxesByKey[key];
      let scale: number | null = null;
      if (held && typeof held.patch.fontSize === "number" && box) {
        const edit = editsById[box.id];
        const runs = edit?.runs ?? (edit?.text === undefined || edit.text === box.text ? box.runs : undefined);
        // The character before the caret (at the start, the first one).
        let beside: number | undefined;
        let offset = 0;
        for (const run of runs ?? []) {
          offset += run.text.length;
          if (offset >= Math.max(1, held.caret)) {
            beside = run.fontSize;
            break;
          }
        }
        scale = officeCaretFontScale(held.patch.fontSize, beside ?? edit?.fontSize ?? box.fontSize);
      }
      setOfficeCaretFontScale(node, scale);
    }
  }, [boxesByKey, editsById, pendingTypingFormats]);

  const effectiveColor = useCallback(
    (box: TextBox) => editsById[box.id]?.color ?? box.color ?? "#000000",
    [editsById],
  );

  const handleBlur = useCallback(
    (box: TextBox, event: React.FocusEvent<HTMLDivElement>) => {
      const key = stateKeyForId(box.id);
      if (deletingIdsRef.current.has(key)) return;
      composingTextBoxKeysRef.current.delete(key);
      emitText(
        box,
        editableNodePlainText(event.currentTarget),
        event.currentTarget,
      );
    },
    [emitText, stateKeyForId],
  );

  const handleCompositionStart = useCallback(
    (box: TextBox, event: ReactCompositionEvent<HTMLDivElement>) => {
      const key = stateKeyForId(box.id);
      composingTextBoxKeysRef.current.add(key);
      rememberSelection(box.id, selectionForBox(box.id, event.currentTarget));
    },
    [rememberSelection, selectionForBox, stateKeyForId],
  );

  const handleCompositionEnd = useCallback(
    (box: TextBox, event: ReactCompositionEvent<HTMLDivElement>) => {
      const key = stateKeyForId(box.id);
      composingTextBoxKeysRef.current.delete(key);
      const node = event.currentTarget;
      rememberSelection(box.id, selectionForBox(box.id, node));
      emitText(box, editableNodePlainText(node), node);
    },
    [emitText, rememberSelection, selectionForBox, stateKeyForId],
  );

  const handleInput = useCallback(
    (box: TextBox, event: React.FormEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      rememberSelection(box.id, selectionForBox(box.id, node));
      const inputEvent = event.nativeEvent as InputEvent;
      if (
        inputEvent.isComposing ||
        composingTextBoxKeysRef.current.has(stateKeyForId(box.id))
      ) {
        // A box paints its own text only once the model holds an edit for it;
        // until then the text is transparent and the page's own glyphs show
        // through. Saying nothing here left a composition invisible -- the
        // user saw only the IME's underline over the unchanged page. The
        // model is told as the composition runs, without the node being
        // rewritten (the IME owns it) and without a history entry.
        emitText(box, editableNodePlainText(node), node, "insert", true);
        return;
      }
      const inputType = inputEvent.inputType ?? "";
      const mutation: TextMutationIntent = inputType.startsWith("delete")
        ? "delete"
        : inputType.startsWith("insert")
          ? "insert"
          : "other";
      emitText(box, editableNodePlainText(node), node, mutation);
    },
    [emitText, rememberSelection, selectionForBox, stateKeyForId],
  );

  const handleFormulaPreviewKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const platformCommand = event.metaKey || event.ctrlKey;
      if (platformCommand) return;
      if (
        event.key.length === 1 ||
        event.key === "Backspace" ||
        event.key === "Delete" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
      }
    },
    [],
  );

  // The box's input rules read the DOM's own beforeinput. React's
  // onBeforeInput is not that event: React builds it from textInput,
  // keypress, compositionend and paste only, so it never fires for a
  // deletion or a line break's own beforeinput, and its nativeEvent carries
  // no inputType -- every rule once written against it never ran. Typing,
  // the deletions and a cut stay the browser's own, as they always ran:
  // its word boundaries know CJK and its insertion keeps the line's run
  // spans. Plain Backspace/Delete are the keydown handler's, a plain-text
  // paste or drop the paste/drop handlers'.
  const handleNativeBeforeInput = useCallback(
    (event: InputEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const node =
        event.target instanceof Element
          ? event.target.closest<HTMLDivElement>('[data-testid="pdf-textbox"]')
          : null;
      const boxId = node?.dataset.boxId;
      if (!node || !boxId) return;
      const key = stateKeyForId(boxId);
      const rule = textBoxInputRulesRef.current.get(key);
      if (!rule || textBoxRefs.current.get(key) !== node) return;
      if (rule.formula) {
        event.preventDefault();
        return;
      }
      // One extracted PDF line stays one line, as a paste into it does
      
      // handed to the page's own text editor, lost the break and the focus.
      // A created box or a multi-line one takes the break.
      if (!rule.singleLine || rule.preserveLineBreaks) return;
      if (
        event.inputType === "insertLineBreak" ||
        event.inputType === "insertParagraph"
      ) {
        event.preventDefault();
        return;
      }
      if (
        !event.inputType.startsWith("insert") ||
        !event.data ||
        !/[\r\n]/.test(event.data)
      ) {
        return;
      }
      event.preventDefault();
      const nextSelection = applyPlainTextInsertion(
        node,
        normalizeSingleLineInputText(event.data),
        lastSelectionRef.current.get(key) ?? null,
      );
      if (nextSelection) {
        rememberSelection(rule.box.id, nextSelection);
        emitText(rule.box, node.textContent ?? "", node, "insert");
      }
    },
    [emitText, rememberSelection, stateKeyForId],
  );

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.addEventListener("beforeinput", handleNativeBeforeInput);
    return () =>
      overlay.removeEventListener("beforeinput", handleNativeBeforeInput);
  }, [handleNativeBeforeInput]);

  const handlePaste = useCallback(
    (
      box: TextBox,
      event: ReactClipboardEvent<HTMLDivElement>,
      singleLine: boolean,
      preserveLineBreaks: boolean,
    ) => {
      // A multi-line box used to leave paste to the browser, whose <div>/<br>
      
      // paste goes through the same insertion; only the line-break rule
      // differs between a single extracted line and a multi-line box.
      if ((!singleLine && !preserveLineBreaks) || event.defaultPrevented) {
        return;
      }
      const text = event.clipboardData.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      const nextSelection = applyPlainTextInsertion(
        event.currentTarget,
        pastedPlainText(text, preserveLineBreaks),
        lastSelectionRef.current.get(stateKeyForId(box.id)) ?? null,
      );
      if (nextSelection) {
        rememberSelection(box.id, nextSelection);
        emitText(
          box,
          event.currentTarget.textContent ?? "",
          event.currentTarget,
          "insert",
        );
      }
    },
    [emitText, rememberSelection, stateKeyForId],
  );

  const handleDrop = useCallback(
    (
      box: TextBox,
      event: ReactDragEvent<HTMLDivElement>,
      singleLine: boolean,
      preserveLineBreaks: boolean,
    ) => {
      if ((!singleLine && !preserveLineBreaks) || event.defaultPrevented) {
        return;
      }
      const text = event.dataTransfer.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      const pointSelection = placeCaretFromPoint(
        event.currentTarget,
        event.clientX,
        event.clientY,
        textEditStabilityV2,
      )
        ? selectionOffsetsInNode(event.currentTarget)
        : null;
      const nextSelection = applyPlainTextInsertion(
        event.currentTarget,
        pastedPlainText(text, preserveLineBreaks),
        pointSelection ??
          lastSelectionRef.current.get(stateKeyForId(box.id)) ??
          null,
      );
      if (nextSelection) {
        rememberSelection(box.id, nextSelection);
        emitText(
          box,
          event.currentTarget.textContent ?? "",
          event.currentTarget,
          "insert",
        );
      }
    },
    [emitText, rememberSelection, stateKeyForId, textEditStabilityV2],
  );

  const handleKeyDown = useCallback(
    (
      box: TextBox,
      event: React.KeyboardEvent<HTMLDivElement>,
      singleLine: boolean,
      preserveLineBreaks: boolean,
    ) => {
      if (!singleLine || event.defaultPrevented) return;
      const platformCommand = event.metaKey || event.ctrlKey;
      // The line-break rule of handleNativeBeforeInput, for a browser that
      // sends a key's edit no beforeinput.
      if (
        event.key === "Enter" &&
        !preserveLineBreaks &&
        !platformCommand &&
        !event.nativeEvent.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey || event.altKey) return;
      const node = event.currentTarget;
      const textLength = node.textContent?.length ?? 0;
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        !platformCommand
      ) {
        event.preventDefault();
        const nextSelection = applyPlainTextDeletion(
          node,
          event.key,
          lastSelectionRef.current.get(stateKeyForId(box.id)) ?? null,
        );
        if (nextSelection) {
          rememberSelection(box.id, nextSelection);
          emitText(box, node.textContent ?? "", node, "delete");
        }
        return;
      }
      const wantsStart =
        event.key === "Home" || (platformCommand && event.key === "ArrowLeft");
      const wantsEnd =
        event.key === "End" || (platformCommand && event.key === "ArrowRight");
      const nextOffset = wantsStart ? 0 : wantsEnd ? textLength : null;
      if (nextOffset == null) return;

      event.preventDefault();
      if (setCaretByTextOffset(node, nextOffset)) {
        rememberSelection(box.id, { start: nextOffset, end: nextOffset });
      }
    },
    [emitText, rememberSelection, stateKeyForId],
  );

  const emitFormulaLatex = useCallback(
    (box: TextBox, latex: string) => {
      const existing = editsById[box.id];
      const rect = rectOf(box);
      const normalizedLatex = normalizePdfFormulaLatexSource(latex);
      const fontSizeFraction = existing?.fontSize ?? box.fontSize;
      const formulaBaseRect = formulaAutoFitBaseRect({
        box,
        existing,
        currentRect: rect,
        fontSizeFraction,
        pageWidth,
        pageHeight,
      });
      const formulaRect = pdfFormulaBoxRect({
        rect: formulaBaseRect,
        latex: normalizedLatex,
        fontSizeFraction,
        pageWidth,
        pageHeight,
      });
      const text = fallbackTextFromPdfFormulaLatex(normalizedLatex);
      rememberTextEmit(stateKeyForId(box.id), text);
      onEditBox({
        ...existing,
        id: box.id,
        page,
        x: formulaRect.x,
        y: formulaRect.y,
        width: formulaRect.width,
        height: formulaRect.height,
        fontSize: fontSizeFraction,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs: undefined,
        lineLayout: undefined,
        color: existing?.color ?? box.color,
        kind: "formula",
        latex: normalizedLatex,
        text,
        ...originFields(box, existing),
      });
      // A new formula (插入 › 公式) is written once applied, as a new box is
      // once left: its words are typed in the source panel, and leaving
      // that panel is no blur of the box (applied and left, it stayed an
      // unsaved draft the page never held).
      if (existing?.created && onCreatedBoxCommit && normalizedLatex.trim()) {
        window.setTimeout(() => onCreatedBoxCommit(box.id, text), 0);
      }
    },
    [
      editsById,
      onCreatedBoxCommit,
      onEditBox,
      originFields,
      page,
      pageHeight,
      pageWidth,
      rectOf,
      rememberTextEmit,
      stateKeyForId,
    ],
  );

  const emitKind = useCallback(
    (box: TextBox, nextKind: "text" | "formula") => {
      const existing = editsById[box.id];
      const boxKey = stateKeyForId(box.id);
      const rect = rectOf(box);
      const text = currentTextForBox(box, existing);
      // A new box with nothing typed yet becomes an empty new formula, its
      // source typed in the formula panel -- as 插入 › 公式 makes one (Word:
      // Insert > Equation where nothing is selected).
      const emptyNewFormula = nextKind === "formula" && !text.trim() && existing?.created === true;
      const nextLatex =
        nextKind === "formula"
          ? emptyNewFormula ? "" : normalizePdfFormulaLatexSource(latexFromPdfFormulaText(text))
          : undefined;
      if (
        nextKind === "formula" &&
        !emptyNewFormula &&
        // A box the user made converts whenever its LaTeX parses; words of
        // the page only when they read as maths (no `N = 15` formula).
        !pdfFormulaBoxDrawsLatex({ created: existing?.created === true }, nextLatex ?? "")
      ) {
        return;
      }
      const fontSizeFraction = existing?.fontSize ?? box.fontSize;
      const nextRect =
        nextKind === "formula" && nextLatex
          ? pdfFormulaBoxRect({
              rect,
              latex: nextLatex,
              fontSizeFraction,
              pageWidth,
              pageHeight,
            })
          : rect;
      clearFormulaDraft(box.id);
      if (nextKind === "text") {
        skipFormulaSourceUnmountCommitRef.current.add(boxKey);
      }
      rememberTextEmit(boxKey, text);
      onEditBox({
        ...existing,
        id: box.id,
        page,
        x: nextRect.x,
        y: nextRect.y,
        width: nextRect.width,
        height: nextRect.height,
        fontSize: fontSizeFraction,
        fontFamily: persistedFontFamily(box, existing),
        sourceFontName: existing?.sourceFontName ?? box.sourceFontName,
        bold: existing?.bold ?? box.bold,
        italic: existing?.italic ?? box.italic,
        runs:
          nextKind === "text"
            ? persistableRunsForBoxText(box, existing, text)
            : undefined,
        lineLayout:
          nextKind === "text"
            ? persistableLineLayoutForBoxText(box, existing, text)
            : undefined,
        color: existing?.color ?? box.color,
        kind: nextKind,
        latex: nextLatex,
        text,
        ...originFields(box, existing),
      });
    },
    [
      clearFormulaDraft,
      currentTextForBox,
      editsById,
      onEditBox,
      originFields,
      page,
      pageHeight,
      pageWidth,
      rectOf,
      rememberTextEmit,
      stateKeyForId,
    ],
  );

  useEffect(() => {
    const box = selectedId ? boxesByKey[selectedId] : undefined;
    if (
      disabled ||
      !box ||
      !contextCommand ||
      contextCommand.requestId === lastContextCommandRef.current ||
      contextCommand.page !== page ||
      contextCommand.id !== box.id
    ) {
      return;
    }
    lastContextCommandRef.current = contextCommand.requestId;
    const edit = editsById[box.id];
    const kind = effectiveTextBoxKind(box, edit);
    switch (contextCommand.action) {
      case "bold":
        if (kind === "formula") break;
        emitStyle(box, { bold: toggledCharacterFlag(box, "bold") });
        break;
      case "italic":
        if (kind === "formula") break;
        emitStyle(box, { italic: toggledCharacterFlag(box, "italic") });
        break;
      case "underline":
        if (kind === "formula") break;
        emitStyle(box, { underline: !effectiveUnderline(box) });
        break;
      case "strikethrough":
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, { strikethrough: !effectiveStrikethrough(box) });
        break;
      case "align-left":
      case "align-center":
      case "align-right":
        if (kind === "formula") break;
        emitStyle(box, {
          align: contextCommand.action.slice(6) as PdfTextBoxEdit["align"],
          justify: false,
          distributed: false,
        });
        break;
      case "align-distributed":
        // Word's Distributed spreads every line, the last too, across the
        // frame; pressing it again returns to left alignment.
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, { align: "left", justify: false, distributed: !edit?.distributed });
        break;
      case "list": {
        // The markers are words of the box: typed over its text, one step.
        if (kind === "formula") break;
        const current = currentTextForBox(box, edit);
        const next = applyPdfTextList(current, contextCommand.style, locale);
        if (next === current) break;
        // Word's and PowerPoint's hanging indent: the left indent grows by
        // the widest marker and the first row of each paragraph hangs back
        // by as much, so a wrapped item's rows stand under its words, not
        // under its bullet. A list taken off (or changed) gives back the
        // hang it had; the box's own left indent stays.
        const fontSize = edit?.fontSize ?? box.fontSize;
        const node = textBoxRefs.current.get(stateKeyForId(box.id));
        const computed = node ? getComputedStyle(node) : null;
        const fontPx = Math.max(1, fontSize * pageHeight);
        const hScale = (edit?.horizontalScale ?? 100) / 100;
        const measure = (value: string) =>
          (measureTextAdvancePx(
            value,
            fontPx,
            computed?.fontFamily ?? "",
            computed?.fontWeight ?? "normal",
            computed?.fontStyle ?? "normal",
          ) / (pageHeight || 1) +
            (edit?.characterSpacing ?? 0) * Array.from(value).length +
            (edit?.wordSpacing ?? 0) * (value.match(/ /g) ?? []).length) *
          hScale;
        const had = pdfTextListKindOf(current) && (edit?.firstLineIndent ?? 0) < 0
          ? -(edit?.firstLineIndent ?? 0)
          : 0;
        const hang = pdfTextListKindOf(next) ? pdfTextListMarkerWidth(next, measure) : 0;
        const left = Math.max(0, (edit?.leftIndent ?? 0) - had + hang);
        emitText(box, next, undefined, "other", false, {
          leftIndent: left > 1e-9 ? left : undefined,
          firstLineIndent: hang > 0 ? -hang : had > 0 ? undefined : edit?.firstLineIndent,
        });
        break;
      }
      case "text-direction": {
        // Word's Text Direction. 竖排 sets the box in columns; Rotate all
        // text 90 or 270 turns its text a quarter inside the frame it has
        // on the page -- the box turned about its centre, its width and
        // height exchanged, so it covers the same place. A note imported
        // from the file keeps its own writer, which has neither.
        if (kind === "formula" || edit?.nativeSource) break;
        const target = contextCommand.value;
        const angle = ((Math.round(Number(edit?.angle ?? box.angle ?? 0)) % 360) + 360) % 360;
        const turned = angle === 90 || angle === 270;
        const turns = target === "rotate90" || target === "rotate270";
        const rect = rectOf(box);
        const footprint = turned === turns ? {} : (() => {
          const width = (rect.height * pageHeight) / (pageWidth || 1);
          const height = (rect.width * pageWidth) / (pageHeight || 1);
          return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
        })();
        emitStyle(box, {
          ...footprint,
          angle: target === "rotate90" ? 90 : target === "rotate270" ? 270 : turned ? 0 : angle,
          writingMode: target === "vertical" ? "vertical-rl" : undefined,
          // Its frame is the one the text is set in, never widened to a row.
          ...(target === "horizontal" ? {} : { fixedWidth: true }),
        });
        break;
      }
      case "text-paint": {
        // WordArt Styles: the paint is the words', the box's own colour
        // stays for when it is taken off. A note imported from the file
        // keeps its own writer, which has no place for it.
        if (kind === "formula" || edit?.nativeSource) break;
        const paint = contextCommand.paint ? pdfTextBoxTextPaint(contextCommand.paint) : null;
        if (contextCommand.paint && !paint) break;
        emitStyle(box, { textPaint: paint ?? undefined });
        break;
      }
      case "columns": {
        // Word's and PowerPoint's Columns: the rows fill each column to the
        // frame's foot before the next, so the frame keeps its width.
        if (kind === "formula" || edit?.nativeSource || isMadeVerticalTextBox(edit)) break;
        const count = Math.round(contextCommand.count);
        if (!(count >= 1 && count <= PDF_TEXT_BOX_MAX_COLUMNS)) break;
        const spacing = contextCommand.spacingDocumentUnit;
        emitStyle(box, {
          columnCount: count > 1 ? count : undefined,
          ...(spacing !== undefined && Number.isFinite(spacing) && spacing >= 0
            ? { columnSpacing: spacing > 0 ? spacing / (fontSizeDocumentHeight || 1) : undefined }
            : {}),
          ...(count > 1 ? { fixedWidth: true } : {}),
        });
        break;
      }
      case "tab-stops": {
        // Word's Tabs (its Tabs dialog): the stops measured from the text
        // area's left edge, in the box's page fractions.
        if (kind === "formula" || edit?.nativeSource || isMadeVerticalTextBox(edit)) break;
        const height = fontSizeDocumentHeight || 1;
        const stops = contextCommand.stops
          .filter((stop) => Number.isFinite(stop.positionDocumentUnit) && stop.positionDocumentUnit > 0)
          .map((stop) => ({ position: stop.positionDocumentUnit / height, align: stop.align, leader: stop.leader }))
          .sort((left, right) => left.position - right.position);
        const interval = contextCommand.defaultDocumentUnit;
        emitStyle(box, {
          tabStops: stops.length ? stops : undefined,
          defaultTabStop: interval !== null && Number.isFinite(interval) && interval > 0 ? interval / height : undefined,
        });
        break;
      }
      case "vertical-align":
        // A note imported from the file keeps its own writer, which has no
        // place for it (as for Distributed).
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, { verticalAlign: contextCommand.value === "top" ? undefined : contextCommand.value });
        break;
      case "superscript":
      case "subscript":
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, {
          textScript: edit?.textScript === contextCommand.action ? undefined : contextCommand.action,
        });
        break;
      case "highlight":
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, {
          highlight: edit?.highlight ? undefined : PDF_TEXT_DEFAULT_HIGHLIGHT,
        });
        break;
      case "clear-formatting":
        // Word's Clear All Formatting on a text box: the character and
        // paragraph formats go; the font, size and colour the box was set in
        // stay (a PDF has no Normal style to return them to).
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, {
          bold: false, italic: false, underline: false, strikethrough: false,
          justify: false, distributed: false, align: "left",
          textScript: undefined, highlight: undefined, lineSpacing: undefined,
          characterSpacing: undefined, wordSpacing: undefined, horizontalScale: undefined,
          firstLineIndent: undefined,
          leftIndent: undefined, rightIndent: undefined,
        });
        break;
      case "typography": {
        if (kind === "formula" || edit?.nativeSource) break;
        const value = contextCommand.valueDocumentUnit;
        if (!Number.isFinite(value)) break;
        const control = contextCommand.control;
        if (control === "horizontalScale") {
          if (value <= 0) break;
          emitStyle(box, { horizontalScale: value === 100 ? undefined : value });
          break;
        }
        const fraction = value / (fontSizeDocumentHeight || 1);
        const clamped =
          control === "leftIndent" || control === "rightIndent" ||
          control === "spaceBefore" || control === "spaceAfter"
            ? Math.max(0, fraction)
            : control === "lineSpacing" && fraction < 0
              ? 0
              : fraction;
        emitStyle(box, { [control]: clamped === 0 ? undefined : clamped });
        break;
      }
      case "indent": {
        if (kind === "formula" || edit?.nativeSource) break;
        // One Word default tab stop (36 pt) at a time, never below 0.
        const stop = 36 / (fontSizeDocumentHeight || 1);
        const current = edit?.leftIndent ?? 0;
        const steps = current / stop;
        const next =
          contextCommand.direction === "increase"
            ? (Math.floor(steps + 1e-6) + 1) * stop
            : Math.max(0, (Math.ceil(steps - 1e-6) - 1) * stop);
        emitStyle(box, { leftIndent: next === 0 ? undefined : next });
        break;
      }
      case "rotate": {
        if (kind === "formula") break;
        const angle = Number(edit?.angle ?? box.angle ?? 0);
        const next = (((angle + (contextCommand.direction === "right" ? 90 : -90)) % 360) + 360) % 360;
        // A quarter turn of a wide box near an edge would leave the page
        // (the writer refuses an object outside the crop box): it turns about
        // its centre and then moves just enough to stay on the page.
        const rect = rectOf(box);
        const px = { x: rect.x * pageWidth, y: rect.y * pageHeight,
          width: rect.width * pageWidth, height: rect.height * pageHeight };
        const bounds = rotatedBoundingBox(px, next);
        const shift = (start: number, size: number, limit: number) =>
          size > limit ? 0 : start < 0 ? -start : start + size > limit ? limit - (start + size) : 0;
        const dx = shift(bounds.x, bounds.width, pageWidth) / (pageWidth || 1);
        const dy = shift(bounds.y, bounds.height, pageHeight) / (pageHeight || 1);
        emitStyle(box, {
          angle: next,
          ...(dx || dy ? { x: rect.x + dx, y: rect.y + dy } : {}),
        });
        break;
      }
      case "align-justify":
        // Word's Justify lays the lines out from the left edge and stretches
        // all but each paragraph's last to the frame; pressing it again
        // returns to left alignment, as Word does.
        if (kind === "formula" || edit?.nativeSource) break;
        emitStyle(box, { align: "left", justify: !edit?.justify });
        break;
      case "font-family": {
        if (kind === "formula") break;
        const option = TEXTBOX_FONT_FAMILY_OPTIONS.find(
          (candidate) => candidate.id === contextCommand.optionId,
        );
        if (option) {
          emitStyle(box, {
            fontFamily: option.stack,
            sourceFontName: option.sourceFontName,
            officeFamily: undefined,
          });
          break;
        }
        // Any Office family of All Fonts: the box's writer embeds its served
        // substitute (lib/pdf/text-box-runs.ts), and the box is drawn in it.
        const family = pdfTextBoxOfficeFamily(contextCommand.optionId);
        if (family && !edit?.nativeSource) {
          emitStyle(box, {
            fontFamily: pdfTextBoxRunCssFamily({ font: classifyFontName(family), officeFamily: family }),
            sourceFontName: family,
            officeFamily: family,
          });
          break;
        }
        // A font found on this computer (Browse): the page keeps it and
        // the box is set in it (WPS), else in the nearest served family,
        // and the reader is told why (usePdfPageFonts).
        if (pageFontsInWindow && !edit?.nativeSource) {
          const requested = contextCommand.optionId;
          void pageFontsInWindow.preparePageFont(requested, {
            bold: Boolean(edit?.bold), italic: Boolean(edit?.italic),
          }, edit?.text ?? box.text ?? "").then((result) => {
            if (result.notice) toast({ description: result.notice });
            const chosen = pdfTextBoxOfficeFamily(result.family);
            if (!chosen) return;
            emitStyle(box, {
              fontFamily: pdfTextBoxRunCssFamily({ font: classifyFontName(pdfPageFontDisplayFamily(chosen)), officeFamily: chosen }),
              sourceFontName: pdfPageFontDisplayFamily(chosen),
              officeFamily: chosen,
            });
          }, () => undefined);
          break;
        }
        toast({ description: t("pdf.textBoxRuns.localFontNotWritable", { family: contextCommand.optionId }) });
        break;
      }
      case "font-size":
        if (
          kind === "formula" ||
          !Number.isFinite(contextCommand.valueDocumentUnit) ||
          contextCommand.valueDocumentUnit < 1
        ) {
          break;
        }
        emitStyle(box, {
          fontSize: Math.min(
            0.2,
            Math.max(
              0.006,
              contextCommand.valueDocumentUnit /
                (fontSizeDocumentHeight || 1),
            ),
          ),
        });
        break;
      case "font-size-step":
        if (kind === "formula") break;
        emitStyle(box, {
          fontSize: Math.min(
            0.2,
            Math.max(
              0.006,
              (edit?.fontSize ?? box.fontSize) +
                contextCommand.deltaDocumentUnit /
                  (fontSizeDocumentHeight || 1),
            ),
          ),
        });
        break;
      case "color":
        if (kind === "formula" || !isSafeCssColor(contextCommand.value)) break;
        emitStyle(box, { color: contextCommand.value });
        break;
      case "kind":
        emitKind(box, contextCommand.value);
        break;
      case "delete":
        if (edit?.created) triggerDeleteBox(box.id);
        else emitDeleteExtractedBox(box);
        break;
    }
  }, [
    boxesByKey,
    contextCommand,
    currentTextForBox,
    disabled,
    editsById,
    effectiveBold,
    effectiveItalic,
    effectiveUnderline,
    effectiveStrikethrough,
    emitDeleteExtractedBox,
    emitKind,
    emitStyle,
    emitText,
    fontSizeDocumentHeight,
    locale,
    page,
    pageHeight,
    pageWidth,
    rectOf,
    selectedId,
    stateKeyForId,
    t,
    toggledCharacterFlag,
    triggerDeleteBox,
  ]);

  const beginDrag = useCallback(
    (
      box: TextBox,
      mode: "move" | "rotate" | ResizeHandle,
      event: React.PointerEvent,
    ) => {
      if (disabledRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedId(stateKeyForId(box.id));
      // Capture, so a release off the grip still reaches this gesture (and a
      // finger's moves are the drag's, not the page's).
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        /* best effort (jsdom, a detached grip) */
      }
      const rect = rectOf(box);
      const startAngle = normalizeBoxAngle(
        (editsById[box.id] as { angle?: number } | undefined)?.angle ??
          (box as { angle?: number }).angle,
      );
      let centre: { x: number; y: number } | undefined;
      if (mode === "rotate") {
        // The grip is this far above the centre, along the box's own up.
        const reach =
          (rect.height * (pageHeight || 1)) / 2 + ROTATE_HANDLE_GAP_PX;
        const bearing = ((startAngle - 90) * Math.PI) / 180;
        centre = {
          x: event.clientX - reach * Math.cos(bearing),
          y: event.clientY - reach * Math.sin(bearing),
        };
      }
      setDrag({
        id: box.id,
        key: stateKeyForId(box.id),
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
        startAngle,
        ...(centre ? { centreClientX: centre.x, centreClientY: centre.y } : {}),
        ...(typeof event.pointerId === "number"
          ? { pointerId: event.pointerId }
          : {}),
      });
      dragAuthorityGenerationRef.current += 1;
      setPreviewRect(rect);
    },
    [editsById, pageHeight, rectOf, stateKeyForId],
  );

  // Track the live drag on the window so the pointer can leave the small grip.
  useEffect(() => {
    if (!drag) return;
    const authorityGeneration = dragAuthorityGenerationRef.current;
    const dragAngle = normalizeBoxAngle(
      (boxesByKey[drag.key] as { angle?: number } | undefined)?.angle ??
        (editsById[drag.id] as { angle?: number } | undefined)?.angle,
    );
    // WPS resize: the frame follows the text. A resize measures how tall the
    // text is at each candidate width (one hidden probe for the whole drag)
    // so the frame can grow downward to hold the re-wrapped text and refuse
    // to be pulled shorter than it. Formulas and vertical writing keep plain
    // geometry — their content height is not a wrapped line count.
    const dragBox = boxesByKey[drag.key];
    const dragEdit = dragBox ? editsById[dragBox.id] : undefined;
    const dragWritingMode =
      (dragEdit as { writingMode?: string } | undefined)?.writingMode ??
      (dragBox as { writingMode?: string } | undefined)?.writingMode;
    const fitsContent =
      drag.mode !== "move" &&
      drag.mode !== "rotate" &&
      dragBox !== undefined &&
      effectiveTextBoxKind(dragBox, dragEdit) !== "formula" &&
      dragWritingMode !== "vertical-rl" &&
      pageWidth > 0 &&
      pageHeight > 0;
    const dragText =
      fitsContent && dragBox ? currentTextForBox(dragBox, dragEdit) : "";
    const dragLineLayout: PdfTextLineLayout[] | undefined =
      fitsContent && dragBox
        ? textLineLayoutForBox(dragBox, dragEdit, dragText)
        : undefined;
    // A width change re-wraps the paragraph as one stream (see emitGeometry).
    const wrappedText = dragLineLayout
      ? joinBoxTexts(dragText.split("\n"))
      : dragText;
    const measurer: TextBoxContentHeightMeasurer | null =
      fitsContent && dragBox
        ? createTextBoxContentHeightMeasurer({
            node: textBoxRefs.current.get(drag.key),
            text: wrappedText,
            runs: persistableRunsForBoxText(dragBox, dragEdit, wrappedText),
            box: dragBox,
            fontSizePx: Math.max(
              6,
              (dragEdit?.fontSize ?? dragBox.fontSize) * pageHeight,
            ),
            pageHeight,
          })
        : null;
    const contentHeightFor = (widthFraction: number): number | null => {
      if (!measurer) return null;
      if (
        dragLineLayout &&
        Math.abs(widthFraction - drag.startRect.width) <= BOX_RECT_EPSILON
      ) {
        // Same width: the lines stay where the source put them.
        return lineLayoutContentHeight(dragLineLayout, drag.startRect.height);
      }
      return measurer.heightPx(widthFraction * pageWidth) / pageHeight;
    };
    const rectFor = (event: PointerEvent) => {
      const dx = (event.clientX - drag.startX) / (pageWidth || 1);
      const dy = (event.clientY - drag.startY) / (pageHeight || 1);
      // Moving keeps the page's axes: dragging right moves right, whatever the
      // box is turned to. Resizing does not — the "e" handle means the BOX's
      // right edge, so the pointer travel has to be read in the box's own
      // frame or every handle on a turned box pulls the wrong way.
      if (drag.mode === "move") return moveBox(drag.startRect, dx, dy);
      if (drag.mode === "rotate") return drag.startRect;
      const local =
        dragAngle === 0
          ? { x: dx, y: dy }
          : rotatePointAround({ x: dx, y: dy }, { x: 0, y: 0 }, -dragAngle);
      return resizeTextBoxToFitContent(
        drag.startRect,
        drag.mode,
        local.x,
        local.y,
        contentHeightFor,
      );
    };
    /** The angle a rotate gesture is currently pointing at. */
    const angleFor = (event: PointerEvent): number => {
      if (
        drag.centreClientX === undefined ||
        drag.centreClientY === undefined
      ) {
        return drag.startAngle ?? 0;
      }
      const bearing =
        (Math.atan2(
          event.clientY - drag.centreClientY,
          event.clientX - drag.centreClientX,
        ) *
          180) /
        Math.PI;
      // The grip points at the box's TOP, which is 90 degrees before its
      // reading direction.
      return snapBoxRotation(bearing + 90, event.shiftKey);
    };
    // Only the pointer that started the gesture moves or ends it: a second
    // finger, or a stale gesture whose release went missing, must never move
    // the box on the next unrelated tap.
    const otherPointer = (event: PointerEvent) =>
      drag.pointerId !== undefined &&
      event.pointerId !== undefined &&
      event.pointerId !== drag.pointerId;
    const discard = () => {
      setDrag(null);
      setPreviewRect(null);
      setPreviewAngle(null);
    };
    const onMove = (event: PointerEvent) => {
      if (otherPointer(event)) return;
      // the mouse button came up where we could not see it: a ghost drag
      if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
        discard();
        return;
      }
      if (
        disabledRef.current ||
        authorityGeneration !== dragAuthorityGenerationRef.current
      ) {
        return;
      }
      if (drag.mode === "rotate") {
        setPreviewAngle(angleFor(event));
        return;
      }
      setPreviewRect(rectFor(event));
    };
    const onUp = (event: PointerEvent) => {
      if (otherPointer(event)) return;
      const box = boxesByKey[drag.key];
      if (
        disabledRef.current ||
        authorityGeneration !== dragAuthorityGenerationRef.current
      ) {
        // Live revoke invalidates the gesture before it can publish geometry.
      } else if (drag.mode === "rotate") {
        if (box) emitGeometry(box, drag.startRect, angleFor(event));
      } else if (box) {
        const next = rectFor(event);
        // The frame clicked, not dragged (the pointer let go within the few
        // pixels a hand moves while it clicks).
        const frameClicked =
          drag.mode === "move" &&
          Math.abs(event.clientX - drag.startX) <= 3 &&
          Math.abs(event.clientY - drag.startY) <= 3;
        // A resize the content refused (pulled shorter than the text) changes
        // nothing; writing the same rect back would still turn an untouched
        // line into an edit and cover its canvas glyphs. So does a click on
        // the frame: it selects the box and moves nothing, as in Word. It
        // used to write the box where it stood (or a pixel off) -- a save of
        // the page and a step of Undo that changed nothing to see, for every
        // box selected by its frame.
        if (
          !frameClicked &&
          !boxRectsNearlyEqual(next, drag.startRect, BOX_RECT_EPSILON)
        ) {
          emitGeometry(box, next);
        }
        // The box is selected as an object (the caret leaves its words), so
        // Delete removes the box itself.
        if (frameClicked) {
          const node = textBoxRefs.current.get(drag.key);
          if (node && document.activeElement === node) node.blur();
          setObjectSelectedKey(drag.key);
        }
      }
      setDrag(null);
      setPreviewRect(null);
      setPreviewAngle(null);
    };
    // pointercancel (the browser took the touch, capture torn down) rolls the
    // gesture back without committing.
    const onCancel = (event: PointerEvent) => {
      if (otherPointer(event)) return;
      discard();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      measurer?.dispose();
    };
  }, [
    drag,
    pageWidth,
    pageHeight,
    boxesByKey,
    currentTextForBox,
    editsById,
    emitGeometry,
  ]);

  // In "Add Text" mode the armed tool places a box wherever the page is
  // pressed, as Word's and ONLYOFFICE's Insert > Text Box do: a click places
  // one of the default size at the point, a drag draws it at the dragged
  // size. The press is taken in the capture phase, before the boxes under it
  // (each stops its own pointerdown): taken on the blank area only, a click
  // over a line of text or a box placed nothing, and no drag ever drew one.
  const placingDragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [placingRect, setPlacingRect] = useState<BoxRect | null>(null);
  const placingPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / (pageWidth || 1))),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / (pageHeight || 1))),
    };
  };
  const placingRectFrom = (start: { x: number; y: number }, end: { x: number; y: number }): BoxRect | null => {
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    // Under a few pixels each way it is a click, not a drawn box.
    if (width * pageWidth < PLACING_DRAG_MIN_PX && height * pageHeight < PLACING_DRAG_MIN_PX) return null;
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height };
  };
  const handlePlacingPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !addMode || !onCreateBox || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = placingPoint(event);
    placingDragRef.current = { pointerId: event.pointerId, ...point };
    setPlacingRect(null);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* a synthetic press */ }
  };
  const handlePlacingPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = placingDragRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPlacingRect(placingRectFrom(start, placingPoint(event)));
  };
  const handlePlacingPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = placingDragRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    placingDragRef.current = null;
    setPlacingRect(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (disabled || !addMode || !onCreateBox) return;
    const drawn = placingRectFrom(start, placingPoint(event));
    if (!drawn) {
      onCreateBox(start.x, start.y);
      return;
    }
    // A box drawn flatter than a line of the default size is one line tall
    // (Word keeps a drawn text box at least as tall as its first line).
    onCreateBox(drawn.x, drawn.y, {
      width: Math.max(drawn.width, PLACING_DRAG_MIN_PX / (pageWidth || 1)),
      height: Math.max(drawn.height, DEFAULT_NEW_BOX_FONT_SIZE * 1.5),
    });
  };
  const handlePlacingPointerCancel = () => {
    placingDragRef.current = null;
    setPlacingRect(null);
  };

  // Each box's hit margin, stopped halfway to its neighbours so a press in
  // the gap between two lines goes to the nearer one (`textBoxHitMargins`).
  const hitMarginsById = useMemo(() => {
    const rects = boxes.map((box) => {
      if (editsById[box.id]?.deleted) return null;
      const rect =
        drag?.key === stateKeyForId(box.id) && previewRect ? previewRect : rectOf(box);
      return {
        left: rect.x * pageWidth,
        top: rect.y * pageHeight,
        width: Math.max(8, rect.width * pageWidth),
        height: Math.max(8, rect.height * pageHeight),
      };
    });
    const margins = boxes.map((box) => {
      const fontSize = Math.max(6, (editsById[box.id]?.fontSize ?? box.fontSize) * pageHeight);
      return Math.max(4, Math.min(8, fontSize * 0.25));
    });
    const byId = new Map<string, TextBoxHitMargin>();
    textBoxHitMargins(rects, margins).forEach((margin, index) => {
      byId.set(boxes[index].id, margin);
    });
    return byId;
  }, [boxes, editsById, rectOf, stateKeyForId, drag?.key, previewRect, pageWidth, pageHeight]);

  const toolbarBtnStyle: CSSProperties = {
    lineHeight: 1,
    padding: 0,
    border: "1px solid var(--pdf-chrome-field-border, #d1d5db)",
    borderRadius: 4,
    background: "var(--pdf-chrome-field, #fff)",
    cursor: "pointer",
    color: "var(--pdf-chrome-ink, #0f172a)",
    width: 28,
    height: 28,
    minWidth: 28,
    minHeight: 28,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  };

  return (
    <div
      ref={overlayRef}
      data-testid="pdf-textbox-overlay"
      data-add-mode={addMode ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      // The container normally ignores pointer events so sibling overlays (e.g.
      // images) beneath it stay interactive; only the boxes/handles below opt
      // back in. In Add-Text mode it captures clicks on the blank canvas so a new
      // box can be placed (a crosshair cursor signals the mode).
      onPointerDownCapture={handlePlacingPointerDown}
      onPointerMove={addMode ? handlePlacingPointerMove : undefined}
      onPointerUp={addMode ? handlePlacingPointerUp : undefined}
      onPointerCancel={addMode ? handlePlacingPointerCancel : undefined}
      style={{
        position: "absolute",
        inset: 0,
        width: pageWidth,
        height: pageHeight,
        pointerEvents: addMode && !disabled ? "auto" : "none",
        cursor: addMode && !disabled ? "crosshair" : undefined,
      }}
    >
      {placingRect ? (
        <div
          aria-hidden="true"
          data-testid="pdf-textbox-placing-rect"
          style={{
            position: "absolute",
            left: placingRect.x * pageWidth,
            top: placingRect.y * pageHeight,
            width: placingRect.width * pageWidth,
            height: placingRect.height * pageHeight,
            border: "1px dashed var(--pdf-selection-stroke, #2563eb)",
            pointerEvents: "none",
            boxSizing: "border-box",
          }}
        />
      ) : null}
      {boxes.map((box) => {
        const boxKey = stateKeyForId(box.id);
        const edit = editsById[box.id];
        const text = edit?.text ?? box.text;
        const kind = effectiveTextBoxKind(box, edit);
        const isFormula = kind === "formula";
        const isSelected = selectedId === boxKey;
        const boxStackZ = 1 + 2 * (stackRanks?.get(box.id) ?? 0);
        // A deleted extracted line renders ONLY its opaque cover (below) — no
        // editable box, hit area, or selection chrome — so the line reads as
        // removed while the original glyphs stay hidden. Undo restores it.
        const isDeleted = Boolean(edit?.deleted);
        // Trash affordance: a created box deletes its record outright (needs
        // the host's onDeleteBox); an EXTRACTED line deletes via a persisted
        // mask-only edit routed through onEditBox (always available).
        const showDelete = edit?.created ? Boolean(onDeleteBox) : true;
        const rect =
          drag?.key === boxKey && previewRect ? previewRect : rectOf(box);
        const left = rect.x * pageWidth;
        const top = rect.y * pageHeight;
        const width = Math.max(8, rect.width * pageWidth);
        const height = Math.max(8, rect.height * pageHeight);
        // A persisted font-size edit (the A+/A− buttons) must drive the rendered
        // glyph; falling back to the extracted size only when unedited. (Reading
        // box.fontSize unconditionally made the A+/A− controls silently no-op.)
        const fontSize = Math.max(
          6,
          (edit?.fontSize ?? box.fontSize) * pageHeight,
        );

        const formulaDraft = isFormula
          ? effectiveFormulaDraftsByKey[boxKey]
          : undefined;
        // An untranscribed formula box (broken math-font ToUnicode) has no
        // reliable source characters: deriving LaTeX from its garbage text
        // would resurrect exactly the wrong-but-plausible seed the extraction
        // layer refused to fabricate. The user's own latex/text edits win.
        const awaitingTranscription =
          isFormula &&
          Boolean(box.transcriptionNeeded) &&
          edit?.latex == null &&
          edit?.text == null;
        const committedLatexSource = isFormula
          ? normalizePdfFormulaLatexSource(
              edit?.latex ??
                (awaitingTranscription
                  ? ""
                  : (box.latex ?? latexFromPdfFormulaText(text))),
            )
          : "";
        const normalizedFormulaDraft =
          isFormula && formulaDraft != null
            ? normalizePdfFormulaLatexSource(formulaDraft)
            : undefined;
        const liveFormulaPreviewFromDraft =
          normalizedFormulaDraft != null &&
          normalizedFormulaDraft !== committedLatexSource &&
          !pdfFormulaLatexSourceError(normalizedFormulaDraft);
        const latexSource = liveFormulaPreviewFromDraft
          ? normalizedFormulaDraft
          : committedLatexSource;
        const canRenderFormulaPreview =
          isFormula && pdfFormulaBoxDrawsLatex({ created: edit?.created === true }, latexSource);
        const formulaFallbackText =
          liveFormulaPreviewFromDraft && latexSource.trim()
            ? fallbackTextFromPdfFormulaLatex(latexSource).trim() || text
            : text;
        const autoRenderFormulaPreview = canRenderFormulaPreview && !edit;
        const rendersFormulaFallbackText =
          isFormula &&
          !canRenderFormulaPreview &&
          Boolean(formulaFallbackText.trim()) &&
          (Boolean(edit) || isSelected || liveFormulaPreviewFromDraft) &&
          // Never paint charcode garbage over the correctly rendered canvas
          // glyphs while a formula still awaits transcription.
          (!awaitingTranscription || liveFormulaPreviewFromDraft);
        // Plain text boxes mask the canvas and show their own editable text only
        // when active (selected or already edited), avoiding font-mismatch
        // double-render. Formula boxes can safely repaint before selection only
        // when we have valid, structured LaTeX; weak scalar-like formulas keep the
        // original PDF glyphs until the user explicitly opens the formula editor.
        const active = isSelected || Boolean(edit);
        const rendersOwnContent = isFormula
          ? (canRenderFormulaPreview && (active || autoRenderFormulaPreview)) ||
            rendersFormulaFallbackText
          : active;
        const replacingSourceText = Boolean(edit);
        const singleLinePdfText = !isFormula && !hasHardLineBreak(text);
        // A box the user drew or sized by hand wraps inside its width and its
        // frame grows downward (WPS); an untouched extracted line stays one
        // line whose transparent text sits over its own canvas glyphs.
        const wrapsToBoxWidth = !isFormula && textBoxWrapsToWidth(edit);
        // A created box or a box already holding several lines keeps pasted
        
        const keepsPastedLineBreaks =
          !isFormula && (!singleLinePdfText || Boolean(edit?.created));
        // Two-row toolbar. Row 1: 3 align + B/I/U + kind toggle + the shared
        // Docs-style size field (7 buttons + 1 field). Row 2: family select +
        // 4 swatches + free color input (+ delete). The panel width used for
        // the on-page clamp is the wider row.
        const styleRowButtonCount = 7;
        const styleRowItemCount = styleRowButtonCount + 1;
        const styleRowWidth =
          styleRowButtonCount * TOOLBAR_BUTTON_PX +
          TEXTBOX_NUMBER_FIELD_WIDTH_PX +
          (styleRowItemCount - 1) * TOOLBAR_GAP_PX +
          TOOLBAR_PADDING_X_PX;
        const toolbarSwatchCount = 4;
        const paletteRowItemCount =
          2 + toolbarSwatchCount + (showDelete ? 1 : 0);
        const paletteRowWidth =
          FONT_FAMILY_SELECT_WIDTH_PX +
          toolbarSwatchCount * COLOR_SWATCH_PX +
          COLOR_INPUT_WIDTH_PX +
          (showDelete ? TOOLBAR_BUTTON_PX : 0) +
          Math.max(0, paletteRowItemCount - 1) * TOOLBAR_GAP_PX +
          TOOLBAR_PADDING_X_PX;
        const toolbarWidth = Math.max(styleRowWidth, paletteRowWidth);
        const formulaDisplayRect =
          isFormula && canRenderFormulaPreview && rendersOwnContent
            ? pdfFormulaPreviewRectPx({
                latex: latexSource,
                fontSizePx: fontSize,
                baseLeftPx: left,
                baseTopPx: top,
                baseWidthPx: width,
                baseHeightPx: height,
                pageWidthPx: pageWidth,
                pageHeightPx: pageHeight,
              })
            : null;
        const displayHeight = formulaDisplayRect?.height ?? height;
        const displayWidth = formulaDisplayRect?.width ?? width;
        const displayLeft = formulaDisplayRect?.left ?? left;
        const displayTop = formulaDisplayRect?.top ?? top;
        const toolbarLeft = Math.min(
          Math.max(0, displayLeft),
          Math.max(0, pageWidth - toolbarWidth),
        );
        const moveGripTop = Math.max(
          0,
          displayTop - TEXTBOX_MOVE_GRIP_TOP_OFFSET_PX,
        );
        const toolbarAboveGrip =
          moveGripTop - TEXTBOX_FLOATING_GAP_PX - TEXTBOX_TOOLBAR_HEIGHT_PX;
        const toolbarBelowBox =
          displayTop + displayHeight + TEXTBOX_FLOATING_GAP_PX;
        const toolbarTop =
          toolbarAboveGrip >= 0
            ? toolbarAboveGrip
            : Math.max(
                0,
                Math.min(
                  Math.max(0, pageHeight - TEXTBOX_TOOLBAR_HEIGHT_PX),
                  toolbarBelowBox,
                ),
              );
        const formulaPanelWidth = Math.min(
          Math.max(displayWidth, FORMULA_PANEL_MIN_WIDTH_PX),
          Math.max(120, pageWidth - 16),
        );
        const formulaPanelLeft = Math.min(
          Math.max(0, displayLeft),
          Math.max(0, pageWidth - formulaPanelWidth),
        );
        const formulaPanelTop = formulaPanelTopForBox({
          top: displayTop,
          displayHeight,
          toolbarTop,
          pageHeight,
        });
        // The stationary opaque cover over the ORIGINAL glyph region. It stays
        // pinned to where the text was extracted (edit.origin*), so dragging the
        // editable box away no longer reveals the original PDF text underneath
        // (the editable box carries its own white background to whatever it lands
        // on). Rendered only once a box has a persisted edit; for a legacy edit
        // with no recorded origin the cover coincides with the live rect — the
        // prior behaviour, no worse than before. Painted FIRST so the editable
        // box / handles layer on top.
        // The cover's overshoot is clamped against every OTHER box on the
        // page: on a dense page it otherwise paints an opaque block over the
        // bullet before the line, the label beside it, or the next line —
        // words the user never touched.
        const coverNeighbors = boxes
          .filter((other) => other.id !== box.id)
          .map((other) => rectOf(other));
        let sourceCoverBase: BoxRect | null = null;
        let sourceCoverOrigins: BoxRect[] = [];
        if (edit) {
          sourceCoverBase = edit.created
            ? coverRectForEdit(edit)
            : sourceRectForExtractedTextEdit(box, edit);
          sourceCoverOrigins = edit.created
            ? [sourceCoverBase]
            : sourceLineRectsForTextBox(box, sourceCoverBase);
        } else if (isFormula && rendersOwnContent) {
          sourceCoverBase = {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
          sourceCoverOrigins = [sourceCoverBase];
        }
        const sourceCovers = sourceCoverOrigins.map((source) =>
          edit?.created
            ? source
            : clampCoverToNeighbors(
                expandRectForGlyphCover(
                  source,
                  edit?.fontSize ?? box.fontSize,
                  {
                    pageWidth,
                    pageHeight,
                  },
                ),
                source,
                coverNeighbors,
              ),
        );
        const usesLineShapedBackground = Boolean(
          edit &&
          !edit.created &&
          sourceCoverBase &&
          sourceCovers.length > 1 &&
          boxRectsNearlyEqual(rect, sourceCoverBase),
        );
        const backgroundColor = textboxBackgroundColor(edit);
        // An imported box's own solid border, kept visible while it is edited.
        // A translucent source note stays translucent while edited: text,
        
        const sourceOpacity =
          edit?.nativeSource &&
          typeof edit.sourceOpacity === "number" &&
          Number.isFinite(edit.sourceOpacity) &&
          edit.sourceOpacity >= 0 &&
          edit.sourceOpacity < 1
            ? edit.sourceOpacity
            : undefined;
        const sourceBorderFraction = Number(edit?.sourceBorderWidth);
        const sourceBorderPx =
          Number.isFinite(sourceBorderFraction) && sourceBorderFraction > 0
            ? Math.max(1, Math.round(sourceBorderFraction * pageHeight))
            : 0;
        const hitPadding = Math.max(4, Math.min(8, fontSize * 0.25));
        const hitMargin = hitMarginsById.get(box.id);
        const hitLeft = Math.max(0, displayLeft - (hitMargin?.left ?? hitPadding));
        const hitTop = Math.max(0, displayTop - (hitMargin?.top ?? hitPadding));
        const hitRight = Math.min(
          pageWidth,
          displayLeft + displayWidth + (hitMargin?.right ?? hitPadding),
        );
        const hitBottom = Math.min(
          pageHeight,
          displayTop + displayHeight + (hitMargin?.bottom ?? hitPadding),
        );
        const hitAreaZIndex = 0;

        // A run extracted from text that was not upright carries its angle. CSS
        // turns about the element's centre by default, which is the same centre
        // the model and the export use — so the editable box lands on the
        // glyphs instead of lying flat across them.
        const boxAngle =
          drag?.mode === "rotate" &&
          drag.key === stateKeyForId(box.id) &&
          previewAngle !== null
            ? previewAngle
            : normalizeBoxAngle(
                (editsById[box.id] as { angle?: number } | undefined)?.angle ??
                  (box as { angle?: number }).angle,
              );
        const rotationStyle: CSSProperties =
          boxAngle === 0
            ? {}
            : {
                transform: `rotate(${boxAngle}deg)`,
                transformOrigin: "center",
              };

        const isVerticalText =
          (editsById[box.id] as { writingMode?: string } | undefined)
            ?.writingMode === "vertical-rl" ||
          (box as { writingMode?: string }).writingMode === "vertical-rl";
        const verticalStyle: CSSProperties = isVerticalText
          ? { writingMode: "vertical-rl", textOrientation: "upright" }
          : {};

        const style: CSSProperties = {
          position: "absolute",
          ...rotationStyle,
          ...verticalStyle,
          left: displayLeft,
          top: displayTop,
          // Keep the layout box stable before/after selection. A previous version
          // added the explicit width/min-height only after focus, so a drag-select
          // could start on one DOM geometry and finish on another.
          width: displayWidth,
          minWidth: displayWidth,
          // A source single-line box has a fixed 1.25em extraction band. Keep
          // its geometry fixed while the baseline strut below aligns glyphs;
          // content may paint outside but must never grow the selectable box.
          // A box set in columns (竖排) wraps at its frame's height and
          // grows its frame to the left (emitText).
          height:
            (singleLinePdfText && !wrapsToBoxWidth) ||
            (isFormula && rendersOwnContent) ||
            isMadeVerticalTextBox(edit) ||
            hasTextBoxColumns(edit)
              ? displayHeight
              : undefined,
          minHeight: displayHeight,
          fontSize,
          // Match the original glyph: use the PDF run's font family + weight +
          // style (pdf.js loaded these into document.fonts for the canvas), and
          // a tight line-height so the baseline sits where the canvas glyph was.
          // A persisted B/I/U edit overrides the extracted run so the toggle
          // reflects live in the overlay (and lines up with the baked export).
          fontFamily: isFormula
            ? FORMULA_EDITOR_FONT_FAMILY
            : renderFontFamily(box, edit),
          fontWeight: effectiveBold(box) ? "bold" : "normal",
          fontStyle: effectiveItalic(box) ? "italic" : "normal",
          textDecoration:
            [
              ...(effectiveUnderline(box) ? ["underline"] : []),
              ...(effectiveStrikethrough(box) ? ["line-through"] : []),
            ].join(" ") || "none",
          lineHeight: PDF_TEXTBOX_LINE_HEIGHT_RATIO,
          // Default to true black (most PDF body text) rather than a grey.
          color:
            replacingSourceText || rendersFormulaFallbackText
              ? effectiveColor(box)
              : "transparent",
          caretColor:
            isSelected && !isFormula ? effectiveColor(box) : undefined,
          textAlign: edit?.justify ? "justify" : (edit?.align ?? "left"),
          whiteSpace:
            singleLinePdfText && !wrapsToBoxWidth ? "pre" : "pre-wrap",
          overflowWrap: isFormula ? "anywhere" : "break-word",
          tabSize: isFormula ? 2 : undefined,
          // The editable surface owns text layout only. Selection chrome is a
          // separate sibling below, so overlapping unselected PDF text runs do
          // not leave extra dashed boxes across the active object and the frame
          // can never change the contenteditable box model.
          outline: "none",
          cursor: isFormula ? "default" : "text",
          pointerEvents: disabled ? "none" : "auto",
          background:
            replacingSourceText && !usesLineShapedBackground
              ? backgroundColor
              : "transparent",
          display: isFormula ? "flex" : undefined,
          alignItems: isFormula ? "center" : undefined,
          justifyContent: isFormula ? "center" : undefined,
          borderRadius: 2,
          boxSizing: "border-box",
          zIndex: isSelected ? TEXTBOX_SELECTED_Z_INDEX : boxStackZ,
          ...(sourceOpacity !== undefined ? { opacity: sourceOpacity } : {}),
          // The author's inner text area (/RD): the text sits inside it, the
          
          ...(edit?.sourceInsets
            ? {
                paddingLeft: edit.sourceInsets.left * pageWidth,
                paddingRight: edit.sourceInsets.right * pageWidth,
                paddingTop: edit.sourceInsets.top * pageHeight,
                paddingBottom: edit.sourceInsets.bottom * pageHeight,
              }
            : {}),
          // Word's whole-box formats lay the draft out the way the writer
          // will (text-box-typography.ts).
          ...(!isFormula && edit
            ? (pdfTextBoxTypographyStyle(
                readPdfTextBoxTypography(edit, edit.fontSize ?? box.fontSize),
                pageHeight,
                fontSize,
                pageHeight / (fontSizeDocumentHeight || pageHeight || 1),
              ) as CSSProperties)
            : {}),
        };
        if (!isFormula && edit?.horizontalScale && edit.horizontalScale !== 100) {
          const scaled = pdfTextBoxHorizontalScaleFrame(
            Number(style.left), Number(style.width), edit.horizontalScale,
          );
          if (scaled.scale) {
            style.left = scaled.left;
            style.width = scaled.width;
            style.minWidth = scaled.width;
            style.scale = scaled.scale;
            style.transformOrigin = "center";
          }
        }

        return (
          <Fragment key={boxKey}>
            {sourceCovers.map((sourceCover, coverIndex) => (
              <div
                key={`${boxKey}-cover-${coverIndex}`}
                data-testid="pdf-textbox-cover"
                data-box-id={box.id}
                data-cover-segment={coverIndex}
                aria-hidden
                style={{
                  position: "absolute",
                  left: sourceCover.x * pageWidth,
                  top: sourceCover.y * pageHeight,
                  width: Math.max(1, sourceCover.width * pageWidth),
                  height: Math.max(1, sourceCover.height * pageHeight),
                  background: backgroundColor,
                  // Non-interactive: it must never swallow clicks meant for the
                  // box/handles that paint above it.
                  pointerEvents: "none",
                }}
              />
            ))}
            {sourceBorderPx > 0 ? (
              <div
                data-testid="pdf-textbox-source-border"
                data-box-id={box.id}
                aria-hidden
                style={{
                  position: "absolute",
                  ...rotationStyle,
                  left: displayLeft,
                  top: displayTop,
                  width: displayWidth,
                  height: displayHeight,
                  boxSizing: "border-box",
                  border: `${sourceBorderPx}px solid ${effectiveColor(box)}`,
                  ...(sourceOpacity !== undefined ? { opacity: sourceOpacity } : {}),
                  pointerEvents: "none",
                  // Above the box's own fill, which used to paint over it the
                  
                  zIndex: (isSelected ? TEXTBOX_SELECTED_Z_INDEX : boxStackZ) + 1,
                }}
              />
            ) : null}
            {!disabled && !isSelected && !isDeleted ? (
              <div
                data-testid="pdf-textbox-hitarea"
                data-box-id={box.id}
                aria-hidden
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const point = {
                    clientX: event.clientX,
                    clientY: event.clientY,
                  };
                  setSelectedId(boxKey);
                  scheduleClickCaret(box.id, () => focusTextBox(box.id, point));
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                style={{
                  position: "absolute",
                  left: hitLeft,
                  top: hitTop,
                  width: Math.max(1, hitRight - hitLeft),
                  height: Math.max(1, hitBottom - hitTop),
                  background: "transparent",
                  cursor: isFormula ? "default" : "text",
                  pointerEvents: "auto",
                  zIndex: hitAreaZIndex,
                }}
              />
            ) : null}
            {isDeleted ? null : (
              <div
                data-testid="pdf-textbox"
                data-box-id={box.id}
                data-kind={kind}
                data-formula={isFormula ? "true" : undefined}
                data-auto-formula-preview={
                  autoRenderFormulaPreview ? "true" : undefined
                }
                data-formula-draft-preview={
                  liveFormulaPreviewFromDraft ? "true" : undefined
                }
                data-plain-text={isFormula ? formulaFallbackText : undefined}
                data-pdf-textbox-hscale={
                  !isFormula && edit?.horizontalScale && edit.horizontalScale !== 100
                    ? String(edit.horizontalScale)
                    : undefined
                }
                data-pdf-textbox-typography={
                  !isFormula && edit &&
                  hasPdfTextBoxTypography(readPdfTextBoxTypography(edit, edit.fontSize ?? box.fontSize))
                    ? "true"
                    : undefined
                }
                {...(() => {
                  // Word's Spacing Before / After, for the paragraphs the
                  // box's text is written in (writeTextStyleRunsToDom).
                  const spacing = !isFormula && edit
                    ? pdfTextBoxParagraphSpacingPx(readPdfTextBoxTypography(edit, edit.fontSize ?? box.fontSize), pageHeight)
                    : null;
                  // Word's Tabs: the stops the box's tabs reach (layOutBoxTabs);
                  // a tab typed in a box that states none, Word's 0.5 in.
                  const typography = !isFormula && edit ? readPdfTextBoxTypography(edit, edit.fontSize ?? box.fontSize) : null;
                  const tabs = typography
                    ? pdfTextBoxTabStopsPx(typography, pageHeight, fontSizeDocumentHeight) ??
                      ((edit?.text ?? box.text).includes("\t")
                        ? { stops: [], interval: pdfTextBoxDefaultTabStop(fontSizeDocumentHeight) * pageHeight } : null)
                    : null;
                  return {
                    ...(spacing ? {
                      "data-pdf-textbox-space-before": String(spacing.before),
                      "data-pdf-textbox-space-after": String(spacing.after),
                    } : {}),
                    ...(tabs ? {
                      "data-pdf-textbox-tabs": JSON.stringify(tabs),
                      "data-pdf-textbox-tab-indent": String((typography?.leftIndent ?? 0) * pageHeight),
                    } : {}),
                  };
                })()}
                data-selected={isSelected ? "true" : undefined}
                aria-disabled={disabled || undefined}
                aria-label={t(
                  isSelected
                    ? "pdf.textbox.labelSelected"
                    : "pdf.textbox.label",
                )}
                role="textbox"
                ref={(node) => {
                  if (node) {
                    textBoxRefs.current.set(boxKey, node);
                    textBoxInputRulesRef.current.set(boxKey, {
                      box,
                      formula: isFormula,
                      singleLine: singleLinePdfText,
                      preserveLineBreaks: keepsPastedLineBreaks,
                    });
                    // Live Preview shows a hovered format on the range the
                    // next style command will format (`emitStyle`).
                    registerPdfTextBoxSelectionReader(node, () => {
                      const remembered = lastSelectionRef.current.get(boxKey) ?? null;
                      return selectionOffsetsInNode(node, remembered) ?? remembered;
                    });
                    if (!isFormula) {
                      syncTextBoxDomText(
                        box,
                        edit,
                        text,
                        document.activeElement !== node,
                      );
                    }
                  } else {
                    textBoxRefs.current.delete(boxKey);
                    textBoxInputRulesRef.current.delete(boxKey);
                  }
                }}
                contentEditable={
                  disabled || isFormula ? false : "plaintext-only"
                }
                tabIndex={disabled ? -1 : isFormula ? 0 : undefined}
                suppressContentEditableWarning
                spellCheck={false}
                onFocus={() => {
                  if (!disabled) setSelectedId(boxKey);
                  setObjectSelectedKey(null);
                  typingBoxKeyRef.current = boxKey;
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (disabled) return;
                  textPointerStateRef.current = {
                    id: boxKey,
                    startX: event.clientX,
                    startY: event.clientY,
                  };
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  if (disabled) return;
                  const pointerState = textPointerStateRef.current;
                  textPointerStateRef.current = null;
                  if (
                    !pointerState ||
                    pointerState.id !== boxKey ||
                    Math.abs(event.clientX - pointerState.startX) > 4 ||
                    Math.abs(event.clientY - pointerState.startY) > 4
                  ) {
                    return;
                  }
                  const { clientX, clientY } = event;
                  setSelectedId(boxKey);
                  scheduleClickCaret(box.id, (node) => {
                    if (!isPlainTextEditableNode(node)) return;
                    node.focus({ preventScroll: true });
                    if (
                      placeCaretFromPoint(
                        node,
                        clientX,
                        clientY,
                        textEditStabilityV2,
                      )
                    ) {
                      rememberSelection(box.id, selectionOffsetsInNode(node));
                    }
                  });
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(boxKey);
                }}
                onKeyDown={(event) =>
                  isFormula
                    ? handleFormulaPreviewKeyDown(event)
                    // Word's Tab in a text box: a tab character, set at the
                    // box's next stop (focus does not leave the box).
                    : event.key === "Tab" && !event.shiftKey && !event.altKey && !event.metaKey &&
                      !event.ctrlKey && !event.nativeEvent.isComposing && Boolean(edit?.created)
                      ? (event.preventDefault(), void event.currentTarget.ownerDocument.execCommand("insertText", false, "\t"))
                      : handleKeyDown(
                        box,
                        event,
                        singleLinePdfText,
                        keepsPastedLineBreaks,
                      )
                }
                onPaste={(event) => {
                  if (isFormula) {
                    event.preventDefault();
                    return;
                  }
                  handlePaste(box, event, singleLinePdfText, keepsPastedLineBreaks);
                }}
                onDrop={(event) => {
                  if (isFormula) {
                    event.preventDefault();
                    return;
                  }
                  handleDrop(box, event, singleLinePdfText, keepsPastedLineBreaks);
                }}
                onInput={(event) => {
                  if (!isFormula) {
                    handleInput(box, event);
                    layOutBoxTabs(event.currentTarget);
                  }
                }}
                onSelect={(event) => {
                  if (!isFormula) {
                    const selection = selectionForBox(box.id, event.currentTarget);
                    rememberSelection(box.id, selection);
                    releaseMovedTypingFormat(box.id, selection);
                  }
                }}
                onCompositionStart={(event) => {
                  if (!isFormula) handleCompositionStart(box, event);
                }}
                onCompositionEnd={(event) => {
                  if (!isFormula) handleCompositionEnd(box, event);
                }}
                onBlur={(event) => {
                  if (isFormula) return;
                  // Into the ribbon or a menu the box stays selected (the
                  // overlay's own press rule) and the words selected in it
                  // stay painted until the user leaves it.
                  const held = holdOfficeTextBoxForChrome(event.currentTarget, event.relatedTarget, () => {
                    if (typingBoxKeyRef.current === boxKey) typingBoxKeyRef.current = null;
                  });
                  if (!held && typingBoxKeyRef.current === boxKey) typingBoxKeyRef.current = null;
                  // Left for the page (not the ribbon): the format held at
                  // the caret goes with the caret.
                  if (!held) putPendingTypingFormat(boxKey, null);
                  const committedText = event.currentTarget.textContent ?? "";
                  handleBlur(box, event);
                  if (editsById[box.id]?.created) {
                    // A new box left with nothing typed in it goes away, as
                    // in WPS (into the ribbon it stays: a face may be picked
                    // first). Kept, it went to the save as a row with no
                    // directive, which the server refused (422 on the row
                    // plan), and the page read as unsaved from then on
                    
                    // 边上…直接报无法保存，彻底用不了」).
                    if (!held && !committedText.trim() && onDeleteBox) {
                      triggerDeleteBox(box.id);
                    } else if (onCreatedBoxCommit) {
                      onCreatedBoxCommit(box.id, committedText);
                    }
                  }
                }}
                className={`pdf-textbox-edit${
                  singleLinePdfText && !isVerticalText
                    ? " pdf-textbox-source-baseline"
                    : ""
                }`}
                style={style}
              >
                {isFormula && canRenderFormulaPreview && rendersOwnContent ? (
                  <PdfFormulaPreview
                    latex={latexSource}
                    color={effectiveColor(box)}
                    compact
                  />
                ) : rendersFormulaFallbackText ? (
                  <span>{formulaFallbackText}</span>
                ) : null}
              </div>
            )}
            {findMarkByBoxId.has(box.id) && !isDeleted ? (
              <div
                data-testid="pdf-textbox-find-match"
                data-box-id={box.id}
                data-active={
                  findMarkByBoxId.get(box.id) === "active" ? "true" : undefined
                }
                aria-hidden
                style={{
                  position: "absolute",
                  ...rotationStyle,
                  left: displayLeft - 2,
                  top: displayTop - 2,
                  width: displayWidth + 4,
                  height: displayHeight + 4,
                  boxSizing: "border-box",
                  borderRadius: 3,
                  border:
                    findMarkByBoxId.get(box.id) === "active"
                      ? "2px solid #d97706"
                      : "1px dashed rgba(217, 119, 6, 0.75)",
                  background:
                    findMarkByBoxId.get(box.id) === "active"
                      ? "rgba(251, 191, 36, 0.28)"
                      : "rgba(251, 191, 36, 0.12)",
                  pointerEvents: "none",
                  zIndex: TEXTBOX_SELECTED_Z_INDEX + 1,
                }}
              />
            ) : null}
            {!disabled && isSelected && !isDeleted ? (
              <div
                data-testid="pdf-textbox-selection-frame"
                data-box-id={box.id}
                aria-hidden
                // The frame the native text editor draws: the shared Office
                // frame in WPS's chrome on the ribbon's accent.
                className={officeDrawingSelectionStyles.frame}
                data-office-drawing-look="wps"
                data-office-drawing-frame="accent"
                style={{
                  position: "absolute",
                  ...rotationStyle,
                  left: displayLeft,
                  top: displayTop,
                  width: displayWidth,
                  height: displayHeight,
                  boxSizing: "border-box",
                  pointerEvents: "none",
                  zIndex: TEXTBOX_SELECTED_Z_INDEX + 1,
                }}
              />
            ) : null}
            {(() => {
              // Reflow prompt: the edit changed this box's text, the box
              // continues into other boxes, and the user has not waved
              // the offer away. Nothing moves until the click — silently
              // rewriting boxes the user did not edit is the red line.
              const edit = editsById[box.id];
              if (!edit || (edit.text ?? "") === (box.text ?? "")) {
                return null;
              }
              if (reflowDismissed.has(box.id)) return null;
              const chain = chainForBox(pageChains, box.id);
              if (!chain) return null;
              const downstream =
                chain.boxIds.length - chain.boxIds.indexOf(box.id) - 1;
              if (downstream <= 0) return null;
              return (
                <div
                  data-testid="pdf-textbox-reflow-prompt"
                  data-box-id={box.id}
                  className="pdf-chrome-float-card"
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: displayLeft,
                    top: displayTop + displayHeight + 6,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    pointerEvents: "auto",
                    zIndex: TEXTBOX_SELECTED_Z_INDEX + 2,
                  }}
                >
                  <span>
                    {t("pdf.textbox.reflowPrompt", { count: downstream })}
                  </span>
                  <button
                    type="button"
                    className="pdf-chrome-float-card__button pdf-chrome-float-card__button--primary"
                    data-testid="pdf-textbox-reflow-apply"
                    onClick={() => applyReflow(box)}
                  >
                    {t("pdf.textbox.reflowApply")}
                  </button>
                  <button
                    type="button"
                    className="pdf-chrome-float-card__button"
                    data-testid="pdf-textbox-reflow-dismiss"
                    onClick={() =>
                      setReflowDismissed((current) =>
                        new Set(current).add(box.id),
                      )
                    }
                  >
                    {t("pdf.textbox.reflowDismiss")}
                  </button>
                </div>
              );
            })()}
            {!disabled && isSelected && !isDeleted ? (
              <>
                {/* The move band: the frame itself, a few pixels either
                    side of it, as the native text frame moves (a ring, so
                    a press on the words still places the caret). Under
                    the grips, which come later. */}
                <div
                  data-testid="pdf-textbox-move"
                  data-box-id={box.id}
                  className="pdf-textbox-move-band"
                  onPointerDown={(event) => beginDrag(box, "move", event)}
                  title={t("pdf.textbox.drag")}
                  style={{
                    position: "absolute",
                    ...rotationStyle,
                    left: displayLeft - TEXTBOX_MOVE_BAND_OUTSIDE_PX,
                    top: displayTop - TEXTBOX_MOVE_BAND_OUTSIDE_PX,
                    width: displayWidth + 2 * TEXTBOX_MOVE_BAND_OUTSIDE_PX,
                    height: displayHeight + 2 * TEXTBOX_MOVE_BAND_OUTSIDE_PX,
                    clipPath: textBoxMoveBandClipPath,
                    cursor: "move",
                    pointerEvents: "auto",
                    touchAction: "none",
                    zIndex: TEXTBOX_SELECTED_Z_INDEX + 1,
                  }}
                />
                {/* WPS-style formatting toolbar, two compact rows: styling
                    toggles + size on top; font family + colours below. */}
                {!onSelectionChange ? (
                  <div
                    data-testid="pdf-textbox-toolbar"
                    className="pdf-chrome-textbox-toolbar"
                    onMouseDown={(event) => {
                    // Keep focus in the box for button-like controls, but let
                    // the select / numeric / color inputs take focus (their own
                    // handlers stopPropagation before this preventDefault).
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: toolbarLeft,
                    top: toolbarTop,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 4,
                    padding: "4px 5px",
                    background: "var(--pdf-chrome-card, #ffffff)",
                    border: "1px solid var(--pdf-chrome-field-border, #d1d5db)",
                    borderRadius: 6,
                    boxShadow:
                      "var(--pdf-chrome-shadow, 0 6px 18px rgba(15,23,42,0.14))",
                    zIndex: TEXTBOX_SELECTED_Z_INDEX + 2,
                    pointerEvents: "auto",
                  }}
                >
                  <div
                    data-testid="pdf-textbox-toolbar-style-row"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {ALIGN_CONTROLS.map(({ value: al, Icon, labelKey }) => {
                      // An imported box still on the author's `/Q` has no
                      // alignment the user picked: claiming "left" is selected
                      // would misreport a centred source object as left-aligned.
                      const selected =
                        edit?.alignFromSource === true
                          ? false
                          : (edit?.align ?? "left") === al;
                      return (
                        <button
                          key={al}
                          type="button"
                          data-testid="pdf-textbox-align"
                          data-align={al}
                          aria-pressed={selected}
                          aria-label={t(labelKey)}
                          onClick={() => emitStyle(box, { align: al })}
                          style={{
                            ...toolbarBtnStyle,
                            background: selected ? "var(--pdf-chrome-pressed, #dbeafe)" : "var(--pdf-chrome-field, #fff)",
                            borderColor: selected ? "var(--pdf-chrome-pressed-border, #93c5fd)" : "var(--pdf-chrome-field-border, #d1d5db)",
                          }}
                          title={t(labelKey)}
                        >
                          <Icon aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                        </button>
                      );
                    })}
                    {/* Bold / Italic / Underline toggles (WPS/Acrobat parity). */}
                    <button
                      type="button"
                      data-testid="pdf-textbox-bold"
                      aria-pressed={effectiveBold(box)}
                      aria-label={t("pdf.textbox.bold")}
                      onClick={() =>
                        emitStyle(box, { bold: toggledCharacterFlag(box, "bold") })
                      }
                        style={{
                          ...toolbarBtnStyle,
                          background: effectiveBold(box) ? "var(--pdf-chrome-pressed, #dbeafe)" : "var(--pdf-chrome-field, #fff)",
                          borderColor: effectiveBold(box) ? "var(--pdf-chrome-pressed-border, #93c5fd)" : "var(--pdf-chrome-field-border, #d1d5db)",
                        }}
                        title={t("pdf.textbox.bold")}
                      >
                      <Bold aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                    </button>
                    <button
                      type="button"
                      data-testid="pdf-textbox-italic"
                      aria-pressed={effectiveItalic(box)}
                      aria-label={t("pdf.textbox.italic")}
                      onClick={() =>
                        emitStyle(box, { italic: toggledCharacterFlag(box, "italic") })
                      }
                      style={{
                        ...toolbarBtnStyle,
                        background: effectiveItalic(box) ? "var(--pdf-chrome-pressed, #dbeafe)" : "var(--pdf-chrome-field, #fff)",
                        borderColor: effectiveItalic(box) ? "var(--pdf-chrome-pressed-border, #93c5fd)" : "var(--pdf-chrome-field-border, #d1d5db)",
                      }}
                      title={t("pdf.textbox.italic")}
                    >
                      <Italic aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                    </button>
                    <button
                      type="button"
                      data-testid="pdf-textbox-underline"
                        aria-pressed={effectiveUnderline(box)}
                        aria-label={t("pdf.textbox.underline")}
                        onClick={() =>
                          emitStyle(box, {
                            underline: !effectiveUnderline(box),
                          })
                        }
                        style={{
                          ...toolbarBtnStyle,
                        background: effectiveUnderline(box) ? "var(--pdf-chrome-pressed, #dbeafe)" : "var(--pdf-chrome-field, #fff)",
                        borderColor: effectiveUnderline(box) ? "var(--pdf-chrome-pressed-border, #93c5fd)" : "var(--pdf-chrome-field-border, #d1d5db)",
                        }}
                        title={t("pdf.textbox.underline")}
                      >
                        <Underline
                          aria-hidden="true"
                          size={TOOLBAR_ICON_SIZE}
                        />
                      </button>
                      <button
                        type="button"
                      data-testid="pdf-textbox-kind-toggle"
                      data-kind-target={isFormula ? "text" : "formula"}
                      aria-pressed={isFormula}
                      aria-label={t(
                        isFormula
                          ? "pdf.textbox.convertToText"
                          : "pdf.textbox.convertToFormula",
                      )}
                      onClick={() =>
                        emitKind(box, isFormula ? "text" : "formula")
                      }
                      style={{
                        ...toolbarBtnStyle,
                        background: isFormula
                          ? "var(--pdf-chrome-accent-pressed, var(--console-border-flat, #ccfbf1))"
                          : "var(--pdf-chrome-field, #fff)",
                        borderColor: isFormula
                          ? "var(--pdf-chrome-accent-pressed-border, var(--console-text-faint, #5eead4))"
                          : "var(--pdf-chrome-field-border, #d1d5db)",
                        color: isFormula ? "var(--pdf-chrome-accent-ink, var(--console-accent-strong, #0f766e))" : "var(--pdf-chrome-ink, #0f172a)",
                      }}
                      title={t(
                        isFormula
                          ? "pdf.textbox.convertToText"
                          : "pdf.textbox.convertToFormula",
                      )}
                    >
                      <Sigma aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                    </button>
                    {/* Shared Docs-style number field in the same stable PDF
                      document unit as the host ribbon. Rendering still scales
                      the stored page fraction by CSS pageHeight. */}
                    <ToolbarFontSizeInput
                      valueDocumentUnit={Math.round(
                        (edit?.fontSize ?? box.fontSize) *
                          fontSizeDocumentHeight,
                      )}
                      ariaLabel={t("pdf.textbox.fontSize")}
                      onCommitDocumentUnit={(value) => {
                        const current = edit?.fontSize ?? box.fontSize;
                        const next = Math.min(
                          0.2,
                          Math.max(
                            0.006,
                            value / (fontSizeDocumentHeight || 1),
                          ),
                        );
                        if (Math.abs(next - current) < 1e-6) return;
                        emitStyle(box, { fontSize: next });
                      }}
                    />
                  </div>
                  <div
                    data-testid="pdf-textbox-toolbar-palette-row"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {/* Font family over the curated stable stacks. Each option
                      also rewrites sourceFontName to a canonical face name so
                      the export-side matcher (which prefers sourceFontName)
                      bakes the face the label promises. */}
                    <select
                      data-testid="pdf-textbox-font-family"
                      aria-label={t("pdf.textbox.fontFamily.label")}
                      title={t("pdf.textbox.fontFamily.label")}
                      value={selectedFontFamilyOptionId(box, edit)}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const option = TEXTBOX_FONT_FAMILY_OPTIONS.find(
                          (candidate) => candidate.id === event.target.value,
                        );
                        if (!option) return;
                        emitStyle(box, {
                          fontFamily: option.stack,
                          sourceFontName: option.sourceFontName,
                        });
                      }}
                      style={{
                        width: FONT_FAMILY_SELECT_WIDTH_PX,
                        height: 28,
                        minHeight: 28,
                        boxSizing: "border-box",
                        border: "1px solid var(--pdf-chrome-field-border, #d1d5db)",
                        borderRadius: 4,
                        background: "var(--pdf-chrome-field, #fff)",
                        color: "var(--pdf-chrome-ink, #0f172a)",
                        fontSize: 12,
                        padding: "0 2px",
                        cursor: "pointer",
                      }}
                    >
                      {selectedFontFamilyOptionId(box, edit) === "" ? (
                        <option value="" disabled>
                          {t("pdf.textbox.fontFamily.original")}
                        </option>
                      ) : null}
                      {TEXTBOX_FONT_FAMILY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                    {(
                      ["#111827", "#dc2626", "#2563eb", "#16a34a"] as const
                    ).map((c) => (
                      <button
                        key={c}
                        type="button"
                        data-testid="pdf-textbox-color"
                        data-color={c}
                        onClick={() => emitStyle(box, { color: c })}
                        aria-label={t("pdf.textbox.color", { color: c })}
                        title={t("pdf.textbox.color", { color: c })}
                        style={{
                          width: 20,
                          height: 20,
                          minHeight: 20,
                          boxSizing: "border-box",
                          borderRadius: 3,
                          background: c,
                          border:
                            effectiveColor(box) === c
                              ? "2px solid var(--pdf-chrome-focus, #2563eb)"
                              : "1px solid var(--pdf-chrome-field-border, #d1d5db)",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      />
                    ))}
                    {/* Free color picker alongside the swatches (same pattern as
                      the ink tool's color input); emits through emitStyle so
                      undo folds continuous scrubbing like swatch clicks. */}
                    <input
                      data-testid="pdf-textbox-color-custom"
                      type="color"
                      value={hexForColorInput(effectiveColor(box))}
                      aria-label={t("pdf.textbox.customColor")}
                      title={t("pdf.textbox.customColor")}
                      onMouseDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!isSafeCssColor(value)) return;
                        emitStyle(box, { color: value });
                      }}
                      style={{
                        width: COLOR_INPUT_WIDTH_PX,
                        height: 20,
                        minHeight: 20,
                        boxSizing: "border-box",
                        border: "1px solid var(--pdf-chrome-field-border, #d1d5db)",
                        borderRadius: 3,
                        background: "var(--pdf-chrome-field, #fff)",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    />
                    {/* Delete the box. Shown for a user-CREATED "Add Text" box,
                      which has no underlying glyphs — blanking its text would
                      otherwise leave an empty floating box with no way to remove
                      it. Deselect first so its frame/toolbar vanish immediately. */}
                    {showDelete ? (
                      <button
                        type="button"
                        data-testid="pdf-textbox-delete"
                        data-box-id={box.id}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          pointerDeletedIdsRef.current.add(boxKey);
                          if (edit?.created) triggerDeleteBox(box.id);
                          else emitDeleteExtractedBox(box);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (pointerDeletedIdsRef.current.delete(boxKey)) {
                            return;
                          }
                          if (edit?.created) triggerDeleteBox(box.id);
                          else emitDeleteExtractedBox(box);
                        }}
                        style={{
                          ...toolbarBtnStyle,
                          color: "var(--pdf-chrome-danger, #b91c1c)",
                          borderColor: "var(--pdf-chrome-danger-border, #fca5a5)",
                        }}
                        title={t("pdf.textbox.delete")}
                        aria-label={t("pdf.textbox.delete")}
                      >
                        <Trash2 aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                      </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {onSelectionChange && showDeleteButton && edit?.created && onDeleteBox ? (
                  // The reader has no ribbon command for its boxes: the
                  // selected box carries its own delete button beside its
                  // top-right corner (left of it at the page's right edge).
                  <button
                    type="button"
                    data-testid="pdf-textbox-delete"
                    data-box-id={box.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      pointerDeletedIdsRef.current.add(boxKey);
                      triggerDeleteBox(box.id);
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (pointerDeletedIdsRef.current.delete(boxKey)) return;
                      triggerDeleteBox(box.id);
                    }}
                    style={{
                      ...toolbarBtnStyle,
                      position: "absolute",
                      left:
                        displayLeft + displayWidth + 10 + TOOLBAR_BUTTON_PX <= pageWidth
                          ? displayLeft + displayWidth + 10
                          : Math.max(0, displayLeft - 10 - TOOLBAR_BUTTON_PX),
                      top: Math.max(0, displayTop - 4),
                      color: "var(--pdf-chrome-danger, #b91c1c)",
                      borderColor: "var(--pdf-chrome-danger-border, #fca5a5)",
                      boxShadow: "var(--pdf-chrome-shadow, 0 6px 18px rgba(15,23,42,0.14))",
                      pointerEvents: "auto",
                      zIndex: TEXTBOX_SELECTED_Z_INDEX + 2,
                    }}
                    title={t("pdf.textbox.delete")}
                    aria-label={t("pdf.textbox.delete")}
                  >
                    <Trash2 aria-hidden="true" size={TOOLBAR_ICON_SIZE} />
                  </button>
                ) : null}
                {isFormula ? (
                  <div
                    data-testid="pdf-formula-editor"
                    data-box-id={box.id}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    style={{
                      position: "absolute",
                      left: formulaPanelLeft,
                      top: formulaPanelTop,
                      width: formulaPanelWidth,
                      height: FORMULA_PANEL_HEIGHT_PX,
                      display: "grid",
                      gridTemplateRows: "minmax(92px, 1fr) minmax(64px, auto)",
                      gap: 8,
                      padding: 8,
                      background: "var(--pdf-chrome-card, #ffffff)",
                      border: "1px solid var(--pdf-chrome-accent-line, var(--console-border-flat, #99f6e4))",
                      borderRadius: 6,
                      boxShadow:
                        "var(--pdf-chrome-shadow, 0 8px 22px rgba(15,23,42,0.16))",
                      color: "var(--pdf-chrome-ink, #0f172a)",
                      boxSizing: "border-box",
                      pointerEvents: "auto",
                      zIndex: TEXTBOX_SELECTED_Z_INDEX + 3,
                    }}
                  >
                    <PdfFormulaSourceEditor
                      latex={committedLatexSource}
                      draftLatex={formulaDraft}
                      shouldCommitOnUnmount={() =>
                        shouldCommitFormulaSourceOnUnmount(box.id)
                      }
                      color={effectiveColor(box)}
                      label={t("pdf.textbox.formulaSource")}
                      applyLabel={t("pdf.textbox.formulaApply")}
                      revertLabel={t("pdf.textbox.formulaRevert")}
                      dirtyLabel={t("pdf.textbox.formulaDirty")}
                      cleanLabel={t("pdf.textbox.formulaClean")}
                      invalidLabel={t("pdf.textbox.formulaInvalid")}
                      errorLabels={{
                        empty: t("pdf.textbox.formulaError.empty"),
                        incomplete: t("pdf.textbox.formulaError.incomplete"),
                        weak: t("pdf.textbox.formulaError.weak"),
                        syntax: t("pdf.textbox.formulaError.syntax"),
                      }}
                      templateLabels={
                        Object.fromEntries(
                          FORMULA_SOURCE_TEMPLATE_TOOLS.map(
                            ({ template, labelKey }) => [template, t(labelKey)],
                          ),
                        ) as Record<PdfFormulaSourceTemplate, string>
                      }
                      visualModeLabel={t("equation.editor.visualMode")}
                      transcriptionHint={
                        awaitingTranscription
                          ? t("pdf.textbox.formulaTranscriptionNeeded")
                          : undefined
                      }
                      transcribeLabels={
                        awaitingTranscription && onTranscribeFormula
                          ? {
                              action: t("pdf.textbox.formulaTranscribeAi"),
                              loading: t(
                                "pdf.textbox.formulaTranscribeAiLoading",
                              ),
                              failed: t(
                                "pdf.textbox.formulaTranscribeAiFailed",
                              ),
                              unreadable: t(
                                "pdf.textbox.formulaTranscribeAiUnreadable",
                              ),
                              unavailable: t(
                                "pdf.formulaTranscribeUnavailable",
                              ),
                            }
                          : undefined
                      }
                      onTranscribe={
                        awaitingTranscription && onTranscribeFormula
                          ? () => onTranscribeFormula(box)
                          : undefined
                      }
                      onCommit={(nextLatex) => emitFormulaLatex(box, nextLatex)}
                      onDraftChange={(nextLatex) =>
                        rememberFormulaDraft(box.id, nextLatex)
                      }
                      onDraftClear={() => clearFormulaDraft(box.id)}
                      onDismiss={() => clearSelection(boxKey)}
                    />
                  </div>
                ) : null}
                {/* The grips wear the native text frame's WPS look. */}
                <div data-office-drawing-look="wps" style={{ display: "contents" }}>
                  {/* Rotation grip, above the box's own top edge: the shared
                      Office round grip, its centre where the rotate gesture
                      expects it (ROTATE_HANDLE_GAP_PX above the box). */}
                  <div
                    className={`${officeDrawingSelectionStyles.rotate} ${pdfSelectionChromeStyles.textBoxRotate}`}
                    data-office-drawing-rotate="true"
                    data-testid="pdf-textbox-rotate"
                    data-box-id={box.id}
                    title={t("pdf.textbox.rotate")}
                    aria-label={t("pdf.textbox.rotate")}
                    onPointerDown={(event) => beginDrag(box, "rotate", event)}
                    style={{
                      position: "absolute",
                      left: displayLeft + displayWidth / 2 - ROTATE_GRIP_HALF_PX,
                      top: displayTop - ROTATE_HANDLE_GAP_PX - ROTATE_GRIP_HALF_PX,
                      zIndex: TEXTBOX_SELECTED_Z_INDEX + 1,
                      // The grip belongs to the box, so it rides the same turn —
                      // about the box's centre, not its own.
                      ...(boxAngle === 0
                        ? {}
                        : {
                            transform: `rotate(${boxAngle}deg)`,
                            transformOrigin: `${ROTATE_GRIP_HALF_PX}px ${
                              ROTATE_HANDLE_GAP_PX +
                              ROTATE_GRIP_HALF_PX +
                              displayHeight / 2
                            }px`,
                          }),
                    }}
                  >
                    <RotateCw size={9} aria-hidden="true" />
                  </div>
                  {/* Eight resize handles. */}
                  {RESIZE_HANDLES.map(({ handle, cx, cy, cursor }) => {
                    const horizontalOffset = cx === 1 ? 0 : -HANDLE_PX / 2;
                    const verticalOffset = -HANDLE_PX / 2;
                    return (
                      <div
                        key={handle}
                        // The shared Office grip in WPS's paint (round corner
                        // dots, edge capsules); the PDF keeps its own 10px
                        // target and placement (east grips stay outside the
                        // glyphs), written inline over the shared placement.
                        className={officeDrawingSelectionStyles.resize}
                        data-office-drawing-handle={handle}
                        data-testid="pdf-textbox-handle"
                        data-handle={handle}
                        data-box-id={box.id}
                        onPointerDown={(event) => beginDrag(box, handle, event)}
                        style={{
                          ...TEXTBOX_GRIP_HIT_STYLE,
                          position: "absolute",
                          left: displayLeft + cx * displayWidth + horizontalOffset,
                          top: displayTop + cy * displayHeight + verticalOffset,
                          ...(boxAngle === 0
                            ? {}
                            : {
                                transform: `rotate(${boxAngle}deg)`,
                                transformOrigin: `${
                                  (0.5 - cx) * displayWidth - horizontalOffset
                                }px ${
                                  (0.5 - cy) * displayHeight - verticalOffset
                                }px`,
                              }),
                          width: HANDLE_PX,
                          height: HANDLE_PX,
                          cursor,
                          pointerEvents: "auto",
                          zIndex: TEXTBOX_SELECTED_Z_INDEX + 1,
                        }}
                      />
                    );
                  })}
                </div>
              </>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
