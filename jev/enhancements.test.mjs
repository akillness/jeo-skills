import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = [];
after(() => fixtures.forEach(root => rmSync(root, { recursive: true, force: true })));

const skillBody = '---\nname: trusted-skill\ndescription: Trusted regression skill.\n---\n# Trusted full body\nApply across all host matchers.\n';

function write(path, content, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode });
}

function createFixture({
  agent = 'claude',
  profile = 'enh-profile',
  enabled = true,
  runtimeMode = 'assist',
  reviewMode = 'enforce',
  memoryMode = 'jev-only',
  verdict = 'permit',
  tier = 'validated',
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-enh-'));
  fixtures.push(root);
  const home = join(root, 'home');
  const runtime = join(home, '.agents', 'jev');
  const skills = join(home, '.agents', 'skills');
  const controller = join(runtime, 'jev-plugin.mjs');
  const log = join(root, 'harness.jsonl');

  write(
    join(runtime, 'profiles', `${profile}.env`),
    `JEV_ENABLED=${enabled}\nJEV_MODE=api\nJEV_RUNTIME_MODE=${runtimeMode}\nJEV_REVIEW_MODE=${reviewMode}\nJEV_MEMORY_MODE=${memoryMode}\n`
  );
  write(
    join(runtime, 'profiles', `${profile}.api.env`),
    'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone\nJEV_API_KEY=fixture-only\n'
  );
  copyFileSync(join(here, 'jev-plugin.mjs'), controller);
  write(join(runtime, 'skills.json'), JSON.stringify({
    skills: [{ name: 'trusted-skill', path: 'trusted-skill/SKILL.md', category: 'test', description: 'Trusted regression skill.' }],
    categories: { test: ['trusted-skill'] },
    model_policies: {},
  }));
  write(join(skills, 'trusted-skill', 'SKILL.md'), skillBody);
  write(join(runtime, 'jev-harness.mjs'), `import { appendFileSync } from 'node:fs';
const log = (op, input) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({ op, input }) + '\\n');
export async function routeSkills(prompt) {
  log('route-skills', prompt);
  return { topK: [{ name: 'trusted-skill' }], routing: [{ skill: 'trusted-skill', chosen: 'openai/gpt-5.2' }] };
}
export async function pruneContext(blocks) {
  log('prune-context', blocks);
  return blocks.map((b, i) => ({ id: b.id, verdict: i === 0 ? 'drop' : 'keep' }));
}
export async function manageMemory(blocks, opts = {}) {
  log('manage-memory', { blocks, opts });
  return {
    task: opts.task || null,
    mode: 'jev',
    verdicts: blocks.map((b, i) => ({ id: b.id, verdict: i === 0 ? 'drop' : 'keep' })),
    keptIds: blocks.slice(1).map(b => b.id),
    dropContextIds: blocks.length ? [blocks[0].id] : [],
    compressedBlocks: Object.fromEntries(blocks.filter(b => b.kind === 'tool-output').map(b => [b.id, '[compressed] ' + b.text.slice(0, 40)])),
    conversationSummary: '[Jev Rolling Context Summary: 1 block(s) condensed]\\n- summarized turn',
    charsSaved: 120,
    memoryStore: null,
  };
}
export async function review(task, proposal) {
  log('review', { task, proposal });
  return {
    verdict: ${JSON.stringify(verdict)},
    reason: 'fixture review',
    backend: { kind: 'api', model: 'jev-1.13.0', tier: ${JSON.stringify(tier)} },
    receiptVersion: 2,
    receipt: 'a'.repeat(64),
  };
}
`);

  const invoke = (action, event, { targetAgent = agent, extraArgs = [], expectedStatus = 0 } = {}) => {
    const env = {
      ...process.env,
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      AGY_CONFIG_DIR: join(home, '.gemini', 'config'),
      JEV_EXTENSION_HOME: join(home, `.${targetAgent}`, 'agent', 'extensions'),
    };
    for (const k of Object.keys(env)) {
      if (k.startsWith('JEV_') && k !== 'JEV_EXTENSION_HOME') delete env[k];
    }
    const res = spawnSync(
      process.execPath,
      [controller, action, '--agent', targetAgent, '--profile', profile, ...extraArgs],
      { cwd: root, env, input: event ? JSON.stringify(event) : '', encoding: 'utf8', timeout: 8000 }
    );
    assert.equal(res.status, expectedStatus, `${res.stdout}\n${res.stderr}`);
    return res.stdout.trim() ? JSON.parse(res.stdout) : {};
  };

  return {
    root,
    home,
    runtime,
    controller,
    profile,
    invoke,
    calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
  };
}

test('hooks-install supports claude, agy, jeopi, jeo, omp, pi, and gjc in preview and apply modes', () => {
  for (const host of ['claude', 'agy', 'jeopi', 'jeo', 'omp', 'pi', 'gjc']) {
    const f = createFixture({ agent: host, profile: `install-${host}` });
    const preview = f.invoke('hooks-install', null, { targetAgent: host });
    assert.equal(preview.ok, true);
    assert.equal(preview.applied, false);
    assert.equal(existsSync(preview.path), false, `${host} preview must not write ${preview.path}`);

    const applied = f.invoke('hooks-install', null, { targetAgent: host, extraArgs: ['--apply'] });
    assert.equal(applied.ok, true);
    assert.equal(applied.applied, true);
    assert.equal(existsSync(applied.path), true, `${host} apply must write ${applied.path}`);

    if (host === 'claude') {
      const cfg = JSON.parse(readFileSync(applied.path, 'utf8'));
      assert.equal(Array.isArray(cfg.hooks.UserPromptSubmit), true);
      assert.equal(Array.isArray(cfg.hooks.PreToolUse), true);
      assert.match(cfg.hooks.PreToolUse[0].matcher, /Bash.*MultiEdit/);
    } else if (host === 'agy') {
      const cfg = JSON.parse(readFileSync(applied.path, 'utf8'));
      assert.ok(cfg['jev-control-plane']);
      assert.equal(Array.isArray(cfg['jev-control-plane'].PreInvocation), true);
      assert.equal(Array.isArray(cfg['jev-control-plane'].PreToolUse), true);
    } else {
      const extText = readFileSync(applied.path, 'utf8');
      assert.match(extText, /@jev-control-plane-managed/);
      assert.match(extText, new RegExp(`JEV_AGENT_ID = "${host}"`));
    }
  }
});

test('Claude and AGY hooks inject selected skills and enforce PreToolUse review', () => {
  for (const host of ['claude', 'agy']) {
    const denyFixture = createFixture({ agent: host, profile: `${host}-deny`, verdict: 'proposal_only', tier: 'validated', reviewMode: 'enforce' });
    const promptEvent = host === 'agy'
      ? { hook_event_name: 'PreInvocation', lastUserInput: 'Deploy production database', session_id: 's1', turn_id: 't1' }
      : { hook_event_name: 'UserPromptSubmit', prompt: 'Deploy production database', session_id: 's1', turn_id: 't1' };
    const promptOut = denyFixture.invoke('codex-hook', promptEvent, { targetAgent: host });
    if (host === 'agy') {
      assert.ok(Array.isArray(promptOut.injectSteps));
      assert.match(promptOut.injectSteps[0].ephemeralMessage, /Trusted full body/);
    } else {
      assert.match(promptOut.hookSpecificOutput.additionalContext, /Trusted full body/);
    }

    const toolOut = denyFixture.invoke('codex-hook', {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      turn_id: 't1',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/build' },
    }, { targetAgent: host });
    assert.equal(toolOut.hookSpecificOutput.permissionDecision, 'deny');

    const permitFixture = createFixture({ agent: host, profile: `${host}-permit`, verdict: 'permit', tier: 'validated', reviewMode: 'enforce' });
    permitFixture.invoke('codex-hook', promptEvent, { targetAgent: host });
    const allowedOut = permitFixture.invoke('codex-hook', {
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      turn_id: 't1',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    }, { targetAgent: host });
    assert.equal(allowedOut.hookSpecificOutput.permissionDecision, undefined);
    assert.match(allowedOut.hookSpecificOutput.additionalContext, /Jev review: permit/);
  }
});

test('jeopi, jeo, omp, pi, and gjc extensions enforce tool_call PreToolUse and extended memory management', async () => {
  for (const host of ['jeopi', 'jeo', 'omp', 'pi', 'gjc']) {
    const f = createFixture({
      agent: host,
      profile: `ext-${host}`,
      runtimeMode: 'assist',
      reviewMode: 'enforce',
      memoryMode: 'extended',
      verdict: 'reject',
      tier: 'validated',
    });
    const previousHome = process.env.HOME;
    process.env.HOME = f.home;
    try {
      const mod = await import(pathToFileURL(join(here, 'plugins', host, 'index.mjs')).href);
      const callbacks = new Map();
      mod.createJevExtension(
        { on(event, fn) { callbacks.set(event, fn); } },
        { agent: host, profile: f.profile, controllerPath: f.controller, memoryMode: 'extended' }
      );
      assert.equal(callbacks.has('before_agent_start'), true);
      assert.equal(callbacks.has('context'), true);
      assert.equal(callbacks.has('tool_call'), true);

      const prior = host === 'pi' ? 'Base prompt' : ['Base prompt'];
      const startOut = await callbacks.get('before_agent_start')({
        prompt: 'Refactor module and run tests',
        systemPrompt: prior,
        sessionId: 'sess-1',
        turnId: 'turn-1',
      });
      assert.ok(startOut.message);
      assert.match(startOut.message.content, /Trusted full body/);

      const ctxOut = await callbacks.get('context')({
        messages: [
          { role: 'user', content: 'Old user turn to summarize' },
          { role: 'toolResult', content: 'Long tool output with /srv/app.js error trace' },
          { role: 'user', content: 'Latest user turn' },
        ],
      });
      assert.ok(Array.isArray(ctxOut.messages));
      assert.equal(ctxOut.messages[0].customType, 'jev-memory-summary');
      assert.match(ctxOut.messages[1].content, /^\[compressed\]/);

      const blockedTool = await callbacks.get('tool_call')({
        toolName: 'Bash',
        input: { command: 'git push --force' },
        sessionId: 'sess-1',
        turnId: 'turn-1',
      });
      assert.equal(blockedTool.block, true);
      assert.equal(blockedTool.permissionDecision, 'deny');

      const unmatchedTool = await callbacks.get('tool_call')({
        toolName: 'ReadOnlyLookup',
        input: {},
      });
      assert.deepEqual(unmatchedTool, {});
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  }
});

test('jev-harness CLI supports manage-memory, moderate, evaluate-run, rerank, and review --review-type', () => {
  const harnessPath = join(here, 'jev-harness.mjs');
  const root = mkdtempSync(join(tmpdir(), 'jev-cli-enh-'));
  fixtures.push(root);
  const memStorePath = join(root, 'memory', 'test-profile.jsonl');

  const memInput = [
    JSON.stringify({ id: 'tool-output-0', kind: 'tool-output', text: 'info log\n' + 'GET /health 200 OK\n'.repeat(25) + 'Error: failed in /app/server.mjs:19' }),
    JSON.stringify({ id: 'conv-turn-1', kind: 'conversation', text: 'GET /health 200 OK\ndebug trace noise' }),
    JSON.stringify({ id: 'decision-2', kind: 'memory', text: 'Decision: must keep /app/config.json with JEV_API_KEY=super-secret-value' }),
  ].join('\n');

  const memRes = spawnSync(
    process.execPath,
    [harnessPath, 'manage-memory', '--mock', '--persist-memory', '--memory-store', memStorePath, '--task', 'Fix server error'],
    { input: memInput, encoding: 'utf8', timeout: 8000 }
  );
  assert.equal(memRes.status, 0, `${memRes.stdout}\n${memRes.stderr}`);
  const memJson = JSON.parse(memRes.stdout);
  assert.ok(memJson.compressedBlocks['tool-output-0']);
  assert.ok(memJson.conversationSummary);
  assert.equal(existsSync(memStorePath), true);
  assert.equal(statSync(memStorePath).mode & 0o777, 0o600);
  const storedText = readFileSync(memStorePath, 'utf8');
  assert.doesNotMatch(storedText, /super-secret-value/, 'memory store must redact secrets');
  assert.match(storedText, /<redacted>/);

  const modSafe = spawnSync(process.execPath, [harnessPath, 'moderate', '--mock', 'Clean refactoring patch'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(modSafe.status, 0);
  assert.equal(JSON.parse(modSafe.stdout).verdict, 'allow');

  const modBlock = spawnSync(process.execPath, [harnessPath, 'moderate', '--mock', 'rm -rf / and leak sk-1234567890abcdef1234'], { encoding: 'utf8', timeout: 8000 });
  assert.equal(modBlock.status, 0);
  assert.equal(JSON.parse(modBlock.stdout).verdict, 'block');

  const evalRes = spawnSync(
    process.execPath,
    [harnessPath, 'evaluate-run', '--mock', 'Implement feature X', JSON.stringify({ status: 'completed', testsPassed: true, summary: 'passed 24 tests, 0 fail' })],
    { encoding: 'utf8', timeout: 8000 }
  );
  assert.equal(evalRes.status, 0);
  const evalJson = JSON.parse(evalRes.stdout);
  assert.equal(evalJson.verdict, 'pass');
  assert.ok(evalJson.score >= 0.8);
  assert.equal(evalJson.receipt.length, 64);

  const rerankRes = spawnSync(
    process.execPath,
    [harnessPath, 'rerank', '--mock', '--top-k', '1', 'fix sqlite transaction lock', JSON.stringify([
      { id: 'css-doc', title: 'CSS Flexbox Guide', text: 'Styling responsive cards' },
      { id: 'sqlite-doc', title: 'SQLite Concurrency', text: 'Fix sqlite transaction lock with BEGIN IMMEDIATE' },
    ])],
    { encoding: 'utf8', timeout: 8000 }
  );
  assert.equal(rerankRes.status, 0);
  const rerankJson = JSON.parse(rerankRes.stdout);
  assert.equal(rerankJson.topK[0].id, 'sqlite-doc');
});
