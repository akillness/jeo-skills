#!/usr/bin/env node
import {
  accessSync,
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SETUP = join(HERE, 'jev-setup.sh');
const BACKENDS = ['api', 'local', 'ollama', 'lmstudio', 'systemone'];
// Mirrors jev-harness.mjs's SYSTEMONE_DRIVERS (not exported); a static enum,
// not policy logic, so keeping a local copy carries no drift risk beyond
// BACKENDS itself already being a local mirror of harness's BACKEND_KINDS.
const SYSTEMONE_DRIVERS = ['typesafe', 'decide', 'vllm-jev-decision'];
const AGENT_ID = /^[a-z][a-z0-9_-]*$/;
const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENV_ID = /^[A-Z_][A-Z0-9_]*$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]*$/;
const MODEL_PLAN_INPUT_BYTES = 1024 * 1024;
const HOST_MODEL_SNAPSHOT_MAX_AGE_MS = 60_000;
const HOST_PROVIDERS = new Set(['anthropic', 'openai', 'openai-codex', 'google', 'gemini', 'openrouter']);
// 'gemini' is a known routing-advice provider name but no host's CLI provider
// alias/model-selector for it was verified (AgentPluginResearch lane-d); keep
// the matrix conservative and never guess 'google' vs 'gemini' for any host.
// Preserve OAuth identity: an openai-codex observation never authorizes openai.
const GENERIC_HOST_PROVIDERS = new Set(['anthropic', 'openai', 'openai-codex', 'google', 'openrouter']);
// Per-host model-routing contract, grounded in AgentPluginResearch's verified
// --help captures (lane-d-installed-host-inventory.md:113-125). `providers`
// is the exact allow-list for that host - never the full generic
// HOST_PROVIDERS - and `argv` builds the real launch arguments that host's
// CLI accepts, so a single-provider host's `--model` value is never silently
// given a provider prefix it was never verified to understand.
const HOST_MODEL_POLICY = {
  // Claude 2.1.291: `--model <model>` only, no generic --provider flag; the
  // CLI is Anthropic-only, so provider identity lives in the allow-list, not
  // in the argv value.
  claude: { providers: new Set(['anthropic']), argv: (provider, model) => ['--model', model] },
  // Codex 0.160.1: `-m/--model <MODEL>`, no generic provider flag either;
  // `--local-provider lmstudio|ollama` is a separate OSS-lane opt-in outside
  // this routing-advice vocabulary, not a HOST_PROVIDERS selector.
  codex: { providers: new Set(['openai']), argv: (provider, model) => ['-m', model] },
  // jeopi 16.6.2 / OMP 18.1.19: verified `--model=<value>` accepts a
  // provider-qualified value (help example `openai/gpt-5.2`).
  jeopi: { providers: GENERIC_HOST_PROVIDERS, argv: (provider, model) => [`--model=${provider}/${model}`] },
  omp: { providers: GENERIC_HOST_PROVIDERS, argv: (provider, model) => [`--model=${provider}/${model}`] },
  // pi 0.80.3: verified separate `--provider <name>` + `--model <pattern>`,
  // or the preferred combined `--model provider/id` form used here.
  pi: { providers: GENERIC_HOST_PROVIDERS, argv: (provider, model) => ['--model', `${provider}/${model}`] },
};
const WRITER_PROVIDERS = new Set(['anthropic', 'openai']);
const SKILL_ID = /^[a-z0-9-]+$/;
const NATIVE_HOSTS = new Set(['claude', 'jeopi', 'omp', 'pi']);
const OPERATORS = new Set(['claude', 'jeopi', 'omp', 'pi', 'codex', 'gemini', 'opencode', 'jeo', 'aside']);

function homes() {
  const home = homedir();
  const jev = join(home, '.agents', 'jev');
  return { home, jev, profiles: join(jev, 'profiles'), legacy: join(jev, '.env'), mapping: join(jev, 'agents.json') };
}

function parseEnv(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(JEV_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function readEnv(path) {
  const text = readText(path);
  return { text, values: text === null ? {} : parseEnv(text) };
}

function ensureRegular(path) {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink destination: ${path}`);
  if (!info.isFile()) throw new Error(`Configuration destination is not a file: ${path}`);
}

function ensureParent(path) {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const info = lstatSync(parent);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Invalid configuration directory: ${parent}`);
}

function atomicWrite(path, content) {
  ensureParent(path);
  ensureRegular(path);
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
    chmodSync(path, 0o600);
  } catch (error) {
    try { unlinkSync(temp); } catch {}
    throw error;
  }
}

function profilePath(profile) {
  const paths = homes();
  return profile ? join(paths.profiles, `${profile}.env`) : paths.legacy;
}

function backendPath(profile, backend) {
  const paths = homes();
  return profile ? join(paths.profiles, `${profile}.${backend}.env`) : paths.legacy;
}

function readMapping() {
  const path = homes().mapping;
  const text = readText(path);
  if (text === null) return { path, value: {}, text: null };
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('agents.json is not valid JSON'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('agents.json must contain an object');
  return { path, value, text };
}

function nativeFor(agent) {
  if (agent === 'codex') return 'codex-hooks';
  if (agent === 'claude') return 'claude';
  if (agent === 'jeopi' || agent === 'omp') return 'jeopi-omp';
  if (agent === 'pi') return 'pi';
  return 'adapter';
}

function mappingFor(agent, profile, old) {
  const previous = old && typeof old === 'object' ? old : {};
  return {
    ...previous,
    [agent]: {
      profile,
      native: typeof previous[agent]?.native === 'string' ? previous[agent].native : nativeFor(agent),
      scope: typeof previous[agent]?.scope === 'string' ? previous[agent].scope : 'user',
    },
  };
}

function mappingText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateAgent(agent, optional = false) {
  if (optional && agent === undefined) return null;
  if (typeof agent !== 'string' || !AGENT_ID.test(agent)) throw new Error('agent must contain lowercase letters, digits, underscores, or hyphens');
  return agent;
}

function validateProfile(profile, optional = true) {
  if (profile === undefined || profile === null || profile === '') {
    if (optional) return null;
    throw new Error('profile requires a non-empty profile id');
  }
  if (typeof profile !== 'string' || !PROFILE_ID.test(profile)) throw new Error('profile id must contain lowercase letters, digits, and single hyphens only');
  return profile;
}

function validateEnvName(name, required = false) {
  if (name === undefined || name === null || name === '') {
    if (required) throw new Error('key-env requires an environment variable name');
    return null;
  }
  if (!ENV_ID.test(name)) throw new Error('key-env must be a valid uppercase environment variable name');
  return name;
}

function validateModel(model) {
  if (model === undefined || model === null || model === '') return null;
  if (!MODEL_ID.test(model)) throw new Error('model must be a safe model identifier');
  return model;
}

function parseURL(value, label = 'endpoint') {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid URL`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${label} uses an unsupported URL scheme`);
  if (url.username || url.password || url.search || url.hash) throw new Error(`${label} must not contain credentials, query, or hash`);
  return url;
}

function isLoopback(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/[\[\]]/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const parts = host.split('.');
  return parts.length === 4 && parts.every(p => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255) && Number(parts[0]) === 127;
}

function stripTypeSafeSuffix(url) {
  const path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/v1/systemone')) throw new Error('endpoint must be a TypeSafe /v1/systemone URL');
  const prefix = path.slice(0, -'/v1/systemone'.length).replace(/\/+$/, '');
  return `${url.origin}${prefix || ''}`;
}

function readState(profile) {
  const base = readEnv(profilePath(profile));
  const values = base.values;
  const hasProfile = Boolean(profile);
  let enabled = hasProfile ? String(values.JEV_ENABLED || '').toLowerCase() === 'true' : true;
  let invalidEnabled = hasProfile && values.JEV_ENABLED !== undefined && !/^(true|false)$/i.test(values.JEV_ENABLED);
  const backend = values.JEV_MODE || null;
  const backendFile = backend && BACKENDS.includes(backend) ? readEnv(backendPath(profile, backend)) : { text: null, values: {} };
  const b = backendFile.values;
  let configured = false;
  if (BACKENDS.includes(backend)) {
    // Mirrors jev-harness.mjs's kindConfiguredWith() exactly: api needs a
    // saved key (an endpoint alone is not a usable backend; the harness
    // check never looks at the endpoint at all); systemone needs a saved
    // endpoint; local/ollama/lmstudio are "configured" by selecting that
    // mode at all - harness falls back to its own built-in default endpoint
    // for all three, so no backend file or saved field is required here.
    // Deeper per-backend completeness (a resolved model, a valid driver,
    // required asset paths) is a *plugin-side* enable gate, not this field -
    // see backendEnableError(), which runs only on `enable`.
    if (backend === 'api') configured = Boolean(b.JEV_API_KEY);
    else if (backend === 'systemone') configured = Boolean(b.JEV_SYSTEMONE_ENDPOINT);
    else configured = true;
  }
  return { base, backendFile, values, backend, configured, enabled, invalidEnabled, present: base.text !== null };
}

function resolveHookContext(flags) {
  const agent = validateAgent(flags.agent, false);
  // A pinned installed hook must not depend on another agent's mapping file.
  const mappings = flags.profile !== undefined ? { path: homes().mapping, value: {} } : readMapping();
  const mapped = mappings.value[agent];
  const requested = flags.profile !== undefined ? flags.profile : mapped?.profile;
  const profile = validateProfile(requested, true);
  const base = readEnv(profilePath(profile));
  const values = base.values;
  const hasProfile = Boolean(profile);
  const enabled = hasProfile ? String(values.JEV_ENABLED || '').toLowerCase() === 'true' : true;
  const invalidEnabled = hasProfile && values.JEV_ENABLED !== undefined && !/^(true|false)$/i.test(values.JEV_ENABLED);
  return { agent, profile, mappings, state: { base, backendFile: { text: null, values: {} }, values, backend: values.JEV_MODE || null, configured: false, enabled, invalidEnabled, present: base.text !== null } };
}

function resolveContext(flags, { allowMissingProfile = true } = {}) {
  const agent = validateAgent(flags.agent, false);
  const mappings = readMapping();
  const mapped = mappings.value[agent];
  const requested = flags.profile !== undefined ? flags.profile : mapped?.profile;
  const profile = validateProfile(requested, allowMissingProfile);
  return { agent, profile, mappings, state: readState(profile) };
}

function replaceEnabled(text, enabled) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let seen = false;
  for (const line of lines) {
    if (/^\s*JEV_ENABLED\s*=/.test(line)) {
      if (!seen) out.push(`JEV_ENABLED=${enabled}`);
      seen = true;
    } else if (line !== '' || out.length) out.push(line);
  }
  if (!seen) out.unshift(`JEV_ENABLED=${enabled}`);
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}

function common(action, ctx, applied, enabled) {
  return { ok: true, action, agent: ctx.agent, profile: ctx.profile, applied: Boolean(applied), enabled: Boolean(enabled) };
}

function inactive(action, ctx) {
  return { ...common(action, ctx, false, false), inactive: true, plan: { active: false, reason: 'selected Jev profile is disabled or missing' } };
}

function runSetup(ctx, flags) {
  if (!existsSync(SETUP)) throw new Error('canonical Jev setup script is unavailable');
  const args = ['--config-only'];
  if (ctx.profile) args.push('--profile', ctx.profile);
  args.push('--agent', ctx.agent, '--mode', flags.backend);
  if (flags.endpoint !== undefined) args.push('--endpoint', flags.endpoint);
  if (flags.model !== undefined) args.push('--model', flags.model);
  if (flags.keyEnv !== undefined) args.push('--key-env', flags.keyEnv);
  if (flags.modelDir !== undefined) args.push('--model-dir', flags.modelDir);
  const result = spawnSync('bash', [SETUP, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  });
  if (result.error) throw new Error(`canonical setup failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`canonical setup failed with exit ${result.status}`);
}

function validateConfigure(flags, ctx) {
  if (!BACKENDS.includes(flags.backend)) throw new Error(`unsupported backend '${flags.backend || ''}'; expected ${BACKENDS.join(', ')}`);
  if (flags.endpoint !== undefined) parseURL(flags.endpoint);
  validateModel(flags.model);
  // --key-env is required only when the *target* api backend file has no
  // saved key yet. Switching backends, or updating an already-configured
  // api profile's endpoint/model, must not be forced to re-supply a key
  // just to preserve the one it already has - jev-setup.sh's config-only
  // install already preserves a saved key by design; this only stops the
  // request from being rejected before setup ever runs.
  const savedApiKey = flags.backend === 'api' ? Boolean(readEnv(backendPath(ctx.profile, 'api')).values.JEV_API_KEY) : false;
  validateEnvName(flags.keyEnv, flags.backend === 'api' && !savedApiKey);
  if (flags.modelDir !== undefined && (typeof flags.modelDir !== 'string' || !flags.modelDir || /[\0\r\n]/.test(flags.modelDir))) throw new Error('model-dir must be a non-empty path');
  if (ctx.state.invalidEnabled) throw new Error('JEV_ENABLED must be true or false');
  if (ctx.profile && ctx.state.present && !ctx.state.backend && flags.backend !== undefined) return;
}

async function configure(flags) {
  const ctx = resolveContext(flags);
  validateConfigure(flags, ctx);
  validateRuntimeFlags(flags);
  if (!flags.apply) return common('configure', ctx, false, ctx.state.enabled);
  // Validate the mapping before invoking setup so a malformed mapping cannot leave a configured profile half-updated.
  const nextMapping = ctx.profile ? mappingFor(ctx.agent, ctx.profile, ctx.mappings.value) : ctx.mappings.value;
  if (ctx.profile) ensureRegular(ctx.mappings.path);
  runSetup(ctx, flags);
  if (ctx.profile && (flags.runtimeMode !== undefined || flags.reviewMode !== undefined)) {
    let text = readEnv(profilePath(ctx.profile)).text;
    if (flags.runtimeMode !== undefined) text = replaceSetting(text, 'JEV_RUNTIME_MODE', flags.runtimeMode);
    if (flags.reviewMode !== undefined) text = replaceSetting(text, 'JEV_REVIEW_MODE', flags.reviewMode);
    atomicWrite(profilePath(ctx.profile), text);
  }
  if (ctx.profile) atomicWrite(ctx.mappings.path, mappingText(nextMapping));
  const after = readState(ctx.profile);
  return common('configure', ctx, true, after.enabled);
}

// Plugin-side enable-only completeness gate, beyond readState()'s coarse
// `configured` (which matches harness's own coarse kindConfiguredWith()).
// Field-presence only, no network probes - mirrors what jev-harness.mjs's
// describeBackend() would flag as a structural `error`, for the one backend
// (systemone) where harness itself computes that, plus a plugin-only
// requirement (a resolved model) for ollama/lmstudio, where harness's own
// coarse check stays silent but a null model would otherwise reach a real
// generative request. `local` has a genuine built-in default model id in
// the harness and is never gated here; `api` has no deeper field beyond the
// key already required by `configured`.
function backendEnableError(state) {
  const b = state.backendFile.values;
  if (state.backend === 'systemone') {
    const driver = b.JEV_SYSTEMONE_DRIVER || 'typesafe';
    if (!SYSTEMONE_DRIVERS.includes(driver)) return `invalid JEV_SYSTEMONE_DRIVER '${driver}'`;
    if (!b.JEV_SYSTEMONE_MODEL) return 'JEV_SYSTEMONE_MODEL is required';
    if (driver === 'vllm-jev-decision' && (!b.JEV_SYSTEMONE_HEAD_JSON || !b.JEV_SYSTEMONE_CALIBRATION_JSON)) {
      return 'vllm-jev-decision requires JEV_SYSTEMONE_HEAD_JSON and JEV_SYSTEMONE_CALIBRATION_JSON';
    }
  } else if (state.backend === 'ollama' && !(b.JEV_OLLAMA_MODEL || b.JEV_LOCAL_MODEL)) {
    return 'JEV_OLLAMA_MODEL (or legacy JEV_LOCAL_MODEL) is required';
  } else if (state.backend === 'lmstudio' && !(b.JEV_LMSTUDIO_MODEL || b.JEV_LOCAL_MODEL)) {
    return 'JEV_LMSTUDIO_MODEL (or legacy JEV_LOCAL_MODEL) is required';
  }
  return null;
}

function validateToggle(ctx, desired) {
  if (!ctx.profile) throw new Error('enable/disable requires --profile or an existing agent mapping');
  if (!ctx.state.present) throw new Error(`profile '${ctx.profile}' is not configured`);
  if (ctx.state.invalidEnabled) throw new Error('JEV_ENABLED must be true or false');
  if (!BACKENDS.includes(ctx.state.backend) || !ctx.state.configured) throw new Error(`profile '${ctx.profile}' has no valid configured backend`);
  if (desired) {
    const incomplete = backendEnableError(ctx.state);
    if (incomplete) throw new Error(`profile '${ctx.profile}' has an incomplete backend configuration: ${incomplete}`);
  }
}

async function toggle(flags, desired) {
  const ctx = resolveContext(flags, { allowMissingProfile: false });
  validateToggle(ctx, desired);
  if (!flags.apply) return common(desired ? 'enable' : 'disable', ctx, false, ctx.state.enabled);
  atomicWrite(profilePath(ctx.profile), replaceEnabled(ctx.state.base.text, desired));
  return common(desired ? 'enable' : 'disable', ctx, true, desired);
}

function safeMapping(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return {
    profile: typeof entry.profile === 'string' ? entry.profile : null,
    native: typeof entry.native === 'string' ? entry.native : null,
    scope: typeof entry.scope === 'string' ? entry.scope : null,
  };
}
async function status(flags) {
  const ctx = resolveContext(flags);
  const body = common('status', ctx, false, ctx.state.enabled);
  body.backend = ctx.state.backend;
  body.configured = ctx.state.configured;
  body.mapping = safeMapping(ctx.mappings.value[ctx.agent]);
  body.profilePresent = ctx.state.present;
  body.runtimeMode = runtimeMode(ctx);
  body.reviewMode = reviewMode(ctx);
  if (ctx.state.invalidEnabled) throw new Error('JEV_ENABLED must be true or false');
  return body;
}

function commandPath(command) {
  const pathValue = process.env.PATH || '';
  for (const dir of pathValue.split(':')) {
    if (!dir) continue;
    const path = join(dir, command);
    try { accessSync(path, fsConstants.X_OK); return path; } catch {}
  }
  return null;
}

async function detect(flags) {
  const ctx = resolveContext(flags);
  const hosts = {};
  for (const host of ['claude', 'jeopi', 'omp', 'pi', 'codex', 'gemini', 'opencode', 'jeo', 'aside']) {
    const binary = commandPath(host);
    const native = NATIVE_HOSTS.has(host);
    hosts[host] = {
      binary,
      present: Boolean(binary),
      runnable: Boolean(binary),
      capability: native ? 'native-lifecycle' : binary ? 'adapter-only' : 'unknown',
      readiness: binary ? 'unverified' : 'unknown',
      activation: 'not-run',
    };
  }
  return { ...common('detect', ctx, false, ctx.state.enabled), capabilities: hosts };
}

// Native plugin package identity Jev registers under each host's own
// plugin/extension system (from each host's own package.json/plugin.json).
const NATIVE_PLUGIN_NAME = { claude: 'jev-control-plane', jeopi: 'jev-jeopi-extension', omp: 'jev-omp-extension', pi: 'jev-pi-extension' };
// Scopes each host's own persistent-toggle subcommand actually accepts
// (AgentPluginResearch lane-d); never pass through an arbitrary mapping
// scope string into argv without checking it against this allow-list first.
const HOST_TOGGLE_SCOPES = { claude: new Set(['user', 'project', 'local']), jeopi: new Set(['user', 'project']) };
function nativePluginDir(host) { return join(HERE, 'plugins', host); }
function nativePluginEntry(host) { return join(nativePluginDir(host), 'index.mjs'); }

// Claude/jeopi have a real, verified persistent enable/disable subcommand in
// their own CLI - but copying Jev's native package assets into a plugin/
// extension directory is not the same as that host's CLI having discovered
// and registered the package under `name`. host-plan is read-only/zero-
// execution and can never confirm registration state, so the command is
// proposed (for operator follow-up) but reported unsupported/unverified
// here, never as a ready-to-run action - and only when the mapped scope is
// one that host's toggle subcommand actually accepts.
// Host plugin/extension package lifecycle is a *different* activation axis
// than the Jev profile's own JEV_ENABLED switch (see toggle()). Registering
// or unregistering Jev's native package with a host CLI never turns the
// profile on/off - the plugin stays loaded either way and an OFF profile's
// hook still short-circuits before any work. These steps are named
// `package-*`, never bare `enable`/`disable`, so they are never mistaken
// for the controller's own `enable|disable --profile <profile> --apply`.
function proposedPackageToggleStep(host, verb, scope, buildArgv) {
  const action = `package-${verb}`;
  const allowed = HOST_TOGGLE_SCOPES[host];
  if (!allowed.has(scope)) {
    return { action, status: 'unsupported', note: `mapped scope '${scope}' is not valid for ${host} (expected ${[...allowed].join('/')})`, executed: false };
  }
  return {
    action,
    status: 'unsupported',
    command: host,
    argv: buildArgv(scope),
    note: `${host} has a persistent ${verb} subcommand for Jev's package registration (independent of the Jev profile's own JEV_ENABLED switch), but copying the native package assets does not register it with ${host}; this argv is a proposal for the operator to verify, not a confirmed-usable action`,
    executed: false,
  };
}

async function hostPlan(flags) {
  const ctx = resolveContext(flags);
  const host = flags.host || ctx.agent;
  validateAgent(host);
  const installed = Boolean(commandPath(host));
  // The mapping's own scope (user/project/local), already tracked per agent
  // by mappingFor(); default to 'user' for a host with no mapping yet.
  const scope = typeof ctx.mappings.value[host]?.scope === 'string' ? ctx.mappings.value[host].scope : 'user';
  let capability = 'adapter-only';
  let lifecycle = 'unsupported';
  let steps;
  if (host === 'claude') {
    // Verified (AgentPluginResearch lane-d, Claude 2.1.291): `--plugin-dir
    // <path>` session-loads an unpublished local plugin directory - this one
    // is immediately real/usable. `claude plugin enable|disable <plugin>
    // --scope user|project|local` is a real subcommand (never --all) but
    // gated behind unverified registration; see proposedPackageToggleStep().
    capability = 'native-lifecycle';
    lifecycle = 'session-only';
    steps = [
      { action: 'package-load', command: 'claude', argv: ['--plugin-dir', nativePluginDir(host)], scope: 'session', executed: false },
      proposedPackageToggleStep('claude', 'enable', scope, s => ['plugin', 'enable', NATIVE_PLUGIN_NAME.claude, '--scope', s]),
      proposedPackageToggleStep('claude', 'disable', scope, s => ['plugin', 'disable', NATIVE_PLUGIN_NAME.claude, '--scope', s]),
    ];
  } else if (host === 'jeopi') {
    // Verified (jeopi 16.6.2): `-e/--extension=<value>` session-loads an
    // extension path - real/usable immediately. `jeopi plugin enable|
    // disable [TARGETS] --scope=user|project [--dry-run]` is a real
    // subcommand but, same as Claude, gated behind unverified registration.
    capability = 'native-lifecycle';
    lifecycle = 'session-only';
    steps = [
      { action: 'package-load', command: 'jeopi', argv: ['-e', nativePluginEntry(host)], scope: 'session', executed: false },
      proposedPackageToggleStep('jeopi', 'enable', scope, s => ['plugin', 'enable', NATIVE_PLUGIN_NAME.jeopi, `--scope=${s}`]),
      proposedPackageToggleStep('jeopi', 'disable', scope, s => ['plugin', 'disable', NATIVE_PLUGIN_NAME.jeopi, `--scope=${s}`]),
    ];
  } else if (host === 'omp' || host === 'pi') {
    // Verified (OMP 18.1.19, pi 0.80.3): both load extensions only via
    // session `-e/--extension` (pi also has `--no-extensions` and an
    // interactive-only package config UI). Neither host has *any* verified
    // persistent targeted enable/disable subcommand - unlike Claude/jeopi,
    // there is no real command to even propose, so none is invented here.
    capability = 'native-lifecycle';
    lifecycle = 'session-only';
    steps = [
      { action: 'package-load', command: host, argv: ['-e', nativePluginEntry(host)], scope: 'session', executed: false },
      { action: 'package-toggle', status: 'unsupported', note: `${host} has no verified persistent targeted package enable/disable subcommand; the extension is session-scoped only (add/remove -e per launch)`, executed: false },
    ];
  } else if (host === 'codex') {
    capability = 'native-hooks';
    lifecycle = 'persistent-with-trust';
    steps = [
      { action: 'hooks-install', command: process.execPath, argv: [join(HERE, 'jev-plugin.mjs'), 'hooks-install', '--agent', 'codex', '--profile', ctx.profile || '<profile>', '--apply'], executed: false },
      { action: 'hooks-trust', command: 'codex', argv: [], status: 'review-required', note: 'Review the generated UserPromptSubmit and PreToolUse definitions with /hooks. Codex skips untrusted or modified definitions.', executed: false },
    ];
  } else {
    steps = [{ action: 'adapter', status: installed ? 'present' : 'unknown', note: 'No native Jev lifecycle is advertised for this host', executed: false }];
  }
  return {
    ...common('host-plan', ctx, false, ctx.state.enabled), host, installed, capability, lifecycle, verified: false, executed: false, steps,
    // The single, real activation switch for the Jev profile itself is
    // never a host plugin command - it is the controller's own `enable` /
    // `disable --profile <profile> --apply`, independent of whether the
    // host package above is registered at all.
    profileActivation: { command: 'enable|disable', argv: ['--profile', ctx.profile || '<legacy>', '--apply'] },
  };
}

function adviceEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.routing)) return payload.routing;
  if (Array.isArray(payload?.advice)) return payload.advice;
  throw new Error('advice must be a routing array or an object containing routing/advice');
}

function planObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Explicit inputs only: never discover credentials or invoke a host for auth.
// Nonblocking/no-follow opens reject FIFOs and leaf symlinks; the bounded read
// also handles a regular file growing after fstat without unbounded allocation.
function readPlanJson(path, label) {
  let fd;
  try {
    const file = resolve(path);
    if (lstatSync(file).isSymbolicLink()) throw new Error('symlink');
    fd = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > MODEL_PLAN_INPUT_BYTES) throw new Error('file type or size');
    const buffer = Buffer.alloc(MODEL_PLAN_INPUT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const size = readSync(fd, buffer, length, buffer.length - length, null);
      if (!size) break;
      length += size;
    }
    if (length > MODEL_PLAN_INPUT_BYTES) throw new Error('input grew');
    return JSON.parse(buffer.toString('utf8', 0, length));
  } catch {
    throw new Error(`${label} must be readable nonsymlink regular JSON of at most 1 MiB`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function requireFreshHostSnapshot(observed) {
  const now = Date.now();
  if (!Number.isFinite(observed) || observed > now || now - observed > HOST_MODEL_SNAPSHOT_MAX_AGE_MS) {
    throw new Error('host-model snapshot must be fresh (at most 60 seconds old), not future-dated');
  }
}

function hostModelInventory(flags, ctx) {
  if (!flags.hostModels) throw new Error('model-plan requires authenticated host inventory via --host-models <path>');
  const snapshot = readPlanJson(flags.hostModels, 'host-model snapshot');
  if (!planObject(snapshot) || snapshot.agent !== ctx.agent || snapshot.profile !== ctx.profile) {
    throw new Error('host-model snapshot agent/profile mismatch');
  }
  const observed = planTimestamp(snapshot.observedAt);
  requireFreshHostSnapshot(observed);
  if (!planObject(snapshot.inventory)) throw new Error('host-model snapshot has no provider inventory');
  return { inventory: snapshot.inventory, observedAt: observed };
}

function planTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return NaN;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}

function quotaAvailable(limit, now) {
  if (limit === undefined || limit === null) return true;
  const reset = planTimestamp(limit);
  return Number.isFinite(reset) && reset <= now;
}

function hostModelEligible(inventory, provider, model, now) {
  if (!Object.hasOwn(inventory, provider)) return false;
  const state = inventory[provider];
  if (!planObject(state) || state.authenticated !== true || !Array.isArray(state.models) || !state.models.includes(model)) return false;
  if (!quotaAvailable(state.limitedUntil, now)) return false;
  if (state.modelLimits !== undefined && state.modelLimits !== null) {
    if (!planObject(state.modelLimits)) return false;
    if (Object.hasOwn(state.modelLimits, model) && !quotaAvailable(state.modelLimits[model], now)) return false;
  }
  return true;
}

async function modelPlan(flags) {
  const ctx = resolveContext(flags, { allowMissingProfile: false });
  if (!ctx.state.enabled) return inactive('model-plan', ctx);
  if (!flags.advice) throw new Error('model-plan requires --advice <path>');
  const policy = HOST_MODEL_POLICY[ctx.agent];
  if (!policy) throw new Error(`unsupported host '${ctx.agent}' for model routing; no verified provider/argv contract`);
  const { inventory, observedAt } = hostModelInventory(flags, ctx);
  const entries = adviceEntries(readPlanJson(flags.advice, 'routing advice'));
  requireFreshHostSnapshot(observedAt);
  const now = Date.now();
  if (!entries.length || entries.length > 64) throw new Error('routing advice requires 1 to 64 entries');
  const plans = [];
  for (const entry of entries) {
    const chosen = typeof entry?.chosen === 'string' ? entry.chosen : null;
    if (!chosen || !chosen.includes('/')) throw new Error('routing advice has no provider/model choice');
    const separator = chosen.indexOf('/');
    const provider = chosen.slice(0, separator);
    const model = chosen.slice(separator + 1);
    if (!policy.providers.has(provider)) throw new Error(`host '${ctx.agent}' refuses an unsupported provider switch`);
    if (!MODEL_ID.test(model) || model.length > 256) throw new Error('routing advice contains an unsafe model id');
    const skill = entry.skill ?? null;
    if (skill !== null && (typeof skill !== 'string' || skill.length > 128 || !SKILL_ID.test(skill))) throw new Error('routing advice contains an unsafe skill id');
    const candidates = [];
    // Ranked advice precedes policy-only candidates; preserve supplied ordering.
    for (const list of [entry.candidates, entry.policy?.candidates]) {
      if (list !== undefined && !Array.isArray(list)) throw new Error('routing candidates must be arrays');
      if (list && list.length > 128 - candidates.length) throw new Error('routing advice exceeds 128 candidates per entry');
      candidates.push(...(list || []));
    }
    if (!candidates.some(candidate => candidate?.provider === provider && candidate?.model === model)) {
      throw new Error('provider/model choice was not an approved routing candidate');
    }
    const eligible = [];
    const seen = new Set();
    for (const candidate of [{ provider, model }, ...candidates]) {
      const p = candidate?.provider;
      const m = candidate?.model;
      if (!policy.providers.has(p) || typeof m !== 'string' || m.length > 256 || !MODEL_ID.test(m)) continue;
      const id = `${p}/${m}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (hostModelEligible(inventory, p, m, now)) eligible.push({ provider: p, model: m });
    }
    if (!eligible.length) throw new Error('no eligible host models: inventory unavailable or candidates exhausted');
    const launch = ({ provider: p, model: m }) => ({ provider: p, model: m, argv: policy.argv(p, m), advisory: true, executed: false });
    const [selected, ...fallbacks] = eligible;
    plans.push({ skill, ...launch(selected), fallbacks: fallbacks.map(launch) });
  }
  requireFreshHostSnapshot(observedAt);
  return { ...common('model-plan', ctx, false, ctx.state.enabled), host: ctx.agent, plans, executed: false, advisory: true };
}

function savedEndpoint(ctx) {
  const vals = ctx.state.backendFile.values;
  if (ctx.state.backend === 'api') return vals.JEV_API_ENDPOINT || null;
  if (ctx.state.backend === 'systemone') return vals.JEV_SYSTEMONE_ENDPOINT || null;
  if (ctx.state.backend === 'local') return vals.JEV_LOCAL_ENDPOINT || null;
  if (ctx.state.backend === 'ollama') return vals.JEV_OLLAMA_ENDPOINT || null;
  if (ctx.state.backend === 'lmstudio') return vals.JEV_LMSTUDIO_ENDPOINT || null;
  return null;
}

async function integrationPlan(flags) {
  const ctx = resolveContext(flags, { allowMissingProfile: false });
  // Input validation runs before the OFF short-circuit (pure string compare,
  // zero I/O either way) so an OFF profile still gets a truthful rejection
  // of a malformed --integration value instead of a misleading inactive plan.
  if (flags.integration !== 'pg-jev' && flags.integration !== 'computer-use') throw new Error('integration must be pg-jev or computer-use');
  if (!ctx.state.enabled) {
    const off = inactive('integration-plan', ctx);
    if (flags.integration === 'pg-jev') {
      // The pg-jev extension's database-side contract (plan-only execution,
      // explicit-only row egress, server-process-only API key GUC, and that
      // its state is independent of whether this Jev profile is enabled) is
      // not conditional on profile activation - disclose it even OFF, with
      // the classifier/writer explicitly reported inactive alongside it.
      off.plan.classifier = 'inactive';
      off.plan.writer = 'inactive';
      off.plan.database = { execution: 'plan-only', scope: 'database-server', rowEgress: 'explicit-only', apiKeyGuc: 'server-process-only', extensionStateIndependent: true };
    }
    return off;
  }
  const driver = ctx.state.backend === 'systemone' ? (ctx.state.backendFile.values.JEV_SYSTEMONE_DRIVER || 'typesafe') : null;
  if (ctx.state.backend !== 'api' && !(ctx.state.backend === 'systemone' && driver === 'typesafe')) {
    throw new Error(`incompatible Jev backend '${ctx.state.backend || 'unknown'}'; a TypeSafe-compatible gateway is required`);
  }
  const endpoint = flags.endpoint || savedEndpoint(ctx);
  if (!endpoint) throw new Error('integration endpoint is required');
  const url = parseURL(endpoint, 'integration endpoint');
  if (flags.localOnly && !isLoopback(url.hostname)) throw new Error('local-only classifier must use an exact loopback endpoint');
  const baseUrl = stripTypeSafeSuffix(url);
  // Local-only never implies a hosted JEV credential: the operator supplies their
  // own local auth reference, or omits it entirely for a no-auth local service.
  // A remote (non-local-only) classifier always requires an explicit key
  // reference - it must never auto-borrow one.
  const keyEnv = validateEnvName(flags.keyEnv, !flags.localOnly);
  const model = validateModel(flags.model);
  if (flags.writerKeyEnv !== undefined) validateEnvName(flags.writerKeyEnv, true);
  let writerApi = null;
  if (flags.writerApi !== undefined) {
    if (!WRITER_PROVIDERS.has(flags.writerApi)) throw new Error(`unsupported writer-api '${flags.writerApi}'; expected ${[...WRITER_PROVIDERS].join(' or ')}`);
    writerApi = flags.writerApi;
  }
  const writerModel = validateModel(flags.writerModel);
  if (!flags.localOnly && flags.writerEndpoint === undefined && (flags.writerKeyEnv || writerApi || writerModel)) {
    throw new Error('writer endpoint is required when writer credentials, API, or model are supplied');
  }
  let writer;
  if (flags.writerEndpoint !== undefined) {
    const writerUrl = parseURL(flags.writerEndpoint, 'writer-endpoint');
    if (flags.localOnly && !isLoopback(writerUrl.hostname)) throw new Error('local-only writer must use an exact loopback endpoint or be disabled');
    // A remote writer always requires an explicit credential reference - it
    // must never be left to a real writer client's own ambient-env fallback
    // (e.g. the Anthropic SDK reading ANTHROPIC_API_KEY when no key is
    // otherwise given), which could send a real hosted secret to an
    // arbitrary remote endpoint.
    if (!flags.localOnly && !flags.writerKeyEnv) throw new Error('writer-key-env is required for a remote (non-local-only) writer');
    const writerBaseUrl = writerUrl.toString().replace(/\/$/, '');
    writer = {
      enabled: true,
      mode: flags.localOnly ? 'loopback' : 'configured',
      endpoint: writerBaseUrl,
      // Plan-only env-name -> value/credential-ref mapping so a handoff is
      // directly usable: names match the actual writer consumer (CLICKER_*),
      // never WRITER_ENDPOINT or an invented CLICKER_WRITER_ENABLED flag.
      // Secret *values* are never placed here, only the env-var name holding
      // them (`ref`); the classifier and writer models are kept distinct so
      // routing/classification config is never conflated with the coding LLM.
      envVars: flags.writerKeyEnv ? {
        CLICKER_WRITER_BASE_URL: writerBaseUrl,
        CLICKER_WRITER_API: writerApi,
        CLICKER_WRITER_API_KEY: { ref: flags.writerKeyEnv },
        CLICKER_WRITER_MODEL: writerModel,
      } : {
        // Local-only with no explicit writer-key-env: this loopback service
        // needs no real credential, but leaving CLICKER_WRITER_API_KEY
        // entirely unset could let a real writer client (e.g. an Anthropic
        // SDK-based one) fall back to an ambient ANTHROPIC_API_KEY/
        // ANTHROPIC_AUTH_TOKEN and send that real secret to this (possibly
        // less-trusted, even if loopback) service. Force a fixed non-secret
        // placeholder plus explicit blanks on both ambient vars, the same
        // defense already used for a fully disabled writer.
        CLICKER_WRITER_BASE_URL: writerBaseUrl,
        CLICKER_WRITER_API: writerApi,
        CLICKER_WRITER_API_KEY: { ref: null, literal: 'not-needed' },
        CLICKER_WRITER_MODEL: writerModel,
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
      },
    };
  } else {
    // Disabled writer: force-blank the vars a writer client would read,
    // including the ambient Anthropic SDK vars, rather than rely on an
    // enable flag the real consumer never reads. Omitting a key instead of
    // blanking it would let a later dotenv reload silently repopulate it
    // from the ambient environment, defeating the disablement.
    writer = {
      enabled: false,
      mode: 'disabled',
      envVars: {
        CLICKER_WRITER_BASE_URL: '',
        CLICKER_WRITER_API_KEY: { ref: null },
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
      },
    };
  }
  // A local-only classifier with no explicit --key-env has no credential to
  // reference by name; some TypeSafe-SDK-compatible clients still require a
  // non-empty key string to be set. Surface a fixed, non-secret placeholder
  // literal instead of a `ref` in that one case only - never for a remote
  // endpoint, which always has `keyEnv` set or has already thrown above.
  const classifierKey = keyEnv ? { ref: keyEnv } : { ref: null, literal: 'not-needed' };
  const classifier = {
    protocol: 'typesafe-sdk',
    baseUrl,
    keyEnv,
    localOnly: Boolean(flags.localOnly),
    // `localOnly` only reflects the operator's requested constraint and the
    // loopback-hostname check above; it is not a claim that downstream
    // gateway egress has been verified.
    envVars: {
      TYPESAFE_BASE_URL: baseUrl,
      TYPESAFE_API_KEY: classifierKey,
      TYPESAFE_DEFAULT_MODEL: model,
    },
  };
  if (flags.integration === 'pg-jev') {
    return { ...common('integration-plan', ctx, false, ctx.state.enabled), integration: 'pg-jev', classifier, writer, database: { execution: 'plan-only', scope: 'database-server', rowEgress: 'explicit-only', apiKeyGuc: 'server-process-only', extensionStateIndependent: true }, executed: false };
  }
  return { ...common('integration-plan', ctx, false, ctx.state.enabled), integration: 'computer-use', classifier, writer, capture: 'separate-consent-required', act: 'separate-consent-required', executed: false };
}

async function readStdin() {
  let value = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    value += chunk;
    if (Buffer.byteLength(value) > 2_097_152) throw new Error('hook input exceeds 2 MiB');
  }
  return value;
}

function classifyRoutingError(error) {
  const message = String(error?.message || error || '');
  if (/^Jev profile '[^']*' is disabled$/.test(message)) return 'profile_disabled';
  if (message.startsWith('Cannot load a valid skills catalog')) return 'catalog_unavailable';
  if (message.startsWith('Jev unavailable for skill routing')) return 'backend_unavailable';
  if (message.startsWith('route-skills requires') || message.startsWith('--top-k must be')) return 'invalid_request';
  return 'routing_error';
}

function isApprovedModelChoice(chosen) {
  if (typeof chosen !== 'string' || !chosen.includes('/')) return false;
  const separator = chosen.indexOf('/');
  return HOST_PROVIDERS.has(chosen.slice(0, separator)) && MODEL_ID.test(chosen.slice(separator + 1));
}

function validateRuntimeFlags(flags) {
  if (flags.runtimeMode !== undefined && !['advisory', 'assist'].includes(flags.runtimeMode)) throw new Error('runtime-mode must be advisory or assist');
  if (flags.reviewMode !== undefined && !['off', 'advisory', 'enforce'].includes(flags.reviewMode)) throw new Error('review-mode must be off, advisory, or enforce');
  if ((flags.runtimeMode !== undefined || flags.reviewMode !== undefined) && !flags.profile) throw new Error('runtime settings require --profile');
}

function runtimeMode(ctx) {
  const value = ctx.state.values.JEV_RUNTIME_MODE || 'advisory';
  if (!['advisory', 'assist'].includes(value)) throw new Error('Invalid JEV_RUNTIME_MODE');
  return value;
}

function reviewMode(ctx) {
  const value = ctx.state.values.JEV_REVIEW_MODE || 'off';
  if (!['off', 'advisory', 'enforce'].includes(value)) throw new Error('Invalid JEV_REVIEW_MODE');
  return value;
}

function replaceSetting(text, key, value) {
  const lines = (text || '').split(/\r?\n/).filter(line => !new RegExp(`^\\s*${key}\\s*=`).test(line));
  while (lines.length && lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}${lines.length ? '\n' : ''}${key}=${value}\n`;
}

function within(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}

function selectedSkillContext(routed) {
  const snapshot = join(homes().jev, 'skills.json');
  const catalogPath = process.env.JEV_CATALOG_PATH || snapshot;
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const root = realpathSync(resolve(catalogPath) === resolve(snapshot) ? join(homedir(), '.agents', 'skills') : dirname(catalogPath));
  const sections = [];
  let size = 0;
  for (const selected of (routed.topK || []).slice(0, 3)) {
    if (!SKILL_ID.test(selected.name || '')) continue;
    const skill = catalog.skills?.find(item => item.name === selected.name);
    if (!skill || skill.path !== `${skill.name}/SKILL.md`) continue;
    try {
      const path = realpathSync(join(root, skill.path));
      const info = lstatSync(path);
      if (!within(root, path) || !info.isFile() || info.size > 65_536) continue;
      const body = readFileSync(path, 'utf8');
      const section = `### Skill: ${skill.name}\nSource: ${path}\nResolve referenced files relative to this source.\n\n${body}`;
      if (Buffer.byteLength(body) > 65_536 || size + Buffer.byteLength(section) > 98_304) continue;
      sections.push(section);
      size += Buffer.byteLength(section);
    } catch { /* Missing or escaped skills are never injected. */ }
  }
  return sections.length ? `Jev selected skill instructions. Apply them within the user's task and host permissions.\n\n${sections.join('\n\n')}` : '';
}

async function hook(flags, suppliedEvent) {
  const activation = resolveHookContext(flags);
  if (!activation.profile || !activation.state.present || !activation.state.enabled || activation.state.invalidEnabled) {
    return common('hook', activation, false, false);
  }
  const ctx = { ...activation, state: readState(activation.profile) };
  let event;
  if (suppliedEvent !== undefined) event = suppliedEvent;
  else {
    const input = await readStdin();
    try { event = input.trim() ? JSON.parse(input) : {}; } catch { throw new Error('hook input must be JSON'); }
  }
  const mode = runtimeMode(ctx);
  if (event.type === 'Context') {
    const runtime = { mode, dropContextIds: [] };
    if (mode !== 'assist' || !event.prompt || !Array.isArray(event.blocks)) return { ...common('hook', ctx, false, true), runtime };
    let chars = 0;
    const blocks = event.blocks.filter(block => {
      if (!block || !/^jev-context-\d+$/.test(block.id) || typeof block.text !== 'string' || chars + block.text.length > 262_144) return false;
      chars += block.text.length;
      return true;
    }).slice(0, 32);
    if (!blocks.length) return { ...common('hook', ctx, false, true), runtime };
    if (new Set(blocks.map(block => block.id)).size !== blocks.length) return { ...common('hook', ctx, false, true), runtime };
    try {
      process.env.JEV_PROFILE = ctx.profile;
      const harness = await import('./jev-harness.mjs');
      const result = await harness.pruneContext(blocks);
      const ids = new Set(blocks.map(block => block.id));
      runtime.dropContextIds = result.filter(item => item.verdict === 'drop' && ids.has(item.id)).map(item => item.id);
    } catch { /* Failed pruning preserves every context message. */ }
    return { ...common('hook', ctx, false, true), runtime };
  }
  const prompt = typeof event.prompt === 'string' ? event.prompt : typeof event.userPrompt === 'string' ? event.userPrompt : '';
  let advice = 'Jev advisory context unavailable.';
  let runtime;
  try {
    process.env.JEV_PROFILE = ctx.profile;
    // A native hook's child process inherits whatever cwd the host coding
    // agent is running in (the live, untrusted workspace), and the harness's
    // catalog seam tries process.cwd()'s .agent-skills/skills.json before the
    // setup-installed snapshot. Pin JEV_CATALOG_PATH before importing the
    // harness so an untrusted workspace can never supply its own catalog:
    // honor an already-set caller-trusted value (profile/operator concern),
    // otherwise default to the installed snapshot - never process.cwd().
    if (!process.env.JEV_CATALOG_PATH) process.env.JEV_CATALOG_PATH = join(homes().jev, 'skills.json');
    const harness = await import('./jev-harness.mjs');
    const routed = await harness.routeSkills(prompt || 'Review the current task', { topK: 3 });
    if (mode === 'assist') runtime = { mode, skillContext: selectedSkillContext(routed), pruneContext: true };
    // Defense in depth even if a catalog candidate still resolves to
    // untrusted content: only pass through skill names and host
    // provider/model choices that match the approved identifier patterns,
    // so hostile catalog text can never be transmitted as advisory context.
    const names = routed.topK.map(item => item.name).filter(name => SKILL_ID.test(name)).join(', ') || 'no confident catalog match';
    const models = (routed.routing || []).map(item => item.chosen).filter(isApprovedModelChoice).join(', ');
    advice = `Jev advisory only (profile ${ctx.profile}): suggested skills: ${names}${models ? `; host model candidates: ${models}` : ''}. This does not change host permissions or the host model.`;
  } catch (error) {
    // Never interpolate error.message into advisory/additionalContext text: it
    // can carry a hostile backend's raw HTTP response body (harness's
    // httpError() embeds up to 200 chars of the response text, which survives
    // through routeSkills's aggregated "kind: <body>" error string). A
    // compromised or spoofed backend could use that to prompt-inject the
    // host. Classify into a small set of fixed, local category labels
    // instead - categories come only from matching our own code's fixed
    // error-message prefixes, never from arbitrary substrings of the message.
    advice = `Jev advisory only (profile ${ctx.profile}): routing unavailable (${classifyRoutingError(error)}). This does not change host permissions or the host model.`;
  }
  if (ctx.agent === 'claude') {
    return { ...common('hook', ctx, false, true), ...(runtime ? { runtime } : {}), hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: [advice, runtime?.skillContext].filter(Boolean).join('\n\n') } };
  }
  return { ...common('hook', ctx, false, true), ...(runtime ? { runtime } : {}), context: advice };
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\"'\"'")}'`; }

async function hooksInstall(flags) {
  const ctx = resolveContext(flags, { allowMissingProfile: false });
  if (ctx.agent !== 'codex') throw new Error('hooks-install currently supports --agent codex');
  if (!ctx.profile || !ctx.state.present) throw new Error('configure a named profile before installing hooks');
  const path = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'hooks.json');
  ensureRegular(path);
  let config = readText(path);
  config = config === null ? {} : JSON.parse(config);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('hooks.json must contain an object');
  if (config.hooks === undefined) config.hooks = {};
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) throw new Error('hooks.json hooks must contain an object');
  const command = [process.execPath, join(HERE, 'jev-plugin.mjs'), 'codex-hook', '--agent', 'codex', '--profile', ctx.profile].map(shellQuote).join(' ');
  for (const event of ['UserPromptSubmit', 'PreToolUse']) {
    const groups = config.hooks[event] === undefined ? [] : config.hooks[event];
    if (!Array.isArray(groups)) throw new Error(`${event} hooks must be an array`);
    const handler = { type: 'command', command, timeout: 90, statusMessage: event === 'UserPromptSubmit' ? 'Jev: load selected skills' : 'Jev: review proposed action', ...(event === 'UserPromptSubmit' ? { additionalContextLimit: 32768 } : {}) };
    const managed = item => item?.type === 'command' && typeof item.command === 'string' && item.command.includes(shellQuote(join(HERE, 'jev-plugin.mjs'))) && item.command.includes("'codex-hook'");
    let found = false;
    for (const group of groups) {
      if (!Array.isArray(group.hooks)) continue;
      group.hooks = group.hooks.map(item => { if (!managed(item)) return item; found = true; return handler; });
    }
    if (!found) groups.push({ ...(event === 'PreToolUse' ? { matcher: 'Bash|apply_patch|Write|Edit|exec_command|write_stdin' } : {}), hooks: [handler] });
    config.hooks[event] = groups;
  }
  if (flags.apply) atomicWrite(path, `${JSON.stringify(config, null, 2)}\n`);
  return { ...common('hooks-install', ctx, flags.apply, ctx.state.enabled), path, events: ['UserPromptSubmit', 'PreToolUse'], trust: 'review and trust the generated definitions in Codex /hooks; changed definitions need renewed trust', executed: false };
}

function sessionTaskPath(event, profile) {
  if (typeof event.session_id !== 'string' || !event.session_id || typeof event.turn_id !== 'string' || !event.turn_id) return null;
  const key = createHash('sha256').update(JSON.stringify([profile, event.session_id, event.turn_id])).digest('hex');
  return join(homes().jev, 'sessions', `${key}.json`);
}

function saveSessionTask(path, task) {
  ensureParent(path);
  ensureRegular(path);
  // Only our own hashed, regular cache files are eligible for expiry cleanup.
  for (const name of readdirSync(dirname(path)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).slice(0, 512)) {
    const candidate = join(dirname(path), name);
    const info = lstatSync(candidate);
    if (info.isFile() && info.mtimeMs < Date.now() - 86_400_000) unlinkSync(candidate);
  }
  if (task.length > 100_000) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  atomicWrite(path, JSON.stringify({ task, time: Date.now() }));
}

function codexDecision(context, decision, reason) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...(decision ? { permissionDecision: decision, permissionDecisionReason: reason } : { additionalContext: context }) } };
}

async function codexHook(flags) {
  let event;
  let ctx;
  let mode = 'off';
  try {
    ctx = resolveHookContext(flags);
    if (!ctx.profile || !ctx.state.present || (!ctx.state.enabled && !ctx.state.invalidEnabled)) return {};
    const input = await readStdin();
    event = JSON.parse(input);
    if (ctx.state.invalidEnabled) throw new Error('Invalid JEV_ENABLED');
    mode = reviewMode(ctx);
    if (event.hook_event_name === 'UserPromptSubmit') {
      if (mode !== 'off' && typeof event.prompt === 'string') {
        const path = sessionTaskPath(event, ctx.profile);
        if (path) saveSessionTask(path, event.prompt);
      }
      const result = await hook(flags, event);
      return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: [result.context, result.runtime?.skillContext].filter(Boolean).join('\n\n') } };
    }
    if (event.hook_event_name !== 'PreToolUse' || mode === 'off') return {};
    const path = sessionTaskPath(event, ctx.profile);
    let task;
    if (path) {
      ensureRegular(path);
      const saved = JSON.parse(readText(path) || '{}');
      if (typeof saved.task === 'string' && saved.time > Date.now() - 86_400_000) task = saved.task;
    }
    if (!task) return mode === 'enforce' ? codexDecision(null, 'deny', 'Jev: no task context for this turn. Submit the task again before retrying.') : codexDecision('Jev review unavailable: no task context for this turn; host permissions remain unchanged.');
    process.env.JEV_PROFILE = ctx.profile;
    const harness = await import('./jev-harness.mjs');
    const result = await harness.review(task, { tool: event.tool_name, input: event.tool_input, evidence: { source: 'Codex PreToolUse', testsExecutedByJev: false } });
    if (mode === 'enforce' && (result.verdict !== 'permit' || result.backend?.tier !== 'validated')) return codexDecision(null, 'deny', `Jev: ${result.verdict}; action withheld. Backend tier: ${result.backend?.tier || 'unavailable'}. Host authorization is still required.`);
    // Never return permissionDecision:allow: even a validated permit cannot override host approval.
    return codexDecision(`Jev review: ${result.verdict}; backend tier ${result.backend?.tier || 'unavailable'}. Jev did not execute validation commands and does not change host permissions.`);
  } catch {
    if (event?.hook_event_name === 'PreToolUse' && mode !== 'off') return mode === 'advisory' ? codexDecision('Jev review unavailable; host permissions remain unchanged.') : codexDecision(null, 'deny', 'Jev review failed; action withheld.');
    // A configured enforcement hook must still deny when its profile is malformed.
    if (ctx?.state.values.JEV_REVIEW_MODE && !['off', 'advisory'].includes(ctx.state.values.JEV_REVIEW_MODE)) return codexDecision(null, 'deny', 'Jev enforcement configuration or input is invalid; action withheld.');
    if (!ctx && flags.profile) return codexDecision(null, 'deny', 'Jev profile could not be read; action withheld.');
    return {};
  }
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const flags = { action, agent: undefined, profile: undefined, host: undefined, apply: false, backend: undefined, endpoint: undefined, model: undefined, keyEnv: undefined, modelDir: undefined, advice: undefined, hostModels: undefined, integration: undefined, writerEndpoint: undefined, writerKeyEnv: undefined, writerApi: undefined, writerModel: undefined, localOnly: false };
  const valueFlags = new Map([
    ['--runtime-mode', 'runtimeMode'], ['--review-mode', 'reviewMode'],
    ['--agent', 'agent'], ['--profile', 'profile'], ['--host', 'host'], ['--backend', 'backend'], ['--endpoint', 'endpoint'], ['--model', 'model'],
    ['--key-env', 'keyEnv'], ['--model-dir', 'modelDir'], ['--advice', 'advice'], ['--host-models', 'hostModels'], ['--integration', 'integration'],
    ['--writer-endpoint', 'writerEndpoint'], ['--writer-key-env', 'writerKeyEnv'], ['--writer-api', 'writerApi'], ['--writer-model', 'writerModel'],
  ]);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--apply') { flags.apply = true; continue; }
    if (arg === '--local-only') { flags.localOnly = true; continue; }
    const equal = arg.indexOf('=');
    const key = equal >= 0 ? arg.slice(0, equal) : arg;
    const field = valueFlags.get(key);
    if (!field) throw new Error(`unknown option '${arg}'`);
    const value = equal >= 0 ? arg.slice(equal + 1) : rest[++i];
    if (value === undefined || value === '') throw new Error(`${key} requires a value`);
    flags[field] = value;
  }
  validateAgent(flags.agent, false);
  return flags;
}

function emitError(action, agent, profile, error) {
  const message = String(error?.message || error || 'unknown error').replace(/(?:JEV_[A-Z0-9_]+)=\S+/g, '$1=<redacted>');
  const body = { ok: false, action: action || null, agent: agent || null, profile: profile || null, applied: false, error: message, code: 'JEV_PLUGIN_ERROR' };
  console.log(JSON.stringify(body));
  process.exitCode = 1;
}

async function main() {
  let flags;
  try {
    flags = parseArgs(process.argv.slice(2));
    const action = flags.action;
    let result;
    if (action === 'configure') result = await configure(flags);
    else if (action === 'enable') result = await toggle(flags, true);
    else if (action === 'disable') result = await toggle(flags, false);
    else if (action === 'status') result = await status(flags);
    else if (action === 'detect') result = await detect(flags);
    else if (action === 'host-plan') result = await hostPlan(flags);
    else if (action === 'model-plan') result = await modelPlan(flags);
    else if (action === 'integration-plan') result = await integrationPlan(flags);
    else if (action === 'hook') result = await hook(flags);
    else if (action === 'codex-hook') result = await codexHook(flags);
    else if (action === 'hooks-install') result = await hooksInstall(flags);
    else throw new Error(`unknown action '${action}'`);
    console.log(JSON.stringify(result));
  } catch (error) {
    emitError(flags?.action || process.argv[2], flags?.agent, flags?.profile, error);
  }
}

// Entry-point guard: only auto-run the CLI when this file is the directly
// invoked script, never on `import`/`import()` (tests, native hook wrappers).
// Comparing raw resolve() output is not enough: on macOS TMPDIR/`/var` is a
// symlink to `/private/var`, and installed controllers are frequently reached
// through another symlink (package alias, `.agents/jev/jev-plugin.mjs`).
// realpathSync() collapses both sides to the same canonical filesystem path
// so the guard still recognizes itself as the entry point. If a side cannot
// be realpath'd (e.g. argv[1] is not a real file), fall back to resolve() so
// the comparison fails closed instead of throwing.
function canonicalEntryPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

const invokedArg = process.argv[1] ? resolve(process.argv[1]) : null;
const invoked = invokedArg ? canonicalEntryPath(invokedArg) : null;
const modulePath = canonicalEntryPath(fileURLToPath(import.meta.url));
if (invoked === modulePath) main();
