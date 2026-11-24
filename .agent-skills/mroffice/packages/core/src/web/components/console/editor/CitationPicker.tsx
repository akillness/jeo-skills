"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "../../../../host/next-intl";
import { containDialogTab } from "../../../lib/dialog-tab-containment";
import {
  officeDialogClassName,
  officeDialogParts as parts,
  useOfficeDialogChrome,
} from "../../office-ribbon/officeDialogChrome";
import {
  BookMarked,
  Copy,
  Pencil,
  Plus,
  Trash2,
  X,
} from "../../office-ribbon/icons/houseIcons";
import { useCloseOnEscape } from "./useCloseOnEscape";
import {
  CSL_SOURCE_TYPES,
  CITATION_STYLE_LABELS,
  CITATION_STYLES,
  defaultSourceTag,
  MAX_SOURCE_ID_LENGTH,
  MAX_SOURCES,
  formatCslNameForEditing,
  sanitizeSourceId,
  sourceIdFor,
  type CitationStyle,
  type CslSource,
  type CslSourceType,
} from "./native-document/citations";

/**
 * Source picker for "Insert citation" (Word/WPS parity).
 *
 * Two panes: PICK an existing source from the document's source store, or ADD a
 * new one (a small CSL-JSON-like form). On confirm it hands back the chosen
 * source (existing) or a freshly-built source object (new) plus an optional page
 * locator; NoteEditor runs the matching citation command. Also offers a style
 * toggle (APA / IEEE) since that is a document-wide setting the user reaches for
 * right when they first cite something.
 *
 * Purely presentational + local-state: it never touches the editor directly (so
 * it stays testable in isolation), it only reports the user's choice upward. All
 * values are sanitized again at the command/store edge (see citations.ts), so
 * this form does no security-relevant scrubbing of its own.
 */

export interface CitationPickerResult {
  /** An existing source id to cite, OR a new source object to add + cite. */
  existingSourceId?: string;
  newSource?: Partial<CslSource> & { id: string };
  locator?: string;
}

interface CitationPickerProps {
  sources: CslSource[];
  style: CitationStyle;
  /** Live write authority; browsing/searching the source library stays allowed. */
  canWrite?: boolean;
  mode?: "insert" | "manage";
  citedSourceIds?: readonly string[];
  onPickExisting: (sourceId: string, locator?: string) => void;
  onAddSource: (
    source: Partial<CslSource> & { id: string },
    locator?: string,
  ) => void;
  onUpsertSource?: (source: Partial<CslSource> & { id: string }) => void;
  onRemoveSource?: (sourceId: string) => void;
  onSetStyle: (style: CitationStyle) => void;
  onClose: () => void;
}

const SOURCE_TYPE_LABEL_KEY: Record<CslSourceType, string> = {
  "article-journal": "citations.type.article",
  book: "citations.type.book",
  chapter: "citations.type.chapter",
  "paper-conference": "citations.type.conference",
  webpage: "citations.type.webpage",
  document: "citations.type.document",
};

function authorsSummary(source: CslSource): string {
  if (source.author.length === 0) return "";
  const first = source.author[0];
  const name = [first.given, first.family].filter(Boolean).join(" ");
  return source.author.length > 1 ? `${name} et al.` : name;
}

function uniqueSourceTag(
  sources: readonly CslSource[],
  preferred?: string,
): string {
  const occupied = new Set(sources.map((source) => source.id));
  const preferredTag = sanitizeSourceId(preferred);
  const base = preferredTag || sourceIdFor();
  if (!occupied.has(base)) return base;

  for (let suffix = 2; suffix <= sources.length + 2; suffix += 1) {
    const suffixText = `-${suffix}`;
    const candidate = `${base.slice(
      0,
      MAX_SOURCE_ID_LENGTH - suffixText.length,
    )}${suffixText}`;
    if (!occupied.has(candidate)) return candidate;
  }
  return sourceIdFor();
}

/** Authors are separated as the field's hint shows them: a semicolon, ASCII
 * or full-width (「张三；李四」), or a new line. A comma stays inside one name
 * ("Smith, Ada"). The full-width one used to be kept inside the first name,
 * which then lost everything after its comma (WUA 214). */
const AUTHOR_SEPARATOR = /[;；\n]/;

export default function CitationPicker({
  sources,
  style,
  canWrite = true,
  mode = "insert",
  citedSourceIds = [],
  onPickExisting,
  onAddSource,
  onUpsertSource,
  onRemoveSource,
  onSetStyle,
  onClose,
}: CitationPickerProps) {
  const t = useTranslations("console-notebooks");
  // Word's Insert Citation / Create Source dialog: the shared dialog chrome.
  const chromeTone = useOfficeDialogChrome();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"pick" | "add">(
    sources.length > 0 ? "pick" : "add",
  );
  const [query, setQuery] = useState("");
  const [locator, setLocator] = useState("");

  // New-source form fields.
  const [type, setType] = useState<CslSourceType>("article-journal");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [container, setContainer] = useState("");
  const [publisher, setPublisher] = useState("");
  const [showAllBibliographyFields, setShowAllBibliographyFields] =
    useState(false);
  const [volume, setVolume] = useState("");
  const [issue, setIssue] = useState("");
  const [page, setPage] = useState("");
  const [url, setUrl] = useState("");
  // The tag the user typed for a new source, or null while the field follows
  // Word's default (author + year), which changes as those fields are filled.
  const [tagOverride, setTagOverride] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const proposedSourceTag = useMemo(
    () =>
      defaultSourceTag(
        {
          author: authors
            .split(AUTHOR_SEPARATOR)
            .map((a) => a.trim())
            .filter(Boolean),
          title,
          year,
        },
        sources.map((source) => source.id),
      ),
    [authors, title, year, sources],
  );
  const sourceTag = editingSourceId ?? tagOverride ?? proposedSourceTag;
  // The source's authors as they were when editing began, and the text the
  // field showed for them: saving without touching that field keeps the
  // names exactly (an organisation stays one family name).
  const [editingAuthors, setEditingAuthors] = useState<{
    text: string;
    names: CslSource["author"];
  } | null>(null);

  const citedSourceIdSet = useMemo(
    () => new Set(citedSourceIds),
    [citedSourceIds],
  );

  useEffect(() => {
    const returnFocus =
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const firstControl =
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    firstControl?.focus();
    let focusFrame = 0;
    const settleFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        if (firstControl?.isConnected) firstControl.focus();
      });
    });
    return () => {
      window.cancelAnimationFrame(settleFrame);
      window.cancelAnimationFrame(focusFrame);
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((source) => {
      // The list shows "First et al.", the search covers every saved author
      
      const authors = source.author
        .map((author) => [author.given, author.family].filter(Boolean).join(" "))
        .join(" ");
      const hay =
        `${source.title} ${authors} ${source.year} ${source.containerTitle}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sources, query]);

  const normalizedSourceTag = sanitizeSourceId(sourceTag.trim());
  const sourceTagIsSafe =
    normalizedSourceTag !== null && normalizedSourceTag === sourceTag.trim();
  const sourceTagConflict = sources.some(
    (source) =>
      source.id === normalizedSourceTag && source.id !== editingSourceId,
  );
  // A full store takes no new source (an existing one can still be edited):
  // the command would refuse it, and a citation to it with it (OFL-051).
  const storeFull = editingSourceId === null && sources.length >= MAX_SOURCES;
  const canAdd =
    (title.trim().length > 0 || authors.trim().length > 0) &&
    sourceTagIsSafe &&
    !sourceTagConflict &&
    !storeFull;

  const handleAdd = useCallback(() => {
    if (!canWrite || !canAdd) return;
    const authorList = authors
      .split(AUTHOR_SEPARATOR)
      .map((a) => a.trim())
      .filter(Boolean)
      .map((a) => {
        // "Family, Given" or "Given Family" — the store normalizer parses both,
        // so we pass the raw string and let normalizeCslName split it.
        return a;
      });
    const authorsUnchanged =
      editingSourceId !== null && editingAuthors?.text === authors;
    const source: Partial<CslSource> & { id: string } = {
      id: editingSourceId ?? normalizedSourceTag ?? sourceIdFor(),
      type,
      title: title.trim(),
      // The store accepts an array of strings or {family,given}; strings are fine.
      author: authorsUnchanged
        ? editingAuthors.names
        : (authorList as unknown as CslSource["author"]),
      year: year.trim(),
      containerTitle: container.trim(),
      publisher: publisher.trim(),
      volume: volume.trim(),
      issue: issue.trim(),
      page: page.trim(),
      url: url.trim(),
    };
    if (mode === "manage") {
      onUpsertSource?.(source);
      setEditingSourceId(null);
      setEditingAuthors(null);
      setTagOverride(null);
      setTitle("");
      setAuthors("");
      setYear("");
      setContainer("");
      setPublisher("");
      setVolume("");
      setIssue("");
      setPage("");
      setUrl("");
      setShowAllBibliographyFields(false);
      setTab("pick");
      return;
    }
    onAddSource(source, locator.trim() || undefined);
  }, [
    canAdd,
    canWrite,
    authors,
    type,
    title,
    year,
    container,
    publisher,
    volume,
    issue,
    page,
    url,
    locator,
    normalizedSourceTag,
    editingSourceId,
    editingAuthors,
    mode,
    onAddSource,
    onUpsertSource,
  ]);

  const beginEdit = useCallback(
    (source: CslSource) => {
      if (!canWrite) return;
      setEditingSourceId(source.id);
      setType(source.type);
      setTitle(source.title);
      const authorText = source.author
        .map(formatCslNameForEditing)
        .filter(Boolean)
        .join("; ");
      setAuthors(authorText);
      setEditingAuthors({ text: authorText, names: source.author });
      setYear(source.year);
      setContainer(source.containerTitle);
      setPublisher(source.publisher);
      setVolume(source.volume);
      setIssue(source.issue);
      setPage(source.page);
      setUrl(source.url);
      setShowAllBibliographyFields(
        Boolean(source.volume || source.issue || source.page || source.url),
      );
      setTagOverride(null);
      setTab("add");
    },
    [canWrite],
  );

  const beginCreate = useCallback(() => {
    if (!canWrite) return;
    setEditingSourceId(null);
    setEditingAuthors(null);
    setType("article-journal");
    setTitle("");
    setAuthors("");
    setYear("");
    setContainer("");
    setPublisher("");
    setVolume("");
    setIssue("");
    setPage("");
    setUrl("");
    setShowAllBibliographyFields(false);
    setTagOverride(null);
    setTab("add");
  }, [canWrite]);

  useCloseOnEscape(onClose);

  return (
    <div
      ref={dialogRef}
      className={`citation-picker ${officeDialogClassName({ tone: chromeTone ?? "document" })}`}
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === "manage"
          ? t("citations.sourceManagerTitle")
          : t("citations.pickerTitle")
      }
      data-testid="citation-picker"
      onKeyDown={(event) => {
        // aria-modal: Tab and Shift+Tab wrap inside, never reach the page.
        if (containDialogTab(event, event.currentTarget)) return;
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={`citation-picker__head ${parts.header}`}>
        <span className={`citation-picker__heading ${parts.title}`}>
          <BookMarked size={14} />{" "}
          {mode === "manage"
            ? t("citations.sourceManagerTitle")
            : t("citations.pickerTitle")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className={`citation-picker__close ${parts.close}`}
          aria-label={t("citations.close")}
          data-testid="citation-picker-close"
        >
          <X size={14} />
        </button>
      </div>

      <div
        className="citation-picker__style"
        data-testid="citation-picker-style"
      >
        <span>{t("citations.styleLabel")}</span>
        {CITATION_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            className={parts.compactButton}
            aria-pressed={style === s}
            disabled={!canWrite}
            onClick={() => {
              if (canWrite) onSetStyle(s);
            }}
            data-testid={`citation-picker-style-${s}`}
          >
            {CITATION_STYLE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="citation-picker__tabs">
        <button
          type="button"
          className={parts.compactButton}
          aria-pressed={tab === "pick"}
          onClick={() => setTab("pick")}
          disabled={mode === "insert" && sources.length === 0}
          data-testid="citation-picker-tab-pick"
        >
          {mode === "manage"
            ? t("citations.tabLibrary")
            : t("citations.tabExisting")}
        </button>
        <button
          type="button"
          className={parts.compactButton}
          aria-pressed={tab === "add"}
          onClick={beginCreate}
          disabled={!canWrite}
          data-testid="citation-picker-tab-add"
        >
          {mode === "manage" ? t("citations.addSource") : t("citations.tabNew")}
        </button>
      </div>

      {mode === "insert" ? (
        <label className={`citation-picker__locator ${parts.field}`}>
          {t("citations.locatorLabel")}
          <input
            type="text"
            value={locator}
            disabled={!canWrite}
            onChange={(e) => setLocator(e.target.value)}
            placeholder={t("citations.locatorPlaceholder")}
            data-testid="citation-picker-locator"
          />
        </label>
      ) : null}

      {tab === "pick" ? (
        <div className="citation-picker__pick">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("citations.searchPlaceholder")}
            className="citation-picker__search"
            data-testid="citation-picker-search"
            data-autofocus
          />
          <ul className={`citation-picker__results ${parts.list}`}>
            {filtered.map((source) => {
              const sourceIsCited = citedSourceIdSet.has(source.id);
              return (
                <li
                  key={source.id}
                  className={
                    mode === "manage"
                      ? "citation-picker__source-row"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className={parts.listItem}
                    disabled={!canWrite}
                    onClick={() => {
                      if (!canWrite) return;
                      if (mode === "manage") {
                        beginEdit(source);
                        return;
                      }
                      onPickExisting(source.id, locator.trim() || undefined);
                    }}
                    data-testid="citation-picker-item"
                  >
                    <span className="citation-picker__item-title">
                      {source.title || t("citations.untitledSource")}
                    </span>
                    <span className={`citation-picker__item-meta ${parts.hint}`}>
                      {[
                        authorsSummary(source),
                        source.year,
                        sourceIsCited ? t("citations.sourceInUse") : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </button>
                  {mode === "manage" ? (
                    <div className="citation-picker__source-actions">
                      <button
                        type="button"
                        className={parts.iconButton}
                        disabled={!canWrite}
                        onClick={() => beginEdit(source)}
                        aria-label={t("citations.editSource", {
                          title: source.title || t("citations.untitledSource"),
                        })}
                        data-testid="citation-source-edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={parts.iconButton}
                        onClick={() => {
                          if (!canWrite) return;
                          onUpsertSource?.({
                            ...source,
                            id: uniqueSourceTag(sources, `${source.id}-copy`),
                          });
                        }}
                        disabled={!canWrite || !onUpsertSource}
                        aria-label={t("citations.copySource", {
                          title: source.title || t("citations.untitledSource"),
                        })}
                        data-testid="citation-source-copy"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className={parts.iconButton}
                        onClick={() => {
                          if (!canWrite) return;
                          const title =
                            source.title || t("citations.untitledSource");
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(
                              t("citations.deleteSourceConfirm", { title }),
                            )
                          ) {
                            return;
                          }
                          onRemoveSource?.(source.id);
                        }}
                        disabled={!canWrite || sourceIsCited || !onRemoveSource}
                        aria-label={
                          sourceIsCited
                            ? t("citations.deleteSourceBlocked", {
                                title:
                                  source.title || t("citations.untitledSource"),
                              })
                            : t("citations.deleteSource", {
                                title:
                                  source.title || t("citations.untitledSource"),
                              })
                        }
                        title={
                          sourceIsCited
                            ? t("citations.deleteSourceBlockedReason")
                            : undefined
                        }
                        data-testid="citation-source-delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className={`citation-picker__empty ${parts.hint}`}>
                {t("citations.noSources")}
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="citation-picker__add">
          <label className={parts.field}>
            {t("citations.fieldTag")}
            <input
              type="text"
              value={sourceTag}
              onChange={(e) => setTagOverride(e.target.value)}
              disabled={!canWrite || editingSourceId !== null}
              aria-invalid={!sourceTagIsSafe || sourceTagConflict}
              aria-describedby="citation-source-tag-status"
              data-testid="citation-picker-tag"
              data-autofocus
            />
            <span
              id="citation-source-tag-status"
              className={parts.hint}
              aria-live="polite"
            >
              {sourceTagConflict
                ? t("citations.tagAlreadyExists")
                : !sourceTagIsSafe
                  ? t("citations.tagInvalid")
                  : editingSourceId
                    ? t("citations.tagStableHint")
                    : t("citations.tagUniqueHint")}
            </span>
          </label>
          <label className={parts.field}>
            {t("citations.fieldType")}
            <select
              value={type}
              disabled={!canWrite}
              onChange={(e) => setType(e.target.value as CslSourceType)}
              data-testid="citation-picker-type"
            >
              {CSL_SOURCE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(SOURCE_TYPE_LABEL_KEY[k] as never)}
                </option>
              ))}
            </select>
          </label>
          <label className={parts.field}>
            {t("citations.fieldTitle")}
            <input
              type="text"
              value={title}
              disabled={!canWrite}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="citation-picker-title"
            />
          </label>
          <label className={parts.field}>
            {t("citations.fieldAuthors")}
            <input
              type="text"
              value={authors}
              disabled={!canWrite}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder={t("citations.authorsPlaceholder")}
              data-testid="citation-picker-authors"
            />
          </label>
          <div className="citation-picker__row">
            <label className={parts.field}>
              {t("citations.fieldYear")}
              <input
                type="text"
                value={year}
                disabled={!canWrite}
                onChange={(e) => setYear(e.target.value)}
                data-testid="citation-picker-year"
              />
            </label>
            <label className={parts.field}>
              {t("citations.fieldContainer")}
              <input
                type="text"
                value={container}
                disabled={!canWrite}
                onChange={(e) => setContainer(e.target.value)}
                data-testid="citation-picker-container"
              />
            </label>
          </div>
          <label className={parts.field}>
            {t("citations.fieldPublisher")}
            <input
              type="text"
              value={publisher}
              disabled={!canWrite}
              onChange={(e) => setPublisher(e.target.value)}
              data-testid="citation-picker-publisher"
            />
          </label>
          <label className={`citation-picker__show-all ${parts.check}`}>
            <input
              type="checkbox"
              checked={showAllBibliographyFields}
              disabled={!canWrite}
              onChange={(event) =>
                setShowAllBibliographyFields(event.target.checked)
              }
              data-testid="citation-picker-show-all-fields"
            />
            <span>{t("citations.showAllBibliographyFields")}</span>
          </label>
          {showAllBibliographyFields ? (
            <div
              className="citation-picker__advanced-fields"
              data-testid="citation-picker-advanced-fields"
            >
              <div className="citation-picker__row">
                <label className={parts.field}>
                  {t("citations.fieldVolume")}
                  <input
                    type="text"
                    value={volume}
                    disabled={!canWrite}
                    onChange={(event) => setVolume(event.target.value)}
                    data-testid="citation-picker-volume"
                  />
                </label>
                <label className={parts.field}>
                  {t("citations.fieldIssue")}
                  <input
                    type="text"
                    value={issue}
                    disabled={!canWrite}
                    onChange={(event) => setIssue(event.target.value)}
                    data-testid="citation-picker-issue"
                  />
                </label>
              </div>
              <label className={parts.field}>
                {t("citations.fieldPages")}
                <input
                  type="text"
                  value={page}
                  disabled={!canWrite}
                  onChange={(event) => setPage(event.target.value)}
                  data-testid="citation-picker-pages"
                />
              </label>
              <label className={parts.field}>
                {t("citations.fieldUrl")}
                <input
                  type="url"
                  value={url}
                  disabled={!canWrite}
                  onChange={(event) => setUrl(event.target.value)}
                  data-testid="citation-picker-url"
                />
              </label>
            </div>
          ) : null}
          <button
            type="button"
            className={`citation-picker__add-btn ${parts.primaryButton}`}
            onClick={handleAdd}
            disabled={!canWrite || !canAdd}
            data-testid="citation-picker-add"
          >
            <Plus size={14} />{" "}
            {mode === "manage"
              ? editingSourceId
                ? t("citations.saveSource")
                : t("citations.addSource")
              : t("citations.addAndCite")}
          </button>
        </div>
      )}
    </div>
  );
}
