#!/usr/bin/env node
// Read-only artifact audit. No pipeline implementation, authorization or execution.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const STAGES = Object.freeze(['collect', 'build_core', 'build_mart', 'health', 'signals', 'render', 'inbox']);
export const DEPENDENCIES = Object.freeze({ collect: [], build_core: ['collect'], build_mart: ['build_core'], health: ['build_mart'], signals: ['build_mart', 'health'], render: ['build_mart', 'health', 'signals'], inbox: ['health', 'signals'] });
export const MAX_BYTES = 5 * 1024 * 1024;
export const FINGERPRINT_DEFINITION = 'SHA256(UTF8(JSON.stringify([pipeline_version, config_actual_file_sha256, period, mode, stage_name, ...upstream_actual_output_sha256]))); dependencies are traversed in declared order, outputs in manifest order; collect uses sources in manifest order instead.';
const LIMITATIONS = [
  'Metric measurement and content legitimacy are not rederived.',
  'manifest.sources (raw), collect, build_core and build_mart payloads are opaque bytes: UTF-8 validity, domain JSON, domain schema, canonical outputs and actual transforms are not verified.',
  'Censoring checks validate only the declared boolean and required reason structure; actual window correctness is not verified.',
  'HTML checks are structural only; browser QA and numeric/narrative review remain separate.',
  'mtime freshness is not provenance; touching files cannot certify a new run.',
  'Manifest binding is structural; authorship and authorization are not certified.',
  'Concurrent adversarial filesystem mutation is outside this portable path-check guarantee.',
  'No commands, network requests, state writes or quarantine releases are performed.'
];
const SHA = /^[a-f0-9]{64}$/;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const text = v => typeof v === 'string' && v.trim().length > 0;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fingerprint = tuple => sha256(Buffer.from(JSON.stringify(tuple), 'utf8'));
class AuditError extends Error { constructor(code) { super(code); this.code = code; } }
const requireValue = (condition, code) => { if (!condition) throw new AuditError(code); };
const envelope = (command, status) => ({ schema_version: 1, command, status, verification_scope: 'artifact-integrity-and-structure-only', authority: 'not-certified', fingerprint_definition: FINGERPRINT_DEFINITION, limitations: LIMITATIONS });

export function validISOWeek(period) {
  if (typeof period !== 'string' || !/^\d{4}-W\d{2}$/.test(period)) return false;
  const year = Number(period.substring(0, 4)), week = Number(period.substring(6));
  const jan = new Date(0); jan.setUTCFullYear(year, 0, 1); jan.setUTCHours(0, 0, 0, 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = jan.getUTCDay() === 4 || (jan.getUTCDay() === 3 && leap) ? 53 : 52;
  return year >= 1 && week >= 1 && week <= last;
}
export function parseSince(value) {
  if (value === undefined) return undefined;
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(match, 'invalid_since');
  const [, y, mo, day, h, mi, s, zone] = match;
  const date = new Date(0); date.setUTCFullYear(Number(y), Number(mo) - 1, Number(day));
  requireValue(Number(y) >= 1 && date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(day) && Number(h) < 24 && Number(mi) < 60 && Number(s) < 60, 'invalid_since');
  requireValue(zone === 'Z' || (Number(zone.substring(1, 3)) < 24 && Number(zone.substring(4)) < 60), 'invalid_since');
  const result = Date.parse(value); requireValue(Number.isFinite(result), 'invalid_since'); return result;
}
export function relativePath(value) {
  requireValue(text(value) && !/[\u0000-\u001f\u007f:<>"|?*]/.test(value) && !/^[\\/]/.test(value) && !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value), 'unsafe_path');
  const parts = value.replaceAll('\\', '/').split('/');
  requireValue(parts.every(p => p && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'unsafe_path');
  return parts.join('/');
}
async function inspectChain(absolute, directory) {
  const parsed = path.parse(absolute); let current = parsed.root;
  const parts = absolute.substring(parsed.root.length).split(path.sep).filter(Boolean);
  let stat = await fs.lstat(current);
  requireValue(!stat.isSymbolicLink(), 'symlink_blocked');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]); stat = await fs.lstat(current);
    requireValue(!stat.isSymbolicLink(), 'symlink_blocked');
    requireValue(i === parts.length - 1 && !directory ? stat.isFile() : stat.isDirectory(), 'invalid_file_type');
  }
  return stat;
}
async function reader(root) {
  requireValue(text(root) && !root.includes('\0') && !root.replaceAll('\\', '/').split('/').includes('..'), 'invalid_root');
  const absolute = path.resolve(root); await inspectChain(absolute, true);
  let count = 0;
  return async relative => {
    requireValue(++count <= 1000, 'too_many_artifacts');
    const safe = relativePath(relative), target = path.resolve(absolute, ...safe.split('/'));
    const inside = path.relative(absolute, target);
    requireValue(inside && !inside.startsWith(`..${path.sep}`) && !path.isAbsolute(inside), 'path_escape');
    const before = await inspectChain(target, false);
    requireValue(before.size <= MAX_BYTES, 'file_too_large');
    const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      requireValue(opened.isFile() && opened.ino === before.ino && opened.dev === before.dev, 'file_changed_during_read');
      requireValue(opened.size <= MAX_BYTES, 'file_too_large');
      const buffer = Buffer.alloc(opened.size + 1); let offset = 0;
      while (offset < buffer.length) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null); if (!bytesRead) break; offset += bytesRead; }
      const after = await handle.stat(), chain = await inspectChain(target, false);
      requireValue(offset === opened.size && after.size === opened.size && after.mtimeMs === opened.mtimeMs && after.ctimeMs === opened.ctimeMs && chain.ino === opened.ino && chain.dev === opened.dev, 'file_changed_during_read');
      const bytes = buffer.subarray(0, offset);
      return { bytes, sha256: sha256(bytes), mtimeMs: after.mtimeMs };
    } finally { await handle.close(); }
  };
}
function json(file) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)); }
  catch { throw new AuditError('invalid_json'); }
}
function fileText(file) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); }
  catch { throw new AuditError('invalid_utf8'); }
}
function fileRefs(refs, allowEmpty) {
  requireValue(Array.isArray(refs) && refs.length <= 1000 && (allowEmpty || refs.length > 0), 'invalid_artifacts');
  for (const ref of refs) { requireValue(object(ref) && SHA.test(ref.sha256), 'invalid_artifact_reference'); relativePath(ref.path); }
}
function validate(manifest, config) {
  requireValue(object(manifest) && manifest.schema_version === 1 && text(manifest.run_id) && text(manifest.pipeline_version) && validISOWeek(manifest.period) && ['weekly', 'backfill'].includes(manifest.mode), 'invalid_manifest');
  relativePath(manifest.config_path);
  requireValue(object(config) && Number.isFinite(config.min_coverage) && config.min_coverage >= 0 && config.min_coverage <= 1 && integer(config.max_previous_week_flips) && [0, 1].includes(config.retry_limit), 'invalid_config');
  requireValue(integer(manifest.retry_count) && manifest.retry_count <= config.retry_limit, 'invalid_retry_count');
  requireValue(object(manifest.stages) && Object.keys(manifest.stages).length === STAGES.length && STAGES.every(n => Object.hasOwn(manifest.stages, n)), 'invalid_stages');
  fileRefs(manifest.sources, false);
  const used = new Set([relativePath(manifest.config_path)]);
  for (const ref of manifest.sources) { const p = relativePath(ref.path); requireValue(!used.has(p), 'duplicate_artifact'); used.add(p); }
  for (const name of STAGES) {
    const stage = manifest.stages[name];
    requireValue(object(stage) && ['pass', 'hold', 'fail', 'skip'].includes(stage.status) && SHA.test(stage.input_sha256), 'invalid_stage');
    fileRefs(stage.outputs, stage.status === 'skip' || stage.status === 'fail');
    requireValue(stage.status !== 'skip' || stage.outputs.length === 0, 'skip_reuses_output');
    for (const ref of stage.outputs) { const p = relativePath(ref.path); requireValue(!used.has(p), 'duplicate_artifact'); used.add(p); }
  }
}
function healthData(file) {
  const h = json(file);
  requireValue(object(h) && integer(h.valid_rows) && integer(h.expected_rows) && h.expected_rows > 0 && h.valid_rows <= h.expected_rows && integer(h.previous_week_flips) && Array.isArray(h.quarantine) && h.quarantine.every(text), 'invalid_health');
  return h;
}
function signalsData(file) {
  const s = json(file);
  requireValue(object(s) && Array.isArray(s.items) && s.items.every(i => object(i) && text(i.id) && i.status === 'candidate' && typeof i.censored === 'boolean' && (i.reason === undefined || text(i.reason)) && (!i.censored || text(i.reason))), 'invalid_signals');
  requireValue(new Set(s.items.map(i => i.id)).size === s.items.length, 'duplicate_signal_id');
}
function renderStructure(file) {
  // Ignore comments/raw-text elements; do not treat strings in JS or CSS as slots.
  const html = fileText(file);
  if (html.includes('MI_PLACEHOLDER')) return false;
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const slots = new Set();
  for (const tag of markup.match(/<[a-z][a-z0-9:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/gi) ?? []) {
    const attributes = tag.replace(/^<[a-z][a-z0-9:-]*/i, ''), seen = new Set();
    for (const attr of attributes.matchAll(/\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const name = attr[1].toLowerCase();
      if (seen.has(name)) continue; // HTML keeps only the first duplicate attribute.
      seen.add(name);
      if (name === 'data-mi-slot') slots.add(attr[2] ?? attr[3] ?? attr[4]);
    }
  }
  return ['bluf', 'wave', 'insight'].every(n => slots.has(n));
}

export async function audit({ root, manifest: manifestPath, since, command = 'check' } = {}) {
  try {
    requireValue(['check', 'plan'].includes(command), 'invalid_command');
    const cutoff = parseSince(since), read = await reader(root);
    const manifestFile = await read(relativePath(manifestPath)), manifest = json(manifestFile);
    requireValue(object(manifest), 'invalid_manifest');
    const configFile = await read(relativePath(manifest.config_path)), config = json(configFile);
    validate(manifest, config);
    const reserved = relativePath(manifestPath);
    requireValue(![manifest.config_path, ...manifest.sources.map(r => r.path), ...STAGES.flatMap(n => manifest.stages[n].outputs.map(r => r.path))].some(p => relativePath(p) === reserved), 'duplicate_artifact');
    const issues = [], results = {}, files = {};
    const issue = (code, stage) => { issues.push(stage ? { code, stage } : { code }); };
    const sources = [];
    for (const ref of manifest.sources) { const f = await read(ref.path); sources.push(f); if (f.bytes.length === 0) issue('empty_source', 'collect'); if (f.sha256 !== ref.sha256) issue('source_hash_mismatch', 'collect'); }
    let health;
    for (const name of STAGES) {
      const stage = manifest.stages[name], outputFiles = [];
      for (const ref of stage.outputs) {
        const file = await read(ref.path); outputFiles.push(file);
        if (file.sha256 !== ref.sha256) issue('output_hash_mismatch', name);
        if (file.bytes.length === 0) issue('empty_output', name);
        if (cutoff !== undefined && file.mtimeMs < cutoff) issue('output_stale_since', name);
      }
      files[name] = outputFiles;
      const upstream = name === 'collect' ? sources : DEPENDENCIES[name].flatMap(n => files[n]);
      const actual = fingerprint([manifest.pipeline_version, configFile.sha256, manifest.period, manifest.mode, name, ...upstream.map(f => f.sha256)]);
      if (stage.input_sha256 !== actual) issue('input_fingerprint_mismatch', name);
      const held = manifest.stages.health.status === 'hold';
      const dependencies = DEPENDENCIES[name].filter(n => !(held && name === 'inbox' && ['health', 'signals'].includes(n)));
      if (dependencies.some(n => !results[n].fresh_pass)) issue('upstream_not_fresh_pass', name);
      if (held && name === 'inbox' && (!results.health?.integrity || manifest.stages.signals.status !== 'skip' || !results.signals?.integrity)) issue('hold_alert_prerequisites_invalid', name);
      if (['collect', 'build_core', 'build_mart', 'inbox'].includes(name) && stage.status !== 'pass') issue('required_stage_not_pass', name);
      if (name === 'health' && ['pass', 'hold'].includes(stage.status)) {
        requireValue(outputFiles.length === 1, 'invalid_health_output_count'); health = healthData(outputFiles[0]);
        const coverage = health.valid_rows / health.expected_rows;
        if (health.valid_rows === 0) issue('empty_health_blocked', name);
        if (manifest.mode === 'weekly' && (coverage < config.min_coverage || health.previous_week_flips >= config.max_previous_week_flips) && stage.status !== 'hold') issue('health_hold_required', name);
      } else if (name === 'health') issue('health_not_pass_or_hold', name);
      if (['signals', 'render'].includes(name)) {
        if (held && stage.status !== 'skip') issue('hold_requires_skip', name);
        if (!held && stage.status !== 'pass') issue('required_stage_not_pass', name);
        // A held health parent intentionally permits explicit skips, not passes.
        if (held && stage.status === 'skip') {
          const index = issues.findIndex(i => i.stage === name && i.code === 'upstream_not_fresh_pass'); if (index >= 0) issues.splice(index, 1);
          if (!results.health?.integrity || !results.build_mart?.fresh_pass) issue('skip_parent_not_fresh', name);
        }
      }
      if (name === 'signals' && stage.status === 'pass') { requireValue(outputFiles.length === 1, 'invalid_signals_output_count'); signalsData(outputFiles[0]); }
      if (name === 'render' && stage.status === 'pass') { requireValue(outputFiles.length === 1, 'invalid_render_output_count'); if (!renderStructure(outputFiles[0])) issue('render_structure_invalid', name); }
      if (name === 'inbox' && stage.status === 'pass') {
        requireValue(outputFiles.length === 1, 'invalid_inbox_output_count');
        let inboxText;
        try { inboxText = fileText(outputFiles[0]); }
        catch (error) { if (!(error instanceof AuditError) || error.code !== 'invalid_utf8') throw error; issue('invalid_utf8', name); }
        if (held && inboxText !== undefined && !/^MI_PARTIAL_ALERT(?:\r?\n|$)/.test(inboxText)) issue('partial_alert_required', name);
      }
      const integrity = !issues.some(i => i.stage === name);
      results[name] = { status: stage.status, integrity, fresh_pass: integrity && stage.status === 'pass' };
    }
    if (manifest.stages.health.status === 'hold') issue('human_review_required', 'health');
    const stale = issues.some(i => ['source_hash_mismatch', 'output_hash_mismatch', 'input_fingerprint_mismatch', 'output_stale_since'].includes(i.code));
    const status = issues.length ? (stale ? 'stale' : 'blocked') : 'verified';
    const result = { ...envelope(command, status), period: manifest.period, mode: manifest.mode, freshness_requested: cutoff !== undefined, stages: results, issues };
    if (health) result.health = { valid_rows: health.valid_rows, expected_rows: health.expected_rows, coverage: health.valid_rows / health.expected_rows, previous_week_flips: health.previous_week_flips, quarantine_count: health.quarantine.length };
    if (command === 'plan') {
      result.plan = STAGES.map(name => {
        let action = results[name].fresh_pass ? 'no_op' : 'blocked';
        if (manifest.stages[name].status === 'fail' && manifest.retry_count >= config.retry_limit) action = 'retry_limit_reached';
        else if (!results[name].fresh_pass && name === 'collect') action = 'external_collect_fresh_needed';
        else if (manifest.stages.health.status === 'hold' && ['health', 'signals', 'render', 'inbox'].includes(name)) action = 'human_review_required';
        else if (!results[name].fresh_pass && DEPENDENCIES[name].every(n => results[n].fresh_pass)) action = 'deterministic_downstream_eligible';
        return { stage: name, action, execution: 'not_performed' };
      });
      result.no_op = issues.length === 0;
    }
    return { exitCode: issues.length ? 1 : 0, result };
  } catch (error) {
    const code = error instanceof AuditError ? error.code : error?.code === 'ENOENT' ? 'file_missing' : error?.code === 'ELOOP' ? 'symlink_blocked' : 'read_error';
    return { exitCode: 2, result: { ...envelope(command === 'plan' ? 'plan' : 'check', 'error'), issues: [{ code }] } };
  }
}
export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  requireValue(['check', 'plan'].includes(argv[0]), 'invalid_command');
  const result = { command: argv[0] };
  for (let i = 1; i < argv.length; i += 2) {
    const flags = { '--root': 'root', '--manifest': 'manifest', '--since': 'since' };
    const key = Object.hasOwn(flags, argv[i]) ? flags[argv[i]] : undefined;
    requireValue(key && !Object.hasOwn(result, key) && text(argv[i + 1]) && !argv[i + 1].startsWith('--'), 'invalid_arguments');
    result[key] = argv[i + 1];
  }
  requireValue(result.root && result.manifest, 'required_arguments_missing'); return result;
}
export async function main(argv = process.argv.slice(2)) {
  let outcome;
  try {
    requireValue(Number(process.versions.node.split('.')[0]) >= 20, 'node_version_unsupported');
    const options = parseArgs(argv);
    outcome = options.help ? { exitCode: 0, result: { ...envelope('help', 'help'), usage: ['node scripts/mi-audit.mjs check --root DIR --manifest RELPATH [--since ISO]', 'node scripts/mi-audit.mjs plan --root DIR --manifest RELPATH [--since ISO]', 'node scripts/mi-audit.mjs --help'], partial_alert_contract: 'On hold, inbox is one nonempty UTF-8 artifact starting with MI_PARTIAL_ALERT on its own line. This is only a structural alert marker.', exit_codes: { 0: 'verified or no-op plan', 1: 'not_verified, blocked or stale', 2: 'invalid input or error' } } } : await audit(options);
  } catch (error) { outcome = { exitCode: 2, result: { ...envelope('check', 'error'), issues: [{ code: error instanceof AuditError ? error.code : 'invalid_arguments' }] } }; }
  process.stdout.write(`${JSON.stringify(outcome.result)}\n`); return outcome.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
