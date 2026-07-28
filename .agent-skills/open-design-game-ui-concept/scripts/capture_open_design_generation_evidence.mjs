#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_EVIDENCE_SCHEMA,
  REQUIRED_GENERATION_MODEL,
  REQUIRED_GENERATION_REASONING,
  validateGenerationEvidence,
} from './open_design_generation_evidence.mjs';
import { parseOpenDesignPreviewIdentity } from './contract_helpers.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_DAEMON_LOG = path.join(
  process.env.HOME || '',
  'Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log',
);
const DEFAULT_GENERATION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function parseArgs(argv) {
  const out = { runId: '', artifact: '', daemonUrl: '', out: '', timeoutMs: DEFAULT_GENERATION_TIMEOUT_MS };
  for (const raw of argv.slice(2)) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (['run', 'run-id', 'runId'].includes(key)) out.runId = value;
    else if (['artifact', 'file'].includes(key)) out.artifact = value;
    else if (['daemon-url', 'daemonUrl'].includes(key)) out.daemonUrl = value.replace(/\/$/, '');
    else if (['out', 'output'].includes(key)) out.out = path.resolve(value);
    else if (['timeout-ms', 'timeoutMs'].includes(key)) out.timeoutMs = Number(value);
  }
  return out;
}

async function discoverDaemonUrl() {
  const text = await fs.readFile(DEFAULT_DAEMON_LOG, 'utf8');
  const matches = [...text.matchAll(/"url"\s*:\s*"(http:\/\/127\.0\.0\.1:\d+)"/g)];
  const url = matches.at(-1)?.[1];
  if (!url) throw new Error(`Could not discover Open Design daemon URL from ${DEFAULT_DAEMON_LOG}`);
  return url;
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const args = parseArgs(process.argv);
if (!args.runId) throw new Error('--run=<run-id> is required');
if (!args.artifact) throw new Error('--artifact=<file> is required');
if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) throw new Error('--timeout-ms must be >= 1000');
args.daemonUrl ||= await discoverDaemonUrl();
args.out ||= path.join(REPO_ROOT, '.omc/artifacts/open-design-generation-evidence', `${args.runId}.json`);

let processSnapshot = null;
const runningStatus = await waitFor(async () => {
  const status = await getJson(`${args.daemonUrl}/api/runs/${encodeURIComponent(args.runId)}`);
  if (status.status === 'failed' || status.status === 'canceled') throw new Error(`Open Design run ended before process capture: ${status.status}`);
  const pid = Number(status.childPid);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (status.status !== 'running') return null;
  const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
  const command = stdout.trim();
  if (!command) return null;
  processSnapshot = {
    pid,
    runStatusAtCapture: status.status,
    capturedAt: new Date().toISOString(),
    command,
    commandSha256: createHash('sha256').update(command).digest('hex'),
  };
  return status;
}, args.timeoutMs, 'the live Open Design Codex process');

if (!runningStatus.projectId) throw new Error('Open Design run has no projectId');
const finalStatus = await waitFor(async () => {
  const status = await getJson(`${args.daemonUrl}/api/runs/${encodeURIComponent(args.runId)}`);
  return ['succeeded', 'failed', 'canceled'].includes(status.status) ? status : null;
}, args.timeoutMs, 'the Open Design run to finish');

const resultPackage = await getJson(`${args.daemonUrl}/api/runs/${encodeURIComponent(args.runId)}/result-package`);
const preview = await getJson(
  `${args.daemonUrl}/api/projects/${encodeURIComponent(finalStatus.projectId)}/preview-url?file=${encodeURIComponent(args.artifact)}`,
);
const previewUrl = new URL(preview.url, args.daemonUrl).toString();
const identity = parseOpenDesignPreviewIdentity(previewUrl);
if (!identity) throw new Error('Open Design returned a mutable or unparseable preview URL');
const artifactResponse = await fetch(previewUrl);
if (!artifactResponse.ok) throw new Error(`${artifactResponse.status} ${previewUrl}: artifact fetch failed`);
const artifactSha256 = createHash('sha256').update(Buffer.from(await artifactResponse.arrayBuffer())).digest('hex');

const evidence = {
  schemaVersion: GENERATION_EVIDENCE_SCHEMA,
  capturedAt: new Date().toISOString(),
  capturedWhileRunning: true,
  daemonUrl: args.daemonUrl,
  model: REQUIRED_GENERATION_MODEL,
  reasoning: REQUIRED_GENERATION_REASONING,
  run: {
    id: finalStatus.id,
    status: finalStatus.status,
    exitCode: finalStatus.exitCode,
    childPid: finalStatus.childPid || runningStatus.childPid,
    projectId: finalStatus.projectId,
    conversationId: finalStatus.conversationId || null,
    agentId: finalStatus.agentId,
    createdAt: finalStatus.createdAt,
    updatedAt: finalStatus.updatedAt,
  },
  process: processSnapshot,
  resultPackage: {
    schema: resultPackage.schema,
    artifactFiles: (resultPackage.artifacts || []).map((artifact) => artifact.file),
  },
  artifact: {
    file: args.artifact,
    previewUrl,
    revisionId: identity.revisionId,
    sha256: artifactSha256,
  },
};
validateGenerationEvidence(evidence);
await fs.mkdir(path.dirname(args.out), { recursive: true });
await fs.writeFile(args.out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, out: args.out, runId: args.runId, projectId: finalStatus.projectId, revisionId: identity.revisionId, artifactSha256 }, null, 2));
