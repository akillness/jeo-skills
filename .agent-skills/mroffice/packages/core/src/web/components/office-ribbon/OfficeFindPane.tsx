"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { OfficeSemanticIcon } from "./icons/OfficeSemanticIcon";
import type { OfficeSemanticIconId } from "./icons/officeIconRegistry";

import styles from "./OfficeFindPane.module.css";

/**
 * The Find pane every editor shares: Word's Navigation pane search (a query
 * field, the match count, Previous / Next, the search options, a list of every
 * result with its text around the hit, and a collapsible Replace section),
 * the look the document editor's Find wears. What is searched, and what
 * Previous / Next / a result / Replace do, stays with each editor:
 * Docs' ProseMirror search is components/console/editor/DocumentFindReplace,
 * the deck's cross-slide search lib/presentation-find-replace.
 *
 * The parts keep the `note-editor-find-replace__*` class names their rules
 * have always had in styles/note-editor.css (Docs' Go To and outline search
 * wear some of them too, and every editor window loads that sheet), so Docs
 * renders exactly as before. OfficeFindPane.module.css adds only the docked
 * variant: the pane body inside a shared OfficeTaskPane, which supplies the
 * title row and the close button.
 */

/** A result preview's three parts, the hit between its context. */
export type OfficeFindSnippet = Readonly<{
  before: string;
  match: string;
  after: string;
}>;

/**
 * A result preview's three parts, whitespace collapsed ONCE over the whole
 * line so the words around the hit keep their spaces: trimming each part on
 * its own glued "A second paragraph" into "Asecondparagraph". Only the
 * preview's own outer edges are trimmed; the parts rendered side by side
 * read exactly as the line does.
 */
export function findSnippetParts(
  before: string,
  match: string,
  after: string,
): { before: string; match: string; after: string } {
  const collapse = (value: string) => value.replace(/\s+/g, " ");
  let head = collapse(before).replace(/^ /, "");
  let hit = collapse(match);
  let tail = collapse(after).replace(/ $/, "");
  // One space where two parts meet, never two.
  if (head.endsWith(" ") && hit.startsWith(" ")) hit = hit.slice(1);
  if (!hit && head.endsWith(" ") && tail.startsWith(" ")) tail = tail.slice(1);
  if (hit.endsWith(" ") && tail.startsWith(" ")) tail = tail.slice(1);
  if (!head.trim()) head = "";
  if (!tail.trim()) tail = "";
  return { before: head, match: hit, after: tail };
}

/**
 * The preview of the hit `[start, end)` inside one flat line of text: up to
 * `radius` characters each side, an ellipsis where the line goes on.
 */
export function buildFindSnippet(
  line: string,
  start: number,
  end: number,
  radius = 34,
): OfficeFindSnippet {
  const from = Math.max(0, start - radius);
  const to = Math.min(line.length, end + radius);
  const parts = findSnippetParts(
    line.slice(from, start),
    line.slice(start, end),
    line.slice(end, to),
  );
  return {
    before: `${from > 0 ? "…" : ""}${parts.before}`,
    match: parts.match,
    after: `${parts.after}${to < line.length ? "…" : ""}`,
  };
}

export interface OfficeFindPaneResult {
  /** Stable per result (React key). */
  readonly key: string;
  readonly snippet: OfficeFindSnippet;
  /** Where the hit is, above its preview ("Header 1", "Slide 3 · Title"). */
  readonly label?: string | null;
}

export interface OfficeFindPaneButton {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface OfficeFindPaneResults {
  /** The list's accessible name. */
  readonly label: string;
  readonly heading: ReactNode;
  /** The number beside the heading. */
  readonly count: number;
  /** A note above the list (Docs: a closed header/footer's hint). */
  readonly notice?: ReactNode;
  /** Shown instead of the rows: no query, no result, an invalid pattern. */
  readonly empty?: ReactNode;
  readonly emptyIsError?: boolean;
  readonly items: readonly OfficeFindPaneResult[];
  readonly currentIndex: number;
  /** The "Current" tag on the current row. */
  readonly currentLabel: ReactNode;
  /** A row was clicked or reached by the arrows; false when it could not go. */
  readonly onActivate: (index: number) => boolean | void;
}

export interface OfficeFindPaneReplace {
  readonly label: ReactNode;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  /** The Replace section's body: the replacement field, options, actions. */
  readonly children: ReactNode;
}

export interface OfficeFindPaneProps {
  /** Test ids: `${prefix}-query`, `${prefix}-result-0`, `${prefix}-next`, … */
  readonly testIdPrefix: string;
  /** Inside a shared OfficeTaskPane (it draws the title row and close). */
  readonly docked?: boolean;
  readonly rootRef?: Ref<HTMLDivElement>;
  /** Extra root classes (Docs: the dialogs' chrome). */
  readonly className?: string;
  readonly rootData?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly onRootKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** The pane's own title row; omit when docked. */
  readonly header?: {
    readonly title: ReactNode;
    readonly closeLabel: string;
    readonly onClose: () => void;
  } | null;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly queryPlaceholder: string;
  readonly queryLabel?: string;
  readonly queryInputRef?: Ref<HTMLInputElement>;
  readonly queryAutoFocus?: boolean;
  readonly onQueryKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** Extra attributes on the query field (data-initial-focus, …). */
  readonly queryData?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly countText: ReactNode;
  /** An invalid pattern's message: the count turns red and says why. */
  readonly countError?: string | null;
  readonly previous: OfficeFindPaneButton;
  readonly next: OfficeFindPaneButton;
  readonly optionsLabel: string;
  /** The option toggles (OfficeFindPaneToggle) and any menus beside them. */
  readonly options: ReactNode;
  /** A section under the options (Docs: Word's "More >>"). */
  readonly more?: ReactNode;
  readonly results: OfficeFindPaneResults;
  readonly replace?: OfficeFindPaneReplace | null;
  /** After the Replace section (a status line). */
  readonly children?: ReactNode;
}

/** The pane's part classes, for an editor's own parts beside the shared ones. */
export const officeFindPaneClassNames = {
  root: "note-editor-find-replace",
  button: "note-editor-find-replace__button",
  action: "note-editor-find-replace__action",
  input: "note-editor-find-replace__input",
  replaceInput:
    "note-editor-find-replace__input note-editor-find-replace__input--replace",
  replaceOptions: "note-editor-find-replace__replace-options",
  replaceActions: "note-editor-find-replace__replace-actions",
  moreToggle: "note-editor-find-replace__more-toggle",
  more: "note-editor-find-replace__more",
  moreField: "note-editor-find-replace__more-field",
  moreCheck: "note-editor-find-replace__more-check",
  formatWrap: "note-editor-find-replace__format-wrap",
  formatMenu: "note-editor-find-replace__format-menu",
  formatItem: "note-editor-find-replace__format-item",
  paragraphFormat: "note-editor-find-replace__paragraph-format",
  empty: "note-editor-find-replace__empty",
  /** A status line under the Replace section. */
  status: styles.status,
} as const;

/** The attribute each result row carries its index in. */
export const OFFICE_FIND_RESULT_INDEX_ATTRIBUTE = "data-office-find-result-index";

/** One search option: an icon toggle in the options row. */
export function OfficeFindPaneToggle({
  active,
  label,
  icon,
  testId,
  controlId,
  disabled,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: OfficeSemanticIconId;
  readonly testId?: string;
  readonly controlId?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`${officeFindPaneClassNames.button}${active ? " is-active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-testid={testId}
      data-control-id={controlId}
      disabled={disabled}
      onClick={onClick}
    >
      <OfficeSemanticIcon semanticId={icon} size={16} />
    </button>
  );
}

export function OfficeFindPane({
  testIdPrefix,
  docked = false,
  rootRef,
  className,
  rootData,
  onRootKeyDown,
  header,
  query,
  onQueryChange,
  queryPlaceholder,
  queryLabel,
  queryInputRef,
  queryAutoFocus,
  onQueryKeyDown,
  queryData,
  countText,
  countError,
  previous,
  next,
  optionsLabel,
  options,
  more,
  results,
  replace,
  children,
}: OfficeFindPaneProps): React.JSX.Element {
  const listRef = useRef<HTMLElement | null>(null);
  const resultCount = results.items.length;
  const activateAndFocus = useCallback(
    (index: number) => {
      if (results.onActivate(index) === false) return;
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLButtonElement>(
            `[${OFFICE_FIND_RESULT_INDEX_ATTRIBUTE}="${index}"]`,
          )
          ?.focus({ preventScroll: true });
      });
    },
    [results],
  );
  const rootClassName = docked
    ? styles.docked
    : officeFindPaneClassNames.root;
  return (
    <div
      ref={rootRef}
      className={className ? `${rootClassName} ${className}` : rootClassName}
      data-testid={docked ? `${testIdPrefix}-pane-body` : undefined}
      {...rootData}
      onKeyDown={onRootKeyDown}
    >
      {header ? (
        <header className="note-editor-find-replace__header">
          <span
            className="note-editor-find-replace__title"
            data-testid={`${testIdPrefix}-navigation-title`}
          >
            <OfficeSemanticIcon semanticId="edit.find" size={16} />
            {header.title}
          </span>
          <button
            type="button"
            className={officeFindPaneClassNames.button}
            aria-label={header.closeLabel}
            title={header.closeLabel}
            data-testid={`${testIdPrefix}-close`}
            onClick={header.onClose}
          >
            <OfficeSemanticIcon semanticId="edit.close" size={16} />
          </button>
        </header>
      ) : null}

      <div className="note-editor-find-replace__search-row">
        <div className="note-editor-find-replace__field">
          <OfficeSemanticIcon semanticId="edit.find" size={15} />
          <input
            ref={queryInputRef}
            type="search"
            className={officeFindPaneClassNames.input}
            data-testid={`${testIdPrefix}-query`}
            {...queryData}
            placeholder={queryPlaceholder}
            aria-label={queryLabel}
            autoFocus={queryAutoFocus}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onQueryKeyDown}
          />
        </div>
        <span
          className={`note-editor-find-replace__count${countError ? " is-error" : ""}`}
          data-testid={`${testIdPrefix}-match-count`}
          title={countError ?? undefined}
          style={countError ? { color: "#dc2626" } : undefined}
          aria-live="polite"
        >
          {countText}
        </span>
        <button
          type="button"
          className={officeFindPaneClassNames.button}
          aria-label={previous.label}
          title={previous.label}
          data-testid={`${testIdPrefix}-previous`}
          disabled={previous.disabled}
          onClick={previous.onClick}
        >
          <OfficeSemanticIcon semanticId="edit.findPrevious" size={16} />
        </button>
        <button
          type="button"
          className={officeFindPaneClassNames.button}
          aria-label={next.label}
          title={next.label}
          data-testid={`${testIdPrefix}-next`}
          disabled={next.disabled}
          onClick={next.onClick}
        >
          <OfficeSemanticIcon semanticId="edit.findNext" size={16} />
        </button>
      </div>

      <div className="note-editor-find-replace__options" aria-label={optionsLabel}>
        {options}
      </div>

      {more}

      <section
        ref={listRef}
        className="note-editor-find-replace__results"
        aria-label={results.label}
        data-testid={`${testIdPrefix}-results`}
        role="listbox"
      >
        <div className="note-editor-find-replace__results-heading">
          <span>{results.heading}</span>
          <span>{results.count}</span>
        </div>
        {results.notice}
        {results.empty ? (
          <p
            className={`${officeFindPaneClassNames.empty}${results.emptyIsError ? " is-error" : ""}`}
          >
            {results.empty}
          </p>
        ) : (
          results.items.map((result, index) => {
            const current = index === results.currentIndex;
            const { snippet, label } = result;
            const resultLabel = `${index + 1}/${resultCount}: ${label ? `${label} · ` : ""}${snippet.before}${snippet.match}${snippet.after}`;
            return (
              <button
                key={result.key}
                type="button"
                role="option"
                aria-current={current ? "true" : undefined}
                aria-label={resultLabel}
                aria-selected={current}
                className={`note-editor-find-replace__result${current ? " is-current" : ""}`}
                {...{ [OFFICE_FIND_RESULT_INDEX_ATTRIBUTE]: index }}
                data-testid={`${testIdPrefix}-result-${index}`}
                onClick={() => results.onActivate(index)}
                onKeyDown={(event) => {
                  let targetIndex: number | null = null;
                  if (event.key === "ArrowDown") {
                    targetIndex = (index + 1) % resultCount;
                  } else if (event.key === "ArrowUp") {
                    targetIndex = (index - 1 + resultCount) % resultCount;
                  } else if (event.key === "Home") {
                    targetIndex = 0;
                  } else if (event.key === "End") {
                    targetIndex = resultCount - 1;
                  }
                  if (targetIndex === null) return;
                  event.preventDefault();
                  activateAndFocus(targetIndex);
                }}
              >
                <span className="note-editor-find-replace__result-index">
                  {index + 1}
                </span>
                <span className="note-editor-find-replace__snippet">
                  {label ? (
                    <small
                      className="note-editor-find-replace__story-label"
                      data-testid={`${testIdPrefix}-result-story-${index}`}
                    >
                      {label}
                    </small>
                  ) : null}
                  <span>{snippet.before}</span>
                  <mark>{snippet.match}</mark>
                  <span>{snippet.after}</span>
                </span>
                {current ? (
                  <span className="note-editor-find-replace__current-marker">
                    {results.currentLabel}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </section>

      {replace ? (
        <>
          <button
            type="button"
            className="note-editor-find-replace__replace-toggle"
            aria-expanded={replace.expanded}
            data-testid={`${testIdPrefix}-replace-toggle`}
            disabled={replace.disabled}
            onClick={replace.onToggle}
          >
            <span>
              <OfficeSemanticIcon semanticId="edit.replace" size={15} />
              {replace.label}
            </span>
            <OfficeSemanticIcon semanticId="menu.chevron.down" size={16} />
          </button>
          {replace.expanded ? (
            <section
              className="note-editor-find-replace__replace-panel"
              data-testid={`${testIdPrefix}-replace-panel`}
            >
              {replace.children}
            </section>
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}
