#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SKILL_NAME = 'open-generative-ai';
const MIN_EVALS = 8;
const MIN_SAFETY_CASES = 5;
const MIN_ROUTE_OUT_CASES = 1;

const SAFETY_PATTERN =
  /(confirm|approval|approve|consent|do not|does not|never|refus|decline|without executing|before (?:download|install|running|executing)|not print|never print)/i;
const ROUTE_OUT_PATTERN = /(route|defer|hand off|instead of this skill|another skill|`[a-z0-9-]+`)/i;

function usage() {
  return [
    'Usage: validate-evals.mjs [--json] [path/to/evals.json]',
    '',
    'Validates the eval suite contract for the open-generative-ai skill.',
    'Exits non-zero when the suite is structurally invalid or too weak.',
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
  if (payload.skill_name !== SKILL_NAME) {
    fail(`skill_name must equal "${SKILL_NAME}"`);
  }
  if (!Array.isArray(payload.evals) || payload.evals.length < MIN_EVALS) {
    fail(`evals must contain at least ${MIN_EVALS} cases`);
  }

  const ids = new Set();
  let assertionCount = 0;
  let safetyCaseCount = 0;
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
      fail(`${label}.id ${item.id} is duplicated`);
    }
    ids.add(item.id);

    nonEmptyString(item.prompt, `${label}.prompt`);
    nonEmptyString(item.expected_output, `${label}.expected_output`);

    if (!Array.isArray(item.assertions) || item.assertions.length < 2) {
      fail(`${label}.assertions must contain at least two assertions`);
    }
    for (let j = 0; j < item.assertions.length; j += 1) {
      nonEmptyString(item.assertions[j], `${label}.assertions[${j}]`);
    }
    assertionCount += item.assertions.length;

    const haystack = [item.expected_output, ...item.assertions].join(' \u0000 ');
    if (SAFETY_PATTERN.test(haystack)) {
      safetyCaseCount += 1;
    }
    if (ROUTE_OUT_PATTERN.test(haystack)) {
      routeOutCount += 1;
    }
  }

  if (safetyCaseCount < MIN_SAFETY_CASES) {
    fail(
      `eval suite must include at least ${MIN_SAFETY_CASES} explicit safety-boundary cases ` +
        `(found ${safetyCaseCount})`
    );
  }
  if (routeOutCount < MIN_ROUTE_OUT_CASES) {
    fail(
      `eval suite must include at least ${MIN_ROUTE_OUT_CASES} explicit route-out case ` +
        `(found ${routeOutCount})`
    );
  }

  return {
    skill: SKILL_NAME,
    status: 'PASS',
    eval_count: payload.evals.length,
    assertion_count: assertionCount,
    safety_cases: safetyCaseCount,
    route_out_cases: routeOutCount,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }

  const asJson = argv.includes('--json');
  const positional = argv.filter((entry) => !entry.startsWith('-'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = positional[0]
    ? path.resolve(process.cwd(), positional[0])
    : path.resolve(here, '..', 'evals', 'evals.json');

  let payload;
  try {
    payload = JSON.parse(await readFile(target, 'utf8'));
  } catch (error) {
    const message = `cannot read or parse ${target}: ${error.message}`;
    if (asJson) {
      console.log(JSON.stringify({ skill: SKILL_NAME, status: 'FAIL', error: message }, null, 2));
    } else {
      console.error(`FAIL: ${message}`);
    }
    return 1;
  }

  try {
    const result = validate(payload);
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `PASS: ${result.eval_count} evals, ${result.assertion_count} assertions, ` +
          `${result.safety_cases} safety cases, ${result.route_out_cases} route-out cases`
      );
    }
    return 0;
  } catch (error) {
    if (asJson) {
      console.log(
        JSON.stringify({ skill: SKILL_NAME, status: 'FAIL', error: error.message }, null, 2)
      );
    } else {
      console.error(`FAIL: ${error.message}`);
    }
    return 1;
  }
}

process.exitCode = await main();
