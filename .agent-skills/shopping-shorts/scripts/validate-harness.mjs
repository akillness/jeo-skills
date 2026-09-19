#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PROGRAM_CATALOG, PUBLICATION_SURFACES, REQUIRED_PROGRAM_IDS } from './validate-commerce-research.mjs';

function usage(code = 0) {
  console.log('Usage: node scripts/validate-harness.mjs --root /absolute/project');
  process.exit(code);
}

const args = process.argv.slice(2);
let root;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--root') root = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!root) usage(2);
root = await fs.realpath(path.resolve(root));
const errors = [];
const warnings = [];
const checked = [];

const expectedAgents = [
  'shopping-shorts-director',
  'platform-revenue-researcher',
  'commerce-eligibility-auditor',
  'product-evidence-researcher',
  'creative-strategist',
  'open-generative-ai-operator',
  'assembly-editor',
  'policy-qa-reviewer',
  'release-controller'
];
const expectedSkills = ['shopping-shorts-orchestrator', 'open-generative-ai-video'];

async function readSafe(file) {
  const stat = await fs.lstat(file).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    errors.push(`missing or symlinked file: ${path.relative(root, file)}`);
    return '';
  }
  checked.push(path.relative(root, file).split(path.sep).join('/'));
  return fs.readFile(file, 'utf8');
}

function frontmatter(text, label) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${label}: missing YAML frontmatter`);
    return {};
  }
  const out = {};
  let current = null;
  for (const line of match[1].split('\n')) {
    const key = line.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/);
    if (key) {
      current = key[1];
      out[current] = key[2].replace(/^['"]|['"]$/g, '');
    } else if (current && /^\s+/.test(line)) {
      out[current] = `${out[current]} ${line.trim()}`.trim();
    }
  }
  return out;
}

for (const name of expectedAgents) {
  const file = path.join(root, '.claude', 'agents', `${name}.md`);
  const text = await readSafe(file);
  if (!text) continue;
  const fm = frontmatter(text, `.claude/agents/${name}.md`);
  if (fm.name !== name) errors.push(`${name}: frontmatter name mismatch`);
  if (!fm.description || fm.description.length < 40) errors.push(`${name}: description is missing or too short`);
  for (const section of ['Core Responsibilities', 'Input Protocol', 'Output Protocol']) {
    if (!text.includes(`## ${section}`)) errors.push(`${name}: missing section ${section}`);
  }
  const lines = text.split('\n').length;
  if (lines > 200) warnings.push(`${name}: ${lines} lines; consider condensing`);
}

const agentDir = path.join(root, '.claude', 'agents');
const actualAgents = (await fs.readdir(agentDir).catch(() => [])).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3));
for (const extra of actualAgents.filter((name) => !expectedAgents.includes(name))) warnings.push(`unowned extra agent: ${extra}`);

for (const name of expectedSkills) {
  const file = path.join(root, '.claude', 'skills', name, 'SKILL.md');
  const text = await readSafe(file);
  if (!text) continue;
  const fm = frontmatter(text, `.claude/skills/${name}/SKILL.md`);
  if (fm.name !== name) errors.push(`${name}: skill name mismatch`);
  if (!fm.description || fm.description.length < 50 || fm.description.length > 1024) errors.push(`${name}: description length must be 50..1024`);
  for (const section of ['When to use this skill', 'Instructions', 'Examples', 'Best practices']) {
    if (!text.includes(`## ${section}`)) errors.push(`${name}: missing section ${section}`);
  }
}

const claude = await readSafe(path.join(root, 'CLAUDE.md'));
for (const invariant of [
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1',
  '5482a777047c0df189eef989ff994d0d7a1d2874',
  '한 run = 한 상품',
  '유료 모델 호출과 업로드·게시',
  'G0 commerce',
  'G0a platform research',
  'G9 release approval',
  '20개 프로그램',
  '합성 글씨·자막·워터마크',
  'compliance_evidence',
  'selected-concept·render-plan SHA-256',
  '영상·클립·3개 프레임'
]) {
  if (!claude.includes(invariant)) errors.push(`CLAUDE.md: missing invariant ${invariant}`);
}

for (const required of [
  '.claude/agents/platform-revenue-researcher.md',
  'references/commerce-program-catalog.kr.json',
  'references/commerce-platform-research.md',
  'references/social-platform-research.md',
  'references/platform-compliance.md',
  'references/shopping-shorts-benchmark.kr.md',
  'references/hejhome-plan-validation.kr.md',
  'references/higgsfield-cli-evaluation.md',
  '_workspace/current/research/commerce-platforms.json',
  '_workspace/current/strategy/commerce-route.json',
  '_workspace/current/production/storyboard.md',
  '_workspace/current/assembly/timeline.json',
  '_workspace/current/assembly/captions.json',
  '_workspace/current/validation/commerce.json',
  '_workspace/current/validation/qa.json',
  '_workspace/current/release/receipt.json'
]) await readSafe(path.join(root, required));

const runTemplate = JSON.parse(await readSafe(path.join(root, '_workspace', 'current', 'run.json')) || '{}');
if (runTemplate.max_outputs !== 1) errors.push('run.json: max_outputs must be 1');
if (runTemplate.experience_mode !== 'sourced-only') errors.push('run.json: experience_mode must be sourced-only');
if (!(Number.isInteger(runTemplate.revision_loops) && runTemplate.revision_loops <= 2)) errors.push('run.json: revision_loops must be <=2');
const expectedGates = Array.from({ length: 10 }, (_, index) => `G${index}`);
const gateKeys = Object.keys(runTemplate.gates || {});
if (gateKeys.length !== expectedGates.length || !expectedGates.every((key) => gateKeys.includes(key))) errors.push('run.json: expected exactly G0..G9');

const projectCatalog = JSON.parse(await readSafe(path.join(root, 'references', 'commerce-program-catalog.kr.json')) || '{}');
if (JSON.stringify(projectCatalog.publication_surfaces || {}) !== JSON.stringify(PUBLICATION_SURFACES || {})) errors.push('commerce-program-catalog.kr.json: publication surfaces differ from installed skill');
for (const entry of projectCatalog.programs || []) {
  const expected = PROGRAM_CATALOG.get(entry.program_id);
  if (!expected || JSON.stringify(entry) !== JSON.stringify(expected)) errors.push(`commerce-program-catalog.kr.json: program differs from installed skill: ${entry.program_id}`);
}
if ((projectCatalog.programs || []).length !== REQUIRED_PROGRAM_IDS.length) errors.push('commerce-program-catalog.kr.json: program count differs from installed skill');

const commerceTemplate = JSON.parse(await readSafe(path.join(root, '_workspace', 'current', 'research', 'commerce-platforms.json')) || '{}');
for (const requiredId of REQUIRED_PROGRAM_IDS) {
  if (!(commerceTemplate.required_program_ids || []).includes(requiredId)) errors.push(`commerce-platforms.json: missing ${requiredId}`);
}
if ((commerceTemplate.programs || []).length < REQUIRED_PROGRAM_IDS.length) errors.push(`commerce-platforms.json: expected at least ${REQUIRED_PROGRAM_IDS.length} program stubs`);
const routeTemplate = JSON.parse(await readSafe(path.join(root, '_workspace', 'current', 'strategy', 'commerce-route.json')) || '{}');
if (!Array.isArray(routeTemplate.compliance_evidence)) errors.push('commerce-route.json: compliance_evidence must be an array');
const storyboardTemplate = await readSafe(path.join(root, '_workspace', 'current', 'production', 'storyboard.md'));
for (const marker of ['Selected concept SHA-256', 'Render plan SHA-256', 'generated_text_policy: forbid-generated-typography']) if (!storyboardTemplate.includes(marker)) errors.push(`storyboard.md: missing ${marker}`);
const qaTemplate = JSON.parse(await readSafe(path.join(root, '_workspace', 'current', 'validation', 'qa.json')) || '{}');
if (!qaTemplate.generated_text_review || !Array.isArray(qaTemplate.generated_text_review.source_clips) || !Array.isArray(qaTemplate.generated_text_review.frame_checks)) errors.push('qa.json: generated_text_review template is incomplete');

const result = {
  verdict: errors.length ? 'FAIL' : 'PASS',
  root,
  expected_agents: expectedAgents.length,
  expected_skills: expectedSkills.length,
  checked,
  errors,
  warnings
};
console.log(JSON.stringify(result, null, 2));
process.exit(errors.length ? 1 : 0);
