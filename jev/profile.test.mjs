import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const source = mkdtempSync(join(tmpdir(), 'jev-profile-test-'));
const home = join(source, 'home');
const isolatedSource = join(source, 'checkout');
const isolatedJev = join(isolatedSource, 'jev');
const installedJev = join(home, '.agents', 'jev');
const profiles = join(installedJev, 'profiles');

mkdirSync(home, { recursive: true });
mkdirSync(isolatedJev, { recursive: true });
for (const file of ['jev-setup.sh', 'jev-harness.mjs', 'jev_local_server.py', 'README.md', 'jev-control-plane.rule.md']) {
  copyFileSync(join(here, file), join(isolatedJev, file));
}

after(() => rmSync(source, { recursive: true, force: true }));

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('JEV_') || key.startsWith('JEO_SKILLS_JEV')) delete env[key];
  }
  return { ...env, HOME: home, ...overrides };
}

function writePrivate(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function runHarness(args, overrides = {}) {
  return spawnSync(process.execPath, [join(installedJev, 'jev-harness.mjs'), ...args], {
    cwd: repoRoot,
    env: cleanEnv(overrides),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function status(result) {
  assert.ok(result.stdout.trim().startsWith('{'), `expected JSON status; stdout=${result.stdout}; stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('profile setup stores secrets privately and isolates legacy and backend files', () => {
  const result = spawnSync('bash', [join(isolatedJev, 'jev-setup.sh'), '--profile', 'alpha', '--mode', 'api'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_API_KEY: 'alpha-secret-test-value' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.includes('alpha-secret-test-value'), false, 'setup output must not reveal the API key');

  const base = readFileSync(join(profiles, 'alpha.env'), 'utf8');
  const api = readFileSync(join(profiles, 'alpha.api.env'), 'utf8');
  assert.match(base, /JEV_ENABLED=true/);
  assert.match(base, /JEV_MODE=api/);
  assert.doesNotMatch(base, /JEV_API_KEY/);
  assert.match(api, /JEV_API_KEY=alpha-secret-test-value/);
  assert.equal(statSync(join(profiles, 'alpha.env')).mode & 0o777, 0o600);
  assert.equal(statSync(join(profiles, 'alpha.api.env')).mode & 0o777, 0o600);

  const fakeRouter = join(isolatedSource, '.agent-skills', 'jeo-skill', 'scripts', 'jeo-skill.py');
  mkdirSync(dirname(fakeRouter), { recursive: true });
  writeFileSync(fakeRouter, 'import json, sys\nprint("ROUTER_ARGS=" + json.dumps(sys.argv[1:]))\n');
  const asideSetup = spawnSync('bash', [join(isolatedJev, 'jev-setup.sh'), '--profile', 'aside-u0', '--agent', 'aside', '--mode', 'api'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_API_KEY: 'aside-secret-test-value', JEO_SKILLS_ASIDE_ACCOUNT: 'u/0' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(asideSetup.status, 0, `${asideSetup.stdout}\n${asideSetup.stderr}`);
  assert.equal(asideSetup.stdout.includes('aside-secret-test-value'), false);
  const routerLine = asideSetup.stdout.split(/\r?\n/).find((line) => line.startsWith('ROUTER_ARGS='));
  assert.ok(routerLine, `expected fake router invocation; stdout=${asideSetup.stdout}`);
  assert.deepEqual(JSON.parse(routerLine.slice('ROUTER_ARGS='.length)), [
    'install', 'jev-control-plane', '--agent', 'aside', '--global', '--yes', '--aside-account', 'u/0',
  ]);
  assert.match(readFileSync(join(profiles, 'aside-u0.env'), 'utf8'), /JEV_MODE=api/);
  assert.match(readFileSync(join(profiles, 'aside-u0.api.env'), 'utf8'), /JEV_API_KEY=aside-secret-test-value/);

  writePrivate(join(installedJev, '.env'), 'JEV_MODE=api\nJEV_API_KEY=legacy-secret-test-value\n');
  writePrivate(join(profiles, 'beta.env'), 'JEV_ENABLED=false\nJEV_MODE=local\n');
  writePrivate(join(profiles, 'beta.local.env'), 'JEV_LOCAL_ENDPOINT=http://127.0.0.1:1/v1/systemone\n');
  writePrivate(join(profiles, 'gamma.env'), 'JEV_ENABLED=true\nJEV_MODE=api\n');

  const alphaStatus = runHarness(['--profile', 'alpha', 'status']);
  assert.equal(alphaStatus.status, 0, alphaStatus.stderr);
  const alpha = status(alphaStatus);
  assert.equal(alpha.profile, 'alpha');
  assert.equal(alpha.mode, 'api');
  assert.equal(alpha.ready, null, 'API status must not make an inference request');
  assert.match(alpha.endpoint, /api\.typesafe\.ai/);
  assert.doesNotMatch(alphaStatus.stdout, /alpha-secret-test-value|legacy-secret-test-value|beta-secret-test-value/);

  const betaStatus = runHarness(['--profile', 'beta', 'status']);
  assert.equal(betaStatus.status, 2);
  const beta = status(betaStatus);
  assert.equal(beta.profile, 'beta');
  assert.equal(beta.enabled, false);
  assert.equal(beta.mode, 'local');
  assert.equal(beta.endpoint, 'http://127.0.0.1:1/v1/systemone');
  assert.doesNotMatch(betaStatus.stdout, /alpha-secret-test-value|legacy-secret-test-value|beta-secret-test-value/);

  const missingStatus = runHarness(['--profile', 'missing', 'status']);
  assert.equal(missingStatus.status, 2, 'a missing profile must not fall back to a configured legacy .env');
  assert.equal(status(missingStatus).active, false);
  const ambientOverrides = runHarness(['--profile', 'missing', 'status'], { JEV_ENABLED: 'true', JEV_API_KEY: 'ambient-secret-test-value' });
  assert.equal(ambientOverrides.status, 2, 'ambient variables must not enable a missing profile');
  assert.equal(status(ambientOverrides).enabled, false);
  assert.doesNotMatch(ambientOverrides.stdout, /ambient-secret-test-value/);
  const emptyProfile = runHarness(['--profile=', 'status']);
  assert.notEqual(emptyProfile.status, 0, 'an explicit empty profile must not fall back to legacy configuration');
  assert.doesNotMatch(`${emptyProfile.stdout}\n${emptyProfile.stderr}`, /legacy-secret-test-value/);

  const emptyServerProfile = spawnSync('python3', [join(installedJev, 'jev_local_server.py'), '--profile=', '--check'], {
    cwd: repoRoot,
    env: cleanEnv(),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(emptyServerProfile.status, 0);
  assert.match(`${emptyServerProfile.stdout}\n${emptyServerProfile.stderr}`, /non-empty profile id/);

  const localServer = spawnSync('python3', [join(installedJev, 'jev_local_server.py'), '--profile', 'beta'], {
    cwd: repoRoot,
    env: cleanEnv({ JEV_ENABLED: 'true' }),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(localServer.status, 0);
  assert.match(`${localServer.stdout}\n${localServer.stderr}`, /profile 'beta' is disabled/);
  const disabledStructuralCheck = spawnSync('python3', [join(installedJev, 'jev_local_server.py'), '--profile', 'beta', '--check'], {
    cwd: repoRoot,
    env: cleanEnv({ JEV_ENABLED: 'true' }),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(disabledStructuralCheck.status, 0, disabledStructuralCheck.stderr);
  assert.match(disabledStructuralCheck.stdout, /"modelPresent": false/);
});

test('disable and enable mutate only the selected profile and preserve backend settings', () => {
  const setup = join(isolatedJev, 'jev-setup.sh');
  const fakePython = join(installedJev, 'venv', 'bin', 'python');
  mkdirSync(dirname(fakePython), { recursive: true });
  writeFileSync(fakePython, '#!/bin/sh\nif [ "$1" = "-c" ] || { [ "$1" = "-m" ] && [ "$2" = "pip" ]; }; then exit 0; fi\nif [ "$1" = "$HOME/.agents/jev/jev_local_server.py" ]; then exec python3 "$@"; fi\nexec python3 "$@"\n');
  chmodSync(fakePython, 0o755);
  const localReconfigure = spawnSync('bash', [setup, '--profile', 'beta', '--agent', 'gjc', '--mode', 'local'], {
    env: cleanEnv({ JEV_SKIP_MODEL_DOWNLOAD: 'true' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(localReconfigure.status, 0, `${localReconfigure.stdout}\n${localReconfigure.stderr}`);
  assert.match(localReconfigure.stdout, /Local mode configured for profile 'beta'/);
  assert.equal(localReconfigure.stdout.includes('Downloading/resuming'), false);
  assert.match(readFileSync(join(profiles, 'beta.env'), 'utf8'), /JEV_ENABLED=false/);
  assert.match(readFileSync(join(profiles, 'beta.env'), 'utf8'), /JEV_MODE=local/);
  assert.equal(runHarness(['--profile', 'beta', 'status']).status, 2);

  const disabledReconfigure = spawnSync('bash', [setup, '--profile', 'beta', '--agent', 'gjc', '--mode', 'api'], {
    env: cleanEnv({ JEV_API_KEY: 'beta-secret-test-value' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(disabledReconfigure.status, 0, `${disabledReconfigure.stdout}\n${disabledReconfigure.stderr}`);
  assert.match(readFileSync(join(profiles, 'beta.env'), 'utf8'), /JEV_ENABLED=false/);
  assert.match(readFileSync(join(profiles, 'beta.env'), 'utf8'), /JEV_MODE=api/);
  assert.match(readFileSync(join(profiles, 'beta.api.env'), 'utf8'), /JEV_API_KEY=beta-secret-test-value/);
  assert.match(readFileSync(join(profiles, 'beta.local.env'), 'utf8'), /JEV_LOCAL_ENDPOINT=http:\/\/127\.0\.0\.1:1\/v1\/systemone/);
  assert.equal(runHarness(['--profile', 'beta', 'status']).status, 2, 'backend reconfiguration must not silently enable a disabled profile');

  const disable = spawnSync('bash', [setup, '--profile', 'alpha', '--disable'], { env: cleanEnv(), encoding: 'utf8' });
  assert.equal(disable.status, 0, `${disable.stdout}\n${disable.stderr}`);
  assert.match(readFileSync(join(profiles, 'alpha.env'), 'utf8'), /JEV_ENABLED=false/);
  assert.match(readFileSync(join(profiles, 'alpha.api.env'), 'utf8'), /JEV_API_KEY=alpha-secret-test-value/);
  assert.equal(runHarness(['--profile', 'alpha', 'status']).status, 2);

  const enable = spawnSync('bash', [setup, '--profile', 'alpha', '--enable'], { env: cleanEnv(), encoding: 'utf8' });
  assert.equal(enable.status, 0, `${enable.stdout}\n${enable.stderr}`);
  const enabledConfig = readFileSync(join(profiles, 'alpha.env'), 'utf8');
  assert.match(enabledConfig, /JEV_ENABLED=true/);
  assert.match(enabledConfig, /JEV_MODE=api/);
  assert.equal(runHarness(['--profile', 'alpha', 'status']).status, 0);
  assert.equal(statSync(join(profiles, 'alpha.env')).mode & 0o777, 0o600);

  const disableWithoutProfile = spawnSync('bash', [setup, '--disable'], { env: cleanEnv(), encoding: 'utf8' });
  assert.notEqual(disableWithoutProfile.status, 0);
  assert.match(`${disableWithoutProfile.stdout}\n${disableWithoutProfile.stderr}`, /--disable requires --profile/);

  const emptyProfile = spawnSync('bash', [setup, '--profile', '', '--status'], { env: cleanEnv(), encoding: 'utf8' });
  assert.notEqual(emptyProfile.status, 0);
  assert.match(`${emptyProfile.stdout}\n${emptyProfile.stderr}`, /non-empty profile id/);
});
