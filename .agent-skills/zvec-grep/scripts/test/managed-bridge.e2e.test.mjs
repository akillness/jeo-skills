// End-to-end tests: host lifecycle bridge (scripts/host-events.py) <-> managed daemon
// over the daemon's owner-only Unix socket. Everything runs in a disposable
// HOME / ZVEC_GREP_HOME / hook-state / warnings dir, offline, against an index
// built by the installed zg from an already-downloaded local model.
//
// Flow under test: `start` snapshots the workspace at response start; `end`
// reserves the response with the daemon, detaches a worker which re-snapshots,
// diffs, and either requests a refresh (changed files) or releases the
// reservation (unchanged / any failure => outcome "failed" + a persisted warning).
// Run: node --test .agent-skills/zvec-grep/scripts/test/
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
  HOST_EVENTS, buildLocalIndex, trustRoot, createSandbox, fingerprintTree, ftsHits, indexArtifacts,
  installedPackageDir, localModelArtifactAvailable, readInstanceRecord, realZg, sleep, socketRequest, startDaemon,
} from "./harness.mjs";

const HAVE = realZg() && localModelArtifactAvailable();
const NEEDS = !HAVE && "installed zg 0.2.2 and an already-downloaded local model artifact are required";
const DARWIN = process.platform === "darwin";
const SLOW = { timeout: 240_000, skip: NEEDS || (!DARWIN && "managed daemon is macOS-only by contract") };

const TOKENS = { before: "bridgeheronbefore", after: "bridgeheronafter", extra: "bridgeherontwo" };
const WORKSPACE = {
  "src/app.ts": `export function ${TOKENS.before}() {\n  return 1;\n}\n`,
  "src/util.ts": "export function pad(value: string) {\n  return value.padStart(8, '0');\n}\n",
  "README.md": "# Bridge fixture\n\nPlain prose used by the bridge end-to-end tests.\n",
};

function fixture(t) {
  const sandbox = createSandbox();
  const daemons = [];
  const hookState = join(sandbox.root, "hook-state");
  const warnings = join(sandbox.root, "warnings");
  t.after(async () => {
    for (const daemon of daemons) await daemon.stop().catch(() => {});
    sandbox.cleanup();
  });
  return {
    sandbox, hookState, warnings,
    async index() {
      sandbox.writeWorkspaceFiles(WORKSPACE);
      await buildLocalIndex(sandbox);
      await trustRoot(sandbox);
    },
    async daemon(options) {
      const daemon = await startDaemon(sandbox, options);
      daemons.push(daemon);
      return daemon;
    },
    /** Run `host-events.py <event>` exactly as a host would: JSON on stdin, sandbox-owned env. */
    hook(event, { cwd = sandbox.workspace, session = "session-1", env = {} } = {}) {
      return sandbox.run("python3", [HOST_EVENTS, event], {
        input: JSON.stringify({ cwd, session_id: session }),
        env: {
          ZVEC_HOOK_STATE_DIR: hookState,
          ZVEC_GREP_MANAGED_WARNINGS_DIR: warnings,
          XDG_STATE_HOME: join(sandbox.home, ".local", "state"),
          ZVEC_GREP_PACKAGE_DIR: installedPackageDir(),
          ...env,
        },
      });
    },
    warningFiles() {
      return existsSync(warnings)
        ? readdirSync(warnings).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(readFileSync(join(warnings, name), "utf8")))
        : [];
    },
  };
}

const noEgress = (sandbox, what) => assert.deepEqual(sandbox.egressEvents(), [], `${what}: network egress was attempted`);

test("bridge happy path: start -> edit -> end reserves, the detached worker requests a refresh, the daemon indexes the change offline", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  const daemon = await f.daemon();
  const id = JSON.parse(readFileSync(join(f.sandbox.indexDir, "manifest.json"), "utf8")).id;

  const started = await f.hook("start");
  assert.equal(started.code, 0, started.stderr);
  assert.ok(existsSync(f.hookState), "start must persist a baseline snapshot");

  f.sandbox.writeWorkspaceFiles({
    "src/app.ts": `export function ${TOKENS.after}() {\n  return 2;\n}\n`,
    "src/extra.ts": `export function ${TOKENS.extra}() {\n  return 3;\n}\n`,
  });
  const ended = await f.hook("end");
  assert.equal(ended.code, 0, ended.stderr);

  const status = await daemon.waitStatus(f.sandbox.workspace, (s) => Boolean(s.last_success_at) && s.warning == null, { timeoutMs: 90_000 });
  assert.equal(status.indexed, true);
  assert.deepEqual((await ftsHits(f.sandbox, TOKENS.after)).files, ["src/app.ts"]);
  assert.deepEqual((await ftsHits(f.sandbox, TOKENS.extra)).files, ["src/extra.ts"]);
  assert.deepEqual((await ftsHits(f.sandbox, TOKENS.before)).files, [], "pre-edit content survived the refresh");
  assert.deepEqual(f.warningFiles(), [], "a successful turn must not leave a warning");
  assert.equal(JSON.parse(readFileSync(join(f.sandbox.indexDir, "manifest.json"), "utf8")).id, id, "refresh rebuilt the index");
  noEgress(f.sandbox, "bridge happy path");
});

test("bridge no-change turn: end releases the reservation without scheduling an index job", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  const daemon = await f.daemon();
  assert.equal((await f.hook("start")).code, 0);
  const before = fingerprintTree(f.sandbox.indexDir);
  const ended = await f.hook("end");
  assert.equal(ended.code, 0, ended.stderr);
  await sleep(3_000); // the detached worker has long finished diffing an unchanged workspace
  const status = (await daemon.status(f.sandbox.workspace)).json;
  assert.equal(status.last_success_at ?? null, null, "an unchanged turn must not run a refresh job");
  assert.equal(status.warning ?? null, null);
  assert.deepEqual(f.warningFiles(), []);
  const delta = Object.entries(fingerprintTree(f.sandbox.indexDir)).filter(([path, value]) => !path.startsWith("locks") && before[path] !== value);
  assert.deepEqual(delta, [], "index bytes changed on a no-change turn");
  noEgress(f.sandbox, "bridge no-change");
});

test("bridge failed snapshot: the worker releases the reservation as failed, persists a warning, the daemon records it, and the next turn still works", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  const daemon = await f.daemon();
  assert.equal((await f.hook("start")).code, 0);
  f.sandbox.writeWorkspaceFiles({ "src/app.ts": `export function ${TOKENS.after}() {}\n` });

  // `end` itself only reserves; the detached worker then fails to snapshot.
  const ended = await f.hook("end", { env: { ZVEC_GREP_PACKAGE_DIR: join(f.sandbox.root, "no-such-package") } });
  assert.equal(ended.code, 0, ended.stderr);

  const warned = await daemon.waitStatus(f.sandbox.workspace, (s) => Boolean(s.warning), { timeoutMs: 60_000 });
  assert.ok(warned.warning, "release outcome=failed must surface as a daemon warning");
  const deadline = Date.now() + 30_000;
  while (f.warningFiles().length === 0 && Date.now() < deadline) await sleep(100);
  const files = f.warningFiles();
  assert.equal(files.length, 1, "bridge must persist exactly one background warning");
  assert.equal(files[0].code, "snapshot_failed");
  assert.equal(files[0].root, f.sandbox.workspace);
  assert.equal(daemon.process.child.exitCode, null);
  assert.equal((await ftsHits(f.sandbox, TOKENS.after)).files.length, 0, "a failed snapshot must not index anything");

  // Not wedged: a later turn with a healthy bridge reserves, refreshes and clears the warning.
  const again = await f.hook("end");
  assert.equal(again.code, 0, again.stderr);
  const healthy = await daemon.waitStatus(f.sandbox.workspace, (s) => Boolean(s.last_success_at) && s.warning == null, { timeoutMs: 90_000 });
  assert.equal(healthy.indexed, true);
  assert.deepEqual((await ftsHits(f.sandbox, TOKENS.after)).files, ["src/app.ts"]);
  noEgress(f.sandbox, "bridge failed snapshot");
});

test("bridge with no index: start/end create no state, no .zvec-grep, and never contact a daemon", SLOW, async (t) => {
  const f = fixture(t);
  f.sandbox.writeWorkspaceFiles(WORKSPACE);
  const before = fingerprintTree(f.sandbox.workspace);
  assert.equal((await f.hook("start")).code, 0);
  f.sandbox.writeWorkspaceFiles({ "src/app.ts": "export const changed = 1;\n" });
  const edited = fingerprintTree(f.sandbox.workspace);
  assert.equal((await f.hook("end")).code, 0);
  assert.deepEqual(fingerprintTree(f.sandbox.workspace), edited, "bridge touched the workspace");
  assert.ok(!existsSync(f.sandbox.indexDir));
  assert.ok(!existsSync(f.hookState) || readdirSync(f.hookState).length === 0, "no baseline may be stored for an unindexed workspace");
  assert.ok(!existsSync(join(f.sandbox.zvecHome, "daemon")), "bridge started or touched a daemon");
  assert.notDeepEqual(before, edited);
  noEgress(f.sandbox, "bridge no index");
});

test("bridge index deleted mid-turn: nothing is recreated and a warning is persisted", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  const daemon = await f.daemon();
  assert.equal((await f.hook("start")).code, 0);
  rmSync(f.sandbox.indexDir, { recursive: true, force: true });
  f.sandbox.writeWorkspaceFiles({ "src/app.ts": `export function ${TOKENS.after}() {}\n` });
  const ended = await f.hook("end");
  assert.equal(ended.code, 0, ended.stderr);
  const deadline = Date.now() + 30_000;
  while (f.warningFiles().length === 0 && Date.now() < deadline) await sleep(100);
  assert.ok(f.warningFiles().length >= 1, "an unusable index must produce a background warning");
  await sleep(1_500);
  assert.deepEqual(indexArtifacts(f.sandbox), { "index.zvec": false, "files.zvec": false, "manifest.json": false });
  assert.equal(daemon.process.child.exitCode, null);
  noEgress(f.sandbox, "bridge deleted index");
});

test("bridge with no daemon: end fails closed with a persisted warning and exit 0, and never starts one", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  assert.equal((await f.hook("start")).code, 0);
  f.sandbox.writeWorkspaceFiles({ "src/app.ts": `export function ${TOKENS.after}() {}\n` });
  const ended = await f.hook("end");
  assert.equal(ended.code, 0, "a hook must never fail the host turn");
  const files = f.warningFiles();
  assert.equal(files.length, 1);
  assert.equal(files[0].code, "hook_failed");
  assert.match(files[0].message, /FileNotFoundError/, "must fail because there is no daemon record, not for another reason");
  assert.ok(!existsSync(join(f.sandbox.zvecHome, "daemon", "instance.lock")), "bridge launched a daemon");
  assert.equal((await ftsHits(f.sandbox, TOKENS.after)).files.length, 0);
  noEgress(f.sandbox, "bridge no daemon");
});

test("bridge refuses an unsafe daemon record (group/world-accessible instance.lock) and never connects", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  assert.equal((await f.hook("start")).code, 0);
  const daemonDir = join(f.sandbox.zvecHome, "daemon");
  mkdirSync(daemonDir, { recursive: true, mode: 0o700 });
  chmodSync(daemonDir, 0o700);
  const lock = join(daemonDir, "instance.lock");
  writeFileSync(lock, JSON.stringify({ managed: true, ready: true, managed_api: 1, pid: process.pid, instanceToken: "forged", managedSocket: join(f.sandbox.root, "forged.sock") }));
  chmodSync(lock, 0o666);
  f.sandbox.writeWorkspaceFiles({ "src/app.ts": `export function ${TOKENS.after}() {}\n` });
  const ended = await f.hook("end");
  assert.equal(ended.code, 0);
  assert.equal(f.warningFiles()[0]?.code, "hook_failed");
  assert.match(f.warningFiles()[0].message, /PermissionError/, "must be refused by the permission check, before any connection");
  assert.ok(!existsSync(join(f.sandbox.root, "forged.sock")));
  noEgress(f.sandbox, "bridge forged record");
});

test("managed socket contract: owner-only socket + identity bound to the instance record; reserve/release round-trip", SLOW, async (t) => {
  const f = fixture(t);
  await f.index();
  const daemon = await f.daemon();
  const record = readInstanceRecord(f.sandbox);
  assert.equal(record.managed, true);
  assert.equal(record.ready, true);
  assert.equal(record.managed_api, 1);
  assert.ok(record.managedSocket.startsWith("/"));
  const { statSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  assert.equal(statSync(dirname(record.managedSocket)).mode & 0o777, 0o700);
  assert.equal(statSync(record.managedSocket).mode & 0o777, 0o600);

  const identity = await socketRequest(record.managedSocket, "GET", "/managed/identity");
  assert.equal(identity.status, 200, identity.text);
  assert.equal(identity.json.managed, true);
  assert.equal(identity.json.pid, record.pid);
  assert.equal(identity.json.instance_token, record.instanceToken);
  assert.equal(identity.json.os_sandbox.remote, "denied");

  const reserved = await socketRequest(record.managedSocket, "POST", "/managed/reserve", { root: f.sandbox.workspace, reason: "turn_end" });
  assert.equal(reserved.status, 200, reserved.text);
  assert.equal(reserved.json.status, "reserved");
  assert.equal(typeof reserved.json.reservation_id, "string");
  const released = await socketRequest(record.managedSocket, "POST", "/managed/release", { root: f.sandbox.workspace, reservation_id: reserved.json.reservation_id, outcome: "failed" });
  assert.equal(released.status, 200, released.text);
  assert.deepEqual([released.json.status, released.json.outcome], ["released", "failed"]);
  const status = (await daemon.status(f.sandbox.workspace)).json;
  assert.ok(status.warning, "a failed release must be recorded as a warning");
  noEgress(f.sandbox, "socket contract");
});
