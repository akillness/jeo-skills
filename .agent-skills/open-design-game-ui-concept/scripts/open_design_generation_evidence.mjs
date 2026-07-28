import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseOpenDesignPreviewIdentity } from './contract_helpers.mjs';

export const GENERATION_EVIDENCE_SCHEMA = 'darkbone-open-design-generation/v1';
export const REQUIRED_GENERATION_MODEL = 'gpt-5.6-sol';
export const REQUIRED_GENERATION_REASONING = 'ultra';

const SHA256_RE = /^[a-f0-9]{64}$/;

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function shellTokens(command) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of String(command || '')) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (escaped) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

function optionValues(tokens, shortName, longName) {
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === shortName || token === longName) {
      if (tokens[index + 1]) values.push(tokens[index + 1]);
      index += 1;
    } else if (token.startsWith(`${longName}=`)) {
      values.push(token.slice(longName.length + 1));
    }
  }
  return values;
}

function generationCommandContract(command) {
  const tokens = shellTokens(command);
  const models = optionValues(tokens, '-m', '--model');
  const configs = optionValues(tokens, '-c', '--config');
  const reasoning = configs
    .map((value) => value.match(/^model_reasoning_effort=(.+)$/)?.[1])
    .filter(Boolean);
  return {
    models,
    reasoning,
    modelOk: models.length > 0 && models.every((value) => value === REQUIRED_GENERATION_MODEL),
    reasoningOk: reasoning.length > 0 && reasoning.every((value) => value === REQUIRED_GENERATION_REASONING),
  };
}

export function validateGenerationEvidence(evidence, expected = {}) {
  const errors = [];
  add(errors, evidence?.schemaVersion === GENERATION_EVIDENCE_SCHEMA, `schemaVersion must be ${GENERATION_EVIDENCE_SCHEMA}`);
  add(errors, evidence?.capturedWhileRunning === true, 'capturedWhileRunning must be true');
  add(errors, evidence?.model === REQUIRED_GENERATION_MODEL, `model must be ${REQUIRED_GENERATION_MODEL}`);
  add(errors, evidence?.reasoning === REQUIRED_GENERATION_REASONING, `reasoning must be ${REQUIRED_GENERATION_REASONING}`);
  add(errors, evidence?.run?.agentId === 'codex', 'run.agentId must be codex');
  add(errors, typeof evidence?.run?.id === 'string' && evidence.run.id.trim(), 'run.id is required');
  add(errors, evidence?.run?.status === 'succeeded', 'run.status must be succeeded');
  add(errors, evidence?.run?.exitCode === 0, 'run.exitCode must be 0');
  add(errors, typeof evidence?.run?.projectId === 'string' && evidence.run.projectId.trim(), 'run.projectId is required');
  add(errors, Number.isInteger(evidence?.run?.childPid) && evidence.run.childPid > 0, 'run.childPid must be a positive integer');

  const command = String(evidence?.process?.command || '');
  const commandContract = generationCommandContract(command);
  add(errors, Number.isInteger(evidence?.process?.pid) && evidence.process.pid > 0, 'process.pid must be a positive integer');
  add(errors, evidence?.process?.pid === evidence?.run?.childPid, 'process.pid must match run.childPid');
  add(errors, evidence?.process?.runStatusAtCapture === 'running', 'process.runStatusAtCapture must be running');
  add(errors, typeof evidence?.process?.capturedAt === 'string' && Number.isFinite(Date.parse(evidence.process.capturedAt)), 'process.capturedAt must be an ISO date');
  add(errors, command.trim(), 'process.command is required');
  add(errors, SHA256_RE.test(evidence?.process?.commandSha256 || ''), 'process.commandSha256 must be a lowercase SHA-256');
  add(errors, createHash('sha256').update(command).digest('hex') === evidence?.process?.commandSha256, 'process.commandSha256 does not match process.command');
  add(errors, commandContract.modelOk, `every process model override must be ${REQUIRED_GENERATION_MODEL}`);
  add(errors, commandContract.reasoningOk, `every process reasoning override must be model_reasoning_effort=${REQUIRED_GENERATION_REASONING}`);

  add(errors, evidence?.resultPackage?.schema === 'open-design.run-result-package.v1', 'resultPackage.schema is invalid');
  add(errors, Array.isArray(evidence?.resultPackage?.artifactFiles) && evidence.resultPackage.artifactFiles.length > 0, 'resultPackage.artifactFiles must not be empty');
  add(errors, typeof evidence?.artifact?.file === 'string' && evidence.artifact.file.trim(), 'artifact.file is required');
  add(errors, typeof evidence?.artifact?.previewUrl === 'string' && evidence.artifact.previewUrl.trim(), 'artifact.previewUrl is required');
  add(errors, typeof evidence?.artifact?.revisionId === 'string' && evidence.artifact.revisionId.trim(), 'artifact.revisionId is required');
  add(errors, SHA256_RE.test(evidence?.artifact?.sha256 || ''), 'artifact.sha256 must be a lowercase SHA-256');
  add(errors, evidence?.resultPackage?.artifactFiles?.includes(evidence?.artifact?.file), 'result package does not contain artifact.file');

  const identity = parseOpenDesignPreviewIdentity(evidence?.artifact?.previewUrl || '');
  add(errors, !!identity, 'artifact.previewUrl must be an immutable Open Design revision URL');
  if (identity) {
    add(errors, identity.projectId === evidence?.run?.projectId, 'artifact preview project does not match run.projectId');
    add(errors, identity.revisionId === evidence?.artifact?.revisionId, 'artifact preview revision does not match artifact.revisionId');
    add(errors, identity.file === evidence?.artifact?.file, 'artifact preview file does not match artifact.file');
  }

  for (const [field, actual] of [
    ['projectId', evidence?.run?.projectId],
    ['revisionId', evidence?.artifact?.revisionId],
    ['file', evidence?.artifact?.file],
    ['artifactSha256', evidence?.artifact?.sha256],
  ]) {
    if (expected[field] != null) add(errors, actual === expected[field], `${field} does not match expected generation evidence binding`);
  }

  if (errors.length) throw new Error(`Invalid Open Design generation evidence:\n- ${errors.join('\n- ')}`);
  return {
    ok: true,
    runId: evidence.run.id,
    projectId: evidence.run.projectId,
    revisionId: evidence.artifact.revisionId,
    file: evidence.artifact.file,
    artifactSha256: evidence.artifact.sha256,
    model: evidence.model,
    reasoning: evidence.reasoning,
    processCommandSha256: evidence.process.commandSha256,
  };
}

export async function readAndValidateGenerationEvidence(evidencePath, expected = {}) {
  const absolute = path.resolve(evidencePath);
  const bytes = await fs.readFile(absolute);
  const evidence = JSON.parse(bytes.toString('utf8'));
  const result = validateGenerationEvidence(evidence, expected);
  return {
    evidence,
    result,
    path: absolute,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
