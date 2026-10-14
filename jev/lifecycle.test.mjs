import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtures = [];
after(() => fixtures.forEach(path => rmSync(path, { recursive: true, force: true })));

async function register(host, { promptResult, contextResult, splitUtf8Output = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-lifecycle-'));
  fixtures.push(root);
  const log = join(root, 'events.jsonl');
  const controllerPath = join(root, 'controller.mjs');
  writeFileSync(controllerPath, `import { appendFileSync } from 'node:fs';
process.stdin.setEncoding('utf8');
let input = ''; for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(event) + '\\n');
const promptResult = ${JSON.stringify(promptResult ?? { ok: true, enabled: true, context: 'Advisory only.' })};
const contextResult = ${JSON.stringify(contextResult ?? { ok: true, enabled: true, runtime: { mode: 'assist', dropContextIds: ['jev-context-1', 'jev-context-0', 'invented'] } })};
const output = JSON.stringify(event.type === 'Context' ? contextResult : (event.prompt === 'disable' ? { ok: true, enabled: false } : promptResult));
if (${splitUtf8Output}) {
  const bytes = Buffer.from(output);
  const at = bytes.indexOf(Buffer.from('한')) + 1;
  process.stdout.write(bytes.subarray(0, at));
  await new Promise(resolve => setTimeout(resolve, 20));
  process.stdout.write(bytes.subarray(at));
} else process.stdout.write(output);
`);
  const callbacks = new Map();
  const { createJevExtension } = await import(`./plugins/${host}/index.mjs`);
  const result = createJevExtension({ on(event, fn) { callbacks.set(event, fn); } }, { profile: 'lifecycle', controllerPath });
  const events = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { callbacks, events, result };
}

const assist = {
  ok: true, enabled: true, agent: 'test', profile: 'lifecycle', context: 'Applied Jev context.',
  runtime: { mode: 'assist', skillContext: '# Testing skill\nRun a focused regression.', pruneContext: true },
};

for (const host of ['jeopi', 'omp', 'pi']) {
  const prior = host === 'pi' ? 'Existing system.' : ['Existing system.', 'Existing policy.'];

  test(`${host}: default advisory callback preserves system prompt and never requests context pruning`, async () => {
    const { callbacks, events } = await register(host);
    const output = await callbacks.get('before_agent_start')({ prompt: 'Fix tests', systemPrompt: prior });
    assert.equal(output.message, undefined);
    assert.deepEqual(output.systemPrompt, host === 'pi' ? `${prior}\nAdvisory only.` : [...prior, 'Advisory only.']);
    assert.deepEqual(await callbacks.get('context')({ messages: [{ role: 'custom', customType: 'jev-skill-context', content: 'old' }] }), {});
    assert.equal(events().length, 1);
  });

  test(`${host}: assist injects actual skill instructions and prunes only Jev custom messages`, async () => {
    const { callbacks, events } = await register(host, { promptResult: assist });
    const before = await callbacks.get('before_agent_start')({ prompt: 'Fix tests', systemPrompt: prior });
    assert.equal(before.message.customType, 'jev-skill-context');
    assert.equal(before.message.content, assist.runtime.skillContext);
    assert.equal(before.message.details.applied, true);
    assert.deepEqual(before.systemPrompt, host === 'pi' ? `${prior}\nApplied Jev context.` : [...prior, 'Applied Jev context.']);
    const messages = [
      { role: 'user', content: 'Protected user message.' },
      { role: 'custom', ...before.message },
      { role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'protected-tool-path' } }] },
      { role: 'toolResult', toolCallId: 'call-1', content: 'Protected tool result.' },
      { role: 'system', content: 'Protected system message.' },
      { role: 'custom', customType: 'other-extension', content: 'Protected other extension.' },
      { role: 'user', customType: 'jev-skill-context', content: 'Protected spoofed message.' },
      { role: 'custom', customType: 'jev-skill-context', content: [{ type: 'image', data: 'Protected binary content.' }] },
      { role: 'custom', customType: 'jev-skill-context', content: 'A retained skill context.' },
    ];
    const original = structuredClone(messages);
    const output = await callbacks.get('context')({ messages });
    assert.deepEqual(output.messages, messages.filter((_item, index) => index !== 1));
    assert.deepEqual(messages, original, 'callbacks must not mutate original history');
    output.messages.forEach((message, index) => assert.equal(message, messages[index >= 1 ? index + 1 : index]));
    const request = events().at(-1);
    assert.equal(request.type, 'Context');
    assert.equal(request.prompt, 'Fix tests');
    assert.deepEqual(request.blocks, [{ id: 'jev-context-1', text: assist.runtime.skillContext }]);
    assert.doesNotMatch(JSON.stringify(request), /Protected|protected-tool-path/);
  });

  test(`${host}: a disabled next turn clears assist and no context requests follow`, async () => {
    const { callbacks, events } = await register(host, { promptResult: assist });
    await callbacks.get('before_agent_start')({ prompt: 'Fix tests', systemPrompt: prior });
    assert.deepEqual(await callbacks.get('before_agent_start')({ prompt: 'disable', systemPrompt: prior }), {});
    assert.deepEqual(await callbacks.get('context')({ messages: [{ role: 'custom', customType: 'jev-skill-context', content: 'old' }, { role: 'custom', customType: 'jev-skill-context', content: 'new' }] }), {});
    assert.equal(events().length, 2);
  });

  test(`${host}: split UTF-8 controller output preserves full Korean skill instructions`, async () => {
    const skillContext = '# 한국어 스킬\n한 글자도 손상 없이 전체 지침을 전달합니다.\n도구 결과를 보존하세요.';
    const { callbacks } = await register(host, { promptResult: { ...assist, runtime: { ...assist.runtime, skillContext } }, splitUtf8Output: true });
    const output = await callbacks.get('before_agent_start')({ prompt: '한국어 지침을 적용해줘', systemPrompt: prior });
    assert.equal(output.message.content, skillContext);
    assert.doesNotMatch(output.message.content, /\uFFFD/);
  });
}

for (const [name, contextResult] of [
  ['unavailable controller', { ok: false, enabled: true, runtime: { mode: 'assist', dropContextIds: ['jev-context-0'] } }],
  ['disabled profile', { ok: true, enabled: false, runtime: { mode: 'assist', dropContextIds: ['jev-context-0'] } }],
  ['advisory profile', { ok: true, enabled: true, runtime: { mode: 'advisory', dropContextIds: ['jev-context-0'] } }],
  ['malformed drop list', { ok: true, enabled: true, runtime: { mode: 'assist', dropContextIds: 'jev-context-0' } }],
]) {
  test(`context pruning preserves input for ${name}`, async () => {
    const { callbacks, events } = await register('jeopi', { promptResult: assist, contextResult });
    await callbacks.get('before_agent_start')({ prompt: 'Fix tests' });
    assert.deepEqual(await callbacks.get('context')({ messages: [{ role: 'custom', customType: 'jev-skill-context', content: 'old' }, { role: 'custom', customType: 'jev-skill-context', content: 'new' }] }), {});
    assert.equal(events().at(-1).type, 'Context');
  });
}

test('context pruning requires latest user task and eligible Jev messages', async () => {
  const { callbacks, events } = await register('jeopi', { promptResult: assist });
  await callbacks.get('before_agent_start')({ prompt: '' });
  assert.deepEqual(await callbacks.get('context')({ messages: [{ role: 'custom', customType: 'jev-skill-context', content: 'old' }] }), {});
  await callbacks.get('before_agent_start')({ prompt: 'Fix tests' });
  assert.deepEqual(await callbacks.get('context')({ messages: [{ role: 'user', content: 'Keep me' }] }), {});
  assert.equal(events().length, 2);
});

test('native context submission caps older skill blocks and preserves excluded/newest messages', async () => {
  const contextResult = { ok: true, enabled: true, runtime: { mode: 'assist', dropContextIds: Array.from({ length: 41 }, (_item, index) => `jev-context-${index}`) } };
  const { callbacks, events } = await register('jeopi', { promptResult: assist, contextResult });
  await callbacks.get('before_agent_start')({ prompt: 'Fix tests' });
  const messages = Array.from({ length: 41 }, (_item, index) => ({ role: 'custom', customType: 'jev-skill-context', content: `Skill ${index}` }));
  const output = await callbacks.get('context')({ messages });
  assert.equal(events().at(-1).blocks.length, 32);
  assert.deepEqual(output.messages, messages.slice(32));
  assert.equal(output.messages.at(-1), messages.at(-1));
});

test('native context submission caps total characters before serialization and preserves oversized blocks', async () => {
  const contextResult = { ok: true, enabled: true, runtime: { mode: 'assist', dropContextIds: Array.from({ length: 5 }, (_item, index) => `jev-context-${index}`) } };
  const { callbacks, events } = await register('jeopi', { promptResult: assist, contextResult });
  await callbacks.get('before_agent_start')({ prompt: 'Fix tests' });
  const messages = [180000, 100000, 80000, 300000, 5].map(length => ({ role: 'custom', customType: 'jev-skill-context', content: '한'.repeat(length) }));
  const original = structuredClone(messages);
  const output = await callbacks.get('context')({ messages });
  const request = events().at(-1);
  assert.deepEqual(request.blocks.map(block => block.id), ['jev-context-0', 'jev-context-2']);
  assert.ok(request.blocks.reduce((total, block) => total + block.text.length, 0) <= 262144);
  assert.deepEqual(output.messages, [messages[1], messages[3], messages[4]]);
  assert.deepEqual(messages, original);
});
