#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  buildPreviewAssertions,
  buildPreviewScenarios,
  buildContractCartesianScenarios,
  contractProfileFor,
  parseOpenDesignPreviewIdentity,
  previewContractFor,
  scenarioTupleKey,
  SCREENS,
  validateContractCartesianCoverage,
  validateFullPreviewCoverage,
  VIEWPORTS,
} from './contract_helpers.mjs';
import { readAndValidateGenerationEvidence } from './open_design_generation_evidence.mjs';
import { readAndValidatePreservationContract } from '../../open-design-game-ui-handoff/scripts/preservation_contract.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_DAEMON_LOG = path.join(
  process.env.HOME || '',
  'Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log',
);

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  let screensExplicit = false;
  let viewportsExplicit = false;
  const out = {
    daemonUrl: '',
    previewUrl: '',
    projectId: '',
    file: '',
    contract: '',
    generationEvidence: '',
    outDir: path.join(REPO_ROOT, '.omc/artifacts/open-design-preview', stamp()),
    locales: ['zh', 'en'],
    screens: [...SCREENS],
    viewports: VIEWPORTS.map((viewport) => viewport.id),
    scenarioSet: 'full',
    archiveArtifact: '',
    sourcePreviewManifest: '',
    contractProfile: 'meta-ui',
    headless: true,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--headed') out.headless = false;
    else if (raw === '--headless') out.headless = true;
    else {
      const match = raw.match(/^--([^=]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (['daemon-url', 'daemonUrl'].includes(key)) out.daemonUrl = value.replace(/\/$/, '');
      else if (['preview-url', 'previewUrl'].includes(key)) out.previewUrl = value;
      else if (['project', 'project-id', 'projectId'].includes(key)) out.projectId = value;
      else if (key === 'file') out.file = value;
      else if (['contract', 'preservation-contract', 'preservationContract'].includes(key)) out.contract = path.resolve(value);
      else if (['generation-evidence', 'generationEvidence'].includes(key)) out.generationEvidence = path.resolve(value);
      else if (['archive-artifact', 'archiveArtifact'].includes(key)) out.archiveArtifact = path.resolve(value);
      else if (['source-preview-manifest', 'sourcePreviewManifest'].includes(key)) out.sourcePreviewManifest = path.resolve(value);
      else if (['out-dir', 'outDir', 'out'].includes(key)) out.outDir = path.resolve(value);
      else if (['locales', 'langs'].includes(key)) out.locales = splitList(value);
      else if (key === 'screens') { out.screens = splitList(value); screensExplicit = true; }
      else if (key === 'viewports') { out.viewports = splitList(value); viewportsExplicit = true; }
      else if (['scenario-set', 'scenarioSet'].includes(key)) out.scenarioSet = value;
      else if (['contract-profile', 'contractProfile', 'profile'].includes(key)) out.contractProfile = value;
    }
  }
  const profile = contractProfileFor(out.contractProfile);
  if (!screensExplicit) out.screens = [...profile.screens];
  if (!viewportsExplicit) out.viewports = profile.viewports.map((viewport) => viewport.id);
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

async function screenshotWebp(page, webpPath) {
  const pngPath = `${webpPath}.tmp.png`;
  await fs.mkdir(path.dirname(webpPath), { recursive: true });
  await page.screenshot({ path: pngPath, fullPage: false, animations: 'disabled' });
  await execFileAsync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', pngPath, '-o', webpPath]);
  await fs.unlink(pngPath).catch(() => {});
  const bytes = await fs.readFile(webpPath);
  return {
    stat: await fs.stat(webpPath),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function activeFocusEvidence(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) {
      return { focused: false, selector: null, focusVisible: false, visualFocus: false };
    }
    const selector = element.dataset.odId ? `[data-od-id="${element.dataset.odId}"]`
      : element.id ? `#${element.id}`
        : element.dataset.action ? `${element.tagName.toLowerCase()}[data-action="${element.dataset.action}"]`
          : element.tagName.toLowerCase();
    const style = getComputedStyle(element);
    const visualFocus = element.matches(':focus-visible')
      && (style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0));
    return { focused: true, selector, focusVisible: element.matches(':focus-visible'), visualFocus };
  });
}

async function runInputProbe(page, probe) {
  if (probe === 'title-keyboard-navigation') {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press('Tab');
    const first = await activeFocusEvidence(page);
    await page.keyboard.press('ArrowDown');
    const second = await activeFocusEvidence(page);
    return {
      ok: first.focused && first.visualFocus && second.focused && second.visualFocus && first.selector !== second.selector,
      first,
      second,
    };
  }

  if (probe === 'title-controller-navigation') {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.__OD_SET_GAMEPAD_BUTTON__(13, true);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(13, false));
    await page.waitForTimeout(70);
    const first = await activeFocusEvidence(page);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(12, true));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(12, false));
    await page.waitForTimeout(70);
    const second = await activeFocusEvidence(page);
    return {
      ok: first.focused && first.visualFocus && second.focused && second.visualFocus && first.selector !== second.selector,
      first,
      second,
    };
  }

  if (probe === 'keyboard-focus') {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await page.keyboard.press('Tab');
    const first = await activeFocusEvidence(page);
    await page.keyboard.press('ArrowLeft');
    const second = await activeFocusEvidence(page);
    return {
      ok: first.focused && first.visualFocus && second.focused && second.visualFocus && first.selector !== second.selector,
      first,
      second,
    };
  }

  if (probe === 'gamepad-focus') {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.__OD_SET_GAMEPAD_BUTTON__(15, true);
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(15, false));
    await page.waitForTimeout(70);
    const first = await activeFocusEvidence(page);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(14, true));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__OD_SET_GAMEPAD_BUTTON__(14, false));
    await page.waitForTimeout(70);
    const second = await activeFocusEvidence(page);
    return {
      ok: first.focused && first.visualFocus && second.focused && second.visualFocus && first.selector !== second.selector,
      first,
      second,
    };
  }

  if (probe === 'hover') {
    const target = page.locator('button[data-action="select-mask"]:not(.selected):visible').first();
    const before = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, background: style.background, boxShadow: style.boxShadow, filter: style.filter, transform: style.transform };
    });
    await target.hover();
    const after = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return { hovered: element.matches(':hover'), borderColor: style.borderColor, background: style.background, boxShadow: style.boxShadow, filter: style.filter, transform: style.transform };
    });
    const changed = ['borderColor', 'background', 'boxShadow', 'filter', 'transform'].some((key) => before[key] !== after[key]);
    return { ok: after.hovered && changed, before, after };
  }

  if (probe === 'back-navigation') {
    const before = await page.evaluate(() => window.DARKBONE_DESIGN_REVIEW.snapshot());
    await page.keyboard.press('Escape');
    await page.waitForFunction((state) => window.DARKBONE_DESIGN_REVIEW.snapshot().state !== state, before.state, { timeout: 3000 });
    const after = await page.evaluate(() => ({
      snapshot: window.DARKBONE_DESIGN_REVIEW.snapshot(),
      modalOpen: !!document.querySelector('#modalRoot.open .modal, [data-od-modal-open="true"]'),
    }));
    return { ok: before.state !== after.snapshot.state && !after.modalOpen, before, after };
  }

  if (probe === 'modal-focus-trap') {
    const initial = await page.evaluate(() => {
      const modal = document.querySelector('#modalRoot.open .modal, [data-od-modal-open="true"]');
      const focusables = modal ? [...modal.querySelectorAll('button:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0) : [];
      return { count: focusables.length, activeInside: !!modal?.contains(document.activeElement), activeText: document.activeElement?.textContent?.trim() || '' };
    });
    const sequence = [];
    for (let index = 0; index < initial.count; index += 1) {
      await page.keyboard.press('Tab');
      sequence.push(await page.evaluate(() => ({
        inside: !!document.querySelector('#modalRoot.open .modal, [data-od-modal-open="true"]')?.contains(document.activeElement),
        text: document.activeElement?.textContent?.trim() || '',
      })));
    }
    await page.keyboard.press('Shift+Tab');
    const reverse = await page.evaluate(() => ({
      inside: !!document.querySelector('#modalRoot.open .modal, [data-od-modal-open="true"]')?.contains(document.activeElement),
      text: document.activeElement?.textContent?.trim() || '',
    }));
    return {
      ok: initial.count >= 2 && initial.activeInside && sequence.every((item) => item.inside)
        && sequence.at(-1)?.text === initial.activeText && reverse.inside,
      initial,
      sequence,
      reverse,
    };
  }

  if (probe === 'title-safe-default') {
    return page.evaluate(() => {
      const safe = document.querySelector('[data-od-safe-default="cancel"]');
      const destructive = document.querySelector('[data-od-destructive="true"]');
      return {
        ok: safe instanceof HTMLElement && document.activeElement === safe && document.activeElement !== destructive,
        safeText: safe?.textContent?.trim() || '',
        activeText: document.activeElement?.textContent?.trim() || '',
        destructiveFocused: document.activeElement === destructive,
      };
    });
  }

  if (probe === 'title-quit-capability') {
    return page.evaluate(() => {
      const snapshot = window.DARKBONE_DESIGN_REVIEW.snapshot();
      const quit = document.querySelector('[data-od-id="title-quit-command"]');
      const visible = quit instanceof HTMLElement && getComputedStyle(quit).display !== 'none'
        && quit.getBoundingClientRect().width > 0 && quit.getBoundingClientRect().height > 0;
      return { ok: visible === (snapshot.capabilities?.desktopQuit === true), visible, capability: snapshot.capabilities?.desktopQuit === true };
    });
  }

  if (probe === 'title-local-first-frame') {
    return page.evaluate(() => {
      const root = document.querySelector('[data-od-id="title-screen"]');
      const brand = document.querySelector('[data-od-id="title-brand-lockup"]');
      return {
        ok: root?.getAttribute('data-local-first-frame') === 'true'
          && brand instanceof HTMLElement && brand.getBoundingClientRect().width > 0 && brand.getBoundingClientRect().height > 0,
        localFirstFrame: root?.getAttribute('data-local-first-frame') || null,
        brandText: brand?.textContent?.trim() || '',
      };
    });
  }

  return { ok: false, error: `Unknown input probe: ${probe}` };
}

async function collectIndependentEvidence(page, contract, spec) {
  return page.evaluate(({ expected, locale, requireTouchTargets, reducedMotion, contractProfile }) => {
    const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const clippedBounds = (element) => {
      const bounds = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const rect = ancestor.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          bounds.left = Math.max(bounds.left, rect.left);
          bounds.right = Math.min(bounds.right, rect.right);
        }
        if (style.overflowY !== 'visible') {
          bounds.top = Math.max(bounds.top, rect.top);
          bounds.bottom = Math.min(bounds.bottom, rect.bottom);
        }
      }
      return bounds;
    };
    const intersection = (rect, bounds) => ({
      left: Math.max(rect.left, bounds.left),
      top: Math.max(rect.top, bounds.top),
      right: Math.min(rect.right, bounds.right),
      bottom: Math.min(rect.bottom, bounds.bottom),
      width: Math.max(0, Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left)),
      height: Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top)),
    });
    const styleVisible = (element) => {
      for (let current = element; current instanceof HTMLElement; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0) return false;
      }
      const rect = element.getBoundingClientRect();
      const visibleRect = intersection(rect, clippedBounds(element));
      return rect.width > 0 && rect.height > 0 && visibleRect.width > 0 && visibleRect.height > 0;
    };
    const hitVisible = (element, visibleRect) => {
      const insetX = Math.min(1, visibleRect.width / 4);
      const insetY = Math.min(1, visibleRect.height / 4);
      const points = [
        [(visibleRect.left + visibleRect.right) / 2, (visibleRect.top + visibleRect.bottom) / 2],
        [visibleRect.left + insetX, visibleRect.top + insetY],
        [visibleRect.right - insetX, visibleRect.top + insetY],
        [visibleRect.left + insetX, visibleRect.bottom - insetY],
        [visibleRect.right - insetX, visibleRect.bottom - insetY],
      ];
      return points.some(([x, y]) => {
        const top = document.elementFromPoint(Math.min(innerWidth - 0.5, Math.max(0.5, x)), Math.min(innerHeight - 0.5, Math.max(0.5, y)));
        return !!top && (top === element || element.contains(top) || top.contains(element));
      });
    };
    const actionable = (element) => {
      const style = getComputedStyle(element);
      return !element.matches(':disabled')
        && element.getAttribute('aria-disabled') !== 'true'
        && !element.closest('[inert], [aria-hidden="true"]')
        && style.pointerEvents !== 'none';
    };
    const selectorFor = (element, index) => {
      if (element.dataset.odId) return `[data-od-id="${element.dataset.odId}"]`;
      if (element.id) return `#${element.id}`;
      const keys = ['action', 'screen', 'state', 'hero', 'map', 'talent', 'mask', 'filter', 'fresh', 'difficulty'];
      const data = keys.filter((key) => element.dataset[key] != null)
        .map((key) => `[data-${key}="${element.dataset[key]}"]`).join('');
      if (data) return `${element.tagName.toLowerCase()}${data}`;
      const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${classes}:visible-${index + 1}`;
    };
    const labelClipped = (element) => [element, ...element.querySelectorAll('*')].some((node) => {
      if (!(node instanceof HTMLElement) || !normalize(node.innerText)) return false;
      const style = getComputedStyle(node);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      return (clipsX && node.scrollWidth > node.clientWidth + 1) || (clipsY && node.scrollHeight > node.clientHeight + 1);
    });
    const candidates = [...new Set(document.querySelectorAll(
      'button, select, a[href], input:not([type="hidden"]), textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    ))];
    const measured = candidates.map((element, index) => {
      if (!(element instanceof HTMLElement) || !actionable(element) || !styleVisible(element) || element.closest('.review-toolbar.hidden')) return null;
      const rect = element.getBoundingClientRect();
      const bounds = clippedBounds(element);
      const visibleRect = intersection(rect, bounds);
      if (!hitVisible(element, visibleRect)) return null;
      const width = Number(rect.width.toFixed(2));
      const height = Number(rect.height.toFixed(2));
      return {
        element,
        selector: selectorFor(element, index),
        text: normalize(element.innerText || element.getAttribute('aria-label') || element.getAttribute('title')).slice(0, 80),
        rect: {
          left: Number(rect.left.toFixed(2)), top: Number(rect.top.toFixed(2)),
          right: Number(rect.right.toFixed(2)), bottom: Number(rect.bottom.toFixed(2)), width, height,
        },
        visibleRect: {
          left: Number(visibleRect.left.toFixed(2)), top: Number(visibleRect.top.toFixed(2)),
          right: Number(visibleRect.right.toFixed(2)), bottom: Number(visibleRect.bottom.toFixed(2)),
          width: Number(visibleRect.width.toFixed(2)), height: Number(visibleRect.height.toFixed(2)),
        },
        partiallyClipped: rect.left < bounds.left - 0.5 || rect.top < bounds.top - 0.5
          || rect.right > bounds.right + 0.5 || rect.bottom > bounds.bottom + 0.5,
        meetsTouchTarget: !requireTouchTargets || (width >= 44 && height >= 44),
        textClipped: labelClipped(element),
      };
    }).filter(Boolean);
    const overlaps = [];
    for (let firstIndex = 0; firstIndex < measured.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < measured.length; secondIndex += 1) {
        const first = measured[firstIndex];
        const second = measured[secondIndex];
        if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
        const width = Math.min(first.visibleRect.right, second.visibleRect.right) - Math.max(first.visibleRect.left, second.visibleRect.left);
        const height = Math.min(first.visibleRect.bottom, second.visibleRect.bottom) - Math.max(first.visibleRect.top, second.visibleRect.top);
        if (width > 0.5 && height > 0.5) overlaps.push({ first: first.selector, second: second.selector, width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) });
      }
    }
    const targets = measured.map(({ element, ...target }) => target);
    const bodyText = normalize(document.body.innerText);
    const rootElements = [...document.querySelectorAll(expected.rootSelector)].filter(styleVisible);
    const talentRoot = document.querySelector('[data-od-id="talent-screen"]');
    const talentNodes = talentRoot ? [...talentRoot.querySelectorAll('[data-action="select-talent"], [data-od-talent-node]')] : [];
    const wedjatNodes = talentNodes.filter((node) => {
      const eye = node.querySelector('svg.wedjat-eye, svg[data-wedjat-eye], .wedjat-eye svg, [data-wedjat-eye] svg');
      return !!eye && eye.querySelectorAll('path').length >= 3 && eye.querySelectorAll('circle, ellipse').length >= 1;
    });
    const branchColors = [...new Set(talentNodes.map((node) => {
      const declared = node.getAttribute('data-branch-color') || node.dataset.branchColor;
      return normalize(declared || getComputedStyle(node).getPropertyValue('--branch') || getComputedStyle(node).getPropertyValue('--branch-color'));
    }).filter(Boolean))];
    const stateElement = expected.stateSelector ? document.querySelector(expected.stateSelector) : null;
    const actionElements = [...new Set(expected.actionSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter(styleVisible);
    const actionText = actionElements.map((element) => normalize(element.innerText || element.getAttribute('aria-label') || element.getAttribute('title'))).join(' | ');
    const chineseGlyphs = (bodyText.match(/[\u3400-\u9fff]/g) || []).length;
    const images = [...document.images].filter(styleVisible).map((image) => ({
      src: image.getAttribute('src'), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    }));
    const animations = document.getAnimations({ subtree: true }).map((animation) => {
      const timing = animation.effect?.getComputedTiming?.() || {};
      return { playState: animation.playState, activeDuration: timing.activeDuration, iterations: timing.iterations };
    });
    const longRunningAnimations = animations.filter((animation) => animation.playState === 'running'
      && (animation.iterations === Infinity || animation.activeDuration === Infinity || Number(animation.activeDuration || 0) > 1000)).length;
    const titleRoot = document.querySelector('[data-od-id="title-screen"]');
    const titleBrand = document.querySelector('[data-od-id="title-brand-lockup"]');
    const titleEnter = document.querySelector('[data-od-id="title-enter-hall-command"]');
    const titleSettings = document.querySelector('[data-od-id="title-settings-command"]');
    const titleCredits = document.querySelector('[data-od-id="title-credits-command"]');
    const titleQuit = document.querySelector('[data-od-id="title-quit-command"]');
    const forbiddenTitleCopy = contractProfile === 'steam-title'
      ? ['h5 lab', 'new game', 'continue run', '新游戏', '继续本局'].filter((needle) => bodyText.toLocaleLowerCase().includes(needle))
      : [];
    const externalResources = contractProfile === 'steam-title'
      ? performance.getEntriesByType('resource').map((entry) => entry.name)
        .filter((name) => /^https?:/i.test(name))
      : [];
    const langExpected = locale === 'zh' ? 'zh-CN' : 'en';
    return {
      reviewApi: !!window.DARKBONE_DESIGN_REVIEW,
      ready: window.DARKBONE_DESIGN_REVIEW?.ready === true,
      snapshot: window.DARKBONE_DESIGN_REVIEW?.snapshot?.() || null,
      textLength: bodyText.length,
      chineseGlyphs,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight },
      images,
      dom: {
        rootCount: rootElements.length,
        rootAriaLabel: rootElements[0]?.getAttribute('aria-label') || '',
        rootSummary: rootElements.map((element) => `${element.dataset.odId || element.tagName}:${element.getAttribute('aria-label') || ''}`).join(' | '),
        stateMarkerFound: bodyText.toLocaleLowerCase().includes(expected.stateMarker.toLocaleLowerCase()),
        stateSelectorFound: !expected.stateSelector || (!!stateElement && styleVisible(stateElement)),
        stateSummary: `${expected.stateMarker} / ${expected.stateSelector || 'copy-only'}`,
        primaryActionCount: actionElements.length,
        primaryActionMarkerFound: actionText.includes(expected.actionMarker),
        primaryActionText: actionText,
        langMatches: document.documentElement.lang === langExpected,
        localeCopyMatches: locale === 'en' ? chineseGlyphs === 0 : chineseGlyphs > 0,
        localeSummary: `${document.documentElement.lang}; zhGlyphs=${chineseGlyphs}`,
      },
      targetAudit: {
        required: requireTouchTargets,
        targetCount: targets.length,
        minimum: {
          width: targets.length ? Math.min(...targets.map((target) => target.rect.width)) : null,
          height: targets.length ? Math.min(...targets.map((target) => target.rect.height)) : null,
        },
        partiallyClipped: targets.filter((target) => target.partiallyClipped),
        textClipped: targets.filter((target) => target.textClipped),
        overlaps,
        touchFailures: targets.filter((target) => !target.meetsTouchTarget),
        targets,
      },
      signatures: {
        talent: {
          nodeCount: talentNodes.length,
          wedjatCount: wedjatNodes.length,
          branchColorCount: branchColors.length,
          branchColors,
        },
        title: {
          localFirstFrame: titleRoot?.getAttribute('data-local-first-frame') === 'true',
          productNameMatches: !!titleBrand && normalize(titleBrand.textContent).includes(expected.title),
          hallScene: !!document.querySelector('[data-od-id="title-hall-scene"]') && styleVisible(document.querySelector('[data-od-id="title-hall-scene"]')),
          characterScene: !!document.querySelector('[data-od-id="title-character-scene"]') && styleVisible(document.querySelector('[data-od-id="title-character-scene"]')),
          commandArea: !!document.querySelector('[data-od-id="title-command-area"]') && styleVisible(document.querySelector('[data-od-id="title-command-area"]')),
          forbiddenCopy: forbiddenTitleCopy,
          externalResourceCount: externalResources.length,
          externalResources,
          commands: {
            enterHall: !!titleEnter,
            enterHallTarget: titleEnter?.getAttribute('href') || titleEnter?.getAttribute('data-route-target') || null,
            settings: !!titleSettings,
            credits: !!titleCredits,
            quit: !!titleQuit,
            quitVisible: !!titleQuit && styleVisible(titleQuit),
            forbidden: [...document.querySelectorAll('[data-title-command]')]
              .map((element) => normalize(element.textContent))
              .filter((text) => /new game|continue run|新游戏|继续本局/i.test(text)),
          },
        },
      },
      reducedMotion: {
        requested: reducedMotion,
        mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        classApplied: document.body.classList.contains('reduced-motion'),
        snapshotMatches: window.DARKBONE_DESIGN_REVIEW?.snapshot?.().reducedMotion === true,
        matches: !reducedMotion || (matchMedia('(prefers-reduced-motion: reduce)').matches
          && document.body.classList.contains('reduced-motion')
          && window.DARKBONE_DESIGN_REVIEW?.snapshot?.().reducedMotion === true),
        longRunningAnimations,
      },
    };
  }, {
    expected: contract,
    locale: spec.locale,
    requireTouchTargets: spec.viewport.input.includes('touch'),
    reducedMotion: spec.reducedMotion,
    contractProfile: spec.contractProfile || 'meta-ui',
  });
}

const args = parseArgs(process.argv);
const profile = contractProfileFor(args.contractProfile);
const archiveMode = !!args.archiveArtifact || !!args.sourcePreviewManifest;
if (!['defaults', 'full', 'contract-cartesian'].includes(args.scenarioSet)) throw new Error('--scenario-set must be defaults, full, or contract-cartesian');
if (!!args.archiveArtifact !== !!args.sourcePreviewManifest) throw new Error('--archive-artifact and --source-preview-manifest must be provided together');
if (args.scenarioSet === 'contract-cartesian' && !archiveMode) throw new Error('contract-cartesian capture requires --archive-artifact and --source-preview-manifest');
if (args.scenarioSet === 'full' && !args.contract) throw new Error('--contract=<preservation-contract.json> is required for full preview capture');
if (args.scenarioSet === 'full' && !args.generationEvidence) throw new Error('--generation-evidence=<evidence.json> is required for full preview capture');
if (args.scenarioSet === 'contract-cartesian' && !args.contract) throw new Error('--contract=<preservation-contract.json> is required for contract-cartesian capture');
if (args.scenarioSet === 'contract-cartesian' && !args.generationEvidence) throw new Error('--generation-evidence=<evidence.json> is required for contract-cartesian capture');

let preservationContract = null;
let preservationContractSha256 = null;
if (args.contract) {
  const validated = await readAndValidatePreservationContract(args.contract, {
    expectedSurfaces: profile.preservationSurfaces,
    expectedLocales: ['zh', 'en'],
  });
  preservationContract = validated.contract;
  if (profile.id === 'steam-title' && preservationContract.contractProfile !== 'steam-title') {
    throw new Error('steam-title preview requires preservation contract contractProfile=steam-title');
  }
  preservationContractSha256 = createHash('sha256').update(await fs.readFile(args.contract)).digest('hex');
}
let generationEvidence = null;
if (args.generationEvidence) generationEvidence = await readAndValidateGenerationEvidence(args.generationEvidence);
let sourcePreviewManifest = null;
let sourcePreviewManifestSha256 = null;
if (archiveMode) {
  const sourceBytes = await fs.readFile(args.sourcePreviewManifest);
  sourcePreviewManifestSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  sourcePreviewManifest = JSON.parse(sourceBytes.toString('utf8'));
  args.previewUrl = pathToFileURL(args.archiveArtifact).toString();
  args.projectId ||= sourcePreviewManifest.projectId;
  args.file ||= sourcePreviewManifest.file;
}
if (!args.previewUrl && generationEvidence) args.previewUrl = generationEvidence.evidence.artifact.previewUrl;
if (!args.previewUrl && !args.projectId) throw new Error('--project=<id>, --preview-url=<url>, or --generation-evidence=<evidence.json> is required');
const unknownLocales = args.locales.filter((locale) => !['zh', 'en'].includes(locale));
const unknownScreens = args.screens.filter((screen) => !profile.screens.includes(screen));
const unknownViewports = args.viewports.filter((id) => !profile.viewports.some((viewport) => viewport.id === id));
if (unknownLocales.length) throw new Error(`Unknown locales: ${unknownLocales.join(', ')}`);
if (unknownScreens.length) throw new Error(`Unknown screens: ${unknownScreens.join(', ')}`);
if (unknownViewports.length) throw new Error(`Unknown viewports: ${unknownViewports.join(', ')}`);

let health = {};
let preview = {};
if (!args.previewUrl) {
  args.daemonUrl ||= await discoverDaemonUrl();
  health = await getJson(`${args.daemonUrl}/api/health`);
  preview = await getJson(
    `${args.daemonUrl}/api/projects/${encodeURIComponent(args.projectId)}/preview-url${args.file ? `?file=${encodeURIComponent(args.file)}` : ''}`,
  );
  args.previewUrl = new URL(preview.url, args.daemonUrl).toString();
}

const previewIdentity = archiveMode ? {
  daemonUrl: sourcePreviewManifest.daemonUrl || null,
  projectId: sourcePreviewManifest.projectId,
  revisionId: sourcePreviewManifest.revisionId,
  file: sourcePreviewManifest.file,
} : parseOpenDesignPreviewIdentity(args.previewUrl);
if (args.scenarioSet === 'full' && !previewIdentity) throw new Error('full preview capture requires an immutable Open Design revision URL');
if (previewIdentity) {
  if (!archiveMode && args.daemonUrl && args.daemonUrl !== previewIdentity.daemonUrl) throw new Error('--daemon-url does not match immutable preview URL');
  if (args.projectId && args.projectId !== previewIdentity.projectId) throw new Error('--project does not match immutable preview URL');
  if (args.file && args.file !== previewIdentity.file) throw new Error('--file does not match immutable preview URL');
  args.daemonUrl = previewIdentity.daemonUrl || args.daemonUrl;
  args.projectId = previewIdentity.projectId;
  args.file = previewIdentity.file;
  if (!archiveMode && !health.version) health = await getJson(`${previewIdentity.daemonUrl}/api/health`).catch(() => health);
}
let artifactBytes;
if (archiveMode) {
  artifactBytes = await fs.readFile(args.archiveArtifact);
} else {
  const artifactResponse = await fetch(args.previewUrl);
  if (!artifactResponse.ok) throw new Error(`${artifactResponse.status} ${args.previewUrl}: artifact fetch failed`);
  artifactBytes = Buffer.from(await artifactResponse.arrayBuffer());
}
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
if (generationEvidence) {
  generationEvidence = await readAndValidateGenerationEvidence(args.generationEvidence, {
    projectId: previewIdentity?.projectId,
    revisionId: previewIdentity?.revisionId,
    file: previewIdentity?.file,
    artifactSha256,
  });
}

if (archiveMode) {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  expect(sourcePreviewManifest?.schemaVersion === 'darkbone-open-design-preview/v2', 'source preview manifest schema is invalid');
  expect((sourcePreviewManifest?.contractProfile || 'meta-ui') === profile.id, 'source preview contract profile does not match');
  expect(sourcePreviewManifest?.ok === true, 'source preview manifest must have ok === true');
  expect(sourcePreviewManifest?.scenarioSet === 'full', 'source preview manifest must be a full capture');
  expect(sourcePreviewManifest?.projectId === previewIdentity.projectId, 'source preview project does not match');
  expect(sourcePreviewManifest?.revisionId === previewIdentity.revisionId, 'source preview revision does not match');
  expect(sourcePreviewManifest?.file === previewIdentity.file, 'source preview file does not match');
  expect(sourcePreviewManifest?.artifactSha256 === artifactSha256, 'archived artifact bytes do not match source preview artifact SHA-256');
  expect(sourcePreviewManifest?.preservationContractSha256 === preservationContractSha256, 'source preview preservation contract does not match');
  expect(sourcePreviewManifest?.generationEvidence?.sha256 === generationEvidence?.sha256, 'source preview generation evidence does not match');
  expect(sourcePreviewManifest?.generationEvidence?.runId === generationEvidence?.result.runId, 'source preview generation run does not match');
  expect(sourcePreviewManifest?.generationEvidence?.model === generationEvidence?.result.model, 'source preview generation model does not match');
  expect(sourcePreviewManifest?.generationEvidence?.reasoning === generationEvidence?.result.reasoning, 'source preview generation reasoning does not match');
  try {
    const sourceUrl = new URL(sourcePreviewManifest.previewUrl);
    const prefix = `/api/projects/${encodeURIComponent(previewIdentity.projectId)}/preview/${encodeURIComponent(previewIdentity.revisionId)}/`;
    expect(sourceUrl.pathname.startsWith(prefix), 'source preview URL is not immutable revision-bound evidence');
  } catch {
    failures.push('source preview URL is invalid');
  }
  if (failures.length) throw new Error(`Invalid archival replay source:\n- ${failures.join('\n- ')}`);
}

let scenarios = args.scenarioSet === 'contract-cartesian'
  ? buildContractCartesianScenarios({
    contract: preservationContract,
    locales: args.locales,
    viewportIds: args.viewports,
    screens: args.screens,
    contractProfile: profile.id,
  })
  : buildPreviewScenarios({
    locales: args.locales,
    viewportIds: args.viewports,
    screens: args.screens,
    scenarioSet: args.scenarioSet,
    contractProfile: profile.id,
  });
if (args.scenarioSet === 'contract-cartesian') {
  const immutableTuples = new Set((sourcePreviewManifest?.scenarios || []).map(scenarioTupleKey));
  scenarios = scenarios.filter((scenario) => !immutableTuples.has(scenarioTupleKey(scenario)));
  if (!scenarios.length) throw new Error('The immutable preview already covers every requested contract Cartesian row; archival replay is not required');
}
if (!scenarios.length) throw new Error('No valid preview scenarios selected');
let fullCoverage = null;
if (args.scenarioSet === 'full') {
  fullCoverage = validateFullPreviewCoverage({
    scenarios,
    contract: preservationContract,
    locales: args.locales,
    viewportIds: args.viewports,
    screens: args.screens,
    contractProfile: profile.id,
  });
} else if (args.scenarioSet === 'contract-cartesian') {
  fullCoverage = validateContractCartesianCoverage({
    scenarios,
    sourceScenarios: sourcePreviewManifest?.scenarios || [],
    contract: preservationContract,
    locales: args.locales,
    viewportIds: args.viewports,
    screens: args.screens,
    contractProfile: profile.id,
  });
}

await fs.mkdir(args.outDir, { recursive: true });
const browser = await chromium.launch({ headless: args.headless });
const manifest = {
  schemaVersion: archiveMode ? 'darkbone-open-design-archive-replay/v1' : 'darkbone-open-design-preview/v2',
  captureKind: archiveMode ? 'archival-replay' : 'immutable-preview',
  ok: false,
  generatedAt: new Date().toISOString(),
  daemonUrl: args.daemonUrl || null,
  daemonVersion: health.version || null,
  projectId: args.projectId || null,
  revisionId: previewIdentity?.revisionId || null,
  file: previewIdentity?.file || preview.file || args.file || null,
  artifactSha256,
  preservationContract: args.contract || null,
  preservationContractSha256,
  generationEvidence: generationEvidence ? {
    path: args.generationEvidence,
    sha256: generationEvidence.sha256,
    runId: generationEvidence.result.runId,
    model: generationEvidence.result.model,
    reasoning: generationEvidence.result.reasoning,
    processCommandSha256: generationEvidence.result.processCommandSha256,
  } : null,
  previewUrl: archiveMode ? sourcePreviewManifest.previewUrl : args.previewUrl,
  replayUrl: archiveMode ? args.previewUrl : null,
  artifactSource: archiveMode ? 'local-exact-bytes' : 'open-design-immutable-revision',
  sourcePreviewManifest: archiveMode ? args.sourcePreviewManifest : null,
  sourcePreviewManifestSha256,
  outDir: args.outDir,
  scenarioSet: args.scenarioSet,
  contractProfile: profile.id,
  viewports: profile.viewports.filter((viewport) => args.viewports.includes(viewport.id)),
  locales: args.locales,
  screens: args.screens,
  scenarios: [],
  fullCoverage,
  summary: {},
  errors: [],
};

try {
  for (const spec of scenarios) {
    const context = await browser.newContext({
      viewport: { width: spec.viewport.width, height: spec.viewport.height },
      deviceScaleFactor: 1,
      hasTouch: spec.viewport.input.includes('touch'),
      isMobile: spec.viewport.id === 'phone-landscape',
      reducedMotion: spec.reducedMotion ? 'reduce' : 'no-preference',
    });
    await context.addInitScript(() => {
      const gamepad = {
        id: 'Open Design audit gamepad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        timestamp: 0,
      };
      window.__OD_SET_GAMEPAD_BUTTON__ = (index, pressed) => {
        gamepad.buttons[index] = { pressed, touched: pressed, value: pressed ? 1 : 0 };
        gamepad.timestamp = performance.now();
      };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] });
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const suffix = spec.reducedMotion ? '--reduced-motion' : '';
    const screenshotPath = path.join(args.outDir, 'screenshots', spec.locale, spec.viewport.id, `${spec.screen}--${spec.state}${suffix}.webp`);
    const id = `${spec.group}-${spec.locale}-${spec.viewport.id}-${spec.screen}-${spec.state}${suffix}`;
    try {
      const url = new URL(args.previewUrl);
      url.searchParams.set('od-screen', spec.screen);
      url.searchParams.set('od-lang', spec.locale);
      url.searchParams.set('od-state', spec.state);
      url.searchParams.set('od-review', '0');
      if (spec.capabilities?.desktopQuit) url.searchParams.set('od-desktop-quit', '1');
      else url.searchParams.delete('od-desktop-quit');
      if (spec.reducedMotion) url.searchParams.set('od-motion', 'reduce');
      else url.searchParams.delete('od-motion');
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 20, { timeout: 20000 });
      await page.waitForFunction(() => window.DARKBONE_DESIGN_REVIEW?.ready === true, { timeout: 20000 });
      const setters = await page.evaluate(async ({ screen, locale, state, capabilities }) => {
        if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
        const api = window.DARKBONE_DESIGN_REVIEW;
        return {
          locale: await api.setLocale(locale),
          screen: await api.setScreen(screen),
          capabilities: api.setCapabilities ? await api.setCapabilities(capabilities || {}) : !capabilities?.desktopQuit,
          state: await api.setState(state),
          toolbar: await api.hideToolbar(),
        };
      }, spec);
      if (!Object.values(setters).every(Boolean)) throw new Error(`Review API rejected requested state: ${JSON.stringify(setters)}`);
      await page.waitForFunction(
        ({ screen, locale, state, viewportId, reducedMotion, desktopQuit }) => {
          const snapshot = window.DARKBONE_DESIGN_REVIEW?.snapshot?.();
          return snapshot?.screen === screen && snapshot?.locale === locale && snapshot?.state === state
            && snapshot?.responsiveMode === viewportId && snapshot?.toolbarVisible === false
            && (snapshot?.capabilities?.desktopQuit === true) === desktopQuit
            && (!reducedMotion || snapshot?.reducedMotion === true)
            && document.body.dataset.reviewReady === 'true';
        },
        { screen: spec.screen, locale: spec.locale, state: spec.state, viewportId: spec.viewport.id, reducedMotion: spec.reducedMotion, desktopQuit: spec.capabilities?.desktopQuit === true },
        { timeout: 10000 },
      );
      await page.waitForFunction(() => [...document.images].every((image) => image.complete), { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(180);
      const contract = previewContractFor(spec);
      const evidence = await collectIndependentEvidence(page, contract, spec);
      const capture = await screenshotWebp(page, screenshotPath);
      const probes = {};
      for (const probe of spec.probes) probes[probe] = await runInputProbe(page, probe);
      evidence.probes = probes;
      const assertions = buildPreviewAssertions({ spec, evidence, pageErrors, consoleErrors, screenshotBytes: capture.stat.size });
      const ok = assertions.every((assertion) => assertion.ok);
      manifest.scenarios.push({
        id,
        group: spec.group,
        surface: spec.screen,
        state: spec.state,
        locale: spec.locale,
        viewport: spec.viewport.id,
        reducedMotion: spec.reducedMotion,
        probes: spec.probes,
        screenshot: screenshotPath,
        bytes: capture.stat.size,
        sha256: capture.sha256,
        evidence,
        pageErrors,
        consoleErrors,
        assertions,
        ok,
      });
      if (!ok) manifest.errors.push(`${id}: ${assertions.filter((assertion) => !assertion.ok).map((assertion) => assertion.label).join(', ')}`);
    } catch (error) {
      manifest.scenarios.push({
        id,
        group: spec.group,
        surface: spec.screen,
        state: spec.state,
        locale: spec.locale,
        viewport: spec.viewport.id,
        reducedMotion: spec.reducedMotion,
        probes: spec.probes,
        screenshot: screenshotPath,
        pageErrors,
        consoleErrors,
        assertions: [],
        error: error?.stack || String(error),
        ok: false,
      });
      manifest.errors.push(`${id}: ${error?.message || String(error)}`);
    } finally {
      await context.close();
    }
  }
  manifest.ok = manifest.scenarios.length === scenarios.length && manifest.scenarios.every((scenario) => scenario.ok);
  const touchScenarios = manifest.scenarios.filter((scenario) => scenario.evidence?.targetAudit?.required);
  const auditedScenarios = manifest.scenarios.filter((scenario) => scenario.evidence?.targetAudit);
  const minimumValues = touchScenarios.flatMap((scenario) => [
    scenario.evidence.targetAudit.minimum.width,
    scenario.evidence.targetAudit.minimum.height,
  ]).filter(Number.isFinite);
  manifest.summary = {
    expectedScenarioCount: scenarios.length,
    scenarioCount: manifest.scenarios.length,
    failedScenarios: manifest.scenarios.filter((scenario) => !scenario.ok).length,
    pageErrors: manifest.scenarios.reduce((sum, scenario) => sum + (scenario.pageErrors?.length || 0), 0),
    consoleErrors: manifest.scenarios.reduce((sum, scenario) => sum + (scenario.consoleErrors?.length || 0), 0),
    touchScenarios: touchScenarios.length,
    measuredTargets: auditedScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.targetCount || 0), 0),
    measuredTouchTargets: touchScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.targetCount || 0), 0),
    touchFailures: touchScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.touchFailures?.length || 0), 0),
    partialClips: auditedScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.partiallyClipped?.length || 0), 0),
    textClips: auditedScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.textClipped?.length || 0), 0),
    targetOverlaps: auditedScenarios.reduce((sum, scenario) => sum + (scenario.evidence.targetAudit.overlaps?.length || 0), 0),
    inputProbes: manifest.scenarios.reduce((sum, scenario) => sum + (scenario.probes?.length || 0), 0),
    reducedMotionScenarios: manifest.scenarios.filter((scenario) => scenario.reducedMotion).length,
    minimumTouchTarget: minimumValues.length ? Math.min(...minimumValues) : null,
  };
} finally {
  await browser.close();
  manifest.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(args.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  ok: manifest.ok,
  outDir: args.outDir,
  previewUrl: args.previewUrl,
  screenshots: manifest.scenarios.length,
  summary: manifest.summary,
  errors: manifest.errors.slice(0, 20),
}, null, 2));
if (!manifest.ok) process.exitCode = 1;
