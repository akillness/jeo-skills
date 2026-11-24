"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import PdfNativeTextEditSessionHost from "../PdfNativeTextEditSessionHost";
import { useCallback, useMemo, type RefObject } from "react";
import { usePdfPageFontsInWindow } from "./usePdfPageFonts";
import { PDF_TRANSIENT_COMMIT_REFUSALS } from "./transientWriteRefusals";
import {
  pdfNativeRangesAsCommitted,
  pdfNativeReaderChunkSpelling,
  pdfNativeReaderSpelling,
  pdfNativeTextAsCommitted,
} from "../../../../../lib/pdf/native-text-reader-spelling";
import { pdfNativeListTextTargetKey } from "./nativeTextHistory";
import { nativeRetainedParagraph } from "../../../../../lib/pdf/native-indent-chain";
import type { PdfNativeTextRuleDecorations } from "../../../../../lib/pdf/native-text-rule-range";
import type { PdfNativeCoverRules } from "../../../../../lib/pdf/native-cover-rules";
import type {
  PdfNativeListTextSelectionEvidence,
  PdfNativeListTextSelectionProof,
  PdfNativeTextPropertyDraft,
  PdfNativeSingleLineFitHint,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";
import type {
  PdfNativeListTextEditLease,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import type { PdfNativeDetachedFormatAsk, PdfNativeRowFormat, PdfNativeTextLayoutDraft } from "../PdfNativeListTextEditDialog";
import type {
  PdfNativeTextEditSessionHandle,
} from "../PdfNativeTextEditSessionHost";
import type {
  PdfTextEditingContextRibbonAction,
  PdfTextEditingContextRibbonLabels,
} from "../PdfTextEditingContextRibbon";
import type { JsonValue } from "@mrnote/core/web/lib/collab/json-crdt.ts";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import type {
  PdfNativeTextContinuationCapture,
} from "../../../../../lib/pdf/native-text-continuation";
import type {
  PdfNativeParagraphFrameRequest,
  PdfNativeParagraphPropertyChanges,
} from "../../../../../lib/pdf/engine/native/paragraph-properties-transaction";
import type { PageWritable } from "@mrnote/core/web/lib/collab/page-writable.ts";
import type {
  PdfNativeTextInputLayout,
} from "../../../../../lib/pdf/native-text-input-layout";
import type { PdfSourceTextBoxBinding } from "../../../../../lib/pdf/source-text-box";
import type { PdfTextSourceAppearance } from "../../../../../lib/pdf/source-text-appearance";
import type {
  PdfTextBoxCommandTargetLike,
} from "../../../../../lib/pdf/text-box-command-target";
import type { BoxRect } from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";
import { pdfNativeParagraphBlockOfferedFor, type PdfNativeParagraphBlockOffer } from "../../../../../lib/pdf/text-edit/block-only-opening";
import type { PdfReaderLineAnnotationPlace } from "../PdfNativeListTextEditDialog";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

/** A new text box whose first words were written as page text (page
 * shares, and the words written). */
export type PdfNativeTextHandoffFrame = Readonly<{ x: number; y: number; width: number; height: number; text: string }>;

/** The right edge a line opened on a text box's words wraps at: the box's,
 * for the run written for them -- it starts at the box's left edge, its top
 * in the box, its words the words written and on -- where the box is wider
 * than the line. Page text the box was placed over is no such run. */
export function pdfNativeTextHandoffWrapRight(
  frame: PdfNativeTextHandoffFrame | null,
  box: Readonly<{ x: number; y: number; width: number; height: number; text?: string }> | null,
): number | null {
  if (!frame || !box) return null;
  const words = (value: string) => value.replace(/\s+/gu, "");
  const right = frame.x + frame.width;
  return Math.abs(box.x - frame.x) <= 0.012 && box.y >= frame.y - 0.006 && box.y < frame.y + frame.height &&
    words(box.text ?? "").startsWith(words(frame.text)) && words(frame.text).length > 0 &&
    right > box.x + box.width ? right : null;
}

export interface PdfPageWindowTextEditSessionModel {
  pageId: string;
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  textEditingRibbonLabels: PdfTextEditingContextRibbonLabels;
  pageWritable: PageWritable;
  workspaceWritable: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  nativeListTextPendingSelection: PdfNativeListTextSelectionEvidence | null;
  nativeListTextDialogLease: PdfNativeListTextEditLease | null;
  nativeListTextDraftSelection: PdfNativeListTextSelectionEvidence | null;
  /** The opening line's glyph geometry read from the loaded page before its
   * proof (keyed by the session it was read for). */
  nativeListTextProvisionalSourceGeometry?: Readonly<{ key: string; geometry: PdfTextSourceAppearance }> | null;
  /** A line opened queued and then on the revision read in keeps one dialog:
   * the later session key (`from`) renders under the earlier one (`to`). */
  nativeListTextSessionAliasRef?: RefObject<Readonly<{ from: string; to: string }> | null>;
  nativeTextEditSessionRef: RefObject<PdfNativeTextEditSessionHandle | null>;
  nativeListTextPreparationFailed: boolean;
  nativeListTextInitialDraftRef: RefObject<string | null>;
  nativeListTextMutationBusy: boolean;
  nativeListTextError: string | null;
  /** The server refused the write this editor committed; the page is back
   * at its last good state (PdfNativeListTextEditDialog `serverRefusal`). */
  nativeListTextServerRefusal: Readonly<{ id: string; message: string }> | null;
  nativeListTextDialogProofRef: RefObject<PdfNativeListTextSelectionProof | null>;
  nativeListTextInitialEditingSurfaceRef: RefObject<HTMLCanvasElement | null>;
  nativeListTextInitialEditingSurfacePreparedRef: RefObject<boolean>;
  /** The bytes the open editor's line is bound to (its preview source). */
  nativeListTextDialogPreviewSourceRef: RefObject<Readonly<{ sourceSha256: string }> | null>;
  nativeListTextReturnFocusRef: RefObject<HTMLElement | null>;
  nativeListTextInitialCaretOffsetRef: RefObject<number | null>;
  nativeTextHandoffFrameRef: RefObject<PdfNativeTextHandoffFrame | null>;
  nativeListTextInitialLayoutRef: RefObject<Readonly<{ singleLineFit?: PdfNativeSingleLineFitHint | undefined; sourceInputLayout?: PdfNativeTextInputLayout | null | undefined; sourceInputKey?: string | undefined; sourceText?: PdfSourceTextBoxBinding | undefined; box: PdfTextBoxCommandTargetLike; backgroundColor?: string | undefined; sourceInkCover?: string | undefined; origin: BoxRect; pageWidthPx: number; pageHeightPx: number; pageHeightPoints?: number | undefined; pdfToCssTransform?: readonly number[] | undefined; caretPoint?: Readonly<{ x: number; y: number; }> | undefined; promoted: boolean; fallbackText?: boolean | undefined; }> | null>;
  publishNativeListTextDraftState: (state: Readonly<{ replacementText: string; properties: PdfNativeTextPropertyDraft | null; dirty: boolean; composing: boolean; canCommit: boolean; commitBlockedReason: string | null; waitingForExactPreview: boolean; layoutFallbackActive: boolean; layout: Readonly<{ id: string; page: number; x: number; y: number; width: number; height: number; angle: number; originX: number; originY: number; originWidth: number; originHeight: number; pageWidthPx: number; pageHeightPx: number; fontSize: number; fontFamily?: string | undefined; sourceFontName?: string | undefined; bold: boolean; italic: boolean; color: string; align: "left" | "center" | "right"; underline?: boolean | undefined; strikethrough?: boolean | undefined; justify?: boolean | undefined; characterSpacing?: number | undefined; wordSpacing?: number | undefined; horizontalScale?: number | undefined; }> | null; }> | null) => void;
  handleNativeListTextEditorControllerChange: (controller: Readonly<{ readDraft: () => Readonly<{ replacementText: string; properties: PdfNativeTextPropertyDraft | null; dirty: boolean; composing: boolean; canCommit: boolean; commitBlockedReason: string | null; waitingForExactPreview: boolean; layoutFallbackActive: boolean; layout: Readonly<{ id: string; page: number; x: number; y: number; width: number; height: number; angle: number; originX: number; originY: number; originWidth: number; originHeight: number; pageWidthPx: number; pageHeightPx: number; fontSize: number; fontFamily?: string | undefined; sourceFontName?: string | undefined; bold: boolean; italic: boolean; color: string; align: "left" | "center" | "right"; underline?: boolean | undefined; strikethrough?: boolean | undefined; justify?: boolean | undefined; characterSpacing?: number | undefined; wordSpacing?: number | undefined; horizontalScale?: number | undefined; }> | null; }>; readCaret: () => Readonly<{ start: number; end: number; }>; commit: () => Promise<boolean>; finish: () => Promise<boolean>; readFinishing?: (() => boolean) | undefined; focus: (caretOffset?: number | null | undefined, caretPoint?: Readonly<{ x: number; y: number; }> | undefined) => void; applyRibbonAction: (action: PdfTextEditingContextRibbonAction) => boolean; readFormat: () => Readonly<{ bold: boolean; italic: boolean; color: string | null; fontSize: number | null; boxFontSize: number | null; pageHeightPoints: number | null; }>; }> | null) => void;
  /** Words typed in the open line not written yet (the save status). */
  setNativeListTextUnsavedTyping?: (unsaved: boolean) => void;
  /** The open line's words while they differ from the page's (null once they
   * do not), as its box reads them: kept past the tab
   * (lib/pdf/native-text-typing-drafts). */
  keepNativeListTextTypingDraft?: (draft: Readonly<{ originalText: string; value: string;
    formats?: import("../PdfNativeListTextEditDialog").PdfNativeTextFormatDraft }> | null) => void;
  pdfNativeTransactionsRef: RefObject<JsonValue | undefined>;
  page: PageItem | null;
  dataItemId: string;
  captureNextTextTarget: PdfNativeTextContinuationCapture;
  /** Undo pressed in the open line: true when the page takes the press (a
   * new text box still being typed is taken back whole). */
  takeNativeTextUndoKey?: () => boolean;
  inheritNextTextTarget?: () => ((accepted: boolean) => void) | null;
  dismissNativeTextContinuation: () => void;
  closeNativeListTextDialog: () => void;
  openLineOfNativeTextBlock: (press: Readonly<{ clientX: number; clientY: number }>) => void;
  /** The paragraphs refused whole that open as a block for their formats,
   * and the ask for the one the open line is of (block-only-opening). */
  nativeParagraphBlockOffers: readonly PdfNativeParagraphBlockOffer[];
  selectWholeNativeTextParagraph: () => void;
  retainNativeListTextDraft: (text: string) => void;
  exitReaderContentEditMode: () => void;
  requestReaderHandTool: () => void;
  requestReaderInsertText: () => void;
  annotateReaderTextLine: (kind: "note" | "link", place: PdfReaderLineAnnotationPlace) => void;
  convertReaderTextLineToFormula: (replacementText: string, latex: string) => Promise<boolean>;
  prepareNativeListTextCandidatePreview: (replacementText: string, propertyDraft: PdfNativeTextPropertyDraft | null, pageHost: HTMLElement, signal: AbortSignal, paragraphChanges?: PdfNativeParagraphPropertyChanges | undefined, paragraphFrame?: PdfNativeParagraphFrameRequest) => Promise<HTMLCanvasElement | null>;
  nativeTextCommitDecision: Readonly<{ enabled: boolean; reasonKey: string | null; reasonLabel: string | null; }>;
  nativeTextDecorations: PdfNativeTextRuleDecorations | undefined;
  /** The rules beside the open run are still being read (the editor's standingRulesPending). */
  nativeTextStandingRulesPending: boolean;
  /** A scanned line's rules beside its invisible words: read, or proved. */
  nativeCoverRules: PdfNativeCoverRules | undefined;
  executeNativeTextCommitKeepingRules: (replacementText: string, propertyDraft: PdfNativeTextPropertyDraft | null, layoutDraft?: Readonly<{ id: string; page: number; x: number; y: number; width: number; height: number; angle: number; originX: number; originY: number; originWidth: number; originHeight: number; pageWidthPx: number; pageHeightPx: number; fontSize: number; fontFamily?: string | undefined; sourceFontName?: string | undefined; bold: boolean; italic: boolean; color: string; align: "left" | "center" | "right"; underline?: boolean | undefined; strikethrough?: boolean | undefined; justify?: boolean | undefined; characterSpacing?: number | undefined; wordSpacing?: number | undefined; horizontalScale?: number | undefined; }> | null | undefined, paragraphChanges?: PdfNativeParagraphPropertyChanges | undefined, paragraphFrame?: PdfNativeParagraphFrameRequest) => Promise<boolean>;
  pdfFontPickerLabels: { browse: string; search: string; searchPlaceholder: string; recent: string; pinned: string; officeFonts: string; allFonts: string; pin: string; unpin: string; available: string; missing: string; unverified: string; browseUnsupported: string; browseDenied: string; browseFailed: string; noResults: string; variants: string; mixed: string; };
  nativeParagraphJustifiable: boolean;
  commitNativeParagraphJustify: () => Promise<boolean>;
  commitNativeTextObjectDelete: () => Promise<boolean>;
  /** A retyped line finished by the window, the reader going on at once. */
  detachNativeTextFinish: (text: string, ghost: () => (() => void) | null,
    properties?: PdfNativeTextPropertyDraft | null, acceptedProperties?: PdfNativeTextPropertyDraft | null,
    paragraphAfter?: PdfNativeRowFormat | null) => boolean;
  /** A saved text box left while the save before it runs: written by the
   * window after that save, the reader going on at once. */
  deferNativeTextLayoutFinish: (text: string, layout: PdfNativeTextLayoutDraft,
    ghost: () => (() => void) | null) => boolean;
  /** A whole box's font, colour or slant set on each of its rows in the
   * page's own text (one property edit a row); null when the window
   * cannot set it so. */
  applyNativeRowFormat: (format: PdfNativeRowFormat) => Promise<boolean | null>;
  /** The same format written by the window after the box's editor has
   * closed, the reader going on at once; false when not taken. */
  detachNativeRowFormat: (format: PdfNativeRowFormat, typedText: string | undefined,
    ghost: () => (() => void) | null, asked?: PdfNativeDetachedFormatAsk) => boolean;
}



function withRangesAsCommitted(
  spelling: Parameters<typeof pdfNativeRangesAsCommitted>[0],
  text: string,
  properties: PdfNativeTextPropertyDraft,
): PdfNativeTextPropertyDraft {
  return {
    ...properties,
    ...(properties.segments ? { segments: pdfNativeRangesAsCommitted(spelling, text, properties.segments) } : {}),
    ...(properties.textRuleParts ? { textRuleParts: pdfNativeRangesAsCommitted(spelling, text, properties.textRuleParts) } : {}),
  };
}

export function PdfPageWindowTextEditSession({ session }: { session: PdfPageWindowTextEditSessionModel }) {
  const {
    pageId,
    t,
    textEditingRibbonLabels,
    pageWritable,
    workspaceWritable,
    rootRef,
    nativeListTextPendingSelection,
    nativeListTextDialogLease,
    nativeListTextDraftSelection,
    nativeListTextProvisionalSourceGeometry,
    nativeListTextSessionAliasRef,
    nativeTextEditSessionRef,
    nativeListTextPreparationFailed,
    nativeListTextInitialDraftRef,
    nativeListTextMutationBusy,
    nativeListTextError,
    nativeListTextServerRefusal,
    nativeListTextDialogProofRef,
    nativeListTextInitialEditingSurfaceRef,
    nativeListTextInitialEditingSurfacePreparedRef,
    nativeListTextDialogPreviewSourceRef,
    nativeListTextReturnFocusRef,
    nativeListTextInitialCaretOffsetRef,
    nativeTextHandoffFrameRef,
    nativeListTextInitialLayoutRef,
    publishNativeListTextDraftState,
    handleNativeListTextEditorControllerChange,
    setNativeListTextUnsavedTyping,
    keepNativeListTextTypingDraft,
    pdfNativeTransactionsRef,
    page,
    dataItemId,
    captureNextTextTarget,
    takeNativeTextUndoKey,
    inheritNextTextTarget,
    dismissNativeTextContinuation,
    closeNativeListTextDialog,
    openLineOfNativeTextBlock,
    nativeParagraphBlockOffers,
    selectWholeNativeTextParagraph,
    retainNativeListTextDraft,
    exitReaderContentEditMode,
    requestReaderHandTool,
    requestReaderInsertText,
    annotateReaderTextLine,
    convertReaderTextLineToFormula,
    prepareNativeListTextCandidatePreview,
    nativeTextCommitDecision,
    nativeTextDecorations,
    nativeTextStandingRulesPending,
    nativeCoverRules,
    executeNativeTextCommitKeepingRules,
    pdfFontPickerLabels,
    nativeParagraphJustifiable,
    commitNativeParagraphJustify,
    commitNativeTextObjectDelete,
    detachNativeTextFinish,
    deferNativeTextLayoutFinish,
    applyNativeRowFormat,
    detachNativeRowFormat,
  } = session;
  // The text the box is edited in: the source's spelling, or the reader's
  // when the source spells no space where the reader reads one in a kerning
  // gap (a TeX line). An untouched draft answers in the source's spelling,
  // so every "unchanged" rule of the window holds as before; an edited one
  // in the reader's, which the planner writes with the line's gaps kept.
  const promotedText = nativeListTextInitialLayoutRef.current?.promoted
    ? nativeListTextInitialLayoutRef.current.box.text : null;
  const sourceText = promotedText ??
    (nativeListTextDialogProofRef.current?.evidence.originalDisplayText ??
      nativeListTextDialogLease?.selection.item.str ??
      nativeListTextInitialLayoutRef.current?.box.text ??
      "");
  const readerText = promotedText === null
    ? nativeListTextDialogProofRef.current?.evidence.selection?.item.str ?? null : null;
  const readerChunk = promotedText === null && Boolean(nativeListTextDialogProofRef.current?.evidence.readerChunk);
  const spelling = useMemo(() => (readerChunk ? pdfNativeReaderChunkSpelling(sourceText, readerText) : null) ??
    pdfNativeReaderSpelling(sourceText, readerText), [readerChunk, sourceText, readerText]);
  type Draft = Parameters<typeof publishNativeListTextDraftState>[0];
  const draftAsCommitted = useCallback(<D extends NonNullable<Draft>>(draft: D): D => {
    if (!spelling || draft.replacementText !== spelling.reader) return draft;
    const properties = draft.properties ? withRangesAsCommitted(spelling, draft.replacementText, draft.properties)
      : draft.properties;
    return { ...draft, replacementText: spelling.source, properties };
  }, [spelling]);
  const propertiesAsCommitted = useCallback((text: string, properties: PdfNativeTextPropertyDraft | null) =>
    properties && spelling && text === spelling.reader ? withRangesAsCommitted(spelling, text, properties)
      : properties, [spelling]);
  
  
  // takes the source's own spelling of an untouched line (a TeX heading
  // made larger and refused natively was boxed as 「7ModelFunctionality」).
  const applyAsCommitted = useCallback<typeof executeNativeTextCommitKeepingRules>(
    (text, properties, ...rest) => rest[0]
      ? executeNativeTextCommitKeepingRules(text, properties, ...rest)
      : executeNativeTextCommitKeepingRules(
        pdfNativeTextAsCommitted(spelling, text), propertiesAsCommitted(text, properties), ...rest),
    [executeNativeTextCommitKeepingRules, propertiesAsCommitted, spelling]);
  const previewAsCommitted = useCallback<typeof prepareNativeListTextCandidatePreview>(
    (text, properties, ...rest) => prepareNativeListTextCandidatePreview(
      pdfNativeTextAsCommitted(spelling, text), propertiesAsCommitted(text, properties), ...rest),
    [prepareNativeListTextCandidatePreview, propertiesAsCommitted, spelling]);
  const publishDraftAsCommitted = useCallback<typeof publishNativeListTextDraftState>(
    (state) => publishNativeListTextDraftState(state ? draftAsCommitted(state) : state),
    [publishNativeListTextDraftState, draftAsCommitted]);
  const controllerAsCommitted = useCallback<typeof handleNativeListTextEditorControllerChange>(
    (controller) => handleNativeListTextEditorControllerChange(controller
      ? { ...controller, readDraft: () => draftAsCommitted(controller.readDraft()) }
      : controller),
    [handleNativeListTextEditorControllerChange, draftAsCommitted]);
  const detachAsCommitted = useCallback(
    (text: string, ghost: () => (() => void) | null, properties?: PdfNativeTextPropertyDraft | null,
      acceptedProperties?: PdfNativeTextPropertyDraft | null, paragraphAfter?: PdfNativeRowFormat | null) =>
      detachNativeTextFinish(pdfNativeTextAsCommitted(spelling, text), ghost,
        properties ? propertiesAsCommitted(text, properties) : properties,
        acceptedProperties ? propertiesAsCommitted(text, acceptedProperties) : acceptedProperties, paragraphAfter),
    [detachNativeTextFinish, propertiesAsCommitted, spelling]);
  const deferAsCommitted = useCallback(
    (text: string, layout: PdfNativeTextLayoutDraft, ghost: () => (() => void) | null) =>
      deferNativeTextLayoutFinish(pdfNativeTextAsCommitted(spelling, text), layout, ghost),
    [deferNativeTextLayoutFinish, spelling]);
  const retainAsCommitted = useCallback(
    (text: string) => retainNativeListTextDraft(pdfNativeTextAsCommitted(spelling, text)),
    [retainNativeListTextDraft, spelling]);
  // The fonts from readers' computers this page keeps (page-fonts.ts).
  const pageFontsInWindow = usePdfPageFontsInWindow();
  const initialDraftText = nativeListTextInitialDraftRef.current;
  const openSelection = nativeListTextDraftSelection ?? nativeListTextDialogLease?.selection ?? null;
  const sessionKey = openSelection
    ? `${pdfNativeListTextTargetKey(openSelection)}:${openSelection.sourceSha256}:${openSelection.selectionRevision}`
    : "closed";
  const sessionAlias = nativeListTextSessionAliasRef?.current;
  return (
    <PdfNativeTextEditSessionHost
      ref={nativeTextEditSessionRef}
      scopeKey={`${pageId}:${dataItemId}:${page?.content_version}:${pageWritable.writable}:${workspaceWritable}`}
      sessionKey={sessionAlias?.from === sessionKey ? sessionAlias.to : sessionKey}
      open={nativeListTextDialogLease !== null || nativeListTextDraftSelection !== null}
      preparationPending={nativeListTextDraftSelection !== null && nativeListTextDialogLease === null && nativeListTextPendingSelection !== null}
      originalText={spelling?.reader ?? sourceText}
      propertyProof={nativeListTextDialogProofRef.current?.properties ?? null}
      nativeMoveProof={nativeListTextDialogProofRef.current?.properties ? null :
        nativeListTextDialogProofRef.current?.move ?? null}
      nativeGroupMoveProof={nativeListTextDialogProofRef.current?.groupMove ?? null}
      sourceAppearance={nativeListTextDialogProofRef.current?.sourceAppearance}
      boxDrawnStyle={nativeListTextDialogProofRef.current?.drawnStyle}
      type3PicturesOnly={nativeListTextDialogProofRef.current?.type3Pictures === true}
      type3TakesWeight={nativeListTextDialogProofRef.current?.type3Weight === true}
      type3LettersHeld={nativeListTextDialogProofRef.current?.type3Letters === true}
      // Until the proof lands, the glyphs read from the loaded page: the
      // caret is drawn on them from the first moment, not the textarea's.
      sourceGeometry={(() => {
        const proof = nativeListTextDialogProofRef.current;
        const geometry = proof?.sourceGeometry ??
          (nativeListTextProvisionalSourceGeometry?.key === sessionKey
            ? nativeListTextProvisionalSourceGeometry.geometry : undefined);
        if (process.env.NODE_ENV !== "production" && proof) {
          const sel = proof.evidence.selection;
          console.debug("[pdf-text] line geometry " + JSON.stringify({ has: Boolean(geometry), own: Boolean(proof.sourceGeometry),
            page: sel?.pageNumber, sha: sel?.sourceSha256?.slice(0, 8), text: proof.evidence.originalDisplayText?.slice(0, 30),
            items: sel?.items?.map((item) => [item.str.slice(0, 12), Math.round(item.transform[4] * 100) / 100,
              Math.round(item.transform[5] * 100) / 100, item.height]) }));
        }
        return geometry;
      })()}
      paragraphColors={nativeListTextDialogProofRef.current?.properties ? undefined :
        nativeListTextDialogProofRef.current?.propertyRuns?.map(run => run.color)}
      onJustifyParagraph={commitNativeParagraphJustify}
      paragraphJustifyDisabledReason={
        // Only a paragraph whose own frame is proven has something to
        // stretch to, and only one that is not already justified.
        nativeParagraphJustifiable ? null : textEditingRibbonLabels.unavailable
      }
      ribbonLabels={textEditingRibbonLabels}
      fontPickerLabels={pdfFontPickerLabels}
      {...(pageFontsInWindow
        ? { pageFonts: pageFontsInWindow.pageFonts, onPreparePageFont: pageFontsInWindow.preparePageFont }
        : {})}
      busy={nativeListTextMutationBusy}
      error={nativeListTextError}
      serverRefusal={nativeListTextServerRefusal}
      applyDisabledReason={
        // A passing state (the last save still verified, its revision
        // reloading) is waited out by the commit, never said as a refusal.
        (nativeListTextDialogLease || nativeListTextDraftSelection) && !nativeTextCommitDecision.enabled &&
          !PDF_TRANSIENT_COMMIT_REFUSALS.has(nativeTextCommitDecision.reasonKey ?? "")
          ? nativeTextCommitDecision.reasonLabel
          : null
      }
      returnFocusRef={nativeListTextReturnFocusRef}
      ribbonRootRef={rootRef}
      requireRibbonHost
      paintRibbonAfterFocus
      initialCaretOffset={nativeListTextInitialCaretOffsetRef.current}
      wrapFrameRight={pdfNativeTextHandoffWrapRight(nativeTextHandoffFrameRef.current,
        nativeListTextInitialLayoutRef.current?.box ?? null)}
      initialEditingSurface={nativeListTextInitialEditingSurfaceRef.current}
      drawnSourceSha256={nativeListTextDialogPreviewSourceRef.current?.sourceSha256 ?? null}
      initialEditingSurfacePrepared={
        nativeListTextInitialEditingSurfacePreparedRef.current
      }
      initialLayout={nativeListTextInitialLayoutRef.current}
      labels={{
        title: t("pdf.pageWindow.editOriginalText"),
        description: t("pdf.pageWindow.editOneVerifiedSourceText"),
        field: t("pdf.pageWindow.replacementText"),
        geometryNotice: t("pdf.pageWindow.textWrapsInsideFrameGrows"),
        apply: t("pdf.pageWindow.saveNewVersion"),
        applying: t("pdf.pageWindow.verifyingSaving"),
        previewing: t("pdf.pageWindow.renderingExactPdfResultBefore"),
        cancel: t("pdf.pageWindow.cancel"),
        font: t("pdf.pageWindow.font"),
        size: t("pdf.pageWindow.fontSize2"),
        bold: t("pdf.pageWindow.bold"),
        italic: t("pdf.pageWindow.italic"),
        color: t("pdf.pageWindow.textColor"),
        alignment: t("pdf.pageWindow.alignment"),
        alignLeft: t("pdf.pageWindow.left"),
        alignCenter: t("pdf.pageWindow.center"),
        alignRight: t("pdf.pageWindow.right"),
        advanced: t("pdf.pageWindow.spacingIndents"),
        characterSpacing: t("pdf.pageWindow.characterSpacing"),
        wordSpacing: t("pdf.pageWindow.wordSpacing"),
        lineSpacing: t("pdf.pageWindow.lineSpacing"),
        leftIndent: t("pdf.pageWindow.leftIndent"),
        rightIndent: t("pdf.pageWindow.rightIndent"),
        firstLineIndent: t("pdf.pageWindow.firstLineIndent"),
        horizontalScale: t("pdf.pageWindow.horizontalScale"),
      }}
      onApply={applyAsCommitted}
      onDeleteTextObject={commitNativeTextObjectDelete}
      {...(nativeTextDecorations ? { nativeTextDecorations } : {})}
      standingRulesPending={nativeTextStandingRulesPending}
      {...(nativeCoverRules ? { nativeCoverRules } : {})}
      // The indent earlier saves wrote into this run (native-indent-chain).
      {...(() => {
        const retained = nativeRetainedParagraph(
          pdfNativeTransactionsRef.current,
          nativeListTextDialogProofRef.current?.properties?.original ?? null,
        );
        return {
          retainedLeftIndent: retained.leftIndent,
          retainedAlignment: retained.alignment,
          retainedFrameShift: retained.frameShift,
        };
      })()}
      onPreparePreview={previewAsCommitted}
      onControllerChange={controllerAsCommitted}
      onDraftStateChange={publishDraftAsCommitted}
      onUnsavedTypingChange={setNativeListTextUnsavedTyping}
      onTypingDraftChange={keepNativeListTextTypingDraft}
      onCancel={closeNativeListTextDialog}
      onOpenLineOfBlock={openLineOfNativeTextBlock}
      onSelectWholeParagraph={nativeParagraphBlockOffers.some((offer) => pdfNativeParagraphBlockOfferedFor(offer,
        nativeListTextDialogProofRef.current?.evidence.selection)) ? selectWholeNativeTextParagraph : undefined}
      preparationFailed={nativeListTextPreparationFailed}
      initialDraftText={spelling && initialDraftText === spelling.source ? spelling.reader : initialDraftText}
      onRetainUnsavedDraft={retainAsCommitted}
      onDetachFinish={detachAsCommitted}
      // A box no one run's proof states (rows of their own, or one line the
      // page draws as several shows): its formats go on each run in the
      
      
      onApplyRowFormat={nativeListTextDialogProofRef.current && !nativeListTextDialogProofRef.current.properties
        ? applyNativeRowFormat : undefined}
      onDetachRowFormat={nativeListTextDialogProofRef.current && !nativeListTextDialogProofRef.current.properties
        ? detachNativeRowFormat : undefined}
      // A centred line typed longer or shorter is set again as a centred
      // paragraph whatever proof its run has (the editor's centredRetype).
      onApplyParagraphFormat={nativeListTextDialogProofRef.current ? applyNativeRowFormat : undefined}
      onDetachParagraphFormat={nativeListTextDialogProofRef.current ? detachNativeRowFormat : undefined}
      onDeferLayoutFinish={deferAsCommitted}
      onExitContentEditMode={exitReaderContentEditMode}
      onHandTool={requestReaderHandTool}
      onInsertText={requestReaderInsertText}
      onAnnotateLine={annotateReaderTextLine}
      onConvertToFormula={convertReaderTextLineToFormula}
      onDismiss={dismissNativeTextContinuation}
      captureNextTextTarget={captureNextTextTarget}
      pageTakesUndo={takeNativeTextUndoKey}
      inheritNextTextTarget={inheritNextTextTarget}
    />
  );
}
