#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function usage() {
  return [
    'Usage: validate-evals.mjs [evals.json] [--json]',
    '',
    'Validates the local ELI5 evaluation contract without calling a model.',
  ].join('\n');
}

function fail(message) {
  const error = new Error(message);
  error.name = 'ValidationError';
  throw error;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string`);
  }
}

function validate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('root must be an object');
  }
  if (payload.skill_name !== 'eli5') {
    fail('skill_name must equal "eli5"');
  }
  if (!Array.isArray(payload.evals) || payload.evals.length === 0) {
    fail('evals must be a non-empty array');
  }

  const ids = new Set();
  let assertionCount = 0;
  let routeOutCount = 0;

  for (let index = 0; index < payload.evals.length; index += 1) {
    const item = payload.evals[index];
    const label = `evals[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${label} must be an object`);
    }
    if (!Number.isInteger(item.id) || item.id < 1) {
      fail(`${label}.id must be a positive integer`);
    }
    if (ids.has(item.id)) {
      fail(`${label}.id duplicates ${item.id}`);
    }
    ids.add(item.id);
    nonEmptyString(item.prompt, `${label}.prompt`);
    nonEmptyString(item.expected_output, `${label}.expected_output`);
    if (!Array.isArray(item.assertions) || item.assertions.length < 3) {
      fail(`${label}.assertions must contain at least three items`);
    }
    for (let assertionIndex = 0; assertionIndex < item.assertions.length; assertionIndex += 1) {
      nonEmptyString(item.assertions[assertionIndex], `${label}.assertions[${assertionIndex}]`);
    }
    assertionCount += item.assertions.length;
    if (/route-out|routes? to|technical-writing|audit-verify-explain-grade-5/i.test(item.expected_output)) {
      routeOutCount += 1;
    }
  }

  if (routeOutCount < 2) {
    fail('eval suite must include at least two explicit route-out cases');
  }

  return {
    status: 'PASS',
    skill_name: payload.skill_name,
    evals: payload.evals.length,
    assertions: assertionCount,
    route_out_cases: routeOutCount,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(usage());
    return 0;
  }
  const jsonMode = args.includes('--json');
  const positional = args.filter((arg) => arg !== '--json');
  if (positional.length > 1 || args.some((arg) => arg.startsWith('-') && arg !== '--json')) {
    console.error(usage());
    return 2;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const inputPath = path.resolve(positional[0] ?? path.join(scriptDir, '..', 'evals', 'evals.json'));

  let payload;
  try {
    payload = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    console.error(`FAIL input=${inputPath} error=${error.message}`);
    return 1;
  }

  try {
    const report = validate(payload);
    if (jsonMode) {
      console.log(JSON.stringify({ ...report, input: inputPath }, null, 2));
    } else {
      console.log(
        `PASS skill=${report.skill_name} evals=${report.evals} assertions=${report.assertions} route_out_cases=${report.route_out_cases}`,
      );
    }
    return 0;
  } catch (error) {
    console.error(`FAIL input=${inputPath} error=${error.message}`);
    return 1;
  }
}

process.exitCode = await main();
