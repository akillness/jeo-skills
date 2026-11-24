"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * USER-DEFINED snippet manager — the section of the CodeMirror editor's settings
 * (gear) popover where the user authors their own `prefix -> body` snippets
 * (VSCode "User Snippets" parity). It is pure CRUD over the localStorage-backed
 * {@link ../../../lib/code-runner/user-snippets} store; the editor's completion
 * source reads that store LIVE on every query, so a saved snippet works in
 * autocomplete immediately (no prop drilling / no editor re-mount needed).
 *
 * Additive + isolated: when the user has defined no snippets the list shows the
 * empty state and the store is untouched, so the editor's completion output is
 * byte-for-byte unchanged. Everything here is keyboard-operable and carries
 * data-testids on the key controls.
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  Download,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { downloadTextFile } from "@mrnote/core/web/lib/download-file.ts";
import { CODE_LANGUAGE_OPTIONS } from "@mrnote/core/web/lib/code-runner/languages.ts";
import styles from "./CodeSidePanels.module.css";
import {
  MAX_BODY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PREFIX_LENGTH,
  MAX_USER_SNIPPETS,
  MAX_USER_SNIPPETS_BACKUP_BYTES,
  SNIPPET_CURSOR,
  addUserSnippet,
  commitUserSnippetsBackup,
  createUserSnippetsBackup,
  loadUserSnippets,
  parseUserSnippetsBackup,
  removeUserSnippet,
  updateUserSnippet,
  userSnippetsPersistenceStatus,
  type UserSnippet,
} from "../../../lib/code-runner/user-snippets";

const USER_SNIPPETS_BACKUP_FILENAME = "mrnote-code-snippets.json";

async function readBackupFile(file: File): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof file.arrayBuffer === "function") {
    buffer = await file.arrayBuffer();
  } else {
    if (typeof FileReader === "undefined") {
      throw new Error("snippet_backup_read_unavailable");
    }
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        reader.result instanceof ArrayBuffer
          ? resolve(reader.result)
          : reject(new Error("snippet_backup_not_bytes"));
      reader.onerror = () =>
        reject(reader.error ?? new Error("snippet_backup_read_failed"));
      reader.readAsArrayBuffer(file);
    });
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

/**
 * The language options offered in the add-form's `<select>`. "" = the leading
 * "All languages" choice (a language-agnostic snippet). The rest are the
 * exact canonical ids offered by the editor selector (typescript is aliased to
 * javascript by the snippet engine, so a snippet saved under either surfaces in
 * both). Deriving this list prevents a newly supported language from being
 * runnable but impossible to target with a user snippet.
 */
const LANGUAGE_OPTIONS: readonly string[] = [
  "",
  ...CODE_LANGUAGE_OPTIONS.map((option) => option.id),
];

function snippetMatchesLanguageFilter(
  snippet: UserSnippet,
  languageFilter: string,
): boolean {
  if (!languageFilter || !snippet.language) return true;
  if (snippet.language === languageFilter) return true;
  return (
    (languageFilter === "javascript" || languageFilter === "typescript") &&
    (snippet.language === "javascript" || snippet.language === "typescript")
  );
}

export function CodeSnippetManager({
  hideHeading = false,
}: {
  /** The pane follows the app theme through the dialog chrome's tokens
   * (data-theme-mode); kept for callers that still pass it. */
  isDark?: boolean;
  /** Inside a task pane whose title already names it. */
  hideHeading?: boolean;
}) {
  const t = useTranslations("console-notebooks");
  // The list mirror driving the UI. Seeded from the store; every mutation writes
  // through the store helper and re-syncs from its (validated, capped) return so
  // the mirror can never drift from what's persisted.
  const [snippets, setSnippets] = useState<UserSnippet[]>(() =>
    loadUserSnippets(),
  );

  // Add-form fields. Default language "" = applies to all languages.
  const [prefix, setPrefix] = useState("");
  const [language, setLanguage] = useState("");
  const [body, setBody] = useState("");
  const [description, setDescription] = useState("");
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  // Inline validation notice for an empty prefix/body on submit.
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<
    readonly UserSnippet[] | null
  >(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<UserSnippet | null>(null);
  const [snippetQuery, setSnippetQuery] = useState("");
  const [snippetLanguageFilter, setSnippetLanguageFilter] = useState("");
  const [sessionOnly, setSessionOnly] = useState(
    () => userSnippetsPersistenceStatus() === "session-only",
  );
  const snippetCapacityReached =
    editingSnippetId === null && snippets.length >= MAX_USER_SNIPPETS;
  const normalizedSnippetQuery = snippetQuery.trim().toLocaleLowerCase();
  const visibleSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (!snippetMatchesLanguageFilter(snippet, snippetLanguageFilter)) {
        return false;
      }
      if (!normalizedSnippetQuery) return true;
      return `${snippet.prefix}\n${snippet.description ?? ""}\n${snippet.language ?? ""}`
        .toLocaleLowerCase()
        .includes(normalizedSnippetQuery);
    });
  }, [normalizedSnippetQuery, snippetLanguageFilter, snippets]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importRequestIdRef = useRef(0);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      importRequestIdRef.current += 1;
    };
  }, []);

  const resetForm = useCallback(() => {
    setPrefix("");
    setBody("");
    setDescription("");
    setEditingSnippetId(null);
    setError(null);
  }, []);

  const handleAdd = useCallback(() => {
    const trimmedPrefix = prefix.trim();
    if (trimmedPrefix.length === 0 || body.trim().length === 0) {
      setError(t("code.snippets.errorRequired"));
      return;
    }
    const candidate = {
      prefix: trimmedPrefix,
      body,
      description: description.trim() || undefined,
      language: language || undefined,
    };
    const previous = loadUserSnippets();
    const next = editingSnippetId
      ? updateUserSnippet(editingSnippetId, candidate)
      : addUserSnippet(candidate);
    const saved = editingSnippetId
      ? next.find((snippet) => snippet.id === editingSnippetId)
      : next.at(-1);
    if (
      !saved ||
      saved.prefix !== candidate.prefix ||
      saved.body !== candidate.body ||
      saved.description !== candidate.description ||
      saved.language !== candidate.language ||
      (!editingSnippetId && next.length <= previous.length)
    ) {
      setError(t("code.snippets.errorInvalid"));
      return;
    }
    setSnippets(next);
    setSnippetLanguageFilter(candidate.language ?? "");
    setSessionOnly(userSnippetsPersistenceStatus() === "session-only");
    // Clear the form for the next entry, keeping the chosen language sticky so a
    // user adding several snippets for one language doesn't re-pick it each time.
    resetForm();
  }, [prefix, body, description, editingSnippetId, language, resetForm, t]);

  const handleRemove = useCallback(
    (id: string) => {
      const next = removeUserSnippet(id);
      setSnippets(next);
      if (next.length === 0) setSnippetLanguageFilter("");
      setSessionOnly(userSnippetsPersistenceStatus() === "session-only");
      setPendingDeletion(null);
      if (editingSnippetId === id) resetForm();
    },
    [editingSnippetId, resetForm],
  );

  const handleExport = useCallback(() => {
    setError(null);
    const backup = createUserSnippetsBackup();
    if (
      !backup.ok ||
      !downloadTextFile(
        USER_SNIPPETS_BACKUP_FILENAME,
        backup.json,
        "application/json;charset=utf-8",
      )
    ) {
      setError(t("toolbar.exportDownloadUnavailable"));
    }
  }, [t]);

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      // Let the same backup be selected again after a failed attempt.
      event.currentTarget.value = "";
      if (!file) return;

      const requestId = ++importRequestIdRef.current;
      setError(null);
      setPendingImport(null);
      setPendingDeletion(null);
      if (file.size > MAX_USER_SNIPPETS_BACKUP_BYTES) {
        setError(t("editor.importFailed"));
        return;
      }
      try {
        const raw = await readBackupFile(file);
        if (!mountedRef.current || importRequestIdRef.current !== requestId) {
          return;
        }
        const parsed = parseUserSnippetsBackup(raw);
        if (!parsed.ok) {
          setError(t("editor.importFailed"));
          return;
        }
        setPendingImport(parsed.snippets);
      } catch {
        if (mountedRef.current && importRequestIdRef.current === requestId) {
          setError(t("editor.importFailed"));
        }
      }
    },
    [t],
  );

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;
    const restored = commitUserSnippetsBackup(pendingImport);
    if (!restored.ok) {
      setError(t("editor.importFailed"));
      return;
    }
    setSnippets(restored.snippets);
    setSessionOnly(false);
    setPendingImport(null);
    setPendingDeletion(null);
    resetForm();
    setSnippetQuery("");
    setSnippetLanguageFilter("");
  }, [pendingImport, resetForm, t]);

  const labelFor = useCallback(
    (lang?: string) => (lang ? lang : t("code.snippets.allLanguages")),
    [t],
  );

  // Drawn with the shared dialog chrome's parts inside the shared task pane
  // (CodeMirrorEditor's OfficeTaskPane, code tone): the search field is the
  // panes' input group, the snippets a list box, notices chrome messages and
  // the add form chrome fields with its primary action last.
  return (
    <div
      data-testid="code-snippets-manager"
      className={officeDialogParts.body}
      // Stop the editor's global keydown listeners (and the popover's Escape
      // close) from swallowing typing into the form fields below.
      onKeyDown={(e) => e.stopPropagation()}
    >
      {hideHeading ? null : (
        <h3 className={officeDialogParts.sectionTitle}>
          {t("code.snippets.heading")}
        </h3>
      )}
      {snippetCapacityReached ? (
        <p
          role="status"
          data-testid="code-snippets-limit"
          className={officeDialogParts.message}
          data-tone="warning"
        >
          {t("code.snippets.limit", { max: MAX_USER_SNIPPETS })}
        </p>
      ) : null}
      {sessionOnly ? (
        <p
          role="status"
          data-testid="code-snippets-session-only"
          className={officeDialogParts.message}
          data-tone="warning"
        >
          {t("code.snippets.sessionOnly")}
        </p>
      ) : null}

      {snippets.length > 0 ? (
        <div className={`${officeDialogParts.row} ${styles.nowrap}`}>
          <div
            className={`${officeDialogParts.inputGroup} ${styles.grow}`}
            role="search"
          >
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={snippetQuery}
              maxLength={128}
              onChange={(event) => setSnippetQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || snippetQuery.length === 0) return;
                event.preventDefault();
                setSnippetQuery("");
              }}
              placeholder={t("code.snippets.search")}
              aria-label={t("code.snippets.search")}
              data-testid="code-snippets-search"
            />
          </div>
          <select
            value={snippetLanguageFilter}
            onChange={(event) =>
              setSnippetLanguageFilter(event.currentTarget.value)
            }
            aria-label={t("code.snippets.languageLabel")}
            title={t("code.snippets.languageLabel")}
            data-testid="code-snippets-language-filter"
            className={styles.fixed}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang || "all"} value={lang}>
                {labelFor(lang)}
              </option>
            ))}
          </select>
          <span
            data-testid="code-snippets-search-count"
            aria-live="polite"
            className={styles.count}
          >
            {visibleSnippets.length}/{snippets.length}
          </span>
        </div>
      ) : null}

      {/* Existing snippets list (prefix + language + delete). */}
      {snippets.length === 0 ? (
        <div
          data-testid="code-snippets-empty"
          className="document-outline-panel-empty office-rise-in"
        >
          {t("code.snippets.empty")}
        </div>
      ) : visibleSnippets.length === 0 ? (
        <p
          role="status"
          data-testid="code-snippets-search-empty"
          className={officeDialogParts.message}
        >
          {t("code.snippets.searchNone")}
        </p>
      ) : (
        <ul
          data-testid="code-snippets-list"
          className={`${officeDialogParts.list} ${styles.snippetList}`}
        >
          {visibleSnippets.map((snippet) => (
            <li key={snippet.id} className={styles.snippetRow}>
              <button
                type="button"
                onClick={() => {
                  setEditingSnippetId(snippet.id);
                  setPrefix(snippet.prefix);
                  setLanguage(snippet.language ?? "");
                  setBody(snippet.body);
                  setDescription(snippet.description ?? "");
                  setPendingDeletion(null);
                  setError(null);
                }}
                data-testid={`code-snippet-edit-${snippet.prefix}`}
                title={t("code.snippets.edit")}
                aria-label={`${t("code.snippets.edit")}: ${snippet.prefix}`}
                className={`${officeDialogParts.listItem} ${officeDialogParts.mono}`}
                data-selected={editingSnippetId === snippet.id || undefined}
              >
                {snippet.prefix}
              </button>
              <span className={`${officeDialogParts.hint} ${styles.fixed}`}>
                {labelFor(snippet.language)}
              </span>
              {pendingDeletion === snippet ? (
                <span
                  data-testid={`code-snippet-delete-confirmation-${snippet.prefix}`}
                  className={`${officeDialogParts.row} ${styles.fixed}`}
                >
                  <span
                    role="status"
                    className={officeDialogParts.message}
                    data-tone="warning"
                  >
                    {t("code.snippets.deleteConfirm", {
                      prefix: snippet.prefix,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        pendingDeletion !== snippet ||
                        !snippets.includes(snippet)
                      ) {
                        return;
                      }
                      handleRemove(snippet.id);
                    }}
                    title={t("code.snippets.delete")}
                    aria-label={t("code.snippets.deleteNamed", {
                      prefix: snippet.prefix,
                    })}
                    data-testid={`code-snippet-delete-confirm-${snippet.prefix}`}
                    className={officeDialogParts.iconButton}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeletion(null)}
                    title={t("common.cancel")}
                    aria-label={t("common.cancel")}
                    data-testid={`code-snippet-delete-cancel-${snippet.prefix}`}
                    className={officeDialogParts.iconButton}
                  >
                    <X size={13} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDeletion(snippet)}
                  title={t("code.snippets.delete")}
                  aria-label={t("code.snippets.deleteNamed", {
                    prefix: snippet.prefix,
                  })}
                  data-testid={`code-snippet-delete-${snippet.prefix}`}
                  className={officeDialogParts.iconButton}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        data-testid="code-snippets-backup-actions"
        className={officeDialogParts.row}
      >
        <button
          type="button"
          onClick={handleExport}
          data-testid="code-snippets-export"
          aria-label={t("pages.export")}
          className={officeDialogParts.compactButton}
        >
          <Download size={13} />
          <span>{t("pages.export")}</span>
        </button>
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          data-testid="code-snippets-import"
          aria-label={t("editor.import")}
          className={officeDialogParts.compactButton}
        >
          <Upload size={13} />
          <span>{t("editor.import")}</span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          data-testid="code-snippets-import-input"
          hidden
        />
      </div>

      {pendingImport ? (
        <div
          data-testid="code-snippets-import-confirmation"
          role="status"
          className={`${officeDialogParts.well} ${styles.wellContent}`}
        >
          <p className={officeDialogParts.message}>
            {t("code.snippets.importConfirm", {
              incoming: pendingImport.length,
              current: snippets.length,
            })}
          </p>
          <div className={officeDialogParts.row}>
            <button
              type="button"
              onClick={() => setPendingImport(null)}
              data-testid="code-snippets-import-cancel"
              className={officeDialogParts.compactButton}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmImport}
              data-testid="code-snippets-import-confirm"
              className={`${officeDialogParts.primaryButton} ${officeDialogParts.compactButton}`}
            >
              {t("code.snippets.importApply")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Add form. */}
      <div className={officeDialogParts.group}>
        <div className={`${officeDialogParts.row} ${styles.nowrap}`}>
          <input
            type="text"
            value={prefix}
            disabled={snippetCapacityReached}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder={t("code.snippets.prefixPlaceholder")}
            aria-label={t("code.snippets.prefixLabel")}
            data-testid="code-snippet-prefix-input"
            maxLength={MAX_PREFIX_LENGTH}
            className={`${officeDialogParts.mono} ${styles.grow}`}
          />
          <select
            value={language}
            disabled={snippetCapacityReached}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label={t("code.snippets.languageLabel")}
            data-testid="code-snippet-language-select"
            className={styles.fixed}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang || "all"} value={lang}>
                {labelFor(lang)}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          disabled={snippetCapacityReached}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("code.snippets.bodyPlaceholder", {
            cursor: SNIPPET_CURSOR,
          })}
          aria-label={t("code.snippets.bodyLabel")}
          data-testid="code-snippet-body-input"
          maxLength={MAX_BODY_LENGTH}
          rows={3}
          className={`${officeDialogParts.mono} ${styles.snippetBody}`}
        />
        <input
          type="text"
          value={description}
          disabled={snippetCapacityReached}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("code.snippets.descriptionPlaceholder")}
          aria-label={t("code.snippets.descriptionLabel")}
          data-testid="code-snippet-description-input"
          maxLength={MAX_DESCRIPTION_LENGTH}
        />
        {error ? (
          <p
            role="alert"
            data-testid="code-snippet-error"
            className={officeDialogParts.error}
          >
            {error}
          </p>
        ) : null}
        <div className={officeDialogParts.footer}>
          {editingSnippetId ? (
            <button
              type="button"
              onClick={resetForm}
              data-testid="code-snippet-edit-cancel"
              className={officeDialogParts.compactButton}
            >
              <X size={13} />
              <span>{t("common.cancel")}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleAdd}
            disabled={snippetCapacityReached}
            title={
              snippetCapacityReached
                ? t("code.snippets.limit", { max: MAX_USER_SNIPPETS })
                : undefined
            }
            data-testid="code-snippet-add"
            className={`${officeDialogParts.primaryButton} ${officeDialogParts.compactButton}`}
          >
            <Plus size={13} />
            <span>
              {editingSnippetId
                ? t("code.snippets.save")
                : t("code.snippets.add")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
