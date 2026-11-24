/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Whether the MR Office component is installed, and fits (src/component.ts).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { componentCandidates, findComponent, shellContract } = require("../dist/component.js");

function fakeComponent(root, manifest) {
  for (const parts of [["runtime", "node"], ["runtime", "python"], ["mrnote", "apps", "api"], ["mrnote", "apps", "web"], ["mrnote", "engine-host"]]) {
    fs.mkdirSync(path.join(root, ...parts), { recursive: true });
  }
  if (manifest) fs.writeFileSync(path.join(root, "component.json"), JSON.stringify(manifest));
}

test("the component is looked for in the variable's folder, the app's resources, then the data folder", () => {
  assert.deepEqual(componentCandidates({ env: "/c", resourcesPath: "/r", userData: "/u" }), ["/c", path.join("/r", "component"), path.join("/u", "component")]);
  assert.deepEqual(componentCandidates({ resourcesPath: null, userData: "/u" }), [path.join("/u", "component")]);
});

test("only a whole component built for this shell, for this computer, is used", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "mroffice-component-"));
  try {
    const good = path.join(folder, "good");
    fakeComponent(good, { version: "1.0.0", contract: "abc", platform: process.platform, arch: process.arch });
    assert.equal(findComponent({ candidates: [path.join(folder, "none"), good], contract: "abc" }).kind, "ready");
    assert.equal(findComponent({ candidates: [path.join(folder, "none")], contract: "abc" }).kind, "absent");

    const other = findComponent({ candidates: [good], contract: "xyz" });
    assert.equal(other.kind, "unusable");
    assert.match(other.reason, /another version/);
    const foreign = findComponent({ candidates: [good], contract: "abc", platform: "win32", arch: "x64" });
    assert.match(foreign.reason, /built for/);

    const bare = path.join(folder, "bare");
    fakeComponent(bare, null);
    assert.match(findComponent({ candidates: [bare], contract: "abc" }).reason, /component\.json/);

    const partial = path.join(folder, "partial");
    fakeComponent(partial, { version: "1.0.0", contract: "abc" });
    fs.rmSync(path.join(partial, "mrnote", "engine-host"), { recursive: true });
    assert.match(findComponent({ candidates: [partial], contract: "abc" }).reason, /incomplete/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("this shell names the contract its component must have", () => {
  const contract = shellContract(path.join(import.meta.dirname, ".."));
  assert.match(contract, /^[0-9a-f]{24}$/);
});
