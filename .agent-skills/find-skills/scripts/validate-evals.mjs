#!/usr/bin/env node

// Generic eval-suite contract validator.
// Derives the expected skill name from its own location (../../<name>/scripts),
// so the same file is valid inside any skill directory without editing.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIN_EVALS = 8;
const MIN_SAFETY_CASES = 3;
const MIN_ROUTE_OUT_CASES = 1;
const MIN_ASSERTIONS_PER_EVAL = 2;

const SAFETY_PATTERN =
  /(confirm|approval|approve|consent|do not|does not|never|refus|decline|without executing|before (?:download|install|running|executing)|not print|never print|untrusted|red flag)/i;
const ROUTE_OUT_PATTERN = /(route|defer|hand off|instead of this skill|another skill|`[a-z0-9-]+`)/i;

function usage() {
  return [
    'Usage: validate-evals.mjs [--json] [path/to/evals.json]',
    '',
    'Validates a skill eval suite: structure, uniqueness, assertion depth,',
    'safety-boundary coverage, and at least one route-out case.',
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

function validate(payload, expectedName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('root must be an object');
  }
  nonEmptyString(payload.skill_name, 'skill_name');
  if (expectedName && payload.skill_name !== expectedName) {
    fail(`skill_name is "${payload.skill_name}" but the directory is "${expectedName}"`);
  }
  if (!Array.isArray(payload.evals) || payload.evals.length < MIN_EVALS) {
    fail(`evals must contain at least ${MIN_EVALS} cases`);
  }

  const ids = new Set();
  const prompts = new Set();
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

    const key = item.prompt.trim();
    if (prompts.has(key)) {
      fail(`${label}.prompt duplicates an earlier case`);
    }
    prompts.add(key);

    if (!Array.isArray(item.assertions) || item.assertions.length < MIN_ASSERTIONS_PER_EVAL) {
      fail(`${label}.assertions must contain at least ${MIN_ASSERTIONS_PER_EVAL} assertions`);
    }
    for (let j = 0; j < item.assertions.length; j += 1) {
      nonEmptyString(item.assertions[j], `${label}.assertions[${j}]`);
    }
    assertionCount += item.assertions.length;

    const haystack = [item.expected_output, ...item.assertions].join(' \u0000 ');
    if (SAFETY_PATTERN.test(haystack)) safetyCaseCount += 1;
    if (ROUTE_OUT_PATTERN.test(haystack)) routeOutCount += 1;
  }

  if (safetyCaseCount < MIN_SAFETY_CASES) {
    fail(
      `eval suite must include at least ${MIN_SAFETY_CASES} safety-boundary cases ` +
        `(found ${safetyCaseCount})`
    );
  }
  if (routeOutCount < MIN_ROUTE_OUT_CASES) {
    fail(
      `eval suite must include at least ${MIN_ROUTE_OUT_CASES} route-out case ` +
        `(found ${routeOutCount})`
    );
  }

  return {
    skill: payload.skill_name,
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
  const skillDir = path.resolve(here, '..');
  const expectedName = path.basename(skillDir);
  const target = positional[0]
    ? path.resolve(process.cwd(), positional[0])
    : path.join(skillDir, 'evals', 'evals.json');

  const emitFailure = (message) => {
    if (asJson) {
      console.log(JSON.stringify({ skill: expectedName, status: 'FAIL', error: message }, null, 2));
    } else {
      console.error(`FAIL: ${message}`);
    }
  };

  let payload;
  try {
    payload = JSON.parse(await readFile(target, 'utf8'));
  } catch (error) {
    emitFailure(`cannot read or parse ${target}: ${error.message}`);
    return 1;
  }

  try {
    // Only enforce the directory match when reading this skill's own default file.
    const result = validate(payload, positional[0] ? null : expectedName);
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `PASS: ${result.skill} — ${result.eval_count} evals, ${result.assertion_count} assertions, ` +
          `${result.safety_cases} safety cases, ${result.route_out_cases} route-out cases`
      );
    }
    return 0;
  } catch (error) {
    emitFailure(error.message);
    return 1;
  }
}

process.exitCode = await main();
