"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { pageTextWidth, resolveFamilyVariables, textEngineOn } from "@mrnote/core/web/lib/text-engine/page-adapter.ts";
import { onTextEngineChange } from "@mrnote/core/web/lib/text-engine/measure.ts";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
  Play,
  Search,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import chrome from "./CodeEditorChrome.module.css";

import { highlightSegments, tokenRole } from "../../../lib/code-runner/highlight";
import {
  computeViewportRect,
  lineBlockHeight,
  lineBlockWidth,
  minimapYToScrollTop,
  shouldShowMinimapByDefault,
  type ViewportRect,
} from "../../../lib/code-runner/minimap-geometry";
import {
  handleEditorKey,
  isImeCompositionKey,
} from "@mrnote/core/web/lib/code-runner/editor-keys.ts";
import { handleEditorCommandKey } from "../../../lib/code-runner/editor-commands";
import {
  activeLineNumber,
  computeIndentGuides,
  findMatchingBracket,
  indexToLineColumn,
} from "../../../lib/code-runner/editor-decorations";
import {
  applyCompletion,
  applySnippet,
  getCompletions,
  type CompletionContext,
} from "../../../lib/code-runner/autocomplete";
import type { Snippet } from "../../../lib/code-runner/code-snippets";
import {
  boundFindQuery,
  findMatchPreview,
  findRegexErrorMessageKey,
  findReplacementPlanMessageKey,
  isFindReplacementPlanError,
  MAX_FIND_QUERY_CHARS,
  nextMatchIndex,
  replaceAll as replaceAllMatches,
  replaceMatch,
  stepMatch,
  validateRegex,
  type FindOptions,
  type FindReplacementPlanMessageKey,
} from "../../../lib/code-runner/find-replace";
import { computeFoldRegions } from "../../../lib/code-runner/fold-regions";
import {
  canFormatLanguage,
  formatCode,
  shouldFormatOnSave,
} from "../../../lib/code-runner/format-code";
import { loadEditorPref } from "../../../lib/code-runner/editor-prefs";
import {
  buildExecutionSelection,
  type ExecutionSelection,
} from "../../../lib/code-runner/execution-selection";

const EDITOR_FONT =
  "var(--font-jetbrains, ui-monospace, SFMono-Regular, Menlo, monospace)";
const FONT_SIZE = 13;
const LINE_HEIGHT = 20;
const PAD_Y = 12;
const PAD_X = 12;

/** Minimap column width and per-line block height cap (VSCode-ish overview). */
const MINIMAP_WIDTH = 84;
const MINIMAP_PAD_X = 4;
const MINIMAP_BLOCK_MAX_H = 4;
/** Auto-enable the minimap once a file passes this many lines. */
const MINIMAP_AUTO_LINES = 40;

/** Geometry shared by the highlighted layer and the editable layer so the
 * transparent text in the textarea aligns exactly over the coloured spans. */
const codeLayer: CSSProperties = {
  position: "absolute",
  inset: 0,
  margin: 0,
  padding: `${PAD_Y}px ${PAD_X}px`,
  fontFamily: EDITOR_FONT,
  fontSize: FONT_SIZE,
  lineHeight: `${LINE_HEIGHT}px`,
  tabSize: 2,
  whiteSpace: "pre",
  wordBreak: "normal",
  overflowWrap: "normal",
  letterSpacing: "normal",
  border: 0,
  overflow: "auto",
};

/**
 * Apply a programmatic edit to the textarea while PRESERVING the native undo
 * stack. Assigning `textarea.value` directly wipes undo history; selecting all
 * and `execCommand("insertText")` records an undoable step and fires an input
 * event (so React's controlled onChange still runs). Falls back to a direct set
 * + synthetic input event when execCommand is unavailable.
 */
function applyTextareaEdit(
  ta: HTMLTextAreaElement,
  newValue: string,
  selStart: number,
  selEnd: number,
): void {
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try {
    ok =
      typeof document !== "undefined" &&
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, newValue);
  } catch {
    ok = false;
  }
  if (!ok) {
    ta.value = newValue;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  ta.setSelectionRange(selStart, selEnd);
}

/**
 * One entry in the autocomplete popup. Identifier/keyword completions and
 * built-in snippets share the popup + keyboard navigation, distinguished by
 * `kind` so accept routes to the right inserter (applyCompletion vs applySnippet).
 */
type AutocompleteEntry =
  | { kind: "identifier"; label: string }
  | { kind: "snippet"; label: string; snippet: Snippet };

export interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  /** Prevent every authored mutation while preserving navigation and Run. */
  readOnly?: boolean;
  /** Reject edits that would grow the document beyond this host-owned limit. */
  maxDocumentLength?: number;
  /** Notifies the host when an edit is rejected by `maxDocumentLength`. */
  onDocumentLimitExceeded?: () => void;
  placeholder?: string;
  editorTestId?: string;
  /** Invoked on Cmd/Ctrl+Enter, for run-on-keystroke editors. */
  onRun?: () => void;
  /**
   * Optional host-specific Shift+Enter action. It takes precedence over
   * selected-source execution without changing standalone editor semantics.
   */
  onRunAndAdvance?: () => void;
  /** Optional notebook-specific Alt+Enter action: run and insert below. */
  onRunAndInsert?: () => void;
  /**
   * Optional notebook-specific Escape fallback. Autocomplete and other editor
   * surfaces consume Escape first; when none is open this returns focus to the
   * owning cell's command frame.
   */
  onExitEditMode?: () => void;
  /** Runs the selected source, or the caret's current line, via the host. */
  onRunSelection?: (selection: ExecutionSelection) => void;
  /**
   * Invoked on an explicit save gesture (Cmd/Ctrl+S). Formats the buffer first
   * when "Format on save" is enabled AND the language has a formatter, then
   * calls this so the host can flush its autosave. A format error / unsupported
   * language never blocks the save — `onSave` still runs with the raw buffer.
   * The chord is the only way in, so it always reports "shortcut".
   */
  onSave?: (trigger?: "shortcut") => void;
}

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  maxDocumentLength,
  onDocumentLimitExceeded,
  placeholder,
  editorTestId = "code-editor",
  onRun,
  onRunAndAdvance,
  onRunAndInsert,
  onExitEditMode,
  onRunSelection,
  onSave,
}: CodeEditorProps) {
  const t = useTranslations("console-notebooks");
  const autocompleteListId = useId();
  const documentLengthLimit =
    typeof maxDocumentLength === "number" &&
    Number.isFinite(maxDocumentLength)
      ? Math.max(0, Math.trunc(maxDocumentLength))
      : null;
  const documentChangeAllowed = useCallback(
    (nextValue: string) => {
      if (readOnly) return false;
      if (
        documentLengthLimit !== null &&
        nextValue.length > documentLengthLimit
      ) {
        onDocumentLimitExceeded?.();
        return false;
      }
      return true;
    },
    [documentLengthLimit, onDocumentLimitExceeded, readOnly],
  );
  const commitDocumentValue = useCallback(
    (nextValue: string) => {
      if (!documentChangeAllowed(nextValue)) return false;
      onChange(nextValue);
      return true;
    },
    [documentChangeAllowed, onChange],
  );
  const applyOwnedTextareaEdit = useCallback(
    (
      textarea: HTMLTextAreaElement,
      nextValue: string,
      selectionStart: number,
      selectionEnd: number,
    ) => {
      if (!documentChangeAllowed(nextValue)) return false;
      applyTextareaEdit(textarea, nextValue, selectionStart, selectionEnd);
      onChange(nextValue);
      return true;
    },
    [documentChangeAllowed, onChange],
  );
  const segments = useMemo(
    () => highlightSegments(language, value),
    [language, value],
  );
  const lines = useMemo(() => value.split("\n"), [value]);
  const lineCount = useMemo(() => Math.max(1, lines.length), [lines]);
  const gotoInputMaxLength = Math.max(1, String(lineCount).length);
  const lineLengths = useMemo(() => lines.map((l) => l.length), [lines]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const decorRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  // Minimap (VSCode-style overview column). Auto-on for longer files; the user
  // can toggle. The viewport rect is recomputed from the textarea scroll metrics.
  const [minimapOn, setMinimapOn] = useState(() =>
    shouldShowMinimapByDefault(1, MINIMAP_AUTO_LINES),
  );
  const [minimapHeight, setMinimapHeight] = useState(0);
  const [viewportRect, setViewportRect] = useState<ViewportRect>({
    top: 0,
    height: 0,
  });
  // Track whether the user has explicitly toggled, so we stop auto-flipping.
  const minimapTouchedRef = useRef(false);

  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [inSelection, setInSelection] = useState(false);
  const [selRange, setSelRange] = useState<{ start: number; end: number } | null>(null);
  const [activeMatch, setActiveMatch] = useState(0);
  const [replacementFailure, setReplacementFailure] = useState<{
    value: string;
    query: string;
    replacement: string;
    options: FindOptions;
    messageKey: FindReplacementPlanMessageKey;
  } | null>(null);

  // Go-to-line dialog (VSCode Ctrl/Cmd+G).
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState("");
  const gotoInputRef = useRef<HTMLInputElement>(null);

  const regexError = useMemo(
    () => (useRegex ? validateRegex(query, caseSensitive) : null),
    [useRegex, query, caseSensitive],
  );
  const regexErrorTitle = regexError
    ? t(findRegexErrorMessageKey(regexError)!)
    : null;

  const findOpts: FindOptions = useMemo(
    () => ({
      caseSensitive,
      // whole-word and regex are mutually exclusive (regex wins).
      wholeWord: wholeWord && !useRegex,
      regex: useRegex,
      selectionRange: inSelection && selRange ? selRange : undefined,
    }),
    [caseSensitive, wholeWord, useRegex, inSelection, selRange],
  );
  const replacementPlanFailed = Boolean(
    replacementFailure &&
      replacementFailure.value === value &&
      replacementFailure.query === query &&
      replacementFailure.replacement === replacement &&
      replacementFailure.options === findOpts,
  );
  const findErrorTitle =
    regexErrorTitle ??
    (replacementPlanFailed ? t(replacementFailure!.messageKey) : null);

  // Autocomplete popup state.
  const [completion, setCompletion] = useState<CompletionContext | null>(null);
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const charWidthRef = useRef(0);
  // Debounce handle for the expensive completion scan (see refreshAutocomplete).
  // A whole-document identifier scan (matchAll + Set + filter + sort) is too
  // costly to run on every keystroke in large files, so we coalesce it.
  const acTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Composition is tracked separately from keydown because some browsers omit
  // KeyboardEvent.isComposing on the candidate-confirming key.
  const isComposingRef = useRef(false);
  // Guard so the debounced callback never calls setState after unmount.
  const mountedRef = useRef(true);
  // How long to wait after the last keystroke before recomputing completions.
  const AC_DEBOUNCE_MS = 250;

  // Caret offset, used to drive the bracket-match and active-line overlays.
  // Updated on every selection / value change so the decorations stay cheap
  // (recomputed only from value + caret, not on scroll/render). A non-zero
  // selection disables bracket matching (matches VSCode, which only shows it for
  // a collapsed caret) but still highlights the line the caret anchor sits on.
  const [caretIndex, setCaretIndex] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  // Measured monospace character width (px) for placing overlay decorations.
  const [charWidth, setCharWidth] = useState(FONT_SIZE * 0.6);

  const matchPreview = useMemo(
    () => findMatchPreview(value, query, findOpts),
    [value, query, findOpts],
  );
  const matches = matchPreview.matches;
  const matchesTruncated = matchPreview.truncated;

  // Measure the monospace character width once so the popup can anchor to the
  // caret's column without a DOM mirror.
  useEffect(() => {
    if (charWidthRef.current) return;
    const fallback = FONT_SIZE * 0.6;
    let measured = fallback;
    // The served face's own advance (lib/text-engine), the same in every
    // browser, once its file is in; the canvas until then. A canvas cannot
    // resolve var(--font-jetbrains): with the engine on, it is given the
    // resolved family list.
    const engineOn = textEngineOn("code");
    const font = `${FONT_SIZE}px ${engineOn ? resolveFamilyVariables(EDITOR_FONT) : EDITOR_FONT}`;
    const engine = engineOn ? pageTextWidth("code", "MMMMMMMMMM", font) : undefined;
    if (engine !== undefined) measured = engine / 10;
    else {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.font = font;
          measured = ctx.measureText("MMMMMMMMMM").width / 10 || fallback;
        }
      } catch {
        // jsdom / environments without a canvas implementation.
        measured = fallback;
      }
    }
    setCharWidth(measured);
    if (engine !== undefined || !engineOn) {
      charWidthRef.current = measured;
      return;
    }
    // Measured by the browser while the face loads: measure again when the
    // engine has it.
    return onTextEngineChange(() => {
      const again = pageTextWidth("code", "MMMMMMMMMM", font);
      if (again === undefined) return;
      charWidthRef.current = again / 10;
      setCharWidth(again / 10);
    });
  }, []);

  // Dismiss the popup AND cancel any queued (debounced) scan, so an explicit
  // close (Escape, blur, scroll, an applied edit/format) is never re-opened a
  // moment later by a scan that was scheduled by the keystroke before it.
  const closeAutocomplete = useCallback(() => {
    if (acTimerRef.current !== null) {
      clearTimeout(acTimerRef.current);
      acTimerRef.current = null;
    }
    setCompletion(null);
  }, []);

  // Sync the caret offset / selection flag from the live textarea so the
  // bracket-match and active-line overlays follow the cursor. Cheap (two reads),
  // and the derived decorations only recompute when caret/value actually change.
  const syncCaret = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setCaretIndex(ta.selectionStart);
    setHasSelection(ta.selectionEnd > ta.selectionStart);
  }, []);

  const runExecutableSelection = useCallback(() => {
    if (!onRunSelection) return false;
    const textarea = textareaRef.current;
    if (!textarea) return true;
    const selection = buildExecutionSelection(textarea.value, [
      {
        anchor: textarea.selectionStart,
        head: textarea.selectionEnd,
      },
    ]);
    if (selection) onRunSelection(selection);
    return true;
  }, [onRunSelection]);

  // Run the (expensive) completion scan for `text`/`caret` and update the popup.
  // Factored out of refreshAutocomplete so the debounced timer can invoke it.
  const computeAutocomplete = useCallback(
    (text: string, caret: number) => {
      // Defensive: the timer is cleared on unmount, but guard anyway so a
      // late-firing callback never touches state on a torn-down component.
      if (!mountedRef.current || readOnly) return;
      const ctx = getCompletions(text, caret, language);
      if (!ctx) {
        setCompletion(null);
        return;
      }
      setCompletion(ctx);
      setAcIndex(0);
      const ta = textareaRef.current;
      const before = text.slice(0, caret);
      const line = before.split("\n").length - 1;
      const col = caret - (text.lastIndexOf("\n", caret - 1) + 1);
      const cw = charWidthRef.current || FONT_SIZE * 0.6;
      // Anchor relative to the LIVE scroll position so the popup lands at the
      // caret even if the buffer scrolled between keystroke and scan.
      setAcPos({
        left: PAD_X + col * cw - (ta?.scrollLeft ?? 0),
        top: PAD_Y + (line + 1) * LINE_HEIGHT - (ta?.scrollTop ?? 0),
      });
    },
    [language, readOnly],
  );

  // Schedule a completion refresh, coalescing rapid keystrokes. Only the
  // expensive whole-document scan (getCompletions) + the popup state updates are
  // deferred; the synchronous dismiss paths (Escape/Enter/Tab in handleKeyDown,
  // scroll, blur) stay immediate so accept/positioning correctness is unaffected.
  const refreshAutocomplete = useCallback(
    (text: string, caret: number) => {
      if (acTimerRef.current !== null) clearTimeout(acTimerRef.current);
      acTimerRef.current = setTimeout(() => {
        acTimerRef.current = null;
        computeAutocomplete(text, caret);
      }, AC_DEBOUNCE_MS);
    },
    [computeAutocomplete],
  );

  // Clear any pending completion scan on unmount so the debounced callback never
  // fires (and never calls setState) after the component is gone.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (acTimerRef.current !== null) {
        clearTimeout(acTimerRef.current);
        acTimerRef.current = null;
      }
    };
  }, []);

  // The popup shows identifier/keyword completions first, then matching
  // snippets, as one flat list. acIndex addresses this combined list so arrow
  // navigation and Enter/Tab accept work uniformly across both kinds. When no
  // snippet matches this is exactly `completion.items` (back-compat).
  const acEntries = useMemo<AutocompleteEntry[]>(() => {
    if (!completion) return [];
    const ids: AutocompleteEntry[] = completion.items.map((label) => ({
      kind: "identifier",
      label,
    }));
    const snips: AutocompleteEntry[] = completion.snippets.map((snippet) => ({
      kind: "snippet",
      label: snippet.prefix,
      snippet,
    }));
    return [...ids, ...snips];
  }, [completion]);

  // Accept the popup entry at `acIndex`: identifiers go through applyCompletion
  // (unchanged), snippets through applySnippet (inserts the body, caret at $0).
  // Both reuse the same undo-preserving textarea edit + onChange plumbing.
  const acceptEntry = useCallback(
    (entry: AutocompleteEntry) => {
      const ta = textareaRef.current;
      if (!ta || !completion) return;
      const { value: nextValue, caret } =
        entry.kind === "snippet"
          ? applySnippet(ta.value, completion.start, ta.selectionStart, entry.snippet)
          : applyCompletion(ta.value, completion.start, ta.selectionStart, entry.label);
      applyOwnedTextareaEdit(ta, nextValue, caret, caret);
      setCompletion(null);
      syncCaret();
    },
    [applyOwnedTextareaEdit, completion, syncCaret],
  );

  // --- Overlay decorations (VSCode parity) --------------------------------
  // All three are derived purely from `value` + the caret, recomputed only when
  // those change (never on scroll/render), and rendered into the highlight layer
  // as absolutely-positioned boxes (the textarea text is never modified).

  // Bracket matching: only when the selection is collapsed (caret, no range).
  const bracketMatch = useMemo(
    () => (hasSelection ? null : findMatchingBracket(value, caretIndex)),
    [value, caretIndex, hasSelection],
  );
  const bracketBoxes = useMemo(() => {
    if (!bracketMatch) return [];
    return [bracketMatch.open, bracketMatch.close].map((b) => {
      const { line, column } = indexToLineColumn(value, b.index);
      return {
        key: `${b.index}:${b.char}`,
        left: PAD_X + column * charWidth,
        top: PAD_Y + line * LINE_HEIGHT,
        width: charWidth,
      };
    });
  }, [bracketMatch, value, charWidth]);

  // Indent guides: a faint vertical rule at each indentation level.
  const indentGuides = useMemo(
    () => computeIndentGuides(value, 2),
    [value],
  );

  // Active-line highlight: the 0-based line the caret sits on.
  const activeLine = useMemo(
    () => activeLineNumber(value, caretIndex),
    [value, caretIndex],
  );

  // --- Code folding (VSCode parity) ---------------------------------------
  // Foldable regions are detected purely from `value` by indentation (depth
  // aware, CRLF safe). Folding is a VIEW concern — the textarea text is never
  // mutated. We keep a set of collapsed HEADER line indices; the gutter draws a
  // chevron per header and the overlay dims/`…`-marks each collapsed body so the
  // region reads as a single line while editing of unfolded text keeps working.
  const foldRegions = useMemo(() => computeFoldRegions(value, 2), [value]);
  const foldStarts = useMemo(
    () => new Set(foldRegions.map((r) => r.startLine)),
    [foldRegions],
  );
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(
    () => new Set(),
  );
  // Drop collapsed headers that are no longer fold headers after an edit (e.g.
  // the user dedented the block away), so stale `…` affordances never linger.
  useEffect(() => {
    setCollapsedFolds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<number>();
      for (const line of prev) {
        if (foldStarts.has(line)) next.add(line);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [foldStarts]);

  const toggleFold = useCallback((startLine: number) => {
    setCollapsedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  }, []);

  // The collapsed body bands the overlay greys out (one band per collapsed
  // region, covering the hidden lines below the header).
  const collapsedBands = useMemo(
    () =>
      foldRegions
        .filter((r) => collapsedFolds.has(r.startLine))
        .map((r) => ({
          key: `fold:${r.startLine}-${r.endLine}`,
          top: PAD_Y + (r.startLine + 1) * LINE_HEIGHT,
          height: (r.endLine - r.startLine) * LINE_HEIGHT,
        })),
    [foldRegions, collapsedFolds],
  );

  // The textarea is UNCONTROLLED (defaultValue + imperative external sync) so
  // the browser's native undo/redo stack survives typing — a controlled
  // `value={...}` reassigns the DOM value every render and wipes undo history.
  // External changes (AI writes, page load, language switch) are pushed in here.
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && ta.value !== value) {
      const s = Math.min(ta.selectionStart, value.length);
      const e = Math.min(ta.selectionEnd, value.length);
      ta.value = value;
      ta.setSelectionRange(s, e);
      // Keep the decoration caret in range after an external rewrite.
      setCaretIndex(s);
      setHasSelection(e > s);
    }
  }, [value]);

  // Recompute the minimap viewport rectangle from the live textarea metrics.
  const refreshViewport = useCallback(() => {
    const ta = textareaRef.current;
    const mh = minimapRef.current?.clientHeight ?? minimapHeight;
    if (!ta || mh <= 0) return;
    setViewportRect(
      computeViewportRect(
        ta.scrollTop,
        ta.clientHeight,
        ta.scrollHeight,
        mh,
        lineCount,
        MINIMAP_BLOCK_MAX_H,
      ),
    );
  }, [lineCount, minimapHeight]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (decorRef.current) {
      decorRef.current.scrollTop = ta.scrollTop;
      decorRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    refreshViewport();
  }, [refreshViewport]);

  // Auto-enable/disable the minimap by line count until the user toggles it.
  useEffect(() => {
    if (minimapTouchedRef.current) return;
    setMinimapOn(shouldShowMinimapByDefault(lineCount, MINIMAP_AUTO_LINES));
  }, [lineCount]);

  // Track the minimap column height (ResizeObserver) and recompute the rect when
  // the editor resizes, the file changes, or the minimap is shown/hidden.
  useEffect(() => {
    const node = minimapRef.current;
    if (!minimapOn || !node) {
      setMinimapHeight(0);
      return;
    }
    const update = () => {
      setMinimapHeight(node.clientHeight);
      refreshViewport();
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(node);
    const ta = textareaRef.current;
    if (ta) ro.observe(ta);
    return () => ro.disconnect();
  }, [minimapOn, refreshViewport]);

  // Keep the rect fresh when the document (and thus scrollHeight) changes.
  useEffect(() => {
    if (minimapOn) refreshViewport();
  }, [value, minimapOn, refreshViewport]);

  const toggleMinimap = useCallback(() => {
    minimapTouchedRef.current = true;
    setMinimapOn((on) => !on);
  }, []);

  // Scroll the textarea so the clicked minimap-y centers in the viewport.
  const scrollToMinimapY = useCallback(
    (clientY: number) => {
      const node = minimapRef.current;
      const ta = textareaRef.current;
      if (!node || !ta) return;
      const rect = node.getBoundingClientRect();
      const y = clientY - rect.top;
      ta.scrollTop = minimapYToScrollTop(
        y,
        ta.clientHeight,
        ta.scrollHeight,
        node.clientHeight,
        lineCount,
        MINIMAP_BLOCK_MAX_H,
      );
      syncScroll();
    },
    [lineCount, syncScroll],
  );

  // Click-and-drag scrubbing on the minimap. Pointer capture keeps tracking the
  // drag even when the cursor leaves the narrow column.
  const handleMinimapPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      scrollToMinimapY(event.clientY);
    },
    [scrollToMinimapY],
  );

  const handleMinimapPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Buttons bitmask: 1 === primary button held (i.e. dragging).
      if ((event.buttons & 1) === 0) return;
      scrollToMinimapY(event.clientY);
    },
    [scrollToMinimapY],
  );

  /** Select a match in the textarea and scroll it into view. */
  const selectMatch = useCallback(
    (index: number) => {
      const ta = textareaRef.current;
      if (!ta || index < 0 || index >= matches.length) return;
      const m = matches[index];
      ta.focus();
      ta.setSelectionRange(m.start, m.end);
      const line = value.slice(0, m.start).split("\n").length - 1;
      ta.scrollTop = Math.max(0, line * LINE_HEIGHT - ta.clientHeight / 2);
      syncScroll();
      syncCaret();
    },
    [matches, value, syncScroll, syncCaret],
  );

  // When the query changes, jump to the match nearest the caret.
  useEffect(() => {
    if (!findOpen || matches.length === 0) return;
    const caret = textareaRef.current?.selectionStart ?? 0;
    const idx = nextMatchIndex(matches, caret, 1);
    setActiveMatch(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, wholeWord, useRegex, inSelection, findOpen]);

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      const ta = textareaRef.current;
      const cur = matches[Math.min(activeMatch, matches.length - 1)];
      // First navigation lands on the nearest match; once it's selected,
      // subsequent presses step to the next/previous one.
      const alreadyOnActive =
        !!ta && !!cur && ta.selectionStart === cur.start && ta.selectionEnd === cur.end;
      const idx = alreadyOnActive
        ? stepMatch(matches.length, activeMatch, direction)
        : Math.min(activeMatch, matches.length - 1);
      setActiveMatch(idx);
      selectMatch(idx);
    },
    [matches, activeMatch, selectMatch],
  );

  const doReplace = useCallback(() => {
    if (matches.length === 0) return;
    const idx = Math.min(activeMatch, matches.length - 1);
    try {
      const { text } = replaceMatch(value, matches[idx], replacement);
      setReplacementFailure(null);
      commitDocumentValue(text);
    } catch (error) {
      if (!isFindReplacementPlanError(error)) throw error;
      setReplacementFailure({
        value,
        query,
        replacement,
        options: findOpts,
        messageKey: findReplacementPlanMessageKey(error),
      });
    }
  }, [matches, activeMatch, value, replacement, commitDocumentValue, query, findOpts]);

  const doReplaceAll = useCallback(() => {
    try {
      const { text, count } = replaceAllMatches(
        value,
        query,
        replacement,
        findOpts,
      );
      setReplacementFailure(null);
      if (count > 0) commitDocumentValue(text);
    } catch (error) {
      if (!isFindReplacementPlanError(error)) throw error;
      setReplacementFailure({
        value,
        query,
        replacement,
        options: findOpts,
        messageKey: findReplacementPlanMessageKey(error),
      });
    }
  }, [value, query, replacement, findOpts, commitDocumentValue]);

  const toggleInSelection = useCallback(() => {
    setInSelection((on) => {
      if (on) return false;
      const ta = textareaRef.current;
      if (ta && ta.selectionEnd > ta.selectionStart) {
        setSelRange({ start: ta.selectionStart, end: ta.selectionEnd });
        return true;
      }
      return false; // no selection — nothing to scope to
    });
  }, []);

  const openGoto = useCallback(() => {
    setGotoValue("");
    setGotoOpen(true);
    requestAnimationFrame(() => gotoInputRef.current?.focus());
  }, []);

  const applyGoto = useCallback(() => {
    const ta = textareaRef.current;
    const n = parseInt(gotoValue, 10);
    setGotoOpen(false);
    if (!ta || !Number.isFinite(n) || n < 1) return;
    const lines = value.split("\n");
    const target = Math.min(n, lines.length);
    let offset = 0;
    for (let i = 0; i < target - 1; i += 1) offset += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(offset, offset + (lines[target - 1]?.length ?? 0));
    ta.scrollTop = Math.max(0, (target - 1) * LINE_HEIGHT - ta.clientHeight / 2);
    syncScroll();
    syncCaret();
  }, [gotoValue, value, syncScroll, syncCaret]);

  const openFind = useCallback(() => {
    const ta = textareaRef.current;
    const selected = ta ? value.slice(ta.selectionStart, ta.selectionEnd) : "";
    if (selected && !selected.includes("\n")) {
      setQuery(boundFindQuery(selected));
    }
    setFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.select());
  }, [value]);

  // Whether the current language has a Prettier parser (so Format can run).
  // Languages without one (SQL, Python, Go, …) leave the action disabled so it
  // never corrupts the buffer.
  const canFormat = useMemo(
    () => !readOnly && canFormatLanguage(language),
    [language, readOnly],
  );

  // Live mirror of the current language. formatBuffer captures `language` in its
  // closure at invocation, but a language switch DURING the async format would
  // not update that closed-over value — so we read the current language from
  // this ref after the await to detect (and discard) a now-stale result.
  const languageRef = useRef(language);
  languageRef.current = language;

  // Format Document (VSCode Shift+Alt+F). Reads the live textarea value (so a
  // synchronous in-flight edit isn't missed), pretty-prints it with Prettier's
  // browser build, and writes it back through the undo-preserving edit path so
  // Ctrl/Cmd+Z reverts the whole format as ONE step. No-ops gracefully when the
  // language has no parser or when the source has a syntax error (formatCode
  // returns the original text and never throws).
  const formatBuffer = useCallback(async () => {
    if (!canFormat) return;
    const ta = textareaRef.current;
    // Capture the source AND the language at invocation; formatCode is async, so
    // both can change while we await (fast typing, a language switch).
    const source = ta ? ta.value : value;
    const capturedLanguage = language;
    const formatted = await formatCode(source, capturedLanguage);
    // Nothing changed (already-formatted, parser-less, or invalid syntax).
    if (formatted === source) return;
    const target = textareaRef.current;
    if (!target) {
      // No live textarea to diff against — only safe to apply when nothing could
      // have raced (language unchanged); otherwise discard the stale result.
      if (capturedLanguage === languageRef.current) commitDocumentValue(formatted);
      return;
    }
    // Guard against a stale result: if the user edited the buffer or switched the
    // language during the await, the formatted text is for an old snapshot (and
    // possibly the wrong parser). Discard it rather than clobbering live edits.
    if (target.value !== source || capturedLanguage !== languageRef.current)
      return;
    // Keep the caret within the (possibly shorter/longer) reformatted text.
    const caret = Math.min(target.selectionStart, formatted.length);
    if (!applyOwnedTextareaEdit(target, formatted, caret, caret)) return;
    closeAutocomplete();
    syncCaret();
  }, [canFormat, language, value, commitDocumentValue, applyOwnedTextareaEdit, closeAutocomplete, syncCaret]);

  // Explicit save gesture (Cmd/Ctrl+S, VSCode muscle memory). Format the buffer
  // first when "Format on save" is enabled + the language has a formatter
  // (reusing formatBuffer so the formatted text flows through the normal
  // onChange/undo path and the stale-result guard still applies), then flush the
  // host's autosave via onSave. The pref is read live (the toggle lives in the
  // CodeMirror editor's settings but is shared via localStorage). An unsupported
  // language / toggle-off / format error never blocks the save: onSave still
  // runs with the raw buffer. Only fires on the chord — never mid-typing.
  const doSave = useCallback(async () => {
    if (
      shouldFormatOnSave({
        language,
        formatOnSave: loadEditorPref("formatOnSave", false),
      })
    ) {
      await formatBuffer();
    }
    onSave?.("shortcut");
  }, [formatBuffer, language, onSave]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // IME candidate navigation/confirmation must bypass every editor command,
      // including completion acceptance and run chords. keyCode 229 covers
      // Safari/Chromium input methods that omit isComposing on this key event.
      if (
        isComposingRef.current ||
        isImeCompositionKey({
          isComposing: event.nativeEvent.isComposing,
          keyCode: event.nativeEvent.keyCode,
        })
      ) {
        return;
      }
      if (
        event.key === "Enter" &&
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        onRunAndInsert
      ) {
        event.preventDefault();
        onRunAndInsert();
        return;
      }
      if (
        event.key === "Enter" &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (onRunAndAdvance || onRunSelection)
      ) {
        event.preventDefault();
        if (onRunAndAdvance) onRunAndAdvance();
        else runExecutableSelection();
        return;
      }
      // Autocomplete popup navigation takes priority while it is open. acEntries
      // is the flat identifier+snippet list (== completion.items when no snippet
      // matches), so navigation/accept are unchanged in the no-snippet case.
      if (completion && acEntries.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setAcIndex((i) => (i + 1) % acEntries.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setAcIndex((i) => (i - 1 + acEntries.length) % acEntries.length);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          acceptEntry(acEntries[acIndex]);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeAutocomplete();
          return;
        }
      }
      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        onExitEditMode
      ) {
        event.preventDefault();
        onExitEditMode();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        // Cmd/Ctrl+Enter runs, matching VSCode / Jupyter.
        if (onRun) {
          event.preventDefault();
          onRun();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "f" || event.key === "F")) {
        // Cmd/Ctrl+F opens find/replace, matching VSCode.
        event.preventDefault();
        openFind();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "g" || event.key === "G")) {
        // Cmd/Ctrl+G opens go-to-line, matching VSCode.
        event.preventDefault();
        openGoto();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S")) {
        // Cmd/Ctrl+S saves (VSCode muscle memory). Swallow the chord so the
        // browser's "save page" dialog never opens; doSave formats first when
        // the toggle is on + language is supported, then flushes the host save.
        event.preventDefault();
        void doSave();
        return;
      }
      if (event.shiftKey && event.altKey && (event.key === "f" || event.key === "F")) {
        // Shift+Alt+F formats the document, matching VSCode. Always swallow the
        // chord so the buffer never gets a stray "F"; formatBuffer no-ops when
        // the language has no parser.
        event.preventDefault();
        void formatBuffer();
        return;
      }
      // VSCode line commands (comment toggle Cmd/Ctrl+/, move Alt+↑/↓, duplicate
      // Shift+Alt+↑/↓) use modifier chords, so handle them before the shortcut
      // pass-through below.
      {
        const ta = event.currentTarget;
        const command = handleEditorCommandKey({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          language,
          value: ta.value,
          selectionStart: ta.selectionStart,
          selectionEnd: ta.selectionEnd,
        });
        if (command) {
          event.preventDefault();
          if (
            !applyOwnedTextareaEdit(
              ta,
              command.value,
              command.selectionStart,
              command.selectionEnd,
            )
          ) {
            return;
          }
          closeAutocomplete();
          syncCaret();
          return;
        }
      }
      // Don't intercept editor shortcuts (Cmd/Ctrl+A, copy, undo, …).
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const ta = event.currentTarget;
      // Read value + caret both from the live DOM so they're always consistent
      // (the controlled `value` prop can lag a synchronous edit during fast
      // typing).
      const edit = handleEditorKey({
        key: event.key,
        shiftKey: event.shiftKey,
        value: ta.value,
        selectionStart: ta.selectionStart,
        selectionEnd: ta.selectionEnd,
      });
      if (!edit) return;
      // Auto-indent, bracket pairing, multi-line (de)indent, etc. Applied via an
      // undo-preserving edit (synchronously, so the next keystroke sees the new
      // caret); the input event drives React's controlled onChange.
      event.preventDefault();
      if (
        !applyOwnedTextareaEdit(
          ta,
          edit.value,
          edit.selectionStart,
          edit.selectionEnd,
        )
      ) {
        return;
      }
      closeAutocomplete();
      syncCaret();
    },
    [applyOwnedTextareaEdit, onRun, onRunAndAdvance, onRunAndInsert, onExitEditMode, onRunSelection, runExecutableSelection, openFind, openGoto, formatBuffer, doSave, language, completion, acEntries, acIndex, acceptEntry, closeAutocomplete, syncCaret],
  );

  // Find and Go To are the Docs Find and Replace card in the dialogs' chrome
  // (code tone), the same card the CodeMirror editor opens: a search row, an
  // options row and a replace row. Every control and key path is kept.
  const findCardClassName = `note-editor-find-replace ${officeDialogClassName({
    tone: "code",
  })} office-pop-in ${chrome.findCard}`;
  const findToggleClassName = (active: boolean) =>
    active
      ? "note-editor-find-replace__button is-active"
      : "note-editor-find-replace__button";

  return (
    <div className={chrome.fallbackEditor}>
      {findOpen ? (
        <div
          data-testid="code-find-bar"
          className={findCardClassName}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setFindOpen(false);
              textareaRef.current?.focus();
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
                onChange={(event) => setQuery(boundFindQuery(event.target.value))}
                maxLength={MAX_FIND_QUERY_CHARS}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goToMatch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder={t("code.find.findPlaceholder")}
              />
            </label>
            <span
              data-testid="code-find-count"
              title={findErrorTitle ?? undefined}
              className={`note-editor-find-replace__count${
                regexError ? ` ${officeDialogParts.error}` : ""
              }`}
            >
              {regexError
                ? "⚠ regex"
                : replacementPlanFailed
                  ? "⚠ replace"
                : matches.length === 0
                  ? "0/0"
                  : `${Math.min(activeMatch + 1, matches.length)}/${matches.length}${matchesTruncated ? "+" : ""}`}
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
              onClick={() => {
                setFindOpen(false);
                textareaRef.current?.focus();
              }}
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
              onClick={() => setCaseSensitive((value) => !value)}
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
          </div>
          <div className="note-editor-find-replace__search-row">
            <input
              data-testid="code-replace-input"
              className={`note-editor-find-replace__input note-editor-find-replace__input--replace ${chrome.mono}`}
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              maxLength={4_096}
              placeholder={t("code.find.replacePlaceholder")}
            />
            <button
              type="button"
              onClick={doReplace}
              disabled={
                readOnly || Boolean(regexError) || replacementPlanFailed
              }
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
              disabled={
                readOnly || Boolean(regexError) || replacementPlanFailed
              }
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
        // Go To in the same card (Word's Go To is a tab of its Find and
        // Replace dialog).
        <div
          data-testid="code-goto-bar"
          className={findCardClassName}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setGotoOpen(false);
              textareaRef.current?.focus();
            }
          }}
        >
          <header className="note-editor-find-replace__header">
            <span className="note-editor-find-replace__title">
              {t("code.palette.cmd.goToLine")}
            </span>
            <button
              type="button"
              onClick={() => {
                setGotoOpen(false);
                textareaRef.current?.focus();
              }}
              title={t("window.close")}
              aria-label={t("code.find.gotoClose")}
              data-testid="code-goto-close"
              className="note-editor-find-replace__button"
            >
              <X size={14} />
            </button>
          </header>
          <div className="note-editor-find-replace__search-row">
            <input
              ref={gotoInputRef}
              data-testid="code-goto-input"
              className={`note-editor-find-replace__input ${chrome.mono}`}
              type="number"
              min={1}
              max={lineCount}
              value={gotoValue}
              onChange={(event) =>
                setGotoValue(
                  event.target.value
                    .replace(/\D/gu, "")
                    .slice(0, gotoInputMaxLength),
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyGoto();
                }
              }}
              placeholder={t("code.find.gotoLinePlaceholder", {
                max: lineCount,
              })}
              aria-label={t("code.find.gotoLinePlaceholder", {
                max: lineCount,
              })}
            />
            <button
              type="button"
              onClick={applyGoto}
              data-testid="code-goto-go"
              className="note-editor-find-replace__action"
            >
              {t("code.find.goto")}
            </button>
          </div>
        </div>
      ) : null}
      <div className={chrome.fallbackBody}>
      {/* a11y: the gutter mixes decorative line numbers with INTERACTIVE fold
       * toggles, so we cannot mark the whole container aria-hidden (that would
       * hide the buttons from assistive tech). Instead each line-number text
       * span is individually aria-hidden, while the fold toggles keep their
       * aria-label / aria-expanded — line numbers stay silent for screen
       * readers AND the fold affordances stay announced. */}
      <div
        ref={gutterRef}
        data-testid="code-gutter"
        className={chrome.fallbackGutter}
        style={{
          // The editor's own metrics: the rows line up with the textarea's.
          padding: `${PAD_Y}px 6px ${PAD_Y}px 10px`,
          fontFamily: EDITOR_FONT,
          fontSize: FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
        }}
      >
        {Array.from({ length: lineCount }, (_, index) => {
          const foldable = foldStarts.has(index);
          const collapsed = collapsedFolds.has(index);
          return (
            <div
              key={index}
              className={chrome.fallbackGutterRow}
              style={{ height: LINE_HEIGHT }}
            >
              <span aria-hidden="true" data-testid="code-line-number">
                {index + 1}
              </span>
              {foldable ? (
                <button
                  type="button"
                  onClick={() => toggleFold(index)}
                  title={collapsed ? t("code.unfoldRegion") : t("code.foldRegion")}
                  aria-label={
                    collapsed ? t("code.unfoldRegion") : t("code.foldRegion")
                  }
                  aria-expanded={!collapsed}
                  data-testid="code-fold-toggle"
                  data-fold-line={index}
                  data-fold-collapsed={collapsed ? "true" : "false"}
                  className={chrome.foldToggle}
                >
                  {collapsed ? (
                    <ChevronRight size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                </button>
              ) : (
                // Keep the column width stable on non-foldable lines.
                <span aria-hidden="true" className={chrome.foldSpacer} />
              )}
            </div>
          );
        })}
      </div>
      <div className={chrome.fallbackSurface}>
        {/* Decoration layer (active-line bg, indent guides, bracket boxes).
         * Sits BEHIND the coloured text and the textarea; scroll is mirrored
         * from the textarea via syncScroll. Purely visual — never intercepts
         * pointer events and never alters the editable text. */}
        <div
          ref={decorRef}
          aria-hidden
          data-testid="code-decorations"
          className={chrome.fallbackDecorations}
        >
          {/* Sizer establishes the scrollable content box so this layer scrolls
           * 1:1 with the textarea content (height by line count, generous width
           * so the active-line band spans long lines). */}
          <div
            className={chrome.fallbackDecorationSizer}
            style={{ height: lineCount * LINE_HEIGHT + PAD_Y * 2 }}
          >
            {/* Active line background. */}
            <div
              data-testid="code-active-line"
              className={chrome.fallbackActiveLine}
              style={{
                top: PAD_Y + activeLine * LINE_HEIGHT,
                height: LINE_HEIGHT,
              }}
            />
            {/* Indentation guides. */}
            {indentGuides.map((g) => (
              <div
                key={`ig:${g.line}:${g.column}`}
                data-testid="code-indent-guide"
                className={chrome.fallbackIndentGuide}
                style={{
                  left: PAD_X + g.column * charWidth,
                  top: PAD_Y + g.line * LINE_HEIGHT,
                  height: LINE_HEIGHT,
                }}
              />
            ))}
            {/* Collapsed fold bands: grey out the hidden body of each collapsed
             * region and tag the header line with a '…' affordance. Purely
             * visual — the textarea text is untouched and stays editable. */}
            {collapsedBands.map((band) => (
              <div
                key={band.key}
                data-testid="code-fold-band"
                className={chrome.fallbackFoldBand}
                style={{ top: band.top, height: band.height }}
              >
                <span
                  data-testid="code-fold-ellipsis"
                  className={chrome.fallbackFoldEllipsis}
                  style={{
                    left: PAD_X,
                    fontFamily: EDITOR_FONT,
                    fontSize: FONT_SIZE,
                    lineHeight: `${LINE_HEIGHT}px`,
                  }}
                >
                  …
                </span>
              </div>
            ))}
            {/* Bracket-match boxes (caret bracket + its partner). */}
            {bracketBoxes.map((b) => (
              <div
                key={`bm:${b.key}`}
                data-testid="code-bracket-match"
                className={chrome.fallbackBracketMatch}
                style={{
                  left: b.left,
                  top: b.top,
                  width: b.width,
                  height: LINE_HEIGHT,
                }}
              />
            ))}
          </div>
        </div>
        <pre
          ref={preRef}
          aria-hidden
          className={chrome.fallbackHighlight}
          style={{ ...codeLayer, overflow: "hidden" }}
        >
          <code>
            {segments.map((segment, index) => {
              // Its colour comes from the module's [data-token] palette.
              const role = tokenRole(segment.className);
              return role ? (
                <span key={index} data-token={role}>
                  {segment.text}
                </span>
              ) : (
                <span key={index}>{segment.text}</span>
              );
            })}
            {/* Trailing newline keeps the last line scrollable into view. */}
            {value.endsWith("\n") || value === "" ? "\n" : null}
          </code>
        </pre>
        <textarea
          ref={textareaRef}
          defaultValue={value}
          readOnly={readOnly}
          onBeforeInput={(event) => {
            const input = event.nativeEvent as InputEvent;
            const inserted = input.data;
            if (documentLengthLimit === null || inserted === null) return;
            const textarea = event.currentTarget;
            const projectedLength =
              textarea.value.length -
              (textarea.selectionEnd - textarea.selectionStart) +
              inserted.length;
            if (projectedLength <= documentLengthLimit) return;
            event.preventDefault();
            onDocumentLimitExceeded?.();
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!commitDocumentValue(nextValue)) {
              const selection = Math.min(event.target.selectionStart, value.length);
              event.target.value = value;
              event.target.setSelectionRange(selection, selection);
              syncCaret();
              return;
            }
            if (!isComposingRef.current) {
              refreshAutocomplete(
                nextValue,
                event.target.selectionStart,
              );
            }
            syncCaret();
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
            closeAutocomplete();
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false;
            refreshAutocomplete(
              event.currentTarget.value,
              event.currentTarget.selectionStart,
            );
            syncCaret();
          }}
          // onSelect fires on every caret move (arrows, click, typing), keeping
          // the bracket-match / active-line overlays in sync without polling.
          onSelect={syncCaret}
          onScroll={() => {
            syncScroll();
            if (completion) closeAutocomplete();
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            isComposingRef.current = false;
            closeAutocomplete();
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-autocomplete="list"
          aria-controls={completion ? autocompleteListId : undefined}
          aria-activedescendant={
            completion ? `${autocompleteListId}-option-${acIndex}` : undefined
          }
          data-testid={editorTestId}
          placeholder={placeholder}
          style={{
            ...codeLayer,
            resize: "none",
            outline: "none",
            background: "transparent",
            color: "transparent",
            caretColor: "#24292f",
          }}
        />
        {completion ? (
          // The suggestions in the dialogs' chrome (code tone): the card as a
          // compact listbox at the caret, each suggestion one list row.
          <ul
            id={autocompleteListId}
            role="listbox"
            aria-label={t("code.editorAriaLabel")}
            data-testid="code-autocomplete"
            className={`${officeDialogClassName({ tone: "code" })} ${chrome.completion} ${chrome.mono}`}
            style={{ left: acPos.left, top: acPos.top }}
          >
            {acEntries.map((entry, index) => (
              <li
                key={`${entry.kind}:${entry.label}`}
                id={`${autocompleteListId}-option-${index}`}
                role="option"
                aria-selected={index === acIndex}
                data-testid="code-autocomplete-item"
                className={`code-autocomplete-item ${officeDialogParts.listItem} ${chrome.row} ${chrome.completionItem}`}
                data-snippet={entry.kind === "snippet" ? "true" : undefined}
                title={
                  entry.kind === "snippet" ? entry.snippet.description : undefined
                }
                // Keep textarea focus; accept on mousedown before blur fires.
                onMouseDown={(event) => {
                  event.preventDefault();
                  acceptEntry(entry);
                }}
              >
                <span className={chrome.rowText}>{entry.label}</span>
                {entry.kind === "snippet" ? (
                  <span
                    data-testid="code-autocomplete-snippet-badge"
                    className={chrome.badge}
                  >
                    {t("code.snippet.badge")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {minimapOn ? (
        <div
          ref={minimapRef}
          data-testid="code-minimap"
          onPointerDown={handleMinimapPointerDown}
          onPointerMove={handleMinimapPointerMove}
          className={chrome.fallbackMinimap}
          style={{
            // The blocks' scale reads the same constant.
            width: MINIMAP_WIDTH,
          }}
        >
          {/* Per-line monochrome density blocks (length -> width). */}
          <div data-testid="code-minimap-blocks" aria-hidden>
            {lineLengths.map((len, index) => {
              const w = lineBlockWidth(len, {
                maxWidth: MINIMAP_WIDTH - MINIMAP_PAD_X * 2,
              });
              const h = lineBlockHeight(
                lineCount,
                minimapHeight,
                MINIMAP_BLOCK_MAX_H,
              );
              return (
                <div
                  key={`${index}:${len}`}
                  className={chrome.fallbackMinimapBlock}
                  style={{
                    height: h,
                    marginLeft: MINIMAP_PAD_X,
                    width: w,
                  }}
                />
              );
            })}
          </div>
          {/* Draggable viewport rectangle showing the visible slice. */}
          <div
            data-testid="code-minimap-viewport"
            aria-hidden
            className={chrome.fallbackMinimapViewport}
            style={{ top: viewportRect.top, height: viewportRect.height }}
          />
        </div>
      ) : null}
      {/* The editor's own commands at its top-right edge, in the editors'
          shared floating toolbar (note-editor.css .floating-toolbar) as the
          CodeMirror editor draws them. */}
      <div className={chrome.editorToolbar}>
      <div className={`floating-toolbar ${chrome.editorToolbarFace}`}>
      {onRunSelection ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={runExecutableSelection}
          title={`${t("code.run")} · Shift+Enter`}
          aria-label={t("code.run")}
          aria-keyshortcuts="Shift+Enter"
          data-testid="code-run-selection"
          className={floatingToolbarButtonClass(hasSelection)}
        >
          <Play size={16} aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void formatBuffer()}
        disabled={!canFormat}
        title={
          canFormat ? t("code.format") : t("code.formatUnsupported")
        }
        aria-label={t("code.format")}
        data-testid="code-format"
        className={floatingToolbarButtonClass(false)}
      >
        <AlignLeft size={16} />
      </button>
      <button
        type="button"
        onClick={toggleMinimap}
        title={minimapOn ? t("code.minimapHide") : t("code.minimapShow")}
        aria-label={minimapOn ? t("code.minimapHide") : t("code.minimapShow")}
        aria-pressed={minimapOn}
        data-testid="code-minimap-toggle"
        className={floatingToolbarButtonClass(minimapOn)}
      >
        <MapIcon size={16} />
      </button>
      </div>
      </div>
      </div>
    </div>
  );
}

/** A key of the editor's floating toolbar: the shared mini toolbar's key
 *  (note-editor.css .floating-toolbar-btn), lit while its toggle is on. */
function floatingToolbarButtonClass(active: boolean): string {
  return `floating-toolbar-btn ${chrome.editorToolbarButton}${active ? " is-active" : ""}`;
}
