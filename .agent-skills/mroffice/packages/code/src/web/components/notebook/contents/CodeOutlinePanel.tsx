"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { EditorLoadingState } from "@mrnote/core/web/components/ui/editor-loading-state.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { OfficeTaskPane } from "@mrnote/core/web/components/office-ribbon/OfficeTaskPane.tsx";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import type { DocumentSymbol } from "../../../lib/code-runner/code-intelligence";

import styles from "./CodeSidePanels.module.css";

interface CodeOutlinePanelProps {
  /** The live document symbol outline (flat, ascending, with a nesting `depth`). */
  symbols: DocumentSymbol[];
  /** True while the current source identity has no completed symbol snapshot. */
  loading?: boolean;
  /** Index of the innermost symbol containing the live editor caret. */
  activeIndex?: number;
  /** Jump the editor selection to a symbol's span (reuses selectSymbolSpan). */
  onJump: (symbol: DocumentSymbol) => void;
  onClose: () => void;
}

interface FilteredCodeOutlineSymbol {
  readonly symbol: DocumentSymbol;
  readonly sourceIndex: number;
}

function codeOutlineSymbolKey(
  symbol: DocumentSymbol,
  sourceIndex: number,
): string {
  return `${symbol.from}:${symbol.to}:${symbol.depth}:${symbol.kind}:${symbol.name}:${sourceIndex}`;
}

function codeOutlineSymbolHasChildren(
  symbols: readonly DocumentSymbol[],
  sourceIndex: number,
): boolean {
  const symbol = symbols[sourceIndex];
  const next = symbols[sourceIndex + 1];
  return Boolean(symbol && next && next.depth > symbol.depth);
}

function collapseCodeOutlineSymbols(
  symbols: readonly DocumentSymbol[],
  filtered: readonly FilteredCodeOutlineSymbol[],
  collapsedKeys: ReadonlySet<string>,
  filterActive: boolean,
): FilteredCodeOutlineSymbol[] {
  if (filterActive || collapsedKeys.size === 0) return [...filtered];
  const visible: FilteredCodeOutlineSymbol[] = [];
  let hiddenBelowDepth: number | null = null;
  for (const entry of filtered) {
    if (hiddenBelowDepth !== null) {
      if (entry.symbol.depth > hiddenBelowDepth) continue;
      hiddenBelowDepth = null;
    }
    visible.push(entry);
    if (
      codeOutlineSymbolHasChildren(symbols, entry.sourceIndex) &&
      collapsedKeys.has(codeOutlineSymbolKey(entry.symbol, entry.sourceIndex))
    ) {
      hiddenBelowDepth = entry.symbol.depth;
    }
  }
  return visible;
}

/**
 * Case-insensitive symbol filtering that retains every matched symbol's parent
 * chain. A nested method therefore never appears as an unexplained indented row
 * when its class name does not itself match the query.
 */
export function filterCodeOutlineSymbols(
  symbols: readonly DocumentSymbol[],
  rawQuery: string,
): FilteredCodeOutlineSymbol[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) {
    return symbols.map((symbol, sourceIndex) => ({ symbol, sourceIndex }));
  }
  const included = new Set<number>();
  const ancestors: number[] = [];
  symbols.forEach((symbol, sourceIndex) => {
    ancestors.length = Math.max(0, symbol.depth);
    const matches = `${symbol.name}\n${symbol.kind}`
      .toLocaleLowerCase()
      .includes(query);
    if (matches) {
      for (const ancestorIndex of ancestors) {
        if (typeof ancestorIndex === "number") included.add(ancestorIndex);
      }
      included.add(sourceIndex);
    }
    ancestors[symbol.depth] = sourceIndex;
  });
  return symbols.flatMap((symbol, sourceIndex) =>
    included.has(sourceIndex) ? [{ symbol, sourceIndex }] : [],
  );
}

/**
 * Persistent code OUTLINE / symbol-tree panel (VSCode "Outline" view parity). The
 * code editor already extracts the document symbols (TypeScript navigation tree)
 * for the Go-to-Symbol picker and the breadcrumb strip; this surfaces that SAME
 * live list as a click-to-jump sidebar tree, so the structure is always visible
 * (not just behind the Ctrl+Shift+P / Ctrl+Shift+O modal), mirroring the document
 * editor's DocumentOutlinePanel.
 *
 * Source of truth: the caller passes the LIVE `breadcrumbSymbols` (re-derived on
 * every buffer change), so the tree updates as the user types with no copy to
 * keep in sync. Click re-uses `selectSymbolSpan`, which clamps the span into the
 * current document, so a momentarily-stale offset can never throw.
 *
 * SECURITY: symbol names render as React children (TEXT), never via
 * dangerouslySetInnerHTML.
 */
export default function CodeOutlinePanel({
  symbols,
  loading = false,
  activeIndex = -1,
  onJump,
  onClose,
}: CodeOutlinePanelProps) {
  const t = useTranslations("console-notebooks");
  const [query, setQuery] = useState("");
  const [collapsedSymbolKeys, setCollapsedSymbolKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [keyboardFocusSourceIndex, setKeyboardFocusSourceIndex] = useState<
    number | null
  >(null);
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);
  const filteredSymbols = useMemo(
    () => filterCodeOutlineSymbols(symbols, query),
    [query, symbols],
  );
  const filterActive = query.trim().length > 0;
  const effectiveCollapsedSymbolKeys = useMemo(() => {
    const activeAncestorKeys = new Set<string>();
    let nextDepth = symbols[activeIndex]?.depth ?? 0;
    for (
      let sourceIndex = Math.min(activeIndex - 1, symbols.length - 1);
      sourceIndex >= 0 && nextDepth > 0;
      sourceIndex -= 1
    ) {
      const symbol = symbols[sourceIndex]!;
      if (symbol.depth >= nextDepth) continue;
      activeAncestorKeys.add(codeOutlineSymbolKey(symbol, sourceIndex));
      nextDepth = symbol.depth;
    }
    return new Set(
      [...collapsedSymbolKeys].filter((key) => !activeAncestorKeys.has(key)),
    );
  }, [activeIndex, collapsedSymbolKeys, symbols]);
  const visibleSymbols = useMemo(
    () =>
      collapseCodeOutlineSymbols(
        symbols,
        filteredSymbols,
        effectiveCollapsedSymbolKeys,
        filterActive,
      ),
    [effectiveCollapsedSymbolKeys, filterActive, filteredSymbols, symbols],
  );
  const rovingSourceIndex = visibleSymbols.some(
    (entry) => entry.sourceIndex === keyboardFocusSourceIndex,
  )
    ? keyboardFocusSourceIndex
    : visibleSymbols.some((entry) => entry.sourceIndex === activeIndex)
      ? activeIndex
      : (visibleSymbols[0]?.sourceIndex ?? -1);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, visibleSymbols]);

  // The Docs Navigation pane's frame (DocumentOutlinePanel): the shared Office
  // task pane, docked at the code window's right edge by its host.
  return (
    <OfficeTaskPane
      title={t("code.outline.title")}
      closeLabel={t("code.outline.close")}
      onClose={onClose}
      testIdPrefix="code-outline"
      testId="code-outline-panel"
      closeTestId="code-outline-close"
      dockRight={false}
      className="ai-panel document-outline-panel"
      // Escape closes the pane (Office); inside a non-empty filter it clears
      // the filter first (the filter prevents the default there).
      headerActions={
        <span className="document-outline-panel-count">{symbols.length}</span>
      }
    >

      {/* The panes' shared search box (the Navigation pane's): one field
          holding its icon and a bare input, in the dialog chrome. */}
      <div className={officeDialogParts.inputGroup} role="search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          maxLength={128}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || query.length === 0) return;
            event.preventDefault();
            setQuery("");
          }}
          placeholder={t("code.find.findPlaceholder")}
          aria-label={t("code.find.findPlaceholder")}
          data-testid="code-outline-filter"
        />
      </div>

      <div
        className={`document-outline-panel-body ${officeDialogParts.paneBody}`}
        data-testid="code-outline-body"
      >
        {loading ? (
          <EditorLoadingState
            kind="list"
            minimal
            label={t("code.loading")}
            testId="code-outline-loading"
          />
        ) : symbols.length === 0 ? (
          <div
            className="document-outline-panel-empty office-rise-in"
            data-testid="code-outline-empty"
          >
            {t("code.outline.empty")}
          </div>
        ) : visibleSymbols.length === 0 ? (
          <div
            className="document-outline-panel-empty"
            data-testid="code-outline-filter-empty"
          >
            {t("code.findInFiles.empty")}
          </div>
        ) : (
          <ul
            role="tree"
            className="document-outline-panel-list"
            data-testid="code-outline-list"
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const target = event.target;
              if (!(target instanceof HTMLButtonElement)) return;
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button[data-testid="code-outline-link"]',
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
              const next = controls[nextIndex];
              const sourceIndex = Number(next?.dataset.outlineSourceIndex);
              if (
                !next ||
                !Number.isInteger(sourceIndex) ||
                !visibleSymbols.some(
                  (entry) => entry.sourceIndex === sourceIndex,
                )
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              setKeyboardFocusSourceIndex(sourceIndex);
              next.focus();
            }}
          >
            {visibleSymbols.map(({ symbol, sourceIndex }) => {
              const active = sourceIndex === activeIndex;
              const hasChildren = codeOutlineSymbolHasChildren(
                symbols,
                sourceIndex,
              );
              const symbolKey = codeOutlineSymbolKey(symbol, sourceIndex);
              const collapsed =
                !filterActive && effectiveCollapsedSymbolKeys.has(symbolKey);
              return (
                <li
                  role="none"
                  key={`${symbol.from}:${symbol.name}:${sourceIndex}`}
                  className="document-outline-panel-item"
                  data-kind={symbol.kind}
                  data-depth={symbol.depth}
                >
                  <div
                    className="document-outline-panel-row"
                    style={{
                      paddingInlineStart: `${symbol.depth * 14 + 2}px`,
                    }}
                  >
                    {hasChildren && !filterActive ? (
                      <button
                        type="button"
                        className="document-outline-panel-action"
                        data-testid="code-outline-toggle"
                        tabIndex={-1}
                        aria-label={symbol.name || t("code.outline.unnamed")}
                        aria-expanded={!collapsed}
                        onClick={() =>
                          setCollapsedSymbolKeys((current) => {
                            const next = new Set(current);
                            if (next.has(symbolKey)) next.delete(symbolKey);
                            else next.add(symbolKey);
                            return next;
                          })
                        }
                        title={symbol.name}
                      >
                        {collapsed ? (
                          <ChevronRight size={13} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={13} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      <span aria-hidden="true" className={styles.outlineSpacer} />
                    )}
                    <button
                      type="button"
                      role="treeitem"
                      aria-level={symbol.depth + 1}
                      aria-selected={active}
                      aria-expanded={
                        hasChildren && !filterActive ? !collapsed : undefined
                      }
                      ref={active ? activeButtonRef : undefined}
                      className={`document-outline-panel-link ${styles.outlineLink}`}
                      data-testid="code-outline-link"
                      data-outline-source-index={sourceIndex}
                      data-symbol-name={symbol.name}
                      data-active={active ? "true" : "false"}
                      aria-current={active ? "location" : undefined}
                      tabIndex={sourceIndex === rovingSourceIndex ? 0 : -1}
                      onFocus={() => setKeyboardFocusSourceIndex(sourceIndex)}
                      onKeyDown={(event) => {
                        if (!hasChildren || filterActive) return;
                        if (event.key === "ArrowLeft" && !collapsed) {
                          event.preventDefault();
                          setCollapsedSymbolKeys((current) =>
                            new Set(current).add(symbolKey),
                          );
                        } else if (event.key === "ArrowRight" && collapsed) {
                          event.preventDefault();
                          setCollapsedSymbolKeys((current) => {
                            const next = new Set(current);
                            next.delete(symbolKey);
                            return next;
                          });
                        }
                      }}
                      onClick={() => onJump(symbol)}
                      title={symbol.kind}
                    >
                      <span className="document-outline-panel-kind" aria-hidden>
                        {symbol.kind}
                      </span>{" "}
                      {symbol.name || t("code.outline.unnamed")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </OfficeTaskPane>
  );
}
