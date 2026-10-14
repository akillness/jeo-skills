import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const roots = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
const skillBody = '---\nname: trusted-skill\ndescription: Regression fixture.\n---\n# Complete trusted skill\nRun the focused regression before reporting completion.\n';
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, { mode: 0o600 });
}
function fixture({ reviewMode, enabled = true, reviewResult = { verdict: 'permit', backend: { tier: 'validated' } }, reviewFailure = false, routeFailure = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-codex-'));
  roots.push(root);
  const home = join(root, 'home');
  const runtime = join(home, '.agents', 'jev');
  const profile = join(runtime, 'profiles', 'codex-test.env');
  const controller = join(runtime, 'jev-plugin.mjs');
  const log = join(root, 'harness.jsonl');
  const codexHome = join(home, '.codex');
  const hooksPath = join(codexHome, 'hooks.json');
  write(profile, `JEV_ENABLED=${enabled}\nJEV_MODE=api\nJEV_RUNTIME_MODE=assist\n${reviewMode === undefined ? '' : `JEV_REVIEW_MODE=${reviewMode}\n`}`);
  write(join(runtime, 'profiles', 'codex-test.api.env'), 'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone\nJEV_API_KEY=fixture-only\n');
  copyFileSync(join(here, 'jev-plugin.mjs'), controller);
  write(join(runtime, 'skills.json'), JSON.stringify({ skills: [{ name: 'trusted-skill', path: 'trusted-skill/SKILL.md', description: 'Regression fixture.', category: 'test' }], categories: { test: ['trusted-skill'] }, model_policies: {} }));
  write(join(home, '.agents', 'skills', 'trusted-skill', 'SKILL.md'), skillBody);
  write(join(runtime, 'jev-harness.mjs'), `import { appendFileSync } from 'node:fs';
const log = (op, input) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({op,input})+'\\n');
export async function routeSkills(prompt) { log('route-skills', prompt); if (${routeFailure}) throw new Error('fixture routing outage'); return {topK:[{name:'trusted-skill'}],routing:[]}; }
export async function review(task, action) { log('review',{task,action}); if (${reviewFailure}) throw new Error('fixture private backend failure'); return ${JSON.stringify(reviewResult)}; }
`);
  const env = { ...process.env, HOME: home, CODEX_HOME: codexHome };
  for (const key of Object.keys(env)) if (key.startsWith('JEV_')) delete env[key];
  function invoke(action, input, { apply = false, expectedStatus = 0, extra = [] } = {}) {
    const result = spawnSync(process.execPath, [controller, action, '--agent', 'codex', '--profile', 'codex-test', ...(apply ? ['--apply'] : []), ...extra], { cwd: root, env, input: typeof input === 'string' ? input : JSON.stringify(input ?? {}), encoding: 'utf8', timeout: 8000 });
    assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  return { root, home, runtime, profile, controller, hooksPath, codexHome, invoke,
    run: event => invoke('codex-hook', event),
    runAsync: (event, { splitAt } = {}) => new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.execPath, [controller, 'codex-hook', '--agent', 'codex', '--profile', 'codex-test'], { cwd: root, env });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', rejectRun);
      child.on('close', status => {
        try { assert.equal(status, 0, `${stdout}\n${stderr}`); resolveRun(JSON.parse(stdout)); }
        catch (error) { rejectRun(error); }
      });
      const input = Buffer.from(JSON.stringify(event));
      if (splitAt !== undefined) {
        child.stdin.write(input.subarray(0, splitAt));
        setTimeout(() => child.stdin.end(input.subarray(splitAt)), 100);
      } else child.stdin.end(input);
    }),
    calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
    cachePaths: () => existsSync(join(runtime, 'sessions')) ? readdirSync(join(runtime, 'sessions')).map(name => join(runtime, 'sessions', name)) : [],
  };
}
function prompt(overrides = {}) { return { hook_event_name: 'UserPromptSubmit', session_id: 'session-1', turn_id: 'turn-1', prompt: 'Fix the failing regression', ...overrides }; }
function tool(overrides = {}) { return { hook_event_name: 'PreToolUse', session_id: 'session-1', turn_id: 'turn-1', tool_name: 'Bash', tool_input: { command: 'npm test' }, ...overrides }; }
function deny(result) { assert.equal(result.hookSpecificOutput?.hookEventName, 'PreToolUse'); assert.equal(result.hookSpecificOutput?.permissionDecision, 'deny'); }
function neverAllow(result) { assert.notEqual(result.hookSpecificOutput?.permissionDecision, 'allow'); }

test('Codex prompt hook injects full trusted selected skill as real additionalContext', () => {
  const f = fixture();
  const result = f.run(prompt());
  assert.equal(result.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(result.hookSpecificOutput.additionalContext.includes(skillBody));
  assert.deepEqual(f.calls().map(call => call.op), ['route-skills']);
});
test('Codex prompt routing outage does not leak errors or inject trusted instructions', () => {
  const f = fixture({ routeFailure: true });
  const result = f.run(prompt());
  assert.doesNotMatch(JSON.stringify(result), /Complete trusted skill|fixture routing outage|fixture-only/);
});
test('Codex default review mode is off and never calls review backend', () => {
  const f = fixture();
  assert.deepEqual(f.run(tool()), {});
  f.run(prompt());
  assert.deepEqual(f.run(tool()), {});
  assert.ok(f.calls().every(call => call.op !== 'review'));
  assert.deepEqual(f.cachePaths(), []);
});
test('Codex disabled profile performs no routing or review', () => {
  const f = fixture({ enabled: false, reviewMode: 'enforce' });
  assert.deepEqual(f.run(prompt()), {});
  assert.deepEqual(f.run(tool()), {});
  assert.deepEqual(f.calls(), []);
});
test('Codex advisory review injects findings and preserves host authorization', () => {
  const f = fixture({ reviewMode: 'advisory', reviewResult: { verdict: 'reject', backend: { tier: 'unvalidated' } } });
  f.run(prompt());
  const result = f.run(tool());
  assert.match(result.hookSpecificOutput.additionalContext, /reject/);
  assert.equal(result.hookSpecificOutput.permissionDecision, undefined);
  const call = f.calls().find(item => item.op === 'review');
  assert.equal(call.input.task, prompt().prompt);
  assert.deepEqual(call.input.action.input, tool().tool_input);
  assert.equal(call.input.action.evidence.testsExecutedByJev, false);
});
test('Codex advisory outage adds neutral context without leaking provider errors', () => {
  const f = fixture({ reviewMode: 'advisory', reviewFailure: true });
  f.run(prompt());
  const result = f.run(tool());
  assert.match(result.hookSpecificOutput.additionalContext, /unavailable/);
  assert.equal(result.hookSpecificOutput.permissionDecision, undefined);
  assert.doesNotMatch(JSON.stringify(result), /fixture private backend failure|fixture-only/);
});
test('Codex enforce mode denies provider outages using valid hook envelope', () => {
  const f = fixture({ reviewMode: 'enforce', reviewFailure: true });
  f.run(prompt());
  const result = f.run(tool());
  deny(result);
  assert.equal(result.continue, undefined);
  assert.equal(result.stopReason, undefined);
  assert.doesNotMatch(JSON.stringify(result), /fixture private backend failure/);
});
for (const verdict of ['reject', 'proposal_only', 'defer']) {
  test(`Codex enforce mode denies ${verdict} review`, () => {
    const f = fixture({ reviewMode: 'enforce', reviewResult: { verdict, backend: { tier: 'validated' } } });
    f.run(prompt());
    deny(f.run(tool()));
  });
}
test('Codex enforce mode rejects unvalidated backend even if it reports permit', () => {
  const f = fixture({ reviewMode: 'enforce', reviewResult: { verdict: 'permit', backend: { tier: 'unvalidated' } } });
  f.run(prompt());
  deny(f.run(tool()));
});
test('Codex validated permit never returns host permissionDecision allow', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.run(prompt());
  const result = f.run(tool());
  neverAllow(result);
  assert.equal(result.hookSpecificOutput.permissionDecision, undefined);
  assert.match(result.hookSpecificOutput.additionalContext, /permit/);
});
test('Codex enforce mode requires task context and avoids backend before task arrives', () => {
  const f = fixture({ reviewMode: 'enforce' });
  deny(f.run(tool()));
  assert.deepEqual(f.calls(), []);
});
test('Codex task cache is isolated by both session and turn', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.run(prompt());
  deny(f.run(tool({ session_id: 'session-other' })));
  deny(f.run(tool({ turn_id: 'turn-other' })));
  assert.ok(f.calls().every(call => call.op !== 'review'));
  neverAllow(f.run(tool()));
  assert.equal(f.calls().filter(call => call.op === 'review').length, 1);
});
test('Codex task cache expires after 24 hours', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.run(prompt());
  const [path] = f.cachePaths();
  assert.ok(path);
  write(path, JSON.stringify({ task: 'Expired task', time: Date.now() - 86_400_001 }));
  deny(f.run(tool()));
  assert.ok(f.calls().every(call => call.op !== 'review'));
});
test('Codex malformed cached task denies enforcement without backend inference', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.run(prompt());
  write(f.cachePaths()[0], '{invalid-json');
  deny(f.run(tool()));
  assert.ok(f.calls().every(call => call.op !== 'review'));
});
test('Codex missing session/turn identifiers never share task cache', () => {
  const f = fixture({ reviewMode: 'enforce' });
  f.run(prompt({ turn_id: undefined }));
  deny(f.run(tool({ turn_id: undefined })));
  assert.deepEqual(f.cachePaths(), []);
  assert.ok(f.calls().every(call => call.op !== 'review'));
});
test('Codex malformed review mode is never permissive and performs no inference', () => {
  const f = fixture({ reviewMode: 'invalid-mode' });
  neverAllow(f.run(prompt()));
  neverAllow(f.run(tool()));
  assert.deepEqual(f.calls(), []);
});
test('Codex explicitly selected enforce profile survives malformed unrelated agent mappings', () => {
  const f = fixture({ reviewMode: 'enforce' });
  write(join(f.runtime, 'agents.json'), '{invalid-json');
  deny(f.run(tool()));
  assert.deepEqual(f.calls(), []);
});
test('Codex stdin streaming preserves Korean split inside a multibyte UTF-8 character', async () => {
  const f = fixture();
  const event = prompt({ prompt: '한국어 요청입니다' });
  const bytes = Buffer.from(JSON.stringify(event));
  const splitAt = bytes.indexOf(Buffer.from('한')) + 1;
  assert.ok(splitAt > 0);
  const result = await f.runAsync(event, { splitAt });
  assert.ok(result.hookSpecificOutput.additionalContext.includes(skillBody));
  assert.deepEqual(f.calls(), [{ op: 'route-skills', input: event.prompt }]);
});
test('Codex malformed stdin with enforce profile denies rather than errors open', () => {
  const f = fixture({ reviewMode: 'enforce' });
  deny(f.invoke('codex-hook', '{invalid-json'));
  assert.deepEqual(f.calls(), []);
});
test('Codex oversized hook input denies enforcement before backend inference', () => {
  const f = fixture({ reviewMode: 'enforce' });
  deny(f.invoke('codex-hook', JSON.stringify(tool({ oversized: 'x'.repeat(2_097_153) }))));
  assert.deepEqual(f.calls(), []);
});
test('Codex hooks route and review through real harness and loopback API transport', { timeout: 15000 }, async () => {
  const f = fixture({ reviewMode: 'advisory' });
  copyFileSync(join(here, 'jev-harness.mjs'), join(f.runtime, 'jev-harness.mjs'));
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const answers = Object.fromEntries(Object.entries(body.questions || {}).map(([id, question]) => {
        const options = question.options || Object.keys(question.criteria || {});
        return [id, question.type === 'choice'
          ? { type: 'choice', choice: options[0], confidence: 1, probabilities: Object.fromEntries(options.map(option => [option, 1 / options.length])) }
          : { type: 'noul', noul: id === 'gate::prose_suffices' ? 0 : 1 }];
      }));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ model: 'codex-loopback-test', answers, usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  try {
    write(join(f.runtime, 'profiles', 'codex-test.api.env'), `JEV_API_ENDPOINT=http://127.0.0.1:${server.address().port}/v1/systemone\nJEV_API_KEY=fixture-only\n`);
    const routed = await f.runAsync(prompt());
    assert.ok(routed.hookSpecificOutput.additionalContext.includes(skillBody), JSON.stringify({ routed, requests }));
    const reviewed = await f.runAsync(tool());
    neverAllow(reviewed);
    assert.match(reviewed.hookSpecificOutput.additionalContext, /Jev review:/);
    assert.doesNotMatch(reviewed.hookSpecificOutput.additionalContext, /unavailable/);
    assert.ok(requests.length >= 2);
    assert.match(JSON.stringify(requests), /trusted-skill/);
    assert.match(JSON.stringify(requests.at(-1)), /npm test/);
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
});

test('Codex hooks-install preview writes neither hooks nor directories', () => {
  const f = fixture();
  const result = f.invoke('hooks-install');
  assert.equal(result.applied, false);
  assert.equal(existsSync(f.hooksPath), false);
  assert.equal(existsSync(f.codexHome), false);
});
test('Codex hooks-install preserves unrelated objects and original indices, and is idempotent', () => {
  const f = fixture();
  const original = { description: 'Existing user hooks', extra: { retained: true }, hooks: {
    UserPromptSubmit: [{ matcher: 'existing', hooks: [{ type: 'command', command: 'existing-prompt', timeout: 7 }], customMetadata: 'preserve' }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'existing-tool' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'existing-stop' }] }],
  } };
  write(f.hooksPath, JSON.stringify(original));
  const before = readFileSync(f.hooksPath, 'utf8');
  f.invoke('hooks-install');
  assert.equal(readFileSync(f.hooksPath, 'utf8'), before);
  f.invoke('hooks-install', undefined, { apply: true });
  const first = readFileSync(f.hooksPath, 'utf8');
  const installed = JSON.parse(first);
  assert.deepEqual(installed.hooks.UserPromptSubmit[0], original.hooks.UserPromptSubmit[0]);
  assert.deepEqual(installed.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
  assert.deepEqual(installed.hooks.Stop, original.hooks.Stop);
  assert.deepEqual(installed.extra, original.extra);
  assert.equal(installed.hooks.UserPromptSubmit.length, 2);
  assert.equal(installed.hooks.PreToolUse.length, 2);
  assert.match(installed.hooks.UserPromptSubmit[1].hooks[0].command, /codex-hook/);
  f.invoke('hooks-install', undefined, { apply: true });
  assert.equal(readFileSync(f.hooksPath, 'utf8'), first);
});
test('Codex hooks-install rejects symlink destination without modifying target', () => {
  const f = fixture();
  const target = join(f.root, 'unrelated-hooks.json');
  write(target, '{}');
  mkdirSync(f.codexHome, { recursive: true });
  symlinkSync(target, f.hooksPath);
  const result = f.invoke('hooks-install', undefined, { apply: true, expectedStatus: 1 });
  assert.equal(result.ok, false);
  assert.equal(readFileSync(target, 'utf8'), '{}');
});
for (const malformed of ['{invalid-json', '[]', '{"hooks":[]}', '{"hooks":{"UserPromptSubmit":{}}}', '{"hooks":{"PreToolUse":"wrong"}}', '{"hooks":{"UserPromptSubmit":null}}', '{"hooks":{"PreToolUse":false}}', '{"hooks":{"UserPromptSubmit":0}}', '{"hooks":{"PreToolUse":""}}']) {
  test(`Codex hooks-install rejects malformed config ${malformed}`, () => {
    const f = fixture();
    write(f.hooksPath, malformed);
    const result = f.invoke('hooks-install', undefined, { apply: true, expectedStatus: 1 });
    assert.equal(result.ok, false);
    assert.equal(readFileSync(f.hooksPath, 'utf8'), malformed);
  });
}
