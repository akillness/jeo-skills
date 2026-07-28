#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitForGameReady } from '../../../../scripts/playtest-agent/lib/game-hooks.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const execFileAsync = promisify(execFile);
const META_KEY = 'darkbone.meta.v1';
const LANG_KEY = 'db_i18n_lang';
const VIEWPORTS = {
  'phone-landscape': { id: 'phone-landscape', width: 852, height: 393, mobile: true, touch: true },
  'ipad-landscape': { id: 'ipad-landscape', width: 1180, height: 820, mobile: false, touch: true },
  'desktop-1440': { id: 'desktop-1440', width: 1440, height: 900, mobile: false, touch: false },
  'steam-1920': { id: 'steam-1920', width: 1920, height: 1080, mobile: false, touch: false },
};

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function split(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const out = {
    baseUrl: 'http://127.0.0.1:5173',
    outDir: path.join(REPO_ROOT, '.omc/artifacts/open-design-motion-evidence', stamp()),
    surfaces: ['home', 'talent', 'fusion', 'victory'],
    viewports: Object.keys(VIEWPORTS),
    locale: 'zh',
    headless: true,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--headed') out.headless = false;
    else if (raw === '--headless') out.headless = true;
    else {
      const match = raw.match(/^--([^=]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (['base-url', 'baseUrl'].includes(key)) out.baseUrl = value.replace(/\/$/, '');
      else if (['out-dir', 'outDir', 'out'].includes(key)) out.outDir = path.resolve(value);
      else if (key === 'surfaces') out.surfaces = split(value);
      else if (key === 'viewports') out.viewports = split(value);
      else if (['locale', 'lang'].includes(key)) out.locale = value;
    }
  }
  return out;
}

function representativeMeta() {
  const affix = (id, zh, cat, rarity, target, value) => ({ id, zh, cat, rarity, effect: { type: 'stat', target, op: 'add', value } });
  return {
    treeVersion: 4,
    dataVersion: 2,
    progressionVersion: 1,
    soulCrystals: 9999,
    soulLock: 12,
    runs: 12,
    totalKills: 1800,
    bestKills: 420,
    bestTimeSec: 930,
    perfTier: 'max',
    effectsLevel: 100,
    effectsAutoAdjust: false,
    selectedCharacter: 'archer',
    selectedMap: { mapId: 'map_border_outpost', difficultyId: 'hard' },
    progressFacts: {
      victoryRuns: 8,
      clearedByCharacters: { map_sunken_necropolis: ['archer', 'skeleton-mage', 'summoner', 'star-devourer', 'sentinel'] },
    },
    maps: {
      map_border_outpost: { unlocked: true, cleared: 3, completed: true, bestDifficulty: 'hard', unlockedDifficulties: ['normal', 'hard', 'nightmare'], firstClearRewards: { normal: true }, maskClaimed: true },
      map_sunken_necropolis: { unlocked: true, cleared: 1, completed: true, bestDifficulty: 'normal', unlockedDifficulties: ['normal'], firstClearRewards: {}, maskClaimed: true },
    },
    masks: [
      { uid: 1, id: 'mask-anubis', rank: 2, level: 18, affixes: [affix('signature', '伤害·本命', '攻', 'legendary', 'player.globalModifiers.damageMul', 0.12)] },
      { uid: 2, id: 'mask-ra', rank: 1, level: 12, affixes: [affix('crit', '暴击·传说', '攻', 'legendary', 'player.globalModifiers.critChance', 0.05)] },
      { uid: 3, id: 'mask-horus', rank: 1, level: 8 },
      { uid: 4, id: 'mask-bastet', rank: 1, level: 6 },
      { uid: 5, id: 'mask-khnum', rank: 1, level: 10 },
      { uid: 6, id: 'mask-thoth', rank: 1, level: 14 },
      { uid: 7, id: 'mask-set', rank: 1, level: 16 },
      { uid: 8, id: 'mask-osiris', rank: 1, level: 20 },
    ],
    shards: { 'mask-khnum': 99, 'mask-hathor': 99, 'mask-thoth': 99, 'mask-bastet': 99 },
    nextUid: 100,
    equipped: [1, 2, 3],
    maskSlots: 3,
    nodeRanks: { core: 1, 'leg-mask-slots': 3, 'war-dmg': 2 },
    purchasedNodes: [],
    characters: {
      archer: { level: 40, xp: 320, talentPoints: 18, nodeRanks: { core: 1, 'leg-mask-slots': 3, 'war-dmg': 2 }, equipped: [1, 2, 3] },
      'skeleton-mage': { level: 18, xp: 90, talentPoints: 5, nodeRanks: { core: 1, 'leg-mask-slots': 1 }, equipped: [4] },
      summoner: { level: 18, xp: 180, talentPoints: 8, nodeRanks: { core: 1 }, equipped: [5, 6] },
      'star-devourer': { level: 12, xp: 40, talentPoints: 3, nodeRanks: { core: 1 }, equipped: [7] },
      sentinel: { level: 8, xp: 0, talentPoints: 2, nodeRanks: { core: 1 }, equipped: [8] },
    },
  };
}

async function seedPage(page, locale) {
  await page.addInitScript(({ metaKey, langKey, lang, meta }) => {
    localStorage.setItem(metaKey, JSON.stringify(meta));
    localStorage.setItem(langKey, lang);
  }, { metaKey: META_KEY, langKey: LANG_KEY, lang: locale, meta: representativeMeta() });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function waitForMetaSurface(page, selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
  await page.waitForFunction((target) => {
    const root = document.querySelector(target);
    return root && root.getBoundingClientRect().width > 100 && root.getBoundingClientRect().height > 100;
  }, selector, { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function waitForGameSurface(page) {
  await waitForGameReady(page, { timeout: 45000 });
  await page.waitForFunction(() => typeof window.__darkboneQA?.showVictory === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

async function inspectMotion(page, rootSelector) {
  return page.evaluate((selector) => {
    const animations = [];
    try {
      for (const animation of document.getAnimations({ subtree: true })) {
        if (!['running', 'pending'].includes(animation.playState)) continue;
        const target = animation.effect?.target;
        if (selector && target && !target.closest?.(selector) && !target.matches?.(selector)) continue;
        animations.push({
          playState: animation.playState,
          name: String(animation.animationName || ''),
          target: target ? `${target.tagName?.toLowerCase?.() || ''}.${String(target.className || '').replace(/\s+/g, '.')}` : '',
        });
      }
    } catch { /* motion introspection is supporting evidence */ }
    const root = selector ? document.querySelector(selector) : document.body;
    const rect = root?.getBoundingClientRect?.();
    return {
      rootVisible: !!(rect && rect.width > 0 && rect.height > 0),
      rootRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      animations: animations.slice(0, 80),
    };
  }, rootSelector);
}

async function screenshotBeat(page, dir, beat, elapsedMs, rootSelector) {
  const filename = `${String(Math.round(elapsedMs)).padStart(5, '0')}-${beat}.webp`;
  const target = path.join(dir, filename);
  const temporaryPng = target.replace(/\.webp$/, '.png');
  await page.screenshot({ path: temporaryPng, type: 'png' });
  await execFileAsync('cwebp', ['-quiet', '-q', '88', '-alpha_q', '100', temporaryPng, '-o', target]);
  await fs.rm(temporaryPng, { force: true });
  const stat = await fs.stat(target);
  const motion = await inspectMotion(page, rootSelector);
  return { beat, timestampMs: Math.round(elapsedMs), path: filename, bytes: stat.size, motion, ok: stat.size > 1000 && motion.rootVisible };
}

async function runHome(page, dir, baseUrl) {
  await page.goto(`${baseUrl}/#home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForMetaSurface(page, '.egy-home-screen');
  const frames = [await screenshotBeat(page, dir, 'setup', 0, '.egy-home-screen')];
  const switched = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button.tile[data-act="pick"]')].find((item) => !item.classList.contains('on'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!switched) throw new Error('Home character switch target is unavailable');
  let previous = 0;
  for (const [at, beat] of [[120, 'entrance'], [450, 'transition'], [1100, 'rest'], [2600, 'ambient']]) {
    await page.waitForTimeout(at - previous);
    frames.push(await screenshotBeat(page, dir, beat, at, '.egy-home-screen'));
    previous = at;
  }
  return frames;
}

async function runTalent(page, dir, baseUrl) {
  await page.goto(`${baseUrl}/#talent`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForMetaSurface(page, '.egy-talent-root');
  const frames = [await screenshotBeat(page, dir, 'tree-setup', 0, '.egy-talent-root')];
  const selected = await page.evaluate(() => {
    const node = document.querySelector('.tk-node.is-avail');
    const viewport = document.querySelector('[data-viewport]');
    if (!node || !viewport) return false;
    const rect = node.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      pointerId: 919,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    node.dispatchEvent(new PointerEvent('pointerdown', event));
    window.dispatchEvent(new PointerEvent('pointerup', event));
    return true;
  });
  if (!selected) throw new Error('Talent has no available node for investment evidence');
  await page.waitForSelector('.tal-sheet.show [data-act="upgrade"]:not([disabled])', { state: 'visible', timeout: 5000 });
  await page.click('.tal-sheet.show [data-act="upgrade"]:not([disabled])');
  await page.waitForSelector('.tal-success.show', { state: 'visible', timeout: 5000 });
  let previous = 0;
  for (const [at, beat] of [[80, 'shock'], [360, 'eye-awaken'], [720, 'rank-impact'], [1150, 'settled']]) {
    await page.waitForTimeout(at - previous);
    frames.push(await screenshotBeat(page, dir, beat, at, '.egy-talent-root'));
    previous = at;
  }
  return frames;
}

async function runFusion(page, dir, baseUrl) {
  await page.goto(`${baseUrl}/#fusion`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForMetaSurface(page, '.fz-screen');
  await page.waitForFunction(() => typeof window.__darkboneReveal?._ensureMounted === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { window.__darkboneReveal.fuse('mythic', { awaken: true }); });
  await page.waitForSelector('#sm-reveal-host', { state: 'visible', timeout: 10000 });
  const frames = [];
  let previous = 0;
  for (const [at, beat] of [[80, 'sacrifice'], [1150, 'soul-streams'], [2050, 'vortex'], [2850, 'detonation'], [3900, 'birth'], [5450, 'proclaim'], [7200, 'settled']]) {
    await page.waitForTimeout(at - previous);
    frames.push(await screenshotBeat(page, dir, beat, at, '#sm-reveal-host'));
    previous = at;
  }
  return frames;
}

async function runVictory(page, dir, baseUrl) {
  await page.goto(`${baseUrl}/?perf=1&qa=1#game`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForGameSurface(page);
  await page.evaluate(() => window.__darkboneQA.showVictory('heavy'));
  await page.waitForSelector('.db-settlement-v2.reveal-mode .settle-v2-reveal', { state: 'visible', timeout: 15000 });
  const frames = [];
  let previous = 0;
  for (const [at, beat] of [[80, 'verdict'], [520, 'first-impact'], [1100, 'reward-land'], [1850, 'growth'], [2850, 'unlock-settle'], [3800, 'ready-dashboard']]) {
    await page.waitForTimeout(at - previous);
    frames.push(await screenshotBeat(page, dir, beat, at, '.db-settlement-v2'));
    previous = at;
  }
  return frames;
}

const RUNNERS = { home: runHome, talent: runTalent, fusion: runFusion, victory: runVictory };

async function captureScenario(browser, options, surface, viewport) {
  const outputDir = path.join(options.outDir, surface, viewport.id);
  const rawVideoDir = path.join(options.outDir, '.raw-video');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(rawVideoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.touch,
    recordVideo: { dir: rawVideoDir, size: { width: viewport.width, height: viewport.height } },
  });
  const page = await context.newPage();
  await seedPage(page, options.locale);
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
  const video = page.video();
  let frames = [];
  let runError = null;
  try {
    frames = await RUNNERS[surface](page, outputDir, options.baseUrl);
    await page.waitForTimeout(300);
  } catch (error) {
    runError = error?.stack || error?.message || String(error);
  }
  await page.close();
  const videoName = `${surface}-${viewport.id}.webm`;
  const videoPath = path.join(outputDir, videoName);
  try { await video.saveAs(videoPath); } catch (error) { runError ||= `video save failed: ${error.message}`; }
  await context.close();
  const videoStat = await fs.stat(videoPath).catch(() => null);
  const assertions = [
    { label: 'capture runner completed', ok: !runError, detail: runError },
    { label: 'page emitted no errors', ok: pageErrors.length === 0, detail: pageErrors },
    { label: 'console emitted no errors', ok: consoleErrors.length === 0, detail: consoleErrors },
    { label: 'all keyframes are real visible screenshots', ok: frames.length >= 3 && frames.every((frame) => frame.ok), detail: frames.map((frame) => ({ beat: frame.beat, bytes: frame.bytes, rootVisible: frame.motion.rootVisible })) },
    { label: 'runtime video was recorded', ok: !!videoStat?.isFile() && videoStat.size > 10000, detail: { bytes: videoStat?.size || 0 } },
  ];
  return {
    id: `${surface}-${viewport.id}`,
    surface,
    locale: options.locale,
    viewport,
    video: path.relative(options.outDir, videoPath),
    videoBytes: videoStat?.size || 0,
    frames: frames.map((frame) => ({ ...frame, path: path.join(surface, viewport.id, frame.path) })),
    pageErrors,
    consoleErrors,
    assertions,
    ok: assertions.every((assertion) => assertion.ok),
  };
}

const options = parseArgs(process.argv);
for (const surface of options.surfaces) if (!RUNNERS[surface]) throw new Error(`Unknown surface: ${surface}`);
for (const viewport of options.viewports) if (!VIEWPORTS[viewport]) throw new Error(`Unknown viewport: ${viewport}`);
if (!['zh', 'en'].includes(options.locale)) throw new Error('--locale must be zh or en');
await fs.mkdir(options.outDir, { recursive: true });
const response = await fetch(options.baseUrl).catch(() => null);
if (!response?.ok) throw new Error(`Runtime server is unavailable: ${options.baseUrl}`);

const browser = await chromium.launch({ headless: options.headless });
const scenarios = [];
try {
  for (const surface of options.surfaces) {
    for (const viewportId of options.viewports) {
      scenarios.push(await captureScenario(browser, options, surface, VIEWPORTS[viewportId]));
    }
  }
} finally {
  await browser.close();
}
await fs.rm(path.join(options.outDir, '.raw-video'), { recursive: true, force: true });
const manifest = {
  schemaVersion: 1,
  kind: 'runtime-motion-evidence',
  generatedAt: new Date().toISOString(),
  baseUrl: options.baseUrl,
  locale: options.locale,
  headless: options.headless,
  scenarios,
  ok: scenarios.length === options.surfaces.length * options.viewports.length && scenarios.every((scenario) => scenario.ok),
};
await fs.writeFile(path.join(options.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: manifest.ok, outDir: options.outDir, scenarios: scenarios.map((scenario) => ({ id: scenario.id, ok: scenario.ok, frames: scenario.frames.length, videoBytes: scenario.videoBytes })) }, null, 2));
if (!manifest.ok) process.exitCode = 1;
