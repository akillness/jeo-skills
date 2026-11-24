/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// A service's log (src/classic/service-log.ts): a restart appends instead of
// emptying it, and a full one turns over to .1/.2/.3, the oldest dropped.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { openServiceLog } = require("../dist/classic/service-log.js");

const ended = (log) => new Promise((resolve) => { log.end(); setTimeout(resolve, 50); });

test("a restart keeps what the last run wrote", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "service-log-"));
  const first = openServiceLog(dir, "api");
  first.write("before the restart\n");
  await ended(first);
  const second = openServiceLog(dir, "api");
  second.write("after the restart\n");
  await ended(second);
  const text = fs.readFileSync(path.join(dir, "api.log"), "utf8");
  assert.match(text, /before the restart\n[\s\S]*after the restart\n/);
  assert.equal(fs.existsSync(path.join(dir, "api.log.1")), false);
});

test("a full log turns over, at most three old ones kept", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "service-log-"));
  const log = openServiceLog(dir, "web", { maxBytes: 200, keep: 3 });
  for (let i = 0; i < 12; i++) log.write(`${String(i).padStart(2, "0")} ${"x".repeat(90)}\n`);
  await ended(log);
  const names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, ["web.log", "web.log.1", "web.log.2", "web.log.3"]);
  for (const name of names) assert.ok(fs.statSync(path.join(dir, name)).size <= 200, name);
  // the newest lines are in web.log, the ones before them in .1
  assert.match(fs.readFileSync(path.join(dir, "web.log"), "utf8"), /11 x/);
  assert.match(fs.readFileSync(path.join(dir, "web.log.1"), "utf8"), /09 x/);
  // a start on a log already over the size turns it over first
  const again = openServiceLog(dir, "web", { maxBytes: 100, keep: 3 });
  await ended(again);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "web.log"), "utf8"), /x{10}/);
});
