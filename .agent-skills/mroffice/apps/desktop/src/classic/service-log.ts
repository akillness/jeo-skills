/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A service's log file (api.log, web.log, ...): appended to, never emptied
 * on start, so what happened before a restart can still be read; and kept
 * bounded: once it passes `maxBytes` it becomes <name>.log.1 (the older
 * ones .2, .3, ...) and a new one starts, at most `keep` old ones kept.
 *
 * No Electron here, so a plain Node test can drive it.
 */

import fs from "node:fs";
import path from "node:path";

export const SERVICE_LOG_MAX_BYTES = 20 * 1024 * 1024;
export const SERVICE_LOG_KEEP = 3;

export interface ServiceLog {
  readonly file: string;
  write(chunk: Buffer | string): void;
  end(): void;
}

/** <file> -> <file>.1 -> ... -> <file>.<keep>; the oldest beyond `keep` is dropped. */
export function rotateServiceLog(file: string, keep: number = SERVICE_LOG_KEEP): void {
  try {
    fs.rmSync(`${file}.${keep}`, { force: true });
    for (let i = keep - 1; i >= 1; i--) {
      if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
    }
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.1`);
  } catch {
    // A log that cannot be turned over is appended to as it is.
  }
}

export function openServiceLog(
  dir: string,
  name: string,
  options: { maxBytes?: number; keep?: number; now?: () => Date } = {},
): ServiceLog {
  const maxBytes = options.maxBytes ?? SERVICE_LOG_MAX_BYTES;
  const keep = options.keep ?? SERVICE_LOG_KEEP;
  const now = options.now ?? (() => new Date());
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.log`);
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    size = 0;
  }
  if (size >= maxBytes) {
    rotateServiceLog(file, keep);
    size = 0;
  }
  // Opened now, not when the stream gets round to it: a turn-over renames the
  // file this descriptor already holds, and the next one opens a new file.
  const open = () => fs.createWriteStream(file, { fd: fs.openSync(file, "a") });
  let out = open();
  const write = (chunk: Buffer | string) => {
    const bytes = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
    if (size > 0 && size + bytes > maxBytes) {
      out.end();
      rotateServiceLog(file, keep);
      out = open();
      size = 0;
    }
    out.write(chunk);
    size += bytes;
  };
  write(`\n--- ${name} started ${now().toISOString()} ---\n`);
  return { file, write, end: () => out.end() };
}
