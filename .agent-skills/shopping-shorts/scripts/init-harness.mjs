#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);
const sources = [
  { root: path.join(skillRoot, 'templates', 'harness'), prefix: '' },
  { root: path.join(skillRoot, 'references'), prefix: 'references' },
  { root: path.join(skillRoot, 'templates', 'run'), prefix: path.join('_workspace', 'current') }
];

function usage(exitCode = 0) {
  console.log(`Usage: node scripts/init-harness.mjs --target /absolute/project [--apply]\n\nDefault is a read-only preview. --apply creates new files. Existing different files are never overwritten.`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
let target = null;
let apply = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--target') target = args[++i];
  else if (args[i] === '--apply') apply = true;
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!target) usage(2);
if (!path.isAbsolute(target)) throw new Error('--target must be an absolute path');

const targetStat = await fs.stat(target).catch(() => null);
if (!targetStat?.isDirectory()) throw new Error(`Target must be an existing directory: ${target}`);
const targetReal = await fs.realpath(target);
if (targetReal === path.parse(targetReal).root) throw new Error('Refusing to initialize at filesystem root');

const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
const runId = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}-product-slug`;
const createdAtKst = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
function renderTemplate(bytes) {
  return Buffer.from(bytes.toString('utf8')
    .replaceAll('__RUN_ID__', runId)
    .replaceAll('__CREATED_AT_KST__', createdAtKst));
}

async function walk(root, rel = '') {
  const out = [];
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const next = path.join(rel, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Template contains a symlink: ${next}`);
    if (entry.isDirectory()) out.push(...await walk(root, next));
    else if (entry.isFile()) out.push(next);
  }
  return out;
}

const plan = [];
const renderedByPath = new Map();
let collisions = 0;
for (const source of sources) {
  for (const rel of await walk(source.root)) {
    const from = path.join(source.root, rel);
    const targetRel = path.join(source.prefix, rel);
    const displayPath = targetRel.split(path.sep).join('/');
    const to = path.join(targetReal, targetRel);
    const [rawBytes, targetBytes] = await Promise.all([
      fs.readFile(from),
      fs.readFile(to).catch(() => null)
    ]);
    const sourceBytes = source.prefix ? renderTemplate(rawBytes) : rawBytes;
    renderedByPath.set(displayPath, sourceBytes);
    let action = 'create';
    if (targetBytes) {
      if (Buffer.compare(sourceBytes, targetBytes) === 0) action = 'same';
      else {
        action = 'collision';
        collisions += 1;
      }
    }
    plan.push({ action, path: displayPath });
  }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', target: targetReal, collisions, files: plan }, null, 2));
if (collisions > 0) {
  console.error('Refusing to overwrite existing different files. Move, merge, or review each collision first.');
  process.exit(2);
}
if (!apply) process.exit(0);

for (const item of plan) {
  if (item.action !== 'create') continue;
  const to = path.join(targetReal, item.path);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.writeFile(to, renderedByPath.get(item.path), { flag: 'wx' });
}
console.log(`Installed shopping-shorts harness into ${targetReal}`);
