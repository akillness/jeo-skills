import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
// A checkout catalog keeps setup's catalog snapshot local (no network fetch).
mkdirSync(join(isolatedSource, '.agent-skills'), { recursive: true });
copyFileSync(join(repoRoot, '.agent-skills', 'skills.json'), join(isolatedSource, '.agent-skills', 'skills.json'));

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

test('systemone mode and per-operation policy flags write isolated private files and preserve foreign keys', () => {
  const setup = join(isolatedJev, 'jev-setup.sh');
  const systemone = spawnSync('bash', [setup, '--profile', 'systemone', '--mode', 'systemone', '--route-backend', 'ollama', '--review-backend', 'systemone', '--fallback', 'review=api,ollama', '--validated-model', 'systemone-model'], {
    cwd: isolatedSource,
    env: cleanEnv({
      JEV_SYSTEMONE_ENDPOINT: 'https://systemone.example.test/v1',
      JEV_SYSTEMONE_DRIVER: 'typesafe',
      JEV_SYSTEMONE_MODEL: 'systemone-model',
      JEV_SYSTEMONE_API_KEY: 'systemone-secret-test-value',
      JEV_SYSTEMONE_HEAD_JSON: '/tmp/head.json',
      JEV_SYSTEMONE_CALIBRATION_JSON: '/tmp/calibration.json',
      JEV_SYSTEMONE_CHOICE_CAP: '12',
    }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(systemone.status, 0, `${systemone.stdout}\n${systemone.stderr}`);
  assert.equal(systemone.stdout.includes('systemone-secret-test-value'), false, 'setup output must not reveal the System One API key');

  const basePath = join(profiles, 'systemone.env');
  const systemonePath = join(profiles, 'systemone.systemone.env');
  const base = readFileSync(basePath, 'utf8');
  const backend = readFileSync(systemonePath, 'utf8');
  assert.match(base, /JEV_MODE=systemone/);
  assert.match(base, /JEV_ROUTE_SKILLS_BACKEND=ollama/);
  assert.match(base, /JEV_REVIEW_BACKEND=systemone/);
  assert.match(base, /JEV_REVIEW_FALLBACK=api,ollama/);
  assert.match(backend, /JEV_SYSTEMONE_ENDPOINT=https:\/\/systemone\.example\.test\/v1/);
  assert.match(backend, /JEV_SYSTEMONE_DRIVER=typesafe/);
  assert.match(backend, /JEV_SYSTEMONE_MODEL=systemone-model/);
  assert.match(backend, /JEV_SYSTEMONE_API_KEY=systemone-secret-test-value/);
  assert.match(backend, /JEV_SYSTEMONE_HEAD_JSON=\/tmp\/head\.json/);
  assert.match(backend, /JEV_SYSTEMONE_CALIBRATION_JSON=\/tmp\/calibration\.json/);
  assert.match(backend, /JEV_SYSTEMONE_CHOICE_CAP=12/);
  assert.match(backend, /JEV_SYSTEMONE_VALIDATED_MODEL=systemone-model/);
  assert.equal(statSync(basePath).mode & 0o777, 0o600);
  assert.equal(statSync(systemonePath).mode & 0o777, 0o600);

  const api = spawnSync('bash', [setup, '--profile', 'systemone', '--mode', 'api'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_API_KEY: 'api-rerun-secret-test-value' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(api.status, 0, `${api.stdout}\n${api.stderr}`);
  const rerunBase = readFileSync(basePath, 'utf8');
  assert.match(rerunBase, /JEV_MODE=api/);
  assert.match(rerunBase, /JEV_ROUTE_SKILLS_BACKEND=ollama/);
  assert.match(rerunBase, /JEV_REVIEW_BACKEND=systemone/);
  assert.match(rerunBase, /JEV_REVIEW_FALLBACK=api,ollama/);
  assert.match(readFileSync(join(profiles, 'systemone.api.env'), 'utf8'), /JEV_API_KEY=api-rerun-secret-test-value/);

  const invalidKind = spawnSync('bash', [setup, '--profile', 'badkind', '--mode', 'systemone', '--route-backend', 'unknown'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_SYSTEMONE_ENDPOINT: 'https://systemone.example.test/v1', JEV_SYSTEMONE_MODEL: 'systemone-model' }),
    encoding: 'utf8',
  });
  assert.notEqual(invalidKind.status, 0);
  assert.equal(existsSync(join(profiles, 'badkind.env')), false, 'invalid backend must fail before writing');
  const invalidOperation = spawnSync('bash', [setup, '--profile', 'badop', '--mode', 'systemone', '--fallback', 'unknown=api'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_SYSTEMONE_ENDPOINT: 'https://systemone.example.test/v1', JEV_SYSTEMONE_MODEL: 'systemone-model' }),
    encoding: 'utf8',
  });
  assert.notEqual(invalidOperation.status, 0);
  assert.equal(existsSync(join(profiles, 'badop.env')), false, 'invalid operation must fail before writing');
});

test('config-only setup writes disabled private backend profiles without dependencies or downloads', () => {
  const setup = join(isolatedJev, 'jev-setup.sh');
  const forbidden = join(source, 'forbidden-config-only-bin');
  mkdirSync(forbidden, { recursive: true });
  for (const command of ['python3', 'ollama', 'lms', 'curl']) {
    const stub = join(forbidden, command);
    writeFileSync(stub, `#!/bin/sh\nprintf 'FORBIDDEN_${command}\\n' >> "$HOME/jev-config-only-forbidden.log"\nexit 97\n`);
    chmodSync(stub, 0o755);
  }
  const modes = ['api', 'local', 'ollama', 'lmstudio', 'systemone'];
  for (const mode of modes) {
    const profile = `config-only-${mode}`;
    const endpoint = `http://127.0.0.1:18${String(modes.indexOf(mode)).padStart(2, '0')}/v1/systemone`;
    const model = mode === 'local' ? 'jev-9b-local' : `jev-${mode}-test-model`;
    const result = spawnSync('bash', [
      setup, '--profile', profile, '--mode', mode, '--config-only',
      '--endpoint', endpoint, '--model', model, '--key-env', 'JEV_TEST_KEY',
    ], {
      cwd: isolatedSource,
      env: cleanEnv({
        PATH: `${forbidden}:${process.env.PATH}`,
        JEV_TEST_KEY: `${profile}-secret-value`,
      }),
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(result.status, 0, `${mode}: ${result.stdout}\n${result.stderr}`);
    assert.equal(existsSync(join(home, 'jev-config-only-forbidden.log')), false, `${mode} invoked a dependency/download command`);
    assert.equal(result.stdout.includes(`${profile}-secret-value`), false, `${mode} leaked the key value`);
    const basePath = join(profiles, `${profile}.env`);
    const modePath = join(profiles, `${profile}.${mode}.env`);
    assert.equal(existsSync(basePath), true, `${mode} did not create its profile file`);
    assert.equal(existsSync(modePath), true, `${mode} did not create its backend file`);
    const base = readFileSync(basePath, 'utf8');
    const backend = readFileSync(modePath, 'utf8');
    assert.match(base, /JEV_ENABLED=false/);
    assert.match(base, new RegExp(`JEV_MODE=${mode}`));
    assert.match(backend, new RegExp(`(?:JEV_${mode.toUpperCase()}_ENDPOINT|JEV_SYSTEMONE_ENDPOINT|JEV_LOCAL_ENDPOINT|JEV_OLLAMA_ENDPOINT|JEV_LMSTUDIO_ENDPOINT)=${endpoint.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
    assert.match(backend, new RegExp(`(?:JEV_${mode.toUpperCase()}_MODEL|JEV_${mode.toUpperCase()}_VALIDATED_MODEL|JEV_LOCAL_MODEL|JEV_SYSTEMONE_MODEL)=${model}`));
    assert.equal(statSync(basePath).mode & 0o777, 0o600);
    assert.equal(statSync(modePath).mode & 0o777, 0o600);
  }
});

test('ordinary profile setup preserves saved API ownership against conflicting ambient values', () => {
  const setup = join(isolatedJev, 'jev-setup.sh');
  const profile = 'work';
  const storedEndpoint = 'https://stored.example.test/v1/systemone';
  const storedModel = 'stored-model';
  const initial = spawnSync('bash', [setup, '--profile', profile, '--mode', 'api', '--config-only', '--endpoint', storedEndpoint, '--model', storedModel, '--key-env', 'JEV_STORED_KEY'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_STORED_KEY: 'stored-secret-value' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(initial.status, 0, `${initial.stdout}\n${initial.stderr}`);
  const apiPath = join(profiles, `${profile}.api.env`);
  writePrivate(apiPath, `${readFileSync(apiPath, 'utf8')}JEV_API_ATTESTATION_JSON=stored-attestation.json\n`);

  const rerun = spawnSync('bash', [setup, '--profile', profile, '--mode', 'api'], {
    cwd: isolatedSource,
    env: cleanEnv({
      JEV_API_KEY: 'ambient-conflicting-secret',
      JEV_API_ENDPOINT: 'https://ambient.example.test/v1/systemone',
      JEV_API_MODEL: 'ambient-model',
      JEV_API_ATTESTATION_JSON: 'ambient-attestation.json',
    }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(rerun.status, 0, `${rerun.stdout}\n${rerun.stderr}`);
  const api = readFileSync(apiPath, 'utf8');
  assert.match(api, /JEV_API_KEY=stored-secret-value/);
  assert.match(api, /JEV_API_ENDPOINT=https:\/\/stored\.example\.test\/v1\/systemone/);
  assert.match(api, /JEV_API_MODEL=stored-model/);
  assert.match(api, /JEV_API_ATTESTATION_JSON=stored-attestation\.json/);
  assert.doesNotMatch(api, /ambient-conflicting-secret|ambient\.example\.test|ambient-model|ambient-attestation/);
});
test('ordinary API selection accepts an ambient key when no saved API backend exists', () => {
  const setup = join(isolatedJev, 'jev-setup.sh');
  const profile = 'saved-local-without-api';
  const basePath = join(profiles, `${profile}.env`);
  writePrivate(basePath, 'JEV_ENABLED=true\nJEV_MODE=local\n');
  const result = spawnSync('bash', [setup, '--profile', profile, '--mode', 'api'], {
    cwd: isolatedSource,
    env: cleanEnv({ JEV_API_KEY: 'legacy-ambient-secret' }),
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(join(profiles, `${profile}.api.env`)), true);
  assert.equal(readFileSync(basePath, 'utf8').includes('JEV_MODE=api'), true);
  assert.match(readFileSync(join(profiles, `${profile}.api.env`), 'utf8'), /JEV_API_KEY=legacy-ambient-secret/);
});
