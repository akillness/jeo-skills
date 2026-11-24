/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The documents the desktop app opens, and what it hands the page for them.
 * The same rows the site lists for Open With (apps/web/lib/app-manifest.ts):
 * Word, Excel, PowerPoint, PDF, Markdown and CSV. A file is read only after
 * the page asks for it, from the app's own origin, and never more than the
 * site's import limit in one go.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface OpenableType {
  readonly extensions: readonly string[];
  readonly mimeType: string;
  /** The Windows ProgID / the macOS document type name. */
  readonly name: string;
  readonly description: string;
}

export const OPENABLE_TYPES: readonly OpenableType[] = [
  {
    extensions: [".docx", ".docm"],
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    name: "MROfficeEditors.Document",
    description: "Word Document",
  },
  {
    extensions: [".xlsx", ".xls"],
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    name: "MROfficeEditors.Workbook",
    description: "Excel Workbook",
  },
  {
    // PowerPoint's presentation, macro-enabled presentation, template and
    // show (and their 97-2003 binaries), OpenDocument and OpenOffice.org
    // Impress, and WPS Presentation: each imports as a deck
    // (document-types.cjs lists the same for the packages' associations).
    extensions: [
      ".pptx", ".pptm", ".potx", ".potm", ".ppsx", ".ppsm", ".ppt", ".pps", ".pot",
      ".odp", ".otp", ".sxi", ".fodp", ".dps", ".dpt",
    ],
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    name: "MROfficeEditors.Presentation",
    description: "PowerPoint Presentation",
  },
  {
    extensions: [".pdf"],
    mimeType: "application/pdf",
    name: "MROfficeEditors.PDF",
    description: "PDF Document",
  },
  {
    extensions: [".md", ".markdown"],
    mimeType: "text/markdown",
    name: "MROfficeEditors.Markdown",
    description: "Markdown Document",
  },
  {
    extensions: [".csv", ".tsv"],
    mimeType: "text/csv",
    name: "MROfficeEditors.CSV",
    description: "CSV Table",
  },
];

/** The site's own limit for one import request (apps/web lib/page-file-import.ts):
 * files read whole and handed to the page together stay within it. */
export const MAX_OPEN_BYTES = 100 * 1024 * 1024;
export const MAX_OPEN_FILES = 20;
/** A larger file is not read here: the page uploads it in parts, asking the
 * app for each part as it sends it (`readOpenFilePart`). */
export const MAX_WHOLE_OPEN_FILE_BYTES = 32 * 1024 * 1024;
/** The largest part the page may ask for at once. */
export const MAX_OPEN_FILE_PART_BYTES = 64 * 1024 * 1024;

/** The type each file is handed to the page with, where it is not its row's. */
const OWN_MIME_TYPES: Readonly<Record<string, string>> = {
  ".xls": "application/vnd.ms-excel",
  ".docm": "application/vnd.ms-word.document.macroenabled.12",
  ".tsv": "text/tab-separated-values",
  ".pptm": "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  ".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
  ".potm": "application/vnd.ms-powerpoint.template.macroenabled.12",
  ".ppsx": "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  ".ppsm": "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pps": "application/vnd.ms-powerpoint",
  ".pot": "application/vnd.ms-powerpoint",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".otp": "application/vnd.oasis.opendocument.presentation-template",
  ".sxi": "application/vnd.sun.xml.impress",
  ".fodp": "application/vnd.oasis.opendocument.presentation-flat-xml",
  ".dps": "application/wps-office.dps",
  ".dpt": "application/wps-office.dpt",
};

const MIME_BY_EXTENSION = new Map<string, string>();
for (const type of OPENABLE_TYPES) {
  for (const extension of type.extensions) {
    MIME_BY_EXTENSION.set(extension, OWN_MIME_TYPES[extension] ?? type.mimeType);
  }
}

export function isOpenablePath(filePath: string): boolean {
  return MIME_BY_EXTENSION.has(path.extname(filePath).toLowerCase());
}

/** The document paths among a process's arguments (Windows passes them so). */
export function openablePathsFromArgv(argv: readonly string[]): string[] {
  return argv.filter(
    (argument) =>
      !argument.startsWith("-") && path.isAbsolute(argument) && isOpenablePath(argument),
  );
}

export interface OpenedFile {
  readonly name: string;
  readonly type: string;
  readonly lastModified: number;
  readonly size: number;
  /** The bytes, for a file read whole. */
  readonly data?: Uint8Array;
  /** For a larger file: what the page names it by to read its parts. */
  readonly token?: string;
  /** MR Note Classic: what the page sends in place of the bytes, for its
   * API to read the file where it is (classic/local-files.ts). */
  readonly localToken?: string;
  /** MR Note Classic: the page this file became, the file unchanged since. */
  readonly existingPage?: { readonly pageId: string; readonly notebookId: string };
}

/**
 * The files for the page, in order. Small files are read whole (together
 * within the import limit); a larger one, or one past that limit, is handed
 * over as a token the page reads part by part, so no file is too large to
 * open and none is held in memory whole.
 */
export async function readOpenedFiles(
  paths: readonly string[],
  issueToken: (filePath: string, size: number) => string,
  describe?: (filePath: string, stat: { size: number; mtimeMs: number }) => Promise<Partial<OpenedFile>>,
): Promise<OpenedFile[]> {
  const files: OpenedFile[] = [];
  let total = 0;
  for (const filePath of paths.slice(0, MAX_OPEN_FILES)) {
    if (!isOpenablePath(filePath)) continue;
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      const described = {
        name: path.basename(filePath),
        type: MIME_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) ?? "",
        lastModified: Math.round(stat.mtimeMs),
        size: stat.size,
        ...(describe ? await describe(filePath, stat) : {}),
      };
      if (stat.size > MAX_WHOLE_OPEN_FILE_BYTES || total + stat.size > MAX_OPEN_BYTES) {
        files.push({ ...described, token: issueToken(filePath, stat.size) });
        continue;
      }
      const data = await fs.readFile(filePath);
      total += data.byteLength;
      files.push({
        ...described,
        size: data.byteLength,
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      });
    } catch {
      // A file that moved or cannot be read is left out; the page says so.
    }
  }
  return files;
}

/** Bytes ``start``..``end`` of an opened file (fewer at its end). */
export async function readOpenFilePart(
  filePath: string,
  start: number,
  end: number,
): Promise<Uint8Array> {
  const length = Math.max(0, Math.min(end - start, MAX_OPEN_FILE_PART_BYTES));
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  } finally {
    await handle.close();
  }
}
