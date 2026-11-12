#!/usr/bin/env node
// Cursor hook runner for the Jev control plane. `jev-plugin.mjs hooks-install --agent cursor`
// writes the two ~/.cursor/hooks.json entries that invoke this file.
//
// Cursor (the IDE and the cursor-agent CLI) runs a hook command, writes one JSON event to its
// stdin and reads one JSON object from its stdout. This file translates two Cursor events into
// calls to the existing Jev controller (the `hook` action of ../../../jev-plugin.mjs, reached
// through the canonical ../../shared/jev-controller.mjs seam that the native Claude, jeopi, omp,
// pi and agy packages carry byte-identical copies of; this file is never copied out of the Jev
// tree, so it imports the canonical one directly):
//
//   beforeSubmitPrompt  advisory skill routing. The advice goes back as `additional_context`,
//                       which Cursor wraps in a <system_reminder> block for the model.
//   preToolUse          active only when the profile sets JEV_REVIEW_MODE to advisory or
//                       enforce. A withheld action is returned as permission "deny"; advisory
//                       text as additional_context.
//
// Contract (what Cursor invokes):
//   * exactly one JSON line on stdout and exit code 0 on every path, so a crash can never be
//     read as a permission decision;
//   * never emits permission "allow" or "ask": Jev cannot override Cursor's own approval flow,
//     so "no opinion" is `{}`;
//   * fails open, with one exception: a prompt is never blocked, and a tool call is never denied
//     because of a failure, unless the profile sets JEV_REVIEW_MODE=enforce (or an unrecognised
//     mode). Then a matched tool call this runner cannot review (bad input, controller error,
//     timeout) is withheld, like the Codex hook's enforce path. A profile that is missing or OFF
//     is never enforced;
//   * text bound for the backend is bounded, redacted for common secret shapes in time linear in
//     its size, and has the home directory replaced by `~`;
//   * nothing is logged unless JEV_CURSOR_HOOK_LOG names a file, and then only metadata (key
//     names, lengths, outcomes), never prompt or tool text.
//
// Skill bodies are never injected here: Cursor drops `additional_context` longer than 10,000 characters (read from
// the cursor-agent 2026.11.11 bundle) and a skill file is routinely larger. The controller therefore treats
// `JEV_RUNTIME_MODE=assist` as advisory for the cursor host.
//
// Usage: node jev-cursor-adapter.mjs --event beforeSubmitPrompt|preToolUse --profile <id>
//
// Environment (all optional, mainly for tests):
//   JEV_PLUGIN_CONTROLLER  explicit controller path (default: the jev-plugin.mjs three directories
//                          above this file, i.e. the one it was installed with)
//   JEV_CURSOR_TIMEOUT_MS  controller deadline, 1000-60000 (default 8000; the hooks.json entry
//                          written by hooks-install gives Cursor 12 seconds in total)
//   JEV_CURSOR_HOOK_LOG    append one metadata-only line per invocation to this file

import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const ADAPTER_PATH = fileURLToPath(import.meta.url);
const SIBLING_CONTROLLER = resolve(dirname(ADAPTER_PATH), '..', '..', '..', 'jev-plugin.mjs');
const AGENT = 'cursor';
const EVENTS = new Set(['beforeSubmitPrompt', 'preToolUse']);
const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_STDIN_BYTES = 2 * 1024 * 1024;
const PRE_CAP_HEAD = 12_000; // work bound applied before any regular expression runs
const PRE_CAP_TAIL = 4_000;
const LINE_CAP = 1_500; //      no single line is ever scanned longer than this
const PROMPT_HEAD = 2_200;
const PROMPT_TAIL = 600;
const LEAF_PRE_HEAD = 3_000;
const LEAF_PRE_TAIL = 1_000;
const LEAF_HEAD = 1_200;
const LEAF_TAIL = 400;
const CONTEXT_CAP = 9_500; // Cursor drops additional_context longer than 10,000 characters (cursor-agent 2026.11.11 bundle).
const WATCHDOG_MARGIN_MS = 1_500;
const TIMEOUT_MS = (() => {
  // beforeSubmitPrompt blocks the send, so the default deadline is short.
  const value = Number(process.env.JEV_CURSOR_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1000 && value <= 60_000 ? value : 8_000;
})();
const UNREVIEWABLE = 'Jev review failed; action withheld.';

// Redaction is deliberately over-eager: a false positive costs a little routing context, a miss
// sends a credential off the machine. Every pattern is linear (bounded quantifiers where a
// backtracking start position exists) and is run on one line at a time after the whole text has
// been capped. A bare high-entropy string with no key name or recognizable prefix is not detected.
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g;
const LINE_PATTERNS = [
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[redacted-token]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted-token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[redacted-token]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[redacted-token]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[redacted-token]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[redacted-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [redacted]'],
  [/\b([A-Za-z0-9_]{0,40}(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CREDENTIAL)[A-Za-z0-9_]{0,40})\s*[:=]\s*("[^"\n]{4,}"|'[^'\n]{4,}'|[^\s"'`,;]{6,})/gi, '$1=[redacted]'],
  [/\b([a-z][a-z0-9+.-]{0,30}:\/\/)[^\s/:@]{1,200}:[^\s/@]{1,200}@/gi, '$1[redacted]@'],
  [/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,6}\.[A-Za-z]{2,24}/g, '[email]'],
];

const TRIVIAL_PROMPT = /^(?:ok(?:ay)?|yes|no|y|n|go(?: on)?|continue|proceed|next|done|thanks?|thx|ty|좋아|응|네|예|아니|계속|진행|다음|고마워|감사합니다?)[\s.!?~]*$/i;

export function capText(text, head, tail) {
  const value = String(text);
  if (value.length <= head + tail) return value;
  const omitted = value.length - head - tail;
  return `${value.slice(0, head)}\n[... ${omitted} characters omitted ...]\n${tail > 0 ? value.slice(-tail) : ''}`;
}

function scrubLine(line) {
  let out = line.length > LINE_CAP ? `${line.slice(0, LINE_CAP)} [line truncated]` : line;
  for (const [pattern, replacement] of LINE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function scrub(text) {
  let out = capText(text, PRE_CAP_HEAD, PRE_CAP_TAIL);
  out = out.replace(PRIVATE_KEY_BLOCK, '[redacted-private-key]');
  out = out.split('\n').map(scrubLine).join('\n');
  if (HOME.length > 1) out = out.split(HOME).join('~');
  return out;
}

export function scrubValue(value, depth = 0) {
  if (typeof value === 'string') return capText(scrub(capText(value, LEAF_PRE_HEAD, LEAF_PRE_TAIL)), LEAF_HEAD, LEAF_TAIL);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (depth >= 4) return '[nested]';
  if (Array.isArray(value)) return value.slice(0, 16).map(item => scrubValue(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 16)) out[scrub(String(key).slice(0, 64))] = scrubValue(item, depth + 1);
    return out;
  }
  return undefined;
}

export function isTrivialPrompt(text) {
  const trimmed = text.trim();
  return trimmed.length < 4 || TRIVIAL_PROMPT.test(trimmed);
}

function clip(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function mapPromptResult(result) {
  const raw = result?.hookSpecificOutput?.additionalContext ?? result?.context;
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text ? { additional_context: clip(text, CONTEXT_CAP) } : {};
}

export function mapToolResult(result) {
  const output = result?.hookSpecificOutput;
  if (output?.permissionDecision === 'deny') {
    const reason = clip(String(output.permissionDecisionReason || 'Jev withheld this action.'), 1000);
    return { permission: 'deny', user_message: reason, agent_message: reason };
  }
  const text = typeof output?.additionalContext === 'string' ? output.additionalContext.trim() : '';
  return text ? { additional_context: clip(text, CONTEXT_CAP) } : {};
}

function parseEnvText(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(JEV_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

// The controller reads profiles from ~/.agents/jev/profiles whatever directory it runs from, so
// this fast path must read the same place to agree with it about OFF and review mode.
function readProfile(profile) {
  try {
    return parseEnvText(readFileSync(join(HOME, '.agents', 'jev', 'profiles', `${profile}.env`), 'utf8'));
  } catch {
    return null;
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_STDIN_BYTES) throw new Error('stdin too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function log(entry) {
  const file = process.env.JEV_CURSOR_HOOK_LOG;
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
  } catch { /* logging must never affect the hook */ }
}

// Jev never grants or asks, so only a deny may carry a permission out of this process.
export function sanitizeOutput(out) {
  const safe = out && typeof out === 'object' && !Array.isArray(out) ? { ...out } : {};
  if (safe.permission !== undefined && safe.permission !== 'deny') delete safe.permission;
  return safe;
}

let emitted = false;
function emit(out) {
  if (emitted) return; // one JSON line, whichever path gets here first
  emitted = true;
  const safe = sanitizeOutput(out);
  process.stdout.on('error', () => process.exit(0));
  process.stdout.write(`${JSON.stringify(safe)}\n`, () => process.exit(0));
}

async function callController(profile, event) {
  const shared = await import('../../shared/jev-controller.mjs');
  return shared.invokeControllerHook({
    agent: AGENT,
    profile,
    input: event,
    controllerPath: process.env.JEV_PLUGIN_CONTROLLER || (existsSync(SIBLING_CONTROLLER) ? SIBLING_CONTROLLER : undefined),
    timeoutMs: TIMEOUT_MS,
  });
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--event' || arg === '--profile') flags[arg.slice(2)] = argv[++i];
  }
  return flags;
}

async function runHook(flags) {
  const startedAt = Date.now();
  const done = (out, outcome, extra = {}) => {
    if (emitted) return;
    log({ event: flags.event, profile: flags.profile, outcome, ms: Date.now() - startedAt, outputKeys: Object.keys(out || {}), ...extra });
    emit(out);
  };

  // Resolved before anything can fail, so every failure path knows whether this call is enforced.
  const valid = EVENTS.has(flags.event) && PROFILE_ID.test(flags.profile || '');
  const values = valid ? readProfile(flags.profile) : null;
  const active = Boolean(values) && String(values.JEV_ENABLED || '').toLowerCase() === 'true';
  const reviewMode = values?.JEV_REVIEW_MODE || 'off';
  const enforcing = active && flags.event === 'preToolUse' && reviewMode !== 'off' && reviewMode !== 'advisory';
  const degraded = (outcome, extra) => done(enforcing ? { permission: 'deny', user_message: UNREVIEWABLE, agent_message: UNREVIEWABLE } : {}, outcome, extra);

  const watchdog = setTimeout(() => degraded('watchdog'), TIMEOUT_MS + WATCHDOG_MARGIN_MS);
  watchdog.unref?.();

  // Drain stdin first so Cursor's writer never sees a closed pipe.
  let raw = '';
  let stdinFailed = false;
  try {
    raw = await readStdin();
  } catch {
    stdinFailed = true;
  }
  if (!valid) return done({}, 'bad-arguments');
  if (!values) return done({}, 'no-profile');
  if (!active) return done({}, 'disabled');
  if (stdinFailed) return degraded('stdin-error');
  if (flags.event === 'preToolUse' && reviewMode === 'off') return done({}, 'review-off');

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return degraded('bad-json');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return degraded('bad-payload');

  const sessionId = typeof payload.conversation_id === 'string' ? payload.conversation_id : undefined;
  const turnId = typeof payload.generation_id === 'string' ? payload.generation_id : undefined;
  const meta = { payloadKeys: Object.keys(payload).sort(), hookEventName: typeof payload.hook_event_name === 'string' ? payload.hook_event_name : null };

  let event;
  if (flags.event === 'beforeSubmitPrompt') {
    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!prompt.trim()) return done({}, 'empty-prompt', meta);
    // With review off nothing caches the task, so a bare "continue" is not worth a hosted call.
    if (reviewMode === 'off' && isTrivialPrompt(prompt)) return done({}, 'trivial-prompt', { ...meta, promptChars: prompt.length });
    event = {
      hook_event_name: 'UserPromptSubmit',
      prompt: capText(scrub(prompt), PROMPT_HEAD, PROMPT_TAIL),
      session_id: sessionId,
      turn_id: turnId,
    };
    meta.promptChars = prompt.length;
  } else {
    event = {
      hook_event_name: 'PreToolUse',
      tool_name: typeof payload.tool_name === 'string' ? payload.tool_name : undefined,
      tool_input: scrubValue(payload.tool_input),
      session_id: sessionId,
      turn_id: turnId,
    };
    meta.toolName = event.tool_name ?? null;
  }

  let result;
  try {
    result = await callController(flags.profile, event);
  } catch (error) {
    return degraded('controller-failed', { ...meta, error: String(error?.code || error?.name || 'Error') });
  }
  if (!result || result.ok === false) return degraded('controller-error', { ...meta, code: result?.code ?? null });

  const out = flags.event === 'beforeSubmitPrompt' ? mapPromptResult(result) : mapToolResult(result);
  return done(out, Object.keys(out).length ? 'applied' : 'no-output', meta);
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

const invoked = process.argv[1] ? canonicalPath(resolve(process.argv[1])) : null;
if (invoked && invoked === canonicalPath(ADAPTER_PATH)) runHook(parseArgs(process.argv.slice(2))).catch(() => emit({}));
