"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfDocumentPageMap, PdfDocumentPageStructure } from "../../../../../lib/pdf/structured-document";
import type { Dispatch, SetStateAction, RefObject } from "react";
import { PdfTextEditor } from "./pageWindowTextEditor";
import type {
  useAutosavedPageDocument,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import type { PdfTextBoxEdit } from "../PdfTextBoxOverlay";
import type { PdfImageOverlayItem } from "../PdfImageOverlay";
import type { PdfInkStroke } from "../PdfInkOverlay";
import type { InkPenType } from "@mrnote/core/web/lib/pdf/ink.ts";
import type { DocumentInkEraser } from "@mrnote/core/web/lib/document-ink.ts";
import type { PdfInkEraseResult } from "../../../../../lib/pdf/ink-erase";
import type { PdfEditorRibbonTab } from "./editorRibbonTabs";
import type {
  PdfEditorContextCommand,
  PdfEditorObjectSelection,
  PdfEmbeddedImageAction,
} from "../PdfTextEditor";
import type {
  PdfTextCommentPointerTool,
} from "@/components/notebook/contents/pdf/PdfCommentRibbonTab";
import type { EmbeddedImageEdit } from "@/lib/pdf/embedded-image-edits";
import type { PdfPageTextState } from "./pageTextState";
import type {
  NativePdfFreeTextAnnotation,
  NativePdfFreeTextImportLoss,
} from "../../../../../lib/pdf/native-free-text-annotations";
import type { KeyedEditHistoryEntry } from "../../../../../lib/pdf/edit-history";
import type { PdfTextBoxCommandTarget } from "../PdfTextEditor";
import type { PdfSmartCropResult } from "../../../../../lib/pdf/smart-crop";
import { pdfTextBoxLaneWrites } from "../../../../../lib/pdf/native-free-text-annotations";
import type { PdfNativePlanners } from "../../../../../lib/pdf/remote/pdf-native-planners";

export interface PdfPageWindowTextEditorModel {
  /** The window's page-bound planners (`createPdfNativePlanners(pageId)`). */
  nativePlanners: PdfNativePlanners;
  savePolicyV1: boolean;
  workspaceWritable: boolean;
  textBoxEdits: PdfTextBoxEdit[];
  formulaDraftsByKey: Record<string, string>;
  setFormulaDraftsByKey: Dispatch<SetStateAction<Record<string, string>>>;
  pdfFormulaSourceFlushActiveRef: RefObject<boolean>;
  imageOverlays: PdfImageOverlayItem[];
  inkStrokes: PdfInkStroke[];
  /** The page room's presence: ink drawn here goes out live, the others' shows. */
  liveInkAwareness?: import("y-protocols/awareness").Awareness | null;
  inkDrawMode: boolean;
  inkColor: string;
  inkWidth: number;
  inkPenType: InkPenType;
  /** The Draw tab's Eraser armed, with its kind; a drag's erase as one command. */
  inkEraseMode: boolean;
  inkEraserKind: DocumentInkEraser;
  recordEraseInkStrokes: (result: PdfInkEraseResult) => void;
  editorRibbonTab: PdfEditorRibbonTab;
  editorRibbonTabRef: RefObject<PdfEditorRibbonTab>;
  editorContextCommand: PdfEditorContextCommand | null;
  editorObjectSelectionResetKey: number;
  textEditViewMode: "continuous" | "single" | "spread";
  addTextMode: boolean;
  textCommentContextActive: boolean;
  textCommentPointerTool: PdfTextCommentPointerTool;
  picturePointerTool: PdfTextCommentPointerTool;
  textCommentFontSizePoints: number;
  textCommentFontColor: string;
  imageEditMode: boolean;
  textEditEntryPainting: { pageNumber: number; canvas: HTMLCanvasElement; } | null;
  nativeImageSelectRequest: { page: number; order: number; requestId: number; reveal?: boolean | undefined; } | null;
  /** A text box comment double-clicked in the reader: its caret goes in. */
  freeTextFocusRequest: Readonly<{ id: string; nonce: number }> | null;
  embeddedImageEdits: Readonly<Record<string, EmbeddedImageEdit>>;
  setQueuedSurfaceImageCommands: Dispatch<SetStateAction<number>>;
  embeddedImageBusy: boolean;
  handleEditorObjectSelectionChange: (selection: PdfEditorObjectSelection | null) => void;
  pdfPageTextState: PdfPageTextState | null;
  setPdfPageCount: Dispatch<SetStateAction<number>>;
  currentPage: number;
  setCurrentPageWithIntent: (nextPage: number | ((current: number) => number)) => void;
  autosave: ReturnType<typeof useAutosavedPageDocument>;
  dataItemId: string;
  handleNativeFreeTextAnnotationsChange: (payload: { pageNumber: number; textBoxes: NativePdfFreeTextAnnotation[]; losses: NativePdfFreeTextImportLoss[]; }) => void;
  previewUrl: string;
  provisionalSurfaceSource: { key: string; basePreviewUrl: string; painted: boolean; } | null;
  surfaceSourceUrl: string;
  /** The page map the surface reads its saved file with (null: as numbered). */
  surfaceDocumentPageStructure: PdfDocumentPageStructure | null;
  onSurfaceDocumentPageMapChange: (map: PdfDocumentPageMap | null) => void;
  handleEmbeddedImageAction: (action: PdfEmbeddedImageAction) => Promise<void>;
  embeddedImagePreviewUrls: Readonly<Record<string, string>>;
  handleEditorSourceRevisionRendered: (url: string) => void;
  nativeImageTransformReady: boolean;
  enqueueNativeFreeTextCommit: (update: PdfTextBoxEdit[] | ((current: PdfTextBoxEdit[]) => PdfTextBoxEdit[])) => void;
  handleCreatedTextBoxCommit: (id: string, committedText: string) => Promise<boolean>;
  recordTextBoxHistory: (entry: KeyedEditHistoryEntry<PdfTextBoxEdit>) => void;
  recordAddInkStroke: (stroke: PdfInkStroke) => void;
  resolveImageUrl: (id: string) => string;
  handleImageOverlayChange: (next: PdfImageOverlayItem) => Promise<void>;
  handleImageOverlayDelete: (id: string) => Promise<void>;
  handlePdfPageTextChange: (input: { page: number; text: string; }) => void;
  handlePdfPageTextBoxesChange: (input: { page: number; boxes: PdfTextBoxCommandTarget[]; }) => void;
  pageRotations: Record<number, 0 | 90 | 180 | 270>;
  deleteInkStroke: (id: string) => void;
  handleSmartCropDetectorChange: (detector: (() => PdfSmartCropResult) | null) => void;
  textCommentFont: { readonly fontFamily: "Arial, Helvetica, sans-serif"; readonly label: "Arial"; readonly sourceFontName: "Helvetica"; readonly value: "helvetica"; } | { readonly fontFamily: "\"Times New Roman\", Times, serif"; readonly label: "Times New Roman"; readonly sourceFontName: "Times New Roman"; readonly value: "times"; } | { readonly fontFamily: "\"Courier New\", Courier, monospace"; readonly label: "Courier New"; readonly sourceFontName: "Courier New"; readonly value: "courier"; } | { readonly fontFamily: "\"Microsoft YaHei\", \"Noto Sans CJK SC\", sans-serif"; readonly label: "Microsoft YaHei"; readonly sourceFontName: "Microsoft YaHei"; readonly value: "cjkSans"; } | { readonly fontFamily: "SimSun, \"Noto Serif CJK SC\", serif"; readonly label: "SimSun"; readonly sourceFontName: "SimSun"; readonly value: "cjkSerif"; };
}

export function PdfPageWindowTextEditor({ editor }: { editor: PdfPageWindowTextEditorModel }) {
  const { nativePlanners, savePolicyV1, workspaceWritable, textBoxEdits, formulaDraftsByKey, setFormulaDraftsByKey, pdfFormulaSourceFlushActiveRef, imageOverlays, inkStrokes, liveInkAwareness, inkColor, inkWidth, inkPenType, inkEraserKind, recordEraseInkStrokes, editorRibbonTab, editorRibbonTabRef, editorContextCommand, editorObjectSelectionResetKey, textEditViewMode, addTextMode, textCommentContextActive, textCommentPointerTool, textCommentFontSizePoints, textCommentFontColor, textEditEntryPainting, nativeImageSelectRequest, freeTextFocusRequest, embeddedImageEdits, setQueuedSurfaceImageCommands, embeddedImageBusy, handleEditorObjectSelectionChange, pdfPageTextState, setPdfPageCount, currentPage, setCurrentPageWithIntent, autosave, dataItemId, handleNativeFreeTextAnnotationsChange, previewUrl, provisionalSurfaceSource, surfaceSourceUrl, surfaceDocumentPageStructure, onSurfaceDocumentPageMapChange, handleEmbeddedImageAction, embeddedImagePreviewUrls, handleEditorSourceRevisionRendered, nativeImageTransformReady, enqueueNativeFreeTextCommit, handleCreatedTextBoxCommit, recordTextBoxHistory, recordAddInkStroke, resolveImageUrl, handleImageOverlayChange, handleImageOverlayDelete, handlePdfPageTextChange, handlePdfPageTextBoxesChange, pageRotations, deleteInkStroke, handleSmartCropDetectorChange, textCommentFont } = editor;
  return (
    <PdfTextEditor
      // Mounted once per document: a revision (a save's export, an
      // Undo) swaps in place on the surface, keeping the painted
      // page, the overlays and the selection. Keyed on the preview
      
      // after every picture write.
      key={savePolicyV1 ? dataItemId || previewUrl : "legacy-image-editor"}
      url={surfaceSourceUrl}
      nativePlanners={nativePlanners}
      documentPageStructure={surfaceDocumentPageStructure}
      onDocumentPageMapChange={onSurfaceDocumentPageMapChange}
      documentKey={savePolicyV1 ? dataItemId || undefined : undefined}
      onSourceRevisionRendered={handleEditorSourceRevisionRendered}
      entryPainting={textEditEntryPainting}
      imageWritePending={
        savePolicyV1 && Object.keys(embeddedImageEdits).length > 0
      }
      // Once the page painted the write, the draft stays out of
      // sight through the switch to the accepted URL (same bytes)
      // until the draft is dropped with it.
      imageDraftsSuperseded={Boolean(provisionalSurfaceSource?.painted)}
      onQueuedImageCommandsChange={setQueuedSurfaceImageCommands}
      page={Math.max(0, currentPage - 1)}
      viewMode={textEditViewMode}
      pageRotations={pageRotations}
      edits={textBoxEdits}
      onEditsChange={(next) => {
        if (
          editorRibbonTabRef.current !== "insert" &&
          true &&
          true &&
          !pdfFormulaSourceFlushActiveRef.current
        ) {
          return;
        }
        enqueueNativeFreeTextCommit(next);
      }}
      onTextBoxHistory={recordTextBoxHistory}
      canWriteTextBoxEdit={pdfTextBoxLaneWrites}
      onCreatedBoxCommit={handleCreatedTextBoxCommit}
      onPageChange={setCurrentPageWithIntent}
      formulaDraftsByKey={formulaDraftsByKey}
      onFormulaDraftsChange={setFormulaDraftsByKey}
      addTextMode={
        (editorRibbonTab === "insert" ||
          false ||
          false) &&
        addTextMode
      }
      addTextStyle={
        textCommentContextActive
          ? {
              color: textCommentFontColor,
              fontFamily: textCommentFont.fontFamily,
              fontSizePoints: textCommentFontSizePoints,
              sourceFontName: textCommentFont.sourceFontName,
            }
          : undefined
      }
      imageEditMode={
        false
      }
      embeddedImageEdits={embeddedImageEdits}
      nativeImageTransformReady={nativeImageTransformReady}
      embeddedImagePreviewUrls={embeddedImagePreviewUrls}
      onEmbeddedImageAction={(action) => {
        void handleEmbeddedImageAction(action);
      }}
      embeddedImageBusy={embeddedImageBusy}
      objectInteractionDisabled={
        !workspaceWritable || autosave.readOnly
      }
      panMode={
        (textCommentContextActive &&
          textCommentPointerTool === "hand") ||
        (false)
      }
      onObjectSelectionChange={handleEditorObjectSelectionChange}
      objectSelectionResetKey={editorObjectSelectionResetKey}
      contextCommand={editorContextCommand}
      selectImageRequest={nativeImageSelectRequest}
      focusTextBoxRequest={freeTextFocusRequest}
      onPageCountChange={setPdfPageCount}
      onPageTextChange={handlePdfPageTextChange}
      onPageTextBoxesChange={handlePdfPageTextBoxesChange}
      onSmartCropDetectorChange={handleSmartCropDetectorChange}
      onNativeFreeTextAnnotationsChange={
        handleNativeFreeTextAnnotationsChange
      }
      pageTextHint={
        pdfPageTextState?.page === Math.max(0, currentPage - 1) &&
        pdfPageTextState.origin !== "editor"
          ? pdfPageTextState.text
          : undefined
      }
      imageOverlays={imageOverlays}
      resolveImageUrl={resolveImageUrl}
      onImageChange={handleImageOverlayChange}
      onImageDelete={handleImageOverlayDelete}
      inkStrokes={inkStrokes}
      liveInkAwareness={liveInkAwareness}
      inkDrawMode={false}
      inkEraseMode={false}
      inkEraserKind={inkEraserKind}
      onInkErase={recordEraseInkStrokes}
      inkColor={inkColor}
      inkWidth={inkWidth}
      inkPenType={inkPenType}
      onInkStroke={recordAddInkStroke}
      onInkStrokeDelete={deleteInkStroke}
    />
  );
}
