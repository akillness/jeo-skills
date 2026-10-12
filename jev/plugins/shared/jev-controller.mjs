import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONTROLLER_CANDIDATES = [
  process.env.JEV_PLUGIN_CONTROLLER,
  join(process.env.HOME || '', '.agents', 'jev', 'jev-plugin.mjs'),
].filter(Boolean);

export const JEV_ADVISORY_CUSTOM_TYPE = 'jev-advisory';
export const DEFAULT_CONTROLLER_TIMEOUT_MS = 25_000;
const CONTROLLER_TIMEOUT_GRACE_MS = 100;
const CONTROLLER_TIMEOUT_STARTUP_GRACE_MS = 50;

function normalizeControllerTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CONTROLLER_TIMEOUT_MS;
}

export function resolveControllerPath(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : DEFAULT_CONTROLLER_CANDIDATES;
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    throw new Error('Jev plugin controller not found; set JEV_PLUGIN_CONTROLLER to jev-plugin.mjs');
  }
  return path;
}

function parseControllerOutput(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // A provider hook must never treat diagnostic text as a control envelope.
    }
  }
  return {};
}

/**
 * Invoke the existing Jev controller. This is the only decision/router seam
 * used by native packages; wrappers do not import or duplicate harness logic.
 */
export function invokeControllerHook({ agent, profile, input, inputStream, controllerPath, timeoutMs } = {}) {
  if (!agent || typeof agent !== 'string') return Promise.resolve({ ok: false, error: 'agent is required', code: 'INVALID_AGENT' });
  let executable;
  try {
    executable = resolveControllerPath(controllerPath);
  } catch (error) {
    return Promise.resolve({ ok: false, error: error.message, code: 'CONTROLLER_NOT_FOUND' });
  }
  const args = [executable, 'hook', '--agent', agent];
  if (profile) args.push('--profile', profile);
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timeout = normalizeControllerTimeout(timeoutMs);
    let stdout = '';
    let stderr = '';
    let stdinError;
    let settled = false;
    let timedOut = false;
    let forceKillTimer;
    let timeoutTimer;
    const timeoutResult = { ok: false, error: `Jev controller timed out after ${timeout}ms`, code: 'CONTROLLER_TIMEOUT' };
    const onTimeout = () => {
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          finish(timeoutResult);
        }
      }, CONTROLLER_TIMEOUT_GRACE_MS);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      if (inputStream && typeof inputStream.unpipe === 'function') inputStream.unpipe(child.stdin);
      child.stdin.destroy();
      resolveResult(result);
    };
    child.once('spawn', () => { timeoutTimer = setTimeout(onTimeout, timeout + CONTROLLER_TIMEOUT_STARTUP_GRACE_MS); });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', (error) => { stdinError = error; });
    child.on('error', (error) => {
      if (timedOut) finish(timeoutResult);
      else finish({ ok: false, error: error.message, code: 'CONTROLLER_SPAWN_ERROR' });
    });
    child.on('close', (code) => {
      if (timedOut) {
        finish(timeoutResult);
        return;
      }
      const parsed = parseControllerOutput(stdout);
      // OFF controllers intentionally exit without consuming their input.
      if (stdinError && !(stdinError.code === 'EPIPE' && parsed.enabled === false)) {
        finish({ ok: false, error: 'Cannot write Jev controller input', code: 'CONTROLLER_INPUT_ERROR' });
        return;
      }
      if (code && parsed.ok !== false) {
        finish({ ok: false, error: stderr.trim() || `Jev controller exited with status ${code}`, code: 'CONTROLLER_ERROR' });
      } else if (stderr.trim() && parsed.ok === undefined) {
        finish({ ok: false, error: stderr.trim(), code: 'CONTROLLER_ERROR' });
      } else {
        finish(parsed);
      }
    });
    if (inputStream && typeof inputStream.pipe === 'function') {
      inputStream.pipe(child.stdin);
    } else {
      child.stdin.end(input === undefined ? '' : typeof input === 'string' ? input : `${JSON.stringify(input)}\n`);
    }
  });
}

export function extractAdvisoryContext(result) {
  const context = result?.hookSpecificOutput?.additionalContext ?? result?.additionalContext ?? result?.context;
  return typeof context === 'string' && context.trim() ? context.trim() : null;
}

export function advisoryMessage(result, context = extractAdvisoryContext(result)) {
  if (!context) return null;
  return {
    customType: JEV_ADVISORY_CUSTOM_TYPE,
    content: context,
    display: false,
    details: {
      agent: result?.agent ?? null,
      profile: result?.profile ?? null,
      applied: false,
      advisory: true,
    },
    attribution: 'agent',
  };
}

/**
 * Register the provider-owned before_agent_start callback used by jeopi/OMP/Pi.
 * The callback only injects advisory context; it cannot change permissions or
 * select/hot-swap the host coding model.
 */
export function registerBeforeAgentStart(api, { agent, profile, envelope = 'systemPrompt', controllerPath, timeoutMs } = {}) {
  if (!api || typeof api.on !== 'function') return { registered: false, agent, profile: profile || null, advisory: true };
  api.on('before_agent_start', async (event = {}) => {
    const result = await invokeControllerHook({
      agent,
      profile,
      controllerPath,
      timeoutMs,
      input: { type: 'UserPromptSubmit', prompt: String(event.prompt || ''), agent, profile: profile || null },
    });
    const context = extractAdvisoryContext(result);
    if (!context) return {};
    if (envelope === 'systemPrompt-string') {
      const prior = typeof event.systemPrompt === 'string' && event.systemPrompt.length ? `${event.systemPrompt}\n` : '';
      return { systemPrompt: `${prior}${context}` };
    }
    if (envelope === 'message') {
      const message = advisoryMessage(result, context);
      return message ? { message } : {};
    }
    const prior = Array.isArray(event.systemPrompt) ? event.systemPrompt : [];
    return { systemPrompt: [...prior, context] };
  });
  return { registered: true, agent, profile: profile || null, advisory: true };
}
