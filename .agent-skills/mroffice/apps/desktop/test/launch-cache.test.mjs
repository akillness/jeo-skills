/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The launch cache's check at a launch (src/classic/launch-cache.ts): the
// first screen's data the API kept at the last quit is handed to the web
// server only when the database files are exactly as the API left them and
// the key (version, web build, product, account) is this launch's; else it
// is deleted. The fingerprint is the API's (app/desktop/launch_cache.py):
// both are held to the same vector.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { databaseFingerprint, launchCacheKey, usableLaunchCache } = require("../dist/classic/launch-cache.js");

function dataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-cache-"));
  fs.writeFileSync(path.join(dir, "mrai.db"), Buffer.alloc(200_000, 7));
  fs.writeFileSync(path.join(dir, "mrai.db-wal"), "wal");
  return dir;
}

function keep(dir, key, fingerprint = databaseFingerprint(dir)) {
  fs.mkdirSync(path.join(dir, "launch-cache"), { recursive: true });
  const file = path.join(dir, "launch-cache", "first-screen.json");
  fs.writeFileSync(file, JSON.stringify({ format: 1, key, fingerprint, entries: [] }));
  return file;
}

test("the fingerprint is the API's for the same files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-cache-vector-"));
  fs.writeFileSync(path.join(dir, "mrai.db"), Buffer.from(Array.from({ length: 70_000 }, (_, i) => i % 251)));
  fs.writeFileSync(path.join(dir, "mrai.db-wal"), "wal");
  fs.utimesSync(path.join(dir, "mrai.db"), 1_700_000_000, 1_700_000_000);
  fs.utimesSync(path.join(dir, "mrai.db-wal"), 1_700_000_001, 1_700_000_001);
  // apps/api/tests/desktop/test_launch_cache.py: test_the_fingerprint_is_the_shells
  assert.equal(databaseFingerprint(dir), "4f472db29a1d895a2360b7552f8856ec3a4a338864485bdc2f7456d54eebdd69");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an emptied log and its index count as no log: their removal as the last connection closes is no change", () => {
  const dir = dataDir();
  fs.writeFileSync(path.join(dir, "mrai.db-wal"), "");
  fs.writeFileSync(path.join(dir, "mrai.db-shm"), "index");
  const file = keep(dir, "k");
  fs.rmSync(path.join(dir, "mrai.db-wal"));
  fs.rmSync(path.join(dir, "mrai.db-shm"));
  assert.equal(usableLaunchCache(dir, "k"), file);
  fs.appendFileSync(path.join(dir, "mrai.db-wal"), "a frame");
  assert.equal(usableLaunchCache(dir, "k"), null, "a log holding data is a change");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a cache kept with this launch's key over the files as they are is used", () => {
  const dir = dataDir();
  const file = keep(dir, "v1|b|office|a");
  assert.equal(usableLaunchCache(dir, "v1|b|office|a"), file);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a database written since, in its middle, its end, or by a new -shm, is not used and the cache is deleted", () => {
  for (const change of [
    (dir) => { const fd = fs.openSync(path.join(dir, "mrai.db"), "r+"); fs.writeSync(fd, Buffer.from("x"), 0, 1, 100_000); fs.closeSync(fd); },
    (dir) => fs.appendFileSync(path.join(dir, "mrai.db-wal"), "more"),
    (dir) => fs.writeFileSync(path.join(dir, "mrai.db-shm"), "shm"),
    (dir) => { const at = new Date(Date.now() + 5_000); fs.utimesSync(path.join(dir, "mrai.db"), at, at); },
  ]) {
    const dir = dataDir();
    const file = keep(dir, "k");
    change(dir);
    assert.equal(usableLaunchCache(dir, "k"), null);
    assert.equal(fs.existsSync(file), false, "deleted");
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("another version, web build, product or account is not used", () => {
  const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-cache-web-"));
  fs.mkdirSync(path.join(webDir, ".next"));
  fs.writeFileSync(path.join(webDir, ".next", "BUILD_ID"), "build-1\n");
  const key = launchCacheKey("0.1.3", webDir, "office", "a@b.c");
  assert.notEqual(key, launchCacheKey("0.1.4", webDir, "office", "a@b.c"));
  assert.notEqual(key, launchCacheKey("0.1.3", webDir, "classic", "a@b.c"));
  assert.notEqual(key, launchCacheKey("0.1.3", webDir, "office", "x@b.c"));
  assert.notEqual(key, launchCacheKey("0.1.3", webDir, "office", null));
  fs.writeFileSync(path.join(webDir, ".next", "BUILD_ID"), "build-2\n");
  assert.notEqual(key, launchCacheKey("0.1.3", webDir, "office", "a@b.c"));
  const dir = dataDir();
  keep(dir, key);
  assert.equal(usableLaunchCache(dir, launchCacheKey("0.1.3", webDir, "office", "a@b.c")), null);
  assert.equal(usableLaunchCache(dir, key), null, "deleted the first time");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(webDir, { recursive: true, force: true });
});
