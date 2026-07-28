#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildRuntimeAssertions, hasExactIds, VIEWPORTS } from './contract_helpers.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const META_KEY = 'darkbone.meta.v1';
const LANG_KEY = 'db_i18n_lang';

const FOCUS_VIEWPORTS = new Set(['phone-landscape', 'desktop-1440']);
const CHARACTER_IDS = ['archer', 'skeleton-mage', 'summoner', 'star-devourer', 'sentinel'];

const STATES = [
  { id: 'home-overview', surface: 'home', route: '#home', selector: '.egy-home-screen', scope: 'overview' },
  { id: 'home-loadout', surface: 'home', route: '#home', selector: '.egy-home-screen', scope: 'focus', prepare: openHomeLoadout },
  { id: 'mapselect-overview', surface: 'mapselect', route: '#mapselect', selector: '.ms2-root', scope: 'overview' },
  { id: 'mapselect-detail', surface: 'mapselect', route: '#mapselect', selector: '.ms2-root', scope: 'focus', prepare: openMapDetail },
  { id: 'talent-overview', surface: 'talent', route: '#talent', selector: '.egy-talent-root', scope: 'overview' },
  { id: 'talent-node-detail', surface: 'talent', route: '#talent', selector: '.egy-talent-root', scope: 'focus', prepare: openTalentNode },
  { id: 'masks-overview', surface: 'masks', route: '#masks', selector: '#mask-hub-host', scope: 'overview', prepare: waitForMaskHub },
  { id: 'masks-detail-level-gate', surface: 'masks', route: '#masks', selector: '#mask-hub-host', scope: 'focus', prepare: openMaskDetail },
  { id: 'fusion-empty', surface: 'fusion', route: '#fusion', selector: '.fz-screen', scope: 'overview' },
  { id: 'fusion-ready-lock', surface: 'fusion', route: '#fusion', selector: '.fz-screen', scope: 'focus', prepare: prepareFusion },
];

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function parseArgs(argv) {
  const out = {
    baseUrl: 'http://127.0.0.1:5173',
    outDir: path.join(REPO_ROOT, '.omc/artifacts/open-design-meta-ui-audit', stamp()),
    locales: ['zh', 'en'],
    viewports: VIEWPORTS.map((viewport) => viewport.id),
    mode: 'all',
    focusAllViewports: false,
    headless: true,
    extractCharacters: true,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--headed') out.headless = false;
    else if (raw === '--headless') out.headless = true;
    else if (raw === '--focus-all-viewports') out.focusAllViewports = true;
    else if (raw === '--no-character-assets') out.extractCharacters = false;
    else {
      const match = raw.match(/^--([^=]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (['base-url', 'baseUrl'].includes(key)) out.baseUrl = value.replace(/\/$/, '');
      else if (['out-dir', 'outDir', 'out'].includes(key)) out.outDir = path.resolve(value);
      else if (['locales', 'langs'].includes(key)) out.locales = splitList(value);
      else if (key === 'viewports') out.viewports = splitList(value);
      else if (key === 'mode') out.mode = value;
    }
  }
  return out;
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function representativeMeta() {
  const sigDamage = { id: 'signature', zh: '伤害·本命', cat: 'sig', rarity: 'legendary', effect: { type: 'stat', target: 'player.globalModifiers.damageMul', op: 'mul', value: 1.122 } };
  const sigSpeed = { id: 'signature', zh: '急速·本命', cat: 'sig', rarity: 'legendary', effect: { type: 'stat', target: 'player.globalModifiers.attackSpeedMul', op: 'mul', value: 1.136 } };
  const sigHp = { id: 'signature', zh: '生命·本命', cat: 'sig', rarity: 'legendary', effect: { type: 'stat', target: 'player.base.hp', op: 'add', value: 30 } };
  const affixCrit = { id: 'af-soul-flame-critChance-legendary', zh: '暴击·传说', cat: '攻', rarity: 'legendary', effect: { type: 'stat', target: 'player.globalModifiers.critChance', op: 'add', value: 0.054 } };
  const affixArmor = { id: 'af-corrode-armorAdd-legendary', zh: '护甲·传说', cat: '守', rarity: 'legendary', effect: { type: 'stat', target: 'player.globalModifiers.armorAdd', op: 'add', value: 12 } };
  const affixXp = { id: 'af-corrode-xpGainMul-epic', zh: '经验·史诗', cat: '益', rarity: 'epic', effect: { type: 'stat', target: 'player.globalModifiers.xpGainMul', op: 'mul', value: 1.1 } };
  const affixChain = { id: 'af-stun-soul-chain-jumps-epic', zh: '魂链跳跃·史诗', cat: '械', rarity: 'epic', effect: { type: 'weapon', weapon: 'soul-chain', op: 'add', field: 'jumps', value: 1 } };
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
    effectsLevel: 20,
    effectsAutoAdjust: false,
    selectedCharacter: 'archer',
    selectedMap: { mapId: 'map_border_outpost', difficultyId: 'hard' },
    progressFacts: { clearedByCharacters: {}, victoryRuns: 8 },
    maps: {
      map_border_outpost: {
        unlocked: true,
        cleared: 3,
        completed: true,
        bestDifficulty: 'hard',
        unlockedDifficulties: ['normal', 'hard', 'nightmare'],
        firstClearRewards: { normal: true },
        maskClaimed: true,
      },
      map_sunken_necropolis: {
        unlocked: true,
        cleared: 1,
        completed: false,
        bestDifficulty: 'normal',
        unlockedDifficulties: ['normal'],
        firstClearRewards: {},
      },
    },
    masks: [
      { uid: 1, id: 'mask-anubis', rank: 2, level: 18, affixes: [sigDamage, affixArmor, affixXp] },
      { uid: 2, id: 'mask-ra', rank: 1, level: 12, affixes: [sigSpeed, affixCrit, affixChain] },
      { uid: 3, id: 'mask-horus', rank: 1, level: 8 },
      { uid: 4, id: 'mask-bastet', rank: 1, level: 6 },
      { uid: 5, id: 'mask-khnum', rank: 1, level: 10 },
      { uid: 6, id: 'mask-thoth', rank: 1, level: 14 },
      { uid: 7, id: 'mask-set', rank: 1, level: 16 },
      { uid: 8, id: 'mask-osiris', rank: 1, level: 20, affixes: [sigHp, affixArmor, affixCrit] },
      { uid: 20, id: 'mask-ra', rank: 3, level: 24, affixes: [sigSpeed, affixCrit, affixChain] },
      { uid: 21, id: 'mask-hapi', rank: 3, level: 24, affixes: [sigHp, affixArmor, affixXp] },
    ],
    shards: { 'mask-khnum': 99, 'mask-hathor': 99, 'mask-thoth': 99, 'mask-bastet': 99 },
    nextUid: 100,
    equipped: [1, 2, 3],
    maskSlots: 3,
    nodeRanks: { core: 1, 'leg-mask-slots': 3, 'war-dmg': 2 },
    purchasedNodes: [],
    characters: {
      archer: { level: 40, xp: 320, talentPoints: 18, nodeRanks: { core: 1, 'leg-mask-slots': 3, 'war-dmg': 2 }, equipped: [1, 2, 3] },
      'skeleton-mage': { level: 8, xp: 90, talentPoints: 5, nodeRanks: { core: 1, 'leg-mask-slots': 1 }, equipped: [4] },
      summoner: { level: 18, xp: 180, talentPoints: 8, nodeRanks: { core: 1 }, equipped: [5, 6] },
      'star-devourer': { level: 7, xp: 40, talentPoints: 3, nodeRanks: { core: 1 }, equipped: [7] },
      sentinel: { level: 1, xp: 0, talentPoints: 0, nodeRanks: {}, equipped: [] },
    },
  };
}

function metaForState(state) {
  const meta = structuredClone(representativeMeta());
  if (state.id === 'home-loadout') {
    meta.equipped = [1, 2];
    meta.characters.archer.equipped = [1, 2];
  }
  if (state.surface === 'masks') {
    meta.selectedCharacter = 'skeleton-mage';
    meta.equipped = [4];
    meta.nodeRanks = { core: 1, 'leg-mask-slots': 1 };
  }
  return meta;
}

function allCharactersUnlockedMeta() {
  const meta = representativeMeta();
  meta.progressFacts.clearedByCharacters.map_sunken_necropolis = ['star-devourer'];
  meta.maps.map_sunken_necropolis.completed = true;
  return meta;
}

async function ensureServer(baseUrl) {
  const response = await fetch(baseUrl);
  if (!response.ok && response.status >= 500) throw new Error(`Runtime returned HTTP ${response.status}: ${baseUrl}`);
}

async function seedPage(page, meta, locale) {
  await page.addInitScript(({ metaKey, langKey, value, lang }) => {
    localStorage.setItem(metaKey, JSON.stringify(value));
    localStorage.setItem(langKey, lang);
  }, { metaKey: META_KEY, langKey: LANG_KEY, value: meta, lang: locale });
}

async function waitForVisualAssets(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
    const roots = [];
    const visit = (root) => {
      roots.push(root);
      for (const host of root.querySelectorAll?.('*') || []) if (host.shadowRoot) visit(host.shadowRoot);
    };
    visit(document);
    const images = roots.flatMap((root) => Array.from(root.querySelectorAll?.('img') || []));
    await Promise.all(images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) return;
      try { await image.decode(); } catch { /* visual capture records broken images separately */ }
    }));
  });
  await page.waitForTimeout(700);
}

async function openHomeLoadout(page) {
  // Phone landscape currently lets the bottom nav overlap this socket. Force the
  // test-only activation so the handoff can still include the picker state; the
  // overlap itself is recorded as a baseline design finding, not normalized away.
  const dispatched = await page.evaluate(() => {
    const button = document.querySelector('[data-act="loadout"]');
    button?.click();
    return !!button;
  });
  if (!dispatched) throw new Error('Home loadout trigger was not found');
  await page.waitForSelector('.lo-sheet', { timeout: 10000 });
}

async function openMapDetail(page) {
  const opened = await page.evaluate(() => {
    const root = document.querySelector('.ms2-root');
    const node = root?.querySelector('[data-act="detail"][data-map="map_border_outpost"]')
      || root?.querySelector('[data-act="enter-current"][data-map="map_border_outpost"]')
      || root?.querySelector('[data-act="detail"]');
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return !!node;
  });
  if (!opened) throw new Error('Map detail trigger was not found');
  await page.waitForSelector('.ms2-detail-screen', { timeout: 10000 });
}

async function openTalentNode(page) {
  const opened = await page.evaluate(() => {
    const node = document.querySelector('[data-act="node"][data-id="core"]') || document.querySelector('[data-act="node"]');
    const viewport = document.querySelector('[data-viewport]');
    if (!node || !viewport) return false;
    const rect = node.getBoundingClientRect();
    const event = {
      bubbles: true,
      cancelable: true,
      pointerId: 911,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    node.dispatchEvent(new PointerEvent('pointerdown', event));
    window.dispatchEvent(new PointerEvent('pointerup', event));
    return true;
  });
  if (!opened) throw new Error('Talent node trigger was not found');
  await page.waitForSelector('[data-sheet].show, .tal-sheet.show', { timeout: 10000 });
}

async function waitForMaskHub(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#mask-hub-host')?.shadowRoot;
    return !!root?.querySelector('#screenHub.on #gridCollect .card');
  }, { timeout: 20000 });
}

async function openMaskDetail(page) {
  await waitForMaskHub(page);
  const opened = await page.evaluate(() => {
    if (!window.HUB?.openDetail) return false;
    window.HUB.go?.('hub', 'collect');
    window.HUB.openDetail('20');
    return true;
  });
  if (!opened) throw new Error('Mask detail API was not available');
  await page.waitForFunction(() => {
    const root = document.querySelector('#mask-hub-host')?.shadowRoot;
    return !!root?.querySelector('#detail.on #detailCard');
  }, { timeout: 10000 });
}

async function pickFusionMask(page, slot, uid) {
  await page.locator(`[data-act="slot"][data-i="${slot}"]`).first().click();
  await page.waitForSelector('.picker-sheet.open, .picker-sheet', { timeout: 10000 });
  const target = page.locator(`[data-act="pick"][data-uid="${uid}"]`).first();
  if (await target.count()) await target.click();
  else await page.locator('[data-act="pick"]').nth(slot).click();
  await page.waitForTimeout(180);
}

async function prepareFusion(page) {
  await pickFusionMask(page, 0, 20);
  await pickFusionMask(page, 1, 21);
  const lock = page.locator('[data-act="lock"]:not([disabled])').first();
  if (await lock.count()) await lock.click();
}

async function collectGeometry(page, selector, locale) {
  return page.evaluate(({ rootSelector, locale }) => {
    const roots = [];
    const visit = (scope) => {
      roots.push(scope);
      for (const host of scope.querySelectorAll?.('*') || []) if (host.shadowRoot) visit(host.shadowRoot);
    };
    visit(document);
    const composedParent = (element) => element.parentElement || element.getRootNode()?.host || null;
    const visible = (element) => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return false;
      for (let current = element; current instanceof HTMLElement; current = composedParent(current)) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0) return false;
      }
      return bounds.right > 0 && bounds.bottom > 0 && bounds.left < innerWidth && bounds.top < innerHeight;
    };
    const root = document.querySelector(rootSelector);
    const rect = root?.getBoundingClientRect();
    const buttons = roots.flatMap((scope) => Array.from(scope.querySelectorAll?.('button, [role="button"], a[href], [tabindex]:not([tabindex="-1"])') || []))
      .filter((element) => visible(element) && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true');
    const sizes = buttons.map((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
    });
    const images = roots.flatMap((scope) => Array.from(scope.querySelectorAll?.('img') || []))
      .filter(visible)
      .map((image) => ({
        src: image.currentSrc || image.getAttribute('src') || '',
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      }));
    const visibleTextParts = [];
    for (const scope of roots) {
      const walker = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = String(node.nodeValue || '').trim().replace(/\s+/g, ' ');
        const parent = node.parentElement;
        if (!text || !parent || !visible(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const onScreen = [...range.getClientRects()].some((box) => box.width > 0 && box.height > 0
          && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight);
        if (onScreen) visibleTextParts.push(text);
      }
    }
    const visibleText = visibleTextParts.join(' ').trim();
    const chineseGlyphs = (visibleText.match(/[\u3400-\u9fff]/g) || []).length;
    const chineseSamples = [...new Set(visibleTextParts.filter((text) => /[\u3400-\u9fff]/.test(text)))].slice(0, 12);
    const lang = document.documentElement.lang || '';
    const rootWithinViewport = !!rect && rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    return {
      root: rect ? {
        left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom),
        width: Math.round(rect.width), height: Math.round(rect.height),
      } : null,
      rootWithinViewport,
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      visibleButtons: sizes.length,
      smallestButton: sizes.length ? sizes.reduce((a, b) => (a.width * a.height < b.width * b.height ? a : b)) : null,
      largestButton: sizes.length ? sizes.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b)) : null,
      visibleTextLength: visibleText.length,
      images,
      canvases: roots.reduce((sum, scope) => sum + (scope.querySelectorAll?.('canvas').length || 0), 0),
      shadowRoots: roots.length - 1,
      langMatches: lang.toLowerCase().startsWith(locale === 'zh' ? 'zh' : 'en'),
      localeCopyMatches: locale === 'en' ? chineseGlyphs === 0 : chineseGlyphs > 0,
      localeSummary: `${lang}; zhGlyphs=${chineseGlyphs}; samples=${chineseSamples.join(' | ')}`,
      foreignLocaleSamples: locale === 'en' ? chineseSamples : [],
    };
  }, { rootSelector: selector, locale });
}

async function convertPngToWebp(pngPath, webpPath, quality = 84) {
  await fs.mkdir(path.dirname(webpPath), { recursive: true });
  await execFileAsync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '100', pngPath, '-o', webpPath]);
  await fs.unlink(pngPath).catch(() => {});
}

async function screenshotWebp(page, webpPath) {
  const pngPath = `${webpPath}.tmp.png`;
  await fs.mkdir(path.dirname(webpPath), { recursive: true });
  await page.screenshot({ path: pngPath, fullPage: false, animations: 'disabled' });
  await convertPngToWebp(pngPath, webpPath);
  const header = await fs.readFile(webpPath).then((buffer) => buffer.subarray(0, 12));
  if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Invalid WebP signature: ${webpPath}`);
  }
  return fs.stat(webpPath);
}

async function captureState(browser, args, viewport, locale, state) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.input.includes('touch'),
    isMobile: viewport.id === 'phone-landscape',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedPage(page, metaForState(state), locale);
  const screenshotPath = path.join(args.outDir, 'screenshots', locale, viewport.id, `${state.id}.webp`);
  try {
    await page.goto(`${args.baseUrl}/?lang=${encodeURIComponent(locale)}${state.route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(state.selector, { state: 'visible', timeout: 20000 });
    if (state.prepare) await state.prepare(page);
    await waitForVisualAssets(page);
    const geometry = await collectGeometry(page, state.selector, locale);
    const stat = await screenshotWebp(page, screenshotPath);
    const assertions = buildRuntimeAssertions({ locale, viewport, geometry, pageErrors, consoleErrors, screenshotBytes: stat.size });
    return {
      id: `${locale}-${viewport.id}-${state.id}`,
      surface: state.surface,
      state: state.id,
      locale,
      viewport: viewport.id,
      route: state.route,
      screenshot: screenshotPath,
      bytes: stat.size,
      geometry,
      pageErrors,
      consoleErrors,
      assertions,
      ok: assertions.every((assertion) => assertion.ok),
    };
  } catch (error) {
    return {
      id: `${locale}-${viewport.id}-${state.id}`,
      surface: state.surface,
      state: state.id,
      locale,
      viewport: viewport.id,
      route: state.route,
      screenshot: screenshotPath,
      pageErrors,
      consoleErrors,
      assertions: [],
      error: error?.stack || error?.message || String(error),
      ok: false,
    };
  } finally {
    await context.close();
  }
}

async function extractCharacterEvidence(browser, args, manifest) {
  const viewport = VIEWPORTS.find((item) => item.id === 'desktop-1440');
  if (!viewport) return;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedPage(page, allCharactersUnlockedMeta(), 'zh');
  try {
    await page.goto(`${args.baseUrl}/?lang=zh#home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.egy-home-screen', { state: 'visible', timeout: 20000 });
    await waitForVisualAssets(page);
    for (const characterId of CHARACTER_IDS) {
      const tile = page.locator(`[data-act="pick"][data-id="${characterId}"]`).first();
      if (!(await tile.count())) throw new Error(`Required character tile was not found: ${characterId}`);
      await tile.click();
      await page.waitForFunction((id) => document.querySelector('#cs-reveal')?.getAttribute('data-char') === id, characterId, { timeout: 10000 });
      await page.waitForTimeout(850);
      const fullPath = path.join(args.outDir, 'screenshots', 'zh', viewport.id, `home-character-${characterId}.webp`);
      const geometry = await collectGeometry(page, '.egy-home-screen', 'zh');
      const fullStat = await screenshotWebp(page, fullPath);
      const assertions = buildRuntimeAssertions({
        locale: 'zh', viewport, geometry, pageErrors, consoleErrors, screenshotBytes: fullStat.size,
      });
      manifest.scenarios.push({
        id: `zh-${viewport.id}-home-character-${characterId}`,
        surface: 'home',
        state: `home-character-${characterId}`,
        locale: 'zh',
        viewport: viewport.id,
        route: '#home',
        screenshot: fullPath,
        bytes: fullStat.size,
        geometry,
        pageErrors: [...pageErrors],
        consoleErrors: [...consoleErrors],
        assertions,
        ok: assertions.every((assertion) => assertion.ok),
      });

      const canvasEvidence = await page.locator('#revealCanvas').evaluate((canvas) => {
        const context2d = canvas.getContext('2d', { willReadFrequently: true });
        if (!context2d || canvas.width <= 0 || canvas.height <= 0) return { ok: false, dataUrl: '', width: canvas.width, height: canvas.height, paintedPixels: 0 };
        const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        let paintedPixels = 0;
        for (let index = 3; index < pixels.length; index += 16) if (pixels[index] > 16) paintedPixels += 1;
        return {
          ok: paintedPixels > 100,
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          paintedPixels,
        };
      });
      if (!canvasEvidence.ok || !canvasEvidence.dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error(`Character reveal canvas is blank or unreadable: ${characterId}`);
      }
      const pngPath = path.join(args.outDir, 'character-assets', `${characterId}.tmp.png`);
      const webpPath = path.join(args.outDir, 'character-assets', `${characterId}.webp`);
      await fs.mkdir(path.dirname(pngPath), { recursive: true });
      await fs.writeFile(pngPath, Buffer.from(canvasEvidence.dataUrl.split(',')[1], 'base64'));
      await convertPngToWebp(pngPath, webpPath, 92);
      const stat = await fs.stat(webpPath);
      if (stat.size <= 4096) throw new Error(`Extracted character asset is unexpectedly small: ${characterId} (${stat.size} bytes)`);
      manifest.characterAssets.push({
        id: characterId,
        file: webpPath,
        bytes: stat.size,
        width: canvasEvidence.width,
        height: canvasEvidence.height,
        paintedPixels: canvasEvidence.paintedPixels,
        source: '#home revealCanvas',
      });
    }
  } finally {
    await context.close();
  }
}

const args = parseArgs(process.argv);
const selectedViewports = VIEWPORTS.filter((viewport) => args.viewports.includes(viewport.id));
const unknownViewports = args.viewports.filter((id) => !VIEWPORTS.some((viewport) => viewport.id === id));
const unknownLocales = args.locales.filter((locale) => !['zh', 'en'].includes(locale));
if (unknownViewports.length) throw new Error(`Unknown viewports: ${unknownViewports.join(', ')}`);
if (unknownLocales.length) throw new Error(`Unknown locales: ${unknownLocales.join(', ')}`);
if (!['all', 'overview', 'focus'].includes(args.mode)) throw new Error(`Unknown --mode=${args.mode}`);
if (!selectedViewports.length || !args.locales.length) throw new Error('At least one viewport and locale are required');

await ensureServer(args.baseUrl);
await fs.mkdir(args.outDir, { recursive: true });
const browser = await chromium.launch({ headless: args.headless });
const manifest = {
  schemaVersion: 'darkbone-open-design-ui-audit/v2',
  ok: false,
  generatedAt: new Date().toISOString(),
  baseUrl: args.baseUrl,
  outDir: args.outDir,
  workdir: REPO_ROOT,
  viewports: selectedViewports,
  locales: args.locales,
  scenarios: [],
  characterAssets: [],
  errors: [],
};

try {
  for (const locale of args.locales) {
    for (const viewport of selectedViewports) {
      for (const state of STATES) {
        if (args.mode !== 'all' && state.scope !== args.mode) continue;
        if (state.scope === 'focus' && !args.focusAllViewports && !FOCUS_VIEWPORTS.has(viewport.id)) continue;
        const result = await captureState(browser, args, viewport, locale, state);
        manifest.scenarios.push(result);
        if (!result.ok) {
          const failed = result.assertions?.filter((assertion) => !assertion.ok).map((assertion) => assertion.label).join(', ');
          manifest.errors.push(`${result.id}: ${result.error || failed || 'capture failed'}`);
        }
      }
    }
  }
  if (args.extractCharacters) {
    try {
      await extractCharacterEvidence(browser, args, manifest);
    } catch (error) {
      manifest.errors.push(`character-assets: ${error?.message || String(error)}`);
    }
  }
  const charactersComplete = !args.extractCharacters
    || hasExactIds(manifest.characterAssets, CHARACTER_IDS);
  if (!charactersComplete) {
    manifest.errors.push(`character-assets: expected ${CHARACTER_IDS.length}, captured ${manifest.characterAssets.length}`);
  }
  for (const scenario of manifest.scenarios.filter((item) => !item.ok)) {
    if (manifest.errors.some((error) => error.startsWith(`${scenario.id}:`))) continue;
    const failed = scenario.assertions?.filter((assertion) => !assertion.ok).map((assertion) => assertion.label).join(', ');
    manifest.errors.push(`${scenario.id}: ${scenario.error || failed || 'capture failed'}`);
  }
  manifest.summary = {
    scenarioCount: manifest.scenarios.length,
    failedScenarios: manifest.scenarios.filter((scenario) => !scenario.ok).length,
    pageErrors: manifest.scenarios.reduce((sum, scenario) => sum + (scenario.pageErrors?.length || 0), 0),
    consoleErrors: manifest.scenarios.reduce((sum, scenario) => sum + (scenario.consoleErrors?.length || 0), 0),
    characterAssetsRequired: args.extractCharacters ? CHARACTER_IDS.length : 0,
    characterAssetsCaptured: manifest.characterAssets.length,
    charactersComplete,
  };
  manifest.ok = manifest.scenarios.length > 0 && manifest.scenarios.every((scenario) => scenario.ok)
    && charactersComplete && manifest.errors.length === 0;
} finally {
  await browser.close();
  manifest.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(args.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  ok: manifest.ok,
  outDir: args.outDir,
  screenshots: manifest.scenarios.length,
  characterAssets: manifest.characterAssets.length,
  errors: manifest.errors.slice(0, 10),
}, null, 2));

if (!manifest.ok) process.exitCode = 1;
