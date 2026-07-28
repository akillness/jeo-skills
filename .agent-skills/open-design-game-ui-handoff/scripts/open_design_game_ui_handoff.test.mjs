import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validatePreservationContract } from './preservation_contract.mjs';

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

async function write(root, relative, body = 'fixture') {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const bytes = relative.endsWith('.webp')
    ? Buffer.concat([WEBP, Buffer.from(relative)])
    : relative.endsWith('.webm')
      ? Buffer.concat([WEBM, Buffer.from(relative)])
      : body;
  await fs.writeFile(target, bytes);
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-handoff-'));
  for (const file of [
    'source/Home.js',
    'screens/home-phone.webp',
    'screens/home-desktop.webp',
    'motion/home.webm',
    'motion/setup.webp',
    'motion/peak.webp',
    'motion/rest.webp',
  ]) await write(root, file);
  const contract = {
    schemaVersion: 1,
    approvalPolicy: 'upgrade-only',
    dimensions: ['identity', 'composition', 'information', 'interaction', 'motion', 'material', 'readability'],
    authorityAxes: ['layout', 'identity', 'motion', 'interaction', 'copy', 'data'],
    defaultAuthority: 'runtime',
    omissionPolicy: 'unspecified-preserve-runtime',
    ownerApprovalRequired: true,
    surfaces: [{
      id: 'home',
      treatment: 'redesign',
      motionCritical: true,
      ownerFiles: [{ path: 'source/Home.js', anchors: ['drawRig', '@keyframes idle'] }],
      baselineStills: [
        { path: 'screens/home-phone.webp', viewport: '852x393', locale: 'zh', state: 'home-overview' },
        { path: 'screens/home-desktop.webp', viewport: '1440x900', locale: 'en', state: 'home-loadout' },
      ],
      motionEvidence: {
        videos: [{ path: 'motion/home.webm', viewport: '1440x900', locale: 'zh', state: 'character-switch' }],
        keyframes: [
          { path: 'motion/setup.webp', timestampMs: 0, beat: 'setup' },
          { path: 'motion/peak.webp', timestampMs: 450, beat: 'peak' },
          { path: 'motion/rest.webp', timestampMs: 1400, beat: 'rest' },
        ],
      },
      signatures: [{
        id: 'live-character-stage',
        dimensions: ['identity', 'motion'],
        mustRetain: ['live rig idle'],
        forbiddenRegressions: ['static portrait replacement'],
        evidence: ['motion/home.webm'],
        sourceAnchors: ['source/Home.js#drawRig'],
      }],
      components: [{
        id: 'character-stage',
        treatment: 'redesign',
        changeScope: ['layout'],
        changeBrief: 'Use desktop width while preserving the live stage.',
        proofRequired: ['same-beat video'],
        authority: { layout: 'open-design', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/Home.js#drawRig', 'source/Home.js#@keyframes idle'],
      }, {
        id: 'level-talent-mask-emblems',
        treatment: 'preserve',
        authority: { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/Home.js#drawRig'],
      }, {
        id: 'deploy-medallion',
        treatment: 'preserve',
        authority: { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' },
        standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
        runtimeMotionImplementation: 'reuse-existing-runtime',
        runtimeOwnerAnchors: ['source/Home.js#battleSigilSVG'],
      }],
      untouchedDetails: ['rig painter and animation lifecycle'],
      comparisonPlan: {
        viewports: ['852x393', '1440x900'],
        locales: ['zh', 'en'],
        states: ['home-overview', 'home-loadout'],
        motionStates: ['character-switch'],
        stillComparisons: ['current-vs-standalone', 'current-vs-integrated'],
        motionComparisons: ['setup', 'peak', 'rest'],
      },
    }],
  };
  return { root, contract };
}

test('accepts a complete layout-only preservation contract', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await validatePreservationContract(contract, { root, expectedSurfaces: ['home'] });
  assert.deepEqual(result, { ok: true, surfaces: 1, motionCritical: 1 });
});

test('accepts a steam-title new surface only with real Home context and frozen runtime data', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.contractProfile = 'steam-title';
  const titleAuthority = { layout: 'open-design', identity: 'open-design', motion: 'open-design', interaction: 'open-design', copy: 'open-design', data: 'runtime' };
  const titleComponent = (id) => ({
    id,
    treatment: 'redesign',
    changeScope: ['layout', 'identity', 'motion', 'interaction', 'copy'],
    changeBrief: `Design the new title ${id} without inventing persistence data.`,
    proofRequired: ['immutable preview matrix'],
    authority: { ...titleAuthority },
    standaloneMotionPolicy: 'authoritative-upgrade-spec',
    runtimeMotionImplementation: 'replace-only-after-upgrade-proof',
    runtimeOwnerAnchors: ['source/Home.js#drawRig'],
  });
  contract.surfaces.unshift({
    id: 'title',
    treatment: 'redesign',
    motionCritical: false,
    baselinePolicy: 'new-surface-no-runtime',
    ownerFiles: [{ path: 'source/Home.js', anchors: ['drawRig'] }],
    baselineStills: [],
    contextStills: [
      { path: 'screens/home-phone.webp', sourceSurface: 'home', purpose: 'Title-to-Home phone continuity' },
      { path: 'screens/home-desktop.webp', sourceSurface: 'home', purpose: 'Title-to-Home desktop continuity' },
    ],
    signatures: [{
      id: 'title-to-home-continuity',
      dimensions: ['identity', 'interaction'],
      mustRetain: ['existing Home route'],
      forbiddenRegressions: ['replacing Home'],
      evidence: ['screens/home-desktop.webp'],
      sourceAnchors: ['source/Home.js#drawRig'],
    }],
    components: ['hall-character-scene', 'brand-lockup', 'command-area', 'save-cloud-status', 'settings-data-safety', 'home-transition', 'desktop-quit'].map(titleComponent),
    untouchedDetails: ['all existing meta routes'],
    comparisonPlan: {
      viewports: ['852x393', '1180x820', '1280x800', '1440x900', '1920x1080'],
      locales: ['zh', 'en'],
      states: ['title-first-run', 'title-returning', 'title-cloud-checking', 'title-offline', 'title-route-loading', 'title-settings', 'title-credits', 'title-reset-confirm', 'title-cloud-conflict', 'title-quit-confirm'],
      motionStates: [],
      stillComparisons: ['standalone-vs-integrated'],
      motionComparisons: [],
    },
  });
  const result = await validatePreservationContract(contract, { root, expectedSurfaces: ['title', 'home'], expectedLocales: ['zh', 'en'] });
  assert.deepEqual(result, { ok: true, surfaces: 2, motionCritical: 1 });

  contract.surfaces[0].contextStills = [];
  await assert.rejects(() => validatePreservationContract(contract, { root }), /contextStills requires at least 2 real Home references/);
});

test('rejects missing video evidence for a motion-critical surface', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].motionEvidence.videos = [];
  await assert.rejects(() => validatePreservationContract(contract, { root }), /motionEvidence\.videos/);
});

test('protected motion surfaces cannot opt out of motion evidence', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].motionCritical = false;
  contract.surfaces[0].motionEvidence = null;
  contract.surfaces[0].comparisonPlan.motionStates = [];
  contract.surfaces[0].comparisonPlan.motionComparisons = [];
  await assert.rejects(() => validatePreservationContract(contract, { root }), /motionCritical must be true for protected surface home/);
});

test('rejects duplicated baseline still paths or content', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].baselineStills[1].path = contract.surfaces[0].baselineStills[0].path;
  await assert.rejects(() => validatePreservationContract(contract, { root }), /reuses path|reuses content hash/);
});

test('baseline stills must cover every comparison viewport, locale, and two states', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].baselineStills[1].viewport = '852x393';
  contract.surfaces[0].baselineStills[1].locale = 'zh';
  contract.surfaces[0].baselineStills[1].state = 'home-overview';
  await assert.rejects(
    () => validatePreservationContract(contract, { root }),
    /missing comparison viewport|missing comparison locale|two distinct comparison states/,
  );
});

test('rejects motion files without a real media signature', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'motion/home.webm'), 'not a webm');
  await assert.rejects(() => validatePreservationContract(contract, { root }), /is not a valid WebM/);
});

test('rejects an incomplete locale or motion-state comparison plan', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].comparisonPlan.locales = [];
  contract.surfaces[0].comparisonPlan.motionStates = [];
  await assert.rejects(
    () => validatePreservationContract(contract, { root, expectedLocales: ['zh', 'en'] }),
    /comparisonPlan\.locales|comparisonPlan\.motionStates/,
  );
});

test('rejects Open Design motion authority outside a layout-only scope', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components[0].authority.motion = 'open-design';
  await assert.rejects(() => validatePreservationContract(contract, { root }), /outside changeScope/);
});

test('rejects implicit scope when non-runtime authority is assigned', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  delete contract.surfaces[0].components[0].changeScope;
  await assert.rejects(() => validatePreservationContract(contract, { root }), /changeScope is required/);
});

test('rejects a frozen runtime axis added to changeScope', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components[0].changeScope = ['layout', 'motion'];
  await assert.rejects(() => validatePreservationContract(contract, { root }), /must exactly match non-runtime authority axes/);
});

test('rejects treating a static standalone proxy as the motion implementation', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components[0].standaloneMotionPolicy = 'authoritative-upgrade-spec';
  await assert.rejects(() => validatePreservationContract(contract, { root }), /standaloneMotionPolicy must be placeholder-only-preserve-runtime/);
});

test('rejects replacing runtime-owned motion instead of reusing it', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components[0].runtimeMotionImplementation = 'replace-only-after-upgrade-proof';
  await assert.rejects(() => validatePreservationContract(contract, { root }), /runtimeMotionImplementation must be reuse-existing-runtime/);
});

test('rejects a component without concrete runtime owner anchors', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components[0].runtimeOwnerAnchors = [];
  await assert.rejects(() => validatePreservationContract(contract, { root }), /runtimeOwnerAnchors must not be empty/);
});

test('rejects a Home handoff that forgets the protected deploy medallion', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].components = contract.surfaces[0].components.filter((component) => component.id !== 'deploy-medallion');
  await assert.rejects(() => validatePreservationContract(contract, { root }), /missing protected runtime component: deploy-medallion/);
});

test('rejects non-runtime authority on a preserved component', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const component = contract.surfaces[0].components[0];
  component.treatment = 'preserve';
  delete component.changeScope;
  await assert.rejects(() => validatePreservationContract(contract, { root }), /treatment=preserve/);
});

test('rejects evidence references outside the handoff', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.surfaces[0].baselineStills[0].path = '../outside.webp';
  await assert.rejects(() => validatePreservationContract(contract, { root }), /escapes the handoff/);
});

test('rejects a policy that treats omission as deletion', async (t) => {
  const { root, contract } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  contract.omissionPolicy = 'designer-decides';
  await assert.rejects(() => validatePreservationContract(contract, { root }), /omissionPolicy/);
});
