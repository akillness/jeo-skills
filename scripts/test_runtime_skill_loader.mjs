#!/usr/bin/env bun
/**
 * Opt-in probe for actual session skill loaders; no model/network invocation.
 * Imported runtimes may write diagnostics only inside the supplied fixture HOME.
 * Launch with the invoking user's HOME; a guarded worker starts with fixture HOME.
 *
 * bun scripts/test_runtime_skill_loader.mjs --runtime gjc --module /absolute/skills.ts \
 *   --home /tmp/fixture/home --cwd /tmp/fixture/project --skill unique-fixture \
 *   --expect present --expected-path /tmp/fixture/home/.gjc/agent/skills/unique-fixture/SKILL.md \
 *   --description 'Fixture skill for installer verification'
 *
 * --expect absent checks GJC's shared-only rejection before native projection.
 * --timeout-ms bounds each worker (maximum 120000); every run is a fresh process.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(error, phase = 'probe') {
  console.error(JSON.stringify({ ok: false, phase, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      ...Object.fromEntries([
        'runtime', 'module', 'home', 'cwd', 'skill', 'expect', 'expected-path', 'description',
        'gjc-config-dir', 'pi-config-dir', 'timeout-ms',
      ].map(name => [name, { type: 'string' }])),
      worker: { type: 'boolean' },
    },
    strict: true,
  });
  for (const name of ['runtime', 'module', 'home', 'cwd', 'skill', 'expect']) {
    assert.ok(values[name], `--${name} is required`);
  }
  assert.ok(['jeopi', 'jeo', 'gjc', 'omp'].includes(values.runtime), 'unsupported runtime');
  assert.ok(['present', 'absent'].includes(values.expect), '--expect must be present or absent');
  assert.ok(isAbsolute(values.module), '--module must identify an absolute real loader path');
  assert.ok(isAbsolute(values.home) && isAbsolute(values.cwd), '--home and --cwd must be absolute fixture paths');
  const timeout = Number(values['timeout-ms'] ?? 30000);
  assert.ok(Number.isInteger(timeout) && timeout > 0 && timeout <= 120000, '--timeout-ms must be an integer from 1 to 120000');
  const home = await realpath(values.home);
  const cwd = await realpath(values.cwd);
  assert.notEqual(cwd, home, 'use separate fixture HOME and project directories');

  if (!values.worker) {
    const originalHome = await realpath(userInfo().homedir);
    assert.notEqual(home, originalHome, 'launch with original HOME and pass a different fixture --home');
    // Allowlist only: never inherit provider keys, runtime bridges or preload flags.
    const environment = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: home,
      TMPDIR: home,
      TMP: home,
      TEMP: home,
      XDG_CONFIG_HOME: resolve(home, '.config'),
      XDG_CACHE_HOME: resolve(home, '.cache'),
      XDG_DATA_HOME: resolve(home, '.local/share'),
      XDG_STATE_HOME: resolve(home, '.local/state'),
      _JEO_LOADER_PROBE_ORIGINAL_HOME: originalHome,
    };
    if (values['gjc-config-dir']) environment.GJC_CONFIG_DIR = values['gjc-config-dir'];
    if (values['pi-config-dir']) environment.PI_CONFIG_DIR = values['pi-config-dir'];
    const worker = spawnSync(process.execPath,
      [fileURLToPath(import.meta.url), ...process.argv.slice(2), '--worker'],
      { env: environment, cwd, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
    if (worker.stdout) process.stdout.write(worker.stdout);
    if (worker.stderr) process.stderr.write(worker.stderr);
    if (worker.error?.code === 'ETIMEDOUT') fail(worker.error, 'worker-timeout');
    if (worker.error) fail(worker.error, 'worker-launch');
    if (worker.signal) fail(`worker killed by ${worker.signal}`, 'worker-signal');
    if (worker.status !== 0) process.exit(worker.status ?? 1);
    // A runtime can exit(0) during import or swallow a fatal error. Exit status
    // alone is not proof that our assertions were reached and passed.
    const lastLine = worker.stdout.trim().split('\n').at(-1);
    let proof;
    try { proof = JSON.parse(lastLine); } catch { fail('worker exited without verified loader evidence', 'worker-evidence'); }
    assert.ok(proof.ok === true && proof.runtime === values.runtime && proof.skill === values.skill
      && proof.expected === values.expect && proof.home === home && proof.cwd === cwd
      && proof.module === values.module, 'worker returned mismatched loader evidence');
    return;
  }

  assert.ok(process.env._JEO_LOADER_PROBE_ORIGINAL_HOME, 'worker must be launched by the guarded parent');
  assert.notEqual(home, process.env._JEO_LOADER_PROBE_ORIGINAL_HOME, 'worker cannot use the real HOME');
  assert.equal(await realpath(homedir()), home, 'worker startup HOME must equal fixture HOME');
  process.chdir(cwd);
  // Register before importing runtime modules that may install swallowing handlers.
  process.on('uncaughtException', error => fail(error, 'uncaught-exception'));
  process.on('unhandledRejection', error => fail(error, 'unhandled-rejection'));
  const loader = await import(pathToFileURL(values.module).href);
  assert.equal(typeof loader.loadSkills, 'function', 'module must export the real session loadSkills API');
  const result = await loader.loadSkills(values.runtime === 'jeo' ? cwd : { cwd });
  const skills = values.runtime === 'jeo' ? result : result.skills;
  const matching = skills.filter(skill => skill.name === values.skill);
  const observed = matching.map(skill => ({
    name: skill.name,
    path: skill.filePath ?? skill.sourcePath,
    description: skill.description ?? skill.summary,
    source: skill.source,
  }));
  if (values.expect === 'absent') {
    assert.deepEqual(matching, [], `unexpectedly loaded ${values.skill}: ${JSON.stringify(observed)}`);
  } else {
    assert.ok(values['expected-path'], '--expected-path is required for presence assertions');
    assert.ok(values.description, '--description is required to verify parsed skill metadata');
    assert.equal(matching.length, 1, `expected exactly one resolved skill: ${JSON.stringify(observed)}`);
    const skill = matching[0];
    assert.equal(await realpath(skill.filePath ?? skill.sourcePath), await realpath(values['expected-path']),
      'runtime selected a different skill origin');
    assert.equal(skill.description ?? skill.summary, values.description, 'runtime did not parse the expected skill metadata');
    if (values.runtime === 'jeo') {
      assert.equal(skill.raw, await readFile(values['expected-path'], 'utf8'), 'runtime loaded different skill content');
    }
  }
  console.log(JSON.stringify({
    ok: true, runtime: values.runtime, expected: values.expect, skill: values.skill,
    home, cwd, module: values.module, observed,
    warnings: values.runtime === 'jeo' ? [] : result.warnings,
  }));
}

try {
  await main();
} catch (error) {
  fail(error);
}
