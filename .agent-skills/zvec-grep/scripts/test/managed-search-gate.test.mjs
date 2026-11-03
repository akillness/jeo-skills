// Search freshness barrier of the managed daemon (/mcp zvec_grep_search).
//
// Contract: a semantic search either returns a response produced AFTER the last
// known change (freshness: fresh) or fails with a tool error telling the agent
// to fall back to native Grep/rg. It never returns stale hits, never creates an
// index, never touches the network, and a failure it hides is surfaced once on
// the next successful search (`refresh_warning:`), which also clears it.
// Barrier default 30 s; tests shorten it with ZVEC_GREP_MANAGED_BARRIER_MS.
// Run: node --test .agent-skills/zvec-grep/scripts/test/
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { buildProfile } from '../managed-daemon/os-sandbox.mjs';
import { createCanary, removeCanary } from '../managed-daemon/sandbox-canary.mjs';
import { unixFetch } from '../managed-daemon/unix-bridge.mjs';
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DAEMON_DIR, buildLocalIndex, createSandbox, fingerprintTree, FIXTURE_FILES, installedPackageDir, localModelArtifactAvailable,
  realZg, readInstanceRecord, sleep, socketRequest, trustRoot,
} from "./harness.mjs";

const HAVE = realZg() && localModelArtifactAvailable();
const NEEDS = !HAVE && "installed zg 0.2.2 and an already-downloaded local model artifact are required";
const DARWIN = process.platform === "darwin";
const SLOW = { timeout: 240_000, skip: NEEDS || (!DARWIN && "managed daemon is macOS-only by contract") };
const BARRIER_MS = 3_000;

const TOKENS = { before: "gateotterbefore", after: "gateotterafter", other: "gatewolverine" };
const WORKSPACE = {
  ...FIXTURE_FILES,
  "src/gate.ts": `export function ${TOKENS.before}() {\n  return 1;\n}\n`,
  "src/other.ts": `export function ${TOKENS.other}() {\n  return 2;\n}\n`,
};
const edit = (sandbox) => sandbox.writeWorkspaceFiles({ "src/gate.ts": `export function ${TOKENS.after}() {\n  return 2;\n}\n` });
const query = (sandbox, token, extra = {}) => ({ root: sandbox.workspace, query: "the function in gate", fts: [token], ...extra });

async function startConfined(sandbox, env) {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = sandbox.tmp;
  let canary;
  try { canary = createCanary(); } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
  const warnings = join(sandbox.home, '.local', 'state', 'zvec-grep', 'warnings');
  mkdirSync(warnings, { recursive: true });
  const req = createRequire(join(installedPackageDir(), 'package.json'));
  const homes = [...canary.indexHomes, ...(existsSync(sandbox.indexDir) ? [sandbox.indexDir] : [])];
  const profile = buildProfile({ port: 47991, nodePath: realpathSync(process.execPath), rgPath: realpathSync(req('@vscode/ripgrep').rgPath), writableRoots: [sandbox.zvecHome, sandbox.modelCache, warnings, join(canary.root, 'new')].map(p => realpathSync(p)), indexHomes: homes.map(p => realpathSync(p)), home: realpathSync(sandbox.zvecHome) });
  const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, process.execPath, join(DAEMON_DIR, 'daemon-entry.mjs'), 'run', '--home', sandbox.zvecHome, '--boundary-canary', canary.root], { cwd: sandbox.workspace, env: sandbox.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir(), NODE_OPTIONS: '', ...env }), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  let record; const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && child.exitCode === null) { try { record = readInstanceRecord(sandbox); if (record.ready && existsSync(record.managedSocket) && record.pid === child.pid) break; } catch {} await sleep(100); }
  if (!record?.ready || record.pid !== child.pid) { child.kill('SIGKILL'); throw new Error(`confined daemon failed: ${output}`); }
  const stop = async (signal = 'SIGTERM') => { if (child.exitCode === null && !child.signalCode) { const done = new Promise(r => child.once('exit', r)); child.kill(signal); await Promise.race([done, sleep(5000)]); if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL'); } if (existsSync(canary.root)) removeCanary(canary); };
  return { record, stop, kill: () => stop('SIGKILL'), request: (method, path, body) => socketRequest(record.managedSocket, method, path, body), status(root) { return this.request('GET', `/managed/status?root=${encodeURIComponent(root)}`); }, async waitStatus(root, predicate, { timeoutMs = 60_000 } = {}) { const end = Date.now() + timeoutMs; let value; while (Date.now() < end) { value = (await this.status(root)).json; if (predicate(value)) return value; await sleep(50); } throw new Error(`status timeout: ${JSON.stringify(value)}`); } };
}

async function mcpConnect(daemon) {
  const req = createRequire(join(installedPackageDir(), 'package.json'));
  const { Client, StreamableHTTPClientTransport } = await import(pathToFileURL(req.resolve('@modelcontextprotocol/client')).href);
  const client = new Client({ name: 'managed-search-test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: unixFetch(daemon.record.managedSocket, daemon.record.instanceToken) }));
  return client;
}
async function mcpCallTool(daemon, name, args, { timeoutMs = 60_000 } = {}) {
  const start = Date.now(); const client = await mcpConnect(daemon);
  try { const result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs }); return { isError: result.isError === true, text: (result.content ?? []).map(x => x.text ?? '').join('\n'), ms: Date.now() - start }; }
  catch (error) { return { isError: true, text: String(error.message), ms: Date.now() - start }; }
  finally { await client.close(); }
}
const mcpSearch = (daemon, args) => mcpCallTool(daemon, 'zvec_grep_search', args);
async function mcpToolNames(daemon) { const client = await mcpConnect(daemon); try { return (await client.listTools()).tools.map(t => t.name).sort(); } finally { await client.close(); } }

function fixture(t, { env = {}, trusted = true, barrierMs = BARRIER_MS } = {}) {
  const sandbox = createSandbox();
  const daemons = [];
  t.after(async () => {
    for (const daemon of daemons) await daemon.stop().catch(() => {});
    sandbox.cleanup();
  });
  return {
    sandbox,
    async ready() {
      sandbox.writeWorkspaceFiles(WORKSPACE);
      await buildLocalIndex(sandbox);
      if (trusted) await trustRoot(sandbox);
    },
    async daemon(extraEnv = {}) {
      const daemon = await startConfined(sandbox, { ZVEC_GREP_MANAGED_BARRIER_MS: String(barrierMs), ...env, ...extraEnv });
      daemons.push(daemon);
      return daemon;
    },
  };
}

async function packageLock(sandbox) {
  const { acquireReadWriteLock } = await import(pathToFileURL(join(installedPackageDir(), "dist/engine/utils/lock.js")).href);
  return acquireReadWriteLock(join(sandbox.indexDir, "locks", "home"), "write", { operation: "gate-test-hold" });
}

const noEgress = (sandbox, what) => assert.deepEqual(sandbox.egressEvents(), [], `${what}: network egress was attempted`);
const indexless = (sandbox) => ["index.zvec", "files.zvec", "manifest.json"].every((name) => !existsSync(join(sandbox.indexDir, name)));

test("default barrier is 30s and the tool surface is search-only (no index/drop/rg/admin)", SLOW, async (t) => {
  const f = fixture(t, { env: { ZVEC_GREP_MANAGED_BARRIER_MS: "" } });
  await f.ready();
  const daemon = await f.daemon({ ZVEC_GREP_MANAGED_BARRIER_MS: "" });
  const status = (await daemon.status(f.sandbox.workspace)).json;
  assert.equal(status.barrier_ms, 30_000);
  assert.deepEqual(await mcpToolNames(daemon), ["zvec_grep_search"]);
  const admin = await daemon.request("POST", "/mcp/admin", { op: "drop" });
  assert.equal(admin.status, 404);
  const before = fingerprintTree(f.sandbox.indexDir);
  const stores = ["index.zvec", "files.zvec", "manifest.json"].map((name) => before[name] ?? null);
  for (const [name, args] of [
    ["zvec_grep_index", { root: f.sandbox.workspace, rebuild: true }],
    ["zvec_grep_index_drop", { root: f.sandbox.workspace, confirm: true }],
    ["zvec_grep_rg", { root: f.sandbox.workspace, pattern: "gate" }],
  ]) {
    const result = await mcpCallTool(daemon, name, args);
    assert.equal(result.isError, true, `${name} must not be callable on the managed daemon: ${result.text}`);
  }
  const after = fingerprintTree(f.sandbox.indexDir);
  assert.deepEqual(["index.zvec", "files.zvec", "manifest.json"].map((name) => after[name] ?? null), stores, "a refused lifecycle tool changed the index");
  assert.equal(existsSync(join(f.sandbox.indexDir, "index.zvec")), true);
  noEgress(f.sandbox, "surface");
});

test("fresh search: an edit made just before the search is reflected; old content is not served", SLOW, async (t) => {
  const f = fixture(t, { barrierMs: 25_000 });
  await f.ready();
  const daemon = await f.daemon();
  edit(f.sandbox);
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(result.isError, false, result.text);
  assert.match(result.text, /^freshness: fresh/m);
  assert.match(result.text, new RegExp(`${TOKENS.after}`), "post-edit content must be served");
  assert.doesNotMatch(result.text, new RegExp(TOKENS.before), "stale pre-edit content was served");
  assert.match(result.text, /src\/gate\.ts/);
  noEgress(f.sandbox, "fresh search");
});

async function hiddenEditFixture(f) {
  const path = join(f.sandbox.workspace, 'src/gate.ts');
  const before = 'export function metadataalpha() { return 1; }\n';
  const after = 'export function metadatabravo() { return 1; }\n';
  assert.equal(Buffer.byteLength(before), Buffer.byteLength(after));
  f.sandbox.writeWorkspaceFiles({ ...WORKSPACE, 'src/gate.ts': before });
  const timestamp = new Date('2020-01-02T03:04:05.000Z');
  utimesSync(path, timestamp, timestamp);
  await buildLocalIndex(f.sandbox);
  await trustRoot(f.sandbox);
  const original = statSync(path);
  return () => {
    writeFileSync(path, after);
    utimesSync(path, original.atime, original.mtime);
    const changed = statSync(path);
    assert.equal(changed.size, original.size);
    assert.equal(changed.mtimeMs, original.mtimeMs);
  };
}

test('restart without durable warning does not serve unchanged-metadata stale content', SLOW, async (t) => {
  const f = fixture(t, { barrierMs: 30_000 });
  const change = await hiddenEditFixture(f);
  const first = await f.daemon();
  await first.kill();
  change();
  const second = await f.daemon();
  const result = await mcpSearch(second, query(f.sandbox, 'metadatabravo'));
  assert.equal(result.isError, false, result.text);
  assert.match(result.text, /metadatabravo/);
  assert.match(result.text, /src\/gate\.ts/, 'changed content must be returned as an indexed hit');
  assert.doesNotMatch(result.text, /metadataalpha/);
});

test('lost event with unchanged file metadata never serves old content while daemon lives', SLOW, async (t) => {
  const f = fixture(t, { barrierMs: 30_000 });
  const change = await hiddenEditFixture(f);
  const daemon = await f.daemon();
  const warm = await mcpSearch(daemon, query(f.sandbox, 'metadataalpha'));
  assert.equal(warm.isError, false, warm.text);
  change(); // no host event or durable warning is delivered
  const result = await mcpSearch(daemon, query(f.sandbox, 'metadatabravo'));
  assert.equal(result.isError, false, result.text);
  assert.match(result.text, /metadatabravo/);
  assert.match(result.text, /src\/gate\.ts/, 'changed content must be returned as an indexed hit');
  assert.doesNotMatch(result.text, /metadataalpha/);
});

test('unreadable indexed source fails verification rather than serving stale hits', SLOW, async (t) => {
  const f = fixture(t, { barrierMs: 30_000 });
  await f.ready();
  const daemon = await f.daemon();
  const path = join(f.sandbox.workspace, 'src/gate.ts');
  chmodSync(path, 0);
  t.after(() => { if (existsSync(path)) chmodSync(path, 0o600); });
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.before));
  assert.equal(result.isError, true, result.text);
  assert.match(result.text, /EACCES|permission denied/i);
  assert.doesNotMatch(result.text, new RegExp(`function ${TOKENS.before}`), 'unreadable source returned stale indexed content');
});

test("deleted file: a search right after deleting a file never returns it", SLOW, async (t) => {
  const f = fixture(t, { barrierMs: 25_000 });
  await f.ready();
  const daemon = await f.daemon();
  rmSync(join(f.sandbox.workspace, "src/other.ts"));
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.other));
  assert.equal(result.isError, false, result.text);
  // The query echo legitimately contains the token; only hit bodies / paths count.
  assert.doesNotMatch(result.text, new RegExp(`function ${TOKENS.other}`), "deleted file served from the stale index");
  assert.doesNotMatch(result.text, /src\/other\.ts/);
  noEgress(f.sandbox, "deleted file");
});

test("missing index: search fails fast with a native-Grep fallback message and creates nothing", { ...SLOW }, async (t) => {
  const f = fixture(t);
  f.sandbox.writeWorkspaceFiles(WORKSPACE);
  const before = fingerprintTree(f.sandbox.workspace);
  const daemon = await f.daemon();
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.before));
  assert.equal(result.isError, true, result.text);
  assert.match(result.text, /native Grep or rg/i);
  assert.ok(result.ms < 10_000, `a missing index must not wait for the barrier (${result.ms}ms)`);
  assert.deepEqual(fingerprintTree(f.sandbox.workspace), before, "search created workspace state");
  assert.ok(!existsSync(f.sandbox.indexDir));
  noEgress(f.sandbox, "missing index search");
});

test("untrusted index: search fails closed with ROOT_UNTRUSTED and does not open the index", SLOW, async (t) => {
  const f = fixture(t, { trusted: false });
  await f.ready();
  const before = fingerprintTree(f.sandbox.indexDir);
  const daemon = await f.daemon();
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.before));
  assert.equal(result.isError, true, result.text);
  assert.match(result.text, /ROOT_UNTRUSTED|not registered/i);
  const after = fingerprintTree(f.sandbox.indexDir);
  const drift = Object.keys({ ...before, ...after }).filter((path) => before[path] !== after[path] && !path.startsWith("locks"));
  assert.deepEqual(drift, [], "an unregistered index must not even be opened");
  noEgress(f.sandbox, "untrusted search");
});

test("malformed durable warning fails search closed instead of returning indexed content", SLOW, async (t) => {
  const f = fixture(t);
  await f.ready();
  const daemon = await f.daemon();
  const { rootKey } = await import('../managed-daemon/state.mjs');
  const warning = join(f.sandbox.home, '.local', 'state', 'zvec-grep', 'warnings', `${rootKey(realpathSync(f.sandbox.workspace))}.json`);
  writeFileSync(warning, '{invalid json');
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.before));
  assert.equal(result.isError, true, result.text);
  assert.doesNotMatch(result.text, /src\/gate\.ts/, 'corrupt warning permitted indexed hits');
  assert.equal(existsSync(warning), true, 'corrupt warning must not be silently cleared');
});

test("production 30s barrier fails under lock and reports recovery after release", { ...SLOW, timeout: 180_000 }, async (t) => {
  const f = fixture(t, { env: { ZVEC_GREP_MANAGED_BARRIER_MS: '' } });
  await f.ready();
  const daemon = await f.daemon({ ZVEC_GREP_MANAGED_BARRIER_MS: '' });
  assert.equal((await daemon.status(f.sandbox.workspace)).json.barrier_ms, 30_000);
  edit(f.sandbox);
  const lock = await packageLock(f.sandbox);
  let released = false;
  t.after(() => { if (!released) lock.release(); });
  const blocked = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(blocked.isError, true, blocked.text);
  assert.match(blocked.text, /native Grep|FRESHNESS_BARRIER_TIMEOUT|MANAGED_REFRESH_FAILED/);
  assert.ok(blocked.ms <= 35_000, `search overran the production deadline: ${blocked.ms}ms`);
  assert.doesNotMatch(blocked.text, /src\/gate\.ts/);
  lock.release();
  released = true;
  await sleep(6_000);
  const healed = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(healed.isError, false, healed.text);
  assert.match(healed.text, /refresh_warning:/);
  assert.match(healed.text, new RegExp(TOKENS.after));
  const again = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(again.isError, false, again.text);
  assert.doesNotMatch(again.text, /refresh_warning:/);
});

test("barrier: a refresh that cannot finish makes search fail within the barrier (never stale), then the next search heals and surfaces the failure once", SLOW, async (t) => {
  const f = fixture(t);
  await f.ready();
  const daemon = await f.daemon();
  edit(f.sandbox);
  const lock = await packageLock(f.sandbox); // a foreign writer owns the index: the refresh cannot run
  let released = false;
  t.after(() => { if (!released) lock.release(); });

  const blocked = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(blocked.isError, true, `search must fail, not return stale hits: ${blocked.text}`);
  assert.match(blocked.text, /native Grep|FRESHNESS_BARRIER_TIMEOUT|MANAGED_REFRESH_FAILED|Index unavailable/);
  assert.ok(blocked.ms <= BARRIER_MS + 10_000, `search overran the barrier: ${blocked.ms}ms`);
  assert.doesNotMatch(blocked.text, new RegExp(`function ${TOKENS.before}|src/gate\\.ts`), "stale index content leaked into the failure");
  assert.ok(existsSync(lock.path), "daemon removed a live writer's lock");

  lock.release();
  released = true;
  await sleep(6_000); // let the repair cooldown pass
  const healed = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(healed.isError, false, healed.text);
  assert.match(healed.text, /^freshness: fresh\nrefresh_warning: /m, "the earlier failure must be surfaced on the next successful search");
  assert.match(healed.text, new RegExp(TOKENS.after));
  const status = (await daemon.status(f.sandbox.workspace)).json;
  assert.equal(status.warning ?? null, null);
  const quiet = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.doesNotMatch(quiet.text, /refresh_warning/, "warning must be surfaced exactly once");
  noEgress(f.sandbox, "barrier");
});

test("reservation: search waits for the host's release, then returns fresh content", SLOW, async (t) => {
  const f = fixture(t, { env: { ZVEC_GREP_MANAGED_BARRIER_MS: "20000" } });
  await f.ready();
  const daemon = await f.daemon({ ZVEC_GREP_MANAGED_BARRIER_MS: "20000" });
  edit(f.sandbox);
  const record = readInstanceRecord(f.sandbox);
  const reserved = await socketRequest(record.managedSocket, "POST", "/managed/reserve", { root: f.sandbox.workspace, reason: "turn_end" });
  assert.equal(reserved.json.status, "reserved", reserved.text);

  const pending = mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  await sleep(2_500);
  const mid = (await daemon.status(f.sandbox.workspace)).json;
  assert.equal(mid.reservations, 1, "reservation must stay open until the host releases it");
  const released = await socketRequest(record.managedSocket, "POST", "/managed/release", {
    root: f.sandbox.workspace, reservation_id: reserved.json.reservation_id, outcome: "unchanged",
  });
  assert.equal(released.json.status, "unchanged", released.text);

  const result = await pending;
  assert.equal(result.isError, false, result.text);
  assert.ok(result.ms >= 2_000, `search returned (${result.ms}ms) while a reservation was still open`);
  assert.match(result.text, /^freshness: fresh/m);
  assert.match(result.text, new RegExp(TOKENS.after), "search served content older than the last edit");
  noEgress(f.sandbox, "reservation");
});

test("reservation never resolved by the host: it expires at the barrier, raises RESERVATION_EXPIRED, and the search self-heals with a verified refresh", SLOW, async (t) => {
  const f = fixture(t);
  await f.ready();
  const daemon = await f.daemon();
  edit(f.sandbox);
  const record = readInstanceRecord(f.sandbox);
  const reserved = await socketRequest(record.managedSocket, "POST", "/managed/reserve", { root: f.sandbox.workspace, reason: "turn_end" });
  assert.equal(reserved.json.status, "reserved");
  const started = Date.now();
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.ok(Date.now() - started >= BARRIER_MS - 500, `search did not wait for the open reservation (${result.ms}ms)`);
  if (result.isError) {
    assert.match(result.text, /native Grep|FRESHNESS_BARRIER_TIMEOUT/, "a failing search must send the agent to native Grep");
    assert.doesNotMatch(result.text, new RegExp(TOKENS.before));
  } else {
    assert.match(result.text, /RESERVATION_EXPIRED/, "an expired reservation must be surfaced");
    assert.match(result.text, new RegExp(TOKENS.after));
  }
  const status = (await daemon.status(f.sandbox.workspace)).json;
  assert.equal(status.reservations, 0, "expired reservation lingered");
  noEgress(f.sandbox, "expiry");
});

test("durable reservation: a daemon killed with an open reservation re-adopts it and later expires it into a warning", { ...SLOW, timeout: 300_000 }, async (t) => {
  const f = fixture(t, { env: { ZVEC_GREP_MANAGED_BARRIER_MS: "6000" } });
  await f.ready();
  const first = await f.daemon({ ZVEC_GREP_MANAGED_BARRIER_MS: "6000" });
  const record = readInstanceRecord(f.sandbox);
  const reserved = await socketRequest(record.managedSocket, "POST", "/managed/reserve", { root: f.sandbox.workspace, reason: "turn_end" });
  assert.equal(reserved.json.status, "reserved");
  await first.kill();

  const second = await f.daemon({ ZVEC_GREP_MANAGED_BARRIER_MS: "6000" });
  const adopted = (await second.status(f.sandbox.workspace)).json;
  assert.equal(adopted.reservations, 1, "reservation was lost across a crash; a search could return stale data");
  assert.ok(["reserved", "refreshing"].includes(adopted.state), JSON.stringify(adopted));
  await second.waitStatus(f.sandbox.workspace, (s) => s.reservations === 0, { timeoutMs: 30_000 });
  noEgress(f.sandbox, "durable reservation");
});

test("model missing: search never answers from a stale index; it fails with a native-Grep message, offline", SLOW, async (t) => {
  const f = fixture(t);
  await f.ready();
  rmSync(f.sandbox.modelCache, { recursive: true, force: true });
  mkdirSync(f.sandbox.modelCache);
  const daemon = await f.daemon();
  edit(f.sandbox);
  const result = await mcpSearch(daemon, query(f.sandbox, TOKENS.after));
  assert.equal(result.isError, true, result.text);
  assert.match(result.text, /native Grep|MANAGED_REFRESH_FAILED|MODEL/i);
  assert.doesNotMatch(result.text, new RegExp(`${TOKENS.before}|src/gate\\.ts`), "stale index content was served");
  assert.deepEqual(Object.entries(fingerprintTree(f.sandbox.modelCache)), [], "a cache miss must not create anything in the model cache");
  noEgress(f.sandbox, "model missing search");
});
