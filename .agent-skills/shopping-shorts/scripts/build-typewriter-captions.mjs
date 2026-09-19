#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { captionPlanSha256, renderCaptionAss, validateCaptionPlan } from './caption-contract.mjs';

function usage(code = 0) {
  console.log('Usage: node scripts/build-typewriter-captions.mjs --input assembly/captions.json --output assembly/captions.ass');
  process.exit(code);
}

const args = process.argv.slice(2);
let inputPath;
let outputPath;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--input') inputPath = args[++index];
  else if (args[index] === '--output') outputPath = args[++index];
  else if (args[index] === '--help' || args[index] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[index]}`);
}
if (!inputPath || !outputPath) usage(2);

inputPath = path.resolve(inputPath);
outputPath = path.resolve(outputPath);

async function assertNoSymlinkSegments(rootPath, targetPath, label) {
  const rootAbsolute = path.resolve(rootPath);
  const targetAbsolute = path.resolve(targetPath);
  const relative = path.relative(rootAbsolute, targetAbsolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the lexical run root`);
  let current = rootAbsolute;
  for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat) throw new Error(`${label} contains a missing path segment`);
    if (stat.isSymbolicLink()) throw new Error(`${label} contains a symlinked path segment`);
  }
}

const lexicalAssemblyDir = path.dirname(inputPath);
const lexicalRunRoot = path.dirname(lexicalAssemblyDir);
await assertNoSymlinkSegments(lexicalRunRoot, inputPath, 'caption input');
await assertNoSymlinkSegments(lexicalRunRoot, path.dirname(outputPath), 'caption output');
const inputStat = await fs.lstat(inputPath).catch(() => null);
if (!inputStat?.isFile()) throw new Error('caption input must be a regular non-symlink file');
const outputStat = await fs.lstat(outputPath).catch(() => null);
if (outputStat?.isSymbolicLink()) throw new Error('caption output must not be a symlink');
const inputReal = await fs.realpath(inputPath);
const runRoot = await fs.realpath(lexicalRunRoot);
const outputParent = await fs.realpath(path.dirname(outputPath)).catch(() => null);
if (!outputParent || (outputParent !== runRoot && !outputParent.startsWith(`${runRoot}${path.sep}`))) throw new Error('caption output must stay inside the run root');
if (outputPath === inputReal) throw new Error('caption output must differ from input');

const inputBytes = await fs.readFile(inputReal);
const inputSha256 = captionPlanSha256(inputBytes);
const plan = JSON.parse(inputBytes.toString('utf8'));
const validation = validateCaptionPlan(plan);
if (validation.errors.length) {
  console.error(JSON.stringify({ verdict: 'FAIL', errors: validation.errors }, null, 2));
  process.exit(1);
}
const ass = renderCaptionAss(plan, inputSha256);
await fs.writeFile(outputPath, ass, { flag: 'wx' }).catch((error) => {
  if (error.code === 'EEXIST') throw new Error(`Refusing to overwrite existing caption output: ${outputPath}`);
  throw error;
});
console.log(JSON.stringify({ verdict: 'PASS', input: inputReal, input_sha256: inputSha256, output: outputPath, cue_count: validation.normalizedCues.length, event_count: validation.eventCount, max_lines: 2, animation: 'typewriter', artifact_sha256: captionPlanSha256(Buffer.from(ass)) }, null, 2));
