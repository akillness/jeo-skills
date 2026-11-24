/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Where a navigation may go (src/editors/navigation.ts).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { classifyNavigation, classifyWindowOpen } = require("../dist/editors/navigation.js");
const ORIGIN = "http://127.0.0.1:51234";

test("only the editors' pages load in the app; web links go to the browser", () => {
  assert.equal(classifyNavigation(`${ORIGIN}/`, ORIGIN).kind, "app");
  assert.equal(classifyNavigation("http://localhost:51234/", ORIGIN).kind, "external");
  assert.equal(classifyNavigation("https://mroffice.ai/", ORIGIN).kind, "external");
  assert.equal(classifyNavigation("mailto:a@b.c", ORIGIN).kind, "external");
  for (const url of ["file:///etc/hosts", "javascript:alert(1)", "data:text/html,x", "other-app://x", "not a url"]) {
    assert.equal(classifyNavigation(url, ORIGIN).kind, "block", url);
  }
});

test("a page may open a blank popup, links open in the browser, nothing else opens", () => {
  assert.equal(classifyWindowOpen("about:blank", ORIGIN).kind, "popup");
  assert.equal(classifyWindowOpen("", ORIGIN).kind, "popup");
  assert.equal(classifyWindowOpen("https://example.com/", ORIGIN).kind, "external");
  assert.equal(classifyWindowOpen(`${ORIGIN}/`, ORIGIN).kind, "block");
  assert.equal(classifyWindowOpen("file:///etc/hosts", ORIGIN).kind, "block");
});
