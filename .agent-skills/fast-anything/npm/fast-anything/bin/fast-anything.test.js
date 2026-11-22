"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const launcherSrc = path.join(__dirname, "fast-anything.js");

test("launcher runs a platform binary that npm left without the execute bit", {
  skip: process.platform === "win32" ? "Windows has no execute bit" : false,
}, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fa-eacces-"));
  try {
    const plat = `${process.platform}-${process.arch}`;
    const pkgDir = path.join(tmp, "node_modules", `@el4cteo/fast-anything-${plat}`);
    const binDir = path.join(pkgDir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: `@el4cteo/fast-anything-${plat}`, version: "0.0.0" }),
    );

    const marker = path.join(tmp, "ran");
    const fakeBin = path.join(binDir, "fast-anything");
    fs.writeFileSync(fakeBin, `#!/bin/sh\necho ok > '${marker}'\n`);
    fs.chmodSync(fakeBin, 0o644);

    const launchDir = path.join(tmp, "bin");
    fs.mkdirSync(launchDir, { recursive: true });
    const launcher = path.join(launchDir, "fast-anything.js");
    fs.copyFileSync(launcherSrc, launcher);

    const run = spawnSync(process.execPath, [launcher, "--version"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.error?.message || "launcher failed");
    assert.equal(fs.readFileSync(marker, "utf8").trim(), "ok");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
