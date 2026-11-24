/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The editors' pages, served on the loopback address (src/editors/editors-server.ts).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { isOwnHost, servedPath, startEditorsServer } = require("../dist/editors/editors-server.js");

test("only files under the build's folder are served", () => {
  const root = path.resolve("/srv/editors");
  assert.equal(servedPath(root, "/"), path.join(root, "index.html"));
  assert.equal(servedPath(root, "/assets/a.js?v=1"), path.join(root, "assets", "a.js"));
  assert.equal(servedPath(root, "/fonts/Noto%20Sans.woff2"), path.join(root, "fonts", "Noto Sans.woff2"));
  for (const bad of ["/../secret", "/%2e%2e/secret", "/a/../../secret", "/.git/config", "/a%00b", "/a\\b", "/%E0%A4%A"]) {
    assert.equal(servedPath(root, bad), null, bad);
  }
  assert.equal(isOwnHost("127.0.0.1:5000", 5000), true);
  assert.equal(isOwnHost("localhost:5000", 5000), true);
  assert.equal(isOwnHost("attacker.example:5000", 5000), false);
  assert.equal(isOwnHost(undefined, 5000), false);
});

test("the server answers its own host, and keeps its port from one start to the next", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mroffice-editors-root-"));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mroffice-editors-data-"));
  try {
    fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><title>t</title>");
    const first = await startEditorsServer(root, data);
    const page = await fetch(`${first.origin}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.equal((await fetch(`${first.origin}/missing.js`)).status, 404);
    assert.equal((await fetch(`${first.origin}/`, { method: "POST" })).status, 405);
    await first.close();
    const second = await startEditorsServer(root, data);
    assert.equal(second.port, first.port);
    await second.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});
