#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PUBLICATION_SURFACES, validateCommerceFiles } from './validate-commerce-research.mjs';
import { captionPlanSha256, renderCaptionAss, validateCaptionPlan } from './caption-contract.mjs';
import { validateGeneratedTypographyPolicy } from './generation-policy.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const PINNED_REPO = 'https://github.com/Anil-matcha/Open-Generative-AI';
const PINNED_SHA = '5482a777047c0df189eef989ff994d0d7a1d2874';
const stages = ['intake', 'research', 'pre-render', 'final', 'release'];
const finalStatuses = new Set(['ready_for_release', 'released']);
const allowedRights = new Set(['owned', 'written-permission', 'licensed-commercial', 'public-domain', 'cc-by', 'cc-by-sa', 'platform-affiliate-asset-with-verified-terms']);
const experiencePattern = /(써\s*봤|사용해\s*봤|직접\s*써|직접\s*사용|내가\s*샀|제가\s*샀|우리\s*집에서|친구\s*집에서|써보니|사용해보니)/i;
const coupangClickInducementPattern = /(링크(?:를|는|가)?\s*(?:클릭|눌러|누르)|(?:클릭|눌러|누르)\s*(?:해|하세요|해\s*주세요|부탁|도와|응원)|수익을\s*위해\s*(?:클릭|눌러|누르))/i;
const coupangRestrictedMetricPattern = /(?:\bCTR\b|클릭률|노출수|클릭수)/i;
const expectedGateKeys = Array.from({ length: 10 }, (_, index) => `G${index}`);
const allowedGateValues = new Set(['PENDING', 'PASS', 'FAIL', 'BLOCKED']);

function usage(code = 0) {
  console.log('Usage: node scripts/validate-run.mjs --root /absolute/project/_workspace/current [--stage intake|research|pre-render|final|release]');
  process.exit(code);
}

const args = process.argv.slice(2);
let root;
let stage = 'intake';
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--root') root = args[++i];
  else if (args[i] === '--stage') stage = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') usage(0);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
if (!root || !stages.includes(stage)) usage(2);
root = path.resolve(root);
const rootStat = await fs.lstat(root).catch(() => null);
if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`Root must be a real directory: ${root}`);
const rootReal = await fs.realpath(root);
const errors = [];
const warnings = [];
const checked = [];

function underRoot(filePath) {
  const normalized = String(filePath || '').replace(/^_workspace[\\/]current[\\/]/, '');
  const absolute = path.resolve(rootReal, normalized);
  if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${path.sep}`)) throw new Error(`Path escapes run root: ${filePath}`);
  return absolute;
}

async function containsSymlinkSegment(absolute) {
  const relative = path.relative(rootReal, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return true;
  let current = rootReal;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return true;
  }
  return false;
}

async function inspectContainedFile(filePath) {
  const absolute = underRoot(filePath);
  const stat = await fs.lstat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || await containsSymlinkSegment(absolute)) return { absolute, stat, safe: false };
  const real = await fs.realpath(absolute).catch(() => null);
  const safe = Boolean(real && (real === rootReal || real.startsWith(`${rootReal}${path.sep}`)));
  return { absolute, stat, real, safe };
}

async function readJson(rel, required = true) {
  try {
    const inspected = await inspectContainedFile(rel);
    if (!inspected.safe) throw Object.assign(new Error('missing, symlinked, or outside run root'), { code: inspected.stat ? 'EUNSAFE' : 'ENOENT' });
    const parsed = JSON.parse(await fs.readFile(inspected.absolute, 'utf8'));
    checked.push(rel);
    return parsed;
  } catch (error) {
    if (required) errors.push(`${rel}: ${error.code === 'ENOENT' ? 'missing' : `invalid or unsafe JSON (${error.message})`}`);
    return null;
  }
}

async function readText(rel, required = true) {
  try {
    const inspected = await inspectContainedFile(rel);
    if (!inspected.safe) throw Object.assign(new Error('missing, symlinked, or outside run root'), { code: inspected.stat ? 'EUNSAFE' : 'ENOENT' });
    const value = await fs.readFile(inspected.absolute, 'utf8');
    checked.push(rel);
    return value;
  } catch (error) {
    if (required) errors.push(`${rel}: ${error.code === 'ENOENT' ? 'missing' : `invalid or unsafe text (${error.message})`}`);
    return null;
  }
}

function requireValue(condition, message) {
  if (!condition) errors.push(message);
}

function allStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) allStrings(item, out);
  return out;
}

async function sha256(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function parseTokenCell(value) {
  if (value === 'none') return [];
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function parseStoryboardRows(markdown) {
  const lines = String(markdown || '').split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => line.trim() === '| Shot | Time | Visual proof | Voiceover | Overlay text | Claim IDs | Asset IDs |');
  if (headerIndex < 0 || !/^\|(?:\s*---\s*\|){7}$/u.test(lines[headerIndex + 1]?.trim() || '')) return { error: 'storyboard table header is invalid', rows: [] };
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.length !== 7) return { error: 'storyboard row must contain exactly seven cells', rows: [] };
    const time = cells[1].match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s$/u);
    rows.push({
      shot_id: cells[0],
      start_seconds: time ? Number(time[1]) : NaN,
      end_seconds: time ? Number(time[2]) : NaN,
      visual_proof: cells[2],
      voiceover: cells[3],
      overlay_text: cells[4],
      claim_ids: parseTokenCell(cells[5]),
      asset_ids: parseTokenCell(cells[6])
    });
  }
  return { error: null, rows };
}

const run = await readJson('run.json');
if (run) {
  requireValue(run.schema_version === 1, 'run.json: schema_version must be 1');
  requireValue(/^\d{8}-\d{4}-[a-z0-9][a-z0-9-]{2,80}$/.test(run.run_id || ''), 'run.json: invalid run_id');
  requireValue(['intake', 'researching', 'awaiting_concept_approval', 'approved_for_render', 'rendering', 'assembling', 'reviewing', 'ready_for_release', 'released', 'blocked', 'rejected'].includes(run.status), 'run.json: invalid status');
  requireValue(['unknown', 'commerce-ready', 'creative-only', 'blocked'].includes(run.commerce_mode), 'run.json: invalid commerce_mode');
  requireValue(run.experience_mode === 'sourced-only', 'run.json: experience_mode must be sourced-only');
  requireValue(run.max_outputs === 1, 'run.json: max_outputs must be 1');
  requireValue(Number.isInteger(run.revision_loops) && run.revision_loops >= 0 && run.revision_loops <= 2, 'run.json: revision_loops must be 0..2');
  requireValue(Array.isArray(run.output_paths) && run.output_paths.length <= 1, 'run.json: output_paths must contain at most one path');
  const gateKeys = Object.keys(run.gates || {});
  requireValue(gateKeys.length === expectedGateKeys.length && expectedGateKeys.every((key) => gateKeys.includes(key)), 'run.json: gates must contain exactly G0..G9');
  for (const [key, value] of Object.entries(run.gates || {})) requireValue(allowedGateValues.has(value), `run.json: ${key} has invalid gate value ${String(value)}`);
}

if (stage === 'intake') {
  finish();
}

const product = await readJson('intake/product.json');
const evidence = await readJson('research/evidence.json');
const rights = await readJson('research/rights.json');
const verifiedClaims = new Set();
const allClaimIds = new Set();
const assetIds = new Set();

if (product) {
  requireValue(typeof product.product_id === 'string' && product.product_id.length > 0, 'product.json: product_id is required');
  requireValue(/^https?:\/\//.test(product.canonical_url || ''), 'product.json: canonical_url must be http(s)');
  const channelSurface = PUBLICATION_SURFACES[product.channel?.platform];
  requireValue(Boolean(channelSurface), 'product.json: channel.platform must be a catalog publication surface');
  if (channelSurface) requireValue(product.channel?.publication_adapter === channelSurface.release_adapter_id, 'product.json: publication_adapter must match the catalog surface');
}
if (run && product) requireValue(run.product_id === product.product_id, 'run.json product_id must match product.json');

if (evidence) {
  requireValue(Array.isArray(evidence.claims), 'evidence.json: claims must be an array');
  for (const [index, claim] of (evidence.claims || []).entries()) {
    const label = `evidence.json claims[${index}]`;
    requireValue(/^c\d{2,}$/.test(claim.claim_id || ''), `${label}: invalid claim_id`);
    requireValue(!allClaimIds.has(claim.claim_id), `${label}: duplicate claim_id`);
    allClaimIds.add(claim.claim_id);
    requireValue(['verified', 'inferred', 'unverified'].includes(claim.status), `${label}: invalid status`);
    requireValue(/^https?:\/\//.test(claim.source_url || ''), `${label}: source_url must be http(s)`);
    requireValue(typeof claim.quote_or_coordinate === 'string' && claim.quote_or_coordinate.length > 0, `${label}: quote_or_coordinate is required`);
    requireValue(Array.isArray(claim.used_in), `${label}: used_in must be an array`);
    if (claim.status === 'verified') verifiedClaims.add(claim.claim_id);
    if ((claim.used_in || []).length > 0) requireValue(claim.status === 'verified', `${label}: a used claim must be verified`);
  }
  const used = (evidence.claims || []).filter((claim) => (claim.used_in || []).length > 0);
  const computedCoverage = used.length === 0 ? 1 : used.filter((claim) => claim.status === 'verified').length / used.length;
  requireValue(evidence.coverage === computedCoverage, `evidence.json: coverage ${evidence.coverage} does not match computed ${computedCoverage}`);
}

if (rights) {
  requireValue(Array.isArray(rights.assets), 'rights.json: assets must be an array');
  for (const [index, asset] of (rights.assets || []).entries()) {
    const label = `rights.json assets[${index}]`;
    requireValue(/^a\d{2,}$/.test(asset.asset_id || ''), `${label}: invalid asset_id`);
    requireValue(!assetIds.has(asset.asset_id), `${label}: duplicate asset_id`);
    assetIds.add(asset.asset_id);
    requireValue(allowedRights.has(asset.rights_basis), `${label}: unsupported rights_basis`);
    requireValue(asset.commercial_use === true && asset.transformation_allowed === true, `${label}: commercial use and transformation must be allowed`);
    requireValue(/^[a-f0-9]{64}$/.test(asset.sha256 || ''), `${label}: invalid sha256`);
    requireValue(typeof asset.permission_evidence === 'string' && asset.permission_evidence.length > 0, `${label}: permission_evidence is required`);
    const local = await inspectContainedFile(asset.local_path);
    requireValue(local.safe, `${label}: local asset missing, symlinked, or outside run root`);
    if (local.safe) {
      const actual = await sha256(local.absolute);
      requireValue(actual === asset.sha256, `${label}: sha256 mismatch`);
    }
  }
}

const commerceValidation = await validateCommerceFiles({
  platformsPath: underRoot('research/commerce-platforms.json'),
  routePath: stage === 'research' ? null : underRoot('strategy/commerce-route.json'),
  receiptPath: stage === 'research' ? null : underRoot('validation/commerce.json'),
  expectedRunId: run?.run_id,
  expectedCommerceMode: stage === 'research' ? null : run?.commerce_mode,
  requireRoute: stage !== 'research'
});
errors.push(...commerceValidation.errors);
warnings.push(...commerceValidation.warnings);
for (const absolute of commerceValidation.checked) checked.push(path.relative(rootReal, absolute).split(path.sep).join('/'));
const commerceRoute = commerceValidation.objects.route;
if (commerceRoute && product?.channel?.platform) requireValue(commerceRoute.publication_surface === product.channel.platform, 'commerce-route.json: publication_surface must match product channel');

if (stage === 'research') finish();

const concepts = await readJson('strategy/concepts.json');
const selected = await readJson('strategy/selected-concept.json');
const storyboard = await readText('production/storyboard.md');
const renderPlan = await readJson('production/render-plan.json');
const selectedConceptSha = selected ? await sha256(underRoot('strategy/selected-concept.json')) : null;
const renderPlanSha = renderPlan ? await sha256(underRoot('production/render-plan.json')) : null;
const storyboardTable = parseStoryboardRows(storyboard);

requireValue(run?.commerce_mode === 'commerce-ready' || run?.commerce_mode === 'creative-only', 'pre-render: commerce_mode must be commerce-ready or creative-only');
requireValue(run?.commerce_mode !== 'blocked', 'pre-render: commerce is blocked');
for (const gate of expectedGateKeys.slice(0, 6)) requireValue(run?.gates?.[gate] === 'PASS', `pre-render: ${gate} must be PASS`);
requireValue(Array.isArray(concepts?.concepts) && concepts.concepts.length >= 1 && concepts.concepts.length <= 3, 'concepts.json: expected 1..3 concepts');
requireValue(typeof selected?.concept_id === 'string', 'selected-concept.json: concept_id is required');
requireValue(selected?.approved === true && typeof selected?.approval_reference === 'string' && selected.approval_reference.length > 0, 'selected-concept.json: approved concept and approval_reference are required');
requireValue((concepts?.concepts || []).some((item) => item.concept_id === selected?.concept_id), 'selected-concept.json: concept_id not found in concepts');
requireValue(Array.isArray(selected?.shots) && selected.shots.length >= 1 && selected.shots.length <= 8 && new Set(selected.shots).size === selected.shots.length, 'selected-concept.json: shots must contain 1..8 unique ids');
requireValue(typeof storyboard === 'string' && !storyboard.includes('| pending |') && storyboard.includes('generated_text_policy: forbid-generated-typography'), 'storyboard.md: approved storyboard and generated text policy are required');
requireValue(storyboard?.includes(`- Selected concept SHA-256: \`${selectedConceptSha}\``), 'storyboard.md: selected concept digest is missing or stale');
requireValue(storyboard?.includes(`- Render plan SHA-256: \`${renderPlanSha}\``), 'storyboard.md: render plan digest is missing or stale');
requireValue(!storyboardTable.error, `storyboard.md: ${storyboardTable.error || 'table is invalid'}`);
for (const claimId of selected?.claim_ids || []) requireValue(verifiedClaims.has(claimId), `selected-concept.json: claim ${claimId} is not verified`);
const selectedText = allStrings(selected || {}).join('\n');
requireValue(!experiencePattern.test(selectedText), 'selected-concept.json: possible unsupported first-person experience claim');
if (commerceRoute?.monetization_program === 'coupang-partners') {
  requireValue(!coupangClickInducementPattern.test(selectedText), 'selected-concept.json: Coupang click inducement is prohibited');
  requireValue(!coupangRestrictedMetricPattern.test(selectedText), 'selected-concept.json: Coupang restricted performance metrics must not be disclosed');
}

if (renderPlan) {
  requireValue(renderPlan.source_repo === PINNED_REPO, 'render-plan.json: source_repo mismatch');
  requireValue(renderPlan.source_sha === PINNED_SHA, 'render-plan.json: source_sha mismatch');
  requireValue(['muapi-api', 'open-generative-ai-gui', 'wan2gp-gradio'].includes(renderPlan.execution_surface), 'render-plan.json: invalid execution_surface');
  for (const policyError of validateGeneratedTypographyPolicy(renderPlan)) requireValue(false, `render-plan.json: ${policyError}`);
  requireValue(renderPlan.output?.width === 1080 && renderPlan.output?.height === 1920, 'render-plan.json: output must be 1080x1920');
  requireValue(Array.isArray(renderPlan.shots) && renderPlan.shots.length >= 1 && renderPlan.shots.length <= 8, 'render-plan.json: expected 1..8 shots');
  let duration = 0;
  const shotIds = new Set();
  for (const [index, shot] of (renderPlan.shots || []).entries()) {
    const label = `render-plan.json shots[${index}]`;
    requireValue(!shotIds.has(shot.shot_id), `${label}: duplicate shot_id`);
    shotIds.add(shot.shot_id);
    requireValue(shot.aspect_ratio === '9:16', `${label}: aspect_ratio must be 9:16`);
    requireValue(Number.isFinite(shot.duration_seconds) && shot.duration_seconds > 0 && shot.duration_seconds <= 30, `${label}: invalid duration`);
    duration += Number(shot.duration_seconds || 0);
    for (const assetId of shot.source_asset_ids || []) requireValue(assetIds.has(assetId), `${label}: unknown asset ${assetId}`);
    for (const claimId of shot.claim_ids || []) requireValue(verifiedClaims.has(claimId), `${label}: unverified claim ${claimId}`);
  }
  requireValue(Math.abs(duration - Number(renderPlan.output?.duration_seconds || 0)) <= 0.5, 'render-plan.json: shot durations must equal output duration');
  requireValue(JSON.stringify([...shotIds]) === JSON.stringify(selected?.shots || []), 'render-plan.json: shot ids and order must match selected concept');
  requireValue(storyboardTable.rows.length === renderPlan.shots.length, 'storyboard.md: row count must match render plan shots');
  let storyboardStart = 0;
  for (const [index, shot] of renderPlan.shots.entries()) {
    const row = storyboardTable.rows[index];
    const label = `storyboard.md row ${index + 1}`;
    requireValue(row?.shot_id === shot.shot_id, `${label}: shot id or order differs from render plan`);
    requireValue(Number.isFinite(row?.start_seconds) && Math.abs(row.start_seconds - storyboardStart) <= 0.01, `${label}: start time differs from render plan`);
    storyboardStart += Number(shot.duration_seconds || 0);
    requireValue(Number.isFinite(row?.end_seconds) && Math.abs(row.end_seconds - storyboardStart) <= 0.01, `${label}: end time differs from render plan`);
    requireValue(Boolean(row?.visual_proof) && !/pending/iu.test(row.visual_proof), `${label}: visual proof is missing`);
    requireValue(Boolean(row?.voiceover) && !/pending/iu.test(row.voiceover), `${label}: voiceover is missing`);
    requireValue(Boolean(row?.overlay_text) && !/pending/iu.test(row.overlay_text), `${label}: overlay text decision is missing`);
    requireValue(JSON.stringify(row?.claim_ids || []) === JSON.stringify(shot.claim_ids || []), `${label}: claim ids differ from render plan`);
    requireValue(JSON.stringify(row?.asset_ids || []) === JSON.stringify(shot.source_asset_ids || []), `${label}: asset ids differ from render plan`);
  }
  if (run?.status === 'approved_for_render' || ['rendering', 'assembling', 'reviewing', 'ready_for_release', 'released'].includes(run?.status)) {
    requireValue(renderPlan.estimated_cost !== null && Number.isFinite(renderPlan.estimated_cost), 'render-plan.json: estimated_cost required before render approval');
    if (renderPlan.execution_surface === 'muapi-api') requireValue(renderPlan.balance_verified === true, 'render-plan.json: balance must be verified before MuAPI render');
    requireValue(renderPlan.paid_execution_approved === true || renderPlan.execution_surface !== 'muapi-api', 'render-plan.json: paid MuAPI execution is not approved');
  }
}

if (stage === 'pre-render') finish();

const timeline = await readJson('assembly/timeline.json');
const qa = await readJson('validation/qa.json');
const release = await readJson('release/package.json');
requireValue(finalStatuses.has(run?.status), 'final: run status must be ready_for_release or released');
for (const gate of expectedGateKeys.slice(0, 9)) requireValue(run?.gates?.[gate] === 'PASS', `final: ${gate} must be PASS`);
requireValue(timeline?.width === 1080 && timeline?.height === 1920, 'timeline.json: dimensions must be 1080x1920');
requireValue(Number.isFinite(timeline?.fps) && timeline.fps >= 24 && timeline.fps <= 60, 'timeline.json: fps must be 24..60');
requireValue(Array.isArray(timeline?.clips) && timeline.clips.length >= 1 && timeline.clips.length <= 8, 'timeline.json: clips must contain 1..8 entries');
let timelineDuration = 0;
for (const [index, clip] of (timeline?.clips || []).entries()) {
  requireValue(Number.isFinite(clip.duration_seconds) && clip.duration_seconds > 0, `timeline.json clips[${index}]: duration is invalid`);
  timelineDuration += Number(clip.duration_seconds || 0);
  const clipFile = typeof clip.path === 'string' ? await inspectContainedFile(`assembly/${clip.path}`) : null;
  requireValue(clipFile?.safe, `timeline.json clips[${index}]: file is missing, symlinked, or outside run root`);
}
requireValue(Math.abs(timelineDuration - Number(timeline?.output_duration_seconds || 0)) <= 0.5, 'timeline.json: clip durations must equal output duration');
for (const field of ['voiceover', 'music']) {
  if (typeof timeline?.[field] === 'string') {
    const mediaFile = await inspectContainedFile(`assembly/${timeline[field]}`);
    requireValue(mediaFile.safe, `timeline.json: ${field} is missing, symlinked, or outside run root`);
  }
}
requireValue(qa?.verdict === 'PASS', 'qa.json: verdict must be PASS');
requireValue(qa?.reviewer_independent === true, 'qa.json: reviewer must be independent');
requireValue(['yes', 'no'].includes(qa?.youtube_ai_disclosure), 'qa.json: youtube_ai_disclosure must be yes or no');
requireValue(['required', 'not-required'].includes(qa?.paid_promotion_toggle), 'qa.json: paid_promotion_toggle must be required or not-required');
requireValue(qa?.claim_coverage === 1 && qa?.unverified_claims === 0, 'qa.json: claim coverage must be 1.0 with zero unverified claims');
requireValue(qa?.fabricated_experience === false, 'qa.json: fabricated experience detected');
requireValue(qa?.asset_rights_complete === true, 'qa.json: asset rights incomplete');
requireValue(qa?.product_identity_preserved === true && qa?.product_behavior_supported === true, 'qa.json: product identity or behavior failed');
requireValue(qa?.generated_footage_text_free === true, 'qa.json: generated source footage contains synthetic typography, subtitles, or watermarks');
requireValue(qa?.reference_expression_copied === false && qa?.batch_count === 1, 'qa.json: copied or mass-produced output');
const visualReviewKeys = ['start_frame', 'middle_frame', 'end_frame', 'full_playback'];
requireValue(visualReviewKeys.every((key) => qa?.visual_review?.[key] === true) && Object.keys(qa?.visual_review || {}).length === visualReviewKeys.length, 'qa.json: visual review must include four completed checks');
const textReview = qa?.generated_text_review;
requireValue(typeof textReview?.reviewer_id === 'string' && textReview.reviewer_id.trim().length > 0, 'qa.json: generated text review needs a reviewer id');
requireValue(typeof textReview?.reviewed_at_kst === 'string' && /\+09:00$/u.test(textReview.reviewed_at_kst) && Number.isFinite(Date.parse(textReview.reviewed_at_kst)), 'qa.json: generated text review needs a valid KST timestamp');
requireValue(textReview?.full_playback_reviewed === true, 'qa.json: generated text review must include full playback');
requireValue(textReview?.final_media_path === run?.output_paths?.[0], 'qa.json: generated text review media path differs from run output');
requireValue(path.extname(textReview?.final_media_path || '').toLowerCase() === '.mp4', 'qa.json: generated text review media must be an .mp4 file');
const reviewedMedia = typeof textReview?.final_media_path === 'string' ? await inspectContainedFile(textReview.final_media_path) : null;
requireValue(reviewedMedia?.safe, 'qa.json: generated text review media is missing, symlinked, or outside run root');
const reviewedMediaSha = reviewedMedia?.safe ? await sha256(reviewedMedia.absolute) : null;
requireValue(reviewedMediaSha && textReview?.final_media_sha256 === reviewedMediaSha, 'qa.json: generated text review media digest mismatch');
let reviewedMediaMeasured = null;
if (reviewedMedia?.safe && path.extname(reviewedMedia.absolute).toLowerCase() === '.mp4') {
  const mediaCheck = spawnSync(process.execPath, [path.join(scriptDir, 'verify-media.mjs'), '--file', reviewedMedia.absolute], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000
  });
  if (mediaCheck.status !== 0 || mediaCheck.error) requireValue(false, 'qa.json: generated text review media verification failed');
  else {
    try {
      const parsedMediaCheck = JSON.parse(mediaCheck.stdout);
      reviewedMediaMeasured = parsedMediaCheck.verdict === 'PASS' ? parsedMediaCheck.measured : null;
      requireValue(Boolean(reviewedMediaMeasured), 'qa.json: generated text review media verification failed');
    } catch {
      requireValue(false, 'qa.json: generated text review media verification output is invalid');
    }
  }
}
const expectedSourceClips = [...new Set((timeline?.clips || []).map((clip) => path.relative(rootReal, underRoot(`assembly/${clip.path}`)).split(path.sep).join('/')))];
requireValue(Array.isArray(textReview?.source_clips) && textReview.source_clips.length === expectedSourceClips.length, 'qa.json: generated text review source clip count mismatch');
for (const [index, expectedPath] of expectedSourceClips.entries()) {
  const clipReview = textReview?.source_clips?.[index];
  requireValue(clipReview?.path === expectedPath, `qa.json: generated text review source clip ${index} path mismatch`);
  const reviewedClip = typeof clipReview?.path === 'string' ? await inspectContainedFile(clipReview.path) : null;
  requireValue(reviewedClip?.safe, `qa.json: generated text review source clip ${index} is unsafe or missing`);
  if (reviewedClip?.safe) requireValue(clipReview.sha256 === await sha256(reviewedClip.absolute), `qa.json: generated text review source clip ${index} digest mismatch`);
  requireValue(clipReview?.unexpected_generated_typography_found === false && clipReview?.unexpected_watermark_found === false, `qa.json: generated text review source clip ${index} failed`);
}
const expectedFramePositions = ['start', 'middle', 'end'];
const expectedFrameTimes = [0.1, Number(timeline?.output_duration_seconds || 0) / 2, Math.max(0, Number(timeline?.output_duration_seconds || 0) - 0.1)];
requireValue(Array.isArray(textReview?.frame_checks) && textReview.frame_checks.length === 3, 'qa.json: generated text review needs three frame checks');
for (const [index, position] of expectedFramePositions.entries()) {
  const frame = textReview?.frame_checks?.[index];
  requireValue(frame?.position === position, `qa.json: generated text review ${position} frame is missing or out of order`);
  requireValue(frame?.source_media_sha256 === reviewedMediaSha, `qa.json: generated text review ${position} frame is not bound to final media`);
  requireValue(Number.isFinite(frame?.timestamp_seconds) && Math.abs(frame.timestamp_seconds - expectedFrameTimes[index]) <= 0.25, `qa.json: generated text review ${position} timestamp mismatch`);
  const frameFile = typeof frame?.path === 'string' ? await inspectContainedFile(frame.path) : null;
  requireValue(frameFile?.safe, `qa.json: generated text review ${position} frame is unsafe or missing`);
  if (frameFile?.safe) requireValue(frame.sha256 === await sha256(frameFile.absolute), `qa.json: generated text review ${position} frame digest mismatch`);
  requireValue(frame?.unexpected_generated_typography_found === false && frame?.unexpected_watermark_found === false, `qa.json: generated text review ${position} frame failed`);
}
const technical = qa?.technical;
requireValue(technical?.width === 1080 && technical?.height === 1920, 'qa.json: technical dimensions must be 1080x1920');
requireValue(Number.isFinite(technical?.fps) && technical.fps >= 24 && technical.fps <= 60, 'qa.json: technical fps must be 24..60');
requireValue(Number.isFinite(technical?.duration_seconds) && technical.duration_seconds >= 15 && technical.duration_seconds <= 60, 'qa.json: technical duration must be 15..60 seconds');
requireValue(Math.abs(Number(technical?.duration_seconds || 0) - Number(timeline?.output_duration_seconds || 0)) <= 0.05, 'qa.json: measured duration differs from timeline');
requireValue(technical?.video_codec === 'h264', 'qa.json: technical video codec must be h264');
requireValue(technical?.audio_peak_dbfs === null || (Number.isFinite(technical?.audio_peak_dbfs) && technical.audio_peak_dbfs <= 0), 'qa.json: invalid audio peak');
requireValue(technical?.captions_safe === true, 'qa.json: captions_safe must be true');
if (reviewedMediaMeasured) {
  requireValue(reviewedMediaMeasured.width === technical?.width && reviewedMediaMeasured.height === technical?.height, 'qa.json: probed media dimensions differ from technical review');
  requireValue(Math.abs(Number(reviewedMediaMeasured.fps || 0) - Number(technical?.fps || 0)) <= 0.01, 'qa.json: probed media fps differs from technical review');
  requireValue(Math.abs(Number(reviewedMediaMeasured.duration_seconds || 0) - Number(technical?.duration_seconds || 0)) <= 0.05, 'qa.json: probed media duration differs from technical review');
  requireValue(reviewedMediaMeasured.video_codec === technical?.video_codec, 'qa.json: probed media codec differs from technical review');
}
const captionOverlay = qa?.caption_overlay;
requireValue(captionOverlay && ['none', 'assembly-generated'].includes(captionOverlay.source), 'qa.json: caption_overlay source is invalid');
requireValue(captionOverlay?.safe_area_verified === true, 'qa.json: caption overlay safe area is not verified');
if (captionOverlay?.source === 'assembly-generated') {
  requireValue(captionOverlay.animation === 'typewriter' && captionOverlay.max_lines === 2, 'qa.json: assembly captions must use typewriter and at most two lines');
  requireValue(captionOverlay.font_verified === true && captionOverlay.burn_in_verified === true, 'qa.json: caption font and burn-in must be verified');
  requireValue(typeof timeline?.caption_plan === 'string' && typeof timeline?.captions === 'string', 'timeline.json: caption plan and rendered captions are required');
  const captionPlanPath = typeof timeline?.caption_plan === 'string' ? `assembly/${timeline.caption_plan}` : null;
  const captionOutputPath = typeof timeline?.captions === 'string' ? `assembly/${timeline.captions}` : null;
  const captionPlan = captionPlanPath ? await readJson(captionPlanPath) : null;
  const captionOutput = captionOutputPath ? await inspectContainedFile(captionOutputPath) : null;
  const captionValidation = captionPlan ? validateCaptionPlan(captionPlan, { durationSeconds: timeline?.output_duration_seconds }) : { errors: ['caption plan is missing'] };
  for (const captionError of captionValidation.errors) requireValue(false, `caption plan: ${captionError}`);
  requireValue(path.extname(captionOutputPath || '').toLowerCase() === '.ass', 'timeline.json: rendered captions must use the .ass extension');
  requireValue(captionOutput?.safe, 'timeline.json: rendered captions are missing, symlinked, or outside run root');
  if (captionPlanPath && captionPlan && captionOutput?.safe && !captionValidation.errors.length) {
    const captionPlanBytes = await fs.readFile(underRoot(captionPlanPath));
    const captionPlanSha = captionPlanSha256(captionPlanBytes);
    const captionOutputText = await fs.readFile(captionOutput.absolute, 'utf8');
    const expectedCaptionOutput = renderCaptionAss(captionPlan, captionPlanSha);
    requireValue(captionOutputText === expectedCaptionOutput, 'timeline.json: rendered captions are stale, malformed, or do not exactly match the caption plan');
  }
} else if (captionOverlay?.source === 'none') {
  requireValue(captionOverlay.animation === 'none' && captionOverlay.max_lines === 0, 'qa.json: no-caption output must use animation none and max_lines 0');
  requireValue(timeline?.caption_plan === null && timeline?.captions === null, 'timeline.json: no-caption output must not name caption files');
}
requireValue(Array.isArray(qa?.findings), 'qa.json: findings must be an array');
if (qa?.realistic_synthetic_content) requireValue(qa.youtube_ai_disclosure === 'yes', 'qa.json: realistic synthetic content requires YouTube AI disclosure');
const monetizedCommerceRoute = commerceRoute?.monetization_program && commerceRoute.monetization_program !== 'none';
if (monetizedCommerceRoute) requireValue(qa?.commercial_disclosure?.required === true, 'qa.json: selected monetization route requires commercial disclosure');
if (qa?.commercial_disclosure?.required) {
  requireValue(qa.commercial_disclosure.onscreen === true && qa.commercial_disclosure.description === true, 'qa.json: commercial disclosure must be onscreen and in description');
  requireValue(typeof qa.commercial_disclosure.text === 'string' && qa.commercial_disclosure.text.trim().length > 0, 'qa.json: disclosure text is missing');
}
if (qa?.virtual_person?.present) requireValue(qa.virtual_person.label_visible_while_present === true, 'qa.json: virtual person label must remain visible while present');

if (release) {
  const releaseSurface = PUBLICATION_SURFACES[release.platform];
  requireValue(Boolean(releaseSurface?.release_adapter_id), 'release package: platform must have a public release adapter');
  requireValue(release.platform === commerceRoute?.publication_surface, 'release package: platform must match the commerce route');
  requireValue(typeof release.channel_id === 'string' && release.channel_id.length > 0, 'release package: channel_id is required');
  const releaseText = `${release.title || ''}\n${release.description || ''}`;
  requireValue(!experiencePattern.test(releaseText), 'release package: possible unsupported first-person experience claim');
  if (commerceRoute?.monetization_program === 'coupang-partners') {
    requireValue(!coupangClickInducementPattern.test(releaseText), 'release package: Coupang click inducement is prohibited');
    requireValue(!coupangRestrictedMetricPattern.test(releaseText), 'release package: Coupang restricted performance metrics must not be disclosed');
  }
  if (run?.commerce_mode === 'creative-only') requireValue(Array.isArray(release.product_tag_ids) && release.product_tag_ids.length === 0, 'release package: creative-only route must not contain product tags');
  const video = await inspectContainedFile(release.video_path);
  requireValue(video.safe, 'release package: video missing, symlinked, or outside run root');
  if (video.safe) requireValue(await sha256(video.absolute) === release.video_sha256, 'release package: video sha256 mismatch');
  const output = run?.output_paths?.length === 1 ? await inspectContainedFile(run.output_paths[0]) : null;
  requireValue(Boolean(video.safe && output?.safe && output.real === video.real), 'run.json: output_paths must name the exact release video');
  requireValue(release.youtube_ai_disclosure === qa?.youtube_ai_disclosure, 'release package: YouTube AI disclosure differs from QA');
  requireValue(release.paid_promotion_toggle === (qa?.paid_promotion_toggle === 'required'), 'release package: paid promotion toggle differs from QA');
  if (qa?.commercial_disclosure?.required) requireValue(release.commercial_disclosure_text === qa.commercial_disclosure.text, 'release package: commercial disclosure text differs from QA');
}

if (stage === 'final') finish();
const releaseReceipt = await readJson('release/receipt.json');
requireValue(run?.status === 'released', 'release: run status must be released');
for (const gate of expectedGateKeys) requireValue(run?.gates?.[gate] === 'PASS', `release: ${gate} must be PASS`);
requireValue(release?.publication_approved === true, 'release: publication_approved must be true after exact confirmation');
requireValue(/^https?:\/\//.test(release?.published_url || ''), 'release: published_url is required');
requireValue(releaseReceipt?.schema_version === 1 && releaseReceipt?.verification === 'PASS', 'release receipt: verification must be PASS');
requireValue(releaseReceipt?.platform === release?.platform, 'release receipt: platform differs from package');
requireValue(releaseReceipt?.release_adapter_id === PUBLICATION_SURFACES[release?.platform]?.release_adapter_id, 'release receipt: adapter differs from catalog');
requireValue(releaseReceipt?.video_sha256 === release?.video_sha256, 'release receipt: video digest differs from package');
requireValue(releaseReceipt?.published_url === release?.published_url, 'release receipt: URL differs from package');
requireValue(Number.isFinite(new Date(releaseReceipt?.published_at_kst || '').getTime()), 'release receipt: published_at_kst is invalid');
requireValue(releaseReceipt?.live_title === release?.title && releaseReceipt?.live_description === release?.description, 'release receipt: live title or description differs from package');
requireValue(JSON.stringify(releaseReceipt?.live_product_tag_ids || []) === JSON.stringify(release?.product_tag_ids || []), 'release receipt: live product tags differ from package');
requireValue(Array.isArray(releaseReceipt?.live_labels), 'release receipt: live_labels must be an array');
finish();

function finish() {
  const verdict = errors.length ? 'FAIL' : 'PASS';
  console.log(JSON.stringify({ verdict, stage, root: rootReal, checked, errors, warnings }, null, 2));
  process.exit(errors.length ? 1 : 0);
}
