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
export const JEV_SKILL_CUSTOM_TYPE = 'jev-skill-context';
export const JEV_MEMORY_SUMMARY_CUSTOM_TYPE = 'jev-memory-summary';
export const DEFAULT_CONTROLLER_TIMEOUT_MS = 25_000;
export const DEFAULT_PRETOOL_MATCHER = 'Bash|bash|apply_patch|Write|write|Edit|edit|ast_edit|MultiEdit|NotebookEdit|exec_command|write_stdin';
// Host tool names differ only in case (Claude `Bash`, jeopi/OMP/Pi/GJC `bash`), so
// every matcher this adapter compiles is case-insensitive.
const DEFAULT_TOOL_MATCHER_RE = new RegExp(`^(?:${DEFAULT_PRETOOL_MATCHER})$`, 'i');
const TOOL_OUTPUT_OMITTED = '[Jev: tool output omitted to save context]';
const CONTROLLER_TIMEOUT_GRACE_MS = 100;
const CONTROLLER_TIMEOUT_STARTUP_GRACE_MS = 50;
const MAX_CONTROLLER_STDOUT_BYTES = 4 * 1024 * 1024;
const MAX_CONTROLLER_STDERR_BYTES = 256 * 1024;
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
      timeoutTimer = undefined;
      if (settled) return;
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        forceKillTimer = undefined;
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
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolveResult(result);
    };
    child.once('spawn', () => {
      if (settled || timedOut) return;
      timeoutTimer = setTimeout(onTimeout, timeout + CONTROLLER_TIMEOUT_STARTUP_GRACE_MS);
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_CONTROLLER_STDOUT_BYTES) stdout += chunk.slice(0, MAX_CONTROLLER_STDOUT_BYTES - stdout.length);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_CONTROLLER_STDERR_BYTES) stderr += chunk.slice(0, MAX_CONTROLLER_STDERR_BYTES - stderr.length);
    });
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

function compileToolMatcher(matcher) {
  if (matcher instanceof RegExp) return matcher.flags.includes('i') ? matcher : new RegExp(matcher.source, `${matcher.flags}i`);
  if (typeof matcher === 'string' && matcher.trim()) {
    try { return new RegExp(`^(?:${matcher.trim()})$`, 'i'); } catch { return DEFAULT_TOOL_MATCHER_RE; }
  }
  return DEFAULT_TOOL_MATCHER_RE;
}

/**
 * Text of a message whose content is a string or an array made only of text parts
 * (`[{ type: 'text', text }]`, the jeopi/OMP/Pi tool-result shape). Content holding
 * images or any other part type returns null so it is never rewritten.
 */
function messageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || !content.length) return null;
  let text = '';
  for (const part of content) {
    if (!part || part.type !== 'text' || typeof part.text !== 'string') return null;
    text += (text ? '\n' : '') + part.text;
  }
  return text;
}

/** Replace a message's text while preserving its content shape. */
function withMessageText(message, text) {
  return { ...message, content: typeof message.content === 'string' ? text : [{ type: 'text', text }] };
}

/**
 * Register the provider-owned before_agent_start, context, and tool_call callbacks
 * used by jeopi/OMP/Pi/GJC.
 * Advisory remains the default. Explicit assist profiles can also inject skill
 * instructions and prune Jev-owned custom messages (or extended memory blocks when
 * memoryMode === 'extended') from LLM input. PreToolUse action review runs on
 * matched tool calls when reviewMode is advisory or enforce.
 */
export function registerBeforeAgentStart(api, { agent, profile, envelope = 'systemPrompt', controllerPath, timeoutMs, toolMatcher, memoryMode: configuredMemoryMode } = {}) {
  if (!api || typeof api.on !== 'function') return { registered: false, agent, profile: profile || null, advisory: true };
  let latestPrompt = '';
  let pruneEnabled = false;
  let activeMemoryMode = configuredMemoryMode || 'jev-only';
  let generation = 0;
  const matcherRe = compileToolMatcher(toolMatcher);

  api.on('before_agent_start', async (event = {}) => {
    const currentGeneration = ++generation;
    latestPrompt = typeof event.prompt === 'string' ? event.prompt : '';
    pruneEnabled = false;
    activeMemoryMode = configuredMemoryMode || 'jev-only';
    const result = await invokeControllerHook({
      agent,
      profile,
      controllerPath,
      timeoutMs,
      input: {
        type: 'UserPromptSubmit',
        prompt: String(event.prompt || ''),
        agent,
        profile: profile || null,
        ...(event.sessionId || event.session_id ? { session_id: String(event.sessionId || event.session_id) } : {}),
        ...(event.turnId || event.turn_id ? { turn_id: String(event.turnId || event.turn_id) } : {}),
      },
    });
    const assist = result?.ok === true && result?.enabled === true && result?.runtime?.mode === 'assist';
    if (generation === currentGeneration) {
      pruneEnabled = assist && result.runtime.pruneContext === true;
      if (typeof result?.runtime?.memoryMode === 'string') activeMemoryMode = result.runtime.memoryMode;
    }
    const skillContext = assist && typeof result.runtime.skillContext === 'string' ? result.runtime.skillContext.trim() : '';
    const skillMessage = skillContext ? {
      customType: JEV_SKILL_CUSTOM_TYPE,
      content: skillContext,
      display: false,
      details: { agent: result.agent ?? agent, profile: result.profile ?? profile ?? null, applied: true, advisory: false },
      attribution: 'agent',
    } : null;
    const context = extractAdvisoryContext(result);
    if (!context) return skillMessage ? { message: skillMessage } : {};
    if (envelope === 'systemPrompt-string') {
      const prior = typeof event.systemPrompt === 'string' && event.systemPrompt.length ? `${event.systemPrompt}\n` : '';
      return { systemPrompt: `${prior}${context}`, ...(skillMessage ? { message: skillMessage } : {}) };
    }
    if (envelope === 'message') {
      const message = advisoryMessage(result, context);
      return message ? { message } : {};
    }
    const prior = Array.isArray(event.systemPrompt) ? event.systemPrompt : [];
    return { systemPrompt: [...prior, context], ...(skillMessage ? { message: skillMessage } : {}) };
  });

  api.on('context', async (event = {}) => {
    if (!pruneEnabled || !latestPrompt.trim() || !Array.isArray(event.messages)) return {};
    const isSkillMessage = message => message?.role === 'custom' && message.customType === JEV_SKILL_CUSTOM_TYPE && messageText(message) !== null;
    const isToolResultMessage = message => (message?.role === 'toolResult' || message?.role === 'tool') && messageText(message) !== null;
    const isConvMessage = message => (message?.role === 'user' || message?.role === 'assistant') && messageText(message) !== null;

    if (activeMemoryMode !== 'extended') {
      // Default jev-only boundary: never serialize or remove user, assistant,
      // system, or tool messages, including tool pairs.
      let newest = event.messages.length - 1;
      while (newest >= 0 && !isSkillMessage(event.messages[newest])) newest -= 1;
      const eligible = [];
      let chars = 0;
      for (let index = 0; index < newest && eligible.length < 32; index += 1) {
        const message = event.messages[index];
        const text = isSkillMessage(message) ? messageText(message) : null;
        if (text === null || chars + text.length > 262_144) continue;
        eligible.push({ id: `jev-context-${index}`, text, index });
        chars += text.length;
      }
      if (!eligible.length) return {};
      const currentGeneration = generation;
      const result = await invokeControllerHook({
        agent, profile, controllerPath, timeoutMs,
        input: { type: 'Context', prompt: latestPrompt, agent, profile: profile || null, blocks: eligible.map(({ id, text }) => ({ id, text })) },
      });
      if (generation !== currentGeneration || result?.ok !== true || result?.enabled !== true || result?.runtime?.mode !== 'assist' || !Array.isArray(result.runtime.dropContextIds)) return {};
      const dropIds = new Set(result.runtime.dropContextIds.filter(id => typeof id === 'string'));
      const dropIndices = new Set(eligible.filter(({ id }) => dropIds.has(id)).map(({ index }) => index));
      return dropIndices.size ? { messages: event.messages.filter((_message, index) => !dropIndices.has(index)) } : {};
    }

    // Extended memory management mode: supports Jev skill messages, tool output
    // compression, and older conversation turn summarization while keeping the
    // newest message intact.
    const cutoff = Math.max(0, event.messages.length - 1);
    const eligible = [];
    let chars = 0;
    for (let index = 0; index < cutoff && eligible.length < 32; index += 1) {
      const message = event.messages[index];
      let id = null;
      let kind = null;
      if (isSkillMessage(message)) { id = `jev-context-${index}`; kind = 'jev-skill'; }
      else if (isToolResultMessage(message)) { id = `tool-output-${index}`; kind = 'tool-output'; }
      else if (isConvMessage(message) && index < cutoff - 1) { id = `conv-turn-${index}`; kind = 'conversation'; }
      const text = id ? messageText(message) : null;
      if (text === null || chars + text.length > 262_144) continue;
      eligible.push({ id, kind, text, index });
      chars += text.length;
    }
    if (!eligible.length) return {};
    const currentGeneration = generation;
    const result = await invokeControllerHook({
      agent, profile, controllerPath, timeoutMs,
      input: {
        type: 'Context',
        memoryMode: 'extended',
        prompt: latestPrompt,
        agent,
        profile: profile || null,
        blocks: eligible.map(({ id, kind, text }) => ({ id, kind, text })),
      },
    });
    if (generation !== currentGeneration || result?.ok !== true || result?.enabled !== true || result?.runtime?.mode !== 'assist') return {};
    const dropIds = new Set(Array.isArray(result.runtime.dropContextIds) ? result.runtime.dropContextIds.filter(id => typeof id === 'string') : []);
    const compressed = result.runtime.compressedBlocks && typeof result.runtime.compressedBlocks === 'object' ? result.runtime.compressedBlocks : {};
    const byIndex = new Map(eligible.map(item => [item.index, item]));
    let changed = false;
    let dropped = 0;
    const nextMessages = [];
    for (let index = 0; index < event.messages.length; index += 1) {
      const item = byIndex.get(index);
      const message = event.messages[index];
      if (item && dropIds.has(item.id)) {
        changed = true;
        dropped += 1;
        // A tool result answers a tool call in the preceding assistant message;
        // removing it would orphan that call, so only its text is replaced.
        if (item.kind === 'tool-output') nextMessages.push(withMessageText(message, TOOL_OUTPUT_OMITTED));
        continue;
      }
      if (item && typeof compressed[item.id] === 'string' && compressed[item.id] !== item.text) {
        changed = true;
        nextMessages.push(withMessageText(message, compressed[item.id]));
      } else {
        nextMessages.push(message);
      }
    }
    if (typeof result.runtime.conversationSummary === 'string' && result.runtime.conversationSummary.trim() && dropped > 0) {
      changed = true;
      nextMessages.unshift({
        role: 'custom',
        customType: JEV_MEMORY_SUMMARY_CUSTOM_TYPE,
        content: result.runtime.conversationSummary.trim(),
        display: false,
        attribution: 'agent',
      });
    }
    return changed ? { messages: nextMessages } : {};
  });

  const handleToolCall = async (event = {}) => {
    const toolName = String(event.toolName || event.name || event.tool_name || event.tool || '');
    if (!toolName || !matcherRe.test(toolName)) return {};
    const toolInput = event.input ?? event.arguments ?? event.tool_input ?? {};
    const result = await invokeControllerHook({
      agent,
      profile,
      controllerPath,
      timeoutMs,
      input: {
        type: 'PreToolUse',
        hook_event_name: 'PreToolUse',
        agent,
        profile: profile || null,
        prompt: latestPrompt,
        task: latestPrompt,
        session_id: String(event.sessionId || event.session_id || 'native-session'),
        turn_id: String(event.turnId || event.turn_id || `turn-${generation}`),
        tool_name: toolName,
        tool_input: toolInput,
      },
    });
    const out = result?.hookSpecificOutput;
    if (!out || typeof out !== 'object') return {};
    if (out.permissionDecision === 'deny') {
      return {
        block: true,
        cancel: true,
        permissionDecision: 'deny',
        permissionDecisionReason: out.permissionDecisionReason || 'Jev withheld action.',
        reason: out.permissionDecisionReason || 'Jev withheld action.',
        hookSpecificOutput: out,
      };
    }
    if (typeof out.additionalContext === 'string' && out.additionalContext.trim()) {
      return {
        block: false,
        additionalContext: out.additionalContext.trim(),
        hookSpecificOutput: out,
      };
    }
    return {};
  };

  api.on('tool_call', handleToolCall);
  api.on('before_tool_call', handleToolCall);

  return { registered: true, agent, profile: profile || null, advisory: true };
}
