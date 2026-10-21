import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = [];
const ROTATE_BYTES = 5 * 1024 * 1024;
const skillBody = '---\nname: trusted-skill\ndescription: Ledger regression skill.\n---\n# Trusted skill\nRun the focused regression.\n';

after(() => fixtures.forEach(root => rmSync(root, { recursive: true, force: true })));

function write(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, { mode });
}

function fixture({ enabled = true, routed = ['trusted-skill'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jev-ledger-'));
  fixtures.push(root);
  const home = join(root, 'home');
  const state = join(root, 'state');
  const runtime = join(home, '.agents', 'jev');
  const skills = join(home, '.agents', 'skills');
  const controller = join(runtime, 'jev-plugin.mjs');
  const profile = join(runtime, 'profiles', 'usage-test.env');
  mkdirSync(state, { recursive: true, mode: 0o700 });
  write(profile, `JEV_ENABLED=${enabled}\nJEV_MODE=api\nJEV_RUNTIME_MODE=assist\n`);
  write(join(runtime, 'profiles', 'usage-test.api.env'), 'JEV_API_ENDPOINT=http://127.0.0.1:9/v1/systemone\nJEV_API_KEY=fixture-only\n');
  copyFileSync(join(here, 'jev-plugin.mjs'), controller);
  write(join(runtime, 'skills.json'), JSON.stringify({ skills: [{ name: 'trusted-skill', path: 'trusted-skill/SKILL.md', category: 'test', description: 'Ledger regression skill.' }], categories: { test: ['trusted-skill'] }, model_policies: {} }));
  write(join(skills, 'trusted-skill', 'SKILL.md'), skillBody);
  write(join(runtime, 'jev-harness.mjs'), `export async function routeSkills() { return { topK: ${JSON.stringify(routed.map(name => ({ name })))}, routing: [], backend: { kind: 'api', configuredModel: 'fixture-model', tier: 'validated' } }; }\n`);
  const env = { ...process.env, HOME: home, JEO_SKILL_STATE_DIR: state };
  for (const key of Object.keys(env)) if (key.startsWith('JEV_')) delete env[key];
  function run(event, expectedStatus = 0) {
    const result = spawnSync(process.execPath, [controller, 'hook', '--agent', 'jeopi', '--profile', 'usage-test'], {
      cwd: root,
      env,
      input: JSON.stringify(event),
      encoding: 'utf8',
      timeout: 8000,
    });
    assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  return { root, home, state, runtime, controller, run };
}

function ledgerPath(f) { return join(f.state, 'jev-usage.jsonl'); }
function segments(f) { return readdirSync(f.state).filter(name => /^jev-usage\..+\.jsonl$/.test(name)); }
function ledgerEvents(f) {
  const path = ledgerPath(f);
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
}


test('active assist injection appends one sanitized usage ledger event', () => {
  const f = fixture();
  const result = f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'Do not persist this prompt text' });
  assert.equal(result.runtime?.mode, 'assist');
  assert.match(result.runtime?.skillContext ?? '', /Trusted skill/);
  const events = ledgerEvents(f);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.deepEqual(Object.keys(event).sort(), ['agent', 'at', 'backend', 'injected', 'profile', 'routed', 'v'].sort());
  assert.equal(event.v, 1);
  assert.equal(event.agent, 'jeopi');
  assert.equal(event.profile, 'usage-test');
  assert.deepEqual(event.routed, ['trusted-skill']);
  assert.deepEqual(event.injected, ['trusted-skill']);
  assert.deepEqual(event.backend, { kind: 'api', model: 'fixture-model', tier: 'validated' });
  assert.equal(JSON.stringify(event).includes('Do not persist this prompt text'), false);
  assert.equal('prompt' in event, false);
  assert.equal('task' in event, false);
  assert.equal(statSync(f.state).mode & 0o777, 0o700);
  assert.equal(statSync(ledgerPath(f)).mode & 0o777, 0o600);
});

test('OFF profile and active hook with no routed skill write nothing', () => {
  for (const options of [{ enabled: false }, { routed: [] }]) {
    const f = fixture(options);
    f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'ephemeral prompt' });
    assert.equal(existsSync(ledgerPath(f)), false);
    assert.deepEqual(segments(f), []);
  }
});

test('rotation uses unique segments without lock files or legacy .1', () => {
  const f = fixture();
  writeFileSync(ledgerPath(f), 'x'.repeat(ROTATE_BYTES + 1024), { mode: 0o600 });
  f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'rotate once' });
  const rotated = segments(f);
  assert.equal(rotated.length, 1);
  assert.ok(statSync(join(f.state, rotated[0])).size >= ROTATE_BYTES);
  assert.equal(existsSync(join(f.state, 'jev-usage.jsonl.1')), false);
  assert.equal(readdirSync(f.state).some(name => name.includes('.lock')), false);
  assert.equal(existsSync(ledgerPath(f)), true);
  assert.equal(statSync(ledgerPath(f)).mode & 0o777, 0o600);
});

test('retention keeps the newest large segment when a later tiny segment appears', () => {
  const f = fixture();
  writeFileSync(ledgerPath(f), 'x'.repeat(ROTATE_BYTES + 1024), { mode: 0o600 });
  f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'first large segment' });
  const first = segments(f)[0];
  const tiny = 'jev-usage.99999999-99999-tiny.jsonl';
  write(join(f.state, tiny), 'tiny\n');
  writeFileSync(ledgerPath(f), 'y'.repeat(ROTATE_BYTES + 1024), { mode: 0o600 });
  f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'second large segment' });
  const largeAfterTiny = segments(f).filter(name => name !== first && name !== tiny);
  assert.equal(largeAfterTiny.length, 1);
  assert.ok(statSync(join(f.state, largeAfterTiny[0])).size >= ROTATE_BYTES);
  assert.equal(existsSync(join(f.state, largeAfterTiny[0])), true);
  assert.equal(existsSync(join(f.state, 'jev-usage.jsonl.1')), false);
  assert.equal(readdirSync(f.state).some(name => name.endsWith('.lock')), false);
});
