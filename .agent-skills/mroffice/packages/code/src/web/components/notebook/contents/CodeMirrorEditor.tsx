"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CodeMirror 6 code editor — Stage 2 of the textarea -> CM6 migration.
 *
 * Drop-in compatible with {@link CodeEditor} (same prop contract): it can be
 * swapped in wherever `CodeEditor` is rendered, and the call sites pick between
 * the two via {@link USE_CODEMIRROR_EDITOR}. Shipping this is additive; flipping
 * the flag routes the Code surface through CodeMirror.
 *
 * Parity features layered on top of `basicSetup`:
 *  - per-language syntax highlighting through the shared lazy grammar loader
 *  - line-number gutter, bracket matching/auto-close, folding, comment toggle
 *  - multiple cursors + rectangular/column selection (Alt-drag)
 *  - FIND / REPLACE bar driving @codemirror/search, reusing the textarea
 *    editor's find-bar markup + data-testids (case, prev/next, replace,
 *    replace-all, match count, close) so existing find tests keep passing
 *  - GO-TO-LINE bar + Ctrl/Cmd+G, dispatching a selection/scroll to the line
 *  - AUTOCOMPLETE from the project completion source (language keywords +
 *    document identifiers), ported from lib/code-runner/autocomplete.ts
 *  - MINIMAP sibling driven purely from CM6 scroll metrics (no new dep);
 *    click/drag scrubs the editor; toggle preserved
 *  - LINT diagnostics + gutter: compiler/runtime checks for JS/TS/Python plus
 *    bounded grammar diagnostics for JSON/CSS/HTML/PHP/SQL
 *  - light + dark theme via `isDark`; Cmd/Ctrl+Enter -> onRun, Shift+Enter ->
 *    notebook run-and-advance or selected source/current line, and Alt+Enter ->
 *    notebook run-and-insert, as chosen by the host
 */
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import CodeMirror, {
  ExternalChange,
  type BasicSetupOptions,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import {
  EditorView,
  hoverTooltip,
  keymap,
  type KeyBinding,
  type Tooltip,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { readOfficeTaskPaneCover } from "@mrnote/core/web/components/office-ribbon/officeTaskPaneOverlay.ts";
import type * as Y from "yjs";
import {
  type YSyncConfig,
  ySync,
  ySyncFacet,
  yUndoManagerKeymap,
} from "y-codemirror.next";
import { macOptionChordFallback } from "../../../lib/code-runner/mac-option-chords";
import { showHoverAt, showHoverSupport } from "../../../lib/code-runner/show-hover";
import { signatureHelpTriggerForUpdate } from "../../../lib/code-runner/signature-help-trigger";
import { localizeTypeScript } from "../../../lib/code-runner/typescript-locale";
import { beginObjectDragGesture } from "@mrnote/core/web/lib/object-drag-gesture.ts";
import { attachPinchGestures } from "@mrnote/core/web/lib/use-pinch-zoom.ts";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  type Extension,
  type SelectionRange as EditorSelectionRange,
  type Text,
} from "@codemirror/state";
import {
  forceLinting,
  forEachDiagnostic,
  lintGutter,
  type Diagnostic,
} from "@codemirror/lint";
import {
  foldAll,
  foldEffect,
  foldable,
  foldedRanges,
  indentUnit,
  unfoldAll,
  unfoldEffect,
} from "@codemirror/language";
import {
  addCursorAbove,
  addCursorBelow,
  indentWithTab,
  isolateHistory,
  redo,
  redoDepth,
  selectParentSyntax,
  toggleComment,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { ContinuousZoomDial } from "@mrnote/core/web/components/ui/ContinuousZoomDial.tsx";
import { PointerContextMenu } from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import {
  completionStatus,
  hasNextSnippetField,
} from "@codemirror/autocomplete";
import {
  search,
  selectNextOccurrence,
  selectSelectionMatches,
  setSearchQuery,
} from "@codemirror/search";
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Braces,
  Brackets,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Code2,
  Copy,
  Eye,
  FileCode,
  Gauge,
  GitCompare,
  Hash,
  Info,
  Keyboard,
  Lightbulb,
  ListTree,
  Map as MapIcon,
  MousePointerClick,
  Pencil,
  Pilcrow,
  Pin,
  Play,
  Save,
  Scissors,
  Search,
  Settings2,
  Tags,
  TerminalSquare,
  TriangleAlert,
  Type as TypeIcon,
  WrapText,
  Wrench,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { OfficeQuickCheck } from "@mrnote/core/web/components/office-ribbon/OfficeQuickCheck.tsx";
import chrome from "./CodeEditorChrome.module.css";
import officeStatusBarStyles from "@mrnote/core/web/components/office-ribbon/OfficeStatusBar.module.css";
import {
  OfficeTaskPane,
  officeTaskPaneParts,
} from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { OfficeStatusBar } from "@mrnote/core/web/components/office-ribbon/OfficeStatusBar.tsx";
import {
  OfficeSoftKeyboardKey,
  OfficeSoftKeyboardLayer,
} from "@mrnote/core/web/components/office-ribbon/OfficeSoftKeyboardLayer.tsx";
import { CODE_SOFT_KEYS, pressCodeSoftKey } from "../../../lib/code-runner/soft-keyboard-keys";
import {
  contentAttributesExtension,
  isStreamModeLanguage,
  isTreeFoldLanguage,
  lineToOffsetRange,
  lintExtensions,
  normalizeLanguage,
  refreshLintEffect,
  themeExtension,
} from "../../../lib/code-runner/codemirror-config";
import {
  codeFixes,
  codeLenses,
  CODE_REFERENCE_PREVIEW_MAX_CHARS,
  createTsService,
  definitionSpan,
  documentSymbols,
  implementationSpans,
  identifierAt,
  inlayHints,
  intelligenceLanguage,
  isLegalIdentifier,
  MAX_CODE_IDENTIFIER_CHARS,
  organizeImports,
  quickInfoAt,
  quickInfoToHtml,
  referenceSpans,
  renameEdits,
  signatureHelpAt,
  typeDefinitionSpan,
  type CodeFixAction,
  type CodeLens,
  type DocumentSymbol,
  type InlayHintItem,
  type ReferenceSpan,
  type SignatureHelpInfo,
  type TsIntelligenceService,
} from "../../../lib/code-runner/code-intelligence";
import { breadcrumbCrumbs } from "../../../lib/code-runner/breadcrumbs";
import { outlineSymbols } from "../../../lib/code-runner/outline-symbols";
import {
  canGoBack as navCanGoBack,
  canGoForward as navCanGoForward,
  createNavHistory,
  goBack as navGoBack,
  goForward as navGoForward,
  recordNavigation,
  type NavHistory,
} from "../../../lib/code-runner/nav-history";
import {
  bracketColorizationExtension,
  bracketPairGuidesExtension,
  codeLensExtension,
  colorDecoratorExtension,
  debugBreakpointGutterExtension,
  debugPausedLineExtension,
  flashLocatedLineEffect,
  indentGuidesExtension,
  locatedLineExtension,
  inlayHintsExtension,
  dirtyDiffGutterExtension,
  peekExtension,
  regionFoldExtension,
  renderWhitespaceExtension,
  resolveCodeLineTarget,
  rulersExtension,
  setDebugBreakpointLinesEffect,
  setDebugUnboundBreakpointLinesEffect,
  setDebugPausedLineEffect,
  setDirtyDiffHunksEffect,
  setPeekEffect,
  streamFoldExtension,
  wordWrapExtension,
  type DebugBreakpointLineMove,
  type PeekReferenceItem,
} from "../../../lib/code-runner/editor-cm-extensions";
import { isColorDecoratorLanguage } from "../../../lib/code-runner/css-color-decorators";
import { pythonInlayHintsExtension } from "../../../lib/code-runner/python-inlay-hints";
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  clampFontScale,
  formatRulerColumns,
  loadEditorPref,
  loadFontScale,
  loadRulerColumns,
  saveEditorPref,
  saveFontScale,
  saveRulerColumns,
  wheelZoomFontScale,
} from "../../../lib/code-runner/editor-prefs";
import {
  collectCodeEditorFoldRanges,
  loadCodeEditorViewState,
  saveCodeEditorViewState,
} from "../../../lib/code-runner/editor-view-state";
import {
  stickyHeaderLines,
  type StickyHeader,
} from "../../../lib/code-runner/sticky-scroll";
import {
  detectIndent,
  lineEndCursorPositions,
  resolveEol,
  selectionSummary,
} from "../../../lib/code-runner/editor-status";
import {
  emmetAbbreviationLeftOf,
  expandEmmet,
  firstEmptyTagCaret,
} from "../../../lib/code-runner/emmet";
import {
  completionExtension,
  type ProjectSemanticCompletionProvider,
} from "../../../lib/code-runner/codemirror-completions";
import { createEditorLanguageServices } from "../../../lib/code-runner/language-services";
import { SHELL_FILE_LEVEL_DIAGNOSTIC_MARKER } from "../../../lib/code-runner/shell-language-provider";
import type {
  LanguageServiceProvider,
  ProviderCodeAction,
  ProviderLocation,
} from "../../../lib/code-runner/language-service-provider";
import {
  codeCommandAppliesTo,
  codeCommandPaletteLabel,
  codeCommandRegistry,
  createCodeCommandHost,
} from "../../../lib/code-runner/code-command-contributions";

// Module scope so `useSyncExternalStore` sees the same function identity on
// every render — an inline subscribe would resubscribe on each one.
const subscribeToCodeCommands = (listener: () => void) =>
  codeCommandRegistry.subscribe(listener);
const readCodeCommands = () => codeCommandRegistry.all();
import {
  editorPerformanceProfile,
  type EditorPerformanceModeReason,
  type EditorPerformanceProfile,
} from "../../../lib/code-runner/editor-performance-mode";
import {
  codeSourceEncodingLabel,
  nextCodeSourceEncoding,
  type CodeSourceEncoding,
} from "../../../lib/code-runner/code-file-import";
import { CodeSnippetManager } from "./CodeSnippetManager";
import CodeOutlinePanel from "./CodeOutlinePanel";
import {
  CodeDockedPane,
  type CodeTaskPaneDocks,
} from "./codeTaskPaneDock";
import MarkdownContent from "@mrnote/core/web/__cut__/mf8d64ee10b.tsx";
import CodeCompareView, {
  type CodeCompareApplication,
  type CodeCompareConflictState,
  type CodeCompareHandle,
} from "./CodeCompareView";
import {
  readToolbarClipboard,
  selectToolbarPasteSpecialPayload,
  ToolbarClipboardError,
} from "@mrnote/docs/web/components/console/editor/native-document/toolbarClipboard.ts";
import {
  EDITOR_SHORTCUTS,
  SHORTCUT_GROUP_LABEL_KEYS,
  SHORTCUT_GROUP_ORDER,
  filterShortcuts,
  formatShortcutKeys,
  shortcutsForHost,
} from "../../../lib/code-runner/keyboard-shortcuts";
import {
  computeDirtyDiffHunks,
  revertDirtyDiffHunk,
  type DirtyDiffHunk,
} from "../../../lib/code-runner/dirty-diff";
import {
  canFormatLanguage,
  formatCodeWithReceipt,
  shouldFormatOnSave,
} from "../../../lib/code-runner/format-code";
import {
  applyFinalNewline,
  convertEol,
  convertIndentation,
  duplicateLines,
  foldRangesAtLevel,
  joinLines,
  moveLines,
  popShrinkHistory,
  pushExpandHistory,
  sortLines,
  spliceFormattedRange,
  transformCase,
  trimTrailingWhitespace,
  wordOccurrences,
  wordRangeAt,
  type CaseTransform,
  type EolStyle,
  type FinalNewlineMode,
  type SelectionRange,
} from "../../../lib/code-runner/editor-commands";
import {
  removeDuplicateLines,
  type DedupMode,
} from "../../../lib/code-runner/dedup-lines";
import {
  buildSearchQuery,
  findOptions,
  matchCountLabel,
  searchMatchPreview,
} from "../../../lib/code-runner/codemirror-search";
import {
  boundFindQuery,
  computeReplacement,
  findMatches,
  findRegexErrorMessageKey,
  MAX_EDITOR_FIND_MATCHES,
  MAX_FIND_QUERY_CHARS,
  MAX_FIND_REPLACEMENT_MATCHES,
  MAX_FIND_REPLACEMENT_RESULT_CHARS,
  stepMatch,
  validateRegex,
  type FindReplacementPlanMessageKey,
} from "../../../lib/code-runner/find-replace";
import {
  countDocumentLines,
  minimapDensity,
  minimapViewport,
  paintMinimapDensity,
  scrollTopForPointer,
  type MinimapDensity,
} from "../../../lib/code-runner/codemirror-minimap";
import {
  buildExecutionSelection,
  type ExecutionSelection,
} from "../../../lib/code-runner/execution-selection";
import { USE_COLLAB_EDITING } from "@mrnote/core/web/lib/code-runner/editor-flags.ts";
import {
  languageLoadFailed,
  loadConfiguredLanguageExtension,
  peekLanguageExtension,
} from "../../../lib/code-runner/language-loader";
import {
  grammarGapLanguageExtension,
  languageSupportsComments,
} from "../../../lib/code-runner/language-metadata";
import {
  createCollabSession,
  type CollabSession,
} from "@mrnote/core/web/lib/collab/collab-provider.ts";
import {
  buildCodeCollabExtensions,
  getCodeYText,
} from "@mrnote/core/web/lib/collab/code-collab.ts";

const CODE_REFERENCE_PANEL_INITIAL_LIMIT = 100;
/** One stable instance, so the extension list never reconfigures for it. */
const LOCATED_LINE_EXTENSION = locatedLineExtension();
function boundedReferencePreview(value: string): string {
  return value.slice(0, CODE_REFERENCE_PREVIEW_MAX_CHARS);
}

/**
 * One monotonic host-to-editor line-navigation request. `requestId` lets a host
 * request the same line repeatedly; `focus` is false for passive debugger
 * pauses and true for explicit user navigation such as clicking a breakpoint.
 */
export interface CodeLineNavigationRequest {
  requestId: number;
  line: number;
  focus?: boolean;
  /** Optional exact page/editor owner; stale debugger navigation is acknowledged but inert. */
  viewStateKey?: string;
}

export interface CodeMirrorEditorProps {
  value: string;
  language: string;
  /** `replayed`: every transaction of the change was the shared document
   * replayed into the view (a peer's edit, or a Yjs undo), not typing. */
  onChange: (value: string, change?: { readonly replayed: boolean }) => void;
  placeholder?: string;
  editorTestId?: string;
  /**
   * Stable document identity for restoring CodeMirror selections and vertical /
   * horizontal viewport position after a page close or browser reload. Omit for
   * transient editors/cells that do not own a durable page identity.
   */
  viewStateKey?: string;
  /** Invoked on Cmd/Ctrl+Enter, for run-on-keystroke editors. */
  onRun?: () => void;
  /**
   * Optional notebook-specific Shift+Enter action. When present it takes
   * precedence over `onRunSelection`, allowing a multi-buffer host to run the whole
   * current cell and advance focus while standalone editors keep their
   * selected-source/current-line behavior.
   */
  onRunAndAdvance?: () => void;
  /** Optional notebook-specific Alt+Enter action: run and insert below. */
  onRunAndInsert?: () => void;
  /**
   * Optional notebook-specific Escape fallback. Transient CodeMirror surfaces
   * close first; only a bare Escape with nothing open exits cell edit mode.
   */
  onExitEditMode?: () => void;
  /**
   * Invoked on Shift+Enter or the status-bar Run action with the selected
   * source, falling back to the caret's current line. The host routes this
   * through the same sandbox, streaming, and interrupt path as a full run.
   */
  onRunSelection?: (selection: ExecutionSelection) => void;
  /**
   * Invoked on an explicit save gesture (Cmd/Ctrl+S). The editor formats the
   * buffer first when "Format on save" is enabled AND the language has a
   * formatter (the same gate the Format button uses — JS/TS/JSON/CSS/HTML/MD/
   * YAML/SQL/Python/Go/Rust), then calls this so the host can flush its autosave
   * immediately. A format error or an unsupported language never blocks the
   * save — `onSave` is still called with the raw buffer. `trigger` is
   * "shortcut" when the save came from the Cmd/Ctrl+S chord itself (a LaTeX
   * page then compiles after it, as Overleaf's does), absent for a Save
   * button or command.
   */
  onSave?: (trigger?: "shortcut") => void;
  /**
   * Python kernel namespace (the page id). When set on a python editor, the
   * completion list adds jedi semantic suggestions from the LIVE kernel once
   * the page has run at least once.
   */
  pythonNamespace?: string;
  /** Exact live-kernel authority supplied by hosts that own a Python runtime. */
  pythonKernelAvailable?: boolean;
  /** Disables editing while still showing content (read-only viewer mode). */
  readOnly?: boolean;
  /** Reject document-changing transactions beyond this host-owned limit. */
  maxDocumentLength?: number;
  /** Notifies the host when a transaction is rejected by `maxDocumentLength`. */
  onDocumentLimitExceeded?: () => void;
  /** Selects the dark theme. Defaults to the light theme. */
  isDark?: boolean;
  /**
   * Optional host-controlled source EOL. CodeMirror stores document separators
   * as LF internally, so standalone file editors use this metadata to preserve
   * CRLF through edits, save/reopen, and export. When omitted, the editor keeps
   * its historical buffer-derived EOL behavior.
   */
  lineEnding?: EolStyle;
  onLineEndingChange?: (lineEnding: EolStyle) => void;
  /** Host-controlled source encoding metadata for faithful local file round-trips. */
  sourceEncoding?: CodeSourceEncoding;
  onSourceEncodingChange?: (encoding: CodeSourceEncoding) => void;
  /**
   * Optional document/cell name shown as the LEADING crumb of the breadcrumb
   * strip (VSCode parity), e.g. the code page title or a notebook cell label.
   * The strip itself only renders when the buffer actually has symbols; this
   * just names the file segment. When omitted, a generic localized label is used
   * so the file crumb is always present. Has NO effect on a structure-less
   * buffer (no symbols → no strip), so the default editor is unchanged.
   */
  documentName?: string;
  /**
   * Collaborative-editing config. Remote sessions are consulted only when
   * {@link USE_COLLAB_EDITING} is ON. The one exception is an explicitly marked
   * `localPageBuffer`, which binds duplicate CodeWindow views to an in-browser
   * model without a room or provider. In either case the editor binds to a Yjs
   * Y.Text via `y-codemirror.next` (lib/collab/code-collab.ts).
   *
   * Two mutually-exclusive shapes:
   *  - OWNED session (`docId` form): the editor creates + owns ONE
   *    {@link createCollabSession} for itself, binding to the default Y.Text. Used
   *    by the standalone code editor (CodeWindow), one editor = one doc.
   *  - SHARED session (`session` form): the editor binds to an EXTERNALLY-managed
   *    session (created + torn down by the parent) and a caller-supplied per-cell
   *    Y.Text `textKey`. Used by the multi-buffer host so MANY cell editors share ONE
   *    per-page Y.Doc/awareness (one presence list, one provider) while each cell
   *    keeps its own independent CRDT text. The editor never destroys a shared
   *    session — the parent owns its lifecycle.
   */
  collab?: CodeMirrorCollabConfig;
  /**
   * Optional cross-file go-to-definition hook (TS/JS only). When supplied, the
   * editor consults it FIRST on a go-to-definition request, passing the caret's
   * buffer offset; if it returns `true` it has navigated elsewhere (e.g. to
   * another multi-buffer host cell) and the editor stops. Returning `false` (or the prop
   * being absent — the default everywhere except a JS/TS multi-buffer host) leaves the
   * editor's own single-buffer go-to-definition entirely unchanged.
   */
  crossFileGoToDefinition?: (offsetInBuffer: number) => Promise<boolean>;
  /**
   * Optional project-aware go-to-type-definition hook (TS/JS only). It handles
   * foreign type declarations first; returning false preserves the existing
   * same-buffer type-definition path.
   */
  crossFileGoToTypeDefinition?: (
    offsetInBuffer: number,
  ) => Promise<boolean>;
  /**
   * Optional project-aware go-to-implementation hook (TS/JS only). It handles
   * foreign implementations first; returning false preserves the existing
   * same-buffer implementation path.
   */
  crossFileGoToImplementation?: (
    offsetInBuffer: number,
  ) => Promise<boolean>;
  /**
   * Optional project-aware Peek Definition hook. A foreign declaration returns
   * a read-only source snapshot without opening its file; null preserves the
   * existing same-buffer/Python peek path.
   */
  crossFilePeekDefinition?: (
    offsetInBuffer: number,
    isCurrent?: () => boolean,
  ) => Promise<CrossFileDefinitionPreview | null>;
  /**
   * Optional project-level refactorings for the current selection (TS/JS only):
   * extract, convert, move. Choosing an entry prepares a host-owned preview;
   * the editor menu never mutates a project refactor directly.
   */
  crossFileRefactors?: (
    from: number,
    to: number,
  ) => Promise<CrossFileRefactorAction[] | null>;
  /**
   * Optional project-aware Quick Fix hook. The host returns actions whose
   * `apply` callback performs an atomic, stale-checked write across open code
   * buffers. Same-file actions are still supplied by the local language service.
   */
  crossFileCodeFixes?: (
    from: number,
    to: number,
  ) => Promise<CrossFileCodeFixAction[] | null>;
  /**
   * Optional cross-file find-all-references hook (TS/JS only). When supplied, the
   * editor consults it FIRST on a find-references request; a non-null result
   * REPLACES the single-buffer reference list with one that may span files/cells
   * (each entry carries an opaque `cellId` + a human `cellLabel`). Returning
   * `null` (or the prop being absent) leaves the single-buffer references
   * unchanged. {@link onNavigateCrossFile} performs the jump for a foreign entry.
   */
  crossFileReferences?: (
    offsetInBuffer: number,
    isCurrent?: () => boolean,
  ) => Promise<CrossFileReferenceResult | null>;
  /**
   * Optional project-level call hierarchy (TS/JS only): who calls the symbol at
   * the caret, and what it calls. Results use the SAME shape as
   * {@link crossFileReferences}, so the panel renders and navigates them through
   * the path it already has — a direction of the hierarchy is a list of call
   * sites. Absent (or returning null) simply leaves the commands unavailable.
   */
  crossFileCallHierarchy?: (
    offsetInBuffer: number,
    direction: "incoming" | "outgoing",
    isCurrent?: () => boolean,
  ) => Promise<CrossFileReferenceResult | null>;
  /**
   * Navigate to a cross-file reference/definition: the host (e.g. the multi-buffer host)
   * resolves `cellId` to its surface and selects `[from, to)`. Only invoked for
   * panel entries that carry a `cellId` (i.e. came from {@link crossFileReferences}).
   */
  onNavigateCrossFile?: (cellId: string, from: number, to: number) => void;
  /**
   * Optional cross-file hover quick-info hook (TS/JS only). Consulted ONLY when
   * the single-buffer hover finds nothing — i.e. for a symbol declared in another
   * file/cell — so same-buffer hovers stay fast + unchanged. Returns plain-text
   * `signature`/`documentation` (rendered via textContent, so no markup), or null.
   */
  crossFileQuickInfo?: (
    offsetInBuffer: number,
  ) => Promise<{ signature: string; documentation: string } | null>;
  /**
   * Optional project-aware parameter-hint hook (TS/JS only). Consulted only
   * when the single-buffer service cannot resolve the enclosing call, so local
   * calls stay on the lightweight path. The returned shape is already escaped
   * by the shared signatureHelpAt contract.
   */
  crossFileSignatureHelp?: (
    offsetInBuffer: number,
  ) => Promise<SignatureHelpInfo | null>;
  /**
   * Optional provider of identifiers from OUTSIDE this buffer (e.g. sibling
   * multi-buffer host cells in a shared scope), folded into the autocomplete pool so the
   * popup suggests symbols declared in other cells. Invoked lazily per completion
   * request; absent everywhere except a shared-scope multi-buffer host.
   */
  extraCompletionIdentifiers?: () => Iterable<string>;
  /**
   * Primary bounded-project JS/TS completion hook. Requests are versioned,
   * cancellable, and settled by the completion adapter; `null` preserves the
   * existing single-buffer semantic + lightweight identifier fallback.
   */
  crossFileProjectCompletions?: ProjectSemanticCompletionProvider;
  /**
   * Project-aware visible-range inlay hints. A non-null result replaces the
   * single-buffer hints; null preserves the existing local path.
   */
  crossFileInlayHints?: (
    fromOffset: number,
    toOffset: number,
  ) => Promise<InlayHintItem[] | null>;
  /**
   * Project-aware Code Lens rows. A non-null result replaces single-buffer
   * reference counts so sibling-file uses are included.
   */
  crossFileCodeLenses?: () => Promise<CodeLens[] | null>;
  /** Monotonic peer-source revision that refreshes project visual intelligence. */
  crossFileIntelligenceRefreshKey?: number;
  /**
   * Optional cross-CELL completion context (Python multi-buffer host): given the caret's
   * 1-based line + 0-based column in THIS buffer, returns the concatenated module
   * text plus the caret's position within it, so jedi completes against the whole
   * shared scope (a name defined in another cell is suggested) — the same module
   * view hover/go-to-definition use. Absent everywhere except a shared-scope
   * Python multi-buffer host; returning null falls back to this buffer alone.
   */
  crossFileComplete?: (
    localLine: number,
    localColumn: number,
  ) => { text: string; line: number; column: number } | null;
  /**
   * Optional cross-file rename hook (TS/JS only). Consulted FIRST when a rename
   * is confirmed, passing the caret offset + the new name; if it returns `true`
   * it has rewritten every occurrence across the project (e.g. all multi-buffer host
   * cells) and the editor stops. `"cancelled"` means the project snapshot went
   * stale and stops the rename without falling through to a partial in-buffer
   * rewrite. Returning `false` (or the prop being absent) leaves the editor's
   * own single-buffer rename to run unchanged.
   */
  crossFileRename?: (
    offsetInBuffer: number,
    newName: string,
  ) => Promise<boolean | "cancelled">;
  /**
   * Optional project-aware JS/TS diagnostic provider. A non-null result replaces
   * the single-buffer compiler diagnostics; null preserves the existing path.
   */
  crossFileDiagnostics?: (
    source: string,
  ) => Promise<readonly Diagnostic[] | null>;
  /** Monotonic peer-source revision that requests a project re-lint. */
  crossFileDiagnosticsRefreshKey?: number;
  /**
   * Optional provider of OTHER sources this buffer can be DIFFED against (VSCode
   * "Compare" / integrated diff-merge parity). When supplied and non-empty, the
   * editor shows a "Compare" toolbar affordance that opens a side-by-side merge
   * view (`@codemirror/merge`) of THIS buffer against a source the user picks
   * from the returned list (e.g. a sibling multi-buffer host cell). Returning an empty
   * array (or the prop being absent — the default everywhere except a multi-buffer host
   * with ≥2 code cells) hides the affordance entirely, so the editor is
   * byte-for-byte unchanged. Invoked lazily when the picker opens so the list is
   * always current (cells added/removed/reordered since mount are reflected).
   */
  compareSources?: () => CompareSource[];
  /**
   * Optional metadata-only availability count. Standalone windows pass this so
   * compare chrome disables when their provider currently has no peer/version;
   * other hosts retain the provider-present fallback.
   */
  compareSourceCount?: number;
  /**
   * Stable identity for the document/cell that owns `compareSources`. Change
   * this when a mounted editor is reused for a different page so pending lazy
   * source loads are invalidated instead of appearing in the new page.
   */
  compareSourceScope?: string;
  /**
   * Monotonic host request that opens/focuses the Problems panel. This lets a
   * window-level ribbon expose diagnostics without reaching into CodeMirror's
   * DOM. Repeating the same value is a no-op.
   */
  problemsOpenRequest?: number;
  /**
   * The code window's task pane dock (codeTaskPaneDock.tsx). With it, the
   * Outline, Problems and User snippets panes render into the window's right
   * dock; without it (a notebook cell, a unit test) they render in place.
   */
  taskPaneDocks?: CodeTaskPaneDocks | null;
  /**
   * Where the status bar goes. Left out, it sits at the editor's bottom edge;
   * the code window passes its bottom strip (below the output) for the active
   * pane and null for the others, which then show none.
   */
  statusBarHost?: HTMLElement | null;
  /**
   * Monotonic host request for a real editor view command. The request id makes
   * React re-renders idempotent: one ribbon click executes exactly once.
   */
  viewCommandRequest?: CodeEditorViewCommandRequest;
  /** Retires a consumed view request so a later keyed mount cannot replay it. */
  onViewCommandRequestHandled?: (requestId: number) => void;
  /** Reports the live editor-view chrome state to a host ribbon. */
  onViewStateChange?: (state: CodeEditorViewState) => void;
  /**
   * Reports the live view's scroller (null when it goes), so a host can
   * register it as its window's scroll port (Synchronous Scrolling).
   */
  onScrollPortChange?: (element: HTMLElement | null) => void;
  /** Monotonic host request for a real editor editing command. */
  editCommandRequest?: CodeEditorEditCommandRequest;
  /** Retires a consumed request in the host so a later keyed mount cannot replay it. */
  onEditCommandRequestHandled?: (requestId: number) => void;
  /** Reports live undo/search/multi-cursor state to a host ribbon. */
  onEditStateChange?: (state: CodeEditorEditState) => void;
  /** Monotonic host request for a code-intelligence command. */
  intelligenceCommandRequest?: CodeEditorIntelligenceCommandRequest;
  /** Retires a consumed host request so a later keyed editor cannot replay it. */
  onIntelligenceCommandRequestHandled?: (requestId: number) => void;
  /** Reports language-aware navigation/refactor availability to host chrome. */
  onIntelligenceStateChange?: (state: CodeEditorIntelligenceState) => void;
  /**
   * Text this buffer is compared against for change markers (VS Code's SCM
   * gutter). The host owns what "baseline" means — here it is the page's most
   * recent saved version. Absent leaves the gutter unmounted entirely.
   */
  baselineContent?: string;
  /**
   * Ids of {@link EDITOR_SHORTCUTS} rows the HOST binds (its console, output
   * panel and debugger chords). The shortcuts reference lists only these plus
   * the editor's own, so it never advertises a chord that does nothing here.
   */
  hostShortcuts?: readonly string[];
  /** Monotonic host request for compare-review navigation/accept commands. */
  reviewCommandRequest?: CodeEditorReviewCommandRequest;
  /** Retires a consumed review request so it cannot apply to another page. */
  onReviewCommandRequestHandled?: (requestId: number) => void;
  /** Reports live compare-review state to a host ribbon. */
  onReviewStateChange?: (state: CodeEditorReviewState) => void;
  /**
   * A comparison the host holds open: the buffer against this source,
   * without the picker (an Agent's code draft against the page as it is,
   * windows/PageDraftCode). `open` shows or leaves it; the compare's own close
   * still closes it, and the host hears that through onReviewStateChange.
   */
  pinnedCompare?: {
    readonly id: string;
    readonly label: string;
    readonly text: string;
    readonly open: boolean;
  };
  /** Monotonic host request for a real editor-scoped execution command. */
  executionCommandRequest?: CodeEditorExecutionCommandRequest;
  /** Retires a consumed execution request so another page cannot run it. */
  onExecutionCommandRequestHandled?: (requestId: number) => void;
  /** Reports the live selection/current-line scope to host run chrome. */
  onExecutionStateChange?: (state: CodeEditorExecutionState) => void;
  /** Reports the live bounded diagnostic count to host chrome. */
  onDiagnosticCountChange?: (count: number) => void;
  /**
   * Reports a bounded, line-sorted diagnostic snapshot to workspace chrome.
   * The callback only fires when the diagnostic set changes, never for editor
   * geometry/viewport updates.
   */
  onProblemsChange?: (problems: readonly ProblemEntry[]) => void;
  /**
   * Reports the editor's live 1-based caret line. Line-only reporting avoids
   * re-rendering the host on every horizontal caret movement.
   */
  onCursorLineChange?: (line: number) => void;
  /**
   * Host-driven source navigation used by the debugger. Requests clamp against
   * the live document and never edit source text.
   */
  lineNavigationRequest?: CodeLineNavigationRequest;
  /** Retires a consumed debugger navigation request across keyed editor mounts. */
  onLineNavigationRequestHandled?: (requestId: number) => void;
  /**
   * Authored debugger breakpoint lines. `undefined` leaves the gutter entirely
   * unmounted for ordinary editors and multi-buffer host cells.
   */
  debugBreakpointLines?: readonly number[];
  /**
   * Breakpoints the debugger cannot pause at; drawn hollow, the way VS Code
   * draws one that did not bind. Omitted means "not known" — every breakpoint
   * renders solid, exactly as before.
   */
  debugUnboundBreakpointLines?: readonly number[];
  /** Toggle one authored breakpoint from the CodeMirror debugger gutter. */
  onToggleDebugBreakpoint?: (line: number) => void;
  /**
   * Rebase authored breakpoint metadata after user edits move source lines.
   * Controlled full-document loads are excluded by the editor transaction
   * filter so a page switch never rewrites restored debugger configuration.
   */
  onRebaseDebugBreakpoints?: (
    moves: readonly DebugBreakpointLineMove[],
    source: string,
  ) => void;
  /**
   * Current debugger statement line. `null` clears the highlight; `undefined`
   * keeps debugger coordination entirely unmounted for ordinary editors.
   */
  debugPausedLine?: number | null;
}

export type CodeEditorViewCommand =
  | "toggleOutline"
  | "toggleProblems"
  | "toggleCompare"
  | "toggleMinimap"
  | "toggleWordWrap"
  | "toggleRenderWhitespace"
  | "toggleBracketColors"
  | "toggleIndentGuides"
  | "toggleBracketPairGuides"
  | "toggleStickyScroll"
  | "zoomOut"
  | "zoomReset"
  | "zoomIn"
  | "previewFontScale"
  | "commitFontScale"
  | "toggleSettings"
  | "openCommandPalette";

export interface CodeEditorViewCommandRequest {
  requestId: number;
  command: CodeEditorViewCommand;
  /** Font scale payload for the continuous preview/commit commands. */
  fontScale?: number;
  /** Optional exact editor owner; prevents retained toggles replaying after remount. */
  viewStateKey?: string;
}

export interface CodeEditorViewState {
  outlineOpen: boolean;
  problemsOpen: boolean;
  compareOpen: boolean;
  compareAvailable: boolean;
  minimapOn: boolean;
  minimapAvailable: boolean;
  wordWrapOn: boolean;
  renderWhitespaceOn: boolean;
  bracketColorsOn: boolean;
  indentGuidesOn: boolean;
  bracketPairGuidesOn: boolean;
  stickyScrollOn: boolean;
  stickyScrollAvailable: boolean;
  fontScale: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
}

export type CodeEditorEditCommand =
  | "undo"
  | "redo"
  | "openFind"
  | "save"
  | "formatDocument"
  | "formatSelection"
  | "toggleComment"
  | "changeAllOccurrences"
  | "expandSelection"
  | "shrinkSelection"
  | "addCursorsToLineEnds"
  | "addCursorAbove"
  | "addCursorBelow"
  | "addNextOccurrence"
  | "moveLineUp"
  | "moveLineDown"
  | "copyLineUp"
  | "copyLineDown"
  | "joinLines"
  | "sortLinesAscending"
  | "sortLinesDescending"
  | "removeDuplicateLines"
  | "removeConsecutiveDuplicateLines"
  | "trimTrailingWhitespace"
  | "transformUppercase"
  | "transformLowercase"
  | "transformTitlecase";

export interface CodeEditorEditCommandRequest {
  requestId: number;
  command: CodeEditorEditCommand;
  /** Optional exact editor owner; prevents a retained host request replaying after remount. */
  viewStateKey?: string;
}

export interface CodeEditorEditState {
  canUndo: boolean;
  canRedo: boolean;
  findOpen: boolean;
  canFormat: boolean;
  canToggleComment: boolean;
  cursorCount: number;
}

export type CodeEditorIntelligenceCommand =
  | "openSymbols"
  | "goToLine"
  | "goBack"
  | "goForward"
  | "goToDefinition"
  | "goToTypeDefinition"
  | "goToImplementation"
  | "findReferences"
  | "showIncomingCalls"
  | "showOutgoingCalls"
  | "peekDefinition"
  | "peekReferences"
  | "rename"
  | "quickFix"
  | "refactor"
  | "organizeImports"
  | "showHover";

export interface CodeEditorIntelligenceCommandRequest {
  requestId: number;
  command: CodeEditorIntelligenceCommand;
  /** Optional exact editor owner; prevents a retained host request replaying after remount. */
  viewStateKey?: string;
}

/**
 * What the editor can answer about symbols in the current language, for a host
 * that draws buttons rather than a menu.
 *
 * A menu says "cannot" by leaving the entry out; a toolbar says it by drawing
 * the button disabled, which is only true if the flags are specific enough. One
 * "has some intelligence" flag stopped being specific enough the moment a
 * language could navigate without being renameable.
 */
export interface CodeEditorIntelligenceState {
  /** Navigation-history endpoint authority for the host's Back/Forward buttons. */
  canGoBack: boolean;
  canGoForward: boolean;
  /** Go to Definition, Peek Definition. */
  symbolNavigationAvailable: boolean;
  /** Go to Type Definition, Go to Implementation, Organize Imports. */
  typeNavigationAvailable: boolean;
  /** Find All References, Peek References. */
  referencesAvailable: boolean;
  renameAvailable: boolean;
  /** Quick Fix. */
  codeActionsAvailable: boolean;
  /** Organize Imports has a distinct TS/JS compiler authority. */
  organizeImportsAvailable: boolean;
  /** Shared Find/Call/Peek request currently owns the result surface. */
  referencesBusy: boolean;
}

export type CodeEditorReviewCommand =
  | "previousChange"
  | "nextChange"
  | "acceptCurrent"
  | "acceptChange"
  | "acceptBoth"
  | "acceptAllChanges"
  | "applyResolvedMerge";

export interface CodeEditorReviewCommandRequest {
  requestId: number;
  command: CodeEditorReviewCommand;
  /** Optional exact editor owner; prevents retained merge commands crossing pages. */
  viewStateKey?: string;
}

export interface CodeEditorReviewState {
  compareAvailable: boolean;
  compareOpen: boolean;
  sourceSelected: boolean;
  threeWayActive: boolean;
  changeCount: number;
  canNavigate: boolean;
  canApply: boolean;
  canResolve: boolean;
  canApplyMerge: boolean;
}

export type CodeEditorExecutionCommand = "runSelectionOrLine";

export interface CodeEditorExecutionCommandRequest {
  requestId: number;
  command: CodeEditorExecutionCommand;
  /** Optional exact editor owner; prevents a retained Run Selection crossing pages. */
  viewStateKey?: string;
}

export interface CodeEditorExecutionState {
  selectedChars: number;
  selectionCount: number;
  currentLine: number;
  /** Live non-empty selection, bounded with an explicit middle-omission marker. */
  selectedText: string;
  /** True when selectedText is a bounded head/tail snapshot, not the full selection. */
  selectedTextTruncated: boolean;
  /** Exact UTF-16 offsets only when one non-empty range owns the selection. */
  selectionFrom?: number | null;
  selectionTo?: number | null;
}

interface CompareSourceMetadata {
  /** Opaque id of the source (e.g. a sibling cell id); only used as a React key. */
  id: string;
  /** Human label shown in the picker (e.g. "Cell 3"). */
  label: string;
}

/** One pickable source; persisted versions may load their text after selection. */
export type CompareSource = CompareSourceMetadata &
  (
    | {
        /** An already-resident sibling buffer. */
        text: string;
        loadText?: never;
      }
    | {
        /** Fetch a persisted body only when this metadata row is selected. */
        text?: never;
        loadText: () => Promise<string>;
      }
  );

interface ResolvedCompareSource extends CompareSourceMetadata {
  text: string;
}

/**
 * Which side of a review a picked source fills. `"incoming"` is the existing
 * two-way "compare against" role; `"base"` additionally supplies the common
 * ancestor that turns the panel into a three-way merge review.
 */
/**
 * Which side of the comparison the picker is currently filling.
 *
 * `left` is the newer one: the left pane used to be the live buffer and nothing
 * else, so every comparison was "what I have now versus that". Choosing a left
 * source turns the panel into a diff between two things the user picked, which
 * is what "compare version A with version B" has always meant everywhere else.
 */
type CompareSourceRole = "incoming" | "base" | "left";

/** Largest clipboard payload offered to compare; above this it fails closed. */
export const COMPARE_CLIPBOARD_CODE_UNIT_LIMIT = 2 * 1024 * 1024;

/**
 * Offer the clipboard as a compare source (VS Code's "Compare Active File with
 * Clipboard"). In an editor people paste AI output into, diffing the buffer
 * against what is on the clipboard is the fastest way to see what a paste would
 * actually change — without pasting first.
 *
 * The read happens only when the row is CHOSEN (it is a lazy source), so
 * opening the picker never touches the clipboard, and a browser that withholds
 * permission simply surfaces the picker's existing load error.
 *
 * `sources` is null when the host wired no compare at all (a standalone
 * editor): that stays without Compare. A host that did wire it offers the
 * clipboard even before it has a sibling or a saved version, as VS Code offers
 * "Compare Active File with Clipboard" for any file — a page created a minute
 * ago is exactly where someone checks what a paste would change.
 */
function clipboardCompareReadable(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.readText === "function"
    );
  } catch {
    return false;
  }
}

function readClipboardCapabilities(): {
  read: boolean;
  compareText: boolean;
  legacyCommand: boolean;
} {
  let read = false;
  try {
    const clipboard = globalThis.navigator?.clipboard;
    read = Boolean(
      clipboard &&
        (typeof clipboard.read === "function" ||
          typeof clipboard.readText === "function"),
    );
  } catch {
    read = false;
  }
  return {
    read,
    compareText: clipboardCompareReadable(),
    legacyCommand:
      typeof document !== "undefined" &&
      typeof document.execCommand === "function",
  };
}

function withClipboardCompareSource(
  sources: readonly CompareSource[] | null,
  t: (key: string) => string,
): CompareSource[] {
  if (sources === null) return [];
  if (!clipboardCompareReadable()) return [...sources];
  const readText = navigator.clipboard.readText.bind(navigator.clipboard);
  // LAST, not first. What someone opening Compare almost always wants is a
  // sibling cell or a saved version of this very page; pasting something in
  // from elsewhere is the specialty. Leading with the specialty pushes every
  // real choice down a row and makes "the first one" mean something different
  // than it reads.
  return [
    ...sources,
    {
      id: "clipboard",
      label: t("code.compare.clipboard"),
      loadText: async () => {
        const text = await readText();
        if (typeof text !== "string") {
          throw new Error("Clipboard text unavailable");
        }
        if (text.length > COMPARE_CLIPBOARD_CODE_UNIT_LIMIT) {
          throw new Error("Clipboard content too large to compare");
        }
        return text;
      },
    },
  ];
}

/** A reference that may live in another file/cell (drives the References panel). */
export interface CrossFileReference {
  /** Opaque id of the file/cell, passed back to `onNavigateCrossFile`. */
  cellId: string;
  /** Human label for the file/cell, shown in the panel (e.g. "Cell 3"). */
  cellLabel: string;
  /** 0-based char offset of the reference start within its file/cell. */
  from: number;
  /** 0-based char offset just past the reference end within its file/cell. */
  to: number;
  /** 1-based line within its file/cell. */
  line: number;
  /** 0-based column within its file/cell. */
  column: number;
  /** Trimmed source line for the panel preview. */
  preview: string;
}

/** The cross-file reference set plus the index of the one under the caret. */
export interface CrossFileReferenceResult {
  refs: CrossFileReference[];
  activeIndex: number;
}

/** Read-only source context for peeking a definition in another file/cell. */
export interface CrossFileDefinitionPreview {
  /** Human-readable virtual path or cell label shown in the peek title. */
  label: string;
  /** Exact target source snapshot used to resolve the definition. */
  source: string;
  /** 1-based source line containing the declaration. */
  line: number;
}

/** One host-owned multi-file Quick Fix surfaced in the editor action menu. */
export interface CrossFileCodeFixAction {
  /** Plain-text compiler description shown in the shared Quick Fix menu. */
  description: string;
  /**
   * Applies every target edit atomically, or returns false when snapshots
   * changed. Async hosts must re-check `isCurrent` immediately before their
   * first mutation; materializing an edit may itself cross an await boundary.
   */
  apply: (isCurrent: () => boolean) => Promise<boolean>;
}

/** One compiler refactor whose choice opens a host-owned before/after preview. */
export interface CrossFileRefactorAction {
  /** Plain-text compiler description shown in the shared action menu. */
  description: string;
  /**
   * Materializes and publishes a bounded preview without mutating any buffer.
   * The host owns subsequent Apply / Discard / Undo authority.
   */
  preview: (isCurrent: () => boolean) => Promise<boolean>;
}

type EditorCodeFixAction =
  | CodeFixAction
  | CrossFileCodeFixAction
  | CrossFileRefactorAction;

const CODE_ACTION_CATALOG_LIMIT = 200;
const CODE_ACTION_MENU_INITIAL_LIMIT = 100;
export const CODE_COMMAND_PALETTE_RENDER_LIMIT = 200;
export const CODE_MARKDOWN_PREVIEW_INITIAL_CHARS = 200_000;

function boundedEditorCodeActions(
  actions: readonly EditorCodeFixAction[],
): EditorCodeFixAction[] {
  const bounded: EditorCodeFixAction[] = [];
  for (const action of actions) {
    if (!action.description.trim()) continue;
    bounded.push(action);
    if (bounded.length >= CODE_ACTION_CATALOG_LIMIT) break;
  }
  return bounded;
}

interface EditorMutationClaim {
  view: EditorView;
  documentGeneration: number;
  interactionGeneration: number;
  language: string;
}

type FormatAttemptResult =
  | "applied"
  | "unchanged"
  | "failed"
  | "stale"
  | "unavailable";

interface ActiveFormatRequest {
  id: number;
  scope: "document" | "selection";
  controller: AbortController;
  /** Logical ownership receipt; resolves stale immediately on retirement. */
  promise: Promise<FormatAttemptResult>;
  retire: () => void;
}

function captureEditorMutationClaim(
  view: EditorView,
  language: string,
  documentGeneration: number,
  interactionGeneration: number,
): EditorMutationClaim {
  return { view, documentGeneration, interactionGeneration, language };
}

function editorMutationClaimIsCurrent(
  claim: EditorMutationClaim,
  liveView: EditorView | null,
  liveLanguage: string,
  liveDocumentGeneration: number,
  liveInteractionGeneration: number,
): boolean {
  return (
    liveView === claim.view &&
    liveDocumentGeneration === claim.documentGeneration &&
    liveInteractionGeneration === claim.interactionGeneration &&
    liveLanguage === claim.language
  );
}

/** One lint diagnostic, projected for the Problems panel (VSCode parity). The
 *  raw `from`/`to` are document offsets used for the click-to-jump selection;
 *  `line`/`col` are the precomputed 1-based position shown in the list and used
 *  for the line→column ordering. */
export interface ProblemEntry {
  from: number;
  to: number;
  severity: Diagnostic["severity"];
  message: string;
  line: number;
  col: number;
  /** False for honest file-level diagnostics that have no source range. */
  navigable: boolean;
}

export type ProblemSeverityGroup = "error" | "warning" | "info";

export interface ProblemSeverityVisibility {
  readonly error: boolean;
  readonly warning: boolean;
  readonly info: boolean;
}

interface ProblemSeverityCounts {
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

const ALL_PROBLEM_SEVERITIES: ProblemSeverityVisibility = Object.freeze({
  error: true,
  warning: true,
  info: true,
});
const ZERO_PROBLEM_SEVERITY_COUNTS: ProblemSeverityCounts = Object.freeze({
  error: 0,
  warning: 0,
  info: 0,
});
const PROBLEM_SEVERITY_GROUPS = [
  "error",
  "warning",
  "info",
] as const satisfies readonly ProblemSeverityGroup[];

function problemSeverityGroup(
  severity: Diagnostic["severity"],
): ProblemSeverityGroup {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function problemSeverityIsVisible(
  severity: Diagnostic["severity"],
  visibility: ProblemSeverityVisibility,
): boolean {
  return visibility[problemSeverityGroup(severity)];
}

function countProblemSeverities(state: EditorState): ProblemSeverityCounts {
  const counts = { error: 0, warning: 0, info: 0 };
  forEachDiagnostic(state, (diagnostic) => {
    counts[problemSeverityGroup(diagnostic.severity)] += 1;
  });
  return counts;
}

export const PROBLEMS_PANEL_RENDER_LIMIT = 500;
export const MAX_PROBLEM_MESSAGE_CHARS = 2_048;
const WORKSPACE_PROBLEM_REPORT_LIMIT = PROBLEMS_PANEL_RENDER_LIMIT;
const EMPTY_DOCUMENT_SYMBOLS: DocumentSymbol[] = [];

/**
 * Read matching current lint diagnostics out of the live CM6 state and project
 * them into the sorted {@link ProblemEntry} list the Problems panel renders. The
 * diagnostics live INSIDE CM6 (not React); `forEachDiagnostic` walks the active
 * set for the current document. Each `from` offset is resolved to a 1-based
 * line:col via `doc.lineAt`. Entries are ordered by line then column so the
 * panel reads top-to-bottom like the gutter. Exported standalone so it can be
 * unit-tested without reaching into the component.
 */
export function collectProblems(
  state: EditorState,
  limit = Number.POSITIVE_INFINITY,
  visibility: ProblemSeverityVisibility = ALL_PROBLEM_SEVERITIES,
): ProblemEntry[] {
  const out: ProblemEntry[] = [];
  const doc = state.doc;
  forEachDiagnostic(state, (diagnostic, from, to) => {
    if (!problemSeverityIsVisible(diagnostic.severity, visibility)) return;
    if (out.length >= limit) return;
    // Clamp into the live document so a stale offset (e.g. a diagnostic from a
    // just-superseded lint pass) can never throw inside lineAt.
    const safeFrom = Math.min(Math.max(from, 0), doc.length);
    const lineInfo = doc.lineAt(safeFrom);
    const shellFileLevel = diagnostic.message.startsWith(
      SHELL_FILE_LEVEL_DIAGNOSTIC_MARKER,
    );
    const message = shellFileLevel
      ? diagnostic.message.slice(SHELL_FILE_LEVEL_DIAGNOSTIC_MARKER.length)
      : diagnostic.message;
    out.push({
      from,
      to,
      severity: diagnostic.severity,
      message: message.slice(0, MAX_PROBLEM_MESSAGE_CHARS),
      line: lineInfo.number,
      col: safeFrom - lineInfo.from + 1,
      navigable: !shellFileLevel,
    });
  });
  out.sort((a, b) => (a.line === b.line ? a.col - b.col : a.line - b.line));
  return out;
}

/**
 * A cheap, stable identity string for the current diagnostic SET — used by the
 * update listener to decide whether the open Problems panel actually needs
 * rebuilding. Walks the diagnostics once (no line/col resolution, no sort) so it
 * is far cheaper than {@link collectProblems}; two states whose diagnostics
 * match in offset/severity/message produce the same signature, letting the
 * listener skip geometry-only updates that would otherwise spin a render loop.
 */
function problemSignature(
  state: EditorState,
  visibility: ProblemSeverityVisibility = ALL_PROBLEM_SEVERITIES,
): string {
  let signature = "";
  let count = 0;
  let matchingCount = 0;
  forEachDiagnostic(state, (diagnostic, from, to) => {
    count += 1;
    if (!problemSeverityIsVisible(diagnostic.severity, visibility)) return;
    matchingCount += 1;
    if (matchingCount > PROBLEMS_PANEL_RENDER_LIMIT) return;
    signature += `${from}:${to}:${diagnostic.severity}:${diagnostic.message.slice(0, MAX_PROBLEM_MESSAGE_CHARS)}\n`;
  });
  return `${count}:${matchingCount}\n${signature}`;
}

/** Reserved words a rename must refuse as the NEW name (would emit invalid code).
 *  Per-language so a JS identifier like `def` isn't blocked in JS, and vice versa. */
const JS_RESERVED_WORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
]);
const PY_RESERVED_WORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

/** The editor owns + creates its own collab session (one editor = one doc). */
export interface CodeMirrorOwnedCollabConfig {
  /** Stable document id; the default room name when `roomName` is omitted. */
  docId: string;
  /** Shared room name binding peers to the same code doc (live sync only). */
  roomName?: string | null;
  /** Local collaborator display name (sanitized before broadcast). */
  userName?: string | null;
  /** Local collaborator cursor color (forced through the strict hex gate). */
  userColor?: string | null;
  session?: undefined;
}

/**
 * The editor binds to a SHARED, externally-owned collab session and a specific
 * Y.Text within it (keyed by `textKey`). The parent creates the session and tears
 * it down; this editor only reads from it. Powers the multi-buffer host's one-doc /
 * many-cell collaboration.
 */
export interface CodeMirrorSharedCollabConfig {
  /** The externally-managed session (Y.Doc + awareness) shared across cells. */
  session: CollabSession;
  /** The Y.Text field key this editor binds to within the shared Y.Doc. */
  textKey: string;
  /**
   * Enables the local, page-keyed model used when the same Code page is open in
   * more than one window. This is deliberately independent from the remote
   * collaboration feature flag: it creates no provider or room.
   */
  localPageBuffer?: boolean;
  /** One text-history owner shared by every local view of the page. */
  undoManager?: Y.UndoManager;
  /** Lets the page model attribute a Yjs transaction to its source view. */
  registerEditorOrigin?: (origin: unknown) => void | (() => void);
  docId?: undefined;
}

export type CodeMirrorCollabConfig =
  | CodeMirrorOwnedCollabConfig
  | CodeMirrorSharedCollabConfig;

/**
 * `basicSetup` flags. CM6's basic setup bundles the bulk of the requested
 * behaviour; we enable it explicitly to document intent and keep multiple
 * cursors / rectangular selection on. We turn `searchKeymap` OFF here: the
 * native Cmd/Ctrl+F panel is replaced by our own find bar (below) so the
 * find-bar markup + data-testids match the textarea editor for test parity.
 * `completionKeymap` is also OFF here: the project completion extension installs
 * a safer keymap that keeps Enter as plain editing input instead of accepting
 * suggestions while a user is typing through multiple lines.
 */
const BASIC_SETUP: BasicSetupOptions = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  highlightSelectionMatches: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  allowMultipleSelections: true,
  rectangularSelection: true,
  crosshairCursor: true,
  defaultKeymap: true,
  searchKeymap: false,
  historyKeymap: true,
  foldKeymap: true,
  completionKeymap: false,
  lintKeymap: true,
  closeBracketsKeymap: true,
  history: true,
  drawSelection: true,
  indentOnInput: true,
  syntaxHighlighting: true,
  // NB: the indent unit + tab width are NOT set here. basicSetup's `tabSize`
  // option only emits an `indentUnit.of(' '.repeat(n))` (it never touches the
  // `EditorState.tabSize` display facet), and that facet takes the FIRST value —
  // so a basicSetup indentUnit would SHADOW our reconfigurable compartment and
  // pin new-line indentation to 2 spaces forever. We instead own indentation
  // entirely via `indentCompartment` (seeded to spaces-2, the same effective
  // value basicSetup gave), which makes "Indent Using Tabs/Spaces" + 2/4/8 take
  // effect. See `indentExtensionFor`.
};

// `@uiw/react-codemirror` marks controlled `value` synchronisation with its
// ExternalChange annotation, but leaves it in CM6's undo history by default.
// That makes async page hydration undoable and can merge it with a fast first
// keystroke, so one Undo clears the entire reopened file. Keep host hydration
// out of history and isolate both sides; real editor transactions remain fully
// undoable and redoable.
const externalValueHistoryBoundary = EditorState.transactionExtender.of(
  (transaction) =>
    transaction.annotation(ExternalChange)
      ? {
          annotations: [
            Transaction.addToHistory.of(false),
            isolateHistory.of("full"),
          ],
        }
      : null,
);

// y-codemirror.next keeps its replay annotation private, so a read-only
// transaction filter cannot authenticate that annotation without relying on a
// package-internal import. Own the producer and consumer together instead: the
// replacement sync plugin below is behavior-compatible with ySync, but its
// unforgeable annotation identity is available to this module's authority
// boundary.
const ySyncAnnotation = Annotation.define<YSyncConfig>();

function replaceYSyncPlugin(
  extension: Extension,
  replacement: Extension,
): Extension {
  if (extension === ySync) return replacement;
  return Array.isArray(extension)
    ? extension.map((nested) => replaceYSyncPlugin(nested, replacement))
    : extension;
}

/**
 * Alt/Option-click drops an additional caret (VSCode multi-cursor parity).
 * `basicSetup` already enables Alt-DRAG rectangular selection + the crosshair
 * cursor and `allowMultipleSelections`, so keyboard multi-cursor (Cmd+D etc.)
 * and column selection work — but it does NOT wire the click facet that lets a
 * plain Alt-click ADD a standalone cursor, so we add it explicitly. Keyed on Alt
 * ONLY, so it never collides with Cmd/Ctrl-click go-to-definition, whose handler
 * (`cmdClickHandler`) intercepts the meta/ctrl mousedown first.
 */
const altClickAddsCursor: Extension = EditorView.clickAddsSelectionRange.of(
  (event) => event.altKey,
);

function shouldRebaseDebugBreakpointTransaction(
  transaction: Transaction,
): boolean {
  return transaction.annotation(ExternalChange) !== true;
}

/** The editor's default indent width (spaces-per-indent / tab display width). */
const DEFAULT_INDENT_WIDTH = 2;

/** Legal tab-display / spaces-per-indent widths offered in the palette. */
const INDENT_WIDTHS = [2, 4, 8] as const;

/**
 * The CM6 extension realising an indentation style: the `indentUnit` string that
 * auto-indent / `indentWithTab` insert on a new line (a hard tab, or `width`
 * spaces) PLUS the tab DISPLAY width (`EditorState.tabSize`, so a literal tab
 * renders `width` columns and tab-mode indents read consistently). Held in a
 * reconfigurable Compartment so the editor can switch tabs↔spaces / 2·4·8 live.
 *
 * The default (spaces, {@link DEFAULT_INDENT_WIDTH}) reproduces basicSetup's old
 * effective `indentUnit` of two spaces, so the default editor's NEW-LINE indent
 * is unchanged; this is now the sole owner of both indent facets (basicSetup no
 * longer sets `tabSize`), so the choice actually takes effect.
 */
function indentExtensionFor(style: {
  useTabs: boolean;
  width: number;
}): Extension {
  const width = INDENT_WIDTHS.includes(style.width as 2 | 4 | 8)
    ? style.width
    : DEFAULT_INDENT_WIDTH;
  const unit = style.useTabs ? "\t" : " ".repeat(width);
  return [indentUnit.of(unit), EditorState.tabSize.of(width)];
}

/**
 * The Emmet dialect to use for a language, or null when the language has no
 * Emmet support (so Tab keeps its plain indent behavior). HTML / JSX / TSX use
 * markup expansion; CSS uses property-shorthand expansion. Everything else
 * (JS, Python, …) returns null.
 */
function emmetSyntaxFor(language: string): "markup" | "css" | null {
  switch (normalizeLanguage(language)) {
    case "html":
    case "jsx":
    case "tsx":
      return "markup";
    case "css":
      return "css";
    default:
      return null;
  }
}

const MINIMAP_WIDTH = 64;

// The editor's base font size (px) at 100% zoom. The CM6 surface renders at
// BASE_FONT_SIZE * fontScale; at the default scale (1.0) this is exactly the
// inline `fontSize: 13` the editor shipped with, so the default editor is
// byte-for-byte unchanged until the user zooms.
const BASE_FONT_SIZE = 13;
const VIEW_STATE_SAVE_DELAY_MS = 180;
// Cursor chrome is useful feedback, but rebuilding the full editor shell for
// every typed character is not. Keep the visible line/column + breadcrumb
// position close behind typing while a bounded max wait guarantees that a
// continuous input stream still refreshes the chrome periodically.
const CARET_RENDER_SETTLE_MS = 140;
const CARET_RENDER_MAX_WAIT_MS = 600;
const MAX_EDITOR_COMMAND_INPUT_CHARS = 256;
const MAX_EDITOR_RULER_DRAFT_CHARS = 256;

interface CodeCaretRenderSnapshot {
  readonly offset: number;
  readonly line: number;
  readonly col: number;
}

interface CodeCaretRenderStore {
  readonly getSnapshot: () => CodeCaretRenderSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

function CodeCaretChromeSubscriber({
  store,
  children,
}: {
  store: CodeCaretRenderStore;
  children: (snapshot: CodeCaretRenderSnapshot) => ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return children(snapshot);
}

/**
 * react-codemirror reconciles its `value` prop in a PASSIVE effect, and while
 * the user is typing it parks a full-document replace built from the value of
 * the render that scheduled it. If a keystroke lands between this commit and
 * that deferred effect, the parked replace carries text older than the
 * keystroke and erases it once typing pauses. A synchronous update scheduled
 * from a layout effect makes React run the commit's pending passive effects
 * first (it always flushes them before a new update), so the reconcile compares
 * against the document the value was rendered for. Only this empty component
 * re-renders; the editor used to get the same flush by re-rendering itself in
 * full from an idle `setFormatBusy(false)` on every value change.
 */
const CodeMirrorValueEffectFlush = memo(function CodeMirrorValueEffectFlush({
  value,
}: {
  value: string;
}) {
  const [, setCommittedValue] = useState(value);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the synchronous update IS the point: it flushes react-codemirror's pending value effect
    setCommittedValue(value);
  }, [value]);
  return null;
});

const MINIMAP_MARK_COLOR_DARK = "rgba(255,255,255,0.22)";
const MINIMAP_MARK_COLOR_LIGHT = "rgba(15,118,110,0.28)";

interface CodeMinimapProps {
  /** The strip element; the parent reads its height and scrubs against it. */
  readonly stripRef: RefObject<HTMLDivElement | null>;
  readonly model: MinimapDensity;
  readonly isDark: boolean;
  readonly viewportTop: number;
  readonly viewportHeight: number;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * The minimap strip: the density silhouette painted on ONE canvas plus the
 * "you are here" viewport box. Memoized so an editor render that changes
 * neither the model nor the viewport box (a content snapshot publish with the
 * minimap's model unchanged, a toolbar state flip) skips it, and when the
 * model does change the silhouette is repainted imperatively instead of
 * re-creating one absolutely-positioned element per line.
 */
const CodeMinimap = memo(function CodeMinimap({
  stripRef,
  model,
  isDark,
  viewportTop,
  viewportHeight,
  onPointerDown,
}: CodeMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const canvas = canvasRef.current;
    if (!strip || !canvas) return;
    const color = isDark ? MINIMAP_MARK_COLOR_DARK : MINIMAP_MARK_COLOR_LIGHT;
    const paint = () => {
      const height = strip.clientHeight;
      const ratio =
        typeof window !== "undefined" && window.devicePixelRatio > 0
          ? window.devicePixelRatio
          : 1;
      const pixelWidth = Math.max(1, Math.round(MINIMAP_WIDTH * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      let context: CanvasRenderingContext2D | null = null;
      try {
        context = canvas.getContext("2d");
      } catch {
        context = null;
      }
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintMinimapDensity(context, model, MINIMAP_WIDTH, height, color);
    };
    paint();
    if (typeof ResizeObserver === "undefined") return;
    // The strip's height follows the window; repaint at the new scale.
    const observer = new ResizeObserver(() => paint());
    observer.observe(strip);
    return () => observer.disconnect();
  }, [isDark, model, stripRef]);

  return (
    <div
      ref={stripRef}
      data-testid="code-minimap"
      data-touch-hold="off"
      onPointerDown={onPointerDown}
      className={chrome.minimap}
      style={{
        // The painted width (the canvas scale reads the same constant).
        flexBasis: MINIMAP_WIDTH,
        width: MINIMAP_WIDTH,
      }}
    >
      {/* Per-line marks for small files; bounded aggregate marks for large
          files — all painted on this one canvas. */}
      <canvas
        ref={canvasRef}
        data-testid="code-minimap-density"
        data-mark-count={model.marks.length}
        data-line-count={model.lineCount}
        aria-hidden
        className={chrome.minimapCanvas}
      />
      {/* Viewport "you are here" box. */}
      <div
        data-testid="code-minimap-viewport"
        aria-hidden
        className={chrome.minimapViewport}
        style={{ top: viewportTop, height: viewportHeight }}
      />
    </div>
  );
});

const FONT_ZOOM_MIN_PERCENT = FONT_SCALE_MIN * 100;
const FONT_ZOOM_MAX_PERCENT = FONT_SCALE_MAX * 100;
const FONT_ZOOM_DEFAULT_PERCENT = FONT_SCALE_DEFAULT * 100;
/** A wheel zoom is stored once the wheel has been still this long. */
const WHEEL_ZOOM_SETTLE_MS = 200;

function fontZoomValueToPosition(value: number, min: number, max: number) {
  return (value - min) / (max - min);
}

function fontZoomPositionToValue(position: number, min: number, max: number) {
  return min + position * (max - min);
}

function formatFontZoomPercent(value: number) {
  return `${Math.round(value)}%`;
}

let codeMirrorCollabMountSequence = 0;
const codeMirrorCollabMountIdentities = new WeakMap<object, number>();

function codeMirrorCollabMountIdentity(
  collab: CodeMirrorCollabConfig | undefined,
): string {
  if (!collab) return "plain";
  if (collab.session) {
    let identity = codeMirrorCollabMountIdentities.get(collab.session);
    if (identity === undefined) {
      identity = ++codeMirrorCollabMountSequence;
      codeMirrorCollabMountIdentities.set(collab.session, identity);
    }
    return `shared:${identity}:${collab.textKey}:${
      collab.localPageBuffer ? "page" : "host"
    }`;
  }
  return `owned:${JSON.stringify([
    collab.docId,
    collab.roomName === null ? null : (collab.roomName ?? collab.docId),
  ])}`;
}

/**
 * The whole lines a line command (Sort, Delete Duplicate Lines) acts on, as
 * VS Code counts them: a selection that ends at the very start of a line
 * leaves that line out, and so does the whole document (no selection) when it
 * ends with a newline. Select All over `c\nb\na\n` used to sort the empty
 * last line to the top.
 */
function selectedWholeLines(
  doc: Text,
  sel: EditorSelectionRange,
): { fromLine: ReturnType<Text["line"]>; toLine: ReturnType<Text["line"]> } {
  const from = sel.empty ? 0 : sel.from;
  const to = sel.empty ? doc.length : sel.to;
  const fromLine = doc.lineAt(from);
  let toLine = doc.lineAt(to);
  if (toLine.number > fromLine.number && to === toLine.from) {
    toLine = doc.line(toLine.number - 1);
  }
  return { fromLine, toLine };
}

/**
 * Find, Go to Line and Rename take the keyboard once their input is on
 * screen. A select() queued for the next frame often ran before the input had
 * mounted, and select() does not move focus by itself, so what was typed next
 * (a line number, a new name) went into the code instead.
 */
function focusPromptInput(input: HTMLInputElement | null): void {
  if (!input) return;
  input.focus({ preventScroll: true });
  input.select();
}

/** The cover a floating task pane publishes over the editor (left/right)
 * keeps the cursor clear of it when CodeMirror scrolls it into view. */
const taskPaneCoverScrollMargins = EditorView.scrollMargins.of((view) => {
  const cover = readOfficeTaskPaneCover(view.scrollDOM);
  return cover.left || cover.right
    ? { left: cover.left, right: cover.right }
    : null;
});

export default function CodeMirrorEditor(props: CodeMirrorEditorProps) {
  return (
    <CodeMirrorEditorMounted
      key={codeMirrorCollabMountIdentity(props.collab)}
      {...props}
    />
  );
}

function CodeMirrorEditorMounted({
  value,
  language,
  onChange,
  placeholder,
  editorTestId = "codemirror-editor",
  viewStateKey,
  onRun,
  onRunAndAdvance,
  onRunAndInsert,
  onExitEditMode,
  onRunSelection,
  onSave,
  pythonNamespace,
  pythonKernelAvailable,
  readOnly = false,
  maxDocumentLength,
  onDocumentLimitExceeded,
  isDark = false,
  lineEnding,
  onLineEndingChange,
  sourceEncoding = "utf8",
  onSourceEncodingChange,
  documentName,
  collab,
  crossFileGoToDefinition,
  crossFileGoToTypeDefinition,
  crossFileGoToImplementation,
  crossFilePeekDefinition,
  crossFileCodeFixes,
  crossFileRefactors,
  crossFileReferences,
  crossFileCallHierarchy,
  onNavigateCrossFile,
  crossFileQuickInfo,
  crossFileSignatureHelp,
  extraCompletionIdentifiers,
  crossFileProjectCompletions,
  crossFileInlayHints,
  crossFileCodeLenses,
  crossFileIntelligenceRefreshKey,
  crossFileComplete,
  crossFileRename,
  crossFileDiagnostics,
  crossFileDiagnosticsRefreshKey,
  compareSources,
  compareSourceCount,
  compareSourceScope,
  baselineContent,
  hostShortcuts,
  problemsOpenRequest,
  taskPaneDocks = null,
  statusBarHost,
  viewCommandRequest,
  onViewCommandRequestHandled,
  onViewStateChange,
  onScrollPortChange,
  editCommandRequest,
  onEditCommandRequestHandled,
  onEditStateChange,
  intelligenceCommandRequest,
  onIntelligenceCommandRequestHandled,
  onIntelligenceStateChange,
  reviewCommandRequest,
  onReviewCommandRequestHandled,
  onReviewStateChange,
  pinnedCompare,
  executionCommandRequest,
  onExecutionCommandRequestHandled,
  onExecutionStateChange,
  onDiagnosticCountChange,
  onProblemsChange,
  onCursorLineChange,
  lineNavigationRequest,
  onLineNavigationRequestHandled,
  debugBreakpointLines,
  debugUnboundBreakpointLines,
  onToggleDebugBreakpoint,
  onRebaseDebugBreakpoints,
  debugPausedLine,
}: CodeMirrorEditorProps) {
  const t = useTranslations("console-notebooks");
  const translationsRef = useRef(t);
  translationsRef.current = t;
  const locale = currentEditorLocale();
  const performancePopoverId = useId();
  const performanceProfile = useMemo(
    () => editorPerformanceProfile(value),
    [value],
  );
  const lightweightMode = performanceProfile.mode === "lightweight";
  const performanceCopy = useMemo(
    () => editorPerformanceModeCopy(t, locale, performanceProfile),
    [locale, performanceProfile, t],
  );
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Monotonic per-mount document identity. CodeMirror reports every text
  // mutation as a docChanged transaction, while harmless React-driven state
  // reconfiguration may replace the persistent Text object without changing
  // the document. Claims use this counter so edit+undo is still a new
  // generation, but a toolbar/host re-render does not cancel a valid action.
  const documentGenerationRef = useRef(0);
  // A selection can move A -> B -> A while an async command awaits. Comparing
  // only the final EditorSelection would mistake that ABA sequence for an
  // untouched request, so every document or selection transaction also
  // advances this per-mount interaction identity.
  const editorInteractionGenerationRef = useRef(0);
  // Language and source identity are editor interactions too. Their final
  // values can make an A -> B -> A round trip while an async command awaits,
  // so comparing strings/keys alone would let an obsolete command regain
  // authority. Advance the same monotonic generation on every such transition.
  const editorContextIdentityRef = useRef({
    language,
    viewStateKey,
    value,
    readOnly,
  });
  useLayoutEffect(() => {
    if (
      editorContextIdentityRef.current.language !== language ||
      editorContextIdentityRef.current.viewStateKey !== viewStateKey ||
      editorContextIdentityRef.current.value !== value ||
      editorContextIdentityRef.current.readOnly !== readOnly
    ) {
      editorContextIdentityRef.current = {
        language,
        viewStateKey,
        value,
        readOnly,
      };
      editorInteractionGenerationRef.current += 1;
    }
  }, [language, readOnly, value, viewStateKey]);
  const editorOriginCleanupRef = useRef<(() => void) | null>(null);
  // `viewStateKey` is a stable identity for this editor's lifetime (CodeWindow
  // keys the CM surface by page id). Read it through a ref from stable CM6
  // listeners so selection/scroll events do not rebuild the extension array.
  const viewStateKeyRef = useRef(viewStateKey);
  viewStateKeyRef.current = viewStateKey;
  const viewStateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const viewStateRestoreFrameRef = useRef<number | null>(null);
  const debugBreakpointLinesRef = useRef(debugBreakpointLines);
  debugBreakpointLinesRef.current = debugBreakpointLines;
  const debugPausedLineRef = useRef(debugPausedLine);
  debugPausedLineRef.current = debugPausedLine;
  const lineNavigationRequestRef = useRef(lineNavigationRequest);
  lineNavigationRequestRef.current = lineNavigationRequest;
  const lastLineNavigationRequestRef = useRef<number | undefined>(undefined);
  const findInputRef = useRef<HTMLInputElement>(null);
  const gotoInputRef = useRef<HTMLInputElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const minimapScrubFrameRef = useRef<number | null>(null);
  const pendingMinimapClientYRef = useRef<number | null>(null);
  const minimapDragCleanupRef = useRef<(() => void) | null>(null);
  const performanceInfoButtonRef = useRef<HTMLButtonElement>(null);
  const performanceInfoRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Panel container refs so we can move keyboard focus INTO a panel when it opens
  // (a11y: the chord-opened references/symbols panels otherwise leave focus in the
  // editor; pulling focus in makes them operable without a hunt-for-Tab).
  const refsPanelRef = useRef<HTMLDivElement>(null);
  const symbolsPanelRef = useRef<HTMLDivElement>(null);
  // Command Palette (Ctrl/Cmd+Shift+P) filter input ref — focus is moved here on
  // open so the user types immediately, and restored to the editor on close.
  const paletteInputRef = useRef<HTMLInputElement>(null);
  // The editor host (the `position: relative` wrapper around the CM6 surface).
  // The right-click context menu positions itself relative to this element's
  // box, and click-away detection compares against it.
  const hostRef = useRef<HTMLDivElement>(null);
  // Inline Peek (VSCode "Peek Definition" / "Peek References", Mod-Alt-F12) open
  // flag. The peek itself is a CM6 block widget (it lives in the editor's DOM, not
  // React state), so we only mirror its OPEN-ness here — and in a ref, not state,
  // because nothing in the React tree re-renders on it; the editor keymap reads it
  // synchronously to route Escape to closePeek before the other panels.
  const peekOpenRef = useRef(false);
  // The peek widget lives OUTSIDE React (in CM6's DOM) and is built ONCE per open,
  // so its row handlers close over these refs rather than the live callbacks —
  // that keeps a click-to-jump / close from going stale as the component
  // re-renders. Both are pointed at the latest callback right after it's defined.
  const jumpToReferenceRef = useRef<(index: number) => void>(() => {});
  const closePeekRef = useRef<() => void>(() => {});

  // Expand/Shrink selection history (VSCode Shift+Alt+Right / Shift+Alt+Left).
  // CM6 has `selectParentSyntax` (expand) but no inverse; we record the pre-expand
  // range on a small stack so shrinking can pop back to it. A ref (not state)
  // because nothing renders on it — the keymap reads/writes it synchronously. The
  // stack is reset whenever the user moves the caret by a non-expand gesture so a
  // shrink never jumps to a stale range (see the updateListener below).
  const expandHistoryRef = useRef<SelectionRange[]>([]);
  // Set true around an expand/shrink dispatch so the selection-change listener
  // doesn't mistake our own programmatic selection move for a fresh user gesture
  // and clear the history we just pushed.
  const selfSelectingRef = useRef(false);

  // Cursor navigation history (VSCode "Go Back" / "Go Forward"). A jump that
  // moves the caret non-incrementally — go-to-definition / type-def /
  // implementation, a Go-to-Symbol pick, a reference jump, Go-to-Line — records
  // its (origin → destination) endpoints here so Ctrl/Cmd+Alt+- (or Ctrl+-) hops
  // back to the pre-jump spot and the forward chord re-restores it. The full
  // trail stays in a ref because commands read/update it synchronously; React
  // only mirrors its two endpoint predicates so a host-drawn toolbar can expose
  // the same truthful availability as the editor commands.
  const navHistoryRef = useRef<NavHistory>(createNavHistory());
  const [navigationAvailability, setNavigationAvailability] = useState({
    canGoBack: false,
    canGoForward: false,
  });
  const publishNavigationAvailability = useCallback((history: NavHistory) => {
    const next = {
      canGoBack: navCanGoBack(history),
      canGoForward: navCanGoForward(history),
    };
    setNavigationAvailability((previous) =>
      previous.canGoBack === next.canGoBack &&
      previous.canGoForward === next.canGoForward
        ? previous
        : next,
    );
  }, []);
  // Set true around a Back/Forward restore dispatch so the navigate handler
  // doesn't re-record its OWN programmatic caret move as a fresh jump (which
  // would corrupt the trail). The plain forward jumps (go-to-def etc.) DO record;
  // only the back/forward restores suppress.
  const navRestoringRef = useRef(false);

  // Cross-file hooks held in refs and read through them, so a host that passes a
  // FRESH closure each render (e.g. a multi-buffer host that re-renders every keystroke)
  // does NOT invalidate the go-to-def / references / hover / completion memos and
  // force a CM reconfiguration on every keystroke. The ref is updated each render
  // so the latest closure is always called.
  const crossFileGoToDefinitionRef = useRef(crossFileGoToDefinition);
  crossFileGoToDefinitionRef.current = crossFileGoToDefinition;
  const crossFileGoToTypeDefinitionRef = useRef(
    crossFileGoToTypeDefinition,
  );
  crossFileGoToTypeDefinitionRef.current = crossFileGoToTypeDefinition;
  const crossFileGoToImplementationRef = useRef(
    crossFileGoToImplementation,
  );
  crossFileGoToImplementationRef.current =
    crossFileGoToImplementation;
  const crossFilePeekDefinitionRef = useRef(
    crossFilePeekDefinition,
  );
  crossFilePeekDefinitionRef.current = crossFilePeekDefinition;
  const crossFileCodeFixesRef = useRef(crossFileCodeFixes);
  crossFileCodeFixesRef.current = crossFileCodeFixes;
  const crossFileRefactorsRef = useRef(crossFileRefactors);
  crossFileRefactorsRef.current = crossFileRefactors;
  const crossFileReferencesRef = useRef(crossFileReferences);
  crossFileReferencesRef.current = crossFileReferences;
  const crossFileCallHierarchyRef = useRef(crossFileCallHierarchy);
  crossFileCallHierarchyRef.current = crossFileCallHierarchy;
  const onNavigateCrossFileRef = useRef(onNavigateCrossFile);
  onNavigateCrossFileRef.current = onNavigateCrossFile;
  const crossFileQuickInfoRef = useRef(crossFileQuickInfo);
  crossFileQuickInfoRef.current = crossFileQuickInfo;
  const crossFileSignatureHelpRef = useRef(crossFileSignatureHelp);
  crossFileSignatureHelpRef.current = crossFileSignatureHelp;
  const extraCompletionIdentifiersRef = useRef(extraCompletionIdentifiers);
  extraCompletionIdentifiersRef.current = extraCompletionIdentifiers;
  const crossFileProjectCompletionsRef = useRef(
    crossFileProjectCompletions,
  );
  useLayoutEffect(() => {
    crossFileProjectCompletionsRef.current =
      crossFileProjectCompletions;
  }, [crossFileProjectCompletions]);
  const hasCrossFileProjectCompletions = Boolean(
    crossFileProjectCompletions,
  );
  const crossFileInlayHintsRef = useRef(crossFileInlayHints);
  const crossFileCodeLensesRef = useRef(crossFileCodeLenses);
  const crossFileIntelligenceRefreshKeyRef = useRef(
    crossFileIntelligenceRefreshKey,
  );
  useLayoutEffect(() => {
    crossFileInlayHintsRef.current = crossFileInlayHints;
    crossFileCodeLensesRef.current = crossFileCodeLenses;
    crossFileIntelligenceRefreshKeyRef.current =
      crossFileIntelligenceRefreshKey;
  }, [
    crossFileCodeLenses,
    crossFileInlayHints,
    crossFileIntelligenceRefreshKey,
  ]);
  const hasCrossFileInlayHints = Boolean(crossFileInlayHints);
  const hasCrossFileCodeLenses = Boolean(crossFileCodeLenses);
  const crossFileCompleteRef = useRef(crossFileComplete);
  crossFileCompleteRef.current = crossFileComplete;
  const crossFileRenameRef = useRef(crossFileRename);
  crossFileRenameRef.current = crossFileRename;
  const crossFileDiagnosticsRef = useRef(crossFileDiagnostics);
  crossFileDiagnosticsRef.current = crossFileDiagnostics;
  const hasCrossFileDiagnostics = Boolean(crossFileDiagnostics);
  // Compare-sources provider held in a ref for the same reason as the cross-file
  // hooks above: a host that passes a FRESH closure each render must not churn
  // the memos. Read through the ref so the latest closure is always called.
  const compareSourcesRef = useRef(compareSources);
  useLayoutEffect(() => {
    // This provider and compareSourceScope form one committed ownership view.
    // Publishing a speculative render's closure here would let the still-live
    // page offer sources from an abandoned navigation.
    compareSourcesRef.current = compareSources;
  }, [compareSources]);
  // A STABLE provider for the completion pool: its identity never changes, so the
  // extensions memo never rebuilds for it; it reads the live prop via the ref.
  const stableExtraIdentifiers = useCallback(
    () => extraCompletionIdentifiersRef.current?.(),
    [],
  );
  const stableCrossFileProjectCompletions =
    useCallback<ProjectSemanticCompletionProvider>(
      (offset, requestVersion, signal) =>
        crossFileProjectCompletionsRef.current?.(
          offset,
          requestVersion,
          signal,
        ) ?? Promise.resolve(null),
      [],
    );
  // STABLE cross-cell completion context provider (same rationale as above): its
  // identity never changes so the extensions memo never rebuilds; it reads the
  // live prop through the ref.
  const stableCrossFileComplete = useCallback(
    (localLine: number, localColumn: number) =>
      crossFileCompleteRef.current?.(localLine, localColumn) ?? null,
    [],
  );
  const stableCrossFileDiagnostics = useCallback(
    (source: string) =>
      crossFileDiagnosticsRef.current?.(source) ?? Promise.resolve(null),
    [],
  );

  useEffect(() => {
    if (
      lightweightMode ||
      crossFileDiagnosticsRefreshKey === undefined
    ) {
      return;
    }
    // Coalesce rapid peer keystrokes instead of compiling the whole open-window
    // project once per character. CodeMirror's normal local lint path is already
    // delayed; peer-driven refreshes need the same protection.
    const timeoutId = window.setTimeout(() => {
      const view = viewRef.current;
      if (!view) return;
      // The document itself is unchanged, so the lint plugin has nothing
      // pending and forceLinting alone would run nothing: tell it the
      // project changed first.
      view.dispatch({ effects: refreshLintEffect.of(null) });
      forceLinting(view);
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [crossFileDiagnosticsRefreshKey, lightweightMode]);

  // Lazily-built single-buffer TypeScript LanguageService powering hover /
  // go-to-definition / rename. Created on first use for js/jsx/ts/tsx and reused
  // (its host reads the live buffer through `getText`, dirty-marked on edits).
  // `intelText`/`intelLanguage` keep the service reading the freshest value.
  const tsServiceRef = useRef<TsIntelligenceService | null>(null);
  const tsServiceLangRef = useRef<string | null>(null);
  const intelTextRef = useRef(value);
  intelTextRef.current = value;

  // --- Collaborative editing / local shared page model ----------------------
  // Whether this render binds the editor to a Yjs CRDT. Computed ONCE at first
  // render and frozen for the editor's lifetime: a binding cannot be turned on
  // or off mid-life without recreating the CM6 doc, and the flag/collab config
  // are build/mount-time constants. Remote collaboration stays flag-gated; an
  // explicit localPageBuffer may use the same binding without a network room.
  const sharedCollab = collab?.session ? collab : null;
  const localPageBuffer = Boolean(sharedCollab?.localPageBuffer);
  const collabEnabledRef = useRef<boolean>(
    Boolean(collab) && (USE_COLLAB_EDITING || localPageBuffer),
  );
  const collabEnabled = collabEnabledRef.current;
  // SHARED-session mode: the parent owns the session (multi-buffer host one-doc/many-cell
  // case). Frozen at mount alongside the binding decision. In shared mode this
  // editor binds to `collab.session` + `collab.textKey` and NEVER creates or
  // destroys a session. In owned mode it creates its own (CodeWindow case).
  const sharedCollabRef = useRef(sharedCollab);
  const sharedUndoManager =
    collabEnabled ? (sharedCollab?.undoManager ?? null) : null;
  // The live OWNED collab session (Y.Doc + awareness), created once when enabled
  // in owned mode. Always null in shared mode.
  const collabSessionRef = useRef<CollabSession | null>(null);
  // Bumped once the session exists so the extensions memo rebuilds with the
  // yCollab binding. Stays 0 forever on the OFF path (no re-render, no churn).
  const [collabReadyTick, setCollabReadyTick] = useState(0);
  // Pin the INITIAL value so the Y.Text is seeded exactly once with the loaded
  // document text; subsequent `value` prop changes are ignored on the collab
  // path (the CRDT owns the text from then on).
  const collabInitialValueRef = useRef(value);
  // Exact host-owned body that an @uiw ExternalChange transaction is allowed
  // to install while read-only. Commands can import and forge the public
  // annotation, but they cannot change this component-owned authority value.
  const hostAuthoritativeValueRef = useRef(value);
  hostAuthoritativeValueRef.current = collabEnabled
    ? collabInitialValueRef.current
    : value;
  // Guards the one-time shared-cell seed below so it runs at most once.
  const sharedSeededRef = useRef(false);

  // CRDT Stage 2: settle a collab text binding once its seeding verdict is
  // known. adopt=true takes the room's replayed state as canonical, INCLUDING
  // replacing the already-mounted CM document — y-codemirror binds assuming
  // the CM doc equals the Y.Text at extension-creation time. The non-adopt
  // (first-in-room / local) path seeds an empty Y.Text from the live view
  // (which may already hold pre-ready keystrokes) or the pinned initial.
  const finalizeCollabText = useCallback((ytext: Y.Text, adopt: boolean) => {
    if (!adopt && ytext.length === 0) {
      // Nothing to adopt: this view owns the seed. Seed from the LIVE view, so
      // keystrokes typed while the room was settling are kept.
      const seedText =
        viewRef.current?.state.doc.toString() || collabInitialValueRef.current;
      if (seedText) {
        ytext.insert(0, seedText);
        collabInitialValueRef.current = seedText;
      }
      setCollabReadyTick((n) => n + 1);
      return;
    }
    // The Y.Text is authoritative — either the room's replayed state, or an
    // already-live page model this is a SECOND view of. Either way the live CM
    // document has to be brought to it: y-codemirror observes future deltas but
    // never replaces the document it bound to, so leaving an already-mounted
    // view on its stale loaded prop left duplicate views of one page showing
    
    const canonical = ytext.toString();
    collabInitialValueRef.current = canonical;
    hostAuthoritativeValueRef.current = canonical;
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== canonical) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: canonical },
        annotations: ExternalChange.of(true),
      });
    }
    setCollabReadyTick((n) => n + 1);
  }, []);

  // SHARED mode, LOCAL session: seed this cell's Y.Text SYNCHRONOUSLY at first
  // render, BEFORE `collabExtensions` builds the yCollab binding. yCollab
  // initializes the CM6 doc from the Y.Text at extension-creation time, so the
  // text must already hold the loaded source by then — seeding in a post-mount
  // effect would be too late and the cell would mount empty. Idempotent: only
  // seeds an empty text once. NETWORKED shared sessions instead settle in the
  // effect below once the room's replay finishes (seed-vs-adopt election), and
  // the extensions memo withholds the binding until then.
  if (collabEnabled && sharedCollab && !sharedSeededRef.current) {
    const ytext = getCodeYText(sharedCollab.session.ydoc, sharedCollab.textKey);
    if (ytext.length > 0) {
      // A second view joining an ALREADY-LIVE page model. The Y.Text is
      // authoritative and there is no seed-vs-adopt decision left to wait for,
      // so bind now: gating this on the room handshake made duplicate views of
      // one page stop sharing text until the room settled — and never, when
      
      sharedSeededRef.current = true;
      collabInitialValueRef.current = ytext.toString();
    } else if (!sharedCollab.session.network) {
      // LOCAL session: no election exists, so this view owns the seed.
      sharedSeededRef.current = true;
      if (collabInitialValueRef.current) {
        ytext.insert(0, collabInitialValueRef.current);
      }
    }
    // NETWORKED and still empty: the effect below settles seed-vs-adopt first.
    // Binding here would pair a non-empty CM document with an empty Y.Text and
    // duplicate the body when the room's replay lands.
  }
  const sharedCollabSeeded = sharedSeededRef.current;

  // A networked shared model is not writable until its seed/adopt election has
  // settled. Letting the editor accept input in this short window can bind the
  // next render to a different Y.Text snapshot and silently lose that input (or
  // leave a duplicate view behind). The settling callback below advances
  // collabReadyTick, so the binding and edit authority become live together.
  const effectiveReadOnly =
    readOnly ||
    Boolean(
      collabEnabled &&
        sharedCollab?.session.network &&
        !sharedCollabSeeded,
    );

  // SHARED mode, NETWORKED session: wait out the room handshake, then bind.
  useEffect(() => {
    if (!collabEnabled) return;
    const shared = sharedCollabRef.current;
    const network = shared?.session.network;
    if (!shared || !network || sharedSeededRef.current) return;
    let alive = true;
    const settle = (adopt: boolean) => {
      if (!alive || sharedSeededRef.current) return;
      sharedSeededRef.current = true;
      finalizeCollabText(
        getCodeYText(shared.session.ydoc, shared.textKey),
        adopt,
      );
    };
    network.whenReady
      // Adopt only when the room really delivered state — a claimed-but-empty
      // room (seeder died before contributing) must not blank the buffer
      
      .then(({ first }) => settle(!first && network.hasState))
      .catch(() => settle(false)); // network dead → behave like local
    return () => {
      alive = false;
    };
    // Mount-time constants (the parent owns the session's lifecycle).
  }, [collabEnabled, finalizeCollabText]);

  useEffect(() => {
    if (!collabEnabled || !collab) return;
    const shared = sharedCollabRef.current;
    if (shared) {
      // SHARED mode: the bind + seed already happened synchronously at first
      // render (see above); the session is parent-owned, so there is no
      // teardown and no readyTick churn needed here.
      return;
    }
    // OWNED mode: create + own a session for this editor (one editor = one doc).
    const owned = collab as CodeMirrorOwnedCollabConfig;
    const session = createCollabSession({
      docId: owned.docId,
      // undefined (not null) keeps Stage-2 auto-wiring eligible: the docId
      // doubles as the server room when a socket origin resolves.
      roomName: owned.roomName ?? undefined,
      userName: owned.userName ?? null,
      userColor: owned.userColor ?? null,
    });
    collabSessionRef.current = session;
    // Seeding election: a NETWORKED session must wait for the room handshake —
    // only the first member seeds from the loaded value; later joiners adopt
    // the replayed state (double-seed would duplicate the document). A local
    // session settles immediately, exactly as before.
    const settle = (adopt: boolean) => {
      if (collabSessionRef.current !== session) return; // torn down meanwhile
      finalizeCollabText(getCodeYText(session.ydoc), adopt);
    };
    if (session.network) {
      session.network.whenReady
        .then(({ first }) => settle(!first))
        .catch(() => settle(false)); // network dead → behave like local
    } else {
      settle(false);
    }
    return () => {
      collabSessionRef.current = null;
      session.destroy();
    };
    // The collab identity/room are mount-time constants for this editor; we bind
    // once and intentionally do not rebind on every prop tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collabEnabled]);

  const yjsReplayAuthorityRef = useRef<{
    sync: YSyncConfig;
    canonical: string;
  } | null>(null);
  const yjsReplayAuthorityExtension = useMemo<Extension>(
    () =>
      ViewPlugin.fromClass(
        class {
          private readonly sync: YSyncConfig;
          private readonly observer: (
            event: Y.YTextEvent,
            transaction: Y.Transaction,
          ) => void;

          constructor(readonly view: EditorView) {
            this.sync = view.state.facet(ySyncFacet);
            this.observer = (event, transaction) => {
              if (transaction.origin === this.sync) {
                yjsReplayAuthorityRef.current = null;
                return;
              }
              const canonical = this.sync.ytext.toString();
              yjsReplayAuthorityRef.current = {
                sync: this.sync,
                canonical,
              };
              // Once a remote Yjs transaction lands, its exact text is the
              // host-visible authority too. Never leave the mount-time seed as
              // an ExternalChange rollback target after newer room state.
              collabInitialValueRef.current = canonical;
              hostAuthoritativeValueRef.current = canonical;

              const changes: Array<{
                from: number;
                to: number;
                insert: string;
              }> = [];
              let position = 0;
              for (const delta of event.delta) {
                if (typeof delta.insert === "string") {
                  changes.push({
                    from: position,
                    to: position,
                    insert: delta.insert,
                  });
                } else if (typeof delta.delete === "number") {
                  changes.push({
                    from: position,
                    to: position + delta.delete,
                    insert: "",
                  });
                  position += delta.delete;
                } else if (typeof delta.retain === "number") {
                  position += delta.retain;
                }
              }

              try {
                this.view.dispatch({
                  changes,
                  annotations: ySyncAnnotation.of(this.sync),
                });
              } finally {
                // This capability exists only during the synchronous dispatch
                // produced by the exact Y.Text observer turn above.
                if (yjsReplayAuthorityRef.current?.sync === this.sync) {
                  yjsReplayAuthorityRef.current = null;
                }
              }
            };
            this.sync.ytext.observe(this.observer);
          }

          update(update: ViewUpdate) {
            if (
              !update.docChanged ||
              update.transactions[0]?.annotation(ySyncAnnotation) === this.sync
            ) {
              return;
            }
            const ytext = this.sync.ytext;
            ytext.doc?.transact(() => {
              let adjustment = 0;
              update.changes.iterChanges(
                (fromA, toA, _fromB, _toB, insert) => {
                  const inserted = insert.sliceString(0, insert.length, "\n");
                  if (fromA !== toA) {
                    ytext.delete(fromA + adjustment, toA - fromA);
                  }
                  if (inserted.length > 0) {
                    ytext.insert(fromA + adjustment, inserted);
                  }
                  adjustment += inserted.length - (toA - fromA);
                },
              );
            }, this.sync);
          }

          destroy() {
            this.sync.ytext.unobserve(this.observer);
            if (yjsReplayAuthorityRef.current?.sync === this.sync) {
              yjsReplayAuthorityRef.current = null;
            }
          }
        },
      ),
    [],
  );

  // The yCollab extension(s) for the live binding, or [] when collab is OFF or
  // the session isn't ready yet. Recomputes when the session becomes available.
  const collabExtensions = useMemo<Extension[]>(() => {
    if (!collabEnabled) return [];
    const shared = sharedCollabRef.current;
    if (shared) {
      // Networked shared sessions withhold the binding until the seeding
      // election settles (see the whenReady effect above): yCollab must not
      // bind while the CM doc and the Y.Text can still disagree.
      if (!sharedCollabSeeded) return [];
      const binding = buildCodeCollabExtensions({
        ytext: getCodeYText(shared.session.ydoc, shared.textKey),
        awareness: shared.session.awareness,
        undoManager: shared.undoManager ?? false,
      }).map((extension) =>
        replaceYSyncPlugin(extension, yjsReplayAuthorityExtension),
      );
      return shared.undoManager
        ? [...binding, Prec.highest(keymap.of(yUndoManagerKeymap))]
        : binding;
    }
    const session = collabSessionRef.current;
    if (!session) return [];
    return buildCodeCollabExtensions({
      ytext: getCodeYText(session.ydoc),
      awareness: session.awareness,
    }).map((extension) =>
      replaceYSyncPlugin(extension, yjsReplayAuthorityExtension),
    );
    // collabReadyTick gates the recompute once the session lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    collabEnabled,
    collabReadyTick,
    sharedCollabSeeded,
    yjsReplayAuthorityExtension,
  ]);
  const effectiveBasicSetup = useMemo<BasicSetupOptions>(
    () =>
      sharedUndoManager
        ? {
            ...BASIC_SETUP,
            history: false,
            historyKeymap: false,
          }
        : BASIC_SETUP,
    [sharedUndoManager],
  );

  // --- Accessibility: live-region announcements -----------------------------
  // The single string the visually-hidden aria-live="polite" region exposes to
  // screen readers. Updated ONLY when the derived announceable value actually
  // CHANGES (see the debounced effect below), never on every render — a polite
  // region that re-announces an unchanged value spams the SR queue and makes the
  // editor unusable for AT users.
  const [announcement, setAnnouncement] = useState("");
  // The last value we announced. Held in a ref (not state) so comparing the next
  // candidate against it never itself triggers a re-render; the debounce timer
  // dedupes against this so an identical value is dropped silently.
  const lastAnnouncedRef = useRef("");
  // Live count of CM6 lint diagnostics, mirrored into React from the editor's
  // lint state by an updateListener (diagnostics live inside CM6, not React).
  // Drives the "N problems" announcement when it changes.
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const diagnosticCountChangeRef = useRef(onDiagnosticCountChange);
  const problemsChangeRef = useRef(onProblemsChange);
  const lastReportedDiagnosticCountRef = useRef(0);
  const lastReportedProblemSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    diagnosticCountChangeRef.current = onDiagnosticCountChange;
  }, [onDiagnosticCountChange]);
  useEffect(() => {
    problemsChangeRef.current = onProblemsChange;
  }, [onProblemsChange]);
  // Problems panel (VSCode parity: Ctrl/Cmd+Shift+M). Reports exact totals and
  // renders selected severity groups with 1-based line:col + click-to-jump.
  // Like the references/symbols panels it is pure view — closed by default, so
  // an editor that never opens it is byte-for-byte unchanged — and holds no
  // persisted state. `problemList` is read live from CM6 when
  // the panel is open; the diagnostic updateListener re-reads it on every lint
  // transaction so an open panel tracks the async re-lint. Each entry carries the
  // raw {from,to} (for the jump) plus the precomputed 1-based line/col (for
  // display + the line→column sort).
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [problemList, setProblemList] = useState<ProblemEntry[]>([]);
  const [problemSeverityVisibility, setProblemSeverityVisibility] =
    useState<ProblemSeverityVisibility>(ALL_PROBLEM_SEVERITIES);
  const problemSeverityVisibilityRef = useRef(problemSeverityVisibility);
  problemSeverityVisibilityRef.current = problemSeverityVisibility;
  const [problemSeverityCounts, setProblemSeverityCounts] =
    useState<ProblemSeverityCounts>(ZERO_PROBLEM_SEVERITY_COUNTS);
  const problemSeverityCountsRef = useRef<ProblemSeverityCounts>(
    ZERO_PROBLEM_SEVERITY_COUNTS,
  );
  // Live ref to whether the panel is open, read inside the (stable) diagnostic
  // updateListener so it can SKIP building the list while the panel is closed
  // (preserving the closed-default no-op behaviour) without re-creating the
  // listener extension — re-creating it would reconfigure the editor and is
  // exactly the kind of mount churn the byte-stability requirement forbids.
  const problemsOpenRef = useRef(false);
  problemsOpenRef.current = problemsOpen;
  // The Problems pane's close button: where the keyboard lands on open.
  const problemsPanelRef = useRef<HTMLButtonElement>(null);
  // Signature of the diagnostic set behind the CURRENT `problemList`, so the
  // updateListener can skip rebuilding the list on geometry-only updates (which
  // would otherwise spin a render↔measure loop). Reset on close so the next open
  // always rebuilds from the live state.
  const problemSignatureRef = useRef<string>("");
  useEffect(() => {
    if (!lightweightMode) return;
    lastReportedDiagnosticCountRef.current = 0;
    lastReportedProblemSignatureRef.current = null;
    problemSignatureRef.current = "";
    setDiagnosticCount(0);
    problemSeverityCountsRef.current = ZERO_PROBLEM_SEVERITY_COUNTS;
    setProblemSeverityCounts(ZERO_PROBLEM_SEVERITY_COUNTS);
    setProblemList([]);
    diagnosticCountChangeRef.current?.(0);
    problemsChangeRef.current?.([]);
  }, [lightweightMode]);

  // Find-bar state — same controls/markup/semantics as the textarea editor.
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  // Preserve Case (VSCode Aa/AB): when on, each replacement adopts the case
  // shape (UPPER / lower / Capitalized) of the text it replaces. Replacement-only
  // — never changes which matches are found or the highlight.
  const [preserveCaseOn, setPreserveCaseOn] = useState(false);
  const [inSelection, setInSelection] = useState(false);
  const [selRange, setSelRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  // The match the next/prev step and single-replace act on. Reset to the match
  // nearest the caret whenever the query/flags change (see effect below).
  const [activeMatch, setActiveMatch] = useState(0);

  // Go-to-line state.
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");

  // Rename-symbol (F2) inline-prompt state. `renamePos` pins the caret offset the
  // rename was triggered at so applying it is independent of later cursor moves.
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePos, setRenamePos] = useState(0);
  const [renameError, setRenameError] = useState<string | null>(null);
  // Transient inline notice (e.g. "no definition found"), auto-cleared.
  const [intelNotice, setIntelNotice] = useState<string | null>(null);

  // Find-all-references (Shift+F12) panel state. `refList` is the computed
  // same-file reference spans; `refActiveIndex` highlights the entry the caret
  // sits on (so the symbol you triggered from stands out in the list). The panel
  // is pure view: it holds no persisted state and opens only on the chord.
  const [refsOpen, setRefsOpen] = useState(false);
  // A reference entry is either a same-buffer span or a cross-file one (carrying
  // `cellId`/`cellLabel`, navigated via onNavigateCrossFile rather than a local
  // dispatch). The optional fields are absent for the single-buffer path.
  const [refList, setRefList] = useState<
    Array<ReferenceSpan & { cellId?: string; cellLabel?: string }>
  >([]);
  const [refActiveIndex, setRefActiveIndex] = useState(-1);
  const [refQuery, setRefQuery] = useState("");
  const deferredRefQuery = useDeferredValue(refQuery);
  const [refVisibleLimit, setRefVisibleLimit] = useState(
    CODE_REFERENCE_PANEL_INITIAL_LIMIT,
  );
  const refFilterInputRef = useRef<HTMLInputElement>(null);
  // What the shared list panel is currently showing. References and the two
  // call-hierarchy directions are the same kind of answer — a bounded list of
  // places — so they share one panel and differ only in its title.
  const [refsMode, setRefsMode] = useState<
    "references" | "incomingCalls" | "outgoingCalls"
  >("references");
  const referencePanelTitle = t(
    refsMode === "incomingCalls"
      ? "code.callHierarchy.incoming"
      : refsMode === "outgoingCalls"
        ? "code.callHierarchy.outgoing"
        : "code.references.title",
  );
  // Find/Call/Peek share one result surface and therefore one monotonic owner.
  // A newer command, dismissal, edit/Undo, selection ABA, source/language
  // replacement or unmount retires every older continuation together.
  const referenceResultRequestIdRef = useRef(0);
  const referenceResultBusyRef = useRef(false);
  const [referenceResultBusy, setReferenceResultBusy] = useState(false);
  const normalizedRefQuery = deferredRefQuery.trim().toLocaleLowerCase();
  const filteredReferenceEntries = useMemo(
    () =>
      refList.flatMap((ref, sourceIndex) => {
        const preview = boundedReferencePreview(ref.preview);
        const cellLabel = (ref.cellLabel ?? "").slice(0, 256);
        return normalizedRefQuery.length === 0 ||
          `${cellLabel}\n${ref.line}\n${preview}`
            .toLocaleLowerCase()
            .includes(normalizedRefQuery)
          ? [{ ref, sourceIndex, preview, cellLabel }]
          : [];
      }),
    [normalizedRefQuery, refList],
  );
  const visibleReferenceEntries = useMemo(() => {
    const visible = filteredReferenceEntries.slice(0, refVisibleLimit);
    const active = filteredReferenceEntries.find(
      (entry) => entry.sourceIndex === refActiveIndex,
    );
    if (
      active &&
      !visible.some((entry) => entry.sourceIndex === active.sourceIndex)
    ) {
      visible.push(active);
      visible.sort((left, right) => left.sourceIndex - right.sourceIndex);
    }
    return visible;
  }, [filteredReferenceEntries, refActiveIndex, refVisibleLimit]);
  const hiddenReferenceCount = Math.max(
    0,
    filteredReferenceEntries.length - visibleReferenceEntries.length,
  );

  // Compare / diff-merge view state (VSCode "Compare" / integrated diff parity;
  // Ctrl/Cmd+Shift+\). Only ever populated when the host supplies `compareSources`
  // (a multi-buffer host with sibling code cells); absent everywhere else, so the whole
  // feature — toolbar button, picker, panel — renders nothing and the editor is
  // byte-for-byte unchanged. `compareList` is the snapshot of pickable sources
  // taken when the picker opens; `compareWith` is the chosen source the buffer is
  // diffed against (null == picker is showing the list, not yet a diff). Like the
  // references panel it is pure view: it holds no persisted state.
  const [compareOpen, setCompareOpen] = useState(false);
  const compareOpenRef = useRef(compareOpen);
  useLayoutEffect(() => {
    compareOpenRef.current = compareOpen;
  }, [compareOpen]);
  const [compareList, setCompareList] = useState<CompareSource[]>([]);
  const [compareQuery, setCompareQuery] = useState("");
  const [compareWith, setCompareWith] = useState<ResolvedCompareSource | null>(
    null,
  );
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareLoadError, setCompareLoadError] = useState<string | null>(null);
  // Optional common ancestor for a THREE-WAY review. Chosen from the very same
  // host-provided source list (a sibling buffer or a saved version) — this
  // surface never shells out to Git and never reads a host filesystem. While it
  // is null the panel keeps its existing two-way behaviour byte-for-byte.
  const [compareBase, setCompareBase] = useState<ResolvedCompareSource | null>(
    null,
  );
  // The LEFT side of a two-way diff. `null` means the live buffer, which is
  // what it always was and still is until the user picks something else. With a
  // source chosen, the panel diffs two picked versions and the editor's own text
  // is not on screen — which is exactly why applying a chunk is withdrawn below.
  const [compareLeft, setCompareLeft] = useState<ResolvedCompareSource | null>(
    null,
  );
  // Which role the picker is currently filling (null == a diff/merge is showing).
  const [comparePickingRole, setComparePickingRole] =
    useState<CompareSourceRole | null>(null);
  const [compareConflicts, setCompareConflicts] =
    useState<CodeCompareConflictState | null>(null);
  const compareRequestIdRef = useRef(0);
  const lastCompareSourceScopeRef = useRef(compareSourceScope);
  const activeCompareSourceScopeRef = useRef(compareSourceScope);
  // Live chunk count + a tick that bumps after the merge view (re)builds, so the
  // header's "N changes" label reflects the actual diff. The handle is imperative
  // (the MergeView lives outside React), so we read its chunk count after mount.
  const [compareChunkCount, setCompareChunkCount] = useState(0);
  const compareHandleRef = useRef<CodeCompareHandle | null>(null);
  const comparePanelRef = useRef<HTMLDivElement>(null);
  const compareFilterRef = useRef<HTMLInputElement>(null);

  // Provider functions intentionally live in refs because many hosts create a
  // new closure on every keystroke. A separate stable scope identifies genuine
  // document changes: invalidate pending lazy loads and close any stale diff
  // without treating ordinary rerenders as navigation.
  useLayoutEffect(() => {
    // Scope is an ownership boundary for asynchronous snapshot loads. Publish
    // it only after React commits this render: mutating the ref during render
    // lets an abandoned concurrent render invalidate the still-visible page,
    // while waiting for a passive effect leaves a brief window in which an old
    // request can publish into the newly committed page.
    activeCompareSourceScopeRef.current = compareSourceScope;
    if (lastCompareSourceScopeRef.current !== compareSourceScope) {
      lastCompareSourceScopeRef.current = compareSourceScope;
      compareRequestIdRef.current += 1;
      setCompareOpen(false);
      setCompareList([]);
      setCompareQuery("");
      setCompareWith(null);
      setCompareBase(null);
      setCompareLeft(null);
      setComparePickingRole(null);
      setCompareConflicts(null);
      setCompareLoading(false);
      setCompareLoadError(null);
      setCompareChunkCount(0);
      compareHandleRef.current = null;
    }
    return () => {
      compareRequestIdRef.current += 1;
    };
  }, [compareSourceScope]);

  // Go-to-Symbol / Outline (Ctrl/Cmd+Shift+O) picker state. `symbolList` is the
  // document's flattened symbol outline (TS/JS via the navigation tree; other
  // languages via a light header-line scan); `symbolActiveIndex` highlights the
  // symbol the caret currently sits inside (so the picker opens with that entry
  // marked). Like the references panel it is pure view — it holds no persisted
  // state and opens only on the chord. `DocumentSymbol` is the shared shape both
  // the TS and fallback extractors return.
  // Keyboard Shortcuts reference (VSCode Ctrl+K Ctrl+S). Pure view: it lists
  // the chords the editor binds so they can be discovered rather than guessed.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsQuery, setShortcutsQuery] = useState("");
  const shortcutsPanelRef = useRef<HTMLDivElement>(null);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [symbolList, setSymbolList] = useState<DocumentSymbol[]>([]);
  const symbolOwnerRef = useRef({ language, viewStateKey });
  symbolOwnerRef.current = { language, viewStateKey };
  // Persistent OUTLINE / symbol-tree sidebar (VSCode "Outline" view). Reuses the
  // live `breadcrumbSymbols` list + `selectSymbolSpan` jump (see CodeOutlinePanel).
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Markdown PREVIEW (VSCode "Open Preview"): a rendered view of the live buffer,
  // only meaningful when the buffer's language is markdown.
  const isMarkdownBuffer = language === "markdown";
  const markdownPreviewScope = useMemo(
    () => Symbol(`markdown-preview:${viewStateKey ?? "transient"}:${language}`),
    [language, viewStateKey],
  );
  const [markdownPreviewOwner, setMarkdownPreviewOwner] = useState<
    symbol | null
  >(null);
  const [markdownFullPreviewSource, setMarkdownFullPreviewSource] = useState<
    string | null
  >(null);
  const markdownPreviewOpen =
    isMarkdownBuffer && markdownPreviewOwner === markdownPreviewScope;
  const markdownPreviewFull = markdownFullPreviewSource === value;
  const markdownPreviewTruncated =
    value.length > CODE_MARKDOWN_PREVIEW_INITIAL_CHARS && !markdownPreviewFull;
  const markdownPreviewText = markdownPreviewTruncated
    ? value.slice(0, CODE_MARKDOWN_PREVIEW_INITIAL_CHARS)
    : value;
  const [symbolActiveIndex, setSymbolActiveIndex] = useState(-1);

  // Breadcrumbs strip (VSCode parity) state. `breadcrumbSymbols` is the SAME
  // flattened outline the picker uses, recomputed (debounced) whenever the buffer
  // or language changes; the caret store tracks the head so the strip can derive
  // the enclosing-symbol chain without rendering this parent. The strip renders
  // ONLY when `breadcrumbSymbols` is non-empty, so a structure-less buffer (no
  // symbols) shows nothing and the default editor is byte-for-byte unchanged.
  const [breadcrumbSymbolSnapshot, setBreadcrumbSymbolSnapshot] = useState<{
    language: string;
    viewStateKey: string | undefined;
    source: string;
    symbols: DocumentSymbol[];
  } | null>(null);
  const breadcrumbSymbolsCurrent =
    breadcrumbSymbolSnapshot?.language === language &&
    breadcrumbSymbolSnapshot.viewStateKey === viewStateKey &&
    breadcrumbSymbolSnapshot.source === value;
  const breadcrumbSymbols = breadcrumbSymbolsCurrent
    ? breadcrumbSymbolSnapshot.symbols
    : EMPTY_DOCUMENT_SYMBOLS;
  const outlineSymbolsLoading =
    !breadcrumbSymbolsCurrent && !lightweightMode;
  const caretRenderSnapshotRef = useRef<CodeCaretRenderSnapshot>({
    offset: 0,
    line: 1,
    col: 1,
  });
  const caretRenderListenersRef = useRef<Set<() => void> | null>(null);
  if (caretRenderListenersRef.current === null) {
    caretRenderListenersRef.current = new Set();
  }
  const caretRenderStore = useMemo<CodeCaretRenderStore>(
    () => ({
      getSnapshot: () => caretRenderSnapshotRef.current,
      subscribe: (listener) => {
        caretRenderListenersRef.current?.add(listener);
        return () => {
          caretRenderListenersRef.current?.delete(listener);
        };
      },
    }),
    [],
  );
  // Keep the status-bar position from CodeMirror's balanced Text tree instead of
  // rescanning the controlled source string up to the caret after every edit.
  // This matters at the 2 MiB import ceiling, where a caret near EOF previously
  // put an extra whole-source walk on every keystroke.
  const caretRenderGenerationRef = useRef(0);
  const caretRenderTrailingTimerRef = useRef<number | null>(null);
  const caretRenderMaxTimerRef = useRef<number | null>(null);
  const pendingCaretRenderRef = useRef<{
    view: EditorView;
    ownerKey: string | undefined;
    generation: number;
    offset: number;
    line: number;
    col: number;
  } | null>(null);
  const clearCaretRenderTimers = useCallback(() => {
    if (caretRenderTrailingTimerRef.current !== null) {
      window.clearTimeout(caretRenderTrailingTimerRef.current);
      caretRenderTrailingTimerRef.current = null;
    }
    if (caretRenderMaxTimerRef.current !== null) {
      window.clearTimeout(caretRenderMaxTimerRef.current);
      caretRenderMaxTimerRef.current = null;
    }
  }, []);
  const publishPendingCaretRender = useCallback(
    (expectedView: EditorView, expectedGeneration: number) => {
      if (expectedGeneration !== caretRenderGenerationRef.current) return;
      const pending = pendingCaretRenderRef.current;
      if (
        !pending ||
        pending.view !== expectedView ||
        pending.ownerKey !== viewStateKeyRef.current ||
        pending.generation !== expectedGeneration ||
        viewRef.current !== expectedView
      ) {
        pendingCaretRenderRef.current = null;
        clearCaretRenderTimers();
        return;
      }
      pendingCaretRenderRef.current = null;
      clearCaretRenderTimers();
      const previous = caretRenderSnapshotRef.current;
      if (
        previous.offset === pending.offset &&
        previous.line === pending.line &&
        previous.col === pending.col
      ) {
        return;
      }
      caretRenderSnapshotRef.current = {
        offset: pending.offset,
        line: pending.line,
        col: pending.col,
      };
      for (const listener of caretRenderListenersRef.current ?? []) listener();
    },
    [clearCaretRenderTimers],
  );
  const scheduleCaretRender = useCallback(
    (view: EditorView, next: { offset: number; line: number; col: number }) => {
      if (
        pendingCaretRenderRef.current &&
        (pendingCaretRenderRef.current.view !== view ||
          pendingCaretRenderRef.current.ownerKey !== viewStateKeyRef.current)
      ) {
        caretRenderGenerationRef.current += 1;
        pendingCaretRenderRef.current = null;
        clearCaretRenderTimers();
      }
      const generation = caretRenderGenerationRef.current;
      pendingCaretRenderRef.current = {
        view,
        ownerKey: viewStateKeyRef.current,
        generation,
        ...next,
      };
      if (caretRenderTrailingTimerRef.current !== null) {
        window.clearTimeout(caretRenderTrailingTimerRef.current);
      }
      caretRenderTrailingTimerRef.current = window.setTimeout(
        () => publishPendingCaretRender(view, generation),
        CARET_RENDER_SETTLE_MS,
      );
      if (caretRenderMaxTimerRef.current === null) {
        caretRenderMaxTimerRef.current = window.setTimeout(
          () => publishPendingCaretRender(view, generation),
          CARET_RENDER_MAX_WAIT_MS,
        );
      }
    },
    [clearCaretRenderTimers, publishPendingCaretRender],
  );
  useEffect(
    () => () => {
      caretRenderGenerationRef.current += 1;
      pendingCaretRenderRef.current = null;
      clearCaretRenderTimers();
    },
    [clearCaretRenderTimers],
  );
  const cursorLineChangeRef = useRef(onCursorLineChange);
  cursorLineChangeRef.current = onCursorLineChange;
  const lastReportedCursorLineRef = useRef<number | null>(null);
  const persistCodeEditorViewState = useCallback(
    (view: EditorView | null = viewRef.current) => {
      const scope = viewStateKeyRef.current;
      if (!scope || !view) return;
      const selection = view.state.selection;
      const folds = collectCodeEditorFoldRanges((visit) =>
        foldedRanges(view.state).between(
          0,
          view.state.doc.length,
          visit,
        ),
      );
      saveCodeEditorViewState(scope, {
        version: 1,
        documentLength: view.state.doc.length,
        ranges: selection.ranges.map((range) => ({
          anchor: range.anchor,
          head: range.head,
        })),
        mainIndex: selection.mainIndex,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
        folds,
      });
    },
    [],
  );
  const flushCodeEditorViewState = useCallback(() => {
    if (viewStateSaveTimerRef.current !== null) {
      clearTimeout(viewStateSaveTimerRef.current);
      viewStateSaveTimerRef.current = null;
    }
    persistCodeEditorViewState();
  }, [persistCodeEditorViewState]);
  const scheduleCodeEditorViewState = useCallback(
    (view: EditorView) => {
      if (!viewStateKeyRef.current) return;
      if (viewStateSaveTimerRef.current !== null) {
        clearTimeout(viewStateSaveTimerRef.current);
      }
      viewStateSaveTimerRef.current = setTimeout(() => {
        viewStateSaveTimerRef.current = null;
        // A late timer from a destroyed/replaced view must not overwrite the
        // current page's snapshot.
        if (viewRef.current === view) persistCodeEditorViewState(view);
      }, VIEW_STATE_SAVE_DELAY_MS);
    },
    [persistCodeEditorViewState],
  );
  const scheduleCodeEditorViewStateRef = useRef(scheduleCodeEditorViewState);
  scheduleCodeEditorViewStateRef.current = scheduleCodeEditorViewState;
  useEffect(() => {
    const handlePageHide = () => flushCodeEditorViewState();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (viewStateRestoreFrameRef.current !== null) {
        cancelAnimationFrame(viewStateRestoreFrameRef.current);
        viewStateRestoreFrameRef.current = null;
      }
      // React cleanup is the reliable close-window path; pagehide covers hard
      // reload/navigation where a debounced timer may never get another turn.
      flushCodeEditorViewState();
    };
  }, [flushCodeEditorViewState]);
  // Selection summary for the status bar (VSCode parity): total selected chars
  // across all ranges + the number of cursors/ranges. Mirrored from CM6 by the
  // caret listener on every selection change. `{0, 1}` is a single collapsed
  // caret (the default), which renders no extra status segment.
  const [selSummary, setSelSummary] = useState<{
    selectedChars: number;
    cursorCount: number;
    selectedText: string;
    selectedTextTruncated: boolean;
    selectionFrom: number | null;
    selectionTo: number | null;
  }>({
    selectedChars: 0,
    cursorCount: 1,
    selectedText: "",
    selectedTextTruncated: false,
    selectionFrom: null,
    selectionTo: null,
  });
  const executionStateChangeRef = useRef(onExecutionStateChange);
  executionStateChangeRef.current = onExecutionStateChange;
  const lastReportedExecutionStateRef = useRef<
    CodeEditorExecutionState | undefined
  >(undefined);
  const [editHistoryState, setEditHistoryState] = useState(() => ({
    canUndo: (sharedUndoManager?.undoStack.length ?? 0) > 0,
    canRedo: (sharedUndoManager?.redoStack.length ?? 0) > 0,
  }));
  useEffect(() => {
    if (!sharedUndoManager) return;
    const refresh = () => {
      const next = {
        canUndo: sharedUndoManager.undoStack.length > 0,
        canRedo: sharedUndoManager.redoStack.length > 0,
      };
      setEditHistoryState((previous) =>
        previous.canUndo === next.canUndo &&
        previous.canRedo === next.canRedo
          ? previous
          : next,
      );
    };
    sharedUndoManager.on("stack-item-added", refresh);
    sharedUndoManager.on("stack-item-popped", refresh);
    sharedUndoManager.on("stack-cleared", refresh);
    return () => {
      sharedUndoManager.off("stack-item-added", refresh);
      sharedUndoManager.off("stack-item-popped", refresh);
      sharedUndoManager.off("stack-cleared", refresh);
    };
  }, [sharedUndoManager]);

  // Command Palette (VSCode parity: Ctrl/Cmd+Shift+P) state. The palette is a
  // thin dispatcher over the editor commands ALREADY defined in this component —
  // it owns no engine, just a filterable list whose entries call those existing
  // callbacks. `paletteQuery` is the live filter text; `paletteActiveIndex` is
  // the highlighted row in the FILTERED list (keyboard arrows / Enter operate on
  // it). Like the references/symbols panels it is pure view: it holds no
  // persisted state and opens only on the chord, so the editor is byte-for-byte
  // unchanged until the user invokes it.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteActiveIndex, setPaletteActiveIndex] = useState(0);

  // Right-click context menu (VSCode parity): a small popover at the pointer
  // listing the most-used editing commands (Cut/Copy/Paste, Format, Go to
  // Definition, Peek, Rename, Toggle Comment, Change Case, Command Palette). It
  // holds only its open position; each item dispatches an EXISTING command. Null
  // when closed. Default closed, so a brand-new editor is byte-for-byte unchanged
  // until the user right-clicks.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Known when the editor mounts (it renders only in the browser), so it is
  // the initial state rather than an update in a mount effect.
  const [clipboardCapabilities] = useState(readClipboardCapabilities);
  const [clipboardPasteBusy, setClipboardPasteBusy] = useState(false);
  const clipboardPasteBusyRef = useRef(false);
  const [clipboardFeedback, setClipboardFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const clipboardRequestIdRef = useRef(0);
  const clipboardSourceIdentityRef = useRef({
    value,
    language,
    viewStateKey,
    readOnly,
  });
  const [formatBusy, setFormatBusy] = useState(false);
  const formatBusyRef = useRef(false);
  const [formatFeedback, setFormatFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const formatRequestIdRef = useRef(0);
  const activeFormatRequestRef = useRef<ActiveFormatRequest | null>(null);
  const formatSourceIdentityRef = useRef({
    value,
    language,
    viewStateKey,
    readOnly: effectiveReadOnly,
  });
  const saveRequestIdRef = useRef(0);
  const saveOwnerGenerationRef = useRef(0);
  const saveOwnerIdentityRef = useRef({
    language,
    viewStateKey,
    readOnly: effectiveReadOnly,
  });
  const readOnlyRef = useRef(effectiveReadOnly);
  // The change handler handed to <CodeMirror> keeps one identity:
  // react-codemirror reconfigures the WHOLE editor (every extension, the
  // gutters rebuilt, the view measured again) whenever its `onChange`
  // changes, and an inline handler made that happen on every render of this
  // editor, a ribbon tab change included (~700 ms in WebKit).
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });
  const handleCodeMirrorChange = useCallback(
    (next: string, update: ViewUpdate) => {
      if (readOnlyRef.current) return;
      const replayed = update.transactions.length > 0 && update.transactions.every(
        (transaction) => transaction.annotation(ySyncAnnotation) !== undefined,
      );
      onChangeRef.current(next, { replayed });
    },
    [],
  );
  const maxDocumentLengthRef = useRef(maxDocumentLength);
  const documentLimitExceededRef = useRef(onDocumentLimitExceeded);
  const onSaveRef = useRef(onSave);

  const documentLengthMutationBoundary = useMemo<Extension>(
    () =>
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged) return transaction;
        const rawLimit = maxDocumentLengthRef.current;
        if (rawLimit === undefined || !Number.isFinite(rawLimit)) {
          return transaction;
        }
        const limit = Math.max(0, Math.trunc(rawLimit));
        if (transaction.newDoc.length <= limit) return transaction;
        queueMicrotask(() => documentLimitExceededRef.current?.());
        return [];
      }),
    [],
  );

  // `EditorState.readOnly` and `EditorView.editable` govern DOM input, but CM6
  // commands and extension callbacks can still dispatch document transactions
  // programmatically. Keep one live filter at the state boundary so a checkout
  // revoke also stops retained sync keymaps and late async format/fix/refactor
  // results. Authoritative host hydration and Yjs replay remain allowed.
  const readOnlyMutationBoundary = useMemo<Extension>(
    () =>
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged) return transaction;
        const ysync = transaction.startState.facet(ySyncFacet);
        // A bound collaboration document is written through Yjs alone. @uiw's
        // controlled-value reconcile is a full-range ExternalChange replace
        // toward whatever `value` last rendered, and the remote-edit observer
        // refreshes that value to the room text of its moment: a later render
        // replaced the document with it, the replace went into the shared
        // Y.Text as delete-all + insert-all, and everything typed since was
        // deleted on every screen (three people in one code file). Only a
        // replace that installs the Y.Text's own current text may pass.
        if (
          ysync &&
          transaction.annotation(ExternalChange) === true &&
          transaction.annotation(ySyncAnnotation) !== ysync &&
          transaction.newDoc.toString() !== ysync.ytext.toString()
        ) {
          return [];
        }
        if (!readOnlyRef.current) return transaction;
        const replay = yjsReplayAuthorityRef.current;
        if (
          ysync &&
          replay &&
          ysync === replay.sync &&
          transaction.annotation(ySyncAnnotation) === ysync &&
          replay.canonical === ysync.ytext.toString() &&
          replay.canonical === transaction.newDoc.toString()
        ) {
          return transaction;
        }
        // A collab-bound document has exactly one display-authority path: the
        // authenticated Yjs replay above. ExternalChange is public and must not
        // become a second way to write Y.Text. Before a delayed collab binding
        // exists, or in a non-collab controlled editor, @uiw may hydrate only
        // the exact live host-owned value.
        if (
          !ysync &&
          transaction.annotation(ExternalChange) === true &&
          transaction.newDoc.toString() ===
            hostAuthoritativeValueRef.current
        ) {
          return transaction;
        }
        return [];
      }),
    [],
  );

  useLayoutEffect(() => {
    readOnlyRef.current = effectiveReadOnly;
    maxDocumentLengthRef.current = maxDocumentLength;
    documentLimitExceededRef.current = onDocumentLimitExceeded;
    onSaveRef.current = onSave;
  }, [effectiveReadOnly, maxDocumentLength, onDocumentLimitExceeded, onSave]);

  useLayoutEffect(() => {
    const previous = clipboardSourceIdentityRef.current;
    if (
      previous.value === value &&
      previous.language === language &&
      previous.viewStateKey === viewStateKey &&
      previous.readOnly === readOnly
    ) {
      return;
    }
    clipboardSourceIdentityRef.current = {
      value,
      language,
      viewStateKey,
      readOnly,
    };
    clipboardRequestIdRef.current += 1;
    if (clipboardPasteBusyRef.current) {
      clipboardPasteBusyRef.current = false;
      setClipboardPasteBusy(false);
    }
    if (clipboardFeedback) setClipboardFeedback(null);
  }, [clipboardFeedback, language, readOnly, value, viewStateKey]);

  useLayoutEffect(
    () => () => {
      clipboardRequestIdRef.current += 1;
      clipboardPasteBusyRef.current = false;
    },
    [],
  );

  useLayoutEffect(() => {
    const previous = formatSourceIdentityRef.current;
    const sourceChanged =
      previous.value !== value ||
      previous.language !== language ||
      previous.viewStateKey !== viewStateKey ||
      previous.readOnly !== effectiveReadOnly;
    if (sourceChanged) {
      formatSourceIdentityRef.current = {
        value,
        language,
        viewStateKey,
        readOnly: effectiveReadOnly,
      };
      formatRequestIdRef.current += 1;
      const activeFormat = activeFormatRequestRef.current;
      activeFormat?.retire();
      activeFormat?.controller.abort();
      activeFormatRequestRef.current = null;
      formatBusyRef.current = false;
      // Every content snapshot passes through here. Setting state that is
      // already idle is not free: from a layout effect React re-runs this
      // whole component to discover nothing changed, doubling the cost of
      // each snapshot. Only write when there is something to clear.
      if (formatBusy) setFormatBusy(false);
      if (formatFeedback !== null) setFormatFeedback(null);
    }

    const previousSaveOwner = saveOwnerIdentityRef.current;
    if (
      previousSaveOwner.language !== language ||
      previousSaveOwner.viewStateKey !== viewStateKey ||
      previousSaveOwner.readOnly !== effectiveReadOnly
    ) {
      saveOwnerIdentityRef.current = {
        language,
        viewStateKey,
        readOnly: effectiveReadOnly,
      };
      saveOwnerGenerationRef.current += 1;
      saveRequestIdRef.current += 1;
    }
  }, [
    effectiveReadOnly,
    formatBusy,
    formatFeedback,
    language,
    value,
    viewStateKey,
  ]);

  useLayoutEffect(
    () => () => {
      formatRequestIdRef.current += 1;
      saveRequestIdRef.current += 1;
      const activeFormat = activeFormatRequestRef.current;
      activeFormat?.retire();
      activeFormat?.controller.abort();
      activeFormatRequestRef.current = null;
      formatBusyRef.current = false;
    },
    [],
  );

  // Quick Fix / code-actions (Ctrl+. / Cmd+.) menu state. `fixList` is the
  // computed local + host-owned project code actions for the caret/selection at
  // trigger time. The menu is pure view: it holds no persisted state and opens
  // only on the chord; choosing an item applies it atomically and closes.
  const [fixesOpen, setFixesOpen] = useState(false);
  const [fixList, setFixList] = useState<EditorCodeFixAction[]>([]);
  const [fixQuery, setFixQuery] = useState("");
  const deferredFixQuery = useDeferredValue(fixQuery);
  const fixFilterInputRef = useRef<HTMLInputElement>(null);
  const [fixVisibleLimit, setFixVisibleLimit] = useState(
    CODE_ACTION_MENU_INITIAL_LIMIT,
  );
  const [fixMenuKind, setFixMenuKind] = useState<"quickFix" | "refactor">(
    "quickFix",
  );
  // Every edit in `fixList` is expressed in the coordinate space and language
  // of one CodeMirror document generation. Keep that identity beside the menu
  // so a language-only host update (same bytes, different parser) is just as
  // stale as a text edit or a replaced/destroyed view.
  const fixMutationClaimRef = useRef<EditorMutationClaim | null>(null);
  const normalizedFixQuery = deferredFixQuery.trim().toLocaleLowerCase();
  const filteredFixEntries = useMemo(
    () =>
      fixList.flatMap((fix, sourceIndex) =>
        normalizedFixQuery.length === 0 ||
        fix.description.toLocaleLowerCase().includes(normalizedFixQuery)
          ? [{ fix, sourceIndex }]
          : [],
      ),
    [fixList, normalizedFixQuery],
  );
  const visibleFixEntries = filteredFixEntries.slice(0, fixVisibleLimit);
  const hiddenFixCount = Math.max(
    0,
    filteredFixEntries.length - visibleFixEntries.length,
  );

  // Minimap preference. Automatic large-file mode may temporarily suppress the
  // rendered minimap, but never overwrites this authored choice; remounting or
  // returning below the workload threshold restores exactly what the user set.
  const [minimapOn, setMinimapOn] = useState(() =>
    loadEditorPref("minimap", true),
  );
  // Automatic large-file mode is derived from the controlled source rather than
  // user preference. This state owns only the explanatory status popover; the
  // editor returns to the saved rich-view preferences as soon as the source
  // drops below the bounded workload thresholds.
  const [performanceInfoOpen, setPerformanceInfoOpen] = useState(false);

  // Column / vertical rulers (VSCode `editor.rulers`): the 1-based columns at
  // which the editor draws faint full-height guide lines (e.g. 80 / 120 to mark
  // line-length limits). Seeded once from the persisted pref; default EMPTY (no
  // rulers), so the editor renders no rules until the user sets them and is
  // byte-for-byte the pre-feature surface. `rulerDraft` is the comma-separated
  // text the settings input edits; it is committed (parsed + persisted) on blur
  // / Enter into `rulerColumns`, which the rulers extension consumes.
  const [rulerColumns, setRulerColumns] = useState<number[]>(() =>
    loadRulerColumns(),
  );
  const [rulerDraft, setRulerDraft] = useState(() =>
    formatRulerColumns(loadRulerColumns()),
  );

  // User snippets pane (VSCode "User Snippets" parity), opened from the
  // settings popover and docked with the other side panes.
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  // Settings menu (gear) open state — the popover consolidating the view
  // toggles + zoom controls. Closed by default.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsEntryFocusFrameRef = useRef<number | null>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const closeSettingsMenu = useCallback((restoreFocus: boolean) => {
    if (settingsEntryFocusFrameRef.current !== null) {
      cancelAnimationFrame(settingsEntryFocusFrameRef.current);
      settingsEntryFocusFrameRef.current = null;
    }
    setSettingsOpen(false);
    const returnTarget = settingsReturnFocusRef.current;
    settingsReturnFocusRef.current = null;
    if (!restoreFocus) return;
    requestAnimationFrame(() => {
      if (
        returnTarget?.isConnected &&
        !returnTarget.matches(":disabled, [aria-disabled='true']")
      ) {
        returnTarget.focus();
        return;
      }
      viewRef.current?.contentDOM.focus();
    });
  }, []);
  const toggleSettingsMenu = useCallback(() => {
    if (settingsOpen) {
      closeSettingsMenu(true);
      return;
    }
    settingsReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSettingsOpen(true);
  }, [closeSettingsMenu, settingsOpen]);
  useLayoutEffect(() => {
    if (!settingsOpen) return;
    let completedSynchronously = false;
    const frame = requestAnimationFrame(() => {
      completedSynchronously = true;
      settingsEntryFocusFrameRef.current = null;
      settingsRef.current
        ?.querySelector<HTMLElement>(
          '[data-testid="code-settings-menu"] :is(button, input, select):not(:disabled)',
        )
        ?.focus();
    });
    if (!completedSynchronously) settingsEntryFocusFrameRef.current = frame;
    return () => {
      cancelAnimationFrame(frame);
      if (settingsEntryFocusFrameRef.current === frame) {
        settingsEntryFocusFrameRef.current = null;
      }
    };
  }, [settingsOpen]);

  // Editor font-size zoom (VSCode parity). `fontScale` is a multiplier of
  // BASE_FONT_SIZE; seeded once from the persisted pref. Default 1.0 (100%), so
  // the editor renders at exactly the pre-feature size until the user zooms.
  const [fontScale, setFontScale] = useState(() => loadFontScale());
  const fontZoomPercent = Math.round(fontScale * 100);
  // A monotonically-bumped tick that forces the minimap viewport box to
  // recompute when the editor scrolls (CM scroll events don't re-render React).
  const [scrollTick, setScrollTick] = useState(0);

  // VSCode-parity display toggles, seeded from persisted prefs (default OFF, so
  // the editor looks identical to before until the user opts in). The lazy
  // initializer reads localStorage once on mount; each toggle writes back below.
  const [wordWrapOn, setWordWrapOn] = useState(() =>
    loadEditorPref("wordWrap", false),
  );
  const [renderWhitespaceOn, setRenderWhitespaceOn] = useState(() =>
    loadEditorPref("renderWhitespace", false),
  );
  const [bracketColorsOn, setBracketColorsOn] = useState(() =>
    loadEditorPref("bracketColors", false),
  );
  // Indentation guides (VSCode parity): faint vertical rules at each indent
  // level. Default ON to match VSCode and every modern editor; persisted, so a
  // user who turns them off keeps them off across sessions.
  const [indentGuidesOn, setIndentGuidesOn] = useState(() =>
    loadEditorPref("indentGuides", true),
  );
  // Bracket-pair guides (VSCode parity): thin vertical connectors tying each
  // matched multi-line bracket pair down the gutter. Default ON to match VSCode
  // (`editor.guides.bracketPairs`); persisted, so a user who turns them off keeps
  // them off across sessions. A buffer with no multi-line brackets renders none.
  const [bracketPairGuidesOn, setBracketPairGuidesOn] = useState(() =>
    loadEditorPref("bracketPairGuides", true),
  );
  // Sticky scroll (VSCode parity): pin the enclosing function/class/block header
  // lines to the top of the viewport as you scroll into a block. Default OFF, so
  // the editor renders no overlay until the user opts in (byte-for-byte unchanged).
  const [stickyScrollOn, setStickyScrollOn] = useState(() =>
    loadEditorPref("stickyScroll", false),
  );
  // Inlay hints (VSCode parity): inline parameter-name + inferred-type labels for
  // TS/JS, rendered as atomic widget decorations (never document text). Default
  // ON — like modern VSCode, the hints are an immediate readability win on the
  // TS/JS surface and add NO characters to the buffer (copy/paste/onChange are
  // unaffected); persisted, so a user who turns them off keeps them off. The
  // extension is mounted ONLY for a TS/JS language with this pref on, so on every
  // other language / when off the editor is byte-for-byte unchanged.
  const [inlayHintsOn, setInlayHintsOn] = useState(() =>
    loadEditorPref("inlayHints", true),
  );
  // Code Lens (VSCode parity): an inline, clickable "N references" annotation
  // rendered as a block widget ABOVE each symbol definition for TS/JS. Default
  // ON — like VSCode, the reference counts are an immediate navigation win on the
  // TS/JS surface and add NO characters to the buffer (they're block decorations,
  // so copy/paste/onChange are unaffected); persisted, so a user who turns it off
  // keeps it off. The extension is mounted ONLY for a TS/JS language with this
  // pref on, so on every other language / when off the editor is byte-for-byte
  // unchanged. Clicking a lens opens the references panel for that symbol.
  const [codeLensOn, setCodeLensOn] = useState(() =>
    loadEditorPref("codeLens", true),
  );
  // Format on save (VSCode "editor.formatOnSave"): when ON, Cmd/Ctrl+S formats
  // the buffer before flushing the save. Default OFF (matches VSCode and the
  // other opt-in view toggles), so save behaviour is unchanged until opted in.
  // A live ref mirrors it so the (mount-stable) save keymap reads the freshest
  // value without being rebuilt on every toggle.
  const [formatOnSaveOn, setFormatOnSaveOn] = useState(() =>
    loadEditorPref("formatOnSave", false),
  );
  const formatOnSaveRef = useRef(formatOnSaveOn);
  formatOnSaveRef.current = formatOnSaveOn;
  // Trim trailing whitespace on save (VSCode "files.trimTrailingWhitespace").
  // Default OFF; independent of Format on save so the non-Prettier languages
  // (Python / Shell / SQL) — whose save path never trims — still get it. A live
  // ref mirrors it so the (mount-stable) save keymap reads the freshest value.
  const [trimTrailingOnSaveOn, setTrimTrailingOnSaveOn] = useState(() =>
    loadEditorPref("trimTrailingOnSave", false),
  );
  const trimTrailingOnSaveRef = useRef(trimTrailingOnSaveOn);
  trimTrailingOnSaveRef.current = trimTrailingOnSaveOn;
  // Insert final newline on save (VSCode "files.insertFinalNewline"): when ON,
  // Cmd/Ctrl+S ensures the file ends with exactly one trailing newline. Default
  // OFF; a live ref mirrors it for the mount-stable save keymap.
  const [insertFinalNewlineOn, setInsertFinalNewlineOn] = useState(() =>
    loadEditorPref("insertFinalNewline", false),
  );
  const insertFinalNewlineRef = useRef(insertFinalNewlineOn);
  insertFinalNewlineRef.current = insertFinalNewlineOn;
  // Trim final newlines on save (VSCode "files.trimFinalNewlines"): when ON,
  // Cmd/Ctrl+S removes all trailing blank lines. insertFinalNewline wins when both
  // are on (matching VSCode). Default OFF; a live ref mirrors it for the save keymap.
  const [trimFinalNewlinesOn, setTrimFinalNewlinesOn] = useState(() =>
    loadEditorPref("trimFinalNewlines", false),
  );
  const trimFinalNewlinesRef = useRef(trimFinalNewlinesOn);
  trimFinalNewlinesRef.current = trimFinalNewlinesOn;
  // Signature-help (parameter hints) tooltip state for TS/JS, anchored at a
  // buffer offset. Null when no call is active under the caret.
  const [sigHelp, setSigHelpState] = useState<{
    pos: number;
    info: SignatureHelpInfo;
  } | null>(null);
  // Whether a hint is shown or being looked up. While it is, typing an
  // argument or moving the caret inside the call keeps it current, as VS Code
  // does; leaving the call (no signature there) or `)` / Escape closes it.
  const sigHelpActiveRef = useRef(false);
  const setSigHelp = useCallback((next: typeof sigHelp) => {
    // Dismissing a hint that is not up (every buffer change does, and a page
    // loading in many windows changes it often) is not an update.
    if (next === null && !sigHelpActiveRef.current) return;
    sigHelpActiveRef.current = next !== null;
    setSigHelpState(next);
  }, []);
  // Monotonic request id: every trigger AND every dismissal bumps it, so a slow
  // async signature-help request (the TS compiler is dynamically imported) that
  // resolves AFTER the user closed the call with `)` / Escape is recognised as
  // stale and does not re-show the tooltip.
  const sigHelpGenRef = useRef(0);
  const dismissSignatureHelp = useCallback(() => {
    sigHelpGenRef.current += 1;
    setSigHelp(null);
  }, [setSigHelp]);
  /** The latest document the open hint was asked for, so the host echoing it keeps the hint. */
  const sigHelpTriggerDocRef = useRef<EditorState["doc"] | null>(null);

  // --- Configurable indentation (VSCode "Indent Using Spaces/Tabs" + tab size)
  // The editor's indent unit (what `indentWithTab` / auto-indent insert on a new
  // line) and tab DISPLAY width live in a reconfigurable CM6 Compartment so the
  // user can switch tabs↔spaces and 2/4/8 without recreating the editor. Seeded
  // from the document's OWN indentation (detectIndent) so opening a tab-indented
  // or 4-space file makes new lines follow that style; defaults to spaces-
  // DEFAULT_INDENT_WIDTH (basicSetup's old effective indent) on an un-indented
  // buffer, so the default editor's new-line indent is unchanged. The Compartment
  // instance is stable across renders.
  const indentCompartmentRef = useRef<Compartment | null>(null);
  if (indentCompartmentRef.current === null) {
    indentCompartmentRef.current = new Compartment();
  }
  const indentCompartment = indentCompartmentRef.current;

  // The GRAMMAR lives in its own Compartment in both strategies, so the parser
  // can arrive without rebuilding the editor around it. ON fetches one language;
  // OFF fetches the deferred all-language rollback module. Both mount the usable
  // gap extension first and replace it atomically when their chunk resolves.
  const languageCompartmentRef = useRef<Compartment | null>(null);
  if (languageCompartmentRef.current === null) {
    languageCompartmentRef.current = new Compartment();
  }
  const languageCompartment = languageCompartmentRef.current;

  const [indentStyle, setIndentStyle] = useState<{
    useTabs: boolean;
    width: number;
  }>(() => {
    const detected = detectIndent(value, DEFAULT_INDENT_WIDTH);
    return { useTabs: detected.useTabs, width: detected.width };
  });

  // The language slot is never semantically empty while a chunk is in flight.
  // Comment tokens and conservative indentation remain synchronous, and
  // tree-backed languages temporarily use the existing indentation fold service.
  // A successful grammar replaces this entire fallback atomically.
  const grammarGapExtension = useMemo<Extension>(
    () => [
      grammarGapLanguageExtension(language),
      ...(isTreeFoldLanguage(language)
        ? [streamFoldExtension(indentStyle.width)]
        : []),
    ],
    [indentStyle.width, language],
  );

  const [grammarLoadState, setGrammarLoadStateValue] = useState<{
    language: string;
    status: "ready" | "loading" | "failed";
  }>(() => ({
    language,
    status:
      peekLanguageExtension(language) !== null
        ? "ready"
        : "loading",
  }));
  // The grammar effect states the load on every run; a cached grammar is
  // already "ready" from the initial state, so only a real change updates.
  const grammarLoadStateRef = useRef(grammarLoadState);
  const setGrammarLoadState = useCallback(
    (next: { language: string; status: "ready" | "loading" | "failed" }) => {
      const current = grammarLoadStateRef.current;
      if (
        current.language === next.language &&
        current.status === next.status
      ) {
        return;
      }
      grammarLoadStateRef.current = next;
      setGrammarLoadStateValue(next);
    },
    [],
  );
  const [grammarRetryRequest, setGrammarRetryRequest] = useState(0);
  const grammarLoadStatus =
    grammarLoadState.language === language
      ? grammarLoadState.status
      : "loading";
  const grammarStatusMessage =
    grammarLoadStatus === "loading"
      ? t("code.grammar.loading", { language })
      : grammarLoadStatus === "failed"
        ? t("code.grammar.failed", { language })
        : "";
  const problemsCountMessage = t("code.problems.count", {
    count: diagnosticCount,
  });
  const filteredProblemCount =
    (problemSeverityVisibility.error ? problemSeverityCounts.error : 0) +
    (problemSeverityVisibility.warning ? problemSeverityCounts.warning : 0) +
    (problemSeverityVisibility.info ? problemSeverityCounts.info : 0);
  const problemListTruncated = filteredProblemCount > problemList.length;
  const problemsStatusMessage =
    grammarLoadStatus === "ready"
      ? problemsCountMessage
      : `${problemsCountMessage} · ${grammarStatusMessage}`;
  const retryGrammarLoad = useCallback(() => {
    setGrammarLoadState({ language, status: "loading" });
    setGrammarRetryRequest((request) => request + 1);
  }, [language, setGrammarLoadState]);

  // Fetch this page's grammar and swap it in when it lands. Switching to an
  // uncached language explicitly installs the fallback first: after a
  // Compartment has been reconfigured, a later `.of()` seed is ignored, so
  // relying on the rebuilt extension array would leave the previous grammar
  // active over the new document during the load gap.
  useLayoutEffect(() => {
    const cached = peekLanguageExtension(language);
    if (cached !== null) {
      viewRef.current?.dispatch({
        effects: languageCompartment.reconfigure(cached),
      });
      setGrammarLoadState({ language, status: "ready" });
      return;
    }

    setGrammarLoadState({ language, status: "loading" });
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(grammarGapExtension),
    });
    let cancelled = false;
    void loadConfiguredLanguageExtension(language).then(() => {
      if (cancelled) return;
      // Failures deliberately are not cached. In that case keep the fallback:
      // the editor stays commentable, indentable, and foldable while a later
      // render/session retry can recover the real grammar.
      const loaded = peekLanguageExtension(language);
      if (loaded === null) {
        setGrammarLoadState({
          language,
          status: languageLoadFailed(language) ? "failed" : "loading",
        });
        return;
      }
      const view = viewRef.current;
      if (view) {
        view.dispatch({ effects: languageCompartment.reconfigure(loaded) });
        if (!lightweightMode) forceLinting(view);
      }
      setGrammarLoadState({ language, status: "ready" });
    });
    return () => {
      cancelled = true;
    };
  }, [
    grammarGapExtension,
    grammarRetryRequest,
    language,
    languageCompartment,
    lightweightMode,
    setGrammarLoadState,
  ]);

  const toggleWordWrap = useCallback(() => {
    setWordWrapOn((on) => {
      const next = !on;
      saveEditorPref("wordWrap", next);
      return next;
    });
  }, []);
  const toggleRenderWhitespace = useCallback(() => {
    setRenderWhitespaceOn((on) => {
      const next = !on;
      saveEditorPref("renderWhitespace", next);
      return next;
    });
  }, []);
  const toggleBracketColors = useCallback(() => {
    setBracketColorsOn((on) => {
      const next = !on;
      saveEditorPref("bracketColors", next);
      return next;
    });
  }, []);
  const toggleIndentGuides = useCallback(() => {
    setIndentGuidesOn((on) => {
      const next = !on;
      saveEditorPref("indentGuides", next);
      return next;
    });
  }, []);
  const toggleBracketPairGuides = useCallback(() => {
    setBracketPairGuidesOn((on) => {
      const next = !on;
      saveEditorPref("bracketPairGuides", next);
      return next;
    });
  }, []);
  const toggleStickyScroll = useCallback(() => {
    setStickyScrollOn((on) => {
      const next = !on;
      saveEditorPref("stickyScroll", next);
      return next;
    });
  }, []);
  const toggleInlayHints = useCallback(() => {
    setInlayHintsOn((on) => {
      const next = !on;
      saveEditorPref("inlayHints", next);
      return next;
    });
  }, []);
  const toggleCodeLens = useCallback(() => {
    setCodeLensOn((on) => {
      const next = !on;
      saveEditorPref("codeLens", next);
      return next;
    });
  }, []);
  const toggleFormatOnSave = useCallback(() => {
    setFormatOnSaveOn((on) => {
      const next = !on;
      saveEditorPref("formatOnSave", next);
      return next;
    });
  }, []);
  const toggleTrimTrailingOnSave = useCallback(() => {
    setTrimTrailingOnSaveOn((on) => {
      const next = !on;
      saveEditorPref("trimTrailingOnSave", next);
      return next;
    });
  }, []);
  const toggleInsertFinalNewline = useCallback(() => {
    setInsertFinalNewlineOn((on) => {
      const next = !on;
      saveEditorPref("insertFinalNewline", next);
      return next;
    });
  }, []);
  const toggleTrimFinalNewlines = useCallback(() => {
    setTrimFinalNewlinesOn((on) => {
      const next = !on;
      saveEditorPref("trimFinalNewlines", next);
      return next;
    });
  }, []);
  const toggleMinimap = useCallback(() => {
    setMinimapOn((on) => {
      const next = !on;
      saveEditorPref("minimap", next);
      return next;
    });
  }, []);

  // Commit the ruler-columns settings input: parse + persist the draft (via
  // saveRulerColumns, which sanitizes + de-dupes + sorts and returns the stored
  // value) and reflect the normalized form back into both the live columns and
  // the input text. Called on blur / Enter, so transient half-typed values
  // ("8") never reconfigure the editor — only the committed list does.
  const commitRulerColumns = useCallback((draft: string) => {
    const normalized = saveRulerColumns(
      draft.split(/[\s,]+/).map((t) => Number.parseInt(t, 10)),
    );
    setRulerColumns(normalized);
    setRulerDraft(formatRulerColumns(normalized));
  }, []);

  // Zoom: nudge the font scale by a signed number of steps (clamped + persisted
  // by saveFontScale, which returns the value actually stored so the in-memory
  // state and localStorage stay in lockstep).
  const zoomBy = useCallback((deltaSteps: number) => {
    setFontScale((scale) =>
      saveFontScale(scale + deltaSteps * FONT_SCALE_STEP),
    );
  }, []);
  const zoomIn = useCallback(() => zoomBy(1), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-1), [zoomBy]);
  const zoomReset = useCallback(() => {
    setFontScale(saveFontScale(FONT_SCALE_DEFAULT));
  }, []);
  const previewFontScale = useCallback((nextScale: number) => {
    setFontScale(clampFontScale(nextScale));
  }, []);
  const commitFontScale = useCallback((nextScale: number) => {
    setFontScale(saveFontScale(nextScale));
  }, []);
  const previewFontZoomPercent = useCallback(
    (nextPercent: number) => previewFontScale(nextPercent / 100),
    [previewFontScale],
  );
  // Ctrl/Cmd+wheel and trackpad pinch (the browser reports a pinch as a
  // ctrl wheel) zoom the editor font on the shared editor gesture curve
  // (wheelZoomFontScale). The live gesture level stays unsnapped while the
  // wheel turns; the settled value is stored once it stops.
  const editorRootRef = useRef<HTMLDivElement>(null);
  const fontScaleRef = useRef(fontScale);
  useEffect(() => {
    fontScaleRef.current = fontScale;
  }, [fontScale]);
  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) return;
    let liveScale: number | null = null;
    let commitTimer: number | null = null;
    const commit = () => {
      commitTimer = null;
      const settled = liveScale;
      liveScale = null;
      if (settled !== null) commitFontScale(settled);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = wheelZoomFontScale(
        liveScale ?? fontScaleRef.current,
        event.deltaY,
        event.deltaMode,
      );
      liveScale = next;
      previewFontScale(next);
      if (commitTimer !== null) window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commit, WHEEL_ZOOM_SETTLE_MS);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
      if (commitTimer !== null) {
        window.clearTimeout(commitTimer);
        commit();
      }
    };
  }, [commitFontScale, previewFontScale]);
  // Two fingers (and Safari's gesture events) pinch the same font zoom
  
  // ribbon and all. The shared pinch listener gives the surface
  // `touch-action: pan-x pan-y`, so one finger still scrolls; the wheel path
  // above stays the only Ctrl/Cmd+wheel handler. The scale previews while
  // the fingers move and is stored once they lift.
  useEffect(() => {
    const root = editorRootRef.current;
    if (!root) return;
    let startScale = fontScaleRef.current;
    let liveScale: number | null = null;
    const settle = () => {
      const settled = liveScale;
      liveScale = null;
      if (settled !== null) commitFontScale(settled);
    };
    const detach = attachPinchGestures(root, {
      onStart: () => {
        startScale = liveScale ?? fontScaleRef.current;
      },
      onChange: (scale) => {
        liveScale = clampFontScale(startScale * scale);
        previewFontScale(liveScale);
      },
      onEnd: settle,
    });
    return () => {
      detach();
      settle();
    };
  }, [commitFontScale, previewFontScale]);
  const commitFontZoomPercent = useCallback(
    (nextPercent: number) => commitFontScale(nextPercent / 100),
    [commitFontScale],
  );

  const findState = useMemo(
    () => ({
      query,
      replacement,
      caseSensitive,
      wholeWord,
      useRegex,
      inSelection,
      selRange,
      preserveCase: preserveCaseOn,
    }),
    [
      query,
      replacement,
      caseSensitive,
      wholeWord,
      useRegex,
      inSelection,
      selRange,
      preserveCaseOn,
    ],
  );
  const [replacementFailure, setReplacementFailure] = useState<{
    value: string;
    state: typeof findState;
    messageKey: FindReplacementPlanMessageKey;
  } | null>(null);
  // In regex mode, surface a compile error inline instead of silently showing
  // "0/0" for an invalid pattern (mirrors the textarea editor).
  const regexError = useMemo(
    () => (useRegex ? validateRegex(query, caseSensitive) : null),
    [useRegex, query, caseSensitive],
  );
  const regexErrorTitle = regexError
    ? t(findRegexErrorMessageKey(regexError)!)
    : null;
  const replacementPlanFailed = Boolean(
    replacementFailure &&
      replacementFailure.value === value &&
      replacementFailure.state === findState,
  );
  const findErrorTitle =
    regexErrorTitle ??
    (replacementPlanFailed ? t(replacementFailure!.messageKey) : null);
  const matchPreview = useMemo(
    () => searchMatchPreview(value, findState),
    [value, findState],
  );
  const matches = matchPreview.matches;
  const matchesTruncated = matchPreview.truncated;
  const effectiveMinimapOn = minimapOn && !lightweightMode;
  const effectiveStickyScrollOn = stickyScrollOn && !lightweightMode;
  // One linear pass feeds both the status geometry and the minimap silhouette
  // only while that silhouette can actually render. Automatic large-file mode
  // avoids both the React nodes and the previous whole-source split on every
  // keystroke; the user's saved minimap preference is left untouched.
  const minimapModel = useMemo(
    () =>
      effectiveMinimapOn
        ? minimapDensity(value)
        : { lineCount: 1, marks: [] },
    [effectiveMinimapOn, value],
  );
  const lineCount = minimapModel.lineCount;
  // Go-to-Line asks the DOCUMENT how many lines it has, not the minimap. The
  // two agree only while the silhouette renders: `minimapModel` collapses to
  // `lineCount: 1` whenever it is off — by the user's preference, or
  // automatically on a large file — and a large file is exactly when Go-to-Line
  // is worth having, so a 30,000-line document was offering "Go to line (1-1)"
  // in the placeholder and reading that out to a screen reader. The view's own
  // document knows the answer in constant time and is the authority; the count
  // is only walked before a view exists, which is before this input can be
  // opened.
  const documentLineCount =
    viewRef.current?.state.doc.lines ?? countDocumentLines(value);
  const gotoInputMaxLength = Math.max(1, String(documentLineCount).length);

  const caret = viewRef.current?.state.selection.main.head ?? 0;
  const matchCount = matchCountLabel(matches, caret, matchesTruncated);
  const countLabel = matchCount.label;

  // Return focus to the EDITING SURFACE. `view.focus()` focuses `view.contentDOM`
  // (the contenteditable `.cm-content` node) — the documented, real focus target.
  // Every panel-close path routes through here so Esc / the close button always
  // lands keyboard focus back on the editor, never on `document.body` (nowhere).
  const focusView = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    // Prefer the explicit contentDOM focus so the focus target is unambiguous
    // even if a future CM upgrade changes what `view.focus()` targets.
    view.contentDOM.focus();
  }, []);
  const closeOutline = useCallback(() => {
    setOutlineOpen(false);
    focusView();
  }, [focusView]);
  const closeMarkdownPreview = useCallback(() => {
    setMarkdownPreviewOwner(null);
    setMarkdownFullPreviewSource(null);
    focusView();
  }, [focusView]);
  const toggleMarkdownPreview = useCallback(() => {
    setMarkdownFullPreviewSource(null);
    setMarkdownPreviewOwner((current) =>
      current === markdownPreviewScope ? null : markdownPreviewScope,
    );
  }, [markdownPreviewScope]);

  // Push the find-bar query into CM6's search state so the VISUAL match
  // highlighting (`@codemirror/search`) tracks the bar. Navigation/replace are
  // driven from the shared find-replace engine (see goToMatch/doReplace), so the
  // highlight is presentation-only and the count/step/replace can never diverge.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const visualFindState = findOpen
      ? findState
      : { ...findState, query: "" };
    view.dispatch({
      effects: setSearchQuery.of(
        buildSearchQuery(
          visualFindState,
          findOpen && matchesTruncated,
        ),
      ),
    });
  }, [findState, findOpen, matchesTruncated]);

  // When the query/flags change, jump the active match to the one nearest the
  // caret so the first next/prev press lands there (mirrors the textarea editor).
  useEffect(() => {
    if (!findOpen || matches.length === 0) {
      if (activeMatch !== 0) setActiveMatch(0);
      return;
    }
    const head = viewRef.current?.state.selection.main.head ?? 0;
    const idx = matches.findIndex((m) => m.start >= head);
    setActiveMatch(idx === -1 ? 0 : idx);
    // Intentionally keyed on the query/flags (not `matches` identity) so typing
    // in the editor doesn't keep yanking the active match back to the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, wholeWord, useRegex, inSelection, findOpen]);

  // --- Accessibility: derive + announce the editor's dynamic state ----------
  // The string a screen reader should hear RIGHT NOW, derived from the live
  // editor state. Priority is the most recently-actionable surface: an open find
  // bar with a query ("5 of 7") > an open references/symbols panel (their count)
  // > the standing lint-diagnostic count ("3 problems"). Empty string = nothing
  // to announce (e.g. find open but no query yet). A plain computed value (not
  // memoized): it reads `matchCount`, which is re-derived every render anyway, and
  // the debounce + dedupe effect below — not memoization — is what stops the live
  // region from re-announcing. The debounce decides WHEN/whether to push it.
  let announceCandidate = "";
  if (findOpen && query) {
    // matchCount.total is the actual number of matches; .current is the 1-based
    // active index. "5 of 7" mirrors exactly the visible "5/7" count label.
    announceCandidate = t("code.a11y.findCount", {
      current: matchCount.current,
      total: matchesTruncated ? `${matchCount.total}+` : matchCount.total,
    });
  } else if (refsOpen) {
    announceCandidate = t("code.a11y.referenceCount", {
      count: refList.length,
    });
  } else if (symbolsOpen) {
    announceCandidate = t("code.a11y.symbolCount", {
      count: symbolList.length,
    });
  } else if (diagnosticCount > 0) {
    announceCandidate = t("code.a11y.problemCount", { count: diagnosticCount });
  }

  // Debounced, DEDUPED push of the candidate into the live region. A polite
  // aria-live region re-reads its content on ANY mutation, so we (1) drop a
  // candidate identical to what we last announced (lastAnnouncedRef) and
  // (2) coalesce rapid changes (typing in find, fast re-lints) behind a short
  // timer so the SR hears the SETTLED value, not every intermediate keystroke.
  // Net effect: an announcement fires on CHANGE, never on every render.
  useEffect(() => {
    if (announceCandidate === lastAnnouncedRef.current) return;
    const id = window.setTimeout(() => {
      // Re-check at fire time: a candidate that bounced back to the last value
      // during the debounce window must not re-announce.
      if (announceCandidate === lastAnnouncedRef.current) return;
      lastAnnouncedRef.current = announceCandidate;
      setAnnouncement(announceCandidate);
    }, 150);
    return () => window.clearTimeout(id);
  }, [announceCandidate]);

  // NOTE: we intentionally do NOT markDirty() the LanguageService on every
  // `[value]` change. The service host reads the live buffer via
  // `getText` -> `intelTextRef.current`, which is refreshed on every render
  // (see `intelTextRef.current = value` above), and every code-intel entry
  // point (hover, go-to-definition, rename) already calls `svc.markDirty()`
  // immediately after acquiring the service — so it always sees the freshest
  // text at the moment it runs. A per-keystroke markDirty was therefore
  // redundant churn (it invalidated the program version on every character
  // even though nothing read it until the next intel request).

  // Close the rename prompt whenever the buffer changes. `renamePos` was pinned
  // when the prompt opened; once the document is edited that offset may point at
  // a different symbol, so applying the rename would run findRenameLocations at a
  // STALE position. Dismissing forces the rename to be re-initiated against the
  // fresh buffer. (Mirrors the find-bar sync effect above.)
  // These five effects reset transient, offset-pinned UI whenever the buffer
  // changes. They run on EVERY keystroke, so each one asks whether there is
  // anything to reset before touching state: setting a closed panel closed still
  // ENQUEUES an update (React only bails while rendering), and thirteen of those
  // per keystroke are what tipped sustained typing into "Maximum update depth
  // exceeded". Reading the current values from the effect's own closure is
  // deliberate — the deps stay on source/language/page identity so the reset
  // happens exactly once per owner change, never in response to the panels'
  // own state changes.
  useEffect(() => {
    if (!renameOpen && renamePos === 0 && renameError === null) return;
    setRenameOpen(false);
    setRenamePos(0);
    setRenameError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value, viewStateKey]);

  // Close the references panel whenever the buffer changes. The listed spans are
  // 0-based offsets into the buffer AS IT WAS when the panel opened; once the
  // document is edited, clicking an entry would jump to a now-shifted range. So
  // we dismiss the panel (and clear the list) on any edit, forcing a fresh
  // Shift+F12 against the updated buffer. (Mirrors the rename-close effect above;
  // the panel holds no persisted state, so this fully resets it.)
  useEffect(() => {
    if (
      !refsOpen &&
      refList.length === 0 &&
      refActiveIndex === -1 &&
      !peekOpenRef.current &&
      !referenceResultBusyRef.current
    ) {
      return;
    }
    referenceResultRequestIdRef.current += 1;
    referenceResultBusyRef.current = false;
    setReferenceResultBusy(false);
    setRefsOpen(false);
    setRefList([]);
    setRefActiveIndex(-1);
    // The inline peek's listed lines/offsets are likewise stale after an edit; the
    // peek StateField clears the WIDGET on any docChanged, so here we only reset
    // the open flag (the editor keymap reads it to route Escape) to stay in sync.
    peekOpenRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value, viewStateKey]);

  // Close the Go-to-Symbol picker whenever the buffer changes. Its listed spans
  // are 0-based offsets into the buffer AS IT WAS when the picker opened; once the
  // document is edited those offsets are stale and a jump would land at the wrong
  // place. So we dismiss it (and clear the list) on any edit, forcing a fresh
  // Ctrl+Shift+O against the updated buffer. (Mirrors the references-close effect
  // above; the picker holds no persisted state, so this fully resets it.)
  useEffect(() => {
    if (!symbolsOpen && symbolList.length === 0 && symbolActiveIndex === -1) {
      return;
    }
    setSymbolsOpen(false);
    setSymbolList([]);
    setSymbolActiveIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value, viewStateKey]);

  // Close the Quick Fix menu whenever the text, language, or page owner changes. Each
  // action's edits are offsets into one buffer generation and parser; once
  // either changes (including by APPLYING a fix), the action is stale. Force a
  // fresh Ctrl+. against the updated buffer/language instead.
  useEffect(() => {
    if (!fixesOpen && fixList.length === 0) return;
    fixMutationClaimRef.current = null;
    setFixesOpen(false);
    setFixList([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value, viewStateKey]);

  // Clear find-in-selection whenever the buffer owner changes. `selRange` pins
  // absolute offsets of the selection AS IT WAS when ⊂ was toggled on; once the
  // document is edited, changes language, or moves to another page, those offsets
  // are stale, and a subsequent replace-all could target a range the user never
  // selected in that owner. Clearing it visibly forces a fresh selection.
  // A replace computes its matches from the range BEFORE its own edit lands, so
  // this only fires after that op completes. (Mirrors the stale-offset resets
  // above.)
  useEffect(() => {
    if (!inSelection && selRange === null) return;
    setInSelection(false);
    setSelRange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, value, viewStateKey]);

  // Notices describe the command and service owner that produced them. A new
  // page or language context must not inherit a departed owner's failure text,
  // even when both buffers happen to contain identical bytes.
  useEffect(() => {
    if (!intelNotice) return;
    setIntelNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, pythonNamespace, readOnly, value, viewStateKey]);

  // Auto-dismiss the transient code-intelligence notice.
  useEffect(() => {
    if (!intelNotice) return;
    const id = window.setTimeout(() => setIntelNotice(null), 2400);
    return () => window.clearTimeout(id);
  }, [intelNotice]);

  // Close the settings menu on an outside click or Escape, like a native
  // popover. Only wired while the menu is open (no listeners on the idle path).
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      const insideZoomPopover = target?.closest?.(
        '[data-testid="code-settings-zoom-popover"]',
      );
      if (settingsRef.current?.contains(target as Node) || insideZoomPopover) {
        return;
      }
      closeSettingsMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as Element | null;
      if (target?.closest?.('[data-testid="code-settings-zoom-popover"]')) {
        return;
      }
      event.preventDefault();
      closeSettingsMenu(true);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSettingsMenu, settingsOpen]);

  // The lightweight-mode explainer is an anchored, non-modal popover: it never
  // changes editor geometry, closes on outside click / Escape, and disappears
  // automatically when the source returns to the full workload profile.
  useEffect(() => {
    if (!lightweightMode) {
      if (performanceInfoOpen) setPerformanceInfoOpen(false);
      return;
    }
    if (!performanceInfoOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !performanceInfoRef.current?.contains(target) &&
        !performanceInfoButtonRef.current?.contains(target)
      ) {
        setPerformanceInfoOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPerformanceInfoOpen(false);
        performanceInfoButtonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightweightMode, performanceInfoOpen]);

  const openFind = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      const selected = view.state.sliceDoc(sel.from, sel.to);
      if (selected && !selected.includes("\n")) {
        setQuery(boundFindQuery(selected));
      }
    }
    setFindOpen(true);
    requestAnimationFrame(() => focusPromptInput(findInputRef.current));
  }, []);
  useLayoutEffect(() => {
    if (findOpen) focusPromptInput(findInputRef.current);
  }, [findOpen]);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    focusView();
  }, [focusView]);

  // Step next/prev through matches, driven by the SHARED find engine so regex,
  // whole-word, and find-in-selection behave exactly like the textarea editor.
  // Matches are recomputed from the LIVE doc (not the React `value` mirror, which
  // can lag a tick after an edit) so the selected range is always in-bounds.
  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      const view = viewRef.current;
      if (!view) return;
      const ms = findMatches(
        view.state.doc.toString(),
        findState.query,
        findOptions(findState),
        MAX_EDITOR_FIND_MATCHES,
      );
      if (ms.length === 0) return;
      const sel = view.state.selection.main;
      const clamped = Math.min(activeMatch, ms.length - 1);
      const cur = ms[clamped];
      // First press lands on the nearest match; once it's the live selection,
      // subsequent presses step to the next/previous one (with wrap-around).
      const onActive = !!cur && sel.from === cur.start && sel.to === cur.end;
      const idx = onActive ? stepMatch(ms.length, clamped, direction) : clamped;
      setActiveMatch(idx);
      const target = ms[idx];
      view.dispatch({
        selection: EditorSelection.single(target.start, target.end),
        effects: EditorView.scrollIntoView(target.start, { y: "center" }),
        scrollIntoView: true,
      });
      setScrollTick((t) => t + 1);
    },
    [activeMatch, findState],
  );

  const doReplace = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    const ms = findMatches(
      docText,
      findState.query,
      findOptions(findState),
      MAX_EDITOR_FIND_MATCHES,
    );
    if (ms.length === 0) return;
    const idx = Math.min(activeMatch, ms.length - 1);
    const m = ms[idx];
    // Expand $1/$&/$<name> (regex) then preserve case when the Aa/AB toggle is on.
    const matched = docText.slice(m.start, m.end);
    const rep = computeReplacement(
      replacement,
      m,
      matched,
      findState.preserveCase,
    );
    if (
      docText.length - (m.end - m.start) + rep.length >
      MAX_FIND_REPLACEMENT_RESULT_CHARS
    ) {
      setReplacementFailure({
        value: docText,
        state: findState,
        messageKey: "code.find.replacementTooLarge",
      });
      return;
    }
    setReplacementFailure(null);
    view.dispatch({
      changes: { from: m.start, to: m.end, insert: rep },
      selection: EditorSelection.cursor(m.start + rep.length),
      scrollIntoView: true,
    });
    setScrollTick((t) => t + 1);
  }, [activeMatch, findState, replacement]);

  const doReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    const ms = findMatches(
      docText,
      findState.query,
      findOptions(findState),
      MAX_FIND_REPLACEMENT_MATCHES + 1,
    );
    if (ms.length === 0) return;
    if (ms.length > MAX_FIND_REPLACEMENT_MATCHES) {
      setReplacementFailure({
        value: docText,
        state: findState,
        messageKey: "code.find.tooManyReplacements",
      });
      return;
    }
    // matches are sorted + non-overlapping, so they form a valid CM6 ChangeSet —
    // one atomic transaction (one undo step) rewrites them all. Each replacement
    // is expanded + (optionally) case-preserved against its OWN matched slice.
    let projectedLength = docText.length;
    const changes: Array<{ from: number; to: number; insert: string }> = [];
    for (const m of ms) {
      const insert = computeReplacement(
        replacement,
        m,
        docText.slice(m.start, m.end),
        findState.preserveCase,
      );
      projectedLength += insert.length - (m.end - m.start);
      if (projectedLength > MAX_FIND_REPLACEMENT_RESULT_CHARS) {
        setReplacementFailure({
          value: docText,
          state: findState,
          messageKey: "code.find.replacementTooLarge",
        });
        return;
      }
      changes.push({ from: m.start, to: m.end, insert });
    }
    setReplacementFailure(null);
    view.dispatch({ changes });
    setScrollTick((t) => t + 1);
  }, [findState, replacement]);

  // Toggle find-in-selection: pin the current non-empty selection as the search
  // scope when turning on; clear it when turning off (or if nothing is selected).
  const toggleInSelection = useCallback(() => {
    const view = viewRef.current;
    setInSelection((on) => {
      if (on) return false;
      const sel = view?.state.selection.main;
      if (sel && sel.to > sel.from) {
        setSelRange({ start: sel.from, end: sel.to });
        return true;
      }
      return false; // no selection — nothing to scope to
    });
  }, []);

  // --- Cursor navigation history (VSCode Go Back / Go Forward) --------------
  // Record a non-incremental caret JUMP into the navigation history: the origin
  // is the live main selection (where the caret WAS), the destination is the
  // span the jump is about to select. Called by every navigation entry point
  // (go-to-def / type-def / impl / symbol pick / reference jump / Go-to-Line)
  // just before its dispatch, so Back returns to the pre-jump spot. A jump fired
  // BY a Back/Forward restore is suppressed (navRestoringRef) so the trail isn't
  // corrupted by its own programmatic move. Declared HERE (above the first
  // caller, runGoto) so the useCallback deps that list it aren't in its TDZ.
  const recordNavJump = useCallback(
    (toAnchor: number, toHead: number) => {
      if (navRestoringRef.current) return;
      const view = viewRef.current;
      if (!view) return;
      const main = view.state.selection.main;
      const history = recordNavigation(
        navHistoryRef.current,
        { anchor: main.anchor, head: main.head },
        { anchor: toAnchor, head: toHead },
      );
      navHistoryRef.current = history;
      publishNavigationAvailability(history);
    },
    [publishNavigationAvailability],
  );

  // Restore a recorded position (Back or Forward). Clamps the stored offsets into
  // the LIVE document (a buffer edit between record and restore can shift them)
  // and scrolls it into view, mirroring how the jump handlers dispatch. Wrapped
  // in navRestoringRef so the move isn't re-recorded as a fresh jump. No-ops when
  // the stack can't move in the requested direction.
  const navigateHistory = useCallback(
    (direction: "back" | "forward"): boolean => {
      const view = viewRef.current;
      if (!view) return false;
      const step =
        direction === "back"
          ? navGoBack(navHistoryRef.current)
          : navGoForward(navHistoryRef.current);
      if (!step) return false;
      navHistoryRef.current = step.history;
      publishNavigationAvailability(step.history);
      const docLen = view.state.doc.length;
      const anchor = Math.min(Math.max(step.position.anchor, 0), docLen);
      const head = Math.min(Math.max(step.position.head, 0), docLen);
      navRestoringRef.current = true;
      try {
        view.dispatch({
          selection: EditorSelection.range(anchor, head),
          effects: EditorView.scrollIntoView(head, { y: "center" }),
          scrollIntoView: true,
        });
      } finally {
        navRestoringRef.current = false;
      }
      view.focus();
      return true;
    },
    [publishNavigationAvailability],
  );

  const goBackNav = useCallback(
    () => navigateHistory("back"),
    [navigateHistory],
  );
  const goForwardNav = useCallback(
    () => navigateHistory("forward"),
    [navigateHistory],
  );

  const openGoto = useCallback(() => {
    setGotoOpen(true);
    requestAnimationFrame(() => focusPromptInput(gotoInputRef.current));
  }, []);
  useLayoutEffect(() => {
    if (gotoOpen) focusPromptInput(gotoInputRef.current);
  }, [gotoOpen]);

  const runGoto = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const n = Number.parseInt(gotoValue, 10);
    if (!Number.isFinite(n)) return;
    const { from, to } = lineToOffsetRange(view.state.doc.toString(), n);
    recordNavJump(from, to); // navigation history: record the Go-to-Line jump
    view.dispatch({
      selection: EditorSelection.range(from, to),
      effects: [
        EditorView.scrollIntoView(from, { y: "center" }),
        flashLocatedLineEffect.of(from),
      ],
      scrollIntoView: true,
    });
    setGotoOpen(false);
    focusView();
  }, [gotoValue, focusView, recordNavJump]);

  // --- Code intelligence (hover / go-to-definition / rename) ----------------
  // These all share one lazily-built single-buffer LanguageService. They are
  // best-effort: the heavy TS compiler is dynamically imported on first use and
  // any failure leaves the editor intact while the invoked command reports the
  // existing capability-unavailable feedback. The live behaviour
  // (tooltip rendering, cursor jump, inline rename) is browser-gated; the PURE
  // mapping logic lives in lib/code-runner/code-intelligence.ts and is unit
  // tested against the real compiler.

  // Resolve (building if needed) the service for the current language. Rebuilds
  // when the language changes so the ScriptKind stays correct.
  const getTsService =
    useCallback(async (): Promise<TsIntelligenceService | null> => {
      if (!intelligenceLanguage(language)) {
        tsServiceRef.current = null;
        tsServiceLangRef.current = null;
        return null;
      }
      if (tsServiceRef.current && tsServiceLangRef.current === language) {
        return tsServiceRef.current;
      }
      try {
        const mod = await import("typescript");
        const ts =
          (mod as { default?: typeof import("typescript") }).default ?? mod;
        await localizeTypeScript(ts);
        // The buffer as the editor holds it: every position asked about is a
        // position in this document, and the host's `value` echo can be a
        // keystroke behind (a hint asked for after "add(1" read "add(").
        const svc = createTsService(
          ts,
          () => viewRef.current?.state.doc.toString() ?? intelTextRef.current,
          language,
        );
        tsServiceRef.current = svc;
        tsServiceLangRef.current = language;
        return svc;
      } catch {
        tsServiceRef.current = null;
        tsServiceLangRef.current = null;
        return null;
      }
    }, [language]);

  // Whether this editor is a Python buffer wired to a live kernel namespace —
  // the gate (alongside hasPythonKernel) for the jedi go-to-def / rename paths,
  // mirroring the hover/signature Python branches.
  const isPythonEditor = useMemo(() => {
    const lang = (language || "").trim().toLowerCase();
    return Boolean(pythonNamespace) && (lang === "python" || lang === "py");
  }, [language, pythonNamespace]);

  // Every "can this language answer questions about itself" decision below asks
  // this, instead of naming TypeScript and Python. Registering a provider is
  // therefore all it takes to add a language: see `language-services.ts`.
  const languageServices = useMemo(
    () => createEditorLanguageServices({ pythonNamespace }),
    [pythonNamespace],
  );

  // The affordance gate: whether ANYONE can serve this exact buffer now.
  // Python is intentionally live-kernel gated: opening a page must never boot
  // Pyodide merely because a ribbon or palette asks what is available.
  // What the EDITOR can do for this language, per capability.
  //
  // Per capability rather than per language, because providers are no longer
  // all-or-nothing: the outline fallback navigates a Go file and cannot rename
  // anything in it, and one blanket gate would put a rename prompt in front of
  // a user nothing can serve — the "menu item that does nothing" this surface
  // has already had to fix twice.
  //
  // The registry alone is NOT the answer, because the two built-in providers
  // deliberately under-declare: TypeScript's rename runs on the editor's own
  // path (reserved words, cross-cell hosts), so its provider does not offer
  // one. Asking only the registry would have switched F2 off for TypeScript.
  // This is a pure query on every render rather than a memo. A Python kernel is
  // commonly created after provider priming completed, so there is no registry
  // version bump to invalidate a memo at that moment. CodeWindow supplies the
  // exact namespace authority; other hosts can rely on the provider's live
  // capability query after their normal rerender.
  const providerCapabilities = languageServices.capabilitiesFor(language);
  const tsBespoke = Boolean(intelligenceLanguage(language));
  const pythonRuntimeCan =
    isPythonEditor &&
    (pythonKernelAvailable ?? Boolean(providerCapabilities.definition));
  const languageCan = {
    definition:
      tsBespoke ||
      pythonRuntimeCan ||
      Boolean(providerCapabilities.definition) ||
      Boolean(crossFileGoToDefinition),
    rename:
      tsBespoke ||
      pythonRuntimeCan ||
      Boolean(providerCapabilities.rename) ||
      Boolean(crossFileRename),
    signatureHelp:
      tsBespoke ||
      pythonRuntimeCan ||
      Boolean(providerCapabilities.signatureHelp),
    references:
      tsBespoke ||
      pythonRuntimeCan ||
      Boolean(providerCapabilities.references) ||
      Boolean(crossFileReferences),
    codeActions:
      tsBespoke ||
      Boolean(providerCapabilities.codeActions) ||
      Boolean(crossFileCodeFixes),
  };

  // Some providers have to load something before they can say what they can do.
  // That load belongs in an EFFECT: `capabilitiesFor` is read while rendering,
  // so it has to stay a pure query, and a query that starts an import is a side
  // effect in render.
  //
  // The counter re-renders ONLY when loading actually changed the answer. An
  // unconditional bump costs every editor an extra render right after mount,
  // which rebuilds the gutters — and a re-render nobody needed is exactly the
  // kind of thing that makes a marker the user was about to click disappear
  // from under them.
  const [languageServicesPrimed, setLanguageServicesPrimed] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const before = JSON.stringify(languageServices.capabilitiesFor(language));
    void languageServices.prime().then(() => {
      if (cancelled) return;
      const after = JSON.stringify(languageServices.capabilitiesFor(language));
      if (after !== before) setLanguageServicesPrimed((primed) => primed + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [languageServices, language]);

  /**
   * Ask the registry for a language the editor has no bespoke path for.
   *
   * TypeScript and Python are answered by the branches that precede each call
   * site, using engines that deliver more than the interface carries (sanitized
   * quick-info HTML, cross-cell resolution). Everything else arrives here, which
   * is why a registered provider lights the surface up without this file
   * changing again.
   */
  const askProvider = useCallback(
    async <T,>(
      capability:
        | "hover"
        | "definition"
        | "references"
        | "rename"
        | "signatureHelp"
        | "typeDefinition"
        | "implementation"
        | "codeActions",
      run: (provider: LanguageServiceProvider) => Promise<T>,
    ): Promise<T | null> => {
      const provider = languageServices.providerFor(language, capability);
      if (!provider) return null;
      try {
        return await run(provider);
      } catch {
        // A contributed provider that throws must not take the editor with it.
        return null;
      }
    },
    [languageServices, language],
  );

  /**
   * A registered provider's diagnostics for this language, or undefined.
   *
   * Undefined is what keeps every language that exists today byte-for-byte:
   * `lintExtensions` only consults this when it is supplied, and it is supplied
   * only when some provider actually claims the capability.
   */
  const providerDiagnostics = useMemo(() => {
    const provider = languageServices.providerFor(language, "diagnostics");
    if (!provider?.diagnostics) return undefined;
    return async (text: string) =>
      provider.diagnostics!({ text, language }).then((reported) =>
        reported.map((diagnostic) => ({
          from: diagnostic.span.from,
          to: diagnostic.span.to,
          message:
            diagnostic.code?.endsWith(".fileLevel")
              ? `${SHELL_FILE_LEVEL_DIAGNOSTIC_MARKER}${diagnostic.message}`
              : diagnostic.message,
          severity: diagnostic.severity,
        })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `languageServicesPrimed` is what makes this re-read once a provider finishes loading.
  }, [languageServices, language, languageServicesPrimed]);

  /**
   * A registered provider's formatter for this language, or undefined.
   *
   * Formatting was the last thing still hardcoded by language: a provider could
   * bring completions, navigation, rename and diagnostics to a new language and
   * still leave Shift+Alt+F disabled, which made "adding a language is
   * registering a provider" not quite true.
   */
  const providerFormat = useMemo(() => {
    const provider = languageServices.providerFor(language, "formatting");
    if (!provider?.formatting) return undefined;
    return async (text: string, signal?: AbortSignal) =>
      provider.formatting!({ text, language, signal });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see providerDiagnostics.
  }, [languageServices, language, languageServicesPrimed]);

  /**
   * Jump to a single location a provider reported, or show the "not found"
   * notice. The two type-aware navigations differ only in which question they
   * ask, so they share the answer handling.
   */
  const jumpToProviderLocation = useCallback(
    async (
      capability: "definition" | "typeDefinition" | "implementation",
      pos: number,
      claim: EditorMutationClaim,
    ): Promise<void> => {
      const currentView = (): EditorView | null => {
        const live = viewRef.current;
        return live &&
          editorMutationClaimIsCurrent(
            claim,
            live,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          )
          ? live
          : null;
      };
      if (!currentView()) return;

      let location: ProviderLocation | null;
      let provider: LanguageServiceProvider | null = null;
      try {
        const candidate = languageServices.providerFor(
          claim.language,
          capability,
        );
        const navigate = candidate?.[capability];
        if (!candidate || !navigate) {
          if (currentView()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        provider = candidate;
        location = await navigate.call(candidate, {
          text: claim.view.state.doc.toString(),
          offset: pos,
          language: claim.language,
        });
      } catch {
        if (currentView()) {
          setIntelNotice(t("document.capability.unavailable"));
        }
        return;
      }
      const live = currentView();
      if (!live) return;
      try {
        if (
          languageServices.providerFor(claim.language, capability) !== provider
        ) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
      } catch {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      // A location in another buffer is real for a cross-file server, but this
      // command navigates THIS document; the notice is the honest answer.
      if (!location || location.bufferId !== null) {
        setIntelNotice(t("code.gotoDefinition.notFound"));
        return;
      }
      const end = live.state.doc.length;
      const from = Math.min(Math.max(location.from, 0), end);
      const to = Math.min(Math.max(location.to, from), end);
      recordNavJump(from, to);
      live.dispatch({
        selection: EditorSelection.range(from, to),
        effects: [
          EditorView.scrollIntoView(from, { y: "center" }),
          flashLocatedLineEffect.of(from),
        ],
        scrollIntoView: true,
      });
      live.focus();
    },
    [languageServices, t, recordNavJump],
  );

  // Hover quick-info tooltip. TS-family languages use the single-buffer
  // LanguageService (sanitized via quickInfoToHtml — no raw HTML injection);
  // Python asks the LIVE kernel via jedi (worker `hover` op) once a kernel
  // exists, mirroring the semantic completion gating. Resolves to null when
  // there's nothing to show.
  // Show Hover (VS Code editor.action.showHover, Ctrl/Cmd+K Ctrl/Cmd+I): the
  // hover cards at the caret — quick info and lint messages alike — for a
  
  const showHoverAtCaret = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    showHoverAt(view);
    view.focus();
  }, []);
  const showHoverExtension = useMemo<Extension>(() => showHoverSupport(), []);

  const hoverExtension = useMemo<Extension>(
    () =>
      hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
        const lang = (language || "").trim().toLowerCase();
        if (pythonNamespace && (lang === "python" || lang === "py")) {
          const { hasPythonKernel, hoverPython } =
            await import("@mrnote/core/web/lib/code-runner/python-runner.ts");
          // Same rule as completions: never boot Pyodide as a hover side effect.
          if (!hasPythonKernel(pythonNamespace)) return null;
          const docText = view.state.doc.toString();
          const line = view.state.doc.lineAt(pos);
          const info = await hoverPython(
            docText,
            line.number,
            pos - line.from,
            {
              namespace: pythonNamespace,
            },
          );
          if (!info || (!info.signature && !info.doc)) {
            // The symbol may be declared in ANOTHER cell — ask the cross-cell
            // resolver (a Python multi-buffer host concatenates the cells for jedi).
            if (crossFileQuickInfoRef.current) {
              const cross = await crossFileQuickInfoRef.current(pos);
              if (cross && (cross.signature || cross.documentation)) {
                return {
                  pos,
                  above: true,
                  create: () => {
                    const dom = document.createElement("div");
                    dom.className = "cm-mrnote-quickinfo";
                    dom.style.cssText =
                      "padding:6px 8px;max-width:480px;max-height:320px;overflow:auto;font-family:var(--font-jetbrains,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.4;white-space:pre-wrap;";
                    if (cross.signature) {
                      const sig = document.createElement("div");
                      sig.style.cssText = "font-weight:600;";
                      sig.textContent = cross.signature;
                      dom.appendChild(sig);
                    }
                    if (cross.documentation) {
                      const docEl = document.createElement("div");
                      docEl.style.cssText = "margin-top:4px;opacity:0.85;";
                      docEl.textContent = cross.documentation;
                      dom.appendChild(docEl);
                    }
                    return { dom };
                  },
                };
              }
            }
            return null;
          }
          return {
            pos,
            above: true,
            create: () => {
              const dom = document.createElement("div");
              dom.className = "cm-mrnote-quickinfo";
              dom.style.cssText =
                "padding:6px 8px;max-width:480px;max-height:320px;overflow:auto;font-family:var(--font-jetbrains,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.4;white-space:pre-wrap;";
              if (info.signature) {
                const sig = document.createElement("div");
                sig.style.cssText = "font-weight:600;";
                // textContent: jedi output renders as plain text, never markup.
                sig.textContent = info.signature;
                dom.appendChild(sig);
              }
              if (info.doc) {
                const docEl = document.createElement("div");
                docEl.style.cssText = "margin-top:4px;opacity:0.85;";
                docEl.textContent = info.doc;
                dom.appendChild(docEl);
              }
              return { dom };
            },
          };
        }
        if (!intelligenceLanguage(language)) {
          // Any other language is served only by a registered provider. Its
          // contents are PLAIN TEXT by contract, so they go in as textContent —
          // the escaping question never arises.
          const hover = await askProvider("hover", (provider) =>
            provider.hover!({
              text: view.state.doc.toString(),
              offset: pos,
              language,
            }),
          );
          if (!hover?.contents) return null;
          const { contents } = hover;
          return {
            pos,
            above: true,
            create: () => {
              const dom = document.createElement("div");
              dom.className = "cm-mrnote-quickinfo";
              dom.style.cssText =
                "padding:6px 8px;max-width:480px;max-height:320px;overflow:auto;font-family:var(--font-jetbrains,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.4;white-space:pre-wrap;";
              dom.textContent = contents;
              return { dom };
            },
          };
        }
        const svc = await getTsService();
        if (!svc) return null;
        svc.markDirty();
        const info = quickInfoAt(svc, pos);
        const html = quickInfoToHtml(info);
        if (!html.hasContent || info?.kind === "alias") {
          // Nothing in THIS buffer, or TypeScript only knows this as an
          // unresolved import alias (`import add`). Ask the bounded project
          // service for the dependency's real signature + docs. Local symbols
          // stay on the cheap single-buffer path, so ordinary hover never pays
          // for a workspace compile.
          if (crossFileQuickInfoRef.current) {
            const cross = await crossFileQuickInfoRef.current(pos);
            if (cross && (cross.signature || cross.documentation)) {
              return {
                pos,
                above: true,
                create: () => {
                  const dom = document.createElement("div");
                  dom.className = "cm-mrnote-quickinfo";
                  dom.style.cssText =
                    "padding:6px 8px;max-width:480px;max-height:320px;overflow:auto;font-family:var(--font-jetbrains,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.4;white-space:pre-wrap;";
                  if (cross.signature) {
                    const sig = document.createElement("div");
                    sig.style.cssText = "font-weight:600;";
                    sig.textContent = cross.signature;
                    dom.appendChild(sig);
                  }
                  if (cross.documentation) {
                    const docEl = document.createElement("div");
                    docEl.style.cssText = "margin-top:4px;opacity:0.85;";
                    docEl.textContent = cross.documentation;
                    dom.appendChild(docEl);
                  }
                  return { dom };
                },
              };
            }
          }
          // A standalone/guest editor may have no project host, and an
          // external package may not exist in MRNote's authorized notebook
          // corpus. Preserve TypeScript's local alias tooltip in that case;
          // only a true local miss should remain empty.
          if (!html.hasContent) return null;
        }
        return {
          pos,
          above: true,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "cm-mrnote-quickinfo";
            dom.style.cssText =
              "padding:6px 8px;max-width:480px;font-family:var(--font-jetbrains,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.4;white-space:pre-wrap;";
            if (html.signature) {
              const sig = document.createElement("div");
              sig.style.cssText = "font-weight:600;";
              // Content was HTML-escaped by quickInfoToHtml; assigning via
              // innerHTML only re-materializes the escaped entities as text.
              sig.innerHTML = html.signature;
              dom.appendChild(sig);
            }
            if (html.documentation) {
              const doc = document.createElement("div");
              doc.style.cssText = "margin-top:4px;opacity:0.85;";
              doc.innerHTML = html.documentation;
              dom.appendChild(doc);
            }
            return { dom };
          },
        };
      }),
    [language, getTsService, pythonNamespace, askProvider],
  );

  // Go-to-definition (F12 / Cmd-click): jump the selection to the same-file
  // declaration of the symbol under the caret. TS/JS use the single-buffer
  // LanguageService; Python asks the LIVE kernel via jedi (worker `definition`
  // op) once a kernel exists. Cross-file defs are N/A for a single buffer; an
  // out-of-file (or unresolved) definition surfaces a notice instead.
  const goToDefinition = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      if (!languageCan.definition) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const claim = captureEditorMutationClaim(
        view,
        language,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      );
      if (isPythonEditor) {
        // Cross-cell first: a host (a Python multi-buffer host) can resolve the symbol
        // through the whole notebook's shared scope and jump to another cell —
        // something this single buffer can't. If it handled the jump we're done.
        if (crossFileGoToDefinitionRef.current) {
          let handled: boolean;
          try {
            handled = await crossFileGoToDefinitionRef.current(pos);
          } catch {
            if (
              editorMutationClaimIsCurrent(
                claim,
                viewRef.current,
                languageRef.current,
                documentGenerationRef.current,
                editorInteractionGenerationRef.current,
              )
            ) {
              setIntelNotice(t("document.capability.unavailable"));
            }
            return;
          }
          if (handled) return;
          if (
            !editorMutationClaimIsCurrent(
              claim,
              viewRef.current,
              languageRef.current,
              documentGenerationRef.current,
              editorInteractionGenerationRef.current,
            )
          ) {
            return;
          }
        }
        // The Python provider, not jedi directly. It converts the caret to
        // jedi's CODE-POINT column (this path used to send a UTF-16 one, which
        // asks about the character next door whenever an astral char sits
        // earlier on the line), and it extends the answer to the end of the
        // identifier so the jump SELECTS the name — what the TypeScript path
        // has always done.
        //
        // The provider query is pure and never boots Pyodide. The shared jump
        // helper preserves the invocation claim across the worker round-trip
        // and distinguishes an unavailable live service from a semantic miss.
        await jumpToProviderLocation("definition", pos, claim);
        return;
      }
      if (!intelligenceLanguage(language)) {
        await jumpToProviderLocation("definition", pos, claim);
        return;
      }
      // Cross-file (cross-cell) go-to-definition first: when a host supplies it
      // (a JS/TS multi-buffer host), it can navigate to ANOTHER file/cell where the symbol
      // is declared — something the single buffer below can never resolve. If it
      // handled the jump we're done; otherwise fall through to in-buffer.
      if (crossFileGoToDefinitionRef.current) {
        let handled: boolean;
        try {
          handled = await crossFileGoToDefinitionRef.current(pos);
        } catch {
          const liveAfterFailure = viewRef.current;
          if (
            liveAfterFailure &&
            editorMutationClaimIsCurrent(
              claim,
              liveAfterFailure,
              languageRef.current,
              documentGenerationRef.current,
              editorInteractionGenerationRef.current,
            )
          ) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        // A host-owned cross-file navigation is terminal and keeps its existing
        // precommit authority. Only the local fallback below consumes this
        // editor's request claim.
        if (handled) return;
        const liveAfterCrossFile = viewRef.current;
        if (
          !liveAfterCrossFile ||
          !editorMutationClaimIsCurrent(
            claim,
            liveAfterCrossFile,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          )
        ) {
          return;
        }
      }
      const svc = await getTsService();
      const live = viewRef.current;
      if (
        !live ||
        !editorMutationClaimIsCurrent(
          claim,
          live,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        )
      ) {
        return;
      }
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const span = definitionSpan(svc, pos);
      if (!span) {
        setIntelNotice(t("code.gotoDefinition.notFound"));
        return;
      }
      recordNavJump(span.from, span.to); // navigation history: record the def jump
      live.dispatch({
        selection: EditorSelection.range(span.from, span.to),
        effects: [
          EditorView.scrollIntoView(span.from, { y: "center" }),
          flashLocatedLineEffect.of(span.from),
        ],
        scrollIntoView: true,
      });
      live.focus();
    },
    [
      language,
      getTsService,
      t,
      isPythonEditor,
      recordNavJump,
      jumpToProviderLocation,
      languageCan.definition,
    ],
  );

  // Go to Type Definition (VSCode `editor.action.goToTypeDefinition`): jump to the
  // declaration of the TYPE of the symbol under the caret — distinct from
  // go-to-definition (which jumps to the symbol itself). TS/JS only: the
  // single-buffer LanguageService resolves the type span; there is no Python /
  // cross-cell analogue here, so non-TS languages no-op (the palette/menu entries
  // are gated to JS/TS so this is never offered for them). An out-of-file /
  // unresolved type surfaces the same "no definition" notice the def jump uses.
  const goToTypeDefinition = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      const claim = captureEditorMutationClaim(
        view,
        language,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      );
      if (!intelligenceLanguage(language)) {
        // Any other language: whatever provider was registered for it. Both of
        // these are standard language-server questions; they were TypeScript's
        // alone only because nothing else could be asked.
        await jumpToProviderLocation("typeDefinition", pos, claim);
        return;
      }
      if (crossFileGoToTypeDefinitionRef.current) {
        let handled: boolean;
        try {
          handled = await crossFileGoToTypeDefinitionRef.current(pos);
        } catch {
          const liveAfterFailure = viewRef.current;
          if (
            liveAfterFailure &&
            editorMutationClaimIsCurrent(
              claim,
              liveAfterFailure,
              languageRef.current,
              documentGenerationRef.current,
              editorInteractionGenerationRef.current,
            )
          ) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        // A host-owned cross-file navigation is terminal and keeps its existing
        // precommit authority. Only the local fallback consumes this claim.
        if (handled) return;
        const liveAfterCrossFile = viewRef.current;
        if (
          !liveAfterCrossFile ||
          !editorMutationClaimIsCurrent(
            claim,
            liveAfterCrossFile,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          )
        ) {
          return;
        }
      }
      const svc = await getTsService();
      const live = viewRef.current;
      if (
        !live ||
        !editorMutationClaimIsCurrent(
          claim,
          live,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        )
      ) {
        return;
      }
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const span = typeDefinitionSpan(svc, pos);
      if (!span) {
        setIntelNotice(t("code.gotoDefinition.notFound"));
        return;
      }
      recordNavJump(span.from, span.to); // navigation history: record the type-def jump
      live.dispatch({
        selection: EditorSelection.range(span.from, span.to),
        effects: [
          EditorView.scrollIntoView(span.from, { y: "center" }),
          flashLocatedLineEffect.of(span.from),
        ],
        scrollIntoView: true,
      });
      live.focus();
    },
    [language, getTsService, t, recordNavJump, jumpToProviderLocation],
  );

  // Go to Implementation (VSCode `editor.action.goToImplementation`): jump to the
  // concrete implementation of the interface/abstract member under the caret —
  // distinct from go-to-definition. TS/JS only (project hook with a single-buffer
  // fallback);
  // there can be MANY implementations, so we jump to the FIRST in document order
  // (matching VSCode's single-result jump; Find All References remains the way to
  // see every site). An unresolved/no-implementation position surfaces the notice.
  const goToImplementation = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      const claim = captureEditorMutationClaim(
        view,
        language,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      );
      if (!intelligenceLanguage(language)) {
        // Any other language: whatever provider was registered for it. Both of
        // these are standard language-server questions; they were TypeScript's
        // alone only because nothing else could be asked.
        await jumpToProviderLocation("implementation", pos, claim);
        return;
      }
      if (crossFileGoToImplementationRef.current) {
        let handled: boolean;
        try {
          handled = await crossFileGoToImplementationRef.current(pos);
        } catch {
          const liveAfterFailure = viewRef.current;
          if (
            liveAfterFailure &&
            editorMutationClaimIsCurrent(
              claim,
              liveAfterFailure,
              languageRef.current,
              documentGenerationRef.current,
              editorInteractionGenerationRef.current,
            )
          ) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (handled) return;
        const liveAfterCrossFile = viewRef.current;
        if (
          !liveAfterCrossFile ||
          !editorMutationClaimIsCurrent(
            claim,
            liveAfterCrossFile,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          )
        ) {
          return;
        }
      }
      const svc = await getTsService();
      const live = viewRef.current;
      if (
        !live ||
        !editorMutationClaimIsCurrent(
          claim,
          live,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        )
      ) {
        return;
      }
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const spans = implementationSpans(svc, pos);
      if (spans.length === 0) {
        setIntelNotice(t("code.gotoDefinition.notFound"));
        return;
      }
      // First in document order (implementationSpans returns them sorted ascending).
      const span = spans[0];
      recordNavJump(span.from, span.to); // navigation history: record the impl jump
      live.dispatch({
        selection: EditorSelection.range(span.from, span.to),
        effects: [
          EditorView.scrollIntoView(span.from, { y: "center" }),
          flashLocatedLineEffect.of(span.from),
        ],
        scrollIntoView: true,
      });
      live.focus();
    },
    [language, getTsService, t, recordNavJump, jumpToProviderLocation],
  );

  const beginReferenceResultRequest = useCallback(
    (view: EditorView) => {
      const requestId = referenceResultRequestIdRef.current + 1;
      referenceResultRequestIdRef.current = requestId;
      const claim = captureEditorMutationClaim(
        view,
        language,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      );
      referenceResultBusyRef.current = true;
      setReferenceResultBusy(true);
      setIntelNotice(null);
      // A new query owns both render surfaces immediately; old rows/widgets are
      // offsets in a snapshot that is no longer the active question.
      setRefsOpen(false);
      setRefList([]);
      setRefActiveIndex(-1);
      setRefQuery("");
      setRefVisibleLimit(CODE_REFERENCE_PANEL_INITIAL_LIMIT);
      if (peekOpenRef.current) {
        peekOpenRef.current = false;
        view.dispatch({ effects: setPeekEffect.of(null) });
      }
      const isCurrent = () =>
        referenceResultRequestIdRef.current === requestId &&
        editorMutationClaimIsCurrent(
          claim,
          viewRef.current,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        );
      return { requestId, claim, isCurrent };
    },
    [language],
  );

  const finishReferenceResultRequest = useCallback((requestId: number) => {
    if (referenceResultRequestIdRef.current !== requestId) return;
    referenceResultBusyRef.current = false;
    setReferenceResultBusy(false);
  }, []);

  const retireReferenceResultRequest = useCallback(() => {
    referenceResultRequestIdRef.current += 1;
    if (referenceResultBusyRef.current) {
      referenceResultBusyRef.current = false;
      setReferenceResultBusy(false);
    }
  }, []);

  // Find-all-references (VSCode Shift+F12): compute every SAME-FILE reference of
  // the symbol under the caret and open the References panel. TS/JS only (the
  // single-buffer LanguageService); any other language (including Python, whose
  // cross-buffer jedi refs aren't modelled here) shows the brief empty
  // affordance and opens nothing intrusive. The found list highlights the entry
  // the caret sits inside so the symbol you triggered from stands out.
  const findReferences = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      if (!languageCan.references) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const request = beginReferenceResultRequest(view);
      const requestedSource = view.state.doc.toString();
      try {
      // Cross-file (cross-cell) references FIRST — works for any language a host
      // supplies them for (a JS/TS multi-buffer host, or a Python multi-buffer host via jedi over
      // the concatenated cells): the panel then lists EVERY use across the shared
      // scope, not just this buffer. A non-null result replaces the list; null
      // falls through to the single-buffer engine (TS/JS only) below.
      if (crossFileReferencesRef.current) {
        let result: CrossFileReferenceResult | null;
        try {
          result = await crossFileReferencesRef.current(pos, request.isCurrent);
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (result) {
          if (result.refs.length === 0) {
            setIntelNotice(t("code.references.none"));
            setRefsOpen(false);
            setRefList([]);
            setRefActiveIndex(-1);
            return;
          }
          setRefsMode("references");
          setRefList(result.refs);
          setRefActiveIndex(result.activeIndex >= 0 ? result.activeIndex : 0);
          setRefsOpen(true);
          return;
        }
      }
      // Any other language: whatever provider was registered for it. The panel
      // renders a bounded list of places, which is exactly what a provider's
      // locations are — only the line/column/preview have to be derived, since
      // the interface speaks in offsets and the panel shows source lines.
      if (!intelligenceLanguage(language)) {
        let locations: ProviderLocation[];
        let provider: LanguageServiceProvider | null = null;
        try {
          provider = languageServices.providerFor(
            request.claim.language,
            "references",
          );
          if (!provider?.references) {
            if (request.isCurrent()) {
              setIntelNotice(t("document.capability.unavailable"));
            }
            return;
          }
          locations = await provider.references({
            text: requestedSource,
            offset: pos,
            language: request.claim.language,
          });
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (!Array.isArray(locations)) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        try {
          if (
            languageServices.providerFor(
              request.claim.language,
              "references",
            ) !== provider
          ) {
            setIntelNotice(t("document.capability.unavailable"));
            return;
          }
        } catch {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        const live = viewRef.current!;
        const doc = live.state.doc;
        const spans = locations
          // A location in ANOTHER buffer has no offsets this panel could
          // navigate to; the cross-file path above is the one that handles those.
          .filter(
            (location) =>
              location.bufferId === null &&
              location.to > location.from &&
              location.to <= doc.length,
          )
          .map((location) => {
            const line = doc.lineAt(location.from);
            return {
              from: location.from,
              to: location.to,
              line: line.number,
              column: location.from - line.from,
              preview: line.text.trim(),
            };
          });
        if (spans.length === 0) {
          setIntelNotice(t("code.references.none"));
          setRefsOpen(false);
          setRefList([]);
          setRefActiveIndex(-1);
          return;
        }
        const activeIndex = spans.findIndex(
          (span) => pos >= span.from && pos <= span.to,
        );
        setRefsMode("references");
        setRefList(spans);
        setRefActiveIndex(activeIndex >= 0 ? activeIndex : 0);
        setRefsOpen(true);
        return;
      }
      const svc = await getTsService();
      // The compiler is dynamically imported; the view may have unmounted while
      // we awaited. Re-read the live ref and bail if it's gone.
      if (!request.isCurrent()) return;
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const spans = referenceSpans(svc, pos);
      if (spans.length === 0) {
        // No symbol / no references: a brief inline notice, no panel.
        setIntelNotice(t("code.references.none"));
        setRefsOpen(false);
        setRefList([]);
        setRefActiveIndex(-1);
        return;
      }
      // Highlight the entry the trigger caret falls inside (so the reference you
      // invoked from is marked); falls back to the first entry when the caret is
      // somehow outside every span (e.g. on the declaration keyword). The right
      // edge is INCLUSIVE: a caret resting at the END of an identifier (offset ==
      // span.to — a common state via the End key or just-typed text) still
      // resolves the symbol, so it must mark that span, not fall through to entry 0.
      const activeIndex = spans.findIndex((s) => pos >= s.from && pos <= s.to);
      setRefList(spans);
      setRefActiveIndex(activeIndex >= 0 ? activeIndex : 0);
      setRefsOpen(true);
      } finally {
        finishReferenceResultRequest(request.requestId);
      }
    },
    [
      beginReferenceResultRequest,
      finishReferenceResultRequest,
      getTsService,
      language,
      languageCan.references,
      languageServices,
      t,
    ],
  );

  // Focus after React commits the dialog ref. Both the same-file compiler path
  // and the cross-file host path can resolve quickly enough that scheduling from
  // findReferences races the render and leaves focus behind in the editor.
  useEffect(() => {
    if (refsOpen) refsPanelRef.current?.focus();
  }, [refsOpen]);

  // Jump the selection to a listed reference span and scroll it into view
  // (mirrors how go-to-definition dispatches a selection). Clamps the span into
  // the live document so a stale offset can never throw, and re-marks the clicked
  // entry as active so the panel highlight follows the jump.
  const jumpToReference = useCallback(
    (index: number) => {
      const span = refList[index];
      if (!span) return;
      // Cross-file entry: hand off to the host to open the target file/cell and
      // select the span there (the offsets are in THAT file, not this buffer).
      if (span.cellId && onNavigateCrossFileRef.current) {
        onNavigateCrossFileRef.current(span.cellId, span.from, span.to);
        setRefActiveIndex(index);
        return;
      }
      const view = viewRef.current;
      if (!view) return;
      const docLen = view.state.doc.length;
      const from = Math.min(Math.max(span.from, 0), docLen);
      const to = Math.min(Math.max(span.to, from), docLen);
      recordNavJump(from, to); // navigation history: record the reference jump
      view.dispatch({
        selection: EditorSelection.range(from, to),
        effects: [
          EditorView.scrollIntoView(from, { y: "center" }),
          flashLocatedLineEffect.of(from),
        ],
        scrollIntoView: true,
      });
      setRefActiveIndex(index);
      view.focus();
    },
    [refList, recordNavJump],
  );

  /**
   * VSCode's "Show Call Hierarchy", one direction at a time. References answer
   * "where is this name used"; this answers the question people actually chase —
   * how control reaches here, and where it goes next. The host resolves it over
   * the whole project; the panel is the same bounded list.
   */
  const showCallHierarchy = useCallback(
    async (direction: "incoming" | "outgoing") => {
      const view = viewRef.current;
      const resolve = crossFileCallHierarchyRef.current;
      if (!view || !resolve) {
        if (view) setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const request = beginReferenceResultRequest(view);
      try {
        let result: CrossFileReferenceResult | null;
        try {
          result = await resolve(
            view.state.selection.main.head,
            direction,
            request.isCurrent,
          );
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (!result || result.refs.length === 0) {
          setIntelNotice(
            t(
              direction === "incoming"
                ? "code.callHierarchy.noIncoming"
                : "code.callHierarchy.noOutgoing",
            ),
          );
          return;
        }
        setRefsMode(
          direction === "incoming" ? "incomingCalls" : "outgoingCalls",
        );
        setRefList(result.refs);
        setRefActiveIndex(result.activeIndex >= 0 ? result.activeIndex : 0);
        setRefsOpen(true);
        requestAnimationFrame(() => refsPanelRef.current?.focus());
      } finally {
        finishReferenceResultRequest(request.requestId);
      }
    },
    [beginReferenceResultRequest, finishReferenceResultRequest, t],
  );

  // macOS writes ⌘/⌥/⇧; everywhere else the chords read as Ctrl/Alt/Shift.
  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  const visibleShortcuts = useMemo(
    () =>
      filterShortcuts(
        shortcutsForHost(EDITOR_SHORTCUTS, hostShortcuts),
        shortcutsQuery,
        (shortcut) => t(shortcut.labelKey),
        isMacPlatform,
      ),
    [hostShortcuts, isMacPlatform, shortcutsQuery, t],
  );

  const openShortcuts = useCallback(() => {
    setShortcutsQuery("");
    setShortcutsOpen(true);
    requestAnimationFrame(() => shortcutsPanelRef.current?.focus());
  }, []);

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    focusView();
  }, [focusView]);

  const closeReferences = useCallback(() => {
    retireReferenceResultRequest();
    setRefsOpen(false);
    setRefList([]);
    setRefActiveIndex(-1);
    setRefQuery("");
    setRefVisibleLimit(CODE_REFERENCE_PANEL_INITIAL_LIMIT);
    focusView();
  }, [focusView, retireReferenceResultRequest]);

  // --- Inline Peek (VSCode "Peek Definition" / "Peek References") -------------
  // Mod-Alt-F12 opens an INLINE peek — a CM6 block widget below the caret line —
  // instead of jumping. It REUSES the exact same data the jump handlers compute
  // (definitionSpan / referenceSpans for TS/JS, jedi for Python, the cross-file
  // host hook for cross-cell): the peek is a new RENDER surface, not a new engine.
  // The peek lives in the editor's own DOM (a block decoration), so it's fed via
  // the StateField effect and torn down the same way.

  // Clear the peek widget (dispatch a null effect) and restore focus to the
  // editing surface (contentDOM) — mirrors how the references panel closes.
  const closePeek = useCallback(() => {
    retireReferenceResultRequest();
    if (!peekOpenRef.current) return;
    peekOpenRef.current = false;
    const view = viewRef.current;
    if (view) view.dispatch({ effects: setPeekEffect.of(null) });
    focusView();
  }, [focusView, retireReferenceResultRequest]);

  // Peek References: resolve every reference of the symbol under the caret (the
  // SAME resolution as findReferences — cross-file host first, then the
  // single-buffer TS engine) and render them as a compact inline list with a
  // one-line preview + click-to-jump. We also seed `refList` so the shared
  // jumpToReference handler (which reads it) navigates the clicked entry exactly
  // as the panel does. Non-TS without a cross-file host has no in-buffer engine →
  // the brief notice, no peek (mirrors the panel's empty affordance).
  const peekReferences = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      if (!languageCan.references) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const request = beginReferenceResultRequest(view);
      const requestedSource = view.state.doc.toString();
      const anchorLine = view.state.doc.lineAt(pos).number;
      const openPeekWith = (
        refs: Array<ReferenceSpan & { cellId?: string; cellLabel?: string }>,
        activeIndex = -1,
      ) => {
        if (!request.isCurrent()) return;
        const live = viewRef.current!;
        setRefList(refs);
        setRefActiveIndex(activeIndex >= 0 ? activeIndex : 0);
        const itemIndexes = Array.from(
          { length: Math.min(CODE_REFERENCE_PANEL_INITIAL_LIMIT, refs.length) },
          (_, index) => index,
        );
        if (
          activeIndex >= CODE_REFERENCE_PANEL_INITIAL_LIMIT &&
          activeIndex < refs.length
        ) {
          itemIndexes.push(activeIndex);
          itemIndexes.sort((left, right) => left - right);
        }
        const items: PeekReferenceItem[] = itemIndexes.map((index) => {
          const ref = refs[index]!;
          return {
            line: ref.line,
            preview: boundedReferencePreview(ref.preview),
            cellLabel: ref.cellLabel?.slice(0, 256),
            index,
          };
        });
        peekOpenRef.current = true;
        live.dispatch({
          effects: setPeekEffect.of({
            anchorLine,
            mode: "references",
            title: t("code.peek.references"),
            closeLabel: t("code.peek.close"),
            isDark,
            refs: items,
            refsTotal: refs.length,
            moreLabel:
              refs.length > items.length
                ? t("code.references.hidden", {
                    count: refs.length - items.length,
                  })
                : undefined,
            onJump: (index) => jumpToReferenceRef.current(index),
            onClose: () => closePeekRef.current(),
          }),
        });
      };
      try {
      // Cross-file (cross-cell) references first — exactly like findReferences.
      if (crossFileReferencesRef.current) {
        let result: CrossFileReferenceResult | null;
        try {
          result = await crossFileReferencesRef.current(pos, request.isCurrent);
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (result) {
          if (result.refs.length === 0) {
            setIntelNotice(t("code.references.none"));
            return;
          }
          openPeekWith(result.refs, result.activeIndex);
          return;
        }
      }
      if (!intelligenceLanguage(language)) {
        // The same provider Find All References asks, fifteen hundred lines up.
        // This used to stop here and report "no references found" — a claim
        // about the user's code that was simply false, made by a button sitting
        // beside another one that listed every use correctly. Both are lit by
        // the same enablement flag, so the two disagreed in public.
        let locations: ProviderLocation[];
        let provider: LanguageServiceProvider | null = null;
        try {
          provider = languageServices.providerFor(
            request.claim.language,
            "references",
          );
          if (!provider?.references) {
            if (request.isCurrent()) {
              setIntelNotice(t("document.capability.unavailable"));
            }
            return;
          }
          locations = await provider.references({
            text: requestedSource,
            offset: pos,
            language: request.claim.language,
          });
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (!Array.isArray(locations)) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        try {
          if (
            languageServices.providerFor(
              request.claim.language,
              "references",
            ) !== provider
          ) {
            setIntelNotice(t("document.capability.unavailable"));
            return;
          }
        } catch {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        const liveForProvider = viewRef.current!;
        const doc = liveForProvider.state.doc;
        const spans = locations
          .filter(
            (location) =>
              location.bufferId === null &&
              location.to > location.from &&
              location.to <= doc.length,
          )
          .map((location) => {
            const line = doc.lineAt(location.from);
            return {
              from: location.from,
              to: location.to,
              line: line.number,
              column: location.from - line.from,
              preview: line.text.trim(),
            };
          });
        if (spans.length === 0) {
          setIntelNotice(t("code.references.none"));
          return;
        }
        openPeekWith(
          spans,
          spans.findIndex((span) => pos >= span.from && pos <= span.to),
        );
        return;
      }
      const svc = await getTsService();
      if (!request.isCurrent()) return;
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const spans = referenceSpans(svc, pos);
      if (spans.length === 0) {
        setIntelNotice(t("code.references.none"));
        return;
      }
      openPeekWith(
        spans,
        spans.findIndex((span) => pos >= span.from && pos <= span.to),
      );
      } finally {
        finishReferenceResultRequest(request.requestId);
      }
    },
    [
      beginReferenceResultRequest,
      finishReferenceResultRequest,
      getTsService,
      isDark,
      language,
      languageCan.references,
      languageServices,
      t,
    ],
  );

  // Peek Definition: resolve the symbol's declaration (the SAME definitionSpan /
  // jedi lookup as goToDefinition) and render its source lines read-only inline,
  // instead of moving the caret there. An out-of-file / unresolved definition
  // surfaces the same notice the jump path does.
  const peekDefinition = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      if (!languageCan.definition) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const request = beginReferenceResultRequest(view);
      const anchorLine = view.state.doc.lineAt(pos).number;
      // Read a window of lines around (and including) a 1-based target line so the
      // peek shows the declaration with a little surrounding context.
      const openDefPeek = (
        source: string,
        targetLine: number,
        label?: string,
      ) => {
        if (!request.isCurrent()) return;
        const live = viewRef.current!;
        const sourceLines = source.split(/\r\n|\r|\n/);
        const start = Math.min(
          Math.max(targetLine, 1),
          sourceLines.length,
        );
        const end = Math.min(start + 4, sourceLines.length);
        const lines = sourceLines.slice(start - 1, end);
        peekOpenRef.current = true;
        live.dispatch({
          effects: setPeekEffect.of({
            anchorLine,
            mode: "definition",
            title: label
              ? `${t("code.peek.definition")} · ${label}`
              : t("code.peek.definition"),
            closeLabel: t("code.peek.close"),
            isDark,
            defLines: lines,
            defStartLine: start,
            onClose: () => closePeekRef.current(),
          }),
        });
      };
      try {
      if (isPythonEditor) {
        let hasPythonKernel: (namespace?: string) => boolean;
        let definitionPython: typeof import("@mrnote/core/web/lib/code-runner/python-runner.ts")["definitionPython"];
        try {
          ({ hasPythonKernel, definitionPython } =
            await import("@mrnote/core/web/lib/code-runner/python-runner.ts"));
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (!hasPythonKernel(pythonNamespace)) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        const docText = view.state.doc.toString();
        const caretLine = view.state.doc.lineAt(pos);
        let info: import("@mrnote/core/web/lib/code-runner/python-runner.ts").PythonDefinitionInfo | null;
        try {
          info = await definitionPython(
            docText,
            caretLine.number,
            pos - caretLine.from,
            { namespace: pythonNamespace },
          );
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (!info || !info.inBuffer) {
          setIntelNotice(t("code.gotoDefinition.notFound"));
          return;
        }
        openDefPeek(docText, info.line);
        return;
      }
      if (crossFilePeekDefinitionRef.current) {
        let preview: CrossFileDefinitionPreview | null;
        try {
          preview = await crossFilePeekDefinitionRef.current(
            pos,
            request.isCurrent,
          );
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        if (preview) {
          openDefPeek(preview.source, preview.line, preview.label);
          return;
        }
      }
      if (!intelligenceLanguage(language)) {
        // Any other language: the same provider that answers F12. Peeking and
        // jumping are the same question with a different destination, so a
        // language that can be navigated must also be peekable — otherwise the
        // menu offers two entries where only one can ever work.
        let location: ProviderLocation | null;
        try {
          const provider = languageServices.providerFor(
            request.claim.language,
            "definition",
          );
          if (!provider?.definition) {
            if (request.isCurrent()) {
              setIntelNotice(t("document.capability.unavailable"));
            }
            return;
          }
          location = await provider.definition({
            text: request.claim.view.state.doc.toString(),
            offset: pos,
            language: request.claim.language,
          });
        } catch {
          if (request.isCurrent()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          return;
        }
        if (!request.isCurrent()) return;
        const live = viewRef.current!;
        if (!location || location.bufferId !== null) {
          setIntelNotice(t("code.gotoDefinition.notFound"));
          return;
        }
        const doc = live.state.doc;
        const target = Math.min(Math.max(location.from, 0), doc.length);
        openDefPeek(doc.toString(), doc.lineAt(target).number);
        return;
      }
      const svc = await getTsService();
      if (!request.isCurrent()) return;
      if (!svc) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      svc.markDirty();
      const span = definitionSpan(svc, pos);
      if (!span) {
        setIntelNotice(t("code.gotoDefinition.notFound"));
        return;
      }
      openDefPeek(
        view.state.doc.toString(),
        view.state.doc.lineAt(span.from).number,
      );
      } finally {
        finishReferenceResultRequest(request.requestId);
      }
    },
    [
      beginReferenceResultRequest,
      finishReferenceResultRequest,
      language,
      getTsService,
      t,
      isDark,
      isPythonEditor,
      languageCan.definition,
      languageServices,
      pythonNamespace,
    ],
  );

  // Keep the refs the (long-lived, out-of-React) peek widget calls pointed at the
  // latest callbacks, so a click-to-jump / close always runs the current logic.
  jumpToReferenceRef.current = jumpToReference;
  closePeekRef.current = closePeek;

  // --- Compare / diff-merge view (VSCode Ctrl/Cmd+Shift+\) -------------------
  // Open the compare affordance: snapshot the host's current list of pickable
  // sources (sibling cells), clearing any prior selection so it opens on the
  // PICKER (not a stale diff). A no-op when the host supplied no sources (the
  // button/keymap that call this only exist when it did, but guard anyway). a11y:
  // move keyboard focus into the just-opened panel (mirrors the other panels).
  const openCompare = useCallback(() => {
    const sources = withClipboardCompareSource(
      compareSourcesRef.current?.() ?? null,
      t,
    );
    if (sources.length === 0) {
      setIntelNotice(t("document.capability.unavailable"));
      return false;
    }
    compareRequestIdRef.current += 1;
    setCompareList(sources);
    setCompareQuery("");
    setCompareWith(null);
    setCompareBase(null);
    setCompareLeft(null);
    setComparePickingRole("incoming");
    setCompareConflicts(null);
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareChunkCount(0);
    setCompareOpen(true);
    requestAnimationFrame(() => comparePanelRef.current?.focus());
    return true;
  }, [t]);

  const closeCompare = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareOpen(false);
    setCompareWith(null);
    setCompareQuery("");
    setCompareBase(null);
    setCompareLeft(null);
    setComparePickingRole(null);
    setCompareConflicts(null);
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareChunkCount(0);
    compareHandleRef.current = null;
    focusView();
  }, [focusView]);

  const focusCompareSurface = useCallback(() => {
    requestAnimationFrame(() => {
      const panel = comparePanelRef.current;
      if (!panel) return;
      if (compareFilterRef.current) {
        compareFilterRef.current.focus();
        return;
      }
      const firstSource = panel.querySelector<HTMLButtonElement>(
        '[data-testid="code-compare-source-item"]',
      );
      (firstSource ?? panel).focus();
    });
  }, []);

  // Pick which source to diff against; switches the panel from the picker list to
  // the side-by-side merge view. Re-reads the host list first so a label/text
  // that changed since the panel opened is current.
  const chooseCompareSource = useCallback(
    async (source: CompareSource, role: CompareSourceRole = "incoming") => {
      const requestId = compareRequestIdRef.current + 1;
      compareRequestIdRef.current = requestId;
      const sourceScope = activeCompareSourceScopeRef.current;
      const isCurrentRequest = () =>
        compareRequestIdRef.current === requestId &&
        activeCompareSourceScopeRef.current === sourceScope;
      // Every prior conflict decision belongs to the pair being replaced.
      const publish = (resolved: ResolvedCompareSource) => {
        setCompareConflicts(null);
        setComparePickingRole(null);
        if (role === "base") {
          // A three-way merge resolves INTO the buffer, so it cannot also be
          // reading its left side from a version.
          setCompareLeft(null);
          setCompareBase(resolved);
          return;
        }
        if (role === "left") {
          setCompareBase(null);
          setCompareLeft(resolved);
          return;
        }
        setCompareBase(null);
        setCompareWith(resolved);
      };
      setCompareChunkCount(0);
      setCompareLoadError(null);

      if ("text" in source && typeof source.text === "string") {
        setCompareLoading(false);
        publish({ id: source.id, label: source.label, text: source.text });
        return;
      }

      setCompareLoading(true);
      try {
        const text = await source.loadText();
        if (!isCurrentRequest()) return;
        if (typeof text !== "string")
          throw new Error("Invalid compare source text");
        publish({ id: source.id, label: source.label, text });
      } catch {
        if (isCurrentRequest()) {
          setCompareLoadError(t("code.compare.loadFailed"));
        }
      } finally {
        if (isCurrentRequest()) {
          setCompareLoading(false);
        }
      }
    },
    [t],
  );

  // Open the picker again to choose the common ancestor (base). Re-reads the
  // host list so a source added since the panel opened is offered; the already
  // chosen incoming source is filtered out at render time.
  const pickCompareBase = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareQuery("");
    setComparePickingRole("base");
    setCompareList(
      withClipboardCompareSource(compareSourcesRef.current?.() ?? null, t),
    );
    focusCompareSurface();
  }, [focusCompareSurface, t]);

  // Open the picker again to choose the LEFT side, so the panel diffs two
  // picked versions instead of the live buffer against one.
  const pickCompareLeft = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareQuery("");
    setComparePickingRole("left");
    setCompareList(
      withClipboardCompareSource(compareSourcesRef.current?.() ?? null, t),
    );
    focusCompareSurface();
  }, [focusCompareSurface, t]);

  // Put the live buffer back on the left — the comparison this panel has always
  // offered, and the only one a chunk can be applied into.
  const clearCompareLeft = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareLeft(null);
    setComparePickingRole(null);
    setCompareChunkCount(0);
    setCompareLoadError(null);
    compareHandleRef.current = null;
    focusCompareSurface();
  }, [focusCompareSurface]);

  // Drop the ancestor and fall back to the plain two-way diff.
  const clearCompareBase = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareBase(null);
    setComparePickingRole(null);
    setCompareConflicts(null);
    setCompareChunkCount(0);
    setCompareLoadError(null);
    compareHandleRef.current = null;
    focusCompareSurface();
  }, [focusCompareSurface]);

  // Back from a diff to the source picker (so the user can pick a different one
  // without reopening). Drops the live merge handle.
  const backToComparePicker = useCallback(() => {
    compareRequestIdRef.current += 1;
    setCompareWith(null);
    setCompareBase(null);
    setCompareLeft(null);
    setComparePickingRole("incoming");
    setCompareConflicts(null);
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareQuery("");
    setCompareChunkCount(0);
    compareHandleRef.current = null;
    setCompareList(
      withClipboardCompareSource(compareSourcesRef.current?.() ?? null, t),
    );
    focusCompareSurface();
  }, [focusCompareSurface, t]);

  // Receive the imperative navigation handle from the just-mounted merge view
  // (callback ref). Stable identity so it never re-triggers the child's effect.
  const handleCompareReady = useCallback((handle: CodeCompareHandle | null) => {
    compareHandleRef.current = handle;
  }, []);
  // The merge view reports its changed-chunk count after each (re)build; mirror
  // it into React for the header's "N changes" label.
  const handleCompareChunks = useCallback((count: number) => {
    setCompareChunkCount(count);
  }, []);

  // Publish a reviewed B→A merge into the REAL editor as one ordinary CM6
  // transaction. That preserves the existing onChange/autosave/diagnostics path
  // and gives every accepted chunk (or Accept All) one precise Undo step.
  const applyCompareCurrent = useCallback(
    (application: CodeCompareApplication): boolean => {
      const view = viewRef.current;
      if (!view || effectiveReadOnly) return false;
      const current = view.state.doc.toString();
      // A peer/collaborator may edit the real buffer while the overlay is open.
      // Never apply offsets computed against an older A snapshot; close the
      // review surface and let the user reopen it against the latest text.
      if (current !== application.before) {
        closeCompare();
        return false;
      }
      if (application.changes.length === 0) return false;
      view.dispatch({
        changes: application.changes,
        userEvent: "input.compare.review",
      });
      return true;
    },
    [closeCompare, effectiveReadOnly],
  );

  // Publish ONE fully-resolved three-way merge. Conflict choices stay inside the
  // review surface until this call, so the live buffer sees a single ordinary
  // CM6 transaction — one Undo step, one autosave, one diagnostics pass. The
  // same fail-closed snapshot check as the two-way path guards against a peer
  // edit landing while the reviewer was choosing sides.
  const applyCompareMerge = useCallback(
    (application: CodeCompareApplication): boolean => {
      const view = viewRef.current;
      if (!view || effectiveReadOnly) return false;
      if (view.state.doc.toString() !== application.before) {
        closeCompare();
        return false;
      }
      if (application.changes.length > 0) {
        view.dispatch({
          changes: application.changes,
          userEvent: "input.compare.merge",
        });
      }
      // The review is finished either way: a merge that resolves to the current
      // text is still a completed review, not a silent no-op.
      closeCompare();
      return true;
    },
    [closeCompare, effectiveReadOnly],
  );

  const handleCompareConflictState = useCallback(
    (state: CodeCompareConflictState) => {
      setCompareConflicts(state);
    },
    [],
  );

  // A three-way review needs BOTH an ancestor and an incoming side; anything
  // else keeps the panel on its original two-way behaviour.
  const compareThreeWayActive = compareWith !== null && compareBase !== null;
  const comparePickerVisible =
    comparePickingRole !== null || compareWith === null;
  // The host's held comparison opens straight on its source (no picker), and
  // leaves when the host says so.
  const pinnedCompareId = pinnedCompare?.id;
  const pinnedCompareLabel = pinnedCompare?.label;
  const pinnedCompareText = pinnedCompare?.text;
  const pinnedCompareOpen = pinnedCompare?.open === true;
  useEffect(() => {
    if (
      pinnedCompareId === undefined ||
      pinnedCompareLabel === undefined ||
      pinnedCompareText === undefined
    ) {
      return;
    }
    if (!pinnedCompareOpen) {
      if (compareOpenRef.current) closeCompare();
      return;
    }
    const source = {
      id: pinnedCompareId,
      label: pinnedCompareLabel,
      text: pinnedCompareText,
    };
    compareRequestIdRef.current += 1;
    setCompareList([source]);
    setCompareQuery("");
    setCompareBase(null);
    setCompareLeft(null);
    setComparePickingRole(null);
    setCompareConflicts(null);
    setCompareLoading(false);
    setCompareLoadError(null);
    setCompareWith(source);
    setCompareOpen(true);
  }, [
    closeCompare,
    pinnedCompareId,
    pinnedCompareLabel,
    pinnedCompareOpen,
    pinnedCompareText,
  ]);
  useEffect(() => {
    if (!compareOpen || !comparePickerVisible) return;
    const frame = requestAnimationFrame(() =>
      compareFilterRef.current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [compareOpen, comparePickerVisible]);
  // Two-way navigates changed chunks (none left == nothing to visit); three-way
  // navigates conflicts, which stay visitable after they are resolved.
  const compareNavDisabled = compareThreeWayActive
    ? (compareConflicts?.total ?? 0) === 0
    : compareChunkCount === 0;
  // No side may double as another: an ancestor that is also the incoming side
  // has nothing to merge, and a version diffed against itself has nothing to
  // show.
  const comparePickableList = useMemo(() => {
    if (comparePickingRole === "base") {
      return compareList.filter((source) => source.id !== compareWith?.id);
    }
    if (comparePickingRole === "left") {
      return compareList.filter((source) => source.id !== compareWith?.id);
    }
    return compareList.filter((source) => source.id !== compareLeft?.id);
  }, [compareList, comparePickingRole, compareWith, compareLeft]);
  const normalizedCompareQuery = compareQuery.trim().toLocaleLowerCase();
  const visibleCompareSources = useMemo(
    () =>
      normalizedCompareQuery.length === 0
        ? comparePickableList
        : comparePickableList.filter((source) =>
            source.label.toLocaleLowerCase().includes(normalizedCompareQuery),
          ),
    [comparePickableList, normalizedCompareQuery],
  );
  // Count-dependent merge copy routed through the app's plural-aware catalogue.
  const compareConflictCountLabel = useCallback(
    (count: number) => t("code.compare.conflictCount", { count }),
    [t],
  );
  const compareResolvedCountLabel = useCallback(
    (count: number) => t("code.compare.resolvedCount", { count }),
    [t],
  );
  const compareConflictLabel = useCallback(
    (position: number) => t("code.compare.conflictName", { position }),
    [t],
  );

  // --- Problems panel (VSCode Ctrl/Cmd+Shift+M) -----------------------------
  // Jump the selection to a listed problem's range and scroll it into view
  // (mirrors jumpToReference / go-to-definition). The {from,to} are document
  // offsets; clamp them into the LIVE document so a stale offset (a diagnostic
  // that was listed just before an edit) can never throw, then dispatch the
  // selection + scroll and return focus to the editor.
  const jumpToProblem = useCallback(
    (entry: ProblemEntry) => {
      if (!entry.navigable) return;
      const view = viewRef.current;
      if (!view) return;
      const docLen = view.state.doc.length;
      const from = Math.min(Math.max(entry.from, 0), docLen);
      const to = Math.min(Math.max(entry.to, from), docLen);
      recordNavJump(from, to); // navigation history: record the problem jump
      view.dispatch({
        selection: EditorSelection.range(from, to),
        effects: [
          EditorView.scrollIntoView(from, { y: "center" }),
          flashLocatedLineEffect.of(from),
        ],
        scrollIntoView: true,
      });
      view.focus();
    },
    [recordNavJump],
  );

  const closeProblems = useCallback(() => {
    setProblemsOpen(false);
    // Reset the signature so the NEXT open always rebuilds from the live state.
    problemSignatureRef.current = "";
    focusView();
  }, [focusView]);

  // Toggle the Problems panel. On OPEN we snapshot the diagnostics straight from
  // the live CM6 state so the list is populated immediately (the updateListener
  // only refreshes it on a SUBSEQUENT view update; without this snapshot a panel
  // opened between re-lints would show stale/empty content). We seed the
  // signature ref to MATCH the snapshot so the very next (geometry) update is a
  // no-op rather than a redundant rebuild. a11y: move keyboard focus into the
  // just-opened panel (tabIndex=-1) so its Esc / Tab order are operable at once —
  // mirrors the references panel.
  const toggleProblems = useCallback(() => {
    setProblemsOpen((open) => {
      const next = !open;
      if (next) {
        const view = viewRef.current;
        const visibility = problemSeverityVisibilityRef.current;
        problemSignatureRef.current = view
          ? problemSignature(view.state, visibility)
          : "";
        if (view) {
          const counts = countProblemSeverities(view.state);
          problemSeverityCountsRef.current = counts;
          setProblemSeverityCounts(counts);
        }
        setProblemList(
          view
            ? collectProblems(
                view.state,
                PROBLEMS_PANEL_RENDER_LIMIT,
                visibility,
              )
            : [],
        );
        requestAnimationFrame(() => problemsPanelRef.current?.focus());
      } else {
        problemSignatureRef.current = "";
        focusView();
      }
      return next;
    });
  }, [focusView]);

  const toggleProblemSeverity = useCallback(
    (severity: ProblemSeverityGroup) => {
      const current = problemSeverityVisibilityRef.current;
      const next = { ...current, [severity]: !current[severity] };
      problemSeverityVisibilityRef.current = next;
      setProblemSeverityVisibility(next);
      const view = viewRef.current;
      if (!view || !problemsOpenRef.current) return;
      problemSignatureRef.current = problemSignature(view.state, next);
      const counts = countProblemSeverities(view.state);
      problemSeverityCountsRef.current = counts;
      setProblemSeverityCounts(counts);
      setProblemList(
        collectProblems(view.state, PROBLEMS_PANEL_RENDER_LIMIT, next),
      );
    },
    [],
  );

  // A window-level ribbon can request the panel without simulating a keyboard
  // event or querying CodeMirror's private DOM. An already-open panel is simply
  // refocused, so repeated host actions never accidentally close it.
  const lastProblemsOpenRequestRef = useRef(problemsOpenRequest);
  useEffect(() => {
    if (
      problemsOpenRequest === undefined ||
      problemsOpenRequest === lastProblemsOpenRequestRef.current
    ) {
      return;
    }
    lastProblemsOpenRequestRef.current = problemsOpenRequest;
    if (problemsOpenRef.current) {
      requestAnimationFrame(() => problemsPanelRef.current?.focus());
      return;
    }
    toggleProblems();
  }, [problemsOpenRequest, toggleProblems]);

  // --- Go-to-Symbol / Outline (VSCode Ctrl/Cmd+Shift+O) ---------------------
  // Compute the document's symbol outline. TS/JS use the single-buffer
  // LanguageService's navigation tree (full nested symbols); every OTHER language
  // (python/go/rust/markdown/…) falls back to a light header-line scan. Shared by
  // both the Go-to-Symbol picker and the breadcrumb strip so they always agree on
  // the symbol set (and so the breadcrumb crumb index lines up with what
  // jumpToSymbol would select). Returns `[]` for an empty buffer, a structure-
  // less language, a missing compiler, or an unmounted view — non-throwing.
  const computeSymbols = useCallback(async (): Promise<DocumentSymbol[]> => {
    const view = viewRef.current;
    if (!view) return [];
    if (intelligenceLanguage(language)) {
      // TS/JS: drive the real navigation tree. The compiler is dynamically
      // imported, so the view may have unmounted while we awaited — re-read.
      const svc = await getTsService();
      if (!viewRef.current) return [];
      if (!svc) return [];
      svc.markDirty();
      return documentSymbols(svc);
    }
    // Any non-TS/JS language (including Python, whose live-kernel jedi isn't
    // wired for outline here): the regex fallback over the live buffer text.
    return outlineSymbols(view.state.doc.toString(), language);
  }, [language, getTsService]);

  // Compute the document's symbol outline and open the picker. With no symbols
  // (an empty buffer, or a language with no structure) the picker still opens but
  // shows the empty-state row, mirroring the references panel. The entry the caret
  // falls inside is marked active so the picker opens focused on "where you are".
  const openSymbols = useCallback(
    async (pos: number) => {
      const view = viewRef.current;
      if (!view) return;
      const owner = symbolOwnerRef.current;
      const source = view.state.doc.toString();
      const symbols = await computeSymbols();
      const live = viewRef.current;
      if (
        live !== view ||
        symbolOwnerRef.current.language !== owner.language ||
        symbolOwnerRef.current.viewStateKey !== owner.viewStateKey ||
        live.state.doc.toString() !== source ||
        live.state.selection.main.head !== pos
      ) {
        return;
      }
      // Mark the symbol the caret currently sits inside (the innermost / longest
      // containing span loses to the LAST matching entry in document order, which
      // for a flat ascending list is the deepest enclosing symbol). Falls back to
      // -1 (no highlight) when the caret is outside every symbol.
      let activeIndex = -1;
      for (let i = 0; i < symbols.length; i += 1) {
        if (pos >= symbols[i].from && pos <= symbols[i].to) activeIndex = i;
      }
      setSymbolList(symbols);
      setSymbolActiveIndex(activeIndex);
      setSymbolsOpen(true);
    },
    [computeSymbols],
  );

  // Focus only after React has committed the dialog ref. Scheduling from
  // openSymbols raced that commit on fast async symbol lookups, intermittently
  // leaving keyboard and screen-reader users stranded in the editor.
  useEffect(() => {
    if (symbolsOpen) symbolsPanelRef.current?.focus();
  }, [symbolsOpen]);

  // Select a symbol's NAME and scroll it into view (the shared dispatch behind
  // both the Go-to-Symbol picker and breadcrumb crumbs). TS navigation trees
  // expose the whole declaration/body span; landing on its end made the next
  // References/Rename command query the wrong token. Non-TS outlines already
  // supply an exact name span. Every offset is clamped so stale data stays inert.
  const selectSymbolSpan = useCallback(
    (span: DocumentSymbol) => {
      const view = viewRef.current;
      if (!view) return;
      const docLen = view.state.doc.length;
      const from = Math.min(Math.max(span.from, 0), docLen);
      const to = Math.min(Math.max(span.to, from), docLen);
      const declaredText = view.state.doc.sliceString(from, to);
      const relativeNameOffset = declaredText.indexOf(span.name);
      const nameFrom =
        relativeNameOffset >= 0 ? from + relativeNameOffset : from;
      const nameTo =
        relativeNameOffset >= 0
          ? Math.min(nameFrom + span.name.length, to)
          : to;
      recordNavJump(nameFrom, nameTo);
      view.dispatch({
        selection: EditorSelection.range(nameFrom, nameTo),
        effects: [
          EditorView.scrollIntoView(nameFrom, { y: "center" }),
          flashLocatedLineEffect.of(nameFrom),
        ],
        scrollIntoView: true,
      });
      view.focus();
    },
    [recordNavJump],
  );

  // Jump the selection to a listed symbol's span (picker) and re-mark the chosen
  // entry active so the picker highlight follows the jump.
  const jumpToSymbol = useCallback(
    (index: number) => {
      const span = symbolList[index];
      if (!span) return;
      selectSymbolSpan(span);
      setSymbolActiveIndex(index);
      setSymbolsOpen(false);
    },
    [symbolList, selectSymbolSpan],
  );

  // Jump the selection to a breadcrumb crumb's symbol span. The crumb carries the
  // index into the SAME `breadcrumbSymbols` list the chain was derived from, so
  // this lands exactly where Go-to-Symbol would for that entry. The next
  // selection-change update recomputes the chain, so the strip follows the jump.
  const jumpToBreadcrumb = useCallback(
    (index: number) => {
      const span = breadcrumbSymbols[index];
      if (!span) return;
      selectSymbolSpan(span);
    },
    [breadcrumbSymbols, selectSymbolSpan],
  );

  const closeSymbols = useCallback(() => {
    setSymbolsOpen(false);
    focusView();
  }, [focusView]);

  // --- Breadcrumbs strip (VSCode parity) ------------------------------------
  // Recompute the breadcrumb symbol outline (debounced) whenever the buffer or
  // language changes, so the persistent strip above the editor stays current as
  // the user types. Mirrors the picker's source (computeSymbols) so the two never
  // disagree. Debounced to keep the TS navigation-tree query off the keystroke
  // hot path; the cleanup invalidates a stale async result and cancels a pending
  // run, so a fast edit/unmount can't write an outdated list. A structure-less
  // buffer yields `[]` → the strip renders nothing (the editor is unchanged).
  useEffect(() => {
    if (lightweightMode) {
      setBreadcrumbSymbolSnapshot({
        language,
        viewStateKey,
        source: value,
        symbols: [],
      });
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      void computeSymbols().then((symbols) => {
        if (cancelled) return;
        setBreadcrumbSymbolSnapshot({
          language,
          viewStateKey,
          source: value,
          symbols,
        });
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [value, language, viewStateKey, computeSymbols, lightweightMode]);

  // The leading file crumb's label: the caller-supplied document/cell name, else
  // a generic localized fallback so the strip always names its file segment.
  const breadcrumbFileLabel =
    documentName && documentName.trim() !== ""
      ? documentName
      : t("code.breadcrumbs.file");

  // --- Status bar (VSCode parity: Ln X, Col Y · indent · EOL) ---------------
  // The host's current-line authority remains synchronous. Visible Ln/Col and
  // breadcrumb chrome subscribe below without making this large parent render.
  useEffect(() => {
    if (!onCursorLineChange) return;
    const view = viewRef.current;
    const head = view?.state.selection.main.head ?? 0;
    const line = view?.state.doc.lineAt(head).number ?? 1;
    if (lastReportedCursorLineRef.current === line) return;
    lastReportedCursorLineRef.current = line;
    onCursorLineChange(line);
  }, [onCursorLineChange, viewStateKey]);
  // The indent indicator reflects the ACTIVE indent style (`indentStyle` — seeded
  // from the buffer via detectIndent on mount, then updated by the "Indent
  // Using…" / "Convert Indentation…" commands), so it shows what new lines will
  // use, exactly like VSCode's status bar. Spaces-2 on an un-indented buffer keeps
  // the pre-feature label.
  const eol = useMemo(
    () => resolveEol(value, lineEnding),
    [lineEnding, value],
  );
  const indentText = indentStyle.useTabs
    ? t("code.statusBar.tabSize", { width: indentStyle.width })
    : t("code.statusBar.spaces", { width: indentStyle.width });

  // --- Quick Fix / code actions (VSCode Ctrl+. / Cmd+.) ---------------------
  // Compute project-aware and same-file code actions for the current caret (or
  // selection) and open one shared Quick Fix menu. TS/JS only; other languages
  // show the brief empty affordance. The host project query and local service
  // load run together, then the exact document/selection snapshot is checked
  // before any result is shown.
  const openQuickFix = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    if (!languageCan.codeActions) {
      setIntelNotice(t("document.capability.unavailable"));
      return;
    }
    const claim = captureEditorMutationClaim(
      view,
      language,
      documentGenerationRef.current,
      editorInteractionGenerationRef.current,
    );
    // A newer request owns the menu immediately. An old visible action cannot
    // remain applicable while this provider/compiler request is in flight.
    fixMutationClaimRef.current = null;
    setFixMenuKind("quickFix");
    setFixesOpen(false);
    setFixList([]);
    setFixQuery("");
    setFixVisibleLimit(CODE_ACTION_MENU_INITIAL_LIMIT);
    if (!intelligenceLanguage(language)) {
      // Any other language: whatever provider was registered for it. The menu
      // takes `{description, edits}`, which is what a provider's action already
      // is once its spans are read as offsets.
      const selection = view.state.selection.main;
      const requested = view.state.doc.toString();
      let offered: ProviderCodeAction[];
      let provider: LanguageServiceProvider | null = null;
      try {
        provider = languageServices.providerFor(language, "codeActions");
        if (!provider?.codeActions) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
        offered = await provider.codeActions({
            text: requested,
            offset: selection.from,
            to: selection.to,
            language,
          });
      } catch {
        if (
          editorMutationClaimIsCurrent(
            claim,
            viewRef.current,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          )
        ) {
          setIntelNotice(t("document.capability.unavailable"));
        }
        return;
      }
      const live = viewRef.current;
      // The document or the caret moved while the provider was thinking: its
      // edits were computed for a buffer that no longer exists.
      if (
        !live ||
        !editorMutationClaimIsCurrent(
          claim,
          live,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        ) ||
        live.state.doc.toString() !== requested ||
        live.state.selection.main.from !== selection.from ||
        live.state.selection.main.to !== selection.to
      ) {
        return;
      }
      if (!Array.isArray(offered)) {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      try {
        if (
          languageServices.providerFor(claim.language, "codeActions") !==
          provider
        ) {
          setIntelNotice(t("document.capability.unavailable"));
          return;
        }
      } catch {
        setIntelNotice(t("document.capability.unavailable"));
        return;
      }
      const end = live.state.doc.length;
      const usable = offered
        .map((action) => ({
          description: action.title,
          edits: action.edits
            .filter((edit) => edit.bufferId === null)
            .map((edit) => ({
              from: edit.span.from,
              to: edit.span.to,
              insert: edit.newText,
            }))
            .sort((a, b) => a.from - b.from),
        }))
        // An action is offered only if EVERY edit is applicable: in this buffer,
        // in range, and non-overlapping. Offering one that would half-apply is
        // worse than not offering it.
        .filter(
          (action) =>
            action.edits.length > 0 &&
            action.edits.every(
              (edit, index) =>
                edit.from >= 0 &&
                edit.to >= edit.from &&
                edit.to <= end &&
                (index === 0 || edit.from >= action.edits[index - 1].to),
            ),
        );
      if (usable.length === 0) {
        fixMutationClaimRef.current = null;
        setIntelNotice(t("code.quickFix.none"));
        setFixesOpen(false);
        setFixList([]);
        return;
      }
      const bounded = boundedEditorCodeActions(usable);
      fixMutationClaimRef.current = claim;
      setFixList(bounded);
      setFixesOpen(true);
      return;
    }
    const sel = view.state.selection.main;
    const requestedSource = view.state.doc.toString();
    const crossFilePromise = crossFileCodeFixesRef.current
      ? crossFileCodeFixesRef.current(sel.from, sel.to).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const, value: null }),
        )
      : Promise.resolve({ ok: true as const, value: null });
    const [crossFileReceipt, svc] = await Promise.all([
      crossFilePromise,
      getTsService(),
    ]);
    // The compiler is dynamically imported; the view may have unmounted while we
    // awaited. Re-read the live ref and reject an action list computed for an
    // edited document or a caret that has since moved.
    const live = viewRef.current;
    const liveSelection = live?.state.selection.main;
    if (
      !live ||
      !editorMutationClaimIsCurrent(
        claim,
        live,
        languageRef.current,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      ) ||
      live.state.doc.toString() !== requestedSource ||
      liveSelection?.from !== sel.from ||
      liveSelection.to !== sel.to
    ) {
      return;
    }
    let localActions: CodeFixAction[] = [];
    if (svc) {
      svc.markDirty();
      localActions = codeFixes(svc, sel.from, sel.to);
    }
    const crossFileActions = Array.isArray(crossFileReceipt.value)
      ? crossFileReceipt.value
      : [];
    const crossFileReceiptValid =
      crossFileReceipt.ok &&
      (crossFileReceipt.value === null || Array.isArray(crossFileReceipt.value));
    const actions = boundedEditorCodeActions([
      ...crossFileActions,
      ...localActions,
    ]);
    if (actions.length === 0) {
      // No fixes: a brief inline notice, no menu.
      fixMutationClaimRef.current = null;
      setIntelNotice(
        !crossFileReceiptValid || !svc
          ? t("document.capability.unavailable")
          : t("code.quickFix.none"),
      );
      setFixesOpen(false);
      setFixList([]);
      return;
    }
    fixMutationClaimRef.current = claim;
    setFixList(actions);
    setFixesOpen(true);
  }, [
    language,
    getTsService,
    languageCan.codeActions,
    languageServices,
    t,
  ]);

  /**
   * VSCode's Refactor… menu. Quick Fix repairs what the compiler flagged;
   * this restructures code that is already correct, so it is a separate
   * gesture with its own offers — and reuses the same menu and the same atomic
   * apply, because a chosen refactoring is written exactly like a chosen fix.
   */
  const openRefactor = useCallback(async () => {
    const view = viewRef.current;
    const resolve = crossFileRefactorsRef.current;
    if (!view || !resolve) return;
    const claim = captureEditorMutationClaim(
      view,
      language,
      documentGenerationRef.current,
      editorInteractionGenerationRef.current,
    );
    fixMutationClaimRef.current = null;
    setFixMenuKind("refactor");
    setFixesOpen(false);
    setFixList([]);
    setFixQuery("");
    setFixVisibleLimit(CODE_ACTION_MENU_INITIAL_LIMIT);
    const sel = view.state.selection.main;
    const requestedSource = view.state.doc.toString();
    const receipt = await resolve(sel.from, sel.to).then(
      (actions) => ({ ok: true as const, actions }),
      () => ({ ok: false as const, actions: null }),
    );
    const live = viewRef.current;
    const liveSelection = live?.state.selection.main;
    // Reject a list computed for an edited document or a moved caret.
    if (
      !live ||
      !editorMutationClaimIsCurrent(
        claim,
        live,
        languageRef.current,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      ) ||
      live.state.doc.toString() !== requestedSource ||
      liveSelection?.from !== sel.from ||
      liveSelection.to !== sel.to
    ) {
      return;
    }
    if (!receipt.ok) {
      fixMutationClaimRef.current = null;
      setIntelNotice(t("document.capability.unavailable"));
      setFixesOpen(false);
      setFixList([]);
      return;
    }
    const actions = receipt.actions;
    if (!actions || actions.length === 0) {
      fixMutationClaimRef.current = null;
      setIntelNotice(t("code.refactor.none"));
      setFixesOpen(false);
      setFixList([]);
      return;
    }
    const bounded = boundedEditorCodeActions(actions);
    fixMutationClaimRef.current = claim;
    setFixList(bounded);
    setFixesOpen(true);
  }, [language, t]);

  // Apply one chosen Quick Fix, or prepare one chosen Refactor preview.
  // Project refactors never write from this menu: the host opens the shared
  // Office preview and owns its later Apply / Discard / Undo transaction.
  const applyQuickFix = useCallback(
    async (index: number) => {
      const view = viewRef.current;
      if (!view) return;
      const action = fixList[index];
      if (!action) {
        fixMutationClaimRef.current = null;
        setFixesOpen(false);
        setFixList([]);
        focusView();
        return;
      }
      const claim = fixMutationClaimRef.current;
      const isCurrent = () =>
        claim !== null &&
        fixMutationClaimRef.current === claim &&
        editorMutationClaimIsCurrent(
          claim,
          viewRef.current,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        );
      if (!isCurrent()) {
        fixMutationClaimRef.current = null;
        setFixesOpen(false);
        setFixList([]);
        focusView();
        return;
      }
      if ("preview" in action) {
        let previewed = false;
        try {
          previewed = await action.preview(isCurrent);
        } catch {
          previewed = false;
        }
        if (!viewRef.current) return;
        const failureStillCurrent = !previewed && isCurrent();
        fixMutationClaimRef.current = null;
        setFixesOpen(false);
        setFixList([]);
        focusView();
        if (failureStillCurrent) {
          setIntelNotice(t("document.capability.unavailable"));
        }
        return;
      }
      if ("apply" in action) {
        let applied = false;
        try {
          applied = await action.apply(isCurrent);
        } catch {
          applied = false;
        }
        if (!viewRef.current) return;
        const failureStillCurrent = !applied && isCurrent();
        fixMutationClaimRef.current = null;
        setFixesOpen(false);
        setFixList([]);
        focusView();
        if (failureStillCurrent) {
          setIntelNotice(t("document.capability.unavailable"));
        }
        return;
      }
      if (action.edits.length === 0) {
        fixMutationClaimRef.current = null;
        setFixesOpen(false);
        setFixList([]);
        focusView();
        return;
      }
      const docLen = view.state.doc.length;
      const changes = action.edits.map((edit) => {
        const from = Math.min(Math.max(edit.from, 0), docLen);
        const to = Math.min(Math.max(edit.to, from), docLen);
        return { from, to, insert: edit.insert };
      });
      // One transaction = one undoable edit covering the whole fix. The doc
      // change drives react-codemirror's updateListener, so the fix flows through
      // the SAME onChange/autosave path as user typing.
      view.dispatch({ changes, userEvent: "input.quickfix" });
      // The buffer-change effect closes the menu, but close eagerly too so the UI
      // is correct even in a (collab) path where `value` is frozen.
      fixMutationClaimRef.current = null;
      setFixesOpen(false);
      setFixList([]);
      setFixQuery("");
      setFixVisibleLimit(CODE_ACTION_MENU_INITIAL_LIMIT);
      view.focus();
    },
    [fixList, focusView, t],
  );

  const closeQuickFix = useCallback(() => {
    fixMutationClaimRef.current = null;
    setFixesOpen(false);
    setFixList([]);
    setFixQuery("");
    setFixVisibleLimit(CODE_ACTION_MENU_INITIAL_LIMIT);
    focusView();
  }, [focusView]);

  // Organize Imports (VSCode Shift+Alt+O) — the TS language service removes unused
  // imports, merges duplicates, and sorts the rest, applied as ONE transaction
  // through the normal onChange/autosave path. Scoped to TS/JS; a no-op (brief
  // notice) when imports are already organized or the buffer has none.
  const organizeImportsCmd = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    if (!intelligenceLanguage(language)) {
      setIntelNotice(t("document.capability.unavailable"));
      return;
    }
    const claim = captureEditorMutationClaim(
      view,
      language,
      documentGenerationRef.current,
      editorInteractionGenerationRef.current,
    );
    const svc = await getTsService();
    const live = viewRef.current;
    if (
      !live ||
      !editorMutationClaimIsCurrent(
        claim,
        live,
        languageRef.current,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      )
    ) {
      return;
    }
    if (!svc) {
      setIntelNotice(t("document.capability.unavailable"));
      return;
    }
    svc.markDirty();
    const edits = organizeImports(svc);
    if (edits.length === 0) {
      setIntelNotice(t("code.organizeImports.none"));
      return;
    }
    const docLen = live.state.doc.length;
    const changes = edits.map((edit) => {
      const from = Math.min(Math.max(edit.from, 0), docLen);
      const to = Math.min(Math.max(edit.to, from), docLen);
      return { from, to, insert: edit.insert };
    });
    live.dispatch({ changes, userEvent: "input.organizeImports" });
    live.focus();
  }, [language, getTsService, t]);

  // Open the inline rename prompt for the symbol at the current caret. We
  // pre-fill the existing identifier text by selecting the word under the caret
  // so the user can type a replacement immediately.
  const openRename = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!languageCan.rename) {
      setIntelNotice(t("document.capability.unavailable"));
      return;
    }
    const pos = view.state.selection.main.head;
    const word = view.state.wordAt(pos);
    const current = word ? view.state.sliceDoc(word.from, word.to) : "";
    setRenamePos(pos);
    setRenameValue(current.slice(0, MAX_CODE_IDENTIFIER_CHARS));
    setRenameError(null);
    setRenameOpen(true);
    requestAnimationFrame(() => focusPromptInput(renameInputRef.current));
  }, [languageCan.rename, t]);
  useLayoutEffect(() => {
    if (renameOpen) focusPromptInput(renameInputRef.current);
  }, [renameOpen]);

  // Apply the rename: compute every occurrence span via the LanguageService and
  // dispatch them as a SINGLE transaction (one undo step). Validates the new
  // name first; rejects illegal identifiers and "no symbol here".
  const applyRename = useCallback(async () => {
    const requestView = viewRef.current;
    if (!requestView) return;
    const requestedDocument = requestView.state.doc;
    const requestedSource = requestedDocument.toString();
    const requestedLanguage = language;
    // Every offset returned below is in the coordinate space of THIS immutable
    // document snapshot. A provider/kernel/compiler can resolve much later; if
    // the view, text, or language changed meanwhile, applying those offsets to
    // the live document would splice unrelated user input. Treat the whole
    // rename as a versioned edit: exact snapshot match or no write at all.
    const currentRequestView = (): EditorView | null => {
      const live = viewRef.current;
      return live === requestView &&
        live.state.doc === requestedDocument &&
        languageRef.current === requestedLanguage
        ? live
        : null;
    };
    // What counts as a legal name is a fact about the LANGUAGE, and the two
    // rules below are JavaScript's and Python's. `isLegalIdentifier` carries
    // JavaScript's shape AND its keyword list, so applying it to a third
    // language refuses names that language allows (`class` is reserved in
    // JavaScript and ordinary in Go) while missing keywords it does have. A
    // provider therefore validates its own new name — see the Python one, which
    // rejects Python keywords and abandons the whole rename if any span stops
    // reading as the old name — and the editor checks only what is true
    // everywhere: a rename target is one word, not a phrase or a paste.
    const usesProviderRename =
      !intelligenceLanguage(language) && !isPythonEditor;
    if (usesProviderRename) {
      if (!/^\S+$/.test(renameValue)) {
        setRenameError(t("code.rename.invalid"));
        return;
      }
    } else {
      if (!isLegalIdentifier(renameValue)) {
        setRenameError(t("code.rename.invalid"));
        return;
      }
      // Refuse a reserved word as the new name — splicing `class`/`return`/`def`/…
      // would emit un-parseable source across the buffer (and sibling cells).
      const reserved = isPythonEditor ? PY_RESERVED_WORDS : JS_RESERVED_WORDS;
      if (reserved.has(renameValue)) {
        setRenameError(t("code.rename.invalid"));
        return;
      }
    }
    // No-op rename (same name): close silently instead of running a rename that
    // could still rewrite bytes (e.g. expand object-shorthand `{ x }` -> `{ x: x }`,
    // possibly in another cell) for no actual change.
    if (identifierAt(requestedSource, renamePos) === renameValue) {
      setRenameOpen(false);
      focusView();
      return;
    }
    // Any language served only by a registered provider. The provider owns the
    // whole judgement — legality in its own language, and whether every span
    // still reads as the old name — and reports NO edits rather than some when
    // it cannot vouch for all of them. Half a rename corrupts a buffer more
    // quietly than none.
    if (usesProviderRename) {
      const edits = await askProvider("rename", (provider) =>
        provider.rename!({
          text: requestedSource,
          offset: renamePos,
          newName: renameValue,
          language: requestedLanguage,
        }),
      );
      const live = currentRequestView();
      if (!live) return;
      const inBuffer = (edits ?? []).filter(
        (edit) => edit.bufferId === null && edit.span.to > edit.span.from,
      );
      if (inBuffer.length === 0) {
        setRenameError(t("code.rename.noSymbol"));
        return;
      }
      // One transaction = one undoable edit covering all occurrences. CM6 wants
      // them sorted and non-overlapping; a provider that returned overlapping
      // spans would throw here, so they are rejected instead.
      const sorted = [...inBuffer].sort((a, b) => a.span.from - b.span.from);
      const overlapping = sorted.some(
        (edit, index) => index > 0 && edit.span.from < sorted[index - 1].span.to,
      );
      if (overlapping) {
        setRenameError(t("code.rename.noSymbol"));
        return;
      }
      const end = live.state.doc.length;
      if (sorted[sorted.length - 1].span.to > end) {
        // Reject malformed provider output even though the exact document
        // snapshot is still current; an out-of-range edit is never safe.
        setRenameError(t("code.rename.noSymbol"));
        return;
      }
      live.dispatch({
        changes: sorted.map((edit) => ({
          from: edit.span.from,
          to: edit.span.to,
          insert: edit.newText,
        })),
        userEvent: "input.rename",
      });
      setRenameOpen(false);
      live.focus();
      return;
    }
    // Python path: ask the LIVE kernel via jedi (worker `references` op) for every
    // in-buffer usage of the symbol, then rewrite each occurrence in one undoable
    // transaction (right-to-left so earlier offsets stay valid). Mirrors the TS
    // path's UI + validity check exactly; only the edit source differs.
    if (isPythonEditor) {
      // Cross-cell first: a Python multi-buffer host can rename the symbol across EVERY
      // cell of the shared scope (it's safe-by-construction — aborts unless every
      // span matches the symbol). If it handled the rename we're done; otherwise
      // fall through to the single-cell jedi rename below.
      if (crossFileRenameRef.current) {
        let handled: boolean | "cancelled";
        try {
          handled = await crossFileRenameRef.current(
            renamePos,
            renameValue,
          );
        } catch {
          if (currentRequestView()) {
            setRenameError(t("document.capability.unavailable"));
          }
          return;
        }
        if (!currentRequestView()) return;
        if (handled === "cancelled") {
          setRenameError(t("document.capability.unavailable"));
          return;
        }
        if (handled) {
          setRenameOpen(false);
          focusView();
          return;
        }
      }
      // Never boot Pyodide as a rename side effect: jedi answers against a live
      // kernel, and a multi-MB download is not something a rename should start.
      //
      // But SAY SO. This used to close the prompt without a word, and the state
      // it fires in is the ordinary one — a Python page that has been opened and
      // not yet run. The user had just typed a new name and pressed Enter; the
      // silence read as a broken editor, not as a precondition. Both sibling
      // branches of this function report; only this one was mute.
      if (!languageServices.capabilitiesFor(language).rename) {
        setRenameError(t("code.rename.needsKernel"));
        return;
      }
      const view = currentRequestView();
      if (!view) return;
      // The Python provider, not jedi's references directly. It adds the guard
      // this path never had: every span must read back as EXACTLY the old name,
      // and if one does not, the whole rename is abandoned. A jedi answer for a
      // buffer the user kept typing into would otherwise splice the new name
      // over whatever now sits at those offsets.
      const renameEditList = await askProvider("rename", (provider) =>
        provider.rename!({
          text: requestedSource,
          offset: renamePos,
          newName: renameValue,
          language: requestedLanguage,
        }),
      );
      // The worker round-trip is async; re-read the live ref and bail if the
      // editor unmounted — dispatching on a destroyed view throws.
      const live = currentRequestView();
      if (!live) return;
      const liveEnd = live.state.doc.length;
      const edits = (renameEditList ?? [])
        .filter(
          (edit) =>
            edit.bufferId === null &&
            edit.span.to > edit.span.from &&
            edit.span.to <= liveEnd,
        )
        // Right-to-left so each applied splice doesn't shift the next edit's offsets.
        .sort((a, b) => b.span.from - a.span.from);
      if (edits.length === 0) {
        setRenameError(t("code.rename.noSymbol"));
        return;
      }
      // One transaction = one undoable edit covering all occurrences.
      live.dispatch({
        changes: edits.map((edit) => ({
          from: edit.span.from,
          to: edit.span.to,
          insert: edit.newText,
        })),
        userEvent: "input.rename",
      });
      setRenameOpen(false);
      live.focus();
      return;
    }
    // Cross-file (cross-cell) rename first: when a host supplies it (a JS/TS
    // multi-buffer host), it rewrites EVERY occurrence across all cells in one undo step —
    // something the single buffer below can't reach. If it handled the rename
    // we're done; otherwise fall through to the in-buffer rename.
    if (crossFileRenameRef.current) {
      let handled: boolean | "cancelled";
      try {
        handled = await crossFileRenameRef.current(renamePos, renameValue);
      } catch {
        if (currentRequestView()) {
          setRenameError(t("document.capability.unavailable"));
        }
        return;
      }
      if (!currentRequestView()) return;
      if (handled === "cancelled") {
        setRenameError(t("document.capability.unavailable"));
        return;
      }
      if (handled) {
        setRenameOpen(false);
        focusView();
        return;
      }
    }
    const svc = await getTsService();
    const view = currentRequestView();
    // `getTsService` is async (it dynamically imports the TS compiler), so the
    // view may have been torn down while we awaited. Re-read the live ref and
    // bail if the editor unmounted — dispatching on a destroyed view throws.
    if (!view) return;
    if (!svc) {
      // Keep the user's proposed name and the prompt visible. A failed lazy
      // service load is not a successful/cancelled rename, and the existing
      // alert makes the command retryable instead of silently disappearing.
      setRenameError(t("document.capability.unavailable"));
      return;
    }
    svc.markDirty();
    const edits = renameEdits(svc, renamePos, renameValue);
    if (edits.length === 0) {
      setRenameError(t("code.rename.noSymbol"));
      return;
    }
    // One transaction = one undoable edit covering all occurrences.
    view.dispatch({
      changes: edits.map((e) => ({ from: e.from, to: e.to, insert: e.insert })),
      userEvent: "input.rename",
    });
    setRenameOpen(false);
    view.focus();
  }, [
    renameValue,
    renamePos,
    getTsService,
    t,
    language,
    isPythonEditor,
    focusView,
    askProvider,
    languageServices,
  ]);

  // --- Format Document / Selection (VSCode parity) ---------------------------
  // Capability and transient request state stay separate. The effective value
  // is reported to every host entry, while the central runner repeats the
  // read-only/capability check so a racing imperative command cannot dispatch.
  const formatSupported = useMemo(
    () => canFormatLanguage(language) || providerFormat !== undefined,
    [language, providerFormat],
  );
  const canFormat = !effectiveReadOnly && formatSupported && !formatBusy;
  const canToggleComment =
    !effectiveReadOnly && languageSupportsComments(language);
  const organizeImportsAvailable =
    !effectiveReadOnly && Boolean(intelligenceLanguage(language));
  const inlayHintsAvailable =
    !lightweightMode && Boolean(intelligenceLanguage(language));
  const codeLensAvailable =
    !lightweightMode && Boolean(intelligenceLanguage(language));
  // The Compare affordance is offered only when the host wired a source provider
  // (a multi-buffer host with sibling code cells). Absent everywhere else, so the button +
  // keymap + panel render nothing and the editor is byte-for-byte unchanged.
  const canCompare =
    pinnedCompare !== undefined ||
    (compareSourceCount === undefined
      ? Boolean(compareSources)
      : compareSourceCount > 0 ||
        (Boolean(compareSources) && clipboardCapabilities.compareText));

  // Live mirror of the current language. doFormat captures `language` at
  // invocation, but a language switch DURING the async format would not update
  // that closed-over value — we read the current language from this ref after
  // the await to detect (and discard) a now-stale result.
  const languageRef = useRef(language);
  languageRef.current = language;

  const runFormat = useCallback(
    (requestedScope: "document" | "selection"): Promise<FormatAttemptResult> => {
      const active = activeFormatRequestRef.current;
      if (active) return active.promise;

      const view = viewRef.current;
      if (!view || effectiveReadOnly || !formatSupported) {
        if (view) {
          setFormatFeedback({
            kind: "error",
            message: formatSupported
              ? t("document.capability.unavailable")
              : t("code.formatUnsupported"),
          });
        }
        return Promise.resolve("unavailable");
      }

      const requestedSelection = view.state.selection;
      const effectiveScope =
        requestedScope === "selection" && !requestedSelection.main.empty
          ? "selection"
          : "document";
      const requestedDoc = view.state.doc.toString();
      const from = requestedSelection.main.from;
      const to = requestedSelection.main.to;
      const requestedText =
        effectiveScope === "selection"
          ? requestedDoc.slice(from, to)
          : requestedDoc;
      const claim = captureEditorMutationClaim(
        view,
        language,
        documentGenerationRef.current,
        editorInteractionGenerationRef.current,
      );
      const requestId = formatRequestIdRef.current + 1;
      formatRequestIdRef.current = requestId;
      const controller = new AbortController();
      formatBusyRef.current = true;
      setFormatBusy(true);
      setFormatFeedback({
        kind: "status",
        message: t("code.console.busy"),
      });

      const requestIsCurrent = (): EditorView | null => {
        const live = viewRef.current;
        if (
          formatRequestIdRef.current !== requestId ||
          controller.signal.aborted ||
          readOnlyRef.current ||
          !live ||
          !editorMutationClaimIsCurrent(
            claim,
            live,
            languageRef.current,
            documentGenerationRef.current,
            editorInteractionGenerationRef.current,
          ) ||
          live.state.doc.toString() !== requestedDoc ||
          !live.state.selection.eq(requestedSelection)
        ) {
          return null;
        }
        return live;
      };

      let authoritySettled = false;
      let resolveAuthority!: (result: FormatAttemptResult) => void;
      const authorityPromise = new Promise<FormatAttemptResult>((resolve) => {
        resolveAuthority = resolve;
      });
      const settleAuthority = (result: FormatAttemptResult) => {
        if (authoritySettled) return;
        authoritySettled = true;
        resolveAuthority(result);
      };

      const physicalPromise = (async (): Promise<FormatAttemptResult> => {
        try {
          const receipt = await formatCodeWithReceipt(
            requestedText,
            claim.language,
            providerFormat,
            { signal: controller.signal },
          );
          const live = requestIsCurrent();
          if (!live) {
            if (formatRequestIdRef.current === requestId) {
              setFormatFeedback(null);
            }
            return "stale";
          }
          if (!receipt.ok) {
            setFormatFeedback({
              kind: "error",
              message: t("document.capability.unavailable"),
            });
            return "failed";
          }

          if (effectiveScope === "document") {
            const inserted = live.state.toText(receipt.formatted);
            if (inserted.eq(live.state.doc)) {
              setFormatFeedback({
                kind: "status",
                message: t("agentActivity.diffPreview.noChange"),
              });
              return "unchanged";
            }
            live.dispatch({
              changes: {
                from: 0,
                to: live.state.doc.length,
                insert: inserted,
              },
              selection: EditorSelection.cursor(
                Math.min(requestedSelection.main.head, inserted.length),
              ),
              userEvent: "input.format",
            });
          } else {
            let normalized = live.state.toText(receipt.formatted).toString();
            // Whole-text formatters commonly append one logical newline. A
            // selected mid-line fragment keeps its original line boundary.
            if (normalized.endsWith("\n") && !requestedText.endsWith("\n")) {
              normalized = normalized.slice(0, -1);
            }
            const inserted = live.state.toText(normalized);
            const spliced = spliceFormattedRange(
              requestedDoc,
              from,
              to,
              inserted.toString(),
            );
            if (!spliced) {
              setFormatFeedback({
                kind: "status",
                message: t("agentActivity.diffPreview.noChange"),
              });
              return "unchanged";
            }
            live.dispatch({
              changes: { from, to, insert: inserted },
              selection: EditorSelection.range(
                spliced.selectionStart,
                spliced.selectionEnd,
              ),
              userEvent: "input.format",
            });
          }
          live.focus();
          setFormatFeedback(null);
          return "applied";
        } catch {
          if (requestIsCurrent()) {
            setFormatFeedback({
              kind: "error",
              message: t("document.capability.unavailable"),
            });
            return "failed";
          }
          return "stale";
        } finally {
          if (formatRequestIdRef.current === requestId) {
            activeFormatRequestRef.current = null;
            formatBusyRef.current = false;
            setFormatBusy(false);
          }
        }
      })();
      // A provider is allowed to ignore AbortSignal. Keep consuming its physical
      // Promise under the request-id guards above, but expose a separate authority
      // receipt that retirement can settle immediately. Format-on-save can then
      // continue with the newest raw draft instead of waiting forever for work
      // that no longer owns this editor.
      void physicalPromise.then(settleAuthority, () =>
        settleAuthority("failed"),
      );
      activeFormatRequestRef.current = {
        id: requestId,
        scope: effectiveScope,
        controller,
        promise: authorityPromise,
        retire: () => settleAuthority("stale"),
      };
      return authorityPromise;
    },
    [effectiveReadOnly, formatSupported, language, providerFormat, t],
  );

  const doFormat = useCallback(
    () => runFormat("document"),
    [runFormat],
  );

  const formatSelection = useCallback(
    () => runFormat("selection"),
    [runFormat],
  );

  // Transform Case (VSCode "Transform to Uppercase/Lowercase/Title Case"): apply
  // a pure case transform to EACH selection range; with an empty selection,
  // transform the word under the caret instead (VSCode behaviour). Multi-cursor
  // aware via `changeByRange` — every range is transformed in ONE transaction
  // (one undo step) and the resulting selections cover the transformed text. The
  // case math is the pure, unit-tested {@link transformCase} / {@link wordRangeAt}.
  const transformSelectionCase = useCallback((transform: CaseTransform) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    let anyChange = false;
    const tr = view.state.changeByRange((range) => {
      // Resolve the range to act on: the selection, or the word at the caret.
      const span = range.empty ? wordRangeAt(doc, range.head) : range;
      const from = span.from;
      const to = span.to;
      if (from === to) {
        // Nothing to transform (caret not on a word) — leave the range as-is.
        return { range };
      }
      const original = doc.slice(from, to);
      const replaced = transformCase(original, transform);
      if (replaced === original) {
        // Already in the target case — keep the original selection untouched.
        return { range: EditorSelection.range(from, to) };
      }
      anyChange = true;
      return {
        changes: { from, to, insert: replaced },
        range: EditorSelection.range(from, from + replaced.length),
      };
    });
    if (!anyChange) return; // total no-op → no transaction, no undo entry
    view.dispatch(tr, { userEvent: "input.transformCase" });
    view.focus();
  }, []);

  // Sort Lines (VSCode "Sort Lines Ascending/Descending"): sort the lines spanned
  // by the selection, or the WHOLE document when there is no selection (VSCode
  // parity). Stable + case-insensitive (the VSCode default). The selected-line
  // span is widened to whole lines so a partial selection still sorts complete
  // lines; the sorted block replaces exactly that span in ONE transaction (one
  // undo step). The line-array sort is the pure, unit-tested {@link sortLines}.
  const sortSelectedLines = useCallback((direction: 1 | -1) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const sel = view.state.selection.main;
    // Widen to whole lines. With an empty selection, sort the entire document.
    const { fromLine, toLine } = selectedWholeLines(doc, sel);
    const blockFrom = fromLine.from;
    const blockTo = toLine.to;
    const block = doc.sliceString(blockFrom, blockTo);
    // Need at least two lines to sort.
    if (!block.includes("\n")) return;
    const sorted = sortLines(block, direction);
    if (sorted === block) return; // already sorted → no-op
    view.dispatch({
      changes: { from: blockFrom, to: blockTo, insert: sorted },
      selection: EditorSelection.range(blockFrom, blockFrom + sorted.length),
      userEvent: "input.sortLines",
    });
    view.focus();
  }, []);

  // Trim Trailing Whitespace (VSCode "Files: Trim Trailing Whitespace" command).
  // Strips end-of-line whitespace from EVERY line in ONE transaction (one undo
  // step). Valuable for the non-Prettier languages (Python / Shell / SQL) whose
  // Format path doesn't trim — for a Prettier language Format already removes it.
  // The whole-doc replacement is anchored at offset 0; we map the caret through
  // the change so it stays put, and no-op (no transaction, no undo entry) when the
  // buffer already has no trailing whitespace. The transform itself is the pure,
  // unit-tested {@link trimTrailingWhitespace}.
  const trimTrailing = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const original = view.state.doc.toString();
    const trimmed = trimTrailingWhitespace(original);
    if (trimmed === original) return; // nothing to strip → no-op
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: 0, to: original.length, insert: trimmed },
      // Map the caret through the replacement so it lands at the equivalent
      // position (clamped if it sat inside a now-removed trailing run).
      selection: EditorSelection.cursor(Math.min(head, trimmed.length)),
      userEvent: "input.trimTrailingWhitespace",
    });
    view.focus();
  }, []);

  // --- Configurable indentation commands (VSCode parity) --------------------
  // Set the editor's ACTIVE indent style (what new lines / Tab insert + the tab
  // display width). Updates the React state (so a config rebuild reproduces it)
  // AND reconfigures the live Compartment immediately so the change takes effect
  // without waiting for a re-render. Does NOT touch existing text — only how
  // subsequent indentation is produced (matching VSCode "Indent Using …").
  const applyIndentStyle = useCallback(
    (next: { useTabs: boolean; width: number }) => {
      const width = INDENT_WIDTHS.includes(next.width as 2 | 4 | 8)
        ? next.width
        : DEFAULT_INDENT_WIDTH;
      const normalized = { useTabs: next.useTabs, width };
      setIndentStyle(normalized);
      const view = viewRef.current;
      if (view) {
        view.dispatch({
          effects: indentCompartment.reconfigure(
            indentExtensionFor(normalized),
          ),
        });
      }
    },
    [indentCompartment],
  );
  // "Indent Using Spaces" / "Indent Using Tabs": flip the unit, keeping the
  // current width. From the palette these read the live width so e.g. a 4-wide
  // tab file that switches to spaces keeps width 4.
  const setIndentUsingSpaces = useCallback(() => {
    applyIndentStyle({ useTabs: false, width: indentStyle.width });
  }, [applyIndentStyle, indentStyle.width]);
  const setIndentUsingTabs = useCallback(() => {
    applyIndentStyle({ useTabs: true, width: indentStyle.width });
  }, [applyIndentStyle, indentStyle.width]);
  // Set the tab size / spaces-per-indent width (2 / 4 / 8), keeping the unit.
  const setTabWidth = useCallback(
    (width: number) => {
      applyIndentStyle({ useTabs: indentStyle.useTabs, width });
    },
    [applyIndentStyle, indentStyle.useTabs],
  );

  // "Convert Indentation to Spaces" / "Convert Indentation to Tabs": rewrite the
  // WHOLE buffer's leading whitespace from its current style to the target, in
  // ONE transaction (one undo step), then ALSO switch the active indent style so
  // new lines follow suit. The conversion measures the existing indent at the
  // current width and re-emits it in the target style (pure, unit-tested
  // {@link convertIndentation}); no-ops (no transaction) when nothing changes.
  const convertIndentationTo = useCallback(
    (useTabs: boolean) => {
      const view = viewRef.current;
      if (!view) return;
      const original = view.state.doc.toString();
      const width = indentStyle.width;
      const converted = convertIndentation(
        original,
        { useTabs: indentStyle.useTabs, width },
        { useTabs, width },
      );
      // Switch the active style regardless, so subsequent new lines match.
      applyIndentStyle({ useTabs, width });
      if (converted === original) return; // indentation already in target style
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: 0, to: original.length, insert: converted },
        selection: EditorSelection.cursor(Math.min(head, converted.length)),
        userEvent: "input.convertIndentation",
      });
      view.focus();
    },
    [applyIndentStyle, indentStyle.useTabs, indentStyle.width],
  );

  // --- Fold All / Unfold All (VSCode parity, discoverable in the palette) ----
  // Thin wrappers over CM6's native foldAll/unfoldAll commands (bound only to the
  // obscure Ctrl-Alt-[ / ] by basicSetup's foldKeymap). They operate on the live
  // view and re-focus it.
  const foldAllCmd = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    foldAll(view);
    view.focus();
  }, []);
  const unfoldAllCmd = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    unfoldAll(view);
    view.focus();
  }, []);

  // --- Fold by Level (VSCode "Fold Level N", Ctrl+K Ctrl+1..7) ---------------
  // Collapse every foldable region whose NESTING LEVEL equals N. CM6 reports the
  // foldable range per line (`foldable`) but not its depth, so we gather all
  // distinct foldable ranges, rank them by containment (the pure, unit-tested
  // {@link foldRangesAtLevel}), then — like VSCode — unfold everything first and
  // fold exactly the ranges at the chosen level in ONE transaction. No-op (after
  // the unfold) when the document has no regions at that level.
  const foldLevel = useCallback((level: number) => {
    const view = viewRef.current;
    if (!view) return;
    const state = view.state;
    const doc = state.doc;
    // Collect the foldable range opened on each line (deduped downstream).
    const ranges: { from: number; to: number }[] = [];
    for (let n = 1; n <= doc.lines; n += 1) {
      const line = doc.line(n);
      const range = foldable(state, line.from, line.to);
      if (range) ranges.push({ from: range.from, to: range.to });
    }
    const targets = foldRangesAtLevel(ranges, level);
    // VSCode "Fold Level N" first unfolds, then folds the chosen level — so the
    // command is idempotent and always reaches the same visible state.
    unfoldAll(view);
    if (targets.length > 0) {
      view.dispatch({
        effects: targets.map((rangeEntry) =>
          foldEffect.of({ from: rangeEntry.from, to: rangeEntry.to }),
        ),
      });
    }
    view.focus();
  }, []);

  // --- Expand / Shrink Selection (VSCode Shift+Alt+Right / Shift+Alt+Left) ---
  // Expand grows the selection to the enclosing syntax node (CM6
  // `selectParentSyntax`), remembering the pre-expand range on a stack so Shrink
  // can pop back to it. Both go through `selfSelectingRef` so the selection-change
  // listener doesn't clear the history on our own programmatic move. The stack
  // math is the pure, unit-tested {@link pushExpandHistory}/{@link popShrinkHistory}.
  const expandSelectionCmd = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const before = view.state.selection.main;
    selfSelectingRef.current = true;
    const handled = selectParentSyntax({
      state: view.state,
      dispatch: (tr) => view.dispatch(tr),
    });
    selfSelectingRef.current = false;
    if (handled) {
      // Record the range we expanded FROM so a later shrink returns to it.
      expandHistoryRef.current = pushExpandHistory(expandHistoryRef.current, {
        anchor: before.anchor,
        head: before.head,
      });
    }
    view.focus();
  }, []);
  const shrinkSelectionCmd = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.selection.main;
    const result = popShrinkHistory(expandHistoryRef.current, {
      anchor: current.anchor,
      head: current.head,
    });
    if (!result) return; // nothing smaller to shrink back to
    expandHistoryRef.current = result.stack;
    selfSelectingRef.current = true;
    view.dispatch({
      selection: EditorSelection.range(result.range.anchor, result.range.head),
      userEvent: "select",
    });
    selfSelectingRef.current = false;
    view.focus();
  }, []);

  // --- Change All Occurrences (VSCode Ctrl+F2) ------------------------------
  // Select EVERY whole-word occurrence of the word under the caret (no prior
  // selection needed) as a multi-cursor selection, so an immediate edit changes
  // them all at once. The match ranges are the pure, unit-tested
  // {@link wordOccurrences}; the primary cursor stays on the occurrence the caret
  // was in. No-op when the caret is not on a word or there is no match.
  const changeAllOccurrences = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    const head = view.state.selection.main.head;
    // The word under the caret (or the current single-line selection's text).
    const sel = view.state.selection.main;
    const wordSpan = sel.empty
      ? wordRangeAt(docText, head)
      : { from: sel.from, to: sel.to };
    const word = docText.slice(wordSpan.from, wordSpan.to);
    if (!word) return;
    const matches = wordOccurrences(docText, word);
    if (matches.length === 0) return;
    // Keep the caret's own occurrence primary so the view doesn't jump away.
    let primary = matches.findIndex((m) => head >= m.from && head <= m.to);
    if (primary < 0) primary = 0;
    const selection = EditorSelection.create(
      matches.map((m) => EditorSelection.range(m.from, m.to)),
      primary,
    );
    view.dispatch({ selection, userEvent: "select" });
    view.focus();
  }, []);

  // --- Add Cursors to Line Ends (VSCode Shift+Alt+I) ------------------------
  // Drop a collapsed caret at the END of every line touched by the current
  // selection(s). Positions come from the pure, unit-tested
  // `lineEndCursorPositions` (sorted + deduped); a single collapsed caret seeds
  // one cursor at its own line end (a no-op move), so the gesture is only
  // meaningful with a multi-line selection — exactly like VSCode. The new
  // multi-caret selection's primary is the LAST end (the one nearest the
  // original selection head's direction), keeping the viewport stable.
  const addCursorsToLineEnds = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    const ranges = view.state.selection.ranges.map((r) => ({
      from: r.from,
      to: r.to,
    }));
    const ends = lineEndCursorPositions(docText, ranges);
    if (ends.length === 0) return;
    const selection = EditorSelection.create(
      ends.map((pos) => EditorSelection.cursor(pos)),
      ends.length - 1,
    );
    view.dispatch({ selection, userEvent: "select" });
    view.focus();
  }, []);

  // --- Add Cursor Above / Below, Add Next Occurrence (VS Code Selection menu)
  // The keyboard reaches these through CM6's own Mod-Alt-ArrowUp/Down (the
  // default keymap) and our Mod-d; the ribbon and the palette call the same
  // commands so a touch screen, whose soft keyboard has no Alt or arrow
  
  // Above/below add a caret at the same column on the neighbouring line of
  // every selection; next occurrence selects the word at the caret first,
  // then each further match of the selection.
  const addCursorOnAdjacentLine = useCallback(
    (direction: "above" | "below") => {
      const view = viewRef.current;
      if (!view) return;
      (direction === "above" ? addCursorAbove : addCursorBelow)(view);
      view.focus();
    },
    [],
  );
  const addNextOccurrence = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    selectNextOccurrence(view);
    view.focus();
  }, []);

  // --- Join Lines (VSCode Ctrl+J) -------------------------------------------
  // Merge the selected lines (or the current line with the one below when the
  // selection is empty) into one, collapsing the seam whitespace to a single
  // space, in ONE transaction. The selection lands on the joined region. The
  // transform is the pure, unit-tested {@link joinLines}; no-op when there is
  // nothing to join (caret on the last line with no selection).
  const joinSelectedLines = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const result = joinLines(view.state.doc.toString(), sel.from, sel.to);
    if (!result) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.value },
      selection: EditorSelection.range(
        result.selectionStart,
        result.selectionEnd,
      ),
      userEvent: "input.joinLines",
    });
    view.focus();
  }, []);

  // --- Remove Duplicate Lines (VSCode "Delete Duplicate Lines") --------------
  // Drop duplicate lines from the SELECTED line block (or the whole document when
  // the selection is empty / single-caret), in ONE transaction. `"all"` keeps the
  // first occurrence of each distinct line and removes every later duplicate;
  // `"consecutive"` collapses only adjacent runs (Unix `uniq`). The selection
  // lands on the de-duplicated region. No-op (no transaction) when nothing was a
  // duplicate. The transform is the pure, unit-tested {@link removeDuplicateLines}.
  const removeDuplicateSelectedLines = useCallback((mode: DedupMode) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const doc = view.state.doc;
    // Operate on whole lines: when there's a real selection use the lines it
    // touches; otherwise dedupe the entire document.
    const { fromLine, toLine } = selectedWholeLines(doc, sel);
    const blockFrom = fromLine.from;
    const blockTo = toLine.to;
    const block = doc.sliceString(blockFrom, blockTo);
    const next = removeDuplicateLines(block, mode);
    if (next === block) return; // nothing duplicated → no-op
    view.dispatch({
      changes: { from: blockFrom, to: blockTo, insert: next },
      selection: EditorSelection.range(blockFrom, blockFrom + next.length),
      userEvent: "input.removeDuplicateLines",
    });
    view.focus();
  }, []);

  // --- Move / Duplicate line(s) (VSCode Alt+↑/↓, Shift+Alt+↑/↓) ----------------
  // Shift the selected line block up/down (move) or insert a copy above/below
  // (duplicate), in ONE transaction, following the selection onto the result.
  // The transforms are the pure, unit-tested {@link moveLines}/{@link
  // duplicateLines}; move is a no-op at the document edge (returns null).
  const moveSelectedLines = useCallback((direction: -1 | 1) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const result = moveLines(
      {
        value: view.state.doc.toString(),
        selectionStart: sel.from,
        selectionEnd: sel.to,
      },
      direction,
    );
    if (!result) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.value },
      selection: EditorSelection.range(
        result.selectionStart,
        result.selectionEnd,
      ),
      userEvent: "move.line",
    });
    view.focus();
  }, []);

  const duplicateSelectedLines = useCallback((direction: -1 | 1) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const result = duplicateLines(
      {
        value: view.state.doc.toString(),
        selectionStart: sel.from,
        selectionEnd: sel.to,
      },
      direction,
    );
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.value },
      selection: EditorSelection.range(
        result.selectionStart,
        result.selectionEnd,
      ),
      userEvent: "input.duplicateLine",
    });
    view.focus();
  }, []);

  // --- Change line ending (VSCode "Change End of Line Sequence") -------------
  // A file host controls EOL as metadata because CodeMirror's Text model
  // normalizes separators to LF. Other hosts keep the historical text transform
  // so this remains a drop-in editor for multi-buffer host cells and tests.
  const convertEolTo = useCallback(
    (style: EolStyle) => {
      const view = viewRef.current;
      if (!view) return;
      if (onLineEndingChange) {
        if (style !== eol) onLineEndingChange(style);
        view.focus();
        return;
      }
      const original = view.state.doc.toString();
      const next = convertEol(original, style);
      if (next === original) return; // already in the target style → no-op
      const head = view.state.selection.main.head;
      view.dispatch({
        changes: { from: 0, to: original.length, insert: next },
        selection: EditorSelection.cursor(Math.min(head, next.length)),
        userEvent: "input.convertEol",
      });
      view.focus();
    },
    [eol, onLineEndingChange],
  );

  // Explicit save gesture (Cmd/Ctrl+S, VSCode muscle memory). When "Format on
  // save" is ON and the language has a formatter, pretty-print FIRST (reusing
  // doFormat, so the formatted text flows through the normal onChange/undo path
  // and the stale-result concurrency guard still applies), then flush the host's
  // autosave via onSave. The await resolves AFTER doFormat's dispatch has driven
  // onChange, so the host's pending draft already holds the formatted text when
  // we flush. An unsupported language / toggle-off / format error never blocks
  // the save: onSave still runs with the raw buffer. Mid-typing autosave is
  // untouched — this fires only on the explicit chord, never on a keystroke.
  //
  // Apply the final-newline save preference (VSCode files.insertFinalNewline /
  // trimFinalNewlines) to the live buffer in ONE transaction, mapping the caret
  // through the change. insertFinalNewline wins when both toggles are on. No-op
  // (no transaction) when the buffer is already in the target shape — so an
  // enabled toggle on a clean buffer adds nothing. The transform is the pure,
  // unit-tested {@link applyFinalNewline}.
  const applyFinalNewlineOnSave = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const mode: FinalNewlineMode | null = insertFinalNewlineRef.current
      ? "insert"
      : trimFinalNewlinesRef.current
        ? "trim"
        : null;
    if (!mode) return;
    const original = view.state.doc.toString();
    const next = applyFinalNewline(original, mode);
    if (next === original) return; // already in the target shape → no-op
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: 0, to: original.length, insert: next },
      selection: EditorSelection.cursor(Math.min(head, next.length)),
      userEvent: "input.finalNewline",
    });
  }, []);

  // Trim-trailing-whitespace-on-save runs AFTER any format: for a Prettier
  // language Format already removed it (so the trim is an idempotent no-op), and
  // for the non-Prettier languages (Python / Shell / SQL) the format no-ops and
  // this is what actually strips the whitespace. `trimTrailing` itself no-ops
  // when the buffer is already clean, so an enabled toggle on a clean buffer adds
  // no transaction. The final-newline normalization runs LAST (after trailing
  // whitespace is gone) so the EOF newline reflects the trimmed last line. All
  // sub-toggles default OFF, so the save path is unchanged until opted in.
  const doSave = useCallback(async (trigger?: "shortcut") => {
    const ownerView = viewRef.current;
    if (!ownerView) return;
    const saveRequestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = saveRequestId;
    const ownerGeneration = saveOwnerGenerationRef.current;
    const ownerViewStateKey = viewStateKeyRef.current;
    const saveOwnerIsCurrent = () =>
      saveRequestIdRef.current === saveRequestId &&
      saveOwnerGenerationRef.current === ownerGeneration &&
      readOnlyRef.current === false &&
      viewStateKeyRef.current === ownerViewStateKey &&
      viewRef.current === ownerView;

    if (!saveOwnerIsCurrent()) return;
    if (
      shouldFormatOnSave({
        language,
        formatOnSave: formatOnSaveRef.current,
        providerAvailable: providerFormat !== undefined,
      })
    ) {
      // A range format is not a document-format-on-save receipt. Join it first,
      // then start the one whole-document request if this exact editor still owns
      // the save. A document request is already the required physical job, so the
      // central runner joins it directly.
      const active = activeFormatRequestRef.current;
      if (active?.scope === "selection") {
        await active.promise;
        if (!saveOwnerIsCurrent()) return;
      }
      await runFormat("document");
      if (!saveOwnerIsCurrent()) return;
    }
    // Formatter failure/staleness never traps a same-page explicit save: apply
    // the remaining current-only save transforms to the newest live draft and
    // flush it raw. Read-only mode cannot be mutated programmatically.
    if (!saveOwnerIsCurrent()) return;
    if (trimTrailingOnSaveRef.current) {
      trimTrailing();
    }
    if (!saveOwnerIsCurrent()) return;
    applyFinalNewlineOnSave();
    if (!saveOwnerIsCurrent()) return;
    onSaveRef.current?.(trigger);
  }, [
    language,
    providerFormat,
    runFormat,
    trimTrailing,
    applyFinalNewlineOnSave,
  ]);

  // Whether the current language supports TYPE-aware navigation (Go to Type
  // Definition / Go to Implementation) — TS/JS ONLY, since those are driven by the
  // TypeScript LanguageService and have no Python / cross-cell analogue here. The
  // palette + context-menu entries are gated on this so they are never offered for
  // a language where they would silently no-op (e.g. Python, which only supports
  // plain go-to-definition via jedi). Declared BEFORE the palette so it is in
  // scope where the palette command list reads it.
  const supportsTsNav = useMemo(() => {
    if (intelligenceLanguage(language)) return true;
    // A provider that answers either type-aware question earns the menu items
    // too — they were TypeScript's alone because nothing else could be asked,
    // not because they are a TypeScript idea.
    const capabilities = languageServices.capabilitiesFor(language);
    return Boolean(capabilities.typeDefinition || capabilities.implementation);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see providerDiagnostics.
  }, [language, languageServices, languageServicesPrimed]);

  // --- Command Palette (VSCode Ctrl/Cmd+Shift+P) ----------------------------
  // The static command catalogue: one entry per editor action ALREADY wired in
  // this component. Each `run` is a thin wrapper over an existing callback — the
  // palette adds no behaviour, it just makes the chord-and-button commands type-
  // able. Rebuilt only when one of those callbacks changes identity. Ordered for
  // discoverability (navigation/edit first, then view toggles, then zoom); the
  // filter below preserves this order within the matches.
  const formatUnavailableTitle = formatBusy
    ? t("code.console.busy")
    : !formatSupported
      ? t("code.formatUnsupported")
      : effectiveReadOnly
        ? t("document.capability.unavailable")
        : undefined;
  const readOnlyMutationTitle = effectiveReadOnly
    ? t("document.capability.unavailable")
    : undefined;
  type PaletteCommand = {
    id: string;
    label: string;
    source?: string;
    disabled?: boolean;
    busy?: boolean;
    title?: string;
    writeRequired?: boolean;
    run: () => void;
  };
  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "formatDocument",
        label: t("code.palette.cmd.formatDocument"),
        disabled: !canFormat,
        busy: formatBusy,
        title: formatUnavailableTitle,
        writeRequired: true,
        run: () => void doFormat(),
      },
      {
        id: "formatSelection",
        label: t("code.palette.cmd.formatSelection"),
        disabled: !canFormat,
        busy: formatBusy,
        title: formatUnavailableTitle,
        writeRequired: true,
        run: () => void formatSelection(),
      },
      {
        id: "transformUppercase",
        label: t("code.palette.cmd.transformUppercase"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => transformSelectionCase("upper"),
      },
      {
        id: "transformLowercase",
        label: t("code.palette.cmd.transformLowercase"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => transformSelectionCase("lower"),
      },
      {
        id: "transformTitlecase",
        label: t("code.palette.cmd.transformTitlecase"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => transformSelectionCase("title"),
      },
      {
        id: "sortLinesAscending",
        label: t("code.palette.cmd.sortLinesAscending"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => sortSelectedLines(1),
      },
      {
        id: "sortLinesDescending",
        label: t("code.palette.cmd.sortLinesDescending"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => sortSelectedLines(-1),
      },
      {
        id: "trimTrailingWhitespace",
        label: t("code.palette.cmd.trimTrailingWhitespace"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => trimTrailing(),
      },
      {
        id: "joinLines",
        label: t("code.palette.cmd.joinLines"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => joinSelectedLines(),
      },
      {
        id: "removeDuplicateLines",
        label: t("code.palette.cmd.removeDuplicateLines"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => removeDuplicateSelectedLines("all"),
      },
      {
        id: "removeConsecutiveDuplicateLines",
        label: t("code.palette.cmd.removeConsecutiveDuplicateLines"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => removeDuplicateSelectedLines("consecutive"),
      },
      {
        id: "foldAll",
        label: t("code.palette.cmd.foldAll"),
        run: () => foldAllCmd(),
      },
      {
        id: "unfoldAll",
        label: t("code.palette.cmd.unfoldAll"),
        run: () => unfoldAllCmd(),
      },
      ...[1, 2, 3, 4, 5, 6, 7].map((level) => ({
        id: `foldLevel${level}`,
        label: t("code.palette.cmd.foldLevel", { level }),
        run: () => foldLevel(level),
      })),
      {
        id: "expandSelection",
        label: t("code.palette.cmd.expandSelection"),
        run: () => expandSelectionCmd(),
      },
      {
        id: "shrinkSelection",
        label: t("code.palette.cmd.shrinkSelection"),
        run: () => shrinkSelectionCmd(),
      },
      {
        id: "changeAllOccurrences",
        label: t("code.palette.cmd.changeAllOccurrences"),
        run: () => changeAllOccurrences(),
      },
      {
        id: "addCursorsToLineEnds",
        label: t("code.palette.cmd.addCursorsToLineEnds"),
        run: () => addCursorsToLineEnds(),
      },
      {
        id: "addCursorAbove",
        label: t("code.palette.cmd.addCursorAbove"),
        run: () => addCursorOnAdjacentLine("above"),
      },
      {
        id: "addCursorBelow",
        label: t("code.palette.cmd.addCursorBelow"),
        run: () => addCursorOnAdjacentLine("below"),
      },
      {
        id: "addNextOccurrence",
        label: t("code.palette.cmd.addNextOccurrence"),
        run: () => addNextOccurrence(),
      },
      {
        id: "goToSymbol",
        label: t("code.palette.cmd.goToSymbol"),
        run: () =>
          void openSymbols(viewRef.current?.state.selection.main.head ?? 0),
      },
      { id: "find", label: t("code.palette.cmd.find"), run: () => openFind() },
      {
        id: "shortcuts",
        label: t("code.palette.cmd.shortcuts"),
        run: () => openShortcuts(),
      },
      {
        id: "goToLine",
        label: t("code.palette.cmd.goToLine"),
        run: () => openGoto(),
      },
      // Cursor navigation history (VSCode Go Back / Go Forward). Always listed —
      // they no-op when the stack can't move in that direction, matching VSCode.
      {
        id: "goBack",
        label: t("code.palette.cmd.goBack"),
        disabled: !navigationAvailability.canGoBack,
        title: !navigationAvailability.canGoBack
          ? t("document.capability.unavailable")
          : undefined,
        run: () => goBackNav(),
      },
      {
        id: "goForward",
        label: t("code.palette.cmd.goForward"),
        disabled: !navigationAvailability.canGoForward,
        title: !navigationAvailability.canGoForward
          ? t("document.capability.unavailable")
          : undefined,
        run: () => goForwardNav(),
      },
      {
        id: "goToDefinition",
        label: t("code.palette.cmd.goToDefinition"),
        disabled: !languageCan.definition,
        title: !languageCan.definition
          ? t("document.capability.unavailable")
          : undefined,
        run: () =>
          void goToDefinition(viewRef.current?.state.selection.main.head ?? 0),
      },
      // Type Definition / Implementation are TS/JS-only (TypeScript LanguageService);
      // listed only when the language supports them so they never silently no-op.
      ...(supportsTsNav
        ? [
            {
              id: "goToTypeDefinition",
              label: t("code.palette.cmd.goToTypeDefinition"),
              run: () =>
                void goToTypeDefinition(
                  viewRef.current?.state.selection.main.head ?? 0,
                ),
            },
            {
              id: "goToImplementation",
              label: t("code.palette.cmd.goToImplementation"),
              run: () =>
                void goToImplementation(
                  viewRef.current?.state.selection.main.head ?? 0,
                ),
            },
          ]
        : []),
      {
        id: "findReferences",
        label: t("code.palette.cmd.findReferences"),
        disabled: !languageCan.references || referenceResultBusy,
        busy: referenceResultBusy,
        title: referenceResultBusy
          ? t("code.console.busy")
          : !languageCan.references
            ? t("document.capability.unavailable")
            : undefined,
        run: () =>
          void findReferences(viewRef.current?.state.selection.main.head ?? 0),
      },
      ...(crossFileCallHierarchy
        ? [
            {
              id: "showIncomingCalls",
              label: t("code.palette.cmd.incomingCalls"),
              disabled: referenceResultBusy,
              busy: referenceResultBusy,
              title: referenceResultBusy
                ? t("code.console.busy")
                : undefined,
              run: () => void showCallHierarchy("incoming"),
            },
            {
              id: "showOutgoingCalls",
              label: t("code.palette.cmd.outgoingCalls"),
              disabled: referenceResultBusy,
              busy: referenceResultBusy,
              title: referenceResultBusy
                ? t("code.console.busy")
                : undefined,
              run: () => void showCallHierarchy("outgoing"),
            },
          ]
        : []),
      {
        id: "peekDefinition",
        label: t("code.palette.cmd.peekDefinition"),
        disabled: !languageCan.definition || referenceResultBusy,
        busy: referenceResultBusy,
        title: referenceResultBusy
          ? t("code.console.busy")
          : !languageCan.definition
            ? t("document.capability.unavailable")
            : undefined,
        run: () =>
          void peekDefinition(viewRef.current?.state.selection.main.head ?? 0),
      },
      {
        id: "peekReferences",
        label: t("code.palette.cmd.peekReferences"),
        disabled: !languageCan.references || referenceResultBusy,
        busy: referenceResultBusy,
        title: referenceResultBusy
          ? t("code.console.busy")
          : !languageCan.references
            ? t("document.capability.unavailable")
            : undefined,
        run: () =>
          void peekReferences(viewRef.current?.state.selection.main.head ?? 0),
      },
      {
        id: "showHover",
        label: t("code.palette.cmd.showHover"),
        run: () => showHoverAtCaret(),
      },
      // Listed only where a rename can actually happen. This was unconditional
      // before, so SQL and every other unserved language carried a Rename entry
      // that silently did nothing when chosen.
      ...(languageCan.rename
        ? [
            {
              id: "rename",
              label: t("code.palette.cmd.rename"),
              disabled: effectiveReadOnly,
              title: readOnlyMutationTitle,
              writeRequired: true,
              run: () => openRename(),
            },
          ]
        : []),
      {
        id: "quickFix",
        label: t("code.palette.cmd.quickFix"),
        disabled: effectiveReadOnly || !languageCan.codeActions,
        title:
          readOnlyMutationTitle ??
          (!languageCan.codeActions
            ? t("document.capability.unavailable")
            : undefined),
        writeRequired: true,
        run: () => void openQuickFix(),
      },
      ...(crossFileRefactors
        ? [
            {
              id: "refactor",
              label: t("code.palette.cmd.refactor"),
              disabled: effectiveReadOnly,
              title: readOnlyMutationTitle,
              writeRequired: true,
              run: () => void openRefactor(),
            },
          ]
        : []),
      {
        id: "organizeImports",
        label: t("code.palette.cmd.organizeImports"),
        disabled: !organizeImportsAvailable,
        title: !organizeImportsAvailable
          ? t("document.capability.unavailable")
          : undefined,
        writeRequired: true,
        run: () => void organizeImportsCmd(),
      },
      {
        id: "toggleProblems",
        label: t("code.palette.cmd.toggleProblems"),
        run: () => toggleProblems(),
      },
      {
        id: "toggleOutline",
        label: t("code.palette.cmd.toggleOutline"),
        run: () => setOutlineOpen((v) => !v),
      },
      ...(isMarkdownBuffer
        ? [
            {
              id: "toggleMarkdownPreview",
              label: t("code.palette.cmd.toggleMarkdownPreview"),
              run: toggleMarkdownPreview,
            },
          ]
        : []),
      {
        id: "toggleMinimap",
        label: t("code.palette.cmd.toggleMinimap"),
        disabled: lightweightMode,
        title: lightweightMode ? performanceCopy.title : undefined,
        run: () => toggleMinimap(),
      },
      {
        id: "toggleStickyScroll",
        label: t("code.palette.cmd.toggleStickyScroll"),
        disabled: lightweightMode,
        title: lightweightMode ? performanceCopy.title : undefined,
        run: () => toggleStickyScroll(),
      },
      {
        id: "toggleWordWrap",
        label: t("code.palette.cmd.toggleWordWrap"),
        run: () => toggleWordWrap(),
      },
      {
        id: "toggleWhitespace",
        label: t("code.palette.cmd.toggleWhitespace"),
        run: () => toggleRenderWhitespace(),
      },
      {
        id: "toggleBracketColors",
        label: t("code.palette.cmd.toggleBracketColors"),
        run: () => toggleBracketColors(),
      },
      {
        id: "toggleIndentGuides",
        label: t("code.palette.cmd.toggleIndentGuides"),
        run: () => toggleIndentGuides(),
      },
      {
        id: "toggleInlayHints",
        label: t("code.palette.cmd.toggleInlayHints"),
        disabled: !inlayHintsAvailable,
        title: !inlayHintsAvailable
          ? lightweightMode
            ? performanceCopy.title
            : t("document.capability.unavailable")
          : undefined,
        run: () => toggleInlayHints(),
      },
      {
        id: "toggleCodeLens",
        label: t("code.palette.cmd.toggleCodeLens"),
        disabled: !codeLensAvailable,
        title: !codeLensAvailable
          ? lightweightMode
            ? performanceCopy.title
            : t("document.capability.unavailable")
          : undefined,
        run: () => toggleCodeLens(),
      },
      {
        id: "toggleFormatOnSave",
        label: t("code.palette.cmd.toggleFormatOnSave"),
        run: () => toggleFormatOnSave(),
      },
      {
        id: "toggleTrimTrailingOnSave",
        label: t("code.palette.cmd.toggleTrimTrailingOnSave"),
        run: () => toggleTrimTrailingOnSave(),
      },
      {
        id: "toggleInsertFinalNewline",
        label: t("code.palette.cmd.toggleInsertFinalNewline"),
        run: () => toggleInsertFinalNewline(),
      },
      {
        id: "toggleTrimFinalNewlines",
        label: t("code.palette.cmd.toggleTrimFinalNewlines"),
        run: () => toggleTrimFinalNewlines(),
      },
      {
        id: "indentUsingSpaces",
        label: t("code.palette.cmd.indentUsingSpaces"),
        run: () => setIndentUsingSpaces(),
      },
      {
        id: "indentUsingTabs",
        label: t("code.palette.cmd.indentUsingTabs"),
        run: () => setIndentUsingTabs(),
      },
      ...INDENT_WIDTHS.map((width) => ({
        id: `tabSize${width}`,
        label: t("code.palette.cmd.tabSize", { width }),
        run: () => setTabWidth(width),
      })),
      {
        id: "convertIndentToSpaces",
        label: t("code.palette.cmd.convertIndentToSpaces"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => convertIndentationTo(false),
      },
      {
        id: "convertIndentToTabs",
        label: t("code.palette.cmd.convertIndentToTabs"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => convertIndentationTo(true),
      },
      {
        id: "convertToLf",
        label: t("code.palette.cmd.convertToLf"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => convertEolTo("LF"),
      },
      {
        id: "convertToCrlf",
        label: t("code.palette.cmd.convertToCrlf"),
        disabled: effectiveReadOnly,
        title: readOnlyMutationTitle,
        writeRequired: true,
        run: () => convertEolTo("CRLF"),
      },
      {
        id: "zoomIn",
        label: t("code.palette.cmd.zoomIn"),
        run: () => zoomIn(),
      },
      {
        id: "zoomOut",
        label: t("code.palette.cmd.zoomOut"),
        run: () => zoomOut(),
      },
      {
        id: "zoomReset",
        label: t("code.palette.cmd.zoomReset"),
        run: () => zoomReset(),
      },
    ],
    [
      t,
      showHoverAtCaret,
      isMarkdownBuffer,
      canFormat,
      formatBusy,
      formatUnavailableTitle,
      effectiveReadOnly,
      readOnlyMutationTitle,
      doFormat,
      formatSelection,
      transformSelectionCase,
      sortSelectedLines,
      trimTrailing,
      openSymbols,
      openShortcuts,
      openFind,
      openGoto,
      goBackNav,
      goForwardNav,
      navigationAvailability.canGoBack,
      navigationAvailability.canGoForward,
      goToDefinition,
      languageCan.definition,
      languageCan.references,
      languageCan.codeActions,
      languageCan.rename,
      referenceResultBusy,
      supportsTsNav,
      goToTypeDefinition,
      goToImplementation,
      findReferences,
      crossFileCallHierarchy,
      showCallHierarchy,
      peekDefinition,
      peekReferences,
      openRename,
      openQuickFix,
      crossFileRefactors,
      openRefactor,
      organizeImportsCmd,
      organizeImportsAvailable,
      toggleProblems,
      toggleMarkdownPreview,
      toggleMinimap,
      toggleStickyScroll,
      toggleWordWrap,
      toggleRenderWhitespace,
      toggleBracketColors,
      toggleIndentGuides,
      toggleInlayHints,
      toggleCodeLens,
      lightweightMode,
      performanceCopy.title,
      inlayHintsAvailable,
      codeLensAvailable,
      toggleFormatOnSave,
      toggleTrimTrailingOnSave,
      toggleInsertFinalNewline,
      toggleTrimFinalNewlines,
      joinSelectedLines,
      removeDuplicateSelectedLines,
      foldAllCmd,
      unfoldAllCmd,
      foldLevel,
      expandSelectionCmd,
      shrinkSelectionCmd,
      changeAllOccurrences,
      addCursorsToLineEnds,
      addCursorOnAdjacentLine,
      addNextOccurrence,
      setIndentUsingSpaces,
      setIndentUsingTabs,
      setTabWidth,
      convertIndentationTo,
      convertEolTo,
      zoomIn,
      zoomOut,
      zoomReset,
    ],
  );

  /**
   * Commands contributed by installed extensions.
   *
   * They are appended after the built-ins and labelled with the extension they
   * came from, so an extension naming its command "Format Document" still reads
   * as its own. A command never receives the editor: it gets the restricted
   * host built from the permissions it declared, and a method it did not ask
   * for throws. See `code-command-contributions.ts`.
   *
   * Read as an external store, not at mount: extensions are installed and
   * uninstalled while editors are open, and a stale entry is a button that
   * throws.
   */
  const contributedCommands = useSyncExternalStore(
    subscribeToCodeCommands,
    readCodeCommands,
    readCodeCommands,
  );
  const extensionPaletteCommands = useMemo<PaletteCommand[]>(
    () =>
      contributedCommands
        .filter((command) => codeCommandAppliesTo(command, language))
        .map((command) => ({
          id: command.id,
          label: codeCommandPaletteLabel(command),
          source: command.extensionTitle,
          disabled:
            effectiveReadOnly &&
            command.permissions.includes("edit.insertText"),
          title:
            effectiveReadOnly &&
            command.permissions.includes("edit.insertText")
              ? t("document.capability.unavailable")
              : undefined,
          writeRequired: command.permissions.includes("edit.insertText"),
          run: () => {
            if (
              readOnlyRef.current &&
              command.permissions.includes("edit.insertText")
            ) {
              return;
            }
            const view = viewRef.current;
            if (!view) return;
            const invocationLanguage = languageRef.current;
            if (
              !codeCommandAppliesTo(command, invocationLanguage) ||
              !codeCommandRegistry.isRegistered(command)
            ) {
              return;
            }
            const invocationClaim = captureEditorMutationClaim(
              view,
              invocationLanguage,
              documentGenerationRef.current,
              editorInteractionGenerationRef.current,
            );
            const invocationSelection = view.state.selection.main;
            const invocationSelectionText = view.state.sliceDoc(
              invocationSelection.from,
              invocationSelection.to,
            );
            const invocationText = view.state.doc.toString();
            const invocationIsCurrent = (): boolean =>
              codeCommandRegistry.isRegistered(command) &&
              editorMutationClaimIsCurrent(
                invocationClaim,
                viewRef.current,
                languageRef.current,
                documentGenerationRef.current,
                editorInteractionGenerationRef.current,
              );
            const assertInvocationCurrent = (): void => {
              if (!invocationIsCurrent()) {
                throw new Error("code command invocation is no longer current");
              }
            };
            const reportFailure = (): void => {
              if (invocationIsCurrent()) {
                setIntelNotice(t("code.palette.extensionFailed"));
              }
            };
            const host = createCodeCommandHost(command, {
              language: invocationLanguage,
              readSelection: () => {
                assertInvocationCurrent();
                return invocationSelectionText;
              },
              readText: () => {
                assertInvocationCurrent();
                return invocationText;
              },
              replaceSelection: (text) => {
                assertInvocationCurrent();
                if (readOnlyRef.current) return;
                view.dispatch({
                  changes: {
                    from: invocationSelection.from,
                    to: invocationSelection.to,
                    insert: text,
                  },
                  selection: {
                    anchor: invocationSelection.from + text.length,
                  },
                  userEvent: "input.extension",
                });
              },
              openPanel: (panel) => {
                assertInvocationCurrent();
                if (panel === "problems") toggleProblems();
                // The outline is caret-relative, exactly as it is from the
                // palette's own entry — a command asks for the panel, not for a
                // position it has no way to know.
                else if (panel === "outline")
                  void openSymbols(invocationSelection.head);
                else if (panel === "find") openFind();
              },
            });
            try {
              const result = command.run(host);
              // A rejected promise from a contributed command is the
              // extension's failure, not the editor's; it must not surface as
              // an unhandled rejection that looks like ours.
              if (result && typeof result.then === "function") {
                void Promise.resolve(result).catch(reportFailure);
              }
            } catch {
              // Same for a synchronous throw — including the permission error a
              // command earns by reaching for something it never declared.
              reportFailure();
            }
          },
        })),
    [
      contributedCommands,
      effectiveReadOnly,
      language,
      openFind,
      openSymbols,
      t,
      toggleProblems,
    ],
  );

  const allPaletteCommands = useMemo(
    () => [...paletteCommands, ...extensionPaletteCommands],
    [paletteCommands, extensionPaletteCommands],
  );

  // Case-insensitive substring filter over the command labels, preserving the
  // catalogue order. An empty query lists every command.
  const filteredPaletteCommands = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return allPaletteCommands;
    return allPaletteCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(q),
    );
  }, [allPaletteCommands, paletteQuery]);
  // Installed extensions can each contribute a bounded catalogue, but the
  // workspace can install many extensions. Filter the complete catalogue first
  // so every command remains discoverable, then bound the mounted button list
  // so opening the palette cannot create thousands of DOM nodes at once.
  const visiblePaletteCommands = useMemo(
    () => filteredPaletteCommands.slice(0, CODE_COMMAND_PALETTE_RENDER_LIMIT),
    [filteredPaletteCommands],
  );
  const paletteCommandsTruncated =
    visiblePaletteCommands.length < filteredPaletteCommands.length;

  const openPalette = useCallback(() => {
    // Settings and Command Palette are mutually exclusive focus owners. Closing
    // Settings also cancels its pending entry-focus frame before the palette
    // input claims focus in the following layout effect.
    closeSettingsMenu(false);
    setPaletteQuery("");
    setPaletteActiveIndex(0);
    setPaletteOpen(true);
  }, [closeSettingsMenu]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    focusView();
  }, [focusView]);

  // Host Ribbon commands arrive from a parent effect. In that path a queued
  // animation frame can run before React commits the input, leaving the open
  // palette focused on the Ribbon tab (or body). Focus only after the panel's
  // DOM has committed so both Ribbon and keyboard entry points type
  // immediately into the same filter.
  useLayoutEffect(() => {
    if (!paletteOpen) return;
    paletteInputRef.current?.focus({ preventScroll: true });
  }, [paletteOpen]);

  // Host chrome (the standalone CodeWindow ribbon) dispatches the same view
  // commands as the editor's own toolbar/keymaps through one idempotent bridge.
  // A repeated request id is deliberately ignored so unrelated parent renders
  // can never flip a persisted preference twice.
  const lastViewCommandRequestRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      viewCommandRequest === undefined ||
      viewCommandRequest.requestId === lastViewCommandRequestRef.current
    ) {
      return;
    }
    lastViewCommandRequestRef.current = viewCommandRequest.requestId;
    onViewCommandRequestHandled?.(viewCommandRequest.requestId);
    if (
      viewStateKey !== undefined &&
      viewCommandRequest.viewStateKey !== viewStateKey
    ) {
      return;
    }
    switch (viewCommandRequest.command) {
      case "toggleOutline":
        setOutlineOpen((open) => !open);
        break;
      case "toggleProblems":
        toggleProblems();
        break;
      case "toggleCompare":
        if (compareOpen) closeCompare();
        else if (!openCompare()) {
          setIntelNotice(t("document.capability.unavailable"));
        }
        break;
      case "toggleMinimap":
        if (lightweightMode) {
          setIntelNotice(t("document.capability.unavailable"));
        } else {
          toggleMinimap();
        }
        break;
      case "toggleWordWrap":
        toggleWordWrap();
        break;
      case "toggleRenderWhitespace":
        toggleRenderWhitespace();
        break;
      case "toggleBracketColors":
        toggleBracketColors();
        break;
      case "toggleIndentGuides":
        toggleIndentGuides();
        break;
      case "toggleBracketPairGuides":
        toggleBracketPairGuides();
        break;
      case "toggleStickyScroll":
        if (lightweightMode) {
          setIntelNotice(t("document.capability.unavailable"));
        } else {
          toggleStickyScroll();
        }
        break;
      case "zoomOut":
        zoomOut();
        break;
      case "zoomReset":
        zoomReset();
        break;
      case "zoomIn":
        zoomIn();
        break;
      case "previewFontScale":
        if (viewCommandRequest.fontScale !== undefined) {
          previewFontScale(viewCommandRequest.fontScale);
        }
        break;
      case "commitFontScale":
        if (viewCommandRequest.fontScale !== undefined) {
          commitFontScale(viewCommandRequest.fontScale);
        }
        break;
      case "toggleSettings":
        toggleSettingsMenu();
        break;
      case "openCommandPalette":
        openPalette();
        break;
    }
  }, [
    closeCompare,
    commitFontScale,
    compareOpen,
    lightweightMode,
    openCompare,
    openPalette,
    onViewCommandRequestHandled,
    previewFontScale,
    toggleBracketColors,
    toggleBracketPairGuides,
    toggleIndentGuides,
    toggleMinimap,
    toggleProblems,
    toggleRenderWhitespace,
    toggleStickyScroll,
    toggleSettingsMenu,
    toggleWordWrap,
    t,
    viewCommandRequest,
    viewStateKey,
    zoomIn,
    zoomOut,
    zoomReset,
  ]);

  useEffect(() => {
    onViewStateChange?.({
      outlineOpen,
      problemsOpen,
      compareOpen,
      compareAvailable: canCompare,
      minimapOn: effectiveMinimapOn,
      minimapAvailable: !lightweightMode,
      wordWrapOn,
      renderWhitespaceOn,
      bracketColorsOn,
      indentGuidesOn,
      bracketPairGuidesOn,
      stickyScrollOn: effectiveStickyScrollOn,
      stickyScrollAvailable: !lightweightMode,
      fontScale,
      canZoomOut: fontScale > FONT_SCALE_MIN,
      canZoomIn: fontScale < FONT_SCALE_MAX,
      settingsOpen,
      commandPaletteOpen: paletteOpen,
    });
  }, [
    bracketColorsOn,
    bracketPairGuidesOn,
    canCompare,
    compareOpen,
    effectiveMinimapOn,
    effectiveStickyScrollOn,
    fontScale,
    indentGuidesOn,
    lightweightMode,
    onViewStateChange,
    outlineOpen,
    paletteOpen,
    problemsOpen,
    renderWhitespaceOn,
    settingsOpen,
    wordWrapOn,
  ]);

  // WPS-style Review ribbon bridge. The imperative MergeView remains encapsulated
  // in CodeCompareView; the host sends monotonic commands and receives only a
  // bounded state snapshot. Repeating a request id is always a no-op.
  const lastReviewCommandRequestRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      reviewCommandRequest === undefined ||
      reviewCommandRequest.requestId === lastReviewCommandRequestRef.current
    ) {
      return;
    }
    lastReviewCommandRequestRef.current = reviewCommandRequest.requestId;
    onReviewCommandRequestHandled?.(reviewCommandRequest.requestId);
    if (
      viewStateKey !== undefined &&
      reviewCommandRequest.viewStateKey !== viewStateKey
    ) {
      return;
    }
    let handled = false;
    switch (reviewCommandRequest.command) {
      case "previousChange":
        handled = compareHandleRef.current?.goToPreviousChunk() ?? false;
        break;
      case "nextChange":
        handled = compareHandleRef.current?.goToNextChunk() ?? false;
        break;
      case "acceptCurrent":
        if (compareThreeWayActive) {
          handled =
            compareHandleRef.current?.resolveActiveConflict("current") ??
            false;
        }
        break;
      // In a three-way review "accept" resolves the active conflict toward the
      // incoming side; nothing reaches the live buffer until the explicit
      // Apply, so a ribbon click can never overwrite the editor by itself.
      case "acceptChange":
        if (compareThreeWayActive) {
          handled =
            compareHandleRef.current?.resolveActiveConflict("incoming") ??
            false;
        } else {
          handled = compareHandleRef.current?.applyCurrentChunk() ?? false;
        }
        break;
      case "acceptBoth":
        if (compareThreeWayActive) {
          handled =
            compareHandleRef.current?.resolveActiveConflict("both") ?? false;
        }
        break;
      case "acceptAllChanges":
        if (compareThreeWayActive) {
          handled =
            compareHandleRef.current?.resolveAllConflicts("incoming") ??
            false;
        } else {
          handled = compareHandleRef.current?.applyAllChunks() ?? false;
        }
        break;
      case "applyResolvedMerge":
        if (compareThreeWayActive) {
          handled = compareHandleRef.current?.applyResolvedMerge() ?? false;
        }
        break;
    }
    if (!handled) {
      setIntelNotice(t("document.capability.unavailable"));
    }
  }, [
    compareThreeWayActive,
    onReviewCommandRequestHandled,
    reviewCommandRequest,
    t,
    viewStateKey,
  ]);

  useEffect(() => {
    const conflictCount = compareConflicts?.total ?? 0;
    onReviewStateChange?.({
      compareAvailable: canCompare,
      compareOpen,
      sourceSelected: compareWith !== null,
      threeWayActive: compareThreeWayActive,
      changeCount: compareChunkCount,
      canNavigate: compareThreeWayActive
        ? conflictCount > 0
        : compareChunkCount > 0,
      canApply:
        !effectiveReadOnly &&
        compareWith !== null &&
        !compareThreeWayActive &&
        compareChunkCount > 0,
      // Conflict decisions remain a local, non-mutating review operation even
      // in a read-only editor. Only the final merge application needs write
      // authority, which is reported independently below.
      canResolve: compareThreeWayActive && conflictCount > 0,
      canApplyMerge:
        compareThreeWayActive && Boolean(compareConflicts?.canApply),
    });
  }, [
    canCompare,
    compareChunkCount,
    compareConflicts,
    compareOpen,
    compareThreeWayActive,
    compareWith,
    onReviewStateChange,
    effectiveReadOnly,
  ]);

  // Whether the current language supports symbol navigation (Go to Definition /
  // Peek / Rename) — the same gate those commands use internally. The context
  // menu hides those items for languages without it (so they never no-op silently).
  const supportsSymbolNav = languageCan.definition || languageCan.rename;

  // --- Right-click context menu (VSCode parity) -----------------------------
  // Open the menu at the pointer. We first move the caret to the click position
  // (like VSCode / native editors) so the menu's caret-relative commands — Go to
  // Definition, Rename, Change Case, Toggle Comment — act where the user clicked,
  // not at the previous caret. The native browser menu is suppressed by the
  // caller's preventDefault. Coordinates are stored RELATIVE to the editor host so
  // the absolutely-positioned menu lands under the cursor regardless of scroll.
  const openContextMenu = useCallback(
    (event: ReactMouseEvent) => {
      if (effectiveReadOnly) return; // viewer mode: leave the native menu alone
      const view = viewRef.current;
      const host = hostRef.current;
      if (!view || !host) return;
      // Move the caret under the pointer when the click is inside the text (and not
      // on an existing selection — right-clicking a selection keeps it, so Cut/Copy
      // operate on it, matching VSCode).
      // Coordinate lookup depends on layout that may not exist yet (a freshly
      // mounted cell, a hidden panel, a headless environment). It is a nicety —
      // the menu itself must still open, so a failure here costs the caret move
      // and nothing else.
      let pos: number | null = null;
      try {
        pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      } catch {
        pos = null;
      }
      if (pos != null) {
        const sel = view.state.selection.main;
        const insideSelection = !sel.empty && pos >= sel.from && pos <= sel.to;
        if (!insideSelection) {
          view.dispatch({ selection: EditorSelection.cursor(pos) });
        }
      }
      // Viewport coordinates: the shared menu is fixed at the press.
      setContextMenu({ x: event.clientX, y: event.clientY });
    },
    [effectiveReadOnly],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // A pointer-positioned menu belongs to one exact editor owner. Keeping it
  // across a page/language/source or write-authority change exposes actions for
  // the departed caret and can leave a newly read-only surface looking mutable.
  useLayoutEffect(() => {
    if (contextMenu === null) return;
    setContextMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, value, viewStateKey]);

  // Context-menu Cut/Copy deliberately do NOT synthesize VS Code's
  // empty-selection whole-line clipboard semantics: MRAI does not own that
  // authority yet, so those entries fail closed until a real selection exists.
  // execCommand's boolean is part of the command receipt; false/throw must be
  // visible instead of closing the menu as though the browser accepted it.
  const runLegacyClipboardCommand = useCallback(
    (command: "cut" | "copy") => {
      const view = viewRef.current;
      const hasSelection = Boolean(
        view?.state.selection.ranges.some((range) => !range.empty),
      );
      if (
        !view ||
        !hasSelection ||
        typeof document === "undefined" ||
        typeof document.execCommand !== "function"
      ) {
        setClipboardFeedback({
          kind: "error",
          message: t("toolbar.help.clipboardUnavailable"),
        });
        return false;
      }

      view.focus();
      try {
        const accepted = document.execCommand(command) === true;
        setClipboardFeedback(
          accepted
            ? null
            : {
                kind: "error",
                message: t("toolbar.help.clipboardUnavailable"),
              },
        );
        return accepted;
      } catch {
        setClipboardFeedback({
          kind: "error",
          message: t("toolbar.help.clipboardUnavailable"),
        });
        return false;
      }
    },
    [t],
  );
  const clipboardCut = useCallback(() => {
    runLegacyClipboardCommand("cut");
  }, [runLegacyClipboardCommand]);
  const clipboardCopy = useCallback(() => {
    runLegacyClipboardCommand("copy");
  }, [runLegacyClipboardCommand]);

  const clipboardPasteFailureMessage = useCallback(
    (error: unknown) => {
      const reason =
        error instanceof ToolbarClipboardError ? error.reason : "failed";
      if (reason === "permission-denied") {
        return t("toolbar.pastePermissionDenied");
      }
      if (reason === "unavailable") return t("toolbar.pasteUnavailable");
      if (reason === "empty") return t("toolbar.pasteEmpty");
      if (reason === "format-unavailable") {
        return t("toolbar.pasteFormatUnavailable");
      }
      return t("toolbar.pasteFailed");
    },
    [t],
  );

  // Button paste is an async mutation plan over one exact editor generation.
  // The OS read cannot be aborted, so source replacement, a newer edit/undo,
  // selection movement, language change, a newer request or unmount retire the
  // request identity; a late promise then has no authority to dispatch.
  const clipboardPaste = useCallback(async () => {
    const view = viewRef.current;
    if (!view || clipboardPasteBusyRef.current) return;
    const requestId = clipboardRequestIdRef.current + 1;
    clipboardRequestIdRef.current = requestId;
    clipboardPasteBusyRef.current = true;
    setClipboardPasteBusy(true);
    setClipboardFeedback({
      kind: "status",
      message: t("toolbar.pasteReading"),
    });
    const claim = captureEditorMutationClaim(
      view,
      language,
      documentGenerationRef.current,
      editorInteractionGenerationRef.current,
    );
    const requestedSource = view.state.doc.toString();
    const requestedSelection = view.state.selection;

    try {
      const payload = selectToolbarPasteSpecialPayload(
        await readToolbarClipboard(),
        "unformatted-text",
      );
      if (clipboardRequestIdRef.current !== requestId) return;
      const live = viewRef.current;
      if (
        !live ||
        !editorMutationClaimIsCurrent(
          claim,
          live,
          languageRef.current,
          documentGenerationRef.current,
          editorInteractionGenerationRef.current,
        ) ||
        live.state.doc.toString() !== requestedSource ||
        !live.state.selection.eq(requestedSelection)
      ) {
        setClipboardFeedback(null);
        return;
      }

      const selection = live.state.selection.main;
      // CodeMirror owns line-separator normalization. Use the same Text value
      // for both the ChangeSpec and resulting cursor so CRLF payloads cannot
      // produce a JS-string-length cursor beyond the normalized document.
      const inserted = live.state.toText(payload.plainText);
      live.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: inserted,
        },
        selection: EditorSelection.cursor(selection.from + inserted.length),
        userEvent: "input.paste",
      });
      live.focus();
      if (clipboardRequestIdRef.current === requestId) {
        setClipboardFeedback(null);
      }
    } catch (error) {
      if (clipboardRequestIdRef.current === requestId) {
        setClipboardFeedback({
          kind: "error",
          message: clipboardPasteFailureMessage(error),
        });
      }
    } finally {
      if (clipboardRequestIdRef.current === requestId) {
        clipboardPasteBusyRef.current = false;
        setClipboardPasteBusy(false);
      }
    }
  }, [clipboardPasteFailureMessage, language, t]);

  // Toggle Comment (VSCode parity, Ctrl/Cmd+/): CM6's `toggleComment` already
  // backs the default-keymap chord; the context menu reuses it so the menu and
  // the keyboard share one implementation. Focus the editor first so it targets
  // the contentDOM, then run the StateCommand against the live view.
  const toggleCommentCmd = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!canToggleComment) {
      setIntelNotice(t("document.capability.unavailable"));
      return;
    }
    view.focus();
    if (!toggleComment(view)) {
      setIntelNotice(t("document.capability.unavailable"));
    }
  }, [canToggleComment, t]);

  // The standalone CodeWindow Edit ribbon reuses the editor's real commands.
  // Request ids make the bridge safe across StrictMode effects and unrelated
  // parent renders: one ribbon click produces at most one editor transaction.
  const lastEditCommandRequestRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      editCommandRequest === undefined ||
      editCommandRequest.requestId === lastEditCommandRequestRef.current
    ) {
      return;
    }
    lastEditCommandRequestRef.current = editCommandRequest.requestId;
    onEditCommandRequestHandled?.(editCommandRequest.requestId);
    if (
      editCommandRequest.viewStateKey !== undefined &&
      editCommandRequest.viewStateKey !== viewStateKey
    ) {
      return;
    }
    const view = viewRef.current;
    switch (editCommandRequest.command) {
      case "undo":
        if (sharedUndoManager) {
          sharedUndoManager.undo();
          view?.focus();
        } else if (view && undo(view)) {
          view.focus();
        }
        break;
      case "redo":
        if (sharedUndoManager) {
          sharedUndoManager.redo();
          view?.focus();
        } else if (view && redo(view)) {
          view.focus();
        }
        break;
      case "openFind":
        openFind();
        break;
      case "save":
        void doSave();
        break;
      case "formatDocument":
        void doFormat();
        break;
      case "formatSelection":
        void formatSelection();
        break;
      case "toggleComment":
        toggleCommentCmd();
        break;
      case "changeAllOccurrences":
        changeAllOccurrences();
        break;
      case "expandSelection":
        expandSelectionCmd();
        break;
      case "shrinkSelection":
        shrinkSelectionCmd();
        break;
      case "addCursorsToLineEnds":
        addCursorsToLineEnds();
        break;
      case "addCursorAbove":
        addCursorOnAdjacentLine("above");
        break;
      case "addCursorBelow":
        addCursorOnAdjacentLine("below");
        break;
      case "addNextOccurrence":
        addNextOccurrence();
        break;
      case "moveLineUp":
        moveSelectedLines(-1);
        break;
      case "moveLineDown":
        moveSelectedLines(1);
        break;
      case "copyLineUp":
        duplicateSelectedLines(-1);
        break;
      case "copyLineDown":
        duplicateSelectedLines(1);
        break;
      case "joinLines":
        joinSelectedLines();
        break;
      case "sortLinesAscending":
        sortSelectedLines(1);
        break;
      case "sortLinesDescending":
        sortSelectedLines(-1);
        break;
      case "removeDuplicateLines":
        removeDuplicateSelectedLines("all");
        break;
      case "removeConsecutiveDuplicateLines":
        removeDuplicateSelectedLines("consecutive");
        break;
      case "trimTrailingWhitespace":
        trimTrailing();
        break;
      case "transformUppercase":
        transformSelectionCase("upper");
        break;
      case "transformLowercase":
        transformSelectionCase("lower");
        break;
      case "transformTitlecase":
        transformSelectionCase("title");
        break;
    }
  }, [
    addCursorOnAdjacentLine,
    addCursorsToLineEnds,
    addNextOccurrence,
    changeAllOccurrences,
    doSave,
    doFormat,
    duplicateSelectedLines,
    editCommandRequest,
    expandSelectionCmd,
    formatSelection,
    joinSelectedLines,
    moveSelectedLines,
    onEditCommandRequestHandled,
    openFind,
    removeDuplicateSelectedLines,
    sharedUndoManager,
    shrinkSelectionCmd,
    sortSelectedLines,
    toggleCommentCmd,
    transformSelectionCase,
    trimTrailing,
    viewStateKey,
  ]);

  useEffect(() => {
    onEditStateChange?.({
      canUndo: editHistoryState.canUndo,
      canRedo: editHistoryState.canRedo,
      findOpen,
      canFormat,
      canToggleComment,
      cursorCount: selSummary.cursorCount,
    });
  }, [
    canFormat,
    canToggleComment,
    editHistoryState.canRedo,
    editHistoryState.canUndo,
    findOpen,
    onEditStateChange,
    selSummary.cursorCount,
  ]);

  // CodeWindow's References ribbon is a discoverability layer over the same
  // language-service commands used by F12/F2, the context menu and the palette.
  // The monotonic id prevents a host re-render from replaying a navigation or
  // multi-file refactor.
  const lastIntelligenceCommandRequestRef = useRef<number | undefined>(
    undefined,
  );
  const pendingIntelligenceCommandRequestRef = useRef(
    intelligenceCommandRequest,
  );
  useLayoutEffect(() => {
    pendingIntelligenceCommandRequestRef.current =
      intelligenceCommandRequest;
  }, [intelligenceCommandRequest]);
  const runIntelligenceCommand = useCallback(
    (request: CodeEditorIntelligenceCommandRequest) => {
      const view = viewRef.current;
      if (!view) return false;
      if (request.requestId === lastIntelligenceCommandRequestRef.current) {
        return false;
      }
      lastIntelligenceCommandRequestRef.current = request.requestId;
      // Acknowledge before owner rejection or dispatch. The host keeps the
      // monotonic sequence separately, so clearing this exact payload makes it
      // a one-shot bridge across page-key remounts without erasing a newer click.
      onIntelligenceCommandRequestHandled?.(request.requestId);
      if (
        request.viewStateKey !== undefined &&
        request.viewStateKey !== viewStateKey
      ) {
        return true;
      }
      const position = view.state.selection.main.head;
      const unavailable = () => {
        setIntelNotice(t("document.capability.unavailable"));
        view.focus();
      };
      switch (request.command) {
        case "openSymbols":
          void openSymbols(position);
          break;
        case "goToLine":
          openGoto();
          break;
        case "goBack":
          if (!navigationAvailability.canGoBack) unavailable();
          else if (!goBackNav()) view.focus();
          break;
        case "goForward":
          if (!navigationAvailability.canGoForward) unavailable();
          else if (!goForwardNav()) view.focus();
          break;
        case "goToDefinition":
          if (!languageCan.definition) unavailable();
          else void goToDefinition(position);
          break;
        case "goToTypeDefinition":
          if (!supportsTsNav) unavailable();
          else void goToTypeDefinition(position);
          break;
        case "goToImplementation":
          if (!supportsTsNav) unavailable();
          else void goToImplementation(position);
          break;
        case "findReferences":
          if (!languageCan.references) unavailable();
          else void findReferences(position);
          break;
        case "showIncomingCalls":
          if (!crossFileCallHierarchyRef.current) unavailable();
          else void showCallHierarchy("incoming");
          break;
        case "showOutgoingCalls":
          if (!crossFileCallHierarchyRef.current) unavailable();
          else void showCallHierarchy("outgoing");
          break;
        case "peekDefinition":
          if (!languageCan.definition) unavailable();
          else void peekDefinition(position);
          break;
        case "peekReferences":
          if (!languageCan.references) unavailable();
          else void peekReferences(position);
          break;
        case "rename":
          if (!languageCan.rename) unavailable();
          else openRename();
          break;
        case "quickFix":
          if (!languageCan.codeActions) unavailable();
          else void openQuickFix();
          break;
        case "refactor":
          if (!crossFileRefactorsRef.current) unavailable();
          else void openRefactor();
          break;
        case "organizeImports":
          if (!organizeImportsAvailable) unavailable();
          else void organizeImportsCmd();
          break;
        case "showHover":
          showHoverAtCaret();
          break;
      }
      return true;
    },
    [
      findReferences,
      goBackNav,
      goToDefinition,
      goForwardNav,
      goToImplementation,
      goToTypeDefinition,
      openGoto,
      openQuickFix,
      openRefactor,
      openRename,
      openSymbols,
      onIntelligenceCommandRequestHandled,
      organizeImportsCmd,
      organizeImportsAvailable,
      peekDefinition,
      peekReferences,
      showCallHierarchy,
      showHoverAtCaret,
      languageCan.codeActions,
      languageCan.definition,
      languageCan.references,
      languageCan.rename,
      navigationAvailability.canGoBack,
      navigationAvailability.canGoForward,
      supportsTsNav,
      t,
      viewStateKey,
    ],
  );
  useEffect(() => {
    if (intelligenceCommandRequest !== undefined) {
      runIntelligenceCommand(intelligenceCommandRequest);
    }
  }, [intelligenceCommandRequest, runIntelligenceCommand]);

  useEffect(() => {
    onIntelligenceStateChange?.({
      canGoBack: navigationAvailability.canGoBack,
      canGoForward: navigationAvailability.canGoForward,
      symbolNavigationAvailable: languageCan.definition,
      referencesAvailable: languageCan.references,
      renameAvailable: languageCan.rename,
      codeActionsAvailable: languageCan.codeActions,
      typeNavigationAvailable: supportsTsNav,
      organizeImportsAvailable,
      referencesBusy: referenceResultBusy,
    });
  }, [
    onIntelligenceStateChange,
    navigationAvailability.canGoBack,
    navigationAvailability.canGoForward,
    languageCan.definition,
    languageCan.references,
    languageCan.rename,
    languageCan.codeActions,
    organizeImportsAvailable,
    referenceResultBusy,
    supportsTsNav,
  ]);

  // Platform-aware modifier label for the context-menu shortcut hints. Seeded to
  // "Ctrl" (server + first paint) and corrected to the Apple symbols after mount
  // so there is no SSR/hydration mismatch from reading `navigator` during render.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const platform =
      globalThis.navigator?.platform || globalThis.navigator?.userAgent || "";
    setIsMac(/Mac|iPhone|iPad|iPod/.test(platform));
  }, []);
  const modLabel = isMac ? "⌘" : "Ctrl";
  const altLabel = isMac ? "⌥" : "Alt";

  // The context-menu item list. Each entry maps to an EXISTING editor command;
  // the def/peek/rename items are included only when the language supports symbol
  // navigation (so the menu never offers a silently-no-op action), and Format is
  // included only when the language has a formatter. Separators group clipboard /
  // navigation / edit / palette sections. Rebuilt when any wired command or the
  // gating predicate changes.
  type ContextMenuEntry =
    | { kind: "separator" }
    | {
        kind: "item";
        id: string;
        label: string;
        icon: ReactNode;
        shortcut?: string;
        disabled?: boolean;
        busy?: boolean;
        title?: string;
        run: () => void;
      };
  const contextMenuItems = useMemo<ContextMenuEntry[]>(() => {
    const items: ContextMenuEntry[] = [
      {
        kind: "item",
        id: "cut",
        label: t("code.contextMenu.cut"),
        icon: <Scissors size={13} />,
        shortcut: `${modLabel}X`,
        disabled:
          !clipboardCapabilities.legacyCommand ||
          selSummary.selectedChars === 0,
        title: !clipboardCapabilities.legacyCommand
          ? t("toolbar.help.clipboardUnavailable")
          : undefined,
        run: clipboardCut,
      },
      {
        kind: "item",
        id: "copy",
        label: t("code.contextMenu.copy"),
        icon: <Copy size={13} />,
        shortcut: `${modLabel}C`,
        disabled:
          !clipboardCapabilities.legacyCommand ||
          selSummary.selectedChars === 0,
        title: !clipboardCapabilities.legacyCommand
          ? t("toolbar.help.clipboardUnavailable")
          : undefined,
        run: clipboardCopy,
      },
      {
        kind: "item",
        id: "paste",
        label: t("code.contextMenu.paste"),
        icon: <ClipboardPaste size={13} />,
        shortcut: `${modLabel}V`,
        disabled: !clipboardCapabilities.read || clipboardPasteBusy,
        busy: clipboardPasteBusy,
        title: clipboardPasteBusy
          ? t("toolbar.pasteReading")
          : !clipboardCapabilities.read
            ? t("toolbar.pasteUnavailable")
            : undefined,
        run: clipboardPaste,
      },
    ];
    // Navigation section. Each command uses its own live capability: a provider
    // may support rename without definition, or definition without rename.
    if (supportsSymbolNav) {
      items.push({ kind: "separator" });
      if (languageCan.definition) {
        items.push({
          kind: "item",
          id: "goToDefinition",
          label: t("code.contextMenu.goToDefinition"),
          icon: <MousePointerClick size={13} />,
          shortcut: "F12",
          run: () =>
            void goToDefinition(
              viewRef.current?.state.selection.main.head ?? 0,
            ),
        });
      }
      // Type Definition / Implementation are TS/JS-only (TypeScript LanguageService).
      if (supportsTsNav) {
        items.push({
          kind: "item",
          id: "goToTypeDefinition",
          label: t("code.contextMenu.goToTypeDefinition"),
          icon: <Braces size={13} />,
          run: () =>
            void goToTypeDefinition(
              viewRef.current?.state.selection.main.head ?? 0,
            ),
        });
        items.push({
          kind: "item",
          id: "goToImplementation",
          label: t("code.contextMenu.goToImplementation"),
          icon: <Code2 size={13} />,
          run: () =>
            void goToImplementation(
              viewRef.current?.state.selection.main.head ?? 0,
            ),
        });
      }
      if (languageCan.definition) {
        items.push({
          kind: "item",
          id: "peekDefinition",
          label: t("code.contextMenu.peekDefinition"),
          icon: <Eye size={13} />,
          shortcut: `${altLabel}F12`,
          disabled: referenceResultBusy,
          busy: referenceResultBusy,
          title: referenceResultBusy ? t("code.console.busy") : undefined,
          run: () =>
            void peekDefinition(
              viewRef.current?.state.selection.main.head ?? 0,
            ),
        });
      }
      // Navigable does not imply renameable: the outline fallback can find a
      // Go declaration and cannot safely rewrite one, and an entry that opens
      // nothing is the failure this section keeps having to relearn.
      if (languageCan.rename) {
        items.push({
          kind: "item",
          id: "rename",
          label: t("code.contextMenu.rename"),
          icon: <Pencil size={13} />,
          shortcut: "F2",
          run: () => openRename(),
        });
      }
    }
    // Edit section.
    items.push({ kind: "separator" });
    if (formatSupported && !effectiveReadOnly) {
      items.push({
        kind: "item",
        id: "formatDocument",
        label: t("code.contextMenu.formatDocument"),
        icon: <AlignLeft size={13} />,
        shortcut: `${altLabel}⇧F`,
        disabled: formatBusy,
        busy: formatBusy,
        title: formatBusy ? t("code.console.busy") : undefined,
        run: () => void doFormat(),
      });
    }
    items.push({
      kind: "item",
      id: "toggleComment",
      label: t("code.contextMenu.toggleComment"),
      icon: <Hash size={13} />,
      shortcut: `${modLabel}/`,
      disabled: !canToggleComment,
      title: !canToggleComment
        ? t("document.capability.unavailable")
        : undefined,
      run: toggleCommentCmd,
    });
    items.push({
      kind: "item",
      id: "changeCaseUpper",
      label: t("code.contextMenu.changeCaseUpper"),
      icon: <TypeIcon size={13} />,
      run: () => transformSelectionCase("upper"),
    });
    items.push({
      kind: "item",
      id: "changeCaseLower",
      label: t("code.contextMenu.changeCaseLower"),
      icon: <TypeIcon size={13} />,
      run: () => transformSelectionCase("lower"),
    });
    items.push({
      kind: "item",
      id: "changeAllOccurrences",
      label: t("code.contextMenu.changeAllOccurrences"),
      icon: <MousePointerClick size={13} />,
      shortcut: `${modLabel}F2`,
      run: () => changeAllOccurrences(),
    });
    // Palette section.
    items.push({ kind: "separator" });
    items.push({
      kind: "item",
      id: "commandPalette",
      label: t("code.contextMenu.commandPalette"),
      icon: <TerminalSquare size={13} />,
      shortcut: `${modLabel}⇧P`,
      run: () => openPalette(),
    });
    return items;
  }, [
    t,
    modLabel,
    altLabel,
    supportsSymbolNav,
    languageCan.definition,
    languageCan.rename,
    referenceResultBusy,
    supportsTsNav,
    formatSupported,
    formatBusy,
    effectiveReadOnly,
    canToggleComment,
    clipboardCapabilities.legacyCommand,
    clipboardCapabilities.read,
    clipboardCut,
    clipboardCopy,
    clipboardPaste,
    clipboardPasteBusy,
    selSummary.selectedChars,
    goToDefinition,
    goToTypeDefinition,
    goToImplementation,
    peekDefinition,
    openRename,
    doFormat,
    toggleCommentCmd,
    transformSelectionCase,
    changeAllOccurrences,
    openPalette,
  ]);

  // The menu's click-away, Escape (captured on the window, before the editor's
  // own Escape handler, so the mount-stable keymap never churns), first-item
  // focus and on-screen placement belong to the shared PointerContextMenu;
  // Escape hands the keyboard back to the text through its onEscape.

  // Run the command at `index` in the FILTERED list, then close the palette. The
  // palette closes BEFORE the command runs so a command that itself opens a panel
  // (find / symbols / references) ends up with that panel — not the palette — on
  // screen, and focus management belongs to the invoked command.
  const runPaletteCommand = useCallback(
    (index: number) => {
      const cmd = visiblePaletteCommands[index];
      if (!cmd) {
        setPaletteOpen(false);
        focusView();
        return;
      }
      if (cmd.disabled) return;
      if (cmd.writeRequired && readOnlyRef.current) return;
      setPaletteOpen(false);
      cmd.run();
      // Most commands edit text or move the selection and leave focus where
      // the palette's input was: nowhere, once it closes, so the next key (or
      // Escape for a peek just opened) reached nothing. VS Code hands focus
      // back to the editor. A command that opened a panel of its own has
      // moved focus into it by the next frame and keeps it.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) focusView();
      });
    },
    [focusView, visiblePaletteCommands],
  );

  const runExecutableSelection = useCallback(() => {
    if (!onRunSelection) return false;
    const view = viewRef.current;
    if (!view) return true;
    const editorSelection = view.state.selection;
    const hasSelectedRange = editorSelection.ranges.some(
      (range) => range.from !== range.to,
    );
    const ranges = (
      hasSelectedRange ? editorSelection.ranges : [editorSelection.main]
    ).map((range) => ({ anchor: range.anchor, head: range.head }));
    const selection = buildExecutionSelection(
      view.state.doc.toString(),
      ranges,
    );
    if (selection) onRunSelection(selection);
    return true;
  }, [onRunSelection]);

  // The standalone Run ribbon drives the same live-selection resolver used by
  // Shift+Enter and the status-bar action. The monotonic request id makes one
  // ribbon click one sandbox invocation even under StrictMode replays.
  const lastExecutionCommandRequestRef = useRef<number | undefined>(undefined);
  const pendingExecutionCommandRequestRef = useRef(
    executionCommandRequest,
  );
  useLayoutEffect(() => {
    pendingExecutionCommandRequestRef.current = executionCommandRequest;
  }, [executionCommandRequest]);
  const runExecutionCommand = useCallback(
    (request: CodeEditorExecutionCommandRequest) => {
      if (
        request.requestId === lastExecutionCommandRequestRef.current
      ) {
        return;
      }
      if (
        viewStateKeyRef.current !== undefined &&
        request.viewStateKey !== viewStateKeyRef.current
      ) {
        lastExecutionCommandRequestRef.current = request.requestId;
        onExecutionCommandRequestHandled?.(request.requestId);
        return;
      }
      if (!viewRef.current) return;
      lastExecutionCommandRequestRef.current = request.requestId;
      onExecutionCommandRequestHandled?.(request.requestId);
      switch (request.command) {
        case "runSelectionOrLine":
          if (!runExecutableSelection()) {
            setIntelNotice(t("document.capability.unavailable"));
          }
          break;
      }
    },
    [onExecutionCommandRequestHandled, runExecutableSelection, t],
  );
  useEffect(() => {
    if (executionCommandRequest) {
      runExecutionCommand(executionCommandRequest);
    }
  }, [executionCommandRequest, runExecutionCommand]);

  useEffect(() => {
    const view = viewRef.current;
    const head = view?.state.selection.main.head ?? 0;
    const nextExecutionState: CodeEditorExecutionState = {
      selectedChars: selSummary.selectedChars,
      selectionCount:
        selSummary.selectedChars > 0 ? selSummary.cursorCount : 0,
      currentLine: view?.state.doc.lineAt(head).number ?? 1,
      selectedText: selSummary.selectedText,
      selectedTextTruncated: selSummary.selectedTextTruncated,
      selectionFrom: selSummary.selectionFrom,
      selectionTo: selSummary.selectionTo,
    };
    lastReportedExecutionStateRef.current = nextExecutionState;
    onExecutionStateChange?.(nextExecutionState);
  }, [
    onExecutionStateChange,
    selSummary.cursorCount,
    selSummary.selectedChars,
    selSummary.selectedText,
    selSummary.selectedTextTruncated,
    selSummary.selectionFrom,
    selSummary.selectionTo,
  ]);

  // Cmd/Ctrl+F -> find, Cmd/Ctrl+G -> goto-line, Cmd/Ctrl+Enter -> full run,
  // Shift+Enter -> selected source/current line.
  // Prec.high so they win over CM6's default bindings, which basicSetup collects
  // FIRST and which otherwise take the equal-precedence tie — most critically
  // defaultKeymap's Mod-Enter -> insertBlankLine, which silently shadowed the run
  // chord (it inserted a blank line instead of running). The sibling problems /
  // emmet keymaps below are wrapped the same way for the same reason.
  const shortcutBindings = useMemo<KeyBinding[]>(
    () => [
          {
            key: "Mod-f",
            preventDefault: true,
            run: () => {
              openFind();
              return true;
            },
          },
          {
            // Go to Line is Ctrl+G everywhere, as in VS Code (on Windows and
            // Linux that is the same chord as before). On a Mac, Cmd+G and
            // Cmd+Shift+G step through find matches, which Go to Line used to
            // take over.
            key: "Ctrl-g",
            preventDefault: true,
            run: () => {
              openGoto();
              return true;
            },
          },
          {
            mac: "Mod-Shift-g",
            preventDefault: true,
            run: () => {
              goToMatch(-1);
              return true;
            },
          },
          {
            mac: "Mod-g",
            preventDefault: true,
            run: () => {
              goToMatch(1);
              return true;
            },
          },
          {
            // Find next / previous (VSCode parity: F3 / Shift+F3). `searchKeymap` is
            // disabled above (custom find bar), so the editor-focused F3 would
            // otherwise be dead. These reuse the SAME match-stepping engine as the
            // find bar's prev/next buttons (goToMatch → findMatches/stepMatch), so a
            // press steps to the match nearest the caret first, then through the rest
            // with wrap-around — using whatever query the find bar last held. With no
            // query (matches empty) goToMatch no-ops. Shift+F3 must bind BEFORE plain
            // F3 so CM6 doesn't match F3 first and swallow the shifted chord.
            key: "Shift-F3",
            preventDefault: true,
            run: () => {
              goToMatch(-1);
              return true;
            },
          },
          {
            key: "F3",
            preventDefault: true,
            run: () => {
              goToMatch(1);
              return true;
            },
          },
          {
            key: "Alt-Enter",
            preventDefault: Boolean(onRunAndInsert),
            run: (view) => {
              if (!onRunAndInsert) return false;
              if (view.compositionStarted) return true;
              onRunAndInsert();
              return true;
            },
          },
          {
            key: "Shift-Enter",
            preventDefault: true,
            run: (view) => {
              // `compositionStarted` is true even before the first committed
              // composition change, when CM's general composing guard has not
              // activated yet. Swallow the chord without executing a cell.
              if (view.compositionStarted) return true;
              if (onRunAndAdvance) {
                onRunAndAdvance();
                return true;
              }
              return runExecutableSelection();
            },
          },
          {
            key: "Mod-Enter",
            preventDefault: true,
            run: (view) => {
              if (view.compositionStarted) return true;
              if (onRun) onRun();
              return true;
            },
          },
          {
            // Multi-cursor: add next occurrence of the selection (VSCode Ctrl/Cmd-D).
            // We disable `searchKeymap` above (custom find bar), which is the ONLY
            // place CM6 binds these two commands — so rebind them explicitly here or
            // the most-used multi-cursor gesture is dead. Mod-Shift-l selects ALL
            // matches at once. Both ship as StateCommands in @codemirror/search and
            // are used directly as `run` (an EditorView satisfies {state, dispatch}).
            key: "Mod-d",
            preventDefault: true,
            run: selectNextOccurrence,
          },
          {
            key: "Mod-Shift-l",
            preventDefault: true,
            run: selectSelectionMatches,
          },
          {
            // Toggle Comment must consume CM6's boolean receipt. The default
            // keymap otherwise turns an unsupported JSON/plain-text chord into
            // a silent no-op while the ribbon correctly says it is unavailable.
            key: "Mod-/",
            preventDefault: true,
            run: () => {
              toggleCommentCmd();
              return true;
            },
          },
          {
            // Add Cursors to Line Ends (VSCode parity: Shift+Alt+I). Drops a caret
            // at the end of every line the selection spans. Always swallow the
            // chord (no editor default for it) so it never types a stray "I".
            key: "Shift-Alt-i",
            preventDefault: true,
            run: () => {
              addCursorsToLineEnds();
              return true;
            },
          },
          {
            // Change All Occurrences (VSCode parity: Ctrl/Cmd+F2). Select every
            // whole-word occurrence of the word under the caret as a multi-cursor
            // selection. Bound to Mod-F2 so it fires on either platform; it MUST
            // bind before the plain F2 (rename) below so CM6 matches the modified
            // chord first and F2 doesn't swallow it.
            key: "Mod-F2",
            preventDefault: true,
            run: () => {
              changeAllOccurrences();
              return true;
            },
          },
          {
            // Expand Selection (VSCode parity: Shift+Alt+Right). Grows to the
            // enclosing syntax node and records the prior range so Shrink can undo
            // it. (Mod-i, CM6's default expand, is rebound below to the SAME
            // recorder so a shrink works after either gesture.)
            key: "Shift-Alt-ArrowRight",
            preventDefault: true,
            run: () => {
              expandSelectionCmd();
              return true;
            },
          },
          {
            // Shrink Selection (VSCode parity: Shift+Alt+Left) — the inverse of
            // Expand, popping the selection-history stack back to the previous
            // (smaller) range. No-op when there is nothing to shrink to.
            key: "Shift-Alt-ArrowLeft",
            preventDefault: true,
            run: () => {
              shrinkSelectionCmd();
              return true;
            },
          },
          {
            // Move Line Up (VSCode parity: Alt+Up). No-op at the top of the buffer.
            key: "Alt-ArrowUp",
            preventDefault: true,
            run: () => {
              moveSelectedLines(-1);
              return true;
            },
          },
          {
            // Move Line Down (VSCode parity: Alt+Down). No-op at the bottom.
            key: "Alt-ArrowDown",
            preventDefault: true,
            run: () => {
              moveSelectedLines(1);
              return true;
            },
          },
          {
            // Copy Line Up (VSCode parity: Shift+Alt+Up) — duplicate above.
            key: "Shift-Alt-ArrowUp",
            preventDefault: true,
            run: () => {
              duplicateSelectedLines(-1);
              return true;
            },
          },
          {
            // Copy Line Down (VSCode parity: Shift+Alt+Down) — duplicate below.
            key: "Shift-Alt-ArrowDown",
            preventDefault: true,
            run: () => {
              duplicateSelectedLines(1);
              return true;
            },
          },
          {
            // Re-bind CM6's default Expand-selection chord (Mod-i) through our
            // recorder so the Shrink stack is populated regardless of which expand
            // gesture the user reaches for.
            key: "Mod-i",
            preventDefault: true,
            run: () => {
              expandSelectionCmd();
              return true;
            },
          },
          // Fold by Level (VSCode parity: Ctrl+K Ctrl+1 .. Ctrl+K Ctrl+7). Each is
          // a two-stroke chord CM6 resolves natively; the prefix `Mod-k` is already
          // used by Format-Selection (Mod-k Mod-f) with no bare `Mod-k` binding, so
          // the digit chords steal nothing.
          ...[1, 2, 3, 4, 5, 6, 7].map((level) => ({
            key: `Mod-k Mod-${level}`,
            preventDefault: true,
            run: () => {
              foldLevel(level);
              return true;
            },
          })),
          {
            // Go-to-definition (VSCode parity).
            key: "F12",
            preventDefault: true,
            run: (view) => {
              void goToDefinition(view.state.selection.main.head);
              return true;
            },
          },
          {
            // Find-all-references (VSCode parity). Shift-F12 must bind BEFORE the
            // plain F12 above so CM6 doesn't first match F12 and swallow the chord.
            key: "Shift-F12",
            preventDefault: true,
            run: (view) => {
              void findReferences(view.state.selection.main.head);
              return true;
            },
          },
          {
            // Peek References (VSCode parity: an INLINE peek instead of jumping).
            // Bound to Mod-Alt-F12. Must bind BEFORE the plain F12 above so the
            // modified chord is matched first and F12 doesn't swallow it.
            key: "Mod-Alt-F12",
            preventDefault: true,
            run: (view) => {
              void peekReferences(view.state.selection.main.head);
              return true;
            },
          },
          {
            // Peek Definition (VSCode parity: Alt+F12) — inline read-only view of the
            // declaration rather than moving the caret to it.
            key: "Alt-F12",
            preventDefault: true,
            run: (view) => {
              void peekDefinition(view.state.selection.main.head);
              return true;
            },
          },
          {
            // Go-to-Symbol / Outline (VSCode parity: Ctrl/Cmd+Shift+O). Always
            // swallow the chord (the browser has no editor default for it) and open
            // the picker; openSymbols shows the empty-state row for a no-symbol doc.
            key: "Mod-Shift-o",
            preventDefault: true,
            run: (view) => {
              void openSymbols(view.state.selection.main.head);
              return true;
            },
          },
          {
            // Command Palette (VSCode parity: Ctrl/Cmd+Shift+P). Always swallow the
            // chord (the browser maps it to nothing useful inside the editor) and
            // open the filterable command list — a thin dispatcher over the editor
            // commands already bound above.
            key: "Mod-Shift-p",
            preventDefault: true,
            run: () => {
              openPalette();
              return true;
            },
          },
          {
            // Rename symbol (VSCode parity).
            key: "F2",
            preventDefault: true,
            run: () => {
              openRename();
              return true;
            },
          },
          {
            // Quick Fix / code actions (VSCode parity: Ctrl+. / Cmd+.). Bound to
            // Mod-. so it fires on either platform. Always swallow the chord (the
            // browser has no default for it inside the editor) and open the menu;
            // openQuickFix shows the "no quick fixes" notice for non-TS / no-fix.
            key: "Mod-.",
            preventDefault: true,
            run: () => {
              void openQuickFix();
              return true;
            },
          },
          {
            // Keyboard Shortcuts reference (VSCode parity: Ctrl/Cmd+K Ctrl/Cmd+S).
            key: "Mod-k Mod-s",
            preventDefault: true,
            run: () => {
              openShortcuts();
              return true;
            },
          },
          {
            // Refactor… (VSCode parity: Ctrl/Cmd+Shift+R). Only bound when the
            // host supplies refactorings, so the chord keeps its browser default
            // everywhere else.
            key: "Mod-Shift-r",
            preventDefault: true,
            run: () => {
              if (!crossFileRefactorsRef.current) return false;
              void openRefactor();
              return true;
            },
          },
          {
            // Format document (VSCode parity). Always swallow the chord so the
            // buffer never gets a stray "f"; doFormat no-ops when the language has
            // no parser.
            key: "Shift-Alt-f",
            preventDefault: true,
            run: () => {
              void doFormat();
              return true;
            },
          },
          {
            // Organize Imports (VSCode parity: Shift+Alt+O). TS/JS only; no-ops with
            // a brief notice on other languages or when imports are already tidy.
            key: "Shift-Alt-o",
            preventDefault: true,
            run: () => {
              void organizeImportsCmd();
              return true;
            },
          },
          {
            // Show Hover (VSCode parity: Ctrl/Cmd-K Ctrl/Cmd-I): open the hover
            // cards at the caret without a pointer.
            key: "Mod-k Mod-i",
            preventDefault: true,
            run: () => {
              showHoverAtCaret();
              return true;
            },
          },
          {
            // Format Selection (VSCode parity: Ctrl/Cmd-K Ctrl/Cmd-F — a two-stroke
            // chord, which CM6 resolves natively). Formats only the selected range
            // (or the whole doc with no selection); formatSelection no-ops when the
            // language has no formatter or the slice can't be parsed. `Mod-k` is
            // otherwise unbound in this editor, so the prefix steals nothing.
            key: "Mod-k Mod-f",
            preventDefault: true,
            run: () => {
              void formatSelection();
              return true;
            },
          },
          {
            // Save (VSCode muscle memory: Cmd/Ctrl+S). MRAI autosaves, so this is
            // not the only persist path — but it lets a VSCode migrant format-on-
            // save and flush on demand. Always swallow the chord so the browser's
            // "save page" dialog never opens over the editor. doSave formats first
            // when the toggle is on + the language is supported, then flushes.
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void doSave("shortcut");
              return true;
            },
          },
          {
            // Toggle word wrap (VSCode parity).
            key: "Alt-z",
            preventDefault: true,
            run: () => {
              toggleWordWrap();
              return true;
            },
          },
          {
            // Zoom in (VSCode parity: Cmd/Ctrl + "="). The "+" alias covers the
            // shifted key so users who hold Shift to type "+" still zoom.
            key: "Mod-=",
            mac: "Cmd-=",
            run: () => {
              zoomIn();
              return true;
            },
          },
          {
            key: "Mod-+",
            run: () => {
              zoomIn();
              return true;
            },
          },
          {
            // Zoom out (VSCode parity: Cmd/Ctrl + "-").
            key: "Mod--",
            mac: "Cmd--",
            run: () => {
              zoomOut();
              return true;
            },
          },
          {
            // Reset zoom to 100% (VSCode parity: Cmd/Ctrl + "0").
            key: "Mod-0",
            mac: "Cmd-0",
            run: () => {
              zoomReset();
              return true;
            },
          },
          {
            // Go Back in the cursor navigation history (VSCode
            // `workbench.action.navigateBack`). Mac uses Ctrl+- (VSCode's Mac
            // binding — Cmd+- is zoom-out there); Win/Linux uses Ctrl+Alt+- so it
            // doesn't collide with the Ctrl+- zoom-out bound above. Returns true
            // even when the stack can't move so the chord never falls through to a
            // stray edit; navigateHistory no-ops when there's nowhere to go.
            key: "Mod-Alt--",
            mac: "Ctrl--",
            preventDefault: true,
            run: () => {
              goBackNav();
              return true;
            },
          },
          {
            // Go Forward in the cursor navigation history (VSCode
            // `workbench.action.navigateForward`, Ctrl+Shift+- on both platforms).
            // Pressing Shift+- yields the shifted character `_` as `event.key`, so
            // we bind the shifted char directly (`Ctrl-_`) — the same pattern the
            // zoom-in `Mod-+` (shifted `=`) binding uses. (CM6 keys off `event.key`;
            // a `Ctrl-Shift--` spelling would never match because the key arrives as
            // `_`, not `-`.)
            key: "Ctrl-_",
            preventDefault: true,
            run: () => {
              goForwardNav();
              return true;
            },
          },
          {
            // Open the Compare / diff-merge view (VSCode-style "Compare"). Bound
            // only when the host supplied compare sources; otherwise we return
            // FALSE so the chord falls through to CM's default Shift-Mod-\
            // (`cursorMatchingBracket`) — i.e. a standalone editor keeps its
            // existing matching-bracket gesture, byte-for-byte behaviour unchanged.
            key: "Mod-Shift-\\",
            run: () => {
              if (!compareSourcesRef.current) return false;
              openCompare();
              return true;
            },
          },
          {
            // Escape closes the Quick Fix menu, then the Find-all-references panel,
            // then the Go-to-Symbol picker, then the Problems panel. After Ctrl+. /
            // Shift+F12 / Ctrl+Shift+O / Ctrl+Shift+M focus stays in the editor
            // (none of these views steal it), so the editor keymap — not each view's
            // own onKeyDown — is where the close gesture lands. Only ONE of them is
            // open at a time in practice, but the ordered fall-through is harmless
            // (each returns once it closes its own). Returns false when all are
            // closed so Escape still reaches other handlers (autocomplete / signature
            // help / etc.) — i.e. Escape is透传 when the Problems panel is closed.
            key: "Escape",
            run: (view) => {
              if (view.compositionStarted) return false;
              // The inline peek is a CM6 widget (not React state); close it first —
              // it's the most-recently-opened transient surface and never steals
              // focus, so Escape lands here, restoring focus to the contentDOM.
              if (peekOpenRef.current) {
                closePeek();
                return true;
              }
              if (paletteOpen) {
                closePalette();
                return true;
              }
              if (fixesOpen) {
                closeQuickFix();
                return true;
              }
              if (refsOpen) {
                closeReferences();
                return true;
              }
              if (symbolsOpen) {
                closeSymbols();
                return true;
              }
              if (problemsOpen) {
                closeProblems();
                return true;
              }
              if (compareOpen) {
                closeCompare();
                return true;
              }
              if (onExitEditMode) {
                onExitEditMode();
                return true;
              }
              return false;
            },
          },
    ],
    [
      openFind,
      openGoto,
      goToMatch,
      showHoverAtCaret,
      onRun,
      onRunAndAdvance,
      onRunAndInsert,
      onExitEditMode,
      runExecutableSelection,
      toggleCommentCmd,
      goToDefinition,
      findReferences,
      peekReferences,
      peekDefinition,
      closePeek,
      openSymbols,
      openShortcuts,
      openPalette,
      openRename,
      openQuickFix,
      openRefactor,
      organizeImportsCmd,
      doFormat,
      formatSelection,
      doSave,
      changeAllOccurrences,
      addCursorsToLineEnds,
      expandSelectionCmd,
      shrinkSelectionCmd,
      moveSelectedLines,
      duplicateSelectedLines,
      foldLevel,
      toggleWordWrap,
      zoomIn,
      zoomOut,
      zoomReset,
      goBackNav,
      goForwardNav,
      openCompare,
      refsOpen,
      closeReferences,
      symbolsOpen,
      closeSymbols,
      paletteOpen,
      closePalette,
      fixesOpen,
      closeQuickFix,
      problemsOpen,
      closeProblems,
      compareOpen,
      closeCompare,
    ],
  );

  // The editor's own chords, plus the rescue that makes the `Alt-<letter>` ones
  // reachable on macOS (where Option+letter types a character, so CodeMirror
  // deliberately refuses to match them). The rescue is derived from these very
  // bindings, so it can never run a different command than the chord names.
  const shortcutKeymap = useMemo<Extension>(
    () =>
      Prec.high([
        keymap.of(shortcutBindings),
        macOptionChordFallback(shortcutBindings),
      ]),
    [shortcutBindings],
  );

  // Toggle the Problems panel (VSCode parity: Ctrl/Cmd+Shift+M). This lives in
  // its OWN high-precedence keymap because @codemirror/lint's lintKeymap (pulled
  // in by basicSetup's `lintKeymap: true`) already binds Mod-Shift-m to its
  // built-in `openLintPanel` with preventDefault; at equal precedence that
  // default is collected first and short-circuits our handler. Prec.high() makes
  // our binding win the chord so Ctrl/Cmd+Shift+M opens OUR panel, not CM's empty
  // built-in one. Bound on the EDITOR keymap (not the panel element) so it fires
  // from the real focus target (contentDOM) regardless of caret position — the
  // same discipline the references/symbols chords use. Isolated to this single
  // binding so no other key's precedence changes (byte-stability for the rest).
  const problemsToggleKeymap = useMemo<Extension>(
    () =>
      Prec.high(
        keymap.of([
          {
            key: "Mod-Shift-m",
            preventDefault: true,
            run: () => {
              toggleProblems();
              return true;
            },
          },
        ]),
      ),
    [toggleProblems],
  );

  // Cmd/Ctrl-click on an identifier -> go-to-definition (VSCode parity). We read
  // the offset under the pointer via posAtCoords; a miss is ignored.
  const cmdClickHandler = useMemo<Extension>(
    () =>
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          if (!(event.metaKey || event.ctrlKey)) return false;
          if (!languageCan.definition) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          event.preventDefault();
          void goToDefinition(pos);
          return true;
        },
      }),
    [goToDefinition, languageCan.definition],
  );

  // --- Signature help (parameter hints) -------------------------------------
  // After typing `(` or `,` (or moving the caret inside a call) in a TS/JS
  // buffer, query the single-buffer LanguageService for the active overload's
  // parameter hints (sanitized via signatureHelpAt — no raw HTML) and surface
  // them as a small tooltip beneath the find bar. Escape / leaving the call
  // dismisses it. Best-effort: the compiler is dynamically imported and any
  // failure clears the tooltip rather than breaking the editor.
  const refreshSignatureHelp = useCallback(
    async (pos: number) => {
      const lang = (language || "").trim().toLowerCase();
      // Python path: ask the LIVE kernel via jedi (worker `signature` op) once a
      // kernel exists, mirroring the semantic completion/hover gating. The same
      // generation guard as the TS path catches a slow async result landing after
      // the call was closed with `)` / Escape / an edit.
      if (pythonNamespace && (lang === "python" || lang === "py")) {
        const gen = (sigHelpGenRef.current += 1);
        const { hasPythonKernel, signaturePython } =
          await import("@mrnote/core/web/lib/code-runner/python-runner.ts");
        // Never boot Pyodide as a typing side effect.
        if (!hasPythonKernel(pythonNamespace)) {
          if (sigHelpGenRef.current === gen) setSigHelp(null);
          return;
        }
        const view = viewRef.current;
        if (sigHelpGenRef.current !== gen || !view) return;
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        const py = await signaturePython(
          doc.toString(),
          line.number,
          pos - line.from,
          { namespace: pythonNamespace },
        );
        // Superseded (newer trigger / `)` / Escape / edit) or unmounted while the
        // request was in flight → drop this stale result silently.
        if (sigHelpGenRef.current !== gen || !viewRef.current) return;
        if (!py || !py.label) {
          setSigHelp(null);
          return;
        }
        // jedi output is plain text → HTML-escape it into the SAME shape the TS
        // path produces, so signatureHelpHtml can bold the active parameter and
        // the shared render path (dangerouslySetInnerHTML) stays injection-safe.
        const info: SignatureHelpInfo = {
          label: escapeHtmlText(py.label),
          parameters: py.parameters.map(escapeHtmlText),
          activeParameter:
            py.parameters.length === 0
              ? 0
              : Math.max(
                  0,
                  Math.min(py.activeParameter, py.parameters.length - 1),
                ),
          hasContent: true,
        };
        setSigHelp({ pos, info });
        return;
      }
      if (!intelligenceLanguage(language)) {
        // Any other language: whatever provider was registered for it. Same
        // generation guard as the two engines above — a hint that arrives after
        // the call was closed with `)` or Escape must not re-open it.
        const gen = (sigHelpGenRef.current += 1);
        const signature = await askProvider("signatureHelp", (provider) =>
          provider.signatureHelp!({
            text: viewRef.current?.state.doc.toString() ?? "",
            offset: pos,
            language,
          }),
        );
        if (sigHelpGenRef.current !== gen || !viewRef.current) return;
        if (!signature?.label) {
          setSigHelp(null);
          return;
        }
        // A provider's text is plain by contract, so it is escaped into the
        // SAME shape the TypeScript path produces and the one shared renderer
        // (dangerouslySetInnerHTML) stays injection-safe.
        setSigHelp({
          pos,
          info: {
            label: escapeHtmlText(signature.label),
            parameters: signature.parameters.map(escapeHtmlText),
            activeParameter: signature.activeParameter,
            hasContent: true,
          },
        });
        return;
      }
      // Claim this request's id; a later dismissal/trigger bumps the ref past it.
      const gen = (sigHelpGenRef.current += 1);
      const svc = await getTsService();
      // Superseded by a newer request/dismissal, or the view unmounted, while we
      // awaited the dynamic compiler import → drop this stale result silently.
      if (sigHelpGenRef.current !== gen || !viewRef.current) return;
      if (!svc) {
        setSigHelp(null);
        return;
      }
      svc.markDirty();
      let info = signatureHelpAt(svc, pos);
      if (!info.hasContent && crossFileSignatureHelpRef.current) {
        try {
          const projectInfo =
            await crossFileSignatureHelpRef.current(pos);
          if (sigHelpGenRef.current !== gen || !viewRef.current) return;
          if (projectInfo?.hasContent) info = projectInfo;
        } catch {
          // Best-effort project intelligence: preserve the local empty result.
        }
      }
      if (!info.hasContent) {
        setSigHelp(null);
        return;
      }
      setSigHelp({ pos, info });
    },
    [language, getTsService, pythonNamespace, askProvider, setSigHelp],
  );

  // Trigger signature help on the `(` / `,` that open or advance a call's
  // argument list (VSCode's trigger characters), and close it on `)`. The
  // character comes from the typing transaction itself, not from a key code:
  // an Android IME reports every key as "Unidentified", so a soft keyboard
  
  // edit applied; the request starts once the update has finished.
  const signatureTriggerHandler = useMemo<Extension>(() => {
    // Fire for any language a provider serves — TS/JS via the LanguageService,
    // Python via jedi over the worker. Both feed the same tooltip render path.
    if (!languageCan.signatureHelp) return [];
    return [
      EditorView.updateListener.of((update) => {
        const trigger = signatureHelpTriggerForUpdate(update.transactions);
        if (trigger === "close") {
          // Closing the call dismisses the hint (and invalidates any pending
          // async request so it can't re-show after the call is closed).
          sigHelpTriggerDocRef.current = null;
          queueMicrotask(dismissSignatureHelp);
        } else if (
          trigger === "open" ||
          (sigHelpActiveRef.current && (update.docChanged || update.selectionSet))
        ) {
          // `(` / `,` asks; with a hint up, an argument typed or the caret
          // moved inside the call asks again at the new place, so the active
          // parameter follows and the hint closes once the caret leaves.
          const pos = update.state.selection.main.head;
          sigHelpActiveRef.current = true;
          sigHelpTriggerDocRef.current = update.state.doc;
          queueMicrotask(() => void refreshSignatureHelp(pos));
        }
      }),
      EditorView.domEventHandlers({
        keyup: (event) => {
          if (event.key === "Escape") dismissSignatureHelp();
          return false;
        },
      }),
    ];
  }, [languageCan.signatureHelp, refreshSignatureHelp, dismissSignatureHelp]);

  // Bump the React tick only while a scroll-linked chrome layer can render.
  // Lightweight mode disables both layers, so large-file scrolling stays inside
  // CodeMirror's virtualized view instead of re-rendering the React host.
  const scrollChromeActiveRef = useRef(false);
  scrollChromeActiveRef.current =
    effectiveMinimapOn || effectiveStickyScrollOn;
  const scrollListener = useMemo<Extension>(
    () =>
      EditorView.domEventHandlers({
        scroll: (_event, view) => {
          scheduleCodeEditorViewStateRef.current(view);
          if (!scrollChromeActiveRef.current) return false;
          setScrollTick((t) => t + 1);
          return false;
        },
      }),
    [],
  );

  // Async editor mutations are plans over one exact document + interaction
  // generation. This listener is intentionally ref-only and stable: edits,
  // Undo and selection A -> B -> A all advance the relevant identity without
  // adding a React render to the typing or caret-movement path.
  const documentGenerationListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of(
        // CodeMirror invokes this after a transaction; it cannot run during
        // React render even though the extension callback is declared here.
        (update) => {
          if (update.docChanged) documentGenerationRef.current += 1;
          if (update.docChanged || update.selectionSet) {
            editorInteractionGenerationRef.current += 1;
            // References/call-hierarchy/peek results are positions in the exact
            // invocation interaction. Retire their logical owner immediately;
            // a host/provider may ignore cancellation and finish much later.
            referenceResultRequestIdRef.current += 1;
            if (referenceResultBusyRef.current) {
              referenceResultBusyRef.current = false;
              setReferenceResultBusy(false);
            }
            const ownFormatTransaction = update.transactions.some((transaction) =>
              transaction.isUserEvent("input.format"),
            );
            const activeFormat = activeFormatRequestRef.current;
            if (!ownFormatTransaction && activeFormat) {
              // The old formatter no longer owns this exact interaction. Retire
              // it immediately (even if a third-party provider ignores Abort)
              // so the UI unlocks and a newer request can run while its stale
              // promise winds down in the background.
              formatRequestIdRef.current += 1;
              activeFormat.retire();
              activeFormat.controller.abort();
              activeFormatRequestRef.current = null;
              formatBusyRef.current = false;
              setFormatBusy(false);
              setFormatFeedback(null);
            }
          }
        },
      ),
    [],
  );

  // Mirror the editor's CM6 lint-diagnostic count into React so the live region
  // can announce "N problems" when it changes. Diagnostics live INSIDE CM6's lint
  // state (not React); the linters are async and re-run after edits, so we listen
  // for the lint-state transaction. `update.docChanged` alone misses the async
  // re-lint that lands a tick later, so we count on EVERY update and only set
  // state when the number actually changed (React bails on an equal setState, and
  // the guard keeps the work a cheap integer compare). forEachDiagnostic walks
  // the active diagnostic set for the current document.
  const diagnosticListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of((update) => {
        // updateListener fires on EVERY view update — doc edits, lint-state
        // changes, AND pure geometry/viewport changes (scroll, resize, measure).
        // While the panel is open we must NOT hand React a fresh array on a
        // geometry-only update: that re-render triggers a CM measure → another
        // update → another setState → an infinite render↔measure loop. So when
        // open we (1) compute a stable signature of the diagnostic SET, (2) skip
        // the rebuild entirely when it's unchanged since the last build. The
        // count compare below still lets React bail for the announcement counter.
        const reportProblems = problemsChangeRef.current;
        let reportedSignature = "";
        let count = 0;
        const severityCounts = { error: 0, warning: 0, info: 0 };
        forEachDiagnostic(update.state, (diagnostic, from, to) => {
          count += 1;
          severityCounts[problemSeverityGroup(diagnostic.severity)] += 1;
          if (reportProblems && count <= WORKSPACE_PROBLEM_REPORT_LIMIT) {
            reportedSignature += `${from}:${to}:${diagnostic.severity}:${diagnostic.message.slice(0, 2_048)}\n`;
          }
        });
        if (count !== lastReportedDiagnosticCountRef.current) {
          lastReportedDiagnosticCountRef.current = count;
          setDiagnosticCount(count);
          diagnosticCountChangeRef.current?.(count);
        }
        // Keep the Problems panel in sync with async re-lints — but ONLY while it
        // is open AND only when the diagnostic set actually changed. When closed
        // (the default) this is a single ref read and no list/signature work, so
        // the closed-panel path is byte-for-byte the pre-feature behaviour. The
        // refs are read (not dependencies) so this listener's identity never
        // changes — re-creating it would reconfigure the editor.
        if (reportProblems) {
          const signature = `${count}\n${reportedSignature}`;
          if (signature !== lastReportedProblemSignatureRef.current) {
            lastReportedProblemSignatureRef.current = signature;
            reportProblems(
              collectProblems(update.state, WORKSPACE_PROBLEM_REPORT_LIMIT),
            );
          }
        }
        if (problemsOpenRef.current) {
          const previousSeverityCounts = problemSeverityCountsRef.current;
          if (
            previousSeverityCounts.error !== severityCounts.error ||
            previousSeverityCounts.warning !== severityCounts.warning ||
            previousSeverityCounts.info !== severityCounts.info
          ) {
            problemSeverityCountsRef.current = severityCounts;
            setProblemSeverityCounts(severityCounts);
          }
          const visibility = problemSeverityVisibilityRef.current;
          const signature = problemSignature(update.state, visibility);
          if (signature !== problemSignatureRef.current) {
            problemSignatureRef.current = signature;
            setProblemList(
              collectProblems(
                update.state,
                PROBLEMS_PANEL_RENDER_LIMIT,
                visibility,
              ),
            );
          }
        }
      }),
    [],
  );

  // Persist only state transitions that affect a durable editor position.
  // Selection/document changes are explicit update flags; fold-gutter, palette,
  // and keyboard fold commands carry CM's fold/unfold effects. Geometry-only
  // updates stay on the zero-work path (scroll has its own DOM listener).
  const durableViewStateListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of((update) => {
        if (!viewStateKeyRef.current) return;
        const foldChanged = update.transactions.some((transaction) =>
          transaction.effects.some(
            (effect) => effect.is(foldEffect) || effect.is(unfoldEffect),
          ),
        );
        if (!update.selectionSet && !update.docChanged && !foldChanged) return;
        scheduleCodeEditorViewStateRef.current(update.view);
      }),
    [],
  );

  // Track the caret head so the breadcrumb strip and status bar can follow the
  // live CM6 selection. Commands and host authority are reported synchronously;
  // only the rendered caret chrome is coalesced, which keeps ordinary typing
  // from rebuilding the entire React editor on every character. The scheduler
  // callbacks are mount-stable, so the listener does not reconfigure CM.
  const caretListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return;
        const sel = update.state.selection;
        const head = sel.main.head;
        const line = update.state.doc.lineAt(head);
        const nextLineCol = {
          line: line.number,
          col: head - line.from + 1,
        };
        scheduleCaretRender(update.view, {
          offset: head,
          ...nextLineCol,
        });
        if (lastReportedCursorLineRef.current !== nextLineCol.line) {
          lastReportedCursorLineRef.current = nextLineCol.line;
          cursorLineChangeRef.current?.(nextLineCol.line);
        }
        // Selection summary (chars selected + cursor count) for the status bar.
        // Derived by the pure, unit-tested `selectionSummary`; only setState when
        // a value actually changed so a plain caret move that keeps both numbers
        // (e.g. arrow within an empty selection) doesn't churn React.
        const summary = selectionSummary(
          sel.ranges.map((r) => ({ from: r.from, to: r.to })),
        );
        const rawSelectedText = sel.ranges
          .filter((range) => !range.empty)
          .map((range) => update.state.doc.sliceString(range.from, range.to))
          .join("\n");
        const selectedTextTruncated = rawSelectedText.length > 20_000;
        const selectedText = selectedTextTruncated
          ? `${rawSelectedText.slice(0, 13_000)}\n…[middle omitted: selection limit]…\n${rawSelectedText.slice(-6_950)}`
          : rawSelectedText;
        const nonEmptyRanges = sel.ranges.filter((range) => !range.empty);
        const selectionFrom =
          nonEmptyRanges.length === 1 ? nonEmptyRanges[0].from : null;
        const selectionTo =
          nonEmptyRanges.length === 1 ? nonEmptyRanges[0].to : null;
        const nextSummary = {
          ...summary,
          selectedText,
          selectedTextTruncated,
          selectionFrom,
          selectionTo,
        };
        setSelSummary((prev) =>
          prev.selectedChars === nextSummary.selectedChars &&
          prev.cursorCount === nextSummary.cursorCount &&
          prev.selectedText === nextSummary.selectedText &&
          prev.selectedTextTruncated === nextSummary.selectedTextTruncated &&
          prev.selectionFrom === nextSummary.selectionFrom &&
          prev.selectionTo === nextSummary.selectionTo
            ? prev
            : nextSummary,
        );
        const nextExecutionState: CodeEditorExecutionState = {
          selectedChars: nextSummary.selectedChars,
          selectionCount:
            nextSummary.selectedChars > 0 ? nextSummary.cursorCount : 0,
          currentLine: nextLineCol.line,
          selectedText: nextSummary.selectedText,
          selectedTextTruncated: nextSummary.selectedTextTruncated,
          selectionFrom: nextSummary.selectionFrom,
          selectionTo: nextSummary.selectionTo,
        };
        const previousExecutionState = lastReportedExecutionStateRef.current;
        if (
          !previousExecutionState ||
          previousExecutionState.selectedChars !==
            nextExecutionState.selectedChars ||
          previousExecutionState.selectionCount !==
            nextExecutionState.selectionCount ||
          previousExecutionState.currentLine !== nextExecutionState.currentLine ||
          previousExecutionState.selectedText !==
            nextExecutionState.selectedText ||
          previousExecutionState.selectedTextTruncated !==
            nextExecutionState.selectedTextTruncated ||
          previousExecutionState.selectionFrom !==
            nextExecutionState.selectionFrom ||
          previousExecutionState.selectionTo !== nextExecutionState.selectionTo
        ) {
          lastReportedExecutionStateRef.current = nextExecutionState;
          executionStateChangeRef.current?.(nextExecutionState);
        }
      }),
    [scheduleCaretRender],
  );

  // Mirror only the two bounded history-availability booleans needed by the
  // host Edit ribbon. History depth can change only with a document transaction
  // (typing, undo, redo, format, replace), so geometry and selection-only updates
  // stay on a zero-work path and equal values never re-render React.
  const editHistoryListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (sharedUndoManager) {
          const next = {
            canUndo: sharedUndoManager.undoStack.length > 0,
            canRedo: sharedUndoManager.redoStack.length > 0,
          };
          setEditHistoryState((previous) =>
            previous.canUndo === next.canUndo &&
            previous.canRedo === next.canRedo
              ? previous
              : next,
          );
          return;
        }
        const next = {
          canUndo: undoDepth(update.state) > 0,
          canRedo: redoDepth(update.state) > 0,
        };
        setEditHistoryState((previous) =>
          previous.canUndo === next.canUndo &&
          previous.canRedo === next.canRedo
            ? previous
            : next,
        );
      }),
    [setEditHistoryState, sharedUndoManager],
  );

  // --- Emmet abbreviation expansion (VSCode parity: Tab) --------------------
  // For HTML / JSX / TSX / CSS, Tab tries to expand the abbreviation immediately
  // left of a COLLAPSED caret (`ul>li*3`, `div.card`, `m10`→`margin: 10px;`).
  // When the token expands, we replace it with the snippet (indented to the
  // buffer's style) and return true; otherwise we return FALSE so the chord
  // falls through to the next handler — `indentWithTab` — leaving normal Tab /
  // indent behavior intact. Mounted only for Emmet-capable languages, so every
  // other editor is byte-for-byte unchanged. Wrapped in Prec.high so it is
  // tried BEFORE the lower `keymap.of([indentWithTab])` in the extension list.
  // The expansion is the pure, unit-tested {@link expandEmmet}.
  const emmetSyntax = emmetSyntaxFor(language);
  const emmetIndentUnit = indentStyle.useTabs
    ? "\t"
    : " ".repeat(indentStyle.width);
  const emmetKeymap = useMemo<Extension>(() => {
    if (!emmetSyntax) return [];
    return Prec.high(
      keymap.of([
        {
          key: "Tab",
          run: (view) => {
            // Defer to autocomplete: when the completion popup is open Tab
            // accepts it, and when a snippet placeholder is active Tab advances
            // to the next field. Returning false lets the lower-precedence
            // completion / snippet keymaps handle the chord.
            if (
              completionStatus(view.state) === "active" ||
              hasNextSnippetField(view.state)
            ) {
              return false;
            }
            const sel = view.state.selection;
            // Only expand for a single, collapsed caret. With a real selection
            // or multiple cursors, Tab should indent — fall through.
            if (sel.ranges.length !== 1 || !sel.main.empty) return false;
            const head = sel.main.head;
            const line = view.state.doc.lineAt(head);
            const col = head - line.from;
            const token = emmetAbbreviationLeftOf(line.text, col);
            if (!token) return false;
            const expanded = expandEmmet(
              token.abbr,
              emmetSyntax,
              emmetIndentUnit,
            );
            if (expanded === null) return false;
            // Re-indent each continuation line of a multi-line snippet to the
            // abbreviation's own column, so a nested element lands under its
            // indented parent rather than at column 0.
            const baseIndent = line.text.slice(
              0,
              line.text.length - line.text.trimStart().length,
            );
            // The abbreviation may start mid-line (after the indent); preserve
            // only the indent prefix, not any preceding non-space text.
            const indentPrefix =
              token.start <= baseIndent.length ? baseIndent : "";
            const snippet = indentPrefix
              ? expanded
                  .split("\n")
                  .map((ln, idx) => (idx === 0 ? ln : indentPrefix + ln))
                  .join("\n")
              : expanded;
            const from = line.from + token.start;
            const to = head;
            // Place the caret at the FIRST empty leaf's content position when
            // there is one (between `>` and `</`), else at the snippet end —
            // a lightweight stand-in for Emmet's tab-stops.
            const caretInside = firstEmptyTagCaret(snippet);
            const caretPos =
              caretInside !== null ? from + caretInside : from + snippet.length;
            view.dispatch({
              changes: { from, to, insert: snippet },
              selection: EditorSelection.cursor(caretPos),
              userEvent: "input.complete",
              scrollIntoView: true,
            });
            return true;
          },
        },
      ]),
    );
  }, [emmetSyntax, emmetIndentUnit]);

  // Reset the Expand/Shrink selection history whenever the user moves the caret
  // by a NON-expand gesture (click, arrow keys, find) or edits the buffer — so a
  // later Shrink never restores a range that no longer makes sense. Our own
  // expand/shrink dispatches set `selfSelectingRef` so they don't self-clear the
  // stack they just modified. Stable identity (empty deps) — recreating it would
  // reconfigure CM. Reads/writes only refs, so it never triggers a re-render.
  const expandHistoryListener = useMemo<Extension>(
    () =>
      EditorView.updateListener.of((update) => {
        if (selfSelectingRef.current) return; // our own expand/shrink move
        if (update.docChanged || update.selectionSet) {
          if (expandHistoryRef.current.length > 0)
            expandHistoryRef.current = [];
        }
      }),
    [],
  );

  // Dismiss signature help whenever its buffer or service owner changes. This
  // covers ordinary edits plus same-text page switches and Python namespace
  // replacement; the next `(` / `,` can request a fresh hint. Bumping the
  // request id also invalidates any in-flight async lookup.
  useEffect(() => {
    sigHelpTriggerDocRef.current = null;
    dismissSignatureHelp();
  }, [language, pythonNamespace, viewStateKey, dismissSignatureHelp]);
  useEffect(() => {
    // The host echoing back an edit typed with the hint up is not a new
    // document: the hint asked for at that edit stays. (The ask is read from
    // the typing transaction, which the host may echo before or after the
    // request starts.) Any other replacement of the buffer dismisses it.
    const askedDoc = sigHelpTriggerDocRef.current;
    if (askedDoc !== null && viewRef.current?.state.doc === askedDoc) {
      return;
    }
    sigHelpTriggerDocRef.current = null;
    dismissSignatureHelp();
  }, [value, dismissSignatureHelp]);

  // --- Inlay hints (VSCode parity) ------------------------------------------
  // Async provider the inlayHintsExtension queries per viewport range: resolve
  // the single-buffer LanguageService (TS/JS only) and map the visible-range
  // inlay hints to `{text, offset, kind}`. The extension owns the CM6 lifecycle
  // (viewport-scoped recompute, debounce, generation guard); this callback just
  // produces the data. Total: a non-TS language, a missing service, or any throw
  // degrades to `[]` (inlayHints itself is non-throwing). The hints are
  // decorations only — they add NO characters to the document.
  const provideInlayHints = useCallback(
    async (fromOffset: number, toOffset: number): Promise<InlayHintItem[]> => {
      if (!intelligenceLanguage(language)) return [];
      if (hasCrossFileInlayHints) {
        const projectHints = await crossFileInlayHintsRef.current?.(
          fromOffset,
          toOffset,
        );
        if (
          crossFileIntelligenceRefreshKeyRef.current !==
          crossFileIntelligenceRefreshKey
        ) {
          return [];
        }
        if (projectHints != null) return projectHints;
      }
      const svc = await getTsService();
      // The compiler is dynamically imported; the view may have unmounted while we
      // awaited. The service host reads the live buffer, so a stale call is safe,
      // but bail if there's no service.
      if (!svc) return [];
      svc.markDirty();
      return inlayHints(svc, fromOffset, toOffset);
    },
    [
      crossFileIntelligenceRefreshKey,
      getTsService,
      hasCrossFileInlayHints,
      language,
    ],
  );

  // --- Code Lens (VSCode parity) --------------------------------------------
  // Async provider the codeLensExtension queries (whole-document, not per
  // viewport): resolve the single-buffer LanguageService (TS/JS only) and map the
  // navigation tree to `{name, line, nameOffset, refCount}`. The extension owns the
  // CM6 lifecycle (whole-doc compute, debounce, generation guard); this callback
  // just produces the data. Total: a non-TS language, a missing service, or any
  // throw degrades to `[]` (codeLenses itself is non-throwing). The lenses are
  // block decorations only — they add NO characters to the document.
  const provideCodeLenses = useCallback(async (): Promise<CodeLens[]> => {
    if (!intelligenceLanguage(language)) return [];
    if (hasCrossFileCodeLenses) {
      const projectLenses =
        await crossFileCodeLensesRef.current?.();
      if (
        crossFileIntelligenceRefreshKeyRef.current !==
        crossFileIntelligenceRefreshKey
      ) {
        return [];
      }
      if (projectLenses != null) return projectLenses;
    }
    const svc = await getTsService();
    // The compiler is dynamically imported; the service host reads the live
    // buffer, so a stale call is safe, but bail if there's no service.
    if (!svc) return [];
    svc.markDirty();
    return codeLenses(svc);
  }, [
    crossFileIntelligenceRefreshKey,
    getTsService,
    hasCrossFileCodeLenses,
    language,
  ]);

  // Clicking a code lens opens the References panel for the symbol at the lens's
  // name offset (the SAME panel as Shift+F12). Clamp the offset into the live doc
  // so a stale lens can never resolve against a deleted range. findReferences
  // re-runs the reference query at that offset and opens the panel.
  const onCodeLensClick = useCallback(
    (nameOffset: number) => {
      const view = viewRef.current;
      if (!view) return;
      const clamped = Math.min(Math.max(nameOffset, 0), view.state.doc.length);
      void findReferences(clamped);
    },
    [findReferences],
  );
  const formatCodeLensLabel = useCallback(
    (referenceCount: number) =>
      translationsRef.current("code.references.count", {
        count: referenceCount,
      }),
    [],
  );

  // Display-toggle extensions: each is appended only when its toggle is ON, so
  // the OFF (default) extension list is byte-for-byte the pre-feature editor.
  const displayExtensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [];
    if (wordWrapOn) exts.push(wordWrapExtension());
    if (renderWhitespaceOn) exts.push(renderWhitespaceExtension());
    if (bracketColorsOn) exts.push(bracketColorizationExtension());
    if (indentGuidesOn) exts.push(indentGuidesExtension());
    if (bracketPairGuidesOn) exts.push(bracketPairGuidesExtension());
    // Column rulers mount ONLY when the user configured ≥1 ruler column; with
    // none set (the default) the extension is absent and the editor is
    // byte-for-byte unchanged.
    if (rulerColumns.length > 0) exts.push(rulersExtension(rulerColumns));
    // Inlay hints mount ONLY for a TS/JS language with the pref ON; on every
    // other language (or when off) the extension is simply absent so the editor
    // is byte-for-byte unchanged. The provider reads the single-buffer
    // LanguageService over the visible range only.
    if (
      !lightweightMode &&
      inlayHintsOn &&
      intelligenceLanguage(language)
    ) {
      exts.push(inlayHintsExtension(provideInlayHints));
    }
    // Code Lens mounts ONLY for a TS/JS language with the pref ON; on every other
    // language (or when off) the extension is absent so the editor is
    // byte-for-byte unchanged. The provider reads the single-buffer
    // LanguageService over the WHOLE document (lenses are few); clicking a lens
    // opens the references panel for the symbol.
    if (
      !lightweightMode &&
      codeLensOn &&
      intelligenceLanguage(language)
    ) {
      exts.push(
        codeLensExtension(
          provideCodeLenses,
          onCodeLensClick,
          formatCodeLensLabel,
        ),
      );
    }
    // Inline CSS colour decorators mount ONLY for the CSS family (css/scss/less);
    // on every other language the extension is absent so the editor is
    // byte-for-byte unchanged. The swatches add no document characters — they are
    // pure decorations until the user picks a new colour. Always on for those
    // languages (VSCode shows colour decorators by default; no toggle needed).
    if (isColorDecoratorLanguage(language)) {
      exts.push(colorDecoratorExtension());
    }
    return exts;
  }, [
    wordWrapOn,
    renderWhitespaceOn,
    bracketColorsOn,
    indentGuidesOn,
    rulerColumns,
    lightweightMode,
    inlayHintsOn,
    codeLensOn,
    language,
    provideInlayHints,
    provideCodeLenses,
    onCodeLensClick,
    formatCodeLensLabel,
    bracketPairGuidesOn,
  ]);

  // Inline Peek (Mod-Alt-F12 / Alt-F12) — a single block widget fed via effects.
  // Stable identity (built once): it holds no per-render data and renders NOTHING
  // until a peek is opened, so mounting it always keeps the default editor
  // byte-for-byte unchanged.
  const peekExt = useMemo<Extension>(() => peekExtension(), []);

  // CodeWindow opts into the debugger gutter by supplying BOTH a controlled
  // line list and a toggle callback. All other CodeMirror hosts keep the exact
  // pre-debug extension list.
  const debugBreakpointCoordinationEnabled =
    debugBreakpointLines !== undefined &&
    onToggleDebugBreakpoint !== undefined;
  const debugBreakpointGutterExt = useMemo<Extension>(
    () =>
      debugBreakpointCoordinationEnabled
        ? debugBreakpointGutterExtension({
            onToggle: onToggleDebugBreakpoint,
            labelForLine: (line, active) =>
              t(
                active
                  ? "code.debugRemoveBreakpoint"
                  : "code.debugAddBreakpointCurrent",
                { line },
              ),
            onRebase: onRebaseDebugBreakpoints,
            shouldRebaseTransaction:
              shouldRebaseDebugBreakpointTransaction,
          })
        : [],
    [
      debugBreakpointCoordinationEnabled,
      onRebaseDebugBreakpoints,
      onToggleDebugBreakpoint,
      t,
    ],
  );

  // Change markers against the host's baseline (VS Code's SCM gutter). Mounted
  // only when a host supplies a baseline, so every other editor keeps its exact
  // gutter set. The write goes through the normal transaction path, so putting
  // one change back is one ordinary undo step.
  const revertDirtyHunk = useCallback(
    (hunk: DirtyDiffHunk) => {
      const view = viewRef.current;
      if (!view || effectiveReadOnly) return;
      const edit = revertDirtyDiffHunk(view.state.doc.toString(), hunk);
      if (!edit) return;
      view.dispatch({
        changes: edit,
        userEvent: "input.revertChange",
      });
      view.focus();
    },
    [effectiveReadOnly],
  );
  const [editorViewReady, setEditorViewReady] = useState(0);
  // The editor authors some diagnostics itself (a parse failure, an unclosed
  // bracket). Those are product copy and must speak the reader's language;
  // compiler and browser messages still pass through in their own.
  const diagnosticMessages = useCallback(
    (key: string, params?: Record<string, string>) =>
      t(`code.diagnostics.${key}`, params ?? {}),
    [t],
  );

  // Recomputed on every keystroke, so it steps aside in large-file mode with
  // every other whole-document pass — a change marker is never worth typing
  // latency.
  const dirtyDiffEnabled =
    typeof baselineContent === "string" && !lightweightMode;
  const dirtyDiffGutterExt = useMemo<Extension>(
    () =>
      dirtyDiffEnabled
        ? dirtyDiffGutterExtension({
            labelForKind: (kind) =>
              t(
                kind === "added"
                  ? "code.dirtyDiff.added"
                  : kind === "deleted"
                    ? "code.dirtyDiff.deleted"
                    : "code.dirtyDiff.modified",
              ),
            onRevert: revertDirtyHunk,
          })
        : [],
    [dirtyDiffEnabled, revertDirtyHunk, t],
  );
  // Recompute against the live value and publish; the field clears itself on any
  // document change, so markers are never drawn for a stale document.
  const dirtyDiffHunks = useMemo(
    () =>
      dirtyDiffEnabled
        ? computeDirtyDiffHunks(baselineContent as string, value)
        : [],
    [baselineContent, dirtyDiffEnabled, value],
  );
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !dirtyDiffEnabled) return;
    view.dispatch({ effects: setDirtyDiffHunksEffect.of(dirtyDiffHunks) });
  }, [dirtyDiffEnabled, dirtyDiffHunks, editorViewReady]);

  // The debugger line StateField is absent from ordinary editors. CodeWindow
  // opts in by passing `debugPausedLine` (including null); once mounted the field
  // stays stable and receives lightweight effects instead of reconfiguring CM
  // at every pause/step.
  const debugCoordinationEnabled = debugPausedLine !== undefined;
  const debugPausedLineExt = useMemo<Extension>(
    () =>
      debugCoordinationEnabled ? debugPausedLineExtension() : [],
    [debugCoordinationEnabled],
  );

  const extensions = useMemo<Extension[]>(
    () => [
      // A task pane floating over the editor's edge (the code window's dock,
      // office-ribbon/officeTaskPaneOverlay.ts): the cursor scrolls clear of
      // the card, never under it.
      taskPaneCoverScrollMargins,
      dirtyDiffGutterExt,
      readOnlyMutationBoundary,
      documentLengthMutationBoundary,
      externalValueHistoryBoundary,
      // Seeded with whatever the loader already holds — nothing, the first time
      // a session sees this language; the grammar itself on every page after
      // that, so only the first can show unhighlighted text. With the flag off
      // this is the synchronous extension, exactly as before.
      languageCompartment.of(
        peekLanguageExtension(language) ?? grammarGapExtension,
      ),
      // Tree-free folding (indent + #region markers) for the stream-mode
      // languages, whose `@codemirror/legacy-modes` grammar has no Lezer tree —
      // so CM6's default tree-based folding never folds them despite the gutter
      // rendering. Seeded with the current indent width so the indent measure
      // matches the editor's tab size.
      //
      // For the TREE-BACKED languages (js/ts/jsx/tsx/python/css/html/json/php/
      // sql/markdown), whose grammar already folds syntax/indentation, we mount
      // ONLY the supplementary `#region`/`#endregion` marker foldService: CM6's
      // default tree folding doesn't understand the marker convention, so a
      // region spanning siblings at the same nesting level (e.g. top-level
      // statements between `// #region` and `// #endregion`, or Python `# region`
      // / `# endregion`) wouldn't fold otherwise. The region service returns null
      // off a marker line, falling through to the grammar's own folding — so this
      // ADDS marker folding without disturbing existing syntax folds (the editor
      // is byte-for-byte unchanged on every non-marker line). `unknown` (plain
      // text) gets neither (no tree, no comment syntax to anchor markers).
      ...(isStreamModeLanguage(language)
        ? [streamFoldExtension(indentStyle.width)]
        : isTreeFoldLanguage(language)
          ? [regionFoldExtension()]
          : []),
      completionExtension(
        language,
        pythonNamespace,
        stableExtraIdentifiers,
        getTsService,
        stableCrossFileComplete,
        {
          lightweight: lightweightMode,
          projectCompletion: hasCrossFileProjectCompletions
            ? stableCrossFileProjectCompletions
            : undefined,
          providerFor: languageServices.providerFor,
        },
      ),
      // Automatic linting compiles or parses the WHOLE document after edits.
      // Large-file mode keeps the Problems command available but pauses this
      // background pass; crossing back below the threshold remounts the normal
      // linter and reports fresh diagnostics.
      lightweightMode
        ? []
        : lintExtensions(
            language,
            hasCrossFileDiagnostics ? stableCrossFileDiagnostics : undefined,
            diagnosticMessages,
            providerDiagnostics,
          ),
      lightweightMode ? [] : lintGutter(),
      // Accessible name for the `.cm-content` editing surface (axe
      // `aria-input-field-name`). Localized via next-intl, so SR users hear a
      // proper name for both the code and multi-buffer host-cell editors.
      contentAttributesExtension(t("code.editorAriaLabel")),
      // The `search()` extension installs the searchState field that
      // setSearchQuery / findNext / replaceAll operate on. basicSetup only adds
      // the search KEYMAP (which we disabled), not this field — so we add it
      // explicitly and drive it from our own find bar instead of CM's panel.
      search({ top: true }),
      hoverExtension,
      showHoverExtension,
      cmdClickHandler,
      // Alt/Option-click adds a caret (VSCode multi-cursor parity). Module-level
      // constant → stable identity, no dep needed.
      altClickAddsCursor,
      signatureTriggerHandler,
      // Emmet Tab expansion (HTML/CSS/JSX). Prec.high so it is tried before
      // `indentWithTab`; returns false (falls through to indent) when the token
      // left of the caret isn't an abbreviation. Empty [] for other languages.
      emmetKeymap,
      // Python call-site parameter-name inlay hints (VSCode parity). Returns []
      // for any non-Python buffer or a Python buffer with no kernel namespace, so
      // the extension list is byte-for-byte unchanged off the Python+kernel path.
      lightweightMode
        ? []
        : pythonInlayHintsExtension(language, pythonNamespace),
      keymap.of([indentWithTab]),
      // Configurable indentation (VSCode parity): the indent unit new lines /
      // Tab insert + the tab display width, held in a reconfigurable Compartment.
      // Seeded from `indentStyle` (detected from the buffer, default spaces-2);
      // `applyIndentStyle` reconfigures it live. Because the value tracks
      // `indentStyle`, a React-driven config rebuild reproduces the same indent.
      indentCompartment.of(indentExtensionFor(indentStyle)),
      shortcutKeymap,
      problemsToggleKeymap,
      scrollListener,
      documentGenerationListener,
      diagnosticListener,
      durableViewStateListener,
      // Caret tracker for the breadcrumb strip. Pure setState on selection
      // change; adds no decoration, so the rendered editor is unchanged.
      caretListener,
      // Undo/redo availability for host chrome. Doc changes only; equal-state
      // guard keeps the closed/default ribbon path off the render hot loop.
      editHistoryListener,
      // Expand/Shrink selection-history reset (refs only; no decoration / render).
      expandHistoryListener,
      // Inline Peek host (always mounted; renders nothing until opened).
      peekExt,
      // Controlled breakpoint gutter. Empty for ordinary editors/cells; the
      // standalone CodeWindow owns persistence and the sandboxed debug runner.
      debugBreakpointGutterExt,
      // Debugger current-statement marker. Empty for ordinary editor/cell
      // surfaces; CodeWindow mounts the inert field once and feeds it by effect.
      debugPausedLineExt,
      // Locate flash for jumps (inert until a jump flashes a line).
      LOCATED_LINE_EXTENSION,
      // Display toggles (word wrap / render whitespace / bracket colors). Empty
      // on the default OFF path so the extension list is byte-for-byte the
      // pre-feature editor.
      ...displayExtensions,
      // Empty array on the flag-OFF (default) path — no yCollab loaded, the
      // extension list is identical to the pre-collab editor.
      ...collabExtensions,
    ],
    [
      language,
      diagnosticMessages,
      dirtyDiffGutterExt,
      readOnlyMutationBoundary,
      documentLengthMutationBoundary,
      pythonNamespace,
      languageServices,
      lightweightMode,
      stableExtraIdentifiers,
      stableCrossFileProjectCompletions,
      hasCrossFileProjectCompletions,
      stableCrossFileComplete,
      stableCrossFileDiagnostics,
      hasCrossFileDiagnostics,
      providerDiagnostics,
      getTsService,
      hoverExtension,
      showHoverExtension,
      cmdClickHandler,
      signatureTriggerHandler,
      emmetKeymap,
      shortcutKeymap,
      problemsToggleKeymap,
      scrollListener,
      documentGenerationListener,
      diagnosticListener,
      durableViewStateListener,
      caretListener,
      editHistoryListener,
      expandHistoryListener,
      peekExt,
      debugBreakpointGutterExt,
      debugPausedLineExt,
      displayExtensions,
      collabExtensions,
      indentCompartment,
      indentStyle,
      grammarGapExtension,
      languageCompartment,
      t,
    ],
  );

  // Editor font-size zoom theme: scales the `.cm-content` font size to
  // BASE_FONT_SIZE * fontScale. At the default scale (1.0) we add NOTHING — the
  // inline `fontSize: BASE_FONT_SIZE` on the <CodeMirror> below already renders
  // the editor at exactly the pre-feature size, so the extension list is
  // byte-for-byte unchanged until the user zooms. line-height stays unitless so
  // it tracks the font size, and minimap/sticky geometry read live metrics.
  const theme = useMemo<Extension>(() => {
    const base = themeExtension(isDark);
    if (fontScale === FONT_SCALE_DEFAULT) return base;
    const px = Math.round(BASE_FONT_SIZE * fontScale * 100) / 100;
    const zoom = EditorView.theme({
      ".cm-content, .cm-gutters": { fontSize: `${px}px` },
    });
    return [base, zoom];
  }, [isDark, fontScale]);

  const applyLineNavigationRequest = useCallback(
    (view: EditorView, request: CodeLineNavigationRequest) => {
      if (
        lastLineNavigationRequestRef.current === request.requestId
      ) {
        return;
      }
      if (
        viewStateKeyRef.current !== undefined &&
        request.viewStateKey !== viewStateKeyRef.current
      ) {
        lastLineNavigationRequestRef.current = request.requestId;
        onLineNavigationRequestHandled?.(request.requestId);
        return;
      }
      const target = resolveCodeLineTarget(view.state.doc, request.line);
      lastLineNavigationRequestRef.current = request.requestId;
      onLineNavigationRequestHandled?.(request.requestId);
      view.dispatch({
        selection: EditorSelection.cursor(target.from),
        effects: EditorView.scrollIntoView(target.from, { y: "center" }),
        scrollIntoView: true,
      });
      if (request.focus) view.focus();
    },
    [onLineNavigationRequestHandled],
  );

  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      const shared = sharedCollabRef.current;
      if (shared?.localPageBuffer && shared.registerEditorOrigin) {
        editorOriginCleanupRef.current?.();
        const cleanup = shared.registerEditorOrigin(
          view.state.facet(ySyncFacet),
        );
        editorOriginCleanupRef.current =
          typeof cleanup === "function" ? cleanup : null;
      }
      // The change gutter's hunks are published by an effect that may have run
      // before this view existed; announce readiness so it publishes now.
      setEditorViewReady((ready) => ready + 1);
      const pendingNavigation = lineNavigationRequestRef.current;
      const pendingNavigationOwned =
        pendingNavigation !== undefined &&
        (viewStateKeyRef.current === undefined ||
          pendingNavigation.viewStateKey === viewStateKeyRef.current);
      // A host-requested debugger/navigation target is more recent and more
      // specific than a persisted viewport, so it deliberately wins. Otherwise
      // restore the exact selections and folded regions first, then the
      // viewport after CM's first layout pass (with an immediate write as a
      // no-flicker baseline).
      if (!pendingNavigationOwned) {
        const restored = loadCodeEditorViewState(
          viewStateKeyRef.current,
          view.state.doc.length,
        );
        if (restored) {
          try {
            view.dispatch({
              selection: EditorSelection.create(
                restored.ranges.map((range) =>
                  EditorSelection.range(range.anchor, range.head),
                ),
                restored.mainIndex,
              ),
              effects: (restored.folds ?? []).map((range) =>
                foldEffect.of({ from: range.from, to: range.to }),
              ),
            });
          } catch {
            // Storage is untrusted. The pure loader validates ordering/bounds,
            // and this final guard keeps a future CM invariant change harmless.
          }
          const restoreViewport = () => {
            if (viewRef.current !== view) return;
            view.scrollDOM.scrollTop = restored.scrollTop;
            view.scrollDOM.scrollLeft = restored.scrollLeft;
          };
          restoreViewport();
          if (typeof requestAnimationFrame === "function") {
            viewStateRestoreFrameRef.current =
              requestAnimationFrame(() => {
                viewStateRestoreFrameRef.current = null;
                restoreViewport();
                setScrollTick((tick) => tick + 1);
              });
          }
        }
      }
      if (debugPausedLineRef.current !== undefined) {
        view.dispatch({
          effects: setDebugPausedLineEffect.of(
            debugPausedLineRef.current ?? null,
          ),
        });
      }
      if (debugBreakpointLinesRef.current !== undefined) {
        view.dispatch({
          effects: setDebugBreakpointLinesEffect.of(
            debugBreakpointLinesRef.current,
          ),
        });
      }
      if (pendingNavigation) {
        applyLineNavigationRequest(view, pendingNavigation);
      }
      const pendingIntelligence =
        pendingIntelligenceCommandRequestRef.current;
      if (pendingIntelligence) {
        runIntelligenceCommand(pendingIntelligence);
      }
      const pendingExecution =
        pendingExecutionCommandRequestRef.current;
      if (pendingExecution) {
        runExecutionCommand(pendingExecution);
      }
      // First paint of the minimap once the view exists.
      setScrollTick((t) => t + 1);
    },
    [applyLineNavigationRequest, runExecutionCommand, runIntelligenceCommand],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view || debugBreakpointLines === undefined) return;
    view.dispatch({
      effects: setDebugBreakpointLinesEffect.of(debugBreakpointLines),
    });
  }, [debugBreakpointLines]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || debugUnboundBreakpointLines === undefined) return;
    view.dispatch({
      effects: setDebugUnboundBreakpointLinesEffect.of(
        debugUnboundBreakpointLines,
      ),
    });
  }, [debugUnboundBreakpointLines]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || debugPausedLine === undefined) return;
    view.dispatch({
      effects: setDebugPausedLineEffect.of(debugPausedLine),
    });
  }, [debugPausedLine]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !lineNavigationRequest) return;
    applyLineNavigationRequest(view, lineNavigationRequest);
  }, [applyLineNavigationRequest, lineNavigationRequest]);

  // The host's scroll port: the scroller of the view that is live now (a
  // remount creates a new one and reports it again).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !onScrollPortChange) return;
    onScrollPortChange(view.scrollDOM);
    return () => onScrollPortChange(null);
  }, [editorViewReady, onScrollPortChange]);

  // On unmount, drop the live-view ref. CM6 destroys the underlying view itself;
  // nulling the ref means any async continuation that survives the unmount (e.g.
  // applyRename's post-`await` path) sees `viewRef.current === null` and bails
  // instead of dispatching on a destroyed view.
  useEffect(() => {
    return () => {
      editorOriginCleanupRef.current?.();
      editorOriginCleanupRef.current = null;
      referenceResultRequestIdRef.current += 1;
      referenceResultBusyRef.current = false;
      viewRef.current = null;
      minimapDragCleanupRef.current?.();
      if (minimapScrubFrameRef.current !== null) {
        cancelAnimationFrame(minimapScrubFrameRef.current);
        minimapScrubFrameRef.current = null;
      }
      pendingMinimapClientYRef.current = null;
    };
  }, []);

  // Minimap viewport box geometry, recomputed on scroll/value change.
  const minimapHeight = minimapRef.current?.clientHeight ?? 0;
  const viewportBox = useMemo(() => {
    const scrollDOM = viewRef.current?.scrollDOM;
    if (!scrollDOM || minimapHeight <= 0) return { top: 0, height: 0 };
    return minimapViewport(
      {
        scrollTop: scrollDOM.scrollTop,
        scrollHeight: scrollDOM.scrollHeight,
        clientHeight: scrollDOM.clientHeight,
      },
      minimapHeight,
    );
    // scrollTick / lineCount intentionally drive the recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTick, minimapHeight, lineCount, value]);

  const scrubMinimap = useCallback((clientY: number) => {
    const view = viewRef.current;
    const strip = minimapRef.current;
    if (!view || !strip) return;
    const rect = strip.getBoundingClientRect();
    const pointerY = clientY - rect.top;
    const scrollDOM = view.scrollDOM;
    scrollDOM.scrollTop = scrollTopForPointer(pointerY, rect.height, {
      scrollTop: scrollDOM.scrollTop,
      scrollHeight: scrollDOM.scrollHeight,
      clientHeight: scrollDOM.clientHeight,
    });
    // The CM scroll listener is the single React invalidation source. Updating
    // scrollTick here as well made an active pointer drag render twice per move;
    // on high-frequency pointer streams that could exhaust React's nested-update
    // guard before pointerup arrived.
  }, []);

  
  // captured on the strip, which wears `touch-action: none` so a finger drags
  // the viewport instead of panning the page. A finger starts at once — the
  // strip is a scrollbar, not an object to pick up. A cancelled pointer (the
  // browser took the touch, a second finger, Escape, a lost window) puts the
  // editor back where the press found it; only a release keeps the scrub.
  const handleMinimapPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== undefined && event.button > 0) return;
      event.preventDefault();
      minimapDragCleanupRef.current?.();
      const scrollDOM = viewRef.current?.scrollDOM;
      const startScrollTop = scrollDOM?.scrollTop ?? null;
      scrubMinimap(event.clientY);

      const cancelPendingScrub = () => {
        if (minimapScrubFrameRef.current !== null) {
          cancelAnimationFrame(minimapScrubFrameRef.current);
          minimapScrubFrameRef.current = null;
        }
        const clientY = pendingMinimapClientYRef.current;
        pendingMinimapClientYRef.current = null;
        return clientY;
      };
      const forget = () => {
        if (minimapDragCleanupRef.current === cleanup) {
          minimapDragCleanupRef.current = null;
        }
      };
      const gesture = beginObjectDragGesture(
        event,
        {
          onMove: (moveEvent) => {
            pendingMinimapClientYRef.current = moveEvent.clientY;
            if (minimapScrubFrameRef.current !== null) return;
            minimapScrubFrameRef.current = requestAnimationFrame(() => {
              minimapScrubFrameRef.current = null;
              const clientY = pendingMinimapClientYRef.current;
              pendingMinimapClientYRef.current = null;
              if (clientY !== null) scrubMinimap(clientY);
            });
          },
          onEnd: () => {
            const clientY = cancelPendingScrub();
            if (clientY !== null) scrubMinimap(clientY);
            forget();
          },
          onCancel: (reason) => {
            cancelPendingScrub();
            forget();
            // an unmount (or a newer press) is not the reader's undo
            if (reason === "aborted") return;
            const live = viewRef.current?.scrollDOM;
            if (live && live === scrollDOM && startScrollTop !== null) {
              live.scrollTop = startScrollTop;
            }
          },
        },
        { immediate: true, clickSlopPx: 0 },
      );
      const cleanup = () => gesture.cancel("aborted");
      minimapDragCleanupRef.current = cleanup;
    },
    [scrubMinimap],
  );

  // --- Sticky scroll (VSCode parity) ----------------------------------------
  // The enclosing header lines for the line at the TOP of the viewport, computed
  // by the pure stickyHeaderLines() off the live document + the CM6 view's
  // current scroll geometry. Empty (and the overlay unrendered) whenever the
  // toggle is OFF, so the default editor is byte-for-byte unchanged. Recomputed
  // on scroll (scrollTick) and on value/toggle change.
  const stickyHeaders = useMemo<StickyHeader[]>(() => {
    if (!effectiveStickyScrollOn) return [];
    const view = viewRef.current;
    if (!view) return [];
    const scrollDOM = view.scrollDOM;
    // The 1-based line whose block sits at the viewport top; lineBlockAtHeight
    // takes a document-relative height (scrollTop + the gutter/content top), so
    // the line under the very top of the scrolled viewport is resolved directly.
    try {
      const block = view.lineBlockAtHeight(scrollDOM.scrollTop);
      const topLine = view.state.doc.lineAt(block.from).number; // 1-based
      // stickyHeaderLines is 0-based, so pass topLine - 1.
      return stickyHeaderLines(view.state.doc.toString(), topLine - 1);
    } catch {
      return [];
    }
    // scrollTick drives the recompute on scroll; value/toggle on edit/flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStickyScrollOn, scrollTick, value]);

  // Scroll the editor so a clicked sticky header lines up at the viewport top.
  const scrollToStickyHeader = useCallback((line0: number) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = lineToOffsetRange(view.state.doc.toString(), line0 + 1);
    view.dispatch({
      effects: EditorView.scrollIntoView(from, { y: "start" }),
      scrollIntoView: true,
    });
    setScrollTick((t) => t + 1);
  }, []);
  const intelNoticeIsError =
    !referenceResultBusy &&
    (intelNotice === t("document.capability.unavailable") ||
      intelNotice === t("code.palette.extensionFailed"));

  const codeMirrorValue = collabEnabled ? collabInitialValueRef.current : value;
  const toggleSnippetsFromSettings = useCallback(() => {
    const next = !snippetsOpen;
    setSnippetsOpen(next);
    if (next) closeSettingsMenu(false);
  }, [closeSettingsMenu, snippetsOpen]);

  // The floating toolbar and its always-mounted settings popover hold ~40
  // elements (plus the zoom dial). None of them reads the document, so a
  // content snapshot or a caret-driven render reuses the same element tree
  // instead of re-creating it.
  const editorToolbar = useMemo(
    () => (
    <div
      ref={settingsRef}
      data-testid="code-editor-toolbar"
      className={chrome.editorToolbar}
    >
      {/* The editor's own commands at its top-right edge wear the editors'
          shared floating toolbar (note-editor.css .floating-toolbar: the
          Docs / Slides / Sheet / PDF mini toolbar's card and keys), stood
          up as a column so it covers the minimap rather than the code. */}
      <div className={`floating-toolbar ${chrome.editorToolbarFace}`}>
      <button
        type="button"
        onClick={() => void doFormat()}
        disabled={!canFormat}
        aria-busy={formatBusy || undefined}
        title={
          formatBusy
            ? t("code.console.busy")
            : canFormat
              ? t("code.format")
              : formatSupported
                ? t("document.capability.unavailable")
                : t("code.formatUnsupported")
        }
        aria-label={t("code.format")}
        data-testid="code-format"
        className={floatingToolbarButtonClass(false)}
      >
        <AlignLeft size={16} />
      </button>
      {/* Compare / diff-merge toggle (VSCode-style "Compare"). Rendered only
          when the host wired compare sources, so a standalone editor shows no
          extra chrome and is byte-for-byte unchanged. */}
      {canCompare ? (
        <button
          type="button"
          onClick={() => (compareOpen ? closeCompare() : openCompare())}
          title={t("code.compare.toggle")}
          aria-label={t("code.compare.toggle")}
          aria-pressed={compareOpen}
          data-testid="code-compare-toggle"
          className={floatingToolbarButtonClass(compareOpen)}
        >
          <GitCompare size={16} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={toggleProblems}
        title={t("code.problems.toggle")}
        aria-label={t("code.problems.toggle")}
        aria-pressed={problemsOpen}
        data-testid="code-problems-toggle"
        className={floatingToolbarButtonClass(problemsOpen)}
      >
        <CircleAlert size={16} />
        {diagnosticCount > 0 ? (
          <span
            data-testid="code-problems-badge"
            aria-hidden
            className={chrome.editorToolbarBadge}
          >
            {diagnosticCount}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={toggleSettingsMenu}
        title={t("code.settings.menuLabel")}
        aria-label={t("code.settings.menuLabel")}
        aria-haspopup="dialog"
        aria-expanded={settingsOpen}
        data-testid="code-settings-toggle"
        className={floatingToolbarButtonClass(settingsOpen)}
      >
        <Settings2 size={16} />
      </button>
      </div>
      {/* The settings popover is the dialogs' card (code tone): a title, the
          view toggles as check rows, then the rulers and zoom fields. It stays
          mounted while closed (so every toggle's test id resolves); the
          `hidden` attribute shows and hides it (the chrome's [hidden] rule). */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={t("code.settings.menuLabel")}
        data-testid="code-settings-menu"
        className={`${officeDialogClassName({ tone: "code" })} office-pop-in ${chrome.popover}`}
        hidden={!settingsOpen}
        data-state={settingsOpen ? "open" : "closed"}
      >
        <div className={chrome.popoverBody}>
        <div className={`${officeDialogParts.header} ${chrome.popoverHeader}`}>
          <span className={officeDialogParts.title}>
            {t("code.settings.menuLabel")}
          </span>
        </div>
        <div className={chrome.checkList}>
        <SettingsToggleItem
          testId="code-minimap-toggle"
          icon={SETTINGS_ITEM_ICONS.minimap}
          label={t("code.settings.minimapLabel")}
          checked={minimapOn}
          onToggle={toggleMinimap}
          disabled={lightweightMode}
          disabledReason={performanceCopy.title}
        />
        <SettingsToggleItem
          testId="code-wordwrap-toggle"
          icon={SETTINGS_ITEM_ICONS.wordWrap}
          label={t("code.settings.wordWrapLabel")}
          checked={wordWrapOn}
          onToggle={toggleWordWrap}
        />
        <SettingsToggleItem
          testId="code-whitespace-toggle"
          icon={SETTINGS_ITEM_ICONS.pilcrow}
          label={t("code.settings.whitespaceLabel")}
          checked={renderWhitespaceOn}
          onToggle={toggleRenderWhitespace}
        />
        <SettingsToggleItem
          testId="code-bracket-colors-toggle"
          icon={SETTINGS_ITEM_ICONS.braces}
          label={t("code.settings.bracketColorsLabel")}
          checked={bracketColorsOn}
          onToggle={toggleBracketColors}
        />
        <SettingsToggleItem
          testId="code-indent-guides-toggle"
          icon={SETTINGS_ITEM_ICONS.alignLeft}
          label={t("code.settings.indentGuidesLabel")}
          checked={indentGuidesOn}
          onToggle={toggleIndentGuides}
        />
        <SettingsToggleItem
          testId="code-bracket-pair-guides-toggle"
          icon={SETTINGS_ITEM_ICONS.brackets}
          label={t("code.settings.bracketPairGuidesLabel")}
          checked={bracketPairGuidesOn}
          onToggle={toggleBracketPairGuides}
        />
        <SettingsToggleItem
          testId="code-sticky-scroll-toggle"
          icon={SETTINGS_ITEM_ICONS.pin}
          label={t("code.settings.stickyScrollLabel")}
          checked={stickyScrollOn}
          onToggle={toggleStickyScroll}
          disabled={lightweightMode}
          disabledReason={performanceCopy.title}
        />
        <SettingsToggleItem
          testId="code-inlay-hints-toggle"
          icon={SETTINGS_ITEM_ICONS.tags}
          label={t("code.settings.inlayHintsLabel")}
          checked={inlayHintsOn}
          onToggle={toggleInlayHints}
          disabled={lightweightMode}
          disabledReason={performanceCopy.title}
        />
        <SettingsToggleItem
          testId="code-code-lens-toggle"
          icon={SETTINGS_ITEM_ICONS.code}
          label={t("code.settings.codeLensLabel")}
          checked={codeLensOn}
          onToggle={toggleCodeLens}
          disabled={lightweightMode}
          disabledReason={performanceCopy.title}
        />
        <SettingsToggleItem
          testId="code-format-on-save-toggle"
          icon={SETTINGS_ITEM_ICONS.save}
          label={t("code.settings.formatOnSaveLabel")}
          checked={formatOnSaveOn}
          onToggle={toggleFormatOnSave}
        />
        <SettingsToggleItem
          testId="code-trim-trailing-on-save-toggle"
          icon={SETTINGS_ITEM_ICONS.pilcrow}
          label={t("code.settings.trimTrailingOnSaveLabel")}
          checked={trimTrailingOnSaveOn}
          onToggle={toggleTrimTrailingOnSave}
        />
        <SettingsToggleItem
          testId="code-insert-final-newline-toggle"
          icon={SETTINGS_ITEM_ICONS.pilcrow}
          label={t("code.settings.insertFinalNewlineLabel")}
          checked={insertFinalNewlineOn}
          onToggle={toggleInsertFinalNewline}
        />
        <SettingsToggleItem
          testId="code-trim-final-newlines-toggle"
          icon={SETTINGS_ITEM_ICONS.pilcrow}
          label={t("code.settings.trimFinalNewlinesLabel")}
          checked={trimFinalNewlinesOn}
          onToggle={toggleTrimFinalNewlines}
        />
        </div>
        {/* Column / vertical rulers (VSCode `editor.rulers`): a free-text
            comma-separated list of columns (e.g. "80, 120"). Committed on
            blur / Enter via commitRulerColumns, which parses + persists +
            normalizes; an empty value means no rulers (the default). */}
        <div
          role="group"
          aria-label={t("code.settings.rulersLabel")}
          className={`${officeDialogParts.row} ${chrome.fieldRow}`}
        >
          <span className={officeDialogParts.label}>
            {t("code.settings.rulersLabel")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={rulerDraft}
            onChange={(event) =>
              setRulerDraft(
                event.target.value.slice(0, MAX_EDITOR_RULER_DRAFT_CHARS),
              )
            }
            maxLength={MAX_EDITOR_RULER_DRAFT_CHARS}
            onBlur={() => commitRulerColumns(rulerDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRulerColumns(rulerDraft);
              }
            }}
            placeholder={t("code.settings.rulersPlaceholder")}
            title={t("code.settings.rulersHint")}
            aria-label={t("code.settings.rulersLabel")}
            data-testid="code-rulers-input"
            className={`${officeDialogParts.mono} ${chrome.rulersInput}`}
          />
        </div>
        <div
          role="group"
          aria-label={t("code.settings.zoomLabel")}
          className={`${officeDialogParts.row} ${chrome.fieldRow} ${chrome.zoomRow}`}
        >
          <span className={officeDialogParts.label}>
            {t("code.settings.zoomLabel")}
          </span>
          <span className={chrome.zoomDial}>
            <ContinuousZoomDial
            value={fontZoomPercent}
            min={FONT_ZOOM_MIN_PERCENT}
            max={FONT_ZOOM_MAX_PERCENT}
            defaultValue={FONT_ZOOM_DEFAULT_PERCENT}
            valueToPosition={fontZoomValueToPosition}
            positionToValue={fontZoomPositionToValue}
            formatter={formatFontZoomPercent}
            ariaValueText={formatFontZoomPercent}
            label={t("code.settings.zoomLabel")}
            resetLabel={t("code.settings.zoomReset")}
            testIdPrefix="code-settings"
            onPreview={previewFontZoomPercent}
            onChange={previewFontZoomPercent}
            onCommit={commitFontZoomPercent}
            keyboardPositionStep={
              1 / (FONT_ZOOM_MAX_PERCENT - FONT_ZOOM_MIN_PERCENT)
            }
            keyboardPagePositionStep={
              10 / (FONT_ZOOM_MAX_PERCENT - FONT_ZOOM_MIN_PERCENT)
            }
          />
          </span>
        </div>
        {/* The User snippets manager is a docked task pane now; the
            settings popover opens and closes it. */}
        <div className={chrome.checkList}>
        <SettingsToggleItem
          testId="code-snippets-toggle"
          icon={SETTINGS_ITEM_ICONS.braces}
          label={t("code.snippets.heading")}
          checked={snippetsOpen}
          onToggle={toggleSnippetsFromSettings}
        />
        </div>
        </div>
      </div>
    </div>
    ),
    [
      bracketColorsOn,
      bracketPairGuidesOn,
      canCompare,
      canFormat,
      closeCompare,
      codeLensOn,
      commitFontZoomPercent,
      commitRulerColumns,
      compareOpen,
      diagnosticCount,
      doFormat,
      fontZoomPercent,
      formatBusy,
      formatOnSaveOn,
      formatSupported,
      indentGuidesOn,
      inlayHintsOn,
      insertFinalNewlineOn,
      lightweightMode,
      minimapOn,
      openCompare,
      performanceCopy.title,
      previewFontZoomPercent,
      problemsOpen,
      renderWhitespaceOn,
      rulerDraft,
      settingsOpen,
      snippetsOpen,
      stickyScrollOn,
      t,
      toggleBracketColors,
      toggleBracketPairGuides,
      toggleCodeLens,
      toggleFormatOnSave,
      toggleIndentGuides,
      toggleInlayHints,
      toggleInsertFinalNewline,
      toggleMinimap,
      toggleProblems,
      toggleRenderWhitespace,
      toggleSettingsMenu,
      toggleSnippetsFromSettings,
      toggleStickyScroll,
      toggleTrimFinalNewlines,
      toggleTrimTrailingOnSave,
      toggleWordWrap,
      trimFinalNewlinesOn,
      trimTrailingOnSaveOn,
      wordWrapOn,
    ],
  );

  // The status bar is ~25 elements plus a zoom dial; its caret readouts
  // subscribe to the caret store themselves. Keep the element tree across
  // content snapshots that change none of its inputs.
    // The badge only exists in lightweight mode; outside it the character count
  // must not be an input, or every content snapshot would rebuild the bar.
  const performanceBadgeCharacterCount = lightweightMode
    ? performanceProfile.characterCount
    : undefined;
  const performanceBadgeReason = lightweightMode
    ? (performanceProfile.reason ?? undefined)
    : undefined;
  const statusBar = useMemo(
    () => (
      <OfficeStatusBar
        testId="code-status-bar"
        docked
        ariaLive="off"
        // The shared docked strip's material and ink (as the breadcrumbs
        // above the code); Code keeps only its compact row and monospace.
        className={chrome.statusBar}
        left={
          <>
        {lightweightMode ? (
          <button
            ref={performanceInfoButtonRef}
            type="button"
            data-testid="code-performance-mode"
            data-reason={performanceBadgeReason}
            data-source-characters={performanceBadgeCharacterCount}
            onClick={() => setPerformanceInfoOpen((open) => !open)}
            aria-expanded={performanceInfoOpen}
            aria-controls={performancePopoverId}
            aria-haspopup="dialog"
            title={`${performanceCopy.title}. ${performanceCopy.reason}`}
            aria-label={`${performanceCopy.title}. ${performanceCopy.reason}`}
            className={`${chrome.statusButton} ${chrome.statusBadge}`}
          >
            <Gauge size={11} aria-hidden="true" />
            <span>{performanceCopy.label}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleProblems}
          data-testid="code-status-problems"
          aria-pressed={problemsOpen}
          aria-keyshortcuts="Control+Shift+M Meta+Shift+M"
          title={`${t("code.problems.toggle")} · ${problemsStatusMessage} · Ctrl/⌘ Shift M`}
          aria-label={`${t("code.problems.toggle")}: ${problemsStatusMessage}`}
          className={chrome.statusButton}
          data-status-tone={
            diagnosticCount > 0
              ? "error"
              : grammarLoadStatus === "failed"
                ? "warning"
                : undefined
          }
        >
          {diagnosticCount === 0 && grammarLoadStatus === "failed" ? (
            <TriangleAlert size={11} aria-hidden="true" />
          ) : (
            <CircleAlert size={11} aria-hidden="true" />
          )}
          <span>
            {diagnosticCount > 0
              ? diagnosticCount
              : grammarLoadStatus === "ready"
                ? 0
                : grammarLoadStatus === "failed"
                  ? "!"
                  : "…"}
          </span>
        </button>
        {onRunSelection ? (
          <CodeCaretChromeSubscriber store={caretRenderStore}>
            {(caret) => (
          <button
            type="button"
            onClick={runExecutableSelection}
            data-testid="code-run-selection"
            aria-keyshortcuts="Shift+Enter"
            title={`${t("code.run")} · ${
              selSummary.selectedChars > 0
                ? t("code.statusBar.selectedChars", {
                    count: selSummary.selectedChars,
                  })
                : t("code.statusBar.cursor", {
                    line: caret.line,
                    col: caret.col,
                  })
            } · Shift+Enter`}
            aria-label={`${t("code.run")} · ${
              selSummary.selectedChars > 0
                ? t("code.statusBar.selectedChars", {
                    count: selSummary.selectedChars,
                  })
                : t("code.statusBar.cursor", {
                    line: caret.line,
                    col: caret.col,
                  })
            }`}
            className={chrome.statusButton}
            data-status-tone="action"
          >
            <Play size={11} aria-hidden="true" />
            {t("code.run")}
          </button>
            )}
          </CodeCaretChromeSubscriber>
        ) : null}
          </>
        }
        zoom={
          // Word's zoom sits in its status bar as a slider: its thumb reads
          // the percentage and opens the levels (above it).
          <span
            className={`${officeStatusBarStyles.zoomSlider} ${chrome.statusZoom}`}
          >
            <ContinuousZoomDial
              value={fontZoomPercent}
              min={FONT_ZOOM_MIN_PERCENT}
              max={FONT_ZOOM_MAX_PERCENT}
              defaultValue={FONT_ZOOM_DEFAULT_PERCENT}
              valueToPosition={fontZoomValueToPosition}
              positionToValue={fontZoomPositionToValue}
              formatter={formatFontZoomPercent}
              ariaValueText={formatFontZoomPercent}
              label={t("code.settings.zoomLabel")}
              resetLabel={t("code.settings.zoomReset")}
              testIdPrefix="code-status"
              menuSide="top"
              menuAlign="end"
              onPreview={previewFontZoomPercent}
              onChange={previewFontZoomPercent}
              onCommit={commitFontZoomPercent}
              keyboardPositionStep={
                1 / (FONT_ZOOM_MAX_PERCENT - FONT_ZOOM_MIN_PERCENT)
              }
              keyboardPagePositionStep={
                10 / (FONT_ZOOM_MAX_PERCENT - FONT_ZOOM_MIN_PERCENT)
              }
            />
          </span>
        }
        right={
          <>
        <button
          type="button"
          data-testid="code-status-indent"
          onClick={() =>
            applyIndentStyle({
              useTabs: !indentStyle.useTabs,
              width: indentStyle.width,
            })
          }
          title={t("code.statusBar.indentToggleTitle")}
          aria-label={t("code.statusBar.indentToggleTitle")}
          className={chrome.statusButton}
        >
          {indentText}
        </button>
        {onSourceEncodingChange ? (
          <button
            type="button"
            data-testid="code-status-encoding"
            onClick={() =>
              onSourceEncodingChange(nextCodeSourceEncoding(sourceEncoding))
            }
            title={
              sourceEncoding === "utf16le" || sourceEncoding === "utf16be"
                ? "UTF-16 LE / UTF-16 BE / UTF-8"
                : "UTF-8 / UTF-8 BOM"
            }
            aria-label={
              sourceEncoding === "utf16le" || sourceEncoding === "utf16be"
                ? "UTF-16 LE / UTF-16 BE / UTF-8"
                : "UTF-8 / UTF-8 BOM"
            }
            className={chrome.statusButton}
          >
            {codeSourceEncodingLabel(sourceEncoding)}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="code-status-eol"
          onClick={() => convertEolTo(eol === "CRLF" ? "LF" : "CRLF")}
          title={t("code.statusBar.eolToggleTitle")}
          aria-label={t("code.statusBar.eolToggleTitle")}
          className={chrome.statusButton}
        >
          {eol}
        </button>
        <CodeCaretChromeSubscriber store={caretRenderStore}>
          {(caret) => (
          <span
          data-testid="code-status-cursor"
          data-line={caret.line}
          data-column={caret.col}
          className={chrome.statusCursor}
        >
          {t("code.statusBar.cursor", {
            line: caret.line,
            col: caret.col,
          })}
          {/* "(N selected)" — VSCode parity: total chars across all ranges.
              Shown only when something is actually selected. */}
          {selSummary.selectedChars > 0 ? (
            <span data-testid="code-status-selection">
              {t("code.statusBar.selectedChars", {
                count: selSummary.selectedChars,
              })}
            </span>
          ) : null}
          {/* "N selections" — shown only with >1 cursor (multi-caret). */}
          {selSummary.cursorCount > 1 ? (
            <span data-testid="code-status-selection-count">
              {t("code.statusBar.selectionCount", {
                count: selSummary.cursorCount,
              })}
            </span>
          ) : null}
        </span>
          )}
        </CodeCaretChromeSubscriber>
          </>
        }
      />
    ),
    [
      applyIndentStyle,
      caretRenderStore,
      commitFontZoomPercent,
      convertEolTo,
      diagnosticCount,
      eol,
      fontZoomPercent,
      grammarLoadStatus,
      indentStyle.useTabs,
      indentStyle.width,
      indentText,
      lightweightMode,
      onRunSelection,
      onSourceEncodingChange,
      performanceBadgeCharacterCount,
      performanceBadgeReason,
      performanceCopy.label,
      performanceCopy.reason,
      performanceCopy.title,
      performanceInfoOpen,
      performancePopoverId,
      previewFontZoomPercent,
      problemsOpen,
      problemsStatusMessage,
      runExecutableSelection,
      selSummary.cursorCount,
      selSummary.selectedChars,
      sourceEncoding,
      t,
      toggleProblems,
    ],
  );

  return (
    <div
      ref={editorRootRef}
      data-testid={editorTestId}
      style={{
        flex: 1,
        // A three-way review needs both merge panes AND the conflict decisions.
        // A short host (a 3-line multi-buffer host cell) would otherwise squeeze the
        // previews to a sliver, so the overlay claims a workable height for as
        // long as it is open and gives it straight back on close.
        minHeight: compareOpen && compareThreeWayActive ? 380 : 160,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: isDark ? undefined : "#ffffff",
      }}
    >
      {/*
        Visually-hidden polite live region: announces dynamic editor state
        (lint problem count, find match count, reference/symbol count) to screen
        readers without any visual footprint. The text is debounced + deduped
        upstream (announcement state), so it changes only when the announced value
        changes — a polite region re-reads on every mutation, so feeding it
        unchanged values would spam AT users. `role="status"` is the implicit
        aria-live="polite" + aria-atomic semantics; we set both explicitly for
        cross-AT robustness. Kept out of the visual flow via the standard
        clip-rect sr-only pattern (no display:none — that would hide it from AT).
      */}
      <div
        data-testid="code-a11y-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={srOnlyStyle}
      >
        {announcement}
      </div>

      {findOpen ? (
        // The Docs Find and Replace card (note-editor.css
        // .note-editor-find-replace) in the dialogs' chrome, in the code tone:
        // a search row, an options row and a replace row. Every control, test
        // id and keyboard path of the old strip is kept.
        <div
          data-testid="code-find-bar"
          role="search"
          aria-label={t("code.a11y.findLabel")}
          className={CODE_FIND_CARD_CLASS}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeFind();
            }
          }}
        >
          <div className="note-editor-find-replace__search-row">
            <label className="note-editor-find-replace__field">
              <Search size={14} aria-hidden="true" />
              <input
                ref={findInputRef}
                data-testid="code-find-input"
                className={`note-editor-find-replace__input ${chrome.mono}`}
                value={query}
                onChange={(event) =>
                  setQuery(boundFindQuery(event.target.value))
                }
                maxLength={MAX_FIND_QUERY_CHARS}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goToMatch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder={t("code.find.findPlaceholder")}
                // A placeholder is not a reliable accessible name; name the
                // field explicitly so SR users hear "Find" when it takes focus.
                aria-label={t("code.find.findPlaceholder")}
              />
            </label>
            <span
              title={findErrorTitle ?? undefined}
              className={`note-editor-find-replace__count${
                regexError ? ` ${officeDialogParts.error}` : ""
              }`}
              data-testid="code-find-count"
            >
              {regexError
                ? "⚠ regex"
                : replacementPlanFailed
                  ? "⚠ replace"
                  : countLabel}
            </span>
            <button
              type="button"
              onClick={() => goToMatch(-1)}
              title={t("code.find.previousMatch")}
              aria-label={t("code.find.previousMatch")}
              data-testid="code-find-prev"
              className="note-editor-find-replace__button"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => goToMatch(1)}
              title={t("code.find.nextMatch")}
              aria-label={t("code.find.nextMatch")}
              data-testid="code-find-next"
              className="note-editor-find-replace__button"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={closeFind}
              title={t("code.find.close")}
              aria-label={t("code.find.close")}
              data-testid="code-find-close"
              className="note-editor-find-replace__button"
            >
              <X size={14} />
            </button>
          </div>
          <div className="note-editor-find-replace__options">
            <button
              type="button"
              onClick={() => setCaseSensitive((v) => !v)}
              title={t("code.find.matchCase")}
              aria-pressed={caseSensitive}
              data-testid="code-find-case"
              className={findToggleClassName(caseSensitive)}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setWholeWord((v) => !v)}
              title={t("code.find.wholeWord")}
              aria-label={t("code.find.wholeWord")}
              aria-pressed={wholeWord && !useRegex}
              disabled={useRegex}
              data-testid="code-find-wholeword"
              className={findToggleClassName(wholeWord && !useRegex)}
            >
              W
            </button>
            <button
              type="button"
              onClick={() => setUseRegex((v) => !v)}
              title={t("code.find.useRegex")}
              aria-label={t("code.find.useRegex")}
              aria-pressed={useRegex}
              data-testid="code-find-regex"
              className={`${findToggleClassName(useRegex)} ${chrome.mono}`}
            >
              .*
            </button>
            <button
              type="button"
              onClick={toggleInSelection}
              title={t("code.find.findInSelection")}
              aria-label={t("code.find.findInSelection")}
              aria-pressed={inSelection}
              data-testid="code-find-inselection"
              className={findToggleClassName(inSelection)}
            >
              ⊂
            </button>
            <button
              type="button"
              onClick={() => setPreserveCaseOn((v) => !v)}
              title={t("code.find.preserveCase")}
              aria-label={t("code.find.preserveCase")}
              aria-pressed={preserveCaseOn}
              data-testid="code-find-preservecase"
              className={findToggleClassName(preserveCaseOn)}
            >
              AB
            </button>
          </div>
          <div className="note-editor-find-replace__search-row">
            <input
              data-testid="code-replace-input"
              className={`note-editor-find-replace__input note-editor-find-replace__input--replace ${chrome.mono}`}
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              maxLength={4_096}
              placeholder={t("code.find.replacePlaceholder")}
              aria-label={t("code.find.replacePlaceholder")}
            />
            <button
              type="button"
              onClick={doReplace}
              disabled={Boolean(regexError) || replacementPlanFailed}
              data-testid="code-replace-one"
              title={findErrorTitle ?? t("code.find.replace")}
              aria-label={findErrorTitle ?? t("code.find.replace")}
              className="note-editor-find-replace__action"
            >
              {t("code.find.replace")}
            </button>
            <button
              type="button"
              onClick={doReplaceAll}
              disabled={Boolean(regexError) || replacementPlanFailed}
              data-testid="code-replace-all"
              title={findErrorTitle ?? t("code.find.replaceAll")}
              aria-label={findErrorTitle ?? t("code.find.replaceAll")}
              className="note-editor-find-replace__action"
            >
              {t("code.find.replaceAllShort")}
            </button>
          </div>
        </div>
      ) : null}

      {gotoOpen ? (
        // Go To in the same card and chrome as Find (Word's Go To is a tab
        // of its Find and Replace dialog).
        <div
          data-testid="code-goto-bar"
          className={CODE_FIND_CARD_CLASS}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setGotoOpen(false);
              focusView();
            }
          }}
        >
          <div className="note-editor-find-replace__search-row">
            <input
              ref={gotoInputRef}
              data-testid="code-goto-input"
              className={`note-editor-find-replace__input ${chrome.mono}`}
              value={gotoValue}
              onChange={(event) =>
                setGotoValue(
                  event.target.value
                    .replace(/\D/gu, "")
                    .slice(0, gotoInputMaxLength),
                )
              }
              maxLength={gotoInputMaxLength}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runGoto();
                }
              }}
              placeholder={t("code.find.gotoLinePlaceholder", {
                max: documentLineCount,
              })}
              aria-label={t("code.find.gotoLinePlaceholder", {
                max: documentLineCount,
              })}
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={runGoto}
              data-testid="code-goto-go"
              className="note-editor-find-replace__action"
            >
              {t("code.find.goto")}
            </button>
            <button
              type="button"
              onClick={() => {
                setGotoOpen(false);
                focusView();
              }}
              title={t("code.find.gotoClose")}
              aria-label={t("code.find.gotoClose")}
              data-testid="code-goto-close"
              className="note-editor-find-replace__button"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {renameOpen ? (
        // Rename Symbol in the Find family's card (code tone), as Go To: its
        // title, the new name with Rename and Cancel, and the reason a name
        // was refused under them.
        <div
          data-testid="code-rename-bar"
          className={CODE_FIND_CARD_CLASS}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setRenameOpen(false);
              focusView();
            }
          }}
        >
          <header className="note-editor-find-replace__header">
            <span className="note-editor-find-replace__title">
              {t("code.rename.title")}
            </span>
          </header>
          <div className="note-editor-find-replace__search-row">
            <input
              ref={renameInputRef}
              data-testid="code-rename-input"
              className={`note-editor-find-replace__input ${chrome.mono}`}
              value={renameValue}
              onChange={(event) => {
                setRenameValue(
                  event.target.value.slice(0, MAX_CODE_IDENTIFIER_CHARS),
                );
                if (renameError) setRenameError(null);
              }}
              maxLength={MAX_CODE_IDENTIFIER_CHARS}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void applyRename();
                }
              }}
              placeholder={t("code.rename.placeholder")}
              aria-label={t("code.rename.title")}
              aria-invalid={renameError != null}
            />
            <button
              type="button"
              onClick={() => void applyRename()}
              data-testid="code-rename-submit"
              className="note-editor-find-replace__action"
            >
              {t("code.rename.submit")}
            </button>
            <button
              type="button"
              onClick={() => {
                setRenameOpen(false);
                focusView();
              }}
              data-testid="code-rename-cancel"
              className="note-editor-find-replace__action"
            >
              {t("code.rename.cancel")}
            </button>
          </div>
          {renameError ? (
            <p
              data-testid="code-rename-error"
              role="alert"
              className={`${officeDialogParts.error} ${chrome.cardMessage}`}
            >
              {renameError}
            </p>
          ) : null}
        </div>
      ) : null}

      {shortcutsOpen ? (
        // Keyboard Shortcuts over the editor in the dialogs' chrome (code
        // tone), laid flat: the title row with its search field, count and
        // round close, then each group as a chrome section of label/keys rows.
        <div
          ref={shortcutsPanelRef}
          data-testid="code-shortcuts-panel"
          role="dialog"
          aria-modal="false"
          aria-label={t("code.shortcuts.title")}
          tabIndex={-1}
          className={`${CODE_SURFACE_CLASS} ${chrome.overlay} ${chrome.shortcutsLayer}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeShortcuts();
            }
          }}
        >
          <div className={`${officeDialogParts.header} ${chrome.surfaceHeader}`}>
            <span className={chrome.surfaceTitle}>
              <Keyboard size={16} aria-hidden />
              <span className={officeDialogParts.title}>
                {t("code.shortcuts.title")}
              </span>
            </span>
            <span className={`${officeDialogParts.inputGroup} ${chrome.surfaceSearch}`}>
              <Search size={14} aria-hidden />
              <input
                data-testid="code-shortcuts-search"
                value={shortcutsQuery}
                onChange={(event) =>
                  setShortcutsQuery(
                    event.target.value.slice(0, MAX_EDITOR_COMMAND_INPUT_CHARS),
                  )
                }
                maxLength={MAX_EDITOR_COMMAND_INPUT_CHARS}
                placeholder={t("code.shortcuts.search")}
                aria-label={t("code.shortcuts.search")}
              />
            </span>
            <span
              data-testid="code-shortcuts-count"
              className={officeDialogParts.hint}
            >
              {t("code.shortcuts.count", { count: visibleShortcuts.length })}
            </span>
            <button
              type="button"
              onClick={closeShortcuts}
              title={t("code.shortcuts.close")}
              aria-label={t("code.shortcuts.close")}
              data-testid="code-shortcuts-close"
              className={officeDialogParts.close}
            >
              <X size={12} />
            </button>
          </div>
          <div className={chrome.surfaceList}>
            {visibleShortcuts.length === 0 ? (
              <p
                data-testid="code-shortcuts-empty"
                className={officeDialogParts.message}
              >
                {t("code.shortcuts.empty")}
              </p>
            ) : (
              SHORTCUT_GROUP_ORDER.map((group) => {
                const rows = visibleShortcuts.filter(
                  (shortcut) => shortcut.group === group,
                );
                if (rows.length === 0) return null;
                return (
                  <section
                    key={group}
                    data-testid="code-shortcuts-group"
                    aria-label={t(SHORTCUT_GROUP_LABEL_KEYS[group])}
                    className={`${officeDialogParts.group} ${chrome.shortcutGroup}`}
                  >
                    <h3 className={officeDialogParts.sectionTitle}>
                      {t(SHORTCUT_GROUP_LABEL_KEYS[group])}
                    </h3>
                    <dl className={chrome.shortcutList}>
                      {rows.map((shortcut) => (
                        <div
                          key={shortcut.id}
                          data-testid="code-shortcuts-row"
                          className={chrome.shortcutRow}
                        >
                          <dt>{t(shortcut.labelKey)}</dt>
                          <dd
                            data-testid="code-shortcuts-chord"
                            className={`${officeDialogParts.mono} ${chrome.keycap}`}
                          >
                            {formatShortcutKeys(shortcut.keys, isMacPlatform)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {refsOpen ? (
        // References in the Find family's card (code tone): the title with
        // its count and close, a filter field, then the results as chrome
        // list rows. Every test id, key path and the focus contract are kept.
        <div
          ref={refsPanelRef}
          data-testid="code-references-panel"
          role="dialog"
          aria-modal="false"
          aria-label={referencePanelTitle}
          // tabIndex=-1: accepts the programmatic focus we move in on open (so Esc
          // works immediately) without itself joining the Tab cycle. Tab still
          // reaches the list buttons inside — no focus trap.
          tabIndex={-1}
          className={CODE_FIND_CARD_CLASS}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLocaleLowerCase() === "f"
            ) {
              event.preventDefault();
              event.stopPropagation();
              refFilterInputRef.current?.focus();
              return;
            }
            if (event.key === "Escape") {
              if (
                event.target === refFilterInputRef.current &&
                refQuery.length > 0
              ) {
                event.preventDefault();
                event.stopPropagation();
                setRefQuery("");
                setRefVisibleLimit(CODE_REFERENCE_PANEL_INITIAL_LIMIT);
                return;
              }
              event.preventDefault();
              closeReferences();
              return;
            }
            if (
              event.target === refFilterInputRef.current &&
              event.key === "ArrowDown"
            ) {
              const first = event.currentTarget.querySelector<HTMLElement>(
                '[data-testid="code-reference-item"]',
              );
              if (first) {
                event.preventDefault();
                first.focus();
              }
              return;
            }
            if (
              event.target instanceof HTMLButtonElement &&
              event.target.dataset.testid === "code-reference-item" &&
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              const rows = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[data-testid="code-reference-item"]',
                ),
              );
              const currentIndex = rows.indexOf(event.target);
              if (currentIndex === -1 || rows.length === 0) return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? rows.length - 1
                    : event.key === "ArrowDown"
                      ? Math.min(currentIndex + 1, rows.length - 1)
                      : Math.max(currentIndex - 1, 0);
              rows[nextIndex]?.focus();
            }
          }}
        >
          <header className="note-editor-find-replace__header">
            <span
              data-testid="code-references-title"
              className="note-editor-find-replace__title"
            >
              <ListTree size={16} aria-hidden />
              {referencePanelTitle}
            </span>
            <span className={chrome.headerEnd}>
              <span
                data-testid="code-references-count"
                className="note-editor-find-replace__count"
              >
                {t("code.references.count", { count: refList.length })}
              </span>
              <button
                type="button"
                onClick={closeReferences}
                title={t("code.references.close")}
                aria-label={t("code.references.close")}
                data-testid="code-references-close"
                className="note-editor-find-replace__button"
              >
                <X size={14} />
              </button>
            </span>
          </header>
          <div className="note-editor-find-replace__search-row">
            <label className="note-editor-find-replace__field">
              <Search size={14} aria-hidden="true" />
              <input
                ref={refFilterInputRef}
                type="search"
                value={refQuery}
                maxLength={128}
                onChange={(event) => {
                  setRefQuery(event.currentTarget.value);
                  setRefVisibleLimit(CODE_REFERENCE_PANEL_INITIAL_LIMIT);
                }}
                placeholder={t("code.find.findPlaceholder")}
                aria-label={t("code.find.findPlaceholder")}
                data-testid="code-references-filter"
                className="note-editor-find-replace__input"
              />
            </label>
            <span
              data-testid="code-references-visible-count"
              aria-live="polite"
              className="note-editor-find-replace__count"
            >
              {visibleReferenceEntries.length}/{filteredReferenceEntries.length}/
              {refList.length}
            </span>
          </div>
          <div
            role="list"
            aria-label={referencePanelTitle}
            className={`note-editor-find-replace__results ${chrome.results}`}
          >
            {visibleReferenceEntries.length === 0 ? (
              <p
                data-testid="code-references-filter-empty"
                role="status"
                className="note-editor-find-replace__empty"
              >
                {t("code.findInFiles.empty")}
              </p>
            ) : null}
            {visibleReferenceEntries.map(
              ({ ref, sourceIndex, preview, cellLabel }) => (
              <button
                key={`${ref.cellId ?? ""}:${ref.from}:${ref.to}`}
                type="button"
                role="listitem"
                onClick={() => jumpToReference(sourceIndex)}
                data-testid="code-reference-item"
                data-reference-line={ref.line}
                data-active={sourceIndex === refActiveIndex ? "true" : "false"}
                data-selected={sourceIndex === refActiveIndex || undefined}
                aria-current={
                  sourceIndex === refActiveIndex ? "true" : undefined
                }
                title={preview}
                className={CODE_LIST_ROW_CLASS}
              >
                {cellLabel ? (
                  // Cross-file (cross-cell) entry: show which file/cell it lives
                  // in so references spanning the shared scope are disambiguated.
                  <span
                    data-testid="code-reference-cell"
                    className={chrome.rowAccent}
                  >
                    {cellLabel}
                  </span>
                ) : null}
                <span className={`${officeDialogParts.hint} ${chrome.rowMeta}`}>
                  {t("code.references.lineLabel", { line: ref.line })}
                </span>
                <span className={chrome.rowText}>{preview || " "}</span>
              </button>
              ),
            )}
            {hiddenReferenceCount > 0 ? (
              <div className={chrome.moreRow}>
                <button
                  type="button"
                  onClick={() =>
                    setRefVisibleLimit((current) =>
                      current + CODE_REFERENCE_PANEL_INITIAL_LIMIT,
                    )
                  }
                  data-testid="code-references-show-more"
                  className={officeDialogParts.compactButton}
                >
                  {t("code.references.showMore")}
                </button>
                <span className={officeDialogParts.hint}>
                  {t("code.references.hidden", {
                    count: hiddenReferenceCount,
                  })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Problems panel (VSCode parity): reports the exact total while rendering
          only a bounded diagnostic window, each with severity, 1-based line:col,
          message, and click-to-jump selection. Mirrors the references panel
          (role=dialog, tabIndex=-1 to receive programmatic focus on open, Escape
          closes via the editor keymap). Renders in-flow above the editor host;
          closed by default so an editor that never opens it is unchanged. */}
      {problemsOpen ? (
        // The Problems list as a docked Office task pane (code tone): the
        // count in the title row, the severity filters in a section, the list
        // in the pane's scrolling body. Every test id, filter and key path is
        // kept; the keyboard lands on the pane's close button when it opens.
        <CodeDockedPane docks={taskPaneDocks} pane="problems">
        <OfficeTaskPane
          title={t("code.problems.title")}
          closeLabel={t("code.problems.close")}
          onClose={closeProblems}
          testIdPrefix="code-problems"
          testId="code-problems-panel"
          closeTestId="code-problems-close"
          closeRef={problemsPanelRef}
          dockRight={false}
          dataAttributes={{
            "data-diagnostics-status": grammarLoadStatus,
            "data-total-count": String(diagnosticCount),
            "data-filtered-count": String(filteredProblemCount),
            "data-rendered-count": String(problemList.length),
            ...(problemListTruncated ? { "data-truncated": "true" } : {}),
          }}
          // In place (no dock) it keeps the old strip's bounded height.
          style={taskPaneDocks ? undefined : { maxHeight: 240 }}
          headerActions={
            <span
              data-testid="code-problems-count"
              className={officeDialogParts.hint}
            >
              {problemsCountMessage}
            </span>
          }
        >
          <div className={`${officeTaskPaneParts.section} ${officeDialogParts.row}`}>
            {problemListTruncated ? (
              <span
                data-testid="code-problems-rendered-count"
                aria-label={`${problemList.length} / ${filteredProblemCount}`}
                className={`${officeDialogParts.hint} ${chrome.rowMeta}`}
              >
                {problemList.length} / {filteredProblemCount}
              </span>
            ) : null}
            <div
              role="group"
              aria-label={t("code.problems.title")}
              data-testid="code-problems-severity-filters"
              className={chrome.filterGroup}
            >
              {PROBLEM_SEVERITY_GROUPS.map((severity) => {
                const label = t(
                  severity === "error"
                    ? "code.problems.severity.error"
                    : severity === "warning"
                      ? "code.problems.severity.warning"
                      : "code.problems.severity.info",
                );
                const count = problemSeverityCounts[severity];
                const pressed = problemSeverityVisibility[severity];
                return (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={pressed}
                    aria-label={`${label}: ${count}`}
                    title={`${label}: ${count}`}
                    data-testid={`code-problems-filter-${severity}`}
                    onClick={() => toggleProblemSeverity(severity)}
                    className={`${officeDialogParts.compactButton} ${chrome.severityFilter}`}
                  >
                    <span aria-hidden className={chrome.severity} data-severity={severity}>
                      {severity === "error" ? (
                        <CircleAlert size={12} />
                      ) : severity === "warning" ? (
                        <TriangleAlert size={12} />
                      ) : (
                        <Info size={12} />
                      )}
                    </span>
                    <span aria-hidden="true">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className={officeTaskPaneParts.body}>
          {grammarLoadStatus !== "ready" ? (
            <div
              data-testid="code-problems-grammar-status"
              role="status"
              data-tone={grammarLoadStatus === "failed" ? "warning" : undefined}
              className={`${officeDialogParts.message} ${chrome.paneStatus}`}
            >
              <span>{grammarStatusMessage}</span>
              {grammarLoadStatus === "failed" ? (
                <button
                  type="button"
                  onClick={retryGrammarLoad}
                  data-testid="code-grammar-retry"
                  className={officeDialogParts.compactButton}
                >
                  {t("code.grammar.retry")}
                </button>
              ) : null}
            </div>
          ) : null}
          {grammarLoadStatus === "ready" && problemList.length === 0 ? (
            // Empty state: no list rendered, just the "No problems" message.
            <div
              data-testid="code-problems-empty"
              role="status"
              className="document-outline-panel-empty office-rise-in"
            >
              {diagnosticCount === 0
                ? t("code.problems.none")
                : t("code.problems.count", { count: 0 })}
            </div>
          ) : null}
          {problemList.length > 0 ? (
            <div
              role="list"
              aria-label={t("code.problems.title")}
              className={chrome.paneRows}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                const target = event.target;
                if (!(target instanceof HTMLButtonElement)) return;
                const controls = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    'button[data-testid="code-problem-item"]:not(:disabled)',
                  ),
                );
                const currentIndex = controls.indexOf(target);
                if (currentIndex < 0 || controls.length === 0) return;
                let nextIndex: number;
                if (event.key === "ArrowDown") {
                  nextIndex = (currentIndex + 1) % controls.length;
                } else if (event.key === "ArrowUp") {
                  nextIndex =
                    (currentIndex - 1 + controls.length) % controls.length;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = controls.length - 1;
                } else {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                controls[nextIndex]?.focus();
              }}
            >
              {problemList.map((problem, index) => {
                const severityLabel = t(
                  problem.severity === "error"
                    ? "code.problems.severity.error"
                    : problem.severity === "warning"
                      ? "code.problems.severity.warning"
                      : "code.problems.severity.info",
                );
                return (
                  <button
                    key={`${problem.from}:${problem.to}:${index}`}
                    type="button"
                    role="listitem"
                    onClick={() => jumpToProblem(problem)}
                    disabled={!problem.navigable}
                    data-testid="code-problem-item"
                    data-severity={problem.severity}
                    data-navigable={problem.navigable ? "true" : "false"}
                    title={problem.message}
                    className={`${CODE_LIST_ROW_CLASS} ${chrome.problemRow}`}
                  >
                    <span
                      aria-label={severityLabel}
                      title={severityLabel}
                      className={chrome.severity}
                      data-severity={problem.severity}
                    >
                      {problem.severity === "error" ? (
                        <CircleAlert size={13} />
                      ) : problem.severity === "warning" ? (
                        <TriangleAlert size={13} />
                      ) : (
                        <Info size={13} />
                      )}
                    </span>
                    {problem.navigable ? (
                      <span
                        data-testid="code-problem-location"
                        className={`${officeDialogParts.hint} ${chrome.rowMeta}`}
                      >
                        {t("code.problems.location", {
                          line: problem.line,
                          col: problem.col,
                        })}
                      </span>
                    ) : null}
                    <span className={chrome.rowText}>{problem.message}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          </div>
        </OfficeTaskPane>
        </CodeDockedPane>
      ) : null}

      {paletteOpen ? (
        // The Command Palette in the Find family's card (code tone): title,
        // count and close, the command field, then the commands as chrome
        // list rows (the highlighted one selected, as a listbox's option).
        <div
          data-testid="code-palette-panel"
          className={CODE_FIND_CARD_CLASS}
          role="dialog"
          aria-modal="false"
          aria-label={t("code.palette.title")}
        >
          <header className="note-editor-find-replace__header">
            <span className="note-editor-find-replace__title">
              <Search size={16} aria-hidden />
              {t("code.palette.title")}
            </span>
            <span className={chrome.headerEnd}>
              <span
                data-testid="code-palette-count"
                className="note-editor-find-replace__count"
              >
                {paletteCommandsTruncated
                  ? t("code.palette.visibleCount", {
                      visible: visiblePaletteCommands.length,
                      total: filteredPaletteCommands.length,
                    })
                  : t("code.palette.count", {
                      count: filteredPaletteCommands.length,
                    })}
              </span>
              <button
                type="button"
                onClick={closePalette}
                title={t("code.palette.close")}
                aria-label={t("code.palette.close")}
                data-testid="code-palette-close"
                className="note-editor-find-replace__button"
              >
                <X size={14} />
              </button>
            </span>
          </header>
          <div className="note-editor-find-replace__search-row">
            <input
              ref={paletteInputRef}
              type="text"
              value={paletteQuery}
              data-testid="code-palette-input"
              className="note-editor-find-replace__input note-editor-find-replace__input--replace"
              placeholder={t("code.palette.placeholder")}
              aria-label={t("code.palette.placeholder")}
              // The live list is owned by React state; the active row is tracked by
              // index, so expose it as a single-select combobox for screen readers.
              role="combobox"
              aria-expanded="true"
              aria-controls="code-palette-list"
              onChange={(event) => {
                setPaletteQuery(
                  event.target.value.slice(0, MAX_EDITOR_COMMAND_INPUT_CHARS),
                );
                // Any filter edit resets the highlight to the first match so Enter
                // always targets a visible row (the prior index may now be filtered
                // out or point past the end of the shorter list).
                setPaletteActiveIndex(0);
              }}
              maxLength={MAX_EDITOR_COMMAND_INPUT_CHARS}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePalette();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setPaletteActiveIndex((i) =>
                    visiblePaletteCommands.length === 0
                      ? 0
                      : (i + 1) % visiblePaletteCommands.length,
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setPaletteActiveIndex((i) =>
                    visiblePaletteCommands.length === 0
                      ? 0
                      : (i - 1 + visiblePaletteCommands.length) %
                        visiblePaletteCommands.length,
                  );
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  runPaletteCommand(paletteActiveIndex);
                }
              }}
            />
          </div>
          <div
            id="code-palette-list"
            role="listbox"
            aria-label={t("code.palette.title")}
            className={`note-editor-find-replace__results ${chrome.results}`}
          >
            {visiblePaletteCommands.length === 0 ? (
              <div
                data-testid="code-palette-empty"
                className="note-editor-find-replace__empty office-rise-in"
              >
                {t("code.palette.none")}
              </div>
            ) : (
              visiblePaletteCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={index === paletteActiveIndex}
                  aria-disabled={cmd.disabled || undefined}
                  aria-busy={cmd.busy || undefined}
                  disabled={cmd.disabled}
                  // Pointer hover moves the keyboard highlight so mouse + keyboard
                  // agree on which row Enter would run.
                  onMouseEnter={() => setPaletteActiveIndex(index)}
                  onClick={() => runPaletteCommand(index)}
                  data-testid="code-palette-item"
                  data-command-id={cmd.id}
                  // Present only on contributed commands, so "did this come
                  // from an extension" is answerable without parsing the label.
                  data-command-source={cmd.source}
                  data-active={index === paletteActiveIndex ? "true" : "false"}
                  title={cmd.title ?? cmd.label}
                  className={CODE_ACTION_ROW_CLASS}
                >
                  <span className={chrome.rowText}>{cmd.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {snippetsOpen ? (
        // User-defined snippets manager (VSCode "User Snippets" parity).
        // Reads/writes the localStorage-backed store; the completion source
        // reads that store live, so a saved snippet works in autocomplete
        // immediately. With no user snippets defined the store is untouched
        // and the editor's completion output is byte-for-byte unchanged.
        <CodeDockedPane docks={taskPaneDocks} pane="snippets">
          <OfficeTaskPane
            title={t("code.snippets.heading")}
            closeLabel={t("common.close")}
            onClose={() => {
              setSnippetsOpen(false);
              focusView();
            }}
            testIdPrefix="code-snippets"
            autoFocusClose
            dockRight={false}
            style={taskPaneDocks ? undefined : { maxHeight: 360 }}
          >
            <div className={officeTaskPaneParts.body}>
              <CodeSnippetManager isDark={isDark} hideHeading />
            </div>
          </OfficeTaskPane>
        </CodeDockedPane>
      ) : null}

      {outlineOpen ? (
        <CodeDockedPane docks={taskPaneDocks} pane="outline">
          <CodeCaretChromeSubscriber store={caretRenderStore}>
            {({ offset }) => (
              <CodeOutlinePanel
                symbols={breadcrumbSymbols}
                loading={outlineSymbolsLoading}
                activeIndex={
                  breadcrumbCrumbs(breadcrumbSymbols, offset).at(-1)?.index ??
                  -1
                }
                onJump={selectSymbolSpan}
                onClose={closeOutline}
              />
            )}
          </CodeCaretChromeSubscriber>
        </CodeDockedPane>
      ) : null}

      {markdownPreviewOpen && isMarkdownBuffer ? (
        <div
          data-testid="code-markdown-preview"
          role="region"
          aria-label={t("code.markdownPreview.title")}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            closeMarkdownPreview();
          }}
          className={chrome.markdownPreview}
        >
          {/* The preview's own commands in the dialogs' chrome (code tone),
              laid flat over the rendered Markdown: Close at the top right,
              and the truncation note with Show full in a chrome well. */}
          <div
            className={`${officeDialogClassName({ tone: "code" })} office-dialog--embedded ${chrome.previewBar}`}
          >
            <button
              type="button"
              onClick={closeMarkdownPreview}
              data-testid="code-markdown-preview-close"
              aria-label={t("code.markdownPreview.close")}
              className={officeDialogParts.compactButton}
            >
              {t("code.markdownPreview.close")}
            </button>
          </div>
          {markdownPreviewTruncated ? (
            <div
              className={`${officeDialogClassName({ tone: "code" })} office-dialog--embedded ${chrome.previewNote}`}
            >
              <div
                data-testid="code-markdown-preview-truncated"
                role="status"
                className={`${officeDialogParts.well} ${chrome.previewNoteWell}`}
              >
                <span className={officeDialogParts.message}>
                  {t("code.markdownPreview.truncated", {
                    shown: CODE_MARKDOWN_PREVIEW_INITIAL_CHARS,
                    total: value.length,
                  })}
                </span>
                <button
                  type="button"
                  data-testid="code-markdown-preview-show-full"
                  onClick={() => setMarkdownFullPreviewSource(value)}
                  className={officeDialogParts.compactButton}
                >
                  {t("code.markdownPreview.showFull")}
                </button>
              </div>
            </div>
          ) : null}
          <MarkdownContent text={markdownPreviewText} />
        </div>
      ) : null}

      {symbolsOpen ? (
        // Go to Symbol in the Find family's card (code tone): title, count
        // and close, then the outline as chrome list rows indented by depth.
        <div
          ref={symbolsPanelRef}
          data-testid="code-symbols-panel"
          role="dialog"
          aria-modal="false"
          aria-label={t("code.symbols.title")}
          // tabIndex=-1: receives the programmatic focus moved in on open (Esc
          // works at once) without joining the Tab cycle; Tab still reaches the
          // symbol buttons — no focus trap.
          tabIndex={-1}
          className={CODE_FIND_CARD_CLASS}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeSymbols();
            }
          }}
        >
          <header className="note-editor-find-replace__header">
            <span className="note-editor-find-replace__title">
              <Code2 size={16} aria-hidden />
              {t("code.symbols.title")}
            </span>
            <span className={chrome.headerEnd}>
              <span
                data-testid="code-symbols-count"
                className="note-editor-find-replace__count"
              >
                {t("code.symbols.count", { count: symbolList.length })}
              </span>
              <button
                type="button"
                onClick={closeSymbols}
                title={t("code.symbols.close")}
                aria-label={t("code.symbols.close")}
                data-testid="code-symbols-close"
                className="note-editor-find-replace__button"
              >
                <X size={14} />
              </button>
            </span>
          </header>
          <div
            role="list"
            aria-label={t("code.symbols.title")}
            className={`note-editor-find-replace__results ${chrome.results}`}
          >
            {symbolList.length === 0 ? (
              <div
                data-testid="code-symbols-empty"
                className="note-editor-find-replace__empty"
              >
                {t("code.symbols.none")}
              </div>
            ) : (
              symbolList.map((sym, index) => (
                <button
                  key={`${sym.from}:${sym.to}:${index}`}
                  type="button"
                  role="listitem"
                  onClick={() => jumpToSymbol(index)}
                  data-testid="code-symbol-item"
                  data-active={index === symbolActiveIndex ? "true" : "false"}
                  data-selected={index === symbolActiveIndex || undefined}
                  aria-current={
                    index === symbolActiveIndex ? "true" : undefined
                  }
                  title={sym.name}
                  className={CODE_LIST_ROW_CLASS}
                  // Indent nested symbols (members under their container) by
                  // depth so the picker reads as an outline tree.
                  style={{ paddingInlineStart: 8 + sym.depth * 14 }}
                >
                  <span className={`${officeDialogParts.hint} ${chrome.rowKind}`}>
                    {sym.kind}
                  </span>
                  <span className={chrome.rowText}>{sym.name || " "}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {fixesOpen ? (
        // Quick Fix / Refactor in the Find family's card (code tone): its
        // title and close, a filter once the list is long, then the actions
        // as chrome list rows, each behind the light bulb.
        <div
          data-testid="code-quickfix-menu"
          className={CODE_FIND_CARD_CLASS}
          role="menu"
          aria-label={
            fixMenuKind === "refactor"
              ? t("code.palette.cmd.refactor")
              : t("code.quickFix.title")
          }
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLocaleLowerCase() === "f"
            ) {
              event.preventDefault();
              event.stopPropagation();
              fixFilterInputRef.current?.focus();
              return;
            }
            if (event.key === "Escape") {
              if (
                event.target === fixFilterInputRef.current &&
                fixQuery.length > 0
              ) {
                event.preventDefault();
                event.stopPropagation();
                setFixQuery("");
                return;
              }
              event.preventDefault();
              closeQuickFix();
              return;
            }
            if (
              event.target === fixFilterInputRef.current &&
              event.key === "ArrowDown"
            ) {
              const first = event.currentTarget.querySelector<HTMLElement>(
                '[data-testid="code-quickfix-item"]',
              );
              if (first) {
                event.preventDefault();
                first.focus();
              }
              return;
            }
            if (
              event.target instanceof HTMLButtonElement &&
              event.target.dataset.testid === "code-quickfix-item" &&
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              const rows = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[data-testid="code-quickfix-item"]',
                ),
              );
              const currentIndex = rows.indexOf(event.target);
              if (currentIndex === -1 || rows.length === 0) return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? rows.length - 1
                    : event.key === "ArrowDown"
                      ? Math.min(currentIndex + 1, rows.length - 1)
                      : Math.max(currentIndex - 1, 0);
              rows[nextIndex]?.focus();
            }
          }}
        >
          <header className="note-editor-find-replace__header">
            <span className="note-editor-find-replace__title">
              <Wrench size={16} aria-hidden />
              {fixMenuKind === "refactor"
                ? t("code.palette.cmd.refactor")
                : t("code.quickFix.title")}
            </span>
            <button
              type="button"
              onClick={closeQuickFix}
              title={t("code.quickFix.close")}
              aria-label={t("code.quickFix.close")}
              data-testid="code-quickfix-close"
              className="note-editor-find-replace__button"
            >
              <X size={14} />
            </button>
          </header>
          {fixList.length > 8 || fixQuery.length > 0 ? (
            <div className="note-editor-find-replace__search-row">
              <label className="note-editor-find-replace__field">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={fixFilterInputRef}
                  type="search"
                  value={fixQuery}
                  maxLength={128}
                  onChange={(event) => {
                    setFixQuery(event.currentTarget.value);
                    setFixVisibleLimit(CODE_ACTION_MENU_INITIAL_LIMIT);
                  }}
                  placeholder={t("code.find.findPlaceholder")}
                  aria-label={t("code.find.findPlaceholder")}
                  data-testid="code-quickfix-filter"
                  className="note-editor-find-replace__input"
                />
              </label>
              <span
                data-testid="code-quickfix-count"
                aria-live="polite"
                className="note-editor-find-replace__count"
              >
                {visibleFixEntries.length}/{filteredFixEntries.length}/
                {fixList.length}
              </span>
            </div>
          ) : null}
          <div className={`note-editor-find-replace__results ${chrome.results}`}>
            {visibleFixEntries.length === 0 ? (
              <p
                data-testid="code-quickfix-filter-empty"
                role="status"
                className="note-editor-find-replace__empty"
              >
                {t("code.findInFiles.empty")}
              </p>
            ) : null}
            {visibleFixEntries.map(({ fix, sourceIndex }) => (
              <button
                key={`${sourceIndex}:${fix.description}`}
                type="button"
                role="menuitem"
                onClick={() => void applyQuickFix(sourceIndex)}
                data-testid="code-quickfix-item"
                title={fix.description}
                className={CODE_ACTION_ROW_CLASS}
              >
                <span aria-hidden className={chrome.rowBulb}>
                  <Lightbulb size={13} />
                </span>
                <span className={chrome.rowText}>{fix.description}</span>
              </button>
            ))}
            {hiddenFixCount > 0 ? (
              <div className={chrome.moreRow}>
                <button
                  type="button"
                  onClick={() =>
                    setFixVisibleLimit((current) =>
                      current + CODE_ACTION_MENU_INITIAL_LIMIT,
                    )
                  }
                  data-testid="code-quickfix-show-more"
                  className={officeDialogParts.compactButton}
                >
                  {t("code.quickFix.showMore")}
                </button>
                <span className={officeDialogParts.hint}>
                  {t("code.quickFix.hidden", { count: hiddenFixCount })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Short outcomes (clipboard, format, language service) are the Find
          family's card (code tone) holding one chrome message, an error in
          the chrome's error ink. */}
      {clipboardFeedback ? (
        <div
          data-testid="code-clipboard-feedback"
          data-state={clipboardFeedback.kind}
          role={clipboardFeedback.kind === "error" ? "alert" : "status"}
          aria-live={
            clipboardFeedback.kind === "error" ? "assertive" : "polite"
          }
          aria-atomic="true"
          className={CODE_NOTICE_CARD_CLASS}
        >
          <span
            className={`${officeDialogParts.message} ${chrome.noticeText}`}
            data-tone={clipboardFeedback.kind === "error" ? "error" : undefined}
          >
            {clipboardFeedback.kind === "error" ? (
              <CircleAlert size={13} aria-hidden />
            ) : (
              <Info size={13} aria-hidden />
            )}
            <span>{clipboardFeedback.message}</span>
          </span>
        </div>
      ) : null}

      {formatFeedback ? (
        <div
          data-testid="code-format-feedback"
          data-state={formatFeedback.kind}
          role={formatFeedback.kind === "error" ? "alert" : "status"}
          aria-live={formatFeedback.kind === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={CODE_NOTICE_CARD_CLASS}
        >
          <span
            className={`${officeDialogParts.message} ${chrome.noticeText}`}
            data-tone={formatFeedback.kind === "error" ? "error" : undefined}
          >
            {formatFeedback.kind === "error" ? (
              <CircleAlert size={13} aria-hidden />
            ) : (
              <Info size={13} aria-hidden />
            )}
            <span>{formatFeedback.message}</span>
          </span>
        </div>
      ) : null}

      {referenceResultBusy || intelNotice ? (
        <div
          data-testid="code-intel-notice"
          role={intelNoticeIsError ? "alert" : "status"}
          aria-busy={referenceResultBusy || undefined}
          aria-live={intelNoticeIsError ? "assertive" : "polite"}
          className={CODE_NOTICE_CARD_CLASS}
        >
          <span
            className={`${officeDialogParts.message} ${chrome.noticeText}`}
            data-tone={intelNoticeIsError ? "error" : undefined}
          >
            {referenceResultBusy ? t("code.console.busy") : intelNotice}
          </span>
        </div>
      ) : null}

      {/*
        Breadcrumbs strip (VSCode parity): a thin persistent bar naming the
        document/cell and the enclosing-symbol trail at the caret. Rendered ONLY
        when the buffer actually has symbols — a structure-less buffer (no
        symbols) renders nothing here, so the default editor is byte-for-byte
        unchanged. Each symbol crumb is a button that jumps to that symbol's span
        (reusing the same selection-dispatch as the Go-to-Symbol picker); the
        leading file crumb just names the file segment.
      */}
      {breadcrumbSymbols.length > 0 ? (
        <CodeCaretChromeSubscriber store={caretRenderStore}>
          {({ offset }) => (
          <nav
          data-testid="code-breadcrumbs"
          aria-label={t("code.breadcrumbs.label")}
          // The editors' docked status strip (OfficeStatusBar), laid along
          // the editor's top edge: the same material, ink and type as the
          // status bar at its foot, in every theme.
          data-office-status-docked="true"
          className={`${officeStatusBarStyles.bar} ${chrome.breadcrumbs}`}
        >
          <span
            data-testid="code-breadcrumb-file"
            title={breadcrumbFileLabel}
            className={chrome.breadcrumbFile}
          >
            <FileCode size={12} aria-hidden />
            <span>{breadcrumbFileLabel}</span>
          </span>
          {breadcrumbCrumbs(breadcrumbSymbols, offset).map((crumb) => (
            <span
              key={`${crumb.index}:${crumb.symbol.from}`}
              className={chrome.breadcrumbStep}
            >
              <ChevronRight size={12} aria-hidden />
              <button
                type="button"
                data-testid="code-breadcrumb-item"
                onClick={() => jumpToBreadcrumb(crumb.index)}
                title={`${crumb.symbol.kind} ${crumb.symbol.name}`.trim()}
                aria-label={t("code.breadcrumbs.jumpTo", {
                  name: crumb.symbol.name || crumb.symbol.kind,
                })}
                className={chrome.breadcrumbItem}
              >
                {crumb.symbol.name || crumb.symbol.kind}
              </button>
            </span>
          ))}
          </nav>
          )}
        </CodeCaretChromeSubscriber>
      ) : null}

      <div
        ref={hostRef}
        // Code keeps its ltr geometry under an rtl interface.
        dir="ltr"
        onContextMenu={(event) => {
          // VSCode-style right-click menu: suppress the native menu and open our
          // own at the pointer. Read-only viewer mode leaves the native menu
          // alone (openContextMenu early-returns), so we only preventDefault when
          // we actually open ours.
          if (effectiveReadOnly) return;
          event.preventDefault();
          openContextMenu(event);
        }}
        style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}
      >
        <CodeMirror
          ref={cmRef}
          // y-codemirror.next's ySync plugin does NOT seed the CM doc from the
          // Y.Text on creation — it only observes SUBSEQUENT Y.Text deltas — so
          // the editor's initial document must come from `value`. We also seed
          // the Y.Text from the same loaded value (idempotent, see the collab
          // seed above), so on mount the CM doc and the Y.Text hold identical
          // content (no double-insert).
          //
          // On the COLLAB path the `value` prop is FROZEN to its mount value
          // (collabInitialValueRef) and never changes afterward: react-
          // codemirror's reconcile effect dispatches a destructive full-range
          // replace whenever the controlled `value !== doc`, and that replace is
          // NOT annotated with ySyncAnnotation, so ySync writes it straight into
          // the shared Y.Text as delete-all+insert-all — clobbering the CRDT on
          // any out-of-band source mutation (cell split/merge, reload, AI write-
          // back). Freezing `value` after mount means reconcile never fires
          // again, leaving the CRDT (via onChange) the sole source of truth.
          // On the (default) OFF path this is the controlled `value` exactly as
          // before.
          value={codeMirrorValue}
          onChange={handleCodeMirrorChange}
          onCreateEditor={handleCreateEditor}
          placeholder={placeholder}
          readOnly={effectiveReadOnly}
          editable={!effectiveReadOnly}
          theme={theme}
          basicSetup={effectiveBasicSetup}
          extensions={extensions}
          height="100%"
          // minWidth 0: a flex item is otherwise as wide as its longest line,
          // so one long line widened the editor past the window, pushed the
          // minimap out of sight and left nothing to scroll across with.
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            fontSize: BASE_FONT_SIZE,
          }}
        />
        <CodeMirrorValueEffectFlush value={codeMirrorValue} />
        {effectiveStickyScrollOn && stickyHeaders.length > 0 ? (
          <div
            data-testid="code-sticky-scroll"
            aria-hidden
            className={chrome.stickyScroll}
          >
            {stickyHeaders.map((header) => (
              <button
                key={header.line}
                type="button"
                onClick={() => scrollToStickyHeader(header.line)}
                data-testid="code-sticky-header"
                data-line={header.line}
                title={t("code.stickyScrollOn")}
                className={chrome.stickyHeader}
              >
                {header.text || " "}
              </button>
            ))}
          </div>
        ) : null}
        {effectiveMinimapOn ? (
          <CodeMinimap
            stripRef={minimapRef}
            model={minimapModel}
            isDark={isDark}
            viewportTop={viewportBox.top}
            viewportHeight={viewportBox.height}
            onPointerDown={handleMinimapPointerDown}
          />
        ) : null}
        {/* Settings menu (gear): one popover consolidating the view toggles
            (minimap, word wrap, whitespace, bracket colors, sticky scroll) and
            the font-size zoom. Each toggle item REUSES the existing handler +
            state + data-testid (no parallel source of truth); the menu panel is
            always mounted (so the per-toggle testids resolve even while closed)
            but hidden until the gear is clicked. */}
        {editorToolbar}
        {sigHelp ? (
          // Parameter hints as the dialogs' card (code tone), small, at the
          // editor's bottom-left; the signature keeps the editor's face.
          <div
            data-testid="code-signature-help"
            className={`${officeDialogClassName({ tone: "code" })} office-pop-in ${chrome.signature} ${chrome.mono}`}
            role="status"
          >
            {/* Content is HTML-escaped by signatureHelpAt; assigning via
                innerHTML only re-materializes the escaped entities as text, with
                the active parameter wrapped in a <strong>. */}
            <span
              dangerouslySetInnerHTML={{
                __html: signatureHelpHtml(sigHelp.info),
              }}
            />
          </div>
        ) : null}
        {/* Compare / diff-merge overlay (VSCode-style "Compare"). Fills the
            editor host (the live editor stays mounted underneath, so opening the
            compare view never remounts/loses editor state). Shows the source
            PICKER first, then a side-by-side merge view of the current buffer vs
            the chosen source. Rendered only when the host wired compare sources
            AND the panel is open, so the default editor is byte-for-byte
            unchanged. role=dialog + tabIndex=-1 to accept the programmatic focus
            moved in on open (Esc works immediately), mirroring the other panels. */}
        {canCompare && compareOpen ? (
          <div
            ref={comparePanelRef}
            data-testid="code-compare-panel"
            role="dialog"
            aria-modal="false"
            aria-label={t("code.compare.title")}
            tabIndex={-1}
            className={`${CODE_SURFACE_CLASS} ${chrome.overlay} ${chrome.compareLayer}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (
                  event.target === compareFilterRef.current &&
                  compareQuery.length > 0
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  setCompareQuery("");
                  return;
                }
                event.preventDefault();
                closeCompare();
                return;
              }
              if (
                event.target === compareFilterRef.current &&
                event.key === "ArrowDown"
              ) {
                const firstSource = event.currentTarget.querySelector<HTMLElement>(
                  '[data-testid="code-compare-source-item"]',
                );
                if (firstSource) {
                  event.preventDefault();
                  firstSource.focus();
                }
                return;
              }
              if (
                event.target instanceof HTMLButtonElement &&
                event.target.dataset.testid === "code-compare-source-item" &&
                ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
              ) {
                const sources = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[data-testid="code-compare-source-item"]:not(:disabled)',
                  ),
                );
                const currentIndex = sources.indexOf(event.target);
                if (currentIndex === -1 || sources.length === 0) return;
                event.preventDefault();
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? sources.length - 1
                      : event.key === "ArrowDown"
                        ? Math.min(currentIndex + 1, sources.length - 1)
                        : Math.max(currentIndex - 1, 0);
                sources[nextIndex]?.focus();
              }
            }}
          >
            <div className={`${officeDialogParts.header} ${chrome.surfaceHeader}`}>
              <span className={chrome.surfaceTitle}>
                <GitCompare size={16} aria-hidden />
                <span className={officeDialogParts.title}>
                  {t("code.compare.title")}
                </span>
              </span>
              {compareWith && !comparePickerVisible ? (
                <>
                  {/* Back to the picker to choose a different source. */}
                  <button
                    type="button"
                    onClick={backToComparePicker}
                    title={t("code.compare.windowBack")}
                    aria-label={t("code.compare.windowBack")}
                    data-testid="code-compare-back"
                    className={officeDialogParts.iconButton}
                  >
                    <ArrowLeft size={13} />
                  </button>
                  {/* Which two things are being compared, left to right. The
                      left label is only rendered once it is something other
                      than the buffer, so the familiar case stays as it was. */}
                  {compareLeft ? (
                    <span
                      data-testid="code-compare-left-label"
                      title={compareLeft.label}
                      className={chrome.compareLabel}
                    >
                      {compareLeft.label}
                    </span>
                  ) : null}
                  {compareLeft ? (
                    <span aria-hidden="true" className={officeDialogParts.hint}>
                      &#8594;
                    </span>
                  ) : null}
                  <span
                    data-testid="code-compare-with-label"
                    className={chrome.compareLabel}
                  >
                    {compareWith.label}
                  </span>
                  {/* A base turns the panel into a three-way merge review, so
                      the counter switches from changed chunks to conflicts. */}
                  {compareThreeWayActive ? (
                    <span
                      data-testid="code-compare-base-label"
                      title={compareBase.label}
                      className={`${officeDialogParts.hint} ${chrome.compareBase}`}
                    >
                      {t("code.compare.baseWith", { label: compareBase.label })}
                    </span>
                  ) : null}
                  <span
                    data-testid="code-compare-change-count"
                    className={officeDialogParts.hint}
                  >
                    {compareThreeWayActive
                      ? t("code.compare.conflictCount", {
                          count: compareChunkCount,
                        })
                      : t("code.compare.changeCount", {
                          count: compareChunkCount,
                        })}
                  </span>
                  {/* Navigation: changed chunks in two-way, conflicts in
                      three-way (the same handle drives both). */}
                  <button
                    type="button"
                    onClick={() =>
                      compareHandleRef.current?.goToPreviousChunk()
                    }
                    disabled={compareNavDisabled}
                    title={
                      compareThreeWayActive
                        ? t("code.compare.prevConflict")
                        : t("code.compare.prevChange")
                    }
                    aria-label={
                      compareThreeWayActive
                        ? t("code.compare.prevConflict")
                        : t("code.compare.prevChange")
                    }
                    data-testid="code-compare-prev"
                    className={officeDialogParts.iconButton}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => compareHandleRef.current?.goToNextChunk()}
                    disabled={compareNavDisabled}
                    title={
                      compareThreeWayActive
                        ? t("code.compare.nextConflict")
                        : t("code.compare.nextChange")
                    }
                    aria-label={
                      compareThreeWayActive
                        ? t("code.compare.nextConflict")
                        : t("code.compare.nextChange")
                    }
                    data-testid="code-compare-next"
                    className={officeDialogParts.iconButton}
                  >
                    <ArrowDown size={13} />
                  </button>
                  {/* Enter/leave three-way review. Both directions only pick
                      from the SAME host-provided sources — never from Git. */}
                  {/* Compare two picked versions instead of the buffer against
                      one. Hidden during a three-way review, which by definition
                      merges INTO the buffer. */}
                  {compareThreeWayActive ? null : (
                    <button
                      type="button"
                      onClick={compareLeft ? clearCompareLeft : pickCompareLeft}
                      title={
                        compareLeft
                          ? t("code.compare.clearLeft")
                          : t("code.compare.pickLeft")
                      }
                      aria-label={
                        compareLeft
                          ? t("code.compare.clearLeft")
                          : t("code.compare.pickLeft")
                      }
                      data-testid={
                        compareLeft
                          ? "code-compare-clear-left"
                          : "code-compare-pick-left"
                      }
                      className={officeDialogParts.compactButton}
                    >
                      {compareLeft
                        ? t("code.compare.clearLeftShort")
                        : t("code.compare.pickLeftShort")}
                    </button>
                  )}
                  {compareLeft ? null : (
                    <button
                      type="button"
                      onClick={
                        compareThreeWayActive ? clearCompareBase : pickCompareBase
                      }
                      title={
                        compareThreeWayActive
                          ? t("code.compare.removeBase")
                          : t("code.compare.pickBase")
                      }
                      aria-label={
                        compareThreeWayActive
                          ? t("code.compare.removeBase")
                          : t("code.compare.pickBase")
                      }
                      data-testid={
                        compareThreeWayActive
                          ? "code-compare-clear-base"
                          : "code-compare-pick-base"
                      }
                      className={officeDialogParts.compactButton}
                    >
                      {compareThreeWayActive
                        ? t("code.compare.removeBaseShort")
                        : t("code.compare.pickBaseShort")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span
                    data-testid="code-compare-pick-hint"
                    className={officeDialogParts.hint}
                  >
                    {comparePickingRole === "base"
                      ? t("code.compare.pickBasePrompt")
                      : comparePickingRole === "left"
                        ? t("code.compare.pickLeftPrompt")
                        : t("code.compare.windowPickPrompt")}
                  </span>
                  {comparePickingRole === "left" ? (
                    <button
                      type="button"
                      onClick={clearCompareLeft}
                      title={t("code.compare.cancelLeft")}
                      aria-label={t("code.compare.cancelLeft")}
                      data-testid="code-compare-cancel-left"
                      className={officeDialogParts.compactButton}
                    >
                      {t("code.compare.cancelBaseShort")}
                    </button>
                  ) : null}
                  {comparePickingRole === "base" ? (
                    <button
                      type="button"
                      onClick={clearCompareBase}
                      title={t("code.compare.cancelBase")}
                      aria-label={t("code.compare.cancelBase")}
                      data-testid="code-compare-cancel-base"
                      className={officeDialogParts.compactButton}
                    >
                      {t("code.compare.cancelBaseShort")}
                    </button>
                  ) : null}
                </>
              )}
              <button
                type="button"
                onClick={closeCompare}
                title={t("code.compare.close")}
                aria-label={t("code.compare.close")}
                data-testid="code-compare-close"
                className={officeDialogParts.close}
              >
                <X size={12} />
              </button>
            </div>
            {compareWith && !comparePickerVisible ? (
              compareThreeWayActive ? (
                <CodeCompareView
                  ref={handleCompareReady}
                  base={compareBase.text}
                  current={value}
                  incoming={compareWith.text}
                  language={language}
                  grammarLoadingLabel={t("code.grammar.loading", { language })}
                  grammarFailedLabel={t("code.grammar.failed", { language })}
                  grammarRetryLabel={t("code.grammar.retry")}
                  isDark={isDark}
                  onApplyMerged={
                    effectiveReadOnly ? undefined : applyCompareMerge
                  }
                  onConflictStateChanged={handleCompareConflictState}
                  onChunksChanged={handleCompareChunks}
                  baseLabel={t("code.compare.baseSide")}
                  currentLabel={t("code.compare.currentSide")}
                  incomingLabel={t("code.compare.incomingSide")}
                  acceptCurrentLabel={t("code.compare.acceptCurrent")}
                  acceptIncomingLabel={t("code.compare.acceptIncoming")}
                  acceptBothLabel={t("code.compare.acceptBoth")}
                  applyMergeLabel={t("code.compare.applyMerge")}
                  mergeUnavailableLabel={t("code.compare.mergeUnavailable")}
                  conflictsLabel={t("code.compare.conflicts")}
                  activeConflictLabel={t("code.compare.activeConflict")}
                  previousConflictLabel={t("code.compare.prevConflict")}
                  nextConflictLabel={t("code.compare.nextConflict")}
                  noConflictsLabel={t("code.compare.noConflicts")}
                  conflictCountLabel={compareConflictCountLabel}
                  resolvedCountLabel={compareResolvedCountLabel}
                  conflictLabel={compareConflictLabel}
                />
              ) : (
                <CodeCompareView
                  ref={handleCompareReady}
                  current={compareLeft ? compareLeft.text : value}
                  other={compareWith.text}
                  language={language}
                  grammarLoadingLabel={t("code.grammar.loading", { language })}
                  grammarFailedLabel={t("code.grammar.failed", { language })}
                  grammarRetryLabel={t("code.grammar.retry")}
                  isDark={isDark}
                  // Applying a chunk writes into the live buffer. With a version
                  // on the left, the buffer is not what the user is looking at,
                  // so the affordance is withdrawn rather than left to write
                  // somewhere they cannot see.
                  onApplyCurrent={
                    effectiveReadOnly || compareLeft
                      ? undefined
                      : applyCompareCurrent
                  }
                  applyChunkLabel={t("toolbar.acceptChange")}
                  onChunksChanged={handleCompareChunks}
                />
              )
            ) : (
              <div className={chrome.surfaceScroll}>
                <div className={chrome.surfaceToolbar}>
                  <span className={officeDialogParts.inputGroup}>
                    <Search size={14} aria-hidden />
                    <input
                      ref={compareFilterRef}
                      type="search"
                      value={compareQuery}
                      maxLength={128}
                      onChange={(event) =>
                        setCompareQuery(event.currentTarget.value)
                      }
                      placeholder={t("code.find.findPlaceholder")}
                      aria-label={t("code.find.findPlaceholder")}
                      data-testid="code-compare-filter"
                    />
                  </span>
                  <span
                    data-testid="code-compare-source-count"
                    aria-live="polite"
                    className={`${officeDialogParts.hint} ${chrome.rowMeta}`}
                  >
                    {visibleCompareSources.length}/{comparePickableList.length}
                  </span>
                </div>
                {compareLoading ? (
                  <div
                    role="status"
                    data-testid="code-compare-loading"
                    className={`${officeDialogParts.message} ${chrome.surfaceNote}`}
                  >
                    {t("code.compare.loading")}
                  </div>
                ) : null}
                {compareLoadError ? (
                  <div
                    role="alert"
                    data-testid="code-compare-load-error"
                    className={`${officeDialogParts.message} ${chrome.surfaceNote}`}
                  >
                    {compareLoadError}
                  </div>
                ) : null}
                <div
                  role="list"
                  aria-label={t("code.compare.title")}
                  className={chrome.surfaceRows}
                >
                  {visibleCompareSources.length === 0 ? (
                    <div
                      data-testid="code-compare-empty"
                      className={`${officeDialogParts.message} ${chrome.emptyNote}`}
                    >
                      {normalizedCompareQuery.length > 0
                        ? t("code.findInFiles.empty")
                        : comparePickingRole === "base"
                          ? t("code.compare.baseNone")
                          : t("code.compare.windowNone")}
                    </div>
                  ) : (
                    visibleCompareSources.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        role="listitem"
                        onClick={() =>
                          void chooseCompareSource(
                            source,
                            comparePickingRole ?? "incoming",
                          )
                        }
                        disabled={compareLoading}
                        data-testid="code-compare-source-item"
                        title={source.label}
                        className={CODE_ACTION_ROW_CLASS}
                      >
                        <GitCompare
                          size={13}
                          aria-hidden
                          className={chrome.checkIcon}
                        />
                        <span className={chrome.rowText}>{source.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
        {/* Right-click context menu (VSCode parity), on the shared pointer
            menu every editor answers a right click with (PointerContextMenu:
            the one right-click size, placement, keyboard and dismissal).
            Fixed at the press's viewport point. Each item dispatches an
            EXISTING editor command; the def/peek/rename items are gated to
            languages that support symbol nav. Escape gives the keyboard back
            to the text. */}
        {contextMenu ? (
          <PointerContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            label={t("code.contextMenu.label")}
            testId="code-context-menu"
            onClose={closeContextMenu}
            onEscape={focusView}
            entries={contextMenuItems.map((item, index) =>
              item.kind === "separator"
                ? { id: `sep-${index}`, separator: true as const }
                : {
                    id: item.id,
                    label: item.label,
                    icon: item.icon,
                    shortcut: item.shortcut,
                    disabled: item.disabled,
                    disabledReason: item.disabled ? item.title : undefined,
                    busy: item.busy,
                    testId: `code-context-menu-item-${item.id}`,
                    // The menu closes BEFORE the command runs, so a command
                    // that opens a panel (find, symbols, the palette) keeps
                    // the keyboard.
                    onSelect: () => {
                      closeContextMenu();
                      item.run();
                    },
                  },
            )}
          />
        ) : null}
      </div>

      {lightweightMode && performanceInfoOpen ? (
        // The workload note is the dialogs' card (code tone) over the status
        // bar's badge: title and reason in its title row with the round
        // close, the explanation, what is kept (in a well) and how to leave.
        <div
          ref={performanceInfoRef}
          id={performancePopoverId}
          role="dialog"
          aria-label={performanceCopy.title}
          data-testid="code-performance-popover"
          className={`${officeDialogClassName({ tone: "code" })} office-pop-in ${chrome.infoPopover}`}
        >
          <div className={officeDialogParts.header}>
            <span aria-hidden className={chrome.infoGlyph}>
              <Gauge size={15} />
            </span>
            <div className={chrome.surfaceTitleText}>
              <span className={officeDialogParts.title}>
                {performanceCopy.title}
              </span>
              <span
                data-testid="code-performance-reason"
                className={`${officeDialogParts.hint} ${chrome.mono}`}
              >
                {performanceCopy.reason}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPerformanceInfoOpen(false);
                performanceInfoButtonRef.current?.focus();
              }}
              title={performanceCopy.close}
              aria-label={performanceCopy.close}
              data-testid="code-performance-close"
              className={officeDialogParts.close}
            >
              <X size={12} />
            </button>
          </div>
          <p className={officeDialogParts.message}>
            {performanceCopy.description}
          </p>
          <p className={`${officeDialogParts.well} ${chrome.wellNote}`}>
            {performanceCopy.preserved}
          </p>
          <p className={officeDialogParts.hint}>{performanceCopy.restore}</p>
        </div>
      ) : null}

      {/* Status bar (VSCode parity): cursor line/column, the indent setting
          (spaces/tabs + width), source encoding, and line-ending style. A thin,
          non-editing
          chrome strip pinned to the bottom of the editor column; it sits OUTSIDE
          the CM6 surface so the editing content is unchanged. The Ln/Col segment
          follows the bounded caret store without rebuilding the editor; indent
          reflects the active style, EOL
          reflects host metadata or the buffer. Indent, encoding, and EOL are
          CLICKABLE (VSCode parity): indent toggles spaces↔tabs, encoding toggles
          UTF-8↔UTF-8 BOM, and EOL toggles LF↔CRLF (full width / style choices
          live in the Command Palette). All values come from tested helpers. */}
      {/* The shared Office status bar (the Docs status strip, docked at the
          editor's bottom edge): counters and actions at the left, the zoom
          crown, then the file facts at the right. The code chrome keeps its
          own monospace values and colours; the bar is not a live region, so
          the caret position is never announced on every move. */}
      {statusBarHost === undefined
        ? statusBar
        : statusBarHost
          ? createPortal(statusBar, statusBarHost)
          : null}
      {


}
      {effectiveReadOnly ? null : (
        <OfficeSoftKeyboardLayer rootRef={editorRootRef} testId="code-soft-keyboard-bar">
          {CODE_SOFT_KEYS.map((key, index) => (
            <OfficeSoftKeyboardKey
              key={index}
              name={key.kind === "text" ? key.text : key.name}
              testId={`code-soft-key-${index}`}
              onPress={() => {
                const view = viewRef.current;
                if (view) pressCodeSoftKey(view, key);
              }}
            >
              {key.kind === "text" ? key.text : key.face}
            </OfficeSoftKeyboardKey>
          ))}
        </OfficeSoftKeyboardLayer>
      )}
    </div>
  );
}


interface EditorPerformanceModeCopy {
  label: string;
  title: string;
  reason: string;
  description: string;
  preserved: string;
  restore: string;
  close: string;
}

function currentEditorLocale(): string {
  if (typeof document !== "undefined") {
    const htmlLocale = document.documentElement.lang.trim();
    if (htmlLocale) return htmlLocale;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en";
}

/**
 * Localised copy for the automatic workload indicator, from the
 * `console-notebooks` catalogue (`code.performance.*`).
 */
function editorPerformanceModeCopy(
  t: (key: string, values?: Record<string, string>) => string,
  locale: string,
  profile: EditorPerformanceProfile,
): EditorPerformanceModeCopy {
  let formattedCharacters: string;
  try {
    formattedCharacters = new Intl.NumberFormat(locale).format(
      profile.characterCount,
    );
  } catch {
    formattedCharacters = String(profile.characterCount);
  }
  return {
    label: t(
      profile.reason === "long-line"
        ? "code.performance.labelLongLine"
        : "code.performance.labelLargeFile",
    ),
    title: t("code.performance.title"),
    reason: t("code.performance.reason", {
      reason: t(editorPerformanceReasonKey(profile.reason)),
      count: formattedCharacters,
    }),
    description: t("code.performance.description"),
    preserved: t("code.performance.preserved"),
    restore: t("code.performance.restore"),
    close: t("code.performance.close"),
  };
}

function editorPerformanceReasonKey(
  reason: EditorPerformanceModeReason | null,
): string {
  if (reason === "long-line") return "code.performance.reasonLongLine";
  if (reason === "line-count") return "code.performance.reasonLineCount";
  if (reason === "source-size") return "code.performance.reasonSourceSize";
  return "code.performance.reasonFull";
}

/** A key of the editor's floating toolbar: the shared mini toolbar's key
 *  (note-editor.css .floating-toolbar-btn), lit while its toggle is on. */
function floatingToolbarButtonClass(active: boolean): string {
  return `floating-toolbar-btn ${chrome.editorToolbarButton}${active ? " is-active" : ""}`;
}

/**
 * A single checkbox row in the settings menu. It IS the view toggle's control —
 * carrying the toggle's existing `data-testid` and driving the SAME handler +
 * state the standalone chrome buttons used to, so there is no second source of
 * truth and the existing per-toggle tests keep resolving the same testid. A
 * leading checkmark (shown when `checked`) gives VSCode-style menu affordance.
 */
// Settings items are memoized, so their icons are module constants: an inline
// `<Icon />` would be a new element on every editor render and defeat the memo.
const SETTINGS_ITEM_ICONS = {
  minimap: <MapIcon size={13} />,
  wordWrap: <WrapText size={13} />,
  pilcrow: <Pilcrow size={13} />,
  braces: <Braces size={13} />,
  alignLeft: <AlignLeft size={13} />,
  brackets: <Brackets size={13} />,
  pin: <Pin size={13} />,
  tags: <Tags size={13} />,
  code: <Code2 size={13} />,
  save: <Save size={13} />,
} as const;

/**
 * One view toggle in the (always-mounted) settings popover. Memoized: its
 * props are strings, booleans and mount-stable toggles, so an editor render
 * for a content snapshot or caret-independent state change skips all of them.
 */
const SettingsToggleItem = memo(SettingsToggleItemView);

function SettingsToggleItemView({
  testId,
  icon,
  label,
  checked,
  onToggle,
  disabled = false,
  disabledReason,
}: {
  testId: string;
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const accessibleLabel =
    disabled && disabledReason
      ? `${label}. ${disabledReason}`
      : label;
  return (
    <button
      type="button"
      // A native button (implicit role="button") carries `aria-pressed` to
      // expose its on/off state — the same contract the standalone chrome
      // buttons used, so existing toggle tests resolve the same testid + state.
      // The leading box is the shared quick check (the chart flyouts' rows).
      aria-pressed={checked}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-testid={testId}
      onClick={onToggle}
      disabled={disabled}
      className={`${officeDialogParts.check} ${chrome.checkRow}`}
    >
      <OfficeQuickCheck checked={checked} />
      <span aria-hidden className={chrome.checkIcon}>
        {icon}
      </span>
      <span className={chrome.rowText}>{label}</span>
    </button>
  );
}

/**
 * Minimal HTML escaper for the PLAIN-TEXT jedi signature output, so the Python
 * parameter-hint path produces the same already-escaped {@link SignatureHelpInfo}
 * shape the TS path does (its `signatureHelpAt` escapes via the same five rules).
 * Keeps the shared render path's `dangerouslySetInnerHTML` injection-safe.
 */
/**
 * Convert a jedi 0-based CODE-POINT column to a UTF-16 offset within `lineText`.
 * jedi reports columns/lengths in Python `str` units (code points), but a CM
 * document offset is UTF-16. An astral (non-BMP) char before the symbol counts
 * as 1 code point but 2 UTF-16 units, so adding a code-point column straight to
 * a UTF-16 line offset lands short. Pure + unit-tested; identity for ASCII/BMP.
 */
export function codePointColToUtf16(lineText: string, cpCol: number): number {
  if (cpCol <= 0) return 0;
  let cp = 0;
  let u16 = 0;
  for (const ch of lineText) {
    if (cp >= cpCol) break;
    u16 += ch.length;
    cp += 1;
  }
  return u16;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the (already HTML-escaped) signature label, wrapping the active
 * parameter in `<strong>` so the parameter the caret sits on stands out. The
 * label and parameter strings come pre-escaped from {@link signatureHelpAt}, so
 * the only markup is the `<strong>` we add here.
 */
function signatureHelpHtml(info: SignatureHelpInfo): string {
  const active = info.parameters[info.activeParameter];
  if (!active) return info.label;
  // Find the active parameter's occurrence positionally: skip past any earlier
  // identical-text parameters (e.g. two `number` params) so the right slot is
  // bolded rather than always the first match.
  let searchFrom = 0;
  for (let i = 0; i < info.activeParameter; i += 1) {
    const prior = info.parameters[i];
    if (!prior) continue;
    const at = info.label.indexOf(prior, searchFrom);
    // Always advance past this slot — even when a prior parameter isn't found
    // verbatim in the label (malformed compiler data) — so the next iteration
    // can't re-match the same region and bold the wrong (duplicate) parameter.
    searchFrom = at >= 0 ? at + prior.length : searchFrom + prior.length;
  }
  const idx = info.label.indexOf(active, searchFrom);
  if (idx < 0) return info.label;
  return (
    info.label.slice(0, idx) +
    `<strong>${active}</strong>` +
    info.label.slice(idx + active.length)
  );
}

// The standard "screen-reader only" clip pattern: the node is in the a11y tree
// (so live-region announcements are read) but takes zero visual space and never
// paints. Deliberately NOT `display:none`/`visibility:hidden` — both remove the
// node from the accessibility tree, which would silence the live region.
const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * The Find family's card: the Docs Find and Replace card in the dialogs'
 * chrome (code tone), at the editor's top-right, in flow. Find, Go To,
 * Rename, References, Go to Symbol, Quick Fix and the Command Palette all
 * open in it.
 */
const CODE_FIND_CARD_CLASS = `note-editor-find-replace ${officeDialogClassName({
  tone: "code",
})} office-pop-in ${chrome.findCard}`;

/** The same card holding one short outcome message. */
const CODE_NOTICE_CARD_CLASS = `${CODE_FIND_CARD_CLASS} ${chrome.noticeCard}`;

/**
 * A view laid over the whole editor (Compare, Keyboard Shortcuts): the
 * dialogs' chrome (code tone) without a floating card, on its opaque surface.
 */
const CODE_SURFACE_CLASS = `${officeDialogClassName({
  tone: "code",
})} office-dialog--embedded ${chrome.surface}`;

/** A results row (a command, a code action): the chrome's list item. */
const CODE_ACTION_ROW_CLASS = `${officeDialogParts.listItem} ${chrome.row}`;

/** A results row naming code (a reference, a symbol), in the editor's face. */
const CODE_LIST_ROW_CLASS = `${CODE_ACTION_ROW_CLASS} ${chrome.codeRow}`;

function findToggleClassName(active: boolean): string {
  return active
    ? "note-editor-find-replace__button is-active"
    : "note-editor-find-replace__button";
}
