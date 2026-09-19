#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await fs.readFile(path.join(skillRoot, 'references', 'commerce-program-catalog.kr.json'), 'utf8'));
if (catalog.schema_version !== 1 || catalog.market !== 'KR' || !Array.isArray(catalog.programs)) throw new Error('Invalid KR commerce program catalog');
export const REQUIRED_PROGRAM_IDS = catalog.programs.map((program) => program.program_id);
export const PROGRAM_CATALOG = new Map(catalog.programs.map((program) => [program.program_id, program]));
export const PUBLICATION_SURFACES = catalog.publication_surfaces;
if (new Set(REQUIRED_PROGRAM_IDS).size !== REQUIRED_PROGRAM_IDS.length) throw new Error('Duplicate program id in KR commerce program catalog');

const providerHosts = {
  youtube: new Set(['support.google.com', 'studio.youtube.com', 'blog.youtube', 'creators.youtube.com']),
  coupang: new Set(['partners.coupang.com', 'partners.coupangcdn.com', 'developers.coupang.com', 'developers-v1.coupangcorp.com']),
  zigzag: new Set(['zigzagkr.zendesk.com', 'partnerlounge.kakaostyle.com', 'cf.res.s.zigzag.kr', 'zigzag.kr', 'www.zigzag.kr']),
  naver: new Set(['help.naver.com', 'mkt.naver.com', 'brandconnect.naver.com', 'navercorp.com', 'www.navercorp.com', 'blog.naver.com', 'm.blog.naver.com']),
  instagram: new Set(['help.instagram.com', 'instagram.com', 'www.instagram.com', 'facebook.com', 'www.facebook.com', 'developers.facebook.com', 'business.instagram.com', 'about.fb.com', 'transparency.meta.com', 'meta.com', 'www.meta.com']),
  tiktok: new Set(['support.tiktok.com', 'tiktok.com', 'www.tiktok.com', 'developers.tiktok.com', 'ads.tiktok.com', 'partner.tiktokshop.com', 'seller.tiktokglobalshop.com', 'seller.tiktokshopglobalselling.com', 'business.tiktokshop.com']),
  x: new Set(['help.x.com', 'legal.x.com', 'docs.x.com', 'developer.x.com', 'business.x.com', 'x.com', 'www.x.com'])
};
const validProgramStates = new Set(['active', 'invite-only', 'limited', 'announced', 'enrollment-closed', 'retiring', 'ended', 'not-available', 'unknown']);
const selectableProgramStates = new Set(['active', 'invite-only', 'limited']);
const validSourceKinds = new Set(['official-policy', 'official-help', 'official-terms', 'official-announcement', 'official-developer', 'account-ui']);
for (const [surfaceId, surface] of Object.entries(PUBLICATION_SURFACES || {})) {
  if (!surface || !(surface.provider === null || providerHosts[surface.provider]) || !(surface.release_adapter_id === null || typeof surface.release_adapter_id === 'string')) throw new Error(`Invalid publication surface in KR catalog: ${surfaceId}`);
}
for (const entry of PROGRAM_CATALOG.values()) {
  if (!providerHosts[entry.provider]) throw new Error(`Invalid provider in KR catalog: ${entry.program_id}`);
  if (!['platform-revenue', 'native-affiliate', 'native-commerce', 'external-affiliate', 'campaign-marketplace'].includes(entry.surface_kind)) throw new Error(`Invalid surface kind in KR catalog: ${entry.program_id}`);
  if (!['primary-or-supporting', 'research-only', 'supporting-only'].includes(entry.route_role)) throw new Error(`Invalid route role in KR catalog: ${entry.program_id}`);
  if (!Array.isArray(entry.publication_surfaces) || !entry.publication_surfaces.length || entry.publication_surfaces.some((surface) => !PUBLICATION_SURFACES[surface])) throw new Error(`Invalid publication surfaces in KR catalog: ${entry.program_id}`);
}
const maxLiveAgeMs = 7 * 24 * 60 * 60 * 1000;
const futureToleranceMs = 5 * 60 * 1000;
const xRevenueSharingRetirement = new Date('2026-09-07T00:00:00+09:00');
const xOriginalRewardsRollout = new Date('2026-09-08T00:00:00+09:00');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addUnique(set, value, label, errors) {
  if (!value || set.has(value)) errors.push(`${label}: missing or duplicate value ${String(value)}`);
  else set.add(value);
}

function validateSourceUrl(source, errors) {
  let parsed;
  try {
    parsed = new URL(source.url);
  } catch {
    errors.push(`source ${source.source_id}: invalid URL`);
    return;
  }
  if (parsed.protocol !== 'https:') errors.push(`source ${source.source_id}: URL must use https`);
  if (!providerHosts[source.provider]?.has(parsed.hostname)) errors.push(`source ${source.source_id}: host ${parsed.hostname} is not an approved official ${source.provider} host`);
  if (source.provider === 'naver' && ['blog.naver.com', 'm.blog.naver.com'].includes(parsed.hostname) && !parsed.pathname.startsWith('/brandconnect-creator/')) {
    errors.push(`source ${source.source_id}: Naver blog source must be the official brandconnect-creator account`);
  }
  const isAccountUi = source.source_kind === 'account-ui';
  if (source.provider === 'instagram' && ['instagram.com', 'www.instagram.com'].includes(parsed.hostname) && !isAccountUi) errors.push(`source ${source.source_id}: Instagram public posts are not official policy sources`);
  if (source.provider === 'instagram' && ['facebook.com', 'www.facebook.com'].includes(parsed.hostname) && !parsed.pathname.startsWith('/business/help/')) errors.push(`source ${source.source_id}: Facebook source must be under /business/help/`);
  if (source.provider === 'tiktok' && ['tiktok.com', 'www.tiktok.com'].includes(parsed.hostname) && !isAccountUi && !parsed.pathname.startsWith('/legal/') && !parsed.pathname.startsWith('/creator-academy/')) errors.push(`source ${source.source_id}: TikTok source must be legal, Creator Academy, developer, support, or account UI`);
  if (source.provider === 'tiktok' && parsed.hostname === 'ads.tiktok.com' && !parsed.pathname.startsWith('/help/article/') && !parsed.pathname.startsWith('/resources/help/article/')) errors.push(`source ${source.source_id}: TikTok Ads source must be under /help/article/ or /resources/help/article/`);
  if (source.provider === 'x' && ['x.com', 'www.x.com'].includes(parsed.hostname) && !isAccountUi) errors.push(`source ${source.source_id}: X posts are not official policy sources`);
}

function validateObservedBlock(block, label, sourceIds, freshnessMode, now, errors) {
  if (!block || !['verified', 'dynamic', 'unknown', 'not-applicable'].includes(block.status)) {
    errors.push(`${label}: invalid status`);
    return;
  }
  const refs = Array.isArray(block.source_ids) ? block.source_ids : [];
  for (const sourceId of refs) if (!sourceIds.has(sourceId)) errors.push(`${label}: unknown source id ${sourceId}`);
  if (block.status === 'verified' || block.status === 'dynamic') {
    if (typeof block.value !== 'string' || !block.value.trim()) errors.push(`${label}: observed value is required for ${block.status}`);
    const observed = parseDate(block.observed_at_kst);
    if (!observed) errors.push(`${label}: observed_at_kst is required for ${block.status}`);
    if (refs.length === 0) errors.push(`${label}: source_ids are required for ${block.status}`);
    if (observed && freshnessMode === 'live') {
      if (now - observed > maxLiveAgeMs) errors.push(`${label}: observation is older than 7 days`);
      if (observed - now > futureToleranceMs) errors.push(`${label}: observation is in the future`);
    }
  }
}

export async function validateCommerceFiles({
  platformsPath,
  routePath = null,
  receiptPath = null,
  expectedRunId = null,
  expectedCommerceMode = null,
  requireRoute = false,
  now = new Date()
}) {
  const errors = [];
  const warnings = [];
  const checked = [];
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error('Invalid validation clock');

  async function inspectEvidenceFile(evidencePath, label) {
    if (!routePath || typeof evidencePath !== 'string') {
      errors.push(`${label}: evidence path is missing`);
      return null;
    }
    const routeRoot = path.dirname(path.dirname(path.resolve(routePath)));
    const absolute = path.resolve(routeRoot, evidencePath);
    const relative = path.relative(routeRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !/^research\/screens\/[A-Za-z0-9._/-]+\.(?:png|jpg|jpeg|webp)$/u.test(relative.split(path.sep).join('/'))) {
      errors.push(`${label}: evidence must stay under research/screens and use an image extension`);
      return null;
    }
    let current = routeRoot;
    for (const segment of ['', ...relative.split(path.sep).filter(Boolean)]) {
      if (segment) current = path.join(current, segment);
      const stat = await fs.lstat(current).catch(() => null);
      if (!stat || stat.isSymbolicLink()) {
        errors.push(`${label}: evidence has a missing or symlinked path segment`);
        return null;
      }
    }
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isFile()) {
      errors.push(`${label}: evidence is not a regular file`);
      return null;
    }
    const bytes = await fs.readFile(absolute);
    checked.push(absolute);
    return { absolute, hash: sha256(bytes) };
  }

  async function loadJson(file, label, required = true) {
    if (!file) {
      if (required) errors.push(`${label}: path missing`);
      return { object: null, bytes: null, hash: null };
    }
    try {
      const bytes = await fs.readFile(file);
      const object = JSON.parse(bytes.toString('utf8'));
      checked.push(path.resolve(file));
      return { object, bytes, hash: sha256(bytes) };
    } catch (error) {
      if (required) errors.push(`${label}: ${error.code === 'ENOENT' ? 'missing' : `invalid JSON (${error.message})`}`);
      return { object: null, bytes: null, hash: null };
    }
  }

  const platformFile = await loadJson(platformsPath, 'commerce-platforms.json');
  const platforms = platformFile.object;
  const programIds = new Set();
  const programById = new Map();
  const sourceIds = new Set();
  const sourceById = new Map();

  if (platforms) {
    if (platforms.schema_version !== 1) errors.push('commerce-platforms.json: schema_version must be 1');
    if (platforms.market !== 'KR') errors.push('commerce-platforms.json: market must be KR');
    if (platforms.research_status !== 'complete') errors.push('commerce-platforms.json: research_status must be complete');
    if (!['live', 'fixture'].includes(platforms.freshness_mode)) errors.push('commerce-platforms.json: invalid freshness_mode');
    if (expectedRunId && platforms.run_id !== expectedRunId) errors.push('commerce-platforms.json: run_id mismatch');
    if (platforms.freshness_mode === 'fixture') {
      const fixtureRunId = String(platforms.run_id || expectedRunId || '');
      if (process.env.SHOPPING_SHORTS_ALLOW_FIXTURE !== '1' || !/^\d{8}-\d{4}-fixture(?:-[a-z0-9]+)*$/.test(fixtureRunId)) errors.push('commerce-platforms.json: fixture freshness requires an explicit test-only opt-in and fixture run id');
    }

    const researchedAt = parseDate(platforms.researched_at_kst);
    if (!researchedAt) errors.push('commerce-platforms.json: researched_at_kst is required');
    if (researchedAt && platforms.freshness_mode === 'live') {
      if (nowDate - researchedAt > maxLiveAgeMs) errors.push('commerce-platforms.json: research is older than 7 days');
      if (researchedAt - nowDate > futureToleranceMs) errors.push('commerce-platforms.json: research timestamp is in the future');
    }

    const declared = Array.isArray(platforms.required_program_ids) ? platforms.required_program_ids : [];
    if (new Set(declared).size !== declared.length) errors.push('commerce-platforms.json: required_program_ids contains duplicates');
    for (const requiredId of REQUIRED_PROGRAM_IDS) if (!declared.includes(requiredId)) errors.push(`commerce-platforms.json: required_program_ids missing ${requiredId}`);

    for (const source of platforms.sources || []) {
      addUnique(sourceIds, source.source_id, 'commerce source', errors);
      sourceById.set(source.source_id, source);
      if (!providerHosts[source.provider]) errors.push(`source ${source.source_id}: invalid provider`);
      if (typeof source.title !== 'string' || !source.title.trim()) errors.push(`source ${source.source_id}: title is required`);
      if (!validSourceKinds.has(source.source_kind)) errors.push(`source ${source.source_id}: invalid source_kind`);
      validateSourceUrl(source, errors);
      const retrieved = parseDate(source.retrieved_at_kst);
      if (!retrieved) errors.push(`source ${source.source_id}: invalid retrieved_at_kst`);
      if (retrieved && platforms.freshness_mode === 'live') {
        if (nowDate - retrieved > maxLiveAgeMs) errors.push(`source ${source.source_id}: older than 7 days`);
        if (retrieved - nowDate > futureToleranceMs) errors.push(`source ${source.source_id}: retrieved_at_kst is in the future`);
      }
    }
    if (sourceIds.size === 0) errors.push('commerce-platforms.json: at least one official source is required');

    for (const program of platforms.programs || []) {
      addUnique(programIds, program.program_id, 'commerce program', errors);
      programById.set(program.program_id, program);
      if (!providerHosts[program.provider]) errors.push(`program ${program.program_id}: invalid provider`);
      const catalogEntry = PROGRAM_CATALOG.get(program.program_id);
      if (catalogEntry && catalogEntry.provider !== program.provider) errors.push(`program ${program.program_id}: provider differs from KR catalog`);
      if (catalogEntry && catalogEntry.surface_kind !== program.surface_kind) errors.push(`program ${program.program_id}: surface_kind differs from KR catalog`);
      if (!['platform-revenue', 'native-affiliate', 'native-commerce', 'external-affiliate', 'campaign-marketplace'].includes(program.surface_kind)) errors.push(`program ${program.program_id}: invalid surface_kind`);
      if (!validProgramStates.has(program.program_state)) errors.push(`program ${program.program_id}: invalid program_state`);
      if (!['eligible', 'registered', 'approved', 'pending', 'not-eligible', 'unknown', 'not-applicable'].includes(program.account_status)) errors.push(`program ${program.program_id}: invalid account_status`);
      if (!(typeof program.registration_required === 'boolean' || program.registration_required === null)) errors.push(`program ${program.program_id}: registration_required must be boolean or null`);
      if (!['required', 'not-required', 'account-dependent', 'unknown'].includes(program.media_registration)) errors.push(`program ${program.program_id}: invalid media_registration`);
      if (!Array.isArray(program.eligibility) || program.eligibility.length === 0) errors.push(`program ${program.program_id}: eligibility is required`);
      for (const criterion of program.eligibility || []) {
        if (!criterion.criterion || !['verified', 'unknown', 'failed', 'not-applicable'].includes(criterion.status)) errors.push(`program ${program.program_id}: invalid eligibility criterion`);
        for (const sourceId of criterion.source_ids || []) if (!sourceIds.has(sourceId)) errors.push(`program ${program.program_id}: unknown eligibility source ${sourceId}`);
      }
      if (!program.attribution || !['verified', 'dynamic', 'unknown', 'not-applicable'].includes(program.attribution.status)) errors.push(`program ${program.program_id}: invalid attribution`);
      for (const sourceId of program.attribution?.source_ids || []) if (!sourceIds.has(sourceId)) errors.push(`program ${program.program_id}: unknown attribution source ${sourceId}`);
      if (!['verified', 'conditional', 'unknown', 'not-applicable'].includes(program.asset_terms_status)) errors.push(`program ${program.program_id}: invalid asset_terms_status`);
      if (!Array.isArray(program.source_ids) || program.source_ids.length === 0) errors.push(`program ${program.program_id}: source_ids are required`);
      for (const sourceId of program.source_ids || []) {
        if (!sourceIds.has(sourceId)) errors.push(`program ${program.program_id}: unknown source id ${sourceId}`);
        else if (sourceById.get(sourceId)?.provider !== program.provider) errors.push(`program ${program.program_id}: source ${sourceId} belongs to another provider`);
      }
      validateObservedBlock(program.commission_or_revenue, `program ${program.program_id} commission_or_revenue`, sourceIds, platforms.freshness_mode, nowDate, errors);
      validateObservedBlock(program.payout, `program ${program.program_id} payout`, sourceIds, platforms.freshness_mode, nowDate, errors);
      for (const disclosure of program.disclosures || []) {
        if (disclosure.required && (!disclosure.placement || !(disclosure.source_ids || []).length)) errors.push(`program ${program.program_id}: required disclosure needs placement and source`);
        for (const sourceId of disclosure.source_ids || []) if (!sourceIds.has(sourceId)) errors.push(`program ${program.program_id}: unknown disclosure source ${sourceId}`);
      }
      const automation = program.automation || {};
      if (!['available', 'account-gated', 'not-found', 'not-applicable', 'unknown'].includes(automation.official_api)
        || !['api', 'ui', 'external', 'account-gated', 'not-applicable', 'unknown'].includes(automation.link_generation)
        || !['api', 'ui', 'account-gated', 'not-applicable', 'unknown'].includes(automation.metrics_read)
        || !['api', 'api-audit-required', 'api-private-only', 'ui', 'unsupported', 'not-applicable', 'unknown'].includes(automation.content_upload)
        || !['allowed', 'restricted', 'not-applicable', 'unknown'].includes(automation.data_retention)) errors.push(`program ${program.program_id}: invalid automation contract`);
    }
    for (const requiredId of REQUIRED_PROGRAM_IDS) if (!programIds.has(requiredId)) errors.push(`commerce-platforms.json: programs missing ${requiredId}`);
    if (platforms.freshness_mode === 'live' && nowDate >= xRevenueSharingRetirement) {
      const state = programById.get('x-creator-revenue-sharing')?.program_state;
      if (['active', 'invite-only', 'limited', 'enrollment-closed', 'retiring'].includes(state)) errors.push('program x-creator-revenue-sharing: 2026-09-07 transition boundary passed; refresh official state');
    }
    if (platforms.freshness_mode === 'live' && nowDate >= xOriginalRewardsRollout) {
      const state = programById.get('x-original-content-rewards')?.program_state;
      if (state === 'announced') errors.push('program x-original-content-rewards: 2026-09-08 rollout boundary passed; refresh official state');
    }
  }

  const routeFile = await loadJson(routePath, 'commerce-route.json', requireRoute || Boolean(routePath));
  const route = routeFile.object;
  if (route) {
    if (route.schema_version !== 1) errors.push('commerce-route.json: schema_version must be 1');
    if (expectedRunId && route.run_id !== expectedRunId) errors.push('commerce-route.json: run_id mismatch');
    if (!parseDate(route.selected_at_kst)) errors.push('commerce-route.json: selected_at_kst is required');
    if (typeof route.selection_reason !== 'string' || !route.selection_reason.trim()) errors.push('commerce-route.json: selection_reason is required');
    if (route.platform_research_sha256 !== platformFile.hash) errors.push('commerce-route.json: platform research hash mismatch');
    if (!['commerce-ready', 'creative-only', 'blocked'].includes(route.route_status)) errors.push('commerce-route.json: route_status must be selected');
    const surfaceConfig = PUBLICATION_SURFACES[route.publication_surface];
    if (!surfaceConfig) errors.push(`commerce-route.json: unknown publication surface ${String(route.publication_surface)}`);
    for (const programId of route.program_ids || []) {
      if (!programIds.has(programId)) errors.push(`commerce-route.json: unknown program id ${programId}`);
      const catalogEntry = PROGRAM_CATALOG.get(programId);
      if (catalogEntry && !catalogEntry.publication_surfaces.includes(route.publication_surface)) errors.push(`commerce-route.json: program ${programId} is not compatible with ${route.publication_surface}`);
    }
    if (route.production_supported === true && !surfaceConfig?.release_adapter_id) errors.push(`commerce-route.json: ${route.publication_surface} has no public release adapter`);
    if (!Array.isArray(route.account_checks)) errors.push('commerce-route.json: account_checks must be an array');
    for (const check of route.account_checks || []) if (!check.check || !check.evidence || !['verified', 'unknown', 'failed', 'not-applicable'].includes(check.status)) errors.push('commerce-route.json: invalid account check');
    if (!Array.isArray(route.compliance_evidence)) errors.push('commerce-route.json: compliance_evidence must be an array');
    const complianceById = new Map();
    for (const [index, item] of (route.compliance_evidence || []).entries()) {
      const label = `commerce-route.json compliance_evidence[${index}]`;
      if (!item?.control_id || complianceById.has(item.control_id)) errors.push(`${label}: control_id is missing or duplicated`);
      else complianceById.set(item.control_id, item);
      if (typeof item?.subject !== 'string' || !item.subject.trim()) errors.push(`${label}: subject is required`);
      if (!['allowed', 'restricted', 'prohibited', 'consent-confirmed', 'not-present', 'blocked'].includes(item?.decision)) errors.push(`${label}: decision is invalid`);
      const source = sourceById.get(item?.source_id);
      if (!source) errors.push(`${label}: source_id is unknown`);
      const observed = parseDate(item?.observed_at_kst);
      if (!observed || !/\+09:00$/u.test(item.observed_at_kst)) errors.push(`${label}: observed_at_kst must be a KST timestamp`);
      if (observed && platforms?.freshness_mode === 'live') {
        if (nowDate - observed > maxLiveAgeMs) errors.push(`${label}: observation is older than 7 days`);
        if (observed - nowDate > futureToleranceMs) errors.push(`${label}: observation is in the future`);
      }
      if (item?.evidence_type !== 'screen-capture') errors.push(`${label}: evidence_type must be screen-capture`);
      if (typeof item?.reviewer_id !== 'string' || !item.reviewer_id.trim()) errors.push(`${label}: reviewer_id is required`);
      const evidenceFile = await inspectEvidenceFile(item?.evidence_path, label);
      if (!/^[a-f0-9]{64}$/u.test(item?.evidence_sha256 || '') || (evidenceFile && evidenceFile.hash !== item.evidence_sha256)) errors.push(`${label}: evidence digest mismatch`);
    }

    if (route.route_status === 'commerce-ready') {
      if (route.monetization_program === 'none') errors.push('commerce-route.json: commerce-ready route needs a monetization program');
      if (!(route.program_ids || []).includes(route.monetization_program)) errors.push('commerce-route.json: monetization_program must be listed in program_ids');
      if (!(route.account_checks || []).length) errors.push('commerce-route.json: commerce-ready route needs account checks');
      for (const check of route.account_checks || []) if (!['verified', 'not-applicable'].includes(check.status)) errors.push(`commerce-route.json: commerce-ready account check is ${check.status}`);
      for (const programId of route.program_ids || []) {
        const selectedProgram = programById.get(programId);
        const accountStatus = selectedProgram?.account_status;
        if (!['eligible', 'registered', 'approved', 'not-applicable'].includes(accountStatus)) errors.push(`commerce-route.json: selected program ${programId} has account_status ${String(accountStatus)}`);
        if (!selectableProgramStates.has(selectedProgram?.program_state)) errors.push(`commerce-route.json: selected program ${programId} has non-selectable state ${String(selectedProgram?.program_state)}`);
        if (PROGRAM_CATALOG.get(programId)?.route_role === 'research-only') errors.push(`commerce-route.json: selected program ${programId} is research-only in this harness`);
      }
      const primaryCatalogEntry = PROGRAM_CATALOG.get(route.monetization_program);
      if (primaryCatalogEntry?.route_role === 'supporting-only') errors.push(`commerce-route.json: ${route.monetization_program} is supporting-only and cannot be the primary monetization program`);
      if (!['verified', 'not-required'].includes(route.media_registration)) errors.push('commerce-route.json: commerce-ready route needs verified media registration');
      if (!['verified', 'not-applicable'].includes(route.asset_terms_status)) errors.push('commerce-route.json: commerce-ready route needs verified asset terms');
      if ((route.blocking_unknowns || []).length) errors.push('commerce-route.json: commerce-ready route cannot have blocking unknowns');
      const primaryProgram = programById.get(route.monetization_program);
      if (['native-affiliate', 'native-commerce', 'external-affiliate', 'campaign-marketplace'].includes(primaryProgram?.surface_kind) && !(route.required_disclosures || []).length) errors.push('commerce-route.json: commercial route needs disclosure requirements');
      if (route.monetization_program === 'coupang-partners') {
        if (route.media_registration !== 'verified') errors.push('commerce-route.json: Coupang route requires verified media registration');
        if (!(route.cta_constraints || []).includes('no-click-inducement')) errors.push('commerce-route.json: Coupang route requires no-click-inducement constraint');
        if (!(route.automation_constraints || []).includes('api-data-retention-restricted')) errors.push('commerce-route.json: Coupang route requires API data-retention constraint');
      }
      const commercialPrimary = ['native-affiliate', 'native-commerce', 'external-affiliate', 'campaign-marketplace'].includes(primaryProgram?.surface_kind);
      if (route.publication_surface === 'instagram-reels' && commercialPrimary
        && !(route.required_disclosures || []).includes('instagram-paid-partnership-label')) errors.push('commerce-route.json: Instagram commercial route requires instagram-paid-partnership-label');
      if (route.publication_surface === 'instagram-reels' && (route.program_ids || []).includes('instagram-shopping-tags') && route.production_supported) errors.push('commerce-route.json: Instagram Content Publishing API does not support shopping tags');
      if (route.publication_surface === 'tiktok-video' && commercialPrimary) {
        if (!(route.automation_constraints || []).includes('tiktok-commercial-content-toggle')) errors.push('commerce-route.json: TikTok commercial route requires tiktok-commercial-content-toggle');
        if (!(route.automation_constraints || []).includes('tiktok-kr-category-screen')) errors.push('commerce-route.json: TikTok commercial route requires tiktok-kr-category-screen');
        const evidence = complianceById.get('tiktok-kr-category-screen');
        if (!evidence || evidence.source_id !== 'tiktok-kr-industry-entry-policy' || evidence.decision !== 'allowed' || sourceById.get(evidence.source_id)?.provider !== 'tiktok') errors.push('commerce-route.json: TikTok commercial route requires bound allowed-category screen evidence');
      }
      if (route.publication_surface === 'x-video-post' && commercialPrimary) {
        if (!(route.program_ids || []).includes('x-paid-partnerships')) errors.push('commerce-route.json: X commercial route requires x-paid-partnerships support policy');
        if (!(route.required_disclosures || []).includes('x-paid-partnership-label')) errors.push('commerce-route.json: X commercial route requires x-paid-partnership-label');
        if (!(route.automation_constraints || []).includes('x-third-party-video-ad-screen')) errors.push('commerce-route.json: X commercial route requires x-third-party-video-ad-screen');
        const evidence = complianceById.get('x-third-party-video-ad-screen');
        if (!evidence || evidence.source_id !== 'x-paid-partnerships-policy' || !['not-present', 'consent-confirmed'].includes(evidence.decision) || sourceById.get(evidence.source_id)?.provider !== 'x') errors.push('commerce-route.json: X commercial route requires bound third-party video ad evidence');
      }
    }
    if (route.route_status === 'creative-only') {
      if (route.monetization_program !== 'none') errors.push('commerce-route.json: creative-only route must not select a monetization program');
      if (!(route.blocking_unknowns || []).length) errors.push('commerce-route.json: creative-only route must explain blocking unknowns');
    }
    if (requireRoute) {
      if (route.route_status === 'blocked') errors.push('commerce-route.json: blocked route cannot enter production');
      if (route.production_supported !== true) errors.push('commerce-route.json: selected route has no production adapter');
      if (!surfaceConfig?.release_adapter_id) errors.push(`commerce-route.json: no release adapter for ${route.publication_surface}`);
    }
    if (expectedCommerceMode && route.route_status !== expectedCommerceMode) errors.push('commerce-route.json: route_status does not match run commerce_mode');
  }

  const receiptFile = await loadJson(receiptPath, 'validation/commerce.json', requireRoute || Boolean(receiptPath));
  const receipt = receiptFile.object;
  if (receipt) {
    if (receipt.schema_version !== 1) errors.push('validation/commerce.json: schema_version must be 1');
    if (!['PENDING', 'PASS', 'FAIL'].includes(receipt.verdict)) errors.push('validation/commerce.json: invalid verdict');
    if (expectedRunId && receipt.run_id !== expectedRunId) errors.push('validation/commerce.json: run_id mismatch');
    if (expectedCommerceMode && receipt.commerce_mode !== expectedCommerceMode) errors.push('validation/commerce.json: commerce_mode mismatch');
    if (receipt.platform_research_sha256 !== platformFile.hash) errors.push('validation/commerce.json: platform research hash mismatch');
    if (receipt.route_sha256 !== routeFile.hash) errors.push('validation/commerce.json: route hash mismatch');
    if (!parseDate(receipt.checked_at_kst)) errors.push('validation/commerce.json: checked_at_kst is required');
    if (route && JSON.stringify(receipt.blocking_unknowns || []) !== JSON.stringify(route.blocking_unknowns || [])) errors.push('validation/commerce.json: blocking_unknowns differ from selected route');
    if (requireRoute && receipt.verdict !== 'PASS') errors.push('validation/commerce.json: G0 verdict must be PASS');
  }

  return {
    verdict: errors.length ? 'FAIL' : 'PASS',
    checked,
    errors,
    warnings,
    objects: { platforms, route, receipt },
    hashes: { platforms: platformFile.hash, route: routeFile.hash, receipt: receiptFile.hash }
  };
}

function usage(code = 0) {
  console.log('Usage: node scripts/validate-commerce-research.mjs --platforms <json> [--route <json> --receipt <json> --require-route] [--run-id <id>] [--commerce-mode <mode>] [--now <iso>]');
  process.exit(code);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let platformsPath;
  let routePath;
  let receiptPath;
  let expectedRunId;
  let expectedCommerceMode;
  let now = new Date();
  let requireRoute = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--platforms') platformsPath = args[++i];
    else if (args[i] === '--route') routePath = args[++i];
    else if (args[i] === '--receipt') receiptPath = args[++i];
    else if (args[i] === '--run-id') expectedRunId = args[++i];
    else if (args[i] === '--commerce-mode') expectedCommerceMode = args[++i];
    else if (args[i] === '--now') now = new Date(args[++i]);
    else if (args[i] === '--require-route') requireRoute = true;
    else if (args[i] === '--help' || args[i] === '-h') usage(0);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!platformsPath) usage(2);
  const result = await validateCommerceFiles({ platformsPath, routePath, receiptPath, expectedRunId, expectedCommerceMode, requireRoute, now });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length ? 1 : 0);
}
