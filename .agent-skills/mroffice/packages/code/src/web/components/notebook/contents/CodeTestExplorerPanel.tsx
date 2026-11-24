"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  Check,
  Bug,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Download,
  FileCode2,
  Play,
  RotateCcw,
  Search,
  Square,
  WandSparkles,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { CodeTestRunTimelinePanel } from "./CodeRunTimelinePanel";
import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import CellOutput from "./code-output/CellOutput";
import type {
  CodeTestDiscovery,
  CodeTestResult,
  CodeTestSource,
  PersistedCodeTestRunReceipt,
  PersistedCodeTestRunTimelineEntry,
} from "../../../lib/code-runner/code-test-explorer";

import styles from "./CodeSidePanels.module.css";

export type CodeTestReceiptFreshness =
  | "none"
  | "checking"
  | "current"
  | "stale";

type CodeTestResultFilter = "all" | "failed" | "passed" | "not-run";

export default function CodeTestExplorerPanel({
  panelRef,
  discovery,
  selectedTestIds,
  receipt,
  receiptFreshness,
  historyEntries,
  historySources,
  selectedHistoryIndex,
  historyActionsAvailable,
  latestHistoryCurrent,
  reportAvailable,
  aiAvailable,
  debugReceiptAvailable,
  debuggableTestIds,
  available,
  busy,
  loading,
  incomplete,
  loadError,
  runError,
  currentPageId,
  onToggleTest,
  onRunSelected,
  onRunFile,
  onRunAll,
  onStop,
  onRefresh,
  onNavigateResult,
  onDebugTest,
  onSelectHistory,
  onRerunHistory,
  onRerunLast,
  onRerunFailed,
  onClearHistory,
  onExportReport,
  onAskAi,
  onClose,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  discovery: CodeTestDiscovery;
  selectedTestIds: ReadonlySet<string>;
  receipt: PersistedCodeTestRunReceipt | null;
  receiptFreshness: CodeTestReceiptFreshness;
  historyEntries: readonly PersistedCodeTestRunTimelineEntry[];
  historySources: readonly CodeTestSource[];
  selectedHistoryIndex: number | null;
  historyActionsAvailable: boolean;
  latestHistoryCurrent: boolean;
  reportAvailable: boolean;
  aiAvailable: boolean;
  debugReceiptAvailable: boolean;
  debuggableTestIds: ReadonlySet<string>;
  available: boolean;
  busy: boolean;
  loading: boolean;
  incomplete: boolean;
  loadError: boolean;
  runError: string | null;
  currentPageId: string;
  onToggleTest: (testId: string) => void;
  onRunSelected: () => void;
  onRunFile: (pageId: string) => void;
  onRunAll: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onNavigateResult: (result: CodeTestResult) => void;
  onDebugTest?: (result: CodeTestResult) => void;
  onSelectHistory: (index: number) => void;
  onRerunHistory: (index: number) => void;
  onRerunLast: () => void;
  onRerunFailed: () => void;
  onClearHistory: () => void;
  onExportReport: () => void;
  onAskAi: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("console-notebooks");
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedTestId, setFocusedTestId] = useState<string | null>(null);
  const [collapsedPageIds, setCollapsedPageIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const currentReceiptOwner =
    receiptFreshness === "current" ? (receipt?.runId ?? null) : null;
  const [resultFilterState, setResultFilterState] = useState<{
    owner: string | null;
    value: CodeTestResultFilter;
  }>({ owner: null, value: "all" });
  const resultFilter =
    resultFilterState.owner === currentReceiptOwner
      ? resultFilterState.value
      : "all";
  const resultByTestId = useMemo(
    () =>
      new Map(
        receipt?.results.map((result) => [result.testId, result] as const) ??
          [],
      ),
    [receipt?.results],
  );
  const passed =
    receipt?.results.filter((result) => result.status === "passed").length ?? 0;
  const failed =
    receipt?.results.filter((result) => result.status === "failed").length ?? 0;
  const selectedCount = selectedTestIds.size;
  const latestHistory = historyEntries[0] ?? null;
  const selectedHistory =
    selectedHistoryIndex === null
      ? null
      : (historyEntries[selectedHistoryIndex] ?? null);
  const selectedHistoryOutputs = selectedHistory?.fileOutputs ?? [];
  const latestHasFailures = Boolean(
    latestHistory?.receipt.results.some((result) => result.status === "failed"),
  );
  const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase();
  const filteredFiles = useMemo(() => {
    return discovery.files.flatMap((file) => {
      const resultFilteredTests = file.tests.filter((test) => {
        if (resultFilter === "all") return true;
        const result = resultByTestId.get(test.id);
        if (resultFilter === "not-run") return result === undefined;
        return result?.status === resultFilter;
      });
      if (!normalizedSearchQuery) {
        return resultFilteredTests.length > 0
          ? [{ ...file, tests: resultFilteredTests }]
          : [];
      }
      const fileMatches = file.source.path
        .toLocaleLowerCase()
        .includes(normalizedSearchQuery);
      const tests = fileMatches
        ? resultFilteredTests
        : resultFilteredTests.filter((test) => {
            const result =
              receiptFreshness === "current"
                ? resultByTestId.get(test.id)
                : undefined;
            return `${test.name}\n${result?.message ?? ""}`
              .toLocaleLowerCase()
              .includes(normalizedSearchQuery);
          });
      return tests.length > 0 ? [{ ...file, tests }] : [];
    });
  }, [
    discovery.files,
    normalizedSearchQuery,
    receiptFreshness,
    resultFilter,
    resultByTestId,
  ]);
  const visibleTestCount = filteredFiles.reduce(
    (count, file) => count + file.tests.length,
    0,
  );
  const filteringActive =
    normalizedSearchQuery.length > 0 || resultFilter !== "all";
  const visibleTestIds = useMemo(
    () =>
      filteredFiles.flatMap((file) =>
        filteringActive || !collapsedPageIds.has(file.source.pageId)
          ? file.tests.map((test) => test.id)
          : [],
      ),
    [collapsedPageIds, filteredFiles, filteringActive],
  );
  const resolvedFocusedTestId =
    focusedTestId && visibleTestIds.includes(focusedTestId)
      ? focusedTestId
      : (visibleTestIds[0] ?? null);
  const selectedVisibleCount = visibleTestIds.filter((testId) =>
    selectedTestIds.has(testId),
  ).length;
  const allVisibleSelected =
    visibleTestIds.length > 0 &&
    selectedVisibleCount === visibleTestIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;
  const fileIsCollapsed = (pageId: string) =>
    !filteringActive && collapsedPageIds.has(pageId);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => firstControlRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    if (selectVisibleRef.current) {
      selectVisibleRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);
  const setPaneElement = useCallback(
    (node: HTMLElement | null) => {
      // The pane keeps its own id (the run ribbon's target) on the shared
      // pane's element.
      if (node) node.id = "code-test-explorer";
      panelRef.current = node as HTMLDivElement | null;
    },
    [panelRef],
  );

  // The shared Office task pane (OfficeTaskPane, code tone): its title row,
  // close button and dock tab, and inside it the dialog chrome's parts — the
  // panes' search field, a segmented result filter, chrome buttons and
  // messages — around the Code-owned test tree.
  return (
    <OfficeTaskPane
      title={t("code.testExplorer.title")}
      closeLabel={t("common.close")}
      onClose={onClose}
      testIdPrefix="code-test-explorer"
      testId="code-test-explorer"
      closeTestId="code-test-close"
      dockRight={false}
      paneRef={setPaneElement}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLocaleLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          searchInputRef.current?.focus();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      headerActions={
        <>
          <span data-testid="code-test-count" className={styles.count}>
            {filteringActive
              ? `${visibleTestCount}/${discovery.totalTests}`
              : discovery.totalTests}
          </span>
          <button
            ref={firstControlRef}
            type="button"
            onClick={onRefresh}
            disabled={busy || loading}
            data-testid="code-test-refresh"
            title={t("code.testExplorer.refresh")}
            aria-label={t("code.testExplorer.refresh")}
            className={officeDialogParts.iconButton}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        </>
      }
    >
      <div className={officeDialogParts.inputGroup} role="search">
        <Search size={14} aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          maxLength={128}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || searchQuery.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            setSearchQuery("");
          }}
          placeholder={t("code.testExplorer.search")}
          aria-label={t("code.testExplorer.search")}
          data-testid="code-test-search"
        />
      </div>

      <div
        role="group"
        aria-label={t("code.testExplorer.resultFilter")}
        data-testid="code-test-result-filters"
        className={officeDialogParts.row}
      >
        <label
          title={t("code.testExplorer.selectVisible")}
          className={officeDialogParts.check}
        >
          <input
            ref={selectVisibleRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={!available || busy || visibleTestIds.length === 0}
            onChange={() => {
              const shouldSelect = !allVisibleSelected;
              for (const testId of visibleTestIds) {
                if (selectedTestIds.has(testId) !== shouldSelect) {
                  onToggleTest(testId);
                }
              }
            }}
            aria-label={t("code.testExplorer.selectVisible")}
            data-testid="code-test-select-visible"
          />
          {t("code.testExplorer.selectVisible")}
        </label>
        <span className={officeDialogParts.tabs}>
          {(
            [
              ["all", "code.testExplorer.filterAll"],
              ["failed", "code.testExplorer.filterFailed"],
              ["passed", "code.testExplorer.filterPassed"],
              ["not-run", "code.testExplorer.filterNotRun"],
            ] as const
          ).map(([filter, label]) => {
            const disabled = filter !== "all" && currentReceiptOwner === null;
            const active = resultFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  setResultFilterState({
                    owner: currentReceiptOwner,
                    value: filter,
                  });
                }}
                disabled={disabled}
                aria-pressed={active}
                data-testid={`code-test-filter-${filter}`}
                title={
                  disabled
                    ? t("code.testExplorer.historyUnavailable")
                    : t(label)
                }
                className={officeDialogParts.tab}
              >
                {t(label)}
              </button>
            );
          })}
        </span>
      </div>

      <div className={officeDialogParts.row}>
        <button
          type="button"
          onClick={onRunSelected}
          disabled={!available || busy || selectedCount === 0}
          data-testid="code-test-run-selected"
          className={`${officeDialogParts.primaryButton} ${officeDialogParts.compactButton}`}
        >
          <Play size={11} fill="currentColor" aria-hidden="true" />
          {t("code.testExplorer.runSelected", { count: selectedCount })}
        </button>
        <button
          type="button"
          onClick={onRunAll}
          disabled={
            !available ||
            busy ||
            loading ||
            incomplete ||
            loadError ||
            discovery.truncated ||
            discovery.totalTests === 0
          }
          data-testid="code-test-run-all"
          className={officeDialogParts.compactButton}
        >
          <Play size={11} aria-hidden="true" />
          {t("code.testExplorer.runAll")}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            data-testid="code-test-stop"
            className={`${officeDialogParts.compactButton} ${styles.end}`}
          >
            <Square size={10} fill="currentColor" aria-hidden="true" />
            {t("code.debugStop")}
          </button>
        ) : null}
      </div>

      {loadError || runError ? (
        <p
          role="alert"
          data-testid="code-test-error"
          className={`${officeDialogParts.message} ${styles.notice}`}
          data-tone="error"
        >
          <CircleAlert size={13} aria-hidden="true" />
          <span>{runError ?? t("pages.loadFailed")}</span>
        </p>
      ) : receiptFreshness === "stale" ? (
        <p
          role="status"
          data-testid="code-test-stale"
          className={`${officeDialogParts.message} ${styles.notice}`}
          data-tone="warning"
        >
          <CircleAlert size={13} aria-hidden="true" />
          <span>{t("code.testExplorer.stale")}</span>
        </p>
      ) : receiptFreshness === "checking" ? (
        <p
          role="status"
          data-testid="code-test-checking"
          className={`${officeDialogParts.message} ${styles.notice}`}
        >
          <CircleDashed size={13} aria-hidden="true" />
          <span>{t("code.testExplorer.checking")}</span>
        </p>
      ) : receiptFreshness === "current" && receipt ? (
        <p
          role="status"
          data-testid="code-test-summary"
          className={`${officeDialogParts.message} ${styles.notice}`}
        >
          <Check size={13} aria-hidden="true" className={styles.passed} />
          <span>{t("code.testExplorer.summary", { passed, failed })}</span>
        </p>
      ) : null}

      {historyEntries.length > 0 ? (
        <>
          <CodeTestRunTimelinePanel
            entries={historyEntries}
            currentSources={historySources}
            selectedIndex={selectedHistoryIndex}
            timelineLabel={t("code.testExplorer.history")}
            unavailableLabel={t("code.testExplorer.staleShort")}
            clearLabel={t("code.testExplorer.clearHistory")}
            confirmClearLabel={t("code.confirmClearExecutionHistory")}
            cancelLabel={t("common.cancel")}
            entryLabel={(entry) =>
              t("code.testExplorer.historyEntry", {
                passed: entry.receipt.results.filter(
                  (result) => result.status === "passed",
                ).length,
                failed: entry.receipt.results.filter(
                  (result) => result.status === "failed",
                ).length,
              })
            }
            onSelect={onSelectHistory}
            onRerun={onRerunHistory}
            onClear={onClearHistory}
            actionsBlocked={!historyActionsAvailable}
          />
          <div
            data-testid="code-test-history-actions"
            className={officeDialogParts.row}
          >
            <button
              type="button"
              onClick={onRerunLast}
              disabled={!historyActionsAvailable || !latestHistoryCurrent}
              data-testid="code-test-rerun-last"
              title={
                historyActionsAvailable && latestHistoryCurrent
                  ? t("code.testExplorer.rerunLast")
                  : t("code.testExplorer.historyUnavailable")
              }
              className={officeDialogParts.compactButton}
            >
              <RotateCcw size={11} aria-hidden="true" />
              {t("code.testExplorer.rerunLast")}
            </button>
            <button
              type="button"
              onClick={onRerunFailed}
              disabled={
                !historyActionsAvailable ||
                !latestHistoryCurrent ||
                !latestHasFailures
              }
              data-testid="code-test-rerun-failed"
              title={
                historyActionsAvailable &&
                latestHistoryCurrent &&
                latestHasFailures
                  ? t("code.testExplorer.rerunFailed")
                  : t("code.testExplorer.historyUnavailable")
              }
              className={officeDialogParts.compactButton}
            >
              <CircleAlert size={11} aria-hidden="true" />
              {t("code.testExplorer.rerunFailed")}
            </button>
            <button
              type="button"
              onClick={onExportReport}
              disabled={!reportAvailable}
              data-testid="code-test-history-export-junit"
              title={
                reportAvailable
                  ? `${t("code.download")} · JUnit XML`
                  : t("code.testExplorer.historyUnavailable")
              }
              className={officeDialogParts.compactButton}
            >
              <Download size={11} aria-hidden="true" />
              JUnit XML
            </button>
            {null}
          </div>
          {selectedHistoryOutputs.length > 0 ? (
            <section
              data-testid="code-test-history-output"
              aria-label={t("codeOutput.output")}
              className={`${officeDialogParts.well} ${styles.historyOutput}`}
            >
              {selectedHistoryOutputs.map((fileOutput, index) => (
                <div
                  key={fileOutput.pageId}
                  data-testid="code-test-history-output-file"
                  data-page-id={fileOutput.pageId}
                >
                  <div title={fileOutput.path} className={styles.treeFile}>
                    <FileCode2 size={11} aria-hidden="true" />
                    <span className={styles.ellipsis}>{fileOutput.path}</span>
                  </div>
                  <CellOutput
                    output={{
                      logs: [...fileOutput.logs],
                      logStreams: [...fileOutput.logStreams],
                    }}
                    containerTestId={`code-test-history-output-${index}`}
                    showExportControl={false}
                  />
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      <div
        role="tree"
        aria-label={t("code.testExplorer.title")}
        aria-busy={busy || loading}
        data-testid="code-test-tree"
        className={`${officeDialogParts.paneBody} ${styles.tree}`}
      >
        {discovery.files.length === 0 && !loading ? (
          <div
            role="status"
            data-testid="code-test-empty"
            className="document-outline-panel-empty office-rise-in"
          >
            {t("code.testExplorer.empty")}
          </div>
        ) : filteringActive && filteredFiles.length === 0 ? (
          <div
            role="status"
            data-testid="code-test-search-empty"
            className="document-outline-panel-empty"
          >
            {t("code.testExplorer.searchNone")}
          </div>
        ) : (
          filteredFiles.map((file) => (
            <div
              key={file.source.pageId}
              role="group"
              aria-label={file.source.path}
            >
              <div className={styles.treeFile}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedPageIds((current) => {
                      const next = new Set(current);
                      if (next.has(file.source.pageId)) {
                        next.delete(file.source.pageId);
                      } else {
                        next.add(file.source.pageId);
                      }
                      return next;
                    })
                  }
                  disabled={filteringActive}
                  aria-expanded={!fileIsCollapsed(file.source.pageId)}
                  aria-label={file.source.path}
                  data-testid="code-test-file-toggle"
                  data-page-id={file.source.pageId}
                  className={officeDialogParts.iconButton}
                >
                  {fileIsCollapsed(file.source.pageId) ? (
                    <ChevronRight size={11} aria-hidden="true" />
                  ) : (
                    <ChevronDown size={11} aria-hidden="true" />
                  )}
                </button>
                <FileCode2 size={12} aria-hidden="true" />
                <span title={file.source.path} className={styles.ellipsis}>
                  {file.source.path}
                </span>
                {file.source.pageId === currentPageId ? (
                  <span className={styles.current}>
                    {t("code.testExplorer.currentFile")}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRunFile(file.source.pageId)}
                  disabled={!available || busy || file.truncated}
                  data-testid="code-test-run-file"
                  data-page-id={file.source.pageId}
                  title={
                    file.truncated
                      ? t("code.testExplorer.incomplete")
                      : t("code.testExplorer.runFile")
                  }
                  aria-label={`${t("code.testExplorer.runFile")}: ${file.source.path}`}
                  className={`${officeDialogParts.iconButton} ${styles.end}`}
                >
                  <Play size={11} aria-hidden="true" />
                </button>
              </div>
              {file.tests.map((test) => {
                const result = resultByTestId.get(test.id);
                const currentResult =
                  receiptFreshness === "current" ? result : undefined;
                return (
                  <div
                    key={test.id}
                    role="treeitem"
                    hidden={fileIsCollapsed(file.source.pageId)}
                    aria-selected={selectedTestIds.has(test.id)}
                    aria-label={test.name}
                    tabIndex={test.id === resolvedFocusedTestId ? 0 : -1}
                    data-test-id={test.id}
                    className={styles.treeTest}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget) {
                        setFocusedTestId(test.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      const tree = event.currentTarget.closest('[role="tree"]');
                      const items = tree
                        ? Array.from(
                            tree.querySelectorAll<HTMLElement>(
                              '[role="treeitem"]:not([hidden])',
                            ),
                          )
                        : [];
                      const currentIndex = items.indexOf(event.currentTarget);
                      let nextIndex: number | null = null;
                      if (event.key === "ArrowDown") {
                        nextIndex = Math.min(
                          currentIndex + 1,
                          items.length - 1,
                        );
                      } else if (event.key === "ArrowUp") {
                        nextIndex = Math.max(currentIndex - 1, 0);
                      } else if (event.key === "Home") {
                        nextIndex = 0;
                      } else if (event.key === "End") {
                        nextIndex = items.length - 1;
                      } else if (event.key === " ") {
                        event.preventDefault();
                        onToggleTest(test.id);
                        return;
                      } else if (
                        event.key === "Enter" &&
                        currentResult?.status === "failed"
                      ) {
                        event.preventDefault();
                        onNavigateResult(currentResult);
                        return;
                      } else {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      const next = items[nextIndex];
                      if (!next) return;
                      setFocusedTestId(next.dataset.testId ?? null);
                      next.focus();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTestIds.has(test.id)}
                      onChange={() => onToggleTest(test.id)}
                      disabled={!available || busy}
                      data-testid="code-test-select"
                      aria-label={`${t("code.testExplorer.select")}: ${test.name}`}
                    />
                    {currentResult?.status === "passed" ? (
                      <Check
                        size={12}
                        aria-hidden="true"
                        className={styles.passed}
                      />
                    ) : currentResult?.status === "failed" ? (
                      <CircleAlert
                        size={12}
                        aria-hidden="true"
                        className={styles.failed}
                      />
                    ) : (
                      <CircleDashed size={11} aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        currentResult && onNavigateResult(currentResult)
                      }
                      disabled={
                        !currentResult || currentResult.status !== "failed"
                      }
                      data-testid="code-test-result"
                      data-status={currentResult?.status}
                      title={currentResult?.message ?? test.name}
                      className={styles.testName}
                    >
                      <span className={officeDialogParts.mono}>
                        {test.name}
                      </span>
                      {currentResult?.message ? (
                        <span className={officeDialogParts.error}>
                          {currentResult.message}
                        </span>
                      ) : null}
                    </button>
                    {currentResult?.status === "failed" && onDebugTest ? (
                      <button
                        type="button"
                        onClick={() => onDebugTest(currentResult)}
                        disabled={
                          !available ||
                          busy ||
                          receiptFreshness !== "current" ||
                          !debugReceiptAvailable ||
                          !debuggableTestIds.has(test.id)
                        }
                        data-testid="code-test-debug"
                        data-test-id={test.id}
                        title={t(
                          receiptFreshness === "current" &&
                            debugReceiptAvailable &&
                            debuggableTestIds.has(test.id)
                            ? "code.testExplorer.debugTest"
                            : "code.testExplorer.debugUnavailable",
                        )}
                        aria-label={`${t("code.testExplorer.debugTest")}: ${test.name}`}
                        className={officeDialogParts.iconButton}
                      >
                        <Bug size={11} aria-hidden="true" />
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <span className={styles.count}>
                      {currentResult
                        ? `${currentResult.durationMs} ms`
                        : `L${test.line}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {loading || busy || discovery.truncated || incomplete ? (
        <p
          role="status"
          data-testid="code-test-status"
          className={officeDialogParts.message}
        >
          {busy
            ? t("code.testExplorer.running")
            : loading
              ? t("common.loading")
              : t("code.testExplorer.incomplete")}
        </p>
      ) : null}
    </OfficeTaskPane>
  );
}
