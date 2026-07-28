#!/usr/bin/env node

import path from 'node:path';
import { readAndValidatePreservationContract } from './preservation_contract.mjs';

function parseArgs(argv) {
  const out = { contract: '', expectedSurfaces: [], expectedLocales: [] };
  for (const raw of argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    if (match[1] === 'contract') out.contract = path.resolve(match[2]);
    if (match[1] === 'expected-surfaces') out.expectedSurfaces = match[2].split(',').map((item) => item.trim()).filter(Boolean);
    if (match[1] === 'expected-locales') out.expectedLocales = match[2].split(',').map((item) => item.trim()).filter(Boolean);
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.contract) throw new Error('--contract=<preservation-contract.json> is required');
const { result } = await readAndValidatePreservationContract(args.contract, {
  expectedSurfaces: args.expectedSurfaces,
  expectedLocales: args.expectedLocales,
});
console.log(JSON.stringify(result, null, 2));
