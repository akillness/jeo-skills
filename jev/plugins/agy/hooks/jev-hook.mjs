#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeControllerHook } from '../shared/jev-controller.mjs';

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || null : null;
}

export async function runAgyHook(args = process.argv.slice(2), inputStream = process.stdin) {
  const agent = readFlag(args, '--agent') || process.env.JEV_AGENT_ID || 'agy';
  const profile = readFlag(args, '--profile') || process.env.JEV_PROFILE || undefined;
  const result = await invokeControllerHook({ agent, profile, inputStream });
  if (result?.injectSteps) return { injectSteps: result.injectSteps, ...(result.hookSpecificOutput ? { hookSpecificOutput: result.hookSpecificOutput } : {}) };
  if (result?.hookSpecificOutput) return { hookSpecificOutput: result.hookSpecificOutput };
  return {};
}

const isMain = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
  const result = await runAgyHook();
  process.stdout.write(`${JSON.stringify(result || {})}\n`);
}
