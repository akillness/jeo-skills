/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// The web server's port stays the same across launches (src/classic/web-port.ts):
// a page's storage, AutoRecover's drafts included, belongs to its origin.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { chooseWebPort, lastWebServerHolds, parseLastWebServer, portsAvoiding } = require("../dist/classic/web-port.js");

test("the remembered port is used, and a first launch remembers its own", async () => {
  assert.deepEqual(await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => true }),
    { port: 57102, remembered: true, remember: 57102 });
  assert.deepEqual(await chooseWebPort({ remembered: 0, fresh: 60001, isFree: async () => true }),
    { port: 60001, remembered: false, remember: 60001 });
});

test("a remembered port still held by the last launch's server is waited for", async () => {
  let looks = 0;
  const choice = await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => ++looks >= 3, sleep: async () => {} });
  assert.deepEqual(choice, { port: 57102, remembered: true, remember: 57102 });
});

test("a port held for good is passed over for this launch only, never forgotten", async () => {
  const choice = await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => false, waitMs: 0, sleep: async () => {} });
  assert.deepEqual(choice, { port: 60001, remembered: false, remember: 57102 });
});

test("the launch's other ports are picked around the remembered one", async () => {
  // Before, an API port that happened to be 57102 made the app write its
  // fresh web port over the remembered one: every draft on the old origin
  // was out of reach from then on.
  const extra = [61000, 61001];
  const ports = await portsAvoiding([57102, 60001, 60001, 60003, 60004], 57102, async () => extra.shift());
  assert.deepEqual(ports, [61000, 60001, 61001, 60003, 60004]);
});

test("a remembered port another program holds is passed over at once, not waited for", async () => {
  // Every launch waited 10 s while another program kept the port.
  let looks = 0;
  const gone = lastWebServerHolds({ pid: 4242, port: 57102 }, 57102, () => false);
  const choice = await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => (++looks, false), heldByLastLaunch: gone, sleep: async () => {} });
  assert.deepEqual(choice, { port: 60001, remembered: false, remember: 57102 });
  assert.equal(looks, 1);
  // The last launch's server served another port (a temporary origin): not it.
  assert.equal(lastWebServerHolds({ pid: 4242, port: 60009 }, 57102, () => true)(), false);
});

test("the last launch's server still on the port is waited for, and with no record the port is too", async () => {
  let looks = 0;
  const leaving = lastWebServerHolds({ pid: 4242, port: 57102 }, 57102, () => true);
  assert.deepEqual(await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => ++looks >= 3, heldByLastLaunch: leaving, sleep: async () => {} }),
    { port: 57102, remembered: true, remember: 57102 });
  looks = 0;
  assert.deepEqual(await chooseWebPort({ remembered: 57102, fresh: 60001, isFree: async () => ++looks >= 3, heldByLastLaunch: lastWebServerHolds(null, 57102, () => false), sleep: async () => {} }),
    { port: 57102, remembered: true, remember: 57102 });
});

test("the last launch's record is read back, and nothing else is taken for one", () => {
  assert.deepEqual(parseLastWebServer(JSON.stringify({ pid: 4242, port: 57102 })), { pid: 4242, port: 57102 });
  for (const text of ["", "{", JSON.stringify({ pid: -1, port: 57102 }), JSON.stringify({ pid: 4242, port: 80 }), "null"]) {
    assert.equal(parseLastWebServer(text), null);
  }
});
