#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const withMedia = process.argv.includes('--media');
if (!withMedia) throw new Error('Full shopping-shorts regression requires --media; final and release gates must not be skipped.');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'shopping-shorts-tests-'));
const results = [];

function run(name, command, args, expectSuccess = true, options = {}) {
  const env = { ...process.env };
  if (options.fixtureOptIn === false) delete env.SHOPPING_SHORTS_ALLOW_FIXTURE;
  else env.SHOPPING_SHORTS_ALLOW_FIXTURE = '1';
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 20 * 60 * 1000, env });
  const success = result.status === 0 && !result.error;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (success !== expectSuccess) {
    throw new Error(`${name} expected success=${expectSuccess}, got status=${result.status}\n${output}`);
  }
  if (options.expectedError && !output.includes(options.expectedError)) throw new Error(`${name} did not emit expected error: ${options.expectedError}\n${output}`);
  results.push({ name, verdict: 'PASS', expected_success: expectSuccess, ...(options.expectedError ? { expected_error: options.expectedError } : {}) });
  return result;
}

async function mutateCopy(name, mutate) {
  const root = path.join(temp, name);
  await fs.cp(path.join(skillRoot, 'examples', 'pre-render-fixture'), root, { recursive: true });
  await mutate(root);
  return root;
}

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function refreshCommerceHashes(root, commerceMode) {
  const matrixPath = path.join(root, 'research', 'commerce-platforms.json');
  const routePath = path.join(root, 'strategy', 'commerce-route.json');
  const receiptPath = path.join(root, 'validation', 'commerce.json');
  const route = JSON.parse(await fs.readFile(routePath, 'utf8'));
  route.platform_research_sha256 = digest(await fs.readFile(matrixPath));
  await writeJson(routePath, route);
  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  receipt.commerce_mode = commerceMode;
  receipt.platform_research_sha256 = route.platform_research_sha256;
  receipt.route_sha256 = digest(await fs.readFile(routePath));
  receipt.blocking_unknowns = route.blocking_unknowns;
  await writeJson(receiptPath, receipt);
}

async function markProgramAccountReady(root, programId) {
  const matrixPath = path.join(root, 'research', 'commerce-platforms.json');
  const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
  const program = matrix.programs.find((item) => item.program_id === programId);
  if (!program) throw new Error(`Missing fixture program ${programId}`);
  program.account_status = 'approved';
  for (const criterion of program.eligibility) criterion.status = 'verified';
  await writeJson(matrixPath, matrix);
}

async function setCommerceRoute(root, {
  publicationSurface,
  monetizationProgram,
  programIds = [monetizationProgram],
  productionSupported = false,
  disclosures = [],
  cta = [],
  automation = [],
  complianceEvidence = []
}) {
  const routePath = path.join(root, 'strategy', 'commerce-route.json');
  const route = JSON.parse(await fs.readFile(routePath, 'utf8'));
  Object.assign(route, {
    route_status: 'commerce-ready',
    publication_surface: publicationSurface,
    monetization_program: monetizationProgram,
    product_source: 'owned-product',
    program_ids: programIds,
    production_supported: productionSupported,
    account_checks: [{ check: `${monetizationProgram} current account state`, status: 'verified', evidence: 'Fixture-only verified account UI.' }],
    media_registration: 'verified',
    asset_terms_status: 'verified',
    required_disclosures: disclosures,
    cta_constraints: cta,
    automation_constraints: automation,
    compliance_evidence: complianceEvidence,
    blocking_unknowns: [],
    selection_reason: `Fixture-only ${publicationSurface} route validation.`
  });
  await writeJson(routePath, route);
  const runPath = path.join(root, 'run.json');
  const runJson = JSON.parse(await fs.readFile(runPath, 'utf8'));
  runJson.commerce_mode = 'commerce-ready';
  await writeJson(runPath, runJson);
  await refreshCommerceHashes(root, 'commerce-ready');
}

async function makeCoupangReady(root) {
  const matrixPath = path.join(root, 'research', 'commerce-platforms.json');
  const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
  const coupang = matrix.programs.find((program) => program.program_id === 'coupang-partners');
  coupang.account_status = 'approved';
  for (const criterion of coupang.eligibility) criterion.status = 'verified';
  await writeJson(matrixPath, matrix);

  const routePath = path.join(root, 'strategy', 'commerce-route.json');
  const route = JSON.parse(await fs.readFile(routePath, 'utf8'));
  Object.assign(route, {
    route_status: 'commerce-ready',
    monetization_program: 'coupang-partners',
    product_source: 'owned-product',
    program_ids: ['coupang-partners'],
    production_supported: true,
    account_checks: [{ check: 'Coupang final approval and channel registration', status: 'verified', evidence: 'Fixture-only verified account UI.' }],
    media_registration: 'verified',
    asset_terms_status: 'verified',
    required_disclosures: ['Use the current Coupang official disclosure on screen and near the link.'],
    cta_constraints: ['no-click-inducement'],
    automation_constraints: ['api-data-retention-restricted'],
    compliance_evidence: [],
    blocking_unknowns: [],
    selection_reason: 'Fixture-only fully verified Coupang route.'
  });
  await writeJson(routePath, route);

  const runPath = path.join(root, 'run.json');
  const runJson = JSON.parse(await fs.readFile(runPath, 'utf8'));
  runJson.commerce_mode = 'commerce-ready';
  await writeJson(runPath, runJson);
  await refreshCommerceHashes(root, 'commerce-ready');
}

try {
  const installRoot = path.join(temp, 'installed-harness');
  await fs.mkdir(installRoot, { recursive: true });
  run('harness preview', process.execPath, [path.join(scriptDir, 'init-harness.mjs'), '--target', installRoot]);
  run('harness apply', process.execPath, [path.join(scriptDir, 'init-harness.mjs'), '--target', installRoot, '--apply']);
  run('harness structure', process.execPath, [path.join(scriptDir, 'validate-harness.mjs'), '--root', installRoot]);
  run('fresh intake', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', path.join(installRoot, '_workspace', 'current'), '--stage', 'intake']);

  const base = await mutateCopy('base', async () => {});
  run('pre-render fixture', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', base, '--stage', 'pre-render']);
  const requestOut = path.join(base, 'production', 'provider-requests.json');
  await fs.rm(requestOut, { force: true });
  run('provider packet', process.execPath, [path.join(scriptDir, 'prepare-render-plan.mjs'), '--input', path.join(base, 'production', 'render-plan.json'), '--out', requestOut]);
  const packet = JSON.parse(await fs.readFile(requestOut, 'utf8'));
  if (packet.ready_to_submit !== false || !packet.blockers.includes('manual-gui-handoff-required')) throw new Error('manual GUI handoff guard failed');
  results.push({ name: 'manual GUI handoff guard', verdict: 'PASS', expected_success: true });

  const credentialPlan = await mutateCopy('credential-payload', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].provider_payload = { auth: { access_token: 'fixture-sensitive-value' } };
    await writeJson(file, json);
  });
  run('nested credential field guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(credentialPlan, 'production', 'render-plan.json'),
    '--out', path.join(credentialPlan, 'production', 'credential-provider-requests.json')
  ], false, { expectedError: 'provider_payload.auth.access_token is a credential field' });

  const baseCommerceArgs = [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(base, 'research', 'commerce-platforms.json'),
    '--route', path.join(base, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(base, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product',
    '--commerce-mode', 'creative-only',
    '--require-route'
  ];
  run('commerce research contract', process.execPath, baseCommerceArgs);
  const baseMatrix = JSON.parse(await fs.readFile(path.join(base, 'research', 'commerce-platforms.json'), 'utf8'));
  for (const programId of ['instagram-gifts', 'instagram-subscriptions', 'instagram-creator-marketplace']) {
    const text = baseMatrix.programs.find((program) => program.program_id === programId).eligibility.map((item) => item.criterion).join(' ');
    if (!text.includes('age 19+') || text.includes('age 18+')) throw new Error(`${programId} KR age contract drifted`);
  }
  const bonusText = baseMatrix.programs.find((program) => program.program_id === 'instagram-bonuses').eligibility.map((item) => item.criterion).join(' ');
  if (!bonusText.includes('5 million') || !bonusText.includes('1 million per month')) throw new Error('Instagram Bonuses thresholds are not separated');
  results.push({ name: 'Instagram KR age and bonus split contract', verdict: 'PASS', expected_success: true });
  run('fixture freshness opt-in guard', process.execPath, baseCommerceArgs, false, {
    fixtureOptIn: false,
    expectedError: 'fixture freshness requires an explicit test-only opt-in'
  });

  const missingProgram = await mutateCopy('missing-program', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.programs = json.programs.filter((program) => program.program_id !== 'x-paid-partnerships');
    await writeJson(file, json);
  });
  run('required platform program guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', missingProgram, '--stage', 'research'], false, { expectedError: 'programs missing x-paid-partnerships' });

  const driftedSurfaceKind = await mutateCopy('drifted-surface-kind', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.programs.find((program) => program.program_id === 'coupang-partners').surface_kind = 'platform-revenue';
    await writeJson(file, json);
  });
  run('catalog surface kind guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', driftedSurfaceKind, '--stage', 'research'], false, { expectedError: 'surface_kind differs from KR catalog' });

  const socialPostAsPolicy = await mutateCopy('social-post-as-policy', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    const source = json.sources.find((item) => item.source_id === 'x-api-pricing');
    source.url = 'https://x.com/example/status/123456789';
    source.source_kind = 'official-help';
    await writeJson(file, json);
  });
  run('social post official-source guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', socialPostAsPolicy, '--stage', 'research'], false, { expectedError: 'X posts are not official policy sources' });

  const youtubeWatchAsPolicy = await mutateCopy('youtube-watch-as-policy', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.sources.find((item) => item.source_id === 'yt-official-fixture').url = 'https://www.youtube.com/watch?v=fixture';
    await writeJson(file, json);
  });
  run('YouTube UGC official-source guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', youtubeWatchAsPolicy, '--stage', 'research'], false, { expectedError: 'host www.youtube.com is not an approved official youtube host' });

  const badTikTokAdsPath = await mutateCopy('bad-tiktok-ads-path', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.sources.find((item) => item.source_id === 'tiktok-kr-industry-entry-policy').url = 'https://ads.tiktok.com/business/unsafe-policy-path';
    await writeJson(file, json);
  });
  run('TikTok Ads official-source path guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badTikTokAdsPath, '--stage', 'research'], false, { expectedError: 'TikTok Ads source must be under /help/article/' });

  const staleResearch = await mutateCopy('stale-research', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.freshness_mode = 'live';
    json.researched_at_kst = '2020-01-01T00:00:00+09:00';
    for (const source of json.sources) source.retrieved_at_kst = '2020-01-01T00:00:00+09:00';
    for (const program of json.programs) {
      for (const block of [program.commission_or_revenue, program.payout]) {
        if (block.status === 'verified' || block.status === 'dynamic') block.observed_at_kst = '2020-01-01T00:00:00+09:00';
      }
    }
    await writeJson(file, json);
  });
  run('stale platform research guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', staleResearch, '--stage', 'research'], false, { expectedError: 'commerce-platforms.json: research is older than 7 days' });

  const xTransitionBoundary = await mutateCopy('x-transition-boundary', async (root) => {
    const file = path.join(root, 'research', 'commerce-platforms.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.freshness_mode = 'live';
    await writeJson(file, json);
  });
  run('X transition boundary refresh guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(xTransitionBoundary, 'research', 'commerce-platforms.json'),
    '--now', '2026-09-08T00:05:00+09:00'
  ], false, { expectedError: '2026-09-07 transition boundary passed' });

  const badReceiptHash = await mutateCopy('bad-commerce-hash', async (root) => {
    const file = path.join(root, 'strategy', 'commerce-route.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.selection_reason = 'Changed after G0 receipt.';
    await writeJson(file, json);
  });
  run('commerce hash receipt guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badReceiptHash, '--stage', 'pre-render'], false, { expectedError: 'validation/commerce.json: route hash mismatch' });

  const unknownReady = await mutateCopy('unknown-commerce-ready', async (root) => {
    const file = path.join(root, 'strategy', 'commerce-route.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    Object.assign(json, {
      route_status: 'commerce-ready',
      monetization_program: 'coupang-partners',
      product_source: 'owned-product',
      program_ids: ['coupang-partners'],
      account_checks: [{ check: 'Final approval', status: 'verified', evidence: 'Fixture assertion only.' }],
      media_registration: 'verified',
      asset_terms_status: 'verified',
      required_disclosures: ['Current official disclosure required.'],
      cta_constraints: ['no-click-inducement'],
      automation_constraints: ['api-data-retention-restricted'],
      blocking_unknowns: []
    });
    await writeJson(file, json);
  });
  run('unknown account cannot become commerce-ready', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(unknownReady, 'research', 'commerce-platforms.json'),
    '--route', path.join(unknownReady, 'strategy', 'commerce-route.json')
  ], false, { expectedError: 'selected program coupang-partners has account_status unknown' });

  const readyCoupang = await mutateCopy('ready-coupang-control', async (root) => {
    await makeCoupangReady(root);
  });
  run('commerce-ready positive control', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(readyCoupang, 'research', 'commerce-platforms.json'),
    '--route', path.join(readyCoupang, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(readyCoupang, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready', '--require-route'
  ]);

  const missingCoupangConstraint = await mutateCopy('missing-coupang-constraint', async (root) => {
    await makeCoupangReady(root);
    const file = path.join(root, 'strategy', 'commerce-route.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.cta_constraints = [];
    await writeJson(file, json);
    await refreshCommerceHashes(root, 'commerce-ready');
  });
  run('Coupang route constraints guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', missingCoupangConstraint, '--stage', 'pre-render'], false, { expectedError: 'Coupang route requires no-click-inducement constraint' });

  const badCoupangCta = await mutateCopy('bad-coupang-cta', async (root) => {
    await makeCoupangReady(root);
    const file = path.join(root, 'strategy', 'selected-concept.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.cta = '링크를 클릭해 주세요.';
    await writeJson(file, json);
  });
  run('Coupang click inducement guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badCoupangCta, '--stage', 'pre-render'], false, { expectedError: 'Coupang click inducement is prohibited' });

  const badCoupangMetric = await mutateCopy('bad-coupang-metric-particle', async (root) => {
    await makeCoupangReady(root);
    const file = path.join(root, 'strategy', 'selected-concept.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.narration = '클릭률은 설명란에 공개합니다.';
    await writeJson(file, json);
  });
  run('Coupang Korean metric particle guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badCoupangMetric, '--stage', 'pre-render'], false, { expectedError: 'Coupang restricted performance metrics must not be disclosed' });

  const unsupportedNaver = await mutateCopy('unsupported-naver-release', async (root) => {
    const file = path.join(root, 'strategy', 'commerce-route.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.publication_surface = 'naver-clip';
    json.production_supported = false;
    json.program_ids = ['naver-shopping-connect'];
    json.selection_reason = 'Research candidate only; no release adapter.';
    await writeJson(file, json);
    await refreshCommerceHashes(root, 'creative-only');
  });
  run('unsupported Naver Clip release guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', unsupportedNaver, '--stage', 'pre-render'], false, { expectedError: 'selected route has no production adapter' });

  const retiredXRevenue = await mutateCopy('retired-x-revenue', async (root) => {
    await markProgramAccountReady(root, 'x-creator-revenue-sharing');
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'x-creator-revenue-sharing'
    });
  });
  run('retiring X revenue route guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(retiredXRevenue, 'research', 'commerce-platforms.json'),
    '--route', path.join(retiredXRevenue, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(retiredXRevenue, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'selected program x-creator-revenue-sharing has non-selectable state retiring' });

  const automatedXRewards = await mutateCopy('automated-x-rewards', async (root) => {
    await markProgramAccountReady(root, 'x-original-content-rewards');
    const matrixPath = path.join(root, 'research', 'commerce-platforms.json');
    const matrix = JSON.parse(await fs.readFile(matrixPath, 'utf8'));
    matrix.programs.find((program) => program.program_id === 'x-original-content-rewards').program_state = 'active';
    await writeJson(matrixPath, matrix);
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'x-original-content-rewards'
    });
  });
  run('X automated rewards route guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(automatedXRewards, 'research', 'commerce-platforms.json'),
    '--route', path.join(automatedXRewards, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(automatedXRewards, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'selected program x-original-content-rewards is research-only in this harness' });

  const instagramBonus = await mutateCopy('instagram-bonus-commercial', async (root) => {
    await markProgramAccountReady(root, 'instagram-bonuses');
    await setCommerceRoute(root, {
      publicationSurface: 'instagram-reels',
      monetizationProgram: 'instagram-bonuses'
    });
  });
  run('Instagram bonus commercial route guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(instagramBonus, 'research', 'commerce-platforms.json'),
    '--route', path.join(instagramBonus, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(instagramBonus, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'selected program instagram-bonuses is research-only in this harness' });

  const missingXDisclosure = await mutateCopy('missing-x-disclosure', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'coupang-partners',
      programIds: ['coupang-partners', 'x-paid-partnerships'],
      disclosures: ['Current Coupang disclosure only.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted']
    });
  });
  run('X paid partnership label guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingXDisclosure, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingXDisclosure, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingXDisclosure, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'X commercial route requires x-paid-partnership-label' });

  const missingXVideoAdScreen = await mutateCopy('missing-x-video-ad-screen', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'coupang-partners',
      programIds: ['coupang-partners', 'x-paid-partnerships'],
      disclosures: ['x-paid-partnership-label'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted']
    });
  });
  run('X third-party video ad screen guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingXVideoAdScreen, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingXVideoAdScreen, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingXVideoAdScreen, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'X commercial route requires x-third-party-video-ad-screen' });

  const missingXVideoAdEvidence = await mutateCopy('missing-x-video-ad-evidence', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await markProgramAccountReady(root, 'x-paid-partnerships');
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'coupang-partners',
      programIds: ['coupang-partners', 'x-paid-partnerships'],
      disclosures: ['x-paid-partnership-label'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted', 'x-third-party-video-ad-screen']
    });
  });
  run('X third-party video ad evidence guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingXVideoAdEvidence, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingXVideoAdEvidence, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingXVideoAdEvidence, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'requires bound third-party video ad evidence' });

  const xVideoAdEvidencePass = await mutateCopy('x-video-ad-evidence-pass', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await markProgramAccountReady(root, 'x-paid-partnerships');
    const relativeScreen = 'research/screens/x-third-party-video-ad.png';
    await fs.mkdir(path.join(root, 'research', 'screens'), { recursive: true });
    await fs.copyFile(path.join(root, 'intake', 'assets', 'fixture-product.png'), path.join(root, relativeScreen));
    await setCommerceRoute(root, {
      publicationSurface: 'x-video-post',
      monetizationProgram: 'coupang-partners',
      programIds: ['coupang-partners', 'x-paid-partnerships'],
      disclosures: ['x-paid-partnership-label'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted', 'x-third-party-video-ad-screen'],
      complianceEvidence: [{
        control_id: 'x-third-party-video-ad-screen',
        subject: 'Fixture has no third-party sponsorship graphic or pre-roll.',
        decision: 'not-present',
        source_id: 'x-paid-partnerships-policy',
        observed_at_kst: '2026-09-01T12:00:00+09:00',
        evidence_type: 'screen-capture',
        evidence_path: relativeScreen,
        evidence_sha256: digest(await fs.readFile(path.join(root, relativeScreen))),
        reviewer_id: 'fixture-independent-reviewer'
      }]
    });
  });
  run('X third-party video ad evidence positive control', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(xVideoAdEvidencePass, 'research', 'commerce-platforms.json'),
    '--route', path.join(xVideoAdEvidencePass, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(xVideoAdEvidencePass, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ]);

  const tiktokRewards = await mutateCopy('tiktok-rewards-shopping', async (root) => {
    await markProgramAccountReady(root, 'tiktok-creator-rewards');
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'tiktok-creator-rewards'
    });
  });
  run('TikTok Creator Rewards shopping route guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(tiktokRewards, 'research', 'commerce-platforms.json'),
    '--route', path.join(tiktokRewards, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(tiktokRewards, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'selected program tiktok-creator-rewards is research-only in this harness' });

  const missingTikTokToggle = await mutateCopy('missing-tiktok-toggle', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'coupang-partners',
      disclosures: ['Current Coupang disclosure and TikTok paid partnership label.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted']
    });
  });
  run('TikTok commercial content toggle guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingTikTokToggle, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingTikTokToggle, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingTikTokToggle, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'TikTok commercial route requires tiktok-commercial-content-toggle' });

  const missingTikTokCategoryScreen = await mutateCopy('missing-tiktok-category-screen', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'coupang-partners',
      disclosures: ['Current Coupang disclosure and TikTok paid partnership label.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted', 'tiktok-commercial-content-toggle']
    });
  });
  run('TikTok KR category screen guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingTikTokCategoryScreen, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingTikTokCategoryScreen, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingTikTokCategoryScreen, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'TikTok commercial route requires tiktok-kr-category-screen' });

  const missingTikTokCategoryEvidence = await mutateCopy('missing-tiktok-category-evidence', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'coupang-partners',
      disclosures: ['TikTok commercial content disclosure required.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted', 'tiktok-commercial-content-toggle', 'tiktok-kr-category-screen']
    });
  });
  run('TikTok KR category evidence guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingTikTokCategoryEvidence, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingTikTokCategoryEvidence, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingTikTokCategoryEvidence, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'requires bound allowed-category screen evidence' });

  const tiktokCategoryEvidencePass = await mutateCopy('tiktok-category-evidence-pass', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    const relativeScreen = 'research/screens/tiktok-kr-category.png';
    await fs.mkdir(path.join(root, 'research', 'screens'), { recursive: true });
    await fs.copyFile(path.join(root, 'intake', 'assets', 'fixture-product.png'), path.join(root, relativeScreen));
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'coupang-partners',
      disclosures: ['TikTok commercial content disclosure required.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted', 'tiktok-commercial-content-toggle', 'tiktok-kr-category-screen'],
      complianceEvidence: [{
        control_id: 'tiktok-kr-category-screen',
        subject: 'Fixture-only home-lighting product category.',
        decision: 'allowed',
        source_id: 'tiktok-kr-industry-entry-policy',
        observed_at_kst: '2026-09-01T12:00:00+09:00',
        evidence_type: 'screen-capture',
        evidence_path: relativeScreen,
        evidence_sha256: digest(await fs.readFile(path.join(root, relativeScreen))),
        reviewer_id: 'fixture-independent-reviewer'
      }]
    });
  });
  run('TikTok KR category evidence positive control', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(tiktokCategoryEvidencePass, 'research', 'commerce-platforms.json'),
    '--route', path.join(tiktokCategoryEvidencePass, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(tiktokCategoryEvidencePass, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ]);

  const unknownTikTokShop = await mutateCopy('unknown-tiktok-shop', async (root) => {
    await markProgramAccountReady(root, 'tiktok-shop-affiliate');
    await setCommerceRoute(root, {
      publicationSurface: 'tiktok-video',
      monetizationProgram: 'tiktok-shop-affiliate',
      disclosures: ['TikTok commercial content disclosure required.'],
      automation: ['tiktok-commercial-content-toggle']
    });
  });
  run('TikTok Shop KR availability guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(unknownTikTokShop, 'research', 'commerce-platforms.json'),
    '--route', path.join(unknownTikTokShop, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(unknownTikTokShop, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'selected program tiktok-shop-affiliate has non-selectable state unknown' });

  const instagramAutoTags = await mutateCopy('instagram-auto-tags', async (root) => {
    await markProgramAccountReady(root, 'instagram-shopping-tags');
    await setCommerceRoute(root, {
      publicationSurface: 'instagram-reels',
      monetizationProgram: 'instagram-shopping-tags',
      productionSupported: true,
      disclosures: ['Visible commercial disclosure required.']
    });
  });
  run('Instagram shopping tag adapter guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(instagramAutoTags, 'research', 'commerce-platforms.json'),
    '--route', path.join(instagramAutoTags, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(instagramAutoTags, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'instagram-reels has no public release adapter' });

  const missingInstagramLabel = await mutateCopy('missing-instagram-label', async (root) => {
    await markProgramAccountReady(root, 'coupang-partners');
    await setCommerceRoute(root, {
      publicationSurface: 'instagram-reels',
      monetizationProgram: 'coupang-partners',
      disclosures: ['Current Coupang disclosure only.'],
      cta: ['no-click-inducement'],
      automation: ['api-data-retention-restricted']
    });
  });
  run('Instagram paid partnership label guard', process.execPath, [
    path.join(scriptDir, 'validate-commerce-research.mjs'),
    '--platforms', path.join(missingInstagramLabel, 'research', 'commerce-platforms.json'),
    '--route', path.join(missingInstagramLabel, 'strategy', 'commerce-route.json'),
    '--receipt', path.join(missingInstagramLabel, 'validation', 'commerce.json'),
    '--run-id', '20260901-0900-fixture-product', '--commerce-mode', 'commerce-ready'
  ], false, { expectedError: 'Instagram commercial route requires instagram-paid-partnership-label' });

  const badOutputs = await mutateCopy('bad-outputs', async (root) => {
    const file = path.join(root, 'run.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.max_outputs = 2;
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  });
  run('one-output guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badOutputs, '--stage', 'intake'], false, { expectedError: 'run.json: max_outputs must be 1' });

  const badRights = await mutateCopy('bad-rights', async (root) => {
    const file = path.join(root, 'research', 'rights.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.assets[0].rights_basis = 'unknown';
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  });
  run('rights fail-closed', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badRights, '--stage', 'research'], false, { expectedError: 'rights.json assets[0]: unsupported rights_basis' });

  const intermediateSymlink = await mutateCopy('intermediate-symlink', async (root) => {
    const outside = path.join(temp, 'outside-assets');
    await fs.mkdir(outside, { recursive: true });
    const source = path.join(root, 'intake', 'assets', 'fixture-product.png');
    await fs.copyFile(source, path.join(outside, 'fixture-product.png'));
    await fs.rm(path.join(root, 'intake', 'assets'), { recursive: true, force: true });
    await fs.symlink(outside, path.join(root, 'intake', 'assets'));
  });
  run('intermediate symlink containment guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', intermediateSymlink, '--stage', 'research'], false, { expectedError: 'outside run root' });

  const badExperience = await mutateCopy('bad-experience', async (root) => {
    const file = path.join(root, 'strategy', 'selected-concept.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.narration = '직접 써보니 정말 좋았습니다.';
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  });
  run('fabricated-experience guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badExperience, '--stage', 'pre-render'], false, { expectedError: 'selected-concept.json: possible unsupported first-person experience claim' });

  const badSha = await mutateCopy('bad-sha', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.source_sha = '0000000000000000000000000000000000000000';
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  });
  run('pinned-source guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badSha, '--stage', 'pre-render'], false, { expectedError: 'render-plan.json: source_sha mismatch' });

  const badGeneratedTextPolicy = await mutateCopy('bad-generated-text-policy', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.generated_text_policy = 'allow-model-text';
    await writeJson(file, json);
  });
  run('generated typography policy guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badGeneratedTextPolicy, '--stage', 'pre-render'], false, { expectedError: 'generated_text_policy must forbid generated typography' });

  const generatedTypographyPrompt = await mutateCopy('generated-typography-prompt', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].prompt = 'Show readable text "BUY NOW" above the unchanged product.';
    await writeJson(file, json);
  });
  run('generated typography prompt guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(generatedTypographyPrompt, 'production', 'render-plan.json'),
    '--out', path.join(generatedTypographyPrompt, 'production', 'forbidden-provider-requests.json')
  ], false, { expectedError: 'prompt requests generated typography' });

  const generatedTypographyPayload = await mutateCopy('generated-typography-payload', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].provider_payload = { options: { overlayText: 'BUY NOW' } };
    await writeJson(file, json);
  });
  run('generated typography payload guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(generatedTypographyPayload, 'production', 'render-plan.json'),
    '--out', path.join(generatedTypographyPayload, 'production', 'forbidden-payload-requests.json')
  ], false, { expectedError: 'provider_payload requests generated typography' });

  const generatedTypographyTextPayload = await mutateCopy('generated-typography-text-payload', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].provider_payload = { text: 'BUY NOW' };
    await writeJson(file, json);
  });
  run('generated typography text field guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(generatedTypographyTextPayload, 'production', 'render-plan.json'),
    '--out', path.join(generatedTypographyTextPayload, 'production', 'forbidden-text-payload-requests.json')
  ], false, { expectedError: 'provider_payload requests generated typography' });

  const generatedTypographyArrayPayload = await mutateCopy('generated-typography-array-payload', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].provider_payload = { text: ['BUY NOW'] };
    await writeJson(file, json);
  });
  run('generated typography array field guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(generatedTypographyArrayPayload, 'production', 'render-plan.json'),
    '--out', path.join(generatedTypographyArrayPayload, 'production', 'forbidden-array-payload-requests.json')
  ], false, { expectedError: 'provider_payload requests generated typography' });

  const generatedTypographyObjectPayload = await mutateCopy('generated-typography-object-payload', async (root) => {
    const file = path.join(root, 'production', 'render-plan.json');
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    json.shots[0].provider_payload = { overlayText: { value: 'BUY NOW' } };
    await writeJson(file, json);
  });
  run('generated typography object field guard', process.execPath, [
    path.join(scriptDir, 'prepare-render-plan.mjs'),
    '--input', path.join(generatedTypographyObjectPayload, 'production', 'render-plan.json'),
    '--out', path.join(generatedTypographyObjectPayload, 'production', 'forbidden-object-payload-requests.json')
  ], false, { expectedError: 'provider_payload requests generated typography' });

  const missingStoryboard = await mutateCopy('missing-storyboard', async (root) => {
    await fs.rm(path.join(root, 'production', 'storyboard.md'));
  });
  run('storyboard contract guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', missingStoryboard, '--stage', 'pre-render'], false, { expectedError: 'production/storyboard.md: missing' });

  const decoyStoryboard = await mutateCopy('decoy-storyboard', async (root) => {
    const file = path.join(root, 'production', 'storyboard.md');
    const markdown = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, markdown.replace('| s01 | 0-5s |', '| s01 | 0-4s |'));
  });
  run('storyboard row binding guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', decoyStoryboard, '--stage', 'pre-render'], false, { expectedError: 'end time differs from render plan' });

  const captionOverflowRoot = path.join(temp, 'caption-overflow', '_workspace', 'current');
  await fs.mkdir(path.join(captionOverflowRoot, 'assembly'), { recursive: true });
  const captionOverflow = JSON.parse(await fs.readFile(path.join(skillRoot, 'examples', 'pre-render-fixture', 'assembly', 'captions.json'), 'utf8'));
  captionOverflow.style.max_chars_per_line = 8;
  captionOverflow.cues = [{ cue_id: 't01', start_seconds: 0, end_seconds: 8, text: '이 문장은 두 줄을 확실하게 넘어서므로 여러 큐로 나눠야 합니다' }];
  await writeJson(path.join(captionOverflowRoot, 'assembly', 'captions.json'), captionOverflow);
  run('two-line caption guard', process.execPath, [
    path.join(scriptDir, 'build-typewriter-captions.mjs'),
    '--input', path.join(captionOverflowRoot, 'assembly', 'captions.json'),
    '--output', path.join(captionOverflowRoot, 'assembly', 'captions.ass')
  ], false, { expectedError: 'text exceeds two lines' });

  const captionSymlinkRoot = path.join(temp, 'caption-symlink', '_workspace', 'current');
  await fs.mkdir(path.join(captionSymlinkRoot, 'assembly-real'), { recursive: true });
  await fs.copyFile(path.join(skillRoot, 'examples', 'pre-render-fixture', 'assembly', 'captions.json'), path.join(captionSymlinkRoot, 'assembly-real', 'captions.json'));
  await fs.symlink(path.join(captionSymlinkRoot, 'assembly-real'), path.join(captionSymlinkRoot, 'assembly'));
  run('caption intermediate symlink guard', process.execPath, [
    path.join(scriptDir, 'build-typewriter-captions.mjs'),
    '--input', path.join(captionSymlinkRoot, 'assembly', 'captions.json'),
    '--output', path.join(captionSymlinkRoot, 'assembly', 'captions.ass')
  ], false, { expectedError: 'caption input contains a symlinked path segment' });

  if (withMedia) {
    const ffmpeg = process.env.FFMPEG_BIN || ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((candidate) => spawnSync(candidate, ['-version'], { stdio: 'ignore' }).status === 0);
    if (!ffmpeg) throw new Error('ffmpeg not found for --media test');
    const mediaRoot = path.join(temp, 'media', '_workspace', 'current');
    await fs.mkdir(path.join(mediaRoot, 'production', 'clips'), { recursive: true });
    await fs.mkdir(path.join(mediaRoot, 'assembly'), { recursive: true });
    const clip = path.join(mediaRoot, 'production', 'clips', 'fixture.mp4');
    run('fixture clip', ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x2463eb:s=360x640:r=30:d=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip]);
    const voice = path.join(mediaRoot, 'assembly', 'voiceover.wav');
    run('fixture voice', ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=15', '-c:a', 'pcm_s16le', voice]);
    await fs.copyFile(path.join(skillRoot, 'examples', 'pre-render-fixture', 'assembly', 'captions.json'), path.join(mediaRoot, 'assembly', 'captions.json'));
    run('typewriter captions', process.execPath, [
      path.join(scriptDir, 'build-typewriter-captions.mjs'),
      '--input', path.join(mediaRoot, 'assembly', 'captions.json'),
      '--output', path.join(mediaRoot, 'assembly', 'captions.ass')
    ]);
    const timeline = {
      width: 1080, height: 1920, fps: 30,
      clips: [1, 2, 3].map(() => ({ path: '../production/clips/fixture.mp4', duration_seconds: 5 })),
      voiceover: 'voiceover.wav', music: null, caption_plan: 'captions.json', captions: 'captions.ass', music_gain_db: -18, output_duration_seconds: 15
    };
    const timelinePath = path.join(mediaRoot, 'assembly', 'timeline.json');
    await fs.writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`);
    const final = path.join(mediaRoot, 'assembly', 'final.mp4');
    run('ffmpeg assembly', process.execPath, [path.join(scriptDir, 'assemble-short.mjs'), '--timeline', timelinePath, '--output', final, '--execute']);
    const mediaVerification = run('media verification', process.execPath, [path.join(scriptDir, 'verify-media.mjs'), '--file', final, '--require-audio']);
    const measured = JSON.parse(mediaVerification.stdout).measured;
    const reviewFrameDir = path.join(mediaRoot, 'validation', 'frames');
    await fs.mkdir(reviewFrameDir, { recursive: true });
    const reviewFrames = [
      { position: 'start', timestamp_seconds: 0.1, file: path.join(reviewFrameDir, 'start.png') },
      { position: 'middle', timestamp_seconds: 7.5, file: path.join(reviewFrameDir, 'middle.png') },
      { position: 'end', timestamp_seconds: 14.9, file: path.join(reviewFrameDir, 'end.png') }
    ];
    for (const frame of reviewFrames) run(`review frame ${frame.position}`, ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(frame.timestamp_seconds), '-i', final, '-frames:v', '1', frame.file]);

    const staleCaptionMediaRoot = path.join(temp, 'stale-caption-media');
    await fs.cp(mediaRoot, staleCaptionMediaRoot, { recursive: true });
    const staleCaptionPlanPath = path.join(staleCaptionMediaRoot, 'assembly', 'captions.json');
    const staleCaptionPlan = JSON.parse(await fs.readFile(staleCaptionPlanPath, 'utf8'));
    staleCaptionPlan.cues[0].text = '바뀐 자막 계획';
    await writeJson(staleCaptionPlanPath, staleCaptionPlan);
    run('stale caption digest guard', process.execPath, [
      path.join(scriptDir, 'assemble-short.mjs'),
      '--timeline', path.join(staleCaptionMediaRoot, 'assembly', 'timeline.json'),
      '--output', path.join(staleCaptionMediaRoot, 'assembly', 'stale.mp4')
    ], false, { expectedError: 'rendered captions are stale or do not match caption_plan' });

    const forgedCaptionMediaRoot = path.join(temp, 'forged-caption-media');
    await fs.cp(mediaRoot, forgedCaptionMediaRoot, { recursive: true });
    await fs.appendFile(path.join(forgedCaptionMediaRoot, 'assembly', 'captions.ass'), '; forged extra line\n');
    run('exact ASS artifact guard', process.execPath, [
      path.join(scriptDir, 'assemble-short.mjs'),
      '--timeline', path.join(forgedCaptionMediaRoot, 'assembly', 'timeline.json'),
      '--output', path.join(forgedCaptionMediaRoot, 'assembly', 'forged.mp4')
    ], false, { expectedError: 'rendered captions are stale or do not match caption_plan' });

    const outputSymlinkRoot = path.join(temp, 'output-symlink-media');
    await fs.cp(mediaRoot, outputSymlinkRoot, { recursive: true });
    const outsideOutput = path.join(temp, 'outside-output.mp4');
    await fs.writeFile(outsideOutput, 'do-not-overwrite');
    await fs.rm(path.join(outputSymlinkRoot, 'assembly', 'final.mp4'));
    await fs.symlink(outsideOutput, path.join(outputSymlinkRoot, 'assembly', 'final.mp4'));
    run('assembly output symlink guard', process.execPath, [
      path.join(scriptDir, 'assemble-short.mjs'),
      '--timeline', path.join(outputSymlinkRoot, 'assembly', 'timeline.json'),
      '--output', path.join(outputSymlinkRoot, 'assembly', 'final.mp4'),
      '--execute'
    ], false, { expectedError: 'output must not be a symlink' });
    if (await fs.readFile(outsideOutput, 'utf8') !== 'do-not-overwrite') throw new Error('assembly output symlink target was modified');

    const assemblySymlinkRoot = path.join(temp, 'assembly-symlink-media');
    await fs.cp(mediaRoot, assemblySymlinkRoot, { recursive: true });
    await fs.rename(path.join(assemblySymlinkRoot, 'assembly'), path.join(assemblySymlinkRoot, 'assembly-real'));
    await fs.symlink(path.join(assemblySymlinkRoot, 'assembly-real'), path.join(assemblySymlinkRoot, 'assembly'));
    run('assembly intermediate symlink guard', process.execPath, [
      path.join(scriptDir, 'assemble-short.mjs'),
      '--timeline', path.join(assemblySymlinkRoot, 'assembly', 'timeline.json'),
      '--output', path.join(assemblySymlinkRoot, 'assembly', 'symlinked.mp4')
    ], false, { expectedError: 'timeline contains a missing or symlinked path segment' });

    const finalRoot = await mutateCopy('final-pass', async (root) => {
      await fs.mkdir(path.join(root, 'assembly'), { recursive: true });
      await fs.mkdir(path.join(root, 'production', 'clips'), { recursive: true });
      await fs.mkdir(path.join(root, 'release'), { recursive: true });
      await fs.mkdir(path.join(root, 'validation', 'frames'), { recursive: true });
      await fs.copyFile(final, path.join(root, 'assembly', 'final.mp4'));
      await fs.copyFile(clip, path.join(root, 'production', 'clips', 'fixture.mp4'));
      await fs.copyFile(voice, path.join(root, 'assembly', 'voiceover.wav'));
      await fs.copyFile(timelinePath, path.join(root, 'assembly', 'timeline.json'));
      await fs.copyFile(path.join(mediaRoot, 'assembly', 'captions.json'), path.join(root, 'assembly', 'captions.json'));
      await fs.copyFile(path.join(mediaRoot, 'assembly', 'captions.ass'), path.join(root, 'assembly', 'captions.ass'));
      for (const frame of reviewFrames) await fs.copyFile(frame.file, path.join(root, 'validation', 'frames', path.basename(frame.file)));
      const videoSha = digest(await fs.readFile(path.join(root, 'assembly', 'final.mp4')));
      const sourceClipSha = digest(await fs.readFile(path.join(root, 'production', 'clips', 'fixture.mp4')));
      const frameChecks = [];
      for (const frame of reviewFrames) {
        const relativePath = `validation/frames/${path.basename(frame.file)}`;
        frameChecks.push({
          position: frame.position,
          path: relativePath,
          sha256: digest(await fs.readFile(path.join(root, relativePath))),
          source_media_sha256: videoSha,
          timestamp_seconds: frame.timestamp_seconds,
          unexpected_generated_typography_found: false,
          unexpected_watermark_found: false
        });
      }
      const runPath = path.join(root, 'run.json');
      const runJson = JSON.parse(await fs.readFile(runPath, 'utf8'));
      runJson.status = 'ready_for_release';
      for (let index = 0; index <= 8; index += 1) runJson.gates[`G${index}`] = 'PASS';
      runJson.gates.G9 = 'PENDING';
      runJson.output_paths = ['assembly/final.mp4'];
      await writeJson(runPath, runJson);
      await writeJson(path.join(root, 'validation', 'qa.json'), {
        reviewer_independent: true,
        claim_coverage: 1,
        unverified_claims: 0,
        fabricated_experience: false,
        asset_rights_complete: true,
        product_identity_preserved: true,
        product_behavior_supported: true,
        generated_footage_text_free: true,
        reference_expression_copied: false,
        batch_count: 1,
        realistic_synthetic_content: true,
        youtube_ai_disclosure: 'yes',
        paid_promotion_toggle: 'not-required',
        commercial_disclosure: { required: false, onscreen: false, description: false, text: '' },
        virtual_person: { present: false, label_visible_while_present: false },
        visual_review: { start_frame: true, middle_frame: true, end_frame: true, full_playback: true },
        generated_text_review: {
          reviewer_id: 'fixture-independent-reviewer',
          reviewed_at_kst: '2026-09-01T12:00:00+09:00',
          final_media_path: 'assembly/final.mp4',
          final_media_sha256: videoSha,
          source_clips: [{
            path: 'production/clips/fixture.mp4',
            sha256: sourceClipSha,
            unexpected_generated_typography_found: false,
            unexpected_watermark_found: false
          }],
          frame_checks: frameChecks,
          full_playback_reviewed: true
        },
        caption_overlay: {
          source: 'assembly-generated',
          animation: 'typewriter',
          max_lines: 2,
          font_verified: true,
          safe_area_verified: true,
          burn_in_verified: true
        },
        technical: {
          width: measured.width,
          height: measured.height,
          fps: measured.fps,
          duration_seconds: measured.duration_seconds,
          video_codec: measured.video_codec,
          audio_peak_dbfs: measured.audio_peak_dbfs,
          captions_safe: true
        },
        verdict: 'PASS',
        findings: []
      });
      await writeJson(path.join(root, 'release', 'package.json'), {
        platform: 'youtube-shorts',
        channel_id: 'fixture-channel',
        video_path: 'assembly/final.mp4',
        video_sha256: videoSha,
        title: 'Fixture only',
        description: 'Local validation fixture. Do not publish.',
        tags: [],
        product_tag_ids: [],
        youtube_ai_disclosure: 'yes',
        paid_promotion_toggle: false,
        commercial_disclosure_text: '',
        publication_approved: false,
        published_url: null
      });
    });
    run('final-stage positive control', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', finalRoot, '--stage', 'final']);

    const badPaidToggle = path.join(temp, 'bad-paid-toggle');
    await fs.cp(finalRoot, badPaidToggle, { recursive: true });
    const badPaidFile = path.join(badPaidToggle, 'validation', 'qa.json');
    const badPaidQa = JSON.parse(await fs.readFile(badPaidFile, 'utf8'));
    badPaidQa.paid_promotion_toggle = 'required';
    await writeJson(badPaidFile, badPaidQa);
    run('paid promotion QA-release linkage guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badPaidToggle, '--stage', 'final'], false, { expectedError: 'paid promotion toggle differs from QA' });

    const badPaidEnum = path.join(temp, 'bad-paid-enum');
    await fs.cp(finalRoot, badPaidEnum, { recursive: true });
    const badPaidEnumFile = path.join(badPaidEnum, 'validation', 'qa.json');
    const badPaidEnumQa = JSON.parse(await fs.readFile(badPaidEnumFile, 'utf8'));
    badPaidEnumQa.paid_promotion_toggle = 'Required';
    await writeJson(badPaidEnumFile, badPaidEnumQa);
    run('paid promotion enum guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badPaidEnum, '--stage', 'final'], false, { expectedError: 'paid_promotion_toggle must be required or not-required' });

    const badVisual = path.join(temp, 'bad-visual-review');
    await fs.cp(finalRoot, badVisual, { recursive: true });
    const badVisualFile = path.join(badVisual, 'validation', 'qa.json');
    const badVisualQa = JSON.parse(await fs.readFile(badVisualFile, 'utf8'));
    badVisualQa.visual_review = {};
    await writeJson(badVisualFile, badVisualQa);
    run('complete visual review guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badVisual, '--stage', 'final'], false, { expectedError: 'visual review must include four completed checks' });

    const badTechnical = path.join(temp, 'bad-technical-review');
    await fs.cp(finalRoot, badTechnical, { recursive: true });
    const badTechnicalFile = path.join(badTechnical, 'validation', 'qa.json');
    const badTechnicalQa = JSON.parse(await fs.readFile(badTechnicalFile, 'utf8'));
    badTechnicalQa.technical = {};
    await writeJson(badTechnicalFile, badTechnicalQa);
    run('complete technical review guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badTechnical, '--stage', 'final'], false, { expectedError: 'technical dimensions must be 1080x1920' });

    const badGeneratedFootageText = path.join(temp, 'bad-generated-footage-text');
    await fs.cp(finalRoot, badGeneratedFootageText, { recursive: true });
    const badGeneratedFootageTextFile = path.join(badGeneratedFootageText, 'validation', 'qa.json');
    const badGeneratedFootageTextQa = JSON.parse(await fs.readFile(badGeneratedFootageTextFile, 'utf8'));
    badGeneratedFootageTextQa.generated_footage_text_free = false;
    await writeJson(badGeneratedFootageTextFile, badGeneratedFootageTextQa);
    run('generated footage text QA guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badGeneratedFootageText, '--stage', 'final'], false, { expectedError: 'generated source footage contains synthetic typography' });

    const unboundGeneratedTextReview = path.join(temp, 'unbound-generated-text-review');
    await fs.cp(finalRoot, unboundGeneratedTextReview, { recursive: true });
    const unboundGeneratedTextReviewFile = path.join(unboundGeneratedTextReview, 'validation', 'qa.json');
    const unboundGeneratedTextReviewQa = JSON.parse(await fs.readFile(unboundGeneratedTextReviewFile, 'utf8'));
    unboundGeneratedTextReviewQa.generated_text_review.final_media_sha256 = '0'.repeat(64);
    await writeJson(unboundGeneratedTextReviewFile, unboundGeneratedTextReviewQa);
    run('generated text evidence binding guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', unboundGeneratedTextReview, '--stage', 'final'], false, { expectedError: 'generated text review media digest mismatch' });

    const spoofedFinalMedia = path.join(temp, 'spoofed-final-media');
    await fs.cp(finalRoot, spoofedFinalMedia, { recursive: true });
    const spoofedVideoPath = path.join(spoofedFinalMedia, 'assembly', 'final.mp4');
    await fs.writeFile(spoofedVideoPath, '{"not":"video"}\n');
    const spoofedVideoSha = digest(await fs.readFile(spoofedVideoPath));
    const spoofedQaPath = path.join(spoofedFinalMedia, 'validation', 'qa.json');
    const spoofedQa = JSON.parse(await fs.readFile(spoofedQaPath, 'utf8'));
    spoofedQa.generated_text_review.final_media_sha256 = spoofedVideoSha;
    for (const frame of spoofedQa.generated_text_review.frame_checks) frame.source_media_sha256 = spoofedVideoSha;
    await writeJson(spoofedQaPath, spoofedQa);
    const spoofedPackagePath = path.join(spoofedFinalMedia, 'release', 'package.json');
    const spoofedPackage = JSON.parse(await fs.readFile(spoofedPackagePath, 'utf8'));
    spoofedPackage.video_sha256 = spoofedVideoSha;
    await writeJson(spoofedPackagePath, spoofedPackage);
    run('spoofed final media guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', spoofedFinalMedia, '--stage', 'final'], false, { expectedError: 'generated text review media verification failed' });

    const badCaptionOverlay = path.join(temp, 'bad-caption-overlay');
    await fs.cp(finalRoot, badCaptionOverlay, { recursive: true });
    const badCaptionOverlayFile = path.join(badCaptionOverlay, 'validation', 'qa.json');
    const badCaptionOverlayQa = JSON.parse(await fs.readFile(badCaptionOverlayFile, 'utf8'));
    badCaptionOverlayQa.caption_overlay.max_lines = 3;
    await writeJson(badCaptionOverlayFile, badCaptionOverlayQa);
    run('caption overlay QA guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badCaptionOverlay, '--stage', 'final'], false, { expectedError: 'assembly captions must use typewriter and at most two lines' });

    const missingCaptionBurn = path.join(temp, 'missing-caption-burn');
    await fs.cp(finalRoot, missingCaptionBurn, { recursive: true });
    await fs.rm(path.join(missingCaptionBurn, 'assembly', 'captions.ass'));
    run('caption burn-in artifact guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', missingCaptionBurn, '--stage', 'final'], false, { expectedError: 'rendered captions are missing' });

    const releasedRoot = path.join(temp, 'released-pass');
    await fs.cp(finalRoot, releasedRoot, { recursive: true });
    const releasedRunPath = path.join(releasedRoot, 'run.json');
    const releasedRun = JSON.parse(await fs.readFile(releasedRunPath, 'utf8'));
    releasedRun.status = 'released';
    releasedRun.gates.G9 = 'PASS';
    await writeJson(releasedRunPath, releasedRun);
    const releasedPackagePath = path.join(releasedRoot, 'release', 'package.json');
    const releasedPackage = JSON.parse(await fs.readFile(releasedPackagePath, 'utf8'));
    releasedPackage.publication_approved = true;
    releasedPackage.published_url = 'https://example.com/fixture-do-not-publish';
    await writeJson(releasedPackagePath, releasedPackage);
    await writeJson(path.join(releasedRoot, 'release', 'receipt.json'), {
      schema_version: 1,
      platform: releasedPackage.platform,
      release_adapter_id: 'youtube-shorts-v1',
      video_sha256: releasedPackage.video_sha256,
      published_url: releasedPackage.published_url,
      published_at_kst: '2026-09-01T12:00:00+09:00',
      live_title: releasedPackage.title,
      live_description: releasedPackage.description,
      live_labels: ['ai-generated'],
      live_product_tag_ids: releasedPackage.product_tag_ids,
      verification: 'PASS'
    });
    run('release-stage positive control', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', releasedRoot, '--stage', 'release']);

    const badReleaseReceipt = path.join(temp, 'bad-release-receipt');
    await fs.cp(releasedRoot, badReleaseReceipt, { recursive: true });
    const badReceiptFile = path.join(badReleaseReceipt, 'release', 'receipt.json');
    const badReceipt = JSON.parse(await fs.readFile(badReceiptFile, 'utf8'));
    badReceipt.published_url = 'https://example.com/wrong-fixture-url';
    await writeJson(badReceiptFile, badReceipt);
    run('release read-back receipt guard', process.execPath, [path.join(scriptDir, 'validate-run.mjs'), '--root', badReleaseReceipt, '--stage', 'release'], false, { expectedError: 'release receipt: URL differs from package' });
  }

  console.log(JSON.stringify({ verdict: 'PASS', media_tested: withMedia, tests: results.length, results }, null, 2));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
