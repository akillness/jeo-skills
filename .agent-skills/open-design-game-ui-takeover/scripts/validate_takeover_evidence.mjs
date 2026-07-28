#!/usr/bin/env node

import path from 'node:path';
import { readAndValidateTakeoverEvidence } from './takeover_evidence.mjs';

function parseArgs(argv) {
  const out = { evidence: '', phase: 'review' };
  for (const raw of argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    if (match[1] === 'evidence') out.evidence = path.resolve(match[2]);
    if (match[1] === 'phase') out.phase = match[2];
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.evidence) throw new Error('--evidence=<takeover-evidence.json> is required');
if (!['review', 'approval'].includes(args.phase)) throw new Error('--phase must be review or approval');
const { result } = await readAndValidateTakeoverEvidence(args.evidence, { phase: args.phase });
console.log(JSON.stringify(result, null, 2));
