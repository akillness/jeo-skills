#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { validateGeneratedTypographyPolicy } from './generation-policy.mjs';

const PINNED_REPO = 'https://github.com/Anil-matcha/Open-Generative-AI';
const PINNED_SHA = '5482a777047c0df189eef989ff994d0d7a1d2874';

function usage(code = 0) {
  console.log('Usage: node scripts/prepare-render-plan.mjs --input render-plan.json --out provider-requests.json');
  process.exit(code);
}

const args = process.argv.slice(2);
let input;
let output;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--input') input = args[++i];
  else if (args[i] === '--out') output = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!input || !output) usage(2);

const plan = JSON.parse(await fs.readFile(input, 'utf8'));
const errors = [];
const blockers = [];
const allowedModes = new Set(['t2v', 'i2v', 'v2v', 'recast', 'lipsync']);
const credentialFieldPattern = /(api.?key|authorization|cookie|password|secret|token|credential)/i;

function scanCredentials(value, label, out) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanCredentials(item, `${label}[${index}]`, out));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /Bearer\s+[A-Za-z0-9._~+\/-]{12,}/i.test(value)) out.push(`${label} appears to contain a bearer token`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const field = `${label}.${key}`;
    if (credentialFieldPattern.test(key)) out.push(`${field} is a credential field`);
    scanCredentials(item, field, out);
  }
}

if (plan.source_repo !== PINNED_REPO) errors.push('source_repo must be the audited Open-Generative-AI repository');
if (plan.source_sha !== PINNED_SHA) errors.push(`source_sha must equal audited SHA ${PINNED_SHA}`);
if (!['muapi-api', 'open-generative-ai-gui', 'wan2gp-gradio'].includes(plan.execution_surface)) errors.push('unsupported execution_surface');
errors.push(...validateGeneratedTypographyPolicy(plan));
if (plan.output?.width !== 1080 || plan.output?.height !== 1920) errors.push('output must be 1080x1920');
if (!(Number.isFinite(plan.output?.fps) && plan.output.fps >= 24 && plan.output.fps <= 60)) errors.push('output fps must be 24..60');
if (!(Number.isFinite(plan.output?.duration_seconds) && plan.output.duration_seconds >= 15 && plan.output.duration_seconds <= 60)) errors.push('output duration must be 15..60 seconds');
if (!Array.isArray(plan.shots) || plan.shots.length < 1 || plan.shots.length > 8) errors.push('shots must contain 1..8 entries');

const seenIds = new Set();
const seenOutputs = new Set();
let summedDuration = 0;
for (const [index, shot] of (plan.shots || []).entries()) {
  const label = `shots[${index}]`;
  if (!/^s\d{2,}$/.test(shot.shot_id || '')) errors.push(`${label}.shot_id is invalid`);
  if (seenIds.has(shot.shot_id)) errors.push(`${label}.shot_id is duplicated`);
  seenIds.add(shot.shot_id);
  if (!allowedModes.has(shot.mode)) errors.push(`${label}.mode is unsupported`);
  if (typeof shot.endpoint !== 'string' || !shot.endpoint.trim() || /\s/.test(shot.endpoint)) errors.push(`${label}.endpoint must be a verified non-empty endpoint`);
  if (!(Number.isFinite(shot.duration_seconds) && shot.duration_seconds > 0 && shot.duration_seconds <= 30)) errors.push(`${label}.duration_seconds must be >0 and <=30`);
  summedDuration += Number(shot.duration_seconds || 0);
  if (shot.aspect_ratio !== '9:16') errors.push(`${label}.aspect_ratio must be 9:16`);
  if (typeof shot.prompt !== 'string' || shot.prompt.trim().length < 10) errors.push(`${label}.prompt is too short`);
  if (!Array.isArray(shot.source_asset_ids) || !Array.isArray(shot.claim_ids)) errors.push(`${label} asset and claim ids must be arrays`);
  if (typeof shot.output_path !== 'string' || !shot.output_path.trim()) errors.push(`${label}.output_path is missing`);
  if (seenOutputs.has(shot.output_path)) errors.push(`${label}.output_path is duplicated`);
  seenOutputs.add(shot.output_path);

  const payload = shot.provider_payload || {};
  const credentialFindings = [];
  scanCredentials(payload, `${label}.provider_payload`, credentialFindings);
  errors.push(...credentialFindings);
}
if (Math.abs(summedDuration - Number(plan.output?.duration_seconds || 0)) > 0.5) errors.push(`shot durations (${summedDuration}) must equal output duration (${plan.output?.duration_seconds})`);

if (plan.estimated_cost === null || !Number.isFinite(plan.estimated_cost)) blockers.push('cost-not-verified');
if (!plan.balance_verified && plan.execution_surface === 'muapi-api') blockers.push('balance-not-verified');
if (!plan.paid_execution_approved && plan.execution_surface === 'muapi-api') blockers.push('paid-execution-not-approved');
if (plan.execution_surface === 'muapi-api' && (plan.shots || []).some((shot) => !shot.provider_payload || Object.keys(shot.provider_payload).length === 0)) blockers.push('model-specific-provider-payload-missing');
if (plan.execution_surface === 'open-generative-ai-gui') blockers.push('manual-gui-handoff-required');
if (plan.execution_surface === 'wan2gp-gradio') blockers.push('wan2gp-runner-not-configured');

if (errors.length) {
  console.error(JSON.stringify({ verdict: 'FAIL', errors, blockers }, null, 2));
  process.exit(1);
}

const requests = (plan.shots || []).map((shot) => {
  const endpoint = shot.endpoint.replace(/^https:\/\/api\.muapi\.ai\/api\/v1\//, '').replace(/^\/api\/v1\//, '').replace(/^\//, '');
  if (plan.execution_surface === 'muapi-api') {
    return {
      shot_id: shot.shot_id,
      method: 'POST',
      url: `https://api.muapi.ai/api/v1/${endpoint}`,
      auth: { header: 'x-api-key', environment_variable: 'MUAPI_API_KEY' },
      body: shot.provider_payload || {},
      normalized_intent: {
        prompt: shot.prompt,
        duration_seconds: shot.duration_seconds,
        aspect_ratio: shot.aspect_ratio,
        resolution: shot.resolution,
        source_asset_ids: shot.source_asset_ids,
        claim_ids: shot.claim_ids,
        generated_text_policy: plan.generated_text_policy,
        forbidden_generated_elements: ['synthetic typography', 'subtitles', 'watermarks']
      },
      output_path: shot.output_path
    };
  }
  return {
    shot_id: shot.shot_id,
    execution_surface: plan.execution_surface,
    endpoint,
    normalized_intent: {
      prompt: shot.prompt,
      duration_seconds: shot.duration_seconds,
      aspect_ratio: shot.aspect_ratio,
      resolution: shot.resolution,
      source_asset_ids: shot.source_asset_ids,
      claim_ids: shot.claim_ids,
      generated_text_policy: plan.generated_text_policy,
      forbidden_generated_elements: ['synthetic typography', 'subtitles', 'watermarks']
    },
    output_path: shot.output_path,
    requires_manual_finish: true
  };
});

const packet = {
  schema_version: 1,
  source_repo: PINNED_REPO,
  source_sha: PINNED_SHA,
  execution_surface: plan.execution_surface,
  generated_text_policy: plan.generated_text_policy,
  estimated_cost: plan.estimated_cost,
  currency: plan.currency,
  ready_to_submit: blockers.length === 0,
  blockers: [...new Set(blockers)],
  requests
};

await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(packet, null, 2)}\n`, { flag: 'wx' }).catch(async (error) => {
  if (error.code !== 'EEXIST') throw error;
  const existing = await fs.readFile(output, 'utf8');
  const next = `${JSON.stringify(packet, null, 2)}\n`;
  if (existing !== next) throw new Error(`Refusing to overwrite different output: ${output}`);
});
console.log(JSON.stringify({ verdict: 'PASS', output: path.resolve(output), ready_to_submit: packet.ready_to_submit, blockers: packet.blockers, request_count: requests.length }, null, 2));
