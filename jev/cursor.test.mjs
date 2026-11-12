import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const roots = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));

const skillBody = '---\nname: trusted-skill\ndescription: Regression fixture.\n---\n# Complete trusted skill\nRun the focused regression before reporting completion.\n';
const PROFILE = 'cursor-test';

function write(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, { mode });
}

// The recording stand-in for jev-harness.mjs that sits next to a controller: it logs every backend-bound call to
// logPath and takes its behavior from a JSON file, so a test decides what the "private backend" does.
function harnessSource(configPath, logPath) {
  return `import { appendFileSync, readFileSync } from 'node:fs';
const cfg = () => JSON.parse(readFileSync(${JSON.stringify(configPath)}, 'utf8'));
const log = (op, input) => appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ op, input }) + '\\n');
export async function routeSkills(prompt) { log('route-skills', prompt); if (cfg().routeFailure) throw new Error('fixture routing outage'); return { topK: [{ name: 'trusted-skill' }], routing: [] }; }
export async function review(task, action) {
  log('review', { task, action });
  const c = cfg();
  if (c.reviewDelayMs) await new Promise(resolve => setTimeout(resolve, c.reviewDelayMs));
  if (c.reviewFailure) throw new Error('fixture private backend failure');
  return c.reviewResult;
}
`;
}

// A real controller and the real runner, installed into a throwaway HOME exactly as jev-setup.sh lays them out
// (runner under plugins/cursor/hooks, canonical shared helper under plugins/shared). Only the harness, which would
// reach a hosted backend, is replaced by a recorder whose behavior each test sets through harness-config.json.
function fixture({ reviewMode, runtimeMode, enabled = true, config = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-cursor-'));
  roots.push(root);
  const home = join(root, 'home');
  const runtime = join(home, '.agents', 'jev');
  const harnessLog = join(root, 'harness.jsonl');
  const harnessConfig = join(root, 'harness-config.json');
  const stateDir = join(root, 'state');
  const hooksPath = join(home, '.cursor', 'hooks.json');
  const adapter = join(runtime, 'plugins', 'cursor', 'hooks', 'jev-cursor-adapter.mjs');
  const controller = join(runtime, 'jev-plugin.mjs');
  write(join(runtime, 'profiles', `${PROFILE}.env`), `JEV_ENABLED=${enabled}\nJEV_MODE=api\n${runtimeMode ? `JEV_RUNTIME_MODE=${runtimeMode}\n` : ''}${reviewMode ? `JEV_REVIEW_MODE=${reviewMode}\n` : ''}`);
  write(join(runtime, 'profiles', `${PROFILE}.api.env`), 'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone\nJEV_API_KEY=fixture-only\n');
  copyFileSync(join(here, 'jev-plugin.mjs'), controller);
  mkdirSync(dirname(adapter), { recursive: true });
  copyFileSync(join(here, 'plugins', 'cursor', 'hooks', 'jev-cursor-adapter.mjs'), adapter);
  mkdirSync(join(runtime, 'plugins', 'shared'), { recursive: true });
  copyFileSync(join(here, 'plugins', 'shared', 'jev-controller.mjs'), join(runtime, 'plugins', 'shared', 'jev-controller.mjs'));
  write(join(runtime, 'skills.json'), JSON.stringify({ skills: [{ name: 'trusted-skill', path: 'trusted-skill/SKILL.md', description: 'Regression fixture.', category: 'test' }], categories: { test: ['trusted-skill'] }, model_policies: {} }));
  write(join(home, '.agents', 'skills', 'trusted-skill', 'SKILL.md'), skillBody);
  write(harnessConfig, JSON.stringify({ reviewResult: { verdict: 'permit', backend: { tier: 'validated' } }, ...config }));
  write(join(runtime, 'jev-harness.mjs'), harnessSource(harnessConfig, harnessLog));
  const env = { ...process.env, HOME: home, JEO_SKILL_STATE_DIR: stateDir };
  for (const key of Object.keys(env)) if (key.startsWith('JEV_')) delete env[key];
  const run = (event, payload, { profile = PROFILE, raw, extraEnv = {} } = {}) => {
    const started = Date.now();
    const result = spawnSync(process.execPath, [adapter, '--event', event, '--profile', profile], {
      cwd: root, env: { ...env, ...extraEnv }, input: raw ?? JSON.stringify(payload), encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    });
    // The runner may legitimately exit before a deliberately oversized payload is fully written.
    assert.ok(!result.error || result.error.code === 'EPIPE', String(result.error));
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, ms: Date.now() - started };
  };
  const hook = (event, payload, options) => {
    const result = run(event, payload, options);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, '', 'the runner must not write to stderr');
    assert.match(result.stdout, /^[^\n]+\n$/, `exactly one JSON line on stdout, got: ${JSON.stringify(result.stdout)}`);
    return JSON.parse(result.stdout);
  };
  // Runs the controller's own CLI with the same fixture HOME.
  const control = (action, args = [], { expectedStatus = 0, extraEnv = {} } = {}) => {
    const result = spawnSync(process.execPath, [controller, action, '--agent', 'cursor', '--profile', PROFILE, ...args], { cwd: root, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  return {
    root, home, runtime, adapter, controller, hooksPath, stateDir, run, hook, control, env, harnessConfig, harnessLog,
    setConfig: values => write(harnessConfig, JSON.stringify({ reviewResult: { verdict: 'permit', backend: { tier: 'validated' } }, ...values })),
    calls: () => existsSync(harnessLog) ? readFileSync(harnessLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    ledger: () => {
      const file = join(stateDir, 'jev-usage.jsonl');
      return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    },
  };
}

const prompt = (overrides = {}) => ({ conversation_id: 'conv-1', generation_id: 'gen-1', hook_event_name: 'beforeSubmitPrompt', prompt: 'Add retry logic to the payment client and update the tests', attachments: [], ...overrides });
const tool = (overrides = {}) => ({ conversation_id: 'conv-1', generation_id: 'gen-1', hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'npm test', working_directory: '/work' }, tool_use_id: 'tu-1', cwd: '/work', ...overrides });
const isDeny = out => out.permission === 'deny' && typeof out.user_message === 'string' && out.user_message && typeof out.agent_message === 'string' && out.agent_message;

// ── prompt hook: advisory routing ───────────────────────────────────────────────────────────────────────────────

test('beforeSubmitPrompt returns only additional_context naming the routed skill', () => {
  const f = fixture();
  const out = f.hook('beforeSubmitPrompt', prompt());
  assert.deepEqual(Object.keys(out), ['additional_context']);
  assert.match(out.additional_context, /^Jev advisory only \(profile cursor-test\): suggested skills: trusted-skill/);
  assert.match(out.additional_context, /does not change host permissions/);
  assert.deepEqual(f.calls().map(call => call.op), ['route-skills']);
  assert.deepEqual(f.ledger().map(line => ({ agent: line.agent, routed: line.routed, injected: line.injected })), [{ agent: 'cursor', routed: ['trusted-skill'], injected: [] }]);
});

test('assist runtime mode behaves as advisory on Cursor and never reads or injects a skill body', () => {
  const f = fixture({ runtimeMode: 'assist' });
  const out = f.hook('beforeSubmitPrompt', prompt());
  assert.deepEqual(Object.keys(out), ['additional_context']);
  assert.doesNotMatch(out.additional_context, /Complete trusted skill|Source:/);
  assert.ok(out.additional_context.length < 2_000);
  assert.deepEqual(f.ledger()[0].injected, [], 'a skill that was not injected must not be recorded as injected');
});

test('assist stays honored for other hosts through the same controller', () => {
  const f = fixture({ runtimeMode: 'assist' });
  const result = spawnSync(process.execPath, [f.controller, 'hook', '--agent', 'claude', '--profile', PROFILE], { cwd: f.root, env: f.env, input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'Fix the failing regression' }), encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(JSON.parse(result.stdout).hookSpecificOutput.additionalContext.includes('Complete trusted skill'));
});

test('secrets and the home directory are removed before a prompt reaches the backend', () => {
  const f = fixture();
  const secrets = {
    openai: 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    githubPat: 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
    awsKey: 'AKIAABCDEFGHIJKLMNOP',
    slack: 'xoxb-1234567890-abcdefghij',
    githubFinePat: 'github_pat_11ABCDEFG0abcdefghijkl_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnop',
    googleKey: 'AIzaSyA-1234567890abcdefghijklmnopqrstuv',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk0',
    bearer: 'abcDEF1234567890xyzTOKENvalue',
    envAssignment: 'hunter2hunter2hunter2',
    quotedPassword: 'correct horse battery staple',
    urlPassword: 'Zq9!x#Lm$4Rt', // characters an e-mail local part cannot hold, so only the URL rule can remove it
    email: 'someone.private@example-corp.com',
    pemBody: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj',
  };
  const text = `Refactor ${f.home}/projects/client/pay.ts using ${secrets.openai} and ${secrets.githubPat} ${secrets.awsKey} ${secrets.slack} ${secrets.githubFinePat} ${secrets.googleKey} ${secrets.jwt}
curl -H "Authorization: Bearer ${secrets.bearer}" and SERVICE_API_KEY=${secrets.envAssignment} password: "${secrets.quotedPassword}"
postgres://admin:${secrets.urlPassword}@db.internal:5432/app mail ${secrets.email}
-----BEGIN RSA PRIVATE KEY-----
${secrets.pemBody}
-----END RSA PRIVATE KEY-----`;
  f.hook('beforeSubmitPrompt', prompt({ prompt: text, user_email: 'me@corp.io', transcript_path: `${f.home}/t.jsonl`, workspace_roots: [f.home] }));
  const sent = JSON.stringify(f.calls());
  for (const [name, value] of Object.entries(secrets)) {
    assert.ok(!sent.includes(value), `${name} reached the backend`);
    assert.ok(!sent.includes(value.slice(0, 8)), `the start of ${name} reached the backend`); // a partial leak is still a leak
  }
  assert.ok(!sent.includes(f.home), 'the home directory path reached the backend');
  assert.ok(sent.includes('~/projects/client/pay.ts'), 'the home directory should be shortened, not dropped');
  assert.doesNotMatch(sent, /me@corp\.io|t\.jsonl|workspace_roots/, 'only the prompt text is forwarded');
});

test('a prompt is bounded before any pattern runs and pathological shapes stay fast', () => {
  const f = fixture();
  const shapes = {
    'one 600k line': 'a'.repeat(600_000),
    'repeated key=': 'KEY = '.repeat(100_000),
    'repeated a@': 'a@'.repeat(300_000),
    'unterminated pem': `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(400_000)}`,
    'only newlines': '\n'.repeat(500_000),
  };
  for (const [name, body] of Object.entries(shapes)) {
    const result = f.run('beforeSubmitPrompt', prompt({ prompt: `Fix bug: ${body}`, generation_id: `g-${name}` }));
    assert.equal(result.status, 0, name);
    assert.ok(result.ms < 8_000, `${name} took ${result.ms} ms`);
    JSON.parse(result.stdout);
  }
  const sent = f.calls();
  assert.equal(sent.length, Object.keys(shapes).length, 'every shape must reach the backend exactly once');
  // Head 2,200 + tail 600 plus the omission marker; nothing near the 600,000 characters that were typed.
  for (const call of sent) assert.ok(String(call.input).length <= 2_900, `prompt of ${String(call.input).length} characters reached the backend`);
});

test('every failure path in the prompt hook leaves the prompt untouched', () => {
  const cases = [
    ['disabled profile', { enabled: false }, p => ({ payload: prompt() })],
    ['missing profile file', {}, () => ({ payload: prompt(), options: { profile: 'does-not-exist' } })],
    ['path-like profile id', {}, () => ({ payload: prompt(), options: { profile: '../etc/passwd' } })],
    ['empty stdin', {}, () => ({ raw: '' })],
    ['invalid JSON', {}, () => ({ raw: '{not json' })],
    ['JSON array', {}, () => ({ raw: '[1,2]' })],
    ['JSON string', {}, () => ({ raw: '"hello"' })],
    ['no prompt field', {}, () => ({ payload: { conversation_id: 'c' } })],
    ['prompt not a string', {}, () => ({ payload: prompt({ prompt: { a: 1 } }) })],
    ['whitespace-only prompt', {}, () => ({ payload: prompt({ prompt: '  \n\t ' }) })],
    ['stdin larger than 2 MiB', {}, () => ({ raw: JSON.stringify(prompt({ prompt: 'x'.repeat(2_600_000) })) })],
  ];
  for (const [name, fixtureOptions, build] of cases) {
    const f = fixture(fixtureOptions);
    const { payload, raw, options } = build();
    const out = f.hook('beforeSubmitPrompt', payload, { raw, ...options });
    assert.deepEqual(out, {}, name);
    assert.deepEqual(f.calls(), [], `${name} must not reach the backend`);
  }
});

test('a routing outage becomes a neutral advisory that leaks no backend detail', () => {
  const f = fixture({ config: { routeFailure: true } });
  const out = f.hook('beforeSubmitPrompt', prompt());
  assert.deepEqual(Object.keys(out), ['additional_context']);
  assert.match(out.additional_context, /routing unavailable/);
  assert.doesNotMatch(JSON.stringify(out), /fixture routing outage|fixture-only|trusted-skill/);
});

test('a bare acknowledgement makes no backend call while review is off, a real prompt does', () => {
  const f = fixture();
  for (const text of ['continue', 'ok', '계속', 'thanks!']) assert.deepEqual(f.hook('beforeSubmitPrompt', prompt({ prompt: text, generation_id: text })), {}, text);
  assert.deepEqual(f.calls(), []);
  f.hook('beforeSubmitPrompt', prompt({ prompt: 'Why does the payment retry loop never terminate?' }));
  assert.equal(f.calls().length, 1);
});

test('the controller beside the runner is used, not the copy under HOME', () => {
  const f = fixture();
  // The copy a runner would pick if it ignored its own install: it records that it was called and refuses.
  const marker = join(f.root, 'home-controller-called');
  write(f.controller, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'called'); console.log(JSON.stringify({ ok: false, code: 'DECOY' }));\n`);
  // A second, complete install elsewhere, with the real controller that the runner ships alongside.
  const other = join(f.root, 'other-install', 'jev');
  const otherAdapter = join(other, 'plugins', 'cursor', 'hooks', 'jev-cursor-adapter.mjs');
  mkdirSync(dirname(otherAdapter), { recursive: true });
  mkdirSync(join(other, 'plugins', 'shared'), { recursive: true });
  copyFileSync(join(here, 'jev-plugin.mjs'), join(other, 'jev-plugin.mjs'));
  copyFileSync(f.adapter, otherAdapter);
  copyFileSync(join(f.runtime, 'plugins', 'shared', 'jev-controller.mjs'), join(other, 'plugins', 'shared', 'jev-controller.mjs'));
  copyFileSync(join(f.runtime, 'jev-harness.mjs'), join(other, 'jev-harness.mjs'));
  const spawnRunner = adapter => spawnSync(process.execPath, [adapter, '--event', 'beforeSubmitPrompt', '--profile', PROFILE], { cwd: f.root, env: f.env, input: JSON.stringify(prompt()), encoding: 'utf8', timeout: 30_000 });

  const fromOther = spawnRunner(otherAdapter);
  assert.equal(fromOther.status, 0, `${fromOther.stdout}\n${fromOther.stderr}`);
  assert.match(JSON.parse(fromOther.stdout).additional_context, /suggested skills: trusted-skill/, 'the controller beside the runner must have answered');
  assert.equal(existsSync(marker), false, 'the controller under HOME must not be consulted');

  // Control run: the same decoy IS reached when it is the runner's own sibling, so the check above can fail.
  const fromHome = spawnRunner(f.adapter);
  assert.equal(fromHome.status, 0);
  assert.deepEqual(JSON.parse(fromHome.stdout), {}, 'a refusing controller degrades the prompt hook to no output');
  assert.equal(existsSync(marker), true);
});

// ── tool hook: action review ────────────────────────────────────────────────────────────────────────────────────

test('preToolUse does nothing and calls nothing while review mode is off', () => {
  const f = fixture();
  f.hook('beforeSubmitPrompt', prompt());
  assert.deepEqual(f.hook('preToolUse', tool()), {});
  assert.deepEqual(f.calls().map(call => call.op), ['route-skills']);
});

test('advisory review reports the verdict as context and never as a permission', () => {
  const f = fixture({ reviewMode: 'advisory', config: { reviewResult: { verdict: 'reject', backend: { tier: 'unvalidated' } } } });
  f.hook('beforeSubmitPrompt', prompt());
  const out = f.hook('preToolUse', tool());
  assert.deepEqual(Object.keys(out), ['additional_context']);
  assert.match(out.additional_context, /Jev review: reject/);
  const review = f.calls().find(call => call.op === 'review');
  assert.equal(review.input.task, prompt().prompt, 'the review must see the task cached from the prompt hook');
  assert.deepEqual(review.input.action.input, tool().tool_input);
  assert.equal(review.input.action.evidence.testsExecutedByJev, false);
});

test('advisory review survives a backend failure without denying', () => {
  const f = fixture({ reviewMode: 'advisory', config: { reviewFailure: true } });
  f.hook('beforeSubmitPrompt', prompt());
  const out = f.hook('preToolUse', tool());
  assert.equal(out.permission, undefined);
  assert.match(out.additional_context, /unavailable/);
  assert.doesNotMatch(JSON.stringify(out), /fixture private backend failure/);
});

for (const verdict of ['reject', 'proposal_only', 'defer']) {
  test(`enforce denies a ${verdict} review in a shape Cursor accepts`, () => {
    const f = fixture({ reviewMode: 'enforce', config: { reviewResult: { verdict, backend: { tier: 'validated' } } } });
    f.hook('beforeSubmitPrompt', prompt());
    const out = f.hook('preToolUse', tool());
    assert.ok(isDeny(out), JSON.stringify(out));
    assert.deepEqual(Object.keys(out).sort(), ['agent_message', 'permission', 'user_message']);
    assert.doesNotMatch(JSON.stringify(out), /fixture-only/);
  });
}

test('enforce denies a permit from a backend that is not validated', () => {
  const f = fixture({ reviewMode: 'enforce', config: { reviewResult: { verdict: 'permit', backend: { tier: 'unvalidated' } } } });
  f.hook('beforeSubmitPrompt', prompt());
  assert.ok(isDeny(f.hook('preToolUse', tool())));
});

test('even a validated permit never becomes an allow or ask decision', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.hook('beforeSubmitPrompt', prompt());
  const out = f.hook('preToolUse', tool());
  assert.equal(out.permission, undefined, 'Jev must not override Cursor\'s own approval flow');
  assert.deepEqual(Object.keys(out), ['additional_context']);
});

test('enforce withholds every call the runner cannot review, so no failure is an escape hatch', () => {
  const unreviewable = [
    ['backend error', { config: { reviewFailure: true } }, () => ({ pre: true, payload: tool() })],
    ['no task context for the turn', {}, () => ({ pre: false, payload: tool({ conversation_id: 'never-prompted', generation_id: 'never' }) })],
    ['invalid JSON', {}, () => ({ pre: false, raw: '{broken' })],
    ['JSON array', {}, () => ({ pre: false, raw: '[]' })],
    ['empty stdin', {}, () => ({ pre: false, raw: '' })],
    ['payload larger than 2 MiB', {}, () => ({ pre: false, raw: JSON.stringify(tool({ tool_input: { command: 'x'.repeat(2_600_000) } })) })],
  ];
  for (const [name, options, build] of unreviewable) {
    const f = fixture({ reviewMode: 'enforce', ...options });
    const { pre, payload, raw } = build();
    if (pre) f.hook('beforeSubmitPrompt', prompt());
    const out = f.hook('preToolUse', payload, { raw });
    assert.ok(isDeny(out), `${name}: ${JSON.stringify(out)}`);
  }
});

test('enforce withholds a call whose review outlives the deadline instead of letting it through', () => {
  const f = fixture({ reviewMode: 'enforce', config: { reviewDelayMs: 8_000 } });
  f.hook('beforeSubmitPrompt', prompt());
  const result = f.run('preToolUse', tool(), { extraEnv: { JEV_CURSOR_TIMEOUT_MS: '1000' } });
  assert.equal(result.status, 0);
  assert.ok(isDeny(JSON.parse(result.stdout)), result.stdout);
  assert.ok(result.ms < 6_000, `the runner waited ${result.ms} ms`);
});

test('a profile that is OFF or missing is never enforced', () => {
  const off = fixture({ reviewMode: 'enforce', enabled: false });
  assert.deepEqual(off.hook('preToolUse', tool()), {});
  assert.deepEqual(off.hook('preToolUse', null, { raw: '{broken' }), {});
  const missing = fixture({ reviewMode: 'enforce' });
  assert.deepEqual(missing.hook('preToolUse', tool(), { profile: 'does-not-exist' }), {});
  assert.deepEqual(off.calls(), []);
});

test('an unrecognised review mode is treated as enforcement, like the other hosts', () => {
  const f = fixture({ reviewMode: 'strict' });
  assert.ok(isDeny(f.hook('preToolUse', tool({ conversation_id: 'x', generation_id: 'y' }))));
});

test('prompt hook failures never deny the prompt even when tool review is enforced', () => {
  const f = fixture({ reviewMode: 'enforce', config: { routeFailure: true } });
  const out = f.hook('beforeSubmitPrompt', prompt());
  assert.equal(out.permission, undefined);
  assert.equal(out.continue, undefined);
  assert.deepEqual(f.hook('beforeSubmitPrompt', null, { raw: '{broken' }), {});
});

test('tool input is redacted before it reaches the review backend', () => {
  const f = fixture({ reviewMode: 'advisory' });
  f.hook('beforeSubmitPrompt', prompt());
  const command = 'curl -H "Authorization: Bearer abcDEF1234567890xyzTOKENvalue" https://x.io/?k=sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 && export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  f.hook('preToolUse', tool({ tool_input: { command, working_directory: `${f.home}/proj` } }));
  const sent = JSON.stringify(f.calls().find(call => call.op === 'review'));
  assert.doesNotMatch(sent, /abcDEF1234567890xyzTOKENvalue|sk-proj-AbCdEf|wJalrXUtnFEMI/);
  assert.ok(sent.includes('~/proj') && !sent.includes(f.home));
});

// ── runner unit contracts ───────────────────────────────────────────────────────────────────────────────────────

test('response mapping can only produce a deny or context, whatever the controller returns', async () => {
  const f = fixture();
  const { mapToolResult, mapPromptResult } = await import(pathToFileURL(f.adapter).href);
  assert.deepEqual(mapToolResult({ hookSpecificOutput: { permissionDecision: 'allow' } }), {});
  assert.deepEqual(mapToolResult({ hookSpecificOutput: { permissionDecision: 'ask', additionalContext: 'note' } }), { additional_context: 'note' });
  assert.deepEqual(Object.keys(mapToolResult({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'why' } })).sort(), ['agent_message', 'permission', 'user_message']);
  assert.equal(mapToolResult({ hookSpecificOutput: { permissionDecision: 'deny' } }).user_message, 'Jev withheld this action.');
  assert.deepEqual(mapPromptResult({ context: '' }), {});
  assert.ok(mapPromptResult({ context: 'x'.repeat(50_000) }).additional_context.length <= 9_500, 'must stay under Cursor\'s 10,000 character inline cap');
  assert.deepEqual(mapPromptResult(null), {});
  assert.deepEqual(mapToolResult(undefined), {});
});

// ── hooks-install --agent cursor ────────────────────────────────────────────────────────────────────────────────

const foreignHooks = () => ({
  version: 1,
  note: 'user-owned top-level key',
  hooks: {
    beforeSubmitPrompt: [
      { command: '/Users/me/.superset/hooks/cursor-hook.sh Start' },
      { command: "/bin/sh -c 'echo orca'", timeout: 10 },
    ],
    stop: [{ command: './audit.sh', loop_limit: 3 }],
    preToolUse: [{ command: './guard.sh', matcher: 'Shell', failClosed: true }],
  },
});
const jevEntries = config => ({ prompt: config.hooks.beforeSubmitPrompt.filter(item => item.command.includes('jev-cursor-adapter.mjs')), tool: config.hooks.preToolUse.filter(item => item.command.includes('jev-cursor-adapter.mjs')) });

test('hooks-install preview writes nothing, apply adds exactly the two entries and keeps everything else', () => {
  const f = fixture();
  write(f.hooksPath, `${JSON.stringify(foreignHooks(), null, 2)}\n`, 0o644);
  const before = readFileSync(f.hooksPath, 'utf8');
  const preview = f.control('hooks-install');
  assert.equal(preview.ok, true);
  assert.equal(preview.applied, false);
  assert.equal(preview.changed, true);
  assert.equal(readFileSync(f.hooksPath, 'utf8'), before, 'preview must not touch the file');

  const applied = f.control('hooks-install', ['--apply']);
  assert.equal(applied.applied, true);
  assert.equal(applied.path, f.hooksPath);
  assert.deepEqual(applied.events, ['beforeSubmitPrompt', 'preToolUse']);
  const config = JSON.parse(readFileSync(f.hooksPath, 'utf8'));
  const original = foreignHooks();
  assert.equal(config.note, original.note);
  assert.equal(config.version, 1);
  assert.deepEqual(config.hooks.stop, original.hooks.stop);
  assert.deepEqual(config.hooks.beforeSubmitPrompt.slice(0, 2), original.hooks.beforeSubmitPrompt, 'foreign entries keep their order and content');
  assert.deepEqual(config.hooks.preToolUse[0], original.hooks.preToolUse[0]);
  const mine = jevEntries(config);
  assert.equal(mine.prompt.length, 1);
  assert.equal(mine.tool.length, 1);
  assert.equal(mine.prompt[0].timeout, 12);
  assert.equal(mine.prompt[0].matcher, undefined);
  assert.equal(mine.tool[0].matcher, '^(?:Shell|WriteShellStdin|Write|Delete)$');
  assert.ok(new RegExp(mine.tool[0].matcher).test('Shell') && !new RegExp(mine.tool[0].matcher).test('MCP:Delete_file'), 'the default matcher must not catch other tools');
  assert.match(mine.prompt[0].command, /^'.+' '.+jev-cursor-adapter\.mjs' '--event' 'beforeSubmitPrompt' '--profile' 'cursor-test'$/);
  assert.equal(statSync(f.hooksPath).mode & 0o777, 0o600);
  assert.equal(applied.limitations.some(item => /not been observed/.test(item)), true, 'the install result must state that live Cursor execution is unverified');
});

test('hooks-install is idempotent and writes nothing the second time', () => {
  const f = fixture();
  write(f.hooksPath, `${JSON.stringify(foreignHooks(), null, 2)}\n`);
  f.control('hooks-install', ['--apply']);
  const first = readFileSync(f.hooksPath, 'utf8');
  const second = f.control('hooks-install', ['--apply']);
  assert.equal(second.changed, false);
  assert.equal(second.applied, false, 'no write happened, so nothing was applied');
  assert.equal(readFileSync(f.hooksPath, 'utf8'), first);
});

test('re-running from another profile, matcher or location replaces the entries in place and collapses duplicates', () => {
  const f = fixture();
  const stale = { command: "'/old/node' '/old/checkout/jev/plugins/cursor/hooks/jev-cursor-adapter.mjs' '--event' 'preToolUse' '--profile' 'old'", matcher: 'Shell', timeout: 99 };
  const config = foreignHooks();
  config.hooks.preToolUse = [config.hooks.preToolUse[0], stale, { command: './after.sh' }, { ...stale }];
  write(f.hooksPath, `${JSON.stringify(config, null, 2)}\n`);
  f.control('hooks-install', ['--matcher', '^Shell$', '--apply']);
  const next = JSON.parse(readFileSync(f.hooksPath, 'utf8'));
  const mine = jevEntries(next);
  assert.equal(mine.tool.length, 1, 'duplicates must collapse');
  assert.equal(mine.tool[0].matcher, '^Shell$');
  assert.match(mine.tool[0].command, /'--profile' 'cursor-test'$/);
  assert.deepEqual(next.hooks.preToolUse.map(item => item.command.includes('jev-cursor-adapter.mjs') ? 'jev' : item.command), ['./guard.sh', 'jev', './after.sh'], 'the first managed entry keeps its position');
});

test('hooks-install honors the profile matcher and refuses one Cursor would reject as a whole', () => {
  const f = fixture();
  assert.equal(f.control('hooks-install', ['--matcher', '^Shell$']).matcher, '^Shell$');
  const bad = f.control('hooks-install', ['--matcher', '(unclosed', '--apply'], { expectedStatus: 1 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /valid regular expression/);
  assert.equal(existsSync(f.hooksPath), false);
});

test('hooks-install refuses files it could damage and leaves them byte-identical', () => {
  const malformed = {
    'invalid JSON': '{ not json',
    'comments (Cursor reads JSONC)': '// mine, do not lose\n{ "version": 1, "hooks": { "stop": [{ "command": "./audit.sh" }] } }\n',
    'array root': '[]',
    'no version key': JSON.stringify({ hooks: { stop: [{ command: './audit.sh' }] } }),
    'hooks is an array': JSON.stringify({ version: 1, hooks: [] }),
    'event is not an array': JSON.stringify({ version: 1, hooks: { preToolUse: {} } }),
    'event is null': JSON.stringify({ version: 1, hooks: { beforeSubmitPrompt: null } }),
  };
  for (const [name, content] of Object.entries(malformed)) {
    const f = fixture();
    write(f.hooksPath, content, 0o644);
    const result = f.control('hooks-install', ['--apply'], { expectedStatus: 1 });
    assert.equal(result.ok, false, name);
    assert.equal(readFileSync(f.hooksPath, 'utf8'), content, `${name}: file must be untouched`);
    assert.equal(readdirSync(dirname(f.hooksPath)).filter(entry => entry !== 'hooks.json').length, 0, `${name}: no temp or backup files`);
  }
  const f = fixture();
  const target = join(f.root, 'elsewhere.json');
  write(target, '{"version":1}\n');
  mkdirSync(dirname(f.hooksPath), { recursive: true });
  symlinkSync(target, f.hooksPath);
  const result = f.control('hooks-install', ['--apply'], { expectedStatus: 1 });
  assert.equal(result.ok, false);
  assert.equal(readFileSync(target, 'utf8'), '{"version":1}\n');
  assert.ok(lstatSync(f.hooksPath).isSymbolicLink());
});

test('hooks-install creates a minimal hooks.json when none exists', () => {
  const f = fixture();
  const result = f.control('hooks-install', ['--apply']);
  assert.equal(result.applied, true);
  const config = JSON.parse(readFileSync(f.hooksPath, 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['hooks', 'version']);
  assert.equal(config.version, 1);
  assert.deepEqual(Object.keys(config.hooks).sort(), ['beforeSubmitPrompt', 'preToolUse']);
});

test('hooks-install needs a configured profile and writes nothing without one', () => {
  const f = fixture();
  for (const profile of ['no-such-profile', '../escape']) {
    const result = spawnSync(process.execPath, [f.controller, 'hooks-install', '--agent', 'cursor', '--profile', profile, '--apply'], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1, profile);
    assert.equal(JSON.parse(result.stdout).ok, false, profile);
    assert.equal(existsSync(f.hooksPath), false, `${profile}: nothing may be written without a valid configured profile`);
  }
  const missing = spawnSync(process.execPath, [f.controller, 'hooks-install', '--agent', 'cursor', '--profile', 'no-such-profile', '--apply'], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 30_000 });
  assert.match(JSON.parse(missing.stdout).error, /configure a named profile/);
});

test('the command hooks-install writes runs under sh exactly as Cursor runs it', () => {
  const f = fixture();
  f.control('hooks-install', ['--apply']);
  const config = JSON.parse(readFileSync(f.hooksPath, 'utf8'));
  const { prompt: [promptEntry], tool: [toolEntry] } = jevEntries(config);
  // Cursor passes the event on stdin (or as a here-doc appended to the command) through the user's shell.
  const viaShell = (entry, payload) => spawnSync('/bin/sh', ['-c', `${entry.command} <<'CURSOR_HOOK_EOF'\n${JSON.stringify(payload)}\nCURSOR_HOOK_EOF`], { cwd: join(f.home, '.cursor'), env: { HOME: f.home, PATH: '/usr/bin:/bin', JEO_SKILL_STATE_DIR: f.stateDir }, encoding: 'utf8', timeout: 30_000 });
  const promptResult = viaShell(promptEntry, prompt());
  assert.equal(promptResult.status, 0, `${promptResult.stdout}\n${promptResult.stderr}`);
  assert.match(JSON.parse(promptResult.stdout).additional_context, /suggested skills: trusted-skill/);
  const toolResult = viaShell(toolEntry, tool());
  assert.equal(toolResult.status, 0);
  assert.deepEqual(JSON.parse(toolResult.stdout), {}, 'review mode is off by default');
  assert.ok(promptEntry.timeout * 1000 > 8_000 + 1_500, 'Cursor\'s deadline must exceed the runner\'s controller deadline plus its watchdog margin');
});

test('the controller lists cursor as a hooks-install host and still rejects unknown ones', () => {
  const f = fixture();
  const result = spawnSync(process.execPath, [f.controller, 'hooks-install', '--agent', 'notahost', '--profile', PROFILE], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).error, /supports --agent .*\bcursor\b/);
});

// ── invariants that no output path can reach ────────────────────────────────────────────────────────────────────

test('only a deny may carry a permission out of the runner', async () => {
  const f = fixture();
  const { sanitizeOutput } = await import(pathToFileURL(f.adapter).href);
  assert.deepEqual(sanitizeOutput({ permission: 'allow', additional_context: 'x' }), { additional_context: 'x' });
  assert.deepEqual(sanitizeOutput({ permission: 'ask', user_message: 'm' }), { user_message: 'm' });
  assert.deepEqual(sanitizeOutput({ permission: 'deny', user_message: 'm', agent_message: 'a' }), { permission: 'deny', user_message: 'm', agent_message: 'a' });
  assert.equal(JSON.stringify(sanitizeOutput({ permission: undefined })), '{}', 'what reaches stdout is the serialized form');
  for (const bad of [null, undefined, [], 'deny', 7]) assert.deepEqual(sanitizeOutput(bad), {}, String(bad));
  const input = { permission: 'allow' };
  sanitizeOutput(input);
  assert.equal(input.permission, 'allow', 'the caller\'s object must not be mutated');
});

test('a profile that is not ON, or a tool review that is off, never costs a controller process', () => {
  const standIn = f => {
    const marker = join(f.root, 'controller-started');
    const decoy = join(f.root, 'decoy-controller.mjs');
    write(decoy, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); console.log('{}');\n`);
    return { marker, extraEnv: { JEV_PLUGIN_CONTROLLER: decoy } };
  };
  for (const [name, options, profile] of [['disabled', { enabled: false, reviewMode: 'advisory' }, PROFILE], ['missing', { reviewMode: 'advisory' }, 'does-not-exist']]) {
    const f = fixture(options);
    const { marker, extraEnv } = standIn(f);
    for (const [event, payload] of [['beforeSubmitPrompt', prompt()], ['preToolUse', tool()]]) {
      assert.deepEqual(f.hook(event, payload, { profile, extraEnv }), {}, `${name} ${event}`);
    }
    assert.equal(existsSync(marker), false, `${name}: no controller process may be started`);
  }
  // Review off is the default, and Cursor would otherwise pay for a process on every shell call that has nothing to do.
  const off = fixture();
  const offStandIn = standIn(off);
  assert.deepEqual(off.hook('preToolUse', tool(), { extraEnv: offStandIn.extraEnv }), {});
  assert.equal(existsSync(offStandIn.marker), false, 'review off: preToolUse must not start the controller');
  // Controls: the same stand-in is reached once the profile is ON and the review is on, so the assertions above can fail.
  const promptOn = fixture({ reviewMode: 'advisory' });
  const promptStandIn = standIn(promptOn);
  promptOn.hook('beforeSubmitPrompt', prompt(), { extraEnv: promptStandIn.extraEnv });
  assert.equal(existsSync(promptStandIn.marker), true);
  const toolOn = fixture({ reviewMode: 'advisory' });
  const toolStandIn = standIn(toolOn);
  toolOn.hook('preToolUse', tool(), { extraEnv: toolStandIn.extraEnv });
  assert.equal(existsSync(toolStandIn.marker), true);
});

// Cursor writes the event to the hook's stdin and may leave the pipe open; the runner must not wait on it forever.
function runWithOpenStdin(f, event, { extraEnv = {}, waitMs = 9_000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [f.adapter, '--event', event, '--profile', PROFILE], { cwd: f.root, env: { ...f.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    const guard = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`the runner was still waiting after ${waitMs} ms`)); }, waitMs);
    child.on('exit', code => { clearTimeout(guard); resolve({ code, stdout, ms: Date.now() - started }); });
    // stdin is deliberately left open and silent.
  });
}

test('a stdin that never ends cannot hold an action past the deadline', async () => {
  const enforcing = fixture({ reviewMode: 'enforce' });
  const denied = await runWithOpenStdin(enforcing, 'preToolUse', { extraEnv: { JEV_CURSOR_TIMEOUT_MS: '1000' } });
  assert.equal(denied.code, 0);
  assert.ok(isDeny(JSON.parse(denied.stdout)), denied.stdout);
  assert.ok(denied.ms < 6_000, `${denied.ms} ms`);

  const plain = fixture();
  const passed = await runWithOpenStdin(plain, 'beforeSubmitPrompt', { extraEnv: { JEV_CURSOR_TIMEOUT_MS: '1000' } });
  assert.equal(passed.code, 0);
  assert.deepEqual(JSON.parse(passed.stdout), {}, 'a prompt is never withheld, even by a deadline');
});

test('the optional log holds metadata only and no prompt or tool text', () => {
  const f = fixture({ reviewMode: 'advisory' });
  const log = join(f.root, 'cursor-hook.log');
  const extraEnv = { JEV_CURSOR_HOOK_LOG: log };
  f.hook('beforeSubmitPrompt', prompt({ prompt: 'ZZ-PROMPT-TEXT-MARKER fix the retry loop', user_email: 'private.person@example.org', transcript_path: '/Users/x/ZZ-TRANSCRIPT-MARKER' }), { extraEnv });
  f.hook('preToolUse', tool({ tool_input: { command: 'echo ZZ-COMMAND-MARKER', working_directory: '/work' } }), { extraEnv });
  const text = readFileSync(log, 'utf8');
  assert.doesNotMatch(text, /ZZ-PROMPT-TEXT-MARKER|ZZ-COMMAND-MARKER|ZZ-TRANSCRIPT-MARKER|private\.person|fix the retry loop/);
  const lines = text.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 2, 'one line per invocation');
  for (const line of lines) {
    assert.ok(typeof line.at === 'string' && line.profile === PROFILE && typeof line.outcome === 'string' && Number.isFinite(line.ms) && Array.isArray(line.outputKeys), JSON.stringify(line));
  }
  assert.deepEqual(lines.map(line => line.event), ['beforeSubmitPrompt', 'preToolUse']);
  assert.equal(lines[0].promptChars, 'ZZ-PROMPT-TEXT-MARKER fix the retry loop'.length, 'only the length of the prompt is recorded');
  assert.equal(lines[1].toolName, 'Shell');
  assert.equal(statSync(log).mode & 0o777, 0o600);
  // Without the variable nothing is written anywhere.
  const quiet = fixture();
  quiet.hook('beforeSubmitPrompt', prompt());
  assert.deepEqual(readdirSync(quiet.root).filter(name => name.endsWith('.log')), []);
});
