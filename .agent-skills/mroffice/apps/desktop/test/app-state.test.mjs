/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// An app's window as the AI reads it (src/classic/app-state.ts): the outline,
// what changed since the last read, the wait until the window is still, and
// the app a name means. And the Windows scripts are whole (agent-apps-win.ts).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const state = require("../dist/classic/app-state.js");
const { winScript, WIN_OPS } = require("../dist/classic/agent-apps-win.js");

const geometry = { x: 100, y: 50, w: 400, h: 300, pictureWidth: 800, pictureHeight: 600 };
const window = [
  { id: 1, d: 0, role: "Window", label: "Chat", x: 100, y: 50, w: 400, h: 300 },
  { id: 2, d: 1, role: "TextField", placeholder: "Message", x: 120, y: 300, w: 300, h: 20, actions: ["set_value"], flags: ["focused"] },
  { id: 3, d: 1, role: "Button", label: "发送", x: 430, y: 300, w: 50, h: 20, actions: ["press"] },
  { id: 4, d: 1, role: "TextArea", value: "line one\nline two", x: 120, y: 80, w: 360, h: 200 },
];

test("each element is a line with its id, what it offers and where it is in the window's picture", () => {
  const lines = state.renderTree(window, geometry);
  assert.equal(lines[0], '[1] Window "Chat"');
  assert.equal(lines[1], '  [2] TextField placeholder="Message" (set_value) {focused} @340,520');
  assert.equal(lines[2], '  [3] Button "发送" (press) @710,520');
  // A text keeps its lines.
  assert.equal(lines[3], '  [4] TextArea value="line one\\nline two" @400,260');
  assert.deepEqual(state.pictureToScreen(geometry, 710, 520), { x: 455, y: 310 });
  assert.deepEqual(state.pictureSize(1000, 500, 2), { width: 1568, height: 784 });
  assert.deepEqual(state.pictureSize(400, 300, 2), { width: 800, height: 600 });
});

test("a second read of the same window says only what changed, the whole when asked or when most changed", () => {
  const before = state.snapshotOf(window);
  const after = [
    window[0],
    { ...window[1], value: "hi", placeholder: undefined },
    window[2],
    window[3],
    { id: 5, d: 1, role: "StaticText", label: "已发送", x: 120, y: 250, w: 100, h: 20 },
  ];
  const changed = state.treeAnswer(after, geometry, before);
  assert.equal(changed.diff, true);
  assert.deepEqual(changed.lines, [
    '~   [2] TextField value="hi" (set_value) {focused} @340,520',
    '+   [5] StaticText "已发送" @140,420',
  ]);
  const gone = state.treeAnswer([window[0], window[1], window[3]], geometry, before);
  assert.deepEqual(gone.lines, ['- [3] Button "发送"']);
  assert.equal(state.treeAnswer(after, geometry, before, { full: true }).diff, false);
  assert.equal(state.treeAnswer(after, geometry, null).diff, false);
  const rebuilt = [window[0], ...[6, 7, 8, 9].map((id) => ({ id, d: 1, role: "Button", label: `b${id}` }))];
  assert.equal(state.treeAnswer(rebuilt, geometry, before).diff, false, "most of it changed: the whole outline");
  assert.deepEqual(state.treeAnswer(window, geometry, before).lines, []);
});

test("after a step the window is read until it is still: about a second, up to five while it loads", async () => {
  let clock = 0;
  const options = { now: () => clock, sleep: async (ms) => { clock += ms; } };
  // Still from the start: done after the minimum second.
  let reads = 0;
  const quiet = await state.settle(async () => { reads += 1; return { nodes: window }; }, options);
  assert.equal(quiet.settled, true);
  assert.ok(quiet.waitedMs >= 1000 && quiet.waitedMs < 1700, String(quiet.waitedMs));
  assert.ok(reads >= 2);
  // Loading (a progress indicator) keeps it waiting, to the five-second limit.
  clock = 0;
  const loading = await state.settle(async () => ({ nodes: [...window, { id: 9, d: 1, role: "ProgressIndicator" }] }), options);
  assert.equal(loading.settled, false);
  assert.ok(loading.waitedMs >= 5000 && loading.waitedMs < 5400, String(loading.waitedMs));
  // A window that changes for two seconds, then stops.
  clock = 0;
  let count = 0;
  const growing = await state.settle(async () => ({ nodes: clock < 2000 ? [...window, { id: 10, d: 1, role: "StaticText", label: String(count++) }] : window }), options);
  assert.equal(growing.settled, true);
  assert.ok(growing.waitedMs >= 2000 && growing.waitedMs < 3000, String(growing.waitedMs));
  assert.equal(state.looksBusy([{ id: 1, d: 0, role: "StaticText", label: "正在加载…" }]), true);
});

test("an app is found by its name in any case and spacing, its id or path, then by a near name, running ones first", () => {
  const apps = [
    { name: "NetEaseMusic", names: ["网易云音乐"], id: "com.netease.163music", running: true },
    { name: "Microsoft Word", id: "com.microsoft.Word", running: false, lastUsed: "2026-11-01" },
    { name: "Notepad", names: ["notepad"], id: "C:\\Windows\\notepad.exe", path: "C:\\Windows\\notepad.exe", running: true },
    { name: "Music", id: "com.apple.Music", running: false },
  ];
  assert.equal(state.matchApp("网易云音乐", apps).app.name, "NetEaseMusic");
  assert.equal(state.matchApp("microsoft  word", apps).matched, "exact");
  assert.equal(state.matchApp("COM.MICROSOFT.WORD", apps).matched, "id");
  assert.equal(state.matchApp("notepad.exe", apps).app.name, "Notepad");
  assert.equal(state.matchApp("c:\\windows\\notepad.exe", apps).matched, "id");
  const near = state.matchApp("word", apps);
  assert.equal(near.app.name, "Microsoft Word");
  assert.equal(near.matched, "near");
  assert.equal(state.matchApp("music", apps).app.name, "Music", "an exact name wins over a running near one");
  assert.equal(state.matchApp("x", apps), null);
  assert.equal(state.matchApp("Photoshop", apps), null);
});

test("each Windows step is one whole script: the C#, the request as data, an answer even when it fails", () => {
  assert.deepEqual(WIN_OPS.sort(), ["act", "apps", "locked", "shot", "state"]);
  const text = "it's \"quoted\" $(rm -rf) `n 你好 @'\n'@";
  const script = winScript("act", { op: "type", text, target: { name: "Notepad" } });
  // The request travels as base64, never as script text.
  assert.ok(!script.includes("rm -rf"));
  assert.ok(script.includes(Buffer.from(JSON.stringify({ op: "type", text, target: { name: "Notepad" } })).toString("base64")));
  for (const op of WIN_OPS) {
    const body = winScript(op, {});
    assert.match(body, /Add-Type -ReferencedAssemblies UIAutomationClient/);
    assert.match(body, /public static class MraiApps/);
    assert.equal((body.match(/@'/g) ?? []).length, 1);
    assert.match(body, /\n'@\n/);
    assert.match(body, /catch \{\n {2}Out-Answer/);
  }
  assert.throws(() => winScript("format_disk", {}));
});
