"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { sayPdfSavedAsTextBox } from "../../../../lib/pdf/saved-as-text-box-notice";
import { OFFICE_FONT_SIZE_PRESETS } from "@mrnote/core/web/components/office-ribbon/officeFontSizeCatalog.ts";
import { holdPdfJsFontFaces } from "@mrnote/core/web/lib/pdf/pdfjs-font-document.ts";
import { readPdfCandidateTextInk, type PdfCandidateTextInk } from "../../../../lib/pdf/native-candidate-text-geometry";
import type { PdfTextLineLayout } from "@mrnote/core/web/lib/pdf/text-line-layout.ts";
import { pdfDraftItalic, pdfDraftSyntheticSlantTransform, slantPdfDraftWords } from "../../../../lib/pdf/draft-italic";
import { carriedTextEdit } from "../../../../lib/pdf/carried-text-edit";
import { pdfTextPointSize, pdfTextPointSizeOver, pdfUniformTextPointSize } from "../../../../lib/pdf/engine/native/text-point-size";
import { pdfNativeLineCentredOnPage, pdfNativeLineOfPageBody, pdfNativeLineRightFlushOnPage, pdfNativeTextBoxHandoffOpening,
  pdfTextSourceBlockCentred } from "../../../../lib/pdf/native-line-centring";
import { pdfNativeFaceNameStyle, pdfNativeFontNameKey, pdfNativeFontNameReadsStyle, pdfNativeTextFontIdentity } from "../../../../lib/pdf/native-font-identity";
import { sampleTextBoxBackgroundColor } from "../../../../lib/pdf/text-box-background";
import { officeFaceName } from "@mrnote/core/web/lib/office-fonts/face-names.ts";
import { pdfReaderRefusalText } from "../../../../lib/pdf/reader-refusal-text";
import {
  pdfNativeDrawnRunIsSlanted,
  pdfNativeSyntheticBoldDrawable,
  pdfNativeTextMatrixIsSlanted,
  PDF_NATIVE_SYNTHETIC_BOLD_STROKE_EM,
  PDF_NATIVE_SYNTHETIC_ITALIC_SKEW,
} from "../../../../lib/pdf/native-synthetic-style";
import { PDF_NATIVE_SCRIPT_SIZE, nativeTextNormalState, nativeTextRiseToggle, nativeTextSizeOfScriptedRun, pdfNativeScriptRiseEm } from "../../../../lib/pdf/native-text-rise";
import {
  isNativeTextDefaultFace,
  NATIVE_TEXT_DEFAULT_POINTS,
  nativeTextClearedDraft,
  nativeTextColorFromHex as colorFromHex,
  nativeTextColorToHex as colorToHex,
  nativeTextDraftKeepsAdvances,
  nativeTextDraftMayWiden,
  nativeTextFontSizeStep,
  nativeTextMatrixScale as nativeTextMatrixScaleOf,
  nativeTextPaintFormatOf,
  nativeTextPaintedDraft,
  nativeTextSameFamily,
  nativeTextServedFaceDrawsAny,
  nativeTextDrawnRunStyle,
  nativeTextDrawnRunsStyle,
  nativeTextFaceStyle,
  nativeTextServedRegularFamily,
  nativeTextStyleOffServedFaceKey,
  nativeTextStyledDraft,
  nativeTextStyledFace,
  nativeTextWithEmbeddedRunFont,
  type NativeTextFace,
  nextNativeIndentStop,
} from "../../../../lib/pdf/native-text-format-draft";
import { pdfInkCoverRectOutsideFrame, pdfTextBoxQuarterTurned, pdfSourceTextBoxLineHeightRatio } from "../../../../lib/pdf/source-text-box";
import {
  fillPdfTextDraft,
  pdfTextDraftAppearance,
  pdfTextDraftHasFallbackGlyphs,
  measureBrowserSpacePx,
  pdfFallbackGlyphAdvancesFor,
  pdfSpaceWordSpacingPx,
} from "../../../../lib/pdf/fallback-glyph-advances";
import { pdfNativeTextPropertyDraftFromState, pdfNativeTextPropertyDraftWithoutMove } from "../../../../lib/pdf/native-author-content";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChangeSet } from "@codemirror/state";
import { diff } from "@codemirror/merge";
import { useLocale, useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { TEXTBOX_FONT_FAMILY_OPTIONS } from "../../../../lib/pdf/text-box-font-options";
import { isPortableNativeTextBoxTypography } from "../../../../lib/pdf/native-text-box-roundtrip";
import { pdfEngineFailureMessageKey } from "../../../../lib/pdf/pdf-native-remote";
import { MRAI_NATIVE_GLYPHS_READ_AS_BLANKS_MESSAGE } from "../../../../lib/pdf/engine/native/vocabulary";
import { pdfTextHasRightToLeftRun } from "../../../../lib/pdf/engine/native/reader-order";
import { pdfNativeSourceLineRoomFactor,
  pdfNativeSourceTextFitsPropertyFrame, pdfNativeSourceTextFitsMeasuredFrame, pdfNativeSourceTextFitUndecided } from "../../../../lib/pdf/native-text-source-fit";
import { classifyFontName, FONT_STACK, needsEastAsianFace, withEastAsianFallback } from "../../../../lib/pdf/font-resolve";
import { repairedPdfJsFaceFamily, withRepairedPdfJsFaces } from "../../../../lib/pdf/pdfjs-face-metrics";
import { ensurePdfEastAsianFace, pdfEastAsianFaceStatus } from "../../../../lib/pdf/east-asian-face";
import {
  applyPdfTextPartFormat,
  pdfTextPartFieldsOver,
  pdfTextPartFormatsAfterEdit,
  pdfTextPartRuleStretches,
  type PdfTextPartFields,
  type PdfTextPartFormats,
} from "../../../../lib/pdf/native-text-part-formats";
import {
  PDF_NATIVE_COVER_RULE_STYLES,
  pdfNativeCoverRulePressed,
  pdfNativeCoverRulesAsk,
  pdfNativeCoverRulesCarry,
  pdfNativeCoverRuleSegments,
  pdfNativeCoverRuleStretches,
  pdfNativeCoverRulesPressed,
  pdfNativeCoverRulesTextFits,
  type PdfNativeCoverRules,
  type PdfNativeCoverRulesCarry,
} from "../../../../lib/pdf/native-cover-rules";
import { setPdfDraftVisibility, watchPdfDraftHighlightTints } from "../../../../lib/pdf/draft-highlight-tint";
import { pinPdfTextDraftLine, fillPdfAnchoredTextDraft, fillPdfAnchoredTextRows, fillPdfTextDraftPreview, fillPdfTextDraftRanges, fillPdfTextDraftRuns, mergePdfTextDraftRanges, planPdfAnchoredTextDraft, planPdfAnchoredTextRows, type PdfTextDraftFormatPreview } from "../../../../lib/pdf/anchored-text-draft";
import { pdfTextBoxVerticalOffset } from "@mrnote/core/web/lib/pdf/text-box-typography.ts";
import { applyPdfTextList, pdfTextListKindOf, type PdfTextListStyle } from "../../../../lib/pdf/text-list";
import {
  normalizePdfTextStyleRuns,
  patchPdfTextStyleRuns,
  patchPdfTextStyleRunsRange,
  reconcilePdfTextStyleRuns,
  type PdfTextStyleRun,
} from "@mrnote/core/web/lib/pdf/text-style-runs.ts";
import {
  applyPdfTextBoxExactAdvanceStyle,
  pdfTextBoxDrawnRunsNeedRunWriter,
  pdfTextBoxDrawnRunsPortable,
  pdfTextBoxOfficeFamily,
  pdfTextBoxRunCssFamily,
  pdfTextBoxRunCssWeight,
  pdfTextBoxRunGlyphSize,
  pdfTextBoxRunRise,
  resolvePdfTextBoxDrawnRuns,
  type PdfTextBoxDrawnRun,
} from "../../../../lib/pdf/text-box-runs";

import { pdfNativeTextInputLayoutJoinedRows,
  editPdfNativeTextInputLayout, pdfNativeTextInputCanonicalOffset,
  pdfNativeTextInputDisplayOffset, readPdfNativeTextInputLayout,
  type PdfNativeTextInputLayout,
} from "../../../../lib/pdf/native-text-input-layout";
import { notePdfNativeTextRowStarts, pdfNativeTextInputRowStarts } from "../../../../lib/pdf/native-text-row-starts";
import { RotateCw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import { ribbonFontFamilyLabel } from "@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx";
import { embeddableFontFamily } from "@mrnote/core/web/lib/office-fonts/embeddable-faces.ts";
import { officeFontFamilies } from "@mrnote/core/web/lib/office-fonts/substitutes.ts";
import { officeDataObtainable } from "@mrnote/core/web/lib/office-data/store.ts";
import { officeFamilyForFace, withOfficeFontSubstitutes } from "@mrnote/core/web/lib/office-fonts/substitutes.ts";
import { pdfNativeDraftLatinFamily, pdfNativeServedSimilarFamily, pdfNativeSimilarFamilies } from "../../../../lib/pdf/native-similar-face";
import { pdfDraftWeightByWidth, pdfFaceNameStyle, pdfJsFaceDrawsText, withoutPdfJsFaces } from "../../../../lib/pdf/pdfjs-face-draws-text";
import type { PdfNativeTextReaderRun } from "@mrnote/core/web/lib/pdf/text-box-rect.ts";
import {
  isPdfNativeEmbeddedFontKey,
  pdfNativeEmbeddedFontDisplayOption,
  pdfNativeEmbeddedFontKey,
  readPdfNativeEmbeddedFontKey,
} from "../../../../lib/pdf/native-embedded-font-key";
import {
  choosePdfPageFont,
  pdfPageFontDisplayFamily,
  pdfPageFontFamilyToken,
  readPdfPageFontFamilyToken,
  type PdfPageFont,
} from "../../../../lib/pdf/page-fonts";
import {
  OfficeFormatPreviewProvider,
  officeFormatPreviewCss,
  type OfficeFormatPreviewAdapter,
  type OfficeFormatPreviewPatch,
} from "@mrnote/core/web/components/office-ribbon/officeFormatPreview.tsx";
import {
  OFFICE_INACTIVE_SELECTION_SELF_PAINTED_ATTRIBUTE,
  officeReturnFocusAfterTextFormat,
} from "@mrnote/core/web/lib/office-inactive-selection.ts";
import {
  PdfTextEditingContextRibbonMemo,
  samePlainValue,
  createPdfTextEditingCapabilities,
  createPdfTextEditingContextRibbonLabels,
  type PdfTextCaseMode,
  type PdfTextEditingContextRibbonAction,
  type PdfTextEditingContextRibbonLabels,
  type PdfTextEditingControl,
} from "./PdfTextEditingContextRibbon";
import { toFullWidth, toHalfWidth, transformCase } from "@mrnote/core/web/lib/presentation-text-case.ts";
import type { PdfRibbonTranslator } from "./pdfRibbonTranslator";
import type {
  PdfNativeTextPropertyDraft,
  PdfNativeTextPropertyProof,
  PdfNativeDeviceColor,
  PdfNativeSourceTextAppearanceRun,
  PdfNativeTextWordsFixedReason,
} from "../../../../lib/pdf/engine/native/list-text-fidelity";
import type { PdfNativeTextMoveProof } from "../../../../lib/pdf/engine/native/text-move";
import type { PdfNativeTextGroupMoveProof } from "../../../../lib/pdf/engine/native/text-group-move";
import type { PdfNativeParagraphFrameRequest, PdfNativeParagraphPropertyChanges } from "../../../../lib/pdf/engine/native/paragraph-properties-transaction";
import { isSpreadsheetImeKeydown as isNativeTextImeKeydown } from "@mrnote/sheets/web/lib/spreadsheet/ime-composition.ts";
import {
  BOX_RECT_EPSILON,
  RESIZE_HANDLES,
  moveBox,
  type BoxRect,
  type ResizeHandle,
  turnedRectBounds,
} from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";
import { resizeTextBoxToFitContent } from "../../../../lib/pdf/text-box-fit-resize";
import { measureWrappedTextHeightPx } from "../../../../lib/pdf/text-box-content-probe";
import { boxQuarterTurn, boxRectFromOwnAxes, boxRectInOwnAxes, normalizeBoxAngle, pageSizeInOwnAxes, resizeBoxFromItsStart, rotatePointAround, turnBackPageTransform, type BoxQuarterTurn } from "@mrnote/core/web/lib/pdf/rotated-box.ts";
import { afterPdfTextInteractionPaint, retirePdfTextEditingChrome, PDF_TEXT_EDIT_PENDING_OUTLINE } from "../../../../lib/pdf/text-edit-interaction";
import { markPdfTextLatency, startPdfTextLatency } from "../../../../lib/pdf/text-edit-latency";
import { insertPdfNativeTextTypeAhead, type PdfNativeTextContinuationCapture } from "../../../../lib/pdf/native-text-continuation";
import { findPdfNativeTextBoxByLineId, PDF_NATIVE_TEXT_LINE_ID_ATTR, pdfNativeTextLineIdOf } from "../../../../lib/pdf/native-text-line-lineage";
import type { PdfTextBoxCommandTargetLike } from "../../../../lib/pdf/text-box-command-target";
import { PDF_TEXTBOX_LINE_HEIGHT_RATIO } from "../../../../lib/pdf/text-run-layout";
import { nativeAlignmentMoveX } from "../../../../lib/pdf/native-indent-chain";
import { PDF_BROWSER_TEXT_WRAP, minimumPdfBrowserTextWidth } from "../../../../lib/pdf/browser-text-layout";
import { pdfFinishGhostDraftShows, pdfFinishGhostRegions, pdfGhostRectInRegions } from "../../../../lib/pdf/finish-ghost-regions";
import { pdfTextCaretOffsetAtPagePoint, type PdfTextCaretPoint } from "../../../../lib/pdf/text-caret";
import { pdfLeadingRowIndent } from "../../../../lib/pdf/leading-row-indent";
import { pdfSourceVerticalCaretOffset, pdfTextWidestUnbreakableExtent, projectPdfTextSourceAppearance, readPdfNativeTextSourceGeometry, samePdfTextSourceAppearance, type PdfTextSourceAppearance } from "../../../../lib/pdf/source-text-appearance";
import PdfSourceTextCaret, { type PdfSourceTextCaretHandle } from "./PdfSourceTextCaret";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";
import {
  armPdfNativeTextFormatPainter,
  disarmPdfNativeTextFormatPainter,
  readPdfNativeTextFormatPainter,
  spendPdfNativeTextFormatPainter,
  usePdfNativeTextFormatPainter,
  type PdfNativeTextFormatPainter,
  type PdfNativeTextPaintFormat,
} from "../../../../lib/pdf/native-text-format-painter";
import {
  applyPdfNativeTextSegmentFormat,
  pdfNativeTextSegmentFieldsAt,
  pdfNativeTextSegmentsAfterEdit,
  type PdfNativeTextSegmentFields,
} from "../../../../lib/pdf/native-text-segments";
import {
  pdfNativeTextRuleRangeCovers,
  pdfNativeTextRuleRangeOf,
  pdfNativeTextRuleRangeOfText,
  type PdfNativeTextRuleDecorations,
  type PdfNativeTextRuleRange,
} from "../../../../lib/pdf/native-text-rule-range";
import { pdfNativeTextLinearTurned } from "../../../../lib/pdf/native-text-turn";
import { officeObjectTextKey } from "@mrnote/core/web/lib/office-object-nudge.ts";
import { pdfTextEdgeKey } from "../../../../lib/pdf/keyboard-nav";
import { savePdfTextKeyboardInput, usePdfTextKeyboardInput } from "../../../../lib/pdf/text-keyboard-input";
import {
  readPdfNativeTextDoublePress,
  subscribePdfNativeTextDoublePress,
  takePdfNativeTextDoublePress,
  type PdfNativeTextPress,
} from "../../../../lib/pdf/native-text-press";
import { PointerContextMenu, type PointerContextMenuEntry } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { officeContextMenuIcon } from "@mrnote/core/web/components/office-ribbon/officeContextMenuIcons.tsx";
import { TextSelect } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { formatOfficeShortcut } from "@mrnote/core/web/lib/office-context-menu.ts";
import { liftNativeTextBlockInk, liftNativeTextBlockLayer, type PdfNativeTextMoveLift } from "../../../../lib/pdf/native-text-move-lift";
import { pdfLoadedTextBlockLayer } from "../../../../lib/pdf/native-text-loaded-surface";
import sourceCaretStyles from "./PdfSourceTextCaret.module.css";
import {
  readOverlayLocalSize,
  resolveOverlayCoordinateSize,
  type OverlayCoordinateSize,
} from "../../../../lib/pdf/overlay-coordinate-space";
import { pageTextWidth } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { OfficeSymbolDialog } from "@mrnote/core/web/components/office-ribbon/OfficeSymbolDialog.tsx";
import { latexFromPdfFormulaText, normalizePdfFormulaLatexSource } from "@mrnote/core/web/lib/pdf/formula-latex.ts";
import { isRenderablePdfFormulaLatex, isTypesettablePdfFormulaLatex } from "@mrnote/core/web/lib/pdf/formula-render.ts";

// A pdf.js face whose own advances differ from the page's widths is set in
// its repaired copy (lib/pdf/pdfjs-face-metrics): the draft stands where the
// page draws, as WPS sets it.
const eastAsianFallback = (family: string | undefined, text: string) =>
  family ? withRepairedPdfJsFaces(withEastAsianFallback(family, text)) : family;
/** A run's loaded face, then the served faces the writer sets what its subset
 * lacks in, then what the family fell back to. */
const withSimilarFaces = (family: string, fontName: string | null | undefined) => {
  // The run's served look-alike, then -- for the words the loaded face cannot
  // show by their characters -- a served Latin face of its build (a condensed
  
  const latin = pdfNativeDraftLatinFamily(fontName);
  const similar = [...new Set([...pdfNativeSimilarFamilies(fontName), ...(latin ? [latin] : [])])];
  if (!similar.length) return family;
  const served = withOfficeFontSubstitutes(similar.map((name) => `"${name}"`).join(", "));
  // A stack that starts with a generic family (pdf.js names a face it could
  // not load "serif" or "sans-serif") takes the served faces before it: after
  // it, the generic always drew, and an exam cover's bold sans line was
  
  if (/^\s*(?:serif|sans-serif|monospace|cursive|fantasy|system-ui)\s*(?:,|$)/iu.test(family)) return `${served}, ${family.trim()}`;
  const comma = family.indexOf(",");
  return comma < 0 ? `${family}, ${served}` : `${family.slice(0, comma)}, ${served}${family.slice(comma)}`;
};

export interface PdfNativeListTextEditDialogLabels {
  readonly title: string;
  readonly description: string;
  readonly field: string;
  readonly geometryNotice: string;
  readonly apply: string;
  readonly applying: string;
  readonly previewing: string;
  readonly cancel: string;
  readonly font: string;
  readonly size: string;
  readonly bold: string;
  readonly italic: string;
  readonly color: string;
  readonly alignment: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly advanced: string;
  readonly characterSpacing: string;
  readonly wordSpacing: string;
  readonly lineSpacing: string;
  readonly leftIndent: string;
  readonly rightIndent: string;
  readonly firstLineIndent: string;
  readonly horizontalScale: string;
}

/** A text line's page and place (percent of the page), for a note or link
 * opened on it from its right-click menu. */
export type PdfReaderLineAnnotationPlace = Readonly<{
  page: number;
  rect: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;

/** What a box's format handed to the window on Leave was asked as
 * (onDetachRowFormat, onDetachParagraphFormat). `retypeOnly`: no format was
 * chosen; the format is only how the words typed are set again. */
export type PdfNativeDetachedFormatAsk = Readonly<{ retypeOnly?: boolean }>;

export interface PdfNativeListTextEditDialogProps {
  readonly open: boolean;
  readonly originalText: string;
  readonly busy: boolean;
  /** Local input is available before preparation; this never grants save authority. */
  readonly preparationPending?: boolean;
  readonly error: string | null;
  






  readonly serverRefusal?: Readonly<{ id: string; message: string }> | null;
  readonly applyDisabledReason?: string | null;
  readonly propertyProof: PdfNativeTextPropertyProof | null;
  /**
   * An item with no property proof that can still move as the page draws it
   * (a run group, a line set glyph by glyph). Only the move handle uses it:
   * the draft it carries holds nothing but the move.
   */
  readonly nativeMoveProof?: PdfNativeTextMoveProof | null;
  /**
   * A box with no property proof that moves and resizes whole as the page
   * draws it (a paragraph of many shows). The move handle and the resize
   * handles use it: the draft holds nothing but the move and the scale.
   */
  readonly nativeGroupMoveProof?: PdfNativeTextGroupMoveProof | null;
  






  


  readonly onApplyRowFormat?: (format: PdfNativeRowFormat, replacementText?: string) => Promise<boolean | null>;
  /** A paragraph open as a block for its formats alone
   * (initialLayout.wordsFixed, "too-large-to-set-again") was pressed for the
   * words of the line under the press (a double click): the window lets the
   * block go and opens that line. */
  readonly onOpenLineOfBlock?: (press: Readonly<{ clientX: number; clientY: number }>) => void;
  /** The line open here is one of a paragraph that was refused whole and
   * opens as a block for its formats alone (the window's offer,
   * lib/pdf/text-edit/block-only-opening): asked from the line's notice, the
   * window lets the line go and opens the paragraph selected whole. Absent
   * for any other line. */
  readonly onSelectWholeParagraph?: () => void;
  /** The same format written by the window after this editor has closed
   * (the reader goes on at once, the box keeps the look it was left with);
   * false when the window does not take it now. */
  readonly onDetachRowFormat?: (format: PdfNativeRowFormat, replacementText: string | undefined,
    ghost: () => (() => void) | null,
    /** `retypeOnly`: the reader chose no format -- `format` is only how the
     * words typed are set again (a line kept centred, or flush right). What
     * is said of that write is said of the words, never of a format. */
    asked?: PdfNativeDetachedFormatAsk) => boolean;
  /** The box's paragraph set again with a format (the same writes), for a
   * box whose run's proof states it too: a centred line typed longer or
   * shorter (centredRetype) is set as a centred paragraph whatever its
   * runs. Its formats pressed still go to its run. */
  readonly onApplyParagraphFormat?: (format: PdfNativeRowFormat, replacementText?: string) => Promise<boolean | null>;
  readonly onDetachParagraphFormat?: (format: PdfNativeRowFormat, replacementText: string | undefined,
    ghost: () => (() => void) | null, asked?: PdfNativeDetachedFormatAsk) => boolean;
  readonly paragraphColors?: readonly PdfNativeDeviceColor[];
  /**
   * Justify this paragraph into the page. Offered only when the host proved a
   * frame to justify to; it writes each line's own word spacing, so it is its
   * own transaction rather than a draft the editor carries.
   */
  readonly onJustifyParagraph?: () => void | Promise<boolean>;
  readonly paragraphJustifyDisabledReason?: string | null;
  readonly sourceAppearance?: readonly PdfNativeSourceTextAppearanceRun[];
  









  readonly boxDrawnStyle?: Readonly<{ bold?: true; italic?: true; boldFaces?: "only" | "beside-strokes"; regularFace?: true }>;
  /** The Type3 glyphs of the box are pictures all (colour emoji), as its
   * proof reads them (`type3Pictures`, the engine's own reading): a weight
   * asked of the box is written on its words. Absent, a line that holds a
   * Type3 glyph takes no weight. */
  readonly type3PicturesOnly?: boolean;
  


  readonly type3TakesWeight?: boolean;
  /** The box holds a show of Type3 letters among words it can set again (its
   * proof's `type3Letters`): its group states no weight, and one is offered
   * only where `type3TakesWeight`. */
  readonly type3LettersHeld?: boolean;
  readonly sourceGeometry?: PdfTextSourceAppearance;
  readonly labels: PdfNativeListTextEditDialogLabels;
  readonly ribbonLabels?: PdfTextEditingContextRibbonLabels;
  /** Supplying these turns on the shared rich font picker for PDF text. */
  readonly fontPickerLabels?: import("@mrnote/core/web/components/office-ribbon/RibbonFontFamilyPicker.tsx").RibbonFontPickerLabels;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly ribbonRootRef?: RefObject<HTMLElement | null>;
  readonly requireRibbonHost?: boolean;
  /** The Text Editing tab is drawn a frame after the box has its focus,
   * not in the box's first commit: its buttons are a third of that commit
   * (Safari: ~50 ms of the switch to a line). The window passes it; a
   * test rendering the dialog alone sees the tab at once. */
  readonly paintRibbonAfterFocus?: boolean;
  readonly initialCaretOffset?: number | null;
  /** The right edge (a share of the page) of the text box the line was
   * typed into (Insert › Text Box, its first words written as page text):
   * the line is that box's text and wraps in it, as a Word or ONLYOFFICE
   * text box wraps its words at its own width. Opened at the width of the
   * words written (one letter), the typing went on one letter a row and
   * was saved so. Null for any other line. */
  readonly wrapFrameRight?: number | null;
  /** An unsaved draft kept from an earlier opening of this same line whose
   * proof never arrived: the input starts with it (dirty, as any typing). */
  readonly initialDraftText?: string | null;
  /** The source proof failed for good (retried and refused or unreachable).
   * The draft stays editable; a second finish (or Escape) closes the editor
   * and hands the draft to `onRetainUnsavedDraft` instead of losing it. */
  readonly preparationFailed?: boolean;
  










  readonly onHeldRibbonActionsLeft?: (actions: readonly QueuedNativeTextRibbonAction[]) => boolean;
  /** The presses an opening this one takes over left held (once, as the
   * editor opens): held here in turn, and answered when its proof is in. */
  readonly takeHeldRibbonActions?: () => readonly QueuedNativeTextRibbonAction[] | null;
  /** Another opening has begun that takes this editor over (it closes in a
   * moment): its held presses are that opening's, and are not answered here
   * meanwhile -- whatever the window has by then cleared of its refusal. */
  readonly heldRibbonActionsTakenOver?: boolean;
  /** The window is still reading the rules standing beside the open run
   * (after its proof, for a run whose rule is read beside it): 下划线 and
   * 删除线 pressed meanwhile are held until they are read, a few seconds at
   * most. Pressed on a button that read unpressed only because it was not
   * read yet, a rule was asked of text the page already rules. */
  readonly standingRulesPending?: boolean;
  readonly onRetainUnsavedDraft?: (text: string) => void;
  







  readonly onDetachFinish?: (text: string, ghost: () => (() => void) | null,
    properties?: PdfNativeTextPropertyDraft | null, acceptedProperties?: PdfNativeTextPropertyDraft | null,
    /** A paragraph's own settings chosen with a format of its run: written
     * by the paragraph rewrite once that format is. */
    paragraphAfter?: PdfNativeRowFormat | null) => boolean;
  /**
   * A box already saved as a text box, opened while the save before it is
   * still running (its preparation waits on that save), left for another
   * line: the window writes these words and this layout after that save,
   * in the background, and this editor closes at once. False: the finish
   * waits as before.
   */
  readonly onDeferLayoutFinish?: (text: string, layout: PdfNativeTextLayoutDraft,
    ghost: () => (() => void) | null) => boolean;
  /** Unused: Escape now finishes the line like any other way of leaving it. */
  readonly onDismiss?: () => void;
  /** Leave Edit Content mode itself (退出编辑 ends the
   * mode). Called after the line's own leave has started, so its write still
   * runs; the host keeps the edit session until that write settles. */
  readonly onExitContentEditMode?: () => void;
  /** 手型 on the ribbon: the line is left as 退出编辑 leaves it, then the
   * reader arms its hand tool. Absent, the button stays grey. */
  readonly onHandTool?: () => void;
  /** 插入文字: the line is left (what was typed is kept) and the reader
   * places a new text box with the next click (WPS 文字编辑 › 插入文字). */
  readonly onInsertText?: () => void;
  /** The text's right-click 添加批注 / 插入链接 (ONLYOFFICE, WPS): the line is
   * left and a note or a link is opened on it, at its page and place (page
   * percent). Absent, the menu goes without them. */
  readonly onAnnotateLine?: (kind: "note" | "link", place: PdfReaderLineAnnotationPlace) => void;
  /** 转换为公式 (Word: select the words, Insert > Equation): the line, as
   * typed, becomes a formula box holding this LaTeX, made from its words.
   * Absent, the command is not offered. */
  readonly onConvertToFormula?: (replacementText: string, latex: string) => Promise<boolean>;
  readonly initialEditingSurface?: HTMLCanvasElement | null;
  readonly initialEditingSurfacePrepared?: boolean;
  





  readonly drawnSourceSha256?: string | null;
  readonly initialLayout?: PdfNativeTextLayoutEvidence | null;
  readonly onControllerChange?: (
    controller: PdfNativeListTextEditorController | null,
  ) => void;
  readonly onDraftStateChange?: (state: PdfNativeListTextDraftState) => void;
  /** Words typed in this line and not written yet, whether or not the line
   * is proved: the window's save status reads them (a line still being
   * proved, or opened while a revision was read in, publishes no draft
   * state, and the page read 「已保存」 over its typing). */
  readonly onUnsavedTypingChange?: (unsaved: boolean) => void;
  /** The words this line reads now, and those it was opened with, while the
   * two differ and are not written (null once they are the page's again):
   * the window keeps them where a reload, a discarded tab or a browser that
   * goes down leaves them (lib/pdf/native-text-typing-drafts). Both as the
   * box reads them, which is how they are put back
   * (lib/pdf/native-text-queued-draft). Closing says nothing here: whether
   * the words were placed or are still owed is the window's to know.
   * The formats pressed in the line and not written go with them. */
  readonly onTypingDraftChange?: (draft: Readonly<{ originalText: string; value: string;
    /** The formats pressed in the line and not written, kept with the words
     * (and on their own where the words are the line's still). */
    formats?: PdfNativeTextFormatDraft }> | null) => void;
  /** Delete the selected run's whole source text object, natively. */
  readonly onDeleteTextObject?: () => void | Promise<unknown>;
  /** The fonts from readers' computers the page keeps (page-fonts.ts):
   * listed with the PDF's own, set like any served family. */
  readonly pageFonts?: readonly PdfPageFont[];
  /** A family found on the reader's computer (Browse) prepared for the
   * page (WPS sets text in any installed font): the name to set it by (a
   * page font's, or the nearest served family when it cannot be embedded,
   * with what to tell the reader), or null when nothing is to change. */
  readonly onPreparePageFont?: (
    family: string,
    style: Readonly<{ bold: boolean; italic: boolean }>,
    text?: string,
  ) => Promise<Readonly<{ family: string; notice?: string }> | null>;
  /**
   * The indent an earlier edit wrote into this run, read back from the page's
   * edit journal (native-indent-chain.ts): a reopened run proves its own
   * origin as indent 0, so without it the ribbon showed 0 after every save.
   */
  readonly retainedLeftIndent?: number;
  /**
   * The alignment the newest saved edit gave this run, and how far its frame
   * has moved right since the first edit (native-indent-chain.ts): a reopened
   * run proves "left" in a frame starting where it now stands.
   */
  readonly retainedAlignment?: "left" | "center" | "right";
  readonly retainedFrameShift?: number;
  /** Which rules this run already carries, so the buttons show their state
   * (a rule under one stretch of the run carries that stretch). */
  readonly nativeTextDecorations?: PdfNativeTextRuleDecorations;
  /** A scanned line's own rules (lib/pdf/native-cover-rules.ts): `pending`
   * while the window reads whether a rule is written beside its invisible
   * words, `proven` with the rules standing there. Absent: its rules are its
   * text box's, as every other character format of such a line is. */
  readonly nativeCoverRules?: PdfNativeCoverRules;
  readonly onApply: (
    replacementText: string,
    properties: PdfNativeTextPropertyDraft | null,
    layout?: PdfNativeTextLayoutDraft | null,
    paragraphChanges?: PdfNativeParagraphPropertyChanges,
    /** The frame the paragraph was resized to, set again in place in it. */
    paragraphFrame?: PdfNativeParagraphFrameRequest,
  ) => boolean | void | Promise<boolean | void>;
  /**
   * Render the exact native PDF candidate for the current draft. The returned
   * full-page canvas is published above the source page bitmap but below the
   * selectable text/annotation layers. `null` means the draft is byte-identical
   * to the authenticated source and the existing page bitmap stays visible.
   */
  readonly onPreparePreview: (
    replacementText: string,
    properties: PdfNativeTextPropertyDraft | null,
    pageHost: HTMLElement,
    signal: AbortSignal,
    paragraphChanges?: PdfNativeParagraphPropertyChanges,
    paragraphFrame?: PdfNativeParagraphFrameRequest,
    /** A box's formats set by row formats: previewed as that write (its
     * canvas marked data-mrai-box-format). */
    boxFormat?: Readonly<{ asked: PdfNativeRowFormat; typedText?: string }>,
    /** A format hovered: drawn as its press would write it, and nothing of the
     * draft's own preview, compile or geometry put aside for it. */
    hover?: Readonly<{ only: true }>,
  ) => Promise<HTMLCanvasElement | null>;
  readonly onCancel: () => void;
  readonly captureNextTextTarget?: PdfNativeTextContinuationCapture;
  /** Undo pressed in the line (Ctrl/Cmd+Z): true when the page takes the
   * press itself -- the line of a new text box still being typed, whose
   * Undo takes the box whole rather than leave the line as it opened, on
   * the box's first letter (lib/pdf/created-text-typing). */
  readonly pageTakesUndo?: () => boolean;
  /** The line pressed next while an earlier editor of this line held it
   * (this editor opened anew on the revision): taken over at mount. */
  readonly inheritNextTextTarget?: () => ((accepted: boolean) => void) | null;
}

/** The width the untouched line takes set as the draft is (its face, size,
 * weight, style and spacing), free of the draft's transforms and of its
 * box: a probe beside it, read by layout width. */
function measureUntouchedLineWidth(draft: HTMLElement, text: string): number {
  if (!text || typeof document === "undefined") return 0;
  const style = window.getComputedStyle(draft);
  const probe = document.createElement("span");
  for (const property of ["fontFamily", "fontSize", "fontStyle", "fontWeight", "fontStretch", "fontKerning",
    "fontFeatureSettings", "fontVariationSettings", "letterSpacing", "wordSpacing", "textRendering"] as const) {
    probe.style[property] = style[property];
  }
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  probe.style.pointerEvents = "none";
  probe.style.left = "0";
  probe.style.top = "0";
  probe.textContent = text;
  (draft.parentElement ?? document.body).appendChild(probe);
  try {
    return probe.offsetWidth;
  } finally {
    probe.remove();
  }
}

export type PdfNativeListTextDraftState = Readonly<{
  replacementText: string;
  properties: PdfNativeTextPropertyDraft | null;
  dirty: boolean;
  composing: boolean;
  canCommit: boolean;
  /** The settled reason a dirty draft cannot be written, once nothing is in
   * flight; null while the compiler has not answered for this draft yet. */
  commitBlockedReason: string | null;
  waitingForExactPreview: boolean;
  layoutFallbackActive: boolean;
  layout: PdfNativeTextLayoutDraft | null;
}>;

export type PdfNativeTextLayoutEvidence = Readonly<{
  singleLineFit?: import("../../../../lib/pdf/engine/native/list-text-fidelity").PdfNativeSingleLineFitHint;
  sourceInputLayout?: PdfNativeTextInputLayout | null;
  sourceInputKey?: string;
  /** The face the page loaded for each font of the box's runs. */
  runFaces?: readonly Readonly<{ sourceFontName: string; displayFontFamily: string }>[];
  /** The box's runs as the page draws them (PDFViewer, at open): each is
   * drafted in its own face before the proof's appearance comes. */
  readerRuns?: readonly import("@mrnote/core/web/lib/pdf/text-box-rect.ts").PdfNativeTextReaderRun[];
  sourceText?: import("../../../../lib/pdf/source-text-box").PdfSourceTextBoxBinding;
  box: PdfTextBoxCommandTargetLike;
  /** Persisted FreeText fill, not a sampled cover for an unproven source. */
  backgroundColor?: string;
  /** The box stands over a run that paints nothing (an OCR layer over a
   * scanned page, user audit PDF 0107): the page's colour around the line,
   * which the frame is painted in so the scanned letters do not show under
   * the draft -- the fill the box is written with. */
  sourceInkCover?: string;
  origin: BoxRect;
  pageWidthPx: number;
  pageHeightPx: number;
  /** Displayed page height at scale 1, in PDF points (never canvas/DPR pixels). */
  pageHeightPoints?: number;
  pdfToCssTransform?: readonly number[];
  caretPoint?: PdfTextCaretPoint;
  /** A single click (WPS): the line opens selected as a block -- its frame,
   * the Text Editing tab, every format on the whole of it -- with no caret.
   * A double click, Enter, F2 or a typed key (键盘输入触发编辑) puts the
   * caret in. */
  selectObject?: boolean;
   
  promoted: boolean;
  /** The width (a fraction of the page) from the box's left edge to the
   * next text the page draws on its row, where there is any. */
  rowRoom?: number;
  

  fallbackText?: boolean;
  /** Drawn in a Type3 face: its format can be set, its words cannot. */
  type3Text?: boolean;
  /** Its words are fixed for another reason (the proof's `wordsFixed`): its
   * font calls glyphs it draws white space, so what the reader read of it is
   * not what the page shows. A colour, a weight, a lean and a rule can be set
   * on the whole of it; nothing may type into it, delete it, move it or make
   * a text box of it. */
  wordsFixed?: PdfNativeTextWordsFixedReason;
}>;

export type PdfNativeTextLayoutDraft = Readonly<{
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  pageWidthPx: number;
  pageHeightPx: number;
  fontSize: number;
  /** A one-line source kept as one line (the view fits it to its width):
   * the flatten export sets it as one row too, compressed to the box, instead
   * of wrapping it at the box's width and shrinking it (user audit PDF 0070). */
  lineLayout?: readonly PdfTextLineLayout[];
  fontFamily?: string;
  sourceFontName?: string;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
   
  underline?: boolean;
  strikethrough?: boolean;
  justify?: boolean;
  


  characterSpacing?: number;
  wordSpacing?: number;
  horizontalScale?: number;
   
  verticalAlign?: "middle" | "bottom";
  





  runs?: readonly PdfTextStyleRun[];
  /** The Office family the whole box is set in (lib/pdf/text-box-runs.ts). */
  officeFamily?: string;
  /** Convert to Equation (Word: select the words, Insert > Equation): the
   * line becomes a formula box holding this LaTeX, made from its words. */
  formulaLatex?: string;
}>;

/** The finish the window asked for words it carried back into the line
 * (controller.finish({ inEditor: true })): the words, and its verdict's slot. */
type PdfNativeTextInEditorFinish = Readonly<{ words: string; settle: (accepted: boolean) => void }>;
/** Whether that finish is the one still asked for `words`: no press of the
 * reader's has taken its slot since, and the draft is those words. */
function pdfNativeTextInEditorFinishPending(own: PdfNativeTextInEditorFinish | null,
  pending: ((accepted: boolean) => void) | null, words: string): boolean {
  return own !== null && pending === own.settle && own.words === words;
}

export type PdfNativeListTextEditorController = Readonly<{
  readDraft: () => PdfNativeListTextDraftState;
  readCaret: () => Readonly<{ start: number; end: number }>;
  commit: () => Promise<boolean>;
  











  finish: (options?: Readonly<{ inEditor?: boolean }>) => Promise<boolean>;
  /** The reader has asked this draft to finish (clicked away) and that
   * intent is still pending -- readable after the input left the DOM. */
  readFinishing?: () => boolean;
  








  stepHistory?: (direction: "undo" | "redo") => boolean;
  /**
   * Put back the formats pressed in this line before its window went (a
   * reload, a browser that went down with the line open), as the window
   * kept them: taken once the line's proof is in, as one step of the line's
   * own history. Resolves false where they are not this line's any more
   * (its run reads otherwise than when they were pressed, its opening was
   * refused) -- nothing of them is set then; null where this editor closed
   * before its proof came (the line opened again on a revision read in
   * under it): they are still the line's, for the editor that opens next.
   * `words`: the line's words as they were kept with the formats (their
   * offsets name letters of those words). Asked of the line once its proof
   * is in, not of the box as it opened: an editor opens at once on the
   * reader's own text of the box -- a paragraph's rows a line break apart
   * -- and reads the line's words when its proof lands.
   */
  restoreFormats?: (formats: PdfNativeTextFormatDraft, words?: string) => Promise<boolean | null>;
  /** How many steps of its own the line has left to take back (what was
   * typed, format presses). */
  historySteps?: () => number;
  /** What the line shows now, copied onto the page (its ghost) until the
   * returned function takes it away: a finish the window writes behind the
   * reader keeps the line's look while the editor closes at once. */
  ghost?: () => (() => void) | null;
  /** Leave the line as Escape in it does (the reader left Edit Content). */
  leave?: () => void;
  /** Where the frame stands now (page fractions, its angle in degrees): where
   * a move left on the line puts it. Null before the frame is placed. */
  readFrame?: () => Readonly<{ x: number; y: number; width: number; height: number; angle: number }> | null;
  /**
   * Close the line with its draft thrown away: nothing is finished, written
   * or kept for the line (Leave finishes a dirty draft, as Escape does). For
   * a caller whose all-or-nothing format could not be completed.
   */
  discard?: () => void;
  /** `mode: "select"`: a single click on the open line (WPS) -- a block
   * selected as an object stays selected; a line with its caret in takes
   * the caret at the point. With neither offset nor point the focus comes
   * back as it was. */
  focus: (caretOffset?: number | null, caretPoint?: PdfTextCaretPoint, mode?: "select") => void;
  /**
   * Run one Text Editing ribbon command on this line, exactly as its ribbon
   * button does (the Insert tab hands a format set on the page's own text to
   * the line opened here). False while the command is unavailable for it.
   */
  applyRibbonAction: (action: PdfTextEditingContextRibbonAction) => boolean;
  /**
   * Move the box as a drag of its frame by this many screen pixels does: a
   * drag the reader made on the box before it could open (its page was
   * being rebuilt after a save) lands once it has. Applied as soon as the
   * box can move (its proof in); the move is a draft, written on finish.
   */
  moveBy?: (dx: number, dy: number) => void;
  /**
   * Take text typed into this line elsewhere (the Insert tab's box of the
   * page's own text) as if typed here: the change from `original` to
   * `text`, where it was made, the caret after it. False while the line
   * takes no typing, or when its text does not read as `original`.
   */
  typeText?: (edit: Readonly<{ original: string; text: string }>) => boolean;
  /**
   * Select the words the last `typeText` put in (`"range"`), or put the
   * caret after them (`"after"`): a format held at the caret where they
   * were typed elsewhere is pressed on them here. False when none.
   */
  selectLastTyped?: (mode: "range" | "after") => boolean;
  









  resizeWidth?: (widthFraction: number) => "resized" | "unchanged" | "refused";
  /**
   * Why this line cannot take a control now (its button's disabled reason),
   * or, with no control, the sentence the dialog shows for its draft (a
   * refused finish, a refused preview, a blocked write); null when none.
   * Read only: what the reader sees, for a caller that must say why.
   */
  readRefusal?: (control?: PdfTextEditingControl) => string | null;
  /** The line's format as its ribbon shows it, and the reader's box size
   * (page-height fraction) its size was read against. */
  readFormat: () => Readonly<{
    bold: boolean; italic: boolean; color: string | null; fontSize: number | null; boxFontSize: number | null;
    pageHeightPoints: number | null;
    


    proven?: boolean;
  }>;
}>;

const NATIVE_TEXT_EDIT_BOX_SELECTOR =
  'span[data-pdf-native-text-edit-box="true"]';
const NATIVE_TEXT_ITEM_INDEX_ATTR = "data-pdf-native-text-item-index";
const NATIVE_TEXT_PARAGRAPH_ID_ATTR = "data-pdf-native-text-paragraph-id";
const NATIVE_TEXT_SELECTED_ATTR = "data-pdf-native-text-edit-selected";
const NATIVE_TEXT_EXACT_PREVIEW_IDLE_MS = 180;





const NATIVE_TEXT_FORMAT_PREVIEW_SETTLE_MS = 300;
const NATIVE_TEXT_CONTEXT_MENU_TEST_ID = "pdf-native-text-context-menu";
const NATIVE_TEXT_SYMBOL_TEST_PREFIX = "pdf-native-text-symbol";
/** How far round the frame the band reaches that moves the box (WPS drags a
 * selected box by its frame). */
const NATIVE_TEXT_MOVE_BAND_PX = 5;
const NATIVE_TEXT_HANDLE_VISIBILITY = "var(--pdf-text-handle-visibility, visible)" as CSSProperties["visibility"];
const NATIVE_TEXT_LAYOUT_TARGET_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function nativeTextFrameVerticalSafetyPixels(
  fontSizePixels: number,
  lineHeightPixels: number,
): number {
  return Math.max(
    6,
    Math.ceil(Math.max(fontSizePixels, lineHeightPixels) * 0.125),
  );
}



type ManagedFormatStep<Override> = Readonly<{
  override: Override;
  runs: Readonly<{ text: string; runs: PdfTextStyleRun[] | null }>;
}>;

/** The margin (em) a frame following its line keeps past the line's
 * measured width, so the writer's own measure of the line still fits. */
const LINE_GROWTH_MARGIN_EM = 0.3;

/** The Text Editing commands a click may press while the line's proof is
 * still on its way (about half a second after the line opens). WPS enables
 * them the moment a line is selected; here they are held and run, in order,
 * as soon as the proof lands, so the click is never lost and the reader sees
 * one result. */
/** A row format's paragraph settings alone (alignment, indents, line
 * spacing): what the paragraph rewrite sets after a format of the run. */
function nativeParagraphSettingsOf(format: PdfNativeRowFormat): PdfNativeRowFormat | null {
  const settings: PdfNativeRowFormat = Object.freeze({
    ...(format.alignment ? { alignment: format.alignment } : {}),
    ...(format.leftIndent ? { leftIndent: format.leftIndent } : {}),
    ...(format.lineStep !== undefined ? { lineStep: format.lineStep } : {}),
    ...(format.firstLineIndent !== undefined ? { firstLineIndent: format.firstLineIndent } : {}),
  });
  return Object.keys(settings).length ? settings : null;
}

/** A press held while the line is proved, or written, and run once it is:
 * every control of the line's own text (the editor's way out and the window's
 * tools run at once). */
const NATIVE_TEXT_UNHELD_CONTROLS: ReadonlySet<PdfTextEditingControl> = new Set<PdfTextEditingControl>([
  "select", "exit", "hand", "insertText", "keyboardInput", "save",
]);
function nativeTextRibbonPressHeld(control: PdfTextEditingControl): boolean {
  return !NATIVE_TEXT_UNHELD_CONTROLS.has(control);
}
/** The line's commands as offered before its proof: each one a press is held
 * for is offered (the press runs when the proof lands, or is refused then
 * with the line's reason); the others stay as the line has them. */
function withHeldCommandsOffered<T extends Readonly<Record<string, Readonly<{ enabled: boolean; reason?: string }>>>>(
  capabilities: T,
): T {
  return Object.freeze(Object.fromEntries(Object.entries(capabilities).map(([control, capability]) => [control,
    capability && !capability.enabled && nativeTextRibbonPressHeld(control as PdfTextEditingControl)
      ? Object.freeze({ enabled: true }) : capability]))) as T;
}
/** A command held while the proof is on its way. A toggle carries the state
 * its button showed after the click: the run's real state is not known yet,
 * so the replay sets that state rather than flipping whatever it finds. */
const NO_PART_FORMATS: PdfTextPartFormats = Object.freeze([]);
const RETYPE_ONLY_ASK: PdfNativeDetachedFormatAsk = Object.freeze({ retypeOnly: true });

/** What a format press changes in the line's editor, before or after it. */
type PartFormatSnapshot = Readonly<{
  parts: PdfTextPartFormats;
  properties: PdfNativeTextPropertyDraft | null;
  rowFormat: PdfNativeRowFormat | null;
  /** How many presses were held for the proof before this one. */
  queued: number;
}>;

/**
 * The formats pressed in an open line and not written yet, as the line's
 * editor holds them -- what a step of its own format history holds (the
 * session's part formats, the run's property draft, the box's row format)
 * and the presses still held for its proof. The window keeps them with the
 * words typed (lib/pdf/native-text-typing-drafts) and hands them back to the
 * line's editor when the page is opened again (`restoreFormats`).
 */
export type PdfNativeTextFormatDraft = Readonly<{
  parts: PdfTextPartFormats;
  properties: PdfNativeTextPropertyDraft | null;
  /** The run as its proof read it when `properties` was drafted: that draft
   * is put back onto a run that still reads so, and onto no other. */
  propertyBaseline: PdfNativeTextPropertyDraft | null;
  rowFormat: PdfNativeRowFormat | null;
  queued: readonly QueuedNativeTextRibbonAction[];
}>;

/** A value read back from where the window kept it, where it is a format
 * draft in shape; null otherwise. */
function readPdfNativeTextFormatDraft(value: unknown): PdfNativeTextFormatDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const plain = (held: unknown) => held === null || (typeof held === "object" && !Array.isArray(held));
  if (!Array.isArray(draft.parts) || !Array.isArray(draft.queued) || !plain(draft.properties) ||
    !plain(draft.propertyBaseline) || !plain(draft.rowFormat) ||
    draft.parts.some((part) => !part || typeof part !== "object") ||
    draft.queued.some((entry) => !entry || typeof entry !== "object" ||
      !(entry as { action?: unknown }).action || typeof (entry as { action?: unknown }).action !== "object")) return null;
  return draft as unknown as PdfNativeTextFormatDraft;
}

/** A box's row format with its parts given as the session's part formats,
 * each in the box's text as it is now (row -1): the parts a press named on
 * the rows' old words, moved with the words typed since. */
export function rowFormatWithParts(format: PdfNativeRowFormat, parts: PdfTextPartFormats): PdfNativeRowFormat {
  const { segments: _rows, ...whole } = format;
  void _rows;
  const segments: PdfNativeRowFormatSegment[] = parts.map((part) => Object.freeze({
    row: -1, start: part.start, end: part.end,
    ...(part.family !== undefined ? { family: part.family } : {}),
    ...(part.bold !== undefined ? { bold: part.bold } : {}),
    ...(part.italic !== undefined ? { italic: part.italic } : {}),
    ...(part.underline !== undefined ? { underline: part.underline } : {}),
    ...(part.strikethrough !== undefined ? { strikethrough: part.strikethrough } : {}),
    ...(part.script !== undefined ? { script: part.script } : {}),
    ...(part.sizePoints !== undefined ? { sizePoints: part.sizePoints } : {}),
    ...(part.color !== undefined ? { color: part.color } : {}),
  }));
  return Object.freeze({ ...whole, ...(segments.length ? { segments: Object.freeze(segments) } : {}) });
}

/** A row format without the rules it asks of parts of the box's text (a
 * scanned line's own rules, lib/pdf/native-cover-rules.ts): what else it
 * asks, the same object when it asks no such rule, null when nothing else. */
function rowFormatWithoutCoverRules(format: PdfNativeRowFormat | null): PdfNativeRowFormat | null {
  if (!format?.segments?.length) return format;
  const { segments, ...rest } = format;
  const kept = segments.filter((segment) => pdfNativeCoverRulesAsk({ segments: [segment] }) === null);
  if (kept.length === segments.length) return format;
  if (kept.length) return Object.freeze({ ...rest, segments: Object.freeze(kept) });
  return Object.keys(rest).length ? Object.freeze(rest) : null;
}

const NO_COVER_RULES_CARRY: PdfNativeCoverRulesCarry = Object.freeze({ whole: Object.freeze({}), parts: Object.freeze([]) });
const NO_COVER_RULE_DRAFT_RANGES: readonly PdfTextDraftFormatPreview[] = Object.freeze([]);

/** The same object while `value` holds the same plain data (samePlainValue):
 * a value built afresh each render, held as one that changes only with its
 * contents. */
/** A line's words read as LaTeX, and whether KaTeX sets them: asked on
 * every render of the line's editor (the ribbon's 转换为公式), several a
 * key, each a KaTeX typesetting of the whole line. Held per text. */
/** A look's baseline below the line box's top, as a probe set in it
 * measured: per look, first character, size and font loading state. */
const measuredBaselineOffsets = new Map<string, number>();
const lineFormulaReadings = new Map<string, Readonly<{ latex: string; renderable: boolean; typesettable: boolean }>>();
function readLineAsFormula(text: string): Readonly<{ latex: string; renderable: boolean; typesettable: boolean }> {
  const held = lineFormulaReadings.get(text);
  if (held) return held;
  const latex = normalizePdfFormulaLatexSource(latexFromPdfFormulaText(text));
  const renderable = isRenderablePdfFormulaLatex(latex);
  const reading = Object.freeze({ latex, renderable, typesettable: renderable || isTypesettablePdfFormulaLatex(latex) });
  if (lineFormulaReadings.size >= 64) lineFormulaReadings.delete(lineFormulaReadings.keys().next().value!);
  lineFormulaReadings.set(text, reading);
  return reading;
}

function useValueStable<T>(value: T): T {
  const held = useRef(value);
  // eslint-disable-next-line react-hooks/refs -- a value cache read and written in render, never shown
  if (!samePlainValue(held.current, value)) held.current = value;
  // eslint-disable-next-line react-hooks/refs -- as above
  return held.current;
}

export type QueuedNativeTextRibbonAction = Readonly<{
  action: PdfTextEditingContextRibbonAction;
  pressed?: boolean;
  



  range?: Readonly<{ start: number; end: number; value: string }>;
  /** The part formats before the press (what a refusal of it goes back to). */
  partsBefore?: PdfTextPartFormats;
  /** Pressed on a box that was refused, and handed on to this one
   * (nativeTextHeldPressesCarriedOver): nothing of it is recorded on this
   * box yet, and it flips the state this box turns out to have. */
  carried?: true;
}>;

type NativeTextToggleControl =
  | "bold" | "italic" | "underline" | "strikethrough" | "subscript" | "superscript";

/** How long the presses held for an opening that was refused wait for the
 * opening that takes it over (see `onHeldRibbonActionsLeft`) before they are
 * answered by the refused one. The window opens the run under the press a
 * moment after the refusal (the viewer looks for it for a second). */
export const NATIVE_TEXT_REFUSED_OPENING_TAKEOVER_MS = 2_000;

/**
 * The presses held for an opening that the opening taking it over answers:
 * the character formats pressed on the whole of the box (no part of its text
 * selected -- a part's offsets name letters of the box that was refused), as
 * presses on the whole of the box that opens. Nothing that would write more
 * than a format of that box's own text is carried (a delete, a change of
 * case, a list, a turn, a paragraph setting of the box refused).
 */
export function nativeTextHeldPressesCarriedOver(
  held: readonly QueuedNativeTextRibbonAction[],
): Readonly<{ carried: readonly QueuedNativeTextRibbonAction[]; left: readonly QueuedNativeTextRibbonAction[] }> {
  const carried: QueuedNativeTextRibbonAction[] = [], left: QueuedNativeTextRibbonAction[] = [];
  for (const entry of held) {
    const { action, range } = entry;
    const format = (action.type === "toggle" && NATIVE_TEXT_TOGGLE_CONTROLS.has(action.control)) ||
      action.type === "fontColor" || action.type === "fontSize" || action.type === "fontSizeStep" || action.type === "fontFamily";
    const whole = !range || range.start === range.end || (range.start === 0 && range.end === range.value.length);
    // (Carried without the state its button showed: that was the refused
    // box's. The box that opens flips the state it turns out to have, as the
    // same press does once it has opened.)
    if (format && whole) carried.push(Object.freeze({ action, carried: true as const }));
    else left.push(entry);
  }
  return Object.freeze({ carried: Object.freeze(carried), left: Object.freeze(left) });
}

const NATIVE_TEXT_TOGGLE_CONTROLS: ReadonlySet<string> = new Set<NativeTextToggleControl>([
  "bold", "italic", "underline", "strikethrough", "subscript", "superscript",
]);

export { isNativeTextDefaultFace, nextNativeIndentStop };

/** How long a block selected as an object stays still before a change made
 * to it is written (a run of presses or a drag in steps is one write). */
const SELECTED_BLOCK_COMMIT_DELAY_MS = 700;
/** A finish ghost's line (its id) and its words, as makeFinishGhost puts them up. */
const FINISH_GHOST_LINE_ATTR = "data-pdf-native-text-ghost-line";
const FINISH_GHOST_DRAFT_ATTR = "data-pdf-native-text-ghost-draft";
/** How long typing pauses, the caret still in the text, before what was
 * typed is written and the line opens again with the caret where it was. */
const TYPING_DRAFT_COMMIT_DELAY_MS = 5_000;

/** The ribbon control a command belongs to, for its enabled state. */
export function nativeTextRibbonActionControl(
  action: PdfTextEditingContextRibbonAction,
): PdfTextEditingControl | null {
  switch (action.type) {
    case "toggle":
      return action.control;
    case "fontColor":
    case "fontSize":
    case "fontFamily":
      return action.type;
    case "fontSizeStep":
      return action.delta > 0 ? "fontSizeIncrease" : "fontSizeDecrease";
    case "alignment":
      return action.value === "left" ? "alignLeft"
        : action.value === "center" ? "alignCenter"
        : action.value === "right" ? "alignRight"
        : action.value === "justify" ? "alignJustify" : "alignDistributed";
    case "indent":
      return action.direction === "increase" ? "indentIncrease" : "indentDecrease";
    case "number":
      return action.control;
    case "rotate":
      return action.direction === "left" ? "rotateLeft" : "rotateRight";
    case "delete":
      return "delete";
    case "changeCase":
      return "changeCase";
    case "list":
      return action.style?.kind === "number" ? "numbering" : "bullets";
    case "verticalAlign":
      return "verticalAlign";
    default:
      return null;
  }
}

/** A whole box's format set row by row in the page's own text
 * (onApplyRowFormat): a family by name, a colour `#rrggbb`, a slant. */
/** A character format for one part of one row of a box of several rows
 * (offsets in the row's own text). */
export type PdfNativeRowFormatFields = Readonly<{
  family?: string; color?: string; italic?: boolean; bold?: boolean; sizePoints?: number;
  script?: "superscript" | "subscript" | "none";
  /** A rule under (across) the characters, written beside each row's run
   * in the same write as the row's other formats. */
  underline?: boolean; strikethrough?: boolean;
  /** Character spacing as a share of the size (WPS 字符间距 on the box). */
  characterSpacingEm?: number;
}>;
export type PdfNativeRowFormatSegment = PdfNativeRowFormatFields & Readonly<{ row: number; start: number; end: number }>;
/** The format a box of several rows (each one run) takes in the page's own
 * text, row by row (applyNativeRowFormat): the whole box's, and parts of
 * single rows. */
export type PdfNativeRowFormat = PdfNativeRowFormatFields & Readonly<{ segments?: readonly PdfNativeRowFormatSegment[];
  /** The paragraph set again in this alignment (a centred line typed
   * longer or shorter keeps its middle). */
  alignment?: "left" | "center" | "right" | "justify" | "distribute";
  /** Its lines set at this baseline step, in points (行距). */
  lineStep?: number;
  /** Its first line's left edge from the others', in points; negative hangs
   * it (首行缩进 / 悬挂缩进). */
  firstLineIndent?: number;
  /** Its left edge moved right by this many points, every line of it, its
   * right edge where it was (Increase / Decrease Indent: Word moves the
   * paragraph to the next default tab stop, never left of where it began). */
  leftIndent?: number }>;

/** One more command for the queue: a later choice of the same absolute
 * value (a size, a colour, an alignment, a toggle's state) replaces the
 * earlier one, so typing "14" into the size box holds one size, not two. */
export function queueNativeTextRibbonAction(
  queue: readonly QueuedNativeTextRibbonAction[],
  next: QueuedNativeTextRibbonAction,
): readonly QueuedNativeTextRibbonAction[] {
  const sameSlot = (entry: QueuedNativeTextRibbonAction) => {
    const a = entry.action, b = next.action;
    if (a.type !== b.type) return false;
    // Pressed on another part: its own command.
    if ((entry.range?.start ?? -1) !== (next.range?.start ?? -1) ||
      (entry.range?.end ?? -1) !== (next.range?.end ?? -1)) return false;
    if (a.type === "toggle" && b.type === "toggle") {
      return a.control === b.control && entry.pressed !== undefined && next.pressed !== undefined;
    }
    return a.type === "fontSize" || a.type === "fontColor" || a.type === "alignment";
  };
  return [...queue.filter((entry) => !sameSlot(entry)), next];
}

/** A character format a text box carries for its whole text or a part of it
 * (a face, a size the box's writer takes, a colour, a weight, a slant, a
 * rule, a script): what a scanned line takes as the box written over it.
 * Not Clear Formatting (nothing of such a line is formatted yet), a size
 * still being typed, or a paragraph's settings. */
export function pdfTextBoxCharacterFormatPress(action: PdfTextEditingContextRibbonAction, maxPoints: number): boolean {
  switch (action.type) {
    case "fontFamily":
    case "fontSizeStep":
      return true;
    case "fontSize":
      return !action.draft && Number.isFinite(action.value) && action.value >= 1 && action.value <= maxPoints;
    case "fontColor":
      return /^#[0-9a-f]{6}$/i.test(action.value);
    case "toggle":
      return action.control === "bold" || action.control === "italic" || action.control === "underline" ||
        action.control === "strikethrough" || action.control === "superscript" || action.control === "subscript";
    default:
      return false;
  }
}

/** Measure local layout, not the old frame or rotated viewport. Restore before paint. */
export function measurePdfNativeTextDraftHeight(
  draft: HTMLElement,
): number | null {
  const previousHeight = draft.style.height;
  const previousMinHeight = draft.style.minHeight;
  try {
    draft.style.height = "0px";
    draft.style.minHeight = "0px";
    const height = draft.scrollHeight;
    return Number.isFinite(height) && height > 0 ? height : null;
  } finally {
    draft.style.height = previousHeight;
    draft.style.minHeight = previousMinHeight;
  }
}

















export function pdfNativeTextDraftLineExceedsFrame(draft: HTMLElement, turn: BoxQuarterTurn = 0): boolean {
  const along = (rect: Readonly<{ width: number; height: number }>) => turn % 180 ? rect.height : rect.width;
  const frameRect = draft.getBoundingClientRect();
  const frame = { width: along(frameRect) };
  if (!(frame.width > 0) || !(draft.offsetWidth > 0)) return false;
  const range = draft.ownerDocument.createRange();
  if (typeof range.getBoundingClientRect !== "function") return false;
  const walker = draft.ownerDocument.createTreeWalker(draft, NodeFilter.SHOW_TEXT);
  let first: Text | null = null;
  let last: Text | null = null;
  let lastEnd = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    first ??= text;
    const end = text.data.replace(/[\s​]+$/u, "").length;
    if (end > 0) {
      last = text;
      lastEnd = end;
    }
  }
  if (!first || !last) return false;
  const previousWhiteSpace = draft.style.whiteSpace;
  try {
    draft.style.whiteSpace = "pre";
    range.setStart(first, 0);
    range.setEnd(last, lastEnd);
    const width = along(range.getBoundingClientRect());
    const unit = frame.width / draft.offsetWidth / 64;
    return Number.isFinite(width) && width > frame.width - unit;
  } finally {
    draft.style.whiteSpace = previousWhiteSpace;
  }
}

function sameBoxRect(a: BoxRect, b: BoxRect): boolean {
  return (["x", "y", "width", "height"] as const).every(
    (key) => Math.abs(a[key] - b[key]) <= BOX_RECT_EPSILON,
  );
}

function isSingleLineDeletion(original: string, next: string): boolean {
  if (next.length >= original.length || /[\r\n]/.test(original)) return false;
  let offset = 0;
  for (const character of original) {
    if (next.startsWith(character, offset)) offset += character.length;
  }
  return offset === next.length;
}












function pdfNativeLineStyleRuns(
  text: string,
  appearance: readonly PdfNativeSourceTextAppearanceRun[] | undefined,
  pointHeight: number,
  pageFonts: readonly PdfPageFont[] = [],
): PdfTextStyleRun[] | null {
  const ink = (appearance ?? []).filter((run) => run.text.trim());
  if (!ink.length || ink.length > 256 || !(pointHeight > 0)) return null;
  const starts: number[] = [];
  let cursor = 0;
  for (const run of ink) {
    let first = -1;
    for (const character of run.text.replace(/\s+/gu, "")) {
      while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1;
      if (!text.startsWith(character, cursor)) return null;
      if (first < 0) first = cursor;
      cursor += character.length;
    }
    starts.push(first);
  }
  if (text.slice(cursor).trim()) return null;
  const runs: PdfTextStyleRun[] = [];
  ink.forEach((run, index) => {
    const piece = text.slice(index === 0 ? 0 : starts[index], starts[index + 1] ?? text.length);
    const face = run.programFace;
    // A face the page keeps from a reader's computer is that page font.
    const pageFont = face ? choosePdfPageFont(pageFonts, face.family, { bold: face.weight >= 600, italic: face.italic }) : null;
    const office = pageFont ? pdfPageFontFamilyToken(pageFont.font) : officeFamilyForFace(face?.family, face?.weight);
    const points = pdfTextPointSize(run.fontSize, run.textMatrix, run.graphicsMatrix);
    const paint = run.displayColor ?? run.color;
    const style: PdfTextStyleRun = {
      text: piece,
      bold: face ? face.weight >= 600 : run.font.bold,
      italic: Boolean(face?.italic) || run.font.italic,
      ...(points > 0 ? { fontSize: points / pointHeight } : {}),
      ...(paint ? { color: colorToHex(paint).toLowerCase() } : {}),
      ...(office
        ? {
            fontFamily: pdfTextBoxRunCssFamily({ font: classifyFontName(office), officeFamily: office }),
            sourceFontName: office,
            officeFamily: office,
          }
        : {}),
    };
    const last = runs.at(-1);
    const { text: _lastText, ...lastStyle } = last ?? { text: "" };
    const { text: _ownText, ...ownStyle } = style;
    void _lastText; void _ownText;
    if (last && JSON.stringify(lastStyle) === JSON.stringify(ownStyle)) last.text += piece;
    else runs.push(style);
  });
  return runs;
}


type InlineEditorMetrics = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  fontWeight: string;
  fontStretch: CSSProperties["fontStretch"];
  fontKerning: CSSProperties["fontKerning"];
  fontFeatureSettings: CSSProperties["fontFeatureSettings"];
  fontVariationSettings: CSSProperties["fontVariationSettings"];
  fontVariantLigatures: CSSProperties["fontVariantLigatures"];
  fontVariantCaps: CSSProperties["fontVariantCaps"];
  fontVariantEastAsian: CSSProperties["fontVariantEastAsian"];
  fontVariantNumeric: CSSProperties["fontVariantNumeric"];
  fontVariantPosition: CSSProperties["fontVariantPosition"];
  fontSynthesis: CSSProperties["fontSynthesis"];
  fontOpticalSizing: CSSProperties["fontOpticalSizing"];
  letterSpacing: string;
  wordSpacing: string;
  lineHeight: string;
  textAlign: CSSProperties["textAlign"];
  direction: CSSProperties["direction"];
  unicodeBidi: CSSProperties["unicodeBidi"];
  textRendering: CSSProperties["textRendering"];
  transform: string;
  transformOrigin: string;
}>;

type NativeTextEditingSurfaceStatus = "pending" | "ready" | "unavailable";

type NativeTextLayoutDrag = Readonly<{
  mode: "rotate" | "move" | ResizeHandle;
  pointerId: number;
  startX: number;
  startY: number;
  startRect: BoxRect;
  startAngle: number;
  centreClientX: number;
  centreClientY: number;
  renderedPageSize: OverlayCoordinateSize;
  /** A turn written into the run's own text matrix: the draft and the
   * matrix the drag started from. */
  nativeTurn?: Readonly<{
    draft: PdfNativeTextPropertyDraft;
    linear: readonly [number, number, number, number];
  }>;
  /** A turn of a paragraph its group proof covers: the draft and frame the
   * drag started from (the map turns the box about that frame's centre). */
  groupTurn?: Readonly<{ draft: PdfNativeTextPropertyDraft; rect: BoxRect }>;
}>;

// The saved record replays the draft through the shared state mapping, so the
// dialog must seed from that same mapping. A second hand-written copy silently
// drops whichever property the mapping gained last (textRise did, and the
// history seed then refused every commit that never touched it).
function draftFromPropertyProof(
  proof: PdfNativeTextPropertyProof,
): PdfNativeTextPropertyDraft {
  return { ...pdfNativeTextPropertyDraftFromState(proof.original) };
}

function readInlineEditorMetrics(target: HTMLElement): InlineEditorMetrics {
  const rect = target.getBoundingClientRect();
  const computed = window.getComputedStyle(target);
  const webkitTextFillColor = computed
    .getPropertyValue("-webkit-text-fill-color")
    .trim();
  const computedFontSize = Number.parseFloat(computed.fontSize);
  const fallbackFontSize = Math.max(
    12,
    Math.min(48, Math.max(rect.height, 18) * 0.72),
  );
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    // pdf.js spans are transparent hit regions, not source paint authority.
    // Proven/stored color is applied below; an unproved local draft still
    // needs visible ink instead of inheriting the hit layer's transparency.
    color: target.closest("[data-pdf-text-layer]")
      ? "var(--console-text-primary, #0f2747)"
      : webkitTextFillColor && webkitTextFillColor !== "currentcolor"
        ? webkitTextFillColor
        : computed.color || "#0f2747",
    fontFamily: computed.fontFamily || "Arial, sans-serif",
    fontSize:
      Number.isFinite(computedFontSize) && computedFontSize > 1
        ? computed.fontSize
        : `${fallbackFontSize}px`,
    fontStyle: computed.fontStyle || "normal",
    fontWeight: computed.fontWeight || "400",
    fontStretch: (computed.fontStretch ||
      "normal") as CSSProperties["fontStretch"],
    fontKerning: (computed.fontKerning ||
      "auto") as CSSProperties["fontKerning"],
    fontFeatureSettings: computed.fontFeatureSettings || "normal",
    fontVariationSettings: computed.fontVariationSettings || "normal",
    fontVariantLigatures: (computed.fontVariantLigatures ||
      "normal") as CSSProperties["fontVariantLigatures"],
    fontVariantCaps: (computed.fontVariantCaps ||
      "normal") as CSSProperties["fontVariantCaps"],
    fontVariantEastAsian: (computed.fontVariantEastAsian ||
      "normal") as CSSProperties["fontVariantEastAsian"],
    fontVariantNumeric: (computed.fontVariantNumeric ||
      "normal") as CSSProperties["fontVariantNumeric"],
    fontVariantPosition: (computed.fontVariantPosition ||
      "normal") as CSSProperties["fontVariantPosition"],
    fontSynthesis: (computed.fontSynthesis ||
      "auto") as CSSProperties["fontSynthesis"],
    fontOpticalSizing: (computed.fontOpticalSizing ||
      "auto") as CSSProperties["fontOpticalSizing"],
    letterSpacing: computed.letterSpacing || "normal",
    wordSpacing: computed.wordSpacing || "0px",
    lineHeight: computed.lineHeight || "normal",
    textAlign:
      computed.textAlign === "center" || computed.textAlign === "right"
        ? computed.textAlign
        : "left",
    direction: (computed.direction || "ltr") as CSSProperties["direction"],
    unicodeBidi: (computed.unicodeBidi ||
      "normal") as CSSProperties["unicodeBidi"],
    textRendering: (computed.textRendering ||
      "auto") as CSSProperties["textRendering"],
    transform:
      computed.transform === "none"
        ? target.style.transform
        : computed.transform,
    transformOrigin: computed.transformOrigin || target.style.transformOrigin,
  };
}

function canOwnInlineEditor(target: HTMLElement | null,
  /** The box's size is not read: a box the reader pressed has one. Reading
   * it right after a commit's writes lays the page out (~45 ms in Safari). */
  options?: Readonly<{ trustSize?: boolean }>): target is HTMLElement {
  if (!target?.matches(NATIVE_TEXT_EDIT_BOX_SELECTOR) || !target.isConnected) {
    return false;
  }
  const pageHost = target.closest<HTMLElement>(
    ".pdf-viewer__page[data-page-number]",
  );
  const textLayer = target.closest<HTMLElement>("[data-pdf-text-layer]");
  if (options?.trustSize) return Boolean(pageHost && textLayer?.contains(target));
  const rect = target.getBoundingClientRect();
  return Boolean(
    pageHost &&
    textLayer?.contains(target) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    rect.width > 0 &&
    rect.height > 0,
  );
}

export function createPdfNativeTextBlankingDraft(originalText: string): string {
  const glyphCount = Array.from(originalText).length;
  return " ".repeat(Math.max(1, glyphCount));
}

function styleNativeTextPageCanvas(
  canvas: HTMLCanvasElement,
  marker: "candidate" | "editing-surface",
): void {
  canvas.setAttribute(
    marker === "candidate"
      ? "data-pdf-native-text-candidate-preview"
      : "data-pdf-native-text-editing-surface",
    "true",
  );
  canvas.setAttribute(
    "data-testid",
    marker === "candidate"
      ? "pdf-native-text-candidate-preview"
      : "pdf-native-text-editing-surface",
  );
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    display: "block",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    userSelect: "none",
  });
}

/** The native writer's property refusals, said in the reader's language. */
export function nativeTextPropertyErrorMessage(
  message: string,
  translate: PdfRibbonTranslator,
): string {
  if (/^Native text property values are invalid or unavailable\.?$/.test(message)) {
    return translate("pdf.nativeTextEdit.propertyValuesInvalid");
  }
  if (/^Native text properties would overflow the proven run frame\.?$/.test(message)) {
    return translate("pdf.nativeTextEdit.propertiesOverflowFrame");
  }
  
  if (/^The turned text would stand outside the form object it is drawn in/.test(message)) {
    return translate("pdf.nativeTextEdit.turnLeavesForm");
  }
  return message;
}

/** The planner's refusals of a format of part of the run (matched by text:
 * the engine stays out of the browser bundle). */
const PART_FORMAT_DRAWING_REFUSAL = /Part formats need a run drawn glyph by glyph/;
// The paragraph rewrite's answer to a resized frame its lines already break
// in (paragraph-rewrite.ts, MRAI_NATIVE_PARAGRAPH_FRAME_UNCHANGED_MESSAGE).
const PARAGRAPH_FRAME_UNCHANGED_REFUSAL = /The resized frame leaves the paragraph's lines as they are/;

const BREAKS_AROUND_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
let textUnitMeasureContext: CanvasRenderingContext2D | null | undefined;
/** The browser's width of the widest unit of `text` a rewrap cannot break
 * (a word between spaces; a CJK character alone) in a CSS `font`; 0 where
 * text cannot be measured. */
function widestBrowserTextUnit(text: string, font: string): number {
  if (typeof document === "undefined") return 0;
  if (textUnitMeasureContext === undefined) {
    try {
      textUnitMeasureContext = document.createElement("canvas").getContext("2d");
    } catch {
      textUnitMeasureContext = null;
    }
  }
  const context = textUnitMeasureContext;
  // A context that measures nothing (a test canvas) holds no minimum.
  if (!context || typeof context.measureText !== "function") return 0;
  context.font = font;
  let widest = 0;
  for (const word of text.split(/\s+/u)) {
    let run = "";
    const measure = (unit: string) => {
      const width = unit ? Number(pageTextWidth("pdf", unit, font) ?? context.measureText(unit)?.width) : 0;
      if (Number.isFinite(width)) widest = Math.max(widest, width);
    };
    for (const character of word) {
      if (BREAKS_AROUND_CHARACTER.test(character)) {
        measure(run);
        run = "";
        measure(character);
      } else {
        run += character;
      }
    }
    measure(run);
  }
  return widest;
}
const PART_FORMAT_GLYPH_REFUSAL = /Part formats cannot split one glyph/;

/** The engine host's refusal sentence (pdf-native-remote.ts), which crosses
 * the preparation worker as text only: its reason, or null. */
const ENGINE_REFUSAL_TEXT = /^The PDF editor refused this edit \(([^)]*)\)\. Nothing was changed\.$/;
function engineRefusalReason(reason: unknown): string | null {
  const message = reason instanceof Error
    ? reason.message
    : reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string"
      ? (reason as { message: string }).message
      : "";
  return ENGINE_REFUSAL_TEXT.exec(message)?.[1] ?? null;
}

function nativeTextPreviewErrorMessage(
  reason: unknown,
  translate: PdfRibbonTranslator,
): string {
  const fallback = "The native PDF draft cannot be previewed safely.";
  const message = reason instanceof Error ? reason.message : fallback;
  const property = nativeTextPropertyErrorMessage(message, translate);
  if (property !== message) return property;
  // The engine host refused the call itself (a request over its budget, an
  // input it will not take): said in the reader's language, not its own.
  if (engineRefusalReason(message)) return translate("engineHost.refused");
  // The engine could not answer (busy, offline, timed out): the reader's
  // language, not the transport's sentence (walk c-s4-small, "The PDF
  // editor is busy...").
  const engineKey = pdfEngineFailureMessageKey(message);
  if (engineKey) return translate(engineKey);
  // Text whose font names glyphs it draws as spaces (alone, or as a cause in
  
  if (message.includes(MRAI_NATIVE_GLYPHS_READ_AS_BLANKS_MESSAGE)) return translate("pdf.nativeTextEdit.glyphsReadAsBlanks");
  // The planner's summary of a selection no route can write (walk u-s6: a
  // colour on the 装配理论 paragraph showed its English causes).
  if (message.startsWith("Selected text does not resolve to one native operator")) {
    return translate("pdf.nativeTextEdit.selectionNotRewritable");
  }
  // A format of part of the run the planner cannot split it for
  // (list-text-fidelity.ts, MRAI_NATIVE_PART_FORMAT_*).
  if (PART_FORMAT_DRAWING_REFUSAL.test(message)) return translate("pdf.nativeTextEdit.partialFormatDrawing");
  if (PART_FORMAT_GLYPH_REFUSAL.test(message)) return translate("pdf.nativeTextEdit.partialFormatGlyph");
  if (
    !/(?:no unambiguous font glyph|font (?:lacks|cannot verify|does not support).*(?:glyph|character)|cannot encode.*character|character map)/i.test(
      message,
    )
  ) {
    return message;
  }
  return translate("pdf.nativeTextEdit.fontCannotVerify");
}







function isNativeWriterRefusal(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const error = reason as { name?: unknown; code?: unknown; message?: unknown };
  
  // drawn from the reader's text and would lose them too.
  if (typeof error.message === "string" && error.message.includes(MRAI_NATIVE_GLYPHS_READ_AS_BLANKS_MESSAGE)) return false;
  // A face missing a character or a style for this run (the window's
  
  if (error.name === "PdfNativeEmbeddedFontTakeover") return true;
  // A candidate the native writer's own check refused (verification-failed)
  
  if (error.name === "PdfNativeTransactionError" &&
    (error.code === "unsupported-document" || error.code === "verification-failed") &&
    typeof error.message === "string" && !/encrypt|unchanged/i.test(error.message)) return true;
  // A request the engine host would not take for its size (a replacement
  // that needs glyphs the line's subset font lacks carried its fallback
  
  return engineRefusalReason(error) === "too_large";
}

function samePropertyDraft(
  baseline: PdfNativeTextPropertyDraft | null,
  draft: PdfNativeTextPropertyDraft | null,
): boolean {
  return JSON.stringify(baseline) === JSON.stringify(draft);
}

/** The same draft whatever order its keys were spread in. */
function samePropertyDraftValues(
  left: PdfNativeTextPropertyDraft | null,
  right: PdfNativeTextPropertyDraft | null,
): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort()
          .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
          .map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
        : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function stripPropertyMove(draft: PdfNativeTextPropertyDraft): PdfNativeTextPropertyDraft {
  if (draft.moveX === undefined && draft.moveY === undefined) return draft;
  return pdfNativeTextPropertyDraftWithoutMove(draft);
}

function storedLayoutFont(
  proof: PdfNativeTextPropertyProof,
  layout: PdfNativeTextLayoutEvidence,
) {
  const box = layout.box;
  const normalize = pdfNativeFontNameKey;
  return proof.fonts.find(
    (font) =>
      font.bold === Boolean(box.bold) &&
      font.italic === Boolean(box.italic) &&
      ((box.sourceFontName &&
        normalize(font.baseFont) === normalize(box.sourceFontName)) ||
        (box.fontFamily &&
          box.fontFamily
            .split(",")
            .some(
              (family) => normalize(family.trim()) === normalize(font.family),
            ))),
  );
}

/** The current editing snapshot is not the immutable source-operator proof. */
function currentPropertyDraft(
  proof: PdfNativeTextPropertyProof | null,
  layout: PdfNativeTextLayoutEvidence | null,
): PdfNativeTextPropertyDraft | null {
  if (!proof) return null;
  const source = draftFromPropertyProof(proof);
  if (!layout?.promoted) return source;
  const pointHeight = layout.pageHeightPoints ?? layout.pageHeightPx;
  const currentSize = Number(layout.box.fontSize) * pointHeight;
  return {
    ...source,
    fontResourceName:
      storedLayoutFont(proof, layout)?.resourceName ?? source.fontResourceName,
    fontSize:
      Number.isFinite(currentSize) && currentSize > 0
        ? Math.round(currentSize * 1e6) / 1e6
        : source.fontSize,
    color:
      layout.box.color && /^#[0-9a-f]{6}$/i.test(layout.box.color)
        ? colorFromHex(layout.box.color)
        : source.color,
    alignment: layout.box.align ?? source.alignment,
  };
}

function nativeTextDraftFontSizePixels(
  metrics: InlineEditorMetrics | null,
  proof: PdfNativeTextPropertyProof | null,
  draft: PdfNativeTextPropertyDraft | null,
): number {
  const sourcePixels = Number.parseFloat(metrics?.fontSize ?? "");
  const originalPoints = proof?.original.fontSize ?? 0;
  if (
    draft &&
    originalPoints > 0 &&
    Number.isFinite(sourcePixels) &&
    sourcePixels > 0
  ) {
    return (sourcePixels * draft.fontSize) / originalPoints;
  }
  return Number.isFinite(sourcePixels) && sourcePixels > 0 ? sourcePixels : 16;
}

const NO_PAGE_FONTS: readonly PdfPageFont[] = Object.freeze([]);

export default function PdfNativeListTextEditDialog(
  props: PdfNativeListTextEditDialogProps,
): React.JSX.Element {
  const { open, ...editorProps } = props;
  if (!open || typeof document === "undefined") return <></>;
  return <PdfNativeListTextInlineEditor {...editorProps} />;
}

/**
 * The same replay when the provisional text and the settled text differ only
 * in white space: the reader read spaces into a line's letter spacing
 * ("L I N E 0 9" for a line set with character spacing, user audit PDF 0050),
 * or folded a run of the source's spaces into one (pdf.js reads two spaces as
 * one wide space item; the line then saved with one, PDF 0050 follow-up). The
 * edit lands between the same settled characters; white space the user did
 * not touch is the settled text's. Null when the two texts differ in anything
 * but white space.
 */
function replayDraftOntoUnspacedSource(provisional: string, draft: string, source: string): string | null {
  const before = Array.from(provisional), after = Array.from(draft), settled = Array.from(source);
  const space = (character: string | undefined) => character !== undefined && /\s/u.test(character);
  // Each provisional position's place in the settled text: a matched
  // character stands at its own place; a reader-only space stands where the
  // settled character after it does; settled-only spaces are stepped over.
  const at: number[] = [];
  let next = 0;
  for (const character of before) {
    if (next < settled.length && character === settled[next]) { at.push(next); next += 1; continue; }
    if (space(character)) {
      // A reader space: the settled text's own space(s) here, if any, or none.
      at.push(next);
      if (space(settled[next])) next += 1;
      continue;
    }
    let ahead = next;
    while (space(settled[ahead])) ahead += 1;
    if (ahead < settled.length && character === settled[ahead]) { at.push(ahead); next = ahead + 1; continue; }
    return null;
  }
  // Trailing settled spaces the reader dropped stay after an appended edit.
  const tail = next;
  while (space(settled[next])) next += 1;
  if (next !== settled.length) return null;
  at.push(tail);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const start = at[prefix];
  let end = at[before.length - suffix];
  // A reader space the user replaced took the settled run it stood for.
  if (suffix > 0 && prefix < before.length - suffix && space(before[before.length - suffix - 1])) {
    while (end < settled.length && space(settled[end]) && !space(before[before.length - suffix])) end += 1;
  }
  if (start > end) return null;
  return settled.slice(0, start).join("") + after.slice(prefix, after.length - suffix).join("") + settled.slice(end).join("");
}

/** The text a box edits: the source item without the spaces it ends in.
 * A reader item often carries the space pdf.js reads after it ("126 "), and
 * the writer keeps the source's trailing spaces whatever the box holds -- so
 * showing them only put an invisible character at the end of the box, which
 * took the first Backspace of an edit. */
/**
 * The user's edit of a provisional text replayed onto the settled source
 * text. The provisional text is the settled text less characters no reader
 * shows (a zero-width joiner, a variation selector, a combining mark the
 * text layer folded away): the edit is the span between the longest common
 * prefix and suffix of the provisional text and the draft, and it lands
 * between the same shown characters of the settled text. Null where the
 * two texts do not line up character for character once those marks are
 * set aside, which leaves the draft as typed.
 */
export function replayDraftOntoSource(provisional: string, draft: string, source: string): string | null {
  if (provisional === source) return draft;
  const shown = (text: string) => Array.from(text).filter((character) => !/[\p{Cf}\p{Mn}]/u.test(character));
  const provisionalShown = shown(provisional), sourceShown = shown(source);
  if (provisionalShown.length !== sourceShown.length ||
    provisionalShown.some((character, index) => character !== sourceShown[index])) {
    return replayDraftOntoUnspacedSource(provisional, draft, source);
  }
  const before = Array.from(provisional), after = Array.from(draft);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const typed = after.slice(prefix, after.length - suffix).join("");
  // The prefix and suffix as counts of shown characters, then as positions
  // in the settled text: the edit lands after the same shown characters,
  // and the marks that follow the prefix's last shown character stay with it.
  const shownIn = (characters: readonly string[]) => characters.filter((character) => !/[\p{Cf}\p{Mn}]/u.test(character)).length;
  const prefixShown = shownIn(before.slice(0, prefix));
  const suffixShown = shownIn(before.slice(before.length - suffix));
  const sourceCharacters = Array.from(source);
  const positionAfterShown = (count: number, fromEnd: boolean) => {
    if (count === 0) return fromEnd ? sourceCharacters.length : 0;
    let seen = 0;
    if (!fromEnd) {
      for (let index = 0; index < sourceCharacters.length; index += 1) {
        if (!/[\p{Cf}\p{Mn}]/u.test(sourceCharacters[index])) seen += 1;
        if (seen === count) {
          let end = index + 1;
          while (end < sourceCharacters.length && /[\p{Cf}\p{Mn}]/u.test(sourceCharacters[end])) end += 1;
          return end;
        }
      }
      return sourceCharacters.length;
    }
    for (let index = sourceCharacters.length - 1; index >= 0; index -= 1) {
      if (!/[\p{Cf}\p{Mn}]/u.test(sourceCharacters[index])) seen += 1;
      if (seen === count) return index;
    }
    return 0;
  };
  const start = positionAfterShown(prefixShown, false);
  const end = positionAfterShown(suffixShown, true);
  if (start > end) return null;
  return sourceCharacters.slice(0, start).join("") + typed + sourceCharacters.slice(end).join("");
}

function editableSourceText(text: string): string {
  const trimmed = text.replace(/[ \t\u00a0]+$/u, "");
  return trimmed && !/[\r\n]/u.test(text.slice(trimmed.length)) ? trimmed : text;
}

function editableInitialLayout(
  layout: PdfNativeTextLayoutEvidence | null,
  sourceText: string,
  text: string,
): PdfNativeTextLayoutEvidence | null {
  const inputLayout = layout?.sourceInputLayout;
  if (!layout || !inputLayout || text === sourceText || inputLayout.text !== sourceText) return layout;
  const cut = sourceText.length - text.length;
  if (inputLayout.breaks.length > 0 || !inputLayout.value.endsWith(sourceText.slice(text.length))) return layout;
  return {
    ...layout,
    sourceInputLayout: {
      ...inputLayout,
      text,
      value: inputLayout.value.slice(0, inputLayout.value.length - cut),
    },
  };
}

/**
 * Carries a page line's frame along a move drag without rendering the line
 * editor on each pointer move: the editor renders the frame where the state
 * puts it (the drag's first step), this moves it on to where the pointer has
 * taken it since, with the drawn caret, in its own layout effect -- after
 * each move and after any render of the editor during the drag -- and the
 * drop sets the state once. The lift and the draft are inside the frame and
 * go with it. (Each move rendered the 8,000-line editor: 62 times in a
 * one-second drag.)
 */
function NativeTextFrameFollower({
  liveRef,
  followRef,
  frameRef,
  pageHost,
  layoutRect,
  shownRect,
}: {
  liveRef: RefObject<BoxRect | null>;
  followRef: RefObject<(() => void) | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  pageHost: HTMLElement | null | undefined;
  /** The frame the state holds, and where the editor drew it from that. */
  layoutRect: BoxRect | null;
  shownRect: BoxRect | null;
}): null {
  const [, setMoves] = useState(0);
  useLayoutEffect(() => {
    followRef.current = () => setMoves((count) => count + 1);
    return () => {
      followRef.current = null;
    };
  }, [followRef]);
  useLayoutEffect(() => {
    const live = liveRef.current;
    const caret = pageHost?.querySelector<SVGElement>('svg[data-pdf-native-source-caret="true"]') ?? null;
    if (!live || !layoutRect || !shownRect) {
      if (caret?.hasAttribute("data-pdf-native-text-caret-follows")) {
        caret.style.removeProperty("transform");
        caret.removeAttribute("data-pdf-native-text-caret-follows");
      }
      return;
    }
    const dx = live.x - layoutRect.x;
    const dy = live.y - layoutRect.y;
    const frame = frameRef.current;
    if (frame) {
      frame.style.left = `${(shownRect.x + dx) * 100}%`;
      frame.style.top = `${(shownRect.y + dy) * 100}%`;
    }
    if (caret) {
      // The caret is drawn over the whole page: moved by the same fractions.
      caret.style.transform = `translate(${dx * 100}%, ${dy * 100}%)`;
      caret.setAttribute("data-pdf-native-text-caret-follows", "true");
    }
  });
  return null;
}




function readableFontLabel(label: string): string {
  const bare = label.replace(/^[A-Z]{6}\+/u, "");
  return officeFaceName(bare)?.family ?? bare;
}

/** How long the pointer rests on a format before its exact plan is asked. */
/** A format previewed that is only a rule. */
const ruleOnlyPreview = (css: Readonly<Record<string, string>>) => Object.keys(css).every((name) => name.startsWith("text-decoration"));
const HOVER_EXACT_REST_MS = 40;
/** How long a format hovered that sets a box's rows again waits for its exact drawing. */
const HOVER_DRAFT_HELD_MS = 450;
/** What the ribbon still offers on a line whose words the reader did not read
 * as the page draws them (initialLayout.wordsFixed): the formats written
 * where its text stands, and the commands that are not of the line's words. */
const WORDS_UNREAD_KEPT_CONTROLS: ReadonlySet<string> = new Set(["hand", "select", "insertText", "bold", "italic",
  "underline", "strikethrough", "fontColor", "highlight", "keyboardInput", "save", "exit"]);
/** What it offers on a box bold by a Type3 show drawn again after the show
 * (initialLayout.wordsFixed, "weight-drawn-again"): the weight itself -- to
 * take it off -- and what is written where the text stands with the passes
 * left as they are. Not a lean: the reader reads the passes of a leaned show
 * as lines of their own, and the page refuses it. */
const TYPE3_BOLD_KEPT_CONTROLS: ReadonlySet<string> = new Set([...WORDS_UNREAD_KEPT_CONTROLS].filter((control) => control !== "italic"));
/** A plan slower than this ends drawing ahead for the moment. */
const HOVER_EXACT_AHEAD_SLOW_MS = 1500;
/** Page pixels of hovered drawings kept for a return to the same format. */
const HOVER_EXACT_KEPT_PIXELS = 16_000_000;
/** How long a press holds up its hovered drawing at most. */
const HOVER_EXACT_HOLD_MS = 8000;

function PdfNativeListTextInlineEditor({
  originalText: sourceOriginalText,
  initialLayout: sourceInitialLayout = null,
  busy,
  preparationPending = false,
  error,
  serverRefusal = null,
  applyDisabledReason,
  propertyProof: propertyProofInput,
  nativeMoveProof: nativeMoveProofInput = null,
  nativeGroupMoveProof: nativeGroupMoveProofInput = null,
  onApplyRowFormat,
  onOpenLineOfBlock,
  onSelectWholeParagraph,
  onDetachRowFormat,
  onApplyParagraphFormat,
  onDetachParagraphFormat,
  paragraphColors: paragraphColorsInput,
  onJustifyParagraph,
  paragraphJustifyDisabledReason,
  sourceAppearance,
  boxDrawnStyle,
  type3PicturesOnly,
  type3TakesWeight,
  type3LettersHeld,
  sourceGeometry,
  labels,
  ribbonLabels: ribbonLabelsInput,
  fontPickerLabels,
  returnFocusRef,
  ribbonRootRef,
  requireRibbonHost = false,
  paintRibbonAfterFocus = false,
  initialCaretOffset = null,
  wrapFrameRight = null,
  initialDraftText = null,
  preparationFailed = false,
  onHeldRibbonActionsLeft,
  takeHeldRibbonActions,
  heldRibbonActionsTakenOver = false,
  standingRulesPending = false,
  onRetainUnsavedDraft,
  onDetachFinish,
  onDeferLayoutFinish,
  onExitContentEditMode,
  onHandTool,
  onInsertText,
  onAnnotateLine,
  onConvertToFormula,
  initialEditingSurface = null,
  initialEditingSurfacePrepared = false,
  drawnSourceSha256 = null,
  onControllerChange,
  onDraftStateChange,
  onUnsavedTypingChange,
  onTypingDraftChange,
  onApply,
  onDeleteTextObject,
  pageFonts = NO_PAGE_FONTS,
  onPreparePageFont,
  nativeTextDecorations,
  nativeCoverRules,
  retainedLeftIndent = 0,
  retainedAlignment = "left",
  retainedFrameShift = 0,
  onPreparePreview,
  onCancel,
  captureNextTextTarget,
  pageTakesUndo,
  inheritNextTextTarget,
}: Omit<PdfNativeListTextEditDialogProps, "open">): React.JSX.Element {
  const originalText = editableSourceText(sourceOriginalText);
  const initialLayout = useMemo(
    () => editableInitialLayout(sourceInitialLayout, sourceOriginalText, originalText),
    [sourceInitialLayout, sourceOriginalText, originalText],
  );
  // A format the native writer refused on this line is no longer taken
  
  // to the last format the writer took): the line's proof stays its own.
  const nativeFormatTakenOver = false;
  const propertyProof = nativeFormatTakenOver ? null : propertyProofInput;
  // A line whose words the reader did not read as the page draws them
  // (initialLayout.wordsFixed): its words are fixed, and while it is open
  // the page's own ink stays the line -- never the reader's words set in a
  // browser's face, which for such a line are other letters.
  const wordsUnread = Boolean(initialLayout?.wordsFixed);
  
  // for its formats alone: its words are fixed the same way while it is
  // open, and a line of it opens for them (onOpenLineOfBlock).
  const wordsByLine = initialLayout?.wordsFixed === "too-large-to-set-again";
  const wordsByLineRef = useRef(wordsByLine);
  wordsByLineRef.current = wordsByLine;
  // (Nor is such a line its runs' to move, size or stroke as a group: the
  // runs a row of it proves as are not all the page draws of it.)
  const nativeMoveProof = wordsUnread ? null : nativeMoveProofInput;
  const nativeGroupMoveProof = wordsUnread ? null : nativeGroupMoveProofInput;
  // A family from the reader's computer being prepared for the page, and
  // the choice that waits for it (prepareLocalFont).
  const [preparingFontFamily, setPreparingFontFamily] = useState<string | null>(null);
  const pendingFontActionRef = useRef<Extract<PdfTextEditingContextRibbonAction, { type: "fontFamily" }> | null>(null);
  const translate = useTranslations("console-notebooks");
  const locale = useLocale();
  // The fallback label set has to be built here rather than as a default
  // parameter: it now reads the message catalog, and the translator does not
  // exist until the component body runs.
  const ribbonTranslate = translate as unknown as PdfRibbonTranslator;
  const ribbonLabels = useMemo(
    () =>
      ribbonLabelsInput ??
      createPdfTextEditingContextRibbonLabels(ribbonTranslate),
    [ribbonLabelsInput, ribbonTranslate],
  );
  const [replacementText, setReplacementText] = useState(initialDraftText ?? originalText);
  const [acceptedSourceText, setAcceptedSourceText] = useState(() => ({
    baseline: originalText,
    verified: !preparationPending && !error && (Boolean(propertyProof) || !applyDisabledReason),
  }));
  // A restored draft is the user's typing: adoption replays it, never resets it.
  const userTextInputStartedRef = useRef(initialDraftText !== null && initialDraftText !== originalText);
  // WPS's click model: a single click selects the block -- its frame, the
  // Text Editing tab, every format on the whole of it -- and places no
  // caret; a double click, Enter, F2 or a typed key (键盘输入触发编辑) puts
  // the caret in. A restored draft is the reader's typing and opens with
  // its caret.
  // A double click whose second press came before this editor did (the
  // reader noted it on the box): it opens with its caret in, never selected
  // -- keys typed or Shift+Arrow right after must not move the block.
  const [openingDoublePress] = useState<PdfNativeTextPress | null>(() =>
    initialLayout?.selectObject ? readPdfNativeTextDoublePress(returnFocusRef.current) : null);
  // Opened on a new box's first words: centredRetype never takes it.
  const [openedOnNewBox] = useState(() =>
    pdfNativeTextBoxHandoffOpening(typeof document === "undefined" ? null : document));
  // Flush with the page's right margin, as the page shows the line opened
  // (read again for each line this editor opens: it stays mounted from one
  // line to the next, and read once it answered for the first only).
  const openedBoxId = initialLayout?.box.id ?? null;
  const rightFlushLine = useMemo(() => {
    const host = returnFocusRef.current;
    // (The box's font size is a fraction of the page's height, as its frame is.)
    const fontSize = Number(initialLayout?.box.fontSize);
    const pageHeight = host?.closest(".pdf-viewer__page")?.getBoundingClientRect().height ?? 0;
    return pdfNativeLineRightFlushOnPage(host, pageHeight > 0 && Number.isFinite(fontSize) && fontSize > 0
      ? fontSize * pageHeight : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the line opened, by its box and words
  }, [openedBoxId, originalText, returnFocusRef]);
  useEffect(() => {
    if (openedBoxId) markPdfTextLatency("editor.right-flush", { flush: rightFlushLine });
  }, [openedBoxId, rightFlushLine]);
  // A line of the page's body (several rows, or starting where the page's
  // other lines start): in the middle of its page by the page's own margins,
  // not set centred, and never set again so (centredLine).
  const bodyLine = useMemo(() => {
    const host = returnFocusRef.current;
    // (The box's font size is a fraction of the page's height, as its frame is.)
    const fontSize = Number(initialLayout?.box.fontSize);
    const pageHeight = host?.closest(".pdf-viewer__page")?.getBoundingClientRect().height ?? 0;
    return pdfNativeLineOfPageBody(host, pageHeight > 0 && Number.isFinite(fontSize) && fontSize > 0
      ? fontSize * pageHeight : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the line opened, by its box and words
  }, [openedBoxId, originalText, returnFocusRef]);
  const [objectSelected, setObjectSelected] = useState(() =>
    Boolean(initialLayout?.selectObject) && !userTextInputStartedRef.current && openingDoublePress === null);
  const objectSelectedRef = useRef(objectSelected);
  objectSelectedRef.current = objectSelected;
  const keyboardInputStartsEditing = usePdfTextKeyboardInput();
  const compositionOriginalTextRef = useRef<string | null>(null);
  const unverifiedNativeSource = !acceptedSourceText.verified && !initialLayout?.promoted;
  const pendingSourceCaretRef = useRef<{
    value: string; start: number; end: number;
    direction: "forward" | "backward" | "none";
  } | null>(null);
  // A restored draft is not laid out like the source line it replaces.
  const [sourceInputLayout, setSourceInputLayout] = useState<PdfNativeTextInputLayout | null>(() =>
    (initialDraftText === null || initialDraftText === originalText) &&
    !initialLayout?.promoted && initialLayout?.sourceInputLayout?.text === originalText
      ? initialLayout.sourceInputLayout : null);
  const sourceInputLayoutRef = useRef(sourceInputLayout);
  const [candidateGeometry,setCandidateGeometry] = useState<PdfTextSourceAppearance|null>(null);
  // The properties the newest candidate geometry was drawn with: its
  // advances anchor a draft only while the draft still has those.
  const candidateGeometryPropertiesRef = useRef<string | null>(null);
  const sourceCaretControllerRef = useRef<PdfSourceTextCaretHandle|null>(null);
  sourceInputLayoutRef.current = sourceInputLayout;
  const sourceInputBeforeEditRef = useRef<{value:string;start:number;end:number} | null>(null);
  const propertyBaseline = useMemo(() => currentPropertyDraft(propertyProof, initialLayout),
    [propertyProof, initialLayout]);
  const [propertyOverride, setPropertyOverride] = useState<PdfNativeTextPropertyDraft | null>(null);
  // A press asked what it would write, for the format hovered (hoverExactAsked):
  // the draft comes here and the line's own stays as it is.
  const propertyPressAskedRef = useRef<{ draft: PdfNativeTextPropertyDraft | null } | null>(null);
  const setProperties = useCallback((next: React.SetStateAction<PdfNativeTextPropertyDraft | null>) => {
    const asked = propertyPressAskedRef.current;
    if (asked) asked.draft = typeof next === "function" ? next(asked.draft) : next;
    else setPropertyOverride(next);
  }, []);
  /** The draft's moveX was set by Decrease Indent, not by a drag. */
  const [indentMoveOwned, setIndentMoveOwned] = useState(false);
  /** An alignment chosen against the journal's saved one (it owns moveX). */
  const [alignmentChoice, setAlignmentChoice] = useState<"left" | "center" | "right" | null>(null);
  const properties = propertyOverride ?? propertyBaseline;
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;
  /** The last format draft the native writer took (its exact preview came
   * back): what a refused press goes back to. */
  const acceptedPropertiesRef = useRef<PdfNativeTextPropertyDraft | null>(null);
  // A move-only proof has no property baseline of its own: its draft starts
  // from the item's own state and differs from it only by the move, so it
  // stands for no typography or colour choice of the reader's.
  const moveOnlyBaseline = !propertyProof
    ? nativeMoveProof?.baseline ?? nativeGroupMoveProof?.baseline ?? null : null;
  const propertyChoice = moveOnlyBaseline ? null : properties;
  // A saved source-bound frame already has a V5 layout writer. Its point size
  // and alignment do not require a single-run source font-property proof.
  // Keep these authored layout values separate from that immutable proof.
  // A line whose format the PDF does not state (no property proof, no
  // group's) takes a bold or a size as WPS sets them on any text: in the
  
  
  
  // PDF 中准确读出」 with 加粗 and 增大字号 both grey).
  
  
  // by the first character format pressed on it: coverBoxStyle is then the
  // weight and slant its buttons showed before that press, which the box
  // starts in (so the press taken back leaves nothing to write).
  const [coverBoxStyle, setCoverBoxStyle] = useState<Readonly<{
    bold: boolean; italic: boolean;
    /** The rules standing in the page beside the line when it became a box
     * (coverRulesIntoBox): the box starts under them too, so nothing of
     * them is a change to write. */
    underline?: boolean; strikethrough?: boolean; runs?: PdfTextStyleRun[] | null;
  }> | null>(null);
  const unprovenTextBoxFormat = coverBoxStyle !== null;
  // A line every piece of which paints nothing: an OCR layer set invisible
  // (3 Tr, a glyphless face) under the picture of a scanned page. The window
  // states the fill its box covers the scan in only for such a line
  // (sourceInkCover: every piece in rendering mode 3 or 7). No run of it can
  // be set bold, slanted, larger or in a colour in the page's own text --
  // nothing of it is drawn -- and what is typed into it is already written
  // as a text box over the scanned words. A character format pressed on it
  // is written the same way, the box carrying the format (pdf-walk-1000:
  // 28 scanned files, every such press ended 「这次格式未能应用到所选文字」
  // with nothing written). Never a line the page draws: that one keeps its
  
  const coverLaneLine = Boolean(!propertyProof && initialLayout?.fallbackText && !initialLayout.promoted &&
    /^#[0-9a-f]{6}$/i.test(initialLayout.sourceInkCover ?? ""));
  // Its rules (下划线, 删除线) are the page's own while the window proves a
  // rule is written beside its invisible words (nativeCoverRules) and the
  // line is still the scan's: its words the page's, no box made of it. The
  // scanned words stay as they are -- taken into a text box for a rule, the
  // line showed the OCR's misreadings in their place (pdf-walk-1000, 0436).
  // Not proved (or the words typed over): its rules are its box's.
  const coverRulesOpen = coverLaneLine && coverBoxStyle === null && Boolean(onApplyRowFormat);
  const coverRulesProven = coverRulesOpen && nativeCoverRules?.state === "proven" &&
    pdfNativeCoverRulesTextFits(nativeCoverRules.text, originalText) ? nativeCoverRules : null;
  const coverRulesLane = coverRulesProven !== null && replacementText === originalText;
  /** The window is still reading the page: a rule pressed meanwhile is held. */
  const coverRulesWaiting = coverRulesOpen && nativeCoverRules?.state === "pending";
  // The rules standing beside the open run are still being read
  // (standingRulesPending): a rule pressed meanwhile is held too, a few
  // seconds at most (a read that never answers does not hold the press).
  const [standingRulesWaitOver, setStandingRulesWaitOver] = useState(false);
  useEffect(() => {
    if (!standingRulesPending) { setStandingRulesWaitOver(false); return; }
    const timer = window.setTimeout(() => setStandingRulesWaitOver(true), 3_000);
    return () => window.clearTimeout(timer);
  }, [standingRulesPending]);
  const standingRulesWaiting = standingRulesPending && !standingRulesWaitOver;
  const managedLayoutTypography = Boolean(!propertyProof && initialLayout && (
    (initialLayout.promoted &&
      initialLayout.sourceText?.boxId === initialLayout.box.id &&
      initialLayout.sourceText?.page === initialLayout.box.page + 1) ||
    unprovenTextBoxFormat));
  const managedPointHeight = initialLayout?.pageHeightPoints ?? initialLayout?.pageHeightPx ?? 1;
  const managedSizeBaseline = Math.round(Number(initialLayout?.box.fontSize) * managedPointHeight * 1e6) / 1e6;
  // A block of several rows the page sets centred (a diagram's label): the
  // draft the browser lays out is centred too, so its rows stay where the
  // page draws them until the page's own preview of the edit arrives. Flush
  // left, every row jumped to the block's left edge at the first key. The
  // window opens every source box as set left (it does not read alignment);
  
  
  
  const centredBlockDraft = useMemo(() => !openedOnNewBox && Boolean(initialLayout) && !initialLayout?.promoted &&
    !initialLayout?.fallbackText && Math.abs(normalizeBoxAngle(initialLayout?.box.angle ?? 0)) <= 0.001 &&
    pdfTextSourceBlockCentred(sourceGeometry), [initialLayout, openedOnNewBox, sourceGeometry]);
  const managedAlignmentBaseline = centredBlockDraft && (initialLayout?.box.align ?? "left") === "left"
    ? "center" : initialLayout?.box.align ?? "left";
  const [layoutTypographyOverride, setLayoutTypographyOverride] = useState<{
    fontSize?: number;
    alignment?: "left" | "center" | "right";
    fontId?: string;
    bold?: boolean;
    italic?: boolean;
    color?: string;
    underline?: boolean;
    strikethrough?: boolean;
    justify?: boolean;
    /** The wrapped box's spacing, in points of its font, and scale, percent. */
    characterSpacing?: number;
    wordSpacing?: number;
    horizontalScale?: number;
    /** An Office family from All Fonts for the whole box (null: one of the
     * portable faces was chosen instead). */
    officeFamily?: string | null;
    /** Word's Align Text for the box (its rows in its frame). */
    verticalAlign?: "top" | "middle" | "bottom";
  }>({});
  const managedFontSize = managedLayoutTypography
    ? layoutTypographyOverride.fontSize ?? managedSizeBaseline : null;
  const managedAlignment = managedLayoutTypography
    ? layoutTypographyOverride.alignment ?? managedAlignmentBaseline : null;
  const managedFontOption = managedLayoutTypography
    ? TEXTBOX_FONT_FAMILY_OPTIONS.find(option => option.id === layoutTypographyOverride.fontId) : undefined;
  // An Office family from All Fonts (lib/pdf/text-box-runs.ts): the box's
  // writer embeds its served substitute, which the draft is drawn in too.
  const initialManagedOfficeFamily = managedLayoutTypography
    ? pdfTextBoxOfficeFamily(initialLayout?.box.officeFamily) ?? undefined : undefined;
  const chosenOfficeFamily = managedLayoutTypography ? layoutTypographyOverride.officeFamily ?? undefined : undefined;
  const managedOfficeFamily = layoutTypographyOverride.officeFamily === undefined
    ? initialManagedOfficeFamily : chosenOfficeFamily;
  const managedFontFamily = chosenOfficeFamily
    ? pdfTextBoxRunCssFamily({ font: classifyFontName(chosenOfficeFamily), officeFamily: chosenOfficeFamily })
    : managedFontOption?.stack ?? initialLayout?.box.fontFamily;
  const managedSourceFontName = chosenOfficeFamily ?? managedFontOption?.sourceFontName ?? initialLayout?.box.sourceFontName;
  const managedBoldBaseline = coverBoxStyle?.bold ?? Boolean(initialLayout?.box.bold);
  const managedItalicBaseline = coverBoxStyle?.italic ?? Boolean(initialLayout?.box.italic);
  const managedBold = layoutTypographyOverride.bold ?? managedBoldBaseline;
  const managedItalic = layoutTypographyOverride.italic ?? managedItalicBaseline;
  
  // as its own formats (the managed writer draws them), not as page rules.
  // (A scanned line's box starts under the rules standing beside the line.)
  const managedUnderlineBaseline = coverBoxStyle?.underline ?? Boolean(initialLayout?.box.underline);
  const managedStrikethroughBaseline = coverBoxStyle?.strikethrough ?? Boolean(initialLayout?.box.strikethrough);
  const managedUnderline = layoutTypographyOverride.underline ?? managedUnderlineBaseline;
  const managedStrikethrough = layoutTypographyOverride.strikethrough ?? managedStrikethroughBaseline;
  const managedJustify = layoutTypographyOverride.justify ?? Boolean(initialLayout?.box.justify);
  
  const layoutVerticalAlignBaseline = initialLayout?.box.verticalAlign ?? "top";
  const layoutVerticalAlign = layoutTypographyOverride.verticalAlign ?? layoutVerticalAlignBaseline;
  
  // (lib/pdf/text-style-runs.ts). They go with the text as it is typed (a
  // character typed in a run takes its format) and are written by the run
  // writer (lib/pdf/text-box-runs.ts).
  const coverBoxRuns = coverBoxStyle?.runs;
  const initialManagedRuns = useMemo(() => !managedLayoutTypography ? null
    : coverBoxRuns !== undefined ? coverBoxRuns
      : normalizePdfTextStyleRuns(initialLayout?.box.runs, { expectedText: originalText }) ?? null,
  [managedLayoutTypography, coverBoxRuns, initialLayout?.box.runs, originalText]);
  const [managedRunsState, setManagedRunsState] = useState<Readonly<{
    text: string; runs: PdfTextStyleRun[] | null;
  }>>(() => ({ text: originalText, runs: initialManagedRuns }));
  const managedRuns = useMemo(() => {
    if (!managedLayoutTypography || !managedRunsState.runs) return null;
    if (managedRunsState.text === replacementText) return managedRunsState.runs;
    return reconcilePdfTextStyleRuns(managedRunsState.runs, managedRunsState.text, replacementText) ?? null;
  }, [managedLayoutTypography, managedRunsState, replacementText]);
  const managedRunsDirty = managedLayoutTypography &&
    JSON.stringify(managedRuns) !== JSON.stringify(initialManagedRuns);
  const managedFormatHistoryRef = useRef<{
    undo: ManagedFormatStep<typeof layoutTypographyOverride>[];
    redo: ManagedFormatStep<typeof layoutTypographyOverride>[];
  }>({ undo: [], redo: [] });
  const managedDecorationDirty = managedLayoutTypography && (
    managedUnderline !== managedUnderlineBaseline ||
    managedStrikethrough !== managedStrikethroughBaseline ||
    managedJustify !== Boolean(initialLayout?.box.justify));
  const managedFontClass = classifyFontName(managedSourceFontName || managedFontFamily);
  const managedLegacyTypographySupported = isPortableNativeTextBoxTypography(
    replacementText, managedFontClass, managedBold, managedItalic,
  );
  const managedFontChanged = managedLayoutTypography &&
    (managedFontFamily !== initialLayout?.box.fontFamily || managedSourceFontName !== initialLayout?.box.sourceFontName ||
      managedOfficeFamily !== initialManagedOfficeFamily);
  const managedStyleChanged = managedLayoutTypography &&
    (managedBold !== managedBoldBaseline || managedItalic !== managedItalicBaseline);
  const managedSpacingDirty = managedLayoutTypography && (
    layoutTypographyOverride.characterSpacing !== undefined ||
    layoutTypographyOverride.wordSpacing !== undefined ||
    layoutTypographyOverride.horizontalScale !== undefined);
  const managedTypographyDirty = managedLayoutTypography &&
    (managedSpacingDirty || managedFontSize !== managedSizeBaseline || managedAlignment !== managedAlignmentBaseline || managedFontChanged ||
      managedBold !== managedBoldBaseline || managedItalic !== managedItalicBaseline ||
      managedDecorationDirty || managedRunsDirty ||
      (layoutTypographyOverride.color !== undefined && layoutTypographyOverride.color !== initialLayout?.box.color?.toLowerCase()));
  const [paragraphColor, setParagraphColor] = useState<PdfNativeDeviceColor | null>(null);
  const paragraphColorsKey = paragraphColorsInput ? JSON.stringify(paragraphColorsInput) : "";
  const paragraphColors = useMemo<readonly PdfNativeDeviceColor[] | undefined>(() =>
    paragraphColorsKey ? JSON.parse(paragraphColorsKey) : undefined, [paragraphColorsKey]);
  // A paragraph of several colours is set in the one most of it is drawn in
  // when it becomes a text box: a difference in appearance, said in the
  // finish notice, never a reason to keep the draft (edit-gates.md).
  const paragraphSourceColor = useMemo(() => {
    if (!paragraphColors?.length) return null;
    const counts = new Map<string, number>();
    for (const color of paragraphColors) counts.set(colorToHex(color), (counts.get(colorToHex(color)) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
  }, [paragraphColors]);
  // A line every run of which the page draws in a bold (italic) face reads
  // bold (italic) with no property proof, as WPS shows it.
  // A face named bold run on with its family ("Univers-CondensedBold") is
  // bold as the reader reads it: 加粗 read unpressed on the USGS heading.
  // (One reading for the buttons and for the drafts their presses make:
  // nativeTextFaceStyle.)
  const faceReadsBold = (font: Readonly<{ bold?: boolean; baseFont?: string }> | null | undefined) =>
    nativeTextFaceStyle(font).bold;
  const faceReadsItalic = (font: Readonly<{ italic?: boolean; baseFont?: string }> | null | undefined) =>
    nativeTextFaceStyle(font).italic;
  // A weight drawn by stroking the glyphs in their fill colour (a synthetic
  // bold, as a paragraph's write sets a bold word the PDF has no bold face
  // of) reads bold as a bold face does.
  const runReadsBold = (run: Readonly<{ font: Readonly<{ bold?: boolean; baseFont?: string }>; syntheticBold?: true }>) =>
    faceReadsBold(run.font) || run.syntheticBold === true;
  const sourceInkFaces = (sourceAppearance ?? []).filter((run) => run.text.trim()).map((run) => run.font);
  
  // states the stroke and the lean standing on all of its text instead:
  // boxDrawnStyle. Unread, 加粗 and 倾斜 stood unpressed on a paragraph this
  // writer had stroked or leaned where it stands, and the press meant to
  
  const sourceFacesBold = (sourceInkFaces.length > 0 &&
    (sourceAppearance ?? []).filter((run) => run.text.trim()).every(runReadsBold)) || boxDrawnStyle?.bold === true;
  // A slant drawn by leaning the text matrix (a synthetic italic, as a
  // paragraph's write leans a box where it stands in a face the PDF has no
  // italic of) reads italic as an italic face does: read by the face alone,
  // 倾斜 stood unpressed on a line this writer had leaned, and a press meant
  
  const runReadsItalic = (run: Parameters<typeof nativeTextDrawnRunStyle>[0]) => nativeTextDrawnRunStyle(run).italic;
  const sourceRunsItalic = nativeTextDrawnRunsStyle(sourceAppearance).italic || boxDrawnStyle?.italic === true;
  // (Leaned, in a face that is no italic: the draft leans it too.)
  const sourceRunsLeaned = sourceRunsItalic &&
    (sourceAppearance ?? []).filter((run) => run.text.trim()).every((run) => !faceReadsItalic(run.font));
  // A paragraph proved line by line states no one run's format; a family
  // every line of it is drawn in is still its family, named in the font
  // field as a single line's is (two Helvetica lines read 「字体」, user
  // audit PDF 0056).
  /** The one face (bold, italic) the page draws characters [start, end)
   * of the line in, from the runs read off the page; null when they are
   * drawn in more than one, or the runs are not known. */
  /** The family the page draws every inked character of a range in, when
   * one face draws them all. */
  




  const sourceRunRanges = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const run of sourceAppearance ?? []) {
      const found = run.text ? originalText.indexOf(run.text, cursor) : -1;
      const start = found >= 0 ? found : cursor;
      ranges.push({ start, end: start + run.text.length });
      cursor = start + run.text.length;
    }
    return ranges;
  }, [sourceAppearance, originalText]);
  const sourceFamilyOver = (range: Readonly<{ start: number; end: number }>): string | null => {
    if (!sourceAppearance?.length || range.end <= range.start) return null;
    let family: string | null = null;
    for (const [index, run] of sourceAppearance.entries()) {
      const { start, end } = sourceRunRanges[index];
      if (end <= range.start || start >= range.end || !run.text.trim()) continue;
      const own = pdfPageFontDisplayFamily(run.programFace?.family ?? run.font.family);
      if (family !== null && family !== own) return null;
      family = own;
    }
    return family;
  };
  const sourceFaceOver = (range: Readonly<{ start: number; end: number }>) => {
    if (!sourceAppearance?.length || range.end <= range.start) return null;
    let face: Readonly<{ bold: boolean; italic: boolean }> | null = null;
    for (const [index, run] of sourceAppearance.entries()) {
      const { start, end } = sourceRunRanges[index];
      if (end <= range.start || start >= range.end || !run.text.trim()) continue;
      const own = { bold: runReadsBold(run), italic: runReadsItalic(run) };
      if (face && (face.bold !== own.bold || face.italic !== own.italic)) return null;
      face = own;
    }
    return face;
  };
  const sourceInkFamily = sourceInkFaces.length > 0 &&
    sourceInkFaces.every((font) => font.family === sourceInkFaces[0].family)
    ? sourceInkFaces[0].family : null;
  // What the reader knows of the clicked line before any proof: the base
  // name of the face pdf.js drew it in and its size on paper (the layout
  // box's height fraction times the page's points).
  const readerFontIdentity = !managedLayoutTypography && initialLayout?.box.sourceFontName
    ? { ...pdfNativeTextFontIdentity(initialLayout.box.sourceFontName),
      ...pdfNativeFontNameReadsStyle(initialLayout.box.sourceFontName) } : null;
  const readerPointSize = (() => {
    if (managedLayoutTypography || !initialLayout?.pageHeightPoints) return null;
    const points = Number(initialLayout.box.fontSize) * initialLayout.pageHeightPoints;
    return points > 0 && Number.isFinite(points) ? Math.round(points * 2) / 2 : null;
  })();
  const sourceStrokedOutline = Boolean(sourceAppearance?.some((run) => run.text.trim() && run.strokedOutline));
  const sourceInkColors = sourceAppearance?.filter(run => run.text.trim()).map(run => run.displayColor ? colorToHex(run.displayColor) : run.color ? colorToHex(run.color) : null);
  const sourceInkColor = sourceInkColors?.length && sourceInkColors.every(color => color === sourceInkColors[0]) ? sourceInkColors[0] : null;
  const storedColor = initialLayout?.box.color;
  const storedHexColor = typeof storedColor === "string" && /^#[0-9a-f]{6}$/i.test(storedColor)
    ? storedColor : null;
  // Until the line's proof lands (and when it cannot), the glyphs read from
  // the loaded page say the one colour the page paints them in: the draft
  // keeps it, over the reader's box colour (sampled from the rendered pixels
  // in the glyphs' boxes: on a photo, the background between thin strokes)
  
  // red the moment it was typed in, and stayed so under a slow server).
  const sourceGeometryInkColor = useMemo(() => {
    const colors = sourceGeometry?.characters.filter((character) => character.text.trim())
      .map((character) => character.color);
    if (!colors?.length || colors.some((color) => color.length !== 3 ||
      color.some((value) => !Number.isFinite(value) || value < 0 || value > 1))) return null;
    if (colors.some((color) => color.some((value, index) => Math.abs(value - colors[0][index]) > 1 / 255))) return null;
    return colorToHex({ kind: "rgb", components: [colors[0][0], colors[0][1], colors[0][2]] });
  }, [sourceGeometry]);
  // One document color drives the draft, Ribbon and serialized layout. CSS
  // theme variables belong to editor chrome and are never PDF paint values.
  /** The whole box's font, colour or slant, set row by row on finish
   * (onApplyRowFormat); the draft shows it meanwhile. */
  const [rowFormat, setRowFormat] = useState<PdfNativeRowFormat | null>(null);
  










  const [partFormats, setPartFormats] = useChangedState<PdfTextPartFormats>(NO_PART_FORMATS);
  const partFormatsRef = useRef(partFormats);
  partFormatsRef.current = partFormats;
  /** The part formats as they stood when the writer last took the draft:
   * what a refused press goes back to. */
  const acceptedPartFormatsRef = useRef<PdfTextPartFormats>(NO_PART_FORMATS);
  /** The parts as they stood before the press being run now (set by the
   * press, or by the replay of a held one): what its refusal goes back to. */
  const pressPartsBeforeRef = useRef<PdfTextPartFormats | null>(null);
  








  const formatHistoryRef = useRef<{
    past: PartFormatSnapshot[]; future: PartFormatSnapshot[];
    log: ("format" | "text")[]; redoLog: ("format" | "text")[];
  }>({ past: [], future: [], log: [], redoLog: [] });
  const withPartRulesRef = useRef<(draft: PdfNativeTextPropertyDraft, parts: PdfTextPartFormats) => PdfNativeTextPropertyDraft>(
    (draft) => draft);
  const setPropertiesRef = useRef<((draft: PdfNativeTextPropertyDraft) => void) | null>(null);
  // Typing moves the parts with the characters (new ones take the format
  // of the character before them, as Word does).
  const partFormatsTextRef = useRef(replacementText);
  useEffect(() => {
    const before = partFormatsTextRef.current;
    partFormatsTextRef.current = replacementText;
    if (before === replacementText) return;
    const moved = pdfTextPartFormatsAfterEdit(partFormatsRef.current, before, replacementText);
    partFormatsRef.current = moved;
    setPartFormats(moved);
    acceptedPartFormatsRef.current = pdfTextPartFormatsAfterEdit(acceptedPartFormatsRef.current, before, replacementText);
    // The rules the run's own write draws follow the characters they name.
    if (propertiesRef.current?.textRuleParts?.length) {
      setPropertiesRef.current?.(withPartRulesRef.current(propertiesRef.current, moved));
    }
  }, [replacementText, setPartFormats]);
  const draftColor = rowFormat?.color ?? (managedLayoutTypography ? layoutTypographyOverride.color : null) ??
    (paragraphColor ? colorToHex(paragraphColor) : null) ??
    (propertyChoice && (!sourceInkColor || !propertyProof || JSON.stringify(propertyChoice.color)!==JSON.stringify(propertyProof.original.color)) ? colorToHex(propertyChoice.color) : null) ??
    (initialLayout?.promoted ? storedHexColor : null) ??
    paragraphSourceColor ?? sourceInkColor ?? sourceGeometryInkColor ?? storedHexColor ?? "#0f2747";
  
  // its runs over the box's own formats. A box drawn in more than its one
  // style (part formatted, or an Office family) is drawn, measured and
  // written as runs.
  const managedRunBox = managedLayoutTypography ? {
    text: replacementText,
    fontSize: managedFontSize !== null && managedPointHeight > 0
      ? managedFontSize / managedPointHeight : Number(initialLayout?.box.fontSize),
    color: draftColor,
    fontFamily: managedFontFamily,
    sourceFontName: managedSourceFontName,
    officeFamily: managedOfficeFamily,
    bold: managedBold,
    italic: managedItalic,
    underline: managedUnderline,
    strikethrough: managedStrikethrough,
    runs: managedRuns ?? undefined,
  } : null;
  const managedDrawnRuns = managedRunBox ? resolvePdfTextBoxDrawnRuns(managedRunBox) : null;
  const managedDrawsRuns = Boolean(managedRunBox && managedDrawnRuns &&
    pdfTextBoxDrawnRunsNeedRunWriter(managedRunBox, managedDrawnRuns));
  // A box of one style is written whatever its characters: one the bundled
  // faces cannot draw is drawn by its rendered appearance (20acd6ef84). A
  
  void managedLegacyTypographySupported;
  const managedTypographySupported = managedDrawsRuns && managedDrawnRuns
    ? pdfTextBoxDrawnRunsPortable(managedDrawnRuns)
    : true;
  


  const managedStyleOver = (range: Readonly<{ start: number; end: number }>) => {
    if (!managedDrawnRuns) return null;
    const covered: PdfTextBoxDrawnRun[] = [];
    let offset = 0;
    for (const run of managedDrawnRuns) {
      const start = offset;
      offset += run.text.length;
      if (offset > range.start && start < range.end) covered.push(run);
    }
    if (covered.length === 0) return null;
    const all = (pick: (run: PdfTextBoxDrawnRun) => boolean) => covered.every(pick);
    const shared = <T,>(pick: (run: PdfTextBoxDrawnRun) => T): T | undefined =>
      covered.every((run) => pick(run) === pick(covered[0])) ? pick(covered[0]) : undefined;
    return {
      bold: all((run) => run.bold),
      italic: all((run) => run.italic),
      underline: all((run) => run.underline),
      strikethrough: all((run) => run.strikethrough),
      superscript: all((run) => run.script === "superscript"),
      subscript: all((run) => run.script === "subscript"),
      fontSize: shared((run) => Math.round(run.fontSize * managedPointHeight * 100) / 100),
      color: shared((run) => run.color.toLowerCase()),
      officeFamily: shared((run) => run.officeFamily ?? ""),
      font: shared((run) => run.font),
    };
  };
  const unresolvedParagraphColor = !propertyChoice && !paragraphColor &&
    Boolean(paragraphColors?.length) && !paragraphSourceColor &&
    !(initialLayout?.promoted && storedHexColor);
  const paragraphChanges = useMemo<PdfNativeParagraphPropertyChanges | null>(() =>
    paragraphColor && paragraphColors?.length &&
      !paragraphColors.every(color => JSON.stringify(color) === JSON.stringify(paragraphColor))
      ? { color: paragraphColor } : null, [paragraphColor, paragraphColors]);
  // The right edge (an x of the page) the reader dragged a paragraph's frame
  // to, when the paragraph is set again in it in place (WPS: a text block
  // resized re-wraps its text); null when the frame is the paragraph's own.
  const [paragraphFrameRight, setParagraphFrameRight] = useState<number | null>(null);
  /** The move in the draft is the rewrap's own (its left edge pulled), not
   * a move the reader made apart from it. */
  const rewrapMovedRef = useRef(false);
  const paragraphFrameRightRef = useRef<number | null>(null);
  paragraphFrameRightRef.current = paragraphFrameRight;
  // The line spacing (a baseline step, points of the page) the reader set on
  // a paragraph no format proof states: the paragraph is set again at it in
  // place by the paragraph rewrite, as WPS sets a paragraph's line spacing
  // (bug 0066); null while it is the paragraph's own.
  const [paragraphLineStep, setParagraphLineStep] = useState<number | null>(null);
  // Its font size likewise (a factor of the paragraph's own size): set again
  // in its frame at that size, the lines broken anew, as WPS sizes a
  // paragraph's text; null while it is the paragraph's own.
  const [paragraphSizeScale, setParagraphSizeScale] = useState<number | null>(null);
  /** The paragraph set again at the reader's request (a frame, a line
   * spacing, a size), or null. */
  // A size is set in a frame the request names (the rewrite keeps it): the
  // paragraph's own right edge, points of the page, unless it was resized.
  const paragraphOwnRight = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!initialLayout || matrix?.length !== 6 || !(matrix[0] > 0)) return null;
    const right = Math.round(((Number(initialLayout.box.x) + Number(initialLayout.box.width)) *
      initialLayout.pageWidthPx - matrix[4]) / matrix[0] * 1e4) / 1e4;
    return Number.isFinite(right) ? right : null;
  }, [initialLayout]);
  // The text box the line was typed into (wrapFrameRight): its right edge,
  // points of the page, the frame the paragraph is set in -- written by the
  // paragraph rewrite in that frame, as a frame the reader drew. Written
  // without it, the words typed ran on one row to the page's margin, far
  // past the box they were typed in.
  const handoffFrameRight = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (wrapFrameRight === null || !initialLayout || matrix?.length !== 6 || !(matrix[0] > 0)) return null;
    const right = Math.round((wrapFrameRight * initialLayout.pageWidthPx - matrix[4]) / matrix[0] * 1e4) / 1e4;
    return Number.isFinite(right) ? right : null;
  }, [initialLayout, wrapFrameRight]);
  // The words the paragraph already stands in that box's frame with: the
  // writer answered that setting them in it again changes nothing (its
  // preview's refusal, below). The box's frame is then no request of these
  // words -- it is one again as soon as they change. Asked for as long as
  // the line stood open, a line written into a text box and opened again
  // read as changed with nothing to write: its Leave waited for a preview
  // that had already answered, the editor stayed over the page and the
  
  const [handoffFrameStandsFor, setHandoffFrameStandsFor] = useState<string | null>(null);
  const handoffFrameAsked = handoffFrameStandsFor === replacementText ? null : handoffFrameRight;
  const paragraphFrameRequest = useMemo<PdfNativeParagraphFrameRequest | null>(() => {
    if (paragraphFrameRight === null && paragraphLineStep === null && paragraphSizeScale === null &&
      handoffFrameAsked === null) return null;
    const right = paragraphFrameRight ?? (paragraphSizeScale !== null ? paragraphOwnRight : null) ?? handoffFrameAsked;
    return Object.freeze({
      ...(right !== null ? { right } : {}),
      ...(paragraphLineStep !== null ? { lineStep: paragraphLineStep } : {}),
      ...(paragraphSizeScale !== null ? { sizeScale: paragraphSizeScale } : {}),
    });
  }, [paragraphFrameRight, paragraphLineStep, paragraphSizeScale, paragraphOwnRight, handoffFrameAsked]);
  // A box no run property states: its formats are previewed as the write
  // Leave makes of them (onDetachRowFormat's arguments), so the preview of a
  // format pressed is that format, and the key names them.
  const comparedPropertyBaseline = propertyBaseline ?? (properties ? moveOnlyBaseline : null);
  const propertyDraftChanged = !samePropertyDraft(comparedPropertyBaseline, properties);
  // A line in the middle of its page typed longer or shorter is set again
  // as a centred paragraph (the box's format, centred), keeping its middle
  // as Word and WPS keep a centred paragraph's; written in place it grew
  // from where it started, a title typed on ran to the page's edge (IPCC
  
  // the page show it centred as it is typed.
  const centredLine = Boolean(!openedOnNewBox && initialLayout && !bodyLine &&
    !initialLayout.promoted &&
    !initialLayout.fallbackText && !initialLayout.sourceInputLayout?.breaks.length &&
    pdfNativeLineCentredOnPage(initialLayout.box) && Math.abs(normalizeBoxAngle(initialLayout.box.angle ?? 0)) <= 0.001 &&
    (retainedAlignment === "left" || retainedAlignment === "center") &&
    !/[\r\n]/u.test(originalText) && !/[\r\n]/u.test(replacementText) && replacementText.trim() &&
    replacementText !== originalText && paragraphChanges === null && paragraphFrameRequest === null &&
    !propertyDraftChanged);
  const centredRetype = centredLine && Boolean(onApplyRowFormat ?? onApplyParagraphFormat);
  // The draft is laid out as that write before the line's proof is in too
  
  // grew to the right from where it started, and moved back to its middle
  
  const centredDraft = centredRetype || (centredLine && preparationPending && !preparationFailed);
  // A line flush with the page's right margin typed longer or shorter is set
  // again right-aligned, keeping its right edge as Word keeps a right-aligned
  // paragraph's: set in place it grew past the margin, and a form's line at
  
  const rightLine = Boolean(!openedOnNewBox && !centredLine && rightFlushLine && initialLayout &&
    !initialLayout.promoted &&
    !initialLayout.fallbackText && !initialLayout.sourceInputLayout?.breaks.length &&
    Math.abs(normalizeBoxAngle(initialLayout.box.angle ?? 0)) <= 0.001 &&
    (retainedAlignment === "left" || retainedAlignment === "right") &&
    !/[\r\n]/u.test(originalText) && !/[\r\n]/u.test(replacementText) && replacementText.trim() &&
    replacementText !== originalText && paragraphChanges === null && paragraphFrameRequest === null &&
    !propertyDraftChanged);
  const rightRetype = rightLine && Boolean(onApplyRowFormat ?? onApplyParagraphFormat);
  const rightDraft = rightRetype || (rightLine && preparationPending && !preparationFailed);
  /** Set again aligned where the line stands (centred, or flush right). */
  const alignedRetype = centredRetype || rightRetype;
  /** The box's format as Leave writes it: the formats chosen, centred where
   * the line is (centredRetype). */
  const boxRowFormat = useMemo<PdfNativeRowFormat | null>(() => centredRetype
    ? Object.freeze({ ...(rowFormat ?? {}), alignment: "center" as const })
    : rightRetype ? Object.freeze({ ...(rowFormat ?? {}), alignment: "right" as const }) : rowFormat,
  [centredRetype, rightRetype, rowFormat]);
  






  const boxFormatIsRetypeOnly = alignedRetype && rowFormat === null;
  const boxFormatIsRetypeOnlyRef = useRef(boxFormatIsRetypeOnly);
  boxFormatIsRetypeOnlyRef.current = boxFormatIsRetypeOnly;
  

  // A paragraph of several rows one run draws (its proof states the run):
  // its paragraph settings are the paragraph's to set again, line by line.
  // (Several rows by its frame: the reader often reads such a paragraph as
  // one row of text joined by spaces, with no measured line step.)
  const severalRowsBox = Boolean(initialLayout && !initialLayout.promoted &&
    Number(initialLayout.box.height) > Number(initialLayout.box.fontSize) * 1.5);
  const propertyParagraph = Boolean(!onApplyRowFormat && onApplyParagraphFormat && propertyProof && severalRowsBox);
  // A run of right-to-left text drawn in a bold face of its own, its proof
  // the run's (one show): its bold is taken off by its paragraph's writer --
  // the box's words set again in the family's regular face where they stand,
  // where the engine says they can be (boxDrawnStyle.regularFace) -- never by
  // the run's own, which sets no glyph of text the reader reorders. The
  // press records it as the box's format (boldFaceRunPress, below).
  const boldFaceRun = Boolean(propertyProof) && boxDrawnStyle?.boldFaces === "only" && pdfTextHasRightToLeftRun(originalText);
  const boldFaceRunSetRegular = boldFaceRun && boxDrawnStyle?.regularFace === true && rowFormat?.bold === false;
  // A run of Type3 letters that take a weight by their show drawn again
  // (type3TakesWeight), its proof the run's: the weight is no property of
  // the run -- a Type3 glyph takes no stroke -- and is written by its
  // paragraph's writer, where the text stands. The press records it as the
  // box's format (below), and Leave asks it of that writer.
  const type3WeightRun = Boolean(propertyProof) && Boolean(initialLayout?.type3Text) && type3TakesWeight === true;
  const type3WeightRunAsked = type3WeightRun && rowFormat?.bold !== undefined;
  const applyBoxFormat = onApplyRowFormat ??
    (alignedRetype || propertyParagraph || boldFaceRunSetRegular || type3WeightRunAsked ? onApplyParagraphFormat : undefined);
  const detachBoxFormat = onDetachRowFormat ??
    (alignedRetype || propertyParagraph || boldFaceRunSetRegular || type3WeightRunAsked ? onDetachParagraphFormat : undefined);
  const boxFormatPreview = useMemo(() => {
    if ((properties !== null && !alignedRetype && !propertyParagraph) || !boxRowFormat || !applyBoxFormat) return null;
    // A scanned line's own rules are drawn beside its words as they stand:
    // no paragraph of it is set again, and its draft shows them meanwhile.
    if (coverLaneLine && pdfNativeCoverRulesAsk(boxRowFormat)) return null;
    const typed = replacementText !== originalText;
    return Object.freeze({ asked: typed ? rowFormatWithParts(boxRowFormat, partFormats) : boxRowFormat,
      ...(typed ? { typedText: replacementText } : {}) });
  }, [properties, alignedRetype, propertyParagraph, boxRowFormat, applyBoxFormat, replacementText, originalText, partFormats,
    coverLaneLine]);
  const previewDraftKey = useMemo(
    () => JSON.stringify(paragraphFrameRequest === null
      ? [replacementText, properties, paragraphChanges, ...(boxFormatPreview ? [boxFormatPreview.asked] : [])]
      : [replacementText, properties, paragraphChanges, paragraphFrameRequest]),
    [properties, replacementText, paragraphChanges, paragraphFrameRequest, boxFormatPreview],
  );
  // A native move keeps every text property; only the text-matrix origin
  // changes. Layout predicates must not read it as a reflow-worthy change.
  const propertyLayoutDraftChanged = !samePropertyDraft(
    comparedPropertyBaseline,
    properties ? stripPropertyMove(properties) : properties,
  );
  // A format that moves no glyph (a colour, a bold drawn as a stroke, a rule,
  // on the run or on a part of it) is written in place at the run's own
  // advances: the line keeps its one row, its frame and its glyph places
  // while it is drafted. Read as a reflow, the draft was laid out again by
  // the browser at the face's natural advances -- a line the PDF sets
  // tighter stood 8 px wider, its frame grown, from the press until the page
  
  // 4 s on a loaded machine).
  // The baseline is the proof's, and the proof is away for a moment whenever
  // the copy's head moves under an open editor (the line left before this
  // one was saved: this line is proved again on the new revision). The
  // formats pressed meanwhile were then compared with nothing, read as a
  
  
  // lines formatted in a row, 47 px wide of where it was then set). The
  // line's last baseline answers until the proof is back.
  const heldPropertyBaselineRef = useRef<{ line: string; baseline: PdfNativeTextPropertyDraft; slanted: boolean } | null>(null);
  const propertyBaselineLine = `${initialLayout?.box.id ?? ""}\n${originalText}`;
  if (comparedPropertyBaseline && propertyProof) {
    heldPropertyBaselineRef.current = { line: propertyBaselineLine, baseline: comparedPropertyBaseline,
      slanted: pdfNativeTextMatrixIsSlanted(propertyProof.original.textMatrixLinear) };
  }
  const heldPropertyBaseline = !comparedPropertyBaseline && properties &&
    heldPropertyBaselineRef.current?.line === propertyBaselineLine ? heldPropertyBaselineRef.current : null;
  const classifiedPropertyBaseline = comparedPropertyBaseline ?? heldPropertyBaseline?.baseline ?? null;
  const classifiedRunSlanted = properties?.textMatrixLinear ? pdfNativeTextMatrixIsSlanted(properties.textMatrixLinear)
    : propertyProof ? pdfNativeTextMatrixIsSlanted(propertyProof.original.textMatrixLinear)
      : heldPropertyBaseline?.slanted ?? false;
  const lookOnlyPropertyChange = Boolean(propertyLayoutDraftChanged && properties && classifiedPropertyBaseline &&
    (propertyProof || heldPropertyBaseline) &&
    nativeTextDraftKeepsAdvances(classifiedPropertyBaseline, stripPropertyMove(properties), classifiedRunSlanted));
  // A part set in another face, or leaned, sets only its own glyphs again:
  // the line keeps its row and its frame, and its draft keeps every other
  // glyph where the page has it (the part's characters leave their boxes,
  // embeddedDraftRanges `frees`). The whole line laid out again by the
  // browser stood 8 px narrower than the page sets it until the write was
  
  const partFaceOnlyPropertyChange = Boolean(propertyLayoutDraftChanged && !lookOnlyPropertyChange && properties &&
    classifiedPropertyBaseline && (propertyProof || heldPropertyBaseline) &&
    nativeTextDraftKeepsAdvances(classifiedPropertyBaseline, stripPropertyMove(properties), classifiedRunSlanted,
      { partFaces: true }));
  const propertyReflowDraftChanged = propertyLayoutDraftChanged && !lookOnlyPropertyChange && !partFaceOnlyPropertyChange;
  const nativeMoveSupported = Boolean(
    ((propertyProof && propertyBaseline) || moveOnlyBaseline) && initialLayout && !initialLayout.promoted &&
    initialLayout.pdfToCssTransform?.length === 6 &&
    initialLayout.pageWidthPx > 0 && initialLayout.pageHeightPx > 0 &&
    !/[\r\n]/.test(originalText),
  );
  // Resizing a frame never scales its text (WPS: the frame follows the text,
  // the text keeps its size and re-wraps). A resize therefore always leaves
  
  // native rewrite of the run's text-matrix origin.
  //
  // A box a group proof covers used to resize as one: the dragged frame was
  // mapped onto the new one in the page's own axes (text-group-move.ts), the
  // text scaled with it. That map is kept only for moving a draft that
  // already carries a group scale; a resize no longer produces one.
  const groupBaseline = propertyProof ? propertyBaseline : nativeGroupMoveProof?.baseline ?? null;
  const groupScaleSupported = Boolean(
    nativeGroupMoveProof && groupBaseline && initialLayout && !initialLayout.promoted &&
    initialLayout.pdfToCssTransform?.length === 6 &&
    initialLayout.pageWidthPx > 0 && initialLayout.pageHeightPx > 0 &&
    initialLayout.box.width > 0 && initialLayout.box.height > 0,
  );
  const groupDraftWithScale = useCallback((rect: BoxRect): PdfNativeTextPropertyDraft | null => {
    if (!groupScaleSupported || !initialLayout || !groupBaseline) return null;
    // A box only the group proof covers keeps the weight its draft set (the
    // group's synthetic bold rides the same write); any other change of a
    // property is not a group map.
    const weight = !propertyProof ? propertyOverride?.syntheticBold : undefined;
    const unweighted = (draft: PdfNativeTextPropertyDraft) => !propertyProof
      ? { ...stripPropertyMove(draft), syntheticBold: undefined } : stripPropertyMove(draft);
    if (propertyOverride && !samePropertyDraftValues(unweighted(propertyOverride), unweighted(groupBaseline))) {
      return null;
    }
    const matrix = initialLayout.pdfToCssTransform!;
    const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;
    // A corner of a frame (fractions of the page) in the page's user space.
    const toPage = (x: number, y: number) => {
      const cssX = x * initialLayout.pageWidthPx - matrix[4];
      const cssY = y * initialLayout.pageHeightPx - matrix[5];
      return [(cssX * matrix[3] - cssY * matrix[2]) / determinant, (cssY * matrix[0] - cssX * matrix[1]) / determinant];
    };
    const frame = (x: number, y: number, width: number, height: number) => {
      const [x0, y0] = toPage(x, y);
      const [x1, y1] = toPage(x + width, y + height);
      return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    };
    const box = initialLayout.box;
    const from = frame(Number(box.x), Number(box.y), Number(box.width), Number(box.height));
    const to = frame(rect.x, rect.y, rect.width, rect.height);
    const scaleX = Number(((to[2] - to[0]) / (from[2] - from[0])).toFixed(6));
    const scaleY = Number(((to[3] - to[1]) / (from[3] - from[1])).toFixed(6));
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) ||
      scaleX <= 0.05 || scaleY <= 0.05 || scaleX > 20 || scaleY > 20) return null;
    const moveX = Number((to[0] - scaleX * from[0]).toFixed(4));
    const moveY = Number((to[1] - scaleY * from[1]).toFixed(4));
    const base = weight === undefined ? stripPropertyMove(groupBaseline)
      : { ...stripPropertyMove(groupBaseline), syntheticBold: weight };
    if (scaleX === 1 && scaleY === 1) return moveX === 0 && moveY === 0 ? base : { ...base, moveX, moveY };
    return { ...base, moveX, moveY, groupScale: { x: scaleX, y: scaleY } };
  }, [groupScaleSupported, initialLayout, groupBaseline, propertyOverride, propertyProof]);
  






  const groupDraftWithTurn = useCallback((start: Readonly<{ draft: PdfNativeTextPropertyDraft; rect: BoxRect }>,
    degrees: number): PdfNativeTextPropertyDraft | null => {
    if (!groupScaleSupported || !initialLayout || !groupBaseline) return null;
    const matrix = initialLayout.pdfToCssTransform!;
    const [m0, m1, m2, m3] = matrix;
    const determinant = m0 * m3 - m1 * m2;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;
    type Linear = readonly [number, number, number, number];
    const times = (x: Linear, y: Linear): Linear => [x[0] * y[0] + x[1] * y[2], x[0] * y[1] + x[1] * y[3],
      x[2] * y[0] + x[3] * y[2], x[2] * y[1] + x[3] * y[3]];
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    // The turn on screen (y down, clockwise) read in the page's user space.
    const turn = times(times([m0, m1, m2, m3], [cos, sin, -sin, cos]),
      [m3 / determinant, -m1 / determinant, -m2 / determinant, m0 / determinant]);
    const cssX = (start.rect.x + start.rect.width / 2) * initialLayout.pageWidthPx - matrix[4];
    const cssY = (start.rect.y + start.rect.height / 2) * initialLayout.pageHeightPx - matrix[5];
    const qx = (cssX * m3 - cssY * m2) / determinant, qy = (cssY * m0 - cssX * m1) / determinant;
    const draft = start.draft;
    const before: Linear = draft.groupLinear ?? [draft.groupScale?.x ?? 1, 0, 0, draft.groupScale?.y ?? 1];
    const linear = times(before, turn);
    const tx = draft.moveX ?? 0, ty = draft.moveY ?? 0;
    const moveX = tx * turn[0] + ty * turn[2] + qx - (qx * turn[0] + qy * turn[2]);
    const moveY = tx * turn[1] + ty * turn[3] + qy - (qx * turn[1] + qy * turn[3]);
    const round = (value: number, places: number) => {
      const rounded = Number(value.toFixed(places));
      return Object.is(rounded, -0) ? 0 : rounded;
    };
    if (![...linear, moveX, moveY].every(Number.isFinite)) return null;
    const { groupScale: _scale, ...rest } = draft;
    void _scale;
    return { ...rest, moveX: round(moveX, 4), moveY: round(moveY, 4),
      groupLinear: linear.map((value) => round(value, 6)) as unknown as Linear };
  }, [groupScaleSupported, initialLayout, groupBaseline]);
  const propertyDraftWithMove = useCallback((rect: BoxRect): PdfNativeTextPropertyDraft | null => {
    const moveBase = propertyOverride ?? propertyBaseline ?? moveOnlyBaseline;
    if (!nativeMoveSupported || !initialLayout || !moveBase) return null;
    const matrix = initialLayout.pdfToCssTransform!;
    // pdfToCssTransform maps PDF user space to CSS pixels at the initial page
    // size (row-vector convention); invert its linear part for the delta.
    const cssDx = (rect.x - initialLayout.box.x) * initialLayout.pageWidthPx;
    const cssDy = (rect.y - initialLayout.box.y) * initialLayout.pageHeightPx;
    const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;
    const moveX = Number(((cssDx * matrix[3] - cssDy * matrix[2]) / determinant).toFixed(4));
    const moveY = Number(((cssDy * matrix[0] - cssDx * matrix[1]) / determinant).toFixed(4));
    const base = stripPropertyMove(moveBase);
    return moveX === 0 && moveY === 0 ? base : { ...base, moveX, moveY };
  }, [nativeMoveSupported, initialLayout, propertyBaseline, propertyOverride, moveOnlyBaseline]);
  const fontDraftChanged = managedFontChanged || managedStyleChanged || propertyChoice?.fontResourceName !== propertyBaseline?.fontResourceName;
  const contentDraftDirty =
    replacementText !== originalText || propertyDraftChanged || paragraphChanges !== null || managedTypographyDirty ||
    layoutVerticalAlign !== layoutVerticalAlignBaseline;
  /** Whether the draft can set the line wider than the source sets it
   * (new text, a larger size, another face...): only then is the browser's
   * measure of it read for an overflow of the box. */
  // (A bold drawn as a stroke thickens the glyphs where they stand: no
  // advance grows, and the browser's measure of a draft that is the source's
  // text in the source's places is the page's own -- lookOnlyPropertyChange.)
  const draftMayWiden = replacementText !== originalText || paragraphChanges !== null || managedTypographyDirty ||
    (nativeTextDraftMayWiden(comparedPropertyBaseline, properties) && !lookOnlyPropertyChange);
  const [metrics, setMetrics] = useState<InlineEditorMetrics | null>(null);
  const [pageViewportSize, setPageViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [sourceLineFitScale, setSourceLineFitScale] = useChangedState(1);
  const [measuredContentHeight, setMeasuredContentHeight] = useChangedState(0);
  /** The rows a saved text box's own text took when it opened, as the draft
   * sets it in the box (null until measured, and for a source line). */
  const [openedBoxRowsMeasure, setOpenedBoxRows] = useChangedState<Readonly<{ key: string; rows: number }> | null>(null);
  const openedBoxKey = `${sourceInitialLayout?.box.id ?? ""}\u0000${sourceOriginalText}`;
  const openedBoxRows = openedBoxRowsMeasure?.key === openedBoxKey ? openedBoxRowsMeasure.rows : null;
  



  const [draftOverflowsBox, setDraftOverflowsBox] = useChangedState(false);
  

  const [draftNaturalWidth, setDraftNaturalWidth] = useChangedState(0);
  /** The draft's widest word as the frame would hold it (page pixels): a
   * word wider than the room beside the line cannot wrap there. */
  const [draftWidestWord, setDraftWidestWord] = useChangedState(0);
  const [measuredMinimumWidth, setMeasuredMinimumWidth] = useChangedState(0);
  // Bumped when the PDF's own East Asian face arrives, so the draft is
  // measured again in the glyphs the saved box is drawn with.
  const [eastAsianFaceEpoch, setEastAsianFaceEpoch] = useState(0);
  // Fetched when a line opens, not at the first CJK letter: the 10 MB face
  // took seconds to arrive, and until it did the typed characters were drawn
  // in the system's face and changed shape under the reader's eyes.
  // (Development timing: the commit's layout effects and passive effects, first and last.)
  useLayoutEffect(() => { markPdfTextLatency("editor.layout-start"); });
  useEffect(() => { markPdfTextLatency("editor.effects-start"); });
  useEffect(() => {
    if (pdfEastAsianFaceStatus() !== "idle") return;
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) idle(() => { void ensurePdfEastAsianFace(); }, { timeout: 1500 });
    else setTimeout(() => { void ensurePdfEastAsianFace(); }, 300);
  }, []);
  useEffect(() => {
    if (!needsEastAsianFace(replacementText) || pdfEastAsianFaceStatus() === "available") return;
    let live = true;
    void ensurePdfEastAsianFace().then((available) => {
      if (live && available) setEastAsianFaceEpoch((epoch) => epoch + 1);
    });
    return () => { live = false; };
  }, [replacementText]);
  const minimumWidthMeasurementRef = useRef<{key:string; value:number|null} | null>(null);
  const [baselineOffset, setBaselineOffset] = useState(0);
  const [inlineEditorHost, setInlineEditorHost] = useState<
    HTMLElement | null | undefined
  >(undefined);
  const [ribbonHost, setRibbonHost] = useState<HTMLElement | null>(null);
  const [ribbonPainted, setRibbonPainted] = useState(false);
  useEffect(() => {
    if (!paintRibbonAfterFocus || ribbonPainted) return;
    let live = true;
    void afterPdfTextInteractionPaint().then(() => { if (live) setRibbonPainted(true); });
    return () => { live = false; };
  }, [paintRibbonAfterFocus, ribbonPainted]);
  const [submitting, setSubmitting] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useChangedState<string | null>(null);
  const [commitError, setCommitError] = useChangedState<string | null>(null);
  /** A change of this line was handed to the writer: the source span it was
   * opened on stands for the page as it was, until the reader reads the
   * new bytes (see the inline host's cleanup). */
  const changeAppliedRef = useRef(false);
  /** Where the frame stood when its finish was asked for (client px). */
  const finishFrameRectRef = useRef<DOMRect | null>(null);
  /** Characters this line can be set in by its compile: its own words, and
   * those an exact preview of a draft has set. Words with any other (a
   * character the embedded font may not draw, which needs the server's
   * font extension) are finished here, not by the window. */
  const provenCharactersRef = useRef<Set<string> | null>(null);
  


  const compiledOnceRef = useRef(false);
  /** The format an exact preview of this line has set in place: a draft in
   * that format is one the window can finish too. */
  const provenPropertiesKeyRef = useRef<string | null>(null);
  if (provenCharactersRef.current === null) provenCharactersRef.current = new Set(Array.from(originalText ?? ""));
  useEffect(() => {
    if (openFrameRectRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!openFrameRectRef.current && layoutFrameRef.current?.isConnected)
        openFrameRectRef.current = layoutFrameRef.current.getBoundingClientRect();
    });
    return () => cancelAnimationFrame(frame);
  });
  /** Where the frame stood when the line opened (read a frame later, so the
   * opening forces no layout). */
  const openFrameRectRef = useRef<DOMRect | null>(null);
  /** The lifted block's picture while it is shown (move-lift). */
  const moveLiftImageRef = useRef<HTMLImageElement | null>(null);
  const carryMoveLiftOnSurfaceRef = useRef<() => (() => void) | null>(() => null);
  // The draft whose last finish could not be saved. Its chrome comes back at
  // once, and a second click away from a moved-only box puts it back.
  const [failedFinishKey, setFailedFinishKey] = useState<string | null>(null);
  const [finishRequested, setFinishRequested] = useChangedState<string | null>(null);
  // Text Editing commands pressed before the line's proof arrived
  // (nativeTextRibbonPressHeld), run in order once it has, and a finish
  // asked for while they were held: it runs after them, on the draft they
  // make, instead of closing the line on the reader's clicks.
  const [queuedRibbonActions, setQueuedRibbonActions] =
    useState<readonly QueuedNativeTextRibbonAction[]>([]);
  const queuedRibbonActionsRef = useRef(queuedRibbonActions);
  queuedRibbonActionsRef.current = queuedRibbonActions;
  // The formats the window kept of this line from before it went (a reload,
  // a browser that went down with the line open), handed back by
  // `restoreFormats` and waiting for the line's proof.
  const [formatRestore, setFormatRestore] = useState<Readonly<{
    draft: PdfNativeTextFormatDraft; words?: string; settle: (restored: boolean | null) => void }> | null>(null);
  const formatRestoreRef = useRef(formatRestore);
  formatRestoreRef.current = formatRestore;
  const restoreFormatsRef = useRef<(formats: PdfNativeTextFormatDraft, words?: string) => Promise<boolean | null>>(() => Promise.resolve(false));
  restoreFormatsRef.current = (formats, words) => new Promise<boolean | null>((resolve) => {
    // (Read back from where the window kept them: taken only in their shape.)
    const draft = readPdfNativeTextFormatDraft(formats);
    if (!draft) { resolve(false); return; }
    // (A later hand-back takes the place of one not taken yet.)
    formatRestoreRef.current?.settle(null);
    setFormatRestore(Object.freeze({ draft, ...(words !== undefined ? { words } : {}), settle: resolve }));
  });
  // Closed with them still waiting: not refused -- the line's next editor's.
  useEffect(() => () => formatRestoreRef.current?.settle(null), []);
  const [finishAfterQueuedActions, setFinishAfterQueuedActions] = useChangedState(false);
  // The text's own right-click menu (WPS: 复制 · 剪切 · 粘贴 · 粘贴为无格式文本 ·
  // 删除 | 全选), where it was opened and whether text was selected then;
  // `block`: opened on the block selected as an object, whose commands take
  // the whole of it.
  // WPS's 插入符号: the shared Office Symbol dialog over the line, its
  // character typed at the selection the press found.
  const [symbolDialog, setSymbolDialog] = useState<{ start: number; end: number } | null>(null);
  const [recentSymbols, setRecentSymbols] = useState<readonly string[]>([]);
  const [textContextMenu, setTextContextMenu] =
    useState<Readonly<{ x: number; y: number; selected: boolean; block?: boolean }> | null>(null);
  // The selection as a range of the run's text while it is part of the text
  // only: a format put on it splits the run (lib/pdf/native-text-segments.ts),
  // and the ribbon shows that part's format.
  const [partialRange, setPartialRange] = useChangedState<Readonly<{ start: number; end: number }> | null>(null);
  // The caret as an offset of the run's text while nothing is selected.
  const [caretAt, setCaretAt] = useChangedState<number | null>(null);
  const syncPartialRangeRef = useRef<(() => void) | null>(null);
  const stepLineHistoryRef = useRef<(direction: "undo" | "redo") => boolean>(() => false);
  useEffect(() => {
    const sync = () => syncPartialRangeRef.current?.();
    const selectionChanged = () => {
      // Only the box's own selection (the document's event names no target).
      if (inputRef.current && document.activeElement === inputRef.current) sync();
    };
    document.addEventListener("selectionchange", selectionChanged);
    window.addEventListener("pointerup", sync, true);
    return () => {
      document.removeEventListener("selectionchange", selectionChanged);
      window.removeEventListener("pointerup", sync, true);
    };
  }, []);
  // Live Preview: what the font, size or colour under the pointer would do
  // to the selected characters (input offsets), drawn in the draft over the
  // page until the pointer leaves (nativeFormatPreviewAdapter).
  const [formatPreview, setFormatPreview] = useState<PdfTextDraftFormatPreview | null>(null);
  // The look a pressed command previewed, kept on the draft until the
  // command lands (a part's format goes with the line into the text-box
  
  // and the preview left with the pointer -- the click looked ignored and
  
  // when it cannot, or when the text changes.
  const [stickyFormatPreview, setStickyFormatPreview] = useChangedState<PdfTextDraftFormatPreview | null>(null);
  const shownFormatPreview = formatPreview ?? stickyFormatPreview;
  const [hoverExactShown, setHoverExactShown] = useChangedState(false);
  // 格式刷 (lib/pdf/native-text-format-painter.ts): the window this line is
  // edited in, the painter armed there, and the paint this line takes when
  // it opened with one armed (applied once its proof is here, then written).
  const [painterWindowId] = useState<string | null>(() =>
    (ribbonRootRef?.current ?? returnFocusRef.current?.closest<HTMLElement>(".pdf-page-window"))
      ?.closest<HTMLElement>("[data-window-id]")?.dataset.windowId ?? null);
  const formatPainter = usePdfNativeTextFormatPainter(painterWindowId);
  const [pendingPaint, setPendingPaint] = useState<PdfNativeTextFormatPainter | null>(() =>
    readPdfNativeTextFormatPainter(painterWindowId));
  // The draft whose exact preview the native writer declined (a planner
  
  const [nativeRefusalDraftKey, setNativeRefusalDraftKey] = useState<string | null>(null);
  // The draft whose native write the server refused (`serverRefusal`): its
  // refusal stands for that draft even when its exact preview plans again.
  const serverRefusedDraftRef = useRef<Readonly<{ id: string; draftKey: string; message: string }> | null>(null);
  const [serverRefusalFinishKey, setServerRefusalFinishKey] = useChangedState<string | null>(null);
  const [serverRefusedDraftKey, setServerRefusedDraftKey] = useChangedState<string | null>(null);
  // The draft whose format of part of the run the run cannot be split for
  // (a kerned title): its reason shows beside the box, where the reader is
  // looking, not only in the ribbon's status line.
  const [partFormatRefusalKey, setPartFormatRefusalKey] = useState<string | null>(null);
  const [refusalFallbackKey, setRefusalFallbackKey] = useState<string | null>(null);
  const rawDisplayedError = error ?? commitError;
  const displayedError = rawDisplayedError
    ? pdfReaderRefusalText(nativeTextPropertyErrorMessage(rawDisplayedError, translate), translate)
    : rawDisplayedError;
  const saveFailedMessage = translate("pdf.nativeTextEdit.saveFailed");
  const [composing, setComposing] = useState(false);
  





  const draftCaretGeometryRef = useRef<PdfTextSourceAppearance | null>(null);
  const [draftCaretDrawn, setDraftCaretDrawn] = useChangedState(false);
  /** The line's own glyph geometry as the last render placed the caret
   * with it (null when the draft's boxes must): read by the layout
   * measurement, which skips the draft's boxes while it is there. */
  const nativeCaretGeometryRef = useRef<PdfTextSourceAppearance | null>(null);
  /** Whether the exact preview's layer shows, as the last render had it:
   * read by the layout pass, which hands the caret the draft's boxes only
   * when they are what it draws. */
  const candidateLayerShownRef = useRef(false);
  /** The layout measurement of the current draft (set by its effect), run
   * again when the line's glyph geometry goes away so the draft's boxes
   * place the caret from then on. */
  const measureLayoutRef = useRef<(() => void) | null>(null);
  const [editingSurfaceStatus, setEditingSurfaceStatus] =
    useState<NativeTextEditingSurfaceStatus>("pending");
  const [layoutRect, setLayoutRect] = useState<BoxRect | null>(() =>
    initialLayout
      ? {
          x: initialLayout.box.x,
          y: initialLayout.box.y,
          width: initialLayout.box.width,
          height: initialLayout.box.height,
        }
      : null,
  );
  const [layoutAngle, setLayoutAngle] = useState(() =>
    normalizeBoxAngle(initialLayout?.box.angle),
  );
  const [manualLayoutDirty, setManualLayoutDirty] = useState(false);
  const manualLayoutDirtyRef = useRef(manualLayoutDirty);
  manualLayoutDirtyRef.current = manualLayoutDirty;
  /** The reader set the paragraph's frame by hand (its rows set again in
   * it), not only typed: the old box no longer outlines the text. */
  const paragraphFrameSetRef = useRef(false);
  paragraphFrameSetRef.current = paragraphFrameRight !== null;
  // A box moved before its line's proof is here (preparationPending): the
  // frame follows the pointer, and the move is written as the native move
  // the proof allows once it arrives, as WPS moves a block. Sent to the
  
  // set in a substitute face, its two rows joined and re-wrapped at the box
  
  const [moveAwaitingProof, setMoveAwaitingProof] = useState(false);
  const [resizeAwaitingProof, setResizeAwaitingProof] = useState(false);
  const [pendingMoveBy, setPendingMoveBy] = useState<Readonly<{ dx: number; dy: number }> | null>(null);
  const pendingMoveByRef = useRef(pendingMoveBy);
  pendingMoveByRef.current = pendingMoveBy;
  const moveAwaitingProofRef = useRef(moveAwaitingProof);
  moveAwaitingProofRef.current = moveAwaitingProof;
  const resizeAwaitingProofRef = useRef(resizeAwaitingProof);
  resizeAwaitingProofRef.current = resizeAwaitingProof;
  const preparationPendingRef = useRef(preparationPending);
  preparationPendingRef.current = preparationPending;
  // Where the frame stood when the reader first moved it, and the block's
  // own ink lifted off the page there (native-text-move-lift): the moved
  // frame carries it until the moved block is drawn.
  const [moveStartFrame, setMoveStartFrame] = useState<BoxRect | null>(null);
  // The lift as shown. It is shown once its pictures are decoded (the lift
  // cut last is `latestMoveLift`, read in by pictures kept off the page):
  // put up as cut, the block's draft went out the moment the lift was
  // known and its picture came a frame later -- a long frame on a loaded
  
  
  const [moveLift, setMoveLift] = useState<(PdfNativeTextMoveLift & Readonly<{ frame: BoxRect; id: number }>) | null>(null);
  const [latestMoveLift, setLatestMoveLift] =
    useState<(PdfNativeTextMoveLift & Readonly<{ frame: BoxRect; id: number }>) | null>(null);
  const moveLiftSeqRef = useRef(0);
  const moveLiftDecodedRef = useRef<{ id: number; ink: boolean; cover: boolean } | null>(null);
  const moveLiftPictureDecoded = (lift: PdfNativeTextMoveLift & Readonly<{ frame: BoxRect; id: number }>,
    part: "ink" | "cover", image: HTMLImageElement) => {
    const done = () => {
      const state = moveLiftDecodedRef.current?.id === lift.id ? moveLiftDecodedRef.current
        : (moveLiftDecodedRef.current = { id: lift.id, ink: false, cover: !lift.cover });
      state[part] = true;
      if (state.ink && state.cover) setMoveLift((shown) => (shown && shown.id > lift.id ? shown : lift));
    };
    if (typeof image.decode === "function") void image.decode().then(done, done);
    else done();
  };
  /** The typing cover: the page's background over the line's own glyphs,
   * cut from the page as a lift's cover is, shown on the page itself while
   * the line's clean surface is still on the way (typingCoverShown). */
  const [typingCover, setTypingCover] = useState<Readonly<{ line: string; url: string;
    rect: Readonly<{ x: number; y: number; width: number; height: number }> }> | null>(null);
  /** The cover picture decoded (its URL): the draft shows with it, never before it. */
  const [typingCoverLoaded, setTypingCoverLoaded] = useState<string | null>(null);
  const [layoutDrag, setLayoutDrag] = useState<NativeTextLayoutDrag | null>(
    null,
  );
  const shownFrameRef = useRef<Readonly<BoxRect & { angle: number }> | null>(null);
  shownFrameRef.current = layoutRect ? { ...layoutRect, angle: normalizeBoxAngle(layoutAngle) } : null;
  // The line taken over on another revision of the page (opened while an edit
  // of it was being written, adopted on the revision that has it): the frame
  // stands on its box there, unless the reader set the frame by hand
  // meanwhile. The frame was placed once, when the box opened: a line a move
  // had just been left on kept its frame where the line had stood, empty,
  // while the page drew the line where it was dropped -- and the frame's
  
  // IPCC cover's "Synthesis Report").
  const followedBoxRef = useRef(initialLayout?.box ?? null);
  useLayoutEffect(() => {
    const before = followedBoxRef.current, box = initialLayout?.box ?? null;
    followedBoxRef.current = box;
    if (!before || !box || before === box || manualLayoutDirtyRef.current || layoutDrag) return;
    const was = { x: before.x, y: before.y, width: before.width, height: before.height };
    const now = { x: box.x, y: box.y, width: box.width, height: box.height };
    if (!sameBoxRect(was, now)) setLayoutRect(current => current && sameBoxRect(current, was) ? now : current);
    const turned = normalizeBoxAngle(before.angle), turns = normalizeBoxAngle(box.angle);
    if (Math.abs(turned - turns) > .001) setLayoutAngle(current => Math.abs(normalizeBoxAngle(current) - turned) <= .001 ? turns : current);
  }, [initialLayout, layoutDrag]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreInteractionChromeRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    // A failed commit resolves before React removes the textarea's disabled
    // attribute. Restore its caret after that DOM update, not inside .then().
    if (displayedError && !busy && !submitting) {
      finishPendingRef.current = false;
      restoreInteractionChromeRef.current?.();
      restoreInteractionChromeRef.current = null;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [displayedError, busy, submitting]);
  const layoutFrameRef = useRef<HTMLDivElement | null>(null);
  /** Where a move drag has taken the frame since the state last moved it
   * (NativeTextFrameFollower), and the drag that made its first step. */
  const liveMoveRectRef = useRef<BoxRect | null>(null);
  const followMoveRef = useRef<(() => void) | null>(null);
  const movedDragRef = useRef<NativeTextLayoutDrag | null>(null);
  const restoreFocusOnCloseRef = useRef(true);
  /** The boxes the line moved to as its page was read again, each marked
   * selected when it did. */
  const markedHostsRef = useRef(new Set<HTMLElement>());
  /** The text menu's command left the line: its close keeps the keyboard where
   * that command put it. */
  const menuLeftLineRef = useRef(false);
  const applyingRef = useRef(false);
  const composingRef = useRef(false);
  // PageWindow supplies the current, identity-bound source proof on adoption.
  // As with authoritative drafts in the Docs editor, compare against the
  // previous baseline, not the newly arrived prop. Never remount the input or
  // replace text that the user/IME has already changed.
  useLayoutEffect(() => {
    if (preparationPending || error || (!propertyProof && applyDisabledReason) || composingRef.current ||
      (acceptedSourceText.verified && acceptedSourceText.baseline === originalText)) return;
    if (!userTextInputStartedRef.current &&
      replacementText === acceptedSourceText.baseline) {
      const input = inputRef.current;
      if (input) pendingSourceCaretRef.current = {
        value: input.value, start: input.selectionStart, end: input.selectionEnd,
        direction: input.selectionDirection,
      };
      setReplacementText(originalText);
      setSourceInputLayout(!initialLayout?.promoted &&
        initialLayout?.sourceInputLayout?.text === originalText
        ? initialLayout.sourceInputLayout : null);
    } else if (userTextInputStartedRef.current && sourceInputLayoutRef.current?.text !== replacementText &&
      acceptedSourceText.baseline !== originalText) {
      // The user typed into the provisional text (the text layer's reading,
      // which can leave out what the source draws invisibly: a joiner, a
      // combining mark) before the source settled. The edit is theirs; the
      // characters they never touched are the source's. Replay the edit onto
      // the settled text where it maps, so a letter added at the end does
      // not save as the deletion of a joiner in the middle.
      const replayed = replayDraftOntoSource(acceptedSourceText.baseline, replacementText, originalText);
      if (replayed !== null && replayed !== replacementText) {
        const input = inputRef.current;
        if (input) pendingSourceCaretRef.current = {
          value: input.value, start: input.selectionStart, end: input.selectionEnd,
          direction: input.selectionDirection,
        };
        setReplacementText(replayed);
      }
    }
    setAcceptedSourceText({ baseline: originalText, verified: true });
  }, [preparationPending, error, applyDisabledReason, propertyProof, composing,
    acceptedSourceText, originalText, replacementText, initialLayout]);
  const publishedPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editingSurfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualDraftElementRef = useRef<HTMLDivElement | null>(null);
  // Align Text in the draft: the rows drawn stand where the writer sets
  // them (pdfTextBoxVerticalOffset of the frame's spare height), and the
  // input's caret over them.
  const [draftVerticalOffsetPx, setDraftVerticalOffsetPx] = useChangedState(0);
  const originalTextRef = useRef(originalText);
  originalTextRef.current = originalText;
  const editingSurfaceStatusRef =
    useRef<NativeTextEditingSurfaceStatus>("pending");
  const validatedPreviewDraftKeyRef = useRef<string | null>(null);
  const autoLayoutGrownDraftRef = useRef<string | null>(null);
  // The draft (previewDraftKey) last measured wider than its box; the key of
  // the draft on screen, for the layout effect that measures it.
  const overflowedDraftRef = useRef<string | null>(null);
  // The draft last measured wider than the room its frame can follow
  
  const pastRoomDraftRef = useRef<string | null>(null);
  const previewDraftKeyRef = useRef(previewDraftKey);
  previewDraftKeyRef.current = previewDraftKey;
  const previewGenerationRef = useRef(0);
  // What the last exact preview was asked for, beyond the draft key: the
  // same key at the same size needs no second candidate when only the frame
  // moved or turned.
  const previewInputsRef = useRef<{ host: unknown; signature: string } | null>(null);
  const activePreviewControllerRef = useRef<AbortController | null>(null);
  const activePreviewTimerRef = useRef<number | null>(null);
  /** When the last exact preview was scheduled: an edit after a pause
   * starts its preview at once; within a burst of keys it waits for the
   * pause (one host compile per pause, not one per key). */
  const lastPreviewScheduledAtRef = useRef(Number.NEGATIVE_INFINITY);
  /** The words and the formats the last preview was scheduled for (or the
   * line opened with): a change of formats alone waits for them to settle. */
  const lastPreviewAskedRef = useRef<{ text: string; formats: string } | null>(null);
  const activePreviewStartRef = useRef<(() => void) | null>(null);
  const finishPendingRef = useRef(false);
  /** A Leave was waiting when the writer answered that the text box's frame
   * leaves the line as it is (handoffFrameStandsFor): it finishes clean. */
  const leftWithFrameStandingRef = useRef(false);
  const prepareEditingSurfaceRef = useRef(onPreparePreview);
  const sourcePropertyDraftRef = useRef<PdfNativeTextPropertyDraft | null>(
    propertyProof ? draftFromPropertyProof(propertyProof) : null,
  );
  const suppressedSourceCanvasRef = useRef<{
    canvas: HTMLCanvasElement;
    visibility: string;
  } | null>(null);
  const ownsInlineHost = inlineEditorHost instanceof HTMLElement;
  const pageWidthPixels = Math.max(1, pageViewportSize?.width ?? initialLayout?.pageWidthPx ?? 1);
  const pageHeightPixels = Math.max(1, pageViewportSize?.height ?? initialLayout?.pageHeightPx ?? 1);
  const pageHeightPoints = initialLayout?.pageHeightPoints ?? initialLayout?.pageHeightPx ?? 1;
  // A line turned by a quarter (on a page turned so, or set so) reads along
  // its own axes: the page turned back (boxRectInOwnAxes), where it is
  // upright. Its room, its growth as it is typed on and its wrap are read
  // there, as on an upright page, and its frame -- turned about its centre --
  // keeps its start. Read in the page's axes it had no room and wrapped
  // where the page sets it on one row, and a frame widened from its x grew
  
  // p2 /Rotate 180, p21 /Rotate 270). Any other angle keeps the page's axes.
  const lineTurn = boxQuarterTurn(layoutAngle);
  const lineAxesTurn = lineTurn ?? 0;
  const lineAxesTurnRef = useRef(lineAxesTurn);
  lineAxesTurnRef.current = lineAxesTurn;
  const ownPageSize = pageSizeInOwnAxes(lineAxesTurn, pageWidthPixels, pageHeightPixels);
  const ownPageWidthPixels = ownPageSize.width;
  const ownPageHeightPixels = ownPageSize.height;
  const ownLayoutRect = useMemo<BoxRect | null>(() => layoutRect && lineAxesTurn !== 0
    ? boxRectInOwnAxes(layoutRect, lineAxesTurn, pageWidthPixels, pageHeightPixels) : layoutRect,
  [layoutRect, lineAxesTurn, pageWidthPixels, pageHeightPixels]);
  const sourceFrameFontPixels = Number(initialLayout?.box.fontSize) * pageHeightPixels;
  const usesSourceFrameFont = !initialLayout?.promoted && !propertyProof &&
    Number.isFinite(sourceFrameFontPixels) && sourceFrameFontPixels > 0;
  
  // not state for it) is drawn and measured at that size. Drawn at its old
  // one, a title made 20 pt read as fitting its 16 pt box, kept that width,
  // and the writer folded it in two over the line below (PDF AI eval V1-T04).
  const managedSourceFrameScale = managedLayoutTypography && managedFontSize !== null && managedSizeBaseline > 0
    ? managedFontSize / managedSizeBaseline : 1;
  // A paragraph set again at another size (paragraphSizeScale) is edited
  // at that size, on its line steps scaled with it, as its preview draws it.
  const paragraphDraftScale = paragraphSizeScale !== null && !initialLayout?.promoted && !manualLayoutDirty
    ? paragraphSizeScale : 1;
  const draftFontSizePixels = initialLayout?.promoted
    ? (properties?.fontSize ?? managedFontSize ?? Number(initialLayout.box.fontSize) * pageHeightPoints) / pageHeightPoints * pageHeightPixels
    : paragraphDraftScale * (usesSourceFrameFont
      ? sourceFrameFontPixels * managedSourceFrameScale
    : nativeTextDraftFontSizePixels(
    metrics,
    propertyProof,
    properties,
  ));
  const draftLineHeightPixels = (() => {
    if (initialLayout?.promoted) return draftFontSizePixels *
      (pdfSourceTextBoxLineHeightRatio(initialLayout.sourceText) ?? PDF_TEXTBOX_LINE_HEIGHT_RATIO);
    if (paragraphLineStep !== null && !manualLayoutDirty) return paragraphLineStep * pageHeightPixels / pageHeightPoints;
    if (sourceInputLayout && !manualLayoutDirty) {
      return paragraphDraftScale * sourceInputLayout.lineHeightPoints * pageHeightPixels / pageHeightPoints;
    }
    if (usesSourceFrameFont) return draftFontSizePixels * PDF_TEXTBOX_LINE_HEIGHT_RATIO;
    const measured = Number.parseFloat(metrics?.lineHeight ?? "");
    return Number.isFinite(measured) && measured > 0
      ? measured
      : draftFontSizePixels * 1.2;
  })();
  const layoutVerticalSafetyPixels = nativeTextFrameVerticalSafetyPixels(
    draftFontSizePixels,
    draftLineHeightPixels,
  );
  const nativeSingleLineFits = useMemo(() =>
    !initialLayout?.promoted && !sourceInputLayout && !manualLayoutDirty &&
    !propertyReflowDraftChanged && !managedTypographyDirty && !paragraphChanges &&
    !/[\r\n]/.test(originalText) &&
    // A space just typed at the end draws nothing; whether it pushes the line
    // past its room is decided by the letter after it. Wrapping on it made the
    // box jump to two lines for one keystroke.
    (pdfNativeSourceTextFitsPropertyFrame(replacementText.replace(/[ \u00a0]+$/u, "") || replacementText, propertyProof) ||
      pdfNativeSourceTextFitsMeasuredFrame(replacementText.replace(/[ \u00a0]+$/u, "") || replacementText, initialLayout?.singleLineFit)),
  [initialLayout?.promoted, sourceInputLayout, manualLayoutDirty, propertyReflowDraftChanged,
    managedTypographyDirty, paragraphChanges, originalText, replacementText, propertyProof, initialLayout?.singleLineFit]);
  // A box taller than a line and a half draws several rows on paper. With no
  // row layout to hand, keeping its input on one unwrapped line made the
  // arrow keys jump to the paragraph's ends and Shift+Down select to its end
  
  // real rows to move through. Both fields are page-height fractions.
  // A saved text box is judged by the rows its text takes in it: its frame
  // carries the text-box padding band, so a one-row box is taller than a
  // line and a half of its font, read as multi-row, and got no room to grow
  
  const sourceLooksMultiLine = initialLayout?.promoted && openedBoxRows !== null
    ? openedBoxRows > 1
    : Boolean(
      initialLayout &&
        Number.isFinite(initialLayout.box.fontSize) &&
        Number(initialLayout.box.fontSize) > 0 &&
        initialLayout.box.height > Number(initialLayout.box.fontSize) * 1.6,
    );
  // A line the page draws in several fonts, on one row (a TeX theorem: bold
  // Song, roman, Kai, math italic, a raised 2): no one font's metrics measure
  // it. Typed into, it is still that row until the exact preview answers.
  const mixedOneRowSource = !sourceLooksMultiLine && !initialLayout?.promoted && !sourceInputLayout &&
    !initialLayout?.fallbackText && !initialLayout?.singleLineFit && !propertyProof &&
    (sourceAppearance ?? []).filter((run) => run.text.trim()).length > 1;
  const sourceLineLayoutPreserved =
    // Preserve the fit of an actual one-line source, but never flatten a
    // persisted multi-line box into a clipped single line on re-entry. A
    // draft the browser sets wider than the box has left the one line: it
    // wraps in the box, as WPS wraps, whatever a frame to the margin allows.
    !sourceLooksMultiLine &&
    !initialLayout?.promoted &&
    !sourceInputLayout &&
    !draftOverflowsBox &&
    (nativeSingleLineFits || replacementText === originalText || isSingleLineDeletion(originalText, replacementText) ||
      // A one-line source whose own metrics cannot measure the new text (a
      // letter its font never drew) is still one line until the exact
      // preview answers: the browser measures that letter in a substitute
      // face, and letting the box wrap on that guess made it jump to two
      // lines, drop the caret a line and snap back when the preview came.
      (!previewError && !managedTypographyDirty && !paragraphChanges &&
        !/[\r\n]/.test(originalText) &&
        (mixedOneRowSource || pdfNativeSourceTextFitUndecided(replacementText, initialLayout?.singleLineFit)))) &&
    !propertyReflowDraftChanged &&
    !manualLayoutDirty;
  const sourceLayoutUnchanged = !initialLayout?.promoted &&
    replacementText === originalText && !propertyLayoutDraftChanged &&
    !managedTypographyDirty && !paragraphChanges && !manualLayoutDirty;
  // Character spacing, word spacing and horizontal scale stay native while
  // the run still fits the space the page proves free beside it: the frame
  // follows the run's new width there. A run they make wider than that wraps
  
  const spacingFrameScale = (() => {
    if (!propertyProof || !properties || !propertyBaseline) return 1;
    const changed =
      properties.characterSpacing !== propertyBaseline.characterSpacing ||
      properties.wordSpacing !== propertyBaseline.wordSpacing ||
      properties.horizontalScale !== propertyBaseline.horizontalScale;
    if (!changed || !(propertyProof.extent > 0)) return 1;
    const linear = properties.textMatrixLinear ?? propertyProof.original.textMatrixLinear;
    const matrixScale = linear ? Math.hypot(linear[0], linear[1]) || 1 : 1;
    const glyphs = Array.from(replacementText).length;
    const spaces = (replacementText.match(/ /g) ?? []).length;
    const spacing = (state: { characterSpacing: number; wordSpacing: number }) =>
      (state.characterSpacing * glyphs + state.wordSpacing * spaces) * matrixScale;
    const bare =
      (propertyProof.extent * 100) / (propertyBaseline.horizontalScale || 100) - spacing(propertyBaseline);
    const next = ((bare + spacing(properties)) * properties.horizontalScale) / 100;
    // Within the space the page proves free beside the run it stays one
    // native line and the frame follows it; past that the line is too wide
    
    // and scale (browser-text-layout.ts rows, the API's spaced rows).
    const capacity = propertyProof.frame.right - propertyProof.frame.left;
    if (!(next <= capacity + 0.001)) return 1;
    return Number.isFinite(next) && next > 0 ? next / propertyProof.extent : 1;
  })();
  // The widest frame (page fraction) an edited one-line draft may take and
  // stay one line: the room the page proves free beside the line. WPS widens
  // a line's box as it is typed past its end; where the box is exactly the
  // line, wrapping at the box folded the line in two at the first letter
  // typed after it. Past the room the draft wraps, at the room's width.
  // (Read in the line's own axes, ownLayoutRect: a turned line's room runs
  // along it. A fraction of the page's width, as the frame's width is.)
  const lineGrowthRoomInOwnAxes = (() => {
    const layoutRect = ownLayoutRect;
    // A one-row text box the line was saved as earlier grows like the line
    // did: typing on into it folded it under its own width, its second row
    
    // A centred line grows too: the writer sets it longer in place, from
    // where it starts, and the frame is held at the line's own width, in
    // which centring moves nothing. Wrapped at its box, a centred title
    
    // A text box's line wraps at the box (wrapFrameRight), never grows past it.
    if (!layoutRect || !initialLayout || sourceInputLayout || sourceLooksMultiLine || wrapFrameRight !== null ||
      manualLayoutDirty || paragraphChanges || !contentDraftDirty ||
      (retainedAlignment !== "left" && retainedAlignment !== "center" && !(rightLine && retainedAlignment === "right")) ||
      /[\r\n]/.test(originalText) || /[\r\n]/.test(replacementText) ||
      lineTurn === null) return 0;
    // A line flush right grows to the left (rightLine), as far as a left
    // margin as wide as its right one.
    if (rightLine) {
      const edge = layoutRect.x + layoutRect.width;
      const room = edge - Math.max(0.02, 1 - edge);
      return room > layoutRect.width * 1.005 ? room : 0;
    }
    const factor = initialLayout.promoted
      ? null
      : pdfNativeSourceLineRoomFactor(originalText, propertyProof, initialLayout.singleLineFit);
    // The page's own room: to a right margin as wide as the line's left one.
    // A line whose metrics cannot measure its room (a mixed-font line, one
    // a font extension already rewrote) used to get none and fold at its
    
    // WPS grows such a line to the margin too.
    
    // WPS widens to the right as far as the page goes (a centred title has
    // no margin wider than its left one to grow into: its letter set larger
    // pushed the last one to a second row).
    // A line centred on the page has no margin wider than its left one
    // beside it (that margin is its own centring): it grows to the page's
    // edge, as far as the writer sets it in place (its same-line room).
    const centredOnPage = pdfNativeLineCentredOnPage(layoutRect);
    const pageRoom = Math.max(0, 1 - layoutRect.x -
      // (A row of several fonts set off-centre, a display formula's: its own left
      // edge says nothing of the page's margin.)
      ((managedLayoutTypography && !initialLayout.promoted) || centredOnPage || mixedOneRowSource
        ? 0.02 : Math.max(0.02, layoutRect.x)));
    // A measured room (it stops at the next text on the row) still rules
    // where the draft's words fit in it. A word wider than that room grows
    // the line over the next text to the margin, as WPS widens a text
    // block: wrapped at the room, a table cell's 「12」 typed on became a
    // column of single letters whose first row overflowed its frame, and
    
    // A line saved as a text box has no measure of its own (its run is
    // hidden): its room on the row is up to the next text the page draws
    // there, as the line's was. Given the page's whole width, the box of
    // an equation's left side typed on ran into the fraction after it
    
    // and one word wider than it still widens the box, as below.
    const rowRoom = initialLayout.promoted && typeof initialLayout.rowRoom === "number" &&
      Number.isFinite(initialLayout.rowRoom) && initialLayout.rowRoom > 0 ? initialLayout.rowRoom : null;
    const measuredRoom = factor !== null ? Math.min(1 - layoutRect.x, layoutRect.width * factor)
      : rowRoom !== null ? Math.min(1 - layoutRect.x, rowRoom) : null;
    const room = measuredRoom === null ||
      (draftWidestWord > 0 && draftWidestWord / ownPageWidthPixels > measuredRoom)
      ? Math.max(pageRoom, measuredRoom ?? 0)
      : measuredRoom;
    return room > layoutRect.width * 1.005 ? room : 0;
  })();
  const lineGrowthRoom = lineAxesTurn === 0 ? lineGrowthRoomInOwnAxes
    : lineGrowthRoomInOwnAxes * ownPageWidthPixels / pageWidthPixels;
  // A one-line draft the page lets grow beside it (lineGrowthRoom) is laid
  // out as one line, never wrapped: the frame follows its width as it is
  // measured unwrapped, and a draft wrapped at a frame measured a moment
  // before in other faces showed two rows the page never sets (IPCC
  
  // The exact candidate of the text as it now reads, where it sets it on
  // one row: the width it takes (a fraction of the page, in the line's own
  // axes as ownLayoutRect is). The page's own
  // measure of the line, which the browser's draft only approximates (its
  // kerning and spacing are the PDF's): a draft measured a few percent wider
  
  const candidateOneLine = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!candidateGeometry || candidateGeometry.text !== replacementText || !matrix || matrix.length !== 6 ||
      !initialLayout?.pageWidthPx || !initialLayout.pageHeightPx) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    // In the line's own axes (ownLayoutRect's), where its row runs left to right.
    const projected = projectPdfTextSourceAppearance(candidateGeometry, turnBackPageTransform(
      [matrix[0] * sx, matrix[1] * sy, matrix[2] * sx, matrix[3] * sy, matrix[4] * sx, matrix[5] * sy],
      lineAxesTurn, pageWidthPixels, pageHeightPixels));
    const inked = projected?.characters.filter((character) => character.text.trim()) ?? [];
    if (!projected || !inked.length) return null;
    const quad = inked[0].quad;
    const rowHeight = Math.hypot(quad[0] - quad[4], quad[1] - quad[5]);
    const baselines = inked.map((character) => character.origin[1]);
    if (!(rowHeight > 0) || Math.max(...baselines) - Math.min(...baselines) > rowHeight * 0.5) return null;
    return { width: (projected.bounds.right - projected.bounds.left) / ownPageWidthPixels,
      right: projected.bounds.right / ownPageWidthPixels };
  }, [candidateGeometry, replacementText, initialLayout?.pdfToCssTransform, initialLayout?.pageWidthPx,
    initialLayout?.pageHeightPx, pageWidthPixels, pageHeightPixels, lineAxesTurn, ownPageWidthPixels]);
  const candidateOneLineWidth = candidateOneLine?.width ?? null;
  // Where the words stand on the page, hovered and pressed, in page shares: the
  // frame's chrome reaches them (the frame itself stays the paragraph's).
  const [previewInk, setPreviewInk] = useState<PdfCandidateTextInk | null>(null);
  // Where the format hovered sets the words, its drawing's own glyphs: the
  // selection's band and the caret stand on them, as on the press's candidate.
  const [hoverExactGeometry, setHoverExactGeometry] = useState<PdfTextSourceAppearance | null>(null);
  const hoverExactGeometryRef = useRef(new WeakMap<HTMLCanvasElement, PdfTextSourceAppearance | null>());
  const [candidateInk, setCandidateInk] = useState<PdfCandidateTextInk | null>(null);
  // Past the room it wraps at the room's width, as before -- unless the
  // page itself sets the line on one row.
  const growsAsOneLine = lineGrowthRoom > 0 && !/[\r\n]/u.test(replacementText) &&
    (pastRoomDraftRef.current !== previewDraftKey || candidateOneLineWidth !== null);
  const unframedLayoutRect = useMemo<BoxRect | null>(() => {
    if (!ownLayoutRect) return null;
    // Set in the line's own axes (ownLayoutRect, the frame itself on an
    // upright line) and turned back onto the page: a turned frame grows from
    // where its line starts and its first row stands.
    const sourceBoxHeight = initialLayout?.box.height ?? 0;
    const ownSourceBoxHeight = lineAxesTurn === 0 ? sourceBoxHeight
      : sourceBoxHeight * pageHeightPixels / ownPageHeightPixels;
    const inOwnAxes = ((layoutRect: BoxRect, pageWidthPixels: number, pageHeightPixels: number,
      lineGrowthRoom: number): BoxRect => {
    // A format previewed on the line (a part set in a wider face) widens
    // what the page will draw: the frame reaches the candidate's last ink
    // as it is shown. Held at the source frame, 「2023」 stood past it while
    // Bold off on 「CHANGE」 was previewed, and after the leave until the
    
    const kept = candidateOneLine && !replacementText.includes("\n") &&
      candidateOneLine.right > layoutRect.x + layoutRect.width + 1 / pageWidthPixels
      ? { ...layoutRect, width: Math.min(1 - layoutRect.x, candidateOneLine.right - layoutRect.x) } : layoutRect;
    // A paragraph set again in the frame it was resized to: the frame holds
    // as many rows as the candidate sets it in (WPS: a text block's frame
    // hugs its text as it re-wraps).
    if (paragraphFrameRight !== null && initialLayout?.sourceInputLayout &&
      sourceInputLayout?.text === replacementText) {
      const rows = sourceInputLayout.breaks.length + 1;
      const sourceRows = initialLayout.sourceInputLayout.breaks.length + 1;
      if (rows !== sourceRows) {
        return { ...layoutRect, height: Math.min(1 - layoutRect.y, ownSourceBoxHeight * rows / sourceRows) };
      }
    }
    if (spacingFrameScale > 1.001 && replacementText === originalText && !manualLayoutDirty) {
      return {
        ...layoutRect,
        width: Math.min(1 - layoutRect.x, layoutRect.width * spacingFrameScale),
      };
    }
    // A mixed-font source need not have a single-font fit hint. Merely opening
    // it must retain its measured source frame: browser line-box padding is
    // not authored content and cannot promote an untouched source to reflow.
    if (sourceLayoutUnchanged) return kept;
    // A native fit must reach the exact source preview. Padding for a DOM
    // fallback is not a reason to change the PDF frame or writing strategy.
    // A line wider than its box is not a native fit here even where the
    
    // frame that follows it (lineGrowthRoom) or, with no room, wraps it.
    if ((nativeSingleLineFits && !draftOverflowsBox) || sourceLineLayoutPreserved) return kept;
    
    
    // grows with its words; held at the source rows, a part made larger ran
    // past the frame (PDF 0063).
    if (sourceInputLayout && !manualLayoutDirty && !replacementText.includes("\n") &&
      !managedLayoutTypography) return kept;
    // A format on a line the page still sets on one row is that row: the words
    // it raises or lowers are the chrome's (chromeReach). Measured from the
    // draft, an underline pressed took the frame down a second row, there until
    // the line was left, and a size pressed further than its words reach.
    // (So is one that cannot set it wider, its exact page still on the way.)
    if ((candidateOneLine || !draftMayWiden) && !initialLayout?.promoted && !manualLayoutDirty && !managedLayoutTypography && !replacementText.includes("\n") &&
      !sourceLooksMultiLine && replacementText === originalText) return kept;
    // Hard breaks are exact; soft wrapping comes from the current DOM, not a
    // language-wide average glyph width (which inflated mixed CJK/Latin text).
    const explicitLines = sourceLineLayoutPreserved ? 1 : replacementText.split(/\r\n?|\n/).length;
    const contentHeight = Math.max(
      Math.ceil(explicitLines * draftLineHeightPixels),
      sourceLineLayoutPreserved ? 0 : measuredContentHeight,
    );
    // Several fonts' line boxes on one row measure taller than the row: read
    // as the row grown, one character typed past its end took the line out of
    
    // So does any one row the page grows in place (measured within its room): the
    // browser's line box and the safety band measured taller than the box,
    // the frame read as grown, and the title typed on went to the text-box
    
    
    const mixedRowGrowing = (mixedOneRowSource || (!sourceLooksMultiLine && !initialLayout?.promoted &&
      draftNaturalWidth > 0 && draftNaturalWidth / pageWidthPixels <= lineGrowthRoom)) &&
      growsAsOneLine && !manualLayoutDirty &&
      !propertyReflowDraftChanged && !managedTypographyDirty && !paragraphChanges;
    const requiredHeight = mixedRowGrowing ? layoutRect.height : Math.min(
      1 - layoutRect.y,
      Math.max(
        layoutRect.height,
        (contentHeight + layoutVerticalSafetyPixels) /
          pageHeightPixels,
      ),
    );
    // A line the page sets on one row is as wide as it sets it (to its
    // edge at most), whatever the draft measured.
    const grown = growsAsOneLine && candidateOneLineWidth !== null
      ? Math.min(1 - layoutRect.x, candidateOneLineWidth + draftFontSizePixels * LINE_GROWTH_MARGIN_EM / pageWidthPixels)
      : draftOverflowsBox && lineGrowthRoom > 0 && draftNaturalWidth > 0
        ? Math.min(lineGrowthRoom, draftNaturalWidth / pageWidthPixels) : 0;
    // A frame the reader narrowed to set the paragraph again (its right
    // edge dragged in) is the width the words wrap in: the drag already
    // stopped it at the widest word. Held at the typed line's width
    // instead, a frame narrowed after typing did not move -- the words
    
    const width = paragraphFrameRight !== null ? layoutRect.width
      : (manualLayoutDirty || contentDraftDirty) ? Math.min(1 - layoutRect.x,
      Math.max(layoutRect.width, measuredMinimumWidth / pageWidthPixels, grown)) : layoutRect.width;
    // A centred line set again (centredRetype) keeps its middle: its frame
    // grows (shrinks) alike on both sides, on the page.
    // A line flush right set again so keeps its right edge: its frame grows
    // (shrinks) to the left.
    if (rightDraft) {
      const edge = layoutRect.x + layoutRect.width;
      const natural = draftNaturalWidth > 0 ? draftNaturalWidth / pageWidthPixels : 0;
      const wanted = Math.max(width, grown, natural, layoutRect.width);
      const set = Math.min(wanted, lineGrowthRoom > 0 ? Math.max(lineGrowthRoom, layoutRect.width) : layoutRect.width, edge);
      return { ...layoutRect, x: edge - set, width: set, height: requiredHeight };
    }
    if (centredDraft) {
      const middle = layoutRect.x + layoutRect.width / 2;
      const centred = Math.min(Math.max(width, grown, layoutRect.width), 2 * Math.min(middle, 1 - middle));
      return { ...layoutRect, x: middle - centred / 2, width: centred, height: requiredHeight };
    }
    return { ...layoutRect, width, height: requiredHeight };
    })(ownLayoutRect, ownPageWidthPixels, ownPageHeightPixels, lineGrowthRoomInOwnAxes);
    return lineAxesTurn === 0 ? inOwnAxes
      : boxRectFromOwnAxes(inOwnAxes, lineAxesTurn, pageWidthPixels, pageHeightPixels);
  }, [
    centredDraft, rightDraft,
    paragraphFrameRight, initialLayout?.sourceInputLayout, initialLayout?.box.height,
    ownLayoutRect, ownPageWidthPixels, ownPageHeightPixels, lineAxesTurn, lineGrowthRoomInOwnAxes,
    draftNaturalWidth, growsAsOneLine, candidateOneLine, candidateOneLineWidth, draftFontSizePixels,
    draftLineHeightPixels,
    nativeSingleLineFits,
    draftOverflowsBox,
    layoutVerticalSafetyPixels,
    pageHeightPixels,
    measuredContentHeight,
    replacementText,
    sourceLineLayoutPreserved,
    manualLayoutDirty, contentDraftDirty, measuredMinimumWidth, pageWidthPixels,
    sourceInputLayout,
    sourceLayoutUnchanged,
    spacingFrameScale, originalText, managedLayoutTypography,
    mixedOneRowSource, propertyReflowDraftChanged, managedTypographyDirty, paragraphChanges, sourceLooksMultiLine, draftMayWiden, initialLayout?.promoted,
  ]);
  // The line of a text box is at least as wide as the box (wrapFrameRight):
  // its words wrap at the box's edge, its rows grow the frame down.
  const effectiveLayoutRect = useMemo<BoxRect | null>(() =>
    unframedLayoutRect && wrapFrameRight !== null && paragraphFrameRight === null &&
      wrapFrameRight > unframedLayoutRect.x + unframedLayoutRect.width
      ? { ...unframedLayoutRect, width: Math.min(1 - unframedLayoutRect.x, wrapFrameRight - unframedLayoutRect.x) }
      : unframedLayoutRect,
  [unframedLayoutRect, wrapFrameRight, paragraphFrameRight]);
  // A superscript or subscript is written natively as a `Ts` rise, so the
  // taller draft box it measures must not promote the run to a managed text
  // box. Only the rise and the size it carries may differ from the source.
  const riseOnlyPropertyChange = Boolean(
    propertyBaseline &&
      properties &&
      (properties.textRise ?? 0) !== (propertyBaseline.textRise ?? 0) &&
      samePropertyDraft(
        {
          ...propertyBaseline,
          fontSize: properties.fontSize,
          textRise: properties.textRise,
        },
        properties,
      ),
  );
  // The same holds for a quarter turn: the rotated draft measures a different
  // box, but the native writer expresses it exactly.
  const matrixOnlyPropertyChange = Boolean(
    propertyBaseline &&
      properties &&
      JSON.stringify(properties.textMatrixLinear) !==
        JSON.stringify(propertyBaseline.textMatrixLinear) &&
      samePropertyDraft(
        { ...propertyBaseline, textMatrixLinear: properties.textMatrixLinear },
        properties,
      ),
  );
  // A resize is the same: the run's own text state scales, so the native
  // writer still expresses it and the frame it grows into is proven page
  // space. The four scale fields must move by one consistent factor, which
  // is what makes the new advance exactly computable from the proven extent.
  const scaleOnlyPropertyChange = (() => {
    if (!propertyBaseline || !properties || !propertyProof) return false;
    if (!(propertyBaseline.fontSize > 0) || !(propertyBaseline.horizontalScale > 0)) return false;
    const factorY = properties.fontSize / propertyBaseline.fontSize;
    const factorX = properties.horizontalScale / propertyBaseline.horizontalScale;
    if (!Number.isFinite(factorY) || !Number.isFinite(factorX) || factorY <= 0 || factorX <= 0) return false;
    // An unchanged scale is not this exemption; a plain text edit still owns
    
    if (Math.abs(factorY - 1) < 1e-9 && Math.abs(factorX - 1) < 1e-9) return false;
    if (Math.abs(properties.characterSpacing - propertyBaseline.characterSpacing * factorY) > 1e-4 ||
      Math.abs(properties.wordSpacing - propertyBaseline.wordSpacing * factorY) > 1e-4) return false;
    if (propertyProof.extent * factorY * factorX >
      propertyProof.frame.right - propertyProof.frame.left + 0.001) return false;
    return samePropertyDraft(
      {
        ...propertyBaseline,
        fontSize: properties.fontSize,
        characterSpacing: properties.characterSpacing,
        wordSpacing: properties.wordSpacing,
        horizontalScale: properties.horizontalScale,
        ...(properties.moveX !== undefined ? { moveX: properties.moveX } : {}),
        ...(properties.moveY !== undefined ? { moveY: properties.moveY } : {}),
      },
      properties,
    );
  })();
  // The source compiler is the authority on whether a draft can be written
  // natively, and the exact preview is that compiler's own answer for exactly
  // this draft. A mixed-font line has no single-font fit hint, so without this
  // the browser's own box measurement was the only voice - and a line that
  // wrapped in the DOM was promoted to a managed annotation even where the
  // compiler had already produced the page it would write.
  const exactPreviewAcceptedDraft =
    validatedPreviewDraftKeyRef.current === previewDraftKey &&
    !previewBusy &&
    !previewError;
  const autoLayoutGrowthAllowed =
    !riseOnlyPropertyChange &&
    !matrixOnlyPropertyChange &&
    !scaleOnlyPropertyChange &&
    // (Nor a format that moves no glyph: the line is as wide as it was. Nor
    // a part set in another face: its row is as tall as the page sets it,
    // whatever the browser's line box of the face measures; a part wider
    // than the line's room is read as an overflow, not as a taller frame.)
    !((lookOnlyPropertyChange || partFaceOnlyPropertyChange) && replacementText === originalText) &&
    !exactPreviewAcceptedDraft;
  const autoLayoutGrown = Boolean(
    autoLayoutGrowthAllowed &&
    effectiveLayoutRect &&
    layoutRect &&
    effectiveLayoutRect.height >
      (initialLayout?.box.height ?? layoutRect.height) + BOX_RECT_EPSILON,
  );
  
  
  // where it may fit the box again; reading that as "not grown" sent it back
  
  // "你好" typed into the tax form's Tf 1 x 12 header, "Maximum update depth
  // exceeded", the PDF window unmounted and the draft was lost).
  if (autoLayoutGrown) autoLayoutGrownDraftRef.current = previewDraftKey;
  const autoLayoutExpanded = Boolean(
    autoLayoutGrown ||
      (autoLayoutGrowthAllowed && layoutRect && autoLayoutGrownDraftRef.current === previewDraftKey),
  );
  // A box the reader promoted, dragged, or gave a hard break has left the
  
  // it must, and the exact preview can still overturn it - so that guess must
  // not be allowed to cancel the preview that would answer it.
  // So has a finished draft the native writer declined to set in place: the
  
  // see (the only refusal kept for it is one that would lose content).
  const refusalFallbackActive = refusalFallbackKey !== null && refusalFallbackKey === previewDraftKey;
  
  const openedInFallbackLane = Boolean(initialLayout?.fallbackText && !initialLayout.promoted);
  // An edited line wider than its box that the frame can follow across the
  // room the page proves free beside it stays a native line: the compiler
  // sets it in place, longer, as WPS widens a line's box as it is typed past
  // its end, and the page keeps it as real text. Written as a text box it
  // was drawn right, but the old words stayed in the page, hidden, and were
  
  // TeX line's "many" replaced by "Verified"). The compiler has the last
  
  // (refusalFallbackEligible). Measured past the room once, a draft stays
  
  // following that back and forth looped (walk w-cjk-s9b).
  const overflowFollowedNatively = Boolean(
    draftOverflowsBox && contentDraftDirty && !initialLayout?.promoted &&
      lineGrowthRoom > 0 && draftNaturalWidth > 0 &&
      draftNaturalWidth / pageWidthPixels <= lineGrowthRoom &&
      pastRoomDraftRef.current !== previewDraftKey,
  );
  // A line break typed into a line of the page's own text (Enter, WPS), or
  // text typed past the room its line has: the window sets it by the
  // paragraph rewrite in that text (the paragraph grows down, as WPS grows
  
  // only where the engine refuses (finish, below). The draft is still shown
  // wrapped meanwhile.
  const typedBreakNative = (replacementText.includes("\n") || (draftOverflowsBox && contentDraftDirty)) &&
    !openedInFallbackLane && !initialLayout?.promoted &&
    !unprovenTextBoxFormat && !manualLayoutDirty && !refusalFallbackActive && !managedLayoutTypography &&
    paragraphChanges === null && paragraphFrameRequest === null && !propertyDraftChanged;
  
  // the page's own text first at finish: the engine sets a format or text
  // it cannot fit in place by the paragraph rewrite (wrapping in the frame
  
  
  
  
  // Nor a draft whose native record the server already refused: tried again
  // it is refused again, and the reader's words never land. (A planner's
  // refusal of the exact preview is no such answer: the page's own text may
  // still set it as a paragraph.)
  const nativeFirstBeforeTextBox = !openedInFallbackLane && !initialLayout?.promoted && !manualLayoutDirty &&
    !unprovenTextBoxFormat && !managedLayoutTypography && serverRefusedDraftKey !== previewDraftKey;
  const layoutFallbackForced = Boolean(
    openedInFallbackLane ||
    initialLayout?.promoted ||
    unprovenTextBoxFormat ||
      manualLayoutDirty ||
      replacementText.includes("\n") ||
      refusalFallbackActive ||
      // Text wider than the room its frame can follow wraps, and the
      
      // grows a text block).
      (draftOverflowsBox && contentDraftDirty && !overflowFollowedNatively),
  );
  const layoutFallbackActive = Boolean(
    layoutFallbackForced ||
      autoLayoutExpanded ||
      (sourceInputLayout && replacementText.includes("\n")),
  );
  
  // title's subscript was converted to a box instead of set in place, owner
  
  const layoutLaneWhy = layoutFallbackActive ? JSON.stringify({
    openedInFallbackLane, promoted: Boolean(initialLayout?.promoted), unprovenTextBoxFormat, manualLayoutDirty,
    newline: replacementText.includes("\n"), refusalFallbackActive, overflow: draftOverflowsBox && contentDraftDirty,
    autoLayoutExpanded, sourceInputLayout: Boolean(sourceInputLayout) }) : null;
  const layoutLaneWhyRef = useRef<string | null>(null);
  if (process.env.NODE_ENV !== "production" && layoutLaneWhy !== layoutLaneWhyRef.current) {
    layoutLaneWhyRef.current = layoutLaneWhy;
    if (layoutLaneWhy) console.debug("[pdf-text] layout lane " + layoutLaneWhy);
  }
  const activeInputLayout = !layoutFallbackActive && sourceInputLayout?.text === replacementText ? sourceInputLayout : null;
  sourceInputLayoutRef.current = activeInputLayout;
  const displayedInputValue = activeInputLayout?.value ?? replacementText;
  // The rows the input shows this edit in, for its compile: words typed at
  // the end of a row are told from words typed at the start of the next
  // (lib/pdf/native-text-row-starts). Kept before the preview is asked for
  // (a layout effect), forgotten when the input no longer shows the box's
  // own rows.
  useLayoutEffect(() => {
    notePdfNativeTextRowStarts(originalText, replacementText,
      activeInputLayout?.breaks.length ? pdfNativeTextInputRowStarts(activeInputLayout) : null);
  }, [activeInputLayout, originalText, replacementText]);
  // The frame turned (the rotate handle). The exact candidate is drawn at
  // the source angle, so the draft itself, which turns with the frame, is
  // what is seen until the box is written, as WPS turns the text with the
  // handle; the candidate showed the old line level inside the turned frame.
  const layoutAngleChanged = Boolean(initialLayout) &&
    Math.abs(normalizeBoxAngle(layoutAngle) - normalizeBoxAngle(initialLayout?.box.angle)) > .001;
  // Nothing of the block but its place changed (a move).
  const moveOnlyDraft = replacementText === originalText && !propertyLayoutDraftChanged &&
    !managedTypographyDirty && paragraphChanges === null && paragraphFrameRequest === null &&
    !layoutAngleChanged && shownFormatPreview === null;
  
  // as WPS keeps a moved block's lines: joined into one paragraph, its text
  
  // (「5CCM231 2025-2」/「026」; box-paras2's three lines run together).
  // The same for a block whose text is unchanged and only its format is
  // not: a title set again in a narrower frame, its rows then given a font
  
  // re-wrapped (PDF 兼容 / 性压力测试 came back as PDF 兼 / 容性 / ...; owner
  
  const formatOnlyDraft = replacementText === originalText && paragraphChanges === null &&
    paragraphFrameRequest === null && !layoutAngleChanged && !manualLayoutDirty;
  const movedRowsText = layoutFallbackActive && (moveOnlyDraft || formatOnlyDraft) &&
    sourceInputLayout?.text === replacementText && sourceInputLayout.breaks.length > 0 ? sourceInputLayout.value : null;
  const manualLayoutChanged = manualLayoutDirty && Boolean(
    initialLayout && effectiveLayoutRect && (
      (["x", "y", "width", "height"] as const).some(key =>
        Math.abs(effectiveLayoutRect[key] - initialLayout.box[key]) > BOX_RECT_EPSILON) ||
      layoutAngleChanged
    ),
  );
  const draftDirty = contentDraftDirty || manualLayoutChanged || paragraphFrameRequest !== null || rowFormat !== null;
  // Only the box's place, size or angle changed: dropping the draft loses no
  // text the user typed.
  const layoutOnlyDraft =
    draftDirty &&
    replacementText === originalText &&
    !propertyLayoutDraftChanged &&
    paragraphChanges === null &&
    !managedTypographyDirty;
  // Every character removed: leaving the line (Enter, Escape, Save, a click
  // away) deletes its text object, as WPS and PowerPoint take an emptied
  // box away when it is left. Emptying it alone deletes nothing, and an
  
  // not be left at all).
  const deletesOnLeave =
    Boolean(onDeleteTextObject) &&
    !layoutOnlyDraft &&
    replacementText.trim().length === 0 &&
    originalText.trim().length > 0;
  // A single source line the property writer owns, still in place: the
  // rotate handle turns it by its own text matrix (WPS turns a text block
  // to any angle in place), and a resize that still holds it on one line
  // only moves it as its alignment says. Anything else is set as a text box
  // (layoutFallbackForced) and says so.
  const nativeFrameEditable = Boolean(
    properties && propertyProof && !managedLayoutTypography && !initialLayout?.promoted &&
    !openedInFallbackLane && !sourceLooksMultiLine && paragraphChanges === null &&
    !/[\r\n]/.test(replacementText) && !/[\r\n]/.test(originalText) &&
    !propertyOverride?.groupScale && !manualLayoutDirty && !draftOverflowsBox,
  );
  const nativeTurnable = nativeFrameEditable;
  // A paragraph of several lines its group proof covers turns as the group
  // (groupDraftWithTurn); a single line turns by its own text matrix above.
  const groupTurnable = Boolean(
    !nativeTurnable && !propertyProof && groupScaleSupported && !managedLayoutTypography &&
    !initialLayout?.promoted && !openedInFallbackLane && paragraphChanges === null &&
    !/[\r\n]/.test(replacementText) && !manualLayoutDirty && !draftOverflowsBox,
  );
  const nativeResizable = nativeFrameEditable && nativeMoveSupported &&
    Math.abs(normalizeBoxAngle(layoutAngle)) <= 0.001;
  // The alignment the line shows (read further down, where it is made).
  const displayedAlignmentRef = useRef<"left" | "center" | "right" | null>(null);
  /** The draft for a frame resized to `rect` that still holds the line on
   * one line: the line keeps its font and size and moves as its alignment
   * says (a left-aligned line stays put as the frame widens to the right).
   * Null when the frame is narrower than the line: it re-wraps as a box. */
  const nativeResizeDraft = useCallback((rect: BoxRect): PdfNativeTextPropertyDraft | null => {
    if (!nativeResizable || !initialLayout) return null;
    const box = initialLayout.box;
    if (rect.width + BOX_RECT_EPSILON < box.width) return null;
    const alignment = displayedAlignmentRef.current ?? propertyOverride?.alignment ?? propertyBaseline?.alignment ?? "left";
    const x = alignment === "right" ? rect.x + rect.width - box.width
      : alignment === "center" ? rect.x + (rect.width - box.width) / 2
      : rect.x;
    return propertyDraftWithMove({ x, y: rect.y, width: box.width, height: box.height });
  }, [nativeResizable, initialLayout, propertyOverride, propertyBaseline, propertyDraftWithMove]);

  // A paragraph (or a line its frame no longer holds) whose frame is
  // resized from the right edge is set again in place in the new width, in
  // its own fonts (the paragraph rewrite): an upright frame on an upright
  // page, with nothing else of its format changed.
  const nativeRewrapEligible = Boolean(
    initialLayout && !initialLayout.promoted && !openedInFallbackLane && !managedLayoutTypography &&
    initialLayout.pdfToCssTransform?.length === 6 && initialLayout.pageWidthPx > 0 &&
    initialLayout.pdfToCssTransform[0] > 0 &&
    Math.abs(initialLayout.pdfToCssTransform[1]) < 1e-9 && Math.abs(initialLayout.pdfToCssTransform[2]) < 1e-9 &&
    Math.abs(normalizeBoxAngle(layoutAngle)) <= 0.001 &&
    Math.abs(normalizeBoxAngle(initialLayout.box.angle ?? 0)) <= 0.001 &&
    !propertyLayoutDraftChanged && !managedTypographyDirty && paragraphChanges === null && !manualLayoutDirty &&
    // A move the reader made by the frame's body or left edge travels with
    // the rewrap (move, then the paragraph set again in its new width: two
    // edits of the working copy), and so does a move made before the resize
    // (set again in the new width where it was moved to: read as apart from
    
    
    (rewrapMovedRef.current || (!propertyOverride?.groupScale && !propertyOverride?.groupLinear)),
  );
  // A paragraph of more than one line that no format proof states takes its
  // line spacing the same way: set again in place at the step chosen.
  const paragraphMeasuredLineStep = !initialLayout?.promoted ? initialLayout?.sourceInputLayout?.lineHeightPoints ?? null : null;
  // A one-line paragraph has no measured step: the rewrite breaks it at 1.2
  // of its size (paragraph-rewrite SINGLE_LINE_STEP_EM), and the control
  // starts there, so a step chosen after the line was broken in two is set
  // (user audit PDF 0066: the control did nothing on a one-line source).
  const paragraphSourcePoints = initialLayout && !initialLayout.promoted
    ? Number(initialLayout.box.fontSize) * Number(initialLayout.pageHeightPoints) : 0;
  const paragraphOwnLineStep = paragraphMeasuredLineStep ??
    (Number.isFinite(paragraphSourcePoints) && paragraphSourcePoints > 0
      ? Math.round(paragraphSourcePoints * 1.2 * 100) / 100 : null);
  const nativeLineSpacingByRewrite = Boolean(nativeRewrapEligible && !propertyProof && paragraphOwnLineStep);
  const nativeLineSpacingByRewriteRef = useRef(nativeLineSpacingByRewrite);
  nativeLineSpacingByRewriteRef.current = nativeLineSpacingByRewrite;
  // And its font size: kept in its frame and broken into lines again, not
  // scaled with the frame as a picture is (setGroupFontPoints). A measured
  // multi-line paragraph only: a one-line source keeps its size path.
  const nativeSizeByRewrite = Boolean(nativeRewrapEligible && !propertyProof && paragraphMeasuredLineStep);
  




  const requestNativeRewrap = useCallback((rect: BoxRect): boolean => {
    if (!nativeRewrapEligible || !initialLayout) return false;
    const box = initialLayout.box;
    const matrix = initialLayout.pdfToCssTransform!;
    const right = Math.round(((rect.x + rect.width) * initialLayout.pageWidthPx - matrix[4]) / matrix[0] * 1e4) / 1e4;
    if (!Number.isFinite(right)) return false;
    // A frame moved first keeps its place (the move rides the rewrap); a
    // resize alone keeps the paragraph's own top.
    const top = rewrapMovedRef.current || propertyOverride?.moveX || propertyOverride?.moveY ? rect.y : box.y;
    // One row of words left as they were, its frame made wider: nothing is
    // set again (the row already fits), the words go with the left edge.
    // Set again, a rewritten row of several faces was refused and the
    
    // (One row: its rows' own layout says so, or, read without it, a frame
    // no taller than a row of its type.)
    const oneRow = initialLayout.sourceInputLayout ? !initialLayout.sourceInputLayout.breaks.length
      : !(Number(box.height) > Number(box.fontSize) * 1.8);
    const widenedRow = replacementText === originalText && !/[\r\n]/.test(originalText) &&
      oneRow && rect.width >= box.width - BOX_RECT_EPSILON;
    if (Math.abs(rect.x - box.x) > BOX_RECT_EPSILON || Math.abs(top - box.y) > BOX_RECT_EPSILON) {
      // The left edge pulled in (or out): the paragraph moves with it and
      // is set again in the frame -- as WPS does, the text stays page text.
      // It used to turn the line into a text-box annotation, a second kind
      
      const at = { x: rect.x, y: top, width: box.width, height: box.height };
      const moved = /[\r\n]/.test(originalText) ? groupDraftWithScale(at) : propertyDraftWithMove(at);
      if (!moved) return false;
      rewrapMovedRef.current = true;
      setProperties(moved);
      setParagraphFrameRight(widenedRow ? null : right);
      return true;
    }
    if (rewrapMovedRef.current) {
      // Back on its own left edge: the move the rewrap made goes.
      rewrapMovedRef.current = false;
      const unmoved = /[\r\n]/.test(originalText) ? groupDraftWithScale({ ...box }) : propertyDraftWithMove({ ...box });
      if (unmoved) setProperties(unmoved);
    }
    if (widenedRow || Math.abs(rect.x + rect.width - (box.x + box.width)) <= BOX_RECT_EPSILON) {
      setParagraphFrameRight(null);
      return true;
    }
    setParagraphFrameRight(right);
    return true;
  }, [nativeRewrapEligible, initialLayout, originalText, replacementText, groupDraftWithScale, propertyDraftWithMove,
    propertyOverride?.moveX, propertyOverride?.moveY]);

  // The narrowest frame a paragraph set again in place can take (page
  // fraction): its widest unit the rewrite cannot break (a word, one CJK
  // character) from the frame's left edge. Narrower, the rewrite answers
  // that nothing changes, and the frame stood narrower than the line it
  
  // Read from the line's exact glyph quads (`nativeCaretGeometry`, below).
  const rewrapMinimumWidthRef = useRef(0);
  const holdRewrapWidth = useCallback(
    (start: BoxRect, next: BoxRect, mode: ResizeHandle, dy: number,
      contentHeightFor: (widthFraction: number) => number): BoxRect => {
      const minimum = rewrapMinimumWidthRef.current;
      if (!nativeRewrapEligible || !(minimum > 0) || next.width >= minimum ||
        Math.abs(next.x - start.x) > BOX_RECT_EPSILON) return next;
      // The frame stops at that width: pulled in past it from a wider frame
      
      // the frame narrows to it and the paragraph re-wraps there. (Clamped
      // at zero, the drag was a no-op: the frame stayed as wide as it was
      // and nothing re-wrapped.) A frame already narrower widens to it.
      return resizeTextBoxToFitContent(start, mode, minimum - start.width, dy, contentHeightFor);
    },
    [nativeRewrapEligible],
  );

  const updateEditingSurfaceStatus = useCallback(
    (status: NativeTextEditingSurfaceStatus) => {
      editingSurfaceStatusRef.current = status;
      setEditingSurfaceStatus(status);
    },
    [],
  );

  const suppressSourceCanvas = useCallback((pageHost: HTMLElement) => {
    const sourceCanvas = pageHost.querySelector<HTMLCanvasElement>(
      "canvas[data-pdf-page]",
    );
    const suppressed = suppressedSourceCanvasRef.current;
    if (!sourceCanvas || suppressed?.canvas === sourceCanvas) return;
    if (suppressed?.canvas.isConnected) {
      suppressed.canvas.style.visibility = suppressed.visibility;
    }
    suppressedSourceCanvasRef.current = {
      canvas: sourceCanvas,
      visibility: sourceCanvas.style.visibility,
    };
    sourceCanvas.style.visibility = "hidden";
  }, []);

  const publishExactPreviewCanvas = useCallback(
    (canvas: HTMLCanvasElement, pageHost: HTMLElement) => {
      styleNativeTextPageCanvas(canvas, "candidate");
      canvas.style.visibility = "visible";
      pageHost.appendChild(canvas);
      suppressSourceCanvas(pageHost);
    },
    [suppressSourceCanvas],
  );

  const retirePendingPreview = useCallback(() => {
    activePreviewStartRef.current = null;
    previewGenerationRef.current += 1;
    if (activePreviewTimerRef.current !== null) {
      window.clearTimeout(activePreviewTimerRef.current);
      activePreviewTimerRef.current = null;
    }
    activePreviewControllerRef.current?.abort();
    activePreviewControllerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const pageWindow =
      ribbonRootRef?.current ??
      returnFocusRef.current?.closest<HTMLElement>(".pdf-page-window");
    let cancelled = false;
    const readHost = () =>
      pageWindow?.querySelector<HTMLElement>(
        '[data-pdf-native-list-text-ribbon-host="true"]',
      ) ?? null;
    const publishHost = () => {
      const nextHost = readHost();
      queueMicrotask(() => {
        if (!cancelled) {
          setRibbonHost((current) =>
            current === nextHost ? current : nextHost,
          );
        }
      });
    };
    // The host that is already there is published in this commit, with the
    // inline host: the input then mounts one render earlier (Safari: ~60 ms
    // of the switch). The observer's later publications stay a microtask.
    setRibbonHost((current) => { const next = readHost(); return current === next ? current : next; });
    const observer =
      pageWindow && typeof MutationObserver !== "undefined"
        ? new MutationObserver(publishHost)
        : null;
    if (pageWindow) observer?.observe(pageWindow, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [returnFocusRef, ribbonRootRef]);

  const releasePublishedPreview = useCallback(() => {
    const published = publishedPreviewCanvasRef.current;
    publishedPreviewCanvasRef.current = null;
    validatedPreviewDraftKeyRef.current = null;
    const preserveCommittedPreview = Boolean(
      published?.hasAttribute("data-pdf-native-text-commit-pending") ||
      published?.hasAttribute("data-pdf-native-text-committed-preview"),
    );
    if (!preserveCommittedPreview) published?.remove();
    if (published && !preserveCommittedPreview) {
      published.width = 0;
      published.height = 0;
    }
    const editingSurface = editingSurfaceCanvasRef.current;
    editingSurfaceCanvasRef.current = null;
    // A draft saved in the background leaves its erased line behind as the
    // committed bridge (PdfPageWindow); the viewer retires it.
    if (!editingSurface?.hasAttribute("data-pdf-native-text-committed-preview")) {
      editingSurface?.remove();
      if (editingSurface) {
        editingSurface.width = 0;
        editingSurface.height = 0;
      }
    }
    const suppressed = suppressedSourceCanvasRef.current;
    suppressedSourceCanvasRef.current = null;
    if (!preserveCommittedPreview && suppressed?.canvas.isConnected) {
      suppressed.canvas.style.visibility = suppressed.visibility;
    }
  }, []);

  useLayoutEffect(() => {
    const target =
      inlineEditorHost instanceof HTMLElement
        ? inlineEditorHost
        : returnFocusRef.current;
    markPdfTextLatency("lfx.metrics", { host: inlineEditorHost === undefined ? "undefined" : inlineEditorHost === null ? "null" : "element" });
    if (!target) return;

    const pageHost = target.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    // `geometry` false reads the box's typography alone (its computed
    // style: no layout); its rectangle and the page's size keep what they
    // were (none use them before the input's commit) until the next read.
    const updateMetrics = (geometry = true) => {
      if (!target.isConnected) return;
      const rect = geometry ? target.getBoundingClientRect() : null;
      const typography = readInlineEditorMetrics(target);
      // Read again with nothing changed (the resize observer's first call
      // for each box it watches, a scroll elsewhere), the box keeps the
      // metrics it holds: a new object rendered the whole editor again,
      // twice as each line opened.
      setMetrics((current) => {
        const next: InlineEditorMetrics = {
          ...typography,
          left: rect?.left ?? current?.left ?? 0,
          top: rect?.top ?? current?.top ?? 0,
          right: rect?.right ?? current?.right ?? 0,
          bottom: rect?.bottom ?? current?.bottom ?? 0,
          width: rect?.width ?? current?.width ?? 0,
          height: rect?.height ?? current?.height ?? 0,
        };
        return current && (Object.keys(next) as (keyof InlineEditorMetrics)[]).every((key) => current[key] === next[key])
          ? current
          : next;
      });
      if (!geometry) return;
      const pageRect = pageHost?.getBoundingClientRect();
      if (pageRect && pageRect.width > 0 && pageRect.height > 0) {
        const local = readOverlayLocalSize(pageHost, {
          width: initialLayout?.pageWidthPx ?? pageRect.width,
          height: initialLayout?.pageHeightPx ?? pageRect.height,
        });
        setPageViewportSize((current) =>
          current?.width === local.width &&
          current.height === local.height
            ? current
            : local,
        );
      }
    };
    
    // after the commit's writes forces a layout, ~45 ms in Safari with the
    // input just mounted. Reading the first run or the host-settling run at
    // the next frame instead saved that layout, but the cold open's caret
    // came a frame later and timing-sensitive openings saw the box before
    // its sizes -- the read stays synchronous.)
    updateMetrics();
    // (Listeners get an event as their first argument, not `geometry`.)
    const readMetrics = () => updateMetrics();
    window.addEventListener("resize", readMetrics);
    window.addEventListener("scroll", readMetrics, true);
    // An observer reports each target once on observe(): the same sizes
    // just read above. Each of those reports read the page again right
    // after the commit's writes -- a forced layout, ~10 ms in Safari, two
    
    let initialReports = pageHost && pageHost !== target ? 2 : 1;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (initialReports > 0) { initialReports -= 1; return; }
            readMetrics();
          });
    resizeObserver?.observe(target);
    if (pageHost && pageHost !== target) resizeObserver?.observe(pageHost);

    // The host already named was read as one when it was named.
    const inline = inlineEditorHost instanceof HTMLElement || canOwnInlineEditor(target);
    // The caret is always page-inline. Property proof controls only formatting
    // commands and can never introduce a second Ribbon editor anatomy.
    setInlineEditorHost((current) => {
      const next = inline ? target : null;
      return current === next ? current : next;
    });
    const previous = inline
      ? {
          ariaLabel: target.getAttribute("aria-label"),
          role: target.getAttribute("role"),
          tabIndex: target.getAttribute("tabindex"),
        }
      : null;
    if (inline) {
      target.setAttribute("data-pdf-native-text-inline-editing", "true");
      target.setAttribute("role", "presentation");
      target.removeAttribute("aria-label");
      target.tabIndex = -1;
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", readMetrics);
      window.removeEventListener("scroll", readMetrics, true);
      // A box kept only to hold this editor over its layer's rebuild is no
      // box of the page: it goes with the editor (or as the editor goes over
      // to the line's rebuilt box).
      if (target.hasAttribute("data-pdf-native-text-host-kept")) { target.remove(); return; }
      if (!inline || !previous || !target.isConnected) return;
      target.removeAttribute("data-pdf-native-text-inline-editing");
      
      // 「保存的时候文本框错位，闪回曾经的位置」): until the reader has read
      // the new bytes and built the boxes again (a second or more), its box
      // stood at its old place while the page drew the text at the new one.
      // It is carried to where the frame was left, and takes no click
      // until the rebuilt box replaces it.
      const finishFrame = finishFrameRectRef.current;
      const openFrame = openFrameRectRef.current;
      finishFrameRectRef.current = null;
      // Where the line starts: a frame turned by a quarter or half round
      // grows from the corner it is turned to (a line typed on along a page
      // turned half round read as moved by its growth).
      const turn = lineAxesTurnRef.current;
      const startX = (rect: DOMRect) => turn === 90 || turn === 180 ? rect.right : rect.left;
      const startY = (rect: DOMRect) => turn === 180 || turn === 270 ? rect.bottom : rect.top;
      const dx = finishFrame && openFrame ? startX(finishFrame) - startX(openFrame) : 0;
      const dy = finishFrame && openFrame ? startY(finishFrame) - startY(openFrame) : 0;
      const moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
      const resized = Boolean(finishFrame && openFrame &&
        (Math.abs(finishFrame.width - openFrame.width) > 2 || Math.abs(finishFrame.height - openFrame.height) > 2));
      if (changeAppliedRef.current && moved) {
        if (!resized && !manualLayoutDirtyRef.current) {
          target.style.translate = `${dx}px ${dy}px`;
          target.setAttribute("data-pdf-native-text-carried", "true");
          window.setTimeout(() => {
            if (!target.isConnected) return;
            target.style.translate = "";
            target.removeAttribute("data-pdf-native-text-carried");
          }, 15_000);
          return restoreAccessibility();
        }
      }
      // A paragraph narrowed or widened by its frame, its rows set again in
      // it: the old box kept its old single-line outline over the new rows
      // until the boxes were built again (3 s, savesweep narrowghost
      
      const frameSet = resized && paragraphFrameSetRef.current;
      if (changeAppliedRef.current && (manualLayoutDirtyRef.current || moved || frameSet)) {
        // The line was moved or resized: its old box is not where the page
        // now shows it. Its frame stayed in its old place until the reader
        // had read the new bytes and built the boxes again (seconds; owner
        
        // no click until then; a reader that never rebuilds (the write
        // refused, the page back as it was) shows it again. A line only
        // retyped keeps its frame where it is, and a press on it opens the
        
        target.setAttribute("data-pdf-native-text-superseded", "true");
        window.setTimeout(() => {
          if (target.isConnected) target.removeAttribute("data-pdf-native-text-superseded");
        }, 15_000);
      }
      restoreAccessibility();
      function restoreAccessibility() {
        for (const [name, value] of [
          ["aria-label", previous!.ariaLabel],
          ["role", previous!.role],
          ["tabindex", previous!.tabIndex],
        ] as const) {
          if (value === null) target!.removeAttribute(name);
          else target!.setAttribute(name, value);
        }
      }
    };
  }, [initialLayout?.pageWidthPx, initialLayout?.pageHeightPx, inlineEditorHost, returnFocusRef]);

  useLayoutEffect(() => {
    markPdfTextLatency("lfx.replacement");
    if (!(inlineEditorHost instanceof HTMLElement)) return;
    const pageWindow =
      ribbonRootRef?.current ??
      inlineEditorHost.closest<HTMLElement>(".pdf-page-window");
    const originalPageHost = inlineEditorHost.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    if (!pageWindow || !originalPageHost) return;
    const pageNumber = originalPageHost.dataset.pageNumber ?? null;
    const paragraphId = inlineEditorHost.getAttribute(
      NATIVE_TEXT_PARAGRAPH_ID_ATTR,
    );
    const itemIndex = inlineEditorHost.getAttribute(
      NATIVE_TEXT_ITEM_INDEX_ATTR,
    );
    if (!pageNumber || (!paragraphId && itemIndex === null)) return;

    const lineText = (value: string | null | undefined) => (value ?? "").replace(/\s+/gu, "");
    const findReplacement = () => {
      // The box the window names for this line on the revision read in (a
      // line opened while that revision was read in, taken over there):
      // the editor goes there, wherever the line's old box went.
      const named = returnFocusRef.current;
      if (named && named !== inlineEditorHost && named.isConnected &&
        pageWindow.contains(named) && canOwnInlineEditor(named) &&
        lineText(named.textContent) === lineText(originalTextRef.current)) {
        named.setAttribute(NATIVE_TEXT_SELECTED_ATTR, "true");
        markedHostsRef.current.add(named);
        // (A box kept over a rebuild goes in the cleanup of the effect above.)
        setInlineEditorHost(named);
        return;
      }
      // Kept over its layer's rebuild (emptyPdfTextLayerForRebuild), the box
      // is no box of the page any more: the line's rebuilt box takes the
      // editor as soon as it is named.
      const keptOverRebuild = inlineEditorHost.hasAttribute("data-pdf-native-text-host-kept");
      if (
        inlineEditorHost.isConnected &&
        pageWindow.contains(inlineEditorHost) && !keptOverRebuild
      ) {
        return;
      }
      const letKeptGo = () => {
        if (!keptOverRebuild) return;
        const kept = inlineEditorHost;
        // After the editor has gone over (its portal leaves this box first).
        requestAnimationFrame(() => { if (kept.isConnected && kept.hasAttribute("data-pdf-native-text-host-kept")) kept.remove(); });
      };
      const currentPageHost = Array.from(
        pageWindow.querySelectorAll<HTMLElement>(
          ".pdf-viewer__page[data-page-number]",
        ),
      ).find((candidate) => candidate.dataset.pageNumber === pageNumber);
      if (!currentPageHost) return;
      // The line's box by its id, carried over the rebuild whatever an edit
      // staged into it did to its words or items (native-text-line-lineage).
      const hostLineId = pdfNativeTextLineIdOf(inlineEditorHost);
      const byLine = findPdfNativeTextBoxByLineId(currentPageHost.querySelector("[data-pdf-text-layer]"), hostLineId);
      if (byLine && byLine !== inlineEditorHost && canOwnInlineEditor(byLine)) {
        byLine.setAttribute(NATIVE_TEXT_SELECTED_ATTR, "true");
        markedHostsRef.current.add(byLine);
        returnFocusRef.current = byLine;
        setInlineEditorHost(byLine);
        letKeptGo();
        return;
      }
      const boxes = Array.from(
        currentPageHost.querySelectorAll<HTMLElement>(
          NATIVE_TEXT_EDIT_BOX_SELECTOR,
        ),
      );
      // The rebuilt layer's boxes not named yet (the viewer names them in
      // the pass after it publishes them): the line is found by its id then,
      // not guessed now by words or an item number another line may hold.
      if (hostLineId && boxes.some((box) => !box.hasAttribute(PDF_NATIVE_TEXT_LINE_ID_ATTR))) return;
      const sameIndex = (candidate: HTMLElement) => paragraphId
        ? candidate.getAttribute(NATIVE_TEXT_PARAGRAPH_ID_ATTR) === paragraphId
        : candidate.getAttribute(NATIVE_TEXT_ITEM_INDEX_ATTR) === itemIndex;
      // An edit of another line can renumber the page's items (a run split
      // by a format of part of it): the box with this line's own text is
      // this line's, by its number or as the only one; by number alone only
      // when no box has its text.
      const wanted = lineText(originalTextRef.current);
      const sameText = wanted ? boxes.filter((candidate) => lineText(candidate.textContent) === wanted) : [];
      const replacement = sameText.find(sameIndex) ??
        (sameText.length === 1 ? sameText[0] : sameText.length ? undefined : boxes.find(sameIndex));
      if (!replacement || replacement === inlineEditorHost || !canOwnInlineEditor(replacement)) return;
      replacement.setAttribute(NATIVE_TEXT_SELECTED_ATTR, "true");
      markedHostsRef.current.add(replacement);
      returnFocusRef.current = replacement;
      setInlineEditorHost(replacement);
      letKeptGo();
    };

    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(findReplacement);
    observer?.observe(pageWindow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        NATIVE_TEXT_ITEM_INDEX_ATTR,
        NATIVE_TEXT_PARAGRAPH_ID_ATTR,
        "data-pdf-native-text-edit-box",
        PDF_NATIVE_TEXT_LINE_ID_ATTR,
      ],
    });
    findReplacement();
    return () => observer?.disconnect();
    // A new layout is the line opened again (taken over on the revision
    // read in): the box the window names for it is looked for at once.
  }, [inlineEditorHost, returnFocusRef, ribbonRootRef, initialLayout]);

  useLayoutEffect(() => {
    if (layoutRect || !(inlineEditorHost instanceof HTMLElement)) return;
    const pageHost = inlineEditorHost.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    if (!pageHost) return;
    const pageRect = pageHost.getBoundingClientRect();
    const targetRect = inlineEditorHost.getBoundingClientRect();
    if (pageRect.width <= 0 || pageRect.height <= 0) return;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const x = clamp((targetRect.left - pageRect.left) / pageRect.width);
    const y = clamp((targetRect.top - pageRect.top) / pageRect.height);
    setLayoutRect({
      x,
      y,
      width: Math.min(1 - x, clamp(targetRect.width / pageRect.width)),
      height: Math.min(1 - y, clamp(targetRect.height / pageRect.height)),
    });
  }, [inlineEditorHost, layoutRect]);

  useLayoutEffect(() => {
    markPdfTextLatency("lfx.surface");
    // Before the proof, only a surface the host already rendered from the
    // reader's own selection witness is published (the line is taken over
    // the moment it is clicked, as in WPS); the blanking fallback below
    // still waits for the proof.
    if ((preparationPending || unverifiedNativeSource) && !initialEditingSurface) return;
    if (inlineEditorHost === undefined) return;
    if (!(inlineEditorHost instanceof HTMLElement)) {
      updateEditingSurfaceStatus("unavailable");
      return;
    }
    const pageHost = inlineEditorHost.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    if (!pageHost) {
      updateEditingSurfaceStatus("unavailable");
      return;
    }

    const previousSurface = editingSurfaceCanvasRef.current;
    const reusingInitialSurface = previousSurface === initialEditingSurface;
    const retirePreviousSurface = () => {
      if (!previousSurface) return;
      if (editingSurfaceCanvasRef.current === previousSurface) editingSurfaceCanvasRef.current = null;
      previousSurface.remove();
      if (!reusingInitialSurface) {
        previousSurface.width = 0;
        previousSurface.height = 0;
      }
    };
    if (initialEditingSurface) {
      retirePreviousSurface();
      styleNativeTextPageCanvas(initialEditingSurface, "editing-surface");
      // A line opened while the page reads in the revision an edit just
      // staged: that revision's drawing lies over the page meanwhile (the
      
      if (initialEditingSurface.hasAttribute("data-pdf-native-text-queued-surface") ||
        pageHost.querySelector('canvas[data-pdf-native-text-source-handoff="true"]')) {
        initialEditingSurface.style.zIndex = "2";
      }
      // Shown as the one it replaces was (a surface drawn again under an
      // open editor: the visibility pass runs again only when the draft's
      // state changes); hidden until that pass on a first one.
      initialEditingSurface.style.visibility = previousSurface?.isConnected && !reusingInitialSurface
        ? previousSurface.style.visibility : "hidden";
      pageHost.appendChild(initialEditingSurface);
      editingSurfaceCanvasRef.current = initialEditingSurface;
      updateEditingSurfaceStatus("ready");
      return;
    }
    // The surface on screen (the provisional one the line opened on) stays
    // until its replacement is drawn: the page is the same without the line
    // either way, and a block moved meanwhile is drawn over it. Taken away
    // first, the moved block went back to its old place for the seconds the
    // new surface took (the source ink showed again), once its proof came.
    if (!previousSurface && !initialEditingSurfacePrepared) updateEditingSurfaceStatus("pending");
    // The page as it stands with the line covered in the colour around it:
    // a surface is always there to show the draft on. With none (a line the
    // writer cannot blank -- a title set in three runs by an earlier round),
    // the draft stayed hidden and the keys typed showed nothing until the
    
    const coverSurface = (): HTMLCanvasElement | null => {
      const source = pageHost.querySelector<HTMLCanvasElement>("canvas[data-pdf-page]");
      const origin = initialLayout?.origin;
      if (!source || !origin || source.width < 1 || source.height < 1) return null;
      const canvas = source.ownerDocument.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      // A page that cannot be copied or painted over gives no surface (the
      // draft then waits for the exact preview, as before).
      try {
        context.drawImage(source, 0, 0);
        const cover = /^#[0-9a-f]{6}$/i.test(initialLayout?.sourceInkCover ?? "") ? initialLayout!.sourceInkCover!
          : sampleTextBoxBackgroundColor(source, origin) ?? "#ffffff";
        // A little past the line's frame across it (a glyph's side bearing),
        // barely along its height: the line under it stays as it is.
        const along = Math.max(2, (initialLayout?.box.fontSize ?? 0) * source.height * 0.25);
        context.fillStyle = cover;
        context.fillRect(origin.x * source.width - along, origin.y * source.height - 1,
          origin.width * source.width + 2 * along, origin.height * source.height + 2);
      } catch {
        return null;
      }
      canvas.dataset.pdfNativeTextCoverSurface = "true";
      return canvas;
    };
    const showCoverSurface = (): boolean => {
      const canvas = coverSurface();
      if (!canvas) return false;
      styleNativeTextPageCanvas(canvas, "editing-surface");
      canvas.style.visibility = previousSurface?.isConnected ? previousSurface.style.visibility : "hidden";
      retirePreviousSurface();
      pageHost.appendChild(canvas);
      editingSurfaceCanvasRef.current = canvas;
      updateEditingSurfaceStatus("ready");
      return true;
    };
    if (initialEditingSurfacePrepared) {
      if (showCoverSurface()) return;
      retirePreviousSurface();
      updateEditingSurfaceStatus("unavailable");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void prepareEditingSurfaceRef
      .current(
        createPdfNativeTextBlankingDraft(originalText),
        sourcePropertyDraftRef.current,
        pageHost,
        controller.signal,
      )
      .then((canvas) => {
        if (cancelled || controller.signal.aborted) {
          canvas?.remove();
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          return;
        }
        if (!canvas) {
          if (showCoverSurface()) return;
          retirePreviousSurface();
          updateEditingSurfaceStatus("unavailable");
          const exact = publishedPreviewCanvasRef.current;
          if (exact) {
            publishExactPreviewCanvas(exact, pageHost);
          }
          return;
        }
        styleNativeTextPageCanvas(canvas, "editing-surface");
        // Shown as the one it replaces was (the visibility pass runs again
        // only when the draft's state changes).
        canvas.style.visibility = previousSurface?.isConnected ? previousSurface.style.visibility : "hidden";
        retirePreviousSurface();
        pageHost.appendChild(canvas);
        editingSurfaceCanvasRef.current = canvas;
        updateEditingSurfaceStatus("ready");
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        if (showCoverSurface()) return;
        retirePreviousSurface();
        updateEditingSurfaceStatus("unavailable");
        const exact = publishedPreviewCanvasRef.current;
        if (exact) {
          publishExactPreviewCanvas(exact, pageHost);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    preparationPending,
    unverifiedNativeSource,
    initialEditingSurface,
    initialEditingSurfacePrepared,
    inlineEditorHost,
    originalText,
    pageViewportSize?.height,
    pageViewportSize?.width,
    publishExactPreviewCanvas,
    suppressSourceCanvas,
    updateEditingSurfaceStatus,
  ]);

  useEffect(() => {
    return () => releasePublishedPreview();
  }, [releasePublishedPreview]);
  // A frame being dragged (moved, resized or turned) is not where it will be
  // let go: its exact preview is asked for at the drop. Asked for at each
  // step of a resize, the previews queued behind one another (a second or two
  // each on a long paragraph) and Leave waited them out (IRS Pub. 15: 6 s).
  const frameDragging = layoutDrag !== null;

  useEffect(() => {
    // The authoritative save updates host receipt/runtime state before the
    // dialog closes. That can replace `onPreparePreview` while this exact
    // candidate is still commit-pending. Keep the submitted canvas pinned;
    // otherwise a fresh preview replaces it, then unmount cleanup restores the
    // old source canvas and produces a visible whole-page flash.
    if (preparationPending || unverifiedNativeSource || submitting || applyingRef.current) return;
    // A block being carried by its frame is not where it will be dropped
    // (its state holds the drag's first step): its exact preview is asked
    // for at the drop. Asked for at that first step, a preview of a place
    // already left was drawn during the drag and landed after the drop.
    if (frameDragging) return;
    if (composing) {
      // IME pre-edit values are not committed text. Keep them in the immediate
      // local draft only; compositionend schedules one exact preview for the
      // final candidate value.
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }
    if (deletesOnLeave) {
      // An emptied line is deleted when it is left, never written as empty
      // text: there is nothing to preview. Asked of the writer, "" came back
      // as "cannot be rewritten in place", shown over a plain deletion.
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }
    
    // overflowed (no break typed, the box not promoted, resized or refused)
    // is still previewed exactly: Leave sets it by the page's own text first
    // (typedBreakNative), and that write's own measure decides whether it
    // stays one row -- the draft's, a few percent off, wrapped a title the
    
    const forcedByOverflowOnly = layoutFallbackForced && !openedInFallbackLane && !initialLayout?.promoted &&
      !unprovenTextBoxFormat && !manualLayoutDirty && !replacementText.includes("\n") && !refusalFallbackActive &&
      !managedLayoutTypography && paragraphChanges === null && paragraphFrameRequest === null;
    // A break typed (Enter) that Leave sets by the paragraph rewrite in the
    // page's own text (typedBreakNative) is previewed as that write: the
    // browser's own wrapping was shown meanwhile, and the lines broke
    // elsewhere once left (docs/pdf/text-edit-unified-model.md).
    // A typed break's preview only shows the paragraph write: refused, the
    // draft shows and Leave writes the break as before (below).
    const breakPreviewOnly = layoutFallbackForced && !forcedByOverflowOnly && typedBreakNative;
    if (layoutFallbackForced && !forcedByOverflowOnly && !typedBreakNative) {
      const previous = publishedPreviewCanvasRef.current;
      publishedPreviewCanvasRef.current = null;
      validatedPreviewDraftKeyRef.current = null;
      previous?.remove();
      if (previous) {
        previous.width = 0;
        previous.height = 0;
      }
      setPreviewBusy(false);
      setPreviewError(null);
      return;
    }
    const previewInputsSignature = JSON.stringify([
      previewDraftKey, metrics?.height ?? null, metrics?.width ?? null, initialLayout?.sourceInputKey ?? null,
      drawnSourceSha256,
    ]);
    if (!draftDirty) {
      const previous = publishedPreviewCanvasRef.current;
      publishedPreviewCanvasRef.current = null;
      previous?.remove();
      if (previous) {
        previous.width = 0;
        previous.height = 0;
      }
      validatedPreviewDraftKeyRef.current = previewDraftKey;
      previewInputsRef.current = { host: inlineEditorHost, signature: previewInputsSignature };
      lastPreviewAskedRef.current = { text: replacementText, formats: previewDraftKey };
      setPreviewBusy(false);
      setPreviewError(null);
      if (editingSurfaceStatusRef.current === "unavailable") {
        const suppressed = suppressedSourceCanvasRef.current;
        suppressedSourceCanvasRef.current = null;
        if (suppressed?.canvas.isConnected) {
          suppressed.canvas.style.visibility = suppressed.visibility;
        }
      }
      return;
    }
    // Only the frame moved or turned since this draft key was validated:
    // nothing new to draw, and asking again made the finish wait for a
    // candidate the turned frame does not show.
    const previewInputs = previewInputsRef.current;
    if (
      validatedPreviewDraftKeyRef.current === previewDraftKey &&
      previewInputs !== null &&
      previewInputs.host === inlineEditorHost &&
      previewInputs.signature === previewInputsSignature
    ) {
      setPreviewBusy(false);
      return;
    }
    if (!inlineEditorHost) {
      releasePublishedPreview();
      return;
    }
    const pageHost = inlineEditorHost.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    if (!pageHost) {
      const unavailableTimer = window.setTimeout(() => {
        setPreviewBusy(false);
        setPreviewError(translate("pdf.nativeTextEdit.previewUnavailable"));
      }, 0);
      return () => window.clearTimeout(unavailableTimer);
    }

    const controller = new AbortController();
    const generation = previewGenerationRef.current + 1;
    previewGenerationRef.current = generation;
    activePreviewControllerRef.current = controller;
    let cancelled = false;
    setPreviewBusy(true);
    setPreviewError(null);
    const startPreview = async () => {
      if (activePreviewStartRef.current === start) activePreviewStartRef.current = null;
      window.clearTimeout(timer);
      if (activePreviewTimerRef.current === timer) activePreviewTimerRef.current = null;
      await afterPdfTextInteractionPaint();
      if (cancelled || controller.signal.aborted) return;
      const endPreviewMark = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_MRAI_PDF_LATENCY === "1"
        ? startPdfTextLatency("preview", { generation }) : null;
      const pendingPreview = Promise.resolve().then(() => paragraphFrameRequest !== null ? onPreparePreview(
        replacementText, properties, pageHost, controller.signal, undefined, paragraphFrameRequest,
      ) : paragraphChanges ? onPreparePreview(
        replacementText, properties, pageHost, controller.signal, paragraphChanges,
      ) : boxFormatPreview ? onPreparePreview(
        replacementText, properties, pageHost, controller.signal, undefined, undefined, boxFormatPreview,
      ) : onPreparePreview(replacementText, properties, pageHost, controller.signal));
      void pendingPreview.then((candidateCanvas) => {
          if (
            cancelled ||
            controller.signal.aborted ||
            generation !== previewGenerationRef.current
          ) {
            candidateCanvas?.remove();
            if (candidateCanvas) {
              candidateCanvas.width = 0;
              candidateCanvas.height = 0;
            }
            return;
          }
          const previous = publishedPreviewCanvasRef.current;
          if (candidateCanvas) {
            styleNativeTextPageCanvas(candidateCanvas, "candidate");
            if (editingSurfaceStatusRef.current === "unavailable") {
              publishExactPreviewCanvas(candidateCanvas, pageHost);
            } else {
              candidateCanvas.style.visibility = "hidden";
              pageHost.appendChild(candidateCanvas);
            }
          }
          publishedPreviewCanvasRef.current = candidateCanvas;
          if (candidateCanvas && initialLayout?.sourceInputKey) {
            candidateGeometryPropertiesRef.current = JSON.stringify(properties);
            setCandidateInk(readPdfCandidateTextInk(candidateCanvas));
            setCandidateGeometry(readPdfNativeTextSourceGeometry(candidateCanvas,initialLayout.sourceInputKey,replacementText));
            const nextLayout = readPdfNativeTextInputLayout(candidateCanvas, initialLayout.sourceInputKey, replacementText);
            if (nextLayout) {
              const input = inputRef.current;
              const previousLayout = sourceInputLayoutRef.current;
              // The caret is carried into the new rows only while the input
              // still shows the draft this preview was drawn for. Keys typed
              // since (a fast reader; keys typed ahead while the line opened)
              // are in neither layout: mapped through them, the caret was
              // clamped to the old text's end, and the next key went in there,
              // before the ones typed meanwhile (「…对齐2b01」 for 「b012」).
              const shown = input?.value ?? null;
              const drawnForShown = shown !== null && (previousLayout
                ? previousLayout.value === shown && previousLayout.text === replacementText
                : shown === replacementText);
              if (drawnForShown) {
                const start = input?.selectionStart ?? 0;
                const end = input?.selectionEnd ?? start;
                const canonicalStart = previousLayout ? pdfNativeTextInputCanonicalOffset(previousLayout, start) : start;
                const canonicalEnd = previousLayout ? pdfNativeTextInputCanonicalOffset(previousLayout, end) : end;
                pendingProjectedCaretRef.current = {
                  start: pdfNativeTextInputDisplayOffset(nextLayout, canonicalStart),
                  end: pdfNativeTextInputDisplayOffset(nextLayout, canonicalEnd),
                  direction: input?.selectionDirection ?? "none",
                };
              }
              setSourceInputLayout(nextLayout);
            }
          }
          validatedPreviewDraftKeyRef.current = previewDraftKey;
          // The last format draft the writer took: a later press it refuses
          // goes back to this (nativeFormatRefused), never into a text box.
          acceptedPropertiesRef.current = propertiesRef.current;
          acceptedPartFormatsRef.current = partFormatsRef.current;
          if (previous && previous !== candidateCanvas) {
            previous.remove();
            previous.width = 0;
            previous.height = 0;
          }
          if (
            !candidateCanvas &&
            editingSurfaceStatusRef.current === "unavailable"
          ) {
            const suppressed = suppressedSourceCanvasRef.current;
            suppressedSourceCanvasRef.current = null;
            if (suppressed?.canvas.isConnected) {
              suppressed.canvas.style.visibility = suppressed.visibility;
            }
          }
          const refusedByServer = serverRefusedDraftRef.current;
          if (refusedByServer?.draftKey === previewDraftKey) {
            setPreviewError(refusedByServer.message);
            setNativeRefusalDraftKey(previewDraftKey);
          } else {
            setPreviewError(null);
            setNativeRefusalDraftKey(null);
            // Characters the line's own compile has set: the window may finish
            // words made only of these without this editor (onDetachFinish).
            for (const character of replacementText) provenCharactersRef.current!.add(character);
            compiledOnceRef.current = true;
            provenPropertiesKeyRef.current = JSON.stringify(properties ?? null);
          }
        })
        .catch((reason: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          if (process.env.NODE_ENV !== "production") {
            try {
              console.debug("[pdf-text-preview] refused " + JSON.stringify({
                message: reason instanceof Error ? reason.message.slice(0, 160) : String(reason).slice(0, 160),
                frame: paragraphFrameRequest, properties: properties !== null, paragraph: paragraphChanges !== null }));
            } catch { /* diagnostics never throw */ }
          }
          // A typed break's preview refused leaves Leave as it was: the
          
          // refuses. Kept as this draft's refusal, Leave wrote nothing.
          if (breakPreviewOnly) {
            setPreviewError(null);
            setNativeRefusalDraftKey(null);
            return;
          }
          // Keep the last exact page canvas stable underneath the local draft.
          // Restoring the old source canvas here made rejected CJK input look
          // as if it had disappeared and produced a full-page flash.
          setPreviewError(nativeTextPreviewErrorMessage(reason, translate));
          // A format of part of the run the run cannot be split for stays a
          // draft with its reason: a text box would keep the text but drop
          // the format the reader just chose.
          const message = reason instanceof Error ? reason.message
            : (reason as { message?: unknown } | null)?.message;
          // A resized frame the paragraph already breaks in changes nothing:
          // the frame stays as dragged and there is nothing to write.
          if (typeof message === "string" && PARAGRAPH_FRAME_UNCHANGED_REFUSAL.test(message)) {
            setPreviewError(null);
            setNativeRefusalDraftKey(null);
            // The frame asked was the text box's the line was typed into,
            // not one the reader dragged: these words stand in it already.
            // (A Leave that waited for this answer has nothing to write.)
            if (paragraphFrameRight === null && paragraphFrameRequest?.right !== undefined &&
              paragraphFrameRequest.lineStep === undefined && paragraphFrameRequest.sizeScale === undefined) {
              leftWithFrameStandingRef.current = finishPendingRef.current;
              setHandoffFrameStandsFor(replacementText);
            }
            setParagraphFrameRight(null);
            return;
          }
          const partFormat = typeof message === "string" &&
            (PART_FORMAT_DRAWING_REFUSAL.test(message) || PART_FORMAT_GLYPH_REFUSAL.test(message));
          setNativeRefusalDraftKey(isNativeWriterRefusal(reason) && !partFormat ? previewDraftKey : null);
          setPartFormatRefusalKey(partFormat ? previewDraftKey : null);
        })
        .finally(() => {
          endPreviewMark?.(cancelled || controller.signal.aborted ? "cancelled" : "done");
          if (
            !cancelled &&
            !controller.signal.aborted &&
            generation === previewGenerationRef.current
          ) {
            setPreviewBusy(false);
          }
        });
    };
    const start = () => { void startPreview(); };
    previewInputsRef.current = { host: inlineEditorHost, signature: previewInputsSignature };
    const scheduledAt = performance.now();
    const afterPause = scheduledAt - lastPreviewScheduledAtRef.current >= NATIVE_TEXT_EXACT_PREVIEW_IDLE_MS;
    lastPreviewScheduledAtRef.current = scheduledAt;
    // The draft key is the words and every format: the same words, another
    // key, is a change of formats alone.
    const asked = { text: replacementText, formats: previewDraftKey };
    const formatsAlone = lastPreviewAskedRef.current !== null && lastPreviewAskedRef.current.text === asked.text &&
      lastPreviewAskedRef.current.formats !== asked.formats;
    lastPreviewAskedRef.current = asked;
    // Leaving draws at once (the write asks the planner the same question,
    // and is answered with this plan: list-text-fidelity propertyPlans).
    const timer = window.setTimeout(start, finishPendingRef.current ? 0
      : formatsAlone ? NATIVE_TEXT_FORMAT_PREVIEW_SETTLE_MS : afterPause ? 0 : NATIVE_TEXT_EXACT_PREVIEW_IDLE_MS);
    activePreviewStartRef.current = start;
    activePreviewTimerRef.current = timer;

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
      if (activePreviewTimerRef.current === timer) {
        activePreviewTimerRef.current = null;
      }
      if (activePreviewStartRef.current === start) activePreviewStartRef.current = null;
      if (activePreviewControllerRef.current === controller) {
        activePreviewControllerRef.current = null;
      }
    };
  }, [
    paragraphFrameRequest,
    boxFormatPreview,
    frameDragging,
    composing,
    deletesOnLeave,
    draftDirty,
    inlineEditorHost,
    translate,
    layoutFallbackForced, typedBreakNative,
    openedInFallbackLane, initialLayout?.promoted, unprovenTextBoxFormat, manualLayoutDirty,
    refusalFallbackActive, managedLayoutTypography,
    paragraphChanges,
    metrics?.height,
    metrics?.width,
    onPreparePreview,
    properties,
    publishExactPreviewCanvas,
    releasePublishedPreview,
    replacementText,
    previewDraftKey,
    preparationPending,
    unverifiedNativeSource,
    submitting,
    drawnSourceSha256,
    initialLayout?.sourceInputKey,
    setPreviewError,
  ]);

  const initialFocusAppliedRef = useRef(false);
  // (Development timing: the first render of this opening.)
  const firstRenderMarkedRef = useRef(false);
  if (!firstRenderMarkedRef.current) {
    firstRenderMarkedRef.current = true;
    markPdfTextLatency("editor.first-render", process.env.NODE_ENV !== "production"
      ? { caret: initialCaretOffset ?? null, draft: initialDraftText != null, open, pending: preparationPending } : undefined);
  }
  useLayoutEffect(() => {
    markPdfTextLatency("lfx.focus", { host: inlineEditorHost === undefined ? "undefined" : "set", applied: initialFocusAppliedRef.current });
    if (inlineEditorHost === undefined) return;
    if (initialFocusAppliedRef.current) return;
    const input = inputRef.current;
    if (!input) return;
    initialFocusAppliedRef.current = true;
    markPdfTextLatency("editor.focus");
    if (objectSelectedRef.current) {
      // Selected as a block: the keyboard is the block's, and the caret,
      // not drawn, waits after its text, where a typed key goes (WPS).
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    const currentOffset = sourceCaretControllerRef.current?.offsetAtPoint(initialLayout?.caretPoint) ?? (initialLayout && (initialLayout.promoted || sourceInputLayoutRef.current)
      ? pdfTextCaretOffsetAtPagePoint(
          visualDraftElementRef.current,
          inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page") ?? null,
          initialLayout.caretPoint, initialLayout.box.angle ?? 0,
        )
      : null);
    const caretOffset = Math.max(
      0,
      Math.min(
        input.value.length,
        currentOffset ?? (initialCaretOffset != null && sourceInputLayoutRef.current
          ? pdfNativeTextInputDisplayOffset(sourceInputLayoutRef.current, initialCaretOffset) : initialCaretOffset) ?? input.value.length,
      ),
    );
    input.focus({ preventScroll: true });
    input.setSelectionRange(caretOffset, caretOffset);
  }, [
    editingSurfaceStatus,
    initialCaretOffset,
    initialLayout,
    inlineEditorHost,
    requireRibbonHost,
    ribbonHost,
  ]);


  useEffect(() => {
    const returnTarget = returnFocusRef.current;
    const marked = markedHostsRef.current;
    // (Read while the line's box is on the page.)
    const editorWindow = returnTarget?.closest<HTMLElement>(".pdf-page-window") ?? null;
    return () => {
      // The boxes this line moved to as its page was read again were marked
      // selected too: left, none of them stays selected (a line left by
      // Escape after it reopened on its revision kept its box selected, and
      // the next Escape only let that go).
      for (const host of marked) {
        if (host !== returnTarget && host.isConnected) host.removeAttribute(NATIVE_TEXT_SELECTED_ATTR);
      }
      if (!returnTarget?.isConnected) {
        // The line's box is gone with the editor (the line deleted, or made
        // a formula box): the keyboard goes to the window, whose shortcuts
        // must hear it, as a shape's frame that goes hands it there. It
        // fell to the page's body, and Cmd+Z right after 转换为公式 did
        
        // holds it: a line opened next, or a control pressed, keeps it.
        if (restoreFocusOnCloseRef.current && editorWindow) {
          const giveToWindow = () => {
            const active = document.activeElement;
            if (editorWindow.isConnected && (!active || active === document.body)) {
              editorWindow.focus({ preventScroll: true });
            }
          };
          giveToWindow();
          requestAnimationFrame(giveToWindow);
        }
        return;
      }
      returnTarget.removeAttribute(NATIVE_TEXT_SELECTED_ATTR);
      if (restoreFocusOnCloseRef.current) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, [returnFocusRef]);

  // Formats pressed on a line no run property states (a Word print's line
  // of several shows, set by row formats when it is left): the exact preview
  // is of its words only, and shown over the draft it hid every format
  
  // bold superscript shown plain). The draft, which draws them, is shown.
  const previewLacksFormats = properties === null &&
    (partFormats.length > 0 || (rowFormat !== null && Object.keys(rowFormat).length > 0)) &&
    publishedPreviewCanvasRef.current?.dataset.mraiBoxFormat !== "1";
  const exactPreviewIsCurrent = exactPreviewAcceptedDraft && !previewLacksFormats;
  // What the line waits for is its words' preview: the formats it lacks are
  // the row formats Leave writes. Waiting for a preview of them too, a line
  
  const needsExactPreview =
    draftDirty && !layoutFallbackActive && !exactPreviewAcceptedDraft && !deletesOnLeave;
  const partFormatRefusal = previewError !== null && partFormatRefusalKey === previewDraftKey ? previewError : null;
  // The blockers that have already settled on THIS draft, told apart from the
  // two "still previewing" placeholders that surround them. A settled one is
  // the whole answer to why this draft cannot be written, and it outlives the
  // dialog's own notice: the window's save control is grey for exactly this
  // reason and must be able to say so instead of "the page is not ready".
  const settledApplyDisabledReason =
    applyDisabledReason ??
    previewError ??
    (managedLayoutTypography && !managedTypographySupported
      ? translate("pdf.nativeTextEdit.fontStyleUnsupported")
      : null) ??
    (layoutFallbackActive && ownLayoutRect && measuredMinimumWidth > (1-ownLayoutRect.x)*ownPageWidthPixels + .01
      ? translate("pdf.nativeTextEdit.characterDoesNotFit")
      : null) ??
    (layoutFallbackActive && unresolvedParagraphColor
      ? translate("pdf.nativeTextEdit.mixedColorsReflow")
      : null);
  // A source the host has not handed over yet says why when the host names a
  // reason (the page is read-only, another write is finishing); the box
  // takes typing meanwhile, so a blanket "previewing" would hide it.
  const effectiveApplyDisabledReason =
    (preparationPending ? labels.previewing : null) ??
    (unverifiedNativeSource ? applyDisabledReason ?? labels.previewing : null) ??
    settledApplyDisabledReason ??
    (previewBusy || needsExactPreview ? labels.previewing : null);
  const replacementTextIsValid =
    replacementText.length > 0 &&
    replacementText.length <= 2_000 &&
    (layoutFallbackActive || !/[\r\n]/.test(replacementText));
  const waitingForExactPreview =
    needsExactPreview &&
    (previewBusy || composing) &&
    !busy &&
    !submitting &&
    !applyDisabledReason &&
    !previewError &&
    replacementTextIsValid;
  const actionUnavailable =
    busy ||
    submitting ||
    composing ||
    previewBusy ||
    needsExactPreview ||
    Boolean(effectiveApplyDisabledReason) ||
    !replacementTextIsValid;
  // Why a dirty draft still cannot be written, once nothing is in flight.
  // Null while the answer is still being computed, so a caller never reports
  // a verdict the compiler has not reached yet.
  const commitBlockedReason =
    draftDirty &&
    !busy &&
    !submitting &&
    !composing &&
    !previewBusy &&
    !preparationPending &&
    !unverifiedNativeSource
      ? settledApplyDisabledReason
      : null;
  // A draft the native writer declined to set in place that the text-box
  
  
  // shares (mixed colours it cannot carry) keeps it out.
  // A draft that only grew past its box (autoLayoutExpanded) still asks the
  // native writer first; when that writer refuses it (a run its new spacing
  
  // like any other refusal instead of leaving the refusal on screen.
  
  // would draw those words. A format its page does not take is said so.)
  const refusalFallbackEligible =
    !wordsUnread &&
    !layoutFallbackForced &&
    previewError !== null &&
    nativeRefusalDraftKey === previewDraftKey &&
    !applyDisabledReason &&
    !paragraphChanges &&
    !unresolvedParagraphColor &&
    Boolean(initialLayout && effectiveLayoutRect) &&
    replacementText.trim().length > 0 &&
    replacementText.length <= 2_000;
  // Character spacing, word spacing and horizontal scale go with the line
  
  // its Tf, or a stored box's fractions over its size) and percent, so the
  
  
  // (the ribbon's unit); the box keeps it as a fraction of the page height.
  const wrappedBoxPoints = Number(initialLayout?.box.fontSize) * Number(initialLayout?.pageHeightPoints);
  const wrappedOverrideEm = (points: number | undefined) =>
    points !== undefined && wrappedBoxPoints > 0 ? points / wrappedBoxPoints : undefined;
  const wrappedCharacterEm = properties && properties.fontSize > 0
    ? properties.characterSpacing / properties.fontSize
    : wrappedOverrideEm(layoutTypographyOverride.characterSpacing) ??
      (initialLayout?.box.fontSize ? (initialLayout.box.characterSpacing ?? 0) / initialLayout.box.fontSize : 0);
  const wrappedWordEm = properties && properties.fontSize > 0
    ? properties.wordSpacing / properties.fontSize
    : wrappedOverrideEm(layoutTypographyOverride.wordSpacing) ??
      (initialLayout?.box.fontSize ? (initialLayout.box.wordSpacing ?? 0) / initialLayout.box.fontSize : 0);
  const wrappedHorizontalScale = properties
    ? properties.horizontalScale > 0 ? properties.horizontalScale : 100
    : layoutTypographyOverride.horizontalScale ??
      (initialLayout?.box.horizontalScale && initialLayout.box.horizontalScale > 0
        ? initialLayout.box.horizontalScale : 100);
  const wrappedSpacingPoints = (em: number): number | null => {
    const size = initialLayout?.box.fontSize;
    const pagePoints = initialLayout?.pageHeightPoints;
    if (!initialLayout?.promoted || !size || !pagePoints) return null;
    return Math.round(em * size * pagePoints * 100) / 100;
  };
  // The wrapped draft is laid out 1/k as wide and drawn scaled by k, the way
  // the text-box writer sets a Tz line (pdfTextBoxHorizontalScaleFrame).
  const wrappedScaleX = layoutFallbackActive && Math.abs(wrappedHorizontalScale - 100) > 1e-6
    ? wrappedHorizontalScale / 100 : 1;
  useLayoutEffect(() => {
    const element = visualDraftElementRef.current;
    if (!element || !layoutFallbackActive || layoutVerticalAlign === "top") {
      setDraftVerticalOffsetPx((current) => (current === 0 ? current : 0));
      return;
    }
    // The rows' own height: the text's extent, in the element's own pixels
    // (its frame may be scaled by the page's transform).
    const range = document.createRange();
    range.selectNodeContents(element);
    const rows = range.getBoundingClientRect();
    const frame = element.getBoundingClientRect();
    const scale = element.offsetHeight > 0 && frame.height > 0 ? frame.height / element.offsetHeight : 1;
    const next = Math.round(pdfTextBoxVerticalOffset(
      layoutVerticalAlign, element.offsetHeight, rows.height / scale) * 10) / 10;
    setDraftVerticalOffsetPx((current) => (Math.abs(current - next) < 0.5 ? current : next));
  });
  const layoutDraft = useMemo<PdfNativeTextLayoutDraft | null>(() => {
    if (!layoutFallbackActive || !initialLayout || !effectiveLayoutRect) {
      return null;
    }
    const selected = propertyProof?.fonts.find(
      (font) => font.resourceName === properties?.fontResourceName,
    );
    // First promotion also keeps the source CSS stack: replacing it with a
    // canonical picker name would lose the matching live PDF font at save.
    const useStoredTypography = !fontDraftChanged;
    const originalPropertySize = propertyBaseline?.fontSize ?? 0;
    const initialFontSize =
      typeof initialLayout.box.fontSize === "number" &&
      Number.isFinite(initialLayout.box.fontSize) &&
      initialLayout.box.fontSize > 0
        ? initialLayout.box.fontSize
        : draftFontSizePixels / pageHeightPixels;
    
    // a line with no property proof still carries the reader's property
    // estimate, whose size never moves, and a 增大字号 shown as 四号 was
    
    // A run group's size is its scale: the frame grew by it, and the text
    
    // line pressed to 四号 saved its box taller, its text still 10.56 pt).
    const groupScaleY = propertyOverride?.groupScale?.y;
    const fontScale =
      managedLayoutTypography && managedFontSize !== null && managedSizeBaseline > 0
        ? managedFontSize / managedSizeBaseline
        : groupScaleY !== undefined && Number.isFinite(groupScaleY) && groupScaleY > 0
        ? groupScaleY
        : paragraphSizeScale !== null
        ? paragraphSizeScale
        : properties && originalPropertySize > 0
        ? properties.fontSize / originalPropertySize
        : managedFontSize !== null && managedSizeBaseline > 0
          ? managedFontSize / managedSizeBaseline
        : 1;
    const fontFamily = managedLayoutTypography
      ? managedFontFamily
      : (useStoredTypography ? initialLayout.box.fontFamily : selected?.family) ?? initialLayout.box.fontFamily;
    const sourceFontName = managedLayoutTypography
      ? managedSourceFontName
      : (useStoredTypography ? initialLayout.box.sourceFontName : selected?.baseFont) ?? initialLayout.box.sourceFontName;
    return Object.freeze({
      id: initialLayout.box.id,
      page: initialLayout.box.page,
      ...effectiveLayoutRect,
      angle: normalizeBoxAngle(layoutAngle),
      originX: initialLayout.origin.x,
      originY: initialLayout.origin.y,
      originWidth: initialLayout.origin.width,
      originHeight: initialLayout.origin.height,
      pageWidthPx: initialLayout.pageWidthPx,
      pageHeightPx: initialLayout.pageHeightPx,
      fontSize: Math.max(0.0001, initialFontSize * fontScale),
      ...(fontFamily ? { fontFamily } : {}),
      ...(sourceFontName ? { sourceFontName } : {}),
      // The line's own face says whether it is bold or italic: the reader's
      // layout box does not (a Helvetica-Oblique line promoted to a box by a
      // typed 你好 was saved upright, walk u-cjk-s1).
      // A face named bold is bold too (r02-23: a MeiryoUI-Bold line the
      // reader styled regular was saved light).
      // Bold pressed on the whole line this session (its rows' format,
      // written in the page's text when it can be) is the line's too when
      // it has to become a box: a paragraph a form draws, set bold and then
      
      // then written as page text with its bold stroked (the window's
      // handleCreatedTextBoxCommit). The other formats pressed so are not
      // carried: only the text-box writer keeps them, and a box it draws
      // into the page cannot be taken back with the line's delete.
      bold: managedLayoutTypography ? managedBold : rowFormat?.bold ?? (useStoredTypography
        ? Boolean(initialLayout.box.bold || selected?.bold ||
          pdfNativeFaceNameStyle(sourceFontName ?? "").bold)
        : (selected?.bold ?? Boolean(initialLayout.box.bold))),
      italic: managedLayoutTypography ? managedItalic : useStoredTypography
        ? Boolean(initialLayout.box.italic || selected?.italic || pdfNativeFaceNameStyle(sourceFontName ?? "").italic)
        : (selected?.italic ?? Boolean(initialLayout.box.italic)),
      color: draftColor,
      align: managedLayoutTypography && managedJustify ? "left" :
        properties?.alignment ?? managedAlignment ?? initialLayout.box.align ?? "left",
      ...(managedLayoutTypography
        ? { underline: managedUnderline, strikethrough: managedStrikethrough, justify: managedJustify,
            
            // even when absent, so formats taken off leave no stale runs.
            runs: managedRuns ?? undefined, officeFamily: managedOfficeFamily }
        : {}),
      ...(wrappedCharacterEm ? { characterSpacing: wrappedCharacterEm * Math.max(0.0001, initialFontSize * fontScale) } : {}),
      ...(wrappedWordEm ? { wordSpacing: wrappedWordEm * Math.max(0.0001, initialFontSize * fontScale) } : {}),
      ...(Math.abs(wrappedHorizontalScale - 100) > 1e-6 ? { horizontalScale: wrappedHorizontalScale } : {}),
      // Stated whatever it is, so Top takes a box's earlier Middle off.
      verticalAlign: layoutVerticalAlign === "top" ? undefined : layoutVerticalAlign,
      ...(sourceLineLayoutPreserved && paragraphFrameRequest === null && !managedLayoutTypography &&
        replacementText.length > 0 && !replacementText.includes("\n")
        ? { lineLayout: [Object.freeze({ start: 0, end: replacementText.length, x: 0, y: 0, width: 1, height: 1 })] }
        : {}),
    });
  }, [
    rowFormat?.bold,
    sourceLineLayoutPreserved, paragraphFrameRequest, replacementText,
    wrappedCharacterEm, wrappedWordEm, wrappedHorizontalScale, layoutVerticalAlign,
    draftFontSizePixels,
    effectiveLayoutRect,
    initialLayout,
    layoutAngle,
    layoutFallbackActive,
    draftColor,
    pageHeightPixels,
    fontDraftChanged,
    propertyBaseline,
    propertyOverride?.groupScale?.y,
    paragraphSizeScale,
    properties,
    propertyProof,
    paragraphColor,
    managedFontSize,
    managedSizeBaseline,
    managedAlignment,
    managedLayoutTypography, managedFontFamily, managedSourceFontName, managedBold, managedItalic,
    managedUnderline, managedStrikethrough, managedJustify, managedRuns, managedOfficeFamily,
  ]);
  // Whether this draft can be written now, as Leave reads it (set below,
  // where a move-and-resize draft is told apart: it does not wait for its
  // preview).
  const finishActionUnavailableRef = useRef(actionUnavailable);
  // ...and whether it goes without its exact preview: then no candidate of
  // an earlier draft (the box before its resize) is put up as its bridge.
  const finishWithoutPreviewRef = useRef(false);
  const requestApply = useCallback(async (): Promise<boolean> => {
    // An emptied line is saved by being deleted (requestFinish), as WPS
    // takes an emptied box away when it is left: over an empty text Save
    
    if (deletesOnLeave && !applyingRef.current && !submitting && !busy) {
      requestFinishRef.current();
      return true;
    }
    if (finishActionUnavailableRef.current || applyingRef.current) return false;
    setCommitError(null);
    applyingRef.current = true;
    setSubmitting(true);
    // The frame below is measured from the draft: in the PDF's own East
    // Asian face, not the system face shown while it loads (first use only;
    // bounded, a face that cannot load keeps the old measure).
    if (needsEastAsianFace(replacementText) && pdfEastAsianFaceStatus() !== "available") {
      await Promise.race([
        ensurePdfEastAsianFace(),
        new Promise<void>((resolve) => { window.setTimeout(resolve, 1500); }),
      ]);
    }
    // A turned frame is written as a box at its angle; the candidate drawn
    // at the source angle must not bridge it (it kept the old line level
    // beside the turned box until the page painted).
    const candidateCanvas = layoutAngleChanged || finishWithoutPreviewRef.current
      ? null : publishedPreviewCanvasRef.current;
    const pageHost = inlineEditorHost?.closest<HTMLElement>(
      ".pdf-viewer__page[data-page-number]",
    );
    if (candidateCanvas && pageHost) {
      publishExactPreviewCanvas(candidateCanvas, pageHost);
    }
    if (candidateCanvas) candidateCanvas.style.zIndex = "2";
    if (candidateCanvas && visualDraftElementRef.current) {
      visualDraftElementRef.current.style.visibility = "hidden";
    }
    candidateCanvas?.setAttribute(
      "data-pdf-native-text-commit-pending",
      "true",
    );
    let uncarryLift: (() => void) | null = null;
    try {
      // The exact candidate is published above and must paint before the
      
      // paint first, and waited a frame plus a task for nothing.
      if (candidateCanvas) await afterPdfTextInteractionPaint();
      markPdfTextLatency("finish.apply");
      // The whole box's family, colour or slant, its words unchanged: set on
      // each row in the page's own text (the window stages one edit a row).
      // Words typed too: the whole box's format and the words as one write
      // of its paragraph (a part's format named rows of the words it had).
      if (boxRowFormat && applyBoxFormat && !manualLayoutDirty && paragraphFrameRequest === null) {
        // Words typed too: the parts pressed, moved with the words
        // (partFormats), as parts of the new text.
        const wordsTyped = replacementText !== originalText;
        
        // set on its runs again.
        const runParts = propertyDraftChanged
          ? partFormatsRef.current.flatMap((part) => {
            if (part.start > 0 || part.end < replacementText.length) return [part];
            const { sizePoints: _size, bold: _bold, ...rest } = part;
            void _size; void _bold;
            return Object.keys(rest).length > 2 ? [rest] : [];
          })
          : partFormatsRef.current;
        const asked = wordsTyped ? rowFormatWithParts(boxRowFormat, runParts) : boxRowFormat;
        
        // stroke) goes first, then the formats its runs take, each on the
        // page as the one before it left it.
        if (propertyDraftChanged && properties) {
          const group = await Promise.resolve(onApply(replacementText, properties)).catch(() => false as const);
          markPdfTextLatency("finish.row-format-group-first", { group: group !== false });
          if (group === false) {
            setCommitError(saveFailedMessage);
            return false;
          }
        }
        const applied = await applyBoxFormat(asked, wordsTyped ? replacementText : undefined);
        markPdfTextLatency("finish.row-format", { applied });
        // A row that does not read as one run: the format is not set, and
        
        // again in a served face, its runs' faces and sizes lost; owner
        
        if (applied === null) {
          // Words typed and no format chosen (the "format" was the line's
          // own alignment kept, boxFormatIsRetypeOnly): they are written as
          // any line's words are, and that write speaks for itself -- taken,
          // nothing is said of a format; refused, the words' own refusal.
          if (wordsTyped && boxFormatIsRetypeOnly && partFormatsRef.current.length === 0) {
            const words = await Promise.resolve(onApply(replacementText, properties)).catch(() => false as const);
            markPdfTextLatency("finish.row-format-words-alone", { accepted: words !== false });
            if (words !== false) {
              changeAppliedRef.current = true;
              return true;
            }
            setCommitError(saveFailedMessage);
            return false;
          }
          setRowFormat(null);
          toast({ description: translate("pdf.nativeTextEdit.formatNotApplied") });
          return true;
        }
        if (applied) changeAppliedRef.current = true;
        else setCommitError(saveFailedMessage);
        return applied === true;
      }
      // The frame handed to the writer holds the draft as it is at this
      // moment. The measuring pass that grows a wrapped draft's frame runs
      // after render; a draft finished the moment it arrives (a line typed
      // while the previous one saved, carried into its reopened editor)
      // was committed with its one-line frame and two lines of text, which
      
      const fittedLayoutDraft = (() => {
        const draft = visualDraftElementRef.current;
        if (!layoutDraft || !draft?.isConnected || !(draft.clientWidth > 0)) return layoutDraft;
        // A frame turned by a quarter grows from where its line starts and
        // its first row stands (resizeBoxFromItsStart); an upright one from
        // its x and y, as before.
        const openedDraft = layoutDraft;
        const resized = (size: Readonly<{ width?: number; height?: number }>) => Object.freeze(lineAxesTurn === 0
          ? { ...openedDraft, ...size }
          : { ...openedDraft, ...resizeBoxFromItsStart(openedDraft, lineAxesTurn, size, pageWidthPixels, pageHeightPixels) });
        if (movedRowsText !== null) {
          
          // little wider in that face than in the PDF's would wrap again.
          const context = document.createElement("canvas").getContext("2d");
          const style = window.getComputedStyle(draft);
          if (!context) return layoutDraft;
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const widest = Math.max(0, ...movedRowsText.split("\n").map((row) => pageTextWidth("pdf", row, context.font) ?? context.measureText(row).width));
          
          const needed = (widest * (pageHeightPixels / pageHeightPoints) * wrappedScaleX +
            draftFontSizePixels * LINE_GROWTH_MARGIN_EM) /
            pageWidthPixels;
          return needed > layoutDraft.width
            ? lineAxesTurn === 0 ? Object.freeze({ ...layoutDraft, width: Math.min(1 - layoutDraft.x, needed) })
              : resized({ width: needed })
            : layoutDraft;
        }
        const scale = pageHeightPixels / pageHeightPoints;
        // As the measuring pass judges it: against the line's own box,
        // with a frame already grown to follow the draft collapsed.
        const grownBy = layoutRect
          ? Math.max(0, layoutDraft.width - layoutRect.width) * pageWidthPixels / scale / wrappedScaleX : 0;
        // The writer's own measure (see the measuring pass): a draft still
        // kept as the source's one line is a line its frame must hold too.
        const frameOverflow = grownBy === 0 && contentDraftDirty && !manualLayoutDirty &&
          !replacementText.includes("\n") && pdfNativeTextDraftLineExceedsFrame(draft, lineAxesTurn);
        if (sourceLineLayoutPreserved && !frameOverflow) return layoutDraft;
        const previousWhiteSpace = draft.style.whiteSpace;
        let needed = 0;
        try {
          draft.style.whiteSpace = "pre";
          // Collapsed, as the measuring pass does: the text's own width.
          const previousWidth = draft.style.width;
          draft.style.width = "0px";
          const natural = draft.scrollWidth;
          draft.style.width = previousWidth;
          const overflows = frameOverflow ||
            (contentDraftDirty && natural * sourceLineFitScale > draft.clientWidth - grownBy + 0.5);
          if (!overflows && !replacementText.includes("\n")) return layoutDraft;
          // The frame has not followed the draft yet (finished the moment
          // it arrived): it does here, where the page proves the room.
          if (overflows && grownBy === 0 && lineGrowthRoom > 0) {
            const followed = (natural * scale * wrappedScaleX + draftFontSizePixels * LINE_GROWTH_MARGIN_EM) /
              pageWidthPixels;
            if (followed <= lineGrowthRoom) {
              return resized({ width: Math.max(layoutDraft.width, followed) });
            }
          }
          draft.style.whiteSpace = "pre-wrap";
          const measured = measurePdfNativeTextDraftHeight(draft);
          if (measured === null) return layoutDraft;
          needed = (measured * (pageHeightPixels / pageHeightPoints) + layoutVerticalSafetyPixels) / pageHeightPixels;
        } finally {
          draft.style.whiteSpace = previousWhiteSpace;
        }
        return needed > layoutDraft.height + 0.0001
          ? lineAxesTurn === 0 ? Object.freeze({ ...layoutDraft, height: Math.min(1 - layoutDraft.y, needed) })
            : resized({ height: needed })
          : layoutDraft;
      })();
      
      
      // box in the browser's face, wrapped by the browser: its rows changed
      // for a second or two after the click away (「二〇二六年第」/「三季度」
      // read 「二〇二六年」/「第三季度」) and changed back. The surface the
      // window keeps under the box as its bridge carries the lifted pixels
      // the reader was looking at instead (the window then draws no box).
      uncarryLift = layoutFallbackActive && moveOnlyDraft ? carryMoveLiftOnSurfaceRef.current() : null;
      const accepted = await Promise.resolve(
        paragraphFrameRequest !== null && !fittedLayoutDraft
          ? onApply(replacementText, properties, null, undefined, paragraphFrameRequest)
          : paragraphChanges ? onApply(replacementText, properties, fittedLayoutDraft, paragraphChanges)
          : (typedBreakNative || nativeFirstBeforeTextBox) && fittedLayoutDraft
          ? (async () => {
              // The page's own text first (the paragraph rewrite sets the
              
              // (A text box's line: in the box's frame.)
              const native = await Promise.resolve(paragraphFrameRequest !== null
                ? onApply(replacementText, properties, null, undefined, paragraphFrameRequest)
                : onApply(replacementText, properties)).catch(() => false);
              markPdfTextLatency("finish.typed-break", { native: native !== false });
              return native !== false ? native : onApply(movedRowsText ?? replacementText, properties, fittedLayoutDraft);
            })()
          : fittedLayoutDraft
          ? onApply(movedRowsText ?? replacementText, properties, fittedLayoutDraft)
          : onApply(replacementText, properties),
      );
      if (accepted !== false) changeAppliedRef.current = true;
      markPdfTextLatency("finish.applied", { accepted: accepted !== false });
      if (accepted === false) {
        uncarryLift?.();
        setCommitError(saveFailedMessage);
        candidateCanvas?.removeAttribute("data-pdf-native-text-commit-pending");
        if (candidateCanvas && editingSurfaceStatusRef.current === "ready") {
          candidateCanvas.remove();
        }
        return false;
      }
      if (candidateCanvas) {
        candidateCanvas.removeAttribute("data-pdf-native-text-commit-pending");
        candidateCanvas.setAttribute(
          "data-pdf-native-text-committed-preview",
          "true",
        );
        // The viewer retires this bridge once the page paints a document
        // loaded after this moment (an Undo, a Redo, a later edit).
        candidateCanvas.setAttribute(
          "data-pdf-native-text-committed-at",
          String(performance.now()),
        );
        for (const previous of pageHost?.querySelectorAll<HTMLCanvasElement>(
          'canvas[data-pdf-native-text-committed-preview="true"]',
        ) ?? []) {
          if (previous === candidateCanvas) continue;
          previous.remove();
          previous.width = 0;
          previous.height = 0;
        }
        const editingSurface = editingSurfaceCanvasRef.current;
        editingSurfaceCanvasRef.current = null;
        editingSurface?.remove();
        if (editingSurface) {
          editingSurface.width = 0;
          editingSurface.height = 0;
        }
        candidateCanvas.style.zIndex = "1";
        if (publishedPreviewCanvasRef.current === candidateCanvas) {
          publishedPreviewCanvasRef.current = null;
          validatedPreviewDraftKeyRef.current = null;
          suppressedSourceCanvasRef.current = null;
        }
      }
      return true;
    } catch {
      uncarryLift?.();
      setCommitError(saveFailedMessage);
      candidateCanvas?.removeAttribute("data-pdf-native-text-commit-pending");
      if (candidateCanvas && editingSurfaceStatusRef.current === "ready") {
        candidateCanvas.remove();
      }
      return false;
    } finally {
      applyingRef.current = false;
      setSubmitting(false);
    }
  }, [
    rowFormat, boxRowFormat, applyBoxFormat, boxFormatIsRetypeOnly,
    propertyDraftChanged,
    onApplyRowFormat,
    paragraphFrameRequest,
    typedBreakNative,
    nativeFirstBeforeTextBox,
    actionUnavailable,
    layoutAngleChanged,
    saveFailedMessage,
    inlineEditorHost,
    layoutDraft,
    onApply,
    paragraphChanges,
    properties,
    publishExactPreviewCanvas,
    replacementText,
    contentDraftDirty,
    layoutVerticalSafetyPixels,
    pageHeightPixels,
    pageHeightPoints,
    sourceLineFitScale,
    sourceLineLayoutPreserved,
    layoutRect, pageWidthPixels, wrappedScaleX, lineGrowthRoom, draftFontSizePixels, manualLayoutDirty,
    movedRowsText, layoutFallbackActive, moveOnlyDraft, lineAxesTurn,
    setCommitError,
  ]);
  





  const requestLeave = () => {
    // An emptied line leaves by being deleted (requestFinish), whatever the
    // writer would have said of an empty text.
    if (deletesOnLeave) {
      requestFinish();
      return;
    }
    if (
      !busy &&
      !submitting &&
      draftDirty &&
      !layoutOnlyDraft &&
      // Words the window takes without the line's proof, which is only still
      // on its way, are written as a click away writes them. Kept as a draft
      // on these bytes, an Escape pressed before the proof came lost them when
      
      !detachableUnprovenRef.current &&
      
      // can still take it (finishing sends it there).
      ((!refusalFallbackEligible &&
        Boolean(settledApplyDisabledReason ?? (unverifiedNativeSource ? applyDisabledReason : null))) ||
        preparationFailed ||
        failedFinishKey === finishDraftKey)
    ) {
      setFinishRequested(null);
      onRetainUnsavedDraft?.(replacementText);
      onCancel();
      settleNextTextTarget(true);
      return;
    }
    requestFinish();
  };
  // The draft thrown away: no finish intent survives it, nothing is kept for
  // the line, and the editor closes as Cancel closes it.
  const requestDiscard = () => {
    setFinishRequested(null);
    setServerRefusalFinishKey(null);
    finishPendingRef.current = false;
    onCancel();
  };
  // Escape steps out one level at a time (ONLYOFFICE, PowerPoint; owner
  
  // text to the block selected, from the block to nothing selected, and
  // only with nothing selected does Edit Content end (the reader's own
  // Escape). On the box's move/rotate/resize handles the block is what is
  // selected: Escape leaves the line, Edit Content stays.
  const leaveOnEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return false;
    event.preventDefault();
    event.stopPropagation();
    requestLeave();
    return true;
  };
  /** Escape in the text: the line goes back to its block selected. Nothing
   * typed, it just is; a draft is written and the line opens again on the
   * new revision selected as a block (the next-line continuation, aimed at
   * this line). */
  const escapeToBlock = () => {
    if (!draftDirty || draftHandedOver()) {
      objectSelectedRef.current = true;
      setObjectSelected(true);
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const own = returnFocusRef.current;
    // (A block of a paragraph's formats is left for good: its box on the
    // page is a line of it, which is not the block to open again.)
    if (own?.isConnected && !deletesOnLeave && !wordsByLine) {
      const box = own.getBoundingClientRect();
      settleNextTextTarget(false);
      nextTextTargetRef.current = captureNextTextTarget?.(own, {
        clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      }) ?? null;
      restoreFocusOnCloseRef.current = false;
      leavingToReopenRef.current = true;
    }
    requestLeave();
  };
  const stopNativeTextGesture = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    finishPendingRef.current = false;
    if (!applyingRef.current) {
      restoreInteractionChromeRef.current?.();
      restoreInteractionChromeRef.current = null;
    }
    setFinishRequested(null);
    setFinishAfterQueuedActions(false);
    event.stopPropagation();
  };
  // A family the PDF holds no face of (All Fonts): the draft names it by an
  // embedded-font key, shown as a font of that family (the planner installs
  // its served substitute when the line is written).
  const embeddedFontOption = (name: string | null | undefined) =>
    pdfNativeEmbeddedFontDisplayOption(name, propertyProof?.original.font);
  const selectedFont = propertyProof?.fonts.find(
    (font) => font.resourceName === properties?.fontResourceName,
  ) ?? embeddedFontOption(properties?.fontResourceName);
  // The CSS family a draft shows a font in: an embedded family through the
  // faces MRAI serves for it (Live Preview shows it the same way).
  const draftFamilyCss = (font: { readonly resourceName: string; readonly family: string }) =>
    isPdfNativeEmbeddedFontKey(font.resourceName)
      ? withOfficeFontSubstitutes(`"${font.family.replace(/["\\]/g, "")}"`)
      : font.family;
  









  const ownFontDraftCss = (font: { readonly resourceName: string; readonly family: string; readonly baseFont?: string }) => {
    if (isPdfNativeEmbeddedFontKey(font.resourceName)) return draftFamilyCss(font);
    const namedAs = (name: string) => name.replace(/^[A-Z]{6}\+/u, "").replace(/-Identity-[HV]$/u, "");
    const name = namedAs(font.baseFont ?? "");
    const loaded = name ? initialLayout?.runFaces?.find((entry) => namedAs(entry.sourceFontName) === name)?.displayFontFamily
      : undefined;
    return loaded ? withRepairedPdfJsFaces(withSimilarFaces(loaded, font.baseFont || font.family))
      : withSimilarFaces(draftFamilyCss(font), font.baseFont || font.family);
  };
  /** A face chosen for the line (its bold sibling) that cannot set its words
   * -- a title's subset holding a few capitals -- is written in the served
   * family of its build, the whole line (pdfNativeParagraphFormatInServed
   * SimilarFaces): drafted so. A format of unchanged words only; typed words
   * keep the face for what it holds. */
  const servedFaceWhereLacking = (font: { readonly baseFont?: string; readonly family: string }, css: string): string => {
    if (replacementText !== originalText) return css;
    const loaded = /^\s*["']?(g_d\d+_f\d+(?:-mrai\d*)?)["']?\s*(?:,|$)/u.exec(css)?.[1];
    if (!loaded || !(draftFontSizePixels > 0)) return css;
    if (pdfJsFaceDrawsText({ document: returnFocusRef.current?.ownerDocument ?? (typeof document === "undefined" ? null : document),
      family: loaded, text: replacementText, fontSizePx: draftFontSizePixels, widthPx: 0 })) return css;
    const served = pdfNativeServedSimilarFamily(font.baseFont || font.family);
    return served ? withOfficeFontSubstitutes(`"${served}"`) : css;
  };
  const useStoredLayoutTypography = Boolean(
    initialLayout?.promoted && !fontDraftChanged,
  );
  const editableFont = useStoredLayoutTypography && propertyProof && initialLayout
    ? storedLayoutFont(propertyProof, initialLayout) : selectedFont;
  // A style the font has no face for is drawn in place the way Word and WPS
  // fake it (lib/pdf/native-synthetic-style.ts): a bold strokes the glyph
  // outlines (`2 Tr`), an italic slants the text matrix. The run carries
  // either as it stands, or as this draft asks for it.
  const nativeTextMatrixLinear = properties?.textMatrixLinear ?? propertyProof?.original.textMatrixLinear;
  const originalSyntheticBold = Boolean(propertyProof && propertyProof.original.renderingMode === 2 && selectedFont && !selectedFont.bold);
  const syntheticBold = !managedLayoutTypography && !useStoredLayoutTypography &&
    (properties?.syntheticBold ?? originalSyntheticBold);
  const syntheticItalic = !managedLayoutTypography && !useStoredLayoutTypography &&
    Boolean(nativeTextMatrixLinear && pdfNativeTextMatrixIsSlanted(nativeTextMatrixLinear));
  // A line set in a bold face with no property proof reads bold, as WPS
  // shows it: 加粗 read unpressed on a Calibri-Bold line, and pressing it
  
  // Before the proof the face's own name says it too: the reader's box of
  // an IPCC title set in FrutigerLTPro-BlackCn carries no bold, and 加粗
  // read unpressed until the proof came, so a press meant to take the bold
  
  // (A box its proof reads as bold faces beside other text -- drawnStyle's
  // boldFaces without its bold -- is not bold as a whole, whatever face the
  // reader names for its first words: 加粗 there strokes the rest.)
  const boxOfMixedWeights = boxDrawnStyle?.boldFaces !== undefined && boxDrawnStyle.bold !== true;
  const currentBold = managedLayoutTypography ? managedBold : useStoredLayoutTypography ? Boolean(initialLayout?.box.bold) : faceReadsBold(selectedFont) || syntheticBold ||
    (!propertyProof && !boxOfMixedWeights &&
      (Boolean(initialLayout?.box.bold) || sourceFacesBold || Boolean(readerFontIdentity?.bold)));
  // A bold drawn as a stroke (the face has no bold): drafted as that stroke
  // on the regular face, every glyph at its own advance as the writer keeps
  // it. Drafted at weight 700 the words widened and a bolded paragraph ran
  
  // 「文本往往会超出文本框边缘，过一会再回去」).
  const strokeBold = !managedLayoutTypography && !useStoredLayoutTypography && Boolean(selectedFont) &&
    syntheticBold && !faceReadsBold(selectedFont);
  const currentItalic = managedLayoutTypography ? managedItalic : useStoredLayoutTypography ? Boolean(initialLayout?.box.italic) : faceReadsItalic(selectedFont) || syntheticItalic ||
    (!propertyProof && (sourceRunsItalic || Boolean(readerFontIdentity?.italic)));
  const originalFontSize = propertyProof?.original.fontSize ?? 0;
  const sourceFontSizePixels = Number.parseFloat(metrics?.fontSize ?? "");
  // Soft wrapping happens in PDF points, then the whole input is scaled. This
  // avoids subpixel CSS rounding changing a line at 113%, workspace zoom, or
  // on reentry. The saved appearance uses the same point width and font size.
  const reflowScale = layoutFallbackActive ? pageHeightPixels / pageHeightPoints : 1;
  const previewFontSize =
    layoutFallbackActive
      ? `${draftFontSizePixels / reflowScale}px`
      : properties &&
          originalFontSize > 0 &&
          Number.isFinite(sourceFontSizePixels) &&
          sourceFontSizePixels > 0
        ? `${(sourceFontSizePixels * properties.fontSize) / originalFontSize}px`
        : usesSourceFrameFont ? `${draftFontSizePixels}px` : metrics?.fontSize;
  const usesOriginalFont =
    selectedFont?.resourceName === propertyProof?.original.font.resourceName;
  // The source font, as pdf.js loaded it, often has no glyph for the space
  // (a subset) and none for a character its producer could not set (U+0000):
  // the PDF gives each an advance the browser does not know. The draft and
  // the input are set by those advances, so the line keeps its gaps between
  // a keystroke and the exact preview (lib/pdf/fallback-glyph-advances.ts).
  
  // advances): its missing glyphs keep their width there too. Set at none,
  // a cell's three U+0000 closed up, the typed words stayed on its first row
  
  
  const sourceFallbackAdvances =
    !fontDraftChanged && (!layoutFallbackActive || (!managedLayoutTypography && !useStoredLayoutTypography)) &&
      initialLayout?.box.displayFontFamily
      ? pdfFallbackGlyphAdvancesFor(initialLayout.box.displayFontFamily)
      : null;
  const sourceFontSizePx = Number.parseFloat(String(previewFontSize ?? ""));
  // The word spacing that sets the browser's space at the PDF's, measured in
  // the family the draft is set in (below): measured in the box's own (the
  // page's face, then the generic sans-serif), a CJK line drafted in its
  // East Asian fallback had every typed space 3 px narrower than the page
  
  const sourceSpaceCorrectionIn = (fontFamily: string) =>
    sourceFallbackAdvances?.has(" ") && fontFamily
      ? pdfSpaceWordSpacingPx(sourceFallbackAdvances, sourceFontSizePx, measureBrowserSpacePx(fontFamily, sourceFontSizePx))
      : null;
  // The face pdf.js loaded for the line's font, where it draws the line's
  // characters as the page does (pdfJsFaceDrawsText); a scrambled one is left
  // out of the draft, which then shows the words in the served faces.
  const loadedFaceDrawsText = useMemo(() => {
    const family = /^\s*["']?(g_d\d+_f\d+)["']?\s*(?:,|$)/u.exec(initialLayout?.box.displayFontFamily ?? "")?.[1];
    // Its copy keyed by the characters the pages draw (the draft is set in
    // that: withRepairedPdfJsFaces) draws them as the page does.
    if (!family || !initialLayout || repairedPdfJsFaceFamily(family)) return true;
    return pdfJsFaceDrawsText({ document: returnFocusRef.current?.ownerDocument ?? (typeof document === "undefined" ? null : document),
      family, text: originalText,
      fontSizePx: Number(initialLayout.box.fontSize) * Number(initialLayout.pageHeightPx),
      widthPx: Number(initialLayout.box.width) * Number(initialLayout.pageWidthPx) });
  }, [initialLayout, originalText, returnFocusRef]);
  // Drafted in other faces than its scrambled own, at the weight its width
  // reads as (its name says nothing of it).
  // (So is a face pdf.js draws but registered at a weight its name does not
  // say, with no proof to read it from: the letters it lacks fell back
  // regular in a bold line, an exam cover's "Noxy vember" with a thin xy,
  
  const loadedFaceWeightUnknown = loadedFaceDrawsText && !selectedFont;
  const scrambledFaceWeight = useMemo(() => {
    if ((loadedFaceDrawsText && !loadedFaceWeightUnknown) || !initialLayout?.box.displayFontFamily) return null;
    return pdfDraftWeightByWidth({ document: returnFocusRef.current?.ownerDocument ?? (typeof document === "undefined" ? null : document),
      stack: withSimilarFaces(withoutPdfJsFaces(initialLayout.box.displayFontFamily, () => false), initialLayout.box.sourceFontName),
      text: originalText, fontSizePx: Number(initialLayout.box.fontSize) * Number(initialLayout.pageHeightPx),
      widthPx: Number(initialLayout.box.width) * Number(initialLayout.pageWidthPx) });
  }, [loadedFaceDrawsText, loadedFaceWeightUnknown, initialLayout, originalText, returnFocusRef]);
  const inlineTypographyStyle: CSSProperties = {
    // CJK typed into a Latin line falls back to the face the saved PDF sets
    // it in (Noto Sans SC), Latin staying in the line's face: draft = bytes.
    fontFamily: eastAsianFallback(
      !fontDraftChanged && initialLayout?.box.displayFontFamily
        ? withSimilarFaces(loadedFaceDrawsText ? initialLayout.box.displayFontFamily
          : withoutPdfJsFaces(initialLayout.box.displayFontFamily, () => false), initialLayout.box.sourceFontName)
        : managedLayoutTypography ? managedStyleChanged && !managedOfficeFamily ? managedFontOption?.stack ?? FONT_STACK[managedFontClass] : managedFontFamily
        : useStoredLayoutTypography && initialLayout?.box.fontFamily
        ? initialLayout.box.fontFamily
        : !usesOriginalFont && selectedFont
          ? servedFaceWhereLacking(selectedFont, `${ownFontDraftCss(selectedFont)}, ${metrics?.fontFamily ?? "sans-serif"}`)
          : (metrics?.fontFamily ??
            (selectedFont ? `${selectedFont.family}, sans-serif` : undefined)), replacementText),
    fontSize: previewFontSize,
    // pdf.js can expose Standard 14 bold/italic faces with computed DOM
    // metrics of 400/normal. The authenticated PDF font proof is authoritative
    // for style, including the original resource; DOM metrics remain only the
    // fallback when no native property proof exists.
    fontStyle: managedLayoutTypography ? managedItalic ? "italic" : "normal" : useStoredLayoutTypography
      ? initialLayout?.box.italic
        ? "italic"
        : "normal"
      : selectedFont
        ? currentItalic
          ? "italic"
          : "normal"
        // (A box of several shows this writer leaned where it stands.)
        : !propertyProof && sourceRunsLeaned ? "italic" : metrics?.fontStyle,
    fontWeight: scrambledFaceWeight && !managedLayoutTypography && !fontDraftChanged && !propertyDraftChanged
      ? scrambledFaceWeight
      : managedLayoutTypography ? managedBold ? "700" : "400" : useStoredLayoutTypography
      ? initialLayout?.box.bold
        ? "700"
        : "400"
      : selectedFont
        ? currentBold && !strokeBold
          ? "700"
          : "400"
        : metrics?.fontWeight,
    fontStretch: metrics?.fontStretch,
    fontKerning: metrics?.fontKerning,
    fontFeatureSettings: metrics?.fontFeatureSettings,
    fontVariationSettings: metrics?.fontVariationSettings,
    fontVariantLigatures: metrics?.fontVariantLigatures,
    fontVariantCaps: metrics?.fontVariantCaps,
    fontVariantEastAsian: metrics?.fontVariantEastAsian,
    fontVariantNumeric: metrics?.fontVariantNumeric,
    fontVariantPosition: metrics?.fontVariantPosition,
    fontSynthesis: loadedFaceWeightUnknown && scrambledFaceWeight === "700" && !managedLayoutTypography
      ? "style" : metrics?.fontSynthesis,
    fontOpticalSizing: metrics?.fontOpticalSizing,
    letterSpacing: layoutFallbackActive
      ? wrappedCharacterEm ? `${wrappedCharacterEm}em` : "normal"
      : metrics?.letterSpacing,
    wordSpacing: layoutFallbackActive
      ? wrappedWordEm ? `${wrappedWordEm}em` : "normal"
      : metrics?.wordSpacing,
    lineHeight: layoutFallbackActive ? `${(sourceInputLayout || initialLayout?.promoted
      ? draftLineHeightPixels
      : draftFontSizePixels * PDF_TEXTBOX_LINE_HEIGHT_RATIO) / reflowScale}px`
      : activeInputLayout || usesSourceFrameFont ? `${draftLineHeightPixels}px` : metrics?.lineHeight,
    textAlign:
      (managedLayoutTypography && managedJustify ? "justify" : null) ??
      (centredDraft ? "center" : rightDraft ? "right" : null) ??
      properties?.alignment ??
      managedAlignment ??
      (centredBlockDraft ? "center" : null) ??
      initialLayout?.box.align ??
      metrics?.textAlign,
    direction: metrics?.direction,
    unicodeBidi: metrics?.unicodeBidi,
    textRendering: metrics?.textRendering,
  };
  // The row format chosen for the whole box, as the draft shows it.
  if (rowFormat?.family) {
    inlineTypographyStyle.fontFamily = eastAsianFallback(
      `${withOfficeFontSubstitutes(`"${rowFormat.family.replace(/["\\]/g, "")}"`)}, ${metrics?.fontFamily ?? "sans-serif"}`,
      replacementText);
  }
  if (rowFormat?.italic !== undefined) inlineTypographyStyle.fontStyle = rowFormat.italic ? "italic" : "normal";
  const sourceSpaceCorrectionPx = layoutFallbackActive ? null
    : sourceSpaceCorrectionIn(String(inlineTypographyStyle.fontFamily ?? ""));
  if (sourceSpaceCorrectionPx !== null) {
    inlineTypographyStyle.wordSpacing =
      `${(Number.parseFloat(String(metrics?.wordSpacing ?? "0")) || 0) + sourceSpaceCorrectionPx}px`;
  }
  // A face the document registered upright only (the PDF's own, the East
  // Asian fallback) is not asked for an italic: the browser would set the
  // words in another family, the input would measure that family and every
  
  // The draft, the input and the measuring canvas stay in the face's own
  // upright glyphs; the draft is sheared as the writer slants them.
  const draftItalic = pdfDraftItalic(String(inlineTypographyStyle.fontFamily ?? ""), inlineTypographyStyle.fontStyle === "italic");
  inlineTypographyStyle.fontStyle = draftItalic.fontStyle;
  const visualDraftSyntheticSlant = draftItalic.synthetic;
  // A paragraph the browser lays out is slanted word by word, not sheared
  // whole (slantPdfDraftWords); a line drafted on its glyphs or in runs
  // keeps the one shear.
  const draftSlantsWords = visualDraftSyntheticSlant && sourceLooksMultiLine && !managedLayoutTypography;
  const visualDraftFontFamily = inlineTypographyStyle.fontFamily;
  const visualDraftFontSize = inlineTypographyStyle.fontSize;
  const visualDraftFontStyle = inlineTypographyStyle.fontStyle;
  const visualDraftFontWeight = inlineTypographyStyle.fontWeight;
  const visualDraftLetterSpacing = inlineTypographyStyle.letterSpacing;
  const visualDraftWordSpacing = inlineTypographyStyle.wordSpacing;
  const visualDraftLineHeight = inlineTypographyStyle.lineHeight;
  const visualDraftTextAlign = inlineTypographyStyle.textAlign;
  const visualDraftTextDecoration = managedLayoutTypography
    ? [
        ...(managedUnderline ? ["underline"] : []),
        ...(managedStrikethrough ? ["line-through"] : []),
      ].join(" ")
    : "";
  const visualDraftColor = draftColor;
  // The draft is laid out as the source's one line (unwrapped, fitted to the
  // PDF's width) only while the line keeps its frame. A frame resized from
  // its right edge sets the paragraph again in the new width (requestNative
  // Rewrap): the draft wraps there as the rewrite will, instead of the whole
  // line squeezed into the narrower frame until the exact preview lands
  
  // release).
  const preserveSourceSingleLine = Boolean(
    initialLayout && sourceLineLayoutPreserved && paragraphFrameRequest === null,
  );
  
  // the same value `inlineTypographyStyle.lineHeight` states before its
  // `reflowScale` division.
  const wrappedDraftLineHeightPixels =
    sourceInputLayout || initialLayout?.promoted
      ? draftLineHeightPixels
      : draftFontSizePixels * PDF_TEXTBOX_LINE_HEIGHT_RATIO;
  // A box set in runs is drawn run by run, each in the face, size, colour,
  // decorations and rise the writer gives it (lib/pdf/text-box-runs.ts), at
  // its fonts' own advances (as the row plan measures it) and each row as
  // tall as its largest run. The draft is laid out in points (reflowScale).
  const managedRunLineHeightRatio = draftFontSizePixels > 0 && wrappedDraftLineHeightPixels > 0
    ? wrappedDraftLineHeightPixels / draftFontSizePixels : PDF_TEXTBOX_LINE_HEIGHT_RATIO;
  const managedDraftRunsKey = managedDrawsRuns && managedDrawnRuns
    ? JSON.stringify([managedDrawnRuns, managedPointHeight, managedRunLineHeightRatio, wrappedCharacterEm, wrappedWordEm])
    : null;
  const managedDraftRuns = useMemo(() => {
    if (!managedDraftRunsKey) return null;
    const [runs, pointHeight, ratio, characterEm, wordEm] =
      JSON.parse(managedDraftRunsKey) as [PdfTextBoxDrawnRun[], number, number, number, number];
    return runs.map((run) => {
      const size = run.fontSize * pointHeight;
      const rise = pdfTextBoxRunRise(run, size);
      const decoration = [run.underline ? "underline" : "", run.strikethrough ? "line-through" : ""]
        .filter(Boolean).join(" ");
      const family = pdfTextBoxRunCssFamily(run, run.text);
      // An italic run of a face with no italic of its own: upright glyphs
      // sheared as the writer slants them (lib/pdf/draft-italic.ts).
      const italic = pdfDraftItalic(family, Boolean(run.italic));
      return {
        text: run.text,
        css: {
          "font-family": family,
          "font-size": `${pdfTextBoxRunGlyphSize(run, size)}px`,
          "font-weight": String(pdfTextBoxRunCssWeight(run)),
          "font-style": italic.fontStyle,
          ...(italic.synthetic
            ? { display: "inline-block", transform: pdfDraftSyntheticSlantTransform(), "transform-origin": "0 100%" }
            : {}),
          "line-height": `${size * ratio}px`,
          color: run.color,
          "-webkit-text-fill-color": run.color,
          "text-decoration-line": decoration || "none",
          ...(characterEm ? { "letter-spacing": `${characterEm}em` } : {}),
          ...(wordEm ? { "word-spacing": `${wordEm}em` } : {}),
          ...(rise ? { position: "relative", top: `${-rise}px` } : {}),
        },
      };
    });
  }, [managedDraftRunsKey]);
  /**
   * The height (page fraction, with the frame's safety band) the draft needs
   * inside a frame `widthFraction` wide, for the WPS resize rules: at the
   * frame's own width it is the live draft's measure (the one
   * `effectiveLayoutRect` grows to); at any other width a probe lays the text
   * out again with the draft's typography. Same font size either way: the
   * frame follows the text, the text never follows the frame.
   */
  const layoutContentHeightFor = useCallback(
    (startRect: BoxRect) =>
      (widthFraction: number): number => {
        const explicitLines = replacementText.split(/\r\n?|\n/).length;
        const contentPixels =
          Math.abs(widthFraction - startRect.width) <= BOX_RECT_EPSILON
            ? Math.max(
                Math.ceil(explicitLines * draftLineHeightPixels),
                measuredContentHeight,
              )
            : measureWrappedTextHeightPx({
                text: replacementText,
                widthPx: widthFraction * pageWidthPixels,
                fontSizePx: draftFontSizePixels,
                lineHeightPx: wrappedDraftLineHeightPixels,
                fontFamily: visualDraftFontFamily ? String(visualDraftFontFamily) : undefined,
                fontWeight: visualDraftFontWeight ? String(visualDraftFontWeight) : undefined,
                fontStyle: visualDraftFontStyle ? String(visualDraftFontStyle) : undefined,
              });
        return (contentPixels + layoutVerticalSafetyPixels) / pageHeightPixels;
      },
    [
      draftFontSizePixels,
      draftLineHeightPixels,
      layoutVerticalSafetyPixels,
      measuredContentHeight,
      pageHeightPixels,
      pageWidthPixels,
      replacementText,
      visualDraftFontFamily,
      visualDraftFontStyle,
      visualDraftFontWeight,
      wrappedDraftLineHeightPixels,
    ],
  );
  const sourceLineTransformOrigin =
    layoutFallbackActive ? "0 0" : visualDraftTextAlign === "right"
      ? "100% 0"
      : visualDraftTextAlign === "center"
        ? "50% 0"
        : "0 0";
  // Both input and visible draft share the PDF baseline, not the browser's
  // font-dependent line-box ascent. Measuring a zero-width baseline marker
  // also handles embedded fonts whose ascent is greater than one em.
  useLayoutEffect(() => {
    if (!initialLayout || !inlineEditorHost) return;
    let active = true;
    const measureBaseline = () => {
      if (!active) return;
      // The same look measured before (a format pressed and taken back, the
      // fonts' ready with nothing new) is not laid out again: each probe
      // laid the page out once more on the press.
      const size = Number.parseFloat(String(previewFontSize ?? ""));
      const key = JSON.stringify([inlineTypographyStyle, [...originalText][0] || "M", size, document.fonts?.status]);
      const known = measuredBaselineOffsets.get(key);
      if (known !== undefined) {
        setBaselineOffset((current) => (Math.abs(current - known) < 0.01 ? current : known));
        return;
      }
      const probe = document.createElement("div");
      const marker = document.createElement("span");
      Object.assign(probe.style, inlineTypographyStyle, {
        position: "fixed",
        left: "0",
        top: "0",
        visibility: "hidden",
        pointerEvents: "none",
        whiteSpace: "pre",
        margin: "0",
        padding: "0",
      });
      Object.assign(marker.style, {
        display: "inline-block",
        width: "0",
        height: "0",
        verticalAlign: "baseline",
      });
      probe.append(document.createTextNode([...originalText][0] || "M"), marker);
      document.body.appendChild(probe);
      const measured =
        marker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
      probe.remove();
      const offset =
        measured > 0 && Number.isFinite(size) ? size - measured : 0;
      if (measuredBaselineOffsets.size >= 128) measuredBaselineOffsets.delete(measuredBaselineOffsets.keys().next().value!);
      measuredBaselineOffsets.set(key, offset);
      setBaselineOffset((current) =>
        Math.abs(current - offset) < 0.01 ? current : offset,
      );
    };
    measureBaseline();
    void document.fonts?.ready.then(measureBaseline);
    document.fonts?.addEventListener("loadingdone", measureBaseline);
    return () => {
      active = false;
      document.fonts?.removeEventListener("loadingdone", measureBaseline);
    };
  }, [
    initialLayout,
    inlineEditorHost,
    originalText,
    previewFontSize,
    visualDraftFontFamily,
    visualDraftFontWeight,
    visualDraftFontStyle,
    visualDraftLineHeight,
  ]);
  // Development trace of a render loop (walk w-cjk-s9b: "Maximum update
  // depth exceeded" when the S9 header's draft is finished): more than 20
  
  // value that flips is named.
  const renderLoopProbeRef = useRef({ startedAt: 0, renders: 0 });
  if (process.env.NODE_ENV !== "production") {
    const probe = renderLoopProbeRef.current;
    const now = performance.now();
    if (now - probe.startedAt > 200) {
      probe.startedAt = now;
      probe.renders = 0;
    }
    probe.renders += 1;
    if (probe.renders > 20 && probe.renders <= 30) {
      console.debug("[pdf-text-render-loop]", probe.renders, JSON.stringify({
        fallback: layoutFallbackActive, forced: layoutFallbackForced, auto: autoLayoutExpanded,
        grown: autoLayoutGrown, overflows: draftOverflowsBox, preserved: preserveSourceSingleLine,
        fit: sourceLineFitScale, height: measuredContentHeight, minWidth: measuredMinimumWidth,
        baseline: baselineOffset, size: previewFontSize, lineHeight: inlineTypographyStyle.lineHeight,
        family: inlineTypographyStyle.fontFamily, rect: effectiveLayoutRect, accepted: exactPreviewAcceptedDraft,
        busy: previewBusy, error: Boolean(previewError), refusal: refusalFallbackActive,
        surface: editingSurfaceStatus, natural: draftNaturalWidth, room: lineGrowthRoom,
        draft: previewDraftKey.length, submitting, finish: finishRequested !== null,
      }));
    }
  }
  const sourceLineTransform =
    [
      reflowScale !== 1 ? `scale(${reflowScale})` : "",
      baselineOffset ? `translateY(${baselineOffset}px)` : "",
      preserveSourceSingleLine && sourceLineFitScale < 1
        ? `scaleX(${sourceLineFitScale})`
        : "",
      wrappedScaleX !== 1 ? `scaleX(${wrappedScaleX})` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  // Selection alone must NEVER erase source ink in favour of a transparent
  // input or an unpainted/hidden DOM draft. The source remains the visual owner
  // until the user changes it and the clean surface is ready. One effect owns
  
  // Entering a line changes nothing that is seen: until the reader changes
  // it, the page's own ink is the line (the caret is placed from the source
  // geometry), so the text looks the same read, entered and left. The
  // browser's draft of an untouched line is never that ink: its face's
  // advances differ (a symbol line drew a tenth narrower), and showing it on
  // the click made every line shift on entry and back on exit. The first
  // change shows the draft at once on the surface already prepared; the
  // proof only decides whether it can be saved.
  // A Live Preview is drawn in the draft, over the prepared clean surface.
  const formatPreviewShown = shownFormatPreview !== null && editingSurfaceStatus === "ready" && !wordsUnread;
  const showsCandidate = !formatPreviewShown && draftDirty && !layoutFallbackActive && !layoutAngleChanged &&
    exactPreviewIsCurrent && publishedPreviewCanvasRef.current !== null;
  // A block only moved shows its own ink in the moved frame, over the clean
  // surface, until the moved block itself is drawn (the exact candidate):
  // the page's ink stayed behind during the drag, and the browser's draft
  
  
  // its place from the frame's top-left corner, as the moved text will.)
  // A lift cut against the block's own background (before the clean surface
  // is drawn) shows from the first frame of the drag too, its cover hiding
  // the ink at its old place (native-text-move-lift).
  // A box over a run that paints nothing (an OCR layer, PDF 0107) is edited
  // on the page's colour while its frame holds the line it replaced; carried
  // off it, the colour stays over the scanned words (the clean surface shows
  // them) and the frame is clear, so the scan under its new place shows --
  // what the written box draws (pdfSourceTextBoxInkCoverRect).
  const sourceInkCoverColor = /^#[0-9a-f]{6}$/i.test(initialLayout?.sourceInkCover ?? "")
    ? initialLayout!.sourceInkCover! : null;
  const stationaryInkCover = sourceInkCoverColor && effectiveLayoutRect && initialLayout?.origin
    ? pdfInkCoverRectOutsideFrame(effectiveLayoutRect, initialLayout.origin,
      draftFontSizePixels > 0 && pageHeightPixels > 0 ? draftFontSizePixels / pageHeightPixels : initialLayout.box.fontSize,
      pdfTextBoxQuarterTurned(layoutAngle))
    : null;
  const moveLiftShown = Boolean(
    moveLift && effectiveLayoutRect && moveOnlyDraft && (editingSurfaceStatus === "ready" || !moveLift.exact) &&
    !showsCandidate &&
    effectiveLayoutRect.width > 0 && effectiveLayoutRect.height > 0 &&
    (Math.abs(effectiveLayoutRect.x - moveLift.frame.x) > BOX_RECT_EPSILON ||
      Math.abs(effectiveLayoutRect.y - moveLift.frame.y) > BOX_RECT_EPSILON),
  );
  // Over the clean surface once it is drawn; before that, over the page
  // itself (its old place hidden by the lift's cover).
  const moveLiftOnSurface = moveLiftShown && editingSurfaceStatus === "ready";
  const moveLiftCoverShown = moveLiftShown && editingSurfaceStatus !== "ready" && Boolean(moveLift?.cover);
  
  // write waiting or not: the source ink gives way to it as to a change of
  
  const partLookPending = partFormats.length > 0 && !managedLayoutTypography;
  // Words typed (or a format pressed) before the line's clean surface is
  // drawn: the page under the editor still shows the old line, and the draft
  // stayed hidden until the surface came -- the reader typed and saw nothing
  // change, for seconds on a loaded machine, and a line left meanwhile went
  
  // typed and left at once, the words back 9 s later). Until the surface is
  // there the line's own ink is covered on the page itself (the typing
  // cover) and the draft is shown over it, both in one frame.
  const typingCoverLine = `${initialLayout?.box.id ?? ""}\n${originalText}`;
  const typingCoverWanted = !wordsUnread && editingSurfaceStatus === "pending" && moveStartFrame === null && !formatPreviewShown &&
    !managedLayoutTypography && Boolean(initialLayout) && !initialLayout?.promoted && !openedInFallbackLane &&
    !initialLayout?.sourceInkCover && !layoutAngleChanged && (replacementText !== originalText || partLookPending);
  const typingCoverShown = typingCoverWanted && !showsCandidate && typingCover !== null &&
    typingCover.line === typingCoverLine && typingCoverLoaded === typingCover.url;
  // (A line of words not read as drawn keeps its ink through a format
  // pressed on it: the format shows once its exact candidate is drawn, or
  // the page it was written on.)
  const showsSource = !moveLiftOnSurface && !formatPreviewShown &&
    (wordsUnread || editingSurfaceStatus !== "ready" || (!draftDirty && !partLookPending));
  /** Draws the lifted block where it was dropped on the clean surface (an
   * exact lift only), marks the surface as carrying it, and answers how to
   * take it back off (a refused write keeps the editor open on the
   * surface); null when nothing was drawn. */
  carryMoveLiftOnSurfaceRef.current = (): (() => void) | null => {
    const surface = editingSurfaceCanvasRef.current;
    const image = moveLiftImageRef.current;
    if (!moveLiftShown || !moveLift?.exact || !effectiveLayoutRect || !surface?.isConnected ||
      editingSurfaceStatusRef.current !== "ready" || !image?.complete || !(image.naturalWidth > 0) ||
      !(surface.width > 0) || !(surface.height > 0)) return null;
    const context = surface.getContext("2d");
    if (!context) return null;
    const x = (effectiveLayoutRect.x + moveLift.rect.x - moveLift.frame.x) * surface.width;
    const y = (effectiveLayoutRect.y + moveLift.rect.y - moveLift.frame.y) * surface.height;
    const width = moveLift.rect.width * surface.width;
    const height = moveLift.rect.height * surface.height;
    const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
    const right = Math.min(surface.width, Math.ceil(x + width)), bottom = Math.min(surface.height, Math.ceil(y + height));
    if (!(right > left) || !(bottom > top)) return null;
    try {
      // A box over a run that paints nothing goes onto the surface with its
      // fill where the written box paints it: the stationary cover over the
      // scanned words it was carried off, else its own frame (PDF 0107). The
      // page shows this surface until the saved box is drawn, and the clean
      // surface shows the scanned letters.
      // In the line's own axes turned by the frame's angle, as the frame is.
      const filled = sourceInkCoverColor
        ? turnedRectBounds(stationaryInkCover ?? effectiveLayoutRect, layoutAngle,
          { pageWidth: pageWidthPixels, pageHeight: pageHeightPixels })
        : null;
      const coverBox = filled ? {
        left: Math.max(0, Math.floor(filled.x * surface.width)),
        top: Math.max(0, Math.floor(filled.y * surface.height)),
        right: Math.min(surface.width, Math.ceil((filled.x + filled.width) * surface.width)),
        bottom: Math.min(surface.height, Math.ceil((filled.y + filled.height) * surface.height)),
      } : null;
      const underCover = coverBox && coverBox.right > coverBox.left && coverBox.bottom > coverBox.top
        ? context.getImageData(coverBox.left, coverBox.top, coverBox.right - coverBox.left, coverBox.bottom - coverBox.top)
        : null;
      if (underCover && coverBox) {
        context.fillStyle = sourceInkCoverColor!;
        context.fillRect(coverBox.left, coverBox.top, coverBox.right - coverBox.left, coverBox.bottom - coverBox.top);
      }
      const under = context.getImageData(left, top, right - left, bottom - top);
      context.drawImage(image, x, y, width, height);
      surface.setAttribute("data-pdf-native-text-bridge-box", "true");
      return () => {
        context.putImageData(under, left, top);
        if (underCover && coverBox) context.putImageData(underCover, coverBox.left, coverBox.top);
        surface.removeAttribute("data-pdf-native-text-bridge-box");
      };
    } catch {
      // A surface that cannot be read (lost, tainted) carries nothing.
      return null;
    }
  };
  // A moved block keeps showing where it was dropped while it is written:
  // the window stages the move and then the text on its working copy and
  // hands the page over drawn, so hiding the draft meanwhile left an empty
  // frame there and, in Safari, the old line back in its old place for
  
  const draftMoved = moveStartFrame !== null && effectiveLayoutRect !== null &&
    (Math.abs(effectiveLayoutRect.x - moveStartFrame.x) > BOX_RECT_EPSILON ||
      Math.abs(effectiveLayoutRect.y - moveStartFrame.y) > BOX_RECT_EPSILON);
  // A write with no exact candidate to show in its place (a row format of
  // a line of several runs, staged on the copy when the line is left) keeps
  // the draft on the page while it is written: hidden, the frame stood
  
  // 「整个文本框的内容直接消失了」).
  const visualDraftVisible = !wordsUnread && (editingSurfaceStatus === "ready" || typingCoverShown) &&
    (!submitting || layoutFallbackActive || layoutAngleChanged || draftMoved || publishedPreviewCanvasRef.current === null) &&
    // (Over the typing cover the page itself is what is under the draft.)
    (!showsSource || typingCoverShown) && !showsCandidate && !moveLiftShown;
  // The block's glyph boxes on the page (fractions), from its source
  // geometry: the ink a lift against its background alone may take.
  const sourceGlyphRects = useMemo<readonly BoxRect[] | null>(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!sourceGeometry || !matrix || matrix.length !== 6 || !initialLayout?.pageWidthPx || !initialLayout.pageHeightPx ||
      !(pageWidthPixels > 0) || !(pageHeightPixels > 0)) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    const projected = projectPdfTextSourceAppearance(sourceGeometry,
      [matrix[0] * sx, matrix[1] * sy, matrix[2] * sx, matrix[3] * sy, matrix[4] * sx, matrix[5] * sy]);
    if (!projected) return null;
    return projected.characters.flatMap((character) => {
      const xs = character.quad.filter((_, index) => index % 2 === 0);
      const ys = character.quad.filter((_, index) => index % 2 === 1);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      if (![left, right, top, bottom].every(Number.isFinite)) return [];
      // Overshoots and the antialiased fringe: a sixth of the line round it.
      const grow = Math.max(1, (bottom - top) / 6);
      return [{
        x: (left - grow) / pageWidthPixels,
        y: (top - grow) / pageHeightPixels,
        width: (right - left + 2 * grow) / pageWidthPixels,
        height: (bottom - top + 2 * grow) / pageHeightPixels,
      }];
    });
  }, [sourceGeometry, initialLayout?.pdfToCssTransform, initialLayout?.pageWidthPx, initialLayout?.pageHeightPx,
    pageWidthPixels, pageHeightPixels]);
  // The rows a drop cap pushes right (lib/pdf/leading-row-indent), in page
  // pixels: the browser-laid draft keeps them beside it while typed into.
  const leadingRowIndent = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!sourceGeometry || initialLayout?.promoted || !matrix || matrix.length !== 6 || !initialLayout.pageWidthPx ||
      !initialLayout.pageHeightPx || !(pageWidthPixels > 0) || !(pageHeightPixels > 0)) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    const projected = projectPdfTextSourceAppearance(sourceGeometry,
      [matrix[0] * sx, matrix[1] * sy, matrix[2] * sx, matrix[3] * sy, matrix[4] * sx, matrix[5] * sy]);
    return projected ? pdfLeadingRowIndent(projected.characters) : null;
  }, [sourceGeometry, initialLayout?.promoted, initialLayout?.pdfToCssTransform, initialLayout?.pageWidthPx,
    initialLayout?.pageHeightPx, pageWidthPixels, pageHeightPixels]);
  // The typing cover, cut from the page once it is wanted: the background
  // over the ink inside the line's own glyph boxes (a neighbour's ink stays).
  useEffect(() => {
    if (!typingCoverWanted || typingCover?.line === typingCoverLine || !sourceGlyphRects?.length || !initialLayout ||
      Math.abs(normalizeBoxAngle(layoutAngle)) > 0.01 || !(pageWidthPixels > 0) || !(pageHeightPixels > 0)) return;
    const pageHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
    const pageCanvas = pageHost?.querySelector<HTMLCanvasElement>("canvas[data-pdf-page]");
    if (!pageCanvas || !(pageCanvas.width > 0) || !(pageCanvas.height > 0)) return;
    const frame = initialLayout.origin ?? initialLayout.box;
    const padX = Math.max(4, draftFontSizePixels * 0.6) / pageWidthPixels;
    const padY = Math.max(6, draftFontSizePixels * 1.2) / pageHeightPixels;
    const bounds = {
      x: Math.max(0, frame.x - padX),
      y: Math.max(0, frame.y - padY),
      width: Math.min(1, frame.x + frame.width + padX) - Math.max(0, frame.x - padX),
      height: Math.min(1, frame.y + frame.height + padY) - Math.max(0, frame.y - padY),
    };
    const lifted = liftNativeTextBlockInk(pageCanvas, null, bounds, { frame, glyphs: sourceGlyphRects });
    markPdfTextLatency("typing-cover.cut", { cut: Boolean(lifted?.cover) });
    if (lifted?.cover) setTypingCover(Object.freeze({ line: typingCoverLine, url: lifted.cover.url, rect: lifted.cover.rect }));
  }, [typingCoverWanted, typingCover, typingCoverLine, sourceGlyphRects, initialLayout, layoutAngle, pageWidthPixels,
    pageHeightPixels, inlineEditorHost, draftFontSizePixels]);
  // Lifted from the page as it stood before the first move: at once,
  // against the block's own background, and again against the clean surface
  // once that is drawn.
  useEffect(() => {
    const surfaceReady = editingSurfaceStatus === "ready";
    if (!moveStartFrame || (latestMoveLift && (latestMoveLift.exact || !surfaceReady)) ||
      Math.abs(normalizeBoxAngle(layoutAngle)) > 0.01) return;
    const pageHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
    const pageCanvas = pageHost?.querySelector<HTMLCanvasElement>("canvas[data-pdf-page]");
    if (!pageCanvas || !(pageWidthPixels > 0) || !(pageHeightPixels > 0)) return;
    // Room for the ink past the box (accents, descenders, a swash): a line
    // above and below, as a paragraph's frame can end above its last
    // line's descenders. Ink there comes along only joined to ink inside
    // the frame (native-text-move-lift), so a neighbour's line does not.
    const padPixels = Math.max(4, draftFontSizePixels * 0.6);
    const padX = padPixels / pageWidthPixels;
    const padY = Math.max(6, draftFontSizePixels * 1.2) / pageHeightPixels;
    const bounds = {
      x: Math.max(0, moveStartFrame.x - padX),
      y: Math.max(0, moveStartFrame.y - padY),
      width: Math.min(1, moveStartFrame.x + moveStartFrame.width + padX) - Math.max(0, moveStartFrame.x - padX),
      height: Math.min(1, moveStartFrame.y + moveStartFrame.height + padY) - Math.max(0, moveStartFrame.y - padY),
    };
    const surface = surfaceReady ? editingSurfaceCanvasRef.current : null;
    // A box over a run that paints nothing carries its text, never the
    // page-coloured fill it was drawn on (PDF 0107).
    const fill = /^#[0-9a-f]{6}$/i.test(initialLayout?.sourceInkCover ?? "") ? initialLayout!.sourceInkCover : undefined;
    // Drawn on that fill where the drag starts (the frame holds the line):
    // its text is cut against the fill, the clean surface under it showing
    // the scanned letters of the same words.
    const fillKeyInk = fill && initialLayout?.origin &&
      !pdfInkCoverRectOutsideFrame(moveStartFrame, initialLayout.origin, initialLayout.box.fontSize)
      ? (/^#[0-9a-f]{6}$/i.test(String(initialLayout.box.color ?? "")) ? String(initialLayout.box.color) : "#000000")
      : undefined;
    const fillOptions = fill ? { fill, ...(fillKeyInk ? { fillKeyInk } : {}) } : {};
    const liftAgainstSurface = () => liftNativeTextBlockInk(pageCanvas, surface, bounds, {
      frame: moveStartFrame,
      ...fillOptions,
      // Against its background alone, only ink inside its own glyphs: a
      // neighbour overlapping the frame stays where it is.
      ...(surface ? {} : { glyphs: sourceGlyphRects ?? undefined }),
    });
    // The block alone, drawn beside the clean surface: carried whole, as
    // the page draws it (a part a shape covers there included) and with
    // nothing of a neighbour; cut from page pixels only when there is none
    // (or it is not drawn in time).
    const layer = pdfLoadedTextBlockLayer(surface);
    if (layer) {
      let cancelled = false;
      void Promise.race([layer, new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), 1_500); })])
        .catch(() => null)
        .then((canvas) => {
          if (cancelled) return;
          const lifted = liftNativeTextBlockLayer(canvas, bounds, fillOptions) ?? liftAgainstSurface();
          if (lifted) setLatestMoveLift(Object.freeze({ ...lifted, frame: moveStartFrame, id: (moveLiftSeqRef.current += 1) }));
        });
      return () => { cancelled = true; };
    }
    const lifted = liftAgainstSurface();
    if (lifted) setLatestMoveLift(Object.freeze({ ...lifted, frame: moveStartFrame, id: (moveLiftSeqRef.current += 1) }));
  }, [moveStartFrame, latestMoveLift, editingSurfaceStatus, layoutAngle, inlineEditorHost, pageWidthPixels,
    pageHeightPixels, draftFontSizePixels, sourceGlyphRects, initialLayout?.sourceInkCover, initialLayout?.origin,
    initialLayout?.box.fontSize, initialLayout?.box.color]);

  // The exact geometry the draft's untouched glyphs keep (anchored-text-
  // draft.ts): the newest verified candidate drawn with these properties,
  // else the source line while its properties are untouched. One native row
  // only: a wrapped or multi-row draft is laid out by the browser.
  const draftAnchorGeometry = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    // (A row of several fonts typed past its end too: drafted by the browser it
    // lost every run's size and rise until the page was drawn.)
    if (layoutFallbackActive || activeInputLayout || sourceInputLayout ||
      !(preserveSourceSingleLine || (!sourceLooksMultiLine && overflowFollowedNatively)) || !matrix || matrix.length !== 6 ||
      !initialLayout.pageWidthPx || !initialLayout.pageHeightPx) return null;
    const anchor = candidateGeometry && candidateGeometryPropertiesRef.current === JSON.stringify(properties)
      ? candidateGeometry
      // (A format that moves no glyph keeps the source's places: its look
      // is worn by the glyph boxes, lookOnlyPropertyChange.)
      : !propertyReflowDraftChanged && !paragraphChanges ? sourceGeometry ?? null : null;
    if (!anchor) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    // In the line's own axes, where it runs left to right as its draft does
    // inside its turned frame: read in the page's, a line turned by a
    // quarter or half round had no advances to anchor and was drafted in
    // the browser's own pitch, beside the page's glyphs.
    return projectPdfTextSourceAppearance(anchor, turnBackPageTransform(
      [matrix[0]*sx, matrix[1]*sy, matrix[2]*sx, matrix[3]*sy, matrix[4]*sx, matrix[5]*sy],
      boxQuarterTurn(initialLayout.box.angle) ?? 0, pageWidthPixels, pageHeightPixels));
  }, [activeInputLayout, candidateGeometry, initialLayout?.pdfToCssTransform, initialLayout?.pageWidthPx, initialLayout?.pageHeightPx,
    initialLayout?.box.angle, layoutFallbackActive, overflowFollowedNatively, pageHeightPixels, pageWidthPixels, paragraphChanges,
    preserveSourceSingleLine, properties, propertyReflowDraftChanged, sourceGeometry, sourceInputLayout, sourceLooksMultiLine]);
  // A block of several rows the page draws each on its own (an author's
  // name, affiliation and address, each centred): drafted on the page's own
  // glyphs row by row (planPdfAnchoredTextRows) while the page can still
  // write it in place. Laid out by the browser as one paragraph, the rows
  // stood flush left at the browser's pitch and the words typed wrapped to
  // a row of their own; on leave every row jumped back where the page drew
  
  
  const draftRowsAnchorGeometry = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!initialLayout || initialLayout.promoted || initialLayout.fallbackText || openedInFallbackLane ||
      preserveSourceSingleLine || !sourceLooksMultiLine || manualLayoutDirty || refusalFallbackActive ||
      unprovenTextBoxFormat || managedLayoutTypography || previewError !== null ||
      serverRefusedDraftKey === previewDraftKey || paragraphFrameRequest !== null || paragraphChanges ||
      propertyLayoutDraftChanged || layoutAngleChanged ||
      Math.abs(normalizeBoxAngle(initialLayout.box.angle ?? 0)) > 0.001 ||
      !matrix || matrix.length !== 6 || !initialLayout.pageWidthPx || !initialLayout.pageHeightPx) return null;
    const anchor = candidateGeometry && candidateGeometryPropertiesRef.current === JSON.stringify(properties)
      ? candidateGeometry : sourceGeometry ?? null;
    if (!anchor) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    return projectPdfTextSourceAppearance(anchor, [matrix[0]*sx, matrix[1]*sy, matrix[2]*sx, matrix[3]*sy, matrix[4]*sx, matrix[5]*sy]);
  }, [candidateGeometry, initialLayout, layoutAngleChanged, managedLayoutTypography, manualLayoutDirty,
    openedInFallbackLane, pageHeightPixels, pageWidthPixels, paragraphChanges, paragraphFrameRequest,
    preserveSourceSingleLine, previewDraftKey, previewError, properties, propertyLayoutDraftChanged,
    refusalFallbackActive, serverRefusedDraftKey, sourceGeometry, sourceLooksMultiLine, unprovenTextBoxFormat]);

  // Parts set in a family the PDF holds no face of are shown in that family
  // (its served faces) until the exact candidate is drawn. A single row's
  // input is the run's text, so the parts' offsets are the input's.
  // A part set smaller, lifted or dropped (a superscript or subscript), or
  // coloured, is shown so at once too: the exact candidate takes seconds on
  // a long document, and meanwhile the part read unchanged beside a size
  
  /** The CSS family a family value of the font list draws in: one of the
   * PDF's own fonts by its face, an installed face by its family's served
   * faces, a page font by its own, any other by its name and substitutes. */
  const partFamilyCss = useCallback((value: string): string => {
    const own = propertyProofInput?.fonts.find((font) => font.resourceName === value);
    if (own) return own.family;
    const installed = readPdfNativeEmbeddedFontKey(value);
    if (installed) return withOfficeFontSubstitutes(`"${installed.family.replace(/["\\]/g, "")}"`);
    const page = readPdfPageFontFamilyToken(value);
    if (page) return pdfTextBoxRunCssFamily({ font: classifyFontName(page.family), officeFamily: value });
    return withOfficeFontSubstitutes(`"${value.replace(/["\\]/g, "")}"`);
  }, [propertyProofInput]);
  /** The family name the ribbon shows for a family value. */
  const partFamilyLabel = (value: string): string => {
    const own = propertyProofInput?.fonts.find((font) => font.resourceName === value);
    if (own) return pdfPageFontDisplayFamily(own.family);
    const installed = readPdfNativeEmbeddedFontKey(value);
    return pdfPageFontDisplayFamily(installed?.family ?? value);
  };
  











  /** The face the draft's own text is drawn in, as the PDF names it. */
  const draftOwnFace = useCallback((): NativeTextFace | null => {
    const runName = initialLayout?.runFaces?.[0]?.sourceFontName ?? initialLayout?.box.sourceFontName ?? "";
    return editableFont && !isPdfNativeEmbeddedFontKey(editableFont.resourceName)
      ? editableFont
      : runName
        ? { family: runName, baseFont: runName, bold: /bold|black|heavy|demi|semibold/iu.test(runName),
            italic: /italic|oblique/iu.test(runName) } as NativeTextFace
        : null;
  }, [editableFont, initialLayout?.box.sourceFontName, initialLayout?.runFaces]);
  /** Whether a part set bold is written as a stroke of its own face (the
   * family has no bold face in the PDF): drafted so, at the face's own
   * advances. A browser's synthetic bold widened each glyph by a pixel and
   * the part's words ran past the box until the page painted them. */
  const partBoldStrokes = useCallback((): boolean => {
    const face = draftOwnFace();
    if (!face || nativeTextFaceStyle(face).bold || isPdfNativeEmbeddedFontKey(editableFont?.resourceName ?? "")) return false;
    return !propertyProof?.fonts.some((font) => nativeTextSameFamily(font, face) && nativeTextFaceStyle(font).bold) &&
      Boolean(propertyProof && pdfNativeSyntheticBoldDrawable(propertyProof.original));
  }, [draftOwnFace, editableFont?.resourceName, propertyProof]);
  const toggledFaceFamilyCss = useCallback((bold: boolean | undefined, italic: boolean | undefined): string | undefined => {
    if (bold === undefined && italic === undefined) return undefined;
    const face = draftOwnFace();
    if (!face) return undefined;
    // (The face's own style as the buttons read it: nativeTextFaceStyle.)
    const own = nativeTextFaceStyle(face);
    const wantBold = bold ?? own.bold;
    const wantItalic = italic ?? own.italic;
    if (wantBold === own.bold && wantItalic === own.italic) return undefined;
    const sibling = propertyProof?.fonts.find((font) => {
      const style = nativeTextFaceStyle(font);
      return nativeTextSameFamily(font, face) && style.bold === wantBold && style.italic === wantItalic;
    });
    if (sibling) {
      // The face as the page loaded it when this line draws it; else by
      // name, then a served face of its width: the PDF name alone is no
      // face the browser has, and the words stood in a wide default until
      
      // (Its copy keyed by the pages' characters: the raw pdf.js face keys
      // its glyphs by codes the words typed are not, and drew them in the
      // browser's default sans.)
      const narrow = /cn\b|cond|narrow|compress/iu.test(sibling.baseFont || sibling.family);
      return servedFaceWhereLacking(sibling, `${ownFontDraftCss(sibling)}, ${withOfficeFontSubstitutes(narrow ? '"Arial Narrow"' : '"Arial"')}`);
    }
    const served = readPdfNativeEmbeddedFontKey(
      nativeTextStyleOffServedFaceKey(face, propertyProof?.fonts ?? [], { bold: wantBold, italic: wantItalic }) ?? "");
    if (served) return withOfficeFontSubstitutes(`"${served.family.replace(/["\\]/g, "")}"`);
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- draftFamilyCss is a plain helper of this render
  }, [draftOwnFace, initialLayout?.runFaces, propertyProof, replacementText, originalText, draftFontSizePixels]);
  /** A part's look on the draft: its face, weight, slant, rules, colour,
   * size (against the line's own) and rise. */
  const partFormatDraftCss = useCallback((part: PdfTextPartFields): Record<string, string> => {
    const css: Record<string, string> = officeFormatPreviewCss({
      ...(part.family !== undefined ? { fontFamily: part.family } : {}),
      ...(part.bold !== undefined ? { bold: part.bold } : {}),
      ...(part.italic !== undefined ? { italic: part.italic } : {}),
      ...(part.underline !== undefined ? { underline: part.underline } : {}),
      ...(part.strikethrough !== undefined ? { strike: part.strikethrough } : {}),
      ...(part.color !== undefined ? { color: part.color } : {}),
    }, { fontFamilyCss: partFamilyCss });
    if (part.family === undefined) {
      const toggled = toggledFaceFamilyCss(part.bold, part.italic);
      if (toggled) css["font-family"] = toggled;
      // A bold written as a stroke is drafted as that stroke; a part whose
      // bold comes off a stroked line loses the stroke the line's draft has.
      if (part.bold === true && !toggled && partBoldStrokes()) {
        css["font-weight"] = "400";
        css["-webkit-text-stroke"] = `${PDF_NATIVE_SYNTHETIC_BOLD_STROKE_EM}em currentColor`;
      } else if (part.bold === false) {
        css["-webkit-text-stroke-width"] = "0";
      }
    }
    // A rule pressed on a part keeps the other style's rule it has.
    if (part.underline !== undefined || part.strikethrough !== undefined) {
      const lines = [part.underline ? "underline" : "", part.strikethrough ? "line-through" : ""].filter(Boolean);
      css["text-decoration-line"] = lines.length ? lines.join(" ") : "none";
    }
    const base = readerPointSize ?? (properties && propertyProof
      ? properties.fontSize * nativeTextMatrixScaleOf(propertyProof, properties) : null);
    // A script is shown at 2/3 of its size, a size asked of it too (Word; the
    // write sets it so): an 18 pt superscript was drawn at 18 in the draft and
    
    const scripted = part.script === "superscript" || part.script === "subscript";
    if (part.sizePoints !== undefined && base && base > 0) {
      css["font-size"] = `${Math.round(part.sizePoints * (scripted ? PDF_NATIVE_SCRIPT_SIZE : 1) / base * 10000) / 100}%`;
    }
    if (scripted) {
      css["font-size"] = css["font-size"] ?? `${Math.round(PDF_NATIVE_SCRIPT_SIZE * 1000) / 10}%`;
      css.position = "relative";
      css.top = `${-pdfNativeScriptRiseEm(part.script as "superscript" | "subscript")}em`;
    } else if (part.script === "none") {
      css.position = "relative";
      css.top = "0";
    }
    return css;
  }, [partBoldStrokes, partFamilyCss, readerPointSize, properties, propertyProof, toggledFaceFamilyCss]);
  const embeddedDraftRanges = useMemo((): readonly PdfTextDraftFormatPreview[] => {
    // A part of a line of several runs, or of one row of a box of several
    // rows (its format set row by row when the box is left): shown in its
    // look meanwhile, as a run's part is. Each press keeps its look: only
    // the last press's hover look stayed on the draft of a paragraph before
    // (bold, then a superscript on other words: the bold went; owner's
    
    // Every part pressed this session, in its look (partFormats): one
    
    const display = (offset: number) => activeInputLayout ? pdfNativeTextInputDisplayOffset(activeInputLayout, offset) : offset;
    // A part freed from its glyph boxes is set at its face's own advances
    // (anchored-text-draft, no spacing of the draft's): the letter spacing
    // the run itself is written with (`Tc`, the part's own where it states
    // one, under the run's horizontal scale) is the part's too.
    const unitPx = properties && properties.fontSize > 0 && draftFontSizePixels > 0 ? draftFontSizePixels / properties.fontSize : 0;
    const freedSpacing = (start: number, end: number): Record<string, string> => {
      if (!properties || !(unitPx > 0)) return {};
      const own = properties.segments?.find((segment) => segment.start <= start && end <= segment.end)?.characterSpacing;
      const spacing = own ?? properties.characterSpacing ?? 0;
      if (Math.abs(spacing) < 1e-6) return {};
      const scale = properties.horizontalScale > 0 ? properties.horizontalScale / 100 : 1;
      return { "letter-spacing": `${Math.round(spacing * unitPx * scale * 1000) / 1000}px` };
    };
    const rowRanges: PdfTextDraftFormatPreview[] = partFormats.flatMap((part) => {
      const start = display(part.start), end = display(part.end);
      if (!(end > start)) return [];
      const css = partFormatDraftCss(part);
      // (Another face sets the part's own glyphs again: out of their boxes.)
      const frees = Boolean(css["font-family"]);
      return Object.keys(css).length
        ? [{ start, end, css: frees ? { ...freedSpacing(part.start, part.end), ...css } : css, band: false, ...(frees ? { frees: true } : {}) }]
        : [];
    });
    if (activeInputLayout || !properties?.segments?.length) return rowRanges;
    const pxPerUnit = properties.fontSize > 0 && draftFontSizePixels > 0 ? draftFontSizePixels / properties.fontSize : 0;
    return [...properties.segments.flatMap((segment) => {
      const request = readPdfNativeEmbeddedFontKey(segment.fontResourceName);
      const css: Record<string, string> = request ? {
        "font-family": withOfficeFontSubstitutes(`"${request.family.replace(/["\\]/g, "")}"`),
        "font-weight": request.bold ? "700" : "400",
        "font-style": request.italic ? "italic" : "normal",
      } : {};
      if (pxPerUnit > 0 && segment.fontSize !== undefined && segment.fontSize > 0 &&
        Math.abs(segment.fontSize - properties.fontSize) > 1e-6) {
        css["font-size"] = `${Math.round(segment.fontSize * pxPerUnit * 100) / 100}px`;
      }
      if (pxPerUnit > 0 && segment.textRise !== undefined && segment.textRise !== (properties.textRise ?? 0)) {
        css.position = "relative";
        css.top = `${Math.round(-(segment.textRise - (properties.textRise ?? 0)) * pxPerUnit * 100) / 100}px`;
      }
      if (segment.color) css.color = colorToHex(segment.color);
      if (Object.keys(css).length === 0) return [];
      return [{ start: segment.start, end: segment.end, css, band: false, ...(request ? { frees: true } : {}) }];
    }), ...rowRanges,
    // The face a part is written in has the last word on its weight and
    // slant: a part pressed bold (drafted as a stroke of the line's face)
    // and then italic is written in the served family's bold italic, and
    // its draft kept the stroke on the family's regular italic -- 13 px
    
    ...properties.segments.flatMap((segment) => {
      const request = readPdfNativeEmbeddedFontKey(segment.fontResourceName);
      if (!request) return [];
      return [{ start: segment.start, end: segment.end, band: false, frees: true, css: {
        "font-family": withOfficeFontSubstitutes(`"${request.family.replace(/["\\]/g, "")}"`),
        "font-weight": request.bold ? "700" : "400",
        "font-style": request.italic ? "italic" : "normal",
        ...(segment.syntheticBold === true ? {} : { "-webkit-text-stroke-width": "0" }),
        ...freedSpacing(segment.start, segment.end),
      } }];
    })];
  }, [activeInputLayout, properties?.segments, properties?.fontSize, properties?.textRise,
    properties?.characterSpacing, properties?.horizontalScale, draftFontSizePixels, partFormats, partFormatDraftCss]);
  // A line the page draws in several faces (a bold title with one regular
  // word) is drafted in one: each run's stretch wears its own face under the
  // parts pressed. A part made bold drew the bold words around it regular
  
  // the run they were typed into.
  const draftMainBold = Number(inlineTypographyStyle.fontWeight ?? 400) >= 600 || inlineTypographyStyle.fontWeight === "bold";
  const draftMainItalic = inlineTypographyStyle.fontStyle === "italic" || inlineTypographyStyle.fontStyle === "oblique";
  const sourceFaceRanges = useMemo((): readonly PdfTextDraftFormatPreview[] => {
    // A weight drawn by stroking the glyphs and a slant drawn by the text
    // matrix are the run's look too: a part this writer set bold and italic
    // in the line's own face was drafted regular and upright, its words
    
    const slantedRun = pdfNativeDrawnRunIsSlanted;
    // Its own weight and slant as its font, its program or its name says
    // (pdfFaceNameStyle, as its draft copy is registered: a "BoldCnIt" part
    // the font option called regular was drafted regular).
    type DraftRun = Readonly<{ text: string; baseFont: string; programFamily?: string;
      face: Readonly<{ family: string; bold: boolean; italic: boolean; synthetic: boolean }> }>;
    const appearanceRun = (run: PdfNativeSourceTextAppearanceRun): DraftRun => {
      const named = pdfFaceNameStyle(run.font.baseFont);
      const ownBold = Boolean(run.font.bold) || (run.programFace?.weight ?? 0) >= 600 || named.bold;
      const ownItalic = Boolean(run.font.italic || run.programFace?.italic) || named.italic;
      return { text: run.text, baseFont: run.font.baseFont, programFamily: run.programFace?.family, face: {
        family: pdfPageFontDisplayFamily(run.programFace?.family ?? run.font.family),
        bold: ownBold || Boolean(run.syntheticBold), italic: ownItalic || slantedRun(run),
        synthetic: Boolean(run.syntheticBold) || (!ownItalic && slantedRun(run)),
      } };
    };
    // Before the proof's appearance comes, the runs the page's reader reads
    // (PDFViewer's readerRuns: each item's font and its face's own weight and
    // slant): the line is drafted run by run from the moment it opens, as it
    // is after. Drafted in the box's one font, the IPCC subtitle -- its box
    // named by the bold italic face of one installed part -- stood bold
    
    const readerRun = (run: PdfNativeTextReaderRun): DraftRun => ({ text: run.text, baseFont: run.sourceFontName,
      face: { family: pdfPageFontDisplayFamily(run.sourceFontName.replace(/^[A-Z]{6}\+/u, "")),
        bold: run.bold, italic: run.italic, synthetic: false } });
    const runs: DraftRun[] = sourceAppearance
      ? sourceAppearance.filter((run) => run.text.length > 0).map(appearanceRun)
      : (initialLayout?.readerRuns ?? []).filter((run) => run.text.length > 0).map(readerRun);
    const faceOf = (run: DraftRun) => run.face;
    const inked = runs.filter((run) => run.text.trim()).map(faceOf);
    if (properties?.segments?.length || inked.length < 2 ||
      inked.every((face) => face.family === inked[0].family && face.bold === inked[0].bold && face.italic === inked[0].italic)) return [];
    // Each run laid onto the box's own text in order, blanks aside: the
    // runs need not spell its blanks (a Word bullet's marker and its text are
    // two shows with no space between them), and laid by their joined text a
    // marker's face ran over the whole line -- every letter drawn in
    // Wingdings once the draft showed (WHO sitrep p2, the side browser walk).
    const original = sourceInputLayout ? sourceInputLayout.text : originalText;
    const starts: number[] = [];
    let cursor = 0;
    for (const run of runs) {
      let first = -1;
      for (const character of run.text.replace(/\s+/gu, "")) {
        while (cursor < original.length && /\s/u.test(original[cursor])) cursor += 1;
        if (!original.startsWith(character, cursor)) return [];
        if (first < 0) first = cursor;
        cursor += character.length;
      }
      starts.push(first < 0 ? cursor : first);
    }
    const text = sourceInputLayout?.text ?? replacementText;
    let shared = 0;
    const limit = Math.min(original.length, text.length);
    while (shared < limit && original[shared] === text[shared]) shared += 1;
    let tail = 0;
    while (tail < limit - shared && original[original.length - 1 - tail] === text[text.length - 1 - tail]) tail += 1;
    // An offset of the box's own text in the draft's text: past the change,
    // shifted by it; inside it, at its end (the words typed take the face of
    // the run they were typed into).
    const shift = text.length - original.length;
    const toText = (offset: number) => offset <= shared ? offset
      : offset >= original.length - tail ? offset + shift : text.length - tail;
    const display = (offset: number) => activeInputLayout ? pdfNativeTextInputDisplayOffset(activeInputLayout, offset) : offset;
    const ranges: PdfTextDraftFormatPreview[] = [];
    // Runs in the box's own font are drafted in the face the page loaded for
    // it (the draft's own family, box.displayFontFamily: the page's glyphs);
    // named by its family instead, a face the browser does not hold, the
    
    const bodyFont = (initialLayout?.box.sourceFontName ?? "").replace(/^[A-Z]{6}\+/u, "");
    for (const [index, run] of runs.entries()) {
      const face = faceOf(run);
      // (A run in the box's own font drafted at another weight or slant than
      // the draft's own is drafted at its own: a box named by its bold italic
      
      if (bodyFont && run.baseFont.replace(/^[A-Z]{6}\+/u, "") === bodyFont && !properties?.syntheticBold &&
        !face.synthetic && face.bold === draftMainBold && face.italic === draftMainItalic) continue;
      // Disjoint, in order: a change across a run boundary is the first run's.
      let start = Math.max(display(toText(index === 0 ? 0 : starts[index])), ranges.at(-1)?.end ?? 0);
      let end = display(index + 1 < runs.length ? toText(starts[index + 1]) : text.length);
      // Its inked characters only: the blanks beside a run are the line's
      // (a subset face often has no space -- drawn in it, a missing-glyph
      
      const shown = displayedInputValue;
      while (end > start && /\s/u.test(shown[end - 1] ?? "")) end -= 1;
      while (start < end && /\s/u.test(shown[start] ?? "")) start += 1;
      if (!(end > start)) continue;
      // A bold (italic) face is drawn bold (italic); a regular run is drawn
      // regular, or bold where a bold pressed on the whole group strokes its
      // outlines. Each run says its weight and slant: a regular run left to
      // inherit took the line's own (its first run's), and a word set
      
      // The face the page loaded for the run's font (pdf.js's own program
      // of it), else the family by name: by name, a face the browser had
      // not loaded measured the line wider than the page sets it, and the
      
      // (xelatex names a Type0 face with its CMap and the reader without: drafted
      // by name, a TeX line's bold Song and Latin Modern fell to the system's faces.)
      const namedAs = (name: string) => name.replace(/^[A-Z]{6}\+/u, "").replace(/-Identity-[HV]$/u, "");
      const loaded = initialLayout?.runFaces?.find((entry) =>
        namedAs(entry.sourceFontName) === namedAs(run.baseFont))?.displayFontFamily;
      ranges.push({ start, end, band: false, css: {
        // (Its copy keyed by the pages' characters, where one was made: the
        // part's own glyphs.)
        "font-family": loaded ? withRepairedPdfJsFaces(withSimilarFaces(loaded, run.programFamily ?? run.baseFont))
          : withOfficeFontSubstitutes(`"${face.family.replace(/["\\]/g, "")}"`),
        "font-weight": face.bold || properties?.syntheticBold ? "700" : "400",
        "font-style": face.italic ? "italic" : "normal",
      } });
    }
    return ranges;
  }, [activeInputLayout, originalText, properties?.segments, properties?.syntheticBold, replacementText, sourceAppearance, sourceInputLayout,
    draftMainBold, draftMainItalic,
    initialLayout?.box.sourceFontName, initialLayout?.runFaces, initialLayout?.readerRuns, displayedInputValue]);
  // The PDF's own underline and strikethrough (paths drawn beside the
  // text) on the draft while the surface under it is the cover, which
  // paints over them: the words drafted there lost their rule until the
  
  const coverSurfaceShown = editingSurfaceStatus === "ready" &&
    editingSurfaceCanvasRef.current?.dataset.pdfNativeTextCoverSurface === "true";
  const nativeRuleRanges = useMemo((): readonly PdfTextDraftFormatPreview[] => {
    const rules = nativeTextDecorations;
    const length = displayedInputValue.length;
    if (!coverSurfaceShown || !rules || !(length > 0)) return [];
    const ranges: PdfTextDraftFormatPreview[] = [];
    const add = (whole: boolean, range: PdfNativeTextRuleRange | undefined, decoration: { underline?: boolean; strike?: boolean }) => {
      const from = whole ? 0 : range ? Math.round(range.from * length) : -1;
      const to = whole ? length : range ? Math.round(range.to * length) : -1;
      if (to > from && from >= 0) ranges.push({ start: from, end: to, css: {}, band: false, decoration });
    };
    add(rules.underline, rules.underlineRange, { underline: true });
    add(rules.strikethrough, rules.strikethroughRange, { strike: true });
    return ranges;
  }, [coverSurfaceShown, displayedInputValue.length, nativeTextDecorations]);
  // A scanned line's own rules on its draft: the ones standing beside its
  // invisible words (the cover the line is edited on paints over them) and
  // the ones pressed this session, each over the ones before it.
  const coverRuleDraftRanges = useMemo((): readonly PdfTextDraftFormatPreview[] => {
    if (!coverRulesLane || !coverRulesProven) return NO_COVER_RULE_DRAFT_RANGES;
    const display = (offset: number) => activeInputLayout ? pdfNativeTextInputDisplayOffset(activeInputLayout, offset) : offset;
    const ranges: PdfTextDraftFormatPreview[] = [];
    for (const style of PDF_NATIVE_COVER_RULE_STYLES) {
      const add = (range: Readonly<{ start: number; end: number }>, on: boolean) => {
        const start = display(range.start), end = display(range.end);
        if (end > start) {
          ranges.push({ start, end, css: {}, band: false, decoration: style === "underline" ? { underline: on } : { strike: on } });
        }
      };
      for (const stretch of coverRulesProven[style]) add(stretch, true);
      for (const part of partFormats) {
        const on = part[style];
        if (on !== undefined) add(part, on);
      }
    }
    return ranges.length ? ranges : NO_COVER_RULE_DRAFT_RANGES;
  }, [coverRulesLane, coverRulesProven, partFormats, activeInputLayout]);
  const draftLookRanges = useMemo(() => coverRuleDraftRanges.reduce(
    (ranges, range) => mergePdfTextDraftRanges(ranges, range),
    embeddedDraftRanges.reduce(
      (ranges, range) => mergePdfTextDraftRanges(ranges, range),
      nativeRuleRanges.reduce((ranges, range) => mergePdfTextDraftRanges(ranges, range), sourceFaceRanges))),
  [coverRuleDraftRanges, embeddedDraftRanges, nativeRuleRanges, sourceFaceRanges]);

  useLayoutEffect(() => {
    const draft = visualDraftElementRef.current;
    if (!draft) return;
    const runDraft = Boolean(managedDraftRuns && replacementText && displayedInputValue === replacementText);
    const anchoredPlan = displayedInputValue && !pdfTextDraftHasFallbackGlyphs(displayedInputValue, sourceFallbackAdvances)
      ? planPdfAnchoredTextDraft(draftAnchorGeometry, displayedInputValue) : null;
    const anchorHost = anchoredPlan ? inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page") ?? null : null;
    const shownPreview = formatPreviewShown ? shownFormatPreview : null;
    // A format that changes the characters' widths sets a paragraph again in
    // its frame, its lines wrapping where they no longer fit (the rewrite): its
    // rows previewed as the source breaks them ran off the frame and left the
    // lines under them standing, and the press moved them all.
    const previewReflows = Boolean(shownPreview && activeInputLayout?.breaks.length &&
      ["font-size", "font-family"].some((name) => shownPreview.css[name] !== undefined));
    const preview = shownPreview && previewReflows && shownPreview.css["font-size"]
      ? { ...shownPreview, css: { ...shownPreview.css, "line-height": "1.2" } } : shownPreview;
    const draftText = previewReflows && activeInputLayout
      ? pdfNativeTextInputLayoutJoinedRows(activeInputLayout) : displayedInputValue;
    // Why a line's draft is not anchored (dev builds; an anchored draft says nothing).
    if (process.env.NODE_ENV !== "production" && !(anchoredPlan && anchorHost && anchorHost.clientWidth > 0)) {
      console.debug("[pdf-text] draft anchor " + JSON.stringify({
        geometry: Boolean(draftAnchorGeometry), plan: Boolean(anchoredPlan), host: Boolean(anchorHost && anchorHost.clientWidth > 0),
        preview: Boolean(preview), ranges: embeddedDraftRanges.length,
        why: draftAnchorGeometry ? undefined : { layoutFallbackActive, activeInputLayout: Boolean(activeInputLayout),
          sourceInputLayout: Boolean(sourceInputLayout), preserveSourceSingleLine, candidate: Boolean(candidateGeometry),
          source: Boolean(sourceGeometry), propertyLayoutDraftChanged, paragraphChanges: Boolean(paragraphChanges),
          sourceLooksMultiLine, promoted: Boolean(initialLayout?.promoted), boxHeight: initialLayout?.box.height,
          boxFontSize: initialLayout?.box.fontSize },
        // What of the run's draft differs from its baseline, and how it was read.
        draft: properties && classifiedPropertyBaseline ? {
          lookOnly: lookOnlyPropertyChange, partFaceOnly: partFaceOnlyPropertyChange, proof: Boolean(propertyProof),
          held: Boolean(heldPropertyBaseline),
          changed: [...new Set([...Object.keys(properties), ...Object.keys(classifiedPropertyBaseline)])].filter((name) =>
            name !== "segments" && JSON.stringify((properties as unknown as Record<string, unknown>)[name]) !==
              JSON.stringify((classifiedPropertyBaseline as unknown as Record<string, unknown>)[name])),
          segments: properties.segments ?? null, baseSegments: classifiedPropertyBaseline.segments ?? null,
        } : null,
      }));
    }
    let laidOutByBrowser = false;
    const anchoredRows = !anchoredPlan && !previewReflows && draftRowsAnchorGeometry && displayedInputValue &&
      !pdfTextDraftHasFallbackGlyphs(displayedInputValue, sourceFallbackAdvances)
      ? planPdfAnchoredTextRows(draftRowsAnchorGeometry, replacementText) : null;
    const rowsHost = anchoredRows ? inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page") ?? null : null;
    // The page's other text beside the block (its reader boxes, the block's
    // own excepted): the room the edited row may grow into ends at it.
    const rowsObstacles = (() => {
      if (!rowsHost || !draftRowsAnchorGeometry) return [];
      const host = rowsHost.getBoundingClientRect();
      if (!(host.width > 0) || !(pageWidthPixels > 0) || !(pageHeightPixels > 0)) return [];
      const b = draftRowsAnchorGeometry.bounds;
      const own = { left: host.left + b.left * host.width / pageWidthPixels, right: host.left + b.right * host.width / pageWidthPixels,
        top: host.top + b.top * host.height / pageHeightPixels, bottom: host.top + b.bottom * host.height / pageHeightPixels };
      return Array.from(rowsHost.querySelectorAll<HTMLElement>('span[data-pdf-native-text-edit-box="true"]')).flatMap((box) => {
        const rect = box.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) return [];
        const overlap = Math.max(0, Math.min(rect.right, own.right) - Math.max(rect.left, own.left)) *
          Math.max(0, Math.min(rect.bottom, own.bottom) - Math.max(rect.top, own.top));
        return overlap > rect.width * rect.height * 0.3 ? [] : [{ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }];
      });
    })();
    let rowsAnchored = false;
    if (anchoredPlan && anchorHost && anchorHost.clientWidth > 0) {
      // Page pixels to the host's own CSS pixels (they differ under a zoom).
      fillPdfAnchoredTextDraft(draft, anchoredPlan, anchorHost.clientWidth / pageWidthPixels, preview, draftLookRanges);
      draft.dataset.pdfNativeTextDraftAnchored = "true";
    } else if (anchoredRows && rowsHost && fillPdfAnchoredTextRows(draft, anchoredRows,
      { host: rowsHost, pageWidth: pageWidthPixels, pageHeight: pageHeightPixels, breaks: Boolean(activeInputLayout?.breaks.length),
        obstacles: rowsObstacles,
        centred: centredBlockDraft && draftRowsAnchorGeometry
          ? { left: draftRowsAnchorGeometry.bounds.left, right: draftRowsAnchorGeometry.bounds.right } : null },
      preview, draftLookRanges) && draft.textContent === displayedInputValue) {
      // Each row where the page draws it (draftRowsAnchorGeometry).
      draft.dataset.pdfNativeTextDraftAnchored = "rows";
      rowsAnchored = true;
    } else if (runDraft && managedDraftRuns) {
      fillPdfTextDraftRuns(draft, managedDraftRuns, preview);
      delete draft.dataset.pdfNativeTextDraftAnchored;
    } else {
      // A preview over parts already shown in their own look (a served
      // family, a superscript): both, the preview's look on top.
      // The runs' own faces as well (sourceFaceRanges): drafted in one, a
      // title one word of which an earlier round set regular was drafted
      
      if (preview && draftLookRanges.length) {
        fillPdfTextDraftRanges(draft, draftText || "\u200b", mergePdfTextDraftRanges(draftLookRanges, preview),
          sourceFallbackAdvances);
      } else if (preview) fillPdfTextDraftPreview(draft, draftText || "\u200b", preview, sourceFallbackAdvances);
      // (Each run in its own face, a missing glyph at its own advance.)
      else if (draftLookRanges.length) {
        fillPdfTextDraftRanges(draft, displayedInputValue || "\u200b", draftLookRanges, sourceFallbackAdvances);
      }
      else fillPdfTextDraft(
        draft,
        displayedInputValue || "\u200b",
        sourceFallbackAdvances,
        sourceFontSizePx,
      );
      delete draft.dataset.pdfNativeTextDraftAnchored;
      laidOutByBrowser = true;
      // The draft the browser lays out keeps a drop cap's rows beside it:
      // a float of their indent and height before the text (a draft whose
      // rows the PDF sets, anchored or in runs, has its own).
      if (layoutFallbackActive && leadingRowIndent) {
        const spacer = draft.ownerDocument.createElement("span");
        spacer.setAttribute("aria-hidden", "true");
        spacer.dataset.pdfNativeTextLeadingIndent = "true";
        spacer.style.float = "left";
        spacer.style.width = `${leadingRowIndent.indent / (reflowScale * wrappedScaleX)}px`;
        spacer.style.height = `${(leadingRowIndent.rows * leadingRowIndent.pitch) / reflowScale}px`;
        draft.insertBefore(spacer, draft.firstChild);
      }
    }
    draft.style.color = visualDraftColor;
    draft.style.webkitTextFillColor = visualDraftColor;
    draft.style.fontFamily = String(visualDraftFontFamily ?? "");
    draft.style.fontSize = String(visualDraftFontSize ?? "");
    draft.style.fontStyle = String(visualDraftFontStyle ?? "");
    draft.style.fontWeight = String(visualDraftFontWeight ?? "");
    draft.style.letterSpacing = String(visualDraftLetterSpacing ?? "");
    draft.style.wordSpacing = String(visualDraftWordSpacing ?? "");
    draft.style.lineHeight = String(visualDraftLineHeight ?? "");
    draft.style.textAlign = String(visualDraftTextAlign ?? "");
    draft.style.textDecorationLine = visualDraftTextDecoration;
    draft.style.webkitTextStroke = strokeBold ? `${PDF_NATIVE_SYNTHETIC_BOLD_STROKE_EM}em currentColor` : "";
    // A paragraph's synthetic italic word by word (slantPdfDraftWords).
    if (laidOutByBrowser && draftSlantsWords) {
      const font = Number.parseFloat(String(visualDraftFontSize ?? "")) || draftFontSizePixels;
      const line = Number.parseFloat(String(visualDraftLineHeight ?? "")) || font * PDF_TEXTBOX_LINE_HEIGHT_RATIO;
      slantPdfDraftWords(draft, Math.max(0, (line - font) / 2 + 0.8 * font));
    }
    if (runDraft && managedDraftRuns) {
      // The draft's own line is no taller than its smallest run's: each row
      // is as tall as the runs on it.
      draft.style.fontSize = `${Math.min(...managedDraftRuns.map((run) => Number.parseFloat(run.css["font-size"])))}px`;
      draft.style.lineHeight = `${Math.min(...managedDraftRuns.map((run) => Number.parseFloat(run.css["line-height"])))}px`;
      draft.style.textDecorationLine = "none";
      applyPdfTextBoxExactAdvanceStyle(draft);
      draft.dataset.pdfTextDraftExactAdvances = "true";
    } else if (draft.dataset.pdfTextDraftExactAdvances) {
      delete draft.dataset.pdfTextDraftExactAdvances;
      draft.style.fontKerning = String(inlineTypographyStyle.fontKerning ?? "");
      draft.style.fontVariantLigatures = String(inlineTypographyStyle.fontVariantLigatures ?? "");
      draft.style.fontFeatureSettings = String(inlineTypographyStyle.fontFeatureSettings ?? "");
      draft.style.removeProperty("text-spacing-trim");
    }
    // A preview, or characters pressed in a size of their own.
    const ownSizes = [...(preview ? [preview] : []), ...draftLookRanges].flatMap((range) => {
      const size = range.css["font-size"];
      if (!size) return [];
      const shown = Number.parseFloat(String(visualDraftFontSize ?? "")) || draftFontSizePixels;
      return [size.endsWith("%") ? shown * Number.parseFloat(size) / 100 : Number.parseFloat(size)];
    });
    // (Rows anchored stand each on its own baseline: no layer to pin.)
    if (!rowsAnchored && (preview || ownSizes.length || draftLookRanges.some((range) => range.css["text-decoration-line"] || range.decoration))) {
      pinPdfTextDraftLine(draft, Math.max(Number.parseFloat(String(visualDraftFontSize ?? "")) || draftFontSizePixels, ...ownSizes),
        Boolean(anchoredPlan && anchorHost) && !laidOutByBrowser);
      const layer = draft.querySelector<HTMLElement>("[data-pdf-text-draft-layer]");
      if (layer && previewReflows) layer.style.whiteSpace = "pre-wrap";
    }
    draft.dataset.pdfNativeTextDraftValidity = previewError
      ? "unverified"
      : previewBusy
        ? "validating"
        : "verified";
    draft.style.visibility = visualDraftVisible && !hoverExactShown ? "visible" : "hidden";
    // Native paragraphs retain their own mixed fonts until a draft changes;
    // after verification the exact PDF candidate owns visible typography.
    if (!submitting) {
      const surface = editingSurfaceCanvasRef.current;
      const candidate = publishedPreviewCanvasRef.current;
      if (surface) surface.style.visibility = showsSource || showsCandidate ? "hidden" : "visible";
      if (candidate) candidate.style.visibility = showsCandidate ? "visible" : "hidden";
      const pageHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page");
      if (pageHost && (!showsSource || showsCandidate)) suppressSourceCanvas(pageHost);
      const suppressed = suppressedSourceCanvasRef.current;
      if (suppressed?.canvas.isConnected) {
        suppressed.canvas.style.visibility = showsSource && !showsCandidate ? suppressed.visibility : "hidden";
      }
    }

    let active = true;
    markPdfTextLatency("lfx.measure");
    const measureLayout = () => {
      measureLayoutRef.current = measureLayout;
      // A previewed look is not the draft's: nothing is measured from it
      // (its width would grow the frame or send the line to a text box).
      if (!active || !draft.isConnected || preview) return;
      // The width the browser's setting of the draft needs is read for a
      
      
      // again off screen, ~20 ms in Safari) went on every key typed into
      // the box just opened.
      if (layoutFallbackActive && layoutRect && (manualLayoutDirty || contentDraftDirty) && !preparationPending) {
        const run = {text: replacementText, fontSize: Number.parseFloat(String(visualDraftFontSize))};
        // The frame is as wide as the page leaves it (the layout clamps it to
        // the right edge): measured at a width running past the edge, every
        // draft "did not fit" and a size raised on a line drawn to the edge
        
        // (Along the line: a turned line's edge is its own, ownLayoutRect.)
        const lineRect = ownLayoutRect ?? layoutRect;
        const room = 1 - lineRect.x;
        const requestedWidth = (room > 0 ? Math.min(lineRect.width, room) : lineRect.width) *
          ownPageWidthPixels / reflowScale;
        const font = `${visualDraftFontStyle || "normal"} ${visualDraftFontWeight || "400"} ${run.fontSize}px ${visualDraftFontFamily || "sans-serif"}`;
        const key = JSON.stringify([replacementText, requestedWidth, font, document.fonts?.status]);
        const previous = minimumWidthMeasurementRef.current;
        const requiredWidth = previous?.key === key ? previous.value
          : minimumPdfBrowserTextWidth([run], requestedWidth, () => font);
        minimumWidthMeasurementRef.current = {key,value:requiredWidth};
        if (requiredWidth !== null) setMeasuredMinimumWidth(current =>
          Math.abs(current-requiredWidth*reflowScale) < .01 ? current : requiredWidth*reflowScale);
      }
      const caretHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]") ?? null;
      // The visible draft places the caret whenever it is what is seen (the
      // exact source geometry still wins when it is current), not only when
      // it sets placeholders the textarea cannot.
      // (A box set in runs is drawn in several faces and sizes the input's
      // one face cannot follow: its draft places the caret too.) A line of a
      // page turned by a quarter is set turned with it, and its draft's
      // boxes are still its characters': upright only, the caret there was
      // the textarea's own, between glyphs of another face.
      
      // to the page (reflowScale): the input's own caret was scaled with it,
      
      // 贼厚」 in a resized subtitle). Its draft is laid out like the input
      // whether it is seen or not, and places a one-pixel caret.
      const draftAngle = normalizeBoxAngle(initialLayout?.box.angle);
      // An exact preview with no glyph boxes of its own (the substitute
      // face's, set by the font extension) is placed over by its draft, laid
      // out hidden beneath it: without, the input's own selection showed, a
      
      // (Only for an edit: a line not changed has no preview over it.)
      const previewWithoutGlyphs = contentDraftDirty && exactPreviewIsCurrent && candidateGeometry?.text !== replacementText;
      const drawsOwnCaret =
        (visualDraftVisible || layoutFallbackActive || previewWithoutGlyphs) && !composing && !layoutAngleChanged &&
        caretHost !== null &&
        Math.abs(draftAngle - Math.round(draftAngle / 90) * 90) < 0.001;
      // The line's own glyph geometry, when it is current, places the caret
      // (drawnCaretGeometry): the draft's boxes are then not read -- each
      // read lays the draft out character by character, ~11 ms in Safari,
      
      const nextCaretGeometry = drawsOwnCaret && !nativeCaretGeometryRef.current
        ? pdfTextDraftAppearance(draft, caretHost!, pageWidthPixels, pageHeightPixels, displayedInputValue,
            { sourceSha256: sourceGeometry?.sourceSha256 ?? "", pageNumber: sourceGeometry?.pageNumber ?? 0 },
            activeInputLayout ? (offset) => pdfNativeTextInputCanonicalOffset(activeInputLayout, offset) : undefined,
            draftAngle)
        : null;
      // Measured again from an unchanged draft (each pass of this effect, and
      // the fonts' ready below), the boxes are the ones held: keeping them
      // spares a render of the editor and its ribbon, two to three per key,
      // each run before the key's glyph is painted.
      if (!samePdfTextSourceAppearance(draftCaretGeometryRef.current, nextCaretGeometry)) {
        draftCaretGeometryRef.current = nextCaretGeometry;
      }
      // The caret shows the boxes now when they are what it draws from (the
      // line's own geometry and the exact preview's draw their own).
      if (!nativeCaretGeometryRef.current && !candidateLayerShownRef.current) {
        sourceCaretControllerRef.current?.showGeometry(draftCaretGeometryRef.current);
      }
      setDraftCaretDrawn(nextCaretGeometry !== null);
      const measured = measurePdfNativeTextDraftHeight(draft);
      const height = measured === null ? null : measured * reflowScale;
      if (height !== null)
        setMeasuredContentHeight((current) =>
          Math.abs(current - height) < 0.5 ? current : height,
        );
      // A saved box's own rows, read once from its untouched text set in the
      // box (the padding band is under a line, hence the quarter-row slack).
      if (height !== null && initialLayout?.promoted && layoutFallbackActive && !manualLayoutDirty &&
        replacementText === originalText && draftLineHeightPixels > 0) {
        const rows = Math.max(1, Math.floor(height / draftLineHeightPixels + 0.25));
        setOpenedBoxRows((current) => (current?.key === openedBoxKey ? current : { key: openedBoxKey, rows }));
      }
      // An edited one-line draft wider than its box (the fit of the source
      // line applied, see below) wraps instead; back inside the box, it is
      // one native line again. The untouched line keeps the PDF's own fit.
      // A one-row saved box with room beside it is measured the same way:
      // it never preserved a source line, so it never learned it overflowed.
      const promotedBoxMayGrow = Boolean(initialLayout?.promoted) && lineGrowthRoom > 0;
      
      // or face the native writer declined): a size changed is no longer the
      // source's fit, so nothing measured it, and the box kept the line's old
      // width and folded the larger title in two over the line below (PDF AI
      // eval, 20 pt on a 16 pt title). WPS widens the box to the larger line.
      const formattedLineMayGrow = layoutFallbackActive && !initialLayout?.promoted && lineGrowthRoom > 0;
      if (preserveSourceSingleLine || draftOverflowsBox || promotedBoxMayGrow || formattedLineMayGrow) {
        
        // now: measuring the wrapped draft would read "fits", switch the
        // line back, read "overflows", and so on without end.
        // The fit is judged against the line's own box, not the frame grown
        // to follow the draft: against the grown frame the draft "fits",
        
        // is always measured with the frame collapsed: a scroll width is
        // never less than the element's own width, so a line shorter than
        // its frame read as the frame's width. With the frame not yet grown
        // that added the margin to the box (396 -> 400), the grown frame was
        // then measured truly (383 + margin, back to 396), and the two
        // alternated every render until React gave up ("Maximum update depth
        // exceeded", the window unmounted with the draft; walk w-cjk-s9b).
        const grownBy = layoutFallbackActive && layoutRect && effectiveLayoutRect
          ? Math.max(0, effectiveLayoutRect.width - layoutRect.width) * pageWidthPixels / reflowScale / wrappedScaleX
          : 0;
        
        
        // judged by that measure, not by whole pixels nor by the source
        // metrics that kept it the source's one line (a draft the native
        // writer refused arrives here still "fitting" by the PDF's widths,
        
        const frameOverflow = layoutFallbackActive && grownBy === 0 && contentDraftDirty &&
          !manualLayoutDirty && !/[\r\n]/.test(replacementText) &&
          pdfNativeTextDraftLineExceedsFrame(draft, lineAxesTurn);
        const naturalWidth = () => {
          const previous = draft.style.whiteSpace;
          const previousWidth = draft.style.width;
          draft.style.whiteSpace = "pre";
          draft.style.width = "0px";
          try { return draft.scrollWidth; } finally {
            draft.style.whiteSpace = previous;
            draft.style.width = previousWidth;
          }
        };
        const natural = naturalWidth();
        const boxWidth = draft.clientWidth - grownBy;
        // A scroll width is a whole pixel: a saved box's line a fraction of a
        // pixel wider than the box reads as exactly its width, yet the
        // browser wraps it (a bold line saved one row 205 px wide, one more
        // "!" typed: natural 205, two rows). Within that pixel the rows
        // decide; a frame already grown there stays grown (no flip-flop).
        const draftRows = height !== null && draftLineHeightPixels > 0
          ? Math.max(1, Math.floor(height / draftLineHeightPixels + 0.25)) : null;
        const savedBoxAtItsEdge = Boolean(initialLayout?.promoted) && openedBoxRows !== null &&
          natural * sourceLineFitScale >= boxWidth - 0.5 &&
          (grownBy > 0 || (draftRows !== null && draftRows > openedBoxRows));
        // A draft whose text is the source's and whose properties cannot
        // set it wider (a part made a superscript: smaller and lifted) is
        // not measured: the browser sets it in a substitute face, and that
        
        // title).
        // A part set in another face is measured in the face the browser
        // has for it, a little off the face the write embeds (a served
        // family's local twin: 2.7 px on a 177 px line): that much over the
        // box is no overflow -- read as one, the line left its place for the
        
        
        const overflowSlack = partFaceOnlyPropertyChange && replacementText === originalText
          ? Math.max(4, boxWidth * 0.02) : 0.5;
        const measuredOverflow = contentDraftDirty && draftMayWiden && draft.clientWidth > 0 &&
          (natural * sourceLineFitScale > boxWidth + overflowSlack || savedBoxAtItsEdge || frameOverflow);
        
        
        
        
        // on every render (walk w-cjk-s9b on e3e632f933: "overflows" and
        // "fallback" flipping each pass with the draft, the exact preview's
        // answer and the frame unchanged; "Maximum update depth exceeded",
        // the PDF window unmounted with the draft).
        if (measuredOverflow) overflowedDraftRef.current = previewDraftKeyRef.current;
        const overflows = measuredOverflow ||
          (contentDraftDirty && overflowedDraftRef.current === previewDraftKeyRef.current);
        setDraftOverflowsBox((current) => (current === overflows ? current : overflows));
        // The width the frame follows (lineGrowthRoom): the line as this
        
        const followed = overflows && lineGrowthRoom > 0
          ? Math.ceil(natural * (layoutFallbackActive ? reflowScale * wrappedScaleX : sourceLineFitScale) +
              draftFontSizePixels * LINE_GROWTH_MARGIN_EM)
          : 0;
        if (followed / pageWidthPixels > lineGrowthRoom) pastRoomDraftRef.current = previewDraftKeyRef.current;
        setDraftNaturalWidth((current) => (Math.abs(current - followed) < 1 ? current : followed));
        const widestWord = (() => {
          if (!overflows) return 0;
          const context = document.createElement("canvas").getContext("2d");
          if (!context) return 0;
          const style = window.getComputedStyle(draft);
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const widest = Math.max(0, ...replacementText.split(/\s+/).map((word) => pageTextWidth("pdf", word, context.font) ?? context.measureText(word).width));
          return widest > 0 ? Math.ceil(widest * (layoutFallbackActive ? reflowScale * wrappedScaleX : sourceLineFitScale) +
            draftFontSizePixels * LINE_GROWTH_MARGIN_EM) : 0;
        })();
        setDraftWidestWord((current) => (Math.abs(current - widestWord) < 1 ? current : widestWord));
      } else if (draftOverflowsBox) {
        setDraftOverflowsBox(false);
        setDraftNaturalWidth(0);
        setDraftWidestWord(0);
      }
      // The fit corrects the browser's measure of the SOURCE line to the
      // width the PDF draws it at. It is read from the untouched text and
      // then held: re-fitting every keystroke squeezed the whole line
      // narrower as it grew, and the exact preview snapped it back wide.
      if (contentDraftDirty && preserveSourceSingleLine) return;
      const nextSourceLineFit = (() => {
        if (!preserveSourceSingleLine || !(draft.clientWidth > 0)) return 1;
        // Wider than the line the PDF draws: pulled in, as before.
        if (draft.scrollWidth > draft.clientWidth) return Math.max(0.5, Math.min(1, draft.clientWidth / draft.scrollWidth));
        // Narrower by more than a hair: pulled out. The browser set the
        // untouched line in another face (one it could not load -- Safari
        // -- or a substitute) or in one whose advances are not the PDF's,
        // and the words read a size smaller than the page's until the exact
        
        // fit matches the width the PDF draws, as pdf.js's text layer scales
        // its own spans to the drawn glyphs. The untouched text is measured
        // on a probe set as the draft is (its layout width, no transform).
        const natural = measureUntouchedLineWidth(draft, originalText);
        if (!(natural > 0)) return 1;
        const slack = Math.max(2, draft.clientWidth * 0.03);
        return draft.clientWidth - natural > slack ? Math.min(2, draft.clientWidth / natural) : 1;
      })();
      setSourceLineFitScale((current) =>
        Math.abs(current - nextSourceLineFit) < 0.00001
          ? current
          : nextSourceLineFit,
      );
    };
    measureLayout();
    // Fonts still loading measure again once they are in; with every face
    // already loaded the ready promise only measured the same draft twice.
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(measureLayout);
    document.fonts?.addEventListener("loadingdone", measureLayout);
    return () => {
      active = false;
      document.fonts?.removeEventListener("loadingdone", measureLayout);
    };
  }, [
    editingSurfaceStatus,
    layoutAngleChanged,
    effectiveLayoutRect,
    exactPreviewIsCurrent, candidateGeometry,
    layoutFallbackActive, layoutRect, ownLayoutRect, ownPageWidthPixels, lineAxesTurn, manualLayoutDirty, contentDraftDirty, draftMayWiden,
    partFaceOnlyPropertyChange,
    draftOverflowsBox, sourceLineFitScale, lineGrowthRoom, draftFontSizePixels, wrappedScaleX,
    pageWidthPixels,
    layoutVerticalSafetyPixels,
    pageHeightPixels,
    reflowScale,
    preserveSourceSingleLine,
    previewBusy,
    previewError,
    replacementText,
    displayedInputValue,
    submitting,
    visualDraftColor,
    visualDraftFontFamily,
    visualDraftFontSize,
    visualDraftFontStyle,
    visualDraftFontWeight,
    visualDraftLetterSpacing,
    visualDraftLineHeight,
    visualDraftTextAlign,
    visualDraftTextDecoration,
    visualDraftWordSpacing,
    eastAsianFaceEpoch, initialLayout?.promoted, originalText, draftLineHeightPixels, openedBoxKey, openedBoxRows,
    draftAnchorGeometry, draftRowsAnchorGeometry,
    preparationPending,
    sourceFallbackAdvances,
    sourceFontSizePx,
    visualDraftVisible,
    showsSource,
    showsCandidate,
    inlineEditorHost,
    suppressSourceCanvas,
    composing,
    activeInputLayout,
    initialLayout?.box.angle,
    sourceGeometry?.sourceSha256,
    sourceGeometry?.pageNumber,
    shownFormatPreview,
    formatPreviewShown,
    managedDraftRuns,
    leadingRowIndent,
    inlineTypographyStyle.fontKerning,
    inlineTypographyStyle.fontVariantLigatures,
    inlineTypographyStyle.fontFeatureSettings,
    embeddedDraftRanges,
    draftLookRanges,
    hoverExactShown,
    setDraftCaretDrawn, setDraftNaturalWidth, setDraftOverflowsBox, setDraftWidestWord, setMeasuredContentHeight, setMeasuredMinimumWidth, setOpenedBoxRows, setSourceLineFitScale,
  ]);
  // What a press took up comes off the moment its own candidate is drawn.
  useEffect(() => {
    if (hoverExactRef.current?.pressed && validatedPreviewDraftKeyRef.current === previewDraftKey && !previewBusy) dropHoverExact();
  });
  useEffect(() => () => dropHoverExact(), []);
  const draftState = useMemo<PdfNativeListTextDraftState>(
    () => ({
      replacementText,
      properties,
      dirty: draftDirty,
      composing,
      canCommit: !actionUnavailable || deletesOnLeave,
      commitBlockedReason,
      waitingForExactPreview,
      layoutFallbackActive,
      layout: layoutDraft,
    }),
    [
      actionUnavailable,
      commitBlockedReason,
      composing,
      deletesOnLeave,
      draftDirty,
      layoutFallbackActive,
      layoutDraft,
      properties,
      replacementText,
      waitingForExactPreview,
    ],
  );
  const draftStateRef = useRef(draftState);
  const requestApplyRef = useRef(requestApply);
  /** Where a point of the page (fractions of it) falls in the text: on the
   * drawn glyphs when their boxes are known, else on the draft as laid out. */
  const caretOffsetAtPoint = useCallback((point: PdfTextCaretPoint | undefined): number | null => {
    const input = inputRef.current;
    if (!input) return null;
    return sourceCaretControllerRef.current?.offsetAtPoint(point) ?? pdfTextCaretOffsetAtPagePoint(
      visualDraftElementRef.current, input.closest<HTMLElement>(".pdf-viewer__page"),
      point, draftStateRef.current.layout?.angle ?? 0,
    );
  }, []);
  /** The block selected as an object takes the caret (WPS): after its text
   * (a typed key, Enter, F2), where it was double-clicked, or round all of
   * it (全选). */
  const enterTextEditing = useCallback((start?: number, end?: number) => {
    objectSelectedRef.current = false;
    setObjectSelected(false);
    const input = inputRef.current;
    if (!input) return;
    const length = input.value.length;
    const from = Math.max(0, Math.min(length, start ?? length));
    const to = Math.max(from, Math.min(length, end ?? from));
    input.focus({ preventScroll: true });
    input.setSelectionRange(from, to, "forward");
  }, []);
  // The double click the reader noted on this box (lib/pdf/native-text-press):
  // one made before this editor came up is taken here; one whose second
  // press still lands on the box (the frame not yet on the page) puts the
  // caret in where it landed.
  useEffect(() => {
    if (openingDoublePress) takePdfNativeTextDoublePress(openingDoublePress);
  }, [openingDoublePress]);
  useEffect(() => {
    if (!objectSelected) return;
    const ownBox = (target: HTMLElement) => target === returnFocusRef.current || target === inlineEditorHost;
    const enterAt = (press: PdfNativeTextPress) => {
      takePdfNativeTextDoublePress(press);
      // (A block that takes formats alone: the words are the line's under the press.)
      if (wordsByLine && onOpenLineOfBlock) {
        onOpenLineOfBlock({ clientX: press.clientX, clientY: press.clientY });
        return;
      }
      const bounds = (inputRef.current ?? press.target).closest<HTMLElement>(".pdf-viewer__page")?.getBoundingClientRect();
      const offset = bounds && bounds.width > 0 && bounds.height > 0
        ? caretOffsetAtPoint({
            x: (press.clientX - bounds.left) / bounds.width,
            y: (press.clientY - bounds.top) / bounds.height,
          })
        : null;
      enterTextEditing(offset ?? undefined);
    };
    const made = readPdfNativeTextDoublePress(returnFocusRef.current) ??
      (inlineEditorHost ? readPdfNativeTextDoublePress(inlineEditorHost) : null);
    if (made) {
      enterAt(made);
      return;
    }
    return subscribePdfNativeTextDoublePress((press) => {
      if (ownBox(press.target)) enterAt(press);
    });
  }, [objectSelected, inlineEditorHost, returnFocusRef, caretOffsetAtPoint, enterTextEditing, wordsByLine, onOpenLineOfBlock]);
  // Auto-measurement may refine height while a finish is pending. That is the
  // same user's draft; only content/formatting or manual geometry cancels it.
  const finishDraftKey = JSON.stringify([
    replacementText,
    propertyOverride,
    managedFontSize,
    managedAlignment,
    managedLayoutTypography ? layoutTypographyOverride : null,
    paragraphChanges,
    manualLayoutDirty ? layoutRect : null,
    layoutAngle,
  ]);
  const nextTextTargetRef = useRef<((accepted: boolean) => void) | null>(null);
  // Words the window's finish behind the reader refused, typed in again by
  // the window and finished here (controller.finish({ inEditor: true })):
  // this editor's own to write. Handed to the window once more they were
  // refused once more, and the reader was told 「文件没有被改动」 over a line
  // that the next press anywhere wrote as a text box -- by then this
  
  // (Read where it is asked, never at render: it is set between renders.)
  const inEditorFinishRef = useRef<PdfNativeTextInEditorFinish | null>(null);
  // An editor made anew under that finish (the page's next revision) takes
  // its verdict with it: answered "not written", so the window asks the
  // editor now open on the line instead of waiting for good.
  useEffect(() => () => {
    const own = inEditorFinishRef.current;
    if (!own || nextTextTargetRef.current !== own.settle) return;
    nextTextTargetRef.current = null;
    own.settle(false);
  }, []);
  /** The delete an emptied line is being left by, while it runs. */
  const leaveDeletionRef = useRef<object | null>(null);
  useEffect(() => () => { leaveDeletionRef.current = null; }, []);
  /** The last press on another box that this line was left for. */
  const lastOutsidePressRef = useRef<Readonly<{
    target: HTMLElement; time: number; clientX: number; clientY: number;
  }> | null>(null);
  // An editor opened anew on the revision for the same line takes over the
  // line pressed next from the one before it (inheritNextTextTarget).
  useEffect(() => {
    if (nextTextTargetRef.current) return;
    const inherited = inheritNextTextTarget?.() ?? null;
    if (inherited) {
      nextTextTargetRef.current = inherited;
      markPdfTextLatency("finish.next-inherited");
    }
    // Once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const settleNextTextTarget = useCallback((accepted: boolean) => {
    const settle = nextTextTargetRef.current;
    nextTextTargetRef.current = null;
    settle?.(accepted);
  }, []);
  // This draft, on this line, already handed to the window, which is closing
  // the editor. Presses held behind a busy page arrive together: a click away,
  // then a click on the next line before the editor has gone. Finished again,
  // that line's press was refused (its proof was taken with the first) and the
  // line pressed did not open.
  // (The words the line opened with are part of it: Escape writes the draft
  // and opens the line again as a block, on those words, in this same editor.
  // Keyed without them, that block's own leave read as the finish already
  // handed over, the editor never closed, and the line pressed next did not
  
  const finishHandedOverRef = useRef<string | null>(null);
  const finishHandedOverKey = () => JSON.stringify([pdfNativeTextLineIdOf(returnFocusRef.current), originalText, finishDraftKey]);
  // Whether that hand-over was a write of this line that opens it again on
  // itself (a block's format written as it is made, a pause in typing,
  // Escape): the editor is then that line opened again with the reader in
  // it, and a leave with nothing new in it is the reader leaving the line --
  // it closes. Read as the hand-over already done, the leave was swallowed:
  // the editor stayed open, its draft drawn over the line being written,
  // and every revision opened it again by itself (quick-operation probe
  
  // it, a click on the page).
  const handedOverToReopenRef = useRef(false);
  const leavingToReopenRef = useRef(false);
  // The reader has left this line (a press away, Enter on another box): the
  // writes that open the line again on itself when typing or a block's
  // format pauses are not made for it any more -- the leave writes the
  // draft. Made after it, a block's timer reopened the line the reader had
  
  // the click on the page).
  const readerLeftRef = useRef(false);
  const markFinishHandedOver = () => {
    finishHandedOverRef.current = finishHandedOverKey();
    handedOverToReopenRef.current = leavingToReopenRef.current;
    leavingToReopenRef.current = false;
  };
  /** This draft is the one already handed to the window: nothing new to write. */
  const draftHandedOver = () => finishHandedOverRef.current === finishHandedOverKey();
  const requestFinish = useCallback(() => {
    markPdfTextLatency("finish.request", { submitting, applying: applyingRef.current, composing: composingRef.current,
      queued: queuedRibbonActionsRef.current.length, dirty: draftDirty, busy });
    if (submitting || applyingRef.current || composingRef.current) return;
    if (finishHandedOverRef.current === finishHandedOverKey() &&
      // Off only for a probe of what follows a failed queued edit.
      !(globalThis as { __mraiPdfDoubleFinish?: boolean }).__mraiPdfDoubleFinish) {
      if (handedOverToReopenRef.current) {
        // The line written and opened again on itself, left now with nothing
        // new: its words are with the window already, the editor goes.
        handedOverToReopenRef.current = false;
        markPdfTextLatency("finish.left-reopened");
        onCancel();
        settleNextTextTarget(true);
        return;
      }
      markPdfTextLatency("finish.handed-over");
      settleNextTextTarget(true);
      return;
    }
    // Commands pressed before the proof arrived are part of this edit: the
    // finish runs once they have been applied (they change the draft, which
    // would otherwise cancel a finish asked for now).
    // So is a drag kept from before the box opened (moveBy), still waiting
    // for the proof: left at once, the box closed unchanged and the drag
    // was lost.
    if (queuedRibbonActionsRef.current.length > 0 || moveAwaitingProofRef.current || resizeAwaitingProofRef.current ||
      pendingMoveByRef.current) {
      // The commands held for the line's proof run when it lands and the
      // finish goes on from there. The reader is not held meanwhile: the
      // frame's handles and the caret retire now, as for a finish waiting
      // on its preview, so the leave reads as the leave (a line left with
      // a toggle pressed before its proof stayed open, handles and all,
      
      if (!restoreInteractionChromeRef.current) {
        restoreInteractionChromeRef.current = retirePdfTextEditingChrome(layoutFrameRef.current, inputRef.current);
      }
      setFinishAfterQueuedActions(true);
      return;
    }
    // `busy` (the window still saving an earlier edit) does not drop the
    // intent: the finish effect below waits for it and commits then. Bailing
    // out here left a draft typed during a save unsaved -- it was lost when
    
    if (!draftDirty) {
      markPdfTextLatency("finish.clean");
      onCancel();
      settleNextTextTarget(true);
      return;
    }
    // Every character removed and the line left (Enter, Cmd+S, Save,
    // Escape, a click away): that is a deletion of this text object, which
    // the authenticated delete contract performs once the line's proof is
    // in (the finish effect below waits for it), so none of the refusals of
    // a draft that cannot be written stops it. Sending an empty replacement
    // to the preview instead refused it with font and layout diagnostics
    
    // (Asked by the window for words it carried back, there is no click to
    // let through: the box stays, its reason beside it.)
    if (!deletesOnLeave && preparationFailed && !layoutOnlyDraft && failedFinishKey === finishDraftKey &&
      !pdfNativeTextInEditorFinishPending(inEditorFinishRef.current, nextTextTargetRef.current, replacementText)) {
      // The proof failed for good and this finish was already refused once
      // (the reader saw why): close, and keep the typed text for this line.
      onRetainUnsavedDraft?.(replacementText);
      onCancel();
      settleNextTextTarget(true);
      return;
    }
    if (!deletesOnLeave && finishActionUnavailable && !refusalFallbackEligible && !layoutOnlyDraft &&
      failedFinishKey === finishDraftKey &&
      !pdfNativeTextInEditorFinishPending(inEditorFinishRef.current, nextTextTargetRef.current, replacementText)) {
      // This draft cannot be written and the reader has been told why once:
      // a second click away is not swallowed too. The text is kept for this
      // line and the click goes where it was aimed.
      onRetainUnsavedDraft?.(replacementText);
      onCancel();
      settleNextTextTarget(true);
      return;
    }
    if (layoutOnlyDraft && failedFinishKey === finishDraftKey) {
      // The same move already failed to save. Retrying it cannot succeed, and
      // staying left the box looking frozen, so put it back where it was.
      // Where the window said why (a line whose letters the PDF records as
      // spaces is not made a box of its words), the reason goes with it:
      // beside the box it showed only until the block's own timer came
      
      // 「移动未能保存」 alone.
      const why = error ? displayedError : null;
      onCancel();
      settleNextTextTarget(true);
      toast(why
        ? { title: translate("pdf.nativeTextEdit.moveFailed"), description: why }
        : { description: translate("pdf.nativeTextEdit.moveFailed") });
      return;
    }
    restoreInteractionChromeRef.current?.();
    finishFrameRectRef.current = layoutFrameRef.current?.getBoundingClientRect() ?? null;
    restoreInteractionChromeRef.current = retirePdfTextEditingChrome(layoutFrameRef.current, inputRef.current);
    finishPendingRef.current = true;
    markPdfTextLatency("finish.requested");
    // A box whose formats its rows (or its paragraph) write: the window
    // writes them behind the reader and the box closes now, its look kept
    
    // three runs planned for 13 s while the editor stayed open 24 s).
    const pendingRowFormat = boxRowFormatRef.current;
    if (pendingRowFormat && onDetachRowFormatRef.current && !manualLayoutDirtyRef.current &&
      paragraphFrameRequestRef.current === null && !busy && !propertyDraftChangedRef.current) {
      const typed = contentDraftDirtyRef.current;
      const asked = typed ? rowFormatWithParts(pendingRowFormat, partFormatsRef.current) : pendingRowFormat;
      if (onDetachRowFormatRef.current(asked, typed ? replacementText : undefined, makeFinishGhost,
        typed && boxFormatIsRetypeOnlyRef.current && partFormatsRef.current.length === 0 ? RETYPE_ONLY_ASK : undefined)) {
        markPdfTextLatency("finish.detached-row-format");
        markFinishHandedOver();
        finishPendingRef.current = false;
        activePreviewControllerRef.current?.abort();
        settleNextTextTarget(true);
        return;
      }
    }
    // A preview still scheduled is started now, and waited for below.
    const previewScheduled = activePreviewStartRef.current !== null;
    activePreviewStartRef.current?.();
    if (!finishMustWaitRef.current && !previewScheduled) {
      applyFinishRef.current();
      return;
    }
    if (process.env.NODE_ENV !== "production") markPdfTextLatency("finish.detach-check", { blockers: detachBlockersRef.current || "none",
      unproven: detachableUnprovenRef.current, next: nextTextTargetRef.current !== null });
    // Only the exact preview of these words (or their proof) is waited for:
    // the window takes them instead and the reader goes on at once -- for
    // another line, or out of the line (Enter, Escape, a click away), which
    // used to hold the reader on "previewing" until the compile answered
    
    // the line's look up until the staged page is drawn, and opens the line
    // again with its words should the stage fail.
    // (Words that finish refused already stay here: inEditorFinishRef.)
    if (inEditorFinishRef.current?.words !== replacementText &&
      (detachableFinishRef.current || detachableUnprovenRef.current || detachableMoveRef.current) &&
      onDetachFinishRef.current?.(replacementText, makeFinishGhost,
        detachableFinishRef.current || detachableMoveRef.current ? detachPropertiesRef.current : null,
        // The last format the writer took: what the line goes back to if
        // the one left is refused.
        acceptedPropertiesRef.current,
        // A paragraph's settings chosen with its run's format: after it (the
        
        // dropped).
        boxRowFormatRef.current && propertyDraftChangedRef.current
          ? nativeParagraphSettingsOf(boxRowFormatRef.current) : null)) {
      markPdfTextLatency("finish.detached");
      markFinishHandedOver();
      finishPendingRef.current = false;
      activePreviewControllerRef.current?.abort();
      settleNextTextTarget(true);
      return;
    }
    // Only words the box already sets on its rows as shown (a run too long
    // for its width waits for the editor, which may widen or compress it).
    const shownInput = inputRef.current;
    const wrapsInBox = !shownInput || shownInput.scrollWidth <= shownInput.clientWidth + 1;
    const deferredLayout = deferrableLayoutFinishRef.current && wrapsInBox ? layoutDraftRef.current : null;
    if (deferredLayout && nextTextTargetRef.current !== null &&
      onDeferLayoutFinishRef.current?.(replacementText, deferredLayout, makeFinishGhost)) {
      markPdfTextLatency("finish.deferred");
      markFinishHandedOver();
      finishPendingRef.current = false;
      activePreviewControllerRef.current?.abort();
      settleNextTextTarget(true);
      return;
    }
    setFinishRequested(finishDraftKey);
  }, [
    actionUnavailable,
    refusalFallbackEligible,
    submitting,
    draftDirty,
    finishDraftKey,
    onCancel,
    settleNextTextTarget,
    layoutOnlyDraft,
    failedFinishKey,
    error, displayedError,
    translate,
    replacementText,
    deletesOnLeave,
    preparationFailed,
    onRetainUnsavedDraft,
    setFinishRequested, setFinishAfterQueuedActions,
  ]);

  // Whether a finish asked for now must wait (an unverified source still
  // being proved, the same "previewing" wait as a pending preparation; a
  // proof that failed for good answers at once). Read through a ref by
  // requestFinish, so a finish with nothing to wait for is applied there
  // and then, not a render and an effect later: two renders of this box,
  
  // A block only moved and resized (its words, format and paragraph as
  // they were): Leave writes the move and the paragraph set again in its
  // frame behind the reader (the window's detached move), planned anew on
  // the copy, so the exact preview is not waited for. It was: Leave stood
  // 4-8 s on a long page while the group move planned for the preview
  
  const moveFrameOnlyDraft = replacementText === originalText && !propertyLayoutDraftChanged &&
    !managedTypographyDirty && paragraphChanges === null && paragraphFrameRequest !== null &&
    !layoutAngleChanged && shownFormatPreview === null && draftMoved && !layoutFallbackActive &&
    !deletesOnLeave && !initialLayout?.promoted && !openedInFallbackLane && previewError === null;
  // Such a draft can be written while its preview is still planned: only
  // what else holds a write holds it.
  const finishActionUnavailable = moveFrameOnlyDraft
    ? busy || submitting || composing || preparationPending || unverifiedNativeSource ||
      Boolean(settledApplyDisabledReason) || !replacementTextIsValid
    : actionUnavailable;
  finishActionUnavailableRef.current = finishActionUnavailable;
  finishWithoutPreviewRef.current = moveFrameOnlyDraft && (needsExactPreview || previewBusy);
  const finishMustWait =
      !preparationFailed && (busy ||
      preparationPending ||
      unverifiedNativeSource ||
      submitting ||
      composing ||
      (previewBusy && !moveFrameOnlyDraft) ||
      (needsExactPreview && !previewError && !moveFrameOnlyDraft) ||
      // A box that only grew in the browser's measurement is a guess the
      // exact preview for this draft may still overturn (a missing glyph
      // measured in a substitute font does exactly this). Finishing before
      
      // which the server cannot prove against the source box. An emptied
      // line is deleted, not previewed: no answer comes for it, and waiting
      
      (autoLayoutExpanded && !deletesOnLeave && !layoutFallbackForced && Boolean(inlineEditorHost) &&
        !previewError) ||
      
      // answers is cleared by the preview on the next render.
      (refusalFallbackActive && previewError !== null));
  const finishMustWaitRef = useRef(finishMustWait);
  finishMustWaitRef.current = finishMustWait;
  // A plain retyping of a line in place whose only wait is its exact
  // preview: the window can finish it without this editor (onDetachFinish).
  
  
  // A line typed longer than its box that the room beside it still holds
  
  
  // decides on the preview's answer.
  const grownWithinRoom = !draftOverflowsBox || (lineGrowthRoom > 0 && draftNaturalWidth > 0 &&
    draftNaturalWidth / Math.max(1, pageWidthPixels) <= lineGrowthRoom + 1e-6);
  const onlyGrownLane = !layoutFallbackActive ||
    (autoLayoutExpanded && !layoutFallbackForced && grownWithinRoom);
  const onlyPreviewing = !busy && !submitting && !composing &&
    (!effectiveApplyDisabledReason || effectiveApplyDisabledReason === labels.previewing);
  // A format change the line's compile has already set in place (an exact
  // preview of it came back native), not a move. One the preview has not
  
  
  // writes), and the window's own stage would refuse it the same way.
  // A format whose exact preview is still on its way goes the same way:
  // the window stages it by the engine's own plan (the preview's), and a
  // plan the engine refuses keeps the words as the line's draft, said
  // once. Waiting here for the answer held the reader on the line for the
  
  // click away that did nothing for a while).
  const formatProvenOrUnchanged = !propertyDraftChanged || (
    !propertyOverride?.moveX && !propertyOverride?.moveY && !propertyOverride?.groupScale &&
    (provenPropertiesKeyRef.current === JSON.stringify(properties ?? null) ||
      (previewBusy && previewError === null && Boolean(propertyProof))));
  // A line grown past its room, or broken by Enter, is set by the paragraph
  // rewrite in the page's own text (typedBreakNative): the window compiles
  // it on the working copy as any retyping, without this editor.
  const detachableFinish = Boolean(onDetachFinish) && !preparationFailed && !busy && !preparationPending &&
    !unverifiedNativeSource && !submitting && !composing && contentDraftDirty && !deletesOnLeave &&
    ((onlyGrownLane && !layoutFallbackForced) || typedBreakNative) && !refusalFallbackActive && refusalFallbackKey === null &&
    !manualLayoutDirty && paragraphFrameRequest === null && paragraphChanges === null && formatProvenOrUnchanged &&
    !managedTypographyDirty && !initialLayout?.promoted && !openedInFallbackLane && previewError === null &&
    // A character the compile has not set yet is one the embedded font may
    // not draw: the window's engine plan sets it in the bundled fallback.
    onlyPreviewing && (typedBreakNative || !/[\r\n]/.test(replacementText)) && !/\r/.test(replacementText) &&
    replacementText.trim().length > 0;
  // A plain retyping whose only wait is the line's proof (or its source's
  // check): the window can compile it on the working copy's head, where
  // the line already stands, without the proof (onDetachFinish declines
  // where it cannot). The format, a frame, a paragraph or the text-box
  
  // A line flush right set again so is written by its paragraph once its
  // proof is in (the alignment is the paragraph's): compiled in place, a
  // right-aligned label typed on ran past its margin, or off its form's box.
  const detachableUnproven = Boolean(onDetachFinish) && (preparationPending || unverifiedNativeSource) &&
    !rightLine &&
    // Busy is that proof being made: not a write of this editor's own.
    !preparationFailed && !submitting && !composing && contentDraftDirty && !deletesOnLeave &&
    ((onlyGrownLane && !layoutFallbackForced) || typedBreakNative) && !refusalFallbackActive && refusalFallbackKey === null &&
    !manualLayoutDirty && paragraphFrameRequest === null && paragraphChanges === null && !propertyDraftChanged &&
    !managedTypographyDirty && !initialLayout?.promoted && !openedInFallbackLane &&
    (typedBreakNative || !/[\r\n]/.test(replacementText)) && !/\r/.test(replacementText) &&
    replacementText.trim().length > 0;
  // A block only moved (no words changed, no frame, no paragraph setting):
  // the window stages the move on the working copy at once; the exact
  // preview the editor waited for first was the same plan rendered (2-4 s
  
  const detachableMove = Boolean(onDetachFinish) && !preparationFailed && !busy && !preparationPending &&
    !unverifiedNativeSource && !submitting && !composing && moveOnlyDraft && draftMoved && propertyDraftChanged &&
    !deletesOnLeave && !refusalFallbackActive && refusalFallbackKey === null && !manualLayoutDirty &&
    !initialLayout?.promoted && !openedInFallbackLane && previewError === null && !layoutFallbackActive &&
    // A box no run property states moves by its own move proof (the
    // run's, or its group's): the window maps the draft by it.
    !managedLayoutTypography && Boolean(properties) && Boolean(propertyProof || nativeMoveProof || nativeGroupMoveProof);
  const detachableMoveRef = useRef(detachableMove);
  detachableMoveRef.current = detachableMove;
  const detachableUnprovenRef = useRef(detachableUnproven);
  detachableUnprovenRef.current = detachableUnproven;
  const detachableFinishRef = useRef(detachableFinish);
  const detachPropertiesRef = useRef<PdfNativeTextPropertyDraft | null>(null);
  detachPropertiesRef.current = propertyDraftChanged ? properties ?? null : null;
  detachableFinishRef.current = detachableFinish;
  const detachBlockersRef = useRef<string>("");
  if (process.env.NODE_ENV !== "production") detachBlockersRef.current = [
    !onDetachFinish && "prop", preparationFailed && "failed", busy && "busy", preparationPending && "pending",
    unverifiedNativeSource && "unverified", submitting && "submitting", composing && "composing",
    !contentDraftDirty && "clean", deletesOnLeave && "delete", !onlyGrownLane && "fallback",
    layoutFallbackForced && "forced", refusalFallbackActive && "refusal", refusalFallbackKey !== null && "refusalKey",
    manualLayoutDirty && "manual", paragraphFrameRight !== null && "frame", paragraphLineStep !== null && "lineStep",
    paragraphChanges !== null && "paragraph",
    !formatProvenOrUnchanged && "properties", managedTypographyDirty && "typography", initialLayout?.promoted && "promoted",
    openedInFallbackLane && "openedFallback", previewError !== null && "previewError", !onlyPreviewing && "unavailable",
  ].filter(Boolean).join(",") + " | move:" + [
    !moveOnlyDraft && "notMoveOnly", replacementText !== originalText && "text", propertyLayoutDraftChanged && "layoutProps",
    managedTypographyDirty && "typography", paragraphFrameRequest !== null && "frameRequest", layoutAngleChanged && "angle",
    shownFormatPreview !== null && "formatPreview", !draftMoved && "notMoved", !propertyDraftChanged && "propsSame",
    layoutFallbackActive && "fallbackLane", managedLayoutTypography && "managed", !properties && "noProps",
    !propertyProof && !nativeMoveProof && !nativeGroupMoveProof && "noProof",
  ].filter(Boolean).join(",");
  const onDetachFinishRef = useRef(onDetachFinish);
  onDetachFinishRef.current = onDetachFinish;
  const onDetachRowFormatRef = useRef(detachBoxFormat);
  onDetachRowFormatRef.current = detachBoxFormat;
  const rowFormatRef = useRef(rowFormat);
  rowFormatRef.current = rowFormat;
  const boxRowFormatRef = useRef(boxRowFormat);
  boxRowFormatRef.current = boxRowFormat;
  const paragraphFrameRequestRef = useRef(paragraphFrameRequest);
  paragraphFrameRequestRef.current = paragraphFrameRequest;
  const contentDraftDirtyRef = useRef(contentDraftDirty);
  contentDraftDirtyRef.current = replacementText !== originalText;
  const propertyDraftChangedRef = useRef(propertyDraftChanged);
  propertyDraftChangedRef.current = propertyDraftChanged;
  // A saved text box whose only wait is its preparation (the save before
  // it still running): its layout is the editor's own, so the window can
  // write it after that save without this editor (onDeferLayoutFinish).
  const deferrableLayoutFinish = Boolean(onDeferLayoutFinish) && Boolean(initialLayout?.promoted) &&
    preparationPending && !preparationFailed && !busy && !submitting && !composing && contentDraftDirty &&
    !deletesOnLeave && paragraphChanges === null && !refusalFallbackActive && refusalFallbackKey === null &&
    replacementText.trim().length > 0;
  const deferrableLayoutFinishRef = useRef(deferrableLayoutFinish);
  deferrableLayoutFinishRef.current = deferrableLayoutFinish;
  const layoutDraftRef = useRef(layoutDraft);
  layoutDraftRef.current = layoutDraft;
  const onDeferLayoutFinishRef = useRef(onDeferLayoutFinish);
  onDeferLayoutFinishRef.current = onDeferLayoutFinish;
  /** What the line shows now, left on the page (copies: this editor's own
   * canvases and frame go with it) until the staged page replaces it. */
  const visualDraftFontFamilyRef = useRef<string | null>(null);
  visualDraftFontFamilyRef.current = visualDraftFontFamily ? String(visualDraftFontFamily) : null;
  // Moved to another version, the exact preview on screen is the old one's
  // page: taken away at once (the draft shows over the new surface until the
  // preview of the new version is drawn), not left over the new drawing.
  const drawnSourceRef = useRef(drawnSourceSha256);
  useEffect(() => {
    const previous = drawnSourceRef.current;
    drawnSourceRef.current = drawnSourceSha256;
    if (!previous || !drawnSourceSha256 || previous === drawnSourceSha256) return;
    const published = publishedPreviewCanvasRef.current;
    if (!published || published.hasAttribute("data-pdf-native-text-commit-pending") ||
      published.hasAttribute("data-pdf-native-text-committed-preview")) return;
    publishedPreviewCanvasRef.current = null;
    validatedPreviewDraftKeyRef.current = null;
    published.remove();
    published.width = 0;
    published.height = 0;
  }, [drawnSourceSha256]);
  const makeFinishGhostRef = useRef<() => (() => void) | null>(() => null);
  const makeFinishGhost = useCallback((): (() => void) | null => {
    const frame = layoutFrameRef.current;
    const host = frame?.parentElement;
    if (!frame || !host) return null;
    // The draft it may show is set in the PDF's own face: kept while it is.
    const releaseFaces = holdPdfJsFontFaces(visualDraftFontFamilyRef.current);
    const parts: HTMLElement[] = [];
    // The line's dashed box in the page's text layer still has the line's
    // old size (below): read first, its region is the ghost's too.
    const frameRect = frame.getBoundingClientRect();
    const layer = host.closest(".pdf-viewer__page") ?? host;
    const pageBoxes = [...layer.querySelectorAll<HTMLElement>('span[data-pdf-native-text-edit-box="true"]')];
    // Only the line's own region of the page: the words as left, over the
    // line as it stood (its new frame and its old box). A whole page copied
    // stood under the next line's editor, whose own whole page -- drawn
    // before this line's write was in -- went over it, and the line showed
    // its old drawing and its new words at once until that line's own write
    
    // A line left moved has two places, the frame where it was put and the
    // box where the page still draws it: both are the ghost's
    // (finish-ghost-regions; left out, the old drawing showed again beside
    
    const boxRects = pageBoxes.map((span) => span.getBoundingClientRect());
    const ghost = pdfFinishGhostRegions({ frame: frameRect, boxes: boxRects,
      own: returnFocusRef.current ? pageBoxes.indexOf(returnFocusRef.current) : null });
    const regions = ghost.regions;
    const ownSpans = ghost.ownBoxes.map((index) => pageBoxes[index]);
    // The candidate canvas carries the words; the editing surface is the
    // page with the line erased, and the words over it are the input's.
    let candidateCopied = false;
    let surfaceCopied = false;
    // (Read before it is copied: a block left moved may stand on it already,
    // its lifted picture drawn where it was dropped.)
    const surfaceCarriesLift = editingSurfaceCanvasRef.current?.hasAttribute("data-pdf-native-text-bridge-box") === true;
    // The surface is drawn and the line's words are its draft's, the layers'
    // effect that shows the surface still a render behind (typed into and
    // left within a frame of the surface arriving, a long frame on a loaded
    // machine): the surface is the line's ghost all the same. Skipped as
    // "hidden", the ghost kept the line's old drawing and the words typed
    
    const liveDraft = visualDraftElementRef.current;
    const candidateCanvas = publishedPreviewCanvasRef.current;
    const candidateShown = Boolean(candidateCanvas?.isConnected && candidateCanvas.width > 0 &&
      getComputedStyle(candidateCanvas).visibility !== "hidden");
    const draftOverHiddenSurface = editingSurfaceStatusRef.current === "ready" && !candidateShown &&
      Boolean(liveDraft?.isConnected && frame.contains(liveDraft) && getComputedStyle(liveDraft).visibility !== "hidden");
    for (const source of [editingSurfaceCanvasRef.current, publishedPreviewCanvasRef.current]) {
      if (!source?.isConnected || source.parentElement !== host || source.width === 0) continue;
      const hidden = getComputedStyle(source).visibility === "hidden";
      if (hidden && !(source === editingSurfaceCanvasRef.current && draftOverHiddenSurface)) continue;
      if (source === publishedPreviewCanvasRef.current) candidateCopied = true;
      else if (editingSurfaceStatusRef.current === "ready") surfaceCopied = true;
      const copy = document.createElement("canvas");
      copy.width = source.width; copy.height = source.height;
      copy.style.cssText = source.style.cssText;
      if (hidden) copy.style.visibility = "visible";
      const box = source.getBoundingClientRect();
      const scaleX = box.width > 0 ? source.width / box.width : 1, scaleY = box.height > 0 ? source.height / box.height : 1;
      const context = copy.getContext("2d");
      for (const region of regions) {
        const sx = Math.max(0, Math.floor((region.left - box.left) * scaleX) - 2);
        const sy = Math.max(0, Math.floor((region.top - box.top) * scaleY) - 2);
        const sw = Math.min(source.width - sx, Math.ceil((region.right - region.left) * scaleX) + 4);
        const sh = Math.min(source.height - sy, Math.ceil((region.bottom - region.top) * scaleY) + 4);
        if (sw > 0 && sh > 0) context?.drawImage(source, sx, sy, sw, sh, sx, sy, sw, sh);
      }
      // Other lines the region reaches (a frame taller than its line, the
      // line under it) are the page's, not this copy's: the surface was
      // copied when this line opened, and a line written since shows its new
      // drawing on the page under the ghost -- copied too, its old drawing
      // lay over the new one, both visible until this line's write was in
      
      // formatted and left, the first drawn twice for 3-6 s).
      if (context) {
        for (const other of pageBoxes) {
          if (ownSpans.includes(other) || other === returnFocusRef.current) continue;
          const rect = other.getBoundingClientRect();
          if (!pdfGhostRectInRegions(rect, regions)) continue;
          context.clearRect(Math.floor((rect.left - box.left) * scaleX) - 1, Math.floor((rect.top - box.top) * scaleY) - 1,
            Math.ceil(rect.width * scaleX) + 2, Math.ceil(rect.height * scaleY) + 2);
        }
        // This line's own boxes stay as copied (where another box reached
        // into them, the page under has this line's old drawing).
        for (const own of ownSpans) {
          const rect = own.getBoundingClientRect();
          const ox = Math.max(0, Math.floor((rect.left - box.left) * scaleX) - 1);
          const oy = Math.max(0, Math.floor((rect.top - box.top) * scaleY) - 1);
          const ow = Math.min(source.width - ox, Math.ceil(rect.width * scaleX) + 2);
          const oh = Math.min(source.height - oy, Math.ceil(rect.height * scaleY) + 2);
          if (ow > 0 && oh > 0) context.drawImage(source, ox, oy, ow, oh, ox, oy, ow, oh);
        }
      }
      // Over any editing surface a line opened next puts up (theirs stand at 2).
      copy.style.zIndex = String(Math.max(3, Number(source.style.zIndex) || 0));
      copy.setAttribute("data-pdf-native-text-finish-ghost", "true");
      copy.setAttribute("aria-hidden", "true");
      host.insertBefore(copy, frame);
      parts.push(copy);
    }
    // A block lifted before its clean surface was drawn hides its old place
    // with the lift's cover (the page's background there). The cover is this
    // editor's and goes with it: the ghost keeps its pixels, or the page's
    // old drawing showed in the old place beside the lifted block.
    // (The typing cover likewise: the line's old ink hidden on the page
    // itself, its draft the words -- coverCarried.)
    let coverCarried = false;
    for (const cover of layer.querySelectorAll<HTMLImageElement>(
      'img[data-testid="pdf-native-text-move-cover"], img[data-testid="pdf-native-text-typing-cover"]')) {
      if (!cover.complete || !(cover.naturalWidth > 0) || !(cover.naturalHeight > 0) || !cover.parentElement ||
        getComputedStyle(cover).visibility === "hidden") continue;
      const still = document.createElement("canvas");
      const context = still.getContext("2d");
      if (!context) continue;
      still.width = cover.naturalWidth; still.height = cover.naturalHeight;
      still.style.cssText = cover.style.cssText;
      still.style.pointerEvents = "none";
      still.setAttribute("data-pdf-native-text-finish-ghost", "true");
      still.setAttribute("aria-hidden", "true");
      try {
        context.drawImage(cover, 0, 0);
      } catch {
        continue;
      }
      cover.parentElement.insertBefore(still, cover);
      parts.push(still);
      if (cover.getAttribute("data-testid") === "pdf-native-text-typing-cover") coverCarried = true;
    }
    const clone = frame.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-testid");
    clone.removeAttribute("data-pdf-native-text-layout-frame");
    clone.setAttribute("data-pdf-native-text-finish-ghost", "true");
    clone.setAttribute("aria-hidden", "true");
    clone.style.pointerEvents = "none";
    // A block left moved shows its own lifted picture in the frame, not its
    // draft: the picture goes with the ghost as drawn pixels (a copied <img>
    // decodes its source again, and may show nothing for a frame), and where
    // it is not on the page -- not loaded, hidden -- it is not the ghost's.
    const lift = moveLiftImageRef.current;
    let liftShown = Boolean(lift && frame.contains(lift) && lift.complete && lift.naturalWidth > 0 &&
      lift.naturalHeight > 0 && getComputedStyle(lift).visibility !== "hidden");
    for (const picture of clone.querySelectorAll<HTMLImageElement>('img[data-testid="pdf-native-text-move-lift"]')) {
      const still = liftShown ? document.createElement("canvas") : null;
      const context = still?.getContext("2d") ?? null;
      if (!still || !context || !lift) { liftShown = false; picture.remove(); continue; }
      still.width = lift.naturalWidth; still.height = lift.naturalHeight;
      still.style.cssText = picture.style.cssText;
      still.setAttribute("aria-hidden", "true");
      try {
        context.drawImage(lift, 0, 0);
        picture.replaceWith(still);
      } catch {
        liftShown = false;
        picture.remove();
      }
    }
    // The words the line shows now are the input's while it is open (the
    // visual draft under it is hidden then); the input cannot go with the
    // ghost, so the draft stands in for it, shown. Without this the ghost
    // held an empty frame and the page showed the OLD words for the seconds
    
    // 出现」).
    // Only over the line erased, though: a line left before its erased
    // surface was drawn (formatted and left within a moment, or a loaded
    // machine) has its old drawing still on the page under the ghost, and
    // the draft shown over it drew the line twice -- old and new, each at
    
    
    // Without either copy the ghost keeps the line as it stood (its old
    // drawing, the frame) until the staged page shows the new one.
    // And never beside the block's own lifted picture, which is the words
    // of a block left moved (pdfFinishGhostDraftShows): both shown, the line
    // stood twice in one place, bold, until the staged page was up.
    const draftShows = pdfFinishGhostDraftShows({ candidateCopied, surfaceCopied, liftShown, surfaceCarriesLift, coverCarried });
    for (const draft of clone.querySelectorAll<HTMLElement>('[data-testid="pdf-native-text-visual-draft"]')) {
      // (With the highlights it carries: copied with it, they are still.)
      setPdfDraftVisibility(draft, draftShows ? "visible" : "hidden");
      draft.setAttribute(FINISH_GHOST_DRAFT_ATTR, "true");
    }
    // Named by its line: the line opened again on itself (a block's format
    // written as it is made) shows its words in its own editor, and this
    // ghost's words then go (FINISH_GHOST_LINE_ATTR, below).
    const ghostLineId = pdfNativeTextLineIdOf(returnFocusRef.current);
    if (ghostLineId) clone.setAttribute(FINISH_GHOST_LINE_ATTR, ghostLineId);
    for (const node of clone.querySelectorAll("textarea, input, button, [data-office-drawing-handle], svg[data-pdf-native-source-caret]"))
      node.remove();
    for (const node of clone.querySelectorAll("[data-testid]")) node.removeAttribute("data-testid");
    host.appendChild(clone);
    parts.push(clone);
    // The line's dashed box in the page's text layer still has the line's
    // old size: drawn beside the ghost's frame it was a second frame, the
    
    // it wider). It stands down while the ghost holds the line; the box
    // the staged page's text layer draws next is a new one.
    const held: HTMLElement[] = [];
    for (const span of ownSpans) {
      span.dataset.pdfNativeTextFrameHeld = "true";
      held.push(span);
    }
    return () => {
      for (const part of parts) {
        part.remove();
        for (const canvas of part instanceof HTMLCanvasElement ? [part] : part.querySelectorAll("canvas")) {
          canvas.width = 0; canvas.height = 0;
        }
      }
      for (const span of held) delete span.dataset.pdfNativeTextFrameHeld;
      releaseFaces();
    };
  }, [returnFocusRef]);
  makeFinishGhostRef.current = makeFinishGhost;
  // A reader highlight over the line stays on its words while they are the
  // draft's: the page under the draft carries the highlight's wash on its
  // background only, and the words stood over it untouched -- the highlight
  // left them when the line opened and came back when its write was in
  
  // carries a copy of its glyphs per highlight (draft-highlight-tint); the
  // finish ghost copies them with the frame. (A draft set inside the page's
  // own text box is not given one: its copy would be the box's text too.)
  const draftHighlightsRef = useRef<{ draft: HTMLElement; stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const draft = visualDraftElementRef.current;
    const watched = draftHighlightsRef.current;
    const framed = draft?.parentElement?.hasAttribute("data-pdf-native-text-layout-frame") ? draft : null;
    if ((watched?.draft ?? null) === framed) return;
    watched?.stop();
    draftHighlightsRef.current = framed ? { draft: framed, stop: watchPdfDraftHighlightTints(framed) } : null;
  });
  useLayoutEffect(() => () => {
    draftHighlightsRef.current?.stop();
    draftHighlightsRef.current = null;
  }, []);
  // Opened again on a line whose words are still held by the ghost of its own
  // last write (a block's format written as it is made, Escape, a pause in
  // typing): the line's words are this editor's now. Both shown, the ghost's
  // and this draft -- each laid out at its own width -- drew the line twice
  
  // px drafts of one line). The ghost keeps covering the line's old drawing.
  // Only once this editor draws the words itself (its draft, or its exact
  // candidate): until then they are the ghost's. The ghost's canvas is the
  // line erased and stands over the page, so an editor that shows the page's
  // own drawing through itself shows nothing there -- with the ghost's words
  
  
  const drawsOwnWords = visualDraftVisible || showsCandidate || moveLiftShown || formatPreviewShown;
  useLayoutEffect(() => {
    const lineId = pdfNativeTextLineIdOf(returnFocusRef.current);
    const page = (inlineEditorHost instanceof HTMLElement ? inlineEditorHost : returnFocusRef.current)
      ?.closest(".pdf-viewer__page");
    if (!lineId || !page || !drawsOwnWords) return;
    const ghostsOfLine = () => [...page.querySelectorAll<HTMLElement>(`[${FINISH_GHOST_LINE_ATTR}]`)]
      .filter((ghost) => ghost.getAttribute(FINISH_GHOST_LINE_ATTR) === lineId);
    const hidden = new Map<HTMLElement, HTMLElement[]>();
    for (const ghost of ghostsOfLine()) {
      const drafts = [...ghost.querySelectorAll<HTMLElement>(`[${FINISH_GHOST_DRAFT_ATTR}]`)]
        .filter((draft) => draft.style.visibility !== "hidden");
      for (const draft of drafts) setPdfDraftVisibility(draft, "hidden");
      hidden.set(ghost, drafts);
    }
    // Closed with nothing new written (its words are that ghost's): the ghost
    // shows them again until the write is in -- unless a newer write of the
    // line put up a ghost of its own.
    return () => {
      if (ghostsOfLine().some((ghost) => !hidden.has(ghost))) return;
      for (const [ghost, drafts] of hidden) {
        if (!ghost.isConnected) continue;
        for (const draft of drafts) setPdfDraftVisibility(draft, "visible");
      }
    };
  }, [drawsOwnWords, initialLayout, inlineEditorHost, returnFocusRef]);
  // The draft is set in the face PDF.js loaded the line's revision with: the
  // page moving on to the next revision under an open editor (a line left
  // just before was saved) does not take it from the draft.
  // (The editor is mounted only while it is open.)
  useEffect(() => (visualDraftFontFamily ? holdPdfJsFontFaces(String(visualDraftFontFamily)) : undefined),
    [visualDraftFontFamily]);
  const applyFinish = () => {
    setFinishRequested(null);
    if (deletesOnLeave && onDeleteTextObject) {
      // An emptied line is left by deleting its text object. One delete at a
      // time; the line is never held open on an empty draft: a delete the
      // window could not write (it says why) leaves the line as it was.
      if (leaveDeletionRef.current) return;
      const deletion = {};
      leaveDeletionRef.current = deletion;
      setSubmitting(true);
      void Promise.resolve()
        .then(() => onDeleteTextObject())
        .catch(() => undefined)
        .then(() => {
          // A delete that went closed this editor itself.
          if (leaveDeletionRef.current === deletion) {
            leaveDeletionRef.current = null;
            finishPendingRef.current = false;
            setSubmitting(false);
            onCancel();
          }
          settleNextTextTarget(true);
        });
      return;
    }
    // The native writer declined to set this draft in place. Rather than
    
    // run is hidden and the text drawn in a matching standard face.
    if (finishActionUnavailable && refusalFallbackEligible) {
      setRefusalFallbackKey(previewDraftKey);
      setFinishRequested(finishDraftKey);
      return;
    }
    if (finishActionUnavailable || preparationFailed) {
      if (nextTextTargetRef.current && contentDraftDirty && !layoutOnlyDraft &&
        !pdfNativeTextInEditorFinishPending(inEditorFinishRef.current, nextTextTargetRef.current, replacementText)) {
        // The reader is leaving for another line: they are not held in a
        // box whose draft cannot be written. The text is kept for this line
        // (it comes back, with the reason, when the line is opened again)
        // and the click opens the line it was aimed at.
        finishPendingRef.current = false;
        onRetainUnsavedDraft?.(replacementText);
        onCancel();
        settleNextTextTarget(true);
        return;
      }
      settleNextTextTarget(false);
      finishPendingRef.current = false;
      setCommitError(effectiveApplyDisabledReason ?? saveFailedMessage);
      setFailedFinishKey(finishDraftKey);
      // The same message may already be showing, so nothing else re-renders
      // the retired chrome back: restore the handles and the caret here.
      restoreInteractionChromeRef.current?.();
      restoreInteractionChromeRef.current = null;
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    // A source line written as a text box says so once it is saved, as the
    // notice before said it would: a draft the native writer declined, a box
    
    // line cannot follow in place. A moved line saved that way in silence
    
    const savedAsTextBox = refusalFallbackActive || (openedInFallbackLane && contentDraftDirty) ||
      (manualLayoutChanged && !initialLayout?.promoted) || (unprovenTextBoxFormat && !initialLayout?.promoted);
    // (Its window, read while the editor still stands in it: the notice is
    // said once the write behind the editor is taken -- saved-as-text-box-
    // notice.)
    const noticeFrom = inputRef.current?.closest(".pdf-viewer") ?? returnFocusRef.current?.closest(".pdf-viewer") ?? null;
    void requestApplyRef.current().then((accepted) => {
      markPdfTextLatency("finish.settled", { accepted });
      settleNextTextTarget(accepted);
      if (!accepted) {
        setFailedFinishKey(finishDraftKey);
        inputRef.current?.focus({ preventScroll: true });
      } else if (savedAsTextBox) {
        sayPdfSavedAsTextBox(noticeFrom, () => {
          toast({
            description: translate("pdf.nativeTextEdit.savedAsTextBox"),
          });
        });
      }
    });
  };
  const applyFinishRef = useRef(applyFinish);
  applyFinishRef.current = applyFinish;
  // Finishing is an intent for THIS draft, not a best-effort click. Wait for
  // its exact preview, then enter the existing durable commit once. A newer
  // draft cancels the intent; errors preserve it for an explicit user retry.
  useEffect(() => {
    if (finishRequested === null) return;
    // This draft is with the window already (it took it behind the reader):
    // nothing is waited for, asked again or written here. The intent can
    // outlive the hand-over -- a leave asked twice of one draft, the second
    // taken at once, leaves the first's intent standing; and an effect of a
    // render made before the hand-over runs after it when a timer's callback
    // (the retry below) comes ahead of that commit's passive effects (walk
    // rv0052, WebKit under load: finish.detached-later, then finish.waiting
    // previewBusy,grown from the render before it). Waited for here, the
    // window was asked for the same draft again a moment later, and the
    // exact preview's answer would have written it a second time.
    if (draftHandedOver()) {
      finishPendingRef.current = false;
      setFinishRequested(null);
      return;
    }
    if (leftWithFrameStandingRef.current && !draftDirty) {
      // The draft this Leave was asked of was only the text box's frame,
      // which its words already stand in (the preview's answer): nothing to
      // write, and the reader has left -- the editor goes, as a line left
      // unchanged does.
      leftWithFrameStandingRef.current = false;
      finishPendingRef.current = false;
      setFinishRequested(null);
      markPdfTextLatency("finish.clean");
      onCancel();
      settleNextTextTarget(true);
      return;
    }
    if (finishRequested !== finishDraftKey) {
      leftWithFrameStandingRef.current = false;
      settleNextTextTarget(false);
      finishPendingRef.current = false;
      setFinishRequested(null);
      return;
    }
    // An unverified source is still being proved, the same "previewing" wait
    
    // Consuming the intent there left the draft unsaved behind a permanent
    // "previewing" notice once the proof arrived.
    // A proof that failed for good answers at once: nothing it waits for
    // below will arrive.
    if (finishMustWait) {
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_MRAI_PDF_LATENCY === "1") markPdfTextLatency("finish.waiting", { why: [
        busy && "busy", preparationPending && "pending", unverifiedNativeSource && "unverified",
        submitting && "submitting", composing && "composing", previewBusy && "previewBusy",
        needsExactPreview && !previewError && "exact",
        autoLayoutExpanded && !deletesOnLeave && !layoutFallbackForced && Boolean(inlineEditorHost) && !previewError && "grown",
        refusalFallbackActive && previewError !== null && "fallback",
      ].filter(Boolean).join(",") });
      // Its words go to the window the moment it takes them: its detach was
      // refused only because the line before was still being staged (or its
      // revision read in). Asked once, at the leave, the line then waited
      // for its own proof and the slow commit, its editor open and read-only
      
      // detach.refused at 1, then finish.waiting).
      // (Tried again soon, then less often: a refusal for another reason
      // is answered by the proof this finish waits for anyway.)
      if (submitting || composing) return;
      let retry = 0, delay = 100;
      const tryDetach = () => {
        retry = 0;
        // (Taken meanwhile by a leave asked again: not handed over twice.)
        if (draftHandedOver()) {
          finishPendingRef.current = false;
          setFinishRequested(null);
          return;
        }
        // A box whose rows (its paragraph) write it, once its proof gave it
        
        // writes it behind the reader, as a leave with the proof in does.
        const rowFormat = boxRowFormatRef.current;
        if (!applyingRef.current && !composingRef.current && rowFormat && onDetachRowFormatRef.current &&
          !manualLayoutDirtyRef.current && paragraphFrameRequestRef.current === null && !propertyDraftChangedRef.current) {
          const typed = contentDraftDirtyRef.current;
          const asked = typed ? rowFormatWithParts(rowFormat, partFormatsRef.current) : rowFormat;
          if (onDetachRowFormatRef.current(asked, typed ? replacementText : undefined, makeFinishGhost,
            typed && boxFormatIsRetypeOnlyRef.current && partFormatsRef.current.length === 0 ? RETYPE_ONLY_ASK : undefined)) {
            markPdfTextLatency("finish.detached-row-format-later");
            markFinishHandedOver();
            finishPendingRef.current = false;
            activePreviewControllerRef.current?.abort();
            settleNextTextTarget(true);
            setFinishRequested(null);
            return;
          }
        }
        if (!applyingRef.current && !composingRef.current && inEditorFinishRef.current?.words !== replacementText &&
          (detachableFinishRef.current || detachableUnprovenRef.current || detachableMoveRef.current) &&
          onDetachFinishRef.current?.(replacementText, makeFinishGhost,
            detachableFinishRef.current || detachableMoveRef.current ? detachPropertiesRef.current : null,
            acceptedPropertiesRef.current)) {
          markPdfTextLatency("finish.detached-later");
          // (Handed over, as at the leave: said of this draft from here on
          // by the window alone -- draftHandedOver.)
          markFinishHandedOver();
          finishPendingRef.current = false;
          activePreviewControllerRef.current?.abort();
          settleNextTextTarget(true);
          setFinishRequested(null);
          return;
        }
        delay = Math.min(1_000, delay * 2);
        retry = window.setTimeout(tryDetach, delay);
      };
      retry = window.setTimeout(tryDetach, delay);
      return () => window.clearTimeout(retry);
    }
    applyFinishRef.current();
  }, [
    draftDirty,
    finishMustWait,
    finishRequested,
    finishDraftKey,
    layoutOnlyDraft,
    onCancel,
    onRetainUnsavedDraft,
    replacementText,
    settleNextTextTarget,
    busy,
    preparationPending,
    unverifiedNativeSource,
    submitting,
    composing,
    previewBusy,
    needsExactPreview,
    autoLayoutExpanded,
    layoutFallbackForced,
    refusalFallbackActive,
    refusalFallbackEligible,
    openedInFallbackLane,
    unprovenTextBoxFormat,
    contentDraftDirty,
    manualLayoutChanged,
    initialLayout?.promoted,
    previewDraftKey,
    translate,
    inlineEditorHost,
    previewError,
    actionUnavailable,
    effectiveApplyDisabledReason,
    saveFailedMessage,
    preparationFailed,
    deletesOnLeave,
    onDeleteTextObject,
    setFinishRequested,
    makeFinishGhost,
  ]);

  const requestFinishRef = useRef<() => void>(() => undefined);
  const requestLeaveRef = useRef<() => void>(() => undefined);
  const requestDiscardRef = useRef<() => void>(() => undefined);
  const ribbonActionRef = useRef<(action: PdfTextEditingContextRibbonAction) => boolean>(() => false);
  const resizeWidthRef = useRef<(widthFraction: number) => "resized" | "unchanged" | "refused">(() => "refused");
  const refusalRef = useRef<(control?: PdfTextEditingControl) => string | null>(() => null);
  // Where the last text typed into this line from elsewhere went (input
  // offsets): see the controller's selectLastTyped.
  const lastTypedRangeRef = useRef<{ start: number; end: number } | null>(null);
  const formatStateRef = useRef<ReturnType<PdfNativeListTextEditorController["readFormat"]>>({
    bold: false, italic: false, color: null, fontSize: null, boxFontSize: null, pageHeightPoints: null,
  });
  useLayoutEffect(() => {
    draftStateRef.current = draftState;
    requestApplyRef.current = requestApply;
    requestFinishRef.current = requestFinish;
    requestLeaveRef.current = requestLeave;
    requestDiscardRef.current = requestDiscard;
  });

  // The server refused the native write this draft was committed as and the
  // page is back at its last good state. The draft is then a native refusal
  // like one the planner makes, and the finish the reader asked for is
  
  
  // the sentence for the reader's next finish (which keeps the draft for its
  // line, or puts a moved box back).
  useEffect(() => {
    if (!serverRefusal || serverRefusedDraftRef.current?.id === serverRefusal.id ||
      submitting || applyingRef.current) return;
    serverRefusedDraftRef.current = Object.freeze({
      id: serverRefusal.id, draftKey: previewDraftKey, message: serverRefusal.message,
    });
    setPreviewError(serverRefusal.message);
    setNativeRefusalDraftKey(previewDraftKey);
    setServerRefusedDraftKey(previewDraftKey);
    if (!layoutOnlyDraft) setServerRefusalFinishKey(finishDraftKey);
  }, [serverRefusal, submitting, previewDraftKey, finishDraftKey, layoutOnlyDraft, setPreviewError, setServerRefusalFinishKey, setServerRefusedDraftKey]);
  useEffect(() => {
    if (serverRefusalFinishKey === null) return;
    if (serverRefusalFinishKey !== finishDraftKey) {
      setServerRefusalFinishKey(null);
      return;
    }
    // The page and its write authority settle first: the save that met the
    // refusal, and the command authority it used, which is one-shot.
    if (busy || submitting || previewBusy || composing || applyDisabledReason) return;
    setServerRefusalFinishKey(null);
    if (refusalFallbackEligible) requestFinishRef.current();
  }, [serverRefusalFinishKey, finishDraftKey, busy, submitting, previewBusy, composing,
    applyDisabledReason, refusalFallbackEligible, setServerRefusalFinishKey]);

  useLayoutEffect(() => {
    const controller: PdfNativeListTextEditorController = Object.freeze({
      readDraft: () => draftStateRef.current,
      readCaret: () => ({
        start: sourceInputLayoutRef.current ? pdfNativeTextInputCanonicalOffset(sourceInputLayoutRef.current, inputRef.current?.selectionStart ?? 0) : inputRef.current?.selectionStart ?? 0,
        end: sourceInputLayoutRef.current ? pdfNativeTextInputCanonicalOffset(sourceInputLayoutRef.current, inputRef.current?.selectionEnd ?? 0) : inputRef.current?.selectionEnd ?? 0,
      }),
      commit: () => requestApplyRef.current(),
      finish: (options) =>
        new Promise<boolean>((resolve) => {
          // The finish effect settles the pending target with its verdict;
          // a caller that only wants the verdict takes that slot.
          nextTextTargetRef.current = resolve;
          if (options?.inEditor) {
            inEditorFinishRef.current = Object.freeze({ words: draftStateRef.current.replacementText, settle: resolve });
            markPdfTextLatency("finish.in-editor");
          }
          requestFinishRef.current();
        }),
      applyRibbonAction: (action) => ribbonActionRef.current(action),
      moveBy: (dx, dy) => {
        // Known at once: what the reader did after the drag is let go in the
        // next frame, which may come before this renders, and a finish that
        
        const current = pendingMoveByRef.current;
        pendingMoveByRef.current = current ? { dx: current.dx + dx, dy: current.dy + dy } : { dx, dy };
        setPendingMoveBy((pending) =>
          pending ? { dx: pending.dx + dx, dy: pending.dy + dy } : { dx, dy });
      },
      typeText: (edit) => {
        const input = inputRef.current;
        if (!input || input.readOnly || !input.isConnected) return false;
        const plan = carriedTextEdit(edit.original, edit.text, input.value);
        if (!plan) return false;
        const inputType = plan.inserted ? "insertText" : "deleteContentBackward";
        input.focus({ preventScroll: true });
        input.setSelectionRange(plan.start, plan.end);
        // As a key does: its beforeinput (the guards and the edit's
        // selection snapshot read it), then the text and its input event
        // (React's onChange takes a value changed under it).
        if (!input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true, cancelable: true, inputType, data: plan.inserted || null,
        }))) return false;
        input.setRangeText(plan.inserted, plan.start, plan.end, "end");
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: plan.inserted || null }));
        lastTypedRangeRef.current = plan.inserted
          ? { start: plan.start, end: plan.start + plan.inserted.length } : null;
        return true;
      },
      selectLastTyped: (mode) => {
        const input = inputRef.current;
        const typed = lastTypedRangeRef.current;
        if (!input || !typed || !input.isConnected || typed.end > input.value.length) return false;
        input.focus({ preventScroll: true });
        if (mode === "range") input.setSelectionRange(typed.start, typed.end);
        else input.setSelectionRange(typed.end, typed.end);
        return true;
      },
      resizeWidth: (widthFraction) => resizeWidthRef.current(widthFraction),
      readRefusal: (control) => refusalRef.current(control),
      readFormat: () => formatStateRef.current,
      readFinishing: () => finishPendingRef.current,
      stepHistory: (direction) => stepLineHistoryRef.current(direction),
      restoreFormats: (formats, words) => restoreFormatsRef.current(formats, words),
      historySteps: () => textHistoryRef.current.past.length + formatHistoryRef.current.past.length,
      ghost: () => makeFinishGhostRef.current(),
      leave: () => requestLeaveRef.current(),
      readFrame: () => shownFrameRef.current,
      discard: () => requestDiscardRef.current(),
      focus: (caretOffset?: number | null, caretPoint?: PdfTextCaretPoint, mode?: "select") => {
        const input = inputRef.current;
        if (!input) return;
        // A block selected as an object stays selected when the focus only
        // comes back to it, or when it is clicked once more (WPS).
        if (objectSelectedRef.current && (mode === "select" || (caretOffset == null && !caretPoint))) {
          input.focus({ preventScroll: true });
          return;
        }
        // Focus only coming back (a late open of the line being typed in)
        // keeps the selection as it is: taken as a caret at its start, the
        // words being selected with Shift+Arrow were let go one by one
        
        if (caretOffset == null && !caretPoint && !objectSelectedRef.current) {
          input.focus({ preventScroll: true });
          return;
        }
        const pointOffset = caretOffsetAtPoint(caretPoint);
        const offset = Math.max(
          0,
          Math.min(
            input.value.length,
            pointOffset ?? (caretOffset != null && sourceInputLayoutRef.current
              ? pdfNativeTextInputDisplayOffset(sourceInputLayoutRef.current, caretOffset) : caretOffset) ?? input.selectionStart,
          ),
        );
        enterTextEditing(offset);
      },
    });
    onControllerChange?.(controller);
    return () => onControllerChange?.(null);
  }, [onControllerChange, caretOffsetAtPoint, enterTextEditing]);


  useEffect(() => {
    const isInsideEditor = (target: Element) => {
      const ribbon = ribbonHost?.parentElement ?? ribbonHost;
      const ownerWindowId =
        ribbon?.closest<HTMLElement>("[data-window-id]")?.dataset.windowId;
      const popupOwner = target.closest<HTMLElement>(
        "[data-window-transient-popup-owner]",
      )?.dataset.windowTransientPopupOwner;
      const menuId = target.closest("[role='menu'][id]")?.id;
      const ownsMenu =
        menuId &&
        Array.from(ribbon?.querySelectorAll("[aria-controls]") ?? []).some(
          (control) => control.getAttribute("aria-controls") === menuId,
        );
      const ribbonControl = target.closest(
        'button, input, select, textarea, label, [role="combobox"], [role="checkbox"]',
      );
      return Boolean(
        inputRef.current?.contains(target) ||
        // The text's own right-click menu is part of this edit.
        target.closest(`[data-testid="${NATIVE_TEXT_CONTEXT_MENU_TEST_ID}"]`) ||
        // So is its 插入符号 dialog.
        target.closest(`[data-testid^="${NATIVE_TEXT_SYMBOL_TEST_PREFIX}-"]`) ||
        layoutFrameRef.current?.contains(target) ||
        (!layoutFrameRef.current && inlineEditorHost?.contains(target)) ||
        (ribbonControl && ribbon?.contains(ribbonControl)) ||
        (ownerWindowId && ownerWindowId === popupOwner) ||
        ownsMenu,
      );
    };
    // A click on another source box ends this edit first. Do not let its
    // compatibility mousedown/click start a parallel A→B save while this
    // draft's preview or durable commit is still pending (or has failed).
    const blockSourceReactivation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const pageWindow =
        ribbonRootRef?.current ??
        inlineEditorHost?.closest(".pdf-page-window");
      if (
        !target ||
        isInsideEditor(target) ||
        !pageWindow?.contains(target) ||
        !target.closest(NATIVE_TEXT_EDIT_BOX_SELECTOR)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    // This line is left for a press elsewhere: for another text box, that
    // box is the next target, opened once this draft is in.
    const pressOutside = (target: Element, press: Readonly<{ clientX: number; clientY: number; timeStamp: number }>) => {
      settleNextTextTarget(false);
      // While the page's text layer is built again after a save, its boxes
      // are held as a picture that takes no pointer (text-layer-ghost): a
      // press on a line there lands on the page. The held box under it is
      // the line pressed, found again once its layer is back.
      const heldBoxAt = (): HTMLElement | null => {
        const page = target.closest<HTMLElement>(".pdf-viewer__page");
        const under = (selector: string) => {
          for (const box of page?.querySelectorAll<HTMLElement>(selector) ?? []) {
            if (box === inlineEditorHost || box === returnFocusRef.current ||
              box.getAttribute("data-pdf-native-text-inline-editing") === "true") continue;
            const r = box.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && press.clientX >= r.left && press.clientX <= r.right &&
              press.clientY >= r.top && press.clientY <= r.bottom) return box;
          }
          return null;
        };
        // The held picture first; then the page's own boxes by where they
        // are -- covered right now (this line's surface over the page while
        // a revision is read in) or taking no pointer, the press under them
        
        // kept for no line, and every key typed for it went nowhere).
        return under('[data-pdf-text-layer-ghost="true"] span[data-pdf-native-text-edit-box-ghost="true"]') ??
          under(NATIVE_TEXT_EDIT_BOX_SELECTOR);
      };
      const next = target.closest<HTMLElement>(NATIVE_TEXT_EDIT_BOX_SELECTOR) ?? heldBoxAt();
      // The line pressed is the reader's next line whatever this one is
      // doing: busy proving itself, a press on another line was not kept,
      
      if (next) {
        // The box opens selected as a block (WPS's single click); the second
        // press of a double click on it, while this line still saves, puts
        // its caret in.
        const last = lastOutsidePressRef.current;
        const caret = last !== null && last.target === next && press.timeStamp - last.time < 500 &&
          Math.hypot(press.clientX - last.clientX, press.clientY - last.clientY) < 4;
        lastOutsidePressRef.current = {
          target: next, time: press.timeStamp, clientX: press.clientX, clientY: press.clientY,
        };
        const point = { clientX: press.clientX, clientY: press.clientY };
        nextTextTargetRef.current = (caret
          ? captureNextTextTarget?.(next, point, { caret: true })
          : captureNextTextTarget?.(next, point)) ?? null;
      }
      restoreFocusOnCloseRef.current = false;
      leavingToReopenRef.current = false;
      readerLeftRef.current = true;
      requestFinish();
    };
    // The frame's move band and grips reach past the frame: in a tight list
    // the band lies over the whole next line and the bottom grip over its
    // middle. A press there that is over another text box is held: once it
    // travels it is this box's move or resize, as ever; let go where it was,
    // it is a press on the box under it. WPS never lets the frame swallow a
    // click aimed at the next line; here that click went nowhere, and the
    // line could not be left for the next one at all.
    let heldPress: Readonly<{ pointerId: number; clientX: number; clientY: number;
      control: HTMLElement; below: HTMLElement }> | null = null;
    const boxUnderFrameControl = (target: Element, event: PointerEvent): HTMLElement | null => {
      const frame = layoutFrameRef.current;
      const control = target.closest<HTMLElement>('[data-pdf-native-text-layout-control="true"]');
      if (!frame || !control || !frame.contains(control) || event.button !== 0 ||
        typeof document.elementsFromPoint !== "function") return null;
      const rect = frame.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) return null;
      for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
        if (frame.contains(element)) continue;
        const box = element.closest<HTMLElement>(NATIVE_TEXT_EDIT_BOX_SELECTOR);
        // This line's own box is no other line: the band beside it moves it.
        if (box && box !== inlineEditorHost && box !== returnFocusRef.current &&
          box.getAttribute("data-pdf-native-text-inline-editing") !== "true") return box;
      }
      return null;
    };
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      markPdfTextLatency("outside.pointerdown", { inside: target ? isInsideEditor(target) : null });
      if (!target) return;
      if (isInsideEditor(target)) {
        const below = boxUnderFrameControl(target, event);
        if (below) {
          event.preventDefault();
          event.stopPropagation();
          heldPress = Object.freeze({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
            control: target.closest<HTMLElement>('[data-pdf-native-text-layout-control="true"]')!, below });
        }
        return;
      }
      // A press on this line's own box beside its frame (the box a
      // rewritten line is read in can reach past it, and with the line open
      // the box takes no pointer) is a press in the line, as one on its
      // frame's body is: the caret goes where it landed (PowerPoint, WPS,
      // ONLYOFFICE). Taken for a press elsewhere, it closed the line and the
      // reopening it asked for never came: a click just after the last word
      // of a line edited a moment before did nothing (comfort probe,
      
      // The line's box is found by its id once the page's layer has been
      // built again (an edit staged meanwhile): the box it was opened from
      // is gone then, and a press on the line was taken for a press on
      // another line -- this one, opened next behind its own finish, which
      
      const ownBox = returnFocusRef.current?.isConnected ? returnFocusRef.current
        : findPdfNativeTextBoxByLineId(target.closest(".pdf-viewer__page")?.querySelector("[data-pdf-text-layer]"),
          pdfNativeTextLineIdOf(returnFocusRef.current));
      const ownRect = ownBox?.getBoundingClientRect();
      if (event.button === 0 && ownRect && ownRect.width > 0 && ownRect.height > 0 &&
        event.clientX >= ownRect.left && event.clientX <= ownRect.right &&
        event.clientY >= ownRect.top && event.clientY <= ownRect.bottom &&
        target.closest(".pdf-viewer__page") === ownBox!.closest(".pdf-viewer__page") &&
        !draftStateRef.current.composing) {
        event.preventDefault();
        event.stopPropagation();
        // Left a moment ago and its finish still waiting (its proof, the
        // edit before it staging): the line is taken up again where it was
        // pressed, in this editor -- the reader never left it as far as the
        // page is concerned. Left to its finish, its input stayed read-only
        // under the reader's keys: the words went nowhere and a space
        // scrolled the page a screen down.
        if (!applyingRef.current && (finishPendingRef.current || finishResumableRef.current)) {
          readerLeftRef.current = false;
          finishPendingRef.current = false;
          restoreInteractionChromeRef.current?.();
          restoreInteractionChromeRef.current = null;
          setFinishRequested(null);
          setFinishAfterQueuedActions(false);
          settleNextTextTarget(false);
          restoreFocusOnCloseRef.current = true;
          markPdfTextLatency("finish.resumed");
        }
        enterTextAtPressRef.current(event.clientX, event.clientY);
        return;
      }
      blockSourceReactivation(event);
      const current = draftStateRef.current;
      if (current.composing) {
        event.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
        return;
      }
      pressOutside(target, event);
    };
    const handleHeldPressMove = (event: PointerEvent) => {
      const held = heldPress;
      if (!held || held.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - held.clientX, event.clientY - held.clientY) < 3) return;
      heldPress = null;
      const mode: "rotate" | "move" | ResizeHandle = (held.control.dataset.handle as ResizeHandle | undefined) ??
        (held.control.dataset.testid === "pdf-native-text-rotate-handle" ? "rotate" : "move");
      // The drag the control starts, from where the press was.
      beginLayoutDragRef.current(mode, {
        pointerId: held.pointerId, clientX: held.clientX, clientY: held.clientY,
        currentTarget: held.control, preventDefault: () => undefined, stopPropagation: () => undefined,
      } as unknown as ReactPointerEvent<HTMLElement>);
    };
    const handleHeldPressUp = (event: PointerEvent) => {
      const held = heldPress;
      if (!held || held.pointerId !== event.pointerId) return;
      heldPress = null;
      if (event.type === "pointercancel" || !held.below.isConnected) return;
      if (draftStateRef.current.composing) {
        inputRef.current?.focus({ preventScroll: true });
        return;
      }
      pressOutside(held.below, { clientX: held.clientX, clientY: held.clientY, timeStamp: event.timeStamp });
      // The click the browser still sends for this press belongs to it: the
      // reader's page must not read it as a click of its own on a box (it
      // showed a notice that held the whole window).
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.setTimeout(() => window.removeEventListener("click", swallow, true), 400);
    };
    // Enter or Space on another text box (reached by Tab) while this editor
    // is open is the same intent as a press on it: this draft saves first
    // and the box opens after, as the pointer path does. Left to the viewer
    // it would be consumed by the save and the user would have to press
    // again.
    const handleOutsideKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      // This line's own box holding the focus (a press on it as the editor came
      // up): the key is this editor's. Read as Space on another box, the line
      // closed and opened again with its caret in the middle, and the words
      
      const own = returnFocusRef.current;
      const onOwnBox = target && !isInsideEditor(target) && own
        ? target.closest<HTMLElement>(NATIVE_TEXT_EDIT_BOX_SELECTOR) : null;
      const input = inputRef.current;
      if (onOwnBox && own && input && !input.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing &&
        (onOwnBox === own || (pdfNativeTextLineIdOf(onOwnBox) !== null && pdfNativeTextLineIdOf(onOwnBox) === pdfNativeTextLineIdOf(own)))) {
        const printable = event.key.length === 1;
        const toEdge = event.key === "End" || event.key === "Home";
        if (printable || toEdge || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          input.focus({ preventScroll: true });
          if (printable) insertPdfNativeTextTypeAhead(input, event.key, null);
          else if (toEdge && !event.shiftKey) insertPdfNativeTextTypeAhead(input, "", event.key === "End" ? "end" : "start");
          return;
        }
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!target || isInsideEditor(target)) return;
      const next = target.closest<HTMLElement>(NATIVE_TEXT_EDIT_BOX_SELECTOR);
      if (!next || draftStateRef.current.composing) return;
      event.preventDefault();
      event.stopPropagation();
      settleNextTextTarget(false);
      {
        const rect = next.getBoundingClientRect();
        // From the keyboard the box opens with its caret in.
        nextTextTargetRef.current = captureNextTextTarget?.(next, {
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        }, { caret: true }) ?? null;
      }
      restoreFocusOnCloseRef.current = false;
      leavingToReopenRef.current = false;
      readerLeftRef.current = true;
      requestFinish();
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleOutsideKeyDown, true);
    document.addEventListener("mousedown", blockSourceReactivation, true);
    document.addEventListener("click", blockSourceReactivation, true);
    window.addEventListener("pointermove", handleHeldPressMove, true);
    window.addEventListener("pointerup", handleHeldPressUp, true);
    window.addEventListener("pointercancel", handleHeldPressUp, true);
    return () => {
      window.removeEventListener("pointermove", handleHeldPressMove, true);
      window.removeEventListener("pointerup", handleHeldPressUp, true);
      window.removeEventListener("pointercancel", handleHeldPressUp, true);
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener("keydown", handleOutsideKeyDown, true);
      document.removeEventListener("mousedown", blockSourceReactivation, true);
      document.removeEventListener("click", blockSourceReactivation, true);
    };
  }, [inlineEditorHost, ribbonHost, ribbonRootRef, requestFinish, busy, captureNextTextTarget, settleNextTextTarget,
    returnFocusRef]);

  useEffect(() => {
    // A draft the window has taken is the window's to answer for: it closes
    // this editor and clears the draft's flags as it takes it. Said again
    // as unsaved after that -- by a render of the editor before the
    // window's own, or by an effect of the render before the hand-over run
    // after it -- nothing ever cleared it once the editor was gone: the
    // page read 「未保存」 for good over an edit written and saved, the
    // working copy clean (walk rv0052: a line slanted and left).
    if (draftHandedOver()) return;
    if (!unverifiedNativeSource) onDraftStateChange?.(draftState);
  }, [draftState, onDraftStateChange, unverifiedNativeSource]);
  const typingUnsaved = draftState.dirty;
  useEffect(() => {
    // (Not of a draft the window has taken, as above: the window answers
    // for those words from the hand-over on.)
    if (typingUnsaved && draftHandedOver()) return;
    onUnsavedTypingChange?.(typingUnsaved);
  }, [onUnsavedTypingChange, typingUnsaved]);
  // Closed (written, handed to the window, or dropped): nothing of it waits here.
  useEffect(() => () => onUnsavedTypingChange?.(false), [onUnsavedTypingChange]);
  const typingDraftText = typingUnsaved && replacementText !== originalText ? replacementText : null;
  // The formats pressed and not written: those of the page's own text, which
  // this editor holds as its history holds them (a text box's and a scanned
  // line's are its box's runs, kept with the box). Ones handed back and
  // still waiting for the proof are the line's already. Not once written:
  // the draft is dirty no more, and nothing is held.
  const typingDraftFormats = useMemo<PdfNativeTextFormatDraft | null>(() => {
    if (formatRestore) return formatRestore.draft;
    if (managedLayoutTypography || coverLaneLine) return null;
    const pressed = draftDirty && (partFormats.length > 0 || propertyOverride !== null || rowFormat !== null);
    if (!pressed && queuedRibbonActions.length === 0) return null;
    return Object.freeze({ parts: partFormats, properties: propertyOverride,
      propertyBaseline: propertyOverride ? propertyBaseline : null, rowFormat, queued: queuedRibbonActions });
  }, [coverLaneLine, draftDirty, formatRestore, managedLayoutTypography, partFormats, propertyBaseline, propertyOverride,
    queuedRibbonActions, rowFormat]);
  useEffect(() => {
    // Nor are words the window has taken kept as this line's typing: said
    // after the hand-over (an effect of the render before it), the window
    // kept them as the typing of whatever line was open by then -- the line
    // pressed next opens in the hand-over's own update -- to be typed into
    // it when the page comes back after a reload. The formats pressed with
    // them the same.
    const held = typingDraftText !== null || typingDraftFormats !== null;
    if (held && draftHandedOver()) return;
    onTypingDraftChange?.(held ? { originalText, value: replacementText,
      ...(typingDraftFormats ? { formats: typingDraftFormats } : {}) } : null);
  }, [onTypingDraftChange, originalText, replacementText, typingDraftFormats, typingDraftText]);

  useEffect(() => {
    if (!layoutDrag) return;
    const commitMove = (next: BoxRect) => {
      setLayoutRect(next);
      // A box resized as a group moves as the same map of its first frame;
      // a paragraph of several lines moves as its group.
      const moved = propertyOverride?.groupScale ? groupDraftWithScale(next)
        : propertyDraftWithMove(next) ?? groupDraftWithScale(next);
      if (moved) {
        // Native move: the source run's text matrix origin is rewritten by
        // the property transaction; no managed layout box is created.
        setProperties(moved);
        // A paragraph already set again in a narrower frame keeps that
        // frame as it travels: its right edge goes with the move.
        const frameRight = paragraphFrameRightRef.current;
        const matrix = initialLayout?.pdfToCssTransform;
        if (frameRight !== null && matrix && initialLayout) {
          const right = Math.round(((next.x + next.width) * initialLayout.pageWidthPx - matrix[4]) / matrix[0] * 1e4) / 1e4;
          if (Number.isFinite(right)) {
            rewrapMovedRef.current = true;
            setParagraphFrameRight(right);
          }
        }
        return;
      }
      if (preparationPendingRef.current && !manualLayoutDirtyRef.current) {
        setMoveAwaitingProof(true);
        return;
      }
      setManualLayoutDirty(true);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== layoutDrag.pointerId) return;
      event.preventDefault();
      if (layoutDrag.mode === "rotate") {
        const radians = Math.atan2(
          event.clientY - layoutDrag.centreClientY,
          event.clientX - layoutDrag.centreClientX,
        );
        let angle = normalizeBoxAngle((radians * 180) / Math.PI + 90);
        if (event.shiftKey) angle = Math.round(angle / 15) * 15;
        setLayoutAngle(normalizeBoxAngle(angle));
        // Written into the run's own text matrix: the line stays a line of
        // the page, turned about the centre of its box as the frame turns.
        const turn = layoutDrag.nativeTurn;
        if (turn) {
          const delta = normalizeBoxAngle(angle - layoutDrag.startAngle);
          const turned = Math.abs(delta) < 1e-6 || Math.abs(Math.abs(delta) - 360) < 1e-6
            ? turn.linear
            : pdfNativeTextLinearTurned(turn.linear, propertyProof?.graphicsMatrix, delta);
          if (turned) {
            setProperties({ ...turn.draft, textMatrixLinear: turned });
            return;
          }
        }
        if (layoutDrag.groupTurn) {
          const turned = groupDraftWithTurn(layoutDrag.groupTurn, normalizeBoxAngle(angle - layoutDrag.startAngle));
          if (turned) {
            setProperties(turned);
            return;
          }
        }
      } else if (layoutDrag.mode === "move") {
        const next = moveBox(
          layoutDrag.startRect,
          (event.clientX - layoutDrag.startX) / layoutDrag.renderedPageSize.width,
          (event.clientY - layoutDrag.startY) / layoutDrag.renderedPageSize.height,
        );
        // The first step goes through the state (the moved draft, the lift
        // and the draft's dirty flag turn on with it); the steps after it
        // move the frame without rendering the editor, and the drop sets the
        // state once (NativeTextFrameFollower).
        const follow = followMoveRef.current;
        if (movedDragRef.current === layoutDrag && follow) {
          liveMoveRectRef.current = next;
          follow();
          return;
        }
        movedDragRef.current = layoutDrag;
        liveMoveRectRef.current = null;
        commitMove(next);
        return;
      } else {
        const localDelta = rotatePointAround(
          {
            x: event.clientX - layoutDrag.startX,
            y: event.clientY - layoutDrag.startY,
          },
          { x: 0, y: 0 },
          -layoutDrag.startAngle,
        );
        // WPS resize: width per drag, text re-wrapped at its own size, the
        // frame never shorter than its content and never snapped back to it.
        const next = holdRewrapWidth(
          layoutDrag.startRect,
          resizeTextBoxToFitContent(
            layoutDrag.startRect,
            layoutDrag.mode,
            localDelta.x / layoutDrag.renderedPageSize.width,
            localDelta.y / layoutDrag.renderedPageSize.height,
            layoutContentHeightFor(layoutDrag.startRect),
          ),
          layoutDrag.mode,
          localDelta.y / layoutDrag.renderedPageSize.height,
          layoutContentHeightFor(layoutDrag.startRect),
        );
        setLayoutRect(next);
        if (process.env.NODE_ENV !== "production") markPdfTextLatency("resize.drag", {
          eligible: nativeRewrapEligible, minimum: Math.round(rewrapMinimumWidthRef.current * 1e4) / 1e4,
          width: Math.round(next.width * 1e4) / 1e4, start: Math.round(layoutDrag.startRect.width * 1e4) / 1e4,
          promoted: Boolean(initialLayout?.promoted), fallback: openedInFallbackLane, managed: managedLayoutTypography,
          propertyDraft: propertyLayoutDraftChanged, typographyDirty: managedTypographyDirty,
          paragraph: paragraphChanges !== null, manual: manualLayoutDirty,
          move: Boolean(propertyOverride?.moveX || propertyOverride?.moveY || propertyOverride?.groupScale),
          transform: initialLayout?.pdfToCssTransform?.length === 6, geometry: Boolean(rewrapMinimumGeometry),
          browserUnit: Math.round(browserWidestUnit),
        });
        // A drag the content refused (pulled shorter than the text) leaves
        // the frame exactly as it was, and an untouched frame is not dirty.
        if (sameBoxRect(next, layoutDrag.startRect)) return;
        const kept = nativeResizeDraft(next);
        if (kept) {
          setProperties(kept);
          return;
        }
        if (requestNativeRewrap(next)) return;
        // Pulled before the line's proof was in: the frame waits for it, as
        // a move made then does, and is set again natively once it is here.
        
        
        // paragraph resized on a loaded machine).
        if (preparationPendingRef.current && !manualLayoutDirtyRef.current) {
          setResizeAwaitingProof(true);
          return;
        }
      }
      setManualLayoutDirty(true);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== layoutDrag.pointerId) return;
      // Where the frame was carried since the state last moved it.
      const live = movedDragRef.current === layoutDrag ? liveMoveRectRef.current : null;
      liveMoveRectRef.current = null;
      movedDragRef.current = null;
      if (live) commitMove(live);
      setLayoutDrag(null);
    };
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [layoutDrag, pageHeightPixels, pageWidthPixels, propertyDraftWithMove, groupDraftWithScale,
    propertyOverride, layoutContentHeightFor, nativeResizeDraft, propertyProof, requestNativeRewrap, holdRewrapWidth,
    groupDraftWithTurn]);

  // The proof is here (or failed): a resize made while it was on its way is
  // the native one it allows (the frame's width re-wraps the paragraph),
  
  useEffect(() => {
    if (!resizeAwaitingProof || preparationPending || !layoutRect) return;
    setResizeAwaitingProof(false);
    const kept = nativeResizeDraft(layoutRect);
    if (kept) setProperties(kept);
    else if (!requestNativeRewrap(layoutRect)) setManualLayoutDirty(true);
  }, [resizeAwaitingProof, preparationPending, layoutRect, nativeResizeDraft, requestNativeRewrap]);

  // The proof is here (or failed): the move made while it was on its way is
  
  useEffect(() => {
    if (!moveAwaitingProof || preparationPending || !layoutRect) return;
    setMoveAwaitingProof(false);
    const moved = propertyOverride?.groupScale ? groupDraftWithScale(layoutRect) : propertyDraftWithMove(layoutRect);
    if (moved) setProperties(moved);
    else setManualLayoutDirty(true);
  }, [moveAwaitingProof, preparationPending, layoutRect, propertyOverride, groupDraftWithScale, propertyDraftWithMove]);

  // A drag made on this box before it could open (controller.moveBy): once
  // its frame and proof are in, the box moves by it, as the drag itself
  // would have moved it, and stays selected for the reader to go on.
  useEffect(() => {
    if (!pendingMoveBy || !effectiveLayoutRect || busy || submitting || preparationPending) return;
    const pageHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
    if (!pageHost) return;
    setPendingMoveBy(null);
    // (A line of words not read as drawn is not carried: beginLayoutDrag.)
    if (wordsUnread) {
      pendingMoveByRef.current = null;
      type3WordsSayRef.current(true);
      return;
    }
    const size = resolveOverlayCoordinateSize(pageHost.getBoundingClientRect(), {
      width: pageWidthPixels,
      height: pageHeightPixels,
    });
    if (!(size.width > 0 && size.height > 0)) return;
    const start = effectiveLayoutRect;
    const next = moveBox(start, pendingMoveBy.dx / size.width, pendingMoveBy.dy / size.height);
    setMoveStartFrame((current) => current ?? start);
    setLayoutRect(next);
    const moved = propertyOverride?.groupScale ? groupDraftWithScale(next) : propertyDraftWithMove(next);
    if (moved) setProperties(moved);
    else setManualLayoutDirty(true);
  }, [pendingMoveBy, effectiveLayoutRect, busy, submitting, preparationPending, inlineEditorHost,
    pageWidthPixels, pageHeightPixels, propertyOverride, groupDraftWithScale, propertyDraftWithMove, wordsUnread]);

  const beginLayoutDrag = useCallback(
    (mode: "rotate" | "move" | ResizeHandle, event: ReactPointerEvent<HTMLElement>) => {
      if (!effectiveLayoutRect || busy || submitting) return;
      // A line of words not read as drawn stays where it stands: carried,
      // resized or turned it is set again, or made a text box, from words
      // that are not the page's.
      if (wordsUnread) {
        event.preventDefault();
        event.stopPropagation();
        type3WordsSayRef.current(true);
        return;
      }
      setFinishRequested(null);
      const pageHost = inlineEditorHost?.closest<HTMLElement>(
        ".pdf-viewer__page[data-page-number]",
      );
      if (!pageHost) return;
      event.preventDefault();
      event.stopPropagation();
      const pageRect = pageHost.getBoundingClientRect();
      setLayoutRect(effectiveLayoutRect);
      if (mode === "move") setMoveStartFrame((current) => current ?? effectiveLayoutRect);
      setLayoutDrag({
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: effectiveLayoutRect,
        startAngle: layoutAngle,
        ...(mode === "rotate" && nativeTurnable && properties && propertyProof
          ? { nativeTurn: { draft: properties, linear: properties.textMatrixLinear ?? propertyProof.original.textMatrixLinear } }
          : mode === "rotate" && groupTurnable && (properties ?? groupBaseline)
            ? { groupTurn: { draft: (properties ?? groupBaseline)!, rect: effectiveLayoutRect } }
            : {}),
        renderedPageSize: resolveOverlayCoordinateSize(pageRect, {
          width: pageWidthPixels,
          height: pageHeightPixels,
        }),
        centreClientX:
          pageRect.left +
          (effectiveLayoutRect.x + effectiveLayoutRect.width / 2) *
            pageRect.width,
        centreClientY:
          pageRect.top +
          (effectiveLayoutRect.y + effectiveLayoutRect.height / 2) *
            pageRect.height,
      });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [busy, effectiveLayoutRect, inlineEditorHost, layoutAngle, submitting, pageWidthPixels, pageHeightPixels,
      nativeTurnable, properties, propertyProof, groupTurnable, groupBaseline, setFinishRequested, wordsUnread],
  );

  // A press on the body of a block selected as an object becomes a move of
  // the block once the pointer travels; a click, or the presses of a double
  // click, move nothing and leave its frame as it is.
  const pendingObjectPressRef = useRef<Readonly<{
    pointerId: number; clientX: number; clientY: number; target: HTMLElement;
  }> | null>(null);
  const beginLayoutDragRef = useRef(beginLayoutDrag);
  useLayoutEffect(() => { beginLayoutDragRef.current = beginLayoutDrag; });
  // A click on the body of the selected block (a press released where it
  // was made) puts the caret in where it landed, as PowerPoint and WPS do on
  // the second click into a selected text box: a style change had left the
  // line selected as an object, and the reader's click in its words then
  // placed nothing, the drag that followed moved the block, and the input
  
  const enterTextAtPressRef = useRef<(clientX: number, clientY: number) => void>(() => undefined);
  /** A finish asked for and not yet being written: a press back in the line
   * takes it up again (the outside press handler, registered once). */
  const finishResumableRef = useRef(false);
  finishResumableRef.current = !submitting && (finishRequested !== null || finishAfterQueuedActions);
  enterTextAtPressRef.current = (clientX, clientY) => {
    const bounds = inputRef.current?.closest<HTMLElement>(".pdf-viewer__page")?.getBoundingClientRect();
    const offset = bounds && bounds.width > 0 && bounds.height > 0
      ? caretOffsetAtPoint({ x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height })
      : null;
    enterTextEditing(offset ?? undefined);
  };
  const pressSelectedBlock = (event: ReactPointerEvent<HTMLElement>) => {
    pendingObjectPressRef.current = Object.freeze({
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, target: event.currentTarget,
    });
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* the pointer already went */ }
  };
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const press = pendingObjectPressRef.current;
      if (!press || press.pointerId !== event.pointerId ||
        Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) < 3) return;
      pendingObjectPressRef.current = null;
      // The drag the frame band starts, from where the press was.
      beginLayoutDragRef.current("move", {
        pointerId: press.pointerId, clientX: press.clientX, clientY: press.clientY,
        currentTarget: press.target, preventDefault: () => undefined, stopPropagation: () => undefined,
      } as unknown as ReactPointerEvent<HTMLElement>);
    };
    const release = (event: PointerEvent) => {
      const press = pendingObjectPressRef.current;
      if (press?.pointerId !== event.pointerId) return;
      pendingObjectPressRef.current = null;
      // Released where it was pressed (a move cleared the press above): a click.
      // (A paragraph open as a block for its formats alone stays selected:
      // its words are a line's, opened by a double press -- onOpenLineOfBlock.)
      if (event.type === "pointerup" && event.button === 0 && !wordsByLineRef.current) enterTextAtPressRef.current(press.clientX, press.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  const handleLayoutControlKeyDown = useCallback(
    (mode: "rotate" | "move" | ResizeHandle, event: ReactKeyboardEvent<HTMLElement>) => {
      if (busy || submitting || !effectiveLayoutRect) return;
      // (A line of words not read as drawn stays where it stands:
      // beginLayoutDrag. An arrow moves nothing and says nothing.)
      if (wordsUnread) {
        if (event.key.startsWith("Arrow")) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      const step = event.shiftKey ? 0.01 : 0.0025;
      if (mode === "rotate") {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const delta = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 15 : 1);
        setLayoutAngle((current) => normalizeBoxAngle(current + delta));
        const turned = nativeTurnable && properties && propertyProof
          ? pdfNativeTextLinearTurned(
            properties.textMatrixLinear ?? propertyProof.original.textMatrixLinear, propertyProof.graphicsMatrix, delta)
          : null;
        if (turned && properties) {
          setProperties({ ...properties, textMatrixLinear: turned });
          return;
        }
        setManualLayoutDirty(true);
        return;
      }
      const dx =
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0;
      const dy =
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (dx === 0 && dy === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === "move") {
        const next = moveBox(effectiveLayoutRect, dx, dy);
        setMoveStartFrame((current) => current ?? effectiveLayoutRect);
        setLayoutRect(next);
        // A box resized as a group moves as the same map of its first frame.
        const moved = propertyOverride?.groupScale ? groupDraftWithScale(next) : propertyDraftWithMove(next);
        if (moved) {
          setProperties(moved);
          return;
        }
        if (preparationPendingRef.current && !manualLayoutDirtyRef.current) {
          setMoveAwaitingProof(true);
          return;
        }
        setManualLayoutDirty(true);
        return;
      }
      const resized = holdRewrapWidth(
        effectiveLayoutRect,
        resizeTextBoxToFitContent(
          effectiveLayoutRect,
          mode,
          dx,
          dy,
          layoutContentHeightFor(effectiveLayoutRect),
        ),
        mode,
        dy,
        layoutContentHeightFor(effectiveLayoutRect),
      );
      // A step the content refused changes nothing (see the pointer drag).
      if (sameBoxRect(resized, effectiveLayoutRect)) return;
      setLayoutRect(resized);
      const kept = nativeResizeDraft(resized);
      if (kept) {
        setProperties(kept);
        return;
      }
      if (requestNativeRewrap(resized)) return;
      setManualLayoutDirty(true);
    },
    [busy, effectiveLayoutRect, submitting, propertyDraftWithMove, groupDraftWithScale,
      propertyOverride, layoutContentHeightFor, nativeResizeDraft, nativeTurnable, properties, propertyProof,
      requestNativeRewrap, holdRewrapWidth, wordsUnread],
  );

  // The side handle dragged to a width (pdf.text.rewrap_original through the
  // PDF window): the steps a drag or an arrow key on the "e" handle takes.
  resizeWidthRef.current = (widthFraction: number) => {
    // Only where the reader could drag it: the frame shown on the page, no
    // draft finishing, the line upright.
    if (busy || submitting || finishRequested !== null || !effectiveLayoutRect || !ownsInlineHost || wordsUnread ||
      !(widthFraction > 0) || Math.abs(normalizeBoxAngle(layoutAngle)) > 0.01) return "refused";
    const start = effectiveLayoutRect;
    const dx = widthFraction - start.width;
    if (Math.abs(dx) <= BOX_RECT_EPSILON) return "unchanged";
    const contentHeight = layoutContentHeightFor(start);
    const resized = holdRewrapWidth(
      start,
      resizeTextBoxToFitContent(start, "e", dx, 0, contentHeight),
      "e",
      0,
      contentHeight,
    );
    if (sameBoxRect(resized, start)) return "unchanged";
    setLayoutRect(resized);
    const kept = nativeResizeDraft(resized);
    if (kept) {
      setProperties(kept);
      return "resized";
    }
    if (requestNativeRewrap(resized)) return "resized";
    setManualLayoutDirty(true);
    return "resized";
  };

  const pendingProjectedCaretRef = useRef<{start: number; end: number; direction: "forward" | "backward" | "none"} | null>(null);
  // The line's own undo history (Cmd+Z, Cmd+Shift+Z, Ctrl+Y). The box's rows
  // are written over the value the browser holds when an edit re-wraps them
  // (a Backspace that joins two rows), and the browser's own undo throws
  
  // undone). Every edit is a step here; characters typed in one go are one
  // step, as Word takes them back.
  type TextHistorySnapshot = Readonly<{ value: string; start: number; end: number }>;
  const textHistoryRef = useRef<{
    past: TextHistorySnapshot[]; future: TextHistorySnapshot[]; at: number; typing: boolean;
  }>({ past: [], future: [], at: 0, typing: false });
  const compositionHistoryStartRef = useRef<TextHistorySnapshot | null>(null);
  const recordTextHistory = (before: TextHistorySnapshot, typing: boolean) => {
    const history = textHistoryRef.current;
    const now = Date.now();
    if (!(typing && history.typing && now - history.at < 1_000 && history.past.length > 0)) {
      history.past.push(before);
      if (history.past.length > 200) history.past.shift();
      formatHistoryRef.current.log.push("text");
    }
    formatHistoryRef.current.redoLog = [];
    formatHistoryRef.current.future = [];
    history.future = [];
    history.at = now;
    history.typing = typing;
  };
  // What the input really held when the browser fired `input`, read before
  // React sees the event. React flushes any pending render at the start of
  // an event; when one was pending (the proof arriving, a preview landing),
  // that commit wrote the controlled value over the character the browser
  // had just inserted, the value then compared unchanged, and onChange never
  // fired: a key typed at that moment was silently lost (one in eight right
  // after a line opened). The window's capture phase runs before React's
  // root listener; onInput below restores the edit when the two disagree.
  const nativeInputSnapshotRef = useRef<{ value: string; start: number; end: number } | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      const input = inputRef.current;
      if (!input || event.target !== input) return;
      nativeInputSnapshotRef.current = {
        value: input.value,
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
      };
    };
    window.addEventListener("input", capture, true);
    return () => window.removeEventListener("input", capture, true);
  }, []);
  // The selection an edit replaces, taken before the browser changes the
  // value: it tells which of two equal rows an edit took (see
  // editPdfNativeTextInputLayout). React's onBeforeInput is not the DOM's
  // beforeinput -- it is built from textInput/keypress/compositionend and
  // never fires for a deletion -- so the DOM's own event is read, and a
  // Backspace/Delete keydown takes it too (WebKit can delete on a key with
  // no beforeinput). A composition's steps are not edits of their own.
  useEffect(() => {
    const remember = (event: Event) => {
      const input = inputRef.current;
      if (!input || event.target !== input) return;
      if (event instanceof InputEvent && event.isComposing) return;
      if (event instanceof KeyboardEvent && (
        (event.key !== "Backspace" && event.key !== "Delete") || isNativeTextImeKeydown(event))) return;
      sourceInputBeforeEditRef.current = {
        value: input.value,
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
      };
    };
    window.addEventListener("beforeinput", remember, true);
    window.addEventListener("keydown", remember, true);
    return () => {
      window.removeEventListener("beforeinput", remember, true);
      window.removeEventListener("keydown", remember, true);
    };
  }, []);
  // The horizontal position a run of ArrowUp/ArrowDown presses keeps, and the
  // offset it left the caret at (any other caret move starts a new run).
  const verticalCaretGoalRef = useRef<{offset: number; goal: number} | null>(null);
  useLayoutEffect(() => {
    const caret = pendingSourceCaretRef.current;
    if (!caret || composing) return;
    pendingSourceCaretRef.current = null;
    // Reuse Code editor's bounded diff and ChangeSet position mapping. This
    // handles spaces, Unicode and line breaks without inventing source text.
    const changes = ChangeSet.of(diff(caret.value, displayedInputValue, {
      scanLimit: 10_000, timeout: 50,
    }).map(change => ({
      from: change.fromA, to: change.toA,
      insert: displayedInputValue.slice(change.fromB, change.toB),
    })), caret.value.length);
    inputRef.current?.setSelectionRange(
      changes.mapPos(caret.start, 1), changes.mapPos(caret.end, 1), caret.direction,
    );
  }, [displayedInputValue, composing]);
  useLayoutEffect(() => {
    const caret = pendingProjectedCaretRef.current;
    if (!caret || composing) return;
    pendingProjectedCaretRef.current = null;
    inputRef.current?.setSelectionRange(caret.start, caret.end, caret.direction);
  }, [displayedInputValue, composing]);
  const updateInputValue = (value: string, previousCommittedText = replacementText) => {
    // Text typed into a block selected as an object (a typed key, keys
    // typed ahead while the line before was saving, a paste) edits it: the
    // caret is in from here on.
    if (objectSelectedRef.current) {
      objectSelectedRef.current = false;
      setObjectSelected(false);
    }
    const before = sourceInputBeforeEditRef.current;
    sourceInputBeforeEditRef.current = null;
    // A source adoption that left the displayed value unchanged never
    // consumed the caret it saved. The user's own edit supersedes it; mapping
    // that stale caret onto this edit would throw the caret across the text.
    pendingSourceCaretRef.current = null;
    // So does the caret a preview's rows projected: rows that left the shown
    // text as it was kept it waiting, and the next key took the caret back to
    // where the key before had left it ("abcdef" typed read "abefdc").
    pendingProjectedCaretRef.current = null;
    // Formats of part of the run follow the text typed in and around them.
    const followSegments = (nextText: string) => {
      if (!properties?.segments?.length || !segmentBase || nextText === replacementText) return;
      setProperties(withSegments(properties,
        pdfNativeTextSegmentsAfterEdit(properties.segments, replacementText, nextText, segmentBase)));
    };
    if (activeInputLayout) {
      const next = editPdfNativeTextInputLayout(activeInputLayout, value,
        before?.value === activeInputLayout.value ? before : undefined);
      // The input shows the box's own rows while its source layout holds. An
      // edit that leaves that layout (a typed line break, text past the
      // room) shows the text as typed instead: a value written over the one
      // the browser holds, which puts the caret at the end in both engines
      // (Shift+Enter after 「图表被低清」 left it after 「消失。」, and the next
      // key or deletion landed there). The caret is carried over the change.
      const input = inputRef.current;
      if (input && !composingRef.current) pendingSourceCaretRef.current = {
        value: input.value, start: input.selectionStart, end: input.selectionEnd,
        direction: input.selectionDirection,
      };
      if (!composingRef.current && next.text !== previousCommittedText) userTextInputStartedRef.current = true;
      setSourceInputLayout(next);
      followSegments(next.text);
      setReplacementText(next.text);
    } else {
      if (!composingRef.current && value !== previousCommittedText) userTextInputStartedRef.current = true;
      followSegments(value);
      setReplacementText(value);
      // The caret is read with the text it follows: the document's
      // selectionchange came a task later and rendered the editor once more
      // for it, each key. (Only while the input's offsets are the text's: a
      // value that brings the source rows back maps them, and is read then.)
      if (!composingRef.current && sourceInputLayout?.text !== value) syncPartialRangeRef.current?.();
    }
  };
  const stepTextHistory = (direction: "undo" | "redo"): boolean => {
    const input = inputRef.current;
    const history = textHistoryRef.current;
    const from = direction === "undo" ? history.past : history.future;
    if (!input || input.readOnly || !input.isConnected || from.length === 0) return false;
    const snapshot = from.pop()!;
    const current = {
      value: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length,
    };
    (direction === "undo" ? history.future : history.past).push(current);
    history.typing = false;
    if (snapshot.value === input.value) {
      input.setSelectionRange(snapshot.start, snapshot.end);
      return true;
    }
    // As an edit of the box's own: the row edit reads the selection the
    // step replaces, and what waited on the text before it is let go.
    sourceInputBeforeEditRef.current = current;
    nativeInputSnapshotRef.current = null;
    setFinishRequested(null);
    setFinishAfterQueuedActions(false);
    setCommitError(null);
    retirePendingPreview();
    setPreviewError(null);
    updateInputValue(snapshot.value);
    pendingProjectedCaretRef.current = { start: snapshot.start, end: snapshot.end, direction: "none" };
    return true;
  };
  // The text's right-click commands. The textarea owns the text: a cut, a
  // delete or a paste runs through it (execCommand), so the browser's own
  // undo and the input path see one ordinary edit; where the browser will not
  // run the command, the same edit goes through the input path directly.
  const editInputSelection = (insert: string, selectInserted = false) => {
    const input = inputRef.current;
    if (!input || input.disabled || input.readOnly) return;
    input.focus({ preventScroll: true });
    const run = (command: string, value?: string) =>
      typeof document.execCommand === "function" && document.execCommand(command, false, value);
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    // A command's edit sends no beforeinput: it names its selection here.
    sourceInputBeforeEditRef.current = { value: input.value, start, end };
    if (insert ? run("insertText", insert) : run("delete")) {
      // The edit has been drawn by now (an input event renders at once).
      if (selectInserted) input.setSelectionRange(start, start + insert.length);
      return;
    }
    if (!insert && end <= start) return;
    setFinishRequested(null);
    setFinishAfterQueuedActions(false);
    setCommitError(null);
    retirePendingPreview();
    setPreviewError(null);
    updateInputValue(input.value.slice(0, start) + insert + input.value.slice(end));
    pendingProjectedCaretRef.current = {
      start: selectInserted ? start : start + insert.length, end: start + insert.length, direction: "none",
    };
  };
  // 更改大小写 (Word, ONLYOFFICE): the selected words, or the whole text
  // when none are, typed over in their new case as one edit; the same
  // characters stay selected.
  /** 项目符号 / 编号: each paragraph's markers written (or taken off) at its
   * start, as typing over the whole text (the run's own words, not the
   * input's display of a paragraph's rows). */
  const changeInputList = (style: PdfTextListStyle | null) => {
    const input = inputRef.current;
    if (!input || input.disabled || input.readOnly) return;
    const value = input.value;
    const after = applyPdfTextList(replacementText, style, locale);
    if (after === replacementText) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const field = inputRef.current;
      if (!field || field !== input || field.value !== value || field.disabled || field.readOnly) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange(0, field.value.length);
      editInputSelection(after, true);
    }));
  };
  const changeInputCase = (mode: PdfTextCaseMode) => {
    const input = inputRef.current;
    if (!input || input.disabled || input.readOnly) return;
    let start = input.selectionStart ?? 0;
    let end = input.selectionEnd ?? start;
    if (end <= start) {
      start = 0;
      end = input.value.length;
    }
    const value = input.value;
    const before = value.slice(start, end);
    const after = mode === "halfWidth" ? toHalfWidth(before)
      : mode === "fullWidth" ? toFullWidth(before)
      : transformCase(before, mode);
    // The menu keeps the keyboard until it has closed: the words are typed
    // over once it has given it back (a focus asked for while it is open
    // does not take, and the edit landed at the old caret).
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const field = inputRef.current;
      if (!field || field !== input || field.value !== value || field.disabled || field.readOnly) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange(start, end);
      if (after !== before) editInputSelection(after, true);
    }));
  };
  /** The selected text as the run holds it: a source paragraph's rows are
   * shown with breaks its text does not have. */
  const selectedInputText = (): string => {
    const input = inputRef.current;
    if (!input) return "";
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (end <= start) return "";
    return activeInputLayout
      ? replacementText.slice(
          pdfNativeTextInputCanonicalOffset(activeInputLayout, start),
          pdfNativeTextInputCanonicalOffset(activeInputLayout, end),
        )
      : input.value.slice(start, end);
  };
  const copyInputSelection = async (): Promise<boolean> => {
    // A block selected as an object copies the whole of its text.
    const text = objectSelectedRef.current ? replacementText : selectedInputText();
    if (!text) return false;
    inputRef.current?.focus({ preventScroll: true });
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = inputRef.current;
      const whole = objectSelectedRef.current && input !== null;
      // The browser's copy takes the input's selection: all of it for a block.
      if (whole) input.setSelectionRange(0, input.value.length);
      const copied = typeof document.execCommand === "function" && document.execCommand("copy");
      if (whole) input.setSelectionRange(input.value.length, input.value.length);
      if (copied) return true;
      toast({
        description: translate("pdf.nativeTextEdit.clipboardWriteBlocked", {
          shortcut: formatOfficeShortcut("Mod+C"),
        }),
      });
      return false;
    }
  };
  const pasteIntoInput = async () => {
    let text: string | null = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = null;
    }
    if (text === null) {
      inputRef.current?.focus({ preventScroll: true });
      if (!(typeof document.execCommand === "function" && document.execCommand("paste"))) {
        toast({
          description: translate("pdf.nativeTextEdit.clipboardReadBlocked", {
            shortcut: formatOfficeShortcut("Mod+V"),
          }),
        });
      }
      return;
    }
    if (text) editInputSelection(text.replace(/\r\n?/g, "\n"));
  };
  const openTextContextMenu = (x: number, y: number) => {
    const input = inputRef.current;
    if (!input) return;
    setTextContextMenu(objectSelectedRef.current
      ? { x, y, selected: true, block: true }
      : { x, y, selected: (input.selectionEnd ?? 0) > (input.selectionStart ?? 0) });
  };
  // A block only moved shows its own glyphs where its frame went (the lift,
  // then the moved candidate): the caret is placed on them, the source's
  // geometry shifted by the move. Without it the input's own caret showed,
  
  
  const movedSourceCaret = !composing && !layoutFallbackActive && draftDirty && moveOnlyDraft &&
    moveStartFrame !== null && effectiveLayoutRect !== null && Math.abs(normalizeBoxAngle(layoutAngle)) <= 0.01 &&
    sourceGeometry?.text === replacementText &&
    !(exactPreviewIsCurrent && candidateGeometry?.text === replacementText);
  const caretShiftX = movedSourceCaret ? (effectiveLayoutRect!.x - moveStartFrame!.x) * pageWidthPixels : 0;
  const caretShiftY = movedSourceCaret ? (effectiveLayoutRect!.y - moveStartFrame!.y) * pageHeightPixels : 0;
  // The layer the reader sees is the one the caret and the selection are
  // drawn by: over an exact candidate, its own glyphs (the geometry the
  // canvas was drawn with, nativeEditingSurface textGeometry) or nothing --
  // never the draft hidden under it, laid out by the browser in other rows
  // (a word set larger and wrapped: its selection was painted where the word
  // stood before; owner 10-27/10-28). A candidate is that layer as the
  // layers' effect shows it (showsCandidate), and where the editor has no
  // surface of its own and the candidate is published on the page instead.
  const candidateLayerShown = showsCandidate ||
    (editingSurfaceStatus === "unavailable" && draftDirty && !visualDraftVisible &&
      exactPreviewIsCurrent && publishedPreviewCanvasRef.current !== null);
  const candidateLayerGeometry = candidateLayerShown && candidateGeometry?.text === replacementText
    ? candidateGeometry : null;
  const caretSource = composing ? null : hoverExactShown && hoverExactGeometry ? hoverExactGeometry
    : candidateLayerShown ? candidateLayerGeometry
    : layoutFallbackActive ? null : draftDirty
    ? exactPreviewIsCurrent && candidateGeometry?.text === replacementText ? candidateGeometry
      : movedSourceCaret ? sourceGeometry ?? null : null
    : sourceGeometry?.text === replacementText ? sourceGeometry : null;
  const nativeCaretGeometry = useMemo(()=>{
    const matrix=initialLayout?.pdfToCssTransform;
    if(!caretSource||!matrix||matrix.length!==6||!initialLayout.pageWidthPx||!initialLayout.pageHeightPx)return null;
    const sx=pageWidthPixels/initialLayout.pageWidthPx,sy=pageHeightPixels/initialLayout.pageHeightPx;
    return projectPdfTextSourceAppearance(caretSource,[matrix[0]*sx,matrix[1]*sy,matrix[2]*sx,matrix[3]*sy,
      matrix[4]*sx+caretShiftX,matrix[5]*sy+caretShiftY]);
  },[caretSource,caretShiftX,caretShiftY,initialLayout?.pdfToCssTransform,initialLayout?.pageWidthPx,
    initialLayout?.pageHeightPx,pageWidthPixels,pageHeightPixels]);
  // The words' widths do not depend on the frame: any exact glyphs of the
  // text as it now reads measure them -- the page's own while it is
  // untouched, else the newest candidate's (an edited "SQUAE" kept its
  // minimum after the frame moved and the caret geometry was dropped).
  const rewrapMinimumSource = sourceGeometry?.text === replacementText ? sourceGeometry
    : candidateGeometry?.text === replacementText ? candidateGeometry : null;
  const rewrapMinimumGeometry = useMemo(() => {
    const matrix = initialLayout?.pdfToCssTransform;
    if (!rewrapMinimumSource || !matrix || matrix.length !== 6 || !initialLayout.pageWidthPx || !initialLayout.pageHeightPx) return null;
    const sx = pageWidthPixels / initialLayout.pageWidthPx, sy = pageHeightPixels / initialLayout.pageHeightPx;
    return projectPdfTextSourceAppearance(rewrapMinimumSource,
      [matrix[0] * sx, matrix[1] * sy, matrix[2] * sx, matrix[3] * sy, matrix[4] * sx, matrix[5] * sy]);
  }, [rewrapMinimumSource, initialLayout?.pdfToCssTransform, initialLayout?.pageWidthPx, initialLayout?.pageHeightPx,
    pageWidthPixels, pageHeightPixels]);
  // Text typed that no exact preview has set yet: the browser's measure of
  // its widest unit in the draft's own face.
  const draftFontForMeasure = `${inlineTypographyStyle.fontStyle ?? "normal"} ${inlineTypographyStyle.fontWeight ?? "400"} ${
    String(inlineTypographyStyle.fontSize ?? "")} ${String(inlineTypographyStyle.fontFamily ?? "sans-serif")}`;
  const browserWidestUnit = useMemo(
    () => (rewrapMinimumGeometry ? 0 : widestBrowserTextUnit(replacementText, draftFontForMeasure)),
    [rewrapMinimumGeometry, replacementText, draftFontForMeasure],
  );
  rewrapMinimumWidthRef.current = initialLayout && pageWidthPixels > 0
    ? (() => {
        if (!rewrapMinimumGeometry) return browserWidestUnit > 0 ? (browserWidestUnit + 2) / pageWidthPixels : 0;
        const lineLeft = Math.min(...rewrapMinimumGeometry.characters.flatMap((character) =>
          [character.quad[0], character.quad[2], character.quad[4], character.quad[6]]));
        const inset = Number.isFinite(lineLeft) ? Math.max(0, lineLeft - initialLayout.box.x * pageWidthPixels) : 0;
        const widest = pdfTextWidestUnbreakableExtent(rewrapMinimumGeometry);
        // One pixel of slack: a frame exactly the word's width is a tie the
        // rewrite may break either way.
        return widest > 0 ? (widest + inset + 1) / pageWidthPixels : 0;
      })()
    : 0;
  // Between a keystroke and the exact preview the draft is what is seen; when
  // it sets placeholders the textarea cannot, its boxes place the caret.
  const heldDraftCaret = draftCaretGeometryRef.current;
  const drawnCaretGeometry = nativeCaretGeometry ?? (candidateLayerShown ? null :
    (draftCaretDrawn && heldDraftCaret && heldDraftCaret.text === displayedInputValue ? heldDraftCaret : null));
  // Whether the caret is drawn (not the textarea's): steady while keys are
  // typed, the boxes of each key reaching the caret after the render.
  const draftCaretShown = !nativeCaretGeometry && !candidateLayerShown && draftCaretDrawn;
  const drawsCaret = Boolean(nativeCaretGeometry) || draftCaretShown;
  candidateLayerShownRef.current = candidateLayerShown;
  /** The drawn caret's boxes as they stand now (an event between renders). */
  const currentDrawnCaretGeometry = (): PdfTextSourceAppearance | null =>
    nativeCaretGeometry ?? (candidateLayerShown || !draftCaretDrawn ? null : draftCaretGeometryRef.current);
  // A new token each render: a geometry the layout pass hands the caret
  // holds until the editor renders again.
  const caretRenderToken = {};
  nativeCaretGeometryRef.current = nativeCaretGeometry;
  useEffect(() => {
    if (nativeCaretGeometry === null) measureLayoutRef.current?.();
  }, [nativeCaretGeometry]);
  // Keys pressed on a line whose words are fixed (a Type3 face; words the
  // reader did not read as the page draws them) are told why they write
  // nothing, and any typed while its proof was on the way are taken back
  // when it comes.
  const initialLayoutType3 = Boolean(initialLayout?.type3Text);
  // (A paragraph open as a block for its formats alone is that whatever
  // faces its lines hold -- an emoji's Type3 face among them: it says its
  // own sentence and takes the formats written where its text stands, not a
  // Type3 line's. Opened in the window, the reader's own reading of the page
  // names the Type3 face, and the block said a Type3 line's sentence and
  
  const wordsFixed = wordsByLine ? "unread" as const : initialLayoutType3 ? "type3" as const
    : wordsUnread ? "unread" as const : null;
  // (A box bold by a Type3 show drawn again says what that weight keeps
  // from it until it is taken off.)
  const boldByType3Passes = initialLayout?.wordsFixed === "weight-drawn-again";
  const wordsFixedNotice = wordsFixed === "unread"
    ? translate(wordsByLine ? "pdf.nativeTextEdit.paragraphFormatsOnly" : "pdf.nativeTextEdit.unreadWordsNotEditable")
    : translate(boldByType3Passes ? "pdf.nativeTextEdit.type3BoldFormatsOnly" : "pdf.nativeTextEdit.type3WordsNotEditable");
  const wordsFixedNoticeId = wordsFixed === "unread"
    ? "pdf-native-list-text-edit-words-fixed" : "pdf-native-list-text-edit-type3";
  const type3NoticeAtRef = useRef(0);
  // (Keys are told once in a while, as they come one after another; a frame
  // pulled or a block carried is told each time.)
  const type3WordsSayRef = useRef<(each?: boolean) => void>(() => {});
  type3WordsSayRef.current = (each = false) => {
    const now = Date.now();
    if (!each && now - type3NoticeAtRef.current < 4000) return;
    type3NoticeAtRef.current = now;
    toast({ description: wordsFixedNotice });
  };
  const type3TypedBackRef = useRef(() => {});
  type3TypedBackRef.current = () => {
    if (replacementText === originalText) return;
    updateInputValue(originalText);
    userTextInputStartedRef.current = false;
    type3WordsSayRef.current();
  };
  useEffect(() => {
    if (wordsFixed === null) return;
    type3TypedBackRef.current();
    // Only what would change the words is told so: a character typed,
    // Backspace, Delete, Enter, an input method's key, a paste, a cut. A
    // chord (select all, copy), an arrow, Tab, Escape and a modifier pressed
    // alone change nothing and are told nothing -- select all, pressed to
    
    
    // script made is no KeyboardEvent of this window, and was taken for a
    // paste.)
    const attempted = (event: Event) => {
      if (event.target !== inputRef.current) return;
      if (event.type === "keydown") {
        const { key, metaKey, ctrlKey, altKey } = event as KeyboardEvent;
        if (metaKey || ctrlKey || altKey || typeof key !== "string" ||
          (key.length !== 1 && !["Backspace", "Delete", "Enter", "Process"].includes(key))) return;
      }
      type3WordsSayRef.current();
    };
    window.addEventListener("keydown", attempted, true);
    window.addEventListener("paste", attempted, true);
    window.addEventListener("cut", attempted, true);
    return () => {
      window.removeEventListener("keydown", attempted, true);
      window.removeEventListener("paste", attempted, true);
      window.removeEventListener("cut", attempted, true);
    };
  }, [wordsFixed]);
  // Optimistic activation: the provisional session (proof still pending, no
  // error) accepts typing immediately; adoption preserves the typed text
  // (userTextInputStartedRef) and only the save waits for the proof. That
  // includes the moment between the preparation settling and the host
  // clearing its last "still verifying" reason: a read-only box there
  // silently swallowed the first key of an edit.
  const inputReadOnly = finishRequested !== null || (!acceptedSourceText.verified &&
    Boolean(error) && (!initialLayout?.promoted || !composing));
  /** Delete or cut a block selected as an object: the source text object
   * goes, by the same writer (and Undo) as the ribbon's Delete. */
  const deleteSelectedBlock = () => pressRibbonCommand({ type: "delete" });
  /** The keys of a block selected as an object (WPS's single click): Delete
   * and Backspace remove it, the arrows move it as its frame does, Enter
   * and F2 put the caret in after its text, and a typed key does too, going
   * after the text (键盘输入触发编辑; unticked, the block takes no typing).
   * Copy and cut take the whole block, 全选 its whole text. True when the
   * key was the block's; false leaves it to the line's own keys (Escape,
   * Tab, the format shortcuts). */
  const handleObjectSelectionKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    const input = event.currentTarget;
    if (isNativeTextImeKeydown(event.nativeEvent)) {
      // An input method's first key: its words go after the block's text.
      if (keyboardInputStartsEditing) enterTextEditing();
      return true;
    }
    // A caret put inside the block's own words (a press in the text, an
    // assistive caret) is text editing: Backspace, Delete and the arrows
    
    // Backspace with the caret before a word deleted the whole line and
    // saved it; Shift+arrows moved the block).
    const caretCollapsed = input.selectionStart === input.selectionEnd;
    const caretInside = caretCollapsed &&
      (input.selectionStart ?? 0) > 0 && (input.selectionStart ?? 0) < input.value.length;
    if (caretInside && !event.metaKey && !event.ctrlKey &&
      (event.key === "Backspace" || event.key === "Delete" || event.key.startsWith("Arrow"))) {
      enterTextEditing(input.selectionStart ?? 0, input.selectionEnd ?? 0);
      return false;
    }
    // Shift with an arrow, Home or End extends a selection from the caret,
    // wherever it waits (after the text once a style entered the line):
    // that is text editing. As a block move it nudged the box 3 × 1 % of the
    // page while the reader meant to select the last characters, and the
    
    if (caretCollapsed && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey &&
      (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")) {
      enterTextEditing(input.selectionStart ?? 0, input.selectionEnd ?? 0);
      return false;
    }
    const command = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
      ? event.key.toLowerCase() : null;
    if (command === "a") {
      event.preventDefault();
      enterTextEditing(0, input.value.length);
      return true;
    }
    if (command === "c" || command === "x") {
      event.preventDefault();
      void copyInputSelection().then((copied) => {
        if (copied && command === "x") deleteSelectedBlock();
      });
      return true;
    }
    if (command === "v") {
      // The paste goes after the block's text, as a typed key does.
      if (keyboardInputStartsEditing) enterTextEditing();
      else event.preventDefault();
      return true;
    }
    // Cmd+Up / Cmd+Down (macOS's Ctrl+Home / Ctrl+End) are the block's as Home
    // and End below are: the caret already waits after the words, so the
    // browser had nothing to move and scrolled the file to its last page
    // instead -- under a line whose proof was still being read, that ended
    
    if (pdfTextEdgeKey(event)) {
      event.preventDefault();
      return true;
    }
    if (event.metaKey || event.ctrlKey) return false;
    if ((event.key === "Delete" || event.key === "Backspace") && !event.altKey) {
      event.preventDefault();
      deleteSelectedBlock();
      return true;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      handleLayoutControlKeyDown("move", event);
      return true;
    }
    if (["Home", "End", "PageUp", "PageDown"].includes(event.key) ||
      (event.key === "Enter" && event.shiftKey)) {
      event.preventDefault();
      return true;
    }
    const textKey = officeObjectTextKey(event);
    if (textKey?.kind === "edit") {
      event.preventDefault();
      enterTextEditing();
      return true;
    }
    if (textKey?.kind === "type") {
      // The key itself types at the caret, which waits after the text.
      if (keyboardInputStartsEditing) enterTextEditing();
      else event.preventDefault();
      return true;
    }
    return false;
  };
  const input = (
    <textarea
      ref={inputRef}
      className={drawsCaret || candidateLayerShown ? sourceCaretStyles.nativeSelection : undefined}
      data-pdf-native-exact-caret={nativeCaretGeometry?"true":undefined}
      data-pdf-native-draft-caret={draftCaretShown?"true":undefined}
      value={displayedInputValue}
      maxLength={2_000 + (activeInputLayout?.breaks.length ?? 0)}
      rows={1}
      wrap="soft"
      // Never disabled under the reader: a write or a check running keeps
      
      // Optimistic activation: the provisional session (proof still pending,
      // no error) accepts typing immediately; adoption preserves the typed
      // text (userTextInputStartedRef) and only the save waits for the proof.
      // That includes the moment between the preparation settling and the
      // host clearing its last "still verifying" reason: a read-only box
      // there silently swallowed the first key of an edit.
      // A block selected as an object with 键盘输入触发编辑 unticked takes no
      // typing (nor an input method's) until the caret is put in.
      // A Type3 face's words stay (and words the reader did not read as
      // drawn); the input still selects the part a format is set on (a
      // read-only input also takes no input method).
      readOnly={inputReadOnly || wordsFixed !== null || (objectSelected && !keyboardInputStartsEditing)}
      aria-busy={preparationPending && !initialLayout?.promoted}
      data-testid="pdf-native-list-text-edit-input"
      // Drawn on the page's glyphs, its selection is painted by the source
      // caret, held there while a ribbon list has the focus; the shared
      // ghost would paint a second band in the box's own layout.
      {...{ [OFFICE_INACTIVE_SELECTION_SELF_PAINTED_ATTRIBUTE]: drawsCaret ? "true" : undefined }}
      data-pdf-native-text-format-preview={formatPreviewShown ? "true" : undefined}
      data-pdf-native-text-object-selected={objectSelected ? "true" : undefined}
      data-pdf-native-text-inline-input={ownsInlineHost ? "true" : undefined}
      aria-label={labels.field}
      aria-invalid={displayedError || previewError ? true : undefined}
      aria-describedby={[
        "pdf-native-list-text-edit-geometry",
        wordsFixed !== null ? wordsFixedNoticeId : null,
        displayedError ? "pdf-native-list-text-edit-error" : null,
        effectiveApplyDisabledReason && !displayedError && !submitting
          ? "pdf-native-list-text-edit-disabled-reason"
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onInput={(event) => {
        // A key the browser inserted and React then wrote over (see
        // nativeInputSnapshotRef): onChange never fires for it, so the
        // edit is taken from what the browser really held.
        const snapshot = nativeInputSnapshotRef.current;
        nativeInputSnapshotRef.current = null;
        const input = event.currentTarget;
        if (!snapshot || composingRef.current || snapshot.value === input.value) return;
        setFinishRequested(null);
        setCommitError(null);
        retirePendingPreview();
        setPreviewError(null);
        updateInputValue(snapshot.value);
        // After the edit, which drops any caret held for an earlier one:
        // set before it, the key's caret was dropped too, and the value
        
        // after 「CHANGE 」, the O and W after 「2023」).
        pendingSourceCaretRef.current = null;
        pendingProjectedCaretRef.current = { start: snapshot.start, end: snapshot.end, direction: "none" };
      }}
      onChange={(event) => {
        if (!composingRef.current) {
          const inputType = event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : "";
          recordTextHistory(sourceInputBeforeEditRef.current ??
            { value: displayedInputValue, start: displayedInputValue.length, end: displayedInputValue.length },
            inputType === "insertText" || inputType === "deleteContentBackward" || inputType === "deleteContentForward");
        }
        nativeInputSnapshotRef.current = null;
        setFinishRequested(null);
        setFinishAfterQueuedActions(false);
        setCommitError(null);
        retirePendingPreview();
        setPreviewError(null);
        updateInputValue(event.currentTarget.value);
      }}
      onCompositionStart={() => {
        // An input method begun on a block selected as an object writes at
        // its caret, after its text: the caret is in from here on.
        if (objectSelectedRef.current) {
          objectSelectedRef.current = false;
          setObjectSelected(false);
        }
        compositionOriginalTextRef.current = replacementText;
        const input = inputRef.current;
        compositionHistoryStartRef.current = input ? {
          value: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length,
        } : null;
        setFinishRequested(null);
        retirePendingPreview();
        composingRef.current = true;
        setComposing(true);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        // The composition is one step of the line's history.
        const begun = compositionHistoryStartRef.current;
        compositionHistoryStartRef.current = null;
        if (begun && begun.value !== (inputRef.current?.value ?? begun.value)) recordTextHistory(begun, false);
        updateInputValue(event.currentTarget.value, compositionOriginalTextRef.current ?? replacementText);
        compositionOriginalTextRef.current = null;
        setComposing(false);
      }}
      onSelect={() => syncPartialRangeRef.current?.()}
      onPointerUp={() => syncPartialRangeRef.current?.()}
      onKeyUp={() => syncPartialRangeRef.current?.()}
      onPointerDown={(event) => {
        if (objectSelected) {
          // A block selected as an object (WPS): a press places no caret
          // (a double click does) and a drag moves the block, as its frame
          // band does.
          event.preventDefault();
          if (event.button === 0) pressSelectedBlock(event);
          stopNativeTextGesture(event);
          return;
        }
        // A right press over drawn glyphs keeps the selection it lands in:
        // the textarea's own layout is not the page's, so its native caret
        // move would land elsewhere. The menu places the caret itself.
        if (event.button === 2 && drawsCaret) event.preventDefault();
        stopNativeTextGesture(event);
      }}
      onMouseDown={(event) => {
        if (objectSelected) event.preventDefault();
        stopNativeTextGesture(event);
      }}
      onClick={stopNativeTextGesture}
      onDoubleClick={(event) => {
        // A paragraph open as a block for its formats alone: its words are
        // the line's under the press, which the window opens in its place.
        // (Whether the block is still selected as an object or not: only the
        // press the reader noted before the editor came up was handed on,
        
        
        if (wordsByLine && onOpenLineOfBlock) {
          event.preventDefault();
          onOpenLineOfBlock({ clientX: event.clientX, clientY: event.clientY });
          return;
        }
        if (!objectSelected) return;
        // WPS: a double click on the selected block puts the caret in where
        // it lands (a word is not selected).
        event.preventDefault();
        const bounds = event.currentTarget.closest<HTMLElement>(".pdf-viewer__page")?.getBoundingClientRect();
        const offset = bounds && bounds.width > 0 && bounds.height > 0
          ? caretOffsetAtPoint({
              x: (event.clientX - bounds.left) / bounds.width,
              y: (event.clientY - bounds.top) / bounds.height,
            })
          : null;
        enterTextEditing(offset ?? undefined);
      }}
      onContextMenu={(event) => {
        // The text's own menu (WPS), never the browser's or the page's.
        event.preventDefault();
        event.stopPropagation();
        const input = event.currentTarget;
        const bounds = input.closest<HTMLElement>(".pdf-viewer__page")?.getBoundingClientRect();
        // A block selected as an object keeps its hidden caret: the menu's
        // commands take the whole block.
        if (!objectSelected && drawsCaret && bounds && bounds.width > 0 && bounds.height > 0) {
          // Word and WPS move the caret to a right click outside the
          // selection, and keep a selection the click lands in.
          const offset = sourceCaretControllerRef.current?.offsetAtPoint({
            x: (event.clientX - bounds.left) / bounds.width,
            y: (event.clientY - bounds.top) / bounds.height,
          });
          if (offset != null && (input.selectionStart === input.selectionEnd ||
            offset < input.selectionStart || offset > input.selectionEnd)) {
            input.setSelectionRange(offset, offset);
          }
        }
        openTextContextMenu(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        // A read-only input (its finish asked for, a Type3 face's words) takes
        // no space: left to the browser, a space in it scrolled the page a
        
        if (event.currentTarget.readOnly && event.key === " " && !event.metaKey && !event.ctrlKey) event.preventDefault();
        if (objectSelected && !composingRef.current && handleObjectSelectionKeyDown(event)) return;
        if (composingRef.current || isNativeTextImeKeydown(event.nativeEvent)) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          // One level at a time (leaveOnEscape): typing, the block takes the
          // selection; the block selected, the line is left and Edit
          // Content stays. What was typed is kept and its write goes on.
          if (objectSelected) requestLeave();
          else escapeToBlock();
          return;
        }
        // Match the existing PdfTextBoxOverlay's frame-local Home/End
        // contract. On macOS the browser otherwise scrolls the outer PDF to
        // its first/last page, invalidating an in-flight source selection.
        // Cmd+Up / Cmd+Down are the same keys on macOS: with the caret already
        // at that end the browser moved nothing and scrolled the file to its
        // first or last page.
        const edgeKey = event.altKey ? null : event.key === "Home" ? "start" : event.key === "End" ? "end"
          : pdfTextEdgeKey(event);
        if (edgeKey) {
          event.preventDefault();
          const input = event.currentTarget;
          const offset = edgeKey === "start" ? 0 : input.value.length;
          const anchor = input.selectionDirection === "backward"
            ? input.selectionEnd : input.selectionStart;
          input.setSelectionRange(
            event.shiftKey ? Math.min(anchor, offset) : offset,
            event.shiftKey ? Math.max(anchor, offset) : offset,
            event.shiftKey && offset < anchor ? "backward" : "forward",
          );
          return;
        }
        // The input holds a paragraph the PDF draws on several rows as one
        // line, so the browser's own Up/Down jumped to the paragraph's ends
        
        // Shift+Up/Down) move to the neighbouring drawn row instead.
        if (
          (event.key === "ArrowUp" || event.key === "ArrowDown") &&
          !event.altKey && !event.ctrlKey && !event.metaKey &&
          currentDrawnCaretGeometry()?.text === event.currentTarget.value
        ) {
          const drawnNow = currentDrawnCaretGeometry()!;
          const input = event.currentTarget;
          const backward = input.selectionDirection === "backward";
          const focus = backward ? input.selectionStart : input.selectionEnd;
          const anchor = backward ? input.selectionEnd : input.selectionStart;
          const previous = verticalCaretGoalRef.current;
          const target = pdfSourceVerticalCaretOffset(
            drawnNow,
            focus,
            event.key === "ArrowUp" ? -1 : 1,
            previous?.offset === focus ? previous.goal : undefined,
          );
          if (target) {
            event.preventDefault();
            verticalCaretGoalRef.current = target;
            if (event.shiftKey) {
              input.setSelectionRange(
                Math.min(anchor, target.offset),
                Math.max(anchor, target.offset),
                target.offset < anchor ? "backward" : "forward",
              );
            } else {
              input.setSelectionRange(target.offset, target.offset);
            }
            return;
          }
        }
        // The menu key and Shift+F10 open the text's own menu at the box.
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          openTextContextMenu(rect.left + 8, rect.bottom);
          return;
        }
        // The line's own history (stepLineHistory); the browser's own undo
        // is left what it still holds when the history has nothing.
        if ((event.metaKey || event.ctrlKey) && !event.altKey) {
          const key = event.key.toLowerCase();
          const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
          if (key === "z" && !event.shiftKey && pageTakesUndo?.()) {
            event.preventDefault();
            return;
          }
          if (((key === "z" && !event.shiftKey) || redo) && stepLineHistory(redo ? "redo" : "undo")) {
            event.preventDefault();
            return;
          }
        }
        const officeShortcut =
          (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
        if (officeShortcut) {
          const shortcut = event.key.toLowerCase();
          // The shortcut runs what its button runs, when the button would
          // (held, like the button, while the line's proof is on its way).
          if (shortcut === "b" || shortcut === "i") {
            event.preventDefault();
            pressRibbonCommand({ type: "toggle", control: shortcut === "b" ? "bold" : "italic" });
            return;
          }
          if (shortcut === "s") {
            event.preventDefault();
            requestFinish();
            return;
          }
          // Underline runs what its button runs: a rule written with the
          // run's own formats (the selected part, else the run), or a text
          // box's own underline. It did nothing on a page line -- written
          // when this was a separate unproven write -- and a line given
          // italic and underline was saved with the italic alone, without a
          
          if (shortcut === "u") {
            event.preventDefault();
            pressRibbonCommand({ type: "toggle", control: "underline" });
            return;
          }
        }
        // Enter starts a new line in the text (WPS); the line is finished by
        // a click outside it or Escape. Ctrl/Cmd+Enter still finishes.
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          requestFinish();
        }
      }}
      spellCheck={false}
      style={
        ownsInlineHost
          ? {
              position: "absolute",
              inset: 0,
              zIndex: 2,
              // The frame is pass-through; the textarea must explicitly own
              // its interior so clicks place the caret, not resize/reselect.
              pointerEvents: "auto",
              // A block selected as an object moves by its body (WPS).
              cursor: objectSelected ? "move" : "text",
              boxSizing: "content-box",
              width: layoutFallbackActive && effectiveLayoutRect ? `${effectiveLayoutRect.width * pageWidthPixels / reflowScale / wrappedScaleX}px` : "100%",
              height: layoutFallbackActive && effectiveLayoutRect
                ? `${Math.max(0, effectiveLayoutRect.height * pageHeightPixels / reflowScale - draftVerticalOffsetPx)}px` : "100%",
              minWidth: 0,
              minHeight: 0,
              margin: 0,
              padding: 0,
              // Its caret over the rows the draft draws (Align Text).
              ...(draftVerticalOffsetPx > 0 ? { paddingTop: `${draftVerticalOffsetPx}px` } : {}),
              border: 0,
              borderRadius: 0,
              outline: "none",
              // Demo-safe policy: the native input owns value, selection, IME,
              // and keyboard semantics only. Visible glyphs remain on the
              // authenticated source/exact candidate canvases so an approximate
              // CSS font or solid cover can never flash or expose old ink.
              background: "transparent",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: finishRequested !== null || submitting || drawsCaret || objectSelected || candidateLayerShown
                ? "transparent" : "var(--console-accent-strong, #0f766e)",
              ...inlineTypographyStyle,
              transform: nativeCaretGeometry ? undefined : initialLayout
                ? sourceLineTransform
                : inlineTypographyStyle.transform,
              transformOrigin: initialLayout
                ? sourceLineTransformOrigin
                : inlineTypographyStyle.transformOrigin,
              appearance: "none",
              resize: "none",
              overflow: "hidden",
              ...(preserveSourceSingleLine || activeInputLayout || growsAsOneLine
                ? { whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal" } as const
                : PDF_BROWSER_TEXT_WRAP),
            }
          : { display: "none" }
      }
    />
  );
  // Bold and italic rewrite the whole source run's font. With part of the
  
  // prove yet: the run is left as it is and the limit is said, instead of
  
  const partialTextSelection = (): boolean => {
    const input = inputRef.current;
    if (!input) return false;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (end <= start) return false;
    const trimmedStart = input.value.search(/\S/);
    const trimmedEnd = input.value.replace(/\s+$/, "").length;
    return start > Math.max(0, trimmedStart) || end < trimmedEnd;
  };
  // The selection as a range of the run's text (not the input's display of
  // a paragraph's rows), when it is part of the text only.
  const partialTextRange = (): { start: number; end: number } | null => {
    const input = inputRef.current;
    if (!input || !partialTextSelection()) return null;
    const toText = (offset: number) => activeInputLayout
      ? pdfNativeTextInputCanonicalOffset(activeInputLayout, offset) : offset;
    const start = toText(input.selectionStart ?? 0);
    const end = toText(input.selectionEnd ?? 0);
    return end > start ? { start, end } : null;
  };
  // The ribbon reads the part selected (partialRange) as soon as it is
  // selected. React's onSelect alone missed a mouse drag that focused the
  // box as it began (Safari: the words were highlighted, the ribbon read the
  
  // so the selection is read again on the pointer's release, on a key's
  // release and on the document's own selectionchange.
  const syncPartialRange = () => {
    const next = partialTextRange();
    setPartialRange((current) =>
      current?.start === next?.start && current?.end === next?.end ? current : next);
    const input = inputRef.current;
    const at = input?.selectionStart;
    const caret = input && typeof at === "number" && at === input.selectionEnd
      ? activeInputLayout ? pdfNativeTextInputCanonicalOffset(activeInputLayout, at) : at
      : null;
    setCaretAt((current) => (current === caret ? current : caret));
  };
  syncPartialRangeRef.current = syncPartialRange;
  // What a part's fields mean when a segment leaves them out: the run's own.
  const segmentBase: PdfNativeTextSegmentFields | null = properties && propertyProof
    ? {
        fontResourceName: properties.fontResourceName,
        fontSize: properties.fontSize,
        color: properties.color,
        syntheticBold: Boolean(properties.syntheticBold ?? originalSyntheticBold),
        slanted: pdfNativeTextMatrixIsSlanted(properties.textMatrixLinear ?? propertyProof.original.textMatrixLinear),
        textRise: properties.textRise ?? propertyProof.original.textRise ?? 0,
        characterSpacing: properties.characterSpacing,
      }
    : null;
  const withSegments = (
    draft: PdfNativeTextPropertyDraft,
    segments: PdfNativeTextPropertyDraft["segments"],
  ): PdfNativeTextPropertyDraft => {
    if (segments?.length) return { ...draft, segments };
    const { segments: _dropped, ...rest } = draft;
    void _dropped;
    return rest;
  };
  /** A format put on part of the run (WPS): that part becomes a segment of
   * the draft; false when the line cannot take one (a text box, no proof). */
  const applyPartialFormat = (
    range: { start: number; end: number },
    fields: PdfNativeTextSegmentFields,
  ): boolean => {
    if (!properties || !segmentBase) {
      if (!propertyPressAskedRef.current) toast({ description: translate("pdf.nativeTextEdit.partialFormatUnavailable") });
      return false;
    }
    setProperties(withSegments(properties,
      applyPdfNativeTextSegmentFormat(properties.segments ?? [], range, fields, segmentBase)));
    return true;
  };
  /** The format a part of the run has: each field's one value, or "mixed". */
  const partialFormatOf = (range: { start: number; end: number }) =>
    segmentBase ? pdfNativeTextSegmentFieldsAt(properties?.segments ?? [], range, segmentBase) : null;
  const partialFace = (range: { start: number; end: number }) => {
    const fields = partialFormatOf(range);
    const name = typeof fields?.fontResourceName === "string" ? fields.fontResourceName : properties?.fontResourceName;
    return propertyProof?.fonts.find((font) => font.resourceName === name) ?? embeddedFontOption(name) ?? editableFont;
  };
  /** The run set whole in a family the PDF holds no face of, in a style:
   * the stroke and slant the run had in place of a style give way to the
   * family's own (or to the planner's, where it has none). */
  const withEmbeddedRunFont = (
    draft: PdfNativeTextPropertyDraft,
    family: string,
    bold: boolean,
    italic: boolean,
  ): PdfNativeTextPropertyDraft =>
    nativeTextWithEmbeddedRunFont(propertyProof, draft, family, bold, italic, originalSyntheticBold);
  // A family from All Fonts or Recently Used that MRAI does not serve (a
  // font only the reader's machine has): nothing changes, and why is said.
  const sayFontNotEmbeddable = (family: string) => {
    if (propertyPressAskedRef.current) return;
    toast({
      description: translate("pdf.nativeTextEdit.fontNotEmbeddable", {
        family: ribbonFontFamilyLabel(family),
      }),
    });
  };
  /** The served family a bold-only face's run is set in when its bold comes
   * off (lib/pdf/native-text-format-draft.ts). */
  const servedRegularFamilyFor = (face: NativeTextFace): string => nativeTextServedRegularFamily(face);
  const partialBold = (range: { start: number; end: number }) =>
    faceReadsBold(partialFace(range)) || partialFormatOf(range)?.syntheticBold === true;
  const partialItalic = (range: { start: number; end: number }) =>
    faceReadsItalic(partialFace(range)) || partialFormatOf(range)?.slanted === true;
  const selectStyle = (bold: boolean, italic: boolean) => {
    if (!propertyProof || !properties || !editableFont) return;
    const range = partialTextRange();
    if (range) {
      // The part's own face's family: its bold or italic form when the PDF
      // has one, else the style drawn in place on that part.
      const face = partialFace(range) ?? editableFont;
      const wantBold = bold !== currentBold ? !partialBold(range) : partialBold(range);
      const wantItalic = italic !== currentItalic ? !partialItalic(range) : partialItalic(range);
      // A family the PDF holds no face of takes the style as its own face's
      // (its served bold or italic, else drawn in place by the planner).
      if (isPdfNativeEmbeddedFontKey(face.resourceName)) {
        applyPartialFormat(range, {
          fontResourceName: pdfNativeEmbeddedFontKey({ family: face.family, bold: wantBold, italic: wantItalic }),
          syntheticBold: false,
          slanted: false,
        });
        return;
      }
      // The face of the part's family that draws the style asked: one of
      // the PDF's own that has no style the part is not to have, else (a
      // bold or an italic of the face's own, with no face of its family
      // without it) a served face, installed (nativeTextStyledFace). The
      // part's own face first: a family the page holds in two bold faces
      // (BlackCn, BoldCn) kept its black one when only the slant changed,
      
      const styled = nativeTextStyledFace(propertyProof.fonts, face, { bold: wantBold, italic: wantItalic });
      if ("served" in styled) {
        applyPartialFormat(range, { fontResourceName: styled.served, syntheticBold: false, slanted: false });
        return;
      }
      // Leaned after text of its line, a part reads back to pdf.js as a new
      // line and the space before it is lost (「CLIMATECHANGE」): with no
      // italic face of its family, it is set in a served italic one.
      // A part the served italic face draws none of (Chinese text) is leaned
      // on its own face, as WPS leans it: set in the served face it drew
      // nothing, and the edit was refused ("sets no text in an installed
      
      const lineStart = replacementText.lastIndexOf("\n", Math.max(0, range.start - 1)) + 1;
      if (styled.slanted && /\S/u.test(replacementText.slice(lineStart, range.start)) &&
        nativeTextServedFaceDrawsAny(replacementText.slice(range.start, range.end))) {
        applyPartialFormat(range, {
          fontResourceName: pdfNativeEmbeddedFontKey({ family: servedRegularFamilyFor(face), bold: wantBold, italic: true }),
          syntheticBold: false,
          slanted: false,
        });
        return;
      }
      if (styled.syntheticBold && !pdfNativeSyntheticBoldDrawable(propertyProof.original)) {
        if (!propertyPressAskedRef.current) toast({ description: translate("pdf.nativeTextEdit.boldStrokeUnknown") });
        return;
      }
      applyPartialFormat(range, {
        fontResourceName: styled.face.resourceName,
        syntheticBold: styled.syntheticBold,
        slanted: styled.slanted,
      });
      return;
    }
    // The face that draws as much of the style as the PDF has faces for;
    // what it lacks is drawn in place: a bold as a stroke, an italic as a
    // slant. A bold or an italic of the face's own that no face of its
    // family in the PDF is without comes off into a served face, as WPS
    // sets the run in a system face (lib/pdf/native-text-format-draft.ts).
    const styled = nativeTextStyledDraft({
      proof: propertyProof, draft: properties, editableFont, originalSyntheticBold, bold, italic,
    });
    // A press that leaves the run as it stands has no way to be written:
    // said, and the buttons and the draft go back (refusePartPress). The
    // press was recorded on the draft meanwhile (partFormats), so the button
    // came up and the words stood upright with nothing to write, and the
    // line was left as it was without a word (pdf-walk-1000 0686).
    if (!styled || samePropertyDraftValues(styled, properties)) {
      if (!propertyPressAskedRef.current) refusePartPress();
      return;
    }
    setProperties(styled);
  };

  const propertyControlsBusy = busy || submitting;
  // The line's proof is on its way (the first half second after a click):
  // the queueable commands take clicks meanwhile and run when it lands.
  // A write of the line still in flight (busy) holds the commands the same
  
  
  const formatProofPending = (preparationPending || unverifiedNativeSource || busy) &&
    !preparationFailed && !error;
  /** The line's proof still on its way: the editor is shown whole, its held
   * commands offered (shownRibbonCapabilities), its presses run once the
   * proof lands. */
  const awaitingProof = preparationPending && !preparationFailed && !error;
  // A change made to the block selected as an object (moved, resized,
  // turned, a format pressed on the whole block) is written as soon as it is
  // made, the block staying selected, as ONLYOFFICE keeps it (its model takes
  // every change at once): it used to wait, 「未保存」, until the line was
  // left. Written once the block has been still for a moment, so a run of
  // presses or a drag in steps is one write (the Escape path: the line opens
  // again on the new revision with its block selected).
  // (Not a paragraph open as a block for its formats alone: the box the
  // reader would open again in its place is the line it was asked from, and
  // on the revision the write makes that line is no box of its own -- the
  // paragraph is one again. The reader opened the line queued on the page as
  // shown, nothing took it over, and the box, with no proof to come, held
  
  // formats are written when it is left, one write for all that was pressed.)
  const selectedBlockDraftKey =
    objectSelected && draftDirty && !layoutDrag && !busy && !submitting && !composing &&
    !formatProofPending && finishRequested === null && !deletesOnLeave && !wordsByLine
      ? `${finishDraftKey}\u0000${JSON.stringify(rowFormat)}`
      : null;
  const commitSelectedBlockRef = useRef(escapeToBlock);
  commitSelectedBlockRef.current = escapeToBlock;
  useEffect(() => {
    if (!selectedBlockDraftKey) return;
    const timer = window.setTimeout(() => {
      if (objectSelectedRef.current && !readerLeftRef.current) commitSelectedBlockRef.current();
    }, SELECTED_BLOCK_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [selectedBlockDraftKey]);
  // What is typed is written once typing pauses, the caret staying in the
  // text: ONLYOFFICE keeps every change at once, and a line typed into and
  
  // typed, the box right-clicked, the page closed -- the words were gone).
  // Written as a leave aimed back at the caret's own place, so the line
  // opens again on the new revision with the caret where it was.
  // Not words the page has already refused (their reason stands in the
  // box): written, refused and opened again, a line typed past the room
  // its form gives it closed and reopened every five seconds, the caret
  
  // reader, who changes them or leaves the line.
  const typingDraftKey =
    !objectSelected && draftDirty && !layoutDrag && !busy && !submitting && !composing &&
    !formatProofPending && finishRequested === null && !deletesOnLeave && !finishPendingRef.current &&
    previewError === null && replacementText.trim().length > 0
      ? `${finishDraftKey}\u0000${replacementText}`
      : null;
  /** 转换为公式 was pressed and the window is making the line a formula
   * box: its words are the box's now. */
  const convertingToFormulaRef = useRef(false);
  const commitTypingDraft = () => {
    const own = returnFocusRef.current;
    if (!own?.isConnected || objectSelectedRef.current || composing || draftHandedOver() || readerLeftRef.current) return;
    // The pause after typing does not write the words into the line while
    // it is being made a box: pressed a few seconds after the last key, the
    // two ran together -- the line was written and closed first and the
    // conversion found no line (the page kept the LaTeX as its text), or the
    
    if (convertingToFormulaRef.current) return;
    const caret = own.ownerDocument.querySelector<SVGElement>('svg[data-pdf-native-source-caret="true"]')
      ?.getBoundingClientRect();
    const box = own.getBoundingClientRect();
    const point = caret && caret.width + caret.height > 0
      ? { clientX: caret.left + caret.width / 2, clientY: caret.top + caret.height / 2 }
      : { clientX: box.right - 1, clientY: box.top + box.height / 2 };
    settleNextTextTarget(false);
    nextTextTargetRef.current = captureNextTextTarget?.(own, point, { caret: true }) ?? null;
    restoreFocusOnCloseRef.current = false;
    leavingToReopenRef.current = true;
    requestLeave();
  };
  const commitTypingDraftRef = useRef(commitTypingDraft);
  commitTypingDraftRef.current = commitTypingDraft;
  useEffect(() => {
    if (!typingDraftKey) return;
    const timer = window.setTimeout(() => commitTypingDraftRef.current(), TYPING_DRAFT_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typingDraftKey]);
  const managedTypographyEditable = managedLayoutTypography &&
    !preparationPending && Number.isFinite(managedSizeBaseline) && managedSizeBaseline > 0;
  const managedFontOptions = TEXTBOX_FONT_FAMILY_OPTIONS.filter(option => {
    // CJK export is the shipped regular sans program; the original overlay's
    // serif/fallback choice must not become a misleading native font promise.
    const latin = isPortableNativeTextBoxTypography(replacementText, "mono", true, true);
    return (latin ? ["helvetica", "times", "courier"].includes(option.id) : option.id === "cjkSans") &&
      isPortableNativeTextBoxTypography(replacementText, classifyFontName(option.sourceFontName), managedBold, managedItalic);
  });
  const managedActiveFont = managedFontOption ?? managedFontOptions.find(option =>
    classifyFontName(option.sourceFontName) === managedFontClass);
  // A face of the family in the other weight or posture, else the style
  // drawn in place: a bold as a stroke (when the stroke width in force is
  // known, so the run after it is stroked as it was), an italic as a slant.
  // A face's own bold or italic is taken off through the face that has it
  // off (one of the PDF's, else a served one); a synthetic one is taken off
  // by filling or standing the run up.
  // (A scanned line's box in one style, coverLaneLine: written whatever its
  // characters, drawn by its rendered appearance where no bundled face has
  // them, so its weight and slant are never greyed -- an Urdu OCR line.)
  const coverBoxOneStyle = unprovenTextBoxFormat && coverLaneLine && managedRuns === null;
  const boldVariantAvailable = Boolean(
    managedTypographyEditable ? managedBold || coverBoxOneStyle || isPortableNativeTextBoxTypography(replacementText, managedFontClass, true, managedItalic) : editableFont &&
    // A family the PDF holds no face of takes either weight (its served
    // bold, or a bold drawn in place).
    // A bold face with no regular sibling in the PDF still comes off: the
    // run is set in the family's served regular face, or in the served
    // family nearest its class (WPS substitutes a system face the same way;
    
    (isPdfNativeEmbeddedFontKey(editableFont.resourceName) || faceReadsBold(editableFont) || propertyProof?.fonts.some(
      (font) =>
        nativeTextSameFamily(font, editableFont) &&
        faceReadsBold(font) !== faceReadsBold(editableFont) &&
        faceReadsItalic(font) === faceReadsItalic(editableFont),
    ) || (!propertyProof ? false : pdfNativeSyntheticBoldDrawable(propertyProof.original))),
  );
  // An italic always goes on (a face of the family, else a slant) and
  // always comes off: into the family's upright face, else, as a bold face's
  // bold does, into a served upright one (nativeTextStyleOffServedFaceKey).
  // It used to stay grey on an italic face with no upright sibling, and on
  // an italic the face's name says only in a TeX code (CMTI12) it was
  // offered, pressed, and wrote nothing (pdf-walk-1000 0686).
  const italicVariantAvailable = Boolean(
    managedTypographyEditable ? managedItalic || coverBoxOneStyle || isPortableNativeTextBoxTypography(replacementText, managedFontClass, managedBold, true) : editableFont,
  );
  // Superscript and subscript ride on the run's `Ts` rise: a positive rise
  // lifts, a negative one drops. Turning either off returns the run to its
  // baseline (native-text-rise.ts).
  // Paper points per Tf unit for the run: the y scale of its text matrix
  // and of the page's transformation matrix around it (a "1 Tf" run under a
  // 150 matrix inside "0.24 0 0 0.24 cm" draws 36 pt glyphs: Word for Mac).
  const nativeTextMatrixScale = nativeTextMatrixScaleOf(propertyProof, properties);
  const nativeDecorations: PdfNativeTextRuleDecorations = nativeTextDecorations ?? {
    underline: false,
    strikethrough: false,
  };
  /** Whether the run carries a rule of `style`, under all of it or part. */
  const ruleStands = (style: "underline" | "strikethrough") =>
    pdfNativeTextRuleRangeOf(nativeDecorations, style) !== null;
  const nativeTextRise =
    properties?.textRise ?? propertyProof?.original.textRise ?? 0;
  const applyNativeTextRise = (control: "superscript" | "subscript") => {
    if (!properties || !propertyProof) return;
    // A run reopened already scripted turns off to the baseline, not back to
    
    setProperties({
      ...properties,
      ...nativeTextRiseToggle(propertyProof.original, nativeTextRise, control),
    });
  };
  // 清除格式 (WPS): back to the default text style -- the default face, 12 pt,
  // black, and no bold, italic, superscript/subscript, underline or
  // strikethrough. The default face is the bundled Noto Sans SC; a run is
  // set in it in place when the page embeds that face, and otherwise keeps
  // its own face at its regular weight (said once). The rules beside the run
  // go in the same write as the rest (dropTextRules); a run whose only format
  // is a rule has them taken away by the rule writer.
  const clearTextFormatting = () => {
    if (managedTypographyEditable) {
      const option = managedFontOptions.find((candidate) => candidate.id === "cjkSans") ??
        managedFontOptions.find((candidate) => candidate.id === "helvetica");
      const baselineClass = classifyFontName(initialLayout?.box.sourceFontName || initialLayout?.box.fontFamily);
      setLayoutTypographyOverride((current) => ({
        ...current,
        ...(option ? {
          fontId: classifyFontName(option.sourceFontName) === baselineClass && !initialManagedOfficeFamily
            ? undefined : option.id,
        } : {}),
        officeFamily: initialManagedOfficeFamily ? null : undefined,
        fontSize: Math.min(NATIVE_TEXT_DEFAULT_POINTS, managedPointHeight),
        bold: false, italic: false, underline: false, strikethrough: false, justify: false,
        color: "#000000",
      }));
      // Every part's own format goes too.
      setManagedRunsState({ text: replacementText, runs: null });
      return;
    }
    if (!properties || !propertyProof) return;
    const { draft: next, keptFace } = nativeTextClearedDraft({
      proof: propertyProof, draft: properties, editableFont, originalSyntheticBold,
    });
    const rules = (["underline", "strikethrough"] as const).filter(ruleStands);
    // The rules go in the same property write, the run's own state already
    // the default one or not (they were taken away by the rule writer after
    // a clean draft before).
    setProperties(rules.length ? { ...next, dropTextRules: rules } : next);
    if (keptFace) {
      toast({ description: translate("pdf.nativeTextEdit.clearFormattingKeptFace") });
    }
  };
  // A quarter turn rewrites the run's own text matrix, so the rotation is
  // written into the page rather than promoting the run to a text box.
  const rotateNativeTextRun = (direction: "left" | "right") => {
    // A box its group proof moves (a paragraph of several rows, a line of
    // several shows): the whole group turned a quarter about the box's
    // centre, as its rotate handle turns it (WPS 向左/向右旋转 90°).
    if ((!properties || !propertyProof) && groupScaleSupported && groupBaseline && effectiveLayoutRect) {
      const degrees = direction === "right" ? 90 : -90;
      const turned = groupDraftWithTurn({ draft: properties ?? groupBaseline, rect: effectiveLayoutRect }, degrees);
      if (!turned) return;
      setLayoutAngle((current) => normalizeBoxAngle(current + degrees));
      setProperties(turned);
      return;
    }
    if (!properties || !propertyProof) return;
    const [a, b, c, d] =
      properties.textMatrixLinear ?? propertyProof.original.textMatrixLinear;
    const sign = direction === "left" ? 1 : -1;
    const round = (value: number) => {
      const rounded = Math.round(value * 1e6) / 1e6;
      return Object.is(rounded, -0) ? 0 : rounded;
    };
    // The frame turns with the text, as the rotate handle and its arrow keys
    // turn it: it kept the old direction until the box was opened again
    // (user audit PDF 0081).
    setLayoutAngle((current) => normalizeBoxAngle(current + (direction === "right" ? 90 : -90)));
    setProperties({
      ...properties,
      textMatrixLinear: [
        round(sign * c),
        round(sign * d),
        round(-sign * a),
        round(-sign * b),
      ] as const,
    });
  };
  // A run that never set its leading (most producers place every line with
  // Tm or Td) has no line step for TL to change: the writer refuses any
  // value, so the control says why instead of failing on save.
  const nativeLineSpacingEditable = Boolean(
    propertyProof && propertyProof.original.lineSpacing !== 0,
  );
  // The indent the ribbon shows: what earlier saves wrote (read back from the
  // journal) plus what this draft adds. A decrease below the written indent
  // moves the run back left (an axis-aligned run only: the move is in page
  // space), since the run's own frame starts where it now stands.
  const nativeAxisAligned = Boolean(
    propertyProof &&
      Math.abs(propertyProof.textMatrix[1]) < 1e-9 &&
      Math.abs(propertyProof.textMatrix[2]) < 1e-9 &&
      propertyProof.textMatrix[0] > 0 &&
      Math.abs(propertyProof.graphicsMatrix[1]) < 1e-9 &&
      Math.abs(propertyProof.graphicsMatrix[2]) < 1e-9 &&
      propertyProof.graphicsMatrix[0] > 0,
  );
  const retainedIndent = nativeAxisAligned ? Math.max(0, retainedLeftIndent) : 0;
  // Alignment read back from the journal: shown on reopen, and a new choice
  // is placed in the run's first frame by a move the planner verifies.
  const retainedRunAlignment = nativeAxisAligned ? retainedAlignment : "left";
  const retainedShift = nativeAxisAligned ? Math.max(0, retainedFrameShift) : 0;
  const displayedAlignment = properties
    ? alignmentChoice ??
      (propertyBaseline && properties.alignment !== propertyBaseline.alignment
        ? properties.alignment
        : retainedRunAlignment)
    : null;
  displayedAlignmentRef.current = displayedAlignment;
  const applyNativeAlignment = (target: "left" | "center" | "right") => {
    if (!properties || !propertyBaseline) return;
    const ownMove = alignmentChoice !== null || indentMoveOwned;
    setIndentMoveOwned(false);
    if (target === retainedRunAlignment) {
      // Back to what was saved: nothing to move or realign.
      setAlignmentChoice(null);
      setProperties({
        ...properties,
        alignment: propertyBaseline.alignment,
        ...(ownMove ? { moveX: undefined } : {}),
      });
      return;
    }
    if (retainedShift === 0 && retainedRunAlignment === "left") {
      setAlignmentChoice(null);
      setProperties({ ...properties, alignment: target, ...(ownMove ? { moveX: undefined } : {}) });
      return;
    }
    if (properties.moveX !== undefined && !ownMove) return;
    const moveX = nativeAlignmentMoveX(retainedShift, target);
    setAlignmentChoice(target);
    setProperties({ ...properties, alignment: target, moveX: moveX === 0 ? undefined : moveX });
  };
  const displayedLeftIndent = properties
    ? Math.round((retainedIndent + properties.leftIndent + (indentMoveOwned ? properties.moveX ?? 0 : 0)) * 1000) / 1000
    : null;
  const applyDisplayedLeftIndent = (target: number) => {
    if (!properties) return;
    const delta = Math.max(0, target) - retainedIndent;
    if (delta >= 0) {
      const ownMove = indentMoveOwned || alignmentChoice !== null;
      setIndentMoveOwned(false);
      setAlignmentChoice(null);
      setProperties({
        ...properties,
        leftIndent: delta,
        ...(ownMove ? { moveX: undefined } : {}),
      });
      return;
    }
    if (properties.moveX !== undefined && !indentMoveOwned && alignmentChoice === null) return;
    setAlignmentChoice(null);
    setIndentMoveOwned(true);
    setProperties({ ...properties, leftIndent: 0, moveX: delta });
  };
  const nativeIndentDecreasable = Boolean(displayedLeftIndent && displayedLeftIndent > 0);
  const nativePropertyControls =
    propertyProof && properties
      ? ([
          "fontFamily",
          "fontSize",
          "fontSizeIncrease",
          "fontSizeDecrease",
          "fontColor",
          ...(nativeIndentDecreasable ? (["indentDecrease"] as const) : []),
          "indentIncrease",
          "alignLeft",
          "alignCenter",
          "alignRight",
          ...(nativeLineSpacingEditable ? (["lineSpacing"] as const) : []),
          "characterSpacing",
          "firstLineIndent",
          "wordSpacing",
          "leftIndent",
          "rightIndent",
          "horizontalScale",
          "superscript",
          "subscript",
          "rotateLeft",
          "rotateRight",
          "clearFormatting",
        ] as const)
      : [];
  // Each control that stays grey says why in the reader's language: busy,
  // a box whose text-box writer lacks the format, a run whose properties
  // the PDF does not let us prove, or the one rule that holds back that
  // particular control.
  // What a control the line cannot take says: only what the line itself
  
  // editor; an editor is shown once proved, and a write or a preview
  // running meanwhile changes none of its controls -- presses wait for it).
  const formatReason = (control: Exclude<PdfTextEditingControl, "hand" | "select">) =>
    !propertyProof && !managedLayoutTypography && sourceStrokedOutline && !preparationFailed
      ? translate("pdf.nativeTextEdit.outlinedTextFormatUnsupported")
      // The proof was refused: each control says why, not "previewing"
      // forever (walk c-s6, the 装配理论 paragraph). The failure's own
      // message comes first: with no proof the commit decision can only say
      // "the editing proof expired, select the text again", which is a
      // consequence, and selecting again does not help while the cause
      // lasts (walk s3-b: the PDF engine answered 503 for minutes after the
      // server restarted, and every control blamed an expired proof).
      : preparationFailed
        ? (error ?? applyDisabledReason ?? translate("pdf.nativeTextEdit.propertiesUnproven"))
      : managedLayoutTypography
        ? translate("pdf.nativeTextEdit.textBoxFormatUnsupported")
        : !propertyProof
          ? translate("pdf.nativeTextEdit.propertiesUnproven")
          : control === "highlight"
            ? translate("pdf.nativeTextEdit.highlightUseComment")
              : control === "alignDistributed"
                ? translate("pdf.nativeTextEdit.distributedUnavailable")
                : control === "alignJustify"
                  ? translate("pdf.nativeTextEdit.justifyNeedsParagraph")
                  : control === "lineSpacing"
                    ? translate("pdf.nativeTextEdit.lineSpacingNoLeading")
                    : control === "indentDecrease"
                      ? translate("pdf.nativeTextEdit.indentAtFrameLeft")
                      // A run whose face has no bold is drawn bold by
                      // stroking, which needs the stroke width and colour
                      // in force known (a bold face always comes off, into
                      // a served regular face, and an italic one into a
                      // served upright face).
                      : control === "bold"
                        ? editableFont
                          ? translate("pdf.nativeTextEdit.boldStrokeUnknown")
                          : translate("pdf.nativeTextEdit.noBoldVariant")
                        : control === "italic"
                          ? editableFont?.italic
                            ? translate("pdf.nativeTextEdit.noRegularFaceForItalic")
                            : translate("pdf.nativeTextEdit.noItalicVariant")
                          : ribbonLabels.unavailable;
  // A line drawn as several positioned shows -- Skia, Chrome and Google Docs
  // set each word and space apart -- has no one property proof, only the
  // group's: its size changes the way the group map scales it, about the
  // frame's lower left, and is written natively like a move. Before, every
  // size control was grey there ("the format cannot be read"), while WPS
  // sets such a line's size like any other.
  
  // show stroked in its own fill colour in place, the state in force put
  // back after it (text-group-move.ts). A group drawn in bold faces has no
  // regular one to go back to, as a run's bold face has none here.
  // (Not a line that holds a Type3 glyph: the group's write strokes every
  // show knowing nothing of its face. Its weight is its paragraph's, the
  
  const groupBoldBaseline = !propertyProof && !managedLayoutTypography && !openedInFallbackLane &&
    !initialLayout?.promoted && !initialLayoutType3 ? nativeGroupMoveProof?.baseline.syntheticBold : undefined;
  const groupInkRuns = (sourceAppearance ?? []).filter((run) => run.text.trim());
  const groupBoldFaces = groupInkRuns.length > 0 && groupInkRuns.every((run) => run.font.bold);
  const groupBold = groupBoldBaseline !== undefined && paragraphChanges === null
    ? groupBoldFaces || (propertyOverride?.syntheticBold ?? groupBoldBaseline) : null;
  const groupBoldEditable = groupBold !== null && !groupBoldFaces;
  // Bold taken off a group the page strokes, some of whose shows are set in
  // bold faces: the strokes come off and those shows stay bold. The press
  // wrote a version, said nothing, and the box still read bold but for the
  // one comma that had been stroked (pdf-walk 0444, a caption in Times New
  // Roman Bold with a regular comma: Bold on stroked the comma, Bold off
  
  // the bold words in a regular face, or it is refused and said. (A stroke
  // only pressed in this draft is still the group's to take back.)
  const groupBoldOffLeavesBoldFaces = groupBold === true && groupBoldBaseline === true &&
    groupInkRuns.some((run) => run.font.bold);
  const groupBoldTakesPress = groupBoldEditable && !groupBoldOffLeavesBoldFaces;
  const toggleGroupBold = () => {
    if (!groupBoldTakesPress || !nativeGroupMoveProof) return;
    setProperties({ ...(propertyOverride ?? nativeGroupMoveProof.baseline), syntheticBold: !groupBold });
  };
  const groupFontScalable = !propertyProof && groupScaleSupported && !managedLayoutTypography &&
    !openedInFallbackLane && paragraphChanges === null && !/[\r\n]/.test(originalText);
  
  const unprovenFormatEligible = !propertyProof && !managedLayoutTypography && Boolean(initialLayout) &&
    !groupFontScalable && groupBold === null && !preparationPending && !unverifiedNativeSource &&
    paragraphChanges === null && !deletesOnLeave;
  
  // per character, a line Chrome sets word by word, a run whose format the
  // PDF does not prove) takes every character format as WPS takes it, on the
  // selected part only: the first such format takes the line into the
  
  
  // on such a line, and a part's size or bold was refused).
  const textBoxTakeoverEligible = !propertyProof && !managedLayoutTypography && Boolean(initialLayout) &&
    
    // colour picked for a hollow red line turned it into solid green text
    
    !sourceStrokedOutline &&
    !preparationPending && !unverifiedNativeSource && paragraphChanges === null && !deletesOnLeave &&
    Number.isFinite(managedSizeBaseline) && managedSizeBaseline > 0;
  

  // (Any such box: a paragraph's source text joins its rows with spaces --
  // the IPCC report's every one -- so its rows are no test of being one.)
  const paragraphAlignable = textBoxTakeoverEligible && Boolean(onApplyRowFormat) && !managedTypographyEditable;
  /** A paragraph of several rows whose settings the paragraph rewrite sets:
   * one no run's proof states (above), or one a single run draws on several
   * rows (its proof moves the run as a block, never line by line). */
  const paragraphRewritable = paragraphAlignable || Boolean(propertyParagraph && properties &&
    !managedTypographyEditable);
  
  const paragraphLanesKey = process.env.NODE_ENV !== "production" ? JSON.stringify({ alignable: paragraphAlignable,
    takeover: textBoxTakeoverEligible, rowFormat: Boolean(onApplyRowFormat), managed: managedTypographyEditable,
    rows: originalText.split("\n").length, proof: Boolean(propertyProof), layout: Boolean(initialLayout),
    outline: sourceStrokedOutline, pending: preparationPending, unverified: unverifiedNativeSource,
    paragraph: paragraphChanges !== null, deletes: deletesOnLeave, size: managedSizeBaseline,
    severalRows: severalRowsBox, propertyParagraph, rewritable: paragraphRewritable,
    paragraphFormat: Boolean(onApplyParagraphFormat), props: properties !== null }) : "";
  useEffect(() => {
    if (paragraphLanesKey) markPdfTextLatency("editor.paragraph-lanes", JSON.parse(paragraphLanesKey));
  }, [paragraphLanesKey]);
  const lineStyleRuns = useMemo(() => textBoxTakeoverEligible
    ? pdfNativeLineStyleRuns(originalText, sourceAppearance, managedPointHeight, pageFonts) : null,
  [textBoxTakeoverEligible, originalText, sourceAppearance, managedPointHeight, pageFonts]);
  /** The run most of the line is drawn in: the box's own style. */
  const lineLeadRun = lineStyleRuns?.reduce((best, run) => (run.text.length > best.text.length ? run : best));
  










  const groupBasePoints = groupFontScalable
    ? pdfUniformTextPointSize(sourceAppearance ?? []) ??
      (Number(initialLayout?.box.fontSize) * Number(initialLayout?.pageHeightPoints) || null)
    : null;
  const groupPoints = groupBasePoints !== null && groupBasePoints > 0
    ? Number((groupBasePoints * (paragraphSizeScale ?? propertyOverride?.groupScale?.y ?? 1)).toFixed(2)) : null;
  const setGroupFontPoints = (points: number) => {
    if (groupPoints === null || !(points > 0)) return;
    if (nativeSizeByRewrite && groupBasePoints !== null && !propertyOverride?.groupScale) {
      const scale = Number((points / groupBasePoints).toFixed(4));
      if (!(scale >= 0.1 && scale <= 10)) return;
      setParagraphSizeScale(Math.abs(scale - 1) < 1e-3 ? null : scale);
      return;
    }
    if (!layoutRect) return;
    const factor = points / groupPoints;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-6) return;
    const next = {
      ...layoutRect,
      y: layoutRect.y + layoutRect.height * (1 - factor),
      width: layoutRect.width * factor,
      height: layoutRect.height * factor,
    };
    const draft = groupDraftWithScale(next);
    if (!draft) return;
    setLayoutRect(next);
    setProperties(draft);
  };
  const type3Unavailable = translate("pdf.nativeTextEdit.type3FormatUnavailable");
  // 转换为公式: the line's words read as LaTeX (as a box's are), offered
  // when they read as maths -- words of the page, as the box toggle has it
  // (no `N = 15` formula); greyed with why otherwise.
  const formulaConversion = (() => {
    if (!onConvertToFormula || !replacementText.trim()) return { latex: "", reason: null };
    const reading = readLineAsFormula(replacementText);
    if (reading.renderable) return { latex: reading.latex, reason: null };
    return { latex: "", reason: reading.typesettable
      ? translate("pdf.textbox.formulaError.weak") : translate("pdf.textbox.formulaError.syntax") };
  })();
  const formulaConversionLatex = formulaConversion.latex;
  const capabilitiesOfLine = createPdfTextEditingCapabilities(
    propertyProof || managedLayoutTypography
      ? formatReason("fontFamily")
      : translate("pdf.nativeTextEdit.propertiesUnproven"),
    [
      ...nativePropertyControls,
      ...(managedTypographyEditable ? (["fontSize", "fontSizeIncrease", "fontSizeDecrease",
        "alignLeft", "alignCenter", "alignRight", "fontColor"] as const) : []),
      // Every Office family of All Fonts is a face the box's writer embeds,
      // whatever the portable list holds for this text.
      ...(managedTypographyEditable ? (["fontFamily"] as const) : []),
      ...(managedTypographyEditable ? (["underline", "strikethrough", "alignJustify",
        "characterSpacing", "wordSpacing", "horizontalScale", "clearFormatting",
        "superscript", "subscript"] as const) : []),
      ...(groupPoints !== null ? (["fontSize", "fontSizeIncrease", "fontSizeDecrease"] as const) : []),
      ...(textBoxTakeoverEligible
        ? (["fontFamily", "fontSize", "fontSizeIncrease", "fontSizeDecrease", "bold", "italic", "fontColor",
          "superscript", "subscript", "clearFormatting"] as const) : []),
      ...(textBoxTakeoverEligible
        ? (["underline", "strikethrough"] as const) : []),
      // A paragraph of several rows no run's proof states: every setting the
      // paragraph rewrite sets it again in (alignment, both justifications,
      // indents, line and character spacing), when it is left.
      ...(paragraphAlignable
        ? (["alignLeft", "alignCenter", "alignRight", "alignJustify", "alignDistributed", "indentIncrease",
          "firstLineIndent"] as const) : []),
      ...(paragraphAlignable && paragraphOwnLineStep ? (["lineSpacing"] as const) : []),
      ...(paragraphAlignable && paragraphSourcePoints > 0 ? (["characterSpacing"] as const) : []),
      ...(paragraphRewritable && !paragraphAlignable
        ? (["alignLeft", "alignCenter", "alignRight", "alignJustify", "alignDistributed"] as const) : []),
      ...(paragraphRewritable && !paragraphAlignable && !nativeLineSpacingEditable && paragraphOwnLineStep
        ? (["lineSpacing"] as const) : []),
      // A box its group proof moves turns a quarter as its handle turns it.
      ...(!propertyProof && groupScaleSupported ? (["rotateLeft", "rotateRight"] as const) : []),
      ...(paragraphAlignable && (rowFormat?.leftIndent ?? 0) > 0
        ? (["indentDecrease"] as const) : []),
      ...(paragraphColors && paragraphColors.length >= 2 ? (["fontColor"] as const) : []),
      // Align Text: the rows of a box in its frame.
      ...(layoutFallbackActive ? (["verticalAlign"] as const) : []),
      ...(nativeLineSpacingByRewrite ? (["lineSpacing"] as const) : []),
      ...((boldVariantAvailable || groupBoldEditable)
        ? (["bold"] as const)
        : []),
      ...(italicVariantAvailable
        ? (["italic"] as const)
        : []),
      // Deleting a whole source text object needs the selection proof, not the
      // narrower property proof the formatting controls run on.
      ...(onDeleteTextObject
        ? (["delete"] as const)
        : []),
      // Rules are page content drawn beside the run, so they need the same
      // selection proof the delete does rather than the property proof.
      
      // its own typography handles the lines (below).
      // A run its property proof states, or a box its rows write, takes its
      // rules in its own write (partFormats): there is no other way a rule
      // is written.
      ...(((properties && propertyProof) || (textBoxTakeoverEligible && onApplyRowFormat)) &&
        !managedLayoutTypography
        ? (["underline", "strikethrough"] as const)
        : []),
      // Justifying needs the paragraph's own frame, which only the host's
      // paragraph proof carries; a single run has nothing to stretch to.
      ...(onJustifyParagraph && !paragraphJustifyDisabledReason
        ? (["alignJustify"] as const)
        : []),
      // 格式刷 copies a run whose format is known (and an armed one can
      // always be pressed again to put it away).
      ...(painterWindowId &&
        ((propertyProof && properties) || managedTypographyEditable || paragraphAlignable || formatPainter)
        ? (["formatPainter"] as const) : []),
      "select", "exit",
      ...(onHandTool ? (["hand"] as const) : []),
      ...(onInsertText ? (["insertText"] as const) : []),
      ...(formulaConversionLatex && !inputReadOnly && wordsFixed === null
        ? (["convertKind"] as const) : []),
      // A setting of the device, not of this line: always at hand.
      "keyboardInput",
      // 插入符号 types into the line: while it takes typing.
      ...(!inputReadOnly && wordsFixed === null ? (["insertSymbol"] as const) : []),
      // 更改大小写 retypes the words: wherever typing is taken.
      ...(!inputReadOnly && wordsFixed === null ? (["changeCase"] as const) : []),
      // 项目符号 / 编号 write their markers as typing: wherever typing is taken.
      ...(!inputReadOnly && wordsFixed === null ? (["bullets", "numbering"] as const) : []),
    ],
    {
      // (Never 「预览中」: the preview drawn again as one types is no state
      // of the editor.)
      save:
        (effectiveApplyDisabledReason !== labels.previewing ? effectiveApplyDisabledReason : null) ??
        (replacementText.length === 0
          ? labels.geometryNotice
          : labels.description),
      hand: ribbonLabels.unavailable,
      formatPainter: formatReason("formatPainter"),
      insertText: ribbonLabels.unavailable,
      convertKind: formulaConversion.reason ?? ribbonLabels.unavailable,
      ...Object.fromEntries(
        ([
          "fontSize", "fontSizeIncrease", "fontSizeDecrease", "clearFormatting",
          "bold", "italic", "underline", "strikethrough", "subscript", "superscript",
          "highlight", "fontColor", "indentDecrease", "indentIncrease", "alignLeft",
          "alignCenter", "alignRight", "alignJustify", "alignDistributed", "lineSpacing",
          "characterSpacing", "firstLineIndent", "wordSpacing", "leftIndent",
          "rightIndent", "horizontalScale", "rotateLeft", "rotateRight",
        ] as const).map((control) => [control, formatReason(control)]),
      ),
      // A run with no proof for its own deletion or rules says so plainly.
      ...(onDeleteTextObject ? {} : { delete: ribbonLabels.unavailable }),
      ...(paragraphJustifyDisabledReason && propertyProof
        ? { alignJustify: translate("pdf.nativeTextEdit.justifyNeedsParagraph") }
        : {}),
    },
  );
  // A Type3 face's glyph procedures ignore the rendering mode a weight is
  // drawn with, and no other face is known to hold its glyphs; its words stay.
  // Where the Type3 glyphs of the box are pictures all (a colour emoji among
  // words of ordinary faces: the proof's reading, type3PicturesOnly) the
  // weight is the words' and is asked of the page as any box's -- a picture
  // has none to take. (Until the proof says so the weight stays refused: a
  // press made meanwhile is held and answered when it comes.)
  // A line of words the reader did not read as the page draws them takes
  // what is written where its text stands -- a stroked weight, a lean, a
  // rule, a colour, on the whole of it -- and nothing that would set its
  // words again, carry them off or make a text box of them: each of those
  // says why (a face, a size, a script, a spacing, an alignment, a turn, a
  // delete, the format painter's copy of all of them).
  // (The block of a paragraph too large to set again is of the second kind,
  // whatever faces it holds; a weight is refused it only where a Type3 glyph
  // of it is a letter -- the same reading, type3PicturesOnly.)
  // (And where its letters are filled shapes that take the weight by their
  
  // weight is asked of the page too. A box bold that way is open for the
  // weight, to take it off, and for what is written beside the passes; what
  // would draw it again, lean it or carry it says the weight comes off first.)
  const nativeCapabilities: typeof capabilitiesOfLine = boldByType3Passes ? Object.freeze(Object.fromEntries(
    (Object.keys(capabilitiesOfLine) as (keyof typeof capabilitiesOfLine)[]).map((control) => [control,
      TYPE3_BOLD_KEPT_CONTROLS.has(control) ? capabilitiesOfLine[control]
        : Object.freeze({ enabled: false, reason: wordsFixedNotice })]),
  ) as typeof capabilitiesOfLine) : initialLayoutType3 && !wordsByLine ? Object.freeze({ ...capabilitiesOfLine,
    // (Of a run that states its own format too, where its letters take the
    // weight: asked as its box's, type3WeightRun.)
    ...((type3PicturesOnly && !propertyProof) || type3TakesWeight ? {} : { bold: Object.freeze({ enabled: false, reason: type3Unavailable }) }),
    fontFamily: Object.freeze({ enabled: false, reason: type3Unavailable }),
    delete: Object.freeze({ enabled: false, reason: translate("pdf.nativeTextEdit.type3WordsNotEditable") }),
  }) : wordsFixed === "unread" ? Object.freeze(Object.fromEntries(
    (Object.keys(capabilitiesOfLine) as (keyof typeof capabilitiesOfLine)[]).map((control) => [control,
      control === "bold" && wordsByLine && initialLayoutType3 && !type3PicturesOnly && !type3TakesWeight
        ? Object.freeze({ enabled: false, reason: type3Unavailable })
        : WORDS_UNREAD_KEPT_CONTROLS.has(control) ? capabilitiesOfLine[control]
        : Object.freeze({ enabled: false, reason: wordsFixedNotice })]),
  // (A box of words that can be set again, one show of them a Type3 letter
  // that takes no weight: a stroke draws nothing on the letter and a second
  // drawing of it is not provable here, so the weight is not offered -- the
  // press was taken by the group, which stroked every show, and the box read
  // bold with the letter as light as it was.)
  ) as typeof capabilitiesOfLine) : type3LettersHeld && !type3TakesWeight && !propertyProof ? Object.freeze({ ...capabilitiesOfLine,
    bold: Object.freeze({ enabled: false, reason: type3Unavailable }),
  }) : capabilitiesOfLine;
  // The selection's part of the run, when the run has formats of its own
  // parts (else the run's own format is the part's).
  const partialFields = partialRange && properties?.segments?.length ? partialFormatOf(partialRange) : null;
  // A caret with nothing selected reads the face of the inked character
  // before it (the first one after it at the line's start), as Word's
  // ribbon does: a caret in "ReportLab" of a line whose "PDF" is set
  
  const caretFaceRange = partialRange || properties || caretAt === null || !sourceAppearance?.length
    ? null
    : (() => {
        const text = sourceAppearance.map((run) => run.text).join("");
        for (let at = Math.min(caretAt, text.length) - 1; at >= 0; at -= 1) {
          if (text[at].trim()) return { start: at, end: at + 1 };
        }
        for (let at = caretAt; at < text.length; at += 1) {
          if (text[at].trim()) return { start: at, end: at + 1 };
        }
        return null;
      })();
  const faceRange = partialRange ?? caretFaceRange;
  // The whole box (nothing selected inside it, no caret in it) drawn in
  // several faces reads no one face, as Word leaves the box blank over a
  // selection of mixed fonts: it showed the face of one run, "Arimo" over a
  
  const wholeBoxMixedFace = !partialRange && caretAt === null && !managedLayoutTypography && !useStoredLayoutTypography &&
    (properties?.segments?.length
      ? partialFormatOf({ start: 0, end: originalText.length })?.fontResourceName === "mixed"
      : sourceInkFaces.length > 1 &&
        sourceFamilyOver({ start: 0, end: (sourceAppearance ?? []).reduce((length, run) => length + run.text.length, 0) }) === null &&
        (!properties || properties.fontResourceName === propertyProof?.original.font.resourceName));
  // A line of several runs states no one run's rise: the selected part's
  // rise is read from its glyphs, against the line's first glyph (a raised
  // CHAN read as not a superscript, and 上标 pressed on it again set it a
  
  const geometryRise = useMemo((): number | null => {
    if (properties || !sourceGeometry || !partialRange) return null;
    const characters = sourceGeometry.characters;
    if (!characters.length) return null;
    // The glyph boxes' height, in the units the origins are in (the points
    // of fontSize are not: under a zoom a raised run's step read as a row's).
    const size = Math.max(...characters.map((character) =>
      Math.hypot(character.quad[4] - character.quad[0], character.quad[5] - character.quad[1]) ||
      Math.abs(character.fontSize) || 0));
    const [a, b, c, d] = sourceGeometry.pageTransform;
    // Raised means further along the page's up axis: the sign of the
    // transform's y scale says which way the geometry's y runs.
    const up = Math.sign(a * d - b * c) || 1;
    // Each glyph against its own row's baseline (the baseline most of the
    // row's glyphs stand on), not the box's first glyph: a part reaching
    // into the next row of a paragraph read that row's step down as a
    // subscript, the split button turned to 下标 pressed, and 上标 pressed
    
    const rowOf: number[] = [];
    const rows: number[][] = [];
    for (const [index, character] of characters.entries()) {
      const row = rows[rows.length - 1];
      const anchor = row ? characters[row[0]].origin[1] : NaN;
      if (!row || Math.abs(character.origin[1] - anchor) > Math.max(size, 1) * 0.75) rows.push([index]);
      else row.push(index);
      rowOf[index] = rows.length - 1;
    }
    const rowBaselines = rows.map((row) => {
      const values = row.map((index) => characters[index].origin[1]).sort((x, y) => x - y);
      return values[Math.floor(values.length / 2)];
    });
    const rises = characters
      .map((character, index) => ({ character, index }))
      .filter(({ character }) => character.start >= partialRange.start && character.end <= partialRange.end &&
        character.text.trim())
      .map(({ character, index }) => (character.origin[1] - rowBaselines[rowOf[index]]) * up);
    if (!rises.length) return null;
    const mean = rises.reduce((sum, rise) => sum + rise, 0) / rises.length;
    return Math.abs(mean) > Math.max(size, 1) * 0.08 ? mean : 0;
  }, [properties, sourceGeometry, partialRange]);
  // With part of the text selected, Underline and Strikethrough show whether
  // the run's rule already runs under all of that part.
  const partialRuleStretch = partialRange
    ? pdfNativeTextRuleRangeOfText(sourceGeometry, replacementText, partialRange)
    : null;
  const rulePressed = (style: "underline" | "strikethrough") => partialRuleStretch
    ? pdfNativeTextRuleRangeCovers(pdfNativeTextRuleRangeOf(nativeDecorations, style), partialRuleStretch)
    : nativeDecorations[style];
  
  // else (a box set in runs) its whole text's.
  const managedRibbonRange = managedLayoutTypography && (partialRange || managedDrawsRuns)
    ? partialRange ?? { start: 0, end: replacementText.length } : null;
  const managedRibbonStyle = managedRibbonRange ? managedStyleOver(managedRibbonRange) : null;
  const managedRibbonClassOption = (font: string | undefined) => font
    ? TEXTBOX_FONT_FAMILY_OPTIONS.find((option) =>
      ["helvetica", "times", "courier"].includes(option.id) && classifyFontName(option.sourceFontName) === font)
    : undefined;
  const managedRibbonFontLabel = managedRibbonStyle
    ? managedRibbonStyle.officeFamily
      ? ribbonFontFamilyLabel(pdfPageFontDisplayFamily(managedRibbonStyle.officeFamily))
      : managedRibbonStyle.officeFamily === "" && managedRibbonClassOption(managedRibbonStyle.font)
        ? translate(managedRibbonClassOption(managedRibbonStyle.font)!.labelKey)
        : ribbonLabels.mixed
    : managedLayoutTypography && managedOfficeFamily ? ribbonFontFamilyLabel(pdfPageFontDisplayFamily(managedOfficeFamily)) : null;
  // The fonts the page keeps from readers' computers, one row a face.
  const pageFontOptions = pageFonts.map((font) => {
    const value = pdfPageFontFamilyToken(font);
    return {
      id: value, value,
      label: `${font.family}${font.weight >= 600 ? ` ${labels.bold}` : ""}${font.italic ? ` ${labels.italic}` : ""}`,
      previewFamily: pdfTextBoxRunCssFamily({ font: classifyFontName(font.family), officeFamily: value }),
    };
  });
  // Every family MRAI serves can set this text: its face is embedded as it
  
  // line to a text box, as WPS does). They were listed under 所有字体 alone,
  
  // 字体都可以用，但是…往往就那么几个」).
  const servedEmbedFamily = editableFont ? readPdfNativeEmbeddedFontKey(editableFont.resourceName)?.family : undefined;
  const servedFontOptions = officeDataObtainable()
    ? officeFontFamilies()
      .filter((family) => !propertyProof?.fonts.some((font) =>
        pdfPageFontDisplayFamily(font.family).toLocaleLowerCase() === family.toLocaleLowerCase()))
      .map((family) => ({
        id: `served-${family}`, value: family, label: family, previewFamily: family,
        ...(servedEmbedFamily === family ? { selected: true } : {}),
      }))
    : [];
  const nativeRibbonModel = {
    target: "native-list" as const,
    // A line of the page is text: 转换为公式 is offered on it.
    ...(onConvertToFormula ? { kind: "text" as const } : {}),
    // The list the run's paragraphs are (their markers).
    list: pdfTextListKindOf(replacementText),
    
    ...(layoutFallbackActive ? { verticalAlign: layoutVerticalAlign } : {}),
    fontSections: propertyProof
      ? [
          {
            id: "source-pdf-fonts",
            options: [...propertyProof.fonts.map((font) => ({
              id: font.resourceName,
              label: `${font.family}${font.bold ? ` ${labels.bold}` : ""}${
                font.italic ? ` ${labels.italic}` : ""
              }`,
              value: font.resourceName,
              previewFamily: font.family,
              selected: font.resourceName === editableFont?.resourceName,
            })), ...pageFontOptions, ...servedFontOptions],
          },
        ]
      : managedLayoutTypography ? [{id: "portable-managed-fonts", options: [...managedFontOptions.map(option => ({
          id: option.id, value: option.id, label: translate(option.labelKey), previewFamily: option.stack,
          testId: `pdf-managed-font-${option.id}`,
          selected: managedActiveFont?.id === option.id,
        })), ...pageFontOptions, ...servedFontOptions]}]
      // Before the proof names the PDF's own faces, the fonts the page keeps
      // from readers' computers are at hand (a choice is held until the
      // proof lands, as any format pressed meanwhile).
      : pageFontOptions.length || servedFontOptions.length
        ? [{ id: "page-fonts", options: [...pageFontOptions, ...servedFontOptions] }] : [],
    activeFontLabel: readableFontLabel(managedRibbonFontLabel ??
      (managedLayoutTypography && managedActiveFont ? translate(managedActiveFont.labelKey) : null) ??
      (useStoredLayoutTypography ? initialLayout?.box.fontFamily : null) ??
      // A line no run's proof states shows the face it is drawn in (WPS).
      // A line the page draws in several runs: the face the selected part
      // (or the caret's character) is drawn in, before the line's lead run
      // (a word saved in Arial read "Times", the line's first).
      (!properties && faceRange ? sourceFamilyOver(faceRange) : null) ??
      (!properties && lineLeadRun?.officeFamily ? pdfPageFontDisplayFamily(lineLeadRun.officeFamily) : null) ??
      // A part selected that the draft sets in a face of its own reads that
      // face (the box read the run's face over a part set in another:
      
      (partialRange && typeof partialFields?.fontResourceName === "string" &&
        partialFields.fontResourceName !== properties?.fontResourceName && partialFace(partialRange)
        ? pdfPageFontDisplayFamily(partialFace(partialRange)!.family) : null) ??
      (selectedFont ? pdfPageFontDisplayFamily(selectedFont.family) : null) ??
      (sourceInkFamily ? pdfPageFontDisplayFamily(sourceInkFamily) : null) ??
      // Before the proof names the run's font, the face the reader drew the
      // clicked line in says the family (WPS names it the moment the box
      
      (!propertyProof && readerFontIdentity ? readerFontIdentity.family : null) ?? labels.font),
    activeFontFamily: managedLayoutTypography
      ? managedRibbonStyle?.officeFamily
        ? pdfTextBoxRunCssFamily({ font: classifyFontName(managedRibbonStyle.officeFamily), officeFamily: managedRibbonStyle.officeFamily })
        : managedFontFamily
      : (useStoredLayoutTypography ? initialLayout?.box.fontFamily : null) ??
        (!properties && lineLeadRun?.fontFamily ? lineLeadRun.fontFamily : null) ?? selectedFont?.family,
    fontFamilyMixed: wholeBoxMixedFace,
    // The size the control shows is the size on paper: the run's Tf times
    // its text matrix scale (a "1 Tf" run drawn under a 22.08 matrix is a
    // 22 pt run). Showing the raw Tf read 1 for both an 11 pt and a 22 pt
    
    fontSize: managedRibbonStyle
      ? managedRibbonStyle.fontSize ?? null
      : partialFields
      ? typeof partialFields.fontSize === "number"
        // A scripted part reads the size it was set at, not the 2/3 it is
        // drawn at (Word): an 18 pt superscript reads 18.
        ? Number(((typeof partialFields.textRise === "number" && partialFields.textRise !== 0
          ? nativeTextNormalState({ fontSize: partialFields.fontSize, textRise: partialFields.textRise }).fontSize
          : partialFields.fontSize) * nativeTextMatrixScale).toFixed(2))
        : null
      // A part of a line the page draws at several sizes (a word saved at 18
      // pt among 14 pt words): the size the page draws that part at.
      : partialRange && sourceAppearance && sourceAppearance.length > 1 &&
          sourceAppearance.map((run) => run.text).join("") === replacementText &&
          pdfTextPointSizeOver(sourceAppearance, partialRange) !== null
      ? pdfTextPointSizeOver(sourceAppearance, partialRange)
      : groupPoints !== null
      ? groupPoints
      : properties
      ? Number((properties.fontSize * nativeTextMatrixScale).toFixed(2))
      : managedFontSize ??
        // A box of several runs with no one property proof (Word's lines,
        // each in its own font): the size they all draw at, else "mixed".
        (sourceAppearance ? pdfUniformTextPointSize(sourceAppearance)
          // Before the proof: the size the reader drew the clicked line at.
          : readerPointSize),
    // With part of the run selected the buttons show that part's format.
    bold: managedRibbonStyle ? managedRibbonStyle.bold
      // A group's weight, or the bold face its selected part (the caret's
      // character) is drawn in: a caret in a bold word of a line with one
      
      : groupBold !== null ? groupBold || Boolean(faceRange && sourceFaceOver(faceRange)?.bold)
      : partialRange && partialFields ? partialBold(partialRange)
      // A part of a line the page draws in several faces (a word saved
      // bold among regular words): the face the page draws that part in
      
      : faceRange && sourceFaceOver(faceRange)?.bold !== undefined ? sourceFaceOver(faceRange)!.bold : currentBold,
    italic: managedRibbonStyle ? managedRibbonStyle.italic
      : partialRange && partialFields ? partialItalic(partialRange)
      : faceRange && sourceFaceOver(faceRange)?.italic !== undefined ? sourceFaceOver(faceRange)!.italic : currentItalic,
    underline: managedRibbonStyle ? managedRibbonStyle.underline
      : managedLayoutTypography ? managedUnderline : rulePressed("underline"),
    strikethrough: managedRibbonStyle ? managedRibbonStyle.strikethrough
      : managedLayoutTypography ? managedStrikethrough : rulePressed("strikethrough"),
    subscript: managedRibbonStyle ? managedRibbonStyle.subscript
      : partialFields ? typeof partialFields.textRise === "number" && partialFields.textRise < 0
        : geometryRise !== null ? geometryRise < 0 : nativeTextRise < 0,
    superscript: managedRibbonStyle ? managedRibbonStyle.superscript
      : partialFields ? typeof partialFields.textRise === "number" && partialFields.textRise > 0
        : geometryRise !== null ? geometryRise > 0 : nativeTextRise > 0,
    highlight: false,
    color: managedRibbonStyle ? managedRibbonStyle.color
      : partialFields
      ? partialFields.color && partialFields.color !== "mixed"
        ? colorToHex(partialFields.color as PdfNativeDeviceColor)
        : undefined
      : unresolvedParagraphColor ? undefined : draftColor,
    alignment: managedLayoutTypography && managedJustify
      ? ("justify" as const)
      : paragraphRewritable && rowFormat?.alignment
        ? (rowFormat.alignment === "distribute" ? "distributed" as const : rowFormat.alignment)
        : displayedAlignment ?? managedAlignment,
    lineSpacing: paragraphRewritable && !paragraphAlignable && !nativeLineSpacingEditable && paragraphOwnLineStep
      ? Math.round((rowFormat?.lineStep ?? paragraphOwnLineStep) * 100) / 100
      : properties?.lineSpacing ??
      (paragraphAlignable && paragraphOwnLineStep
        ? Math.round((rowFormat?.lineStep ?? paragraphOwnLineStep) * 100) / 100
        : nativeLineSpacingByRewrite && paragraphOwnLineStep
        ? Math.round((paragraphLineStep ?? paragraphOwnLineStep) * 100) / 100 : null),
    
    // it carries there (points of its font, percent), not an empty field.
    // A part selected shows its own spacing (mixed when it holds two).
    characterSpacing: partialFields
      ? typeof partialFields.characterSpacing === "number" ? partialFields.characterSpacing : null
      : properties?.characterSpacing ?? (paragraphAlignable && paragraphSourcePoints > 0
        ? Math.round((rowFormat?.characterSpacingEm ?? 0) * paragraphSourcePoints * 100) / 100
        : wrappedSpacingPoints(wrappedCharacterEm)),
    firstLineIndent: properties?.firstLineIndent ?? (paragraphAlignable ? rowFormat?.firstLineIndent ?? 0 : null),
    wordSpacing: properties?.wordSpacing ?? wrappedSpacingPoints(wrappedWordEm),
    leftIndent: displayedLeftIndent,
    rightIndent: properties?.rightIndent ?? null,
    horizontalScale: properties?.horizontalScale ??
      (initialLayout?.promoted ? wrappedHorizontalScale : null),
    keyboardInput: keyboardInputStartsEditing,
    // Saving while it is; blocked only for what the line refuses, never for
    // the preview being drawn again as one types (only a whole editor).
    saveState:
      busy || submitting
        ? ("saving" as const)
        : effectiveApplyDisabledReason && effectiveApplyDisabledReason !== labels.previewing && !deletesOnLeave
          ? ("blocked" as const)
          : ("ready" as const),
    formatPainter: formatPainter?.mode ?? null,
  };
  
  // compares against this, not against what the presses show).
  const laneRibbonModel = { ...nativeRibbonModel };
  // What this session has pressed is what the buttons show (partFormats):
  // a selection made bold reads Bold pressed at once, the proof come or not,
  // and a second press takes it off. A field reads pressed where every
  // character of the selection has it pressed alike (Word); a caret reads
  // the character before it.
  if (!managedLayoutTypography && partFormats.length) {
    const over = pdfTextPartFieldsOver(partFormats,
      partialRange ?? (caretAt !== null ? { start: caretAt, end: caretAt } : null), replacementText);
    if (over.bold !== undefined) nativeRibbonModel.bold = over.bold;
    if (over.italic !== undefined) nativeRibbonModel.italic = over.italic;
    if (over.underline !== undefined) nativeRibbonModel.underline = over.underline;
    if (over.strikethrough !== undefined) nativeRibbonModel.strikethrough = over.strikethrough;
    if (over.script !== undefined) {
      nativeRibbonModel.superscript = over.script === "superscript";
      nativeRibbonModel.subscript = over.script === "subscript";
    }
    if (over.color !== undefined) nativeRibbonModel.color = over.color;
    if (over.sizePoints !== undefined) nativeRibbonModel.fontSize = over.sizePoints;
    if (over.family !== undefined) {
      nativeRibbonModel.activeFontLabel = ribbonFontFamilyLabel(partFamilyLabel(over.family));
      nativeRibbonModel.fontFamilyMixed = false;
    }
  }
  // A scanned line's own rules: the ones standing beside its invisible
  // words with the ones pressed this session set over them, so a line left
  // underlined reads pressed when it is opened again and a second press
  // takes the rule off.
  if (coverRulesLane && coverRulesProven) {
    const over = partialRange ?? (caretAt !== null ? { start: caretAt, end: caretAt } : null);
    nativeRibbonModel.underline = pdfNativeCoverRulePressed(
      coverRulesProven.underline, partFormats, "underline", over, replacementText);
    nativeRibbonModel.strikethrough = pdfNativeCoverRulePressed(
      coverRulesProven.strikethrough, partFormats, "strikethrough", over, replacementText);
  }
  // The size the ribbon shows before any proof is the reader's (readerPointSize):
  
  // for it until the proof (it pressed before the proof, into a refusal).
  const ribbonSizeFromReader = readerPointSize !== null && !propertyProof && !managedRibbonStyle &&
    !partialFields && groupPoints === null && !properties && managedFontSize == null && !sourceAppearance;
  formatStateRef.current = {
    bold: Boolean(nativeRibbonModel.bold),
    italic: Boolean(nativeRibbonModel.italic),
    color: typeof nativeRibbonModel.color === "string" ? nativeRibbonModel.color : null,
    fontSize: !ribbonSizeFromReader && typeof nativeRibbonModel.fontSize === "number" ? nativeRibbonModel.fontSize : null,
    boxFontSize: typeof initialLayout?.box.fontSize === "number" ? initialLayout.box.fontSize : null,
    pageHeightPoints: typeof initialLayout?.pageHeightPoints === "number" ? initialLayout.pageHeightPoints : null,
    proven: !unprovenFormatEligible,
  };
  // The buttons show what the held commands will set, as the click asked:
  // a pressed Bold reads pressed at once, not half a second later.
  const displayedRibbonModel = (() => {
    if (queuedRibbonActions.length === 0) return nativeRibbonModel;
    const model: typeof nativeRibbonModel = { ...nativeRibbonModel };
    const toggles = model as unknown as Record<NativeTextToggleControl, boolean | "mixed">;
    for (const { action, pressed } of queuedRibbonActions) {
      if (action.type === "toggle" && pressed !== undefined && NATIVE_TEXT_TOGGLE_CONTROLS.has(action.control)) {
        toggles[action.control as NativeTextToggleControl] = pressed;
        if (pressed && action.control === "superscript") toggles.subscript = false;
        if (pressed && action.control === "subscript") toggles.superscript = false;
      } else if (action.type === "fontColor") {
        model.color = action.value;
      } else if (action.type === "fontFamily") {
        model.activeFontLabel = ribbonFontFamilyLabel(pdfPageFontDisplayFamily(action.value));
        model.fontFamilyMixed = false;
      } else if (action.type === "fontSize") {
        model.fontSize = action.value;
      } else if (action.type === "alignment" &&
        (action.value === "left" || action.value === "center" || action.value === "right")) {
        model.alignment = action.value;
      }
    }
    return model;
  })();
  const queueRibbonCommand = (action: PdfTextEditingContextRibbonAction,
    press?: Readonly<{ pressed?: boolean; partsBefore?: PdfTextPartFormats }>) => {
    const pressed = press ? press.pressed : action.type === "toggle" && NATIVE_TEXT_TOGGLE_CONTROLS.has(action.control)
      ? displayedRibbonModel[action.control as NativeTextToggleControl] !== true : undefined;
    const field = inputRef.current;
    const range = field ? Object.freeze({ start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0,
      value: field.value }) : undefined;
    setQueuedRibbonActions((queue) =>
      queueNativeTextRibbonAction(queue, { action, ...(pressed === undefined ? {} : { pressed }),
        ...(range ? { range } : {}), ...(press?.partsBefore ? { partsBefore: press.partsBefore } : {}) }));
  };
  /** What a press asks of the characters it is pressed on, as the part
   * formats record it: a toggle sets what the selection shows it lacks
   * (Word), a list its value; Clear Formatting takes every pressed field
   * off. Null: no character format. */
  const partFieldsOfPress = (action: PdfTextEditingContextRibbonAction): PdfTextPartFields | null => {
    switch (action.type) {
      case "fontFamily":
        return { family: action.value };
      case "fontSize":
        return !action.draft && Number.isFinite(action.value) && action.value > 0 ? { sizePoints: action.value } : null;
      case "fontSizeStep": {
        const base = typeof displayedRibbonModel.fontSize === "number" ? displayedRibbonModel.fontSize : null;
        return base !== null && base > 0 ? { sizePoints: nativeTextFontSizeStep(base, action.delta) } : null;
      }
      case "fontColor":
        return /^#[0-9a-f]{6}$/i.test(action.value) ? { color: action.value.toLowerCase() } : null;
      case "toggle":
        if (action.control === "bold" || action.control === "italic" || action.control === "underline" ||
          action.control === "strikethrough") {
          return { [action.control]: displayedRibbonModel[action.control] !== true };
        }
        if (action.control === "superscript" || action.control === "subscript") {
          return { script: displayedRibbonModel[action.control] === true ? "none" : action.control };
        }
        if (action.control === "clearFormatting") {
          return { family: undefined, bold: undefined, italic: undefined, underline: undefined,
            strikethrough: undefined, script: undefined, sizePoints: undefined, color: undefined };
        }
        return null;
      default:
        return null;
    }
  };
  





  const recordPartFormat = (action: PdfTextEditingContextRibbonAction): PdfTextPartFormats | null => {
    // A text box keeps its own runs (managedRuns): drawn and read from them.
    // So does a scanned line, whose press makes it one (coverLaneLine).
    if (managedLayoutTypography || coverLaneLine) return null;
    const fields = partFieldsOfPress(action);
    if (!fields) return null;
    const range = partialTextRange() ?? { start: 0, end: replacementText.length };
    const before = partFormatsRef.current;
    const next = applyPdfTextPartFormat(before, range, fields);
    const history = formatHistoryRef.current;
    history.past.push(Object.freeze({ parts: before, properties: propertyOverride, rowFormat,
      queued: queuedRibbonActionsRef.current.length }));
    if (history.past.length > 200) history.past.shift();
    history.log.push("format");
    history.future = [];
    history.redoLog = [];
    partFormatsRef.current = next;
    setPartFormats(next);
    return before;
  };
  /** Takes back (or does again) the newest format press: the parts, the
   * run's draft and the box's row format as they were. False when the
   * newest step is not a press. */
  /** The newest step of the line's own history taken back (or done again):
   * a text box's format step (its input's own undo takes back what was
   * typed), else a format press, else what was typed. */
  const stepLineHistory = (direction: "undo" | "redo"): boolean => {
    if (managedLayoutTypography && stepManagedFormat(direction)) return true;
    if (stepFormatHistory(direction)) return true;
    if (!stepTextHistory(direction)) return false;
    const history = formatHistoryRef.current;
    const log = direction === "redo" ? history.redoLog : history.log;
    if (log[log.length - 1] === "text") {
      log.pop();
      (direction === "redo" ? history.log : history.redoLog).push("text");
    }
    return true;
  };
  stepLineHistoryRef.current = stepLineHistory;
  const stepFormatHistory = (direction: "undo" | "redo"): boolean => {
    const history = formatHistoryRef.current;
    const log = direction === "undo" ? history.log : history.redoLog;
    if (log[log.length - 1] !== "format") return false;
    const from = direction === "undo" ? history.past : history.future;
    const snapshot = from.pop();
    if (!snapshot) return false;
    log.pop();
    (direction === "undo" ? history.redoLog : history.log).push("format");
    (direction === "undo" ? history.future : history.past).push(Object.freeze({
      parts: partFormatsRef.current, properties: propertyOverride, rowFormat,
      queued: queuedRibbonActionsRef.current.length }));
    partFormatsRef.current = snapshot.parts;
    setPartFormats(snapshot.parts);
    setProperties(snapshot.properties);
    setRowFormat(snapshot.rowFormat);
    // A press still held for the line's proof goes with its undo.
    if (direction === "undo") setQueuedRibbonActions((queue) => queue.slice(0, snapshot.queued));
    setStickyFormatPreview(null);
    return true;
  };
  


  const refusePartPress = (  reason?: string) => {
    const before = pressPartsBeforeRef.current;
    if (before) {
      partFormatsRef.current = before;
      setPartFormats(before);
    }
    toast({ description: reason ?? translate("pdf.nativeTextEdit.formatNotApplied") });
  };
  // A box whose proof states no run and whose only bold is its face's own (the
  // proof's drawnStyle.boldFaces "only": a title set in Times New Roman Bold): the
  // page holds no state to take that weight off, and text the reader
  // reorders is set in no other face where it stands -- the PDF's regular
  // face of the family has other widths, so its joined letters would come
  
  // the press that would take it off is answered at once with that reason:
  // recorded as a format of the box (rowFormat), it was asked of the page
  // when the box was left, refused there as "drawn in the format asked
  // already" and said only as 「未能应用」 -- and pressed once more it asked
  // for a stroke over the bold face.
  // (Not where the engine says the box's words can be set again in the
  // family's regular face: there the press is written, boxDrawnStyle.regularFace.)
  const boldFaceKeptReason = !propertyProof && !managedLayoutTypography && boxDrawnStyle?.boldFaces === "only" &&
    boxDrawnStyle.regularFace !== true
    ? translate(pdfTextHasRightToLeftRun(originalText)
      ? "pdf.nativeTextEdit.boldFaceKeptRightToLeft" : "pdf.nativeTextEdit.boldFaceKept")
    : null;
  /** The weight a painted format asks of a box whose formats are its rows'
   * (rowFormat): not a bold taken off a box whose bold is its face's own --
   * said (boldFaceKeptReason), and the rest of the format painted. Asked with
   * it, the page refused the colour and the rules painted too. */
  const paintedRowBold = (bold: boolean): Readonly<{ bold?: boolean }> => {
    if (bold || !boldFaceKeptReason) return { bold };
    toast({ description: boldFaceKeptReason });
    return {};
  };
  /** A rule pressed on a scanned line while the window still reads whether
   * the page takes it beside the line's invisible words (coverRulesWaiting):
   * held until it answers, then the page's own rule or the text box's. */
  const coverRuleHeld = (action: PdfTextEditingContextRibbonAction) => (coverRulesWaiting || standingRulesWaiting) &&
    action.type === "toggle" && (action.control === "underline" || action.control === "strikethrough");
  const handleRibbonAction = (action: PdfTextEditingContextRibbonAction) => {
    // A font, size or colour chosen from a list leaves the focus on the page
    // as the list closes: the line gets the keyboard back with the same
    // characters selected, as Word and WPS give it back. A size being typed
    // into the box (each key a draft, shown on the line at once) is not
    // chosen yet: the keyboard stays in the box until Enter or the box is
    // left, as Word keeps it. Handed back on each key, the first digit set
    // the size (1) and the next digit was typed into the page's text
    
    if (
      action.type === "fontFamily" || (action.type === "fontSize" && !action.draft) ||
      action.type === "fontSizeStep" || action.type === "fontColor" || action.type === "toggle"
    ) {
      const field = inputRef.current;
      if (field) {
        officeReturnFocusAfterTextFormat(() => inputRef.current, {
          start: field.selectionStart ?? 0,
          end: field.selectionEnd ?? 0,
        });
      }
    }
    const control = nativeTextRibbonActionControl(action);
    // The toggle's state the press sets, read before it is recorded.
    const pressed = action.type === "toggle" && NATIVE_TEXT_TOGGLE_CONTROLS.has(action.control)
      ? displayedRibbonModel[action.control as NativeTextToggleControl] !== true : undefined;
    // A Delete pressed on the block a click has just selected is held until
    // its proof lands too: before it, the writer has nothing to delete.
    // A press while the line's own write or a check runs is held the same way
    // and runs once it is done: the controls never go grey under the reader.
    if ((formatProofPending || propertyControlsBusy || coverRuleHeld(action)) && control && nativeTextRibbonPressHeld(control) &&
      (control !== "delete" || onDeleteTextObject)) {
      // The press shows on the draft and the buttons at once (partFormats);
      // its write runs when the proof lands.
      const partsBefore = control === "delete" ? null : recordPartFormat(action);
      queueRibbonCommand(action, { ...(pressed === undefined ? {} : { pressed }),
        ...(partsBefore ? { partsBefore } : {}) });
      return;
    }
    // A change of case is typing: it goes through the line's own text.
    if (action.type === "changeCase") {
      changeInputCase(action.mode);
      return;
    }
    // Bullets and numbering are the markers written at each paragraph's
    // start: typing too (lib/pdf/text-list.ts).
    if (action.type === "list") {
      changeInputList(action.style);
      return;
    }
    pressPartsBeforeRef.current = recordPartFormat(action);
    handleRibbonActionImpl(action, pressed);
  };
  // A keyboard shortcut or menu command runs what its ribbon button runs,
  // only when that button would.
  const pressRibbonCommand = (action: PdfTextEditingContextRibbonAction) => {
    const control = nativeTextRibbonActionControl(action);
    // Before the line's proof (the editor not shown yet), a shortcut is held
    // and its control read once the proof is in (said then if refused).
    if (control && !nativeCapabilities[control].enabled && !(formatProofPending && nativeTextRibbonPressHeld(control))) {
      // Said, as its button says it (greyed, with why): a shortcut that did
      // nothing without a word looked done, and the format was simply not
      // there when the line was left.
      toast({ description: nativeCapabilities[control].reason ?? ribbonLabels.unavailable });
      return;
    }
    handleRibbonAction(action);
  };
  // What the controller's applyRibbonAction runs: the ribbon's own handler,
  // refused while that control is unavailable for this line (as its button).
  ribbonActionRef.current = (action) => {
    const control = action.type === "toggle" ? action.control
      : action.type === "fontColor" ? "fontColor"
      : action.type === "fontSize" ? "fontSize"
      : action.type === "fontFamily" ? "fontFamily"
      : action.type === "number" ? action.control : null;
    if (control && !nativeCapabilities[control as keyof typeof nativeCapabilities]?.enabled &&
      !(formatProofPending && nativeTextRibbonPressHeld(control as PdfTextEditingControl))) return false;
    
    // line is still proved or written is held and runs in order, as the
    
    
    const pressed = action.type === "toggle" && NATIVE_TEXT_TOGGLE_CONTROLS.has(action.control)
      ? displayedRibbonModel[action.control as NativeTextToggleControl] !== true : undefined;
    if ((formatProofPending || propertyControlsBusy || coverRuleHeld(action)) && control &&
      nativeTextRibbonPressHeld(control as PdfTextEditingControl)) {
      const partsBefore = recordPartFormat(action);
      queueRibbonCommand(action, { ...(pressed === undefined ? {} : { pressed }), ...(partsBefore ? { partsBefore } : {}) });
      return true;
    }
    pressPartsBeforeRef.current = recordPartFormat(action);
    handleRibbonActionImpl(action, pressed);
    return true;
  };
  refusalRef.current = (control) => {
    if (control) {
      const capability = nativeCapabilities[control];
      return capability && !capability.enabled ? capability.reason ?? null : null;
    }
    return commitError ?? previewError ?? effectiveApplyDisabledReason ?? null;
  };
  
  // the box's formats and runs before the step, and the text they were for
  // (typing since is the input's own undo).
  const pushManagedFormatStep = () => {
    const history = managedFormatHistoryRef.current;
    history.undo.push({ override: layoutTypographyOverride, runs: { text: replacementText, runs: managedRuns } });
    if (history.undo.length > 100) history.undo.shift();
    history.redo = [];
  };
  const stepManagedFormat = (direction: "undo" | "redo"): boolean => {
    const history = managedFormatHistoryRef.current;
    const from = direction === "undo" ? history.undo : history.redo;
    const to = direction === "undo" ? history.redo : history.undo;
    const step = from.at(-1);
    if (!managedLayoutTypography || !step || step.runs.text !== replacementText) return false;
    from.pop();
    to.push({ override: layoutTypographyOverride, runs: { text: replacementText, runs: managedRuns } });
    setLayoutTypographyOverride(step.override);
    setManagedRunsState(step.runs);
    return true;
  };
  /** Runs that say nothing of their own are no runs. */
  const settledManagedRuns = (runs: PdfTextStyleRun[] | undefined): PdfTextStyleRun[] | null =>
    runs && runs.some((run) => Object.keys(run).some((key) => key !== "text")) ? runs : null;
  /**
   * A scanned line becomes its text box (a character format pressed on it,
   * words typed into it, its box moved) with its rules: the ones standing in
   * the page beside its invisible words are what the box starts under
   * (nothing of them is a change to write), the ones pressed this session
   * are the box's formats from here on, and the page's own rule is not
   * written. Returns what the box starts under. Null, nothing changed: a
   * part of the line under a rule of its own is text the box's run writer
   * cannot draw -- the caller says so.
   */
  const coverRulesIntoBox = (press: boolean): Readonly<{
    underline: boolean; strikethrough: boolean; runs: PdfTextStyleRun[] | null;
  }> | null => {
    const pressed = partFormatsRef.current;
    const base = coverRulesProven
      ? pdfNativeCoverRulesCarry(coverRulesProven, originalText, NO_PART_FORMATS, originalText) : null;
    const session = pdfNativeCoverRulesPressed(pressed)
      ? pdfNativeCoverRulesCarry(coverRulesProven, originalText, pressed, replacementText) ?? NO_COVER_RULES_CARRY : null;
    // (Pressed and taken off again, the line's rules are the ones standing.)
    const full = session && (replacementText !== originalText ||
      JSON.stringify(session) !== JSON.stringify(base ?? NO_COVER_RULES_CARRY)) ? session : null;
    if ((base?.parts.length || full?.parts.length) && !pdfTextBoxDrawnRunsPortable([{
      text: replacementText, font: "sans", bold: false, italic: false, underline: false, strikethrough: false,
      fontSize: 0, color: "#000000",
    }])) return null;
    const runsOf = (carry: PdfNativeCoverRulesCarry | null, text: string): PdfTextStyleRun[] | null => {
      let runs: PdfTextStyleRun[] | undefined;
      for (const piece of carry?.parts ?? []) {
        runs = patchPdfTextStyleRunsRange(runs ?? [{ text }], text, piece.start, piece.end, {
          ...(piece.underline ? { underline: true } : {}), ...(piece.strikethrough ? { strikethrough: true } : {}) });
      }
      return settledManagedRuns(runs);
    };
    const baseRuns = runsOf(base, originalText);
    const start = { underline: Boolean(base?.whole.underline), strikethrough: Boolean(base?.whole.strikethrough),
      runs: baseRuns };
    if (full) {
      // One step of the box's undo when a press made the box: Cmd+Z takes
      // the press back, then the rules pressed before it.
      if (press && replacementText === originalText) {
        const history = managedFormatHistoryRef.current;
        history.undo.push({ override: layoutTypographyOverride, runs: { text: replacementText, runs: baseRuns } });
        if (history.undo.length > 100) history.undo.shift();
        history.redo = [];
      }
      const underline = Boolean(full.whole.underline), strikethrough = Boolean(full.whole.strikethrough);
      if (underline !== start.underline || strikethrough !== start.strikethrough) {
        setLayoutTypographyOverride((current) => ({ ...current,
          ...(underline !== start.underline ? { underline } : {}),
          ...(strikethrough !== start.strikethrough ? { strikethrough } : {}) }));
      }
      setManagedRunsState({ text: replacementText, runs: runsOf(full, replacementText) });
    } else {
      setManagedRunsState({ text: originalText, runs: baseRuns });
    }
    if (pressed.length) {
      partFormatsRef.current = NO_PART_FORMATS;
      setPartFormats(NO_PART_FORMATS);
    }
    // The presses are the box's steps now, not the line's.
    const steps = formatHistoryRef.current;
    steps.past = [];
    steps.future = [];
    steps.log = steps.log.filter((entry) => entry !== "format");
    steps.redoLog = steps.redoLog.filter((entry) => entry !== "format");
    return start;
  };
  /** A whole-box format: the runs stop stating it, so all of the text takes it. */
  const dropManagedRunFields = (fields: Partial<Omit<PdfTextStyleRun, "text" | "displayFontFamily">>) => {
    if (!managedRuns) return;
    setManagedRunsState({
      text: replacementText,
      runs: settledManagedRuns(patchPdfTextStyleRuns(managedRuns, replacementText, fields)),
    });
  };
  /** A format put on characters [start, end) of a text-box line (WPS):
   * the run is split there (lib/pdf/text-style-runs.ts). */
  const applyManagedRunFormat = (
    range: Readonly<{ start: number; end: number }>,
    patch: Partial<Omit<PdfTextStyleRun, "text" | "displayFontFamily">>,
  ) => {
    pushManagedFormatStep();
    setManagedRunsState({
      text: replacementText,
      runs: settledManagedRuns(patchPdfTextStyleRunsRange(
        managedRuns ?? [{ text: replacementText }], replacementText, range.start, range.end, patch,
      )),
    });
  };
  /** The run fields of a face from the font list: a portable option, or an
   * Office family of All Fonts; null for any other family. */
  const managedFaceFields = (value: string): Partial<PdfTextStyleRun> | null => {
    const option = TEXTBOX_FONT_FAMILY_OPTIONS.find((candidate) => candidate.id === value);
    if (option) {
      return { fontFamily: option.stack, sourceFontName: option.sourceFontName, officeFamily: undefined };
    }
    const family = pdfTextBoxOfficeFamily(value);
    return family
      ? {
          fontFamily: pdfTextBoxRunCssFamily({ font: classifyFontName(family), officeFamily: family }),
          sourceFontName: family,
          officeFamily: family,
        }
      : null;
  };
  const managedSizeSteps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const applyManagedPartFormat = (
    range: Readonly<{ start: number; end: number }>,
    action: PdfTextEditingContextRibbonAction,
  ) => {
    const style = managedStyleOver(range);
    const pointHeight = managedPointHeight;
    const maxPoints = Math.min(512, pointHeight);
    switch (action.type) {
      case "fontFamily": {
        const fields = managedFaceFields(action.value);
        if (!fields) {
          sayLocalFontNotWritable(action.value);
          return;
        }
        applyManagedRunFormat(range, fields);
        return;
      }
      case "fontSize":
        if (Number.isFinite(action.value) && action.value >= 1 && action.value <= maxPoints) {
          applyManagedRunFormat(range, { fontSize: action.value / pointHeight });
        }
        return;
      case "fontSizeStep": {
        const points = style?.fontSize ?? managedFontSize;
        if (!points) return;
        const next = action.delta > 0
          ? managedSizeSteps.find((value) => value > points) ?? Math.min(1000, points + 1)
          : [...managedSizeSteps].reverse().find((value) => value < points) ?? Math.max(1, points - 1);
        applyManagedRunFormat(range, { fontSize: Math.min(next, maxPoints) / pointHeight });
        return;
      }
      case "fontColor":
        if (/^#[0-9a-f]{6}$/i.test(action.value)) applyManagedRunFormat(range, { color: action.value.toLowerCase() });
        return;
      case "toggle":
        switch (action.control) {
          case "bold":
          case "italic":
          case "underline":
          case "strikethrough":
            applyManagedRunFormat(range, { [action.control]: !style?.[action.control] } as Partial<PdfTextStyleRun>);
            return;
          case "superscript":
          case "subscript":
            applyManagedRunFormat(range, { script: style?.[action.control] ? undefined : action.control });
            return;
          case "clearFormatting": {
            const option = managedFontOptions.find((candidate) => candidate.id === "cjkSans") ??
              managedFontOptions.find((candidate) => candidate.id === "helvetica");
            applyManagedRunFormat(range, {
              ...(option ? { fontFamily: option.stack, sourceFontName: option.sourceFontName } : {}),
              officeFamily: undefined,
              fontSize: Math.min(NATIVE_TEXT_DEFAULT_POINTS, maxPoints) / pointHeight,
              bold: false, italic: false, underline: false, strikethrough: false, script: undefined,
              color: "#000000",
            });
            return;
          }
          default:
            return;
        }
      default:
        return;
    }
  };
  // A family found on this computer (Browse) for a text box: the PDF writer
  // holds no program of it, unlike every Office family of All Fonts.
  const sayLocalFontNotWritable = (family: string) => {
    toast({
      description: translate("pdf.textBoxRuns.localFontNotWritable", {
        family: ribbonFontFamilyLabel(family),
      }),
    });
  };
  /** A family the editor knows how to set: one of the PDF's own faces, a
   * served family, a page font, a text-box class face or an embedded key. */
  const knownFontValue = (value: string) =>
    Boolean(propertyProofInput?.fonts.some((font) => font.resourceName === value)) ||
    Boolean(embeddableFontFamily(value)) || Boolean(readPdfPageFontFamilyToken(value)) ||
    managedFontOptions.some((option) => option.id === value) || isPdfNativeEmbeddedFontKey(value);
  /**
   * A family found on the reader's computer (Browse): WPS sets text in any
   * installed font. The window prepares it for the page (read, licence
   * checked, embedded as the page's own face) or names the nearest served
   * family it can be set in instead, and the choice is made again with that
   * name once it is ready.
   */
  const prepareLocalFont = (action: Extract<PdfTextEditingContextRibbonAction, { type: "fontFamily" }>) => {
    if (!onPreparePageFont) {
      if (properties) sayFontNotEmbeddable(action.value);
      else sayLocalFontNotWritable(action.value);
      return;
    }
    const range = partialTextRange();
    const style = range
      ? properties
        ? { bold: partialBold(range), italic: partialItalic(range) }
        : { bold: Boolean(managedStyleOver(range)?.bold ?? managedBold), italic: Boolean(managedStyleOver(range)?.italic ?? managedItalic) }
      : { bold: currentBold, italic: currentItalic };
    setPreparingFontFamily(action.value);
    void onPreparePageFont(action.value, style, replacementText).then((result) => {
      if (result?.notice) toast({ description: result.notice });
      if (result && knownFontValue(result.family)) pendingFontActionRef.current = { ...action, value: result.family };
      setPreparingFontFamily(null);
    }, () => setPreparingFontFamily(null));
  };
  /** The rules the session's parts press (partFormats), on the run's own
   * property write: drawn under (across) the characters they name in the
   * same write as the run's other formats (textRuleParts). */
  const withPartRules = (draft: PdfNativeTextPropertyDraft, parts: PdfTextPartFormats): PdfNativeTextPropertyDraft => {
    const ruleParts = (["underline", "strikethrough"] as const).flatMap((style) =>
      pdfTextPartRuleStretches(parts, style).map((stretch) => Object.freeze({ style, ...stretch })));
    const { textRuleParts: _old, ...rest } = draft;
    void _old;
    return ruleParts.length ? { ...rest, textRuleParts: Object.freeze(ruleParts) } : rest;
  };
  withPartRulesRef.current = withPartRules;
  setPropertiesRef.current = setProperties;
  /** A character format pressed on part of the run: that part of its draft. */
  const pressPartInDraft = (range: { start: number; end: number }, action: PdfTextEditingContextRibbonAction) => {
    if (!properties || !propertyProof) return;
    const fields = partialFormatOf(range);
    const size = typeof fields?.fontSize === "number" ? fields.fontSize : properties.fontSize;
    const rise = typeof fields?.textRise === "number" ? fields.textRise : 0;
    switch (action.type) {
      case "fontFamily":
        if (propertyProof.fonts.some((font) => font.resourceName === action.value)) {
          applyPartialFormat(range, { fontResourceName: action.value });
        } else if (embeddableFontFamily(action.value) || readPdfPageFontFamilyToken(action.value)) {
          // WPS: the part is set in the family, its served substitute (or
          // the page's own copy of a font from the reader's computer)
          // embedded into the PDF when the line is written.
          applyPartialFormat(range, {
            fontResourceName: pdfNativeEmbeddedFontKey({
              family: action.value,
              bold: partialBold(range),
              italic: partialItalic(range),
            }),
            syntheticBold: false,
            slanted: false,
          });
        } else {
          sayFontNotEmbeddable(action.value);
        }
        return;
      case "fontSize":
        if (Number.isFinite(action.value) && action.value >= 1 && action.value <= 1000) {
          // A scripted part is drawn at 2/3 of the size asked, as Word
          
          applyPartialFormat(range, nativeTextSizeOfScriptedRun(action.value / nativeTextMatrixScale, rise));
        }
        return;
      case "fontSizeStep": {
        if (typeof fields?.fontSize !== "number") return;
        const points = (rise === 0 ? fields.fontSize : nativeTextNormalState({ fontSize: fields.fontSize, textRise: rise }).fontSize) *
          nativeTextMatrixScale;
        const next = nativeTextFontSizeStep(points, action.delta);
        applyPartialFormat(range, nativeTextSizeOfScriptedRun(next / nativeTextMatrixScale, rise));
        return;
      }
      case "fontColor":
        if (/^#[0-9a-f]{6}$/i.test(action.value)) applyPartialFormat(range, { color: colorFromHex(action.value) });
        return;
      case "toggle":
        if (action.control === "bold") selectStyle(!currentBold, currentItalic);
        else if (action.control === "italic") selectStyle(currentBold, !currentItalic);
        else if (action.control === "superscript" || action.control === "subscript") {
          applyPartialFormat(range, nativeTextRiseToggle({ fontSize: size, textRise: rise }, rise, action.control));
        } else if (action.control === "clearFormatting") {
          const defaultFace = propertyProof.fonts.find((font) =>
            !font.bold && !font.italic && isNativeTextDefaultFace(font.baseFont));
          const face = partialFace(range);
          const regularFace = face && (face.bold || face.italic)
            ? propertyProof.fonts.find((font) => nativeTextSameFamily(font, face) && !font.bold && !font.italic)
            : undefined;
          applyPartialFormat(range, {
            fontResourceName: (defaultFace ?? regularFace ?? face ?? editableFont)?.resourceName ?? properties.fontResourceName,
            fontSize: Math.round(NATIVE_TEXT_DEFAULT_POINTS / nativeTextMatrixScale * 1e6) / 1e6,
            color: { kind: "rgb", components: [0, 0, 0] },
            syntheticBold: false,
            slanted: false,
            textRise: 0,
          });
        }
        return;
      default:
        return;
    }
  };
  /** What a press of this format would write on the part selected, the line's
   * own draft left as it is; null where it would write nothing. */
  const draftOfPartPress = (range: { start: number; end: number }, action: PdfTextEditingContextRibbonAction) => {
    const asked = { draft: properties };
    propertyPressAskedRef.current = asked;
    try {
      pressPartInDraft(range, action);
    } finally {
      propertyPressAskedRef.current = null;
    }
    return asked.draft === properties ? null : asked.draft;
  };
  const handleRibbonActionImpl = (action: PdfTextEditingContextRibbonAction,
    /** The toggle's state the press asked (read when it was pressed). */
    pressedArg?: boolean) => {
    if (action.type === "fontFamily" && !knownFontValue(action.value)) {
      prepareLocalFont(action);
      return;
    }
    const want = (control: NativeTextToggleControl) => pressedArg ?? displayedRibbonModel[control] !== true;
    // 加粗 on a run of right-to-left text in a bold face of its own (boldFaceRun):
    // taken off by its paragraph's writer where the engine says the box's words
    // can be set in the family's regular face, said as the face's own where not;
    // pressed again in the same draft, that press is taken back.
    if (action.type === "toggle" && action.control === "bold" && boldFaceRun && !managedLayoutTypography && !partialTextRange()) {
      const off = !want("bold");
      if (off && boxDrawnStyle?.regularFace === true && onApplyParagraphFormat) {
        setRowFormat((current) => ({ ...(current ?? {}), bold: false }));
        return;
      }
      if (off) {
        refusePartPress(translate("pdf.nativeTextEdit.boldFaceKeptRightToLeft"));
        return;
      }
      if (rowFormat?.bold === false) {
        setRowFormat((current) => {
          const { bold: _bold, ...rest } = current ?? {};
          void _bold;
          return Object.keys(rest).length ? rest : null;
        });
        return;
      }
    }
    // 加粗 on a run of Type3 letters that take it (type3WeightRun): the box's
    // format, asked of its paragraph's writer when the line is left; pressed
    // again in the same draft, that press is taken back.
    if (action.type === "toggle" && action.control === "bold" && type3WeightRun && !managedLayoutTypography && !partialTextRange()) {
      const on = want("bold");
      setRowFormat((current) => {
        if (current?.bold !== undefined) {
          const { bold: _bold, ...rest } = current;
          void _bold;
          return Object.keys(rest).length ? rest : null;
        }
        return { ...(current ?? {}), bold: on };
      });
      return;
    }
    // (A bold that is the face's own, pressed off: boldFaceKeptReason.)
    if (action.type === "toggle" && action.control === "bold" && boldFaceKeptReason && !want("bold")) {
      // (A bold this draft asked of the box's other words is taken back, the
      // box as the page draws it again: nothing of that is the face's.)
      if (rowFormat?.bold === true) {
        setRowFormat((current) => {
          const { bold: _bold, ...rest } = current ?? {};
          void _bold;
          return Object.keys(rest).length ? rest : null;
        });
        return;
      }
      refusePartPress(boldFaceKeptReason);
      return;
    }
    // A rule pressed on a run its property proof states (the selected
    // characters, else the whole run) is written with the run's other
    // formats, in one write, under the characters as that write places
    // them; the draft shows it meanwhile (partFormats). It used to be a write
    // of its own staged on the copy at once, which raced the run's own format
    
    if (action.type === "toggle" && (action.control === "underline" || action.control === "strikethrough") &&
      !managedLayoutTypography && properties && propertyProof) {
      setProperties(withPartRules(properties, partFormatsRef.current));
      return;
    }
    // A rule pressed on a scanned line the window proves a rule is written
    // beside (coverRulesLane) is the page's own: recorded on the characters
    // it is pressed on (the selection, else the whole line) and asked of the
    // page when the line is left (rowFormat: rule parts of the box's text,
    // which the window writes beside the invisible words). The scanned
    // words stay the scan's; no text box is made and none is announced.
    if (coverRulesLane && coverRulesProven && action.type === "toggle" &&
      (action.control === "underline" || action.control === "strikethrough")) {
      const style = action.control;
      const on = want(style);
      const range = partialTextRange() ?? { start: 0, end: replacementText.length };
      const partsBefore = partFormatsRef.current;
      const next = applyPdfTextPartFormat(partsBefore, range, { [style]: on });
      const history = formatHistoryRef.current;
      history.past.push(Object.freeze({ parts: partsBefore, properties: propertyOverride, rowFormat,
        queued: queuedRibbonActionsRef.current.length }));
      if (history.past.length > 200) history.past.shift();
      history.log.push("format");
      history.future = [];
      history.redoLog = [];
      partFormatsRef.current = next;
      setPartFormats(next);
      // Asked only while the presses leave the line under other rules than
      // the ones standing: pressed and taken off again, nothing is written.
      const changed = PDF_NATIVE_COVER_RULE_STYLES.some((each) =>
        JSON.stringify(pdfNativeCoverRuleStretches(coverRulesProven[each], next, each, replacementText)) !==
        JSON.stringify(pdfNativeCoverRuleStretches(coverRulesProven[each], NO_PART_FORMATS, each, replacementText)));
      const others = rowFormatWithoutCoverRules(rowFormat);
      const segments = changed ? pdfNativeCoverRuleSegments(next) : [];
      setRowFormat(segments.length
        ? Object.freeze({ ...(others ?? {}), segments: Object.freeze([...(others?.segments ?? []), ...segments]) })
        : others);
      markPdfTextLatency("lane.cover-rule", { style, on, part: range.end - range.start < replacementText.length });
      return;
    }
    // A scanned line (coverLaneLine: nothing of it is drawn, so no row of it
    // can take a format in the page's text) takes a character format where
    // its typing is written: as the text box over the scanned words, which
    
    // and run there as a saved box's press is run (its part as runs, the
    // whole box as the box's own format, one step of the box's undo), so the
    // button reads pressed, Cmd+Z takes it back and a second press takes it
    // off. A rule under it is the box's too: the page's own rule is written
    // beside a run its proof states, and an invisible run has none.
    if (coverLaneLine && textBoxTakeoverEligible &&
      pdfTextBoxCharacterFormatPress(action, Math.min(512, managedPointHeight))) {
      const officeFamily = action.type === "fontFamily" && !managedFontOptions.some((option) => option.id === action.value)
        ? pdfTextBoxOfficeFamily(action.value) : null;
      if (action.type === "fontFamily" && !officeFamily && !managedFontOptions.some((option) => option.id === action.value)) {
        // No face the box's writer holds: said, the line left as it is.
        sayLocalFontNotWritable(action.value);
        return;
      }
      // A part in its own format, a raised or lowered script and an Office
      // family are written run by run, in faces that hold only some
      // characters (lib/pdf/text-box-runs.ts). Text those faces cannot draw
      // (an Urdu line) is one style or nothing: refused here and said, the
      // line left as it is, instead of a draft its box could then not save.
      const part = partialTextRange();
      const script = action.type === "toggle" && (action.control === "superscript" || action.control === "subscript");
      if ((part || script || officeFamily) && !pdfTextBoxDrawnRunsPortable([{
        text: replacementText, font: "sans", bold: false, italic: false, underline: false, strikethrough: false,
        fontSize: 0, color: "#000000", ...(officeFamily && !part && !script ? { officeFamily } : {}),
      }])) {
        if (part) toast({ description: translate("pdf.nativeTextEdit.characterFormatWholeRun") });
        else refusePartPress();
        return;
      }
      // A press made before the line was known to be a scan's (held for its
      // proof) was recorded on the draft as a line's press is (partFormats):
      // the box takes that press itself below, queued, and the presses held
      // behind it run as the box's own after it -- so what the box starts
      // under is the draft as it stood before this press. Carried with it,
      // a 下划线 pressed before the line had opened was the box's rule
      // already and the queued press took it off again: the button read
      // unpressed, nothing was written and nothing was said
      
      const recordedBefore = pressPartsBeforeRef.current;
      if (recordedBefore && recordedBefore !== partFormatsRef.current) {
        partFormatsRef.current = recordedBefore;
        setPartFormats(recordedBefore);
      }
      pressPartsBeforeRef.current = null;
      // Its own rules, the page's until now, go with it into the box: a
      // rule pressed before this format is the box's underline, never lost.
      const carried = coverRulesIntoBox(true);
      if (!carried) {
        toast({ description: translate("pdf.nativeTextEdit.formatNotApplied") });
        return;
      }
      markPdfTextLatency("lane.text-box", { action: action.type, cover: true, part: Boolean(part) });
      if (propertyOverride && !propertyProof) setProperties(null);
      // What the line's rows were asked before (rowFormat, which no row of
      // an invisible line can take): its alignment is the box's from here;
      // anything else is said as not applied now, as leaving would say it.
      // (Its rule parts were the line's own rules: carried just above.)
      const rowsAsked = rowFormatWithoutCoverRules(rowFormat);
      if (rowFormat) setRowFormat(null);
      if (rowsAsked) {
        const { alignment, ...rest } = rowsAsked;
        if (alignment === "left" || alignment === "center" || alignment === "right") {
          setLayoutTypographyOverride((current) => ({ alignment, ...current }));
        } else if (alignment === "justify") {
          setLayoutTypographyOverride((current) => ({ justify: true, ...current }));
        }
        if (Object.keys(rest).length > 0 || alignment === "distribute") {
          toast({ description: translate("pdf.nativeTextEdit.formatNotApplied") });
        }
      }
      // The box starts in the weight and slant the buttons show for the line
      // and under the rules standing beside it.
      setCoverBoxStyle({ bold: Boolean(currentBold), italic: Boolean(currentItalic), ...carried });
      queueRibbonCommand(action, pressedArg === undefined ? undefined : { pressed: pressedArg });
      return;
    }
    // A line that states no one run's format (textBoxTakeoverEligible): what
    
    // as its group's, its colour as the paragraph's, rules beside its runs);
    
    // the page draws it, and lands on the selected part.
    if (textBoxTakeoverEligible) {
      const range = partialTextRange();
      // The whole box's family, colour or slant, its rows each one run in
      // one style: set on each row in the page's own text when it is left
      
      // which wrote at once, AutoSave off too (a paragraph Enter had made
      
      // The box's rows in its canonical text (sourceInputLayout): a format
      // on a part of one row is that row's own, set in the page's text too
      // (a title set again in two rows, then its last word a subscript,
      
      const rowRanges = sourceInputLayout && sourceInputLayout.breaks.length > 0
        ? [0, ...sourceInputLayout.breaks.map((line) => pdfNativeTextInputCanonicalOffset(sourceInputLayout, line.offset + 1))]
          .map((start, index, starts) => ({ start, end: index + 1 < starts.length
            ? pdfNativeTextInputCanonicalOffset(sourceInputLayout, sourceInputLayout.breaks[index].offset)
            : sourceInputLayout.text.length }))
        : null;
      // The rows the selected part lies on, each with its own stretch of it:
      // a part that runs from one row into the next is a part of each.
      const rowPieces = range && rowRanges
        ? rowRanges.flatMap((row, index) => {
          const start = Math.max(range.start, row.start), end = Math.min(range.end, row.end);
          return end > start ? [{ row: index, start: start - row.start, end: end - row.start }] : [];
        })
        : [];
      // A line of one row drawn as several runs (a Chinese face and a Latin
      // one): the part is given in the line's own text (row -1), and the
      // window maps it onto the runs it covers.
      if (range && !rowRanges && onApplyRowFormat) rowPieces.push({ row: -1, start: range.start, end: range.end });
      const rowOfRange = rowPieces.length ? rowPieces[0].row : -1;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[pdf-text] row format asked " + JSON.stringify({ action: action.type,
          control: action.type === "toggle" ? action.control : undefined, range, rows: rowRanges, rowOfRange,
          apply: Boolean(onApplyRowFormat), contentDraftDirty }));
      }
      
      // group scaled about its frame, its outlines stroked) stays there: set
      // on each run, the words of a line drawn word by word grew into each
      // other.
      const groupTakes = !range && ((groupPoints !== null && (action.type === "fontSize" || action.type === "fontSizeStep")) ||
        (groupBoldTakesPress && action.type === "toggle" && action.control === "bold"));
      if (onApplyRowFormat && !groupTakes && (!range || rowPieces.length > 0)) {
        // What the press asks of each row (or of the part): null when the
        // rows cannot take it in place.
        const basePoints = readerPointSize ?? groupPoints;
        // Any face the editor knows (one of the PDF's own, a served family,
        // a page font, an embedded key) and any colour: the rows take what
        // they can in place and the box's paragraph the rest.
        const fields: PdfNativeRowFormatFields | null =
          action.type === "fontFamily" && knownFontValue(action.value)
            ? { family: action.value }
            : action.type === "fontColor" && /^#[0-9a-f]{6}$/i.test(action.value)
              ? { color: action.value.toLowerCase() }
              : action.type === "fontSize" && !action.draft && Number.isFinite(action.value) && action.value > 0
                ? { sizePoints: action.value }
                : action.type === "fontSizeStep" && basePoints !== null && basePoints > 0
                  ? { sizePoints: nativeTextFontSizeStep(basePoints, action.delta) }
                  : action.type === "toggle" && action.control === "italic"
                    ? { italic: want("italic") }
                    : action.type === "toggle" && action.control === "bold"
                      ? { bold: want("bold") }
                      : action.type === "toggle" && (action.control === "superscript" || action.control === "subscript")
                        ? { script: want(action.control) ? action.control : "none" }
                        // A rule under the part (or the box), drawn beside
                        // each row's run in that row's own write.
                        : action.type === "toggle" && (action.control === "underline" || action.control === "strikethrough")
                          ? { [action.control]: want(action.control) }
                          : null;
        if (fields) {
          if (!range) {
            // Each choice on what the box holds by then (two in one go keep
            // both); a toggle sets the state its press asked.
            setRowFormat((current) => ({ ...current, ...fields }));
          } else if (replacementText !== originalText) {
            // Words typed: the parts are the session's (partFormats), moved
            // with the words; the box's paragraph is set again with them
            // when it is left (requestApply).
            setRowFormat((current) => current ?? {});
          } else {
            // The part is given in the box's own text (row -1), which the
            // window cuts at the ends of the runs it reads: the rows here are
            // the box's visual rows, and the window's are its runs -- a line
            // whose first word is a run of its own (USGS 「Cenozoic.」 in
            // italic) shifted every row by one, and the bold, italic and
            // underline pressed on 「Period and」 landed on 「21st century」.
            const pieces = [{ row: -1, start: range.start, end: range.end }];
            setRowFormat((current) => {
              let segments = [...(current?.segments ?? [])];
              for (const piece of pieces) {
                // A later press on the same part adds to it; one on an
                // overlapping other part replaces what it covers.
                const same = segments.find((entry) => entry.row === piece.row &&
                  entry.start === piece.start && entry.end === piece.end);
                segments = segments.filter((entry) => entry.row !== piece.row ||
                  entry.end <= piece.start || entry.start >= piece.end);
                segments.push(same ? { ...same, ...fields } : { ...piece, ...fields });
              }
              return { ...current, segments: segments.sort((a, b) => a.row - b.row || a.start - b.start) };
            });
          }
          return;
        }
      }
      const inPlace =
        action.type === "fontSize" || action.type === "fontSizeStep"
          ? !range && groupPoints !== null
          : action.type === "fontColor"
            ? !range && Boolean(paragraphColors && paragraphColors.length >= 2)
            : action.type === "toggle"
              ? action.control === "bold"
                ? !range && groupBoldTakesPress
                : action.control === "underline" || action.control === "strikethrough"
                  ? Boolean(onApplyRowFormat)
                  : !["italic", "superscript", "subscript", "clearFormatting"].includes(action.control)
              : action.type !== "fontFamily";
      if (!inPlace) {
        
        // the draft goes back: the line is never set again as a text box for
        // it (its other words' faces, sizes and rules were lost there; owner
        
        refusePartPress();
        return;
      }
    }
    // A character format with part of the text selected is that part's own
    // (WPS: two characters made bold change only those two): the run is
    // split there when it is written. A text box keeps formats for its whole
    // text, and says so.
    const range = action.type === "fontFamily" || action.type === "fontSize" ||
      action.type === "fontSizeStep" || action.type === "fontColor" || action.type === "toggle"
      ? partialTextRange() : null;
    // A text-box line's part takes the format as runs of its own (WPS).
    if (range && managedLayoutTypography) {
      if (managedTypographyEditable) applyManagedPartFormat(range, action);
      else {
        
        // or its last press is still being written: the press is held in
        // order with any other and runs once the box is free. One slot held
        // the last press only, so Underline pressed twice while the first
        
        queueRibbonCommand(action);
        setStickyFormatPreview(formatPreview);
      }
      return;
    }
    if (range && (!properties || !propertyProof)) {
      const before = pressPartsBeforeRef.current;
      if (before) {
        partFormatsRef.current = before;
        setPartFormats(before);
      }
      toast({ description: translate("pdf.nativeTextEdit.characterFormatWholeRun") });
      return;
    }
    
    if (managedTypographyEditable && !properties && ["fontFamily", "fontSize", "fontSizeStep", "toggle",
      "fontColor", "alignment", "number"].includes(action.type)) pushManagedFormatStep();
    if (range && properties && propertyProof) {
      pressPartInDraft(range, action);
      return;
    }
    switch (action.type) {
      case "fontFamily":
        if (properties) {
          if (propertyProof && !propertyProof.fonts.some((font) => font.resourceName === action.value)) {
            if (embeddableFontFamily(action.value) || readPdfPageFontFamilyToken(action.value)) {
              setProperties(withEmbeddedRunFont(properties, action.value, currentBold, currentItalic));
            } else {
              sayFontNotEmbeddable(action.value);
            }
            return;
          }
          setProperties({ ...properties, fontResourceName: action.value });
        } else if (managedTypographyEditable && managedFontOptions.some(option => option.id === action.value)) {
          const option = managedFontOptions.find(candidate => candidate.id === action.value)!;
          const baselineClass = classifyFontName(initialLayout?.box.sourceFontName || initialLayout?.box.fontFamily);
          // A box set in an Office family takes the portable face itself
          // (its own source stack is that family's).
          setLayoutTypographyOverride(current => ({ ...current,
            fontId: classifyFontName(option.sourceFontName) === baselineClass && !initialManagedOfficeFamily
              ? undefined : action.value,
            officeFamily: initialManagedOfficeFamily ? null : undefined,
          }));
          dropManagedRunFields({ fontFamily: undefined, sourceFontName: undefined, officeFamily: undefined });
        } else if (managedTypographyEditable && pdfTextBoxOfficeFamily(action.value)) {
          // Any Office family of All Fonts: the writer embeds its served
          // substitute (lib/pdf/text-box-runs.ts).
          const family = pdfTextBoxOfficeFamily(action.value)!;
          setLayoutTypographyOverride(current => ({ ...current, fontId: undefined,
            officeFamily: family === initialManagedOfficeFamily ? undefined : family }));
          dropManagedRunFields({ fontFamily: undefined, sourceFontName: undefined, officeFamily: undefined });
        } else if (managedTypographyEditable) {
          sayLocalFontNotWritable(action.value);
        }
        return;
      case "fontSize":
        if (groupPoints !== null) {
          if (Number.isFinite(action.value) && action.value >= 1 && action.value <= 1000) setGroupFontPoints(action.value);
        } else if (properties && Number.isFinite(action.value) && action.value >= 1 && action.value <= 1000) {
          // The value typed is a paper size; the run stores it as Tf.
          setProperties({ ...properties, fontSize: action.value / nativeTextMatrixScale });
        } else if (managedTypographyEditable && Number.isFinite(action.value) &&
          action.value >= 1 && action.value <= Math.min(512, managedPointHeight)) {
          setLayoutTypographyOverride(current => ({ ...current, fontSize: action.value }));
          dropManagedRunFields({ fontSize: undefined });
        }
        return;
      case "fontSizeStep": {
        const currentSize = groupPoints ?? (properties
          ? properties.fontSize * nativeTextMatrixScale
          : managedFontSize);
        if (currentSize === null || (groupPoints === null && !properties && !managedTypographyEditable)) return;
        const next = nativeTextFontSizeStep(currentSize, action.delta);
        if (groupPoints !== null) setGroupFontPoints(next);
        else if (properties) setProperties({ ...properties, fontSize: next / nativeTextMatrixScale });
        else {
          setLayoutTypographyOverride(current => ({ ...current,
            fontSize: Math.min(next, 512, managedPointHeight) }));
          dropManagedRunFields({ fontSize: undefined });
        }
        return;
      }
      case "toggle":
        if (action.control === "clearFormatting") {
          clearTextFormatting();
          return;
        }
        if (managedTypographyEditable) {
          // With runs, a whole-box toggle sets what all of the text lacks
          // (pressed only when all of it has it) and the runs stop stating it.
          const whole = managedDrawsRuns ? managedStyleOver({ start: 0, end: replacementText.length }) : null;
          if (action.control === "bold" && boldVariantAvailable) {
            setLayoutTypographyOverride(current => ({...current, bold: !(whole?.bold ?? managedBold)}));
            dropManagedRunFields({ bold: undefined });
          }
          if (action.control === "italic" && italicVariantAvailable) {
            setLayoutTypographyOverride(current => ({...current, italic: !(whole?.italic ?? managedItalic)}));
            dropManagedRunFields({ italic: undefined });
          }
          if (action.control === "underline") {
            setLayoutTypographyOverride(current => ({...current, underline: !(whole?.underline ?? managedUnderline)}));
            dropManagedRunFields({ underline: undefined });
          }
          if (action.control === "strikethrough") {
            setLayoutTypographyOverride(current => ({...current, strikethrough: !(whole?.strikethrough ?? managedStrikethrough)}));
            dropManagedRunFields({ strikethrough: undefined });
          }
          if (action.control === "superscript" || action.control === "subscript") {
            // The box's script is its runs' (the run writer draws it).
            const on = managedStyleOver({ start: 0, end: replacementText.length })?.[action.control];
            setManagedRunsState({
              text: replacementText,
              runs: settledManagedRuns(patchPdfTextStyleRuns(managedRuns ?? [{ text: replacementText }], replacementText,
                { script: on ? undefined : action.control })),
            });
          }
          return;
        }
        if (action.control === "superscript" || action.control === "subscript") {
          applyNativeTextRise(action.control);
          return;
        }
        if (action.control === "bold" && groupBold !== null) {
          
          if (groupBoldOffLeavesBoldFaces) refusePartPress();
          else toggleGroupBold();
        } else if (action.control === "bold") {
          selectStyle(
            !currentBold,
            currentItalic,
          );
        } else if (action.control === "italic") {
          selectStyle(
            currentBold,
            !currentItalic,
          );
        }
        return;
      case "fontColor":
        if (managedTypographyEditable && /^#[0-9a-f]{6}$/i.test(action.value)) {
          setLayoutTypographyOverride(current => ({...current, color: action.value.toLowerCase()}));
          dropManagedRunFields({ color: undefined });
        } else if (properties && /^#[0-9a-f]{6}$/i.test(action.value)) {
          setProperties({ ...properties, color: colorFromHex(action.value) });
        } else if (paragraphColors && paragraphColors.length >= 2 && /^#[0-9a-f]{6}$/i.test(action.value)) {
          setParagraphColor(colorFromHex(action.value));
        }
        return;
      case "verticalAlign":
        if (layoutFallbackActive) {
          setLayoutTypographyOverride((current) => ({ ...current, verticalAlign: action.value }));
        }
        return;
      case "alignment":
        if (action.value === "justify" || action.value === "distributed") {
          // A text box justifies itself; a paragraph of several rows is set
          // again justified (分散对齐: its last line too) when it is left; a
          // native paragraph its proof states is its own transaction.
          if (managedTypographyEditable && action.value === "justify") {
            setLayoutTypographyOverride(current => ({ ...current, justify: !managedJustify }));
          } else if (paragraphRewritable) {
            setRowFormat((current) => ({ ...(current ?? {}),
              alignment: action.value === "distributed" ? "distribute" : "justify" }));
          } else if (onJustifyParagraph && action.value === "justify") void onJustifyParagraph();
          return;
        }
        if (managedTypographyEditable) {
          setLayoutTypographyOverride(current => ({ ...current, justify: false }));
        }
        if (
          (action.value === "left" ||
            action.value === "center" ||
            action.value === "right")
        ) {
          if (paragraphRewritable && !paragraphAlignable) setRowFormat((current) => ({
            ...(current ?? {}), alignment: action.value as "left" | "center" | "right",
          }));
          else if (properties) applyNativeAlignment(action.value as "left" | "center" | "right");
          else if (managedTypographyEditable) setLayoutTypographyOverride(current => ({
            ...current, alignment: action.value as "left" | "center" | "right",
          }));
          // A paragraph of several rows no run's proof states (most body
          // text: the IPCC report's every paragraph): set again in its frame
          // in that alignment by the paragraph rewrite, with its rows' other
          // formats, when it is left (applyBoxFormat). The press did nothing,
          
          else if (paragraphAlignable) setRowFormat((current) => ({
            ...(current ?? {}), alignment: action.value as "left" | "center" | "right",
          }));
        }
        return;
      case "indent":
        // Word moves the paragraph to the next default tab stop, counted
        // from where the run first started (journal), never left of that.
        if (properties && displayedLeftIndent !== null) {
          const next = nextNativeIndentStop(displayedLeftIndent, action.direction);
          if (next !== displayedLeftIndent) applyDisplayedLeftIndent(next);
        } else if (paragraphAlignable) {
          // A paragraph of several rows: set again with its left edge at
          // that stop when it is left (as its alignment is).
          setRowFormat((current) => {
            const next = nextNativeIndentStop(current?.leftIndent ?? 0, action.direction);
            const rest: PdfNativeRowFormat = { ...(current ?? {}) };
            delete (rest as { leftIndent?: number }).leftIndent;
            return next > 0 ? { ...rest, leftIndent: next } : rest;
          });
        }
        return;
      case "number": {
        
        // are in its bytes: browser-text-layout rows, the API's spaced rows).
        if (!properties && managedTypographyEditable && Number.isFinite(action.value) &&
          (action.control === "characterSpacing" || action.control === "wordSpacing" ||
            action.control === "horizontalScale")) {
          if (action.control === "horizontalScale" && !(action.value > 0)) return;
          setLayoutTypographyOverride((current) => ({ ...current, [action.control]: action.value }));
          return;
        }
        // A paragraph of several rows: its line spacing, first line indent
        // and character spacing, set by the paragraph rewrite when it is left.
        if (((!properties && paragraphAlignable) || (paragraphRewritable && action.control === "lineSpacing" &&
          !nativeLineSpacingEditable)) && Number.isFinite(action.value)) {
          const value = action.value;
          if (action.control === "lineSpacing" && value > 0 && paragraphOwnLineStep) {
            setRowFormat((current) => {
              const { lineStep: _was, ...rest }: PdfNativeRowFormat = current ?? {};
              void _was;
              return Math.abs(value - paragraphOwnLineStep) < 0.01 ? rest : { ...rest, lineStep: value };
            });
            return;
          }
          if (action.control === "firstLineIndent") {
            setRowFormat((current) => {
              const { firstLineIndent: _was, ...rest }: PdfNativeRowFormat = current ?? {};
              void _was;
              return Math.abs(value) < 0.01 ? rest : { ...rest, firstLineIndent: value };
            });
            return;
          }
          if (action.control === "characterSpacing" && paragraphSourcePoints > 0) {
            setRowFormat((current) => {
              const { characterSpacingEm: _was, ...rest }: PdfNativeRowFormat = current ?? {};
              void _was;
              return Math.abs(value) < 0.01 ? rest : { ...rest, characterSpacingEm: value / paragraphSourcePoints };
            });
            return;
          }
        }
        if (!properties && action.control === "lineSpacing" && nativeLineSpacingByRewriteRef.current &&
          Number.isFinite(action.value) && action.value > 0 && paragraphOwnLineStep) {
          setParagraphLineStep(Math.abs(action.value - paragraphOwnLineStep) < 0.01 ? null : action.value);
          return;
        }
        if (!properties || !Number.isFinite(action.value)) return;
        // The writer refuses a negative side indent or a leading that is no
        // line step; clamp instead of carrying a draft that cannot be saved.
        let value = action.value;
        if (action.control === "leftIndent" || action.control === "rightIndent") {
          value = Math.max(0, value);
        }
        if (action.control === "lineSpacing" && (!nativeLineSpacingEditable || value <= 0)) {
          return;
        }
        if (action.control === "horizontalScale" && value <= 0) return;
        // Spacing on the part selected spaces that part only, as WPS does
        
        if (action.control === "characterSpacing") {
          const part = partialTextRange();
          if (part) {
            applyPartialFormat(part, { characterSpacing: value });
            return;
          }
        }
        if (action.control === "leftIndent") {
          applyDisplayedLeftIndent(value);
          return;
        }
        setProperties({ ...properties, [action.control]: value });
        return;
      }
      case "rotate":
        rotateNativeTextRun(action.direction);
        return;
      case "tool":
        if (action.tool === "hand") {
          // 手型 leaves the line as 退出编辑 does (what was typed is kept),
          // then the reader pans (WPS).
          if (!onHandTool) return;
          requestLeave();
          onHandTool();
          return;
        }
        if (action.tool === "formatPainter" && painterWindowId) {
          // A click on the armed button puts the painter away; a double
          // click arms it until Escape whatever its state (its two clicks
          // arm and disarm first, as in Word).
          if (formatPainter && !action.sticky) {
            disarmPdfNativeTextFormatPainter(painterWindowId);
            return;
          }
          const format = currentPaintFormat();
          if (format) {
            armPdfNativeTextFormatPainter({
              windowId: painterWindowId, mode: action.sticky ? "sticky" : "single", format,
            });
          }
        }
        return;
      case "delete":
        if (onDeleteTextObject) void onDeleteTextObject();
        return;
      case "kind":
        // 转换为公式: the window makes the formula box and deletes the line.
        if (action.value !== "formula" || !onConvertToFormula || !formulaConversionLatex) return;
        if (convertingToFormulaRef.current) return;
        convertingToFormulaRef.current = true;
        // (Converted, the window has closed this line's editor by then;
        // refused, the line is the reader's again and its words are
        // written as ever.)
        const converted = () => { convertingToFormulaRef.current = false; };
        void onConvertToFormula(replacementText, formulaConversionLatex).then(converted, converted);
        return;
      case "insertText":
        // The line is left as 退出编辑 leaves it; the next click places a box.
        if (!onInsertText) return;
        requestLeave();
        onInsertText();
        return;
      case "insertSymbol": {
        const input = inputRef.current;
        setSymbolDialog({ start: input?.selectionStart ?? 0, end: input?.selectionEnd ?? 0 });
        return;
      }
      case "keyboardInput":
        // 键盘输入触发编辑, kept per device; the keyboard goes back to the line.
        savePdfTextKeyboardInput(action.value);
        inputRef.current?.focus({ preventScroll: true });
        return;
      case "save":
        requestFinish();
        return;
      case "exit":
        // 退出编辑 leaves the line as Escape does (what was typed is kept),
        // then the reader's 编辑内容 mode (WPS).
        requestLeave();
        onExitContentEditMode?.();
        return;
      default:
        return;
    }
  };
  
  // text changed under it) is let go with the text, not left on the draft.
  useEffect(() => { setStickyFormatPreview(null); }, [displayedInputValue, setStickyFormatPreview]);
  // Words typed into a box whose row format waits stay in the page's own
  // text: the parts pressed move with the words (partFormats) and the box's
  // paragraph is set again with them when it is left (requestApply). The box
  
  
  // A family from the reader's computer, ready (prepareLocalFont): chosen
  // again by the name it is set in.
  useEffect(() => {
    const pending = pendingFontActionRef.current;
    if (!pending || preparingFontFamily !== null) return;
    pendingFontActionRef.current = null;
    handleRibbonActionImpl(pending);
  });
  // The native writer refused this line's format draft: the line goes into
  
  // refusal (WPS sets a part of any run).
  const nativeFormatRefused = Boolean(propertyProofInput && properties) && !nativeFormatTakenOver &&
    propertyDraftChanged && previewError !== null &&
    (partFormatRefusalKey === previewDraftKey || nativeRefusalDraftKey === previewDraftKey);
  useEffect(() => {
    if (!nativeFormatRefused) return;
    // The press the writer refused goes back, said: the line keeps its own
    // faces and every format it took before (the last draft the writer
    
    // instead, the whole line was set again in a served face, the parts not
    
    // the IPCC subtitle's "Synthesis" changed font, "Report" lost its
    // underline; 「永远不要回退」).
    const back = acceptedPropertiesRef.current ?? propertyBaseline;
    setPreviewError(null);
    setPartFormatRefusalKey(null);
    setNativeRefusalDraftKey(null);
    if (back) setProperties(back);
    // The draft's look and the buttons go back with it (one record).
    setPartFormats(acceptedPartFormatsRef.current);
    setStickyFormatPreview(null);
    toast({ description: translate("pdf.nativeTextEdit.formatNotApplied") });
  });
  // 格式刷: the format of this line as the painter carries it, and that
  // format put on this line (one draft, one write: the face of that family
  // the run's PDF has, else the style drawn in place; the size on paper;
  // the colour; the rise; the rules drawn or taken in the same write).
  const currentPaintFormat = (): PdfNativeTextPaintFormat | null => {
    if (managedLayoutTypography) {
      return {
        fontFamily: managedSourceFontName ?? managedFontFamily ?? null,
        bold: managedBold, italic: managedItalic,
        fontSizePoints: managedFontSize, color: draftColor,
        underline: managedUnderline, strikethrough: managedStrikethrough, textRisePoints: 0,
      };
    }
    // A paragraph of several rows no run's proof states: its characters'
    // format as its ribbon reads it, and its paragraph settings.
    if (!properties && paragraphAlignable) {
      const model = nativeRibbonModel as { bold?: unknown; italic?: unknown; color?: unknown; alignment?: unknown };
      const alignment = rowFormat?.alignment ?? (model.alignment === "left" || model.alignment === "center" ||
        model.alignment === "right" || model.alignment === "justify" ? model.alignment : undefined);
      return {
        fontFamily: null, bold: model.bold === true, italic: model.italic === true,
        fontSizePoints: rowFormat?.sizePoints ?? (paragraphSourcePoints > 0 ? paragraphSourcePoints : null),
        color: typeof model.color === "string" ? model.color : null,
        underline: rowFormat?.underline === true, strikethrough: rowFormat?.strikethrough === true, textRisePoints: 0,
        paragraph: {
          ...(alignment ? { alignment } : {}),
          ...(rowFormat?.lineStep !== undefined ? { lineStep: rowFormat.lineStep }
            : paragraphOwnLineStep ? { lineStep: paragraphOwnLineStep } : {}),
          ...(rowFormat?.firstLineIndent !== undefined ? { firstLineIndent: rowFormat.firstLineIndent } : {}),
          ...(rowFormat?.leftIndent !== undefined ? { leftIndent: rowFormat.leftIndent } : {}),
          ...(rowFormat?.characterSpacingEm !== undefined ? { characterSpacingEm: rowFormat.characterSpacingEm } : {}),
        },
      };
    }
    if (!properties || !propertyProof) return null;
    return nativeTextPaintFormatOf({
      proof: propertyProof, draft: properties, editableFont,
      bold: currentBold, italic: currentItalic,
      color: unresolvedParagraphColor ? null : draftColor,
      underline: nativeDecorations.underline, strikethrough: nativeDecorations.strikethrough,
    });
  };
  // "draft" when the format went into the draft (written by the finish),
  // "rules" when only the run's rules differ (written by the rule writer).
  const paintFormat = (format: PdfNativeTextPaintFormat): "draft" | "rules" | false => {
    if (managedTypographyEditable) {
      const wanted = format.fontFamily ? classifyFontName(format.fontFamily) : null;
      const option = wanted ? managedFontOptions.find((candidate) => classifyFontName(candidate.sourceFontName) === wanted) : undefined;
      const baselineClass = classifyFontName(initialLayout?.box.sourceFontName || initialLayout?.box.fontFamily);
      setLayoutTypographyOverride((current) => ({
        ...current,
        ...(option ? { fontId: classifyFontName(option.sourceFontName) === baselineClass ? undefined : option.id } : {}),
        ...(format.fontSizePoints ? { fontSize: Math.min(format.fontSizePoints, 512, managedPointHeight) } : {}),
        bold: format.bold, italic: format.italic,
        underline: format.underline, strikethrough: format.strikethrough,
        ...(format.color ? { color: format.color.toLowerCase() } : {}),
      }));
      return "draft";
    }
    // Onto a line whose words are fixed: what is written where its text
    // stands, and nothing of the rest (a size or a paragraph setting painted
    // with it refused the whole format).
    if (!properties && wordsUnread && onApplyRowFormat) {
      const weight = paintedRowBold(format.bold);
      setRowFormat((current) => ({
        ...(current ?? {}),
        ...weight, italic: format.italic,
        ...(format.color ? { color: format.color.toLowerCase() } : {}),
        underline: format.underline, strikethrough: format.strikethrough,
      }));
      return "draft";
    }
    // Onto a paragraph of several rows: written by the paragraph rewrite when
    // it is left, with its settings (the face stays the paragraph's own: a
    // family its page may not hold refused the whole format).
    if (!properties && paragraphAlignable) {
      const paragraph = format.paragraph ?? {};
      const weight = paintedRowBold(format.bold);
      setRowFormat((current) => ({
        ...(current ?? {}),
        ...weight, italic: format.italic,
        ...(format.fontSizePoints && Math.abs(format.fontSizePoints - paragraphSourcePoints) > 0.05
          ? { sizePoints: format.fontSizePoints } : {}),
        ...(format.color ? { color: format.color.toLowerCase() } : {}),
        underline: format.underline, strikethrough: format.strikethrough,
        ...(paragraph.alignment ? { alignment: paragraph.alignment } : {}),
        ...(paragraph.lineStep !== undefined && paragraphOwnLineStep &&
          Math.abs(paragraph.lineStep - paragraphOwnLineStep) > 0.01 ? { lineStep: paragraph.lineStep } : {}),
        ...(paragraph.firstLineIndent !== undefined ? { firstLineIndent: paragraph.firstLineIndent } : {}),
        ...(paragraph.leftIndent !== undefined ? { leftIndent: paragraph.leftIndent } : {}),
        ...(paragraph.characterSpacingEm !== undefined ? { characterSpacingEm: paragraph.characterSpacingEm } : {}),
      }));
      return "draft";
    }
    if (!properties || !propertyProof || !editableFont) return false;
    const { draft: next, add, drop } = nativeTextPaintedDraft({
      proof: propertyProof, draft: properties, editableFont, originalSyntheticBold, format,
      rules: nativeDecorations,
      rulesStanding: { underline: ruleStands("underline"), strikethrough: ruleStands("strikethrough") },
    });
    // The rules go in the run's own property write, alone or with its other
    // formats (the engine draws or takes them away with the show as it
    // was); they were handed to the rule writer when nothing else changed.
    setProperties({
      ...next,
      ...(add.length ? { addTextRules: add } : {}),
      ...(drop.length ? { dropTextRules: drop } : {}),
    });
    return "draft";
  };
  // A line opened with the painter armed takes its format once the proof is
  // here and is written at once (Office paints on the click); a painter
  // armed with one click is then spent.
  const paintFormatRef = useRef(paintFormat);
  paintFormatRef.current = paintFormat;
  useEffect(() => {
    if (!pendingPaint || formatProofPending || propertyControlsBusy || composing) return;
    const painted = !preparationFailed && paintFormatRef.current(pendingPaint.format);
    setPendingPaint(null);
    if (painterWindowId) spendPdfNativeTextFormatPainter(painterWindowId);
    if (painted === "draft") {
      setFinishAfterQueuedActions(true);
    } else if (!painted) {
      toast({
        description: translate("pdf.nativeTextEdit.formatPainterRefused", {
          reason: error ?? applyDisabledReason ?? translate("pdf.nativeTextEdit.propertiesUnproven"),
        }),
      });
    }
  }, [pendingPaint, formatProofPending, propertyControlsBusy, composing, preparationFailed,
    painterWindowId, translate, error, applyDisabledReason, setFinishAfterQueuedActions]);
  // The commands held while the proof was on its way, run one per render
  // (each reads the draft the one before it made) once the proof is here. A
  // command the line turns out not to support is said once, with its reason.
  const latestRibbonRef = useRef<Readonly<{
    capabilities: typeof nativeCapabilities;
    model: typeof nativeRibbonModel;
    run: (action: PdfTextEditingContextRibbonAction, pressed?: boolean) => void;
    /** Whether the page draws this rule under (through) the whole box. */
    ruled: (style: "underline" | "strikethrough") => boolean;
    /** Whether the page draws the whole of a box that states no one run's
     * format bold already: its group's weight, or every run of it in a bold
     * face or stroked (read off its proof, not off this session's draft). */
    drawnBold: boolean;
  }> | null>(null);
  latestRibbonRef.current = { capabilities: nativeCapabilities, model: laneRibbonModel, run: handleRibbonActionImpl,
    ruled: (style) => nativeDecorations[style] === true,
    drawnBold: !propertyProof && !managedLayoutTypography && (groupBoldBaseline === true || sourceFacesBold) };
  const queuedRefusalRef = useRef<string | null>(null);
  // An opening refused for good may be taken over a moment later by another
  // (the window opens the run under the press of a paragraph refused whole):
  // the presses held are then that opening's to answer, by its proof. They
  // wait for it that moment; an editor closed under them meanwhile hands
  // them over (onHeldRibbonActionsLeft) or answers them as it goes.
  const [refusedOpeningSettled, setRefusedOpeningSettled] = useState(false);
  const heldForTakeover = (preparationFailed && !refusedOpeningSettled) || heldRibbonActionsTakenOver;
  useEffect(() => {
    if (!preparationFailed) { setRefusedOpeningSettled(false); return; }
    const timer = window.setTimeout(() => setRefusedOpeningSettled(true), NATIVE_TEXT_REFUSED_OPENING_TAKEOVER_MS);
    return () => window.clearTimeout(timer);
  }, [preparationFailed]);
  const heldPressesLeaveRef = useRef<() => void>(() => {});
  heldPressesLeaveRef.current = () => {
    const held = queuedRibbonActionsRef.current;
    if (held.length === 0) return;
    const { carried, left } = nativeTextHeldPressesCarriedOver(held);
    const taken = carried.length > 0 && onHeldRibbonActionsLeft?.(carried) === true;
    // (Closed with its proof still on the way and nothing taking it over:
    // the presses go with the editor, as they always did.)
    if (!taken && !heldForTakeover) return;
    const refused = taken ? left : held;
    if (refused.length === 0) return;
    const control = nativeTextRibbonActionControl(refused[0].action);
    const reason = (control ? latestRibbonRef.current?.capabilities[control]?.reason : null) ?? error ?? ribbonLabels.unavailable;
    toast({ description: translate("pdf.nativeTextEdit.queuedFormatRefused", { reason }) });
  };
  useEffect(() => {
    const carried = takeHeldRibbonActions?.();
    if (carried?.length) {
      setQueuedRibbonActions((queue) => carried.reduce(queueNativeTextRibbonAction, [] as readonly QueuedNativeTextRibbonAction[])
        .concat(queue));
    }
    return () => heldPressesLeaveRef.current();
  // Once, as the editor opens; and as it closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The formats handed back (restoreFormats), taken once the line's proof is
  // in: the parts, the run's draft and the box's row format as they were, as
  // one step of the line's history (Undo takes them back whole), and the
  // presses that were still held, held again. A run's draft goes back onto
  // the run it was pressed on alone -- one that reads otherwise now (another
  // face, another size: the page was written since) takes none of it, nor
  // does an opening that was refused.
  useEffect(() => {
    if (!formatRestore) return;
    if (preparationFailed) { setFormatRestore(null); formatRestore.settle(false); return; }
    if (formatProofPending || propertyControlsBusy || composing) return;
    const { draft, settle } = formatRestore;
    // Their offsets name letters of the words they were kept with: the
    // line's words now, its proof in. The same words set apart otherwise
    // are the reader's rows still in the field (the proof's words take
    // their place a render later): waited for, not refused.
    if (formatRestore.words !== undefined && formatRestore.words !== replacementText) {
      const bare = (text: string) => text.replace(/\s+/gu, "");
      if (bare(formatRestore.words) === bare(replacementText)) return;
      setFormatRestore(null);
      settle(false);
      return;
    }
    setFormatRestore(null);
    if (managedLayoutTypography || coverLaneLine ||
      (draft.properties !== null && (!propertyBaseline || !samePropertyDraft(draft.propertyBaseline, propertyBaseline)))) {
      settle(false);
      return;
    }
    const history = formatHistoryRef.current;
    history.past.push(Object.freeze({ parts: partFormatsRef.current, properties: propertyOverride, rowFormat,
      queued: queuedRibbonActionsRef.current.length }));
    history.log.push("format");
    history.future = [];
    history.redoLog = [];
    partFormatsRef.current = draft.parts;
    setPartFormats(draft.parts);
    setProperties(draft.properties);
    setRowFormat(draft.rowFormat);
    if (draft.queued.length) {
      setQueuedRibbonActions((queue) => draft.queued.reduce(queueNativeTextRibbonAction,
        [] as readonly QueuedNativeTextRibbonAction[]).concat(queue));
    }
    settle(true);
  }, [composing, coverLaneLine, formatProofPending, formatRestore, managedLayoutTypography, preparationFailed,
    propertyBaseline, propertyControlsBusy, propertyOverride, replacementText, rowFormat, setPartFormats, setProperties]);
  useEffect(() => {
    const latest = latestRibbonRef.current;
    if (queuedRibbonActions.length === 0 || formatProofPending || propertyControlsBusy || composing || coverRulesWaiting ||
      standingRulesWaiting || heldForTakeover || !latest) return;
    const [next, ...rest] = queuedRibbonActions;
    setQueuedRibbonActions(rest);
    const control = nativeTextRibbonActionControl(next.action);
    const capability = control ? latest.capabilities[control] : null;
    if (!capability?.enabled) {
      queuedRefusalRef.current ??= capability?.reason ?? ribbonLabels.unavailable;
    } else if (next.pressed === undefined || next.action.type !== "toggle" ||
      next.action.control === "underline" || next.action.control === "strikethrough" ||
      (latest.model[next.action.control as NativeTextToggleControl] === true) !== next.pressed) {
      // The part it was pressed on, while the words are still those it was
      // pressed on (typed since, the offsets name other letters: the input's
      // own selection, as before).
      const field = inputRef.current;
      if (field && next.range && field.value === next.range.value &&
        (field.selectionStart !== next.range.start || field.selectionEnd !== next.range.end)) {
        try { field.setSelectionRange(next.range.start, next.range.end); } catch { /* detached */ }
      }
      // (A press handed on from a refused box is recorded on this one now, as
      // a press made on it is: the draft wears it and the buttons read it.)
      pressPartsBeforeRef.current = next.carried ? recordPartFormat(next.action) : next.partsBefore ?? null;
      // (A press that turns out to take a format off is recorded again as
      // that: the draft wore it as put on, and its button read pressed.)
      const recordedAsOff = () => {
        if (next.partsBefore) { partFormatsRef.current = next.partsBefore; setPartFormats(next.partsBefore); }
        pressPartsBeforeRef.current = recordPartFormat(next.action);
      };
      // A rule asked of the whole box while its rules were not read yet (the
      // button read unpressed for want of them), of a box the page turns out
      // to rule already: the press takes the rule off, as it does once the
      // button reads pressed. Asked again, the rule was written a second
      
      const rule = next.action.type === "toggle" &&
        (next.action.control === "underline" || next.action.control === "strikethrough") ? next.action.control : null;
      const wholeBox = !next.range || next.range.start === next.range.end ||
        (next.range.start === 0 && next.range.end === next.range.value.length);
      const ruleComesOff = Boolean(rule && next.pressed === true && wholeBox && latest.ruled(rule));
      if (ruleComesOff) recordedAsOff();
      latest.run(next.action, ruleComesOff ? false : next.pressed);
    } else if (next.action.type === "toggle" && next.action.control === "bold" && next.pressed === true && latest.drawnBold &&
      (!next.range || next.range.start === next.range.end || (next.range.start === 0 && next.range.end === next.range.value.length))) {
      // The same of a weight: asked of the whole box before its proof, of a
      // box the proof says the page draws bold already. Left as "set bold",
      // the press did nothing and said nothing, where pressed a moment later
      // it takes the weight off.
      if (next.partsBefore) { partFormatsRef.current = next.partsBefore; setPartFormats(next.partsBefore); }
      pressPartsBeforeRef.current = recordPartFormat(next.action);
      latest.run(next.action, false);
    }
    if (rest.length === 0 && queuedRefusalRef.current !== null) {
      const reason = queuedRefusalRef.current;
      queuedRefusalRef.current = null;
      toast({ description: translate("pdf.nativeTextEdit.queuedFormatRefused", { reason }) });
    }
  }, [queuedRibbonActions, formatProofPending, propertyControlsBusy, composing, coverRulesWaiting, standingRulesWaiting,
    heldForTakeover, translate, ribbonLabels.unavailable]);
  // A scanned line under a rule of the page's own (standing beside it, or
  // pressed this session) that words are then typed into, or whose box is
  // moved, is its text box from there (typing over a scan is written so):
  // the box takes the rule with it (coverRulesIntoBox). A rule the box
  // cannot carry is taken off the draft and said, never left asked of a
  // page whose words are no longer under it.
  const coverRulesPressedNow = pdfNativeCoverRulesPressed(partFormats);
  useEffect(() => {
    if (!coverLaneLine || coverBoxStyle !== null || composing || coverRulesWaiting) return;
    if (replacementText === originalText && !manualLayoutDirty && paragraphFrameRequest === null) return;
    const standing = coverRulesProven !== null &&
      (coverRulesProven.underline.length > 0 || coverRulesProven.strikethrough.length > 0);
    if (!coverRulesPressedNow && !standing) return;
    const carried = textBoxTakeoverEligible ? coverRulesIntoBox(false) : null;
    if (carried) {
      const rows = rowFormatWithoutCoverRules(rowFormat);
      if (rows !== rowFormat) setRowFormat(rows);
      setCoverBoxStyle({ bold: Boolean(currentBold), italic: Boolean(currentItalic), ...carried });
      markPdfTextLatency("lane.text-box", { action: "cover-rules", cover: true, part: false });
      return;
    }
    if (!coverRulesPressedNow) return;
    partFormatsRef.current = NO_PART_FORMATS;
    setPartFormats(NO_PART_FORMATS);
    setRowFormat(rowFormatWithoutCoverRules(rowFormat));
    // (Every word deleted, the line goes with its rules: nothing to say.)
    if (replacementText.trim()) toast({ description: translate("pdf.nativeTextEdit.formatNotApplied") });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the line stops being the scan's own; the rest is this render's
  }, [coverLaneLine, coverBoxStyle, composing, coverRulesWaiting, replacementText, originalText, manualLayoutDirty,
    paragraphFrameRequest, coverRulesProven, coverRulesPressedNow, textBoxTakeoverEligible]);
  // A finish asked for while commands were held runs on the draft they made.
  useEffect(() => {
    if (!finishAfterQueuedActions || queuedRibbonActions.length > 0 || moveAwaitingProof || resizeAwaitingProof ||
      pendingMoveBy) return;
    setFinishAfterQueuedActions(false);
    requestFinishRef.current();
  }, [finishAfterQueuedActions, queuedRibbonActions.length, moveAwaitingProof, resizeAwaitingProof, pendingMoveBy, setFinishAfterQueuedActions]);

  // WPS's text menu: 复制 · 剪切 · 粘贴 · 粘贴为无格式文本 · 删除 as one icon row,
  // then 全选. A command that cannot run now stays listed, greyed, with why.
  // Both pastes insert plain text: a native run is drawn in one format,
  // which the pasted characters take.
  const textContextMenuEntries: readonly PointerContextMenuEntry[] = (() => {
    if (!textContextMenu) return [];
    const writable = !busy && !submitting && !inputReadOnly;
    const writeReason = effectiveApplyDisabledReason ?? labels.applying;
    const nothingSelected = translate("contextMenu.document.nothingSelected");
    const command = (
      id: string,
      label: string,
      icon: React.ReactNode,
      onSelect: () => void,
      disabledReason: string | null,
      shortcut?: string,
    ) => ({
      id,
      label,
      icon,
      onSelect,
      disabled: disabledReason !== null,
      ...(disabledReason !== null ? { disabledReason } : {}),
      ...(shortcut ? { shortcut } : {}),
      testId: `pdf-native-text-context-${id}`,
    });
    const selectionReason = textContextMenu.selected ? null : nothingSelected;
    // The line's alignment, 添加批注 and 插入链接, as ONLYOFFICE's and WPS's
    // text menus have them (the ribbon's own commands; a note or link is
    // opened on the line once it is left).
    const capability = (control: "alignLeft" | "alignCenter" | "alignRight" | "alignJustify") =>
      nativeCapabilities[control].enabled ? null : nativeCapabilities[control].reason ?? ribbonLabels.unavailable;
    const align = (id: string, label: string, value: "left" | "center" | "right" | "justify",
      control: "alignLeft" | "alignCenter" | "alignRight" | "alignJustify") =>
      command(`align-${id}`, label, null, () => handleRibbonAction({ type: "alignment", value }), capability(control));
    const linePlace = () => {
      const box = returnFocusRef.current?.isConnected ? returnFocusRef.current : inlineEditorHost;
      const pageHost = box?.closest<HTMLElement>(".pdf-viewer__page");
      const page = Number(pageHost?.dataset.pageNumber);
      const bounds = pageHost?.getBoundingClientRect();
      const rect = box?.getBoundingClientRect();
      if (!bounds || !rect || !Number.isInteger(page) || page < 1 || bounds.width <= 0 || bounds.height <= 0) return null;
      return {
        page,
        rect: {
          x: ((rect.left - bounds.left) / bounds.width) * 100,
          y: ((rect.top - bounds.top) / bounds.height) * 100,
          width: (rect.width / bounds.width) * 100,
          height: (rect.height / bounds.height) * 100,
        },
      };
    };
    const annotate = (kind: "note" | "link") => {
      const place = linePlace();
      if (!place || !onAnnotateLine) return;
      // The note's or link's own editor takes the keyboard: the line lets go
      // of it now, and does not take it back when it closes (the words typed
      // for the note were written into the line).
      restoreFocusOnCloseRef.current = false;
      menuLeftLineRef.current = true;
      inputRef.current?.blur();
      requestLeave();
      onAnnotateLine(kind, place);
    };
    const paragraphEntries: PointerContextMenuEntry[] = [
      { id: "separator-paragraph", separator: true as const },
      {
        id: "alignment",
        label: translate("toolbar.paragraphAlignment"),
        icon: officeContextMenuIcon("paragraph"),
        onSelect: () => undefined,
        testId: "pdf-native-text-context-alignment",
        submenu: [
          align("left", ribbonLabels.alignLeft, "left", "alignLeft"),
          align("center", ribbonLabels.alignCenter, "center", "alignCenter"),
          align("right", ribbonLabels.alignRight, "right", "alignRight"),
          align("justify", ribbonLabels.alignJustify, "justify", "alignJustify"),
        ],
      },
      ...(onAnnotateLine
        ? [
            command("add-comment", translate("toolbar.addComment"), officeContextMenuIcon("newComment"),
              () => annotate("note"), null),
            command("insert-link", translate("toolbar.insertLink"), officeContextMenuIcon("link"),
              () => annotate("link"), null),
          ]
        : []),
    ];
    if (textContextMenu.block) {
      // The block selected as an object (WPS's single click) is the
      // selection: copy and cut take all of it, delete removes it, a paste
      // goes after its text and 全选 selects its text.
      const deleteReason = nativeCapabilities.delete.enabled
        ? null : nativeCapabilities.delete.reason ?? ribbonLabels.unavailable;
      const pasteAfter = () => { enterTextEditing(); void pasteIntoInput(); };
      return [
        {
          id: "clipboard",
          iconRow: [
            command("copy", translate("toolbar.copy"), officeContextMenuIcon("copy"),
              () => { void copyInputSelection(); }, null),
            command("cut", translate("toolbar.cut"), officeContextMenuIcon("cut"),
              () => { void copyInputSelection().then((copied) => { if (copied) deleteSelectedBlock(); }); },
              writable ? deleteReason : writeReason),
            command("paste", translate("toolbar.paste"), officeContextMenuIcon("paste"),
              pasteAfter, writable ? null : writeReason),
            command("paste-plain", translate("pdf.nativeTextEdit.pastePlainText"), officeContextMenuIcon("pasteSpecial"),
              pasteAfter, writable ? null : writeReason),
            command("delete", translate("toolbar.delete"), officeContextMenuIcon("delete"),
              deleteSelectedBlock, writable ? deleteReason : writeReason),
          ],
        },
        ...paragraphEntries,
        { id: "separator-select-all", separator: true as const },
        command("select-all", translate("toolbar.selectAll"),
          <TextSelect size={16} strokeWidth={1.75} />,
          () => enterTextEditing(0, inputRef.current?.value.length ?? 0), null, formatOfficeShortcut("Mod+A")),
      ];
    }
    return [
      {
        id: "clipboard",
        iconRow: [
          command("copy", translate("toolbar.copy"), officeContextMenuIcon("copy"),
            () => { void copyInputSelection(); }, selectionReason),
          command("cut", translate("toolbar.cut"), officeContextMenuIcon("cut"),
            () => { void copyInputSelection().then((copied) => { if (copied) editInputSelection(""); }); },
            writable ? selectionReason : writeReason),
          command("paste", translate("toolbar.paste"), officeContextMenuIcon("paste"),
            () => { void pasteIntoInput(); }, writable ? null : writeReason),
          command("paste-plain", translate("pdf.nativeTextEdit.pastePlainText"), officeContextMenuIcon("pasteSpecial"),
            () => { void pasteIntoInput(); }, writable ? null : writeReason),
          command("delete", translate("toolbar.delete"), officeContextMenuIcon("delete"),
            () => editInputSelection(""), writable ? selectionReason : writeReason),
        ],
      },
      ...paragraphEntries,
      { id: "separator-select-all", separator: true as const },
      command("select-all", translate("toolbar.selectAll"),
        <TextSelect size={16} strokeWidth={1.75} />,
        () => {
          const input = inputRef.current;
          if (!input) return;
          input.focus({ preventScroll: true });
          input.setSelectionRange(0, input.value.length, "forward");
        }, null, formatOfficeShortcut("Mod+A")),
    ];
  })();

  const ownsRibbonHost = ribbonHost !== null;
  const awaitingRequiredRibbonHost = requireRibbonHost && !ownsRibbonHost;
  // The tab renders again only for what it shows (it is memoized by value):
  // its status line is the same element while its words are the same, and
  // its action handler one stable function calling this render's.
  const ribbonPressRef = useRef(handleRibbonAction);
  useLayoutEffect(() => {
    ribbonPressRef.current = handleRibbonAction;
  });
  const stableRibbonAction = useCallback(
    (action: PdfTextEditingContextRibbonAction) => ribbonPressRef.current(action),
    [],
  );
  const geometryNotice = labels.geometryNotice;
  const ribbonStatus = useMemo(() => (
    <>
      <span id="pdf-native-list-text-edit-geometry" className="sr-only">
        {geometryNotice}
      </span>
      {/* While this box's own write is in flight the host reports the
          write as "busy"; that is this edit saving, not another one. */}
      {

}
      {effectiveApplyDisabledReason && effectiveApplyDisabledReason !== labels.previewing &&
        !displayedError && !submitting ? (
        <span
          id="pdf-native-list-text-edit-disabled-reason"
          role="status"
          data-testid="pdf-native-list-text-edit-disabled-reason"
          className="basis-full rounded border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {refusalFallbackEligible
            ? translate("pdf.nativeTextEdit.fallbackTextBoxHint")
            : effectiveApplyDisabledReason}
        </span>
      ) : openedInFallbackLane && !displayedError && !submitting ? (
        <span
          role="status"
          data-testid="pdf-native-list-text-edit-fallback-notice"
          className="basis-full rounded border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {translate("pdf.nativeTextEdit.fallbackTextBoxUndoHint")}
        </span>
      ) : manualLayoutChanged && !displayedError && !submitting ? (
        // A frame resized, turned or moved where the line cannot follow in
        // place (a paragraph re-wrapped, a frame narrower than its line):
        // it is set as a text box, and the reader is told before it is.
        <span
          role="status"
          data-testid="pdf-native-list-text-edit-layout-fallback-notice"
          className="basis-full rounded border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {translate("pdf.nativeTextEdit.layoutFallbackNotice")}
        </span>
      ) : null}
      {




}
      {/* A line of a paragraph that was refused whole and opens as a block
          for its formats: the whole paragraph is one press away, where a
          format had to be set on each of its lines in turn (a hundred lines
          of a browser's print, pdf-walk-1000 0294). Not while this line holds
          words or formats of its own not yet written: they are written when
          it is left, and the paragraph read again after. */}
      {onSelectWholeParagraph && !wordsByLine && !displayedError ? (
        <span
          role="status"
          data-testid="pdf-native-list-text-edit-whole-paragraph-notice"
          className="basis-full flex flex-wrap items-center gap-2 rounded border border-sky-400/40 bg-sky-50 px-2 py-1 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
        >
          <span>{translate("pdf.nativeTextEdit.paragraphWholeFormatsHint")}</span>
          <button
            type="button"
            data-testid="pdf-native-list-text-edit-whole-paragraph"
            className="rounded border border-sky-500/50 bg-white px-2 py-0.5 font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-50"
            disabled={draftDirty || submitting || busy}
            title={draftDirty ? translate("pdf.nativeTextEdit.paragraphWholeAfterLine") : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={(event) => { event.stopPropagation(); onSelectWholeParagraph(); }}
          >
            {translate("pdf.nativeTextEdit.selectWholeParagraph")}
          </button>
        </span>
      ) : null}
      {wordsFixed !== null && !displayedError ? (
        <span
          id={wordsFixedNoticeId}
          role="status"
          data-testid={wordsFixed === "type3" ? "pdf-native-list-text-edit-type3-notice"
            : "pdf-native-list-text-edit-words-fixed-notice"}
          className="basis-full rounded border border-amber-400/40 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {wordsFixedNotice}
        </span>
      ) : null}
      {displayedError ? (
        <span
          id="pdf-native-list-text-edit-error"
          role="alert"
          data-testid="pdf-native-list-text-edit-error"
          className="basis-full rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive"
        >
          {displayedError}
        </span>
      ) : null}
    </>
  ), [displayedError, effectiveApplyDisabledReason, geometryNotice, wordsFixed, wordsFixedNotice, wordsFixedNoticeId, manualLayoutChanged,
    openedInFallbackLane, refusalFallbackEligible, submitting, translate, onSelectWholeParagraph, draftDirty, busy, wordsByLine]);
  const shownRibbonStatus = useDeferredValue(ribbonStatus);
  // Live Preview (components/office-ribbon/officeFormatPreview.tsx): the
  // font, size or colour under the pointer shows on the selected characters
  // -- the whole line when none are -- in the draft over the page, until
  // the pointer leaves. Only what the command would apply is previewed: a
  // part of a text box's line, or a family this line has no face of, shows
  // nothing.
  // Where a paragraph's lines fall only its writer knows (its source's rows are
  // TeX's, say, and the browser's widths are not): a format hovered on a box is
  // drawn at once in the draft, and then as the press would write it, by the
  // same plan. Moving on to another drops it at once, nothing of it left; a
  // press keeps it up until the press's own candidate is in.
  const hoverExactModelRef = useRef<{ bold?: unknown; italic?: unknown; underline?: unknown; strikethrough?: unknown } | null>(null);
  const hoverExactRef = useRef<{ controller: AbortController; timer: number; canvas: HTMLCanvasElement | null; pressed: boolean } | null>(null);
  const dropHoverExact = () => {
    const held = hoverExactRef.current;
    if (!held) return;
    hoverExactRef.current = null;
    window.clearTimeout(held.timer);
    held.controller.abort();
    // Kept off the page for a return to the same format, at once.
    held.canvas?.remove();
    setHoverExactShown(false);
    setHoverExactGeometry(null);
  };
  const showHoverExactGeometry = (canvas: HTMLCanvasElement) => {
    const known = hoverExactGeometryRef.current;
    let geometry = known.get(canvas);
    if (geometry === undefined) {
      geometry = initialLayout?.sourceInputKey
        ? readPdfNativeTextSourceGeometry(canvas, initialLayout.sourceInputKey, replacementText) ?? null : null;
      known.set(canvas, geometry);
    }
    setHoverExactGeometry(geometry);
  };
  const hoverExactKeptRef = useRef(new Map<string, HTMLCanvasElement>());
  const keepHoverExact = (key: string, canvas: HTMLCanvasElement) => {
    const kept = hoverExactKeptRef.current;
    kept.set(key, canvas);
    let pixels = 0;
    for (const entry of kept.values()) pixels += entry.width * entry.height;
    for (const [oldest, entry] of kept) {
      if (pixels <= HOVER_EXACT_KEPT_PIXELS || entry === canvas) break;
      if (entry.isConnected) continue;
      pixels -= entry.width * entry.height;
      kept.delete(oldest);
      entry.width = 0;
      entry.height = 0;
    }
  };
  useEffect(() => {
    const kept = hoverExactKeptRef.current;
    return () => {
      hoverExactNearRef.current?.abort();
      for (const canvas of kept.values()) {
        canvas.remove();
        canvas.width = 0;
        canvas.height = 0;
      }
      kept.clear();
    };
  }, []);
  /** What a press of this format asks of the box, and its page; nothing where the run's own format is set in place. */
  const hoverExactAsked = (patch: OfficeFormatPreviewPatch) => {
    if (alignedRetype || replacementText !== originalText) return null;
    const pageHost = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page[data-page-number]");
    if (!pageHost) return null;
    // A part of a run: its draft as the press would change it, written as the
    // press writes it (the draft moved the words after it by less than the
    // page does, and left the row where a larger word takes it down).
    if (properties !== null) {
      // A rule is the run's own write's, on the part or on the whole of it.
      if (propertyProof && (patch.underline !== undefined || patch.strike !== undefined)) {
        const fields = { ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
          ...(patch.strike !== undefined ? { strikethrough: patch.strike } : {}) };
        const draft = withPartRules(properties, applyPdfTextPartFormat(partFormatsRef.current,
          partialTextRange() ?? { start: 0, end: replacementText.length }, fields));
        return { draft, pageHost, keptKey: JSON.stringify([draft, replacementText, pageHost.clientWidth]) };
      }
      const part = propertyProof ? partialTextRange() : null;
      if (!part) return null;
      const action: PdfTextEditingContextRibbonAction | null =
        patch.fontSizePt !== undefined ? { type: "fontSize", value: patch.fontSizePt }
          : patch.fontFamily !== undefined ? { type: "fontFamily", value: patch.fontFamily }
            : patch.color ? { type: "fontColor", value: patch.color }
              : patch.bold !== undefined && patch.bold !== partialBold(part) ? { type: "toggle", control: "bold" }
                : patch.italic !== undefined && patch.italic !== partialItalic(part) ? { type: "toggle", control: "italic" }
                  : null;
      const draft = action ? draftOfPartPress(part, action) : null;
      return draft ? { draft, pageHost, keptKey: JSON.stringify([draft, replacementText, pageHost.clientWidth]) } : null;
    }
    // A box its rows write.
    if (!applyBoxFormat) return null;
    const fields: PdfNativeRowFormatFields = {
      ...(patch.fontSizePt !== undefined ? { sizePoints: patch.fontSizePt } : {}),
      ...(patch.fontFamily !== undefined ? { family: patch.fontFamily } : {}),
      ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
      ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
      ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
      ...(patch.strike !== undefined ? { strikethrough: patch.strike } : {}),
      ...(patch.color ? { color: patch.color.toLowerCase() } : {}),
    };
    if (Object.keys(fields).length === 0) return null;
    const range = partialTextRange();
    const current = boxRowFormat ?? {};
    const asked: PdfNativeRowFormat = range
      ? { ...current, segments: [...(current.segments ?? []).filter((entry) => entry.row !== -1 || entry.end <= range.start || entry.start >= range.end),
        { ...(current.segments ?? []).find((entry) => entry.row === -1 && entry.start === range.start && entry.end === range.end), row: -1, start: range.start, end: range.end, ...fields }]
        .sort((left, right) => left.start - right.start) }
      : { ...current, ...fields };
    return { asked, pageHost, keptKey: JSON.stringify([asked, replacementText, pageHost.clientWidth]) };
  };
  const prepareHoverExact = (plan: NonNullable<ReturnType<typeof hoverExactAsked>>, signal: AbortSignal) => plan.draft
    ? onPreparePreview(replacementText, plan.draft, plan.pageHost, signal, undefined, undefined, undefined, Object.freeze({ only: true }))
    : onPreparePreview(replacementText, null, plan.pageHost, signal, undefined, undefined, Object.freeze({ asked: plan.asked! }));
  // The formats the pointer is on its way to are drawn ahead: the ribbon reached,
  // and the sizes next to one hovered, a list being walked along.
  const hoverExactNearRef = useRef<AbortController | null>(null);
  const drawHoverExactAhead = (patches: readonly OfficeFormatPreviewPatch[]) => {
    hoverExactNearRef.current?.abort();
    const controller = new AbortController();
    hoverExactNearRef.current = controller;
    void (async () => {
      for (const patch of patches) {
        if (controller.signal.aborted) return;
        const plan = hoverExactAsked(patch);
        if (!plan || hoverExactKeptRef.current.has(plan.keptKey)) continue;
        const startedAt = performance.now();
        const canvas = await Promise.resolve(prepareHoverExact(plan, controller.signal)).catch(() => null);
        if (!canvas) return;
        if (controller.signal.aborted) {
          canvas.width = 0;
          canvas.height = 0;
          return;
        }
        // A page too large to keep a handful of is not drawn ahead.
        if (canvas.width * canvas.height * 5 > HOVER_EXACT_KEPT_PIXELS) return;
        styleNativeTextPageCanvas(canvas, "candidate");
        canvas.dataset.pdfNativeTextHoverExact = "true";
        canvas.style.visibility = "visible";
        keepHoverExact(plan.keptKey, canvas);
        // A page this slow to plan is left to the format actually hovered.
        if (performance.now() - startedAt > HOVER_EXACT_AHEAD_SLOW_MS) return;
      }
    })();
  };
  const hoverExactSizesNear = (sizePoints: number): OfficeFormatPreviewPatch[] => {
    const presets = OFFICE_FONT_SIZE_PRESETS.pdf;
    const at = presets.reduce((best, size, index) =>
      Math.abs(size - sizePoints) < Math.abs(presets[best]! - sizePoints) ? index : best, 0);
    return [presets[at + 1], presets[at - 1], presets[at + 2], presets[at - 2]]
      .filter((size): size is number => size !== undefined && size !== sizePoints)
      .map((size) => ({ fontSizePt: size }));
  };
  const drawHoverExactNear = (sizePoints: number) => drawHoverExactAhead(hoverExactSizesNear(sizePoints));
  const startHoverExact = (patch: OfficeFormatPreviewPatch) => {
    dropHoverExact();
    const plan = hoverExactAsked(patch);
    if (!plan) return;
    const { pageHost, keptKey } = plan;
    const controller = new AbortController();
    const held = { controller, canvas: null as HTMLCanvasElement | null, pressed: false, timer: 0 };
    hoverExactRef.current = held;
    // Back on a format this edit has drawn: the same drawing, in this event.
    const kept = hoverExactKeptRef.current.get(keptKey);
    if (kept) {
      pageHost.appendChild(kept);
      held.canvas = kept;
      setPreviewInk(readPdfCandidateTextInk(kept));
      showHoverExactGeometry(kept);
      setHoverExactShown(true);
      if (patch.fontSizePt !== undefined) drawHoverExactNear(patch.fontSizePt);
      return;
    }
    // The format under the pointer goes first.
    hoverExactNearRef.current?.abort();
    held.timer = window.setTimeout(() => {
      void Promise.resolve(prepareHoverExact(plan, controller.signal))
        .then((canvas) => {
          if (!canvas) return;
          if (hoverExactRef.current !== held || controller.signal.aborted) {
            canvas.remove();
            canvas.width = 0;
            canvas.height = 0;
            return;
          }
          styleNativeTextPageCanvas(canvas, "candidate");
          canvas.dataset.pdfNativeTextHoverExact = "true";
          canvas.style.visibility = "visible";
          pageHost.appendChild(canvas);
          held.canvas = canvas;
          keepHoverExact(keptKey, canvas);
          setPreviewInk(readPdfCandidateTextInk(canvas));
          showHoverExactGeometry(canvas);
          setHoverExactShown(true);
          if (patch.fontSizePt !== undefined) drawHoverExactNear(patch.fontSizePt);
        })
        // The draft stands for it: a plan the writer declines says so when pressed.
        .catch(() => undefined);
    }, HOVER_EXACT_REST_MS);
  };
  // The pointer reaching the ribbon, the selection now final: its toggles and
  // the sizes around this one, once for this selection.
  const hoverExactAheadKeyRef = useRef<string | null>(null);
  const hoverExactAheadRef = useRef<() => void>(() => undefined);
  hoverExactAheadRef.current = () => {
    if (properties !== null || !applyBoxFormat || alignedRetype || replacementText !== originalText) return;
    const range = partialTextRange();
    const key = JSON.stringify([range, replacementText, boxRowFormat]);
    if (hoverExactAheadKeyRef.current === key) return;
    hoverExactAheadKeyRef.current = key;
    const sizePoints = managedFontSize ?? readerPointSize;
    const model = hoverExactModelRef.current;
    drawHoverExactAhead([
      ...(sizePoints ? hoverExactSizesNear(sizePoints) : []),
      ...(model ? [{ bold: model.bold !== true }, { italic: model.italic !== true },
        { underline: model.underline !== true }, { strike: model.strikethrough !== true }] : []),
    ]);
  };
  useEffect(() => {
    const onPointerOver = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-testid^="pdf-text-context-"]')) hoverExactAheadRef.current();
    };
    document.addEventListener("pointerover", onPointerOver, true);
    return () => document.removeEventListener("pointerover", onPointerOver, true);
  }, []);
  /** The preview ended: gone, unless a press took it up. */
  const releaseHoverExact = () => {
    const held = hoverExactRef.current;
    if (!held) return;
    window.clearTimeout(held.timer);
    const keyAtEnd = previewDraftKeyRef.current;
    window.setTimeout(() => {
      if (hoverExactRef.current !== held) return;
      if (previewDraftKeyRef.current === keyAtEnd || !held.canvas) {
        dropHoverExact();
        return;
      }
      held.pressed = true;
      window.setTimeout(() => { if (hoverExactRef.current === held) dropHoverExact(); }, HOVER_EXACT_HOLD_MS);
    }, 0);
  };
  /** The script the selected characters (else the line) are set in. */
  const selectedScript = (): "superscript" | "subscript" | null => {
    const range = partialTextRange();
    const from = range?.start ?? 0, to = range?.end ?? displayedInputValue.length;
    const pressed = [...partFormatsRef.current].reverse().find((part) =>
      part.script !== undefined && part.start <= from && part.end >= to);
    if (pressed) return pressed.script === "none" ? null : pressed.script ?? null;
    const rise = range ? partialFormatOf(range)?.textRise : properties?.textRise;
    return typeof rise === "number" && rise !== 0 ? rise > 0 ? "superscript" : "subscript" : null;
  };
  const nativeFormatPreviewAdapter: OfficeFormatPreviewAdapter = (patch) => {
    const field = inputRef.current;
    if (!field || editingSurfaceStatus !== "ready" || submitting || composing) return null;
    const part = partialTextRange() !== null;
    // Before the line's proof (or on a line no proof states a run's format
    // for), a weight, slant, rule, colour or size previews as the browser
    // draws it on the draft: the look the press will set, shown the moment
    
    // after a while). A family needs a face the proof names (below).
    // A box its rows write takes any family, drawn then as its press writes it.
    const boxTakesFamily = properties === null && Boolean(applyBoxFormat) && !alignedRetype;
    if (part && !managedLayoutTypography && (!properties || !propertyProof) && patch.fontFamily !== undefined && !boxTakesFamily) return null;
    let familyCss: Record<string, string> = {};
    if (patch.fontFamily !== undefined) {
      const face = propertyProof?.fonts.find((font) => font.resourceName === patch.fontFamily);
      const managed = managedLayoutTypography
        ? managedFontOptions.find((option) => option.id === patch.fontFamily)
        : undefined;
      if (face) {
        const family = officeFormatPreviewCss({ fontFamily: face.family })["font-family"];
        familyCss = {
          "font-family": eastAsianFallback(family, displayedInputValue) ?? family ?? face.family,
          "font-weight": face.bold ? "700" : "400",
          "font-style": face.italic ? "italic" : "normal",
        };
      } else if (managed) {
        familyCss = { "font-family": eastAsianFallback(managed.stack, displayedInputValue) ?? managed.stack };
      } else if (managedLayoutTypography && pdfTextBoxOfficeFamily(patch.fontFamily)) {
        // An Office family of All Fonts, in the served substitute the box's
        // writer embeds (lib/pdf/text-box-runs.ts).
        const family = pdfTextBoxOfficeFamily(patch.fontFamily)!;
        familyCss = {
          "font-family": pdfTextBoxRunCssFamily({ font: classifyFontName(family), officeFamily: family }, displayedInputValue),
          "font-weight": String(pdfTextBoxRunCssWeight({
            bold: managedRibbonStyle?.bold ?? managedBold, officeFamily: family,
          })),
        };
      } else if (!managedLayoutTypography && propertyProof && readPdfPageFontFamilyToken(patch.fontFamily)) {
        // A font the page keeps from a reader's computer: in its own face.
        const css = pdfTextBoxRunCssFamily({ font: classifyFontName(patch.fontFamily), officeFamily: patch.fontFamily });
        familyCss = { "font-family": eastAsianFallback(css, displayedInputValue) ?? css };
      } else if (!managedLayoutTypography && propertyProof && embeddableFontFamily(patch.fontFamily)) {
        // A family the PDF holds no face of, which choosing it embeds: shown
        // in the faces MRAI serves for it.
        const family = officeFormatPreviewCss({ fontFamily: patch.fontFamily })["font-family"];
        familyCss = { "font-family": eastAsianFallback(family, displayedInputValue) ?? family };
      } else if (boxTakesFamily) {
        const family = officeFormatPreviewCss({ fontFamily: patch.fontFamily })["font-family"];
        familyCss = { "font-family": eastAsianFallback(family, displayedInputValue) ?? family };
      } else {
        return null;
      }
    }
    let pxPerPt: number | undefined;
    // A script is written at 2/3 of a size asked of it, standing as far off
    // the line as that size sets it (nativeTextSizeOfScriptedRun): previewed at
    // the size named, a superscript at 72 came down to 48 when it was pressed.
    const scriptPreviewed = patch.fontSizePt !== undefined ? selectedScript() : null;
    if (patch.fontSizePt !== undefined) {
      const shownPx = Number.parseFloat(String(visualDraftFontSize ?? ""));
      const currentPt = properties ? properties.fontSize * nativeTextMatrixScale : managedFontSize ?? readerPointSize;
      if (!(shownPx > 0) || !currentPt || !(currentPt > 0)) return null;
      // The size it stands in: the press changes nothing, and the draft set
      // again by the browser's widths broke its lines elsewhere for a moment.
      const standingRange = partialTextRange();
      const standingPart = standingRange ? partialFormatOf(standingRange) : null;
      const standingPt = typeof standingPart?.fontSize === "number" ? standingPart.fontSize * nativeTextMatrixScale : currentPt;
      if (Math.abs(standingPt - patch.fontSizePt) < 0.01 && !selectedScript()) return null;
      pxPerPt = shownPx / currentPt * (scriptPreviewed ? PDF_NATIVE_SCRIPT_SIZE : 1);
    }
    // A weight or slant previewed in the face the press writes it in.
    const toggled = patch.fontFamily === undefined && !managedLayoutTypography
      ? toggledFaceFamilyCss(patch.bold, patch.italic) : undefined;
    const css = {
      ...officeFormatPreviewCss({ ...patch, fontFamily: undefined }, pxPerPt ? { pxPerPt } : {}),
      ...(toggled ? { "font-family": eastAsianFallback(toggled, displayedInputValue) ?? toggled } : {}),
      ...familyCss,
      // Bold that would be written as a stroke is previewed as that stroke
      // (the browser's synthetic bold is a pixel wider a glyph); bold off a
      // stroked draft takes the stroke away.
      ...(patch.bold === true && !toggled && partBoldStrokes()
        ? { "font-weight": "400", "-webkit-text-stroke": `${PDF_NATIVE_SYNTHETIC_BOLD_STROKE_EM}em currentColor` }
        : patch.bold === false ? { "-webkit-text-stroke-width": "0" } : {}),
      ...(scriptPreviewed ? { position: "relative", top: `${-pdfNativeScriptRiseEm(scriptPreviewed)}em` } : {}),
    };
    if (Object.keys(css).length === 0) return null;
    // The rule it toggles, on its own: the characters' other rule stays.
    const decoration = patch.underline !== undefined || patch.strike !== undefined
      ? { ...(patch.underline !== undefined ? { underline: patch.underline } : {}),
          ...(patch.strike !== undefined ? { strike: patch.strike } : {}) }
      : undefined;
    // A colour, a rule or a bold drawn as a stroke moves no glyph: the
    // previewed glyphs keep the page's places (as the press then drafts
    // them, lookOnlyPropertyChange), not the browser's advances.
    const keepsAdvances = !managedLayoutTypography && Boolean(properties && propertyProof) &&
      patch.fontFamily === undefined && patch.fontSizePt === undefined && patch.italic === undefined &&
      patch.highlight === undefined && !scriptPreviewed && !toggled &&
      (patch.bold === undefined || (patch.bold === true && partBoldStrokes()));
    const preview: PdfTextDraftFormatPreview = part
      // (A rule moves no glyph: the selection stays as the press leaves it, over
      // the words, and not a band under them.)
      ? { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0, css, band: !ruleOnlyPreview(css), ...(decoration ? { decoration } : {}),
          ...(keepsAdvances ? { keepsAdvances } : {}) }
      : { start: 0, end: displayedInputValue.length, css, band: false, ...(decoration ? { decoration } : {}),
          ...(keepsAdvances ? { keepsAdvances } : {}) };
    // A size or family that sets several rows again: the browser breaks them
    // where the page will not, and its draft stood for the first 200-400 ms and
    // then jumped. The exact drawing is waited for that long; only a page slower
    // than that shows the draft meanwhile. (One drawn already shows at once.)
    const rowsSetAgain = Boolean(activeInputLayout?.breaks.length) && (patch.fontSizePt !== undefined || patch.fontFamily !== undefined);
    const plan = rowsSetAgain ? hoverExactAsked(patch) : null;
    const held = plan && !hoverExactKeptRef.current.has(plan.keptKey)
      ? window.setTimeout(() => setFormatPreview(preview), HOVER_DRAFT_HELD_MS) : null;
    if (held === null) setFormatPreview(preview);
    startHoverExact(patch);
    return () => {
      if (held !== null) window.clearTimeout(held);
      setFormatPreview((current) => (current === preview ? null : current));
      releaseHoverExact();
    };
  };
  hoverExactModelRef.current = displayedRibbonModel;
  // What a key passes through on its way, the tab shows at the reader's
  // pace: each key went through a preview ("saving", "generating the
  
  // rendered for each step, ~4 times a key with its menus re-anchoring after
  
  // deferred (a later key overtakes them undrawn): the save state, the
  
  // which a press reads. Every field a press decides by (a list on or off, a
  // weight, a size) is the current one: a list pressed twice in a row was
  // put on twice when the tab read it deferred.
  const passingRibbonFields = useDeferredValue(JSON.stringify({
    saveState: displayedRibbonModel.saveState,
    verticalAlign: "verticalAlign" in displayedRibbonModel ? displayedRibbonModel.verticalAlign ?? null : undefined,
    save: nativeCapabilities.save,
    verticalAlignCapability: nativeCapabilities.verticalAlign,
  }));
  const passing = JSON.parse(passingRibbonFields) as {
    saveState: typeof displayedRibbonModel.saveState;
    verticalAlign?: typeof displayedRibbonModel.verticalAlign | null;
    save: typeof nativeCapabilities.save;
    verticalAlignCapability: typeof nativeCapabilities.verticalAlign;
  };
  const { verticalAlign: _currentVerticalAlign, ...modelWithoutVerticalAlign } = displayedRibbonModel;
  void _currentVerticalAlign;
  const shownRibbonModel = useValueStable({
    ...modelWithoutVerticalAlign,
    saveState: passing.saveState,
    ...(passing.verticalAlign !== undefined ? { verticalAlign: passing.verticalAlign ?? undefined } : {}),
  } as typeof displayedRibbonModel);
  
  
  // caret, no frame -- for the seconds a large file's proof takes): every
  // command a press is held for until then is offered as it will be, and
  // runs once the proof is in (said then if the line refuses it).
  const shownRibbonCapabilities = useValueStable({
    ...(awaitingProof ? withHeldCommandsOffered(nativeCapabilities) : nativeCapabilities),
    save: passing.save, verticalAlign: passing.verticalAlignCapability,
  } as typeof nativeCapabilities);
  
  
  // Read from what the ribbon shows. Said once per state, for the probes and
  // the tests.
  const transitionalNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const passing = Object.entries(shownRibbonCapabilities).filter(([, capability]) =>
      capability && !capability.enabled && (capability.reason === labels.previewing || capability.reason === labels.applying))
      .map(([control]) => control);
    const key = passing.length ? passing.join(",") : null;
    if (key === transitionalNoticeRef.current) return;
    transitionalNoticeRef.current = key;
    if (!key) return;
    markPdfTextLatency("editor.transitional", { controls: key, proving: awaitingProof });
    console.error(`[pdf-text] a shown editor in a passing state: ${key}`);
  });
  const ribbonSurface = (
    <PdfTextEditingContextRibbonMemo
      capabilities={shownRibbonCapabilities}
      labels={
        paragraphColors?.length
          ? {
              ...ribbonLabels,
              fontColor: translate("pdf.nativeTextEdit.paragraphColor"),
            }
          : ribbonLabels
      }
      model={shownRibbonModel}
      // The list's own section is the fonts this text can be set in (the
      // PDF's, or a text box's writer's), not Office's.
      {...(fontPickerLabels
        ? { fontPickerLabels: { ...fontPickerLabels, officeFonts: translate("pdf.nativeTextEdit.fontsWritable") } }
        : {})}
      onAction={stableRibbonAction}
      status={shownRibbonStatus}
    />
  );
  const ribbonPortalTarget = ribbonHost?.parentElement ?? ribbonHost;
  const toolbar = ribbonPortalTarget
    ? createPortal(
        <>
          <span
            role="dialog"
            aria-modal="false"
            aria-label={labels.title}
            aria-busy={busy || submitting}
            data-testid="pdf-native-list-text-edit-dialog"
            data-pdf-text-target="native-list"
            data-pdf-native-text-inline-toolbar={
              ownsInlineHost ? "true" : undefined
            }
            data-pdf-native-text-context-ribbon="true"
            className="sr-only"
            title={labels.description}
          >
            {labels.title}
          </span>
          <OfficeFormatPreviewProvider adapter={nativeFormatPreviewAdapter}>
            {ribbonPainted || !paintRibbonAfterFocus ? ribbonSurface : null}
          </OfficeFormatPreviewProvider>
        </>,
        ribbonPortalTarget,
      )
    : null;
  const inlinePageHost = inlineEditorHost?.closest<HTMLElement>(
    ".pdf-viewer__page[data-page-number]",
  );
  // Adjacent 44px hit squares overlap on narrow/short text. Bound each target
  // by half the frame extent so a right/corner gesture cannot hit its sibling.
  const resizeTargetWidth = Math.min(24, (effectiveLayoutRect?.width ?? 1) * pageWidthPixels / 2);
  // The top and bottom middle grips take at most a quarter of the frame's
  // width: the rest of the band moves the box, as WPS drags a box by its
  // frame between the grips. At half the width they covered the whole top
  // band of a short line, and a drag meant to move it resized it instead
  
  const resizeEdgeTargetWidth = Math.min(resizeTargetWidth,
    (effectiveLayoutRect?.width ?? 1) * pageWidthPixels / 4);
  const resizeTargetHeight = Math.min(24, (effectiveLayoutRect?.height ?? 1) * pageHeightPixels / 2);
  // An edge or corner target reaches 2px into the frame and the rest
  // outward, so the text under a short line stays the caret's; the grip
  // itself is drawn back onto the edge. (At fractional zoom a pointer pixel
  // can round just inside the edge; 2px keeps that a resize gesture.)
  const resizeTargetReach = (position: number, extent: number) =>
    position === 0 ? -(extent - 2) : position === 1 ? -2 : -extent / 2;
  const resizeGripShift = (position: number, extent: number) =>
    position === 0 ? extent / 2 - 2 : position === 1 ? -(extent / 2 - 2) : 0;
  // The plain draft's slant for a synthetic italic: the shear the writer
  // applies about the baseline, composed after the line's own transform
  // (the skew runs first, in the draft's own units; a translate keeps the
  // first baseline in place, so the top of the glyphs leans right as in the
  // PDF rather than their foot leaning left).
  const visualDraftSlantTransform = (base: string | undefined): string | undefined => {
    if (!visualDraftSyntheticSlant || draftSlantsWords) return base;
    const font = Number.parseFloat(String(visualDraftFontSize ?? "")) || draftFontSizePixels;
    const line = Number.parseFloat(String(visualDraftLineHeight ?? "")) || font * PDF_TEXTBOX_LINE_HEIGHT_RATIO;
    const baseline = Math.max(0, (line - font) / 2 + 0.8 * font);
    const slant = `translateX(${(PDF_NATIVE_SYNTHETIC_ITALIC_SKEW * baseline).toFixed(2)}px) ${pdfDraftSyntheticSlantTransform()}`;
    return base && base !== "none" ? `${base} ${slant}` : slant;
  };
  const visualDraft = (
    <div
      ref={visualDraftElementRef}
      data-pdf-native-text-visual-draft="true"
      data-testid="pdf-native-text-visual-draft"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        boxSizing: "border-box",
        margin: 0,
        padding: 0,
        color: visualDraftColor,
        WebkitTextFillColor: visualDraftColor,
        background: "transparent",
        ...(preserveSourceSingleLine || activeInputLayout || growsAsOneLine
          ? { whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal" } as const
          : PDF_BROWSER_TEXT_WRAP),
        width: layoutFallbackActive && effectiveLayoutRect ? `${effectiveLayoutRect.width * pageWidthPixels / reflowScale / wrappedScaleX}px` : "100%",
        height: layoutFallbackActive && effectiveLayoutRect ? `${effectiveLayoutRect.height * pageHeightPixels / reflowScale}px` : "100%",
        // Align Text: the rows moved down into the frame's spare height.
        ...(draftVerticalOffsetPx > 0 ? { paddingTop: `${draftVerticalOffsetPx}px` } : {}),
        // Preserve overhanging glyph strokes without expanding pointer ownership.
        overflow: "visible",
        pointerEvents: "none",
        userSelect: "none",
        visibility: visualDraftVisible ? "visible" : "hidden",
        ...inlineTypographyStyle,
        transform: visualDraftSlantTransform(initialLayout ? sourceLineTransform : metrics?.transform),
        transformOrigin: initialLayout
          ? sourceLineTransformOrigin
          : metrics?.transformOrigin,
      }}
    >
      {displayedInputValue || "\u200b"}
    </div>
  );
  const stationaryInkCoverLayer =
    inlinePageHost && stationaryInkCover && sourceInkCoverColor && ownsInlineHost
      ? createPortal(
          <div
            data-testid="pdf-native-text-source-ink-cover"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: `${stationaryInkCover.x * 100}%`,
              top: `${stationaryInkCover.y * 100}%`,
              width: `${stationaryInkCover.width * 100}%`,
              height: `${stationaryInkCover.height * 100}%`,
              // Over the clean surface and the source layer, under the frame.
              zIndex: 8,
              // Turned as the frame is: the line's own axes.
              transform: `rotate(${normalizeBoxAngle(layoutAngle)}deg)`,
              transformOrigin: "50% 50%",
              pointerEvents: "none",
              backgroundColor: sourceInkCoverColor,
            }}
          />,
          inlinePageHost,
        )
      : null;
  // A format hovered and drawn in the draft: where the draft's words stand. The
  // exact drawing, when it comes, says for itself (startHoverExact).
  useLayoutEffect(() => {
    if (hoverExactShown) return;
    const draft = visualDraftElementRef.current, host = inlineEditorHost?.closest<HTMLElement>(".pdf-viewer__page");
    if (!formatPreviewShown || !draft || !host) {
      setPreviewInk((current) => (current ? null : current));
      return;
    }
    // The characters' own boxes: the draft's blocks are as tall as the line
    // boxes of its fonts, and read with them a one-row frame's chrome stood
    // half as tall again under every format hovered.
    const page = host.getBoundingClientRect();
    if (!(page.width > 0) || !(page.height > 0)) return;
    const range = draft.ownerDocument.createRange();
    if (typeof range.getClientRects !== "function") return;
    const walker = draft.ownerDocument.createTreeWalker(draft, NodeFilter.SHOW_TEXT);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue) continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!(rect.width > 0)) continue;
        left = Math.min(left, rect.left); right = Math.max(right, rect.right);
        top = Math.min(top, rect.top); bottom = Math.max(bottom, rect.bottom);
      }
    }
    if (!(right > left)) return;
    const ink = { left: (left - page.left) / page.width, right: (right - page.left) / page.width,
      top: (top - page.top) / page.height, bottom: (bottom - page.top) / page.height };
    setPreviewInk((current) => current && (["left", "right", "top", "bottom"] as const)
      .every((key) => Math.abs(current[key] - ink[key]) < 1e-4) ? current : ink);
  }, [formatPreviewShown, shownFormatPreview, hoverExactShown, inlineEditorHost]);
  // A format that sets the words past the paragraph's frame: its chrome (the
  // outline, the grips, the move band) stands round them, hovered and pressed
  // alike, and the frame the words are written in stays what it was.
  const chromeInk = previewInk ?? (exactPreviewIsCurrent ? candidateInk : null);
  const chromeReach = (() => {
    const rect = effectiveLayoutRect;
    if (!rect || !chromeInk || Math.abs(normalizeBoxAngle(layoutAngle)) > 0.01 || layoutFallbackActive ||
      !(rect.width > 0) || !(rect.height > 0)) return null;
    const reach = { left: Math.max(0, rect.x - chromeInk.left) / rect.width,
      right: Math.max(0, chromeInk.right - rect.x - rect.width) / rect.width,
      top: Math.max(0, rect.y - chromeInk.top) / rect.height,
      bottom: Math.max(0, chromeInk.bottom - rect.y - rect.height) / rect.height };
    // A pixel or two of a glyph past the frame is no reason to move the grips.
    const tolerance = (share: number, size: number) => share * size * pageWidthPixels > 2 ? share : 0;
    const shown = { left: tolerance(reach.left, rect.width), right: tolerance(reach.right, rect.width),
      top: tolerance(reach.top, rect.height), bottom: tolerance(reach.bottom, rect.height) };
    return shown.left || shown.right || shown.top || shown.bottom ? shown : null;
  })();
  // A shape of the page moved a moment ago stays lifted over its page (its
  // stage above everything, until the page paints it where it shows), and
  // the stage holds the page's words as they stood when it was lifted. Over
  // the box being edited it showed those words in place of the draft: half a
  
  // red tab dragged over the paragraph). The stage is cut away over the box
  // and what its draft inks (styles/pdf-viewer.css reads these); the editor's
  // own drawing of the page shows there.
  const editingBoxLeft = effectiveLayoutRect ? Math.min(effectiveLayoutRect.x, chromeInk?.left ?? 1) : null;
  const editingBoxTop = effectiveLayoutRect ? Math.min(effectiveLayoutRect.y, chromeInk?.top ?? 1) : null;
  const editingBoxRight = effectiveLayoutRect
    ? Math.max(effectiveLayoutRect.x + effectiveLayoutRect.width, chromeInk?.right ?? 0) : null;
  const editingBoxBottom = effectiveLayoutRect
    ? Math.max(effectiveLayoutRect.y + effectiveLayoutRect.height, chromeInk?.bottom ?? 0) : null;
  const editingBoxLevel = Math.abs(normalizeBoxAngle(layoutAngle)) <= 0.01;
  useLayoutEffect(() => {
    const host = inlinePageHost;
    if (!host || !ownsInlineHost || !editingBoxLevel || editingBoxLeft === null || editingBoxTop === null ||
      editingBoxRight === null || editingBoxBottom === null) return;
    // A glyph's side bearing past the frame is the draft's too.
    const pad = draftFontSizePixels > 0 && pageWidthPixels > 0 ? (draftFontSizePixels * 0.3) / pageWidthPixels : 0;
    const share = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;
    host.style.setProperty("--pdf-text-editing-left", share(editingBoxLeft - pad));
    host.style.setProperty("--pdf-text-editing-top", share(editingBoxTop));
    host.style.setProperty("--pdf-text-editing-right", share(editingBoxRight + pad));
    host.style.setProperty("--pdf-text-editing-bottom", share(editingBoxBottom));
    host.setAttribute("data-pdf-native-text-editing-box", "true");
    return () => {
      host.removeAttribute("data-pdf-native-text-editing-box");
      for (const side of ["left", "top", "right", "bottom"]) host.style.removeProperty(`--pdf-text-editing-${side}`);
    };
  }, [inlinePageHost, ownsInlineHost, editingBoxLevel, editingBoxLeft, editingBoxTop, editingBoxRight, editingBoxBottom,
    draftFontSizePixels, pageWidthPixels]);
  const chromeX = (cx: number) => chromeReach ? cx * (1 + chromeReach.left + chromeReach.right) - chromeReach.left : cx;
  const chromeY = (cy: number) => chromeReach ? cy * (1 + chromeReach.top + chromeReach.bottom) - chromeReach.top : cy;
  const layoutFrame =
    inlinePageHost &&
    effectiveLayoutRect &&
    ownsInlineHost
      ? createPortal(
          <div
            ref={layoutFrameRef}
            data-pdf-native-text-layout-frame="true"
            data-pdf-native-text-finishing={finishRequested !== null || submitting ? "true" : undefined}
            data-testid="pdf-native-text-layout-frame"
            data-layout-fallback={layoutFallbackActive ? "true" : "false"}
            data-pdf-dev-growth={process.env.NODE_ENV === "development" ? JSON.stringify({
              promoted: Boolean(initialLayout?.promoted), fallbackText: Boolean(initialLayout?.fallbackText),
              room: Math.round(lineGrowthRoom * 1000) / 1000, rows: openedBoxRows, multi: sourceLooksMultiLine,
              overflows: draftOverflowsBox, natural: draftNaturalWidth, input: Boolean(sourceInputLayout),
              align: retainedAlignment, dirty: contentDraftDirty, manual: manualLayoutDirty, paragraph: Boolean(paragraphChanges),
              preserved: preserveSourceSingleLine, fit: sourceLineFitScale, reflow: reflowScale, scaleX: wrappedScaleX,
            }) : undefined}
            // The shared Office drawing outline (1px #686868); only the
            // pending-save dashed outline is written inline.
            className={officeDrawingSelectionStyles.selectedHost}
            data-selected="true"
            // WPS's chrome (round corner dots, edge capsules) on the ribbon's
            
            data-office-drawing-look="wps"
            data-office-drawing-frame="accent"
            style={{
              position: "absolute",
              left: `${effectiveLayoutRect.x * 100}%`,
              top: `${effectiveLayoutRect.y * 100}%`,
              width: `${effectiveLayoutRect.width * 100}%`,
              height: `${effectiveLayoutRect.height * 100}%`,
              // Above the content-edit source text layer (7). The old source
              // span remains an identity anchor, not a second editor surface.
              zIndex: 8,
              transform: `rotate(${normalizeBoxAngle(layoutAngle)}deg)`,
              transformOrigin: "50% 50%",
              pointerEvents: "none",
              outline: finishRequested !== null || submitting ? PDF_TEXT_EDIT_PENDING_OUTLINE : chromeReach ? "none" : undefined,
              outlineOffset: 0,
              boxSizing: "border-box",
              backgroundColor: sourceInkCoverColor
                ? stationaryInkCover ? undefined : sourceInkCoverColor
                : initialLayout?.promoted &&
                /^#[0-9a-f]{6}$/i.test(initialLayout.backgroundColor ?? "")
                ? initialLayout.backgroundColor : undefined,
            }}
          >
            {chromeReach && finishRequested === null && !submitting ? (
              <span
                aria-hidden="true"
                className={officeDrawingSelectionStyles.selectedHost}
                data-selected="true"
                data-office-drawing-look="wps"
                data-office-drawing-frame="accent"
                data-testid="pdf-native-text-chrome-outline"
                style={{
                  position: "absolute",
                  left: `${-chromeReach.left * 100}%`,
                  top: `${-chromeReach.top * 100}%`,
                  width: `${(1 + chromeReach.left + chromeReach.right) * 100}%`,
                  height: `${(1 + chromeReach.top + chromeReach.bottom) * 100}%`,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {visualDraft}
            <NativeTextFrameFollower liveRef={liveMoveRectRef} followRef={followMoveRef} frameRef={layoutFrameRef}
              pageHost={inlinePageHost} layoutRect={layoutRect} shownRect={effectiveLayoutRect} />
            {moveLiftShown && moveLift && effectiveLayoutRect ? (
              <img
                key={moveLift.exact ? "exact" : "keyed"}
                ref={moveLiftImageRef}
                alt=""
                aria-hidden="true"
                draggable={false}
                data-testid="pdf-native-text-move-lift"
                src={moveLift.url}
                style={{
                  position: "absolute",
                  zIndex: 1,
                  left: `${((moveLift.rect.x - moveLift.frame.x) / effectiveLayoutRect.width) * 100}%`,
                  top: `${((moveLift.rect.y - moveLift.frame.y) / effectiveLayoutRect.height) * 100}%`,
                  width: `${(moveLift.rect.width / effectiveLayoutRect.width) * 100}%`,
                  height: `${(moveLift.rect.height / effectiveLayoutRect.height) * 100}%`,
                  maxWidth: "none",
                  maxHeight: "none",
                  margin: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            ) : null}
            {input}
            {(displayedError || partFormatRefusal) && !submitting ? (
              // The ribbon's status line can sit past the window's edge; the
              // failure also shows here, where the user is looking. The
              // ribbon keeps the announced alert.
              <div
                aria-hidden="true"
                data-testid="pdf-native-text-inline-error"
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 4,
                  width: "max-content",
                  maxWidth: 320,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border:
                    "1px solid color-mix(in srgb, var(--destructive, #dc2626) 32%, transparent)",
                  background: "var(--background, #ffffff)",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.14)",
                  color: "var(--destructive, #dc2626)",
                  fontSize: 12,
                  lineHeight: 1.4,
                  whiteSpace: "normal",
                  pointerEvents: "none",
                }}
              >
                {displayedError ?? (partFormatRefusal && pdfReaderRefusalText(partFormatRefusal, translate))}
                {displayedError ? (
                  <span
                    style={{
                      display: "block",
                      color: "var(--muted-foreground, #64748b)",
                    }}
                  >
                    {layoutOnlyDraft && failedFinishKey === finishDraftKey
                      ? translate("pdf.nativeTextEdit.clickElsewhere")
                      : translate("pdf.nativeTextEdit.pressEsc")}
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className={NATIVE_TEXT_LAYOUT_TARGET_CLASS}
              data-pdf-native-text-layout-control="true"
              data-testid="pdf-native-text-move-handle"
              data-native-move={nativeMoveSupported ? "true" : "false"}
              aria-label={translate("pdf.nativeTextEdit.moveTextBox")}
              title={translate("pdf.nativeTextEdit.moveTextBoxHint")}
              // (A line of words not read as drawn: a press on its frame
              // says why it stays only once the pointer carries it, as a
              // press on its body does; a click there is told nothing.)
              onPointerDown={(event) => (wordsUnread ? pressSelectedBlock(event) : beginLayoutDrag("move", event))}
              onKeyDown={(event) => {
                if (!leaveOnEscape(event)) handleLayoutControlKeyDown("move", event);
              }}
              style={{
                visibility: finishRequested !== null || submitting ? "hidden" : NATIVE_TEXT_HANDLE_VISIBILITY,
                position: "absolute",
                // WPS moves a selected box by its frame: the band a few
                // pixels round the frame is the move surface. It lies under
                // the text (zIndex 1 < the input's 2), so a press on the
                // text still places the caret, and under the grips (3).
                ...(chromeReach ? {
                  left: `calc(${-chromeReach.left * 100}% - ${NATIVE_TEXT_MOVE_BAND_PX}px)`,
                  right: `calc(${-chromeReach.right * 100}% - ${NATIVE_TEXT_MOVE_BAND_PX}px)`,
                  top: `calc(${-chromeReach.top * 100}% - ${NATIVE_TEXT_MOVE_BAND_PX}px)`,
                  bottom: `calc(${-chromeReach.bottom * 100}% - ${NATIVE_TEXT_MOVE_BAND_PX}px)`,
                } : { inset: -NATIVE_TEXT_MOVE_BAND_PX }),
                zIndex: 1,
                width: "auto",
                height: "auto",
                minWidth: 0,
                minHeight: 0,
                maxWidth: "none",
                maxHeight: "none",
                margin: 0,
                padding: 0,
                borderRadius: 0,
                border: 0,
                background: "transparent",
                boxShadow: "none",
                boxSizing: "border-box",
                appearance: "none",
                cursor: "move",
                pointerEvents: "auto",
                touchAction: "none",
              }}
            />
            <button
              type="button"
              className={NATIVE_TEXT_LAYOUT_TARGET_CLASS}
              data-pdf-native-text-layout-control="true"
              data-testid="pdf-native-text-rotate-handle"
              aria-label={translate("pdf.nativeTextEdit.rotateTextBox")}
              title={translate("pdf.nativeTextEdit.rotateTextBoxHint")}
              onPointerDown={(event) => beginLayoutDrag("rotate", event)}
              onKeyDown={(event) => {
                if (!leaveOnEscape(event)) handleLayoutControlKeyDown("rotate", event);
              }}
              style={{
                visibility: finishRequested !== null || submitting ? "hidden" : NATIVE_TEXT_HANDLE_VISIBILITY,
                position: "absolute",
                left: `${chromeX(0.5) * 100}%`,
                top: chromeReach ? `calc(${chromeY(0) * 100}% - 44px)` : "-44px",
                zIndex: 3,
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                maxWidth: 44,
                maxHeight: 44,
                marginLeft: -22,
                // The round target's foot reached the frame band, so a drag
                
                // E5, a figure label): the grip and its stem still paint, and
                // the band below them stays the move's.
                clipPath: `inset(0 0 ${NATIVE_TEXT_MOVE_BAND_PX}px 0)`,
                padding: 0,
                borderRadius: "999px",
                border: 0,
                background: "transparent",
                color: "var(--console-accent-strong, #0f766e)",
                boxShadow: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
                lineHeight: 0,
                appearance: "none",
                cursor: "grab",
                pointerEvents: "auto",
                touchAction: "none",
              }}
            >
              {/* The shared round grip and its stem, in WPS's look,
                  centred in the 44px target: 22px above the frame. */}
              <span
                data-testid="pdf-native-text-rotate-handle-visual"
                aria-hidden="true"
                className={officeDrawingSelectionStyles.rotateMark}
                style={{
                  boxSizing: "border-box",
                  pointerEvents: "none",
                }}
              >
                <RotateCw size={11} aria-hidden="true" />
              </span>
            </button>
            {RESIZE_HANDLES.map(({ handle, cx, cy, cursor }) => (
              <button
                key={handle}
                type="button"
                className={NATIVE_TEXT_LAYOUT_TARGET_CLASS}
                data-pdf-native-text-layout-control="true"
                data-testid="pdf-native-text-resize-handle"
                data-handle={handle}
                aria-label={translate("pdf.nativeTextEdit.resizeTextBox", {
                  handle,
                })}
                title={translate("pdf.nativeTextEdit.resizeTextBoxHint")}
                onPointerDown={(event) => beginLayoutDrag(handle, event)}
                onKeyDown={(event) => {
                  if (!leaveOnEscape(event)) handleLayoutControlKeyDown(handle, event);
                }}
                style={{
                  visibility: finishRequested !== null || submitting ? "hidden" : NATIVE_TEXT_HANDLE_VISIBILITY,
                  position: "absolute",
                  // Keep the handle's centre above the transparent textarea.
                  // At fractional workspace zoom, pointer pixels can round
                  // just inside its edge and otherwise start a caret gesture.
                  zIndex: 3,
                  left: `${chromeX(cx) * 100}%`,
                  top: `${chromeY(cy) * 100}%`,
                  width: cx === 0.5 ? resizeEdgeTargetWidth : resizeTargetWidth,
                  height: resizeTargetHeight,
                  minWidth: 0,
                  minHeight: 0,
                  maxWidth: cx === 0.5 ? resizeEdgeTargetWidth : resizeTargetWidth,
                  maxHeight: resizeTargetHeight,
                  marginLeft: resizeTargetReach(cx, cx === 0.5 ? resizeEdgeTargetWidth : resizeTargetWidth),
                  marginTop: resizeTargetReach(cy, resizeTargetHeight),
                  padding: 0,
                  borderRadius: 3,
                  border: 0,
                  background: "transparent",
                  boxShadow: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  lineHeight: 0,
                  appearance: "none",
                  cursor,
                  pointerEvents: "auto",
                  touchAction: "none",
                }}
              >
                {/* The shared Office grip square, centred in the target. */}
                <span
                  data-testid="pdf-native-text-resize-handle-visual"
                  data-office-drawing-handle={handle}
                  aria-hidden="true"
                  className={officeDrawingSelectionStyles.resizeMark}
                  style={{
                    boxSizing: "border-box",
                    pointerEvents: "none",
                    transform: `translate(${resizeGripShift(cx, cx === 0.5 ? resizeEdgeTargetWidth : resizeTargetWidth)}px, ${resizeGripShift(cy, resizeTargetHeight)}px)`,
                  }}
                />
              </button>
            ))}
          </div>,
          inlinePageHost,
        )
      : null;
  const inlineFallback =
    !awaitingRequiredRibbonHost &&
    !layoutFrame &&
    inlineEditorHost instanceof HTMLElement
      ? createPortal(
          <>
            {visualDraft}
            {input}
          </>,
          inlineEditorHost,
        )
      : null;
  useLayoutEffect(() => { markPdfTextLatency("editor.layout-end"); });
  useEffect(() => { markPdfTextLatency("editor.effects-end"); });

  return (
    <>
      {stationaryInkCoverLayer}
      {layoutFrame}
      {typingCoverWanted && typingCover?.line === typingCoverLine && inlinePageHost && ownsInlineHost
        ? createPortal(
            <img
              alt=""
              aria-hidden="true"
              draggable={false}
              key={typingCover.url}
              data-testid="pdf-native-text-typing-cover"
              src={typingCover.url}
              onLoad={() => setTypingCoverLoaded(typingCover.url)}
              style={{
                position: "absolute",
                left: `${typingCover.rect.x * 100}%`,
                top: `${typingCover.rect.y * 100}%`,
                width: `${typingCover.rect.width * 100}%`,
                height: `${typingCover.rect.height * 100}%`,
                // Over the page and whatever stands on it for the line left
                // before this one (its staged page at 2, its ghost at 3: both
                // still draw this line's old ink), under the frame; up with
                // the draft, in one frame (typingCoverShown).
                zIndex: 4,
                visibility: typingCoverShown ? "visible" : "hidden",
                maxWidth: "none",
                maxHeight: "none",
                margin: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />,
            inlinePageHost,
          )
        : null}
      {latestMoveLift ? (
        // The lift cut last, read in off the page: shown (above) once decoded.
        <span aria-hidden="true" data-pdf-native-text-move-lift-preload="true"
          style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}>
          <img key={`ink-${latestMoveLift.id}`} alt="" src={latestMoveLift.url}
            onLoad={(event) => moveLiftPictureDecoded(latestMoveLift, "ink", event.currentTarget)} />
          {latestMoveLift.cover ? (
            <img key={`cover-${latestMoveLift.id}`} alt="" src={latestMoveLift.cover.url}
              onLoad={(event) => moveLiftPictureDecoded(latestMoveLift, "cover", event.currentTarget)} />
          ) : null}
        </span>
      ) : null}
      {moveLiftCoverShown && moveLift?.cover && inlinePageHost && ownsInlineHost
        ? createPortal(
            <img
              alt=""
              aria-hidden="true"
              draggable={false}
              data-testid="pdf-native-text-move-cover"
              src={moveLift.cover.url}
              style={{
                position: "absolute",
                left: `${moveLift.cover.rect.x * 100}%`,
                top: `${moveLift.cover.rect.y * 100}%`,
                width: `${moveLift.cover.rect.width * 100}%`,
                height: `${moveLift.cover.rect.height * 100}%`,
                // Over the page canvas, under the text layer and the frame.
                zIndex: 2,
                maxWidth: "none",
                maxHeight: "none",
                margin: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />,
            inlinePageHost,
          )
        : null}
      {inlineFallback}
      {toolbar}
      {symbolDialog ? (
        <OfficeSymbolDialog
          open
          // A PDF's text names its face per run and writes Unicode: the
          // legacy symbol fonts' private encodings are not offered.
          variant="powerpoint"
          labels={{
            title: translate("toolbar.symbolDialogTitle"),
            close: translate("toolbar.dialogClose"),
            symbolsTab: translate("toolbar.symbolTabSymbols"),
            specialCharactersTab: translate("toolbar.symbolTabSpecial"),
            fontLabel: translate("toolbar.symbolFontLabel"),
            normalText: translate("toolbar.symbolNormalText"),
            latinFontsGroup: translate("toolbar.symbolLatinFonts"),
            cjkFontsGroup: translate("toolbar.symbolCjkFonts"),
            symbolFontsGroup: translate("toolbar.symbolSymbolFonts"),
            grid: translate("toolbar.symbolGrid"),
            recent: translate("toolbar.symbolRecent"),
            characterColumn: translate("toolbar.symbolCharacterColumn"),
            shortcutColumn: translate("toolbar.symbolShortcutColumn"),
            shortcutLabel: translate("toolbar.symbolShortcutLabel"),
            shortcutNone: translate("toolbar.symbolShortcutNone"),
            autoCorrect: translate("toolbar.symbolAutoCorrect"),
            shortcutKey: translate("toolbar.symbolShortcutKey"),
            cancel: translate("toolbar.dialogClose"),
            insert: translate("toolbar.symbolInsertAction"),
            readout: (values) => translate("toolbar.symbolReadout", values),
            specialCharacterName: (id) =>
              translate(`toolbar.symbolSpecial_${id}` as "toolbar.symbolSpecial_emDash"),
            subset: translate("toolbar.symbolSubset"),
            characterCode: translate("toolbar.symbolCharacterCode"),
            codeFrom: translate("toolbar.symbolCodeFrom"),
            codeBaseName: (base) =>
              translate(`toolbar.symbolCodeBase_${base}` as "toolbar.symbolCodeBase_unicodeHex"),
            subsetName: (id) =>
              translate(`toolbar.symbolSubset_${id}` as "toolbar.symbolSubset_basicLatin"),
            invalidCode: translate("toolbar.characterCodeDoesNotNameCharacter"),
          }}
          recent={recentSymbols.map((char) => ({ char, font: null }))}
          onInsert={(insertion) => {
            const at = symbolDialog;
            setSymbolDialog(null);
            setRecentSymbols((recent) => [insertion.char, ...recent.filter((char) => char !== insertion.char)].slice(0, 20));
            const input = inputRef.current;
            if (!input?.isConnected || input.readOnly) return;
            // Typed as a key would be: the line's own input path takes it.
            input.focus({ preventScroll: true });
            input.setSelectionRange(at.start, at.end);
            document.execCommand("insertText", false, insertion.char);
          }}
          onCancel={() => {
            setSymbolDialog(null);
            inputRef.current?.focus({ preventScroll: true });
          }}
          testIdPrefix={NATIVE_TEXT_SYMBOL_TEST_PREFIX}
        />
      ) : null}
      {textContextMenu ? (
        <PointerContextMenu
          x={textContextMenu.x}
          y={textContextMenu.y}
          label={translate("pdf.nativeTextEdit.contextMenuLabel")}
          entries={textContextMenuEntries}
          onClose={() => {
            setTextContextMenu(null);
            // A command that left the line (添加批注 / 插入链接) handed the
            // keyboard to the editor it opened.
            if (menuLeftLineRef.current) {
              menuLeftLineRef.current = false;
              return;
            }
            inputRef.current?.focus({ preventScroll: true });
          }}
          ownerWindowId={
            (ribbonHost ?? inputRef.current)?.closest<HTMLElement>("[data-window-id]")?.dataset.windowId
          }
          testId={NATIVE_TEXT_CONTEXT_MENU_TEST_ID}
        />
      ) : null}
      <PdfSourceTextCaret ref={sourceCaretControllerRef} geometry={drawnCaretGeometry} renderToken={caretRenderToken} inputRef={inputRef}
        pageHost={inlinePageHost??null} pageWidth={pageWidthPixels} pageHeight={pageHeightPixels}
        inputLayout={activeInputLayout} initialPoint={objectSelected ? undefined : initialLayout?.caretPoint}
        selectsBlock={objectSelected} selectionHidden={formatPreviewShown && !(hoverExactShown && hoverExactGeometry) && shownFormatPreview?.band !== false}
        // Shown while the line is still being prepared: its glyphs come from
        // the loaded page then, and the editor already takes typing. Hidden
        // there, the box opened with no caret at all until the proof landed
        // (the textarea's own is not drawn over a source frame).
        
        hidden={composing||finishRequested!==null||objectSelected}/>
    </>
  );
}
