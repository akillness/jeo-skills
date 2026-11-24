/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// "Ready in the background at login" (src/classic/prelaunch.ts): the login
// launch is told apart by its argument, and the macOS LaunchAgent opens the
// app through Launch Services, hidden, with that argument, and nothing else.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { BACKGROUND_ARG, launchedInBackground, launchAgentPlist, agentLabel, prelaunchWanted } = require("../dist/classic/prelaunch-agent.js");

test("a launch with the login's argument starts in the background, any other does not", () => {
  assert.equal(launchedInBackground(["/Applications/MR Office.app/Contents/MacOS/MR Office", BACKGROUND_ARG]), true);
  assert.equal(launchedInBackground(["/Applications/MR Office.app/Contents/MacOS/MR Office", "/Users/x/a.pptx"]), false);
  assert.equal(launchedInBackground(["electron", "dist/classic/main.js"]), false);
});

test("the LaunchAgent opens the app hidden in the background, at login, by its bundle", () => {
  const plist = launchAgentPlist("ai.mroffice.editors.oss", "/Applications/MR Office & Co.app");
  assert.equal(agentLabel("ai.mroffice.editors.oss"), "ai.mroffice.editors.oss.prelaunch");
  assert.match(plist, /<key>Label<\/key>\s*<string>ai\.mroffice\.editors\.oss\.prelaunch<\/string>/);
  const args = [...plist.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]).slice(1, -1);
  assert.deepEqual(args, ["/usr/bin/open", "-g", "-j", "-a", "/Applications/MR Office &amp; Co.app", "--args", BACKGROUND_ARG]);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>LimitLoadToSessionType<\/key>\s*<string>Aqua<\/string>/);
});

test("on by default (owner, 2026-11-15): only the person's own \"off\" keeps it off", () => {
  assert.equal(prelaunchWanted(undefined), true); // a fresh install, or one that never set it
  assert.equal(prelaunchWanted(true), true);
  assert.equal(prelaunchWanted(false), false);
});
