"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { docsSaveStallFace, useSaveSurfaceStallReport } from "@mrnote/core/web/lib/save-stall-report.ts";
import { onlyofficeInitialZoom, onlyofficeMakesActionLinks, onlyofficeOpensReflowed, requestOnlyofficeActionLink } from "@mrnote/core/web/lib/embed/onlyoffice-frame.ts";
import { ONLYOFFICE_SPELLCHECK_EVENT, onlyofficeSpellcheckAtOpen } from "@mrnote/core/web/lib/embed/onlyoffice-layout.ts";
import { reloadPage as reloadWebPage } from "@mrnote/core/web/lib/reload-reason.ts";
import { registerEditorDraftHandover } from "@mrnote/core/web/lib/editor-draft-handover.ts";
import { refuseStrayNativeDragExcept } from "@mrnote/core/web/lib/native-drag-guard.ts";
import { DocumentPeerInkLayer } from "./native-document/DocumentPeerInkLayer";
import { documentLiveSurface, useDocumentLiveTransforms } from "@mrnote/core/web/components/console/editor/native-document/documentLiveTransform.ts";
import { publishDocumentFieldIdentity } from "./native-document/documentFieldExtension";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { officeAutosaveEnabled, officeAutosaveLabels } from "@mrnote/core/web/lib/office-autosave-preference.ts";
import { DocumentDisplayFontRepair } from "./native-document/DocumentDisplayFontRepair";
import { editorViewDom } from "@mrnote/core/web/components/console/editor/native-document/editorViewDom.ts";
import { PAGE_LEDGER_BACKGROUND_ATTR, PAGE_LEDGER_DEFERRED_ATTR } from "@mrnote/core/web/components/console/editor/native-document/documentLayoutStatus.ts";
import { useDocumentDisplayFonts, useHandedDocumentDisplayFonts } from "./native-document/useDocumentDisplayFonts";
import { notifyDocumentDisplayFontBindings } from "@mrnote/core/web/components/console/editor/native-document/documentDisplayFonts.ts";
import {
  documentFontRecordAdoptionTransaction,
  readAdoptedDocumentFontRecords,
} from "./native-document/documentFontRecordAdoption";
import {
  fontAssetStatus,
  registerLeasedFontAsset,
  retainOfficeFontAssets,
} from "@mrnote/core/web/components/office-ribbon/officeFontAssets.ts";
import { WORD_LINE_METRICS_TARGET } from "@mrnote/core/web/components/console/editor/native-document/documentWordLineMetrics.ts";
import { materializeLegacySmartArtScenes } from "./extensions/smartArtLegacyScene";
import { commitOpenVisualMathEditors } from "@mrnote/core/web/components/console/editor/extensions/visualMathEditor.ts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { useCaptionLabelLocale } from "./native-document/useCaptionLabelLocale";
import {
  DocumentDockedPane,
  DocumentCommentsCard,
  DocumentTaskPaneDockHost,
  DocumentTaskPaneDocksContext,
  useDocumentTaskPaneCover,
  useDocumentTaskPaneDocks,
} from "@mrnote/core/web/components/console/editor/documentTaskPaneDock.tsx";
import { Type, Upload } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { readCookie } from "@mrnote/core/web/lib/cookie.ts";
import { useEditor,} from "@tiptap/react";

import { retainOfficeInactiveSelection } from "@mrnote/core/web/lib/office-inactive-selection.ts";
import type { Editor, JSONContent } from "@tiptap/core";
import {
  DOMParser as ProseMirrorDOMParser,
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
import { recordPageSaveDiagnostic } from "@mrnote/core/web/lib/page-save-diagnostics.ts";
import { createInkWritingSaveGate, inkLayoutUnsettled, inkLayoutSettlesInMs, inkWritingActive, type InkWritingSaveGate } from "@mrnote/core/web/lib/ink-writing-session.ts";
import { createTypingSaveGate } from "@mrnote/core/web/lib/typing-session.ts";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  useAutosavedPageDocument,
  type PageDocumentDraft,
  type PageSaveStatus,
  type AutosavedPageLoadSource,
  type PageCausalUpgradeHolder,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import { useDraftCommitOnLeave } from "@mrnote/core/web/lib/draft-commit-on-leave.ts";
import { commitOpenEquationDrafts } from "./extensions/equationDraftCommit";
import { AUTH_SESSION_HELD_EVENT, AUTH_SESSION_RESTORED_EVENT, apiDelete, apiGet, apiPost, isApiRequestError, isAuthSessionHeld, registerUnsavedWorkHold, type ApiRequestError } from "@mrnote/core/web/lib/api.ts";
import { openReauthWindow, reauthLoginUrl, watchSessionRestore } from "@mrnote/core/web/lib/session-reauth.ts";
import { uploadPageAttachment } from "@mrnote/core/web/lib/page-attachment-upload.ts";
import { SINGLE_REQUEST_UPLOAD_MAX_BYTES } from "@mrnote/core/web/lib/study-upload.ts";
import {
  pageDocumentJsonEquals,
  UNPROVEN_EMPTY_SOURCE_SHA256,
  type PageSaveAcknowledgementDraft,
} from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import { settledDocumentContentVersion } from "@mrnote/core/web/lib/document-settled-save.ts";
import { documentCausalSemanticContent, markDocumentSaveBody } from "@mrnote/core/web/lib/collab/document-page-causal-model.ts";
import { useRegisterWindowSaveStatus } from "@mrnote/core/web/components/notebook/WindowCloseGuard.tsx";
import { normalizeSpacing } from "@mrnote/core/web/components/console/editor/extensions/DocumentFormatting.ts";
import {
  normalizeHydratedDocumentPageAttrs,
} from "@mrnote/core/web/components/console/editor/extensions/DocumentPageSetup.ts";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { INK_TAKEN_BY_ROOM_EVENT } from "./native-document/inkLossWatch";
import { registerInkErasureAwareness } from "@mrnote/core/web/lib/collab/ink-erasure-journal.ts";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";
import { useSaveElapsed } from "@mrnote/core/web/hooks/useSaveElapsed.ts";
import { parse as parseMarkdown } from "@mrnote/core/web/lib/markdown/index.ts";
import {
  canCompileFileAsEditableDocument,
  isComplexImportTooLarge,
} from "@mrnote/core/web/lib/document-import/editableDocumentFile.ts";
import { isOfficeImportConnectionRequired } from "../../../lib/document-import/officeImportProjectionClient";
import type {
  DocxRootImportPlan,
  DocxRootImportSource,
} from "../../../lib/document-import/docxRootImportPlanner";
import {
  createPageImportBatchId,
  submitPageImportBatch,
  type PageImportBatchFileItem,
} from "../../../lib/document-import/pageImportBatch";
import {
  isLossyImportRejection,
  LosslessImportRequiredError,
} from "../../../lib/document-import/import-errors";
import {
  PlainTextDocumentImportError,
  plainTextToDocumentNodes,
} from "../../../lib/document-import/plainTextDocument";
import { PageImportProjectionBudgetError as SharedPageImportProjectionBudgetError } from "../../../lib/document-import/pageImportProjectionBudget";
import {
  dispatchNotebookPagesChanged,
  dispatchNotebookStorageChanged,
  dispatchNotebooksChanged,
  NOTEBOOK_PAGE_RENAMED_EVENT,
  pageRenameFromEvent,
  PAGE_REMOTE_SAVED_EVENT,
} from "@mrnote/core/web/lib/notebook-events.ts";
import { notebookSDK, settledEditorPageRead, type PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  GUEST_INLINE_PAGE_IMPORT_ACCEPT,
  GUIDED_PAGE_IMPORT_ACCEPT,
  isHtmlPageImportFile,
  isMarkdownPageImportFile,
  isTextPageImportFile,
  TEXT_PAGE_IMPORT_MAX_BYTES,
} from "@mrnote/core/web/lib/page-import-capabilities.ts";
import { useWindowManagerActions } from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import BacklinksPanel from "@mrnote/core/web/components/console/editor/BacklinksPanel.tsx";
import CommentsPanel from "@mrnote/core/web/components/console/editor/CommentsPanel.tsx";
import DocumentOutlinePanel from "./DocumentOutlinePanel";
import {
  OPEN_AI_REVIEW_EVENT,
  takePendingAiReviewOpen,
  type OpenAiReviewDetail,
} from "@mrnote/core/web/__cut__/mdc1651b936.ts";
import StylesPanel, { type StylesPanelCreateRequest } from "@mrnote/core/web/components/console/editor/StylesPanel.tsx";
import CitationPicker from "@mrnote/core/web/components/console/editor/CitationPicker.tsx";
import CrossReferencePicker, {
  type CrossReferenceNoteTarget,
} from "@mrnote/core/web/components/console/editor/CrossReferencePicker.tsx";
import {
  DocumentBookmarkDialog,
  type DocumentBookmarkDialogEntry,
} from "./native-document/DocumentBookmarkDialog";
import { useCloseOnEscape } from "@mrnote/core/web/components/console/editor/useCloseOnEscape.ts";
import {
  ADD_COMMENT_EVENT,
  FOCUS_COMMENT_EVENT,
} from "@mrnote/core/web/components/console/editor/native-document/commentExtension.ts";
import {
  parseCommentDeepLink,
  sanitizeThreadId,
} from "@mrnote/core/web/components/console/editor/native-document/comments.ts";
import {
  TRACKED_OBJECT_DELETION_KEPT_META,
  hasTrackedChanges,
  readMarkupFilter,
  setRevisionAuthorName,
} from "@mrnote/core/web/components/console/editor/native-document/trackChangesExtension.ts";
import {
  markupFilterLaysOutDeletions,
  type PrintRevisionMarkup,
} from "./native-document/paged/printRevisionMarkup";
import { useSelfCollabIdentity } from "@mrnote/core/web/lib/collab/self-identity.ts";
import {
  bookmarkRangesFor,
  GO_TO_BOOKMARK_EVENT,
  INSERT_BOOKMARK_EVENT,
  getBookmarks,
  getHiddenReferenceBookmarks,
} from "@mrnote/core/web/components/console/editor/native-document/bookmarkExtension.ts";
import {
  collectFootnoteRefOrder,
  focusInsertedNoteBody,
  getFootnoteMode,
  getNoteSettings,
  INSERT_ENDNOTE_EVENT,
  INSERT_FOOTNOTE_EVENT,
  readFootnotes,
} from "@mrnote/core/web/components/console/editor/native-document/footnoteExtension.tsx";
import { numberNoteStreams,} from "@mrnote/core/web/components/console/editor/native-document/footnotes.ts";
import {
  LOCATE_EVIDENCE_EVENT,
  consumePendingEvidenceLocate,
  type EvidenceLocateRequest,
} from "@mrnote/core/web/lib/evidence-locator.ts";
import type { EvidenceQuoteLocateInput } from "./native-document/evidenceLocatorExtension";
import {
  isEditorEditable,
  documentProtectionAllowsSaves,
  effectiveDocumentProtection,
  isDocumentFormsProtected,
  isDocumentPasswordLocked,
  isDocumentCommentOnlyProtected,
} from "@mrnote/core/web/components/console/editor/native-document/documentProtection.ts";
import { useEmbedAccess } from "@mrnote/core/web/lib/embed/use-embed-access.ts";
import { setCommentOnlyLane } from "@mrnote/core/web/components/console/editor/native-document/commentOnlyLane.ts";
import { editableRangesPresent } from "./native-document/rangePermissionExtension";
import {
  INSERT_CITATION_EVENT,
  OPEN_CITATION_SOURCE_MANAGER_EVENT,
  collectCitationOrder,
  getCitationStyle,
  getSources,
  readSourceStore,
  type OpenCitationPickerDetail,
} from "@mrnote/core/web/components/console/editor/native-document/citationExtension.tsx";
import {
  INSERT_CROSS_REFERENCE_EVENT,
  collectNumberedItems,
  ensureNumberedItemBookmark,
  type NumberedItemTarget,
  type OpenCrossReferencePickerDetail,
} from "@mrnote/core/web/components/console/editor/native-document/crossReferenceExtension.tsx";
import { insertCrossReference } from "@mrnote/core/web/components/console/editor/native-document/referencesButtons.ts";
import {
  INSERT_MERGE_FIELD_EVENT,
  OPEN_MAIL_MERGE_RECIPIENTS_EVENT,
  getMailMergeData,
  type MailMergeDialogAction,
  type OpenMailMergeDialogDetail,
  type OpenMergeFieldPickerDetail,
} from "./native-document/mergeFieldExtension";
import { resolveMailMergeSettings, withMailMergeSettings, type MailMergeData, type MailMergeRecord, type MergeConditionOp } from "@mrnote/core/web/lib/document/mailMerge.ts";
import type { TipTapNode } from "@/lib/document-export/tiptap-json";
import {
  collectHeadings,
  sanitizeTocAnchorId,
  type TocHeading,
} from "@mrnote/core/web/components/console/editor/native-document/tableOfContents.ts";
import { insertPlainTextParagraphs } from "./native-document/plainTextInsert";
import {
  parsePlainTextTableRows,
  pasteTableCellsIntoTable,
  pasteTextMatrixIntoTable,
  richTablePasteExceedsBudget,
} from "./native-document/tableTextMatrixPaste";
import { type DocCaption } from "@mrnote/core/web/components/console/editor/native-document/captions.ts";
import { collectAllCaptions } from "@mrnote/core/web/components/console/editor/native-document/fieldCaptions.ts";
import {
  sourceStoreIsEditable,
  type CitationStyle,
  type CslSource,
} from "@mrnote/core/web/components/console/editor/native-document/citations.ts";
import { createNativeDocumentCommandBus } from "./native-document/commandBus";
import { DocumentWorkbookPersistenceContext } from "./extensions/DocumentWorkbookPersistence";
import { selectionNearInlineContent } from "@mrnote/core/web/components/console/editor/native-document/safeTextSelection.ts";
import { documentCaretPlaceFrom, documentCaretPosition, documentCaretTopBlock, documentHandoverPlace, type DocumentCaretPlace } from "./native-document/documentCaretPlace";
import { heldKeysFrom, heldKeysGiven, holdKeysThroughHandover, keyHeldForDocument, typeHeldKeys, viewTakesInputNow, type HandoverKeys, type HeldKeysTarget } from "@mrnote/core/web/lib/editor/held-keys.ts";
import { hasPageReveal, subscribePageReveal, takePageReveal } from "@mrnote/core/web/lib/page-reveal.ts";
import { trackInsertionRange, type LiveInsertionRange } from "./native-document/liveInsertionRange";
import { dismissDocumentObjectFromSurface } from "@mrnote/core/web/components/console/editor/native-document/documentBoundaryInteraction.ts";
import {
  ensureNativeDocumentBlockIds,
  MRNOTE_BLOCK_ID_ATTR,
  MRNOTE_SOURCE_ATTR,
} from "@mrnote/core/web/components/console/editor/native-document/blockIds.ts";
import {
  APPLY_DOCUMENT_EDIT_COMMAND_EVENT,
  DOCUMENT_EDIT_APPLIED_EVENT,
  DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT,
  DOCUMENT_EDIT_UNDO_REQUEST_EVENT,
  DOCUMENT_LOCATE_REQUEST_EVENT,
  createDocumentEditReceipt,
  documentEditCommandMatchesTarget,
  notifyDocumentEditApplied,
  notifyDocumentEditUndoResult,
  rememberCappedSnapshot,
  type ApplyDocumentEditCommandDetail,
  type DocumentEditAppliedDetail,
  type DocumentEditContext,
  type DocumentEditUndoRequestDetail,
  type DocumentLocateRequestDetail,
} from "./native-document/documentEditEvents";
import { locateAndFlashInEditor } from "./native-document/documentLocate";
import {
  documentJsonSliceForAiContext,
  documentSemanticNodeForAiContext,
  documentTextForAiContext,
} from "@mrnote/core/web/__m__/mc38c6fb1a2.ts";
import {
  unverifiedLocalDocumentEdit,
  verifyDocumentEditPersistence,
} from "./native-document/documentEditVerification";
import {
  executeDocumentCommandWithResult,
  isNativeDocumentCommand,
  validateNativeDocumentCommandForApply,
  type NativeDocumentCommandRejectionReason,
} from "@mrnote/core/web/components/console/editor/native-document/documentCommands.ts";
import { createNativeDocumentPluginRegistry } from "./native-document/pluginRegistry";
import {
  createDocumentLifecycleObservationEmitter,
  reportDocumentLifecycleDiagnostic,
  documentLifecycleFirstDifference,
  withoutMeasuredLayoutGeometry,
  documentLifecycleDisplayFontsDecided,
  documentLifecycleLayoutPasses,
  documentLifecycleLayoutSettled,
  DOCUMENT_DISPLAY_FONTS_STATUS_ATTRIBUTE,
  documentLifecycleIdentity,
  DOCUMENT_LIFECYCLE_LAYOUT_ATTRIBUTES,
  type DocumentLifecycleObserver,
} from "./native-document/documentLifecycleObservation";
import { captureSavedPageHotCacheScope, isSavedPageHotCacheScopeCurrent } from "@mrnote/core/web/lib/saved-page-hot-cache.ts";

import {
  USE_COLLAB_EDITING,
  USE_LEGACY_ROOM_LOGICAL_BINDING,
} from "@mrnote/core/web/lib/code-runner/editor-flags.ts";
import {
  LEGACY_ROOM_LOGICAL_MODEL,
  LEGACY_ROOM_MODEL_FIELD,
  type PagedDocumentBridgeIssue,
} from "@mrnote/core/web/lib/collab/paged-document-bridge.ts";
import { canonicalDocumentSchema, firstUnreadableNodePath } from "@mrnote/core/web/lib/collab/paged-document-projection.ts";
import { DocumentPartPresence } from "@mrnote/core/web/lib/collab/document-part-presence.ts";
import { pageHeldByPartRoom } from "@mrnote/core/web/lib/collab/part-room-hold.ts";
import { reportClientError } from "@mrnote/core/web/lib/errors/report-beacon.ts";
import {
  capturePhysicalPageViewportAnchor,
  clampZoom,
  EDITOR_ZOOM_BOUNDS,
  EDITOR_ZOOM_DEFAULT,
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  EDITOR_ZOOM_STEP,
  fitMultiplePagesZoom,
  fitOnePageZoom,
  fitPageWidthZoom,
  MULTIPLE_PAGES_FIT_ZOOM_BOUNDS,
  resolvePhysicalPageViewportAnchor,
  type PhysicalPageViewportAnchor,
  zoomPercent,
} from "@mrnote/core/web/lib/editor-zoom.ts";
import { deviceHasTouch } from "@mrnote/core/web/lib/draw-with-touch.ts";
import { useLiveZoomGesture } from "@mrnote/core/web/lib/live-zoom.ts";
import {
  createCollabSession,
  type CollabSession,
} from "@mrnote/core/web/lib/collab/collab-provider.ts";
import {
  useLastVerifiedPageCollabBinding,
  usePageWritable,
  type PageWritable as PageWritableVerdict,
} from "@mrnote/core/web/lib/collab/page-writable.ts";
import {
  getAgentDraftPageState,
  useAgentDraftOpening,
  useAgentDraftPageReadSync,
  useAgentDraftRevealing,
} from "@mrnote/core/web/__cut__/mb159dd42d4.ts";
import { consumeAgentWriteExpectation, isAgentWriteExpected } from "@mrnote/core/web/__cut__/md1c55ca47c.ts";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { isFollowingAgentDraft } from "@mrnote/core/web/__cut__/ma4cba81be7.ts";
import {
  useDocsExportFidelity,
  useDocxPublishedReadback,
} from "@mrnote/core/web/lib/docx-published-readback.ts";
import {
  docsNoticeSentence,
  docsPublicationState,
  docsRepairPrompt,
} from "@mrnote/core/web/lib/docs-publication-notices.ts";
import { requestReviewOnlyChatPrefill } from "@mrnote/core/web/__cut__/m809fa6700a.ts";
import { COLLAB_INITIAL_SYNC_BUDGET_MS } from "@mrnote/core/web/lib/collab/ws-provider.ts";
import { observeReadonlyDocumentProjection } from "@mrnote/core/web/lib/collab/readonly-document-projection.ts";
import {
  autoRecoverPrincipal,
  clearCurrentAutoRecover,
  deleteAutoRecoverCopy,
  flushAutoRecoverWrites,
  setAsideAutoRecoverCopy,
  recentlyClosedTabs,
  autoRecoverTabId,
  listAutoRecoverCopies,
  forgetAutoRecoverHandoverKeys,
  holdAutoRecoverHandoverKeys,
  listAutoRecoverHandoverKeys,
  leaveAutoRecoverHandoverKeys,
  noteAutoRecoverHandoverKeys,
  markAutoRecoverClosingHeld,
  noteAutoRecoverClosingEditor,
  noteAutoRecoverChange,
  autoRecoverCopyCost,
  AUTORECOVER_COSTLY_COPY_MS,
  type AutoRecoverCopy,
} from "@mrnote/core/web/lib/autorecover-store.ts";
import { closingBlockChanges, closingEditsBody, newClosingEditsId, noteClosingEditsSent, takeLandedClosingEdits } from "@mrnote/core/web/lib/page-closing-edits.ts";
import { sendPageClosingEdits, type PageClosingEditsRequest } from "@mrnote/core/web/lib/page-collab-sdk.ts";
import type { PageContentDocument } from "@mrnote/core/web/hooks/usePageContentSync.ts";
import { mergeCanonicalBlocks, sameAuthoredBlock, sameAuthoredBody } from "@mrnote/core/web/lib/collab/canonical-block-merge.ts";
import { documentRoomEstablished, takeDocumentRecoveryConflicts } from "@mrnote/core/web/lib/collab/collab-extensions.ts";
import { adoptRecoveredDocumentContent, buildCollabExtensions, canonicalDocumentExplicitSaveRefusal, prepareCanonicalDocumentExplicitSave, publishCanonicalDocumentAttrs, isCanonicalDocumentHistoryTransaction, hasCanonicalDocumentAuthoringTransaction, isLegacyRoomProjectionUpdate } from "@mrnote/core/web/lib/collab/collab-extensions.ts";
import { useDocumentCausalModel } from "./native-document/useDocumentCausalModel";
import { registerLiveEditor } from "@mrnote/core/web/lib/live-editor-registry.ts";
import { useEditorContinuity } from "./native-document/useEditorContinuity";
import { mapAwarenessStates } from "@mrnote/core/web/lib/collab/collab-state.ts";
import UserAvatar from "@mrnote/core/web/components/console/UserAvatar.tsx";
import { holdHandwritingInkOnly } from "./native-document/handwritingDocument";
import {
  listNotebookMembers,
  type NotebookMemberRecord,
} from "@mrnote/core/web/lib/collaboration-sdk.ts";
import {
  documentWritingModeCss,
  isVerticalWritingMode,
} from "@mrnote/core/web/components/console/editor/native-document/documentLayout.ts";
import {
  normalizeSectionLayouts,
  resolveSectionAtSelection,
} from "@mrnote/core/web/components/console/editor/native-document/sectionLayouts.ts";
import {
  normalizeOddEvenConfig,
} from "@mrnote/core/web/components/console/editor/native-document/headerFooter.ts";
import SheetBandEditLayer, {
  shouldUseGuestBandEditingCollaboration,
} from "./native-document/paged/SheetBandEditLayer";
import {
  bindCollaborativeDocumentAttrs,
  COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META,
  COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META,
  normalizeCollaborativeDocumentSectionMutation,
  type CollaborativeDocumentAttrsPatch,
  type CollaborativeDocumentSectionMutation,
} from "@mrnote/core/web/components/console/editor/native-document/collaborationDocumentAttrs.ts";
import { SECTION_CHAIN_HISTORY_REPAIR_META } from "./native-document/sectionChainHistoryRepair";
import {
  type WatermarkConfig,
} from "@mrnote/core/web/components/console/editor/native-document/watermark.ts";
import PagePreview from "./native-document/PagePreview";
import { documentHasWhiteboardScene, serializeWhiteboardScenes } from "@mrnote/core/web/components/console/editor/extensions/whiteboardScene.ts";
import {
  withLegacyChartsOnV2,
  withoutInactiveChartUnionAttrs,
} from "@mrnote/core/web/components/console/editor/native-document/chartUnionAttrs.ts";
import {
  docUsesBestEffortSheetLayout,
  flattenPageBlocks,
  wrapBlocksIntoPages,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageBlockExtension.ts";
import {
  INITIAL_PAGINATION_SETTLING_ATTR,
  REBALANCE_META,
} from "@mrnote/core/web/components/console/editor/native-document/paged/pageRebalanceExtension.ts";
import { HEADING_ANCHOR_IDLE_BACKFILL_META } from "./native-document/headingAnchors";
import {
  documentRootDefaults,
  sameDocumentAuthorContent,
} from "@mrnote/core/web/__cut__/m318e23f593.ts";
import {
  authorizeDocumentShellImportMutation,
  createDocumentShellImportAuthorityToken,
  isUserAuthoredDocumentMutation,
  registerDocumentShellImportAuthority,
  READ_ONLY_TRUSTED_MUTATION_META,
  trustReadOnlyDocumentMutation,
  type DocumentShellImportAuthorityToken,
} from "@mrnote/core/web/components/console/editor/native-document/readOnlyTransactionAuthority.ts";
import {
  canonicalDocumentTransportWritable,
  canonicalSurfaceMayWrite,
  nextCanonicalWriteHold,
  type CanonicalWriteHold,
  documentAsyncEditorWriteMayContinue,
  documentImportMayContinue,
  documentShellEventMayStart,
  documentShellWriteAllowed,
  retireDocumentImportOnWriteRevoked,
} from "./native-document/documentShellWriteAuthority";
import {
  createImeDeferredCommitQueue,
  hasImeCompositionTransaction,
  isImeCompositionActive,
  onImeCompositionSettled,
} from "@mrnote/core/web/components/console/editor/native-document/imeCompositionGuard.ts";
import {
  flattenPagedDocumentForStorage,
  mergePagedRuntimeContinuationsJson,
} from "@mrnote/core/web/components/console/editor/native-document/paged/serialization.ts";
import { captureSavedPaginationProjectionInSteps, runtimeDocumentJson } from "@mrnote/core/web/__cut__/m2c7d818b46.ts";
import { changedBlockPieces, lastMergeRefusal, mergedPartTransaction, partSheetsOfView, serializeViewParts, viewBlockIdsOf, type PartSerializations } from "./native-document/documentPartMerge";
import { splitPieceRoot } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionKeys.ts";
import { cachedDocsLayoutReceipt, cachedDocsLayoutSizes } from "@mrnote/core/web/lib/docs-layout-receipt-cache.ts";
import { layoutSnapshotsAwaited, preloadLayoutSnapshots } from "@mrnote/core/web/lib/docs-layout-snapshot-store.ts";
import { documentIsLongForLayoutSnapshot, forgetOpenedParts, layoutSnapshotsEnabled, noteRestoredPart, rowFontsHold, seedPartMeasures, snapshotReceiptFor, type KeptPartLayout } from "@mrnote/core/web/components/console/editor/native-document/paged/layoutSnapshot.ts";
import { hydrationWasRestored, markRestoredLayout, markRestoredSnapshot, notePartArrived, noteRestoredSheets } from "@mrnote/core/web/components/console/editor/native-document/paged/restoredLayoutMark.ts";
import { dispatchKeepingReader } from "./native-document/paged/readerAnchor";
import { restorePaginationProjection } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionReceipt.ts";
import type { ClassicPendingEdits } from "@mrnote/core/web/lib/classic-start/pending.ts";
import { yieldBetweenSaveSteps } from "@mrnote/core/web/lib/collab/save-yield.ts";
import { inkTraceWork } from "@mrnote/core/web/lib/ink-input-trace.ts";
import { jsonUtf8Size } from "@mrnote/core/web/lib/json-utf8-size.ts";
import { inkPointerArbiter } from "@mrnote/core/web/lib/ink-pointer-policy.ts";
import { withProjectionJsonMemo } from "@mrnote/core/web/components/console/editor/native-document/paged/paginationProjectionReceipt.ts";
import { printStructuralSheets,} from "./native-document/paged/structuralPrint";
import { holdWholePages, pageHollowSheetsKey, viewMayDrawHollow } from "@mrnote/core/web/components/console/editor/native-document/paged/pageHollowSheets.ts";
import { registerNativeDocumentPrint } from "./native-document/paged/nativeDocumentPrint";
import {
  isPlainPasteShortcut,
  normalizePastedPlainText,
  plainTextFromClipboard,
} from "./native-document/plainTextPaste";
import {
  DEFAULT_PASTE_MODE,
  mergeDestinationMarks,
  resolvePasteAction,
  type PasteFormatMode,
} from "./native-document/pasteFormatMode";
import { toolbarPasteSpecialFormatForEvent } from "./native-document/toolbarClipboard";
import DocumentToolbar, { type DocumentBaseRibbonTabId } from "./DocumentToolbar";
import DocumentSplitView from "./DocumentSplitView";
import {
  OfficeRailButton,
  type OfficeRailSave,
} from "@mrnote/core/web/components/office-ribbon/OfficeEditorActionRail.tsx";
import { OfficeTaskPaneChromeProvider } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeScreenTipProvider } from "@mrnote/core/web/components/office-ribbon/OfficeScreenTipProvider.tsx";
import {
  OfficeFileDropOverlay,
  officeFileDropClassNames,
} from "@mrnote/core/web/components/office-ribbon/OfficeFileDropOverlay.tsx";
import {
  useOfficeFileDrop,
  type OfficeFileDropAccepts,
} from "@mrnote/core/web/components/office-ribbon/useOfficeFileDrop.ts";
import { OfficeDialogChromeProvider } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import FloatingToolbar from "@mrnote/core/web/components/console/editor/FloatingToolbar.tsx";
import { createPreparedBubbleMenu } from "@mrnote/core/web/components/console/editor/preparedBubbleMenu.ts";
import { OfficeSoftKeyboardLayer } from "@mrnote/core/web/components/office-ribbon/OfficeSoftKeyboardLayer.tsx";
import { DocumentTouchMultiSelectBar } from "./native-document/DocumentTouchMultiSelectBar";
import { DocumentTableTouchGrips } from "./native-document/DocumentTableTouchGrips";
import CopilotSelectionOverlay, {
  DOCS_COPILOT_RESUME_HOSTS,
} from "@mrnote/core/web/__cut__/m7063a7465b.tsx";
import { usePendingCopilotResume } from "@mrnote/core/web/__cut__/m2da8b6d223.ts";
import { CopilotPartsPanel } from "@mrnote/core/web/__cut__/m795d7b4de9.tsx";
import { PageIdProvider } from "@mrnote/core/web/components/console/editor/PageIdContext.tsx";
import { registerDocumentPictureReferences } from "@mrnote/core/web/lib/document-picture-references.ts";
import { OfficePartsOversizedImportNotice } from "@mrnote/core/web/components/notebook/contents/office/OfficePartsOversizedImportNotice.tsx";
import { OversizedImportNotice } from "@mrnote/core/web/components/notebook/contents/office/OversizedImportNotice.tsx";
import { readOversizedImportPreview } from "@mrnote/core/web/lib/office/oversized-import.ts";
import {
  documentBodyCutNeedsSaying,
  documentDraftReach,
  documentPartsArrivingAttrs,
  documentPartsCount,
  knownDocumentPartsPage,
  rememberDocumentPartsPage,
  storedFormOfBlocks,
  useDocumentPageParts,
  withPartsLoadedSince,
  draftChangesOutsideView,
  draftBaseInEditorForm,
  draftBlocksChangedFrom,
  type DocumentPartRoomsView,
} from "@mrnote/core/web/lib/document-page-parts.ts";
import { DocumentPartsNotice } from "@mrnote/core/web/components/notebook/contents/office/DocumentPartsNotice.tsx";
import {
  readDocumentSideBySideLayout,
  startDocumentSideBySide,
} from "@mrnote/core/web/components/console/editor/documentSideBySide.ts";
import {
  arrangeAllDocumentWindows,
  documentWindowChoices,
  openNewDocumentWindow,
  switchToDocumentWindow,
} from "@mrnote/core/web/components/console/editor/documentWindowCommands.ts";
import {
  registerDocumentSynchronizedScrollPort,
  toggleDocumentSynchronizedScrolling,
  useDocumentSynchronizedScrollState,
} from "@mrnote/core/web/components/console/editor/documentSynchronizedScrolling.ts";
import PageSaveConflictBanner from "@mrnote/core/web/components/notebook/PageSaveConflictBanner.tsx";
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import windowNoticeStyles from "@mrnote/core/web/components/notebook/DocumentIssueNotice.module.css";

import "katex/dist/katex.min.css";
import "@mrnote/core/web/styles/note-editor.css";
import {
  captureAiEditMotion,
  captureLiveDraftScroll,
  liveDraftBlockSignatures,
  playAiEditMotion,
  playLiveDraftUpdate,
  useRibbonRevealKeepsBodyStill,
} from "@mrnote/core/web/components/console/editor/liveDraftMotion.ts";
import { LiveDraftFollowPill, LiveDraftManuscript } from "@mrnote/core/web/components/console/editor/LiveDraftManuscript.tsx";
import { loadOfficeData } from "@mrnote/core/web/lib/office-data/store.ts";
import { useOfficeDataSettled } from "@mrnote/core/web/lib/office-data/use-office-data.ts";
import {
  useDocumentSurfaceAttrState,
  useDocumentSurfaceAttrSync,
} from "./native-document/paged/documentSurfaceAttrs";
import {
  editorDom,
  executeEditorCommand,
  getEditorCommands,
  isUsableEditor,
  type MaybeNoteEditor,
} from "./native-document/paged/editorRuntime";
import {
  manuscriptGridNeedsDetachedPreview,
  MULTIPLE_PAGE_SPREAD_GAP_PX,
} from "./native-document/paged/surfaceShared";
// Read from here by older callers (and the NoteEditor suites).
export { documentRenderGridPitchPx, manuscriptGridNeedsDetachedPreview } from "./native-document/paged/surfaceShared";
import { useDocumentPagedSurface } from "./native-document/paged/useDocumentPagedSurface";
import { DocumentPagedSurface } from "./native-document/paged/DocumentPagedSurface";
import { useDocumentSurfaceReadiness, type DocumentSurfaceReadiness } from "./native-document/paged/useDocumentSurfaceReadiness";
export type { DocumentSurfaceReadiness } from "./native-document/paged/useDocumentSurfaceReadiness";
import {
  STRUCTURAL_PRINT_SOURCE_TIMEOUT_MS,
  useDocumentStructuralPrintOptions,
  useExposedStructuralPrint,
  usePrintRevisionMarkupDisplay,
} from "./native-document/paged/useDocumentStructuralPrint";
import {
  clearHydrationUndoHistory,
  emptyDocumentContent,
  executeAuthorizedContentReplacement,
  hydrateLegacyDocxOfficeMathStyles,
  hydrateStoredPageBlocks,
  normalizeDocumentContentForSave,
  hydrationLayoutReceipt,
  prepareDocumentHydration,
  resolveTipTapDocumentContent,
  restoreDocumentStores,
  restoreDocumentStoresAfterContent,
  savedDocumentAttrsAreRestorable,
  type TipTapDocumentContentIssue,
  type TipTapDocumentContentResult,
} from "./native-document/paged/documentHydration";
export {
  clearHydrationUndoHistory,
  hydrateLegacyDocxOfficeMathStyles,
  resolveTipTapDocumentContent,
  type TipTapDocumentContentIssue,
  type TipTapDocumentContentResult,
} from "./native-document/paged/documentHydration";
import { DOCUMENT_OFFICE_DATA, documentEditorBaseExtensions, documentLowlight } from "./native-document/paged/documentEditorExtensions";
import { PREVIEW_PAGE_WIDTH_INSET_PX, usePreviewPageFitZoom } from "./native-document/paged/usePreviewPageFitZoom";
import { usePagedSurfaceZoomReserve } from "./native-document/paged/usePagedSurfaceZoomReserve";
import { pageInterfaceLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";
import { watchMobileWebObjects } from "@mrnote/core/web/lib/docs/mobile-web-fit.ts";

/** The Docs body's dragstart guard: ProseMirror's own content keeps its drags. */
const refuseDocumentStrayNativeDrag = refuseStrayNativeDragExcept(".ProseMirror");

/** A drag the document takes on drop: files to import, or plain text. */
const documentDropAccepts: OfficeFileDropAccepts = (types) =>
  types.includes("Files") || types.includes("text/plain");

// Workspace id cookie name — MUST stay in lockstep with `WORKSPACE_COOKIE_NAME`
// in lib/api.ts (the value this client sends as the `X-Workspace-ID` request
// header). Read directly (rather than via lib/api) so resolving the active
// workspace stays a synchronous, fetch-free cookie read with no dependency on
// the authed API surface.
const WORKSPACE_ID_COOKIE_NAME = "mrnote_workspace_id";
const PAGE_PREVIEW_STORAGE_PREFIX = "mrnote.pagePreview.v2";
/** Docs' AutoSave switch (lib/office-autosave-preference). */
const DOCS_AUTOSAVE_SCOPE = "docs";
/** Merge rounds of a save conflict before the conflict banner is shown. */
const CONFLICT_MERGE_ROUNDS = 10;
/** How long a conflict's kept edits wait for the page read again to be in the view before they are merged as it is. */
const CONFLICT_MERGE_READING_WAIT_MS = 30_000;
/** An AutoRecover copy's `extra` key for the body of the save that was on
 * its way when the copy was written (a reload may beat its answer). */
const AUTORECOVER_SENT_KEY = "docsSentBody";
/** ...and for the body the copy was edited from, its merge base when the page
 * has moved on: without one every block that reads differently is kept twice. */
const AUTORECOVER_BASE_KEY = "docsBaseBody";
/** A block a merge kept twice: the page's block and the copy kept beside it. */
type DocsRecoveryConflict = { kept: string; copy: string };
/** A view's unsaved edits kept aside for a new binding (or for the parts its
 * page is held as from now on), with the body they were made on, and the
 * AutoRecover slot keeping them meanwhile when there is one. */
type SetAsideDocumentDraft = { content: unknown; base: unknown; slot?: string | null;
  /** Kept as the page is read again held as parts: merged only into the parts
   * view, never into the whole view it was taken from (about to be replaced). */
  forParts?: boolean;
  /** The blocks it changed or added, and those blocks as `base` had them
   * (documentEditsSince): kept with the handover's keys at once, the copy
   * itself taking seconds to write for a long book. */
  edits?: DocumentEdits | null };
/** A whole document's own edits as the blocks they touch (each with the
 * unchanged block before it, its place), and those blocks before. */
type DocumentEdits = { blocks: unknown[]; base: unknown[] };
/** The blocks of `content` that differ from `base` or are new in it, each
 * with the unchanged block before it (so a new one has its place), and the
 * same blocks as `base` holds them; null when nothing differs, or a block
 * has no id to be found by. What `content` dropped is not said: the merge of
 * a partial draft deletes nothing (NoteEditor adoptDraftIntoParts). */
function documentEditsSince(content: unknown, base: unknown): DocumentEdits | null {
  const blocksOf = (body: unknown): unknown[] | null => {
    const blocks = body && typeof body === "object" ? (body as { content?: unknown }).content : null;
    return Array.isArray(blocks) ? blocks : null;
  };
  const idOf = (block: unknown) => (block as { attrs?: { block_id?: unknown } } | null)?.attrs?.block_id;
  const draft = blocksOf(content);
  const was = blocksOf(base);
  if (!draft || !was) return null;
  const before = new Map<string, unknown>();
  for (const block of was) {
    const id = idOf(block);
    if (typeof id === "string") before.set(id, block);
  }
  const blocks: unknown[] = [];
  const prior: unknown[] = [];
  let previous: unknown = null;
  let previousTaken = false;
  for (const block of draft) {
    const id = idOf(block);
    if (typeof id !== "string") return null;
    const old = before.get(id);
    // As written, not as each form spells it out: the live view and a stored
    // body write a default attribute, a mark's order, a block's `source`
    // differently, and compared as JSON every block of a long book read as
    
    // the keys -- so the tab closed a second later left its edits to the
    // set-aside copy alone, merged after its keys and over them.
    const same = old === block || (old !== undefined &&
      (JSON.stringify(old) === JSON.stringify(block) || sameAuthoredBlock(old, block)));
    if (!same) {
      if (previous !== null && !previousTaken) {
        blocks.push(previous);
        prior.push(before.get(idOf(previous) as string) ?? previous);
      }
      blocks.push(block);
      if (old !== undefined) prior.push(old);
    }
    previousTaken = !same;
    previous = block;
  }
  return blocks.length ? { blocks, base: prior } : null;
}
/** A whole view being handed to the parts its page is held as from now on:
 * where its caret was, and the keys held since (NoteEditor
 * armDocumentHandover). */
type DocumentHandover = {
  pageId: string;
  place: DocumentCaretPlace | null;
  /** The hydration count when it began: the parts view is a later one. */
  hydration: number;
  armedAt: number;
  started: boolean;
  keys: HandoverKeys;
  /** The tab whose AutoRecover record keeps these keys past it (this tab's
   * own, or for keys a closed tab left, that tab's): forgotten once typed. */
  persistTab: string;
  /** Says this view holds the record itself (autorecover-store
   * holdAutoRecoverHandoverKeys); let go when typed or when the view goes. */
  releaseHeld: () => void;
  /** Keys a closed tab left, typed by this opening: only at their place. */
  recovered?: boolean;
  /** Held for the whole view it was armed in, which may take input again
   * without becoming a parts view (its conflict read again and merged, its
   * room back): settleWholeViewHandover types them there, at their place. */
  wholeView?: boolean;
  /** The view's own kept edits are still to be merged into the view read
   * again (a conflict's): the keys typed after them wait for it. */
  mergePending?: boolean;
  /** The editor view it was armed in: the same one taking input again keeps
   * its caret; one built anew has it put back at `place`. */
  view?: unknown;
  /** A settle round is waiting (one at a time). */
  settling?: boolean;
  /** The whole view's own unsaved edits as it was armed (documentEditsSince
   * against the body last saved), kept with the keys until a set-aside copy
   * holds them (keepDocumentForParts). */
  edits?: DocumentEdits | null;
};
/** How long a handover waits for the whole view's edits to be merged into the
 * parts before it types the keys held since (and holds every key meanwhile). */
const DOCUMENT_HANDOVER_MERGE_WAIT_MS = 300_000;
/** Harness switch (`window.__docsHandoverTrace = []`): what each step of a
 * whole view's handover to the parts did. */
/** A kept layout's fonts asked for as its row is found (RestoredSnapshot.fontsHold);
 * `window.__docsSnapshotFontsEarly = false` asks at the first pass, as before (A/B). */
function earlySnapshotFonts(): boolean {
  return typeof window === "undefined" || (window as Window & { __docsSnapshotFontsEarly?: boolean }).__docsSnapshotFontsEarly !== false;
}

function docsHandoverTraceOn(): boolean {
  return typeof window !== "undefined" && Array.isArray((window as Window & { __docsHandoverTrace?: unknown[] }).__docsHandoverTrace);
}
function traceDocsHandover(entry: Record<string, unknown>): void {
  const sink = typeof window === "undefined" ? null : (window as Window & { __docsHandoverTrace?: unknown[] }).__docsHandoverTrace;
  if (Array.isArray(sink) && sink.length < 400) sink.push({ t: Math.round(performance.now()), ...entry });
}
const DOCS_CONFLICTS_PREFIX = "mrai.docs.recoveryConflicts:";
function readDocsRecoveryConflicts(pageId: string): DocsRecoveryConflict[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${DOCS_CONFLICTS_PREFIX}${pageId}`) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is DocsRecoveryConflict =>
        Boolean(entry) && typeof entry.kept === "string" && typeof entry.copy === "string")
      : [];
  } catch {
    return [];
  }
}
function writeDocsRecoveryConflicts(pageId: string, conflicts: DocsRecoveryConflict[]): void {
  try {
    if (conflicts.length) window.localStorage.setItem(`${DOCS_CONFLICTS_PREFIX}${pageId}`, JSON.stringify(conflicts));
    else window.localStorage.removeItem(`${DOCS_CONFLICTS_PREFIX}${pageId}`);
  } catch {
    // no storage: the notice lasts as long as this view
  }
}
/** Where the block with `blockId` starts in `editor`, or null. */
function documentBlockPosition(editor: Editor, blockId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.block_id === blockId) { found = pos; return false; }
    return true;
  });
  return found;
}
/** How long a copy a tab just left waits for that tab's last save and room
 * updates before it is compared: a save takes seconds under load, and what the
 * closing tab sent and what the copy says are the same edit. */
const AUTORECOVER_CLOSING_SAVE_WAIT_MS = 15_000;
/** A closing tab's save not in the page this long after it closed is not
 * coming (a closing request unheard of after as long is taken as lost with its
 * window, lib/page-closing-edits). */
const DOCS_CLOSING_SAVE_HEARD_MS = 8_000;
/** Word a tab leaves, as it closes with a save on its way, for the next view
 * of the page (localStorage: written synchronously, as a closing tab must). */
const DOCS_CLOSING_SAVE_KEY = "mrai.docs.closingSave:";
function noteDocsClosingSave(pageId: string): void {
  try { window.localStorage.setItem(DOCS_CLOSING_SAVE_KEY + pageId, String(Date.now())); } catch { /* best effort */ }
}
function readDocsClosingSave(pageId: string): number | null {
  try {
    const at = Number(window.localStorage.getItem(DOCS_CLOSING_SAVE_KEY + pageId));
    return Number.isFinite(at) && at > 0 && Date.now() - at < 60_000 ? at : null;
  } catch { return null; }
}
function clearDocsClosingSave(pageId: string): void {
  try { window.localStorage.removeItem(DOCS_CLOSING_SAVE_KEY + pageId); } catch { /* best effort */ }
}
/** What one document page holds (server `MAX_DOCUMENT_JSON_BYTES`). */
const DOCUMENT_PAGE_MAX_JSON_BYTES = 12 * 1024 * 1024 + 512 * 1024;
/** How often the page's fullness is read again after saves (see pageFullPercent). */
const PAGE_FULL_MEASURE_EVERY_MS = 60_000;

type DocumentPageViewMode = "single" | "multiple-pages";
type DocumentLayoutViewMode = "print" | "web" | "outline" | "draft";
type PhysicalPageFitMode = "one-page" | "multiple-pages" | "page-width";

function pagePreviewStorageKey(pageId: string): string {
  return `${PAGE_PREVIEW_STORAGE_PREFIX}:${pageId}`;
}

export function resolvePagePreviewPreference(
  storedValue: string | null,
): boolean | null {
  if (storedValue === "1") return true;
  if (storedValue === "0") return false;
  return null;
}

export function pageViewNeedsDetachedPreview(options: {
  headerText: string | null;
  footerText: string | null;
  watermark: WatermarkConfig | null;
  differentFirstPage: boolean;
}): boolean {
  return Boolean(
    options.headerText ||
    options.footerText ||
    options.watermark ||
    options.differentFirstPage,
  );
}


function readPagePreviewPreference(pageId: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    return resolvePagePreviewPreference(
      window.localStorage.getItem(pagePreviewStorageKey(pageId)),
    );
  } catch {
    return null;
  }
}

function writePagePreviewPreference(pageId: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(
      pagePreviewStorageKey(pageId),
      enabled ? "1" : "0",
    );
  } catch {
    /* storage unavailable: keep the live view state */
  }
}

/** Active workspace id from the cookie, or null for an unauthenticated visitor. */
function readActiveWorkspaceId(): string | null {
  return readCookie(WORKSPACE_ID_COOKIE_NAME);
}

// Documents whose ProseMirror nodeSize exceeds this defer the per-keystroke
// full-document serialization in onUpdate to a trailing-edge timer (see
// pendingSerializeRef). The serialization is the save normalization: it
// flattens the pages, fingerprints the layout and projects the pagination,
// all O(document), and it ran synchronously on every key, Tab and space. At
// the old ~30k cut-off a 17-page document (~20k) still paid it on every key
// (about 160ms each, over a second per key in a busy dev build), so anything
// past about half a page of prose now coalesces to the trailing edge; the
// readers that need the latest content flush it first. Short notes, and the
// tests pinned to them, keep the synchronous path.
const LARGE_DOC_SERIALIZE_NODE_SIZE = 2_000;
const LARGE_DOC_SERIALIZE_DELAY_MS = 300;
/** Past this many changed sheets a part room's publish serializes the whole view (only their changed blocks are read). */
const DOCUMENT_PART_SCOPED_PUBLISH_SHEETS = 400;
// How many times in a row the settle save in steps may find the document
// moved on before the settle save is made in one go.
const PAGINATION_SETTLE_STEP_RETRIES = 3;

/** Who holds a page's old room, for the writer its upgrade waits on. */
function legacyRoomHolderText(
  holders: readonly PageCausalUpgradeHolder[],
  t: ReturnType<typeof useTranslations>,
): string {
  if (holders.some((holder) => holder.you)) return t("collab.legacyRoomBodySelf");
  const name = holders.find((holder) => holder.name)?.name;
  return name ? t("collab.legacyRoomBodyNamed", { name }) : t("collab.legacyRoomBody");
}

function documentCommandFailureMessage(
  t: ReturnType<typeof useTranslations>,
  reason?: NativeDocumentCommandRejectionReason,
): string {
  if (reason === "legacy_ai_output") {
    return t("editor.documentCommandRejectedLegacyAIOutput");
  }
  if (reason === "invalid_image_source") {
    return t("editor.documentCommandRejectedImageData");
  }
  if (reason === "payload_too_large") {
    return t("editor.documentCommandRejectedTooLarge");
  }
  if (reason === "quality_gate") {
    return t("editor.documentCommandRejectedQualityGate");
  }
  return t("editor.documentCommandApplyFailed");
}
// What a document page holds (the API's `MAX_DOCUMENT_NODES` and its
// whole-tree string budget): the page's own validator is the bound on what an
// imported file may add, not a smaller count of its own. These were 10,000
// nodes and 1,000,000 characters, which refused inserting a Word document of
// a few thousand paragraphs the page could hold.
const PAGE_IMPORT_PROJECTED_MAX_NODES = 300_000;
const PAGE_IMPORT_PROJECTED_MAX_TEXT_CHARS = 16_000_000;

class PageImportProjectionBudgetError extends Error {
  constructor() {
    super("The selected files expand into too much editable content.");
    this.name = "PageImportProjectionBudgetError";
  }
}

function plainTextToEditorDocumentNodes(
  text: string,
): Array<Record<string, unknown>> {
  try {
    return plainTextToDocumentNodes(text);
  } catch (error) {
    if (error instanceof SharedPageImportProjectionBudgetError) {
      throw new PageImportProjectionBudgetError();
    }
    throw error;
  }
}

class StalePageImportError extends Error {
  constructor() {
    super("The page import no longer owns this editor.");
    this.name = "StalePageImportError";
  }
}

function trustedDocumentImportError(
  error: unknown,
  fallback: string,
  allowed: readonly string[],
): string {
  const message = error instanceof Error ? error.message : "";
  return message && (message === fallback || allowed.includes(message))
    ? message
    : fallback;
}

interface PageImportOperation {
  readonly pageId: string;
  readonly generation: number;
  readonly controller: AbortController;
  readonly transactionToken: DocumentShellImportAuthorityToken;
  readonly documentJson: Record<string, unknown>;
  readonly selection: { from: number; to: number };
  /** `selection` followed through the document's changes while the files
   * are read and uploaded (a co-author's edit before it moves it, WUA 232). */
  readonly live: LiveInsertionRange;
}

interface LocalSaveMutationToken {
  readonly pageId: string;
  readonly generation: number;
}

interface LocalSaveGenerationState {
  pageId: string;
  generation: number;
  queuedGeneration: number;
  queuedDraft: PageSaveAcknowledgementDraft | null;
  dirty: boolean;
  dirtyBaseContentVersion: number | null;
  dirtyBaseTitle: string | null;
}

function validContentVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function hydrationCoversCommittedPage(
  hydratedPage: PageItem | null | undefined,
  expectedPageId: string,
  expectedContentVersion: number,
): boolean {
  return (
    hydratedPage?.id === expectedPageId &&
    validContentVersion(hydratedPage.content_version) &&
    hydratedPage.content_version >= expectedContentVersion
  );
}

interface PageImportProjectionSize {
  nodes: number;
  textChars: number;
}

type PreparedPageFileImport =
  | {
      readonly kind: "separate_page";
      readonly file: File;
      readonly notebookId: string;
    }
  | {
      readonly kind: "inline";
      readonly file: File;
      readonly shouldUploadAttachment: boolean;
      readonly textNodes: Array<Record<string, unknown>>;
      readonly importedTitle?: string;
      /**
       * A complete semantic document root from DOCX or standalone HTML. It is
       * kept separate from `textNodes` because the latter carries the ordinary
       * append-only filename heading, while an empty guest document must
       * replace the complete root without inventing body content or dropping
       * document-level attributes.
       */
      readonly documentRoot?: DocxRootImportSource;
    };

function measureProjectedImportNodes(
  roots: readonly Record<string, unknown>[],
): PageImportProjectionSize {
  let nodes = 0;
  let textChars = 0;
  const stack: unknown[] = [];
  for (const root of roots) stack.push(root);
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string") nodes += 1;
    if (typeof node.text === "string") textChars += node.text.length;
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) stack.push(mark);
    }
  }
  return { nodes, textChars };
}

function addProjectedImportNodes(
  current: PageImportProjectionSize,
  nodes: readonly Record<string, unknown>[],
): PageImportProjectionSize {
  const added = measureProjectedImportNodes(nodes);
  const next = {
    nodes: current.nodes + added.nodes,
    textChars: current.textChars + added.textChars,
  };
  if (
    next.nodes > PAGE_IMPORT_PROJECTED_MAX_NODES ||
    next.textChars > PAGE_IMPORT_PROJECTED_MAX_TEXT_CHARS
  ) {
    throw new PageImportProjectionBudgetError();
  }
  return next;
}

function canImportFileAsText(file: File): boolean {
  return isTextPageImportFile(file);
}

function canImportFileAsMarkdown(file: File): boolean {
  return isMarkdownPageImportFile(file);
}

function canImportFileAsHtml(file: File): boolean {
  return isHtmlPageImportFile(file);
}

function isDocxRootImportFile(file: File): boolean {
  // capability:label-only — routes a File the user just chose from their disk
  // to the DOCX import reader. The file is not in the workspace yet, so it has
  // no id for useFileCapability; what it may become is gated server-side.
  return (
    file.name.toLowerCase().endsWith(".docx") || // capability:label-only
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim() || filename;
}

function documentNodeHasMeaningfulContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  const text = record.text;
  if (typeof text === "string" && text.trim().length > 0) return true;
  const children = record.content;
  if (
    Array.isArray(children) &&
    children.some(documentNodeHasMeaningfulContent)
  ) {
    return true;
  }
  const type = record.type;
  return (
    typeof type === "string" &&
    !["doc", "paragraph", "heading", "text", "hardBreak"].includes(type)
  );
}

function isEmptyDocumentForOverwrite(contentJson: unknown): boolean {
  const resolved = resolveTipTapDocumentContent(contentJson);
  return resolved.ok && !documentNodeHasMeaningfulContent(resolved.document);
}

type IntentionalEmptyOverwriteProof = NonNullable<
  PageDocumentDraft["intentional_empty_content_overwrite"]
>;

export interface AcknowledgedDocumentBaseline {
  pageId: string;
  title?: string;
  content: Record<string, unknown>;
  contentVersion: number;
  contentSha256: string | null;
}

function validContentSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function emptyOverwriteAuthorityForDraft(
  nextContent: Record<string, unknown>,
  savedBaseline: AcknowledgedDocumentBaseline | null,
  intentionalProof: IntentionalEmptyOverwriteProof | null,
): Pick<
  PageDocumentDraft,
  "allow_empty_content_overwrite" | "intentional_empty_content_overwrite"
> {
  if (!isEmptyDocumentForOverwrite(nextContent)) {
    return { allow_empty_content_overwrite: false };
  }
  // A user's clear always carries its source proof, even over an empty saved
  // baseline: a save of text typed just before the clear may still be in
  // flight, and when it lands the autosave hook carries the proof forward
  // over that receipt. Without it the clear reached a now non-empty page
  // uncredentialed and was refused. Over an empty baseline the proof signs
  // UNPROVEN_EMPTY_SOURCE_SHA256, so on its own it never clears stored text.
  if (intentionalProof) {
    return {
      allow_empty_content_overwrite: true,
      intentional_empty_content_overwrite: intentionalProof,
    };
  }
  if (
    savedBaseline !== null &&
    isEmptyDocumentForOverwrite(savedBaseline.content)
  ) {
    return { allow_empty_content_overwrite: true };
  }
  return { allow_empty_content_overwrite: false };
}

export function resolveIntentionalEmptyOverwriteProof(
  currentProof: IntentionalEmptyOverwriteProof | null,
  documentChanged: boolean,
  nextContent: Record<string, unknown>,
  savedBaseline: AcknowledgedDocumentBaseline | null,
): IntentionalEmptyOverwriteProof | null {
  if (!documentChanged) return currentProof;
  if (!isEmptyDocumentForOverwrite(nextContent)) return null;
  if (
    savedBaseline !== null &&
    validContentSha256(savedBaseline.contentSha256)
  ) {
    return {
      source_content_version: savedBaseline.contentVersion,
      source_content_sha256: isEmptyDocumentForOverwrite(savedBaseline.content)
        ? UNPROVEN_EMPTY_SOURCE_SHA256
        : savedBaseline.contentSha256,
    };
  }
  return null;
}

export { isUserAuthoredDocumentMutation };

/**
 * The single trust boundary between persisted JSON and the TipTap document
 * editor. Only null/undefined and the exact empty object are historical blank
 * sentinels. Every non-empty value must already be the canonical
 * `{ type: "doc", content: [...] }` shape; malformed or foreign roots are
 * reported to the caller and must never be rewritten as an empty document.
 */
/** Whether hydration left the editor holding nothing of a stored document
 * that had content (its blocks, or any text): what an editor shows when the
 * document fails its schema. */
function hydrationLostContent(editor: unknown, content: unknown): boolean {
  const state = (editor as { state?: { doc?: ProseMirrorNode } } | null)?.state;
  const doc = state?.doc;
  if (!doc || doc.textContent.length > 0) return false;
  let shownBlocks = 0;
  doc.forEach((page) => { shownBlocks += page.childCount; });
  if (shownBlocks > 1) return false;
  let storedBlocks = 0;
  for (const page of ((content as { content?: Array<{ type?: string; content?: unknown[] }> } | null)?.content ?? [])) {
    storedBlocks += page?.type === "pageBlock" && Array.isArray(page.content) ? page.content.length : 1;
  }
  return storedBlocks > 1;
}

/** Whether the collaborative room's document holds nothing at all. */
function collabRoomFragmentEmpty(session: unknown): boolean {
  const ydoc = (session as { ydoc?: { getXmlFragment?: (name: string) => { length: number } } } | null)?.ydoc;
  if (!ydoc || typeof ydoc.getXmlFragment !== "function") return false;
  return ydoc.getXmlFragment("default").length === 0;
}

/** Whether a stored body holds any words (a text node anywhere). */
function storedDocumentHasText(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== "object" || depth > 64) return false;
  const node = value as { type?: unknown; text?: unknown; content?: unknown };
  if (node.type === "text" && typeof node.text === "string" && node.text.trim()) return true;
  return Array.isArray(node.content) && node.content.some((child) => storedDocumentHasText(child, depth + 1));
}

/** The typed client error for a stored document the editor cannot hold. */
function reportUnreadableDocument(editor: unknown, flatDocument: unknown): void {
  const schema = (editor as { schema?: Schema } | null)?.schema;
  let path = "doc";
  try {
    if (schema) path = firstUnreadableNodePath(canonicalDocumentSchema(schema), flatDocument);
  } catch {
    // The path is a diagnostic; the report goes out without it.
  }
  reportClientError(
    Object.assign(new Error(`stored_document_unreadable at ${path}`), { name: "StoredDocumentUnreadable" }),
    { source: "window", windowType: "document" },
  );
}

export function documentHasDocxProjectionSource(document: unknown): boolean {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return false;
  }
  const pending: unknown[] = [document];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      continue;
    }
    const node = current as Record<string, unknown>;
    const attrs =
      node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs)
        ? (node.attrs as Record<string, unknown>)
        : null;
    const source =
      attrs?.source &&
      typeof attrs.source === "object" &&
      !Array.isArray(attrs.source)
        ? (attrs.source as Record<string, unknown>)
        : null;
    if (source?.adapter === "docx") return true;
    if (Array.isArray(node.content)) pending.push(...node.content);
  }
  return false;
}


function markdownToDocumentNodes(text: string): Array<Record<string, unknown>> {
  const doc = parseMarkdown(text);
  return (doc.content ?? []) as unknown as Array<Record<string, unknown>>;
}

function createPlainTextTableNode(
  schema: Schema,
  rows: string[][],
): ProseMirrorNode | null {
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const cellType = schema.nodes.tableCell;
  const paragraphType = schema.nodes.paragraph;
  if (!tableType || !rowType || !cellType || !paragraphType) {
    return null;
  }

  const tableRows = rows.map((row) =>
    rowType.createChecked(
      null,
      row.map((cellText) => {
        const paragraph = cellText
          ? paragraphType.createChecked(null, schema.text(cellText))
          : paragraphType.createChecked();
        return cellType.createChecked(null, paragraph);
      }),
    ),
  );
  return tableType.createChecked(null, tableRows);
}

function clipboardImageFiles(clipboard: DataTransfer | null): File[] {
  if (!clipboard) return [];
  const files = new Map<string, File>();
  const addFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    files.set(
      `${file.name}:${file.type}:${file.size}:${file.lastModified}`,
      file,
    );
  };

  Array.from(clipboard.files || []).forEach(addFile);
  Array.from(clipboard.items || []).forEach((item) => {
    if (item.kind === "file") {
      addFile(item.getAsFile());
    }
  });
  return Array.from(files.values());
}

function clipboardHasEditableText(clipboard: DataTransfer | null): boolean {
  if (!clipboard) return false;
  const types = new Set(Array.from(clipboard.types || []));
  for (const type of ["text/html", "text/plain"]) {
    if (!types.has(type)) continue;
    try {
      if (clipboard.getData(type).trim().length > 0) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}









function pasteParagraphIntoEmptyParagraph(view: EditorView, slice: Slice): boolean {
  const { selection } = view.state;
  const { $from } = selection;
  const source = slice.content.firstChild;
  if (
    !selection.empty ||
    slice.openStart < 1 ||
    !source ||
    !source.isTextblock ||
    $from.depth < 1 ||
    !$from.parent.isTextblock ||
    $from.parent.content.size !== 0 ||
    (source.type.name !== "paragraph" && source.type.name !== "heading") ||
    ($from.parent.type.name !== "paragraph" && $from.parent.type.name !== "heading")
  ) {
    return false;
  }
  if (!source.attrs.customStyleName && !source.attrs.customStyleId) return false;
  const target = $from.parent;
  const targetPos = $from.before();
  // The block keeps what identifies it and where pagination put it; the
  // formatting is the source paragraph's.
  const attrs: Record<string, unknown> = { ...source.attrs };
  for (const key of Object.keys(target.attrs)) {
    if (key === "block_id" || key === "anchor_id" || key.startsWith("page")) {
      attrs[key] = target.attrs[key];
    }
  }
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (!container.canReplaceWith(index, index + 1, source.type)) return false;
  try {
    const tr = view.state.tr.replaceSelection(slice);
    if (tr.doc.nodeAt(targetPos)?.isTextblock !== true) return false;
    tr.setNodeMarkup(targetPos, source.type, attrs);
    view.dispatch(
      tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Rich clipboard HTML parsed the way the paste pipeline parses it, so a
 * table in it can be measured before anything is written.
 */
function clipboardHtmlSlice(view: EditorView, event: ClipboardEvent): Slice | null {
  let html = "";
  try {
    html = event.clipboardData?.getData("text/html") ?? "";
  } catch {
    return null;
  }
  if (!html.trim()) return null;
  try {
    const body = new window.DOMParser().parseFromString(html, "text/html").body;
    return ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(body);
  } catch {
    return null;
  }
}

function insertPlainTextTableFromPaste(
  view: EditorView,
  event: ClipboardEvent,
  onRefused?: () => void,
): boolean {
  const clipboard = event.clipboardData;
  if (!clipboard || Array.from(clipboard.types || []).includes("text/html")) {
    return false;
  }
  if (view.state.selection.$from.parent.type.name === "codeBlock") {
    return false;
  }
  let clipboardText = "";
  try {
    clipboardText = clipboard.getData("text/plain");
  } catch {
    // Clipboard access blocked — no table to detect; fall through to default
    // paste (matches clipboardHasEditableText's defensive getData).
    return false;
  }
  const rows = parsePlainTextTableRows(clipboardText);
  if (!rows) {
    return false;
  }
  // Inside a table the matrix fills the table's cells (Word pastes table
  // portions into an existing table, never as a nested table); only in body
  // text does it become a new table.
  if (pasteTextMatrixIntoTable(view, event, rows, { onRefused })) {
    return true;
  }
  try {
    const tableNode = createPlainTextTableNode(view.state.schema, rows);
    if (!tableNode) {
      return false;
    }
    const transaction = view.state.tr
      .replaceSelectionWith(tableNode, false)
      .scrollIntoView();
    event.preventDefault();
    view.dispatch(transaction);
    return true;
  } catch {
    return false;
  }
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("File read failed"));
    reader.readAsText(file);
  });
}

function fileNodeFromImportItem(clientId: string): Record<string, unknown> {
  return {
    type: "file",
    attrs: {
      import_item_id: clientId,
    },
  };
}

const INLINE_IMAGE_IMPORT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  // Word inserts an SVG file as a picture (Insert > Pictures). The server
  // stores it passive (svg_sanitizer) and writes it into the Word file as
  // Word does: the SVG beside a PNG it draws (asvg:svgBlip).
  "image/svg+xml",
]);

interface UploadedInlineImage {
  attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

function isInlineImageImportFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  if (mime) return INLINE_IMAGE_IMPORT_MIME_TYPES.has(mime);
  return /\.(?:png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

function uploadedImageNode(
  attachment: UploadedInlineImage,
): Record<string, unknown> {
  const attachmentId = String(attachment.attachment_id || "").trim();
  if (!attachmentId || typeof window === "undefined") {
    throw new Error("Uploaded image attachment is invalid.");
  }
  return {
    type: "image",
    attrs: {
      // Keep a durable, authenticated same-origin source in persisted JSON.
      // The NodeView refreshes it to a short-lived signed URL at render time,
      // while attachment_id remains the custody/duplication authority.
      src: new URL(
        `/api/v1/attachments/${encodeURIComponent(attachmentId)}/download`,
        window.location.origin,
      ).toString(),
      attachment_id: attachmentId,
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
      alt: attachment.filename,
    },
  };
}

function shortString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function imageObjectContext(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const src = shortString(attrs.src, 520);
  const context: Record<string, unknown> = {
    image_src_kind: "none",
  };
  const alt = shortString(attrs.alt, 500);
  const title = shortString(attrs.title, 500);
  const width = positiveNumber(attrs.width);
  const height = positiveNumber(attrs.height);
  const widthEmu = positiveNumber(attrs.widthEmu);
  const heightEmu = positiveNumber(attrs.heightEmu);
  if (alt) context.image_alt = alt;
  if (title) context.image_title = title;
  if (width) context.image_width = width;
  if (height) context.image_height = height;
  if (widthEmu) context.image_width_emu = widthEmu;
  if (heightEmu) context.image_height_emu = heightEmu;
  if (!src) return context;
  if (src.startsWith("data:image/")) {
    context.image_src_kind = "embedded";
    const headerEnd = src.indexOf(",");
    context.image_src_prefix =
      headerEnd > 0 ? src.slice(0, headerEnd + 1) : "data:image/";
    return context;
  }
  if (src.startsWith("https://") || src.startsWith("http://")) {
    context.image_src_kind = "remote";
    context.image_src = src;
    return context;
  }
  context.image_src_kind = "other";
  return context;
}

function sourceObject(attrs: Record<string, unknown>): unknown | undefined {
  const source = attrs[MRNOTE_SOURCE_ATTR];
  return source && typeof source === "object" ? source : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function positiveInteger(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 1 ? Math.floor(numeric) : 1;
}

function tableCellGeometry(
  table: ProseMirrorNode,
  targetRowIndex: number,
  targetCellIndex: number,
): {
  colIndex: number;
  colspan: number;
  rowIndex: number;
  rowspan: number;
} | null {
  const occupied = new Set<string>();
  for (let rowIndex = 0; rowIndex < table.childCount; rowIndex += 1) {
    const row = table.child(rowIndex);
    if (row.type.name !== "tableRow") continue;
    let visualCol = 0;
    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex += 1) {
      while (occupied.has(`${rowIndex}:${visualCol}`)) visualCol += 1;
      const cell = row.child(cellIndex);
      const colspan = positiveInteger(cell.attrs?.colspan);
      const rowspan = positiveInteger(cell.attrs?.rowspan);
      if (rowIndex === targetRowIndex && cellIndex === targetCellIndex) {
        return { colIndex: visualCol, colspan, rowIndex, rowspan };
      }
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
          occupied.add(`${rowIndex + rowOffset}:${visualCol + colOffset}`);
        }
      }
      visualCol += colspan;
    }
  }
  return null;
}

function activeDocumentBlockContext(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  empty: boolean,
): Record<string, unknown> {
  type BlockTarget = { node: ProseMirrorNode; pos: number };
  type TableCellTarget = BlockTarget & {
    colIndex: number;
    rowIndex: number;
  };
  let best: BlockTarget | null = null;
  let bestSource: BlockTarget | null = null;
  let bestCell: TableCellTarget | null = null;
  let bestTable: BlockTarget | null = null;
  const rowIndexes = new WeakMap<ProseMirrorNode, number>();
  doc.descendants((node, pos, parent, index) => {
    if (!node.isBlock) return true;
    const attrs = node.attrs || {};
    const start = pos;
    const end = pos + node.nodeSize;
    const overlaps = empty
      ? from >= start && from <= end
      : to > start && from < end;
    if (!overlaps) return true;
    if (node.type.name === "tableRow" && parent?.type.name === "table") {
      rowIndexes.set(node, index);
    }
    if (
      node.type.name === "table" &&
      (!bestTable || node.nodeSize <= bestTable.node.nodeSize)
    ) {
      bestTable = { node, pos };
    }
    if (
      (node.type.name === "tableCell" || node.type.name === "tableHeader") &&
      parent?.type.name === "tableRow"
    ) {
      const rowIndex = rowIndexes.get(parent);
      if (
        typeof rowIndex === "number" &&
        (!bestCell || node.nodeSize <= bestCell.node.nodeSize)
      ) {
        bestCell = { node, pos, rowIndex, colIndex: index };
      }
    }
    const blockId = attrs[MRNOTE_BLOCK_ID_ATTR];
    if (typeof blockId !== "string" || !blockId.trim()) return true;
    if (!best || node.nodeSize <= best.node.nodeSize) {
      best = { node, pos };
    }
    if (
      sourceObject(attrs) &&
      (!bestSource || node.nodeSize <= bestSource.node.nodeSize)
    ) {
      bestSource = { node, pos };
    }
    return true;
  });
  const target = best as BlockTarget | null;
  if (!target) return {};
  const attrs = target.node.attrs || {};
  const semanticObject = documentSemanticNodeForAiContext(target.node.toJSON());
  const targetSource = sourceObject(attrs);
  const sourceTarget = targetSource
    ? target
    : (bestSource as BlockTarget | null);
  const sourceAttrs = sourceTarget?.node.attrs || {};
  const source = targetSource || sourceObject(sourceAttrs);
  const cellTarget = bestCell as TableCellTarget | null;
  const cellAttrs = cellTarget?.node.attrs || {};
  const cellText = cellTarget
    ? shortString(cellTarget.node.textContent, 500)
    : undefined;
  const tableTarget = bestTable as BlockTarget | null;
  const tableAttrs = tableTarget?.node.attrs || {};
  const tableBlockId = tableAttrs[MRNOTE_BLOCK_ID_ATTR];
  const cellGeometry =
    cellTarget && tableTarget
      ? tableCellGeometry(
          tableTarget.node,
          cellTarget.rowIndex,
          cellTarget.colIndex,
        )
      : null;
  return {
    block_id: attrs[MRNOTE_BLOCK_ID_ATTR],
    block_type: target.node.type.name,
    block_from: target.pos,
    block_to: target.pos + target.node.nodeSize,
    ...(semanticObject ? { semantic_object: semanticObject } : {}),
    ...(target.node.type.name === "image" ? imageObjectContext(attrs) : {}),
    ...(source ? { source } : {}),
    ...(source && sourceTarget && sourceTarget !== target
      ? {
          source_block_id: sourceAttrs[MRNOTE_BLOCK_ID_ATTR],
          source_block_type: sourceTarget.node.type.name,
          source_block_from: sourceTarget.pos,
          source_block_to: sourceTarget.pos + sourceTarget.node.nodeSize,
        }
      : {}),
    ...(tableTarget && typeof tableBlockId === "string" && tableBlockId.trim()
      ? {
          table_block_id: tableBlockId,
          table_block_from: tableTarget.pos,
          table_block_to: tableTarget.pos + tableTarget.node.nodeSize,
        }
      : {}),
    ...(cellTarget
      ? {
          table_cell_row: cellTarget.rowIndex,
          table_cell_col: cellTarget.colIndex,
          table_cell_row_index: cellTarget.rowIndex,
          table_cell_col_index: cellTarget.colIndex,
          table_cell_type: cellTarget.node.type.name,
          table_cell_from: cellTarget.pos,
          table_cell_to: cellTarget.pos + cellTarget.node.nodeSize,
          ...(cellGeometry
            ? {
                table_cell_visual_row: cellGeometry.rowIndex,
                table_cell_visual_col: cellGeometry.colIndex,
              }
            : {}),
          ...(cellText ? { table_cell_text: cellText } : {}),
          ...(positiveNumber(cellAttrs.colspan) ||
          (cellGeometry && cellGeometry.colspan > 1)
            ? { table_cell_colspan: cellGeometry?.colspan || cellAttrs.colspan }
            : {}),
          ...(positiveNumber(cellAttrs.rowspan) ||
          (cellGeometry && cellGeometry.rowspan > 1)
            ? { table_cell_rowspan: cellGeometry?.rowspan || cellAttrs.rowspan }
            : {}),
        }
      : {}),
  };
}

/**
 * The document for the edit context, without embedded bytes: a `data:` URL
 * keeps its media-type prefix only. The context is compared and flattened as
 * text (the inline proposal panel) and travels with AI requests; neither
 * wants an inlined picture's megabytes.
 */
function documentJsonWithoutEmbeddedBytes(value: unknown): unknown {
  if (typeof value === "string") {
    if (!value.startsWith("data:")) return value;
    const comma = value.indexOf(",");
    return comma < 0 ? "data:" : value.slice(0, comma + 1);
  }
  if (Array.isArray(value)) return value.map(documentJsonWithoutEmbeddedBytes);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = documentJsonWithoutEmbeddedBytes(item);
    }
    return out;
  }
  return value;
}

function documentEditContextForSelection({
  doc,
  from,
  to,
  empty,
  selectedText,
  documentText,
  documentIsEmpty,
  pageId,
  windowId,
  targetLabel,
}: {
  doc: ProseMirrorNode;
  from: number;
  to: number;
  empty: boolean;
  selectedText: string;
  documentText: string;
  documentIsEmpty: boolean;
  pageId: string;
  windowId?: string | null;
  targetLabel: string;
}): DocumentEditContext {
  return {
    page_type: "document",
    target_page_id: pageId,
    target_window_id: windowId || null,
    selected_text: selectedText,
    document_text: documentText,
    document_json: documentJsonWithoutEmbeddedBytes(doc.toJSON()),
    document_is_empty: documentIsEmpty,
    target_label: targetLabel,
    command_context: {
      ...activeDocumentBlockContext(doc, from, to, empty),
      ...(empty ? {} : { selection_from: from, selection_to: to }),
    },
  };
}

function documentJsonIsStructurallyEmpty(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  if (root.type !== "doc" || !Array.isArray(root.content)) return false;
  if (root.content.length === 0) return true;
  if (root.content.length !== 1) return false;
  const onlyNode = root.content[0];
  if (!onlyNode || typeof onlyNode !== "object" || Array.isArray(onlyNode)) {
    return false;
  }
  const paragraph = onlyNode as Record<string, unknown>;
  if (paragraph.type !== "paragraph") return false;
  return (
    paragraph.content === undefined ||
    (Array.isArray(paragraph.content) && paragraph.content.length === 0)
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


interface NoteEditorProps {
  pageId: string;
  /** Mount-bound: preview uses the production body with no page-write session.
   * Publishing requires a new mount with the real page identity. */
  surfaceMode?: "editor" | "preview" | "locked";
  /** Browser layout observation only; never a save/export/delivery receipt. */
  onSurfaceReadinessChange?: (value: DocumentSurfaceReadiness) => void;
  /** One entry animation for the real chrome, after the host accepts a draft. */
  chromeReveal?: boolean;
  /** Window-owned status slot; omitted for standalone and Guest editors. */
  footerPortalTarget?: HTMLElement | null;
  windowId?: string;
  onPlainTextChange?: (text: string) => void;
  /** Read-only production lifecycle facts; no automatic save or reload. */
  onLifecycleObservation?: DocumentLifecycleObserver;
  /** Called whenever the title text changes (every keystroke). Parent windows
   *  use this to keep the window titlebar / page list card in sync. `loaded`
   *  marks the echo of the title the page was loaded with: the saved title,
   *  nothing for a page list to refresh. */
  onTitleChange?: (title: string, origin?: "loaded") => void;
  guestMode?: boolean;
  initialTitle?: string;
  initialContent?: Record<string, unknown>;
  /**
   * Optional guest-only revision token for authored demo surfaces. When it
   * changes, the next `initialContent` value is applied through this real
   * editor's own setContent command without remounting the toolbar, outline,
   * canvas or selection engine.
   */
  guestContentRevision?: string;
  /**
   * The server's PDF renderer (`/render/page-preview`): the window gets
   * `__MRAI_PAGE_PREVIEW_PRINT`, which builds the document's print copy --
   * the same one Print shows -- in a new window and stops once it is ready,
   * for the headless browser to print to a file.
   */
  exposeStructuralPrint?: boolean;
  /** The server's PDF renderer, a PDF showing markup: the review display its
   * tracked changes print in (null: the final copy). */
  printRevisionMarkup?: PrintRevisionMarkup;
  /** The server's PDF renderer: the page's font plan (its font-bindings
   * answer), the faces' bytes already handed to this document. */
  handedDisplayFontPlan?: unknown;
  /** Opens the real document navigation pane on first paint (used by embedded
   * editor surfaces that need the authored outline visible immediately). */
  initialOutlineOpen?: boolean;
  /** Initial view zoom for embedded editor surfaces. The normal product keeps
   * the Word-compatible 100% default; marketing can frame this same live page
   * at a smaller camera scale without redrawing or replacing the editor. */
  initialZoom?: number;
  /** Allows the real selection BubbleMenu in a guest-only authored demo. It is
   * opt-in because ordinary public/guest editors intentionally suppress it. */
  showGuestSelectionToolbar?: boolean;
  /** Development-fixture opt-in for the real paged Header/Footer edit layer.
   * Guest autosave, collaboration and authenticated APIs remain disabled. */
  enableGuestBandEditing?: boolean;
  /** Development-fixture opt-in: a selected diagram of a catalog layout prepares
   * its conversion on a guest surface too (its first real edit lands it), so that
   * can be watched in a real browser without a login. Guest autosave,
   * collaboration and authenticated APIs remain disabled. */
  enableGuestSmartArtOpenConversion?: boolean;
  onGuestSaveRequest?: () => void;
  /** Guest only: the toolbar's AI button asks for an account through this. */
  onGuestAiRequest?: () => void;
  /**
   * Guest only: export, print (the toolbar's, ⌘P), Save as Picture and the
   * mail-merge download ask for an account through this instead of making
   * a file (the homepage's signed-out editor). Absent → they run as before.
   */
  onGuestExportRequest?: () => void;
  /** The ribbon tab the editor opens on (read once, at mount): the homepage
   *  opens a handwriting visitor's document on Draw. Absent → Home. */
  initialRibbonTab?: DocumentBaseRibbonTabId;
  /**
   * Guest only: the document as this editor would save it, before the
   * visitor's first edit (`base`, from that edit's own starting document) and
   * after the latest one (`final`), each through the save serializer. The
   * homepage keeps both so the edit can be replayed onto the page the file
   * becomes after sign-up. Never called outside guest mode.
   */
  onGuestDocumentChange?: (change: {
    base: Record<string, unknown>;
    final: Record<string, unknown>;
  }) => void;
  /**
   * Guest only, with onGuestDocumentChange: whether the visitor has acted on
   * the editor yet (a key, a click, a paste). A document change before that
   * (the editor's own settling after it opens) is not their edit, and the
   * `base` is the document just before their first one.
   */
  guestUserHasActed?: () => boolean;
  /** Guest only: the document zoom (1 = 100%) whenever it changes. */
  onGuestZoomChange?: (zoom: number) => void;
  /**
   * Signed in: edits a visitor made to this page's file on the homepage,
   * before they had an account (/open/start). Once the page is open and
   * writable they are made here as one ordinary edit (rebased onto this
   * editor's own document, block for block) and saved as any edit is; when
   * they cannot be placed faithfully nothing is changed and `settle` says why.
   */
  classicPendingEdits?: ClassicPendingEdits;
  /** Enables authenticated, CSRF-bound server exports for persisted pages. */
  serverExportEnabled?: boolean;
  /** Workspace-level dark-launch gate for Docs Office-parity V2. */
  docsOfficeParityV2?: boolean;
}


const EMPTY_DOCUMENT_ATTRS: Record<string, unknown> = {};

export function shouldMountSheetBandEditLayer(
  sheetBoxCount: number,
  guestMode: boolean,
  enableGuestBandEditing: boolean,
): boolean {
  return sheetBoxCount > 0 && (!guestMode || enableGuestBandEditing);
}


function stablePanelReturnFocusTarget(): HTMLElement | null {
  if (
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
  ) {
    return null;
  }
  const active = document.activeElement;
  const menu = active.closest<HTMLElement>("[role='menu'][id]");
  if (!menu?.id) return active;
  return (
    Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]")).find(
      (candidate) => candidate.getAttribute("aria-controls") === menu.id,
    ) ?? active
  );
}

function restorePanelFocus(
  editor: MaybeNoteEditor,
  returnFocus: HTMLElement | null,
): void {
  window.requestAnimationFrame(() => {
    if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
      return;
    }
    if (isUsableEditor(editor)) editor.view.focus();
  });
}


/**
 * Run a footnote/endnote insert and hand the caret to the new note's body.
 * A failed insert (read-only, no notes extension) returns the caret to the
 * document, which is where the ribbon press left it before.
 */
function insertNoteAndFocusIt(
  editor: Editor | null,
  insert: () => boolean,
): (() => void) | null {
  if (!editor || editor.isDestroyed) return null;
  const before = new Set(readFootnotes(editor.state.doc).map((note) => note.id));
  if (!insert()) {
    editor.commands.focus();
    return null;
  }
  const added = readFootnotes(editor.state.doc).find((note) => !before.has(note.id));
  if (!added) {
    editor.commands.focus();
    return null;
  }
  return focusInsertedNoteBody(editor, added.id, () => {
    if (!editor.isDestroyed) editor.commands.focus();
  });
}


















export function deferHydrationUndoHistoryReset(
  editor: MaybeNoteEditor,
): () => void {
  let cancelled = false;
  queueMicrotask(() => {
    if (cancelled) return;
    clearHydrationUndoHistory(editor);
  });
  return () => {
    cancelled = true;
  };
}

const HYDRATION_APPLY_RETRY_MS = 75;
const HYDRATION_APPLY_MAX_ATTEMPTS = 8;

type DocumentHydrationFailure =
  "set_content_unavailable" | "set_content_rejected";

interface HydrationApplyAttemptState {
  pageId: string;
  reloadNonce: number;
  editor: MaybeNoteEditor;
  attempts: number;
}

interface CommittedCollabSessionOptions {
  enabled: boolean;
  docId: string;
  userName: string;
  localOnly: boolean;
  suspendProvider?: boolean;
}

const nullCollabSessionSnapshot = (): CollabSession | null => null;

export function createCommittedCollabSessionStore({
  enabled, docId, userName, localOnly,
}: CommittedCollabSessionOptions) {
  let current: CollabSession | null = null;
  let mode = localOnly;
  let suspended = false;
  let providerRetired = false;
  const sessions = new Set<CollabSession>();
  const listeners = new Set<() => void>();
  const notify = () => {for (const listener of listeners) listener();};
  const acquire = () => {
    current = createCollabSession({docId, userName,
      ...((mode || suspended) ? {roomName: null} : {})});
    sessions.add(current);
    providerRetired = false;
    notify();
  };
  return {
    getSnapshot: () => current,
    configure(next: {localOnly: boolean; suspendProvider: boolean}) {
      const changedMode = mode !== next.localOnly;
      mode = next.localOnly;
      suspended = next.suspendProvider;
      if (suspended) {
        if (current && !providerRetired) {current.provider?.destroy();providerRetired = true;}
        return; // Keep the existing visible Y.Doc through authority/loading changes.
      }
      if (current && (changedMode || providerRetired)) {
        // Ordinary legacy authority transitions retain the existing teardown
        // contract. Only the suspended migration interval holds the old Y.Doc.
        const previous = current;
        current = null;
        previous.destroy();
        sessions.delete(previous);
        acquire();
      }
    },
    subscribe(notifySubscriber: () => void) {
      if (!enabled) return () => {};
      listeners.add(notifySubscriber);
      if (!current) acquire();
      else notifySubscriber();
      return () => {
        listeners.delete(notifySubscriber);
        if (listeners.size) return;
        current = null;
        for (const session of sessions) session.destroy();
        sessions.clear();
      };
    },
  };
}

/**
 * Acquire the side-effectful Yjs provider only after React commits this tree.
 *
 * React StrictMode deliberately runs an effect as setup -> cleanup -> setup.
 * That sequence is safe: every created session is destroyed before its
 * replacement is acquired, so a discarded render can never leave a writable
 * room member behind.  Creating the provider in useMemo ran during render;
 * React could discard that value without ever mounting its cleanup effect.
 */
function useCommittedCollabSession({
  enabled,
  docId,
  userName,
  localOnly,
  suspendProvider = false,
}: CommittedCollabSessionOptions): CollabSession | null {
  const store = useMemo(
    () =>
      createCommittedCollabSessionStore({
        enabled,
        docId,
        userName,
        localOnly: true,
      }),
    [docId, enabled, userName],
  );
  useLayoutEffect(() => {store.configure({localOnly, suspendProvider});}, [store, localOnly, suspendProvider]);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    nullCollabSessionSnapshot,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Cmd/Ctrl+Z as Undo; Shift+Cmd/Ctrl+Z and Ctrl+Y as Redo; Cmd/Ctrl+A as
 * Select All; else null. */
function historyShortcut(
  event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "key">,
): "undo" | "redo" | "selectAll" | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  if (key === "a" && !event.shiftKey) return "selectAll";
  return null;
}

/** Run a document-window shortcut on the editor. Select All focuses the
 * document first (without scrolling) so the selection is the document's, as
 * Word selects the document from anywhere in its window. */
function runDocumentShortcut(editor: Editor, shortcut: "undo" | "redo" | "selectAll"): void {
  if (shortcut === "selectAll") {
    if (!editor.view.hasFocus()) editor.view.focus();
    editor.commands.selectAll();
  } else if (shortcut === "redo") editor.commands.redo();
  else editor.commands.undo();
}

/**
 * The file importers (Word/PDF/CSV/code/archive readers and the HTML
 * sanitizer) load with the first import, not with every document: opening
 * a page never needs them.
 */
const loadPageFileImport = () => import("@mrnote/core/web/lib/page-file-import.ts");
const loadHtmlDocumentImport = () => import("../../../lib/document-import/htmlDocument");

export default function NoteEditor({
  pageId,
  surfaceMode = "editor",
  onSurfaceReadinessChange,
  chromeReveal = false,
  footerPortalTarget,
  windowId,
  onPlainTextChange,
  onLifecycleObservation,
  onTitleChange,
  guestMode: guestModeProp = false,
  initialTitle = "",
  initialContent,
  guestContentRevision,
  exposeStructuralPrint = false,
  printRevisionMarkup = null,
  handedDisplayFontPlan,
  initialOutlineOpen = false,
  initialZoom,
  showGuestSelectionToolbar = false,
  enableGuestBandEditing: enableGuestBandEditingProp = false,
  enableGuestSmartArtOpenConversion = false,
  onGuestSaveRequest,
  onGuestAiRequest,
  onGuestExportRequest: onGuestExportRequestProp,
  initialRibbonTab,
  onGuestDocumentChange,
  guestUserHasActed,
  onGuestZoomChange,
  classicPendingEdits,
  serverExportEnabled,
  docsOfficeParityV2 = true,
}: NoteEditorProps) {
  // A caller cannot promote a detached candidate by changing props on its
  // existing mount. Its page hooks and registry remain guest-scoped forever.
  const [previewMode] = useState(() => surfaceMode === "preview" || surfaceMode === "locked");
  
  // 把顶栏锁了). Its toolbar stands where a page has it, locked; the body
  // keeps the preview's refusals.
  const [chromeLocked] = useState(() => surfaceMode === "locked");
  const guestMode = previewMode || guestModeProp;
  const onGuestExportRequest = guestMode ? onGuestExportRequestProp : undefined;
  const enableGuestBandEditing = !previewMode && enableGuestBandEditingProp;
  const t = useTranslations("console-notebooks");
  useCaptionLabelLocale();
  const lifecycleObserverRef = useRef(onLifecycleObservation);
  const lifecycleEmitter = useMemo(() => createDocumentLifecycleObservationEmitter(), []);
  const pendingLifecycleFactsRef = useRef(new Map<"hydrated" | "save-ack", () => boolean>());
  const lifecycleSourceScopeRef = useRef<ReturnType<typeof captureSavedPageHotCacheScope> | null>(null);
  useLayoutEffect(() => { lifecycleObserverRef.current = onLifecycleObservation; }, [onLifecycleObservation]);

  // Styles-pane toggle label (the rest of the pane is localized inside
  // StylesPanel itself).
  const stylesPaneLabel = t("toolbar.stylesMenu");
  const {
    focusWindow,
    moveWindow,
    openWindow,
    readWindowFrame,
    readWindows,
    resizeWindow,
    restoreWindow,
    updateWindowMeta,
  } = useWindowManagerActions();
  const [title, setTitle] = useState(() => (guestMode ? initialTitle : ""));
  const [copilotCirclePage, setCopilotCirclePage] = useState<string | null>(null);
  // The text selection the pick mode was entered from (the floating toolbar's
  // sparkle); the ribbon's AI button enters it with nothing picked.
  const [copilotCircleRange, setCopilotCircleRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const openCopilotCircle = useCallback(() => {
    setCopilotCircleRange(null);
    setCopilotCirclePage((current) => current === pageId ? null : pageId);
  }, [pageId]);
  const pickSelectionStructures = useCallback(
    (range: { from: number; to: number }) => {
      setCopilotCircleRange(range);
      setCopilotCirclePage(pageId);
    },
    [pageId],
  );
  const closeCopilotCircle = useCallback(() => {
    setCopilotCirclePage(null);
    setCopilotCircleRange(null);
  }, []);
  // Current workspace id, used only to scope the toolbar's Quick Parts gallery
  // localStorage key per workspace (instead of a shared "global" key). Read
  // synchronously from the same workspace cookie `lib/api` already sends as
  // `X-Workspace-ID` — no network round-trip and no authed fetch, so guest
  // hosts and the existing NoteEditor test mocks are unaffected. Null in guest
  // mode (no cookie) → the gallery falls back to "global", which is fine since
  // guest galleries are ephemeral/local anyway.
  const workspaceId = useMemo(
    () => (guestMode ? null : readActiveWorkspaceId()),
    [guestMode],
  );
  const [localSaveStatus, setLocalSaveStatus] =
    useChangedState<PageSaveStatus>("saved");
  const [editorHydrated, setEditorHydrated] = useState(false);
  // The served Office tables the first layout draws with (gallery table
  // styles): asked for as the editor opens and held behind the loading state
  // with the document itself. A guest has none and is settled at once.
  const documentOfficeDataSettled = useOfficeDataSettled(DOCUMENT_OFFICE_DATA);
  // Word's style sets (the Design tab, the Styles gallery under a design):
  // asked for as the editor opens, not held for; what draws with them
  // redraws when they land.
  useEffect(() => {
    void loadOfficeData("word-style-sets");
  }, []);
  const [hydrateRetryTick, setHydrateRetryTick] = useState(0);
  const collabHydrationWaitRef = useRef<{
    pageId: string;
    session: CollabSession;
    startedAt: number;
    bypassed: boolean;
  } | null>(null);
  const [hydrationFailure, setHydrationFailure] =
    useState<DocumentHydrationFailure | null>(null);
  // "Drop to import": the shared file-drop state (useOfficeFileDrop). Docs
  // takes dropped files and dropped plain text.
  const {
    active: dragActive,
    onDragOver: acceptFileDrag,
    onDragLeave: handleDragLeave,
    end: endFileDrag,
  } = useOfficeFileDrop(documentDropAccepts);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const activeImportRef = useRef<PageImportOperation | null>(null);
  const importGenerationRef = useRef(0);
  const importPageIdRef = useRef(pageId);
  useLayoutEffect(() => {
    // Keep ownership checks current without mutating a ref during render. A
    // layout effect runs before browser events can target the newly committed
    // page, so an async import from the previous page cannot publish into it.
    importPageIdRef.current = pageId;
  }, [pageId]);
  const [documentContentIssue, setDocumentContentIssue] =
    useState<TipTapDocumentContentIssue | null>(null);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const backlinksReturnFocusRef = useRef<HTMLElement | null>(null);
  // Comment threads (Word/WPS "comments"): the sidebar listing/replying/resolving
  // threads. Closed by default; opened by the toggle or the toolbar's Add-comment
  // button (ADD_COMMENT_EVENT). Additive — a document with no comments is
  // unaffected whether the panel is open or shut.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [newCommentRequestId, setNewCommentRequestId] = useState(0);
  const [commentFocusRequest, setCommentFocusRequest] = useState<{
    threadId: string;
    requestId: number;
  } | null>(null);
  const commentsReturnFocusRef = useRef<HTMLElement | null>(null);
  // Document navigation pane / outline sidebar (Word "Navigation Pane" / WPS
  // 导航窗格): a persistent click-to-jump list of the document's headings that
  // re-derives itself from the live document on every edit. Closed by default;
  // toggled by the toolbar's outline button. Stacks beside the other side
  // panels (backlinks/comments) exactly like they stack with each other.
  // Additive — a document with no headings shows the panel's empty state.
  const [outlineOpen, setOutlineOpen] = useState(initialOutlineOpen);
  const outlineReturnFocusRef = useRef<HTMLElement | null>(null);
  // Track-changes review pane (Word "Reviewing Pane" / WPS 修订窗格): a live,
  // click-to-jump list of every tracked change with per-change Accept / Reject
  // (plus Accept-all / Reject-all). Re-derives from the live document on every
  // edit, so accepting one change updates the list without any persisted copy.
  // Closed by default; toggled by the toolbar's review-pane button. Stacks
  // beside the other side panels. Additive — a document with no tracked changes
  // shows the panel's empty state.
  const [trackChangesOpen, setTrackChangesOpen] = useState(false);
  // Review > AI changes asked for one group (the run card's "逐条审阅").
  const [aiReviewRequest, setAiReviewRequest] = useState<{ groupId: string | null; nonce: number } | null>(null);
  const trackChangesReturnFocusRef = useRef<HTMLElement | null>(null);
  // Styles pane (Word/WPS "Styles" / 样式 registry): lists the built-in paragraph
  // presets plus the document's user-defined named styles, applies one to the
  // selection, and creates/modifies/deletes a named style. Closed by default;
  // toggled by the toolbar's styles button. Stacks beside the other side panels.
  const [stylesOpen, setStylesOpen] = useState(false);
  const stylesReturnFocusRef = useRef<HTMLElement | null>(null);
  // Citation source picker (Word/WPS "Insert citation"). Closed by default;
  // opened by the toolbar's Insert-citation button (INSERT_CITATION_EVENT). The
  // sources snapshot is read off the editor when the picker opens so the "pick
  // existing" list reflects the live document store. Additive — a document with
  // no citations is unaffected whether the picker is open or shut.
  const [citationPickerOpen, setCitationPickerOpen] = useState(false);
  const citationPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [citationPickerMode, setCitationPickerMode] = useState<
    "insert" | "manage"
  >("insert");
  const [citationSources, setCitationSources] = useState<CslSource[]>([]);
  const [citedSourceIds, setCitedSourceIds] = useState<string[]>([]);
  const [citationStyleState, setCitationStyleState] =
    useState<CitationStyle>("apa");
  // Cross-reference heading picker (Word/WPS "Insert cross-reference"). Closed by
  // default; opened by the toolbar's Insert-cross-reference button
  // (INSERT_CROSS_REFERENCE_EVENT). The headings snapshot is read off the editor
  // when the picker opens so the list reflects the live document outline.
  // Additive — a document with no cross-references is unaffected whether the
  // picker is open or shut.
  const [crossRefPickerOpen, setCrossRefPickerOpen] = useState(false);
  const crossRefPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [crossRefHeadings, setCrossRefHeadings] = useState<TocHeading[]>([]);
  // Captioned figures/tables offered as cross-reference targets (the picker
  // hides the figure/table tabs when this is empty).
  const [crossRefCaptions, setCrossRefCaptions] = useState<DocCaption[]>([]);
  const [crossRefBookmarks, setCrossRefBookmarks] = useState<
    Array<{ name: string; label: string }>
  >([]);
  const [crossRefNotes, setCrossRefNotes] = useState<
    CrossReferenceNoteTarget[]
  >([]);
  const [crossRefNumberedItems, setCrossRefNumberedItems] = useState<
    NumberedItemTarget[]
  >([]);
  // Mail merge (Word/WPS "邮件合并"). Two surfaces opened by the toolbar:
  //   - the field picker (INSERT_MERGE_FIELD_EVENT): lists the data columns to
  //     drop a «FieldName» placeholder for;
  //   - the recipients dialog (OPEN_MAIL_MERGE_RECIPIENTS_EVENT): paste CSV/TSV,
  //     step through the preview records, run Finish & Merge.
  // The columns + data snapshot are read off the editor when a surface opens so
  // they reflect the live document store. `mergePreviewRecord` is the active
  // 1-based preview index (0 = not previewing); changing it drives the editor's
  // display-only overlay via the setMailMergePreview command. Additive — a
  // document with no merge fields is unaffected whether a surface is open or shut.
  const [mergeFieldPickerOpen, setMergeFieldPickerOpen] = useState(false);
  const mergeFieldPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [mergeRecipientsOpen, setMergeRecipientsOpen] = useState(false);
  const mergeRecipientsReturnFocusRef = useRef<HTMLElement | null>(null);
  const [mergeDialogAction, setMergeDialogAction] =
    useState<MailMergeDialogAction>("recipients");
  const [mergeData, setMergeData] = useState<MailMergeData>({
    columns: [],
    rows: [],
  });
  // "Go to bookmark" panel (Word/WPS "Go To"). The bookmark snapshot is read off
  // the editor when the panel opens so the list reflects the live document.
  // Additive — a document with no bookmarks is unaffected whether the panel is
  // open or shut.
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false);
  // A Delete with Track Changes on that kept an object the revision model
  
  const [trackedObjectDeletionKept, setTrackedObjectDeletionKept] = useState(0);
  const [bookmarkList, setBookmarkList] = useState<
    DocumentBookmarkDialogEntry[]
  >([]);
  // The document attrs the page surface mirrors (page setup, bands, page
  // numbering, watermark, page colour, handwriting, base typography), shared
  // with the print surface (native-document/paged/documentSurfaceAttrs).
  const surfaceAttrs = useDocumentSurfaceAttrState();
  const {
    pageSize,
    pageMargins,
    pageOrientation,
    documentProtection: storedDocumentProtection,
    setEditableRangesInDocument,
    customPageSize,
    customPageMargins,
    columns,
    columnSeparator,
    writingMode,
    manuscriptGrid,
    headerText,
    footerText,
    showPageNumbers,
    differentOddEvenFlag,
    pageNumberFormat,
    pageNumberStart,
    pageNumberStartSection,
    firstPageConfig,
    watermark,
    pictureWatermark,
    inkPaper,
    handwriting,
    rangeExceptionsEditable,
    handwritingCoverRef,
    isHandwriting,
    docDefaultFontFamily,
    docDefaultFontSize,
    docDefaultTextColor,
    docDefaultLineHeight,
    docDefaultTextAlign,
    docDefaultKinsoku,
    docStrictKinsoku,
    docDefaultSpaceBefore,
    docDefaultSpaceAfter,
    docDefaultIndents,
  } = surfaceAttrs;
  // An embedded editor's session may lay Word's Comments, Tracked changes or
  // Filling in forms restriction over the document (never written into it).
  const embedAccess = useEmbedAccess();
  const documentProtection = useMemo(
    () => effectiveDocumentProtection(storedDocumentProtection),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session's access is read by the call
    [storedDocumentProtection, embedAccess],
  );
  // Browser-native spell check (red squiggles). OFF by default — CJK prose
  // under an en spell checker is squiggle soup — and remembered per device.
  const [spellcheckOn, setSpellcheckOn] = useState(false);
  // Word-style inactive selection for the plain text boxes around the
  // document (a chart title, a shape member's words): blur into the ribbon
  // keeps the range visible in gray, blur elsewhere collapses it. The
  // document's own text has `InactiveSelectionHighlight` for the same rule.
  useEffect(() => retainOfficeInactiveSelection(), []);

  useEffect(() => {
    // An ONLYOFFICE config's features.spellcheck (embed) decides it at open,
    // and File > Advanced Settings switches it.
    const fixed = onlyofficeSpellcheckAtOpen();
    if (fixed !== null) setSpellcheckOn(fixed);
    else {
      try {
        setSpellcheckOn(window.localStorage.getItem("mrnote.spellcheck") === "1");
      } catch {
        /* storage unavailable: stay off */
      }
    }
    const follow = (event: Event) => setSpellcheckOn((event as CustomEvent<{ on?: boolean }>).detail?.on === true);
    window.addEventListener(ONLYOFFICE_SPELLCHECK_EVENT, follow);
    return () => window.removeEventListener(ONLYOFFICE_SPELLCHECK_EVENT, follow);
  }, []);

  // AutoCorrect / smart typography while typing (curly quotes, em-dash,
  // ellipsis, ©/™/®, trivial fractions) — Word's "AutoFormat As You Type". ON by
  // default (Word parity) and remembered per device. Read by the AutoCorrect
  // input-rule extension through a ref-backed getter (below) so toggling it does
  // NOT rebuild the editor. Stored as "0" only when explicitly turned off, so a
  // brand-new device (no stored key) gets the on-by-default behavior.
  const [autoCorrectOn, setAutoCorrectOn] = useState(true);
  useEffect(() => {
    try {
      setAutoCorrectOn(
        window.localStorage.getItem("mrnote.autoCorrect") !== "0",
      );
    } catch {
      /* storage unavailable: stay on (Word default) */
    }
  }, []);
  // Editable print-layout pagination. Preferences are document-scoped: the old
  // device-global key both leaked across notebooks and was overwritten by a
  // mount-effect race. A DOCX projection with no explicit preference opens in
  // page view; native notes keep their continuous editing surface.
  const storedPagePreviewPreference = useMemo(
    () => readPagePreviewPreference(pageId),
    [pageId],
  );
  const [pagePreviewOverride, setPagePreviewOverride] = useState<{
    pageId: string;
    enabled: boolean;
  } | null>(null);
  // Paste-options mode (Word/WPS Paste Special): "keep" (default — native paste),
  // "merge" (keep inline emphasis, drop block styling), or "text" (plain text).
  // The toolbar's paste-options dropdown sets it; the paste handler reads the
  // ref (kept in sync) so a normal Ctrl+V honours the chosen mode for ONE paste,
  // then resets to "keep" — matching Word, where Paste Special is a one-shot
  // choice, not a sticky mode. Ctrl+Shift+V (text-only) still works independently.
  const [pasteMode, setPasteMode] =
    useState<PasteFormatMode>(DEFAULT_PASTE_MODE);
  const pasteModeRef = useRef<PasteFormatMode>(DEFAULT_PASTE_MODE);
  useLayoutEffect(() => {
    pasteModeRef.current = pasteMode;
  }, [pasteMode]);
  const editorHydratedRef = useRef(false);
  const latestContentRef = useRef<Record<string, unknown> | null>(null);
  const acknowledgedDocumentBaselineRef =
    useRef<AcknowledgedDocumentBaseline | null>(null);
  const intentionalEmptyOverwriteRef =
    useRef<IntentionalEmptyOverwriteProof | null>(null);
  // Runtime setContent is followed by several doc-attr restore transactions.
  // They are hydration, not user edits; suppress their onUpdate callbacks so a
  // 10k-formula import does not immediately upload/patchback its entire JSON on
  // every open (and sit in "保存中…" for minutes).
  const suppressEditorUpdateRef = useRef(false);
  // Large-document keystroke batching. onUpdate used to run getJSON() +
  // normalizeDocumentForSave() + getText() synchronously on EVERY
  // keystroke — three full-document traversals that froze typing for
  // seconds on formula-dense imports (a 12MB math book projects to 10k+
  // nodes). Above LARGE_DOC_SERIALIZE_NODE_SIZE the serialization is
  // deferred to a trailing-edge timer; readers that need the freshest
  // content synchronously call flushPendingContentSerialize() first.
  const pendingSerializeRef = useRef<(() => void) | null>(null);
  // Interim Safari IME transactions contain the visible pinyin pre-edit, not
  // document content. Keep their latest serialization separate so neither
  // autosave nor an explicit flush can persist it before compositionend.
  const imeSerializeQueueRef = useRef<ReturnType<
    typeof createImeDeferredCommitQueue
  > | null>(null);
  if (imeSerializeQueueRef.current === null) {
    imeSerializeQueueRef.current = createImeDeferredCommitQueue();
  }
  const imeSerializeOwnerRef = useRef<{
    pageId: string;
    editor: Editor;
    view: EditorView;
  } | null>(null);
  const clearImeSerializeQueue = useCallback(() => {
    imeSerializeQueueRef.current?.clear();
    imeSerializeOwnerRef.current = null;
  }, []);
  const settleImeSerializeQueueFor = useCallback(
    (expected: { pageId: string; editor: Editor; view: EditorView }) => {
      const owner = imeSerializeOwnerRef.current;
      if (
        !owner ||
        owner.pageId !== expected.pageId ||
        owner.editor !== expected.editor ||
        owner.view !== expected.view
      ) {
        clearImeSerializeQueue();
        return false;
      }
      const settled = imeSerializeQueueRef.current?.settle() ?? false;
      imeSerializeOwnerRef.current = null;
      return settled;
    },
    [clearImeSerializeQueue],
  );
  const pendingImeSaveWaitRef = useRef<{
    view: EditorView;
    pageId: string;
    promise: Promise<boolean>;
    cancel: () => void;
  } | null>(null);
  const serializeTimerRef = useRef<number | null>(null);
  // While the pen writes, the document is serialised for the save (which
  // reads the page layout) once the writing pauses, not between two strokes
  // (lib/ink-writing-session). A hidden tab, a save and leaving the page
  // still take it at once (flushPendingContentSerialize).
  const inkSerializeGateRef = useRef<InkWritingSaveGate | null>(null);
  if (inkSerializeGateRef.current === null) inkSerializeGateRef.current = createInkWritingSaveGate();
  // A save serialized while the pen writes leaves out the page's pagination
  // records (normalizeDocumentForSave's deferPagination); once the writing
  // has settled, one explicit save of the live document carries them.
  const paginationDeferredRef = useRef(false);
  const paginationSettleTimerRef = useRef<number | null>(null);
  const saveSettledCurrentDocumentRef = useRef<(() => Promise<unknown>) | null>(null);
  // A save the room could not take yet (canonical preparation refused: the
  // room not open, write authority blinking, a bridge issue it recovers from)
  // is made again by itself, ever more slowly, so a Save with AutoSave off
  // is not lost to a moment the room was not ready.
  const settledSaveRetryRef = useRef<{ timer: number | null; tries: number }>({ timer: null, tries: 0 });
  // The settle save in steps (saveSettledPaginationInSteps), and how many
  // times in a row it found the document moved on before it could send.
  const saveSettledPaginationRef = useRef<(() => Promise<boolean | "retry">) | null>(null);
  const paginationSettleRetriesRef = useRef(0);
  const schedulePaginationSettleRef = useRef<() => void>(() => {});
  // And while the keys go, the same serialisation waits for the typing to
  // pause (lib/typing-session): in a long document it landed between two
  // keys and the next key waited a few hundred milliseconds behind it.
  // The save's serialization of the view's document, for a long document's part
  // rooms to read the same document without a second whole-document pass (it was
  // half of the seconds another member waited for a word).
  const documentPartsSerializedRef = useRef<{ doc: unknown; document: Record<string, unknown> } | null>(null);
  const typingSerializeGateRef = useRef<InkWritingSaveGate | null>(null);
  if (typingSerializeGateRef.current === null) typingSerializeGateRef.current = createTypingSaveGate();
  // An open header/footer pane's draft, written to the document on demand
  // (SheetBandEditLayer registers it): a save takes it first.
  const bandDraftFlushRef = useRef<(() => void) | null>(null);
  const registerBandDraftFlush = useCallback((flush: (() => void) | null) => {
    bandDraftFlushRef.current = flush;
  }, []);
  const flushPendingContentSerialize = useCallback(() => {
    if (serializeTimerRef.current !== null) {
      window.clearTimeout(serializeTimerRef.current);
      serializeTimerRef.current = null;
    }
    inkSerializeGateRef.current?.cancel();
    typingSerializeGateRef.current?.cancel();
    const run = pendingSerializeRef.current;
    pendingSerializeRef.current = null;
    run?.();
  }, []);
  const prepareDocumentSave = useCallback((): boolean => {
    bandDraftFlushRef.current?.();
    flushPendingContentSerialize();
    // An IME composition's words reach the collaborative document as they are
    // typed, but its serialization waits for the composition to settle, so
    // the pending draft is behind the shared document until then. While the
    // composition still types, the save waits (a capture now is refused for
    // good: 「保存失败」 after two phrases typed in a row). Once it is over,
    // its settled words are handed over here, even if the settled wake-up's
    // own listener has not run yet.
    const owner = imeSerializeOwnerRef.current;
    if (!owner || owner.pageId !== importPageIdRef.current || owner.view.isDestroyed) return true;
    if (isImeCompositionActive(owner.view)) return false;
    settleImeSerializeQueueFor(owner);
    return true;
  }, [flushPendingContentSerialize, settleImeSerializeQueueFor]);
  useLayoutEffect(
    () => () => {
      // Run before the autosave hook's passive page-change/unmount cleanup.
      // The deferred commit captures the page-specific queueSave callback, so
      // this puts the final keystrokes into the OLD page's pending draft while
      // its autosave effect can still flush that draft. Waiting for a passive
      // effect here lets the hook reset its shared refs first and can either
      // lose the edit or queue it against the next page. An open header or
      // footer draft is written into the document first.
      bandDraftFlushRef.current?.();
      flushPendingContentSerialize();
      const owner = imeSerializeOwnerRef.current;
      if (owner?.pageId === pageId) {
        if (
          owner.view.isDestroyed ||
          owner.view.composing ||
          (owner.editor as Editor & { view?: EditorView }).view !== owner.view
        ) {
          // A live native composition still exposes pre-edit pinyin. Losing an
          // unfinished candidate on navigation is safer than crossing pages or
          // persisting that transient DOM state.
          clearImeSerializeQueue();
        } else {
          // compositionend has committed the candidate, but Safari may still
          // be inside the 40ms redraw grace. Settle while the departing page
          // still owns this editor/view; the autosave hook's passive cleanup
          // then persists and PATCHes that page-specific queued draft.
          settleImeSerializeQueueFor(owner);
        }
      }
    },
    [
      clearImeSerializeQueue,
      flushPendingContentSerialize,
      pageId,
      settleImeSerializeQueueFor,
    ],
  );
  const guestInitializedRef = useRef(false);
  const guestContentRevisionRef = useRef<string | undefined>(undefined);
  const loadedPageIdRef = useRef<string | null>(null);
  // Tracks the autosave reload generation this editor last hydrated from, so an
  // out-of-band server change (e.g. the user confirming an AI proposal that
  // rewrites THIS page) re-applies the new body — a normal save does NOT bump
  // the nonce, so typing never resets the editor.
  const hydratedReloadNonceRef = useRef(-1);
  const hydrationGenerationRef = useRef(0);
  const hydrationApplyAttemptsRef = useRef<HydrationApplyAttemptState | null>(
    null,
  );
  const hydrationOwnerRef = useRef<{
    pageId: string;
    reloadNonce: number;
    editor: MaybeNoteEditor;
  } | null>(null);
  const hydratedBindingRef = useRef<{
    editor: MaybeNoteEditor;
    session: CollabSession | null;
  } | null>(null);
  const hydratedObserverProjectionRef = useRef<Record<string, unknown> | null>(
    null,
  );
  const titleRef = useRef("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const editorPasteHandlerRef = useRef<
    ((view: EditorView, event: ClipboardEvent) => boolean) | null
  >(null);
  // Armed by the Ctrl/⌘+Shift+V chord just before the next paste: makes that one
  // paste strip all marks (Word/WPS "Keep Text Only"). Cleared after it is
  // consumed (or shortly after, if no native paste event ever fires).
  const plainPasteArmedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const physicalPageAnchorFrameRef = useRef(0);
  const pendingSinglePageAnchorRef =
    useRef<PhysicalPageViewportAnchor<HTMLElement> | null>(null);
  const pendingDocumentViewAnchorRef =
    useRef<PhysicalPageViewportAnchor<HTMLElement> | null>(null);
  const pendingPrintFitRef = useRef<{
    mode: PhysicalPageFitMode;
    anchor: PhysicalPageViewportAnchor<HTMLElement>;
  } | null>(null);
  const exitMultiplePagesViewRef = useRef<() => void>(() => undefined);
  const exitDocumentProjectionViewRef = useRef<() => void>(() => undefined);

  // ── ZOOM (status-bar control + Ctrl/Cmd+scroll) ──────────────────────────
  // Component-local state: 1.0 = 100% default, manual range 0.5–2.0, step
  // 0.1. Multiple Pages may temporarily fit below 50%; the first manual
  // +/-/pinch action exits that view and returns to the manual bounds.
  // NOT persisted (per-window view pref that resets on close — document zoom
  // is a rare operation; persisting across sessions would be surprising).
  // An embedded editor's integration may name the zoom it opens at (lib/embed/onlyoffice-frame).
  const initialDocZoom = clampZoom(initialZoom ?? onlyofficeInitialZoom() ?? EDITOR_ZOOM_DEFAULT);
  const lastManualDocZoomRef = useRef(initialDocZoom);
  const [docZoom, setDocZoom] = useState<number>(initialDocZoom);
  const onGuestZoomChangeRef = useRef(onGuestZoomChange);
  onGuestZoomChangeRef.current = onGuestZoomChange;
  useEffect(() => {
    if (guestMode) onGuestZoomChangeRef.current?.(docZoom);
  }, [docZoom, guestMode]);
  const onGuestDocumentChangeRef = useRef(onGuestDocumentChange);
  onGuestDocumentChangeRef.current = onGuestDocumentChange;
  const guestUserHasActedRef = useRef(guestUserHasActed);
  guestUserHasActedRef.current = guestUserHasActed;
  /** The document the visitor's first edit started from (guest observers). */
  const guestEditBeforeRef = useRef<ProseMirrorNode | null>(null);
  const guestEditBaseRef = useRef<Record<string, unknown> | null>(null);
  const [docPageViewMode, setDocPageViewMode] =
    useState<DocumentPageViewMode>("single");
  // An ONLYOFFICE mobile config opens reflowed (its Mobile view, standardView
  // false): Web Layout, a view never saved.
  const [documentLayoutViewMode, setDocumentLayoutViewMode] =
    useState<DocumentLayoutViewMode>(() => (onlyofficeOpensReflowed() ? "web" : "print"));
  const [documentSplitViewActive, setDocumentSplitViewActive] = useState(false);
  // Word for the web Reading View: the same document held read-only for this
  // session until the reader returns to Editing View. Session-only; never
  // serialized, never a document attribute.
  const [readingViewActive, setReadingViewActive] = useState(false);
  const zoomIn = useCallback(() => {
    exitDocumentProjectionViewRef.current();
    exitMultiplePagesViewRef.current();
    setDocZoom((z) => {
      const next = clampZoom(z + EDITOR_ZOOM_STEP);
      lastManualDocZoomRef.current = next;
      return next;
    });
  }, []);
  const zoomOut = useCallback(() => {
    exitDocumentProjectionViewRef.current();
    exitMultiplePagesViewRef.current();
    setDocZoom((z) => {
      const next = clampZoom(z - EDITOR_ZOOM_STEP);
      lastManualDocZoomRef.current = next;
      return next;
    });
  }, []);
  const zoomReset = useCallback(() => {
    exitDocumentProjectionViewRef.current();
    exitMultiplePagesViewRef.current();
    lastManualDocZoomRef.current = initialDocZoom;
    setDocZoom(initialDocZoom);
  }, [initialDocZoom]);
  // The status bar's continuous zoom dial: a manual zoom, as +/- and pinch.
  const zoomTo = useCallback((level: number) => {
    exitDocumentProjectionViewRef.current();
    exitMultiplePagesViewRef.current();
    const next = clampZoom(level);
    lastManualDocZoomRef.current = next;
    setDocZoom(next);
  }, []);

  
  // `pageBlock+`, hydration ALWAYS wraps flat storage into sheets, and the
  // painted seam/sheet-stack fallback pipeline is gone — every document is
  // sheeted, unconditionally. (The old `docSheeted` state and the painted
  // 打印预览 sheet stack died with the pageless mode.)

  const commandBus = useMemo(() => createNativeDocumentCommandBus(), []);
  const documentEditUndoSnapshotsRef = useRef(
    new Map<string, { content: JSONContent }>(),
  );

  const [nativeSavePageId, setNativeSavePageId] = useState<string | null>(null);
  const acceptNativeSaveSource = useCallback((page: PageItem, source?: AutosavedPageLoadSource) => {
    if (page.id !== pageId) return;
    const authority = page.source_projection_authority;
    const nativeSource = source !== "local-preview" && page.page_type === "document" &&
      authority?.document_type === "docx_projection" &&
      Boolean(authority.document_id && authority.workspace_id && authority.conversion_key &&
        authority.source_resource_id && authority.source_resource_version_id);
    setNativeSavePageId(nativeSource ? page.id : null);
  }, [pageId]);
  const canonicalWriteAuthorityRef = useRef(false);
  const canonicalUnboundDraftRef = useRef<() => boolean>(() => false);
  // A nearly full page being held as parts (see pageSplitAskedRef): input
  // pauses once the split is done, until the page is read again as parts.
  // Not while it is asked: a key typed then is refused by the retired room
  // and kept for the parts (keepDocumentForParts), and pausing for every ask
  // left the surface dead for each deferred one (seconds on a long book,
  
  const [pageSplitting, setPageSplitting] = useState(false);
  const canonicalSetAsideDraftRef = useRef<(base: PageContentDocument | null) => boolean>(() => false);
  // Edits the model set aside to bind anew (NativePageCausalHost.setAsideUnboundDraft):
  // merged back into the page as new edits once it is ready.
  const [setAsideDraft, setSetAsideDraft] = useState<SetAsideDocumentDraft | null>(null);
  const setAsideDraftRef = useRef<SetAsideDocumentDraft | null>(null);
  // A whole-document draft merged into this page's view, whether the page is
  // one room (the canonical bridge) or held as parts (adoptDraftIntoParts);
  // false until it can be (set below, once the parts view is known).
  const adoptKeptDocumentRef = useRef<(content: unknown, sameBase: boolean, base?: unknown,
    options?: { baseOnlyIfHeld?: boolean; fallbackBaseContent?: unknown; partialView?: boolean }) => boolean>(() => false);
  // This view's unsaved edits, kept aside as the page is read again held as
  // parts (set below; see keepDocumentForParts).
  const keepDocumentForPartsRef = useRef<(force: boolean) => boolean>(() => false);
  // The page whose whole view's edits were kept so (a draft of that view's
  // refused save is among them).
  const keptForPartsPageRef = useRef<string | null>(null);
  // From the moment those edits are taken until the parts view has its caret,
  // what is typed is held (lib/editor/held-keys holdKeysThroughHandover) and
  // typed there at the same place (set below; see armDocumentHandover).
  const armDocumentHandoverRef = useRef<() => void>(() => undefined);
  const releaseDocumentHandoverRef = useRef<() => void>(() => undefined);
  // A whole view's handover that ends in a whole view (set below).
  const settleWholeViewHandoverRef = useRef<() => void>(() => undefined);
  // The keys held kept past the tab, and those a closed tab left typed here
  // (autorecover-store noteAutoRecoverHandoverKeys; set below).
  const persistDocumentHandoverKeysRef = useRef<() => void>(() => undefined);
  const recoverDocumentHandoverKeysRef = useRef<(tries?: number) => Promise<void>>(async () => undefined);
  const recoveringHandoverKeysRef = useRef(false);
  const canonicalViewMirrorsRoomRef = useRef<() => boolean>(() => false);
  // Why the last canonicalViewMirrorsRoomRef() said no (save diagnostics).
  const canonicalViewMirrorRefusalRef = useRef<string | null>(null);
  const legacyAdmissionsRef = useRef<CollabSession[]>([]);
  // The paged bridge's issue, if it has one: while it does, it does not
  // apply what the room delivers, and a save made through the room is read.
  const pagedBridgeIssueRef = useRef<PagedDocumentBridgeIssue | null>(null);
  const causalViewAuthority = useMemo(() => ({
    canWrite: () => canonicalWriteAuthorityRef.current,
    hasUnboundDraft: () => canonicalUnboundDraftRef.current(),
    setAsideUnboundDraft: (base: PageContentDocument | null) => canonicalSetAsideDraftRef.current(base),
    retireLegacyAdmission: () => {
      for (const session of legacyAdmissionsRef.current) session.provider?.destroy();
    },
    roomContentApplied: () => pagedBridgeIssueRef.current === null,
    viewMirrorsRoom: () => canonicalViewMirrorsRoomRef.current(),
    viewMirrorRefusal: () => canonicalViewMirrorRefusalRef.current,
  }), []);
  const principalScope = guestMode ? null : captureSavedPageHotCacheScope();
  // Whether the write hold below reads the model's revision (set where the
  // hold is computed): while it does not, a republish that changes nothing
  // but the revision (every keystroke) does not render the editor again.
  const causalRevisionMattersRef = useRef(true);
  // A Word document held as parts (A2, lib/document-page-parts) holds the
  // parts it has loaded as one document, saved part by part: neither the
  // page's room nor its causal model takes part in it (each part's body is
  // saved on its own). Known from the page read; remembered for the next
  // opening of the same page in this tab. A first opening knows it from the
  // read prefetched for this editor when that has answered by its first
  // render (the read this editor takes): seen as an ordinary page until its
  // page was in, it built the editor three times (a room session for an
  // ordinary page, then none), each with every plugin view.
  const [documentPartsPage, setDocumentPartsPage] = useState(() => {
    if (knownDocumentPartsPage(pageId)) return true;
    const prefetched = pageId ? settledEditorPageRead(pageId) : null;
    return Boolean(prefetched && documentPartsCount(prefetched.content_json) > 1);
  });
  const layoutSnapshotsAskedFor = useRef<string | null>(null);
  // The rows a long document may open on are asked for beside the page
  // itself: asked once its content was in, they missed the opening's hold on
  // a busy machine and the book's body was laid out cold (layoutSnapshot).
  useEffect(() => {
    if (pageId && layoutSnapshotsEnabled()) void preloadLayoutSnapshots(pageId);
  }, [pageId]);
  // The page saves a parts document's body (the draft's first part,
  // `useDocumentPageParts` below); its later parts are saved on their own.
  const documentPartsPublishRef = useRef<(() => void) | null>(null);
  const documentPartsPrepareRef = useRef<((content: Record<string, unknown>) => Record<string, unknown> | null | undefined) | null>(null);
  // A draft the parts could not take yet (prepareContent: not yet) is saved
  // again a moment later, from the view as it is then (set below).
  const documentPartsSaveLaterRef = useRef<() => void>(() => undefined);
  // The page's title as saved: a draft whose body the room holds sends only a
  // title that changed.
  const documentPartsSavedTitleRef = useRef<string | null>(null);
  // The page's body as last read or saved (set below, with the title).
  const documentPartsStoredBodyRef = useRef<unknown>(null);
  const documentPartsCutSaidMeantRef = useRef<() => boolean>(() => false);
  const prepareDocumentPartsDraft = useCallback((draft: PageDocumentDraft): PageDocumentDraft => {
    const prepare = documentPartsPrepareRef.current;
    const content = draft.content_json;
    if (!content || typeof content !== "object") return draft;
    if (!prepare) {
      if (documentPartsCount(documentPartsStoredBodyRef.current) < 2) return draft;
      // The page is held as parts and this view is not (yet) its parts view:
      
      // load saved the placeholder it held before the page was in it as the
      // body of three long documents, 1,109 blocks each to one). Its edits, if
      // any, are kept for the parts view (keepDocumentForParts); nothing of
      // its body is sent.
      const { content_json: _body, allow_empty_content_overwrite: _allow,
        intentional_empty_content_overwrite: _proof, large_removal: _cut, ...rest } = draft;
      void _body; void _allow; void _proof; void _cut;
      return typeof rest.title === "string" && rest.title !== documentPartsSavedTitleRef.current
        ? { title: rest.title } : {};
    }
    const prepared = prepare(content as Record<string, unknown>);
    if (prepared === undefined) {
      documentPartsSaveLaterRef.current();
      return {};
    }
    if (prepared === null) {
      // The body's room holds it (and saves it): the page's save has nothing
      // of the body to send, and must send nothing: the stored body it knows
      // is behind the room's saves.
      return typeof draft.title === "string" && draft.title !== documentPartsSavedTitleRef.current
        ? { title: draft.title } : {};
    }
    // A body cut to under half is said meant (the server refuses one said by
    // no one): only this view, holding the body, says it.
    const { large_removal: _earlier, ...rest } = draft;
    void _earlier;
    return { ...rest, content_json: prepared as PageDocumentDraft["content_json"],
      ...(documentPartsCutSaidMeantRef.current() &&
        documentBodyCutNeedsSaying(documentPartsStoredBodyRef.current, prepared) ? { large_removal: true } : {}) };
  }, []);
  const documentCausalModel = useDocumentCausalModel({
    enabled: USE_COLLAB_EDITING && !guestMode && !documentPartsPage,
    pageId,
    principalScope: principalScope?.principal
      ? JSON.stringify([workspaceId, principalScope.principal, principalScope.sessionEpoch]) : null,
    authority: causalViewAuthority,
    revisionMatters: () => causalRevisionMattersRef.current,
  });
  const canonicalReady = documentCausalModel?.model.ready === true;

  // The run that is writing this page owns it until it publishes: the window
  // shows the document filling in and refuses input meanwhile. Both facts come
  // from the same live store the window shell already reads. A window that
  // opened on a live AI draft stays out of the collaboration room for the
  // rest of this opening, even once the draft is the member's: joining
  // mid-read rebuilds the session and the editor, and the reader is thrown
  // back to the top. The draft is a private page; saves still go through the
  // ordinary versioned autosave, and the next opening joins.
  const {
    runOwned: runOwnedDraft,
    stayLocal: stayLocalAfterAgentDraft,
    // Live, or settled a moment ago: the body follows the run's saves in place.
    following: agentDraftFollowing,
  } = useAgentDraftOpening(pageId);
  // Read by the hydration task, which must not re-run when the draft settles.
  const agentDraftFollowingRef = useRef(agentDraftFollowing);
  useLayoutEffect(() => {
    agentDraftFollowingRef.current = agentDraftFollowing;
  }, [agentDraftFollowing]);

  // The live document in its save form, for proving a collaborator's saved
  // version against states this view reached without queueing a draft.
  const saveBaseEditorRef = useRef<{ state?: { doc?: { toJSON(): unknown } } } | null>(null);
  const saveBaseNormalizeRef = useRef<((json: unknown) => Record<string, unknown> | null) | null>(null);
  const readLiveDocumentForSaveBase = useCallback(() => {
    const doc = saveBaseEditorRef.current?.state?.doc;
    // What a block unchanged since the last reading already is, kept with it:
    // read from `toJSON` it was all new, a whole document's text again each time.
    return doc ? saveBaseNormalizeRef.current?.(runtimeDocumentJson(doc as ProseMirrorNode)) ?? null : null;
  }, []);
  // A whole view's save refused because the page is no longer one room (set
  // below, after the handover it starts).
  const onDocumentSaveRefusedRef = useRef<(error: ApiRequestError) => boolean>(() => false);
  const onDocumentSaveRefused = useCallback((error: ApiRequestError) => onDocumentSaveRefusedRef.current(error), []);
  const autosave = useAutosavedPageDocument({
    // Docs' save serialises the document and reads its layout: it waits for
    // a pause in the typing rather than landing between two keys.
    holdWhileTyping: true,
    pageId,
    enabled: !guestMode,
    // The wait is the typing gate's (no key for 800 ms, lib/typing-session)
    // and the large-document serialisation's (300 ms, then the work); this
    // delay only follows the serialisation, and the gate holds it until the
    // typing has paused. At 1.5 s the save left ~2.8 s after the last key on
    
    
    debounceMs: 200,
    // Match the existing native PPTX/XLSX request deadline. A DOCX save can
    // still be rewriting/reimporting its package at 20 seconds; aborting then
    // leaves the next draft on a stale CAS version after the server commits.
    saveTimeoutMs: nativeSavePageId === pageId ? 120_000 : 20_000,
    // Larger documents serialize on a trailing timer; every save first takes
    // that pending serialization, or it would submit the content of an older
    // keystroke while the live document (already in the room) has moved on.
    prepareSave: prepareDocumentSave,
    onLoaded: acceptNativeSaveSource,
    nativeCollaboration: documentCausalModel?.lease.adapter,
    // A reopened document is drawn from the copy this browser kept (read-only)
    // while the server is read, instead of "Preparing document..." until then.
    causalPreview: true,
    collabJson: false,
    reconcileIdenticalServerDraft: USE_COLLAB_EDITING && !guestMode,
    
    // again when the user edits past it, and by itself, ever more slowly.
    resumeRefusedSaveOnEdit: true,
    retryRefusedSaves: true,
    // Docs' own AutoSave switch: one turned off in another editor does not
    // stop a Docs page saving.
    autosaveScope: DOCS_AUTOSAVE_SCOPE,
    // Legacy page room (no causal checkpoint): adopt a collaborator's save
    // as this view's base once the room has provably delivered its body.
    // (A long document is in no page room, and its body room's saves are not
    // a collaborator's to catch up with.)
    legacyRoomSaveFollower: USE_COLLAB_EDITING && !guestMode && !documentPartsPage,
    legacyRoomLiveContent: readLiveDocumentForSaveBase,
    // Section saves land straight on the page, so follow them outright,
    // including the run's last save that lands as the draft settles.
    followsRemoteContent: agentDraftFollowing,
    prepareDraft: prepareDocumentPartsDraft,
    onSaveRefused: onDocumentSaveRefused,
  });
  // Edits this tab kept but could not apply on reload (blocked recovery):
  // offered as a new page beside this one, the page itself untouched.
  const [unsentDraftCopy, setUnsentDraftCopy] = useState<{ title: string } | null>(null);
  const [unsentDraftFailed, setUnsentDraftFailed] = useState(false);
  const [unsentDraftSaving, setUnsentDraftSaving] = useState(false);
  const saveUnsentDraftAsCopy = useCallback(async () => {
    if (!autosave.saveBlockedRecoveryAsCopy) return;
    setUnsentDraftSaving(true);
    setUnsentDraftFailed(false);
    try {
      const copy = await autosave.saveBlockedRecoveryAsCopy();
      if (copy) setUnsentDraftCopy({ title: copy.title || "" });
      else setUnsentDraftFailed(true);
    } catch {
      setUnsentDraftFailed(true);
    } finally {
      setUnsentDraftSaving(false);
    }
  }, [autosave]);
  // A reload mid-draft has no run surface to learn this from, and in some
  // failure modes never gets one. The page read carries the same fact, so the
  // load path seeds the same store the live run publishes to; a later read
  // saying published or discarded hands the page back.
  useAgentDraftPageReadSync(pageId, autosave.page?.agent_draft);
  // A document a run just published reports its own readback verdict; the
  // ribbon shows it beside the save state and follows it until it settles.
  const publishedReadback = useDocxPublishedReadback(
    pageId,
    autosave.page?.docx_published_readback,
  );
  
  
  // recheck asking to check before editing. Followed while the recheck runs.
  const exportFidelity = useDocsExportFidelity(
    pageId,
    autosave.page?.export_fidelity,
  );
  const docsChecks = useMemo(
    () => docsPublicationState(exportFidelity),
    [exportFidelity],
  );
  // A document handed over without its export check, and a page an AI task
  // left after stopping part-way, each say so beside the save state.
  const exportFidelityUnverified = docsChecks.unverified;
  const keptDraft =
    autosave.page?.agent_draft?.state === "kept" ? autosave.page.agent_draft : null;
  const stoppedAfterSection =
    typeof keptDraft?.stopped_after_section === "number" &&
    keptDraft.stopped_after_section > 0
      ? keptDraft.stopped_after_section
      : null;
  // Only someone who may write upgrades a page's room (the server says who
  // with page_causal_can_activate). A reader of a page no writer has opened
  // since the upgrade became available waits for nothing: it shows the saved
  // body read-only and observes the room as a reader always has, and the
  // checkpoint a writer's upgrade adds arrives with the next page read.
  // Waiting here left that reader on "Preparing document..." for good.
  const loadedDocumentPartsPage = autosave.page?.id === pageId &&
    documentPartsCount(autosave.page?.content_json) > 1;
  useLayoutEffect(() => {
    if (autosave.page?.id !== pageId) return;
    // The page this whole view shows is held as parts now (split under it,
    // by this tab or another): before the view becomes a parts view, its
    // unsaved edits are kept aside, to be merged into the parts and saved.
    // Read again as parts, the edits were otherwise gone (the page room they
    // were typed into is retired; its saves are refused).
    if (loadedDocumentPartsPage && !documentPartsPage && !hydratedAsPartsRef.current) {
      armDocumentHandoverRef.current();
      keepDocumentForPartsRef.current(false);
    }
    rememberDocumentPartsPage(pageId, loadedDocumentPartsPage);
    setDocumentPartsPage(loadedDocumentPartsPage);
  }, [autosave.page?.id, loadedDocumentPartsPage, pageId]); // eslint-disable-line react-hooks/exhaustive-deps -- documentPartsPage is what this sets
  // A save past what one page holds is stored as parts by the server, with
  // its edits (update_page: _hold_oversized_document_save_as_parts): the page
  // the save answers with is a long document. Everything is saved, so it
  // opens again as one, edited part by part from then on.
  const savedAsPartsRef = useRef<string | null>(null);
  /** The body this editor last hydrated was held as parts. */
  const hydratedAsPartsRef = useRef(false);
  /**
   * A document held as parts saves no whole-document layout records: its
   * parts and its body leave them out (document-page-parts
   * PRIVATE_LAYOUT_ATTRS, "the whole loaded document, never the body
   * alone"). Its serializations after a pause in typing (the commit, the
   * unsaved copy) still read the page's cuts and digested the whole
   * document's layout key, each time, for records thrown away: R286 (124
   * pages, 5 parts), 0.9 s of the 1.25 s task each pause took.
   * `window.__docsPartsCommitLayoutRecords = true`: read and digested as
   * before.
   */
  const partsSaveNoLayoutRecords = useCallback(() => {
    if (!(documentPartsPageRef.current || hydratedAsPartsRef.current)) return false;
    return (window as Window & { __docsPartsCommitLayoutRecords?: boolean }).__docsPartsCommitLayoutRecords !== true;
  }, []);
  const savedAnswerParts = documentPartsCount(autosave.lastSaveAcknowledgement?.page?.content_json) > 1;
  useEffect(() => {
    // (Only a page the editor did not open as parts: on one it did, the first save
    // reloaded the whole window, the member's caret, Undo and whatever they had
    // typed since with it. documentPartsPage cannot say: the same answer sets it.)
    if (!savedAnswerParts || hydratedAsPartsRef.current || !pageId || savedAsPartsRef.current === pageId) return;
    if (autosave.lastSaveAcknowledgement?.page?.id !== pageId) return;
    // Typing since that save is waited for -- unless its save was refused,
    // as a whole-page save of a page now held as parts is.
    if (autosave.isDirty && autosave.getLastSaveFailureCode?.() !== "page_read_only") return;
    savedAsPartsRef.current = pageId;
    // Typing after that save (refused now) is kept and merged into the parts,
    // and what is typed from now on is held for the parts view.
    armDocumentHandoverRef.current();
    keepDocumentForPartsRef.current(true);
    rememberDocumentPartsPage(pageId, true);
    void (traceDocsHandover({ step: "discard-reload", why: "saved-as-parts" }), autosave.discardLocalAndReload());
  }, [savedAnswerParts, pageId, autosave.isDirty, autosave.saveStatus]); // eslint-disable-line react-hooks/exhaustive-deps -- once per page
  const awaitsWriterUpgrade = !documentPartsPage && Boolean(autosave.page && !autosave.page.page_causal_checkpoint &&
    autosave.page.page_causal_activation_available && autosave.page.page_causal_can_activate !== true);
  // A writer whose upgrade is refused because an older window holds the
  // page's room (the server names who): the saved page, read-only, until the
  // upgrade lands -- as Word opens a file another program has locked, with
  // who holds it -- instead of "Preparing document..." for as long as that
  
  // closed meanwhile: joined, it would hold the room against its own retry.
  const upgradeHeldBy = !documentPartsPage && !canonicalReady && autosave.page && !autosave.page.page_causal_checkpoint
    ? autosave.causalUpgradeHeldBy ?? null : null;
  const canonicalPreparing = !documentPartsPage && !canonicalReady && !awaitsWriterUpgrade && upgradeHeldBy === null && Boolean(documentCausalModel?.model.active ||
    autosave.page?.page_causal_checkpoint || autosave.page?.page_causal_activation_available);
  // A model that failed to prepare (its checkpoint refused, the room's
  // originals unreadable) holds the page's opening until a new read of the
  // page prepares it again: said, with Retry, instead of "Preparing
  
  // browser refused stayed on the loading card; nothing was reported).
  const canonicalFailure = canonicalPreparing ? documentCausalModel?.model.failure ?? null : null;
  useEffect(() => {
    if (!canonicalFailure) return;
    reportClientError(
      Object.assign(new Error(`docs_causal_model_failed:${canonicalFailure.slice(0, 120)}`), { name: "DocsCausalModelFailed" }),
      { source: "window", windowType: "document" },
    );
  }, [canonicalFailure]);
  const lifecycleAuthorityRef = useRef({ page: autosave.page, pending: true });
  useLayoutEffect(() => {
    lifecycleAuthorityRef.current = {
      page: autosave.page,
      pending: Boolean(autosave.loading || autosave.isCachedPreview ||
        autosave.isLocalAuthorityPending || autosave.isDirty || autosave.isSaving),
    };
  }, [autosave.page, autosave.loading, autosave.isCachedPreview,
    autosave.isLocalAuthorityPending, autosave.isDirty, autosave.isSaving]);

  // Depend on the hook's activation-bound methods, not its freshly assembled
  // result object. Otherwise every pagination render recreates all toolbar
  // save/import callbacks and defeats the Ribbon's memo boundary.
  const {
    saveNow: savePageNow,
    reload: reloadPage,
    replacePendingDraft: replacePagePendingDraft,
    getLastSaveFailureCode,
    readSettledSave,
  } = autosave;
  const oversizedImport = useMemo(
    () => readOversizedImportPreview(autosave.page?.content_json ?? null),
    [autosave.page],
  );
  const [documentPartsBlocked, setDocumentPartsBlocked] = useState(false);
  // A later part still being saved keeps the page "saving" (the page's own
  // save may be done): the status, and the window's close guard, say so.
  const [documentPartsSaving, setDocumentPartsSaving] = useState(false);
  const [hydrationCount, setHydrationCount] = useState(0);
  // Bumped as each hydration's content goes in, before the count is: what the
  // editor holds now (useDocumentPageParts hydrationToken).
  const hydrationAppliedRef = useRef(0);
  const hydrationCountRef = useRef(hydrationCount);
  hydrationCountRef.current = hydrationCount;
  // Shares page-writable's one cached poll with autosave; this second consumer
  // adds no request and exposes the `known` transition the socket lifecycle
  // needs without widening the autosave hook's public return contract.
  const pageWritable = usePageWritable(pageId, !guestMode);
  // The editing surface keeps the verdict the server last gave through a
  // TRANSIENT refresh failure (timeout, 5xx, aborted poll): page-writable then
  // reports `known:false` with the previous verdict, and a slow server turned
  // the open document read-only for seconds mid-sentence -- the editor lost
  // focus and the keys typed meanwhile and afterwards went nowhere (measured:
  
  // through a lost connection; here input stays in the editor/Y.Doc, and
  // autosave already holds every PATCH until a fresh verdict arrives. Only a
  // verdict the server actually gave (read-only tier, role, another member's
  // checkout) makes the surface read-only. The first verdict of an opening is
  // still awaited, and saves keep reading `pageWritable` itself.
  const [lastVerifiedPageWritable, setLastVerifiedPageWritable] = useState<{
    pageId: string;
    writable: PageWritableVerdict;
  } | null>(null);
  useEffect(() => {
    if (!pageWritable.known) return;
    const { writable, reason, lockedByName } = pageWritable;
    setLastVerifiedPageWritable((current) =>
      current?.pageId === pageId &&
      current.writable.writable === writable &&
      current.writable.reason === reason &&
      current.writable.lockedByName === lockedByName
        ? current
        : { pageId, writable: { writable, reason, lockedByName, known: true } });
  }, [pageId, pageWritable, pageWritable.known, pageWritable.writable,
    pageWritable.reason, pageWritable.lockedByName]);
  const editingPageWritable: PageWritableVerdict = pageWritable.known
    ? pageWritable
    : lastVerifiedPageWritable?.pageId === pageId
      ? lastVerifiedPageWritable.writable
      : pageWritable;
  const pageCollabBinding = useLastVerifiedPageCollabBinding(
    pageId,
    !guestMode,
  );

  // ---- Collaborative editing foundation (FLAG-GATED, default OFF) ----------
  // When USE_COLLAB_EDITING is OFF this whole block is inert: no session is
  // created, no collab extensions are loaded, and the editor uses its existing
  // history/content path unchanged. When ON, a per-page Yjs session is created
  // (local-only unless a room+URL is configured) and its Y.Doc/awareness drive
  // the Collaboration + CollaborationCaret extensions + remote presence list.
  const collabUserName = guestMode ? t("collab.guestUser") : t("collab.you");
  // Tracked changes carry the name of who made them, as in Word.
  const revisionIdentity = useSelfCollabIdentity();
  useEffect(() => {
    setRevisionAuthorName(guestMode ? null : revisionIdentity.name || null);
  }, [guestMode, revisionIdentity.name]);
  // An ACL viewer cannot safely hydrate durable JSON into an empty network
  // Y.Doc: the relay refuses that seed, then a writer's independent seed would
  // merge as a duplicate. Stay local until authority is known, keep ACL
  // viewers local, and use a fresh network Y.Doc after a grant. An exclusive
  // checkout keeps the observer in the live room once its verdict is known.
  const collabAclReadOnly = pageCollabBinding === "observer";
  const collaborationEnabled = shouldUseGuestBandEditingCollaboration(
    USE_COLLAB_EDITING,
    guestMode,
    enableGuestBandEditing,
  ) && !documentPartsPage;
  const collabLocalOnly =
    guestMode ||
    autosave.isLocalAuthorityPending ||
    pageCollabBinding !== "participant" ||
    // An AI run writes this page straight to the server, never through a
    // room. A window that joined the room seeded it with the first (empty)
    // body and then adopted that room over every later save, so the member
    // watched a blank page while the run wrote it. Until the draft is theirs
    // the window follows the saved page alone (and, see above, for the rest
    // of the opening that began on the draft).
    runOwnedDraft ||
    stayLocalAfterAgentDraft;
  const collabProjectionSession = useCommittedCollabSession({
    enabled: collaborationEnabled && !canonicalReady,
    docId: pageId,
    userName: collabUserName,
    localOnly: collabLocalOnly,
    suspendProvider: canonicalPreparing || upgradeHeldBy !== null,
  });

  // A read-only member still needs live CRDT updates. Observe the room through
  // a separate, never-hydrated Y.Doc while the editor displays a local
  // projection. Never bind the room document to the paginated read-only view:
  // its permitted delete/insert layout transactions would create private Yjs
  // structs which later merge as a second copy of the writer's page suffix.
  const collabObserverSession = useCommittedCollabSession({
    enabled:
      collaborationEnabled && !canonicalReady &&
      collabAclReadOnly &&
      !autosave.isLocalAuthorityPending,
    docId: pageId,
    userName: collabUserName,
    localOnly: false,
    suspendProvider: canonicalPreparing,
  });
  const [collabObservedProjection, setCollabObservedProjection] = useState<{
    session: CollabSession;
    content: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    const observer = collabObserverSession;
    if (!observer) return;
    // This view reads either room shape; say so, so writers may upgrade an
    // older physical room while it watches.
    if (USE_LEGACY_ROOM_LOGICAL_BINDING) {
      observer.awareness.setLocalStateField(LEGACY_ROOM_MODEL_FIELD, LEGACY_ROOM_LOGICAL_MODEL);
    }
    return observeReadonlyDocumentProjection(observer, (content) => {
      setCollabObservedProjection({ session: observer, content });
    });
  }, [collabObserverSession]);

  useLayoutEffect(() => {
    legacyAdmissionsRef.current = [collabProjectionSession, collabObserverSession]
      .filter((session): session is CollabSession => session !== null);
  }, [collabProjectionSession, collabObserverSession]);
  const collabSession = canonicalReady
    ? documentCausalModel.model.session : collabProjectionSession;
  const observerProjection =
    collabObserverSession &&
    collabObservedProjection?.session === collabObserverSession
      ? collabObservedProjection.content
      : null;
  const collabPresenceSession = collabObserverSession ?? collabSession;

  const [collabAuthorizationSnapshot, setCollabAuthorizationSnapshot] =
    useState<{
      session: CollabSession;
      writable: boolean;
    } | null>(null);

  useEffect(() => {
    const subscribe = collabSession?.provider?.subscribeWritable;
    if (!collabSession || !subscribe) return;
    return subscribe((writable) => {
      setCollabAuthorizationSnapshot({ session: collabSession, writable });
    });
  }, [collabSession]);

  // The canonical verdict below reads the provider's live connected/ready
  // fields, which change without any React state. Re-render on those
  // transitions: otherwise the surface noticed the room coming up only when
  // some unrelated render happened to follow it. Once the pagination settle
  // stopped dispatching transactions while the room connected, nothing did,
  // and the page stayed read-only after the room was live.
  const [, setCollabNetworkRevision] = useState(0);
  useEffect(() => {
    const network = collabSession?.network;
    if (!network) return;
    let active = true;
    const refresh = () => {
      if (active) setCollabNetworkRevision((value) => value + 1);
    };
    // Test doubles and older transports may not implement every channel.
    const unsubscribe = network.subscribeConnection?.(refresh);
    void network.whenReady?.then(refresh, refresh);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [collabSession]);

  // The room said its session changed (a causal epoch gone: 4409, then the
  // ticket refused as stale). When that is because the page is held as parts
  // now (split by another tab), the page is read again as parts, this view's
  // unsaved edits kept and merged into them (keepDocumentForParts). Without
  // this a tab whose keys the retired room refused sat read-only on the
  
  const collabSessionChanged = collabSession?.network?.failed === true &&
    collabSession.network.failureCause === "session_changed";
  const partsReadForSessionRef = useRef<unknown>(null);
  useEffect(() => {
    if (!collabSessionChanged || !pageId || documentPartsPage || previewMode || guestMode) return undefined;
    if (partsReadForSessionRef.current === collabSession) return undefined;
    partsReadForSessionRef.current = collabSession;
    let cancelled = false;
    // The view is read-only from here (its room's session ended) until the
    // page is known: what is typed meanwhile is held, not dropped, and goes
    // to the parts view, or back to this one when the page is one room still.
    armDocumentHandoverRef.current();
    void notebookSDK.getPage(pageId, { cache: "no-store" }).then((page) => {
      if (cancelled) return;
      if (!page || page.id !== pageId || documentPartsCount(page.content_json) <= 1) {
        releaseDocumentHandoverRef.current();
        return;
      }
      // Handed over already (its refused save read the page first): one
      
      const handedOver = Boolean(setAsideDraftRef.current?.forParts);
      keepDocumentForPartsRef.current(false);
      rememberDocumentPartsPage(pageId, true);
      if (handedOver) return;
      void (traceDocsHandover({ step: "discard-reload", why: "session-ended-parts" }), autosave.discardLocalAndReload());
    }).catch(() => {
      partsReadForSessionRef.current = null;
      releaseDocumentHandoverRef.current();
    });
    return () => { cancelled = true; };
  }, [collabSessionChanged, collabSession, pageId, documentPartsPage, previewMode, guestMode]); // eslint-disable-line react-hooks/exhaustive-deps -- once per failed session
  // A causal save of the whole view refused because the page has no room's
  // history any more (page_causal_checkpoint_required / _epoch_stale): the
  // page was split into parts under it (another tab, the server holding an
  // oversized save so), its causal state gone. Not a remote update for the
  // reader to settle: taken here (the draft parks, kept), the keys typed from
  // now on held, and the page read; held as parts, the view's edits go to the
  // parts as after any split (keepDocumentForParts). Before, it was the
  // remote-update conflict: a reload of the whole view whose own edits were
  
  
  // room after all gets the old path: the draft is sent again, and a second
  // such refusal is the conflict it always was.
  const saveRefusalReadRef = useRef<{ pageId: string; pending: boolean } | null>(null);
  useEffect(() => { saveRefusalReadRef.current = null; }, [pageId]);
  useEffect(() => {
    if (autosave.saveStatus === "saved" && saveRefusalReadRef.current?.pending === false) saveRefusalReadRef.current = null;
  }, [autosave.saveStatus]);
  onDocumentSaveRefusedRef.current = (error) => {
    if (error.code !== "page_causal_checkpoint_required" && error.code !== "page_causal_epoch_stale") return false;
    // Harness switch (`window.__docsSaveRefusalIsConflict = true`): the old
    
    // drives a whole view's conflict read with it).
    if ((window as Window & { __docsSaveRefusalIsConflict?: boolean }).__docsSaveRefusalIsConflict === true) return false;
    if (!pageId || previewMode || guestMode || documentPartsPageRef.current || hydratedAsPartsRef.current) return false;
    const asked = saveRefusalReadRef.current;
    if (asked?.pageId === pageId) return asked.pending;
    saveRefusalReadRef.current = { pageId, pending: true };
    traceDocsHandover({ step: "save-refused", code: error.code });
    armDocumentHandoverRef.current();
    const page = pageId;
    const stillOneRoom = () => {
      if (importPageIdRef.current !== page) return;
      saveRefusalReadRef.current = { pageId: page, pending: false };
      if (!setAsideDraftRef.current?.forParts && !knownDocumentPartsPage(page)) releaseDocumentHandoverRef.current();
      void autosave.retrySave().catch(() => null);
    };
    void notebookSDK.getPage(page, { cache: "no-store" }).then((fresh) => {
      if (importPageIdRef.current !== page) return;
      if (!fresh || fresh.id !== page || documentPartsCount(fresh.content_json) <= 1) {
        stillOneRoom();
        return;
      }
      // The view is the parts view already: the split's own reading went in
      // while this one was on its way (a refusal of a save sent just before
      // the split, answered after it). Kept and read again now, that view's
      // edits -- the whole view's merged in, not saved yet -- were thrown
      
      
      if (documentPartsPageRef.current || hydratedAsPartsRef.current) {
        traceDocsHandover({ step: "save-refused-late" });
        saveRefusalReadRef.current = { pageId: page, pending: false };
        return;
      }
      // Another path (the room's session ending, the page read as parts)
      // may be handing it over already: one keep, one reading.
      const handedOver = Boolean(setAsideDraftRef.current?.forParts);
      keepDocumentForPartsRef.current(true);
      rememberDocumentPartsPage(page, true);
      if (!handedOver) void (traceDocsHandover({ step: "discard-reload", why: "save-refused-parts" }), autosave.discardLocalAndReload());
    }).catch(stillOneRoom);
    return true;
  };

  // Canonical: the durable originals are in the document before the room is,
  // so a room that is still connecting (a long document can keep the main
  // thread busy for a minute) or could not be reached leaves the page
  // editable with autosave. It used to wait for the room's first replay, and a
  // startup timeout left a loaded 158-page import read-only for good.
  const collabTransportWritable = canonicalReady && collabSession?.network
    ? canonicalDocumentTransportWritable({
      network: collabSession.network,
      pageWritable: editingPageWritable.known && editingPageWritable.writable,
      localAuthorityPending: autosave.isLocalAuthorityPending,
    })
    : collabSession?.network?.failed === true
      ? true
      : collabAuthorizationSnapshot?.session === collabSession
        ? collabAuthorizationSnapshot.writable
        : (collabSession?.network?.writable ?? true);

  const [collabPresence, setCollabPresence] = useChangedState<
    ReturnType<typeof mapAwarenessStates>
  >([]);

  // Every other connection to the room, this account's other tabs included
  // (a tab closed a moment ago stays in awareness for about 30 s); null
  // without a room. The room is only set to the stored page with nobody else in it.
  const collabOthersRef = useRef<number | null>(null);
  useEffect(() => {
    if (!collabPresenceSession) {
      collabOthersRef.current = null;
      setCollabPresence([]);
      return;
    }
    const { awareness } = collabPresenceSession;
    const sync = () => {
      const closedTabs = recentlyClosedTabs();
      collabOthersRef.current = [...awareness.getStates().entries()].filter(([id, state]) => id !== awareness.clientID &&
        !(typeof (state as { tab?: unknown } | undefined)?.tab === "string" && closedTabs.has((state as { tab: string }).tab))).length;
      const next = mapAwarenessStates(awareness.getStates(), awareness.clientID);
      // Cursor/selection changes belong to the awareness binding. They do not
      // change this member list, and rebuilding its header JSX would repaint
      // the whole Ribbon on every local or remote keystroke.
      setCollabPresence((current) =>
        current.length === next.length && current.every((entry, index) => {
          const other = next[index];
          return entry.clientId === other.clientId &&
            entry.user.id === other.user.id &&
            entry.user.name === other.user.name &&
            entry.user.color === other.user.color;
        }) ? current : next,
      );
    };
    sync();
    awareness.on("change", sync);
    return () => {
      awareness.off("change", sync);
    };
  }, [collabPresenceSession]);

  // Awareness carries only a name and a colour, never a profile picture:
  // the people in the room are drawn from the notebook's member list, the
  // same source the canvas presence row uses.
  const presenceNotebookId = autosave.page?.notebook_id ?? null;
  const presencePeerKey = Array.from(
    new Set(
      collabPresence.flatMap((entry) => (entry.user.id ? [entry.user.id] : [])),
    ),
  )
    .sort()
    .join("\u001f");
  const [presenceMembers, setPresenceMembers] = useState<
    ReadonlyMap<string, NotebookMemberRecord>
  >(() => new Map());
  useEffect(() => {
    if (guestMode || !presenceNotebookId || !presencePeerKey) return;
    let active = true;
    const visible = new Set(presencePeerKey.split("\u001f"));
    void listNotebookMembers(presenceNotebookId)
      .then((members) => {
        if (!active) return;
        setPresenceMembers(
          new Map(
            members
              .filter((member) => visible.has(member.userId))
              .map((member) => [member.userId, member]),
          ),
        );
      })
      .catch(() => {
        // Initials in the person's colour remain a faithful fallback.
      });
    return () => {
      active = false;
    };
  }, [guestMode, presenceNotebookId, presencePeerKey]);

  const previousCollabWriteVerdictRef = useRef<{
    pageId: string;
    known: boolean;
    readOnly: boolean;
    session: CollabSession | null;
  } | null>(null);

  useEffect(() => {
    const next = {
      pageId,
      known: pageWritable.known,
      readOnly: pageWritable.known && !pageWritable.writable,
      session: collabSession,
    };
    const previous = previousCollabWriteVerdictRef.current;
    previousCollabWriteVerdictRef.current = next;
    if (
      !previous ||
      previous.pageId !== pageId ||
      previous.session !== collabSession ||
      !previous.known ||
      !next.known ||
      previous.readOnly === next.readOnly
    ) {
      return;
    }
    // Checkout transitions keep the same Y.Doc, but the socket's writable
    // verdict is a connection-time snapshot and must be refreshed.
    void collabSession?.provider?.refreshAuthorization?.({ becameWritable: !next.readOnly });
  }, [collabSession, pageId, pageWritable.known, pageWritable.writable]);
  const loadedContent = autosave.page?.content_json;
  const defaultDocxPagePreview = useMemo(
    () =>
      storedPagePreviewPreference === null &&
      loadedContent !== null &&
      typeof loadedContent === "object" &&
      documentHasDocxProjectionSource(loadedContent),
    [loadedContent, storedPagePreviewPreference],
  );
  const pagePreviewOn =
    pagePreviewOverride?.pageId === pageId
      ? pagePreviewOverride.enabled
      : (storedPagePreviewPreference ?? defaultDocxPagePreview);
  // Read-only card 页面预览: only for the layouts the sheet surface renders
  // BEST-EFFORT (竖排 / 稿纸方格 — toggles disabled pending a paged
  // implementation). Multi-column no longer exempts (editor-core migration
  
  // stay on the live sheet surface like everything else.
  const detachedPagePreviewActive =
    documentLayoutViewMode === "print" &&
    pagePreviewOn &&
    (isVerticalWritingMode(writingMode) ||
      manuscriptGridNeedsDetachedPreview(manuscriptGrid));
  const [documentSideBySideSupported, setDocumentSideBySideSupported] =
    useState(false);
  useLayoutEffect(() => {
    const update = () => {
      const supported = Boolean(
        !guestMode &&
        windowId &&
        autosave.page?.notebook_id &&
        readDocumentSideBySideLayout(windowId),
      );
      setDocumentSideBySideSupported((previous) =>
        previous === supported ? previous : supported,
      );
    };
    update();
    const viewport = wrapperRef.current?.closest<HTMLElement>(
      ".wm-canvas-viewport",
    );
    const observer =
      viewport && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (observer && viewport) observer.observe(viewport);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    autosave.loading,
    autosave.page?.notebook_id,
    editorHydrated,
    guestMode,
    windowId,
  ]);
  const sideBySideCancelRef = useRef<(() => void) | null>(null);
  const showDocumentSideBySide = useCallback(() => {
    const notebookId = autosave.page?.notebook_id;
    if (guestMode || !windowId || !notebookId) return false;
    sideBySideCancelRef.current?.();
    const run = startDocumentSideBySide({
      actions: {
        focusWindow,
        moveWindow,
        openWindow,
        resizeWindow,
        restoreWindow,
      },
      notebookId,
      pageId,
      sourceWindowId: windowId,
      title: titleRef.current.trim() || t("pages.untitled"),
    });
    sideBySideCancelRef.current = run.accepted ? run.cancel : null;
    return run.accepted;
  }, [
    autosave.page?.notebook_id,
    focusWindow,
    guestMode,
    moveWindow,
    openWindow,
    pageId,
    resizeWindow,
    restoreWindow,
    t,
    windowId,
  ]);

  const documentWindowCommandsSupported = Boolean(
    !guestMode &&
    windowId &&
    autosave.page?.notebook_id &&
    typeof readWindows === "function" &&
    typeof focusWindow === "function" &&
    typeof moveWindow === "function" &&
    typeof resizeWindow === "function" &&
    typeof restoreWindow === "function",
  );
  const listDocumentWindows = useCallback(
    () =>
      typeof readWindows === "function" && windowId
        ? documentWindowChoices(readWindows(), windowId)
        : [],
    [readWindows, windowId],
  );
  const openNewDocumentWindowView = useCallback(() => {
    const notebookId = autosave.page?.notebook_id;
    if (!documentWindowCommandsSupported || !notebookId) return false;
    return openNewDocumentWindow(
      { openWindow, readWindowFrame, restoreWindow },
      {
        notebookId,
        pageId,
        title: titleRef.current.trim() || t("pages.untitled"),
        ...(windowId ? { sourceWindowId: windowId } : {}),
      },
    );
  }, [
    autosave.page?.notebook_id,
    documentWindowCommandsSupported,
    openWindow,
    pageId,
    readWindowFrame,
    restoreWindow,
    t,
    windowId,
  ]);
  const arrangeAllDocumentWindowsView = useCallback(() => {
    if (!documentWindowCommandsSupported || !windowId) return false;
    return arrangeAllDocumentWindows(
      {
        focusWindow,
        moveWindow,
        readWindowFrame,
        readWindows,
        resizeWindow,
        restoreWindow,
      },
      windowId,
    );
  }, [
    documentWindowCommandsSupported,
    focusWindow,
    moveWindow,
    readWindowFrame,
    readWindows,
    resizeWindow,
    restoreWindow,
    windowId,
  ]);
  const switchDocumentWindowView = useCallback(
    (targetWindowId: string) =>
      documentWindowCommandsSupported
        ? switchToDocumentWindow(
            { focusWindow, readWindows, restoreWindow },
            targetWindowId,
          )
        : false,
    [documentWindowCommandsSupported, focusWindow, readWindows, restoreWindow],
  );
  const synchronizedScrollState = useDocumentSynchronizedScrollState(
    windowId ?? "",
    pageId,
  );
  useLayoutEffect(() => {
    if (guestMode || !windowId || autosave.loading || !editorHydrated) return;
    const scroller = wrapperRef.current?.closest<HTMLElement>(
      ".note-window-scroll",
    );
    if (!scroller) return;
    return registerDocumentSynchronizedScrollPort({
      element: scroller,
      pageId,
      windowId,
    });
  }, [autosave.loading, editorHydrated, guestMode, pageId, windowId]);
  const toggleSynchronizedScrollingView = useCallback(
    () =>
      windowId ? toggleDocumentSynchronizedScrolling(windowId, pageId) : false,
    [pageId, windowId],
  );

  useEffect(
    () => () => {
      sideBySideCancelRef.current?.();
      sideBySideCancelRef.current = null;
    },
    [pageId, windowId],
  );
  // Stable handler identities: DocumentToolbar is memoized (an 8k-line
  // subtree) — inline arrows here would defeat the memo on every NoteEditor
  // render (pagination commits re-render NoteEditor several times per edit).
  const autosaveReloadRef = useRef(autosave.reload);
  useLayoutEffect(() => {
    autosaveReloadRef.current = autosave.reload;
  }, [autosave.reload]);
  const handleContentRestored = useCallback(
    async (expectedReceipt: PageItem | null): Promise<boolean> => {
      try {
        if (expectedReceipt && importPageIdRef.current !== expectedReceipt.id) {
          return false;
        }
        const hydratedPage = await autosaveReloadRef.current();
        // A null receipt is the explicit 409-conflict refresh path. Its result
        // is best effort only; VersionHistoryPanel always keeps the conflict
        // message and never treats this boolean as a successful restore.
        if (!expectedReceipt) return hydratedPage !== null;
        if (
          importPageIdRef.current !== expectedReceipt.id ||
          !validContentVersion(expectedReceipt.content_version)
        ) {
          return false;
        }
        return hydrationCoversCommittedPage(
          hydratedPage,
          expectedReceipt.id,
          expectedReceipt.content_version,
        );
      } catch {
        return false;
      }
    },
    [],
  );
  const toggleSpellcheck = useCallback(() => {
    setSpellcheckOn((value) => !value);
  }, []);
  const toggleAutoCorrect = useCallback(() => {
    setAutoCorrectOn((value) => !value);
  }, []);
  const togglePagePreview = useCallback(() => {
    const enabled = !pagePreviewOn;
    setPagePreviewOverride({ pageId, enabled });
    writePagePreviewPreference(pageId, enabled);
  }, [pageId, pagePreviewOn]);
  // Live ref so the wiki-link suggestion closure can read the latest
  // notebook id even after the editor instance was constructed with a
  // stale (null) value during initial hydration.
  const notebookIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    notebookIdRef.current = autosave.page?.notebook_id ?? null;
  }, [autosave.page?.notebook_id]);
  // Live ref for the AutoCorrect preference. The editor (and its input-rule
  // extension) is built once; reading the toggle through this ref at fire time
  // lets a Settings change take effect immediately without tearing down the
  // editor — same pattern as notebookIdRef above.
  const autoCorrectOnRef = useRef(true);
  useLayoutEffect(() => {
    autoCorrectOnRef.current = autoCorrectOn;
  }, [autoCorrectOn]);
  const autosaveQueueSaveRef = useRef(autosave.queueSave);
  const autosaveReplacePendingDraft = autosave.replacePendingDraft;
  // This view is still catching up with what a tab that just closed sent: it
  // says "saving" (it is, elsewhere) and takes no typing until it has it.
  const [docsCatchingUp, setDocsCatchingUp] = useState(false);
  // Takes input, but is not yet known to show the page (a recovered copy is
  // being merged after a tab closed): said as saving, never as saved.
  const [docsSettling, setDocsSettling] = useState(false);
  // Edits kept aside rather than merged on opening (a copy behind its tab's
  // last state, what the room held beyond the stored page): offered to the
  // reader to restore or delete.
  const [docsOfferedCopies, setDocsOfferedCopies] = useState<AutoRecoverCopy[]>([]);
  useEffect(() => { setDocsOfferedCopies([]); }, [pageId]);
  // Blocks a merge kept twice (the page's and the merged-in copy's): said in
  // the status area, never asked first; each can be found, and either one
  
  // device until settled, as the blocks themselves are.
  const [docsConflicts, setDocsConflicts] = useState<DocsRecoveryConflict[]>([]);
  useEffect(() => { setDocsConflicts(pageId ? readDocsRecoveryConflicts(pageId) : []); }, [pageId]);
  // A conflict's kept copy not merged back yet (the conflict merge below): the
  // page holds none of those edits, whatever its saves say, so the view never
  // says "saved" -- and closing it asks first -- until the copy is in
  
  // drained connection pool, the copy was never merged, four typed words were
  // gone and both windows said "Saved").
  const [conflictCopyUnmerged, setConflictCopyUnmerged] = useState(false);
  const conflictCopyUnmergedRef = useRef(false);
  conflictCopyUnmergedRef.current = conflictCopyUnmerged;
  const pageSaveStatus =
    docsCatchingUp || docsSettling || autosave.closingEditsPending ? "saving" : !guestMode && autosave.saveStatus !== "saved"
      ? autosave.saveStatus
      : conflictCopyUnmerged ? "unsaved" : localSaveStatus;
  const saveStatus: PageSaveStatus =
    documentPartsSaving && pageSaveStatus === "saved" ? "saving" : pageSaveStatus;

  // Expose the live save status so the window chrome can guard against closing
  // this window while a draft is unsaved / mid-save / in conflict.
  useRegisterWindowSaveStatus(windowId, saveStatus);

  const setTrackedTitle = useCallback((nextTitle: string) => {
    titleRef.current = nextTitle;
    setTitle(nextTitle);
  }, []);

  const setTrackedLocalSaveStatus = useCallback(
    (nextStatus: PageSaveStatus) => {
      setLocalSaveStatus(nextStatus);
    },
    [],
  );

  // The autosave hook owns network serialization, but the editor owns the
  // earlier transaction boundary. A ProseMirror update can spend time in the
  // Safari IME grace window or the large-document serializer before queueSave
  // is reached; during that gap the hook still reports the previous receipt as
  // "saved". Track a page-scoped local generation so the UI becomes dirty in
  // the same observable cycle as the document mutation and cannot return to
  // "saved" until the latest generation is queued and a newer server version
  // acknowledges it.
  const localSaveGenerationRef = useRef<LocalSaveGenerationState>({
    pageId,
    generation: 0,
    queuedGeneration: 0,
    queuedDraft: null,
    dirty: false,
    dirtyBaseContentVersion: null,
    dirtyBaseTitle: null,
  });
  useLayoutEffect(() => {
    localSaveGenerationRef.current = {
      pageId,
      generation: 0,
      queuedGeneration: 0,
      queuedDraft: null,
      dirty: false,
      dirtyBaseContentVersion: null,
      dirtyBaseTitle: null,
    };
    acknowledgedDocumentBaselineRef.current = null;
    intentionalEmptyOverwriteRef.current = null;
  }, [pageId]);

  const beginLocalSaveMutation = useCallback((): LocalSaveMutationToken => {
    const ownerPageId = importPageIdRef.current;
    const currentState = localSaveGenerationRef.current;
    const ownsCurrentPage = currentState.pageId === ownerPageId;
    const nextState: LocalSaveGenerationState = {
      pageId: ownerPageId,
      generation: ownsCurrentPage ? currentState.generation + 1 : 1,
      queuedGeneration: ownsCurrentPage ? currentState.queuedGeneration : 0,
      queuedDraft: null,
      dirty: true,
      dirtyBaseTitle: ownsCurrentPage && currentState.dirty ? currentState.dirtyBaseTitle
        : acknowledgedDocumentBaselineRef.current?.title ?? null,
      dirtyBaseContentVersion:
        ownsCurrentPage && currentState.dirty
          ? (currentState.dirtyBaseContentVersion ??
            acknowledgedDocumentBaselineRef.current?.contentVersion ??
            null)
          : (acknowledgedDocumentBaselineRef.current?.contentVersion ?? null),
    };
    localSaveGenerationRef.current = nextState;
    setTrackedLocalSaveStatus("unsaved");
    return { pageId: ownerPageId, generation: nextState.generation };
  }, [setTrackedLocalSaveStatus]);

  const markLocalSaveMutationQueued = useCallback(
    (
      token: LocalSaveMutationToken | null,
      draft: PageSaveAcknowledgementDraft,
    ): boolean => {
      if (!token) return false;
      const state = localSaveGenerationRef.current;
      if (
        state.pageId !== token.pageId ||
        state.generation !== token.generation
      ) {
        return false;
      }
      localSaveGenerationRef.current = {
        ...state,
        queuedGeneration: token.generation,
        queuedDraft: draft,
      };
      return true;
    },
    [],
  );

  const currentLocalSaveMutation = useCallback(
    (expectedPageId: string): LocalSaveMutationToken | null => {
      const state = localSaveGenerationRef.current;
      if (state.pageId !== expectedPageId || !state.dirty) {
        return null;
      }
      return { pageId: state.pageId, generation: state.generation };
    },
    [],
  );

  // Why the last acknowledgement was declined (save diagnostics; a code).
  const lastAcknowledgementRefusalRef = useRef<string | null>(null);
  const acknowledgeLocalSaveMutation = useCallback(
    (
      token: LocalSaveMutationToken,
      savedPage: PageItem,
      receiptAlreadyValidated = false,
      canonicalContent?: Record<string, unknown>,
    ): boolean => {
      const state = localSaveGenerationRef.current;
      const savedContentVersion = savedPage.content_version;
      lastAcknowledgementRefusalRef.current = null;
      // The autosave hook bound this PATCH or exact server-content comparison
      // to the queued draft. A missing local load-time version must not turn that
      // durable receipt into a permanent false "unsaved" state; page,
      // generation and queued-draft checks below still reject stale saves.
      const receiptAcknowledgesDraft =
        receiptAlreadyValidated &&
        savedPage.id === token.pageId &&
        validContentVersion(savedContentVersion) &&
        (state.dirtyBaseContentVersion === null ||
          savedContentVersion >= state.dirtyBaseContentVersion);
      const refusal =
        state.pageId !== token.pageId ? "page_moved"
          : state.generation !== token.generation ? "generation_moved"
            : state.queuedGeneration !== token.generation ? "queued_generation_mismatch"
              : state.queuedDraft === null ? "no_queued_draft"
                : !state.dirty ? "not_dirty"
                  : !validContentVersion(savedContentVersion) ? "receipt_version_invalid"
                    : !receiptAcknowledgesDraft
                      ? (!receiptAlreadyValidated ? "receipt_not_validated"
                        : savedPage.id !== token.pageId ? "receipt_page_mismatch"
                          : "receipt_older_than_dirty_base")
                      : null;
      if (refusal !== null || state.queuedDraft === null || !validContentVersion(savedContentVersion)) {
        lastAcknowledgementRefusalRef.current = refusal;
        return false;
      }
      const acknowledgedDraft = state.queuedDraft;
      const acknowledgedContent =
        canonicalContent ?? acknowledgedDraft.content_json ??
        acknowledgedDocumentBaselineRef.current?.content ??
        latestContentRef.current;
      if (acknowledgedContent === null) {
        lastAcknowledgementRefusalRef.current = "no_acknowledged_content";
        return false;
      }
      localSaveGenerationRef.current = {
        ...state,
        queuedDraft: null,
        dirty: false,
        dirtyBaseContentVersion: null,
        dirtyBaseTitle: null,
      };
      acknowledgedDocumentBaselineRef.current = {
        pageId: token.pageId,
        title: savedPage.title,
        content: acknowledgedContent,
        contentVersion: savedContentVersion,
        contentSha256: validContentSha256(savedPage.content_sha256)
          ? savedPage.content_sha256
          : null,
      };
      intentionalEmptyOverwriteRef.current = null;
      setTrackedLocalSaveStatus("saved");
      return true;
    },
    [setTrackedLocalSaveStatus],
  );

  // A save this editor refuses before the autosave hook (or a receipt it
  // declines after) leaves no server log: record the stable code and the
  // generation/readiness state that decided it, never content.
  const saveCallerRef = useRef<string | null>(null);
  const reportEditorSaveRefusal = useCallback(
    (stage: string, code: string, reason: string | null, extra: { requestSent?: boolean | null; imeComposing?: boolean | null; receiptContentVersion?: number | null } = {}) => {
      const state = localSaveGenerationRef.current;
      recordPageSaveDiagnostic({
        pageId, windowId: windowId ?? null, stage, code, reason, attempt: "explicit",
        caller: saveCallerRef.current,
        // null: this layer cannot tell (the entry then omits the flag).
        requestSent: extra.requestSent === undefined ? false : extra.requestSent,
        localGeneration: state.pageId === pageId ? state.generation : null,
        queuedGeneration: state.pageId === pageId ? state.queuedGeneration : null,
        queuedGenerationMatches: state.pageId === pageId ? state.queuedGeneration === state.generation : null,
        localDirty: state.pageId === pageId ? state.dirty : null,
        canonicalReady,
        imeComposing: extra.imeComposing ?? null,
        durableContentVersion: acknowledgedDocumentBaselineRef.current?.pageId === pageId
          ? acknowledgedDocumentBaselineRef.current.contentVersion : null,
        baseContentVersion: state.pageId === pageId ? state.dirtyBaseContentVersion : null,
        receiptContentVersion: extra.receiptContentVersion ?? null,
      });
    },
    [canonicalReady, pageId, windowId],
  );

  useEffect(() => {
    const savedPage = documentCausalModel?.model.savedPage;
    const state = localSaveGenerationRef.current;
    if (!canonicalReady || !savedPage || savedPage.id !== pageId ||
      autosave.saveStatus !== "saved" || !state.dirty || state.pageId !== pageId ||
      !state.queuedDraft || state.queuedGeneration !== state.generation || !savedPage.content_json) return;
    const queuedTitle = state.queuedDraft.title;
    if (typeof queuedTitle === "string" && queuedTitle !== savedPage.title && queuedTitle !== state.dirtyBaseTitle) return;
    // The verified checkpoint covers all current original operations, including
    // peer edits. Comparing the old whole JSON draft would stay dirty forever
    // after a correct merge; this does not manufacture a save invocation ACK.
    acknowledgeLocalSaveMutation({pageId, generation: state.generation}, savedPage, true, savedPage.content_json);
  }, [acknowledgeLocalSaveMutation, autosave.saveStatus, canonicalReady, documentCausalModel?.model.savedPage, pageId]);

  useEffect(() => {
    const acknowledgement = autosave.lastSaveAcknowledgement;
    if (
      guestMode ||
      autosave.saveStatus !== "saved" ||
      !acknowledgement ||
      acknowledgement.page.id !== pageId ||
      !validContentVersion(acknowledgement.page.content_version)
    ) {
      return;
    }
    const state = localSaveGenerationRef.current;
    if (
      state.pageId !== pageId ||
      !state.dirty ||
      state.queuedDraft === null ||
      !pageDocumentJsonEquals(state.queuedDraft, acknowledgement.draft)
    ) {
      return;
    }
    acknowledgeLocalSaveMutation(
      { pageId, generation: state.generation },
      acknowledgement.page,
      true,
    );
  }, [
    acknowledgeLocalSaveMutation,
    autosave.lastSaveAcknowledgement,
    autosave.saveStatus,
    guestMode,
    pageId,
  ]);

  // The window titlebar renames a page out of band (a PATCH, not through this
  // editor's autosave). Mirror the new name into local title state so the
  // sr-only page-name field and the next autosave `title` field don't clobber
  // it with the stale name this editor loaded.
  useEffect(() => {
    if (guestMode || !pageId) return;
    const handler = (event: Event) => {
      const rename = pageRenameFromEvent(event);
      if (!rename || rename.pageId !== pageId) return;
      setTrackedTitle(rename.title);
    };
    window.addEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, handler);
    return () =>
      window.removeEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, handler);
  }, [guestMode, pageId, setTrackedTitle]);

  const setTrackedEditorHydrated = useCallback((hydrated: boolean) => {
    editorHydratedRef.current = hydrated;
    setEditorHydrated(hydrated);
  }, []);
  const paginationEditorRef = useRef<Editor | null>(null);
  // A draft this tab kept but could not save before a reload (blocked
  // recovery) is merged into the page and saved as ordinary edits, as soon
  // as the room takes it, however long the room takes to open (ever more
  // slowly, while the page is open); after two minutes the reader is also
  
  const [unsentDraftAdoptFailed, setUnsentDraftAdoptFailed] = useState(false);
  const adoptedUnsentDraftRef = useRef<unknown>(null);
  const blockedUnsentDraft = previewMode ? null : autosave.blockedRecoveryDraft;
  useEffect(() => {
    const draft = blockedUnsentDraft;
    if (!draft?.content_json || adoptedUnsentDraftRef.current === draft) return undefined;
    setUnsentDraftAdoptFailed(false);
    let timer: number | undefined;
    const started = Date.now();
    const attempt = (tries: number) => {
      const editor = paginationEditorRef.current;
      const base = autosave.getBlockedRecoveryBaseContentVersion?.() ?? null;
      const current = typeof autosave.page?.content_version === "number" ? autosave.page.content_version : null;
      // A whole page's draft (its save refused as the page was split under
      // it) on the page now held as parts: the view holds only the parts
      // loaded so far, and written into it whole the draft put every part not
      
      // saved with 6,572 blocks, the next as one block). The handover took
      // this view's edits already, these among them (keepDocumentForParts);
      // else they are merged as it merges (adoptKeptDocumentRef).
      if (hydratedAsPartsRef.current && documentPartsCount(draft.content_json) <= 1) {
        const handedOver = keptForPartsPageRef.current === pageId;
        if (handedOver || adoptKeptDocumentRef.current(draft.content_json, true)) {
          adoptedUnsentDraftRef.current = draft;
          autosave.releaseBlockedRecoveryDraft?.();
          setUnsentDraftAdoptFailed(false);
          if (!handedOver) void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
          return;
        }
      } else if (editor && adoptRecoveredDocumentContent(editor, draft.content_json, base !== null && base === current)) {
        adoptedUnsentDraftRef.current = draft;
        autosave.releaseBlockedRecoveryDraft?.();
        setUnsentDraftAdoptFailed(false);
        void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
        return;
      }
      if (Date.now() - started > 120_000) setUnsentDraftAdoptFailed(true);
      timer = window.setTimeout(() => attempt(tries + 1), Math.min(30_000, 500 * 2 ** Math.min(tries, 6)));
    };
    attempt(0);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [blockedUnsentDraft]); // eslint-disable-line react-hooks/exhaustive-deps -- one adoption per blocked draft
  // Edits set aside for a new binding of the model: merged into the page
  // against the body they were made on as soon as the room takes them, and
  // saved. Kept (and retried, ever more slowly) while the page is open.
  useEffect(() => {
    const kept = setAsideDraft;
    if (!kept || (kept.forParts ? !documentPartsPage : !canonicalReady && !documentPartsPage)) return undefined;
    let timer: number | undefined;
    const attempt = (tries: number) => {
      if (setAsideDraftRef.current === kept &&
          adoptKeptDocumentRef.current(kept.content, false, kept.base ?? undefined)) {
        setAsideDraftRef.current = null;
        setSetAsideDraft(null);
        if (kept.slot) void deleteAutoRecoverCopy(pageId, kept.slot);
        void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
        return;
      }
      if (setAsideDraftRef.current === kept) {
        timer = window.setTimeout(() => attempt(tries + 1), Math.min(30_000, 500 * 2 ** Math.min(tries, 6)));
      }
    };
    attempt(0);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [setAsideDraft, canonicalReady, documentPartsPage, editorHydrated]); // eslint-disable-line react-hooks/exhaustive-deps -- one merge per kept body
  useEffect(() => { setAsideDraftRef.current = null; setSetAsideDraft(null); }, [pageId]);
  useEffect(() => () => {
    const retry = settledSaveRetryRef.current;
    if (retry.timer !== null) window.clearTimeout(retry.timer);
    retry.timer = null;
    retry.tries = 0;
  }, [pageId]);

  const normalizeDocumentForSave = useCallback(
    (contentJson: unknown, captureProjection = true, deferPagination = false): TipTapDocumentContentResult =>
      normalizeDocumentContentForSave(contentJson, paginationEditorRef.current, captureProjection, deferPagination),
    [],
  );
  /** normalizeDocumentForSave (with the pagination records) in tasks of its
   * own: the page measured, its recipe digested, the document flattened and
   * stamped, each after a yield (see captureSavedPaginationProjectionInSteps).
   * Every step works on `contentJson` as it was handed over and on the
   * measurement taken in the first: the result is the one the single-task
   * normalization would have made of the same document then. */
  const normalizeDocumentForSaveInSteps = useCallback(
    async function normalizeDocumentForSaveInSteps(contentJson: unknown): Promise<TipTapDocumentContentResult> {
      const resolved = resolveTipTapDocumentContent(contentJson);
      if (!resolved.ok) return resolved;
      let document: Record<string, unknown>;
      try {
        document = withLegacyChartsOnV2(serializeWhiteboardScenes(resolved.document));
      } catch {
        return { ok: false, issue: "invalid_content" };
      }
      const paginationSettled = editorDom(paginationEditorRef.current)?.hasAttribute(
        INITIAL_PAGINATION_SETTLING_ATTR,
      ) !== true;
      const projection = paginationSettled
        ? await captureSavedPaginationProjectionInSteps(paginationEditorRef.current, document, yieldBetweenSaveSteps)
        : null;
      await yieldBetweenSaveSteps();
      // Whole-document steps of a save: a pen contact reported late names them.
      const flattenStarted = performance.now();
      const stamped = withProjectionJsonMemo(() =>
        flattenPagedDocumentForStorage(document, { paginationSettled, projection }),
      );
      const withBlockIds = ensureNativeDocumentBlockIds(
        withoutInactiveChartUnionAttrs(stamped),
      ).document as
        Record<string, unknown> | null | undefined;
      const resolvedForSave = resolveTipTapDocumentContent(withBlockIds);
      inkTraceWork("save-flatten", performance.now() - flattenStarted);
      return resolvedForSave;
    },
    [],
  );

  const emitDocumentLifecycleFact = useCallback((
    kind: "hydrated" | "save-ack", sourcePage: PageItem,
    acknowledgement?: { source: "patch" | "server-match"; requestBaseContentVersion: number },
    expectedDraft?: Record<string, unknown>,
  ) => {
    if (guestMode || !lifecycleObserverRef.current) {
      reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({kind, reason: "observer-disabled", guest: guestMode}));
      return;
    }
    const ownership = hydrationOwnerRef.current;
    const runtime = ownership?.editor ?? null;
    const binding = hydratedBindingRef.current;
    if (!ownership || !isUsableEditor(runtime) || sourcePage.id !== pageId ||
        ownership.pageId !== pageId || loadedPageIdRef.current !== pageId ||
        binding?.editor !== runtime || binding.session !== collabSession ||
        hydratedReloadNonceRef.current !== ownership.reloadNonce ||
        !validContentVersion(sourcePage.content_version)) {
      reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({
        kind, reason: "binding-rejected", hasOwner: Boolean(ownership), editorUsable: isUsableEditor(runtime),
        sourcePageMatches: sourcePage.id === pageId, ownerPageMatches: ownership?.pageId === pageId,
        loadedPageMatches: loadedPageIdRef.current === pageId, bindingEditorMatches: binding?.editor === runtime,
        bindingSessionMatches: binding?.session === collabSession,
        reloadMatches: hydratedReloadNonceRef.current === ownership?.reloadNonce,
        validVersion: validContentVersion(sourcePage.content_version), contentVersion: sourcePage.content_version,
      }));
      return;
    }
    const scope = lifecycleSourceScopeRef.current;
    if (!scope?.principal || !isSavedPageHotCacheScopeCurrent(scope)) {
      reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({kind, reason: "scope-rejected",
        hasPrincipal: Boolean(scope?.principal), scopeCurrent: Boolean(scope && isSavedPageHotCacheScopeCurrent(scope))}));
      return;
    }
    const principal = scope.principal;
    const contentVersion = sourcePage.content_version;
    const contentSha256 = sourcePage.content_sha256;
    const generation = localSaveGenerationRef.current.generation;
    // A page in a notebook mounts a display-font plan right after it hydrates;
    // the fact waits for that plan's verdict (see the helper for why).
    const displayFontsDecided = () =>
      !sourcePage.notebook_id || documentLifecycleDisplayFontsDecided(editorDom(runtime));
    const layoutSettled = () =>
      documentLifecycleLayoutSettled(editorDom(runtime)) && displayFontsDecided();
    const attempt = () => {
      const document = runtime.state.doc;
      const isCurrent = () => isSavedPageHotCacheScopeCurrent(scope) &&
        !lifecycleAuthorityRef.current.pending &&
        lifecycleAuthorityRef.current.page?.id === sourcePage.id &&
        lifecycleAuthorityRef.current.page.content_version === contentVersion &&
        lifecycleAuthorityRef.current.page.content_sha256 === contentSha256 &&
        importPageIdRef.current === pageId && hydrationOwnerRef.current === ownership &&
        hydratedBindingRef.current === binding && isUsableEditor(runtime) &&
        runtime.state.doc === document && localSaveGenerationRef.current.generation === generation &&
        !isImeCompositionActive(runtime.view) && pendingSerializeRef.current === null;
      if (!isCurrent()) {
        reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({
          kind, reason: "current-rejected", scopeCurrent: isSavedPageHotCacheScopeCurrent(scope),
          authorityPending: lifecycleAuthorityRef.current.pending,
          authorityPageMatches: lifecycleAuthorityRef.current.page?.id === sourcePage.id,
          authorityVersionMatches: lifecycleAuthorityRef.current.page?.content_version === contentVersion,
          authorityHashMatches: lifecycleAuthorityRef.current.page?.content_sha256 === contentSha256,
          importPageMatches: importPageIdRef.current === pageId, ownerCurrent: hydrationOwnerRef.current === ownership,
          bindingCurrent: hydratedBindingRef.current === binding, editorUsable: isUsableEditor(runtime),
          documentCurrent: isUsableEditor(runtime) && runtime.state.doc === document,
          generationCurrent: localSaveGenerationRef.current.generation === generation,
          composing: isUsableEditor(runtime) && isImeCompositionActive(runtime.view),
          serializePending: pendingSerializeRef.current !== null,
          contentVersion, generation: localSaveGenerationRef.current.generation, capturedGeneration: generation,
          reloadNonce: ownership.reloadNonce,
        }));
        return true;
      }
      const layoutPasses = {
        ...documentLifecycleLayoutPasses(editorDom(runtime)),
        layoutDisplayFonts: displayFontsDecided(),
      };
      if (!Object.values(layoutPasses).every(Boolean)) {
        // Which prerequisite is holding, so a layout that never settles can be
        // told from one that is simply slow.
        reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({kind, reason: "layout-pending", contentVersion, generation, ...layoutPasses}));
        return false;
      }
      lifecycleEmitter.emit({
        observer: lifecycleObserverRef.current, kind,
        owner: { pageId, windowId: windowId ?? null, principal,
          sessionEpoch: scope.sessionEpoch, editorGeneration: documentLifecycleIdentity(runtime),
          collabSessionGeneration: collabSession ? documentLifecycleIdentity(collabSession) : null,
          reloadNonce: ownership.reloadNonce },
        source: {contentVersion,
          contentSha256: validContentSha256(contentSha256) ? contentSha256 : null},
        acknowledgement, isCurrent,
        serialize: () => {
          // Observation must not invent a recipe absent from the submitted or
          // loaded document. Existing runtime receipts still pass flatten's
          // validation, and submitted receipts still require live capture.
          const observedDocument = expectedDraft ?? sourcePage.content_json;
          const observedAttrs = observedDocument?.attrs as Record<string, unknown> | undefined;
          const result = normalizeDocumentForSave(runtime.getJSON(), observedAttrs?.pageRegionLayoutReceipt != null);
          // The live editor re-measures after a save; the acknowledged draft is
          // what the server holds, so that is the fact when the two cut alike.
          if (!result.ok || (expectedDraft && !pageDocumentJsonEquals(
            withoutMeasuredLayoutGeometry(result.document), withoutMeasuredLayoutGeometry(expectedDraft),
          ))) {
            reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({kind,
              reason: result.ok ? "draft-mismatch" : "serializer-invalid", contentVersion, generation,
              ...(result.ok && expectedDraft ? documentLifecycleFirstDifference(result.document, expectedDraft) : {}),
            }));
            return null;
          }
          return { content: expectedDraft ?? result.document, paginationSettled: layoutSettled() };
        },
      });
      return isCurrent() ? layoutSettled() : true;
    };
    if (attempt()) pendingLifecycleFactsRef.current.delete(kind);
    else pendingLifecycleFactsRef.current.set(kind, attempt);
  }, [collabSession, guestMode, lifecycleEmitter, normalizeDocumentForSave, pageId, windowId]);

  const rejectInvalidDocumentContent = useCallback(
    (issue: TipTapDocumentContentIssue) => {
      if (serializeTimerRef.current !== null) {
        window.clearTimeout(serializeTimerRef.current);
        serializeTimerRef.current = null;
      }
      pendingSerializeRef.current = null;
      clearImeSerializeQueue();
      latestContentRef.current = null;
      acknowledgedDocumentBaselineRef.current = null;
      intentionalEmptyOverwriteRef.current = null;
      setDocumentContentIssue(issue);
      setTrackedEditorHydrated(false);
    },
    [clearImeSerializeQueue, setTrackedEditorHydrated],
  );

  const buildSaveDraft = useCallback(
    (contentJson: Record<string, unknown>, nextTitle: string) => ({
      ...emptyOverwriteAuthorityForDraft(
        contentJson,
        acknowledgedDocumentBaselineRef.current,
        intentionalEmptyOverwriteRef.current,
      ),
      content_json: contentJson,
      title: nextTitle,
    }),
    [],
  );

  useLayoutEffect(() => {
    autosaveQueueSaveRef.current = autosave.queueSave;
  }, [autosave.queueSave]);

  const pluginRegistry = useMemo(
    () =>
      createNativeDocumentPluginRegistry({
        lowlight: documentLowlight,
        pageId,
        placeholder: t("editor.placeholder"),
        translate: (key, values) => t(key as never, values as never),
        // Read through a ref so the closure inside the suggestion plugin
        // always sees the live value after autosave.page hydrates. Using
        // a static value here would freeze the notebookId at null on
        // first render and the [[ popup would never list any sibling
        // pages (the editor instance is created once, not rebuilt when
        // the registry value changes).
        getNotebookId: () => notebookIdRef.current,
        // Collab-gated: drop StarterKit's built-in history ONLY when collab is
        // on (TipTap's Collaboration extension owns undo/redo via Yjs). OFF →
        // history intact, single-user editing unchanged.
        disableHistory: Boolean(collabSession),
        // Guest demo (public marketing pages): every block extension + the slash
        // menu skip their authed API calls / hide their authed surfaces so an
        // unauthenticated visitor never fires a 401. Defaults false everywhere,
        // so the authenticated console is byte-for-byte unchanged.
        guestMode,
        // AutoCorrect / smart-typography toggle, read live through a ref so a
        // Settings change applies without rebuilding the editor (see
        // autoCorrectOnRef). ON by default (Word parity).
        getAutoCorrectEnabled: () => autoCorrectOnRef.current,
      }),
    // Deliberately omit autosave.page?.notebook_id from deps; the ref
    // pattern above replaces reactive recompute and avoids tearing down
    // the TipTap editor mid-session. guestMode is a stable per-mount prop.
    [pageId, t, collabSession, guestMode],
  );

  // Live ref to the base (non-collab) extension list. `pluginRegistry` is keyed
  // off pageId (so its identity churns on navigation), but the OFF path must NOT
  // rebuild the editor on a page switch — the editor instance is created once and
  // re-hydrated via setContent, with pageId fed through getter closures. Reading
  // the base list through a ref keeps `editorExtensions` (and therefore the
  // useEditor deps below) referentially STABLE across pageId changes when collab
  // is off, while still surfacing the live base list when a new collab session
  // forces a deliberate rebuild.
  const pluginExtensionsRef = useRef(pluginRegistry.extensions);
  pluginExtensionsRef.current = pluginRegistry.extensions;
  // An older physical legacy room this view will not edit until it is
  // upgraded (lib/collab/paged-document-bridge.ts upgradeLegacyRoom).
  const [legacyRoomIssue, setLegacyRoomIssue] = useState<{
    session: CollabSession;
    issue: PagedDocumentBridgeIssue;
  } | null>(null);

  // Collab extensions are appended to the base list ONLY when a session exists
  // (flag ON). Keyed on `collabSession` ALONE:
  //   - OFF path: collabSession is always null → this memo runs exactly once and
  //     returns a STABLE reference for the component's lifetime, so the
  //     `[editorExtensions]` deps on useEditor are a genuine no-op across
  //     navigation. The editor is still built once with the base extensions —
  //     byte-for-byte the previous (no-deps) single-user behavior.
  //   - ON path: collabSession is re-created per pageId (useMemo keyed on
  //     pageId), so when the page changes the old Y.Doc/awareness session is
  //     destroyed and this memo recomputes with a NEW reference, forcing
  //     useEditor to rebuild the editor with a fresh Collaboration binding. That
  //     is the lifecycle fix: without the rebuild the editor would keep a STALE
  //     Collaboration extension bound to the destroyed Y.Doc (leak + broken sync).
  // The floating toolbar's menu and Word's Find paint are part of the editor
  // from the start (preparedBubbleMenu): registered later, each reconfigured
  // the whole editor (every plugin view and the document's decorations again).
  const [preparedBubbleMenu] = useState(createPreparedBubbleMenu);
  const editorExtensions = useMemo(() => {
    const baseExtensions = documentEditorBaseExtensions(pluginExtensionsRef.current, preparedBubbleMenu);
    if (!collabSession) {
      return baseExtensions;
    }
    // The legacy room binds its LOGICAL document too (see the flag): the
    // same semantic bridge, with the room's model agreed among its members
    // instead of by a causal checkpoint.
    const legacyLogical = !canonicalReady && USE_LEGACY_ROOM_LOGICAL_BINDING;
    return [
      ...baseExtensions,
      // The factory retains this gate for later PM transactions; it does not
      // read live authority during React render (useEditor mounts after commit).
      // eslint-disable-next-line react-hooks/refs
      ...buildCollabExtensions({
        session: collabSession,
        user: { name: collabUserName },
        canonical: canonicalReady || legacyLogical,
        canonicalNetworkModel: () => legacyLogical ||
          (canonicalReady && (documentCausalModel?.model.epoch ?? 0) >= 2),
        durableOriginals: canonicalReady,
        mayWrite: legacyLogical ? undefined : causalViewAuthority.canWrite,
        upgradeLegacyRoom: legacyLogical,
        initialLayoutReceipt: (canonical, root) => {
          if (!pageId) return null;
          if (!layoutSnapshotsEnabled() || !canonical) return cachedDocsLayoutReceipt(pageId);
          const found = snapshotReceiptFor(pageId, 0, canonical, "bridge");
          if (found && root) {
            // The row's fonts are asked for now: they load while its pages are built.
            const fontsHold = earlySnapshotFonts() ? rowFontsHold(found.row, canonical) : undefined;
            fontsHold?.catch(() => undefined);
            markRestoredSnapshot(root, { pageId, row: found.row, content: canonical, ...(fontsHold ? { fontsHold } : {}) });
          }
          return found?.receipt ?? null;
        },
        initialLayoutSizes: () => (pageId ? cachedDocsLayoutSizes(pageId) : null),
        initialLayoutReceiptPending: () => Boolean(pageId) && layoutSnapshotsEnabled() && layoutSnapshotsAwaited(pageId!),
        onPagedIssue: (issue) => {
          pagedBridgeIssueRef.current = issue;
          // A room whose document cannot be read says so, never one empty
          // paragraph (the bridge reported where it failed).
          if (issue === "unreadable-document") setDocumentContentIssue("invalid_content");
          if (legacyLogical) setLegacyRoomIssue(issue ? { session: collabSession, issue } : null);
        },
      }),
    ];
    // collabUserName is stable per render; the base extensions are read through a
    // ref (above) so only a collab-session change triggers a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabSession, canonicalReady]);

  // One live predicate owns every document write surface, including page
  // title and async imports that sit outside ProseMirror's transaction guard.
  const underlyingShellWriteAllowed = !previewMode && documentShellWriteAllowed({
    collaborationEnabled,
    collaborationSessionReady: Boolean(collabSession),
    guestMode,
    pageAuthorityKnown: editingPageWritable.known,
    autosaveReadOnly: autosave.readOnly,
    transportWritable: collabTransportWritable,
    // Word's "Comments" restriction saves the comments written under it,
    // and an exception's region is saved under either restriction.
    documentProtectionEditable:
      documentProtectionAllowsSaves(documentProtection) || rangeExceptionsEditable,
    runOwnedDraft,
  });
  // The canonical model's own write verdict reads the page verdict raw, so a
  // transient page-authority refresh failure withdrew it mid-sentence; keep
  // the last known one through it, as the editing surface above does.
  const causalModelSnapshot = documentCausalModel?.model ?? null;
  // Republished with every model revision (every transaction); the hold
  // itself changes rarely, and only a real change may reach React.
  const [canonicalWriteHold, setCanonicalWriteHold] = useChangedState<CanonicalWriteHold | null>(null);
  useEffect(() => {
    if (!causalModelSnapshot) return;
    setCanonicalWriteHold((current) => nextCanonicalWriteHold(current, {
      pageId,
      pageVerdictKnown: pageWritable.known,
      mayWrite: causalModelSnapshot.mayWrite,
      revision: causalModelSnapshot.revision,
    }));
  }, [causalModelSnapshot, pageId, pageWritable.known]);
  // nextCanonicalWriteHold and canonicalSurfaceMayWrite read the revision
  // only while the page verdict is unknown or the hold awaits a republish
  // made after the verdict came back (documentShellWriteAuthority.ts).
  useLayoutEffect(() => {
    causalRevisionMattersRef.current = !pageWritable.known || canonicalWriteHold === null ||
      canonicalWriteHold.pageId !== pageId || canonicalWriteHold.unknownRevision !== null;
  }, [canonicalWriteHold, pageId, pageWritable.known]);
  const editingCausalMayWrite = !causalModelSnapshot || canonicalSurfaceMayWrite(canonicalWriteHold, {
    pageId,
    canonicalReady,
    pageVerdictKnown: pageWritable.known,
    mayWrite: causalModelSnapshot.mayWrite,
    revision: causalModelSnapshot.revision,
  });
  const shellWriteAllowed = underlyingShellWriteAllowed && !canonicalPreparing && !pageSplitting &&
    upgradeHeldBy === null && editingCausalMayWrite;
  // Document authority is independent of transport admission. Feeding the
  // shell's pending connection verdict back into the original model can
  // strand that model read-only after its checkpoint has become ready.
  const canonicalPageWriteAllowed = editingPageWritable.known && editingPageWritable.writable &&
    !autosave.readOnly && !runOwnedDraft &&
    (documentProtectionAllowsSaves(documentProtection) || rangeExceptionsEditable);
  useLayoutEffect(() => {
    canonicalWriteAuthorityRef.current = canonicalPageWriteAllowed;
    canonicalUnboundDraftRef.current = () => !setAsideDraftRef.current && (localSaveGenerationRef.current.dirty ||
      pendingSerializeRef.current !== null || Boolean(imeSerializeOwnerRef.current?.view.composing));
    canonicalSetAsideDraftRef.current = (base) => {
      const content = readLiveDocumentForSaveBase();
      if (!content) return false;
      const kept = { content, base: base ?? acknowledgedDocumentBaselineRef.current?.content ?? null };
      setAsideDraftRef.current = kept;
      setSetAsideDraft(kept);
      return true;
    };
    // The explicit Save's own proof: the live view's projection says what the
    // room says, once its verified maintenance (default attributes, generated
    // identities) is written there outside history. Never while a composition
    // or a coalesced serialization is still ahead of the room.
    canonicalViewMirrorsRoomRef.current = () => {
      const editor = paginationEditorRef.current;
      const why = !editor ? "no_editor" : !canonicalPageWriteAllowed ? "write_not_allowed"
        : pendingSerializeRef.current !== null ? "serialize_pending"
          : imeSerializeOwnerRef.current?.view.composing ? "composing" : null;
      canonicalViewMirrorRefusalRef.current = why;
      if (why || !editor) return false;
      try {
        const proven = prepareCanonicalDocumentExplicitSave(editor);
        if (!proven) canonicalViewMirrorRefusalRef.current = `prepare_${canonicalDocumentExplicitSaveRefusal(editor) ?? "refused"}`;
        return proven;
      } catch {
        canonicalViewMirrorRefusalRef.current = "prepare_threw";
        return false;
      }
    };
    documentCausalModel?.lease.refreshAuthority();
    // The model also reads the raw page verdict (through the autosave source):
    // republish it when that verdict changes, not only when this view's does.
  }, [canonicalPageWriteAllowed, documentCausalModel?.lease, pageWritable.known, pageWritable.writable]);
  const shellWriteAllowedRef = useRef(shellWriteAllowed);
  shellWriteAllowedRef.current = shellWriteAllowed;
  const collaborativeDocumentAttrsWritableRef = useRef(false);
  collaborativeDocumentAttrsWritableRef.current =
    shellWriteAllowed && collabTransportWritable;
  const publishCollaborativeDocumentAttrsRef = useRef<
    | ((sectionMutation?: CollaborativeDocumentSectionMutation | null) => void)
    | null
  >(null);
  const shellEventMayStart = useCallback(
    () =>
      documentShellEventMayStart({
        liveWriteAllowed: shellWriteAllowedRef.current,
        operationActive: Boolean(activeImportRef.current),
      }),
    [],
  );
  const shellControlWriteAllowed = documentShellEventMayStart({
    liveWriteAllowed: shellWriteAllowed,
    operationActive: importing,
  });
  // Under Word's "Comments" restriction the page may be saved (its comments)
  // but its text is locked: no editing authority beyond the comments
  // (commentOnlyLane.ts).
  const commentOnlyProtected = isDocumentCommentOnlyProtected(documentProtection);
  // A document held as parts whose edit cannot be split back into its parts
  // stops taking edits (useDocumentPageParts): nothing of it is saved.
  // An editing exception's region is edited under either restriction; the
  
  const editorMayEditBase =
    shellWriteAllowed && !importing && (!commentOnlyProtected || rangeExceptionsEditable);
  const editorMayEdit = editorMayEditBase && !documentPartsBlocked && !docsCatchingUp;
  const commentOnlyLane = shellWriteAllowed && !importing && commentOnlyProtected;
  // Reading View only parks the editing SURFACE; authority (`editorMayEdit`)
  // still drives saves, panes and every write-permission decision, so a
  // reader with unsaved edits keeps autosaving while they read.
  // A guest page sits on a local shared document that its first published
  // edit seeds. Editable before its content lands, the empty surface's own
  // normalization seeded it EMPTY, and the welcome page that followed was
  // rendered away as an unauthored change. It opens once the content is in.
  const editorSurfaceEditable =
    editorMayEdit && !readingViewActive && (!guestMode || editorHydrated);
  const editorSurfaceEditableRef = useRef(editorSurfaceEditable);
  editorSurfaceEditableRef.current = editorSurfaceEditable;
  // A whole document whose surface stops taking input on its own (its room's
  // session ended -- the page split under it is told so seconds later; its
  // save refused as stale; the split it asked for done): what is typed from
  // then on is held (armDocumentHandover), for the parts view if the page
  // turns out to be held as parts now, else typed back here once it takes
  // input again. Not for the reader's own Reading View or an import.
  const surfaceTookInput = underlyingShellWriteAllowed && !pageSplitting;
  const surfaceTookInputRef = useRef(surfaceTookInput);
  // Rendered not taking input on its own, the effect below not run yet: the
  // view is read-only already (the same render), and a long book's commit
  // can keep the effect a second or more behind the keys -- which reached a
  
  // between the view going read-only and its arm). The key listener below
  // arms on them itself.
  const surfaceStoppedUnarmedRef = useRef(false);
  // The editor had the focus when the page's own gates made it read-only for
  // a moment (see the editable toggle below).
  const viewFocusLostToReadOnlyRef = useRef(false);
  surfaceStoppedUnarmedRef.current = surfaceTookInputRef.current && !surfaceTookInput && !readingViewActive && !importing &&
    !documentPartsPage && editorHydrated && !previewMode && !guestMode;
  useEffect(() => {
    const was = surfaceTookInputRef.current;
    surfaceTookInputRef.current = surfaceTookInput;
    if (documentPartsPage || !editorHydrated || previewMode || guestMode) return;
    if (was && !surfaceTookInput && !readingViewActive && !importing) armDocumentHandoverRef.current();
    else if (!was && surfaceTookInput && !hydratedAsPartsRef.current && !setAsideDraftRef.current?.forParts &&
        !knownDocumentPartsPage(pageId)) {
      releaseDocumentHandoverRef.current();
    }
  }, [surfaceTookInput]); // eslint-disable-line react-hooks/exhaustive-deps -- on each change of the surface's input
  // Harness switch (`window.__docsEditableGates = []`): which input held the
  // surface read-only, each time one of them changes.
  const editableGates = [underlyingShellWriteAllowed, canonicalPreparing, pageSplitting, upgradeHeldBy === null,
    editingCausalMayWrite, importing, documentPartsBlocked, docsCatchingUp, readingViewActive, editorSurfaceEditable]
    .map((gate) => (gate ? 1 : 0)).join("");
  useEffect(() => {
    const sink = (window as Window & { __docsEditableGates?: unknown[] }).__docsEditableGates;
    if (Array.isArray(sink) && sink.length < 200) sink.push([Math.round(performance.now()), editableGates]);
  }, [editableGates]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      // A read-only member (page tier, notebook role, or someone else holding
      // the exclusive checkout) gets a genuinely non-editable surface. Before
      // this, their keystrokes were accepted, rendered, published to the room
      // — and then dropped by the relay and refused by the save path, so the
      
      editable: editorSurfaceEditable,
      extensions: editorExtensions,
      editorProps: {
        attributes: {
          class: "note-editor-content",
        },
        // Paste as Plain Text / Keep Text Only (Word/WPS Ctrl/⌘+Shift+V): arm
        // the next paste to strip marks, then trigger it. The async clipboard
        // read covers browsers where the chord does NOT fire a native paste; the
        // armed flag covers those where it DOES (handlePaste consumes it). We
        // never block the default chord on platforms that already match-style.
        handleKeyDown: (view, event) => {
          // Candidate digits/arrows/Enter belong to the active IME. The
          // capture-phase guard normally keeps this callback out of the path;
          // retain the predicate here for direct dispatch/tests and future
          // EditorView event routing changes.
          if (isImeCompositionActive(view, event)) return false;
          if (
            !shellWriteAllowedRef.current ||
            view.isDestroyed ||
            !view.editable
          ) {
            return false;
          }
          // Ctrl/⌘+Shift+Space → non-breaking space (U+00A0), Word/WPS parity.
          // (event.key is " " or "Spacebar" depending on the browser.)
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            !event.altKey &&
            (event.key === " " ||
              event.key === "Spacebar" ||
              event.code === "Space")
          ) {
            event.preventDefault();
            view.dispatch(view.state.tr.insertText(" ").scrollIntoView());
            return true;
          }
          if (!isPlainPasteShortcut(event)) return false;
          // Arm the next paste to strip marks, and ALWAYS schedule a safety
          // disarm so a chord that produces no paste can never strip a later,
          // ordinary paste by accident.
          plainPasteArmedRef.current = true;
          if (typeof window !== "undefined") {
            window.setTimeout(() => {
              plainPasteArmedRef.current = false;
            }, 1000);
          }
          const clipboard = (
            globalThis as {
              navigator?: { clipboard?: { readText?: () => Promise<string> } };
            }
          ).navigator?.clipboard;
          if (clipboard?.readText) {
            // Async path: read + insert ourselves (covers browsers where the
            // chord does NOT fire a native paste). preventDefault stops the
            // default chord; the armed flag is the race-guard for a paste event
            // that fires anyway (whichever runs first consumes the flag).
            event.preventDefault();
            const requestedDocument = view.state.doc;
            const requestedSelection = view.state.selection;
            void clipboard
              .readText()
              .then((text) => {
                if (!plainPasteArmedRef.current) return; // a paste event won the race
                plainPasteArmedRef.current = false;
                if (
                  !documentAsyncEditorWriteMayContinue({
                    liveWriteAllowed: shellWriteAllowedRef.current,
                    viewEditable: view.editable,
                    viewDestroyed: view.isDestroyed,
                    documentMatches: view.state.doc === requestedDocument,
                    selectionMatches:
                      view.state.selection === requestedSelection,
                  })
                ) {
                  return;
                }
                insertPlainTextParagraphs(view, normalizePastedPlainText(text));
              })
              .catch(() => {
                // Read denied/blocked: leave the flag armed (until the safety
                // timer) so a manual paste / the browser's own match-style paste
                // still strips marks.
              });
            return true;
          }
          // No async clipboard: fall through so the browser fires a paste event,
          // which handlePaste strips because the flag is armed.
          return false;
        },
        handlePaste: (view, event, slice) => {
          if (
            !previewMode &&
            !plainPasteArmedRef.current &&
            !toolbarPasteSpecialFormatForEvent(event) &&
            pasteModeRef.current === "keep" &&
            pasteParagraphIntoEmptyParagraph(view, slice)
          ) {
            event.preventDefault();
            return true;
          }
          if (previewMode) {
            event.preventDefault();
            return true;
          }
          return editorPasteHandlerRef.current?.(view, event) ??
            insertPlainTextTableFromPaste(view, event);
        },
      },
      onUpdate: ({ editor: ed, transaction, appendedTransactions = [] }) => {
        if (suppressEditorUpdateRef.current) return;
        // The idle heading-anchor back-fill (headingAnchors.ts) is the editor
        // filling in ids it derives from the headings: not an edit, and the
        // server treats a live-only `anchor_id` as such a fill-in. Saving it
        // re-sent a 909-block book on every open, 31 s a save on a loaded
        // machine, and the Copilot press that waited on it failed (AI70H
        // H18 C03).
        if (transaction?.getMeta(HEADING_ANCHOR_IDLE_BACKFILL_META)) return;
        // Structural rebalance moves blocks BETWEEN page containers; the
        // flat serialization is byte-identical, so skip the full-document
        // serialize + autosave queue entirely.
        if (canonicalReady) {
          if (!isCanonicalDocumentHistoryTransaction(ed) &&
              !hasCanonicalDocumentAuthoringTransaction(transaction, appendedTransactions)) return;
        } else if (transaction?.getMeta(REBALANCE_META)) return;
        // A later part of a Word document held as parts, appended as the
        // reader nears the end, is what the server already holds: loading it
        // is not an edit, and nothing of the page is saved for it.
        if (transaction?.getMeta(READ_ONLY_TRUSTED_MUTATION_META) === "document-part-load") return;
        // A readonly room projection may update through local normalization
        // plugins, but none of those display transactions is an unsaved edit.
        if (previewMode || (!guestMode && !shellWriteAllowedRef.current)) return;
        // TipTap can emit normalization/plugin transactions while the server
        // page is still hydrating. They are not user edits and have no durable
        // content-version baseline. Marking one dirty here poisoned the local
        // generation with a null base; every later, real edit then saved
        // successfully but could never clear the visible "未保存" state.
        const hydratedAtUpdate = editorHydratedRef.current;
        if (!hydratedAtUpdate) return;
        // Clean before this update (nothing queued or unacknowledged): an
        // update that leaves the author content as the server holds it is
        // then no edit (below).
        const cleanAtUpdate =
          !localSaveGenerationRef.current.dirty &&
          localSaveGenerationRef.current.queuedDraft === null;
        const localSaveMutationAtUpdate = beginLocalSaveMutation();
        const docAtUpdate = ed.state?.doc as ProseMirrorNode | undefined;
        const queueSaveAtUpdate = autosaveQueueSaveRef.current;
        const savedBaselineAtUpdate = acknowledgedDocumentBaselineRef.current;
        const userAuthoredDocumentMutationAtUpdate =
          isUserAuthoredDocumentMutation(transaction);
        if (
          guestMode &&
          onGuestDocumentChangeRef.current &&
          !guestEditBeforeRef.current &&
          userAuthoredDocumentMutationAtUpdate &&
          (guestUserHasActedRef.current?.() ?? true)
        ) {
          guestEditBeforeRef.current = (transaction?.before as ProseMirrorNode | undefined) ?? null;
        }
        // A collaborator's change the legacy room projected here is saved
        // only on a proven base, never as this member's own edit.
        const remoteProjectionAtUpdate = !canonicalReady &&
          isLegacyRoomProjectionUpdate(transaction, appendedTransactions);
        const titleAtUpdate = titleRef.current;
        const commit = (readLiveDocument = false, remoteProjection = remoteProjectionAtUpdate) => {
          const documentAtCommit = readLiveDocument
            ? (ed.state?.doc as ProseMirrorNode | undefined)
            : docAtUpdate;
          const deferPagination = inkLayoutUnsettled();
          // A document held as parts saves no whole-document layout records
          // (document-page-parts PRIVATE_LAYOUT_ATTRS): not read, not digested.
          const noLayoutRecords = partsSaveNoLayoutRecords();
          const normalized = normalizeDocumentForSave(
            (documentAtCommit?.toJSON
              ? runtimeDocumentJson(documentAtCommit)
              : ed.getJSON()) as Record<string, unknown>,
            !noLayoutRecords,
            deferPagination || noLayoutRecords,
          );
          paginationDeferredRef.current = deferPagination;
          if (deferPagination) schedulePaginationSettleRef.current();
          if (!normalized.ok) {
            rejectInvalidDocumentContent(normalized.issue);
            return;
          }
          const json = normalized.document;
          // A fresh serialization of this save, written into by no one: the
          // save takes it as its own body without copying it.
          markDocumentSaveBody(json as Record<string, unknown>);
          latestContentRef.current = json;
          documentPartsSerializedRef.current = documentAtCommit && !deferPagination
            ? { doc: documentAtCommit, document: json as Record<string, unknown> }
            : null;
          // Live part rooms take it as soon as it is read. A view that moved on
          // before this serialization ran is published as it is now
          // (publishViewToRooms serializes the live view): what moved it may be
          // a part loaded in the background or a member's change merged in,
          // neither of which serializes anything after it, and the edits of
          // this update then reached no room until the reader's next key
          
          // view, shown for minutes, never stored). Not while pagination is
          // deferred: its settle serializes again.
          if (documentAtCommit && !deferPagination) {
            if (ed.state?.doc !== documentAtCommit && documentPartsPublishRef.current) {
              traceDocsHandover({ step: "publish-moved-on" });
            }
            documentPartsPublishRef.current?.();
          }
          // Only a real editor transaction can arm destructive clear.
          // Hydration, normalization and other programmatic empty updates
          // remain uncredentialed and hit the server's fail-closed guard.
          intentionalEmptyOverwriteRef.current =
            resolveIntentionalEmptyOverwriteProof(
              intentionalEmptyOverwriteRef.current,
              userAuthoredDocumentMutationAtUpdate,
              json,
              savedBaselineAtUpdate,
            );
          onPlainTextChange?.(
            documentAtCommit
              ? documentAtCommit.textBetween(
                  0,
                  documentAtCommit.content.size,
                  "\n\n",
                )
              : ed.getText(),
          );
          if (guestMode) {
            const observe = onGuestDocumentChangeRef.current;
            if (observe) {
              if (!guestEditBaseRef.current && guestEditBeforeRef.current) {
                const before = normalizeDocumentForSave(
                  runtimeDocumentJson(guestEditBeforeRef.current) as Record<string, unknown>,
                  false,
                );
                if (before.ok) guestEditBaseRef.current = before.document as Record<string, unknown>;
              }
              if (guestEditBaseRef.current) {
                observe({ base: guestEditBaseRef.current, final: json as Record<string, unknown> });
              }
            }
            return;
          }
          // What opening a page fills in by itself (ids on nested items, a
          // heading's anchor, schema defaults, the pages it measured, a mark
          // order) is not an edit: a page whose author content is still the
          // server's is not saved. Opening the 50-page imported novel saved
          // the whole book (v2 to v3, 30-120 s) and staled the first Copilot
          // circle (AI70H H18–H35 C03/C04; docs/copilot/region-bound-ask.md).
          // Pagination records ride along with the next real save.
          if (
            cleanAtUpdate &&
            !remoteProjection &&
            savedBaselineAtUpdate?.pageId === importPageIdRef.current &&
            titleAtUpdate === (savedBaselineAtUpdate.title ?? titleAtUpdate) &&
            sameDocumentAuthorContent(
              json as Record<string, unknown>,
              savedBaselineAtUpdate.content,
              documentRootDefaults(ed.schema),
            )
          ) {
            const state = localSaveGenerationRef.current;
            if (
              state.pageId === localSaveMutationAtUpdate.pageId &&
              state.generation === localSaveMutationAtUpdate.generation &&
              state.queuedDraft === null
            ) {
              localSaveGenerationRef.current = { ...state, dirty: false };
              setTrackedLocalSaveStatus("saved");
              return;
            }
          }
          const draft: PageDocumentDraft = {
            ...emptyOverwriteAuthorityForDraft(
              json,
              savedBaselineAtUpdate,
              intentionalEmptyOverwriteRef.current,
            ),
            content_json: json,
            title: titleAtUpdate,
          };
          if (!markLocalSaveMutationQueued(localSaveMutationAtUpdate, draft)) {
            return;
          }
          if (remoteProjection) queueSaveAtUpdate(draft, { origin: "remote-projection" });
          else queueSaveAtUpdate(draft);
        };
        const runtimeView = (ed as Editor & { view?: EditorView }).view;
        if (
          (runtimeView && isImeCompositionActive(runtimeView)) ||
          (transaction && hasImeCompositionTransaction([transaction]))
        ) {
          // Each composition update replaces this callback. At settle it reads
          // the LIVE final state, so `ni hao` can never enter the draft and the
          // selected `你好` is serialized exactly once.
          const ownerPageIdAtUpdate = importPageIdRef.current;
          imeSerializeOwnerRef.current =
            runtimeView && ownerPageIdAtUpdate
              ? {
                  pageId: ownerPageIdAtUpdate,
                  editor: ed,
                  view: runtimeView,
                }
              : null;
          // The settled composition is this member's input, whatever
          // update happened to arrive last.
          imeSerializeQueueRef.current?.defer(() => commit(true, false));
          return;
        }
        clearImeSerializeQueue();
        // Optional-chained: mock editors in tests have no state tree, and
        // they must stay on the synchronous path.
        const nodeSize = ed.state?.doc?.nodeSize ?? 0;
        // A pen writing: coalesced like a large document's, and held until
        // the writing pauses (the timer below asks the ink gate).
        const penWriting = inkWritingActive();
        if (document.visibilityState === "hidden" ||
            (!penWriting && nodeSize < LARGE_DOC_SERIALIZE_NODE_SIZE && !documentHasWhiteboardScene(docAtUpdate))) {
          commit();
          return;
        }
        // Large document: getJSON + normalize + getText are full-document
        // traversals — running them per keystroke froze typing. Coalesce
        // to the trailing edge; flushPendingContentSerialize() runs the
        // latest commit early for readers that need fresh content NOW.
        // The coalesced body carries every update since the last one, so it
        // is a projection only when all of them were.
        const coalescedAuthored = !remoteProjectionAtUpdate ||
          (pendingSerializeRef.current as { authored?: boolean } | null)?.authored === true;
        pendingSerializeRef.current = Object.assign(
          () => commit(false, !coalescedAuthored),
          { authored: coalescedAuthored },
        );
        if (serializeTimerRef.current !== null) {
          window.clearTimeout(serializeTimerRef.current);
        }
        const runPendingSerialize = () => {
          serializeTimerRef.current = null;
          if (inkSerializeGateRef.current?.hold(runPendingSerialize)) return;
          if (typingSerializeGateRef.current?.hold(runPendingSerialize)) return;
          const run = pendingSerializeRef.current;
          pendingSerializeRef.current = null;
          run?.();
        };
        serializeTimerRef.current = window.setTimeout(runPendingSerialize, LARGE_DOC_SERIALIZE_DELAY_MS);
      },
    },
    // Rebuild the editor when the extension list changes identity. On the OFF
    // (USE_COLLAB_EDITING=false) path `editorExtensions` is a stable reference
    // (see the memo above), so this is a no-op across navigation — the editor is
    // built once exactly as before. On the ON path a page change yields a new
    // collab session → new `editorExtensions` → the editor is rebuilt so its
    // Collaboration extension binds to the live Y.Doc instead of a destroyed one.
    [
      beginLocalSaveMutation,
      buildSaveDraft,
      editorExtensions,
      markLocalSaveMutationQueued,
    ],
  );
  // Rebuilt while the page stays open (its collaboration binding changed:
  // the first-open upgrade landing after the writer began), the editor keeps
  // the writer's caret, scroll and focus (useEditorContinuity).
  useEditorContinuity(isUsableEditor(editor) ? (editor as unknown as Editor) : null, pageId);
  // The live editor for callers outside this component (the embedded
  // editor's Automation API): their commands dispatch here, so Undo, the
  // room and the autosave take them as they take typing.
  // Registered once the page's content is in (what the loading state below
  // waits for): a caller reads the file, never the empty page shown while it
  // is prepared, and the embedded editor's ready waits for it.
  const liveEditorContentIn =
    editorHydrated && (guestMode || !autosave.loading) && documentOfficeDataSettled;
  const liveEditor =
    isUsableEditor(editor) && surfaceMode === "editor" && liveEditorContentIn ? (editor as unknown as Editor) : null;
  useEffect(() => (liveEditor ? registerLiveEditor(pageId, { kind: "document", editor: liveEditor }) : undefined), [liveEditor, pageId]);

  // ---- A Word document held as parts (A2, lib/document-page-parts) --------
  // Its later parts are appended as the reader nears the end, and (writable)
  // saved part by part; the page saves the body.
  const flatDocumentPartOnce = useCallback((blocks: readonly unknown[]) => {
    const body = autosave.page?.content_json;
    if (!body || typeof body !== "object") return null;
    const attrs = { ...((body as { attrs?: Record<string, unknown> }).attrs ?? {}) };
    // The body's layout receipts are its own blocks', not this part's.
    delete attrs.pageBlockSizes;
    delete attrs.pageBlockLayoutKey;
    delete attrs.pageRegionLayoutReceipt;
    const part = { type: "doc", attrs, content: [...blocks] };
    registerDocumentPictureReferences(pageId, part, autosave.page?.notebook_id);
    const normalized = normalizeDocumentForSave(part);
    return normalized.ok ? hydrateLegacyDocxOfficeMathStyles(normalized.document) : null;
  }, [autosave.page, normalizeDocumentForSave, pageId]);
  // Asked for the kept layout and again to append it: made once per part.
  const flatPartsMade = useRef(new WeakMap<readonly unknown[], { maker: unknown; flat: ReturnType<typeof flatDocumentPartOnce> }>());
  const flatDocumentPart = useCallback((blocks: readonly unknown[]) => {
    const made = flatPartsMade.current.get(blocks);
    if (made && made.maker === flatDocumentPartOnce) return made.flat;
    const flat = flatDocumentPartOnce(blocks);
    flatPartsMade.current.set(blocks, { maker: flatDocumentPartOnce, flat });
    return flat;
  }, [flatDocumentPartOnce]);
  // The pages kept for a part (layoutSnapshot), once its fonts are known to
  // read as they did when it was laid out; null: laid out as ever.
  const keptLayoutOfDocumentPart = useCallback(async (blocks: readonly unknown[], index: number): Promise<KeptPartLayout | null> => {
    if (!pageId || !layoutSnapshotsEnabled()) return null;
    const flat = flatDocumentPart(blocks);
    if (!flat) return null;
    const found = snapshotReceiptFor(pageId, index, flat as JSONContent, "part");
    if (!found || !(await rowFontsHold(found.row, flat as JSONContent))) return null;
    return { row: found.row, receipt: found.receipt };
  }, [flatDocumentPart, pageId]);
  const appendDocumentPartBlocks = useCallback((blocks: readonly unknown[], partIndex?: number, keptLayout?: KeptPartLayout | null): boolean => {
    const target = editor;
    if (!isUsableEditor(target)) return false;
    const flat = flatDocumentPart(blocks);
    if (!flat) return false;
    const restored = keptLayout ? restorePaginationProjection(flat as JSONContent, keptLayout.receipt) : null;
    const paged = restored ?? hydrateStoredPageBlocks(flat, null, null);
    const pages = (paged as { content?: unknown }).content;
    if (!Array.isArray(pages) || pages.length === 0) return false;
    try {
      const view = (target as unknown as { view: EditorView }).view;
      const nodes = pages.map((json) => view.state.schema.nodeFromJSON(json));
      const at = view.state.doc.content.size;
      const transaction = view.state.tr;
      // Its first blocks stand on the last sheet of what is loaded.
      const row = restored ? keptLayout!.row : null;
      const carried = row?.continues && view.state.doc.lastChild ? nodes.shift() : null;
      if (carried) transaction.insert(at - 1, carried.content);
      const end = transaction.doc.content.size;
      if (nodes.length) transaction.insert(end, Fragment.fromArray(nodes));
      // A part coming in on its kept layout, past what the reader sees: its
      // pages stand hollow (drawn when the reader nears them), so loading it
      // costs the plan, not its 45k nodes' DOM. One with no layout kept is drawn
      // whole: its blocks have to be read anyway, and hollow pages with nothing
      // kept are drawn again a few at a time for each pass to read them (a
      // book's cold opening: the first pass 25 s later, every early pass seconds
      // long); the ledger hollows them once it has read them.
      if (restored && viewMayDrawHollow(view, transaction.doc)) {
        const hollow: number[] = [];
        nodes.reduce((pos, node) => {
          hollow.push(pos);
          return pos + node.nodeSize;
        }, end);
        if (hollow.length) transaction.setMeta(pageHollowSheetsKey, { hollow });
      }
      const pagesBefore = view.state.doc.childCount;
      notePartArrived(view.dom);
      // The text the reader looks at stays where it is in the view (readerAnchor).
      dispatchKeepingReader(view, trustReadOnlyDocumentMutation(transaction, "document-part-load"));
      // Read off the document as it stands: what comes in with it (an inline
      // atom's marks drawn from its run style) makes new nodes of some blocks,
      // and a measurement goes by the node.
      if (row && pageId) {
        const docNow = view.state.doc;
        const seeded: ProseMirrorNode[][] = [];
        if (carried) {
          const last = docNow.child(pagesBefore - 1).content.content as ProseMirrorNode[];
          seeded.push(last.slice(last.length - carried.childCount));
        }
        for (let index = pagesBefore; index < docNow.childCount; index += 1) {
          seeded.push(docNow.child(index).content.content as ProseMirrorNode[]);
        }
        if (seedPartMeasures(seeded, row)) {
          noteRestoredPart(pageId, partIndex ?? row.part, seeded);
          noteRestoredSheets(view.dom, pageId, pagesBefore, docNow.childCount);
        }
      }
      return true;
    } catch {
      return false;
    }
  }, [editor, flatDocumentPart, pageId]);
  // A part's blocks laid out as this editor lays out stored blocks (as
  // appendDocumentPartBlocks does), for a part merged after a save conflict.
  const pagedPartOf = useCallback((blocks: readonly unknown[]): Record<string, unknown> | null => {
    const body = autosave.page?.content_json;
    if (!body || typeof body !== "object") return null;
    const attrs = { ...((body as { attrs?: Record<string, unknown> }).attrs ?? {}) };
    delete attrs.pageBlockSizes;
    delete attrs.pageBlockLayoutKey;
    delete attrs.pageRegionLayoutReceipt;
    const normalized = normalizeDocumentForSave({ type: "doc", attrs, content: [...blocks] });
    if (!normalized.ok) return null;
    return hydrateStoredPageBlocks(hydrateLegacyDocxOfficeMathStyles(normalized.document), null, null) as Record<string, unknown>;
  }, [autosave.page, normalizeDocumentForSave]);
  const editorFormOfPartBlocks = useCallback((blocks: readonly unknown[]): unknown[] | null => {
    const target = editor;
    const paged = pagedPartOf(blocks);
    if (!isUsableEditor(target) || !paged) return null;
    try {
      const doc = (target as unknown as { view: EditorView }).view.state.schema.nodeFromJSON(paged);
      const normalized = normalizeDocumentForSave(runtimeDocumentJson(doc) as Record<string, unknown>, true, false);
      const content = normalized.ok ? (normalized.document as { content?: unknown }).content : null;
      return Array.isArray(content) ? content : null;
    } catch {
      return null;
    }
  }, [editor, normalizeDocumentForSave, pagedPartOf]);
  // The editor's blocks of a part (`current`, each found by block id) made
  // `merged`: blocks gone are deleted, changed ones replaced, new ones
  // placed after the block before them. A block the layout holds in more
  // than one piece (a table, a list cut across sheets) is written whole in
  // its first piece's place (documentPartMerge mergedPartTransaction).
  const mergePartBlocksIntoView = useCallback((
    current: readonly unknown[], merged: readonly unknown[], caret?: { readonly block: string; readonly offset: number },
  ): boolean => {
    const target = editor;
    if (!isUsableEditor(target)) return false;
    const view = (target as unknown as { view: EditorView }).view;
    const nodeOf = (block: unknown): ProseMirrorNode | null => {
      const paged = pagedPartOf([block]);
      const pages = paged && Array.isArray(paged.content) ? (paged.content as Array<{ type?: string; content?: unknown[] }>) : null;
      const blocks = pages?.flatMap((page) => (page.type === "pageBlock" ? page.content ?? [] : [page])) ?? [];
      if (blocks.length !== 1) return null;
      try { return view.state.schema.nodeFromJSON(blocks[0]); } catch { return null; }
    };
    try {
      const tr = mergedPartTransaction(view.state, current, merged, nodeOf, caret);
      if (!tr) {
        console.warn("[part-room] a part's change could not be written into the view", lastMergeRefusal);
        return false;
      }
      // Another member's words: this member's Undo steps around them, and
      // never takes them out.
      if (tr.docChanged) view.dispatch(trustReadOnlyDocumentMutation(tr.setMeta("addToHistory", false), "document-part-merge"));
      return true;
    } catch (error) {
      console.warn("[part-room] a part's change could not be written into the view", error);
      return false;
    }
  }, [editor, pagedPartOf]);
  // A part's blocks and the body's as the store keeps them (no attribute at
  // its null default: the split's own form, half the size of the editor's).
  const storedFormOfPartBlocks = useCallback((blocks: readonly unknown[]): unknown[] => {
    const schema = isUsableEditor(editor) ? (editor as unknown as { schema?: Schema }).schema : null;
    return schema ? storedFormOfBlocks(blocks, schema) : [...blocks];
  }, [editor]);
  const readHydrationApplied = useCallback(() => hydrationAppliedRef.current, []);
  const serializeDocumentForParts = useCallback((): Record<string, unknown> | null => {
    const target = editor;
    if (!isUsableEditor(target)) return null;
    const doc = (target as unknown as { state?: { doc?: ProseMirrorNode } }).state?.doc;
    if (!doc) return null;
    const serialized = documentPartsSerializedRef.current;
    if (serialized?.doc === doc) return serialized.document;
    const normalized = normalizeDocumentForSave(runtimeDocumentJson(doc) as Record<string, unknown>, true, false);
    return normalized.ok ? (normalized.document as Record<string, unknown>) : null;
  }, [editor, normalizeDocumentForSave]);
  // The view for the part rooms: the save's own serialization of this very
  // document when there is one, else the blocks without the layout records (a
  // receipt measured off every sheet of a long document, which the rooms never
  // carry: publishing before each change another member made measured them
  // all, and two members typing kept a busy machine's main thread on it).
  const documentRoomsSerializedRef = useRef<{ doc: ProseMirrorNode; document: Record<string, unknown> } | null>(null);
  const serializeDocumentForRooms = useCallback((): Record<string, unknown> | null => {
    const target = editor;
    if (!isUsableEditor(target)) return null;
    const doc = (target as unknown as { state?: { doc?: ProseMirrorNode } }).state?.doc;
    if (!doc) return null;
    const serialized = documentPartsSerializedRef.current;
    if (serialized?.doc === doc) return serialized.document;
    const kept = documentRoomsSerializedRef.current;
    if (kept?.doc === doc) return kept.document;
    const normalized = normalizeDocumentForSave(runtimeDocumentJson(doc) as Record<string, unknown>, false, false);
    if (!normalized.ok) return null;
    const document = normalized.document as Record<string, unknown>;
    documentRoomsSerializedRef.current = { doc, document };
    return document;
  }, [editor, normalizeDocumentForSave]);
  // Every part of the view serialized by itself, as the rooms serialize the
  // view (no layout measured: the records it would add are the body's attrs,
  // never a part's blocks), a part whose nodes did not change not again.
  const documentPartSerializationsRef = useRef<{ kept: PartSerializations }>({ kept: [] });
  const serializeDocumentParts = useCallback((owner: ReadonlyMap<string, number>, loaded: number): unknown[][] | null => {
    const target = editor;
    if (!isUsableEditor(target)) return null;
    const doc = (target as unknown as { state?: { doc?: ProseMirrorNode } }).state?.doc;
    if (!doc) return null;
    const memo = documentPartSerializationsRef.current;
    return serializeViewParts(doc, owner, loaded, (sheets) => {
      const normalized = normalizeDocumentForSave(
        runtimeDocumentJson(doc.type.create(doc.attrs, Fragment.fromArray([...sheets]))) as Record<string, unknown>, false, false,
      );
      const content = normalized.ok ? (normalized.document as { content?: unknown }).content : null;
      return Array.isArray(content) ? content : null;
    }, memo.kept);
  }, [editor, normalizeDocumentForSave]);
  // Live part rooms (lib/collab/document-word-part-room): what the rooms need
  // of the view. A view that takes its body from the rooms never asks the page
  // to save it, so the save's receipt that normally says "saved" never comes:
  // a page whose rooms hold everything says so here.
  const documentPartRoomsSettledRef = useRef<() => void>(() => undefined);
  const documentPartPresenceRef = useRef<DocumentPartPresence | null>(null);
  const documentPartsSelf = useSelfCollabIdentity();
  documentPartRoomsSettledRef.current = () => {
    const state = localSaveGenerationRef.current;
    const page = autosave.page;
    if (!state.dirty || state.queuedGeneration !== state.generation || !page || state.pageId !== page.id) return;
    acknowledgeLocalSaveMutation({ pageId: state.pageId, generation: state.generation }, page, true);
  };
  const documentPartRoomsView = useMemo<DocumentPartRoomsView | null>(() => {
    if (!USE_COLLAB_EDITING || guestMode || previewMode || !isUsableEditor(editor)) return null;
    const viewOf = () => (editor as unknown as { view?: EditorView }).view ?? null;
    return {
      schema: () => {
        const schema = viewOf()?.state.schema;
        return schema ? canonicalDocumentSchema(schema) : null;
      },
      viewDoc: () => viewOf()?.state.doc ?? null,
      composing: () => viewOf()?.composing === true,
      caret: () => {
        const state = viewOf()?.state;
        const selection = state?.selection;
        if (!state || !selection || !selection.empty) return null;
        const parent = selection.$head.parent;
        // A list or quote continued on the next sheet is read whole another way: not followed.
        if (!parent.isTextblock || selection.$head.depth > 2 || parent.attrs?.pageSplitContinuation) return null;
        const block = splitPieceRoot(parent.attrs);
        if (!block) return null;
        // In a block cut across sheets, the offset is the whole block's, as the room holds it: the pieces before
        // this one come first.
        let before = 0;
        if (parent.attrs?.pageSplitPieceOf) {
          let reached = false;
          state.doc.forEach((sheet) => {
            if (reached) return;
            const visit = (node: ProseMirrorNode) => {
              if (reached) return;
              if (node === parent) { reached = true; return; }
              if (node.isTextblock && splitPieceRoot(node.attrs) === block) before += node.content.size;
            };
            if (sheet.type.name === "pageBlock") sheet.forEach(visit);
            else visit(sheet);
          });
          if (!reached) return null;
        }
        return { block, offset: before + selection.$head.parentOffset };
      },
      // The blocks of the sheets two versions of the view differ in (whole
      // blocks), serialized as the rooms read them: a key's publish reads a
      // sheet or two, not the whole document.
      partBlocks: (index, owner, loaded) => {
        const doc = viewOf()?.state.doc;
        if (!doc) return null;
        // As the whole view's serialization gives them (serializeDocumentForRooms), when it is at hand.
        const sheets = partSheetsOfView(doc, owner, loaded, index);
        if (!sheets) return null;
        const normalized = normalizeDocumentForSave(
          runtimeDocumentJson(doc.type.create(doc.attrs, Fragment.fromArray(sheets))) as Record<string, unknown>, false, false,
        );
        const content = normalized.ok ? (normalized.document as { content?: unknown }).content : null;
        return Array.isArray(content) ? content : null;
      },
      changedBlocks: (previous, next) => {
        if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return null;
        const [before, after] = [previous as ProseMirrorNode, next as ProseMirrorNode];
        if (before.type !== after.type) return null;
        // Only the blocks that changed (changedBlockPieces): the ones the pages only moved between sheets are the
        // same nodes and are not read. Each changed block with all its pieces, read as one block.
        const changed = changedBlockPieces(before, after, DOCUMENT_PART_SCOPED_PUBLISH_SHEETS);
        if (!changed) return null;
        const sheetType = after.firstChild?.type;
        const serialize = (pieces: readonly ProseMirrorNode[]): unknown[] | null => {
          if (pieces.length === 0) return [];
          const sheet = sheetType?.name === "pageBlock" ? [sheetType.create(null, Fragment.fromArray(pieces))] : [...pieces];
          const normalized = normalizeDocumentForSave(
            runtimeDocumentJson(after.type.create(after.attrs, Fragment.fromArray(sheet))) as Record<string, unknown>, false, false,
          );
          const content = normalized.ok ? (normalized.document as { content?: unknown }).content : null;
          return Array.isArray(content) ? content : null;
        };
        const wasBlocks = serialize(changed.before);
        const nowBlocks = wasBlocks ? serialize(changed.after) : null;
        return wasBlocks && nowBlocks ? { before: wasBlocks, after: nowBlocks } : null;
      },
      applyAttrs: (attrs) => {
        const view = viewOf();
        if (!view) return;
        const tr = view.state.tr;
        for (const [key, value] of Object.entries(attrs)) {
          if (!Object.hasOwn(view.state.doc.attrs, key) || pageDocumentJsonEquals(view.state.doc.attrs[key], value)) continue;
          tr.setDocAttribute(key, value);
        }
        if (tr.docChanged) {
          view.dispatch(trustReadOnlyDocumentMutation(tr.setMeta("addToHistory", false), "document-part-merge"));
        }
      },
      bodySaved: (contentVersion) => autosave.noteVersionSavedElsewhere(contentVersion),
      settled: () => documentPartRoomsSettledRef.current(),
      presence: (bytes) => documentPartPresenceRef.current?.receive(bytes),
      joined: () => documentPartPresenceRef.current?.noteSelection(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the hook's ref is the same for the page's life
  }, [editor, guestMode, previewMode, autosave.noteVersionSavedElsewhere]);
  // Whether the pages' ledger is still laying the document out: its first
  // layout, its background, or a pass held for typing to pause.
  const documentPartsLayoutBusy = useCallback((): boolean => {
    const dom = isUsableEditor(editor) ? (editor as unknown as { view?: EditorView }).view?.dom : null;
    if (!dom) return true;
    return dom.getAttribute("data-pagination-initial-settling") === "true" ||
      dom.hasAttribute(PAGE_LEDGER_BACKGROUND_ATTR) || dom.hasAttribute(PAGE_LEDGER_DEFERRED_ATTR);
  }, [editor]);
  // The first screen is still to come: its first layout settling, or the
  // display font plan (documentDisplayFonts) still to answer.
  const documentPartsFirstScreenPending = useCallback((): boolean => {
    const dom = isUsableEditor(editor) ? (editor as unknown as { view?: EditorView }).view?.dom : null;
    if (!dom) return true;
    return dom.getAttribute("data-pagination-initial-settling") === "true" ||
      dom.getAttribute("data-document-display-fonts") === "loading";
  }, [editor]);
  // The block ids the view holds (a part coming in is checked against them).
  const documentPartsViewBlockIds = useCallback((): ReadonlySet<string> | null => {
    const doc = isUsableEditor(editor) ? (editor as unknown as { state?: { doc?: ProseMirrorNode } }).state?.doc : null;
    return doc ? viewBlockIdsOf(doc) : null;
  }, [editor]);
  const documentParts = useDocumentPageParts({
    pageId,
    body: documentPartsPage ? autosave.page?.content_json : null,
    hydration: hydrationCount,
    hydrated: editorHydrated,
    writable: editorMayEditBase,
    appendBlocks: appendDocumentPartBlocks,
    keptLayoutOf: keptLayoutOfDocumentPart,
    layoutBusy: documentPartsLayoutBusy,
    firstScreenPending: documentPartsFirstScreenPending,
    serialize: serializeDocumentForParts,
    serializeForRooms: serializeDocumentForRooms,
    serializeParts: serializeDocumentParts,
    editorFormOf: editorFormOfPartBlocks,
    viewBlockIds: documentPartsViewBlockIds,
    mergePartIntoView: mergePartBlocksIntoView,
    partRooms: documentPartRoomsView,
    storedForm: storedFormOfPartBlocks,
    hydrationToken: readHydrationApplied,
  });
  // The view as stored, part by part (a page held as parts): read by the wait
  // for a closing tab's save, which compared the whole view with the body alone.
  const docsViewHoldsStoredRef = useRef<((storedBody: unknown) => Promise<boolean | null>) | null>(null);
  docsViewHoldsStoredRef.current = documentPartsPage ? documentParts.viewHoldsStored : null;
  // Whether a later part is coming in, and how many are still out of the view,
  // on the editor's root (read by the pages' ledger, which holds its structural
  // rebalance while parts arrive: R397-D28, 43 parts, rebalanced after each).
  const documentPartsArriving = documentPartsArrivingAttrs(documentPartsPage, documentParts.state);
  const documentPartsLoading = documentPartsArriving?.loading ?? null;
  const documentPartsLeft = documentPartsArriving?.left ?? null;
  const documentPartsEager = documentPartsArriving?.eager ?? null;
  useEffect(() => {
    const dom = isUsableEditor(editor) ? (editor as unknown as { view?: EditorView }).view?.dom : null;
    if (!dom) return;
    if (documentPartsLoading === null || documentPartsLeft === null) {
      delete dom.dataset.documentPartsLoading;
      delete dom.dataset.documentPartsLeft;
      delete dom.dataset.documentPartsEager;
      return;
    }
    dom.dataset.documentPartsLoading = documentPartsLoading;
    dom.dataset.documentPartsLeft = documentPartsLeft;
    dom.dataset.documentPartsEager = documentPartsEager ?? "false";
  }, [documentPartsEager, documentPartsLeft, documentPartsLoading, editor]);
  documentPartsSavedTitleRef.current = autosave.page?.title ?? null;
  documentPartsStoredBodyRef.current = autosave.page?.content_json ?? null;
  const documentPartsSaveLaterTries = useRef({ timer: null as number | null, tries: 0 });
  useEffect(() => () => {
    const later = documentPartsSaveLaterTries.current;
    if (later.timer !== null) window.clearTimeout(later.timer);
    later.timer = null;
    later.tries = 0;
  }, [pageId]);
  documentPartsSaveLaterRef.current = () => {
    const later = documentPartsSaveLaterTries.current;
    if (later.timer !== null || later.tries >= 600) return;
    later.tries += 1;
    later.timer = window.setTimeout(() => {
      later.timer = null;
      void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
    }, 500);
  };
  useEffect(() => {
    // Taken: the next not-yet starts its count again.
    if (autosave.saveStatus === "saved") documentPartsSaveLaterTries.current.tries = 0;
  }, [autosave.saveStatus]);
  // Another member's room save moved the page's version on: a rename from here
  // is made on it (the page's save sends no body while the room holds it).
  const noteVersionSavedElsewhere = autosave.noteVersionSavedElsewhere;
  useEffect(() => {
    if (!documentPartsPage || !pageId) return undefined;
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string; contentVersion?: unknown }>).detail;
      if (detail?.pageId === pageId && typeof detail.contentVersion === "number" && pageHeldByPartRoom(pageId)) {
        noteVersionSavedElsewhere(detail.contentVersion);
      }
    };
    window.addEventListener(PAGE_REMOTE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PAGE_REMOTE_SAVED_EVENT, onSaved);
  }, [documentPartsPage, noteVersionSavedElsewhere, pageId]);
  // Where the others are, on the page's own carets layer.
  const sendDocumentPartPresence = documentParts.sendPresence;
  useEffect(() => {
    if (!documentPartsPage || !documentPartRoomsView || !isUsableEditor(editor)) return undefined;
    const target = editor as unknown as Editor;
    const view = (target as unknown as { view?: EditorView }).view;
    if (!view) return undefined;
    const presence = new DocumentPartPresence(view, { id: documentPartsSelf.id, name: documentPartsSelf.name }, sendDocumentPartPresence);
    documentPartPresenceRef.current = presence;
    const onSelection = () => presence.noteSelection();
    const onTransaction = () => presence.noteDocument();
    target.on("selectionUpdate", onSelection);
    target.on("transaction", onTransaction);
    presence.noteSelection();
    return () => {
      target.off("selectionUpdate", onSelection);
      target.off("transaction", onTransaction);
      if (documentPartPresenceRef.current === presence) documentPartPresenceRef.current = null;
      presence.destroy();
    };
  }, [documentPartRoomsView, documentPartsPage, documentPartsSelf.id, documentPartsSelf.name, editor, sendDocumentPartPresence]);
  // Each change of the view reaches the part rooms within a moment, not only
  // with the page's own (typing-paused) serialization.
  const noteDocumentPartsViewChanged = documentParts.noteViewChanged;
  useEffect(() => {
    if (!documentPartsPage || !documentPartRoomsView || !isUsableEditor(editor)) return undefined;
    const target = editor as unknown as Editor;
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) noteDocumentPartsViewChanged?.();
    };
    target.on("transaction", onTransaction);
    return () => { target.off("transaction", onTransaction); };
  }, [documentPartRoomsView, documentPartsPage, editor, noteDocumentPartsViewChanged]);
  useLayoutEffect(() => {
    documentPartsPrepareRef.current = documentPartsPage ? documentParts.prepareContent : null;
    documentPartsCutSaidMeantRef.current = documentParts.bodyCutSaidMeant;
    documentPartsPublishRef.current = documentPartsPage ? documentParts.publishEdits : null;
  }, [documentParts.bodyCutSaidMeant, documentParts.prepareContent, documentParts.publishEdits, documentPartsPage]);
  useEffect(() => {
    setDocumentPartsBlocked(documentPartsPage && documentParts.state.blocked !== null);
  }, [documentParts.state.blocked, documentPartsPage]);
  useEffect(() => {
    setDocumentPartsSaving(documentPartsPage && documentParts.state.saving);
  }, [documentParts.state.saving, documentPartsPage]);
  useLayoutEffect(() => {
    saveBaseEditorRef.current = isUsableEditor(editor)
      ? (editor as unknown as { state?: { doc?: { toJSON(): unknown } } }) : null;
    saveBaseNormalizeRef.current = (json) => {
      const normalized = normalizeDocumentForSave(json, false, partsSaveNoLayoutRecords());
      return normalized.ok ? normalized.document : null;
    };
  }, [editor, normalizeDocumentForSave, partsSaveNoLayoutRecords]);
  const displayFonts = useDocumentDisplayFonts(editor, {pageId, notebookId: autosave.page?.notebook_id,
    version: autosave.page?.content_version, enabled: !guestMode && editorHydrated,
    lineMetricsTarget: WORD_LINE_METRICS_TARGET});
  useHandedDocumentDisplayFonts(editor as unknown as Editor | null, handedDisplayFontPlan, guestMode && editorHydrated, WORD_LINE_METRICS_TARGET);

  // A save can come back with this page's embedded font records rewritten: a
  // subset the text outgrew is re-subset from the packaged face, and a record
  // whose page-owned asset has since been recycled is rebound to the one that
  // replaced it. Adopt the rewritten records here. Without this the open
  // document keeps painting the narrow subset until it is reopened, and every
  // later save re-sends an asset id the page no longer owns.
  const adoptedFontAcknowledgementRef = useRef<unknown>(null);
  const adoptedFontLeaseRef = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    adoptedFontLeaseRef.current?.();
    adoptedFontLeaseRef.current = null;
    adoptedFontAcknowledgementRef.current = null;
  }, [pageId]);
  useEffect(() => {
    const acknowledgement = autosave.lastSaveAcknowledgement;
    const baseline = acknowledgedDocumentBaselineRef.current;
    const generation = localSaveGenerationRef.current;
    if (!editor || editor.isDestroyed || guestMode || !acknowledgement || !baseline ||
      adoptedFontAcknowledgementRef.current === acknowledgement ||
      acknowledgement.page.id !== pageId || acknowledgement.source === "server-match" ||
      autosave.saveStatus !== "saved" || autosave.isDirty || autosave.isSaving ||
      autosave.hasConflict || autosave.loading || autosave.isCachedPreview ||
      autosave.isLocalAuthorityPending || generation.pageId !== pageId || generation.dirty ||
      baseline.pageId !== pageId ||
      baseline.contentVersion !== acknowledgement.page.content_version) return;
    // The draft this save acknowledged is what the rewritten records must be
    // proven against; the baseline above only establishes that nothing has been
    // typed since, so the live document still carries exactly those records.
    const adoption = readAdoptedDocumentFontRecords({
      receipt: acknowledgement.page.editable_page_patchback,
      draft: acknowledgement.draft.content_json,
      saved: acknowledgement.page.content_json,
    });
    if (!adoption) return;
    adoptedFontAcknowledgementRef.current = acknowledgement;
    const scope = captureSavedPageHotCacheScope();
    let cancelled = false;
    void (async () => {
      const target = editor.view.dom.ownerDocument;
      // Lease and load the replacement BEFORE any record names it. A mark
      // carrying an asset paints under that asset's own `MRAI-Font-<sha>`
      // family, which is registered from the page's lease, so records that
      // arrived first would repaint the document in a fallback face.
      const release = retainOfficeFontAssets(adoption.assets, target);
      await Promise.all(adoption.assets.map(asset => registerLeasedFontAsset(asset, target)));
      const current = localSaveGenerationRef.current;
      if (cancelled || editor.isDestroyed || !isSavedPageHotCacheScopeCurrent(scope) ||
        acknowledgedDocumentBaselineRef.current !== baseline || current.dirty ||
        current.pageId !== pageId ||
        adoption.assets.some(asset => fontAssetStatus(asset) !== "available")) {
        release();
        return;
      }
      const transaction = documentFontRecordAdoptionTransaction(editor.state, adoption);
      if (!transaction) {
        release();
        return;
      }
      adoptedFontLeaseRef.current?.();
      adoptedFontLeaseRef.current = release;
      suppressEditorUpdateRef.current = true;
      try {
        editor.view.dispatch(trustReadOnlyDocumentMutation(transaction, "font-record-adoption"));
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      // These records ARE the revision the server acknowledged, so the saved
      // baseline moves with them and the page stays saved: adoption is not an
      // edit, must not queue one, and must not be undoable.
      const saved = acknowledgement.page.content_json;
      if (saved && acknowledgedDocumentBaselineRef.current === baseline) {
        if (pageDocumentJsonEquals(baseline.content, acknowledgement.draft.content_json)) {
          acknowledgedDocumentBaselineRef.current = { ...baseline, content: saved };
        }
        latestContentRef.current = saved;
      }
      // The page's own font bindings changed on the server; re-read them so
      // the display plan leases the same asset the records now name.
      notifyDocumentDisplayFontBindings(pageId);
    })();
    return () => { cancelled = true; };
  }, [autosave.hasConflict, autosave.isCachedPreview, autosave.isDirty,
    autosave.isLocalAuthorityPending, autosave.isSaving, autosave.lastSaveAcknowledgement,
    autosave.loading, autosave.saveStatus, editor, guestMode, pageId]);

  
  // region (kept by its plugin; markers change only by import, collaboration
  // or an unprotected edit).
  useEffect(() => {
    if (!isUsableEditor(editor)) {
      setEditableRangesInDocument(false);
      return;
    }
    const activeEditor = editor;
    const sync = () => {
      if (!isUsableEditor(activeEditor)) return;
      setEditableRangesInDocument(editableRangesPresent(activeEditor.state));
    };
    sync();
    activeEditor.on("transaction", sync);
    return () => {
      activeEditor.off("transaction", sync);
    };
  }, [editor, setEditableRangesInDocument]);

  useLayoutEffect(() => {
    paginationEditorRef.current = editor;
    return () => {
      if (paginationEditorRef.current === editor) {
        paginationEditorRef.current = null;
      }
    };
  }, [editor]);

  // Toggle the live instance for same-binding authority changes. ACL
  // participation changes deliberately rebuild above with a fresh CRDT.
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // Reconcile the controlled option after every committed render. Native
    // instance setup can retain its initial false option even after authority
    // is ready. Plugin-level readonly gates remain independent of this option.
    // Permission changes do not emit a document update or queue a save.
    if (editor.options.editable !== editorSurfaceEditable) {
      // A surface made read-only for a moment by the page's own gates (its
      // causal authority re-checked as a save lands, a fill catching up) while
      // the reader types in it: the browser takes the focus off a surface that
      // stops being editable and does not give it back, so every key after
      
      // causal gate shut for 130 ms after the first save; 40 of 45 keys).
      // The focus goes back when it is editable again, unless the reader put
      // it somewhere else meanwhile; the keys typed while it was shut are
      // held (the key listener below). Not for the reader's own read-only
      // states (Reading View, a protection, a page they may no longer edit).
      const view = (editor as unknown as { view?: EditorView }).view;
      if (!editorSurfaceEditable) {
        viewFocusLostToReadOnlyRef.current = Boolean(view && !view.isDestroyed && view.hasFocus() &&
          underlyingShellWriteAllowed && !readingViewActive && !importing && !commentOnlyProtected);
      }
      editor.setEditable(editorSurfaceEditable, false);
      if (editorSurfaceEditable && viewFocusLostToReadOnlyRef.current) {
        viewFocusLostToReadOnlyRef.current = false;
        const active = typeof document === "undefined" ? null : document.activeElement;
        const frame = wrapperRef.current?.closest(".wm-window") ?? null;
        if (view && !view.isDestroyed && !view.hasFocus() && (!active || active === document.body) &&
            (!frame || frame.classList.contains("wm-window--focused"))) {
          traceDocsHandover({ step: "focus-back" });
          view.focus();
        }
      }
    }
    setCommentOnlyLane(editor, commentOnlyLane && !readingViewActive);
  });

  useEffect(() => {
    if (!collabSession || !isUsableEditor(editor)) {
      publishCollaborativeDocumentAttrsRef.current = null;
      return;
    }
    const activeEditor = editor;
    const applyRemotePatch = (patch: CollaborativeDocumentAttrsPatch) => {
      if (!isUsableEditor(activeEditor)) return;
      let transaction = activeEditor.state.tr;
      let changed = false;
      const setAttr = (key: string, value: unknown) => {
        const current = (transaction.doc.attrs as Record<string, unknown>)[key];
        if (pageDocumentJsonEquals(current, value)) return;
        transaction = transaction.setDocAttribute(key, value);
        changed = true;
      };
      for (const [key, value] of Object.entries(patch.values)) {
        setAttr(key, value);
      }
      for (const key of patch.removed) {
        const defaultValue =
          activeEditor.schema.topNodeType.spec.attrs?.[key]?.default ?? null;
        setAttr(key, defaultValue);
      }
      if (!changed) return;
      transaction.setMeta(COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META, true);
      // This is a projection of already-authorized remote originals, even
      // when this view is read-only or still waiting for local admission.
      trustReadOnlyDocumentMutation(transaction, "session-view");
      activeEditor.view.dispatch(transaction);
    };
    const binding = bindCollaborativeDocumentAttrs(
      (collabObserverSession ?? collabSession).ydoc,
      applyRemotePatch,
    );
    if (binding.hasState) {
      applyRemotePatch({ values: binding.read(), removed: [] });
    }
    const publish = (
      sectionMutation?: CollaborativeDocumentSectionMutation | null,
      historical = false,
      authoredAttrs?: Readonly<Record<string, unknown>>,
      originalAttrs?: Readonly<Record<string, unknown>>,
    ) => {
      if (
        !editorHydratedRef.current ||
        !collaborativeDocumentAttrsWritableRef.current ||
        !isUsableEditor(activeEditor)
      ) {
        return;
      }
      const publishCurrent = () => binding.publish(
        authoredAttrs ?? activeEditor.state.doc.attrs as Readonly<Record<string, unknown>>, sectionMutation,
      );
      if (canonicalReady) {
        // The first gesture also writes every attribute the shared map has
        // never held. That is maintenance: in the gesture's Undo step it was
        // an extra, invisible Cmd+Z (the first ink stroke took two), and
        // undoing it removed the attributes, resetting them to defaults.
        if (historical && originalAttrs) {
          publishCanonicalDocumentAttrs(activeEditor, () => binding.materialize(originalAttrs), { historical: false });
        }
        publishCanonicalDocumentAttrs(activeEditor, publishCurrent, { historical });
      } else publishCurrent();
    };
    publishCollaborativeDocumentAttrsRef.current = publish;
    const onTransaction = (event?: { transaction?: Transaction; appendedTransactions?: Transaction[] }) => {
      const transaction = event?.transaction;
      const appendedTransactions = event?.appendedTransactions ?? [];
      const canonicalHistory = canonicalReady && isCanonicalDocumentHistoryTransaction(activeEditor);
      if (transaction?.getMeta(COLLABORATIVE_DOCUMENT_ATTRS_REMOTE_META) && !canonicalHistory) return;
      let authoredAttrs: Record<string, unknown> | undefined;
      let originalAttrs: Readonly<Record<string, unknown>> | undefined;
      if (canonicalReady) {
        if (![transaction, ...appendedTransactions].some(tr => tr?.docChanged)) return;
        if (!canonicalHistory && !hasCanonicalDocumentAuthoringTransaction(transaction, appendedTransactions)) {
          // Use the same complete batch as autosave and the canonical bridge.
          // Selection-triggered identity/layout maintenance is not authoring.
          return;
        }
        const after = activeEditor.state.doc.attrs;
        const before = (transaction ?? appendedTransactions[0])?.before.attrs ?? after;
        const changed = before === after ? [] : Object.keys(after).filter(key => !pageDocumentJsonEquals(before[key], after[key]));
        // Only an authored gesture materializes missing schema defaults for
        // the native save projection. Existing originals (including peer
        // settings) win unless this transaction explicitly changed that field.
        authoredAttrs = {...after, ...binding.read()};
        for (const key of changed) authoredAttrs[key] = after[key];
        // The section chain this view's own Undo/Redo left one entry short
        // (or over) is repaired in the view (sectionChainHistoryRepair); the
        // room holds the broken chain, which must not win here (WUA 168).
        if (appendedTransactions.some(tr => tr.getMeta(SECTION_CHAIN_HISTORY_REPAIR_META) === true)) {
          authoredAttrs.sectionLayouts = after.sectionLayouts;
        }
        originalAttrs = before;
      }
      publish(
        // A break added or removed by paste/drop/cut commits its section
        // layout in an appended transaction (sectionLayoutBoundarySync).
        normalizeCollaborativeDocumentSectionMutation(
          [transaction, ...appendedTransactions]
            .map((tr) => tr?.getMeta(COLLABORATIVE_DOCUMENT_SECTION_MUTATION_META))
            .find((meta) => meta !== undefined),
        ),
        hasCanonicalDocumentAuthoringTransaction(transaction, appendedTransactions),
        authoredAttrs,
        originalAttrs,
      );
    };
    activeEditor.on("transaction", onTransaction);
    if (!canonicalReady) publish();
    return () => {
      if (publishCollaborativeDocumentAttrsRef.current === publish) {
        publishCollaborativeDocumentAttrsRef.current = null;
      }
      activeEditor.off("transaction", onTransaction);
      binding.dispose();
    };
  }, [collabObserverSession, collabSession, editor, canonicalReady]);

  useEffect(() => {
    const ack = autosave.lastSaveAcknowledgement;
    // The production hook omits source for its ordinary PATCH acknowledgement.
    // Normalize that existing contract; unknown explicit sources still fail.
    const ackSource = ack?.source === undefined ? "patch" : ack.source;
    reportDocumentLifecycleDiagnostic(lifecycleObserverRef.current, () => ({
      kind: "save-ack", reason: "save-ack-entry", hasAcknowledgement: Boolean(ack),
      saved: autosave.saveStatus === "saved", ackPageMatches: ack?.page.id === pageId,
      ackVersionMatches: Boolean(ack && autosave.page?.content_version === ack.page.content_version),
      ackSourceAllowed: ackSource === "patch" || ackSource === "server-match",
      hasDraft: Boolean(ack?.draft.content_json), dirty: localSaveGenerationRef.current.dirty,
      contentVersion: autosave.page?.content_version, ackVersion: ack?.page.content_version,
      requestBaseContentVersion: ack?.requestBaseContentVersion, generation: localSaveGenerationRef.current.generation,
    }));
    if (!ack || autosave.saveStatus !== "saved" || ack.page.id !== pageId ||
        autosave.page?.content_version !== ack.page.content_version ||
        (ackSource !== "patch" && ackSource !== "server-match") ||
        !ack.draft.content_json || localSaveGenerationRef.current.dirty) return;
    emitDocumentLifecycleFact("save-ack", ack.page, {
      source: ackSource, requestBaseContentVersion: ack.requestBaseContentVersion,
    }, ack.draft.content_json);
  }, [autosave.lastSaveAcknowledgement, autosave.page?.content_version,
    autosave.saveStatus, emitDocumentLifecycleFact, pageId]);

  useEffect(() => {
    if (!onLifecycleObservation || !isUsableEditor(editor)) return;
    const dom = editorDom(editor);
    if (!dom) return;
    const ownerDocument = dom.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) return;
    const pending = pendingLifecycleFactsRef.current;
    let frame: number | null = null;
    let active = true;
    const flush = () => {
      frame = null;
      if (!active) return;
      for (const [kind, attempt] of pending) {
        if (attempt()) pending.delete(kind);
      }
    };
    const schedule = () => {
      if (active && frame === null && pending.size) frame = ownerWindow.requestAnimationFrame(flush);
    };
    const mutations = new MutationObserver(schedule);
    // Retry on every attribute the settled-layout check reads. Typography and
    // display-font passes can clear last, with no transaction after them.
    mutations.observe(dom, {attributes: true, subtree: true,
      attributeFilter: [...DOCUMENT_LIFECYCLE_LAYOUT_ATTRIBUTES, DOCUMENT_DISPLAY_FONTS_STATUS_ATTRIBUTE]});
    mutations.observe(ownerDocument.documentElement, {attributes: true, attributeFilter: ["data-font-assets-loading", "data-font-assets-error"]});
    ownerDocument.fonts?.addEventListener("loadingdone", schedule);
    ownerDocument.fonts?.addEventListener("loadingerror", schedule);
    editor.on("transaction", schedule);
    schedule();
    return () => {
      active = false;
      if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
      mutations.disconnect();
      ownerDocument.fonts?.removeEventListener("loadingdone", schedule);
      ownerDocument.fonts?.removeEventListener("loadingerror", schedule);
      editor.off("transaction", schedule);
      pending.clear();
    };
  }, [editor, onLifecycleObservation]);

  // AutoRecover (lib/autorecover-store): every unsaved change is also kept in
  // this browser's IndexedDB until the page is saved, so closing the tab, a
  // crash or a lost session never loses it; a copy a closed tab left is
  
  // page must always save; Spreadsheet has kept such copies since 10-0x).
  const autoRecoverEnabled = Boolean(pageId) && !previewMode && !guestMode;
  const autoRecoverReadRef = useRef<Promise<AutoRecoverCopy[]> | null>(null);
  const autoRecoverCheckedRef = useRef(false);
  const autoRecoverRunRef = useRef<{ cancelled: boolean } | null>(null);
  const autoRecoverBaseRef = useRef(0);
  autoRecoverBaseRef.current = typeof autosave.page?.content_version === "number" ? autosave.page.content_version : 0;
  const autoRecoverBaseBodyRef = useRef<unknown>(null);
  autoRecoverBaseBodyRef.current = autosave.page?.content_json ?? null;
  const autoRecoverInFlightRef = useRef(autosave.getInFlightSaveBody);
  autoRecoverInFlightRef.current = autosave.getInFlightSaveBody;
  const autoRecoverLastSentRef = useRef(autosave.getLastSentSaveBody);
  autoRecoverLastSentRef.current = autosave.getLastSentSaveBody;
  // A save of these edits is queued or on its way: a costly copy waits for it
  // (the save that confirms them clears the copy), at most
  // AUTORECOVER_SAVE_WAIT_MS; hiding or closing the tab writes it at once.
  // While the pen writes every copy waits for its pause, as the save does: a
  // note's first copy of a visit is not yet known to be costly (390 ms under
  // the pen on a 3,000-stroke note).
  const autoRecoverSaveComingRef = useRef<() => boolean>(() => false);
  autoRecoverSaveComingRef.current = () => autosave.isDirty || autosave.isSaving ||
    (localSaveGenerationRef.current.pageId === pageId && localSaveGenerationRef.current.dirty);
  useEffect(() => {
    if (!autoRecoverEnabled || !pageId) return undefined;
    autoRecoverCheckedRef.current = false;
    const reading = listAutoRecoverCopies(pageId).catch(() => [] as AutoRecoverCopy[]);
    autoRecoverReadRef.current = reading;
    return () => { if (autoRecoverReadRef.current === reading) autoRecoverReadRef.current = null; };
  }, [autoRecoverEnabled, pageId]);
  useEffect(() => {
    if (!editor || !autoRecoverEnabled || !pageId) return undefined;
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean; getMeta(key: unknown): unknown } }) => {
      if (!transaction.docChanged) return;
      // An Undo is the reader's change too, whichever history carried it: a
      // copy that stopped at the edit it undid brought that edit back on reopen.
      const sync = transaction.getMeta(ySyncPluginKey) as { isUndoRedoOperation?: unknown } | undefined;
      if (transaction.getMeta("addToHistory") === false && sync?.isUndoRedoOperation !== true &&
          !isCanonicalDocumentHistoryTransaction(editor)) return;
      const reading = autoRecoverReadRef.current;
      if (!reading) return;
      // Nothing is written over an earlier session's copies before they were read.
      void reading.then(() => noteAutoRecoverChange(pageId, () => {
        const content = readLiveDocumentForSaveBase();
        if (!content) return null;
        // The save on its way when this copy is written: if the tab goes
        // before its answer and the page took it, the copy's edits are merged
        // against it -- otherwise a block edited again after it was sent
        // came back twice (WUA 220: a SmartArt doubled after a reload during
        // a save).
        const sent = autoRecoverInFlightRef.current?.() ?? null;
        const baseBody = autoRecoverBaseBodyRef.current;
        const extra = {
          ...(sent && sent.baseContentVersion === autoRecoverBaseRef.current ? { [AUTORECOVER_SENT_KEY]: sent.content } : {}),
          ...(baseBody ? { [AUTORECOVER_BASE_KEY]: baseBody } : {}),
        };
        return {
          payload: { content, ...(Object.keys(extra).length ? { extra } : {}) },
          baseContentVersion: autoRecoverBaseRef.current,
          reason: "unsaved",
        };
      }, () => inkWritingActive() ||
        (autoRecoverCopyCost(pageId) >= AUTORECOVER_COSTLY_COPY_MS && autoRecoverSaveComingRef.current())));
    };
    editor.on("transaction", onTransaction as never);
    return () => { editor.off("transaction", onTransaction as never); };
  }, [editor, autoRecoverEnabled, pageId, readLiveDocumentForSaveBase]);
  useEffect(() => {
    // Not while the editor holds typing its save has not queued yet (the
    // typing pause): the hook already reads saved then, and the clear
    // cancelled the copy those keystrokes were being written to.
    if (autoRecoverEnabled && pageId && autosave.saveStatus === "saved" && !autosave.isDirty &&
        !(localSaveGenerationRef.current.pageId === pageId && localSaveGenerationRef.current.dirty)) {
      clearCurrentAutoRecover(pageId);
    }
  }, [autoRecoverEnabled, pageId, autosave.saveStatus, autosave.isDirty]);
  // The conflict notice's Reload: the document as this view holds it is set
  // aside first -- offered at the next open, never merged unasked
  // ("kept-server-version", below) -- and then the saved version replaces it.
  
  // conflict came while its member typed).
  const keepDocumentDiscardedByReload = useCallback(async () => {
    if (!autoRecoverEnabled || !pageId) return;
    const content = readLiveDocumentForSaveBase();
    const base = autosave.page?.content_json ?? null;
    if (!content || (base && sameAuthoredBody(content, base))) return;
    await setAsideAutoRecoverCopy(pageId, {
      payload: { content: content as Record<string, unknown>, ...(base ? { extra: { [AUTORECOVER_BASE_KEY]: base } } : {}) },
      baseContentVersion: autoRecoverBaseRef.current, reason: "kept-server-version",
    }).catch(() => null);
  }, [autoRecoverEnabled, autosave.page, pageId, readLiveDocumentForSaveBase]);
  useEffect(() => {
    if (!autoRecoverEnabled || !pageId || autoRecoverCheckedRef.current) return undefined;
    if (autosave.loading || !autosave.page || autosave.isCachedPreview || blockedUnsentDraft) return undefined;
    const reading = autoRecoverReadRef.current;
    if (!reading) return undefined;
    autoRecoverCheckedRef.current = true;
    // Not cancelled by the page object changing as saves land (the closing
    // tab's save does, at once): only leaving the page stops this check. A
    // cleanup on every change of the page ended it there, the view said
    // "saved" and showed the room's undone words (a45c sac24).
    const run = { cancelled: false };
    autoRecoverRunRef.current = run;
    // The tab that closed on this page sent its last edits as it went, and
    // the page took them before this view read it (lib/page-closing-edits):
    // the stored page is the page. That tab's copies are of the same edits,
    // and there is nothing to wait for or to set the room to.
    const landedClosing = takeLandedClosingEdits(pageId);
    if (landedClosing) clearDocsClosingSave(pageId);
    // Blocks the server kept twice laying them on the page: offered as any
    // merge's are (the conflicts notice).
    if (landedClosing?.conflicts?.length) {
      const known = readDocsRecoveryConflicts(pageId);
      const next = [...known, ...landedClosing.conflicts.filter((pair) => !known.some((entry) => entry.copy === pair.copy))];
      writeDocsRecoveryConflicts(pageId, next);
      setDocsConflicts(next);
    }
    void (async () => {
      const read = await reading;
      const closedSlot = landedClosing?.tab ? `current:${landedClosing.tab}` : null;
      const copies = closedSlot ? read.filter((copy) => copy.slot !== closedSlot) : read;
      if (closedSlot && copies.length !== read.length) void deleteAutoRecoverCopy(pageId, closedSlot);
      const offered: AutoRecoverCopy[] = [];
      const offer = async (copy: AutoRecoverCopy, entry: { content: unknown; base: unknown; version: number }) => {
        const slot = await setAsideAutoRecoverCopy(pageId, {
          payload: { content: entry.content as Record<string, unknown>,
            ...(entry.base ? { extra: { [AUTORECOVER_BASE_KEY]: entry.base } } : {}) },
          baseContentVersion: entry.version, reason: "kept-server-version",
        }).catch(() => null);
        if (!slot) return false;
        offered.push({ ...copy, slot, reason: "kept-server-version", stale: false,
          payload: { content: entry.content as Record<string, unknown>, ...(entry.base ? { extra: { [AUTORECOVER_BASE_KEY]: entry.base } } : {}) },
          baseContentVersion: entry.version });
        if (!run.cancelled) setDocsOfferedCopies([...offered]);
        return true;
      };
      for (const copy of copies) {
        if (run.cancelled) return;
        // This tab's own whole view, kept as the page was read again as parts
        // (keepDocumentForParts): the handover merges it, and deletes it once
        // it has. Merged here as well, the same words went in twice -- a copy
        // of the paragraph beside it, the page read again under the parts
        // view, and its parts saved from a view that held the body alone
        
        if (copy.reason === "discarded-for-remote" && keptForPartsPageRef.current === pageId) continue;
        // Kept aside on an earlier opening: offered, never merged unasked.
        if (copy.reason === "kept-server-version") {
          offered.push(copy);
          setDocsOfferedCopies([...offered]);
          continue;
        }
        // The tab that wrote this copy may have just closed with its save on
        // the way: that save, and the room updates it sent, are this copy's
        // edits. Taken twice, the words came back twice (and an Undo undone).
        setDocsCatchingUp(true);
        let stored: PageItem | null = null;
        // A tab that said it closed with a save on its way: that save is waited
        // for (it carries the copy's edits; merged before it lands, the room
        // took the same words twice when it did), up to twice as long.
        const closingSaveAt = readDocsClosingSave(pageId);
        const waitUntil = copy.savedAt + AUTORECOVER_CLOSING_SAVE_WAIT_MS * (closingSaveAt ? 3 : 1);
        for (;;) {
          stored = await notebookSDK.getPage(pageId, { cache: "no-store" }).catch(() => null);
          if (run.cancelled) return;
          const landed = closingSaveAt !== null && typeof stored?.content_version === "number" &&
            stored.content_version > copy.baseContentVersion;
          if ((stored && sameAuthoredBody(stored.content_json, copy.payload.content)) ||
              (landed && Date.now() >= copy.savedAt + 3_000) || Date.now() >= waitUntil) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
          if (run.cancelled) return;
        }
        // Merging needs a view that takes input; the wait it was for is over.
        // A tab having just closed, the view does not say "saved" meanwhile:
        // the room it shows can still hold what that tab took back.
        if (closingSaveAt !== null) setDocsSettling(true);
        setDocsCatchingUp(false);
        const storedVersion = typeof stored?.content_version === "number"
          ? stored.content_version : autoRecoverBaseRef.current;
        // A copy its tab closed ahead of (an Undo a moment before closing: the
        // copy still held the undone words, and this view took them back).
        // The tab's last state went with its closing save: once that save is
        // in, the copy is behind the page and is not merged. Without that
        // save the copy is all there is of those edits, and is merged as ever.
        // Not landed (or a page the Undo left as it was): the copy is not
        // merged unasked either -- it is kept aside and offered.
        if (copy.stale && closingSaveAt !== null) {
          const landedNow = typeof stored?.content_version === "number" && stored.content_version > copy.baseContentVersion;
          const held = Boolean(stored && sameAuthoredBody(stored.content_json, copy.payload.content));
          if (landedNow || held || await offer(copy, {
            content: copy.payload.content, base: copy.payload.extra?.[AUTORECOVER_BASE_KEY] ?? null, version: copy.baseContentVersion,
          })) void deleteAutoRecoverCopy(pageId, copy.slot);
          if (run.cancelled) return;
          continue;
        }
        // The stored page saying what the copy says does not settle it: the
        // room this view opened on can be behind that save, and its next save
        // would take the edit back. Only the view saying it does.
        const storedHoldsCopy = Boolean(stored && sameAuthoredBody(stored.content_json, copy.payload.content));
        if (storedHoldsCopy) {
          // Nothing of the copy is missing from the page, only from this view.
          // Writing it into the room as well is the same edit twice.
          const viewHoldsCopy = () => {
            const view = readLiveDocumentForSaveBase();
            return Boolean(view && sameAuthoredBody(view, copy.payload.content));
          };
          if (!viewHoldsCopy() && !docsHoldsUnsavedRef.current) {
            await (traceDocsHandover({ step: "discard-reload", why: "autorecover-stored" }), autosave.discardLocalAndReload()).catch(() => null);
            for (let tries = 0; tries < 16 && !run.cancelled && !viewHoldsCopy(); tries += 1) {
              await new Promise((resolve) => window.setTimeout(resolve, 500));
            }
            // The room still says otherwise (an Undo the closing tab could only
            // save, not tell the room): the page is right, and the room's next
            // save would take it back.
            const target = paginationEditorRef.current;
            if (!run.cancelled && !viewHoldsCopy() && target &&
                adoptRecoveredDocumentContent(target, copy.payload.content, true)) {
              void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
            }
          }
          void deleteAutoRecoverCopy(pageId, copy.slot);
          continue;
        }
        // The room may still be opening: try for up to 20 s.
        for (let tries = 0; tries < 40 && !run.cancelled; tries += 1) {
          const current = readLiveDocumentForSaveBase();
          if (current && sameAuthoredBody(current, copy.payload.content)) {
            void deleteAutoRecoverCopy(pageId, copy.slot);
            break;
          }
          const sameBase = copy.baseContentVersion > 0 && copy.baseContentVersion === storedVersion;
          // The page moved past the copy's base: when the save that was on
          // its way as the copy was written is what the page now holds, the
          // copy adds only what came after it.
          const sent = copy.payload.extra?.[AUTORECOVER_SENT_KEY];
          const sentBase = !sameBase && sent && typeof sent === "object" ? sent : undefined;
          const editedFrom = copy.payload.extra?.[AUTORECOVER_BASE_KEY];
          const editedFromBase = !sameBase && editedFrom && typeof editedFrom === "object" ? editedFrom : undefined;
          if (adoptKeptDocumentRef.current(copy.payload.content, sameBase, sentBase ?? editedFromBase,
            sentBase ? { baseOnlyIfHeld: true, fallbackBaseContent: editedFromBase } : undefined)) {
            void deleteAutoRecoverCopy(pageId, copy.slot);
            void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      }
      if (run.cancelled) return;
      // Keys a tab held in a handover and closed before it typed them: after
      // the copies (the whole view's edits they were typed on come first).
      void recoverDocumentHandoverKeysRef.current();
      // A tab that closed with a save still on its way left word of it (it
      // cannot leave the save itself), and the page this view opened on is
      // older than that save: until it lands and this view shows it, the view
      // says so and takes no typing, rather than show the older page as saved.
      // The closing tab can have more than one save on its way (the words,
      // then their Undo): the view follows the page until it holds still and
      // the view shows it, whatever a copy above already settled.
      const openedOn = autoRecoverBaseRef.current;
      const closedPending = readDocsClosingSave(pageId);
      if (closedPending) {
        if (!copies.length) setDocsCatchingUp(true);
        let landed = false;
        let lastVersion: number | null = null;
        let still = 0;
        for (let tries = 0; tries < 40 && !run.cancelled; tries += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1_500));
          if (run.cancelled) return;
          if (docsHoldsUnsavedRef.current) break;
          const stored = await notebookSDK.getPage(pageId, { cache: "no-store" }).catch(() => null);
          if (run.cancelled) return;
          const version = typeof stored?.content_version === "number" ? stored.content_version : null;
          landed ||= version !== null && version > openedOn;
          still = version !== null && version === lastVersion ? still + 1 : 0;
          lastVersion = version;
          // A page held as parts: the stored page is its body alone, and the
          // view holds every part it has read. Compared with the whole view it
          // never showed, and the view was read again until the wait ran out
          
          // member saving, a minute read-only and the keys typed meanwhile
          // lost). Part by part, each as stored now; a part a room holds is
          // the room's to bring.
          const holdsStored = docsViewHoldsStoredRef.current;
          const shows = holdsStored
            ? Boolean(stored) && (await holdsStored(stored?.content_json).catch(() => null)) === true
            : Boolean(stored && sameAuthoredBody(readLiveDocumentForSaveBase(), stored.content_json));
          if (run.cancelled) return;
          // The page this view opened on may already be the last of those
          // saves while the view still shows an earlier one (a copy or the
          // room behind it): a page that holds still is the one to show.
          if (stored && !shows && (landed ? still >= 1 : still >= 2)) {
            setDocsCatchingUp(true);
            await (traceDocsHandover({ step: "discard-reload", why: "autorecover-closing-save" }), autosave.discardLocalAndReload()).catch(() => null);
            if (run.cancelled) return;
            continue;
          }
          if (shows && still >= 2) break;
          // Another member's saves keep the page from holding still: once the
          // closing tab's saves are past hearing of, a view that holds the
          // page is caught up.
          if (shows && Date.now() - closedPending >= DOCS_CLOSING_SAVE_HEARD_MS) break;
          if (Date.now() - closedPending > AUTORECOVER_CLOSING_SAVE_WAIT_MS * 4) break;
        }
        clearDocsClosingSave(pageId);
      }
      // After a closing tab the room check below says when the view is caught up.
      if (!run.cancelled && !closedPending) setDocsCatchingUp(false);
      // The room can hold what the stored page does not (an Undo the closing
      // tab saved but never told the room: the reopened view showed the
      // undone words as saved, and its next save wrote them back; a45c sac24).
      // With nobody else in the room and nothing typed here, the stored page
      // is the page: the room is set to it, and what it held beyond the page
      // is kept aside and offered, never dropped. A room another connection
      // is in is left to it.
      let lastStored: number | null = null;
      let differs = 0;
      // After a tab closed on this page the view keeps saying it is catching
      // up until the room has been read and the view shows the stored page:
      // the room can arrive seconds after the page, with what the closing tab
      // took back (a45c sac24: an undone "ZZ" shown as saved for ~6 s).
      let roomSettled = !closedPending;
      let agreed = 0;
      if (!roomSettled) setDocsCatchingUp(true);
      // Only after a tab closed on this page on this device: the room is then
      // known to be able to hold what that tab took back. Without one, a view
      // the opening filled in (ids, defaults, an imported page's first
      // normalization) read as differing and was "recovered" (an untouched
      // imported Word page said "Unsaved changes from last time were found"
      // on every opening).
      const sameAsPage = (view: unknown, page: unknown) => {
        if (sameAuthoredBody(view, page)) return true;
        const schema = paginationEditorRef.current?.schema;
        return Boolean(schema && view && page && typeof view === "object" && typeof page === "object" &&
          sameDocumentAuthorContent(view as Record<string, unknown>, page as Record<string, unknown>, documentRootDefaults(schema)));
      };
      for (let tries = 0; tries < 30 && closedPending && !run.cancelled && collabOthersRef.current !== null; tries += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        if (run.cancelled) return;
        if (docsHoldsUnsavedRef.current ||
            (localSaveGenerationRef.current.pageId === pageId && localSaveGenerationRef.current.dirty)) break;
        const view = readLiveDocumentForSaveBase();
        // The page as this view last heard it first: the server is asked only
        // when the view says otherwise.
        // A tab having just closed, the server is asked every time: the
        // view's page follows the room then, and agrees with it.
        if (!view) continue;
        const stored = await notebookSDK.getPage(pageId, { cache: "no-store" }).catch(() => null);
        if (run.cancelled) return;
        const version = typeof stored?.content_version === "number" ? stored.content_version : null;
        const still = version !== null && version === lastStored;
        lastStored = version;
        if (!stored || version === null) continue;
        if (sameAsPage(view, stored.content_json)) {
          differs = 0;
          const target = paginationEditorRef.current;
          if (!roomSettled && target && documentRoomEstablished(target) && tries >= 1) {
            roomSettled = true;
            setDocsCatchingUp(false);
            setDocsSettling(false);
          }
          // The room read and agreeing with the page: nothing left to watch.
          if (closedPending && roomSettled && ++agreed >= 3) break;
          continue;
        }
        differs = still ? differs + 1 : 0;
        // A tab of this page closed a moment ago: what the room shows beyond
        // the page is that tab's, taken back or already saved. Until the
        // room is set to the page the view says it is still catching up and
        // takes no typing, rather than show those words as saved (a45c sac24:
        // 40 s of an undone "ZZ" shown as saved while that tab's presence
        // lingered in the room).
        if (closedPending && differs >= 1) setDocsCatchingUp(true);
        if (differs < 2 || (collabOthersRef.current ?? 0) > 0) continue;
        const target = paginationEditorRef.current;
        if (!target) continue;
        const kept = await offer({
          pageId, slot: "", savedAt: Date.now(), baseContentVersion: version, reason: "kept-server-version",
          payload: { content: view },
        }, { content: view, base: stored.content_json, version });
        if (!kept || run.cancelled) break;
        const slot = offered[offered.length - 1].slot;
        let aligned = adoptRecoveredDocumentContent(target, stored.content_json, true);
        for (let wait = 0; aligned && wait < 20 && !run.cancelled; wait += 1) {
          const now = readLiveDocumentForSaveBase();
          if (now && sameAuthoredBody(now, stored.content_json)) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          if (wait === 19) aligned = false;
        }
        if (!aligned) {
          // The room did not take the page: nothing was set aside after all.
          void deleteAutoRecoverCopy(pageId, slot);
          offered.pop();
          if (!run.cancelled) setDocsOfferedCopies([...offered]);
        }
        break;
      }
      if (!run.cancelled) { setDocsCatchingUp(false); setDocsSettling(false); }
    })();
    return undefined;
  }, [autoRecoverEnabled, pageId, autosave.loading, autosave.page, autosave.isCachedPreview, blockedUnsentDraft]); // eslint-disable-line react-hooks/exhaustive-deps -- one check per opening
  useEffect(() => () => {
    if (autoRecoverRunRef.current) autoRecoverRunRef.current.cancelled = true;
    autoRecoverRunRef.current = null;
    setDocsCatchingUp(false);
    setDocsSettling(false);
  }, [pageId]);

  // The blocks merges kept twice (a recovered copy, a conflict merged at
  // save), gathered from the room's bridge, and those whose two blocks are no
  // longer both in the page (settled by hand, or by a collaborator) dropped.
  useEffect(() => {
    if (!pageId || previewMode) return undefined;
    const gather = () => {
      const target = paginationEditorRef.current;
      if (!target || target.isDestroyed) return;
      const taken = takeDocumentRecoveryConflicts(target)
        .filter((pair): pair is DocsRecoveryConflict => typeof pair.kept === "string" && typeof pair.copy === "string");
      setDocsConflicts((list) => {
        const merged = [...list, ...taken.filter((pair) => !list.some((entry) => entry.copy === pair.copy))];
        const held = merged.filter((pair) =>
          documentBlockPosition(target, pair.kept) !== null && documentBlockPosition(target, pair.copy) !== null);
        // A page still opening holds none of them yet: nothing is dropped then.
        const next = target.state.doc.childCount > 1 || held.length ? held : merged;
        if (next.length === list.length && next.every((pair, index) => pair.copy === list[index]?.copy)) return list;
        writeDocsRecoveryConflicts(pageId, next);
        return next;
      });
    };
    gather();
    const timer = window.setInterval(gather, 3_000);
    return () => window.clearInterval(timer);
  }, [pageId, previewMode]);
  const revealDocsBlock = useCallback((blockId: string) => {
    const target = paginationEditorRef.current;
    const at = target ? documentBlockPosition(target, blockId) : null;
    if (!target || at === null) return;
    target.chain().setTextSelection(Math.min(at + 1, target.state.doc.content.size)).scrollIntoView().run();
  }, []);
  const deleteDocsBlock = useCallback((blockId: string) => {
    const target = paginationEditorRef.current;
    const at = target ? documentBlockPosition(target, blockId) : null;
    if (!target || at === null) return;
    const node = target.state.doc.nodeAt(at);
    if (!node) return;
    target.view.dispatch(target.state.tr.delete(at, at + node.nodeSize).scrollIntoView());
  }, []);
  const settleDocsConflict = useCallback((pair: DocsRecoveryConflict, remove: "kept" | "copy" | null) => {
    if (remove) deleteDocsBlock(pair[remove]);
    setDocsConflicts((list) => {
      const next = list.filter((entry) => entry.copy !== pair.copy);
      if (pageId) writeDocsRecoveryConflicts(pageId, next);
      return next;
    });
  }, [deleteDocsBlock, pageId]);

  // An expired session while this page holds edits the server does not
  // have: the tab stays open (lib/api's unsaved-work hold, as the workbook
  // does), the edits stay in the view and in AutoRecover, and signing in
  // beside it resumes saving where it stopped. Signed in as someone else,
  // nothing is saved under that account.
  const [docsSessionHeld, setDocsSessionHeld] = useState(false);
  const [docsAccountChanged, setDocsAccountChanged] = useState(false);
  const [docsReauthPopupBlocked, setDocsReauthPopupBlocked] = useState(false);
  const docsHoldsUnsavedRef = useRef(false);
  docsHoldsUnsavedRef.current = autosave.isDirty;
  const docsHeldPrincipalRef = useRef<string | null>(null);
  // The editor's own generation too: a keystroke is unsaved before its save
  // is even queued (the typing pause), and a 401 that arrived then sent the
  
  const docsHoldsUnsaved = useCallback(() => docsHoldsUnsavedRef.current ||
    (localSaveGenerationRef.current.pageId === pageId && localSaveGenerationRef.current.dirty), [pageId]);
  useEffect(() => {
    if (!pageId || guestMode || previewMode) return undefined;
    return registerUnsavedWorkHold(`document:${pageId}`, docsHoldsUnsaved);
  }, [pageId, guestMode, previewMode, docsHoldsUnsaved]);
  // An equation still open in its editor as the page goes (the window
  // closed, the app quit): written as Done writes it (lib/draft-commit-on-leave).
  useDraftCommitOnLeave(`document-equations:${pageId}`, () => {
    if (editor && !editor.isDestroyed) commitOpenEquationDrafts(editor.view.dom);
  }, Boolean(pageId) && !previewMode);
  // Leaving the tab with a change not yet saved asks first, as the workbook's
  // and the browser's own "changes may not be saved" do: an Undo made a moment
  // before closing was otherwise only in this tab, and the page kept the edit.
  const docsSaveStatusRef = useRef(saveStatus);
  docsSaveStatusRef.current = saveStatus;
  useEffect(() => {
    if (!pageId || guestMode || previewMode) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!docsHoldsUnsaved() && docsSaveStatusRef.current === "saved") return;
      noteDocsClosingSave(pageId);
      void flushAutoRecoverWrites();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [pageId, guestMode, previewMode, docsHoldsUnsaved]);
  // A document held as parts going with edits the server may not have (a
  // typed word's save on its way, its Undo queued behind it): its changed
  // blocks go as it closes (lib/page-closing-edits), measured against the
  // body and each part as stored and as on their way. The page opened next
  // waits for them. Too large to go: the local copy answers for them.
  const docsPartsClosingRef = useRef(documentParts.closingParts);
  docsPartsClosingRef.current = documentParts.closingParts;
  const docsLastAckRef = useRef(autosave.lastSaveAcknowledgement);
  docsLastAckRef.current = autosave.lastSaveAcknowledgement;
  useEffect(() => {
    if (!pageId || guestMode || previewMode || !documentPartsPage) return undefined;
    // Nothing it holds differs from the page as stored, nor from a save on
    // its way (an Undo back to the stored page a moment before closing): its
    // copies, all written before now, are behind it and are dropped where
    // read, and no save of its is waited for. A long page's copy is too large
    // for a closing copy, and the one it left still held the undone word: it
    // was offered on every opening after (ab27 sac30).
    // What closing sends: its edits, "held" (it holds nothing the stored
    // page lacks), or null (nothing to send, nothing known held).
    const closingRequest = (): PageClosingEditsRequest | "held" | null => {
      // Not read from the status: an Undo on a long page lands in the
      // document in one long task, and the window can go before the view
      // has rendered it as unsaved -- the status still said "saved" over the
      // saved typed word, and the Undo was never sent (ab27 sac30, 1 in 10).
      // What the editor holds is compared with the page as stored instead.
      try {
        const held = docsPartsClosingRef.current();
        if (!held) return null;
        const acked = docsLastAckRef.current?.draft.content_json?.content;
        const stored = Array.isArray(acked) ? acked : held.openedBody;
        const inFlight = autoRecoverInFlightRef.current?.() ?? null;
        const sending = inFlight?.content?.content;
        // The body the last save sent, too: its answer may have come before
        // the view rendered it, the word it typed then already stored.
        const sent = autoRecoverLastSentRef.current?.()?.content?.content;
        const body = held.bodyInRoom ? [] : closingBlockChanges(held.body, [stored, Array.isArray(sending) ? sending : null,
          Array.isArray(sent) && sent !== sending ? sent : null]);
        // A save on its way when the window goes is named: one landing after
        // these edits is refused instead of bringing back what an Undo took
        // out (services/page_closing_edits, ab27 sac30).
        const bodyInflight = Array.isArray(sending) && typeof inFlight?.baseContentVersion === "number"
          ? { inflight_base: inFlight.baseContentVersion } : {};
        const parts: Array<{ index: number; changes: unknown[]; inflight_base?: number; large_removal?: true }> = [];
        for (const part of held.parts) {
          const changes = closingBlockChanges(part.current, [part.saved, part.sending]);
          if (!changes) return null;
          const partInflight = part.sending && part.sendingRevision !== null ? { inflight_base: part.sendingRevision } : {};
          if (changes.length || part.sending) {
            parts.push({ index: part.index, changes, ...partInflight, ...(part.largeRemoval ? { large_removal: true as const } : {}) });
          }
        }
        if (!body) return null;
        if (!body.length && !parts.length && !Array.isArray(sending)) {
          // A view its rooms could not be given (a composition) holds what
          // no room acknowledged: its AutoRecover copy answers for it.
          return held.viewUnpublished ? null : "held";
        }
        return {
          closing_id: newClosingEditsId(), base_content_version: autoRecoverBaseRef.current,
          ...(body.length || Array.isArray(sending) ? { body: { changes: body, ...bodyInflight } } : {}),
          ...(parts.length ? { parts } : {}),
        };
      } catch { return null; }
    };
    // The tab's AutoRecover copy of the page is every editor's of it here
    // (the page in two windows): one that changed nothing drops it only
    // when no other holds edits.
    const holdsNothing = () => closingRequest() === "held";
    const releaseEditor = noteAutoRecoverClosingEditor(pageId, holdsNothing);
    const onPageHide = () => {
      const request = closingRequest();
      if (request === "held") {
        if (markAutoRecoverClosingHeld(pageId, holdsNothing)) clearDocsClosingSave(pageId);
        return;
      }
      if (!request || closingEditsBody(request) === null) return;
      noteClosingEditsSent(pageId, request.base_content_version, Date.now(), { id: request.closing_id, tab: autoRecoverTabId() });
      void sendPageClosingEdits(pageId, request).catch(() => undefined);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      releaseEditor();
    };
  }, [pageId, guestMode, previewMode, documentPartsPage, docsHoldsUnsaved]);
  useEffect(() => {
    if (guestMode || previewMode) return undefined;
    const onHeld = () => {
      if (!docsHoldsUnsaved()) return;
      docsHeldPrincipalRef.current = autoRecoverPrincipal();
      setDocsSessionHeld(true);
      void flushAutoRecoverWrites();
    };
    const onRestored = () => setDocsSessionHeld(false);
    window.addEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
    window.addEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    if (isAuthSessionHeld()) onHeld();
    return () => {
      window.removeEventListener(AUTH_SESSION_HELD_EVENT, onHeld);
      window.removeEventListener(AUTH_SESSION_RESTORED_EVENT, onRestored);
    };
  }, [guestMode, previewMode, docsHoldsUnsaved]);
  useEffect(() => {
    if (!docsSessionHeld) return undefined;
    return watchSessionRestore(() => {
      setDocsSessionHeld(false);
      const before = docsHeldPrincipalRef.current;
      const now = autoRecoverPrincipal();
      if (before && now && before !== now) {
        setDocsAccountChanged(true);
        return;
      }
      void autosave.retrySave()
        .then(() => saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow())
        .catch(() => null);
    });
  }, [docsSessionHeld]); // eslint-disable-line react-hooks/exhaustive-deps -- one watch per hold
  const signInToSaveDocument = useCallback(() => {
    setDocsReauthPopupBlocked(!openReauthWindow());
  }, []);

  // A workspace past its storage quota still saves its pages' edits, within
  // a grace (storage_quota.page_save_grace_bytes): the page says so, so the
  // reader frees space before the grace runs out. Read on opening and every
  // ten minutes while the page is open.
  const [workspaceOverQuota, setWorkspaceOverQuota] = useState(false);
  useEffect(() => {
    if (!pageId || guestMode || previewMode) return undefined;
    let cancelled = false;
    const read = () => {
      void apiGet<{ is_over_quota?: boolean; is_unlimited?: boolean }>("/api/v1/workspaces/me/storage-usage")
        .then((usage) => { if (!cancelled) setWorkspaceOverQuota(usage?.is_unlimited !== true && usage?.is_over_quota === true); })
        .catch(() => { /* the notice is a convenience */ });
    };
    read();
    const timer = window.setInterval(read, 600_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pageId, guestMode, previewMode]);

  // A save refused because a collaborator saved first (409) is merged, not
  
  // is kept aside (memory and AutoRecover), the server's version is read, and
  // the kept body is merged into it block by block against the body it was
  // edited from, a block both sides changed kept twice, then saved. The
  // conflict banner is only the fallback after three failed merges.
  const [conflictMerging, setConflictMerging] = useState(false);
  const conflictMergingRef = useRef(false);
  conflictMergingRef.current = conflictMerging;
  // Bumped to look again at a conflict a round could not merge yet.
  const [conflictMergeTick, setConflictMergeTick] = useState(0);
  const conflictMergeFailuresRef = useRef(0);
  // The merge outlives the conflict state it clears (the reload ends it); only
  // leaving the page stops it.
  const conflictMergePageRef = useRef<string | null>(pageId);
  useEffect(() => {
    conflictMergePageRef.current = pageId;
    conflictMergeFailuresRef.current = 0;
    setConflictMerging(false);
    setConflictCopyUnmerged(false);
    return () => { conflictMergePageRef.current = null; };
  }, [pageId]);
  useEffect(() => {
    // A round that could not finish is tried again while its copy is still
    // out, though the reload it began cleared the conflict (the copy was then
    // left for the page's next opening, and the tab said "saved").
    if ((!autosave.hasConflict && !conflictCopyUnmergedRef.current) || previewMode || guestMode || !pageId || conflictMerging ||
        conflictMergeFailuresRef.current >= CONFLICT_MERGE_ROUNDS) return;
    // A page held as parts is built again by the read below (every part
    // loaded anew, a minute on a long book): from the moment its edits are
    // taken, what is typed is held and typed at its place once the view takes
    // input again (armDocumentHandover) -- not into the view after its edits
    
    // typed while the kept copy was being written, lost with the reload).
    // A whole view is read again too (its editor built anew, its kept edits
    // merged back in): what is typed meanwhile is held the same way, and
    // typed into it once those edits are in (settleWholeViewHandover;
    
    const armedHere = !documentHandoverRef.current;
    if (armedHere) armDocumentHandoverRef.current();
    const wholeHandover = hydratedAsPartsRef.current ? null : documentHandoverRef.current;
    if (wholeHandover) {
      wholeHandover.wholeView = true;
      wholeHandover.mergePending = true;
      // Waits for the merge (or, past its time, types them anyway).
      settleWholeViewHandoverRef.current();
    }
    const local = readLiveDocumentForSaveBase();
    if (!local) {
      // The view is between serializations (a composition, a long fill):
      // look again shortly; what was held meanwhile goes back where it was.
      if (wholeHandover) wholeHandover.mergePending = false;
      if (armedHere) releaseDocumentHandoverRef.current();
      const again = window.setTimeout(() => setConflictMergeTick((tick) => tick + 1), 1_000);
      return () => window.clearTimeout(again);
    }
    traceDocsHandover({ step: "conflict-merge-start", reading: hydrationAppliedRef.current, parts: hydratedAsPartsRef.current,
      failures: conflictMergeFailuresRef.current });
    const base = acknowledgedDocumentBaselineRef.current?.pageId === pageId
      ? acknowledgedDocumentBaselineRef.current.content : null;
    const baseVersion = autoRecoverBaseRef.current;
    const mergingPage = pageId;
    const isCancelled = () => conflictMergePageRef.current !== mergingPage;
    // Counted until a save lands: a conflict merges do not resolve goes to
    // the reader after CONFLICT_MERGE_ROUNDS rounds instead of reloading in
    // a loop.
    conflictMergeFailuresRef.current += 1;
    setConflictMerging(true);
    setConflictCopyUnmerged(true);
    void (async () => {
      const slot = await setAsideAutoRecoverCopy(pageId, {
        payload: { content: local }, baseContentVersion: baseVersion, reason: "discarded-for-remote",
      }).catch(() => null);
      // A round that could not finish (offline, the room not open yet) is
      // tried again, ever more slowly; the kept body is in memory, and in
      // AutoRecover when this browser has it.
      const fail = () => {
        if (isCancelled()) return;
        setConflictMerging(false);
        window.setTimeout(() => setConflictMergeTick((tick) => tick + 1),
          Math.min(30_000, 2_000 * 2 ** Math.min(conflictMergeFailuresRef.current, 4)));
      };
      if (isCancelled()) return;
      // A page held as parts: the view went on taking keys while the copy was
      // written (a handover's held keys typed, the reader's next ones), and
      
      // stored). Held from here on, and its edits read again now.
      let kept = local;
      const keptFromParts = hydratedAsPartsRef.current;
      if (keptFromParts) {
        if (!documentHandoverRef.current) armDocumentHandoverRef.current();
        kept = readLiveDocumentForSaveBase() ?? local;
      }
      // The reading below is put into the view a moment after it returns (a
      // parts view's first part loaded again, seconds on a long book): kept
      // edits merged before that went into the view of the reading before,
      
      // a parts view's conflict read again: 17 keys it showed, gone;
      // h5a1-1's last 8 keys the same way). Merged once the view holds a
      // reading made after this one began (or, past its time, as it is).
      const readingBefore = hydrationAppliedRef.current;
      const page = await (traceDocsHandover({ step: "discard-reload", why: "conflict-merge" }), autosave.discardLocalAndReload()).catch(() => null);
      if (isCancelled()) return;
      if (!page) { fail(); return; }
      const readAt = Date.now();
      const attempt = (tries: number) => {
        if (isCancelled()) return;
        if (hydrationAppliedRef.current === readingBefore && Date.now() - readAt < CONFLICT_MERGE_READING_WAIT_MS) {
          if (tries === 0) traceDocsHandover({ step: "conflict-merge-waits-reading" });
          window.setTimeout(() => attempt(1), 250);
          return;
        }
        if (adoptKeptDocumentRef.current(kept, false, base ?? undefined, keptFromParts ? { partialView: true } : undefined)) {
          if (slot) void deleteAutoRecoverCopy(pageId, slot);
          setConflictMerging(false);
          setConflictCopyUnmerged(false);
          conflictMergingRef.current = false;
          void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
          // The keys held since go in on top of the edits just merged.
          if (wholeHandover) {
            wholeHandover.mergePending = false;
            settleWholeViewHandoverRef.current();
          }
          return;
        }
        // Until the room takes it (the kept copy also stays in AutoRecover:
        // the page merges it when it next opens).
        window.setTimeout(() => attempt(tries + 1), Math.min(30_000, 500 * 2 ** Math.min(tries, 6)));
      };
      attempt(0);
    })();
  }, [autosave.hasConflict, pageId, conflictMergeTick]); // eslint-disable-line react-hooks/exhaustive-deps -- one merge per conflict
  useEffect(() => {
    if (autosave.saveStatus === "saved" && !autosave.isDirty) conflictMergeFailuresRef.current = 0;
  }, [autosave.saveStatus, autosave.isDirty]);
  // How full the page is, measured on each save: past 80% of what one page
  // holds (the server's MAX_DOCUMENT_JSON_BYTES), the reader is asked to go
  // on in a new page before a save is refused for size (a page of
  // handwriting fills it at about 4,000 strokes).
  // What is measured is this editor's own draft of the save (compact JSON,
  // UTF-8, as the server counts), not the body the server stores: a causal
  // save sends only its updates, and the server's canonical body leaves out
  // what the draft spells out (attributes at their defaults, layout
  // receipts). On a long book the draft reads above the store, and by how
  // much varies -- the 2,747-page sample stored at 79.6% read 100% at its
  
  // split comes early, never late; a save that does pass the bound is held as parts by the
  // server instead (_hold_oversized_document_save_as_parts). Early is the
  // safe side; nothing here needs the two to agree.
  const [pageFullPercent, setPageFullPercent] = useState<number | null>(null);
  useEffect(() => { setPageFullPercent(null); }, [pageId]);
  // Read at most once a minute, never with a stroke on the glass: the whole
  // body as text after every save was 0.2-0.4 s of an iPad's main thread per
  // stroke on a 6.4 MB handwritten note, and how full a page is changes slowly.
  const pageFullMeasuredAtRef = useRef<{ pageId: string | null; at: number }>({ pageId: null, at: 0 });
  useEffect(() => {
    const content = autosave.lastSaveAcknowledgement?.draft.content_json;
    if (!content || previewMode || guestMode) return undefined;
    const measured = pageFullMeasuredAtRef.current;
    const since = measured.pageId === (pageId ?? null) ? Date.now() - measured.at : Infinity;
    const wait = since >= PAGE_FULL_MEASURE_EVERY_MS ? 200 : PAGE_FULL_MEASURE_EVERY_MS - since;
    let timer = 0;
    const measure = () => {
      if (inkPointerArbiter.strokeRunning()) { timer = window.setTimeout(measure, 500); return; }
      pageFullMeasuredAtRef.current = { pageId: pageId ?? null, at: Date.now() };
      const started = performance.now();
      try {
        // The same number, the body's frozen blocks measured once each
        // (jsonUtf8Size); `__mraiPageFullStringify` writes the whole text.
        const bytes = (window as Window & { __mraiPageFullStringify?: boolean }).__mraiPageFullStringify
          ? new Blob([JSON.stringify(content)]).size
          : jsonUtf8Size(content);
        const percent = Math.round((bytes / DOCUMENT_PAGE_MAX_JSON_BYTES) * 100);
        setPageFullPercent(percent >= 80 ? Math.min(percent, 100) : null);
      } catch { /* measuring never breaks the editor */ }
      inkTraceWork("page-full", performance.now() - started);
    };
    timer = window.setTimeout(measure, wait);
    return () => window.clearTimeout(timer);
  }, [autosave.lastSaveAcknowledgement, previewMode, guestMode, pageId]);
  // Nearly full (95%), and everything saved: the page is held as parts from
  // then on (POST .../document-parts/split; the document itself does not
  // change), so it keeps saving however long it grows, instead of being
  // refused at the bound. Read again, it opens as a long document. A page
  // that cannot be held so (a Word package) keeps the notice.
  const pageSplitAskedRef = useRef<string | null>(null);
  // The page's room kept the body (409 page_split_deferred: another tab or
  // member still writes in it, or it holds edits no save has carried yet):
  // asked again after the server's pause, the page one room meanwhile
  
  const [pageSplitRetry, setPageSplitRetry] = useState(0);
  // The server would not hold the page as parts (page_split_unavailable): the
  // nearly-full notice is then the reader's only warning before the bound, and
  // opens by itself. Otherwise it waits in the window's title bar: opened, a
  // window notice makes the window behind it inert and takes the keyboard, and
  // the page reaching 95% is split by itself a moment later -- every key typed
  
  const [pageSplitUnavailable, setPageSplitUnavailable] = useState(false);
  useEffect(() => { setPageSplitUnavailable(false); }, [pageId]);
  const pageSplitRetryTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (pageSplitRetryTimerRef.current !== null) window.clearTimeout(pageSplitRetryTimerRef.current);
    pageSplitRetryTimerRef.current = null;
  }, [pageId]);
  // Where the reader was when the page was handed to its parts (see
  // armDocumentHandover): the reload opens on its first part alone (a
  // 296-page book showed its first 25 pages, the caret on page 1,
  // mid-sentence on page 148), so the parts up to that place load and the
  // caret goes back to it; what was typed meanwhile is typed there.
  const documentHandoverRef = useRef<DocumentHandover | null>(null);
  const [handoverTick, setHandoverTick] = useState(0);
  useEffect(() => () => {
    // What it held stays in AutoRecover (noteAutoRecoverHandoverKeys): the
    // page's next opening types it at its place.
    const handover = documentHandoverRef.current;
    if (handover) traceDocsHandover({ step: "handover-unmounted", keys: handover.keys.keys().length });
    // Left as a closed tab's are (this tab's next view of the page would
    // otherwise read them as its own, still held, and write them over).
    if (handover && !handover.recovered && (handover.keys.keys().length || handover.edits)) leaveAutoRecoverHandoverKeys(handover.pageId);
    handover?.keys.stop();
    handover?.releaseHeld();
    documentHandoverRef.current = null;
  }, [pageId]);
  useEffect(() => { setPageSplitting(false); }, [pageId]);
  useEffect(() => {
    if (pageFullPercent === null || pageFullPercent < 95 || !pageId || documentPartsPage || guestMode ||
        previewMode || pageSplitAskedRef.current === pageId) return;
    if (autosave.saveStatus !== "saved" || autosave.isDirty) return;
    // Harness switch (`window.__docsOwnSplitOff = true`): the page is split
    
    // the split as a refused save or an ended session, never its own.
    if ((window as Window & { __docsOwnSplitOff?: boolean }).__docsOwnSplitOff === true) return;
    pageSplitAskedRef.current = pageId;
    void apiPost<{ split?: boolean }>(`/api/v1/pages/${encodeURIComponent(pageId)}/document-parts/split`, {})
      .then(async (answer) => {
        if (!answer?.split || importPageIdRef.current !== pageId) return;
        // What was typed while the split was asked (the room refused it from
        // the moment it was retired) is kept, and merged into the parts, not
        // dropped by the read.
        setPageSplitting(true);
        armDocumentHandoverRef.current();
        keepDocumentForPartsRef.current(true);
        rememberDocumentPartsPage(pageId, true);
        await (traceDocsHandover({ step: "discard-reload", why: "split-done" }), autosave.discardLocalAndReload());
      })
      .catch((error: unknown) => {
        /* one page still: the nearly-full notice stands */
        if (importPageIdRef.current !== pageId) return;
        if (!isApiRequestError(error) || error.code !== "page_split_deferred") {
          if (isApiRequestError(error) && error.code === "page_split_unavailable") setPageSplitUnavailable(true);
          return;
        }
        const seconds = Number(error.details?.retry_after);
        if (pageSplitRetryTimerRef.current !== null) window.clearTimeout(pageSplitRetryTimerRef.current);
        pageSplitRetryTimerRef.current = window.setTimeout(() => {
          pageSplitRetryTimerRef.current = null;
          if (importPageIdRef.current !== pageId || pageSplitAskedRef.current !== pageId) return;
          pageSplitAskedRef.current = null;
          setPageSplitRetry((count) => count + 1);
        }, 1000 * (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 120) : 10));
      })
      .finally(() => { if (importPageIdRef.current === pageId) setPageSplitting(false); });
  }, [pageFullPercent, pageId, documentPartsPage, guestMode, previewMode, autosave.saveStatus, autosave.isDirty, pageSplitRetry]); // eslint-disable-line react-hooks/exhaustive-deps -- one split per page, asked again when deferred
  const loadThroughPartBlock = documentParts.loadThroughBlock;
  // ---- A whole view's edits handed to the parts its page is held as --------
  // The page was split under this view (by this tab's own nearly-full split,
  // a save past the bound, or another tab's): its room is retired and its
  // saves are refused, so what it typed and had not saved goes to the parts.
  // Kept aside as the page is read again (keepDocumentForParts, AutoRecover
  // too), then merged into the parts view block by block against the body it
  // was edited from, once the parts it touches are loaded, and saved there
  
  const documentPartsStateRef = useRef(documentParts.state);
  documentPartsStateRef.current = documentParts.state;
  const documentPartsViewIsThisReadingRef = useRef(documentParts.viewIsThisReading);
  documentPartsViewIsThisReadingRef.current = documentParts.viewIsThisReading;
  const documentPartsPageRef = useRef(documentPartsPage);
  documentPartsPageRef.current = documentPartsPage;
  const documentPartsRefuseBlocksTwiceRef = useRef(documentParts.refuseBlocksTwice);
  documentPartsRefuseBlocksTwiceRef.current = documentParts.refuseBlocksTwice;
  const loadAllDocumentParts = useCallback(async (): Promise<boolean> => {
    // No part holds this id: the walk loads every part, then says false.
    await loadThroughPartBlock("\u0000every-part").catch(() => false);
    const state = documentPartsStateRef.current;
    return state.loaded + 1 >= state.count;
  }, [loadThroughPartBlock]);
  const adoptDraftIntoParts = useCallback(async (content: unknown, base: unknown | "view", partialView = false): Promise<boolean> => {
    const blocksOf = (body: unknown): unknown[] | null => {
      const blocks = body && typeof body === "object" ? (body as { content?: unknown }).content : null;
      return Array.isArray(blocks) ? blocks : null;
    };
    const draft = blocksOf(content);
    if (!draft) return false;
    let baseBlocks: unknown[];
    // A parts view's own draft holds only the parts it had loaded: merged
    // against a whole body, every block of a part not loaded read as deleted
    
    // a5a-1: a conflict's reload re-read a parts view of 1,109 blocks against
    // an 11,002-block base; 1,107 blocks lost). Its base is only the blocks it
    // holds: nothing it does not hold is a deletion.
    // A draft with fewer than half its base's blocks is such a view's too
    // (another tab's parts view's AutoRecover copy, merged against the page
    
    const blockIdOf = (block: unknown) => (block as { attrs?: { block_id?: unknown } })?.attrs?.block_id;
    const onlyHeld = (blocks: unknown[]) => {
      if (!partialView && draft.length >= blocks.length / 2) return blocks;
      const held = new Set(draft.map(blockIdOf).filter((id): id is string => typeof id === "string"));
      return blocks.filter((block) => {
        const id = blockIdOf(block);
        return typeof id === "string" && held.has(id);
      });
    };
    traceDocsHandover({ step: "adopt", base: base === "view" ? "view" : blocksOf(base)?.length ?? null, draft: draft.length });
    if (base === "view" || blocksOf(base) === null) {
      // The body it was made on is the page as it is (or unknown): every part
      // is loaded first, and the merge is against all of it. Unknown, it is
      // the page as the split left it (no other writer was in its room then):
      // merged against nothing, every block the live view writes otherwise
      // than the store was kept twice.
      if (!(await loadAllDocumentParts())) return false;
      baseBlocks = onlyHeld(blocksOf(serializeDocumentForParts()) ?? []);
    } else {
      baseBlocks = onlyHeld(blocksOf(base) ?? []);
      // The body the view opened with is the stored form, the draft the live
      // editor's: read as the editor writes it, a block nobody touched is no
      // edit of the draft's (draftBaseInEditorForm; R482-D04 LIVE).
      const stored = baseBlocks;
      baseBlocks = [...draftBaseInEditorForm(baseBlocks, editorFormOfPartBlocks)];
      if (docsHandoverTraceOn()) {
        const asStored = draftBlocksChangedFrom(stored, draft);
        const asEditor = draftBlocksChangedFrom(baseBlocks, draft);
        traceDocsHandover({ step: "base-form", editorForm: baseBlocks !== stored && stored.length > 0 && baseBlocks[0] !== stored[0],
          changedAsStored: asStored.changed, changedAsEditor: asEditor.changed, storedSample: asStored.sample, editorSample: asEditor.sample });
      }
      const reach = documentDraftReach(baseBlocks, draft);
      traceDocsHandover({ step: "reach", ...reach });
      if (!reach.changed) return true;
      // Asked again once: a walk the view's own next reading cut short (the
      // parts view's first hydration lands as the merge starts) is no sign the
      // block moved, and every part loaded instead took 20 s of a long book
      
      const through = reach.through;
      const reached = !reach.toEnd && through !== null &&
        ((await loadThroughPartBlock(through).catch(() => false)) ||
          (await loadThroughPartBlock(through).catch(() => false)));
      if (!reached) {
        // The block is no longer where it was (another member moved or deleted
        // it): every part.
        if (!(await loadAllDocumentParts())) return false;
      }
    }
    if (!documentPartsPageRef.current || !editorHydratedRef.current || !shellWriteAllowedRef.current) return false;
    // The view holds a reading the parts have not started over for yet (a
    // conflict's reload on a long book, the parts' reset seconds or minutes
    // behind under load): its parts' count is the reading before's, so "every
    // part loaded" was said of a view holding the body alone. Merged into it,
    
    // run3: base 3,323, draft 12,001, view 1,109 -> 9,787 in the body, stopped
    // only by the count-jump gate, the reader's last keys unsaved). Asked
    // again once the parts are this reading's (the caller tries again).
    if (!documentPartsViewIsThisReadingRef.current()) {
      traceDocsHandover({ step: "merge-waits-reading-parts" });
      return false;
    }
    let view = blocksOf(serializeDocumentForParts());
    if (!view) return false;
    // A block of the document the draft changed that the view does not hold
    // is in a part not loaded yet, or another member deleted it: merged now it
    // goes in after the last block loaded (a change outweighs a deletion), and
    // its part, loaded later, brings it a second time (R482-D04 LIVE: a part's
    // 17 tables stored twice). Every part is loaded first; a draft that still
    // meets a part not loaded waits (the caller asks again).
    if (draftChangesOutsideView(baseBlocks, draft, view, blockIdOf) > 0 &&
        documentPartsStateRef.current.loaded + 1 < documentPartsStateRef.current.count) {
      traceDocsHandover({ step: "merge-loads-every-part", outside: draftChangesOutsideView(baseBlocks, draft, view, blockIdOf) });
      if (!(await loadAllDocumentParts()) || !documentPartsViewIsThisReadingRef.current()) return false;
      view = blocksOf(serializeDocumentForParts());
      if (!view) return false;
    }
    if (partialView) baseBlocks = withPartsLoadedSince(baseBlocks, draft, view, blockIdOf);
    const merged = mergeCanonicalBlocks(baseBlocks as never[], draft as never[], view as never[], { typedOn: true });
    traceDocsHandover({ step: "merge", view: view.length, merged: merged.blocks.length, conflicts: merged.conflicts, changedRemote: merged.changedRemote,
      base: baseBlocks.length, draft: draft.length, partsLoaded: documentPartsStateRef.current.loaded, partsCount: documentPartsStateRef.current.count,
      draftNotInView: (() => { const ids = new Set(view.map(blockIdOf)); return draft.filter((item) => !ids.has(blockIdOf(item))).length; })(),
      differ: merged.blocks.reduce<number>((count, item, index) => count + (JSON.stringify(item) === JSON.stringify(view[index]) ? 0 : 1), 0) });
    if (!merged.changedRemote) return true;
    // A merge holding a Word element more often than the stored document is
    // no merge of a reader's edits but blocks put in twice: refused, and the
    // view stops (refuseBlocksTwice). Asked before the editor has them, where
    // a paragraph put in twice still says which Word paragraph it is.
    if (documentPartsRefuseBlocksTwiceRef.current(merged.blocks, "handover-repeated-anchors")) {
      traceDocsHandover({ step: "merge-refused-twice" });
      return false;
    }
    // A merge that would take most of the view out is no merge of a reader's
    // edits but a draft that held less than its base said (see partialView):
    // refused, the draft kept (AutoRecover) rather than the book cut down.
    if (merged.blocks.length < view.length / 2) {
      traceDocsHandover({ step: "merge-refused-shrink", view: view.length, merged: merged.blocks.length });
      return false;
    }
    if (!mergePartBlocksIntoView(view, merged.blocks)) { traceDocsHandover({ step: "merge-refused" }); return false; }
    const conflicts = merged.conflictPairs.filter((pair): pair is DocsRecoveryConflict =>
      typeof pair.kept === "string" && typeof pair.copy === "string");
    if (conflicts.length && pageId) {
      const known = readDocsRecoveryConflicts(pageId);
      const next = [...known, ...conflicts.filter((pair) => !known.some((entry) => entry.copy === pair.copy))];
      writeDocsRecoveryConflicts(pageId, next);
      setDocsConflicts(next);
    }
    return true;
  }, [editorFormOfPartBlocks, loadAllDocumentParts, loadThroughPartBlock, mergePartBlocksIntoView, pageId, serializeDocumentForParts]);
  // One merge at a time per kept body; the callers ask again on their timers.
  // A body merged once is merged for good: every caller asking again (the
  // set-aside retry, a second effect run, a refused draft of the same edits)
  // is told so, never given a second merge -- one ran twice put two copies of
  
  const partsAdoptionsRef = useRef(new WeakMap<object, Promise<boolean> | true>());
  adoptKeptDocumentRef.current = (content, sameBase, base, options) => {
    if (!documentPartsPageRef.current) {
      const target = paginationEditorRef.current;
      return Boolean(target && adoptRecoveredDocumentContent(target, content, sameBase, base, options));
    }
    if (!content || typeof content !== "object") return false;
    const known = partsAdoptionsRef.current.get(content);
    if (known === true) return true;
    if (known) return false;
    if (!editorHydratedRef.current || !hydratedAsPartsRef.current || !shellWriteAllowedRef.current) return false;
    const editedFrom = sameBase ? "view" : base ?? options?.fallbackBaseContent ?? null;
    // A copy this parts view wrote itself holds only the parts it had loaded:
    // merged against the body it was made on, the rest would read as deleted.
    // Parts keep their own recovery (lib/document-page-parts) for those.
    if (editedFrom !== "view" && documentPartsCount(editedFrom) > 1) return false;
    traceDocsHandover({ step: "adopt-start", keptForParts: setAsideDraftRef.current?.content === content,
      stack: (new Error().stack ?? "").split("\n").slice(2, 6).map((line) => line.trim().slice(-90)) });
    const job = adoptDraftIntoParts(content, editedFrom, options?.partialView === true).then((adopted) => {
      if (adopted) partsAdoptionsRef.current.set(content, true);
      else partsAdoptionsRef.current.delete(content);
      return adopted;
    }, () => {
      partsAdoptionsRef.current.delete(content);
      return false;
    });
    partsAdoptionsRef.current.set(content, job);
    return false;
  };
  // The body a whole view's unsaved edits were made on: its last save's, or
  // the body it opened with.
  const wholeViewSaveBase = (): unknown => {
    const acknowledged = autosave.lastSaveAcknowledgement;
    return acknowledged?.page?.id === pageId && documentPartsCount(acknowledged.draft.content_json) <= 1
      ? acknowledged.draft.content_json
      : acknowledgedDocumentBaselineRef.current?.pageId === pageId ? acknowledgedDocumentBaselineRef.current.content : null;
  };
  keepDocumentForPartsRef.current = (force) => {
    if (!pageId || previewMode || guestMode || setAsideDraftRef.current) return Boolean(setAsideDraftRef.current);
    if (!force && !canonicalUnboundDraftRef.current() && !autosave.isDirty) return false;
    const content = readLiveDocumentForSaveBase();
    if (!content) return false;
    const acknowledged = autosave.lastSaveAcknowledgement;
    const base = wholeViewSaveBase();
    if (base && sameAuthoredBody(content, base)) return false;
    const kept: SetAsideDocumentDraft = { content, base: base ?? null, slot: null, forParts: true,
      edits: base ? documentEditsSince(content, base) : null };
    keptForPartsPageRef.current = pageId;
    traceDocsHandover({ step: "keep", force, base: acknowledged?.page?.id === pageId && documentPartsCount(acknowledged.draft.content_json) <= 1 ? "acknowledged" : base ? "baseline" : null });
    setAsideDraftRef.current = kept;
    setSetAsideDraft(kept);
    // Kept past the tab at once (synchronously, small): a tab closed before
    
    
    traceDocsHandover({ step: "keep-edits", blocks: kept.edits?.blocks.length ?? null });
    persistDocumentHandoverKeysRef.current();
    void setAsideAutoRecoverCopy(pageId, {
      payload: { content: content as Record<string, unknown>, ...(base ? { extra: { [AUTORECOVER_BASE_KEY]: base } } : {}) },
      baseContentVersion: autoRecoverBaseRef.current, reason: "discarded-for-remote",
    }).then((slot) => {
      if (setAsideDraftRef.current === kept) {
        kept.slot = slot;
        // The keys held since are kept with the copy they follow.
        persistDocumentHandoverKeysRef.current();
      } else if (slot) void deleteAutoRecoverCopy(pageId, slot);
    }).catch(() => null);
    return true;
  };
  // Opened at a place (a search hit on handwriting: the stroke its line
  // starts with; lib/page-reveal): once the document is in, the parts up to
  // the block load, and the block is selected and brought into view.
  const [revealAsk, setRevealAsk] = useState(0);
  useEffect(() => subscribePageReveal((asked) => {
    if (asked === pageId) setRevealAsk((count) => count + 1);
  }), [pageId]);
  useEffect(() => {
    if (!pageId || !editorHydrated || !isUsableEditor(editor) || !hasPageReveal(pageId)) return;
    const place = takePageReveal(pageId);
    if (!place) return;
    void (async () => {
      if (documentPartsPage && !(await loadThroughPartBlock(place.blockId))) return;
      if (!isUsableEditor(editor)) return;
      const view = (editor as unknown as { view: EditorView }).view;
      if (view.isDestroyed || importPageIdRef.current !== pageId) return;
      let at = -1;
      view.state.doc.descendants((node, position) => {
        if (at >= 0) return false;
        if (node.attrs?.block_id === place.blockId) {
          at = position;
          return false;
        }
        return true;
      });
      if (at < 0) return;
      const node = view.state.doc.nodeAt(at);
      const selection = node && NodeSelection.isSelectable(node)
        ? NodeSelection.create(view.state.doc, at)
        : selectionNearInlineContent(view.state.doc, at + 1);
      view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
      // The block's own box, for a floating stroke the caret's scroll misses.
      const dom = view.nodeDOM(at);
      if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center", inline: "nearest" });
    })();
  }, [pageId, editorHydrated, revealAsk, documentPartsPage]); // eslint-disable-line react-hooks/exhaustive-deps -- once per request
  armDocumentHandoverRef.current = () => {
    if (!pageId || previewMode || guestMode || documentHandoverRef.current?.pageId === pageId) return;
    // The window it is in, should the editor's own box be away for a moment.
    const frame = wrapperRef.current?.closest(".wm-window") ?? null;
    const armedView = isUsableEditor(editor) ? (editor as unknown as { view: EditorView }).view : null;
    // The caret's place only from a view that holds this page (hydrated with
    // it, in this editor): an opening that finds the page held as parts arms
    // before its editor has the page (documentHandoverPlace).
    const viewHoldsPage = loadedPageIdRef.current === pageId && hydratedBindingRef.current?.editor === editor;
    traceDocsHandover({ step: "arm", editable: armedView ? armedView.editable : null, holdsPage: viewHoldsPage });
    const handover: DocumentHandover = {
      pageId,
      place: documentHandoverPlace(armedView?.state ?? null, viewHoldsPage),
      view: armedView,
      hydration: hydrationCount,
      armedAt: Date.now(),
      started: false,
      // Each key held is kept in AutoRecover at once, with the whole view's
      // copy: a tab closed before the parts view types them leaves them to
      // the page's next opening (persistDocumentHandoverKeys).
      keys: holdKeysThroughHandover(() => wrapperRef.current ?? frame, DOCUMENT_HANDOVER_MERGE_WAIT_MS,
        () => persistDocumentHandoverKeysRef.current()),
      persistTab: autoRecoverTabId(),
      releaseHeld: holdAutoRecoverHandoverKeys(pageId),
    };
    documentHandoverRef.current = handover;
    // A whole view stops taking input: what it holds unsaved is kept past the
    // tab from this moment (the keep that follows, once the page is read,
    
    // refused save and the reading, the keys before the refusal gone).
    // (Not gated on the save state: the refused save that arms it is still
    // "saving" here; a view with nothing unsaved keeps no edits anyway.)
    if (!documentPartsPageRef.current && !hydratedAsPartsRef.current && editorHydratedRef.current) {
      const base = wholeViewSaveBase();
      const content = base ? readLiveDocumentForSaveBase() : null;
      handover.edits = content ? documentEditsSince(content, base) : null;
      traceDocsHandover({ step: "arm-edits", blocks: handover.edits?.blocks.length ?? null });
      persistDocumentHandoverKeysRef.current();
    }
  };
  // This tab's handover keys as they are now, kept with the whole view's
  // set-aside copy (its slot once written) and the caret's place.
  persistDocumentHandoverKeysRef.current = () => {
    const handover = documentHandoverRef.current;
    if (!handover || handover.recovered || handover.pageId !== pageId) return;
    const kept = setAsideDraftRef.current;
    const keys = handover.keys.keys();
    const stored = noteAutoRecoverHandoverKeys(pageId, {
      slot: kept?.forParts ? kept.slot ?? null : null, place: handover.place, keys,
      edits: kept?.forParts ? kept.edits ?? handover.edits ?? null : handover.edits ?? null,
    });
    traceDocsHandover({ step: "persist-keys", keys: keys.length, stored });
  };
  // Keys a tab left as it closed in a handover (or a view of this tab that
  // went before it typed them): typed at their place once the copy they were
  // typed after is in this view. One whose copy is still waiting waits too.
  recoverDocumentHandoverKeysRef.current = async (tries = 0) => {
    if (!pageId || previewMode || guestMode || recoveringHandoverKeysRef.current) return;
    recoveringHandoverKeysRef.current = true;
    try {
      await recoverDocumentHandoverKeysOnce(tries);
    } finally {
      recoveringHandoverKeysRef.current = false;
    }
  };
  // A closed tab's kept edits, as merged (stable objects: the merge is
  // remembered per body), and those merged in already.
  const recoveredEditsRef = useRef(new Map<string, { content: unknown; base: unknown }>());
  const recoveredEditsDoneRef = useRef(new Set<string>());
  const recoverDocumentHandoverKeysOnce = async (tries: number) => {
    if (!pageId) return;
    // A handover of this view's own is on (one armed as the page opened and
    // turned out held as parts): these wait for it to end, then go in (they
    
    const later = () => {
      const page = pageId;
      if (tries < 300) window.setTimeout(() => {
        if (importPageIdRef.current === page) void recoverDocumentHandoverKeysRef.current(tries + 1);
      }, 1000);
    };
    if (documentHandoverRef.current) { later(); return; }
    const left = await listAutoRecoverHandoverKeys(pageId).catch(() => []);
    if (tries === 0 || left.length) traceDocsHandover({ step: "recover-keys-look", left: left.length, tries });
    if (!left.length || importPageIdRef.current !== pageId) return;
    if (documentHandoverRef.current) { later(); return; }
    const copies = new Set((await listAutoRecoverCopies(pageId).catch(() => [] as AutoRecoverCopy[])).map((copy) => copy.slot));
    for (const record of left) {
      const keys = heldKeysFrom(record.keys) ?? [];
      const place = documentCaretPlaceFrom(record.place);
      const edits = record.edits && Array.isArray(record.edits.blocks) && record.edits.blocks.length &&
        Array.isArray(record.edits.base) ? record.edits : null;
      if ((!keys.length || !place) && !edits) {
        forgetAutoRecoverHandoverKeys(pageId, record.tab);
        continue;
      }
      // Its copy is not in yet (the AutoRecover pass is still merging it):
      // asked again shortly, not left for the next opening.
      if (record.slot && copies.has(record.slot)) { later(); return; }
      if (importPageIdRef.current !== pageId) return;
      if (documentHandoverRef.current) { later(); return; }
      // The whole view's own edits the keys follow go in first (merged as a
      // partial draft: only the blocks they hold, nothing deleted), then the
      // keys on top of them. A merge that will not go in after a minute of
      // asking leaves the keys to go in alone.
      const editsKey = `${record.tab}:${record.savedAt}`;
      if (edits && !recoveredEditsDoneRef.current.has(editsKey) && tries < 60) {
        if (!documentPartsPageRef.current || !hydratedAsPartsRef.current) { later(); return; }
        let docs = recoveredEditsRef.current.get(editsKey);
        if (!docs) {
          docs = { content: { type: "doc", content: [...edits.blocks] }, base: { type: "doc", content: [...edits.base] } };
          recoveredEditsRef.current.set(editsKey, docs);
        }
        const adopted = adoptKeptDocumentRef.current(docs.content, false, docs.base, { partialView: true });
        traceDocsHandover({ step: "recover-edits", blocks: edits.blocks.length, adopted, tries });
        if (!adopted) { later(); return; }
        recoveredEditsDoneRef.current.add(editsKey);
        void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
      }
      if (!keys.length || !place) {
        forgetAutoRecoverHandoverKeys(pageId, record.tab);
        continue;
      }
      traceDocsHandover({ step: "recover-keys", keys: keys.length, tab: record.tab });
      documentHandoverRef.current = {
        pageId, place, hydration: hydrationCountRef.current - 1, armedAt: 0, started: false,
        keys: heldKeysGiven(keys), persistTab: record.tab, releaseHeld: holdAutoRecoverHandoverKeys(pageId), recovered: true,
      };
      setHandoverTick((count) => count + 1);
      return;
    }
  };
  // Asked for on its own too, a few seconds after the page is in: the
  // AutoRecover pass that asks for them may not run (or not reach its end)
  
  useEffect(() => {
    if (!pageId || !editorHydrated || previewMode || guestMode) return undefined;
    const timer = window.setTimeout(() => { void recoverDocumentHandoverKeysRef.current(); }, 3000);
    return () => window.clearTimeout(timer);
  }, [pageId, editorHydrated]); // eslint-disable-line react-hooks/exhaustive-deps -- once per opening
  // The page is one room still (a session that ended for another reason):
  // what was held goes back into this view, where the caret is.
  releaseDocumentHandoverRef.current = () => {
    const handover = documentHandoverRef.current;
    // Keys a closed tab left go at their own place (the handover effect).
    if (!handover || handover.pageId !== pageId || handover.recovered) return;
    // One held through a reading of the whole view again goes in once that
    // reading has its kept edits, at its place (settleWholeViewHandover).
    if (handover.wholeView) {
      settleWholeViewHandoverRef.current();
      return;
    }
    documentHandoverRef.current = null;
    const keys = handover.keys.take();
    documentParts.noteHand();
    traceDocsHandover({ step: "release", keys: keys.length });
    handover.releaseHeld();
    if (!keys.length) {
      forgetAutoRecoverHandoverKeys(handover.pageId, handover.persistTab);
      return;
    }
    // The surface is given its input back in the same commit, by the editor's
    // own effect: typed once it has it (a moment, at most two seconds).
    const target = editor;
    const started = Date.now();
    const type = () => {
      if (!isUsableEditor(target) || importPageIdRef.current !== handover.pageId) return;
      const view = (target as unknown as { view: EditorView }).view;
      if (view.isDestroyed) return;
      if (!viewTakesInputNow(view)) {
        // Not given back after all: they stay in AutoRecover for the next opening.
        if (Date.now() - started < 2000) window.setTimeout(type, 50);
        return;
      }
      typeHeldKeys(target as unknown as HeldKeysTarget, keys);
      forgetAutoRecoverHandoverKeys(handover.pageId, handover.persistTab);
    };
    type();
  };
  // Keys held while the whole view took none (its room's input gate shut
  // under it, its conflict being read again and merged): typed into the
  // whole view once it takes input again -- after the edits it kept are
  // merged back in, and at their place when the view was built anew --
  // unless the page turned out to be held as parts (that view types them:
  // the handover effect below). Asked again every 100 ms until then; past
  // DOCUMENT_HANDOVER_MERGE_WAIT_MS a view that still takes none leaves them
  
  // keys typed while a conflict was read again reached nothing).
  settleWholeViewHandoverRef.current = () => {
    const handover = documentHandoverRef.current;
    if (!handover || handover.pageId !== pageId || handover.recovered || !handover.wholeView || handover.settling) return;
    const again = () => {
      handover.settling = true;
      window.setTimeout(() => {
        handover.settling = false;
        settleWholeViewHandoverRef.current();
      }, 100);
    };
    if (documentPartsPageRef.current || hydratedAsPartsRef.current || setAsideDraftRef.current?.forParts ||
        knownDocumentPartsPage(pageId)) {
      // The parts view takes them (it waits for the kept edits itself).
      handover.wholeView = false;
      handover.mergePending = false;
      setHandoverTick((count) => count + 1);
      return;
    }
    const expired = Date.now() - handover.armedAt > DOCUMENT_HANDOVER_MERGE_WAIT_MS;
    if (handover.mergePending && !expired) { again(); return; }
    const target = paginationEditorRef.current;
    const view = isUsableEditor(target) ? (target as unknown as { view: EditorView }).view : null;
    const takesInput = Boolean(view && viewTakesInputNow(view) && editorHydratedRef.current &&
      shellWriteAllowedRef.current && !conflictMergingRef.current && importPageIdRef.current === handover.pageId);
    if (!takesInput || !view || !target) {
      if (!expired) { again(); return; }
      // Kept in AutoRecover (noteAutoRecoverHandoverKeys): the next opening types them.
      traceDocsHandover({ step: "whole-keys-left", keys: handover.keys.keys().length });
      handover.keys.take();
      handover.releaseHeld();
      documentHandoverRef.current = null;
      return;
    }
    documentHandoverRef.current = null;
    const keys = handover.keys.take();
    handover.releaseHeld();
    const rebuilt = handover.view !== view;
    if (rebuilt && handover.place) {
      const found = documentCaretPosition(view.state.doc, handover.place);
      if (found !== null) view.dispatch(view.state.tr.setSelection(selectionNearInlineContent(view.state.doc, found)).scrollIntoView());
    }
    traceDocsHandover({ step: "type-whole", keys: keys.length, rebuilt });
    if (!keys.length) {
      forgetAutoRecoverHandoverKeys(handover.pageId, handover.persistTab);
      return;
    }
    const keyboardHere = document.activeElement === document.body || document.activeElement === null ||
      Boolean(wrapperRef.current?.contains(document.activeElement));
    if (!view.hasFocus() && keyboardHere) view.focus();
    typeHeldKeys(target as unknown as HeldKeysTarget, keys);
    forgetAutoRecoverHandoverKeys(handover.pageId, handover.persistTab);
  };
  // A whole view whose surface the page allows input on but whose editor
  // takes none (the room's own gate: a session ending under it, a refused
  // publication, a fill still running): the key would reach nothing, so it
  // is held from then on, and typed once the view takes input again
  // (settleWholeViewHandover). The reader's own read-only states (Reading
  // View, a page they may not edit) are not this: editorSurfaceEditable.
  useEffect(() => {
    if (!pageId || previewMode || guestMode || typeof document === "undefined") return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (documentHandoverRef.current || documentPartsPageRef.current || hydratedAsPartsRef.current) return;
      if (!editorHydratedRef.current || (!editorSurfaceEditableRef.current && !surfaceStoppedUnarmedRef.current &&
          !viewFocusLostToReadOnlyRef.current)) return;
      const target = paginationEditorRef.current;
      if (!isUsableEditor(target)) return;
      const view = (target as unknown as { view: EditorView }).view;
      if (view.isDestroyed || viewTakesInputNow(view)) return;
      if (!keyHeldForDocument(event, wrapperRef.current)) return;
      traceDocsHandover({ step: "view-took-no-key" });
      armDocumentHandoverRef.current();
      const handover = documentHandoverRef.current as DocumentHandover | null;
      if (!handover) return;
      handover.wholeView = true;
      handover.keys.hold?.(event);
      settleWholeViewHandoverRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pageId, previewMode, guestMode]);
  useEffect(() => {
    const handover = documentHandoverRef.current;
    if (!handover || handover.pageId !== pageId || handover.started || !editorHydrated ||
        hydrationCount <= handover.hydration) return undefined;
    // A handover is to the parts view; keys a closed tab left go into
    // whichever view the page opens as.
    if (!documentPartsPage && !handover.recovered) return undefined;
    // The whole view's own edits go into the parts first (keepDocumentForParts:
    // merged block by block against the body they were made on); the keys
    // held since are typed on top of them, or they would read as a clash with
    // them -- and so would what is typed into the parts view after them: they
    // are held, and the view takes no key, until the merge is in (a merge that
    // took 58 s, the keys typed at 60 s and the reader's next ones into the
    // view, left the same paragraph changed on both sides and kept twice:
    
    // five minutes leaves them to be typed anyway (its clash keeps both).
    // They are in AutoRecover meanwhile (noteAutoRecoverHandoverKeys).
    const kept = setAsideDraftRef.current;
    if (!handover.recovered && kept?.forParts && Date.now() - handover.armedAt < DOCUMENT_HANDOVER_MERGE_WAIT_MS) {
      const timer = window.setTimeout(() => setHandoverTick((count) => count + 1), 1000);
      return () => window.clearTimeout(timer);
    }
    // Once: a render while the parts load does not start it again.
    handover.started = true;
    documentParts.noteHand();
    const place = handover.place;
    const viewHere = (view: EditorView) => !view.isDestroyed && importPageIdRef.current === handover.pageId;
    const end = () => {
      handover.releaseHeld();
      if (documentHandoverRef.current === handover) documentHandoverRef.current = null;
    };
    // The content this run places the caret in: read again under it (a
    // conflict's reload of the page held as parts), the run starts over on
    // the new reading -- its parts loaded, its body taken as opened -- before
    
    // opened, the keys read as no edit and were never saved).
    const applied = hydrationAppliedRef.current;
    void (async () => {
      if (place && documentPartsPage) await loadThroughPartBlock(place.topBlockId).catch(() => false);
      const view = isUsableEditor(editor) ? (editor as unknown as { view: EditorView }).view : null;
      if (documentHandoverRef.current !== handover) return;
      // The view was built again meanwhile: the next one takes the keys.
      if (!view || !viewHere(view)) { handover.started = false; return; }
      if (place) {
        const found = documentCaretPosition(view.state.doc, place);
        if (found !== null) view.dispatch(view.state.tr.setSelection(selectionNearInlineContent(view.state.doc, found)).scrollIntoView());
        else if (handover.recovered) {
          // Their block is gone (another member's edit): not typed anywhere
          // else; they stay in AutoRecover until they expire.
          traceDocsHandover({ step: "recover-keys-unplaced" });
          end();
          return;
        }
      }
      // The parts just loaded take a while to be laid out (minutes for
      // five parts of a 296-page book), moving the caret's page as they do:
      // it is brought back into view, and the editor focused once it is
      // editable again, until the reader does anything or three minutes pass.
      // The keys held meanwhile are typed at the caret the moment it is.
      const started = Date.now();
      let stopped = false;
      const stop = () => { stopped = true; };
      const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
      const listen = (on: boolean) => {
        for (const name of events) {
          if (on) window.addEventListener(name, stop, { capture: true, passive: true });
          else window.removeEventListener(name, stop, { capture: true });
        }
      };
      listen(true);
      // The caret is the reader's until it leaves the block: pagination
      // moving blocks before it shifts its position, not its place.
      const caretInPlace = () => !place || documentCaretTopBlock(view.state) === place.topBlockId;
      let typed = false;
      const follow = () => {
        const expired = Date.now() - started > 180_000;
        if (!typed && documentHandoverRef.current !== handover) {
          listen(false);
          return;
        }
        if (!viewHere(view)) {
          // Built again before it could type them: the next view does.
          if (!typed) handover.started = false;
          listen(false);
          return;
        }
        if (!typed && hydrationAppliedRef.current !== applied) {
          traceDocsHandover({ step: "handover-read-again" });
          handover.started = false;
          listen(false);
          setHandoverTick((count) => count + 1);
          return;
        }
        if (!typed) {
          if (viewTakesInputNow(view) && shellWriteAllowedRef.current && editorHydratedRef.current) {
            typed = true;
            const keyboardHere = document.activeElement === document.body || document.activeElement === null ||
              Boolean(wrapperRef.current?.contains(document.activeElement));
            if (!view.hasFocus() && keyboardHere) view.focus();
            const keys = handover.keys.take();
            end();
            traceDocsHandover({ step: "type", keys: keys.length, placed: Boolean(place), recovered: handover.recovered === true });
            if (keys.length) typeHeldKeys(editor as unknown as HeldKeysTarget, keys);
            // In the view now, its own edits as any typed there.
            forgetAutoRecoverHandoverKeys(handover.pageId, handover.persistTab);
            // The held keys were the reader's typing, not a move away.
            stopped = false;
          } else {
            // The view still takes no input: they wait for it (no more are
            // held after DOCUMENT_HANDOVER_MERGE_WAIT_MS; these are never
            // dropped while the view is here, and kept in AutoRecover should
            // it go first).
            if (expired) listen(false);
            window.setTimeout(follow, expired ? 1000 : 100);
            return;
          }
        }
        if (stopped || expired || !caretInPlace()) {
          listen(false);
          return;
        }
        if (view.editable && !view.hasFocus() && (document.activeElement === document.body || document.activeElement === null)) view.focus();
        // Read and scrolled in the DOM: a transaction a second would run
        // every plugin of the book.
        try {
          const { node } = view.domAtPos(view.state.selection.head);
          const element = node instanceof HTMLElement ? node : node.parentElement;
          const rect = element?.getBoundingClientRect();
          if (element && rect && (rect.bottom < 0 || rect.top > window.innerHeight)) element.scrollIntoView({ block: "center" });
        } catch { /* the caret's page is being laid out: the next look */ }
        window.setTimeout(follow, 1000);
      };
      follow();
    })();
    return undefined;
  }, [documentPartsPage, editor, editorHydrated, hydrationCount, loadThroughPartBlock, pageId, setAsideDraft, handoverTick]);

  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    let hide: ReturnType<typeof setTimeout> | null = null;
    const onTransaction = ({
      transaction,
      appendedTransactions,
    }: {
      transaction: { getMeta: (key: string) => unknown };
      appendedTransactions?: ReadonlyArray<{ getMeta: (key: string) => unknown }>;
    }) => {
      const kept = [transaction, ...(appendedTransactions ?? [])].some(
        (candidate) => candidate.getMeta(TRACKED_OBJECT_DELETION_KEPT_META) === true,
      );
      if (!kept) return;
      setTrackedObjectDeletionKept((count) => count + 1);
      if (hide !== null) clearTimeout(hide);
      hide = setTimeout(() => setTrackedObjectDeletionKept(0), 6000);
    };
    editor.on("transaction", onTransaction as never);
    return () => {
      editor.off("transaction", onTransaction as never);
      if (hide !== null) clearTimeout(hide);
    };
  }, [editor]);

  // The hydration owner includes the concrete editor instance, so it can only
  // be synchronized after useEditor has initialized it. Keeping this layout
  // effect adjacent to the declaration preserves the generation/page/reload
  // cancellation contract without reading `editor` in its temporal dead zone.
  useLayoutEffect(() => {
    hydrationOwnerRef.current = {
      pageId,
      reloadNonce: autosave.reloadNonce,
      editor,
    };
    const hydrated = hydratedBindingRef.current;
    if (
      hydrated &&
      (hydrated.editor !== editor || hydrated.session !== collabSession)
    ) {
      collabHydrationWaitRef.current = null;
      setTrackedEditorHydrated(false);
    }
  }, [
    autosave.reloadNonce,
    collabSession,
    editor,
    pageId,
    setTrackedEditorHydrated,
  ]);

  // Web and Outline layouts are runtime projections only. The pagination
  // plugin reads the same DOM-owned mode so it can park browser-derived page
  // redistribution without touching authored page/section break nodes or the
  // PM document.
  useLayoutEffect(() => {
    // Capture the mounted DOM once. TipTap's `editor.view` getter throws after
    // the view has been destroyed (or before it has mounted), so an effect
    // cleanup must never resolve `editor.view` again during a rebuild/unmount.
    const runtimeRoot = editorDom(editor);
    if (!runtimeRoot) return;
    if (documentLayoutViewMode !== "print") {
      runtimeRoot.setAttribute(
        "data-document-view-mode",
        documentLayoutViewMode,
      );
    } else {
      runtimeRoot.removeAttribute("data-document-view-mode");
    }
    window.dispatchEvent(new Event("mrn-page-rebalance"));
    return () => {
      runtimeRoot.removeAttribute("data-document-view-mode");
    };
  }, [documentLayoutViewMode, editor]);

  // A phone's Web Layout flows each placed object at its anchor; its drawing
  // is fitted to the screen (lib/docs/mobile-web-fit.ts). Only in Web Layout.
  useEffect(() => {
    if (documentLayoutViewMode !== "web") return;
    const runtimeRoot = editorDom(editor);
    if (!runtimeRoot) return;
    return watchMobileWebObjects(runtimeRoot);
  }, [documentLayoutViewMode, editor]);

  const captureSelectedPhysicalSheetAnchor = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return null;
    const sheets = Array.from(
      wrapper.querySelectorAll<HTMLElement>(
        ".note-editor-content > article[data-page-sheet]",
      ),
    );
    let selectedSheet: HTMLElement | null = null;
    try {
      const view = editor?.view;
      if (view) {
        const position = view.state.selection.head;
        const domNode = view.domAtPos(position).node;
        const element =
          domNode instanceof HTMLElement ? domNode : domNode.parentElement;
        selectedSheet =
          element?.closest<HTMLElement>("article[data-page-sheet]") ?? null;
      }
    } catch {
      // A destroyed/replacing editor has no stable selection DOM. The first
      // physical sheet remains the deterministic bounded fallback.
    }
    return capturePhysicalPageViewportAnchor(sheets, selectedSheet);
  }, [editor]);

  const restorePhysicalSheetAnchorAfterReflow = useCallback(
    (anchor: PhysicalPageViewportAnchor<HTMLElement>) => {
      if (physicalPageAnchorFrameRef.current) {
        window.cancelAnimationFrame(physicalPageAnchorFrameRef.current);
      }
      physicalPageAnchorFrameRef.current = window.requestAnimationFrame(() => {
        physicalPageAnchorFrameRef.current = 0;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const sheets = Array.from(
          wrapper.querySelectorAll<HTMLElement>(
            ".note-editor-content > article[data-page-sheet]",
          ),
        );
        resolvePhysicalPageViewportAnchor(sheets, anchor)?.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        });
      });
    },
    [],
  );

  useEffect(
    () => () => {
      if (physicalPageAnchorFrameRef.current) {
        window.cancelAnimationFrame(physicalPageAnchorFrameRef.current);
        physicalPageAnchorFrameRef.current = 0;
      }
    },
    [],
  );

  const exitMultiplePagesView = useCallback(
    (knownAnchor?: PhysicalPageViewportAnchor<HTMLElement> | null) => {
      const leavingSpread = docPageViewMode === "multiple-pages";
      if (leavingSpread) {
        pendingSinglePageAnchorRef.current =
          knownAnchor ?? captureSelectedPhysicalSheetAnchor();
      }
      setDocPageViewMode("single");
    },
    [captureSelectedPhysicalSheetAnchor, docPageViewMode],
  );

  useLayoutEffect(() => {
    exitMultiplePagesViewRef.current = () => exitMultiplePagesView();
  }, [exitMultiplePagesView]);

  useLayoutEffect(() => {
    if (docPageViewMode !== "single") return;
    const anchor = pendingSinglePageAnchorRef.current;
    if (!anchor) return;
    pendingSinglePageAnchorRef.current = null;
    restorePhysicalSheetAnchorAfterReflow(anchor);
  }, [docPageViewMode, restorePhysicalSheetAnchorAfterReflow]);

  const exitDocumentProjection = useCallback(
    (knownAnchor?: PhysicalPageViewportAnchor<HTMLElement> | null) => {
      if (documentLayoutViewMode === "print") return false;
      pendingDocumentViewAnchorRef.current =
        knownAnchor ?? captureSelectedPhysicalSheetAnchor();
      setDocumentLayoutViewMode("print");
      return true;
    },
    [captureSelectedPhysicalSheetAnchor, documentLayoutViewMode],
  );

  useLayoutEffect(() => {
    exitDocumentProjectionViewRef.current = () => {
      exitDocumentProjection();
    };
  }, [exitDocumentProjection]);

  const fitPhysicalPageInPrintLayout = useCallback(
    (
      mode: PhysicalPageFitMode,
      knownAnchor?: PhysicalPageViewportAnchor<HTMLElement> | null,
    ) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      let sheetAnchor = knownAnchor ?? captureSelectedPhysicalSheetAnchor();
      if (!sheetAnchor) return;
      if (knownAnchor) {
        const currentSheets = Array.from(
          wrapper.querySelectorAll<HTMLElement>(
            ".note-editor-content > article[data-page-sheet]",
          ),
        );
        const currentSheet = resolvePhysicalPageViewportAnchor(
          currentSheets,
          knownAnchor,
        );
        if (!currentSheet) return;
        sheetAnchor = {
          identity: currentSheet,
          index: Math.min(knownAnchor.index, currentSheets.length - 1),
        };
      }
      const sheet = sheetAnchor.identity;

      const scroller = wrapper.closest<HTMLElement>(".note-window-scroll");
      const toolbarHeight =
        wrapper.querySelector<HTMLElement>(".note-editor-toolbar-stack")
          ?.offsetHeight ?? 0;
      const viewportWidth = wrapper.clientWidth || scroller?.clientWidth || 0;
      const viewportHeight = Math.max(
        0,
        (scroller?.clientHeight || window.innerHeight) - toolbarHeight,
      );
      const style = getComputedStyle(sheet);
      const physicalPageHeight =
        Number.parseFloat(style.getPropertyValue("--page-height-px")) ||
        sheet.offsetHeight;
      const nextZoom =
        mode === "page-width"
          ? fitPageWidthZoom(viewportWidth, sheet.offsetWidth)
          : mode === "multiple-pages"
            ? fitMultiplePagesZoom(
                viewportWidth,
                viewportHeight,
                sheet.offsetWidth,
                physicalPageHeight,
                MULTIPLE_PAGE_SPREAD_GAP_PX,
              )
            : fitOnePageZoom(
                viewportWidth,
                viewportHeight,
                sheet.offsetWidth,
                physicalPageHeight,
              );
      setDocZoom(nextZoom);

      if (mode === "multiple-pages") {
        setDocPageViewMode("multiple-pages");
        restorePhysicalSheetAnchorAfterReflow(sheetAnchor);
      } else {
        exitMultiplePagesView(sheetAnchor);
        // Already in the single-page view, the zoom changed under an
        // unchanged scroll offset: One Page on a later page left the reader
        // on the page before, the current page off the bottom (WUA 101).
        // The current page is brought into view at its new size.
        if (docPageViewMode !== "multiple-pages") {
          restorePhysicalSheetAnchorAfterReflow(sheetAnchor);
        }
      }
    },
    [
      captureSelectedPhysicalSheetAnchor,
      docPageViewMode,
      exitMultiplePagesView,
      restorePhysicalSheetAnchorAfterReflow,
    ],
  );

  const fitPhysicalPage = useCallback(
    (mode: PhysicalPageFitMode) => {
      const sheetAnchor = captureSelectedPhysicalSheetAnchor();
      if (!sheetAnchor) return;
      if (documentLayoutViewMode !== "print") {
        pendingPrintFitRef.current = { mode, anchor: sheetAnchor };
        exitDocumentProjection(sheetAnchor);
        return;
      }
      fitPhysicalPageInPrintLayout(mode, sheetAnchor);
    },
    [
      captureSelectedPhysicalSheetAnchor,
      documentLayoutViewMode,
      exitDocumentProjection,
      fitPhysicalPageInPrintLayout,
    ],
  );

  // Read Mode is one of Word's views: picking any layout view leaves it.
  const showPrintLayout = useCallback(() => {
    setReadingViewActive(false);
    if (documentLayoutViewMode === "print") return;
    const sheetAnchor = captureSelectedPhysicalSheetAnchor();
    if (sheetAnchor) pendingDocumentViewAnchorRef.current = sheetAnchor;
    setDocZoom(lastManualDocZoomRef.current);
    exitDocumentProjection(sheetAnchor);
  }, [
    captureSelectedPhysicalSheetAnchor,
    documentLayoutViewMode,
    exitDocumentProjection,
  ]);

  const showWebLayout = useCallback(() => {
    setReadingViewActive(false);
    if (documentLayoutViewMode === "web") return;
    const sheetAnchor = captureSelectedPhysicalSheetAnchor();
    if (sheetAnchor) pendingDocumentViewAnchorRef.current = sheetAnchor;
    exitMultiplePagesView(sheetAnchor);
    // Web Layout wraps against the actual viewport. Auto-fit zooms (including
    // Multiple Pages' sub-50% desktop fit) cannot leak into this width domain.
    setDocZoom(EDITOR_ZOOM_DEFAULT);
    setDocumentLayoutViewMode("web");
  }, [
    captureSelectedPhysicalSheetAnchor,
    documentLayoutViewMode,
    exitMultiplePagesView,
  ]);

  const showOutlineLayout = useCallback(() => {
    setReadingViewActive(false);
    if (documentLayoutViewMode === "outline") return;
    const sheetAnchor = captureSelectedPhysicalSheetAnchor();
    if (sheetAnchor) pendingDocumentViewAnchorRef.current = sheetAnchor;
    exitMultiplePagesView(sheetAnchor);
    // Outline is a continuous structural projection of the same mounted
    // editor. It owns no paper-fit zoom and never serializes its view state.
    setDocZoom(EDITOR_ZOOM_DEFAULT);
    setDocumentLayoutViewMode("outline");
  }, [
    captureSelectedPhysicalSheetAnchor,
    documentLayoutViewMode,
    exitMultiplePagesView,
  ]);

  const showDraftLayout = useCallback(() => {
    setReadingViewActive(false);
    if (documentLayoutViewMode === "draft") return;
    const sheetAnchor = captureSelectedPhysicalSheetAnchor();
    if (sheetAnchor) pendingDocumentViewAnchorRef.current = sheetAnchor;
    exitMultiplePagesView(sheetAnchor);
    // Draft keeps the live editor and authored content, but removes paper and
    // pagination decoration. The view preference remains local to this window.
    setDocZoom(EDITOR_ZOOM_DEFAULT);
    setDocumentLayoutViewMode("draft");
  }, [
    captureSelectedPhysicalSheetAnchor,
    documentLayoutViewMode,
    exitMultiplePagesView,
  ]);

  const toggleDocumentSplitView = useCallback(() => {
    if (!documentSplitViewActive) {
      setBacklinksOpen(false);
      setCommentsOpen(false);
      setOutlineOpen(false);
      setStylesOpen(false);
      setTrackChangesOpen(false);
    }
    setDocumentSplitViewActive((active) => !active);
    return true;
  }, [documentSplitViewActive]);

  const toggleReadingView = useCallback(() => {
    // An open header or footer is written before Reading View takes the
    // islands' editing away (the pane closes without writing then).
    bandDraftFlushRef.current?.();
    setReadingViewActive((active) => !active);
    return true;
  }, []);
  const exitReadingView = useCallback(() => setReadingViewActive(false), []);
  // Esc leaves Read Mode, as in Word.
  useCloseOnEscape(exitReadingView, readingViewActive);

  useLayoutEffect(() => {
    setDocumentSplitViewActive(false);
    setReadingViewActive(false);
  }, [editor, pageId]);

  useLayoutEffect(() => {
    const fitRequest =
      documentLayoutViewMode === "print" ? pendingPrintFitRef.current : null;
    if (fitRequest) {
      pendingPrintFitRef.current = null;
      pendingDocumentViewAnchorRef.current = null;
      window.requestAnimationFrame(() => {
        fitPhysicalPageInPrintLayout(fitRequest.mode, fitRequest.anchor);
      });
      return;
    }
    const anchor = pendingDocumentViewAnchorRef.current;
    if (!anchor) return;
    pendingDocumentViewAnchorRef.current = null;
    restorePhysicalSheetAnchorAfterReflow(anchor);
  }, [
    documentLayoutViewMode,
    fitPhysicalPageInPrintLayout,
    restorePhysicalSheetAnchorAfterReflow,
  ]);

  const zoomFitOnePage = useCallback(
    () => fitPhysicalPage("one-page"),
    [fitPhysicalPage],
  );
  const zoomFitPageWidth = useCallback(
    () => fitPhysicalPage("page-width"),
    [fitPhysicalPage],
  );
  const zoomFitMultiplePages = useCallback(
    () => fitPhysicalPage("multiple-pages"),
    [fitPhysicalPage],
  );

  // Multiple Pages is a fitted view, not a persisted document setting. Keep
  // the same two-page spread fitted as its host window changes size without
  // dispatching an editor transaction or disturbing the current selection.
  useEffect(() => {
    if (docPageViewMode !== "multiple-pages") return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scroller = wrapper.closest<HTMLElement>(".note-window-scroll");
    let frame = 0;
    const refit = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        fitPhysicalPage("multiple-pages");
      });
    };
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => refit())
        : null;
    observer?.observe(wrapper);
    if (scroller && scroller !== wrapper) observer?.observe(scroller);
    window.addEventListener("resize", refit);
    refit();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refit);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [docPageViewMode, fitPhysicalPage]);

  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const runtimeView = (editor as Editor & { view?: EditorView }).view;
    if (!runtimeView) return;
    return onImeCompositionSettled(runtimeView, () => {
      // One serialization after an entire phrase is bounded and preserves the
      // same page-specific queueSave closure as normal onUpdate.
      settleImeSerializeQueueFor({
        pageId: importPageIdRef.current,
        editor,
        view: runtimeView,
      });
    });
  }, [editor, settleImeSerializeQueueFor]);

  const persistSettledImeDraftBeforeFreeze = useCallback(() => {
    if (guestMode || !isUsableEditor(editor)) return;
    const ownerPageId = pageId;
    const activeEditor = editor;
    const runtimeView = (activeEditor as Editor & { view?: EditorView }).view;
    if (
      !runtimeView ||
      runtimeView.isDestroyed ||
      !editorHydratedRef.current ||
      importPageIdRef.current !== ownerPageId ||
      (activeEditor as Editor & { view?: EditorView }).view !== runtimeView
    ) {
      return;
    }

    const queue = imeSerializeQueueRef.current;
    if (!queue?.hasPending() || !isImeCompositionActive(runtimeView)) return;
    const queuedOwner = imeSerializeOwnerRef.current;
    if (
      !queuedOwner ||
      queuedOwner.pageId !== ownerPageId ||
      queuedOwner.editor !== activeEditor ||
      queuedOwner.view !== runtimeView
    ) {
      clearImeSerializeQueue();
      return;
    }

    // pagehide can arrive inside Safari's post-composition grace period. Once
    // ProseMirror's native composing flag is false, the live state is the
    // committed candidate even though MRNote deliberately keeps pagination
    // and autosave deferred for another 40ms. Settle that one queued callback
    // synchronously, then mirror its normalized live JSON into the recovery
    // draft before the page can freeze. If native composition is still live,
    // fail closed: the DOM contains pre-edit pinyin and must never be durable.
    if (runtimeView.composing) {
      setTrackedLocalSaveStatus("unsaved");
      return;
    }
    if (!settleImeSerializeQueueFor(queuedOwner)) return;
    if (
      runtimeView.isDestroyed ||
      !editorHydratedRef.current ||
      importPageIdRef.current !== ownerPageId ||
      (activeEditor as Editor & { view?: EditorView }).view !== runtimeView
    ) {
      return;
    }
    const finalContent = latestContentRef.current;
    if (!finalContent) return;
    autosaveReplacePendingDraft(buildSaveDraft(finalContent, titleRef.current));
  }, [
    autosaveReplacePendingDraft,
    buildSaveDraft,
    clearImeSerializeQueue,
    editor,
    guestMode,
    pageId,
    settleImeSerializeQueueFor,
    setTrackedLocalSaveStatus,
  ]);

  // A serialisation held for the pen (or coalesced for a large document) is
  // taken before the page can freeze: in the capture phase on the window,
  // ahead of the autosave's own hidden-tab save and page-hide recovery copy,
  // which then find the draft.
  useEffect(() => {
    if (guestMode) return;
    const takePendingSerialize = () => {
      if (document.visibilityState === "hidden") flushPendingContentSerialize();
    };
    const onPageHide = () => flushPendingContentSerialize();
    window.addEventListener("visibilitychange", takePendingSerialize, true);
    window.addEventListener("pagehide", onPageHide, true);
    return () => {
      window.removeEventListener("visibilitychange", takePendingSerialize, true);
      window.removeEventListener("pagehide", onPageHide, true);
    };
  }, [flushPendingContentSerialize, guestMode]);

  useEffect(() => {
    if (guestMode) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistSettledImeDraftBeforeFreeze();
      }
    };
    window.addEventListener("pagehide", persistSettledImeDraftBeforeFreeze);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(
        "pagehide",
        persistSettledImeDraftBeforeFreeze,
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [guestMode, persistSettledImeDraftBeforeFreeze]);

  useEffect(
    () => () => {
      pendingImeSaveWaitRef.current?.cancel();
      pendingImeSaveWaitRef.current = null;
    },
    [editor, pageId],
  );

  const restoreCommentThreads = useCallback(
    (content: Record<string, unknown>) => restoreDocumentStores(editor, content),
    [editor],
  );

  /**
   * Compatibility for rooms created before document-attrs-v1 existed: restore
   * the durable section model only when neither the adopted body nor the attrs
   * map supplied a valid live model. A valid collaborative chain always wins,
   * so a newer page-setting transaction can never be replaced by REST state.
   */
  const restorePersistedSectionPageAuthority = useCallback(
    (content: Record<string, unknown>) => {
      if (!isUsableEditor(editor)) return;
      const live = resolveSectionAtSelection(editor.state);
      const persistedAttrs =
        content.attrs && typeof content.attrs === "object"
          ? (content.attrs as Record<string, unknown>)
          : {};
      const persistedLayouts = normalizeSectionLayouts(
        persistedAttrs.sectionLayouts,
      );
      if (!persistedLayouts || persistedLayouts.length !== live.sectionCount) {
        return;
      }

      const liveAttrs = editor.state.doc.attrs as Record<string, unknown>;
      const commands = getEditorCommands<{
        restoreDocumentPageSetup?: (attrs: unknown) => boolean;
      }>(editor);
      const persistedNormalized = normalizeHydratedDocumentPageAttrs({
        ...persistedAttrs,
        sectionLayouts: persistedLayouts,
      });
      const liveNormalized = normalizeHydratedDocumentPageAttrs(liveAttrs);
      const schemaDefaults = normalizeHydratedDocumentPageAttrs({});
      const liveLegacyPageAuthority = normalizeHydratedDocumentPageAttrs({
        pageSize: liveAttrs.pageSize,
        pageMargins: liveAttrs.pageMargins,
        pageOrientation: liveAttrs.pageOrientation,
        customPageSize: liveAttrs.customPageSize,
        customPageMargins: liveAttrs.customPageMargins,
        columns: liveAttrs.columns,
        columnSeparator: liveAttrs.columnSeparator,
        writingMode: liveAttrs.writingMode,
        manuscriptGrid: liveAttrs.manuscriptGrid,
        docGridLinePitch: liveAttrs.docGridLinePitch,
      });
      const defaultLetterLayout = {
        pageSize: {
          widthTwips: 12_240,
          heightTwips: 15_840,
          orientation: "portrait",
        },
        pageMargins: {
          topTwips: 1_440,
          rightTwips: 1_440,
          bottomTwips: 1_440,
          leftTwips: 1_440,
          headerTwips: 720,
          footerTwips: 720,
          gutterTwips: 0,
        },
        columns: {
          count: 1,
          separator: false,
          equalWidth: true,
          spaceTwips: 720,
        },
      };
      const sourceAuthority = autosave.page?.source_projection_authority;
      const sourceBacked =
        sourceAuthority?.document_type === "docx_projection" &&
        Boolean(sourceAuthority.document_id) &&
        Boolean(sourceAuthority.workspace_id) &&
        Boolean(sourceAuthority.conversion_key) &&
        Boolean(sourceAuthority.source_resource_id) &&
        Boolean(sourceAuthority.source_resource_version_id);
      const pageAuthorityKeys = [
        "headerText",
        "footerText",
        "showPageNumbers",
        "pageNumberFormat",
        "pageNumberStart",
        "pageNumberStartSection",
        "differentFirstPage",
        "firstPageHeader",
        "firstPageFooter",
        "differentOddEven",
        "evenPageHeader",
        "evenPageFooter",
        "headerRich",
        "footerRich",
        "firstPageHeaderRich",
        "firstPageFooterRich",
        "evenPageHeaderRich",
        "evenPageFooterRich",
        "pageSize",
        "pageMargins",
        "pageOrientation",
        "customPageSize",
        "customPageMargins",
        "columns",
        "columnSeparator",
        "writingMode",
        "manuscriptGrid",
        "docGridLinePitch",
        "lineNumbers",
        "pageBorder",
        "watermark",
        "pageBackgroundColor",
        "pageBackgroundFill",
        "inkPaper",
        "autoHyphenation",
        "wordSettings",
        "sectionBands",
        "sectionStoryGraph",
      ] as const;
      const legacyPageAuthorityKeys = [
        "pageSize",
        "pageMargins",
        "pageOrientation",
        "customPageSize",
        "customPageMargins",
        "columns",
        "columnSeparator",
        "writingMode",
        "manuscriptGrid",
        "docGridLinePitch",
      ] as const;
      const defaultRoomTakeover = Boolean(
        sourceBacked &&
        live.sectionCount === 1 &&
        live.layouts?.length === 1 &&
        JSON.stringify(live.layouts[0]) ===
          JSON.stringify(defaultLetterLayout) &&
        JSON.stringify(persistedLayouts) !==
          JSON.stringify([defaultLetterLayout]) &&
        pageAuthorityKeys.every(
          (key) =>
            JSON.stringify(liveNormalized[key]) ===
            JSON.stringify(schemaDefaults[key]),
        ) &&
        legacyPageAuthorityKeys.every(
          (key) =>
            JSON.stringify(liveLegacyPageAuthority[key]) ===
            JSON.stringify(schemaDefaults[key]),
        ),
      );
      if (
        live.layouts &&
        JSON.stringify(live.layouts) !== JSON.stringify(persistedLayouts) &&
        !defaultRoomTakeover
      ) {
        return;
      }
      const restoredAttrs: Record<string, unknown> = { ...persistedNormalized };
      for (const [key, liveValue] of Object.entries(liveNormalized)) {
        if (defaultRoomTakeover && key === "sectionLayouts") continue;
        if (JSON.stringify(liveValue) !== JSON.stringify(schemaDefaults[key])) {
          restoredAttrs[key] = liveValue;
        }
      }
      restoredAttrs.sectionLayouts = defaultRoomTakeover
        ? persistedLayouts
        : (live.layouts ?? persistedLayouts);
      // sectionStoryGraph/sectionBands are document attrs too and are absent
      // from the current Yjs body transport.  Restore only a missing live
      // value; a valid collaborative authority always wins.
      for (const key of ["sectionStoryGraph", "sectionBands"] as const) {
        if (liveAttrs[key] == null && persistedAttrs[key] != null) {
          restoredAttrs[key] = persistedAttrs[key];
        }
      }
      executeEditorCommand(commands?.restoreDocumentPageSetup, restoredAttrs);
    },
    [autosave.page?.source_projection_authority, editor],
  );

  // ---- Page setup (size + margins) → on-screen page geometry --------------

  useDocumentSurfaceAttrSync(editor, surfaceAttrs);

  // The toolbar's Add-comment button opens the comments sidebar (the panel then
  // focuses its composer for the current selection). Listening here keeps the
  // toolbar a thin trigger while NoteEditor owns the panel's open/close state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      commentsReturnFocusRef.current ??= stablePanelReturnFocusTarget();
      setNewCommentRequestId((current) => current + 1);
      setCommentsOpen(true);
    };
    window.addEventListener(ADD_COMMENT_EVENT, handler);
    return () => window.removeEventListener(ADD_COMMENT_EVENT, handler);
  }, []);

  // Alt/Option+F12 from a live document anchor opens the existing pane and
  // hands it an exact, sanitized thread identity. The pane performs the focus
  // transfer after mount; no comment metadata or body content is written.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const threadId = sanitizeThreadId(
        (event as CustomEvent<{ threadId?: unknown }>).detail?.threadId,
      );
      if (!threadId) return;
      commentsReturnFocusRef.current ??= stablePanelReturnFocusTarget();
      setCommentFocusRequest((current) => ({
        threadId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
      setCommentsOpen(true);
    };
    window.addEventListener(FOCUS_COMMENT_EVENT, handler);
    return () => window.removeEventListener(FOCUS_COMMENT_EVENT, handler);
  }, []);

  // A copied "Link to comment" must be sufficient to open the target on a
  // fresh navigation. The panel owns exact thread/comment focus once mounted;
  // NoteEditor only owns the closed/open boundary.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const openLinkedComment = () => {
      const target = parseCommentDeepLink(window.location.href);
      if (target?.documentId === pageId) setCommentsOpen(true);
    };
    openLinkedComment();
    window.addEventListener("hashchange", openLinkedComment);
    return () => window.removeEventListener("hashchange", openLinkedComment);
  }, [pageId]);

  // The toolbar's Insert-footnote button drops an auto-numbered footnote at the
  // caret (the command also seeds an empty note body + ensures the note list
  // exists at the document end). Guarded so a mock editor without the
  // DocumentFootnotes extension is a safe no-op. Mirrors the comment trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelFocus: (() => void) | null = null;
    const handler = () => {
      const commands = getEditorCommands<{
        addFootnote?: (body?: string) => boolean;
      }>(editor);
      cancelFocus?.();
      cancelFocus = insertNoteAndFocusIt(editor, () =>
        executeEditorCommand(commands?.addFootnote, ""),
      );
    };
    window.addEventListener(INSERT_FOOTNOTE_EVENT, handler);
    return () => {
      cancelFocus?.();
      window.removeEventListener(INSERT_FOOTNOTE_EVENT, handler);
    };
  }, [editor]);

  // Insert-endnote (Word 引用 ribbon parity): endnotes are their OWN stream
  // ("en-" prefixed ids) — the note lands in the document-end 尾注 section
  // with endnote numbering while footnotes keep theirs, exactly like Word.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelFocus: (() => void) | null = null;
    const handler = () => {
      cancelFocus?.();
      cancelFocus = insertNoteAndFocusIt(editor, () =>
        executeEditorCommand(
          getEditorCommands<{
            addEndnote?: (body?: string) => boolean;
          }>(editor)?.addEndnote,
          "",
        ),
      );
    };
    window.addEventListener(INSERT_ENDNOTE_EVENT, handler);
    return () => {
      cancelFocus?.();
      window.removeEventListener(INSERT_ENDNOTE_EVENT, handler);
    };
  }, [editor]);

  // The toolbar's Insert-citation button opens the source picker. We snapshot the
  // live source store + active style off the editor at open time so the picker's
  // "pick existing" list and style toggle reflect the current document. Guarded so
  // a mock editor without the DocumentCitations extension is a safe no-op.
  const closeCitationPicker = useCallback(() => {
    const returnFocus = citationPickerReturnFocusRef.current;
    citationPickerReturnFocusRef.current = null;
    setCitationPickerOpen(false);
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
        return;
      }
      if (isUsableEditor(editor)) editor.view.focus();
    });
  }, [editor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      if (!isUsableEditor(editor)) return;
      if (!editor.isEditable) {
        setCitationPickerOpen(false);
        return;
      }
      const runtime = editor as { state?: unknown } | null;
      if (!runtime?.state) return;
      try {
        if (!sourceStoreIsEditable(readSourceStore(editor.state.doc))) {
          setCitationPickerOpen(false);
          return;
        }
        setCitationSources(getSources(editor.state));
        setCitedSourceIds(collectCitationOrder(editor.state.doc));
        setCitationStyleState(getCitationStyle(editor.state));
      } catch {
        setCitationSources([]);
        setCitedSourceIds([]);
        setCitationStyleState("apa");
      }
      const detail = (event as CustomEvent<OpenCitationPickerDetail>).detail;
      citationPickerReturnFocusRef.current = detail?.opener?.isConnected
        ? detail.opener
        : editor.view.dom;
      setCitationPickerMode("insert");
      setCitationPickerOpen(true);
    };
    window.addEventListener(INSERT_CITATION_EVENT, handler);
    return () => window.removeEventListener(INSERT_CITATION_EVENT, handler);
  }, [editor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      if (!isUsableEditor(editor)) return;
      try {
        if (!sourceStoreIsEditable(readSourceStore(editor.state.doc))) {
          setCitationPickerOpen(false);
          return;
        }
        setCitationSources(getSources(editor.state));
        setCitedSourceIds(collectCitationOrder(editor.state.doc));
        setCitationStyleState(getCitationStyle(editor.state));
      } catch {
        setCitationSources([]);
        setCitedSourceIds([]);
        setCitationStyleState("apa");
      }
      const detail = (event as CustomEvent<OpenCitationPickerDetail>).detail;
      citationPickerReturnFocusRef.current = detail?.opener?.isConnected
        ? detail.opener
        : editor.view.dom;
      setCitationPickerMode("manage");
      setCitationPickerOpen(true);
    };
    window.addEventListener(OPEN_CITATION_SOURCE_MANAGER_EVENT, handler);
    return () =>
      window.removeEventListener(OPEN_CITATION_SOURCE_MANAGER_EVENT, handler);
  }, [editor]);

  // The toolbar's Insert-cross-reference button opens the heading picker. We
  // snapshot the live document headings off the editor at open time (via the
  // same collectHeadings helper the Table of Contents uses) so the list reflects
  // the current outline. Guarded so a mock editor without the
  // DocumentCrossReferences extension is a safe no-op.
  const closeCrossReferencePicker = useCallback(() => {
    const returnFocus = crossRefPickerReturnFocusRef.current;
    crossRefPickerReturnFocusRef.current = null;
    setCrossRefPickerOpen(false);
    window.requestAnimationFrame(() => {
      if (returnFocus?.isConnected) {
        returnFocus.focus({ preventScroll: true });
        return;
      }
      if (isUsableEditor(editor)) editor.view.focus();
    });
  }, [editor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      if (!isUsableEditor(editor)) return;
      if (!editor.isEditable) {
        setCrossRefPickerOpen(false);
        return;
      }
      const runtime = editor as { getJSON?: () => unknown } | null;
      if (typeof runtime?.getJSON !== "function") return;
      try {
        const json = editor.getJSON();
        setCrossRefHeadings(collectHeadings(json));
        setCrossRefCaptions(collectAllCaptions(editor.state.doc));
        setCrossRefNumberedItems(collectNumberedItems(editor.state.doc));
        setCrossRefBookmarks(
          getBookmarks(editor.state).map(({ name }) => {
            const label = bookmarkRangesFor(editor.state.doc, name)
              .map((range) =>
                editor.state.doc.textBetween(range.from, range.to, " "),
              )
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300);
            return { name, label: label || name };
          }),
        );
        const streams = numberNoteStreams(
          readFootnotes(editor.state.doc),
          collectFootnoteRefOrder(editor.state.doc),
          getFootnoteMode(editor.state),
          getNoteSettings(editor.state),
        );
        setCrossRefNotes(
          [...streams.footnotes, ...streams.endnotes].map((note) => ({
            id: note.id,
            stream: note.stream,
            label: note.label,
            body: note.body.replace(/\s+/g, " ").trim().slice(0, 300),
          })),
        );
      } catch {
        setCrossRefHeadings([]);
        setCrossRefCaptions([]);
        setCrossRefNumberedItems([]);
        setCrossRefBookmarks([]);
        setCrossRefNotes([]);
      }
      const detail = (event as CustomEvent<OpenCrossReferencePickerDetail>)
        .detail;
      crossRefPickerReturnFocusRef.current = detail?.opener?.isConnected
        ? detail.opener
        : editor.view.dom;
      setCrossRefPickerOpen(true);
    };
    window.addEventListener(INSERT_CROSS_REFERENCE_EVENT, handler);
    return () =>
      window.removeEventListener(INSERT_CROSS_REFERENCE_EVENT, handler);
  }, [editor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      if (!isUsableEditor(editor)) return;
      if (!editor.isEditable) {
        setMergeFieldPickerOpen(false);
        return;
      }
      const runtime = editor as { state?: unknown } | null;
      if (!runtime?.state) return;
      try {
        setMergeData(getMailMergeData(editor.state));
      } catch {
        setMergeData({ columns: [], rows: [] });
      }
      const detail = (event as CustomEvent<OpenMergeFieldPickerDetail>).detail;
      mergeFieldPickerReturnFocusRef.current = detail?.opener?.isConnected
        ? detail.opener
        : editor.view.dom;
      setMergeFieldPickerOpen(true);
    };
    window.addEventListener(INSERT_MERGE_FIELD_EVENT, handler);
    return () => window.removeEventListener(INSERT_MERGE_FIELD_EVENT, handler);
  }, [editor]);

  // The toolbar's "Recipients" button opens the mail-merge dialog (paste data /
  // preview / finish). We snapshot the live data source off the editor at open
  // time so the textarea + preview reflect the current store. Guarded so a mock
  // editor without the DocumentMailMerge extension is a safe no-op.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      if (!isUsableEditor(editor)) return;
      const runtime = editor as { state?: unknown } | null;
      if (!runtime?.state) return;
      try {
        setMergeData(getMailMergeData(editor.state));
      } catch {
        setMergeData({ columns: [], rows: [] });
      }
      const detail = (event as CustomEvent<OpenMailMergeDialogDetail>).detail;
      mergeRecipientsReturnFocusRef.current = detail?.opener?.isConnected
        ? detail.opener
        : editor.view.dom;
      setMergeDialogAction(detail?.action ?? "recipients");
      if (detail?.presetMergeType && editor.isEditable) {
        const current = getMailMergeData(editor.state);
        const settings = resolveMailMergeSettings(current);
        const next = withMailMergeSettings(current, {
          ...settings,
          mergeType: detail.presetMergeType,
        });
        const commands = getEditorCommands<{
          setMailMergeData?: (data: MailMergeData) => boolean;
        }>(editor);
        if (executeEditorCommand(commands?.setMailMergeData, next)) {
          setMergeData(next);
        }
      }
      setMergeRecipientsOpen(true);
    };
    window.addEventListener(OPEN_MAIL_MERGE_RECIPIENTS_EVENT, handler);
    return () =>
      window.removeEventListener(OPEN_MAIL_MERGE_RECIPIENTS_EVENT, handler);
  }, [editor]);

  // Word's Bookmark dialog (Insert > Bookmark) is ONE dialog for naming,
  // listing, deleting and going to bookmarks; both toolbar entry points (the
  // Bookmark command and "Go to bookmark") open it. The list is read off the
  // live document when it opens and after every Add/Delete.
  const readBookmarkDialogEntries = useCallback(
    (target: Editor): DocumentBookmarkDialogEntry[] => {
      const entries: DocumentBookmarkDialogEntry[] = getBookmarks(
        target.state,
      ).map(({ name }) => ({ name }));
      // Word's hidden bookmarks MRAI keeps: the `_Ref…` bookmarks its
      
      // targets of an imported table of contents, carried on their headings.
      for (const { name } of getHiddenReferenceBookmarks(target.state)) {
        entries.push({ name, hidden: true });
      }
      const hidden = new Set<string>();
      target.state.doc.descendants((node) => {
        const alias = sanitizeTocAnchorId(node.attrs?.toc_anchor_id);
        if (node.type.name === "heading" && alias && !hidden.has(alias)) {
          hidden.add(alias);
          entries.push({ name: alias, hidden: true, permanent: true });
        }
        return true;
      });
      return entries;
    },
    [],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (!isUsableEditor(editor)) return;
      const runtime = editor as { state?: unknown } | null;
      if (!runtime?.state) return;
      try {
        setBookmarkList(readBookmarkDialogEntries(editor));
      } catch {
        setBookmarkList([]);
      }
      setBookmarkPanelOpen(true);
    };
    window.addEventListener(INSERT_BOOKMARK_EVENT, handler);
    window.addEventListener(GO_TO_BOOKMARK_EVENT, handler);
    return () => {
      window.removeEventListener(INSERT_BOOKMARK_EVENT, handler);
      window.removeEventListener(GO_TO_BOOKMARK_EVENT, handler);
    };
  }, [editor, readBookmarkDialogEntries]);

  // Memory-evidence "view source": jump to + flash the quoted passage this
  // page backed a memory with. Best-effort by design — when the quote no
  // longer matches (the document was edited since the evidence was written)
  // the command is a silent no-op and the user simply lands on the opened
  // page. Guarded so a mock editor without the EvidenceLocator extension
  // no-ops safely.
  const runEvidenceLocate = useCallback(
    (request: EvidenceLocateRequest) => {
      const commands = getEditorCommands<{
        locateEvidenceQuote?: (input: EvidenceQuoteLocateInput) => boolean;
      }>(editor);
      executeEditorCommand(commands?.locateEvidenceQuote, {
        quoteText: request.quoteText,
        startOffset: request.startOffset ?? null,
      });
    },
    [editor],
  );

  // Path 1 — this page's window was ALREADY open: the live editor hears the
  // broadcast directly (scoped by pageId). It also claims the parked pending
  // request so a later remount of this page can never replay a stale locate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EvidenceLocateRequest>).detail;
      if (!detail || detail.pageId !== pageId) return;
      consumePendingEvidenceLocate(pageId);
      runEvidenceLocate(detail);
    };
    window.addEventListener(LOCATE_EVIDENCE_EVENT, handler);
    return () => window.removeEventListener(LOCATE_EVIDENCE_EVENT, handler);
  }, [pageId, runEvidenceLocate]);

  // Path 2 — the window was JUST opened for this locate: the editor mounts
  // and hydrates after the broadcast fired, so consume the parked request
  // once content hydration completes. The short delay lets the freshly set
  // content lay out before scrollIntoView measures it.
  useEffect(() => {
    if (!editorHydrated) return;
    const pending = consumePendingEvidenceLocate(pageId);
    if (!pending) return;
    const timer = window.setTimeout(() => runEvidenceLocate(pending), 80);
    return () => window.clearTimeout(timer);
  }, [editorHydrated, pageId, runEvidenceLocate]);

  /*
   * Legacy `smartArt` blocks keep the server's drawing with them
   * (`smartArtLegacyScene.ts`): the first time an editable copy is open
   * online, every block without a current drawing gets one, stored outside
   * the undo history and saved with the page; later openings (read-only,
   * guest, offline included) draw it with no request. An item edit, or a
   * block the AI inserts, makes a drawing stale; the next update while the
   * page is still editable stores the new one. Same gates as the open
   * conversion above: never under a read-only view, a conflicted body, a
   * cached preview or a guest surface.
   */
  useEffect(() => {
    if (!editorHydrated || guestMode || !editorMayEdit) return;
    if (autosave.hasConflict || autosave.isCachedPreview) return;
    if (!isUsableEditor(editor)) return;
    if (loadedPageIdRef.current !== pageId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    // A server that could not answer is not asked again on every keystroke.
    let quietUntil = 0;
    const run = () => {
      timer = null;
      if (cancelled || running || Date.now() < quietUntil) return;
      running = true;
      void materializeLegacySmartArtScenes(editor)
        .then((written) => {
          if (written === null) quietUntil = Date.now() + 30_000;
        })
        .finally(() => {
          running = false;
        });
    };
    const schedule = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 600);
    };
    run();
    editor.on("update", schedule);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      editor.off("update", schedule);
    };
  }, [
    autosave.hasConflict,
    autosave.isCachedPreview,
    autosave.reloadNonce,
    editor,
    editorHydrated,
    editorMayEdit,
    guestMode,
    pageId,
  ]);

  // Apply the spell-check preference straight onto the ProseMirror DOM (the
  // browser reads the attribute live) and remember it per device.
  useEffect(() => {
    const dom = editorDom(editor);
    if (dom) dom.setAttribute("spellcheck", spellcheckOn ? "true" : "false");
    // An ONLYOFFICE session's setting is the integration's (kept by its own key).
    if (onlyofficeSpellcheckAtOpen() !== null) return;
    try {
      window.localStorage.setItem(
        "mrnote.spellcheck",
        spellcheckOn ? "1" : "0",
      );
    } catch {
      /* storage unavailable */
    }
  }, [editor, spellcheckOn]);

  // Persist the AutoCorrect preference per device. The live value is consumed by
  // the input-rule extension through autoCorrectOnRef (no editor rebuild); this
  // effect only mirrors it to storage. We store "0" only when explicitly off so
  // the on-by-default (Word) behavior survives a fresh device with no key.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "mrnote.autoCorrect",
        autoCorrectOn ? "1" : "0",
      );
    } catch {
      /* storage unavailable */
    }
  }, [autoCorrectOn]);

  // The paged surface: bands, notes, page numbering, band editing and the page's own styles (shared with the print surface)
  const pagedSurface = useDocumentPagedSurface({
    attrs: surfaceAttrs,
    detachedPagePreviewActive,
    docPageViewMode,
    documentLayoutViewMode,
    editor,
    editorHydrated,
    guestMode,
    // A guest or preview surface has no saved page: the document it was
    // handed carries the attributes the surface draws from (a Word line grid
    // the page ledger waits for: without it a grid document never paginated
    // there, and the PDF renderer waited out its 270 s for nothing).
    loadedContent: loadedContent ?? (guestMode ? initialContent : undefined),
    pageId,
    shellEventMayStart,
    t,
    wrapperRef,
  });
  const {
    bandEditLabels,
    bandEditScope,
    bandEditing,
    bandEditingSheetRule,
    bandOwnsPageNumber,
    bandStoryLinkedToPrevious,
    bestEffortSheetLayout,
    changeHeaderFooterEditing,
    columnSeparatorStyle,
    columnsStyle,
    commitBandRich,
    commitBandText,
    designCharacterStyleRule,
    docGridInTables,
    docGridLinePitchPx,
    drawingSelected,
    editorPopupOpen,
    effectiveCharacterSpacingControl,
    forwardStoryDocumentAttrs,
    getBandCommitRefusal,
    getBandEditMode,
    getBandRich,
    getBandText,
    headerFooterContext,
    headerFooterDocumentTextVisible,
    isRichBandVariant,
    manuscriptGridOn,
    manuscriptGridStyle,
    navigateBandEditor,
    openBandEditorOnPage,
    pageSurfaceStyle,
    plainFooterTokens,
    plainHeaderTokens,
    richBands,
    sectionBandFlags,
    sectionBands,
    sectionStoryGraph,
    setEditorPopupOpen,
    sheetBandBoxStyle,
    sheetBandBoxes,
    sheetBandContext,
    sheetBandOverlay,
    sheetFootnoteHooksRef,
    sheetFootnoteZones,
    sheetNoteContinuationPages,
    sheetPageNumbering,
    sheetParityPageStarts,
    showCropMarks,
    toggleHeaderFooterDocumentText,
    verticalText,
    watermarkStyle,
  } = pagedSurface;

  // ---- Load page data -----------------------------------------------------

  useEffect(() => {
    // Deferred serialization for the previous page was already flushed by
    // the layout-effect cleanup above, before useAutosavedPageDocument swaps
    // its page-scoped refs. This effect may now safely reset view-local state.
    hydrationGenerationRef.current += 1;
    const activeImport = activeImportRef.current;
    if (activeImport) {
      activeImport.controller.abort();
      if (activeImportRef.current === activeImport) {
        activeImportRef.current = null;
      }
    }
    setImporting(false);
    setImportError(null);
    loadedPageIdRef.current = null;
    hydratedBindingRef.current = null;
    hydratedObserverProjectionRef.current = null;
    latestContentRef.current = null;
    acknowledgedDocumentBaselineRef.current = null;
    intentionalEmptyOverwriteRef.current = null;
    collabHydrationWaitRef.current = null;
    hydrationApplyAttemptsRef.current = null;
    editorHydratedRef.current = false;
    setTrackedEditorHydrated(false);
    setHydrationFailure(null);
    setDocumentContentIssue(null);
    setTrackedLocalSaveStatus("saved");
  }, [pageId, setTrackedEditorHydrated, setTrackedLocalSaveStatus]);

  useEffect(
    () => () => {
      const activeImport = activeImportRef.current;
      activeImport?.controller.abort();
      if (activeImportRef.current === activeImport) {
        activeImportRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const page = autosave.page;
    if (
      guestMode || canonicalPreparing ||
      (collaborationEnabled && !collabSession) ||
      !isUsableEditor(editor) ||
      !page ||
      page.id !== pageId
    ) {
      return;
    }
    // Re-hydrate when the page changes OR when the autosave hook signals a fresh
    // server reload (reloadNonce) — the latter happens after a proposal-confirm
    // re-load so the editor shows the AI-applied body instead of clobbering it.
    if (
      loadedPageIdRef.current === pageId &&
      hydratedReloadNonceRef.current === autosave.reloadNonce &&
      hydratedBindingRef.current?.editor === editor &&
      hydratedBindingRef.current.session === collabSession &&
      hydratedObserverProjectionRef.current === observerProjection
    ) {
      return;
    }
    // CRDT Stage 2 seeding election: with a live networked session, hydration
    // must wait for the room handshake — only the FIRST member seeds the
    // shared doc from saved content; later joiners adopt the replayed CRDT
    // state (a second seed would duplicate the document).
    const collabNetwork = collabSession?.network ?? null;
    let bypassCollabNetwork = false;
    if (collabNetwork && collabSession && !canonicalReady) {
      let wait = collabHydrationWaitRef.current;
      if (wait?.pageId !== pageId || wait.session !== collabSession) {
        wait = {
          pageId,
          session: collabSession,
          startedAt: Date.now(),
          bypassed: false,
        };
        collabHydrationWaitRef.current = wait;
      }
      bypassCollabNetwork = wait.bypassed;
      // Page Yjs V2 separates the seeding verdict from durable readiness: the
      // elected first member must hydrate saved JSON into its CURRENT live
      // Y.Doc before the provider can build and CAS-publish the initial HTTP
      // snapshot. Waiting for `ready` here deadlocks that cycle (no document ->
      // no snapshot -> never ready). `connected && first === true` is only set
      // after this socket completed hello + replay; disconnected, unknown and
      // non-seeder sessions keep the existing bounded wait below.
      const mayHydrateInitialSeed =
        collabNetwork.connected && collabNetwork.first === true;
      if (
        !bypassCollabNetwork &&
        !collabNetwork.ready &&
        !mayHydrateInitialSeed &&
        !collabNetwork.failed
      ) {
        const remaining =
          COLLAB_INITIAL_SYNC_BUDGET_MS - (Date.now() - wait.startedAt);
        if (remaining <= 0) {
          // The provider owns the same bounded deadline, but hydration must not
          // depend on its timer winning an event-loop race. Force an honest
          // terminal verdict (rather than silently destroy the socket) before
          // hydrating durable JSON, so a late replay cannot merge a second copy
          // into the visible document and the page chrome never claims live.
          wait.bypassed = true;
          bypassCollabNetwork = true;
          collabNetwork.abortInitialSync();
        } else {
          const retryNet = window.setTimeout(
            () => {
              setHydrateRetryTick((value) => value + 1);
            },
            Math.min(120, remaining),
          );
          return () => window.clearTimeout(retryNet);
        }
      }
    }
    // Adopt the room's document whenever the room HAS one — whoever was
    // elected to seed it.
    //
    // `hasState` is the whole predicate. It is only ever set by state the
    // ROOM delivered, so a claimed-but-empty room (a seeder that died before
    // contributing) still hydrates from the saved copy rather than blanking
    
    //
    // What `first === false` used to add was a way to lose work: the elected
    // seeder took the setContent branch UNCONDITIONALLY, so if its own page
    // fetch was slow enough that a peer stopped waiting and seeded first,
    // the seeder replaced the shared document — and on a Collaboration-bound
    // editor setContent is a delete-everything-and-insert, so the peer's
    
    // seed; it cannot decide who already DID.
    const adoptCrdtState = canonicalReady || Boolean(
      !bypassCollabNetwork && collabNetwork && collabNetwork.ready && collabNetwork.hasState,
    );
    // A document held as parts opens on its body; its later parts are
    // appended as the reader nears the end (useDocumentPageParts).
    const rawContent = page.content_json;
    // A long document may open on the pages kept for it (layoutSnapshot): the
    // read is asked once and held for, briefly.
    if (pageId && layoutSnapshotsEnabled() && documentIsLongForLayoutSnapshot(rawContent, documentPartsCount(rawContent))) {
      if (layoutSnapshotsAskedFor.current !== `${pageId}:${autosave.reloadNonce}`) {
        layoutSnapshotsAskedFor.current = `${pageId}:${autosave.reloadNonce}`;
        forgetOpenedParts(pageId);
        void preloadLayoutSnapshots(pageId).then(() => setHydrateRetryTick((value) => value + 1));
      }
      if (layoutSnapshotsAwaited(pageId)) {
        const retry = window.setTimeout(() => setHydrateRetryTick((value) => value + 1), 60);
        return () => window.clearTimeout(retry);
      }
    }
    // An imported Word document's pictures are named by digest and drawn from
    // the page's stored file (`document-picture-references`).
    registerDocumentPictureReferences(pageId, rawContent, page.notebook_id);
    // The validator owns the complete persisted-root contract, including the
    // legacy blank sentinels (null/undefined/exact `{}`). Do not pre-coerce
    // other falsy values or arrays here: malformed persisted data must fail
    // closed instead of being hydrated and later saved as an empty document.
    const normalized = normalizeDocumentForSave(rawContent);
    if (!normalized.ok) {
      rejectInvalidDocumentContent(normalized.issue);
      return;
    }
    const flatContent = hydrateLegacyDocxOfficeMathStyles(normalized.document);
    // Structural pages: hydration ALWAYS wraps the flat blocks into real
    // page containers — the doc schema is `pageBlock+`, so a flat payload
    // is not even expressible in the editor. The saved baseline refs keep
    // the FLAT form - every serialization boundary flattens, so
    // comparisons stay apples-to-apples.
    const projected = observerProjection
      ? normalizeDocumentForSave({
          ...flatContent,
          ...observerProjection,
          attrs: {
            ...(flatContent.attrs as Record<string, unknown> | undefined),
            ...(observerProjection.attrs as
              | Record<string, unknown>
              | undefined),
          },
        })
      : null;
    if (projected && !projected.ok) {
      rejectInvalidDocumentContent(projected.issue);
      return;
    }
    const displayedContent = projected?.ok ? projected.document : flatContent;
    if (!savedDocumentAttrsAreRestorable(displayedContent)) {
      rejectInvalidDocumentContent("unsupported_document_attrs");
      return;
    }
    const keptLayout = hydrationLayoutReceipt(pageId ?? "");
    const content = hydrateStoredPageBlocks(displayedContent, keptLayout.receipt, pageId ? cachedDocsLayoutSizes(pageId) : null);
    if (layoutSnapshotsEnabled() && hydrationWasRestored(content)) {
      const root = editorDom(editor);
      markRestoredLayout(root, true);
      keptLayout.restored(root);
    }
    const t0 = page.title || "";
    const observationScope = lifecycleObserverRef.current ? captureSavedPageHotCacheScope() : null;
    const expectedOwner = {
      pageId,
      reloadNonce: autosave.reloadNonce,
      editor,
    };
    const generation = ++hydrationGenerationRef.current;
    let cancelled = false;
    let retry: number | null = null;
    const stillOwnsHydration = () => {
      const owner = hydrationOwnerRef.current;
      return (
        !cancelled &&
        hydrationGenerationRef.current === generation &&
        owner?.pageId === expectedOwner.pageId &&
        owner.reloadNonce === expectedOwner.reloadNonce &&
        owner.editor === expectedOwner.editor &&
        importPageIdRef.current === expectedOwner.pageId &&
        isUsableEditor(expectedOwner.editor)
      );
    };
    const scheduleHydrationApplyRetry = (failure: DocumentHydrationFailure) => {
      if (!stillOwnsHydration()) return;
      const current = hydrationApplyAttemptsRef.current;
      const sameOwner =
        current?.pageId === expectedOwner.pageId &&
        current.reloadNonce === expectedOwner.reloadNonce &&
        current.editor === expectedOwner.editor;
      const attempts = sameOwner && current ? current.attempts + 1 : 1;
      hydrationApplyAttemptsRef.current = { ...expectedOwner, attempts };
      if (attempts >= HYDRATION_APPLY_MAX_ATTEMPTS) {
        setHydrationFailure(failure);
        return;
      }
      retry = window.setTimeout(() => {
        if (stillOwnsHydration()) {
          setHydrateRetryTick((value) => value + 1);
        }
      }, HYDRATION_APPLY_RETRY_MS);
    };
    const commands = getEditorCommands<{
      setContent?: (
        content: Record<string, unknown>,
        options?: { emitUpdate?: boolean },
      ) => boolean;
    }>(editor);
    const setContentCommand = commands?.setContent;
    if (typeof setContentCommand !== "function") {
      scheduleHydrationApplyRetry("set_content_unavailable");
      return () => {
        cancelled = true;
        if (hydrationGenerationRef.current === generation) {
          hydrationGenerationRef.current += 1;
        }
        if (retry !== null) window.clearTimeout(retry);
      };
    }

    // setContent constructs every React NodeView. TipTap's renderer may use
    // flushSync while doing so, which React forbids from a passive lifecycle.
    // Defer the ENTIRE hydration transaction beyond this commit, not merely the
    // history reset. The page/reload/editor token prevents a queued old page
    // from applying after navigation or a newer server reload.
    queueMicrotask(() => {
      if (!stillOwnsHydration()) return;
      // A live AI draft receiving its next section: remember what is on
      // screen so only what is new enters, and the reading position holds.
      // While the run still owns the page, the manuscript layer follows the
      // writing point for a reader who is with it (no scroll here), and a
      // reader who scrolled away keeps their place.
      const liveDraftOwned = getAgentDraftPageState(expectedOwner.pageId) !== null;
      const liveDraftScroll = () => {
        if (liveDraftOwned && isFollowingAgentDraft(expectedOwner.pageId)) return null;
        const captured = captureLiveDraftScroll(
          (editor as unknown as { view?: Parameters<typeof captureLiveDraftScroll>[0] }).view,
        );
        return captured && liveDraftOwned ? { ...captured, followsEnd: false } : captured;
      };
      // A reload of the page already on screen (a live draft's next section,
      // or the run's write landing after the member accepted it) is drawn as
      // a change rather than installed cold: what entered, what was restyled,
      // what left. Any other hydration (first open, a peer's save) is plain.
      const reloadOfShownPage = Boolean(
        loadedPageIdRef.current === expectedOwner.pageId &&
          hydratedReloadNonceRef.current !== expectedOwner.reloadNonce &&
          latestContentRef.current,
      );
      const agentWriteLanding =
        reloadOfShownPage && consumeAgentWriteExpectation(expectedOwner.pageId);
      const liveDraftUpdate =
        reloadOfShownPage &&
        latestContentRef.current &&
        (agentDraftFollowingRef.current || agentWriteLanding)
          ? {
              previous: liveDraftBlockSignatures(latestContentRef.current),
              scroll: liveDraftScroll(),
              arrival: liveDraftOwned,
              snapshot:
                liveDraftOwned || agentWriteLanding
                  ? captureAiEditMotion(
                      (editor as unknown as { view?: Parameters<typeof captureAiEditMotion>[0] }).view,
                    )
                  : null,
            }
          : null;
      suppressEditorUpdateRef.current = true;
      let contentApplied = false;
      try {
        // Adopting the room's live CRDT state: the replay already populated
        // the editor through the Collaboration binding — applying the saved
        // JSON on top would duplicate the document. The baseline refs below
        // still take the SAVED content, which is exactly what autosave
        // diffs against.
        contentApplied = adoptCrdtState
          ? true
          : executeAuthorizedContentReplacement(
              editor,
              content,
              "hydration-content",
              // Its doc-attr stores go in with it: the document is drawn
              // once, with its own attributes (a doc-attribute change after
              // it redrew every node of a long book a second time).
              displayedContent,
            );
        if (!adoptCrdtState && contentApplied && stillOwnsHydration()) {
          restoreDocumentStoresAfterContent(editor, displayedContent);
        } else if (adoptCrdtState && !canonicalReady && contentApplied && stillOwnsHydration()) {
          restorePersistedSectionPageAuthority(flatContent);
        }
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      if (!contentApplied || !stillOwnsHydration()) {
        if (stillOwnsHydration()) {
          scheduleHydrationApplyRetry("set_content_rejected");
        }
        return;
      }
      // A stored document the schema cannot hold (corpus R59-D15: a list item
      // that opens with a display equation) came up as one empty paragraph
      // with nothing said. It is reported, typed and with the node that
      // failed, and the page says it cannot be opened.
      // The same for a room that holds nothing of a stored body with words
      // (a room seeded empty because the body could not be built: R59-D15
      // before fbf60a5a6e): the room's replay already filled the editor here.
      // A long room fills the editor in tasks after this point, so the room
      // itself is asked, not the editor.
      if (
        adoptCrdtState
          ? (collabRoomFragmentEmpty(collabSession) && storedDocumentHasText(displayedContent)) ||
            // The room's document failed its schema before this load cleared
            // the page's content issue (the bridge reported it then).
            pagedBridgeIssueRef.current === "unreadable-document"
          : hydrationLostContent(editor, content)
      ) {
        reportUnreadableDocument(editor, displayedContent);
        rejectInvalidDocumentContent("invalid_content");
        return;
      }

      // Opening (or server-reloading) a document leaves an EMPTY undo stack.
      // This now runs in the same post-commit task as setContent, after comment
      // restoration, so React NodeViews never encounter lifecycle flushSync.
      if (!collabSession) clearHydrationUndoHistory(editor);
      if (!stillOwnsHydration()) return;
      latestContentRef.current = flatContent;
      acknowledgedDocumentBaselineRef.current = validContentVersion(
        page.content_version,
      )
        ? {
            pageId: expectedOwner.pageId,
            title: page.title,
            content: flatContent,
            contentVersion: page.content_version,
            contentSha256: validContentSha256(page.content_sha256)
              ? page.content_sha256
              : null,
          }
        : null;
      intentionalEmptyOverwriteRef.current = null;
      loadedPageIdRef.current = expectedOwner.pageId;
      hydratedReloadNonceRef.current = expectedOwner.reloadNonce;
      hydratedAsPartsRef.current = documentPartsCount(page.content_json) > 1;
      hydratedBindingRef.current = { editor, session: collabSession };
      hydratedObserverProjectionRef.current = observerProjection;
      // Said at once (the count below reaches its readers a render later):
      // the editor holds another hydration's content from here on.
      hydrationAppliedRef.current += 1;
      setHydrationCount((value) => value + 1);
      setTrackedTitle(t0);
      // Echo loaded title up so parent window syncs its titlebar to the saved value.
      onTitleChange?.(t0, "loaded");
      hydrationApplyAttemptsRef.current = null;
      setHydrationFailure(null);
      setDocumentContentIssue(null);
      setTrackedEditorHydrated(true);
      if (liveDraftUpdate) {
        playLiveDraftUpdate(
          (editor as unknown as { view?: Parameters<typeof playLiveDraftUpdate>[0] }).view,
          liveDraftUpdate.previous,
          liveDraftBlockSignatures(flatContent),
          liveDraftUpdate.scroll,
          { arrival: liveDraftUpdate.arrival, snapshot: liveDraftUpdate.snapshot },
        );
      }
      if (observerProjection) onPlainTextChange?.(editor.getText());
      if (!canonicalReady) publishCollaborativeDocumentAttrsRef.current?.();
      setTrackedLocalSaveStatus("saved");
      lifecycleSourceScopeRef.current = observationScope;
      emitDocumentLifecycleFact("hydrated", page);
    });
    return () => {
      cancelled = true;
      if (hydrationGenerationRef.current === generation) {
        hydrationGenerationRef.current += 1;
      }
      if (retry !== null) window.clearTimeout(retry);
    };
  }, [
    autosave.page,
    autosave.reloadNonce,
    emitDocumentLifecycleFact,
    canonicalPreparing,
    canonicalReady,
    collaborationEnabled,
    collabSession,
    editor,
    guestMode,
    hydrateRetryTick,
    normalizeDocumentForSave,
    observerProjection,
    onPlainTextChange,
    onTitleChange,
    pageId,
    rejectInvalidDocumentContent,
    restoreCommentThreads,
    restorePersistedSectionPageAuthority,
    setTrackedEditorHydrated,
    setTrackedLocalSaveStatus,
    setTrackedTitle,
  ]);

  const retryDocumentHydration = useCallback(() => {
    hydrationApplyAttemptsRef.current = null;
    setHydrationFailure(null);
    setHydrateRetryTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!guestMode && autosave.error && !autosave.loading && !editorHydrated) {
      setTrackedEditorHydrated(true);
    }
  }, [
    autosave.error,
    autosave.loading,
    editorHydrated,
    guestMode,
    setTrackedEditorHydrated,
  ]);

  // A visitor's homepage edits (classic mode), made here once the page is
  // open, settled and writable: see the classicPendingEdits prop.
  const classicPendingEditsRef = useRef(classicPendingEdits);
  const classicPendingEditsDoneRef = useRef(false);
  // what the member does to the page themselves before the replay runs (a
  // key, a paste, a drop), not what the editor settles on its own while a
  // long page fills in: their edit wins and the replay goes to the notice
  const classicMemberActedRef = useRef(false);
  useEffect(() => {
    if (!classicPendingEditsRef.current || !isUsableEditor(editor)) return;
    const surface = editor.view.dom;
    const act = () => {
      if (!classicPendingEditsDoneRef.current) classicMemberActedRef.current = true;
    };
    const inputEvents = ["keydown", "beforeinput", "paste", "drop", "cut"] as const;
    for (const name of inputEvents) surface.addEventListener(name, act, true);
    return () => {
      for (const name of inputEvents) surface.removeEventListener(name, act, true);
    };
  }, [editor]);
  // ...and if the page is not ready for them within half a minute of being
  // writable, the member is told (the notice keeps them) instead of waiting
  // on nothing they can see
  const classicPendingEditsWritable =
    Boolean(classicPendingEdits) && !guestMode && !previewMode && editorHydrated && shellWriteAllowed;
  useEffect(() => {
    const pending = classicPendingEditsRef.current;
    if (!pending || !classicPendingEditsWritable) return;
    const timer = window.setTimeout(() => {
      if (classicPendingEditsDoneRef.current) return;
      classicPendingEditsDoneRef.current = true;
      void pending.settle("apply_not_ready");
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [classicPendingEditsWritable]);
  useEffect(() => {
    const pending = classicPendingEditsRef.current;
    if (!pending || classicPendingEditsDoneRef.current) return;
    if (guestMode || previewMode || !editorHydrated || !shellWriteAllowed) return;
    if (!isUsableEditor(editor)) return;
    if (USE_COLLAB_EDITING && !canonicalReady) return;
    // an opening that upgrades the page's room saves it once (its first
    // checkpoint) and may re-read it: the replay waits until that is done
    if (autosave.page?.page_causal_activation_available && !autosave.page.page_causal_checkpoint) return;
    if (autosave.loading || autosave.isSaving || autosave.isDirty || autosave.isLocalAuthorityPending) return;
    // let the opening settle (pagination, the room's first sync) first; if
    // the member types into the page meanwhile, their edit wins: the homepage
    // edits are not replayed over it (the notice keeps them instead)
    const timer = window.setTimeout(() => {
      if (classicPendingEditsDoneRef.current) return;
      classicPendingEditsDoneRef.current = true;
      void (async () => {
        try {
          const edits = await pending.load();
          if (!edits) return;
          const [{ rebaseClassicEdits }, { classicEditTransaction }] = await Promise.all([
            import("@mrnote/core/web/lib/classic-start/rebase.ts"),
            import("@mrnote/core/web/lib/classic-start/editor-apply.ts"),
          ]);
          if (!isUsableEditor(editor) || !shellWriteAllowedRef.current) {
            await pending.settle("editor_not_writable");
            return;
          }
          if (classicMemberActedRef.current) {
            await pending.settle("edited_before_apply");
            return;
          }
          // The page may not take input yet (its sheets still filling in): the
          // room's write gate then filters the transaction out. Wait for an
          // editable view and look whether the edit was taken; make it again
          // from the current document until it is (20 s at most).
          type Rebased = Extract<ReturnType<typeof rebaseClassicEdits>, { ok: true }>;
          // The visitor's edit placed on the document as it opened (the
          // target), then made as ONE ordinary transaction, so one Undo takes
          // it back. A page still filling its sheets refuses input at its
          // room's write gate (filterTransaction): wait for an editable view,
          // dispatch, and look whether the document took it; work it out
          // again from the current document and retry for 20 s at most.
          let rebased: Rebased | null = null;
          let steps = 0;
          let taken = false;
          for (let attempt = 0; attempt < 20 && !taken; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1000));
            if (!isUsableEditor(editor) || !editor.view.editable) continue;
            const current = normalizeDocumentForSave(
              runtimeDocumentJson(editor.state.doc) as Record<string, unknown>,
              false,
            );
            if (!current.ok) {
              await pending.settle("editor_document_invalid");
              return;
            }
            const attemptRebased = rebaseClassicEdits({
              realBase: current.document as Record<string, unknown>,
              guestBase: edits.base,
              guestFinal: edits.final,
            });
            if (!attemptRebased.ok) {
              await pending.settle(`rebase_refused:${attemptRebased.reason}@${attemptRebased.at.slice(0, 200)}`);
              return;
            }
            if (!attemptRebased.changed) {
              await pending.settle("applied");
              return;
            }
            const applied = classicEditTransaction({
              state: editor.state,
              schema: editor.schema,
              current: current.document as Record<string, unknown>,
              target: attemptRebased.content,
              toRuntimeBlock: (block, attrs) => {
                const runtime = hydrateStoredPageBlocks(
                  hydrateLegacyDocxOfficeMathStyles({ type: "doc", attrs: attrs ?? {}, content: [block] }),
                ) as { content?: Array<{ type?: string; content?: Record<string, unknown>[] }> };
                const first = runtime.content?.[0];
                return (first?.type === "pageBlock" ? first.content?.[0] : first) as Record<string, unknown>;
              },
            });
            if (!applied.ok) {
              await pending.settle(`apply_refused:${applied.reason}`);
              return;
            }
            if (!applied.transaction) {
              await pending.settle("applied");
              return;
            }
            const beforeDispatch = editor.state.doc;
            // an ordinary, undoable step of the member's own: the paged
            // bridge publishes it as authoring like any keystroke
            editor.view.dispatch(applied.transaction.setMeta("addToHistory", true));
            if (editor.state.doc !== beforeDispatch) {
              taken = true;
              rebased = attemptRebased;
              steps = applied.transaction.steps.length;
            }
          }
          if (!rebased) {
            await pending.settle("apply_not_editable");
            return;
          }
          // the edit is made; it stays made only if the page keeps it (a room
          // that syncs over it, a refused save): look again before the kept
          // copy is let go, and keep it (with the notice) if it is gone
          // each block's id and text, in order: what the replay made
          const outline = (doc: unknown) => {
            const blocks = (doc as { content?: unknown[] }).content ?? [];
            const text = (node: unknown): string => {
              const value = node as { text?: unknown; content?: unknown[] };
              return typeof value.text === "string" ? value.text : (value.content ?? []).map(text).join("");
            };
            // text only: an added block may be given its own id by the editor
            return JSON.stringify(blocks.map((block) => text(block)));
          };
          const expected = outline(rebased.content);
          await new Promise((resolve) => window.setTimeout(resolve, 6000));
          const after = isUsableEditor(editor)
            ? normalizeDocumentForSave(runtimeDocumentJson(editor.state.doc) as Record<string, unknown>, false)
            : null;
          const kept = Boolean(after?.ok && outline(after.document) === expected);
          if (process.env.NODE_ENV !== "production") {
            console.info("[classic-start] replayed", { steps, kept });
          }
          if (!kept) {
            await pending.settle("apply_lost");
            return;
          }
          // ...and the kept copy goes only once the SERVER has it: the saved
          // page is read back until its blocks are the replayed ones (2 min)
          let saved = false;
          for (let attempt = 0; attempt < 40 && !saved; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 3000));
            try {
              const page = await notebookSDK.getPage(pageId, { cache: "no-store" });
              saved = Boolean(page.content_json && outline(page.content_json) === expected);
            } catch {
              // a failed read is tried again
            }
          }
          if (process.env.NODE_ENV !== "production") {
            console.info("[classic-start] saved", { saved });
          }
          await pending.settle(saved ? "applied" : "apply_unconfirmed");
        } catch (error) {
          await pending.settle(`apply_failed:${error instanceof Error ? error.name : "error"}`);
        }
      })();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [
    autosave.isDirty,
    autosave.isLocalAuthorityPending,
    autosave.isSaving,
    autosave.loading,
    autosave.page,
    canonicalReady,
    editor,
    editorHydrated,
    guestMode,
    normalizeDocumentForSave,
    pageId,
    previewMode,
    shellWriteAllowed,
  ]);

  useEffect(() => {
    if (!guestMode || !isUsableEditor(editor) || guestInitializedRef.current)
      return;
    const commands = getEditorCommands<{
      setContent?: (
        content: Record<string, unknown>,
        options?: { emitUpdate?: boolean },
      ) => boolean;
    }>(editor);
    if (typeof commands?.setContent !== "function") return;
    
    // workbench Enter grew one endless page and 空白页 looked dead). Guest
    // hydration mirrors the authed path: ALWAYS wrap — the schema is
    // `pageBlock+`, so Enter past the page bottom paginates in guest mode
    // exactly like authed. The refs keep the FLAT form since every
    // serialization boundary flattens.
    const prepared = prepareDocumentHydration(initialContent, paginationEditorRef.current, pageId);
    if (!prepared.ok) {
      rejectInvalidDocumentContent(prepared.issue);
      return;
    }
    const { flatContent, content } = prepared;
    const expectedOwner = {
      pageId,
      reloadNonce: autosave.reloadNonce,
      editor,
    };
    const generation = ++hydrationGenerationRef.current;
    let cancelled = false;
    const stillOwnsHydration = () => {
      const owner = hydrationOwnerRef.current;
      return (
        !cancelled &&
        !guestInitializedRef.current &&
        hydrationGenerationRef.current === generation &&
        owner?.pageId === expectedOwner.pageId &&
        owner.reloadNonce === expectedOwner.reloadNonce &&
        owner.editor === expectedOwner.editor &&
        importPageIdRef.current === expectedOwner.pageId &&
        isUsableEditor(expectedOwner.editor)
      );
    };
    queueMicrotask(() => {
      if (!stillOwnsHydration()) return;
      suppressEditorUpdateRef.current = true;
      let contentApplied = false;
      try {
        // Its doc-attr stores go in with the content, as the authed
        // hydration's do: restored one transaction each after it, each one
        // that changed a doc attribute drew the whole document again.
        contentApplied = executeAuthorizedContentReplacement(
          editor,
          content,
          "hydration-content",
          content,
        );
        if (contentApplied && stillOwnsHydration()) {
          restoreDocumentStoresAfterContent(editor, content);
        }
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      if (!contentApplied || !stillOwnsHydration()) return;
      if (!collabSession) clearHydrationUndoHistory(editor);
      if (!stillOwnsHydration()) return;
      latestContentRef.current = flatContent;
      setTrackedTitle(initialTitle);
      onTitleChange?.(initialTitle);
      setTrackedLocalSaveStatus("unsaved");
      setDocumentContentIssue(null);
      setTrackedEditorHydrated(true);
      guestContentRevisionRef.current = guestContentRevision;
      guestInitializedRef.current = true;
    });
    return () => {
      cancelled = true;
      if (hydrationGenerationRef.current === generation) {
        hydrationGenerationRef.current += 1;
      }
    };
  }, [
    autosave.reloadNonce,
    collabSession,
    editor,
    guestMode,
    guestContentRevision,
    initialContent,
    initialTitle,
    normalizeDocumentForSave,
    onTitleChange,
    pageId,
    rejectInvalidDocumentContent,
    restoreCommentThreads,
    setTrackedEditorHydrated,
    setTrackedLocalSaveStatus,
    setTrackedTitle,
  ]);

  useEffect(() => {
    if (
      !guestMode ||
      !guestInitializedRef.current ||
      !guestContentRevision ||
      guestContentRevisionRef.current === guestContentRevision ||
      !isUsableEditor(editor)
    ) {
      return;
    }
    const commands = getEditorCommands<{
      setContent?: (
        content: Record<string, unknown>,
        options?: { emitUpdate?: boolean },
      ) => boolean;
    }>(editor);
    if (typeof commands?.setContent !== "function") return;

    const prepared = prepareDocumentHydration(initialContent, paginationEditorRef.current, pageId);
    if (!prepared.ok) {
      rejectInvalidDocumentContent(prepared.issue);
      return;
    }
    const { flatContent, content } = prepared;
    const expectedOwner = {
      pageId,
      reloadNonce: autosave.reloadNonce,
      editor,
    };
    const generation = ++hydrationGenerationRef.current;
    let cancelled = false;
    const stillOwnsHydration = () => {
      const owner = hydrationOwnerRef.current;
      return (
        !cancelled &&
        guestInitializedRef.current &&
        hydrationGenerationRef.current === generation &&
        owner?.pageId === expectedOwner.pageId &&
        owner.reloadNonce === expectedOwner.reloadNonce &&
        owner.editor === expectedOwner.editor &&
        importPageIdRef.current === expectedOwner.pageId &&
        isUsableEditor(expectedOwner.editor)
      );
    };
    queueMicrotask(() => {
      if (!stillOwnsHydration()) return;
      suppressEditorUpdateRef.current = true;
      let contentApplied = false;
      try {
        // Its doc-attr stores go in with the content, as the authed
        // hydration's do: restored one transaction each after it, each one
        // that changed a doc attribute drew the whole document again.
        contentApplied = executeAuthorizedContentReplacement(
          editor,
          content,
          "hydration-content",
          content,
        );
        if (contentApplied && stillOwnsHydration()) {
          restoreDocumentStoresAfterContent(editor, content);
        }
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      if (!contentApplied || !stillOwnsHydration()) return;
      if (!collabSession) clearHydrationUndoHistory(editor);
      if (!stillOwnsHydration()) return;
      latestContentRef.current = flatContent;
      guestContentRevisionRef.current = guestContentRevision;
      setDocumentContentIssue(null);
      setTrackedLocalSaveStatus("unsaved");
    });
    return () => {
      cancelled = true;
      if (hydrationGenerationRef.current === generation) {
        hydrationGenerationRef.current += 1;
      }
    };
  }, [
    autosave.reloadNonce,
    collabSession,
    editor,
    guestContentRevision,
    guestMode,
    initialContent,
    normalizeDocumentForSave,
    pageId,
    rejectInvalidDocumentContent,
    restoreCommentThreads,
    setTrackedLocalSaveStatus,
  ]);

  useEffect(() => {
    function handler(e: Event) {
      const command = (e as CustomEvent).detail;
      if (!isNativeDocumentCommand(command)) return;
      window.dispatchEvent(
        new CustomEvent<ApplyDocumentEditCommandDetail>(
          APPLY_DOCUMENT_EDIT_COMMAND_EVENT,
          {
            detail: {
              proposalId:
                command.action_log_id ||
                command.action_type ||
                `${pageId}:legacy-document-command`,
              targetPageId: pageId,
              targetWindowId: windowId || null,
              command,
            },
          },
        ),
      );
    }
    window.addEventListener("mrnote:apply-document-command", handler);
    return () =>
      window.removeEventListener("mrnote:apply-document-command", handler);
  }, [pageId, windowId]);

  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const activeEditor = editor;
    function handler(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.targetPageId !== pageId) return;
      if (detail.targetWindowId && detail.targetWindowId !== windowId) return;
      if (!isUsableEditor(activeEditor)) return;
      const { from, to, empty } = activeEditor.state.selection;
      const fallbackSelected = empty
        ? ""
        : activeEditor.state.doc.textBetween(from, to, "\n");
      const selected = empty
        ? ""
        : documentTextForAiContext({
            json: mergePagedRuntimeContinuationsJson(
              documentJsonSliceForAiContext(activeEditor.state.doc, from, to),
            ),
            fallbackText: fallbackSelected,
          });
      const fallbackDocumentText = activeEditor.state.doc.textBetween(
        0,
        activeEditor.state.doc.content.size,
        "\n",
      );
      const liveDocumentJson = mergePagedRuntimeContinuationsJson(
        activeEditor.getJSON(),
      );
      const documentText = documentTextForAiContext({
        json: liveDocumentJson,
        fallbackText: fallbackDocumentText,
      });
      detail.respond?.(
        documentEditContextForSelection({
          doc: activeEditor.state.doc,
          from,
          to,
          empty,
          selectedText: selected,
          documentText,
          // The live doc is SHEETED (pageBlock+); the emptiness contract is
          // defined on the FLAT storage form — one empty paragraph — so
          // flatten before asking (a blank 空白页 must report empty).
          documentIsEmpty: documentJsonIsStructurallyEmpty(
            flattenPageBlocks(liveDocumentJson),
          ),
          pageId,
          windowId,
          targetLabel: selected
            ? t("ai.currentSelection")
            : t("ai.currentPage"),
        }),
      );
    }
    window.addEventListener(DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT, handler);
    return () =>
      window.removeEventListener(DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT, handler);
  }, [editor, pageId, t, windowId]);

  // A page in a live room receives the run's write (or the member's accepted
  // proposal) as a remote collaborative transaction, not as a reload. The DOM
  // still shows the old body when the transaction is about to apply, so the
  // blocks are captured then and compared once the view has drawn the new
  // body: what entered rises under the focus ring, what left is struck through.
  useEffect(() => {
    if (!editor || !pageId) return;
    const activeEditor = editor;
    let pending: ReturnType<typeof captureAiEditMotion> = null;
    const remoteChange = (transaction: Transaction): boolean => {
      const change = transaction.getMeta(ySyncPluginKey) as
        | { isChangeOrigin?: boolean }
        | undefined;
      return Boolean(transaction.docChanged && change?.isChangeOrigin);
    };
    const before = ({ transaction }: { transaction: Transaction }) => {
      if (pending || !remoteChange(transaction) || !isAgentWriteExpected(pageId)) return;
      pending = captureAiEditMotion(
        (activeEditor as unknown as { view?: Parameters<typeof captureAiEditMotion>[0] }).view,
      );
    };
    const after = ({ transaction }: { transaction: Transaction }) => {
      if (!pending || !transaction.docChanged) return;
      const snapshot = pending;
      pending = null;
      playAiEditMotion(
        (activeEditor as unknown as { view?: Parameters<typeof playAiEditMotion>[0] }).view,
        snapshot,
      );
    };
    activeEditor.on("beforeTransaction", before);
    activeEditor.on("transaction", after);
    return () => {
      activeEditor.off("beforeTransaction", before);
      activeEditor.off("transaction", after);
    };
  }, [editor, pageId]);

  // The AI panel docked beside this window asks where a proposed change
  // goes: scroll there and flash it, leaving the document and selection alone.
  useEffect(() => {
    if (!isUsableEditor(editor) || !windowId) return;
    const activeEditor = editor;
    function handler(event: Event) {
      const detail = (event as CustomEvent<DocumentLocateRequestDetail>).detail;
      if (!detail || detail.targetWindowId !== windowId) return;
      if (!isUsableEditor(activeEditor)) return;
      detail.respond(locateAndFlashInEditor(activeEditor.view, detail.needles));
    }
    window.addEventListener(DOCUMENT_LOCATE_REQUEST_EVENT, handler);
    return () => window.removeEventListener(DOCUMENT_LOCATE_REQUEST_EVENT, handler);
  }, [editor, windowId]);

  // Strokes the room took out, not this window: said once, and where to get them back.
  useEffect(() => {
    const onTaken = (event: Event) => {
      const strokes = (event as CustomEvent<{ strokes?: number }>).detail?.strokes ?? 0;
      toast({ title: t("editor.inkTakenByRoom", { count: strokes }), variant: "destructive" });
    };
    window.addEventListener(INK_TAKEN_BY_ROOM_EVENT, onTaken);
    return () => window.removeEventListener(INK_TAKEN_BY_ROOM_EVENT, onTaken);
  }, [t]);

  // ---- Auto-save ----------------------------------------------------------

  const saveContent = useCallback(
    async (
      contentJson: Record<string, unknown>,
      nextTitle?: string,
      /** `contentJson` normalized for saving already (the settle save's
       * normalization in steps): not normalized again. */
      normalizedAlready?: TipTapDocumentContentResult,
    ): Promise<false | { contentVersion: number | null }> => {
      const savePageId = pageId;
      if (importPageIdRef.current !== savePageId) return false;
      if (!guestMode && !editorHydratedRef.current) {
        reportEditorSaveRefusal("editor.save_content", "editor_not_hydrated", null);
        return false;
      }
      const normalized = normalizedAlready ?? normalizeDocumentForSave(contentJson);
      if (!normalized.ok) {
        reportEditorSaveRefusal("editor.save_content", "editor_document_invalid", normalized.issue);
        rejectInvalidDocumentContent(normalized.issue);
        return false;
      }
      const normalizedContent = normalized.document;
      if (guestMode) {
        if (importPageIdRef.current !== savePageId) return false;
        latestContentRef.current = normalizedContent;
        if (nextTitle !== undefined) {
          titleRef.current = nextTitle;
        }
        setTrackedLocalSaveStatus("unsaved");
        onGuestSaveRequest?.();
        return { contentVersion: null };
      }
      const draft = buildSaveDraft(
        normalizedContent,
        nextTitle ?? titleRef.current,
      );
      const localSaveMutation = currentLocalSaveMutation(savePageId);
      if (
        localSaveMutation &&
        !markLocalSaveMutationQueued(localSaveMutation, draft)
      ) {
        reportEditorSaveRefusal("editor.save_content", "editor_generation_moved", "queue_refused");
        setTrackedLocalSaveStatus("unsaved");
        return false;
      }
      setTrackedLocalSaveStatus("saving");
      const saved = await savePageNow(draft);
      // The save closure can outlive its page while composition settles or the
      // request is in flight. Never publish an old receipt into the newly
      // activated page's status/content refs.
      if (importPageIdRef.current !== savePageId) return false;
      if (
        !saved ||
        saved.id !== savePageId ||
        !validContentVersion(saved.content_version)
      ) {
        // The autosave hook records its own pre-request/response/receipt
        // verdict; this names the editor generation it left unsaved. Nothing
        // back does not mean nothing was sent (a body the server refused):
        // only a receipt proves a request here.
        // Nothing of the editor's own to save (root state it filled in by
        // itself, not an edit): the stored page is this page. Export and the
        // others asking go on from it; it is no failure (a refused capture of
        // an untouched page read as 54 refused saves on production).
        if (!saved) {
          const local = localSaveGenerationRef.current;
          const durable = acknowledgedDocumentBaselineRef.current;
          if (
            local.pageId === savePageId && !local.dirty && local.queuedGeneration === local.generation &&
            durable?.pageId === savePageId && validContentVersion(durable.contentVersion)
          ) {
            setTrackedLocalSaveStatus("saved");
            return { contentVersion: durable.contentVersion };
          }
        }
        reportEditorSaveRefusal("editor.save_content", "editor_save_not_acknowledged",
          !saved ? "autosave_returned_nothing" : saved.id !== savePageId ? "receipt_page_mismatch" : "receipt_version_invalid",
          { requestSent: saved ? true : null });
        setTrackedLocalSaveStatus("unsaved");
        return false;
      }
      if (localSaveMutation) {
        if (
          !acknowledgeLocalSaveMutation(
            localSaveMutation,
            saved,
            // saveNow returns only after the autosave hook validates the direct
            // PATCH receipt. The hook also binds that receipt to this request's
            // submitted draft for the passive autosave path above.
            true,
          )
        ) {
          reportEditorSaveRefusal("editor.acknowledge", "editor_receipt_refused",
            lastAcknowledgementRefusalRef.current, { requestSent: true, receiptContentVersion: saved.content_version });
          setTrackedLocalSaveStatus("unsaved");
          return false;
        }
      } else if (currentLocalSaveMutation(savePageId)) {
        // A new editor transaction landed while this request was in flight.
        // Its generation, not this older receipt, owns the visible status.
        setTrackedLocalSaveStatus("unsaved");
        return false;
      } else {
        acknowledgedDocumentBaselineRef.current = {
          pageId: savePageId,
          title: saved.title,
          content: normalizedContent,
          contentVersion: saved.content_version,
          contentSha256: validContentSha256(saved.content_sha256)
            ? saved.content_sha256
            : null,
        };
        intentionalEmptyOverwriteRef.current = null;
        setTrackedLocalSaveStatus("saved");
      }
      return {
        contentVersion: saved.content_version,
      };
    },
    [
      acknowledgeLocalSaveMutation,
      savePageNow,
      buildSaveDraft,
      currentLocalSaveMutation,
      guestMode,
      markLocalSaveMutationQueued,
      normalizeDocumentForSave,
      onGuestSaveRequest,
      pageId,
      rejectInvalidDocumentContent,
      reportEditorSaveRefusal,
      setTrackedLocalSaveStatus,
    ],
  );

  const readSaveFailureMessage = useCallback(
    () =>
      autosave.getLastSaveFailureMessage?.() ||
      autosave.error ||
      t("pages.saveFailed"),
    [autosave, t],
  );

  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const activeEditor = editor;
    function handler(event: Event) {
      const detail = (event as CustomEvent<DocumentEditUndoRequestDetail>)
        .detail;
      if (
        !detail ||
        !documentEditCommandMatchesTarget(detail, { pageId, windowId })
      ) {
        return;
      }
      void (async () => {
        const commands = getEditorCommands<{
          setContent?: (
            content: Record<string, unknown>,
            options?: { emitUpdate?: boolean },
          ) => boolean;
        }>(activeEditor);
        const snapshot = documentEditUndoSnapshotsRef.current.get(
          detail.receiptId,
        );
        if (!snapshot) {
          notifyDocumentEditUndoResult({
            receiptId: detail.receiptId,
            proposalId: detail.proposalId,
            targetPageId: detail.targetPageId,
            targetWindowId: detail.targetWindowId,
            ok: false,
            message: t("editor.documentCommandApplyFailed"),
          });
          return;
        }
        const contentBeforeUndo = activeEditor.getJSON();
        const restoreContentBeforeUndo = () => {
          const normalized = normalizeDocumentForSave(
            contentBeforeUndo as Record<string, unknown>,
          );
          if (!normalized.ok) {
            rejectInvalidDocumentContent(normalized.issue);
            return false;
          }
          const normalizedBeforeUndo = normalized.document;
          latestContentRef.current = normalizedBeforeUndo;
          const restored = executeAuthorizedContentReplacement(
            activeEditor,
            contentBeforeUndo,
            "content-restoration",
          );
          if (restored) {
            restoreCommentThreads(contentBeforeUndo as Record<string, unknown>);
          }
          autosave.replacePendingDraft(
            buildSaveDraft(normalizedBeforeUndo, titleRef.current),
          );
          return restored;
        };
        // The undo is the AI's edit played backwards: what it wrote folds out,
        // what was there unfolds.
        const undoMotion = captureAiEditMotion(
          (activeEditor as unknown as { view?: Parameters<typeof captureAiEditMotion>[0] }).view,
        );
        const restored = executeEditorCommand(
          commands?.setContent,
          snapshot.content,
          {
            emitUpdate: false,
          },
        );
        if (restored) {
          playAiEditMotion(
            (activeEditor as unknown as { view?: Parameters<typeof playAiEditMotion>[0] }).view,
            undoMotion,
            { direction: "reverse" },
          );
          // setContent replaces only the doc's children and drops top-level
          // doc attrs, where the comment-thread store lives
          // (doc.attrs.commentThreads). Re-attach it so the comments sidebar
          // and amber highlights stay paired after an AI-edit undo (mirrors
          // the two hydration sites). No-op for documents without comments.
          restoreCommentThreads(snapshot.content as Record<string, unknown>);
        }
        // The undo set the content without an update (emitUpdate: false), so
        // nothing marked the page as edited: a save that then came back with
        // nothing read as "nothing of the editor's own to save" and the undo
        // reported saved while the server kept the AI's version. It is an
        // edit of the page's, as any other.
        if (restored) beginLocalSaveMutation();
        const saved = restored
          ? await saveContent(snapshot.content as Record<string, unknown>)
          : false;
        if (restored && saved) {
          documentEditUndoSnapshotsRef.current.delete(detail.receiptId);
        } else if (restored && !saved) {
          restoreContentBeforeUndo();
        }
        notifyDocumentEditUndoResult({
          receiptId: detail.receiptId,
          proposalId: detail.proposalId,
          targetPageId: detail.targetPageId,
          targetWindowId: detail.targetWindowId,
          ok: Boolean(restored && saved),
          message: !restored
            ? t("editor.documentCommandApplyFailed")
            : !saved
              ? readSaveFailureMessage()
              : undefined,
        });
      })();
    }
    window.addEventListener(DOCUMENT_EDIT_UNDO_REQUEST_EVENT, handler);
    return () =>
      window.removeEventListener(DOCUMENT_EDIT_UNDO_REQUEST_EVENT, handler);
  }, [
    autosave,
    beginLocalSaveMutation,
    buildSaveDraft,
    editor,
    normalizeDocumentForSave,
    pageId,
    rejectInvalidDocumentContent,
    readSaveFailureMessage,
    restoreCommentThreads,
    saveContent,
    t,
    windowId,
  ]);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<DocumentEditAppliedDetail>).detail;
      if (
        !detail ||
        !documentEditCommandMatchesTarget(detail, { pageId, windowId })
      ) {
        return;
      }
      // Surface in-editor success feedback for AI document edits, which would
      // otherwise apply silently. Failures keep their existing card-based
      // messaging in the AI panel, so only confirm successful applies here.
      if (detail.ok) {
        toast({ title: t("editor.documentEditApplied") });
      }
    }
    window.addEventListener(DOCUMENT_EDIT_APPLIED_EVENT, handler);
    return () =>
      window.removeEventListener(DOCUMENT_EDIT_APPLIED_EVENT, handler);
  }, [pageId, t, windowId]);

  useEffect(() => {
    if (!isUsableEditor(editor)) return;
    const activeEditor = editor;
    function handler(event: Event) {
      const detail = (event as CustomEvent<ApplyDocumentEditCommandDetail>)
        .detail;
      if (
        !detail ||
        !documentEditCommandMatchesTarget(detail, { pageId, windowId })
      ) {
        return;
      }
      void (async () => {
        if (!isUsableEditor(activeEditor)) {
          notifyDocumentEditApplied({
            proposalId: detail.proposalId,
            targetPageId: detail.targetPageId,
            targetWindowId: detail.targetWindowId,
            ok: false,
            message: documentCommandFailureMessage(t, "invalid_command"),
          });
          return;
        }
        const beforeContent = activeEditor.getJSON();
        // What is on screen before the AI's edit, so the edit is drawn as a
        // change the moment the command has run (the save follows later).
        const aiMotion = captureAiEditMotion(
          (activeEditor as unknown as { view?: Parameters<typeof captureAiEditMotion>[0] }).view,
        );
        const restoreBeforeContent = () => {
          const normalized = normalizeDocumentForSave(
            beforeContent as Record<string, unknown>,
          );
          if (!normalized.ok) {
            rejectInvalidDocumentContent(normalized.issue);
            return false;
          }
          const normalizedBeforeContent = normalized.document;
          latestContentRef.current = normalizedBeforeContent;
          const restored = executeAuthorizedContentReplacement(
            activeEditor,
            beforeContent,
            "content-restoration",
          );
          if (restored) {
            restoreCommentThreads(beforeContent as Record<string, unknown>);
          }
          autosave.replacePendingDraft(
            buildSaveDraft(normalizedBeforeContent, titleRef.current),
          );
          return restored;
        };
        try {
          const commandValidation = validateNativeDocumentCommandForApply(
            detail.command,
          );
          if (!commandValidation.ok) {
            notifyDocumentEditApplied({
              proposalId: detail.proposalId,
              targetPageId: detail.targetPageId,
              targetWindowId: detail.targetWindowId,
              ok: false,
              message: documentCommandFailureMessage(
                t,
                commandValidation.reason,
              ),
              receipt: null,
            });
            return;
          }
          let sourceContentVersion = validContentVersion(
            autosave.page?.content_version,
          )
            ? autosave.page.content_version
            : null;
          if (
            !guestMode &&
            detail.baseContentVersion !== null &&
            detail.baseContentVersion !== undefined
          ) {
            // Drain any user typing first. A proposal derived from an older
            // revision must fail before its first editor mutation instead of
            // being rebased silently onto newer document content.
            flushPendingContentSerialize();
            const sourcePage = await autosave.saveNow();
            if (!validContentVersion(sourcePage?.content_version)) {
              notifyDocumentEditApplied({
                proposalId: detail.proposalId,
                targetPageId: detail.targetPageId,
                targetWindowId: detail.targetWindowId,
                ok: false,
                message: readSaveFailureMessage(),
                receipt: null,
              });
              return;
            }
            sourceContentVersion = sourcePage.content_version;
            if (
              !validContentVersion(detail.baseContentVersion) ||
              detail.baseContentVersion !== sourceContentVersion
            ) {
              notifyDocumentEditApplied({
                proposalId: detail.proposalId,
                targetPageId: detail.targetPageId,
                targetWindowId: detail.targetWindowId,
                ok: false,
                message: documentCommandFailureMessage(t, "operation_failed"),
                receipt: null,
              });
              return;
            }
          }
          const commandResult = executeDocumentCommandWithResult(
            activeEditor,
            detail.command,
          );
          if (commandResult.ok) {
            playAiEditMotion(
              (activeEditor as unknown as { view?: Parameters<typeof playAiEditMotion>[0] }).view,
              aiMotion,
            );
          }
          let receipt = commandResult.ok
            ? createDocumentEditReceipt(detail, {
                pageType: "document",
                undoable: true,
              })
            : null;
          if (receipt) {
            rememberCappedSnapshot(
              documentEditUndoSnapshotsRef.current,
              receipt.id,
              {
                content: beforeContent,
              },
            );
          }
          const normalizedAfter = commandResult.ok
            ? normalizeDocumentForSave(
                activeEditor.getJSON() as Record<string, unknown>,
              )
            : null;
          if (normalizedAfter && !normalizedAfter.ok) {
            documentEditUndoSnapshotsRef.current.delete(receipt?.id || "");
            restoreBeforeContent();
            rejectInvalidDocumentContent(normalizedAfter.issue);
            notifyDocumentEditApplied({
              proposalId: detail.proposalId,
              targetPageId: detail.targetPageId,
              targetWindowId: detail.targetWindowId,
              ok: false,
              message: documentCommandFailureMessage(t, "invalid_command"),
            });
            return;
          }
          const saved = commandResult.ok
            ? await saveContent(
                normalizedAfter && normalizedAfter.ok
                  ? normalizedAfter.document
                  : (activeEditor.getJSON() as Record<string, unknown>),
              )
            : false;
          if (!saved && receipt) {
            documentEditUndoSnapshotsRef.current.delete(receipt.id);
            receipt = null;
          }
          if (commandResult.ok && !saved) {
            restoreBeforeContent();
          }
          if (receipt && saved) {
            if (guestMode) {
              receipt = {
                ...receipt,
                schemaVersion: 2,
                verification: unverifiedLocalDocumentEdit(),
              };
            } else if (
              normalizedAfter &&
              normalizedAfter.ok &&
              saved.contentVersion !== null
            ) {
              let readBackPage: PageItem | null = null;
              let readBackError: unknown;
              try {
                readBackPage = await notebookSDK.getPage(pageId);
              } catch (error) {
                readBackError = error;
              }
              receipt = {
                ...receipt,
                schemaVersion: 2,
                verification: verifyDocumentEditPersistence({
                  pageId,
                  expectedContent: normalizedAfter.document,
                  sourceContentVersion,
                  savedContentVersion: saved.contentVersion,
                  readBackPage,
                  readBackError,
                }),
              };
            }
          }
          notifyDocumentEditApplied({
            proposalId: detail.proposalId,
            targetPageId: detail.targetPageId,
            targetWindowId: detail.targetWindowId,
            ok: Boolean(commandResult.ok && saved),
            message: !commandResult.ok
              ? documentCommandFailureMessage(t, commandResult.rejectionReason)
              : !saved
                ? readSaveFailureMessage()
                : undefined,
            receipt,
          });
        } catch {
          // Defense-in-depth: executeDocumentCommandWithResult already clamps
          // ranges and rolls back on throw, but if anything here throws
          // unexpectedly we still must resolve the card. Restore the editor to
          // its pre-apply content and report a terminal failure so it can never
          // hang on "applying".
          try {
            restoreBeforeContent();
          } catch {
            // Best-effort rollback; failure to restore must not block the notify.
          }
          notifyDocumentEditApplied({
            proposalId: detail.proposalId,
            targetPageId: detail.targetPageId,
            targetWindowId: detail.targetWindowId,
            ok: false,
            message: documentCommandFailureMessage(t, "invalid_command"),
          });
        }
      })();
    }
    window.addEventListener(APPLY_DOCUMENT_EDIT_COMMAND_EVENT, handler);
    return () =>
      window.removeEventListener(APPLY_DOCUMENT_EDIT_COMMAND_EVENT, handler);
  }, [
    editor,
    autosave,
    buildSaveDraft,
    flushPendingContentSerialize,
    guestMode,
    normalizeDocumentForSave,
    pageId,
    rejectInvalidDocumentContent,
    readSaveFailureMessage,
    restoreCommentThreads,
    saveContent,
    t,
    windowId,
  ]);

  const waitForImeBeforeSave = useCallback(
    (
      activeEditor: Editor,
      view: EditorView,
      ownerPageId: string,
    ): Promise<boolean> => {
      if (importPageIdRef.current !== ownerPageId) {
        return Promise.resolve(false);
      }
      if (!isImeCompositionActive(view)) return Promise.resolve(true);
      const existing = pendingImeSaveWaitRef.current;
      if (existing?.view === view && existing.pageId === ownerPageId) {
        return existing.promise;
      }
      existing?.cancel();

      let resolveWait!: (settled: boolean) => void;
      const promise = new Promise<boolean>((resolve) => {
        resolveWait = resolve;
      });
      let finished = false;
      let stopWaiting: () => void = () => undefined;
      let destructionPoll: number | null = null;
      const finish = (settled: boolean) => {
        if (finished) return;
        finished = true;
        stopWaiting();
        if (destructionPoll !== null) {
          window.clearTimeout(destructionPoll);
          destructionPoll = null;
        }
        if (pendingImeSaveWaitRef.current?.promise === promise) {
          pendingImeSaveWaitRef.current = null;
        }
        resolveWait(settled);
      };
      const pending = {
        view,
        pageId: ownerPageId,
        promise,
        cancel: () => finish(false),
      };
      pendingImeSaveWaitRef.current = pending;
      stopWaiting = onImeCompositionSettled(view, () => {
        // The ordinary onUpdate listener normally drains this queue first.
        // Settle it here as well so explicit save has one self-contained
        // composition boundary even if listener registration order changes.
        settleImeSerializeQueueFor({
          pageId: ownerPageId,
          editor: activeEditor,
          view,
        });
        finish(!view.isDestroyed && importPageIdRef.current === ownerPageId);
      });
      const pollForDestroyedView = () => {
        if (finished) return;
        if (view.isDestroyed) {
          finish(false);
          return;
        }
        destructionPoll = window.setTimeout(pollForDestroyedView, 50);
      };
      destructionPoll = window.setTimeout(pollForDestroyedView, 50);
      return promise;
    },
    [settleImeSerializeQueueFor],
  );

  const saveSettledCurrentDocument = useCallback(async () => {
    const ownerPageId = pageId;
    if (!isUsableEditor(editor) || importPageIdRef.current !== ownerPageId) {
      return false;
    }
    const activeEditor = editor;
    const view = (activeEditor as Editor & { view?: EditorView }).view;
    if (view && isImeCompositionActive(view)) {
      // Do not expose a transient "Saved" state while Safari still owns the
      // pre-edit DOM. The window-close guard reads this same status.
      setTrackedLocalSaveStatus("unsaved");
      const settled = await waitForImeBeforeSave(
        activeEditor,
        view,
        ownerPageId,
      );
      if (
        !settled ||
        !isUsableEditor(activeEditor) ||
        (activeEditor as Editor & { view?: EditorView }).view !== view ||
        importPageIdRef.current !== ownerPageId
      ) {
        if (importPageIdRef.current === ownerPageId) {
          reportEditorSaveRefusal("editor.explicit_save", "editor_ime_unsettled",
            !settled ? "composition_not_settled" : "editor_replaced", { imeComposing: true });
        }
        return false;
      }
    }

    // Drain the composition callback before the large-document timer, then
    // serialize the LIVE editor state. latestContentRef may still describe the
    // pre-composition document, so it is never an explicit-save authority.
    if (view) {
      settleImeSerializeQueueFor({
        pageId: ownerPageId,
        editor: activeEditor,
        view,
      });
    } else {
      clearImeSerializeQueue();
    }
    if (importPageIdRef.current !== ownerPageId) return false;
    flushPendingContentSerialize();
    if (importPageIdRef.current !== ownerPageId) return false;
    if (canonicalReady && !prepareCanonicalDocumentExplicitSave(activeEditor)) {
      reportEditorSaveRefusal("editor.canonical_prepare", "editor_canonical_prepare_refused",
        canonicalDocumentExplicitSaveRefusal(activeEditor),
        { imeComposing: view ? isImeCompositionActive(view) : null });
      setTrackedLocalSaveStatus("unsaved");
      const retry = settledSaveRetryRef.current;
      if (retry.timer === null) {
        retry.tries += 1;
        retry.timer = window.setTimeout(() => {
          retry.timer = null;
          if (importPageIdRef.current === ownerPageId) void saveSettledCurrentDocumentRef.current?.();
        }, Math.min(30_000, 1_000 * 2 ** Math.min(retry.tries - 1, 5)));
      }
      return false;
    }
    settledSaveRetryRef.current.tries = 0;
    saveCallerRef.current = "settle";
    try {
      return await saveContent(activeEditor.getJSON() as Record<string, unknown>);
    } finally {
      saveCallerRef.current = null;
    }
  }, [
    editor,
    canonicalReady,
    clearImeSerializeQueue,
    flushPendingContentSerialize,
    pageId,
    reportEditorSaveRefusal,
    saveContent,
    settleImeSerializeQueueFor,
    setTrackedLocalSaveStatus,
    waitForImeBeforeSave,
  ]);

  // Manual save — button, command bus and Cmd/Ctrl+S all share this boundary.
  const saveNow = useCallback(async () => {
    if (previewMode) return;
    // An equation still being edited is saved as it shows (WUA 165: its
    // source edited to 1+2, Save said Saved and the page reopened at 1+1).
    // Only an explicit Save commits it; an automatic save never closes the
    // editor under the person typing.
    const view = isUsableEditor(editor) ? (editor as Editor & { view?: EditorView }).view : undefined;
    if (view?.dom && commitOpenVisualMathEditors(view.dom) > 0) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
    await saveSettledCurrentDocument();
  }, [editor, previewMode, saveSettledCurrentDocument]);
  useLayoutEffect(() => {
    // Only where automatic saves go: never a guest's page, a preview, or a
    // page whose AutoSave is off (its user's own Save measures the records).
    saveSettledCurrentDocumentRef.current = guestMode ? null : saveSettledCurrentDocument;
  }, [guestMode, saveSettledCurrentDocument]);
  /**
   * The settle save (the pagination records the saves made while the pen
   * wrote left out) in tasks of its own. In one task, measuring the page,
   * digesting its recipe, flattening and stamping the document, checking it
   * against the room and storing its recovery copy was 400 ms of the
   * editor's thread on an inked page, a moment after the pen lifted.
   *
   * It is an automatic save of the editor's document as it stands, made the
   * way every autosave is (the room already holds that document: the saves
   * under the pen sent it), so it does not take an explicit Save's
   * preparation of the room. It is sent only as the very document it
   * measured: "retry" when the editor moved on meanwhile (a stroke, a page
   * rebalance) or a serialization is pending, and the caller looks again.
   */
  const saveSettledPaginationInSteps = useCallback(async function saveSettledPaginationInSteps(): Promise<boolean | "retry"> {
    if (previewMode || guestMode) return false;
    const ownerPageId = pageId;
    if (!isUsableEditor(editor) || importPageIdRef.current !== ownerPageId) return false;
    const activeEditor = editor;
    const view = (activeEditor as Editor & { view?: EditorView }).view;
    const moved = (document: unknown) => !view || isImeCompositionActive(view) ||
      pendingSerializeRef.current !== null || serializeTimerRef.current !== null ||
      activeEditor.state?.doc !== document;
    const document = activeEditor.state?.doc;
    if (!document || moved(document)) return "retry";
    const normalized = await normalizeDocumentForSaveInSteps(runtimeDocumentJson(document));
    await yieldBetweenSaveSteps();
    if (importPageIdRef.current !== ownerPageId || !isUsableEditor(activeEditor)) return false;
    if (moved(document)) return "retry";
    // A fresh serialization of this save (its root is this call's own):
    // the save takes it as its body without copying it.
    if (normalized.ok) markDocumentSaveBody(normalized.document as Record<string, unknown>);
    return Boolean(await saveContent(
      normalized.ok ? normalized.document as Record<string, unknown> : {}, undefined, normalized));
  }, [editor, guestMode, normalizeDocumentForSaveInSteps, pageId, previewMode, saveContent]);
  useLayoutEffect(() => {
    saveSettledPaginationRef.current = guestMode ? null : saveSettledPaginationInSteps;
  }, [guestMode, saveSettledPaginationInSteps]);
  useEffect(() => {
    const stop = () => {
      if (paginationSettleTimerRef.current !== null) window.clearTimeout(paginationSettleTimerRef.current);
      paginationSettleTimerRef.current = null;
    };
    // The pagination records a save made while the pen wrote left out come
    // with one save of the live document, once the pen has been away long
    // enough (inkLayoutSettlesInMs) and nothing else is on its way.
    const look = () => {
      paginationSettleTimerRef.current = null;
      if (!paginationDeferredRef.current) return;
      const wait = inkLayoutSettlesInMs();
      if (wait > 0 || pendingSerializeRef.current !== null || serializeTimerRef.current !== null ||
          document.visibilityState === "hidden") {
        paginationSettleTimerRef.current = window.setTimeout(look, Math.max(wait, 1_000));
        return;
      }
      paginationDeferredRef.current = false;
      if (!officeAutosaveEnabled(DOCS_AUTOSAVE_SCOPE)) return;
      const inSteps = saveSettledPaginationRef.current;
      if (!inSteps || paginationSettleRetriesRef.current >= PAGINATION_SETTLE_STEP_RETRIES) {
        // The document kept moving under the save in steps: once in one go.
        paginationSettleRetriesRef.current = 0;
        void saveSettledCurrentDocumentRef.current?.();
        return;
      }
      void inSteps().then((result) => {
        if (result !== "retry") {
          paginationSettleRetriesRef.current = 0;
          return;
        }
        paginationSettleRetriesRef.current += 1;
        // Not sent: the records are still owed. A newer deferred save
        // may have scheduled the look already; otherwise this does.
        paginationDeferredRef.current = true;
        if (paginationSettleTimerRef.current === null) {
          paginationSettleTimerRef.current = window.setTimeout(look, Math.max(inkLayoutSettlesInMs(), 1_000));
        }
      }, () => { paginationSettleRetriesRef.current = 0; });
    };
    schedulePaginationSettleRef.current = () => {
      stop();
      paginationSettleTimerRef.current = window.setTimeout(look, Math.max(inkLayoutSettlesInMs(), 1_000));
    };
    return () => {
      stop();
      paginationDeferredRef.current = false;
      schedulePaginationSettleRef.current = () => {};
    };
  }, [pageId]);
  const workbookSaveStatusRef = useRef(saveStatus);
  workbookSaveStatusRef.current = saveStatus;
  const workbookPersistence = useMemo(()=>({
    // An explicit save the page refuses for now (the room still reconciling,
    // the write gate blinking) is retried by the page itself, and the main
    // Save says nothing meanwhile. A chart's data window saving through the
    // page waits for that outcome: it said "Save failed" while the retry
    // saved its new value (WUA 251). Failed only in conflict, or unsaved
    // after 30 s.
    save:async()=>{
      if(await saveSettledCurrentDocument())return true;
      const deadline=Date.now()+30_000;
      while(Date.now()<deadline){
        await new Promise((resolve)=>window.setTimeout(resolve,250));
        if(workbookSaveStatusRef.current==="saved")return true;
        if(workbookSaveStatusRef.current==="conflict")return false;
      }
      return false;
    },
    status:saveStatus,
    available:!guestMode,
  }),[saveSettledCurrentDocument,saveStatus,guestMode]);

  // The version the server already holds for exactly the live document, or
  // null. Strict, and every doubt answers null (the caller then saves): the
  // editor owns this hydrated page; no composition, deferred serialization,
  // header/footer draft or import is pending; the local generation is clean
  // with nothing queued; the acknowledged baseline is this page's and carries
  // the title a save would send; the autosave hook has nothing queued, in
  // flight or refused and its collaboration model reports saved, at that same
  // version; and last, the live document normalized as saveContent normalizes
  // it equals the acknowledged content, or (a canonical page opened from the
  // server, whose stored form drops the editor's null defaults) equals the
  // server's own receipt in the causal model's semantic projection with the
  // same pagination records. Those comparisons are structural on purpose: a
  // list touched for the first time back-fills block ids without an authored
  // (dirtying) transaction, and the saved pagination records follow measured
  // layout, so a document-identity shortcut could vouch for a body the server
  // does not hold.
  const readSettledDocumentContentVersion = useCallback((
    compare: "document" | "blocks",
    boundBlockIds?: readonly string[],
  ): number | null => {
    if (guestMode || !isUsableEditor(editor) || !readSettledSave) return null;
    const activeEditor = editor;
    const view = (activeEditor as Editor & { view?: EditorView }).view;
    return settledDocumentContentVersion({
      pageId,
      editorOwnsPage: Boolean(view) && importPageIdRef.current === pageId &&
        editorHydratedRef.current,
      localWorkPending: !view || isImeCompositionActive(view) ||
        imeSerializeOwnerRef.current !== null || pendingImeSaveWaitRef.current !== null ||
        pendingSerializeRef.current !== null || serializeTimerRef.current !== null ||
        bandDraftFlushRef.current !== null || activeImportRef.current !== null,
      generation: localSaveGenerationRef.current,
      baseline: acknowledgedDocumentBaselineRef.current,
      title: titleRef.current,
      settled: readSettledSave(),
      readLiveContent: () => {
        const normalized = normalizeDocumentForSave(
          activeEditor.getJSON() as Record<string, unknown>,
        );
        return normalized.ok ? normalized.document : null;
      },
      semanticProjection: canonicalReady ? documentCausalSemanticContent : undefined,
      compare,
      boundBlockIds,
    });
  }, [canonicalReady, editor, guestMode, normalizeDocumentForSave, pageId, readSettledSave]);

  // The settled version for `compare` (see settledDocumentContentVersion), or
  // the version of an explicit save. An already-saved page needs no second
  // full-document PATCH: its acknowledged version is what the server reads.
  const saveCurrentDraftAtVersion = useCallback(
    async (compare: "document" | "blocks", boundBlockIds?: readonly string[]): Promise<number> => {
      const settledVersion = readSettledDocumentContentVersion(compare, boundBlockIds);
      if (settledVersion !== null) return settledVersion;
      // The canonical renderer reads the persisted page. Force the deferred
      // large-document serializer and autosave queue through the same CAS save
      // boundary before asking the server to render, otherwise the download can
      // be a valid export of a stale revision.
      const saved = await saveSettledCurrentDocument();
      if (!saved || saved.contentVersion === null) {
        throw new Error(t("pages.saveFailed"));
      }
      return saved.contentVersion;
    },
    [readSettledDocumentContentVersion, saveSettledCurrentDocument, t],
  );

  const saveCurrentDraftForVersionWrite =
    useCallback(async (): Promise<number> => saveCurrentDraftAtVersion("document"),
      [saveCurrentDraftAtVersion]);

  // An export renders the saved page. An editor with nothing of its own to
  // save (no edit, no queued draft: settledDocumentContentVersion refuses
  // either) whose blocks are the saved ones exports that version, whatever
  // root state it filled in by itself on opening -- the pagination this
  // device measured, schema defaults. Such state made the whole-document
  // check send a full save first, and an iPad whose Safari measured the pages
  // otherwise than the computer that saved them had that save refused
  // (editor_does_not_mirror_original): its export never started, though the
  
  const saveCurrentDraftForServerExport =
    useCallback(async (): Promise<number> => {
      const settledBlocks = readSettledDocumentContentVersion("document") ?? readSettledDocumentContentVersion("blocks");
      if (settledBlocks !== null) return settledBlocks;
      saveCallerRef.current = "export";
      try { return await saveCurrentDraftForVersionWrite(); } finally { saveCallerRef.current = null; }
    }, [readSettledDocumentContentVersion, saveCurrentDraftForVersionWrite]);

  // The Copilot binds selected blocks at a saved version and nothing else, so
  // the root state an opened editor fills in by itself (schema defaults, the
  // pagination it measured, ids it gave the items of lists the press did not
  // circle) does not send a whole-document save on a press.
  const saveCurrentDraftForCopilotSource =
    useCallback(async (boundBlockIds?: readonly string[]): Promise<number> => {
      saveCallerRef.current = "copilot";
      try { return await saveCurrentDraftAtVersion("blocks", boundBlockIds); } finally { saveCallerRef.current = null; }
    }, [saveCurrentDraftAtVersion]);

  // The circled blocks as the server last acknowledged them, by id, with that
  // version: the Copilot compares them with the live ones (their author
  // content) and asks without a save when they are the same, whatever else
  // the page holds unsaved (docs/copilot/region-bound-ask.md).
  const readCopilotRegionBaseline = useCallback(
    (blockIds: readonly string[]): { version: number; nodes: unknown[] } | null => {
      const baseline = acknowledgedDocumentBaselineRef.current;
      if (
        guestMode || !baseline || baseline.pageId !== pageId ||
        !Number.isSafeInteger(baseline.contentVersion) || baseline.contentVersion < 1
      ) return null;
      const found = new Map<string, unknown[]>();
      const visit = (nodes: unknown) => {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          const record = node as { type?: unknown; attrs?: { block_id?: unknown }; content?: unknown };
          // Storage is flat; a page wrapper is looked through all the same.
          if (record.type === "pageBlock") { visit(record.content); continue; }
          const id = record.attrs?.block_id;
          if (typeof id === "string") found.set(id, [...(found.get(id) ?? []), node]);
        }
      };
      visit((baseline.content as { content?: unknown }).content);
      const nodes: unknown[] = [];
      for (const id of blockIds) {
        const matches = found.get(id);
        if (!matches || matches.length !== 1) return null;
        nodes.push(matches[0]);
      }
      return { version: baseline.contentVersion, nodes };
    },
    [guestMode, pageId],
  );

  useEffect(() => commandBus.register("save", saveNow), [commandBus, saveNow]);
  // The website-update notice's Refresh (and any reload the app asks for)
  // saves the page first, as its "unsaved changes are kept" says (WUA 220:
  // the Docs editor registered no handover, so the reload left without its
  
  const saveNowForHandoverRef = useRef(saveNow);
  saveNowForHandoverRef.current = saveNow;
  useEffect(
    () => (guestMode || previewMode ? undefined : registerEditorDraftHandover(() => saveNowForHandoverRef.current())),
    [guestMode, previewMode],
  );

  const importOperationIsCurrent = useCallback(
    (operation: PageImportOperation): boolean =>
      activeImportRef.current === operation &&
      activeImportRef.current?.generation === operation.generation &&
      importPageIdRef.current === operation.pageId,
    [],
  );

  const importOperationMayWrite = useCallback(
    (operation: PageImportOperation): boolean =>
      documentImportMayContinue({
        operationCurrent:
          activeImportRef.current === operation &&
          activeImportRef.current?.generation === operation.generation,
        pageMatches: importPageIdRef.current === operation.pageId,
        signalAborted: operation.controller.signal.aborted,
        liveWriteAllowed: shellWriteAllowedRef.current,
      }),
    [],
  );

  const assertImportOperationOwned = useCallback(
    (operation: PageImportOperation): void => {
      if (!importOperationMayWrite(operation)) {
        throw new StalePageImportError();
      }
    },
    [importOperationMayWrite],
  );

  const assertShellWriteAllowed = useCallback((): void => {
    if (!shellWriteAllowedRef.current) throw new StalePageImportError();
  }, []);

  useEffect(() => {
    if (!shellWriteAllowed) endFileDrag();
    retireDocumentImportOnWriteRevoked(
      shellWriteAllowed,
      activeImportRef.current,
    );
  }, [endFileDrag, shellWriteAllowed]);

  const importNodes = useCallback(
    async (
      nodes: Array<Record<string, unknown>>,
      nextTitle?: string,
      assertOwned: () => void = () => undefined,
      onPersisted?: () => void,
      transactionToken?: DocumentShellImportAuthorityToken,
    ): Promise<void> => {
      assertOwned();
      if (!editor || nodes.length === 0) {
        throw new Error(t("editor.importFailed"));
      }
      suppressEditorUpdateRef.current = true;
      let inserted = false;
      try {
        let chain = editor.chain();
        if (transactionToken) {
          chain = chain.command(({ tr }) => {
            authorizeDocumentShellImportMutation(tr, transactionToken);
            return true;
          });
        }
        inserted = chain.focus().insertContent(nodes).run();
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      if (!inserted) {
        throw new Error(t("editor.importFailed"));
      }
      assertOwned();
      const content = editor.getJSON() as Record<string, unknown>;
      const normalized = normalizeDocumentForSave(content);
      if (!normalized.ok) {
        throw new Error(t("editor.importFailed"));
      }
      latestContentRef.current = normalized.document;
      const saved = await saveContent(normalized.document, nextTitle);
      if (!saved) {
        throw new Error(t("editor.importFailed"));
      }
      // Saving is the persistent commit point. Mark staged attachments as
      // committed before the post-await ownership check: a page switch during
      // a successful PATCH must not delete attachments that the saved body now
      // references.
      onPersisted?.();
      assertOwned();
      if (nextTitle !== undefined) {
        setTrackedTitle(nextTitle);
        onTitleChange?.(nextTitle);
      }
      onPlainTextChange?.(editor.getText());
    },
    [
      editor,
      normalizeDocumentForSave,
      onPlainTextChange,
      onTitleChange,
      saveContent,
      setTrackedTitle,
      t,
    ],
  );

  const replaceImportedDocument = useCallback(
    async (
      plan: DocxRootImportPlan,
      nextTitle?: string,
      assertOwned: () => void = () => undefined,
      transactionToken?: DocumentShellImportAuthorityToken,
    ): Promise<void> => {
      assertOwned();
      if (!editor) {
        throw new Error(t("editor.importFailed"));
      }
      const normalized = normalizeDocumentForSave(plan.document);
      if (!normalized.ok) {
        throw new Error(t("editor.importFailed"));
      }
      const flatDocument = normalized.document;
      const runtimeDocument = hydrateStoredPageBlocks(flatDocument);
      suppressEditorUpdateRef.current = true;
      let replaced = false;
      try {
        replaced = transactionToken
          ? executeAuthorizedContentReplacement(
              editor,
              runtimeDocument,
              transactionToken,
            )
          : false;
        if (replaced) restoreCommentThreads(flatDocument);
      } finally {
        suppressEditorUpdateRef.current = false;
      }
      if (!replaced) {
        throw new Error(t("editor.importFailed"));
      }
      assertOwned();
      latestContentRef.current = flatDocument;
      const saved = await saveContent(flatDocument, nextTitle);
      if (!saved) {
        throw new Error(t("editor.importFailed"));
      }
      assertOwned();
      if (nextTitle !== undefined) {
        setTrackedTitle(nextTitle);
        onTitleChange?.(nextTitle);
      }
      onPlainTextChange?.(editor.getText());
    },
    [
      editor,
      normalizeDocumentForSave,
      onPlainTextChange,
      onTitleChange,
      restoreCommentThreads,
      saveContent,
      setTrackedTitle,
      t,
    ],
  );

  const importPlainText = useCallback(
    async (text: string): Promise<void> => {
      let nodes: Array<Record<string, unknown>>;
      try {
        nodes = plainTextToEditorDocumentNodes(text);
      } catch (error) {
        if (error instanceof PlainTextDocumentImportError) {
          throw new Error(t("editor.importUnsupported"));
        }
        throw error;
      }
      await importNodes(nodes, undefined, assertShellWriteAllowed);
    },
    [assertShellWriteAllowed, importNodes, t],
  );

  const insertLocalImageFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (!editor || editor.isDestroyed || editor.isEditable === false || files.length === 0) return;
      const { localImageNodes } = await import("@mrnote/core/host/local-files.ts");
      const nodes = await localImageNodes(files);
      if (nodes.length > 0 && !editor.isDestroyed) editor.chain().focus().insertContent(nodes).run();
    },
    [editor],
  );
  const insertLocalImageFilesRef = useRef(insertLocalImageFiles);
  insertLocalImageFilesRef.current = insertLocalImageFiles;
  const importFiles = useCallback(
    async (files: File[]): Promise<void> => {
      if (guestMode && files.length > 0 && files.every(isInlineImageImportFile)) return insertLocalImageFilesRef.current(files);
      // React state is observability, not a mutex: paste/drop/picker callbacks
      // from the same render can all see the same stale `importing=false`.
      if (
        !shellEventMayStart() ||
        !editor ||
        editor.isEditable === false ||
        files.length === 0 ||
        activeImportRef.current
      )
        return;
      const operation: PageImportOperation = {
        pageId,
        generation: ++importGenerationRef.current,
        controller: new AbortController(),
        transactionToken: createDocumentShellImportAuthorityToken(),
        documentJson: JSON.parse(JSON.stringify(editor.getJSON())) as Record<
          string,
          unknown
        >,
        selection: {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        },
        live: trackInsertionRange(editor, {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        }),
      };
      activeImportRef.current = operation;
      const releaseTransactionAuthority = registerDocumentShellImportAuthority(
        editor,
        operation.transactionToken,
        () => importOperationMayWrite(operation),
      );
      setImporting(true);
      setImportError(null);
      let editorSnapshot: Record<string, unknown> | null = null;
      let editorSnapshotNormalized: Record<string, unknown> | null = null;
      let titleSnapshot: string | null = null;
      const stagedImageAttachmentIds: string[] = [];
      let preserveCommittedImageState = false;
      // Set once loaded: the catch below asks it about its own errors.
      let htmlDocumentImport: Awaited<ReturnType<typeof loadHtmlDocumentImport>> | null = null;
      try {
        const [pageFileImport, htmlImport] = await Promise.all([
          loadPageFileImport(),
          loadHtmlDocumentImport(),
        ]);
        htmlDocumentImport = htmlImport;
        assertImportOperationOwned(operation);
        // Finish every deterministic parse/size/encoding check for the batch
        // before the first page or attachment write. Authenticated editors may
        // still preserve unknown formats as opaque attachments; guest editors
        // are limited to formats the browser can materialize without storage.
        await pageFileImport.preflightPageImportFiles(files, {
          allowUnsupported: !guestMode,
          guestInlineOnly: guestMode,
          signal: operation.controller.signal,
          // Only attachments of at most one request's size travel in the
          // append batch; pictures and larger files are uploaded on their
          // own (in parts past that size), and Office/PDF/HTML files become
          // pages of their own.
          ...(guestMode
            ? {}
            : {
                travelsInBatch: (file: File) =>
                  !isInlineImageImportFile(file) &&
                  !(
                    notebookIdRef.current &&
                    (canCompileFileAsEditableDocument(file) || canImportFileAsHtml(file))
                  ) &&
                  file.size <= SINGLE_REQUEST_UPLOAD_MAX_BYTES,
              }),
        });
        assertImportOperationOwned(operation);

        const inlineImageFiles = files.filter(isInlineImageImportFile);
        if (inlineImageFiles.length > 0) {
          if (guestMode || inlineImageFiles.length !== files.length) {
            throw new Error(t("editor.importUnsupported"));
          }

          const uploadedImages: UploadedInlineImage[] = [];
          for (const file of inlineImageFiles) {
            assertImportOperationOwned(operation);
            const uploaded: UploadedInlineImage & { attachment_type?: string } =
              await uploadPageAttachment(operation.pageId, file, {
                signal: operation.controller.signal,
                title: file.name,
                notebookId: notebookIdRef.current,
              });
            const attachmentId = String(uploaded.attachment_id || "").trim();
            if (attachmentId) stagedImageAttachmentIds.push(attachmentId);
            if (
              !attachmentId ||
              uploaded.attachment_type !== "image" ||
              !INLINE_IMAGE_IMPORT_MIME_TYPES.has(
                String(uploaded.mime_type || "").toLowerCase(),
              )
            ) {
              throw new Error(t("editor.importUnsupported"));
            }
            uploadedImages.push(uploaded);
          }
          assertImportOperationOwned(operation);

          // The picker/clipboard/drop entry captured the insertion document and
          // range synchronously. Never project that stale range onto a document
          // edited while the browser was reading/uploading the files: the
          // range followed the edits (a co-author's words before it move it
          // on, WUA 232), and only a range the edits took away is refused.
          const insertionRange =
            JSON.stringify(editor.getJSON()) === JSON.stringify(operation.documentJson)
              ? operation.selection
              : operation.live.current();
          if (!insertionRange) {
            throw new StalePageImportError();
          }

          editorSnapshot = JSON.parse(
            JSON.stringify(editor.getJSON()),
          ) as Record<string, unknown>;
          const normalizedSnapshot = normalizeDocumentForSave(editorSnapshot);
          if (!normalizedSnapshot.ok) {
            throw new Error(t("editor.importFailed"));
          }
          editorSnapshotNormalized = normalizedSnapshot.document;
          titleSnapshot = titleRef.current;

          suppressEditorUpdateRef.current = true;
          let inserted = false;
          try {
            inserted = editor
              .chain()
              .command(({ tr }) => {
                authorizeDocumentShellImportMutation(
                  tr,
                  operation.transactionToken,
                );
                return true;
              })
              .focus()
              .setTextSelection(insertionRange)
              .insertContent(uploadedImages.map(uploadedImageNode))
              .run();
          } finally {
            suppressEditorUpdateRef.current = false;
          }
          if (!inserted) {
            throw new Error(t("editor.importFailed"));
          }

          const normalizedInserted = normalizeDocumentForSave(
            editor.getJSON() as Record<string, unknown>,
          );
          if (!normalizedInserted.ok) {
            throw new Error(t("editor.importFailed"));
          }
          latestContentRef.current = normalizedInserted.document;
          // The pictures are in the document now, as a picture Word inserts
          // is: a save that does not go through (the page's save state says
          // so, and its saves retry) never takes them back out. It rolled the
          // insertion back and said 导入失败 for a supported PNG whenever the
          // page's save was failing (live Word audit WUA 227).
          preserveCommittedImageState = true;
          // The insertion ran with editor updates suppressed: nothing marked
          // the page edited, and a save that came back with nothing read as
          // "nothing of the editor's own to save" (Saved) with the pictures
          // never stored. It is an edit, kept unsaved until a save takes it.
          beginLocalSaveMutation();
          const saved = await saveContent(normalizedInserted.document);
          if (!saved || !validContentVersion(saved.contentVersion)) {
            assertImportOperationOwned(operation);
            window.requestAnimationFrame(() => editor.commands.focus());
            return;
          }
          assertImportOperationOwned(operation);

          const notebookId = notebookIdRef.current;
          if (notebookId) {
            dispatchNotebookPagesChanged(notebookId, operation.pageId);
            dispatchNotebookStorageChanged();
            dispatchNotebooksChanged();
          }
          let hydratedPage: PageItem | null;
          try {
            hydratedPage = await reloadPage();
          } catch {
            throw new Error(t("editor.importCommittedRefreshFailed"));
          }
          assertImportOperationOwned(operation);
          if (
            !hydrationCoversCommittedPage(
              hydratedPage,
              operation.pageId,
              saved.contentVersion,
            )
          ) {
            throw new Error(t("editor.importCommittedRefreshFailed"));
          }
          window.requestAnimationFrame(() => editor.commands.focus());
          return;
        }

        // Phase 1 prepares and budgets every current-page projection before
        // phase 2 performs the first durable write. This prevents a late text
        // expansion failure from stranding attachments uploaded for an earlier
        // file in the same picker event.
        const prepared: PreparedPageFileImport[] = [];
        let projectionSize: PageImportProjectionSize = {
          nodes: 0,
          textChars: 0,
        };
        for (const file of files) {
          assertImportOperationOwned(operation);
          let textNodes: Array<Record<string, unknown>> = [];
          let documentRoot: DocxRootImportSource | undefined;
          let importedTitle: string | undefined;
          let shouldUploadAttachment = !guestMode;
          const htmlFile = canImportFileAsHtml(file);
          const notebookId = notebookIdRef.current;
          if (htmlFile && !guestMode && notebookId) {
            // Standalone HTML is a complete document format. Creating a page
            // through the same atomic importer used by the sidebar preserves
            // the embedded MRNote root/title instead of flattening it into the
            // currently focused document.
            prepared.push({
              kind: "separate_page",
              file,
              notebookId,
            });
            continue;
          }
          if (canCompileFileAsEditableDocument(file)) {
            if (!guestMode && notebookId) {
              prepared.push({
                kind: "separate_page",
                file,
                notebookId,
              });
              continue;
            }
            if (isComplexImportTooLarge(file)) {
              throw new Error(t("editor.importTooLarge"));
            }
            shouldUploadAttachment = false;
            let compiled;
            try {
              // Word/Excel/PowerPoint are read on the server (the browser
              // holds no Office reader); a PDF's text by pdf.js. Cancelling
              // the import aborts the request.
              compiled = await pageFileImport.getPreparedEditableDocument(file, {
                signal: operation.controller.signal,
              });
              assertImportOperationOwned(operation);
            } catch (error) {
              if (error instanceof StalePageImportError) throw error;
              // An abort means a newer import or a page switch owns the
              // editor now; that owner reports, not this one.
              assertImportOperationOwned(operation);
              if (isOfficeImportConnectionRequired(error)) {
                throw new Error(t("document.capability.onlineRequired"));
              }
              if (isLossyImportRejection(error)) {
                throw new LosslessImportRequiredError(
                  t("editor.importLossy"),
                  error,
                );
              }
              throw new Error(t("editor.importFailed"));
            }
            if (!compiled?.nodes.length) {
              throw new Error(t("editor.importFailed"));
            }
            if (isDocxRootImportFile(file)) {
              documentRoot = {
                nodes: compiled.nodes,
                docAttrs: compiled.docAttrs,
                sourceName: file.name,
              };
            }
            textNodes = [
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: titleFromFilename(file.name) }],
              },
              ...compiled.nodes,
            ];
          } else if (canImportFileAsText(file)) {
            if (file.size > TEXT_PAGE_IMPORT_MAX_BYTES) {
              throw new Error(t("editor.importTooLarge"));
            }
            const text = await readFileText(file);
            assertImportOperationOwned(operation);
            const isMarkdown = canImportFileAsMarkdown(file);
            const isHtml = canImportFileAsHtml(file);
            if (
              !isMarkdown &&
              !isHtml &&
              text.length >
                PAGE_IMPORT_PROJECTED_MAX_TEXT_CHARS - projectionSize.textChars
            ) {
              throw new PageImportProjectionBudgetError();
            }
            let parsedTextNodes: Array<Record<string, unknown>>;
            if (isHtml) {
              const imported = htmlImport.importHtmlDocument(text);
              parsedTextNodes = imported.content.content;
              importedTitle =
                imported.embeddedTitle?.trim() || titleFromFilename(file.name);
              documentRoot = {
                nodes: parsedTextNodes,
                docAttrs: imported.content.attrs,
                sourceName: file.name,
              };
              // HTML is materialized as editable content; persisting a second
              // opaque attachment would create two competing source truths.
              shouldUploadAttachment = false;
            } else {
              parsedTextNodes = isMarkdown
                ? markdownToDocumentNodes(text)
                : plainTextToEditorDocumentNodes(text);
            }
            if (parsedTextNodes.length > 0) {
              textNodes = [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [
                    {
                      type: "text",
                      text: importedTitle || titleFromFilename(file.name),
                    },
                  ],
                },
                ...parsedTextNodes,
              ];
            }
          } else if (guestMode) {
            // Guests cannot persist an arbitrary binary as an attachment.
            // Previously this branch appended no nodes and `importNodes([])`
            // returned silently, making the picker look broken.
            throw new Error(t("editor.importUnsupported"));
          }
          projectionSize = addProjectedImportNodes(projectionSize, [
            ...(shouldUploadAttachment
              ? [{ type: "file" } as Record<string, unknown>]
              : []),
            ...textNodes,
          ]);
          prepared.push({
            kind: "inline",
            file,
            shouldUploadAttachment,
            textNodes,
            ...(importedTitle ? { importedTitle } : {}),
            ...(documentRoot ? { documentRoot } : {}),
          });
        }

        // A server-native resource import is intentionally kept on its existing
        // custody path. Until that path participates in ImportBatch, reject a
        // mixed/multi-native picker event before its first durable write; doing
        // several independent resource uploads would recreate the partial-batch
        // bug this transaction is meant to eliminate.
        const separatePageImports = prepared.filter(
          (
            item,
          ): item is Extract<
            PreparedPageFileImport,
            { kind: "separate_page" }
          > => item.kind === "separate_page",
        );
        if (separatePageImports.length > 0 && prepared.length !== 1) {
          throw new Error(t("editor.importNativeBatchUnsupported"));
        }

        let guestDocumentPlan: DocxRootImportPlan | null = null;
        let replaceEmptyGuestDocument = false;
        if (
          guestMode &&
          prepared.some(
            (item) => item.kind === "inline" && item.documentRoot !== undefined,
          )
        ) {
          const currentDocument = editor.getJSON() as Record<string, unknown>;
          const currentDocumentIsEmpty = documentJsonIsStructurallyEmpty(
            flattenPageBlocks(currentDocument),
          );
          const inlineImports = prepared.filter(
            (
              item,
            ): item is Extract<PreparedPageFileImport, { kind: "inline" }> =>
              item.kind === "inline",
          );
          replaceEmptyGuestDocument =
            currentDocumentIsEmpty &&
            inlineImports.length === 1 &&
            inlineImports[0]?.documentRoot !== undefined;
          const { DocxRootImportPlanningError, planDocxRootImports } =
            await import("../../../lib/document-import/docxRootImportPlanner");
          assertImportOperationOwned(operation);
          try {
            guestDocumentPlan = planDocxRootImports({
              // Opening one DOCX into a structurally empty guest page is an
              // explicit root replacement, not a merge with the fixture's
              // leftover page/header/style attrs. Passing those stale attrs
              // to the planner falsely reports a global-root conflict after
              // the user has cleared the document body.
              currentDocument: replaceEmptyGuestDocument
                ? emptyDocumentContent()
                : currentDocument,
              currentDocumentIsEmpty,
              imports: inlineImports.map((item) => ({
                nodes:
                  replaceEmptyGuestDocument && item.documentRoot
                    ? item.documentRoot.nodes
                    : item.textNodes,
                docAttrs: item.documentRoot?.docAttrs,
                sourceName: item.file.name,
              })),
            });
          } catch (error) {
            if (error instanceof DocxRootImportPlanningError) {
              throw new LosslessImportRequiredError(
                t("editor.importLossy"),
                error,
              );
            }
            throw error;
          }
        }

        // Phase 2 performs exactly one durable mutation for an inline batch.
        // Attachment nodes carry opaque client ids; the server replaces those
        // placeholders with attachment descriptors in the same SQL commit that
        // appends the nodes and advances content_version.
        const nodes: Array<Record<string, unknown>> = [];
        const batchFiles: File[] = [];
        const batchItems: PageImportBatchFileItem[] = [];
        for (const [preparedIndex, item] of prepared.entries()) {
          assertImportOperationOwned(operation);
          if (item.kind === "separate_page") {
            const importedPage = await pageFileImport.createPageFromFile(
              item.notebookId,
              item.file,
            );
            assertImportOperationOwned(operation);
            dispatchNotebookPagesChanged(item.notebookId);
            dispatchNotebooksChanged();
            openWindow({
              type: "note",
              title: importedPage.title || titleFromFilename(item.file.name),
              meta: {
                notebookId: item.notebookId,
                pageId: importedPage.id,
                pageType: importedPage.page_type || "document",
              },
            });
            continue;
          }

          if (item.shouldUploadAttachment && item.file.size > SINGLE_REQUEST_UPLOAD_MAX_BYTES) {
            // Past one request body: uploaded in parts first, then appended
            // as the page's own attachment (removed again if the append fails).
            const uploaded = await uploadPageAttachment(operation.pageId, item.file, {
              signal: operation.controller.signal,
              title: item.file.name,
              notebookId: notebookIdRef.current,
            });
            stagedImageAttachmentIds.push(uploaded.attachment_id);
            assertImportOperationOwned(operation);
            nodes.push({
              type: "file",
              attrs: {
                attachment_id: uploaded.attachment_id,
                filename: uploaded.filename,
                mime_type: uploaded.mime_type,
                size_bytes: uploaded.size_bytes,
              },
            });
          } else if (item.shouldUploadAttachment) {
            const clientId = `file-${preparedIndex}`;
            batchFiles.push(item.file);
            batchItems.push({
              client_id: clientId,
              operation_id: "append-0",
            });
            nodes.push(fileNodeFromImportItem(clientId));
          }
          nodes.push(...item.textNodes);
        }

        const nodesToImport =
          guestDocumentPlan?.strategy === "append"
            ? guestDocumentPlan.appendNodes
            : nodes;
        if (
          nodesToImport.length > 0 ||
          guestDocumentPlan?.strategy === "replace"
        ) {
          assertImportOperationOwned(operation);
          const onlyInlineImport =
            prepared.length === 1 && prepared[0]?.kind === "inline"
              ? prepared[0]
              : null;
          const nextTitle =
            files.length === 1 && !titleRef.current.trim()
              ? onlyInlineImport?.importedTitle?.trim() ||
                titleFromFilename(files[0]?.name || "")
              : undefined;
          if (guestMode) {
            // Guest documents have no server page or attachment storage. Keep
            // the existing local insertion path, with a snapshot for rollback.
            editorSnapshot = JSON.parse(
              JSON.stringify(editor.getJSON()),
            ) as Record<string, unknown>;
            const normalizedSnapshot = normalizeDocumentForSave(editorSnapshot);
            if (!normalizedSnapshot.ok) {
              throw new Error(t("editor.importFailed"));
            }
            editorSnapshotNormalized = normalizedSnapshot.document;
            titleSnapshot = titleRef.current;
            if (
              guestDocumentPlan &&
              (replaceEmptyGuestDocument ||
                guestDocumentPlan.strategy === "replace")
            ) {
              await replaceImportedDocument(
                guestDocumentPlan,
                nextTitle,
                () => assertImportOperationOwned(operation),
                operation.transactionToken,
              );
            } else {
              await importNodes(
                nodesToImport,
                nextTitle,
                () => assertImportOperationOwned(operation),
                undefined,
                operation.transactionToken,
              );
            }
          } else {
            const notebookId = notebookIdRef.current;
            if (!notebookId) {
              throw new Error(t("editor.importFailed"));
            }
            // Flush a deferred editor serialization and any queued autosave
            // first. The returned content_version is the CAS base for the
            // server append; a conflict/null result means no ImportBatch is sent.
            flushPendingContentSerialize();
            let savedPage = await savePageNow();
            assertImportOperationOwned(operation);
            if (
              !savedPage &&
              getLastSaveFailureCode?.() === "empty_content_overwrite"
            ) {
              // The server correctly refused a stale/recovered blank body over
              // meaningful content. Reuse the autosave reload seam: it strips
              // only that known-empty rejected body, rehydrates the authority
              // body, and preserves any independent title/page-type draft.
              const refreshedPage = await reloadPage();
              assertImportOperationOwned(operation);
              if (refreshedPage) {
                // Flush preserved metadata now so the atomic append receives
                // the resulting current CAS version instead of racing the
                // reload's normal debounced metadata save.
                savedPage = await savePageNow();
                assertImportOperationOwned(operation);
              }
            }
            const baseContentVersion = savedPage?.content_version;
            if (
              !Number.isSafeInteger(baseContentVersion) ||
              Number(baseContentVersion) < 1
            ) {
              throw new Error(t("editor.importFailed"));
            }
            const receipt = await submitPageImportBatch({
              notebookId,
              batchId: createPageImportBatchId(),
              manifest: {
                items: batchItems,
                operations: [
                  {
                    operation_id: "append-0",
                    kind: "append_to_page",
                    page_id: operation.pageId,
                    base_content_version: Number(baseContentVersion),
                    ...(nextTitle ? { title: nextTitle } : {}),
                    nodes: nodesToImport,
                  },
                ],
              },
              files: batchFiles,
              signal: operation.controller.signal,
            });
            assertImportOperationOwned(operation);
            if (receipt.status !== "committed") {
              throw new Error(t("editor.importFailed"));
            }
            const committedItem = receipt.items.find(
              (item) => item.operation_id === "append-0",
            );
            if (
              !committedItem ||
              committedItem.kind !== "append_to_page" ||
              committedItem.page_id !== operation.pageId ||
              !validContentVersion(committedItem.content_version) ||
              committedItem.content_version <= Number(baseContentVersion)
            ) {
              throw new Error(t("editor.importCommittedRefreshFailed"));
            }
            dispatchNotebookPagesChanged(notebookId, operation.pageId);
            if (batchFiles.length > 0) {
              dispatchNotebookStorageChanged();
            }
            dispatchNotebooksChanged();
            let hydratedPage: PageItem | null;
            try {
              hydratedPage = await reloadPage();
            } catch {
              throw new Error(t("editor.importCommittedRefreshFailed"));
            }
            assertImportOperationOwned(operation);
            if (
              !hydrationCoversCommittedPage(
                hydratedPage,
                operation.pageId,
                committedItem.content_version,
              )
            ) {
              throw new Error(t("editor.importCommittedRefreshFailed"));
            }
          }
        }
      } catch (err) {
        if (
          !preserveCommittedImageState &&
          stagedImageAttachmentIds.length > 0
        ) {
          await Promise.allSettled(
            stagedImageAttachmentIds.map((attachmentId) =>
              apiDelete<void>(
                `/api/v1/attachments/${encodeURIComponent(attachmentId)}`,
              ),
            ),
          );
        }
        // Only the still-owning operation may restore guest-local state or
        // publish an error; a stale A operation must never overwrite the newly
        // hydrated B editor/title. Attachment-backed image insertion snapshots
        // the old document and restores it only before its CAS save commits.
        if (importOperationIsCurrent(operation)) {
          if (
            !preserveCommittedImageState &&
            editorSnapshot &&
            editorSnapshotNormalized &&
            titleSnapshot !== null
          ) {
            suppressEditorUpdateRef.current = true;
            let rollbackRestored = false;
            try {
              rollbackRestored = executeAuthorizedContentReplacement(
                editor,
                editorSnapshot,
                "content-restoration",
              );
              if (rollbackRestored) {
                restoreCommentThreads(editorSnapshotNormalized);
              }
            } finally {
              suppressEditorUpdateRef.current = false;
            }
            setTrackedTitle(titleSnapshot);
            onTitleChange?.(titleSnapshot);
            onPlainTextChange?.(editor.getText());
            if (rollbackRestored) {
              latestContentRef.current = editorSnapshotNormalized;
              replacePagePendingDraft(
                buildSaveDraft(editorSnapshotNormalized, titleSnapshot),
              );
            }
          }
          setImportError(
            err instanceof PageImportProjectionBudgetError ||
              err instanceof SharedPageImportProjectionBudgetError
              ? t("editor.importTooLarge")
              : htmlDocumentImport !== null && err instanceof htmlDocumentImport.HtmlDocumentImportError
                ? err.reason === "resource_limit"
                  ? t("editor.importTooLarge")
                  : t("editor.importUnsupported")
                : err instanceof PlainTextDocumentImportError
                  ? t("editor.importUnsupported")
                  : err instanceof StalePageImportError
                    ? t("editor.importFailed")
                    : !shellWriteAllowedRef.current
                      ? t("editor.importFailed")
                      : trustedDocumentImportError(
                          err,
                          t("editor.importFailed"),
                          [
                            t("editor.importUnsupported"),
                            t("editor.importTooLarge"),
                            t("editor.importNativeBatchUnsupported"),
                            t("editor.importCommittedRefreshFailed"),
                            t("editor.importLossy"),
                          ],
                        ),
          );
        }
      } finally {
        releaseTransactionAuthority();
        operation.live.release();
        if (activeImportRef.current === operation) {
          activeImportRef.current = null;
          setImporting(false);
        }
      }
    },
    [
      assertImportOperationOwned,
      beginLocalSaveMutation,
      savePageNow,
      reloadPage,
      replacePagePendingDraft,
      getLastSaveFailureCode,
      buildSaveDraft,
      editor,
      flushPendingContentSerialize,
      guestMode,
      importNodes,
      importOperationIsCurrent,
      importOperationMayWrite,
      normalizeDocumentForSave,
      onPlainTextChange,
      onTitleChange,
      openWindow,
      pageId,
      replaceImportedDocument,
      restoreCommentThreads,
      saveContent,
      setTrackedTitle,
      shellEventMayStart,
      t,
    ],
  );

  useEffect(() => {
    editorPasteHandlerRef.current = (view, event) => {
      if (!shellEventMayStart()) return false;
      const toolbarSpecialFormat = toolbarPasteSpecialFormatForEvent(event);
      // A clicked Paste Special entry is an explicit immediate command, so it
      // must not inherit a one-shot formatting mode previously armed for the
      // next keyboard paste. Reset that mode synchronously before routing the
      // selected clipboard flavor through the normal editor pipeline.
      if (toolbarSpecialFormat) plainPasteArmedRef.current = false;
      if (toolbarSpecialFormat && pasteModeRef.current !== DEFAULT_PASTE_MODE) {
        pasteModeRef.current = DEFAULT_PASTE_MODE;
        setPasteMode(DEFAULT_PASTE_MODE);
      }
      if (toolbarSpecialFormat === "unformatted-text") {
        event.preventDefault();
        insertPlainTextParagraphs(view, plainTextFromClipboard(event.clipboardData));
        return true;
      }
      // Paste as Plain Text (Ctrl/⌘+Shift+V): when the chord armed this paste,
      // insert the clipboard's text stripped of every mark (and block structure
      // beyond line breaks), consuming the flag. Takes precedence over the
      // table/image paths so "Keep Text Only" never reconstructs a table.
      if (plainPasteArmedRef.current) {
        plainPasteArmedRef.current = false;
        event.preventDefault();
        insertPlainTextParagraphs(view, plainTextFromClipboard(event.clipboardData));
        return true;
      }
      // Paste Special (toolbar dropdown): when a non-default mode is chosen, the
      // NEXT ordinary paste honours it then resets to "keep" (Word's one-shot
      // Paste Special). "merge" keeps inline emphasis but drops block styling;
      // "text" pastes plain text. "keep" falls through to the native paste.
      const mode = pasteModeRef.current;
      if (!toolbarSpecialFormat && mode !== "keep") {
        pasteModeRef.current = DEFAULT_PASTE_MODE;
        setPasteMode(DEFAULT_PASTE_MODE);
        const clip = event.clipboardData;
        const action = resolvePasteAction(mode, {
          plain: clip?.getData("text/plain") ?? "",
          html: clip?.getData("text/html") ?? "",
        });
        if (action.kind === "text") {
          event.preventDefault();
          insertPlainTextParagraphs(view, action.text);
          return true;
        }
        if (action.kind === "html") {
          event.preventDefault();
          // Pasted like any clipboard HTML: the fragment opens onto the
          // caret's line, so copied words land inline where the caret is
          // (Word) instead of starting a paragraph of their own. The merged
          // HTML is attribute-free (mergeFormatHtml) and parsed inertly.
          const body = new window.DOMParser().parseFromString(
            action.html,
            "text/html",
          ).body;
          const parsed = ProseMirrorDOMParser.fromSchema(
            view.state.schema,
          ).parseSlice(body);
          const slice = Slice.maxOpen(parsed.content, true);
          // Table cells go into the table's grid, as the default paste puts
          
          if (richTablePasteExceedsBudget(view, slice)) {
            toast({ title: t("toolbar.pasteTableTooWide"), variant: "destructive" });
            return true;
          }
          if (pasteTableCellsIntoTable(view, event, slice)) return true;
          // Merge Formatting: the pasted text takes the formatting of the
          // text at the insertion point (WUA 127).
          const destination = mode === "merge" ? mergeDestinationMarks(view.state) : [];
          const insertFrom = view.state.selection.from;
          const pasteTr = view.state.tr.replaceSelection(slice);
          const insertTo = pasteTr.selection.from;
          if (insertTo > insertFrom) {
            for (const mark of destination) pasteTr.addMark(insertFrom, insertTo, mark);
          }
          view.dispatch(pasteTr.scrollIntoView());
          return true;
        }
        // action.kind === "default": fall through to the native paste below.
      }
      const refuseTooWide = () =>
        toast({ title: t("toolbar.pasteTableTooWide"), variant: "destructive" });
      if (insertPlainTextTableFromPaste(view, event, refuseTooWide)) {
        return true;
      }
      // A rich paste (HTML) of table cells is measured the same way before
      
      const richSlice = clipboardHtmlSlice(view, event);
      if (richSlice && richTablePasteExceedsBudget(view, richSlice)) {
        event.preventDefault();
        refuseTooWide();
        return true;
      }
      if (guestMode) {
        return false;
      }
      const imageFiles = clipboardImageFiles(event.clipboardData);
      if (imageFiles.length === 0) {
        return false;
      }
      if (clipboardHasEditableText(event.clipboardData)) {
        return false;
      }
      event.preventDefault();
      void importFiles(imageFiles);
      return true;
    };
    return () => {
      editorPasteHandlerRef.current = null;
    };
  }, [editor, guestMode, importFiles, shellEventMayStart, t]);

  const handlePickImport = useCallback(() => {
    if (!shellEventMayStart()) return;
    importInputRef.current?.click();
  }, [shellEventMayStart]);

  const handleImportInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!shellEventMayStart()) return;
      void importFiles(files);
    },
    [importFiles, shellEventMayStart],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shellEventMayStart()) return;
      acceptFileDrag(event);
    },
    [acceptFileDrag, shellEventMayStart],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shellEventMayStart()) return;
      const files = Array.from(event.dataTransfer.files || []);
      // getData() can throw when drag-drop clipboard access is restricted;
      // degrade to no text rather than crashing the drop handler.
      let text = "";
      try {
        text = event.dataTransfer.getData("text/plain");
      } catch {
        text = "";
      }
      if (files.length === 0 && !text.trim()) {
        return;
      }
      const targetElement =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      if (
        files.length === 0 &&
        text.trim() &&
        targetElement?.closest(".ProseMirror")
      ) {
        endFileDrag();
        return;
      }
      event.preventDefault();
      endFileDrag();
      if (files.length > 0) {
        void importFiles(files);
      } else {
        setImportError(null);
        void importPlainText(text).catch((err) => {
          setImportError(
            err instanceof StalePageImportError
              ? t("editor.importFailed")
              : trustedDocumentImportError(err, t("editor.importFailed"), [
                  t("editor.importUnsupported"),
                  t("editor.importTooLarge"),
                ]),
          );
        });
      }
    },
    [endFileDrag, importFiles, importPlainText, shellEventMayStart, t],
  );

  // Cmd+S / Ctrl+S should save only the editor that currently owns focus.
  // A signed-out visitor's ⌘P / ⌘⇧S (print, save a copy) asks for an account
  // instead of letting the browser print the page around the editor.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const guestExport =
        Boolean(onGuestExportRequest) &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        ((key === "p" && !e.shiftKey) || (key === "s" && e.shiftKey));
      if (
        guestExport ||
        ((e.metaKey || e.ctrlKey) &&
          !e.altKey &&
          !e.shiftKey &&
          key === "s")
      ) {
        const wrapper = wrapperRef.current;
        const eventTarget = e.target instanceof Node ? e.target : null;
        const activeTarget =
          document.activeElement instanceof Node
            ? document.activeElement
            : null;
        // A portal belongs to this editor even outside its DOM wrapper. Prefer
        // the actual event target so another window's focus cannot borrow it.
        const target = eventTarget && eventTarget !== document && eventTarget !== document.body
          ? eventTarget : activeTarget;
        if (!wrapper || !target || !(wrapper.contains(target) ||
            (footerPortalTarget?.isConnected && footerPortalTarget.contains(target)))) {
          return;
        }
        e.preventDefault();
        if (guestExport) {
          onGuestExportRequest?.();
          return;
        }
        void commandBus.execute("save");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandBus, footerPortalTarget, onGuestExportRequest]);

  // ---- Title change -------------------------------------------------------

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!shellEventMayStart()) return;
      const nextTitle = e.target.value;
      const localSaveMutation = beginLocalSaveMutation();
      setTrackedTitle(nextTitle);
      onTitleChange?.(nextTitle);
      if (guestMode) {
        return;
      }
      if (!editorHydratedRef.current) {
        return;
      }
      // Pick up any deferred large-doc serialization first; after the
      // flush latestContentRef is already normalized, so only the null
      // fallback (nothing typed yet this session) pays a fresh
      // getJSON + normalize — re-normalizing the ref per title keystroke
      // was itself a full-document traversal on large imports.
      flushPendingContentSerialize();
      let normalizedContent = latestContentRef.current;
      if (normalizedContent === null) {
        const normalized = normalizeDocumentForSave(
          (editor?.getJSON() as Record<string, unknown> | undefined) ?? {
            type: "doc",
            content: [],
          },
        );
        if (!normalized.ok) {
          rejectInvalidDocumentContent(normalized.issue);
          return;
        }
        normalizedContent = normalized.document;
        latestContentRef.current = normalizedContent;
      }
      const draft = buildSaveDraft(normalizedContent, nextTitle);
      if (!markLocalSaveMutationQueued(localSaveMutation, draft)) return;
      autosave.queueSave(draft);
    },
    [
      autosave,
      beginLocalSaveMutation,
      buildSaveDraft,
      editor,
      flushPendingContentSerialize,
      guestMode,
      markLocalSaveMutationQueued,
      normalizeDocumentForSave,
      onTitleChange,
      rejectInvalidDocumentContent,
      setTrackedTitle,
      shellEventMayStart,
    ],
  );

  // ---- Title Enter → focus editor ----------------------------------------

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const commands = getEditorCommands<{
          focus?: (position?: string) => boolean;
        }>(editor);
        executeEditorCommand(commands?.focus, "start");
      }
    },
    [editor],
  );

  const usableEditor = isUsableEditor(editor) ? editor : null;
  // A picture, shape, chart or lasso of ink in another member's hand follows
  // it here as it moves, sizes and turns (documentLiveTransform); this
  // member's own gestures go out only while it can edit.
  useDocumentLiveTransforms(
    usableEditor,
    previewMode ? null : documentLiveSurface(pageId),
    collabPresenceSession?.awareness ?? null,
    editorMayEdit ? (collabSession?.awareness ?? null) : null,
  );
  // What this view's reader takes out of the ink goes out in the room's
  // presence, and the members' deletions come in: the same deletion made in
  // another window, tab or device is not reported as lost here
  // (lib/collab/ink-erasure-journal).
  const inkErasureRead = collabPresenceSession?.awareness ?? null;
  const inkErasureWrite = editorMayEdit ? (collabSession?.awareness ?? null) : null;
  useEffect(() => {
    if (previewMode || !pageId || (!inkErasureRead && !inkErasureWrite)) return;
    return registerInkErasureAwareness(pageId, inkErasureRead, inkErasureWrite);
  }, [inkErasureRead, inkErasureWrite, pageId, previewMode]);
  // FILENAME fields show the page's current name, not the one they were
  // inserted under (WUA 116).
  useEffect(() => {
    if (usableEditor) publishDocumentFieldIdentity(usableEditor, { filename: title || null });
  }, [title, usableEditor]);
  // A handwriting document takes ink only: no caret, typing, IME, paste or
  // dropped text anywhere on its pages (handwritingDocument.ts); the pen,
  // the eraser, the lasso, Undo and the ribbon's commands keep working.
  useEffect(() => {
    if (!isHandwriting || !usableEditor || previewMode) return;
    return holdHandwritingInkOnly(usableEditor);
  }, [isHandwriting, usableEditor, previewMode]);
  // The window wears the page's own glyph: a handwriting document's, not a
  // document's (WindowGlyph reads `pageVariant`). A window opened from a list
  // knows only the page type; the page's body says which document it is.
  useEffect(() => {
    if (!windowId || !usableEditor || previewMode) return;
    updateWindowMeta(windowId, { pageVariant: isHandwriting ? "handwriting" : null });
  }, [isHandwriting, usableEditor, previewMode, updateWindowMeta, windowId]);
  // Confirmed draft: the ribbon slides in over the page, the text stays put.
  const agentDraftRevealing = useAgentDraftRevealing(pageId);
  const getEditorDom = useCallback(
    () => editorViewDom(usableEditor),
    [usableEditor],
  );
  useRibbonRevealKeepsBodyStill(getEditorDom, runOwnedDraft, agentDraftRevealing, editorHydrated);

  const pageContentVersion =
    typeof autosave.page?.content_version === "number"
      ? autosave.page.content_version
      : null;

  // A circled Copilot ask made before this page was closed: once the page
  // is writable again, its result reopens as the same circled preview.
  const docsCopilotResume = usePendingCopilotResume({
    pageId,
    hosts: DOCS_COPILOT_RESUME_HOSTS,
    ready: Boolean(
      usableEditor &&
        windowId &&
        !guestMode &&
        editorMayEdit &&
        pageWritable.known &&
        pageWritable.writable &&
        pageContentVersion !== null,
    ),
  });
  useEffect(() => {
    // An ask done in parts reopens as its parts list, not as a circle.
    if (!docsCopilotResume.resume || docsCopilotResume.resume.parts) return;
    setCopilotCircleRange(null);
    setCopilotCirclePage(pageId);
  }, [docsCopilotResume.resume, pageId]);

  // Structural print: the sheets print themselves - WYSIWYG by
  // construction. Every document is sheeted (schema `pageBlock+`), so this
  // is THE print path — the painted line-split projection print died with
  // the pageless mode.
  const latestStructuralPrintOptionsRef = useDocumentStructuralPrintOptions({
    editor,
    handwritingCoverRef,
    pageId,
    pageNumberFormat,
    pageNumberStart,
    pageNumberStartSection,
    richBands,
    sectionBands,
    sheetFootnoteZones,
    sheetNoteContinuationPages,
    sheetBandBoxes,
    sheetBandContext,
    showPageNumbers,
    t,
    titleRef,
    wrapperRef,
  });
  // Word's Print Markup: a document holding tracked changes prints its markup
  // unless the person asks for the final copy (printMarkup false), in the
  // review display the screen shows (printRevisionMarkup). The final copy is
  // laid out under No Markup when the screen lays deleted text out inline,
  // and the screen's display is put back once the copy is made.
  const printStructural = useCallback((printMarkup?: boolean) => {
    const live = isUsableEditor(editor) ? editor : null;
    const markup = printMarkup ?? (live ? hasTrackedChanges(live.state) : false);
    const revisionMarkup = markup && live ? readMarkupFilter(live.state) : null;
    const layOutFinalCopy = () => {
      if (!live || live.isDestroyed) return null;
      const shown = readMarkupFilter(live.state);
      if (!markupFilterLaysOutDeletions(shown) || !hasTrackedChanges(live.state)) return null;
      if (!live.commands.setTrackedChangeMarkupFilter("none")) return null;
      return () => {
        if (!live.isDestroyed && readMarkupFilter(live.state) === "none") {
          live.commands.setTrackedChangeMarkupFilter(shown);
        }
      };
    };
    const base = latestStructuralPrintOptionsRef.current();
    const options = base ? { ...base, revisionMarkup, layOutFinalCopy } : null;
    // Print waits for the pages to finish laying out, as long as the page
    // renderer does: the copy window says "Preparing" meanwhile. Under the
    // 10 s asset default, Print on a five-page page of handwriting in Safari
    
    // fonts failed to load", and the browser's own print of the app that
    // followed gave 10 pages with the strokes drawn large.
    if (!options) return;
    // Pages drawn hollow (docs-hollow) print whole: drawn so until the copy
    // is done.
    const releaseWholePages = live ? holdWholePages(live.view) : () => {};
    const printed = printStructuralSheets({...options, sourceTimeoutMs: STRUCTURAL_PRINT_SOURCE_TIMEOUT_MS, resolveAfterSourceReady: () => latestStructuralPrintOptionsRef.current()});
    if (printed) void printed.finally(releaseWholePages);
    else releaseWholePages();
  }, [editor, latestStructuralPrintOptionsRef]);
  // ⌘P / Ctrl+P in a document prints its pages, as the toolbar's Print does
  // (Word's own shortcut). Left to the browser, Safari printed the app around
  // the editor: each 11" sheet ran over two pieces of paper under the
  // browser's own margins (10 pages for 5) with the handwriting drawn large
  
  // counts as the document; a signed-out visitor's ⌘P is the account prompt
  // (the handler above).
  useEffect(() => {
    if (onGuestExportRequest) return;
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "p") return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const eventTarget = e.target instanceof Node ? e.target : null;
      const activeTarget = document.activeElement instanceof Node ? document.activeElement : null;
      const target = eventTarget && eventTarget !== document && eventTarget !== document.body ? eventTarget : activeTarget;
      const host = wrapper.closest(".wm-window") ?? wrapper;
      if (!target || !(host.contains(target) || (footerPortalTarget?.isConnected && footerPortalTarget.contains(target)))) return;
      if (!latestStructuralPrintOptionsRef.current()) return;
      e.preventDefault();
      printStructural();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [footerPortalTarget, latestStructuralPrintOptionsRef, onGuestExportRequest, printStructural]);
  // File > Print, which no page can take over: the front document prints its
  // sheets alone, a piece of paper each (nativeDocumentPrint.ts).
  useEffect(() => registerNativeDocumentPrint({
    wrapper: () => wrapperRef.current,
    printable: () => latestStructuralPrintOptionsRef.current() !== null,
  }), [latestStructuralPrintOptionsRef]);
  usePrintRevisionMarkupDisplay(editor, printRevisionMarkup, editorHydrated);
  useExposedStructuralPrint(exposeStructuralPrint, latestStructuralPrintOptionsRef, printRevisionMarkup);

  // "Fix with AI": the page's AI panel, with a specific repair request the
  // person reviews and sends; its changes come back for review, not applied.
  const docsNotebookId = autosave.page?.notebook_id ?? null;
  const fixDocsNotices = useCallback(() => {
    if (!docsNotebookId || !pageId || docsChecks.notices.length === 0) return;
    openWindow({
      type: "ai_panel",
      title: `AI · ${title || t("pages.document")}`,
      meta: { pageId, notebookId: docsNotebookId, pageType: "document" },
    });
    requestReviewOnlyChatPrefill({
      notebookId: docsNotebookId,
      pageId,
      text: docsRepairPrompt(docsChecks.notices, t),
      executionMode: "review_changes",
    });
  }, [docsChecks.notices, docsNotebookId, openWindow, pageId, t, title]);
  const docsVerification = useMemo<OfficeRailSave["verification"]>(() => {
    const fix =
      docsChecks.notices.length > 0 && shellControlWriteAllowed && !guestMode
        ? {
            label: t("pages.exportNotices.fix"),
            onClick: fixDocsNotices,
            testId: "note-editor-export-notices-fix",
          }
        : undefined;
    if (docsChecks.recheckFailed) {
      return {
        status: "failed",
        label: t("pages.editorRecheck.failed"),
        detail: t("pages.editorRecheck.failedDetail"),
        testId: "note-editor-editor-recheck",
        action: fix,
      };
    }
    if (docsChecks.notices.length > 0) {
      const sentences = docsChecks.notices.map((notice) =>
        docsNoticeSentence(notice, t),
      );
      if (docsChecks.unverified) {
        sentences.push(t("pages.exportFidelity.unverifiedDetail"));
      }
      return {
        status: "notice",
        label: t("pages.exportNotices.label", {
          count: docsChecks.notices.length,
        }),
        detail: sentences.join("\n"),
        testId: "note-editor-export-notices",
        action: fix,
      };
    }
    return undefined;
  }, [docsChecks, fixDocsNotices, guestMode, shellControlWriteAllowed, t]);

  // A save on the wire for a while says it is still working, and how long.
  const longSaveElapsed = useSaveElapsed(saveStatus === "saving" ? autosave.saveSentAt : null);
  const documentPartsViewStopped = documentPartsPage && documentParts.state.blocked === "count-jump";
  // A face saying "Saving..." or "Save" for 90 s with nothing on its way:
  // said to the server once, by its inputs (SaveSurfaceStalled).
  const docsStall = docsSaveStallFace({
    saveStatus, partsViewStopped: Boolean(documentPartsViewStopped), hasConflict: Boolean(autosave.hasConflict),
    syncedToServer: Boolean(autosave.syncedToServer), notConnected: Boolean(autosave.notConnected),
    error: Boolean(autosave.error), raw: autosave.saveStatus, catchingUp: docsCatchingUp, settling: docsSettling,
    closingEdits: Boolean(autosave.closingEditsPending), partsSaving: documentPartsSaving, local: localSaveStatus,
    conflictCopy: conflictCopyUnmerged, dirty: Boolean(autosave.isDirty),
  });
  useSaveSurfaceStallReport({
    pageId, pageType: "document", enabled: !guestMode && !autosave.readOnly, face: docsStall.face,
    busy: Boolean(autosave.isSaving) || documentPartsSaving, inputs: () => docsStall.inputs,
  });
  const toolbarQuickSave = useMemo<OfficeRailSave>(
    () => ({
      // A view stopped by the parts' save gate saves nothing, whatever the
      // page's own save last said: it never reads as saved.
      status: documentPartsViewStopped
        ? "error"
        : autosave.hasConflict
        ? "conflict"
        : autosave.syncedToServer && saveStatus === "unsaved"
          ? "synced"
          // Edits held on this device because the page's room cannot take
          // them (lib/collab/room-unreachable): said so, not "Saving…".
          : autosave.notConnected
            ? "offline"
          : autosave.error && saveStatus === "unsaved"
            ? "error"
            : saveStatus,
      statusLabel: documentPartsViewStopped
        ? t("pages.unsaved")
        : autosave.syncedToServer && saveStatus === "unsaved"
        ? t("pages.synced")
        : autosave.notConnected
        ? t("pages.notConnectedKeptOnDevice")
        : saveStatus === "saving" && longSaveElapsed !== null
          ? t("pages.savingLong", { elapsed: longSaveElapsed })
          : t(`pages.${saveStatus}` as "pages.saving"),
      actionLabel: t("pages.save"),
      autosave: officeAutosaveLabels(t),
      autosaveScope: DOCS_AUTOSAVE_SCOPE,
      actionAriaLabel: t("pages.saveNow"),
      onSave: saveNow,
      disabled: !shellControlWriteAllowed,
      disabledReason: !shellControlWriteAllowed
        ? t("document.capability.unavailable")
        : undefined,
      actionTestId: "note-editor-save",
      statusTestId: "note-editor-save-status",
      failureReason: autosave.error ?? undefined,
      failureTestId: "note-editor-save-failure-reason",
      verification: docsVerification ?? (publishedReadback
        ? {
            status: publishedReadback.status,
            label: t(
              `pages.publishedReadback.${
                publishedReadback.status
              }` as "pages.publishedReadback.verified",
            ),
            testId: "note-editor-published-readback",
          }
        : exportFidelityUnverified
          ? {
              // Handed over without the check: say so, never "Verified".
              status: "unverified",
              label: t("pages.exportFidelity.unverified"),
              detail: t("pages.exportFidelity.unverifiedDetail"),
              testId: "note-editor-export-fidelity",
            }
          : undefined),
      note: stoppedAfterSection
        ? {
            label: t("pages.agentDraftKept", { count: stoppedAfterSection }),
            detail: t("pages.agentDraftKeptDetail", { count: stoppedAfterSection }),
            testId: "note-editor-agent-draft-kept",
          }
        : undefined,
    }),
    [autosave.error, autosave.hasConflict, autosave.notConnected, docsVerification, exportFidelityUnverified, longSaveElapsed,
      publishedReadback, saveNow, saveStatus, shellControlWriteAllowed, stoppedAfterSection, t],
  );

  // With nothing focused the key lands on the page's body, outside every
  // window: a menu that closed (a pen's colour or an eraser kind), the Draw
  // tab's eraser or trackpad taking the pointer, the ink surface that went
  // away once the eraser had nothing left. The focused document window takes
  // Undo / Redo then too, as Word undoes from anywhere in its window.
  useEffect(() => {
    if (previewMode || !usableEditor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const shortcut = historyShortcut(event);
      if (!shortcut) return;
      const wrapper = wrapperRef.current;
      const doc = wrapper?.ownerDocument;
      if (!wrapper?.isConnected || !doc) return;
      const active = doc.activeElement;
      if (active && active !== doc.body && active !== doc.documentElement) return;
      const shell = wrapper.closest(".wm-window");
      const ours = shell
        ? shell.getAttribute("data-focused") === "true"
        : doc.querySelectorAll(".note-editor-wrapper").length === 1;
      if (!ours || usableEditor.isDestroyed) return;
      event.preventDefault();
      runDocumentShortcut(usableEditor, shortcut);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewMode, usableEditor]);

  // The title bar's own commands ahead of the history pair: who else is
  // here (their avatars, only when someone is), then import. Save state has
  // its own fixed slot and is never duplicated here.
  const toolbarHeaderExtras = useMemo(
    () => (
      <>
        {collabSession && collabPresence.length > 0 ? (
          <span
            className="note-editor-presence"
            data-testid="note-editor-presence"
            role="group"
            aria-label={t("collab.presenceLabel")}
            title={t("collab.activeCount", { count: collabPresence.length })}
          >
            {collabPresence.map((entry) => {
              const member = entry.user.id
                ? presenceMembers.get(entry.user.id)
                : undefined;
              return (
                <span
                  key={entry.clientId}
                  className="note-editor-presence-dot"
                  data-testid="note-editor-presence-dot"
                  title={entry.user.name}
                  aria-label={entry.user.name}
                >
                  <UserAvatar
                    size={20}
                    name={entry.user.name}
                    accentColor={entry.user.color}
                    avatar={member?.avatar}
                  />
                </span>
              );
            })}
          </span>
        ) : null}
        <OfficeRailButton
          label={t("editor.import")}
          icon={<OfficeSemanticIcon semanticId="file.import" size={18} />}
          busy={importing}
          onClick={handlePickImport}
          disabled={!shellControlWriteAllowed}
          testId="note-editor-import"
        />
        <input
          ref={importInputRef}
          type="file"
          multiple
          accept={
            guestMode
              ? GUEST_INLINE_PAGE_IMPORT_ACCEPT
              : GUIDED_PAGE_IMPORT_ACCEPT
          }
          className="note-editor-import-input"
          data-testid="note-editor-import-input"
          onChange={handleImportInputChange}
        />
        {!guestMode && pageContentVersion !== null ? (
          <DocumentDisplayFontRepair pageId={pageId} version={pageContentVersion} needs={displayFonts.needs}
            enabled={editorMayEdit && saveStatus === "saved"} ready={displayFonts.ready}
            onRetry={displayFonts.retry} failure={displayFonts.failure}/>
        ) : null}
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- JSX reads live refs/handlers; states below drive re-render
    [
      pageId, pageContentVersion, displayFonts.needs, displayFonts.ready, displayFonts.failure, displayFonts.retry, editorMayEdit, saveStatus,
      importing,
      shellControlWriteAllowed,
      guestMode,
      collabSession,
      collabPresence,
      presenceMembers,
      t,
    ],
  );

  
  // used to crowd the title-row strip while duplicating ribbon features —
  // comments/trackChanges now live on 审阅, view panes on 视图, zoom in the
  // status bar).
  const closeCommentsPanel = useCallback(() => {
    const returnFocus = commentsReturnFocusRef.current;
    commentsReturnFocusRef.current = null;
    setCommentsOpen(false);
    setNewCommentRequestId(0);
    restorePanelFocus(editor, returnFocus);
  }, [editor]);
  const toggleCommentsPanel = useCallback(() => {
    if (commentsOpen) {
      closeCommentsPanel();
      return;
    }
    commentsReturnFocusRef.current = stablePanelReturnFocusTarget();
    setNewCommentRequestId(0);
    setCommentsOpen(true);
  }, [closeCommentsPanel, commentsOpen]);
  const closeTrackChangesPanel = useCallback(() => {
    const returnFocus = trackChangesReturnFocusRef.current;
    trackChangesReturnFocusRef.current = null;
    setTrackChangesOpen(false);
    restorePanelFocus(editor, returnFocus);
  }, [editor]);
  const toggleTrackChangesPanel = useCallback(() => {
    trackChangesReturnFocusRef.current = stablePanelReturnFocusTarget();
    setTrackChangesOpen(true);
  }, [closeTrackChangesPanel, false]);
  // An AI change's review asked for this page: the Reviewing Pane opens on
  // its AI changes, at the group (asked before this editor was mounted too).
  useEffect(() => {
    if (guestMode || !pageId) return;
    const open = (groupId: string | null) => {
      trackChangesReturnFocusRef.current ??= stablePanelReturnFocusTarget();
      setTrackChangesOpen(true);
      setAiReviewRequest({ groupId, nonce: Date.now() });
    };
    const pending = takePendingAiReviewOpen(pageId);
    if (pending) open(pending.groupId);
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAiReviewDetail>).detail;
      if (detail?.pageId !== pageId) return;
      takePendingAiReviewOpen(pageId);
      open(detail.groupId);
    };
    window.addEventListener(OPEN_AI_REVIEW_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AI_REVIEW_EVENT, onOpen);
  }, [guestMode, pageId]);
  const closeOutlinePanel = useCallback(() => {
    const returnFocus = outlineReturnFocusRef.current;
    outlineReturnFocusRef.current = null;
    setOutlineOpen(false);
    restorePanelFocus(editor, returnFocus);
  }, [editor]);
  const toggleOutlinePanel = useCallback(() => {
    if (outlineOpen) {
      closeOutlinePanel();
      return;
    }
    outlineReturnFocusRef.current = stablePanelReturnFocusTarget();
    setOutlineOpen(true);
  }, [closeOutlinePanel, outlineOpen]);
  const closeStylesPanel = useCallback(() => {
    const returnFocus = stylesReturnFocusRef.current;
    stylesReturnFocusRef.current = null;
    setStylesOpen(false);
    restorePanelFocus(editor, returnFocus);
  }, [editor]);
  const toggleStylesPanel = useCallback(() => {
    if (stylesOpen) {
      closeStylesPanel();
      return;
    }
    stylesReturnFocusRef.current = stablePanelReturnFocusTarget();
    setStylesOpen(true);
  }, [closeStylesPanel, stylesOpen]);
  // Home > Styles > Create a Style: the Styles pane opens on its New style
  // form, seeded with the selection's formatting.
  const [stylesCreateRequest, setStylesCreateRequest] =
    useState<StylesPanelCreateRequest | null>(null);
  const createStyleFromSelection = useCallback(
    (seed: StylesPanelCreateRequest["seed"]) => {
      if (!stylesOpen) {
        stylesReturnFocusRef.current = stablePanelReturnFocusTarget();
        setStylesOpen(true);
      }
      setStylesCreateRequest((previous) => ({
        seed,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    },
    [stylesOpen],
  );
  const closeBacklinksPanel = useCallback(() => {
    const returnFocus = backlinksReturnFocusRef.current;
    backlinksReturnFocusRef.current = null;
    setBacklinksOpen(false);
    restorePanelFocus(editor, returnFocus);
  }, [editor]);
  const toggleBacklinksPanel = useCallback(() => {
    if (backlinksOpen) {
      closeBacklinksPanel();
      return;
    }
    backlinksReturnFocusRef.current = stablePanelReturnFocusTarget();
    setBacklinksOpen(true);
  }, [backlinksOpen, closeBacklinksPanel]);
  // Word's two task pane docks (documentTaskPaneDock.tsx): Navigation and
  // the Reviewing Pane on the left, the other panes on the right, one tab per
  // open pane. The toolbar's own panes join the same docks through context.
  const taskPaneDocks = useDocumentTaskPaneDocks();
  useDocumentTaskPaneCover(wrapperRef);
  const toolbarPanes = useMemo(
    () => ({
      comments: {
        open: commentsOpen,
        toggle: toggleCommentsPanel,
      },
      trackChanges: {
        open: false,
        toggle: toggleTrackChangesPanel,
      },
      outline: {
        open: outlineOpen,
        toggle: toggleOutlinePanel,
      },
      styles: {
        open: stylesOpen,
        toggle: toggleStylesPanel,
        create: createStyleFromSelection,
      },
      ...(guestMode
        ? {}
        : {
            backlinks: {
              open: backlinksOpen,
              toggle: toggleBacklinksPanel,
            },
          }),
      // No sheetStack pane: the painted 打印预览 sheet stack died with the
      // pageless mode — the sheets themselves are print-exact.
    }),
    [
      commentsOpen,
      toggleCommentsPanel,
      false,
      toggleTrackChangesPanel,
      outlineOpen,
      toggleOutlinePanel,
      stylesOpen,
      toggleStylesPanel,
      createStyleFromSelection,
      guestMode,
      backlinksOpen,
      toggleBacklinksPanel,
    ],
  );
  const toolbarZoom = useMemo(
    () => ({
      percent: zoomPercent(docZoom),
      level: docZoom,
      setLevel: zoomTo,
      canZoomIn: docZoom < EDITOR_ZOOM_MAX,
      canZoomOut:
        docPageViewMode === "multiple-pages" || docZoom > EDITOR_ZOOM_MIN,
      zoomIn,
      zoomOut,
      reset: zoomReset,
      fitOnePage: zoomFitOnePage,
      fitMultiplePages: zoomFitMultiplePages,
      fitPageWidth: zoomFitPageWidth,
      multiplePagesActive: docPageViewMode === "multiple-pages",
    }),
    [
      docPageViewMode,
      docZoom,
      zoomFitOnePage,
      zoomFitMultiplePages,
      zoomFitPageWidth,
      zoomIn,
      zoomOut,
      zoomReset,
      zoomTo,
    ],
  );
  const toolbarDocumentView = useMemo(
    () => ({
      mode: documentLayoutViewMode,
      showPrintLayout,
      showWebLayout,
      showOutlineLayout,
      showDraftLayout,
      sideBySideActive: false,
      sideBySideSupported: documentSideBySideSupported,
      showSideBySide: showDocumentSideBySide,
      splitActive: documentSplitViewActive,
      toggleSplit: toggleDocumentSplitView,
      windowCommandsSupported: documentWindowCommandsSupported,
      openNewWindow: openNewDocumentWindowView,
      arrangeAllWindows: arrangeAllDocumentWindowsView,
      listWindows: listDocumentWindows,
      switchWindow: switchDocumentWindowView,
      synchronousScrollingActive: synchronizedScrollState.active,
      synchronousScrollingSupported: synchronizedScrollState.supported,
      toggleSynchronousScrolling: toggleSynchronizedScrollingView,
      readingViewActive,
      toggleReadingView,
    }),
    [
      documentLayoutViewMode,
      documentSideBySideSupported,
      documentSplitViewActive,
      readingViewActive,
      toggleReadingView,
      documentWindowCommandsSupported,
      openNewDocumentWindowView,
      arrangeAllDocumentWindowsView,
      listDocumentWindows,
      switchDocumentWindowView,
      synchronizedScrollState.active,
      synchronizedScrollState.supported,
      toggleSynchronizedScrollingView,
      showDraftLayout,
      showOutlineLayout,
      showPrintLayout,
      showWebLayout,
      showDocumentSideBySide,
      toggleDocumentSplitView,
    ],
  );

  // Word margin-click: clicking the page's dead zones (margins, seam fill /
  // gutter bands) drops the caret at the nearest document position and
  // collapses any selection. Without this the click never reaches
  // ProseMirror (the padding sits outside the PM root), the editor merely
  // blurs, and InactiveSelectionHighlight repaints the stale range — read
  
  const handlePageSurfaceMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!usableEditor) return;
      const target = event.target as HTMLElement;
      // Real content keeps PM's own click handling; editable islands and
      // interactive chrome keep theirs.
      if (
        target.closest(".note-editor-content") ||
        target.closest("[contenteditable='true']") ||
        
        target.closest(".paged-edit-seam__footnote, .sheet-footnote-overlay") ||
        target.closest("button, a, input, textarea, select, [role='button']")
      ) {
        return;
      }
      if (dismissDocumentObjectFromSurface(usableEditor.view, event.nativeEvent)) {
        event.preventDefault();
        return;
      }
      // Margin coordinates sit OUTSIDE the PM box (that is the whole point),
      // where posAtCoords returns null — clamp into the box so the caret
      // lands on the nearest line, Word style.
      const viewRect = usableEditor.view.dom.getBoundingClientRect();
      const pos = usableEditor.view.posAtCoords({
        left: Math.min(
          Math.max(event.clientX, viewRect.left + 1),
          viewRect.right - 1,
        ),
        top: Math.min(
          Math.max(event.clientY, viewRect.top + 1),
          viewRect.bottom - 1,
        ),
      });
      event.preventDefault();
      const selection = selectionNearInlineContent(
        usableEditor.state.doc,
        pos ? pos.pos : usableEditor.state.selection.to,
      );
      const chain = usableEditor.chain().focus(undefined, {
        scrollIntoView: false,
      });
      // Even without a mappable coordinate, resolve the current endpoint to a
      // legal inline selection instead of leaving a stale range painted.
      chain
        .command(({ tr }) => {
          tr.setSelection(selection);
          return true;
        })
        .run();
    },
    [usableEditor],
  );

  
  // 缩小时下滑). The page surface scales around "top center" while the
  // window's scrollTop stays put, so the content point under the viewport
  // centre drifts by (new-old)*offset. Before the next paint, re-derive
  // scrollTop so the SAME content point stays at the viewport centre.
  const prevZoomRef = useRef(docZoom);
  useLayoutEffect(() => {
    const oldZoom = prevZoomRef.current;
    prevZoomRef.current = docZoom;
    if (oldZoom === docZoom) return;
    const wrapper = wrapperRef.current;
    const scroller = wrapper?.closest<HTMLElement>(".note-window-scroll");
    if (!wrapper || !scroller) return;
    // The scaled element is the page surface. Its rendered top equals its
    // layout top (origin is top), so the measurement is scale-independent.
    const scaled = wrapper.querySelector<HTMLElement>(
      '[data-testid="note-editor-page-surface"]',
    );
    if (!scaled) return;
    const scaledTop =
      scaled.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const anchor = scroller.scrollTop + scroller.clientHeight / 2;
    if (anchor <= scaledTop) return;
    const contentY = (anchor - scaledTop) / oldZoom;
    scroller.scrollTop =
      scaledTop + contentY * docZoom - scroller.clientHeight / 2;
  }, [docZoom]);

  // The zoomed surface's reserved space, as the paper is seen (shared with
  // the print surface: native-document/paged/usePagedSurfaceZoomReserve).
  usePagedSurfaceZoomReserve(wrapperRef, docZoom, usableEditor, editorHydrated);

  // ── Trackpad / touch pinch, Ctrl(⌘)+wheel zoom ─────────────────────────
  
  // (two fingers, Safari's gesture events, a trackpad's Ctrl+wheel stream)
  // and Ctrl/⌘+wheel follow the fingers on every frame as a compositor-only
  // preview of the page surface, anchored under the fingers; docZoom is
  // committed once when the gesture rests (lib/live-zoom). Committing every
  // event re-rendered the whole editor per event, so on an iPad the zoom
  // only moved when the main thread caught up. Called after the margin
  // reservation and the viewport-centre anchoring above: its own anchoring
  // runs last and puts the content under the fingers back under them.
  const docZoomGestureAttachKey = useMemo(
    () => ({}),
    // the wrapper (re)mounts with the loading gate
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autosave.loading, editorHydrated, guestMode, usableEditor],
  );
  useLiveZoomGesture({
    viewport: () => {
      const host = wrapperRef.current;
      return host?.closest<HTMLElement>(".note-window-scroll") ?? host;
    },
    surface: () =>
      wrapperRef.current?.querySelector<HTMLElement>(
        '[data-testid="note-editor-page-surface"]',
      ) ?? null,
    level: docZoom,
    bounds: () => EDITOR_ZOOM_BOUNDS,
    // A pinch near the zoom at which the paper is exactly as wide as the
    
    snapLevels: () => {
      const wrapper = wrapperRef.current;
      const sheet = wrapper?.querySelector<HTMLElement>(
        ".note-editor-content > article[data-page-sheet]",
      );
      const available = wrapper?.clientWidth ?? 0;
      const paper = sheet?.offsetWidth ?? 0;
      return available > 0 && paper > 0 ? [fitPageWidthZoom(available, paper, 0)] : [];
    },
    onBegin: () => {
      exitDocumentProjectionViewRef.current();
      exitMultiplePagesViewRef.current();
    },
    onCommit: (level) => {
      const next = clampZoom(level);
      lastManualDocZoomRef.current = next;
      setDocZoom(next);
    },
    attachKey: docZoomGestureAttachKey,
  });

  // A preview's paper fitted to its window (shared with the print surface).
  usePreviewPageFitZoom(previewMode, wrapperRef, usableEditor, editorHydrated, setDocZoom);

  // On a touch screen (an iPad held upright, Split View) a page wider than
  // the window opens fitted to it, as a note-taking app shows a page whole:
  // at 100% the paper ran past the window's right edge, and its right margin
  // could not be written on. Never enlarged past 100%; refitted as the
  // window turns or is resized, until the reader zooms (any +/-, the dial,
  // a pinch, a fit mode): from then on their zoom is theirs.
  const docZoomNowRef = useRef(docZoom);
  useEffect(() => {
    docZoomNowRef.current = docZoom;
  }, [docZoom]);
  // Web Layout wraps against the window: there is no paper to fit.
  const layoutViewModeNowRef = useRef(documentLayoutViewMode);
  useEffect(() => {
    layoutViewModeNowRef.current = documentLayoutViewMode;
  }, [documentLayoutViewMode]);
  useEffect(() => {
    if (previewMode || initialZoom !== undefined || !deviceHasTouch()) return;
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    let fitted: number | null = null;
    let done = false;
    const fit = () => {
      if (done || layoutViewModeNowRef.current !== "print") return;
      // The reader zoomed since the last fit: their zoom stays.
      if (fitted !== null && Math.abs(docZoomNowRef.current - fitted) > 0.005) {
        done = true;
        observer.disconnect();
        return;
      }
      const sheet = wrapper.querySelector<HTMLElement>(
        ".note-editor-content > article[data-page-sheet]",
      );
      // The width the page can take: the wrapper's, less its own padding
      // (measured with it, the fitted page ran 3px past the window's edge).
      const style = getComputedStyle(wrapper);
      const available =
        wrapper.clientWidth -
        (Number.parseFloat(style.paddingLeft) || 0) -
        (Number.parseFloat(style.paddingRight) || 0);
      const paper = sheet?.offsetWidth ?? 0;
      if (available <= 0 || !paper) return;
      const next = Math.min(
        EDITOR_ZOOM_DEFAULT,
        fitPageWidthZoom(available, paper, PREVIEW_PAGE_WIDTH_INSET_PX, MULTIPLE_PAGES_FIT_ZOOM_BOUNDS),
      );
      fitted = next;
      docZoomNowRef.current = next;
      setDocZoom((current) => (Math.abs(current - next) < 0.005 ? current : next));
    };
    const observer = new ResizeObserver(() => fit());
    fit();
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [previewMode, initialZoom, usableEditor, editorHydrated]);

  // ---- Render -------------------------------------------------------------

  // The surface's readiness (laid out, faces in, pictures loaded), shared
  // with the print surface (native-document/paged/useDocumentSurfaceReadiness).
  useDocumentSurfaceReadiness({
    editor,
    editorHydrated,
    autosaveLoading: autosave.loading,
    guestMode,
    previewMode,
    pageId,
    guestContentRevision,
    initialContent,
    onSurfaceReadinessChange,
  });

  if (documentContentIssue || (previewMode && initialContent?.type !== "doc")) {
    const message = documentContentIssue === "unsupported_document_attrs"
      ? t("editor.contentIssueNewerVersion")
      : t("editor.contentIssueInvalid");
    return (
      <div
        className="note-editor-import-error"
        data-content-issue={documentContentIssue}
        data-testid="note-editor-content-error"
        role="alert"
      >
        {message}
      </div>
    );
  }

  // An automatically retried network save must not take the document's focus.
  // Import, validation, authority and conflict handling keep their own notices.
  // Neither may a save this editor could not hand to the collaborative model
  // (page_causal_capture_failed): no server verdict refused the work, the
  // draft is kept locally, and the window-modal report made the whole window
  // body inert, so every key typed after it went to whatever else held focus
  
  const showSaveFailureAutomatically = Boolean(importError) || (
    autosave.isLastSaveFailureRetryable?.() !== true &&
    !(autosave.error && getLastSaveFailureCode?.() === "page_causal_capture_failed"));

  if (!guestMode && !autosave.loading && autosave.error && !autosave.page) {
    return (
      <div
        className="note-editor-import-error"
        data-testid="note-editor-load-error"
        role="alert"
      >
        <span>{autosave.error}</span>{" "}
        <button
          className="note-editor-import-button"
          type="button"
          onClick={() => void autosave.reload()}
        >
          {t("pages.conflictRetry")}
        </button>
      </div>
    );
  }

  const hydrationFailureOwner = hydrationApplyAttemptsRef.current;
  if (
    hydrationFailure &&
    hydrationFailureOwner?.pageId === pageId &&
    hydrationFailureOwner.reloadNonce === autosave.reloadNonce
  ) {
    const message =
      hydrationFailure === "set_content_unavailable"
        ? t("editor.hydrationUnavailable")
        : t("editor.hydrationRejected");
    return (
      <div
        className="note-editor-import-error"
        data-testid="note-editor-hydration-error"
        role="alert"
      >
        <span>{message}</span>{" "}
        <button
          className="note-editor-import-button"
          type="button"
          data-testid="note-editor-hydration-retry"
          onClick={retryDocumentHydration}
        >
          {t("pages.conflictRetry")}
        </button>
      </div>
    );
  }

  if (canonicalFailure && !editorHydrated && !autosave.loading) {
    return (
      <div
        className="note-editor-import-error"
        data-testid="note-editor-model-error"
        role="alert"
      >
        <span>{t("editor.hydrationUnavailable")}</span>{" "}
        <button
          className="note-editor-import-button"
          type="button"
          data-testid="note-editor-model-retry"
          // A new read of the page prepares the model again.
          onClick={() => void autosave.reload()}
        >
          {t("pages.conflictRetry")}
        </button>
      </div>
    );
  }

  if (
    !usableEditor ||
    !editorHydrated ||
    (!guestMode && autosave.loading) ||
    !documentOfficeDataSettled
  ) {
    return (
      <EditorLoadingState
        kind="document"
        label={t("common.loadingDocument")}
        testId="note-editor-loading"
      />
    );
  }

  return (
    <PageIdProvider pageId={pageId}>
      {/* Docs' task panes (Styles, Comments, Track Changes, Navigation...)
          wear the dialogs' chrome, as the workbook's do, and so do the
          dialogs the editor opens outside the toolbar (Bookmark, Cross-
          reference, the Styles pane's New Style and Options). */}
      <OfficeDialogChromeProvider tone="document">
      <OfficeTaskPaneChromeProvider tone="document">
      <OfficeScreenTipProvider scope="document">
      <DocumentWorkbookPersistenceContext.Provider value={workbookPersistence}>
      <DocumentTaskPaneDocksContext.Provider value={taskPaneDocks}>
      <div
        ref={wrapperRef}
        className={[
          "note-editor-wrapper",
          dragActive
            ? `is-drag-active ${officeFileDropClassNames.activeTarget}`
            : null,
          !previewMode && chromeReveal ? "note-editor--reveal-chrome" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-document-surface-mode={previewMode ? "preview" : "editor"}
        data-ink-paper={inkPaper ?? undefined}
        data-document-reading-view={readingViewActive ? "true" : undefined}
        onBeforeInputCapture={previewMode ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onPasteCapture={previewMode ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onCutCapture={previewMode ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onDropCapture={previewMode ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onDragOverCapture={previewMode ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        onContextMenuCapture={previewMode ? (event) => event.stopPropagation() : undefined}
        onClickCapture={previewMode ? (event) => {
          if (event.target instanceof Element && event.target.closest("button,input,textarea,select,[role='button']")) {
            event.preventDefault(); event.stopPropagation();
          }
        } : undefined}
        onKeyDownCapture={previewMode ? (event) => {
          const key = event.key.toLowerCase();
          const reading = ["arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end", "pageup", "pagedown", "tab", "escape", "shift", "control", "meta", "alt"].includes(key) ||
            ((event.ctrlKey || event.metaKey) && !event.altKey && ["a", "c", "f"].includes(key));
          if (!reading) { event.preventDefault(); event.stopPropagation(); }
        } : undefined}
        onKeyDown={previewMode ? undefined : (event) => {
          // Undo / Redo / Select All from anywhere in the document window, as
          // in Word:
          // with focus on a ribbon control or a pane the key is not the
          // editor's, and the browser's own Undo (WebKit drains its whole
          // native stack in one press) must not run in its place. Text
          // fields and the editors keep their own handling.
          if (event.defaultPrevented || !usableEditor) return;
          const shortcut = historyShortcut(event);
          if (!shortcut) return;
          const target = event.target instanceof HTMLElement ? event.target : null;
          // An open header / footer story that had nothing of its own to
          // undo or redo (its keymap let the key through): Word's Undo is
          // one stack across the stories, so the body's last change is next.
          const story = headerFooterContext?.storyEditor;
          if (
            shortcut !== "selectAll" &&
            story &&
            !story.isDestroyed &&
            target &&
            story.view.dom.contains(target)
          ) {
            event.preventDefault();
            runDocumentShortcut(usableEditor, shortcut);
            return;
          }
          if (target?.closest("input, textarea, select") || target?.isContentEditable) return;
          event.preventDefault();
          runDocumentShortcut(usableEditor, shortcut);
        }}
        // No native drag starts outside the document's own text (ProseMirror
        // keeps its drag of words and objects): the page chrome, header and
        // footer layers, previews and panes start none, so Safari has no
        // stray selection or picture to drag as a grey ghost, after which an
        // aborted drag left the page hit-testing off what it drew
        // (lib/native-drag-guard).
        onDragStartCapture={refuseDocumentStrayNativeDrag}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-document-page-id={pageId}
        data-testid="note-editor-wrapper"
      >
        {/* Utility row — status on the left, everything else compact icons on
            the right. The old standalone export bar lives here as one 导出 ▾
            menu so the chrome stays a single slim line. */}

        {/* A document too large to edit here opens as a read-only preview of
            its leading blocks (services/resources/oversized_import). The
            server already refuses every write; this says why, and offers the
            untouched original. */}
        {documentPartsPage ? (
          <DocumentPartsNotice
            state={documentParts.state}
            writable={editorMayEditBase}
            onDismissRefused={documentParts.dismissRefusedText}
          />
        ) : oversizedImport ? (
          <OfficePartsOversizedImportNotice pageId={pageId} preview={oversizedImport} />
        ) : isDocumentPasswordLocked(documentProtection) && !isDocumentFormsProtected(documentProtection) ? (
          // A Word file protected with a password opens read-only, as Word's
          // Read Only does: the server refuses every write; this says why and
          // offers the file as it is, protection and all. (One restricted to
          
          <OversizedImportNotice
            pageId={pageId}
            format="docx"
            testIdPrefix="document-protected"
            title={t("protectedImport.title")}
            body={t(
              rangeExceptionsEditable
                ? "protectedImport.documentRegionsBody"
                : isDocumentCommentOnlyProtected(documentProtection)
                  ? "protectedImport.documentCommentsBody"
                  : "protectedImport.documentBody",
            )}
          />
        ) : null}

        {/* Every report of this window that opens by itself is `passive`:
            in the window's corner, the page live and the keyboard where it
            was, as Word's message bar (one opening as a dialog made the
            window inert and took every key typed after it). */}
        {importError || (autosave.error && !autosave.hasConflict) ? (
          <WindowNotice
            passive
            title={t(importError ? "documentIssues.title" : "pages.saveFailed")}
            scopeKey={`${pageId}:${importError || ""}:${autosave.error || ""}:${showSaveFailureAutomatically}`}
            autoOpen={showSaveFailureAutomatically}
            label={showSaveFailureAutomatically ? undefined : t("pages.saveFailed")}
          >
            {importError ? (
              <div className="note-editor-import-error" role="alert">
                {importError}
              </div>
            ) : null}

            {autosave.error && !autosave.hasConflict ? (
              <div
                className="note-editor-import-error"
                data-testid="note-editor-save-error"
                role="alert"
              >
                {autosave.error}
              </div>
            ) : null}
          </WindowNotice>
        ) : null}

        {!previewMode && workspaceOverQuota ? (
          <WindowNotice
            passive
            title={t("pages.storageFull.title")}
            label={t("pages.storageFull.title")}
            description={t("pages.storageFull.body")}
            scopeKey={`${pageId}:storage-full`}
            autoOpen
            testId="document-storage-full-notice"
          >
            <p role="status">{t("pages.storageFull.body")}</p>
          </WindowNotice>
        ) : null}
        {!previewMode && (docsCatchingUp || autosave.closingEditsPending) ? (
          <WindowNotice
            passive
            title={t("pages.catchingUp.title")}
            label={t("pages.catchingUp.title")}
            description={t("pages.catchingUp.description")}
            scopeKey={`${pageId}:catching-up`}
            autoOpen
            testId="document-catching-up-notice"
          >
            <span />
          </WindowNotice>
        ) : null}
        {!previewMode && docsOfferedCopies.length > 0 ? (
          <WindowNotice
            passive
            title={t("pages.recoveredCopy.title")}
            label={t("pages.recoveredCopy.title")}
            description={t("pages.recoveredCopy.body")}
            scopeKey={`${pageId}:recovered-copy:${docsOfferedCopies.map((copy) => copy.slot).join(",")}`}
            autoOpen
            testId="document-recovered-copy-notice"
          >
            <ul data-testid="document-recovered-copies" className={windowNoticeStyles.list}>
              {docsOfferedCopies.map((copy) => (
                <li key={copy.slot} data-testid="document-recovered-copy" data-slot={copy.slot} className={windowNoticeStyles.issue}>
                  <p>{t("pages.recoveredCopy.savedAt", { time: new Date(copy.savedAt).toLocaleString(pageInterfaceLocale()) })}</p>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovered-copy-restore"
                    disabled={autosave.readOnly}
                    onClick={() => {
                      const target = paginationEditorRef.current;
                      const base = copy.payload.extra?.[AUTORECOVER_BASE_KEY];
                      // Merged against the page it was kept from: only what it
                      // held beyond that page comes in, a block both changed kept twice.
                      if (!target || !adoptRecoveredDocumentContent(target, copy.payload.content, false,
                        base && typeof base === "object" ? base : undefined)) {
                        toast({ title: t("pages.recoveredCopy.restoreFailed"), variant: "destructive" });
                        return;
                      }
                      void deleteAutoRecoverCopy(pageId, copy.slot);
                      setDocsOfferedCopies((list) => list.filter((entry) => entry.slot !== copy.slot));
                      void (saveSettledCurrentDocumentRef.current?.() ?? autosave.saveNow());
                    }}>{t("pages.recoveredCopy.restore")}</button>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovered-copy-delete"
                    onClick={() => {
                      void deleteAutoRecoverCopy(pageId, copy.slot);
                      setDocsOfferedCopies((list) => list.filter((entry) => entry.slot !== copy.slot));
                    }}>{t("pages.recoveredCopy.delete")}</button>
                </li>
              ))}
            </ul>
          </WindowNotice>
        ) : null}
        {!previewMode && docsConflicts.length > 0 ? (
          <WindowNotice
            passive
            title={t("pages.recoveryConflicts.title", { count: docsConflicts.length })}
            label={t("pages.recoveryConflicts.title", { count: docsConflicts.length })}
            description={t("pages.recoveryConflicts.body")}
            scopeKey={`${pageId}:recovery-conflicts`}
            testId="document-recovery-conflicts-notice"
          >
            <ul data-testid="document-recovery-conflicts" className={windowNoticeStyles.list}>
              {docsConflicts.map((pair, index) => (
                <li key={pair.copy} data-testid="document-recovery-conflict" className={windowNoticeStyles.issue}>
                  <p>{t("pages.recoveryConflicts.item", { number: index + 1 })}</p>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovery-conflict-show-kept"
                    onClick={() => revealDocsBlock(pair.kept)}>{t("pages.recoveryConflicts.showKept")}</button>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovery-conflict-show-copy"
                    onClick={() => revealDocsBlock(pair.copy)}>{t("pages.recoveryConflicts.showCopy")}</button>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovery-conflict-delete-kept"
                    disabled={autosave.readOnly}
                    onClick={() => settleDocsConflict(pair, "kept")}>{t("pages.recoveryConflicts.deleteKept")}</button>
                  <button type="button" className={windowNoticeStyles.action} data-testid="document-recovery-conflict-delete-copy"
                    disabled={autosave.readOnly}
                    onClick={() => settleDocsConflict(pair, "copy")}>{t("pages.recoveryConflicts.deleteCopy")}</button>
                </li>
              ))}
            </ul>
            <button type="button" className={windowNoticeStyles.action} data-testid="document-recovery-conflicts-keep-both"
              onClick={() => { for (const pair of docsConflicts) settleDocsConflict(pair, null); }}>
              {t("pages.recoveryConflicts.keepBoth")}
            </button>
          </WindowNotice>
        ) : null}
        {!previewMode && (docsSessionHeld || docsAccountChanged) ? (
          <WindowNotice
            passive
            title={t("pages.signedOut.title")}
            label={t("pages.signedOut.title")}
            description={docsAccountChanged ? t("pages.signedOut.accountChanged") : t("pages.signedOut.body")}
            scopeKey={`${pageId}:signed-out:${docsAccountChanged ? "account" : "held"}`}
            autoOpen
            testId="document-signed-out-notice"
          >
            <div role="alert">
              {docsReauthPopupBlocked ? (
                <p>
                  {t("pages.signedOut.popupBlocked")}{" "}
                  <a href={reauthLoginUrl()} target="_blank" rel="noopener">{t("pages.signedOut.openSignIn")}</a>
                </p>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {docsAccountChanged ? (
                  <button type="button" className={windowNoticeStyles.action} onClick={() => reloadWebPage("note_editor_notice")}>
                    {t("pages.signedOut.reload")}
                  </button>
                ) : (
                  <button type="button" className={windowNoticeStyles.action} onClick={signInToSaveDocument}
                    data-testid="document-sign-in">
                    {t("pages.signedOut.signIn")}
                  </button>
                )}
              </div>
            </div>
          </WindowNotice>
        ) : null}
        {!previewMode && pageFullPercent !== null ? (
          <WindowNotice
            passive
            title={t("pages.nearlyFull.title")}
            label={t("pages.nearlyFull.title")}
            description={t("pages.nearlyFull.body", { percent: pageFullPercent })}
            scopeKey={`${pageId}:nearly-full:${pageFullPercent >= 95 ? "95" : "80"}:${pageSplitUnavailable ? "bound" : "parts"}`}
            autoOpen={pageSplitUnavailable}
            testId="document-nearly-full-notice"
          >
            <p role="status">{t("pages.nearlyFull.body", { percent: pageFullPercent })}</p>
          </WindowNotice>
        ) : null}
        {!previewMode && autosave.blockedRecoveryDraft && unsentDraftAdoptFailed ? (
          <WindowNotice
            passive
            title={t("pages.unsentDraft.title")}
            label={t("pages.unsentDraft.title")}
            description={t("pages.unsentDraft.body")}
            scopeKey={`${pageId}:unsent-draft`}
            autoOpen
            testId="document-unsent-draft-notice"
          >
            <div role="status">
              {unsentDraftCopy ? <p>{t("pages.unsentDraft.saved", { title: unsentDraftCopy.title })}</p> : null}
              {unsentDraftFailed ? <p role="alert">{t("pages.unsentDraft.failed")}</p> : null}
              {unsentDraftCopy ? null : (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className={windowNoticeStyles.action}
                    onClick={() => void saveUnsentDraftAsCopy()}
                    disabled={unsentDraftSaving}
                    data-testid="document-unsent-draft-save-copy"
                  >
                    {t("pages.unsentDraft.saveAsCopy")}
                  </button>
                </div>
              )}
            </div>
          </WindowNotice>
        ) : null}

        {!previewMode && upgradeHeldBy !== null ? (
          <WindowNotice
            passive
            title={t(upgradeHeldBy.some((holder) => holder.you) ? "collab.legacyRoomTitleSelf" : "collab.legacyRoomTitle")}
            label={t("collab.legacyRoomLabel")}
            autoOpen={false}
            testId="causal-upgrade-held-notice"
          >
            <p role="status">{legacyRoomHolderText(upgradeHeldBy, t)}</p>
          </WindowNotice>
        ) : null}

        {!previewMode && legacyRoomIssue?.session === collabSession &&
          legacyRoomIssue.issue === "legacy-room" ? (
          <WindowNotice
            passive
            title={t("collab.legacyRoomTitle")}
            label={t("collab.legacyRoomLabel")}
            description={t("collab.legacyRoomBody")}
            autoOpen={false}
            testId="legacy-room-notice"
          >
            <p role="status">{t("collab.legacyRoomBody")}</p>
          </WindowNotice>
        ) : null}

        {!previewMode && <PageSaveConflictBanner
          pageId={pageId}
          visible={autosave.hasConflict && !conflictMerging}
          error={autosave.error}
          details={autosave.conflictDetails}
          disabled={autosave.isSaving}
          onRetry={() => void autosave.retrySave()}
          onReload={() => void (traceDocsHandover({ step: "discard-reload", why: "conflict-notice" }),
            keepDocumentDiscardedByReload().then(() => autosave.discardLocalAndReload()))}
          onOverwrite={() => void autosave.overwriteRemote()}
          onSaveCopy={() => void autosave.saveConflictAsCopy()}
          // Docs keeps its own conflict choices as they were: no confirmation.
          confirmDestructive={false}
          passive
        />}

        {usableEditor && collabPresenceSession ? (
          <DocumentPeerInkLayer view={usableEditor.view} awareness={collabPresenceSession.awareness} />
        ) : null}
        {usableEditor && (!previewMode || chromeLocked) ? (
          <div className="note-editor-chrome-lock" style={{ display: "contents" }}
            data-chrome-locked={chromeLocked || undefined} inert={chromeLocked || undefined}>
          <DocumentToolbar
            editor={usableEditor}
            // A conflicted or cached-preview body is one the author has not
            // accepted yet: no first edit converts anything under it.
            smartArtMayConvertOnEdit={
              (!guestMode || enableGuestSmartArtOpenConversion) &&
              editorMayEdit &&
              !autosave.hasConflict &&
              !autosave.isCachedPreview
            }
            footerPortalTarget={footerPortalTarget}
            liveInkAwareness={collabSession?.awareness ?? null}
            onCircleSelection={
              !guestMode && editorMayEdit && windowId
                ? openCopilotCircle
                : undefined
            }
            circleSelectionActive={copilotCirclePage === pageId}
            onGuestAiRequest={guestMode ? onGuestAiRequest : undefined}
            docsOfficeParityV2={docsOfficeParityV2}
            documentTitle={title}
            serverExportEnabled={serverExportEnabled}
            onBeforeServerExport={saveCurrentDraftForServerExport}
            headerExtras={toolbarHeaderExtras}
            quickSave={toolbarQuickSave}
            panes={toolbarPanes}
            zoom={toolbarZoom}
            documentView={toolbarDocumentView}
            onInsertImageFiles={guestMode ? insertLocalImageFiles : importFiles}
            imageInsertBusy={importing}
            pageId={guestMode ? undefined : pageId}
            contentVersion={pageContentVersion ?? undefined}
            onBeforeVersionWrite={saveCurrentDraftForVersionWrite}
            workspaceId={workspaceId}
            onContentRestored={handleContentRestored}
            spellcheckEnabled={spellcheckOn}
            onToggleSpellcheck={toggleSpellcheck}
            autoCorrectEnabled={autoCorrectOn}
            onToggleAutoCorrect={toggleAutoCorrect}
            pagePreviewEnabled={pagePreviewOn}
            onTogglePagePreview={togglePagePreview}
            onEditBandOnPage={openBandEditorOnPage}
            headerFooterContext={headerFooterContext}
            headerFooterDocumentTextVisible={headerFooterDocumentTextVisible}
            onToggleHeaderFooterDocumentText={toggleHeaderFooterDocumentText}
            onNavigateHeaderFooter={navigateBandEditor}
            onPrintDocument={printStructural}
            {...(onGuestExportRequest ? { onGuestExportRequest } : {})}
            pasteMode={pasteMode}
            onPasteModeChange={setPasteMode}
            notebookId={
              guestMode ? undefined : (autosave.page?.notebook_id ?? null)
            }
            handwriting={handwriting !== null}
            // the pen waits with its strokes while the room opens, unless this
            // reader is known not to write here
            inkMayWaitForRoom={handwriting !== null && !(editingPageWritable.known && !editingPageWritable.writable)}
            sourcePackageBound={
              !guestMode &&
              (autosave.page?.editable_page_source?.adapter === "docx" ||
                autosave.page?.editable_page_patchback?.adapter === "docx")
            }
            {...(initialRibbonTab ? { initialRibbonTab } : {})}
          />
          </div>
        ) : null}

        {
}
        {!previewMode ? <OfficeSoftKeyboardLayer rootRef={wrapperRef} /> : null}
        { }
        {usableEditor && !previewMode ? (
          <DocumentTouchMultiSelectBar editor={usableEditor} anchorRef={wrapperRef} />
        ) : null}
        {/* A finger's selection handles on a table cell range (Word for
            iPad): on the caret's cell and on a cell selection. */}
        {usableEditor && !previewMode ? (
          <DocumentTableTouchGrips editor={usableEditor} />
        ) : null}

        {/* Floating Toolbar (the on-selection BubbleMenu). Skipped entirely in
            guest mode: (1) its AI action hits the authed AI API and would
            401-redirect a public visitor, and (2) the @tiptap/react BubbleMenu
            re-positions via getBoundingClientRect on every transaction, which
            under the marketing home-stage's CSS transform never converges and
            trips React's "Maximum update depth". Formatting stays on the top
            DocumentToolbar; guests rarely need the selection bubble. */}
        {usableEditor && !previewMode && !isHandwriting &&
          copilotCirclePage !== pageId &&
          (!guestMode || showGuestSelectionToolbar) && (
          <FloatingToolbar
            editor={usableEditor}
            pageId={pageId}
            windowId={windowId}
            guestMode={guestMode}
            notebookId={autosave.page?.notebook_id ?? null}
            documentTitle={title}
            onVisibilityChange={setEditorPopupOpen}
            prepared={preparedBubbleMenu}
            onPickStructures={
              !guestMode && editorMayEdit && windowId
                ? pickSelectionStructures
                : undefined
            }
          />
        )}

        {usableEditor && windowId && !guestMode && docsCopilotResume.resume?.parts ? (
          null
        ) : null}
        {usableEditor && windowId && !guestMode && copilotCirclePage === pageId && !docsCopilotResume.resume?.parts && (
          null
        )}

        {/* Editor + optional backlinks side panel */}
        <div
          className={`note-editor-body${
            documentSplitViewActive ? " note-editor-body--split" : ""
          }`}
          data-document-split={documentSplitViewActive || undefined}
          data-styles-panel={stylesOpen ? "open" : undefined}
        >
          {/* Features that need a repeated per-page overlay (headers, footers,
              watermarks, different-first-page bands) retain the established
              card preview. The common DOCX path stays on the single editable
              ProseMirror surface below. */}
          {detachedPagePreviewActive && usableEditor ? (
            <PagePreview
              sourceDom={editorDom(usableEditor)}
              pageSize={pageSize}
              pageMargins={pageMargins}
              pageOrientation={pageOrientation}
              customPageSize={customPageSize}
              customPageMargins={customPageMargins}
              headerText={headerText}
              footerText={footerText}
              showPageNumbers={showPageNumbers}
              pageNumberFormat={pageNumberFormat}
              pageNumberStart={pageNumberStart}
              pageNumberStartSection={pageNumberStartSection}
              watermark={watermark}
              manuscriptGrid={manuscriptGrid}
              defaultFontFamily={docDefaultFontFamily}
              defaultFontSize={docDefaultFontSize}
              defaultTextColor={docDefaultTextColor}
              defaultLineHeight={docDefaultLineHeight}
              defaultTextAlign={docDefaultTextAlign}
              characterSpacingControl={effectiveCharacterSpacingControl}
              defaultKinsoku={docDefaultKinsoku}
              strictKinsoku={docStrictKinsoku}
              defaultParagraphSpaceBefore={docDefaultSpaceBefore}
              defaultParagraphSpaceAfter={docDefaultSpaceAfter}
              defaultIndents={docDefaultIndents}
              firstPage={firstPageConfig}
              gridLinePitchPx={docGridLinePitchPx}
            />
          ) : null}
          {trackedObjectDeletionKept ? (
            <div
              key={trackedObjectDeletionKept}
              className="note-editor-revision-notice"
              data-testid="note-editor-tracked-object-deletion-kept"
              role="status"
            >
              {t("editor.trackedObjectDeletionKept")}
            </div>
          ) : null}
          <DocumentPagedSurface
            bandEditScope={bandEditScope}
            bandEditing={bandEditing}
            bandEditingSheetRule={bandEditingSheetRule}
            bandOwnsPageNumber={bandOwnsPageNumber}
            bestEffortSheetLayout={bestEffortSheetLayout}
            columnSeparator={columnSeparator}
            columnSeparatorStyle={columnSeparatorStyle}
            columns={columns}
            columnsStyle={columnsStyle}
            designCharacterStyleRule={designCharacterStyleRule}
            detachedPagePreviewActive={detachedPagePreviewActive}
            docDefaultIndents={docDefaultIndents}
            docDefaultKinsoku={docDefaultKinsoku}
            docDefaultTextAlign={docDefaultTextAlign}
            docGridInTables={docGridInTables}
            docGridLinePitchPx={docGridLinePitchPx}
            docPageViewMode={docPageViewMode}
            docStrictKinsoku={docStrictKinsoku}
            docZoom={docZoom}
            documentLayoutViewMode={documentLayoutViewMode}
            editor={editor}
            effectiveCharacterSpacingControl={effectiveCharacterSpacingControl}
            enableGuestBandEditing={enableGuestBandEditing}
            footerText={footerText}
            guestMode={guestMode}
            handlePageSurfaceMouseDown={handlePageSurfaceMouseDown}
            handwriting={handwriting}
            handwritingCoverRef={handwritingCoverRef}
            headerFooterDocumentTextVisible={headerFooterDocumentTextVisible}
            headerText={headerText}
            manuscriptGrid={manuscriptGrid}
            manuscriptGridOn={manuscriptGridOn}
            manuscriptGridStyle={manuscriptGridStyle}
            pageMargins={pageMargins}
            pageOrientation={pageOrientation}
            pageSize={pageSize}
            pageSurfaceStyle={pageSurfaceStyle}
            pictureWatermark={pictureWatermark}
            plainFooterTokens={plainFooterTokens}
            plainHeaderTokens={plainHeaderTokens}
            richBands={richBands}
            sectionBands={sectionBands}
            sheetBandBoxes={sheetBandBoxes}
            sheetBandOverlay={sheetBandOverlay}
            sheetFootnoteHooksRef={sheetFootnoteHooksRef}
            sheetFootnoteZones={sheetFootnoteZones}
            sheetNoteContinuationPages={sheetNoteContinuationPages}
            sheetPageNumbering={sheetPageNumbering}
            showPageNumbers={showPageNumbers}
            t={t}
            title={title}
            usableEditor={usableEditor}
            verticalText={verticalText}
            watermark={watermark}
            watermarkStyle={watermarkStyle}
            writingMode={writingMode}
            titleInput={!previewMode && <input
              className="sr-only"
              type="text"
              value={title}
              onChange={handleTitleChange}
              onKeyDown={handleTitleKeyDown}
              disabled={!shellControlWriteAllowed}
              aria-readonly={!shellControlWriteAllowed}
              placeholder={t("pages.untitled")}
              aria-label={t("pages.pageNameLabel")}
              tabIndex={-1}
            />}
            partsSentinel={documentPartsPage && documentParts.state.loaded + 1 < documentParts.state.count ? (
                <div
                  ref={documentParts.sentinelRef}
                  className="note-editor-parts-sentinel"
                  data-testid="note-editor-parts-sentinel"
                  contentEditable={false}
                  aria-hidden
                />
              ) : null}
            liveDraft={<LiveDraftManuscript
                editor={usableEditor}
                pageId={pageId}
                title={title}
                live={runOwnedDraft}
              />}
            bandEditLayer={shouldMountSheetBandEditLayer(
                sheetBandBoxes.length,
                guestMode,
                enableGuestBandEditing,
              ) ? (
                <SheetBandEditLayer
                  boxes={sheetBandBoxes}
                  boxStyle={sheetBandBoxStyle}
                  // A handwriting document is paper: no text area corners, and
                  // its headers and footers take no typing (ink only).
                  showCropMarks={showCropMarks && !isHandwriting}
                  bandFieldContext={sheetBandContext}
                  // Reading View shows the headers and footers and takes no
                  // typing in them: an island opened there took the words
                  // and Close dropped them, with 已保存 showing (WUA 084).
                  canEdit={editorMayEdit && !readingViewActive && !isHandwriting}
                  canEditNow={shellEventMayStart}
                  pageStarts={sheetParityPageStarts}
                  differentFirstPage={firstPageConfig.differentFirstPage}
                  differentOddEven={differentOddEvenFlag}
                  sectionFlags={
                    sectionBands || sectionStoryGraph ? sectionBandFlags : null
                  }
                  isRichBand={isRichBandVariant}
                  getBandEditMode={getBandEditMode}
                  getBandCommitRefusal={getBandCommitRefusal}
                  getBandRich={getBandRich}
                  getBandText={getBandText}
                  syncAuthoritativeStoryChanges
                  commitBandText={commitBandText}
                  commitBandRich={commitBandRich}
                  popupOpen={editorPopupOpen || drawingSelected}
                  registerDraftFlush={registerBandDraftFlush}
                  onEditingChange={changeHeaderFooterEditing}
                  storyExtensions={pluginExtensionsRef.current}
                  documentAttrs={editor?.state.doc.attrs ?? EMPTY_DOCUMENT_ATTRS}
                  onDocumentAttrsChange={forwardStoryDocumentAttrs}
                  labels={bandEditLabels}
                  isLinkedToPrevious={bandStoryLinkedToPrevious}
                />
              ) : null}
            followPill={<LiveDraftFollowPill pageId={pageId} live={runOwnedDraft} />}
          />
          {!previewMode && <>
          {documentSplitViewActive && usableEditor ? (
            <DocumentSplitView
              editor={usableEditor}
              canEdit={editorMayEdit}
              label={t("toolbar.splitView")}
            />
          ) : null}
          {!guestMode && backlinksOpen ? (
            <DocumentDockedPane docks={taskPaneDocks} pane="backlinks">
            <BacklinksPanel
              pageId={pageId}
              fetchBacklinks={(id, signal) =>
                notebookSDK.getBacklinks(id, signal)
              }
              onOpenSource={(srcId) => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("mrnote:open-page", {
                      detail: { pageId: srcId },
                    }),
                  );
                }
              }}
              onClose={closeBacklinksPanel}
            />
            </DocumentDockedPane>
          ) : null}
          {stylesOpen && usableEditor ? (
            <DocumentDockedPane docks={taskPaneDocks} pane="styles">
              <StylesPanel
                editor={usableEditor}
                onClose={closeStylesPanel}
                createRequest={stylesCreateRequest}
              />
            </DocumentDockedPane>
          ) : null}
          {outlineOpen && usableEditor ? (
            <DocumentDockedPane docks={taskPaneDocks} pane="navigation">
              <DocumentOutlinePanel
                editor={usableEditor}
                onClose={closeOutlinePanel}
                canEdit={editorMayEdit}
              />
            </DocumentDockedPane>
          ) : null}
          {null}
          {citationPickerOpen && usableEditor ? (
            <div
              className="citation-picker-overlay"
              data-testid="citation-picker-overlay"
            >
              <CitationPicker
                sources={citationSources}
                citedSourceIds={citedSourceIds}
                style={citationStyleState}
                mode={citationPickerMode}
                canWrite={editorMayEdit}
                onPickExisting={(sourceId, locator) => {
                  const commands = getEditorCommands<{
                    addCitation?: (
                      sourceId: string,
                      options?: { locator?: string },
                    ) => boolean;
                  }>(usableEditor);
                  if (
                    !executeEditorCommand(
                      commands?.addCitation,
                      sourceId,
                      locator ? { locator } : undefined,
                    )
                  ) {
                    return;
                  }
                  citationPickerReturnFocusRef.current = null;
                  setCitationPickerOpen(false);
                  usableEditor.commands.focus();
                }}
                onAddSource={(source, locator) => {
                  const commands = getEditorCommands<{
                    addCitationWithSource?: (
                      source: Partial<CslSource> & { id: string },
                      options?: { locator?: string },
                    ) => boolean;
                  }>(usableEditor);
                  if (
                    !executeEditorCommand(
                      commands?.addCitationWithSource,
                      source,
                      locator ? { locator } : undefined,
                    )
                  ) {
                    return;
                  }
                  citationPickerReturnFocusRef.current = null;
                  setCitationPickerOpen(false);
                  usableEditor.commands.focus();
                }}
                onUpsertSource={(source) => {
                  const commands = getEditorCommands<{
                    upsertSource?: (
                      source: Partial<CslSource> & { id: string },
                    ) => boolean;
                  }>(usableEditor);
                  if (!executeEditorCommand(commands?.upsertSource, source)) {
                    return;
                  }
                  setCitationSources(getSources(usableEditor.state));
                }}
                onRemoveSource={(sourceId) => {
                  const commands = getEditorCommands<{
                    removeSource?: (sourceId: string) => boolean;
                  }>(usableEditor);
                  if (!executeEditorCommand(commands?.removeSource, sourceId)) {
                    return;
                  }
                  setCitationSources(getSources(usableEditor.state));
                }}
                onSetStyle={(style) => {
                  const commands = getEditorCommands<{
                    setCitationStyle?: (style: CitationStyle) => boolean;
                  }>(usableEditor);
                  if (
                    !executeEditorCommand(commands?.setCitationStyle, style)
                  ) {
                    return;
                  }
                  setCitationStyleState(style);
                }}
                onClose={closeCitationPicker}
              />
            </div>
          ) : null}
          {crossRefPickerOpen && usableEditor ? (
            <CrossReferencePicker
              headings={crossRefHeadings}
              captions={crossRefCaptions}
              bookmarks={crossRefBookmarks}
              notes={crossRefNotes}
              numberedItems={crossRefNumberedItems}
              canInsert={editorMayEdit}
              onPickNumberedItem={(itemId, label, hyperlink, options) => {
                // Word bookmarks the numbered paragraph (a hidden _Ref
                // bookmark) and the field references that bookmark.
                const name = ensureNumberedItemBookmark(usableEditor, itemId);
                if (!name) return false;
                const inserted = insertCrossReference(
                  usableEditor,
                  name,
                  label,
                  "bookmark",
                  hyperlink,
                  options,
                  {
                    above: t("crossReference.positionAbove"),
                    below: t("crossReference.positionBelow"),
                    onPage: (page: number | string) =>
                      t("crossReference.positionOnPage", { page }),
                  },
                );
                return inserted;
              }}
              onPick={(targetAnchorId, label, targetType, hyperlink, options) => {
                if (
                  !insertCrossReference(
                    usableEditor,
                    targetAnchorId,
                    label,
                    targetType,
                    hyperlink,
                    options,
                    {
                      above: t("crossReference.positionAbove"),
                      below: t("crossReference.positionBelow"),
                      onPage: (page: number | string) =>
                        t("crossReference.positionOnPage", { page }),
                    },
                  )
                ) {
                  return false;
                }
                // Word keeps the dialog open after Insert: several references
                // are usually placed in a row, and Cancel turns into Close.
                return true;
              }}
              onClose={closeCrossReferencePicker}
            />
          ) : null}
          {null}
          {null}
          {bookmarkPanelOpen && usableEditor ? (
            <DocumentBookmarkDialog
              open
              canEdit={editorMayEdit}
              bookmarks={bookmarkList}
              onAdd={(name) => {
                const added = (
                  usableEditor.chain().focus() as unknown as {
                    setBookmark: (name: string) => { run: () => boolean };
                  }
                )
                  .setBookmark(name)
                  .run();
                if (added) setBookmarkList(readBookmarkDialogEntries(usableEditor));
                return added;
              }}
              onDelete={(name) => {
                const commands = getEditorCommands<{
                  removeBookmark?: (name: string) => boolean;
                }>(usableEditor);
                if (!executeEditorCommand(commands?.removeBookmark, name)) {
                  return false;
                }
                setBookmarkList(readBookmarkDialogEntries(usableEditor));
                return true;
              }}
              onGoTo={(name) => {
                if (name.startsWith("_")) {
                  // A hidden `_Toc…` target: select its heading's text.
                  const found: Array<{ from: number; to: number }> = [];
                  usableEditor.state.doc.descendants((node, pos) => {
                    if (found.length > 0) return false;
                    if (
                      node.type.name === "heading" &&
                      sanitizeTocAnchorId(node.attrs?.toc_anchor_id) === name
                    ) {
                      found.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
                      return false;
                    }
                    return true;
                  });
                  if (found.length === 0) return false;
                  return usableEditor
                    .chain()
                    .setTextSelection(found[0])
                    .scrollIntoView()
                    .run();
                }
                const commands = getEditorCommands<{
                  goToBookmark?: (name: string) => boolean;
                }>(usableEditor);
                const moved = executeEditorCommand(commands?.goToBookmark, name);
                if (moved) {
                  usableEditor.view.dispatch(
                    usableEditor.state.tr.scrollIntoView(),
                  );
                }
                return moved;
              }}
              onGetLink={
                onlyofficeMakesActionLinks()
                  ? (name) => requestOnlyofficeActionLink({ type: "bookmark", data: name })
                  : undefined
              }
              onClose={() => {
                setBookmarkPanelOpen(false);
                // Return focus to the editor so the caret stays usable.
                getEditorCommands<{ focus?: () => boolean }>(
                  usableEditor,
                )?.focus?.();
              }}
            />
          ) : null}
          </>}
        </div>
        {/* Both docks float over the window's edges, outside the body that
            scrolls sideways when a card would cover the page
            (documentTaskPaneDock.tsx). */}
        {!previewMode ? (
          <DocumentTaskPaneDockHost docks={taskPaneDocks} edge="left" />
        ) : null}
        <DocumentTaskPaneDockHost docks={taskPaneDocks} edge="right" />
        <DocumentCommentsCard docks={taskPaneDocks}>
          {commentsOpen && usableEditor && !previewMode ? (
            <CommentsPanel
              editor={usableEditor}
              // A comment is stored with its author's name, which every
              // collaborator reads: the person's own name, as Word writes
              // it, never this reader's "You" (every comment read "You" to
              // everyone, in the writer's language).
              author={guestMode ? null : revisionIdentity.name || collabUserName}
              focusCommentRequest={commentFocusRequest}
              newCommentRequestId={newCommentRequestId}
              onClose={closeCommentsPanel}
            />
          ) : null}
        </DocumentCommentsCard>
        {dragActive && !previewMode ? (
          <OfficeFileDropOverlay
            className="note-editor-drop-overlay"
            label={t("editor.importDrop")}
          />
        ) : null}
      </div>
      </DocumentTaskPaneDocksContext.Provider>
      </DocumentWorkbookPersistenceContext.Provider>
      </OfficeScreenTipProvider>
      </OfficeTaskPaneChromeProvider>
      </OfficeDialogChromeProvider>
    </PageIdProvider>
  );
}
