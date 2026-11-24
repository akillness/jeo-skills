"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { memo } from "react";
import type { Dispatch, SetStateAction, RefObject, JSX } from "react";
import {
  PdfOfficeRibbon,
  type PdfOfficeActionRail,
} from "../PdfOfficeRibbon";
import { PdfWindowHomeTabGroups } from "./PdfWindowHomeTabGroups";
import { PdfWindowInsertTabGroups } from "./PdfWindowInsertTabGroups";
import { type PdfTextEditingContextRibbonAction, type PdfTextEditingContextRibbonLabels, type PdfTextEditingControl } from "../PdfTextEditingContextRibbon";
import { PdfSurfaceRibbonGroup } from "../PdfSurfaceRibbon";
import type {
  useAutosavedPageDocument,
  PageSaveStatus,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import type {
  PdfNativeListTextSelectionEvidence,
} from "../../../../../lib/pdf/engine/native/list-text-fidelity";
import type {
  PdfNativeListTextEditLease,
} from "../../../../../lib/pdf/engine/native/list-text-command-lifecycle";
import type { PdfPendingPatchbackRepair } from "./insertPageAuthority";
import type { CropBoxEntry } from "../../../../../lib/pdf/crop-box";
import type { PdfInkPenCommands } from "./usePdfInkPens";
import type { PdfDrawRibbonModel, PdfInkTool } from "../PdfDrawRibbonTab";
import type { DocumentInkEraser } from "@mrnote/core/web/lib/document-ink.ts";
import type { PdfEditorRibbonTab } from "./editorRibbonTabs";
import type {
  PdfEditorObjectSelection,
} from "../PdfTextEditor";
import type {
  PdfTextCommentPointerTool,
} from "@/components/notebook/contents/pdf/PdfCommentRibbonTab";
import type {
  PdfTextBoxContextAction,
  PdfTextBoxSelection,
} from "../PdfTextBoxOverlay";
import type { PdfInkStroke } from "../PdfInkOverlay";
import type {
  PdfPictureFormatContextRibbonLabels,
} from "@/components/notebook/contents/pdf/PdfPictureFormatContextRibbon";
import type { ImageEditSummary } from "../../../../../lib/pdf/embedded-image-session";
import type { EmbeddedImageEditKind } from "@/lib/pdf/embedded-image-edits";
import type {
  PdfInsertRibbonCommand,
} from "../PdfInsertRibbonTab";
import type { useTranslations } from "@mrnote/core/host/next-intl.tsx";

export interface PdfPageWindowRibbonModel {
  t: ReturnType<typeof useTranslations<"console-notebooks">>;
  textEditingRibbonLabels: PdfTextEditingContextRibbonLabels;
  pictureFormatRibbonLabels: PdfPictureFormatContextRibbonLabels;
  workspaceWritable: boolean;
  hasWorkspaceWriteAuthority: () => boolean;
  nativeListTextPendingSelection: PdfNativeListTextSelectionEvidence | null;
  nativeListTextDialogLease: PdfNativeListTextEditLease | null;
  nativeListTextDraftSelection: PdfNativeListTextSelectionEvidence | null;
  setInsertPageDialogOpen: Dispatch<SetStateAction<boolean>>;
  insertPageOperationBusy: boolean;
  setInsertPageErrorMessage: Dispatch<SetStateAction<string | null>>;
  pendingPdfPatchbackRepairRef: RefObject<PdfPendingPatchbackRepair | null>;
  insertPageReturnFocusRef: RefObject<HTMLElement | null>;
  setNativeImageInsertRequestId: Dispatch<SetStateAction<number>>;
  nativeFileAttachmentBusy: boolean;
  nativeFileAttachmentBusyRef: RefObject<boolean>;
  nativePageImportBusy: boolean;
  nativePageImportBusyRef: RefObject<boolean>;
  cropBoxes: CropBoxEntry[];
  /** The Draw tab (PdfWindowDrawTabGroups): the armed tool, the eraser, the pens, the pad. */
  inkTool: PdfInkTool | null;
  setInkTool: (tool: PdfInkTool | null) => void;
  inkEraserKind: DocumentInkEraser;
  setInkEraserKind: Dispatch<SetStateAction<DocumentInkEraser>>;
  inkPenCommands: PdfInkPenCommands;
  inkTrackpad: PdfDrawRibbonModel["trackpad"];
  /** Pen-first drawing: the ribbon folds into the pen palette (null while the palette is not available). */
  penFirstHideRibbon: (() => void) | null;
  ribbonCollapse: { onCollapse: () => void } | undefined;
  penCompact: boolean;
  cropOpen: boolean;
  setCropOpen: Dispatch<SetStateAction<boolean>>;
  cropToggleRef: RefObject<HTMLButtonElement | null>;
  cropDialogReturnFocusTargetRef: RefObject<() => HTMLElement | null>;
  editorRibbonTab: PdfEditorRibbonTab;
  editorObjectSelectionRef: RefObject<PdfEditorObjectSelection | null>;
  textEditViewMode: "continuous" | "single" | "spread";
  setTextEditViewMode: Dispatch<SetStateAction<"continuous" | "single" | "spread">>;
  addTextMode: boolean;
  setAddTextMode: Dispatch<SetStateAction<boolean>>;
  textCommentContextActive: boolean;
  textCommentPointerTool: PdfTextCommentPointerTool;
  picturePointerTool: PdfTextCommentPointerTool;
  setPicturePointerTool: Dispatch<SetStateAction<PdfTextCommentPointerTool>>;
  textCommentFontFamily: string;
  setTextCommentFontFamily: Dispatch<SetStateAction<string>>;
  textCommentFontSizePoints: number;
  setTextCommentFontSizePoints: Dispatch<SetStateAction<number>>;
  textCommentFontColor: string;
  setTextCommentFontColor: Dispatch<SetStateAction<string>>;
  imageEditMode: boolean;
  setImageEditMode: Dispatch<SetStateAction<boolean>>;
  embeddedImageBusy: boolean;
  activateTextCommentContext: () => void;
  leaveTextEditModeToReader: (reason: string) => void;
  handleTextCommentPointerTool: (tool: PdfTextCommentPointerTool) => void;
  exitPictureEditing: () => void;
  handleEditorRibbonTabChange: (tab: PdfEditorRibbonTab) => void;
  invokeTextContextCommand: (action: PdfTextBoxContextAction) => void;
  handleOverlayTextRibbonAction: (action: PdfTextEditingContextRibbonAction) => void;
  invokeImageContextCommand: (action: "replace" | "delete" | "restore" | "opacity" | "rotate-left" | "rotate-right" | "flip-horizontal" | "flip-vertical" | "resize", opacity?: number | undefined, size?: Readonly<{ width: number; height: number; }> | undefined) => void;
  invokeImageCropContextCommand: () => void;
  embeddedImageStatus: string | null;
  pdfPageCount: number;
  currentPage: number;
  setCurrentPageWithIntent: (nextPage: number | ((current: number) => number)) => void;
  autosave: ReturnType<typeof useAutosavedPageDocument>;
  windowSaveStatus: PageSaveStatus;
  /** The face's word for it ("Synced" while the page's live room holds an unsent save). */
  windowSaveStatusLabel?: string;
  managedInkStrokes: PdfInkStroke[];
  runAfterPdfFormulaSourceFlush: (action: () => void | Promise<void>) => void;
  embeddedImagePending: ImageEditSummary;
  discardEmbeddedImageEdits: () => void;
  handleOpenBackgroundDialog: (trigger?: HTMLElement | null) => void;
  handleApplyEmbeddedImageEdits: () => Promise<void>;
  commitNativeEmbeddedImageArrange: (pageNumber: number, imageOrder: number, direction: "front" | "back" | "forward" | "backward") => Promise<boolean>;
  canUndoNativeReceipt: boolean;
  canRedoNativeReceipt: boolean;
  executeNativeUndo: () => Promise<boolean>;
  executeNativeRedo: () => Promise<boolean>;
  pdfInsertPageInventoryReady: boolean;
  undoLastInkStroke: () => void;
  workspaceWriteDeniedMessage: string;
  overlayTextSelection: ({ kind: "text"; } & PdfTextBoxSelection) | null;
  overlayTextCapabilities: Readonly<Record<PdfTextEditingControl, Readonly<{ enabled: boolean; reason?: string | undefined; }>>>;
  overlayTextRibbonModel: { wordSpacing: number | null; horizontalScale: number | null; keyboardInput: boolean; kind: "text" | "formula"; saveState: "saved" | "saving" | "ready" | "blocked"; lineSpacing: number; characterSpacing: number; firstLineIndent: number; leftIndent: number; rightIndent: number; target: "overlay-box"; fontSections: { id: string; options: { id: string; label: string; value: string; previewFamily: string; selected: boolean; }[]; }[]; activeFontLabel: string; activeFontFamily: string | undefined; fontSize: number; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; subscript: boolean; superscript: boolean; highlight: boolean; color: string; alignment: "justify" | "left" | "center" | "right" | "distributed" | null; } | { wordSpacing: number | null; horizontalScale: number | null; keyboardInput: boolean; kind: "text" | "formula"; saveState: "saved" | "saving" | "ready" | "blocked"; lineSpacing: null; characterSpacing: null; firstLineIndent: null; leftIndent: null; rightIndent: null; target: "overlay-box"; fontSections: { id: string; options: { id: string; label: string; value: string; previewFamily: string; selected: boolean; }[]; }[]; activeFontLabel: string; activeFontFamily: string | undefined; fontSize: number; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; subscript: boolean; superscript: boolean; highlight: boolean; color: string; alignment: "justify" | "left" | "center" | "right" | "distributed" | null; } | null;
  pendingNativeTextRibbonReason: string;
  pendingNativeTextCapabilities: Readonly<Record<PdfTextEditingControl, Readonly<{ enabled: boolean; reason?: string | undefined; }>>>;
  pendingNativeTextRibbonModel: { target: "native-list"; fontSections: never[]; activeFontLabel: string; fontSize: null; bold: false; italic: false; underline: false; strikethrough: false; subscript: false; superscript: false; highlight: false; alignment: null; lineSpacing: null; characterSpacing: null; firstLineIndent: null; wordSpacing: null; leftIndent: null; rightIndent: null; horizontalScale: null; keyboardInput: boolean; saveState: "blocked"; };
  handleExtractSelectedOriginalImage: () => Promise<void>;
  pictureFormatRibbonModel: { status?: string | undefined; page: number; order: number; width: number; height: number; rotated: boolean; opacity: number; editKind: EmbeddedImageEditKind | undefined; cropSupported: boolean | undefined; rotationSupported: boolean | undefined; rotationBlockedByPage: boolean | undefined; flipSupported: boolean | undefined; hasEdit: boolean; busy: boolean; writable: boolean; disabledReason: string; extractOriginalEnabled: boolean; extractOriginalDisabledReason: string; arrangeEnabled: boolean; arrangeDisabledReason: string; } | null;
  editorRibbonTabs: ({ id: "home" | "insert" | "draw" | "edit" | "page" | "annotate" | "tools"; label: string; ariaLabel?: string | undefined; controlId?: string | undefined; surface?: "home" | "insert" | undefined; } | { id: "text-format"; label: string; className: string; contextual: string; controlId: string; } | { id: "picture-format"; label: string; className: string; contextual: string; controlId: string; } | { id: "comment-tool"; label: string; className: string; contextual: string; controlId: string; })[];
  pageStructureRibbonActions: PdfInsertRibbonCommand[];
  workspacePrimaryActions: JSX.Element;
  workspaceOverflowOnlyActions: JSX.Element;
  workspaceActionRail: PdfOfficeActionRail;
  workspaceActionTail: JSX.Element;
}

// The tabs whose groups take only the values they show and stable commands
// skip the window's renders that change none of them (every page change while
// scrolling). The others take the autosave object, renewed every render.
const MemoPdfWindowHomeTabGroups = memo(PdfWindowHomeTabGroups);

export function PdfPageWindowRibbon({ ribbon }: { ribbon: PdfPageWindowRibbonModel }) {
  const { t, workspaceWritable, hasWorkspaceWriteAuthority, setInsertPageDialogOpen, insertPageOperationBusy, setInsertPageErrorMessage, pendingPdfPatchbackRepairRef, insertPageReturnFocusRef, setNativeImageInsertRequestId, nativeFileAttachmentBusy, nativeFileAttachmentBusyRef, nativePageImportBusy, nativePageImportBusyRef, ribbonCollapse, penCompact, editorRibbonTab, addTextMode, setAddTextMode, leaveTextEditModeToReader, handleEditorRibbonTabChange, autosave, windowSaveStatus, windowSaveStatusLabel, handleOpenBackgroundDialog, canUndoNativeReceipt, canRedoNativeReceipt, executeNativeUndo, executeNativeRedo, pdfInsertPageInventoryReady, editorRibbonTabs, workspacePrimaryActions, workspaceOverflowOnlyActions, workspaceActionRail, workspaceActionTail } = ribbon;
  return (
    <PdfOfficeRibbon
      collapse={ribbonCollapse}
      penCompact={penCompact}
      activeTab={editorRibbonTab}
      ariaLabel={t("pdf.editText")}
      className="pdf-page-window__text-ribbon"
      onActiveTabChange={handleEditorRibbonTabChange}
      actionRail={workspaceActionRail}
      quickOverflowLabel={t("toolbar.quickOverflow")}
      saveStatus={windowSaveStatus}
      saveStatusLabel={windowSaveStatusLabel ?? t(`pages.${windowSaveStatus}` as "pages.saving")}
      scrollLeftLabel={t("toolbar.ribbonScrollLeft")}
      scrollRightLabel={t("toolbar.ribbonScrollRight")}
      tabs={editorRibbonTabs}
      testId="pdf-editor-ribbon"
    >
      <MemoPdfWindowHomeTabGroups
        t={t}
        nativeFileAttachmentBusy={nativeFileAttachmentBusy}
        nativeFileAttachmentBusyRef={nativeFileAttachmentBusyRef}
        nativePageImportBusy={nativePageImportBusy}
        nativePageImportBusyRef={nativePageImportBusyRef}
        editorRibbonTab={editorRibbonTab}
        canUndoNativeReceipt={canUndoNativeReceipt}
        canRedoNativeReceipt={canRedoNativeReceipt}
        executeNativeUndo={executeNativeUndo}
        executeNativeRedo={executeNativeRedo}
      />
      {/* The workspace's own actions (generate a deck, back to reading,
          replace / download / export Markdown, the authority retry) in a
          Home group of their own, as in the reader. The action rail never
          draws them, and since the "more" menu was retired (b60b653bbf) this
          surface showed them nowhere: after adding a text box from Insert,
          only Insert Image led back to reading. */}
      {editorRibbonTab === "home" ? (
        <PdfSurfaceRibbonGroup
          label={t("pdf.viewer.document")}
          tab="home"
          testId="pdf-editor-home-workspace-actions"
        >
          {workspacePrimaryActions}
          {workspaceOverflowOnlyActions}
          {workspaceActionTail}
        </PdfSurfaceRibbonGroup>
      ) : null}

      <PdfWindowInsertTabGroups
        t={t}
        workspaceWritable={workspaceWritable}
        hasWorkspaceWriteAuthority={hasWorkspaceWriteAuthority}
        setInsertPageDialogOpen={setInsertPageDialogOpen}
        insertPageOperationBusy={insertPageOperationBusy}
        setInsertPageErrorMessage={setInsertPageErrorMessage}
        pendingPdfPatchbackRepairRef={pendingPdfPatchbackRepairRef}
        insertPageReturnFocusRef={insertPageReturnFocusRef}
        setNativeImageInsertRequestId={setNativeImageInsertRequestId}
        editorRibbonTab={editorRibbonTab}
        addTextMode={addTextMode}
        setAddTextMode={setAddTextMode}
        leaveTextEditModeToReader={leaveTextEditModeToReader}
        autosave={autosave}
        handleOpenBackgroundDialog={handleOpenBackgroundDialog}
        pdfInsertPageInventoryReady={pdfInsertPageInventoryReady}
      />

      {null}

      {null}

      {null}

      {null}

      {null}

      {null}

      {null}

      {null}
    </PdfOfficeRibbon>
  );
}
