#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, platform, arch, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const OFFICIAL_REPO = 'https://github.com/wassermanproductions/motion-previs-studio';
const INSTALLER_URL = 'https://raw.githubusercontent.com/wassermanproductions/motion-previs-studio/main/install.sh';
const ACTIONS = new Set([
  'get_state', 'import_file', 'import_url', 'set_range', 'set_mode',
  'set_settings', 'run_analysis', 'export_pack', 'list_bundle',
  'send_to_blockout', 'screenshot'
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

function fail(message, details, code = 1) {
  const payload = { ok: false, error: message };
  if (details !== undefined) payload.details = details;
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = code;
}

function usage() {
  return `video-motion-previs — CLI for a running Motion Previs Studio v4 app

Usage:
  video-motion-previs check
  video-motion-previs install [--packaged | --source [DIR]]
  video-motion-previs launch
  video-motion-previs link
  video-motion-previs state
  video-motion-previs import-file PATH
  video-motion-previs import-url URL
  video-motion-previs set-range START_SECONDS END_SECONDS
  video-motion-previs set-mode camera_only|actor_motion|object_motion|full_scene
  video-motion-previs set-settings JSON
  video-motion-previs analyze
  video-motion-previs wait [--timeout SECONDS] [--interval SECONDS]
  video-motion-previs export
  video-motion-previs list-bundle
  video-motion-previs send-to-blockout reference|depth|ai_depth|pose|openpose
  video-motion-previs screenshot OUTPUT.png
  video-motion-previs workflow PATH_OR_URL --start N --end N [--mode MODE]
                            [--sample-fps N] [--resolution auto|720p]
                            [--timeout SECONDS]
  video-motion-previs call ACTION [JSON]
`;
}

function discoveryPath() {
  const override = process.env.MOTION_PREVIS_CONFIG_DIR || process.env.MPS_CONFIG_DIR;
  if (override) return path.join(override, 'control.json');
  if (platform() === 'win32') {
    const appData = process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Motion Previs Studio', 'v4', 'control.json');
  }
  return path.join(homedir(), '.config', 'motion-previs', 'control.json');
}

function packagedCandidates() {
  if (platform() === 'darwin') {
    return [
      '/Applications/Motion Previs Studio v4.app',
      path.join(homedir(), 'Applications', 'Motion Previs Studio v4.app')
    ];
  }
  if (platform() === 'win32') {
    const roots = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean);
    return roots.flatMap((root) => [
      path.join(root, 'Motion Previs Studio v4', 'Motion Previs Studio v4.exe'),
      path.join(root, 'Programs', 'Motion Previs Studio v4', 'Motion Previs Studio v4.exe')
    ]);
  }
  return [];
}

function sourceCandidates() {
  return [...new Set([
    process.env.MOTION_PREVIS_SOURCE,
    path.join(homedir(), 'motion-previs-studio'),
    path.join(homedir(), '.local', 'share', 'motion-previs-studio')
  ].filter(Boolean))];
}

function findPackaged() {
  return packagedCandidates().find(existsSync) || null;
}

function findSource() {
  return sourceCandidates().find((candidate) =>
    existsSync(path.join(candidate, 'package.json')) &&
    existsSync(path.join(candidate, 'mcp', 'motion-previs-mcp.mjs'))
  ) || null;
}

function sourcePrepared(source) {
  return Boolean(source) &&
    existsSync(path.join(source, 'node_modules', 'electron')) &&
    existsSync(path.join(source, 'public', 'mediapipe'));
}

function readDescriptor() {
  const file = discoveryPath();
  if (!existsSync(file)) throw new Error(`Motion Previs Studio is not running; discovery file is missing: ${file}`);
  let descriptor;
  try {
    descriptor = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid discovery descriptor at ${file}: ${error.message}`);
  }
  if (descriptor.protocolVersion !== 1 || !Number.isInteger(descriptor.port) || typeof descriptor.token !== 'string') {
    throw new Error(`Unsupported discovery descriptor at ${file}`);
  }
  return { file, descriptor };
}

async function healthFromDescriptor(descriptor, timeoutMs = 2000) {
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = await response.json();
    return { reachable: response.ok && body.ok === true, status: response.status, ...body };
  } catch (error) {
    return { reachable: false, error: error.message };
  }
}

async function check() {
  const packaged = findPackaged();
  const source = findSource();
  const prepared = sourcePrepared(source);
  const file = discoveryPath();
  let descriptor = null;
  let health = { reachable: false, reason: 'discovery file not found' };
  if (existsSync(file)) {
    try {
      const loaded = readDescriptor();
      descriptor = {
        protocolVersion: loaded.descriptor.protocolVersion,
        app: loaded.descriptor.app,
        appVersion: loaded.descriptor.appVersion,
        pid: loaded.descriptor.pid,
        startedAt: loaded.descriptor.startedAt,
        capabilities: loaded.descriptor.capabilities
      };
      health = await healthFromDescriptor(loaded.descriptor);
    } catch (error) {
      health = { reachable: false, error: error.message };
    }
  }
  return {
    ok: Boolean(packaged || prepared),
    platform: platform(),
    arch: arch(),
    node: process.versions.node,
    nodeCompatible: Number(process.versions.node.split('.')[0]) >= 18,
    installation: packaged
      ? { kind: 'packaged', path: packaged }
      : source
        ? { kind: 'source', path: source, prepared }
        : null,
    discoveryFile: file,
    descriptor,
    health
  };
}

async function rpc(action, params = {}) {
  if (!ACTIONS.has(action)) throw new Error(`Unknown action "${action}". Allowed: ${[...ACTIONS].join(', ')}`);
  const { descriptor } = readDescriptor();
  const health = await healthFromDescriptor(descriptor);
  if (!health.reachable) throw new Error(`Motion Previs Studio control server is not healthy: ${health.error || health.status}`);
  const response = await fetch(`http://127.0.0.1:${descriptor.port}/rpc`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${descriptor.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ action, params }),
    signal: AbortSignal.timeout(['run_analysis', 'export_pack'].includes(action) ? 910_000 : action === 'import_url' ? 310_000 : 130_000)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Control server returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || `Control action ${action} failed with HTTP ${response.status}`);
  }
  return result.data;
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

async function waitForAnalysis(args) {
  const timeoutSeconds = finiteNumber(option(args, '--timeout', '900'), '--timeout');
  const intervalSeconds = finiteNumber(option(args, '--interval', '2'), '--interval');
  if (timeoutSeconds <= 0 || intervalSeconds <= 0) throw new Error('timeout and interval must be greater than zero');
  const deadline = Date.now() + timeoutSeconds * 1000;
  let state;
  while (Date.now() <= deadline) {
    state = await rpc('get_state');
    const status = state?.analysis?.status;
    if (status === 'done') return state;
    if (status === 'error') throw new Error(`Analysis failed${state.analysis.error ? `: ${state.analysis.error}` : ''}`);
    if (status !== 'running') throw new Error(`Analysis is not running (status: ${status ?? 'unknown'})`);
    await sleep(intervalSeconds * 1000);
  }
  throw new Error(`Analysis did not finish within ${timeoutSeconds} seconds`);
}

async function latestWindowsInstaller() {
  const response = await fetch('https://api.github.com/repos/wassermanproductions/motion-previs-studio/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'video-motion-previs-cli' }
  });
  if (!response.ok) throw new Error(`GitHub release lookup failed with HTTP ${response.status}`);
  const release = await response.json();
  const asset = release.assets?.find((item) => /win.*x64.*\.exe$/i.test(item.name) || /x64.*\.exe$/i.test(item.name));
  return { release: release.tag_name, url: asset?.browser_download_url || `${OFFICIAL_REPO}/releases/latest` };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function install(args) {
  const packagedOnly = args.includes('--packaged');
  const sourceIndex = args.indexOf('--source');
  const sourceRequested = sourceIndex >= 0;
  const current = await check();
  if (current.ok && current.installation && !packagedOnly && !sourceRequested) {
    return { ...current, skipped: true, reason: 'A usable installation already exists; pass --packaged or --source to override.' };
  }

  if (sourceRequested || (platform() !== 'darwin' && platform() !== 'win32')) {
    const next = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
    const target = next && !next.startsWith('--')
      ? path.resolve(next)
      : findSource() || path.join(homedir(), '.local', 'share', 'motion-previs-studio');
    if (!existsSync(path.join(target, '.git'))) {
      mkdirSync(path.dirname(target), { recursive: true });
      run('git', ['clone', '--depth', '1', `${OFFICIAL_REPO}.git`, target]);
    }
    run('npm', ['ci'], { cwd: target });
    return { ok: true, installed: { kind: 'source', path: target }, note: 'npm ci also prepares pinned runtime assets through upstream postinstall.' };
  }

  if (platform() === 'darwin') {
    if (arch() !== 'arm64') throw new Error('The packaged macOS release supports Apple Silicon only; use install --source on Intel.');
    const script = path.join(tmpdir(), `motion-previs-install-${process.pid}.sh`);
    const response = await fetch(INSTALLER_URL);
    if (!response.ok) throw new Error(`Official installer download failed with HTTP ${response.status}`);
    writeFileSync(script, await response.text(), { mode: 0o700 });
    try {
      run('bash', [script]);
    } finally {
      rmSync(script, { force: true });
    }
    return { ok: true, installed: { kind: 'packaged', path: findPackaged() }, source: INSTALLER_URL };
  }

  const release = await latestWindowsInstaller();
  process.exitCode = 2;
  return {
    ok: false,
    manualInstallRequired: true,
    platform: 'win32',
    ...release,
    reason: 'The upstream unsigned NSIS installer is interactive; download, verify the release checksum, and run it visibly.'
  };
}

async function launch() {
  const current = await check();
  if (current.health.reachable) return { ok: true, reused: true, health: current.health };
  const packaged = findPackaged();
  const source = findSource();
  if (platform() === 'darwin' && packaged) {
    run('open', [packaged]);
  } else if (platform() === 'win32' && packaged) {
    spawn(packaged, [], { detached: true, stdio: 'ignore' }).unref();
  } else if (sourcePrepared(source)) {
    spawn('npm', ['run', 'dev'], { cwd: source, detached: true, stdio: 'ignore' }).unref();
  } else if (source) {
    throw new Error(`Source checkout is not prepared: ${source}. Run video-motion-previs install --source "${source}" first.`);
  } else {
    throw new Error('No installation found. Run video-motion-previs install first.');
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(1000);
    const status = await check();
    if (status.health.reachable) return { ok: true, reused: false, health: status.health };
  }
  throw new Error('The app was launched but its control server did not become healthy within 30 seconds.');
}

async function workflow(args) {
  const input = args[0];
  if (!input || input.startsWith('--')) throw new Error('workflow requires an absolute local path or http(s) URL');
  const isUrl = /^https?:\/\//i.test(input);
  const imported = isUrl
    ? await rpc('import_url', { url: input })
    : await rpc('import_file', { path: realpathSync(path.resolve(input)) });

  const startRaw = option(args, '--start', undefined);
  const endRaw = option(args, '--end', undefined);
  if ((startRaw === undefined) !== (endRaw === undefined)) throw new Error('--start and --end must be supplied together');
  const range = startRaw === undefined ? null : await rpc('set_range', {
    startS: finiteNumber(startRaw, '--start'),
    endS: finiteNumber(endRaw, '--end')
  });

  const modeName = option(args, '--mode', 'camera_only');
  const mode = await rpc('set_mode', { mode: modeName });
  const settingsPatch = {};
  const sampleFps = option(args, '--sample-fps', undefined);
  const resolution = option(args, '--resolution', undefined);
  if (sampleFps !== undefined) settingsPatch.sampleFps = finiteNumber(sampleFps, '--sample-fps');
  if (resolution !== undefined) settingsPatch.resolution = resolution;
  const settings = Object.keys(settingsPatch).length ? await rpc('set_settings', settingsPatch) : null;
  const started = await rpc('run_analysis');
  const completed = await waitForAnalysis(args);
  const exported = await rpc('export_pack');
  const bundle = await rpc('list_bundle');
  return { ok: true, imported, range, mode, settings, started, analysis: completed.analysis, exported, bundle };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) {
    process.stdout.write(usage());
    return;
  }

  switch (command) {
    case 'check':
      print(await check());
      return;
    case 'install':
      print(await install(args));
      return;
    case 'launch':
      print(await launch());
      return;
    case 'state':
      print({ ok: true, data: await rpc('get_state') });
      return;
    case 'import-file': {
      if (!args[0]) throw new Error('import-file requires a path');
      const mediaPath = realpathSync(path.resolve(args[0]));
      print({ ok: true, data: await rpc('import_file', { path: mediaPath }) });
      return;
    }
    case 'import-url':
      if (!args[0]) throw new Error('import-url requires a URL');
      print({ ok: true, data: await rpc('import_url', { url: args[0] }) });
      return;
    case 'set-range':
      if (args.length < 2) throw new Error('set-range requires start and end seconds');
      print({ ok: true, data: await rpc('set_range', { startS: finiteNumber(args[0], 'start'), endS: finiteNumber(args[1], 'end') }) });
      return;
    case 'set-mode':
      if (!args[0]) throw new Error('set-mode requires a mode');
      print({ ok: true, data: await rpc('set_mode', { mode: args[0] }) });
      return;
    case 'set-settings':
      if (!args[0]) throw new Error('set-settings requires a JSON object');
      print({ ok: true, data: await rpc('set_settings', JSON.parse(args[0])) });
      return;
    case 'analyze':
      print({ ok: true, data: await rpc('run_analysis') });
      return;
    case 'wait':
      print({ ok: true, data: await waitForAnalysis(args) });
      return;
    case 'export':
      print({ ok: true, data: await rpc('export_pack') });
      return;
    case 'list-bundle':
      print({ ok: true, data: await rpc('list_bundle') });
      return;
    case 'send-to-blockout':
      if (!args[0]) throw new Error('send-to-blockout requires reference, depth, ai_depth, pose, or openpose');
      print({ ok: true, data: await rpc('send_to_blockout', { which: args[0] }) });
      return;
    case 'screenshot': {
      if (!args[0]) throw new Error('screenshot requires an output PNG path');
      const output = path.resolve(args[0]);
      const data = await rpc('screenshot');
      if (!data?.imageBase64) throw new Error('Screenshot response did not include imageBase64');
      writeFileSync(output, Buffer.from(data.imageBase64, 'base64'));
      print({ ok: true, output, bytes: Buffer.byteLength(data.imageBase64, 'base64') });
      return;
    }
    case 'workflow':
      print(await workflow(args));
      return;
    case 'call': {
      if (!args[0]) throw new Error('call requires an action');
      const params = args[1] ? JSON.parse(args[1]) : {};
      print({ ok: true, action: args[0], data: await rpc(args[0], params) });
      return;
    }
    case 'link': {
      const scriptPath = realpathSync(fileURLToPath(import.meta.url));
      const binDir = path.join(homedir(), '.local', 'bin');
      mkdirSync(binDir, { recursive: true });
      if (platform() === 'win32') {
        const target = path.join(binDir, 'video-motion-previs.cmd');
        writeFileSync(target, `@echo off\r\nnode "${scriptPath}" %*\r\n`);
        print({ ok: true, path: target, note: 'Add this directory to PATH if it is not already present.' });
      } else {
        const target = path.join(binDir, 'video-motion-previs');
        rmSync(target, { force: true });
        symlinkSync(scriptPath, target);
        print({ ok: true, path: target });
      }
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". Run video-motion-previs --help.`);
  }
}

main().catch((error) => fail(error.message));
