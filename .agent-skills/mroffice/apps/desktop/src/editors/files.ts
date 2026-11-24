/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Files on this computer: which ones the app opens, reading them for an
 * editor, and writing an editor's saved file back where it came from.
 *
 * No Electron here, so the rules are tested on their own
 * (test/files.test.mjs).
 */

import fs from "node:fs/promises";
import path from "node:path";

const { EDITOR_EXTENSIONS } = require("../../editor-extensions.generated.cjs") as {
  EDITOR_EXTENSIONS: Readonly<Record<string, readonly string[]>>;
};

/** Every extension one of the editors opens (lower case, with the dot;
 * ".mrdoc.json" is one). */
export const OPENABLE_EXTENSIONS: readonly string[] = [...new Set(Object.values(EDITOR_EXTENSIONS).flat())].sort(
  (a, b) => b.length - a.length,
);

/** An editor holds its whole file in memory: past this, a file is not opened. */
export const MAX_OPEN_FILE_BYTES = 256 * 1024 * 1024;
/** At most this many files at once (a drop of a whole folder's contents). */
export const MAX_OPEN_FILES = 50;

/** The file's extension as the editors know it: the longest one they take
 * (".mrdoc.json" before ".json"), else the last one. Lower case. */
export function editorExtension(name: string): string {
  const lower = path.basename(name).toLowerCase();
  return OPENABLE_EXTENSIONS.find((extension) => lower.endsWith(extension) && lower.length > extension.length) ?? path.extname(lower);
}

/** Whether two names are the same kind of file (".mrdoc.json" is a .mrdoc). */
export function sameKind(a: string, b: string): boolean {
  const kind = (name: string) => editorExtension(name).replace(/^(\.mr[a-z]+)\.json$/, "$1");
  return kind(a) === kind(b);
}

export function isOpenablePath(filePath: string): boolean {
  return OPENABLE_EXTENSIONS.includes(editorExtension(filePath));
}

/** The document paths among a process's arguments (a double-click on
 * Windows and Linux, or `MR Office Editors <file>` from a shell). */
export function openablePathsFromArgv(argv: readonly string[], cwd = process.cwd()): string[] {
  return argv
    .filter((argument) => argument && !argument.startsWith("-"))
    .map((argument) => path.resolve(cwd, argument))
    .filter(isOpenablePath);
}

export interface OpenedFile {
  /** What the page names this file by when it saves it back. */
  readonly handle: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface RefusedFile {
  readonly name: string;
  readonly reason: "too-large" | "unreadable" | "not-openable";
}

/** The files for the page, in order, each read whole. */
export async function readOpenedFiles(
  paths: readonly string[],
  issueHandle: (filePath: string) => string,
): Promise<{ files: OpenedFile[]; refused: RefusedFile[] }> {
  const files: OpenedFile[] = [];
  const refused: RefusedFile[] = [];
  for (const filePath of paths.slice(0, MAX_OPEN_FILES)) {
    const name = path.basename(filePath);
    if (!isOpenablePath(filePath)) {
      refused.push({ name, reason: "not-openable" });
      continue;
    }
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("not a file");
      if (stat.size > MAX_OPEN_FILE_BYTES) {
        refused.push({ name, reason: "too-large" });
        continue;
      }
      const data = await fs.readFile(filePath);
      files.push({ handle: issueHandle(filePath), name, bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) });
    } catch {
      refused.push({ name, reason: "unreadable" });
    }
  }
  return { files, refused };
}

/** A file name an editor gave its saved file: a plain name, no folders. */
export function safeFileName(name: unknown, fallback = "Untitled"): string {
  const base = typeof name === "string" ? path.basename(name.replace(/\\/g, "/")) : "";
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : fallback;
}

/**
 * Where a save goes:
 * - "write": back into the file it was opened from (or last saved as), when
 *   the editor saves the same kind of file (a CSV as CSV, a .mrdoc as .mrdoc);
 * - "ask": a Save dialog, starting beside that file with the editor's name
 *   for it: for a new file, for Save As, and when the editor saves another
 *   kind than the file it opened (the document editor opens HTML and
 *   Markdown and saves its own .mrdoc; it never writes over the HTML).
 */
export function saveTarget(
  openedPath: string | null,
  savedName: string,
  options: { saveAs?: boolean; documentsFolder: string },
): { kind: "write"; path: string } | { kind: "ask"; defaultPath: string } {
  const name = safeFileName(savedName);
  if (openedPath && !options.saveAs && sameKind(openedPath, name)) {
    return { kind: "write", path: openedPath };
  }
  const folder = openedPath ? path.dirname(openedPath) : options.documentsFolder;
  return { kind: "ask", defaultPath: path.join(folder, openedPath && sameKind(openedPath, name) ? path.basename(openedPath) : name) };
}

/** Write a file whole: into a hidden file beside it, then renamed over it, so
 * a failed write never leaves half a file. Resolves to false when the file
 * already held exactly these bytes (nothing is written then). */
export async function writeFileAtomically(target: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const current = await fs.readFile(target);
    if (current.byteLength === bytes.byteLength && Buffer.compare(current, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)) === 0) {
      return false;
    }
  } catch {
    // a new file, or one that cannot be read: written below
  }
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.saving`);
  await fs.writeFile(temporary, bytes);
  try {
    // keep the file's permissions where it had its own
    const mode = await fs.stat(target).then((stat) => stat.mode).catch(() => null);
    if (mode !== null) await fs.chmod(temporary, mode & 0o777);
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return true;
}
