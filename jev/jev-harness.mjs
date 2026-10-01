#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';


// Catalog resolution (first readable wins): explicit env override, the shared
// router checkout created by setup-all-skills-prompt.md, then a local checkout cwd.
const CATALOG_CANDIDATES = [
  process.env.JEV_CATALOG_PATH,
  join(homedir(), '.agents', 'jeo-skills-repo', '.agent-skills', 'skills.json'),
  join(process.cwd(), '.agent-skills', 'skills.json'),
].filter(Boolean);

const DEFAULT_API_URL = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8763/v1/systemone';
const THRESHOLD = 0.8;

// Live mode is the default. Configuration (JEV_MODE=api|local, JEV_API_KEY,
// JEV_ENDPOINT, JEV_LOCAL_MODEL_DIR) comes from the environment, with
// ~/.agents/jev/.env (KEY=VALUE lines) as fallback for unset keys.
try {
  const envText = await readFile(join(homedir(), '.agents', 'jev', '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(JEV_[A-Z_]+)\s*=\s*["']?([^"'\n]+)["']?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* no env file — fail-closed behavior in requestJev handles it */ }

const MODES = ['api', 'local', 'ollama', 'lmstudio'];
const MODE = MODES.includes(process.env.JEV_MODE) ? process.env.JEV_MODE : 'api';
const GENERATIVE = MODE === 'ollama' || MODE === 'lmstudio';
// Generative backends (quantized GGUF) speak the OpenAI-compatible API; the
// harness implements the systemone contract on top of chat completions.
const GEN_DEFAULTS = {
  ollama: { endpoint: 'http://127.0.0.1:11434', model: 'hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M', start: 'ollama serve' },
  lmstudio: { endpoint: 'http://127.0.0.1:1234', model: null, start: 'lms server start (or LM Studio → Developer → Start Server), then load JEV-9B-GGUF' },
};
const GEN_BASE = GENERATIVE ? (process.env.JEV_ENDPOINT || GEN_DEFAULTS[MODE].endpoint).replace(/\/+$/, '') : null;
const API_URL = GENERATIVE ? `${GEN_BASE}/v1/chat/completions`
  : process.env.JEV_ENDPOINT || (MODE === 'local' ? DEFAULT_LOCAL_URL : DEFAULT_API_URL);


async function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// lmstudio exposes whatever model the user loaded; resolve its id lazily.
async function resolveGenModel({ timeoutMs = 3000 } = {}) {
  if (process.env.JEV_LOCAL_MODEL) return process.env.JEV_LOCAL_MODEL;
  if (GEN_DEFAULTS[MODE].model) return GEN_DEFAULTS[MODE].model;
  const res = await fetchWithTimeout(`${GEN_BASE}/v1/models`, {}, timeoutMs);
  if (!res.ok) throw new Error(`model list responded ${res.status}`);
  const { data } = await res.json();
  const ids = (data || []).map(m => m.id).filter(Boolean);
  const pick = ids.find(id => /jev/i.test(id)) || ids[0];
  if (!pick) throw new Error('no model loaded on the server');
  return pick;
}

export async function jevStatus({ timeoutMs = 3000 } = {}) {
  if (GENERATIVE) {
    const status = { active: false, mode: MODE, endpoint: GEN_BASE, model: process.env.JEV_LOCAL_MODEL || GEN_DEFAULTS[MODE].model, hint: null };
    try {
      const res = await fetchWithTimeout(`${GEN_BASE}/v1/models`, {}, timeoutMs);
      if (!res.ok) throw new Error(`server responded ${res.status}`);
      status.model = await resolveGenModel({ timeoutMs });
      status.active = true;
    } catch (err) {
      status.hint = `${MODE} server unavailable (${err.message}); start it with: ${GEN_DEFAULTS[MODE].start}`;
    }
    return status;
  }
  if (MODE === 'local') {

    const status = { active: false, mode: 'local', endpoint: API_URL, modelDir: process.env.JEV_LOCAL_MODEL_DIR || null, hint: null };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(API_URL.replace(/\/v1\/systemone$/, '/healthz'), { signal: controller.signal }).finally(() => clearTimeout(timer));
      status.active = res.ok;
      if (!res.ok) status.hint = `local server responded ${res.status}; start it with: ~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py`;
    } catch {
      status.hint = 'local server not running; start it with: ~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py';
    }
    return status;
  }
  return process.env.JEV_API_KEY
    ? { active: true, mode: 'api', endpoint: API_URL, keySource: 'env-or-dotenv', hint: null }
    : { active: false, mode: 'api', endpoint: API_URL, keySource: null, hint: 'Set JEV_API_KEY in env or ~/.agents/jev/.env, or run jev-setup.sh' };
}



// Contract logic adapted verbatim from the verified session runner.
export function evaluateNoul(prob) {
  const clamped = Math.max(0, Math.min(1, prob));
  const answer = clamped >= 0.5 ? 'yes' : 'no';
  const confidence = Math.max(clamped, 1 - clamped);
  return { probability: clamped, answer, confidence };
}

export function decideProposalReview(validation, review, threshold = THRESHOLD) {
  if (threshold < 0.5 || threshold > 1.0) {
    throw new Error(`Threshold must be between 0.5 and 1.0, got ${threshold}`);
  }
  if (!validation || validation.ok !== true || (validation.errors && validation.errors.length > 0)) {
    return { verdict: 'reject', reason: `Validation failed: ${validation?.errors?.join(', ') || 'unknown validation error'}`, failingQuestions: [], threshold };
  }
  if (!review || review.error !== null || !review.answers) {
    return { verdict: 'unavailable', reason: `Review unavailable: ${review?.error || 'missing review envelope/answers'}`, failingQuestions: [], threshold };
  }
  const failing = [];
  const { addresses_task, evidence_supports, unrelated_changes, needs_clarification } = review.answers;
  if (addresses_task.answer !== 'yes' || addresses_task.confidence < threshold) failing.push(`addresses_task (ans=${addresses_task.answer}, conf=${addresses_task.confidence.toFixed(2)})`);
  if (evidence_supports.answer !== 'yes' || evidence_supports.confidence < threshold) failing.push(`evidence_supports (ans=${evidence_supports.answer}, conf=${evidence_supports.confidence.toFixed(2)})`);
  if (unrelated_changes.answer !== 'no' || unrelated_changes.confidence < threshold) failing.push(`unrelated_changes (ans=${unrelated_changes.answer}, conf=${unrelated_changes.confidence.toFixed(2)})`);
  if (needs_clarification.answer !== 'no' || needs_clarification.confidence < threshold) failing.push(`needs_clarification (ans=${needs_clarification.answer}, conf=${needs_clarification.confidence.toFixed(2)})`);
  if (failing.length > 0) return { verdict: 'proposal_only', reason: `Below threshold or unfavorable in: ${failing.join('; ')}`, failingQuestions: failing, threshold };
  return { verdict: 'permit', reason: 'All 4 questions met favorable directions above threshold', failingQuestions: [], threshold };
}

export function generateReceiptBinding(task, proposal, decision) {
  const payload = JSON.stringify({ task, proposal, decision });
  return createHash('sha256').update(payload).digest('hex');
}

export const QUESTION_SET_V4 = {
  addresses_task: { type: 'noul', instructions: 'Does this proposed change directly address the stated task?' },
  evidence_supports: { type: 'noul', instructions: 'Does the provided evidence support this proposed change?' },
  unrelated_changes: { type: 'noul', instructions: 'Does this proposal contain unrelated changes?' },
  needs_clarification: { type: 'noul', instructions: 'Does the task require clarification before taking this action?' },
};

export async function requestJev(state, questions, { mock = false, timeoutMs } = {}) {
  if (mock) return { model: 'jev-mock', source: 'mock', error: null, latencyMs: 0, answers: simulateAnswers(state, questions) };
  if (GENERATIVE) return requestJevGenerative(state, questions, { timeoutMs: timeoutMs ?? 180000 });
  timeoutMs = timeoutMs ?? 5000;
  if (MODE === 'api' && !process.env.JEV_API_KEY) return { model: null, source: 'upstream', error: 'Missing JEV_API_KEY', latencyMs: 0, answers: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.JEV_API_KEY) headers.Authorization = `Bearer ${process.env.JEV_API_KEY}`;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    return { ...payload, model: payload.model || (MODE === 'local' ? 'jev-9b-local' : 'jev-latest'), source: MODE === 'local' ? 'local' : 'upstream', error: null, latencyMs: Date.now() - started, answers: normalizeAnswers(payload, questions) };

  } catch (error) {
    return { model: null, source: 'upstream', error: error.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : String(error.message || error), latencyMs: Date.now() - started, answers: null };
  } finally {
    clearTimeout(timer);
  }
async function chatOnce(system, user, timeoutMs, model) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let content;
  if (MODE === 'ollama') {
    // Native ollama API: think:false suppresses Qwen3.5 reasoning entirely,
    // so the answer arrives in a few tokens instead of a long think trace.
    const res = await fetchWithTimeout(`${GEN_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, think: false, options: { temperature: 0, num_predict: 400 }, messages }),
    }, timeoutMs);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    content = (await res.json()).message?.content;
  } else {
    // OpenAI-compatible path (LM Studio). Reasoning models may spend tokens
    // thinking first, so allow enough budget to reach the final JSON.
    const res = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 2048, messages }),
    }, timeoutMs);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const message = (await res.json()).choices?.[0]?.message || {};
    content = message.content || message.reasoning_content || message.reasoning;
  }
  if (typeof content !== 'string') throw new Error('Malformed chat completion (no message content)');
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model output: ${content.slice(0, 120)}`);
  return JSON.parse(match[0]);
}


// Implements the systemone contract (noul probability / choice distribution)
// on top of an OpenAI-compatible generative endpoint (ollama or LM Studio).
async function requestJevGenerative(state, questions, { timeoutMs }) {
  const started = Date.now();
  try {
    const model = await resolveGenModel();
    const stateJSON = JSON.stringify(state);
    const answers = {};
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === 'choice') {
        const system = 'You are JEV System One, a calibrated decision model. Respond ONLY with a JSON object {"probabilities": {"<option>": <0..1 relevance>}} covering every listed option. No prose.';
        const user = `${q.instructions}\nOptions: ${JSON.stringify(q.options)}\nState: ${stateJSON}`;
        const parsed = await chatOnce(system, user, timeoutMs, model);
        const probabilities = {};
        for (const opt of q.options || []) {
          const p = Number(parsed.probabilities?.[opt]);
          probabilities[opt] = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
        }
        const best = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
        answers[id] = { choice: best && best[1] > 0 ? best[0] : undefined, probabilities };
      } else {
        const system = 'You are JEV System One, a calibrated decision model. Respond ONLY with a JSON object {"probability": <0..1>} — the probability that the answer to the question is yes. No prose.';
        const user = `Question: ${q.instructions}\nState: ${stateJSON}`;
        const parsed = await chatOnce(system, user, timeoutMs, model);
        const p = Number(parsed.probability ?? parsed.prob ?? parsed.yes_probability);
        if (!Number.isFinite(p)) throw new Error(`Model returned no probability for ${id}`);
        answers[id] = evaluateNoul(p);
      }
    }
    return { model, source: MODE, error: null, latencyMs: Date.now() - started, answers };
  } catch (error) {
    return { model: null, source: MODE, error: error.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : String(error.message || error), latencyMs: Date.now() - started, answers: null };
  }
}

}

function normalizeAnswers(payload, questions) {
  const raw = payload.answers || payload.results || payload;
  const result = {};
  for (const id of Object.keys(questions)) {
    const item = raw[id];
    if (questions[id]?.type === 'choice') {
      if (!item || (item.choice === undefined && !item.probabilities)) throw new Error(`Malformed Jev response: missing choice for ${id}`);
      result[id] = { choice: item.choice, probabilities: item.probabilities };
      continue;
    }
    const prob = typeof item === 'number' ? item : item?.probability ?? item?.prob ?? item?.yes_probability;
    if (!Number.isFinite(prob)) throw new Error(`Malformed Jev response: missing probability for ${id}`);
    result[id] = evaluateNoul(prob);
  }
  return result;

}

function simulateAnswers(state, questions) {
  const text = JSON.stringify(state).toLowerCase();
  const answers = {};
  for (const id of Object.keys(questions)) {
    let p = 0.5;
    if (id === 'addresses_task') p = /task|proposal|patch|change|request/.test(text) ? 0.93 : 0.58;
    else if (id === 'evidence_supports') p = /evidence|diff|patch|validation|file|code/.test(text) ? 0.92 : 0.56;
    else if (id === 'unrelated_changes') p = /unrelated|scope creep|out of scope/.test(text) ? 0.9 : 0.04;
    else if (id === 'needs_clarification') p = /ambiguous|unclear|clarification|not specified/.test(text) ? 0.91 : 0.04;
    answers[id] = evaluateNoul(p);
  }
  return answers;
}

function mockCategory(task, families) {
  const text = task.toLowerCase();
  const hints = {
    web: /react|next|web|frontend|browser|api|site|ui|css|website/,
    infrastructure: /deploy|cloud|docker|server|security|infra|ci\/cd|pipeline/,
    game: /game|unity|unreal|sprite|shader/,
    'creative-media': /video|image|audio|music|motion|design|presentation|art/,
    'cli-tools': /cli|command line|terminal tool|package manager/,
    'ai-agents': /agent|skill|prompt|orchestrat|llm|memory/,
    engineering: /code|bug|test|refactor|software|typescript|python|javascript|build/,
    research: /research|paper|academic|experiment|benchmark/,
    business: /business|marketing|product|customer|growth|sales/,
    utilities: /file|git|workspace|knowledge|productivity/,
  };
  return families.filter(f => hints[f]?.test(text));
}

async function loadCatalog() {
  const errors = [];
  for (const candidate of CATALOG_CANDIDATES) {
    let catalog;
    try { catalog = JSON.parse(await readFile(candidate, 'utf8')); }
    catch (err) { errors.push(`${candidate}: ${err.message}`); continue; }
    try {
      if (!Array.isArray(catalog.skills) || !catalog.categories || typeof catalog.categories !== 'object') throw new Error('Unexpected skills catalog schema');
      for (const skill of catalog.skills) if (!skill.name || !skill.category || !skill.description) throw new Error(`Malformed skill entry in catalog (${skill.name || '<unnamed>'})`);
      return catalog;
    } catch (err) { errors.push(`${candidate}: ${err.message}`); }
  }
  throw new Error(`Cannot load a valid skills catalog. Tried:\n  ${errors.join('\n  ')}`);
}


function tokenEstimate(text) { return Math.ceil(text.length / 4); }
function scoreSkill(skill, task) {
  const terms = task.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [];
  const corpus = `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')} ${skill.keyword || ''}`.toLowerCase();
  return terms.reduce((score, term) => score + (corpus.includes(term) ? (skill.name.includes(term) ? 3 : 1) : 0), 0);
}

export async function routeSkills(task, { mock = false, topK = 3 } = {}) {
  if (!task?.trim()) throw new Error('route-skills requires a task string');
  if (!Number.isInteger(topK) || topK < 1 || topK > 50) throw new Error('--top-k must be an integer from 1 to 50');
  const catalog = await loadCatalog();
  const families = Object.keys(catalog.categories);
  let selected;
  if (mock) selected = mockCategory(task, families);
  else {
    const envelope = await requestJev({ task, categories: families.map(category => ({ category, skills: catalog.categories[category] })) }, {
      family: { type: 'choice', options: families, instructions: 'Choose the category family or families most relevant to the task.' },
    });
    if (envelope.error || !envelope.answers) throw new Error(`Jev unavailable for skill routing: ${envelope.error}`);
    const choice = envelope.answers.family?.choice;
    selected = Array.isArray(choice) ? choice : choice ? [choice] : [];
    if (!selected.length) selected = families.filter(f => envelope.answers.family?.probabilities?.[f] >= 0.2);
  }
  if (!selected.length) selected = families;
  const selectedSkills = catalog.skills.filter(s => selected.includes(s.category));
  selectedSkills.sort((a, b) => scoreSkill(b, task) - scoreSkill(a, task) || a.name.localeCompare(b.name));
  const top = selectedSkills.slice(0, topK);
  const fullTokens = catalog.skills.reduce((n, s) => n + tokenEstimate(`${s.name} ${s.description}`), 0);
  const leanTokens = top.reduce((n, s) => n + tokenEstimate(`${s.name} ${s.description}`), 0);
  // ponytail: weak-match fallback routes to the find-skills skill (public skills.sh registry) instead of re-querying
  const localMatch = top.length > 0 && scoreSkill(top[0], task) > 0;
  const result = { task, mode: mock ? 'mock' : 'jev', families: selected, topK: top.map(s => ({ name: s.name, category: s.category, description: s.description })), fullCatalogSkills: catalog.skills.length, estimatedFullTokens: fullTokens, estimatedTopKTokens: leanTokens, estimatedTokensSaved: fullTokens - leanTokens, estimatedSavingsPercent: fullTokens ? Math.round((fullTokens - leanTokens) / fullTokens * 100) : 0 };
  if (!localMatch) result.publicRegistryFallback = { skill: 'find-skills', command: `npx skills find "${task.replace(/"/g, '')}"`, note: 'No confident local catalog match; use the find-skills skill to search the public skills.sh registry (triage installs/source/stars before installing).' };
  return result;
}

const KEEP_HINTS = /(?:\/[^\s"'<>]+|\b(?:error|failed|exception|traceback|decision|decided|task|must|should|because|constraint|requirement)\b)/i;
const NOISE_HINTS = /(?:^\s*(?:debug|info|trace)\b|\b(?:GET|POST)\s+\/|\b\d{3}\s+(?:OK|Not Found)\b|^\s*at\s+\S+\s*\()/im;
function mockKeep(text) { return !NOISE_HINTS.test(text) && (KEEP_HINTS.test(text) || text.trim().length < 300); }

export async function pruneContext(blocks, { mock = false } = {}) {
  const out = [];
  for (const block of blocks) {
    if (!block || typeof block.id !== 'string' || typeof block.text !== 'string') throw new Error('Each input line must be JSON {"id": string, "text": string}');
    let keep;
    if (mock) keep = mockKeep(block.text);
    else {
      const envelope = await requestJev({ id: block.id, text: block.text }, { essential: { type: 'noul', instructions: 'Does this block contain facts essential for future steps?' } });
      if (envelope.error || !envelope.answers) throw new Error(`Jev unavailable for context pruning: ${envelope.error}`);
      keep = envelope.answers.essential.answer === 'yes' && envelope.answers.essential.confidence >= THRESHOLD;
    }
    out.push({ id: block.id, verdict: keep ? 'keep' : 'drop' });
  }
  return out;
}

export async function review(task, proposal, { mock = false, validation = { ok: true, errors: [] } } = {}) {
  const reviewEnvelope = validation?.ok === true && !(validation.errors?.length)
    ? await requestJev({ task, proposal }, QUESTION_SET_V4, { mock })
    : null;
  let decision = decideProposalReview(validation, reviewEnvelope);
  if (mock && decision.verdict === 'permit') {
    decision = { ...decision, verdict: 'proposal_only', reason: `Mock mode cannot authorize autonomous execution (would permit: ${decision.reason})` };
  }
  return { ...decision, mode: mock ? 'mock' : 'jev', receipt: generateReceiptBinding(task, proposal, decision), review: reviewEnvelope };
}

function parseArgs(args) {
  const flags = { mock: false, topK: 3 };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mock') flags.mock = true;
    else if (args[i] === '--top-k') flags.topK = Number(args[++i]);
    else rest.push(args[i]);
  }
  return { flags, rest };
}
async function readStdin() { let s = ''; for await (const chunk of process.stdin) s += chunk; return s; }

export async function selfTest() {
  const good = { ok: true, errors: [] };
  const envelope = values => ({ error: null, answers: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, evaluateNoul(v)])) });
  const cases = [
    ['Clean Patch', decideProposalReview(good, envelope({ addresses_task: .98, evidence_supports: .95, unrelated_changes: .02, needs_clarification: .05 })).verdict, 'permit'],
    ['Hallucinated Evidence', decideProposalReview(good, envelope({ addresses_task: .92, evidence_supports: .35, unrelated_changes: .04, needs_clarification: .08 })).verdict, 'proposal_only'],
    ['Unrelated Changes', decideProposalReview(good, envelope({ addresses_task: .9, evidence_supports: .85, unrelated_changes: .88, needs_clarification: .02 })).verdict, 'proposal_only'],
    ['Ambiguous Task', decideProposalReview(good, envelope({ addresses_task: .7, evidence_supports: .75, unrelated_changes: .05, needs_clarification: .91 })).verdict, 'proposal_only'],
    ['Path Traversal Rejection', decideProposalReview({ ok: false, errors: ['Path outside project root: /etc/passwd'] }, null).verdict, 'reject'],
    ['Provider Outage', decideProposalReview(good, { error: '503 Service Unavailable', answers: null }).verdict, 'unavailable'],
  ];
  let routeResult;
  try {
    routeResult = await routeSkills('Fix a React frontend performance bug', { mock: true });
    const routedOk = routeResult.families.includes('web')
      && routeResult.topK.length === 3
      && routeResult.topK.every(s => routeResult.families.includes(s.category))
      && routeResult.estimatedSavingsPercent >= 70;
    cases.push(['route-skills case', routedOk, true]);
  }
  catch (e) { cases.push(['route-skills case', e.message, true]); }
  const pruned = await pruneContext([{ id: 'decision', text: 'Decision: keep /Users/project/config.json for next step' }, { id: 'noise', text: 'GET /health 200 OK\ninfo periodic polling response' }], { mock: true });
  cases.push(['prune-context case', pruned[0].verdict === 'keep' && pruned[1].verdict === 'drop', true]);
  let failed = 0;
  console.log('=== JEV SYSTEM ONE HARNESS SELF-TEST ===');
  for (const [name, actual, expected] of cases) {
    const pass = actual === expected;
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${String(actual)}${pass ? '' : ` (expected ${String(expected)})`}`);
  }
  console.log(`${cases.length - failed}/${cases.length} checks passed`);
  return failed === 0 ? 0 : 1;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const { flags, rest } = parseArgs(args);
  if (command === 'self-test') process.exitCode = await selfTest();
  else if (command === 'status') {
    const status = await jevStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.active ? 0 : 2;
  }
  else if (command === 'route-skills') console.log(JSON.stringify(await routeSkills(rest.join(' '), flags), null, 2));
  else if (command === 'prune-context') {
    const lines = (await readStdin()).split(/\r?\n/).filter(line => line.trim());
    const blocks = lines.map(line => JSON.parse(line));
    const results = await pruneContext(blocks, flags);
    for (const result of results) console.log(JSON.stringify(result));
  } else if (command === 'review') {
    const [task, proposalJSON] = rest;
    if (!task || !proposalJSON) throw new Error('Usage: review [--mock] <task> <proposal-json>');
    console.log(JSON.stringify(await review(task, JSON.parse(proposalJSON), flags), null, 2));
  } else throw new Error('Usage: jev-harness.mjs <status|route-skills|prune-context|review|self-test> [--mock]');

}

const invokedHref = (() => { try { return process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href; } catch { return `file://${process.argv[1]}`; } })();
if (import.meta.url === invokedHref) main().catch(error => { console.error(`jev-harness: ${error.message}`); process.exitCode = 1; });
