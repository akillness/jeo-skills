import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { audit, STAGES, DEPENDENCIES, fingerprint, sha256, validISOWeek, relativePath, parseArgs, MAX_BYTES, FINGERPRINT_DEFINITION } from './mi-audit.mjs';

const example = fileURLToPath(new URL('../assets/example/', import.meta.url));
const cli = fileURLToPath(new URL('./mi-audit.mjs', import.meta.url));
const load = async (root, name) => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const save = async (root, name, data) => fs.writeFile(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
async function fixture(t) {
  const temp = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temp, 'mi-audit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(example, root, { recursive: true }); return root;
}
async function bind(root, manifest) {
  manifest ??= await load(root, 'manifest.json');
  const configHash = sha256(await fs.readFile(path.join(root, manifest.config_path)));
  for (const ref of manifest.sources) ref.sha256 = sha256(await fs.readFile(path.join(root, ref.path)));
  for (const name of STAGES) {
    const stage = manifest.stages[name];
    for (const ref of stage.outputs) ref.sha256 = sha256(await fs.readFile(path.join(root, ref.path)));
    const hashes = name === 'collect' ? manifest.sources.map(r => r.sha256) : DEPENDENCIES[name].flatMap(n => manifest.stages[n].outputs.map(r => r.sha256));
    stage.input_sha256 = fingerprint([manifest.pipeline_version, configHash, manifest.period, manifest.mode, name, ...hashes]);
  }
  await save(root, 'manifest.json', manifest); return manifest;
}
const check = (root, options = {}) => audit({ root, manifest: 'manifest.json', ...options });
const has = (out, code, stage) => out.result.issues.some(i => i.code === code && (!stage || i.stage === stage));
async function hold(root, health = { valid_rows: 1, expected_rows: 2, previous_week_flips: 0, quarantine: ['synthetic-q'] }) {
  const m = await load(root, 'manifest.json'); m.stages.health.status = 'hold';
  for (const name of ['signals', 'render']) { m.stages[name].status = 'skip'; m.stages[name].outputs = []; }
  await save(root, 'health.json', health);
  await fs.writeFile(path.join(root, 'inbox.md'), 'MI_PARTIAL_ALERT\nSynthetic partial health alert. Human review required.\n');
  return bind(root, m);
}
async function tree(root) {
  const entries = {};
  for (const name of (await fs.readdir(root)).sort()) {
    const p = path.join(root, name), stat = await fs.lstat(p);
    entries[name] = stat.isDirectory() ? await tree(p) : { hash: sha256(await fs.readFile(p)), size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, mode: stat.mode };
  }
  return entries;
}

test('synthetic receipt passes and exposes scope, never arbitrary manifest fields', async t => {
  const root = await fixture(t); const m = await load(root, 'manifest.json'); m.run_id = 'credential-canary'; m.pipeline_version = 'https://secret.invalid/token'; await bind(root, m);
  const out = await check(root); assert.equal(out.exitCode, 0); assert.equal(out.result.status, 'verified'); assert.equal(out.result.authority, 'not-certified'); assert.equal(out.result.verification_scope, 'artifact-integrity-and-structure-only'); assert.ok(!JSON.stringify(out).includes('credential-canary')); assert.ok(!JSON.stringify(out).includes('https://secret.invalid'));
});
test('verified plan is no-op and never executes', async t => {
  const out = await check(await fixture(t), { command: 'plan' }); assert.equal(out.exitCode, 0); assert.equal(out.result.no_op, true); assert.ok(out.result.plan.every(s => s.action === 'no_op' && s.execution === 'not_performed'));
});
test('fingerprint definition is compact JSON tuple with ordered upstream bytes', () => {
  const tuple = ['v1', 'a'.repeat(64), '2026-W53', 'weekly', 'collect', 'b'.repeat(64)]; assert.equal(fingerprint(tuple), sha256(Buffer.from(JSON.stringify(tuple)))); assert.notEqual(fingerprint(tuple), fingerprint([...tuple].reverse())); assert.ok(FINGERPRINT_DEFINITION.includes('sources in manifest order'));
});
test('config byte change makes all stages transitively stale', async t => {
  const root = await fixture(t); await fs.appendFile(path.join(root, 'config.json'), ' '); const out = await check(root, { command: 'plan' }); assert.equal(out.exitCode, 1); assert.equal(out.result.status, 'stale'); assert.equal(out.result.issues.filter(i => i.code === 'input_fingerprint_mismatch').length, 7); assert.equal(out.result.plan[0].action, 'external_collect_fresh_needed'); assert.ok(out.result.plan.slice(1).every(s => s.action === 'blocked'));
});
test('raw source change invalidates collect and downstream freshness', async t => {
  const root = await fixture(t); await fs.appendFile(path.join(root, 'raw-source.json'), ' '); const out = await check(root); assert.ok(has(out, 'source_hash_mismatch', 'collect')); assert.ok(STAGES.every(s => !out.result.stages[s].fresh_pass));
});
test('output hash tamper is detected even when downstream has receipts', async t => {
  const root = await fixture(t); await fs.appendFile(path.join(root, 'core.json'), ' '); const out = await check(root, { command: 'plan' }); assert.ok(has(out, 'output_hash_mismatch', 'build_core')); assert.ok(has(out, 'input_fingerprint_mismatch', 'build_mart')); assert.equal(out.result.plan[1].action, 'deterministic_downstream_eligible'); assert.equal(out.result.plan[2].action, 'blocked');
});
test('empty sources list is invalid input', async t => { const root = await fixture(t), m = await load(root, 'manifest.json'); m.sources = []; await save(root, 'manifest.json', m); assert.equal((await check(root)).exitCode, 2); });
test('empty source bytes remain blocked even with rebound hash', async t => { const root = await fixture(t); await fs.writeFile(path.join(root, 'raw-source.json'), ''); await bind(root); assert.ok(has(await check(root), 'empty_source')); });
test('null health is invalid', async t => { const root = await fixture(t); await save(root, 'health.json', null); await bind(root); assert.ok(has(await check(root), 'invalid_health')); });
test('missing health field and invalid expected_rows fail closed', async t => {
  const root = await fixture(t);
  for (const value of [{ valid_rows: 1, expected_rows: 2, quarantine: [] }, { valid_rows: 0, expected_rows: 0, previous_week_flips: 0, quarantine: [] }, { valid_rows: 1, expected_rows: null, previous_week_flips: 0, quarantine: [] }]) { await save(root, 'health.json', value); await bind(root); assert.ok(has(await check(root), 'invalid_health')); }
});
test('weekly hold requires explicit skips and an inbox partial alert', async t => {
  const root = await fixture(t); await hold(root); const out = await check(root, { command: 'plan' }); assert.equal(out.exitCode, 1); assert.equal(out.result.status, 'blocked'); assert.deepEqual(out.result.issues, [{ code: 'human_review_required', stage: 'health' }]); assert.ok(out.result.stages.inbox.integrity); assert.ok(out.result.plan.slice(3).every(s => s.action === 'human_review_required')); assert.equal(out.result.health.quarantine_count, 1);
});
test('held health refuses downstream pass', async t => { const root = await fixture(t), m = await load(root, 'manifest.json'); m.stages.health.status = 'hold'; await bind(root, m); const out = await check(root); assert.ok(has(out, 'hold_requires_skip', 'signals')); assert.ok(has(out, 'hold_requires_skip', 'render')); assert.ok(has(out, 'partial_alert_required', 'inbox')); });
test('held alert without marker is not accepted', async t => { const root = await fixture(t); await hold(root); await fs.writeFile(path.join(root, 'inbox.md'), '# Regular report\n'); await bind(root); assert.ok(has(await check(root), 'partial_alert_required')); });
test('skip stages cannot retain stale outputs', async t => { const root = await fixture(t), m = await load(root, 'manifest.json'); m.stages.signals.status = 'skip'; await save(root, 'manifest.json', m); assert.ok(has(await check(root), 'skip_reuses_output')); });
test('backfill incomplete window remains a censored candidate, not auto-promoted', async t => {
  const root = await fixture(t), m = await load(root, 'manifest.json'); m.mode = 'backfill'; await save(root, 'health.json', { valid_rows: 1, expected_rows: 20, previous_week_flips: 99, quarantine: ['synthetic-q'] }); await save(root, 'signals.json', { items: [{ id: 'synthetic-incomplete', status: 'candidate', censored: true, reason: 'Synthetic incomplete window' }] }); await bind(root, m); assert.equal((await check(root)).exitCode, 0);
  await save(root, 'signals.json', { items: [{ id: 'synthetic-incomplete', status: 'promoted', censored: true, reason: 'Synthetic incomplete window' }] }); await bind(root); assert.ok(has(await check(root), 'invalid_signals'));
});
test('censored candidates require reason', async t => { const root = await fixture(t); await save(root, 'signals.json', { items: [{ id: 'synthetic', status: 'candidate', censored: true }] }); await bind(root); assert.ok(has(await check(root), 'invalid_signals')); });
test('backfill empty health is blocked, even with valid hold artifacts', async t => { const root = await fixture(t); const m = await hold(root, { valid_rows: 0, expected_rows: 2, previous_week_flips: 0, quarantine: [] }); m.mode = 'backfill'; await bind(root, m); const out = await check(root); assert.equal(out.exitCode, 1); assert.ok(has(out, 'empty_health_blocked')); });
test('coverage is recalculated, never trusts supplied coverage or schedule flags', async t => { const root = await fixture(t); const m = await load(root, 'manifest.json'); m.running = true; m.scheduled = true; await save(root, 'health.json', { valid_rows: 1, expected_rows: 2, previous_week_flips: 0, quarantine: [], coverage: 1 }); await bind(root, m); const out = await check(root); assert.equal(out.result.health.coverage, 0.5); assert.ok(has(out, 'health_hold_required')); });
test('coverage equality is pass, flips equality forces hold', async t => { const root = await fixture(t); await save(root, 'config.json', { min_coverage: 0.5, max_previous_week_flips: 3, retry_limit: 1 }); await save(root, 'health.json', { valid_rows: 1, expected_rows: 2, previous_week_flips: 2, quarantine: [] }); await bind(root); assert.equal((await check(root)).exitCode, 0); await save(root, 'health.json', { valid_rows: 1, expected_rows: 2, previous_week_flips: 3, quarantine: [] }); await bind(root); assert.ok(has(await check(root), 'health_hold_required')); });
test('retry_count validates maximum, missing, noninteger and excessive counts', async t => { const root = await fixture(t), m = await load(root, 'manifest.json'); m.retry_count = 1; await bind(root, m); assert.equal((await check(root)).exitCode, 0); for (const n of [undefined, 2, -1, 0.5]) { m.retry_count = n; await save(root, 'manifest.json', m); assert.ok(has(await check(root), 'invalid_retry_count')); } });
test('retry_limit permits only 0 or 1 and never universal thresholds', async t => { const root = await fixture(t); for (const c of [{ min_coverage: 2, max_previous_week_flips: 2, retry_limit: 1 }, { min_coverage: 0.5, max_previous_week_flips: -1, retry_limit: 1 }, { min_coverage: 0.5, max_previous_week_flips: 1, retry_limit: 2 }]) { await save(root, 'config.json', c); assert.ok(has(await check(root), 'invalid_config')); } });
test('since marks old output stale; timestamp input must be a real zoned ISO instant', async t => { const root = await fixture(t); assert.equal((await check(root, { since: '2000-01-01T00:00:00Z' })).exitCode, 0); assert.ok(has(await check(root, { since: '9999-01-01T00:00:00Z' }), 'output_stale_since')); for (const since of ['2026-02-30T00:00:00Z', '2026-10-12', 'https://secret.invalid']) assert.ok(has(await check(root, { since }), 'invalid_since')); });
test('touching does not certify provenance or repair mismatching bytes', async t => { const root = await fixture(t); await fs.appendFile(path.join(root, 'mart.json'), ' '); const future = new Date('2030-01-01T00:00:00Z'); for (const stage of Object.values((await load(root, 'manifest.json')).stages)) for (const ref of stage.outputs) await fs.utimes(path.join(root, ref.path), future, future); const out = await check(root, { since: '2029-01-01T00:00:00Z' }); assert.ok(has(out, 'output_hash_mismatch')); assert.equal(out.result.authority, 'not-certified'); });
test('real ISO year/week boundaries, including 2026 W53 versus 2025 W53', async t => { assert.equal(validISOWeek('2026-W53'), true); for (const p of ['2025-W53', '2026-W00', '2026-W54', '0000-W01', '2026W53']) assert.equal(validISOWeek(p), false); const root = await fixture(t), m = await load(root, 'manifest.json'); m.period = '2026-W53'; await bind(root, m); assert.equal((await check(root)).exitCode, 0); m.period = '2025-W53'; await save(root, 'manifest.json', m); assert.ok(has(await check(root), 'invalid_manifest')); });
test('leaf and root symlinks are rejected before artifact reads', async t => { const root = await fixture(t); await fs.rename(path.join(root, 'core.json'), path.join(root, 'real-core.json')); await fs.symlink('real-core.json', path.join(root, 'core.json')); assert.ok(has(await check(root), 'symlink_blocked')); const parent = await fixture(t); await fs.symlink(root, path.join(parent, 'linked-root')); assert.ok(has(await check(path.join(parent, 'linked-root')), 'symlink_blocked')); });
test('intermediate parent symlink and outside-root symlink escape are rejected', async t => { const root = await fixture(t), outside = await fixture(t), m = await load(root, 'manifest.json'); await fs.symlink(outside, path.join(root, 'linked-dir')); m.sources[0].path = 'linked-dir/raw-source.json'; await save(root, 'manifest.json', m); assert.ok(has(await check(root), 'symlink_blocked')); await fs.symlink(outside, path.join(root, 'escape.json')); m.sources[0].path = 'escape.json'; await save(root, 'manifest.json', m); assert.ok(has(await check(root), 'symlink_blocked')); });
test('absolute, drive-relative, traversal and URL paths never echo input', async t => { const root = await fixture(t); for (const manifest of ['/etc/passwd', '../secret', 'C:\\secret', 'C:secret', '\\\\host\\secret', 'https://secret.invalid/token', 'a/../manifest.json']) { const out = await audit({ root, manifest }); assert.equal(out.exitCode, 2); assert.ok(!JSON.stringify(out).includes('secret')); } assert.equal(relativePath('dir\\file.json'), 'dir/file.json'); });
test('malformed JSON and missing required statuses are structured errors', async t => { const root = await fixture(t); await fs.writeFile(path.join(root, 'manifest.json'), '{secret-bad-json'); let out = await check(root); assert.ok(has(out, 'invalid_json')); assert.ok(!JSON.stringify(out).includes('secret-bad')); await fs.cp(example, root, { recursive: true }); const m = await load(root, 'manifest.json'); delete m.stages.collect.status; await save(root, 'manifest.json', m); out = await check(root); assert.ok(has(out, 'invalid_stage')); });
test('prior failure refuses downstream pass', async t => { const root = await fixture(t), m = await load(root, 'manifest.json'); m.stages.collect.status = 'fail'; m.stages.collect.outputs = []; await bind(root, m); const out = await check(root); assert.ok(has(out, 'upstream_not_fresh_pass', 'build_core')); assert.ok(STAGES.every(s => !out.result.stages[s].fresh_pass)); });
test('report requires real slot attributes and no placeholder markers', async t => { const root = await fixture(t); for (const html of ['<div data-mi-slot="bluf"></div><div data-mi-slot="wave"></div>', '<div data-mi-slot="bluf"></div><div data-mi-slot="wave"></div><div data-mi-slot="insight">MI_PLACEHOLDER</div>', '<script>data-mi-slot="bluf" data-mi-slot="wave" data-mi-slot="insight"</script>', '<!-- <p data-mi-slot="bluf" data-mi-slot="wave" data-mi-slot="insight"> -->']) { await fs.writeFile(path.join(root, 'report.html'), html); await bind(root); assert.ok(has(await check(root), 'render_structure_invalid')); } });
test('JSON and any artifact are size-bounded', async t => { const root = await fixture(t); await fs.writeFile(path.join(root, 'raw-source.json'), Buffer.alloc(MAX_BYTES + 1)); assert.ok(has(await check(root), 'file_too_large')); });
test('CLI help and denied flags use stdout JSON and expected exit codes', async t => { const root = await fixture(t); for (const [args, code] of [[['--help'], 0], [['check', '--root', root, '--manifest', 'manifest.json'], 0], [['plan', '--root', root, '--manifest', 'manifest.json'], 0], [['check', '--manifest', 'manifest.json'], 2], [['check', '--root', root, '--manifest', 'manifest.json', '--execute', 'secret-token'], 2], [['check', '--root', root, '--root', root, '--manifest', 'manifest.json'], 2]]) { const out = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); assert.equal(out.status, code); assert.equal(out.stderr, ''); assert.doesNotThrow(() => JSON.parse(out.stdout)); assert.ok(!out.stdout.includes('secret-token')); } assert.throws(() => parseArgs(['check', '--root'])); });
test('audits and plans never write fixture or source-example trees', async t => { const root = await fixture(t), before = await tree(root), sourceBefore = await tree(example); await check(root); await check(root, { command: 'plan' }); await check(root, { since: '9999-01-01T00:00:00Z' }); assert.deepEqual(await tree(root), before); assert.deepEqual(await tree(example), sourceBefore); });

test('root lexical traversal cannot hide an intermediate symlink', async t => { const root = await fixture(t); assert.ok(has(await check(path.join(root, 'missing') + '/../'), 'invalid_root')); });
test('slot strings inside unrelated quoted attributes are not structural slots', async t => { const root = await fixture(t); await fs.writeFile(path.join(root, 'report.html'), `<div title=" data-mi-slot='bluf' data-mi-slot='wave' data-mi-slot='insight'">Synthetic</div>`); await bind(root); assert.ok(has(await check(root), 'render_structure_invalid')); });
test('unknown prototype-property flags and exhausted retries fail closed', async t => { const root = await fixture(t); for (const flag of ['constructor', '__proto__', 'toString']) assert.throws(() => parseArgs(['check', '--root', root, '--manifest', 'manifest.json', flag, 'canary'])); const m = await load(root, 'manifest.json'); m.retry_count = 1; m.stages.build_core.status = 'fail'; m.stages.build_core.outputs = []; await bind(root, m); const out = await check(root, { command: 'plan' }); assert.equal(out.result.plan[1].action, 'retry_limit_reached'); });

test('collector fail with retry_count/retry_limit 0/0 reports exhaustion, not fresh collection', async t => {
  const root = await fixture(t), m = await load(root, 'manifest.json'), config = await load(root, 'config.json');
  config.retry_limit = 0; await save(root, 'config.json', config);
  m.retry_count = 0; m.stages.collect.status = 'fail'; m.stages.collect.outputs = []; await bind(root, m);
  const out = await check(root, { command: 'plan' });
  assert.equal(out.exitCode, 1); assert.equal(out.result.plan[0].action, 'retry_limit_reached'); assert.equal(out.result.plan[0].execution, 'not_performed');
});
test('collector fail with retry_count/retry_limit 1/1 reports exhaustion before external branch', async t => {
  const root = await fixture(t), m = await load(root, 'manifest.json');
  m.retry_count = 1; m.stages.collect.status = 'fail'; m.stages.collect.outputs = []; await bind(root, m);
  const out = await check(root, { command: 'plan' });
  assert.equal(out.exitCode, 1); assert.equal(out.result.plan[0].action, 'retry_limit_reached');
  m.retry_count = 0; await bind(root, m);
  assert.equal((await check(root, { command: 'plan' })).result.plan[0].action, 'external_collect_fresh_needed');
});
test('duplicate lowercase data-mi-slot attributes count only their first occurrence', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'report.html'), '<div data-mi-slot="bluf" data-mi-slot="wave" data-mi-slot="insight">Synthetic</div>'); await bind(root);
  const out = await check(root); assert.equal(out.exitCode, 1); assert.ok(has(out, 'render_structure_invalid', 'render'));
});
test('duplicate mixed-case data-mi-slot attributes are one case-insensitive attribute per tag', async t => {
  const root = await fixture(t);
  for (const html of ['<div DATA-MI-SLOT="bluf" data-mi-slot="wave" Data-Mi-Slot="insight">Synthetic</div>', '<div DATA-MI-SLOT data-mi-slot="bluf">Synthetic</div><p data-mi-slot="wave"></p><p data-mi-slot="insight"></p>']) {
    await fs.writeFile(path.join(root, 'report.html'), html); await bind(root);
    const out = await check(root); assert.equal(out.exitCode, 1); assert.ok(has(out, 'render_structure_invalid', 'render'));
  }
  await fs.writeFile(path.join(root, 'report.html'), '<div DATA-MI-SLOT="bluf" data-mi-slot="ignored">Synthetic</div><p data-mi-slot="wave"></p><p Data-Mi-Slot="insight"></p>'); await bind(root);
  assert.equal((await check(root)).exitCode, 0);
});
test('invalid-byte inbox is blocked for normal and held pass receipts without input writes', async t => {
  const root = await fixture(t), sourceBefore = await tree(example);
  for (const held of [false, true]) {
    if (held) await hold(root);
    await fs.writeFile(path.join(root, 'inbox.md'), Buffer.from([0x53, 0x79, 0xc3, 0x28])); await bind(root);
    const before = await tree(root), out = await check(root);
    assert.equal(out.exitCode, 1); assert.equal(out.result.status, 'blocked'); assert.ok(has(out, 'invalid_utf8', 'inbox')); assert.equal(out.result.stages.inbox.fresh_pass, false);
    assert.deepEqual(await tree(root), before);
  }
  assert.deepEqual(await tree(example), sourceBefore);
});
test('opaque raw/collect/core/mart verification and declared censoring limitations are explicit', async t => {
  const root = await fixture(t);
  for (const name of ['raw-source.json', 'collect.json', 'core.json', 'mart.json']) await fs.writeFile(path.join(root, name), Buffer.from([0xff, 0xfe, 0x7b]));
  await bind(root); const before = await tree(root), out = await check(root);
  assert.equal(out.exitCode, 0);
  assert.ok(out.result.limitations.includes('manifest.sources (raw), collect, build_core and build_mart payloads are opaque bytes: UTF-8 validity, domain JSON, domain schema, canonical outputs and actual transforms are not verified.'));
  assert.ok(out.result.limitations.includes('Censoring checks validate only the declared boolean and required reason structure; actual window correctness is not verified.'));
  assert.deepEqual(await tree(root), before);
});
