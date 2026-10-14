import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = [];
after(() => fixtures.forEach(root => rmSync(root, { recursive: true, force: true })));
const skillBody = '---\nname: trusted-skill\ndescription: Trusted regression skill.\n---\n# Trusted full body\nRun the focused regression before reporting completion.\n';

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
}

function fixture({ enabled = true, mode = 'assist', selected = ['trusted-skill'], skillPath = 'trusted-skill/SKILL.md', failure = false, verdicts = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-runtime-'));
  fixtures.push(root);
  const home = join(root, 'home');
  const runtime = join(home, '.agents', 'jev');
  const profile = join(runtime, 'profiles', 'runtime.env');
  const skills = join(home, '.agents', 'skills');
  const log = join(root, 'harness.jsonl');
  const controller = join(runtime, 'jev-plugin.mjs');
  write(profile, `JEV_ENABLED=${enabled}\nJEV_MODE=api\nJEV_RUNTIME_MODE=${mode}\n`);
  write(join(runtime, 'profiles', 'runtime.api.env'), 'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone\nJEV_API_KEY=fixture-only\n');
  copyFileSync(join(here, 'jev-plugin.mjs'), controller);
  write(join(runtime, 'skills.json'), JSON.stringify({ skills: [
    { name: 'trusted-skill', path: skillPath, category: 'test', description: 'Trusted regression skill.' },
    { name: 'other-skill', path: 'other-skill/SKILL.md', category: 'test', description: 'Other skill.' },
  ], categories: { test: ['trusted-skill', 'other-skill'] }, model_policies: {} }));
  write(join(skills, 'trusted-skill', 'SKILL.md'), skillBody);
  write(join(skills, 'other-skill', 'SKILL.md'), '# Other full skill\nKeep full instructions.\n');
  write(join(runtime, 'jev-harness.mjs'), `import { appendFileSync } from 'node:fs';
const log = (op, input) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({ op, input }) + '\\n');
export async function routeSkills(prompt) {
  log('route-skills', prompt);
  if (${failure}) throw new Error('Jev unavailable for skill routing: fixture backend unavailable');
  return { topK: ${JSON.stringify(selected.map(name => ({ name })))}, routing: [] };
}
export async function pruneContext(blocks) {
  log('prune-context', blocks);
  if (${failure}) throw new Error('Jev unavailable for context pruning: fixture backend unavailable');
  return ${JSON.stringify(verdicts)} ?? blocks.map((block, index) => ({ id: block.id, verdict: index === 0 ? 'drop' : 'keep' }));
}
`);
  const run = (event, { expectedStatus = 0 } = {}) => {
    const env = { ...process.env, HOME: home };
    for (const key of Object.keys(env)) if (key.startsWith('JEV_')) delete env[key];
    const result = spawnSync(process.execPath, [controller, 'hook', '--agent', 'jeopi', '--profile', 'runtime'], { cwd: root, env, input: JSON.stringify(event), encoding: 'utf8', timeout: 8000 });
    assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  return { root, home, skills, runtime, profile, run, calls: () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

test('assist hook injects full trusted installed selected skill body', () => {
  const f = fixture();
  const result = f.run({ prompt: 'Fix the test' });
  assert.equal(result.runtime?.mode, 'assist');
  assert.equal(result.runtime?.pruneContext, true);
  assert.ok(result.runtime.skillContext.includes(skillBody), 'full untruncated instructions must be present');
  assert.ok(result.runtime.skillContext.includes(join(f.skills, 'trusted-skill', 'SKILL.md')));
  assert.doesNotMatch(result.runtime.skillContext, /Other full skill/);
  assert.deepEqual(f.calls().map(call => call.op), ['route-skills']);
});

test('assist hook rejects manifest traversal and unknown routed skill names', () => {
  const f = fixture({ selected: ['trusted-skill', 'unknown-skill'], skillPath: '../outside/SKILL.md' });
  write(join(f.home, '.agents', 'outside', 'SKILL.md'), 'OUTSIDE_SECRET_INSTRUCTIONS');
  write(join(f.skills, 'unknown-skill', 'SKILL.md'), 'UNKNOWN_UNCATALOGUED_INSTRUCTIONS');
  const result = f.run({ prompt: 'Fix tests' });
  assert.doesNotMatch(JSON.stringify(result), /OUTSIDE_SECRET_INSTRUCTIONS|UNKNOWN_UNCATALOGUED_INSTRUCTIONS|Trusted full body/);
});

test('assist hook rejects installed skill directory symlink escaping canonical root', () => {
  const f = fixture();
  rmSync(join(f.skills, 'trusted-skill'), { recursive: true });
  const outside = join(f.root, 'outside');
  write(join(outside, 'SKILL.md'), 'SYMLINK_ESCAPED_INSTRUCTIONS');
  symlinkSync(outside, join(f.skills, 'trusted-skill'));
  assert.doesNotMatch(JSON.stringify(f.run({ prompt: 'Fix tests' })), /SYMLINK_ESCAPED_INSTRUCTIONS/);
});

test('assist hook never injects partial oversize skill content', () => {
  const f = fixture();
  write(join(f.skills, 'trusted-skill', 'SKILL.md'), 'OVERSIZE_BODY_MARKER\n' + 'x'.repeat(65537));
  assert.doesNotMatch(JSON.stringify(f.run({ prompt: 'Fix tests' })), /OVERSIZE_BODY_MARKER/);
});

test('assist Context event prunes through harness and returns only matched drop ids', () => {
  const f = fixture({ verdicts: [{ id: 'jev-context-0', verdict: 'drop' }, { id: 'jev-context-1', verdict: 'keep' }, { id: 'jev-context-999', verdict: 'drop' }] });
  const blocks = [{ id: 'jev-context-0', text: 'Old skill instructions' }, { id: 'jev-context-1', text: 'Useful context' }];
  const result = f.run({ type: 'Context', prompt: 'Fix tests', blocks });
  assert.equal(result.runtime?.mode, 'assist');
  assert.deepEqual(result.runtime.dropContextIds, ['jev-context-0']);
  assert.deepEqual(f.calls(), [{ op: 'prune-context', input: blocks }]);
  assert.equal(result.runtime.skillContext, undefined);
});

test('Context event rejects ids outside the Jev namespace before inference', () => {
  const f = fixture();
  const result = f.run({ type: 'Context', prompt: 'Fix tests', blocks: [{ id: 'user-0', text: 'Protected user instructions' }] });
  assert.deepEqual(result.runtime?.dropContextIds ?? [], []);
  assert.deepEqual(f.calls(), []);
});

test('advisory profile does not inject skill body or prune context', () => {
    const f = fixture({ mode: 'advisory' });
    const prompt = f.run({ prompt: 'Fix tests' });
    assert.equal(Boolean(prompt.runtime?.skillContext), false);
    const context = f.run({ type: 'Context', prompt: 'Fix tests', blocks: [{ id: 'jev-context-0', text: 'Old' }] });
    assert.deepEqual(context.runtime?.dropContextIds ?? [], []);
    assert.ok(f.calls().every(call => call.op !== 'prune-context'));
});

test('malformed runtime mode fails before inference or skill injection', () => {
  const f = fixture({ mode: 'malformed-value' });
  for (const event of [{ prompt: 'Fix tests' }, { type: 'Context', prompt: 'Fix tests', blocks: [{ id: 'jev-context-0', text: 'Old' }] }]) {
    const result = f.run(event, { expectedStatus: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.runtime, undefined);
    assert.doesNotMatch(JSON.stringify(result), /Trusted full body|fixture-only/);
  }
  assert.deepEqual(f.calls(), []);
});

test('OFF profile bypasses prompt and context inference', () => {
  const f = fixture({ enabled: false });
  assert.equal(f.run({ prompt: 'Fix tests' }).enabled, false);
  assert.equal(f.run({ type: 'Context', prompt: 'Fix tests', blocks: [{ id: 'jev-context-0', text: 'Old' }] }).enabled, false);
  assert.deepEqual(f.calls(), []);
});

test('backend outage injects no skill body and preserves context', () => {
  const f = fixture({ failure: true });
  const prompt = f.run({ prompt: 'Fix tests' });
  assert.equal(Boolean(prompt.runtime?.skillContext), false);
  const context = f.run({ type: 'Context', prompt: 'Fix tests', blocks: [{ id: 'jev-context-0', text: 'Old' }] });
  assert.deepEqual(context.runtime?.dropContextIds ?? [], []);
  assert.doesNotMatch(JSON.stringify({ prompt, context }), /fixture backend unavailable|fixture-only/);
});
