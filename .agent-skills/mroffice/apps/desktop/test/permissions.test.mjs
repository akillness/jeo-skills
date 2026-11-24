/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Which web permissions the app grants (src/permissions.ts).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { allowPermission } = require("../dist/permissions.js");
const SITE = "https://mr-note.com";
const page = `${SITE}/app/notebooks/1`;
const allow = (query) => allowPermission(query, SITE);

test("the site gets what its editors use", () => {
  for (const permission of ["clipboard-read", "clipboard-sanitized-write", "notifications", "display-capture", "local-fonts", "fullscreen"]) {
    assert.equal(allow({ permission, requesting: page, topLevel: page }), true, permission);
  }
  assert.equal(allow({ permission: "media", requesting: page, topLevel: page, mediaTypes: ["audio", "video"] }), true);
  assert.equal(allow({ permission: "openExternal", requesting: page, topLevel: page, externalUrl: "mailto:a@b.c" }), true);
});

test("nothing else, and nobody else", () => {
  for (const permission of ["geolocation", "hid", "serial", "usb", "midi", "idle-detection"]) {
    assert.equal(allow({ permission, requesting: page, topLevel: page }), false, permission);
  }
  assert.equal(allow({ permission: "openExternal", requesting: page, topLevel: page, externalUrl: "smb://host/x" }), false);
  // Another site in the window (Stripe's checkout), or no page at all.
  assert.equal(allow({ permission: "clipboard-read", requesting: "https://checkout.stripe.com/", topLevel: "https://checkout.stripe.com/" }), false);
  assert.equal(allow({ permission: "fullscreen", requesting: "file:///x", topLevel: "file:///x" }), false);
  // A frame of another origin inside the site: only what Chrome grants anyone.
  const frame = "https://sandbox.example/window";
  assert.equal(allow({ permission: "fullscreen", requesting: frame, topLevel: page }), true);
  assert.equal(allow({ permission: "media", requesting: frame, topLevel: page, mediaTypes: ["audio"] }), false);
  assert.equal(allow({ permission: "clipboard-read", requesting: frame, topLevel: page }), false);
});

test("notifications stay off until the person turns them on, as in a browser", () => {
  const ask = { permission: "notifications", requesting: page, topLevel: page };
  assert.equal(allow({ ...ask, kind: "check" }), false);
  assert.equal(allow({ ...ask, kind: "request" }), true);
  assert.equal(allow({ ...ask, kind: "check", notificationsAllowed: true }), true);
});
