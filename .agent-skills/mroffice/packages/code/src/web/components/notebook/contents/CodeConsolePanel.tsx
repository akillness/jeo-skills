"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * CodeConsolePanel — an interactive console for the code editor (VS Code's
 * integrated terminal / Python Interactive Window, within this sandbox).
 *
 * There is no shell to attach to here, and there deliberately never will be:
 * the runtimes are the sandboxed language kernels, not a host process. What a
 * terminal is actually FOR — poke at the state your file just produced, try an
 * expression, read the error, try again — is what this panel provides. Console
 * submissions reuse this panel's own interactive session where the provider
 * supports it. JavaScript and TypeScript one-shot file runs stay isolated and
 * do not seed that Console namespace.
 *
 * The panel owns transcript, history and keyboard behaviour only. Evaluation,
 * the run lock and interruption stay with the host, which already serialises
 * every other execution on the page.
 */

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import { Loader2 } from "lucide-react";
import {
  ChevronDown,
  ChevronRight,
  History,
  Search,
  Square,
  Trash2,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import AnsiText from "./code-output/AnsiText";
import {
  officeDialogClassName,
  officeDialogParts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import {
  CODE_CONSOLE_HISTORY_MAX_ENTRIES,
  CODE_CONSOLE_HISTORY_MAX_ENTRY_CHARS,
  clearCodeConsoleHistory,
  loadCodeConsoleHistory,
  recordCodeConsoleSubmissionWithReceipt,
} from "../../../lib/code-runner/code-console-history";
import type { RunResult } from "@mrnote/core/web/lib/code-runner/js-runner.ts";

import styles from "./CodeSidePanels.module.css";
import { isImeKeydown } from "@mrnote/core/web/lib/soft-keyboard.ts";

/** Longest single submission accepted at the prompt. */
export const CODE_CONSOLE_INPUT_LIMIT = CODE_CONSOLE_HISTORY_MAX_ENTRY_CHARS;
/** Transcript entries retained; older ones are dropped from the top. */
export const CODE_CONSOLE_MAX_ENTRIES = 200;
/** Log lines rendered per entry (the runner already bounds its own output). */
export const CODE_CONSOLE_MAX_LINES_PER_ENTRY = 200;
/** Characters rendered per log line. */
export const CODE_CONSOLE_MAX_LINE_CHARS = 4_000;
/** Distinct history entries kept for arrow-key recall. */
export const CODE_CONSOLE_MAX_HISTORY = CODE_CONSOLE_HISTORY_MAX_ENTRIES;
/** Maximum rendered transcript characters inspected by one search. */
export const CODE_CONSOLE_SEARCH_CHAR_BUDGET = 2_000_000;

export interface CodeConsoleEntry {
  /** Monotonic id, unique within one panel lifetime. */
  id: number;
  /** Exactly what the user submitted. */
  input: string;
  /** Settled result; absent while the submission is still running. */
  result?: RunResult;
  /**
   * A note from the console ABOUT this entry, not output from the code — shown
   * apart from stdout/stderr so the two are never confused. Used when stopping
   * a submission also ended the session's state.
   */
  notice?: string;
}

export interface CodeConsolePanelProps {
  entries: readonly CodeConsoleEntry[];
  /** A submission is in flight (the host's run lock is held). */
  busy: boolean;
  /**
   * Something else on the page is executing, so the prompt is unavailable.
   * Distinct from `busy`: the console did not start that run and cannot stop it.
   */
  blocked?: boolean;
  /** Exact durable history owner. CodeWindow supplies `page:${pageId}`. */
  historyScope: string;
  language: string;
  /** The panel follows the app theme through the dialog chrome's tokens
   * (data-theme-mode); kept for callers that still pass it. */
  isDark?: boolean;
  onSubmit: (source: string) => void;
  onInterrupt: () => void;
  onClear: () => void;
  onClose: () => void;
  labels: {
    title: string;
    placeholder: string;
    hint: string;
    empty: string;
    busy: string;
    blocked: string;
    interrupt: string;
    clear: string;
    clearHistory: string;
    clearHistoryFailed: string;
    historySessionOnly: string;
    close: string;
    search: string;
    noMatches: string;
    searchStatus: (matches: number, inspected: number, total: number) => string;
    searchLimited: string;
    interrupted: string;
    truncated: (hidden: number) => string;
  };
}

function boundedLine(line: string): string {
  return line.length <= CODE_CONSOLE_MAX_LINE_CHARS
    ? line
    : `${line.slice(0, CODE_CONSOLE_MAX_LINE_CHARS)}…`;
}

/** The lines to render for one settled entry, with their stream tags. */
function entryLines(
  result: RunResult | undefined,
): Array<{ text: string; stream: "stdout" | "stderr" }> {
  if (!result) return [];
  const lines: Array<{ text: string; stream: "stdout" | "stderr" }> = [];
  const logs = result.logs ?? [];
  const shown = logs.slice(-CODE_CONSOLE_MAX_LINES_PER_ENTRY);
  const skipped = logs.length - shown.length;
  for (const [index, text] of shown.entries()) {
    lines.push({
      text: boundedLine(text),
      stream:
        result.logStreams?.[index + skipped] === "stderr" ? "stderr" : "stdout",
    });
  }
  if (result.result !== undefined && result.result !== "") {
    lines.push({ text: boundedLine(result.result), stream: "stdout" });
  }
  // A stopped submission already shows the localized "interrupted" line; the
  // runtime's own error for it is the same fact in English.
  if (result.error && !result.interrupted) {
    lines.push({ text: boundedLine(result.error), stream: "stderr" });
  }
  return lines;
}

export interface CodeConsoleSearchResult {
  readonly entries: readonly CodeConsoleEntry[];
  readonly inspectedEntries: number;
  readonly truncated: boolean;
}

/**
 * Searches newest complete transcript entries within one hard character budget.
 * A partially scanned entry is never reported as a complete result; callers can
 * surface `truncated` instead of claiming that older output has no match.
 */
export function filterCodeConsoleEntries(
  entries: readonly CodeConsoleEntry[],
  rawQuery: string,
  charBudget = CODE_CONSOLE_SEARCH_CHAR_BUDGET,
): CodeConsoleSearchResult {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) {
    return {
      entries: [...entries],
      inspectedEntries: entries.length,
      truncated: false,
    };
  }
  let remaining = Math.max(
    0,
    Math.min(CODE_CONSOLE_SEARCH_CHAR_BUDGET, Math.trunc(charBudget) || 0),
  );
  let inspectedEntries = 0;
  const matches: CodeConsoleEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    const chunks = [
      boundedLine(entry.input),
      ...(entry.notice ? [boundedLine(entry.notice)] : []),
      ...entryLines(entry.result).map((line) => line.text),
    ];
    const required = chunks.reduce((total, chunk) => total + chunk.length, 0);
    if (required > remaining) break;
    remaining -= required;
    inspectedEntries += 1;
    if (chunks.some((chunk) => chunk.toLocaleLowerCase().includes(query))) {
      matches.unshift(entry);
    }
  }
  return {
    entries: matches,
    inspectedEntries,
    truncated: inspectedEntries < entries.length,
  };
}

export default function CodeConsolePanel({
  entries,
  busy,
  blocked = false,
  historyScope,
  language,
  onSubmit,
  onInterrupt,
  onClear,
  onClose,
  labels,
}: CodeConsolePanelProps) {
  const t = useTranslations("console-notebooks");
  const clearHistoryCancelLabel = `${t("common.cancel")}: ${labels.clearHistory}`;
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSelection, setSearchSelection] = useState<{
    query: string;
    entryId: number;
  } | null>(null);
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [storedHistory, setStoredHistory] = useState<string[]>(() =>
    loadCodeConsoleHistory(historyScope, language),
  );
  const [historyClearedThroughId, setHistoryClearedThroughId] = useState<
    number | null
  >(null);
  const [historyFeedback, setHistoryFeedback] = useState<string | null>(null);
  const [historySessionOnly, setHistorySessionOnly] = useState(false);
  const [pendingHistoryClear, setPendingHistoryClear] = useState<{
    owner: string;
    history: readonly string[];
  } | null>(null);
  const historyOwner = `${historyScope}\u0000${language}`;
  // -1 == editing a fresh draft; otherwise an index into `history` (newest 0).
  const [historyIndex, setHistoryIndex] = useState(-1);
  const stashedDraftRef = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const searchRelationshipId = useId();
  const searchResult = useMemo(
    () => filterCodeConsoleEntries(entries, deferredSearchQuery),
    [deferredSearchQuery, entries],
  );
  const searchActive = deferredSearchQuery.trim().length > 0;
  const displayedEntries = searchActive ? searchResult.entries : entries;
  const selectedSearchEntryIndex =
    searchActive && searchSelection?.query === deferredSearchQuery
      ? displayedEntries.findIndex(
          (entry) => entry.id === searchSelection.entryId,
        )
      : -1;
  const activeSearchEntryIndex =
    searchActive && displayedEntries.length > 0
      ? Math.max(selectedSearchEntryIndex, 0)
      : -1;
  const activeSearchEntryId =
    activeSearchEntryIndex >= 0
      ? (displayedEntries[activeSearchEntryIndex]?.id ?? null)
      : null;
  const entryIsCollapsed = (entryId: number) =>
    !searchActive && collapsedEntryIds.has(entryId);
  const moveSearchResult = (direction: -1 | 1) => {
    if (
      !searchActive ||
      activeSearchEntryIndex < 0 ||
      displayedEntries.length === 0
    ) {
      return false;
    }
    const nextIndex =
      (activeSearchEntryIndex + direction + displayedEntries.length) %
      displayedEntries.length;
    const entryId = displayedEntries[nextIndex]?.id;
    if (typeof entryId !== "number" || !Number.isSafeInteger(entryId)) {
      return false;
    }
    setSearchSelection({ query: deferredSearchQuery, entryId });
    const entry = transcriptRef.current?.querySelector<HTMLElement>(
      `[data-console-entry-id="${entryId}"]`,
    );
    if (typeof entry?.scrollIntoView === "function") {
      entry.scrollIntoView({ block: "nearest" });
    }
    return true;
  };

  // The live transcript wins chronological ordering for this mount; persisted
  // commands fill in the tail after close/unmount/reopen. De-duplicate globally
  // so repeatedly running one expression never makes history noisy.
  const history = useMemo(() => {
    const historyEntries: string[] = [];
    const seen = new Set<string>();
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (
        historyClearedThroughId !== null &&
        entries[index]!.id <= historyClearedThroughId
      ) {
        continue;
      }
      const value = entries[index]!.input;
      if (seen.has(value)) continue;
      seen.add(value);
      historyEntries.push(value);
      if (historyEntries.length >= CODE_CONSOLE_MAX_HISTORY) break;
    }
    for (const value of storedHistory) {
      if (seen.has(value)) continue;
      seen.add(value);
      historyEntries.push(value);
      if (historyEntries.length >= CODE_CONSOLE_MAX_HISTORY) break;
    }
    return historyEntries;
  }, [entries, historyClearedThroughId, storedHistory]);
  const historyClearPending = Boolean(
    pendingHistoryClear &&
    pendingHistoryClear.owner === historyOwner &&
    pendingHistoryClear.history === history &&
    history.length > 0,
  );

  // Keep the newest output in view, the way a terminal does.
  useLayoutEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [entries]);

  useEffect(() => {
    if (!busy && !blocked) inputRef.current?.focus();
  }, [busy, blocked]);

  const submit = useCallback(() => {
    const source = draft.slice(0, CODE_CONSOLE_INPUT_LIMIT);
    if (!source.trim() || busy || blocked) return;
    onSubmit(source);
    const historyReceipt = recordCodeConsoleSubmissionWithReceipt(
      historyScope,
      language,
      source,
      history,
    );
    setStoredHistory(historyReceipt.entries);
    setHistorySessionOnly(!historyReceipt.durable);
    setDraft("");
    setHistoryIndex(-1);
    stashedDraftRef.current = "";
  }, [blocked, busy, draft, history, historyScope, language, onSubmit]);

  const clearHistory = useCallback(() => {
    if (!clearCodeConsoleHistory(historyScope, language)) {
      setHistoryFeedback(labels.clearHistoryFailed);
      return;
    }
    setStoredHistory([]);
    setHistoryClearedThroughId(
      entries.reduce<number | null>(
        (maximum, entry) =>
          maximum === null || entry.id > maximum ? entry.id : maximum,
        null,
      ),
    );
    if (historyIndex >= 0) setDraft(stashedDraftRef.current);
    setHistoryIndex(-1);
    stashedDraftRef.current = "";
    setHistoryFeedback(null);
    setHistorySessionOnly(false);
  }, [entries, historyIndex, historyScope, labels.clearHistoryFailed, language]);

  const recall = useCallback(
    (direction: -1 | 1) => {
      if (history.length === 0) return false;
      if (direction === 1) {
        // Older
        const next = Math.min(historyIndex + 1, history.length - 1);
        if (historyIndex === -1) stashedDraftRef.current = draft;
        setHistoryIndex(next);
        setDraft(history[next] ?? "");
        return true;
      }
      // Newer; stepping past the newest restores the draft being written.
      if (historyIndex <= -1) return false;
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setDraft(next === -1 ? stashedDraftRef.current : (history[next] ?? ""));
      return true;
    },
    [draft, history, historyIndex],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      // Safari's pinyin-committing Enter arrives after compositionend
      // (isComposing false, keyCode 229): it must not run the line.
      if (isImeKeydown(event)) return;
      const input = event.currentTarget;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        if (!busy) onClear();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      // Arrow keys recall history from the edge LINES, so multi-line editing
      // inside a submission still moves the caret normally. The edge is the
      // first/last line rather than offset 0/end, because recalling an entry
      // leaves the caret after the text it just inserted: an offset test would
      // make every press after the first one dead, and walking back through
      // history is the whole point of having it.
      const beforeCaret = input.value.slice(0, input.selectionStart);
      const afterCaret = input.value.slice(input.selectionEnd);
      if (event.key === "ArrowUp" && !beforeCaret.includes("\n")) {
        if (recall(1)) event.preventDefault();
        return;
      }
      if (event.key === "ArrowDown" && !afterCaret.includes("\n")) {
        if (recall(-1)) event.preventDefault();
      }
    },
    [busy, onClear, onClose, recall, submit],
  );

  // A bottom panel in the dialog chrome (code tone, the task panes' glass
  // card): the chrome's title row and round close button, icon commands,
  // the panes' search field and messages, around the Code-owned transcript
  // and prompt.
  return (
    <section
      data-testid="code-console-panel"
      aria-label={labels.title}
      className={`${officeDialogClassName({ tone: "code", pane: true })} ${styles.bottomPane} ${styles.consolePane}`}
      onKeyDown={(event) => {
        if (
          entries.length > 0 &&
          (event.metaKey || event.ctrlKey) &&
          event.key.toLocaleLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          searchInputRef.current?.focus();
        }
      }}
    >
      <header className={officeDialogParts.header}>
        <span className={styles.titleRow}>
          <strong className={officeDialogParts.title}>{labels.title}</strong>
          <span
            data-testid="code-console-language"
            className={officeDialogParts.hint}
          >
            {language}
          </span>
          {busy ? (
            <span
              role="status"
              data-testid="code-console-busy"
              className={`${officeDialogParts.message} ${styles.notice}`}
            >
              <Loader2 size={12} aria-hidden className="animate-spin" />
              {labels.busy}
            </span>
          ) : null}
        </span>
        <span className={styles.headerActions}>
          <button
            type="button"
            onClick={onInterrupt}
            disabled={!busy}
            title={labels.interrupt}
            aria-label={labels.interrupt}
            data-testid="code-console-interrupt"
            className={officeDialogParts.iconButton}
          >
            <Square size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              onClear();
            }}
            disabled={busy || entries.length === 0}
            title={labels.clear}
            aria-label={labels.clear}
            data-testid="code-console-clear"
            className={officeDialogParts.iconButton}
          >
            <Trash2 size={12} aria-hidden />
          </button>
          {historyClearPending ? (
            <span
              data-testid="code-console-clear-history-confirmation"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                setPendingHistoryClear(null);
              }}
              className={styles.inlineConfirm}
            >
              <span
                role="status"
                className={officeDialogParts.message}
                data-tone="warning"
              >
                {labels.clearHistory}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (
                    pendingHistoryClear?.owner !== historyOwner ||
                    pendingHistoryClear.history !== history ||
                    history.length === 0
                  ) {
                    return;
                  }
                  setPendingHistoryClear(null);
                  clearHistory();
                }}
                title={labels.clearHistory}
                aria-label={labels.clearHistory}
                data-testid="code-console-clear-history-confirm"
                className={`${officeDialogParts.iconButton} ${styles.failed}`}
              >
                <Trash2 size={12} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPendingHistoryClear(null)}
                title={clearHistoryCancelLabel}
                aria-label={clearHistoryCancelLabel}
                data-testid="code-console-clear-history-cancel"
                className={officeDialogParts.iconButton}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                setPendingHistoryClear({ owner: historyOwner, history })
              }
              disabled={history.length === 0}
              title={labels.clearHistory}
              aria-label={labels.clearHistory}
              data-testid="code-console-clear-history"
              className={officeDialogParts.iconButton}
            >
              <History size={12} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title={labels.close}
            aria-label={labels.close}
            data-testid="code-console-close"
            className={officeDialogParts.close}
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      </header>

      {historyFeedback ? (
        <p
          role="alert"
          data-testid="code-console-history-error"
          className={officeDialogParts.error}
        >
          {historyFeedback}
        </p>
      ) : null}

      {historySessionOnly ? (
        <p
          role="status"
          data-testid="code-console-history-session-only"
          className={officeDialogParts.message}
          data-tone="warning"
        >
          {labels.historySessionOnly}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <div
          data-testid="code-console-searchbar"
          className={`${officeDialogParts.row} ${styles.nowrap}`}
        >
          <div
            className={`${officeDialogParts.inputGroup} ${styles.grow}`}
            role="search"
          >
            <Search size={14} aria-hidden />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              maxLength={128}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape" && searchQuery.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setSearchQuery("");
                  return;
                }
                const direction =
                  event.key === "ArrowUp" ||
                  (event.key === "Enter" && event.shiftKey)
                    ? -1
                    : event.key === "ArrowDown" || event.key === "Enter"
                      ? 1
                      : null;
                if (direction !== null && moveSearchResult(direction)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              placeholder={labels.search}
              aria-label={labels.search}
              aria-keyshortcuts="Enter Shift+Enter ArrowDown ArrowUp Escape"
              aria-controls={`${searchRelationshipId}-transcript`}
              aria-activedescendant={
                activeSearchEntryId === null
                  ? undefined
                  : `${searchRelationshipId}-entry-${activeSearchEntryId}`
              }
              data-testid="code-console-search"
            />
          </div>
          {searchActive ? (
            <span
              data-testid="code-console-search-status"
              role="status"
              aria-live="polite"
              title={searchResult.truncated ? labels.searchLimited : undefined}
              className={styles.count}
            >
              {labels.searchStatus(
                displayedEntries.length,
                searchResult.inspectedEntries,
                entries.length,
              )}
              {activeSearchEntryIndex >= 0
                ? ` · ${activeSearchEntryIndex + 1}/${displayedEntries.length}`
                : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={transcriptRef}
        id={`${searchRelationshipId}-transcript`}
        data-testid="code-console-transcript"
        role="log"
        aria-live="polite"
        className={`${officeDialogParts.well} ${officeDialogParts.mono} ${styles.transcript}`}
      >
        {entries.length === 0 ? (
          <p data-testid="code-console-empty" className={styles.muted}>
            {labels.empty}
          </p>
        ) : searchActive && displayedEntries.length === 0 ? (
          <p
            data-testid="code-console-search-empty"
            role="status"
            className={styles.muted}
          >
            {labels.noMatches}
            {searchResult.truncated ? ` · ${labels.searchLimited}` : ""}
          </p>
        ) : (
          displayedEntries.map((entry) => (
            <div
              key={entry.id}
              id={`${searchRelationshipId}-entry-${entry.id}`}
              data-testid="code-console-entry"
              data-console-entry-id={entry.id}
              data-active-search-match={
                searchActive && entry.id === activeSearchEntryId
                  ? "true"
                  : undefined
              }
              aria-current={
                searchActive && entry.id === activeSearchEntryId
                  ? "true"
                  : undefined
              }
              className={styles.consoleEntry}
            >
              <div
                data-testid="code-console-entry-input"
                className={styles.consoleInputLine}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedEntryIds((current) => {
                      const next = new Set(current);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    })
                  }
                  disabled={searchActive}
                  aria-expanded={!entryIsCollapsed(entry.id)}
                  aria-label={entry.input}
                  data-testid="code-console-entry-toggle"
                  data-entry-id={entry.id}
                  className={officeDialogParts.iconButton}
                >
                  {entryIsCollapsed(entry.id) ? (
                    <ChevronRight size={11} aria-hidden />
                  ) : (
                    <ChevronDown size={11} aria-hidden />
                  )}
                </button>
                <span aria-hidden>{"›"}</span>
                <span>{entry.input}</span>
              </div>
              {entry.result?.interrupted ? (
                <div
                  hidden={entryIsCollapsed(entry.id)}
                  data-testid="code-console-entry-interrupted"
                  className={styles.failed}
                >
                  {labels.interrupted}
                </div>
              ) : null}
              {entry.notice ? (
                <div
                  hidden={entryIsCollapsed(entry.id)}
                  data-testid="code-console-entry-notice"
                  className={`${styles.muted} ${styles.italic}`}
                >
                  {entry.notice}
                </div>
              ) : null}
              {(entry.result?.logs.length ?? 0) >
              CODE_CONSOLE_MAX_LINES_PER_ENTRY ? (
                <div
                  hidden={entryIsCollapsed(entry.id)}
                  data-testid="code-console-output-truncated"
                  className={`${styles.muted} ${styles.italic}`}
                >
                  {labels.truncated(
                    entry.result!.logs.length -
                      CODE_CONSOLE_MAX_LINES_PER_ENTRY,
                  )}
                </div>
              ) : null}
              {entryLines(entry.result).map((line, index) => (
                <pre
                  key={index}
                  hidden={entryIsCollapsed(entry.id)}
                  data-testid={
                    line.stream === "stderr"
                      ? "code-console-stderr"
                      : "code-console-stdout"
                  }
                  data-stream={line.stream}
                  className={
                    line.stream === "stderr"
                      ? `${styles.outputLine} ${styles.failed}`
                      : styles.outputLine
                  }
                >
                  <AnsiText text={line.text} />
                </pre>
              ))}
            </div>
          ))
        )}
      </div>

      <div className={`${officeDialogParts.well} ${styles.prompt}`}>
        <span aria-hidden className={styles.muted}>
          {"›"}
        </span>
        <textarea
          ref={inputRef}
          data-testid="code-console-input"
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.slice(0, CODE_CONSOLE_INPUT_LIMIT))
          }
          onKeyDown={onKeyDown}
          disabled={blocked}
          rows={Math.min(6, Math.max(1, draft.split("\n").length))}
          maxLength={CODE_CONSOLE_INPUT_LIMIT}
          placeholder={blocked ? labels.blocked : labels.placeholder}
          aria-label={labels.title}
          aria-describedby="code-console-hint"
          spellCheck={false}
          className={`${officeDialogParts.mono} ${styles.promptInput}`}
        />
      </div>
      <p
        id="code-console-hint"
        data-testid="code-console-hint"
        className={officeDialogParts.hint}
      >
        {labels.hint}
      </p>
    </section>
  );
}
