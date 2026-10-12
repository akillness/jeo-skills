import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const plugin = join(here, 'jev-plugin.mjs');
const fixtures = [];

after(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function privateWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}
function hostModelsFixture(f, { agent = 'jeopi', profile = f.profile, observedAt = new Date().toISOString(), inventory }) {
  const path = join(f.root, 'host-models.json');
  writeFileSync(path, JSON.stringify({ agent, profile, observedAt, inventory }));
  return path;
}

function fixture({ profile = 'alpha', enabled = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-plugin-test-'));
  fixtures.push(root);
  const home = join(root, 'home');
  const profileDir = join(home, '.agents', 'jev', 'profiles');
  const bin = join(root, 'bin');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(bin, { recursive: true });
  privateWrite(join(profileDir, `${profile}.env`), `JEV_ENABLED=${enabled}\nJEV_MODE=api\n`);
  privateWrite(join(profileDir, `${profile}.api.env`), [
    'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone',
    'JEV_API_KEY=plugin-test-secret-value',
    'JEV_API_VALIDATED_MODEL=jev-test-model',
    '',
  ].join('\n'));
  return { root, home, profileDir, bin, profile };
}

function installForbiddenCommand(f, name) {
  const path = join(f.bin, name);
  writeFileSync(path, `#!/bin/sh\nprintf '%s %s\\n' ${JSON.stringify(name)} "$*" >> "$HOME/jev-plugin-command.log"\nexit 91\n`);
  chmodSync(path, 0o755);
}
function runPlugin(f, args, { input = '', env = {}, entry = plugin, cwd = repoRoot } = {}) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: f.home,
      PATH: `${f.bin}:${process.env.PATH}`,
      JEV_PLUGIN_CONTROLLER: plugin,
      ...env,
    },
    input,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function runHostileCallback(f, hostileCwd, target, profile = f.profile, extraEnv = {}) {
  const modulePath = target === 'claude'
    ? join(here, 'plugins', 'claude', 'hooks', 'jev-hook.mjs')
    : join(here, 'plugins', target, 'index.mjs');
  const moduleUrl = pathToFileURL(modulePath).href;
  const script = target === 'claude'
    ? `import { Readable } from 'node:stream';\nconst mod = await import(${JSON.stringify(moduleUrl)});\nconst result = await mod.runClaudeHook(['--agent', 'claude', '--profile', ${JSON.stringify(profile)}], Readable.from([JSON.stringify({ prompt: 'hostile cwd regression' })]));\nprocess.stdout.write(JSON.stringify(result));\n`
    : `const mod = await import(${JSON.stringify(moduleUrl)});\nlet callback;\nconst api = { on(event, fn) { if (event === 'before_agent_start') callback = fn; } };\nconst factory = mod.createJevExtension || mod.default;\nconst envelope = await factory(api);\nconst result = callback ? await callback({ prompt: 'hostile cwd regression' }) : {};\nprocess.stdout.write(JSON.stringify({ envelope, result }));\n`;
  const env = { ...process.env, HOME: f.home, PATH: `${f.bin}:${process.env.PATH}`, ...extraEnv };
  delete env.JEV_PLUGIN_CONTROLLER;
  delete env.JEV_PROFILE;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: hostileCwd,
    env,
    encoding: 'utf8',
    timeout: 15_000,
  });
}
async function runHostileCallbackAsync(f, hostileCwd, target, profile = f.profile, extraEnv = {}) {
  const modulePath = target === 'claude'
    ? join(here, 'plugins', 'claude', 'hooks', 'jev-hook.mjs')
    : join(here, 'plugins', target, 'index.mjs');
  const moduleUrl = pathToFileURL(modulePath).href;
  const script = target === 'claude'
    ? `import { Readable } from 'node:stream';\nconst mod = await import(${JSON.stringify(moduleUrl)});\nconst result = await mod.runClaudeHook(['--agent', 'claude', '--profile', ${JSON.stringify(profile)}], Readable.from([JSON.stringify({ prompt: 'hostile cwd regression' })]));\nprocess.stdout.write(JSON.stringify(result));\n`
    : `const mod = await import(${JSON.stringify(moduleUrl)});\nlet callback;\nconst api = { on(event, fn) { if (event === 'before_agent_start') callback = fn; } };\nconst factory = mod.createJevExtension || mod.default;\nconst envelope = await factory(api);\nconst result = callback ? await callback({ prompt: 'hostile cwd regression' }) : {};\nprocess.stdout.write(JSON.stringify({ envelope, result }));\n`;
  const env = { ...process.env, HOME: f.home, PATH: `${f.bin}:${process.env.PATH}`, ...extraEnv };
  delete env.JEV_PLUGIN_CONTROLLER;
  delete env.JEV_PROFILE;
  return await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd: hostileCwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolveResult({ status, stdout, stderr }));
  });
}

function jsonResult(result) {
  const output = result.stdout.trim();
  assert.ok(output.startsWith('{') || output.startsWith('['), `expected JSON output; stdout=${result.stdout}; stderr=${result.stderr}`);
  return JSON.parse(output);
}

function profileBytes(f) {
  const files = readdirSync(f.profileDir).sort();
  return Object.fromEntries(files.map(name => [name, readFileSync(join(f.profileDir, name))]));
}

async function withCounterServer(run) {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}/v1/systemone`, () => requests);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

test('configure preview is zero-write and performs no CLI or HTTP work', async () => {
  const f = fixture({ enabled: false });
  installForbiddenCommand(f, 'claude');
  const before = profileBytes(f);
  await withCounterServer(async (endpoint, count) => {
    const result = runPlugin(f, [
      'configure', '--agent', 'claude', '--profile', f.profile,
      '--backend', 'api', '--endpoint', endpoint, '--model', 'jev-preview-model', '--key-env', 'JEV_API_KEY',
    ]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const body = jsonResult(result);
    assert.equal(body.ok, true);
    assert.equal(body.applied, false);
    assert.equal(body.agent, 'claude');
    assert.equal(body.profile, f.profile);
    assert.equal(result.stdout.includes('plugin-test-secret-value'), false);
    assert.deepEqual(profileBytes(f), before);
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
    assert.equal(count(), 0);
  });
});

test('configure apply requests canonical config-only setup and writes mode-600 endpoint/model state', async () => {
  const f = fixture({ enabled: false });
  installForbiddenCommand(f, 'claude');
  await withCounterServer(async (endpoint, count) => {
    const result = runPlugin(f, [
      'configure', '--agent', 'claude', '--profile', f.profile,
      '--backend', 'api', '--endpoint', endpoint, '--model', 'jev-configured-model', '--key-env', 'JEV_API_KEY', '--apply',
    ], { env: { JEV_API_KEY: 'plugin-test-secret-value' } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const body = jsonResult(result);
    assert.equal(body.ok, true);
    assert.equal(body.applied, true);
    assert.equal(body.enabled, false, 'reconfiguration must preserve the existing disabled JEV_ENABLED state');
    assert.equal(result.stdout.includes('plugin-test-secret-value'), false);
    const basePath = join(f.profileDir, `${f.profile}.env`);
    const apiPath = join(f.profileDir, `${f.profile}.api.env`);
    const api = readFileSync(apiPath, 'utf8');
    assert.match(api, /JEV_API_ENDPOINT=http:\/\/127\.0\.0\.1:\d+\/v1\/systemone/);
    assert.match(api, /JEV_API_VALIDATED_MODEL=jev-configured-model|JEV_API_MODEL=jev-configured-model|JEV_LOCAL_MODEL=jev-configured-model|JEV_SYSTEMONE_MODEL=jev-configured-model|JEV_MODEL=jev-configured-model/);
    assert.match(readFileSync(basePath, 'utf8'), /^JEV_ENABLED=false$/m);
    assert.equal(statSync(basePath).mode & 0o777, 0o600);
    assert.equal(statSync(apiPath).mode & 0o777, 0o600);
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
    assert.equal(count(), 0);
  });
});
test('configure api update reuses a saved profile key across backend switches without ambient secret leakage', () => {
  const f = fixture({ profile: 'saved-api', enabled: false });
  privateWrite(join(f.profileDir, 'saved-api.env'), 'JEV_ENABLED=false\nJEV_MODE=ollama\n');
  privateWrite(join(f.profileDir, 'saved-api.ollama.env'), 'JEV_OLLAMA_ENDPOINT=http://127.0.0.1:11434\nJEV_OLLAMA_MODEL=old-local-model\n');
  privateWrite(join(f.profileDir, 'saved-api.api.env'), [
    'JEV_API_ENDPOINT=http://127.0.0.1:8763/v1/systemone',
    'JEV_API_KEY=saved-api-key',
    'JEV_API_MODEL=old-api-model',
    '',
  ].join('\n'));
  installForbiddenCommand(f, 'claude');
  const result = runPlugin(f, [
    'configure', '--agent', 'claude', '--profile', f.profile,
    '--backend', 'api', '--endpoint', 'http://127.0.0.1:8764/v1/systemone', '--model', 'updated-api-model', '--apply',
  ], { env: { JEV_API_KEY: 'ambient-conflicting-api-key' } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = jsonResult(result);
  assert.equal(body.ok, true);
  assert.equal(body.applied, true);
  assert.equal(body.enabled, false, 'switching backends must preserve JEV_ENABLED');
  const api = readFileSync(join(f.profileDir, 'saved-api.api.env'), 'utf8');
  assert.match(api, /^JEV_API_ENDPOINT=http:\/\/127\.0\.0\.1:8764\/v1\/systemone$/m);
  assert.match(api, /^JEV_API_MODEL=updated-api-model$/m);
  assert.match(api, /^JEV_API_KEY=saved-api-key$/m);
  assert.doesNotMatch(api, /ambient-conflicting-api-key/);
  assert.doesNotMatch(result.stdout, /saved-api-key|ambient-conflicting-api-key/);
  assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
});

test('configure api without key-env still rejects a new api profile with no saved key', () => {
  const f = fixture({ profile: 'new-api', enabled: false });
  rmSync(join(f.profileDir, 'new-api.api.env'));
  const before = profileBytes(f);
  const result = runPlugin(f, [
    'configure', '--agent', 'claude', '--profile', f.profile,
    '--backend', 'api', '--endpoint', 'http://127.0.0.1:8765/v1/systemone', '--model', 'new-api-model', '--apply',
  ], { env: { JEV_API_KEY: 'ambient-only-api-key' } });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /key|environment|api/i);
  assert.deepEqual(profileBytes(f), before);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ambient-only-api-key/);
});

test('invalid configure input fails before any write or side effect', () => {
  const cases = [
    ['invalid backend', ['--backend', 'not-a-backend'], /backend|unsupported/i],
    ['invalid endpoint', ['--backend', 'api', '--endpoint', 'file:///tmp/jev'], /endpoint|url|scheme/i],
    ['invalid key environment name', ['--backend', 'api', '--endpoint', 'http://127.0.0.1:1/v1/systemone', '--key-env', 'not-valid'], /key|environment|env/i],
  ];
  for (const [name, extra, errorPattern] of cases) {
    const f = fixture({ profile: `invalid-${name.replace(/[^a-z0-9]+/g, '-')}`, enabled: true });
    installForbiddenCommand(f, 'claude');
    const before = profileBytes(f);
    const result = runPlugin(f, ['configure', '--agent', 'claude', '--profile', f.profile, ...extra]);
    assert.notEqual(result.status, 0, name);
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.match(combined, errorPattern, name);
    assert.deepEqual(profileBytes(f), before, `${name} mutated profile files`);
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false, `${name} invoked a native command`);
  }
});
test('enable rejects incomplete non-local backends while preserving local legacy defaults', () => {
  const incomplete = [
    ['api', 'JEV_API_ENDPOINT=http://127.0.0.1:8763/v1/systemone\n'],
    ['ollama', 'JEV_OLLAMA_ENDPOINT=http://127.0.0.1:11434\n'],
    ['lmstudio', 'JEV_LMSTUDIO_ENDPOINT=http://127.0.0.1:1234\n'],
    ['systemone', 'JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:8763/v1/systemone\n'],
  ];
  for (const [mode, backend] of incomplete) {
    const f = fixture({ profile: `strict-${mode}`, enabled: false });
    privateWrite(join(f.profileDir, `${f.profile}.env`), `JEV_ENABLED=false\nJEV_MODE=${mode}\n`);
    privateWrite(join(f.profileDir, `${f.profile}.${mode}.env`), backend);
    const before = profileBytes(f);
    const result = runPlugin(f, ['enable', '--agent', 'claude', '--profile', f.profile, '--apply']);
    assert.notEqual(result.status, 0, `${mode} endpoint-only profile must not enable`);
    assert.match(`${result.stdout}\n${result.stderr}`, /configured|complete|model|key|invalid/i);
    assert.deepEqual(profileBytes(f), before, `${mode} rejection must not mutate profile files`);
  }
  const localOverride = fixture({ profile: 'strict-local-override', enabled: false });
  privateWrite(join(localOverride.profileDir, `${localOverride.profile}.env`), 'JEV_ENABLED=false\nJEV_MODE=local\n');
  privateWrite(join(localOverride.profileDir, `${localOverride.profile}.local.env`), 'JEV_LOCAL_ENDPOINT=http://127.0.0.1:8763/v1/systemone\n');
  const overrideResult = runPlugin(localOverride, ['enable', '--agent', 'claude', '--profile', localOverride.profile, '--apply']);
  assert.equal(overrideResult.status, 0, `${overrideResult.stdout}\n${overrideResult.stderr}`);
  assert.equal(jsonResult(overrideResult).enabled, true);

  const bareLocal = fixture({ profile: 'strict-local-default', enabled: false });
  privateWrite(join(bareLocal.profileDir, `${bareLocal.profile}.env`), 'JEV_ENABLED=false\nJEV_MODE=local\n');
  rmSync(join(bareLocal.profileDir, `${bareLocal.profile}.local.env`), { force: true });
  const bareResult = runPlugin(bareLocal, ['enable', '--agent', 'claude', '--profile', bareLocal.profile, '--apply']);
  assert.equal(bareResult.status, 0, `${bareResult.stdout}\n${bareResult.stderr}`);
  assert.equal(jsonResult(bareResult).enabled, true);

  const valid = fixture({ profile: 'strict-valid', enabled: false });
  const enabled = runPlugin(valid, ['enable', '--agent', 'claude', '--profile', valid.profile, '--apply']);
  assert.equal(enabled.status, 0, `${enabled.stdout}\n${enabled.stderr}`);
  assert.equal(jsonResult(enabled).enabled, true);
});


test('enable and disable use one isolated JEV_ENABLED switch, are idempotent, and preserve other agents', () => {
  const f = fixture({ profile: 'alpha', enabled: true });
  const beta = join(f.profileDir, 'beta.env');
  privateWrite(beta, 'JEV_ENABLED=false\nJEV_MODE=api\n');
  privateWrite(join(f.home, '.agents', 'jev', 'agents.json'), JSON.stringify({ legacy: { profile: 'beta', native: 'adapter', scope: 'user' } }, null, 2));
  installForbiddenCommand(f, 'claude');
  const disabled = runPlugin(f, ['disable', '--agent', 'claude', '--profile', 'alpha', '--apply']);
  assert.equal(disabled.status, 0, `${disabled.stdout}\n${disabled.stderr}`);
  assert.equal(jsonResult(disabled).enabled, false);
  const afterDisable = readFileSync(join(f.profileDir, 'alpha.env'), 'utf8');
  assert.match(afterDisable, /^JEV_ENABLED=false$/m);
  assert.equal((afterDisable.match(/^JEV_ENABLED=/gm) || []).length, 1);
  const repeated = runPlugin(f, ['disable', '--agent', 'claude', '--profile', 'alpha', '--apply']);
  assert.equal(repeated.status, 0);
  assert.equal(readFileSync(join(f.profileDir, 'alpha.env'), 'utf8'), afterDisable);
  const enabled = runPlugin(f, ['enable', '--agent', 'claude', '--profile', 'alpha', '--apply']);
  assert.equal(enabled.status, 0, `${enabled.stdout}\n${enabled.stderr}`);
  assert.equal(jsonResult(enabled).enabled, true);
  assert.match(readFileSync(join(f.profileDir, 'alpha.env'), 'utf8'), /^JEV_ENABLED=true$/m);
  assert.match(readFileSync(beta, 'utf8'), /^JEV_ENABLED=false$/m);
  assert.deepEqual(JSON.parse(readFileSync(join(f.home, '.agents', 'jev', 'agents.json'), 'utf8')), { legacy: { profile: 'beta', native: 'adapter', scope: 'user' } });
  assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false, 'toggle must not disable the whole native host');
});

test('OFF hook returns before stdin, catalog, backend, or native command access', async () => {
  const f = fixture({ enabled: false });
  installForbiddenCommand(f, 'claude');
  const catalog = join(f.root, 'catalog-secret.json');
  writeFileSync(catalog, JSON.stringify({ secret: 'catalog-secret-value' }));
  await withCounterServer(async (endpoint, count) => {
    const result = runPlugin(f, ['hook', '--agent', 'claude', '--profile', f.profile], {
      input: JSON.stringify({ prompt: 'catalog-secret-value' }),
      env: { JEV_CATALOG_PATH: catalog, JEV_API_ENDPOINT: endpoint },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const body = jsonResult(result);
    assert.equal(body.ok, true);
    assert.ok(!body.hookSpecificOutput || Object.keys(body.hookSpecificOutput).length === 0);
    assert.equal(result.stdout.includes('catalog-secret-value'), false);
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
    assert.equal(count(), 0);
  });
});

test('Claude UserPromptSubmit hook emits advisory context only when profile is ON', () => {
  const f = fixture({ enabled: true });
  const result = runPlugin(f, ['hook', '--agent', 'claude', '--profile', f.profile], {
    input: JSON.stringify({ prompt: 'Fix the routing regression' }),
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = jsonResult(result);
  assert.equal(body.ok, true);
  assert.equal(body.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(typeof body.hookSpecificOutput.additionalContext, 'string');
  assert.ok(body.hookSpecificOutput.additionalContext.length > 0);
  assert.equal(body.hookSpecificOutput.additionalContext.includes('plugin-test-secret-value'), false);
});
test('hook redacts hostile backend error bodies and emits a fixed unavailable category', async () => {
  const f = fixture({ enabled: true });
  const catalog = join(f.root, 'catalog.json');
  privateWrite(catalog, JSON.stringify({
    skills: [{ name: 'routing-test', category: 'engineering', description: 'Routing regression skill' }],
    categories: { engineering: ['routing-test'] },
    model_policies: {},
  }));
  const marker = 'HOSTILE_BACKEND_INSTRUCTION_MARKER';
  const server = createServer((_request, response) => {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end(`upstream failure ${marker}`);
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/v1/systemone`;
    privateWrite(join(f.profileDir, `${f.profile}.api.env`), [
      `JEV_API_ENDPOINT=${endpoint}`,
      'JEV_API_KEY=plugin-test-secret-value',
      'JEV_API_VALIDATED_MODEL=jev-test-model',
      '',
    ].join('\\n'));
    const result = runPlugin(f, ['hook', '--agent', 'claude', '--profile', f.profile], {
      input: JSON.stringify({ prompt: 'route this hostile backend regression' }),
      env: { JEV_CATALOG_PATH: catalog },
    });
    assert.equal(result.status, 0, `${result.stdout}\\n${result.stderr}`);
    const body = jsonResult(result);
    const advice = body.hookSpecificOutput.additionalContext;
    assert.equal(body.ok, true);
    assert.match(advice, /backend_unavailable/);
    assert.doesNotMatch(advice, new RegExp(marker));
    assert.doesNotMatch(result.stdout, new RegExp(marker));
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
});

test('Claude native hook wrapper export returns the UserPromptSubmit envelope', async () => {
  const f = fixture({ enabled: true });
  const previousHome = process.env.HOME;
  const previousController = process.env.JEV_PLUGIN_CONTROLLER;
  process.env.HOME = f.home;
  process.env.JEV_PLUGIN_CONTROLLER = plugin;
  try {
    const loaded = await import(pathToFileURL(join(here, 'plugins', 'claude', 'hooks', 'jev-hook.mjs')).href);
    assert.equal(typeof loaded.runClaudeHook, 'function');
    const result = await loaded.runClaudeHook(
      ['--agent', 'claude', '--profile', f.profile],
      Readable.from([JSON.stringify({ prompt: 'Review the Jev plugin contract' })]),
    );
    assert.deepEqual(Object.keys(result).sort(), ['hookSpecificOutput']);
    assert.equal('ok' in result, false);
    assert.equal('action' in result, false);
    assert.equal('agent' in result, false);
    assert.equal('profile' in result, false);
    assert.equal('enabled' in result, false);
    assert.equal(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.equal(typeof result.hookSpecificOutput.additionalContext, 'string');
    assert.doesNotMatch(JSON.stringify(result), /plugin-test-secret-value/);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousController === undefined) delete process.env.JEV_PLUGIN_CONTROLLER;
    else process.env.JEV_PLUGIN_CONTROLLER = previousController;
  }
});

test('mapping metadata contains only agent/profile/native scope and never duplicates enabled/backend/credentials', () => {
  const f = fixture({ enabled: true });
  privateWrite(join(f.home, '.agents', 'jev', 'agents.json'), JSON.stringify({ other: { profile: 'beta', native: 'adapter', scope: 'project' } }, null, 2));
  const result = runPlugin(f, ['enable', '--agent', 'claude', '--profile', f.profile, '--apply']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const path = join(f.home, '.agents', 'jev', 'agents.json');
  assert.equal(existsSync(path), true);
  const mappingText = readFileSync(path, 'utf8');
  assert.doesNotMatch(mappingText, /JEV_API_KEY|plugin-test-secret-value/);
 
  assert.doesNotMatch(mappingText, /"(?:enabled|backend|mode|key|endpoint)"\s*:/i);
  assert.deepEqual(JSON.parse(mappingText).other, { profile: 'beta', native: 'adapter', scope: 'project' });
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('jeopi OMP and Pi native wrappers register and execute before_agent_start advisory callbacks', async () => {
  const f = fixture({ enabled: true });
  const previousHome = process.env.HOME;
  const previousProfile = process.env.JEV_PROFILE;
  const previousController = process.env.JEV_PLUGIN_CONTROLLER;
  const previousAgent = process.env.JEV_AGENT_ID;
  process.env.HOME = f.home;
  process.env.JEV_PROFILE = f.profile;
  process.env.JEV_PLUGIN_CONTROLLER = plugin;
  process.env.JEV_AGENT_ID = 'claude';
  try {
    for (const host of ['jeopi', 'omp', 'pi']) {
      const copiedRoot = join(f.root, 'native-package-copies', host);
      cpSync(join(here, 'plugins', host), copiedRoot, { recursive: true });
      const modulePath = join(copiedRoot, 'index.mjs');
      const loaded = await import(pathToFileURL(modulePath).href);
      const factory = loaded.createJevExtension || loaded.default;
      assert.equal(typeof factory, 'function', `${host} must export a callback factory`);
      const registrations = [];
      const api = { on(event, callback) { registrations.push({ event, callback }); } };
      const envelope = await factory(api);
      assert.ok(envelope === undefined || typeof envelope === 'object', `${host} factory returned an invalid envelope`);
      assert.equal(envelope?.agent, host, `${host} must not inherit ambient JEV_AGENT_ID`);
      const registration = registrations.find(item => item.event === 'before_agent_start');
      assert.ok(registration, `${host} did not register before_agent_start`);
      const prior = host === 'pi' ? 'existing Pi system prompt' : ['existing system segment', 'existing safety segment'];
      const advisory = await registration.callback({ prompt: 'Fix the Jev routing regression', systemPrompt: prior });
      assert.ok(advisory && typeof advisory === 'object', `${host} callback did not return an advisory envelope`);
      if (host === 'pi') {
        assert.equal(typeof advisory.systemPrompt, 'string', 'Pi before_agent_start must return a string systemPrompt');
        assert.ok(advisory.systemPrompt.startsWith(`${prior}\n`), 'Pi must preserve prior system prompt with newline separator');
        assert.ok(advisory.systemPrompt.slice(prior.length + 1).length > 0, 'Pi must append advisory context after prior prompt');
      } else {
        assert.ok(Array.isArray(advisory.systemPrompt), `${host} before_agent_start must return string[] systemPrompt`);
        assert.deepEqual(advisory.systemPrompt.slice(0, prior.length), prior, `${host} must preserve prior system prompt segments`);
        assert.equal(advisory.systemPrompt.length, prior.length + 1, `${host} must append exactly one advisory segment`);
        assert.equal(typeof advisory.systemPrompt.at(-1), 'string');
      }
      const serialized = JSON.stringify(advisory);
      assert.match(serialized, /systemPrompt|messages|context/i);
      assert.doesNotMatch(serialized, /"(?:permission|authorize|tool[_-]?use|hot.?swap)"\s*:/i);
      assert.doesNotMatch(serialized, /plugin-test-secret-value/);
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousProfile === undefined) delete process.env.JEV_PROFILE;
    else process.env.JEV_PROFILE = previousProfile;
    if (previousController === undefined) delete process.env.JEV_PLUGIN_CONTROLLER;
    else process.env.JEV_PLUGIN_CONTROLLER = previousController;
    if (previousAgent === undefined) delete process.env.JEV_AGENT_ID;
    else process.env.JEV_AGENT_ID = previousAgent;
  }
});
test('actual OFF registered callback accepts a 1MiB prompt without crashing the host', async (t) => {
  for (const host of ['jeopi', 'omp', 'pi']) {
    await t.test(host, () => {
      const f = fixture({ enabled: false });
      const moduleUrl = pathToFileURL(join(here, 'plugins', host, 'index.mjs')).href;
      const helperUrl = pathToFileURL(join(here, 'plugins', host, 'shared', 'jev-controller.mjs')).href;
      const script = [
        `const mod = await import(${JSON.stringify(moduleUrl)});`,
        `const helper = await import(${JSON.stringify(helperUrl)});`,
        `let callback;`,
        `const api = { on(event, fn) { if (event === 'before_agent_start') callback = fn; } };`,
        `const options = { profile: ${JSON.stringify(f.profile)}, controllerPath: ${JSON.stringify(plugin)} };`,
        `const registration = await (mod.createJevExtension || mod.default)(api, options);`,
        `if (!callback) throw new Error('before_agent_start callback was not registered');`,
        `const prompt = 'x'.repeat(1024 * 1024);`,
        `const result = await callback({ prompt, systemPrompt: ${JSON.stringify(host === 'pi' ? 'prior' : ['prior'])} });`,
        `const inactive = await helper.invokeControllerHook({ ...options, agent: ${JSON.stringify(host)}, input: { type: 'UserPromptSubmit', prompt } });`,
        `process.stdout.write(JSON.stringify({ registration, result, inactive }));`,
      ].join('\n');
      const env = { ...process.env, HOME: f.home, PATH: `${f.bin}:${process.env.PATH}` };
      for (const key of Object.keys(env)) if (key.startsWith('JEV_')) delete env[key];
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: f.root, env, encoding: 'utf8', timeout: 15_000,
      });
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      const body = jsonResult(child);
      assert.equal(body.registration.registered, true);
      assert.deepEqual(body.result, {}, 'OFF callback must not replace or append host context');
      assert.equal(body.inactive.ok, true);
      assert.equal(body.inactive.enabled, false);
      assert.equal(body.inactive.applied, false);
      assert.equal(body.inactive.agent, host);
      assert.equal(body.inactive.profile, f.profile);
      assert.doesNotMatch(child.stderr, /EPIPE|Unhandled.*error/i);
    });
  }
});

test('native controller timeout escalates a TERM-ignoring child to SIGKILL without an orphan', async () => {
  const f = fixture({ enabled: true });
  const sharedPath = join(here, 'plugins', 'shared', 'jev-controller.mjs');
  const makeStall = (name) => {
    const marker = join(f.root, `${name}.marker`);
    const pidFile = join(f.root, `${name}.pid`);
    const controller = join(f.root, `${name}.mjs`);
    writeFileSync(controller, [
      `import { writeFileSync } from 'node:fs';`,
      `const marker = ${JSON.stringify(marker)};`,
      `const pidFile = ${JSON.stringify(pidFile)};`,
      `writeFileSync(marker, 'started');`,
      `writeFileSync(pidFile, String(process.pid));`,
      `process.on('SIGTERM', () => { writeFileSync(marker, 'term-ignored'); });`,
      `setInterval(() => {}, 1000);`,
    ].join('\n'));
    return { marker, pidFile, controller };
  };
  const assertDead = async (pidFile, label) => {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.ok(Number.isInteger(pid) && pid > 0, `${label} must publish its pid`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const probe = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' });
      const state = probe.status === 0 ? probe.stdout.trim() : '';
      if (!state || /^Z/.test(state)) return;
      await new Promise(resolveTick => setImmediate(resolveTick));
    }
    assert.fail(`${label} remained alive after timeout escalation`);
  };
  const shared = await import(pathToFileURL(sharedPath).href);
  const direct = makeStall('direct-timeout');
  const directResult = await shared.invokeControllerHook({
    agent: 'jeopi',
    profile: f.profile,
    input: { type: 'UserPromptSubmit', prompt: 'timeout regression' },
    controllerPath: direct.controller,
    timeoutMs: 200,
  });
  assert.equal(directResult.ok, false);
  assert.equal(directResult.code, 'CONTROLLER_TIMEOUT');
  assert.equal(readFileSync(direct.marker, 'utf8'), 'term-ignored');
  await assertDead(direct.pidFile, 'direct controller');

  const previousHome = process.env.HOME;
  const previousProfile = process.env.JEV_PROFILE;
  const previousController = process.env.JEV_PLUGIN_CONTROLLER;
  process.env.HOME = f.home;
  process.env.JEV_PROFILE = f.profile;
  try {
    for (const host of ['jeopi', 'omp', 'pi']) {
      const stalled = makeStall(`${host}-timeout`);
      process.env.JEV_PLUGIN_CONTROLLER = stalled.controller;
      const modulePath = join(here, 'plugins', host, 'index.mjs');
      const loaded = await import(pathToFileURL(modulePath).href);
      const registrations = [];
      const api = { on(event, callback) { registrations.push({ event, callback }); } };
      const factory = loaded.createJevExtension || loaded.default;
      await factory(api, { profile: f.profile, timeoutMs: 200, controllerPath: stalled.controller });
      const registration = registrations.find(item => item.event === 'before_agent_start');
      assert.ok(registration, `${host} did not register before_agent_start`);
      const started = Date.now();
      const advisory = await registration.callback({ prompt: 'timeout regression', systemPrompt: host === 'pi' ? 'prior' : ['prior'] });
      assert.ok(Date.now() - started < 500, `${host} callback waited for stalled controller`);
      assert.deepEqual(advisory, {}, `${host} timeout must return a neutral advisory envelope`);
      assert.equal(readFileSync(stalled.marker, 'utf8'), 'term-ignored');
      await assertDead(stalled.pidFile, `${host} controller`);
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousProfile === undefined) delete process.env.JEV_PROFILE;
    else process.env.JEV_PROFILE = previousProfile;
    if (previousController === undefined) delete process.env.JEV_PLUGIN_CONTROLLER;
    else process.env.JEV_PLUGIN_CONTROLLER = previousController;
  }
});
test('Bun-installed jeopi wrapper uses the trusted installed controller and preserves OFF short-circuiting', async () => {
  const f = fixture({ profile: 'bun-profile', enabled: true });
  const hostile = join(f.root, 'hostile-cwd');
  mkdirSync(join(hostile, '.agent-skills'), { recursive: true });
  privateWrite(join(hostile, '.agent-skills', 'skills.json'), JSON.stringify({
    skills: [{ name: 'hostile-skill', category: 'hostile', description: 'HOSTILE_BUN_CWD_MARKER' }],
    categories: { hostile: ['hostile-skill'] },
    model_policies: {},
  }));
  const trustedCatalog = {
    skills: [{ name: 'trusted-skill', category: 'trusted', description: 'TRUSTED_BUN_INSTALL_MARKER' }],
    categories: { trusted: ['trusted-skill'] },
    model_policies: {},
  };
  const installedRoot = join(f.home, '.agents', 'jev');
  const installedController = join(installedRoot, 'jev-plugin.mjs');
  mkdirSync(installedRoot, { recursive: true });
  copyFileSync(plugin, installedController);
  copyFileSync(join(here, 'jev-harness.mjs'), join(installedRoot, 'jev-harness.mjs'));
  privateWrite(join(installedRoot, 'skills.json'), JSON.stringify(trustedCatalog));
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(raw);
      requests.push(payload);
      const questions = payload.questions || {};
      const answers = Object.fromEntries(Object.entries(questions).map(([id, question]) => {
        if (question.type === 'choice') {
          const options = question.options || [];
          return [id, { choice: options.slice(0, 1), probabilities: Object.fromEntries(options.map(option => [option, options.length ? 1 / options.length : 1])) }];
        }
        return [id, { probability: 1 }];
      }));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'bun-loopback', answers }));
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/systemone`;
  privateWrite(join(f.profileDir, `${f.profile}.api.env`), [
    `JEV_API_ENDPOINT=${endpoint}`,
    'JEV_API_KEY=bun-test-secret',
    'JEV_API_VALIDATED_MODEL=bun-loopback',
    '',
  ].join('\n'));
  const script = `const mod = await import(${JSON.stringify(pathToFileURL(join(here, 'plugins', 'jeopi', 'index.mjs')).href)});\nlet callback;\nconst api = { on(event, fn) { if (event === 'before_agent_start') callback = fn; } };\nconst envelope = await mod.createJevExtension(api, { profile: ${JSON.stringify(f.profile)}, controllerPath: ${JSON.stringify(installedController)}, timeoutMs: 3000 });\nconst result = callback ? await callback({ prompt: 'bun trusted catalog regression', systemPrompt: ['prior'] }) : {};\nprocess.stdout.write(JSON.stringify({ envelope, result }));\n`;
  const runBun = () => new Promise((resolveRun, rejectRun) => {
    const child = spawn('bun', ['--cwd', hostile, '-e', script], {
      cwd: hostile,
      env: { ...process.env, HOME: f.home, PATH: `${f.bin}:${process.env.PATH}` },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectRun);
    child.on('close', status => resolveRun({ status, stdout, stderr }));
  });
  try {
    const on = await runBun();
    assert.equal(on.status, 0, `${on.stdout}\n${on.stderr}`);
    const onPayload = JSON.parse(on.stdout.trim());
    assert.equal(onPayload.envelope.agent, 'jeopi');
    assert.equal(onPayload.envelope.registered, true);
    assert.match(JSON.stringify(onPayload.result), /Jev advisory only/);
    assert.doesNotMatch(JSON.stringify(onPayload.result), /hostile-skill|HOSTILE_BUN_CWD_MARKER/);
    assert.equal(requests.length, 1, 'enabled Bun wrapper should make exactly one loopback request');
    assert.match(JSON.stringify(requests[0]), /trusted-skill|TRUSTED_BUN_INSTALL_MARKER/);
    assert.doesNotMatch(JSON.stringify(requests[0]), /hostile-skill|HOSTILE_BUN_CWD_MARKER/);
    privateWrite(join(f.profileDir, `${f.profile}.env`), 'JEV_ENABLED=false\nJEV_MODE=api\n');
    const off = await runBun();
    assert.equal(off.status, 0, `${off.stdout}\n${off.stderr}`);
    const offPayload = JSON.parse(off.stdout.trim());
    assert.deepEqual(offPayload.result, {});
    assert.equal(requests.length, 1, 'disabled Bun wrapper must not query the backend');
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
test('opt-in live Ollama smoke reaches loopback service and reports real routing outcome', { skip: process.env.JEV_LIVE_SMOKE !== '1' }, async () => {
  const f = fixture({ profile: 'live-ollama', enabled: true });
  const endpoint = process.env.JEV_LIVE_OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
  const model = process.env.JEV_LIVE_OLLAMA_MODEL || 'qwen2.5:0.5b';
  const catalog = join(f.root, 'live-skills.json');
  privateWrite(catalog, JSON.stringify({
    skills: [
      { name: 'frontend-patterns', category: 'engineering', description: 'Real registered frontend performance patterns.' },
      { name: 'backend-patterns', category: 'engineering', description: 'Real registered backend service patterns.' },
      { name: 'testing-strategies', category: 'engineering', description: 'Real registered test validation strategies.' },
    ],
    categories: { engineering: ['frontend-patterns', 'backend-patterns', 'testing-strategies'] },
    model_policies: {},
  }));
  privateWrite(join(f.profileDir, `${f.profile}.env`), 'JEV_ENABLED=true\nJEV_MODE=ollama\n');
  privateWrite(join(f.profileDir, `${f.profile}.ollama.env`), [
    `JEV_OLLAMA_ENDPOINT=${endpoint}`,
    `JEV_OLLAMA_MODEL=${model}`,
    '',
  ].join('\n'));
  const result = await new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [plugin, 'hook', '--agent', 'jeopi', '--profile', f.profile], {
      cwd: f.root,
      env: {
        ...process.env,
        HOME: f.home,
        PATH: `${f.bin}:${process.env.PATH}`,
        JEV_CATALOG_PATH: catalog,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectResult);
    child.on('close', status => resolveResult({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify({ prompt: 'Select the best registered skill for a React frontend performance regression.' }));
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = JSON.parse(result.stdout.trim());
  assert.equal(body.ok, true);
  assert.equal(body.enabled, true);
  const probeEndpoint = `${endpoint.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/models`;
  let probe;
  try {
    const response = await fetch(probeEndpoint);
    probe = { reachable: true, status: response.status, request: probeEndpoint };
  } catch (error) {
    probe = { reachable: false, error: error?.name || 'request-error', request: probeEndpoint };
  }
  assert.equal(probe.reachable, true, `configured Ollama endpoint was not reachable: ${JSON.stringify(probe)}`);
  assert.equal(typeof probe.status, 'number', `configured Ollama endpoint did not return an HTTP response: ${JSON.stringify(probe)}`);
  assert.doesNotMatch(body.context, /model list timeout|connection refused|ECONNREFUSED|fetch failed/i);
  assert.doesNotMatch(body.context, /invalid probability|Malformed|No JSON object|model list responded \d+/i, 'live backend bodies must not enter advisory context');
  const skillNames = ['frontend-patterns', 'backend-patterns', 'testing-strategies'];
  const unavailable = body.context.match(/routing unavailable \(([^)]+)\)/i);
  const errorCategory = unavailable ? unavailable[1] : null;
  const selectedSkill = errorCategory ? null : skillNames.find(name => body.context.includes(name)) || null;
  process.stderr.write(`live Ollama diagnostic: ${JSON.stringify({ skills: skillNames, selectedSkill, model, source: 'loopback-ollama', probe, errorCategory })}\n`);
  if (errorCategory) {
    assert.equal(errorCategory, 'backend_unavailable', 'live failure must use the fixed backend category');
    assert.equal(selectedSkill, null);
  } else {
    assert.ok(selectedSkill, 'successful live routing must select a registered catalog skill');
  }
  assert.doesNotMatch(errorCategory || '', /permit|permission|hot.?swap/i, 'error category must not claim authority or model switching');
});


test('native controller copies remain byte-identical to the canonical helper', () => {
  const canonical = readFileSync(join(here, 'plugins', 'shared', 'jev-controller.mjs'));
  for (const host of ['claude', 'jeopi', 'omp', 'pi']) {
    const local = readFileSync(join(here, 'plugins', host, 'shared', 'jev-controller.mjs'));
    assert.equal(Buffer.compare(canonical, local), 0, `${host} controller copy drifted from canonical helper`);
  }
});

test('CLI invoked through an absolute symlink emits the real status JSON', () => {
  const f = fixture({ enabled: true });
  const before = profileBytes(f);
  const alias = join(f.root, 'jev-cli-alias.mjs');
  symlinkSync(plugin, alias);
  const result = runPlugin(f, ['status', '--agent', 'claude', '--profile', f.profile], { entry: alias, cwd: f.root });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = jsonResult(result);
  assert.equal(body.ok, true);
  assert.equal(body.action, 'status');
  assert.equal(body.agent, 'claude');
  assert.equal(body.profile, f.profile);
  assert.equal(body.enabled, true);
  assert.deepEqual(profileBytes(f), before, 'read-only status through symlink must not mutate profile files');
});

test('native callbacks never execute a hostile CWD controller without explicit JEV_PLUGIN_CONTROLLER', () => {
  const states = [
    ['disabled', fixture({ enabled: false }), false],
    ['missing', fixture({ enabled: false }), true],
  ];
  for (const [, f, removeProfile] of states) {
    if (removeProfile) rmSync(join(f.profileDir, `${f.profile}.env`), { force: true });
    for (const target of ['claude', 'jeopi', 'omp', 'pi']) {
      const hostile = join(f.root, `hostile-${target}`);
      const marker = join(hostile, 'cwd-controller-executed');
      mkdirSync(join(hostile, 'jev'), { recursive: true });
      writeFileSync(join(hostile, 'jev', 'jev-plugin.mjs'), [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(marker)}, 'executed');`,
      ].join('\n'));
      const result = runHostileCallback(f, hostile, target);
      assert.equal(result.status, 0, `${target} ${removeProfile ? 'missing' : 'disabled'} callback failed: ${result.stderr}`);
      assert.equal(existsSync(marker), false, `${target} executed a controller discovered from hostile CWD`);
      const output = result.stdout.trim();
      assert.ok(output.startsWith('{'), `${target} returned non-neutral output: ${result.stdout}`);
      assert.doesNotMatch(output, /plugin-test-secret-value/);
    }
  }
});

test('native hook prefers trusted installed catalog over hostile CWD catalog', async () => {
  const f = fixture({ enabled: true });
  const hostile = join(f.root, 'hostile-catalog-cwd');
  mkdirSync(join(hostile, '.agent-skills'), { recursive: true });
  const trustedCatalog = {
    skills: [{ name: 'trusted-skill', category: 'trusted', description: 'TRUSTED_CATALOG_ONLY routing skill' }],
    categories: { trusted: ['trusted-skill'] },
    model_policies: {},
  };
  const hostileCatalog = {
    skills: [{ name: 'hostile-skill', category: 'hostile', description: 'HOSTILE_CWD_INSTRUCTION injected skill' }],
    categories: { hostile: ['hostile-skill'] },
    model_policies: {},
  };
  privateWrite(join(f.home, '.agents', 'jev', 'skills.json'), JSON.stringify(trustedCatalog));
  privateWrite(join(hostile, '.agent-skills', 'skills.json'), JSON.stringify(hostileCatalog));
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(raw));
      const questions = requests.at(-1).questions || {};
      const answers = Object.fromEntries(Object.entries(questions).map(([id, question]) => {
        if (question.type === 'choice') {
          const options = question.options || [];
          return [id, { choice: options.slice(0, 1), probabilities: Object.fromEntries(options.map(option => [option, options.length ? 1 / options.length : 1])) }];
        }
        return [id, { probability: 1 }];
      }));
      const body = JSON.stringify({ model: 'loopback-test', answers });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body);
    });
  });
  const installedController = join(f.home, '.agents', 'jev', 'jev-plugin.mjs');
  mkdirSync(dirname(installedController), { recursive: true });
  copyFileSync(plugin, installedController);
  copyFileSync(join(here, 'jev-harness.mjs'), join(f.home, '.agents', 'jev', 'jev-harness.mjs'));
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  try {
    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/v1/systemone`;
    privateWrite(join(f.profileDir, `${f.profile}.api.env`), `JEV_API_ENDPOINT=${endpoint}\nJEV_API_KEY=plugin-test-secret-value\n`);
    const result = await runHostileCallbackAsync(f, hostile, 'claude');
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error?.message || ''}\nrequests=${requests.length}`);
    assert.match(JSON.stringify(requests), /trusted-skill|TRUSTED_CATALOG_ONLY/);
    assert.doesNotMatch(JSON.stringify(requests), /hostile-skill|HOSTILE_CWD_INSTRUCTION/);
    assert.ok(requests.length > 0, 'enabled native hook should query the loopback backend');
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
test('native hook rejects hostile CWD catalog when trusted snapshot is missing or corrupt, while explicit user catalog is allowed', async () => {
  const cases = [
    { name: 'missing', prepare: f => rmSync(join(f.home, '.agents', 'jev', 'skills.json'), { force: true }) },
    { name: 'corrupt', prepare: f => privateWrite(join(f.home, '.agents', 'jev', 'skills.json'), '{not-json') },
  ];
  for (const { name, prepare } of cases) {
    const f = fixture({ profile: `catalog-${name}`, enabled: true });
    const hostile = join(f.root, `hostile-${name}`);
    mkdirSync(join(hostile, '.agent-skills'), { recursive: true });
    privateWrite(join(hostile, '.agent-skills', 'skills.json'), JSON.stringify({
      skills: [{ name: 'hostile-skill', category: 'hostile', description: 'HOSTILE_CATALOG_BODY_MARKER' }],
      categories: { hostile: ['hostile-skill'] },
      model_policies: {},
    }));
    const installedController = join(f.home, '.agents', 'jev', 'jev-plugin.mjs');
    mkdirSync(dirname(installedController), { recursive: true });
    copyFileSync(plugin, installedController);
    copyFileSync(join(here, 'jev-harness.mjs'), join(f.home, '.agents', 'jev', 'jev-harness.mjs'));
    const requests = [];
    const server = createServer((request, response) => {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        requests.push(JSON.parse(raw));
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ model: 'hostile-loopback', answers: {} }));
      });
    });
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    try {
      const address = server.address();
      privateWrite(join(f.profileDir, `${f.profile}.api.env`), `JEV_API_ENDPOINT=http://127.0.0.1:${address.port}/v1/systemone\nJEV_API_KEY=plugin-test-secret-value\n`);
      prepare(f);
      const result = await runHostileCallbackAsync(f, hostile, 'claude');
      assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
      assert.equal(requests.length, 0, `${name}: trusted catalog failure must not query backend`);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /HOSTILE_CATALOG_BODY_MARKER|hostile-skill/);
    } finally {
      await new Promise(resolveClose => server.close(resolveClose));
    }
  }

  const f = fixture({ profile: 'catalog-explicit', enabled: true });
  const hostile = join(f.root, 'hostile-explicit');
  mkdirSync(join(hostile, '.agent-skills'), { recursive: true });
  privateWrite(join(hostile, '.agent-skills', 'skills.json'), JSON.stringify({
    skills: [{ name: 'hostile-skill', category: 'hostile', description: 'HOSTILE_CATALOG_BODY_MARKER' }],
    categories: { hostile: ['hostile-skill'] },
    model_policies: {},
  }));
  const explicitCatalog = join(f.root, 'explicit-skills.json');
  privateWrite(explicitCatalog, JSON.stringify({
    skills: [{ name: 'explicit-skill', category: 'trusted', description: 'EXPLICIT_CATALOG_BODY_MARKER' }],
    categories: { trusted: ['explicit-skill'] },
    model_policies: {},
  }));
  privateWrite(join(f.home, '.agents', 'jev', 'skills.json'), JSON.stringify({
    skills: [{ name: 'installed-skill', category: 'trusted', description: 'INSTALLED_CATALOG_BODY_MARKER' }],
    categories: { trusted: ['installed-skill'] },
    model_policies: {},
  }));
  const installedController = join(f.home, '.agents', 'jev', 'jev-plugin.mjs');
  mkdirSync(dirname(installedController), { recursive: true });
  copyFileSync(plugin, installedController);
  copyFileSync(join(here, 'jev-harness.mjs'), join(f.home, '.agents', 'jev', 'jev-harness.mjs'));
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      requests.push(JSON.parse(raw));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'explicit-loopback', answers: {} }));
    });
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  try {
    const address = server.address();
    privateWrite(join(f.profileDir, `${f.profile}.api.env`), `JEV_API_ENDPOINT=http://127.0.0.1:${address.port}/v1/systemone\nJEV_API_KEY=plugin-test-secret-value\n`);
    const result = await runHostileCallbackAsync(f, hostile, 'claude', f.profile, { JEV_CATALOG_PATH: explicitCatalog });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(requests.length > 0, `explicit valid catalog should permit backend routing: ${result.stdout} ${result.stderr}`);
    assert.match(JSON.stringify(requests), /EXPLICIT_CATALOG_BODY_MARKER|explicit-skill/);
    assert.doesNotMatch(JSON.stringify(requests), /HOSTILE_CATALOG_BODY_MARKER|hostile-skill/);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
});

test('model advice becomes a host launch argv plan and refuses unsupported providers', () => {
  const f = fixture({ enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'frontend-patterns',
    policy: { candidates: [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }] },
    candidates: [{ provider: 'anthropic', model: 'claude-sonnet-4-5', probability: 1, rank: 1 }],
    chosen: 'anthropic/claude-sonnet-4-5',
    confidence: 0.99,
    provenance: { backend: { kind: 'api', driver: 'typesafe', model: 'jev-1.13' } },
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    agent: 'claude',
    inventory: { anthropic: { authenticated: true, models: ['claude-sonnet-4-5'] } },
  });
  const planned = runPlugin(f, ['model-plan', '--agent', 'claude', '--profile', f.profile, '--advice', advicePath, '--host-models', hostModelsPath]);
  assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);
  const plan = jsonResult(planned);
  assert.equal(plan.ok, true);
  assert.equal(JSON.stringify(plan).includes('claude-sonnet-4-5'), true);
  assert.equal(JSON.stringify(plan).includes('hotSwap'), false);
  const unsupportedPath = join(f.root, 'unsupported-advice.json');
  writeFileSync(unsupportedPath, JSON.stringify([{ skill: 'x', candidates: [{ provider: 'ollama', model: 'local-model' }], chosen: 'ollama/local-model' }]));
  const unsupported = runPlugin(f, ['model-plan', '--agent', 'claude', '--profile', f.profile, '--advice', unsupportedPath, '--host-models', hostModelsPath]);
  assert.notEqual(unsupported.status, 0);
  assert.match(`${unsupported.stdout}\n${unsupported.stderr}`, /unsupported|provider|refus/i);
});
test('model advice maps only host-compatible providers into host-native launch argv', () => {
  const accepted = [
    ['claude', 'anthropic', 'claude-sonnet-4-5', ['--model', 'claude-sonnet-4-5']],
    ['jeopi', 'openai', 'gpt-5-codex', ['--model=openai/gpt-5-codex']],
    ['omp', 'google', 'gemini-2.5-pro', ['--model=google/gemini-2.5-pro']],
    ['pi', 'anthropic', 'claude-3-7-sonnet', ['--model', 'anthropic/claude-3-7-sonnet']],
  ];
  for (const [agent, provider, model, expectedArgv] of accepted) {
    const f = fixture({ profile: `model-${agent}`, enabled: true });
    const advicePath = join(f.root, `${agent}-advice.json`);
    writeFileSync(advicePath, JSON.stringify([{
      skill: 'frontend-patterns',
      candidates: [{ provider, model, probability: 1, rank: 1 }],
      chosen: `${provider}/${model}`,
    }]));
    const hostModelsPath = hostModelsFixture(f, {
      agent,
      inventory: { [provider]: { authenticated: true, models: [model] } },
    });
    const result = runPlugin(f, ['model-plan', '--agent', agent, '--profile', f.profile, '--advice', advicePath, '--host-models', hostModelsPath]);
    assert.equal(result.status, 0, `${agent}/${provider}: ${result.stdout}\n${result.stderr}`);
    const plan = jsonResult(result);
    assert.equal(plan.host, agent);
    assert.equal(plan.plans[0].provider, provider);
    assert.equal(plan.plans[0].model, model);
    assert.deepEqual(plan.plans[0].argv, expectedArgv, `${agent} must use its verified model flag syntax`);
  }

  const rejected = [
    ['claude', 'openai', 'gpt-5'],
    ['jeopi', 'gemini', 'gemini-2.5-pro'],
    ['pi', 'ollama', 'local-model'],
  ];
  for (const [agent, provider, model] of rejected) {
    const f = fixture({ profile: `model-reject-${agent}-${provider}`, enabled: true });
    const advicePath = join(f.root, 'rejected-advice.json');
    writeFileSync(advicePath, JSON.stringify([{ skill: 'x', candidates: [{ provider, model }], chosen: `${provider}/${model}` }]));
    const hostModelsPath = hostModelsFixture(f, {
      agent,
      inventory: { [provider]: { authenticated: true, models: [model] } },
    });
    const result = runPlugin(f, ['model-plan', '--agent', agent, '--profile', f.profile, '--advice', advicePath, '--host-models', hostModelsPath]);
    assert.notEqual(result.status, 0, `${agent} must reject arbitrary ${provider} switching`);
    assert.match(`${result.stdout}\n${result.stderr}`, /unsupported|provider|host|refus/i);
  }
});
test('model-plan refuses advice when host has no authenticated provider inventory', () => {
  const f = fixture({ profile: 'no-host-inventory', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'frontend-patterns',
    candidates: [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }],
    chosen: 'anthropic/claude-sonnet-4-5',
  }]));

  // The isolated host fixture deliberately has no provider-owned auth/status
  // inventory. Advice alone must not authorize a host model before inference.
  const result = runPlugin(f, [
    'model-plan', '--agent', 'claude', '--profile', f.profile, '--advice', advicePath,
  ]);
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(`${result.stdout}\n${result.stderr}`, /authenticated|inventory|available|provider|unavailable|refus/i);
});
test('model-plan intersects advice with authenticated exact-model host inventory', () => {
  const f = fixture({ profile: 'inventory-intersection', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'frontend-patterns',
    candidates: [
      { provider: 'openai-codex', model: 'gpt-5-codex', probability: 0.91, rank: 1 },
      { provider: 'anthropic', model: 'claude-sonnet-4-5', probability: 0.88, rank: 2 },
      { provider: 'google', model: 'gemini-2.5-pro', probability: 0.87, rank: 3 },
      { provider: 'openai-codex', model: 'not-authorized', probability: 0.86, rank: 4 },
    ],
    chosen: 'openai-codex/gpt-5-codex',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    inventory: {
      'openai-codex': { authenticated: true, models: ['gpt-5-codex'], limitedUntil: null },
      anthropic: { authenticated: null, models: ['claude-sonnet-4-5'], limitedUntil: null },
      google: { authenticated: false, models: ['gemini-2.5-pro'], limitedUntil: null },
    },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const plan = jsonResult(result);
  assert.equal(plan.plans[0].provider, 'openai-codex');
  assert.equal(plan.plans[0].model, 'gpt-5-codex');
  assert.equal(plan.plans[0].executed, false);
  assert.deepEqual(plan.plans[0].fallbacks, []);
});
test('model-plan keeps OAuth provider identity distinct from the API provider', () => {
  const f = fixture({ profile: 'oauth-provider-distinct', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'backend-patterns',
    candidates: [
      { provider: 'openai-codex', model: 'gpt-5-codex', probability: 0.95, rank: 1 },
      { provider: 'openai', model: 'gpt-5-codex', probability: 0.80, rank: 2 },
    ],
    chosen: 'openai-codex/gpt-5-codex',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    inventory: {
      openai: { authenticated: true, models: ['gpt-5-codex'], limitedUntil: null },
    },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const plan = jsonResult(result);
  assert.equal(plan.plans[0].provider, 'openai');
  assert.equal(plan.plans[0].model, 'gpt-5-codex');
  assert.notEqual(plan.plans[0].provider, 'openai-codex');
  assert.equal(plan.plans[0].executed, false);
});


test('model-plan advances a quota-limited choice to an ordered eligible fallback', () => {
  const f = fixture({ profile: 'quota-fallback', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'backend-patterns',
    candidates: [
      { provider: 'openai-codex', model: 'gpt-5-codex', probability: 0.95, rank: 1 },
      { provider: 'anthropic', model: 'claude-sonnet-4-5', probability: 0.80, rank: 2 },
      { provider: 'google', model: 'gemini-2.5-pro', probability: 0.70, rank: 3 },
    ],
    chosen: 'openai-codex/gpt-5-codex',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    inventory: {
      'openai-codex': { authenticated: true, models: ['gpt-5-codex'], limitedUntil: '2099-01-01T00:00:00.000Z' },
      anthropic: { authenticated: true, models: ['claude-sonnet-4-5'], limitedUntil: null },
      google: { authenticated: true, models: ['gemini-2.5-pro'], limitedUntil: null },
    },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const plan = jsonResult(result);
  assert.equal(plan.plans[0].provider, 'anthropic');
  assert.equal(plan.plans[0].model, 'claude-sonnet-4-5');
  assert.deepEqual(plan.plans[0].fallbacks.map(({ provider, model }) => `${provider}/${model}`), ['google/gemini-2.5-pro']);
  assert.equal(plan.plans[0].executed, false);
});

test('model-plan permits an elapsed quota reset and rejects only the model-specific future limit', () => {
  const f = fixture({ profile: 'quota-reset', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'testing-strategies',
    candidates: [
      { provider: 'openai-codex', model: 'gpt-5-codex', probability: 0.95, rank: 1 },
      { provider: 'openai-codex', model: 'gpt-5-mini', probability: 0.75, rank: 2 },
    ],
    chosen: 'openai-codex/gpt-5-codex',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    inventory: {
      'openai-codex': {
        authenticated: true,
        models: ['gpt-5-codex', 'gpt-5-mini'],
        limitedUntil: '2020-01-01T00:00:00.000Z',
        modelLimits: { 'gpt-5-codex': '2099-01-01T00:00:00.000Z' },
      },
    },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const plan = jsonResult(result);
  assert.equal(plan.plans[0].provider, 'openai-codex');
  assert.equal(plan.plans[0].model, 'gpt-5-mini');
  assert.equal(plan.plans[0].executed, false);
});
test('model-plan fails closed with bounded output when every authorized candidate is exhausted', () => {
  const f = fixture({ profile: 'all-exhausted', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'testing-strategies',
    candidates: [
      { provider: 'openai', model: 'gpt-5.1', probability: 0.91, rank: 1 },
      { provider: 'anthropic', model: 'claude-sonnet-4-5', probability: 0.80, rank: 2 },
    ],
    chosen: 'openai/gpt-5.1',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    inventory: {
      openai: { authenticated: true, models: ['gpt-5.1'], limitedUntil: '2099-01-01T00:00:00.000Z' },
      anthropic: { authenticated: true, models: ['claude-sonnet-4-5'], modelLimits: { 'claude-sonnet-4-5': '2099-01-01T00:00:00.000Z' } },
    },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, /unknown option '--host-models'/);
  assert.match(text, /unavailable|exhausted|supported|eligible|inventory/i);
});

test('model-plan rejects a host-model snapshot from another profile or host', () => {
  const f = fixture({ profile: 'isolated-profile', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'frontend-patterns',
    candidates: [{ provider: 'openai', model: 'gpt-5.1', probability: 1, rank: 1 }],
    chosen: 'openai/gpt-5.1',
  }]));
  const hostModelsPath = hostModelsFixture(f, {
    agent: 'omp',
    profile: 'different-profile',
    inventory: { openai: { authenticated: true, models: ['gpt-5.1'] } },
  });
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', hostModelsPath,
  ]);
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, /unknown option '--host-models'/);
  assert.match(text, /profile|agent|host|snapshot|unavailable|mismatch/i);
});


test('model-plan rejects stale or malformed host snapshots before ranking', () => {
  const f = fixture({ profile: 'invalid-host-snapshot', enabled: true });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{
    skill: 'frontend-patterns',
    candidates: [{ provider: 'openai', model: 'gpt-5.1', probability: 1, rank: 1 }],
    chosen: 'openai/gpt-5.1',
  }]));
  const stalePath = hostModelsFixture(f, {
    observedAt: new Date(Date.now() - 120_000).toISOString(),
    inventory: { openai: { authenticated: true, models: ['gpt-5.1'] } },
  });
  const stale = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', stalePath,
  ]);
  assert.notEqual(stale.status, 0, `${stale.stdout}\n${stale.stderr}`);
  const staleText = `${stale.stdout}\n${stale.stderr}`;
  assert.doesNotMatch(staleText, /unknown option '--host-models'/);
  assert.match(staleText, /stale|fresh|snapshot|available|unavailable/i);

  const malformedPath = join(f.root, 'malformed-host-models.json');
  writeFileSync(malformedPath, '{not-json');
  const malformed = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', malformedPath,
  ]);
  assert.notEqual(malformed.status, 0, `${malformed.stdout}\n${malformed.stderr}`);
  const malformedText = `${malformed.stdout}\n${malformed.stderr}`;
  assert.doesNotMatch(malformedText, /unknown option '--host-models'/);
  assert.match(malformedText, /json|malformed|snapshot|available|unavailable/i);
});

test('OFF model-plan skips host inventory reads and auth probes', () => {
  const f = fixture({ profile: 'off-host-models', enabled: false });
  const advicePath = join(f.root, 'routing-advice.json');
  writeFileSync(advicePath, JSON.stringify([{ chosen: 'openai-codex/gpt-5-codex', candidates: [] }]));
  const missingHostModelsPath = join(f.root, 'does-not-exist-host-models.json');
  const result = runPlugin(f, [
    'model-plan', '--agent', 'jeopi', '--profile', f.profile,
    '--advice', advicePath, '--host-models', missingHostModelsPath,
  ]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const body = jsonResult(result);
  assert.equal(body.inactive, true);
  assert.equal(body.enabled, false);
});



test('consumer integration plan preserves URL prefixes, scrubs writer secrets, and refuses unsafe protocols/remote local-only endpoints', () => {
  const f = fixture({ enabled: true });
  const accepted = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'https://gateway.example/team-a/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    '--writer-endpoint', 'http://127.0.0.1:8777', '--writer-key-env', 'HOSTED_WRITER_KEY',
  ]);
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  const plan = jsonResult(accepted);
  assert.equal(plan.ok, true);
  const acceptedText = JSON.stringify(plan);
  assert.equal(acceptedText.includes('https://gateway.example/team-a'), true);
  assert.equal(acceptedText.includes('/v1/systemone'), false);
  assert.equal(acceptedText.includes('HOSTED_WRITER_KEY_VALUE'), false);
  assert.deepEqual(plan.classifier.envVars, {
    TYPESAFE_BASE_URL: 'https://gateway.example/team-a',
    TYPESAFE_API_KEY: { ref: 'TYPESAFE_API_KEY' },
    TYPESAFE_DEFAULT_MODEL: null,
  });
  assert.deepEqual(plan.writer.envVars, {
    CLICKER_WRITER_BASE_URL: 'http://127.0.0.1:8777',
    CLICKER_WRITER_API: null,
    CLICKER_WRITER_API_KEY: { ref: 'HOSTED_WRITER_KEY' },
    CLICKER_WRITER_MODEL: null,
  });
  assert.doesNotMatch(acceptedText, /WRITER_ENDPOINT|CLICKER_WRITER_ENABLED/);

  const localOnly = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'http://127.0.0.1:8778/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    '--writer-endpoint', 'http://127.0.0.1:8777', '--writer-key-env', 'HOSTED_WRITER_KEY', '--local-only',
  ]);
  assert.equal(localOnly.status, 0, `${localOnly.stdout}\n${localOnly.stderr}`);
  const localOnlyBody = jsonResult(localOnly);
  assert.equal(localOnlyBody.ok, true);
  assert.equal(localOnlyBody.classifier.envVars.TYPESAFE_API_KEY.ref, 'TYPESAFE_API_KEY');
  assert.deepEqual(localOnlyBody.writer.envVars, {
    CLICKER_WRITER_BASE_URL: 'http://127.0.0.1:8777',
    CLICKER_WRITER_API: null,
    CLICKER_WRITER_API_KEY: { ref: 'HOSTED_WRITER_KEY' },
    CLICKER_WRITER_MODEL: null,
  });

  const remoteClassifier = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'https://gateway.example/team-a/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    '--writer-endpoint', 'http://127.0.0.1:8777', '--local-only',
  ]);
  assert.notEqual(remoteClassifier.status, 0, 'local-only plans must reject remote classifier endpoints');
  const disabledWriter = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'http://127.0.0.1:8778/v1/systemone', '--key-env', 'TYPESAFE_API_KEY', '--local-only',
  ]);
  assert.equal(disabledWriter.status, 0, `${disabledWriter.stdout}\n${disabledWriter.stderr}`);
  const disabledWriterBody = jsonResult(disabledWriter);
  assert.deepEqual(disabledWriterBody.writer.envVars, {
    CLICKER_WRITER_BASE_URL: '',
    CLICKER_WRITER_API_KEY: { ref: null },
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_AUTH_TOKEN: '',
  });
  assert.match(`${remoteClassifier.stdout}\n${remoteClassifier.stderr}`, /loopback|local|remote|unsupported|endpoint/i);
  const typed = fixture({ profile: 'typed', enabled: true });
  privateWrite(join(typed.profileDir, 'typed.env'), 'JEV_ENABLED=true\nJEV_MODE=systemone\n');
  privateWrite(join(typed.profileDir, 'typed.systemone.env'), 'JEV_SYSTEMONE_ENDPOINT=https://gateway.example/team-a/v1/systemone\nJEV_SYSTEMONE_DRIVER=typesafe\nJEV_SYSTEMONE_MODEL=jev-typed\n');
  const typedPlan = runPlugin(typed, [
    'integration-plan', '--agent', 'claude', '--profile', 'typed', '--integration', 'pg-jev',
    '--endpoint', 'https://gateway.example/team-a/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
  ]);
  assert.equal(typedPlan.status, 0, `${typedPlan.stdout}\n${typedPlan.stderr}`);
  const typedBody = jsonResult(typedPlan);
  assert.equal(typedBody.ok, true);
  assert.equal(typedBody.classifier.baseUrl, 'https://gateway.example/team-a');
  assert.equal(typedBody.classifier.protocol, 'typesafe-sdk');
  const protocol = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'file:///tmp/jev', '--key-env', 'TYPESAFE_API_KEY',
  ]);
  assert.notEqual(protocol.status, 0);
  assert.match(`${protocol.stdout}\n${protocol.stderr}`, /unsupported|protocol|scheme|endpoint/i);
  const remoteWriter = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'http://127.0.0.1:8778/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    '--writer-endpoint', 'http://10.0.0.8:8777', '--local-only',
  ]);
  assert.notEqual(remoteWriter.status, 0);
  assert.match(`${remoteWriter.stdout}\n${remoteWriter.stderr}`, /loopback|local|remote|writer|unsupported/i);
  const incompatibleBackends = [
    ['local', 'JEV_LOCAL_ENDPOINT=http://127.0.0.1:8763/v1/systemone\n'],
    ['ollama', 'JEV_OLLAMA_ENDPOINT=http://127.0.0.1:11434\n'],
    ['lmstudio', 'JEV_LMSTUDIO_ENDPOINT=http://127.0.0.1:1234\n'],
    ['systemone', 'JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:8763/v1/systemone\nJEV_SYSTEMONE_DRIVER=decide\n'],
    ['systemone', 'JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:8763/v1/systemone\nJEV_SYSTEMONE_DRIVER=vllm-jev-decision\n'],
  ];
  for (const [mode, backendValues] of incompatibleBackends) {
    privateWrite(join(f.profileDir, `${f.profile}.env`), `JEV_ENABLED=true\nJEV_MODE=${mode}\n`);
    privateWrite(join(f.profileDir, `${f.profile}.${mode}.env`), backendValues);
    const incompatible = runPlugin(f, [
      'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'pg-jev',
      '--endpoint', 'http://127.0.0.1:8763/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    ]);
    assert.notEqual(incompatible.status, 0, `${mode} direct consumer compatibility must be refused`);
    assert.match(`${incompatible.stdout}\n${incompatible.stderr}`, /incompatible|unsupported|gateway|driver|protocol/i, mode);
  }
  privateWrite(join(f.profileDir, `${f.profile}.env`), 'JEV_ENABLED=true\nJEV_MODE=systemone\n');
  privateWrite(join(f.profileDir, `${f.profile}.systemone.env`), 'JEV_SYSTEMONE_ENDPOINT=http://127.0.0.1:8763/v1/systemone\nJEV_SYSTEMONE_DRIVER=anyjev\n');
  const anyJev = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'http://127.0.0.1:8763/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
  ]);
  assert.notEqual(anyJev.status, 0);
  assert.match(`${anyJev.stdout}\n${anyJev.stderr}`, /AnyJev|unsupported|incompatible|gateway/i);
 });

test('OFF pg-jev plan remains database-independent and has no effects', async () => {
  const f = fixture({ profile: 'off-pg', enabled: false });
  installForbiddenCommand(f, 'claude');
  const before = profileBytes(f);
  await withCounterServer(async (_endpoint, count) => {
    const result = runPlugin(f, [
      'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'pg-jev',
    ], { env: { JEV_API_KEY: 'ambient-api-secret' } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const body = jsonResult(result);
    assert.equal(body.ok, true);
    assert.equal(body.inactive, true);
    assert.equal(body.plan.active, false);
    assert.equal(body.plan.classifier, 'inactive');
    assert.equal(body.plan.writer, 'inactive');
    assert.deepEqual(body.plan.database, {
      execution: 'plan-only',
      scope: 'database-server',
      rowEgress: 'explicit-only',
      apiKeyGuc: 'server-process-only',
      extensionStateIndependent: true,
    });
    assert.equal(body.executed, undefined);
    assert.doesNotMatch(result.stdout, /ambient-api-secret|plugin-test-secret-value/);
    assert.deepEqual(profileBytes(f), before);
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
    assert.equal(count(), 0);
  });
});

test('local-only computer-use writer without a key reference cannot borrow ambient Anthropic secrets', () => {
  const f = fixture({ profile: 'local-writer', enabled: true });
  const before = profileBytes(f);
  const result = runPlugin(f, [
    'integration-plan', '--agent', 'claude', '--profile', f.profile, '--integration', 'computer-use',
    '--endpoint', 'http://127.0.0.1:8778/v1/systemone', '--key-env', 'TYPESAFE_API_KEY',
    '--writer-endpoint', 'http://127.0.0.1:8777', '--local-only',
  ], { env: {
    TYPESAFE_API_KEY: 'classifier-secret',
    ANTHROPIC_API_KEY: 'ambient-anthropic-key',
    ANTHROPIC_AUTH_TOKEN: 'ambient-anthropic-token',
  } });
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /classifier-secret|ambient-anthropic-key|ambient-anthropic-token/);
  if (result.status !== 0) {
    assert.match(`${result.stdout}\n${result.stderr}`, /writer|key|local|explicit/i);
    assert.deepEqual(profileBytes(f), before);
    return;
  }
  const body = jsonResult(result);
  assert.equal(body.ok, true);
  assert.equal(body.writer.mode, 'loopback');
  assert.equal(body.writer.envVars.ANTHROPIC_API_KEY, '');
  assert.equal(body.writer.envVars.ANTHROPIC_AUTH_TOKEN, '');
  const writerKey = body.writer.envVars.CLICKER_WRITER_API_KEY;
  assert.ok(writerKey && typeof writerKey === 'object');
  assert.ok(writerKey.ref || writerKey.literal, 'a keyless local writer must have an explicit local credential contract');
  assert.notEqual(writerKey.ref, 'ANTHROPIC_API_KEY');
  assert.notEqual(writerKey.ref, 'ANTHROPIC_AUTH_TOKEN');
  assert.doesNotMatch(JSON.stringify(body.writer), /classifier-secret|ambient-anthropic-key|ambient-anthropic-token/);
  assert.deepEqual(profileBytes(f), before);
});

test('host-plan keeps exact session argv while refusing invalid scopes and unregistered persistent toggles', () => {
  const cases = [
    ['claude', 'user', true], ['claude', 'project', true], ['claude', 'local', true], ['claude', 'manual', false], ['claude', 'unknown', false],
    ['jeopi', 'user', true], ['jeopi', 'project', true], ['jeopi', 'local', false], ['jeopi', 'manual', false],
  ];
  for (const [host, scope, supportedScope] of cases) {
    const f = fixture({ profile: `scope-${host}-${scope}`, enabled: true });
    const copiedRoot = join(f.root, 'copied-native-package', host);
    cpSync(join(here, 'plugins', host), copiedRoot, { recursive: true });
    privateWrite(join(f.home, '.agents', 'jev', 'agents.json'), JSON.stringify({
      [host]: { profile: f.profile, native: host === 'claude' ? 'claude' : 'jeopi-omp', scope },
    }, null, 2));
    const result = runPlugin(f, [
      'host-plan', '--agent', 'claude', '--profile', f.profile, '--host', host,
    ], { env: { PATH: f.bin } });
    assert.equal(result.status, 0, `${host}/${scope}: ${result.stdout}\n${result.stderr}`);
    const body = jsonResult(result);
    assert.equal(body.host, host);
    assert.equal(body.installed, false, 'copied package files do not prove host registration or installation');
    assert.equal(body.capability, 'native-lifecycle');
    assert.equal(body.lifecycle, 'session-only');
    assert.equal(body.verified, false);
    assert.equal(body.executed, false);
    assert.deepEqual(body.steps[0], {
      action: 'package-load',
      command: host,
      argv: host === 'claude' ? ['--plugin-dir', join(here, 'plugins', 'claude')] : ['-e', join(here, 'plugins', 'jeopi', 'index.mjs')],
      scope: 'session',
      executed: false,
    });
    assert.equal(result.stdout.includes(copiedRoot), false);
    const toggles = body.steps.slice(1);
    assert.equal(toggles.length, 2);
    for (const toggle of toggles) {
      assert.equal(toggle.status, 'unsupported');
      assert.equal(toggle.executed, false);
      if (supportedScope) {
        assert.equal(toggle.command, host);
        assert.ok(Array.isArray(toggle.argv));
        assert.match(toggle.note, /does not register|proposal|not a confirmed-usable action/i);
        const verb = toggle.action.replace(/^package-/, '');
        if (host === 'claude') assert.deepEqual(toggle.argv, ['plugin', verb, 'jev-control-plane', '--scope', scope]);
        if (host === 'jeopi') assert.deepEqual(toggle.argv, ['plugin', verb, 'jev-jeopi-extension', `--scope=${scope}`]);
      } else {
        assert.equal('command' in toggle, false);
        assert.equal('argv' in toggle, false);
        assert.match(toggle.note, /mapped scope.*not valid|expected/i);
      }
    }
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false);
  }
});

test('status detect and host-plan are truthful read-only operations', async () => {
  const f = fixture({ enabled: true });
  for (const command of ['claude', 'codex', 'gemini', 'opencode', 'jeopi', 'omp', 'pi']) installForbiddenCommand(f, command);
  await withCounterServer(async (_endpoint, count) => {
    for (const [command, extra] of [
      ['status', []],
      ['detect', []],
    ]) {
      const result = runPlugin(f, [command, '--agent', 'claude', '--profile', f.profile, ...extra]);
      assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
      const body = jsonResult(result);
      assert.equal(body.ok, true, `${command} should return the common success envelope`);
      assert.equal(JSON.stringify(body).includes('plugin-test-secret-value'), false);
      if (command === 'status') assert.equal(JSON.stringify(body).includes('configured'), true);
    }
    const hostPlans = [
      ['claude', 'native-lifecycle', 'session-only', [
        { action: 'package-load', command: 'claude', argv: ['--plugin-dir', join(here, 'plugins', 'claude')], scope: 'session', executed: false },
        { action: 'package-enable', status: 'unsupported', command: 'claude', argv: ['plugin', 'enable', 'jev-control-plane', '--scope', 'user'], note: "claude has a persistent enable subcommand for Jev's package registration (independent of the Jev profile's own JEV_ENABLED switch), but copying the native package assets does not register it with claude; this argv is a proposal for the operator to verify, not a confirmed-usable action", executed: false },
        { action: 'package-disable', status: 'unsupported', command: 'claude', argv: ['plugin', 'disable', 'jev-control-plane', '--scope', 'user'], note: "claude has a persistent disable subcommand for Jev's package registration (independent of the Jev profile's own JEV_ENABLED switch), but copying the native package assets does not register it with claude; this argv is a proposal for the operator to verify, not a confirmed-usable action", executed: false },
      ]],
      ['jeopi', 'native-lifecycle', 'session-only', [
        { action: 'package-load', command: 'jeopi', argv: ['-e', join(here, 'plugins', 'jeopi', 'index.mjs')], scope: 'session', executed: false },
        { action: 'package-enable', status: 'unsupported', command: 'jeopi', argv: ['plugin', 'enable', 'jev-jeopi-extension', '--scope=user'], note: "jeopi has a persistent enable subcommand for Jev's package registration (independent of the Jev profile's own JEV_ENABLED switch), but copying the native package assets does not register it with jeopi; this argv is a proposal for the operator to verify, not a confirmed-usable action", executed: false },
        { action: 'package-disable', status: 'unsupported', command: 'jeopi', argv: ['plugin', 'disable', 'jev-jeopi-extension', '--scope=user'], note: "jeopi has a persistent disable subcommand for Jev's package registration (independent of the Jev profile's own JEV_ENABLED switch), but copying the native package assets does not register it with jeopi; this argv is a proposal for the operator to verify, not a confirmed-usable action", executed: false },
      ]],
      ['omp', 'native-lifecycle', 'session-only', [
        { action: 'package-load', command: 'omp', argv: ['-e', join(here, 'plugins', 'omp', 'index.mjs')], scope: 'session', executed: false },
        { action: 'package-toggle', status: 'unsupported', note: 'omp has no verified persistent targeted package enable/disable subcommand; the extension is session-scoped only (add/remove -e per launch)', executed: false },
      ]],
      ['pi', 'native-lifecycle', 'session-only', [
        { action: 'package-load', command: 'pi', argv: ['-e', join(here, 'plugins', 'pi', 'index.mjs')], scope: 'session', executed: false },
        { action: 'package-toggle', status: 'unsupported', note: 'pi has no verified persistent targeted package enable/disable subcommand; the extension is session-scoped only (add/remove -e per launch)', executed: false },
      ]],
      ['codex', 'adapter-only', 'ui-only', [{ action: 'provider-toggle', status: 'ui-only', note: 'Codex CLI has no verified noninteractive enable/disable surface', executed: false }]],
      ['gemini', 'adapter-only', 'unsupported', [{ action: 'adapter', status: 'present', note: 'No native Jev lifecycle is advertised for this host', executed: false }]],
      ['opencode', 'adapter-only', 'unsupported', [{ action: 'adapter', status: 'present', note: 'No native Jev lifecycle is advertised for this host', executed: false }]],
    ];
    for (const [host, capability, lifecycle, steps] of hostPlans) {
      const result = runPlugin(f, ['host-plan', '--agent', 'claude', '--profile', f.profile, '--host', host]);
      assert.equal(result.status, 0, `${host}: ${result.stdout}\n${result.stderr}`);
      const body = jsonResult(result);
      assert.equal(body.ok, true, `${host} should return the common success envelope`);
      assert.equal(body.host, host);
      assert.equal(body.capability, capability);
      assert.equal(body.lifecycle, lifecycle);
      assert.deepEqual(body.steps, steps, `${host} lifecycle plan must expose verified commands and scope`);
      assert.equal(body.executed, false);
      assert.equal(body.verified, false);
      assert.equal(JSON.stringify(body).includes('plugin-test-secret-value'), false);
    }
    assert.equal(existsSync(join(f.home, 'jev-plugin-command.log')), false, 'read-only plans must not invoke host CLIs');
    assert.equal(count(), 0, 'read-only plans must not probe the backend');
  });
});
