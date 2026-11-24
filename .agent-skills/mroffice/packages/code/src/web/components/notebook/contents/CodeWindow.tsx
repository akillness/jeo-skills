"use client";
/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PythonGameSurface } from "@mrnote/core/web/components/notebook/contents/PythonGameSurface.tsx";
import { useDesktopToolchainInstallHint } from "@mrnote/core/web/lib/desktop-code-toolchains.ts";
import { withoutEscapeClause } from "@mrnote/core/web/lib/touch-copy.ts";
import { useTouchMode } from "@mrnote/core/web/lib/touch-mode.ts";
import { OfficeSemanticIcon } from "@mrnote/core/web/components/office-ribbon/icons/OfficeSemanticIcon.tsx";
import { officeAutosaveLabels } from "@mrnote/core/web/lib/office-autosave-preference.ts";
import WindowNotice from "@mrnote/core/web/components/notebook/WindowNotice.tsx";
import SandboxedExtensionFrame from "@mrnote/core/web/components/extensions/SandboxedExtensionFrame.tsx";
import { buildSrcdoc } from "@mrnote/core/web/lib/extensions/sandbox-srcdoc.ts";
import { hasSharedAppContract } from "@mrnote/core/web/__cut__/md61497f029.ts";
import { buildVibeWidgetHtml, currentVibeWidgetAccent, currentVibeWidgetLocale, currentVibeWidgetTheme } from "@mrnote/core/web/__cut__/md77f80f3bd.ts";

import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Copy, Download, ExternalLink, FileCode2, FilePlus2, FileSearch, Folder, FolderOpen, ListFilter, Pencil, Redo2, RotateCcw, Search, Trash2, Upload, Undo2, WandSparkles, X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import "@mrnote/core/web/styles/note-editor.css";
import "@mrnote/core/web/styles/code-editor-touch.css";
import styles from "./CodeWindow.module.css";
import type { CodeDraftReview } from "@/lib/code-runner/code-draft-review";
import { isDoubleTap } from "@mrnote/core/web/lib/double-tap.ts";
import { fileAccessErrorMessage } from "@mrnote/core/web/lib/file-access-repair.ts";
import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";
import {CodeOutputPanel,CodeOutputDisclosure} from "./code-output/CodeOutputPanel";
import { CodeCompiledPdfPreview } from "./code-output/CodeCompiledPdfPreview";
import {
  LatexCompileReport,
  latexLogEntryLocation,
  type LatexCompileFiles,
} from "./code-output/LatexCompileReport";
import {
  LatexCompileMenuItems,
  latexCompilerLabel,
} from "./code-output/LatexCompileMenu";
import {
  LatexCompilingLabel,
  latexCompileDurationLabel,
} from "./code-output/LatexCompileTimer";
import { LatexCompileTimeoutNotice } from "./code-output/LatexCompileTimeoutNotice";
import type { PdfPageHighlight, PdfPagePoint } from "@mrnote/pdf/web/components/notebook/contents/pdf/PdfReadOnlyPage.tsx";
import { toast } from "@mrnote/core/web/hooks/use-toast.ts";
import { ToastAction } from "@mrnote/core/web/components/ui/toast.tsx";
import { MRNOTE_DOCUMENT_COMMAND_TYPE } from "@mrnote/core/web/components/console/editor/native-document/documentCommandShape.ts";
import RecoveredCopiesNotice, { recoveredCopyTime } from "@mrnote/core/web/components/notebook/RecoveredCopiesNotice.tsx";
import { deleteAutoRecoverCopy, listAutoRecoverCopies, type AutoRecoverCopy } from "@mrnote/core/web/lib/autorecover-store.ts";
import { useChangedState } from "@mrnote/core/web/hooks/useChangedState.ts";
import { CodeBinaryFilePreview } from "./CodeBinaryFilePreview";
import {
  CodeRunErrorAiAction,
  CodeRunRuntimeGuardActions,
  CodeRunErrorAiFailure,
  CodeRunProblemList,
} from "./code-output/CodeRunErrorParts";
import {
  clearPersistedPageDraft,
  useAutosavedPageDocument,
  type AutosavedPageLoadSource,
  type PageDocumentDraft,
} from "@mrnote/core/web/hooks/useAutosavedPageDocument.ts";
import { useRegisterWindowSaveStatus } from "@mrnote/core/web/components/notebook/WindowCloseGuard.tsx";
import {
  useWindowManagerActionsOptional,
  useWindowManagerSemanticStateOptional,
} from "@mrnote/core/web/components/notebook/WindowManager.tsx";
import PageSaveConflictBanner from "@mrnote/core/web/components/notebook/PageSaveConflictBanner.tsx";
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { OfficeFileDropOverlay } from "@mrnote/core/web/components/office-ribbon/OfficeFileDropOverlay.tsx";
import officeHomeRibbonStyles from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.module.css";
import type { PageItem } from "@mrnote/core/web/lib/notebook-sdk.ts";
import { showNameConflictDialog } from "@mrnote/core/web/lib/errors/name-conflict.ts";
import VersionHistoryPanel from "@mrnote/core/web/components/console/editor/VersionHistoryPanel.tsx";
import {
  createPage,
  deletePage,
  getPage,
  getPageVersion,
  listPages,
  listPageVersions,
  readNotebookPages,
  updatePage,
  type PageVersionItem,
} from "@mrnote/core/web/lib/notebook-sdk.ts";
import {
  dispatchNotebookPagesChanged,
  dispatchNotebookStorageChanged,
  dispatchNotebooksChanged,
  NOTEBOOK_PAGE_RENAMED_EVENT,
  pageRenameFromEvent,
} from "@mrnote/core/web/lib/notebook-events.ts";
import ConfirmDialog from "@mrnote/core/web/components/ui/ConfirmDialog.tsx";
import {
  CODE_CONTENT_TYPE,
  codePageContentSchema,
} from "@mrnote/core/web/lib/native-page-schemas.ts";
import CodeEditor from "./CodeEditor";
import AnsiText from "./code-output/AnsiText";
import CellOutput from "./code-output/CellOutput";
import {
  buildCodeOutputDocument,
  emptyCodeOutputDocument,
} from "./code-output/cell-output-sandbox";
import {
  compilerProblemsForExecution,
  compilerProblemsFromLatexLog,
} from "../../../lib/code-runner/compiler-diagnostics";
import {
  findLatexMagicComment,
  latexCompilerChange,
  latexCompilerChoice,
  type LatexCompilerChoice,
} from "../../../lib/code-runner/latex-compiler";
import {
  decodeLatexLog,
  parseLatexLog,
  type LatexLogEntry,
} from "../../../lib/code-runner/latex-log";
import { findTypesetPlace } from "../../../lib/code-runner/latex-sync";
import {
  OUTPUT_LOG_NAME,
  OUTPUT_SYNCTEX_NAME,
  outputFile,
} from "../../../lib/code-runner/output-files";
import {
  loadSynctexMap,
  synctexForward,
  synctexInverse,
} from "../../../lib/code-runner/synctex";
import CodeMirrorEditor, {
  type CodeEditorEditCommand,
  type CodeEditorEditCommandRequest,
  type CodeEditorEditState,
  type CodeEditorExecutionCommand,
  type CodeEditorExecutionCommandRequest,
  type CodeEditorExecutionState,
  type CodeEditorIntelligenceCommand,
  type CodeEditorIntelligenceCommandRequest,
  type CodeEditorIntelligenceState,
  type CodeEditorReviewCommand,
  type CodeEditorReviewCommandRequest,
  type CodeEditorReviewState,
  type CodeEditorViewCommand,
  type CodeEditorViewCommandRequest,
  type CodeEditorViewState,
  type CodeLineNavigationRequest,
  type CompareSource,
  type CrossFileCodeFixAction,
  type CrossFileRefactorAction,
  type CrossFileDefinitionPreview,
  type CrossFileReferenceResult,
  type ProblemEntry,
} from "./CodeMirrorEditor";
import { type CodeDebugCommand, type CodeDebugCommandRequest, type CodeDebugSessionSettlement, type CodeDebugState, type CodeDebugTestExecution } from "@/components/notebook/contents/CodeDebugPanel";
import CodeTestExplorerPanel, {
  type CodeTestReceiptFreshness,
} from "./CodeTestExplorerPanel";
import CodeRefactorPreviewPanel from "./CodeRefactorPreviewPanel";
import CodeWorkspaceCopilot, {
  CODE_COPILOT_RESUME_HOSTS,
} from "@mrnote/core/web/__cut__/mf12d2d179c.tsx";
import { usePendingCopilotResume } from "@mrnote/core/web/__cut__/m2da8b6d223.ts";
import {
  codeInlineAnchor,
  revealCodeSelectionForPrompt,
} from "@mrnote/core/web/__cut__/m8e9bda8a28.ts";
import { selectRelatedCopilotTests, type CopilotTestSource } from "@mrnote/core/web/__cut__/m35b1dd5935.ts";
import { isEditorCopilotSurfaceEnabled } from "@mrnote/core/web/__cut__/mc2523d29ba.ts";
import CodeRunTimelinePanel from "./CodeRunTimelinePanel";
import {
  CodeRibbonAction,
  CodeRibbonGroup,
  CodeRibbonMenuAction,
  CodeRibbonQuickActions,
  CodeRibbonStrip,
  codeCommandAccessibleLabel,
} from "./code-output/CodeRibbonChrome";
import { CodeRibbonIcon } from "./code-output/CodeRibbonIcons";
import { OfficeRibbonTabs } from "@mrnote/core/web/components/office-ribbon/OfficeRibbonChassis.tsx";
import {
  OfficeHomeCommandStack,
  OfficeHomeUndoRail,
} from "@mrnote/core/web/components/office-ribbon/OfficeHomeRibbon.tsx";
import InlineProposalDiff from "@mrnote/core/web/__cut__/m52ed3b935e.tsx";
import { ENABLE_CODE_PAGE_SHARED_BUFFER, ENABLE_INLINE_PROPOSAL_DIFF, USE_COLLAB_EDITING, USE_CODEMIRROR_EDITOR } from "@mrnote/core/web/lib/code-runner/editor-flags.ts";
import {
  acquireCodePageBuffer,
  type CodePageBufferAuthority,
  type CodePageBufferBinding,
  type CodePageBufferLease,
  type CodePageCommandHistory,
  type CodePageBufferSaveState,
} from "../../../lib/code-runner/code-page-buffer-session";
import { activateCodeSplitPane, closeCodeSplitView, codeSplitPaneEditorTestId, codeSplitPaneViewStateKey, createCodeSplitViewState, visibleCodeSplitPanes } from "../../../lib/code-runner/code-split-view";
import {
  PAGE_AUTHORITY_OUTAGE_GRACE_MS,
  useLastVerifiedPageCollabBinding,
  usePageWritableThroughOutages,
} from "@mrnote/core/web/lib/collab/page-writable.ts";
import { verifyDocumentCommandVersion } from "../../../lib/code-runner/document-command-version";
import {
  codeLocateLine,
  flashLocatedLineEffect,
  type DebugBreakpointLineMove,
} from "../../../lib/code-runner/editor-cm-extensions";
import { usePageLocate } from "@mrnote/core/web/hooks/usePageLocate.ts";
import type { PageLocateRequest } from "@mrnote/core/web/lib/page-locate.ts";
import {
  runJavaScript,
  type RunResult,
} from "@mrnote/core/web/lib/code-runner/js-runner.ts";
import { disposeSandboxRuntime } from "@mrnote/core/web/lib/code-runner/sandbox.ts";
import CodeConsolePanel, {
  CODE_CONSOLE_MAX_ENTRIES,
  type CodeConsoleEntry,
} from "./CodeConsolePanel";
import { transpileTypeScript } from "../../../lib/code-runner/ts-runner";
import {
  codeConsoleEmptyMessageKey,
  placeConsoleErrorFrames,
  isLuaCompileFailure,
  luaConsoleExpressionSource,
  consoleResultForDisplay,
  consoleEvaluationSource,
  promoteConsoleDeclarations,
  rubyConsoleEvaluationSource,
} from "../../../lib/code-runner/console-evaluation";
import {
  boundSearchGlobInput,
  matchesSearchGlobFilter,
  parseSearchGlobFilter,
  SEARCH_GLOB_INPUT_CHAR_LIMIT,
  searchGlobFilterIsEmpty,
} from "../../../lib/code-runner/search-globs";
import {
  interruptSql,
  runSql,
  resetSqlRuntime,
} from "../../../lib/code-runner/sql-runner";
import {
  hasPythonKernel,
  interruptPython,
  stopPlayingPythonGame,
  isPythonRuntimeReady,
  resetPythonRuntime,
  runPython,
} from "@mrnote/core/web/lib/code-runner/python-runner.ts";
import {
  interruptLua,
  resetLuaRuntime,
  runLua,
} from "../../../lib/code-runner/lua-runner";
import {
  interruptCSharp,
  prepareCSharpRuntime,
  resetCSharpRuntime,
} from "../../../lib/code-runner/csharp-runner";
import {
  getRubyRuntimeAvailability,
  interruptRuby,
  prepareRubyRuntime,
  resetRubyRuntime,
  runRuby,
  subscribeRubyRuntimeAvailability,
} from "../../../lib/code-runner/ruby-runner";
import {
  getShellRuntimeAvailability,
  interruptShell,
  prepareShellRuntime,
  resetShellRuntime,
  subscribeShellRuntimeAvailability,
} from "../../../lib/code-runner/shell-runner";
import { OutputCoalescer } from "@mrnote/core/web/lib/code-runner/output-coalescer.ts";
import {
  applyCodeCommand,
  commandHasCodeOperation,
} from "../../../lib/code-runner/code-commands";
import {
  CODE_LANGUAGE_OPTIONS,
  CODE_LANGUAGE_RUN_GROUPS,
  codeDraftLanguage,
  codeLanguageId,
  isPreviewLanguage,
  isLatexProjectTextExtension,
  languageForExtension,
  type CodeLanguageRunKind,
} from "@mrnote/core/web/lib/code-runner/languages.ts";
import { createBuiltinExecutionProviderRegistry } from "../../../lib/code-runner/builtin-execution-providers";
import {
  markCompiledDocumentCompiling,
  markCompiledDocumentStale,
  publishCompiledDocument,
  readCompiledDocument,
  retainCompiledDocument,
  revealInCompiledDocument,
  type CompiledDocumentSource,
} from "../../../lib/code-runner/compiled-document-window";
import { isCompileOnlyLanguage } from "../../../lib/code-runner/execution-artifact";
import {
  codeRuntimeGuardFindings,
  type CodeRuntimeGuardFinding,
} from "../../../lib/code-runner/code-runtime-guard";
import {
  cloudGuiCapability,
  cloudGuiCapabilityNow,
  runsInCloudGui,
  stopCloudGui,
  type CloudGuiMessage,
} from "../../../lib/code-runner/cloud-gui";
import { carriesBuildCache } from "../../../lib/code-runner/build-cache";
import {
  assembleLatexProject,
  compilesLatexProject,
  latexProjectWorkspacePath,
  latexWorkspaceProjectPath,
} from "../../../lib/code-runner/latex-project";
import {
  createLatexCompileScheduler,
  isLatexRootDocument,
  latexAutoCompileEnabled,
  setLatexAutoCompileEnabled,
  subscribeLatexAutoCompile,
  type LatexCompileGate,
  type LatexCompileScheduler,
} from "../../../lib/code-runner/latex-auto-compile";
import {
  latexCompileSource,
  latexDraftModeEnabled,
  latexFigureCacheEnabled,
  setLatexDraftMode,
  setLatexFigureCache,
  subscribeLatexDraftMode,
} from "../../../lib/code-runner/latex-draft-mode";
import {
  WORKSPACE_BINARY_ASSET_KEY,
  WORKSPACE_BINARY_LANGUAGE,
  isWorkspaceBinaryFilename,
  parseWorkspaceBinaryAsset,
  readWorkspaceBinaryAsset,
  uploadWorkspaceBinaryAsset,
  withWorkspaceBinaryAsset,
  type WorkspaceBinaryAsset,
} from "../../../lib/code-runner/workspace-binary-file";
import {
  createLanguageExecutionRequest,
  dispatchLanguageExecution,
  isLanguageExecutionAuthorityError,
  languageExecutionInputLimitKind,
  isLanguageExecutionOutputError,
  sha256ExecutionSource,
  type LanguageExecutionArtifact,
  type LanguageExecutionAvailability,
  LanguageExecutionProviderRegistry,
} from "../../../lib/code-runner/language-execution-provider";
import { isRemoteExecutionRefusal } from "../../../lib/code-runner/remote-execution-provider";
import {
  languageExecutionErrorMessageKey,
  type LanguageExecutionErrorMessageKey,
} from "@mrnote/core/web/lib/code-runner/execution-error-code.ts";
import { boundExecutionResult } from "@mrnote/core/web/lib/code-runner/execution-output-budget.ts";
import { appendCodeTestRunTimelineEntry, buildPersistedCodeTestRunTimeline, CODE_TEST_RUN_RECEIPT_KEY, CODE_TEST_RUN_TIMELINE_KEY, CODE_TEST_SOURCE_CODE_UNIT_LIMIT, CODE_TEST_WORKSPACE_FILE_LIMIT, codeTestRunTimelineEntryIsCurrent, createCodeTestDebugHarness, codeTestRunReceiptIsCurrent, createCodeTestHarness, createPersistedCodeTestRunReceipt, createPersistedCodeTestRunTimelineEntry, discoverCodeTests, isCodeTestLanguage, parseCodeTestHarnessResult, restoreCodeTestRunReceipt, restoreCodeTestRunTimeline, stripCodeTestHarnessLogs, subscribeCodeTestDebugHandoff, takeCodeTestDebugHandoff, discardCodeTestDebugHandoff, discardCodeTestDebugHandoffRequest, type CodeTestDebugHandoff, type CodeTestDiscovery, type CodeTestFile, type CodeTestResult, type CodeTestRunFileOutput, type CodeTestRunScope, type CodeTestSource, type PersistedCodeTestRunReceipt, type PersistedCodeTestRunTimelineEntry } from "../../../lib/code-runner/code-test-explorer";
import { createCodeTestJUnitReport } from "../../../lib/code-runner/code-test-report";
import {
  prepareCodeTestModules,
  type CodeTestModulePlan,
} from "../../../lib/code-runner/code-test-modules";
import {
  requestChatPrefill,
  requestCodeTestFixChatPrefill,
  requestReviewOnlyChatPrefill,
} from "@mrnote/core/web/__cut__/m809fa6700a.ts";
import {
  subscribeCodeAiFixApplied,
  subscribeCodeAiFixRunBound,
} from "@mrnote/core/web/__cut__/m2dfd655307.ts";
import {
  CODE_FILE_ACCEPT,
  CODE_SOURCE_ENCODINGS,
  CodeFileImportError,
  codeBytesForDownload,
  codeContentForDownload,
  codeExportFilename,
  codeSourceEncodingLabel,
  extensionFromCodeFilename,
  MAX_CODE_SOURCE_CHARS,
  normalizeCodeSourceEncoding,
  normalizeCodeSourceFilename,
  readImportedCodeFile,
  type CodeSourceEncoding,
  type ImportedCodeFile,
} from "../../../lib/code-runner/code-file-import";
import type { EolStyle } from "../../../lib/code-runner/editor-commands";
import { isImeCompositionKey } from "@mrnote/core/web/lib/code-runner/editor-keys.ts";
import {
  executionLineToDocumentLine,
  type ExecutionSelection,
} from "../../../lib/code-runner/execution-selection";
import { appendCodePageRunTimelineEntry, buildPersistedCodePageContent, CODE_PAGE_RUN_PROFILE_LIMIT, createCodePageRunProfile, createCodePageRunNavigation, createCodePageRunTimelineEntry, codePageRunInputIdentityIsCurrent, codePageRunProfilesShareSlot, codePageRunSourceFingerprint, codePageRunTimelineEntryToRunResult, codePageRunOutputClearedMarker, codePageRunOutputWasCleared, restoreCodePageLineEnding, restoreCodePageOutput, restoreCodePageRunNavigation, restoreCodePageRunOutputCleared, restoreCodePageRunProfiles, restoreCodePageRunTimeline, restoreCodePageRunTimelineNavigation, restoreCodePageSourceEncoding, restoreCodePageSourceFilename, removeCodePageRunProfile, saveCodePageRunProfile, type PersistedCodeRunProfile, type PersistedCodeRunNavigation, type PersistedCodeRunOutputCleared, type PersistedCodeRunTimelineEntry } from "../../../lib/code-runner/code-page-output-persistence";
import { EMPTY_CODE_DEBUG_CONFIGURATION, restoreCodeDebugConfiguration, restoreCodeDebugTimeline, type CodeDebugConfiguration, type PersistedCodeDebugTimelineEntry } from "../../../lib/code-runner/code-page-debug-persistence";
import {
  MAX_RUN_OUTPUT_SEARCH_QUERY_CHARS,
  RUN_OUTPUT_LOG_PAGE_SIZE,
  RUN_OUTPUT_PANEL_DEFAULT_PERCENT,
  RUN_OUTPUT_PANEL_MAX_PERCENT,
  RUN_OUTPUT_PANEL_MIN_PERCENT,
  buildRunOutputLogWindow,
  buildRunOutputText,
  copyRunOutputText,
  hasRunOutputContent,
  compiledDocumentFilename,
  hasRunOutputWrapTarget,
  loadRunOutputPanelPercent,
  loadRunOutputPanelVisible,
  loadRunOutputWrap,
  normalizeRunOutputPanelPercent,
  runOutputLogStartForMatch,
  runOutputItemCount,
  runOutputArtifactFilename,
  runOutputFilename,
  runOutputNeedsArtifact,
  runOutputPanelPercentForKey,
  runOutputPanelPercentFromPointer,
  resolveRunOutputPanelShortcut,
  saveRunOutputPanelPercent,
  saveRunOutputPanelVisible,
  saveRunOutputWrap,
  searchRunOutputLogs,
  type RunOutputSearchMatch,
  type RunOutputStreamFilter,
} from "../../../lib/code-runner/run-output-workbench";
import { createCellOutputExport } from "../../../lib/code-runner/cell-output-export";
import { createCodeRunArtifactExport } from "../../../lib/code-runner/code-run-artifact-export";
import { lineToOffsetRange } from "../../../lib/code-runner/codemirror-config";
import type { TracebackFrame } from "@mrnote/core/web/lib/code-runner/cell-output-format.ts";
import { isAllowedRichImageMime } from "../../../lib/code-runner/output-persistence";
import {
  downloadBlobFile,
  downloadTextFile,
  isBrowserDownloadAvailable,
} from "@mrnote/core/web/lib/download-file.ts";
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
// The Docs menu surface (Cupertino glass + its open motion) for every menu of
// the code window, as DocumentToolbar aliases it.
import {
  RibbonDropdownMenuContent,
  RibbonDropdownMenuContent as DropdownMenuContent,
  RibbonDropdownMenuSubContent as DropdownMenuSubContent,
  RibbonMenuRichRow,
} from "@mrnote/core/web/components/office-ribbon/CupertinoRibbonMenu.tsx";
import {
  OfficeRailButton,
  OfficeRailStatus,
} from "@mrnote/core/web/components/office-ribbon/OfficeEditorActionRail.tsx";
import { withOfficeCommandSearchShortcut } from "@mrnote/core/web/components/office-ribbon/OfficeCommandSearch.tsx";
import { isMacPlatform } from "@mrnote/core/web/lib/mac-platform.ts";
import {
  OfficeDialogChromeProvider,
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  OfficeTaskPane,
  OfficeTaskPaneChromeProvider,
  officeTaskPaneParts,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import workspacePanelStyles from "./CodeWorkspacePanels.module.css";
import { useBottomPanelsInset } from "./code-output/useBottomPanelsInset";
import { OFFICE_PAGE_ID_ATTRIBUTE, placeOfficeCompanionWindow, registerOfficeScrollPort, type OfficeSideBySideRun } from "@mrnote/core/web/lib/office-window-commands/index.ts";
import {
  CodeDockedPane,
  CodeTaskPaneDockHost,
  codeTaskPaneClassName,
  useCodeTaskPaneDocks,
} from "./codeTaskPaneDock";
import {
  APPLY_DOCUMENT_EDIT_COMMAND_EVENT,
  DOCUMENT_EDIT_APPLIED_EVENT,
  DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT,
  DOCUMENT_EDIT_UNDO_REQUEST_EVENT,
  dispatchDocumentEditUndoRequest,
  type DocumentEditAppliedDetail,
  type ApplyDocumentEditCommandDetail,
  type DocumentEditContext,
  type DocumentEditUndoRequestDetail,
  createDocumentEditReceipt,
  documentEditCommandMatchesTarget,
  notifyDocumentEditApplied,
  notifyDocumentEditUndoResult,
  rememberCappedSnapshot,
} from "@mrnote/docs/web/components/console/editor/native-document/documentEditEvents.ts";
import {
  createReplaceInFilesUndoSnapshot,
  findInFiles,
  findInFilesHitTarget,
  replaceInFiles,
  undoReplaceInFiles,
  type FindInFilesHit,
  type FindInFilesResult,
  type ReplaceInFilesUndoSnapshot,
  type SearchBuffer,
} from "../../../lib/code-runner/find-in-files";
import {
  boundFindQuery,
  findRegexErrorMessageKey,
  findReplacementPlanMessageKey,
  isFindReplacementPlanError,
  MAX_FIND_QUERY_CHARS,
  validateRegex,
  type FindOptions,
  type FindReplacementPlanMessageKey,
} from "../../../lib/code-runner/find-replace";
import {
  harvestOpenCodeIdentifiers,
  resolveCodeWindowCodeFixes,
  resolveCodeWindowDefinition,
  resolveCodeWindowDiagnostics,
  resolveCodeWindowHover,
  resolveCodeWindowImplementation,
  materializeCodeWindowRefactor,
  resolveCodeWindowCallHierarchy,
  resolveCodeWindowRefactors,
  resolveCodeWindowReferences,
  resolveCodeWindowRename,
  resolveCodeWindowSignatureHelp,
  resolveCodeWindowTypeDefinition,
  type CodeWindowBufferText,
  type CodeWindowRenameEdit,
} from "../../../lib/code-runner/code-window-intelligence";
import {
  buildCodeRefactorPreviewPlan,
  codeRefactorPreviewPlanIsCurrent,
  codeRefactorUndoReceiptIsCurrent,
  createCodeRefactorUndoReceipt,
  type CodeRefactorPreviewPlan,
  type CodeRefactorTargetSnapshot,
  type CodeRefactorUndoReceipt,
} from "../../../lib/code-runner/code-refactor-preview";
import { pageStoredJsonEquals } from "@mrnote/core/web/lib/page-save-acknowledgement.ts";
import {
  invertCodeTextChanges,
  type CodeTextChangesAgainst,
} from "../../../lib/code-runner/code-text-changes";
import { isUpdateDepthError } from "@mrnote/core/web/components/notebook/WindowErrorBoundary.tsx";
import { isWorkspaceLanguage } from "../../../lib/code-runner/workspace-intelligence";
import {
  codeWindowEntryId,
  collectWorkspaceProblems,
  notifyCodeWindowEdit,
  notifyCodeWindowRegistryChange,
  notifyCodeWindowSourceChange,
  registerCodeWindow,
  getOpenCodeBuffers,
  getOpenCodeWindowSnapshots,
  subscribeCodeWindowEdits,
  subscribeCodeWindowRegistry,
  subscribeCodeWindowSources,
  unregisterCodeWindow,
  type CodeWindowEntry,
  type CodeWindowProblemSeverity,
  type WorkspaceProblemSnapshot,
} from "../../../lib/code-runner/code-window-registry";
import { usePageSessionLease } from "../../../lib/code-runner/use-page-session-lease";
import {
  getPageExecutionState,
  subscribePageExecution,
  tryAcquirePageExecution,
  type PageExecutionClaim,
  type PageExecutionKind,
} from "../../../lib/code-runner/page-runtime-lease";
import {
  CODE_QUICK_OPEN_QUERY_LIMIT,
  codeQuickOpenOffset,
  filterCodeQuickOpenItems,
  parseCodeQuickOpenQuery,
  type CodeQuickOpenLocation,
  type CodeQuickOpenResult,
} from "../../../lib/code-runner/code-quick-open";
import {
  CODE_WORKSPACE_REFERENCE_KEY,
  MAX_CODE_WORKSPACE_PATH_CHARS,
  buildCodeWorkspaceCatalog,
  buildCodeWorkspaceTree,
  codePageTitleForPath,
  codeRenameInputAsTitle,
  codeWorkspaceBasename,
  codeWorkspacePathIdentity,
  normalizeCodeWorkspacePath,
  persistedCodeWorkspaceReference,
  rememberCodeWorkspaceLocation,
  replaceCodeWorkspaceBasename,
  restoreCodeWorkspacePath,
  takeCodeWorkspaceLocation,
  type CodeWorkspaceCatalog,
  type CodeWorkspaceFile,
  type CodeWorkspaceLocation,
  type CodeWorkspaceTree,
} from "../../../lib/code-runner/code-workspace";
import {
  buildCodeWorkspaceSearchProjection,
  codeWorkspacePageSearchText,
  loadCodeWorkspacePageDetails,
} from "../../../lib/code-runner/code-workspace-loader";
import {
  buildCodeWorkspaceIntelligenceProjection,
  type CodeWorkspaceIntelligenceProjection,
} from "../../../lib/code-runner/code-workspace-intelligence";
import { offsetToLineCol } from "../../../lib/code-runner/python-source";
import { useIsDark } from "@mrnote/core/web/lib/theme.ts";

const MAX_CODE_SAVE_ERROR_PREVIEW_CHARS = 512;
const CODE_COPILOT_V1_ENABLED = isEditorCopilotSurfaceEnabled("code");
/** A code page body without its text, to tell a peer's keystroke from a
 * change to the page's language, files, runs or tests. */
function codePageBodyWithoutText(contentJson: unknown): unknown {
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) {
    return contentJson ?? null;
  }
  const rest: Record<string, unknown> = { ...(contentJson as Record<string, unknown>) };
  delete rest.content;
  return rest;
}

const CODE_CONTENT_RENDER_SETTLE_MS = 180;
const CODE_CONTENT_RENDER_MAX_WAIT_MS = 2_000;
const CODE_RUN_ERROR_AI_MAX_CHARS = 4_000;
let runOutputClipboardWriteTail: Promise<void> = Promise.resolve();

type CodeWorkspaceMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

interface CodeWorkspaceMutationTarget {
  readonly path: string;
  readonly filename: string;
  readonly language: string;
}

/**
 * The language selector's ~90 <optgroup>/<option> elements. They depend only on
 * the static language catalogue and the locale, so this memoized component
 * reads its own translations and is skipped whenever the window re-renders for
 * a content snapshot, a save status or a caret-driven ribbon state change.
 */
const CodeLanguageSelectOptions = memo(function CodeLanguageSelectOptions() {
  const t = useTranslations("console-notebooks");
  const groupLabel: Record<CodeLanguageRunKind, string> = {
    browser: t("code.languageGroup.browser"),
    server: t("code.languageGroup.server"),
    preview: t("code.languageGroup.preview"),
    none: t("code.languageGroup.none"),
  };
  return CODE_LANGUAGE_RUN_GROUPS.map((group) => (
    <optgroup
      key={group.kind}
      label={groupLabel[group.kind]}
      data-code-language-group={group.kind}
    >
      {group.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </optgroup>
  ));
});

function resolveCodeWorkspaceMutationTarget(
  rawPath: string,
  fallbackLanguage: string,
): CodeWorkspaceMutationTarget | null {
  const normalizedPath = normalizeCodeWorkspacePath(rawPath);
  if (!normalizedPath) return null;
  const requestedBasename = codeWorkspaceBasename(normalizedPath);
  const requestedExtension = extensionFromCodeFilename(requestedBasename);
  const requestedLanguage = requestedExtension
    ? languageForExtension(requestedExtension)
    : null;
  if (requestedExtension && !requestedLanguage) {
    return isLatexProjectTextExtension(requestedExtension)
      ? { path: normalizedPath, filename: requestedBasename, language: "plaintext" }
      : null;
  }
  const language =
    requestedLanguage ?? codeLanguageId(fallbackLanguage) ?? "javascript";
  const filename = codeExportFilename(
    requestedBasename,
    requestedBasename,
    language,
  );
  const path = replaceCodeWorkspaceBasename(normalizedPath, filename);
  return path ? { path, filename, language } : null;
}

/** A binary file keeps its name as given: its extension names no language. */
function resolveWorkspaceBinaryTarget(
  rawPath: string,
  language: string,
): CodeWorkspaceMutationTarget | null {
  const path = normalizeCodeWorkspacePath(rawPath);
  return path ? { path, filename: codeWorkspaceBasename(path), language } : null;
}

function suggestedCodeWorkspacePath(
  preferredPath: string,
  occupiedPaths: ReadonlySet<string>,
): string {
  const normalized = normalizeCodeWorkspacePath(preferredPath);
  if (!normalized) return preferredPath;
  if (!occupiedPaths.has(codeWorkspacePathIdentity(normalized))) {
    return normalized;
  }
  const slash = normalized.lastIndexOf("/");
  const directory = slash >= 0 ? `${normalized.slice(0, slash + 1)}` : "";
  const basename = codeWorkspaceBasename(normalized);
  const dot = basename.lastIndexOf(".");
  const stem = dot > 0 ? basename.slice(0, dot) : basename;
  const extension = dot > 0 ? basename.slice(dot) : "";
  for (let index = 2; index <= 10_000; index += 1) {
    const candidate = normalizeCodeWorkspacePath(
      `${directory}${stem}-${index}${extension}`,
    );
    if (
      candidate &&
      !occupiedPaths.has(codeWorkspacePathIdentity(candidate))
    ) {
      return candidate;
    }
  }
  return normalized;
}

function enqueueRunOutputClipboardWrite(
  text: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const write = runOutputClipboardWriteTail.then(() =>
    isCurrent() ? copyRunOutputText(text) : false,
  );
  runOutputClipboardWriteTail = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

function codeSaveErrorPreview(error: string): string {
  if (error.length <= MAX_CODE_SAVE_ERROR_PREVIEW_CHARS) return error;
  return `${error.slice(0, MAX_CODE_SAVE_ERROR_PREVIEW_CHARS - 1)}…`;
}

function codeRunOutputNeedsStructuredArtifact(output: RunResult): boolean {
  return (
    output.notebookOutputs !== undefined ||
    Boolean(output.html) ||
    output.rich !== undefined ||
    (output.images?.length ?? 0) > 0
  );
}

function codeRunOutputCopyText(
  sourceOutput: RunResult,
  displayedOutput: RunResult,
): string {
  if (!codeRunOutputNeedsStructuredArtifact(sourceOutput)) {
    return buildRunOutputText(displayedOutput).text;
  }
  const artifact = createCellOutputExport(sourceOutput);
  return artifact.ok ? artifact.json : "";
}

function mergeCodeProblems(
  editorProblems: readonly ProblemEntry[],
  compilerProblems: readonly ProblemEntry[],
): ProblemEntry[] {
  const merged = [...editorProblems];
  const occupiedLocations = new Set(
    editorProblems.map((problem) => `${problem.line}:${problem.col}`),
  );
  for (const problem of compilerProblems) {
    const location = `${problem.line}:${problem.col}`;
    if (occupiedLocations.has(location)) continue;
    occupiedLocations.add(location);
    merged.push(problem);
  }
  return merged.sort(
    (left, right) => left.line - right.line || left.col - right.col,
  );
}

function codeProblemsPublicationSignature(
  total: number,
  problems: readonly ProblemEntry[],
): string {
  return `${total}\n${problems
    .map(
      (problem) =>
        `${problem.from}:${problem.to}:${problem.line}:${problem.col}:${problem.severity}:${problem.navigable ? 1 : 0}:${problem.message}`,
    )
    .join("\n")}`;
}

function downloadCodeSourceFile(
  filename: string,
  content: string,
  lineEnding: EolStyle,
  encoding: CodeSourceEncoding,
): boolean {
  if (encoding === "utf16le" || encoding === "utf16be") {
    const bytes = codeBytesForDownload(content, lineEnding, encoding);
    return downloadBlobFile(
      filename,
      new Blob([Uint8Array.from(bytes).buffer], {
        type: `text/plain;charset=${
          encoding === "utf16le" ? "utf-16le" : "utf-16be"
        }`,
      }),
    );
  }
  return downloadTextFile(
    filename,
    codeContentForDownload(content, lineEnding, encoding),
  );
}

function buildContent(
  language: string,
  content: string,
  output?: RunResult | null,
  debugConfiguration?: CodeDebugConfiguration | null,
  sourceFileName?: string | null,
  lineEnding?: EolStyle | null,
  sourceEncoding?: CodeSourceEncoding | null,
  runNavigation?: PersistedCodeRunNavigation | null,
  workspacePath?: string | null,
  testRunReceipt?: PersistedCodeTestRunReceipt | null,
  testRunTimeline?: readonly PersistedCodeTestRunTimelineEntry[] | null,
  runTimeline?: readonly PersistedCodeRunTimelineEntry[] | null,
  debugTimeline?: readonly PersistedCodeDebugTimelineEntry[] | null,
  runProfiles?: readonly PersistedCodeRunProfile[] | null,
  runOutputCleared?: PersistedCodeRunOutputCleared | null,
) {
  const persisted = buildPersistedCodePageContent(
    CODE_CONTENT_TYPE,
    language,
    content,
    output,
    debugConfiguration,
    sourceFileName,
    lineEnding,
    sourceEncoding,
    runNavigation,
    workspacePath,
    runTimeline,
    debugTimeline,
    runProfiles,
    runOutputCleared,
  );
  const persistedTestRunTimeline = testRunTimeline
    ? buildPersistedCodeTestRunTimeline(testRunTimeline)
    : null;
  return {
    ...persisted,
    ...(testRunReceipt
      ? { [CODE_TEST_RUN_RECEIPT_KEY]: testRunReceipt }
      : {}),
    ...(persistedTestRunTimeline
      ? {
          [CODE_TEST_RUN_TIMELINE_KEY]: persistedTestRunTimeline,
        }
      : {}),
  };
}

interface CodeSnapshot {
  language: string;
  content: string;
  debugConfiguration: CodeDebugConfiguration;
}

interface CodeReceiptSnapshot {
  before: CodeSnapshot;
  after: CodeSnapshot;
  lease: CodePageBufferLease | null;
  history: CodePageCommandHistory | null;
}

interface CodeRunNavigationState {
  source: string;
  persisted: PersistedCodeRunNavigation;
  selection: ExecutionSelection | null;
}

interface PersistedCodeOutputAuthority {
  language: string;
  source: string;
  stdin: string;
  output: RunResult;
}

/**
 * Whether a page this window loads (its own save, echoed by the save, the
 * page's room or the shared buffer) still carries the run output this window
 * holds for the same source, language and stdin. Such a load is not a reopen,
 * so the output stays: re-deriving it would drop what a reopen rightly
 * withholds, the output of a run fed from the stdin box, whose input the page
 * does not keep ("(no output)" the moment the run's own save came back).
 */
function loadCarriesHeldRunOutput(input: {
  readonly held: PersistedCodeOutputAuthority | null;
  readonly heldOutput: RunResult | null;
  readonly stdin: string;
  readonly language: string;
  readonly source: string;
  readonly loadedOutput: RunResult | null;
  readonly lastPersisted: Record<string, unknown> | null;
}): boolean {
  const { held } = input;
  if (
    !held ||
    held.output !== input.heldOutput ||
    held.language !== input.language ||
    held.source !== input.source ||
    held.stdin !== input.stdin ||
    !input.loadedOutput ||
    !input.lastPersisted
  ) {
    return false;
  }
  const persistedOutput = restoreCodePageOutput(input.lastPersisted);
  return (
    persistedOutput !== null &&
    pageStoredJsonEquals(input.loadedOutput, persistedOutput)
  );
}

interface CodeImportSnapshot extends CodeSnapshot {
  output: RunResult | null;
  outputAuthority: PersistedCodeOutputAuthority | null;
  runNavigation: CodeRunNavigationState | null;
  runTimeline: readonly PersistedCodeRunTimelineEntry[];
  runProfiles: readonly PersistedCodeRunProfile[];
  debugTimeline: readonly PersistedCodeDebugTimelineEntry[];
  sourceFileName: string | null;
  lineEnding: EolStyle;
  sourceEncoding: CodeSourceEncoding;
  workspacePath: string;
  workspacePathExplicit: boolean;
}

interface CodeVersionWriteSnapshot {
  pageId: string;
  documentRevision: number | null;
  draftFingerprint: string;
}

interface CodeVersionHydrationGuard {
  snapshot: CodeVersionWriteSnapshot;
  accepted: boolean;
  preserved: boolean;
}

interface CrossWindowReferenceTargetSnapshot {
  file: CodeWorkspaceFile;
  expectedSource: string;
}

interface CrossWindowReferenceAuthority {
  requestId: number;
  ownerPageId: string;
  ownerBufferId: string;
  ownerLanguage: string;
  ownerSource: string;
  sources: Map<string, string>;
  targets: Map<string, CrossWindowReferenceTargetSnapshot>;
}

type AvailableLanguageExecutionCapability = Extract<
  LanguageExecutionAvailability,
  { status: "available" }
>;

interface ActiveExecutionAuthority {
  readonly kind: "run" | "console";
  readonly generation: number;
  readonly pageId: string;
  readonly language: string;
  readonly source: string;
  readonly capability: AvailableLanguageExecutionCapability;
  readonly controller: AbortController;
}

interface ActiveCodeTestRuntime {
  readonly language:
    | "javascript"
    | "typescript"
    | "python"
    | "lua"
    | "ruby"
    | "bash";
  readonly sandboxOwner: string;
  readonly namespace: string;
}

interface ActiveCodeTestRunAuthority {
  readonly generation: number;
  readonly authoringGeneration: number;
  readonly runId: string;
  readonly ownerPageId: string;
  readonly catalogGeneration: number;
  readonly controller: AbortController;
  readonly claims: readonly PageExecutionClaim[];
  readonly sources: readonly CodeTestSource[];
  runtime: ActiveCodeTestRuntime | null;
}

interface CodeTestHistoryRerunRequest {
  readonly kind: "history";
  readonly entry: PersistedCodeTestRunTimelineEntry;
  readonly failedOnly: boolean;
}

interface CodeTestPostAiRerunRequest {
  readonly kind: "post_ai_fix";
  readonly sourcePageId: string;
  readonly language: "javascript" | "typescript";
  readonly failedTestIds: readonly string[];
  readonly authoringGeneration: number;
}

type CodeTestRerunRequest =
  | CodeTestHistoryRerunRequest
  | CodeTestPostAiRerunRequest;

interface PendingCodeAiFixRequest extends CodeTestPostAiRerunRequest {
  readonly requestId: string;
  readonly notebookId: string;
  readonly sourceSha256: string;
  /** Exact in-memory source that produced the failed-test receipt. */
  readonly source: string;
  readonly expiresAt: number;
  readonly runRef: string | null;
}

function codeTestSourceSnapshotsMatch(
  expected: readonly CodeTestSource[],
  current: readonly CodeTestSource[],
): boolean {
  if (expected.length !== current.length) return false;
  const currentByPageId = new Map(
    current.map((source) => [source.pageId, source] as const),
  );
  return expected.every((source) => {
    const candidate = currentByPageId.get(source.pageId);
    return Boolean(
      candidate &&
        candidate.path === source.path &&
        candidate.language === source.language &&
        candidate.contentVersion === source.contentVersion &&
        candidate.source === source.source,
    );
  });
}

interface ActiveCodeTestDebugSession {
  readonly handoff: CodeTestDebugHandoff;
  readonly authoringGeneration: number;
  readonly hydrationGeneration: number;
  readonly bufferBindingGeneration: string | null;
  readonly bufferOwner: boolean | null;
  readonly bufferId: string;
}

interface ActiveDebugTimelineAuthority {
  readonly pageId: string;
  readonly language: string;
  readonly source: string;
  readonly viewStateKey: string;
  readonly authoringGeneration: number;
  readonly hydrationGeneration: number;
  readonly bufferBindingGeneration: string | null;
  readonly bufferOwner: boolean | null;
  readonly bufferId: string;
  readonly claim: PageExecutionClaim;
}

type CodeToolbarTab =
  | "home"
  | "edit"
  | "references"
  | "review"
  | "run"
  | "debug"
  | "view";

const DEFAULT_CODE_EDITOR_VIEW_STATE: CodeEditorViewState = {
  outlineOpen: false,
  problemsOpen: false,
  compareOpen: false,
  compareAvailable: false,
  minimapOn: true,
  minimapAvailable: false,
  wordWrapOn: false,
  renderWhitespaceOn: false,
  bracketColorsOn: false,
  indentGuidesOn: true,
  bracketPairGuidesOn: true,
  stickyScrollOn: false,
  stickyScrollAvailable: false,
  fontScale: 1,
  canZoomOut: true,
  canZoomIn: true,
  settingsOpen: false,
  commandPaletteOpen: false,
};

const DEFAULT_CODE_EDITOR_EDIT_STATE: CodeEditorEditState = {
  canUndo: false,
  canRedo: false,
  findOpen: false,
  canFormat: false,
  canToggleComment: false,
  cursorCount: 1,
};

const DEFAULT_CODE_EDITOR_INTELLIGENCE_STATE: CodeEditorIntelligenceState = {
  canGoBack: false,
  canGoForward: false,
  symbolNavigationAvailable: false,
  referencesAvailable: false,
  referencesBusy: false,
  renameAvailable: false,
  codeActionsAvailable: false,
  typeNavigationAvailable: false,
  organizeImportsAvailable: false,
};

const DEFAULT_CODE_EDITOR_REVIEW_STATE: CodeEditorReviewState = {
  compareAvailable: false,
  compareOpen: false,
  sourceSelected: false,
  threeWayActive: false,
  changeCount: 0,
  canNavigate: false,
  canApply: false,
  canResolve: false,
  canApplyMerge: false,
};

const DEFAULT_CODE_EDITOR_EXECUTION_STATE: CodeEditorExecutionState = {
  selectedChars: 0,
  selectionCount: 0,
  currentLine: 1,
  selectedText: "",
  selectedTextTruncated: false,
  selectionFrom: null,
  selectionTo: null,
};

const DEFAULT_CODE_DEBUG_STATE: CodeDebugState = {
  debuggable: false,
  running: false,
  paused: false,
  pausedLine: null,
  currentLine: null,
  breakpointCount: 0,
  supportsDepthStepping: false,
};

interface CodeAuthoringAuthoritySnapshot {
  allowed: boolean;
  generation: number;
  /** Same-byte hydration/buffer replacement identity, when the host has one. */
  documentGeneration?: string;
  /** Stable native text/session binding, separate from debug hydration. */
  bindingGeneration?: string;
}

/**
 * Live authority for registered standalone Code windows. Registry consumers
 * can hold a `setText` callback for arbitrarily long, so render-time disabled
 * state is not a sufficient boundary for cross-window writes.
 */
const codeWindowAuthoringAuthorities = new Map<
  string,
  () => CodeAuthoringAuthoritySnapshot
>();
let codeWindowAuthoringGenerationSequence = 0;

function nextCodeWindowAuthoringGeneration(): number {
  codeWindowAuthoringGenerationSequence += 1;
  return codeWindowAuthoringGenerationSequence;
}

const NON_AUTHORING_EDIT_COMMANDS = new Set<CodeEditorEditCommand>([
  "openFind",
  "expandSelection",
  "shrinkSelection",
  "addCursorsToLineEnds",
  "addCursorAbove",
  "addCursorBelow",
  "addNextOccurrence",
]);
const AUTHORING_INTELLIGENCE_COMMANDS = new Set<CodeEditorIntelligenceCommand>([
  "rename",
  "quickFix",
  "refactor",
  "organizeImports",
]);
const AUTHORING_REVIEW_COMMANDS = new Set<CodeEditorReviewCommand>([
  "acceptCurrent",
  "acceptChange",
  "acceptBoth",
  "acceptAllChanges",
  "applyResolvedMerge",
]);

function editCommandAuthorsDocument(command: CodeEditorEditCommand): boolean {
  return !NON_AUTHORING_EDIT_COMMANDS.has(command);
}

function codeWindowAuthoritySnapshot(
  bufferId: string,
): CodeAuthoringAuthoritySnapshot | null {
  return codeWindowAuthoringAuthorities.get(bufferId)?.() ?? null;
}

function waitForRubyTestRuntime(
  namespace: string,
  signal: AbortSignal,
): Promise<boolean> {
  const current = getRubyRuntimeAvailability(namespace);
  if (current !== "checking") return Promise.resolve(current === "available");
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      unsubscribe();
      resolve(available);
    };
    const check = () => {
      const status = getRubyRuntimeAvailability(namespace);
      if (status !== "checking") finish(status === "available");
    };
    const onAbort = () => finish(false);
    try {
      unsubscribe = subscribeRubyRuntimeAvailability(namespace, check);
      signal.addEventListener("abort", onAbort, { once: true });
      prepareRubyRuntime(namespace);
      check();
      if (signal.aborted) onAbort();
    } catch {
      finish(false);
    }
  });
}

function waitForShellTestRuntime(
  namespace: string,
  signal: AbortSignal,
): Promise<boolean> {
  const current = getShellRuntimeAvailability(namespace);
  if (current !== "checking") return Promise.resolve(current === "available");
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      unsubscribe();
      resolve(available);
    };
    const check = () => {
      const status = getShellRuntimeAvailability(namespace);
      if (status !== "checking") finish(status === "available");
    };
    const onAbort = () => finish(false);
    try {
      unsubscribe = subscribeShellRuntimeAvailability(namespace, check);
      signal.addEventListener("abort", onAbort, { once: true });
      prepareShellRuntime(namespace);
      check();
      if (signal.aborted) onAbort();
    } catch {
      finish(false);
    }
  });
}

/** Test-only authority for registry stubs that do not mount a CodeWindow. */
export function _setCodeWindowAuthoringAuthorityForTest(
  pageId: string,
  windowId: string | undefined,
  allowed = true,
): void {
  const generation = nextCodeWindowAuthoringGeneration();
  codeWindowAuthoringAuthorities.set(
    codeWindowEntryId({ pageId, windowId }),
    () => ({
      allowed,
      generation,
      documentGeneration: `test:${generation}`,
    }),
  );
}

/** Test-only cleanup paired with the registry's own singleton reset. */
export function _clearCodeWindowAuthoringAuthoritiesForTest(): void {
  codeWindowAuthoringAuthorities.clear();
}

export interface CodeDebugShortcutGesture {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
}

export type CodeDebugShortcutAction =
  | CodeDebugCommand
  | "interruptRun"
  | "consume";

/**
 * Shortcut rows this window binds itself: the console chord, the output panel
 * chord, and the debugger's function keys. The editor's shortcuts reference
 * lists them only where they exist — a notebook cell has none of these.
 */
const CODE_WINDOW_HOST_SHORTCUTS = [
  "console",
  "output",
  "debugStart",
  "debugRestart",
  "debugStop",
  "debugStepOver",
  "debugStepInto",
] as const;

/**
 * Resolve VS Code-style debugger function keys without touching browser/editor
 * state. Returning `consume` means the chord is relevant but is a held-key
 * repeat or cannot advance while a run is already moving; the caller prevents
 * the browser default without enqueueing a duplicate debugger command.
 */
export function resolveCodeDebugShortcut(
  gesture: CodeDebugShortcutGesture,
  debugState: CodeDebugState,
  normalRunRunning: boolean,
): CodeDebugShortcutAction | null {
  if (isImeCompositionKey(gesture) || gesture.altKey) return null;

  if (
    gesture.key === "F5" &&
    gesture.shiftKey &&
    (gesture.metaKey || gesture.ctrlKey)
  ) {
    if (!debugState.running) return null;
    return gesture.repeat ? "consume" : "restart";
  }

  if (gesture.metaKey || gesture.ctrlKey) return null;

  if (gesture.key === "F5" && gesture.shiftKey) {
    if (debugState.running) return gesture.repeat ? "consume" : "stop";
    if (normalRunRunning) {
      return gesture.repeat ? "consume" : "interruptRun";
    }
    return null;
  }

  if (gesture.key === "F5" && !gesture.shiftKey) {
    if (!debugState.debuggable) return null;
    if (gesture.repeat) return "consume";
    if (debugState.paused) return "continue";
    if (debugState.running || normalRunRunning) return "consume";
    return "start";
  }

  if (gesture.key === "F10" && !gesture.shiftKey && debugState.paused) {
    if (gesture.repeat) return "consume";
    return debugState.supportsDepthStepping ? "stepOver" : "step";
  }

  if (gesture.key === "F11" && debugState.paused) {
    if (gesture.shiftKey && !debugState.supportsDepthStepping) return null;
    if (gesture.repeat) return "consume";
    if (gesture.shiftKey) return "stepOut";
    return debugState.supportsDepthStepping ? "stepInto" : "step";
  }

  return null;
}

function findInFilesHitKey(hit: FindInFilesHit): string {
  return `${hit.bufferId}\u0000${hit.start}:${hit.end}`;
}

/**
 * Render runner-provided rich HTML through the same sanitizer and no-network
 * document policy as code executions. The initial srcdoc is deliberately empty:
 * sanitization needs the browser DOM, so raw output is never installed during
 * SSR or the first hydrated render.
 */
function RichCodeHtmlOutput({ html, title }: { html: string; title: string }) {
  const [srcDoc, setSrcDoc] = useState(() =>
    emptyCodeOutputDocument("html"),
  );
  useEffect(() => {
    setSrcDoc(buildCodeOutputDocument(html, "html"));
  }, [html]);

  return (
    <iframe
      data-testid="code-output-html"
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      style={{
        width: "100%",
        height: 220,
        border: "0",
        background: "#fff",
      }}
    />
  );
}

/** Overleaf's compile chords, as the Run control's tooltip names them. */
const LATEX_COMPILE_SHORTCUTS_LABEL = "Ctrl/Cmd+Enter, Ctrl/Cmd+S";

/** The main file's place in a LaTeX compile's input (latex-auto-compile). */
const LATEX_MAIN_INPUT = "\u0000main";

/** An auto compile that typing overtook before it was sent (handleRun). */
class LatexAutoCompileSuperseded extends Error {
  constructor() {
    super("The automatic compile was overtaken by an edit.");
    this.name = "LatexAutoCompileSuperseded";
  }
}

/**
 * Run on an HTML page runs it under the AI window's trust boundary: the
 * document is the one a vibe window builds (buildVibeWidgetHtml) and the
 * shared SandboxedExtensionFrame embeds it with the canvas_preview CSP —
 * allow-scripts only, an opaque origin, connect-src 'none', data: images only.
 * Scripts, buttons and timers work; nothing reaches the network or this page.
 * The window.mrai bridge is inert, as in the DOM preflight: hellos get
 * mrai_host_ready and capability requests are never answered.
 */
/**
 * Whether the output on screen is still the compile that produced a document.
 * Saving the run to the page swaps in an equal output object, so identity
 * would drop the PDF the moment it arrived; a new run changes the content.
 */
function isSameCompiledOutput(a: RunResult | null, b: RunResult | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.error === b.error &&
    a.result === b.result &&
    a.logs.length === b.logs.length &&
    a.logs.every((line, index) => line === b.logs[index])
  );
}

export function CodeHtmlPagePreview({
  source,
  widgetId,
  title,
  blockedLabel,
  fill = false,
}: {
  source: string;
  widgetId: string;
  title: string;
  blockedLabel: string;
  /** Fill its container (a page preview's window) instead of the output panel's 420 px. */
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const built = useMemo(() => {
    const result = buildVibeWidgetHtml("html", source, [], {}, true, currentVibeWidgetTheme(), currentVibeWidgetLocale(), currentVibeWidgetAccent());
    if (!result.ok) return null;
    try {
      // The frame refuses a document carrying its own CSP meta; check here so
      // the refusal is a message instead of a render error.
      buildSrcdoc(result.html, "canvas_preview");
    } catch {
      return null;
    }
    return result.html;
  }, [source]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const target =
        containerRef.current?.querySelector("iframe")?.contentWindow ?? null;
      if (!target || event.source !== target || event.origin !== "null") {
        return;
      }
      const data = event.data as { type?: unknown } | null;
      const type = data && typeof data === "object" ? data.type : null;
      if (type === "mrai_widget_hello" || type === "mrai_shared_hello") {
        target.postMessage({ type: "mrai_host_ready" }, "*");
      }
      // mrai_capability_request stays unanswered: the preview holds no grants.
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (built === null) {
    return (
      <div
        role="alert"
        data-testid="code-html-preview-blocked"
        className={styles.outputNote}
        data-tone="error"
      >
        {blockedLabel}
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      data-testid="code-html-preview"
      className={styles.outputHtmlPreview}
      style={fill ? { height: "100%", margin: 0, borderRadius: 0, boxShadow: "none" } : undefined}
    >
      <SandboxedExtensionFrame
        widgetId={widgetId}
        widgetBodyHtml={built}
        title={title}
        width="100%"
        height="100%"
        testId="code-html-preview-frame"
        cspProfile="canvas_preview"
        onFrameLoad={(iframe) => {
          // A startup hello can race the load; announce readiness once more.
          iframe.contentWindow?.postMessage({ type: "mrai_host_ready" }, "*");
        }}
      />
    </div>
  );
}

function executionOutputForDisplay(
  output: RunResult,
  translate: (key: LanguageExecutionErrorMessageKey) => string,
): RunResult {
  if (!output.executionErrorCode) return output;
  const classification = translate(
    languageExecutionErrorMessageKey(output.executionErrorCode),
  );
  const detail = output.error?.trim() ?? "";
  const error =
    !detail ||
    detail === output.executionErrorCode ||
    detail === classification
      ? classification
      : `${classification}\n${detail}`;
  return boundExecutionResult({ ...output, error });
}

interface RunOutputNavigationAuthority {
  pageId: string;
  language: string;
  source: string;
  output: RunResult;
}

function boundedCodeRuntimeFailure(error: unknown, fallback: string): RunResult {
  let message = fallback;
  try {
    if (error instanceof Error && error.message.trim()) {
      message = error.message;
    } else if (typeof error === "string" && error.trim()) {
      message = error;
    }
  } catch {
    // Unknown/proxied failures keep the localized fallback.
  }
  return boundExecutionResult({ logs: [], error: message });
}

function sameCodePageBufferSaveState(
  left: CodePageBufferSaveState,
  right: CodePageBufferSaveState,
): boolean {
  return (
    left.saveStatus === right.saveStatus &&
    left.isDirty === right.isDirty &&
    left.isSaving === right.isSaving &&
    left.hasConflict === right.hasConflict &&
    left.error === right.error &&
    left.conflictDetails === right.conflictDetails &&
    left.contentVersion === right.contentVersion &&
    Boolean(left.retryableFailure) === Boolean(right.retryableFailure)
  );
}

// A page load reads the buffer's save state as a fresh object; one that
// reads the same keeps the state held (useChangedState) and renders nothing.
function sameNullableCodePageBufferSaveState(
  next: CodePageBufferSaveState | null,
  current: CodePageBufferSaveState | null,
): boolean {
  return (
    next !== null &&
    current !== null &&
    sameCodePageBufferSaveState(next, current)
  );
}

/** What the window reads from a buffer lease while it renders. */
function codePageBufferRenderState(lease: CodePageBufferLease): string {
  return [
    lease.getBindingGeneration(),
    lease.isOwner(),
    lease.isWritable(),
    lease.collaborationAdapter.getSnapshot().causal?.status ?? "-",
  ].join("\u0000");
}

function sharedAppTitle(source: string): string {
  try {
    const title = JSON.parse(source)?.metadata?.title;
    return typeof title === "string" ? title.trim().slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** A recovered copy's code and language, when it is a code page's body. */
function recoveredCodeOf(copy: AutoRecoverCopy): { content: string; language: string | null } | null {
  const body = copy.payload.content as { type?: unknown; content?: unknown; language?: unknown };
  if (body?.type !== CODE_CONTENT_TYPE || typeof body.content !== "string") return null;
  return { content: body.content, language: typeof body.language === "string" ? body.language : null };
}

export default function CodeWindow({
  pageId,
  windowId,
  guestMode: guestModeProp = false,
  draftReview,
  linkedWindow,
  initialCode,
  initialLanguage,
  guestDemoOutput,
  guestDemoConsoleOpen = false,
  guestDemoConsoleEntries,
  onGuestSaveRequest,
  onGuestAiRequest,
}: {
  pageId: string;
  windowId?: string;
  /**
   * When true: disables autosave/SDK fetching (enabled=false on the hook),
   * seeds the editor state from `initialCode` / `initialLanguage`, and makes
   * saves no-ops. Default behavior (guestMode=false) is byte-identical to before.
   */
  guestMode?: boolean;
  /**
   * An Agent's pending code page, reviewed before Confirm creates it
   * (windows/PageDraftCode). The page's own editor over the draft's exact
   * source (`initialCode` / `initialLanguage`): nothing is saved anywhere (the
   * guest window's seeded, unsaved buffer), the source is read-only and every
   * command that would change it is disabled. It runs as the page would:
   * browser languages in their sandbox, the others (a LaTeX compile, with its
   * PDF beside the source) on the execution service through the draft's own
   * route, which runs exactly that source and nothing else.
   */
  draftReview?: CodeDraftReview;
  /** The saved AI window a preview's source belongs to (its `pageId` is the preview's). */
  linkedWindow?: { readonly pageId: string; readonly notebookId: string; readonly conversationId?: string };
  /**
   * Optional seed code string for guest mode. Ignored when guestMode=false.
   */
  initialCode?: string;
  /**
   * Optional language id for guest mode (e.g. "typescript", "python").
   * Ignored when guestMode=false.
   */
  initialLanguage?: string;
  /** Guest-only authored output used by the marketing film. The rendered
   * surface is still CodeWindow's production output panel. */
  guestDemoOutput?: RunResult | null;
  /** Guest-only authored console state used by the marketing film. */
  guestDemoConsoleOpen?: boolean;
  guestDemoConsoleEntries?: readonly CodeConsoleEntry[];
  /**
   * Where an explicit guest save escalates, using the same contract the
   * document editor already exposes (NoteEditor's `onGuestSaveRequest`, wired
   * by its hosts to `requestGuestRegisterGate("save")`). The refusal is stated
   * in the window either way; this only adds the host's own follow-up.
   */
  onGuestSaveRequest?: () => void;
  /** Guest only: the AI button asks for an account through this. */
  onGuestAiRequest?: () => void;
}) {
  const t = useTranslations("console-notebooks");
  // A draft's review is a guest window in everything it stores (nothing),
  // and a read-only one in everything it changes.
  const guestMode = guestModeProp || draftReview !== undefined;
  const draftReviewing = draftReview !== undefined;
  const draftRemoteExecution = draftReview?.remoteExecution ?? null;
  const guestInitialLanguage = guestMode
    ? (codeLanguageId(initialLanguage) ?? "typescript")
    : "javascript";
  const isDark = useIsDark();
  const windowManagerActions = useWindowManagerActionsOptional();
  const executionOwnerNonce = useId();
  const executionOwnerId = useMemo(
    () => `code-window:${pageId}:${executionOwnerNonce}`,
    [executionOwnerNonce, pageId],
  );
  const subscribeToPageExecution = useCallback(
    (listener: () => void) => subscribePageExecution(pageId, listener),
    [pageId],
  );
  const readPageExecution = useCallback(
    () => getPageExecutionState(pageId),
    [pageId],
  );
  const readServerPageExecution = useCallback(() => null, []);
  const pageExecution = useSyncExternalStore(
    subscribeToPageExecution,
    readPageExecution,
    readServerPageExecution,
  );
  const remotePageExecution =
    pageExecution && pageExecution.ownerId !== executionOwnerId
      ? pageExecution
      : null;
  // Guest/demo code is available synchronously, so seed it in the lazy
  // initializers rather than mounting an empty editor for one paint. Durable
  // pages wait for `handleLoaded` below; that guarantees CodeMirror restores
  // selection/viewport against the authored buffer, never an empty placeholder.
  const [language, setLanguage] = useState(() =>
    guestInitialLanguage,
  );
  const [content, setContent] = useState(() =>
    guestMode ? (initialCode ?? "") : "",
  );
  // CodeMirror owns the live DOM buffer while the user types. Keep that
  // high-frequency authority in a ref so Run/Save/registry consumers see each
  // edit synchronously, while the large window shell receives a bounded,
  // coalesced render snapshot instead of rebuilding on every keystroke.
  const contentRef = useRef(content);
  const pageIdRef = useRef(pageId);
  const contentRenderGenerationRef = useRef(0);
  const contentRenderSequenceRef = useRef(0);
  const contentRenderTrailingTimerRef =
    useRef<number | null>(null);
  const contentRenderMaxTimerRef =
    useRef<number | null>(null);
  const pendingContentRenderRef = useRef<{
    readonly pageId: string;
    readonly generation: number;
    readonly sequence: number;
    readonly content: string;
  } | null>(null);
  const contentSnapshotPendingRef = useRef(false);
  const [contentSnapshotRevision, setContentSnapshotRevision] = useState(0);
  const contentSnapshotPending = contentSnapshotPendingRef.current;
  const clearContentRenderTimers = useCallback(() => {
    if (contentRenderTrailingTimerRef.current !== null) {
      window.clearTimeout(contentRenderTrailingTimerRef.current);
      contentRenderTrailingTimerRef.current = null;
    }
    if (contentRenderMaxTimerRef.current !== null) {
      window.clearTimeout(contentRenderMaxTimerRef.current);
      contentRenderMaxTimerRef.current = null;
    }
  }, []);
  const retirePendingContentRender = useCallback(() => {
    contentRenderGenerationRef.current += 1;
    contentRenderSequenceRef.current += 1;
    pendingContentRenderRef.current = null;
    clearContentRenderTimers();
    contentSnapshotPendingRef.current = false;
  }, [clearContentRenderTimers]);
  const publishPendingContentRender = useCallback(
    (expectedGeneration: number) => {
      const pending = pendingContentRenderRef.current;
      if (
        !pending ||
        pending.generation !== expectedGeneration ||
        pending.generation !== contentRenderGenerationRef.current ||
        pending.pageId !== pageIdRef.current
      ) {
        return;
      }
      clearContentRenderTimers();
      contentSnapshotPendingRef.current = false;
      // A settle timer is no user gesture: the snapshot renders with the rest
      // of this task's work. Forcing it synchronously gave every loading
      // window its own Sync commit, each leaving the other windows' work
      // pending, and with a dozen windows React counted them into "Maximum
      // update depth exceeded". Commands still flush synchronously
      // (flushPendingContentRender) and read the live text from contentRef.
      // Decided now, as the synchronous flush did: a keystroke landing before
      // the render must not retract a snapshot already published.
      if (contentRenderSequenceRef.current !== pending.sequence) return;
      setContent(pending.content);
      setContentSnapshotRevision((revision) => revision + 1);
      if (
        contentRenderGenerationRef.current === pending.generation &&
        contentRenderSequenceRef.current === pending.sequence &&
        pageIdRef.current === pending.pageId
      ) {
        pendingContentRenderRef.current = null;
      }
    },
    [clearContentRenderTimers],
  );
  const scheduleContentRender = useCallback(
    (nextContent: string) => {
      contentRef.current = nextContent;
      const generation = contentRenderGenerationRef.current;
      const sequence = contentRenderSequenceRef.current + 1;
      contentRenderSequenceRef.current = sequence;
      pendingContentRenderRef.current = {
        pageId: pageIdRef.current,
        generation,
        sequence,
        content: nextContent,
      };
      contentSnapshotPendingRef.current = true;
      if (contentRenderTrailingTimerRef.current !== null) {
        window.clearTimeout(contentRenderTrailingTimerRef.current);
      }
      contentRenderTrailingTimerRef.current = window.setTimeout(
        () => publishPendingContentRender(generation),
        CODE_CONTENT_RENDER_SETTLE_MS,
      );
      if (contentRenderMaxTimerRef.current === null) {
        contentRenderMaxTimerRef.current = window.setTimeout(
          () => publishPendingContentRender(generation),
          CODE_CONTENT_RENDER_MAX_WAIT_MS,
        );
      }
    },
    [publishPendingContentRender],
  );
  const installAuthoritativeContent = useCallback(
    (nextContent: string) => {
      retirePendingContentRender();
      contentRef.current = nextContent;
      setContent((previous) =>
        previous === nextContent ? previous : nextContent,
      );
      setContentSnapshotRevision((revision) => revision + 1);
    },
    [retirePendingContentRender],
  );
  const flushPendingContentRender = useCallback(() => {
    if (!contentSnapshotPendingRef.current) return;
    const liveContent = contentRef.current;
    contentRenderGenerationRef.current += 1;
    contentRenderSequenceRef.current += 1;
    pendingContentRenderRef.current = null;
    clearContentRenderTimers();
    contentSnapshotPendingRef.current = false;
    flushSync(() => {
      setContent(liveContent);
      setContentSnapshotRevision((revision) => revision + 1);
    });
  }, [clearContentRenderTimers]);
  const [workspacePath, setWorkspacePath] = useState(() =>
    codeExportFilename(
      null,
      draftReview?.title || pageId,
      guestInitialLanguage,
    ),
  );
  const workspacePathRef = useRef(workspacePath);
  const workspacePathExplicitRef = useRef(false);
  const [hydratedPageId, setHydratedPageId] = useState<string | null>(() =>
    guestMode ? pageId : null,
  );
  const [output, setOutput] = useState<RunResult | null>(() =>
    guestMode ? (guestDemoOutput ?? null) : null,
  );
  const outputRef = useRef(output);
  const [runErrorAiFailure, setRunErrorAiFailure] = useState<{
    readonly output: RunResult;
    readonly message: string;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadUnavailable, setDownloadUnavailable] = useState(false);
  const downloadUnavailableRef = useRef(false);
  // Only a settled/restored result is eligible for autosave. Streaming frames
  // stay visible but never leak into page persistence.
  const persistedOutputRef = useRef<RunResult | null>(null);
  const persistedOutputAuthorityRef =
    useRef<PersistedCodeOutputAuthority | null>(null);
  const persistedRunNavigationRef =
    useRef<CodeRunNavigationState | null>(null);
  const persistedRunTimelineRef =
    useRef<readonly PersistedCodeRunTimelineEntry[]>([]);
  const persistedRunOutputClearedRef =
    useRef<PersistedCodeRunOutputCleared | null>(null);
  const [runTimeline, setRunTimeline] =
    useState<readonly PersistedCodeRunTimelineEntry[]>([]);
  const [selectedRunTimelineIndex, setSelectedRunTimelineIndex] =
    useState<number | null>(null);
  const persistedRunProfilesRef =
    useRef<readonly PersistedCodeRunProfile[]>([]);
  const [runProfiles, setRunProfiles] =
    useState<readonly PersistedCodeRunProfile[]>([]);
  const runProfileRequestGenerationRef = useRef(0);
  const runAuthoringGenerationRef = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [outputWrap, setOutputWrap] = useState(() => loadRunOutputWrap());
  const [outputPanelVisible, setOutputPanelVisible] = useState(() =>
    guestMode && guestDemoOutput ? true : loadRunOutputPanelVisible(),
  );
  const [outputPanelPercent, setOutputPanelPercent] = useState(() =>
    loadRunOutputPanelPercent(),
  );
  const outputPanelPercentRef = useRef(outputPanelPercent);
  const outputPanelRestorePercentRef = useRef(
    outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT
      ? RUN_OUTPUT_PANEL_DEFAULT_PERCENT
      : outputPanelPercent,
  );
  const outputResizeActiveRef = useRef(false);
  const outputResizeMovedRef = useRef(false);
  /** The pointer that pressed the splitter: no other pointer moves it. */
  const outputResizePointerIdRef = useRef<number | null>(null);
  /** Where the press found the panel, for a cancelled drag to go back to. */
  const outputResizeStartPercentRef = useRef<number | null>(null);
  // Where on the bar the pointer took hold, so the bar does not jump to it.
  const outputResizeGrabOffsetRef = useRef(0);
  const [outputCopied, setOutputCopied] = useState(false);
  // The exact output object an HTML Run produced, so the panel can render it
  // as a page preview rather than as a runner's rich-output fragment.
  const [htmlPreviewOutput, setHtmlPreviewOutput] = useState<RunResult | null>(
    null,
  );
  // Each Run remounts the preview frame, so a re-run restarts the page.
  const [htmlPreviewGeneration, setHtmlPreviewGeneration] = useState(0);
  // A Run the browser runtime could never carry out (a tkinter window, a
  // subprocess ...): said before it starts, with the AI rewrite that plays
  // in the page (lib/code-runner/code-runtime-guard). Tied to the exact
  // output object it put on screen and the source it read.
  const [runtimeGuard, setRuntimeGuard] = useState<{
    readonly output: RunResult;
    readonly source: string;
    readonly language: string;
    readonly findings: readonly CodeRuntimeGuardFinding[];
  } | null>(null);
  // The source "Run anyway" let through once the guard named it.
  const runtimeGuardOverrideRef = useRef<string | null>(null);
  // The PDF a LaTeX compile produced, tied to the exact output object of that
  // run. It is offered only while that output is the one on screen and lives
  // in memory only: persisted output keeps the compile log, never the document.
  const [compiledDocument, setCompiledDocument] = useState<{
    readonly output: RunResult;
    readonly artifact: LanguageExecutionArtifact;
    readonly filename: string;
  } | null>(null);
  useEffect(() => {
    setCompiledDocument((current) =>
      current && !isSameCompiledOutput(current.output, output) ? null : current,
    );
  }, [output]);
  // What a LaTeX compile returned beside its output: the log and SyncTeX map
  // (on a failed compile too), the files kept for the next compile, and the
  // main file's path then, which the log's paths are relative to. Tied to that
  // output like the document, and in memory only.
  const [latexCompile, setLatexCompile] = useState<{
    readonly output: RunResult;
    readonly files: LatexCompileFiles;
    readonly mainPath: string;
    /** From Compile to the result arriving, in ms. */
    readonly durationMs: number;
    /** The plan's time limit the compile met, in ms; null when it finished. */
    readonly timedOutLimitMs: number | null;
  } | null>(null);
  // When (Date.now()) the running LaTeX compile started, for the seconds the
  // Run control, the output and the PDF window count while it runs.
  const [latexCompileStartedAt, setLatexCompileStartedAt] = useState<number | null>(null);
  // When this page compiles by itself and what a shortcut during a compile
  // does (lib/code-runner/latex-auto-compile); created below with its host.
  const latexCompileSchedulerRef = useRef<LatexCompileScheduler | null>(null);
  useEffect(() => {
    setLatexCompile((current) =>
      current && !isSameCompiledOutput(current.output, output) ? null : current,
    );
  }, [output]);
  // "Go to PDF location" in the output's own PDF (no canvas around the window).
  const [inlinePdfHighlight, setInlinePdfHighlight] = useState<{
    readonly page: number;
    readonly marks: PdfPageHighlight;
  } | null>(null);
  const inlinePdfHighlightIdRef = useRef(0);
  const latexReportRef = useRef<HTMLElement | null>(null);
  // The compile's log, read once per compile (lib/code-runner/latex-log).
  const latexLog = useMemo(() => {
    const log = outputFile(latexCompile?.files.outputFiles, OUTPUT_LOG_NAME);
    if (!log) return null;
    const text = decodeLatexLog(log.bytes);
    return { text, entries: parseLatexLog(text), omittedBytes: log.omittedBytes };
  }, [latexCompile]);
  // How long the compile on screen took, beside its status.
  const shownLatexCompileMs =
    latexCompile && output && isSameCompiledOutput(latexCompile.output, output)
      ? latexCompile.durationMs
      : null;
  // The log of the output on screen, for the Logs view and the failure card.
  const shownLatexLog =
    latexLog && latexCompile && output && isSameCompiledOutput(latexCompile.output, output)
      ? latexLog
      : null;
  // A failed compile's card lists the log's errors in every file of the
  // project, each a jump to its file and line.
  const latexCardProblems = useMemo(
    () =>
      (shownLatexLog?.entries ?? [])
        .filter((entry) => entry.level === "error")
        .map((entry, index) => ({
          from: index,
          to: index,
          line: entry.line ?? 0,
          col: 1,
          message: entry.message,
          entry,
        })),
    [shownLatexLog],
  );
  const [outputCopyBusy, setOutputCopyBusy] = useState(false);
  const outputCopyBusyRef = useRef(false);
  const [outputCopyError, setOutputCopyError] = useState<string | null>(null);
  const [outputCopyAvailable, setOutputCopyAvailable] = useState(false);
  const outputCopyRequestIdRef = useRef(0);
  const outputCopyGenerationRef = useRef(0);
  const outputCopyIdentityRef = useRef({ pageId, output });
  const outputCopyMountedRef = useRef(true);
  const [outputStreamFilter, setOutputStreamFilter] =
    useState<RunOutputStreamFilter>("all");
  // null follows the latest fixed-size page. A number anchors an older page
  // so live output cannot shift the lines while the user is investigating.
  const [outputLogStart, setOutputLogStart] = useState<number | null>(null);
  const [outputSearchOpen, setOutputSearchOpen] = useState(false);
  const [outputSearchQuery, setOutputSearchQuery] = useState("");
  const [outputSearchActiveIndex, setOutputSearchActiveIndex] = useState(0);
  const [outputSearchRevealLogIndex, setOutputSearchRevealLogIndex] = useState<
    number | null
  >(null);
  const [outputSearchRunEpoch, setOutputSearchRunEpoch] = useState(0);
  const [outputSearchAutoRevealVersion, setOutputSearchAutoRevealVersion] =
    useState(0);
  const [lastRunScope, setLastRunScope] =
    useState<ExecutionSelection | null>(null);
  // Exact full-buffer snapshot that produced the visible live output. Restored
  // output intentionally has no snapshot, and any subsequent edit makes the
  // comparison fail, so stale traceback frames remain visible but inert.
  const [tracebackNavigationSource, setTracebackNavigationSource] =
    useState<string | null>(null);
  const [runOutputNavigationAuthority, setRunOutputNavigationAuthority] =
    useState<RunOutputNavigationAuthority | null>(null);
  const runOutputNavigationAuthorityRef =
    useRef<RunOutputNavigationAuthority | null>(null);
  useLayoutEffect(() => {
    runOutputNavigationAuthorityRef.current = runOutputNavigationAuthority;
  }, [runOutputNavigationAuthority]);
  const runOutputNavigationInputRef = useRef({
    pageId,
    language,
    content,
    output,
    source: null as string | null,
  });
  useLayoutEffect(() => {
    const previous = runOutputNavigationInputRef.current;
    const next = {
      pageId,
      language,
      content,
      output,
      source: tracebackNavigationSource,
    };
    const outputOwnerChanged =
      previous.output !== output ||
      previous.source !== tracebackNavigationSource;
    const sourceOwnerChanged =
      previous.pageId !== pageId ||
      previous.language !== language ||
      previous.content !== content;
    runOutputNavigationInputRef.current = next;
    if (outputOwnerChanged) {
      setRunOutputNavigationAuthority(
        output && tracebackNavigationSource === content
          ? { pageId, language, source: content, output }
          : null,
      );
      return;
    }
    // Every content snapshot changes the source owner. Clearing an authority
    // that is already clear would still make React re-run this whole window
    // from a layout effect, so only write when there is one to retire.
    if (sourceOwnerChanged && runOutputNavigationAuthority !== null) {
      setRunOutputNavigationAuthority(null);
    }
  }, [
    content,
    language,
    output,
    pageId,
    runOutputNavigationAuthority,
    tracebackNavigationSource,
  ]);
  const [toolbarTab, setToolbarTab] = useState<CodeToolbarTab>("home");
  const [viewFontZoomOpen, setViewFontZoomOpen] = useState(false);
  const codeRunOfferedRef = useRef(false);
  codeRunOfferedRef.current = false;
  const selectToolbarTab = useCallback((nextTab: CodeToolbarTab) => {
    setViewFontZoomOpen(false);
    setToolbarTab(nextTab);
  }, []);
  // A new session's grant without Run leaves its tabs.
  useEffect(() => {
    setToolbarTab((tab) => (tab));
  }, [false]);
  const [statusBarHost, setStatusBarHost] = useState<HTMLDivElement | null>(null);
  const [splitViewState, setSplitViewState] = useState(
    createCodeSplitViewState,
  );
  const activeEditorViewStateKey = codeSplitPaneViewStateKey(
    pageId,
    splitViewState.activePane,
  );
  const activeEditorViewStateKeyRef = useRef(activeEditorViewStateKey);
  activeEditorViewStateKeyRef.current = activeEditorViewStateKey;
  const [editorViewCommandRequest, setEditorViewCommandRequest] =
    useState<CodeEditorViewCommandRequest>();
  const editorViewCommandRequestIdRef = useRef(0);
  const [editorViewState, setEditorViewState] = useState<CodeEditorViewState>(
    DEFAULT_CODE_EDITOR_VIEW_STATE,
  );
  const editorViewReportedRef = useRef<CodeEditorViewState>(
    DEFAULT_CODE_EDITOR_VIEW_STATE,
  );
  const [editorEditCommandRequest, setEditorEditCommandRequest] =
    useState<CodeEditorEditCommandRequest>();
  const editorEditCommandRequestIdRef = useRef(0);
  const [editorEditState, setEditorEditState] = useState<CodeEditorEditState>(
    DEFAULT_CODE_EDITOR_EDIT_STATE,
  );
  const editorEditReportedRef = useRef<CodeEditorEditState>(
    DEFAULT_CODE_EDITOR_EDIT_STATE,
  );
  const [editorIntelligenceCommandRequest, setEditorIntelligenceCommandRequest] =
    useState<CodeEditorIntelligenceCommandRequest>();
  const [editorIntelligenceState, setEditorIntelligenceState] =
    useState<CodeEditorIntelligenceState>(
      DEFAULT_CODE_EDITOR_INTELLIGENCE_STATE,
    );
  const editorIntelligenceReportedRef = useRef<CodeEditorIntelligenceState>(
    DEFAULT_CODE_EDITOR_INTELLIGENCE_STATE,
  );
  const [editorReviewCommandRequest, setEditorReviewCommandRequest] =
    useState<CodeEditorReviewCommandRequest>();
  const editorReviewCommandRequestIdRef = useRef(0);
  const [editorReviewState, setEditorReviewState] =
    useState<CodeEditorReviewState>(DEFAULT_CODE_EDITOR_REVIEW_STATE);
  const editorReviewReportedRef = useRef<CodeEditorReviewState>(
    DEFAULT_CODE_EDITOR_REVIEW_STATE,
  );
  const [editorExecutionCommandRequest, setEditorExecutionCommandRequest] =
    useState<CodeEditorExecutionCommandRequest>();
  const editorExecutionCommandRequestIdRef = useRef(0);
  const [editorExecutionState, setEditorExecutionState] =
    useState<CodeEditorExecutionState>(DEFAULT_CODE_EDITOR_EXECUTION_STATE);
  const editorExecutionReportedRef = useRef<CodeEditorExecutionState>(
    DEFAULT_CODE_EDITOR_EXECUTION_STATE,
  );
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const [problemsSnapshotRevision, setProblemsSnapshotRevision] = useState(0);
  const editorDiagnosticCountRef = useRef(0);
  const diagnosticCountRef = useRef(0);
  const editorProblemsRef = useRef<readonly ProblemEntry[]>([]);
  const compilerProblemsRef = useRef<readonly ProblemEntry[]>([]);
  const problemsRef = useRef<readonly ProblemEntry[]>([]);
  const registeredCodeWindowEntryRef = useRef<CodeWindowEntry | null>(null);
  const diagnosticOwner = useMemo(() => ({ pageId }), [pageId]);
  const activeDiagnosticOwnerRef = useRef<{
    readonly pageId: string;
  } | null>(diagnosticOwner);
  const problemsPublicationSignatureRef = useRef("0\n");
  const [workspaceProblemsOpen, setWorkspaceProblemsOpen] = useState(false);
  const [codeWindowRegistryRevision, setCodeWindowRegistryRevision] =
    useState(0);
  const [refactorPreviewPlan, setRefactorPreviewPlan] =
    useState<CodeRefactorPreviewPlan | null>(null);
  const [refactorUndoReceipt, setRefactorUndoReceipt] =
    useState<CodeRefactorUndoReceipt | null>(null);
  const [refactorPreviewBusy, setRefactorPreviewBusy] = useState(false);
  const refactorPreviewSequenceRef = useRef(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  // The ribbon's AI button first asks for the code: the card opens once a
  
  const [copilotPicking, setCopilotPicking] = useState(false);
  const touchMode = useTouchMode();
  
  
  const codeEditorStackRef = useRef<HTMLDivElement | null>(null);
  const [copilotAnchor, setCopilotAnchor] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    activeDiagnosticOwnerRef.current = diagnosticOwner;
    editorDiagnosticCountRef.current = 0;
    diagnosticCountRef.current = 0;
    editorProblemsRef.current = [];
    compilerProblemsRef.current = [];
    problemsRef.current = [];
    problemsPublicationSignatureRef.current = "0\n";
    setDiagnosticCount(0);
    setProblemsSnapshotRevision((revision) => revision + 1);
    return () => {
      if (activeDiagnosticOwnerRef.current !== diagnosticOwner) return;
      activeDiagnosticOwnerRef.current = null;
      editorDiagnosticCountRef.current = 0;
      diagnosticCountRef.current = 0;
      editorProblemsRef.current = [];
      compilerProblemsRef.current = [];
      problemsRef.current = [];
      problemsPublicationSignatureRef.current = "0\n";
    };
  }, [diagnosticOwner]);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenActiveIndex, setQuickOpenActiveIndex] = useState(0);
  const quickOpenInputRef = useRef<HTMLInputElement>(null);
  const quickOpenReturnFocusRef = useRef<HTMLElement | null>(null);
  const [peerSourceRevision, setPeerSourceRevision] = useState(0);
  const [workspaceIntelligenceRevision, setWorkspaceIntelligenceRevision] =
    useState(0);
  const workspaceProblemsPanelRef = useRef<HTMLElement>(null);
  const [debugPausedLine, setDebugPausedLine] = useState<number | null>(null);
  const [debugConfiguration, setDebugConfiguration] =
    useState<CodeDebugConfiguration>(EMPTY_CODE_DEBUG_CONFIGURATION);
  const persistedDebugTimelineRef =
    useRef<readonly PersistedCodeDebugTimelineEntry[]>([]);
  const [debugTimeline, setDebugTimeline] =
    useState<readonly PersistedCodeDebugTimelineEntry[]>([]);
  const [selectedDebugTimelineIndex, setSelectedDebugTimelineIndex] =
    useState<number | null>(null);
  const [debugTimelineSourceSha256, setDebugTimelineSourceSha256] =
    useState<string | null>(null);
  const debugTimelineSourceSha256Ref = useRef<string | null>(null);
  const debugTimelineSourceDigestGenerationRef = useRef(0);
  const debugTimelinePersistenceGenerationRef = useRef(0);
  const debugTimelineReplayGenerationRef = useRef(0);
  const activeDebugTimelineAuthorityRef =
    useRef<ActiveDebugTimelineAuthority | null>(null);
  const debugConfigurationRef = useRef<CodeDebugConfiguration>(
    EMPTY_CODE_DEBUG_CONFIGURATION,
  );
  const [debugCommandRequest, setDebugCommandRequest] =
    useState<CodeDebugCommandRequest>();
  const debugCommandRequestIdRef = useRef(0);
  const activeCodeTestDebugSessionRef =
    useRef<ActiveCodeTestDebugSession | null>(null);
  const codeTestDebugHydrationGenerationRef = useRef(0);
  const pendingCodeTestDebugHandoffRef = useRef<{
    readonly requestId: string;
    readonly targetPageId: string;
  } | null>(null);
  const workspaceContentVersionRef = useRef(0);
  const bufferBindingGenerationRef = useRef<string | null>(null);
  const debugViewStateKeyRef = useRef(`page:${pageId}`);
  const [debugState, setDebugState] =
    useState<CodeDebugState>(DEFAULT_CODE_DEBUG_STATE);
  const debugStateRef = useRef<CodeDebugState>(DEFAULT_CODE_DEBUG_STATE);
  const [debugLineNavigationRequest, setDebugLineNavigationRequest] =
    useState<CodeLineNavigationRequest>();
  const debugLineNavigationRequestIdRef = useRef(0);
  const requestDebugLineNavigation = useCallback(
    (line: number, focus: boolean) => {
      debugLineNavigationRequestIdRef.current += 1;
      setDebugLineNavigationRequest({
        requestId: debugLineNavigationRequestIdRef.current,
        line,
        focus,
        viewStateKey: activeEditorViewStateKeyRef.current,
      });
    },
    [],
  );
  // The state drives chrome; the ref is the synchronous lock that prevents two
  // Cmd/Ctrl+Enter gestures in the same render frame from starting overlapping
  // executions against one sandbox/kernel namespace.
  const runningRef = useRef(false);
  // Set by Recompile from scratch for the compile it starts.
  const latexFreshBuildRef = useRef(false);
  const activePageExecutionClaimRef = useRef<PageExecutionClaim | null>(null);
  const runGenerationRef = useRef(0);
  const runningLanguageRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeExecutionAuthorityRef = useRef<ActiveExecutionAuthority | null>(
    null,
  );
  const testRunGenerationRef = useRef(0);
  const testRunSequenceRef = useRef(0);
  const testRunBusyRef = useRef(false);
  const activeCodeTestRunRef = useRef<ActiveCodeTestRunAuthority | null>(null);
  const retireActiveCodeTestRunRef = useRef<(updateState: boolean) => boolean>(
    () => false,
  );
  const coalescerRef = useRef<OutputCoalescer | null>(null);
  const codeWindowRef = useRef<HTMLDivElement>(null);
  // The right-edge task pane dock (codeTaskPaneDock.tsx): Outline, Problems,
  // User snippets, the Test Explorer and Version History share it.
  const codeTaskPaneDocks = useCodeTaskPaneDocks();
  // Word's View > Window commands for code windows (lib/office-window-
  // commands, keyed by the "code" page type): New Window, Arrange All, View
  // Side by Side and Synchronous Scrolling. The primary editor's scroller is
  // this window's scroll port; the root carries the page id attribute so a
  // companion window is found once it mounts.
  const [codeScrollPort, setCodeScrollPort] = useState<HTMLElement | null>(
    null,
  );
  useEffect(() => {
    if (!codeScrollPort || !windowId || guestMode) return;
    return registerOfficeScrollPort({
      element: codeScrollPort,
      pageId,
      pageType: "code",
      windowId,
    });
  }, [codeScrollPort, guestMode, pageId, windowId]);
  const codeSideBySideRunRef = useRef<OfficeSideBySideRun | null>(null);
  useEffect(() => () => codeSideBySideRunRef.current?.cancel(), []);
  // An AI source's "Locate" (lib/page-locate.ts) on this code page: the
  // snippet (or paragraph_index read as a line number) resolves to a line,
  // which CodeMirror scrolls to the middle and flashes with the shared locate
  // tint (a line decoration: CodeMirror owns its line elements). The hook gets
  // a detached stand-in, so its own scroll and marker are inert; null while
  // the editor is not mounted or the target is not there yet (it retries).
  const resolveCodeLocateTarget = useCallback(
    (scope: Element, request: PageLocateRequest): HTMLElement | null => {
      const cmEl = scope.querySelector<HTMLElement>(
        '[data-testid="code-editor"] .cm-editor',
      );
      const view = cmEl ? EditorView.findFromDOM(cmEl) : null;
      if (!view) return null;
      const line = codeLocateLine(view.state.doc, request);
      if (line === null) return null;
      const from = view.state.doc.line(line).from;
      try {
        view.dispatch({
          effects: [
            EditorView.scrollIntoView(from, { y: "center" }),
            flashLocatedLineEffect.of(from),
          ],
        });
      } catch {
        return null;
      }
      return document.createElement("span");
    },
    [],
  );
  usePageLocate(guestMode ? null : pageId, codeWindowRef, {
    resolve: resolveCodeLocateTarget,
  });
  const outputScrollRef = useRef<HTMLDivElement>(null);
  const outputShouldFollowRef = useRef(true);
  const outputSearchInputRef = useRef<HTMLInputElement>(null);
  const outputSearchToggleRef = useRef<HTMLButtonElement>(null);
  const outputSearchFocusInputRef = useRef(false);
  const outputSearchRestoreFocusRef = useRef(false);
  const outputSearchHandledVersionRef = useRef(0);
  // Pre-supplied stdin for input()-style programs (one line per input() call).
  // Session-local — never persisted with the page.
  // Interactive console (VS Code's terminal, in a sandbox that has kernels
  // instead of a shell). Submissions take the page's run lock, so a prompt can
  // never execute alongside a file run, and they share ONE realm with each
  // other: what a line defines is still defined for the next line. Python,
  // SQL, Lua and Ruby get that from the page's runtime namespace; JavaScript
  // and TypeScript get it from a session id the sandbox keeps alive.
  const consoleSessionId = useMemo(() => `code-console:${pageId}`, [pageId]);
  const rubyConsoleSessionToken = useMemo(() => {
    // The token is session-local, but page identity is its owner boundary.
    void pageId;
    try {
      const random = new Uint32Array(4);
      globalThis.crypto.getRandomValues(random);
      return Array.from(random, (value) =>
        value.toString(16).padStart(8, "0").toUpperCase(),
      ).join("");
    } catch {
      return null;
    }
  }, [pageId]);
  const javaScriptSandboxOwner = useMemo(
    () => `code-page:${pageId}`,
    [pageId],
  );
  // A desktop Python program runs in a cloud window (cloud-gui.ts), its end
  // said in the reader's language as it is when the window closes.
  const cloudGuiTranslateRef = useRef(t);
  cloudGuiTranslateRef.current = t;
  const cloudGuiMessage = useCallback<CloudGuiMessage>(
    (key, values) => cloudGuiTranslateRef.current(`code.cloudGui.${key}`, values),
    [],
  );
  // Read once whether cloud windows are offered, so Run knows at once.
  useEffect(() => {
    if (language === "python" && !guestMode) void cloudGuiCapability();
  }, [guestMode, language]);
  const executionProviders = useMemo(
    () =>
      Object.assign(new LanguageExecutionProviderRegistry(), { dispose() {} }),
    [cloudGuiMessage, false, draftRemoteExecution, guestMode, javaScriptSandboxOwner, pageId],
  );
  const executionProviderLifecycleGenerationsRef = useRef(
    new WeakMap<object, number>(),
  );
  useSyncExternalStore(
    executionProviders.subscribe,
    executionProviders.getVersion,
    executionProviders.getVersion,
  );
  useEffect(() => {
    if (language === "ruby") prepareRubyRuntime(pageId);
    if (language === "bash") prepareShellRuntime(pageId);
    if (language === "csharp") prepareCSharpRuntime(pageId);
  }, [language, pageId]);
  useEffect(() => {
    const generations = executionProviderLifecycleGenerationsRef.current;
    const generation = (generations.get(executionProviders) ?? 0) + 1;
    generations.set(executionProviders, generation);
    return () => {
      // React Strict Mode immediately cleans up and re-runs mount effects in
      // development. Defer disposal by one microtask so that rehearsal can
      // reclaim the same registry; a real unmount or registry replacement
      // still retires the exact old provider instance.
      queueMicrotask(() => {
        if (generations.get(executionProviders) !== generation) return;
        generations.delete(executionProviders);
        executionProviders.dispose?.();
      });
    };
  }, [executionProviders]);
  const executionCapability = executionProviders.capability(language);
  // MRNote Classic: a compiled language whose toolchain is not installed on
  // this computer says what to install (lib/desktop-code-toolchains).
  const desktopToolchainInstall = useDesktopToolchainInstallHint(
    language,
    executionCapability.status === "unavailable",
  );
  const runtimeUnavailableHint = desktopToolchainInstall
    ? t("code.desktopToolchainMissing", { tool: desktopToolchainInstall })
    : t("code.runtimeUnavailableHint");
  const interactiveConsoleAvailable =
    executionCapability.status === "available" &&
    executionCapability.supports.interactiveConsole;
  // A runtime with no stdin budget (LaTeX compiles a document and reads none)
  // offers no stdin field, the same as one that does not support it.
  const stdinAvailable =
    executionCapability.status === "available" &&
    executionCapability.supports.stdin &&
    executionCapability.limits.stdinBytes > 0;
  const partialExecutionAvailable =
    executionCapability.status === "available" &&
    executionCapability.supports.partialExecution;

  // --- Version history (this product's source control) -----------------------
  // A code page's "commits" are its saved versions. The review side already
  // exists here — compare against any version, three-way merge, a change gutter
  // against the newest one — but there was no way to BROWSE that history, take a
  
  // that against the same API, so it is wired here rather than rebuilt.
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);

  // The console realm is torn down with the rest of this page's runtimes, by
  // the lease below — a session's worker survives between submissions on
  // purpose, so closing the page has to end it, but only once the page has no
  // views left. See the effect near `restartRuntime`.
  const [consoleOpen, setConsoleOpen] = useState(
    guestMode && guestDemoConsoleOpen,
  );
  const [consoleEntries, setConsoleEntries] = useState<CodeConsoleEntry[]>(() =>
    guestMode && guestDemoConsoleEntries
      ? [...guestDemoConsoleEntries]
      : [],
  );
  const [consoleBusy, setConsoleBusy] = useState(false);
  const consoleIdRef = useRef(0);
  const consoleAbortRef = useRef<AbortController | null>(null);
  const consoleJavaScriptRuntimeDispatchedRef = useRef(false);
  const consoleLanguageOwnerRef = useRef(language);
  useLayoutEffect(() => {
    if (consoleLanguageOwnerRef.current === language) return;
    consoleLanguageOwnerRef.current = language;
    // A settled transcript describes one language runtime. Reusing it beneath
    // another selector value would relabel old commands and output as though
    // the new runtime had produced them. An in-flight generation keeps its
    // captured authority until Stop/Restart/settlement handles it.
    if (activeExecutionAuthorityRef.current !== null) return;
    consoleIdRef.current += 1;
    setConsoleEntries((entries) => (entries.length === 0 ? entries : []));
  }, [language]);
  const [stdinOpen, setStdinOpen] = useState(false);
  const [stdinText, setStdinText] = useState("");
  const stdinTextRef = useRef("");
  const stdinByteCount = new TextEncoder().encode(stdinText).byteLength;
  const [stdinSha256, setStdinSha256] = useState<string | null>(null);
  const stdinIdentityGenerationRef = useRef(0);
  const stdinByteLimit =
    executionCapability.status === "available"
      ? executionCapability.limits.stdinBytes
      : 0;
  const stdinOverLimit = stdinAvailable && stdinByteCount > stdinByteLimit;
  const codeImportGenerationRef = useRef(0);
  const codeImportingRef = useRef(false);
  const codeImportDragDepthRef = useRef(0);
  const [codeImporting, setCodeImporting] = useChangedState(false);
  const [codeImportDragActive, setCodeImportDragActive] =
    useChangedState(false);
  const [codeImportError, setCodeImportError] = useChangedState<
    string | null
  >(null);
  const [codeSourceLimitExceeded, setCodeSourceLimitExceeded] = useState(false);
  const [codeHydrationBlocked, setCodeHydrationBlocked] =
    useChangedState(false);
  // A binary workspace file (workspace-binary-file.ts) holds no source: its
  // window previews the attachment read-only instead of the editor.
  const [binaryAsset, setBinaryAsset] = useState<WorkspaceBinaryAsset | null>(
    null,
  );
  const binaryAssetRef = useRef<WorkspaceBinaryAsset | null>(null);
  const codeSourceLimitExceededRef = useRef(false);
  const markCodeSourceLimitExceeded = useCallback(() => {
    if (codeSourceLimitExceededRef.current) return;
    codeSourceLimitExceededRef.current = true;
    setCodeSourceLimitExceeded(true);
  }, []);
  const acceptCodeSourceLength = useCallback(
    (nextContent: string) => {
      if (nextContent.length > MAX_CODE_SOURCE_CHARS) {
        markCodeSourceLimitExceeded();
        return false;
      }
      if (codeSourceLimitExceededRef.current) {
        codeSourceLimitExceededRef.current = false;
        setCodeSourceLimitExceeded(false);
      }
      return true;
    },
    [markCodeSourceLimitExceeded],
  );
  const [importedFileName, setImportedFileName] = useChangedState<
    string | null
  >(null);
  const importedFileNameRef = useRef<string | null>(null);
  importedFileNameRef.current = importedFileName;
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const sourceFileNameRef = useRef<string | null>(null);
  const [sourceFileRenameDraft, setSourceFileRenameDraft] =
    useState<string | null>(null);
  const [sourceFileRenameInvalid, setSourceFileRenameInvalid] = useState(false);
  const codeImportInputRef = useRef<HTMLInputElement>(null);
  const sourceFileRenameInputRef = useRef<HTMLInputElement>(null);
  const sourceFileRenameButtonRef = useRef<HTMLButtonElement>(null);
  const [lineEnding, setLineEnding] = useState<EolStyle>("LF");
  const lineEndingRef = useRef<EolStyle>("LF");
  const [sourceEncoding, setSourceEncoding] =
    useState<CodeSourceEncoding>("utf8");
  const sourceEncodingRef = useRef<CodeSourceEncoding>("utf8");
  const [codeImportSnapshot, setCodeImportSnapshot] =
    useChangedState<CodeImportSnapshot | null>(null);
  const retirePendingCodeImportAuthority = useCallback(() => {
    // This generation is deliberately monotonic even when authored state later
    // returns to the same bytes (edit -> Undo). Equality is not ownership.
    codeImportGenerationRef.current += 1;
    retireActiveCodeTestRunRef.current(true);
    codeImportDragDepthRef.current = 0;
    setCodeImportDragActive(false);
    if (!codeImportingRef.current) return;
    codeImportingRef.current = false;
    setCodeImporting(false);
  }, []);
  const codeImportBlocked = codeImporting || pageExecution !== null;
  const codeImportDispatchBlocked = useCallback(
    () =>
      !codeMayAuthorRef.current ||
      codeImportingRef.current ||
      getPageExecutionState(pageId) !== null,
    [pageId],
  );
  const runtimePageIdentityRef = useRef(pageId);

  // CodeWindow is reused while its page prop changes. Retire every page-owned
  // continuation before the new editor paints; waiting for an old runner or
  // console promise to settle would leave the new page disabled and would
  // expose the previous page's transcript/stdin/output in the meantime.
  useLayoutEffect(() => {
    const previousPageId = runtimePageIdentityRef.current;
    if (previousPageId === pageId) return;
    runtimePageIdentityRef.current = pageId;

    const previousExecution = activeExecutionAuthorityRef.current;
    const previousLanguage =
      previousExecution?.language ?? runningLanguageRef.current;
    const wasRunning = runningRef.current;
    runGenerationRef.current += 1;
    runningRef.current = false;
    runningLanguageRef.current = null;
    previousExecution?.controller.abort();
    if (activeExecutionAuthorityRef.current === previousExecution) {
      activeExecutionAuthorityRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    consoleAbortRef.current?.abort();
    consoleAbortRef.current = null;
    consoleJavaScriptRuntimeDispatchedRef.current = false;
    coalescerRef.current?.dispose();
    coalescerRef.current = null;
    // The old async closure still owns and releases this exact registry token.
    // Detaching the local pointer lets the new page acquire its own page key
    // without releasing another generation early.
    activePageExecutionClaimRef.current = null;
    if (wasRunning && previousLanguage === "python") {
      interruptPython(previousPageId);
    } else if (wasRunning && previousLanguage === "sql") {
      interruptSql(previousPageId);
    } else if (wasRunning && previousLanguage === "lua") {
      interruptLua(previousPageId);
    } else if (wasRunning && previousLanguage === "csharp") {
      interruptCSharp(previousPageId);
    } else if (wasRunning && previousLanguage === "ruby") {
      interruptRuby(previousPageId);
    } else if (wasRunning && previousLanguage === "bash") {
      interruptShell(previousPageId);
    }

    retirePendingCodeImportAuthority();
    setCodeImportError(null);
    setImportedFileName(null);
    setCodeImportSnapshot(null);
    setRunning(false);
    setConsoleBusy(false);
    setConsoleEntries([]);
    consoleIdRef.current += 1;
    setStdinOpen(false);
    setStdinText("");
    stdinTextRef.current = "";
    persistedOutputRef.current = null;
    persistedOutputAuthorityRef.current = null;
    persistedRunNavigationRef.current = null;
    persistedRunTimelineRef.current = [];
    persistedRunProfilesRef.current = [];
    runProfileRequestGenerationRef.current += 1;
    debugTimelinePersistenceGenerationRef.current += 1;
    debugTimelineReplayGenerationRef.current += 1;
    persistedDebugTimelineRef.current = [];
    activeDebugTimelineAuthorityRef.current = null;
    runAuthoringGenerationRef.current = null;
    setOutput(null);
    setRunTimeline([]);
    setSelectedRunTimelineIndex(null);
    setRunProfiles([]);
    setDebugTimeline([]);
    setSelectedDebugTimelineIndex(null);
    setOutputCopied(false);
    setOutputCopyError(null);
    setLastRunScope(null);
    setTracebackNavigationSource(null);
    setDebugPausedLine(null);
    debugStateRef.current = DEFAULT_CODE_DEBUG_STATE;
    setDebugState(DEFAULT_CODE_DEBUG_STATE);
    activeCodeTestDebugSessionRef.current = null;
    setActiveCodeTestDebugSession(null);
    codeTestDebugHydrationGenerationRef.current += 1;
    setCodeTestDebugHydrationGeneration(
      codeTestDebugHydrationGenerationRef.current,
    );
    debugViewStateKeyRef.current = `page:${pageId}`;
    const pendingTestDebug = pendingCodeTestDebugHandoffRef.current;
    if (pendingTestDebug?.targetPageId !== pageId) {
      pendingCodeTestDebugHandoffRef.current = null;
      if (pendingTestDebug) {
        discardCodeTestDebugHandoffRequest(pendingTestDebug.requestId);
      }
    }
    discardCodeTestDebugHandoff(
      previousPageId,
      currentCodeWindowBufferIdRef.current,
    );

    // Clear retained host payloads synchronously; child-level owner + ACK
    // checks remain the final boundary for remounts outside this host path.
    setEditorViewCommandRequest(undefined);
    setEditorEditCommandRequest(undefined);
    setEditorIntelligenceCommandRequest(undefined);
    setEditorReviewCommandRequest(undefined);
    setEditorExecutionCommandRequest(undefined);
    setDebugCommandRequest(undefined);
    setDebugLineNavigationRequest(undefined);
  }, [pageId, retirePendingCodeImportAuthority]);

  // A Run/Console/Debug dispatch is a later user action than a File read that
  // is still pending. The page execution registry notifies synchronously, so
  // retire that import generation in every duplicate view before a fast
  // execution can settle back to idle and let stale file bytes through.
  useEffect(
    () =>
      subscribePageExecution(pageId, () => {
        if (!getPageExecutionState(pageId)) return;
        retirePendingCodeImportAuthority();
      }),
    [pageId, retirePendingCodeImportAuthority],
  );
  const undoSnapshotsRef = useRef<Map<string, CodeReceiptSnapshot>>(new Map());
  const [workspaceExplorerOpen, setWorkspaceExplorerOpen] = useState(false);
  const [testExplorerOpen, setTestExplorerOpen] = useState(false);
  const [testExplorerBusy, setTestExplorerBusy] = useState(false);
  const [selectedCodeTestIds, setSelectedCodeTestIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const testSelectionInitializedRef = useRef(false);
  const [testRunReceipt, setTestRunReceipt] =
    useState<PersistedCodeTestRunReceipt | null>(null);
  const persistedTestRunReceiptRef =
    useRef<PersistedCodeTestRunReceipt | null>(null);
  const persistedTestRunTimelineRef =
    useRef<readonly PersistedCodeTestRunTimelineEntry[]>([]);
  const [testRunTimeline, setTestRunTimeline] =
    useState<readonly PersistedCodeTestRunTimelineEntry[]>([]);
  const [selectedTestRunTimelineIndex, setSelectedTestRunTimelineIndex] =
    useState<number | null>(null);
  const testRunTimelineGenerationRef = useRef(0);
  const testRunExactSourcesRef = useRef<{
    readonly runId: string;
    readonly sources: ReadonlyMap<string, CodeTestSource>;
  } | null>(null);
  const testRunReceiptAuthoringGenerationRef = useRef<number | null>(null);
  const [testRunError, setTestRunError] = useState<string | null>(null);
  const pendingCodeAiFixRef = useRef<PendingCodeAiFixRequest | null>(null);
  const [postAiRerunRequest, setPostAiRerunRequest] =
    useState<CodeTestPostAiRerunRequest | null>(null);
  const [activeCodeTestDebugSession, setActiveCodeTestDebugSession] =
    useState<ActiveCodeTestDebugSession | null>(null);
  const [codeTestDebugHandoffEpoch, setCodeTestDebugHandoffEpoch] =
    useState(0);
  const [codeTestDebugHydrationGeneration, setCodeTestDebugHydrationGeneration] =
    useState(0);
  const [workspaceNotebookId, setWorkspaceNotebookId] = useState("");
  const [workspaceCurrentTitle, setWorkspaceCurrentTitle] = useState("");
  const [workspaceCurrentContentVersion, setWorkspaceCurrentContentVersion] =
    useState(0);
  const [hydratedExecutionPageAuthority, setHydratedExecutionPageAuthority] =
    useState({ pageId: "", language: "", contentVersion: 0 });
  const [workspacePages, setWorkspacePages] = useState<PageItem[]>([]);
  const [workspacePageTotal, setWorkspacePageTotal] = useState(0);
  const [workspaceCatalogLoading, setWorkspaceCatalogLoading] = useState(false);
  const [workspaceCatalogError, setWorkspaceCatalogError] = useState(false);
  const [workspaceDetailsLoading, setWorkspaceDetailsLoading] = useState(false);
  const [workspaceDetailsError, setWorkspaceDetailsError] = useState(false);
  const [workspaceDetailsIncomplete, setWorkspaceDetailsIncomplete] =
    useState(false);
  const [workspaceRefreshEpoch, setWorkspaceRefreshEpoch] = useState(0);
  const workspaceDetailAttemptedRef = useRef<Set<string>>(new Set());
  const workspacePagesRef = useRef<PageItem[]>([]);
  const workspaceCatalogGenerationRef = useRef(0);
  const workspaceCatalogLoadRef = useRef<{
    notebookId: string;
    generation: number;
    promise: Promise<PageItem[]>;
  } | null>(null);
  const workspaceDetailLoadRef = useRef<{
    notebookId: string;
    generation: number;
    promise: Promise<PageItem[]>;
  } | null>(null);
  const [workspaceCollapsedPaths, setWorkspaceCollapsedPaths] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const workspaceCatalogNotebookOwnerRef = useRef(workspaceNotebookId);
  const workspaceExplorerPanelRef = useRef<HTMLDivElement>(null);
  const testExplorerPanelRef = useRef<HTMLDivElement>(null);
  const pendingWorkspaceLocationRef =
    useRef<CodeWorkspaceLocation | null>(null);

  useLayoutEffect(() => {
    if (workspaceCatalogNotebookOwnerRef.current === workspaceNotebookId) {
      return;
    }
    workspaceCatalogNotebookOwnerRef.current = workspaceNotebookId;
    // Catalog rows, counts, collapsed paths, and test selections are notebook
    // authority. Retire them before the replacement notebook paints; otherwise
    // a slow list request leaves the previous notebook's private paths visible
    // and actionable beneath the new page until that request settles.
    workspaceCatalogGenerationRef.current += 1;
    workspaceCatalogLoadRef.current = null;
    workspaceDetailLoadRef.current = null;
    workspaceDetailAttemptedRef.current = new Set();
    workspacePagesRef.current = [];
    setWorkspacePages([]);
    setWorkspacePageTotal(0);
    setWorkspaceCatalogLoading(!guestMode && workspaceNotebookId !== "");
    setWorkspaceCatalogError(false);
    setWorkspaceDetailsLoading(false);
    setWorkspaceDetailsError(false);
    setWorkspaceDetailsIncomplete(false);
    setWorkspaceCollapsedPaths(new Set());
    testSelectionInitializedRef.current = false;
    setSelectedCodeTestIds(new Set());
  }, [guestMode, workspaceNotebookId]);

  const updateOutputPanelVisibility = useCallback((visible: boolean) => {
    setOutputPanelVisible(visible);
    saveRunOutputPanelVisible(visible);
  }, []);

  // ---- Find-in-Files (cross-window, VSCode Ctrl+Shift+F) -------------------
  // Operates over all open Code windows through the code-window registry.
  // Replace-in-Files is also supported: the replacement is applied to every
  // matched window buffer in one pass, writing back through its own setText.
  const [fifOpen, setFifOpen] = useState(false);
  const [fifQuery, setFifQuery] = useState("");
  const [fifReplacement, setFifReplacement] = useState("");
  const [fifReplacementFailure, setFifReplacementFailure] = useState<{
    buffers: readonly SearchBuffer[];
    query: string;
    replacement: string;
    options: FindOptions;
    messageKey: FindReplacementPlanMessageKey;
  } | null>(null);
  const [fifCaseSensitive, setFifCaseSensitive] = useState(false);
  const [fifWholeWord, setFifWholeWord] = useState(false);
  const [fifRegex, setFifRegex] = useState(false);
  // VS Code's "files to include / exclude" boxes, applied to the file list the
  // search projects from — so the result tree, the truncation notice and
  // Replace All all agree on which files are in scope.
  const [fifIncludeGlobs, setFifIncludeGlobs] = useState("");
  const [fifExcludeGlobs, setFifExcludeGlobs] = useState("");
  const [fifActiveHitKey, setFifActiveHitKey] = useState<string | null>(null);
  const [fifUndoSnapshot, setFifUndoSnapshot] =
    useState<ReplaceInFilesUndoSnapshot | null>(null);
  const fifUndoNotebookOwnerRef = useRef(workspaceNotebookId);
  useLayoutEffect(() => {
    if (fifUndoNotebookOwnerRef.current === workspaceNotebookId) return;
    fifUndoNotebookOwnerRef.current = workspaceNotebookId;
    setFifUndoSnapshot(null);
    setFifReplacementFailure(null);
    setFifActiveHitKey(null);
  }, [workspaceNotebookId]);
  const fifInputRef = useRef<HTMLInputElement>(null);
  // One atomic receipt owns both the source snapshots and their navigation
  // targets. References and Call Hierarchy share the generation so an older
  // request can never publish one half of its maps after a newer command wins.
  const crossWindowReferenceRequestIdRef = useRef(0);
  const crossWindowReferenceAuthorityRef =
    useRef<CrossWindowReferenceAuthority | null>(null);

  useEffect(() => {
    if (!guestMode || initialCode === undefined) return;
    if (contentRef.current === initialCode) return;
    installAuthoritativeContent(initialCode);
  }, [guestMode, initialCode, installAuthoritativeContent]);

  useEffect(() => {
    if (!guestMode) return;
    setOutput(guestDemoOutput ?? null);
    if (guestDemoOutput) setOutputPanelVisible(true);
  }, [guestDemoOutput, guestMode]);

  useEffect(() => {
    if (!guestMode) return;
    setConsoleOpen(guestDemoConsoleOpen);
    setConsoleEntries(
      guestDemoConsoleEntries ? [...guestDemoConsoleEntries] : [],
    );
  }, [guestDemoConsoleEntries, guestDemoConsoleOpen, guestMode]);
  const languageRef = useRef(language);
  useLayoutEffect(() => {
    contentRef.current = content;
  }, [content]);
  useLayoutEffect(() => {
    languageRef.current = language;
    workspacePathRef.current = workspacePath;
    workspaceContentVersionRef.current = workspaceCurrentContentVersion;
    outputRef.current = output;
  }, [
    language,
    output,
    workspaceCurrentContentVersion,
    workspacePath,
  ]);
  useLayoutEffect(() => {
    retirePendingContentRender();
    pageIdRef.current = pageId;
  }, [pageId, retirePendingContentRender]);
  useEffect(
    () => () => {
      retirePendingContentRender();
    },
    [retirePendingContentRender],
  );
  useLayoutEffect(() => {
    debugTimelinePersistenceGenerationRef.current += 1;
    debugTimelineReplayGenerationRef.current += 1;
  }, [content, contentSnapshotRevision, language]);
  useLayoutEffect(() => {
    stdinTextRef.current = stdinText;
  }, [stdinText]);
  useEffect(() => {
    const generation = stdinIdentityGenerationRef.current + 1;
    stdinIdentityGenerationRef.current = generation;
    setStdinSha256(null);
    void sha256ExecutionSource(stdinText)
      .then((digest) => {
        if (
          stdinIdentityGenerationRef.current === generation &&
          stdinTextRef.current === stdinText
        ) {
          setStdinSha256(digest);
        }
      })
      .catch(() => {
        // Without a trusted digest, persisted rerun actions stay disabled.
      });
  }, [stdinText]);
  useEffect(() => {
    const generation = debugTimelineSourceDigestGenerationRef.current + 1;
    debugTimelineSourceDigestGenerationRef.current = generation;
    // The ref and the state are always written together, so a clear ref
    // means the state is (or is about to be) clear too. Typing already
    // retired the digest on its first keystroke; clearing it again here
    // would cost a whole-window render per content snapshot.
    const hadDigest = debugTimelineSourceSha256Ref.current !== null;
    debugTimelineSourceSha256Ref.current = null;
    if (hadDigest) setDebugTimelineSourceSha256(null);
    void sha256ExecutionSource(content)
      .then((digest) => {
        if (
          debugTimelineSourceDigestGenerationRef.current === generation &&
          contentRef.current === content &&
          languageRef.current === language
        ) {
          debugTimelineSourceSha256Ref.current = digest;
          setDebugTimelineSourceSha256(digest);
        }
      })
      .catch(() => {
        // Timeline navigation and replay stay disabled without a trusted hash.
      });
  }, [content, contentSnapshotRevision, language]);
  useLayoutEffect(() => {
    if (stdinAvailable) return;
    const outputOwnedByRetiredInput =
      persistedOutputAuthorityRef.current?.stdin !== undefined &&
      persistedOutputAuthorityRef.current.stdin !== "";
    if (outputOwnedByRetiredInput) {
      persistedOutputRef.current = null;
      persistedOutputAuthorityRef.current = null;
      persistedRunNavigationRef.current = null;
      if (codeMayAuthorRef.current) {
        persistRef.current(languageRef.current, contentRef.current, null);
      }
    }
    if (stdinTextRef.current !== "") {
      runProfileRequestGenerationRef.current += 1;
      stdinIdentityGenerationRef.current += 1;
    }
    stdinTextRef.current = "";
    setStdinOpen(false);
    setStdinText("");
  }, [language, stdinAvailable]);
  useLayoutEffect(() => {
    const previous = outputCopyIdentityRef.current;
    if (previous.pageId === pageId && previous.output === output) return;
    outputCopyIdentityRef.current = { pageId, output };
    outputCopyGenerationRef.current += 1;
    outputCopyRequestIdRef.current += 1;
    if (outputCopied) setOutputCopied(false);
    if (outputCopyError) setOutputCopyError(null);
  }, [output, outputCopied, outputCopyError, pageId]);
  useLayoutEffect(() => {
    outputCopyMountedRef.current = true;
    return () => {
      outputCopyMountedRef.current = false;
      outputCopyRequestIdRef.current += 1;
      outputCopyBusyRef.current = false;
    };
  }, []);
  useEffect(() => {
    let clipboardWriteAvailable = false;
    try {
      clipboardWriteAvailable =
        typeof globalThis.navigator?.clipboard?.writeText === "function";
    } catch {
      clipboardWriteAvailable = false;
    }
    const legacyCopyAvailable =
      typeof document !== "undefined" &&
      typeof document.execCommand === "function";
    setOutputCopyAvailable(
      clipboardWriteAvailable || legacyCopyAvailable,
    );
  }, []);
  // Whether this realm can start a download right now. A download that
  // could not start used to mark the whole window unable to download for
  // its lifetime (every download control greyed out); the flag now follows
  // the browser capability it stands for, and clears once it is back.
  const downloadBlockedNow = useCallback((): boolean => {
    const blocked = !isBrowserDownloadAvailable();
    if (downloadUnavailableRef.current !== blocked) {
      downloadUnavailableRef.current = blocked;
      setDownloadUnavailable(blocked);
      if (!blocked) setDownloadError(null);
    }
    return blocked;
  }, []);
  useEffect(() => {
    if (!downloadBlockedNow()) return;
    setDownloadError(
      t("toolbar.exportFailed", { format: t("code.download") }),
    );
  }, [downloadBlockedNow, t]);
  useEffect(() => {
    if (!downloadUnavailable) return;
    const recheck = () => {
      downloadBlockedNow();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [downloadBlockedNow, downloadUnavailable]);
  const acquirePageExecutionClaim = useCallback(
    (kind: PageExecutionKind, executionLanguage: string) => {
      const active = activePageExecutionClaimRef.current;
      if (active?.isActive()) return null;
      activePageExecutionClaimRef.current = null;
      const claim = tryAcquirePageExecution(pageId, {
        ownerId: executionOwnerId,
        kind,
        language: executionLanguage,
      });
      if (claim) activePageExecutionClaimRef.current = claim;
      return claim;
    },
    [executionOwnerId, pageId],
  );
  const releasePageExecutionClaim = useCallback(
    (claim: PageExecutionClaim) => {
      claim.release();
      if (activePageExecutionClaimRef.current === claim) {
        activePageExecutionClaimRef.current = null;
      }
    },
    [],
  );
  const releaseActivePageExecutionClaim = useCallback(() => {
    const active = activePageExecutionClaimRef.current;
    if (active) releasePageExecutionClaim(active);
  }, [releasePageExecutionClaim]);
  // The real page title, seeded on load and threaded into EVERY save's `title`
  // field. Sending "" on each autosave wiped the page title + slug on the first
  // edit/language-change (the backend treated "" as an explicit rename); mirrors
  // NoteEditor's titleRef pattern. Also used as the cross-window registry label.
  const titleRef = useRef(draftReview?.title ?? "");
  // On a canvas a LaTeX compile's PDF opens in a window of its own beside
  // this one (windows/CompiledPdfWindow), keyed by this window; with no
  // canvas around it the output shows the PDF inline.
  // A draft's review shows its PDF in its own column (PageDraftCode), under
  // the key its review gives; no window opens on the canvas for it.
  const compiledDocumentWindowKey = draftReview
    ? (draftReview.compiledDocumentKey ?? null)
    : !guestMode && windowManagerActions && windowId ? windowId : null;
  useEffect(
    () =>
      compiledDocumentWindowKey
        ? retainCompiledDocument(compiledDocumentWindowKey)
        : undefined,
    [compiledDocumentWindowKey],
  );
  /**
   * Show the compiled PDF's window: open it beside this one (the two side by
   * side when there is no room beside it) or bring it back from the tray.
   * `raise` also brings an open one to the front (the output's button); a
   * recompile leaves an open window where the member put it. `key` is
   * another Code window's document (a chapter going to its main file's PDF).
   */
  const showCompiledDocumentWindow = useCallback(
    (raise: boolean, key: string | null = compiledDocumentWindowKey) => {
      if (draftReviewing || !windowManagerActions || !key) return;
      const entry = readCompiledDocument(key);
      if (!entry) return;
      const shown = windowManagerActions
        .readWindows()
        .find(
          (item) =>
            item.type === "compiled_pdf" &&
            item.meta.sourceWindowId === key,
        );
      if (!shown || shown.minimized || raise) {
        const frame = shown
          ? null
          : placeOfficeCompanionWindow(
              windowManagerActions,
              key,
              COMPILED_DOCUMENT_WINDOW_WIDTH,
            );
        windowManagerActions.openWindow({
          type: "compiled_pdf",
          title: entry.filename,
          meta: { sourceWindowId: key },
          ...(frame ? { frame } : { beside_type: "note" as const }),
        });
      }
      if (shown && shown.title !== entry.filename) {
        windowManagerActions.renameWindow(shown.id, entry.filename);
      }
    },
    [compiledDocumentWindowKey, draftReviewing, windowManagerActions],
  );
  // A rename from the file-name box that also renamed the page: what the file
  // was before it, for when the server refuses the new name as another page's
  // (set by commitSourceFileRename).
  const takeBackRefusedRenameRef = useRef<((title: string) => void) | null>(null);
  // The page's name set from outside this editor, or handed back when the
  // server refused a name typed into the file-name box as another page's:
  // every later save and this window's title carry it, and a refused rename
  // takes the file's name and path back with it.
  useEffect(() => {
    const onRenamed = (event: Event) => {
      const rename = pageRenameFromEvent(event);
      if (!rename || rename.pageId !== pageId) return;
      // The shared buffer's held draft takes the name as well: it is what a
      // hydration (an own save's answer) and a collaborator's change in the
      // room hand this window back, and with the old name in it this window
      // took the replaced name again and saved it over the rename (a run on
      
      const lease = codePageBufferLeaseRef.current;
      if (lease?.pageId === pageId) lease.followTitle(rename.title);
      if (rename.title === titleRef.current) return;
      titleRef.current = rename.title;
      setWorkspaceCurrentTitle(rename.title || pageId);
      if (windowId) windowManagerActions?.renameWindow(windowId, rename.title);
      takeBackRefusedRenameRef.current?.(rename.title);
    };
    window.addEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, onRenamed);
    return () => window.removeEventListener(NOTEBOOK_PAGE_RENAMED_EVENT, onRenamed);
  }, [pageId, windowId, windowManagerActions]);
  // A lost connection fails the authority read; the confirmed verdict holds
  // through it (as for PDF pages) so typing on keeps landing in the room. A
  // known refusal still applies at once. Without this the editor turned
  // read-only at the first failed read after the network dropped, and every
  // key typed offline from then on was discarded.
  const pageWritable = usePageWritableThroughOutages(pageId, !guestMode);
  const pageCollabBinding = useLastVerifiedPageCollabBinding(
    pageId,
    !guestMode,
  );
  // This is intentionally separate from the CRDT switch. Disabling transport
  // must never turn a known ACL viewer into a writer. The ref is the dispatch-
  // time authority used by retained callbacks and async continuations.
  const codeMayAuthorRef = useRef(guestMode && !draftReviewing);
  const [initialCodeAuthoringGeneration] = useState(() =>
    nextCodeWindowAuthoringGeneration(),
  );
  const codeAuthoringGenerationRef = useRef(
    initialCodeAuthoringGeneration,
  );
  const codeAuthoringIdentityRef = useRef({
    pageId,
    allowed: guestMode && !draftReviewing,
  });
  const codePageAuthorityBinding = useMemo<CodePageBufferBinding>(() => {
    if (!USE_COLLAB_EDITING || pageCollabBinding === "unresolved") {
      return "local";
    }
    if (pageCollabBinding === "observer") return "acl-viewer";
    if (pageCollabBinding === "terminal") return "local";
    return pageWritable.reason === "locked"
      ? "participant-locked"
      : "participant";
  }, [pageCollabBinding, pageWritable.reason]);
  const codePageBufferAuthority = useMemo<CodePageBufferAuthority>(
    () => ({
      collaborationEnabled: USE_COLLAB_EDITING,
      known: pageWritable.known,
      writable: pageWritable.writable,
      reason: pageWritable.reason,
      binding: codePageAuthorityBinding,
      mayWriteNow: pageWritable.known && pageWritable.writable,
    }),
    [
      codePageAuthorityBinding,
      pageWritable.known,
      pageWritable.reason,
      pageWritable.writable,
    ],
  );
  const codePageBufferLeaseRef = useRef<CodePageBufferLease | null>(null);
  const codeLocalPreviewPageRef = useRef<string | null>(null);
  const [codePageBufferBinding, setCodePageBufferBinding] = useChangedState<{
    lease: CodePageBufferLease;
    generation: string;
    renderState: string;
  } | null>(null);
  const codePageBufferLease = codePageBufferBinding?.lease ?? null;
  const activeCodePageBufferLease =
    codePageBufferLease?.pageId === pageId ? codePageBufferLease : null;
  const handleActivateSplitPane = useCallback(
    (pane: "primary" | "secondary") => {
      setSplitViewState((current) => activateCodeSplitPane(current, pane));
    },
    [],
  );
  useLayoutEffect(() => {
    if (activeCodePageBufferLease) return;
    setSplitViewState(closeCodeSplitView);
  }, [activeCodePageBufferLease]);
  useLayoutEffect(() => {
    bufferBindingGenerationRef.current =
      codePageBufferBinding?.generation ?? null;
  }, [codePageBufferBinding?.generation]);
  useLayoutEffect(() => {
    if (!activeCodePageBufferLease) {
      retirePendingContentRender();
      return;
    }
    // Until the page model holds the page, its session's text is not the
    // page's: a room still settling, or a just-bound epoch whose originals are
    // still being adopted. Installing that blanked the loaded body for a
    // moment on every reopen; it stays on screen until the model is ready,
    // which advances the binding generation again.
    if (
      activeCodePageBufferLease.collaborationAdapter.getSnapshot().causal
        ?.status !== "ready"
    ) {
      return;
    }
    const liveBuffer = activeCodePageBufferLease.session.ydoc
      .getText(activeCodePageBufferLease.textKey)
      .toString();
    installAuthoritativeContent(liveBuffer);
  }, [
    activeCodePageBufferLease,
    codePageBufferBinding?.generation,
    installAuthoritativeContent,
    retirePendingContentRender,
  ]);
  const [codePageBufferSaveState, setCodePageBufferSaveState] =
    useChangedState<CodePageBufferSaveState | null>(
      null,
      sameNullableCodePageBufferSaveState,
    );
  const versionWriteSnapshotRef = useRef<CodeVersionWriteSnapshot | null>(
    null,
  );
  const versionHydrationGuardRef = useRef<CodeVersionHydrationGuard | null>(
    null,
  );
  const queueVersionDraftRef = useRef<(draft: PageDocumentDraft) => void>(
    () => {},
  );
  const currentCodeWindowBufferId = codeWindowEntryId({ pageId, windowId });
  const currentCodeWindowBufferIdRef = useRef(currentCodeWindowBufferId);

  // Every page/source/language transition retires both pending host work and
  // the click authority behind a visible result. Cleanup also covers unmount;
  // a later continuation then fails its generation check before publishing.
  useLayoutEffect(() => {
    currentCodeWindowBufferIdRef.current = currentCodeWindowBufferId;
    crossWindowReferenceRequestIdRef.current += 1;
    crossWindowReferenceAuthorityRef.current = null;
    return () => {
      crossWindowReferenceRequestIdRef.current += 1;
      crossWindowReferenceAuthorityRef.current = null;
    };
  }, [
    content,
    contentSnapshotRevision,
    currentCodeWindowBufferId,
    language,
    pageId,
  ]);

  useLayoutEffect(() => {
    // A preview/undo receipt is owned by one mounted page identity. Never let
    // a retained dialog or cross-file receipt appear in a reused window.
    refactorPreviewSequenceRef.current += 1;
    setRefactorPreviewPlan(null);
    setRefactorUndoReceipt(null);
    setRefactorPreviewBusy(false);
  }, [pageId]);

  // What this window last handed to save, so its acknowledgement can be told
  // apart from a page someone else wrote (see handleLoaded).
  const lastPersistedContentJsonRef = useRef<Record<string, unknown> | null>(
    null,
  );
  const buildPageDraft = useCallback(
    (
      nextLanguage: string,
      nextContent: string,
      nextOutput?: RunResult | null,
      nextDebugConfiguration?: CodeDebugConfiguration,
    ): PageDocumentDraft => {
      const candidateOutput =
        nextOutput === undefined ? persistedOutputRef.current : nextOutput;
      const outputAuthority = persistedOutputAuthorityRef.current;
      const outputToPersist =
        candidateOutput &&
        outputAuthority?.output === candidateOutput &&
        outputAuthority.language === nextLanguage &&
        outputAuthority.source === nextContent &&
        outputAuthority.stdin === stdinTextRef.current
          ? candidateOutput
          : null;
      if (
        nextOutput === null ||
        (candidateOutput !== null && outputToPersist === null)
      ) {
        // Identity changed after this receipt was accepted. Retire the durable
        // authority permanently; returning to byte-identical source later is a
        // new authoring generation and must not revive the old result.
        persistedOutputRef.current = null;
        persistedOutputAuthorityRef.current = null;
        persistedRunNavigationRef.current = null;
      }
      const runNavigation = persistedRunNavigationRef.current;
      const contentJson = buildContent(
        nextLanguage,
        nextContent,
        outputToPersist,
        nextDebugConfiguration ?? debugConfigurationRef.current,
        sourceFileNameRef.current,
        lineEndingRef.current,
        sourceEncodingRef.current,
        outputToPersist && runNavigation?.source === nextContent
          ? runNavigation.persisted
          : null,
        workspacePathExplicitRef.current
          ? workspacePathRef.current
          : null,
        persistedTestRunReceiptRef.current,
        persistedTestRunTimelineRef.current,
        persistedRunTimelineRef.current,
        persistedDebugTimelineRef.current,
        persistedRunProfilesRef.current,
        persistedRunOutputClearedRef.current,
      );
      // A binary file's window never authors, but whatever it might save
      // keeps naming the file's attachment.
      const binary = binaryAssetRef.current;
      return {
        title: titleRef.current,
        content_json:
          binary && nextContent === ""
            ? { ...contentJson, [WORKSPACE_BINARY_ASSET_KEY]: binary }
            : contentJson,
      };
    },
    [],
  );

  const captureVersionWriteSnapshot = useCallback(
    (): CodeVersionWriteSnapshot => {
      const lease = codePageBufferLeaseRef.current;
      return {
        pageId,
        documentRevision:
          lease?.pageId === pageId ? lease.getDocumentRevision() : null,
        draftFingerprint: JSON.stringify(
          buildPageDraft(languageRef.current, contentRef.current),
        ),
      };
    },
    [buildPageDraft, pageId],
  );

  const versionWriteSnapshotIsCurrent = useCallback(
    (snapshot: CodeVersionWriteSnapshot): boolean => {
      if (snapshot.pageId !== pageId) return false;
      const lease = codePageBufferLeaseRef.current;
      if (
        snapshot.documentRevision !== null &&
        (lease?.pageId !== pageId ||
          lease.getDocumentRevision() !== snapshot.documentRevision)
      ) {
        return false;
      }
      return (
        snapshot.draftFingerprint ===
        JSON.stringify(buildPageDraft(languageRef.current, contentRef.current))
      );
    },
    [buildPageDraft, pageId],
  );

  // Every open code window announces its registration, diagnostics and
  // content here, and each announcement used to re-render every other window
  // inside the commit that made it, so that commit always ended with more work
  // queued. With about ten windows loading, React counted fifty such commits
  // in a row and gave up on one window (Maximum update depth exceeded). Each
  // window now takes one refresh per burst, just after the announcing commit.
  // A burst made only by other windows is refreshed as a transition: at
  // Default priority behind the desk's staggered (transition) mounts it still
  // left urgent work after every commit, and each of N windows refreshed for
  
  // window's own registration and diagnostics stay immediate.
  useEffect(() => {
    let live = true;
    let queued = false;
    let urgent = false;
    const unsubscribe = subscribeCodeWindowRegistry((origin) => {
      if (origin === undefined || origin === registeredCodeWindowEntryRef.current) urgent = true;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const refresh = () => setCodeWindowRegistryRevision((revision) => revision + 1);
        if (live) {
          if (urgent) refresh();
          else startTransition(refresh);
        }
        urgent = false;
      });
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let live = true;
    let queued = false;
    const unsubscribe = subscribeCodeWindowSources((changedBufferId) => {
      if (changedBufferId === currentCodeWindowBufferId || queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (live) startTransition(() => setPeerSourceRevision((revision) => revision + 1));
      });
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [currentCodeWindowBufferId]);

  useEffect(() => {
    if (guestMode || !workspaceNotebookId) {
      return;
    }
    workspaceCatalogGenerationRef.current += 1;
    const generation = workspaceCatalogGenerationRef.current;
    const notebookId = workspaceNotebookId;
    let cancelled = false;
    const loadWorkspacePages = async (): Promise<PageItem[]> => {
      // Yield once so this external synchronization never creates a
      // synchronous effect -> render cascade.
      await Promise.resolve();
      if (cancelled) return workspacePagesRef.current;
      setWorkspaceCatalogLoading(true);
      setWorkspaceDetailsLoading(false);
      setWorkspaceDetailsError(false);
      workspaceDetailLoadRef.current = null;
      setWorkspaceCatalogError(false);
      try {
        const response = await listPages(notebookId);
        if (
          cancelled ||
          workspaceCatalogGenerationRef.current !== generation
        ) {
          return workspacePagesRef.current;
        }
        const listed = Array.isArray(response.items) ? response.items : [];
        if (listed.some((item) => item?.notebook_id !== notebookId)) {
          throw new Error("Workspace catalog crossed its notebook authority.");
        }
        // The list carries no content. A page whose saved version it still
        // lists keeps the content already loaded for it: a refresh landing
        // while a LaTeX compile, a search or the Test Explorer was using the
        // loaded pages must not hand them back as bare names (a compile then
        // sent its project without a single file).
        const loaded = new Map(
          workspacePagesRef.current.map((page) => [page.id, page] as const),
        );
        const items = listed.map((item) => {
          const known = loaded.get(item.id);
          return known?.content_json &&
            item.content_json === undefined &&
            known.content_version === item.content_version
            ? { ...item, content_json: known.content_json }
            : item;
        });
        workspaceDetailAttemptedRef.current = new Set();
        workspacePagesRef.current = items;
        setWorkspacePages(items);
        setWorkspaceIntelligenceRevision((revision) => revision + 1);
        const total =
          typeof response.total === "number" &&
            Number.isFinite(response.total)
            ? Math.max(items.length, Math.trunc(response.total))
            : items.length;
        setWorkspacePageTotal(total);
        setWorkspaceDetailsIncomplete(total > items.length);
        return items;
      } catch (error) {
        // Not a failed listing: React refused a state update (see the retry
        // below), so let the retry load it rather than show an error.
        if (isUpdateDepthError(error)) throw error;
        if (
          cancelled ||
          workspaceCatalogGenerationRef.current !== generation
        ) {
          return workspacePagesRef.current;
        }
        workspaceDetailAttemptedRef.current = new Set();
        workspacePagesRef.current = [];
        setWorkspacePages([]);
        setWorkspaceIntelligenceRevision((revision) => revision + 1);
        setWorkspacePageTotal(0);
        setWorkspaceDetailsIncomplete(true);
        setWorkspaceCatalogError(true);
        return [];
      } finally {
        if (
          !cancelled &&
          workspaceCatalogGenerationRef.current === generation
        ) {
          setWorkspaceCatalogLoading(false);
        }
      }
    };
    const promise = loadWorkspacePages();
    workspaceCatalogLoadRef.current = {
      notebookId,
      generation,
      promise,
    };
    let retryTimer: number | null = null;
    void promise
      .finally(() => {
        if (workspaceCatalogLoadRef.current?.promise === promise) {
          workspaceCatalogLoadRef.current = null;
        }
      })
      .catch((error: unknown) => {
        // A page opening a dozen code windows at once can cross React's
        // nested-update limit on whichever state update comes next, and every
        // window starts this load at that moment. The update it refused was
        // this window's whole file list (Explorer, Quick Open, Find in Files
        // and project navigation stayed empty). The limit resets once it has
        // thrown, so load again shortly instead of losing it.
        if (
          cancelled ||
          workspaceCatalogGenerationRef.current !== generation ||
          !isUpdateDepthError(error)
        ) {
          return;
        }
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (!cancelled && workspaceCatalogGenerationRef.current === generation) {
            setWorkspaceRefreshEpoch((value) => value + 1);
          }
        }, 250);
      });
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (workspaceCatalogGenerationRef.current === generation) {
        workspaceCatalogGenerationRef.current += 1;
      }
    };
  }, [guestMode, workspaceNotebookId, workspaceRefreshEpoch]);

  /**
   * Hydrate authorized metadata-only code pages on demand. Explorer, Quick
   * Open, Find in Files and compiler-backed navigation all share this single
   * in-flight request, so pressing F12 never requires opening a panel first and
   * concurrent tools cannot multiply API traffic.
   */
  const ensureWorkspacePageDetails =
    useCallback(async (): Promise<PageItem[]> => {
      if (guestMode || !workspaceNotebookId) {
        return workspacePagesRef.current;
      }
      const notebookId = workspaceNotebookId;
      const pendingCatalog = workspaceCatalogLoadRef.current;
      if (pendingCatalog?.notebookId === notebookId) {
        await pendingCatalog.promise;
      }
      const generation = workspaceCatalogGenerationRef.current;
      const pendingDetails = workspaceDetailLoadRef.current;
      if (
        pendingDetails?.notebookId === notebookId &&
        pendingDetails.generation === generation
      ) {
        return pendingDetails.promise;
      }

      const attemptedPages = workspaceDetailAttemptedRef.current;
      const candidates = workspacePagesRef.current.filter(
        (page) =>
          page.id !== pageId &&
          page.page_type === "code" &&
          codeWorkspacePageSearchText(page) === null &&
          !attemptedPages.has(page.id),
      );
      if (candidates.length === 0) return workspacePagesRef.current;
      for (const candidate of candidates) {
        attemptedPages.add(candidate.id);
      }

      const promise = (async (): Promise<PageItem[]> => {
        setWorkspaceDetailsLoading(true);
        setWorkspaceDetailsError(false);
        try {
          const result = await loadCodeWorkspacePageDetails(
            candidates,
            async (candidatePageId) => {
              const detail = await getPage(candidatePageId);
              if (detail.notebook_id !== notebookId) {
                throw new Error("Workspace page moved outside this notebook.");
              }
              return detail;
            },
            {
              // The server answers only this notebook's pages; a page moved
              // away is reported missing and fails like the read above.
              fetchPages: async (pageIds) =>
                (await readNotebookPages(notebookId, pageIds)).items.filter(
                  (detail) => detail.notebook_id === notebookId,
                ),
            },
          );
          // A refresh that started meanwhile has replaced the pages: the
          // details still belong to each page it lists at the same saved
          // version (a compile waits on exactly these), never to another
          // notebook's.
          if (workspaceCatalogNotebookOwnerRef.current !== notebookId) {
            return workspacePagesRef.current;
          }
          const detailById = new Map(
            result.pages.map((page) => [page.id, page] as const),
          );
          const merged = workspacePagesRef.current.map((page) => {
            const detail = detailById.get(page.id);
            return detail && detail.content_version === page.content_version
              ? detail
              : page;
          });
          workspacePagesRef.current = merged;
          setWorkspacePages(merged);
          setWorkspaceIntelligenceRevision((revision) => revision + 1);
          setWorkspaceDetailsError(result.failedPageIds.length > 0);
          if (result.truncated) setWorkspaceDetailsIncomplete(true);
          return merged;
        } catch {
          if (workspaceCatalogGenerationRef.current === generation) {
            setWorkspaceDetailsIncomplete(true);
            setWorkspaceDetailsError(true);
          }
          return workspacePagesRef.current;
        } finally {
          if (workspaceCatalogGenerationRef.current === generation) {
            setWorkspaceDetailsLoading(false);
          }
        }
      })();
      workspaceDetailLoadRef.current = {
        notebookId,
        generation,
        promise,
      };
      try {
        return await promise;
      } finally {
        if (workspaceDetailLoadRef.current?.promise === promise) {
          workspaceDetailLoadRef.current = null;
        }
      }
    }, [guestMode, pageId, workspaceNotebookId]);

  const workspaceDetailsRequested =
    workspaceExplorerOpen || testExplorerOpen || quickOpenOpen || fifOpen;
  const workspaceLoadError =
    workspaceCatalogError || workspaceDetailsError;
  useEffect(() => {
    if (!workspaceDetailsRequested) return;
    void ensureWorkspacePageDetails();
  }, [
    ensureWorkspacePageDetails,
    workspaceDetailsRequested,
    workspaceRefreshEpoch,
  ]);

  const workspaceCatalog = useMemo<CodeWorkspaceCatalog>(() => {
    const currentReference = persistedCodeWorkspaceReference(workspacePath);
    const currentPage: PageItem = {
      id: pageId,
      notebook_id: workspaceNotebookId || undefined,
      title: workspaceCurrentTitle || pageId,
      page_type: "code",
      content_version: workspaceCurrentContentVersion,
      content_json: {
        type: CODE_CONTENT_TYPE,
        language,
        ...(sourceFileName ? { sourceFileName } : {}),
        ...(currentReference
          ? { [CODE_WORKSPACE_REFERENCE_KEY]: currentReference }
          : {}),
      },
    };
    const catalog = buildCodeWorkspaceCatalog(
      [
        currentPage,
        ...workspacePages.filter((page) => page.id !== pageId),
      ],
      pageId,
    );
    const serverTruncated = workspacePageTotal > workspacePages.length;
    return {
      ...catalog,
      total: Math.max(catalog.total, workspacePageTotal),
      truncated:
        catalog.truncated || serverTruncated || workspaceDetailsIncomplete,
    };
  }, [
    language,
    pageId,
    sourceFileName,
    workspaceCurrentContentVersion,
    workspaceCurrentTitle,
    workspaceNotebookId,
    workspacePageTotal,
    workspacePages,
    workspacePath,
    workspaceDetailsIncomplete,
  ]);
  const workspaceFilesByPageId = useMemo(
    () =>
      new Map(
        workspaceCatalog.files.map((file) => [file.pageId, file] as const),
      ),
    [workspaceCatalog.files],
  );
  // Every workspace file's current text: an open view's unsaved edits, else
  // the saved content. Code tests and a LaTeX project's compile both run on it.
  // A binary file comes with its attachment and no text.
  const captureWorkspaceFileSources = useCallback((): Array<{
    readonly pageId: string;
    readonly path: string;
    readonly language: string;
    readonly contentVersion: number;
    readonly source: string;
    readonly binaryAsset?: WorkspaceBinaryAsset;
  }> => {
    // The rendered catalog keeps this callback reactive, but an awaited detail
    // load updates the page ref before React commits that catalog. Resolve the
    // execution snapshot from the current data, not an earlier render's paths.
    void workspaceCatalog.files;
    if (
      !workspaceNotebookId ||
      workspaceCatalogNotebookOwnerRef.current !== workspaceNotebookId
    )
      return [];
    const currentPageId = pageIdRef.current;
    const currentReference = persistedCodeWorkspaceReference(
      workspacePathRef.current,
    );
    if (!currentReference) return [];
    const currentCatalog = buildCodeWorkspaceCatalog(
      [
        {
          id: currentPageId,
          notebook_id: workspaceNotebookId,
          page_type: "code",
          content_version: workspaceContentVersionRef.current,
          content_json: {
            language: languageRef.current,
            [CODE_WORKSPACE_REFERENCE_KEY]: currentReference,
          },
        },
        ...workspacePagesRef.current.filter(
          (page) =>
            page.id !== currentPageId &&
            page.notebook_id === workspaceNotebookId,
        ),
      ],
      currentPageId,
    );
    const pagesById = new Map(
      workspacePagesRef.current.map(
        (workspacePage) => [workspacePage.id, workspacePage] as const,
      ),
    );
    const openByPageId = new Map<
      string,
      Array<{ language: string; source: string }>
    >();
    for (const entry of getOpenCodeBuffers()) {
      if (
        entry.notebookId !== undefined &&
        entry.notebookId !== workspaceNotebookId
      ) {
        continue;
      }
      let entryLanguage: string;
      let entrySource: string;
      try {
        entryLanguage = entry.getLanguage();
        entrySource = entry.getText();
      } catch {
        continue;
      }
      const entries = openByPageId.get(entry.pageId) ?? [];
      entries.push({ language: entryLanguage, source: entrySource });
      openByPageId.set(entry.pageId, entries);
    }

    const sources: Array<{
      readonly pageId: string;
      readonly path: string;
      readonly language: string;
      readonly contentVersion: number;
      readonly source: string;
      readonly binaryAsset?: WorkspaceBinaryAsset;
    }> = [];
    for (const file of currentCatalog.files) {
      if (file.pathConflict) continue;
      // Its saved content says a file is binary; an open view of one holds
      // no text of its own (it never authors).
      const binary =
        file.pageId === pageIdRef.current
          ? binaryAssetRef.current
          : parseWorkspaceBinaryAsset(
              pagesById.get(file.pageId)?.content_json,
            );
      if (binary) {
        sources.push({
          pageId: file.pageId,
          path: file.path,
          language: file.language,
          contentVersion: file.contentVersion,
          source: "",
          binaryAsset: binary,
        });
        continue;
      }
      let source: string | null = null;
      let sourceLanguage = file.language;
      if (file.pageId === pageIdRef.current) {
        source = contentRef.current;
        sourceLanguage = languageRef.current;
      } else {
        const live = openByPageId.get(file.pageId) ?? [];
        if (live.length > 0) {
          const first = live[0];
          if (
            live.some(
              (candidate) =>
                candidate.source !== first.source ||
                candidate.language !== first.language,
            )
          ) {
            // Two unsaved views disagree. There is no single source authority
            // to execute, so omit this page rather than choosing a winner.
            continue;
          }
          source = first.source;
          sourceLanguage = first.language;
        } else {
          const page = pagesById.get(file.pageId);
          source = codeWorkspacePageSearchText(page);
          const storedLanguage = page?.content_json?.language;
          if (typeof storedLanguage === "string")
            sourceLanguage = storedLanguage;
        }
      }
      if (source === null) continue;
      sources.push({
        pageId: file.pageId,
        path: file.path,
        language: sourceLanguage,
        contentVersion: file.contentVersion,
        source,
      });
    }
    return sources;
  }, [workspaceCatalog.files, workspaceNotebookId]);
  const captureCodeTestSources = useCallback(
    (): CodeTestSource[] =>
      captureWorkspaceFileSources().flatMap(
        ({ binaryAsset: binary, ...source }) =>
          !binary &&
          isCodeTestLanguage(source.language) &&
          source.source.length <= CODE_TEST_SOURCE_CODE_UNIT_LIMIT
            ? [{ ...source, language: source.language }]
            : [],
      ),
    [captureWorkspaceFileSources],
  );
  const codeTestSources = useMemo(
    () => {
      // captureCodeTestSources reads live refs. These revisions deliberately
      // trigger a new exact snapshot without changing the callback identity.
      void content;
      void contentSnapshotRevision;
      void language;
      void peerSourceRevision;
      void workspaceIntelligenceRevision;
      return captureCodeTestSources();
    },
    [
      captureCodeTestSources,
      content,
      contentSnapshotRevision,
      language,
      peerSourceRevision,
      workspaceIntelligenceRevision,
    ],
  );
  const codeTestDiscovery = useMemo<CodeTestDiscovery>(
    () => discoverCodeTests(codeTestSources),
    [codeTestSources],
  );
  const testExplorerAvailable =
    isCodeTestLanguage(language) || codeTestDiscovery.totalTests > 0;
  useEffect(() => {
    if (testExplorerAvailable || !testExplorerOpen) return;
    setTestExplorerOpen(false);
    setTestRunError(null);
  }, [testExplorerAvailable, testExplorerOpen]);
  const testReceiptFreshness = useMemo<CodeTestReceiptFreshness>(() => {
    if (!testRunReceipt) return "none";
    if (workspaceCatalogLoading || workspaceDetailsLoading) return "checking";
    const trustedTimelineEntry = testRunTimeline.some(
      (entry) => entry.receipt.runId === testRunReceipt.runId,
    );
    if (
      !trustedTimelineEntry &&
      testRunExactSourcesRef.current?.runId !== testRunReceipt.runId
    ) {
      return "stale";
    }
    const receiptPageIds = new Set(
      testRunReceipt.sources.map((source) => source.pageId),
    );
    const currentReceiptSources = codeTestSources.filter((source) =>
      receiptPageIds.has(source.pageId),
    );
    return codeTestRunReceiptIsCurrent(testRunReceipt, currentReceiptSources)
      ? "current"
      : "stale";
  }, [
    codeTestSources,
    testRunReceipt,
    testRunTimeline,
    workspaceCatalogLoading,
    workspaceDetailsLoading,
  ]);
  const selectedTestRunTimelineEntry =
    selectedTestRunTimelineIndex === null
      ? null
      : (testRunTimeline[selectedTestRunTimelineIndex] ?? null);
  const latestTestRunTimelineEntry = testRunTimeline[0] ?? null;
  const selectedTestRunHistoryCurrent = Boolean(
    selectedTestRunTimelineEntry &&
      codeTestRunReceiptIsCurrent(
        selectedTestRunTimelineEntry.receipt,
        codeTestSources.filter((source) =>
          selectedTestRunTimelineEntry.receipt.sources.some(
            (identity) => identity.pageId === source.pageId,
          ),
        ),
      ),
  );
  const latestTestRunHistoryCurrent = Boolean(
    latestTestRunTimelineEntry &&
      codeTestRunReceiptIsCurrent(
        latestTestRunTimelineEntry.receipt,
        codeTestSources.filter((source) =>
          latestTestRunTimelineEntry.receipt.sources.some(
            (identity) => identity.pageId === source.pageId,
          ),
        ),
      ),
  );
  const exactTestRunSources = testRunExactSourcesRef.current;
  const testDebuggableTestIds = new Set(
    codeTestDiscovery.files.flatMap((file) =>
      file.tests
        .filter(
          (test) =>
            test.language === "javascript" ||
            test.language === "typescript" ||
            test.language === "python",
        )
        .map((test) => test.id),
    ),
  );
  const selectedAiFixSource =
    selectedTestRunTimelineEntry?.receipt.sources.length === 1
      ? selectedTestRunTimelineEntry.receipt.sources[0]
      : null;
  const selectedTestRunAiFixAvailable = Boolean(
    selectedAiFixSource &&
      selectedAiFixSource.pageId === pageId &&
      (selectedAiFixSource.language === "javascript" ||
        selectedAiFixSource.language === "typescript") &&
      selectedTestRunTimelineEntry?.sourceDigests.some(
        (digest) =>
          digest.pageId === selectedAiFixSource.pageId &&
          /^[0-9a-f]{64}$/.test(digest.sourceSha256),
      ) &&
      selectedTestRunTimelineEntry.receipt.results.some(
        (result) =>
          result.status === "failed" &&
          result.pageId === selectedAiFixSource.pageId &&
          result.language === selectedAiFixSource.language,
      ),
  );
  const testDebugReceiptAvailable = Boolean(
    testRunReceipt &&
      testRunReceipt.sources.every(
        (identity) =>
          identity.language !== "lua" && identity.language !== "ruby",
      ) &&
      exactTestRunSources?.runId === testRunReceipt.runId &&
      testRunReceipt.sources.every((identity) => {
        const source = exactTestRunSources.sources.get(identity.pageId);
        return Boolean(
          source &&
            source.path === identity.path &&
            source.language === identity.language,
        );
      }),
  );
  useEffect(() => {
    if (!testExplorerOpen) return;
    const available = new Set(
      codeTestDiscovery.files.flatMap((file) => file.tests.map((test) => test.id)),
    );
    setSelectedCodeTestIds((previous) => {
      if (!testSelectionInitializedRef.current) {
        testSelectionInitializedRef.current = true;
        return available;
      }
      const next = new Set([...previous].filter((testId) => available.has(testId)));
      return next.size === previous.size && [...next].every((testId) => previous.has(testId))
        ? previous
        : next;
    });
  }, [codeTestDiscovery.files, testExplorerOpen]);
  const workspaceTree = useMemo(
    () =>
      buildCodeWorkspaceTree(
        workspaceCatalog.files,
        workspaceCollapsedPaths,
      ),
    [workspaceCatalog.files, workspaceCollapsedPaths],
  );
  const workspaceOccupiedPathIdentities = useMemo(
    () =>
      new Set(
        workspaceCatalog.files.map((file) =>
          codeWorkspacePathIdentity(file.path),
        ),
      ),
    [workspaceCatalog.files],
  );
  const workspaceNewFilePath = useMemo(
    () =>
      suggestedCodeWorkspacePath(
        codeExportFilename(null, "untitled", language),
        workspaceOccupiedPathIdentities,
      ),
    [language, workspaceOccupiedPathIdentities],
  );

  const workspaceProblems = useMemo(
    () => {
      // The collector reads the registry directly; revisions are its refresh
      // signals and must remain explicit dependencies.
      void codeWindowRegistryRevision;
      void diagnosticCount;
      void problemsSnapshotRevision;
      const registeredEntry = registeredCodeWindowEntryRef.current;
      // A draft under review has no page yet: `registeredEntry?.pageId ===
      // pageId` then held for no entry at all (undefined === undefined) and
      // the window crashed reading its windowId.
      const entries = guestMode
        ? registeredEntry &&
          registeredEntry.pageId === pageId &&
          registeredEntry.windowId === windowId
          ? [registeredEntry]
          : []
        : workspaceNotebookId
          ? getOpenCodeWindowSnapshots(
              undefined,
              undefined,
              workspaceNotebookId,
            ).map((snapshot) => snapshot.entry)
          : [];
      return collectWorkspaceProblems(
        entries,
      );
    },
    // `diagnosticCount` makes the current window update immediately even before
    // its registry notification is delivered; peer windows flow through the
    // monotonic registry revision.
    [
      codeWindowRegistryRevision,
      diagnosticCount,
      guestMode,
      pageId,
      problemsSnapshotRevision,
      windowId,
      workspaceNotebookId,
    ],
  );
  const parsedQuickOpenQuery = useMemo(
    () => parseCodeQuickOpenQuery(quickOpenQuery),
    [quickOpenQuery],
  );
  const quickOpenResult = useMemo<CodeQuickOpenResult>(() => {
    if (!quickOpenOpen) {
      return {
        entries: [],
        total: 0,
        inspected: 0,
        truncated: false,
      };
    }

    const all = getOpenCodeWindowSnapshots(
      undefined,
      undefined,
      workspaceNotebookId,
    );
    const openByPageId = new Map(
      all.map((snapshot) => [snapshot.pageId, snapshot] as const),
    );
    const workspacePageIds = new Set(
      workspaceCatalog.files.map((file) => file.pageId),
    );
    const workspaceItems = workspaceCatalog.files.map((file) => {
      const open = openByPageId.get(file.pageId);
      return {
        id: `page:${file.pageId}`,
        label: file.path,
        language: open?.language ?? file.language,
        current: file.pageId === pageId,
      };
    });
    const uncataloguedOpenItems = all
      .filter((snapshot) => !workspacePageIds.has(snapshot.pageId))
      .map((snapshot) => ({
        id: `window:${snapshot.bufferId}`,
        label: snapshot.label,
        language: snapshot.language,
        current: snapshot.bufferId === currentCodeWindowBufferId,
      }));
    return filterCodeQuickOpenItems(
      [...workspaceItems, ...uncataloguedOpenItems],
      parsedQuickOpenQuery.filter,
    );
    // Registry membership and live labels are external inputs intentionally
    // represented by the monotonic revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    codeWindowRegistryRevision,
    currentCodeWindowBufferId,
    pageId,
    parsedQuickOpenQuery.filter,
    quickOpenOpen,
    workspaceCatalog.files,
  ]);
  const safeQuickOpenActiveIndex =
    quickOpenResult.entries.length === 0
      ? -1
      : Math.min(quickOpenActiveIndex, quickOpenResult.entries.length - 1);
  const hasOpenWorkspacePeer = getOpenCodeWindowSnapshots(
    pageId,
    windowId,
    workspaceNotebookId,
  ).some(
    (snapshot) => isWorkspaceLanguage(snapshot.language),
  );
  const hasAuthorizedWorkspacePeer =
    !guestMode &&
    workspaceCatalog.files.some(
      (file) =>
        file.pageId !== pageId &&
        file.pageType === "code" &&
        isWorkspaceLanguage(file.language),
    );
  const hasWorkspaceDiagnosticsPeer =
    hasOpenWorkspacePeer || hasAuthorizedWorkspacePeer;

  const requestEditorViewCommand = useCallback(
    (command: CodeEditorViewCommand, fontScale?: number) => {
      // The editor keeps navigation/view commands available to viewers while
      // disabling and rechecking every write-capable palette contribution.
      flushPendingContentRender();
      editorViewCommandRequestIdRef.current += 1;
      setEditorViewCommandRequest({
        requestId: editorViewCommandRequestIdRef.current,
        command,
        fontScale,
        viewStateKey: activeEditorViewStateKeyRef.current,
      });
    },
    [flushPendingContentRender],
  );

  const handleEditorViewCommandRequestHandled = useCallback(
    (requestId: number) => {
      setEditorViewCommandRequest((current) =>
        current?.requestId === requestId ? undefined : current,
      );
    },
    [],
  );

  const handleEditorViewStateChange = useCallback(
    (next: CodeEditorViewState) => {
      // The editor reports this on every change of its own; skip the
      // update outright when nothing changed (a functional update would
      // still schedule a render while the window is busy loading).
      const previous = editorViewReportedRef.current;
      if (
        previous.outlineOpen === next.outlineOpen &&
        previous.problemsOpen === next.problemsOpen &&
        previous.compareOpen === next.compareOpen &&
        previous.compareAvailable === next.compareAvailable &&
        previous.minimapOn === next.minimapOn &&
        previous.minimapAvailable === next.minimapAvailable &&
        previous.wordWrapOn === next.wordWrapOn &&
        previous.renderWhitespaceOn === next.renderWhitespaceOn &&
        previous.bracketColorsOn === next.bracketColorsOn &&
        previous.indentGuidesOn === next.indentGuidesOn &&
        previous.bracketPairGuidesOn === next.bracketPairGuidesOn &&
        previous.stickyScrollOn === next.stickyScrollOn &&
        previous.stickyScrollAvailable === next.stickyScrollAvailable &&
        previous.fontScale === next.fontScale &&
        previous.canZoomOut === next.canZoomOut &&
        previous.canZoomIn === next.canZoomIn &&
        previous.settingsOpen === next.settingsOpen &&
        previous.commandPaletteOpen === next.commandPaletteOpen
      ) {
        return;
      }
      editorViewReportedRef.current = next;
      setEditorViewState(next);
    },
    [],
  );

  const requestEditorEditCommand = useCallback(
    (command: CodeEditorEditCommand, viewStateKey?: string) => {
      if (
        editCommandAuthorsDocument(command) &&
        !codeMayAuthorRef.current
      ) {
        return;
      }
      flushPendingContentRender();
      editorEditCommandRequestIdRef.current += 1;
      setEditorEditCommandRequest({
        requestId: editorEditCommandRequestIdRef.current,
        command,
        viewStateKey: viewStateKey ?? activeEditorViewStateKeyRef.current,
      });
    },
    [flushPendingContentRender],
  );

  const handleEditorEditCommandRequestHandled = useCallback(
    (requestId: number) => {
      setEditorEditCommandRequest((current) =>
        current?.requestId === requestId ? undefined : current,
      );
    },
    [],
  );

  const handleEditorEditStateChange = useCallback(
    (next: CodeEditorEditState) => {
      const previous = editorEditReportedRef.current;
      if (
        previous.canUndo === next.canUndo &&
        previous.canRedo === next.canRedo &&
        previous.findOpen === next.findOpen &&
        previous.canFormat === next.canFormat &&
        previous.canToggleComment === next.canToggleComment &&
        previous.cursorCount === next.cursorCount
      ) {
        return;
      }
      editorEditReportedRef.current = next;
      setEditorEditState(next);
    },
    [],
  );

  const handleEditorIntelligenceCommandRequestHandled = useCallback(
    (requestId: number) => {
      setEditorIntelligenceCommandRequest((current) =>
        current?.requestId === requestId ? undefined : current,
      );
    },
    [],
  );

  const handleEditorIntelligenceStateChange = useCallback(
    (next: CodeEditorIntelligenceState) => {
      const previous = editorIntelligenceReportedRef.current;
      if (
        previous.canGoBack === next.canGoBack &&
        previous.canGoForward === next.canGoForward &&
        previous.symbolNavigationAvailable ===
          next.symbolNavigationAvailable &&
        previous.typeNavigationAvailable === next.typeNavigationAvailable &&
        previous.referencesAvailable === next.referencesAvailable &&
        previous.referencesBusy === next.referencesBusy &&
        previous.renameAvailable === next.renameAvailable &&
        previous.codeActionsAvailable === next.codeActionsAvailable &&
        previous.organizeImportsAvailable === next.organizeImportsAvailable
      ) {
        return;
      }
      editorIntelligenceReportedRef.current = next;
      setEditorIntelligenceState(next);
    },
    [],
  );

  const requestEditorReviewCommand = useCallback(
    (command: CodeEditorReviewCommand) => {
      if (
        AUTHORING_REVIEW_COMMANDS.has(command) &&
        !codeMayAuthorRef.current
      ) {
        return;
      }
      flushPendingContentRender();
      editorReviewCommandRequestIdRef.current += 1;
      setEditorReviewCommandRequest({
        requestId: editorReviewCommandRequestIdRef.current,
        command,
        viewStateKey: activeEditorViewStateKeyRef.current,
      });
    },
    [flushPendingContentRender],
  );

  // A rewrite's review: Next change from the review's own bar, and the
  // comparison's state back to it (lib/code-runner/code-draft-review).
  const draftComparison = draftReview?.comparison ?? null;
  const draftNextChangeRequest = draftComparison?.nextChangeRequest ?? 0;
  const handledDraftNextChangeRef = useRef(draftNextChangeRequest);
  useEffect(() => {
    if (draftNextChangeRequest === handledDraftNextChangeRef.current) return;
    handledDraftNextChangeRef.current = draftNextChangeRequest;
    requestEditorReviewCommand("nextChange");
  }, [draftNextChangeRequest, requestEditorReviewCommand]);

  const draftComparisonStateChange = draftComparison?.onStateChange;
  useEffect(() => {
    draftComparisonStateChange?.({
      changeCount: editorReviewState.changeCount,
      open: editorReviewState.compareOpen,
    });
  }, [
    draftComparisonStateChange,
    editorReviewState.changeCount,
    editorReviewState.compareOpen,
  ]);

  const handleEditorReviewCommandRequestHandled = useCallback(
    (requestId: number) => {
      setEditorReviewCommandRequest((current) =>
        current?.requestId === requestId ? undefined : current,
      );
    },
    [],
  );

  const handleEditorReviewStateChange = useCallback(
    (next: CodeEditorReviewState) => {
      const previous = editorReviewReportedRef.current;
      if (
        previous.compareAvailable === next.compareAvailable &&
        previous.compareOpen === next.compareOpen &&
        previous.sourceSelected === next.sourceSelected &&
        previous.threeWayActive === next.threeWayActive &&
        previous.changeCount === next.changeCount &&
        previous.canNavigate === next.canNavigate &&
        previous.canApply === next.canApply &&
        previous.canResolve === next.canResolve &&
        previous.canApplyMerge === next.canApplyMerge
      ) {
        return;
      }
      editorReviewReportedRef.current = next;
      setEditorReviewState(next);
    },
    [],
  );

  const requestEditorExecutionCommand = useCallback(
    (command: CodeEditorExecutionCommand) => {
      flushPendingContentRender();
      editorExecutionCommandRequestIdRef.current += 1;
      setEditorExecutionCommandRequest({
        requestId: editorExecutionCommandRequestIdRef.current,
        command,
        viewStateKey: activeEditorViewStateKeyRef.current,
      });
    },
    [flushPendingContentRender],
  );

  const handleEditorExecutionCommandRequestHandled = useCallback(
    (requestId: number) => {
      setEditorExecutionCommandRequest((current) =>
        current?.requestId === requestId ? undefined : current,
      );
    },
    [],
  );

  const handleEditorExecutionStateChange = useCallback(
    (next: CodeEditorExecutionState) => {
      const previous = editorExecutionReportedRef.current;
      if (
        previous.selectedChars === next.selectedChars &&
        previous.selectionCount === next.selectionCount &&
        previous.currentLine === next.currentLine &&
        previous.selectedText === next.selectedText &&
        previous.selectedTextTruncated === next.selectedTextTruncated &&
        previous.selectionFrom === next.selectionFrom &&
        previous.selectionTo === next.selectionTo
      ) {
        return;
      }
      editorExecutionReportedRef.current = next;
      setEditorExecutionState(next);
    },
    [],
  );

  const requestDebugCommand = useCallback(
    (command: CodeDebugCommand) => {
      return;
      if (
        command === "addBreakpointCurrent" &&
        !codeMayAuthorRef.current
      ) {
        return;
      }
      flushPendingContentRender();
      debugCommandRequestIdRef.current += 1;
      setDebugCommandRequest({
        requestId: debugCommandRequestIdRef.current,
        command,
        viewStateKey: debugViewStateKeyRef.current,
      });
    },
    [flushPendingContentRender],
  );

  const focusCodeEditor = useCallback(() => {
    const editorEl = codeWindowRef.current?.querySelector<HTMLElement>(
      '[data-testid="code-editor"]',
    );
    if (!editorEl) return;
    const cmEl = editorEl.querySelector<HTMLElement>(".cm-editor");
    const view = cmEl ? EditorView.findFromDOM(cmEl) : null;
    if (view) {
      view.focus();
      return;
    }
    if (editorEl instanceof HTMLTextAreaElement) editorEl.focus();
  }, []);

  const hideOutputPanel = useCallback(() => {
    updateOutputPanelVisibility(false);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor, updateOutputPanelVisibility]);

  const liveCodeWindowBuffers = useCallback((): CodeWindowBufferText[] => {
    return getOpenCodeWindowSnapshots(
      undefined,
      undefined,
      workspaceNotebookId,
    ).map((snapshot) => ({
      bufferId: snapshot.bufferId,
      label: snapshot.label,
      language: snapshot.language,
      source: snapshot.text,
    }));
  }, [workspaceNotebookId]);

  const revealCodeRange = useCallback((rawFrom: number, rawTo: number) => {
    const editorEl = codeWindowRef.current?.querySelector<HTMLElement>(
      '[data-testid="code-editor"]',
    );
    if (!editorEl) return;

    const cmEl = editorEl.querySelector<HTMLElement>(".cm-editor");
    const view = cmEl ? EditorView.findFromDOM(cmEl) : null;
    if (view) {
      const docLength = view.state.doc.length;
      const from = Math.min(Math.max(Math.trunc(rawFrom) || 0, 0), docLength);
      const to = Math.min(
        Math.max(Math.trunc(rawTo) || from, from),
        docLength,
      );
      try {
        view.dispatch({
          selection: EditorSelection.range(from, to),
          effects: [
            EditorView.scrollIntoView(from, { y: "center" }),
            flashLocatedLineEffect.of(from),
          ],
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        /* Detached editor/view: diagnostics stay visible and inert. */
      }
      return;
    }

    if (!(editorEl instanceof HTMLTextAreaElement)) return;
    const from = Math.min(
      Math.max(Math.trunc(rawFrom) || 0, 0),
      editorEl.value.length,
    );
    const to = Math.min(
      Math.max(Math.trunc(rawTo) || from, from),
      editorEl.value.length,
    );
    try {
      editorEl.focus();
      editorEl.setSelectionRange(from, to);
    } catch {
      /* Detached textarea: diagnostics stay visible and inert. */
    }
  }, []);

  const openWorkspaceProblems = useCallback(() => {
    setQuickOpenOpen(false);
    setFifOpen(false);
    setTestExplorerOpen(false);
    setWorkspaceProblemsOpen(true);
    requestAnimationFrame(() => workspaceProblemsPanelRef.current?.focus());
  }, []);

  const closeWorkspaceProblems = useCallback(() => {
    setWorkspaceProblemsOpen(false);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor]);

  const openWorkspaceExplorer = useCallback(() => {
    setQuickOpenOpen(false);
    setFifOpen(false);
    setWorkspaceProblemsOpen(false);
    setTestExplorerOpen(false);
    setWorkspaceExplorerOpen(true);
    requestAnimationFrame(() => workspaceExplorerPanelRef.current?.focus());
  }, []);

  const closeWorkspaceExplorer = useCallback(() => {
    setWorkspaceExplorerOpen(false);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor]);

  const closeTestExplorer = useCallback(() => {
    setTestExplorerOpen(false);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor]);

  const toggleWorkspaceDirectory = useCallback((path: string) => {
    setWorkspaceCollapsedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const openQuickOpen = useCallback(() => {
    quickOpenReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setFifOpen(false);
    setWorkspaceProblemsOpen(false);
    setTestExplorerOpen(false);
    setQuickOpenQuery("");
    setQuickOpenActiveIndex(0);
    setQuickOpenOpen(true);
    requestAnimationFrame(() => quickOpenInputRef.current?.select());
  }, []);

  const closeQuickOpen = useCallback(() => {
    setQuickOpenOpen(false);
    requestAnimationFrame(() => {
      const returnTarget = quickOpenReturnFocusRef.current;
      quickOpenReturnFocusRef.current = null;
      if (returnTarget?.isConnected) {
        returnTarget.focus();
        return;
      }
      focusCodeEditor();
    });
  }, [focusCodeEditor]);

  const activateWorkspaceFile = useCallback(
    (
      file: CodeWorkspaceFile,
      location: CodeWorkspaceLocation | CodeQuickOpenLocation | null = null,
    ) => {
      setQuickOpenOpen(false);
      quickOpenReturnFocusRef.current = null;
      const targetSnapshot = getOpenCodeWindowSnapshots(
        undefined,
        undefined,
        workspaceNotebookId,
      ).find(
        (snapshot) => snapshot.pageId === file.pageId,
      );
      if (targetSnapshot) {
        requestAnimationFrame(() => {
          const target = targetSnapshot.entry;
          try {
            if (
              location &&
              "from" in location &&
              typeof location.from === "number" &&
              typeof location.to === "number" &&
              target.revealRange
            ) {
              target.revealRange(location.from, location.to);
            } else if (location && target.revealRange) {
              const offset = codeQuickOpenOffset(
                targetSnapshot.text,
                location,
              );
              target.revealRange(offset, offset);
            } else if (target.focus) {
              target.focus();
            } else {
              focusCodeEditor();
            }
          } catch {
            focusCodeEditor();
          }
        });
        return;
      }

      if (!windowManagerActions) {
        requestAnimationFrame(focusCodeEditor);
        return;
      }
      if (location && file.pageType === "code") {
        rememberCodeWorkspaceLocation(file.pageId, location);
      }
      windowManagerActions.openWindow({
        type: "note",
        title: file.title || file.path,
        meta: {
          notebookId: file.notebookId || workspaceNotebookId,
          pageId: file.pageId,
          pageType: file.pageType,
        },
      });
    },
    [focusCodeEditor, windowManagerActions, workspaceNotebookId],
  );

  const activateQuickOpenEntry = useCallback(
    (entryId: string) => {
      if (entryId.startsWith("page:")) {
        const file = workspaceFilesByPageId.get(entryId.slice(5));
        if (file) {
          activateWorkspaceFile(file, parsedQuickOpenQuery.location);
          return;
        }
      }
      const bufferId = entryId.startsWith("window:")
        ? entryId.slice(7)
        : entryId;
      const targetSnapshot = getOpenCodeWindowSnapshots(
        undefined,
        undefined,
        workspaceNotebookId,
      ).find(
        (snapshot) => snapshot.bufferId === bufferId,
      );
      setQuickOpenOpen(false);
      quickOpenReturnFocusRef.current = null;
      requestAnimationFrame(() => {
        const target = targetSnapshot?.entry;
        try {
          if (
            targetSnapshot &&
            target?.revealRange &&
            parsedQuickOpenQuery.location
          ) {
            const offset = codeQuickOpenOffset(
              targetSnapshot.text,
              parsedQuickOpenQuery.location,
            );
            target.revealRange(offset, offset);
            return;
          }
          if (target?.focus) {
            target.focus();
            return;
          }
        } catch {
          // The target closed between list selection and this frame.
        }
        focusCodeEditor();
      });
    },
    [
      activateWorkspaceFile,
      focusCodeEditor,
      parsedQuickOpenQuery.location,
      workspaceFilesByPageId,
      workspaceNotebookId,
    ],
  );

  const publishCodeProblems = useCallback(() => {
    if (activeDiagnosticOwnerRef.current !== diagnosticOwner) return;
    const combined = mergeCodeProblems(
      editorProblemsRef.current,
      compilerProblemsRef.current,
    );
    problemsRef.current = combined;
    const compilerCount = Math.max(
      0,
      combined.length - editorProblemsRef.current.length,
    );
    const total = editorDiagnosticCountRef.current + compilerCount;
    const signature = codeProblemsPublicationSignature(total, combined);
    if (problemsPublicationSignatureRef.current === signature) return;
    problemsPublicationSignatureRef.current = signature;
    diagnosticCountRef.current = total;
    setDiagnosticCount(total);
    // Count and bounded rows arrive through separate CM6 callbacks. A list can
    // therefore change after the count already rendered (including the common
    // 0 -> 1 syntax-lint path). Publish an explicit snapshot revision so the
    // canonical Problems panel rereads the live registry getters even when the
    // integer count is unchanged.
    setProblemsSnapshotRevision((revision) => revision + 1);
    notifyCodeWindowRegistryChange(registeredCodeWindowEntryRef.current ?? undefined);
  }, [diagnosticOwner]);

  const handleDiagnosticCountChange = useCallback(
    (count: number) => {
      if (activeDiagnosticOwnerRef.current !== diagnosticOwner) return;
      editorDiagnosticCountRef.current = count;
      publishCodeProblems();
    },
    [diagnosticOwner, publishCodeProblems],
  );

  const handleProblemsChange = useCallback(
    (problems: readonly ProblemEntry[]) => {
      if (activeDiagnosticOwnerRef.current !== diagnosticOwner) return;
      editorProblemsRef.current = problems;
      publishCodeProblems();
    },
    [diagnosticOwner, publishCodeProblems],
  );

  const currentCompilerProblems = useMemo<readonly ProblemEntry[]>(() => {
    if (
      contentSnapshotPending ||
      !output?.error ||
      !runOutputNavigationAuthority ||
      runOutputNavigationAuthority.output !== output ||
      runOutputNavigationAuthority.pageId !== pageId ||
      runOutputNavigationAuthority.language !== language ||
      runOutputNavigationAuthority.source !== content
    ) {
      return [];
    }
    const classification = t(
      languageExecutionErrorMessageKey("compile-failed"),
    );
    const isCompileFailure =
      output.executionErrorCode === "compile-failed" ||
      output.error === classification ||
      output.error.startsWith(`${classification}\n`);
    if (!isCompileFailure) return [];
    // TeX's own log places every error in its file; this file is main.tex.
    if (
      language === "latex" &&
      latexLog &&
      latexCompile &&
      isSameCompiledOutput(latexCompile.output, output)
    ) {
      return compilerProblemsFromLatexLog(content, latexLog.entries, "main.tex");
    }
    // TeX prints its errors on the compile's stdout, so a LaTeX failure's
    // locations are in the log lines as well as the error text.
    return isCompileFailure
      ? compilerProblemsForExecution(
          language,
          content,
          language === "latex"
            ? [output.error, ...output.logs].join("\n")
            : output.error,
        )
      : [];
  }, [
    content,
    contentSnapshotPending,
    language,
    latexCompile,
    latexLog,
    output,
    pageId,
    runOutputNavigationAuthority,
    t,
  ]);

  useEffect(() => {
    compilerProblemsRef.current = currentCompilerProblems;
    publishCodeProblems();
  }, [currentCompilerProblems, publishCodeProblems]);

  // Reuse the same engine-agnostic line navigation as multi-buffer host traceback
  // frames, but scope all DOM lookup to THIS CodeWindow so two open code pages
  // can never move each other's caret. The parsed frame is already marked
  // `cell` only for synthetic runtime filenames such as <exec>/<anonymous>;
  // real external files stay inert in CellOutput and are guarded again here.
  const handleTracebackFrameClick = useCallback((frame: TracebackFrame) => {
    if (!frame.cell) return;
    const documentLine = executionLineToDocumentLine(
      lastRunScope,
      frame.line,
    );
    if (documentLine === null) return;
    const editorEl = codeWindowRef.current?.querySelector<HTMLElement>(
      '[data-testid="code-editor"]',
    );
    if (!editorEl) return;

    const cmEl = editorEl.querySelector<HTMLElement>(".cm-editor");
    const view = cmEl ? EditorView.findFromDOM(cmEl) : null;
    if (view) {
      const { from, to } = lineToOffsetRange(
        view.state.doc.toString(),
        documentLine,
      );
      try {
        view.dispatch({
          selection: EditorSelection.range(from, to),
          effects: [
            EditorView.scrollIntoView(from, { y: "center" }),
            flashLocatedLineEffect.of(from),
          ],
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        /* Detached editor/view: leave the traceback visible and do nothing. */
      }
      return;
    }

    if (!(editorEl instanceof HTMLTextAreaElement)) return;
    const { from, to } = lineToOffsetRange(editorEl.value, documentLine);
    try {
      editorEl.focus();
      editorEl.setSelectionRange(from, to);
      editorEl.scrollTop = Math.max(
        0,
        (documentLine - 1) * 20 - editorEl.clientHeight / 2,
      );
    } catch {
      /* Detached/non-focusable fallback editor: safe no-op. */
    }
  }, [lastRunScope]);

  const ensureCodePageBufferLease = useCallback((causalEpoch = 0) => {
    if (!ENABLE_CODE_PAGE_SHARED_BUFFER || guestMode) return null;
    const authority: CodePageBufferAuthority = codeLocalPreviewPageRef.current === pageId
      ? { ...codePageBufferAuthority, binding: "local", mayWriteNow: false }
      : codePageBufferAuthority;
    const current = codePageBufferLeaseRef.current;
    if (
      current?.pageId === pageId &&
      current.matchesAuthority(authority)
    ) {
      current.updateAuthority(authority);
      return current;
    }
    current?.release();
    const lease = acquireCodePageBuffer(pageId, authority, causalEpoch);
    codePageBufferLeaseRef.current = lease;
    setCodePageBufferBinding({
      lease,
      generation: lease.getBindingGeneration(),
      renderState: codePageBufferRenderState(lease),
    });
    return lease;
  }, [codePageBufferAuthority, guestMode, pageId]);

  // The page body this window last took in whole; a "remote" load that
  // differs from it only in text is a peer's edit (see handleLoaded).
  const lastLoadedCodePageRef = useRef<{
    readonly pageId: string;
    readonly contentVersion: number;
    readonly title: string | null | undefined;
    readonly contentJson: unknown;
  } | null>(null);
  const applySharedBufferPeerTextRef = useRef<(content: string) => void>(
    () => {},
  );
  const handleLoaded = useCallback((page: PageItem, source?: AutosavedPageLoadSource) => {
    if (source === "local-preview" && page.page_type !== "code") return;
    codeLocalPreviewPageRef.current = source === "local-preview" ? pageId : null;
    const loadedContent = page.content_json?.content;
    if (
      typeof loadedContent === "string" &&
      loadedContent.length > MAX_CODE_SOURCE_CHARS
    ) {
      // The server/legacy record is outside the canonical Code page contract.
      // Preserve the current safe buffer and never seed the shared Y.Text with
      // a value the API cannot subsequently save.
      markCodeSourceLimitExceeded();
      setCodeHydrationBlocked(true);
      return;
    }
    // Every peer keystroke the room delivers arrives here as a "remote" load.
    // When it changes only the text of the page this window already holds,
    // it is no new document: rehydrating retired the debug session and
    // rebuilt the window's page state for each character. Take the text the
    // way a peer's edit is taken and keep everything else.
    const lastLoaded = lastLoadedCodePageRef.current;
    if (
      source === "remote" &&
      hydratedPageId === pageId &&
      page.id === pageId &&
      typeof loadedContent === "string" &&
      lastLoaded?.pageId === pageId &&
      lastLoaded.contentVersion === (page.content_version ?? 0) &&
      lastLoaded.title === page.title &&
      pageStoredJsonEquals(
        codePageBodyWithoutText(page.content_json),
        codePageBodyWithoutText(lastLoaded.contentJson),
      )
    ) {
      lastLoadedCodePageRef.current = {
        ...lastLoaded,
        contentJson: page.content_json ?? null,
      };
      applySharedBufferPeerTextRef.current(loadedContent);
      return;
    }
    // A hydration/replacement is a fresh page owner even when its bytes and
    // content version happen to match. Retire a selected-test debug identity
    // before applying the replacement so late pauses cannot attach to it.
    // The acknowledgement of this window's own save is not a replacement,
    // though: it reloads the page the editor already holds, byte for byte, in
    // its language. Taking it for a new owner retired every guard taken on the
    // document a moment earlier, so a refactor that had just been applied and
    // saved could no longer be undone as a whole ("edited again") with no edit.
    const lastPersisted = lastPersistedContentJsonRef.current;
    const echoesHeldBuffer =
      hydratedPageId === pageId &&
      page.id === pageId &&
      lastPersisted !== null &&
      loadedContent === contentRef.current &&
      pageStoredJsonEquals(page.content_json ?? null, lastPersisted);
    if (!echoesHeldBuffer) {
      activeCodeTestDebugSessionRef.current = null;
      setActiveCodeTestDebugSession(null);
      codeTestDebugHydrationGenerationRef.current += 1;
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      setCodeTestDebugHydrationGeneration(
        codeTestDebugHydrationGenerationRef.current,
      );
    }
    debugViewStateKeyRef.current = `page:${pageId}`;
    const pendingTestDebug = pendingCodeTestDebugHandoffRef.current;
    const expectedTargetHydration =
      pendingTestDebug?.targetPageId === pageId && hydratedPageId !== pageId;
    if (!expectedTargetHydration) {
      pendingCodeTestDebugHandoffRef.current = null;
    }
    if (pendingTestDebug && !expectedTargetHydration) {
      discardCodeTestDebugHandoffRequest(pendingTestDebug.requestId);
    }
    testRunExactSourcesRef.current = null;
    let hydrationGuard = versionHydrationGuardRef.current;
    if (hydrationGuard?.snapshot.pageId !== pageId) {
      versionHydrationGuardRef.current = null;
      hydrationGuard = null;
    }
    if (hydrationGuard) {
      const samePage = page.id === pageId;
      if (
        !samePage ||
        !versionWriteSnapshotIsCurrent(hydrationGuard.snapshot)
      ) {
        // reload() has already rebased the autosave controller to the restored
        // server version before it calls onLoaded. Put the newer live draft
        // straight back into that controller and skip hydration, so typing
        // during the request is both visible AND still pending for save.
        if (samePage && codeMayAuthorRef.current) {
          const liveDraft = buildPageDraft(
            languageRef.current,
            contentRef.current,
          );
          const lease = codePageBufferLeaseRef.current;
          if (lease?.pageId === pageId) {
            lease.publishDraft(liveDraft);
          } else {
            queueVersionDraftRef.current(liveDraft);
          }
          hydrationGuard.preserved = true;
        }
        return;
      }
      hydrationGuard.accepted = true;
    }
    setCodeHydrationBlocked(false);
    acceptCodeSourceLength(
      typeof loadedContent === "string" ? loadedContent : "",
    );
    // A loaded page is a new document generation even when reload keeps the
    // same pageId. Retire pending file-read continuations and page-scoped UI
    // before hydrating the replacement buffer.
    codeImportGenerationRef.current += 1;
    codeImportingRef.current = false;
    codeImportDragDepthRef.current = 0;
    setCodeImporting(false);
    setCodeImportDragActive(false);
    setCodeImportError(null);
    // An import saves at once, and that save's acknowledgement loads the
    // imported file itself: clearing here took its Undo away within a second.
    // It stays offered until the page holds something else.
    const confirmsImport =
      importedFileNameRef.current !== null &&
      loadedContent === contentRef.current &&
      page.content_json?.language === languageRef.current;
    if (!confirmsImport) {
      setImportedFileName(null);
      setCodeImportSnapshot(null);
    }
    let loadedPage = page;
    if (ENABLE_CODE_PAGE_SHARED_BUFFER && !guestMode) {
      const lease = ensureCodePageBufferLease(page.page_causal_checkpoint?.epoch ?? 0);
      if (!lease) return;
      const canonicalDraft = lease.hydrate(
        {
          title: page.title,
          content_json: page.content_json as Record<string, unknown>,
        },
        page.content_version ?? 0,
      );
      setCodePageBufferSaveState(lease.getSaveState());
      loadedPage = {
        ...page,
        ...(canonicalDraft.title !== undefined
          ? { title: canonicalDraft.title }
          : {}),
        ...(canonicalDraft.content_json !== undefined
          ? { content_json: canonicalDraft.content_json }
          : {}),
      };
    }
    const cj = loadedPage.content_json as
      { language?: unknown; content?: unknown } | undefined;
    const restoredContent =
      typeof cj?.content === "string" ? cj.content : "";
    const restoredBinaryAsset =
      parseWorkspaceBinaryAsset(loadedPage.content_json) ??
      (restoredContent === ""
        ? parseWorkspaceBinaryAsset(page.content_json)
        : null);
    binaryAssetRef.current = restoredBinaryAsset;
    setBinaryAsset(restoredBinaryAsset);
    const restoredLanguage =
      cj?.language === undefined
        ? "javascript"
        : (codeLanguageId(cj.language) ?? "plaintext");
    languageRef.current = restoredLanguage;
    setLanguage(restoredLanguage);
    installAuthoritativeContent(restoredContent);
    const restoredSourceFileName = restoreCodePageSourceFilename(
      loadedPage.content_json,
    );
    sourceFileNameRef.current = restoredSourceFileName;
    setSourceFileName(restoredSourceFileName);
    const persistedWorkspacePath = restoreCodeWorkspacePath(
      loadedPage.content_json,
    );
    const restoredWorkspacePath =
      persistedWorkspacePath ??
      codeExportFilename(
        restoredSourceFileName,
        loadedPage.title || loadedPage.id,
        restoredLanguage,
      );
    workspacePathExplicitRef.current = persistedWorkspacePath !== null;
    workspacePathRef.current = restoredWorkspacePath;
    setWorkspacePath(restoredWorkspacePath);
    setWorkspaceNotebookId(loadedPage.notebook_id ?? "");
    setWorkspaceCurrentTitle(loadedPage.title || loadedPage.id);
    setWorkspaceCurrentContentVersion(loadedPage.content_version ?? 0);
    setHydratedExecutionPageAuthority({
      pageId: loadedPage.id,
      language: restoredLanguage,
      contentVersion: loadedPage.content_version ?? 0,
    });
    setWorkspaceRefreshEpoch((value) => value + 1);
    pendingWorkspaceLocationRef.current = takeCodeWorkspaceLocation(
      loadedPage.id,
    );
    setSourceFileRenameDraft(null);
    const restoredLineEnding = restoreCodePageLineEnding(
      loadedPage.content_json,
    );
    lineEndingRef.current = restoredLineEnding;
    setLineEnding(restoredLineEnding);
    const restoredSourceEncoding = restoreCodePageSourceEncoding(
      loadedPage.content_json,
    );
    sourceEncodingRef.current = restoredSourceEncoding;
    setSourceEncoding(restoredSourceEncoding);
    const candidateRestoredOutput = restoreCodePageOutput(
      loadedPage.content_json,
    );
    const keepsHeldOutput =
      hydratedPageId === pageId &&
      page.id === pageId &&
      loadCarriesHeldRunOutput({
        held: persistedOutputAuthorityRef.current,
        heldOutput: persistedOutputRef.current,
        stdin: stdinTextRef.current,
        language: restoredLanguage,
        source: restoredContent,
        loadedOutput: candidateRestoredOutput,
        lastPersisted,
      });
    const restoredRunTimeline = restoreCodePageRunTimeline(
      loadedPage.content_json,
    );
    const restoredRunProfiles = restoreCodePageRunProfiles(
      loadedPage.content_json,
    );
    const restoredDebugTimeline = restoreCodeDebugTimeline(
      loadedPage.content_json,
    );
    const latestRestoredRun = restoredRunTimeline[0] ?? null;
    const restoredOutputTimelineNavigation =
      latestRestoredRun?.language === restoredLanguage &&
      latestRestoredRun.input.stdinBytes === 0
        ? restoreCodePageRunTimelineNavigation(
            latestRestoredRun,
            restoredContent,
          )
        : null;
    const restoredOutput =
      candidateRestoredOutput &&
      (!latestRestoredRun || restoredOutputTimelineNavigation)
        ? candidateRestoredOutput
        : null;
    const restoredRunNavigation = restoredOutput
      ? restoreCodePageRunNavigation(
          loadedPage.content_json,
          restoredContent,
        )
      : null;
    const restoredRunOutputCleared = restoreCodePageRunOutputCleared(
      loadedPage.content_json,
    );
    persistedRunOutputClearedRef.current = restoredRunOutputCleared;
    const candidateTimelineFallback =
      restoredOutput ||
      codePageRunOutputWasCleared(
        restoredRunOutputCleared,
        restoredRunTimeline[0],
      )
        ? null
        : (restoredRunTimeline[0] ?? null);
    const timelineFallbackNavigation =
      candidateTimelineFallback?.language === restoredLanguage &&
      candidateTimelineFallback.input.stdinBytes === 0
        ? restoreCodePageRunTimelineNavigation(
            candidateTimelineFallback,
            restoredContent,
          )
        : null;
    const timelineFallbackEntry = timelineFallbackNavigation
      ? candidateTimelineFallback
      : null;
    const visibleRunNavigation =
      restoredRunNavigation ?? timelineFallbackNavigation;
    if (!keepsHeldOutput) {
      persistedRunNavigationRef.current = restoredRunNavigation
        ? {
            source: restoredContent,
            persisted: restoredRunNavigation.persisted,
            selection: restoredRunNavigation.selection,
          }
        : null;
    }
    persistedRunTimelineRef.current = restoredRunTimeline;
    setRunTimeline(restoredRunTimeline);
    if (!keepsHeldOutput) {
      setSelectedRunTimelineIndex(timelineFallbackEntry ? 0 : null);
    }
    runProfileRequestGenerationRef.current += 1;
    persistedRunProfilesRef.current = restoredRunProfiles;
    setRunProfiles(restoredRunProfiles);
    persistedDebugTimelineRef.current = restoredDebugTimeline;
    setDebugTimeline(restoredDebugTimeline);
    setSelectedDebugTimelineIndex(restoredDebugTimeline.length > 0 ? 0 : null);
    if (!keepsHeldOutput) {
      setTracebackNavigationSource(
        visibleRunNavigation ? restoredContent : null,
      );
      persistedOutputRef.current = restoredOutput;
      persistedOutputAuthorityRef.current = restoredOutput
        ? {
            language: restoredLanguage,
            source: restoredContent,
            stdin: "",
            output: restoredOutput,
          }
        : null;
      setOutput(
        restoredOutput ??
          (timelineFallbackEntry
            ? codePageRunTimelineEntryToRunResult(timelineFallbackEntry)
            : null),
      );
      setLastRunScope(visibleRunNavigation?.selection ?? null);
    }
    const restoredTestRunTimeline = restoreCodeTestRunTimeline(
      loadedPage.content_json,
    );
    const restoredTestRunReceipt =
      restoredTestRunTimeline[0]?.receipt ??
      restoreCodeTestRunReceipt(loadedPage.content_json);
    testRunTimelineGenerationRef.current += 1;
    persistedTestRunTimelineRef.current = restoredTestRunTimeline;
    setTestRunTimeline(restoredTestRunTimeline);
    setSelectedTestRunTimelineIndex(
      restoredTestRunTimeline.length > 0 ? 0 : null,
    );
    persistedTestRunReceiptRef.current = restoredTestRunReceipt;
    testRunExactSourcesRef.current = null;
    testRunReceiptAuthoringGenerationRef.current = restoredTestRunReceipt &&
      codeMayAuthorRef.current
      ? codeAuthoringGenerationRef.current
      : null;
    setTestRunReceipt(restoredTestRunReceipt);
    setTestRunError(null);
    const restoredDebugConfiguration = restoreCodeDebugConfiguration(
      loadedPage.content_json,
    );
    debugConfigurationRef.current = restoredDebugConfiguration;
    setDebugConfiguration(restoredDebugConfiguration);
    titleRef.current = loadedPage.title || "";
    lastLoadedCodePageRef.current = {
      pageId,
      contentVersion: page.content_version ?? 0,
      title: page.title,
      contentJson: page.content_json ?? null,
    };
    setHydratedPageId(pageId);
  }, [
    acceptCodeSourceLength,
    buildPageDraft,
    ensureCodePageBufferLease,
    guestMode,
    hydratedPageId,
    installAuthoritativeContent,
    markCodeSourceLimitExceeded,
    pageId,
    versionWriteSnapshotIsCurrent,
  ]);

  const autosave = useAutosavedPageDocument({
    pageId,
    nativeCollaboration: activeCodePageBufferLease?.collaborationAdapter,
    // The same outage grace as this window's own verdict above: the shared
    // buffer's causal source asks the hook whether it may write, and a hook
    // that withdrew its verdict at the first failed authority read turned the
    // editor read-only about five seconds into a dropped connection.
    pageAuthorityOutageGraceMs: PAGE_AUTHORITY_OUTAGE_GRACE_MS,
    collabJson: false,
    onLoaded: handleLoaded,
    enabled: !guestMode,
    localHotPreviewPageType: "code",
  });
  // A normal PATCH acknowledgement replaces `autosave.page` with a new object
  // on every save. Keep the latest hydration inputs in a ref so the authority
  // effect below can read them without treating each content-version bump as
  // a permission transition (refreshAuthorization temporarily fails closed).
  const codePageBufferAuthorityHydrationRef = useRef({
    page: autosave.page,
    hydratedPageId,
    handleLoaded,
  });
  codePageBufferAuthorityHydrationRef.current = {
    page: autosave.page,
    hydratedPageId,
    handleLoaded,
  };

  const aclMayAuthor = pageWritable.known && pageWritable.writable;
  const pageHydrated = guestMode || hydratedPageId === pageId;
  const remoteExecutionPageAuthorityCurrent =
    // A draft's runs are authorized by the draft's route, not a saved page.
    draftRemoteExecution !== null ||
    executionCapability.status !== "available" ||
    executionCapability.mode !== "remote" ||
    (!autosave.isSaving &&
      !autosave.hasConflict &&
      hydratedExecutionPageAuthority.pageId === pageId &&
      hydratedExecutionPageAuthority.language === language &&
      hydratedExecutionPageAuthority.contentVersion ===
        workspaceCurrentContentVersion);
  const codeMayAuthor =
    !draftReviewing &&
    (guestMode ||
    (pageHydrated &&
      !codeHydrationBlocked &&
      !binaryAsset &&
      !Boolean(autosave.readOnly) &&
      aclMayAuthor));
  const runnable =
    pageHydrated &&
    !autosave.isLocalAuthorityPending &&
    !codeHydrationBlocked &&
    remoteExecutionPageAuthorityCurrent &&
    executionCapability.status === "available" &&
    (executionCapability.mode !== "remote" ||
      codeMayAuthor ||
      draftRemoteExecution !== null);
  // HTML never executes: Run previews the local buffer, which needs only a
  // hydrated page, not an execution provider or write authority.
  const htmlPreviewRunnable =
    isPreviewLanguage(language) && pageHydrated && !codeHydrationBlocked;
  const runOrPreviewAvailable = runnable || htmlPreviewRunnable;

  useLayoutEffect(() => {
    const previous = codeAuthoringIdentityRef.current;
    const changed =
      previous.pageId !== pageId || previous.allowed !== codeMayAuthor;
    if (changed) {
      codeAuthoringGenerationRef.current =
        nextCodeWindowAuthoringGeneration();
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      if (previous.pageId === pageId) {
        installAuthoritativeContent(contentRef.current);
      } else {
        retirePendingContentRender();
      }
    }
    codeAuthoringIdentityRef.current = {
      pageId,
      allowed: codeMayAuthor,
    };
    codeMayAuthorRef.current = codeMayAuthor;
    if (changed) notifyCodeWindowRegistryChange(registeredCodeWindowEntryRef.current ?? undefined);
    if (codeMayAuthor) return;

    setFifUndoSnapshot(null);
    setFifReplacementFailure(null);
    setFifActiveHitKey(null);

    activeCodeTestDebugSessionRef.current = null;
    setActiveCodeTestDebugSession(null);
    debugViewStateKeyRef.current = `page:${pageId}`;
    const pendingTestDebug = pendingCodeTestDebugHandoffRef.current;
    const awaitingExactTargetHydration = Boolean(
      !pageHydrated && pendingTestDebug?.targetPageId === pageId,
    );
    if (!awaitingExactTargetHydration) {
      pendingCodeTestDebugHandoffRef.current = null;
      if (pendingTestDebug) {
        discardCodeTestDebugHandoffRequest(pendingTestDebug.requestId);
      }
      discardCodeTestDebugHandoff(pageId, currentCodeWindowBufferIdRef.current);
    }

    // Test Explorer receipts and active executions are authoring-generation
    // owned. A revoke retires the physical run synchronously; a later grant
    // receives a new generation and can never validate the old continuation.
    testRunReceiptAuthoringGenerationRef.current = null;
    persistedTestRunReceiptRef.current = null;
    testRunExactSourcesRef.current = null;
    pendingCodeAiFixRef.current = null;
    setPostAiRerunRequest(null);
    setTestRunReceipt(null);
    retireActiveCodeTestRunRef.current(true);

    // Revoke every retained authoring continuation. In particular, a file read
    // started before checkout loss must not become valid merely because grant
    // returns before its promise settles.
    codeImportGenerationRef.current += 1;
    codeImportDragDepthRef.current = 0;
    codeImportingRef.current = false;
    const authorityGeneration = codeAuthoringGenerationRef.current;
    queueMicrotask(() => {
      if (
        codeMayAuthorRef.current ||
        codeAuthoringGenerationRef.current !== authorityGeneration
      ) {
        return;
      }
      setCodeImporting(false);
      setCodeImportDragActive(false);
      setSourceFileRenameDraft(null);
      setSourceFileRenameInvalid(false);
      setEditorEditCommandRequest((request) =>
        request && editCommandAuthorsDocument(request.command)
          ? undefined
          : request,
      );
      setEditorIntelligenceCommandRequest((request) =>
        request && AUTHORING_INTELLIGENCE_COMMANDS.has(request.command)
          ? undefined
          : request,
      );
      setEditorReviewCommandRequest((request) =>
        request && AUTHORING_REVIEW_COMMANDS.has(request.command)
          ? undefined
          : request,
      );
      setDebugCommandRequest((request) =>
        request?.command === "addBreakpointCurrent" ? undefined : request,
      );
    });
  }, [
    codeMayAuthor,
    installAuthoritativeContent,
    pageHydrated,
    pageId,
    retirePendingContentRender,
  ]);

  useLayoutEffect(
    () => () => {
      // Invalidate retained async actions before descendant teardown can make
      // a same-id remount visible in the registry. Generations are globally
      // unique, so an old action can never mistake that remount for its owner.
      codeMayAuthorRef.current = false;
      codeAuthoringGenerationRef.current =
        nextCodeWindowAuthoringGeneration();
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      testRunReceiptAuthoringGenerationRef.current = null;
      testRunExactSourcesRef.current = null;
      pendingCodeAiFixRef.current = null;
      activeCodeTestDebugSessionRef.current = null;
      const pendingTestDebug = pendingCodeTestDebugHandoffRef.current;
      pendingCodeTestDebugHandoffRef.current = null;
      if (pendingTestDebug) {
        discardCodeTestDebugHandoffRequest(pendingTestDebug.requestId);
      }
      discardCodeTestDebugHandoff(
        pageIdRef.current,
        currentCodeWindowBufferIdRef.current,
      );
    },
    [],
  );

  const captureCodeAuthoringAuthority = useCallback(
    (): number | null =>
      codeMayAuthorRef.current
        ? codeAuthoringGenerationRef.current
        : null,
    [],
  );
  const codeAuthoringAuthorityIsCurrent = useCallback(
    (generation: number | null): generation is number =>
      generation !== null &&
      codeMayAuthorRef.current &&
      codeAuthoringGenerationRef.current === generation,
    [],
  );

  useLayoutEffect(() => {
    // PATCH acknowledgements advance execution authority without rehydrating
    // the editor (which would replace a running transcript and local input).
    const acknowledgement = autosave.lastSaveAcknowledgement;
    const saved = acknowledgement?.page;
    const savedVersion = saved?.content_version;
    if (
      !codeMayAuthor || autosave.isSaving || autosave.isDirty || autosave.hasConflict ||
      !acknowledgement || !saved || saved.id !== pageId || saved.notebook_id !== workspaceNotebookId ||
      saved.page_type !== "code" || typeof savedVersion !== "number" ||
      !Number.isSafeInteger(savedVersion) || savedVersion < workspaceCurrentContentVersion ||
      saved.content_json?.language !== languageRef.current ||
      saved.content_json?.content !== contentRef.current ||
      acknowledgement.draft.content_json?.language !== languageRef.current ||
      acknowledgement.draft.content_json?.content !== contentRef.current
    ) return;
    setWorkspaceCurrentContentVersion(savedVersion);
    setHydratedExecutionPageAuthority((previous) =>
      previous.pageId === pageId && previous.language === languageRef.current &&
      previous.contentVersion === savedVersion
        ? previous
        : { pageId, language: languageRef.current, contentVersion: savedVersion },
    );
  }, [autosave.lastSaveAcknowledgement, autosave.isSaving, autosave.isDirty,
    autosave.hasConflict, codeMayAuthor, pageId, workspaceNotebookId,
    workspaceCurrentContentVersion]);

  const activeCodeTestDebugSessionCurrent = Boolean(
    activeCodeTestDebugSession &&
      codeMayAuthor &&
      hydratedPageId === pageId &&
      activeCodeTestDebugSession.authoringGeneration ===
        codeAuthoringGenerationRef.current &&
      activeCodeTestDebugSession.hydrationGeneration ===
        codeTestDebugHydrationGeneration &&
      activeCodeTestDebugSession.bufferBindingGeneration ===
        (codePageBufferBinding?.generation ?? null) &&
      activeCodeTestDebugSession.bufferOwner ===
        (activeCodePageBufferLease?.isOwner() ?? null) &&
      activeCodeTestDebugSession.bufferId === currentCodeWindowBufferId &&
      activeCodeTestDebugSession.handoff.source.pageId === pageId &&
      activeCodeTestDebugSession.handoff.source.path === workspacePath &&
      activeCodeTestDebugSession.handoff.source.language === language &&
      activeCodeTestDebugSession.handoff.source.contentVersion ===
        workspaceCurrentContentVersion &&
      activeCodeTestDebugSession.handoff.source.source === content,
  );
  const activeCodeTestDebugViewStateKey = activeCodeTestDebugSessionCurrent
    ? `page:${pageId}:test:${activeCodeTestDebugSession!.handoff.requestId}:${activeCodeTestDebugSession!.authoringGeneration}:${activeCodeTestDebugSession!.hydrationGeneration}:${activeCodeTestDebugSession!.bufferBindingGeneration ?? "plain"}`
    : `page:${pageId}`;

  useLayoutEffect(() => {
    debugViewStateKeyRef.current = activeCodeTestDebugViewStateKey;
    if (
      activeCodeTestDebugSession &&
      !activeCodeTestDebugSessionCurrent
    ) {
      activeCodeTestDebugSessionRef.current = null;
      setActiveCodeTestDebugSession(null);
    }
  }, [
    activeCodeTestDebugSession,
    activeCodeTestDebugSessionCurrent,
    activeCodeTestDebugViewStateKey,
  ]);

  useLayoutEffect(
    () =>
      subscribeCodeTestDebugHandoff(pageId, () => {
        setCodeTestDebugHandoffEpoch((current) => current + 1);
      }),
    [pageId],
  );

  useLayoutEffect(() => {
    if (hydratedPageId !== pageId || !codeMayAuthor) return;
    const handoff = takeCodeTestDebugHandoff(
      pageId,
      currentCodeWindowBufferId,
    );
    if (!handoff) return;
    if (pendingCodeTestDebugHandoffRef.current?.requestId === handoff.requestId) {
      pendingCodeTestDebugHandoffRef.current = null;
    }
    if (getPageExecutionState(pageId) && !debugStateRef.current.running) {
      setTestRunError(t("code.testExplorer.busy"));
      return;
    }
    if (!isCodeTestLanguage(language)) {
      setTestRunError(t("code.testExplorer.debugUnavailable"));
      return;
    }
    const liveSource: CodeTestSource = {
      pageId,
      path: workspacePath,
      language,
      contentVersion: workspaceCurrentContentVersion,
      source: contentRef.current,
    };
    const freshHarness = createCodeTestDebugHarness(
      liveSource,
      handoff.receipt,
      handoff.test.id,
      handoff.source,
    );
    if (
      !freshHarness ||
      handoff.source.source !== liveSource.source ||
      handoff.source.path !== liveSource.path ||
      handoff.source.language !== liveSource.language ||
      handoff.source.contentVersion !== liveSource.contentVersion ||
      handoff.executionSource !== freshHarness.executionSource ||
      handoff.result.line !== freshHarness.result.line
    ) {
      setTestRunError(t("code.testExplorer.debugUnavailable"));
      return;
    }

    const authoringGeneration = captureCodeAuthoringAuthority();
    if (authoringGeneration === null) {
      setTestRunError(t("document.capability.unavailable"));
      return;
    }
    const session: ActiveCodeTestDebugSession = {
      handoff: { ...handoff, ...freshHarness },
      authoringGeneration,
      hydrationGeneration: codeTestDebugHydrationGenerationRef.current,
      bufferBindingGeneration: codePageBufferBinding?.generation ?? null,
      bufferOwner: activeCodePageBufferLease?.isOwner() ?? null,
      bufferId: currentCodeWindowBufferId,
    };
    const viewStateKey = `page:${pageId}:test:${handoff.requestId}:${authoringGeneration}:${session.hydrationGeneration}:${session.bufferBindingGeneration ?? "plain"}`;
    activeCodeTestDebugSessionRef.current = session;
    debugViewStateKeyRef.current = viewStateKey;
    setActiveCodeTestDebugSession(session);
    setTestRunError(null);
    setTestExplorerOpen(false);
    void 0;
    requestDebugLineNavigation(freshHarness.result.line, true);
    debugCommandRequestIdRef.current += 1;
    setDebugCommandRequest({
      requestId: debugCommandRequestIdRef.current,
      command: debugStateRef.current.running ? "restart" : "start",
      viewStateKey,
    });
  }, [
    activeCodePageBufferLease,
    captureCodeAuthoringAuthority,
    codeMayAuthor,
    codePageBufferBinding?.generation,
    codeTestDebugHandoffEpoch,
    currentCodeWindowBufferId,
    hydratedPageId,
    language,
    pageId,
    requestDebugLineNavigation,
    selectToolbarTab,
    t,
    workspaceCurrentContentVersion,
    workspacePath,
  ]);

  useLayoutEffect(() => {
    queueVersionDraftRef.current = autosave.queueSave;
    return () => {
      queueVersionDraftRef.current = () => {};
    };
  }, [autosave.queueSave]);

  // Authority may change while the page stays mounted. ACL grant/revoke swaps
  // to a fresh registry generation and re-hydrates only that new projection.
  // Checkout changes do the same even though both sides are authenticated
  // participants: a locked Y.Doc must not carry rejected local structs into a
  // later grant merely because its visible string was restored. Deliberately
  // do NOT depend on autosave.page: each ordinary save replaces that object,
  // while refreshAuthorization withdraws transport writability until its new
  // ticket settles and would make the focused editor briefly read-only.
  useLayoutEffect(() => {
    if (autosave.isLocalAuthorityPending) return;
    if (!ENABLE_CODE_PAGE_SHARED_BUFFER || guestMode) {
      const lease = codePageBufferLeaseRef.current;
      if (!lease) return;
      codePageBufferLeaseRef.current = null;
      lease.release();
      setCodePageBufferBinding(null);
      setCodePageBufferSaveState(null);
      return;
    }
    const current = codePageBufferLeaseRef.current;
    if (
      current?.pageId === pageId &&
      current.matchesAuthority(codePageBufferAuthority)
    ) {
      current.updateAuthority(codePageBufferAuthority);
      return;
    }
    const hydration = codePageBufferAuthorityHydrationRef.current;
    if (hydration.hydratedPageId === pageId && hydration.page) {
      let cancelled = false;
      const page = hydration.page;
      const hydrate = hydration.handleLoaded;
      queueMicrotask(() => {
        if (!cancelled) hydrate(page);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [autosave.isLocalAuthorityPending, codePageBufferAuthority, guestMode, pageId, pageWritable.lockedByName]);

  useEffect(
    () => {
      versionWriteSnapshotRef.current = null;
      versionHydrationGuardRef.current = null;
      return () => {
        versionWriteSnapshotRef.current = null;
        versionHydrationGuardRef.current = null;
        const lease = codePageBufferLeaseRef.current;
        if (!lease || lease.pageId !== pageId) return;
        codePageBufferLeaseRef.current = null;
        lease.release();
      };
    },
    [pageId],
  );

  useEffect(() => {
    if (!activeCodePageBufferLease) return;
    // The buffer notifies several times a keystroke. The window renders again
    // only when something it reads from the lease while rendering changed
    // (its binding generation, ownership, writability, causal status) or the
    // save state did.
    return activeCodePageBufferLease.subscribe(() => {
      const saveState = activeCodePageBufferLease.getSaveState();
      setCodePageBufferSaveState((current) =>
        current !== null && sameCodePageBufferSaveState(current, saveState)
          ? current
          : saveState,
      );
      const renderState = codePageBufferRenderState(activeCodePageBufferLease);
      setCodePageBufferBinding((current) =>
        current?.lease === activeCodePageBufferLease &&
        current.renderState === renderState
          ? current
          : {
              lease: activeCodePageBufferLease,
              generation: activeCodePageBufferLease.getBindingGeneration(),
              renderState,
            },
      );
    });
  }, [activeCodePageBufferLease]);

  useEffect(() => {
    if (hydratedPageId !== pageId) return;
    const location = pendingWorkspaceLocationRef.current;
    if (!location) return;
    pendingWorkspaceLocationRef.current = null;
    const exactRangeCurrent =
      location.contentVersion === workspaceCurrentContentVersion &&
      typeof location.from === "number" &&
      typeof location.to === "number";
    const from = exactRangeCurrent
      ? Math.min(location.from!, content.length)
      : codeQuickOpenOffset(content, location);
    const to = exactRangeCurrent
      ? Math.min(Math.max(location.to!, from), content.length)
      : from;
    const frame = requestAnimationFrame(() => revealCodeRange(from, to));
    return () => cancelAnimationFrame(frame);
  }, [
    content,
    hydratedPageId,
    pageId,
    revealCodeRange,
    workspaceCurrentContentVersion,
  ]);

  const isLastSaveFailureRetryable = autosave.isLastSaveFailureRetryable;
  const ownCodePageBufferSaveState = useMemo<CodePageBufferSaveState>(
    () => ({
      saveStatus: autosave.saveStatus,
      isDirty: autosave.isDirty,
      isSaving: autosave.isSaving,
      hasConflict: autosave.hasConflict,
      error: autosave.error,
      conflictDetails: autosave.conflictDetails,
      contentVersion: autosave.page?.content_version ?? null,
      retryableFailure:
        autosave.error !== null && isLastSaveFailureRetryable?.() === true,
      ...(autosave.syncedToServer ? { syncedToServer: true } : {}),
    }),
    [
      autosave.conflictDetails,
      autosave.error,
      autosave.syncedToServer,
      autosave.hasConflict,
      autosave.isDirty,
      autosave.isSaving,
      autosave.page?.content_version,
      autosave.saveStatus,
      isLastSaveFailureRetryable,
    ],
  );
  const effectiveSaveState =
    activeCodePageBufferLease && codePageBufferSaveState
      ? codePageBufferSaveState
      : ownCodePageBufferSaveState;
  const codeEditorReadOnly =
    !codeMayAuthor ||
    (!guestMode &&
      ENABLE_CODE_PAGE_SHARED_BUFFER &&
        (!activeCodePageBufferLease ||
          !activeCodePageBufferLease.isWritable()));
  const codeCopilotReadOnly = codeEditorReadOnly || !codeMayAuthor;
  // A Copilot ask made before this window was closed reopens inline, bound
  // to the same file content (stale otherwise).
  const codeCopilotResume = usePendingCopilotResume({
    pageId,
    hosts: CODE_COPILOT_RESUME_HOSTS,
    ready: CODE_COPILOT_V1_ENABLED && !codeCopilotReadOnly && !guestMode,
  });
  const codeCopilotResumeRun = codeCopilotResume.resume?.runId ?? null;
  useEffect(() => {
    if (!codeCopilotResumeRun) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a waiting result arrived
    setCopilotOpen(true);
  }, [codeCopilotResumeRun]);

  // Every duplicate view reads the page writer's status, so a secondary view
  // cannot claim "Saved" while the canonical buffer is dirty or conflicted.
  useRegisterWindowSaveStatus(windowId, effectiveSaveState.saveStatus);

  // A guest save is refused, never performed. The ribbon Save is disabled and
  // names guestGate.save.title as the reason; this carries that same answer to
  // the keyboard gesture, which has no disabled state to read. The save face is
  // a live region, so flipping its label both shows and announces the refusal
  // even on a host that mounts no register gate.
  const [guestSaveRejected, setGuestSaveRejected] = useState(false);

  // Stable ref to the persist callback so registry setText can call it without
  // capturing stale autosave / language from the time of registration.
  const persistRef = useRef<
    (
      lang: string,
      text: string,
      output?: RunResult | null,
      debugConfiguration?: CodeDebugConfiguration,
      positions?: CodeTextChangesAgainst,
    ) => void
  >(() => {});

  const persist = useCallback(
    (
      nextLanguage: string,
      nextContent: string,
      nextOutput?: RunResult | null,
      nextDebugConfiguration?: CodeDebugConfiguration,
      // Where the text change was made, when the caller knows: the shared
      // text is written at those places (code-text-changes, TRIAGE 47).
      positions?: CodeTextChangesAgainst,
    ) => {
      // In guest mode there is no backend page to write — saves are no-ops.
      // Authoring again retires the answer an earlier explicit save was given,
      // so the next Cmd/Ctrl+S states it afresh instead of standing silent.
      if (guestMode) {
        setGuestSaveRejected(false);
        return;
      }
      if (!codeMayAuthorRef.current) return;
      const draft = buildPageDraft(
        nextLanguage,
        nextContent,
        nextOutput,
        nextDebugConfiguration,
      );
      lastPersistedContentJsonRef.current = draft.content_json ?? null;
      const lease = codePageBufferLeaseRef.current;
      if (lease) {
        lease.publishDraft(draft, positions);
      } else {
        autosave.queueSave(draft);
      }
    },
    [autosave, buildPageDraft, guestMode],
  );
  useLayoutEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Explicit save gesture (Cmd/Ctrl+S) from the editor. The editor has already
  // formatted-then-onChange'd the buffer (when "Format on save" is on), so the
  // formatted text is sitting in the debounced autosave draft; flush it NOW
  // instead of waiting out the debounce. saveNow() with no draft flushes the
  // latest queued body (a no-op when nothing is pending). Guest mode has no
  // backend page, so it refuses the gesture out loud instead of returning a
  // silent success: the ribbon Save answers a guest with guestGate.save.title,
  // and the keyboard must not be the one path that pretends the code was kept.
  const flushSave = useCallback(() => {
    // A draft is saved by its Confirm; its status already says so.
    if (draftReviewing) return;
    if (guestMode) {
      if (!onGuestSaveRequest) setGuestSaveRejected(true);
      onGuestSaveRequest?.();
      return;
    }
    if (!codeMayAuthorRef.current) return;
    const lease = codePageBufferLeaseRef.current;
    void (lease ? lease.saveNow() : autosave.saveNow());
  }, [autosave, draftReviewing, guestMode, onGuestSaveRequest]);

  // Every visible Save entry must enter the editor's one save authority so
  // Format on Save, whitespace/final-newline transforms and its lifecycle
  // guards behave exactly like Cmd/Ctrl+S. Only the rollback textarea lacks
  // that command bridge and therefore flushes its already-authored draft.
  const requestVisibleSave = useCallback(() => {
    if (!codeMayAuthorRef.current) return;
    if (USE_CODEMIRROR_EDITOR) {
      requestEditorEditCommand("save");
      return;
    }
    flushSave();
  }, [flushSave, requestEditorEditCommand]);

  /**
   * Flush what is on screen and report the version the server now holds.
   * Snapshotting an unsaved buffer would commit a revision the user never had.
   */
  const saveForVersionWrite = useCallback(async (): Promise<number> => {
    const authorityGeneration = captureCodeAuthoringAuthority();
    if (authorityGeneration === null) throw new Error(t("pages.saveFailed"));
    const snapshot = captureVersionWriteSnapshot();
    versionWriteSnapshotRef.current = null;
    const lease = codePageBufferLeaseRef.current;
    const saved = await (lease ? lease.saveNow() : autosave.saveNow());
    if (
      !codeAuthoringAuthorityIsCurrent(authorityGeneration) ||
      !versionWriteSnapshotIsCurrent(snapshot)
    ) {
      throw new Error(t("pages.saveFailed"));
    }
    const version = saved?.content_version;
    if (typeof version !== "number") {
      throw new Error(t("pages.saveFailed"));
    }
    versionWriteSnapshotRef.current = snapshot;
    return version;
  }, [
    autosave,
    captureCodeAuthoringAuthority,
    captureVersionWriteSnapshot,
    codeAuthoringAuthorityIsCurrent,
    t,
    versionWriteSnapshotIsCurrent,
  ]);

  /** Reload after a restore so the editor shows the revision that was restored. */
  const handleCodeContentRestored = useCallback(
    async (expectedReceipt: PageItem | null): Promise<boolean> => {
      if (!codeMayAuthorRef.current) return false;
      const snapshot = versionWriteSnapshotRef.current;
      versionWriteSnapshotRef.current = null;
      if (!snapshot || snapshot.pageId !== pageId) return false;
      // Only a non-null receipt proves that the restore mutated the server.
      // A 409/null follow-up must keep the pre-existing CAS conflict boundary:
      // if the draft changed, do not reload/rebase it onto the remote version.
      if (
        expectedReceipt === null &&
        !versionWriteSnapshotIsCurrent(snapshot)
      ) {
        return false;
      }
      const hydrationGuard: CodeVersionHydrationGuard = {
        snapshot,
        accepted: false,
        preserved: false,
      };
      versionHydrationGuardRef.current = hydrationGuard;
      const lease = codePageBufferLeaseRef.current;
      try {
        // A receipt may arrive after the user changed the snapshot. Reload is
        // still mandatory: it rebases the autosave controller to the server's
        // committed generation, while handleLoaded skips stale hydration and
        // republishes the still-live full draft on that new base.
        const hydrated = await (lease ? lease.reload() : autosave.reload());
        if (!hydrationGuard.accepted || hydrationGuard.preserved) return false;
        // A null receipt is the conflict-refresh path: the panel keeps its own
        // conflict message and treats this only as best effort.
        if (!expectedReceipt) return hydrated !== null;
        return (
          hydrated !== null &&
          hydrated.id === expectedReceipt.id &&
          (hydrated.content_version ?? 0) >=
            (expectedReceipt.content_version ?? 0)
        );
      } finally {
        if (versionHydrationGuardRef.current === hydrationGuard) {
          versionHydrationGuardRef.current = null;
        }
      }
    },
    [autosave, pageId, versionWriteSnapshotIsCurrent],
  );

  // Called on EVERY keystroke (an edit retires the import receipt), so it has to
  // cost nothing when there is no receipt — which is almost always. Returning
  // the previous value from a functional update is NOT enough: React still
  // enqueues the update and only bails while rendering, so three updates per
  // keystroke still counted toward the nested-update limit and sustained typing
  // ended in "Maximum update depth exceeded". The three are changed-state
  // setters, which ask their last set value first. (A ref written during render
  // asked a transition render instead, which had not applied the import yet,
  // and the receipt then stayed up after an edit.)
  const dismissCodeImportReceipt = useCallback(() => {
    retirePendingCodeImportAuthority();
    setCodeImportSnapshot(null);
    setImportedFileName(null);
    setCodeImportError(null);
  }, [
    retirePendingCodeImportAuthority,
    setCodeImportError,
    setCodeImportSnapshot,
    setImportedFileName,
  ]);

  const applySharedBufferText = useCallback(
    (nextContent: string) => {
      if (!acceptCodeSourceLength(nextContent)) return false;
      // The shared buffer hands every view, this one included, the text it
      // already holds (an import's own body comes straight back): only a
      // change is an edit that retires the import receipt and its Undo.
      if (contentRef.current === nextContent) return true;
      dismissCodeImportReceipt();
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      installAuthoritativeContent(nextContent);
      return true;
    },
    [
      acceptCodeSourceLength,
      dismissCodeImportReceipt,
      installAuthoritativeContent,
    ],
  );
  // A peer's keystroke is already in this view's CodeMirror when it lands
  // here. Installing it as authoritative rendered the whole window (ribbon
  // included) before that frame could paint, and its digest and diagnostics
  // rendered it again, for every character a peer typed. Take it like this
  // window's own typing instead: current at once in contentRef, the window
  // rendered once the burst settles.
  const applySharedBufferPeerText = useCallback(
    (nextContent: string) => {
      if (!acceptCodeSourceLength(nextContent)) return;
      if (contentRef.current === nextContent) return;
      dismissCodeImportReceipt();
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      scheduleContentRender(nextContent);
    },
    [acceptCodeSourceLength, dismissCodeImportReceipt, scheduleContentRender],
  );
  useLayoutEffect(() => {
    applySharedBufferPeerTextRef.current = applySharedBufferPeerText;
  }, [applySharedBufferPeerText]);

  const applySharedBufferDraft = useCallback(
    (draft: PageDocumentDraft) => {
      const contentJson = draft.content_json;
      if (!contentJson) return;

      const nextContent =
        typeof contentJson.content === "string" ? contentJson.content : "";
      const nextLanguage = codeDraftLanguage(
        contentJson.language,
        languageRef.current,
      );
      if (nextLanguage === null) return;
      if (!applySharedBufferText(nextContent)) return;
      const lastLoaded = lastLoadedCodePageRef.current;
      if (lastLoaded?.pageId === pageId) {
        lastLoadedCodePageRef.current = {
          ...lastLoaded,
          ...(typeof draft.title === "string" ? { title: draft.title } : {}),
          contentJson,
        };
      }
      if (languageRef.current !== nextLanguage) {
        languageRef.current = nextLanguage;
        setLanguage(nextLanguage);
      }

      const nextTitle =
        typeof draft.title === "string" ? draft.title : titleRef.current;
      titleRef.current = nextTitle;
      setWorkspaceCurrentTitle(nextTitle || pageId);

      const nextSourceFileName = restoreCodePageSourceFilename(contentJson);
      sourceFileNameRef.current = nextSourceFileName;
      setSourceFileName(nextSourceFileName);

      const persistedWorkspacePath = restoreCodeWorkspacePath(contentJson);
      const nextWorkspacePath =
        persistedWorkspacePath ??
        codeExportFilename(
          nextSourceFileName,
          nextTitle || pageId,
          nextLanguage,
        );
      workspacePathExplicitRef.current = persistedWorkspacePath !== null;
      workspacePathRef.current = nextWorkspacePath;
      setWorkspacePath(nextWorkspacePath);

      const nextLineEnding = restoreCodePageLineEnding(contentJson);
      lineEndingRef.current = nextLineEnding;
      setLineEnding(nextLineEnding);
      const nextSourceEncoding = restoreCodePageSourceEncoding(contentJson);
      sourceEncodingRef.current = nextSourceEncoding;
      setSourceEncoding(nextSourceEncoding);

      const candidateNextOutput = restoreCodePageOutput(contentJson);
      const keepsHeldOutput = loadCarriesHeldRunOutput({
        held: persistedOutputAuthorityRef.current,
        heldOutput: persistedOutputRef.current,
        stdin: stdinTextRef.current,
        language: nextLanguage,
        source: nextContent,
        loadedOutput: candidateNextOutput,
        lastPersisted: lastPersistedContentJsonRef.current,
      });
      const nextRunTimeline = restoreCodePageRunTimeline(contentJson);
      const nextRunProfiles = restoreCodePageRunProfiles(contentJson);
      const nextDebugTimeline = restoreCodeDebugTimeline(contentJson);
      debugTimelinePersistenceGenerationRef.current += 1;
      debugTimelineReplayGenerationRef.current += 1;
      const latestNextRun = nextRunTimeline[0] ?? null;
      const nextOutputTimelineNavigation =
        latestNextRun?.language === nextLanguage &&
        latestNextRun.input.stdinBytes === 0
          ? restoreCodePageRunTimelineNavigation(latestNextRun, nextContent)
          : null;
      const nextOutput =
        candidateNextOutput && (!latestNextRun || nextOutputTimelineNavigation)
          ? candidateNextOutput
          : null;
      const nextRunNavigation = nextOutput
        ? restoreCodePageRunNavigation(contentJson, nextContent)
        : null;
      const nextRunOutputCleared = restoreCodePageRunOutputCleared(contentJson);
      persistedRunOutputClearedRef.current = nextRunOutputCleared;
      const candidateTimelineFallback =
        nextOutput ||
        codePageRunOutputWasCleared(nextRunOutputCleared, nextRunTimeline[0])
          ? null
          : (nextRunTimeline[0] ?? null);
      const nextTimelineNavigation =
        candidateTimelineFallback?.language === nextLanguage &&
        candidateTimelineFallback.input.stdinBytes === 0
          ? restoreCodePageRunTimelineNavigation(
              candidateTimelineFallback,
              nextContent,
            )
          : null;
      const nextTimelineFallback = nextTimelineNavigation
        ? candidateTimelineFallback
        : null;
      const visibleRunNavigation =
        nextRunNavigation ?? nextTimelineNavigation;
      if (!keepsHeldOutput) {
        persistedRunNavigationRef.current = nextRunNavigation
          ? {
              source: nextContent,
              persisted: nextRunNavigation.persisted,
              selection: nextRunNavigation.selection,
            }
          : null;
      }
      persistedRunTimelineRef.current = nextRunTimeline;
      setRunTimeline(nextRunTimeline);
      if (!keepsHeldOutput) {
        setSelectedRunTimelineIndex(nextTimelineFallback ? 0 : null);
      }
      if (
        JSON.stringify(persistedRunProfilesRef.current) !==
        JSON.stringify(nextRunProfiles)
      ) {
        runProfileRequestGenerationRef.current += 1;
        persistedRunProfilesRef.current = nextRunProfiles;
        setRunProfiles(nextRunProfiles);
      }
      persistedDebugTimelineRef.current = nextDebugTimeline;
      setDebugTimeline(nextDebugTimeline);
      setSelectedDebugTimelineIndex(nextDebugTimeline.length > 0 ? 0 : null);
      if (!keepsHeldOutput) {
        persistedOutputRef.current = nextOutput;
        persistedOutputAuthorityRef.current = nextOutput
          ? {
              language: nextLanguage,
              source: nextContent,
              stdin: "",
              output: nextOutput,
            }
          : null;
        setOutput(
          nextOutput ??
            (nextTimelineFallback
              ? codePageRunTimelineEntryToRunResult(nextTimelineFallback)
              : null),
        );
        setLastRunScope(visibleRunNavigation?.selection ?? null);
        setTracebackNavigationSource(
          visibleRunNavigation ? nextContent : null,
        );
      }

      const nextTestRunTimeline = restoreCodeTestRunTimeline(contentJson);
      const nextTestRunReceipt =
        nextTestRunTimeline[0]?.receipt ?? restoreCodeTestRunReceipt(contentJson);
      testRunTimelineGenerationRef.current += 1;
      persistedTestRunTimelineRef.current = nextTestRunTimeline;
      persistedTestRunReceiptRef.current = nextTestRunReceipt;
      testRunExactSourcesRef.current = null;
      testRunReceiptAuthoringGenerationRef.current =
        nextTestRunReceipt && codeMayAuthorRef.current
          ? codeAuthoringGenerationRef.current
          : null;
      setTestRunTimeline(nextTestRunTimeline);
      setSelectedTestRunTimelineIndex(
        nextTestRunTimeline.length > 0 ? 0 : null,
      );
      setTestRunReceipt(nextTestRunReceipt);
      setTestRunError(null);

      const nextDebugConfiguration =
        restoreCodeDebugConfiguration(contentJson);
      debugConfigurationRef.current = nextDebugConfiguration;
      setDebugConfiguration(nextDebugConfiguration);
    },
    [applySharedBufferText, pageId],
  );

  useLayoutEffect(() => {
    if (!activeCodePageBufferLease) return;
    activeCodePageBufferLease.updateHolder({
      buildDraft: (nextContent) =>
        buildPageDraft(languageRef.current, nextContent),
      applyText: applySharedBufferText,
      applyPeerText: applySharedBufferPeerText,
      applyDraft: applySharedBufferDraft,
      controller: autosave,
      saveState: ownCodePageBufferSaveState,
    });
  }, [
    applySharedBufferDraft,
    applySharedBufferPeerText,
    applySharedBufferText,
    autosave,
    buildPageDraft,
    activeCodePageBufferLease,
    ownCodePageBufferSaveState,
  ]);

  const beginSourceFileRename = useCallback((currentLabel: string) => {
    if (!codeMayAuthorRef.current) return;
    setSourceFileRenameInvalid(false);
    setSourceFileRenameDraft(currentLabel);
    requestAnimationFrame(() => sourceFileRenameInputRef.current?.select());
  }, []);

  const cancelSourceFileRename = useCallback(() => {
    setSourceFileRenameInvalid(false);
    setSourceFileRenameDraft(null);
    requestAnimationFrame(() => sourceFileRenameButtonRef.current?.focus());
  }, []);

  const commitSourceFileRename = useCallback(
    (rawFilename: string, nextPageTitle?: string): boolean => {
      if (!codeMayAuthorRef.current) return false;
      const normalizedPath = normalizeCodeWorkspacePath(rawFilename);
      if (!normalizedPath) {
        setSourceFileRenameInvalid(true);
        requestAnimationFrame(() => sourceFileRenameInputRef.current?.focus());
        return false;
      }
      const requestedBasename = codeWorkspaceBasename(normalizedPath);
      const requestedExtension = extensionFromCodeFilename(requestedBasename);
      const requestedLanguage = requestedExtension
        ? languageForExtension(requestedExtension)
        : null;
      if (requestedExtension && !requestedLanguage) {
        setSourceFileRenameInvalid(true);
        requestAnimationFrame(() => sourceFileRenameInputRef.current?.focus());
        return false;
      }
      const nextLanguage = requestedLanguage ?? languageRef.current;
      const nextFilename = codeExportFilename(
        requestedBasename,
        titleRef.current || pageId,
        nextLanguage,
      );
      const nextWorkspacePath = replaceCodeWorkspaceBasename(
        normalizedPath,
        nextFilename,
      );
      if (!nextWorkspacePath) {
        setSourceFileRenameInvalid(true);
        requestAnimationFrame(() => sourceFileRenameInputRef.current?.focus());
        return false;
      }
      setSourceFileRenameDraft(null);
      setSourceFileRenameInvalid(false);
      const normalizedPageTitle = nextPageTitle?.trim().slice(0, 512) || null;
      const pageTitleChanged = Boolean(
        normalizedPageTitle && titleRef.current !== normalizedPageTitle,
      );
      if (
        sourceFileNameRef.current !== nextFilename ||
        languageRef.current !== nextLanguage ||
        workspacePathRef.current !== nextWorkspacePath ||
        pageTitleChanged
      ) {
        dismissCodeImportReceipt();
        // The server may refuse the new title as another page's and hand the
        // old one back: the whole rename is refused then, so the file's name,
        // path and language go back too, and are saved that way.
        const before = {
          title: titleRef.current,
          sourceFileName: sourceFileNameRef.current,
          workspacePath: workspacePathRef.current,
          workspacePathExplicit: workspacePathExplicitRef.current,
          language: languageRef.current,
        };
        takeBackRefusedRenameRef.current = pageTitleChanged
          ? (handedBack: string) => {
              takeBackRefusedRenameRef.current = null;
              if (handedBack !== before.title) return;
              sourceFileNameRef.current = before.sourceFileName;
              setSourceFileName(before.sourceFileName);
              workspacePathRef.current = before.workspacePath;
              workspacePathExplicitRef.current = before.workspacePathExplicit;
              setWorkspacePath(before.workspacePath);
              languageRef.current = before.language;
              setLanguage(before.language);
              persistRef.current(before.language, contentRef.current);
            }
          : null;
        if (normalizedPageTitle) {
          titleRef.current = normalizedPageTitle;
          setWorkspaceCurrentTitle(normalizedPageTitle);
        }
        sourceFileNameRef.current = nextFilename;
        setSourceFileName(nextFilename);
        workspacePathRef.current = nextWorkspacePath;
        workspacePathExplicitRef.current = nextWorkspacePath.includes("/");
        setWorkspacePath(nextWorkspacePath);
        languageRef.current = nextLanguage;
        setLanguage(nextLanguage);
        persistRef.current(nextLanguage, contentRef.current);
      }
      requestAnimationFrame(() => sourceFileRenameButtonRef.current?.focus());
      return true;
    },
    [
      dismissCodeImportReceipt,
      pageId,
      setLanguage,
      setSourceFileName,
      setSourceFileRenameDraft,
      setSourceFileRenameInvalid,
      setWorkspaceCurrentTitle,
      setWorkspacePath,
    ],
  );

  // The ribbon box accepts a workspace path ("src/app.ts") or a title-like
  // name ("番茄钟（25/5 交替）"). A title's "/" is part of the name: the file
  // is named like the export path derives it from a title. Either way the
  
  // name as typed, a path its file name less the extension — so title, file
  // name and path agree, and a name another page has is refused.
  const commitSourceFileRenameInput = useCallback(
    (typed: string) => {
      const target =
        codeRenameInputAsTitle(typed, workspacePathRef.current) ??
        (() => {
          const title = codePageTitleForPath(typed);
          return title ? { path: typed, title } : null;
        })();
      if (!target) {
        commitSourceFileRename(typed);
        return;
      }
      if (commitSourceFileRename(target.path, target.title)) {
        windowManagerActions?.renameWindowByMeta?.(
          "pageId",
          pageIdRef.current,
          target.title,
        );
      }
    },
    [commitSourceFileRename, windowManagerActions],
  );

  const installWorkspaceMutationPage = useCallback(
    (notebookId: string, nextPage: PageItem, created: boolean) => {
      if (workspaceCatalogNotebookOwnerRef.current !== notebookId) return;
      workspaceCatalogGenerationRef.current += 1;
      workspaceCatalogLoadRef.current = null;
      workspaceDetailLoadRef.current = null;
      workspaceDetailAttemptedRef.current.delete(nextPage.id);
      const previousPages = workspacePagesRef.current;
      const existed = previousPages.some((page) => page.id === nextPage.id);
      const nextPages = [
        nextPage,
        ...previousPages.filter((page) => page.id !== nextPage.id),
      ];
      workspacePagesRef.current = nextPages;
      setWorkspacePages(nextPages);
      if (created && !existed) {
        setWorkspacePageTotal((total) => total + 1);
      }
      setWorkspaceCatalogLoading(false);
      setWorkspaceCatalogError(false);
      setWorkspaceDetailsLoading(false);
      setWorkspaceDetailsError(false);
      setWorkspaceIntelligenceRevision((revision) => revision + 1);
    },
    [
      setWorkspaceCatalogError,
      setWorkspaceCatalogLoading,
      setWorkspaceDetailsError,
      setWorkspaceDetailsLoading,
      setWorkspaceIntelligenceRevision,
      setWorkspacePages,
      setWorkspacePageTotal,
    ],
  );

  const removeWorkspaceMutationPage = useCallback(
    (notebookId: string, targetPageId: string) => {
      if (workspaceCatalogNotebookOwnerRef.current !== notebookId) return;
      workspaceCatalogGenerationRef.current += 1;
      workspaceCatalogLoadRef.current = null;
      workspaceDetailLoadRef.current = null;
      workspaceDetailAttemptedRef.current.delete(targetPageId);
      const previousPages = workspacePagesRef.current;
      const existed = previousPages.some((page) => page.id === targetPageId);
      const nextPages = previousPages.filter(
        (page) => page.id !== targetPageId,
      );
      workspacePagesRef.current = nextPages;
      setWorkspacePages(nextPages);
      if (existed || targetPageId === pageIdRef.current) {
        setWorkspacePageTotal((total) => Math.max(0, total - 1));
      }
      setWorkspaceCatalogLoading(false);
      setWorkspaceCatalogError(false);
      setWorkspaceDetailsLoading(false);
      setWorkspaceDetailsError(false);
      setWorkspaceIntelligenceRevision((revision) => revision + 1);
    },
    [
      setWorkspaceCatalogError,
      setWorkspaceCatalogLoading,
      setWorkspaceDetailsError,
      setWorkspaceDetailsLoading,
      setWorkspaceIntelligenceRevision,
      setWorkspacePages,
      setWorkspacePageTotal,
    ],
  );

  const workspaceMutationAuthority = useCallback(() => {
    const authoringGeneration = captureCodeAuthoringAuthority();
    const notebookId = workspaceCatalogNotebookOwnerRef.current;
    return !guestMode && authoringGeneration !== null && notebookId
      ? { authoringGeneration, notebookId }
      : null;
  }, [captureCodeAuthoringAuthority, guestMode]);

  const workspaceMutationAuthorityIsCurrent = useCallback(
    (authority: { authoringGeneration: number; notebookId: string }) =>
      codeAuthoringAuthorityIsCurrent(authority.authoringGeneration) &&
      workspaceCatalogNotebookOwnerRef.current === authority.notebookId,
    [codeAuthoringAuthorityIsCurrent],
  );

  const workspacePathConflicts = useCallback(
    (path: string, excludedPageId?: string) => {
      const identity = codeWorkspacePathIdentity(path);
      return workspaceCatalog.files.some(
        (file) =>
          file.pageId !== excludedPageId &&
          codeWorkspacePathIdentity(file.path) === identity,
      );
    },
    [workspaceCatalog.files],
  );

  const createWorkspaceFile = useCallback(
    async (rawPath: string): Promise<CodeWorkspaceMutationResult> => {
      const authority = workspaceMutationAuthority();
      const target = resolveCodeWorkspaceMutationTarget(
        rawPath,
        languageRef.current,
      );
      if (!authority || !target) {
        return {
          ok: false,
          message: target
            ? t("code.commandDisabled.readOnly")
            : t("code.workspaceExplorer.invalidPath"),
        };
      }
      if (workspacePathConflicts(target.path)) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.pathExists"),
        };
      }
      if (!windowManagerActions) {
        return {
          ok: false,
          message: t("document.capability.unavailable"),
        };
      }
      try {
        const created = await createPage(authority.notebookId, {
          title: target.filename,
          page_type: "code",
          content_json: buildContent(
            target.language,
            "",
            null,
            EMPTY_CODE_DEBUG_CONFIGURATION,
            target.filename,
            "LF",
            "utf8",
            null,
            target.path,
          ),
        });
        if (
          created.notebook_id !== authority.notebookId ||
          created.page_type !== "code"
        ) {
          throw new Error("Created page crossed workspace authority.");
        }
        dispatchNotebookPagesChanged(authority.notebookId);
        dispatchNotebooksChanged();
        if (!workspaceMutationAuthorityIsCurrent(authority)) {
          return { ok: true };
        }
        installWorkspaceMutationPage(authority.notebookId, created, true);
        windowManagerActions.openWindow({
          type: "note",
          title: created.title || target.filename,
          meta: {
            notebookId: authority.notebookId,
            pageId: created.id,
            pageType: "code",
          },
        });
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: t("code.workspaceExplorer.createFailed"),
        };
      }
    },
    [
      installWorkspaceMutationPage,
      t,
      windowManagerActions,
      workspaceMutationAuthority,
      workspaceMutationAuthorityIsCurrent,
      workspacePathConflicts,
    ],
  );

  // Whether a workspace file is binary: its saved content says so. Explorer
  // mutations run only on a complete catalog, so its pages are all loaded.
  const workspaceFileBinaryAsset = useCallback(
    (file: CodeWorkspaceFile): WorkspaceBinaryAsset | null =>
      file.pageId === pageIdRef.current
        ? binaryAssetRef.current
        : parseWorkspaceBinaryAsset(
            workspacePagesRef.current.find((page) => page.id === file.pageId)
              ?.content_json,
          ),
    [],
  );

  // One binary file: its page first (an attachment needs a page to belong
  // to), then the attachment, then the page names it. A page left without
  // its attachment is deleted again.
  const createWorkspaceBinaryFile = useCallback(
    async (notebookId: string, path: string, file: File): Promise<PageItem> => {
      const filename = codeWorkspaceBasename(path);
      const created = await createPage(notebookId, {
        title: filename,
        page_type: "code",
        content_json: buildContent(
          WORKSPACE_BINARY_LANGUAGE,
          "",
          null,
          EMPTY_CODE_DEBUG_CONFIGURATION,
          filename,
          "LF",
          "utf8",
          null,
          path,
        ),
      });
      if (created.notebook_id !== notebookId || created.page_type !== "code") {
        throw new Error("Created page crossed workspace authority.");
      }
      try {
        const asset = await uploadWorkspaceBinaryAsset(created.id, file, {
          notebookId,
        });
        const updated = await updatePage(created.id, {
          content_json: withWorkspaceBinaryAsset(created.content_json ?? {}, asset),
          base_content_version: created.content_version ?? 1,
        });
        if (!parseWorkspaceBinaryAsset(updated.content_json)) {
          throw new Error("The binary file's page lost its attachment.");
        }
        return updated;
      } catch (error) {
        await deletePage(created.id).catch(() => undefined);
        throw error;
      }
    },
    [],
  );

  // The Explorer's Upload: each file lands in `folder` under its own name.
  // Text stays text, an editable page like New file makes (refs.bib and a
  // class file too, as plain text); anything else becomes a binary file.
  // Each file succeeds or fails on its own, and the failures are reported.
  const uploadWorkspaceFiles = useCallback(
    async (
      files: readonly File[],
      folder: string,
    ): Promise<CodeWorkspaceMutationResult> => {
      const authority = workspaceMutationAuthority();
      if (!authority) {
        return { ok: false, message: t("code.commandDisabled.readOnly") };
      }
      const failures: string[] = [];
      const uploaded = new Set<string>();
      for (const file of files) {
        if (!workspaceMutationAuthorityIsCurrent(authority)) break;
        const name = normalizeCodeSourceFilename(file.name);
        const path = name
          ? normalizeCodeWorkspacePath(folder ? `${folder}/${name}` : name)
          : null;
        const label = name ?? file.name;
        if (!name || !path) {
          failures.push(
            t("code.workspaceExplorer.uploadFailed", { name: label }),
          );
          continue;
        }
        const identity = codeWorkspacePathIdentity(path);
        if (uploaded.has(identity) || workspacePathConflicts(path)) {
          failures.push(
            t("code.workspaceExplorer.uploadExists", { name: path }),
          );
          continue;
        }
        try {
          let text: ImportedCodeFile | null = null;
          if (!isWorkspaceBinaryFilename(name)) {
            try {
              text = await readImportedCodeFile(file, {
                unknownExtensionLanguage: "plaintext",
              });
            } catch (error) {
              // Not text, or more than a code page holds: a binary file.
              if (
                error instanceof CodeFileImportError &&
                error.code === "read_failed"
              ) {
                throw error;
              }
            }
          }
          let created: PageItem;
          if (text) {
            created = await createPage(authority.notebookId, {
              title: name,
              page_type: "code",
              content_json: buildContent(
                text.language,
                text.content,
                null,
                EMPTY_CODE_DEBUG_CONFIGURATION,
                name,
                text.lineEnding,
                text.encoding,
                null,
                path,
              ),
            });
            if (
              created.notebook_id !== authority.notebookId ||
              created.page_type !== "code"
            ) {
              throw new Error("Created page crossed workspace authority.");
            }
          } else {
            created = await createWorkspaceBinaryFile(
              authority.notebookId,
              path,
              file,
            );
          }
          uploaded.add(identity);
          if (workspaceMutationAuthorityIsCurrent(authority)) {
            installWorkspaceMutationPage(authority.notebookId, created, true);
          }
        } catch (error) {
          // The API accepts only the attachment types it can vouch for (no
          // SVG, no fonts outside a document): 415 names the file's type.
          // A file has no size of its own here: the workspace's storage
          // quota is what refuses one (402 storage_quota_exceeded). The
          // file host's own session (lib/file-access-repair) says so once.
          const fileAccess = fileAccessErrorMessage(error);
          if (fileAccess) {
            if (!failures.includes(fileAccess)) failures.push(fileAccess);
            continue;
          }
          failures.push(
            t(
              (error as { code?: unknown } | null)?.code === "storage_quota_exceeded"
                ? "code.workspaceExplorer.uploadOverQuota"
                : (error as { status?: unknown } | null)?.status === 415
                  ? "code.workspaceExplorer.uploadUnsupported"
                  : "code.workspaceExplorer.uploadFailed",
              { name: label },
            ),
          );
        }
      }
      if (uploaded.size > 0) {
        dispatchNotebookPagesChanged(authority.notebookId);
        dispatchNotebooksChanged();
        dispatchNotebookStorageChanged();
      }
      return failures.length > 0
        ? { ok: false, message: failures.join(" ") }
        : { ok: true };
    },
    [
      createWorkspaceBinaryFile,
      installWorkspaceMutationPage,
      t,
      workspaceMutationAuthority,
      workspaceMutationAuthorityIsCurrent,
      workspacePathConflicts,
    ],
  );

  const renameWorkspaceFile = useCallback(
    async (
      file: CodeWorkspaceFile,
      rawPath: string,
    ): Promise<CodeWorkspaceMutationResult> => {
      const authority = workspaceMutationAuthority();
      const binary = workspaceFileBinaryAsset(file);
      const target = binary
        ? resolveWorkspaceBinaryTarget(rawPath, file.language)
        : resolveCodeWorkspaceMutationTarget(rawPath, file.language);
      if (
        !authority ||
        file.notebookId !== authority.notebookId ||
        !target
      ) {
        return {
          ok: false,
          message: !authority
            ? t("code.commandDisabled.readOnly")
            : target
              ? t("code.workspaceExplorer.renameFailed")
              : t("code.workspaceExplorer.invalidPath"),
        };
      }
      if (getPageExecutionState(file.pageId)) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.targetRunning"),
        };
      }
      if (workspacePathConflicts(target.path, file.pageId)) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.pathExists"),
        };
      }
      if (target.path === file.path && target.language === file.language) {
        return { ok: true };
      }
      if (file.pageId === pageIdRef.current) {
        if (!workspaceMutationAuthorityIsCurrent(authority)) {
          return {
            ok: false,
            message: t("code.commandDisabled.readOnly"),
          };
        }
        commitSourceFileRename(target.path, target.filename);
        windowManagerActions?.renameWindowByMeta?.(
          "pageId",
          file.pageId,
          target.filename,
        );
        return { ok: true };
      }
      // An open binary file's window never saves, so it cannot write its old
      // path back over the rename; an open text file's may.
      if (
        !binary &&
        getOpenCodeWindowSnapshots(
          undefined,
          undefined,
          authority.notebookId,
        ).some((snapshot) => snapshot.pageId === file.pageId)
      ) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.openFileFirst"),
        };
      }
      try {
        const detail = await getPage(file.pageId);
        if (
          !workspaceMutationAuthorityIsCurrent(authority) ||
          detail.notebook_id !== authority.notebookId ||
          detail.page_type !== "code" ||
          !detail.content_json ||
          typeof detail.content_json !== "object" ||
          Array.isArray(detail.content_json) ||
          getPageExecutionState(file.pageId)
        ) {
          return {
            ok: false,
            message: getPageExecutionState(file.pageId)
              ? t("code.workspaceExplorer.targetRunning")
              : t("code.workspaceExplorer.renameFailed"),
          };
        }
        const parsed = codePageContentSchema.safeParse(detail.content_json);
        if (
          !parsed.success ||
          (binary !== null &&
            parseWorkspaceBinaryAsset(detail.content_json) === null)
        ) {
          return {
            ok: false,
            message: t("code.workspaceExplorer.renameFailed"),
          };
        }
        const previousLanguage =
          codeLanguageId(parsed.data.language) ?? file.language;
        // A binary file's content is kept whole: only its name moves.
        const renamedContent =
          binary || previousLanguage === target.language
            ? {
                ...detail.content_json,
                language: target.language,
                sourceFileName: target.filename,
                [CODE_WORKSPACE_REFERENCE_KEY]: {
                  version: 1,
                  path: target.path,
                },
              }
            : buildContent(
                target.language,
                parsed.data.content ?? "",
                null,
                EMPTY_CODE_DEBUG_CONFIGURATION,
                target.filename,
                restoreCodePageLineEnding(detail.content_json),
                restoreCodePageSourceEncoding(detail.content_json),
                null,
                target.path,
              );
        const updated = await updatePage(file.pageId, {
          title: target.filename,
          content_json: renamedContent,
          base_content_version:
            detail.content_version ?? file.contentVersion,
        });
        if (
          updated.notebook_id !== authority.notebookId ||
          updated.page_type !== "code"
        ) {
          throw new Error("Updated page crossed workspace authority.");
        }
        dispatchNotebookPagesChanged(authority.notebookId);
        dispatchNotebooksChanged();
        if (workspaceMutationAuthorityIsCurrent(authority)) {
          installWorkspaceMutationPage(authority.notebookId, updated, false);
          windowManagerActions?.renameWindowByMeta?.(
            "pageId",
            file.pageId,
            target.filename,
          );
        }
        return { ok: true };
      } catch (error) {
        // Another page of the notebook already has this file name.
        if (showNameConflictDialog(error)) {
          return { ok: false, message: (error as Error).message };
        }
        return {
          ok: false,
          message: t("code.workspaceExplorer.renameFailed"),
        };
      }
    },
    [
      commitSourceFileRename,
      installWorkspaceMutationPage,
      t,
      windowManagerActions,
      workspaceFileBinaryAsset,
      workspaceMutationAuthority,
      workspaceMutationAuthorityIsCurrent,
      workspacePathConflicts,
    ],
  );

  const duplicateWorkspaceFile = useCallback(
    async (
      file: CodeWorkspaceFile,
      rawPath: string,
    ): Promise<CodeWorkspaceMutationResult> => {
      const authority = workspaceMutationAuthority();
      const binary = workspaceFileBinaryAsset(file);
      const target = binary
        ? resolveWorkspaceBinaryTarget(rawPath, file.language)
        : resolveCodeWorkspaceMutationTarget(rawPath, file.language);
      if (
        !authority ||
        file.notebookId !== authority.notebookId ||
        !target
      ) {
        return {
          ok: false,
          message: !authority
            ? t("code.commandDisabled.readOnly")
            : target
              ? t("code.workspaceExplorer.duplicateFailed")
              : t("code.workspaceExplorer.invalidPath"),
        };
      }
      if (workspacePathConflicts(target.path)) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.pathExists"),
        };
      }
      if (!windowManagerActions) {
        return {
          ok: false,
          message: t("document.capability.unavailable"),
        };
      }
      try {
        if (binary) {
          // A copy of a binary file is its own upload of the same bytes: an
          // attachment belongs to one page.
          const bytes = await readWorkspaceBinaryAsset(binary);
          const created = await createWorkspaceBinaryFile(
            authority.notebookId,
            target.path,
            new File([bytes], target.filename, { type: binary.mediaType }),
          );
          dispatchNotebookPagesChanged(authority.notebookId);
          dispatchNotebooksChanged();
          dispatchNotebookStorageChanged();
          if (!workspaceMutationAuthorityIsCurrent(authority)) {
            return { ok: true };
          }
          installWorkspaceMutationPage(authority.notebookId, created, true);
          windowManagerActions.openWindow({
            type: "note",
            title: created.title || target.filename,
            meta: {
              notebookId: authority.notebookId,
              pageId: created.id,
              pageType: "code",
            },
          });
          return { ok: true };
        }
        let source: string;
        let sourceLanguage: string;
        let lineEnding: EolStyle;
        let sourceEncoding: CodeSourceEncoding;
        if (file.pageId === pageIdRef.current) {
          if (!workspaceMutationAuthorityIsCurrent(authority)) {
            return {
              ok: false,
              message: t("code.workspaceExplorer.duplicateFailed"),
            };
          }
          source = contentRef.current;
          sourceLanguage = languageRef.current;
          lineEnding = lineEndingRef.current;
          sourceEncoding = sourceEncodingRef.current;
        } else {
          const detail = await getPage(file.pageId);
          if (
            !workspaceMutationAuthorityIsCurrent(authority) ||
            detail.notebook_id !== authority.notebookId ||
            detail.page_type !== "code"
          ) {
            return {
              ok: false,
              message: t("code.workspaceExplorer.duplicateFailed"),
            };
          }
          const parsed = codePageContentSchema.safeParse(detail.content_json);
          if (!parsed.success) {
            return {
              ok: false,
              message: t("code.workspaceExplorer.duplicateFailed"),
            };
          }
          const liveSnapshot = getOpenCodeWindowSnapshots(
            undefined,
            undefined,
            authority.notebookId,
          ).find((snapshot) => snapshot.pageId === file.pageId);
          source = liveSnapshot?.text ?? parsed.data.content ?? "";
          sourceLanguage =
            liveSnapshot?.language ?? parsed.data.language ?? file.language;
          lineEnding = restoreCodePageLineEnding(detail.content_json);
          sourceEncoding = restoreCodePageSourceEncoding(detail.content_json);
        }
        const duplicateTarget = resolveCodeWorkspaceMutationTarget(
          rawPath,
          sourceLanguage,
        );
        if (!duplicateTarget) {
          return {
            ok: false,
            message: t("code.workspaceExplorer.invalidPath"),
          };
        }
        if (workspacePathConflicts(duplicateTarget.path)) {
          return {
            ok: false,
            message: t("code.workspaceExplorer.pathExists"),
          };
        }
        const created = await createPage(authority.notebookId, {
          title: duplicateTarget.filename,
          page_type: "code",
          content_json: buildContent(
            duplicateTarget.language,
            source,
            null,
            EMPTY_CODE_DEBUG_CONFIGURATION,
            duplicateTarget.filename,
            lineEnding,
            sourceEncoding,
            null,
            duplicateTarget.path,
          ),
        });
        if (
          created.notebook_id !== authority.notebookId ||
          created.page_type !== "code"
        ) {
          throw new Error("Duplicated page crossed workspace authority.");
        }
        dispatchNotebookPagesChanged(authority.notebookId);
        dispatchNotebooksChanged();
        if (!workspaceMutationAuthorityIsCurrent(authority)) {
          return { ok: true };
        }
        installWorkspaceMutationPage(authority.notebookId, created, true);
        windowManagerActions.openWindow({
          type: "note",
          title: created.title || duplicateTarget.filename,
          meta: {
            notebookId: authority.notebookId,
            pageId: created.id,
            pageType: "code",
          },
        });
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: t("code.workspaceExplorer.duplicateFailed"),
        };
      }
    },
    [
      createWorkspaceBinaryFile,
      installWorkspaceMutationPage,
      t,
      windowManagerActions,
      workspaceFileBinaryAsset,
      workspaceMutationAuthority,
      workspaceMutationAuthorityIsCurrent,
      workspacePathConflicts,
    ],
  );

  const deleteWorkspaceFile = useCallback(
    async (file: CodeWorkspaceFile): Promise<CodeWorkspaceMutationResult> => {
      const authority = workspaceMutationAuthority();
      if (!authority || file.notebookId !== authority.notebookId) {
        return {
          ok: false,
          message: !authority
            ? t("code.commandDisabled.readOnly")
            : t("code.workspaceExplorer.deleteFailed"),
        };
      }
      if (!windowManagerActions) {
        return {
          ok: false,
          message: t("document.capability.unavailable"),
        };
      }
      if (getPageExecutionState(file.pageId)) {
        return {
          ok: false,
          message: t("code.workspaceExplorer.targetRunning"),
        };
      }
      try {
        await deletePage(file.pageId);
        clearPersistedPageDraft(file.pageId);
        dispatchNotebookPagesChanged(authority.notebookId);
        dispatchNotebooksChanged();
        removeWorkspaceMutationPage(authority.notebookId, file.pageId);
        const pageWindows =
          windowManagerActions
            ?.readWindows?.()
            .filter((candidate) => candidate.meta.pageId === file.pageId) ?? [];
        for (const pageWindow of pageWindows) {
          windowManagerActions?.closeWindow?.(pageWindow.id);
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: t("code.workspaceExplorer.deleteFailed"),
        };
      }
    },
    [
      removeWorkspaceMutationPage,
      t,
      windowManagerActions,
      workspaceMutationAuthority,
    ],
  );

  const importCodeFile = useCallback(
    async (file: File) => {
      // The rendered disabled state can lag a duplicate view by one paint. The
      // page registry is the dispatch-time authority for every import surface.
      if (codeImportDispatchBlocked()) return;
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) return;
      const generation = codeImportGenerationRef.current + 1;
      codeImportGenerationRef.current = generation;
      // File decoding (arrayBuffer/text) is asynchronous. Everything below is
      // the exact document generation the user chose to replace; a later edit,
      // language or metadata change, run, page switch, or newer import owns the
      // window and retires
      // this result instead of letting stale file bytes overwrite it.
      const owner = {
        content: contentRef.current,
        language: languageRef.current,
        debugConfiguration: debugConfigurationRef.current,
        sourceFileName: sourceFileNameRef.current,
        lineEnding: lineEndingRef.current,
        sourceEncoding: sourceEncodingRef.current,
        workspacePath: workspacePathRef.current,
      };
      codeImportingRef.current = true;
      setCodeImporting(true);
      setCodeImportError(null);
      try {
        const imported = await readImportedCodeFile(file);
        if (
          !codeAuthoringAuthorityIsCurrent(authorityGeneration) ||
          codeImportGenerationRef.current !== generation ||
          getPageExecutionState(pageId) !== null ||
          contentRef.current !== owner.content ||
          languageRef.current !== owner.language ||
          debugConfigurationRef.current !== owner.debugConfiguration ||
          sourceFileNameRef.current !== owner.sourceFileName ||
          lineEndingRef.current !== owner.lineEnding ||
          sourceEncodingRef.current !== owner.sourceEncoding ||
          workspacePathRef.current !== owner.workspacePath
        ) {
          return;
        }

        setCodeImportSnapshot({
          language: languageRef.current,
          content: contentRef.current,
          debugConfiguration: debugConfigurationRef.current,
          output: persistedOutputRef.current,
          outputAuthority: persistedOutputAuthorityRef.current,
          runNavigation: persistedRunNavigationRef.current,
          runTimeline: persistedRunTimelineRef.current,
          runProfiles: persistedRunProfilesRef.current,
          debugTimeline: persistedDebugTimelineRef.current,
          sourceFileName: sourceFileNameRef.current,
          lineEnding: lineEndingRef.current,
          sourceEncoding: sourceEncodingRef.current,
          workspacePath: workspacePathRef.current,
          workspacePathExplicit: workspacePathExplicitRef.current,
        });
        setImportedFileName(imported.name);
        setSourceFileRenameDraft(null);
        sourceFileNameRef.current = imported.name;
        setSourceFileName(imported.name);
        const importedWorkspacePath = codeExportFilename(
          imported.name,
          titleRef.current || pageId,
          imported.language,
        );
        workspacePathRef.current = importedWorkspacePath;
        workspacePathExplicitRef.current = false;
        setWorkspacePath(importedWorkspacePath);
        lineEndingRef.current = imported.lineEnding;
        setLineEnding(imported.lineEnding);
        sourceEncodingRef.current = imported.encoding;
        setSourceEncoding(imported.encoding);
        languageRef.current = imported.language;
        setLanguage(imported.language);
        installAuthoritativeContent(imported.content);
        debugConfigurationRef.current = EMPTY_CODE_DEBUG_CONFIGURATION;
        setDebugConfiguration(EMPTY_CODE_DEBUG_CONFIGURATION);
        persistedOutputRef.current = null;
        persistedOutputAuthorityRef.current = null;
        persistedRunNavigationRef.current = null;
        persistedRunTimelineRef.current = [];
        runProfileRequestGenerationRef.current += 1;
        persistedRunProfilesRef.current = [];
        debugTimelinePersistenceGenerationRef.current += 1;
        debugTimelineReplayGenerationRef.current += 1;
        persistedDebugTimelineRef.current = [];
        setOutput(null);
        setRunTimeline([]);
        setSelectedRunTimelineIndex(null);
        setRunProfiles([]);
        setDebugTimeline([]);
        setSelectedDebugTimelineIndex(null);
        setOutputCopied(false);
        setLastRunScope(null);
        setTracebackNavigationSource(null);
        persistRef.current(
          imported.language,
          imported.content,
          null,
          EMPTY_CODE_DEBUG_CONFIGURATION,
        );
      } catch (error) {
        if (codeImportGenerationRef.current !== generation) return;
        setImportedFileName(null);
        // Say why: a GBK or Shift-JIS file used to read only "Import failed".
        const code =
          error instanceof CodeFileImportError ? error.code : undefined;
        setCodeImportError(
          code === "too_large"
            ? t("editor.importTooLarge")
            : code === "not_text"
              ? t("editor.importNotText")
              : code === "unsupported_type"
                ? t("editor.importUnsupportedType")
                : code === "read_failed"
                  ? t("editor.importReadFailed")
                  : t("editor.importFailed"),
        );
      } finally {
        if (codeImportGenerationRef.current === generation) {
          codeImportingRef.current = false;
          setCodeImporting(false);
        }
      }
    },
    [
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      codeImportDispatchBlocked,
      installAuthoritativeContent,
      pageId,
      t,
    ],
  );

  const handleCodeFileImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      // Let a user choose the SAME file again after an error or an undo.
      input.value = "";
      if (!file) return;
      await importCodeFile(file);
    },
    [importCodeFile],
  );

  const codeFileDragHasFiles = useCallback(
    (event: DragEvent<HTMLDivElement>) =>
      Array.from(event.dataTransfer.types).includes("Files"),
    [],
  );

  const handleCodeFileDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        codeImportDispatchBlocked() ||
        !codeFileDragHasFiles(event)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      codeImportDragDepthRef.current += 1;
      setCodeImportDragActive(true);
    },
    [codeFileDragHasFiles, codeImportDispatchBlocked],
  );

  const handleCodeFileDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        codeImportDispatchBlocked() ||
        !codeFileDragHasFiles(event)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    },
    [codeFileDragHasFiles, codeImportDispatchBlocked],
  );

  const handleCodeFileDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!codeFileDragHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      codeImportDragDepthRef.current = Math.max(
        0,
        codeImportDragDepthRef.current - 1,
      );
      if (codeImportDragDepthRef.current === 0) {
        setCodeImportDragActive(false);
      }
    },
    [codeFileDragHasFiles],
  );

  const handleCodeFileDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!codeFileDragHasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      codeImportDragDepthRef.current = 0;
      setCodeImportDragActive(false);
      if (codeImportDispatchBlocked()) return;
      const file = event.dataTransfer.files?.[0];
      if (file) void importCodeFile(file);
    },
    [codeFileDragHasFiles, codeImportDispatchBlocked, importCodeFile],
  );

  const undoCodeFileImport = useCallback(() => {
    if (
      !codeMayAuthorRef.current ||
      !codeImportSnapshot ||
      getPageExecutionState(pageId)
    ) {
      return;
    }
    retirePendingCodeImportAuthority();
    const previous = codeImportSnapshot;
    setCodeImportSnapshot(null);
    setImportedFileName(null);
    setSourceFileRenameDraft(null);
    setCodeImportError(null);
    sourceFileNameRef.current = previous.sourceFileName;
    setSourceFileName(previous.sourceFileName);
    workspacePathRef.current = previous.workspacePath;
    workspacePathExplicitRef.current = previous.workspacePathExplicit;
    setWorkspacePath(previous.workspacePath);
    lineEndingRef.current = previous.lineEnding;
    setLineEnding(previous.lineEnding);
    sourceEncodingRef.current = previous.sourceEncoding;
    setSourceEncoding(previous.sourceEncoding);
    languageRef.current = previous.language;
    setLanguage(previous.language);
    installAuthoritativeContent(previous.content);
    debugConfigurationRef.current = previous.debugConfiguration;
    setDebugConfiguration(previous.debugConfiguration);
    const restoredPreviousOutput =
      previous.output &&
      previous.outputAuthority?.output === previous.output &&
      previous.outputAuthority.stdin === stdinTextRef.current
        ? previous.output
        : null;
    persistedOutputRef.current = restoredPreviousOutput;
    persistedOutputAuthorityRef.current =
      restoredPreviousOutput
        ? previous.outputAuthority
        : null;
    persistedRunNavigationRef.current = restoredPreviousOutput
      ? previous.runNavigation
      : null;
    persistedRunTimelineRef.current = previous.runTimeline;
    runProfileRequestGenerationRef.current += 1;
    persistedRunProfilesRef.current = previous.runProfiles;
    debugTimelinePersistenceGenerationRef.current += 1;
    debugTimelineReplayGenerationRef.current += 1;
    persistedDebugTimelineRef.current = previous.debugTimeline;
    const timelineFallback = restoredPreviousOutput
      ? null
      : (previous.runTimeline[0] ?? null);
    const timelineFallbackNavigation =
      timelineFallback?.language === previous.language &&
      timelineFallback.input.stdinBytes === 0 &&
      stdinTextRef.current === ""
        ? restoreCodePageRunTimelineNavigation(
            timelineFallback,
            previous.content,
          )
        : null;
    const visibleTimelineFallback = timelineFallbackNavigation
      ? timelineFallback
      : null;
    setOutput(
      restoredPreviousOutput ??
        (visibleTimelineFallback
          ? codePageRunTimelineEntryToRunResult(visibleTimelineFallback)
          : null),
    );
    setRunTimeline(previous.runTimeline);
    setSelectedRunTimelineIndex(visibleTimelineFallback ? 0 : null);
    setRunProfiles(previous.runProfiles);
    setDebugTimeline(previous.debugTimeline);
    setSelectedDebugTimelineIndex(previous.debugTimeline.length > 0 ? 0 : null);
    setOutputCopied(false);
    setLastRunScope(
      (restoredPreviousOutput ? previous.runNavigation?.selection : null) ??
        timelineFallbackNavigation?.selection ??
        null,
    );
    setTracebackNavigationSource(
      (restoredPreviousOutput ? previous.runNavigation?.source : null) ??
        (timelineFallbackNavigation ? previous.content : null),
    );
    persistRef.current(
      previous.language,
      previous.content,
      restoredPreviousOutput,
      previous.debugConfiguration,
    );
  }, [
    codeImportSnapshot,
    installAuthoritativeContent,
    pageId,
    retirePendingCodeImportAuthority,
  ]);

  const handleLineEndingChange = useCallback(
    (nextLineEnding: EolStyle) => {
      if (!codeMayAuthorRef.current) return;
      if (lineEndingRef.current === nextLineEnding) return;
      retirePendingCodeImportAuthority();
      lineEndingRef.current = nextLineEnding;
      setLineEnding(nextLineEnding);
      persistRef.current(languageRef.current, contentRef.current);
    },
    [retirePendingCodeImportAuthority],
  );

  const handleSourceEncodingChange = useCallback(
    (nextEncoding: CodeSourceEncoding) => {
      if (!codeMayAuthorRef.current) return;
      if (sourceEncodingRef.current === nextEncoding) return;
      retirePendingCodeImportAuthority();
      sourceEncodingRef.current = nextEncoding;
      setSourceEncoding(nextEncoding);
      persistRef.current(languageRef.current, contentRef.current);
    },
    [retirePendingCodeImportAuthority],
  );

  const handleLanguageChange = useCallback(
    (nextLanguage: string) => {
      if (!codeMayAuthorRef.current) return;
      if (getPageExecutionState(pageId) !== null) return;
      if (codeLanguageId(nextLanguage) === null) return;
      if (languageRef.current === nextLanguage) return;
      retirePendingCodeImportAuthority();
      const nextBasename = codeExportFilename(
        codeWorkspaceBasename(workspacePathRef.current),
        titleRef.current || pageId,
        nextLanguage,
      );
      const nextWorkspacePath =
        replaceCodeWorkspaceBasename(
          workspacePathRef.current,
          nextBasename,
        ) ?? nextBasename;
      workspacePathRef.current = nextWorkspacePath;
      setWorkspacePath(nextWorkspacePath);
      if (sourceFileNameRef.current) {
        sourceFileNameRef.current = nextBasename;
        setSourceFileName(nextBasename);
      }
      languageRef.current = nextLanguage;
      setLanguage(nextLanguage);
      persistRef.current(nextLanguage, contentRef.current);
    },
    [pageId, retirePendingCodeImportAuthority],
  );

  useEffect(() => {
    return () => {
      // Invalidate a pending file-read continuation after this window changes
      // page or closes, before the next page can accept its bytes.
      codeImportGenerationRef.current += 1;
      codeImportingRef.current = false;
    };
  }, [pageId]);

  // Register this window in the cross-window registry so Find-in-Files /
  // Compare in OTHER open code windows can read + write this buffer.
  // The registration is keyed by the stable (pageId + windowId) pair and is
  // torn down when the window unmounts. getText / getLanguage / setText always
  // read the LATEST values via refs, not the closure-time snapshots.
  useEffect(() => {
    const authority = (): CodeAuthoringAuthoritySnapshot => ({
      allowed: codeMayAuthorRef.current,
      generation: codeAuthoringGenerationRef.current,
      bindingGeneration: bufferBindingGenerationRef.current ?? undefined,
      documentGeneration: `${codeTestDebugHydrationGenerationRef.current}:${
        bufferBindingGenerationRef.current ?? "plain"
      }`,
    });
    codeWindowAuthoringAuthorities.set(currentCodeWindowBufferId, authority);
    const entry: CodeWindowEntry = {
      notebookId: workspaceNotebookId || undefined,
      pageId,
      windowId,
      get label() {
        return workspacePathRef.current;
      },
      getText: () => contentRef.current,
      getLanguage: () => languageRef.current,
      setText: (text: string, positions?: CodeTextChangesAgainst) => {
        if (!codeMayAuthorRef.current) return;
        if (!acceptCodeSourceLength(text)) return;
        // Registry consumers (Find in Files, Compare, Problems) may re-read the
        // buffer synchronously from the change notification below. Update the
        // live ref before scheduling React state so they never observe the
        // just-replaced text as stale for one render.
        debugTimelinePersistenceGenerationRef.current += 1;
        debugTimelineReplayGenerationRef.current += 1;
        installAuthoritativeContent(text);
        persistRef.current(
          languageRef.current,
          text,
          undefined,
          undefined,
          positions,
        );
        notifyCodeWindowRegistryChange(registeredCodeWindowEntryRef.current ?? undefined);
      },
      getProblems: () => problemsRef.current,
      getProblemCount: () => diagnosticCountRef.current,
      focus: focusCodeEditor,
      revealRange: revealCodeRange,
    };
    registeredCodeWindowEntryRef.current = entry;
    const token = registerCodeWindow(entry);
    return () => {
      if (registeredCodeWindowEntryRef.current === entry) {
        registeredCodeWindowEntryRef.current = null;
      }
      unregisterCodeWindow(token);
      if (
        codeWindowAuthoringAuthorities.get(currentCodeWindowBufferId) ===
        authority
      ) {
        codeWindowAuthoringAuthorities.delete(currentCodeWindowBufferId);
      }
    };
    // Re-register when the stable identifiers change. autosave.page changes
    // when the title loads, but we read it through .label getter, so we don't
    // need to re-register on every title change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentCodeWindowBufferId,
    installAuthoritativeContent,
    pageId,
    revealCodeRange,
    windowId,
    workspaceNotebookId,
  ]);

  // The registry entry exposes live getters, but subscribers cache projected
  // Search/Problems rows. Publish source-identity changes so every open code
  // window refreshes those labels immediately (including extension changes).
  useEffect(() => {
    notifyCodeWindowRegistryChange(registeredCodeWindowEntryRef.current ?? undefined);
    notifyCodeWindowSourceChange(currentCodeWindowBufferId);
  }, [
    currentCodeWindowBufferId,
    language,
    sourceFileName,
    workspacePath,
  ]);

  useEffect(() => {
    notifyCodeWindowSourceChange(currentCodeWindowBufferId);
  }, [content, contentSnapshotRevision, currentCodeWindowBufferId]);

  const buildNotebookWorkspaceIntelligenceProjection = useCallback(
    (pages: readonly PageItem[]): CodeWorkspaceIntelligenceProjection => {
      const currentReference = persistedCodeWorkspaceReference(
        workspacePathRef.current,
      );
      const currentPage: PageItem = {
        id: pageId,
        notebook_id: workspaceNotebookId,
        title: titleRef.current || pageId,
        page_type: "code",
        content_version: workspaceCurrentContentVersion,
        content_json: {
          type: CODE_CONTENT_TYPE,
          language: languageRef.current,
          ...(sourceFileNameRef.current
            ? { sourceFileName: sourceFileNameRef.current }
            : {}),
          ...(currentReference
            ? { [CODE_WORKSPACE_REFERENCE_KEY]: currentReference }
            : {}),
        },
      };
      const catalog = buildCodeWorkspaceCatalog(
        [currentPage, ...pages.filter((page) => page.id !== pageId)],
        pageId,
      );
      const openEntries = getOpenCodeBuffers();
      const self = openEntries.find(
        (entry) => codeWindowEntryId(entry) === currentCodeWindowBufferId,
      );
      const orderedEntries = [
        ...(self ? [self] : []),
        ...openEntries.filter((entry) => entry !== self),
      ];
      const liveBuffers = orderedEntries.map((entry) => ({
        pageId: entry.pageId,
        path: entry.label,
        language: entry.getLanguage(),
        text: entry.getText(),
      }));
      if (!liveBuffers.some((buffer) => buffer.pageId === pageId)) {
        liveBuffers.unshift({
          pageId,
          path: workspacePathRef.current,
          language: languageRef.current,
          text: contentRef.current,
        });
      }

      return buildCodeWorkspaceIntelligenceProjection(
        catalog.files,
        pages,
        liveBuffers,
        pageId,
      );
    },
    [
      currentCodeWindowBufferId,
      pageId,
      workspaceCurrentContentVersion,
      workspaceNotebookId,
    ],
  );

  const notebookWorkspaceIntelligenceProjection =
    useCallback(async (): Promise<CodeWorkspaceIntelligenceProjection | null> => {
      if (guestMode || !workspaceNotebookId) return null;
      const pages = await ensureWorkspacePageDetails();
      return buildNotebookWorkspaceIntelligenceProjection(pages);
    }, [
      buildNotebookWorkspaceIntelligenceProjection,
      ensureWorkspacePageDetails,
      guestMode,
      workspaceNotebookId,
    ]);

  // Standalone multi-file intelligence. Each deliberate compiler-backed action
  // reads a fresh bounded notebook snapshot, so unopened authorized pages and
  // unsaved open buffers participate without creating a long-lived stale
  // project. Same-file misses fall back to the editor's local service.
  const navigateCrossWindowIntelligence = useCallback(
    async (
      offset: number,
      resolveHit: typeof resolveCodeWindowDefinition,
    ): Promise<boolean> => {
      try {
        const workspaceProjection =
          await notebookWorkspaceIntelligenceProjection();
        const buffers =
          workspaceProjection?.buffers ?? liveCodeWindowBuffers();
        const activeBufferId =
          workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
        const activeSource = buffers.find(
          (buffer) => buffer.bufferId === activeBufferId,
        )?.source;
        if (activeSource === undefined) return false;
        const hit = await resolveHit(buffers, activeBufferId, offset);
        if (!hit) return false;
        if (workspaceProjection) {
          if (contentRef.current !== activeSource) return false;
          const target = workspaceProjection.targets.find(
            (candidate) => candidate.bufferId === hit.bufferId,
          );
          if (!target || target.expectedSource !== hit.expectedSource) {
            return false;
          }
          const openTargets = getOpenCodeBuffers().filter(
            (entry) => entry.pageId === target.pageId,
          );
          const openTarget = openTargets.find(
            (entry) =>
              entry.getText() === hit.expectedSource &&
              Boolean(entry.revealRange),
          );
          if (openTarget) {
            openTarget.revealRange!(hit.from, hit.to);
            return true;
          }
          if (openTargets.length > 0) return false;
          const location = offsetToLineCol(hit.expectedSource, hit.from);
          activateWorkspaceFile(target.file, {
            ...location,
            from: hit.from,
            to: hit.to,
            contentVersion: target.file.contentVersion,
          });
          return true;
        }

        const entries = getOpenCodeBuffers();
        const activeEntry = entries.find(
          (entry) =>
            codeWindowEntryId(entry) === currentCodeWindowBufferId,
        );
        const target = entries.find(
          (entry) => codeWindowEntryId(entry) === hit.bufferId,
        );
        if (
          activeEntry?.getText() !== activeSource ||
          target?.getText() !== hit.expectedSource ||
          !target.revealRange
        ) {
          return false;
        }
        target.revealRange(hit.from, hit.to);
        return true;
      } catch (error) {
        // `false` is reserved for a semantic miss. Catalog, detail, compiler
        // and navigation failures reject so the editor can show its existing
        // unavailable receipt instead of inventing a local "not found".
        throw error;
      }
    },
    [
      activateWorkspaceFile,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
    ],
  );

  const crossWindowGoToDefinition = useCallback(
    (offset: number) =>
      navigateCrossWindowIntelligence(
        offset,
        resolveCodeWindowDefinition,
      ),
    [navigateCrossWindowIntelligence],
  );

  const crossWindowGoToTypeDefinition = useCallback(
    (offset: number) =>
      navigateCrossWindowIntelligence(
        offset,
        resolveCodeWindowTypeDefinition,
      ),
    [navigateCrossWindowIntelligence],
  );

  const crossWindowGoToImplementation = useCallback(
    (offset: number) =>
      navigateCrossWindowIntelligence(
        offset,
        resolveCodeWindowImplementation,
      ),
    [navigateCrossWindowIntelligence],
  );

  const captureCrossWindowIntelligenceOwner = useCallback(
    (isCurrent?: () => boolean) => {
      const ownerPageId = pageIdRef.current;
      const ownerBufferId = currentCodeWindowBufferIdRef.current;
      const ownerLanguage = languageRef.current;
      const ownerSource = contentRef.current;
      const upstreamIsCurrent = isCurrent ?? (() => true);
      return {
        ownerPageId,
        ownerBufferId,
        ownerLanguage,
        ownerSource,
        isCurrent: () =>
          upstreamIsCurrent() &&
          pageIdRef.current === ownerPageId &&
          currentCodeWindowBufferIdRef.current === ownerBufferId &&
          languageRef.current === ownerLanguage &&
          contentRef.current === ownerSource,
      };
    },
    [],
  );

  const workspaceIntelligenceSourcesAreCurrent = useCallback(
    (
      expectedSources: readonly { bufferId: string; source: string }[],
      workspaceProjection: CodeWorkspaceIntelligenceProjection | null,
      activeBufferId: string,
    ): boolean => {
      if (workspaceProjection) {
        const targetsById = new Map(
          workspaceProjection.targets.map((target) => [
            target.bufferId,
            target,
          ]),
        );
        for (const expected of expectedSources) {
          if (
            expected.bufferId === activeBufferId &&
            contentRef.current !== expected.source
          ) {
            return false;
          }
          const target = targetsById.get(expected.bufferId);
          if (!target) return false;
          const openTargets = getOpenCodeBuffers().filter(
            (entry) => entry.pageId === target.pageId,
          );
          if (
            openTargets.length > 0 &&
            !openTargets.some(
              (entry) => entry.getText() === expected.source,
            )
          ) {
            return false;
          }
        }
        return true;
      }

      const entriesById = new Map(
        getOpenCodeBuffers().map((entry) => [
          codeWindowEntryId(entry),
          entry,
        ]),
      );
      return expectedSources.every(
        (expected) =>
          entriesById.get(expected.bufferId)?.getText() === expected.source,
      );
    },
    [],
  );

  const beginCrossWindowReferenceRequest = useCallback(
    (isCurrent?: () => boolean) => {
      const owner = captureCrossWindowIntelligenceOwner(isCurrent);
      const requestId = ++crossWindowReferenceRequestIdRef.current;
      crossWindowReferenceAuthorityRef.current = null;
      return {
        ...owner,
        requestId,
        isCurrent: () =>
          requestId === crossWindowReferenceRequestIdRef.current &&
          owner.isCurrent(),
      };
    },
    [captureCrossWindowIntelligenceOwner],
  );

  const crossWindowPeekDefinition = useCallback(
    async (
      offset: number,
      isCurrent?: () => boolean,
    ): Promise<CrossFileDefinitionPreview | null> => {
      const owner = captureCrossWindowIntelligenceOwner(isCurrent);
      const workspaceProjection =
        await notebookWorkspaceIntelligenceProjection();
      if (!owner.isCurrent()) return null;
      const buffers =
        workspaceProjection?.buffers ?? liveCodeWindowBuffers();
      const activeBufferId =
        workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
      const activeSource = buffers.find(
        (buffer) => buffer.bufferId === activeBufferId,
      )?.source;
      if (activeSource === undefined) return null;
      const hit = await resolveCodeWindowDefinition(
        buffers,
        activeBufferId,
        offset,
      );
      if (!owner.isCurrent() || !hit) return null;
      const targetBuffer = buffers.find(
        (buffer) => buffer.bufferId === hit.bufferId,
      );
      if (!targetBuffer || targetBuffer.source !== hit.expectedSource) {
        return null;
      }
      if (
        !workspaceIntelligenceSourcesAreCurrent(
          [
            { bufferId: activeBufferId, source: activeSource },
            { bufferId: hit.bufferId, source: hit.expectedSource },
          ],
          workspaceProjection,
          activeBufferId,
        ) ||
        !owner.isCurrent()
      ) {
        return null;
      }
      return {
        label: targetBuffer.label,
        source: hit.expectedSource,
        line: offsetToLineCol(hit.expectedSource, hit.from).line,
      };
    },
    [
      captureCrossWindowIntelligenceOwner,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
      workspaceIntelligenceSourcesAreCurrent,
    ],
  );

  const crossWindowCallHierarchy = useCallback(
    async (
      offset: number,
      direction: "incoming" | "outgoing",
      isCurrent?: () => boolean,
    ): Promise<CrossFileReferenceResult | null> => {
      const request = beginCrossWindowReferenceRequest(isCurrent);
      const workspaceProjection =
        await notebookWorkspaceIntelligenceProjection();
      if (!request.isCurrent()) return null;
      const buffers =
        workspaceProjection?.buffers ?? liveCodeWindowBuffers();
      const activeBufferId =
        workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
      // The compiler answer is a function of every input buffer, including
      // peers that produced no row. Preserve the complete query snapshot so a
      // no-hit peer becoming a hit while the service is pending also retires
      // this result.
      const querySources = buffers.map(({ bufferId, source }) => ({
        bufferId,
        source,
      }));
      const querySourcesAreCurrent = () =>
        request.isCurrent() &&
        workspaceIntelligenceSourcesAreCurrent(
          querySources,
          workspaceProjection,
          activeBufferId,
        );
      const result = await resolveCodeWindowCallHierarchy(
        buffers,
        activeBufferId,
        offset,
        direction,
      );
      if (!result || !querySourcesAreCurrent()) return null;
      const expectedSources = new Map<string, string>();
      for (const reference of result.refs) {
        expectedSources.set(reference.bufferId, reference.expectedSource);
      }
      const targets: Map<string, CrossWindowReferenceTargetSnapshot> =
        workspaceProjection
          ? new Map(
              workspaceProjection.targets
                .filter((target) => expectedSources.has(target.bufferId))
                .map((target) => [
                  target.bufferId,
                  { file: target.file, expectedSource: target.expectedSource },
                ]),
            )
          : new Map();
      // Reauthenticate immediately before the one atomic publish. Target-map
      // construction is synchronous today, but keeping this at the write
      // boundary prevents a later async target-authority step from weakening
      // the receipt accidentally.
      if (!querySourcesAreCurrent()) return null;
      crossWindowReferenceAuthorityRef.current = {
        requestId: request.requestId,
        ownerPageId: request.ownerPageId,
        ownerBufferId: request.ownerBufferId,
        ownerLanguage: request.ownerLanguage,
        ownerSource: request.ownerSource,
        sources: expectedSources,
        targets,
      };
      return {
        refs: result.refs.map((reference) => ({
          cellId: reference.bufferId,
          cellLabel: reference.label,
          from: reference.from,
          to: reference.to,
          line: reference.line,
          column: reference.column,
          preview: reference.preview,
        })),
        activeIndex: result.activeIndex,
      };
    },
    [
      beginCrossWindowReferenceRequest,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
      workspaceIntelligenceSourcesAreCurrent,
    ],
  );

  const crossWindowReferences = useCallback(
    async (
      offset: number,
      isCurrent?: () => boolean,
    ): Promise<CrossFileReferenceResult | null> => {
      const request = beginCrossWindowReferenceRequest(isCurrent);
      const workspaceProjection =
        await notebookWorkspaceIntelligenceProjection();
      if (!request.isCurrent()) return null;
      const buffers =
        workspaceProjection?.buffers ?? liveCodeWindowBuffers();
      const activeBufferId =
        workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
      const querySources = buffers.map(({ bufferId, source }) => ({
        bufferId,
        source,
      }));
      const querySourcesAreCurrent = () =>
        request.isCurrent() &&
        workspaceIntelligenceSourcesAreCurrent(
          querySources,
          workspaceProjection,
          activeBufferId,
        );
      const result = await resolveCodeWindowReferences(
        buffers,
        activeBufferId,
        offset,
      );
      if (!result || !querySourcesAreCurrent()) return null;
      const expectedSources = new Map<string, string>();
      for (const reference of result.refs) {
        expectedSources.set(reference.bufferId, reference.expectedSource);
      }
      const targets: Map<string, CrossWindowReferenceTargetSnapshot> =
        workspaceProjection
          ? new Map(
              workspaceProjection.targets
                .filter((target) => expectedSources.has(target.bufferId))
                .map((target) => [
                  target.bufferId,
                  { file: target.file, expectedSource: target.expectedSource },
                ]),
            )
          : new Map();
      if (!querySourcesAreCurrent()) return null;
      crossWindowReferenceAuthorityRef.current = {
        requestId: request.requestId,
        ownerPageId: request.ownerPageId,
        ownerBufferId: request.ownerBufferId,
        ownerLanguage: request.ownerLanguage,
        ownerSource: request.ownerSource,
        sources: expectedSources,
        targets,
      };
      return {
        activeIndex: result.activeIndex,
        refs: result.refs.map((reference) => ({
          cellId: reference.bufferId,
          cellLabel: reference.label,
          from: reference.from,
          to: reference.to,
          line: reference.line,
          column: reference.column,
          preview: reference.preview,
        })),
      };
    },
    [
      beginCrossWindowReferenceRequest,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
      workspaceIntelligenceSourcesAreCurrent,
    ],
  );

  const navigateToCodeWindowRange = useCallback(
    (bufferId: string, from: number, to: number) => {
      const authority = crossWindowReferenceAuthorityRef.current;
      if (
        !authority ||
        authority.requestId !== crossWindowReferenceRequestIdRef.current ||
        authority.ownerPageId !== pageIdRef.current ||
        authority.ownerBufferId !== currentCodeWindowBufferIdRef.current ||
        authority.ownerLanguage !== languageRef.current ||
        authority.ownerSource !== contentRef.current
      ) {
        return;
      }
      const expectedSource = authority.sources.get(bufferId);
      if (
        expectedSource === undefined ||
        from < 0 ||
        to < from ||
        to > expectedSource.length
      ) {
        return;
      }
      const workspaceTarget = authority.targets.get(bufferId);
      if (workspaceTarget) {
        if (workspaceTarget.expectedSource !== expectedSource) return;
        const openTargets = getOpenCodeBuffers().filter(
          (entry) => entry.pageId === workspaceTarget.file.pageId,
        );
        const target = openTargets.find(
          (entry) =>
            entry.getText() === expectedSource &&
            Boolean(entry.revealRange),
        );
        if (target) {
          target.revealRange!(from, to);
          return;
        }
        if (openTargets.length > 0) return;
        const location = offsetToLineCol(expectedSource, from);
        activateWorkspaceFile(workspaceTarget.file, {
          ...location,
          from,
          to,
          contentVersion: workspaceTarget.file.contentVersion,
        });
        return;
      }
      const target = getOpenCodeBuffers().find(
        (entry) => codeWindowEntryId(entry) === bufferId,
      );
      if (target?.getText() !== expectedSource) return;
      target.revealRange?.(from, to);
    },
    [activateWorkspaceFile],
  );

  const crossWindowQuickInfo = useCallback(
    async (offset: number) => {
      try {
        const workspaceProjection =
          await notebookWorkspaceIntelligenceProjection();
        const buffers =
          workspaceProjection?.buffers ?? liveCodeWindowBuffers();
        const activeBufferId =
          workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
        const info = await resolveCodeWindowHover(
          buffers,
          activeBufferId,
          offset,
        );
        if (!info) return null;
        if (
          !workspaceIntelligenceSourcesAreCurrent(
            info.expectedSources,
            workspaceProjection,
            activeBufferId,
          )
        ) {
          return null;
        }
        return {
          signature: info.signature,
          documentation: info.documentation,
        };
      } catch {
        return null;
      }
    },
    [
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
      workspaceIntelligenceSourcesAreCurrent,
    ],
  );

  const crossWindowSignatureHelp = useCallback(
    async (offset: number) => {
      try {
        const workspaceProjection =
          await notebookWorkspaceIntelligenceProjection();
        const buffers =
          workspaceProjection?.buffers ?? liveCodeWindowBuffers();
        const activeBufferId =
          workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
        const info = await resolveCodeWindowSignatureHelp(
          buffers,
          activeBufferId,
          offset,
        );
        if (
          !info ||
          !workspaceIntelligenceSourcesAreCurrent(
            info.expectedSources,
            workspaceProjection,
            activeBufferId,
          )
        ) {
          return null;
        }
        return {
          label: info.label,
          parameters: info.parameters,
          activeParameter: info.activeParameter,
          hasContent: info.hasContent,
        };
      } catch {
        return null;
      }
    },
    [
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
      workspaceIntelligenceSourcesAreCurrent,
    ],
  );

  const crossWindowDiagnostics = useCallback(
    async (source: string) => {
      const workspaceProjection =
        await notebookWorkspaceIntelligenceProjection();
      const activeBufferId =
        workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId;
      const buffers = (
        workspaceProjection?.buffers ?? liveCodeWindowBuffers()
      ).map((buffer) =>
        buffer.bufferId === activeBufferId
          ? { ...buffer, source }
          : buffer,
      );
      try {
        const result = await resolveCodeWindowDiagnostics(
          buffers,
          activeBufferId,
        );
        if (!result) return null;
        if (workspaceProjection) {
          const targetsById = new Map(
            workspaceProjection.targets.map((target) => [
              target.bufferId,
              target,
            ]),
          );
          const openEntriesByPageId = new Map<
            string,
            ReturnType<typeof getOpenCodeBuffers>
          >();
          const openEntries = getOpenCodeBuffers();
          for (const entry of openEntries) {
            const entries = openEntriesByPageId.get(entry.pageId) ?? [];
            entries.push(entry);
            openEntriesByPageId.set(entry.pageId, entries);
          }
          for (const expected of result.expectedSources) {
            if (expected.bufferId === activeBufferId) {
              if (expected.source !== source) return [];
              continue;
            }
            const target = targetsById.get(expected.bufferId);
            if (!target || target.expectedSource !== expected.source) {
              return [];
            }
            const openTargets = openEntriesByPageId.get(target.pageId) ?? [];
            if (
              openTargets.length > 0 &&
              !openTargets.some(
                (entry) => entry.getText() === expected.source,
              )
            ) {
              return [];
            }
          }
          return result.diagnostics;
        }
        const entriesById = new Map(
          getOpenCodeBuffers().map((entry) => [
            codeWindowEntryId(entry),
            entry,
          ]),
        );
        for (const expected of result.expectedSources) {
          const currentSource =
            expected.bufferId === currentCodeWindowBufferId
              ? source
              : entriesById.get(expected.bufferId)?.getText();
          // A peer changed while TypeScript was resolving. Suppress this stale
          // batch; the peer-source revision already requested a fresh lint.
          if (currentSource !== expected.source) return [];
        }
        return result.diagnostics;
      } catch {
        return null;
      }
    },
    [
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
      notebookWorkspaceIntelligenceProjection,
    ],
  );

  const crossWindowCompletionIdentifiers = useCallback(
    () => {
      const workspaceProjection =
        !guestMode && workspaceNotebookId
          ? buildNotebookWorkspaceIntelligenceProjection(
              workspacePagesRef.current,
            )
          : null;
      return harvestOpenCodeIdentifiers(
        workspaceProjection?.buffers ?? liveCodeWindowBuffers(),
        workspaceProjection?.activeBufferId ?? currentCodeWindowBufferId,
      );
    },
    [
      buildNotebookWorkspaceIntelligenceProjection,
      currentCodeWindowBufferId,
      guestMode,
      liveCodeWindowBuffers,
      workspaceNotebookId,
    ],
  );

  const applyCrossWindowSnapshotEdits = useCallback(
    (
      edits: readonly CodeWindowRenameEdit[],
      expectedSources: ReadonlyArray<{
        bufferId: string;
        source: string;
      }> = edits.map((edit) => ({
        bufferId: edit.bufferId,
        source: edit.before,
      })),
      expectedAuthorities?: ReadonlyMap<
        string,
        CodeAuthoringAuthoritySnapshot
      >,
    ): boolean => {
      if (!codeMayAuthorRef.current) return false;
      const entriesById = new Map(
        getOpenCodeBuffers().map((entry) => [
          codeWindowEntryId(entry),
          entry,
        ]),
      );
      // Preflight EVERY target before changing any one window. A peer edit or
      // close after an async compiler query aborts the whole transaction. The
      // same applies to an ACL generation change: revoke then re-grant is a new
      // authority and cannot revive a retained refactor action.
      for (const expected of expectedSources) {
        const entry = entriesById.get(expected.bufferId);
        if (!entry || entry.getText() !== expected.source) return false;
        const liveAuthority = codeWindowAuthoritySnapshot(expected.bufferId);
        const expectedAuthority = expectedAuthorities?.get(expected.bufferId);
        if (
          !liveAuthority?.allowed ||
          (expectedAuthorities &&
            (!expectedAuthority?.allowed ||
              expectedAuthority.generation !== liveAuthority.generation ||
              expectedAuthority.documentGeneration !==
                liveAuthority.documentGeneration))
        ) {
          return false;
        }
      }
      for (const edit of edits) {
        const liveAuthority = codeWindowAuthoritySnapshot(edit.bufferId);
        const expectedAuthority = expectedAuthorities?.get(edit.bufferId);
        if (
          !liveAuthority?.allowed ||
          (expectedAuthorities &&
            (!expectedAuthority?.allowed ||
              expectedAuthority.generation !== liveAuthority.generation ||
              expectedAuthority.documentGeneration !==
                liveAuthority.documentGeneration))
        ) {
          return false;
        }
      }
      for (const edit of edits) {
        entriesById
          .get(edit.bufferId)
          ?.setText(
            edit.after,
            edit.changes
              ? { changes: edit.changes, expected: edit.before }
              : undefined,
          );
      }
      return true;
    },
    [],
  );

  const captureCodeRefactorTargets = useCallback(
    (): CodeRefactorTargetSnapshot[] =>
      getOpenCodeWindowSnapshots(
        undefined,
        undefined,
        workspaceNotebookId,
      ).map((snapshot) => {
        const bufferId = snapshot.bufferId;
        const authority = codeWindowAuthoritySnapshot(bufferId);
        return {
          bufferId,
          label: snapshot.label,
          language: snapshot.language,
          source: snapshot.text,
          allowed: authority?.allowed === true,
          authorityGeneration: authority?.generation ?? -1,
          bindingGeneration: authority?.bindingGeneration,
          documentGeneration:
            authority?.documentGeneration ??
            `authority:${authority?.generation ?? -1}`,
        };
      }),
    [workspaceNotebookId],
  );

  const codeCopilotSelection = useMemo(() => {
    const selectedText = editorExecutionState.selectedText;
    if (
      editorExecutionState.selectionCount !== 1 ||
      editorExecutionState.selectedTextTruncated ||
      !selectedText
    ) {
      return null;
    }
    const start = editorExecutionState.selectionFrom;
    const end = editorExecutionState.selectionTo;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      (start as number) < 0 ||
      (end as number) < (start as number) ||
      contentRef.current.slice(start as number, end as number) !== selectedText
    ) {
      return null;
    }
    return { start: start as number, end: end as number, text: selectedText };
  }, [editorExecutionState]);
  // The editor the inline Copilot works in: the active split pane's.
  const getCodeCopilotEditor = useCallback((): HTMLElement | null => {
    const stack = codeEditorStackRef.current;
    return (
      stack?.querySelector<HTMLElement>(
        `[data-testid="code-split-pane-${splitViewState.activePane}"] .cm-editor`,
      ) ??
      stack?.querySelector<HTMLElement>(".cm-editor") ??
      null
    );
  }, [splitViewState.activePane]);
  // The top-rail star and Ctrl/Cmd+I (VS Code's inline chat) open the
  // prompt under the selection; again closes it.
  // After a write, the saved notice sits at the editor's bottom edge, as the
  // other editors' saved notices do, not over the code it changed.
  const [copilotDocked, setCopilotDocked] = useState(false);
  const toggleCodeCopilot = useCallback(
    (open?: boolean) => {
      const next = open ?? !copilotOpen;
      if (next && !copilotOpen) {
        // Right under the selection's last line, the selected code kept in
        // view (scrolled first when the card would cover it).
        const editor = getCodeCopilotEditor();
        revealCodeSelectionForPrompt(editor);
        setCopilotAnchor(codeInlineAnchor(editor, codeEditorStackRef.current));
        setCopilotDocked(false);
        requestAnimationFrame(() =>
          setCopilotAnchor(codeInlineAnchor(editor, codeEditorStackRef.current)),
        );
      }
      if (!next) codeCopilotResume.consume();
      setCopilotOpen(next);
    },
    [codeCopilotResume, copilotOpen, getCodeCopilotEditor],
  );
  // The ribbon button: open over a selection already drawn is not wanted
  // here; the member draws the code first and the card follows.
  const startCodeCopilotPick = useCallback(() => {
    if (copilotOpen) {
      toggleCodeCopilot(false);
      return;
    }
    setCopilotPicking((picking) => !picking);
  }, [copilotOpen, toggleCodeCopilot]);
  // Read at the drag's end: each selection change re-renders this window, and
  // the listeners below must outlive the drag they are watching.
  const toggleCodeCopilotRef = useRef(toggleCodeCopilot);
  useLayoutEffect(() => {
    toggleCodeCopilotRef.current = toggleCodeCopilot;
  });
  useEffect(() => {
    if (!copilotPicking) return;
    const editor = getCodeCopilotEditor();
    if (!editor) return;
    const selectionDrawn = () => {
      const view = EditorView.findFromDOM(editor);
      return Boolean(view && view.state.selection.ranges.some((range) => !range.empty));
    };
    let frame = 0;
    const openWhenDrawn = () => {
      cancelAnimationFrame(frame);
      // After the editor has taken the pointer's final selection.
      frame = requestAnimationFrame(() => {
        if (!selectionDrawn()) return;
        setCopilotPicking(false);
        toggleCodeCopilotRef.current(true);
      });
    };
    // A drag begun in the code and let go anywhere (past the editor's edge
    // too); a click on the ribbon over an older selection opens nothing.
    let drawing = false;
    const onPointerDown = () => {
      drawing = true;
    };
    const onPointerUp = () => {
      if (!drawing) return;
      drawing = false;
      openWhenDrawn();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      // A keyboard selection is drawn once Shift is let go.
      if (event.key === "Shift") openWhenDrawn();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        setCopilotPicking(false);
      }
    };
    editor.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    editor.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      editor.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      editor.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [copilotPicking, getCodeCopilotEditor]);
  useEffect(() => {
    if (copilotOpen || codeCopilotReadOnly) setCopilotPicking(false);
  }, [codeCopilotReadOnly, copilotOpen]);
  // The card follows its lines as the editor scrolls.
  useEffect(() => {
    if (!copilotOpen || copilotDocked) return;
    const editor = getCodeCopilotEditor();
    const scroller = editor?.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setCopilotAnchor(codeInlineAnchor(editor, codeEditorStackRef.current)),
      );
    };
    scroller.addEventListener("scroll", follow, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", follow);
    };
  }, [copilotDocked, copilotOpen, getCodeCopilotEditor]);
  const [copilotRunMark, setCopilotRunMark] = useState<object | null | undefined>(undefined);
  const handoffCodeCopilot = useCallback(
    ({ prompt }: { prompt: string; capabilityId: string | null }) => {
      if (!windowManagerActions || !workspaceNotebookId) return;
      windowManagerActions.openWindow({
        type: "ai_panel",
        title: `AI · ${workspacePath}`,
        meta: { pageId, notebookId: workspaceNotebookId, pageType: "code" },
      });
      requestChatPrefill({ notebookId: workspaceNotebookId, text: prompt });
    },
    [
      pageId,
      windowManagerActions,
      workspaceNotebookId,
      workspacePath,
    ],
  );

  const applyRefactorPreview = useCallback(() => {
    const plan = refactorPreviewPlan;
    if (!plan || refactorPreviewBusy) return;
    const targets = captureCodeRefactorTargets();
    if (!codeRefactorPreviewPlanIsCurrent(plan, targets)) return;

    setRefactorPreviewBusy(true);
    const authorities = new Map<string, CodeAuthoringAuthoritySnapshot>(
      plan.guards.map((guard) => [
        guard.bufferId,
        {
          allowed: true,
          generation: guard.authorityGeneration,
          documentGeneration: guard.documentGeneration,
        },
      ]),
    );
    const receipt = createCodeRefactorUndoReceipt(plan);
    const applied = applyCrossWindowSnapshotEdits(
      plan.changes.map((change) => ({
        bufferId: change.bufferId,
        before: change.before,
        after: change.after,
        changes: change.changes,
      })),
      plan.guards.map((guard) => ({
        bufferId: guard.bufferId,
        source: guard.source,
      })),
      authorities,
    );
    setRefactorPreviewBusy(false);
    if (!applied) return;
    setRefactorPreviewPlan(null);
    setRefactorUndoReceipt(receipt);
  }, [
    applyCrossWindowSnapshotEdits,
    captureCodeRefactorTargets,
    refactorPreviewBusy,
    refactorPreviewPlan,
  ]);

  const discardRefactorPreview = useCallback(() => {
    if (refactorPreviewBusy) return;
    setRefactorPreviewPlan(null);
  }, [refactorPreviewBusy]);

  const undoRefactorPreview = useCallback(() => {
    const receipt = refactorUndoReceipt;
    if (!receipt || refactorPreviewBusy) return;
    const targets = captureCodeRefactorTargets();
    if (!codeRefactorUndoReceiptIsCurrent(receipt, targets)) return;

    setRefactorPreviewBusy(true);
    const authorities = new Map<string, CodeAuthoringAuthoritySnapshot>(
      receipt.guards.map((guard) => [
        guard.bufferId,
        {
          allowed: true,
          generation: guard.authorityGeneration,
          documentGeneration: guard.documentGeneration,
        },
      ]),
    );
    const sourceById = new Map(
      receipt.changes.map((change) => [change.bufferId, change.after]),
    );
    const undone = applyCrossWindowSnapshotEdits(
      receipt.changes.map((change) => ({
        bufferId: change.bufferId,
        before: change.after,
        after: change.before,
        changes: change.changes
          ? invertCodeTextChanges(change.before, change.changes)
          : undefined,
      })),
      receipt.guards.map((guard) => ({
        bufferId: guard.bufferId,
        source: sourceById.get(guard.bufferId) ?? "",
      })),
      authorities,
    );
    setRefactorPreviewBusy(false);
    if (undone) setRefactorUndoReceipt(null);
  }, [
    applyCrossWindowSnapshotEdits,
    captureCodeRefactorTargets,
    refactorPreviewBusy,
    refactorUndoReceipt,
  ]);

  const crossWindowRename = useCallback(
    async (
      offset: number,
      newName: string,
    ): Promise<boolean | "cancelled"> => {
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) return "cancelled";
      const buffers = liveCodeWindowBuffers();
      const authorities = new Map(
        getOpenCodeBuffers().map((entry) => [
          codeWindowEntryId(entry),
          codeWindowAuthoritySnapshot(codeWindowEntryId(entry)) ?? {
            allowed: false,
            generation: -1,
          },
        ]),
      );
      try {
        const edits = await resolveCodeWindowRename(
          buffers,
          currentCodeWindowBufferId,
          offset,
          newName,
        );
        if (!edits) return false;
        if (!codeAuthoringAuthorityIsCurrent(authorityGeneration)) {
          return "cancelled";
        }
        return applyCrossWindowSnapshotEdits(
          edits,
          undefined,
          authorities,
        )
          ? true
          : "cancelled";
      } catch (error) {
        // A failed project query cannot prove that a local-only fallback is
        // complete. Reject so the editor can keep the user's rename draft open
        // with a retryable unavailable receipt instead of pretending success.
        throw error;
      }
    },
    [
      applyCrossWindowSnapshotEdits,
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
    ],
  );

  const crossWindowCodeFixes = useCallback(
    async (
      from: number,
      to: number,
    ): Promise<CrossFileCodeFixAction[] | null> => {
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) return null;
      const authorities = new Map(
        getOpenCodeBuffers().map((entry) => [
          codeWindowEntryId(entry),
          codeWindowAuthoritySnapshot(codeWindowEntryId(entry)) ?? {
            allowed: false,
            generation: -1,
          },
        ]),
      );
      try {
        const actions = await resolveCodeWindowCodeFixes(
          liveCodeWindowBuffers(),
          currentCodeWindowBufferId,
          from,
          to,
        );
        if (
          !actions ||
          !codeAuthoringAuthorityIsCurrent(authorityGeneration)
        ) {
          return null;
        }
        return actions.map((action) => ({
          description: action.description,
          apply: async (isCurrent) =>
            isCurrent() &&
            codeAuthoringAuthorityIsCurrent(authorityGeneration) &&
            applyCrossWindowSnapshotEdits(
              action.edits,
              action.expectedSources,
              authorities,
            ),
        }));
      } catch (error) {
        throw error;
      }
    },
    [
      applyCrossWindowSnapshotEdits,
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
    ],
  );

  const crossWindowRefactors = useCallback(
    async (
      from: number,
      to: number,
    ): Promise<CrossFileRefactorAction[] | null> => {
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) return null;
      try {
        // Mutating project actions deliberately use only registered, writable
        // windows. Read-only intelligence can include persisted/unopened pages,
        // but an all-or-nothing refactor may not plan against a virtual page id
        // that this client cannot preflight and update atomically.
        const buffers = liveCodeWindowBuffers();
        const activeBufferId = currentCodeWindowBufferId;
        const offers = await resolveCodeWindowRefactors(
          buffers,
          activeBufferId,
          from,
          to,
        );
        if (
          !offers ||
          !codeAuthoringAuthorityIsCurrent(authorityGeneration)
        ) {
          return null;
        }
        return offers.map((offer) => ({
          description: offer.description,
          // Materialize on CHOICE, against a project rebuilt from the live
          // buffers: an edit made while the menu was open invalidates the
          // snapshot check rather than being overwritten with stale spans.
          preview: async (isCurrent) => {
            if (
              !isCurrent() ||
              !codeAuthoringAuthorityIsCurrent(authorityGeneration)
            ) {
              return false;
            }
            const liveBuffers = liveCodeWindowBuffers();
            const action = await materializeCodeWindowRefactor(
              liveBuffers,
              activeBufferId,
              from,
              to,
              offer.refactorName,
              offer.actionName,
            );
            if (
              !action ||
              !isCurrent() ||
              !codeAuthoringAuthorityIsCurrent(authorityGeneration)
            ) {
              return false;
            }
            const expectedIds = new Set(
              action.expectedSources.map((expected) => expected.bufferId),
            );
            const targets = captureCodeRefactorTargets().filter((target) =>
              expectedIds.has(target.bufferId),
            );
            refactorPreviewSequenceRef.current += 1;
            const plan = buildCodeRefactorPreviewPlan({
              id: `${currentCodeWindowBufferId}:${authorityGeneration}:${refactorPreviewSequenceRef.current}`,
              description: action.description,
              expectedSources: action.expectedSources,
              edits: action.edits,
              targets,
            });
            if (
              !plan ||
              !isCurrent() ||
              !codeAuthoringAuthorityIsCurrent(authorityGeneration) ||
              !codeRefactorPreviewPlanIsCurrent(
                plan,
                captureCodeRefactorTargets(),
              )
            ) {
              return false;
            }
            setRefactorPreviewPlan(plan);
            return true;
          },
        }));
      } catch (error) {
        throw error;
      }
    },
    [
      captureCodeRefactorTargets,
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      currentCodeWindowBufferId,
      liveCodeWindowBuffers,
    ],
  );

  // Run on an HTML page runs the live buffer as a page in the AI window's
  // sandbox (see CodeHtmlPagePreview). No execution provider or page
  // execution claim is involved; each Run replaces the previous preview.
  const previewHtmlBuffer = useCallback(() => {
    if (
      testRunBusyRef.current ||
      runningRef.current ||
      debugStateRef.current.running
    ) {
      return;
    }
    const preview: RunResult = { logs: [], html: contentRef.current };
    updateOutputPanelVisibility(true);
    setOutputCopied(false);
    setLastRunScope(null);
    setSelectedRunTimelineIndex(null);
    setHtmlPreviewOutput(preview);
    setHtmlPreviewGeneration((generation) => generation + 1);
    setOutput(preview);
  }, [updateOutputPanelVisibility]);

  const handleRun = useCallback(async (
    selection?: ExecutionSelection,
    options?: {
      /** Auto compile: typing that overtakes it before it is sent ends it
       * quietly (the next pause compiles the newer text) instead of
       * reporting a failed save. */
      readonly automatic?: boolean;
    },
  ) => {
    const invocationLanguage = languageRef.current;
    if (isPreviewLanguage(invocationLanguage)) {
      previewHtmlBuffer();
      return;
    }
    // A saved AI window's source is a JSON package, not a program: run as
    
    // opens the window it is, on the notebook's desk or the workspace page.
    if (hasSharedAppContract(contentRef.current)) {
      const target = linkedWindow ?? (
        draftReview || !pageId || !workspaceNotebookId
          ? null
          : { pageId, notebookId: workspaceNotebookId }
      );
      if (target && windowManagerActions) {
        const title = sharedAppTitle(contentRef.current) || draftReview?.title || "";
        windowManagerActions.openWindow({
          type: "vibe_window",
          title: title || "AI window",
          meta: {
            pageId: target.pageId,
            notebookId: target.notebookId,
            notebook_id: target.notebookId,
            ...(title ? { title } : {}),
            ...(linkedWindow?.conversationId ? { conversation_id: linkedWindow.conversationId } : {}),
          },
        });
        return;
      }
    }
    const invocationCapability = executionProviders.capability(invocationLanguage);
    // A debug session owns the same kernel; starting a normal run alongside it
    // would put two executions in one namespace.
    if (
      testRunBusyRef.current ||
      runningRef.current ||
      debugStateRef.current.running ||
      invocationCapability.status !== "available" ||
      (invocationCapability.mode === "remote" &&
        !codeMayAuthorRef.current &&
        draftRemoteExecution === null)
    ) {
      return;
    }
    const invocationSource = contentRef.current;
    // What can never run in the browser runtime (a GUI window, a terminal UI,
    // a subprocess) is said before the run starts, not after it fails --
    // unless the deployment offers cloud windows: then it runs in one
    
    const guardedSource = selection?.source ?? invocationSource;
    const runtimeGuardFindings = codeRuntimeGuardFindings(invocationLanguage, guardedSource);
    const cloudGuiEligible =
      runtimeGuardFindings.length > 0 &&
      invocationLanguage === "python" &&
      !guestMode &&
      draftRemoteExecution === null &&
      Boolean(pageId);
    let runsInCloud = false;
    if (cloudGuiEligible) {
      // Not read yet (a Run right after the page opened): the run shows it
      // started at once, and is decided once the answer is in -- a cloud
      // window, or the guard's notice. Never a silent "finished".
      if (cloudGuiCapabilityNow() === null) {
        updateOutputPanelVisibility(true);
        setOutput({ logs: [t("code.cloudGui.starting")] });
      }
      runsInCloud = (await cloudGuiCapability()).available && runsInCloudGui(guardedSource);
    }
    if (
      runtimeGuardFindings.length > 0 &&
      !runsInCloud &&
      runtimeGuardOverrideRef.current !== guardedSource
    ) {
      const guardOutput: RunResult = {
        logs: [],
        error: [
          t("code.runtimeGuard.title"),
          ...runtimeGuardFindings.map((finding) =>
            t(`code.runtimeGuard.${finding.kind}`, {
              module: finding.module,
              line: finding.line,
            }),
          ),
        ].join("\n"),
      };
      updateOutputPanelVisibility(true);
      setLastRunScope(null);
      setSelectedRunTimelineIndex(null);
      setRuntimeGuard({
        output: guardOutput,
        source: guardedSource,
        language: invocationLanguage,
        findings: runtimeGuardFindings,
      });
      setOutput(guardOutput);
      return;
    }
    // Fast [draft] mode draws the page's images as boxes; Cache TikZ figures
    // draws each picture once (lib/code-runner/latex-draft-mode).
    // A draft's review compiles the draft exactly as it stands (its route runs
    // nothing else).
    const executableSource =
      selection?.source ??
      (compilesLatexProject(invocationLanguage) && !draftReviewing
        ? latexCompileSource(invocationSource, {
            draft: latexDraftModeEnabled(pageId),
            figures: latexFigureCacheEnabled(pageId),
          })
        : invocationSource);
    const invocationStdin = stdinTextRef.current;
    const invocationStdinBytes = new TextEncoder().encode(
      invocationStdin,
    ).byteLength;
    const inputLimitKind = languageExecutionInputLimitKind(
      invocationCapability.limits,
      executableSource,
      invocationStdin,
    );
    if (inputLimitKind !== null) {
      updateOutputPanelVisibility(true);
      setOutput({
        logs: [],
        error: t(
          inputLimitKind === "source"
            ? "code.sourceExecutionTooLarge"
            : "code.stdinExecutionTooLarge",
        ),
      });
      return;
    }
    const executionClaim = acquirePageExecutionClaim("run", invocationLanguage);
    if (!executionClaim) return;
    const authoringGeneration = captureCodeAuthoringAuthority();
    runAuthoringGenerationRef.current = authoringGeneration;
    updateOutputPanelVisibility(true);
    setTracebackNavigationSource(invocationSource);
    outputShouldFollowRef.current = true;
    setOutputStreamFilter("all");
    setOutputLogStart(null);
    setOutputSearchRunEpoch((epoch) => epoch + 1);
    setOutputSearchActiveIndex(0);
    setOutputSearchRevealLogIndex(null);
    setOutputSearchAutoRevealVersion((version) => version + 1);
    setSelectedRunTimelineIndex(null);
    // A new execution replaces the last completed result. Clear its persisted
    // snapshot immediately so a close/reopen during a long run cannot revive
    // stale output from the previous run. A LaTeX compile with nothing to
    // clear (an edit already dropped the last result from the page) queues
    // no draft: an unchanged draft would still be written, and every compile
    // would wait for that round trip before it is sent.
    const compilesLatex = compilesLatexProject(invocationLanguage);
    if (
      codeAuthoringAuthorityIsCurrent(authoringGeneration) &&
      (!compilesLatex ||
        persistedOutputRef.current !== null ||
        persistedRunNavigationRef.current !== null)
    ) {
      persistedOutputRef.current = null;
      persistedOutputAuthorityRef.current = null;
      persistedRunNavigationRef.current = null;
      persistRef.current(languageRef.current, contentRef.current, null);
    }
    runningRef.current = true;
    setRunning(true);
    const compileStartedAt = performance.now();
    if (compilesLatex) {
      latexCompileSchedulerRef.current?.compileStarted();
      setLatexCompileStartedAt(Date.now());
    }
    setOutputCopied(false);
    setLastRunScope(selection ?? null);
    const generation = runGenerationRef.current + 1;
    runGenerationRef.current = generation;
    runningLanguageRef.current = invocationLanguage;
    const controller = new AbortController();
    abortRef.current = controller;
    const executionAuthority: ActiveExecutionAuthority = {
      kind: "run",
      generation,
      pageId,
      language: invocationLanguage,
      source: executableSource,
      capability: invocationCapability,
      controller,
    };
    activeExecutionAuthorityRef.current = executionAuthority;

    // Reuse the multi-buffer host's bounded/rate-limited streaming path. Runner output
    // remains bounded at its worker/sandbox boundary; this second boundary keeps
    // a mocked/legacy producer from turning each chunk into a React render.
    const coalescer = new OutputCoalescer((snapshot) => {
      if (runGenerationRef.current !== generation) return;
      setOutput({
        logs: snapshot.logs,
        logStreams: snapshot.logStreams,
      });
    });
    coalescerRef.current = coalescer;
    const onOutput = coalescer.push.bind(coalescer);
    let result: RunResult;
    // Only a receipt that survived the registry's dispatch-time authority,
    // identity and output validation may become document state. A rejected
    // provider response is still useful as a live diagnostic, but persisting it
    // would make a forged/stale failure look like an accepted last run after
    // close and reopen.
    let acceptedExecutionReceipt = false;
    let acceptedProviderId: string | null = null;
    let acceptedSourceSha256: string | null = null;
    let acceptedStdinSha256: string | null = null;
    let acceptedRunExitCode: number | null = null;
    let acceptedArtifact: LanguageExecutionArtifact | null = null;
    let acceptedLatexCompile: {
      readonly files: LatexCompileFiles;
      readonly mainPath: string;
      readonly timedOutLimitMs: number | null;
      readonly sources: readonly CompiledDocumentSource[];
    } | null = null;

    // Typing overtook an automatic compile before it was sent.
    let superseded = false;
    try {
      if (invocationLanguage === "python") {
        setOutput(
          runsInCloud
            ? { logs: [t("code.cloudGui.starting")] }
            : isPythonRuntimeReady()
              ? null
              : { logs: [t("code.loadingPython")] },
        );
      } else if (!compilesLatex) {
        setOutput(null);
      }
      // A LaTeX compile leaves the last result up (its log, its PDF) until the
      // new one arrives, as Overleaf's preview does; the status says it runs.
      // What the compile needs besides the saved page starts now, beside the
      // save: the project's pages. The files the page's last compile left are
      // the server's to keep (the API's copy and the executor's compile
      // directory), so a compile uploads none of them.
      const projectDetailsLoad = compilesLatex ? ensureWorkspacePageDetails() : null;
      const freshBuild =
        carriesBuildCache(invocationLanguage) && latexFreshBuildRef.current;
      // Awaited below; a save that fails first must not leave it unhandled.
      projectDetailsLoad?.catch(() => undefined);
      const overtakenByTyping = () =>
        options?.automatic === true &&
        !controller.signal.aborted &&
        runGenerationRef.current === generation &&
        pageIdRef.current === pageId &&
        languageRef.current === invocationLanguage &&
        contentRef.current !== invocationSource;
      const saveFailure = () =>
        overtakenByTyping() ? new LatexAutoCompileSuperseded() : new Error(t("pages.saveFailed"));
      // A draft has no saved page: its runs name version 0 of its own id.
      let executionContentVersion = draftRemoteExecution
        ? 0
        : workspaceCurrentContentVersion;
      const invocationLease = codePageBufferLeaseRef.current;
      const remoteInvocationIsCurrent = () =>
        !controller.signal.aborted && runGenerationRef.current === generation &&
        pageIdRef.current === pageId &&
        (draftRemoteExecution !== null ||
          codeAuthoringAuthorityIsCurrent(authoringGeneration)) &&
        contentRef.current === invocationSource &&
        languageRef.current === invocationLanguage &&
        stdinTextRef.current === invocationStdin &&
        codePageBufferLeaseRef.current === invocationLease &&
        (!invocationLease || invocationLease.isWritable());
      if (invocationCapability.mode === "remote" && draftRemoteExecution === null) {
        // Drain the run-start output clearing through the canonical writer.
        // Sending before that save could race its debounce and use an older
        // page version. Never guess a version or retry a conflicting run.
        const saved = await (invocationLease ? invocationLease.saveNow() : autosave.saveNow());
        const savedVersion = saved?.content_version;
        if (
          !remoteInvocationIsCurrent() ||
          !saved || saved.id !== pageId || saved.notebook_id !== workspaceNotebookId ||
          saved.page_type !== "code" || typeof savedVersion !== "number" ||
          !Number.isSafeInteger(savedVersion) || savedVersion < workspaceCurrentContentVersion ||
          saved.content_json?.language !== invocationLanguage ||
          saved.content_json?.content !== invocationSource
        ) throw saveFailure();
        executionContentVersion = savedVersion;
      }
      // A LaTeX project is every workspace file under the main file's folder:
      // load the pages the catalog lists by name only, so their text and
      // attachments are known before the project is assembled below.
      if (projectDetailsLoad) {
        await projectDetailsLoad;
      }
      const [request, invocationSourceSha256, invocationStdinSha256] =
        await Promise.all([
          createLanguageExecutionRequest({
            requestId: crypto.randomUUID(),
            pageId,
            contentVersion: executionContentVersion,
            language: invocationLanguage,
            source: executableSource,
            stdin: invocationStdin,
            capability: invocationCapability,
          }),
          sha256ExecutionSource(invocationSource),
          sha256ExecutionSource(invocationStdin),
        ]);
      if (invocationCapability.mode === "remote" && !remoteInvocationIsCurrent()) {
        throw saveFailure();
      }
      const requestAuthority = {
        schemaVersion: request.schemaVersion,
        requestId: request.requestId,
        pageId: request.pageId,
        contentVersion: request.contentVersion,
        language: request.language,
        sourceSha256: request.sourceSha256,
        phase: request.phase,
        providerId: request.providerId,
        toolchainProfile: request.toolchainProfile,
        toolchainDigest: request.toolchainDigest,
        sandboxProfile: request.sandboxProfile,
        sandboxPolicyDigest: request.sandboxPolicyDigest,
        supports: request.supports,
        limits: request.limits,
      };
      // A LaTeX compile starts from what this page's last successful compile
      // left on the server, so latexmk reruns only what changed. Recompile
      // from scratch asked for this compile to start from nothing; a compile
      // that fails before here leaves it asked for the next one.
      latexFreshBuildRef.current = false;
      // It sends its project too: every other workspace file under the main
      // file's folder, unsaved edits included (lib/code-runner/latex-project).
      const latexMainPath = workspacePathRef.current;
      // A draft's review has no workspace: its project is its one file, which
      // its PDF's double-click (SyncTeX) brings back to in this editor.
      const latexSources = !compilesLatexProject(invocationLanguage)
        ? []
        : draftReviewing
          ? [{
              pageId,
              path: workspacePathRef.current,
              language: invocationLanguage,
              contentVersion: 0,
              source: invocationSource,
            }]
          : captureWorkspaceFileSources();
      const latexProject = compilesLatexProject(invocationLanguage)
        ? assembleLatexProject(pageId, latexMainPath, latexSources)
        : null;
      if (latexProject?.tooLarge) {
        throw new Error(t("codeOutput.latexProjectTooLarge"));
      }
      if (latexProject) {
        // What this compile reads, so an auto compile after it runs only
        // when the text has moved on from it.
        const compileInput = new Map<string, string>([[LATEX_MAIN_INPUT, invocationSource]]);
        for (const file of latexSources) {
          if (!file.binaryAsset && file.pageId !== pageId) {
            compileInput.set(file.path, file.source);
          }
        }
        latexCompileSchedulerRef.current?.recordInput(compileInput);
      }
      const receipt = await dispatchLanguageExecution(executionProviders, {
        source: executableSource,
        stdin: invocationStdin,
        signal: controller.signal,
        onOutput,
        request: requestAuthority,
        freshBuild,
        projectFiles: latexProject?.files ?? null,
        projectAssets: latexProject?.assets ?? null,
      });
      result = executionOutputForDisplay(receipt.output, t);
      if (latexProject && latexProject.skipped.length > 0) {
        result = {
          ...result,
          logs: [
            ...result.logs,
            t("codeOutput.latexProjectSkipped", {
              files: latexProject.skipped.slice(0, 8).join(", "),
            }),
          ],
          ...(result.logStreams
            ? { logStreams: [...result.logStreams, "stderr" as const] }
            : {}),
        };
      }
      acceptedProviderId = request.providerId;
      acceptedSourceSha256 = invocationSourceSha256;
      acceptedStdinSha256 = invocationStdinSha256;
      acceptedRunExitCode = receipt.run.exitCode;
      acceptedArtifact = receipt.artifact ?? null;
      if (latexProject) {
        acceptedLatexCompile = {
          files: {
            outputFiles: receipt.outputFiles ?? null,
            buildCache: receipt.buildCache ?? null,
            artifact: receipt.artifact ?? null,
          },
          mainPath: latexMainPath,
          timedOutLimitMs:
            receipt.outcome === "timed-out" && receipt.timeLimitMs !== undefined
              ? receipt.timeLimitMs
              : null,
          // The project's text files, for the PDF window to open at a line.
          sources: latexSources
            .filter(
              (file) =>
                !file.binaryAsset &&
                latexWorkspaceProjectPath(latexMainPath, file.path) !== null,
            )
            .map((file) => ({
              path: file.path,
              pageId: file.pageId,
              title: file.path.split("/").at(-1) ?? file.path,
            })),
        };
      }
      acceptedExecutionReceipt = true;
    } catch (error) {
      superseded = error instanceof LatexAutoCompileSuperseded;
      // The runners normally resolve errors as RunResult. Keep the window from
      // getting stuck in "running" if an injected/legacy runner throws.
      result =
        isLanguageExecutionAuthorityError(error) ||
        isLanguageExecutionOutputError(error)
          ? boundExecutionResult({
              logs: [],
              error: t("document.capability.unavailable"),
            })
          : isRemoteExecutionRefusal(error)
            ? // The service declined the run before it started: say why, as a
              // status, not as the program's traceback.
              boundExecutionResult({
                logs: [],
                error: error.message,
                notStarted: true,
              })
            : boundedCodeRuntimeFailure(
                error,
                t("document.capability.unavailable"),
              );
    } finally {
      // Flush a partial final line, then reconcile the authoritative settled
      // result over the transient live snapshot.
      coalescer.finalize();
      coalescer.dispose();
      if (coalescerRef.current === coalescer) coalescerRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
    }

    if (runGenerationRef.current === generation) {
      const compileMs = Math.max(0, performance.now() - compileStartedAt);
      // An overtaken auto compile leaves the last result where it was.
      if (!superseded) {
        setOutput(result);
        setLatexCompile(
          acceptedLatexCompile
            ? {
                output: result,
                files: acceptedLatexCompile.files,
                mainPath: acceptedLatexCompile.mainPath,
                durationMs: compileMs,
                timedOutLimitMs: acceptedLatexCompile.timedOutLimitMs,
              }
            : null,
        );
        setInlinePdfHighlight(null);
        const compiledFilename = acceptedArtifact
          ? compiledDocumentFilename(titleRef.current, acceptedArtifact.name)
          : "";
        setCompiledDocument(
          acceptedArtifact
            ? {
                output: result,
                artifact: acceptedArtifact,
                filename: compiledFilename,
              }
            : null,
        );
        if (
          compiledDocumentWindowKey &&
          isCompileOnlyLanguage(invocationLanguage)
        ) {
          if (acceptedArtifact) {
            publishCompiledDocument(
              compiledDocumentWindowKey,
              acceptedArtifact,
              compiledFilename,
              workspaceNotebookId || null,
              acceptedLatexCompile
                ? {
                    outputFiles: acceptedLatexCompile.files.outputFiles,
                    mainPath: acceptedLatexCompile.mainPath,
                    sources: acceptedLatexCompile.sources,
                  }
                : null,
              compileMs,
            );
            showCompiledDocumentWindow(false);
          } else {
            markCompiledDocumentStale(compiledDocumentWindowKey);
          }
        }
      }
      if (
        acceptedExecutionReceipt &&
        codeAuthoringAuthorityIsCurrent(authoringGeneration) &&
        contentRef.current === invocationSource &&
        languageRef.current === invocationLanguage &&
        stdinTextRef.current === invocationStdin
      ) {
        const persistedRunNavigation = createCodePageRunNavigation(
          invocationSource,
          selection ?? null,
        );
        persistedRunNavigationRef.current = persistedRunNavigation
          ? {
              source: invocationSource,
              persisted: persistedRunNavigation,
              selection: selection ?? null,
          }
          : null;
        const timelineEntry =
          acceptedProviderId && acceptedSourceSha256 && acceptedStdinSha256
            ? createCodePageRunTimelineEntry({
                completedAt: Date.now(),
                language: invocationLanguage,
                providerId: acceptedProviderId,
                sourceSha256: acceptedSourceSha256,
                source: invocationSource,
                selection: selection ?? null,
                stdinSha256: acceptedStdinSha256,
                stdinBytes: invocationStdinBytes,
                output: result,
                exitCode: acceptedRunExitCode,
              })
            : null;
        if (timelineEntry) {
          const nextTimeline = appendCodePageRunTimelineEntry(
            persistedRunTimelineRef.current,
            timelineEntry,
          );
          persistedRunTimelineRef.current = nextTimeline;
          setRunTimeline(nextTimeline);
          setSelectedRunTimelineIndex(
            nextTimeline[0]?.completedAt === timelineEntry.completedAt &&
              nextTimeline[0]?.providerId === timelineEntry.providerId
              ? 0
              : null,
          );
        }
        persistedOutputRef.current = result;
        persistedOutputAuthorityRef.current = {
          language: invocationLanguage,
          source: invocationSource,
          stdin: invocationStdin,
          output: result,
        };
        persistRef.current(invocationLanguage, invocationSource, result);
      } else if (codeAuthoringAuthorityIsCurrent(authoringGeneration)) {
        // The result remains useful in this live session, but it belongs to an
        // older source/language snapshot or it failed registry validation. The
        // run-start path already queued the newest draft with output=null, so
        // do not attach this diagnostic to a document it never authoritatively
        // executed.
        persistedRunNavigationRef.current = null;
        persistedOutputRef.current = null;
        persistedOutputAuthorityRef.current = null;
      }
      // Retire the exact registry claim before advertising the local run as
      // idle. Otherwise a fast follow-up click can pass runningRef, lose the
      // still-owned claim on the next line, and look accepted without running.
      releasePageExecutionClaim(executionClaim);
      runningRef.current = false;
      runningLanguageRef.current = null;
      if (activeExecutionAuthorityRef.current === executionAuthority) {
        activeExecutionAuthorityRef.current = null;
      }
      if (runAuthoringGenerationRef.current === authoringGeneration) {
        runAuthoringGenerationRef.current = null;
      }
      setRunning(false);
      // A compile asked for while this one ran (an edit's pause, a shortcut)
      // may start now. A Stop retired this generation and forgot it instead.
      if (compilesLatex) latexCompileSchedulerRef.current?.compileSettled();
    }
    // Idempotent for the current-generation path above; required when an older
    // generation settles after a replacement has already retired its UI state.
    releasePageExecutionClaim(executionClaim);
  }, [
    linkedWindow,
    draftReview,
    pageId,
    workspaceNotebookId,
    windowManagerActions,
    acquirePageExecutionClaim,
    autosave,
    captureCodeAuthoringAuthority,
    captureWorkspaceFileSources,
    codeAuthoringAuthorityIsCurrent,
    compiledDocumentWindowKey,
    draftRemoteExecution,
    draftReviewing,
    ensureWorkspacePageDetails,
    executionProviders,
    guestMode,
    previewHtmlBuffer,
    releasePageExecutionClaim,
    showCompiledDocumentWindow,
    t,
    pageId,
    updateOutputPanelVisibility,
    workspaceCurrentContentVersion,
    workspaceNotebookId,
  ]);

  // --- Interactive console ---------------------------------------------------
  // One submission is one execution on the SAME kernel as Run, taken under the
  // same lock: the prompt can neither race a file run nor be shadowed by one.
  const settleConsoleEntry = useCallback(
    (id: number, result: RunResult) => {
      setConsoleEntries((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, result } : entry)),
      );
    },
    [],
  );

  const evaluateInConsole = useCallback(
    async (source: string) => {
      const invocationLanguage = languageRef.current;
      const invocationCapability = executionProviders.capability(
        invocationLanguage,
      );
      // The debugger owns the same kernel while it is stepping, and it does not
      // hold this lock, so it has to be asked directly.
      if (
        testRunBusyRef.current ||
        runningRef.current ||
        debugStateRef.current.running ||
        invocationCapability.status !== "available" ||
        !invocationCapability.supports.interactiveConsole
      ) {
        return;
      }
      const executionClaim = acquirePageExecutionClaim(
        "console",
        invocationLanguage,
      );
      if (!executionClaim) return;
      const id = (consoleIdRef.current += 1);
      setConsoleEntries((prev) =>
        [...prev, { id, input: source }].slice(-CODE_CONSOLE_MAX_ENTRIES),
      );
      runningRef.current = true;
      runningLanguageRef.current = invocationLanguage;
      setConsoleBusy(true);
      const generation = (runGenerationRef.current += 1);
      const controller = new AbortController();
      consoleAbortRef.current = controller;
      const executionAuthority: ActiveExecutionAuthority = {
        kind: "console",
        generation,
        pageId,
        language: invocationLanguage,
        source,
        capability: invocationCapability,
        controller,
      };
      activeExecutionAuthorityRef.current = executionAuthority;
      consoleJavaScriptRuntimeDispatchedRef.current = false;
      let result: RunResult;
      try {
        const runJavaScriptConsoleSource = async (
          runtimeSource: string,
          // Characters of runtime prelude in front of the typed line 1 (the
          // TypeScript module shim).
          preludeColumns = 0,
        ): Promise<RunResult> => {
          const promotion = await promoteConsoleDeclarations(runtimeSource, {
            signal: controller.signal,
          });
          if (promotion.status === "cancelled") {
            return { logs: [], interrupted: true };
          }
          if (promotion.status === "unavailable") {
            return {
              logs: [],
              error: t("document.capability.unavailable"),
            };
          }
          consoleJavaScriptRuntimeDispatchedRef.current = true;
          const consoleResult = await runJavaScript(
            consoleEvaluationSource(promotion.source),
            {
              signal: controller.signal,
              session: consoleSessionId,
              // A top-level `await` came back as an async function to wait for.
              prompt: promotion.awaits ? "await" : "plain",
              sandboxOwner: javaScriptSandboxOwner,
            },
          );
          return placeConsoleErrorFrames(consoleResult, {
            lineCount: runtimeSource.split("\n").length,
            firstLineEdits: promotion.firstLineEdits,
            firstLineOffset: preludeColumns,
          });
        };
        if (invocationLanguage === "javascript") {
          result = await runJavaScriptConsoleSource(source);
        } else if (invocationLanguage === "typescript") {
          // Transpile first, then wrap: the wrapper is JavaScript, so wrapping
          // TypeScript source would hand TS syntax to a runtime eval. The
          // promotion runs on the JavaScript, since that is what the session
          // has to keep — sucrase leaves `let`/`const` exactly as authored.
          const transpiled = transpileTypeScript(source);
          result =
            transpiled.error || transpiled.code === undefined
              ? {
                  logs: [],
                  error: transpiled.error ?? "TypeScript compile error",
                }
              : await runJavaScriptConsoleSource(
                  transpiled.code,
                  transpiled.firstLineOffset ?? 0,
                );
        } else if (invocationLanguage === "sql") {
          result = await runSql(source, { namespace: pageId });
        } else if (invocationLanguage === "python") {
          result = await runPython(source, { namespace: pageId });
        } else if (invocationLanguage === "lua") {
          // As the `lua` prompt does: an expression shows its values; what is
          // not one (it does not compile as one, so nothing ran) runs as typed.
          const asExpression = await runLua(luaConsoleExpressionSource(source), {
            namespace: pageId,
            signal: controller.signal,
          });
          result =
            isLuaCompileFailure(asExpression) && !controller.signal.aborted
              ? await runLua(source, {
                  namespace: pageId,
                  signal: controller.signal,
                })
              : asExpression;
        } else if (invocationLanguage === "ruby") {
          result = rubyConsoleSessionToken
            ? await runRuby(
                rubyConsoleEvaluationSource(source, rubyConsoleSessionToken),
                {
                  namespace: pageId,
                  signal: controller.signal,
                },
              )
            : { logs: [], error: t("document.capability.unavailable") };
        } else {
          result = {
            logs: [],
            error: t("code.runUnsupported", { language: invocationLanguage }),
          };
        }
      } catch (error) {
        result = boundedCodeRuntimeFailure(
          error,
          t("document.capability.unavailable"),
        );
      } finally {
        if (consoleAbortRef.current === controller) {
          consoleAbortRef.current = null;
          consoleJavaScriptRuntimeDispatchedRef.current = false;
        }
      }
      // A submission the user stopped was already settled by the Stop handler;
      // its late result must not overwrite the interrupted marker or unlock a
      // run that has since started.
      if (runGenerationRef.current !== generation) {
        releasePageExecutionClaim(executionClaim);
        return;
      }
      runningRef.current = false;
      runningLanguageRef.current = null;
      if (activeExecutionAuthorityRef.current === executionAuthority) {
        activeExecutionAuthorityRef.current = null;
      }
      setConsoleBusy(false);
      settleConsoleEntry(id, consoleResultForDisplay(result));
      releasePageExecutionClaim(executionClaim);
    },
    [
      acquirePageExecutionClaim,
      consoleSessionId,
      javaScriptSandboxOwner,
      executionProviders,
      pageId,
      releasePageExecutionClaim,
      rubyConsoleSessionToken,
      settleConsoleEntry,
      t,
    ],
  );

  const interruptConsole = useCallback(() => {
    if (!consoleBusy) return;
    const authority = activeExecutionAuthorityRef.current;
    if (
      !authority ||
      authority.kind !== "console" ||
      !authority.capability.supports.cancel
    ) {
      return;
    }
    const pending = consoleIdRef.current;
    // Language mode stays editable while a submission runs. Dispatch Stop to
    // the runtime that actually owns the in-flight generation, not the mutable
    // language selector: changing Python -> JavaScript must not strand the
    // Python kernel and its page-wide execution lock.
    const runningLanguage = authority.language;
    // Stopping JavaScript means terminating the worker — the only thing that
    // stops code that will not yield — and the session's state goes with it.
    // Say so on the entry the user just stopped, rather than letting them
    // discover it when a variable they defined is suddenly gone.
    if (
      (runningLanguage === "javascript" ||
        runningLanguage === "typescript") &&
      consoleJavaScriptRuntimeDispatchedRef.current
    ) {
      setConsoleEntries((prev) =>
        prev.map((entry) =>
          entry.id === pending
            ? { ...entry, notice: t("code.console.sessionRestarted") }
            : entry,
        ),
      );
    }
    // JS/TS and the worker/sandbox kernels observe this and settle themselves
    // with { interrupted: true }, partial output intact.
    authority.controller.abort();
    const settleHere = (interrupted: boolean) => {
      if (interrupted) return;
      runGenerationRef.current += 1;
      runningRef.current = false;
      runningLanguageRef.current = null;
      if (activeExecutionAuthorityRef.current === authority) {
        activeExecutionAuthorityRef.current = null;
      }
      consoleAbortRef.current = null;
      consoleJavaScriptRuntimeDispatchedRef.current = false;
      setConsoleBusy(false);
      settleConsoleEntry(pending, { logs: [], interrupted: true });
      releaseActivePageExecutionClaim();
    };
    if (runningLanguage === "python") {
      settleHere(interruptPython(authority.pageId));
    } else if (runningLanguage === "sql") {
      interruptSql(authority.pageId);
      settleHere(false);
    } else if (runningLanguage === "lua") {
      settleHere(interruptLua(authority.pageId));
    } else if (runningLanguage === "ruby") {
      settleHere(interruptRuby(authority.pageId));
    }
  }, [
    consoleBusy,
    releaseActivePageExecutionClaim,
    settleConsoleEntry,
    t,
  ]);

  const clearConsole = useCallback(() => {
    if (activeExecutionAuthorityRef.current?.kind === "console") return;
    setConsoleEntries([]);
  }, []);

  const disposeCodeTestRuntime = useCallback(
    (runtime: ActiveCodeTestRuntime | null) => {
      if (!runtime) return;
      if (runtime.language === "python") {
        resetPythonRuntime(runtime.namespace);
      } else if (runtime.language === "lua") {
        resetLuaRuntime(runtime.namespace);
      } else if (runtime.language === "ruby") {
        resetRubyRuntime(runtime.namespace);
      } else if (runtime.language === "bash") {
        resetShellRuntime(runtime.namespace);
      } else {
        disposeSandboxRuntime(runtime.sandboxOwner);
      }
    },
    [],
  );

  const retireActiveCodeTestRun = useCallback(
    (updateState: boolean) => {
      const authority = activeCodeTestRunRef.current;
      if (!authority) return false;
      testRunGenerationRef.current += 1;
      activeCodeTestRunRef.current = null;
      testRunBusyRef.current = false;
      authority.controller.abort();
      disposeCodeTestRuntime(authority.runtime);
      authority.runtime = null;
      for (const claim of authority.claims) {
        releasePageExecutionClaim(claim);
      }
      if (updateState) setTestExplorerBusy(false);
      return true;
    },
    [disposeCodeTestRuntime, releasePageExecutionClaim],
  );
  useLayoutEffect(() => {
    retireActiveCodeTestRunRef.current = retireActiveCodeTestRun;
    return () => {
      if (retireActiveCodeTestRunRef.current === retireActiveCodeTestRun) {
        retireActiveCodeTestRunRef.current = () => false;
      }
    };
  }, [retireActiveCodeTestRun]);

  const stopCodeTestRun = useCallback(() => {
    if (!retireActiveCodeTestRun(true)) return;
    setTestRunError(t("code.testExplorer.stopped"));
  }, [retireActiveCodeTestRun, t]);

  useLayoutEffect(() => {
    return () => {
      retireActiveCodeTestRun(false);
    };
  }, [retireActiveCodeTestRun]);

  const testExplorerPageRef = useRef(pageId);
  useLayoutEffect(() => {
    if (testExplorerPageRef.current === pageId) return;
    testExplorerPageRef.current = pageId;
    retireActiveCodeTestRun(true);
    testRunTimelineGenerationRef.current += 1;
    persistedTestRunTimelineRef.current = [];
    setTestRunTimeline([]);
    setSelectedTestRunTimelineIndex(null);
    persistedTestRunReceiptRef.current = null;
    testRunExactSourcesRef.current = null;
    testRunReceiptAuthoringGenerationRef.current = null;
    pendingCodeAiFixRef.current = null;
    setPostAiRerunRequest(null);
    setTestRunReceipt(null);
    setTestRunError(null);
    setTestExplorerOpen(false);
    testSelectionInitializedRef.current = false;
    setSelectedCodeTestIds(new Set());
  }, [pageId, retireActiveCodeTestRun]);

  const runCodeTests = useCallback(
    async (
      scope: CodeTestRunScope,
      filePageId: string | null = null,
      rerun: CodeTestRerunRequest | null = null,
    ) => {
      if (
        testRunBusyRef.current ||
        runningRef.current ||
        debugStateRef.current.running ||
        guestMode ||
        !codeRunOfferedRef.current ||
        !workspaceNotebookId
      ) {
        return;
      }
      const authoringGeneration = captureCodeAuthoringAuthority();
      if (authoringGeneration === null) {
        setTestRunError(t("document.capability.unavailable"));
        return;
      }
      const pendingTestDebug = pendingCodeTestDebugHandoffRef.current;
      pendingCodeTestDebugHandoffRef.current = null;
      if (pendingTestDebug) {
        discardCodeTestDebugHandoffRequest(pendingTestDebug.requestId);
      }
      const ownerPageId = pageIdRef.current;
      const catalogGeneration = workspaceCatalogGenerationRef.current;
      const timelineGeneration = testRunTimelineGenerationRef.current;
      const historyRerun = rerun?.kind === "history" ? rerun : null;
      const postAiRerun = rerun?.kind === "post_ai_fix" ? rerun : null;
      const rerunEntryIsRetained = () =>
        !historyRerun ||
        (testRunTimelineGenerationRef.current === timelineGeneration &&
          persistedTestRunTimelineRef.current.includes(historyRerun.entry));
      setTestRunError(null);
      await ensureWorkspacePageDetails();
      if (
        !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
        pageIdRef.current !== ownerPageId ||
        workspaceCatalogGenerationRef.current !== catalogGeneration ||
        !rerunEntryIsRetained()
      ) {
        return;
      }
      if (
        scope === "all" &&
        (workspaceCatalogError ||
          workspaceDetailsError ||
          workspaceCatalog.truncated ||
          workspaceDetailsIncomplete ||
          workspacePageTotal > workspacePagesRef.current.length)
      ) {
        setTestRunError(t("code.testExplorer.incomplete"));
        return;
      }

      const sources = captureCodeTestSources();
      if (postAiRerun) {
        if (
          postAiRerun.sourcePageId !== ownerPageId ||
          postAiRerun.language !== languageRef.current ||
          !codeAuthoringAuthorityIsCurrent(
            postAiRerun.authoringGeneration,
          ) ||
          !["javascript", "typescript"].includes(postAiRerun.language)
        ) {
          setTestRunError(t("code.testExplorer.askAiUnavailable"));
          return;
        }
      }
      if (historyRerun) {
        const rerunPageIds = new Set(
          historyRerun.entry.receipt.sources.map((source) => source.pageId),
        );
        const rerunSources = sources.filter((source) =>
          rerunPageIds.has(source.pageId),
        );
        if (
          !(await codeTestRunTimelineEntryIsCurrent(
            historyRerun.entry,
            rerunSources,
          )) ||
          !codeTestSourceSnapshotsMatch(
            rerunSources,
            captureCodeTestSources().filter((source) =>
              rerunPageIds.has(source.pageId),
            ),
          ) ||
          !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
          pageIdRef.current !== ownerPageId ||
          workspaceCatalogGenerationRef.current !== catalogGeneration ||
          !rerunEntryIsRetained()
        ) {
          setTestRunError(t("code.testExplorer.historyUnavailable"));
          return;
        }
      }
      const discovery = discoverCodeTests(sources);
      if (scope === "all" && discovery.truncated) {
        setTestRunError(t("code.testExplorer.incomplete"));
        return;
      }
      const requestedFile =
        scope === "file"
          ? discovery.files.find((file) => file.source.pageId === filePageId)
          : null;
      if (requestedFile?.truncated) {
        setTestRunError(t("code.testExplorer.incomplete"));
        return;
      }
      const selectedIds = new Set(
        postAiRerun
          ? postAiRerun.failedTestIds
          : historyRerun
            ? historyRerun.entry.receipt.results
              .filter(
                (result) =>
                  !historyRerun.failedOnly || result.status === "failed",
              )
              .map((result) => result.testId)
            : selectedCodeTestIds,
      );
      const selectedFiles: CodeTestFile[] = [];
      for (const file of discovery.files) {
        const tests =
          rerun
            ? file.tests.filter((test) => selectedIds.has(test.id))
            : scope === "all"
            ? file.tests
            : scope === "file"
              ? file.source.pageId === filePageId
                ? file.tests
                : []
              : file.tests.filter((test) => selectedIds.has(test.id));
        if (tests.length > 0) {
          selectedFiles.push({
            source: file.source,
            tests,
            truncated: file.truncated,
          });
        }
      }
      const selectedTestCount = selectedFiles.reduce(
        (count, file) => count + file.tests.length,
        0,
      );
      if (
        selectedFiles.length === 0 ||
        (rerun && selectedTestCount !== selectedIds.size)
      ) {
        setTestRunError(t("code.testExplorer.emptySelection"));
        return;
      }

      const modulePlans = new Map<string, CodeTestModulePlan>();
      try {
        for (const file of selectedFiles) {
          modulePlans.set(
            file.source.pageId,
            await prepareCodeTestModules(file.source, sources),
          );
        }
      } catch (error) {
        setTestRunError(
          boundedCodeRuntimeFailure(error, t("document.capability.unavailable"))
            .error ?? t("document.capability.unavailable"),
        );
        return;
      }
      if (
        testRunBusyRef.current ||
        runningRef.current ||
        debugStateRef.current.running ||
        !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
        pageIdRef.current !== ownerPageId ||
        workspaceCatalogGenerationRef.current !== catalogGeneration ||
        !rerunEntryIsRetained()
      )
        return;
      const targetPages = [
        ...new Map(
          [...modulePlans.values()].flatMap((plan) =>
            plan.sources.map((source) => [source.pageId, source] as const),
          ),
        ).values(),
      ].sort((left, right) => left.pageId.localeCompare(right.pageId));
      const targetIds = new Set(targetPages.map((source) => source.pageId));
      if (targetPages.length > CODE_TEST_WORKSPACE_FILE_LIMIT) {
        setTestRunError(t("code.testExplorer.incomplete"));
        return;
      }
      if (
        !codeTestSourceSnapshotsMatch(
          targetPages,
          captureCodeTestSources().filter((source) =>
            targetIds.has(source.pageId),
          ),
        )
      ) {
        setTestRunError(t("code.testExplorer.sourceChanged"));
        return;
      }
      const runSequence = (testRunSequenceRef.current += 1);
      const runId = `test-${Date.now().toString(36)}-${runSequence.toString(36)}`;
      const claims: PageExecutionClaim[] = [];
      const hostClaim = acquirePageExecutionClaim(
        "run",
        selectedFiles[0].source.language,
      );
      if (!hostClaim) {
        setTestRunError(t("code.testExplorer.busy"));
        return;
      }
      claims.push(hostClaim);
      for (const source of targetPages) {
        if (source.pageId === ownerPageId) continue;
        const claim = tryAcquirePageExecution(source.pageId, {
          ownerId: `${executionOwnerId}:${runId}`,
          kind: "run",
          language: source.language,
        });
        if (!claim) {
          for (const acquired of claims) releasePageExecutionClaim(acquired);
          setTestRunError(t("code.testExplorer.busy"));
          return;
        }
        claims.push(claim);
      }

      const generation = testRunGenerationRef.current + 1;
      testRunGenerationRef.current = generation;
      const controller = new AbortController();
      const authority: ActiveCodeTestRunAuthority = {
        generation,
        authoringGeneration,
        runId,
        ownerPageId,
        catalogGeneration,
        controller,
        claims,
        sources: targetPages,
        runtime: null,
      };
      activeCodeTestRunRef.current = authority;
      testRunBusyRef.current = true;
      setTestExplorerBusy(true);
      const results: CodeTestResult[] = [];
      const fileOutputs: CodeTestRunFileOutput[] = [];
      let complete = true;

      const authorityIsCurrent = () =>
        activeCodeTestRunRef.current === authority &&
        testRunGenerationRef.current === generation &&
        !controller.signal.aborted &&
        codeAuthoringAuthorityIsCurrent(authority.authoringGeneration) &&
        pageIdRef.current === ownerPageId &&
        workspaceCatalogGenerationRef.current === catalogGeneration &&
        claims.every((claim) => claim.isActive());

      try {
        for (const file of selectedFiles) {
          if (!authorityIsCurrent()) return;
          const modulePlan = modulePlans.get(file.source.pageId)!;
          const modulePageIds = new Set(
            modulePlan.sources.map((source) => source.pageId),
          );
          if (
            !codeTestSourceSnapshotsMatch(
              modulePlan.sources,
              captureCodeTestSources().filter((source) =>
                modulePageIds.has(source.pageId),
              ),
            )
          ) {
            complete = false;
            setTestRunError(t("code.testExplorer.sourceChanged"));
            break;
          }
          const liveSource = captureCodeTestSources().find(
            (source) => source.pageId === file.source.pageId,
          );
          if (
            !liveSource ||
            liveSource.path !== file.source.path ||
            liveSource.language !== file.source.language ||
            liveSource.source !== file.source.source
          ) {
            complete = false;
            setTestRunError(t("code.testExplorer.sourceChanged"));
            break;
          }

          const sandboxOwner = `code-tests:${ownerPageId}:${runId}:${file.source.pageId}`;
          const namespace = `code-tests:${runId}:${file.source.pageId}`;
          let testRegistry: ReturnType<
            typeof createBuiltinExecutionProviderRegistry
          > | null = null;
          const disposeFileRuntime = () => {
            disposeCodeTestRuntime(authority.runtime);
            authority.runtime = null;
            testRegistry?.dispose();
            testRegistry = null;
          };
          if (
            file.source.language === "ruby" ||
            file.source.language === "bash"
          ) {
            // Every Ruby/Shell test run owns a fresh namespace/Worker. Publish
            // it before waiting so Stop physically retires loading as well as
            // executing generations.
            authority.runtime = {
              language: file.source.language,
              sandboxOwner,
              namespace,
            };
            const available =
              file.source.language === "ruby"
                ? await waitForRubyTestRuntime(namespace, controller.signal)
                : await waitForShellTestRuntime(namespace, controller.signal);
            if (!authorityIsCurrent()) {
              disposeFileRuntime();
              return;
            }
            if (!available) {
              complete = false;
              setTestRunError(t("document.capability.unavailable"));
              disposeFileRuntime();
              break;
            }
          }
          const activeRegistry = createBuiltinExecutionProviderRegistry({
            javaScriptSandboxOwner: sandboxOwner,
            pageNamespace: namespace,
            guest: guestMode,
          });
          testRegistry = activeRegistry;
          const capability = activeRegistry.capability(file.source.language);
          if (capability.status !== "available") {
            complete = false;
            setTestRunError(t("document.capability.unavailable"));
            disposeFileRuntime();
            break;
          }
          let nonce: string;
          try {
            const random = new Uint32Array(4);
            globalThis.crypto.getRandomValues(random);
            nonce = Array.from(random, (value) => value.toString(36)).join("-");
          } catch {
            complete = false;
            setTestRunError(t("document.capability.unavailable"));
            disposeFileRuntime();
            break;
          }
          let harness = createCodeTestHarness(file.source, file.tests, nonce);
          try {
            if (harness) harness = modulePlan.bundle(harness);
          } catch (error) {
            complete = false;
            setTestRunError(
              boundedCodeRuntimeFailure(
                error,
                t("document.capability.unavailable"),
              ).error ?? t("document.capability.unavailable"),
            );
            disposeFileRuntime();
            break;
          }
          if (
            !harness ||
            (harness.execution === "async" &&
              (file.source.language !== "javascript" &&
                file.source.language !== "typescript" &&
                file.source.language !== "python")) ||
            (harness.execution === "async" && !capability.supports.cancel)
          ) {
            complete = false;
            setTestRunError(t("document.capability.unavailable"));
            disposeFileRuntime();
            break;
          }
          authority.runtime = {
            language: file.source.language,
            sandboxOwner,
            namespace,
          };
          try {
            const request = await createLanguageExecutionRequest({
              requestId: crypto.randomUUID(),
              pageId: file.source.pageId,
              contentVersion: file.source.contentVersion,
              language: file.source.language,
              source: harness.source,
              capability,
            });
            const receipt = await dispatchLanguageExecution(activeRegistry, {
              source: harness.source,
              signal: controller.signal,
              request: {
                schemaVersion: request.schemaVersion,
                requestId: request.requestId,
                pageId: request.pageId,
                contentVersion: request.contentVersion,
                language: request.language,
                sourceSha256: request.sourceSha256,
                phase: request.phase,
                providerId: request.providerId,
                toolchainProfile: request.toolchainProfile,
                toolchainDigest: request.toolchainDigest,
                sandboxProfile: request.sandboxProfile,
                sandboxPolicyDigest: request.sandboxPolicyDigest,
                supports: request.supports,
                limits: request.limits,
              },
            });
            if (!authorityIsCurrent()) return;
            const parsed = parseCodeTestHarnessResult(harness, receipt.output);
            if (!parsed.complete) {
              complete = false;
              setTestRunError(t("code.testExplorer.receiptRejected"));
              break;
            }
            results.push(...parsed.results);
            const visibleOutput = stripCodeTestHarnessLogs(
              harness,
              receipt.output,
            );
            if (visibleOutput.logs.length > 0) {
              fileOutputs.push({
                pageId: file.source.pageId,
                output: visibleOutput,
              });
            }
          } catch (error) {
            if (!authorityIsCurrent()) return;
            complete = false;
            setTestRunError(
              isLanguageExecutionAuthorityError(error) ||
                isLanguageExecutionOutputError(error)
                ? t("document.capability.unavailable")
                : (boundedCodeRuntimeFailure(
                    error,
                    t("document.capability.unavailable"),
                  ).error ?? t("document.capability.unavailable")),
            );
            break;
          } finally {
            disposeFileRuntime();
          }
        }

        if (!complete || !authorityIsCurrent()) return;
        const liveSources = captureCodeTestSources();
        const acceptedSources: CodeTestSource[] = [];
        for (const captured of targetPages) {
          const live = liveSources.find((source) => source.pageId === captured.pageId);
          if (
            !live ||
            live.path !== captured.path ||
            live.language !== captured.language ||
            live.source !== captured.source
          ) {
            setTestRunError(t("code.testExplorer.sourceChanged"));
            return;
          }
          acceptedSources.push(captured);
        }
        const persisted = createPersistedCodeTestRunReceipt({
          runId,
          scope: postAiRerun || historyRerun?.failedOnly ? "selected" : scope,
          completedAt: new Date().toISOString(),
          sources: acceptedSources,
          results,
        });
        if (!persisted) {
          setTestRunError(t("code.testExplorer.receiptRejected"));
          return;
        }
        const timelineEntry = await createPersistedCodeTestRunTimelineEntry(
          persisted,
          acceptedSources,
          fileOutputs,
        );
        if (!timelineEntry || !authorityIsCurrent()) {
          setTestRunError(t("code.testExplorer.receiptRejected"));
          return;
        }
        const nextTestRunTimeline = appendCodeTestRunTimelineEntry(
          persistedTestRunTimelineRef.current,
          timelineEntry,
        );
        if (
          nextTestRunTimeline[0]?.receipt.runId !==
          timelineEntry.receipt.runId
        ) {
          setTestRunError(t("code.testExplorer.receiptRejected"));
          return;
        }
        testRunTimelineGenerationRef.current += 1;
        persistedTestRunTimelineRef.current = nextTestRunTimeline;
        setTestRunTimeline(nextTestRunTimeline);
        setSelectedTestRunTimelineIndex(0);
        persistedTestRunReceiptRef.current = persisted;
        testRunExactSourcesRef.current = {
          runId: persisted.runId,
          sources: new Map(
            acceptedSources.map((source) => [source.pageId, { ...source }]),
          ),
        };
        testRunReceiptAuthoringGenerationRef.current = authoringGeneration;
        setTestRunReceipt(persisted);
        setTestRunError(null);
        if (codeMayAuthorRef.current) {
          persistRef.current(languageRef.current, contentRef.current);
        }
      } finally {
        disposeCodeTestRuntime(authority.runtime);
        authority.runtime = null;
        for (const claim of claims) releasePageExecutionClaim(claim);
        if (activeCodeTestRunRef.current === authority) {
          activeCodeTestRunRef.current = null;
          testRunBusyRef.current = false;
          setTestExplorerBusy(false);
        }
      }
    },
    [
      acquirePageExecutionClaim,
      captureCodeAuthoringAuthority,
      captureCodeTestSources,
      codeAuthoringAuthorityIsCurrent,
      disposeCodeTestRuntime,
      ensureWorkspacePageDetails,
      executionOwnerId,
      guestMode,
      releasePageExecutionClaim,
      selectedCodeTestIds,
      t,
      workspaceCatalog.truncated,
      workspaceCatalogError,
      workspaceDetailsError,
      workspaceDetailsIncomplete,
      workspaceNotebookId,
      workspacePageTotal,
    ],
  );

  const toggleCodeTestSelection = useCallback((testId: string) => {
    setSelectedCodeTestIds((previous) => {
      const next = new Set(previous);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }, []);
  const runCodeTestsRef = useRef(runCodeTests);
  runCodeTestsRef.current = runCodeTests;

  const reviewCopilotTests = useCallback(async (scope: readonly CopilotTestSource[]) => {
    const generation = captureCodeAuthoringAuthority();
    const ownerPage = pageIdRef.current;
    if (generation === null || guestMode || !workspaceNotebookId || testRunBusyRef.current) return false;
    await ensureWorkspacePageDetails();
    if (!codeAuthoringAuthorityIsCurrent(generation) || ownerPage !== pageIdRef.current || testRunBusyRef.current) return false;
    const sources = captureCodeTestSources();
    const selection = await selectRelatedCopilotTests(scope, sources);
    if (
      !selection ||
      !codeAuthoringAuthorityIsCurrent(generation) ||
      ownerPage !== pageIdRef.current ||
      testRunBusyRef.current ||
      !codeTestSourceSnapshotsMatch(sources, captureCodeTestSources())
    ) return false;
    // Opening is not execution. Keep the native Run selected action and its
    // existing runtime/ACL/source/claim/cancellation/receipt checks intact.
    testSelectionInitializedRef.current = true;
    setSelectedCodeTestIds(selection.selected);
    setTestRunError(
      selection.incomplete
        ? t("code.testExplorer.incomplete")
        : selection.selected.size ? null : t("code.testExplorer.emptySelection"),
    );
    setTestExplorerOpen(true);
    return true;
  }, [captureCodeAuthoringAuthority, captureCodeTestSources, codeAuthoringAuthorityIsCurrent, ensureWorkspacePageDetails, guestMode, t, workspaceNotebookId]);

  const selectCodeTestRunTimelineEntry = useCallback((index: number) => {
    const entry = persistedTestRunTimelineRef.current[index];
    if (!entry) return;
    setSelectedTestRunTimelineIndex(index);
    setTestRunReceipt(entry.receipt);
    setTestRunError(null);
  }, []);

  const rerunCodeTestTimelineEntry = useCallback(
    (index: number, failedOnly = false) => {
      const entry = persistedTestRunTimelineRef.current[index];
      if (!entry) return;
      const filePageId =
        entry.receipt.scope === "file"
          ? (entry.receipt.results[0]?.pageId ?? null)
          : null;
      flushPendingContentRender();
      void runCodeTestsRef.current(entry.receipt.scope, filePageId, {
        kind: "history",
        entry,
        failedOnly,
      });
    },
    [flushPendingContentRender],
  );

  useEffect(
    () =>
      subscribeCodeAiFixRunBound((detail) => {
        const pending = pendingCodeAiFixRef.current;
        if (
          pending &&
          (pending.expiresAt < Date.now() ||
            !codeAuthoringAuthorityIsCurrent(
              pending.authoringGeneration,
            ) ||
            pending.sourcePageId !== pageIdRef.current ||
            pending.language !== languageRef.current ||
            pending.source !== contentRef.current)
        ) {
          pendingCodeAiFixRef.current = null;
          return;
        }
        if (
          !pending ||
          pending.requestId !== detail.requestId ||
          pending.notebookId !== detail.notebookId ||
          pending.sourcePageId !== detail.sourcePageId ||
          pending.language !== detail.language ||
          pending.sourceSha256 !== detail.sourceSha256 ||
          pending.failedTestIds.length !== detail.failedTestIds.length ||
          pending.failedTestIds.some(
            (testId, index) => testId !== detail.failedTestIds[index],
          ) ||
          (pending.runRef !== null && pending.runRef !== detail.runRef)
        ) {
          return;
        }
        pendingCodeAiFixRef.current = {
          ...pending,
          runRef: detail.runRef,
        };
      }),
    [codeAuthoringAuthorityIsCurrent],
  );

  useEffect(
    () =>
      subscribeCodeAiFixApplied((detail) => {
        const pending = pendingCodeAiFixRef.current;
        if (!pending || pending.runRef !== detail.runRef) return;
        pendingCodeAiFixRef.current = null;
        if (
          pending.expiresAt < Date.now() ||
          pending.notebookId !== workspaceNotebookId ||
          pending.sourcePageId !== pageIdRef.current ||
          pending.language !== languageRef.current ||
          pending.source !== contentRef.current ||
          !codeAuthoringAuthorityIsCurrent(pending.authoringGeneration) ||
          testRunBusyRef.current ||
          runningRef.current ||
          debugStateRef.current.running ||
          effectiveSaveState.isDirty ||
          effectiveSaveState.isSaving ||
          effectiveSaveState.hasConflict ||
          versionHydrationGuardRef.current !== null
        ) {
          setTestRunError(t("code.testExplorer.askAiUnavailable"));
          return;
        }
        const snapshot = captureVersionWriteSnapshot();
        const hydrationGuard: CodeVersionHydrationGuard = {
          snapshot,
          accepted: false,
          preserved: false,
        };
        versionHydrationGuardRef.current = hydrationGuard;
        const lease = codePageBufferLeaseRef.current;
        void (async () => {
          try {
            const hydrated = await (lease ? lease.reload() : autosave.reload());
            const hydratedContent = hydrated?.content_json as
              { language?: unknown; content?: unknown } | undefined;
            if (
              !hydrated ||
              hydrated.id !== pending.sourcePageId ||
              hydrated.notebook_id !== pending.notebookId ||
              !hydrationGuard.accepted ||
              hydrationGuard.preserved ||
              !codeAuthoringAuthorityIsCurrent(
                pending.authoringGeneration,
              ) ||
              hydratedContent?.language !== pending.language ||
              typeof hydratedContent.content !== "string"
            ) {
              setTestRunError(t("code.testExplorer.askAiUnavailable"));
              return;
            }
            setPostAiRerunRequest({
              kind: "post_ai_fix",
              sourcePageId: pending.sourcePageId,
              language: pending.language,
              failedTestIds: pending.failedTestIds,
              authoringGeneration: pending.authoringGeneration,
            });
          } catch {
            setTestRunError(t("code.testExplorer.askAiUnavailable"));
          } finally {
            if (versionHydrationGuardRef.current === hydrationGuard) {
              versionHydrationGuardRef.current = null;
            }
          }
        })();
      }),
    [
      autosave,
      codeAuthoringAuthorityIsCurrent,
      captureVersionWriteSnapshot,
      effectiveSaveState.hasConflict,
      effectiveSaveState.isDirty,
      effectiveSaveState.isSaving,
      t,
      workspaceNotebookId,
    ],
  );

  useEffect(() => {
    if (!postAiRerunRequest) return;
    setPostAiRerunRequest(null);
    if (
      postAiRerunRequest.sourcePageId !== pageId ||
      postAiRerunRequest.language !== language ||
      !codeAuthoringAuthorityIsCurrent(
        postAiRerunRequest.authoringGeneration,
      )
    ) {
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
      return;
    }
    void runCodeTests("selected", null, postAiRerunRequest);
  }, [
    codeAuthoringAuthorityIsCurrent,
    language,
    pageId,
    postAiRerunRequest,
    runCodeTests,
    t,
  ]);

  const clearCodeTestRunTimeline = useCallback(() => {
    if (
      testRunBusyRef.current ||
      !codeMayAuthorRef.current ||
      persistedTestRunTimelineRef.current.length === 0
    ) {
      return;
    }
    testRunTimelineGenerationRef.current += 1;
    persistedTestRunTimelineRef.current = [];
    persistedTestRunReceiptRef.current = null;
    testRunExactSourcesRef.current = null;
    testRunReceiptAuthoringGenerationRef.current = null;
    setTestRunTimeline([]);
    setSelectedTestRunTimelineIndex(null);
    setTestRunReceipt(null);
    setTestRunError(null);
    persistRef.current(languageRef.current, contentRef.current);
  }, []);

  const askAiAboutCodeTestHistory = useCallback(async () => {
    const entry =
      selectedTestRunTimelineIndex === null
        ? null
        : persistedTestRunTimelineRef.current[selectedTestRunTimelineIndex];
    const authoringGeneration = captureCodeAuthoringAuthority();
    const timelineGeneration = testRunTimelineGenerationRef.current;
    if (
      !entry ||
      authoringGeneration === null ||
      !windowManagerActions ||
      !workspaceNotebookId ||
      guestMode
    ) {
      return;
    }
    const pageIds = new Set(entry.receipt.sources.map((source) => source.pageId));
    const sources = captureCodeTestSources().filter((source) =>
      pageIds.has(source.pageId),
    );
    const entryIsCurrent = await codeTestRunTimelineEntryIsCurrent(
      entry,
      sources,
    );
    const sourceSnapshotStillCurrent = codeTestSourceSnapshotsMatch(
      sources,
      captureCodeTestSources().filter((source) =>
        pageIds.has(source.pageId),
      ),
    );
    if (!sourceSnapshotStillCurrent) {
      setTestRunError(null);
      return;
    }
    if (
      !entryIsCurrent ||
      !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
      testRunTimelineGenerationRef.current !== timelineGeneration ||
      !persistedTestRunTimelineRef.current.includes(entry)
    ) {
      setTestRunError(t("code.testExplorer.historyUnavailable"));
      return;
    }
    const source = sources[0];
    const sourceDigest = entry.sourceDigests.find(
      (candidate) => candidate.pageId === source?.pageId,
    );
    if (
      entry.receipt.sources.length !== 1 ||
      sources.length !== 1 ||
      !source ||
      source.pageId !== pageIdRef.current ||
      (source.language !== "javascript" && source.language !== "typescript") ||
      !sourceDigest ||
      !/^[0-9a-f]{64}$/.test(sourceDigest.sourceSha256)
    ) {
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
      return;
    }
    const failedResults = entry.receipt.results
      .filter((result) => result.status === "failed")
      .slice(0, 20);
    const failedTestIds = failedResults.map((result) => result.testId);
    if (
      failedTestIds.length < 1 ||
      failedTestIds.length !== new Set(failedTestIds).size ||
      failedResults.some(
        (result) =>
          result.pageId !== source.pageId ||
          result.language !== source.language,
      )
    ) {
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
      return;
    }
    const failed = failedResults.map((result) => ({
      path: result.path,
      test: result.name,
      line: result.line,
      message: result.message ?? "",
    }));
    const targetPageId = pageIdRef.current;
    const lease = codePageBufferLeaseRef.current;
    const saved = await (lease ? lease.saveNow() : autosave.saveNow());
    if (
      !saved ||
      saved.id !== targetPageId ||
      !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
      testRunTimelineGenerationRef.current !== timelineGeneration ||
      !persistedTestRunTimelineRef.current.includes(entry) ||
      !codeTestSourceSnapshotsMatch(
        sources,
        captureCodeTestSources().filter(
          (candidate) => candidate.pageId === targetPageId,
        ),
      )
    ) {
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
      return;
    }
    const handoff = requestCodeTestFixChatPrefill({
      notebookId: workspaceNotebookId,
      pageId: targetPageId,
      executionMode: "review_changes",
      language: source.language,
      sourceSha256: sourceDigest.sourceSha256,
      failedTestIds,
      text: t("code.testExplorer.askAiPrompt", {
        failures: JSON.stringify(failed),
      }),
    });
    if (!handoff) {
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
      return;
    }
    pendingCodeAiFixRef.current = {
      kind: "post_ai_fix",
      requestId: handoff.requestId,
      notebookId: workspaceNotebookId,
      sourcePageId: targetPageId,
      language: source.language,
      sourceSha256: sourceDigest.sourceSha256,
      source: source.source,
      failedTestIds,
      authoringGeneration,
      expiresAt: Date.now() + 30 * 60_000,
      runRef: null,
    };
    windowManagerActions.openWindow({
      type: "ai_panel",
      title: `AI · ${t("code.testExplorer.title")}`,
      meta: {
        pageId: targetPageId,
        notebookId: workspaceNotebookId,
        pageType: "code",
      },
    });
    const acknowledgement = await handoff.acknowledgement;
    if (acknowledgement !== "accepted") {
      if (pendingCodeAiFixRef.current?.requestId === handoff.requestId) {
        pendingCodeAiFixRef.current = null;
      }
      setTestRunError(t("code.testExplorer.askAiUnavailable"));
    }
  }, [
    autosave,
    captureCodeAuthoringAuthority,
    captureCodeTestSources,
    codeAuthoringAuthorityIsCurrent,
    guestMode,
    selectedTestRunTimelineIndex,
    t,
    windowManagerActions,
    workspaceNotebookId,
  ]);

  const navigateCodeTestResult = useCallback(
    async (result: CodeTestResult) => {
      const entry =
        selectedTestRunTimelineIndex === null
          ? null
          : persistedTestRunTimelineRef.current[selectedTestRunTimelineIndex];
      const receipt = entry?.receipt ?? null;
      const authoringGeneration = captureCodeAuthoringAuthority();
      const timelineGeneration = testRunTimelineGenerationRef.current;
      if (
        !receipt ||
        result.status !== "failed" ||
        authoringGeneration === null
      ) {
        return;
      }
      const receiptSources = new Set(receipt.sources.map((source) => source.pageId));
      const liveSources = captureCodeTestSources().filter((source) =>
        receiptSources.has(source.pageId),
      );
      if (
        !entry ||
        !(await codeTestRunTimelineEntryIsCurrent(entry, liveSources)) ||
        !codeTestSourceSnapshotsMatch(
          liveSources,
          captureCodeTestSources().filter((source) =>
            receiptSources.has(source.pageId),
          ),
        ) ||
        !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
        testRunTimelineGenerationRef.current !== timelineGeneration ||
        persistedTestRunTimelineRef.current[selectedTestRunTimelineIndex!] !==
          entry ||
        !receipt.results.some(
          (candidate) =>
            candidate.testId === result.testId &&
            candidate.pageId === result.pageId &&
            candidate.line === result.line &&
            candidate.status === "failed",
        )
      ) {
        return;
      }
      const file = workspaceFilesByPageId.get(result.pageId);
      if (!file) return;
      activateWorkspaceFile(file, {
        line: result.line,
        column: 1,
        contentVersion: file.contentVersion,
      });
    },
    [
      activateWorkspaceFile,
      captureCodeAuthoringAuthority,
      captureCodeTestSources,
      codeAuthoringAuthorityIsCurrent,
      selectedTestRunTimelineIndex,
      workspaceFilesByPageId,
    ],
  );

  // The page is executing something, whichever surface started it. The primary
  // Run control follows this, so it never offers Run while the kernel is busy.
  // Keep the exact local registry claim authoritative through settlement. A
  // fast result can render before its async owner releases that claim; showing
  // Run during that small window makes the click look accepted even though the
  // registry correctly refuses the second generation.
  const localPageExecutionBusy =
    pageExecution?.ownerId === executionOwnerId && pageExecution.kind !== "debug";
  const pageBusy =
    running || consoleBusy || testExplorerBusy || localPageExecutionBusy;
  const remotePageBusy = remotePageExecution !== null;
  const outputClearBlocked = pageExecution !== null;
  const activeExecutionCapability = activeExecutionAuthorityRef.current?.capability;
  const activeExecutionCanCancel =
    testExplorerBusy ||
    (pageBusy && activeExecutionCapability?.supports.cancel === true);
  const runCommandDisabled =
    pageBusy ||
    remotePageBusy ||
    debugState.running ||
    !runOrPreviewAvailable ||
    stdinOverLimit;
  const runSelectionCommandDisabled =
    runCommandDisabled || !partialExecutionAvailable;

  const toggleConsole = useCallback(() => {
    setConsoleOpen((open) => !open);
  }, []);
  const closeConsole = useCallback(() => {
    setConsoleOpen(false);
    focusCodeEditor();
  }, [focusCodeEditor]);

  const interruptRun = useCallback(() => {
    if (testRunBusyRef.current) {
      stopCodeTestRun();
      return;
    }
    if (!runningRef.current) return;
    if (consoleBusy) {
      interruptConsole();
      return;
    }
    const authority = activeExecutionAuthorityRef.current;
    if (
      !authority ||
      authority.kind !== "run" ||
      !authority.capability.supports.cancel
    ) {
      return;
    }
    const runningLanguage = authority.language;
    // A program with a window -- a cloud window, or a pygame game in the page
    // -- stops as its own Stop button stops it: it ends by itself and the run
    // settles with its output, as finished, never an "interrupted" error with
    // an AI fix to offer. A cloud session is closed and charged to that moment.
    if (
      runningLanguage === "python" &&
      (stopCloudGui(authority.pageId) || stopPlayingPythonGame(authority.pageId))
    ) {
      return;
    }
    // Stop means stop: no compile waiting to follow this one starts.
    if (compilesLatexProject(runningLanguage)) {
      latexCompileSchedulerRef.current?.cancel();
    }

    // Retire the exact active generation synchronously. Even a provider that
    // ignores AbortSignal can only finish into its detached closure; it cannot
    // turn a late success into an accepted/persisted receipt.
    runGenerationRef.current += 1;
    runningRef.current = false;
    runningLanguageRef.current = null;
    if (activeExecutionAuthorityRef.current === authority) {
      activeExecutionAuthorityRef.current = null;
    }
    authority.controller.abort();
    if (abortRef.current === authority.controller) abortRef.current = null;
    coalescerRef.current?.dispose();
    coalescerRef.current = null;

    if (runningLanguage === "python") {
      interruptPython(authority.pageId);
    } else if (runningLanguage === "sql") {
      // sql.js executes synchronously once entered, but a Stop during lazy-load
      // still invalidates the pending generation and drops its namespace.
      interruptSql(authority.pageId);
    } else if (runningLanguage === "lua") {
      interruptLua(authority.pageId);
    } else if (runningLanguage === "csharp") {
      interruptCSharp(authority.pageId);
    } else if (runningLanguage === "ruby") {
      interruptRuby(authority.pageId);
    } else if (runningLanguage === "bash") {
      interruptShell(authority.pageId);
    }
    const interruptedResult: RunResult = {
      logs: [],
      error: t("codeOutput.interrupted"),
      interrupted: true,
    };
    // Synthetic host feedback is useful now, but it is not a provider receipt.
    // The run-start path already persisted output=null, so leave it that way.
    persistedOutputRef.current = null;
    persistedOutputAuthorityRef.current = null;
    persistedRunNavigationRef.current = null;
    setOutput(interruptedResult);
    setSelectedRunTimelineIndex(null);
    runAuthoringGenerationRef.current = null;
    setRunning(false);
    releaseActivePageExecutionClaim();
  }, [
    consoleBusy,
    interruptConsole,
    releaseActivePageExecutionClaim,
    stopCodeTestRun,
    t,
  ]);

  const toggleRun = useCallback(() => {
    // The console holds the same lock while a prompt submission is executing.
    // Stop must then settle THAT submission — not stamp the file's output panel
    // with an interruption it never started.
    if (testRunBusyRef.current) {
      stopCodeTestRun();
      return;
    }
    if (consoleBusy) {
      interruptConsole();
      return;
    }
    if (runningRef.current) {
      interruptRun();
      return;
    }
    void handleRun();
  }, [consoleBusy, handleRun, interruptConsole, interruptRun, stopCodeTestRun]);

  // The editor view the member is working in (the focused split pane).
  const activeCodeMirrorView = useCallback((): EditorView | null => {
    const editors = Array.from(
      codeWindowRef.current?.querySelectorAll<HTMLElement>(
        '[data-testid="code-editor"] .cm-editor',
      ) ?? [],
    );
    const editor =
      editors.find((candidate) => candidate.contains(document.activeElement)) ??
      editors[0];
    return editor ? EditorView.findFromDOM(editor) : null;
  }, []);

  // The compiler is the main file's "% !TEX program" line: choosing one is an
  // edit of the file (undone, saved and shared like typing), and a line typed
  // by hand shows in the control (lib/code-runner/latex-compiler).
  const latexCompilerState = useMemo(
    () =>
      language === "latex"
        ? {
            choice: latexCompilerChoice(content),
            program: findLatexMagicComment(content)?.program ?? "",
          }
        : null,
    [content, language],
  );
  const chooseLatexCompiler = useCallback(
    (choice: LatexCompilerChoice) => {
      const view = activeCodeMirrorView();
      if (!view || !codeMayAuthorRef.current) return;
      const change = latexCompilerChange(view.state.doc.toString(), choice);
      if (!change) return;
      try {
        view.dispatch({ changes: change, userEvent: "input.latexCompiler" });
        view.focus();
      } catch {
        /* A detached view: the file is unchanged. */
      }
    },
    [activeCodeMirrorView],
  );

  // Overleaf's "Recompile from scratch": the files kept from the last compile
  // are forgotten, so latexmk runs every pass again.
  const recompileLatexFromScratch = useCallback(() => {
    if (runningRef.current) return;
    // The server keeps the page's files: this compile asks it not to use
    // (and to forget) them.
    latexFreshBuildRef.current = true;
    void handleRun();
  }, [handleRun]);

  // --- Compiling LaTeX as Overleaf does --------------------------------------
  // Ctrl/Cmd+Enter and Ctrl/Cmd+S compile; with Auto compile on, an edit to
  // the main file or an open file of its project compiles once typing
  // pauses (lib/code-runner/latex-auto-compile).
  const latexAutoCompile = useSyncExternalStore(
    subscribeLatexAutoCompile,
    latexAutoCompileEnabled,
    () => false,
  );
  // Fast [draft] mode, this page's own (lib/code-runner/latex-draft-mode).
  const latexDraftMode = useSyncExternalStore(
    subscribeLatexDraftMode,
    () => latexDraftModeEnabled(pageId),
    () => false,
  );
  const changeLatexDraftMode = useCallback(
    (on: boolean) => setLatexDraftMode(pageId, on),
    [pageId],
  );
  const latexFigureCache = useSyncExternalStore(
    subscribeLatexDraftMode,
    () => latexFigureCacheEnabled(pageId),
    () => false,
  );
  const changeLatexFigureCache = useCallback(
    (on: boolean) => setLatexFigureCache(pageId, on),
    [pageId],
  );
  // A compile that met its time limit: compile again with images as boxes.
  const compileLatexInDraftMode = useCallback(() => {
    if (runningRef.current) return;
    setLatexDraftMode(pageId, true);
    void handleRun();
  }, [handleRun, pageId]);
  const latexCompilingSince =
    running && language === "latex" ? latexCompileStartedAt : null;
  // What the scheduler reads when its timer fires, as of the last render.
  const latexCompileContextRef = useRef({
    blocked: true,
    settling: false,
    unsaved: false,
    notebookId: "",
  });
  const handleRunRef = useRef(handleRun);
  const latexProjectDetailsPrefetchedRef = useRef(false);
  useLayoutEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);
  useLayoutEffect(() => {
    latexCompileContextRef.current = {
      // Nothing may compile: not LaTeX, not this member's to run, LaTeX
      // unavailable, or the page busy with something else.
      blocked:
        language !== "latex" ||
        ((guestMode || !codeMayAuthor) && draftRemoteExecution === null) ||
        !pageHydrated ||
        codeHydrationBlocked ||
        executionCapability.status !== "available" ||
        debugState.running ||
        remotePageBusy ||
        consoleBusy ||
        testExplorerBusy ||
        stdinOverLimit ||
        effectiveSaveState.hasConflict,
      // For a moment: a save in flight, the page's version settling.
      settling: !runnable,
      // An automatic compile waits for the typing to be saved first, so
      // it is sent the moment it starts and a keystroke cannot overtake it.
      unsaved: effectiveSaveState.isDirty || effectiveSaveState.isSaving,
      notebookId: workspaceNotebookId,
    };
  });
  useEffect(() => {
    latexProjectDetailsPrefetchedRef.current = false;
    const scheduler = createLatexCompileScheduler({
      autoCompile: () =>
        languageRef.current === "latex" &&
        latexAutoCompileEnabled() &&
        isLatexRootDocument(contentRef.current),
      gate: (kind): LatexCompileGate => {
        if (runningRef.current) {
          return runningLanguageRef.current === "latex" &&
            activeExecutionAuthorityRef.current?.kind === "run"
            ? "compiling"
            : "blocked";
        }
        const context = latexCompileContextRef.current;
        if (context.blocked) return "blocked";
        return context.settling || (kind === "auto" && context.unsaved)
          ? "wait"
          : "ready";
      },
      input: () => {
        // The main file under a key of its own, so a rename moves nothing.
        const input = new Map<string, string>([[LATEX_MAIN_INPUT, contentRef.current]]);
        const { notebookId } = latexCompileContextRef.current;
        if (!notebookId) return input;
        const mainPath = workspacePathRef.current;
        for (const open of getOpenCodeWindowSnapshots(undefined, undefined, notebookId)) {
          if (
            open.pageId !== pageIdRef.current &&
            latexWorkspaceProjectPath(mainPath, open.label) !== null
          ) {
            input.set(open.label, open.text);
          }
        }
        return input;
      },
      compile: (kind) => {
        void handleRunRef.current(
          undefined,
          kind === "auto" ? { automatic: true } : undefined,
        );
      },
    });
    latexCompileSchedulerRef.current = scheduler;
    return () => {
      scheduler.cancel();
      if (latexCompileSchedulerRef.current === scheduler) {
        latexCompileSchedulerRef.current = null;
      }
    };
  }, [pageId]);
  const noteLatexEdit = useCallback(() => {
    const scheduler = latexCompileSchedulerRef.current;
    if (!scheduler || !latexAutoCompileEnabled()) return;
    scheduler.noteEdit();
    // The first compile loads the project's pages: do it during the pause.
    if (!latexProjectDetailsPrefetchedRef.current) {
      latexProjectDetailsPrefetchedRef.current = true;
      void ensureWorkspacePageDetails().catch(() => undefined);
    }
  }, [ensureWorkspacePageDetails]);
  // An edit in another open file of this main file's project. A document of
  // its own in the same folder compiles itself instead.
  useEffect(() => {
    if (language !== "latex" || !latexAutoCompile || !workspaceNotebookId) return;
    return subscribeCodeWindowEdits((edit) => {
      if (edit.pageId === pageIdRef.current) return;
      if (edit.notebookId !== workspaceNotebookId) return;
      if (latexWorkspaceProjectPath(workspacePathRef.current, edit.path) === null) return;
      const edited = getOpenCodeBuffers().find((entry) => entry.pageId === edit.pageId);
      try {
        if (edited && isLatexRootDocument(edited.getText())) return;
      } catch {
        return;
      }
      noteLatexEdit();
    });
  }, [language, latexAutoCompile, noteLatexEdit, workspaceNotebookId]);
  // Ctrl/Cmd+Enter on a LaTeX page: compile, or once the running compile
  // ends when the text changed since it started. It never stops a compile
  // (Stop and Shift+F5 do), as Overleaf ignores it while compiling.
  const requestLatexCompile = useCallback(() => {
    latexCompileSchedulerRef.current?.requestCompile();
  }, []);
  // A LaTeX draft's review is its typeset PDF beside its source, as the page
  // shows it after a compile: it compiles once on its own, as soon as the
  // execution service answers. A service that cannot compile says so where
  // the PDF would be, instead of leaving the space empty; it compiles if the
  // service comes back while the review is open.
  const draftCompileRequestedRef = useRef(false);
  const draftLatexReview = draftReviewing && language === "latex";
  const draftCompileUnavailable =
    draftLatexReview && executionCapability.status === "unavailable";
  useEffect(() => {
    if (!draftLatexReview || draftCompileRequestedRef.current) return;
    if (runnable) {
      const requested = latexCompileSchedulerRef.current?.requestCompile();
      if (requested && requested !== "ignored") draftCompileRequestedRef.current = true;
      return;
    }
    if (!draftCompileUnavailable) return;
    setOutputPanelVisible(true);
    setOutput((current) =>
      current ?? {
        logs: [],
        error: runtimeUnavailableHint,
        notStarted: true,
      },
    );
  }, [draftCompileUnavailable, draftLatexReview, runnable, runtimeUnavailableHint]);
  // Ctrl/Cmd+S saves as everywhere, and a LaTeX page then compiles (Overleaf's
  // Ctrl/Cmd+S). The compile waits for that save before it is sent.
  const saveFromEditor = useCallback(
    (trigger?: "shortcut") => {
      flushSave();
      if (trigger === "shortcut" && languageRef.current === "latex") {
        requestLatexCompile();
      }
    },
    [flushSave, requestLatexCompile],
  );
  // The compiled PDF's window counts the seconds while this page compiles.
  useEffect(() => {
    if (!compiledDocumentWindowKey) return;
    markCompiledDocumentCompiling(compiledDocumentWindowKey, latexCompilingSince);
    return () => markCompiledDocumentCompiling(compiledDocumentWindowKey, null);
  }, [compiledDocumentWindowKey, latexCompilingSince]);

  // A project file of the last compile, opened at a line as Explorer opens it.
  const openLatexSource = useCallback(
    (mainPath: string, projectPath: string, line: number) => {
      const workspacePath = latexProjectWorkspacePath(mainPath, projectPath);
      const file = workspaceCatalog.files.find(
        (candidate) => candidate.path === workspacePath,
      );
      if (!file) {
        toast({
          description: t("codeOutput.latex.notInWorkspace", {
            file: workspacePath,
          }),
        });
        return;
      }
      activateWorkspaceFile(file, { line: Math.max(1, line), column: 1 });
    },
    [activateWorkspaceFile, t, workspaceCatalog.files],
  );
  const openLatexLogEntry = useCallback(
    (entry: LatexLogEntry) => {
      if (!latexCompile || !entry.inProject || !entry.file) return;
      openLatexSource(latexCompile.mainPath, entry.file, entry.line ?? 1);
    },
    [latexCompile, openLatexSource],
  );

  const showLatexReport = useCallback(() => {
    updateOutputPanelVisibility(true);
    requestAnimationFrame(() => {
      const report = latexReportRef.current;
      const scroller = outputScrollRef.current;
      if (!report || !scroller) return;
      scroller.scrollTop +=
        report.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
      report.focus({ preventScroll: true });
    });
  }, [updateOutputPanelVisibility]);

  // SyncTeX forward search: where the line at the cursor is typeset. On a
  // canvas the PDF window shows it (a chapter's window finds the document its
  // main file compiled); with no canvas, the output's own PDF does.
  const goToPdfLocation = useCallback(async () => {
    const view = activeCodeMirrorView();
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    const workspacePath = workspacePathRef.current;
    if (!compiledDocumentWindowKey) {
      const synctex = outputFile(latexCompile?.files.outputFiles, OUTPUT_SYNCTEX_NAME);
      const projectPath = latexCompile
        ? latexWorkspaceProjectPath(latexCompile.mainPath, workspacePath)
        : null;
      const map =
        synctex && projectPath && compiledDocument
          ? await loadSynctexMap(synctex.bytes)
          : null;
      const place = map && projectPath ? synctexForward(map, projectPath, line) : null;
      if (!place) {
        toast({
          description: t(
            map ? "codeOutput.latex.syncNotTypeset" : "codeOutput.latex.syncNoDocument",
          ),
        });
        return;
      }
      updateOutputPanelVisibility(true);
      inlinePdfHighlightIdRef.current += 1;
      setInlinePdfHighlight({
        page: place.page,
        marks: { id: inlinePdfHighlightIdRef.current, rects: place.rects },
      });
      return;
    }
    const found = await findTypesetPlace({
      workspacePath,
      line,
      notebookId: workspaceNotebookId || null,
      preferKey: compiledDocumentWindowKey,
    });
    if (found.status !== "found") {
      toast({
        description: t(
          found.status === "no-document"
            ? "codeOutput.latex.syncNoDocument"
            : "codeOutput.latex.syncNotTypeset",
        ),
      });
      return;
    }
    showCompiledDocumentWindow(true, found.key);
    revealInCompiledDocument(found.key, found.page, found.rects);
  }, [
    activeCodeMirrorView,
    compiledDocument,
    compiledDocumentWindowKey,
    latexCompile,
    showCompiledDocumentWindow,
    t,
    updateOutputPanelVisibility,
    workspaceNotebookId,
  ]);

  // SyncTeX inverse search from the output's own PDF (a double click).
  const goToLatexSourceFromPdf = useCallback(
    async (page: number, point: PdfPagePoint) => {
      const compile = latexCompile;
      const synctex = outputFile(compile?.files.outputFiles, OUTPUT_SYNCTEX_NAME);
      if (!compile || !synctex) return;
      const map = await loadSynctexMap(synctex.bytes);
      const found = map ? synctexInverse(map, page, point.x, point.y) : null;
      if (!found) {
        toast({ description: t("codeOutput.latex.syncNoSource") });
        return;
      }
      openLatexSource(compile.mainPath, found.file, found.line);
    },
    [latexCompile, openLatexSource, t],
  );

  const runSelection = useCallback(
    (selection: ExecutionSelection) => {
      void handleRun(selection);
    },
    [handleRun],
  );

  const selectRunTimelineEntry = useCallback(
    (index: number) => {
      const entry = persistedRunTimelineRef.current[index];
      if (!entry) return;
      const liveSource = contentRef.current;
      const navigation =
        entry.language === languageRef.current
          ? restoreCodePageRunTimelineNavigation(entry, liveSource)
          : null;
      setSelectedRunTimelineIndex(index);
      setOutput(codePageRunTimelineEntryToRunResult(entry));
      setLastRunScope(navigation?.selection ?? null);
      setTracebackNavigationSource(navigation ? liveSource : null);
      setOutputStreamFilter("all");
      setOutputLogStart(null);
      setOutputSearchOpen(false);
      setOutputSearchQuery("");
      setOutputSearchRunEpoch((epoch) => epoch + 1);
      setOutputSearchActiveIndex(0);
      setOutputSearchRevealLogIndex(null);
      updateOutputPanelVisibility(true);
    },
    [updateOutputPanelVisibility],
  );

  const rerunTimelineEntry = useCallback(
    async (index: number) => {
      if (getPageExecutionState(pageId) !== null) return;
      const entry = persistedRunTimelineRef.current[index];
      const liveSource = contentRef.current;
      const currentLanguage = languageRef.current;
      const invocationStdin = stdinTextRef.current;
      const invocationStdinBytes = new TextEncoder().encode(
        invocationStdin,
      ).byteLength;
      if (!entry || entry.language !== currentLanguage) return;
      const navigation = restoreCodePageRunTimelineNavigation(
        entry,
        liveSource,
      );
      if (!navigation) return;
      const capability = executionProviders.capability(currentLanguage);
      if (
        capability.status !== "available" ||
        capability.providerId !== entry.providerId ||
        (navigation.selection !== null &&
          !capability.supports.partialExecution)
      ) {
        return;
      }
      const remoteAuthoringGeneration =
        capability.mode === "remote" ? captureCodeAuthoringAuthority() : null;
      if (capability.mode === "remote" && remoteAuthoringGeneration === null) {
        return;
      }
      const requestGeneration = runProfileRequestGenerationRef.current + 1;
      runProfileRequestGenerationRef.current = requestGeneration;
      let sourceSha256: string;
      let invocationStdinSha256: string;
      try {
        [sourceSha256, invocationStdinSha256] = await Promise.all([
          sha256ExecutionSource(liveSource),
          sha256ExecutionSource(invocationStdin),
        ]);
      } catch {
        return;
      }
      const liveCapability = executionProviders.capability(currentLanguage);
      if (
        runProfileRequestGenerationRef.current !== requestGeneration ||
        (capability.mode === "remote" &&
          (remoteAuthoringGeneration === null ||
            !codeAuthoringAuthorityIsCurrent(remoteAuthoringGeneration))) ||
        persistedRunTimelineRef.current[index] !== entry ||
        contentRef.current !== liveSource ||
        languageRef.current !== currentLanguage ||
        stdinTextRef.current !== invocationStdin ||
        sourceSha256 !== entry.sourceSha256 ||
        !codePageRunInputIdentityIsCurrent(
          entry.input,
          invocationStdinSha256,
          invocationStdinBytes,
        ) ||
        liveCapability.status !== "available" ||
        liveCapability.providerId !== entry.providerId ||
        liveCapability.mode !== capability.mode ||
        (navigation.selection !== null &&
          !liveCapability.supports.partialExecution) ||
        getPageExecutionState(pageId) !== null
      ) {
        return;
      }
      if (!navigation.selection) {
        await handleRun();
        return;
      }
      // The compact receipt reconstructs a contiguous selection exactly. A
      // multi-range run remains inspectable, but rerun stays disabled because
      // guessing the original disjoint column ranges would execute new code.
      if (navigation.selection.rangeCount !== 1) return;
      const source = liveSource.slice(
        navigation.selection.from,
        navigation.selection.to,
      );
      if (source.trim().length === 0) return;
      await handleRun({ ...navigation.selection, source });
    },
    [
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      executionProviders,
      handleRun,
      pageId,
    ],
  );

  const saveSelectedRunProfile = useCallback(async () => {
    const index = selectedRunTimelineIndex;
    if (
      index === null ||
      !codeMayAuthorRef.current ||
      getPageExecutionState(pageId) !== null
    ) {
      return;
    }
    const entry = persistedRunTimelineRef.current[index];
    const source = contentRef.current;
    const currentLanguage = languageRef.current;
    const invocationStdin = stdinTextRef.current;
    const invocationStdinBytes = new TextEncoder().encode(
      invocationStdin,
    ).byteLength;
    const capability = executionProviders.capability(currentLanguage);
    const navigation = entry
      ? restoreCodePageRunTimelineNavigation(entry, source)
      : null;
    if (
      !entry ||
      !navigation ||
      (navigation.selection?.rangeCount ?? 1) !== 1 ||
      entry.language !== currentLanguage ||
      capability.status !== "available" ||
      capability.providerId !== entry.providerId ||
      (navigation.selection !== null &&
        !capability.supports.partialExecution)
    ) {
      return;
    }
    const authoringGeneration = captureCodeAuthoringAuthority();
    if (authoringGeneration === null) return;
    const requestGeneration = runProfileRequestGenerationRef.current + 1;
    runProfileRequestGenerationRef.current = requestGeneration;
    let sourceSha256: string;
    let invocationStdinSha256: string;
    try {
      [sourceSha256, invocationStdinSha256] = await Promise.all([
        sha256ExecutionSource(source),
        sha256ExecutionSource(invocationStdin),
      ]);
    } catch {
      return;
    }
    const liveCapability = executionProviders.capability(currentLanguage);
    if (
      runProfileRequestGenerationRef.current !== requestGeneration ||
      !codeAuthoringAuthorityIsCurrent(authoringGeneration) ||
      persistedRunTimelineRef.current[index] !== entry ||
      contentRef.current !== source ||
      languageRef.current !== currentLanguage ||
      stdinTextRef.current !== invocationStdin ||
      sourceSha256 !== entry.sourceSha256 ||
      !codePageRunInputIdentityIsCurrent(
        entry.input,
        invocationStdinSha256,
        invocationStdinBytes,
      ) ||
      liveCapability.status !== "available" ||
      liveCapability.providerId !== entry.providerId ||
      (navigation.selection !== null &&
        !liveCapability.supports.partialExecution) ||
      getPageExecutionState(pageId) !== null
    ) {
      return;
    }
    const profile = createCodePageRunProfile({
      savedAt: Date.now(),
      entry,
      sourceSha256,
    });
    if (!profile) return;
    const nextProfiles = saveCodePageRunProfile(
      persistedRunProfilesRef.current,
      profile,
    );
    persistedRunProfilesRef.current = nextProfiles;
    setRunProfiles(nextProfiles);
    persistRef.current(
      currentLanguage,
      source,
      persistedOutputRef.current,
    );
  }, [
    captureCodeAuthoringAuthority,
    codeAuthoringAuthorityIsCurrent,
    executionProviders,
    pageId,
    selectedRunTimelineIndex,
  ]);

  const runSavedProfile = useCallback(
    async (index: number) => {
      if (getPageExecutionState(pageId) !== null) return;
      const profile = persistedRunProfilesRef.current[index];
      if (!profile) return;
      const source = contentRef.current;
      const currentLanguage = languageRef.current;
      const invocationStdin = stdinTextRef.current;
      const invocationStdinBytes = new TextEncoder().encode(
        invocationStdin,
      ).byteLength;
      const navigation = restoreCodePageRunNavigation(
        { lastRunNavigation: profile.navigation },
        source,
      );
      const capability = executionProviders.capability(currentLanguage);
      if (
        !navigation ||
        profile.language !== currentLanguage ||
        capability.status !== "available" ||
        capability.providerId !== profile.providerId ||
        (navigation.selection !== null &&
          !capability.supports.partialExecution)
      ) {
        return;
      }
      const remoteAuthoringGeneration =
        capability.mode === "remote" ? captureCodeAuthoringAuthority() : null;
      if (capability.mode === "remote" && remoteAuthoringGeneration === null) {
        return;
      }
      const requestGeneration = runProfileRequestGenerationRef.current + 1;
      runProfileRequestGenerationRef.current = requestGeneration;
      let sourceSha256: string;
      let invocationStdinSha256: string;
      try {
        [sourceSha256, invocationStdinSha256] = await Promise.all([
          sha256ExecutionSource(source),
          sha256ExecutionSource(invocationStdin),
        ]);
      } catch {
        return;
      }
      const liveCapability = executionProviders.capability(currentLanguage);
      if (
        runProfileRequestGenerationRef.current !== requestGeneration ||
        (capability.mode === "remote" &&
          (remoteAuthoringGeneration === null ||
            !codeAuthoringAuthorityIsCurrent(remoteAuthoringGeneration))) ||
        persistedRunProfilesRef.current[index] !== profile ||
        contentRef.current !== source ||
        languageRef.current !== currentLanguage ||
        stdinTextRef.current !== invocationStdin ||
        sourceSha256 !== profile.sourceSha256 ||
        !codePageRunInputIdentityIsCurrent(
          profile.input,
          invocationStdinSha256,
          invocationStdinBytes,
        ) ||
        liveCapability.status !== "available" ||
        liveCapability.providerId !== profile.providerId ||
        liveCapability.mode !== capability.mode ||
        (navigation.selection !== null &&
          !liveCapability.supports.partialExecution) ||
        getPageExecutionState(pageId) !== null
      ) {
        return;
      }
      if (!navigation.selection) {
        await handleRun();
        return;
      }
      const selectedSource = source.slice(
        navigation.selection.from,
        navigation.selection.to,
      );
      if (selectedSource.trim().length === 0) return;
      await handleRun({ ...navigation.selection, source: selectedSource });
    },
    [
      captureCodeAuthoringAuthority,
      codeAuthoringAuthorityIsCurrent,
      executionProviders,
      handleRun,
      pageId,
    ],
  );

  const removeSavedRunProfile = useCallback(
    (index: number) => {
      if (
        !codeMayAuthorRef.current ||
        getPageExecutionState(pageId) !== null
      ) {
        return;
      }
      runProfileRequestGenerationRef.current += 1;
      const nextProfiles = removeCodePageRunProfile(
        persistedRunProfilesRef.current,
        index,
      );
      if (nextProfiles === persistedRunProfilesRef.current) return;
      persistedRunProfilesRef.current = nextProfiles;
      setRunProfiles(nextProfiles);
      persistRef.current(
        languageRef.current,
        contentRef.current,
        persistedOutputRef.current,
      );
    },
    [pageId],
  );

  const clearRunTimeline = useCallback(() => {
    if (
      !codeMayAuthorRef.current ||
      getPageExecutionState(pageIdRef.current)
    ) {
      return;
    }
    runProfileRequestGenerationRef.current += 1;
    persistedRunTimelineRef.current = [];
    setRunTimeline([]);
    setSelectedRunTimelineIndex(null);
    persistRef.current(
      languageRef.current,
      contentRef.current,
      persistedOutputRef.current,
    );
  }, []);

  const clearOutput = useCallback(() => {
    // Render-time disabled state is an affordance, not an authority boundary:
    // a sibling view can acquire execution in the same event turn.
    if (getPageExecutionState(pageId)) return;
    if (!outputRef.current) return;
    outputRef.current = null;
    if (codeMayAuthorRef.current) {
      persistedOutputRef.current = null;
      persistedOutputAuthorityRef.current = null;
      persistedRunNavigationRef.current = null;
      persistedRunOutputClearedRef.current = codePageRunOutputClearedMarker(
        persistedRunTimelineRef.current[0],
      );
      persistRef.current(languageRef.current, contentRef.current, null);
    }
    setOutput(null);
    setOutputCopied(false);
    setOutputSearchOpen(false);
    setOutputSearchQuery("");
    setOutputSearchRunEpoch((epoch) => epoch + 1);
    setOutputSearchActiveIndex(0);
    setOutputSearchRevealLogIndex(null);
    setLastRunScope(null);
    setTracebackNavigationSource(null);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor, pageId]);

  const applyOutputPanelPercent = useCallback(
    (value: number, persistValue = false) => {
      const next = normalizeRunOutputPanelPercent(value);
      outputPanelPercentRef.current = next;
      setOutputPanelPercent(next);
      if (persistValue) saveRunOutputPanelPercent(next);
      return next;
    },
    [],
  );

  const resizeOutputPanelFromPointer = useCallback(
    (clientY: number) => {
      // The output's height is a percent of the column it floats in (the
      // editor stack), not of the whole window with its title bar, Ribbon and
      // status bar: measured against the window, the bar jumped down on the
      // first move.
      const dock = codeWindowRef.current?.querySelector<HTMLElement>(
        '[data-testid="code-output-dock"]',
      );
      const column = (dock?.parentElement ?? codeWindowRef.current)?.getBoundingClientRect();
      if (!column) return outputPanelPercentRef.current;
      // The card floats over the editor, inset from the column's bottom edge:
      // its height runs from the pointer down to that edge.
      const bottom = dock?.getBoundingClientRect().bottom ?? column.bottom;
      return applyOutputPanelPercent(
        runOutputPanelPercentFromPointer(
          bottom - column.height,
          column.height,
          clientY - outputResizeGrabOffsetRef.current,
          outputPanelPercentRef.current,
        ),
      );
    },
    [applyOutputPanelPercent],
  );

  const finishOutputPanelResize = useCallback(() => {
    if (!outputResizeActiveRef.current) return;
    outputResizeActiveRef.current = false;
    outputResizeMovedRef.current = false;
    outputResizePointerIdRef.current = null;
    outputResizeStartPercentRef.current = null;
    const current = outputPanelPercentRef.current;
    if (current < RUN_OUTPUT_PANEL_MAX_PERCENT) {
      outputPanelRestorePercentRef.current = current;
    }
    saveRunOutputPanelPercent(current);
  }, []);

  const isOutputResizePointer = (pointerId: number | undefined) =>
    outputResizePointerIdRef.current === null ||
    pointerId === undefined ||
    pointerId === outputResizePointerIdRef.current;
  // pointercancel: the browser took the touch (or the capture was torn
  // down), so the drag never finished — the panel goes back to where the
  
  const cancelOutputPanelResize = useCallback(() => {
    if (!outputResizeActiveRef.current) return;
    const start = outputResizeStartPercentRef.current;
    outputResizeActiveRef.current = false;
    outputResizeMovedRef.current = false;
    outputResizePointerIdRef.current = null;
    outputResizeStartPercentRef.current = null;
    if (start !== null) applyOutputPanelPercent(start);
  }, [applyOutputPanelPercent]);

  const toggleOutputPanelMaximized = useCallback(() => {
    const current = outputPanelPercentRef.current;
    if (current >= RUN_OUTPUT_PANEL_MAX_PERCENT) {
      applyOutputPanelPercent(outputPanelRestorePercentRef.current, true);
      return;
    }
    outputPanelRestorePercentRef.current = current;
    applyOutputPanelPercent(RUN_OUTPUT_PANEL_MAX_PERCENT, true);
  }, [applyOutputPanelPercent]);

  // Keep streaming renders O(1): the potentially large ANSI-stripping/plain-
  // text projection is built only when the user explicitly copies/downloads,
  // never on every coalesced output frame.
  const outputHasContent = hasRunOutputContent(output);
  const outputWrapAvailable = hasRunOutputWrapTarget(output);
  const effectiveOutputWrap = outputWrapAvailable && outputWrap;
  const outputCopyDisabled =
    !outputHasContent || outputCopyBusy || !outputCopyAvailable;
  const outputCopyDisabledReason =
    outputCopyBusy || outputCopyError || outputCopied
      ? undefined
      : !outputHasContent
        ? t("code.commandDisabled.noOutput")
        : !outputCopyAvailable
          ? t("toolbar.help.clipboardUnavailable")
          : undefined;
  const outputCopyAccessibleLabel = codeCommandAccessibleLabel({
    disabled: outputCopyDisabledReason !== undefined,
    disabledReason: outputCopyDisabledReason,
    label: t("toolbar.copy"),
  });
  const outputCount = runOutputItemCount(output);
  const outputLogWindow = useMemo(
    () =>
      buildRunOutputLogWindow(
        output ?? { logs: [] },
        outputStreamFilter,
        outputLogStart,
      ),
    [output, outputLogStart, outputStreamFilter],
  );
  // Keep output streaming urgent. Search may scan a bounded 2M visible
  // characters, so React can skip intermediate output frames while a query is
  // open instead of delaying the terminal paint.
  const outputSearchSnapshot = useMemo(
    () => ({ epoch: outputSearchRunEpoch, output }),
    [output, outputSearchRunEpoch],
  );
  const deferredOutputForSearch = useDeferredValue(outputSearchSnapshot);
  const outputSearchResult = useMemo(
    () =>
      searchRunOutputLogs(
        deferredOutputForSearch.epoch === outputSearchRunEpoch
          ? (deferredOutputForSearch.output ?? { logs: [] })
          : { logs: [] },
        outputStreamFilter,
        outputSearchOpen ? outputSearchQuery : "",
      ),
    [
      deferredOutputForSearch,
      outputSearchOpen,
      outputSearchQuery,
      outputSearchRunEpoch,
      outputStreamFilter,
    ],
  );
  const outputSearchResolvedActiveIndex =
    outputSearchResult.matches.length > 0
      ? Math.min(outputSearchActiveIndex, outputSearchResult.matches.length - 1)
      : 0;
  const outputSearchActiveMatch =
    outputSearchResult.matches[outputSearchResolvedActiveIndex] ?? null;
  const outputSearchMatchIndices = useMemo(
    () => new Set(outputSearchResult.matches.map((match) => match.index)),
    [outputSearchResult.matches],
  );
  const hasMixedOutputStreams =
    outputLogWindow.stdoutCount > 0 && outputLogWindow.stderrCount > 0;

  const selectOutputStream = useCallback(
    (nextFilter: RunOutputStreamFilter) => {
      outputShouldFollowRef.current = true;
      setOutputStreamFilter(nextFilter);
      setOutputLogStart(null);
      setOutputSearchActiveIndex(0);
      setOutputSearchRevealLogIndex(null);
      setOutputSearchAutoRevealVersion((version) => version + 1);
    },
    [],
  );

  const openOutputSearch = useCallback(() => {
    if ((outputRef.current?.logs.length ?? 0) === 0) return;
    outputSearchInputRef.current?.select();
    outputSearchFocusInputRef.current = true;
    outputSearchRestoreFocusRef.current = false;
    setOutputSearchOpen(true);
  }, []);

  const closeOutputSearch = useCallback(() => {
    outputSearchFocusInputRef.current = false;
    outputSearchRestoreFocusRef.current = true;
    setOutputSearchOpen(false);
    setOutputSearchQuery("");
    setOutputSearchActiveIndex(0);
    setOutputSearchRevealLogIndex(null);
  }, []);

  const revealOutputSearchMatch = useCallback(
    (match: RunOutputSearchMatch) => {
      outputShouldFollowRef.current = false;
      setOutputLogStart(
        runOutputLogStartForMatch(outputLogWindow.total, match.filteredIndex),
      );
      setOutputSearchRevealLogIndex(match.index);
    },
    [outputLogWindow.total],
  );

  const navigateOutputSearch = useCallback(
    (direction: -1 | 1) => {
      const count = outputSearchResult.matches.length;
      if (count === 0) return;
      const nextIndex =
        (outputSearchResolvedActiveIndex + direction + count) % count;
      setOutputSearchActiveIndex(nextIndex);
      revealOutputSearchMatch(outputSearchResult.matches[nextIndex]);
    },
    [
      outputSearchResolvedActiveIndex,
      outputSearchResult.matches,
      revealOutputSearchMatch,
    ],
  );

  const changeOutputSearchQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setOutputSearchQuery(event.currentTarget.value);
      setOutputSearchActiveIndex(0);
      setOutputSearchRevealLogIndex(null);
      setOutputSearchAutoRevealVersion((version) => version + 1);
    },
    [],
  );

  const showOlderOutputLogs = useCallback(() => {
    outputShouldFollowRef.current = false;
    setOutputLogStart(
      Math.max(0, outputLogWindow.start - RUN_OUTPUT_LOG_PAGE_SIZE),
    );
  }, [outputLogWindow.start]);

  const showNewerOutputLogs = useCallback(() => {
    const latestStart = Math.max(
      0,
      outputLogWindow.total - RUN_OUTPUT_LOG_PAGE_SIZE,
    );
    const nextStart = Math.min(
      latestStart,
      outputLogWindow.start + RUN_OUTPUT_LOG_PAGE_SIZE,
    );
    const followsLatest = nextStart >= latestStart;
    outputShouldFollowRef.current = followsLatest;
    setOutputLogStart(followsLatest ? null : nextStart);
  }, [outputLogWindow.start, outputLogWindow.total]);

  const copyOutput = useCallback(async () => {
    const requestedOutput = output;
    if (!requestedOutput || outputCopyBusyRef.current) return false;
    if (!outputCopyAvailable) {
      setOutputCopied(false);
      setOutputCopyError(t("toolbar.help.clipboardUnavailable"));
      return false;
    }
    const structured = codeRunOutputNeedsStructuredArtifact(requestedOutput);
    const snapshot = {
      text: codeRunOutputCopyText(
        requestedOutput,
        executionOutputForDisplay(requestedOutput, t),
      ),
    };
    if (!snapshot.text) {
      if (structured) {
        setOutputCopied(false);
        setOutputCopyError(t("toolbar.help.copyFailed"));
      }
      return false;
    }

    const requestId = outputCopyRequestIdRef.current + 1;
    outputCopyRequestIdRef.current = requestId;
    const requestedPageId = pageId;
    const requestedRunGeneration = runGenerationRef.current;
    const requestedOutputGeneration = outputCopyGenerationRef.current;
    outputCopyBusyRef.current = true;
    setOutputCopyBusy(true);
    setOutputCopied(false);
    setOutputCopyError(null);

    const requestIsCurrent = () => {
      const liveOutput = outputRef.current;
      return (
        outputCopyMountedRef.current &&
        outputCopyRequestIdRef.current === requestId &&
        pageIdRef.current === requestedPageId &&
        runGenerationRef.current === requestedRunGeneration &&
        outputCopyGenerationRef.current === requestedOutputGeneration &&
        liveOutput === requestedOutput &&
        liveOutput !== null &&
        codeRunOutputCopyText(
          liveOutput,
          executionOutputForDisplay(liveOutput, t),
        ) === snapshot.text
      );
    };
    let copied = false;
    try {
      copied = await enqueueRunOutputClipboardWrite(
        snapshot.text,
        requestIsCurrent,
      );
    } catch {
      copied = false;
    }

    const isCurrent = requestIsCurrent();
    // Clipboard writes cannot be cancelled. Keep the physical single-flight
    // gate held across output/page replacement until this exact OS write has
    // settled, even though its UI receipt was retired immediately.
    outputCopyBusyRef.current = false;
    if (outputCopyMountedRef.current) setOutputCopyBusy(false);
    if (!isCurrent || !outputCopyMountedRef.current) {
      return false;
    }

    setOutputCopied(copied);
    setOutputCopyError(
      copied ? null : t("toolbar.help.copyFailed"),
    );
    return copied;
  }, [output, outputCopyAvailable, pageId, t]);

  const reportDownloadFailure = useCallback(
    (filename: string, unavailable: boolean) => {
      // Only a browser that really cannot download greys the controls out;
      // one download that did not start does not.
      if (unavailable) downloadBlockedNow();
      setDownloadError(t("toolbar.exportFailed", { format: filename }));
    },
    [downloadBlockedNow, t],
  );

  // Home, File, Save As and the output workbench all dispatch through this
  // single latest-ref authority. A command therefore exports the source/path/
  // encoding/output visible at dispatch time, even after async hydration or a
  // long-lived keyboard handler was registered.
  const requestDownload = useCallback(
    (target: "source" | "output"): boolean => {
      const requestedOutput = target === "output" ? outputRef.current : null;
      const filename =
        target === "source"
          ? codeWorkspaceBasename(workspacePathRef.current)
          : requestedOutput && runOutputNeedsArtifact(requestedOutput)
            ? runOutputArtifactFilename(titleRef.current)
            : runOutputFilename(titleRef.current);
      if (downloadBlockedNow()) {
        reportDownloadFailure(filename, true);
        return false;
      }

      try {
        let started = false;
        if (target === "source") {
          started = downloadCodeSourceFile(
            filename,
            contentRef.current,
            lineEndingRef.current,
            sourceEncodingRef.current,
          );
        } else {
          if (!requestedOutput) return false;
          if (runOutputNeedsArtifact(requestedOutput)) {
            const artifact = createCellOutputExport(requestedOutput);
            if (!artifact.ok) {
              reportDownloadFailure(filename, false);
              return false;
            }
            started = downloadTextFile(
              filename,
              artifact.json,
              "application/json;charset=utf-8",
            );
          } else {
            const snapshot = buildRunOutputText(
              executionOutputForDisplay(requestedOutput, t),
            );
            if (!snapshot.text) return false;
            started = downloadTextFile(filename, snapshot.text);
          }
        }

        if (!started) {
          reportDownloadFailure(filename, true);
          return false;
        }
        setDownloadError(null);
        return true;
      } catch {
        reportDownloadFailure(filename, false);
        return false;
      }
    },
    [downloadBlockedNow, reportDownloadFailure, t],
  );
  const downloadSourceFile = useCallback(() => {
    requestDownload("source");
  }, [requestDownload]);
  const downloadOutput = useCallback(() => {
    requestDownload("output");
  }, [requestDownload]);
  const downloadSelectedRunArtifact = useCallback(() => {
    const index = selectedRunTimelineIndex;
    const entry =
      index === null ? null : persistedRunTimelineRef.current[index] ?? null;
    const filename = runOutputArtifactFilename(titleRef.current).replace(
      /-output\.json$/,
      "-run.json",
    );
    if (!entry) return false;
    if (downloadBlockedNow()) {
      reportDownloadFailure(filename, true);
      return false;
    }
    const artifact = createCodeRunArtifactExport(entry);
    if (!artifact.ok) {
      reportDownloadFailure(filename, false);
      return false;
    }
    try {
      const started = downloadTextFile(
        filename,
        artifact.json,
        "application/json;charset=utf-8",
      );
      if (!started) {
        reportDownloadFailure(filename, true);
        return false;
      }
      setDownloadError(null);
      return true;
    } catch {
      reportDownloadFailure(filename, false);
      return false;
    }
  }, [downloadBlockedNow, reportDownloadFailure, selectedRunTimelineIndex]);
  // Saves the compiled LaTeX document exactly as the verified receipt
  // delivered it, under the page's name ("paper.tex" -> "paper.pdf").
  const downloadCompiledDocument = useCallback(() => {
    if (!compiledDocument) return false;
    const { artifact, filename } = compiledDocument;
    if (downloadBlockedNow()) {
      reportDownloadFailure(filename, true);
      return false;
    }
    try {
      const started = downloadBlobFile(
        filename,
        new Blob([artifact.bytes.slice()], { type: artifact.mediaType }),
      );
      if (!started) {
        reportDownloadFailure(filename, true);
        return false;
      }
      setDownloadError(null);
      return true;
    } catch {
      reportDownloadFailure(filename, false);
      return false;
    }
  }, [compiledDocument, downloadBlockedNow, reportDownloadFailure]);
  const downloadSelectedCodeTestReport = useCallback(async () => {
    const selectedIndex = selectedTestRunTimelineIndex;
    const entry =
      selectedIndex === null
        ? null
        : persistedTestRunTimelineRef.current[selectedIndex];
    const timelineGeneration = testRunTimelineGenerationRef.current;
    const ownerPageId = pageIdRef.current;
    if (!entry) return;

    // The report is the run as it was (its receipt), whatever the source
    // has become since: typing while it was written no longer refused it.
    const report = await createCodeTestJUnitReport(entry);
    if (
      !report ||
      pageIdRef.current !== ownerPageId ||
      testRunTimelineGenerationRef.current !== timelineGeneration ||
      persistedTestRunTimelineRef.current[selectedIndex!] !== entry
    ) {
      setTestRunError(t("code.testExplorer.historyUnavailable"));
      return;
    }

    const started = downloadBlobFile(
      report.filename,
      new Blob([report.content], { type: report.mimeType }),
    );
    if (!started) {
      reportDownloadFailure(report.filename, true);
      return;
    }
    setDownloadError(null);
    setTestRunError(null);
  }, [
    reportDownloadFailure,
    selectedTestRunTimelineIndex,
    t,
  ]);

  const toggleOutputWrap = useCallback(() => {
    setOutputWrap((current) => {
      const next = !current;
      saveRunOutputWrap(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!outputCopied) return;
    const timer = window.setTimeout(() => setOutputCopied(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [outputCopied]);

  useLayoutEffect(() => {
    if (outputSearchOpen && outputSearchFocusInputRef.current) {
      outputSearchFocusInputRef.current = false;
      outputSearchInputRef.current?.select();
      return;
    }
    if (!outputSearchOpen && outputSearchRestoreFocusRef.current) {
      outputSearchRestoreFocusRef.current = false;
      const trigger=outputSearchToggleRef.current;
      const disclosure=trigger?.closest("details");
      if(disclosure && !disclosure.open)disclosure.querySelector("summary")?.focus();
      else trigger?.focus({ preventScroll: true });
    }
  }, [outputSearchOpen]);

  useLayoutEffect(() => {
    if (outputSearchRevealLogIndex === null) return;
    const target = outputScrollRef.current?.querySelector<HTMLElement>(
      `[data-log-index="${outputSearchRevealLogIndex}"]`,
    );
    if (!target) return;
    target.scrollIntoView?.({ block: "center" });
    setOutputSearchRevealLogIndex(null);
  }, [outputLogWindow, outputSearchRevealLogIndex]);

  useEffect(() => {
    if (
      outputSearchHandledVersionRef.current === outputSearchAutoRevealVersion
    ) {
      return;
    }
    if (!outputSearchOpen || !outputSearchQuery) {
      outputSearchHandledVersionRef.current = outputSearchAutoRevealVersion;
      return;
    }
    const firstMatch = outputSearchResult.matches[0];
    // Keep the request pending while a streaming run has not produced a match;
    // the first matching frame will reveal itself without retyping the query.
    if (!firstMatch) return;
    const frame = requestAnimationFrame(() => {
      outputSearchHandledVersionRef.current = outputSearchAutoRevealVersion;
      revealOutputSearchMatch(firstMatch);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    outputSearchAutoRevealVersion,
    outputSearchOpen,
    outputSearchQuery,
    outputSearchResult.matches,
    revealOutputSearchMatch,
  ]);

  useLayoutEffect(() => {
    if (!output || !outputShouldFollowRef.current) return;
    const scroller = outputScrollRef.current;
    if (!scroller) return;
    // A log is followed to its end; a compiled document shown inline is read
    // from the top (its summary line, the PDF header and page 1).
    scroller.scrollTop =
      compiledDocument !== null &&
      compiledDocumentWindowKey === null &&
      isSameCompiledOutput(compiledDocument.output, output)
        ? 0
        : scroller.scrollHeight;
  }, [
    compiledDocument,
    compiledDocumentWindowKey,
    output,
    outputLogStart,
    outputStreamFilter,
  ]);

  // Closing this window stops THIS window's run and frees THIS window's stream
  // buffer. Both are per-view, so they happen whether or not anyone else is
  // still looking at the page.
  useEffect(
    () => () => {
      const wasRunning = runningRef.current;
      const activeExecution = activeExecutionAuthorityRef.current;
      const runningLanguage =
        activeExecution?.language ?? runningLanguageRef.current;
      runGenerationRef.current += 1;
      runningRef.current = false;
      runningLanguageRef.current = null;
      activeExecution?.controller.abort();
      if (activeExecutionAuthorityRef.current === activeExecution) {
        activeExecutionAuthorityRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
      consoleAbortRef.current?.abort();
      consoleAbortRef.current = null;
      consoleJavaScriptRuntimeDispatchedRef.current = false;
      coalescerRef.current?.dispose();
      coalescerRef.current = null;

      // Python and SQL do not observe the JS AbortSignal. Interrupt only the
      // runtime captured by this view's execution identity; a sibling view's
      // page lease keeps the namespace alive, but must not leave the departed
      
      // owner still releases that claim when its interrupted result settles.
      // If an injected in-process Python runtime cannot be pre-empted, keeping
      // the claim until it returns is the truthful alternative to overlapping
      // a second execution in the same namespace.
      if (wasRunning && runningLanguage === "python") {
        interruptPython(pageId);
      } else if (wasRunning && runningLanguage === "sql") {
        interruptSql(pageId);
      } else if (wasRunning && runningLanguage === "lua") {
        interruptLua(pageId);
      } else if (wasRunning && runningLanguage === "csharp") {
        interruptCSharp(pageId);
      } else if (wasRunning && runningLanguage === "ruby") {
        interruptRuby(pageId);
      } else if (wasRunning && runningLanguage === "bash") {
        interruptShell(pageId);
      }
    },
    [pageId],
  );

  // The page's runtimes are a different matter: the Python interpreter (~50MB
  // of Pyodide, holding the user's variables), the in-memory SQL database
  // holding their tables, and the console realm are keyed by PAGE, and a code
  // page can be open in two views at once — the note titlebar's "duplicate
  // view" button is one click away. Tearing them down on any view's unmount
  // killed the other view's kernel mid-run, silently: nothing errored, the
  // survivor just started answering as if it had booted a moment ago. So this
  // window takes a LEASE, and the teardown runs when the last one is released.
  //
  // With one view — the ordinary case — this is exactly the unmount teardown it
  // replaces, and the lease is acquired and released by the same effect, so it
  // can only outlive the page if the component never unmounts at all, which is
  // the one case where the old code also never disposed.
  const disposePageRuntime = useCallback(() => {
    interruptPython(pageId);
    resetPythonRuntime(pageId);
    resetSqlRuntime(pageId);
    resetLuaRuntime(pageId);
    resetCSharpRuntime(pageId);
    resetRubyRuntime(pageId);
    resetShellRuntime(pageId);
    disposeSandboxRuntime(javaScriptSandboxOwner);
  }, [pageId, javaScriptSandboxOwner]);
  usePageSessionLease({
    pageId,
    dispose: disposePageRuntime,
    contentVersion: autosave.page?.content_version,
    reloadNonce: autosave.reloadNonce,
  });

  // ---- Find-in-Files computed values ---------------------------------------
  const fifFindOptions = useMemo<FindOptions>(
    () => ({
      caseSensitive: fifCaseSensitive,
      wholeWord: fifWholeWord,
      regex: fifRegex,
    }),
    [fifCaseSensitive, fifWholeWord, fifRegex],
  );

  // Project one bounded search buffer per authorized code page. Unsaved open
  // buffers win over hydrated saved content, so workspace search never hides
  // the user's current edits. Closed pages retain stable `page:<id>` targets
  // that can be opened through the existing notebook window manager.
  const fifGlobFilter = useMemo(
    () => parseSearchGlobFilter(fifIncludeGlobs, fifExcludeGlobs),
    [fifExcludeGlobs, fifIncludeGlobs],
  );
  const fifScopedFiles = useMemo(
    () =>
      searchGlobFilterIsEmpty(fifGlobFilter)
        ? workspaceCatalog.files
        : workspaceCatalog.files.filter((file) =>
            matchesSearchGlobFilter(file.path, fifGlobFilter),
          ),
    [fifGlobFilter, workspaceCatalog.files],
  );

  const fifSearchProjection = useMemo(() => {
    if (!fifOpen) {
      return {
        buffers: [] as SearchBuffer[],
        totalCodeUnits: 0,
        unloadedFileCount: 0,
        oversizedFileCount: 0,
        truncated: false,
      };
    }
    const registeredEntry = registeredCodeWindowEntryRef.current;
    if (guestMode) {
      if (
        registeredEntry?.pageId !== pageId ||
        registeredEntry.windowId !== windowId
      ) {
        return {
          buffers: [] as SearchBuffer[],
          totalCodeUnits: 0,
          unloadedFileCount: 0,
          oversizedFileCount: 0,
          truncated: false,
        };
      }
      let registeredText: string;
      let registeredLabel: string;
      try {
        registeredText = registeredEntry.getText();
        registeredLabel = registeredEntry.label;
      } catch {
        return {
          buffers: [] as SearchBuffer[],
          totalCodeUnits: 0,
          unloadedFileCount: 0,
          oversizedFileCount: 0,
          truncated: false,
        };
      }
      const projection = buildCodeWorkspaceSearchProjection(
        fifScopedFiles.filter((file) => file.pageId === pageId),
        workspacePages,
        [{ pageId, text: registeredText }],
      );
      const pageBufferId = `page:${pageId}`;
      const windowBufferId = `window:${codeWindowEntryId(registeredEntry)}`;
      return {
        ...projection,
        buffers: projection.buffers.map((buffer) =>
          buffer.id === pageBufferId
            ? { ...buffer, id: windowBufferId, label: registeredLabel }
            : buffer,
        ),
      };
    }
    const all = getOpenCodeWindowSnapshots(
      undefined,
      undefined,
      workspaceNotebookId,
    );
    const self = all.find(
      (snapshot) =>
        snapshot.pageId === pageId && snapshot.windowId === windowId,
    );
    const others = all.filter(
      (snapshot) =>
        !(snapshot.pageId === pageId && snapshot.windowId === windowId),
    );
    const ordered = [...(self ? [self] : []), ...others];
    const liveBuffers = ordered.map((snapshot) => ({
      pageId: snapshot.pageId,
      text: snapshot.text,
    }));
    if (!liveBuffers.some((entry) => entry.pageId === pageId)) {
      liveBuffers.unshift({ pageId, text: contentRef.current });
    }
    return buildCodeWorkspaceSearchProjection(
      fifScopedFiles,
      workspacePages,
      liveBuffers,
    );
    // Re-derive when the panel opens or the local buffer changes (so the
    // self-entry stays current as the user types).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    codeWindowRegistryRevision,
    contentSnapshotRevision,
    fifOpen,
    fifScopedFiles,
    guestMode,
    pageId,
    windowId,
    workspacePages,
  ]);
  const fifBuffers = fifSearchProjection.buffers;

  const fifResult = useMemo(() => {
    const result =
      fifOpen && fifBuffers.length > 0
        ? findInFiles(fifBuffers, fifQuery, fifFindOptions)
        : { groups: [], total: 0 };
    const workspaceIncomplete =
      workspaceDetailsLoading ||
      workspaceDetailsIncomplete ||
      workspaceCatalog.truncated ||
      fifSearchProjection.truncated;
    return fifQuery && workspaceIncomplete && !result.truncated
      ? { ...result, truncated: true }
      : result;
  }, [
    fifOpen,
    fifBuffers,
    fifFindOptions,
    fifQuery,
    fifSearchProjection.truncated,
    workspaceCatalog.truncated,
    workspaceDetailsIncomplete,
    workspaceDetailsLoading,
  ]);

  const fifRegexError = useMemo(() => {
    const error = fifRegex
      ? validateRegex(fifQuery, fifCaseSensitive)
      : null;
    const messageKey = findRegexErrorMessageKey(error);
    return messageKey ? t(messageKey) : null;
  }, [fifRegex, fifQuery, fifCaseSensitive, t]);
  const fifReplacementPlanFailed = Boolean(
    fifReplacementFailure &&
      fifReplacementFailure.buffers === fifBuffers &&
      fifReplacementFailure.query === fifQuery &&
      fifReplacementFailure.replacement === fifReplacement &&
      fifReplacementFailure.options === fifFindOptions,
  );
  const fifOperationError =
    fifRegexError ??
    (fifReplacementPlanFailed ? t(fifReplacementFailure!.messageKey) : null);

  const openFindInFiles = useCallback(() => {
    setQuickOpenOpen(false);
    setWorkspaceProblemsOpen(false);
    setTestExplorerOpen(false);
    setFifOpen(true);
    requestAnimationFrame(() => fifInputRef.current?.select());
  }, []);

  const closeFindInFiles = useCallback(() => {
    setFifOpen(false);
    requestAnimationFrame(focusCodeEditor);
  }, [focusCodeEditor]);

  const changeFindInFilesQuery = useCallback((nextQuery: string) => {
    setFifQuery(boundFindQuery(nextQuery));
    setFifActiveHitKey(null);
  }, []);

  // Navigate open hits directly and closed hits through the existing authorized
  // window-opening path. Exact offsets are used only while the saved content
  // version still matches; otherwise hydration falls back to line/column.
  const goToFifHit = useCallback(
    (hit: FindInFilesHit) => {
      const target = findInFilesHitTarget(hit);
      if (target.bufferId.startsWith("page:")) {
        const file = workspaceFilesByPageId.get(target.bufferId.slice(5));
        if (!file) return;
        setFifActiveHitKey(findInFilesHitKey(hit));
        activateWorkspaceFile(file, {
          line: hit.line,
          column: hit.column,
          from: target.from,
          to: target.to,
          contentVersion: file.contentVersion,
        });
        return;
      }
      if (guestMode) {
        const currentEntry = registeredCodeWindowEntryRef.current;
        const currentBufferId = currentEntry
          ? `window:${codeWindowEntryId(currentEntry)}`
          : null;
        if (
          !currentEntry?.revealRange ||
          currentEntry.pageId !== pageId ||
          currentEntry.windowId !== windowId ||
          target.bufferId !== currentBufferId
        ) {
          return;
        }
        setFifActiveHitKey(findInFilesHitKey(hit));
        currentEntry.revealRange(target.from, target.to);
        return;
      }
      const bufferId = target.bufferId.startsWith("window:")
        ? target.bufferId.slice(7)
        : target.bufferId;
      const entry = getOpenCodeBuffers().find(
        (candidate) => codeWindowEntryId(candidate) === bufferId,
      );
      if (!entry?.revealRange) return;
      setFifActiveHitKey(findInFilesHitKey(hit));
      entry.revealRange(target.from, target.to);
    },
    [
      activateWorkspaceFile,
      guestMode,
      pageId,
      windowId,
      workspaceFilesByPageId,
    ],
  );

  // "needs-open": every result is in a page this window can write, but some of
  // those pages are not open in a window, and replacing goes through the open
  // windows' buffers. Said so on the button rather than left unexplained.
  const fifReplaceAllState = useMemo((): "ok" | "needs-open" | "blocked" => {
    if (
      !codeMayAuthor ||
      workspaceDetailsLoading ||
      workspaceDetailsIncomplete ||
      workspaceCatalog.truncated ||
      fifSearchProjection.truncated ||
      fifReplacementPlanFailed
    ) {
      return "blocked";
    }
    const openPageIds = new Set(
      getOpenCodeBuffers().map((entry) => entry.pageId),
    );
    const allTargetsOpen = fifResult.groups.every(
      (group) =>
        !group.bufferId.startsWith("page:") ||
        openPageIds.has(group.bufferId.slice(5)),
    );
    if (!allTargetsOpen) return "needs-open";
    const targetPageIds = new Set(
      fifResult.groups.map((group) =>
        group.bufferId.startsWith("page:")
          ? group.bufferId.slice(5)
          : group.bufferId.split(":::", 1)[0],
      ),
    );
    return getOpenCodeBuffers()
      .filter((entry) => targetPageIds.has(entry.pageId))
      .every(
        (entry) =>
          codeWindowAuthoritySnapshot(codeWindowEntryId(entry))?.allowed ===
          true,
      )
      ? "ok"
      : "blocked";
    // Registry membership is an external store input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    codeWindowRegistryRevision,
    codeMayAuthor,
    fifResult.groups,
    fifSearchProjection.truncated,
    fifReplacementPlanFailed,
    workspaceCatalog.truncated,
    workspaceDetailsIncomplete,
    workspaceDetailsLoading,
  ]);
  const fifReplaceAllAvailable = fifReplaceAllState === "ok";

  /**
   * The authorized write targets for a workspace replacement: one entry per
   * OPEN code window whose page is in the workspace catalog. Search projects one
   * buffer per page (`page:<id>`); the registry addresses live windows
   * (`<pageId>:::<windowId>`), so the two id spaces are bridged by page id.
   */
  const openWorkspaceReplaceTargets = useCallback(() => {
    // Scoped, not the whole catalogue: a file the include/exclude boxes hid is
    // not in the result tree, so Replace All must not rewrite it either.
    const workspacePageIds = new Set(
      fifScopedFiles
        .filter((file) => file.pageType === "code")
        .map((file) => file.pageId),
    );
    const allEntries = getOpenCodeBuffers();
    const self = allEntries.find(
      (entry) => entry.pageId === pageId && entry.windowId === windowId,
    );
    const orderedEntries = [
      ...(self ? [self] : []),
      ...allEntries.filter((entry) => entry !== self),
    ];
    const seenPageIds = new Set<string>();
    const entries: CodeWindowEntry[] = [];
    const buffers: SearchBuffer[] = [];
    for (const entry of orderedEntries) {
      if (
        !workspacePageIds.has(entry.pageId) ||
        seenPageIds.has(entry.pageId)
      ) {
        continue;
      }
      try {
        buffers.push({
          id: codeWindowEntryId(entry),
          label: entry.label,
          text: entry.getText(),
        });
      } catch {
        // A detached duplicate must not hide a still-live view of this page.
        continue;
      }
      seenPageIds.add(entry.pageId);
      entries.push(entry);
    }
    return {
      entries,
      buffers,
      entryById: new Map(
        entries.map((entry) => [codeWindowEntryId(entry), entry] as const),
      ),
    };
  }, [fifScopedFiles, pageId, windowId]);

  // Replace-in-Files: apply `fifReplacement` to every match across the open code
  // windows, writing back through the registry's setText (which calls each
  // window's own setContent + persist). One logical operation, many windows —
  // so it is all-or-nothing: the result tree on screen is the contract, and if
  // any target moved on from what that tree was computed against, the whole
  // replacement is cancelled rather than writing a stale mixture.
  const doReplaceAllInFiles = useCallback(() => {
    if (
      !codeMayAuthorRef.current ||
      !fifQuery ||
      !fifReplaceAllAvailable ||
      fifOperationError
    ) {
      return;
    }
    const { buffers, entryById } = openWorkspaceReplaceTargets();
    if (
      [...entryById].some(
        ([id]) => codeWindowAuthoritySnapshot(id)?.allowed !== true,
      )
    ) {
      return;
    }
    const previewTextByPageId = new Map(
      fifBuffers.map((buffer) => [
        buffer.id.startsWith("page:") ? buffer.id.slice(5) : buffer.id,
        buffer.text,
      ] as const),
    );
    for (const [id, entry] of entryById) {
      const previewed = previewTextByPageId.get(entry.pageId);
      const live = buffers.find((buffer) => buffer.id === id)?.text;
      // A window that was typed in, or opened after the preview rendered,
      // invalidates the whole operation; the next render shows a fresh tree.
      if (previewed === undefined || previewed !== live) return;
    }
    let result: ReturnType<typeof replaceInFiles>;
    try {
      result = replaceInFiles(
        buffers,
        fifQuery,
        fifReplacement,
        fifFindOptions,
      );
      setFifReplacementFailure(null);
    } catch (error) {
      if (!isFindReplacementPlanError(error)) throw error;
      setFifReplacementFailure({
        buffers: fifBuffers,
        query: fifQuery,
        replacement: fifReplacement,
        options: fifFindOptions,
        messageKey: findReplacementPlanMessageKey(error),
      });
      return;
    }
    if (result.count === 0) return;
    const undoSnapshot = createReplaceInFilesUndoSnapshot(buffers, result);
    // Fail closed when the displaced text exceeds the shared undo budget rather
    // than applying a workspace edit the user cannot take back.
    if (!undoSnapshot) return;
    for (const id of result.changes.keys()) {
      if (!entryById.has(id)) return;
    }
    setFifUndoSnapshot(undoSnapshot);
    setFifActiveHitKey(null);
    for (const [id, newText] of result.changes) {
      const changes = result.edits?.get(id);
      const before = buffers.find((buffer) => buffer.id === id)?.text;
      entryById
        .get(id)
        ?.setText(
          newText,
          changes && before !== undefined
            ? { changes, expected: before }
            : undefined,
        );
    }
  }, [
    fifBuffers,
    fifFindOptions,
    fifQuery,
    fifReplaceAllAvailable,
    fifOperationError,
    fifReplacement,
    openWorkspaceReplaceTargets,
  ]);

  // Undo deliberately does NOT mirror the multi-buffer host's all-or-nothing revert.
  // A multi-buffer host is one document with one save, so a half-reverted notebook is an
  // inconsistent document. Here every window is a separate page with its own
  // save, and a peer window edited after the replacement is somebody's real
  // work: it is restored only while it still holds exactly what this
  // replacement wrote, and left alone otherwise.
  const undoReplaceAllInFiles = useCallback(() => {
    if (!codeMayAuthorRef.current || !fifUndoSnapshot) return;
    const { buffers, entryById } = openWorkspaceReplaceTargets();
    if (
      [...entryById].some(
        ([id]) => codeWindowAuthoritySnapshot(id)?.allowed !== true,
      )
    ) {
      return;
    }
    const result = undoReplaceInFiles(buffers, fifUndoSnapshot);
    setFifUndoSnapshot(null);
    setFifActiveHitKey(null);
    if (result.restoredBufferCount === 0) return;
    for (const [id, originalText] of result.changes) {
      const changes = result.edits?.get(id);
      const live = buffers.find((buffer) => buffer.id === id)?.text;
      entryById
        .get(id)
        ?.setText(
          originalText,
          changes && live !== undefined
            ? { changes, expected: live }
            : undefined,
        );
    }
  }, [fifUndoSnapshot, openWorkspaceReplaceTargets]);

  // Cache of fetched version history, keyed by pageId. Populated once per
  // mount (and on pageId change) so the Compare picker can show saved versions
  // without an async round-trip each time the picker opens.
  const savedVersionsRef = useRef<{
    pageId: string;
    versions: PageVersionItem[];
  }>({ pageId: "", versions: [] });
  const savedVersionRequestGenerationRef = useRef(0);
  // Bumped when the version-history panel closes, so taking a checkpoint makes
  // Compare appear immediately. Without it the availability below is fetched
  // once on mount and never again: a user could save a checkpoint, watch it
  // land in the history list, and still find Compare missing until they
  // reloaded the page — the button is gated on a count that was taken before
  // the version existed.
  const [savedVersionNonce, setSavedVersionNonce] = useState(0);
  const [savedVersionAvailability, setSavedVersionAvailability] = useState({
    pageId: "",
    count: 0,
  });
  const [savedVersionCatalogState, setSavedVersionCatalogState] = useState<{
    pageId: string;
    status: "loading" | "ready" | "error";
  }>({ pageId: "", status: "loading" });

  // Baseline for the change gutter: the newest saved version of THIS page.
  // Autosave means "unsaved" is a blink, so diffing against it would show
  // nothing; a snapshot is what this product keeps deliberately, which makes it
  // the honest answer to "what have I changed since the last version I kept?".
  const [dirtyDiffBaseline, setDirtyDiffBaseline] = useState<string | null>(
    null,
  );

  // Name a snapshot the way the version-history panel does. Deliberately the
  // SAME message keys it uses (VersionHistoryPanel's sourceLabel), so the two
  // surfaces cannot end up with two words for one snapshot; an unrecognised
  // value falls through to itself, exactly as it does there.
  const savedVersionSourceLabel = useCallback(
    (source: string): string => {
      switch (source) {
        case "manual":
          return t("versions.sourceManual");
        case "pre_restore":
          return t("versions.sourcePreRestore");
        case "pre_copilot_parts":
          return t("versions.sourcePreCopilotParts");
        case "room_recovery":
          return t("versions.sourceRoomRecovery");
        case "autosave":
          return t("versions.sourceAutosave");
        default:
          return source;
      }
    },
    [t],
  );

  // ---- Compare sources for the standalone editor ---------------------------
  // Provides sibling code windows (from the registry, excl. self) + saved
  // version history as the Compare picker list. Invoked lazily when the Compare
  // picker opens, so the list always reflects the current set of open windows.
  const compareSourcesForWindow = useCallback((): CompareSource[] => {
    // Sibling code windows (other open code pages).
    const siblings: CompareSource[] = [];
    const seenPageIds = new Set<string>();
    for (const snapshot of getOpenCodeWindowSnapshots(
      pageId,
      undefined,
      workspaceNotebookId,
    )) {
      if (seenPageIds.has(snapshot.pageId)) continue;
      siblings.push({
        id: `window:${snapshot.pageId}:${snapshot.windowId ?? ""}`,
        label: snapshot.label,
        text: snapshot.text,
      });
      seenPageIds.add(snapshot.pageId);
    }
    // Saved version history: synchronously return any already-fetched versions
    // from the ref; the async fetch below keeps the ref current.
    const savedVersions =
      savedVersionsRef.current.pageId === pageId
        ? savedVersionsRef.current.versions
        : [];
    const versionSources: CompareSource[] = savedVersions
      .filter((v) => v.page_type === "code" || v.page_type === null)
      .map((v) => ({
        id: `version:${v.id}`,
        label: t("code.compare.savedVersion", {
          no: String(v.version_no),
          // `source` is a server enum ("manual" / "pre_restore" / "autosave"),
          // and printing it raw put an internal identifier in front of the
          // user in both locales — "Saved version 4 (pre_restore)" — while the
          // version panel one click away called the same snapshot "Before
          // restore". Same keys as that panel, so the two cannot drift.
          source: savedVersionSourceLabel(v.source),
        }),
        loadText: async () => {
          const detail = await getPageVersion(pageId, v.version_no, v.id);
          if (
            detail.id !== v.id ||
            detail.page_id !== pageId ||
            detail.version_no !== v.version_no ||
            (detail.page_type !== "code" && detail.page_type !== null)
          ) {
            throw new Error("Saved code version identity or type mismatch");
          }
          const parsed = codePageContentSchema.safeParse(detail.snapshot_json);
          if (!parsed.success) {
            throw new Error("Saved code version has no comparable source");
          }
          return parsed.data.content ?? "";
        },
      }));
    return [...siblings, ...versionSources];
  }, [pageId, t, savedVersionSourceLabel, workspaceNotebookId]);

  // Re-read the version list (and with it the change-gutter baseline) whenever
  // the page is reloaded from the server. A snapshot taken from another surface
  // while this window is open would otherwise leave the gutter comparing
  // against a version that is no longer the latest — markers claiming changes
  // the user already saved, and a revert that goes back too far.
  useLayoutEffect(() => {
    const requestedPageId = pageId;
    const generation = savedVersionRequestGenerationRef.current + 1;
    savedVersionRequestGenerationRef.current = generation;
    const requestIsCurrent = () =>
      savedVersionRequestGenerationRef.current === generation &&
      requestedPageId === pageIdRef.current;

    savedVersionsRef.current = { pageId: requestedPageId, versions: [] };
    // Layout-time retirement is intentional: a keyed editor can accept the
    // Compare chord before passive effects run. Clear A's catalog before B can
    // become interactive, including A -> B -> A owner ABA.
    setSavedVersionAvailability({ pageId: requestedPageId, count: 0 });
    setDirtyDiffBaseline(null);
    if (guestMode) {
      setSavedVersionCatalogState({
        pageId: requestedPageId,
        status: "ready",
      });
      return () => {
        if (savedVersionRequestGenerationRef.current === generation) {
          savedVersionRequestGenerationRef.current += 1;
        }
      };
    }
    setSavedVersionCatalogState({
      pageId: requestedPageId,
      status: "loading",
    });
    listPageVersions(requestedPageId)
      .then((versions) => {
        if (!requestIsCurrent()) return;
        if (versions.some((version) => version.page_id !== requestedPageId)) {
          throw new Error("Saved version catalog page identity mismatch");
        }
        const codeVersions = versions.filter(
          (version) =>
            version.page_type === "code" || version.page_type === null,
        );
        savedVersionsRef.current = {
          pageId: requestedPageId,
          versions: codeVersions,
        };
        setSavedVersionAvailability({
          pageId: requestedPageId,
          count: codeVersions.length,
        });
        setSavedVersionCatalogState({
          pageId: requestedPageId,
          status: "ready",
        });
        const newest = codeVersions.reduce<PageVersionItem | null>(
          (best, version) =>
            !best || version.version_no > best.version_no ? version : best,
          null,
        );
        if (newest) {
          getPageVersion(requestedPageId, newest.version_no, newest.id)
            .then((detail) => {
              if (!requestIsCurrent()) return;
              // Same identity check the compare picker uses: a mismatched
              // snapshot is dropped rather than shown as this page's history.
              if (
                detail.id !== newest.id ||
                detail.page_id !== requestedPageId ||
                detail.version_no !== newest.version_no ||
                (detail.page_type !== "code" && detail.page_type !== null)
              ) {
                return;
              }
              const parsed = codePageContentSchema.safeParse(
                detail.snapshot_json,
              );
              if (parsed.success) {
                setDirtyDiffBaseline(parsed.data.content ?? "");
              }
            })
            .catch(() => {
              // The picker owns a separate visible per-source failure receipt;
              // a missing passive gutter baseline must not invalidate the list.
            });
        }
      })
      .catch(() => {
        if (!requestIsCurrent()) return;
        savedVersionsRef.current = {
          pageId: requestedPageId,
          versions: [],
        };
        setSavedVersionAvailability({ pageId: requestedPageId, count: 0 });
        setSavedVersionCatalogState({
          pageId: requestedPageId,
          status: "error",
        });
        setDirtyDiffBaseline(null);
      });
    return () => {
      if (savedVersionRequestGenerationRef.current === generation) {
        savedVersionRequestGenerationRef.current += 1;
      }
    };
  }, [guestMode, pageId, autosave.reloadNonce, savedVersionNonce]);
  const compareSourceCount =
    new Set(
      getOpenCodeWindowSnapshots(
        pageId,
        undefined,
        workspaceNotebookId,
      ).map((snapshot) => snapshot.pageId),
    ).size +
    (savedVersionAvailability.pageId === pageId
      ? savedVersionAvailability.count
      : 0);

  // AI writes into the code page through the shared document-edit command bus.
  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<ApplyDocumentEditCommandDetail>)
        .detail;
      if (
        !detail ||
        !documentEditCommandMatchesTarget(detail, { pageId, windowId })
      ) {
        return;
      }
      const sharedLease = codePageBufferLeaseRef.current;
      if (!detail.targetWindowId && sharedLease && !sharedLease.isOwner()) {
        return;
      }
      const ids = {
        proposalId: detail.proposalId,
        targetPageId: detail.targetPageId,
        targetWindowId: detail.targetWindowId,
      };
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) {
        notifyDocumentEditApplied({
          ...ids,
          ok: false,
          message: t("code.editApplyFailed"),
          receipt: null,
        });
        return;
      }
      if (!commandHasCodeOperation(detail.command)) {
        notifyDocumentEditApplied({
          ...ids,
          ok: false,
          message: t("code.editNoOperation"),
        });
        return;
      }
      const applyCommand = () => {
        if (!codeAuthoringAuthorityIsCurrent(authorityGeneration)) {
          notifyDocumentEditApplied({
            ...ids,
            ok: false,
            message: t("code.editApplyFailed"),
            receipt: null,
          });
          return;
        }
        retirePendingCodeImportAuthority();
        const previous: CodeSnapshot = {
          language: languageRef.current,
          content: contentRef.current,
          debugConfiguration: debugConfigurationRef.current,
        };
        const result = applyCodeCommand(previous, detail.command);
        if (result.appliedOperations === 0) {
          notifyDocumentEditApplied({
            ...ids,
            ok: false,
            message: t("code.editApplyFailed"),
          });
          return;
        }
        const appliedDraft = buildPageDraft(
          result.state.language,
          result.state.content,
        );
        const lease = codePageBufferLeaseRef.current;
        const rollbackCommand = lease?.applyCommandDraft(
          appliedDraft,
          previous.content,
        );
        if (lease && !rollbackCommand) {
          notifyDocumentEditApplied({
            ...ids,
            ok: false,
            message: t("code.editApplyFailed"),
            receipt: null,
          });
          return;
        }
        languageRef.current = result.state.language;
        setLanguage(result.state.language);
        installAuthoritativeContent(result.state.content);
        void (async () => {
          const savedPage = await (
            lease
              ? lease.saveNow(appliedDraft)
              : autosave.saveNow(appliedDraft)
          );
          if (!codeAuthoringAuthorityIsCurrent(authorityGeneration)) {
            notifyDocumentEditApplied({
              ...ids,
              ok: false,
              message: t("code.editApplyFailed"),
              receipt: null,
            });
            return;
          }
          // Roll back only the generation this request rendered. A user edit made
          // while the PATCH was in flight already owns contentRef and the hook's
          // pending draft; `replacePendingDraft` REPLACES rather than merges, so
          // restoring `previous` would delete those keystrokes from the screen
          // and from the save queue at once — in the failure branch, which is
          // exactly where the user is most likely still typing. The multi-buffer host
          // sibling has guarded this all along.
          if (
            !savedPage &&
            contentRef.current === result.state.content &&
            languageRef.current === result.state.language &&
            debugConfigurationRef.current === previous.debugConfiguration &&
            (!lease || rollbackCommand?.rollback())
          ) {
            languageRef.current = previous.language;
            setLanguage(previous.language);
            installAuthoritativeContent(previous.content);
            const rollbackDraft = buildPageDraft(
              previous.language,
              previous.content,
              undefined,
              previous.debugConfiguration,
            );
            if (lease) {
              lease.replaceDraft(rollbackDraft);
            } else {
              autosave.replacePendingDraft(rollbackDraft);
            }
          }
          const receipt = savedPage
            ? createDocumentEditReceipt(detail, {
                pageType: "code",
                undoable: true,
              })
            : null;
          if (receipt) {
            rememberCappedSnapshot(undoSnapshotsRef.current, receipt.id, {
              before: previous,
              after: {
                ...previous,
                content: result.state.content,
                language: result.state.language,
              },
              lease,
              history: rollbackCommand ?? null,
            });
          }
          notifyDocumentEditApplied({
            ...ids,
            ok: Boolean(savedPage),
            message: savedPage ? undefined : t("code.editSaveFailed"),
            receipt,
          });
        })();
      };

      const baseContentVersion = detail.baseContentVersion;
      if (baseContentVersion === null || baseContentVersion === undefined) {
        applyCommand();
        return;
      }
      const expectedRevision = sharedLease?.getDocumentRevision() ?? null;
      const expectedSnapshot: CodeSnapshot = {
        language: languageRef.current,
        content: contentRef.current,
        debugConfiguration: debugConfigurationRef.current,
      };
      void (async () => {
        const verification = await verifyDocumentCommandVersion({
          pageId,
          baseContentVersion,
          saveCurrent: () =>
            codeAuthoringAuthorityIsCurrent(authorityGeneration)
              ? sharedLease
                ? sharedLease.saveNow()
                : autosave.saveNow()
              : Promise.resolve(null),
          isCurrentGeneration: () =>
            sharedLease
              ? expectedRevision !== null &&
                sharedLease.getDocumentRevision() === expectedRevision
              : languageRef.current === expectedSnapshot.language &&
                contentRef.current === expectedSnapshot.content &&
                debugConfigurationRef.current ===
                  expectedSnapshot.debugConfiguration,
        });
        if (!verification.ok) {
          notifyDocumentEditApplied({
            ...ids,
            ok: false,
            message:
              verification.reason === "save_failed"
                ? t("code.editSaveFailed")
                : t("code.editApplyFailed"),
            receipt: null,
          });
          return;
        }
        applyCommand();
      })();
    }
    window.addEventListener(APPLY_DOCUMENT_EDIT_COMMAND_EVENT, handler);
    return () =>
      window.removeEventListener(APPLY_DOCUMENT_EDIT_COMMAND_EVENT, handler);
  }, [
    autosave,
    buildPageDraft,
    captureCodeAuthoringAuthority,
    codeAuthoringAuthorityIsCurrent,
    installAuthoritativeContent,
    pageId,
    retirePendingCodeImportAuthority,
    windowId,
    t,
  ]);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<DocumentEditUndoRequestDetail>)
        .detail;
      if (
        !detail ||
        !documentEditCommandMatchesTarget(detail, { pageId, windowId })
      ) {
        return;
      }
      const sharedLease = codePageBufferLeaseRef.current;
      if (!detail.targetWindowId && sharedLease && !sharedLease.isOwner()) {
        return;
      }
      const record = undoSnapshotsRef.current.get(detail.receiptId);
      const previous = record?.before;
      const ids = {
        receiptId: detail.receiptId,
        proposalId: detail.proposalId,
        targetPageId: detail.targetPageId,
        targetWindowId: detail.targetWindowId,
      };
      const authorityGeneration = captureCodeAuthoringAuthority();
      if (authorityGeneration === null) {
        notifyDocumentEditUndoResult({
          ...ids,
          ok: false,
          message: t("code.editUndoFailed"),
        });
        return;
      }
      if (!record || !previous) {
        notifyDocumentEditUndoResult({
          ...ids,
          ok: false,
          message: t("code.editUndoFailed"),
        });
        return;
      }
      const contentBeforeUndo: CodeSnapshot = {
        language: languageRef.current,
        content: contentRef.current,
        debugConfiguration: debugConfigurationRef.current,
      };
      if (!codeAuthoringAuthorityIsCurrent(authorityGeneration)) return;
      if (
        record.lease !== codePageBufferLeaseRef.current ||
        contentBeforeUndo.content !== record.after.content ||
        contentBeforeUndo.language !== record.after.language ||
        JSON.stringify(contentBeforeUndo.debugConfiguration) !==
          JSON.stringify(record.after.debugConfiguration) ||
        (record.history && !record.history.undo())
      ) {
        notifyDocumentEditUndoResult({
          ...ids,
          ok: false,
          message: t("code.editUndoFailed"),
        });
        return;
      }
      retirePendingCodeImportAuthority();
      languageRef.current = previous.language;
      setLanguage(previous.language);
      installAuthoritativeContent(previous.content);
      debugConfigurationRef.current = previous.debugConfiguration;
      setDebugConfiguration(previous.debugConfiguration);
      void (async () => {
        const undoDraft = buildPageDraft(
          previous.language,
          previous.content,
          undefined,
          previous.debugConfiguration,
        );
        const lease = codePageBufferLeaseRef.current;
        const savedPage = await (
          lease ? lease.saveNow(undoDraft) : autosave.saveNow(undoDraft)
        );
        if (!codeAuthoringAuthorityIsCurrent(authorityGeneration)) {
          notifyDocumentEditUndoResult({
            ...ids,
            ok: false,
            message: t("code.editUndoFailed"),
          });
          return;
        }
        if (savedPage) {
          undoSnapshotsRef.current.delete(detail.receiptId);
        } else if (
          contentRef.current === previous.content &&
          languageRef.current === previous.language &&
          debugConfigurationRef.current === previous.debugConfiguration &&
          (!record.history || record.history.redo())
        ) {
          // Same rule as the apply path above: only undo the undo when the
          // buffer is still the one this request produced. Typing during the
          // in-flight PATCH makes the user the owner of the buffer.
          languageRef.current = contentBeforeUndo.language;
          setLanguage(contentBeforeUndo.language);
          installAuthoritativeContent(contentBeforeUndo.content);
          debugConfigurationRef.current =
            contentBeforeUndo.debugConfiguration;
          setDebugConfiguration(contentBeforeUndo.debugConfiguration);
          const rollbackDraft = buildPageDraft(
            contentBeforeUndo.language,
            contentBeforeUndo.content,
            undefined,
            contentBeforeUndo.debugConfiguration,
          );
          if (lease) {
            lease.replaceDraft(rollbackDraft);
          } else {
            autosave.replacePendingDraft(rollbackDraft);
          }
        }
        notifyDocumentEditUndoResult({
          ...ids,
          ok: Boolean(savedPage),
          message: savedPage ? undefined : t("code.editUndoFailed"),
        });
      })();
    }
    window.addEventListener(DOCUMENT_EDIT_UNDO_REQUEST_EVENT, handler);
    return () =>
      window.removeEventListener(DOCUMENT_EDIT_UNDO_REQUEST_EVENT, handler);
  }, [
    autosave,
    buildPageDraft,
    captureCodeAuthoringAuthority,
    codeAuthoringAuthorityIsCurrent,
    installAuthoritativeContent,
    pageId,
    retirePendingCodeImportAuthority,
    windowId,
    t,
  ]);

  // The changes a conflict's Reload set aside (TRIAGE 41; kept by
  // discardLocalAndReload's keepAside), offered when the page opens as Word's
  // Document Recovery pane offers recovered versions: never applied by
  // itself. Open as new page (recommended) writes the copy to a page of its
  // own and changes no one's code; Replace, asked first, puts it over this
  // page's code through the AI edit path, so it can be undone.
  const [recoveredCopies, setRecoveredCopies] = useState<AutoRecoverCopy[]>([]);
  const recoveredCopiesReadRef = useRef<string | null>(null);
  useEffect(() => {
    if (guestMode || autosave.loading || autosave.page?.id !== pageId) return;
    if (recoveredCopiesReadRef.current === pageId) return;
    recoveredCopiesReadRef.current = pageId;
    void listAutoRecoverCopies(pageId).catch(() => [] as AutoRecoverCopy[]).then((copies) => {
      if (recoveredCopiesReadRef.current !== pageId) return;
      setRecoveredCopies(copies.filter((copy) => recoveredCodeOf(copy) !== null));
    });
  }, [autosave.loading, autosave.page?.id, guestMode, pageId]);
  const dropRecoveredCopy = useCallback((copy: AutoRecoverCopy) => {
    void deleteAutoRecoverCopy(pageId, copy.slot);
    setRecoveredCopies((list) => list.filter((entry) => entry.slot !== copy.slot));
  }, [pageId]);
  const openRecoveredCopyAsPage = useCallback(async (copy: AutoRecoverCopy) => {
    const notebookId = autosave.page?.notebook_id;
    const code = recoveredCodeOf(copy);
    if (!notebookId || !code || !windowManagerActions) {
      toast({ title: t("pages.recoveredCopy.restoreFailed"), variant: "destructive" });
      return;
    }
    try {
      // A page of its own: not a file of this page's workspace (its path
      // would name this page's file twice).
      const body: Record<string, unknown> = { ...copy.payload.content };
      delete body[CODE_WORKSPACE_REFERENCE_KEY];
      const created = await createPage(notebookId, {
        title: t("pages.recoveredCopy.newPageTitle", {
          title: copy.payload.title || autosave.page?.title || t("pages.untitled"),
          time: recoveredCopyTime(copy),
        }),
        page_type: "code",
        content_json: body,
      });
      dispatchNotebookPagesChanged(notebookId);
      windowManagerActions.openWindow({
        type: "note",
        title: created.title,
        meta: { notebookId, pageId: created.id, pageType: "code" },
      });
      dropRecoveredCopy(copy);
    } catch {
      toast({ title: t("pages.recoveredCopy.restoreFailed"), variant: "destructive" });
    }
  }, [autosave.page?.notebook_id, autosave.page?.title, dropRecoveredCopy, t, windowManagerActions]);
  const replaceCodeWithRecoveredCopy = useCallback((copy: AutoRecoverCopy) => {
    const code = recoveredCodeOf(copy);
    if (!code) return;
    const proposalId = `autorecover:${pageId}:${copy.slot}`;
    const time = recoveredCopyTime(copy);
    const applied = (event: Event) => {
      const detail = (event as CustomEvent<DocumentEditAppliedDetail>).detail;
      if (detail?.proposalId !== proposalId) return;
      window.removeEventListener(DOCUMENT_EDIT_APPLIED_EVENT, applied);
      if (!detail.ok) {
        toast({ title: t("pages.recoveredCopy.restoreFailed"), variant: "destructive" });
        return;
      }
      dropRecoveredCopy(copy);
      const receipt = detail.receipt;
      toast({
        title: t("pages.recoveredCopy.codeReplaced", { time }),
        ...(receipt?.undoable ? { action: (
          <ToastAction altText={t("pages.recoveredCopy.undo")} data-testid="code-recovered-copy-undo" onClick={() =>
            dispatchDocumentEditUndoRequest({ receiptId: receipt.id, proposalId, targetPageId: pageId, targetWindowId: windowId ?? null })}>
            {t("pages.recoveredCopy.undo")}
          </ToastAction>
        ) } : {}),
      });
    };
    window.addEventListener(DOCUMENT_EDIT_APPLIED_EVENT, applied);
    window.dispatchEvent(new CustomEvent<ApplyDocumentEditCommandDetail>(APPLY_DOCUMENT_EDIT_COMMAND_EVENT, { detail: {
      proposalId, targetPageId: pageId, targetWindowId: windowId ?? null,
      command: { type: MRNOTE_DOCUMENT_COMMAND_TYPE, action_type: "autorecover.replace", source: "user",
        operations: [{ op: "set_code_content", content: code.content, ...(code.language ? { language: code.language } : {}) }] },
    } }));
  }, [dropRecoveredCopy, pageId, t, windowId]);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (
        event as CustomEvent<{
          targetPageId?: string;
          targetWindowId?: string | null;
          respond?: (context: DocumentEditContext) => void;
        }>
      ).detail;
      if (!detail || detail.targetPageId !== pageId) return;
      if (detail.targetWindowId && detail.targetWindowId !== windowId) return;
      const sharedLease = codePageBufferLeaseRef.current;
      if (!detail.targetWindowId && sharedLease && !sharedLease.isOwner()) {
        return;
      }
      detail.respond?.({
        page_type: "code",
        target_page_id: pageId,
        target_window_id: windowId || null,
        selected_text: editorExecutionState.selectedText,
        selected_text_truncated: editorExecutionState.selectedTextTruncated,
        document_text: contentRef.current,
        target_label: language,
        command_context: {
          language,
          current_line: editorExecutionState.currentLine,
        },
      });
    }
    window.addEventListener(DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT, handler);
    return () =>
      window.removeEventListener(DOCUMENT_EDIT_CONTEXT_REQUEST_EVENT, handler);
  }, [editorExecutionState, language, pageId, windowId]);

  const retireLiveInputDerivedAuthority = useCallback(() => {
    debugTimelinePersistenceGenerationRef.current += 1;
    debugTimelineReplayGenerationRef.current += 1;
    crossWindowReferenceRequestIdRef.current += 1;
    crossWindowReferenceAuthorityRef.current = null;
    if (debugTimelineSourceSha256Ref.current !== null) {
      debugTimelineSourceDigestGenerationRef.current += 1;
      debugTimelineSourceSha256Ref.current = null;
      setDebugTimelineSourceSha256(null);
    }
    if (runOutputNavigationAuthorityRef.current !== null) {
      runOutputNavigationAuthorityRef.current = null;
      setRunOutputNavigationAuthority(null);
    }
  }, []);
  // A member typed here: a LaTeX main file whose project this file is in
  // (another window) or this file itself may compile when typing pauses.
  const announceCodeEdit = useCallback(() => {
    notifyCodeWindowEdit({
      notebookId: workspaceNotebookId || undefined,
      pageId,
      path: workspacePathRef.current,
    });
    if (languageRef.current === "latex") noteLatexEdit();
  }, [noteLatexEdit, pageId, workspaceNotebookId]);
  const handleCodeMirrorContentChange = useCallback(
    (next: string, change?: { readonly replayed: boolean }) => {
      if (codeEditorReadOnly || !codeMayAuthorRef.current) return;
      if (!acceptCodeSourceLength(next)) return;
      // Text the view already holds is no edit (see applySharedBufferText,
      // which has dismissed the receipt already for a real keystroke).
      if (next !== contentRef.current) dismissCodeImportReceipt();
      if (testRunError !== null) setTestRunError(null);
      // A peer's keystroke reaches this view before its frame paints. Its
      // derived authority still retires at once (the refs), but the window
      // render that follows waits behind that frame.
      if (change?.replayed) startTransition(retireLiveInputDerivedAuthority);
      else retireLiveInputDerivedAuthority();
      scheduleContentRender(next);
      // The Y.Text observer has already published this exact CM transaction
      // through the page's single writer. Re-serializing it here would create
      // a second full-document generation.
      if (!codePageBufferLeaseRef.current) {
        persist(languageRef.current, next);
      }
      announceCodeEdit();
    },
    [
      acceptCodeSourceLength,
      announceCodeEdit,
      codeEditorReadOnly,
      dismissCodeImportReceipt,
      persist,
      retireLiveInputDerivedAuthority,
      scheduleContentRender,
      testRunError,
    ],
  );
  const handleTextareaContentChange = useCallback(
    (next: string) => {
      if (codeEditorReadOnly || !codeMayAuthorRef.current) return;
      if (!acceptCodeSourceLength(next)) return;
      dismissCodeImportReceipt();
      if (testRunError !== null) setTestRunError(null);
      retireLiveInputDerivedAuthority();
      installAuthoritativeContent(next);
      const lease = codePageBufferLeaseRef.current;
      if (lease) {
        lease.publishTextareaText(next);
      } else {
        persist(languageRef.current, next);
      }
      announceCodeEdit();
    },
    [
      acceptCodeSourceLength,
      announceCodeEdit,
      codeEditorReadOnly,
      dismissCodeImportReceipt,
      installAuthoritativeContent,
      persist,
      retireLiveInputDerivedAuthority,
      testRunError,
    ],
  );

  // In guest mode we bypassed the autosave hook (enabled=false), so
  // autosave.page is always null and autosave.loading is always false.
  // Skip the guard and render directly from the seeded React state.
  // A load that FAILED is not a load still in progress. This early return fires
  // on `!autosave.page`, and the error banner lives far below it, so the
  // already-translated "Page load failed" could never be reached: a 5xx left
  // the window on "Loading…" for good, indistinguishable from a slow network
  // and with nothing to press.
  if (!guestMode && !autosave.loading && !autosave.page && autosave.error) {
    return (
      // The windows' shared notice banner, with its retry at the end.
      <div
        data-testid="code-load-error"
        role="alert"
        className="page-save-conflict-banner"
      >
        <CircleAlert size={16} aria-hidden="true" />
        <div className="page-save-conflict-banner__copy">
          <strong>{t("pages.pageLoadFailed")}</strong>
        </div>
        <div className="page-save-conflict-banner__actions">
          <button
            type="button"
            data-testid="code-load-retry"
            onClick={() => void autosave.reload()}
            className="office-ribbon-control note-editor-office-toolbar__button"
            data-office-control-part="button"
          >
            <RotateCcw size={13} aria-hidden="true" />
            {t("code.loadRetry")}
          </button>
        </div>
      </div>
    );
  }

  if (
    !guestMode &&
    (autosave.loading || !autosave.page || hydratedPageId !== pageId)
  ) {
    return (
      <EditorLoadingState
        kind="code"
        label={t("common.loadingCode")}
        className={styles.codeWindow}
        testId="code-editor-loading"
      />
    );
  }

  // A binary workspace file holds no source to edit: its window previews the
  // attachment, read-only. Every hook above has run, so the order holds.
  if (!guestMode && binaryAsset) {
    return (
      <CodeBinaryFilePreview
        key={binaryAsset.attachmentId}
        asset={binaryAsset}
        path={workspacePath}
      />
    );
  }

  const toolbarTabs: Array<{ id: CodeToolbarTab; label: string }> = [{ id: "home", label: t("toolbar.ribbonHome") }];
  const sourceFileLabel = workspacePath;
  const saveStatusLabel = draftReview
    ? draftReview.statusLabel
    : guestMode
    ? guestSaveRejected
      ? t("guestGate.save.title")
      : t("pages.unsaved")
    : effectiveSaveState.saveStatus === "saving"
      ? t("code.saving")
      : !effectiveSaveState.hasConflict && effectiveSaveState.syncedToServer
        ? t("pages.synced")
        : effectiveSaveState.hasConflict || effectiveSaveState.isDirty
          ? t("pages.unsaved")
          : t("pages.saved");
  const saveStatusState = guestMode
    ? "guest"
    : effectiveSaveState.saveStatus === "saving"
      ? "saving"
      : !effectiveSaveState.hasConflict && effectiveSaveState.syncedToServer
        ? "synced"
        : effectiveSaveState.hasConflict || effectiveSaveState.isDirty
          ? "dirty"
          : "saved";
  const runTimelineSourceFingerprint = contentSnapshotPending
    ? null
    : codePageRunSourceFingerprint(content);
  const runTimelineScopeLabel = (entry: PersistedCodeRunTimelineEntry) => {
    const selection = entry.navigation.selection;
    if (!selection) return t("code.runFile");
    return selection.kind === "line"
      ? t("code.runLine", { line: selection.lineFrom })
      : t("code.runSelection");
  };
  const runProfileScopeLabel = (profile: PersistedCodeRunProfile) => {
    const selection = profile.navigation.selection;
    if (!selection) return t("code.runFile");
    return selection.kind === "line"
      ? t("code.runLine", { line: selection.lineFrom })
      : t("code.runSelection");
  };
  const currentExecutionProviderId =
    executionCapability.status === "available"
      ? executionCapability.providerId
      : null;
  const selectedRunTimelineEntry =
    selectedRunTimelineIndex === null
      ? null
      : (runTimeline[selectedRunTimelineIndex] ?? null);
  const selectedRunProfileReplacesExisting = Boolean(
    selectedRunTimelineEntry &&
      runProfiles.some((profile) =>
        codePageRunProfilesShareSlot(profile, selectedRunTimelineEntry),
      ),
  );
  const runProfileCapacityReached =
    runProfiles.length >= CODE_PAGE_RUN_PROFILE_LIMIT &&
    !selectedRunProfileReplacesExisting;
  const selectedRunTimelineCanSave = Boolean(
    selectedRunTimelineEntry &&
      !contentSnapshotPending &&
      currentExecutionProviderId === selectedRunTimelineEntry.providerId &&
      selectedRunTimelineEntry.language === language &&
      selectedRunTimelineEntry.navigation.sourceFingerprint ===
        runTimelineSourceFingerprint &&
      codePageRunInputIdentityIsCurrent(
        selectedRunTimelineEntry.input,
        stdinSha256,
        stdinByteCount,
      ) &&
      (selectedRunTimelineEntry.navigation.selection === null ||
        (partialExecutionAvailable &&
          selectedRunTimelineEntry.navigation.selection.rangeCount === 1)) &&
      !runProfileCapacityReached,
  );
  const runHistoryReplayBlocked =
    guestMode ||
    pageBusy ||
    remotePageBusy ||
    debugState.running ||
    executionCapability.status !== "available" ||
    (executionCapability.mode === "remote" && !codeMayAuthor);
  const runHistoryMutationBlocked =
    guestMode ||
    !codeMayAuthor ||
    pageBusy ||
    remotePageBusy ||
    debugState.running;
  const compileFailedMessage = t(
    languageExecutionErrorMessageKey("compile-failed"),
  );
  const runErrorIsCompileFailure = Boolean(
    output?.error &&
      (output.executionErrorCode === "compile-failed" ||
        output.error === compileFailedMessage ||
        output.error.startsWith(`${compileFailedMessage}\n`)),
  );
  const displayedOutput = executionOutputForDisplay(
    output ?? { logs: [] },
    t,
  );
  // A successful compile restored from the page (or reselected from the run
  // history) brings back its log, whose first line names main.pdf, but not
  // the document itself: say so instead of leaving an empty space.
  const compiledDocumentNotKept =
    language === "latex" &&
    output !== null &&
    !output.error &&
    !isSameCompiledOutput(compiledDocument?.output ?? null, output) &&
    output.logs.some((line) => line.startsWith("main.pdf: "));
  const visibleRunError = displayedOutput.error?.trim()
    ? displayedOutput.error.trim().slice(0, CODE_RUN_ERROR_AI_MAX_CHARS)
    : null;
  const visibleRunErrorAuthority = persistedOutputAuthorityRef.current;
  const runErrorAiMatchesCurrent = Boolean(
    visibleRunError &&
      output &&
      !contentSnapshotPending &&
      pageIdRef.current === pageId &&
      visibleRunErrorAuthority?.output === output &&
      visibleRunErrorAuthority.language === language &&
      visibleRunErrorAuthority.source === content &&
      visibleRunErrorAuthority.source === contentRef.current,
  );
  const runErrorAiLabel = t("code.runErrorAssist.action");
  const runErrorAiDisabledReason = !codeMayAuthor
    ? t("ai.readOnlyLock")
    : guestMode || !workspaceNotebookId || !windowManagerActions
      ? t("code.runErrorAssist.savedPageOnly")
      : pageExecution !== null
        ? t("code.commandDisabled.pageRunning")
        : !runErrorAiMatchesCurrent
          ? t("code.runErrorAssist.stale")
          : undefined;
  const runErrorAiAccessibleLabel = codeCommandAccessibleLabel(
    {
      disabled: Boolean(runErrorAiDisabledReason),
      disabledReason: runErrorAiDisabledReason,
      label: runErrorAiLabel,
    },
  );
  const visibleRunErrorAiFailure =
    runErrorAiFailure?.output === output && runErrorAiMatchesCurrent
      ? runErrorAiFailure.message
      : null;
  const askAiAboutCurrentRunError = () => {
    const authoringGeneration = captureCodeAuthoringAuthority();
    const livePageId = pageIdRef.current;
    const liveOutput = outputRef.current;
    const authority = persistedOutputAuthorityRef.current;
    if (
      authoringGeneration === null ||
      guestMode ||
      !windowManagerActions ||
      !workspaceNotebookId ||
      livePageId !== pageId ||
      getPageExecutionState(livePageId) !== null ||
      !liveOutput ||
      authority?.output !== liveOutput ||
      authority.language !== languageRef.current ||
      authority.source !== contentRef.current ||
      !codeAuthoringAuthorityIsCurrent(authoringGeneration)
    ) {
      return;
    }
    const liveError = executionOutputForDisplay(liveOutput, t).error
      ?.trim()
      .slice(0, CODE_RUN_ERROR_AI_MAX_CHARS);
    if (!liveError) return;
    const accepted = requestReviewOnlyChatPrefill({
      notebookId: workspaceNotebookId,
      pageId: livePageId,
      executionMode: "review_changes",
      text: `${t("code.runErrorAssist.prompt")}\n\n${t("code.problems.severity.error")}:\n${liveError}`,
    });
    if (!accepted) {
      setRunErrorAiFailure({
        output: liveOutput,
        message: t("document.capability.unavailable"),
      });
      return;
    }
    setRunErrorAiFailure(null);
    windowManagerActions.openWindow({
      type: "ai_panel",
      title: `AI · ${workspacePathRef.current}`,
      meta: {
        pageId: livePageId,
        notebookId: workspaceNotebookId,
        pageType: "code",
      },
    });
  };
  // "Let AI rewrite it to run in the page": the guard's reasons and the
  // source go to the Agent panel as a review-only draft, like Explain and
  // suggest fix. A draft under review or a signed-out window has no
  // notebook to ask in (the run-error AI is refused there the same way).
  const runtimeGuardRewriteDisabledReason = !codeMayAuthor
    ? t("ai.readOnlyLock")
    : guestMode || !workspaceNotebookId || !windowManagerActions
      ? t("code.runErrorAssist.savedPageOnly")
      : runtimeGuard && runtimeGuard.source !== content && runtimeGuard.source !== contentRef.current
        ? t("code.runErrorAssist.stale")
        : undefined;
  const askAiToRewriteForThePage = () => {
    const guard = runtimeGuard;
    const livePageId = pageIdRef.current;
    if (
      !guard ||
      guestMode ||
      !windowManagerActions ||
      !workspaceNotebookId ||
      livePageId !== pageId ||
      guard.language !== languageRef.current
    ) {
      return;
    }
    const accepted = requestReviewOnlyChatPrefill({
      notebookId: workspaceNotebookId,
      pageId: livePageId,
      executionMode: "review_changes",
      text: `${t("code.runtimeGuard.prompt")}\n\n${guard.output.error ?? ""}`.slice(
        0,
        CODE_RUN_ERROR_AI_MAX_CHARS,
      ),
    });
    if (!accepted) {
      setRunErrorAiFailure({
        output: guard.output,
        message: t("document.capability.unavailable"),
      });
      return;
    }
    windowManagerActions.openWindow({
      type: "ai_panel",
      title: `AI · ${workspacePathRef.current}`,
      meta: {
        pageId: livePageId,
        notebookId: workspaceNotebookId,
        pageType: "code",
      },
    });
  };
  const tracebackNavigationEnabled =
    !contentSnapshotPending &&
    runOutputNavigationAuthority?.output === output &&
    runOutputNavigationAuthority.pageId === pageId &&
    runOutputNavigationAuthority.language === language &&
    runOutputNavigationAuthority.source === content &&
    (!lastRunScope ||
      lastRunScope.rangeCount === 1 ||
      Boolean(lastRunScope.lineMappings?.length));
  const runCapabilityStatusLabel = runOrPreviewAvailable
    ? null
    : executionCapability.status === "checking"
      ? t("code.loading")
      : executionCapability.status === "non-executable"
        ? t("code.notRunnableHint")
        : executionCapability.status === "available"
          ? executionCapability.mode === "remote" && !codeMayAuthor
            ? t("document.capability.unavailable")
            : t("document.capability.unavailable")
          : runtimeUnavailableHint;
  const runCapabilityTitle = runnable
    ? language === "latex"
      ? `${t("code.latexCompile")} (${LATEX_COMPILE_SHORTCUTS_LABEL})`
      : `${t("code.runFile")} (Ctrl/Cmd+Enter)`
    : htmlPreviewRunnable
      ? `${t("code.htmlPreviewHint")} (Ctrl/Cmd+Enter)`
    : executionCapability.status === "unavailable"
      ? // The hint already says the run is unavailable and why; the generic
        // "not available here" ahead of it only repeated it.
        runtimeUnavailableHint
      : (runCapabilityStatusLabel ?? t("document.capability.unavailable"));
  const runFileDisabledReason =
    pageExecution?.kind === "debug" || debugState.running
      ? t("code.runBlockedByDebug")
      : pageBusy || remotePageBusy
        ? t("code.commandDisabled.pageRunning")
        : !runOrPreviewAvailable
          ? runCapabilityTitle
          : stdinOverLimit
            ? t("code.stdinExecutionTooLarge")
            : undefined;
  const codeReadOnlyCommandReason = t("code.commandDisabled.readOnly");
  const languageSelectorDisabled =
    !codeMayAuthor || pageExecution !== null;
  const languageSelectorDisabledReason = !codeMayAuthor
    ? codeReadOnlyCommandReason
    : pageExecution !== null
      ? t("code.commandDisabled.pageRunning")
      : undefined;
  const languageSelectorAccessibleLabel = codeCommandAccessibleLabel({
    disabled: languageSelectorDisabled,
    disabledReason: languageSelectorDisabledReason,
    label: t("code.languageLabel"),
  });
  // Whether a language can run at all was only ever stated on the Run tab, and
  // a new page opens on Home. The selector itself now says it, so the choice is
  // made with the answer in view rather than found afterwards.
  const saveDisabled = guestMode ? !onGuestSaveRequest : !codeMayAuthor;
  const saveDisabledReason = draftReview
    ? draftReview.readOnlyReason
    : guestMode && !onGuestSaveRequest
    ? t("guestGate.save.title")
    : !codeMayAuthor
      ? codeReadOnlyCommandReason
      : undefined;
  const saveAccessibleLabel = codeCommandAccessibleLabel({
    disabled: saveDisabled,
    disabledReason: saveDisabledReason,
    label: t("pages.save"),
  });
  const codeImportDisabled = codeImportBlocked || !codeMayAuthor;
  const codeImportDisabledReason = !codeMayAuthor
    ? codeReadOnlyCommandReason
    : pageExecution !== null
      ? t("code.commandDisabled.pageRunning")
      : codeImporting
        ? t("code.commandDisabled.importInProgress")
        : undefined;
  const codeImportAccessibleLabel = codeCommandAccessibleLabel({
    disabled: codeImportDisabled,
    disabledReason: codeImportDisabledReason,
    label: t("editor.import"),
  });
  const codeImportUndoAccessibleLabel = codeCommandAccessibleLabel({
    disabled: codeImportDisabled,
    disabledReason: codeImportDisabledReason,
    label: t("toolbar.undo"),
  });
  const versionHistoryDisabledReason = draftReview
    ? draftReview.readOnlyReason
    : guestMode
    ? t("guestGate.save.title")
    : undefined;
  const versionHistoryAccessibleLabel = codeCommandAccessibleLabel({
    disabled: guestMode,
    disabledReason: versionHistoryDisabledReason,
    label: t("toolbar.versionHistory"),
  });
  const fileIdentityDisabledReason = !codeMayAuthor
    ? codeReadOnlyCommandReason
    : undefined;
  const fileRenameAccessibleLabel = codeCommandAccessibleLabel({
    disabled: !codeMayAuthor,
    disabledReason: fileIdentityDisabledReason,
    label: t("code.rename.submit"),
  });
  const fileEncodingAccessibleLabel = codeCommandAccessibleLabel({
    disabled: !codeMayAuthor,
    disabledReason: fileIdentityDisabledReason,
    label: codeSourceEncodingLabel(sourceEncoding),
  });
  const codeCopilotDisabledReason = codeCopilotReadOnly
    ? t("ai.readOnlyLock")
    : undefined;
  const codeCopilotAccessibleLabel = codeCommandAccessibleLabel({
    disabled: codeCopilotReadOnly,
    disabledReason: codeCopilotDisabledReason,
    label: t("ai.title"),
  });
  const editUndoDisabledReason = !codeMayAuthor
    ? codeReadOnlyCommandReason
    : !editorEditState.canUndo
      ? t("code.commandDisabled.noUndoHistory")
      : undefined;
  const editRedoDisabledReason = !codeMayAuthor
    ? codeReadOnlyCommandReason
    : !editorEditState.canRedo
      ? t("code.commandDisabled.noRedoHistory")
      : undefined;
  const hasCurrentOutput = Boolean(output);
  const clearOutputDisabled = !hasCurrentOutput || outputClearBlocked;
  const quickRunDisabled = pageBusy
    ? !activeExecutionCanCancel
    : runCommandDisabled;
  const outputSearchDisabledReason = !hasCurrentOutput
    ? t("code.commandDisabled.noOutput")
    : displayedOutput.logs.length === 0
      ? t("code.commandDisabled.noSearchableLogText")
      : undefined;
  const outputSearchAccessibleLabel = codeCommandAccessibleLabel({
    disabled: outputSearchDisabledReason !== undefined,
    disabledReason: outputSearchDisabledReason,
    label: t("code.find.findPlaceholder"),
  });
  const outputWrapDisabledReason = !hasCurrentOutput
    ? t("code.commandDisabled.noOutput")
    : !outputWrapAvailable
      ? t("code.commandDisabled.noWrappableLogText")
      : undefined;
  const outputWrapAccessibleLabel = codeCommandAccessibleLabel({
    disabled: outputWrapDisabledReason !== undefined,
    disabledReason: outputWrapDisabledReason,
    label: t("code.palette.cmd.toggleWordWrap"),
  });
  const sourceDownloadDisabledReason = downloadUnavailable
    ? t("toolbar.exportFailed", { format: t("code.download") })
    : undefined;
  const sourceDownloadAccessibleLabel = codeCommandAccessibleLabel({
    disabled: downloadUnavailable,
    disabledReason: sourceDownloadDisabledReason,
    label: t("code.download"),
  });
  // The export menu's badges: the source file's own extension, and the
  // output's file kind (a plain text log, or the JSON artifact a rich output
  // needs).
  const sourceExportBasename = codeWorkspaceBasename(sourceFileLabel);
  const sourceExportBadge = sourceExportBasename.includes(".")
    ? (sourceExportBasename.split(".").pop() || "txt").toUpperCase()
    : "TXT";
  const outputExportBadge =
    output && runOutputNeedsArtifact(output) ? "JSON" : "TXT";
  const outputDownloadDisabledReason = !outputHasContent
    ? t("code.commandDisabled.noOutput")
    : downloadUnavailable
      ? t("toolbar.exportFailed", { format: t("code.download") })
      : undefined;
  const outputDownloadAccessibleLabel = codeCommandAccessibleLabel({
    disabled: outputDownloadDisabledReason !== undefined,
    disabledReason: outputDownloadDisabledReason,
    label: t("code.download"),
  });
  const runReceiptAvailable = selectedRunTimelineEntry?.output != null;
  const runReceiptDisabled = !runReceiptAvailable || downloadUnavailable;
  const runReceiptDisabledReason = !runReceiptAvailable
    ? t("code.commandDisabled.noRunReceipt")
    : downloadUnavailable
      ? t("toolbar.exportFailed", { format: t("code.exportRunArtifact") })
      : undefined;
  const runReceiptAccessibleLabel = codeCommandAccessibleLabel({
    disabled: runReceiptDisabled,
    disabledReason: runReceiptDisabledReason,
    label: t("code.exportRunArtifact"),
  });
  const clearOutputDisabledReason = !hasCurrentOutput
    ? t("code.commandDisabled.noOutput")
    : outputClearBlocked
      ? t("code.commandDisabled.outputBusy")
      : undefined;
  const clearOutputAccessibleLabel = codeCommandAccessibleLabel({
    disabled: clearOutputDisabled,
    disabledReason: clearOutputDisabledReason,
    label: t("codeOutput.clearOutputs"),
  });
  const liveRefactorTargets = captureCodeRefactorTargets();
  const refactorPreviewCurrent = Boolean(
    refactorPreviewPlan &&
      codeRefactorPreviewPlanIsCurrent(
        refactorPreviewPlan,
        liveRefactorTargets,
      ),
  );
  const refactorUndoCurrent = Boolean(
    refactorUndoReceipt &&
      codeRefactorUndoReceiptIsCurrent(
        refactorUndoReceipt,
        liveRefactorTargets,
      ),
  );

  return (
    // The Docs dialog and task-pane chrome in the code ribbon's tone, for
    // every shell dialog and docked pane the window renders.
    <OfficeDialogChromeProvider tone="code">
    <OfficeTaskPaneChromeProvider tone="code">
    <div
      ref={codeWindowRef}
      // office-surface-enter: the Docs content reveal once the loading state
      // resolves (this root mounts only then); still under reduced motion.
      className={`code-window office-surface-enter ${styles.codeWindow}`}
      data-testid="code-window"
      // Its page's content is in (an embedded editor's Automation API waits
      // for it: lib/embed/code-window-wait).
      data-code-hydrated={pageHydrated ? "" : undefined}
      // ...and its editor takes typing (its shared buffer is bound): what
      // an embedded edit session's ready and its Automation API writes wait for.
      data-code-writable={pageHydrated && !codeEditorReadOnly ? "" : undefined}
      // Hand-built Cupertino menus inside take the Docs menu motion.
      data-office-menu-scope=""
      {...{ [OFFICE_PAGE_ID_ATTRIBUTE]: pageId }}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
      onDragEnter={handleCodeFileDragEnter}
      onDragOver={handleCodeFileDragOver}
      onDragLeave={handleCodeFileDragLeave}
      onDrop={handleCodeFileDrop}
      onKeyDownCapture={(event) => {
        const compositionKey = {
          isComposing: event.nativeEvent.isComposing,
          keyCode: event.nativeEvent.keyCode,
        };
        // React capture runs before CodeMirror's own composition guard. Let the
        // browser/IME own candidate-selection keys completely: no debugger,
        // workspace-panel command, preventDefault, or propagation stop.
        if (isImeCompositionKey(compositionKey)) return;
        const shortcutTarget = event.target;
        const shortcutTargetTestId =
          shortcutTarget instanceof Element
            ? shortcutTarget.getAttribute("data-testid")
            : null;
        const shortcutTargetsCodeEditor =
          shortcutTarget instanceof Element &&
          (shortcutTarget.closest(".cm-content") !== null ||
            (shortcutTarget instanceof HTMLTextAreaElement &&
              (shortcutTargetTestId === "code-editor" ||
                shortcutTargetTestId === "code-editor-secondary")));
        if (
          event.key === "Enter" &&
          event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          runSelectionCommandDisabled &&
          shortcutTargetsCodeEditor
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        // VS Code's terminal chord (Ctrl/Cmd+`) opens the interactive console.
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key === "`" &&
          interactiveConsoleAvailable
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) toggleConsole();
          return;
        }
        const outputPanelShortcut = resolveRunOutputPanelShortcut({
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          repeat: event.repeat,
          ...compositionKey,
        });
        if (outputPanelShortcut && output) {
          event.preventDefault();
          event.stopPropagation();
          if (outputPanelShortcut === "consume") return;
          if (outputPanelVisible) {
            hideOutputPanel();
          } else {
            updateOutputPanelVisibility(true);
          }
          return;
        }
        const debugShortcut = resolveCodeDebugShortcut(
          {
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            repeat: event.repeat,
            ...compositionKey,
          },
          debugState,
          runningRef.current,
        );
        if (debugShortcut) {
          event.preventDefault();
          event.stopPropagation();
          if (debugShortcut === "consume") return;
          if (debugShortcut === "interruptRun") {
            interruptRun();
            return;
          }
          void 0;
          requestDebugCommand(debugShortcut);
          return;
        }
        if (
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          (event.key === "M" || event.key === "m")
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (workspaceProblemsOpen) {
            closeWorkspaceProblems();
          } else {
            openWorkspaceProblems();
          }
          return;
        }
      }}
      onKeyDown={(event) => {
        if (
          isImeCompositionKey({
            isComposing: event.nativeEvent.isComposing,
            keyCode: event.nativeEvent.keyCode,
          })
        ) {
          return;
        }
        // Cmd/Ctrl+Shift+S → Save As / download. Reuse the exact same bounded
        // export path as the Docs-style ribbon and file menu so the current
        // filename, source encoding, BOM, and CRLF/LF metadata stay faithful.
        if (
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          !event.altKey &&
          (event.key === "S" || event.key === "s")
        ) {
          event.preventDefault();
          if (event.repeat) return;
          selectToolbarTab("home");
          downloadSourceFile();
          return;
        }
        // Cmd/Ctrl+O → local source-file picker. Keep this at the window layer
        // so both CodeMirror and the textarea fallback share the same bounded
        // import path, and swallow repeats so holding the chord cannot queue
        // multiple native dialogs.
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          (event.key === "O" || event.key === "o")
        ) {
          event.preventDefault();
          if (event.repeat || codeImportDispatchBlocked()) return;
          selectToolbarTab("home");
          codeImportInputRef.current?.click();
          return;
        }
        // Cmd/Ctrl+P → Quick Open across code/multi-buffer host pages already authorized
        // by this notebook. It never reads arbitrary host files.
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          (event.key === "P" || event.key === "p")
        ) {
          event.preventDefault();
          openQuickOpen();
          return;
        }
        // Cmd/Ctrl+Shift+F → cross-window Find in Files.
        if (
          (event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          (event.key === "F" || event.key === "f")
        ) {
          event.preventDefault();
          openFindInFiles();
        }
      }}
    >
      <style>{`
        .mrnote-code-problem-row:hover:not(:disabled) {
          background: color-mix(in srgb, var(--brand-v2, #0D9488) 7%, transparent) !important;
        }
        .mrnote-code-problem-row:focus-visible {
          outline: 2px solid var(--brand-v2, #0D9488);
          outline-offset: -2px;
        }
        .mrnote-code-fif-hit:hover {
          background: color-mix(in srgb, var(--brand-v2, #0D9488) 8%, transparent) !important;
        }
        .mrnote-code-fif-hit:focus-visible {
          outline: 2px solid var(--brand-v2, #0D9488);
          outline-offset: -2px;
        }
        .mrnote-code-quick-open-option:hover,
        .mrnote-code-quick-open-option[data-active="true"] {
          background: color-mix(in srgb, var(--brand-v2, #0D9488) 10%, transparent) !important;
        }
        .mrnote-code-quick-open-option:focus-visible {
          outline: 2px solid var(--brand-v2, #0D9488);
          outline-offset: -2px;
        }
        .mrnote-code-workspace-row:hover {
          background: color-mix(in srgb, var(--brand-v2, #0D9488) 8%, transparent) !important;
        }
        .mrnote-code-workspace-row:focus-visible {
          outline: 2px solid var(--brand-v2, #0D9488);
          outline-offset: -2px;
        }
      `}</style>
      {codeImportDragActive ? (
        <OfficeFileDropOverlay
          label={t("pages.importDropActive")}
          testId="code-import-drop-overlay"
          style={{ zIndex: 80 }}
        />
      ) : null}
      <div
        className="note-editor-office-toolbar office-ribbon-skin"
        data-testid="code-toolbar"
        data-docs-ribbon-contract="true"
        data-office-authoring-ribbon="true"
        role="toolbar"
        aria-label={t("code.editorAriaLabel")}
        style={{ flex: "0 0 auto" }}
      >
        <OfficeRibbonTabs
          activeTab={toolbarTab}
          listLabel={t("code.editorAriaLabel")}
          listTestId="code-toolbar-tabs"
          onSelect={selectToolbarTab}
          panelId={`code-toolbar-panel-${toolbarTab}`}
          tabs={toolbarTabs.map((tab) => ({
            key: tab.id,
            label: tab.label,
          }))}
          tabTestId={(tab) => `code-toolbar-tab-${tab}`}
          testIdPrefix="code"
          trailing={
            <CodeRibbonQuickActions
              canUndo={codeMayAuthor && editorEditState.canUndo}
              canRedo={codeMayAuthor && editorEditState.canRedo}
              onUndo={() => requestEditorEditCommand("undo")}
              onRedo={() => requestEditorEditCommand("redo")}
              undoLabel={t("toolbar.undo")}
              redoLabel={t("toolbar.redo")}
              overflowLabel={t("toolbar.quickOverflow")}
              actionRail={{
                // Export stands in the row ahead of everything, as in every
                // editor's title bar: the same rail face, and the same
                // described menu (a file glyph, the plain name, one line on
                // what the file holds, the extension badge).
                leading: (
                  <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <OfficeRailButton
                        menu
                        label={t("code.exportMenu.heading")}
                        icon={<OfficeSemanticIcon semanticId="file.export" size={18} />}
                        testId="code-export-menu"
                      />
                    </DropdownMenuTrigger>
                    <RibbonDropdownMenuContent
                      align="end"
                      className="note-editor-toolbar-menu note-editor-export-menu docs-cupertino-menu--described"
                      data-testid="code-export-menu-content"
                      onCloseAutoFocus={(event) => event.preventDefault()}
                    >
                      <DropdownMenuLabel className="docs-cupertino-menu__heading">
                        {t("code.exportMenu.heading")}
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="docs-cupertino-menu__rich-item"
                        onSelect={downloadSourceFile}
                        disabled={downloadUnavailable}
                        data-testid="code-download"
                        aria-keyshortcuts="Control+Shift+S Meta+Shift+S"
                        title={
                          sourceDownloadDisabledReason
                            ? sourceDownloadAccessibleLabel
                            : (downloadError ?? t("code.download"))
                        }
                        aria-label={sourceDownloadAccessibleLabel}
                        data-disabled-reason={sourceDownloadDisabledReason}
                      >
                        <RibbonMenuRichRow
                          fileType="code"
                          title={t("code.exportMenu.sourceTitle")}
                          detail={
                            sourceDownloadDisabledReason ??
                            `${sourceFileLabel} · ${t("code.exportMenu.sourceDetail")}`
                          }
                          blocked={sourceDownloadDisabledReason !== undefined}
                          badge={sourceExportBadge}
                        />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="docs-cupertino-menu__rich-item"
                        onSelect={downloadOutput}
                        disabled={outputDownloadDisabledReason !== undefined}
                        data-testid="code-export-output"
                        title={outputDownloadAccessibleLabel}
                        aria-label={outputDownloadAccessibleLabel}
                        data-disabled-reason={outputDownloadDisabledReason}
                      >
                        <RibbonMenuRichRow
                          fileType="text"
                          hoverScene
                          title={t("code.exportMenu.outputTitle")}
                          detail={
                            outputDownloadDisabledReason ??
                            t("code.exportMenu.outputDetail")
                          }
                          blocked={outputDownloadDisabledReason !== undefined}
                          badge={outputExportBadge}
                        />
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="docs-cupertino-menu__rich-item"
                        onSelect={() => {
                          downloadSelectedRunArtifact();
                        }}
                        disabled={runReceiptDisabled}
                        data-testid="code-export-run-receipt"
                        title={runReceiptAccessibleLabel}
                        aria-label={runReceiptAccessibleLabel}
                        data-disabled-reason={runReceiptDisabledReason}
                      >
                        <RibbonMenuRichRow
                          fileType="code"
                          title={t("code.exportMenu.receiptTitle")}
                          detail={
                            runReceiptDisabledReason ??
                            t("code.exportMenu.receiptDetail")
                          }
                          blocked={runReceiptDisabled}
                          badge="JSON"
                        />
                      </DropdownMenuItem>
                    </RibbonDropdownMenuContent>
                  </DropdownMenu>
                  {/* Version history in the title bar, as every editor's
                      (the File-like commands stand ahead of undo). */}
                  <OfficeRailButton
                    label={t("toolbar.versionHistory")}
                    icon={<OfficeSemanticIcon semanticId="file.versionHistory" size={18} />}
                    pressed={versionHistoryOpen}
                    onClick={() => void import("@mrnote/core/host/desktop-app.ts").then((module) => module.noteDesktopFeature("Version History"))}
                    testId="code-ribbon-version-history"
                  />
                  </>
                ),
                // The title bar's Search: the code editor's own command
                // palette lists and runs its commands. It opens with the
                // palette's chord, ⇧⌘P / Ctrl+Shift+P, so the button names
                // that one rather than the other editors' Alt+Q.
                search: {
                  label: withOfficeCommandSearchShortcut(
                    t("toolbar.commandSearchOpen"),
                    isMacPlatform(),
                    isMacPlatform() ? "⇧⌘P" : "Ctrl+Shift+P",
                  ),
                  onClick: () => requestEditorViewCommand("openCommandPalette"),
                  testId: "code-command-search-open",
                  keyShortcuts: isMacPlatform() ? "Meta+Shift+P" : "Control+Shift+P",
                },
                save: {
                  status: effectiveSaveState.hasConflict ? "conflict" : saveStatusState,
                  statusLabel: saveStatusLabel,
                  actionLabel: t("pages.save"),
                  autosave: officeAutosaveLabels(t),
                  actionAriaLabel: saveAccessibleLabel,
                  onSave: requestVisibleSave,
                  disabled: saveDisabled,
                  disabledReason: saveDisabledReason,
                  actionTestId: "code-save",
                  statusTestId: "code-save-status",
                },
                ai: CODE_COPILOT_V1_ENABLED ? {
                  label: t("ai.title"),
                  // a signed-out visitor's AI asks for an account (the host's gate)
                  onClick: () => (guestMode ? onGuestAiRequest?.() : startCodeCopilotPick()),
                  disabled: guestMode ? !onGuestAiRequest : codeCopilotReadOnly,
                  disabledReason: draftReview
                    ? draftReview.readOnlyReason
                    : guestMode
                      ? undefined
                      : codeCopilotDisabledReason,
                  title: codeCopilotAccessibleLabel,
                  expanded: copilotOpen,
                  testId: "code-copilot-toggle",
                } : undefined,
                // No Run in an embed session that may not run code.
                primary: undefined,
                // LaTeX: Overleaf's Recompile menu (the compiler, Recompile
                // from scratch) right after Run, and its arrow to the PDF.
                trailing: latexCompilerState ? (
                  <>
                    {latexCompilingSince !== null ? (
                      <OfficeRailStatus
                        label={<LatexCompilingLabel startedAt={latexCompilingSince} />}
                        testId="code-latex-compiling"
                      />
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <OfficeRailButton
                          menu
                          label={t("codeOutput.latex.compileOptions")}
                          title={`${t("codeOutput.latex.compileOptions")}: ${
                            latexCompilerState.choice
                              ? latexCompilerLabel(latexCompilerState.choice, t)
                              : latexCompilerState.program
                          }`}
                          icon={<OfficeSemanticIcon semanticId="app.sliders" size={18} />}
                          testId="code-latex-compile-menu"
                        />
                      </DropdownMenuTrigger>
                      <RibbonDropdownMenuContent
                        align="end"
                        className="note-editor-toolbar-menu"
                        data-testid="code-latex-compile-menu-content"
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                        <LatexCompileMenuItems
                          autoCompile={latexAutoCompile}
                          onAutoCompileChange={setLatexAutoCompileEnabled}
                          draftMode={latexDraftMode}
                          onDraftModeChange={changeLatexDraftMode}
                          figureCache={latexFigureCache}
                          onFigureCacheChange={changeLatexFigureCache}
                          choice={latexCompilerState.choice}
                          program={latexCompilerState.program}
                          onChoose={chooseLatexCompiler}
                          chooseDisabledReason={
                            codeMayAuthor ? undefined : codeReadOnlyCommandReason
                          }
                          modeDisabledReason={draftReview?.readOnlyReason}
                          onRecompileFromScratch={recompileLatexFromScratch}
                          recompileDisabledReason={
                            runCommandDisabled
                              ? (runFileDisabledReason ?? t("document.capability.unavailable"))
                              : undefined
                          }
                          testIdPrefix="code-latex-rail"
                        />
                      </RibbonDropdownMenuContent>
                    </DropdownMenu>
                    <OfficeRailButton
                      label={t("codeOutput.latex.goToPdf")}
                      title={t("codeOutput.latex.goToPdfHint")}
                      icon={<OfficeSemanticIcon semanticId="nav.arrow.right" size={18} />}
                      onClick={() => void goToPdfLocation()}
                      testId="code-latex-go-to-pdf"
                    />
                  </>
                ) : undefined,
              }}
            >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <CodeRibbonMenuAction
                  className="note-editor-office-toolbar__menu-trigger"
                  displayLabel={sourceFileLabel}
                  hasMenuIndicator
                  icon={<CodeRibbonIcon name="codeFile" />}
                  label={`${t("toolbar.code_filename")}: ${sourceFileLabel}`}
                  testId="code-file-menu"
                  title={`${t("toolbar.code_filename")}: ${sourceFileLabel}`}
                  variant="icon"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="note-editor-toolbar-menu"
                data-testid="code-file-menu-content"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                <DropdownMenuLabel
                  className="docs-cupertino-menu__rich-item docs-cupertino-menu__rich-header"
                  data-testid="code-file-menu-label"
                >
                  <RibbonMenuRichRow
                    fileType="code"
                    title={sourceFileLabel}
                    detail={`${
                      CODE_LANGUAGE_OPTIONS.find(
                        (option) => option.id === language,
                      )?.label ?? language
                    } · ${lineEnding} · ${codeSourceEncodingLabel(sourceEncoding)}`}
                  />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={requestVisibleSave}
                  disabled={saveDisabled}
                  data-testid="code-file-save"
                  title={saveAccessibleLabel}
                  aria-label={saveAccessibleLabel}
                  data-disabled-reason={saveDisabledReason}
                >
                  <CodeRibbonIcon name="save" size={14} />
                  {t("pages.save")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    selectToolbarTab("home");
                    setVersionHistoryOpen(true);
                  }}
                  disabled={guestMode}
                  data-testid="code-version-history"
                  title={versionHistoryAccessibleLabel}
                  aria-label={versionHistoryAccessibleLabel}
                  data-disabled-reason={versionHistoryDisabledReason}
                >
                  <CodeRibbonIcon name="versionHistory" size={14} />
                  {t("toolbar.versionHistory")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    selectToolbarTab("home");
                    codeImportInputRef.current?.click();
                  }}
                  disabled={codeImportBlocked || !codeMayAuthor}
                  data-testid="code-import"
                  title={codeImportAccessibleLabel}
                  aria-label={codeImportAccessibleLabel}
                  data-disabled-reason={codeImportDisabledReason}
                >
                  <CodeRibbonIcon name="sourceImport" size={14} />
                  {codeImporting ? t("editor.importing") : t("editor.import")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    selectToolbarTab("home");
                    beginSourceFileRename(sourceFileLabel);
                  }}
                  data-testid="code-file-rename"
                  disabled={!codeMayAuthor}
                  title={fileRenameAccessibleLabel}
                  aria-label={fileRenameAccessibleLabel}
                  data-disabled-reason={fileIdentityDisabledReason}
                >
                  <CodeRibbonIcon name="rename" size={14} />
                  {t("code.rename.submit")}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    data-testid="code-file-encoding-menu"
                    disabled={!codeMayAuthor}
                    title={fileEncodingAccessibleLabel}
                    aria-label={fileEncodingAccessibleLabel}
                    data-disabled-reason={fileIdentityDisabledReason}
                  >
                    <CodeRibbonIcon name="encoding" size={14} />
                    {codeSourceEncodingLabel(sourceEncoding)}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="note-editor-toolbar-menu"
                    data-testid="code-file-encoding-menu-content"
                  >
                    <DropdownMenuRadioGroup
                      value={sourceEncoding}
                      onValueChange={(value) =>
                        handleSourceEncodingChange(
                          normalizeCodeSourceEncoding(value),
                        )
                      }
                    >
                      {CODE_SOURCE_ENCODINGS.map((encoding) => (
                        <DropdownMenuRadioItem
                          key={encoding}
                          value={encoding}
                          data-testid={`code-file-encoding-${encoding}`}
                        >
                          {codeSourceEncodingLabel(encoding)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={codeImportInputRef}
              type="file"
              accept={CODE_FILE_ACCEPT}
              onChange={handleCodeFileImport}
              data-testid="code-import-input"
              aria-label={t("editor.import")}
              aria-busy={codeImporting}
              disabled={codeImportBlocked || !codeMayAuthor}
              title={t("editor.import")}
              tabIndex={-1}
              style={{ display: "none" }}
            />
            {/* The console retains its shortcut and one stable overflow host. */}
            {interactiveConsoleAvailable ? (
              <CodeRibbonMenuAction
                active={consoleOpen}
                onClick={toggleConsole}
                data-state={consoleOpen ? "open" : undefined}
                icon={<CodeRibbonIcon name="console" />}
                label={t("code.console.toggle")}
                testId="code-console-toggle"
                aria-keyshortcuts="Control+` Meta+`"
                title={t("code.console.toggle")}
                variant="icon"
              />
            ) : null}
            </CodeRibbonQuickActions>
          }
        />
        <CodeRibbonStrip
          activeTab={toolbarTab}
          activeLabel={
            toolbarTabs.find((tab) => tab.id === toolbarTab)?.label ??
            t("code.editorAriaLabel")
          }
          scrollLeftLabel={t("toolbar.ribbonScrollLeft")}
          scrollRightLabel={t("toolbar.ribbonScrollRight")}
        >
          {toolbarTab === "home" ? (
            <>
              <OfficeHomeUndoRail
                label={t("toolbar.undo")}
                testId="code-ribbon-group-history"
                undo={{
                  icon: <Undo2 size={18} />,
                  label: t("toolbar.undo"),
                  onClick: () => requestEditorEditCommand("undo"),
                  disabled: !codeMayAuthor || !editorEditState.canUndo,
                  disabledReason: editUndoDisabledReason,
                  keyShortcuts: "Control+Z Meta+Z",
                  testId: "code-home-undo",
                }}
                redo={{
                  icon: <Redo2 size={18} />,
                  label: t("toolbar.redo"),
                  onClick: () => requestEditorEditCommand("redo"),
                  disabled: !codeMayAuthor || !editorEditState.canRedo,
                  disabledReason: editRedoDisabledReason,
                  keyShortcuts: "Control+Shift+Z Meta+Shift+Z",
                  testId: "code-home-redo",
                }}
              />
              <CodeRibbonGroup
                label={t("toolbar.code_filename")}
                testId="code-ribbon-group-file"
                layout="hstack"
              >
              <CodeRibbonAction
                big
                icon={<CodeRibbonIcon name="sourceImport" />}
                label={
                  codeImporting ? t("editor.importing") : t("editor.import")
                }
                onClick={() => codeImportInputRef.current?.click()}
                disabled={codeImportBlocked || !codeMayAuthor}
                disabledReason={codeImportDisabledReason}
                testId="code-home-import"
                keyShortcuts="Control+O Meta+O"
              />
              <div className="note-editor-ribbon-col">
              <select
                value={language}
                onChange={(event) => {
                  dismissCodeImportReceipt();
                  handleLanguageChange(event.target.value);
                }}
                className="note-editor-office-toolbar__select"
                data-testid="code-language"
                title={languageSelectorAccessibleLabel}
                aria-label={languageSelectorAccessibleLabel}
                data-disabled-reason={languageSelectorDisabledReason}
                disabled={languageSelectorDisabled}
                style={{
                  minWidth: 130,
                  cursor: "pointer",
                }}
              >
                <CodeLanguageSelectOptions />
              </select>
              {codeImportError ? (
                <span
                  role="alert"
                  data-testid="code-import-status"
                  data-tone="error"
                  title={codeImportError}
                  className={workspacePanelStyles.ribbonStatus}
                >
                  {codeImportError}
                </span>
              ) : importedFileName ? (
                <span
                  role="status"
                  aria-live="polite"
                  data-testid="code-import-status"
                  title={importedFileName}
                  className={workspacePanelStyles.ribbonStatus}
                >
                  <CodeRibbonIcon name="savedCheck" size={12} />
                  <span className={workspacePanelStyles.ribbonStatusName}>
                    {importedFileName}
                  </span>
                  <CodeRibbonMenuAction
                    onClick={undoCodeFileImport}
                    disabled={codeImportBlocked || !codeMayAuthor}
                    className="note-editor-office-toolbar__button"
                    disabledReason={codeImportDisabledReason}
                    icon={<CodeRibbonIcon name="undo" />}
                    label={t("toolbar.undo")}
                    title={codeImportUndoAccessibleLabel}
                    testId="code-import-undo"
                    variant="icon"
                  />
                </span>
              ) : sourceFileRenameDraft !== null ? (
                <>
                  <input
                    ref={sourceFileRenameInputRef}
                    value={sourceFileRenameDraft}
                    onChange={(event) => {
                      setSourceFileRenameInvalid(false);
                      setSourceFileRenameDraft(event.target.value);
                    }}
                    onBlur={(event) => {
                      if (
                        event.currentTarget.dataset.renameCancelled === "true"
                      ) {
                        return;
                      }
                      commitSourceFileRenameInput(event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitSourceFileRenameInput(event.currentTarget.value);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.currentTarget.dataset.renameCancelled = "true";
                        cancelSourceFileRename();
                      }
                    }}
                    maxLength={MAX_CODE_WORKSPACE_PATH_CHARS}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="note-editor-office-toolbar__input"
                    data-testid="code-source-file-name-input"
                    aria-label={t("toolbar.code_filename")}
                    aria-invalid={sourceFileRenameInvalid || undefined}
                    aria-describedby={
                      sourceFileRenameInvalid
                        ? "code-workspace-path-error"
                        : undefined
                    }
                    disabled={!codeMayAuthor}
                    style={{
                      // The ribbon column stacks downward: the input class's
                      // 190px flex basis would otherwise be its height.
                      flex: "0 0 auto",
                      width: 240,
                      minWidth: 140,
                      height: 28,
                    }}
                  />
                  {sourceFileRenameInvalid ? (
                    <span
                      id="code-workspace-path-error"
                      role="alert"
                      data-testid="code-workspace-path-error"
                      className={workspacePanelStyles.ribbonStatus}
                      data-tone="error"
                    >
                      {t("code.rename.invalid")}
                    </span>
                  ) : null}
                </>
              ) : (
                <button
                  ref={sourceFileRenameButtonRef}
                  type="button"
                  onClick={() => beginSourceFileRename(sourceFileLabel)}
                  disabled={!codeMayAuthor}
                  className="office-ribbon-control note-editor-office-toolbar__menu-trigger" data-office-control-part="button"
                  data-testid="code-source-file-name"
                  title={sourceFileLabel}
                  aria-label={`${t("toolbar.code_filename")}: ${sourceFileLabel}`}
                  style={{
                    minWidth: 0,
                    maxWidth: 184,
                  }}
                >
                  <CodeRibbonIcon name="codeFile" size={12} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sourceFileLabel}
                  </span>
                </button>
              )}
              </div>
              <CodeRibbonAction
                big
                icon={<CodeRibbonIcon name="sourceDownload" />}
                label={t("code.download")}
                onClick={downloadSourceFile}
                disabled={downloadUnavailable}
                disabledReason={sourceDownloadDisabledReason}
                testId="code-home-download"
                keyShortcuts="Control+Shift+S Meta+Shift+S"
              />
              </CodeRibbonGroup>
              <CodeRibbonGroup
                label={t("toolbar.ribbonHome")}
                testId="code-ribbon-group-workspace"
                layout="hstack"
              >
              <CodeRibbonMenuAction
                variant="large"
                className="note-editor-office-toolbar__menu-trigger"
                onClick={() =>
                  workspaceExplorerOpen
                    ? closeWorkspaceExplorer()
                    : openWorkspaceExplorer()
                }
                active={workspaceExplorerOpen}
                data-state={workspaceExplorerOpen ? "open" : undefined}
                icon={<CodeRibbonIcon name="explorer" />}
                label={t("code.workspaceExplorer.title")}
                testId="code-workspace-explorer-toggle"
                title={t("code.workspaceExplorer.title")}
                aria-controls="code-workspace-explorer"
              />
              <OfficeHomeCommandStack rows={3}>
                <CodeRibbonMenuAction
                    className="note-editor-office-toolbar__menu-trigger"
                    onClick={() =>
                      quickOpenOpen ? closeQuickOpen() : openQuickOpen()
                    }
                    data-state={quickOpenOpen ? "open" : undefined}
                    icon={<CodeRibbonIcon name="quickOpen" />}
                    label={t("code.quickOpen.title")}
                    testId="code-quick-open-toggle"
                    title={`${t("code.quickOpen.title")} · Ctrl/⌘ P`}
                    aria-expanded={quickOpenOpen}
                    aria-controls="code-quick-open-panel"
                    aria-haspopup="dialog"
                    aria-keyshortcuts="Control+P Meta+P"
                />
                <CodeRibbonMenuAction
                  className="note-editor-office-toolbar__menu-trigger"
                  onClick={() =>
                    fifOpen ? closeFindInFiles() : openFindInFiles()
                  }
                  active={fifOpen}
                  data-state={fifOpen ? "open" : undefined}
                  displayLabel={t("code.palette.cmd.find")}
                  icon={<CodeRibbonIcon name="findInFiles" />}
                  label={t("code.findInFiles.toggle")}
                  testId="code-find-in-files-toggle"
                  title={t("code.findInFiles.toggle")}
                />
                {USE_CODEMIRROR_EDITOR ? (
                  <button
                    type="button"
                    className="office-ribbon-control note-editor-office-toolbar__menu-trigger" data-office-control-part="button"
                    onClick={() =>
                      workspaceProblemsOpen
                        ? closeWorkspaceProblems()
                        : openWorkspaceProblems()
                    }
                    data-state={workspaceProblemsOpen ? "open" : undefined}
                    data-testid="code-toolbar-problems"
                    title={t("code.problems.toggle")}
                    aria-expanded={workspaceProblemsOpen}
                    aria-controls="code-workspace-problems-panel"
                    aria-label={`${t("code.problems.title")}: ${t(
                      "code.problems.count",
                      { count: workspaceProblems.totalCount },
                    )}`}
                  >
                    <CodeRibbonIcon
                      name="problems"
                      size={14}
                      aria-hidden="true"
                    />
                    {t("code.problems.title")}
                    {workspaceProblems.totalCount > 0 ? (
                      <span
                        data-testid="code-toolbar-problems-count"
                        aria-hidden="true"
                        // The shared ribbon command's badge (Files' count).
                        className={officeHomeRibbonStyles.commandBadge}
                      >
                        {workspaceProblems.totalCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </OfficeHomeCommandStack>
              </CodeRibbonGroup>
            </>
          ) : null}
        </CodeRibbonStrip>
      </div>
      <RecoveredCopiesNotice
        pageId={pageId}
        copies={recoveredCopies}
        testIdPrefix="code"
        description={t("pages.recoveredCopy.codeBody")}
        actions={[
          { id: "open-new-page", label: t("pages.recoveredCopy.openAsNewPage"), run: (copy) => void openRecoveredCopyAsPage(copy) },
          { id: "replace", label: t("pages.recoveredCopy.replaceCode"), disabled: autosave.readOnly,
            confirm: (_copy, time) => ({
              title: t("pages.recoveredCopy.replaceCodeConfirmTitle"),
              body: t("pages.recoveredCopy.replaceCodeConfirmBody", { time }),
              confirmLabel: t("pages.recoveredCopy.replaceCodeConfirm"),
            }),
            run: replaceCodeWithRecoveredCopy },
          { id: "delete", label: t("pages.recoveredCopy.delete"), run: dropRecoveredCopy },
        ]}
      />
      {null}
      {downloadError ? (
        <WindowNotice title={t("documentIssues.title")}>
          <div
            className="page-save-conflict-banner"
            role="alert"
            aria-live="assertive"
            data-testid="code-download-error"
          >
            <CircleAlert size={16} aria-hidden="true" />
            <div className="page-save-conflict-banner__copy">
              <strong>{downloadError}</strong>
            </div>
          </div>
        </WindowNotice>
      ) : null}
      <PageSaveConflictBanner
        visible={effectiveSaveState.hasConflict}
        error={effectiveSaveState.error}
        details={effectiveSaveState.conflictDetails}
        disabled={effectiveSaveState.isSaving || !codeMayAuthor}
        onRetry={() => {
          if (!codeMayAuthorRef.current) return;
          const lease = codePageBufferLeaseRef.current;
          void (lease ? lease.retrySave() : autosave.retrySave());
        }}
        onReload={() => {
          // What Reload discards is kept aside first (TRIAGE 38).
          const keep = { keepAside: { reason: "discarded-for-remote" as const } };
          const lease = codePageBufferLeaseRef.current;
          void (
            lease
              ? lease.discardLocalAndReload(keep)
              : autosave.discardLocalAndReload(keep)
          );
        }}
        onOverwrite={() => {
          if (!codeMayAuthorRef.current) return;
          const lease = codePageBufferLeaseRef.current;
          void (
            lease ? lease.overwriteRemote() : autosave.overwriteRemote()
          );
        }}
        onSaveCopy={() => {
          if (!codeMayAuthorRef.current) return;
          const lease = codePageBufferLeaseRef.current;
          void (
            lease
              ? lease.saveConflictAsCopy()
              : autosave.saveConflictAsCopy()
          );
        }}
      />
      {!guestMode &&
      !effectiveSaveState.hasConflict &&
      effectiveSaveState.error ? (
        // As in Docs: a save retried on its own (the connection dropped) stays
        // in the notice button and the save status. Opened by itself, the
        // window-modal report made the editor inert, so the next key typed
        // after a pause went nowhere.
        <WindowNotice
          title={t("documentIssues.title")}
          scopeKey={`${pageId}:${effectiveSaveState.error}:${effectiveSaveState.retryableFailure ? "retrying" : "refused"}`}
          autoOpen={!effectiveSaveState.retryableFailure}
          label={effectiveSaveState.retryableFailure ? t("pages.saveFailed") : undefined}
        >
          <div
            className="page-save-conflict-banner"
            role="alert"
            data-testid="code-save-error"
          >
            <CircleAlert size={16} aria-hidden="true" />
            <div className="page-save-conflict-banner__copy">
              <strong>{t("pages.saveFailed")}</strong>
              <span>{codeSaveErrorPreview(effectiveSaveState.error)}</span>
            </div>
            <div className="page-save-conflict-banner__actions">
              <button
                type="button"
                onClick={() => {
                  if (!codeMayAuthorRef.current) return;
                  const lease = codePageBufferLeaseRef.current;
                  void (lease ? lease.retrySave() : autosave.retrySave());
                }}
                disabled={effectiveSaveState.isSaving || !codeMayAuthor}
                data-testid="code-save-error-retry"
              >
                <RotateCcw size={13} aria-hidden="true" />
                {t("pages.conflictRetry")}
              </button>
            </div>
          </div>
        </WindowNotice>
      ) : null}
      {quickOpenOpen ? (
        <CodeWindowQuickOpenPanel
          inputRef={quickOpenInputRef}
          query={quickOpenQuery}
          onQueryChange={(nextQuery) => {
            setQuickOpenQuery(nextQuery);
            setQuickOpenActiveIndex(0);
          }}
          result={quickOpenResult}
          activeIndex={safeQuickOpenActiveIndex}
          onActiveIndexChange={setQuickOpenActiveIndex}
          onActivate={activateQuickOpenEntry}
          loading={workspaceCatalogLoading || workspaceDetailsLoading}
          loadError={workspaceLoadError}
          onRetry={() => setWorkspaceRefreshEpoch((value) => value + 1)}
          onClose={closeQuickOpen}
          t={t}
        />
      ) : null}
      {/* Notebook-workspace Find-in-Files panel. Unsaved open buffers come from
          the registry; unopened authorized code pages are hydrated through the
          existing page API under explicit file/concurrency/memory budgets. */}
      {fifOpen ? (
        <CodeDockedPane docks={codeTaskPaneDocks} pane="find-in-files">
          <CodeWindowFindInFilesPanel
            inputRef={fifInputRef}
            query={fifQuery}
            onQueryChange={changeFindInFilesQuery}
            replacement={fifReplacement}
            onReplacementChange={setFifReplacement}
            caseSensitive={fifCaseSensitive}
            onToggleCase={() => setFifCaseSensitive((v) => !v)}
            wholeWord={fifWholeWord}
            onToggleWord={() => setFifWholeWord((v) => !v)}
            regex={fifRegex}
            onToggleRegex={() => setFifRegex((v) => !v)}
            includeGlobs={fifIncludeGlobs}
            onIncludeGlobsChange={setFifIncludeGlobs}
            excludeGlobs={fifExcludeGlobs}
            onExcludeGlobsChange={setFifExcludeGlobs}
            result={fifResult}
            activeHitKey={fifActiveHitKey}
            regexError={fifOperationError}
            loading={workspaceCatalogLoading || workspaceDetailsLoading}
            loadError={workspaceLoadError}
            onRetry={() => setWorkspaceRefreshEpoch((value) => value + 1)}
            onActivateHit={goToFifHit}
            onReplaceAll={doReplaceAllInFiles}
            replaceAllAvailable={fifReplaceAllAvailable}
            replaceAllBlockedReason={
              fifReplaceAllState === "needs-open"
                ? t("code.findInFiles.replaceNeedsOpen")
                : null
            }
            canUndoReplace={codeMayAuthor && fifUndoSnapshot !== null}
            onUndoReplace={undoReplaceAllInFiles}
            onClose={closeFindInFiles}
            t={t}
          />
        </CodeDockedPane>
      ) : null}
      {workspaceProblemsOpen ? (
        <CodeDockedPane docks={codeTaskPaneDocks} pane="workspace-problems">
          <CodeWindowProblemsPanel
            panelRef={workspaceProblemsPanelRef}
            snapshot={workspaceProblems}
            onClose={closeWorkspaceProblems}
            t={t}
          />
        </CodeDockedPane>
      ) : null}
      {null}
      <div
        data-testid="code-workspace-body"
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {testExplorerOpen ? (
          <CodeDockedPane docks={codeTaskPaneDocks} pane="test-explorer">
          <CodeTestExplorerPanel
            panelRef={testExplorerPanelRef}
            discovery={codeTestDiscovery}
            selectedTestIds={selectedCodeTestIds}
            receipt={testRunReceipt}
            receiptFreshness={testReceiptFreshness}
            historyEntries={testRunTimeline}
            historySources={codeTestSources}
            selectedHistoryIndex={selectedTestRunTimelineIndex}
            historyActionsAvailable={
              codeMayAuthor &&
              !testExplorerBusy &&
              !workspaceCatalogLoading &&
              !workspaceDetailsLoading
            }
            latestHistoryCurrent={latestTestRunHistoryCurrent}
            reportAvailable={
              selectedTestRunHistoryCurrent &&
              !testExplorerBusy &&
              !workspaceCatalogLoading &&
              !workspaceDetailsLoading
            }
            aiAvailable={
              codeMayAuthor &&
              selectedTestRunHistoryCurrent &&
              selectedTestRunAiFixAvailable &&
              !testExplorerBusy &&
              Boolean(windowManagerActions && workspaceNotebookId) &&
              !guestMode
            }
            debugReceiptAvailable={testDebugReceiptAvailable}
            debuggableTestIds={testDebuggableTestIds}
            available={codeMayAuthor}
            busy={testExplorerBusy}
            loading={workspaceCatalogLoading || workspaceDetailsLoading}
            incomplete={
              workspaceDetailsIncomplete || workspaceCatalog.truncated
            }
            loadError={workspaceLoadError}
            runError={testRunError}
            currentPageId={pageId}
            onToggleTest={toggleCodeTestSelection}
            onRunSelected={() => {
              flushPendingContentRender();
              void runCodeTestsRef.current("selected");
            }}
            onRunFile={(targetPageId) => {
              flushPendingContentRender();
              void runCodeTestsRef.current("file", targetPageId);
            }}
            onRunAll={() => {
              flushPendingContentRender();
              void runCodeTestsRef.current("all");
            }}
            onStop={stopCodeTestRun}
            onRefresh={() => {
              testSelectionInitializedRef.current = false;
              setWorkspaceRefreshEpoch((value) => value + 1);
            }}
            onNavigateResult={(result) => void navigateCodeTestResult(result)}
            onDebugTest={
              undefined
            }
            onSelectHistory={selectCodeTestRunTimelineEntry}
            onRerunHistory={rerunCodeTestTimelineEntry}
            onRerunLast={() => rerunCodeTestTimelineEntry(0)}
            onRerunFailed={() => rerunCodeTestTimelineEntry(0, true)}
            onClearHistory={clearCodeTestRunTimeline}
            onExportReport={() => void downloadSelectedCodeTestReport()}
            onAskAi={() => void askAiAboutCodeTestHistory()}
            onClose={closeTestExplorer}
          />
          </CodeDockedPane>
        ) : null}
        {workspaceExplorerOpen ? (
          <CodeWorkspaceExplorerPanel
            panelRef={workspaceExplorerPanelRef}
            tree={workspaceTree}
            collapsedPaths={workspaceCollapsedPaths}
            fileCount={workspaceCatalog.files.length}
            conflictCount={workspaceCatalog.conflictCount}
            catalogTruncated={workspaceCatalog.truncated}
            loading={workspaceCatalogLoading || workspaceDetailsLoading}
            loadError={workspaceLoadError}
            mutationActionsVisible={!guestMode}
            mutationDisabledReason={
              !codeMayAuthor
                ? t("code.commandDisabled.readOnly")
                : workspaceCatalogLoading || workspaceDetailsLoading
                  ? t("code.loading")
                  : workspaceLoadError ||
                      workspaceDetailsIncomplete ||
                      workspaceCatalog.truncated
                    ? t("code.workspaceExplorer.catalogUnavailable")
                    : undefined
            }
            defaultNewPath={workspaceNewFilePath}
            occupiedPathIdentities={workspaceOccupiedPathIdentities}
            onCreateFile={createWorkspaceFile}
            onUploadFiles={uploadWorkspaceFiles}
            onRenameFile={renameWorkspaceFile}
            onDuplicateFile={duplicateWorkspaceFile}
            onDeleteFile={deleteWorkspaceFile}
            onToggleDirectory={toggleWorkspaceDirectory}
            onActivateFile={(file) => activateWorkspaceFile(file)}
            onRefresh={
              guestMode
                ? null
                : () => setWorkspaceRefreshEpoch((value) => value + 1)
            }
            onClose={closeWorkspaceExplorer}
            t={t}
          />
        ) : null}
        {codeSourceLimitExceeded ? (
          <WindowNotice title={t("documentIssues.title")}>
            <div
              role="alert"
              data-testid="code-source-limit-error"
              className="page-save-conflict-banner"
            >
              <CircleAlert size={16} aria-hidden="true" />
              <div className="page-save-conflict-banner__copy">
                <strong>
                  {t(
                    codeHydrationBlocked
                      ? "code.sourceLoadTooLarge"
                      : "code.sourceTooLarge",
                  )}
                </strong>
              </div>
            </div>
          </WindowNotice>
        ) : null}
        <div
          ref={codeEditorStackRef}
          data-testid="code-editor-stack"
          // Ctrl/Cmd+I opens the inline Copilot under the selection, as
          // VS Code's inline chat does. Capture runs before the editor's own
          // Mod-i: a keymap appended to the view on focus was dropped by the
          // next extension reconfigure, and the dispatch made inside the
          // focus event lost the restored selection.
          onKeyDownCapture={(event) => {
            if (
              !CODE_COPILOT_V1_ENABLED ||
              codeCopilotReadOnly ||
              !(event.metaKey || event.ctrlKey) ||
              event.shiftKey ||
              event.altKey ||
              event.key.toLowerCase() !== "i" ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            if (copilotOpen || codeCopilotSelection) toggleCodeCopilot(!copilotOpen);
            else startCodeCopilotPick();
          }}
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
      {CODE_COPILOT_V1_ENABLED && copilotPicking && !copilotOpen ? (
        null
      ) : null}
      {CODE_COPILOT_V1_ENABLED && codeCopilotSelection && !copilotOpen && !copilotPicking ? (
        // The editors' shared selection mini toolbar (note-editor.css
        // .floating-toolbar) holding its AI key, as Docs shows it.
        <div className="code-window__selection-copilot-trigger floating-toolbar office-scale-in">
          {null}
        </div>
      ) : null}
      {CODE_COPILOT_V1_ENABLED && copilotOpen ? (
        
        // not a side panel.
        null
      ) : null}
      {/* Flag-gated editor engine: CodeMirror 6 when on, textarea fallback when
          off. Both share the prop contract + the `code-editor` testid, so the
          window-level wiring (run/output/edit-bus) is engine-agnostic. */}
      {USE_CODEMIRROR_EDITOR ? (
        <div
          data-testid="code-split-view"
          data-split={splitViewState.secondaryOpen ? "true" : "false"}
          style={{
            display: "flex",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
        {visibleCodeSplitPanes(splitViewState).map((pane) => {
          const paneIsActive = pane === splitViewState.activePane;
          const paneViewStateKey = codeSplitPaneViewStateKey(pageId, pane);
          return (
          <div
            key={`${pageId}:${codePageBufferBinding?.generation ?? "plain"}:${pane}`}
            data-testid={`code-split-pane-${pane}`}
            data-active={paneIsActive ? "true" : "false"}
            onFocusCapture={() => handleActivateSplitPane(pane)}
            style={{
              display: "flex",
              flex: "1 1 0",
              minHeight: 0,
              minWidth: 0,
              overflow: "hidden",
              borderLeft:
                pane === "secondary"
                  ? "1px solid var(--border-subtle, rgba(127, 127, 127, 0.24))"
                  : undefined,
            }}
          >
        <CodeMirrorEditor
          key={`${pageId}:${codePageBufferBinding?.generation ?? "plain"}:${pane}`}
          value={contentRef.current}
          language={language}
          lineEnding={lineEnding}
          onLineEndingChange={handleLineEndingChange}
          sourceEncoding={sourceEncoding}
          onSourceEncodingChange={handleSourceEncodingChange}
          editorTestId={codeSplitPaneEditorTestId(pane)}
          taskPaneDocks={paneIsActive ? codeTaskPaneDocks : null}
          statusBarHost={paneIsActive ? statusBarHost : null}
          viewStateKey={paneViewStateKey}
          readOnly={codeEditorReadOnly}
          maxDocumentLength={MAX_CODE_SOURCE_CHARS}
          onDocumentLimitExceeded={markCodeSourceLimitExceeded}
          isDark={isDark}
          onChange={handleCodeMirrorContentChange}
          placeholder={t("code.placeholder")}
          onRun={
            language === "latex"
              ? requestLatexCompile
              : quickRunDisabled
                ? undefined
                : toggleRun
          }
          onRunSelection={
            runSelectionCommandDisabled ? undefined : runSelection
          }
          onSave={saveFromEditor}
          pythonNamespace={pageId}
          pythonKernelAvailable={hasPythonKernel(pageId)}
          // Leading breadcrumb crumb: the notebook-scoped virtual path. This is
          // never an ambient host path and survives save/reopen when moved into
          // a virtual directory.
          documentName={workspacePath}
          collab={
            activeCodePageBufferLease &&
            (!activeCodePageBufferLease.collaborationAdapter.getSnapshot().causal ||
              activeCodePageBufferLease.collaborationAdapter.getSnapshot().causal?.status === "ready")
              ? {
                  session: activeCodePageBufferLease.session,
                  textKey: activeCodePageBufferLease.textKey,
                  localPageBuffer: true,
                  undoManager: activeCodePageBufferLease.undoManager,
                  registerEditorOrigin:
                    activeCodePageBufferLease.registerEditorOrigin,
                }
              : undefined
          }
          // Project-aware JS/TS intelligence across every open standalone code
          // window. Unsupported languages keep their existing local engines.
          crossFileGoToDefinition={
            isWorkspaceLanguage(language)
              ? crossWindowGoToDefinition
              : undefined
          }
          crossFileGoToTypeDefinition={
            isWorkspaceLanguage(language)
              ? crossWindowGoToTypeDefinition
              : undefined
          }
          crossFileGoToImplementation={
            isWorkspaceLanguage(language)
              ? crossWindowGoToImplementation
              : undefined
          }
          crossFilePeekDefinition={
            isWorkspaceLanguage(language)
              ? crossWindowPeekDefinition
              : undefined
          }
          crossFileCodeFixes={
            isWorkspaceLanguage(language)
              ? crossWindowCodeFixes
              : undefined
          }
          crossFileReferences={
            isWorkspaceLanguage(language) ? crossWindowReferences : undefined
          }
          crossFileCallHierarchy={
            isWorkspaceLanguage(language) ? crossWindowCallHierarchy : undefined
          }
          crossFileRefactors={
            isWorkspaceLanguage(language) ? crossWindowRefactors : undefined
          }
          onNavigateCrossFile={
            isWorkspaceLanguage(language)
              ? navigateToCodeWindowRange
              : undefined
          }
          crossFileQuickInfo={
            isWorkspaceLanguage(language) ? crossWindowQuickInfo : undefined
          }
          crossFileSignatureHelp={
            isWorkspaceLanguage(language)
              ? crossWindowSignatureHelp
              : undefined
          }
          extraCompletionIdentifiers={
            isWorkspaceLanguage(language)
              ? crossWindowCompletionIdentifiers
              : undefined
          }
          crossFileRename={
            isWorkspaceLanguage(language) ? crossWindowRename : undefined
          }
          crossFileDiagnostics={
            isWorkspaceLanguage(language) && hasWorkspaceDiagnosticsPeer
              ? crossWindowDiagnostics
              : undefined
          }
          crossFileDiagnosticsRefreshKey={
            isWorkspaceLanguage(language) && hasWorkspaceDiagnosticsPeer
              ? peerSourceRevision + workspaceIntelligenceRevision
              : undefined
          }
          // Diff/Compare: offer sibling code windows + saved version history
          // as the "before" side. The picker renders when this returns ≥1 source;
          // when the registry / version list are both empty the affordance hides.
          compareSources={compareSourcesForWindow}
          compareSourceCount={compareSourceCount}
          compareSourceScope={pageId}
          baselineContent={dirtyDiffBaseline ?? undefined}
          hostShortcuts={CODE_WINDOW_HOST_SHORTCUTS}
          viewCommandRequest={
            paneIsActive ? editorViewCommandRequest : undefined
          }
          onViewCommandRequestHandled={
            paneIsActive ? handleEditorViewCommandRequestHandled : undefined
          }
          onViewStateChange={
            paneIsActive ? handleEditorViewStateChange : undefined
          }
          onScrollPortChange={
            pane === "primary" ? setCodeScrollPort : undefined
          }
          editCommandRequest={
            paneIsActive ? editorEditCommandRequest : undefined
          }
          onEditCommandRequestHandled={
            paneIsActive ? handleEditorEditCommandRequestHandled : undefined
          }
          onEditStateChange={
            paneIsActive ? handleEditorEditStateChange : undefined
          }
          intelligenceCommandRequest={
            paneIsActive ? editorIntelligenceCommandRequest : undefined
          }
          onIntelligenceCommandRequestHandled={
            paneIsActive
              ? handleEditorIntelligenceCommandRequestHandled
              : undefined
          }
          onIntelligenceStateChange={
            paneIsActive ? handleEditorIntelligenceStateChange : undefined
          }
          reviewCommandRequest={
            paneIsActive ? editorReviewCommandRequest : undefined
          }
          onReviewCommandRequestHandled={
            paneIsActive ? handleEditorReviewCommandRequestHandled : undefined
          }
          onReviewStateChange={
            paneIsActive ? handleEditorReviewStateChange : undefined
          }
          pinnedCompare={
            paneIsActive && draftComparison
              ? {
                  id: "page-draft-page-now",
                  label: draftComparison.label,
                  text: draftComparison.text,
                  open: draftComparison.shown,
                }
              : undefined
          }
          executionCommandRequest={
            paneIsActive ? editorExecutionCommandRequest : undefined
          }
          onExecutionCommandRequestHandled={
            paneIsActive
              ? handleEditorExecutionCommandRequestHandled
              : undefined
          }
          onExecutionStateChange={
            paneIsActive ? handleEditorExecutionStateChange : undefined
          }
          onDiagnosticCountChange={
            paneIsActive ? handleDiagnosticCountChange : undefined
          }
          onProblemsChange={
            paneIsActive ? handleProblemsChange : undefined
          }
          onCursorLineChange={
            undefined
          }
          lineNavigationRequest={
            undefined
          }
          onLineNavigationRequestHandled={
            undefined
          }
          debugBreakpointLines={
            undefined
          }
          debugUnboundBreakpointLines={
            undefined
          }
          onToggleDebugBreakpoint={
            undefined
          }
          onRebaseDebugBreakpoints={
            undefined
          }
          debugPausedLine={
            undefined
          }
        />
          </div>
          );
        })}
        </div>
      ) : (
        <CodeEditor
          value={content}
          language={language}
          readOnly={codeEditorReadOnly}
          maxDocumentLength={MAX_CODE_SOURCE_CHARS}
          onDocumentLimitExceeded={markCodeSourceLimitExceeded}
          onChange={handleTextareaContentChange}
          placeholder={t("code.placeholder")}
          onRun={
            language === "latex"
              ? requestLatexCompile
              : quickRunDisabled
                ? undefined
                : toggleRun
          }
          onRunSelection={
            runSelectionCommandDisabled ? undefined : runSelection
          }
          onSave={saveFromEditor}
        />
      )}
      {/* Keep the enabled debugger mounted while this window is open so its
          breakpoints survive Home/Run/Debug ribbon navigation. `hidden`
          removes inactive debug controls from layout and the accessibility
          tree; no worker starts until the user explicitly presses Debug. */}
      {null}
      {consoleOpen && interactiveConsoleAvailable ? (
        <div
          data-testid="code-console-host"
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            height: "38%",
            minHeight: 132,
            maxHeight: "60%",
            overflow: "hidden",
          }}
        >
          <CodeConsolePanel
            key={`page:${pageId}:${language}`}
            entries={consoleEntries}
            busy={consoleBusy}
            blocked={
              ((running || testExplorerBusy || debugState.running) && !consoleBusy) ||
              remotePageBusy
            }
            historyScope={`page:${pageId}`}
            language={language}
            isDark={isDark}
            onSubmit={(source) => void evaluateInConsole(source)}
            onInterrupt={interruptConsole}
            onClear={clearConsole}
            onClose={closeConsole}
            labels={{
              title: t("code.console.title"),
              placeholder: t("code.console.placeholder"),
              hint: t("code.console.hint"),
              empty: t(codeConsoleEmptyMessageKey(language)),
              busy: t("code.console.busy"),
              blocked: t("code.console.blocked"),
              interrupt: t("code.console.interrupt"),
              clear: t("code.console.clear"),
              clearHistory: t("code.console.clearHistory"),
              clearHistoryFailed: t("code.console.clearHistoryFailed"),
              historySessionOnly: t("code.console.historySessionOnly"),
              close: t("code.console.close"),
              search: t("code.console.search"),
              noMatches: t("code.console.searchNone"),
              searchStatus: (matches, inspected, total) =>
                t("code.console.searchStatus", {
                  matches,
                  inspected,
                  total,
                }),
              searchLimited: t("code.console.searchLimited"),
              interrupted: t("codeOutput.interrupted"),
              truncated: (hidden) =>
                t("code.console.outputTruncated", { hidden }),
            }}
          />
        </div>
      ) : null}
      {versionHistoryOpen && !guestMode ? (
        <CodeDockedPane docks={codeTaskPaneDocks} pane="version-history">
        <VersionHistoryPanel
          pageId={pageId}
          onBeforeVersionWrite={saveForVersionWrite}
          onContentRestored={handleCodeContentRestored}
          onClose={() => {
            setVersionHistoryOpen(false);
            // Re-count saved versions: one may have just been created here.
            setSavedVersionNonce((nonce) => nonce + 1);
          }}
          dockClassName={codeTaskPaneClassName}
        />
        </CodeDockedPane>
      ) : null}
      {output || runTimeline.length > 0 ? (
        outputPanelVisible ? (
          <CodeOutputPanel key={pageId} title={t("codeOutput.floatingTitle",{file:sourceFileLabel})} percent={outputPanelPercent} onHide={hideOutputPanel} dockLabel={t("codeOutput.dock")}>
            {({floating,toggleFloating})=>(
          <section
            id="code-output-panel"
            data-testid="code-output-region"
            data-panel-percent={outputPanelPercent}
            aria-label={t("codeOutput.output")}
            onKeyDown={(event) => {
              if (
                isImeCompositionKey({
                  isComposing: event.nativeEvent.isComposing,
                  keyCode: event.nativeEvent.keyCode,
                })
              ) {
                return;
              }
              if (
                (event.metaKey || event.ctrlKey) &&
                !event.shiftKey &&
                !event.altKey &&
                displayedOutput.logs.length > 0 &&
                (event.key === "F" || event.key === "f")
              ) {
                event.preventDefault();
                event.stopPropagation();
                openOutputSearch();
              }
            }}
            style={{
              // Docked, the region is the glass card's content: no paint of
              // its own. Floating, it is the window's surface.
              background: floating ? "var(--bg-surface, #f9fafb)" : "transparent",
              height: "100%",
            maxHeight: "100%",
            minHeight: 96,
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            overflow: "visible",
            position: "relative",
            borderRadius: floating ? 14 : 0,
          }}
        >
          {!floating ? <div
            role="separator"
            tabIndex={0}
            aria-label={t("codeOutput.output")}
            aria-orientation="horizontal"
            aria-valuemin={RUN_OUTPUT_PANEL_MIN_PERCENT}
            aria-valuemax={RUN_OUTPUT_PANEL_MAX_PERCENT}
            aria-valuenow={outputPanelPercent}
            aria-valuetext={`${Math.round(outputPanelPercent)}%`}
            data-testid="code-output-resizer"
            className="code-output-resizer"
            data-touch-hold="off"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              // a second finger on the bar does not take over the drag
              if (outputResizeActiveRef.current) return;
              event.preventDefault();
              outputResizeActiveRef.current = true;
              outputResizeMovedRef.current = false;
              outputResizePointerIdRef.current = event.pointerId ?? null;
              outputResizeStartPercentRef.current =
                outputPanelPercentRef.current;
              const dockTop = codeWindowRef.current
                ?.querySelector<HTMLElement>('[data-testid="code-output-dock"]')
                ?.getBoundingClientRect().top;
              outputResizeGrabOffsetRef.current =
                dockTop === undefined ? 0 : event.clientY - dockTop;
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!outputResizeActiveRef.current) return;
              if (!isOutputResizePointer(event.pointerId)) return;
              outputResizeMovedRef.current = true;
              resizeOutputPanelFromPointer(event.clientY);
            }}
            onPointerUp={(event) => {
              if (!outputResizeActiveRef.current) return;
              if (!isOutputResizePointer(event.pointerId)) return;
              if (outputResizeMovedRef.current) {
                resizeOutputPanelFromPointer(event.clientY);
              }
              finishOutputPanelResize();
              if (
                event.currentTarget.hasPointerCapture?.(event.pointerId)
              ) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (!isOutputResizePointer(event.pointerId)) return;
              cancelOutputPanelResize();
            }}
            onLostPointerCapture={(event) => {
              if (!isOutputResizePointer(event.pointerId)) return;
              finishOutputPanelResize();
            }}
            onDoubleClick={(event) => {
              // a finger's double tap is handled from its clicks below
              if (isCompatMouseFromTouch(event.nativeEvent)) return;
              toggleOutputPanelMaximized();
            }}
            onClick={(event) => {
              // iPad Safari does not dependably turn two taps into dblclick
              if (isDoubleTap(event.nativeEvent)) toggleOutputPanelMaximized();
            }}
            onKeyDown={(event) => {
              if (
                isImeCompositionKey({
                  isComposing: event.nativeEvent.isComposing,
                  keyCode: event.nativeEvent.keyCode,
                })
              ) {
                return;
              }
              const next = runOutputPanelPercentForKey(
                outputPanelPercentRef.current,
                event.key,
              );
              if (next === null) return;
              event.preventDefault();
              event.stopPropagation();
              const current = outputPanelPercentRef.current;
              if (
                next === RUN_OUTPUT_PANEL_MAX_PERCENT &&
                current < RUN_OUTPUT_PANEL_MAX_PERCENT
              ) {
                outputPanelRestorePercentRef.current = current;
              }
              const resized = applyOutputPanelPercent(next, true);
              if (resized < RUN_OUTPUT_PANEL_MAX_PERCENT) {
                outputPanelRestorePercentRef.current = resized;
              }
            }}
            title={`${t("codeOutput.output")} · ${Math.round(outputPanelPercent)}%`}
            style={{
              // 8px for a mouse; code-editor-touch.css widens it for a finger
              minHeight: "var(--code-output-resizer-size, 8px)",
              height: "var(--code-output-resizer-size, 8px)",
              flex: "0 0 var(--code-output-resizer-size, 8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              cursor: "row-resize",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <span className={styles.outputGrip} aria-hidden="true" />
          </div> : null}
          <header className={`${styles.outputHeader} code-output-drag-handle`} data-testid="code-output-toolbar" style={{cursor:floating?"move":undefined}}>
            <span className={styles.outputHeaderTitle}>{t("codeOutput.results")}</span>
            {floating?<span className={styles.outputSource} title={sourceFileLabel}>{sourceFileLabel}</span>:null}
            <CodeOutputDisclosure label={selectedRunTimelineIndex === null || selectedRunTimelineIndex === 0 ? t("codeOutput.currentRun") : t("codeOutput.previousRun",{number:selectedRunTimelineIndex+1})} testId="code-output-history-menu">
          <CodeRunTimelinePanel
            entries={runTimeline}
            profiles={runProfiles}
            currentSourceFingerprint={runTimelineSourceFingerprint}
            currentLanguage={language}
            currentProviderId={currentExecutionProviderId}
            partialExecutionAvailable={partialExecutionAvailable}
            currentStdinSha256={stdinSha256}
            currentStdinBytes={stdinByteCount}
            selectedIndex={selectedRunTimelineIndex}
            runLabel={t("code.run")}
            savedLabel={t("code.savedRuns")}
            saveLabel={t("code.saveRun")}
            removeLabel={t("code.removeSavedRun")}
            clearLabel={t("code.clearRunHistory")}
            confirmClearLabel={t("code.confirmClearExecutionHistory")}
            profileLimitReached={runProfileCapacityReached}
            profileLimitLabel={t("code.savedRunLimit", {
              max: CODE_PAGE_RUN_PROFILE_LIMIT,
            })}
            confirmRemoveLabel={t("code.confirmRemoveSavedRun")}
            cancelLabel={t("common.cancel")}
            unavailableLabel={t("document.capability.unavailable")}
            inputUnavailableLabel={`${t("code.stdinLabel")} · ${t("document.capability.unavailable")}`}
            scopeLabel={runTimelineScopeLabel}
            profileLabel={runProfileScopeLabel}
            onSelect={selectRunTimelineEntry}
            onRerun={rerunTimelineEntry}
            onSaveSelected={() => void saveSelectedRunProfile()}
            onRunProfile={(index) => void runSavedProfile(index)}
            onRemoveProfile={removeSavedRunProfile}
            onClear={clearRunTimeline}
            saveSelectedDisabled={!selectedRunTimelineCanSave}
            replayActionsBlocked={runHistoryReplayBlocked}
            mutationActionsBlocked={runHistoryMutationBlocked}
          />
            </CodeOutputDisclosure>
            <span className={styles.outputStatus} data-testid="code-output-status" data-state={running && selectedRunTimelineIndex === null ? "running" : displayedOutput.error ? "error" : "complete"}>{running && selectedRunTimelineIndex === null ? (latexCompilingSince !== null ? <LatexCompilingLabel startedAt={latexCompilingSince} /> : t("codeOutput.running")) : `${displayedOutput.error ? t("codeOutput.failed") : t("codeOutput.completed")}${shownLatexCompileMs !== null ? ` · ${latexCompileDurationLabel(shownLatexCompileMs, t)}${latexDraftMode ? ` · ${t("codeOutput.latex.compileModeDraft")}` : ""}` : ""}`}</span>
            {outputCopyBusy || outputCopyError ? (
              <span
                id="code-output-copy-feedback"
                data-testid="code-output-copy-feedback"
                data-state={outputCopyError ? "error" : "busy"}
                role={outputCopyError ? "alert" : "status"}
                aria-live={outputCopyError ? "assertive" : "polite"}
                aria-atomic="true"
                className={styles.outputCopyFeedback}
              >
                {outputCopyError ?? `${t("toolbar.copy")}…`}
              </span>
            ) : null}

            <span className={styles.outputHeaderSpacer} />
<button
              type="button"
              onClick={() => void copyOutput()}
              disabled={outputCopyDisabled}
              aria-busy={outputCopyBusy || undefined}
              aria-describedby={
                outputCopyBusy || outputCopyError
                  ? "code-output-copy-feedback"
                  : undefined
              }
              data-state={
                outputCopyBusy
                  ? "busy"
                  : outputCopyError
                    ? "error"
                    : outputCopied
                      ? "copied"
                      : undefined
              }
              data-testid="code-output-copy"
              title={
                outputCopyError ??
                (outputCopyBusy
                  ? `${t("toolbar.copy")}…`
                  : outputCopyDisabledReason
                    ? outputCopyAccessibleLabel
                    : outputCopied
                      ? t("extensionTool.copied")
                      : t("toolbar.copy"))
              }
              aria-label={
                outputCopyDisabledReason
                  ? outputCopyAccessibleLabel
                  : outputCopied
                  ? t("extensionTool.copied")
                  : t("toolbar.copy")
              }
              data-disabled-reason={outputCopyDisabledReason}
              className={styles.outputIconButton}
            >
              <CodeRibbonIcon name={outputCopied ? "outputCopied" : "outputCopy"} size={16} />
            </button>
            <button type="button" onClick={toggleFloating} data-testid="code-output-float" aria-pressed={floating} aria-label={floating?t("codeOutput.dock"):t("codeOutput.float")} title={floating?t("codeOutput.dock"):t("codeOutput.float")} className={styles.outputIconButton}><CodeRibbonIcon name={floating ? "outputDock" : "outputFloat"} size={16} /></button>
            <CodeOutputDisclosure label={t("codeOutput.more")} testId="code-output-more" iconOnly>
            {hasMixedOutputStreams ? (
              <div
                role="group"
                aria-label="stdout / stderr"
                data-testid="code-output-stream-filters"
                className={styles.outputSegment}
              >
                {(
                  [
                    {
                      id: "all",
                      label: "stdout + stderr",
                      content: <ListFilter size={11} aria-hidden="true" />,
                    },
                    { id: "stdout", label: "stdout", content: "stdout" },
                    { id: "stderr", label: "stderr", content: "stderr" },
                  ] as const
                ).map((filter) => {
                  const selected = outputStreamFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-label={filter.label}
                      aria-pressed={selected}
                      title={filter.label}
                      data-testid={`code-output-filter-${filter.id}`}
                      data-stream={filter.id}
                      onClick={() => selectOutputStream(filter.id)}
                      className={styles.outputSegmentItem}
                    >
                      {filter.content}
                    </button>
                  );
                })}
              </div>
            ) : null}

<button
              ref={outputSearchToggleRef}
              type="button"
              onClick={outputSearchOpen ? closeOutputSearch : openOutputSearch}
              disabled={outputSearchDisabledReason !== undefined}
              aria-pressed={outputSearchOpen}
              aria-keyshortcuts="Control+F Meta+F"
              data-testid="code-output-search-toggle"
              title={outputSearchAccessibleLabel}
              aria-label={outputSearchAccessibleLabel}
              data-disabled-reason={outputSearchDisabledReason}
              className={styles.outputMenuItem}
            >
              <CodeRibbonIcon name="outputSearch" size={16} />
            <span className={styles.outputActionLabel}>{t("code.find.findPlaceholder")}</span></button>
<button
              type="button"
              onClick={toggleOutputWrap}
              aria-pressed={effectiveOutputWrap}
              disabled={!outputWrapAvailable}
              data-testid="code-output-wrap"
              title={outputWrapAccessibleLabel}
              aria-label={outputWrapAccessibleLabel}
              data-disabled-reason={outputWrapDisabledReason}
              className={styles.outputMenuItem}
            >
              <CodeRibbonIcon name="outputWrap" size={16} />
            <span className={styles.outputActionLabel}>{t("code.palette.cmd.toggleWordWrap")}</span></button>
<button
              type="button"
              onClick={downloadOutput}
              disabled={!outputHasContent || downloadUnavailable}
              data-testid="code-output-download"
              title={
                outputDownloadDisabledReason
                  ? outputDownloadAccessibleLabel
                  : (downloadError ?? t("code.download"))
              }
              aria-label={outputDownloadAccessibleLabel}
              data-disabled-reason={outputDownloadDisabledReason}
              className={styles.outputMenuItem}
            >
              <CodeRibbonIcon name="outputDownload" size={16} />
            <span className={styles.outputActionLabel}>{t("code.download")}</span></button>
<button
              type="button"
              onClick={downloadSelectedRunArtifact}
              disabled={runReceiptDisabled}
              data-testid="code-output-download-run"
              title={runReceiptAccessibleLabel}
              aria-label={runReceiptAccessibleLabel}
              data-disabled-reason={runReceiptDisabledReason}
              className={styles.outputMenuItem}
            >
              <CodeRibbonIcon name="outputReceipt" size={16} />
            <span className={styles.outputActionLabel}>{t("code.exportRunArtifact")}</span></button>
<button
              type="button"
              onClick={toggleOutputPanelMaximized}
              aria-pressed={
                outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT
              }
              data-testid="code-output-size-toggle"
              title={
                outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT
                  ? t("window.restore")
                  : t("window.maximize")
              }
              aria-label={
                outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT
                  ? t("window.restore")
                  : t("window.maximize")
              }
              className={styles.outputMenuItem}
            >
              {outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT ? (
                <CodeRibbonIcon name="outputRestore" size={16} />
              ) : (
                <CodeRibbonIcon name="outputMaximize" size={16} />
              )}
            <span className={styles.outputActionLabel}>{outputPanelPercent >= RUN_OUTPUT_PANEL_MAX_PERCENT ? t("window.restore") : t("window.maximize")}</span></button>
<button
              type="button"
              onClick={clearOutput}
              disabled={clearOutputDisabled}
              data-testid="code-output-clear"
              title={clearOutputAccessibleLabel}
              aria-label={clearOutputAccessibleLabel}
              data-disabled-reason={clearOutputDisabledReason}
              className={styles.outputMenuItem}
            >
              <CodeRibbonIcon name="clearOutput" size={16} />
            <span className={styles.outputActionLabel}>{t("codeOutput.clearOutputs")}</span></button>
            </CodeOutputDisclosure>
<button
              type="button"
              onClick={hideOutputPanel}
              data-testid="code-output-hide"
              title={`${t("codeOutput.hideOutput")} · Ctrl/⌘ J`}
              aria-label={t("codeOutput.hideOutput")}
              aria-controls="code-output-panel"
              aria-keyshortcuts="Control+J Meta+J"
              className={styles.outputIconButton}
            >
              <CodeRibbonIcon name="outputClose" size={16} />
            </button>
            <span
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: "hidden",
                clip: "rect(0, 0, 0, 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              {outputCopied ? t("extensionTool.copied") : ""}
            </span>

          </header>

          {outputSearchOpen ? (
            <div
              role="search"
              aria-label={t("code.find.findPlaceholder")}
              data-testid="code-output-search-toolbar"
              className={styles.outputSearchBar}
            >
              <label className={styles.outputSearchField}>
              <Search size={13} aria-hidden="true" />
              <input
                ref={outputSearchInputRef}
                type="search"
                value={outputSearchQuery}
                maxLength={MAX_RUN_OUTPUT_SEARCH_QUERY_CHARS}
                onChange={changeOutputSearchQuery}
                onKeyDown={(event) => {
                  if (
                    isImeCompositionKey({
                      isComposing: event.nativeEvent.isComposing,
                      keyCode: event.nativeEvent.keyCode,
                    })
                  ) {
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeOutputSearch();
                    return;
                  }
                  if (event.key === "Enter" || event.key === "F3") {
                    event.preventDefault();
                    event.stopPropagation();
                    navigateOutputSearch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder={t("code.find.findPlaceholder")}
                aria-label={t("code.find.findPlaceholder")}
                data-testid="code-output-search-input"
              />
              </label>
              <span
                role="status"
                aria-live="polite"
                data-testid="code-output-search-count"
                className={styles.outputSearchCount}
              >
                {outputSearchResult.matches.length > 0
                  ? `${outputSearchResolvedActiveIndex + 1} / ${
                      outputSearchResult.matches.length
                    }${outputSearchResult.truncated ? "+" : ""}`
                  : `0 / 0${outputSearchResult.truncated ? "+" : ""}`}
              </span>
              <button
                type="button"
                onClick={() => navigateOutputSearch(-1)}
                disabled={outputSearchResult.matches.length === 0}
                data-testid="code-output-search-previous"
                title={t("code.find.previousMatch")}
                aria-label={t("code.find.previousMatch")}
                className={styles.outputIconButton}
              >
                <ChevronLeft size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => navigateOutputSearch(1)}
                disabled={outputSearchResult.matches.length === 0}
                data-testid="code-output-search-next"
                title={t("code.find.nextMatch")}
                aria-label={t("code.find.nextMatch")}
                className={styles.outputIconButton}
              >
                <ChevronRight size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={closeOutputSearch}
                data-testid="code-output-search-close"
                title={t("code.find.close")}
                aria-label={t("code.find.close")}
                className={styles.outputIconButton}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <div
            ref={outputScrollRef}
            data-testid="code-output"
            data-wrap={effectiveOutputWrap ? "on" : "off"}
            role="log"
            tabIndex={0}
            aria-live="polite"
            aria-relevant="additions text"
            onScroll={(event) => {
              const element = event.currentTarget;
              outputShouldFollowRef.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                32;
            }}
            style={{
              minHeight: 0,
              flex: 1,
              overflow: "auto",
              borderRadius: "0 0 14px 14px",
              padding: "10px 12px",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
            }}
          >
            {language === "python" ? (
              // A pygame program's window, played here (shown once it draws).
              <PythonGameSurface namespace={pageId} />
            ) : null}
            {displayedOutput.notebookOutputs !== undefined ? (
              <CellOutput
                output={{
                  logs: [],
                  notebookOutputs: displayedOutput.notebookOutputs,
                }}
                onFrameClick={
                  tracebackNavigationEnabled
                    ? handleTracebackFrameClick
                    : undefined
                }
                containerTestId="code-output-notebook"
                showExportControl={false}
              />
            ) : null}
            {displayedOutput.error ? (
              <div style={{ margin: "0 0 8px" }}>
                <CellOutput
                  output={{ logs: [], error: displayedOutput.error }}
                  onFrameClick={
                    tracebackNavigationEnabled
                      ? handleTracebackFrameClick
                      : undefined
                  }
                  containerTestId="code-run-error"
                  showExportControl={false}
                  // A compile that failed is not a traceback: its card names
                  // the failure and lists where the compiler stopped. Nor is
                  // a run the service declined before it started.
                  errorLabel={
                    runErrorIsCompileFailure || displayedOutput.notStarted
                      ? null
                      : undefined
                  }
                  errorDetails={
                    runErrorIsCompileFailure && latexCardProblems.length > 0 ? (
                      <CodeRunProblemList
                        problems={latexCardProblems}
                        lineLabel={(problem) =>
                          latexLogEntryLocation(problem.entry, t)
                        }
                        jumpLabel={(problem) =>
                          t("codeOutput.latex.openLocation", {
                            file: problem.entry.file ?? "",
                            line: problem.entry.line ?? 1,
                          })
                        }
                        moreLabel={(count) =>
                          t("code.runError.moreProblems", { count })
                        }
                        onReveal={(problem) => openLatexLogEntry(problem.entry)}
                        onShowAll={showLatexReport}
                      />
                    ) : runErrorIsCompileFailure &&
                    currentCompilerProblems.length > 0 ? (
                      <CodeRunProblemList
                        problems={currentCompilerProblems}
                        lineLabel={(problem) =>
                          language === "latex"
                            ? t("codeOutput.frameLine", { line: problem.line })
                            : t("code.problems.location", {
                                line: problem.line,
                                col: problem.col,
                              })
                        }
                        jumpLabel={(problem) =>
                          t("codeOutput.jumpToLine", { line: problem.line })
                        }
                        moreLabel={(count) =>
                          t("code.runError.moreProblems", { count })
                        }
                        onReveal={(problem) =>
                          revealCodeRange(problem.from, problem.to)
                        }
                        onShowAll={
                          USE_CODEMIRROR_EDITOR
                            ? openWorkspaceProblems
                            : undefined
                        }
                      />
                    ) : undefined
                  }
                  errorAction={
                    runtimeGuard && output === runtimeGuard.output ? (
                      <CodeRunRuntimeGuardActions
                        rewriteLabel={t("code.runtimeGuard.rewrite")}
                        rewriteAccessibleLabel={
                          runtimeGuardRewriteDisabledReason
                            ? `${t("code.runtimeGuard.rewrite")}: ${runtimeGuardRewriteDisabledReason}`
                            : t("code.runtimeGuard.rewriteHint")
                        }
                        rewriteDisabledReason={runtimeGuardRewriteDisabledReason ?? null}
                        onRewrite={askAiToRewriteForThePage}
                        runAnywayLabel={t("code.runtimeGuard.runAnyway")}
                        runAnywayHint={t("code.runtimeGuard.runAnywayHint")}
                        onRunAnyway={() => {
                          runtimeGuardOverrideRef.current = runtimeGuard.source;
                          void handleRun();
                        }}
                      />
                    ) : // Nothing in the code to explain when the run never began.
                    displayedOutput.notStarted ? undefined : (
                      null
                    )
                  }
                />
                {visibleRunErrorAiFailure ? (
                  null
                ) : null}
              </div>
            ) : null}
            {outputLogWindow.hiddenBefore > 0 ? (
              <button
                type="button"
                data-testid="code-output-truncation"
                data-hidden={outputLogWindow.hiddenBefore}
                onClick={showOlderOutputLogs}
                title={t("code.outputTruncatedHead", {
                  hidden: outputLogWindow.hiddenBefore,
                })}
                className={styles.outputPager}
              >
                <span className={styles.outputPagerFace}>
                <ArrowUp size={11} aria-hidden="true" />
                {t("codeOutput.showOutput")} (+
                {Math.min(
                  RUN_OUTPUT_LOG_PAGE_SIZE,
                  outputLogWindow.hiddenBefore,
                )}
                )
                </span>
              </button>
            ) : null}
            {outputLogWindow.lines.map((line) => {
              const searchMatch = outputSearchMatchIndices.has(line.index);
              const activeSearchMatch =
                outputSearchActiveMatch?.index === line.index;
              return (
                <pre
                  key={line.index}
                  data-stream={line.stream}
                  data-log-index={line.index}
                  data-search-match={
                    activeSearchMatch
                      ? "active"
                      : searchMatch
                        ? "true"
                        : undefined
                  }
                  style={{
                    margin: 0,
                    whiteSpace: effectiveOutputWrap ? "pre-wrap" : "pre",
                    // Wrap also breaks a long unbroken token (a URL, base64,
                    // minified JSON), which pre-wrap alone left overflowing.
                    overflowWrap: effectiveOutputWrap ? "anywhere" : "normal",
                    // Per theme: #b91c1c on this panel's dark background
                    // (#161b22) is about 2.7:1, under the 4.5:1 minimum, so
                    // stderr was barely readable exactly where it matters.
                    color:
                      line.stream === "stderr"
                        ? isDark
                          ? "#fca5a5"
                          : "#b91c1c"
                        : undefined,
                    background: activeSearchMatch
                      ? "color-mix(in srgb, var(--brand-v2, #0D9488) 18%, transparent)"
                      : searchMatch
                        ? "color-mix(in srgb, #f59e0b 16%, transparent)"
                        : undefined,
                    boxShadow: activeSearchMatch
                      ? "inset 3px 0 var(--brand-v2, #0D9488)"
                      : undefined,
                  }}
                >
                  <AnsiText text={line.text} />
                </pre>
              );
            })}
            {outputLogWindow.hiddenAfter > 0 ? (
              <button
                type="button"
                data-testid="code-output-newer"
                data-hidden={outputLogWindow.hiddenAfter}
                onClick={showNewerOutputLogs}
                className={styles.outputPager}
                data-direction="newer"
              >
                <span className={styles.outputPagerFace}>
                <ArrowDown size={11} aria-hidden="true" />
                {t("codeOutput.showOutput")} (+
                {Math.min(
                  RUN_OUTPUT_LOG_PAGE_SIZE,
                  outputLogWindow.hiddenAfter,
                )}
                )
                </span>
              </button>
            ) : null}
            {compiledDocument !== null &&
            output !== null &&
            isSameCompiledOutput(compiledDocument.output, output) ? (
              compiledDocumentWindowKey ? (
                <div
                  data-testid="code-output-pdf-window"
                  className={styles.outputPdfRow}
                >
                  <span className={styles.outputPdfName}>
                    {compiledDocument.filename}
                  </span>
                  {/* A draft's PDF already stands beside its source. */}
                  {draftReviewing ? null : (
                  <button
                    type="button"
                    data-testid="code-output-pdf-open-window"
                    onClick={() => showCompiledDocumentWindow(true)}
                    className={styles.outputChipButton}
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    {t("codeOutput.pdf.openWindow")}
                  </button>
                  )}
                  <button
                    type="button"
                    data-testid="code-output-pdf-download"
                    onClick={downloadCompiledDocument}
                    className={styles.outputChipButton}
                  >
                    <Download size={13} aria-hidden="true" />
                    {t("codeOutput.pdf.download")}
                  </button>
                </div>
              ) : (
                <CodeCompiledPdfPreview
                  artifact={compiledDocument.artifact}
                  root={outputScrollRef}
                  onDownload={downloadCompiledDocument}
                  highlight={inlinePdfHighlight}
                  onPointDoubleClick={
                    outputFile(latexCompile?.files.outputFiles, OUTPUT_SYNCTEX_NAME)
                      ? (page, point) => void goToLatexSourceFromPdf(page, point)
                      : undefined
                  }
                />
              )
            ) : compiledDocumentNotKept ? (
              <p
                data-testid="code-output-pdf-not-kept"
                className={styles.outputNote}
              >
                {t("codeOutput.pdf.notKept")}
              </p>
            ) : null}
            {latexCompile?.timedOutLimitMs != null &&
            output &&
            isSameCompiledOutput(latexCompile.output, output) ? (
              <LatexCompileTimeoutNotice
                limitMs={latexCompile.timedOutLimitMs}
                draftMode={latexDraftMode}
                onUseDraftMode={codeMayAuthor && !running ? compileLatexInDraftMode : undefined}
              />
            ) : null}
            {shownLatexLog && latexCompile ? (
              <LatexCompileReport
                ref={latexReportRef}
                files={latexCompile.files}
                entries={shownLatexLog.entries}
                logText={shownLatexLog.text}
                omittedBytes={shownLatexLog.omittedBytes}
                onOpenEntry={openLatexLogEntry}
              />
            ) : null}
            {(displayedOutput.images ?? []).map((b64, index) => {
              const candidateMime = displayedOutput.imageMimes?.[index];
              const mime = isAllowedRichImageMime(candidateMime)
                ? candidateMime
                : "image/png";
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  data-testid="code-output-image"
                  src={`data:${mime};base64,${b64}`}
                  alt={t("code.figureAlt")}
                  className={styles.outputFigure}
                />
              );
            })}
            {displayedOutput.html &&
            output !== null &&
            output === htmlPreviewOutput ? (
              <CodeHtmlPagePreview
                key={htmlPreviewGeneration}
                source={displayedOutput.html}
                widgetId={`code-html-preview-${pageId}`}
                title={t("code.htmlPreviewTitle")}
                blockedLabel={t("code.htmlPreviewBlocked")}
              />
            ) : displayedOutput.html ? (
              <RichCodeHtmlOutput
                html={displayedOutput.html}
                title={t("code.htmlOutputTitle")}
              />
            ) : null}
            {displayedOutput.rich ? (
              <div
                data-testid="code-output-rich"
                className={styles.outputRich}
              >
                <CellOutput
                  output={{ logs: [], rich: displayedOutput.rich }}
                  containerTestId="code-output-rich-content"
                  showExportControl={false}
                />
              </div>
            ) : null}
            {displayedOutput.result !== undefined &&
            !displayedOutput.rich ? (
              <pre
                style={{
                  margin: 0,
                  color: "var(--console-accent-strong, #0d9488)",
                  whiteSpace: effectiveOutputWrap ? "pre-wrap" : "pre",
                  overflowWrap: effectiveOutputWrap ? "anywhere" : "normal",
                }}
              >
                {"⇒ "}
                <AnsiText text={displayedOutput.result} />
              </pre>
            ) : null}
            {!displayedOutput.error &&
            displayedOutput.logs.length === 0 &&
            displayedOutput.result === undefined &&
            !displayedOutput.html &&
            !displayedOutput.rich &&
            (displayedOutput.notebookOutputs?.length ?? 0) === 0 &&
            (displayedOutput.images ?? []).length === 0 ? (
              <span style={{ color: "#9ca3af" }}>{t("code.noOutput")}</span>
            ) : null}
          </div>
          </section>
            )}
          </CodeOutputPanel>
        ) : (
          <CodeOutputCollapsedPill
            type="button"
            data-testid="code-output-collapsed"
            data-output-count={outputCount}
            onClick={() => updateOutputPanelVisibility(true)}
            aria-label={t("codeOutput.showOutput")}
            aria-expanded={false}
            aria-controls="code-output-panel"
            aria-keyshortcuts="Control+J Meta+J"
            title={`${t("codeOutput.showOutput")} · Ctrl/⌘ J`}
            // A glass pill over the editor's lower right: hidden output
            // takes no room from the code.
            className={styles.outputPill}
          >
            <ChevronUp size={13} aria-hidden="true" />
            <span>{t("codeOutput.output")}</span>
            <span aria-hidden="true" className={styles.outputPillCount}>
              {outputCount}
            </span>
          </CodeOutputCollapsedPill>
        )
      ) : null}
        </div>
        <CodeTaskPaneDockHost docks={codeTaskPaneDocks} />
      </div>
      {/* The active pane's status bar, at the window's bottom edge below the
          output (VS Code, Word): opening the output never lifts it. */}
      <div
        ref={setStatusBarHost}
        data-testid="code-status-host"
        style={{ display: "flex", flexDirection: "column", flex: "0 0 auto", minWidth: 0 }}
      />
      <CodeRefactorPreviewPanel
        plan={refactorPreviewPlan}
        planCurrent={refactorPreviewCurrent}
        receipt={refactorUndoReceipt}
        receiptCurrent={refactorUndoCurrent}
        busy={refactorPreviewBusy}
        onApply={applyRefactorPreview}
        onDiscard={discardRefactorPreview}
        onUndo={undoRefactorPreview}
        onRunSuggested={runnable ? () => void handleRun() : undefined}
      />
      {/* Flag-gated, non-destructive live diff preview of any pending AI
          `update_page` proposal that targets THIS open code page. OFF
          (default) renders nothing — the overlay component is never mounted,
          so there is zero added work or DOM and the window is byte-for-byte
          today. The overlay only READS the current content (via the edit-
          context bus) and routes Accept/Reject through the existing
          confirm/reject endpoints; it never writes to the editor. */}
      {ENABLE_INLINE_PROPOSAL_DIFF ? (
        null
      ) : null}
    </div>
    </OfficeTaskPaneChromeProvider>
    </OfficeDialogChromeProvider>
  );
}

// ---------------------------------------------------------------------------
// CodeWorkspaceExplorerPanel
// ---------------------------------------------------------------------------

function CodeWorkspaceExplorerPanel({
  panelRef,
  tree,
  collapsedPaths,
  fileCount,
  conflictCount,
  catalogTruncated,
  loading,
  loadError,
  mutationActionsVisible,
  mutationDisabledReason,
  defaultNewPath,
  occupiedPathIdentities,
  onCreateFile,
  onUploadFiles,
  onRenameFile,
  onDuplicateFile,
  onDeleteFile,
  onToggleDirectory,
  onActivateFile,
  onRefresh,
  onClose,
  t,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  tree: CodeWorkspaceTree;
  collapsedPaths: ReadonlySet<string>;
  fileCount: number;
  conflictCount: number;
  catalogTruncated: boolean;
  loading: boolean;
  loadError: boolean;
  mutationActionsVisible: boolean;
  mutationDisabledReason?: string;
  defaultNewPath: string;
  occupiedPathIdentities: ReadonlySet<string>;
  onCreateFile: (path: string) => Promise<CodeWorkspaceMutationResult>;
  /** Upload local files into `folder` ("" is the workspace root). */
  onUploadFiles: (
    files: readonly File[],
    folder: string,
  ) => Promise<CodeWorkspaceMutationResult>;
  onRenameFile: (
    file: CodeWorkspaceFile,
    path: string,
  ) => Promise<CodeWorkspaceMutationResult>;
  onDuplicateFile: (
    file: CodeWorkspaceFile,
    path: string,
  ) => Promise<CodeWorkspaceMutationResult>;
  onDeleteFile: (
    file: CodeWorkspaceFile,
  ) => Promise<CodeWorkspaceMutationResult>;
  onToggleDirectory: (path: string) => void;
  onActivateFile: (file: CodeWorkspaceFile) => void;
  onRefresh: (() => void) | null;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mutationInputRef = useRef<HTMLInputElement>(null);
  const mutationInvokerRef = useRef<HTMLButtonElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef("");
  const [mutationEditor, setMutationEditor] = useState<{
    mode: "create" | "rename" | "duplicate";
    file: CodeWorkspaceFile | null;
    path: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<CodeWorkspaceFile | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationBusyRef = useRef(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const safeActiveIndex =
    tree.rows.length === 0
      ? 0
      : Math.min(activeIndex, tree.rows.length - 1);
  const selectedRow = tree.rows[safeActiveIndex] ?? null;
  const selectedFile = selectedRow?.file ?? null;
  const selectedFilePageId = selectedFile?.pageId ?? "";
  // Uploads land in the selected folder, or beside the selected file.
  const uploadFolder = !selectedRow
    ? ""
    : selectedRow.kind === "directory"
      ? selectedRow.path
      : selectedRow.path.slice(0, Math.max(0, selectedRow.path.lastIndexOf("/")));
  const subscribeSelectedFileExecution = useCallback(
    (listener: () => void) =>
      selectedFilePageId
        ? subscribePageExecution(selectedFilePageId, listener)
        : () => undefined,
    [selectedFilePageId],
  );
  const readSelectedFileExecution = useCallback(
    () =>
      selectedFilePageId
        ? getPageExecutionState(selectedFilePageId)
        : null,
    [selectedFilePageId],
  );
  const selectedFileExecution = useSyncExternalStore(
    subscribeSelectedFileExecution,
    readSelectedFileExecution,
    () => null,
  );
  const mutationEditorMode = mutationEditor?.mode;

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => rowRefs.current[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (!mutationEditorMode) return;
    const frame = requestAnimationFrame(() => {
      mutationInputRef.current?.focus();
      mutationInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [mutationEditorMode]);

  const finishMutationEditor = () => {
    const invoker = mutationInvokerRef.current;
    mutationInvokerRef.current = null;
    setMutationEditor(null);
    setMutationError(null);
    requestAnimationFrame(() => {
      if (invoker?.isConnected && !invoker.disabled) invoker.focus();
    });
  };

  const beginMutationEditor = (
    mode: "create" | "rename" | "duplicate",
    invoker: HTMLButtonElement,
  ) => {
    if (mutationBusyRef.current || mutationDisabledReason) return;
    const file = mode === "create" ? null : selectedFile;
    if (mode !== "create" && !file) return;
    mutationInvokerRef.current = invoker;
    setMutationError(null);
    if (mode === "create") {
      setMutationEditor({ mode, file: null, path: defaultNewPath });
      return;
    }
    if (mode === "rename") {
      setMutationEditor({ mode, file, path: file!.path });
      return;
    }
    const slash = file!.path.lastIndexOf("/");
    const directory = slash >= 0 ? file!.path.slice(0, slash + 1) : "";
    const basename = codeWorkspaceBasename(file!.path);
    const dot = basename.lastIndexOf(".");
    const stem = dot > 0 ? basename.slice(0, dot) : basename;
    const extension = dot > 0 ? basename.slice(dot) : "";
    setMutationEditor({
      mode,
      file,
      path: suggestedCodeWorkspacePath(
        `${directory}${stem}.copy${extension}`,
        occupiedPathIdentities,
      ),
    });
  };

  const submitMutationEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const editor = mutationEditor;
    if (!editor || mutationBusyRef.current || mutationDisabledReason) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationError(null);
    const result =
      editor.mode === "create"
        ? await onCreateFile(editor.path)
        : editor.mode === "rename" && editor.file
          ? await onRenameFile(editor.file, editor.path)
          : editor.file
            ? await onDuplicateFile(editor.file, editor.path)
            : { ok: false as const, message: t("document.capability.unavailable") };
    mutationBusyRef.current = false;
    setMutationBusy(false);
    if (result.ok) {
      finishMutationEditor();
    } else {
      setMutationError(result.message);
      requestAnimationFrame(() => mutationInputRef.current?.focus());
    }
  };

  const uploadFiles = async (files: readonly File[]) => {
    if (files.length === 0 || mutationBusyRef.current || mutationDisabledReason) {
      return;
    }
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationError(null);
    const result = await onUploadFiles(files, uploadFolderRef.current);
    mutationBusyRef.current = false;
    setMutationBusy(false);
    if (!result.ok) setMutationError(result.message);
  };

  const confirmDeleteFile = async () => {
    const file = deleteTarget;
    if (!file || mutationBusyRef.current || mutationDisabledReason) return;
    mutationBusyRef.current = true;
    setMutationBusy(true);
    setMutationError(null);
    const result = await onDeleteFile(file);
    mutationBusyRef.current = false;
    setMutationBusy(false);
    if (result.ok) {
      setDeleteTarget(null);
    } else {
      setMutationError(result.message);
      setDeleteTarget(null);
    }
  };

  const busyReason = mutationBusy ? t("code.loading") : undefined;
  const selectedFileReason = selectedFile
    ? undefined
    : t("code.workspaceExplorer.selectFile");
  const selectedFileRunningReason = selectedFileExecution
    ? t("code.workspaceExplorer.targetRunning")
    : undefined;
  const newFileDisabledReason = mutationDisabledReason ?? busyReason;
  const uploadFilesLabel = t("code.workspaceExplorer.uploadFiles", {
    folder: uploadFolder ? `${uploadFolder}/` : "/",
  });
  const renameFileDisabledReason =
    mutationDisabledReason ??
    busyReason ??
    selectedFileReason ??
    selectedFileRunningReason;
  const duplicateFileDisabledReason =
    mutationDisabledReason ?? busyReason ?? selectedFileReason;
  const deleteFileDisabledReason =
    mutationDisabledReason ??
    busyReason ??
    selectedFileReason ??
    selectedFileRunningReason;
  const mutationLabels = {
    create: t("code.workspaceExplorer.newFile"),
    rename: t("code.workspaceExplorer.renameMove"),
    duplicate: t("code.workspaceExplorer.duplicate"),
    delete: t("code.workspaceExplorer.delete"),
  };
  const mutationAccessibleLabel = (label: string, reason?: string) =>
    codeCommandAccessibleLabel({
      label,
      disabled: Boolean(reason),
      disabledReason: reason,
    });

  const focusRow = (nextIndex: number) => {
    if (tree.rows.length === 0) return;
    const bounded = Math.min(Math.max(nextIndex, 0), tree.rows.length - 1);
    setActiveIndex(bounded);
    rowRefs.current[bounded]?.focus();
  };

  const activateRow = (index: number) => {
    const row = tree.rows[index];
    if (!row) return;
    if (row.kind === "directory") {
      onToggleDirectory(row.path);
      return;
    }
    if (row.file) onActivateFile(row.file);
  };

  const focusParentDirectory = (index: number) => {
    const row = tree.rows[index];
    if (!row || row.depth === 0) return;
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      const possibleParent = tree.rows[candidate];
      if (
        possibleParent.kind === "directory" &&
        possibleParent.depth === row.depth - 1 &&
        row.path.startsWith(`${possibleParent.path}/`)
      ) {
        focusRow(candidate);
        return;
      }
    }
  };

  return (
    <aside
      ref={panelRef}
      id="code-workspace-explorer"
      data-testid="code-workspace-explorer"
      tabIndex={-1}
      aria-label={t("code.breadcrumbs.file")}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (mutationEditor) {
          finishMutationEditor();
          return;
        }
        onClose();
      }}
      // The left-hand counterpart of the docked task panes: the same glass
      // card, title row, icon buttons, fields and list rows (code chrome).
      className={`${officeDialogClassName({ tone: "code", pane: true })} ${workspacePanelStyles.explorer}`}
    >
      <header className={`${officeDialogParts.header} ${workspacePanelStyles.explorerHeader}`}>
        <h2 className={officeDialogParts.title}>{t("code.breadcrumbs.file")}</h2>
        <span
          data-testid="code-workspace-file-count"
          aria-label={`${t("code.breadcrumbs.file")}: ${fileCount}`}
          className={workspacePanelStyles.badge}
        >
          {fileCount}
        </span>
        <span className={workspacePanelStyles.spacer} />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            data-testid="code-workspace-refresh"
            title={t("pages.conflictRetry")}
            aria-label={t("pages.conflictRetry")}
            className={officeDialogParts.iconButton}
          >
            <RotateCcw aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          data-testid="code-workspace-close"
          title={t("common.close")}
          aria-label={t("common.close")}
          className={officeDialogParts.close}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      {mutationActionsVisible ? (
        <div
          role="toolbar"
          aria-label={t("code.workspaceExplorer.fileActions")}
          data-testid="code-workspace-file-actions"
          className={workspacePanelStyles.fileActions}
        >
          <button
            type="button"
            data-testid="code-workspace-new-file"
            disabled={Boolean(newFileDisabledReason)}
            title={mutationAccessibleLabel(
              mutationLabels.create,
              newFileDisabledReason,
            )}
            aria-label={mutationAccessibleLabel(
              mutationLabels.create,
              newFileDisabledReason,
            )}
            data-disabled-reason={newFileDisabledReason}
            onClick={(event) =>
              beginMutationEditor("create", event.currentTarget)
            }
            className={officeDialogParts.iconButton}
          >
            <FilePlus2 aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="code-workspace-upload-files"
            disabled={Boolean(newFileDisabledReason)}
            title={mutationAccessibleLabel(
              uploadFilesLabel,
              newFileDisabledReason,
            )}
            aria-label={mutationAccessibleLabel(
              uploadFilesLabel,
              newFileDisabledReason,
            )}
            data-disabled-reason={newFileDisabledReason}
            onClick={() => {
              if (newFileDisabledReason || mutationBusyRef.current) return;
              uploadFolderRef.current = uploadFolder;
              uploadInputRef.current?.click();
            }}
            className={officeDialogParts.iconButton}
          >
            <Upload aria-hidden="true" />
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            aria-hidden="true"
            data-testid="code-workspace-upload-input"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void uploadFiles(files);
            }}
          />
          <button
            type="button"
            data-testid="code-workspace-rename-file"
            disabled={Boolean(renameFileDisabledReason)}
            title={mutationAccessibleLabel(
              mutationLabels.rename,
              renameFileDisabledReason,
            )}
            aria-label={mutationAccessibleLabel(
              mutationLabels.rename,
              renameFileDisabledReason,
            )}
            data-disabled-reason={renameFileDisabledReason}
            onClick={(event) =>
              beginMutationEditor("rename", event.currentTarget)
            }
            className={officeDialogParts.iconButton}
          >
            <Pencil aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="code-workspace-duplicate-file"
            disabled={Boolean(duplicateFileDisabledReason)}
            title={mutationAccessibleLabel(
              mutationLabels.duplicate,
              duplicateFileDisabledReason,
            )}
            aria-label={mutationAccessibleLabel(
              mutationLabels.duplicate,
              duplicateFileDisabledReason,
            )}
            data-disabled-reason={duplicateFileDisabledReason}
            onClick={(event) =>
              beginMutationEditor("duplicate", event.currentTarget)
            }
            className={officeDialogParts.iconButton}
          >
            <Copy aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="code-workspace-delete-file"
            disabled={Boolean(deleteFileDisabledReason)}
            title={mutationAccessibleLabel(
              mutationLabels.delete,
              deleteFileDisabledReason,
            )}
            aria-label={mutationAccessibleLabel(
              mutationLabels.delete,
              deleteFileDisabledReason,
            )}
            data-disabled-reason={deleteFileDisabledReason}
            onClick={(event) => {
              if (!selectedFile || deleteFileDisabledReason) return;
              mutationInvokerRef.current = event.currentTarget;
              setMutationError(null);
              setDeleteTarget(selectedFile);
            }}
            className={officeDialogParts.iconButton}
            data-tone="danger"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {mutationEditor ? (
        <form
          data-testid="code-workspace-path-form"
          onSubmit={(event) => void submitMutationEditor(event)}
          className={workspacePanelStyles.pathForm}
        >
          <label
            htmlFor="code-workspace-path-input"
            className={officeDialogParts.label}
          >
            {mutationLabels[mutationEditor.mode]}
          </label>
          <input
            ref={mutationInputRef}
            id="code-workspace-path-input"
            data-testid="code-workspace-path-input"
            value={mutationEditor.path}
            maxLength={MAX_CODE_WORKSPACE_PATH_CHARS}
            spellCheck={false}
            aria-invalid={Boolean(mutationError) || undefined}
            onChange={(event) => {
              setMutationError(null);
              setMutationEditor((current) =>
                current ? { ...current, path: event.target.value } : current,
              );
            }}
            className={`${officeDialogParts.field} ${officeDialogParts.mono}`}
          />
          <button
            type="submit"
            data-testid="code-workspace-path-confirm"
            disabled={mutationBusy}
            className={`${officeDialogParts.primaryButton} office-dialog__button--compact`}
          >
            {mutationBusy
              ? t("code.loading")
              : mutationLabels[mutationEditor.mode]}
          </button>
          <button
            type="button"
            data-testid="code-workspace-path-cancel"
            disabled={mutationBusy}
            onClick={finishMutationEditor}
            className={officeDialogParts.iconButton}
            title={t("common.cancel")}
            aria-label={t("common.cancel")}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </form>
      ) : null}
      {mutationError ? (
        <div
          role="alert"
          data-testid="code-workspace-mutation-error"
          className={`${officeDialogParts.error} ${workspacePanelStyles.errorRow}`}
        >
          <CircleAlert size={12} aria-hidden="true" />
          <span>{mutationError}</span>
        </div>
      ) : null}
      {loadError ? (
        <div
          role="alert"
          data-testid="code-workspace-error"
          className={`${officeDialogParts.error} ${workspacePanelStyles.errorRow}`}
        >
          <CircleAlert size={13} aria-hidden="true" />
          <span>{t("pages.loadFailed")}</span>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              data-testid="code-workspace-error-retry"
              className={officeDialogParts.compactButton}
            >
              {t("pages.conflictRetry")}
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        role="tree"
        aria-label={t("code.breadcrumbs.file")}
        aria-busy={loading}
        data-testid="code-workspace-tree"
        className={`${officeDialogParts.list} ${workspacePanelStyles.tree}`}
      >
        {tree.rows.length === 0 && !loading ? (
          <div
            role="status"
            data-testid="code-workspace-empty"
            className={`${officeDialogParts.message} ${workspacePanelStyles.treeEmpty}`}
          >
            {t("code.findInFiles.empty")}
          </div>
        ) : (
          tree.rows.map((row, index) => {
            const collapsed =
              row.kind === "directory" && collapsedPaths.has(row.path);
            const current = row.file?.current ?? false;
            return (
              <button
                key={row.id}
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                type="button"
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={
                  row.kind === "directory" ? !collapsed : undefined
                }
                aria-current={current ? "page" : undefined}
                aria-selected={current}
                aria-label={
                  row.file?.pathConflict
                    ? `${row.path} · ${t("pages.conflict")}`
                    : row.path
                }
                tabIndex={index === safeActiveIndex ? 0 : -1}
                className={`${officeDialogParts.listItem} ${workspacePanelStyles.treeRow} mrnote-code-workspace-row`}
                data-testid={`code-workspace-${
                  row.kind === "directory" ? "directory" : "file"
                }`}
                data-path={row.path}
                data-current={current ? "true" : undefined}
                onFocus={() => setActiveIndex(index)}
                onClick={() => activateRow(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusRow(index + 1);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusRow(index - 1);
                    return;
                  }
                  if (event.key === "Home") {
                    event.preventDefault();
                    focusRow(0);
                    return;
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    focusRow(tree.rows.length - 1);
                    return;
                  }
                  if (event.key === "ArrowRight") {
                    if (row.kind !== "directory") return;
                    event.preventDefault();
                    if (collapsed) {
                      onToggleDirectory(row.path);
                    } else {
                      const child = tree.rows[index + 1];
                      if (child && child.depth > row.depth) {
                        focusRow(index + 1);
                      }
                    }
                    return;
                  }
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    if (row.kind === "directory" && !collapsed) {
                      onToggleDirectory(row.path);
                    } else {
                      focusParentDirectory(index);
                    }
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activateRow(index);
                  }
                }}
                // The tree's depth is the one value the shared row cannot know.
                style={{ paddingInlineStart: 6 + row.depth * 14 }}
              >
                {row.kind === "directory" ? (
                  collapsed ? (
                    <ChevronRight size={12} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={12} aria-hidden="true" />
                  )
                ) : (
                  <span />
                )}
                {row.kind === "directory" ? (
                  collapsed ? (
                    <Folder size={13} aria-hidden="true" />
                  ) : (
                    <FolderOpen size={13} aria-hidden="true" />
                  )
                ) : (
                  <FileCode2 size={13} aria-hidden="true" />
                )}
                <span title={row.path} className={workspacePanelStyles.text}>
                  {row.name}
                </span>
                {row.file?.pathConflict ? (
                  <CircleAlert size={12} aria-hidden="true" data-tone="danger" />
                ) : current ? (
                  <Check size={12} aria-hidden="true" data-tone="accent" />
                ) : (
                  <span />
                )}
              </button>
            );
          })
        )}
      </div>
      {loading ||
      tree.truncated ||
      catalogTruncated ||
      conflictCount > 0 ? (
        <footer
          role="status"
          data-testid="code-workspace-status"
          className={`${officeDialogParts.hint} ${workspacePanelStyles.explorerStatus}`}
        >
          {loading ? (
            <>
              <RotateCcw size={11} aria-hidden="true" />
              {t("common.loading")}
            </>
          ) : (
            <>
              <span>
                {tree.rows.length}/{tree.totalRows}
                {catalogTruncated || !tree.totalRowsExact ? "+" : ""}
              </span>
              {conflictCount > 0 ? (
                <>
                  <CircleAlert size={11} aria-hidden="true" data-tone="danger" />
                  <span>{conflictCount}</span>
                </>
              ) : null}
            </>
          )}
        </footer>
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={mutationLabels.delete}
        body={
          deleteTarget
            ? t("code.workspaceExplorer.deleteConfirm", {
                path: deleteTarget.path,
              })
            : undefined
        }
        confirmLabel={mutationLabels.delete}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={() => void confirmDeleteFile()}
        onCancel={() => {
          if (mutationBusy) return;
          setDeleteTarget(null);
        }}
      />
    </aside>
  );
}

/** The hidden output's pill: over the editor's lower right, above the Debug
 * and Console panels standing below it in the column. */
function CodeOutputCollapsedPill(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  useBottomPanelsInset(ref);
  return <button ref={ref} {...props} />;
}

/** A compiled PDF window's width when there is room for it beside its Code
 * window: a portrait page read at about its own size. */
const COMPILED_DOCUMENT_WINDOW_WIDTH = 680;

// ---------------------------------------------------------------------------
// CodeWindowQuickOpenPanel
// ---------------------------------------------------------------------------

function CodeWindowQuickOpenPanel({
  inputRef,
  query,
  onQueryChange,
  result,
  activeIndex,
  onActiveIndexChange,
  onActivate,
  loading,
  loadError,
  onRetry,
  onClose,
  t,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (query: string) => void;
  result: CodeQuickOpenResult;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onActivate: (entryId: string) => void;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef]);

  const activeEntry = activeIndex >= 0 ? result.entries[activeIndex] : null;
  const activeDescendant = activeEntry
    ? `code-quick-open-option-${activeIndex}`
    : undefined;

  const moveActive = (direction: -1 | 1) => {
    if (result.entries.length === 0) return;
    const current = activeIndex < 0 ? 0 : activeIndex;
    onActiveIndexChange(
      (current + direction + result.entries.length) % result.entries.length,
    );
  };

  // VS Code's Quick Open in the shared dialog chrome: a card floating over the
  // top of the editor (it takes no rows from the code), the query in an input
  // group, the files as list rows.
  return (
    <div className={workspacePanelStyles.paletteAnchor}>
    <div
      id="code-quick-open-panel"
      data-testid="code-quick-open-panel"
      role="dialog"
      aria-modal="false"
      aria-busy={loading}
      aria-label={t("code.breadcrumbs.file")}
      className={`${officeDialogClassName({ tone: "code" })} ${workspacePanelStyles.palette}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          if (result.entries.length > 0) onActiveIndexChange(0);
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          if (result.entries.length > 0) {
            onActiveIndexChange(result.entries.length - 1);
          }
          return;
        }
        if (event.key === "Enter" && activeEntry) {
          event.preventDefault();
          event.stopPropagation();
          onActivate(activeEntry.id);
        }
      }}
    >
      <div className={workspacePanelStyles.paletteHead}>
        <label
          htmlFor="code-quick-open-input"
          className={officeDialogParts.inputGroup}
        >
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            id="code-quick-open-input"
            data-testid="code-quick-open-input"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={
              result.entries.length > 0 ? "code-quick-open-options" : undefined
            }
            aria-expanded="true"
            aria-activedescendant={activeDescendant}
            aria-label={t("code.breadcrumbs.file")}
            value={query}
            maxLength={CODE_QUICK_OPEN_QUERY_LIMIT}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("code.findInFiles.placeholder")}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd
            title={t("code.palette.cmd.goToLine")}
            aria-label={t("code.palette.cmd.goToLine")}
            className={workspacePanelStyles.kbd}
          >
            :12:3
          </kbd>
        </label>
        <button
          type="button"
          onClick={onClose}
          title={t("common.close")}
          aria-label={t("common.close")}
          data-testid="code-quick-open-close"
          className={officeDialogParts.iconButton}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {loadError ? (
        <div
          role="alert"
          data-testid="code-quick-open-error"
          className={`${officeDialogParts.error} ${workspacePanelStyles.errorRow} ${workspacePanelStyles.paletteNote}`}
        >
          <CircleAlert size={13} aria-hidden="true" />
          <span>{t("pages.loadFailed")}</span>
          <button
            type="button"
            className={officeDialogParts.compactButton}
            onClick={onRetry}
            data-testid="code-quick-open-retry"
          >
            <RotateCcw size={12} aria-hidden="true" />
            {t("pages.conflictRetry")}
          </button>
        </div>
      ) : loading ? (
        <p
          role="status"
          data-testid="code-quick-open-loading"
          className={`${officeDialogParts.hint} ${workspacePanelStyles.paletteNote}`}
        >
          {t("common.loading")}
        </p>
      ) : null}
      {result.entries.length === 0 ? (
        <p
          data-testid="code-quick-open-empty"
          role="status"
          className={`${officeDialogParts.message} ${workspacePanelStyles.paletteEmpty}`}
        >
          {t("code.findInFiles.empty")}
        </p>
      ) : (
        <div
          id="code-quick-open-options"
          data-testid="code-quick-open-options"
          role="listbox"
          aria-label={t("code.breadcrumbs.file")}
          className={workspacePanelStyles.paletteList}
        >
          {result.entries.map((entry, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={entry.id}
                id={`code-quick-open-option-${index}`}
                type="button"
                role="option"
                aria-selected={active}
                aria-current={entry.current ? "true" : undefined}
                className={`${officeDialogParts.listItem} ${workspacePanelStyles.paletteOption} mrnote-code-quick-open-option`}
                data-testid="code-quick-open-option"
                data-active={active ? "true" : undefined}
                data-current={entry.current ? "true" : undefined}
                onMouseMove={() => onActiveIndexChange(index)}
                onClick={() => onActivate(entry.id)}
              >
                {entry.current ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <FileCode2 size={14} aria-hidden="true" />
                )}
                <span className={workspacePanelStyles.text}>{entry.label}</span>
                <span className={workspacePanelStyles.language}>
                  {entry.language}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {result.truncated ? (
        <p
          data-testid="code-quick-open-truncated"
          role="status"
          className={`${officeDialogParts.hint} ${workspacePanelStyles.paletteNote} ${workspacePanelStyles.paletteCount}`}
        >
          {result.entries.length}/{result.total}
        </p>
      ) : null}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CodeWindowProblemsPanel
// ---------------------------------------------------------------------------

type CodeProblemFilterSeverity = "error" | "warning" | "info";

const CODE_PROBLEM_FILTER_SEVERITIES: readonly CodeProblemFilterSeverity[] = [
  "error",
  "warning",
  "info",
];

function codeProblemFilterSeverity(
  severity: CodeWindowProblemSeverity,
): CodeProblemFilterSeverity {
  return severity === "hint" ? "info" : severity;
}

function CodeWindowProblemsPanel({
  panelRef,
  snapshot,
  onClose,
  t,
}: {
  panelRef: RefObject<HTMLElement | null>;
  snapshot: WorkspaceProblemSnapshot;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [query, setQuery] = useState("");
  const [enabledSeverities, setEnabledSeverities] = useState<
    ReadonlySet<CodeProblemFilterSeverity>
  >(() => new Set(CODE_PROBLEM_FILTER_SEVERITIES));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGroups = useMemo(
    () =>
      snapshot.groups.flatMap((group) => {
        const groupMatches = group.label
          .toLocaleLowerCase()
          .includes(normalizedQuery);
        const problems = group.problems.filter(
          (problem) =>
            enabledSeverities.has(
              codeProblemFilterSeverity(problem.severity),
            ) &&
            (normalizedQuery.length === 0 ||
              groupMatches ||
              problem.message.toLocaleLowerCase().includes(normalizedQuery)),
        );
        return problems.length > 0 ? [{ ...group, problems }] : [];
      }),
    [enabledSeverities, normalizedQuery, snapshot.groups],
  );
  const visibleProblemCount = filteredGroups.reduce(
    (count, group) => count + group.problems.length,
    0,
  );
  const filterActive =
    normalizedQuery.length > 0 ||
    enabledSeverities.size !== CODE_PROBLEM_FILTER_SEVERITIES.length;

  // Arrow keys, Home and End move between the problem rows, as a list does.
  const moveBetweenRows = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      !(event.target instanceof HTMLButtonElement) ||
      event.target.dataset.testid !== "code-workspace-problem-item" ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-testid="code-workspace-problem-item"]:not(:disabled)',
      ),
    );
    const currentIndex = items.indexOf(event.target);
    if (currentIndex === -1 || items.length === 0) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? Math.min(currentIndex + 1, items.length - 1)
            : Math.max(currentIndex - 1, 0);
    items[nextIndex]?.focus();
  };

  // The shared Office task pane, docked at the window's right edge with the
  // other panes (Docs' Navigation, Excel's Error Checking): a search field,
  // the severities as a segmented filter, the problems as list rows.
  return (
    <OfficeTaskPane
      id="code-workspace-problems-panel"
      title={t("code.problems.title")}
      closeLabel={t("code.problems.close")}
      onClose={onClose}
      testIdPrefix="code-workspace-problems"
      testId="code-workspace-problems-panel"
      closeTestId="code-workspace-problems-close"
      paneRef={panelRef}
      dockRight={false}
      onKeyDown={moveBetweenRows}
      headerActions={
        <span
          data-testid="code-workspace-problems-count"
          aria-live="polite"
          className={workspacePanelStyles.count}
        >
          {t("code.problems.count", {
            count: filterActive ? visibleProblemCount : snapshot.totalCount,
          })}
          {filterActive
            ? ` · ${visibleProblemCount}/${snapshot.displayedCount}`
            : snapshot.truncated
              ? ` · ${snapshot.displayedCount}/${snapshot.totalCount}`
              : ""}
        </span>
      }
    >
      <div
        data-testid="code-workspace-problems-filters"
        className={`${officeTaskPaneParts.section} ${workspacePanelStyles.filters}`}
      >
        <label className={officeDialogParts.inputGroup}>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            maxLength={128}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || query.length === 0) return;
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }}
            placeholder={t("code.find.findPlaceholder")}
            aria-label={t("code.find.findPlaceholder")}
            data-testid="code-workspace-problems-filter"
          />
        </label>
        <div
          role="group"
          aria-label={t("code.problems.title")}
          className={officeDialogParts.tabs}
        >
          {CODE_PROBLEM_FILTER_SEVERITIES.map((severity) => {
            const pressed = enabledSeverities.has(severity);
            const label = t(`code.problems.severity.${severity}`);
            return (
              <button
                key={severity}
                type="button"
                className={officeDialogParts.tab}
                aria-label={label}
                aria-pressed={pressed}
                data-testid={`code-workspace-problems-severity-${severity}`}
                onClick={() =>
                  setEnabledSeverities((current) => {
                    const next = new Set(current);
                    if (next.has(severity)) next.delete(severity);
                    else next.add(severity);
                    return next;
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {snapshot.totalCount === 0 ? (
        <p
          data-testid="code-workspace-problems-empty"
          role="status"
          className={`${officeTaskPaneParts.section} ${officeDialogParts.message}`}
        >
          {t("code.problems.none")}
        </p>
      ) : visibleProblemCount === 0 ? (
        <p
          data-testid="code-workspace-problems-filter-empty"
          role="status"
          className={`${officeTaskPaneParts.section} ${officeDialogParts.message}`}
        >
          {t("code.findInFiles.empty")}
        </p>
      ) : (
        <div
          role="list"
          aria-label={t("code.problems.title")}
          className={`${officeDialogParts.list} ${workspacePanelStyles.list}`}
        >
          {filteredGroups.map((group) => (
            <section
              key={`${group.pageId}:${group.windowId ?? ""}`}
              aria-label={group.label}
              data-testid="code-workspace-problem-group"
            >
              <div className={workspacePanelStyles.fileHeading}>
                <span title={group.label} className={workspacePanelStyles.fileName}>
                  {group.label}
                </span>
                <span aria-hidden="true" className={workspacePanelStyles.count}>
                  {filterActive ? group.problems.length : group.totalCount}
                </span>
              </div>
              {group.problems.map((problem, index) => {
                const filteredSeverity = codeProblemFilterSeverity(
                  problem.severity,
                );
                const severityLabel = t(
                  filteredSeverity === "error"
                    ? "code.problems.severity.error"
                    : filteredSeverity === "warning"
                      ? "code.problems.severity.warning"
                      : "code.problems.severity.info",
                );
                return (
                  <button
                    key={`${problem.from}:${problem.to}:${index}`}
                    type="button"
                    role="listitem"
                    className={`${officeDialogParts.listItem} ${workspacePanelStyles.problem} mrnote-code-problem-row`}
                    data-testid="code-workspace-problem-item"
                    data-severity={problem.severity}
                    data-severity-group={filteredSeverity}
                    disabled={!group.revealRange}
                    onClick={() =>
                      group.revealRange?.(problem.from, problem.to)
                    }
                    title={problem.message}
                  >
                    <CircleAlert size={13} aria-label={severityLabel} />
                    <span className={workspacePanelStyles.location}>
                      {t("code.problems.location", {
                        line: problem.line,
                        col: problem.col,
                      })}
                    </span>
                    <span className={workspacePanelStyles.text}>
                      {problem.message}
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </OfficeTaskPane>
  );
}

// ---------------------------------------------------------------------------
// CodeWindowFindInFilesPanel
// ---------------------------------------------------------------------------

/**
 * The notebook-workspace Find-in-Files panel for the standalone code editor.
 * Adds a Replace-all-in-files row (Replace writes back into every matched window's
 * buffer through the code-window registry).
 *
 * Fully presentational: the parent computes `result` via {@link findInFiles}
 * and passes it in; this component only renders it and fires callbacks.
 */
function CodeWindowFindInFilesPanel({
  inputRef,
  query,
  onQueryChange,
  replacement,
  onReplacementChange,
  caseSensitive,
  onToggleCase,
  wholeWord,
  onToggleWord,
  regex,
  onToggleRegex,
  includeGlobs,
  onIncludeGlobsChange,
  excludeGlobs,
  onExcludeGlobsChange,
  result,
  activeHitKey,
  regexError,
  loading,
  loadError,
  onRetry,
  onActivateHit,
  onReplaceAll,
  replaceAllAvailable,
  replaceAllBlockedReason,
  canUndoReplace,
  onUndoReplace,
  onClose,
  t,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  replacement: string;
  onReplacementChange: (value: string) => void;
  caseSensitive: boolean;
  onToggleCase: () => void;
  wholeWord: boolean;
  onToggleWord: () => void;
  regex: boolean;
  onToggleRegex: () => void;
  includeGlobs: string;
  onIncludeGlobsChange: (value: string) => void;
  excludeGlobs: string;
  onExcludeGlobsChange: (value: string) => void;
  result: FindInFilesResult;
  activeHitKey: string | null;
  regexError: string | null;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onActivateHit: (hit: FindInFilesHit) => void;
  onReplaceAll: () => void;
  replaceAllAvailable: boolean;
  /** Why Replace All is unavailable, when the user can do something about it. */
  replaceAllBlockedReason: string | null;
  canUndoReplace: boolean;
  onUndoReplace: () => void;
  onClose: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const hasQuery = query.length > 0;
  const replaceAllDisabled =
    !hasQuery || !!regexError || result.total === 0 || !replaceAllAvailable;
  // Arrow keys, Home and End move between the hits, as a list does.
  const moveBetweenHits = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      !(event.target instanceof HTMLButtonElement) ||
      event.target.dataset.testid !== "code-find-in-files-hit" ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      return;
    }
    const hits = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-testid="code-find-in-files-hit"]',
      ),
    );
    const currentIndex = hits.indexOf(event.target);
    if (currentIndex === -1 || hits.length === 0) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? hits.length - 1
          : event.key === "ArrowDown"
            ? Math.min(currentIndex + 1, hits.length - 1)
            : Math.max(currentIndex - 1, 0);
    hits[nextIndex]?.focus();
  };
  const optionToggle = (
    pressed: boolean,
    onToggle: () => void,
    label: string,
    testId: string,
    face: string,
  ) => (
    <button
      type="button"
      className={`${officeDialogParts.tab} ${workspacePanelStyles.option}`}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-testid={testId}
    >
      {face}
    </button>
  );

  // The shared Office task pane in the window's right dock (Word's
  // Navigation pane, Excel's Find): the query with its match options, the
  // file filters, Replace All, then the hits grouped by file as list rows.
  return (
    <OfficeTaskPane
      title={t("code.findInFiles.toggle")}
      closeLabel={t("code.findInFiles.close")}
      onClose={onClose}
      testIdPrefix="code-find-in-files"
      testId="code-find-in-files"
      closeTestId="code-find-in-files-close"
      dockRight={false}
      busy={loading}
      onKeyDown={moveBetweenHits}
    >
      <div className={`${officeTaskPaneParts.section} ${workspacePanelStyles.filters}`}>
        <div className={workspacePanelStyles.queryRow}>
          <label className={officeDialogParts.inputGroup}>
            <FileSearch aria-hidden="true" />
            <input
              ref={inputRef}
              data-testid="code-find-in-files-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              maxLength={MAX_FIND_QUERY_CHARS}
              placeholder={t("code.findInFiles.placeholder")}
              aria-label={t("code.findInFiles.toggle")}
            />
          </label>
          <div
            role="group"
            aria-label={t("code.findInFiles.toggle")}
            className={officeDialogParts.tabs}
          >
            {optionToggle(caseSensitive, onToggleCase, t("codeOutput.findCase"), "code-find-in-files-case", "Aa")}
            {optionToggle(wholeWord, onToggleWord, t("codeOutput.findWholeWord"), "code-find-in-files-word", "ab")}
            {optionToggle(regex, onToggleRegex, t("codeOutput.findRegex"), "code-find-in-files-regex", ".*")}
          </div>
        </div>
        {/* Files to include / exclude (VS Code's search filters). Applies to
            the result tree AND to Replace All, so what you filter is what
            you edit. */}
        <div className={workspacePanelStyles.pair}>
          <input
            className={officeDialogParts.field}
            data-testid="code-find-in-files-include"
            value={includeGlobs}
            onChange={(event) =>
              onIncludeGlobsChange(boundSearchGlobInput(event.target.value))
            }
            maxLength={SEARCH_GLOB_INPUT_CHAR_LIMIT}
            placeholder={t("code.findInFiles.includePlaceholder")}
            aria-label={t("code.findInFiles.includeLabel")}
          />
          <input
            className={officeDialogParts.field}
            data-testid="code-find-in-files-exclude"
            value={excludeGlobs}
            onChange={(event) =>
              onExcludeGlobsChange(boundSearchGlobInput(event.target.value))
            }
            maxLength={SEARCH_GLOB_INPUT_CHAR_LIMIT}
            placeholder={t("code.findInFiles.excludePlaceholder")}
            aria-label={t("code.findInFiles.excludeLabel")}
          />
        </div>
        <div className={workspacePanelStyles.replaceRow}>
          <input
            className={officeDialogParts.field}
            data-testid="code-find-in-files-replace-input"
            value={replacement}
            onChange={(event) => onReplacementChange(event.target.value)}
            maxLength={4_096}
            placeholder={t("code.findInFiles.replacePlaceholder")}
            aria-label={t("code.findInFiles.replacePlaceholder")}
          />
          <button
            type="button"
            className={officeDialogParts.compactButton}
            onClick={onReplaceAll}
            disabled={replaceAllDisabled}
            data-testid="code-find-in-files-replace-all"
            title={
              regexError ??
              (hasQuery && result.total > 0 && replaceAllBlockedReason
                ? replaceAllBlockedReason
                : t("code.findInFiles.replaceAll"))
            }
            aria-label={regexError ?? t("code.findInFiles.replaceAll")}
            aria-description={
              !regexError && hasQuery && result.total > 0 && replaceAllBlockedReason
                ? replaceAllBlockedReason
                : undefined
            }
          >
            {t("code.find.replaceAllShort")}
          </button>
          <button
            type="button"
            className={officeDialogParts.compactButton}
            onClick={onUndoReplace}
            disabled={!canUndoReplace}
            data-testid="code-find-in-files-undo"
            title={t("toolbar.undo")}
            aria-label={t("toolbar.undo")}
          >
            {t("toolbar.undo")}
          </button>
        </div>
        <p
          data-testid="code-find-in-files-summary"
          className={regexError ? officeDialogParts.error : officeDialogParts.hint}
        >
          {regexError
            ? t("findReplace.regexError")
            : hasQuery
              ? (
                  <>
                    {t("code.findInFiles.summary", {
                      matches: result.total,
                      files: result.groups.length,
                    })}
                    {result.truncated ? (
                      <span
                        data-testid="code-find-in-files-truncated"
                        aria-label={`${result.total}+`}
                        title={`${result.total}+`}
                      >
                        +
                      </span>
                    ) : null}
                    {loading ? (
                      <span data-testid="code-find-in-files-loading">
                        {" · "}
                        {t("common.loading")}
                      </span>
                    ) : null}
                  </>
                )
              : t("code.findInFiles.hint")}
        </p>
        {loadError ? (
          <div
            role="alert"
            data-testid="code-find-in-files-error"
            className={`${officeDialogParts.error} ${workspacePanelStyles.errorRow}`}
          >
            <CircleAlert size={13} aria-hidden="true" />
            <span>{t("pages.loadFailed")}</span>
            <button
              type="button"
              className={officeDialogParts.compactButton}
              onClick={onRetry}
              data-testid="code-find-in-files-retry"
            >
              <RotateCcw size={12} aria-hidden="true" />
              {t("pages.conflictRetry")}
            </button>
          </div>
        ) : null}
      </div>
      {hasQuery && !regexError && result.total === 0 && !loading ? (
        <p
          data-testid="code-find-in-files-empty"
          className={`${officeTaskPaneParts.section} ${officeDialogParts.message}`}
        >
          {t("code.findInFiles.empty")}
        </p>
      ) : null}
      {result.groups.length > 0 ? (
        <div className={`${officeDialogParts.list} ${workspacePanelStyles.list}`}>
          {result.groups.map((group) => (
            <div
              key={group.bufferId}
              data-testid="code-find-in-files-group"
              data-buffer-id={group.bufferId}
            >
              <div className={workspacePanelStyles.fileHeading}>
                <span className={workspacePanelStyles.fileName}>{group.label}</span>
                <span className={workspacePanelStyles.count}>{group.hits.length}</span>
              </div>
              {group.hits.map((hit, hitIndex) => {
                const active = activeHitKey === findInFilesHitKey(hit);
                return (
                  <button
                    key={`${hit.line}:${hit.start}:${hitIndex}`}
                    className={`${officeDialogParts.listItem} ${workspacePanelStyles.hit} mrnote-code-fif-hit`}
                    type="button"
                    onClick={() => onActivateHit(hit)}
                    data-testid="code-find-in-files-hit"
                    data-active={active ? "true" : undefined}
                    data-selected={active ? "true" : undefined}
                    aria-current={active ? "true" : undefined}
                    title={t("code.findInFiles.lineLabel", { line: hit.line })}
                  >
                    <span className={workspacePanelStyles.location}>{hit.line}</span>
                    <span
                      data-testid="code-find-in-files-snippet"
                      className={workspacePanelStyles.text}
                    >
                      <FifHitSnippet hit={hit} />
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </OfficeTaskPane>
  );
}

/**
 * One result-line snippet with the match highlighted. Everything is React text
 * (no dangerouslySetInnerHTML).
 */
function FifHitSnippet({ hit }: { hit: FindInFilesHit }) {
  const startCol = Math.max(0, (hit.previewColumn ?? hit.column) - 1);
  const inLineMatch = hit.matchText.split("\n")[0] ?? "";
  const before = hit.lineText.slice(0, startCol);
  const matched = hit.lineText.slice(startCol, startCol + inLineMatch.length);
  const after = hit.lineText.slice(startCol + inLineMatch.length);
  return (
    <>
      {before}
      <mark
        style={{
          background: "var(--warning-surface, #fde68a)",
          color: "inherit",
          borderRadius: 2,
          padding: "0 1px",
        }}
      >
        {matched}
      </mark>
      {after}
    </>
  );
}
