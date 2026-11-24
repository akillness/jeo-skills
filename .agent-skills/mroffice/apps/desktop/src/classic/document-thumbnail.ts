/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The picture of its first page an Office file carries (docProps/thumbnail.*:
 * PowerPoint saves one with every deck by default), read straight from the
 * zip without unpacking the rest: the instant view shows a double-clicked
 * deck's first slide with it before anything else has started
 * (./instant-view.ts). No Electron here (its tests run on Node).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024;

/** One stored or deflated member of a zip file, read without unpacking the rest. */
export function readZipMember(file: string, wanted: string, maxBytes = THUMBNAIL_MAX_BYTES): Buffer | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const tailLength = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailLength);
    fs.readSync(fd, tail, 0, tailLength, size - tailLength);
    let end = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) return null;
    const entries = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (directorySize > 16 * 1024 * 1024 || directoryOffset + directorySize > size) return null;
    const directory = Buffer.alloc(directorySize);
    fs.readSync(fd, directory, 0, directorySize, directoryOffset);
    let at = 0;
    for (let n = 0; n < entries && at + 46 <= directory.length; n++) {
      if (directory.readUInt32LE(at) !== 0x02014b50) return null;
      const method = directory.readUInt16LE(at + 10);
      const compressed = directory.readUInt32LE(at + 20);
      const uncompressed = directory.readUInt32LE(at + 24);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const localOffset = directory.readUInt32LE(at + 42);
      const name = directory.toString("utf8", at + 46, at + 46 + nameLength);
      at += 46 + nameLength + extraLength + commentLength;
      if (name !== wanted) continue;
      if (compressed > maxBytes || uncompressed > maxBytes) return null;
      const local = Buffer.alloc(30);
      fs.readSync(fd, local, 0, 30, localOffset);
      if (local.readUInt32LE(0) !== 0x04034b50) return null;
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const data = Buffer.alloc(compressed);
      fs.readSync(fd, data, 0, compressed, dataStart);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: maxBytes });
      return null;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

const OOXML_EXTENSIONS = new Set([".pptx", ".ppsx", ".potx", ".pptm", ".docx", ".dotx", ".xlsx", ".xltx"]);

/** The picture of a document's first page the file carries (docProps/thumbnail.*), or null. */
export function documentThumbnail(file: string): { bytes: Buffer; type: string } | null {
  if (!OOXML_EXTENSIONS.has(path.extname(file).toLowerCase())) return null;
  for (const [member, type] of [
    ["docProps/thumbnail.jpeg", "image/jpeg"],
    ["docProps/thumbnail.jpg", "image/jpeg"],
    ["docProps/thumbnail.png", "image/png"],
  ] as const) {
    const bytes = readZipMember(file, member);
    if (bytes && bytes.length > 0) return { bytes, type };
  }
  return null;
}

/** The documents the instant view shows the first page of: the kinds the app
 * opens as pages (never a file it cannot open). */
const INSTANT_DOCUMENT_EXTENSIONS = new Set([...OOXML_EXTENSIONS, ".pdf"]);

export function instantDocument(file: string): boolean {
  return INSTANT_DOCUMENT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/**
 * macOS: the first page as Quick Look draws it (qlmanage -t, the Finder's own
 * thumbnails: a Word document's, a workbook's or a PDF's page 1, 0.3-1.3 s),
 * written to `dir` and read back; null on any failure, past `timeoutMs`, or
 * elsewhere. For a file that carries no picture of itself.
 */
export function quickLookThumbnail(
  file: string,
  dir: string,
  options: { size?: number; timeoutMs?: number; qlmanage?: string } = {},
): Promise<{ bytes: Buffer; type: string } | null> {
  const tool = options.qlmanage ?? "/usr/bin/qlmanage";
  if (process.platform !== "darwin" && !options.qlmanage) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      resolve(null);
      return;
    }
    const out = path.join(dir, `${path.basename(file)}.png`);
    fs.rmSync(out, { force: true });
    execFile(
      tool,
      ["-t", "-s", String(options.size ?? 1400), "-o", dir, file],
      { timeout: options.timeoutMs ?? 3000, windowsHide: true },
      () => {
        try {
          const bytes = fs.readFileSync(out);
          fs.rmSync(out, { force: true });
          resolve(bytes.length > 0 && bytes.length <= THUMBNAIL_MAX_BYTES ? { bytes, type: "image/png" } : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}
