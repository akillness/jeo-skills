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

  const run = (action, event, { targetAgent = agent, extraArgs = [], input } = {}) => {
    const env = {
      ...process.env,
      HOME: home,
      CODEX_HOME: join(home, '.codex'),
      CLAUDE_CONFIG_DIR: join(home, '.claude'),
      AGY_CONFIG_DIR: join(home, '.gemini', 'config'),
      JEO_CONFIG_DIR: join(home, '.jeo'),
      JEV_EXTENSION_HOME: join(home, `.${targetAgent}`, 'agent', 'extensions'),
    };
    for (const k of Object.keys(env)) {
      if (k.startsWith('JEV_') && k !== 'JEV_EXTENSION_HOME') delete env[k];
    }
    return spawnSync(
      process.execPath,
      [controller, action, '--agent', targetAgent, '--profile', profile, ...extraArgs],
      { cwd: root, env, input: input ?? (event ? JSON.stringify(event) : ''), encoding: 'utf8', timeout: 8000 }
    );
  };
  const invoke = (action, event, { expectedStatus = 0, ...options } = {}) => {
    const res = run(action, event, options);
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
    run,
    calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [],
  };
}

test('hooks-install supports claude, agy, jeopi, jeo, omp, pi, and gjc in preview and apply modes', () => {
  for (const host of ['claude', 'agy', 'jeopi', 'jeo', 'omp', 'pi', 'gjc']) {
    const f = createFixture({ agent: host, profile: `install-${host}` });
    // jeo edits only a config.json jeo itself created (defaultModel is schema-required).
    const jeoConfig = join(f.home, '.jeo', 'config.json');
    if (host === 'jeo') write(jeoConfig, '{"defaultModel":"anthropic/claude-sonnet-5"}\n');
    const before = host === 'jeo' ? readFileSync(jeoConfig, 'utf8') : null;
    const preview = f.invoke('hooks-install', null, { targetAgent: host });
    assert.equal(preview.ok, true);
    assert.equal(preview.applied, false);
    if (host === 'jeo') assert.equal(readFileSync(jeoConfig, 'utf8'), before, 'jeo preview must not modify config.json');
    else assert.equal(existsSync(preview.path), false, `${host} preview must not write ${preview.path}`);

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
    } else if (host === 'jeo') {
      // jeo-code loads only `pre-tool` command hooks from config.json; there is no extension API.
      const cfg = JSON.parse(readFileSync(applied.path, 'utf8'));
      assert.equal(applied.path, join(f.home, '.jeo', 'config.json'));
      assert.equal(cfg.defaultModel, 'anthropic/claude-sonnet-5');
      assert.equal(cfg.hooks.enabled, true);
      assert.equal(cfg.hooks.hooks.length, 1);
      assert.equal(cfg.hooks.hooks[0].event, 'pre-tool');
      assert.equal(cfg.hooks.hooks[0].match.tool, 'bash|write|edit|ast_edit|delete');
      assert.match(cfg.hooks.hooks[0].run, /'jeo-pretool'/);
      assert.equal(statSync(applied.path).mode & 0o777, 0o600);
      assert.ok(applied.limitations.some(item => /no task is cached/.test(item)));
      f.invoke('hooks-install', null, { targetAgent: host, extraArgs: ['--apply'] });
      assert.equal(JSON.parse(readFileSync(applied.path, 'utf8')).hooks.hooks.length, 1, 'jeo install must be idempotent');
    } else {
      // jeopi/OMP/Pi/GJC discover `extensions/*.{ts,js}` only.
      assert.match(applied.path, /jev-control-plane\.js$/);
      const extText = readFileSync(applied.path, 'utf8');
      assert.match(extText, /@jev-control-plane-managed/);
      assert.match(extText, new RegExp(`JEV_AGENT_ID = "${host}"`));
    }
  }
});

test('Claude and Codex hook upgrades migrate matchers without widening unrelated hooks', () => {
  for (const host of ['claude', 'codex']) {
    for (const mixed of [false, true]) {
      const f = createFixture({ agent: host, profile: `upgrade-${host}-${mixed}` });
      const installed = f.invoke('hooks-install', null, { extraArgs: ['--matcher', 'Bash', '--apply'] });
      const config = JSON.parse(readFileSync(installed.path, 'utf8'));
      const originalGroup = config.hooks.PreToolUse[0];
      const unrelated = { type: 'command', command: 'unrelated-user-hook', timeout: 7 };
      if (mixed) {
        originalGroup.hooks.push(unrelated);
        originalGroup.customMetadata = 'preserve';
        write(installed.path, JSON.stringify(config));
      }
      const before = readFileSync(installed.path, 'utf8');
      const options = { extraArgs: ['--matcher', 'bash|write|edit'] };
      f.invoke('hooks-install', null, options);
      assert.equal(readFileSync(installed.path, 'utf8'), before, 'preview must not migrate hooks');
      f.invoke('hooks-install', null, { extraArgs: [...options.extraArgs, '--apply'] });
      const upgraded = JSON.parse(readFileSync(installed.path, 'utf8'));
      const groups = upgraded.hooks.PreToolUse;
      const managed = groups.filter(group => group.hooks.some(item => item.command?.includes('codex-hook')));
      assert.equal(managed.length, 1, 'the managed hook must execute only once');
      assert.equal(managed[0].matcher, 'bash|write|edit', `${host} must replace the old matcher`);
      if (mixed) {
        assert.deepEqual(groups[0], { ...originalGroup, hooks: [unrelated] }, 'unrelated hooks retain their matcher and metadata');
      }
      const first = readFileSync(installed.path, 'utf8');
      f.invoke('hooks-install', null, { extraArgs: [...options.extraArgs, '--apply'] });
      assert.equal(readFileSync(installed.path, 'utf8'), first, 'matcher migration must be idempotent');

      // Duplicate legacy Jev groups must collapse to one canonical managed hook.
      const dupConfig = JSON.parse(first);
      dupConfig.hooks.PreToolUse.push({ matcher: 'LegacyTool', hooks: [...managed[0].hooks] });
      write(installed.path, JSON.stringify(dupConfig));
      f.invoke('hooks-install', null, { extraArgs: [...options.extraArgs, '--apply'] });
      const deduped = JSON.parse(readFileSync(installed.path, 'utf8'));
      const remainingManaged = deduped.hooks.PreToolUse.filter(group => group.hooks.some(item => item.command?.includes('codex-hook')));
      assert.equal(remainingManaged.length, 1, 'duplicate legacy managed groups must be collapsed');
    }
  }
});

test('native proposal review uses the current task rather than stale cached task text', () => {
  for (const host of ['jeopi', 'omp', 'pi', 'gjc']) {
    const f = createFixture({ agent: host, profile: `current-${host}` });
    f.invoke('hook', { prompt: 'Old deployment task', session_id: 'session', turn_id: 'old-turn' });
    for (const turn of ['old-turn', 'new-turn']) {
      const output = f.invoke('hook', {
        type: 'PreToolUse', task: 'Current read-only inspection',
        session_id: 'session', turn_id: turn, tool_name: 'bash', tool_input: { command: 'pwd' },
      });
      assert.match(output.hookSpecificOutput.additionalContext, /Jev review: permit/);
      assert.equal(f.calls().filter(call => call.op === 'review').at(-1).input.task, 'Current read-only inspection');
    }
    const reviewsBefore = f.calls().filter(call => call.op === 'review').length;
    const oversized = f.invoke('hook', {
      type: 'PreToolUse', task: 'x'.repeat(100_001),
      session_id: 'session', turn_id: 'old-turn', tool_name: 'bash', tool_input: {},
    });
    assert.equal(oversized.hookSpecificOutput.permissionDecision, 'deny', 'an oversized current task must not reuse cached authorization');
    assert.equal(f.calls().filter(call => call.op === 'review').length, reviewsBefore);
  }
});

test('jeo hooks-install preserves existing hooks and refuses configs jeo would ignore or disabled hooks', () => {
  const f = createFixture({ agent: 'jeo', profile: 'install-jeo-guard' });
  const configPath = join(f.home, '.jeo', 'config.json');
  const missing = f.invoke('hooks-install', null, { targetAgent: 'jeo', extraArgs: ['--apply'], expectedStatus: 1 });
  assert.match(missing.error, /run jeo once/);
  assert.equal(existsSync(configPath), false);

  write(configPath, '{"hooks":{}}');
  const invalid = f.invoke('hooks-install', null, { targetAgent: 'jeo', extraArgs: ['--apply'], expectedStatus: 1 });
  assert.match(invalid.error, /no defaultModel/);
  assert.equal(readFileSync(configPath, 'utf8'), '{"hooks":{}}');

  const unrelated = { event: 'post-turn', match: { tool: 'edit' }, run: 'npx tsc --noEmit' };
  write(configPath, JSON.stringify({ defaultModel: 'openai/gpt-5.2', providers: { anthropic: 'keep-me' }, hooks: { enabled: false, hooks: [unrelated] } }));
  const before = readFileSync(configPath, 'utf8');
  const refused = f.invoke('hooks-install', null, { targetAgent: 'jeo', extraArgs: ['--apply'], expectedStatus: 1 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /hooks are disabled/);
  assert.equal(readFileSync(configPath, 'utf8'), before);

  write(configPath, JSON.stringify({ defaultModel: 'openai/gpt-5.2', providers: { anthropic: 'keep-me' }, hooks: { enabled: true, hooks: [unrelated] } }));
  f.invoke('hooks-install', null, { targetAgent: 'jeo', extraArgs: ['--apply'] });
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(cfg.providers.anthropic, 'keep-me');
  assert.deepEqual(cfg.hooks.hooks[0], unrelated);
  assert.equal(cfg.hooks.hooks[1].event, 'pre-tool');
});

test('jeo-pretool follows the jeo exit-code contract', () => {
  const event = { event: 'pre-tool', tool: 'bash', args: { command: 'git push --force' } };
  const missingTask = createFixture({ agent: 'jeo', profile: 'jeo-enforce', reviewMode: 'enforce', verdict: 'permit' });
  const withheld = missingTask.run('jeo-pretool', event);
  assert.equal(withheld.status, 2, withheld.stderr);
  assert.match(withheld.stdout, /jeo supplies no task context/);
  assert.equal(missingTask.calls().length, 0, 'no review call without a task');

  for (const [verdict, status] of [['reject', 2], ['permit', 0]]) {
    const f = createFixture({ agent: 'jeo', profile: `jeo-cached-${verdict}`, reviewMode: 'enforce', verdict });
    f.invoke('hook', { prompt: 'Publish the release branch' });
    const res = f.run('jeo-pretool', event);
    assert.equal(res.status, status, `${verdict}: ${res.stdout}${res.stderr}`);
    assert.equal(f.calls().filter(call => call.op === 'review').length, 1);
  }

  const advisory = createFixture({ agent: 'jeo', profile: 'jeo-advisory', reviewMode: 'advisory' });
  assert.equal(advisory.run('jeo-pretool', event).status, 0);
  assert.equal(advisory.calls().length, 0, 'advisory output is discarded by jeo, so no review is spent');

  const off = createFixture({ agent: 'jeo', profile: 'jeo-off', enabled: false, reviewMode: 'enforce' });
  assert.equal(off.run('jeo-pretool', event).status, 0);

  const malformed = createFixture({ agent: 'jeo', profile: 'jeo-bad-input', reviewMode: 'enforce' });
  const bad = malformed.run('jeo-pretool', null, { input: '{"event":"post-turn"}' });
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /action withheld/);
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

test('jeopi, omp, pi, and gjc extensions enforce tool_call PreToolUse and extended memory management', async () => {
  for (const host of ['jeopi', 'omp', 'pi', 'gjc']) {
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
      // Use the matcher hooks-install actually writes into the managed extension.
      const installed = f.invoke('hooks-install', null, { targetAgent: host, extraArgs: ['--apply'] });
      assert.match(readFileSync(installed.path, 'utf8'), new RegExp(`JEV_PRETOOL_MATCHER = ${JSON.stringify(installed.matcher).replace(/[|]/g, '\\|')}`));
      mod.createJevExtension(
        { on(event, fn) { callbacks.set(event, fn); } },
        { agent: host, profile: f.profile, controllerPath: f.controller, memoryMode: 'extended', toolMatcher: installed.matcher }
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

      // jeopi/OMP/Pi tool results carry `content: [{ type: 'text', text }]`.
      const imageResult = { role: 'toolResult', toolCallId: 'call-img', toolName: 'browser', content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }, { type: 'text', text: 'screenshot' }] };
      const arrayOut = await callbacks.get('context')({
        messages: [
          imageResult,
          { role: 'toolResult', toolCallId: 'call-old', toolName: 'bash', content: [{ type: 'text', text: 'stale build output' }] },
          { role: 'toolResult', toolCallId: 'call-new', toolName: 'read', content: [{ type: 'text', text: 'Long tool output with /srv/app.js error trace' }] },
          { role: 'user', content: 'Latest user turn' },
        ],
      });
      assert.ok(Array.isArray(arrayOut.messages), 'array-content tool results must enter extended memory management');
      const byCall = id => arrayOut.messages.find(message => message.toolCallId === id);
      assert.deepEqual(byCall('call-img'), imageResult, 'image-bearing results are never rewritten');
      assert.deepEqual(byCall('call-old').content, [{ type: 'text', text: '[Jev: tool output omitted to save context]' }], 'a dropped tool result keeps its call pairing');
      assert.equal(byCall('call-new').content.length, 1);
      assert.match(byCall('call-new').content[0].text, /^\[compressed\]/);
      assert.equal(arrayOut.messages.at(-1).content, 'Latest user turn');

      const blockedTool = await callbacks.get('tool_call')({
        toolName: 'Bash',
        input: { command: 'git push --force' },
        sessionId: 'sess-1',
        turnId: 'turn-1',
      });
      assert.equal(blockedTool.block, true);
      assert.equal(blockedTool.permissionDecision, 'deny');

      for (const toolName of ['bash', 'write', 'edit']) {
        const lowercase = await callbacks.get('tool_call')({ toolName, input: { command: 'git push --force' }, sessionId: 'sess-1', turnId: 'turn-1' });
        assert.equal(lowercase.block, true, `${host} must review lowercase ${toolName}`);
      }

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
