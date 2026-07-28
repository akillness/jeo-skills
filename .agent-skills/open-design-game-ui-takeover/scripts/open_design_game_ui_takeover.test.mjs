import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateTakeoverEvidence } from './takeover_evidence.mjs';

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('VP8 ')]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
const DIMENSIONS = ['identity', 'composition', 'information', 'interaction', 'motion', 'material', 'readability'];

async function write(root, relative, body = relative) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const bytes = relative.endsWith('.webp')
    ? Buffer.concat([WEBP, Buffer.from(String(body))])
    : relative.endsWith('.webm')
      ? Buffer.concat([WEBM, Buffer.from(String(body))])
      : body;
  await fs.writeFile(target, bytes);
}

async function sha256(root, relative) {
  return createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex');
}

async function writeOwnerApproval(root, evidence, overrides = {}) {
  const review = await validateTakeoverEvidence(evidence, { root, phase: 'review' });
  const approval = {
    schemaVersion: 1,
    decision: 'approved',
    approvedBy: 'owner',
    approvedAt: '2026-07-12T00:00:00.000Z',
    source: 'codex-session:test',
    artifactBinding: {
      projectId: evidence.artifactBinding.projectId,
      revisionId: evidence.artifactBinding.revisionId,
      artifactSha256: evidence.artifactBinding.artifactSha256,
      previewManifestSha256: evidence.artifactBinding.previewManifestSha256,
      preservationContractSha256: evidence.artifactBinding.preservationContractSha256,
      generationEvidenceSha256: evidence.artifactBinding.generationEvidenceSha256,
      ...(evidence.artifactBinding.archiveReplayManifestSha256 ? {
        archiveReplayManifestSha256: evidence.artifactBinding.archiveReplayManifestSha256,
      } : {}),
    },
    ...(evidence.takeoverScope ? { takeoverScope: structuredClone(evidence.takeoverScope) } : {}),
    reviewEvidenceSha256: review.reviewEvidenceSha256,
    ...overrides,
  };
  await write(root, evidence.ownerApproval.evidence, `${JSON.stringify(approval)}\n`);
  evidence.ownerApproval.evidenceSha256 = await sha256(root, evidence.ownerApproval.evidence);
  return approval;
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-takeover-'));
  const files = [
    'source/Home.js', 'baseline/overview.webp', 'baseline/loadout.webp', 'baseline/home.webm',
    'baseline/setup.webp', 'baseline/peak.webp', 'baseline/rest.webp',
    'design/darkbone.html',
    'compare/current.webp', 'compare/standalone.webp', 'compare/integrated.webp',
    'compare/current-loadout.webp', 'compare/standalone-loadout.webp', 'compare/integrated-loadout.webp',
    'compare/current.webm', 'compare/standalone.webm', 'compare/integrated.webm',
    'compare/current-setup.webp', 'compare/current-peak.webp', 'compare/current-rest.webp',
    'compare/standalone-setup.webp', 'compare/standalone-peak.webp', 'compare/standalone-rest.webp',
    'compare/integrated-setup.webp', 'compare/integrated-peak.webp', 'compare/integrated-rest.webp',
  ];
  for (const file of files) await write(root, file);

  const authority = { layout: 'open-design', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' };
  const runtimeAuthority = { layout: 'runtime', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' };
  const standaloneMotionPolicy = 'placeholder-only-preserve-runtime';
  const runtimeMotionImplementation = 'reuse-existing-runtime';
  const runtimeOwnerAnchors = ['source/Home.js#drawRig'];
  const preservation = {
    schemaVersion: 1,
    approvalPolicy: 'upgrade-only',
    dimensions: DIMENSIONS,
    authorityAxes: ['layout', 'identity', 'motion', 'interaction', 'copy', 'data'],
    defaultAuthority: 'runtime', omissionPolicy: 'unspecified-preserve-runtime', ownerApprovalRequired: true,
    surfaces: [{
      id: 'home', treatment: 'redesign', motionCritical: true,
      ownerFiles: [{ path: 'source/Home.js', anchors: ['drawRig'] }],
      baselineStills: [
        { path: 'baseline/overview.webp', viewport: '1440x900', locale: 'zh', state: 'home-overview' },
        { path: 'baseline/loadout.webp', viewport: '1440x900', locale: 'zh', state: 'home-loadout' },
      ],
      motionEvidence: {
        videos: [{ path: 'baseline/home.webm', viewport: '1440x900', locale: 'zh', state: 'switch' }],
        keyframes: [
          { path: 'baseline/setup.webp', timestampMs: 0, beat: 'setup' },
          { path: 'baseline/peak.webp', timestampMs: 400, beat: 'peak' },
          { path: 'baseline/rest.webp', timestampMs: 1200, beat: 'rest' },
        ],
      },
      signatures: [{ id: 'rig', dimensions: ['identity', 'motion'], mustRetain: ['live rig'], forbiddenRegressions: ['static portrait'], evidence: ['baseline/home.webm'], sourceAnchors: ['source/Home.js#drawRig'] }],
      components: [
        { id: 'character-stage', treatment: 'redesign', changeScope: ['layout'], changeBrief: 'Recompose only.', proofRequired: ['paired video'], authority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
        { id: 'level-talent-mask-emblems', treatment: 'preserve', authority: runtimeAuthority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
        { id: 'deploy-medallion', treatment: 'preserve', authority: runtimeAuthority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
      ],
      untouchedDetails: ['motion lifecycle'],
      comparisonPlan: {
        viewports: ['1440x900'],
        locales: ['zh'],
        states: ['home-overview', 'home-loadout'],
        motionStates: ['switch'],
        stillComparisons: ['current-vs-standalone', 'current-vs-integrated'],
        motionComparisons: ['setup', 'peak', 'rest'],
      },
    }],
  };
  await write(root, 'preservation-contract.json', `${JSON.stringify(preservation)}\n`);

  const artifactSha256 = await sha256(root, 'design/darkbone.html');
  const preservationContractSha256 = await sha256(root, 'preservation-contract.json');
  const processCommand = 'codex exec -m gpt-5.6-sol -c model_reasoning_effort=ultra';
  const generationEvidence = {
    schemaVersion: 'darkbone-open-design-generation/v1',
    capturedWhileRunning: true,
    model: 'gpt-5.6-sol',
    reasoning: 'ultra',
    run: { id: 'run-1', status: 'succeeded', exitCode: 0, projectId: 'project-1', agentId: 'codex', childPid: 4242 },
    process: {
      pid: 4242,
      runStatusAtCapture: 'running',
      capturedAt: '2026-07-12T00:00:00.000Z',
      command: processCommand,
      commandSha256: createHash('sha256').update(processCommand).digest('hex'),
    },
    resultPackage: { schema: 'open-design.run-result-package.v1', artifactFiles: ['darkbone.html'] },
    artifact: {
      file: 'darkbone.html',
      previewUrl: 'http://127.0.0.1:58494/api/projects/project-1/preview/revision-1/darkbone.html',
      revisionId: 'revision-1',
      sha256: artifactSha256,
    },
  };
  await write(root, 'design/generation-evidence.json', `${JSON.stringify(generationEvidence)}\n`);
  const generationEvidenceSha256 = await sha256(root, 'design/generation-evidence.json');
  const scenarios = [
    {
      id: 'matrix-zh-desktop-home-overview',
      surface: 'home', locale: 'zh', viewport: 'desktop-1440', state: 'home-overview',
      screenshot: 'compare/standalone.webp', sha256: await sha256(root, 'compare/standalone.webp'), ok: true,
    },
    {
      id: 'matrix-zh-desktop-home-loadout',
      surface: 'home', locale: 'zh', viewport: 'desktop-1440', state: 'home-loadout',
      screenshot: 'compare/standalone-loadout.webp', sha256: await sha256(root, 'compare/standalone-loadout.webp'), ok: true,
    },
  ];
  const previewManifest = {
    schemaVersion: 'darkbone-open-design-preview/v2',
    ok: true,
    scenarioSet: 'full',
    projectId: 'project-1',
    revisionId: 'revision-1',
    file: 'darkbone.html',
    artifactSha256,
    preservationContractSha256,
    generationEvidence: { sha256: generationEvidenceSha256, runId: 'run-1', model: 'gpt-5.6-sol', reasoning: 'ultra' },
    previewUrl: 'http://127.0.0.1:58494/api/projects/project-1/preview/revision-1/darkbone.html',
    viewports: [{ id: 'desktop-1440', width: 1440, height: 900 }],
    scenarios,
    fullCoverage: { scenarioCount: scenarios.length },
  };
  await write(root, 'design/manifest.json', `${JSON.stringify(previewManifest)}\n`);
  const artifactBinding = {
    projectId: 'project-1',
    revisionId: 'revision-1',
    artifact: 'design/darkbone.html',
    artifactSha256,
    previewManifest: 'design/manifest.json',
    previewManifestSha256: await sha256(root, 'design/manifest.json'),
    preservationContractSha256,
    generationEvidence: 'design/generation-evidence.json',
    generationEvidenceSha256,
  };
  const verdicts = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimension === 'composition' ? 'upgraded' : 'preserved']));
  const evidence = {
    schemaVersion: 1,
    approvalPolicy: 'upgrade-only',
    preservationContract: 'preservation-contract.json',
    artifactBinding,
    authorityMatrixVerified: true,
    authorityMatrix: [
      { surface: 'home', component: 'character-stage', treatment: 'redesign', changeScope: ['layout'], authority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
      { surface: 'home', component: 'level-talent-mask-emblems', treatment: 'preserve', authority: runtimeAuthority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
      { surface: 'home', component: 'deploy-medallion', treatment: 'preserve', authority: runtimeAuthority, standaloneMotionPolicy, runtimeMotionImplementation, runtimeOwnerAnchors },
    ],
    runtimeContinuity: [{
      surface: 'home', component: 'character-stage',
      frozenAxes: ['identity', 'motion', 'interaction', 'copy', 'data'],
      frozenAxesAction: 'moved-intact',
      standaloneMotionPolicy,
      motionImplementation: runtimeMotionImplementation,
      runtimeOwnerAnchors,
    }],
    comparisons: ['character-stage', 'level-talent-mask-emblems', 'deploy-medallion'].flatMap((component) => [
      {
        surface: 'home', component, viewport: '1440x900', locale: 'zh', state: 'home-overview',
        standaloneScenarioId: scenarios[0].id,
        current: 'compare/current.webp', standalone: 'compare/standalone.webp', integrated: 'compare/integrated.webp', verdicts,
      },
      {
        surface: 'home', component, viewport: '1440x900', locale: 'zh', state: 'home-loadout',
        standaloneScenarioId: scenarios[1].id,
        current: 'compare/current-loadout.webp', standalone: 'compare/standalone-loadout.webp', integrated: 'compare/integrated-loadout.webp', verdicts,
      },
    ]),
    motionComparisons: ['character-stage', 'level-talent-mask-emblems', 'deploy-medallion'].map((component) => ({
      surface: 'home', component, viewport: '1440x900', locale: 'zh', state: 'switch',
      currentVideo: 'compare/current.webm', standaloneVideo: 'compare/standalone.webm', integratedVideo: 'compare/integrated.webm', verdict: 'preserved',
      keyframeTriples: [
        { beat: 'setup', current: 'compare/current-setup.webp', standalone: 'compare/standalone-setup.webp', integrated: 'compare/integrated-setup.webp' },
        { beat: 'peak', current: 'compare/current-peak.webp', standalone: 'compare/standalone-peak.webp', integrated: 'compare/integrated-peak.webp' },
        { beat: 'rest', current: 'compare/current-rest.webp', standalone: 'compare/standalone-rest.webp', integrated: 'compare/integrated-rest.webp' },
      ],
    })),
    regressions: [],
    unexplainedOmissions: [],
    ownerApproval: {
      required: true,
      status: 'pending',
      evidence: 'owner-approval.json',
      evidenceSha256: '',
    },
  };
  await writeOwnerApproval(root, evidence);
  return { root, evidence };
}

async function addScopedMapSurface(root, evidence, { motionCritical = false } = {}) {
  await write(root, 'source/Map.js', 'export function renderMap() {}');
  await write(root, 'baseline/map-overview.webp', 'map-overview');
  await write(root, 'baseline/map-detail.webp', 'map-detail');
  if (motionCritical) {
    await write(root, 'baseline/map.webm', 'map-motion');
    await write(root, 'baseline/map-setup.webp', 'map-setup');
    await write(root, 'baseline/map-peak.webp', 'map-peak');
    await write(root, 'baseline/map-rest.webp', 'map-rest');
  }

  const authority = { layout: 'open-design', identity: 'runtime', motion: 'runtime', interaction: 'runtime', copy: 'runtime', data: 'runtime' };
  const component = {
    id: 'journey-stage',
    treatment: 'redesign',
    changeScope: ['layout'],
    changeBrief: 'Recompose the journey stage only.',
    proofRequired: ['paired stills'],
    authority,
    standaloneMotionPolicy: 'placeholder-only-preserve-runtime',
    runtimeMotionImplementation: 'reuse-existing-runtime',
    runtimeOwnerAnchors: ['source/Map.js#renderMap'],
  };
  const contractPath = path.join(root, evidence.preservationContract);
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  contract.surfaces.push({
    id: 'mapselect',
    treatment: 'redesign',
    motionCritical,
    ownerFiles: [{ path: 'source/Map.js', anchors: ['renderMap'] }],
    baselineStills: [
      { path: 'baseline/map-overview.webp', viewport: '1440x900', locale: 'zh', state: 'map-overview' },
      { path: 'baseline/map-detail.webp', viewport: '1440x900', locale: 'zh', state: 'map-detail' },
    ],
    ...(motionCritical ? {
      motionEvidence: {
        videos: [{ path: 'baseline/map.webm', viewport: '1440x900', locale: 'zh', state: 'map-switch' }],
        keyframes: [
          { path: 'baseline/map-setup.webp', timestampMs: 0, beat: 'setup' },
          { path: 'baseline/map-peak.webp', timestampMs: 400, beat: 'peak' },
          { path: 'baseline/map-rest.webp', timestampMs: 1200, beat: 'rest' },
        ],
      },
    } : {}),
    signatures: [{
      id: 'journey',
      dimensions: ['identity', 'composition'],
      mustRetain: ['journey identity'],
      forbiddenRegressions: ['generic list'],
      evidence: ['baseline/map-overview.webp'],
      sourceAnchors: ['source/Map.js#renderMap'],
    }],
    components: [component],
    untouchedDetails: ['runtime route state'],
    comparisonPlan: {
      viewports: ['1440x900'],
      locales: ['zh'],
      states: ['map-overview', 'map-detail'],
      motionStates: motionCritical ? ['map-switch'] : [],
      stillComparisons: ['current-vs-standalone', 'current-vs-integrated'],
      motionComparisons: motionCritical ? ['setup', 'peak', 'rest'] : [],
    },
  });
  await fs.writeFile(contractPath, `${JSON.stringify(contract)}\n`);
  evidence.artifactBinding.preservationContractSha256 = await sha256(root, evidence.preservationContract);

  const manifestPath = path.join(root, evidence.artifactBinding.previewManifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.preservationContractSha256 = evidence.artifactBinding.preservationContractSha256;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);
  evidence.takeoverScope = {
    surfaces: ['home'],
    outOfScope: [{ surface: 'mapselect', policy: 'frozen-runtime-no-change' }],
  };
  return { component };
}

async function addArchiveReplay(root, evidence, { preserveSourceTuple = false } = {}) {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(root, evidence.artifactBinding.previewManifest), 'utf8'));
  const replayScenario = {
    ...sourceManifest.scenarios[1],
    id: 'contract-cartesian-zh-desktop-home-loadout',
  };
  if (!preserveSourceTuple) {
    sourceManifest.scenarios = sourceManifest.scenarios.filter((scenario) => scenario.id !== replayScenario.id
      && !(scenario.surface === replayScenario.surface
        && scenario.locale === replayScenario.locale
        && scenario.viewport === replayScenario.viewport
        && scenario.state === replayScenario.state));
    sourceManifest.fullCoverage.scenarioCount = sourceManifest.scenarios.length;
    await write(root, evidence.artifactBinding.previewManifest, `${JSON.stringify(sourceManifest)}\n`);
    evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);
  }
  const replay = {
    schemaVersion: 'darkbone-open-design-archive-replay/v1',
    captureKind: 'archival-replay',
    artifactSource: 'local-exact-bytes',
    ok: true,
    scenarioSet: 'contract-cartesian',
    projectId: evidence.artifactBinding.projectId,
    revisionId: evidence.artifactBinding.revisionId,
    file: 'darkbone.html',
    artifactSha256: evidence.artifactBinding.artifactSha256,
    preservationContractSha256: evidence.artifactBinding.preservationContractSha256,
    generationEvidence: sourceManifest.generationEvidence,
    previewUrl: sourceManifest.previewUrl,
    sourcePreviewManifestSha256: evidence.artifactBinding.previewManifestSha256,
    viewports: sourceManifest.viewports,
    scenarios: [replayScenario],
    fullCoverage: { scenarioCount: 1 },
  };
  await write(root, 'design/archive-replay.json', `${JSON.stringify(replay)}\n`);
  evidence.artifactBinding.archiveReplayManifest = 'design/archive-replay.json';
  evidence.artifactBinding.archiveReplayManifestSha256 = await sha256(root, 'design/archive-replay.json');
  for (const comparison of evidence.comparisons.filter((row) => row.state === 'home-loadout')) {
    comparison.standaloneScenarioId = replayScenario.id;
  }
  return replay;
}

async function addStaticState(root, evidence, mode) {
  const contractPath = path.join(root, evidence.preservationContract);
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  contract.surfaces[0].comparisonPlan.states.push('home-locked');
  await fs.writeFile(contractPath, `${JSON.stringify(contract)}\n`);
  evidence.artifactBinding.preservationContractSha256 = await sha256(root, evidence.preservationContract);

  const standalone = 'compare/standalone-locked.webp';
  await write(root, standalone, 'standalone-locked');
  const manifestPath = path.join(root, evidence.artifactBinding.previewManifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const scenarioId = 'matrix-zh-desktop-home-locked';
  manifest.scenarios.push({
    ...manifest.scenarios[0],
    id: scenarioId,
    state: 'home-locked',
    screenshot: standalone,
    sha256: await sha256(root, standalone),
  });
  manifest.fullCoverage.scenarioCount = manifest.scenarios.length;
  manifest.preservationContractSha256 = evidence.artifactBinding.preservationContractSha256;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);

  let current = evidence.comparisons[0].current;
  let integrated = evidence.comparisons[0].integrated;
  if (mode === 'same-hash') {
    current = 'compare/current-loadout-copy.webp';
    integrated = 'compare/integrated-loadout-copy.webp';
    await fs.copyFile(path.join(root, evidence.comparisons[0].current), path.join(root, current));
    await fs.copyFile(path.join(root, evidence.comparisons[0].integrated), path.join(root, integrated));
  }
  for (const comparison of evidence.comparisons.filter((row) => row.state === 'home-overview')) {
    evidence.comparisons.push({
      ...comparison,
      state: 'home-locked',
      standaloneScenarioId: scenarioId,
      current,
      standalone,
      integrated,
    });
  }
}

async function addMotionState(root, evidence, mode) {
  const contractPath = path.join(root, evidence.preservationContract);
  const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));
  contract.surfaces[0].comparisonPlan.motionStates.push('return');
  await fs.writeFile(contractPath, `${JSON.stringify(contract)}\n`);
  evidence.artifactBinding.preservationContractSha256 = await sha256(root, evidence.preservationContract);
  const manifestPath = path.join(root, evidence.artifactBinding.previewManifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.preservationContractSha256 = evidence.artifactBinding.preservationContractSha256;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);

  const first = evidence.motionComparisons[0];
  let currentVideo = first.currentVideo;
  let standaloneVideo = first.standaloneVideo;
  let integratedVideo = first.integratedVideo;
  if (mode === 'same-hash') {
    currentVideo = 'compare/current-return-copy.webm';
    standaloneVideo = 'compare/standalone-return-copy.webm';
    integratedVideo = 'compare/integrated-return-copy.webm';
    await fs.copyFile(path.join(root, first.currentVideo), path.join(root, currentVideo));
    await fs.copyFile(path.join(root, first.standaloneVideo), path.join(root, standaloneVideo));
    await fs.copyFile(path.join(root, first.integratedVideo), path.join(root, integratedVideo));
  }
  const keyframeTriples = [];
  for (const triple of first.keyframeTriples) {
    const current = `compare/current-return-${triple.beat}.webp`;
    const standalone = `compare/standalone-return-${triple.beat}.webp`;
    const integrated = `compare/integrated-return-${triple.beat}.webp`;
    await write(root, current, current);
    await write(root, standalone, standalone);
    await write(root, integrated, integrated);
    keyframeTriples.push({ beat: triple.beat, current, standalone, integrated });
  }
  for (const comparison of evidence.motionComparisons.filter((row) => row.state === 'switch')) {
    evidence.motionComparisons.push({
      ...comparison,
      state: 'return',
      currentVideo,
      standaloneVideo,
      integratedVideo,
      keyframeTriples,
    });
  }
}

test('accepts complete revision-bound evidence for owner review while approval is pending', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'review' });
  assert.equal(result.ok, true);
  assert.equal(result.expectedComparisons, 6);
  assert.equal(result.expectedMotionComparisons, 3);
  assert.match(result.reviewEvidenceSha256, /^[a-f0-9]{64}$/);
});

test('accepts exact-byte archival replay scenarios without replacing immutable revision evidence', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addArchiveReplay(root, evidence);
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'review' });
  assert.equal(result.ok, true);
  assert.equal(result.expectedComparisons, 6);
});

test('rejects an archival replay semantic duplicate even when its scenario id differs', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addArchiveReplay(root, evidence, { preserveSourceTuple: true });
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /archival replay manifest scenario duplicates immutable preview tuple/,
  );
});

test('rejects archival replay drift from the bound artifact or source preview manifest', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const replay = await addArchiveReplay(root, evidence);
  replay.artifactSha256 = '0'.repeat(64);
  replay.sourcePreviewManifestSha256 = '1'.repeat(64);
  await write(root, 'design/archive-replay.json', `${JSON.stringify(replay)}\n`);
  evidence.artifactBinding.archiveReplayManifestSha256 = await sha256(root, 'design/archive-replay.json');
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /archival replay artifactSha256 does not match|source preview manifest does not match/,
  );
});

test('binds archival replay manifest into owner approval', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addArchiveReplay(root, evidence);
  await writeOwnerApproval(root, evidence);
  evidence.ownerApproval.status = 'approved';
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'approval' });
  assert.equal(result.ok, true);

  const approvalPath = path.join(root, evidence.ownerApproval.evidence);
  const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
  delete approval.artifactBinding.archiveReplayManifestSha256;
  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  evidence.ownerApproval.evidenceSha256 = await sha256(root, evidence.ownerApproval.evidence);
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'approval' }),
    /archiveReplayManifestSha256 does not match/,
  );
});

test('accepts a strict single-surface scope while preserving the full artifact and contract binding', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addScopedMapSurface(root, evidence);
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'review' });
  assert.deepEqual(result.takeoverScope, {
    surfaces: ['home'],
    outOfScope: [{ surface: 'mapselect', policy: 'frozen-runtime-no-change' }],
  });
  assert.equal(result.expectedComparisons, 6);
  assert.equal(result.expectedMotionComparisons, 3);
});

test('scoped motion requirements ignore an out-of-scope motion-critical surface', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addScopedMapSurface(root, evidence, { motionCritical: true });
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'review' });
  assert.equal(result.expectedMotionComparisons, 3);
});

test('keeps full-contract validation as the default when takeoverScope is absent', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addScopedMapSurface(root, evidence);
  delete evidence.takeoverScope;
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /authorityMatrix is missing mapselect\/journey-stage|missing rendered comparison for mapselect\/journey-stage/,
  );
});

test('rejects a scoped takeover that omits or weakens the frozen complement', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addScopedMapSurface(root, evidence);
  evidence.takeoverScope.outOfScope = [];
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /must exactly cover the frozen complement/,
  );
  evidence.takeoverScope.outOfScope = [{ surface: 'mapselect', policy: 'best-effort' }];
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /policy must be frozen-runtime-no-change/,
  );
});

test('rejects authority or rendered evidence rows outside takeoverScope', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { component } = await addScopedMapSurface(root, evidence);
  evidence.authorityMatrix.push({ surface: 'mapselect', component: component.id, ...component });
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /references component outside takeoverScope/,
  );

  evidence.authorityMatrix.pop();
  evidence.comparisons.push({
    ...evidence.comparisons[0],
    surface: 'mapselect',
    component: component.id,
    state: 'map-overview',
  });
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'review' }),
    /outside the preservation comparison matrix/,
  );
});

test('binds takeoverScope into owner approval', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addScopedMapSurface(root, evidence);
  await writeOwnerApproval(root, evidence);
  evidence.ownerApproval.status = 'approved';
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'approval' });
  assert.equal(result.phase, 'approval');

  const approvalPath = path.join(root, evidence.ownerApproval.evidence);
  const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
  approval.takeoverScope.outOfScope = [];
  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  evidence.ownerApproval.evidenceSha256 = await sha256(root, evidence.ownerApproval.evidence);
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'approval' }),
    /owner approval takeoverScope does not match takeover evidence/,
  );
});

test('blocks merge approval until the owner approves', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root, phase: 'approval' }), /ownerApproval\.status/);
});

test('accepts owner approval bound to the exact artifact, manifest, and contract', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.ownerApproval.status = 'approved';
  const result = await validateTakeoverEvidence(evidence, { root, phase: 'approval' });
  assert.equal(result.phase, 'approval');
});

test('rejects artifact hash or revision drift', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.artifactBinding.revisionId = 'revision-2';
  evidence.artifactBinding.artifactSha256 = '0'.repeat(64);
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /artifactSha256 does not match|revisionId does not match/);
});

test('rejects incomplete comparison matrix coverage', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.comparisons = [];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /missing rendered comparison/);
});

test('requires preserved components in the rendered comparison matrix', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.comparisons = evidence.comparisons.filter((row) => row.component !== 'deploy-medallion');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /missing rendered comparison for home\/deploy-medallion/);
});

test('rejects current, standalone, and integrated self-proof by path or hash', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.comparisons[0].integrated = evidence.comparisons[0].current;
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /must use distinct files|must use distinct file hashes/);
});

test('rejects a standalone screenshot not produced by the bound preview scenario', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await write(root, 'compare/standalone.webp', 'changed');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /standalone screenshot does not match bound preview scenario/);
});

test('rejects reusing a bound standalone scenario for a different state', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, evidence.artifactBinding.previewManifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.scenarios[0].state = 'home-loadout';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /standalone scenario state does not match/);
});

test('rejects incomplete motion beat coverage', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.motionComparisons[0].keyframeTriples.pop();
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /must exactly cover required beats/);
});

test('requires motion proof for preserved components, not only the changed component', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.motionComparisons = evidence.motionComparisons.filter((row) => row.component !== 'deploy-medallion');
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root }),
    /missing motion comparison for home\/deploy-medallion\/1440x900\/zh\/switch/,
  );
});

test('requires standalone video and keyframes in the three-way motion proof', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  delete evidence.motionComparisons[0].standaloneVideo;
  delete evidence.motionComparisons[0].keyframeTriples[0].standalone;
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root }),
    /standaloneVideo must be a non-empty path|keyframeTriples\[0\]\.standalone must be a non-empty path/,
  );
});

test('rejects text files renamed as WebM motion evidence', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, evidence.motionComparisons[0].currentVideo), 'not a video');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /currentVideo is not a valid WebM/);
});

test('rejects generation evidence that is not gpt-5.6-sol ultra', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const generationPath = path.join(root, evidence.artifactBinding.generationEvidence);
  const generation = JSON.parse(await fs.readFile(generationPath, 'utf8'));
  generation.process.command = 'codex exec -m gpt-5.6-sol -c model_reasoning_effort=xhigh';
  generation.process.commandSha256 = createHash('sha256').update(generation.process.command).digest('hex');
  generation.reasoning = 'xhigh';
  await fs.writeFile(generationPath, `${JSON.stringify(generation)}\n`);
  evidence.artifactBinding.generationEvidenceSha256 = await sha256(root, evidence.artifactBinding.generationEvidence);
  const manifestPath = path.join(root, evidence.artifactBinding.previewManifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.generationEvidence.sha256 = evidence.artifactBinding.generationEvidenceSha256;
  manifest.generationEvidence.reasoning = 'xhigh';
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  evidence.artifactBinding.previewManifestSha256 = await sha256(root, evidence.artifactBinding.previewManifest);
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root }),
    /reasoning must be ultra|every process reasoning override/,
  );
});

test('rejects reusing static evidence paths across different states', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addStaticState(root, evidence, 'same-path');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /reuses a path already bound/);
});

test('rejects reusing static evidence content across different states', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addStaticState(root, evidence, 'same-hash');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /reuses a content hash already bound/);
});

test('rejects reusing motion videos across different motion states', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addMotionState(root, evidence, 'same-path');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /currentVideo reuses a path already bound/);
});

test('rejects reusing motion video content across different motion states', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await addMotionState(root, evidence, 'same-hash');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /currentVideo reuses a content hash already bound/);
});

test('rejects reusing keyframe paths across different animation beats', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const triples = evidence.motionComparisons[0].keyframeTriples;
  for (const triple of triples.slice(1)) {
    triple.current = triples[0].current;
    triple.standalone = triples[0].standalone;
    triple.integrated = triples[0].integrated;
  }
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /reuses a path already bound/);
});

test('rejects reusing keyframe content across different animation beats', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const triples = evidence.motionComparisons[0].keyframeTriples;
  for (let index = 1; index < triples.length; index += 1) {
    const current = `compare/current-beat-copy-${index}.webp`;
    const standalone = `compare/standalone-beat-copy-${index}.webp`;
    const integrated = `compare/integrated-beat-copy-${index}.webp`;
    await fs.copyFile(path.join(root, triples[0].current), path.join(root, current));
    await fs.copyFile(path.join(root, triples[0].standalone), path.join(root, standalone));
    await fs.copyFile(path.join(root, triples[0].integrated), path.join(root, integrated));
    triples[index].current = current;
    triples[index].standalone = standalone;
    triples[index].integrated = integrated;
  }
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /reuses a content hash already bound/);
});

test('rejects stale owner approval even when its file hash is refreshed', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const approvalPath = path.join(root, evidence.ownerApproval.evidence);
  const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
  approval.artifactBinding.revisionId = 'stale-revision';
  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  evidence.ownerApproval.evidenceSha256 = await sha256(root, evidence.ownerApproval.evidence);
  evidence.ownerApproval.status = 'approved';
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root, phase: 'approval' }), /artifactBinding\.revisionId does not match/);
});

test('rejects integrated evidence changed after owner approval', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.ownerApproval.status = 'approved';
  await write(root, evidence.comparisons[0].integrated, 'integrated-after-approval');
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'approval' }),
    /reviewEvidenceSha256 does not match current takeover review evidence/,
  );
});

test('rejects verdict changes made after owner approval', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.ownerApproval.status = 'approved';
  evidence.comparisons[0].verdicts.material = 'upgraded';
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'approval' }),
    /reviewEvidenceSha256 does not match current takeover review evidence/,
  );
});

test('rejects an approval receipt not bound to the full review evidence', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const approvalPath = path.join(root, evidence.ownerApproval.evidence);
  const approval = JSON.parse(await fs.readFile(approvalPath, 'utf8'));
  approval.reviewEvidenceSha256 = '0'.repeat(64);
  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  evidence.ownerApproval.evidenceSha256 = await sha256(root, evidence.ownerApproval.evidence);
  evidence.ownerApproval.status = 'approved';
  await assert.rejects(
    () => validateTakeoverEvidence(evidence, { root, phase: 'approval' }),
    /reviewEvidenceSha256 does not match current takeover review evidence/,
  );
});

test('rejects authority drift from the preservation contract', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.authorityMatrix[0].authority.motion = 'open-design';
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /authority drifted/);
});

test('rejects change-scope drift from the preservation contract', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.authorityMatrix[0].changeScope = ['layout', 'motion'];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /changeScope drifted/);
});

test('rejects missing runtime continuity proof for a changed component', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.runtimeContinuity = [];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /missing runtime continuity proof/);
});

test('rejects frozen-axis drift in runtime continuity proof', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.runtimeContinuity[0].frozenAxes = ['motion'];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /frozenAxes must exactly match runtime-owned axes/);
});

test('rejects runtime owner replacement hidden behind a similar render', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.runtimeContinuity[0].runtimeOwnerAnchors = ['standalone.html#fakeRig'];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /runtimeOwnerAnchors drifted/);
});

test('rejects any declared regression', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.regressions.push('home rig became static');
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /regressions must be empty/);
});

test('rejects missing motion comparison for a required viewport, locale, and state', async (t) => {
  const { root, evidence } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  evidence.motionComparisons = [];
  await assert.rejects(() => validateTakeoverEvidence(evidence, { root }), /missing motion comparison/);
});
