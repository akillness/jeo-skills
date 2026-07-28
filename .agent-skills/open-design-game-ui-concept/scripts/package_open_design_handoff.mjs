#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { contractProfileFor, resolveInside } from './contract_helpers.mjs';
import { REQUIRED_GENERATION_MODEL, REQUIRED_GENERATION_REASONING } from './open_design_generation_evidence.mjs';
import { readAndValidatePreservationContract } from '../../open-design-game-ui-handoff/scripts/preservation_contract.mjs';

const execFileAsync = promisify(execFile);
const REQUIRED_FILES = ['README.md', 'brief.md', 'DESIGN.md', 'preservation-contract.json', 'source-manifest.json', 'screenshots/manifest.json'];
const FORBIDDEN_NAMES = [/(^|\/)\.env($|\.)/i, /private[_-]?key/i, /api[_-]?token/i, /credentials/i, /kubeconfig/i];

function exactStringSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
}

function parseArgs(argv) {
  const out = { dir: '', zip: '' };
  for (const raw of argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'dir') out.dir = path.resolve(value);
    else if (['zip', 'out'].includes(key)) out.zip = path.resolve(value);
  }
  return out;
}

async function walk(root, current = root) {
  const out = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in handoff: ${relative}`);
    if (entry.isDirectory()) out.push(...await walk(root, absolute));
    else if (entry.isFile()) out.push({ absolute, relative, stat: await fs.stat(absolute) });
  }
  return out;
}

function assertWebpHeader(buffer, file) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Declared WebP has an invalid signature: ${file}`);
  }
}

async function assertFile(root, candidate, label) {
  const resolved = resolveInside(root, candidate, label);
  const stat = await fs.stat(resolved.absolute).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label} does not reference a file in the handoff: ${candidate}`);
  return resolved;
}

async function assertDirectory(root, candidate, label) {
  const resolved = resolveInside(root, candidate, label);
  const stat = await fs.stat(resolved.absolute).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label} does not reference a directory in the handoff: ${candidate}`);
  return resolved;
}

function resolveFromManifest(root, manifestRelative, candidate, label) {
  // Validate the raw value first so an absolute path cannot be normalized into the handoff.
  resolveInside(root, candidate, label);
  return resolveInside(root, path.join(path.dirname(manifestRelative), candidate), label);
}

const args = parseArgs(process.argv);
if (!args.dir) throw new Error('--dir=<handoff-folder> is required');
const handoffName = path.basename(args.dir);
args.zip ||= path.join(path.dirname(args.dir), `${handoffName}.zip`);
const packageReportPath = path.join(args.dir, 'package-report.json');
await fs.rm(packageReportPath, { force: true });

for (const name of REQUIRED_FILES) {
  await fs.access(path.join(args.dir, name)).catch(() => { throw new Error(`Missing required handoff file: ${name}`); });
}

const sourceManifest = JSON.parse(await fs.readFile(path.join(args.dir, 'source-manifest.json'), 'utf8'));
const contractProfile = contractProfileFor(sourceManifest.artifactContract?.contractProfile || 'meta-ui');
const brief = await fs.readFile(path.join(args.dir, 'brief.md'), 'utf8');
for (const needle of ['gpt-5.6-sol', 'ultra', 'DESIGN APPROVAL GATE', 'UPGRADE-ONLY', 'unspecified-preserve-runtime', contractProfile.artifactFile]) {
  if (!brief.includes(needle)) throw new Error(`brief.md must include: ${needle}`);
}
if (sourceManifest.artifactContract?.primaryFile !== contractProfile.artifactFile) {
  throw new Error(`artifactContract.primaryFile must be ${contractProfile.artifactFile} for profile ${contractProfile.id}`);
}
if (contractProfile.id === 'steam-title') {
  if (!exactStringSet(sourceManifest.artifactContract?.screens, contractProfile.screens)) {
    throw new Error(`steam-title artifactContract.screens must be exactly: ${contractProfile.screens.join(', ')}`);
  }
  const preserved = contractProfile.preservationSurfaces.filter((surface) => !contractProfile.screens.includes(surface));
  if (!exactStringSet(sourceManifest.artifactContract?.preservationOnlySurfaces, preserved)) {
    throw new Error(`steam-title artifactContract.preservationOnlySurfaces must be exactly: ${preserved.join(', ')}`);
  }
}
const generationContract = sourceManifest.generationContract;
if (generationContract?.agentId !== 'codex') throw new Error('source-manifest generationContract.agentId must be codex');
if (generationContract?.model !== REQUIRED_GENERATION_MODEL) throw new Error(`source-manifest generationContract.model must be ${REQUIRED_GENERATION_MODEL}`);
if (generationContract?.reasoning !== REQUIRED_GENERATION_REASONING) throw new Error(`source-manifest generationContract.reasoning must be ${REQUIRED_GENERATION_REASONING}`);
if (generationContract?.allowOverride !== false) throw new Error('source-manifest generationContract.allowOverride must be false');
if (Object.keys(generationContract || {}).sort().join(',') !== 'agentId,allowOverride,model,reasoning') {
  throw new Error('source-manifest generationContract must contain exactly agentId, model, reasoning, and allowOverride');
}
if (!sourceManifest.artifactContract?.primaryFile) throw new Error('source-manifest artifactContract.primaryFile is required');
if (!Array.isArray(sourceManifest.sourceFiles) || !sourceManifest.sourceFiles.length) throw new Error('source-manifest sourceFiles must not be empty');
if (!Array.isArray(sourceManifest.configFiles) || !sourceManifest.configFiles.length) throw new Error('source-manifest configFiles must not be empty');
if (!Array.isArray(sourceManifest.evidence?.characterAssets) || !sourceManifest.evidence.characterAssets.length) throw new Error('source-manifest evidence.characterAssets must not be empty');
if (!sourceManifest.evidence?.mapAssetsDir || !sourceManifest.evidence?.maskAssetsDir) throw new Error('source-manifest mapAssetsDir and maskAssetsDir are required');
const preservationContractReference = sourceManifest.evidence?.preservationContract || 'preservation-contract.json';
const preservationContractResolved = await assertFile(args.dir, preservationContractReference, 'source-manifest evidence.preservationContract');
const ownerReviewResolved = sourceManifest.evidence?.ownerReview
  ? await assertFile(args.dir, sourceManifest.evidence.ownerReview, 'source-manifest evidence.ownerReview')
  : null;
const expectedPreservationSurfaces = [
  ...(sourceManifest.artifactContract?.screens || []),
  ...(sourceManifest.artifactContract?.preservationOnlySurfaces || []),
];
const { contract: preservationContract, result: preservationResult } = await readAndValidatePreservationContract(preservationContractResolved.absolute, {
  expectedSurfaces: expectedPreservationSurfaces,
  expectedLocales: sourceManifest.artifactContract?.locales || [],
});
let motionManifestResolved = null;
let motionManifest = null;
if (preservationResult.motionCritical > 0) {
  const motionManifestReference = sourceManifest.evidence?.motionManifest;
  if (!motionManifestReference) throw new Error('source-manifest evidence.motionManifest is required for motion-critical surfaces');
  motionManifestResolved = await assertFile(args.dir, motionManifestReference, 'source-manifest evidence.motionManifest');
  motionManifest = JSON.parse(await fs.readFile(motionManifestResolved.absolute, 'utf8'));
  if (motionManifest.ok !== true) throw new Error('motion manifest must have ok === true');
  if (!Array.isArray(motionManifest.scenarios) || !motionManifest.scenarios.length) throw new Error('motion manifest has no scenarios');
  for (const scenario of motionManifest.scenarios) {
    if (scenario.ok !== true) throw new Error(`Motion scenario is not successful: ${scenario.id || 'unknown'}`);
  }
  const declaredMotionFiles = new Set();
  for (const scenario of motionManifest.scenarios) {
    if (scenario.video) declaredMotionFiles.add(path.posix.join(path.posix.dirname(motionManifestResolved.relative), scenario.video.replaceAll('\\', '/')));
    for (const frame of scenario.frames || []) {
      if (frame.path) declaredMotionFiles.add(path.posix.join(path.posix.dirname(motionManifestResolved.relative), frame.path.replaceAll('\\', '/')));
    }
  }
  for (const surface of preservationContract.surfaces.filter((item) => item.motionCritical)) {
    for (const video of surface.motionEvidence?.videos || []) {
      if (!declaredMotionFiles.has(video.path)) throw new Error(`Motion video is absent from motion manifest: ${video.path}`);
    }
    for (const frame of surface.motionEvidence?.keyframes || []) {
      if (!declaredMotionFiles.has(frame.path)) throw new Error(`Motion keyframe is absent from motion manifest: ${frame.path}`);
    }
  }
}
const screenshotManifestReference = sourceManifest.evidence?.screenshotManifest || 'screenshots/manifest.json';
const screenshotManifestResolved = await assertFile(args.dir, screenshotManifestReference, 'source-manifest evidence.screenshotManifest');
const screenshotManifestPath = screenshotManifestResolved.absolute;
const screenshotManifest = JSON.parse(await fs.readFile(screenshotManifestPath, 'utf8'));
if (screenshotManifest.ok !== true) throw new Error('screenshots/manifest.json must have ok === true');
if (!Array.isArray(screenshotManifest.scenarios) || !screenshotManifest.scenarios.length) throw new Error('Screenshot manifest has no scenarios');
if (sourceManifest.evidence?.screenshotCount !== screenshotManifest.scenarios.length) {
  throw new Error(`Screenshot count mismatch: source-manifest=${sourceManifest.evidence?.screenshotCount} manifest=${screenshotManifest.scenarios.length}`);
}

const validatedReferences = new Set([
  ...REQUIRED_FILES,
  preservationContractResolved.relative,
  ...(ownerReviewResolved ? [ownerReviewResolved.relative] : []),
  ...(motionManifestResolved ? [motionManifestResolved.relative] : []),
  screenshotManifestResolved.relative,
]);
const screenshotReferences = new Set();
for (const scenario of screenshotManifest.scenarios) {
  if (scenario.ok !== true) throw new Error(`Screenshot scenario is not successful: ${scenario.id || 'unknown'}`);
  const resolved = resolveFromManifest(args.dir, screenshotManifestResolved.relative, scenario.screenshot, `screenshot ${scenario.id || 'unknown'}`);
  const stat = await fs.stat(resolved.absolute).catch(() => null);
  if (!stat?.isFile()) throw new Error(`Screenshot does not exist in the handoff: ${scenario.screenshot}`);
  const buffer = await fs.readFile(resolved.absolute);
  if (path.extname(resolved.absolute).toLowerCase() !== '.webp') throw new Error(`Screenshot is not WebP: ${resolved.relative}`);
  assertWebpHeader(buffer.subarray(0, 12), resolved.relative);
  if (screenshotReferences.has(resolved.relative)) throw new Error(`Screenshot is referenced more than once: ${resolved.relative}`);
  screenshotReferences.add(resolved.relative);
  validatedReferences.add(resolved.relative);
}

if (sourceManifest.artifactContract?.primaryFile) {
  const resolved = await assertFile(args.dir, sourceManifest.artifactContract.primaryFile, 'artifactContract.primaryFile');
  validatedReferences.add(resolved.relative);
}
for (const [index, candidate] of (sourceManifest.evidence?.characterAssets || []).entries()) {
  const resolved = await assertFile(args.dir, candidate, `evidence.characterAssets[${index}]`);
  validatedReferences.add(resolved.relative);
}
for (const [field, label] of [['mapAssetsDir', 'evidence.mapAssetsDir'], ['maskAssetsDir', 'evidence.maskAssetsDir']]) {
  const candidate = sourceManifest.evidence?.[field];
  if (!candidate) continue;
  const resolved = await assertDirectory(args.dir, candidate, label);
  const assetFiles = await walk(args.dir, resolved.absolute);
  if (!assetFiles.length) throw new Error(`${label} must contain at least one file: ${candidate}`);
  validatedReferences.add(`${resolved.relative}/`);
}
for (const [index, entry] of (sourceManifest.sourceFiles || []).entries()) {
  const candidate = typeof entry === 'string' ? entry : entry?.path;
  const resolved = await assertFile(args.dir, candidate, `sourceFiles[${index}]`);
  validatedReferences.add(resolved.relative);
}
for (const [index, candidate] of (sourceManifest.configFiles || []).entries()) {
  const resolved = await assertFile(args.dir, candidate, `configFiles[${index}]`);
  validatedReferences.add(resolved.relative);
}

const files = await walk(args.dir);
for (const file of files) {
  if (FORBIDDEN_NAMES.some((pattern) => pattern.test(file.relative))) throw new Error(`Secret-like file is forbidden: ${file.relative}`);
  if (file.stat.size > 25 * 1024 * 1024) throw new Error(`Single handoff file exceeds 25 MB: ${file.relative}`);
}

await fs.rm(args.zip, { force: true });
await execFileAsync('zip', ['-q', '-r', args.zip, handoffName], { cwd: path.dirname(args.dir) });
const zipStat = await fs.stat(args.zip);
const { stdout: zipListing } = await execFileAsync('unzip', ['-Z1', args.zip]);
const zipEntries = new Set(zipListing.split(/\r?\n/).filter(Boolean));
for (const reference of validatedReferences) {
  const archiveReference = `${handoffName}/${reference}`;
  const present = reference.endsWith('/')
    ? [...zipEntries].some((entry) => entry.startsWith(archiveReference))
    : zipEntries.has(archiveReference);
  if (!present) throw new Error(`Validated handoff reference is missing from zip: ${reference}`);
}
for (const file of files) {
  if (!zipEntries.has(`${handoffName}/${file.relative}`)) throw new Error(`Handoff file is missing from zip: ${file.relative}`);
}
const result = {
  ok: true,
  handoffDir: args.dir,
  zip: args.zip,
  files: files.length,
  bytes: files.reduce((sum, file) => sum + file.stat.size, 0),
  zipBytes: zipStat.size,
  screenshotCount: screenshotManifest.scenarios.length,
  preservationSurfaces: preservationResult.surfaces,
  motionCriticalSurfaces: preservationResult.motionCritical,
  motionScenarios: motionManifest?.scenarios?.length || 0,
  contractProfile: contractProfile.id,
  generationContract,
  sourceKind: sourceManifest.kind || null,
};
await fs.writeFile(packageReportPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
