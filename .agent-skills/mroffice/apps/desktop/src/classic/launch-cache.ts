/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The launch cache (MR Office / Classic): the first screen's data before the
 * API has started.
 *
 * At a normal quit the API keeps its answers to the first screen's reads
 * (apps/api/app/desktop/launch_cache.py), with the database files'
 * fingerprint and this shell's key. At the next launch, before the API is
 * started, the cache is handed to the web server (MRAI_DESKTOP_LAUNCH_CACHE,
 * apps/web/desktop-api-relay.mjs answers those reads with it until the API
 * takes connections) only when:
 *
 *  - its key is this launch's: the app's version, the web build, the product
 *    and the signed-in account (a new version, another account: deleted);
 *  - the database files are exactly as the API left them: mrai.db, -wal and
 *    -shm (the last two while the log holds anything: the API empties it as
 *    it ends), each its size, modification time and a hash of its first and
 *    last 64 KiB (any write since, a crash's included: deleted).
 *
 * Otherwise it is deleted. No Electron here (tests run it in plain Node).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LAUNCH_CACHE_DIR = "launch-cache";
export const LAUNCH_CACHE_FILE = "first-screen.json";
const DB_FILES = ["mrai.db", "mrai.db-wal", "mrai.db-shm"] as const;
const FORMAT = 1;
const EDGE = 65536;

/** The database files as they are; the same string as the API's ``fingerprint``. */
export function databaseFingerprint(dataDir: string): string {
  const parts: string[] = [];
  // As the API's: -wal and -shm count only while the log holds anything.
  let logHoldsData = false;
  try {
    logHoldsData = fs.statSync(path.join(dataDir, "mrai.db-wal")).size > 0;
  } catch {
    logHoldsData = false;
  }
  for (const name of logHoldsData ? DB_FILES : DB_FILES.slice(0, 1)) {
    const file = path.join(dataDir, name);
    let stat: fs.BigIntStats;
    try {
      stat = fs.statSync(file, { bigint: true });
    } catch {
      parts.push(`${name}:-`);
      continue;
    }
    const size = Number(stat.size);
    const digest = createHash("sha256");
    const handle = fs.openSync(file, "r");
    try {
      const head = Buffer.alloc(Math.min(EDGE, size));
      fs.readSync(handle, head, 0, head.length, 0);
      digest.update(head);
      if (size > EDGE) {
        const tail = Buffer.alloc(EDGE);
        fs.readSync(handle, tail, 0, EDGE, size - EDGE);
        digest.update(tail);
      }
    } finally {
      fs.closeSync(handle);
    }
    parts.push(`${name}:${size}:${stat.mtimeNs}:${digest.digest("hex")}`);
  }
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** This launch's key: the app's version, the web build, the product, the account. */
export function launchCacheKey(version: string, webDir: string, product: string, accountEmail: string | null): string {
  let build = "";
  try {
    build = fs.readFileSync(path.join(webDir, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // An unbuilt (development) web app: its key never matches a built one's.
    build = "development";
  }
  const account = createHash("sha256").update(accountEmail ?? "").digest("hex").slice(0, 16);
  return `${version}|${build}|${product}|${account}`;
}

/**
 * The cache's file when it may be used at this launch, else null (and it is
 * deleted). Called before the API starts.
 */
export function usableLaunchCache(dataDir: string, key: string): string | null {
  const file = path.join(dataDir, LAUNCH_CACHE_DIR, LAUNCH_CACHE_FILE);
  let head: { format?: unknown; key?: unknown; fingerprint?: unknown };
  try {
    head = JSON.parse(fs.readFileSync(file, "utf8")) as typeof head;
  } catch {
    return null;
  }
  if (head.format === FORMAT && head.key === key && head.fingerprint === databaseFingerprint(dataDir)) return file;
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Read-only: the web server is not handed it either way.
  }
  return null;
}
