import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATION = path.join(HERE, 'capture_open_design_generation_evidence.mjs');
const AUDIT = path.join(HERE, 'capture_meta_ui_design_audit.mjs');
const PREVIEW = path.join(HERE, 'capture_open_design_preview.mjs');
const MOTION = path.resolve(HERE, '../../open-design-game-ui-handoff/scripts/capture_runtime_motion_evidence.mjs');
const STITCH = path.resolve(HERE, '../../stitched-full-page-capture/scripts/stitch_full_page_capture.mjs');
const CHUNK = 64 * 1024;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function child(command, args, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function generationRun(log, { match = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-generation-test-'));
  const logPath = path.join(root, 'Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log');
  const out = path.join(root, 'evidence.json');
  const artifact = 'ui.html';
  const runId = 'run-regression';
  let helper;
  let server;
  let runReads = 0;
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    server = createServer((request, response) => {
      const route = new URL(request.url, 'http://127.0.0.1').pathname;
      if (route === `/api/runs/${runId}`) {
        runReads += 1;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          id: runId,
          status: runReads === 1 ? 'running' : 'succeeded',
          childPid: helper?.pid,
          projectId: 'project-regression',
          agentId: 'codex',
          exitCode: 0,
          createdAt: '2026-10-14T00:00:00.000Z',
          updatedAt: '2026-10-14T00:00:01.000Z',
        }));
        return;
      }
      if (route === `/api/runs/${runId}/result-package`) {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ schema: 'open-design.run-result-package.v1', artifacts: [{ file: artifact }] }));
        return;
      }
      if (route === '/api/projects/project-regression/preview-url') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ url: `${base}/api/projects/project-regression/preview/revision-regression/${artifact}` }));
        return;
      }
      if (route === `/api/projects/project-regression/preview/revision-regression/${artifact}`) {
        response.statusCode = 200;
        response.end('<!doctype html><title>fixture</title>');
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    const base = await listen(server);
    const sourceLog = typeof log === 'function' ? log(base) : log;
    await writeFile(logPath, match ? sourceLog : log);
    helper = spawn(process.execPath, ['-e', "process.title='codex exec -m gpt-5.6-sol -c model_reasoning_effort=ultra'; setTimeout(() => {}, 10000)"]);
    const result = await child(process.execPath, [GENERATION, `--run=${runId}`, `--artifact=${artifact}`, `--out=${out}`, '--timeout-ms=1500'], {
      env: { ...process.env, HOME: root },
    });
    if (!match) return { root, out, result };
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(evidence.daemonUrl, base);
    assert.equal(evidence.artifact.previewUrl, `${base}/api/projects/project-regression/preview/revision-regression/${artifact}`);
    assert.equal(evidence.artifact.sha256, createHash('sha256').update('<!doctype html><title>fixture</title>').digest('hex'));
    return { root, out, result, evidence };
  } finally {
    if (helper && helper.exitCode == null) {
      await new Promise((resolve) => {
        helper.once('close', resolve);
        helper.kill('SIGTERM');
      });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}
test('discovers the newest daemon URL when the matching syntax crosses a 64KiB boundary', async () => {
  await generationRun((base) => {
    const body = `{"url"${' '.repeat(400)}:"${base}"}`;
    const prefixText = '{"url":"http://127.0.0.1:1"}\n';
    const prefix = prefixText + 'x'.repeat(CHUNK - 20 - prefixText.length);
    const suffix = 'y'.repeat(CHUNK - body.length + 20);
    return `${prefix}${body}${suffix}`;
  });
});

test('handles UTF-8, empty, trailing, and no-match daemon logs without stale-buffer matches', async (t) => {
  await t.test('UTF-8 trailing text and newest match', async () => {
    const result = await generationRun((base) => `旧日志 🐉\n{"url":"http://127.0.0.1:1"}\n最新日志 ✅\n{"url":"${base}"}`);
    assert.equal(result.evidence.daemonUrl.startsWith('http://127.0.0.1:'), true);
  });
  for (const [name, log] of [['empty', ''], ['no match', '仅有 UTF-8 文本 🧪'], ['truncated', '{"url":"http://127.0.0.1:']]) {
    await t.test(name, async () => {
      const result = await generationRun(log, { match: false });
      assert.equal(existsSync(result.out), false);
      assert.match(result.result.stderr, /Could not discover Open Design daemon URL|ENOENT|fetch failed|timed out/i);
    });
  }
});

test('finds a URL before 128MiB of trailing log text without truncating the scan', async () => {
  const trailing = Buffer.alloc(128 * 1024 * 1024, 0x78);
  await generationRun((base) => Buffer.concat([Buffer.from(`{"url":"${base}"}\n`), trailing]));
});

test('reports an unreadable daemon log and leaves no output artifact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-generation-unreadable-'));
  const out = path.join(root, 'evidence.json');
  try {
    const result = await child(process.execPath, [GENERATION, '--run=unreadable', '--artifact=ui.html', `--out=${out}`, '--timeout-ms=1000'], {
      env: { ...process.env, HOME: root },
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ENOENT|Could not discover Open Design daemon URL/);
    assert.equal(existsSync(out), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright') return { url: new URL('./playwright.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.endsWith('/game-hooks.mjs')) return { url: new URL('./game-hooks.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
`;
const fsFailureLoaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'node:fs/promises' && !context.parentURL?.endsWith('/fs-failure.mjs')) return { url: new URL('./fs-failure.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'playwright') return { url: new URL('./playwright.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.endsWith('/game-hooks.mjs')) return { url: new URL('./game-hooks.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
`;

const fsFailureSource = `
import * as real from 'node:fs/promises';
const failure = (message) => Object.assign(new Error(message), { code: 'EACCES' });
let rmCalls = 0;
const unlink = async (...args) => {
  if (process.env.FAKE_FS_MODE === 'unlink-cleanup') throw failure('unlink fixture cleanup failure');
  return real.unlink(...args);
};
const rm = async (...args) => {
  rmCalls += 1;
  if ((process.env.FAKE_FS_MODE === 'rm-cleanup' && rmCalls === 1) || (process.env.FAKE_FS_MODE === 'rm-final' && rmCalls === 2)) throw failure('rm fixture cleanup failure');
  return real.rm(...args);
};
export { unlink, rm };
export * from 'node:fs/promises';
export default { ...real, unlink, rm };
`;
const fakeCwebpSource = `#!${process.execPath}
const fs = require('node:fs');
const outputIndex = process.argv.indexOf('-o');
const input = outputIndex > 0 ? process.argv[outputIndex - 1] : '';
const output = outputIndex > 0 ? process.argv[outputIndex + 1] : '';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!input || !output || !fs.readFileSync(input).subarray(0, 8).equals(pngSignature)) {
  console.error('invalid image fixture');
  process.exit(1);
}
const payload = Buffer.from('fixture-webp');
const chunk = Buffer.alloc(8);
chunk.write('VP8 ', 0, 'ascii');
chunk.writeUInt32LE(payload.length, 4);
const body = Buffer.concat([Buffer.from('WEBP'), chunk, payload]);
const riff = Buffer.alloc(8);
riff.write('RIFF', 0, 'ascii');
riff.writeUInt32LE(body.length, 4);
fs.writeFileSync(output, Buffer.concat([riff, body]));
`;

async function installFakeCwebp(root) {
  const binDir = path.join(root, 'bin');
  await mkdir(binDir, { recursive: true });
  const executable = path.join(binDir, 'cwebp');
  await writeFile(executable, fakeCwebpSource);
  await chmod(executable, 0o755);
  return binDir;
}

const playwrightSource = `
import fs from 'node:fs/promises';
const png = Buffer.from(process.env.FAKE_PNG, 'base64');
const mode = process.env.FAKE_CAPTURE_MODE || 'invalid';
function page() {
  let evaluation = 0;
  return {
    on() {}, addInitScript: async () => {}, emulateMedia: async () => {}, goto: async () => {},
    waitForSelector: async () => {}, waitForFunction: async () => {}, waitForTimeout: async () => {},
    evaluate: async () => {
      evaluation += 1;
      if (process.env.FAKE_KIND === 'preview' && evaluation === 1) return { locale: true, screen: true, capabilities: true, state: true, toolbar: true };
      if (process.env.FAKE_KIND === 'motion') return evaluation === 1 ? true : { rootVisible: true, rootRect: { x: 0, y: 0, width: 100, height: 100 }, animations: [] };
      return { root: { left: 0, top: 0, right: 1440, bottom: 900, width: 1440, height: 900 }, rootWithinViewport: true, viewport: { width: 1440, height: 900 }, document: { scrollWidth: 1440, scrollHeight: 900 }, visibleButtons: 1, smallestButton: { width: 100, height: 50 }, largestButton: { width: 100, height: 50 }, visibleTextLength: 100, images: [], canvases: 0, shadowRoots: 0, langMatches: true, localeCopyMatches: true, localeSummary: 'en; zhGlyphs=0', foreignLocaleSamples: [] };
    },
    screenshot: async ({ path }) => { if (mode === 'throw') { await fs.writeFile(path, Buffer.alloc(8 * 1024 * 1024, 65)); throw new Error('screenshot fixture failure'); } await fs.writeFile(path, mode === 'success' ? png : Buffer.from('not-a-png')); },
    keyboard: { press: async () => {} }, mouse: { move: async () => {}, down: async () => {}, up: async () => {} },
    locator: () => ({ first: () => ({ evaluate: async () => ({ borderColor: 'a', background: 'a', boxShadow: 'a', filter: 'a', transform: 'a' }), hover: async () => {} }) }),
    video: () => ({ saveAs: async (target) => fs.writeFile(target, Buffer.alloc(20000, 66)) }),
    close: async () => {},
  };
}
const browser = { newContext: async () => ({ addInitScript: async () => {}, newPage: async () => page(), close: async () => {} }), close: async () => {} };
export const chromium = { launch: async () => browser };
`;

async function runFakeCapture(script, kind, mode, { fsMode = '' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-capture-test-'));
  const loader = path.join(root, 'loader.mjs');
  const out = path.join(root, 'out');
  const binDir = await installFakeCwebp(root);
  await writeFile(loader, fsMode ? fsFailureLoaderSource : loaderSource);
  if (fsMode) await writeFile(path.join(root, 'fs-failure.mjs'), fsFailureSource);
  await writeFile(path.join(root, 'playwright.mjs'), playwrightSource);
  await writeFile(path.join(root, 'game-hooks.mjs'), 'export async function waitForGameReady() {}\n');
  const server = createServer((request, response) => { response.statusCode = 200; response.end('<!doctype html>fixture'); });
  const base = await listen(server);
  const args = kind === 'audit'
    ? [script, `--base-url=${base}`, `--out-dir=${out}`, '--locales=en', '--viewports=desktop-1440', '--mode=overview', '--no-character-assets']
    : kind === 'motion'
      ? [script, `--base-url=${base}`, `--out-dir=${out}`, '--surfaces=home', '--viewports=desktop-1440', '--locale=en']
      : [script, `--preview-url=${base}/api/projects/p/p/preview/r/file.html`, '--scenario-set=defaults', '--contract-profile=steam-title', `--out-dir=${out}`, '--screens=title', '--viewports=desktop-1440', '--locales=en'];
  try {
    const result = await child(process.execPath, ['--experimental-loader', pathToFileURL(loader).href, ...args], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, FAKE_CAPTURE_MODE: mode, FAKE_KIND: kind, FAKE_PNG: PNG.toString('base64'), FAKE_FS_MODE: fsMode },
    });
    return { root, out, result };
  } finally {
    await server.close();
  }
}
async function runPreviewDaemonDiscovery() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-preview-daemon-test-'));
  const loader = path.join(root, 'loader.mjs');
  const out = path.join(root, 'out');
  const binDir = await installFakeCwebp(root);
  const logPath = path.join(root, 'Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log');
  const server = createServer((request, response) => {
    const route = new URL(request.url, 'http://127.0.0.1').pathname;
    if (route === '/api/health') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ version: 'fixture-daemon' }));
      return;
    }
    if (route === '/api/projects/p/preview-url') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ url: `${base}/api/projects/p/preview/r/file.html` }));
      return;
    }
    if (route === '/api/projects/p/preview/r/file.html') {
      response.statusCode = 200;
      response.end('<!doctype html>preview fixture');
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  const base = await listen(server);
  try {
    await writeFile(loader, loaderSource);
    await writeFile(path.join(root, 'playwright.mjs'), playwrightSource);
    await writeFile(path.join(root, 'game-hooks.mjs'), 'export async function waitForGameReady() {}\n');
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, `old daemon\n{"url"\n :\n "${base}"}\n`);
    const result = await child(process.execPath, [
      '--experimental-loader', pathToFileURL(loader).href, PREVIEW,
      '--project=p', '--file=file.html', '--scenario-set=defaults', '--contract-profile=steam-title',
      `--out-dir=${out}`, '--screens=title', '--viewports=desktop-1440', '--locales=en',
    ], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, HOME: root, FAKE_CAPTURE_MODE: 'success', FAKE_KIND: 'preview', FAKE_PNG: PNG.toString('base64') },
    });
    return { root, out, result, base };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  } finally {
    await server.close();
  }
}

test('preview discovers its daemon URL through the shared log scanner', async () => {
  const fixture = await runPreviewDaemonDiscovery();
  try {
    const manifest = JSON.parse(await readFile(path.join(fixture.out, 'manifest.json'), 'utf8'));
    assert.equal(manifest.daemonUrl, fixture.base);
    assert.equal(manifest.previewUrl, `${fixture.base}/api/projects/p/preview/r/file.html`);
    assert.equal(existsSync(path.join(fixture.out, 'screenshots', 'en', 'desktop-1440', 'title--title-first-run.webp')), true);
    assert.equal(existsSync(path.join(fixture.out, 'screenshots', 'en', 'desktop-1440', 'title--title-first-run.webp.tmp.png')), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function outputText(out) {
  const chunks = [];
  const walk = async (dir) => {
    for (const entry of await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else chunks.push(await readFile(file, 'utf8').catch(() => ''));
    }
  };
  if (existsSync(out)) await walk(out);
  return chunks.join('\n');
}

for (const [label, script, kind] of [['audit', AUDIT, 'audit'], ['preview', PREVIEW, 'preview'], ['motion', MOTION, 'motion']]) {
  test(`${label} screenshot cleanup preserves the original screenshot error`, async () => {

    const { root, out, result } = await runFakeCapture(script, kind, 'throw');
    try {
      assert.notEqual(result.code, 0);
      assert.match(`${result.stdout}\n${result.stderr}\n${await outputText(out)}`, /screenshot fixture failure/);
      const pngs = [];
      const walk = async (dir) => { for (const entry of await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else if (file.endsWith('.png')) pngs.push(file); } };
      if (existsSync(out)) await walk(out);
      assert.deepEqual(pngs, []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${label} conversion failure removes only the temporary PNG`, async () => {
    const { root, out, result } = await runFakeCapture(script, kind, 'invalid');
    try {
      assert.notEqual(result.code, 0);
      assert.match(`${result.stdout}\n${result.stderr}\n${await outputText(out)}`, /cwebp|not-a-png|invalid image|conversion/i);
      const files = [];
      const walk = async (dir) => { for (const entry of await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else files.push(file); } };
      if (existsSync(out)) await walk(out);
      assert.equal(files.some((file) => file.endsWith('.png')), false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${label} successful conversion retains WebP and removes only temporary PNG`, async () => {
    const { root, out } = await runFakeCapture(script, kind, 'success');
    try {
      const files = [];
      const walk = async (dir) => { for (const entry of await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) await walk(file); else files.push(file); } };
      if (existsSync(out)) await walk(out);
      assert.equal(files.some((file) => file.endsWith('.png')), false);
      assert.equal(files.some((file) => file.endsWith('.webp')), true);
      const webps = files.filter((file) => file.endsWith('.webp'));
      assert.equal(webps.length > 0, true);
      const webpBytes = await readFile(webps[0]);
      assert.equal(webpBytes.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(webpBytes.subarray(8, 12).toString('ascii'), 'WEBP');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

for (const [label, script, kind, fsMode] of [['preview', PREVIEW, 'preview', 'unlink-cleanup'], ['motion', MOTION, 'motion', 'rm-cleanup']]) {
  test(`${label} rejects a non-ENOENT temporary PNG cleanup failure`, async () => {
    const { root, out, result } = await runFakeCapture(script, kind, 'success', { fsMode });
    try {
      const evidence = `${result.stdout}\n${result.stderr}\n${await outputText(out)}`;
      assert.notEqual(result.code, 0);
      assert.match(evidence, new RegExp(`${fsMode.startsWith('unlink') ? 'unlink' : 'rm'} fixture cleanup failure`));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test(`${label} preserves the screenshot error when PNG cleanup also fails`, async () => {
    const { root, out, result } = await runFakeCapture(script, kind, 'throw', { fsMode });
    try {
      const evidence = `${result.stdout}\n${result.stderr}\n${await outputText(out)}`;
      assert.notEqual(result.code, 0);
      assert.match(evidence, /screenshot fixture failure/);
      assert.doesNotMatch(evidence, /fixture cleanup failure/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

async function runStitchSuccessFixture({ fsMode = '', closeFailure = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-stitch-cleanup-test-'));
  const moduleDir = path.join(root, 'node_modules/playwright');
  const binDir = path.join(root, 'bin');
  const manifest = path.join(root, 'manifest.json');
  const loader = path.join(root, 'loader.mjs');
  try {
    await mkdir(moduleDir, { recursive: true });
    await mkdir(binDir, { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(moduleDir, 'package.json'), '{"type":"commonjs"}');
    await writeFile(path.join(moduleDir, 'index.js'), `const fs=require('node:fs'); exports.chromium={launch:async()=>({newPage:async()=>({goto:async()=>{},waitForTimeout:async()=>{},evaluate:async()=>10,screenshot:async({path})=>fs.writeFileSync(path,'fixture'),close:async()=>{}}),close:async()=>{${closeFailure ? "throw new Error('close fixture failure')" : ''}}})};`);
    await writeFile(path.join(binDir, 'ffmpeg'), `#!${process.execPath}\nconst fs=require("node:fs"); fs.writeFileSync(process.argv.at(-1), "fixture");\n`);
    await writeFile(path.join(binDir, 'sips'), `#!${process.execPath}\nprocess.stdout.write("pixelHeight: 10\\n");\n`);
    await chmod(path.join(binDir, 'ffmpeg'), 0o755);
    await chmod(path.join(binDir, 'sips'), 0o755);
    if (fsMode) {
      await writeFile(loader, fsFailureLoaderSource);
      await writeFile(path.join(root, 'fs-failure.mjs'), fsFailureSource);
    }
    await writeFile(manifest, JSON.stringify({ items: [{ title: 'Fixture', pageUrl: 'http://fixture/', fullPageImage: 'full.jpg', sectionImages: [{ file: 'section.jpg' }] }] }));
    const args = [STITCH, '--manifest', manifest, '--item', '1', '--viewport', '10x10', '--step', '10', '--wait', '1'];
    const nodeArgs = fsMode ? ['--experimental-loader', pathToFileURL(loader).href, ...args] : args;
    const result = await child(process.execPath, nodeArgs, {
      cwd: root,
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, FAKE_FS_MODE: fsMode },
    });
    return { root, result };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

test('stitcher reports browser-close cleanup failure after successful capture', async () => {
  const { root, result } = await runStitchSuccessFixture({ closeFailure: true });
  try {
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /close fixture failure/);
    assert.equal(existsSync(path.join(root, '.stitched-full-page-temp')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stitcher reports temp-root cleanup failure after successful capture', async () => {
  const { root, result } = await runStitchSuccessFixture({ fsMode: 'rm-final' });
  try {
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /rm fixture cleanup failure/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stitcher preserves browser-close error when temp-root cleanup also fails', async () => {
  const { root, result } = await runStitchSuccessFixture({ fsMode: 'rm-final', closeFailure: true });
  try {
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /close fixture failure/);
    assert.doesNotMatch(result.stderr, /rm fixture cleanup failure/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stitcher closes a launched browser and removes temp state when no manifest target matches', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-stitch-test-'));
  const moduleDir = path.join(root, 'node_modules/playwright');
  const manifest = path.join(root, 'manifest.json');
  const marker = path.join(root, 'browser-events.log');
  try {
    await mkdir(moduleDir, { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(moduleDir, 'package.json'), '{"type":"commonjs"}');
    await writeFile(path.join(moduleDir, 'index.js'), `const fs=require('node:fs'); const marker=${JSON.stringify(marker)}; exports.chromium={launch:async()=>{fs.appendFileSync(marker,'launch\\n');return {close:async()=>fs.appendFileSync(marker,'close\\n')}}};`);
    await writeFile(manifest, JSON.stringify({ items: [] }));
    const result = await child(process.execPath, [STITCH, '--manifest', manifest, '--item', '1'], { cwd: root });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /No manifest items matched/);
    assert.equal((await readFile(marker, 'utf8')).trim(), 'launch\nclose');
    assert.equal(existsSync(path.join(root, '.stitched-full-page-temp')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stitcher removes temp state when browser launch rejects before target validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-stitch-launch-test-'));
  const moduleDir = path.join(root, 'node_modules/playwright');
  const manifest = path.join(root, 'manifest.json');
  try {
    await mkdir(moduleDir, { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(moduleDir, 'package.json'), '{"type":"commonjs"}');
    await writeFile(path.join(moduleDir, 'index.js'), "exports.chromium={launch:async()=>{throw new Error('launch fixture failure')}};");
    await writeFile(manifest, JSON.stringify({ items: [] }));
    const result = await child(process.execPath, [STITCH, '--manifest', manifest], { cwd: root });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /launch fixture failure/);
    assert.equal(existsSync(path.join(root, '.stitched-full-page-temp')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stitcher preserves the target error and removes temp state when browser close rejects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'node-stitch-close-test-'));
  const moduleDir = path.join(root, 'node_modules/playwright');
  const manifest = path.join(root, 'manifest.json');
  try {
    await mkdir(moduleDir, { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(moduleDir, 'package.json'), '{"type":"commonjs"}');
    await writeFile(path.join(moduleDir, 'index.js'), "exports.chromium={launch:async()=>({close:async()=>{throw new Error('close fixture failure')}})};");
    await writeFile(manifest, JSON.stringify({ items: [] }));
    const result = await child(process.execPath, [STITCH, '--manifest', manifest, '--item', '1'], { cwd: root });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /No manifest items matched/);
    assert.equal(existsSync(path.join(root, '.stitched-full-page-temp')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
