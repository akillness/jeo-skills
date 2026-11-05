// Regression coverage for the defects an independent review (DaemonReview, F1-F12)
// found in the managed zvec daemon. Every test states the defect it pins, fails on
// the pre-fix behaviour, and none of them is satisfied by weakening an assertion
// elsewhere. Most are model-free (fabricated index / unit-level) and run on any
// macOS host with the installed @zvec/zvec-grep@0.2.2; the ones that need a real
// embedding are marked and skip, with a reason, if the local model artifact is absent.
// Run: node --test .agent-skills/zvec-grep/scripts/test/
import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DAEMON_DIR, DAEMON_MAIN, EGRESS_GUARD_MODULE, EXISTING_INDEX_MODULE, PROBE_PRELOAD, TRIPWIRE, buildLocalIndex,
  createSandbox, fabricateIndex, fingerprintTree, ftsHits, inspectStates, installedPackageDir, localModelArtifactAvailable,
  listenerPid, mcpSearch, mtimeTree, readInstanceRecord, realZg, runScript, runUnderDaemonProfile, sleep, socketRequest, startDaemon,
  trustRegistryPath, trustRoot, DAEMON_INTEGRATION_DISABLED,
} from "./harness.mjs";

const DARWIN = process.platform === "darwin";
const HAVE_ZG = Boolean(realZg());
const HAVE_MODEL = HAVE_ZG && localModelArtifactAvailable();
const MACOS = { skip: !DARWIN && "managed daemon and its kernel sandbox are macOS-only" };
const MODEL = { skip: (!DARWIN && "macOS only") || (!HAVE_MODEL && "needs zg 0.2.2 and an already-downloaded local model artifact"), timeout: 300_000 };
const DAEMON_SKIP = DAEMON_INTEGRATION_DISABLED && "managed daemon integration disabled: macOS rejects nested sandbox profiles; no fixture-confined production launcher is proven";
const url = (path) => pathToFileURL(path).href;
const noEgress = (sandbox, what) => assert.deepEqual(sandbox.egressEvents(), [], `${what}: network egress was attempted`);

function lab(t) {
  const sandbox = createSandbox();
  const daemons = [];
  t.after(async () => {
    for (const daemon of daemons) await daemon.stop().catch(() => {});
    sandbox.cleanup();
  });
  return {
    sandbox,
    async daemon(options) {
      const daemon = await startDaemon(sandbox, options);
      daemons.push(daemon);
      return daemon;
    },
  };
}

// ===========================================================================
// F1  No-create must survive import order (native ESM snapshot of ZVecCreateAndOpen)
// ===========================================================================
const GUARD_SCRIPT = (order) => `
  import { createRequire } from 'node:module';
  import { dirname, join } from 'node:path';
  import { existsSync, mkdirSync } from 'node:fs';
  import { pathToFileURL } from 'node:url';
  const pkgDir = process.env.ZVEC_GREP_PACKAGE_DIR;
  const requireFromPackage = createRequire(join(pkgDir, 'package.json'));
  const cjsPath = requireFromPackage.resolve('@zvec/zvec');
  const esmUrl = pathToFileURL(join(dirname(cjsPath), 'index.mjs')).href;
  const guard = await import(${JSON.stringify(url(EGRESS_GUARD_MODULE))});
  const work = process.argv[1];
  const install = () => guard.installGuards({
    allowedExecutables: [requireFromPackage('@vscode/ripgrep').rgPath],
    createRoots: [work], zvecCjsPath: cjsPath, guardModuleUrl: ${JSON.stringify(url(EGRESS_GUARD_MODULE))},
  });
  if (${JSON.stringify(order)} === 'esm-first') await import(esmUrl);
  install();
  let selfTest = 'passed';
  try { await guard.selfTestGuards({ zvecEsmUrl: esmUrl }); } catch (error) { selfTest = { code: error.code, message: String(error.message).slice(0, 300) }; }
  // What a race-created empty collection would look like: native create on an absent path.
  const probe = join(work, 'absent', '.zvec-probe', 'index.zvec');
  mkdirSync(join(work, 'absent'), { recursive: true });
  const native = await import(esmUrl);
  native.ZVecInitialize({ logLevel: native.ZVecLogLevel.WARN });
  const schema = new native.ZVecCollectionSchema({
    name: 'probe',
    fields: [{ name: 'text', dataType: native.ZVecDataType.STRING, nullable: false }],
    vectors: { name: 'embedding', dataType: native.ZVecDataType.VECTOR_FP32, dimension: 4, indexParams: { indexType: native.ZVecIndexType.HNSW, metricType: native.ZVecMetricType.COSINE } },
  });
  let create;
  try { native.ZVecCreateAndOpen(probe, schema); create = { threw: false }; }
  catch (error) { create = { threw: true, code: error.code ?? null, message: String(error.message).slice(0, 120) }; }
  console.log(JSON.stringify({ selfTest, create, created: existsSync(join(work, 'absent', '.zvec-probe')) }));
`;

test("F1: guards installed before the native ESM entry make ZVecCreateAndOpen throw MANAGED_NO_CREATE and create nothing", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  const run = await runScript(sandbox, GUARD_SCRIPT("guards-first"), [join(sandbox.root, "guard-work")]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.selfTest, "passed", JSON.stringify(run.json));
  assert.equal(run.json.create.threw, true, "ZVecCreateAndOpen succeeded: the no-create guard is not effective");
  assert.equal(run.json.create.code, "MANAGED_NO_CREATE", JSON.stringify(run.json.create));
  assert.equal(run.json.created, false, "a native collection was created despite the guard");
  noEgress(sandbox, "guard order");
});

test("F1: importing the native ESM entry BEFORE the guards is detected — selfTestGuards must reject (the daemon exits 70 on this)", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  const run = await runScript(sandbox, GUARD_SCRIPT("esm-first"), [join(sandbox.root, "guard-work")]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(typeof run.json.selfTest, "object", `the self-test passed although the ESM snapshot was unguarded: ${JSON.stringify(run.json)}`);
  assert.equal(run.json.selfTest.code, "GUARD_SELF_TEST_FAILED");
  assert.match(run.json.selfTest.message, /native create/i);
  // This is exactly the unsafe state the self-test exists to catch: an unguarded snapshot really creates.
  assert.equal(run.json.create.threw, false, "control: with the wrong import order the unguarded native create must really succeed, otherwise this test proves nothing");
  assert.equal(run.json.created, true);
});

test("F1: in the LIVE daemon process the ESM-snapshot ZVecCreateAndOpen is guarded (probed from inside the sandboxed listener)", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const out = join(sandbox.zvecHome, "probe-result.json");
  await start({ env: { ZVEC_TEST_PROBE_OUT: out, NODE_OPTIONS: `--import=${TRIPWIRE} --import=${PROBE_PRELOAD}` } });
  const deadline = Date.now() + 15_000;
  while (!existsSync(out) && Date.now() < deadline) await sleep(50);
  assert.ok(existsSync(out), "the in-process probe never reported (is the daemon listener process still alive?)");
  const probe = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(probe.probeError, undefined, probe.probeError);
  assert.equal(probe.nativeCreate.threw, true, "ZVecCreateAndOpen succeeded inside the daemon: the no-create guard is not effective");
  assert.equal(probe.nativeCreate.code, "MANAGED_NO_CREATE");
  assert.equal(probe.nativeCreate.pathExists, false, "a native collection directory was created inside the daemon");
  assert.ok(!existsSync(join(sandbox.zvecHome, "probe-native-create", ".zvec-probe")));
});

// ===========================================================================
// F3 / F4 / F11-env  The kernel profile carries the claims (checked under the daemon's REAL profile, no JS guard)
// ===========================================================================
const PROFILE_PROBE = `
  import net from 'node:net';
  import { spawnSync } from 'node:child_process';
  import { mkdirSync, writeFileSync, rmSync, rmdirSync, unlinkSync, existsSync, symlinkSync, renameSync, mkdtempSync } from 'node:fs';
  import { join } from 'node:path';
  const [port, workspace, home] = process.argv.slice(1);
  const out = {};
  const attempt = (fn) => { try { fn(); return 'ok'; } catch (error) { return error.code ?? String(error.message).slice(0, 60); } };
  const listen = (host, p) => new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(error.code ?? 'error'));
    server.listen({ host, port: p }, () => server.close(() => resolve('ok')));
  });
  const connect = (host, p) => new Promise((resolve) => {
    const socket = net.connect({ host, port: p });
    const timer = setTimeout(() => { socket.destroy(); resolve('TIMEOUT'); }, 2000);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve('connected'); });
    socket.once('error', (error) => { clearTimeout(timer); resolve(error.code ?? 'error'); });
  });
  out.bindWildcardOwnV4 = await listen('0.0.0.0', Number(port));
  out.bindWildcardOwnV6 = await listen('::', Number(port));
  out.bindOwnPort = await listen('127.0.0.1', Number(port));
  out.bindWildcardV4 = await listen('0.0.0.0', 0);
  out.bindWildcardV6 = await listen('::', 0);
  out.bindLoopbackOtherPort = await listen('127.0.0.1', 0);
  out.connectOwnPort = await connect('127.0.0.1', Number(port));
  out.connectRemote = await connect('192.0.2.1', 9);
  out.connectOtherLoopback = await connect('127.0.0.1', 1);
  // Unix sockets: serving is allowed, dialing out (mDNSResponder == DNS) is not.
  const sock = join(home, 'daemon', 'probe.sock');
  mkdirSync(join(home, 'daemon'), { recursive: true });
  const unix = net.createServer((s) => s.end());
  out.bindUnix = await new Promise((resolve) => { unix.once('error', (e) => resolve(e.code)); unix.listen(sock, () => resolve('ok')); });
  out.connectUnix = await new Promise((resolve) => { const s = net.connect(sock); s.once('connect', () => { s.destroy(); resolve('connected'); }); s.once('error', (e) => resolve(e.code ?? 'error')); });
  out.connectSystemUnix = await new Promise((resolve) => { const s = net.connect('/var/run/mDNSResponder'); s.once('connect', () => { s.destroy(); resolve('connected'); }); s.once('error', (e) => resolve(e.code ?? 'error')); });
  // exec
  out.execId = (() => { const r = spawnSync('/usr/bin/id', ['-u']); return r.error ? r.error.code : 'ran'; })();
  out.execNode = (() => { const r = spawnSync(process.execPath, ['-e', '0']); return r.error ? r.error.code : (r.status === 0 ? 'ran' : 'status-' + r.status); })();
  out.execSh = (() => { const r = spawnSync('/bin/sh', ['-c', 'true']); return r.error ? r.error.code : 'ran'; })();
  // files
  out.writeOutsideRoots = attempt(() => writeFileSync(join(workspace, 'src', 'planted.txt'), 'x'));
  out.writeWorkspaceSource = attempt(() => writeFileSync(join(workspace, 'src', 'a.ts'), 'tampered'));
  out.writeHome = attempt(() => writeFileSync(join(home, 'state.txt'), 'x'));
  // src exists, so these hit the .zvec-grep rule itself rather than failing on a missing parent.
  out.mkdirNewZvecGrep = attempt(() => mkdirSync(join(workspace, 'src', '.zvec-grep')));
  out.mkdirNewZvecGrepRecursive = attempt(() => mkdirSync(join(workspace, 'fresh', '.zvec-grep'), { recursive: true }));
  out.mkdirNewZvecGrepBuffer = attempt(() => mkdirSync(Buffer.from(join(workspace, 'src', '.zvec-grep')), { recursive: true }));
  out.symlinkZvecGrep = attempt(() => symlinkSync(join(home, 'x'), join(workspace, 'src', '.zvec-grep')));
  out.mkdirTopLevelZvecGrep = attempt(() => mkdirSync(join(home, 'unregistered', '.zvec-grep')));
  out.mkdirSiblingZvecGrep = attempt(() => mkdirSync(join(workspace, '..', 'unregistered', '.zvec-grep')));
  out.mkdtempInWorkspace = attempt(() => mkdtempSync(join(workspace, 'src', 'tmp-')));
  // Existing native stores may mutate internally; their top-level entries remain protected.
  const idx = join(workspace, '.zvec-grep');
  out.writeInsideStore = attempt(() => writeFileSync(join(idx, 'index.zvec', 'LOCK'), 'x'));
  out.writeManifest = attempt(() => writeFileSync(join(idx, 'manifest.json'), '{}'));
  out.unlinkManifest = attempt(() => unlinkSync(join(idx, 'manifest.json')));
  out.createMissingManifest = attempt(() => writeFileSync(join(workspace, '..', 'partial', '.zvec-grep', 'manifest.json'), '{}'));
  out.writeUngranted = attempt(() => writeFileSync(join(workspace, '..', 'ungranted', '.zvec-grep', 'index.zvec', 'LOCK'), 'x'));
  out.writeSymlinkEscape = attempt(() => writeFileSync(join(idx, 'index.zvec', 'escape', 'planted'), 'x'));
  const scratch = join(idx, 'files.zvec', 'scratch');
  out.createInternal = attempt(() => writeFileSync(scratch, 'temporary'));
  out.unlinkInternal = attempt(() => unlinkSync(scratch));
  out.renameStore = attempt(() => renameSync(join(idx, 'files.zvec'), join(idx, 'files.moved')));
  out.rmdirStore = attempt(() => rmdirSync(join(idx, 'files.zvec')));
  out.renameIndexHome = attempt(() => renameSync(idx, join(workspace, '.zvec-grep-moved')));
  out.rmdirEmptyIndexHome = attempt(() => rmdirSync(join(workspace, '..', 'partial', '.zvec-grep')));
  out.storesStillThere = existsSync(join(idx, 'index.zvec')) && existsSync(join(idx, 'files.zvec'));
  out.storeSentinelSurvived = existsSync(join(idx, 'files.zvec', 'sentinel'));
  console.log(JSON.stringify(out));
  process.exit(0);
`;

test("F3/F4: under the daemon's real kernel profile — no TCP bind or outbound network, exec only node/rg, exact index grants and no protected entry creation or removal", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const a = 1;\n" });
  fabricateIndex(sandbox); // an existing, trusted-shaped index home to probe inside of
  writeFileSync(join(sandbox.indexDir, 'files.zvec', 'sentinel'), 'must-survive');
  mkdirSync(join(sandbox.zvecHome, 'unregistered'));
  mkdirSync(join(sandbox.root, 'unregistered'));
  mkdirSync(join(sandbox.root, 'partial', '.zvec-grep'), { recursive: true });
  mkdirSync(join(sandbox.root, 'ungranted', '.zvec-grep', 'index.zvec'), { recursive: true });
  mkdirSync(join(sandbox.root, 'outside'));
  symlinkSync(join(sandbox.root, 'outside'), join(sandbox.indexDir, 'index.zvec', 'escape'));
  const port = 41000 + (process.pid % 2000);
  const run = await runUnderDaemonProfile(sandbox, { port, indexHomes: [sandbox.indexDir, join(sandbox.root, 'partial', '.zvec-grep')] }, PROFILE_PROBE, [String(port), sandbox.workspace, sandbox.zvecHome]);
  assert.equal(run.code, 0, `probe failed under the profile: ${run.stderr}`);
  const r = run.json;
  assert.ok(r, run.stdout + run.stderr);
  t.diagnostic(JSON.stringify(r));
  // network: bind
  assert.equal(r.bindOwnPort, "EPERM", "TCP listeners must be denied");
  assert.equal(r.bindWildcardOwnV4, "EPERM", "configured port can bind to IPv4 wildcard");
  assert.equal(r.bindWildcardOwnV6, "EPERM", "configured port can bind to IPv6 wildcard");
  assert.equal(r.bindWildcardV4, "EPERM", "0.0.0.0 listener allowed: LAN-reachable");
  assert.equal(r.bindWildcardV6, "EPERM", ":: listener allowed: LAN-reachable");
  assert.equal(r.bindLoopbackOtherPort, "EPERM", "arbitrary loopback listener allowed");
  assert.equal(r.bindUnix, "ok", "the daemon's owner-only socket must be bindable");
  // network: connect
  assert.equal(r.connectOwnPort, "EPERM", "TCP outbound must be denied");
  assert.equal(r.connectRemote, "EPERM");
  assert.equal(r.connectOtherLoopback, "EPERM", "any local service is reachable as a pivot");
  assert.equal(r.connectUnix, "EPERM", "outbound Unix sockets (mDNSResponder/DNS) must be denied");
  assert.equal(r.connectSystemUnix, "EPERM");
  // exec
  assert.equal(r.execNode, "ran");
  assert.equal(r.execId, "EPERM", "arbitrary executables can be spawned");
  assert.equal(r.execSh, "EPERM", "a shell can be spawned");
  // writes
  assert.equal(r.writeOutsideRoots, "EPERM", "workspace files can be created");
  assert.equal(r.writeWorkspaceSource, "EPERM", "workspace sources can be modified");
  assert.equal(r.writeHome, "ok");
  assert.equal(r.mkdirNewZvecGrep, "EPERM", "a new .zvec-grep can be created");
  assert.equal(r.mkdirNewZvecGrepRecursive, "EPERM", "recursive mkdir can create a new .zvec-grep");
  assert.equal(r.mkdirNewZvecGrepBuffer, "EPERM", "Buffer-path mkdir bypasses the no-create rule");
  assert.equal(r.symlinkZvecGrep, "EPERM");
  assert.equal(r.mkdirTopLevelZvecGrep, "EPERM", "daemon state root permits creating a new top-level index home");
  assert.equal(r.mkdirSiblingZvecGrep, "EPERM", "an unregistered workspace permits creating a new index home");
  assert.equal(r.mkdtempInWorkspace, "EPERM");
  assert.equal(r.writeInsideStore, "ok", "collection internals must stay writable or refresh cannot work");
  assert.equal(r.writeManifest, "ok", "existing manifest must remain writable for refresh");
  assert.equal(r.unlinkManifest, "EPERM", "manifest can be removed");
  assert.equal(r.createMissingManifest, "EPERM", "a missing manifest can be recreated");
  assert.equal(r.writeUngranted, "EPERM", "an unregistered existing index is writable");
  assert.equal(r.writeSymlinkEscape, "EPERM", "a symlink escapes the granted index home");
  assert.equal(r.createInternal, "ok", "native store must permit internal file creation");
  assert.equal(r.unlinkInternal, "ok", "native store must permit internal file removal");
  assert.equal(r.renameStore, "EPERM", "an index store can be moved away");
  assert.equal(r.rmdirStore, "EPERM", "an index store can be removed");
  assert.equal(r.renameIndexHome, "EPERM", "existing index home can be moved away");
  assert.equal(r.rmdirEmptyIndexHome, "EPERM", "an empty index home can be removed");
  assert.equal(r.storeSentinelSurvived, true, "top-level probes changed existing contents");
  assert.equal(r.storesStillThere, true, "an index store disappeared during the probe");
  noEgress(sandbox, "profile claims");
});

test("native store: internal files may be created and removed without changing existing content", MODEL, async (t) => {
  const { sandbox } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/sample.ts": "export const persistedCanary = 123;\n" });
  await buildLocalIndex(sandbox);
  const store = join(sandbox.indexDir, "files.zvec");
  const before = fingerprintTree(store);
  const result = await runUnderDaemonProfile(sandbox, { port: 41991, indexHomes: [sandbox.indexDir] }, `
    import { writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
    import { join } from 'node:path';
    const scratch = join(process.argv[1], 'managed-test-scratch');
    writeFileSync(scratch, 'temporary');
    unlinkSync(scratch);
    try { rmdirSync(process.argv[1]); console.log(JSON.stringify({result: 'ok'})); }
    catch (error) { console.log(JSON.stringify({result: error.code})); }
  `, [store]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json?.result, "EPERM", "top-level store removal must be denied");
  assert.deepEqual(fingerprintTree(store), before, "the internal mutation damaged existing native data");
  noEgress(sandbox, "native store mutation");
});

test("F3: the real daemon exposes no credential-named environment to its sandboxed process and listens on loopback only", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  const out = join(sandbox.zvecHome, "probe-result.json");
  const daemon = await start({ env: {
    ZVEC_TEST_PROBE_OUT: out, NODE_OPTIONS: `--import=${TRIPWIRE} --import=${PROBE_PRELOAD}`,
    OPENAI_API_KEY: "sk-regression-probe-0001", ANTHROPIC_API_KEY: "sk-ant-regression-probe", GITHUB_TOKEN: "ghp_regressionprobe", AWS_SECRET_ACCESS_KEY: "regression-aws-probe",
  } });
  const deadline = Date.now() + 15_000;
  while (!existsSync(out) && Date.now() < deadline) await sleep(50);
  const probe = JSON.parse(readFileSync(out, "utf8"));
  const leaked = probe.envNames.filter((name) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i.test(name) && !/^ZVEC_GREP_SERVER_TOKEN(_FILE)?$/.test(name));
  assert.deepEqual(leaked, [], "credential-looking variables reached the daemon process");
  const { spawnSync } = await import("node:child_process");
  const listening = spawnSync("lsof", ["-nP", "-a", "-p", String(daemon.listenerPid), "-iTCP", "-sTCP:LISTEN", "-Fn"], { encoding: "utf8" }).stdout;
  const addresses = [...listening.matchAll(/^n(.+)$/gm)].map((m) => m[1]);
  assert.ok(addresses.length >= 1, "no TCP listener found for the daemon");
  assert.ok(addresses.every((address) => address.startsWith("127.0.0.1:")), `daemon listens beyond loopback: ${addresses}`);
});

// ===========================================================================
// F2  Trust is re-checked on every job (watcher included) and pins the manifest
// ===========================================================================
test("F2: `trust remove` while the daemon is running stops watcher-driven writes; no explicit API call needed to be refused", { ...MODEL, skip: MODEL.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/watch.ts": "export function watchedoriginalmarker() { return 1; }\n", "notes.md": "# Notes\n\nWatcher fixture.\n" });
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  const daemon = await start();
  // Activate the runtime (and with it the stock file watcher) for this root.
  const first = await daemon.refresh(sandbox.workspace, { wait: true });
  assert.ok(["refreshed", "unchanged"].includes(first.json.status), first.text);

  // Positive control: the watcher alone (no API call) must index an edit while the root is trusted.
  sandbox.writeWorkspaceFiles({ "src/watch.ts": "export function watchedtrustedmarker() { return 2; }\n" });
  const deadline = Date.now() + 45_000;
  let controlMs = null;
  const started = Date.now();
  while (Date.now() < deadline) {
    if ((await ftsHits(sandbox, "watchedtrustedmarker")).files.includes("src/watch.ts")) { controlMs = Date.now() - started; break; }
    await sleep(500);
  }
  assert.notEqual(controlMs, null, "positive control failed: watcher did not index a trusted edit within 45 seconds");
  t.diagnostic(`watcher indexed a trusted edit after ${controlMs}ms`);

  const removed = await sandbox.run(process.execPath, [DAEMON_MAIN, "trust", "remove", "--root", sandbox.workspace], { env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() } });
  assert.equal(removed.code, 0, removed.stderr);
  assert.equal(JSON.parse(removed.stdout).removed, true);

  sandbox.writeWorkspaceFiles({ "src/watch.ts": "export function watcheduntrustedmarker() { return 3; }\n" });
  await sleep(Math.max(15_000, controlMs * 3));
  assert.deepEqual((await ftsHits(sandbox, "watcheduntrustedmarker")).files, [], "the watcher kept writing to an index whose trust was revoked");
  const status = (await daemon.status(sandbox.workspace)).json;
  assert.equal(status.trusted, false);
  const refresh = await daemon.refresh(sandbox.workspace, { wait: true });
  assert.equal(refresh.json.status, "skipped_untrusted", refresh.text);
  noEgress(sandbox, "trust revoke");
});

test("F2: trust is pinned to the manifest — changing the id, widening rootPaths, or swapping the embedding after `trust add` makes the root untrusted", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const a = 1;\n" });
  const secretDir = join(sandbox.root, "outside-secrets");
  mkdirSync(secretDir);
  writeFileSync(join(secretDir, "secret.ts"), "export const pinnedsecretmarker = 1;\n");
  const secretBefore = fingerprintTree(secretDir);
  fabricateIndex(sandbox);
  const registered = await trustRoot(sandbox);
  assert.equal(JSON.parse(registered.stdout).registered, true);
  const manifestPath = join(sandbox.indexDir, "manifest.json");
  const pristine = readFileSync(manifestPath, "utf8");
  const daemon = await start();
  const check = async () => (await daemon.request("POST", "/managed/check-root", { root: sandbox.workspace })).json;
  assert.equal((await check()).status, "trusted");

  const mutate = (fn) => { const m = JSON.parse(pristine); fn(m); writeFileSync(manifestPath, JSON.stringify(m, null, 2)); };
  for (const [label, fn] of [
    ["manifest id", (m) => { m.id = "11111111-1111-4111-8111-111111111111"; }],
    ["widened rootPaths", (m) => { m.rootPaths.push({ absolutePath: secretDir, recursive: true }); }],
    ["embedding model", (m) => { m.embedding.model = "other-model"; }],
    ["embedding dimension", (m) => { m.embedding.dimension = 512; }],
  ]) {
    mutate(fn);
    const verdict = await check();
    assert.equal(verdict.status, "untrusted", `${label} changed but the root is still trusted: ${JSON.stringify(verdict)}`);
    const refresh = await daemon.refresh(sandbox.workspace, { wait: true });
    assert.equal(refresh.json.status, "skipped_untrusted", `${label}: ${refresh.text}`);
    const diff = await daemon.request("POST", "/managed/diff", { root: sandbox.workspace });
    assert.equal(diff.json.status, "skipped_untrusted", `${label}: diff must be gated too: ${diff.text}`);
    writeFileSync(manifestPath, pristine);
    assert.equal((await check()).status, "trusted", `restoring the manifest must restore trust (${label})`);
  }
  assert.deepEqual(fingerprintTree(secretDir), secretBefore, "outside-scope fixture changed");
  noEgress(sandbox, "trust pin");
});

test("F2: `updatedTime` churn from ordinary refreshes must NOT de-trust a root (pin covers identity/scope/schema, not bookkeeping)", { ...MODEL, skip: MODEL.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const trustchurnmarker = 1;\n" });
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  const daemon = await start();
  for (let i = 0; i < 2; i += 1) {
    sandbox.writeWorkspaceFiles({ "src/a.ts": `export const trustchurnmarker = ${i + 2};\n` });
    const result = await daemon.refresh(sandbox.workspace, { wait: true });
    assert.ok(["refreshed", "unchanged"].includes(result.json.status), `refresh #${i + 1}: ${result.text}`);
  }
  const verdict = (await daemon.request("POST", "/managed/check-root", { root: sandbox.workspace })).json;
  assert.equal(verdict.status, "trusted", `normal refreshes de-trusted the root: ${JSON.stringify(verdict)}`);
});

test("trust registration is CLI-only: the HTTP/socket API cannot register, and `trust add` refuses a root without a ready index", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const a = 1;\n" });
  const missing = await sandbox.run(process.execPath, [DAEMON_MAIN, "trust", "add", "--root", sandbox.workspace], { env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() } });
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /refusing to register/);
  assert.ok(!existsSync(trustRegistryPath(sandbox)), "a refused registration still wrote the registry");
  assert.ok(!existsSync(sandbox.indexDir));

  fabricateIndex(sandbox);
  const daemon = await start();
  const record = readInstanceRecord(sandbox);
  for (const path of ["/managed/trust", "/managed/trust/add", "/managed/register", "/managed/trust-add"]) {
    for (const response of [
      await daemon.request("POST", path, { root: sandbox.workspace }),
      await socketRequest(record.managedSocket, "POST", path, { root: sandbox.workspace }),
    ]) {
      assert.ok([404, 405].includes(response.status), `${path} answered ${response.status}: trust must not be registrable over the API`);
    }
  }
  assert.ok(!existsSync(trustRegistryPath(sandbox)));
  assert.equal((await daemon.request("POST", "/managed/check-root", { root: sandbox.workspace })).json.status, "untrusted");
});

// ===========================================================================
// F5 / F6  Warning store: atomic clear, future-dated warnings
// ===========================================================================
const STATE_URL = url(join(DAEMON_DIR, "state.mjs"));
const CONTROLLER_URL = url(join(DAEMON_DIR, "controller.mjs"));

test("warning store distinguishes absent records from malformed and unreadable records", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore } = await import(STATE_URL);
  const store = new WarningStore(join(sandbox.root, 'warning-state'));
  const root = '/isolated/test-root';
  assert.equal(store.read(root), undefined, 'an absent warning must be treated as absent');
  mkdirSync(store.directory, { recursive: true });
  const path = store.path(root);
  writeFileSync(path, '{broken json');
  assert.throws(() => store.read(root), 'malformed JSON must not be treated as no warning');
  assert.throws(() => store.clearIfResolvedBy(root, Date.now()), 'a malformed warning must not be cleared');
  assert.equal(readFileSync(path, 'utf8'), '{broken json', 'a malformed warning must remain at its canonical path');
  writeFileSync(path, JSON.stringify({ code: 4, message: 'invalid' }));
  assert.throws(() => store.read(root), 'invalid warning fields must not be treated as no warning');
  rmSync(path);
  mkdirSync(path);
  assert.throws(() => store.read(root), 'an unreadable warning path must not be treated as no warning');
});

test("timed-out search is abandoned, records warning, and verified recovery reports it once", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const warnings = new WarningStore(join(sandbox.root, 'warnings'));
  const root = '/isolated/root';
  let controller;
  controller = new ManagedController({ warnings, reservations: new ReservationStore(join(sandbox.root, 'reservations')), barrierMs: 80,
    runJob: async () => { const startedAt = Date.now(); assert.equal(controller.takeDirectives(root).verify, true); return { state: 'succeeded', startedAt }; }, takeResult: () => ({}) });
  let attempt, finish;
  const first = controller.gate(root, a => { attempt = a; return new Promise(resolve => { finish = resolve; }); });
  await assert.rejects(first, { code: 'FRESHNESS_BARRIER_TIMEOUT' });
  assert.equal(attempt.abandoned, true);
  assert.equal(warnings.read(root).code, 'FRESHNESS_BARRIER_TIMEOUT');
  finish('late stale result');
  const recovered = await controller.gate(root, async () => 'fresh result');
  assert.equal(recovered.result, 'fresh result');
  assert.equal(recovered.recovered.code, 'FRESHNESS_BARRIER_TIMEOUT');
  assert.equal(warnings.read(root), undefined);
  assert.equal((await controller.gate(root, async () => 'fresh again')).recovered, undefined);
});

test("timeout fails closed even if warning persistence fails", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const warnings = new WarningStore(join(sandbox.root, 'warnings'));
  warnings.write = () => { throw new Error('warning storage failed'); };
  let controller;
  controller = new ManagedController({ warnings, reservations: new ReservationStore(join(sandbox.root, 'reservations')), barrierMs: 50, runJob: async root => { const startedAt = Date.now(); controller.takeDirectives(root); return { state: 'succeeded', startedAt }; }, takeResult: () => ({}) });
  await assert.rejects(controller.gate('/isolated/root', () => new Promise(() => {})));
  assert.equal(controller.needsVerify(controller.state('/isolated/root')), true, 'warning write failure must not mark the root fresh');
});

test("failed warning persistence leaves reservation durable across controller restart", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const warnings = new WarningStore(join(sandbox.root, 'warnings'));
  const reservations = new ReservationStore(join(sandbox.root, 'reservations'));
  const root = '/isolated/root';
  const options = { warnings, reservations, barrierMs: 30_000, runJob: async () => { throw new Error('unexpected repair'); }, takeResult: () => ({}) };
  const first = new ManagedController(options);
  const reservation = first.reserve(root);
  warnings.write = () => { throw new Error('storage failed'); };
  assert.throws(() => first.release(root, reservation.id, 'failed'), { code: 'WARNING_PERSIST_FAILED' });
  assert.equal(reservations.load(root).length, 1, 'the failed turn must remain durable');
  const restarted = new ManagedController(options);
  assert.equal(restarted.state(root).reservations.length, 1, 'restart must adopt the reservation');
  assert.equal(restarted.needsVerify(restarted.state(root)), true);
  first.release(root, reservation.id, 'unchanged');
  restarted.release(root, reservation.id, 'unchanged');
});

test("expired reservation survives warning write failure and is recovered after restart", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const warnings = new WarningStore(join(sandbox.root, 'warnings'));
  const reservations = new ReservationStore(join(sandbox.root, 'reservations'));
  const root = '/isolated/root';
  let controller;
  const options = { warnings, reservations, barrierMs: 80, runJob: async () => { const startedAt = Date.now(); controller.takeDirectives(root); return { state: 'succeeded', startedAt }; }, takeResult: () => ({}) };
  const originalWrite = warnings.write.bind(warnings);
  warnings.write = () => { throw new Error('storage failed'); };
  const first = new ManagedController(options);
  const reservation = first.reserve(root);
  await sleep(120);
  assert.equal(reservations.load(root).length, 1, 'expiry must not discard an unrecorded failure');
  warnings.write = originalWrite;
  controller = new ManagedController(options);
  controller.state(root);
  const end = Date.now() + 2000;
  while (reservations.load(root).length && Date.now() < end) await sleep(20);
  assert.equal(reservations.load(root).length, 0, 'restart failed to recover expired reservation');
  first.release(root, reservation.id, 'unchanged');
});

test("concurrent generation change prevents an older search result", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const root = '/isolated/root';
  let controller, release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  controller = new ManagedController({ warnings: new WarningStore(join(sandbox.root, 'warnings')), reservations: new ReservationStore(join(sandbox.root, 'reservations')), barrierMs: 1000,
    runJob: async () => { const startedAt = Date.now(); controller.takeDirectives(root); return { state: 'succeeded', startedAt }; }, takeResult: () => ({}) });
  const search = controller.gate(root, () => { entered(); return new Promise(resolve => { release = resolve; }); }).catch(error => error);
  await started;
  controller.recordBackgroundFailure(root, 'CONCURRENT_CHANGE', 'change during search');
  release('stale');
  const result = await search;
  assert.ok(result instanceof Error || result.result !== 'stale', 'generation change allowed stale result');
});

test("a second change and force for the same path survive an in-flight refresh", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const root = '/isolated/root';
  const path = 'src/unchanged-metadata.ts';
  let controller, release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const observed = [];
  controller = new ManagedController({ warnings: new WarningStore(join(sandbox.root, 'warnings')), reservations: new ReservationStore(join(sandbox.root, 'reservations')), barrierMs: 1000,
    runJob: async () => {
      const startedAt = Date.now();
      const directives = controller.takeDirectives(root);
      observed.push({ changed: [...directives.changed], force: [...directives.force] });
      if (observed.length === 1) { entered(); await new Promise(resolve => { release = resolve; }); }
      return { state: 'succeeded', startedAt };
    }, takeResult: () => ({}) });
  const first = controller.refresh(root, { changed: [path], force: [path] });
  await started;
  const second = controller.refresh(root, { changed: [path], force: [path] });
  release();
  await Promise.all([first, second]);
  assert.deepEqual(observed, [{ changed: [path], force: [path] }, { changed: [path], force: [path] }]);
});

test("hash verification drains delayed workers before index close and unlock after read errors", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  fabricateIndex(sandbox);
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { EventEmitter } from 'node:events';
    import { join } from 'node:path';
    const [root, code] = process.argv.slice(1);
    const home = join(root, '.zvec-grep');
    const events = [];
    fs.createReadStream = (path) => {
      const stream = new EventEmitter();
      if (path.endsWith('/bad')) setTimeout(() => stream.emit('error', Object.assign(new Error(code), { code })), 5);
      else setTimeout(() => { events.push('delayed-end'); stream.emit('data', Buffer.from('changed')); stream.emit('end'); }, 50);
      return stream;
    };
    syncBuiltinESMExports();
    const { refreshExistingIndex } = await import(${JSON.stringify(url(EXISTING_INDEX_MODULE))});
    const embedding = { provider: 'local', model: 'test', dimension: 1, metric: 'cosine' };
    const manifest = { id: 'fixture', path: home, indexVersion: 1, embedding, rootPaths: [root] };
    const storage = { listFiles: () => ['bad', 'slow'].map(id => ({ id, contentHash: 'original', indexStatus: { indexedTime: 1 } })), markFileFailed: () => events.push('mark') };
    const engine = {
      workspaceManifestPath: h => join(h, 'manifest.json'), readWorkspaceManifest: () => manifest,
      isWorkspaceIndexed: () => true, CURRENT_INDEX_VERSION: 1, hasWorkspaceIndexStorage: () => true,
      resolveWorkspaceIndexStoragePaths: h => ({ filesPath: join(h, 'files.zvec'), indexPath: join(h, 'index.zvec') }),
      assertDaemonWriteAllowed: () => ({ release: () => events.push('permit-release') }),
      acquireReadWriteLock: () => ({ release: () => events.push('unlock') }),
      scanRootPaths: async () => ({ files: ['bad', 'slow'].map(id => ({ id, absolutePath: join(root, id) })) }),
      WorkspaceIndex: class { constructor() { this.storage = storage; } close() { events.push('close'); } },
    };
    let error;
    try { await refreshExistingIndex(engine, { root, embeddingModel: { info: { provider: 'local', name: 'test', dimension: 1, metric: 'cosine' } }, directives: () => ({ changed: new Set(), force: new Set(), verify: true }) }); }
    catch (e) { error = e.code; }
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(JSON.stringify({ error, events }));
  `;
  for (const code of ['EACCES', 'EIO', 'ENOENT']) {
    const result = await runScript(sandbox, script, [sandbox.workspace, code]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.error, code, `read failure ${code} must propagate`);
    assert.deepEqual(result.json.events, ['delayed-end', 'mark', 'close', 'unlock', 'permit-release']);
  }
});

test("failure arriving during repair cannot be cleared by that repair", async (t) => {
  const { sandbox } = lab(t);
  const { WarningStore, ReservationStore } = await import(STATE_URL);
  const { ManagedController } = await import(CONTROLLER_URL);
  const warnings = new WarningStore(join(sandbox.root, 'warnings'));
  const root = '/isolated/root';
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  let controller;
  controller = new ManagedController({ warnings, reservations: new ReservationStore(join(sandbox.root, 'reservations')), barrierMs: 500,
    runJob: async () => { const startedAt = Date.now(); controller.takeDirectives(root); entered(); await new Promise(resolve => { release = resolve; }); return { state: 'succeeded', startedAt }; }, takeResult: () => ({}) });
  controller.recordBackgroundFailure(root, 'FIRST', 'first failure');
  const search = controller.gate(root, async () => 'must not return stale').catch(error => error);
  await started;
  controller.recordBackgroundFailure(root, 'SECOND', 'new failure during repair');
  release();
  const result = await search;
  assert.ok(result instanceof Error, 'repair for an earlier warning must not authorize search');
  assert.equal(warnings.read(root).code, 'SECOND', 'concurrent warning was lost');
  assert.equal(controller.needsVerify(controller.state(root)), true);
});

test("F5: clearIfResolvedBy is atomic — a newer warning raised after the refresh started is never deleted", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import fs from 'node:fs';
  import { syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    const dir = process.argv[1];
    const store = new WarningStore(dir);
    const root = '/virtual/root';
    store.write(root, 'OLD_FAILURE', 'raised before the refresh started');
    await new Promise((r) => setTimeout(r, 30));
    const refreshStartedAt = Date.now();
    await new Promise((r) => setTimeout(r, 30));
    // The bridge (another process) raises a NEWER failure while the refresh is finishing: it lands between
    // the store's read of the old record and its removal. Hook every way a record can be removed.
    let injected = 0;
    const inject = () => { if (injected++ === 0) store.write(root, 'NEWER_FAILURE', 'raised after the refresh started'); };
    for (const name of ['unlinkSync', 'rmSync', 'renameSync']) {
      const original = fs[name];
      fs[name] = function hooked(...args) {
        if (String(args[0]).startsWith(dir)) inject();
        return original.apply(this, args);
      };
    }
    syncBuiltinESMExports();
    const cleared = store.clearIfResolvedBy(root, refreshStartedAt);
    const after = store.read(root);
    console.log(JSON.stringify({ injected, clearedCode: cleared?.code ?? null, afterCode: after?.code ?? null }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "warnings-atomic")]);
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.json.injected >= 1, `the store removed a record without any hookable fs call, so the race could not be staged: ${JSON.stringify(run.json)}`);
  assert.equal(run.json.afterCode, "NEWER_FAILURE", `a failure raised after the refresh started was lost: ${JSON.stringify(run.json)}`);
});

test("F5 control: a warning raised BEFORE the refresh started is cleared by it, and one raised after is kept", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    const store = new WarningStore(process.argv[1]);
    store.write('/virtual/a', 'OLD', 'old');
    await new Promise((r) => setTimeout(r, 30));
    const startedAfterOld = Date.now();
    store.clearIfResolvedBy('/virtual/a', startedAfterOld);
    const startedBeforeNew = Date.now();
    await new Promise((r) => setTimeout(r, 30));
    store.write('/virtual/b', 'NEW', 'new');
    store.clearIfResolvedBy('/virtual/b', startedBeforeNew);
    console.log(JSON.stringify({ a: store.read('/virtual/a')?.code ?? null, b: store.read('/virtual/b')?.code ?? null }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "warnings-control")]);
  assert.deepEqual(run.json, { a: null, b: "NEW" });
});

test("F6: a future-dated warning (clock stepped back / foreign writer) is repaired in a bounded number of verify jobs, not spun on until the barrier", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { mkdirSync, writeFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import { join } from 'node:path';
    const { ManagedController } = await import(${JSON.stringify(CONTROLLER_URL)});
    const { WarningStore, ReservationStore } = await import(${JSON.stringify(STATE_URL)});
    const base = process.argv[1];
    const warnings = new WarningStore(join(base, 'warnings'));
    const reservations = new ReservationStore(join(base, 'reservations'));
    const root = '/virtual/root';
    // A warning whose "at" lies in the future: no refresh that "started after it" can ever exist.
    mkdirSync(join(base, 'warnings'), { recursive: true });
    const key = createHash('sha256').update(root).digest('hex');
    writeFileSync(join(base, 'warnings', key + '.json'), JSON.stringify({ root, code: 'SKEWED', message: 'from the future', at: new Date(Date.now() + 3600_000).toISOString() }));
    let jobs = 0;
    let controller;
    controller = new ManagedController({
      warnings, reservations, barrierMs: 2500,
      runJob: async (r) => { jobs += 1; controller.takeDirectives(r); return { state: 'succeeded', startedAt: Date.now() }; },
      takeResult: () => ({ filesAdded: 0, filesModified: 0, filesPending: 0, filesDeleted: 0 }),
    });
    const started = Date.now();
    let outcome;
    try { await controller.gate(root, async () => 'answer'); outcome = 'answered'; } catch (error) { outcome = error.code ?? String(error.message); }
    console.log(JSON.stringify({ outcome, jobs, ms: Date.now() - started, warningLeft: warnings.read(root)?.code ?? null }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "future-warning")]);
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.json.jobs <= 3, `verify jobs ran ${run.json.jobs} times for ONE unresolvable warning (each is a full-tree content hash in production): ${JSON.stringify(run.json)}`);
  assert.ok(run.json.ms < 2400, `the gate spun until the barrier (${run.json.ms}ms): ${JSON.stringify(run.json)}`);
});

// ===========================================================================
// F7  Reservation persistence failures: no ghost reservation, no crash
// ===========================================================================
test("F7: a reserve whose persistence fails leaves no ghost reservation and does not wedge later searches", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { join } from 'node:path';
    const { ManagedController } = await import(${JSON.stringify(CONTROLLER_URL)});
    const { WarningStore, ReservationStore } = await import(${JSON.stringify(STATE_URL)});
    const base = process.argv[1];
    const warnings = new WarningStore(join(base, 'warnings'));
    const real = new ReservationStore(join(base, 'reservations'));
    let failing = true;
    const reservations = { load: (r) => real.load(r), roots: () => real.roots(), save: (r, list) => { if (failing) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; } return real.save(r, list); } };
    const root = '/virtual/root';
    let controller;
    let verified = false;
    controller = new ManagedController({ warnings, reservations, barrierMs: 1500, runJob: async (r) => { const directives = controller.takeDirectives(r); verified = verified || directives.verify; return { state: 'succeeded', startedAt: Date.now() }; }, takeResult: () => undefined });
    let reserveError = null;
    try { controller.reserve(root, 'turn_end'); } catch (error) { reserveError = error.code ?? String(error.message); }
    const ghost = controller.snapshot(root).reservations;
    failing = false;
    const started = Date.now();
    let outcome;
    try { await controller.gate(root, async () => 'answer'); outcome = 'answered'; } catch (error) { outcome = error.code ?? String(error.message); }
    console.log(JSON.stringify({ reserveError, ghost, outcome, verified, ms: Date.now() - started }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "reserve-fail")]);
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.json.reserveError, "the caller must learn the reservation was not durable");
  assert.match(String(run.json.reserveError), /PERSIST|EACCES/);
  assert.equal(run.json.ghost, 0, "a reservation that could not be persisted stayed open with no timer");
  assert.equal(run.json.outcome, "answered", `searches on this root fail closed forever after one failed reserve: ${JSON.stringify(run.json)}`);
  assert.equal(run.json.verified, true, "the search's required verification must actually be claimed");
});

test("F7: a persistence failure while a reservation EXPIRES does not crash the daemon process (uncaught exception) and does not leak the reservation", { ...MACOS, skip: MACOS.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { join } from 'node:path';
    const { ManagedController } = await import(${JSON.stringify(CONTROLLER_URL)});
    const { WarningStore, ReservationStore } = await import(${JSON.stringify(STATE_URL)});
    const base = process.argv[1];
    const warnings = new WarningStore(join(base, 'warnings'));
    const real = new ReservationStore(join(base, 'reservations'));
    let failing = false;
    const reservations = { load: (r) => real.load(r), roots: () => real.roots(), save: (r, list) => { if (failing) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; } return real.save(r, list); } };
    const uncaught = [];
    process.on('uncaughtException', (error) => uncaught.push(error.code ?? String(error.message)));
    process.on('unhandledRejection', (error) => uncaught.push('unhandledRejection:' + (error?.code ?? error)));
    const root = '/virtual/root';
    const controller = new ManagedController({ warnings, reservations, barrierMs: 300, runJob: async () => ({ state: 'succeeded', startedAt: Date.now() }), takeResult: () => undefined });
    controller.reserve(root, 'turn_end');   // persisted fine
    failing = true;                          // ...then the disk goes read-only before the timer fires
    await new Promise((r) => setTimeout(r, 900));
    failing = false;
    const open = controller.snapshot(root).reservations;
    let outcome;
    try { await controller.gate(root, async () => 'answer'); outcome = 'answered'; } catch (error) { outcome = error.code ?? String(error.message); }
    console.log(JSON.stringify({ uncaught, open, outcome }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "expire-fail")]);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(run.json.uncaught, [], "the expiry timer's persistence failure escaped as an uncaught exception (the daemon exits on those)");
  assert.equal(run.json.open, 0, "the expired reservation lingered in memory");
});

test("F7 (black-box): an unwritable reservation directory makes reserve fail cleanly (non-2xx, no ghost) and search keeps working", { ...MODEL, skip: MODEL.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export function reservefailmarker() { return 1; }\n" });
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  const daemon = await start({ env: { ZVEC_GREP_MANAGED_BARRIER_MS: "20000" } });
  const dir = join(sandbox.zvecHome, "daemon", "managed", "reservations");
  const record = readInstanceRecord(sandbox);
  chmodSync(dir, 0o500);
  t.after(() => { try { chmodSync(dir, 0o700); } catch { /* sandbox already removed */ } });
  const reserve = await socketRequest(record.managedSocket, "POST", "/managed/reserve", { root: sandbox.workspace, reason: "turn_end" });
  assert.ok(reserve.status >= 400 || reserve.json?.status === "failed", `reserve claimed success although it could not be persisted: ${reserve.text}`);
  assert.equal((await daemon.status(sandbox.workspace)).json.reservations, 0, "ghost reservation");
  chmodSync(dir, 0o700);
  const search = await mcpSearch(daemon, { root: sandbox.workspace, query: "reserve fail", fts: ["reservefailmarker"] });
  assert.equal(search.isError, false, `search wedged by the failed reservation: ${search.text}`);
  assert.equal(daemon.process.child.exitCode, null);
  noEgress(sandbox, "reserve persist failure");
});

// ===========================================================================
// F8  A model-cache miss is an error, never a download — and never touches the cache
// ===========================================================================
test("F8: an empty model cache stays EMPTY (no directory scaffolding, no locks, no .part) after a refresh that cannot load the model", { ...MODEL, skip: MODEL.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const cachemiss = 1;\n" });
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  rmSync(sandbox.modelCache, { recursive: true, force: true });
  mkdirSync(sandbox.modelCache);
  const daemon = await start();
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const cachemiss = 2;\n" });
  const result = await daemon.refresh(sandbox.workspace, { wait: true });
  assert.equal(result.json.status, "failed", result.text);
  assert.match(result.json.error.message, /never downloads|not cached/i);
  assert.deepEqual(Object.entries(fingerprintTree(sandbox.modelCache)), [], "the offline loader wrote into the cache on a miss");
  noEgress(sandbox, "cache miss");
});

test("F8: a cache HIT is read-only — marker files and artifacts keep their bytes and mtimes after a refresh and a search", { ...MODEL, skip: MODEL.skip || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export function cachehitmarker() { return 1; }\n" });
  await buildLocalIndex(sandbox);
  await trustRoot(sandbox);
  // Age every cache entry so any rewrite (marker refresh, re-download, touch) is visible.
  const aged = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const ageAll = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (lstatSync(full).isDirectory()) ageAll(full);
      utimesSync(full, aged, aged);
    }
  };
  ageAll(sandbox.modelCache);
  const bytesBefore = fingerprintTree(sandbox.modelCache);
  const mtimesBefore = mtimeTree(sandbox.modelCache);
  const daemon = await start();
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export function cachehitmarker() { return 2; }\n" });
  assert.ok(["refreshed", "unchanged"].includes((await daemon.refresh(sandbox.workspace, { wait: true })).json.status));
  const search = await mcpSearch(daemon, { root: sandbox.workspace, query: "cache hit", fts: ["cachehitmarker"] });
  assert.equal(search.isError, false, search.text);
  assert.deepEqual(fingerprintTree(sandbox.modelCache), bytesBefore, "cache contents changed on a hit");
  const mtimesAfter = mtimeTree(sandbox.modelCache);
  const touched = Object.keys(mtimesBefore).filter((path) => mtimesAfter[path] !== mtimesBefore[path]);
  assert.deepEqual(touched, [], "a cache hit rewrote or touched cache entries (e.g. the .complete marker)");
  noEgress(sandbox, "cache hit");
});

// ===========================================================================
// F9  inspectExistingIndex / status never throw on a drop race
// ===========================================================================
const INSPECT_RACE = (fault) => `
  import fs from 'node:fs';
  import { syncBuiltinESMExports } from 'node:module';
  import { join } from 'node:path';
  import { pathToFileURL } from 'node:url';
  const pkgModule = await import(${JSON.stringify(url(join(DAEMON_DIR, "package.mjs")))});
  const mod = await import(${JSON.stringify(url(EXISTING_INDEX_MODULE))});
  const engine = await mod.loadEngine(pkgModule.loadPackage(process.env));
  const root = process.argv[1];
  const results = { baseline: mod.inspectExistingIndex(engine, root).state };
  const enoent = (path) => Object.assign(new Error('ENOENT: no such file or directory, stat ' + path), { code: 'ENOENT', errno: -2, syscall: 'stat', path });
  const original = { statSync: fs.statSync, realpathSync: fs.realpathSync, lstatSync: fs.lstatSync };
  const fault = ${JSON.stringify(fault)};
  let hits = 0;
  if (fault === 'store-vanishes') {
    // Storage was observed by hasWorkspaceIndexStorage; it then vanishes during the identity lstat.
    fs.lstatSync = function (path, ...rest) { if (String(path).endsWith('files.zvec')) { hits++; throw enoent(path); } return original.lstatSync.call(this, path, ...rest); };
  } else {
    // the home directory itself disappears between lstat and realpath
    let armed = false;
    fs.lstatSync = function (path, ...rest) { const r = original.lstatSync.call(this, path, ...rest); if (String(path).endsWith('.zvec-grep')) armed = true; return r; };
    fs.realpathSync = function (path, ...rest) { if (armed && String(path).endsWith('.zvec-grep') && hits++ >= 0) throw enoent(path); return original.realpathSync.call(this, path, ...rest); };
  }
  syncBuiltinESMExports();
  try { results.raced = mod.inspectExistingIndex(engine, root).state; } catch (error) { results.threw = error.code ?? String(error.message).slice(0, 120); }
  results.faultFired = hits;
  console.log(JSON.stringify(results));
  process.exit(0);`;

for (const fault of ["store-vanishes", "home-vanishes"]) {
  test(`F9: inspectExistingIndex returns a state (never throws ENOENT) when the index disappears mid-inspection (${fault})`, { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
    const { sandbox } = lab(t);
    sandbox.writeWorkspaceFiles({ "src/a.ts": "export const a = 1;\n" });
    fabricateIndex(sandbox);
    const run = await runScript(sandbox, INSPECT_RACE(fault), [sandbox.workspace]);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.json.baseline, "ready", "control: the fabricated index must read as ready before the fault");
    assert.ok(run.json.faultFired >= 1, `the fault was never exercised (the code path changed?): ${JSON.stringify(run.json)}`);
    assert.equal(run.json.threw, undefined, `inspectExistingIndex threw ${run.json.threw} on a drop race; the status API would answer 500`);
    // `relocated` is what the current code answers when the home vanishes under the manifest.path check;
    // the invariant under test is "a state, never an exception" (a vanished home reading as `missing` would be better still).
    assert.equal(run.json.raced, fault === "store-vanishes" ? "missing" : "relocated", JSON.stringify(run.json));
  });
}

test("F9 (black-box): GET /managed/status and POST /managed/refresh never answer 5xx while the index is being removed and restored underneath them", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox, daemon: start } = lab(t);
  sandbox.writeWorkspaceFiles({ "src/a.ts": "export const a = 1;\n" });
  fabricateIndex(sandbox);
  await trustRoot(sandbox);
  const daemon = await start();
  const files = join(sandbox.indexDir, "files.zvec");
  const index = join(sandbox.indexDir, "index.zvec");
  let stop = false;
  const flapper = (async () => {
    while (!stop) {
      for (const dir of [files, index]) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
      await sleep(1);
    }
  })();
  const bad = [];
  const deadline = Date.now() + 6_000;
  let calls = 0;
  while (Date.now() < deadline) {
    const [status, refresh] = await Promise.all([daemon.status(sandbox.workspace), daemon.refresh(sandbox.workspace, { wait: false })]);
    calls += 2;
    for (const response of [status, refresh]) if (response.status >= 500) bad.push(`${response.status} ${response.text.slice(0, 160)}`);
  }
  stop = true;
  await flapper;
  t.diagnostic(`${calls} calls while the stores flapped`);
  assert.deepEqual(bad.slice(0, 3), [], "internal errors leaked from the drop race (and with them absolute paths)");
});

// ===========================================================================
// F11  Package discovery must not trust the working directory
// ===========================================================================
test("F11: a relative PATH entry holding a look-alike `zg` package is never loaded or executed by the daemon", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  const marker = join(sandbox.root, "decoy-executed.txt");
  const decoy = join(sandbox.workspace, "decoy-pkg");
  mkdirSync(join(decoy, "dist", "cli"), { recursive: true });
  mkdirSync(join(decoy, "dist", "daemon"), { recursive: true });
  mkdirSync(join(sandbox.workspace, "bin"), { recursive: true });
  const real = JSON.parse(readFileSync(join(installedPackageDir(), "package.json"), "utf8"));
  writeFileSync(join(decoy, "package.json"), JSON.stringify({ name: real.name, version: real.version, type: "module" }));
  writeFileSync(join(decoy, "dist", "cli", "index.js"), "#!/usr/bin/env node\n");
  chmodSync(join(decoy, "dist", "cli", "index.js"), 0o755);
  for (const module of ["config.js", "errors.js", "server-controller.js", "http-server.js", "logger.js", "backend.js", "runtime-manager.js"]) {
    writeFileSync(join(decoy, "dist", "daemon", module), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'decoy module executed');\nexport {};\n`);
  }
  symlinkSync(join(decoy, "dist", "cli", "index.js"), join(sandbox.workspace, "bin", "zg"));
  const realBin = dirname(realZg());
  const port = 43000 + (process.pid % 2000);
  const run = await sandbox.run(process.execPath, [DAEMON_MAIN, "run", "--listen", `127.0.0.1:${port}`], {
    wrap: false, timeoutMs: 20_000,
    env: { PATH: `bin:${realBin}:/usr/bin:/bin`, ZVEC_GREP_PACKAGE_DIR: "" },
  });
  const pid = listenerPid(port);
  if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  assert.ok(!existsSync(marker), "the daemon imported/executed code from a package found through a RELATIVE PATH entry (current-directory hijack)");
  void run;
});

// ===========================================================================
// F12a  The gate does not start a search after the barrier has already expired
// ===========================================================================
test("F12: gate() never starts another search once the barrier deadline has passed", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { join } from 'node:path';
    const { ManagedController } = await import(${JSON.stringify(CONTROLLER_URL)});
    const { WarningStore, ReservationStore } = await import(${JSON.stringify(STATE_URL)});
    const base = process.argv[1];
    let clock = 1_000_000;
    let controller;
    controller = new ManagedController({
      warnings: new WarningStore(join(base, 'w')), reservations: new ReservationStore(join(base, 'r')), barrierMs: 1000,
      now: () => clock,
      runJob: async (r) => { controller.takeDirectives(r); return { state: 'succeeded', startedAt: clock }; }, takeResult: () => undefined,
    });
    const root = '/virtual/root';
    let runs = 0;
    let outcome;
    try {
      await controller.gate(root, async () => {
        runs += 1;
        if (runs === 1) { clock += 5000; controller.bump(controller.state(root)); } // the search itself outlasts the barrier and the root moved
        return 'answer';
      });
      outcome = 'answered';
    } catch (error) { outcome = error.code ?? String(error.message); }
    console.log(JSON.stringify({ runs, outcome }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "gate-deadline")]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.runs, 1, `a full search was started after the deadline: ${JSON.stringify(run.json)}`);
  assert.equal(run.json.outcome, "FRESHNESS_BARRIER_TIMEOUT");
});

test("default search barrier rejects a stalled search after 30 seconds and abandons its late result", { ...MACOS, skip: DAEMON_SKIP, timeout: 40_000 }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { join } from 'node:path';
    const { ManagedController } = await import(${JSON.stringify(CONTROLLER_URL)});
    const { WarningStore, ReservationStore } = await import(${JSON.stringify(STATE_URL)});
    const base = process.argv[1];
    const controller = new ManagedController({
      warnings: new WarningStore(join(base, 'w')), reservations: new ReservationStore(join(base, 'r')),
      runJob: async () => ({ state: 'succeeded', startedAt: Date.now() }), takeResult: () => undefined,
    });
    let attempt;
    const start = Date.now();
    let outcome;
    try { await controller.gate('/virtual/root', (a) => { attempt = a; return new Promise(() => {}); }); outcome = 'answered'; }
    catch (error) { outcome = error.code; }
    console.log(JSON.stringify({ outcome, elapsed: Date.now() - start, abandoned: attempt?.abandoned }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "default-barrier")]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.outcome, "FRESHNESS_BARRIER_TIMEOUT");
  assert.equal(run.json.abandoned, true);
  assert.ok(run.json.elapsed >= 29_000 && run.json.elapsed < 35_000, JSON.stringify(run.json));
});

test("offline model cache miss leaves an empty cache untouched without contacting a provider", { ...MACOS, skip: MACOS.skip || (!HAVE_ZG && "zg not installed") || DAEMON_SKIP }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    const { loadPackage } = await import(${JSON.stringify(url(join(DAEMON_DIR, "package.mjs")))});
    const { createOfflineModelFactory } = await import(${JSON.stringify(url(join(DAEMON_DIR, "offline-model.mjs")))});
    const offline = await createOfflineModelFactory(loadPackage(process.env));
    let code;
    try { await offline.createModel({ model: { provider: 'local', name: 'potion-code-16m-v2' } }); }
    catch (error) { code = error.code; }
    console.log(JSON.stringify({ code }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, []);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.code, "MANAGED_MODEL_NOT_CACHED");
  assert.deepEqual(readdirSync(sandbox.modelCache), []);
  noEgress(sandbox, "offline model cache miss");
});

test("a repeated warning code raised during refresh survives that refresh", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    const store = new WarningStore(process.argv[1]);
    const root = '/virtual/root';
    store.write(root, 'FAILURE', 'first occurrence');
    const first = store.read(root);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 30));
    store.write(root, 'FAILURE', 'second occurrence');
    const second = store.read(root);
    store.clearIfResolvedBy(root, started);
    const remaining = store.read(root);
    console.log(JSON.stringify({ first, started, second, remaining }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "same-warning")]);
  assert.equal(run.code, 0, run.stderr);
  assert.ok(run.json.first.atMs < run.json.started && run.json.started < run.json.second.atMs, JSON.stringify(run.json));
  assert.equal(run.json.remaining?.code, "FAILURE");
  assert.equal(run.json.remaining?.message, "second occurrence");
  assert.equal(run.json.remaining?.atMs, run.json.second.atMs);
});

test("a same-code warning replaced in the same millisecond survives the older refresh occurrence fence", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    const store = new WarningStore(process.argv[1]);
    const root = '/virtual/root';
    const RealDate = Date;
    const fixed = RealDate.now();
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
    store.write(root, 'FAILURE', 'same message');
    const before = store.read(root);
    const occurrence = store.occurrence(root);
    store.write(root, 'FAILURE', 'same message');
    const replacement = store.read(root);
    const replacementOccurrence = store.occurrence(root);
    store.clearIfResolvedBy(root, fixed, fixed, occurrence);
    const remaining = store.read(root);
    console.log(JSON.stringify({ before, occurrence, replacement, replacementOccurrence, remaining }));
    process.exit(0);`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "same-millisecond")]);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(run.json.before, run.json.replacement);
  assert.ok(run.json.occurrence && run.json.replacementOccurrence);
  assert.notEqual(run.json.occurrence, run.json.replacementOccurrence);
  assert.deepEqual(run.json.remaining, run.json.replacement);
});

test("interrupted warning and notice are recovered; a newer live warning wins", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import { renameSync, readdirSync } from 'node:fs';
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    const dir = process.argv[1], root = '/virtual/root', newerRoot = '/virtual/newer';
    const first = new WarningStore(dir);
    first.write(root, 'OLD', 'interrupted');
    first.writeNotice(root, { code: 'NOTICE', message: 'interrupted notice', at: '2026-01-01T00:00:00.000Z' });
    first.write(newerRoot, 'STALE', 'older occurrence');
    for (const p of [first.path(root), first.noticePath(root), first.path(newerRoot)]) renameSync(p, p + '.123.a-b.taken');
    first.write(newerRoot, 'NEW', 'newer occurrence');
    const recovered = new WarningStore(dir);
    console.log(JSON.stringify({ warning: recovered.read(root), notice: recovered.takeNotice(root), newer: recovered.read(newerRoot), remaining: readdirSync(dir).filter(n => n.endsWith('.taken')) }));`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "recovery")]);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(run.json.warning?.code, "OLD");
  assert.equal(run.json.notice?.code, "NOTICE");
  assert.equal(run.json.newer?.code, "NEW");
  assert.deepEqual(run.json.remaining, []);
});

test("warning recovery errors fail closed and preserve the interrupted record", { ...MACOS }, async (t) => {
  const { sandbox } = lab(t);
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const dir = process.argv[1]; fs.mkdirSync(dir, { recursive: true });
    const taken = join(dir, 'a'.repeat(64) + '.json.123.a-b.taken');
    fs.writeFileSync(taken, '{}');
    fs.linkSync = () => { const error = new Error('injected'); error.code = 'EACCES'; throw error; };
    syncBuiltinESMExports();
    const { WarningStore } = await import(${JSON.stringify(STATE_URL)});
    let error; try { new WarningStore(dir); } catch (e) { error = e.code; }
    console.log(JSON.stringify({ error, preserved: fs.existsSync(taken) }));`;
  const run = await runScript(sandbox, script, [join(sandbox.root, "recovery-error")]);
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(run.json, { error: "EACCES", preserved: true });
});
