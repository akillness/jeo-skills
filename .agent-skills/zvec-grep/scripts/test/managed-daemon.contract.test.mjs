// Contract tests for the managed zvec daemon (scripts/managed-daemon/main.mjs).
//
// Contract under test (offline, existing-index-only incremental refresh):
//   * refresh NEVER creates an index, a manifest, a `.zvec-grep` directory or any
//     other workspace state when the index is missing, partial, disabled or
//     deleted underneath it (existence is decided under the package write lock);
//   * refresh and search-time work NEVER touch the network (no model download,
//     no remote embedding) and never leak credentials;
//   * failures (missing model, corrupt/partial/interrupted index, lock held by
//     another writer) leave the index bytes alone, never trigger a rebuild, and
//     surface as a background `warning` that a later success clears;
//   * a genuine local refresh of an existing index picks up added, modified and
//     deleted files, offline, from a model that is already on disk.
//
// Every process runs in a disposable HOME/ZVEC_GREP_HOME/model cache/workspace
// under the OS temp dir with the network tripwire preloaded and, on macOS, the
// kernel sandbox denying outbound network and writes to the real HOME and repo.
// Run: node --test .agent-skills/zvec-grep/scripts/test/
import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  DAEMON_MAIN, EXISTING_INDEX_MODULE, FIXTURE_FILES, LOCAL_MODEL, OS_SANDBOX_AVAILABLE,
  buildLocalIndex, createSandbox, defaultTokenPath, trustRegistryPath, trustRoot, diffFingerprints, fingerprintTree, ftsHits, indexArtifacts,
  inspectStates, installedPackageDir, kernelDeniesOutbound, listenerPid, localModelArtifactAvailable, realStateFingerprint,
  mcpSearch, realZg, sleep, startDaemon, zg,
} from "./harness.mjs";

const HAVE_ZG = Boolean(realZg());
const HAVE_MODEL = localModelArtifactAvailable();
const NEEDS_LOCAL_INDEX = (!HAVE_ZG || !HAVE_MODEL) && "installed zg 0.2.2 and an already-downloaded local model artifact are required";
const SLOW = { timeout: 240_000 };

// The managed daemon is macOS-only by contract (it needs a kernel egress boundary it can prove).
const DARWIN = process.platform === "darwin";
const REAL_STATE_BEFORE = realStateFingerprint();
after(() => {
  assert.deepEqual(realStateFingerprint(), REAL_STATE_BEFORE,
    "real ~/.zvec-grep model cache / config / keys changed while the tests ran");
});

// Distinct, tokenizer-safe words so full-text hits are unambiguous.
const TOKENS = {
  kept: "keptwombatmarker",
  modifiedBefore: "alphaquokkaoriginal",
  modifiedAfter: "alphaquokkaamended",
  deleted: "betamarmotdoomed",
  added: "gammaokapiarrived",
  killed: "deltaibexpostkill",
  stress: "epsilonlynxstress",
};

const WORKSPACE = {
  "src/alpha.ts": `export function ${TOKENS.modifiedBefore}() {\n  return 1;\n}\n`,
  "src/beta.ts": `export function ${TOKENS.deleted}() {\n  return 2;\n}\n`,
  "src/keep.ts": `export function ${TOKENS.kept}() {\n  return 3;\n}\n`,
  ...FIXTURE_FILES,
};

// --------------------------------------------------------------------------
// Lab: one sandbox plus tracked daemons, torn down by node:test.
// --------------------------------------------------------------------------
function lab(t, { osSandbox = true } = {}) {
  const sandbox = createSandbox({ osSandbox });
  const daemons = [];
  t.after(async () => {
    for (const daemon of daemons) await daemon.stop().catch(() => {});
    sandbox.cleanup();
  });
  const api = {
    sandbox,
    async daemon(options) {
      const daemon = await startDaemon(sandbox, options);
      daemons.push(daemon);
      return daemon;
    },
    /** Workspace with a genuine local index built offline by the installed zg, registered as trusted. */
    async indexed(files = WORKSPACE, { trusted = true } = {}) {
      sandbox.writeWorkspaceFiles(files);
      await buildLocalIndex(sandbox);
      if (trusted) await trustRoot(sandbox);
      return sandbox;
    },
  };
  return api;
}

function assertNoEgress(sandbox, what) {
  assert.deepEqual(sandbox.egressEvents(), [], `${what}: network egress was attempted`);
}

const workspaceWithoutIndex = (sandbox) => {
  const before = fingerprintTree(sandbox.workspace);
  return { before, check: (what) => {
    const delta = diffFingerprints(before, fingerprintTree(sandbox.workspace));
    assert.ok(delta.same, `${what}: workspace changed ${JSON.stringify(delta)}`);
  } };
};

/** Resolved after any earlier accepted job: wait:true is serialized behind it. */
async function barrier(daemon, root, extra = {}) {
  return await daemon.refresh(root, { wait: true, ...extra });
}

const IN_FLIGHT = new Set(["refreshing", "reserved"]);

/** Poll until the daemon reports a non-in-flight state (or `indexed` flips), then return the status. */
async function settled(daemon, root, { quietMs = 400 } = {}) {
  const deadline = Date.now() + 60_000;
  let quietSince = 0;
  while (Date.now() < deadline) {
    const { json } = await daemon.status(root);
    if (json && !IN_FLIGHT.has(json.state)) {
      quietSince ||= Date.now();
      if (Date.now() - quietSince >= quietMs) return json;
    } else {
      quietSince = 0;
    }
    await sleep(40);
  }
  throw new Error("daemon never settled");
}

function writeManifest(sandbox, mutate) {
  const path = join(sandbox.indexDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  mutate(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function deadPid() {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(child.stdout);
}

async function packageLock(mode, sandbox) {
  const { acquireReadWriteLock } = await import(pathToFileURL(join(installedPackageDir(), "dist/engine/utils/lock.js")).href);
  return acquireReadWriteLock(join(sandbox.indexDir, "locks", "home"), mode, { operation: "contract-test-hold" });
}

const REFRESHED = new Set(["refreshed", "unchanged"]);

// --------------------------------------------------------------------------
// 0. Deliverable + startup + boundary contract
// --------------------------------------------------------------------------
test("deliverable: managed daemon entrypoint and existing-index predicate module exist", () => {
  assert.ok(existsSync(DAEMON_MAIN), `missing ${DAEMON_MAIN}`);
  assert.ok(existsSync(EXISTING_INDEX_MODULE), `missing ${EXISTING_INDEX_MODULE}`);
});

test("non-macOS hosts: the daemon refuses to run (exit 78 OS_EGRESS_BOUNDARY_UNAVAILABLE), it is not claimed to work", { skip: DARWIN && "macOS host: covered by the sandbox tests below" }, async (t) => {
  const { sandbox } = lab(t, { osSandbox: false });
  const run = await sandbox.run(process.execPath, [DAEMON_MAIN, "run", "--listen", "127.0.0.1:47999"], { wrap: false, timeoutMs: 20_000 });
  assert.equal(run.timedOut, false);
  assert.equal(run.code, 78);
  assert.match(run.stderr + run.stdout, /OS_EGRESS_BOUNDARY_UNAVAILABLE/);
});

test("startup: refuses an unsupported @zvec/zvec-grep package version and starts no listener", { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox } = lab(t);
  const fake = join(sandbox.root, "fake-package");
  mkdirSync(fake, { recursive: true });
  const real = JSON.parse(readFileSync(join(installedPackageDir(), "package.json"), "utf8"));
  writeFileSync(join(fake, "package.json"), JSON.stringify({ ...real, version: "9.9.9" }));
  const run = await sandbox.run(process.execPath, [DAEMON_MAIN, "run", "--listen", "127.0.0.1:47998"], {
    wrap: false, env: { ZVEC_GREP_PACKAGE_DIR: fake }, timeoutMs: 20_000,
  });
  assert.equal(run.timedOut, false, "daemon must exit, not keep running, on a version mismatch");
  assert.notEqual(run.code, 0);
  assert.match(run.stderr + run.stdout, /0\.2\.2|version/i);
  assert.equal(listenerPid(47998), null, "a listener exists after a refused start");
  assertNoEgress(sandbox, "version refusal");
});

test("boundary: when the kernel egress sandbox cannot be applied the daemon exits 78 OS_EGRESS_BOUNDARY_UNAVAILABLE and serves nothing",
  { skip: !OS_SANDBOX_AVAILABLE && "needs sandbox-exec to provoke a failed nested sandbox_apply" }, async (t) => {
  const { sandbox } = lab(t);
  // macOS forbids nesting sandbox profiles, so launching the daemon inside the
  // harness sandbox makes its own sandbox_apply fail: the exact "cannot be proven" case.
  const run = await sandbox.run(process.execPath, [DAEMON_MAIN, "run", "--listen", "127.0.0.1:47997"], {
    wrap: true, env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() }, timeoutMs: 30_000,
  });
  assert.equal(run.timedOut, false, "must fail closed, not hang");
  assert.equal(run.code, 78, `${run.stderr}${run.stdout}`);
  assert.match(run.stderr + run.stdout, /OS_EGRESS_BOUNDARY_UNAVAILABLE/);
  assert.equal(listenerPid(47997), null, "unconfined daemon served requests");
  assert.ok(!existsSync(join(sandbox.zvecHome, "daemon", "token")), "a refused start must not mint credentials");
});

test("boundary: status reports the darwin sandbox and the kernel really denies the listener non-loopback egress",
  { skip: !DARWIN && "macOS only", ...SLOW }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const daemon = await start();
  const { status, json } = await daemon.status(sandbox.workspace);
  assert.equal(status, 200);
  assert.deepEqual(json.os_sandbox, { mode: "darwin-sandbox-exec", loopback: "allowed", remote: "denied" });
  const pid = listenerPid(daemon.port);
  assert.ok(pid, "could not find the daemon listener process");
  assert.equal(kernelDeniesOutbound(pid), true, "the listening process is not kernel-confined (sandbox_check network-outbound)");
  assertNoEgress(sandbox, "boundary");
});

test("auth: default token file is minted 0600, /healthz is open, and every other endpoint needs the Bearer token",
  { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const daemon = await start({ token: null });
  const tokenPath = defaultTokenPath(sandbox);
  assert.equal(statSync(tokenPath).mode & 0o777, 0o600);
  const secret = daemon.token;
  assert.ok(secret && secret.length >= 16, "default token must be a real secret");
  assert.equal((await fetch(`${daemon.url}/healthz`)).status, 200, "/healthz is the only open endpoint");
  const guard = workspaceWithoutIndex(sandbox);
  for (const [method, path, body] of [
    ["POST", "/managed/refresh", { root: sandbox.workspace, reason: "turn_end", wait: true }],
    ["GET", `/managed/status?root=${encodeURIComponent(sandbox.workspace)}`, undefined],
    ["POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }],
  ]) {
    for (const headers of [{ "content-type": "application/json" }, { "content-type": "application/json", authorization: "Bearer wrong" }]) {
      const response = await daemon.request(method, path, body, { headers });
      assert.ok([401, 403].includes(response.status), `${method} ${path} without a valid token returned ${response.status}`);
      assert.ok(!response.text.includes(secret));
    }
  }
  assert.equal((await daemon.status(sandbox.workspace)).status, 200);
  guard.check("unauthorized requests");
  assert.ok(!(daemon.output.stdout + daemon.output.stderr).includes(secret), "token must not appear in daemon output");
  assertNoEgress(sandbox, "auth");
});

test("auth: an explicit --token-file token is honoured and never logged", { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const secret = `ct-${randomBytes(24).toString("hex")}`;
  const daemon = await start({ token: secret });
  const wrong = await daemon.request("GET", `/managed/status?root=${encodeURIComponent(sandbox.workspace)}`, undefined, {
    headers: { authorization: `Bearer ${secret.slice(0, -1)}x` },
  });
  assert.ok([401, 403].includes(wrong.status));
  assert.equal((await daemon.status(sandbox.workspace)).status, 200);
  assert.ok(!(daemon.output.stdout + daemon.output.stderr).includes(secret));
});

test("auth: a weak token file (<32 chars) is refused at startup and nothing listens", { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox } = lab(t);
  const tokenFile = join(sandbox.root, "weak.token");
  writeFileSync(tokenFile, "too-short\n", { mode: 0o600 });
  const run = await sandbox.run(process.execPath, [DAEMON_MAIN, "run", "--listen", "127.0.0.1:47996", "--token-file", tokenFile], {
    wrap: false, env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() }, timeoutMs: 30_000,
  });
  assert.equal(run.timedOut, false);
  assert.notEqual(run.code, 0);
  assert.equal(listenerPid(47996), null);
  assert.ok(!run.stdout.includes("too-short") && !run.stderr.includes("too-short"), "token value must not be echoed");
});

test("origin/host defence: /managed/* rejects browser Origin and non-loopback Host even with a valid token", { skip: !HAVE_ZG && "zg not installed", ...SLOW }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const daemon = await start();
  const { request } = await import("node:http");
  const call = (headers) => new Promise((resolveCall, reject) => {
    const req = request({ host: "127.0.0.1", port: daemon.port, path: "/managed/status", method: "GET", headers: { authorization: `Bearer ${daemon.token}`, ...headers } },
      (response) => { let text = ""; response.on("data", (c) => { text += c; }); response.on("end", () => resolveCall({ status: response.statusCode, text })); });
    req.on("error", reject);
    req.end();
  });
  assert.equal((await call({})).status, 200);
  assert.equal((await call({ origin: "http://evil.example" })).status, 403);
  assert.equal((await call({ host: "evil.example" })).status, 403);
  assertNoEgress(sandbox, "origin defence");
});

// --------------------------------------------------------------------------
// 1. Missing / partial / disabled index: refresh creates nothing
// --------------------------------------------------------------------------
test("inspectExistingIndex classifies every on-disk shape and never mutates the workspace", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed } = lab(t);
  const stateOf = async (root = sandbox.workspace) => (await inspectStates(sandbox, [root]))[0];

  sandbox.writeWorkspaceFiles(WORKSPACE);
  const pristine = fingerprintTree(sandbox.workspace);
  const none = await stateOf();
  assert.equal(none.state, "missing");
  assert.equal(none.root, null, "an ancestor of the temp dir unexpectedly holds an index");
  assert.ok(diffFingerprints(pristine, fingerprintTree(sandbox.workspace)).same, "predicate created state for a missing index");
  assert.ok(!existsSync(sandbox.indexDir));

  await indexed();
  assert.equal((await stateOf()).state, "ready");
  const subdir = await stateOf(join(sandbox.workspace, "src"));
  assert.equal(subdir.state, "ready", "a subdirectory resolves to the indexed ancestor");
  assert.equal(subdir.root, sandbox.workspace);
  assert.ok(!existsSync(join(sandbox.workspace, "src", ".zvec-grep")), "predicate created a nested index home");
  const ready = fingerprintTree(sandbox.indexDir);

  for (const victim of ["index.zvec", "files.zvec"]) {
    const saved = join(sandbox.root, `saved-${victim}`);
    cpSync(join(sandbox.indexDir, victim), saved, { recursive: true });
    rmSync(join(sandbox.indexDir, victim), { recursive: true });
    assert.equal((await stateOf()).state, "missing", `${victim} absent must read as missing`);
    assert.ok(!existsSync(join(sandbox.indexDir, victim)), "predicate recreated a missing store");
    cpSync(saved, join(sandbox.indexDir, victim), { recursive: true });
  }
  assert.equal((await stateOf()).state, "ready");

  const manifestPath = join(sandbox.indexDir, "manifest.json");
  const goodManifest = readFileSync(manifestPath, "utf8");
  writeManifest(sandbox, (manifest) => { manifest.indexPolicy = "disabled"; });
  assert.equal((await stateOf()).state, "disabled");
  writeFileSync(manifestPath, goodManifest);
  writeManifest(sandbox, (manifest) => { manifest.indexVersion = 999; });
  assert.equal((await stateOf()).state, "unsupported_version");
  writeFileSync(manifestPath, goodManifest);
  writeManifest(sandbox, (manifest) => { manifest.embedding.provider = "openai"; });
  assert.equal((await stateOf()).state, "unsupported_provider");
  writeFileSync(manifestPath, "{ this is not json");
  assert.equal((await stateOf()).state, "corrupt");
  writeFileSync(manifestPath, goodManifest);
  assert.equal((await stateOf()).state, "ready");
  assert.deepEqual(diffFingerprints(ready, fingerprintTree(sandbox.indexDir)).same, true, "read-only predicate changed the index");

  // A copied .zvec-grep (manifest.path still names the original) is "relocated", never adopted.
  const clone = join(sandbox.root, "clone");
  mkdirSync(clone);
  cpSync(sandbox.indexDir, join(clone, ".zvec-grep"), { recursive: true });
  assert.equal((await stateOf(clone)).state, "relocated");

  // A symlinked .zvec-grep is never followed.
  const linked = join(sandbox.root, "linked");
  mkdirSync(linked);
  symlinkSync(sandbox.indexDir, join(linked, ".zvec-grep"));
  assert.equal((await stateOf(linked)).state, "unsafe_home");
  assertNoEgress(sandbox, "predicate");
});

for (const waitMode of [true, false]) {
  test(`missing index (no .zvec-grep at all): refresh wait:${waitMode} reports skipped_missing_index and creates nothing, offline`, { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
    const { sandbox, daemon: start } = lab(t);
    sandbox.writeWorkspaceFiles(WORKSPACE);
    const guard = workspaceWithoutIndex(sandbox);
    const daemon = await start();

    // The existence decision is synchronous: a missing index is reported at once
    // (HTTP 200), never queued as an "accepted" job, whatever `wait` says.
    const first = await daemon.refresh(sandbox.workspace, { wait: waitMode, changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.status, "skipped_missing_index", first.text);
    assert.equal(first.json.job_id, undefined, "no job may be queued for a missing index");
    const final = await barrier(daemon, sandbox.workspace);
    assert.equal(final.json.status, "skipped_missing_index", final.text);
    const status = await settled(daemon, sandbox.workspace);
    assert.equal(status.indexed, false);
    assert.equal(status.last_success_at ?? null, null);

    guard.check("refresh against a missing index");
    assert.ok(!existsSync(sandbox.indexDir), ".zvec-grep must not even be mkdir'd");
    assert.deepEqual(Object.entries(fingerprintTree(sandbox.modelCache)), [], "no model cache state may be created for a missing index");
    assertNoEgress(sandbox, "missing index refresh");
    assert.equal(daemon.process.child.exitCode, null, "daemon must stay up");
  });
}

test("missing index: many repeated and concurrent refreshes never create the index", { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles(WORKSPACE);
  const guard = workspaceWithoutIndex(sandbox);
  const daemon = await start();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    daemon.refresh(sandbox.workspace, { wait: i % 2 === 0 })));
  for (const result of results) {
    assert.equal(result.status, 200, result.text);
    assert.equal(result.json.status, "skipped_missing_index", result.text);
  }
  assert.equal((await barrier(daemon, sandbox.workspace)).json.status, "skipped_missing_index");
  await settled(daemon, sandbox.workspace);
  guard.check("burst of refreshes");
  assertNoEgress(sandbox, "burst");
});

test("invalid roots are rejected with HTTP 400 {status:failed,error.code} and create nothing", { skip: !HAVE_ZG && "zg not installed" }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles(WORKSPACE);
  const guard = workspaceWithoutIndex(sandbox);
  const daemon = await start();
  const ghost = join(sandbox.root, "does-not-exist");
  const cases = [
    ["relative/path", "ROOT_NOT_ABSOLUTE"],
    ["", "ROOT_NOT_ABSOLUTE"],
    [ghost, "ROOT_NOT_FOUND"],
    [`${sandbox.workspace}/../outside`, "ROOT_NOT_FOUND"],
    [join(sandbox.workspace, "notes.md"), null],
  ];
  for (const [root, code] of cases) {
    const result = await daemon.refresh(root, { wait: true });
    assert.equal(result.status, 400, `root ${JSON.stringify(root)}: ${result.text}`);
    assert.equal(result.json.status, "failed");
    assert.equal(typeof result.json.error.code, "string");
    if (code) assert.equal(result.json.error.code, code, `root ${JSON.stringify(root)}`);
  }
  assert.ok(!existsSync(ghost), "a nonexistent root must never be created");
  assert.ok(!existsSync(join(sandbox.root, "outside")));
  guard.check("invalid roots");
  assert.deepEqual(readdirSync(sandbox.modelCache), [], "invalid roots staged model artifacts");
  assertNoEgress(sandbox, "invalid roots");
});

test("changed_paths/force_paths outside the index roots are refused with 400 PATH_OUT_OF_SCOPE, queue nothing, and never leak into the index", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const outside = join(sandbox.root, "outside-secret.ts");
  writeFileSync(outside, "export const outsidesecretmarker = 1;\n");
  const daemon = await start();
  for (const field of ["changed_paths", "force_paths"]) {
    for (const bad of [outside, join(sandbox.workspace, "..", "outside-secret.ts"), "/etc/hosts"]) {
      const result = await daemon.refresh(sandbox.workspace, { wait: true, [field]: [bad] });
      assert.equal(result.status, 400, `${field}=${bad}: ${result.text}`);
      assert.equal(result.json.status, "failed");
      assert.equal(result.json.error.code, "PATH_OUT_OF_SCOPE");
    }
  }
  const status = (await daemon.status(sandbox.workspace)).json;
  assert.equal(status.last_success_at ?? null, null, "a refused request must not run a job");
  assert.deepEqual((await ftsHits(sandbox, "outsidesecretmarker")).files, [], "a path outside the root leaked into the index");
  assertNoEgress(sandbox, "outside paths");
});

for (const [label, prepare] of [
  ["manifest only (both stores gone)", (sb) => { rmSync(join(sb.indexDir, "index.zvec"), { recursive: true }); rmSync(join(sb.indexDir, "files.zvec"), { recursive: true }); }],
  ["files.zvec gone", (sb) => rmSync(join(sb.indexDir, "files.zvec"), { recursive: true })],
  ["index.zvec gone", (sb) => rmSync(join(sb.indexDir, "index.zvec"), { recursive: true })],
]) {
  test(`partial index (${label}): refresh skips as missing and recreates no store`, { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
    const { sandbox, indexed, daemon: start } = lab(t);
    await indexed();
    prepare(sandbox);
    const before = indexArtifacts(sandbox);
    const manifestBefore = readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8");
    sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
    const daemon = await start();

    const result = await barrier(daemon, sandbox.workspace, { changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
    assert.equal(result.json.status, "skipped_missing_index", result.text);
    await settled(daemon, sandbox.workspace);
    assert.deepEqual(indexArtifacts(sandbox), before, "refresh changed which index artifacts exist");
    assert.equal(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"), manifestBefore, "manifest was rewritten");
    assertNoEgress(sandbox, label);
  });
}

const REFUSALS = [
  { name: "corrupt manifest.json", status: "failed", code: "MANAGED_INDEX_CORRUPT",
    prepare: (sb) => ({ root: sb.workspace, damage: () => writeFileSync(join(sb.indexDir, "manifest.json"), "{ this is not json") }) },
  { name: "unsupported index version", status: "skipped_unsupported", code: "MANAGED_INDEX_UNSUPPORTED_VERSION",
    prepare: (sb) => ({ root: sb.workspace, damage: () => writeManifest(sb, (m) => { m.indexVersion = 999; }) }) },
  { name: "copied .zvec-grep (relocated; manifest.path names another home)", status: "skipped_unsupported", code: "MANAGED_INDEX_RELOCATED",
    prepare: (sb) => { const clone = join(sb.root, "clone"); return { root: clone, damage: () => { mkdirSync(clone); cpSync(sb.indexDir, join(clone, ".zvec-grep"), { recursive: true }); } }; } },
  { name: "symlinked .zvec-grep (never followed)", status: "skipped_unsupported", code: "MANAGED_INDEX_UNSAFE_HOME",
    prepare: (sb) => { const linked = join(sb.root, "linked"); return { root: linked, damage: () => { mkdirSync(linked); symlinkSync(sb.indexDir, join(linked, ".zvec-grep")); } }; } },
];

// A non-ready existing index is a failure the host must see (background warning),
// even when the daemon correctly refuses to write anything.
for (const { name, status: expectedStatus, code, prepare } of REFUSALS) {
  test(`refusal (${name}): ${expectedStatus} + durable ${code} warning, original and copied index bytes untouched, nothing created`, { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
    const { sandbox, indexed, daemon: start } = lab(t);
    await indexed();
    const { root, damage } = prepare(sandbox);
    damage();
    sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
    const homes = [sandbox.indexDir, join(root, ".zvec-grep")].filter((path, i, all) => existsSync(path) && all.indexOf(path) === i);
    const before = homes.map((home) => fingerprintTree(home));
    const daemon = await start();
    const result = await barrier(daemon, root);
    assert.equal(result.status, 200, result.text);
    assert.equal(result.json.status, expectedStatus, result.text);
    if (expectedStatus === "failed") assert.equal(result.json.error.code, code, result.text);
    const status = await settled(daemon, root);
    assert.equal(status.warning?.code, code, `no durable warning for ${name}: ${JSON.stringify(status)}`);
    assert.equal(status.indexed, false);
    homes.forEach((home, i) => {
      const delta = diffFingerprints(before[i], fingerprintTree(home));
      assert.deepEqual([...delta.added, ...delta.removed, ...delta.changed].filter((path) => !path.startsWith("locks")), [], `${home} changed`);
    });
    assert.ok(!existsSync(join(root, "src", ".zvec-grep")));
    assertNoEgress(sandbox, name);
  });
}

test("a subdirectory of an indexed root resolves to the ancestor index and never gets its own .zvec-grep", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const daemon = await start();
  const sub = join(sandbox.workspace, "src");
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const result = await barrier(daemon, sub);
  t.diagnostic(`subdirectory refresh -> ${result.status} ${result.text}`);
  assert.ok(!existsSync(join(sub, ".zvec-grep")), "a nested index home was created in a subdirectory");
  assert.ok([...REFRESHED, "skipped_missing_index"].includes(result.json?.status) || result.status === 400, result.text);
  assertNoEgress(sandbox, "subdirectory");
});

function writeLease(sandbox, lease) {
  const path = join(sandbox.indexDir, "locks", "daemon.json");
  mkdirSync(join(sandbox.indexDir, "locks"), { recursive: true });
  const now = Date.now();
  writeFileSync(path, `${JSON.stringify({ hostname: hostname(), instanceToken: "foreign-daemon", createdAt: now, updatedAt: now, ...lease })}\n`, { mode: 0o600 });
  return path;
}

test("single writer: a live foreign daemon lease blocks refresh (busy|failed), is never removed, and the index is not written", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const lease = writeLease(sandbox, { pid: process.pid }); // the test process is alive and is not the managed daemon
  const leaseBefore = readFileSync(lease, "utf8");
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const daemon = await start();
  const result = await barrier(daemon, sandbox.workspace);
  assert.ok(["busy", "failed"].includes(result.json.status), result.text);
  assert.equal(readFileSync(lease, "utf8"), leaseBefore, "a live foreign lease was modified or removed");
  assert.equal((await ftsHits(sandbox, TOKENS.modifiedAfter)).files.length, 0, "index written despite another daemon owning the root");
  assertNoEgress(sandbox, "foreign lease");
});

test("single writer: a lease left by a dead daemon on this host is recovered", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  writeLease(sandbox, { pid: deadPid() });
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const daemon = await start();
  const result = await barrier(daemon, sandbox.workspace);
  assert.ok(REFRESHED.has(result.json.status), result.text);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedAfter)).files, ["src/alpha.ts"]);
  assertNoEgress(sandbox, "dead lease");
});

test("no manifest but stores present: refresh does not write a manifest or adopt the stores", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  rmSync(join(sandbox.indexDir, "manifest.json"));
  const storesBefore = { index: fingerprintTree(join(sandbox.indexDir, "index.zvec")), files: fingerprintTree(join(sandbox.indexDir, "files.zvec")) };
  const daemon = await start();
  const result = await barrier(daemon, sandbox.workspace);
  assert.ok(["skipped_missing_index", "failed", "skipped_disabled"].includes(result.json.status), result.text);
  await settled(daemon, sandbox.workspace);
  assert.ok(!existsSync(join(sandbox.indexDir, "manifest.json")), "a manifest was invented for an unconfigured index");
  assert.ok(diffFingerprints(storesBefore.files, fingerprintTree(join(sandbox.indexDir, "files.zvec"))).same);
  assertNoEgress(sandbox, "manifest-less");
});

test("disabled index policy: refresh reports skipped_disabled and writes nothing", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  writeManifest(sandbox, (manifest) => { manifest.indexPolicy = "disabled"; });
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const before = fingerprintTree(sandbox.indexDir);
  const daemon = await start();
  const result = await barrier(daemon, sandbox.workspace);
  assert.equal(result.json.status, "skipped_disabled", result.text);
  await settled(daemon, sandbox.workspace);
  const delta = diffFingerprints(before, fingerprintTree(sandbox.indexDir));
  assert.deepEqual([...delta.added, ...delta.removed, ...delta.changed].filter((p) => !p.startsWith("locks")), []);
  assert.equal((await ftsHits(sandbox, TOKENS.modifiedAfter)).files.length, 0, "disabled index must not be updated");
  assertNoEgress(sandbox, "disabled");
});

// --------------------------------------------------------------------------
// 2. Deletion races: the existence check and the write are one atomic step
// --------------------------------------------------------------------------
const RACE_SHAPES = {
  "stores only (manifest kept)": {
    remove: (sb) => { rmSync(join(sb.indexDir, "index.zvec"), { recursive: true }); rmSync(join(sb.indexDir, "files.zvec"), { recursive: true }); },
    manifest: true,
  },
  "`zg index --drop` shape (stores + manifest, locks kept)": {
    remove: (sb) => { for (const name of ["index.zvec", "files.zvec", "manifest.json"]) rmSync(join(sb.indexDir, name), { recursive: true }); },
    manifest: false,
  },
  "whole .zvec-grep directory": {
    remove: (sb) => rmSync(sb.indexDir, { recursive: true, force: true }),
    manifest: false,
  },
};

for (const [shape, { remove, manifest }] of Object.entries(RACE_SHAPES)) {
  test(`deletion race (deterministic, ${shape}): index removed while a foreign writer holds the lock is NOT recreated once refresh proceeds`, { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
    const { sandbox, indexed, daemon: start } = lab(t);
    await indexed();
    const daemon = await start();
    const alpha = join(sandbox.workspace, "src/alpha.ts");
    sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {\n  return 11;\n}\n` });

    const lock = await packageLock("write", sandbox);
    t.after(() => lock.release());
    const queued = await daemon.refresh(sandbox.workspace, { wait: false, changed_paths: [alpha] });
    assert.ok(["accepted", "busy"].includes(queued.json?.status), `refresh under a foreign writer lock: ${queued.text}`);
    t.diagnostic(`refresh while foreign writer lock held -> ${queued.json.status}`);
    await sleep(300); // an accepted job has now reached the lock and is waiting on / polling it

    remove(sandbox);   // user drops/removes the index inside the race window ...
    lock.release();    // ... then the writer lock frees and the queued refresh proceeds.

    const result = await barrier(daemon, sandbox.workspace, { changed_paths: [alpha] });
    assert.equal(result.json.status, "skipped_missing_index", result.text);
    for (let i = 0; i < 10; i += 1) {
      assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), false, `index.zvec reappeared ${i * 150}ms after the race`);
      assert.equal(existsSync(join(sandbox.indexDir, "files.zvec")), false, `files.zvec reappeared ${i * 150}ms after the race`);
      assert.equal(existsSync(join(sandbox.indexDir, "manifest.json")), manifest, "manifest.json created/removed by refresh");
      await sleep(150);
    }
    const status = await settled(daemon, sandbox.workspace);
    assert.equal(status.indexed, false);
    if (existsSync(sandbox.indexDir)) {
      const residue = Object.keys(fingerprintTree(sandbox.indexDir)).filter((path) => path !== "locks" && !path.startsWith("locks/"));
      assert.deepEqual(residue, manifest ? ["manifest.json"] : [], "non-lock state left behind");
    }
    assertNoEgress(sandbox, "deterministic race");
    assert.equal(daemon.process.child.exitCode, null, "daemon must survive the race");
  });
}

test("while the managed daemon owns a root, stock `zg index --drop` is refused (single writer) and the index survives", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const daemon = await start();
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  assert.ok(REFRESHED.has((await barrier(daemon, sandbox.workspace)).json.status));
  const before = fingerprintTree(join(sandbox.indexDir, "files.zvec"));
  const drop = await zg(sandbox, ["index", sandbox.workspace, "--drop", "--yes", "--mode", "direct"]);
  assert.notEqual(drop.code, 0, "a second writer must not drop an index the managed daemon owns");
  assert.match(drop.stderr + drop.stdout, /DAEMON_LEASE_ACTIVE|owns index writes/);
  assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), true);
  assert.ok(diffFingerprints(before, fingerprintTree(join(sandbox.indexDir, "files.zvec"))).same);
  assertNoEgress(sandbox, "lease vs drop");
});

test("deletion after a successful refresh: daemon holds no stale handle and does not rebuild on the next turn", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const daemon = await start();
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const first = await barrier(daemon, sandbox.workspace);
  assert.ok(REFRESHED.has(first.json.status), first.text);

  // The user removes the index by hand (stock drop is refused while the daemon owns the root).
  for (const name of ["index.zvec", "files.zvec", "manifest.json"]) rmSync(join(sandbox.indexDir, name), { recursive: true });
  assert.deepEqual(indexArtifacts(sandbox), { "index.zvec": false, "files.zvec": false, "manifest.json": false });

  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.added}() {}\n` });
  const second = await barrier(daemon, sandbox.workspace);
  assert.equal(second.json.status, "skipped_missing_index", second.text);
  await settled(daemon, sandbox.workspace);
  assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), false, "index.zvec rebuilt after the index was removed");
  assert.equal(existsSync(join(sandbox.indexDir, "files.zvec")), false, "files.zvec rebuilt after the index was removed");
  assert.equal(existsSync(join(sandbox.indexDir, "manifest.json")), false, "manifest recreated after the index was removed");
  assertNoEgress(sandbox, "post-removal");
});

for (const deleteAfterMs of [0, 30, 90]) {
  test(`deletion race (timed stress, delete +${deleteAfterMs}ms): concurrent refreshes never resurrect a deleted index`, { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
    const { sandbox, indexed, daemon: start } = lab(t);
    await indexed();
    const daemon = await start();
    const files = {};
    for (let i = 0; i < 12; i += 1) files[`src/stress${i}.ts`] = `export function ${TOKENS.stress}${i}() {\n  return ${i};\n}\n`;
    sandbox.writeWorkspaceFiles(files);

    const inflight = Array.from({ length: 6 }, (_, i) => daemon.refresh(sandbox.workspace, { wait: i % 2 === 0 }));
    await sleep(deleteAfterMs);
    rmSync(join(sandbox.indexDir, "index.zvec"), { recursive: true, force: true });
    rmSync(join(sandbox.indexDir, "files.zvec"), { recursive: true, force: true });
    const deletedAt = Date.now();
    const results = await Promise.all(inflight);
    for (const result of results) {
      assert.ok(["accepted", "refreshed", "unchanged", "skipped_missing_index", "busy", "failed"].includes(result.json?.status), result.text);
    }
    // Jobs that were already writing when the stores vanished may fail; a job that
    // starts after the deletion may only skip (or report busy while an older job drains).
    let finalOutcome;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      finalOutcome = await barrier(daemon, sandbox.workspace);
      if (finalOutcome.json.status !== "busy") break;
      await sleep(250);
    }
    assert.equal(finalOutcome.json.status, "skipped_missing_index", `refresh started after deletion: ${finalOutcome.text}`);
    const status = await settled(daemon, sandbox.workspace);
    // Wait out any late job, then require the deleted stores to still be gone.
    await sleep(400);
    assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), false, `index.zvec resurrected (deleted at ${deletedAt})`);
    assert.equal(existsSync(join(sandbox.indexDir, "files.zvec")), false, "files.zvec resurrected");
    assert.equal(status.indexed, false);
    assert.equal(daemon.process.child.exitCode, null, "daemon must survive the race");
    assertNoEgress(sandbox, "timed race");
  });
}

// --------------------------------------------------------------------------
// 3. No network, no download, no credential leakage
// --------------------------------------------------------------------------
test("model missing: refresh fails closed with a warning, never downloads, leaves the index untouched", { skip: !HAVE_ZG && "zg not installed", ...SLOW }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  // Build with the model, then remove it from the sandbox cache: an existing index whose model is not on disk.
  sandbox.writeWorkspaceFiles(WORKSPACE);
  if (!HAVE_MODEL) return t.skip("no already-downloaded local model artifact to build the fixture index");
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  rmSync(sandbox.modelCache, { recursive: true, force: true });
  mkdirSync(sandbox.modelCache);
  const storesBefore = fingerprintTree(join(sandbox.indexDir, "files.zvec"));
  const manifestBefore = readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8");
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const daemon = await start();

  const result = await barrier(daemon, sandbox.workspace, { changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
  assert.equal(result.json.status, "failed", result.text);
  assert.equal(typeof result.json.error?.code, "string");
  assert.ok(result.json.error.message.length > 0);

  const status = await settled(daemon, sandbox.workspace);
  assert.ok(status.warning, "a failed background refresh must be recorded as a warning");
  assert.equal(status.last_failure?.code, result.json.error.code);
  assert.deepEqual(Object.entries(fingerprintTree(sandbox.modelCache)), [], "a cache miss is an error, not a download: the model cache must stay byte- and directory-identical (empty)");
  assert.match(result.json.error.message, /never downloads/i, "the refusal must say it is offline-only");
  assertNoEgress(sandbox, "missing model");
  assert.equal(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"), manifestBefore);
  assert.ok(diffFingerprints(storesBefore, fingerprintTree(join(sandbox.indexDir, "files.zvec"))).same, "files store changed during a failed refresh");
  assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), true, "failed refresh removed the index");
});

test("remote-embedding manifest + credentials in the environment: refresh refuses, sends nothing, leaks nothing", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  writeManifest(sandbox, (manifest) => {
    manifest.embedding = { provider: "openai", model: "text-embedding-3-small", dimension: 1536, metric: "cosine" };
  });
  const manifestBefore = readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8");
  const apiKey = "sk-contract-test-NOT-A-REAL-KEY-0011";
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {}\n` });
  const daemon = await start({ env: { ZVEC_GREP_API_KEY: apiKey, ZVEC_GREP_ENDPOINT: "https://embeddings.invalid/v1", OPENAI_API_KEY: apiKey } });

  const result = await barrier(daemon, sandbox.workspace);
  assert.equal(result.json.status, "failed", `remote provider must not refresh offline: ${result.text}`);
  assert.equal(result.json.error.code, "MANAGED_REMOTE_PROVIDER_REFUSED");
  const status = await settled(daemon, sandbox.workspace);
  assert.ok(status.warning, "refusal must surface as a background warning");
  const everything = [result.text, JSON.stringify(status), daemon.output.stdout, daemon.output.stderr].join("\n");
  assert.ok(!everything.includes(apiKey), "API key leaked into daemon output or responses");
  assertNoEgress(sandbox, "remote embedding");
  assert.equal(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"), manifestBefore);
  assert.equal((await ftsHits(sandbox, TOKENS.modifiedAfter)).files.length, 0);
});

// --------------------------------------------------------------------------
// 4. Interrupted / failed / partial index
// --------------------------------------------------------------------------
test("stale write lock left by a dead process (interrupted writer) is recovered, not waited on forever", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const lockDir = join(sandbox.indexDir, "locks", "home.write");
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, "lock.json"), JSON.stringify({
    token: "00000000-dead-writer", pid: deadPid(), hostname: hostname(), startedAt: Date.now() - 60_000, operation: "interrupted-refresh",
  }));
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {\n  return 5;\n}\n` });
  const daemon = await start();
  const started = Date.now();
  const result = await barrier(daemon, sandbox.workspace, { changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
  assert.ok(REFRESHED.has(result.json.status), `dead-owner lock must not wedge refresh: ${result.text}`);
  assert.ok(Date.now() - started < 60_000);
  assert.ok(!existsSync(lockDir), "stale lock was not cleared");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedAfter)).files, ["src/alpha.ts"]);
  assertNoEgress(sandbox, "stale lock");
});

test("live foreign writer lock: wait:true => busy, async => INDEX_BUSY warning; lock never stolen; success after release clears the warning", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {\n  return 6;\n}\n` });
  const daemon = await start();
  const lock = await packageLock("write", sandbox);
  let released = false;
  t.after(() => { if (!released) lock.release(); });

  const blocked = await barrier(daemon, sandbox.workspace);
  assert.equal(blocked.status, 200, blocked.text);
  assert.equal(blocked.json.status, "busy", blocked.text);
  assert.ok(existsSync(lock.path), "daemon removed a live writer's lock");

  const accepted = await daemon.refresh(sandbox.workspace, { wait: false });
  assert.equal(accepted.json.status, "accepted", accepted.text);
  const warned = await daemon.waitStatus(sandbox.workspace, (s) => Boolean(s.warning) && s.last_failure?.code === "INDEX_BUSY", { timeoutMs: 30_000 });
  assert.ok(warned.warning);
  assert.ok(existsSync(lock.path), "daemon removed a live writer's lock during retries");
  assert.equal((await ftsHits(sandbox, TOKENS.modifiedAfter)).files.length, 0, "index changed under a foreign writer's lock");

  lock.release();
  released = true;
  const after = await barrier(daemon, sandbox.workspace);
  assert.ok(REFRESHED.has(after.json.status), after.text);
  // A failure sets a verify demand: the next successful refresh verifies content, clears the
  // standing warning, and leaves a one-shot notice that the next search prints exactly once.
  const healed = await settled(daemon, sandbox.workspace);
  assert.equal(healed.warning ?? null, null, "a later successful verifying refresh must clear the failure warning");
  assert.equal(healed.last_failure ?? null, null);
  const search = await mcpSearch(daemon, { root: sandbox.workspace, query: "alpha amended", fts: [TOKENS.modifiedAfter] });
  assert.equal(search.isError, false, search.text);
  assert.match(search.text, /^freshness: fresh\nrefresh_warning: INDEX_BUSY/m, "the search must surface the earlier failure exactly once");
  assert.match(search.text, /src\/alpha\.ts/);
  const again = await mcpSearch(daemon, { root: sandbox.workspace, query: "alpha amended", fts: [TOKENS.modifiedAfter] });
  assert.doesNotMatch(again.text, /refresh_warning/, "a surfaced warning must not repeat");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedAfter)).files, ["src/alpha.ts"]);
  assertNoEgress(sandbox, "live lock");
});

test("corrupt collection manifest: refresh fails with a warning; index bytes untouched; no rebuild; recovers once repaired", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const manifest3 = join(sandbox.indexDir, "index.zvec", "manifest.3");
  const good = readFileSync(manifest3);
  writeFileSync(manifest3, "garbage\n");
  const manifestJson = readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8");
  const filesBefore = fingerprintTree(join(sandbox.indexDir, "files.zvec"));
  const inodeBefore = statSync(join(sandbox.indexDir, "index.zvec")).ino;
  sandbox.writeWorkspaceFiles({ "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {\n  return 7;\n}\n` });
  const daemon = await start();

  const failed = await barrier(daemon, sandbox.workspace, { changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
  assert.equal(failed.json.status, "failed", failed.text);
  const status = await settled(daemon, sandbox.workspace);
  assert.ok(status.warning && status.last_failure?.code, "corruption must surface as a background warning");
  assert.equal(readFileSync(manifest3, "utf8"), "garbage\n", "daemon modified/repaired the corrupt file");
  assert.equal(statSync(join(sandbox.indexDir, "index.zvec")).ino, inodeBefore, "index.zvec was deleted and recreated");
  assert.equal(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"), manifestJson);
  assert.ok(diffFingerprints(filesBefore, fingerprintTree(join(sandbox.indexDir, "files.zvec"))).same);
  assert.equal(daemon.process.child.exitCode, null, "daemon must survive a corrupt index");
  assertNoEgress(sandbox, "corrupt index");

  writeFileSync(manifest3, good); // the user (not the daemon) repairs it
  const recovered = await barrier(daemon, sandbox.workspace, { changed_paths: [join(sandbox.workspace, "src/alpha.ts")] });
  assert.ok(REFRESHED.has(recovered.json.status), recovered.text);
  const clean = await settled(daemon, sandbox.workspace);
  assert.equal(clean.warning ?? null, null, "a later successful verifying refresh must clear the warning");
  assert.equal(clean.last_failure ?? null, null);
  assert.ok(clean.last_success_at);
  const search = await mcpSearch(daemon, { root: sandbox.workspace, query: "alpha amended", fts: [TOKENS.modifiedAfter] });
  assert.equal(search.isError, false, search.text);
  assert.match(search.text, /refresh_warning: /, "the earlier corruption failure must be surfaced once on the next search");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedAfter)).files, ["src/alpha.ts"]);
});

test("daemon SIGKILLed mid-refresh: index stays openable, no rebuild, next daemon converges to a fresh index", { skip: NEEDS_LOCAL_INDEX, timeout: 300_000 }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const manifestBefore = JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"));
  const files = {};
  for (let i = 0; i < 400; i += 1) {
    files[`src/bulk/m${i}.ts`] = `export function ${TOKENS.killed}${i}(value: number) {\n  // ${"padding ".repeat(40)}\n  return value + ${i};\n}\n`;
  }
  sandbox.writeWorkspaceFiles(files);
  const daemon = await start();
  const accepted = await daemon.refresh(sandbox.workspace, { wait: false });
  assert.equal(accepted.json?.status, "accepted", accepted.text);

  // Kill the instant the package write lock appears: the writer is provably mid-flight.
  const lockDir = join(sandbox.indexDir, "locks", "home.write");
  const deadline = Date.now() + 30_000;
  while (!existsSync(lockDir) && Date.now() < deadline) await sleep(2);
  const killedMidWrite = existsSync(lockDir);
  await daemon.kill();
  assert.ok(killedMidWrite, "refresh finished before the writer lock was ever observed; the interruption was not exercised");
  t.diagnostic(`killed daemon with writer lock present: ${killedMidWrite}`);

  assert.equal(existsSync(join(sandbox.indexDir, "index.zvec")), true, "interruption removed the index");
  assert.equal(JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8")).id, manifestBefore.id, "index identity changed: it was rebuilt");
  assertNoEgress(sandbox, "kill");

  const restarted = await start();
  const recovered = await barrier(restarted, sandbox.workspace);
  assert.ok(REFRESHED.has(recovered.json.status), `restart did not recover from an interrupted writer: ${recovered.text}`);
  assert.equal(JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8")).id, manifestBefore.id, "recovery rebuilt instead of reconciled");
  assert.ok(!existsSync(lockDir), "recovery left a writer lock behind");
  const hits = await ftsHits(sandbox, `${TOKENS.killed}399`);
  assert.deepEqual(hits.files, ["src/bulk/m399.ts"]);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.kept)).files, ["src/keep.ts"], "pre-existing content lost across the interrupted refresh");
  const status = await zg(sandbox, ["status", sandbox.workspace, "--mode", "direct"]);
  assert.match(status.stdout, /Workspace index is ready/);
  assertNoEgress(sandbox, "post-kill recovery");
});

// --------------------------------------------------------------------------
// 5. Successful actual local indexing (offline, from an on-disk model)
// --------------------------------------------------------------------------
test("local incremental refresh: added, modified and deleted files are reflected; offline; identity preserved", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const manifestBefore = JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"));
  const modelCacheBefore = fingerprintTree(sandbox.modelCache);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedBefore)).files, ["src/alpha.ts"]);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.deleted)).files, ["src/beta.ts"]);

  sandbox.writeWorkspaceFiles({
    "src/alpha.ts": `export function ${TOKENS.modifiedAfter}() {\n  return 100;\n}\n`,
    "src/gamma.ts": `export function ${TOKENS.added}() {\n  return 200;\n}\n`,
  });
  rmSync(join(sandbox.workspace, "src/beta.ts"));
  const daemon = await start();

  const accepted = await daemon.refresh(sandbox.workspace, {
    wait: false,
    changed_paths: ["src/alpha.ts", "src/gamma.ts", "src/beta.ts"].map((p) => join(sandbox.workspace, p)),
  });
  assert.equal(accepted.status, 202, accepted.text);
  assert.equal(accepted.json.status, "accepted");
  const status = await daemon.waitStatus(sandbox.workspace, (s) => Boolean(s.last_success_at) && !IN_FLIGHT.has(s.state));
  assert.equal(status.indexed, true);
  assert.equal(status.warning ?? null, null);

  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedAfter)).files, ["src/alpha.ts"], "modified file not re-indexed");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.added)).files, ["src/gamma.ts"], "new file not indexed");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.modifiedBefore)).files, [], "stale content of modified file survived");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.deleted)).files, [], "deleted file still searchable");
  assert.deepEqual((await ftsHits(sandbox, TOKENS.kept)).files, ["src/keep.ts"], "untouched file lost");

  const manifestAfter = JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8"));
  assert.equal(manifestAfter.id, manifestBefore.id, "incremental refresh rebuilt the index");
  assert.equal(manifestAfter.createdTime, manifestBefore.createdTime);
  assert.deepEqual(manifestAfter.embedding, manifestBefore.embedding);
  assert.ok(diffFingerprints(modelCacheBefore, fingerprintTree(sandbox.modelCache)).same, "model cache changed: something downloaded or rewrote artifacts");
  assertNoEgress(sandbox, "local refresh");

  const zgStatus = await zg(sandbox, ["status", sandbox.workspace, "--mode", "direct"]);
  assert.match(zgStatus.stdout, /Workspace index is ready/);
  assert.match(zgStatus.stdout, new RegExp(`${Object.keys(WORKSPACE).length} / ${Object.keys(WORKSPACE).length} files`));
  assert.match(zgStatus.stdout, new RegExp(LOCAL_MODEL.replace("/", "\\/")));

  const again = await barrier(daemon, sandbox.workspace);
  assert.equal(again.json.status, "unchanged", `nothing changed since the last refresh: ${again.text}`);
  assertNoEgress(sandbox, "unchanged refresh");
});

test("local refresh without changed_paths reconciles all edits found on disk (wait:true)", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  sandbox.writeWorkspaceFiles({ "src/gamma.ts": `export function ${TOKENS.added}() {}\n` });
  rmSync(join(sandbox.workspace, "src/beta.ts"));
  const daemon = await start();
  const result = await barrier(daemon, sandbox.workspace);
  assert.equal(result.status, 200, result.text);
  assert.equal(result.json.status, "refreshed", result.text);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.added)).files, ["src/gamma.ts"]);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.deleted)).files, []);
  assertNoEgress(sandbox, "full reconcile");
});

test("daemon restart: a refresh after restart reuses the existing index (no rebuild, no model fetch)", { skip: NEEDS_LOCAL_INDEX, ...SLOW }, async (t) => {
  const { sandbox, indexed, daemon: start } = lab(t);
  await indexed();
  const id = JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8")).id;
  const first = await start();
  sandbox.writeWorkspaceFiles({ "src/gamma.ts": `export function ${TOKENS.added}() {}\n` });
  assert.ok(REFRESHED.has((await barrier(first, sandbox.workspace)).json.status));
  await first.stop();
  const second = await start();
  sandbox.writeWorkspaceFiles({ "src/delta.ts": `export function ${TOKENS.killed}() {}\n` });
  assert.ok(REFRESHED.has((await barrier(second, sandbox.workspace)).json.status));
  assert.equal(JSON.parse(readFileSync(join(sandbox.indexDir, "manifest.json"), "utf8")).id, id);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.added)).files, ["src/gamma.ts"]);
  assert.deepEqual((await ftsHits(sandbox, TOKENS.killed)).files, ["src/delta.ts"]);
  assertNoEgress(sandbox, "restart");
});
