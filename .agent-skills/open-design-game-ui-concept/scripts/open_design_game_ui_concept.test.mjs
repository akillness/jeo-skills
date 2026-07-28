import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPreviewAssertions,
  buildPreviewScenarios,
  buildContractCartesianScenarios,
  buildRuntimeAssertions,
  classifyTargetGeometry,
  hasExactIds,
  parseOpenDesignPreviewIdentity,
  resolveInside,
  SCREENS,
  TITLE_STATES,
  TITLE_STATE_CONTRACTS,
  TITLE_VIEWPORTS,
  validateContractCartesianCoverage,
  validateFullPreviewCoverage,
  VIEWPORTS,
} from './contract_helpers.mjs';
import { validateGenerationEvidence } from './open_design_generation_evidence.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGER = path.join(SCRIPT_DIR, 'package_open_design_handoff.mjs');
const WEBP = Buffer.from('524946460400000057454250', 'hex');
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

function goodPreviewEvidence(spec) {
  return {
    reviewApi: true,
    ready: true,
    snapshot: { screen: spec.screen, locale: spec.locale, state: spec.state, responsiveMode: spec.viewport.id },
    textLength: 120,
    viewport: { width: spec.viewport.width, height: spec.viewport.height },
    scrollWidth: spec.viewport.width,
    scrollHeight: spec.viewport.height,
    images: [{ complete: true, naturalWidth: 10, naturalHeight: 10 }],
    dom: {
      rootCount: 1,
      rootAriaLabel: 'Soulbearer Command',
      rootSummary: 'Soulbearer Command',
      stateMarkerFound: true,
      stateSelectorFound: true,
      stateSummary: 'Shadow Marksman',
      primaryActionCount: 1,
      primaryActionMarkerFound: true,
      primaryActionText: 'Deploy',
      langMatches: true,
      localeCopyMatches: true,
      localeSummary: 'en',
    },
    targetAudit: { targetCount: 1, partiallyClipped: [], textClipped: [], overlaps: [], touchFailures: [] },
    probes: {},
  };
}

test('full preview matrix includes states, motion, and input probes', () => {
  const scenarios = buildPreviewScenarios();
  const states = new Set(scenarios.map((item) => item.state));
  const probes = new Set(scenarios.flatMap((item) => item.probes));
  for (const state of ['home-locked', 'mapselect-loading', 'talent-insufficient', 'talent-reset-confirm', 'masks-detail-level-gate', 'fusion-insufficient-seals', 'fusion-confirm', 'fusion-result-choice', 'fusion-complete', 'victory-reward-land', 'victory-growth', 'victory-dashboard']) {
    assert.equal(states.has(state), true, state);
  }
  for (const probe of ['keyboard-focus', 'gamepad-focus', 'hover', 'back-navigation', 'modal-focus-trap']) {
    assert.equal(probes.has(probe), true, probe);
  }
  assert.equal(scenarios.filter((item) => item.reducedMotion).length, 3);
  assert.equal(scenarios.length, 95);
  for (const state of ['talent-invested', 'masks-detail', 'victory-ready-dashboard']) assert.equal(states.has(state), true, state);
});

test('steam-title profile covers every state, locale, viewport, input mode, and reduced motion', () => {
  const scenarios = buildPreviewScenarios({ contractProfile: 'steam-title' });
  const normal = scenarios.filter((item) => !item.reducedMotion);
  assert.equal(normal.length, TITLE_STATES.length * TITLE_VIEWPORTS.length * 2);
  assert.equal(scenarios.filter((item) => item.reducedMotion).length, 2);
  assert.deepEqual(new Set(normal.map((item) => item.state)), new Set(TITLE_STATES));
  const probes = new Set(scenarios.flatMap((item) => item.probes));
  for (const probe of ['title-keyboard-navigation', 'title-controller-navigation', 'back-navigation', 'modal-focus-trap', 'title-safe-default', 'title-quit-capability', 'title-local-first-frame']) {
    assert.equal(probes.has(probe), true, probe);
  }
  assert.equal(normal.find((item) => item.state === 'title-quit-confirm')?.capabilities.desktopQuit, true);
  assert.equal(normal.find((item) => item.state === 'title-returning')?.capabilities.desktopQuit, false);
});

test('steam-title credits sentinel uses the owner-facing personnel-list copy', () => {
  assert.equal(TITLE_STATE_CONTRACTS['title-credits'].marker.zh, '人员名单');
  assert.equal(TITLE_STATE_CONTRACTS['title-credits'].marker.en, 'Credits');
});

test('steam-title full coverage is separate from the six-screen defaults', () => {
  const scenarios = buildPreviewScenarios({ contractProfile: 'steam-title' });
  const contract = {
    contractProfile: 'steam-title',
    surfaces: [
      {
        id: 'title',
        comparisonPlan: {
          locales: ['zh', 'en'],
          viewports: TITLE_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
          states: TITLE_STATES,
        },
      },
      ...SCREENS.map((id) => ({ id, comparisonPlan: {} })),
    ],
  };
  assert.equal(validateFullPreviewCoverage({
    scenarios,
    contract,
    locales: ['zh', 'en'],
    viewportIds: TITLE_VIEWPORTS.map((viewport) => viewport.id),
    screens: ['title'],
    contractProfile: 'steam-title',
  }).scenarioCount, 102);
  assert.throws(() => validateFullPreviewCoverage({
    scenarios: scenarios.filter((item) => item.viewport.id !== 'steam-deck'),
    contract,
    locales: ['zh', 'en'],
    viewportIds: TITLE_VIEWPORTS.filter((viewport) => viewport.id !== 'steam-deck').map((viewport) => viewport.id),
    screens: ['title'],
    contractProfile: 'steam-title',
  }), /full preview viewports must be exactly|missing contract preview state/);
});

test('full preview coverage rejects filters and omitted preservation states', () => {
  const scenarios = buildPreviewScenarios();
  const contract = {
    surfaces: SCREENS.map((screen) => ({
      id: screen,
      comparisonPlan: {
        locales: ['zh', 'en'],
        viewports: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        states: [...new Set(scenarios.filter((spec) => spec.screen === screen).map((spec) => spec.state))],
      },
    })),
  };
  assert.equal(validateFullPreviewCoverage({
    scenarios,
    contract,
    locales: ['zh', 'en'],
    viewportIds: VIEWPORTS.map((viewport) => viewport.id),
    screens: SCREENS,
  }).scenarioCount, 95);
  assert.throws(() => validateFullPreviewCoverage({
    scenarios: buildPreviewScenarios({ locales: ['zh'] }),
    contract,
    locales: ['zh'],
    viewportIds: VIEWPORTS.map((viewport) => viewport.id),
    screens: SCREENS,
  }), /locales must be exactly/);
  assert.throws(() => validateFullPreviewCoverage({
    scenarios: scenarios.filter((spec) => spec.state !== 'talent-invested'),
    contract,
    locales: ['zh', 'en'],
    viewportIds: VIEWPORTS.map((viewport) => viewport.id),
    screens: SCREENS,
  }), /missing contract preview state: talent\/zh\/talent-invested/);
});

test('contract Cartesian replay expands every selected viewport, locale, and state', () => {
  const contract = {
    surfaces: [{
      id: 'home',
      comparisonPlan: {
        locales: ['zh', 'en'],
        viewports: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        states: ['home-overview', 'home-loadout'],
      },
    }],
  };
  const viewportIds = VIEWPORTS.map((viewport) => viewport.id);
  const scenarios = buildContractCartesianScenarios({ contract, screens: ['home'], viewportIds });
  assert.equal(scenarios.length, 16);
  assert.equal(validateContractCartesianCoverage({
    scenarios,
    contract,
    locales: ['zh', 'en'],
    viewportIds,
    screens: ['home'],
  }).requiredRows, 16);
  assert.throws(() => validateContractCartesianCoverage({
    scenarios: scenarios.slice(1),
    contract,
    locales: ['zh', 'en'],
    viewportIds,
    screens: ['home'],
  }), /missing contract Cartesian preview scenario/);
});

test('contract Cartesian replay supplements immutable tuples without replacing them', () => {
  const contract = {
    surfaces: [{
      id: 'home',
      comparisonPlan: {
        locales: ['zh', 'en'],
        viewports: VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`),
        states: ['home-overview', 'home-loadout'],
      },
    }],
  };
  const viewportIds = VIEWPORTS.map((viewport) => viewport.id);
  const all = buildContractCartesianScenarios({ contract, screens: ['home'], viewportIds });
  const sourceScenarios = all.filter((spec) => spec.state === 'home-overview' || spec.viewport.id === 'desktop-1440');
  const replayScenarios = all.filter((spec) => !sourceScenarios.includes(spec));
  const result = validateContractCartesianCoverage({
    scenarios: replayScenarios,
    sourceScenarios,
    contract,
    locales: ['zh', 'en'],
    viewportIds,
    screens: ['home'],
  });
  assert.deepEqual(
    { requiredRows: result.requiredRows, sourceRows: result.sourceRows, replayRows: result.replayRows },
    { requiredRows: 16, sourceRows: 10, replayRows: 6 },
  );
  assert.throws(() => validateContractCartesianCoverage({
    scenarios: [sourceScenarios[0], ...replayScenarios],
    sourceScenarios,
    contract,
    locales: ['zh', 'en'],
    viewportIds,
    screens: ['home'],
  }), /duplicates source preview scenario/);
});

function generationEvidence(command = 'codex exec -m gpt-5.6-sol -c model_reasoning_effort=ultra') {
  return {
    schemaVersion: 'darkbone-open-design-generation/v1',
    capturedWhileRunning: true,
    model: 'gpt-5.6-sol',
    reasoning: 'ultra',
    run: {
      id: 'run-1', status: 'succeeded', exitCode: 0, projectId: 'project-1', agentId: 'codex', childPid: 4242,
    },
    process: {
      pid: 4242,
      runStatusAtCapture: 'running',
      capturedAt: '2026-07-12T00:00:00.000Z',
      command,
      commandSha256: createHash('sha256').update(command).digest('hex'),
    },
    resultPackage: { schema: 'open-design.run-result-package.v1', artifactFiles: ['design.html'] },
    artifact: {
      file: 'design.html',
      previewUrl: 'http://127.0.0.1:58494/api/projects/project-1/preview/revision-1/design.html',
      revisionId: 'revision-1',
      sha256: 'a'.repeat(64),
    },
  };
}

test('generation evidence accepts only a live gpt-5.6-sol ultra process', () => {
  assert.equal(validateGenerationEvidence(generationEvidence()).ok, true);
  assert.throws(
    () => validateGenerationEvidence(generationEvidence('codex exec -m gpt-5.6-sol -c model_reasoning_effort=ultra -c model_reasoning_effort=xhigh')),
    /every process reasoning override/,
  );
  assert.throws(
    () => validateGenerationEvidence(generationEvidence('codex exec -m gpt-5.6-sol --model=gpt-5.5 -c model_reasoning_effort=ultra')),
    /every process model override/,
  );
});

test('immutable preview URL exposes project, revision, and artifact file', () => {
  assert.deepEqual(
    parseOpenDesignPreviewIdentity('http://127.0.0.1:58494/api/projects/project-1/preview/revision-2/design%20file.html'),
    {
      daemonUrl: 'http://127.0.0.1:58494',
      projectId: 'project-1',
      revisionId: 'revision-2',
      file: 'design file.html',
    },
  );
  assert.equal(parseOpenDesignPreviewIdentity('http://127.0.0.1:58494/not-a-preview'), null);
});

test('generic Talent circles fail the identity gate', () => {
  const spec = buildPreviewScenarios({ locales: ['zh'], viewportIds: ['desktop-1440'], screens: ['talent'], scenarioSet: 'defaults' })[0];
  const evidence = goodPreviewEvidence(spec);
  evidence.dom.rootAriaLabel = '影矢永世天赋';
  evidence.dom.stateSummary = '影矢之核';
  evidence.dom.primaryActionText = '投入';
  evidence.dom.localeSummary = 'zh-CN';
  evidence.signatures = { talent: { nodeCount: 9, wedjatCount: 0, branchColorCount: 4, branchColors: ['red', 'blue', 'green', 'purple'] } };
  const assertions = buildPreviewAssertions({ spec, evidence, screenshotBytes: 9000 });
  assert.equal(assertions.find((item) => item.label === 'Talent retains a rich full tree').ok, false);
  assert.equal(assertions.find((item) => item.label === 'Talent nodes retain detailed Wedjat eye construction').ok, false);
  assert.equal(assertions.find((item) => item.label === 'Talent retains all five branch identities').ok, false);
});

test('lying review API cannot pass without independent DOM sentinels', () => {
  const spec = buildPreviewScenarios({ locales: ['en'], viewportIds: ['desktop-1440'], screens: ['home'], scenarioSet: 'defaults' })[0];
  const evidence = goodPreviewEvidence(spec);
  evidence.dom.rootCount = 0;
  evidence.dom.stateMarkerFound = false;
  const assertions = buildPreviewAssertions({ spec, evidence, screenshotBytes: 9000 });
  assert.equal(assertions.find((item) => item.label === 'snapshot matches requested screen, locale, and state').ok, true);
  assert.equal(assertions.find((item) => item.label === 'independent DOM root matches requested screen').ok, false);
  assert.equal(assertions.find((item) => item.label === 'independent DOM state sentinel is visible').ok, false);
});

test('steam-title assertions enforce local frame, #home entry, safe command model, and Quit capability', () => {
  const spec = buildPreviewScenarios({
    contractProfile: 'steam-title', locales: ['en'], viewportIds: ['desktop-1440'], scenarioSet: 'defaults',
  })[0];
  const evidence = goodPreviewEvidence(spec);
  evidence.snapshot.capabilities = { desktopQuit: false };
  evidence.dom.rootAriaLabel = 'Bone Halls';
  evidence.dom.rootSummary = 'title-screen:Bone Halls';
  evidence.dom.stateSummary = 'Progress will be saved on this device';
  evidence.dom.primaryActionText = 'Enter Hall';
  evidence.signatures = {
    title: {
      localFirstFrame: true,
      productNameMatches: true,
      hallScene: true,
      characterScene: true,
      commandArea: true,
      forbiddenCopy: [],
      externalResourceCount: 0,
      externalResources: [],
      commands: {
        enterHall: true,
        enterHallTarget: '#home',
        settings: true,
        credits: true,
        quit: true,
        quitVisible: false,
        forbidden: [],
      },
    },
  };
  const assertions = buildPreviewAssertions({ spec, evidence, screenshotBytes: 9000 });
  assert.equal(assertions.filter((item) => item.label.startsWith('title ') || item.label.startsWith('Enter Hall') || item.label.startsWith('desktop Quit') || item.label.startsWith('player copy') || item.label.startsWith('self-contained')).every((item) => item.ok), true);

  evidence.signatures.title.commands.enterHallTarget = '#game';
  evidence.signatures.title.commands.forbidden.push('Continue Run');
  evidence.signatures.title.forbiddenCopy.push('H5 Lab');
  const rejected = buildPreviewAssertions({ spec, evidence, screenshotBytes: 9000 });
  assert.equal(rejected.find((item) => item.label === 'Enter Hall targets the existing #home route').ok, false);
  assert.equal(rejected.find((item) => item.label === 'title command model is Enter Hall, Settings, Credits, and capability-gated Quit only').ok, false);
  assert.equal(rejected.find((item) => item.label === 'player copy does not expose lab or fake save-slot language').ok, false);
});

test('wrong Chinese copy and zero actionable controls fail independently', () => {
  const spec = buildPreviewScenarios({ locales: ['zh'], viewportIds: ['ipad-landscape'], screens: ['home'], scenarioSet: 'defaults' })[0];
  const evidence = goodPreviewEvidence({ ...spec, locale: 'en' });
  evidence.snapshot.locale = 'zh';
  evidence.dom.rootAriaLabel = '承魂者整备厅';
  evidence.dom.langMatches = false;
  evidence.dom.localeCopyMatches = false;
  evidence.dom.primaryActionMarkerFound = false;
  evidence.targetAudit.targetCount = 0;
  const assertions = buildPreviewAssertions({ spec, evidence, screenshotBytes: 9000 });
  assert.equal(assertions.find((item) => item.label === 'document locale and visible copy match request').ok, false);
  assert.equal(assertions.find((item) => item.label === 'visible actionable controls exist').ok, false);
});

test('partially clipped controls are classified instead of discarded', () => {
  const result = classifyTargetGeometry(
    { left: 10, top: 90, right: 70, bottom: 150, width: 60, height: 60 },
    { left: 0, top: 0, right: 100, bottom: 100 },
    true,
  );
  assert.equal(result.rendered, true);
  assert.equal(result.partiallyClipped, true);
  assert.equal(result.meetsTouchTarget, true);
  assert.equal(result.intersection.height, 10);
});

test('runtime page errors and broken media are blocking', () => {
  const viewport = VIEWPORTS[0];
  const assertions = buildRuntimeAssertions({
    locale: 'zh',
    viewport,
    pageErrors: ['boom'],
    consoleErrors: [],
    screenshotBytes: 9000,
    geometry: {
      root: {}, rootWithinViewport: true, viewport: { width: viewport.width, height: viewport.height },
      document: { scrollWidth: viewport.width, scrollHeight: viewport.height },
      images: [{ complete: true, naturalWidth: 0, naturalHeight: 0 }], visibleButtons: 1,
      langMatches: true, localeCopyMatches: true, localeSummary: 'zh', visibleTextLength: 100,
    },
  });
  assert.equal(assertions.find((item) => item.label === 'runtime emitted no page errors').ok, false);
  assert.equal(assertions.find((item) => item.label === 'runtime referenced images loaded').ok, false);
});

test('runtime character evidence requires every expected unique id', () => {
  const expected = ['archer', 'mage', 'summoner'];
  assert.equal(hasExactIds([{ id: 'archer' }, { id: 'mage' }, { id: 'summoner' }], expected), true);
  assert.equal(hasExactIds([{ id: 'archer' }, { id: 'mage' }], expected), false);
  assert.equal(hasExactIds([{ id: 'archer' }, { id: 'mage' }, { id: 'mage' }], expected), false);
});

test('handoff path resolver rejects absolute and traversal references', () => {
  const root = '/tmp/handoff';
  assert.equal(resolveInside(root, 'screenshots/a.webp').relative, 'screenshots/a.webp');
  assert.throws(() => resolveInside(root, '/tmp/external.webp'), /must be relative/);
  assert.throws(() => resolveInside(root, '../external.webp'), /escapes/);
});

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createHandoff() {
  const parent = mkdtempSync(path.join(tmpdir(), 'open-design-handoff-'));
  const handoff = path.join(parent, 'fixture');
  for (const dir of ['screenshots/zh/phone-landscape', 'screenshots/en/desktop-1440', 'motion/home', 'character-assets', 'assets/maps', 'assets/masks', 'source', 'config']) mkdirSync(path.join(handoff, dir), { recursive: true });
  writeFileSync(path.join(handoff, 'README.md'), '# Fixture\n');
  writeFileSync(path.join(handoff, 'DESIGN.md'), '# Design\n');
  writeFileSync(path.join(handoff, 'brief.md'), 'gpt-5.6-sol ultra DESIGN APPROVAL GATE UPGRADE-ONLY unspecified-preserve-runtime darkbone-steam-meta-ui-concept.html\n');
  writeFileSync(path.join(handoff, 'darkbone-steam-meta-ui-concept.html'), '<!doctype html><title>Fixture</title>\n');
  for (const file of ['screenshots/zh/phone-landscape/home.webp', 'screenshots/en/desktop-1440/home.webp', 'motion/home/setup.webp', 'motion/home/peak.webp', 'motion/home/rest.webp', 'character-assets/archer.webp', 'assets/maps/map.webp', 'assets/masks/mask.webp']) {
    writeFileSync(path.join(handoff, file), Buffer.concat([WEBP, Buffer.from(file)]));
  }
  writeFileSync(path.join(handoff, 'motion/home/home.webm'), WEBM);
  writeFileSync(path.join(handoff, 'source/home.js'), 'export {};\n');
  writeJson(path.join(handoff, 'config/player.json'), { ok: true });
  writeJson(path.join(handoff, 'screenshots/manifest.json'), {
    ok: true,
    scenarios: [{ id: 'home', ok: true, screenshot: 'zh/phone-landscape/home.webp' }],
  });
  writeJson(path.join(handoff, 'motion/manifest.json'), {
    ok: true,
    scenarios: [{
      id: 'home-desktop',
      ok: true,
      video: 'home/home.webm',
      frames: [
        { path: 'home/setup.webp' },
        { path: 'home/peak.webp' },
        { path: 'home/rest.webp' },
      ],
    }],
  });
  writeJson(path.join(handoff, 'preservation-contract.json'), {
    schemaVersion: 1,
    approvalPolicy: 'upgrade-only',
    dimensions: ['identity', 'composition', 'information', 'interaction', 'motion', 'material', 'readability'],
    authorityAxes: ['layout', 'identity', 'motion', 'interaction', 'copy', 'data'],
    defaultAuthority: 'runtime',
    omissionPolicy: 'unspecified-preserve-runtime',
    ownerApprovalRequired: true,
    surfaces: [{
      id: 'home', treatment: 'redesign', motionCritical: true,
      ownerFiles: [{ path: 'source/home.js', anchors: ['renderHome'] }],
      baselineStills: [
        { path: 'screenshots/zh/phone-landscape/home.webp', viewport: '852x393', locale: 'zh', state: 'home-overview' },
        { path: 'screenshots/en/desktop-1440/home.webp', viewport: '1440x900', locale: 'en', state: 'home-loadout' },
      ],
      motionEvidence: {
        videos: [{ path: 'motion/home/home.webm', viewport: '1440x900', locale: 'zh', state: 'character-switch' }],
        keyframes: [
          { path: 'motion/home/setup.webp', timestampMs: 0, beat: 'setup' },
          { path: 'motion/home/peak.webp', timestampMs: 400, beat: 'peak' },
          { path: 'motion/home/rest.webp', timestampMs: 1200, beat: 'rest' },
        ],
      },
      signatures: [{ id: 'home-stage', dimensions: ['identity', 'motion'], mustRetain: ['live rig'], forbiddenRegressions: ['static placeholder'], evidence: ['motion/home/home.webm'], sourceAnchors: ['source/home.js#renderHome'] }],
      components: [{
        id: 'home-stage', treatment: 'redesign', changeScope: ['layout'],
        changeBrief: 'Recompose the live stage.', proofRequired: ['same-beat video'],
        authority: { layout: 'open-design', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/home.js#renderHome'],
      }, {
        id: 'character-stage', treatment: 'preserve',
        authority: { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/home.js#renderHome'],
      }, {
        id: 'level-talent-mask-emblems', treatment: 'preserve',
        authority: { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/home.js#renderHome'],
      }, {
        id: 'deploy-medallion', treatment: 'preserve',
        authority: { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/home.js#renderHome'],
      }],
      untouchedDetails: ['live rig motion'],
      comparisonPlan: { viewports: ['852x393', '1440x900'], locales: ['zh', 'en'], states: ['home-overview', 'home-loadout'], motionStates: ['character-switch'], stillComparisons: ['current-vs-standalone', 'current-vs-integrated'], motionComparisons: ['setup', 'peak', 'rest'] },
    }],
  });
  writeJson(path.join(handoff, 'source-manifest.json'), {
    kind: 'meta_ui',
    generationContract: { agentId: 'codex', model: 'gpt-5.6-sol', reasoning: 'ultra', allowOverride: false },
    artifactContract: { primaryFile: 'darkbone-steam-meta-ui-concept.html', screens: ['home'] },
    evidence: {
      preservationContract: 'preservation-contract.json',
      motionManifest: 'motion/manifest.json',
      screenshotManifest: 'screenshots/manifest.json',
      screenshotCount: 1,
      characterAssets: ['character-assets/archer.webp'],
      mapAssetsDir: 'assets/maps',
      maskAssetsDir: 'assets/masks',
    },
    sourceFiles: [{ path: 'source/home.js', role: 'fixture' }],
    configFiles: ['config/player.json'],
  });
  return { parent, handoff };
}

function packageHandoff(handoff) {
  return spawnSync(process.execPath, [PACKAGER, `--dir=${handoff}`], { encoding: 'utf8' });
}

test('packager emits a zip containing every validated reference', () => {
  const { parent, handoff } = createHandoff();
  const result = packageHandoff(handoff);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const zip = path.join(parent, 'fixture.zip');
  const entries = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
  assert.equal(entries.status, 0, entries.stderr);
  assert.match(entries.stdout, /fixture\/screenshots\/zh\/phone-landscape\/home\.webp/);
  assert.match(entries.stdout, /fixture\/source\/home\.js/);
  assert.equal(JSON.parse(readFileSync(path.join(handoff, 'package-report.json'), 'utf8')).ok, true);
});

test('packager rejects an external screenshot even when it exists', () => {
  const { parent, handoff } = createHandoff();
  const external = path.join(parent, 'external.webp');
  writeFileSync(external, WEBP);
  writeJson(path.join(handoff, 'screenshots/manifest.json'), {
    ok: true,
    scenarios: [{ id: 'home', ok: true, screenshot: external }],
  });
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be relative to the handoff/);
});

test('packager rejects source-manifest traversal references', () => {
  const { handoff } = createHandoff();
  const manifest = JSON.parse(readFileSync(path.join(handoff, 'source-manifest.json'), 'utf8'));
  manifest.sourceFiles[0].path = '../outside.js';
  writeJson(path.join(handoff, 'source-manifest.json'), manifest);
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /escapes the handoff/);
});

test('packager validates an owner review artifact declared by the source manifest', () => {
  const { handoff } = createHandoff();
  const manifest = JSON.parse(readFileSync(path.join(handoff, 'source-manifest.json'), 'utf8'));
  manifest.evidence.ownerReview = 'review/missing.html';
  writeJson(path.join(handoff, 'source-manifest.json'), manifest);
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /evidence\.ownerReview does not reference a file/);
});

test('packager rejects a motion file omitted from the motion manifest', () => {
  const { handoff } = createHandoff();
  const manifest = JSON.parse(readFileSync(path.join(handoff, 'motion/manifest.json'), 'utf8'));
  manifest.scenarios[0].frames = manifest.scenarios[0].frames.slice(0, 2);
  writeJson(path.join(handoff, 'motion/manifest.json'), manifest);
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Motion keyframe is absent/);
});

test('packager rejects a lower or mutable generation contract', () => {
  const { handoff } = createHandoff();
  const manifest = JSON.parse(readFileSync(path.join(handoff, 'source-manifest.json'), 'utf8'));
  manifest.generationContract.reasoning = 'xhigh';
  manifest.generationContract.allowOverride = true;
  writeJson(path.join(handoff, 'source-manifest.json'), manifest);
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /generationContract\.reasoning must be ultra|allowOverride must be false/);
});

test('packager does not let the steam-title profile weaken or reuse six-screen artifact defaults', () => {
  const { handoff } = createHandoff();
  const manifest = JSON.parse(readFileSync(path.join(handoff, 'source-manifest.json'), 'utf8'));
  manifest.artifactContract.contractProfile = 'steam-title';
  writeJson(path.join(handoff, 'source-manifest.json'), manifest);
  writeFileSync(path.join(handoff, 'brief.md'), `${readFileSync(path.join(handoff, 'brief.md'), 'utf8')}bone-halls-steam-title-concept.html\n`);
  const result = packageHandoff(handoff);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /primaryFile must be bone-halls-steam-title-concept\.html/);
});
