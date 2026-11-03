// Internal daemon entry under one production kernel profile, not a public launcher proof.
// The parent supplies no sandbox marker; the entry performs its real kernel probes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildLocalIndex, createSandbox, DAEMON_DIR, DAEMON_MAIN, ftsHits, HOST_EVENTS, installedPackageDir, localModelArtifactAvailable, OS_SANDBOX_AVAILABLE, readInstanceRecord, realZg, sleep, socketRequest, trustRoot } from './harness.mjs';
import { buildProfile } from '../managed-daemon/os-sandbox.mjs';
import { createCanary, removeCanary } from '../managed-daemon/sandbox-canary.mjs';

const ready = process.platform === 'darwin' && realZg() && localModelArtifactAvailable();

test('legacy sandbox marker cannot bypass public launcher sandbox application', { skip: !OS_SANDBOX_AVAILABLE && 'requires macOS sandbox-exec' }, async (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const result = await sb.run(process.execPath, [DAEMON_MAIN, 'run', '--home', sb.zvecHome, '--listen', '127.0.0.1:47992'], {
    env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir(), ZVEC_MANAGED_OS_SANDBOX: 'darwin-sandbox-exec', NODE_OPTIONS: '' }, timeoutMs: 30_000,
  });
  assert.equal(result.timedOut, false);
  assert.equal(result.code, 78, result.stderr);
  assert.match(result.stderr, /OS_EGRESS_BOUNDARY_UNAVAILABLE/);
  assert.equal(existsSync(join(sb.zvecHome, 'daemon', 'instance.lock')), false);
});

test('confined daemon entry refreshes a private existing index and handles host events', { skip: !ready && 'requires macOS, installed zg and cached local model', timeout: 180_000 }, async (t) => {
  const sb = createSandbox();
  let child;
  t.after(async () => { if (child && child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([new Promise(r => child.once('exit', r)), sleep(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); } sb.cleanup(); });
  const previousTmp = process.env.TMPDIR;
  process.env.TMPDIR = sb.tmp;
  let canary;
  try { canary = createCanary(); } finally { if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp; }
  t.after(() => { if (existsSync(canary.root)) removeCanary(canary); });
  sb.writeWorkspaceFiles({ 'src/main.ts': 'export function beforefixturemarker() { return 1; }\n', 'src/keep.ts': 'export function untouchedfixturemarker() { return 9; }\n' });
  await buildLocalIndex(sb);
  await trustRoot(sb);
  const identity = () => ['', 'manifest.json', 'files.zvec', 'index.zvec'].map(name => { const s = statSync(join(sb.indexDir, name), { bigint: true }); return `${s.dev}:${s.ino}`; });
  const originalIdentity = identity();
  const requirePkg = createRequire(join(installedPackageDir(), 'package.json'));
  const warnings = join(sb.home, '.local', 'state', 'zvec-grep', 'warnings');
  mkdirSync(warnings, { recursive: true });
  const profile = buildProfile({ port: 47991, nodePath: realpathSync(process.execPath), rgPath: realpathSync(requirePkg('@vscode/ripgrep').rgPath), writableRoots: [sb.zvecHome, sb.modelCache, warnings, join(canary.root, 'new')].map(p => realpathSync(p)), indexHomes: [sb.indexDir, ...canary.indexHomes].map(p => realpathSync(p)), home: realpathSync(sb.zvecHome) });
  child = spawn('/usr/bin/sandbox-exec', ['-p', profile, process.execPath, join(DAEMON_DIR, 'daemon-entry.mjs'), 'run', '--home', sb.zvecHome, '--listen', '127.0.0.1:47991', '--boundary-canary', canary.root], { cwd: sb.workspace, env: sb.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir(), NODE_OPTIONS: '' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  let record; const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && child.exitCode === null) { try { record = readInstanceRecord(sb); if (record.ready && existsSync(record.managedSocket)) break; } catch {} await sleep(100); }
  assert.ok(record?.ready && existsSync(record.managedSocket), `runtime failed to become ready: ${output}`);
  sb.writeWorkspaceFiles({ 'src/main.ts': 'export function afterfixturemarker() { return 2; }\n' });
  const result = await socketRequest(record.managedSocket, 'POST', '/managed/refresh', { root: sb.workspace, wait: true });
  assert.equal(result.json?.status, 'refreshed', result.text);
  const hits = await ftsHits(sb, 'afterfixturemarker');
  assert.deepEqual(identity(), originalIdentity, 'first refresh changed a protected inode');
  assert.equal(hits.code, 0, hits.stderr);
  assert.deepEqual(hits.files, ['src/main.ts']);
  assert.deepEqual((await ftsHits(sb, 'beforefixturemarker')).files, [], 'old content survived refresh');
  assert.deepEqual((await ftsHits(sb, 'untouchedfixturemarker')).files, ['src/keep.ts'], 'unmodified indexed content was lost');
  let previousMarker = 'afterfixturemarker';
  for (const marker of ['secondfixturemarker', 'thirdfixturemarker']) {
    sb.writeWorkspaceFiles({ 'src/main.ts': `export function ${marker}() { return 4; }\n` });
    const update = await socketRequest(record.managedSocket, 'POST', '/managed/refresh', { root: sb.workspace, wait: true });
    assert.equal(update.json?.status, 'refreshed', update.text);
    const updatedHits = await ftsHits(sb, marker);
    assert.equal(updatedHits.code, 0, updatedHits.stderr);
    assert.deepEqual((await ftsHits(sb, previousMarker)).files, [], 'stale content survived refresh');
    previousMarker = marker;
    assert.deepEqual(updatedHits.files, ['src/main.ts']);
    assert.deepEqual(identity(), originalIdentity, 'repeated update changed a protected inode');
  }
  const hook = (event) => sb.run('python3', [HOST_EVENTS, event], {
    input: JSON.stringify({ cwd: sb.workspace, session_id: 'fixture-session' }),
    env: { ZVEC_HOOK_STATE_DIR: join(sb.root, 'hook-state'), ZVEC_GREP_MANAGED_WARNINGS_DIR: warnings, XDG_STATE_HOME: join(sb.home, '.local', 'state'), ZVEC_GREP_PACKAGE_DIR: installedPackageDir() },
  });
  const started = await hook('start');
  assert.equal(started.code, 0, started.stderr);
  sb.writeWorkspaceFiles({ 'src/main.ts': 'export function bridgefixturemarker() { return 3; }\n' });
  const ended = await hook('end');
  assert.equal(ended.code, 0, ended.stderr);
  let bridgeHits;
  const bridgeDeadline = Date.now() + 60_000;
  while (Date.now() < bridgeDeadline) {
    bridgeHits = await ftsHits(sb, 'bridgefixturemarker');
    if (bridgeHits.files.includes('src/main.ts')) break;
    await sleep(500);
  }
  assert.deepEqual(bridgeHits?.files, ['src/main.ts'], `bridge refresh not indexed: ${bridgeHits?.stderr ?? ''} ${output}`);
  assert.deepEqual(identity(), originalIdentity, 'second refresh changed a protected inode');
});
