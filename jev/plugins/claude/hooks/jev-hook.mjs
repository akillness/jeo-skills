#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeControllerHook } from '../shared/jev-controller.mjs';

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}

export async function runClaudeHook(args = process.argv.slice(2), inputStream = process.stdin) {
  const agent = readFlag(args, '--agent') || process.env.JEV_AGENT_ID || 'claude';
  const profile = readFlag(args, '--profile') || process.env.JEV_PROFILE || undefined;
  const result = await invokeControllerHook({ agent, profile, inputStream });
  const hookSpecificOutput = result?.hookSpecificOutput;
  return hookSpecificOutput && typeof hookSpecificOutput === 'object' ? { hookSpecificOutput } : {};
}

const isMain = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const result = await runClaudeHook();
  process.stdout.write(`${JSON.stringify(result || {})}\n`);
}
