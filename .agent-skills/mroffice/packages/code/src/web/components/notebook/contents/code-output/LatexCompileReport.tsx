"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Overleaf's "Logs and output files" for the last LaTeX compile, in the Code
 * window's output: the log's errors, warnings and typesetting (overfull and
 * underfull boxes) as rows that open their file at their line, the raw log,
 * and every file the compile returned to download. It reads the same on a
 * failed compile, which has a log but no PDF.
 *
 * The anatomy is the Problems panel's: a header bar with toggle filters and
 * rows of icon, message and location.
 */

import { forwardRef, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  AlertTriangle,
  CircleAlert,
  Download,
  FileText,
  Info,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { LanguageExecutionBuildCache } from "../../../../lib/code-runner/build-cache";
import type { LanguageExecutionArtifact } from "../../../../lib/code-runner/execution-artifact";
import {
  countLatexLogEntries,
  type LatexLogEntry,
  type LatexLogLevel,
} from "../../../../lib/code-runner/latex-log";
import type { LanguageExecutionOutputFiles } from "../../../../lib/code-runner/output-files";
import { officeDialogParts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { downloadBlobFile } from "@mrnote/core/web/lib/download-file.ts";
import { base64ToBytes } from "@mrnote/core/web/lib/engine-host/pdf-native-wire.ts";
import { CODE_OUTPUT_CHROME_CLASS } from "./codeOutputChrome";
import styles from "./LatexCompileReport.module.css";

const LEVELS: readonly LatexLogLevel[] = ["error", "warning", "typesetting"];
const LEVEL_LABEL_KEYS = {
  error: "codeOutput.latex.levelError",
  warning: "codeOutput.latex.levelWarning",
  typesetting: "codeOutput.latex.levelTypesetting",
} as const;

/** What one compile returned besides its output. */
export interface LatexCompileFiles {
  readonly outputFiles: LanguageExecutionOutputFiles | null;
  readonly buildCache: LanguageExecutionBuildCache | null;
  readonly artifact: LanguageExecutionArtifact | null;
}

interface DownloadableFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: () => Uint8Array;
}

function downloadableFiles(files: LatexCompileFiles): DownloadableFile[] {
  const list: DownloadableFile[] = [];
  const { artifact } = files;
  if (artifact) {
    list.push({ name: artifact.name, type: artifact.mediaType, bytes: () => artifact.bytes });
  }
  for (const file of files.outputFiles?.files ?? []) {
    list.push({
      name: file.name,
      type: file.name.endsWith(".gz") ? "application/gzip" : "text/plain",
      bytes: () => file.bytes,
    });
  }
  for (const file of files.buildCache?.files ?? []) {
    list.push({
      name: file.name,
      type: "application/octet-stream",
      bytes: () => base64ToBytes(file.contentBase64),
    });
  }
  return list;
}

function LevelIcon({ level }: { level: LatexLogLevel }) {
  if (level === "error") return <CircleAlert size={13} aria-hidden="true" />;
  if (level === "warning") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Info size={13} aria-hidden="true" />;
}

/** "chapters/intro.tex, line 3": a TeX Live file goes by its name alone. */
export function latexLogEntryLocation(
  entry: LatexLogEntry,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!entry.file) return entry.line !== null ? t("codeOutput.frameLine", { line: entry.line }) : "";
  const file = entry.inProject ? entry.file : (entry.file.split("/").at(-1) ?? entry.file);
  return entry.line !== null
    ? t("codeOutput.latex.location", { file, line: entry.line })
    : file;
}

export const LatexCompileReport = forwardRef<
  HTMLElement,
  {
    files: LatexCompileFiles;
    entries: readonly LatexLogEntry[];
    logText: string;
    /** Leading bytes of a log too long to return whole (0: none). */
    omittedBytes: number;
    onOpenEntry: (entry: LatexLogEntry) => void;
  }
>(function LatexCompileReport(
  { files, entries, logText, omittedBytes, onOpenEntry },
  ref,
) {
  const t = useTranslations("console-notebooks");
  const [hidden, setHidden] = useState<ReadonlySet<LatexLogLevel>>(() => new Set());
  const [raw, setRaw] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState<string | null>(null);
  const counts = useMemo(() => countLatexLogEntries(entries), [entries]);
  const visible = useMemo(
    () => entries.filter((entry) => !hidden.has(entry.level)),
    [entries, hidden],
  );
  const downloads = useMemo(() => downloadableFiles(files), [files]);

  const download = (file: DownloadableFile) => {
    let started = false;
    try {
      started = downloadBlobFile(file.name, new Blob([file.bytes().slice()], { type: file.type }));
    } catch {
      started = false;
    }
    setDownloadFailed(started ? null : file.name);
  };

  // Up, Down, Home and End move between the rows, as in Problems.
  const moveBetweenEntries = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const at = rows.indexOf(event.target as HTMLButtonElement);
    if (at < 0 || rows.length === 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : event.key === "ArrowDown"
            ? Math.min(at + 1, rows.length - 1)
            : Math.max(at - 1, 0);
    rows[next]?.focus();
  };

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={`${CODE_OUTPUT_CHROME_CLASS} ${styles.report}`}
      aria-label={t("codeOutput.latex.logs")}
      data-testid="latex-compile-report"
    >
      <div className={styles.header}>
        <span className={styles.title}>
          <FileText size={14} aria-hidden="true" />
          {t("codeOutput.latex.logs")}
        </span>
        <div className={officeDialogParts.tabs} role="group" aria-label={t("codeOutput.latex.logs")}>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={officeDialogParts.tab}
              aria-pressed={!raw && !hidden.has(level)}
              disabled={raw}
              data-testid={`latex-report-filter-${level}`}
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(level)) next.delete(level);
                  else next.add(level);
                  return next;
                })
              }
            >
              {t(LEVEL_LABEL_KEYS[level])}
              <span className={styles.count}>{counts[level]}</span>
            </button>
          ))}
          <button
            type="button"
            className={officeDialogParts.compactButton}
            aria-pressed={raw}
            data-testid="latex-report-raw"
            onClick={() => setRaw((value) => !value)}
          >
            {t("codeOutput.latex.rawLog")}
          </button>
        </div>
      </div>
      {omittedBytes > 0 ? (
        <p role="note" className={officeDialogParts.message} data-testid="latex-report-log-cut">
          {t("codeOutput.latex.logCut", { size: Math.ceil(omittedBytes / 1024) })}
        </p>
      ) : null}
      {raw ? (
        <pre
          className={`${officeDialogParts.well} ${styles.raw}`}
          tabIndex={0}
          aria-label={t("codeOutput.latex.rawLog")}
          data-testid="latex-report-raw-log"
        >
          {logText}
        </pre>
      ) : visible.length === 0 ? (
        <p role="status" className={`${officeDialogParts.message} ${styles.empty}`}>
          {entries.length === 0
            ? t("codeOutput.latex.noEntries")
            : t("codeOutput.latex.filteredEmpty")}
        </p>
      ) : (
        <div
          role="list"
          className={`${officeDialogParts.list} ${styles.entries}`}
          onKeyDown={moveBetweenEntries}
        >
          {visible.map((entry, index) => {
            const location = latexLogEntryLocation(entry, t);
            const content = (
              <>
                <LevelIcon level={entry.level} />
                <span className={styles.message}>
                  {entry.message}
                  {entry.context ? <span className={styles.context}>{entry.context}</span> : null}
                </span>
                <span className={styles.location}>{location}</span>
              </>
            );
            // A file of the project opens at its line; a TeX Live file's
            // entry is only read.
            return entry.inProject && entry.file !== null ? (
              <button
                key={`${entry.level}:${index}`}
                type="button"
                role="listitem"
                className={`${officeDialogParts.listItem} ${styles.entry}`}
                data-level={entry.level}
                data-testid="latex-report-entry"
                title={t("codeOutput.latex.openLocation", {
                  file: entry.file,
                  line: entry.line ?? 1,
                })}
                onClick={() => onOpenEntry(entry)}
              >
                {content}
              </button>
            ) : (
              <div
                key={`${entry.level}:${index}`}
                role="listitem"
                className={`${officeDialogParts.listItem} ${styles.entry}`}
                data-level={entry.level}
                data-testid="latex-report-entry"
                data-static="true"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
      {downloads.length > 0 ? (
        <div className={styles.files} data-testid="latex-report-files">
          <span className={officeDialogParts.label}>{t("codeOutput.latex.outputFiles")}</span>
          {downloads.map((file) => (
            <button
              key={file.name}
              type="button"
              className={`${officeDialogParts.compactButton} ${styles.file}`}
              title={t("codeOutput.latex.download", { file: file.name })}
              aria-label={t("codeOutput.latex.download", { file: file.name })}
              onClick={() => download(file)}
            >
              <Download size={12} aria-hidden="true" />
              {file.name}
            </button>
          ))}
        </div>
      ) : null}
      {downloadFailed ? (
        <p role="alert" className={officeDialogParts.message}>
          {t("toolbar.exportFailed", { format: downloadFailed })}
        </p>
      ) : null}
    </section>
  );
});
