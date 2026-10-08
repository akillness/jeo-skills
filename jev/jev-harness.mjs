#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Contract constants ───────────────────────────────────────────────────────
export const BACKEND_KINDS = ['api', 'local', 'ollama', 'lmstudio', 'systemone'];
export const OPERATIONS = ['route-skills', 'prune-context', 'review'];
const OP_KEY = { 'route-skills': 'ROUTE_SKILLS', 'prune-context': 'PRUNE_CONTEXT', review: 'REVIEW' };
const SYSTEMONE_DRIVERS = ['typesafe', 'decide', 'vllm-jev-decision'];
const DEFAULT_API_URL = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8763/v1/systemone';
const THRESHOLD = 0.8;
export const GATE_THRESHOLD = 0.30;
export const FITS_THRESHOLD = 0.30;
export const SHARD_FINALISTS = 3;
export const MAX_CHOICE_SHARDS = 4;
export const SHORTLIST_SIZE = 12;
const EXCERPT_CHARS = 700;
const SHARD_DESCRIPTION_CHARS = 160;
const RECEIPT_VERSION = 2;
const GEN_DEFAULTS = {
  ollama: { endpoint: 'http://127.0.0.1:11434', model: 'hf.co/mradermacher/JEV-9B-GGUF:Q4_K_M', start: 'ollama serve' },
  lmstudio: { endpoint: 'http://127.0.0.1:1234', model: null, start: 'lms server start (or LM Studio → Developer → Start Server), then load JEV-9B-GGUF' },
};
const CHOICE_CAPS = { api: 255, local: 16, ollama: 16, lmstudio: 16, systemone: { typesafe: 255, decide: 256, 'vllm-jev-decision': 16 } };
const TIMEOUTS = { api: 15000, systemone: { typesafe: 15000, decide: 60000, 'vllm-jev-decision': 60000 }, local: 30000, ollama: 180000, lmstudio: 180000 };
export const STOPWORDS = new Set(('a an the and or but if then else for to of in on at by with from as is are was were be been being ' +
  'this that these those it its my our your their his her we you they i me us them do does did done have has had having can could ' +
  'should would will shall may might must not no yes so than too very just also into onto over under about after before during while ' +
  'there here where when why how what which who whom whose any some all each every both either neither one two please want need ' +
  'text code file files task help use using make create fix add new run get set up out off').split(/\s+/));

// ── Profile and configuration (import time) ──────────────────────────────────
function extractProfileArgs(args, envProfile) {
  const rest = [];
  let profile = (envProfile || '').trim() || null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile') {
      if (!args[i + 1]) throw new Error('--profile requires a profile id');
      profile = args[++i];
    } else if (args[i].startsWith('--profile=')) {
      profile = args[i].slice('--profile='.length);
      if (!profile) throw new Error('--profile requires a non-empty profile id');
    } else rest.push(args[i]);
  }
  return { profile, rest };
}

const profileArgs = extractProfileArgs(process.argv.slice(2), process.env.JEV_PROFILE);
const PROFILE = profileArgs.profile;
const CLI_ARGS = profileArgs.rest;
const PROFILE_ERROR = PROFILE && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(PROFILE)
  ? 'Profile id must contain lowercase letters, digits, and single hyphens only'
  : null;

function parseEnv(text) {
  const config = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(JEV_[A-Z_]+)\s*=(.*)$/);
    if (!match) continue;
    const value = match[2].trim();
    config[match[1]] = /^(".*"|'.*')$/.test(value) ? value.slice(1, -1) : value;
  }
  return config;
}

async function readEnvFile(path, optional = true) {
  try { return parseEnv(await readFile(path, 'utf8')); }
  catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw error;
  }
}

// A selected profile reads only its own <profile>.env plus every existing
// <profile>.<kind>.env; nothing else is consulted. Legacy installs read
// ~/.agents/jev/.env, which serves every kind. Ambient environment variables
// override file values key by key; profile opt-in is owned by the base file.
const PROFILE_DIR = join(homedir(), '.agents', 'jev', 'profiles');
let envReadError = null;
let baseConfig = {};
let baseFilePresent = false;
const kindFiles = {};   // kind -> parsed <profile>.<kind>.env (profiles only)
const kindFilePresent = {};
if (!PROFILE_ERROR) {
  try {
    if (PROFILE) {
      const basePath = join(PROFILE_DIR, `${PROFILE}.env`);
      baseFilePresent = existsSync(basePath);
      baseConfig = await readEnvFile(basePath);
      for (const kind of BACKEND_KINDS) {
        const path = join(PROFILE_DIR, `${PROFILE}.${kind}.env`);
        kindFilePresent[kind] = existsSync(path);
        kindFiles[kind] = kindFilePresent[kind] ? await readEnvFile(path) : {};
      }
    } else {
      const legacyPath = join(homedir(), '.agents', 'jev', '.env');
      baseFilePresent = existsSync(legacyPath);
      baseConfig = await readEnvFile(legacyPath);
      for (const kind of BACKEND_KINDS) { kindFiles[kind] = {}; kindFilePresent[kind] = false; }
    }
  } catch (error) {
    envReadError = `Cannot read Jev configuration: ${error.code || error.message}`;
  }
}

function cfg(kind, key) {
  if (process.env[key] !== undefined) return process.env[key];
  return cfgFile(kind, key);
}
// File-only view: what the saved configuration says, ignoring ambient env.
function cfgFile(kind, key) {
  if (kind && kindFiles[kind] && kindFiles[kind][key] !== undefined) return kindFiles[kind][key];
  return baseConfig[key];
}
const DEFAULT_KIND = cfg(null, 'JEV_MODE') || 'api';
const FILE_KIND = cfgFile(null, 'JEV_MODE') || 'api';
const PROFILE_ENABLED_VALUE = PROFILE ? String(baseConfig.JEV_ENABLED || '').toLowerCase() : 'true';
const PROFILE_ENABLED = PROFILE_ENABLED_VALUE === 'true';
const PROFILE_ENABLED_INVALID = Boolean(PROFILE && baseConfig.JEV_ENABLED !== undefined && !/^(true|false)$/i.test(baseConfig.JEV_ENABLED));
const PROFILE_DISABLED = Boolean(PROFILE && !PROFILE_ENABLED && !PROFILE_ENABLED_INVALID);

// Catalog resolution: an explicit path, then the checkout the host is working in,
// then the version-matched snapshot jev-setup.sh installs beside the harness, and
// only last a legacy side clone (which may be stale and must not shadow the others).
const CATALOG_SNAPSHOT = join(homedir(), '.agents', 'jev', 'skills.json');
const SHARED_SKILLS_ROOT = join(homedir(), '.agents', 'skills');
const CATALOG_CANDIDATES = [
  process.env.JEV_CATALOG_PATH,
  join(process.cwd(), '.agent-skills', 'skills.json'),
  CATALOG_SNAPSHOT,
  join(homedir(), '.agents', 'jeo-skills-repo', '.agent-skills', 'skills.json'),
].filter(Boolean);

// ── Backend registry ─────────────────────────────────────────────────────────
function kindConfiguredWith(read, kind, defaultKind) {
  switch (kind) {
    case 'api': return Boolean(read('api', 'JEV_API_KEY'));
    case 'local': return kindFilePresent.local || defaultKind === 'local' || Boolean(read('local', 'JEV_LOCAL_ENDPOINT'));
    case 'ollama': return kindFilePresent.ollama || defaultKind === 'ollama' || Boolean(read('ollama', 'JEV_OLLAMA_ENDPOINT'));
    case 'lmstudio': return kindFilePresent.lmstudio || defaultKind === 'lmstudio' || Boolean(read('lmstudio', 'JEV_LMSTUDIO_ENDPOINT'));
    case 'systemone': return Boolean(read('systemone', 'JEV_SYSTEMONE_ENDPOINT'));
    default: return false;
  }
}
function kindConfigured(kind) { return kindConfiguredWith(cfg, kind, DEFAULT_KIND); }
function kindConfiguredInFile(kind) { return kindConfiguredWith(cfgFile, kind, FILE_KIND); }
// Largest JSON-serialized state a backend can take without silent truncation
// (local server slices json.dumps(state) at 8,000 chars; AutoTrust serving
// truncates past ~1,024 tokens; generative chat contexts are small).
const MAX_STATE_CHARS = { api: 100000, local: 6000, ollama: 6000, lmstudio: 6000, systemone: { typesafe: 100000, decide: 3000, 'vllm-jev-decision': 3000 } };

function stripV1(url) { return String(url).replace(/\/+$/, '').replace(/\/v1$/, ''); }

export function describeBackend(kind, { model: modelOverride } = {}) {
  if (!BACKEND_KINDS.includes(kind)) return { kind, error: `Unknown backend kind: ${kind}` };
  const KIND = kind.toUpperCase();
  const legacyEndpoint = kind === DEFAULT_KIND ? cfg(kind, 'JEV_ENDPOINT') : undefined;
  const attestedModel = cfg(kind, `JEV_${KIND}_VALIDATED_MODEL`) || null;
  const base = { kind, configured: kindConfigured(kind), attestedModel, error: null };
  if (kind === 'api') {
    return { ...base, driver: 'typesafe', endpoint: legacyEndpoint || cfg('api', 'JEV_API_ENDPOINT') || DEFAULT_API_URL,
      model: modelOverride || cfg('api', 'JEV_API_MODEL') || 'jev-latest', apiKey: cfg('api', 'JEV_API_KEY') || null,
      choiceCap: CHOICE_CAPS.api, batch: true, timeoutMs: TIMEOUTS.api, maxStateChars: MAX_STATE_CHARS.api };
  }
  if (kind === 'local') {
    return { ...base, driver: 'local', endpoint: legacyEndpoint || cfg('local', 'JEV_LOCAL_ENDPOINT') || DEFAULT_LOCAL_URL,
      // Legacy single-file installs share JEV_LOCAL_MODEL with the generative kinds; only honor it here when it is scoped to `local`.
      model: modelOverride || (kindFilePresent.local || DEFAULT_KIND === 'local' ? cfg('local', 'JEV_LOCAL_MODEL') : null) || 'jev-9b-local', modelDir: cfg('local', 'JEV_LOCAL_MODEL_DIR') || null,
      choiceCap: CHOICE_CAPS.local, batch: true, timeoutMs: TIMEOUTS.local, maxStateChars: MAX_STATE_CHARS.local };
  }
  if (kind === 'ollama' || kind === 'lmstudio') {
    const endpoint = stripV1(legacyEndpoint || cfg(kind, `JEV_${KIND}_ENDPOINT`) || GEN_DEFAULTS[kind].endpoint);
    return { ...base, driver: 'generative', endpoint, model: modelOverride || cfg(kind, `JEV_${KIND}_MODEL`) || cfg(kind, 'JEV_LOCAL_MODEL') || null,
      choiceCap: CHOICE_CAPS[kind], batch: false, timeoutMs: TIMEOUTS[kind], maxStateChars: MAX_STATE_CHARS[kind], start: GEN_DEFAULTS[kind].start };
  }
  const driver = cfg('systemone', 'JEV_SYSTEMONE_DRIVER') || 'typesafe';
  const capRaw = cfg('systemone', 'JEV_SYSTEMONE_CHOICE_CAP');
  const cap = capRaw ? Number(capRaw) : CHOICE_CAPS.systemone[driver];
  const desc = { ...base, driver, endpoint: cfg('systemone', 'JEV_SYSTEMONE_ENDPOINT') || null,
    model: modelOverride || cfg('systemone', 'JEV_SYSTEMONE_MODEL') || null, apiKey: cfg('systemone', 'JEV_SYSTEMONE_API_KEY') || null,
    headJson: cfg('systemone', 'JEV_SYSTEMONE_HEAD_JSON') || null, calibrationJson: cfg('systemone', 'JEV_SYSTEMONE_CALIBRATION_JSON') || null,
    choiceCap: Number.isInteger(cap) && cap > 1 ? cap : CHOICE_CAPS.systemone[driver] || 16, batch: driver === 'typesafe',
    timeoutMs: TIMEOUTS.systemone[driver] || 60000, maxStateChars: MAX_STATE_CHARS.systemone[driver] || 3000 };
  if (!SYSTEMONE_DRIVERS.includes(driver)) desc.error = `Invalid JEV_SYSTEMONE_DRIVER: ${driver}`;
  else if (desc.configured && !desc.model) desc.error = 'JEV_SYSTEMONE_MODEL is required';
  else if (desc.configured && driver === 'vllm-jev-decision' && (!desc.headJson || !desc.calibrationJson)) desc.error = 'vllm-jev-decision requires JEV_SYSTEMONE_HEAD_JSON and JEV_SYSTEMONE_CALIBRATION_JSON';
  return desc;
}

// Configuration validity. The saved file is judged on its own contents: a
// present file that configures no valid backend is invalid (exit 3), never
// silently inactive. Ambient env may fully configure a backend on its own
// (then file errors are ignored) or suppress a saved key (then inactive), but
// switching JEV_MODE away from a saved opt-in without configuring the new
// kind is invalid, not a bypass.
const DEFAULT_KIND_VALID = BACKEND_KINDS.includes(DEFAULT_KIND);
const FILE_KIND_VALID = BACKEND_KINDS.includes(FILE_KIND);
function opKeys(op) {
  const key = OP_KEY[op];
  const primary = cfg(null, `JEV_${key}_BACKEND`) || null;
  const fallbackRaw = cfg(null, `JEV_${key}_FALLBACK`);
  const fallback = fallbackRaw ? String(fallbackRaw).split(',').map(s => s.trim()).filter(Boolean) : [];
  return { primary, fallback };
}
function policyErrors() {
  const errors = [];
  for (const op of OPERATIONS) {
    const { primary, fallback } = opKeys(op);
    for (const kind of [primary, ...fallback].filter(Boolean)) {
      if (!BACKEND_KINDS.includes(kind)) errors.push(`JEV_${OP_KEY[op]}_${primary === kind ? 'BACKEND' : 'FALLBACK'} names unknown backend '${kind}'`);
    }
  }
  return errors;
}
const POLICY_ERRORS = policyErrors();
const MERGED_CONFIGURED = DEFAULT_KIND_VALID && kindConfigured(DEFAULT_KIND);
const FILE_CONFIGURED = FILE_KIND_VALID && kindConfiguredInFile(FILE_KIND);
const ENV_MODE_SWITCHED = Boolean(process.env.JEV_MODE) && process.env.JEV_MODE !== FILE_KIND;
const CONFIG_ERROR = PROFILE_ENABLED_INVALID
  ? 'JEV_ENABLED must be true or false'
  : MERGED_CONFIGURED
    ? (POLICY_ERRORS[0] || null)
    : envReadError
      ? envReadError
      : !DEFAULT_KIND_VALID
        ? `Invalid JEV_MODE: ${DEFAULT_KIND}`
        : POLICY_ERRORS.length
          ? POLICY_ERRORS[0]
          : baseFilePresent && (!FILE_CONFIGURED || ENV_MODE_SWITCHED)
            ? 'Incomplete or invalid Jev configuration file'
            : null;
const ACTIVE = PROFILE
  ? PROFILE_ENABLED || PROFILE_ENABLED_INVALID
  : DEFAULT_KIND === 'api' ? Boolean(cfg('api', 'JEV_API_KEY')) : DEFAULT_KIND_VALID;

// ── Chain resolution ─────────────────────────────────────────────────────────
export function buildChain({ primary, fallback = [], override = null }) {
  if (override) return { chain: [override], primary: override, fallback: [], overridden: true };
  const seen = new Set();
  const chain = [];
  for (const kind of [primary, ...fallback]) {
    if (kind && !seen.has(kind)) { seen.add(kind); chain.push(kind); }
  }
  return { chain, primary, fallback: chain.slice(1), overridden: false };
}

export function resolveChain(op, { override = null } = {}) {
  if (!OPERATIONS.includes(op)) throw new Error(`Unknown operation: ${op}`);
  const { primary, fallback } = opKeys(op);
  return buildChain({ primary: primary || DEFAULT_KIND, fallback, override });
}

// ── Canonical questions ──────────────────────────────────────────────────────
export function noul(instructions, criteria) { return criteria ? { type: 'noul', instructions, criteria } : { type: 'noul', instructions }; }
export function choice(instructions, optionsOrMap) {
  const criteria = Array.isArray(optionsOrMap) ? Object.fromEntries(optionsOrMap.map(o => [o, null])) : { ...optionsOrMap };
  return { type: 'choice', instructions, criteria };
}
function optionsOf(question) { return Object.keys(question.criteria || {}); }
function asText(value) { return typeof value === 'string' ? value : JSON.stringify(value); }
function choiceConfidence(probabilities) {
  const values = Object.values(probabilities);
  const n = values.length;
  if (n <= 1) return 1;
  const pmax = Math.max(...values);
  return Math.max(0, Math.min(1, (pmax - 1 / n) / (1 - 1 / n)));
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function timeoutError(timeoutMs, what) {
  const error = new Error(`Timeout after ${timeoutMs}ms${what ? ` (${what})` : ''}`);
  error.name = 'TimeoutError';
  error.timeoutMs = timeoutMs;
  return error;
}
function isTimeout(error) { return error?.name === 'AbortError' || error?.name === 'TimeoutError'; }
async function fetchWithTimeout(url, options = {}, timeoutMs = 3000, what = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let payload = null;
    let text = '';
    if (response.ok) payload = await response.json();
    else { try { text = (await response.text()).slice(0, 200); } catch { text = ''; } }
    return { response, payload, text };
  } catch (error) {
    // Report the deadline that actually elapsed, not the operation budget.
    if (error.name === 'AbortError') throw timeoutError(timeoutMs, what);
    throw error;
  } finally { clearTimeout(timer); }
}
function httpError(response, text) { return new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`); }
function postJson(url, body, headers, timeoutMs) {
  return fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, timeoutMs);
}

// ── Drivers (each returns { model, answers, usage? } or throws) ──────────────
async function driverTypesafe(backend, state, questions, timeoutMs) {
  if (backend.kind === 'api' && !backend.apiKey) throw new Error('Missing JEV_API_KEY');
  if (!backend.endpoint) throw new Error('Missing JEV_SYSTEMONE_ENDPOINT');
  if (!backend.model) throw new Error('Missing model id');
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'choice' && optionsOf(q).length > backend.choiceCap) throw new Error(`Choice '${id}' has ${optionsOf(q).length} options; ${backend.kind} cap is ${backend.choiceCap}`);
  }
  const headers = backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
  const wire = {};
  for (const [id, q] of Object.entries(questions)) {
    wire[id] = q.type === 'choice'
      ? { type: 'choice', instructions: q.instructions, criteria: q.criteria }
      : q.criteria ? { type: 'noul', instructions: q.instructions, criteria: q.criteria } : { type: 'noul', instructions: q.instructions };
  }
  const { response, payload, text } = await postJson(backend.endpoint, { state, model: backend.model, questions: wire }, headers, timeoutMs);
  if (!response.ok) throw httpError(response, text);
  // The served model id comes only from the response; a missing id leaves the
  // served identity unknown so attestation can never match it.
  return { model: typeof payload?.model === 'string' && payload.model ? payload.model : null, answers: normalizeAnswers(payload, questions), usage: payload?.usage };
}

async function driverLocal(backend, state, questions, timeoutMs) {
  const wire = {};
  for (const [id, q] of Object.entries(questions)) {
    wire[id] = q.type === 'choice' ? { type: 'choice', instructions: q.instructions, options: optionsOf(q) } : { type: 'noul', instructions: q.instructions };
  }
  // The real server ignores `model`; the documented shape requires it, so send it.
  const { response, payload, text } = await postJson(backend.endpoint, { state, model: backend.model, questions: wire }, {}, timeoutMs);
  if (!response.ok) throw httpError(response, text);
  return { model: typeof payload?.model === 'string' && payload.model ? payload.model : null, answers: normalizeAnswers(payload, questions, { legacy: true }) };
}

// AutoTrust `serve_decide.py` (JEV-9B/27B `vl/`): POST /v1/decide {kind, state (string|object|list),
// question, options?, strategy?, thinking?} → {kind, options, probabilities, choice, choice_index,
// model, usage, ...}. `thinking: "off"` pins the pure System 1 distribution — the only one an
// attestation can cover; "auto"/"on" blend in System 2 and change the calibration.
async function driverDecide(backend, state, questions, timeoutMs) {
  if (!backend.endpoint) throw new Error('Missing JEV_SYSTEMONE_ENDPOINT');
  const base = stripV1(backend.endpoint);
  const headers = backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
  const answers = {};
  let model = null; // served identity only if every response names the same model
  for (const [id, q] of Object.entries(questions)) {
    const isChoice = q.type === 'choice';
    const options = isChoice ? optionsOf(q) : ['false', 'true'];
    if (isChoice && (options.length < 2 || options.length > backend.choiceCap)) throw new Error(`Choice '${id}' has ${options.length} options; decide accepts 2..${backend.choiceCap}`);
    let question = asText(q.instructions);
    if (isChoice && Object.values(q.criteria).some(v => v !== null && v !== undefined)) {
      question += '\nOptions:\n' + options.map(o => `- ${o}: ${q.criteria[o] === null || q.criteria[o] === undefined ? '' : asText(q.criteria[o])}`).join('\n');
    }
    const body = { kind: isChoice ? 'choice' : 'noul', state, question, thinking: 'off', ...(isChoice ? { options } : {}) };
    const { response, payload, text } = await postJson(`${base}/v1/decide`, body, headers, timeoutMs);
    if (!response.ok) throw httpError(response, text);
    if (!Array.isArray(payload?.options) || !Array.isArray(payload?.probabilities) || payload.options.length !== payload.probabilities.length) throw new Error(`Malformed /v1/decide response for ${id}`);
    if (payload.thinking && payload.thinking.used === true) throw new Error(`/v1/decide blended System 2 into ${id}; attested System 1 requires thinking off`);
    const served = typeof payload.model === 'string' && payload.model ? payload.model : null;
    model = Object.keys(answers).length === 0 ? served : (model === served ? model : null);
    const probabilities = {};
    payload.options.forEach((opt, i) => { probabilities[opt] = payload.probabilities[i]; });
    if (isChoice) {
      for (const opt of options) {
        const p = probabilities[opt];
        if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`Model returned invalid probability for ${id}/${opt}`);
      }
      const ordered = Object.fromEntries(options.map(o => [o, probabilities[o]]));
      const best = Object.entries(ordered).sort((a, b) => b[1] - a[1])[0];
      answers[id] = { choice: best[0], probabilities: ordered, confidence: choiceConfidence(ordered) };
    } else {
      const p = probabilities.true;
      if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`Model returned invalid probability for ${id}`);
      answers[id] = evaluateNoul(p);
    }
  }
  return { model, answers };
}

const vllmAssets = new Map();
async function loadVllmAssets(backend) {
  const key = `${backend.headJson}|${backend.calibrationJson}`;
  if (vllmAssets.has(key)) return vllmAssets.get(key);
  const head = JSON.parse(await readFile(backend.headJson, 'utf8'));
  const calibration = JSON.parse(await readFile(backend.calibrationJson, 'utf8'));
  if (!head?.slots?.ranges || !Array.isArray(head.verbalizer_ids) || !Array.isArray(head.bias)) throw new Error('Malformed JEV_SYSTEMONE_HEAD_JSON');
  if (!calibration?.per_kind) throw new Error('Malformed JEV_SYSTEMONE_CALIBRATION_JSON');
  const assets = { head, calibration };
  vllmAssets.set(key, assets);
  return assets;
}

async function driverVllmDecision(backend, state, questions, timeoutMs) {
  if (!backend.endpoint) throw new Error('Missing JEV_SYSTEMONE_ENDPOINT');
  const { head, calibration } = await loadVllmAssets(backend);
  const base = stripV1(backend.endpoint);
  const headers = backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
  const stateText = asText(state);
  const answers = {};
  let served = null;
  for (const [id, q] of Object.entries(questions)) {
    const isChoice = q.type === 'choice';
    const kind = isChoice ? 'choice' : 'noul';
    const options = isChoice ? optionsOf(q) : ['false', 'true'];
    if (isChoice && options.length > backend.choiceCap) throw new Error(`Choice '${id}' has ${options.length} options; vllm-jev-decision cap is ${backend.choiceCap}`);
    const lines = isChoice ? options.map((o, i) => `${'ABCDEFGHIJKLMNOP'[i]}) ${o}${q.criteria[o] ? ` — ${asText(q.criteria[o])}` : ''}`) : options;
    const prompt = `[kind] ${kind}\n[state] ${stateText}\n[question] ${asText(q.instructions)}\n[options]\n${lines.join('\n')}\n[decision]:`;
    const slot = head.slots.ranges[kind]?.[0];
    if (!Number.isInteger(slot) || slot < 0) throw new Error(`Decision head has no slot range for ${kind}`);
    const ids = head.verbalizer_ids.slice(slot, slot + options.length);
    const biases = head.bias.slice(slot, slot + options.length);
    if (ids.length !== options.length || ids.some(t => !Number.isInteger(t)) || biases.length !== options.length || biases.some(b => !Number.isFinite(Number(b)))) {
      throw new Error(`Decision head slots ${slot}..${slot + options.length - 1} are incomplete for ${kind}`);
    }
    const T = Number(calibration.per_kind[kind]);
    if (!Number.isFinite(T) || T <= 0) throw new Error(`Calibration temperature for ${kind} must be a positive number`);
    // Mirrors AutoTrust serve_decide.py `READ`: the sampling overrides defeat any
    // generation_config top_p/top_k/min_p/repetition filtering that would otherwise
    // reshape the processed logprobs and silently break the head's calibration.
    const body = { model: backend.model, prompt, max_tokens: 1, temperature: 1.0, top_p: 1.0, top_k: 0, min_p: 0.0, repetition_penalty: 1.0,
      logprobs: options.length, allowed_token_ids: ids, add_special_tokens: false, return_tokens_as_token_ids: true };
    const { response, payload, text } = await postJson(`${base}/v1/completions`, body, headers, timeoutMs);
    if (!response.ok) throw httpError(response, text);
    const top = payload?.choices?.[0]?.logprobs?.top_logprobs?.[0];
    if (!top || typeof top !== 'object') throw new Error(`Malformed /v1/completions logprobs for ${id}`);
    const lp = {};
    for (const [k, v] of Object.entries(top)) { const m = String(k).match(/(\d+)$/); if (m) lp[Number(m[1])] = v; }
    // Every option token must carry a finite logprob; a missing one would turn
    // into near-certainty under softmax, so it is a malformed response.
    const missing = ids.filter(tok => !Number.isFinite(lp[tok]));
    if (missing.length) throw new Error(`Malformed /v1/completions response for ${id}: no logprob for token id(s) ${missing.join(', ')}`);
    const z = ids.map((tok, i) => (lp[tok] + Number(biases[i])) / T);
    const max = Math.max(...z);
    const e = z.map(x => Math.exp(x - max));
    const sum = e.reduce((a, b) => a + b, 0);
    const probabilities = Object.fromEntries(options.map((o, i) => [o, e[i] / sum]));
    const named = typeof payload?.model === 'string' && payload.model ? payload.model : null;
    served = Object.keys(answers).length === 0 ? named : (served === named ? served : null);
    if (isChoice) {
      const best = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
      answers[id] = { choice: best[0], probabilities, confidence: choiceConfidence(probabilities) };
    } else answers[id] = evaluateNoul(probabilities.true);
  }
  return { model: served, answers };
}

// Generative backends (quantized GGUF via ollama / LM Studio) speak chat
// completions; the harness asks for JSON probabilities. This is a System 2
// path and is never calibrated; it stays tier 'unvalidated'.
async function resolveGenModel(backend, timeoutMs = 3000) {
  const { response, payload } = await fetchWithTimeout(`${backend.endpoint}/v1/models`, {}, timeoutMs, 'model list');
  if (!response.ok) throw new Error(`model list responded ${response.status}`);
  const data = payload?.data;
  if (!Array.isArray(data)) throw new Error('malformed model list');
  const ids = data.map(m => m.id).filter(id => typeof id === 'string');
  const pick = backend.model || GEN_DEFAULTS[backend.kind].model || ids.find(id => /jev/i.test(id));
  if (!pick || !ids.includes(pick)) throw new Error(`Jev model not available${pick ? `: ${pick}` : '; load JEV-9B or explicitly pin JEV_LOCAL_MODEL'}`);
  return pick;
}

async function chatOnce(backend, system, user, timeoutMs, model) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let content;
  if (backend.kind === 'ollama') {
    const { response, payload, text } = await postJson(`${backend.endpoint}/api/chat`, { model, stream: false, think: false, options: { temperature: 0, num_predict: 400 }, messages }, {}, timeoutMs);
    if (!response.ok) throw httpError(response, text);
    content = payload?.message?.content;
  } else {
    const { response, payload, text } = await postJson(`${backend.endpoint}/v1/chat/completions`, { model, temperature: 0, max_tokens: 2048, messages }, {}, timeoutMs);
    if (!response.ok) throw httpError(response, text);
    content = payload?.choices?.[0]?.message?.content;
  }
  if (typeof content !== 'string') throw new Error('Malformed chat completion (no message content)');
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model output: ${content.slice(0, 120)}`);
  return JSON.parse(match[0]);
}

async function driverGenerative(backend, state, questions, timeoutMs) {
  const model = await resolveGenModel(backend, Math.min(timeoutMs, 3000));
  const stateJSON = JSON.stringify(state);
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'choice') {
      const options = optionsOf(q);
      if (options.length > backend.choiceCap) throw new Error(`Choice '${id}' has ${options.length} options; ${backend.kind} cap is ${backend.choiceCap}`);
      const system = 'You are JEV System One, a calibrated decision model. Respond ONLY with a JSON object {"probabilities": {"<option>": <0..1 relevance>}} covering every listed option. No prose.';
      const rubric = Object.values(q.criteria).some(v => v) ? `\nOption descriptions: ${JSON.stringify(q.criteria)}` : '';
      const parsed = await chatOnce(backend, system, `${asText(q.instructions)}\nOptions: ${JSON.stringify(options)}${rubric}\nState: ${stateJSON}`, timeoutMs, model);
      const probabilities = {};
      for (const opt of options) {
        const p = parsed.probabilities?.[opt];
        if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`Model returned invalid probability for ${id}/${opt}`);
        probabilities[opt] = p;
      }
      const best = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
      answers[id] = { choice: best && best[1] > 0 ? best[0] : undefined, probabilities, confidence: choiceConfidence(probabilities) };
    } else {
      const system = 'You are JEV System One, a calibrated decision model. Respond ONLY with a JSON object {"probability": <0..1>} — the probability that the answer to the question is yes. No prose.';
      const parsed = await chatOnce(backend, system, `Question: ${asText(q.instructions)}\nState: ${stateJSON}`, timeoutMs, model);
      const p = parsed.probability ?? parsed.prob ?? parsed.yes_probability;
      if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`Model returned invalid probability for ${id}`);
      answers[id] = evaluateNoul(p);
    }
  }
  return { model, answers };
}

const DRIVERS = { typesafe: driverTypesafe, local: driverLocal, decide: driverDecide, 'vllm-jev-decision': driverVllmDecision, generative: driverGenerative };

// Only drivers that read a calibrated decision head can ever be attested:
// hosted/compatible `/v1/systemone`, AutoTrust `/v1/decide`, and the vLLM
// `jev-decision` logprob head. `generative` (JSON-from-chat) and `local`
// (base-model logits) are System 2 paths and stay unvalidated no matter what
// JEV_<KIND>_VALIDATED_MODEL says.
const ATTESTABLE_DRIVERS = new Set(['typesafe', 'decide', 'vllm-jev-decision']);
export function attestationEligible(backend) { return ATTESTABLE_DRIVERS.has(backend?.driver); }
function tierFor(backend, servedModel) {
  if (!backend.attestedModel) return { tier: 'unvalidated', attestation: null };
  if (!attestationEligible(backend)) return { tier: 'unvalidated', attestation: { model: backend.attestedModel, matched: null, eligible: false, state: 'ineligible' } };
  // Attestation compares the operator's pinned id with the model the backend
  // actually reported serving; an unknown served identity never matches.
  const matched = typeof servedModel === 'string' && servedModel === backend.attestedModel;
  return { tier: matched ? 'validated' : 'unvalidated', attestation: { model: backend.attestedModel, matched, eligible: true, ...(matched ? {} : { state: 'stale' }) } };
}
function backendSummary(backend, servedModel) {
  const { tier, attestation } = tierFor(backend, servedModel);
  return { kind: backend.kind, driver: backend.driver, model: typeof servedModel === 'string' ? servedModel : null, configuredModel: backend.model ?? null, tier, attestation };
}

// A question may carry its own `state` (a subset of the shared state it needs).
// Batch-capable hosted drivers ignore that and send one request with the shared
// state. Per-question drivers, and `local` (whose server slices the shared state
// at 8,000 chars), are called once per distinct scoped state so no question is
// ever judged against an input it cannot see. Wire questions never carry `state`.
function stripScope(questions) {
  return Object.fromEntries(Object.entries(questions).map(([id, q]) => { const { state: _state, ...wire } = q; return [id, wire]; }));
}
export function groupByScope(state, questions, backend) {
  const scoped = !backend.batch || backend.kind === 'local';
  if (!scoped) return [{ state, questions: stripScope(questions) }];
  const groups = new Map();
  for (const [id, q] of Object.entries(questions)) {
    const own = q.state === undefined ? state : q.state;
    const key = q.state === undefined ? '\u0000shared' : JSON.stringify(own);
    if (!groups.has(key)) groups.set(key, { state: own, questions: {} });
    const { state: _state, ...wire } = q;
    groups.get(key).questions[id] = wire;
  }
  return [...groups.values()];
}
async function dispatchGroups(driver, backend, state, questions, budget) {
  const groups = groupByScope(state, questions, backend);
  const answers = {};
  let model;
  let usage = null;
  // Validate every effective state before network I/O: a backend that silently
  // truncates (local 8,000 chars, AutoTrust ~1,024 tokens) or a context that
  // overflows would otherwise judge input the model never saw. The state is
  // never trimmed here; the caller's explicit fallback chain may try a
  // larger-context backend.
  for (const group of groups) {
    const chars = JSON.stringify(group.state).length;
    if (Number.isFinite(backend.maxStateChars) && chars > backend.maxStateChars) {
      throw new Error(`state too large for ${backend.kind}${backend.driver && backend.driver !== backend.kind ? `/${backend.driver}` : ''}: ${chars} chars exceeds ${backend.maxStateChars}; input was not trimmed`);
    }
  }
  for (const group of groups) {
    const result = await driver(backend, group.state, group.questions, budget);
    Object.assign(answers, result.answers);
    model = model === undefined ? (result.model ?? null) : (model === (result.model ?? null) ? model : null);
    if (result.usage) usage = usage ? { input_tokens: (usage.input_tokens || 0) + (result.usage.input_tokens || 0), output_tokens: (usage.output_tokens || 0) + (result.usage.output_tokens || 0) } : result.usage;
  }
  return { model: model ?? null, answers, usage, requests: groups.length };
}

// ── Dispatcher: resolves the operation chain and tries each eligible kind ────
export async function requestJev(state, questions, { op = 'review', mock = false, timeoutMs, override = null, kinds = null, model = null } = {}) {
  if (mock) return { model: 'jev-mock', source: 'mock', backend: { kind: 'mock', driver: 'mock', model: 'jev-mock', tier: 'mock', attestation: null }, attempted: [], error: null, latencyMs: 0, answers: simulateAnswers(state, questions) };
  const fail = (error, kind = DEFAULT_KIND) => ({ model: null, source: kind, backend: { kind, driver: null, model: null, configuredModel: null, tier: 'unvalidated', attestation: null }, attempted: [], attemptDetails: [], error, latencyMs: 0, answers: null });
  if (PROFILE_ERROR) return fail(PROFILE_ERROR);
  if (PROFILE_DISABLED) return fail(`Jev profile '${PROFILE}' is disabled`);
  if (CONFIG_ERROR) return fail(CONFIG_ERROR);
  const chain = kinds ? kinds : resolveChain(op, { override }).chain;
  const attemptDetails = [];
  const attempted = [];
  const started = Date.now();
  for (const kind of chain) {
    const backend = describeBackend(kind, { model });
    const record = { kind, error: null };
    attemptDetails.push(record);
    attempted.push(kind);
    if (backend.error) { record.error = backend.error; continue; }
    if (!backend.configured) { record.error = `${kind} is not configured for this ${PROFILE ? `profile '${PROFILE}'` : 'installation'}`; continue; }
    const driver = DRIVERS[backend.driver];
    const budget = timeoutMs ?? backend.timeoutMs;
    try {
      const result = await dispatchGroups(driver, backend, state, questions, budget);
      return { ...result, source: kind, backend: backendSummary(backend, result.model), attempted, attemptDetails, error: null, latencyMs: Date.now() - started };
    } catch (error) {
      record.error = String(error.message || error);
    }
  }
  const primary = chain[0];
  const message = attemptDetails.length ? attemptDetails.map(a => `${a.kind}: ${a.error}`).join('; ') : 'no backend in chain';
  return { model: null, source: primary, backend: { kind: primary, driver: null, model: null, configuredModel: null, tier: 'unvalidated', attestation: null }, attempted, attemptDetails, error: message, latencyMs: Date.now() - started, answers: null };
}

// ── Answer normalization (documented TypeSafe shape; legacy for `local`) ────
function normalizeAnswers(payload, questions, { legacy = false } = {}) {
  const raw = payload?.answers || payload?.results || payload || {};
  const result = {};
  for (const id of Object.keys(questions)) {
    const item = raw[id];
    if (questions[id]?.type === 'choice') {
      const options = optionsOf(questions[id]);
      if (!item || (item.choice === undefined && !item.probabilities)) throw new Error(`Malformed Jev response: missing choice for ${id}`);
      if (item.choice !== undefined) {
        const choices = Array.isArray(item.choice) ? item.choice : [item.choice];
        if (choices.some(c => !options.includes(c))) throw new Error(`Malformed Jev response: invalid choice for ${id}`);
      }
      if (item.probabilities !== undefined && (!item.probabilities || options.some(option => !Number.isFinite(item.probabilities[option]) || item.probabilities[option] < 0 || item.probabilities[option] > 1))) {
        throw new Error(`Malformed Jev response: invalid choice probabilities for ${id}`);
      }
      if ((item.choice === undefined || (Array.isArray(item.choice) && item.choice.length === 0)) && !options.some(option => item.probabilities?.[option] >= 0.2)) {
        throw new Error(`Malformed Jev response: no selected choice for ${id}`);
      }
      const probabilities = item.probabilities ? Object.fromEntries(options.map(o => [o, item.probabilities[o]])) : null;
      let selected = item.choice;
      if (selected === undefined && probabilities) selected = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
      const confidence = Number.isFinite(item.confidence) ? item.confidence : probabilities ? choiceConfidence(probabilities) : 1;
      result[id] = { choice: selected, probabilities, confidence };
      continue;
    }
    const prob = typeof item === 'number' ? item
      : legacy ? (item?.probability ?? item?.noul ?? item?.prob ?? item?.yes_probability)
        : (item?.noul ?? item?.probability ?? item?.prob ?? item?.yes_probability);
    if (!Number.isFinite(prob) || prob < 0 || prob > 1) throw new Error(`Malformed Jev response: invalid probability for ${id}`);
    result[id] = evaluateNoul(prob);
  }
  return result;
}

// ── Contract logic (unchanged) ───────────────────────────────────────────────
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

// A permit is only authoritative when the answering backend is attested
// (tier 'validated'). Mock and unvalidated tiers degrade to proposal_only.
export function applyTierPolicy(decision, backend) {
  if (decision.verdict !== 'permit') return decision;
  if (backend?.tier === 'validated') return decision;
  const why = backend?.tier === 'mock'
    ? 'Mock mode cannot authorize autonomous execution'
    : `Backend tier '${backend?.tier || 'unvalidated'}' cannot authorize autonomous execution${backend?.attestation && !backend.attestation.matched ? ' (attestation stale: served model differs from JEV_<KIND>_VALIDATED_MODEL)' : ''}`;
  return { ...decision, verdict: 'proposal_only', reason: `${why} (would permit: ${decision.reason})` };
}

export function generateReceiptBinding(task, proposal, decision, backend = null) {
  const payload = JSON.stringify({ v: RECEIPT_VERSION, task, proposal, decision, backend: backend ? { kind: backend.kind, model: backend.model, tier: backend.tier } : null });
  return createHash('sha256').update(payload).digest('hex');
}

export const QUESTION_SET_V4 = {
  addresses_task: { type: 'noul', instructions: 'Does this proposed change directly address the stated task?' },
  evidence_supports: { type: 'noul', instructions: 'Does the provided evidence support this proposed change?' },
  unrelated_changes: { type: 'noul', instructions: 'Does this proposal contain unrelated changes?' },
  needs_clarification: { type: 'noul', instructions: 'Does the task require clarification before taking this action?' },
};

// ── Mock answers (offline, deterministic, proposal-biased) ───────────────────
function simulateAnswers(state, questions) {
  const text = JSON.stringify(state).toLowerCase();
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === 'choice') {
      const options = optionsOf(q);
      const scores = options.map(o => 1 + (text.includes(String(o).toLowerCase().split('/').pop()) ? 4 : 0));
      const sum = scores.reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(options.map((o, i) => [o, scores[i] / sum]));
      const best = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0];
      answers[id] = { choice: best ? best[0] : undefined, probabilities, confidence: choiceConfidence(probabilities) };
      continue;
    }
    let p = 0.5;
    if (id === 'addresses_task') p = /task|proposal|patch|change|request/.test(text) ? 0.93 : 0.58;
    else if (id === 'evidence_supports') p = /evidence|diff|patch|validation|file|code/.test(text) ? 0.92 : 0.56;
    else if (id === 'unrelated_changes') p = /unrelated|scope creep|out of scope/.test(text) ? 0.9 : 0.04;
    else if (id === 'needs_clarification') p = /ambiguous|unclear|clarification|not specified/.test(text) ? 0.91 : 0.04;
    else if (id.startsWith('essential::')) p = 0.5;
    answers[id] = evaluateNoul(p);
  }
  return answers;
}

// ── Catalog ──────────────────────────────────────────────────────────────────
async function loadCatalog() {
  const errors = [];
  for (const candidate of CATALOG_CANDIDATES) {
    let catalog;
    try { catalog = JSON.parse(await readFile(candidate, 'utf8')); }
    catch (err) { errors.push(`${candidate}: ${err.message}`); continue; }
    try {
      if (!Array.isArray(catalog.skills) || !catalog.categories || typeof catalog.categories !== 'object') throw new Error('Unexpected skills catalog schema');
      for (const skill of catalog.skills) if (!skill.name || !skill.category || !skill.description) throw new Error(`Malformed skill entry in catalog (${skill.name || '<unnamed>'})`);
      if (catalog.model_policies !== undefined && (typeof catalog.model_policies !== 'object' || Array.isArray(catalog.model_policies))) throw new Error('model_policies must be an object');
      return { ...catalog, __path: candidate };
    } catch (err) { errors.push(`${candidate}: ${err.message}`); }
  }
  throw new Error(`Cannot load a valid skills catalog. Tried:\n  ${errors.join('\n  ')}`);
}

// Excerpts come from the catalog's own tree: the checkout for a checkout catalog,
// or the shared skills root (where catalog installs place SKILL.md) for the
// snapshot jev-setup.sh installs. Excerpts are sent to the answering backend, so
// containment is checked on canonical paths: neither `../` in an untrusted catalog
// nor an in-root symlink (directory or SKILL.md) may reach a file outside the root.
async function skillExcerpt(catalog, skill) {
  if (typeof skill.path !== 'string' || !skill.path) return '';
  try {
    const root = await realpath(catalog.__path === CATALOG_SNAPSHOT ? SHARED_SKILLS_ROOT : dirname(catalog.__path));
    const file = await realpath(resolve(root, skill.path));
    if (!file.startsWith(root + sep) || basename(file) !== 'SKILL.md') return '';
    const text = await readFile(file, 'utf8');
    const body = text.replace(/^---[\s\S]*?\n---\s*\n?/, '');
    return body.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS);
  } catch { return ''; }
}

// ── Skill selection ──────────────────────────────────────────────────────────
function tokenEstimate(text) { return Math.ceil(text.length / 4); }
export function taskTerms(task) {
  const terms = task.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [];
  return [...new Set(terms.filter(t => t.length > 1 && !STOPWORDS.has(t)))];
}
export function scoreSkill(skill, task) {
  const terms = Array.isArray(task) ? task : taskTerms(task);
  const name = skill.name.toLowerCase();
  const corpus = `${skill.description} ${(skill.tags || []).join(' ')} ${skill.keyword || ''}`.toLowerCase();
  return terms.reduce((score, term) => score + (name.includes(term) ? 3 : 0) + (corpus.includes(term) ? 1 : 0), 0);
}
export function selectionStrategy(catalogSize, choiceCap) {
  const shards = Math.max(1, Math.ceil(catalogSize / Math.max(2, choiceCap || 2)));
  return { strategy: shards <= MAX_CHOICE_SHARDS ? 'sharded' : 'shortlist', shards };
}
function chunk(items, parts) {
  const size = Math.ceil(items.length / parts);
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
const GATE_QUESTIONS = {
  'gate::acts_on_user_system': noul('Is the assistant being asked to act on the user\'s files, accounts, devices, or online services, rather than only to explain or advise? The request is in `request`.'),
  'gate::would_follow_documented_procedure': noul('Would a careful expert answering the `request` consult a specific documented procedure or set of commands, rather than answering from general understanding?'),
  'gate::prose_suffices': noul('Could a knowledgeable generalist fully satisfy the `request` in prose, with no tools, no documentation, and no access to the user\'s files or accounts?'),
};
const INVERTED_GATES = new Set(['gate::prose_suffices']);
function gateFrom(answers) {
  const values = {};
  const oriented = [];
  for (const key of Object.keys(GATE_QUESTIONS)) {
    const p = answers[key]?.probability;
    if (!Number.isFinite(p)) continue;
    values[key.replace('gate::', '')] = p;
    oriented.push(INVERTED_GATES.has(key) ? 1 - p : p);
  }
  return { value: oriented.length ? oriented.reduce((a, b) => a + b, 0) / oriented.length : null, threshold: GATE_THRESHOLD, values };
}
function describeFor(skill, excerpt) {
  return excerpt ? `${skill.description} — ${excerpt}` : skill.description;
}
// Shrink the candidate state until its serialized form fits the backend's
// limit (the `which` question needs every candidate in one state). Shrinking is
// measured on the real JSON, excerpts first, then descriptions; names and the
// request are never cut, so an irreducible overflow is a loud error — the
// caller treats it as that backend's failure and may fall back.
export function budgetCandidates(task, candidates, maxStateChars) {
  const size = s => JSON.stringify(s).length;
  const render = (ex, desc) => ({ request: task, candidates: candidates.map(c => ({ name: c.name, description: (c.description || '').slice(0, desc), excerpt: (c.excerpt || '').slice(0, ex) })) });
  let ex = EXCERPT_CHARS;
  let state = render(ex, Infinity);
  while (size(state) > maxStateChars && ex > 0) { ex = Math.floor(ex / 2); state = render(ex, Infinity); }
  if (size(state) <= maxStateChars) return state;
  let desc = Math.max(0, ...candidates.map(c => (c.description || '').length));
  while (size(state) > maxStateChars && desc > 0) { desc = Math.floor(desc / 2); state = render(0, desc); }
  if (size(state) <= maxStateChars) return state;
  throw new Error(`route-skills state cannot fit this backend: request plus ${candidates.length} candidate names serialize to ${size(render(0, 0))} chars, limit ${maxStateChars}; shorten the task or use a backend with a larger state limit`);
}
function gateQuestions(task) {
  return Object.fromEntries(Object.entries(GATE_QUESTIONS).map(([id, q]) => [id, { ...q, state: { request: task } }]));
}
function verifyQuestions(task, budgeted, backend, { withGate = true } = {}) {
  // `which` sees every candidate; each `fits::<name>` sees only its own candidate
  // (scoped state). Batch drivers still receive one request with the full state.
  // The gate is evaluated exactly once per route: the shortlist flow asks it here,
  // the sharded flow already asked (and enforced) it in its first request.
  const questions = withGate ? gateQuestions(task) : {};
  if (budgeted.candidates.length <= backend.choiceCap) {
    questions.which = { ...choice('Which of these candidate skills, if any, is the right one to load to help with the user\'s `request`? Read each candidate\'s full description in `candidates`.',
      Object.fromEntries(budgeted.candidates.map(c => [c.name, describeFor(c, c.excerpt)]))), state: budgeted };
  }
  for (const c of budgeted.candidates) {
    questions[`fits::${c.name}`] = { ...noul(`Does the skill \`${c.name}\` (described in \`candidates\`) genuinely do what the user's \`request\` asks for?`), state: { request: task, candidates: [c] } };
  }
  return questions;
}

async function selectSharded(catalog, task, backend, kind, shards, topK) {
  const groups = chunk(catalog.skills, shards);
  const questions = gateQuestions(task);
  groups.forEach((group, i) => {
    questions[`shard::${i}`] = { ...choice('Which of these skills, if any, is the right one to load to help with the user\'s `request`?',
      Object.fromEntries(group.map(s => [s.name, s.description.slice(0, SHARD_DESCRIPTION_CHARS)]))), state: { request: task } };
  });
  const first = await requestJev({ request: task }, questions, { op: 'route-skills', kinds: [kind], model: backend.modelOverride });
  if (first.error || !first.answers) return { error: first, envelope: first };
  const gate = gateFrom(first.answers);
  if (gate.value !== null && gate.value < GATE_THRESHOLD) return { gate, finalists: [], ranked: [], reason: 'gate', envelope: first, requests: first.requests ?? 1 };
  const byName = Object.fromEntries(catalog.skills.map(s => [s.name, s]));
  const finalists = [];
  groups.forEach((group, i) => {
    const probs = first.answers[`shard::${i}`]?.probabilities || {};
    Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, SHARD_FINALISTS).forEach(([name, p]) => finalists.push({ name, shard: i, shardProbability: p }));
  });
  const candidates = [];
  for (const f of finalists) candidates.push({ ...f, description: byName[f.name].description, excerpt: await skillExcerpt(catalog, byName[f.name]) });
  const budgeted = budgetCandidates(task, candidates, backend.maxStateChars);
  const second = await requestJev(budgeted, verifyQuestions(task, budgeted, backend, { withGate: false }), { op: 'route-skills', kinds: [kind], model: backend.modelOverride });
  if (second.error || !second.answers) return { error: second, envelope: second };
  const which = second.answers.which?.probabilities || {};
  const ranked = candidates.map(c => ({ name: c.name, fits: second.answers[`fits::${c.name}`]?.probability ?? 0, probability: which[c.name] ?? 0, shard: c.shard }));
  return { gate, finalists: ranked, ranked: rankCandidates(ranked), reason: null, envelope: second, requests: (first.requests ?? 1) + (second.requests ?? 1) };
}

async function selectShortlist(catalog, task, backend, kind, topK) {
  const terms = taskTerms(task);
  const scored = catalog.skills.map(s => ({ skill: s, score: scoreSkill(s, terms) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name)).slice(0, SHORTLIST_SIZE);
  if (!scored.length) return { gate: null, finalists: [], ranked: [], reason: 'shortlist-empty', envelope: null, requests: 0 };
  const candidates = [];
  for (const { skill, score } of scored) candidates.push({ name: skill.name, lexical: score, description: skill.description, excerpt: await skillExcerpt(catalog, skill) });
  const budgeted = budgetCandidates(task, candidates, backend.maxStateChars);
  const envelope = await requestJev(budgeted, verifyQuestions(task, budgeted, backend), { op: 'route-skills', kinds: [kind], model: backend.modelOverride });
  if (envelope.error || !envelope.answers) return { error: envelope, envelope };
  const gate = gateFrom(envelope.answers);
  if (gate.value !== null && gate.value < GATE_THRESHOLD) return { gate, finalists: [], ranked: [], reason: 'gate', envelope, requests: envelope.requests ?? 1 };
  const which = envelope.answers.which?.probabilities || null;
  const ranked = candidates.map(c => ({ name: c.name, fits: envelope.answers[`fits::${c.name}`]?.probability ?? 0, probability: which ? (which[c.name] ?? 0) : null, lexical: c.lexical }));
  return { gate, finalists: ranked, ranked: rankCandidates(ranked), reason: null, envelope, requests: envelope.requests ?? 1 };
}

function rankCandidates(items) {
  return items.filter(i => i.fits >= FITS_THRESHOLD)
    .sort((a, b) => ((b.probability ?? b.fits) - (a.probability ?? a.fits)) || (b.fits - a.fits) || a.name.localeCompare(b.name));
}

function selectMock(catalog, task, topK) {
  const terms = taskTerms(task);
  const scored = catalog.skills.map(s => ({ skill: s, score: scoreSkill(s, terms) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name)).slice(0, SHORTLIST_SIZE);
  const max = scored[0]?.score || 1;
  const sum = scored.reduce((n, x) => n + x.score, 0) || 1;
  const ranked = scored.map(({ skill, score }) => ({ name: skill.name, fits: score / max, probability: score / sum, lexical: score }));
  return { gate: { value: scored.length ? 1 : 0, threshold: GATE_THRESHOLD, values: {} }, finalists: ranked, ranked: rankCandidates(ranked), reason: scored.length ? null : 'shortlist-empty', envelope: null, requests: 0 };
}

function registryFallback(task, note) {
  return { skill: 'find-skills', command: `npx skills find '${task.replace(/'/g, "'\\''")}'`, note };
}

export async function routeSkills(task, { mock = false, topK = 3, override = null, model = null } = {}) {
  if (!task?.trim()) throw new Error('route-skills requires a task string');
  if (!Number.isInteger(topK) || topK < 1 || topK > 50) throw new Error('--top-k must be an integer from 1 to 50');
  const catalog = await loadCatalog();
  const byName = Object.fromEntries(catalog.skills.map(s => [s.name, s]));
  const fullTokens = catalog.skills.reduce((n, s) => n + tokenEstimate(`${s.name} ${s.description}`), 0);
  const base = { task, mode: mock ? 'mock' : 'jev', fullCatalogSkills: catalog.skills.length, estimatedFullTokens: fullTokens };

  let outcome = null;
  let selection = null;
  let backendUsed = null;
  let attempted = [];
  if (mock) {
    outcome = selectMock(catalog, task, topK);
    selection = { strategy: 'mock', choiceCap: null, shards: 0, requests: 0 };
    backendUsed = { kind: 'mock', driver: 'mock', model: 'jev-mock', configuredModel: 'jev-mock', tier: 'mock', attestation: null };
  } else {
    const chain = resolveChain('route-skills', { override }).chain;
    const errors = [];
    for (const kind of chain) {
      const backend = describeBackend(kind, { model });
      backend.modelOverride = model; // carried into every selection-stage request
      if (backend.error || !backend.configured) {
        errors.push({ kind, error: backend.error || `${kind} is not configured` });
        attempted.push(kind);
        continue;
      }
      const { strategy, shards } = selectionStrategy(catalog.skills.length, backend.choiceCap);
      let result;
      try {
        result = strategy === 'sharded'
          ? await selectSharded(catalog, task, backend, kind, shards, topK)
          : await selectShortlist(catalog, task, backend, kind, topK);
      } catch (error) {
        errors.push({ kind, error: String(error.message || error) }); attempted.push(kind); continue;
      }
      if (result.error) { errors.push({ kind, error: result.error.error }); attempted.push(kind); continue; }
      outcome = result;
      selection = { strategy, choiceCap: backend.choiceCap, shards: strategy === 'sharded' ? shards : 0, requests: result.requests ?? 0 };
      backendUsed = result.envelope ? result.envelope.backend : backendSummary(backend, null);
      attempted.push(kind);
      break;
    }
    if (!outcome) throw new Error(`Jev unavailable for skill routing: ${errors.map(e => `${e.kind}: ${e.error}`).join('; ') || 'no backend in chain'}`);
  }

  const top = outcome.ranked.slice(0, topK).map(r => ({ name: r.name, category: byName[r.name].category, description: byName[r.name].description, fits: round(r.fits), probability: r.probability === null || r.probability === undefined ? null : round(r.probability) }));
  const leanTokens = top.reduce((n, s) => n + tokenEstimate(`${s.name} ${s.description}`), 0);
  const reason = outcome.reason || (top.length ? null : 'fits');
  const result = {
    ...base,
    families: [...new Set(top.map(s => s.category))],
    topK: top,
    selection: { ...selection, gate: outcome.gate, finalists: outcome.finalists.map(f => ({ name: f.name, fits: round(f.fits), probability: f.probability === null || f.probability === undefined ? null : round(f.probability) })), reason },
    backend: backendUsed,
    attempted,
    estimatedTopKTokens: leanTokens,
    estimatedTokensSaved: fullTokens - leanTokens,
    estimatedSavingsPercent: fullTokens ? Math.round((fullTokens - leanTokens) / fullTokens * 100) : 0,
  };
  if (!top.length) {
    result.publicRegistryFallback = registryFallback(task, reason === 'gate'
      ? 'The request does not appear to need a skill (gate below threshold); if it does, search the public skills.sh registry with the find-skills skill (triage installs/source/stars before installing).'
      : 'No confident local catalog match; use the find-skills skill to search the public skills.sh registry (triage installs/source/stars before installing).');
  }
  result.routing = await routingAdvice(catalog, task, top, { mock, backendUsed, kind: backendUsed?.kind, model });
  return result;
}
function round(x) { return Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x; }

// ── Advisory host routing from skills.json model_policies ────────────────────
async function routingAdvice(catalog, task, top, { mock, backendUsed, kind, model }) {
  const policies = catalog.model_policies || {};
  const targets = top.map(s => ({ skill: s, policyId: policies[s.name] ? s.name : policies.default ? 'default' : null })).filter(t => t.policyId);
  if (!targets.length) return [];
  const questions = {};
  for (const t of targets) {
    const policy = policies[t.policyId];
    const options = { ...Object.fromEntries((policy.candidates || []).map(c => [`${c.provider}/${c.model}`, null])), other: 'None of the listed models fits this task' };
    const skillState = { description: t.skill.description, policy: { candidates: policy.candidates, constraints: policy.constraints || {} } };
    questions[`routing::${t.skill.name}`] = { ...choice({ question: 'Which host model should execute the user\'s task with this skill? Candidates are host provider/model ids.', skill: t.skill.name, policy: t.policyId }, options), state: { task, skills: { [t.skill.name]: skillState } } };
  }
  const state = { task, skills: Object.fromEntries(targets.map(t => [t.skill.name, { description: t.skill.description, policy: { candidates: policies[t.policyId].candidates, constraints: policies[t.policyId].constraints || {} } }])) };
  const envelope = mock
    ? { answers: Object.fromEntries(Object.entries(questions).map(([id, q]) => {
        const opts = optionsOf(q);
        const probabilities = Object.fromEntries(opts.map((o, i) => [o, i === 0 ? 1 : 0]));
        return [id, { choice: opts[0], probabilities, confidence: 0 }];
      })), error: null, backend: backendUsed }
    : await requestJev(state, questions, { op: 'route-skills', kinds: kind && kind !== 'mock' ? [kind] : null, model });
  const describePolicy = id => ({ id, candidates: policies[id].candidates || [], fallback: policies[id].fallback || 'none', constraints: policies[id].constraints || {} });
  const provenance = envelope.backend ? { backend: { kind: envelope.backend.kind, driver: envelope.backend.driver ?? null, model: envelope.backend.model ?? null, tier: envelope.backend.tier } } : null;
  if (envelope.error || !envelope.answers) {
    return targets.map(t => ({ skill: t.skill.name, policy: describePolicy(t.policyId), candidates: [], chosen: null, confidence: null, error: envelope.error, provenance }));
  }
  return targets.map(t => {
    const policy = describePolicy(t.policyId);
    const answer = envelope.answers[`routing::${t.skill.name}`] || {};
    const probs = answer.probabilities || {};
    const candidates = policy.candidates.map(c => ({ provider: c.provider, model: c.model, probability: round(probs[`${c.provider}/${c.model}`] ?? 0) }))
      .sort((a, b) => b.probability - a.probability).map((c, i) => ({ ...c, rank: i + 1 }));
    const chosen = typeof answer.choice === 'string' ? answer.choice : (Object.entries(probs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    return { skill: t.skill.name, policy, candidates, chosen, confidence: round(answer.confidence), provenance };
  });
}

// ── Context pruning (one batched request, questions keyed by position) ──────
const KEEP_HINTS = /(?:\/[^\s"'<>]+|\b(?:error|failed|exception|traceback|decision|decided|task|must|should|because|constraint|requirement)\b)/i;
const NOISE_HINTS = /(?:^\s*(?:debug|info|trace)\b|\b(?:GET|POST)\s+\/|\b\d{3}\s+(?:OK|Not Found)\b|^\s*at\s+\S+\s*\()/im;
function mockKeep(text) { return !NOISE_HINTS.test(text) && (KEEP_HINTS.test(text) || text.trim().length < 300); }

// Batches are bounded by the answering backend's serialized-state limit so a
// block can never be judged without appearing in the model's input; a single
// block that exceeds the limit is preserved (never dropped unseen).
export function planPruneBatches(blocks, maxStateChars) {
  const batches = [];
  let current = [];
  const size = items => JSON.stringify({ blocks: items }).length;
  const oversized = [];
  blocks.forEach((block, index) => {
    const item = { index, id: block.id, text: block.text };
    if (size([item]) > maxStateChars) { oversized.push(index); return; }
    if (current.length && size([...current, item]) > maxStateChars) { batches.push(current); current = []; }
    current.push(item);
  });
  if (current.length) batches.push(current);
  return { batches, oversized };
}

export async function pruneContext(blocks, { mock = false, override = null, model = null } = {}) {
  for (const block of blocks) {
    if (!block || typeof block.id !== 'string' || typeof block.text !== 'string') throw new Error('Each input line must be JSON {"id": string, "text": string}');
  }
  if (mock) return blocks.map(block => ({ id: block.id, verdict: mockKeep(block.text) ? 'keep' : 'drop' }));
  if (!blocks.length) return [];
  const chain = resolveChain('prune-context', { override }).chain;
  const errors = [];
  for (const kind of chain) {
    const backend = describeBackend(kind, { model });
    if (backend.error || !backend.configured) { errors.push(`${kind}: ${backend.error || 'not configured'}`); continue; }
    const { batches, oversized } = planPruneBatches(blocks, backend.maxStateChars);
    const verdicts = new Array(blocks.length).fill(null);
    let failed = null;
    for (const batch of batches) {
      const questions = {};
      // Keys index the `blocks` array of THIS request, so a backend reading
      // `blocks[i]` and the harness agree; the global position is mapped back here.
      batch.forEach((item, i) => { questions[`essential::${i}`] = noul(`Does \`blocks[${i}].text\` contain facts essential for future steps?`); });
      const envelope = await requestJev({ blocks: batch.map(b => ({ id: b.id, text: b.text })) }, questions, { op: 'prune-context', kinds: [kind], model });
      if (envelope.error || !envelope.answers) { failed = `${kind}: ${envelope.error}`; break; }
      batch.forEach((item, i) => {
        const a = envelope.answers[`essential::${i}`];
        verdicts[item.index] = { id: item.id, verdict: !(a.answer === 'no' && a.confidence >= THRESHOLD) ? 'keep' : 'drop' };
      });
    }
    if (failed) { errors.push(failed); continue; }
    for (const index of oversized) verdicts[index] = { id: blocks[index].id, verdict: 'keep', reason: `block exceeds ${kind} state limit (${backend.maxStateChars} chars); preserved unjudged` };
    return verdicts;
  }
  throw new Error(`Jev unavailable for context pruning: ${errors.join('; ') || 'no backend in chain'}`);
}

// ── Proposal review ──────────────────────────────────────────────────────────
export async function review(task, proposal, { mock = false, validation = { ok: true, errors: [] }, override = null, model = null } = {}) {
  const reviewEnvelope = validation?.ok === true && !(validation.errors?.length)
    ? await requestJev({ task, proposal }, QUESTION_SET_V4, { op: 'review', mock, override, model })
    : null;
  const backend = reviewEnvelope?.backend || null;
  let decision = decideProposalReview(validation, reviewEnvelope);
  decision = applyTierPolicy(decision, backend);
  return { ...decision, mode: mock ? 'mock' : 'jev', backend, attempted: reviewEnvelope?.attempted || [], receiptVersion: RECEIPT_VERSION, receipt: generateReceiptBinding(task, proposal, decision, backend), review: reviewEnvelope };
}

// ── Status ───────────────────────────────────────────────────────────────────
async function probeOnce(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    let payload = null;
    // A body that stalls is a timeout (retried once by probe()); a body that is
    // not JSON is a malformed discovery response, never "ready".
    if (response.ok) {
      try { payload = await response.json(); }
      catch (error) {
        if (error.name === 'AbortError') throw timeoutError(timeoutMs, 'probe body');
        throw new Error(`malformed probe response from ${new URL(url).pathname}: ${error.message}`);
      }
    }
    return { response, payload };
  } catch (error) {
    if (error.name === 'AbortError') throw timeoutError(timeoutMs, 'probe');
    throw error;
  } finally { clearTimeout(timer); }
}
async function probe(url, timeoutMs, headers = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await probeOnce(url, timeoutMs, headers); }
    catch (error) {
      if (isTimeout(error) && attempt === 0) continue;
      throw error;
    }
  }
  throw new Error('unreachable');
}
function classifyProbeError(error) {
  if (isTimeout(error)) return 'warming';
  return 'unavailable';
}

async function backendStatus(kind, { timeoutMs = 3000, referenced = true } = {}) {
  const backend = describeBackend(kind);
  const initialAttestation = backend.attestedModel
    ? (attestationEligible(backend) ? { model: backend.attestedModel, matched: null, eligible: true } : { model: backend.attestedModel, matched: null, eligible: false, state: 'ineligible' })
    : null;
  const entry = { configured: backend.configured, eligible: backend.configured && !backend.error, ready: null, state: 'unverified', tier: 'unvalidated', attestation: initialAttestation, model: backend.model || null, endpoint: backend.endpoint || null, driver: backend.driver || null, hint: null };
  if (backend.error) return { ...entry, ready: false, state: 'unavailable', hint: backend.error };
  if (!backend.configured) return { ...entry, hint: `${kind} is not configured` };
  if (!referenced) return entry;
  if (kind === 'api') return { ...entry, ready: null, state: 'unverified', keySource: 'env-or-dotenv', hint: 'API configured; credentials and inference readiness have not been verified' };
  try {
    if (kind === 'local') {
      const { response, payload } = await probe(backend.endpoint.replace(/\/v1\/systemone\/?$/, '/healthz'), timeoutMs);
      if (!response.ok || payload?.ok !== true) throw new Error(`local health check failed (${response.status})`);
      entry.modelDir = backend.modelDir;
    } else if (kind === 'ollama' || kind === 'lmstudio') {
      entry.model = await resolveGenModel(backend, timeoutMs);
    } else if (kind === 'systemone') {
      // The configured endpoint is driver-specific: `typesafe` stores the full
      // decision URL (…/v1/systemone), `decide`/`vllm-jev-decision` store the
      // server base. Derive the sibling discovery URL without losing a gateway
      // path prefix, and send the configured bearer token with the probe.
      const headers = backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
      let served = null;
      if (backend.driver === 'decide') {
        const { response, payload } = await probe(`${stripV1(backend.endpoint)}/v1/decide/info`, timeoutMs, headers);
        if (!response.ok) throw new Error(`/v1/decide/info responded ${response.status}`);
        if (typeof payload?.model !== 'string' || !payload.model) throw new Error('/v1/decide/info did not report a served model');
        served = payload.model;
        if (Number.isInteger(payload?.max_options)) entry.maxOptions = payload.max_options;
      } else {
        const modelsUrl = backend.driver === 'typesafe'
          ? backend.endpoint.replace(/\/+$/, '').replace(/\/systemone$/, '') + '/models'
          : `${stripV1(backend.endpoint)}/v1/models`;
        const { response, payload } = await probe(modelsUrl, timeoutMs, headers);
        if (!response.ok) throw new Error(`${new URL(modelsUrl).pathname} responded ${response.status}`);
        if (!Array.isArray(payload?.data)) throw new Error(`${new URL(modelsUrl).pathname} returned no model list`);
        const ids = payload.data.map(m => m?.id).filter(id => typeof id === 'string');
        if (ids.length && backend.model && !ids.includes(backend.model)) throw new Error(`model not served: ${backend.model}`);
        served = ids.includes(backend.model) ? backend.model : null;
        entry.modelsUrl = modelsUrl;
      }
      entry.servedModel = served;
    }
    entry.ready = true;
    entry.state = 'ready';
    if (backend.attestedModel && attestationEligible(backend)) {
      // Only calibrated-head drivers can be attested (same rule as live
      // requests). Status confirms against the identity the backend reports
      // before inference (systemone info/models); otherwise it stays unverified
      // and the live response decides.
      const observed = kind === 'systemone' ? entry.servedModel : null;
      const matched = observed === null ? null : observed === backend.attestedModel;
      entry.attestation = { model: backend.attestedModel, matched, eligible: true, ...(matched === false ? { state: 'stale' } : matched === null ? { state: 'unverified' } : {}) };
      if (matched === true) entry.tier = 'validated';
    }
  } catch (err) {
    entry.ready = false;
    entry.state = classifyProbeError(err);
    const start = kind === 'local'
      ? (PROFILE ? `JEV_PROFILE=${PROFILE} ~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py --profile ${PROFILE}` : 'start ~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py')
      : backend.start || `start the ${kind} server at ${backend.endpoint}`;
    entry.hint = `${kind} backend ${entry.state} (${err.message}); ${start}`;
  }
  return entry;
}

export async function jevStatus({ timeoutMs = 3000, operation = null } = {}) {
  const status = {
    active: ACTIVE,
    ready: null,
    profile: PROFILE || null,
    ...(PROFILE ? { enabled: PROFILE_ENABLED } : {}),
    default: DEFAULT_KIND,
    mode: DEFAULT_KIND, // compatibility: pre-routing consumers read `mode`/`endpoint`
    endpoint: BACKEND_KINDS.includes(DEFAULT_KIND) ? (describeBackend(DEFAULT_KIND).endpoint || null) : null,
    policies: {},
    backends: {},
    hint: null,
  };
  if (PROFILE_ERROR) return { ...status, ready: false, hint: PROFILE_ERROR };
  if (PROFILE_DISABLED) return { ...status, ready: null, hint: `Jev profile '${PROFILE}' is disabled; enable it with jev-setup.sh --profile ${PROFILE} --enable` };
  if (!DEFAULT_KIND_VALID) return { ...status, ready: false, hint: `Invalid JEV_MODE: ${DEFAULT_KIND}` };
  if (CONFIG_ERROR) return { ...status, ready: false, hint: CONFIG_ERROR };
  if (!ACTIVE) return { ...status, hint: 'Jev inactive: set JEV_API_KEY or run jev-setup.sh to opt in' };
  const ops = operation ? [operation] : OPERATIONS;
  if (operation && !OPERATIONS.includes(operation)) throw new Error(`Unknown operation: ${operation}`);
  const chains = {};
  const referenced = new Set();
  for (const op of ops) {
    const resolved = resolveChain(op);
    chains[op] = resolved;
    resolved.chain.forEach(k => referenced.add(k));
  }
  for (const kind of BACKEND_KINDS) status.backends[kind] = await backendStatus(kind, { timeoutMs, referenced: referenced.has(kind) });
  let anyUnusable = false;
  let allReady = true;
  for (const op of ops) {
    const { chain, primary, fallback } = chains[op];
    const states = chain.map(k => status.backends[k]);
    const usable = states.some(s => s.eligible && s.ready !== false) ? true : states.every(s => !s.eligible || s.ready === false) ? false : null;
    const ready = states.some(s => s.eligible && s.ready === true);
    if (usable === false) anyUnusable = true;
    if (!ready) allReady = false;
    status.policies[op.replace(/-/g, '_')] = { backend: primary, fallback, chain, usable };
  }
  status.ready = anyUnusable ? false : allReady ? true : null;
  if (anyUnusable) {
    const op = ops.find(o => status.policies[o.replace(/-/g, '_')].usable === false);
    const first = chains[op].chain.map(k => status.backends[k]).find(s => s.hint);
    status.hint = `${op} has no usable backend: ${first?.hint || 'no eligible backend in chain'}`;
  } else if (!PROFILE && DEFAULT_KIND === 'api') status.hint = status.backends.api.hint;
  return status;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(args) {
  const flags = { mock: false, topK: 3, backend: null, model: null, task: null, operation: null };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => { if (args[i + 1] === undefined) throw new Error(`${a} requires a value`); return args[++i]; };
    if (a === '--mock') flags.mock = true;
    else if (a === '--top-k') flags.topK = Number(next());
    else if (a.startsWith('--top-k=')) flags.topK = Number(a.slice(8));
    else if (a === '--backend') flags.backend = next();
    else if (a.startsWith('--backend=')) flags.backend = a.slice(10);
    else if (a === '--model') flags.model = next();
    else if (a.startsWith('--model=')) flags.model = a.slice(8);
    else if (a === '--task') flags.task = next();
    else if (a.startsWith('--task=')) flags.task = a.slice(7);
    else if (a === '--operation') flags.operation = next();
    else if (a.startsWith('--operation=')) flags.operation = a.slice(12);
    else rest.push(a);
  }
  if (flags.backend && !BACKEND_KINDS.includes(flags.backend)) throw new Error(`--backend must be one of ${BACKEND_KINDS.join(', ')}`);
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
  const permit = { verdict: 'permit', reason: 'ok', failingQuestions: [], threshold: THRESHOLD };
  cases.push(['Unvalidated tier downgrade', applyTierPolicy(permit, { kind: 'ollama', tier: 'unvalidated', attestation: null }).verdict, 'proposal_only']);
  cases.push(['Validated tier keeps permit', applyTierPolicy(permit, { kind: 'api', tier: 'validated', attestation: { model: 'jev-1.13.0', matched: true } }).verdict, 'permit']);
  const r1 = generateReceiptBinding('t', { p: 1 }, permit, { kind: 'api', model: 'jev-1.13.0', tier: 'validated' });
  const r2 = generateReceiptBinding('t', { p: 1 }, permit, { kind: 'ollama', model: 'jev-9b', tier: 'unvalidated' });
  cases.push(['Receipt v2 binds backend', r1 !== r2 && r1 === generateReceiptBinding('t', { p: 1 }, permit, { kind: 'api', model: 'jev-1.13.0', tier: 'validated' }), true]);
  cases.push(['Chain honors allow-list order', buildChain({ primary: 'api', fallback: ['ollama', 'api', 'local'] }).chain.join(','), 'api,ollama,local']);
  cases.push(['Chain override skips fallbacks', buildChain({ primary: 'api', fallback: ['ollama'], override: 'local' }).chain.join(','), 'local']);
  cases.push(['Strategy by cap', `${selectionStrategy(354, 255).strategy}/${selectionStrategy(354, 16).strategy}`, 'sharded/shortlist']);
  const sample = Array.from({ length: 12 }, (_, i) => ({ name: `skill-${i}`, description: 'd'.repeat(300), excerpt: 'e'.repeat(700) }));
  const fits = [100000, 6000, 3000].every(limit => JSON.stringify(budgetCandidates('Fix a React frontend performance bug', sample, limit)).length <= limit);
  cases.push(['Budget stays within every backend limit', fits, true]);
  let overflowed = false;
  try { budgetCandidates('x'.repeat(5000), sample, 3000); } catch (e) { overflowed = /cannot fit/.test(e.message); }
  cases.push(['Budget overflow is a loud error', overflowed, true]);
  const scopedQs = { a: { ...noul('A'), state: { s: 1 } }, b: { ...noul('B'), state: { s: 1 } }, c: { ...noul('C'), state: { s: 2 } }, d: noul('D') };
  cases.push(['Scoped grouping per-question driver', groupByScope({ shared: true }, scopedQs, { batch: false, kind: 'ollama' }).length, 3]);
  cases.push(['Scoped grouping batch driver', groupByScope({ shared: true }, scopedQs, { batch: true, kind: 'api' }).length, 1]);
  cases.push(['Generative attestation ineligible', attestationEligible({ driver: 'generative' }) || attestationEligible({ driver: 'local' }), false]);
  let routeResult;
  try {
    routeResult = await routeSkills('Fix a React frontend performance bug', { mock: true });
    const routedOk = routeResult.families.includes('web')
      && routeResult.topK.length === 3
      && routeResult.topK.every(s => routeResult.families.includes(s.category))
      && routeResult.selection.strategy === 'mock'
      && routeResult.estimatedSavingsPercent >= 70;
    cases.push(['route-skills case', routedOk, true]);
  }
  catch (e) { cases.push(['route-skills case', e.message, true]); }
  const pruned = await pruneContext([{ id: 'decision', text: 'Decision: keep /Users/project/config.json for next step' }, { id: 'noise', text: 'GET /health 200 OK\ninfo periodic polling response' }], { mock: true });
  cases.push(['prune-context case', pruned[0].verdict === 'keep' && pruned[1].verdict === 'drop', true]);
  const dup = await pruneContext([{ id: 'same', text: 'Decision: must keep constraint' }, { id: 'same', text: 'GET /health 200 OK' }], { mock: true });
  cases.push(['prune-context duplicate ids', dup.map(d => `${d.id}:${d.verdict}`).join(','), 'same:keep,same:drop']);
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

const SMOKE_TASKS = ['Fix a React frontend performance bug', 'proofread korean text for spelling', 'deploy a preview to vercel and promote it'];
export async function smoke({ backend = null, model = null, task = null } = {}) {
  const tasks = task ? [task] : SMOKE_TASKS;
  const rows = [];
  const status = await jevStatus();
  console.log(`smoke: profile=${status.profile || 'legacy'} default=${status.default} override=${backend || '-'}`);
  for (const t of tasks) {
    try {
      const r = await routeSkills(t, { override: backend, model });
      rows.push({ op: 'route-skills', input: t, backend: `${r.backend.kind}:${r.backend.model}`, tier: r.backend.tier, result: `${r.selection.strategy} top=${r.topK.map(s => s.name).join('|') || '(none:' + r.selection.reason + ')'} gate=${r.selection.gate?.value ?? '-'}` });
    } catch (e) { rows.push({ op: 'route-skills', input: t, backend: backend || '-', tier: '-', result: `ERROR ${e.message}` }); }
  }
  try {
    const pr = await pruneContext([{ id: 'decision', text: 'Decision: keep /Users/project/config.json for next step' }, { id: 'noise', text: 'GET /health 200 OK\ninfo periodic polling response' }], { override: backend, model });
    rows.push({ op: 'prune-context', input: '2 blocks', backend: backend || status.default, tier: '-', result: pr.map(p => `${p.id}=${p.verdict}`).join(',') });
  } catch (e) { rows.push({ op: 'prune-context', input: '2 blocks', backend: backend || '-', tier: '-', result: `ERROR ${e.message}` }); }
  try {
    const rv = await review('Repair React performance', { patch: 'fix render', evidence: 'focused test passed' }, { override: backend, model });
    // Smoke is diagnostic: it never emits an authorization, even from an attested backend.
    const wouldPermit = rv.verdict === 'permit';
    const verdict = wouldPermit ? 'proposal_only' : rv.verdict;
    const reason = wouldPermit ? `smoke never authorizes (live verdict would be permit: ${rv.reason})` : rv.reason;
    rows.push({ op: 'review', input: 'sample proposal', backend: `${rv.backend?.kind}:${rv.backend?.model}`, tier: rv.backend?.tier, result: `${verdict} (${reason.slice(0, 120)})`, verdict, liveVerdict: rv.verdict });
  } catch (e) { rows.push({ op: 'review', input: 'sample proposal', backend: backend || '-', tier: '-', result: `ERROR ${e.message}`, verdict: 'unavailable' }); }
  for (const r of rows) console.log(JSON.stringify(r));
  if (rows.some(r => r.tier && r.tier !== 'validated')) console.log('warning: answering backend is tier unvalidated; results prove transport, not calibrated decisions.');
  console.log('note: smoke never authorizes autonomous action; review rows are reported as proposal_only even when a live review would permit.');
  return rows.some(r => /^ERROR/.test(r.result)) ? 1 : 0;
}

async function main() {
  if (PROFILE_ERROR) throw new Error(PROFILE_ERROR);
  const [command, ...args] = CLI_ARGS;
  const { flags, rest } = parseArgs(args);
  if (command === 'self-test') process.exitCode = await selfTest();
  else if (command === 'status') {
    const status = await jevStatus({ operation: flags.operation });
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.ready === false ? 3 : status.active ? 0 : 2;
  }
  else if (command === 'route-skills') console.log(JSON.stringify(await routeSkills(rest.join(' '), { mock: flags.mock, topK: flags.topK, override: flags.backend, model: flags.model }), null, 2));
  else if (command === 'prune-context') {
    const lines = (await readStdin()).split(/\r?\n/).filter(line => line.trim());
    const blocks = lines.map(line => JSON.parse(line));
    const results = await pruneContext(blocks, { mock: flags.mock, override: flags.backend, model: flags.model });
    for (const result of results) console.log(JSON.stringify(result));
  } else if (command === 'review') {
    const [task, proposalJSON] = rest;
    if (!task || !proposalJSON) throw new Error('Usage: review [--mock] [--backend <kind>] <task> <proposal-json>');
    console.log(JSON.stringify(await review(task, JSON.parse(proposalJSON), { mock: flags.mock, override: flags.backend, model: flags.model }), null, 2));
  } else if (command === 'smoke') process.exitCode = await smoke({ backend: flags.backend, model: flags.model, task: flags.task });
  else throw new Error(`Usage: jev-harness.mjs [--profile <id>] <status|route-skills|prune-context|review|smoke|self-test> [--mock] [--backend <${BACKEND_KINDS.join('|')}>] [--model <id>]`);
}

const invokedHref = (() => { try { return process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href; } catch { return `file://${process.argv[1]}`; } })();
if (import.meta.url === invokedHref) main().catch(error => { console.error(`jev-harness: ${error.message}`); process.exitCode = 1; });
