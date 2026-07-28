import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DIMENSIONS = ['identity', 'composition', 'information', 'interaction', 'motion', 'material', 'readability'];
export const AUTHORITY_AXES = ['layout', 'identity', 'motion', 'interaction', 'copy', 'data'];
export const AUTHORITIES = new Set(['runtime', 'open-design', 'shared']);
export const TREATMENTS = new Set(['preserve', 'upgrade', 'redesign', 'untouched']);
export const STANDALONE_MOTION_POLICIES = new Set(['placeholder-only-preserve-runtime', 'authoritative-upgrade-spec']);
export const RUNTIME_MOTION_IMPLEMENTATION_POLICIES = new Set(['reuse-existing-runtime', 'replace-only-after-upgrade-proof']);

const REQUIRED_COMPONENTS_BY_SURFACE = {
  title: ['hall-character-scene', 'brand-lockup', 'command-area', 'save-cloud-status', 'settings-data-safety', 'home-transition', 'desktop-quit'],
  home: ['character-stage', 'level-talent-mask-emblems', 'deploy-medallion'],
  talent: ['wedjat-tree', 'investment-reveal'],
  fusion: ['fusion-reveal-stage'],
  victory: ['victory-reveal-stage'],
};
const REQUIRED_MOTION_CRITICAL_SURFACES = new Set(['home', 'talent', 'fusion', 'victory']);
const TITLE_PROFILE = 'steam-title';
const TITLE_STATES = [
  'title-first-run', 'title-returning', 'title-cloud-checking', 'title-offline', 'title-route-loading',
  'title-settings', 'title-credits', 'title-reset-confirm', 'title-cloud-conflict', 'title-quit-confirm',
];
const TITLE_VIEWPORTS = ['852x393', '1180x820', '1280x800', '1440x900', '1920x1080'];

function hasExactValues(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim());
}

function uniqueStrings(value) {
  return nonEmptyStrings(value) && new Set(value).size === value.length;
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function safeRelative(candidate, label, errors) {
  add(errors, typeof candidate === 'string' && candidate.trim(), `${label} must be a non-empty path`);
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const value = candidate.trim().replaceAll('\\', '/');
  add(errors, !path.isAbsolute(value), `${label} must be relative: ${value}`);
  const normalized = path.posix.normalize(value);
  add(errors, normalized !== '..' && !normalized.startsWith('../'), `${label} escapes the handoff: ${value}`);
  return normalized;
}

async function assertEvidenceFile(root, candidate, label, errors, extensions) {
  const relative = safeRelative(candidate, label, errors);
  if (!relative || !root) return relative ? { relative, absolute: null, sha256: null } : null;
  if (extensions?.length) {
    add(errors, extensions.includes(path.extname(relative).toLowerCase()), `${label} must use ${extensions.join(' or ')}: ${relative}`);
  }
  const absolute = path.resolve(root, relative);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  add(errors, absolute.startsWith(rootPrefix), `${label} escapes the handoff root: ${relative}`);
  const stat = await fs.stat(absolute).catch(() => null);
  add(errors, stat?.isFile(), `${label} is missing from the handoff: ${relative}`);
  if (!stat?.isFile()) return { relative, absolute, sha256: null };
  const bytes = await fs.readFile(absolute);
  const extension = path.extname(relative).toLowerCase();
  if (extension === '.webp') {
    add(errors, bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', `${label} is not a valid WebP: ${relative}`);
  } else if (extension === '.webm') {
    add(errors, bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), `${label} is not a valid WebM: ${relative}`);
  } else if (extension === '.mp4') {
    add(errors, bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp', `${label} is not a valid MP4: ${relative}`);
  }
  return { relative, absolute, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function validateAuthority(component, label, errors) {
  add(errors, component?.authority && typeof component.authority === 'object', `${label}.authority is required`);
  if (!component?.authority || typeof component.authority !== 'object') return;
  add(errors, hasExactValues(Object.keys(component.authority), AUTHORITY_AXES), `${label}.authority must contain exactly: ${AUTHORITY_AXES.join(', ')}`);
  for (const axis of AUTHORITY_AXES) {
    add(errors, AUTHORITIES.has(component.authority[axis]), `${label}.authority.${axis} is invalid`);
  }
  add(errors, component.authority.data === 'runtime', `${label}.authority.data must remain runtime-owned`);

  const runtimeOwnsMotion = component.authority.motion === 'runtime';
  const expectedStandaloneMotionPolicy = runtimeOwnsMotion
    ? 'placeholder-only-preserve-runtime'
    : 'authoritative-upgrade-spec';
  const expectedRuntimeMotionImplementation = runtimeOwnsMotion
    ? 'reuse-existing-runtime'
    : 'replace-only-after-upgrade-proof';
  add(errors, STANDALONE_MOTION_POLICIES.has(component.standaloneMotionPolicy), `${label}.standaloneMotionPolicy is invalid`);
  add(errors, component.standaloneMotionPolicy === expectedStandaloneMotionPolicy, `${label}.standaloneMotionPolicy must be ${expectedStandaloneMotionPolicy} when motion authority is ${component.authority.motion}`);
  add(errors, RUNTIME_MOTION_IMPLEMENTATION_POLICIES.has(component.runtimeMotionImplementation), `${label}.runtimeMotionImplementation is invalid`);
  add(errors, component.runtimeMotionImplementation === expectedRuntimeMotionImplementation, `${label}.runtimeMotionImplementation must be ${expectedRuntimeMotionImplementation} when motion authority is ${component.authority.motion}`);
  add(errors, nonEmptyStrings(component.runtimeOwnerAnchors), `${label}.runtimeOwnerAnchors must not be empty`);

  const externalAxes = AUTHORITY_AXES.filter((axis) => component.authority[axis] !== 'runtime');
  if (externalAxes.length) {
    add(errors, typeof component.changeBrief === 'string' && component.changeBrief.trim(), `${label}.changeBrief is required for non-runtime authority`);
    add(errors, nonEmptyStrings(component.proofRequired), `${label}.proofRequired is required for non-runtime authority`);
    add(errors, nonEmptyStrings(component.changeScope), `${label}.changeScope is required for non-runtime authority`);
    add(errors, hasExactValues(component.changeScope, externalAxes), `${label}.changeScope must exactly match non-runtime authority axes: ${externalAxes.join(', ')}`);
  }
  if (component.treatment === 'upgrade' || component.treatment === 'redesign') {
    add(errors, externalAxes.length > 0, `${label} treatment=${component.treatment} requires at least one explicitly assigned non-runtime axis`);
  }
  if (component.treatment === 'preserve' || component.treatment === 'untouched') {
    add(errors, externalAxes.length === 0, `${label} treatment=${component.treatment} requires runtime authority on every axis`);
    add(errors, component.changeScope == null || component.changeScope.length === 0, `${label} treatment=${component.treatment} cannot declare a changeScope`);
  }
  if (component.changeScope) {
    add(errors, nonEmptyStrings(component.changeScope), `${label}.changeScope must be a non-empty string array`);
    const allowed = new Set(component.changeScope || []);
    for (const axis of AUTHORITY_AXES) {
      if (!allowed.has(axis)) add(errors, component.authority[axis] === 'runtime', `${label}.authority.${axis} must stay runtime because it is outside changeScope`);
    }
  }
}

export async function validatePreservationContract(contract, options = {}) {
  const errors = [];
  const root = options.root ? path.resolve(options.root) : null;
  add(errors, contract && typeof contract === 'object', 'preservation contract must be an object');
  if (!contract || typeof contract !== 'object') throw new Error(errors.join('\n'));

  add(errors, contract.schemaVersion === 1, 'schemaVersion must be 1');
  add(errors, contract.contractProfile == null || contract.contractProfile === TITLE_PROFILE, `contractProfile must be ${TITLE_PROFILE} when provided`);
  add(errors, contract.approvalPolicy === 'upgrade-only', 'approvalPolicy must be upgrade-only');
  add(errors, hasExactValues(contract.dimensions, DIMENSIONS), `dimensions must contain exactly: ${DIMENSIONS.join(', ')}`);
  add(errors, hasExactValues(contract.authorityAxes, AUTHORITY_AXES), `authorityAxes must contain exactly: ${AUTHORITY_AXES.join(', ')}`);
  add(errors, contract.defaultAuthority === 'runtime', 'defaultAuthority must be runtime');
  add(errors, contract.omissionPolicy === 'unspecified-preserve-runtime', 'omissionPolicy must be unspecified-preserve-runtime');
  add(errors, contract.ownerApprovalRequired === true, 'ownerApprovalRequired must be true');
  add(errors, Array.isArray(contract.surfaces) && contract.surfaces.length > 0, 'surfaces must not be empty');

  const ids = new Set();
  for (const [surfaceIndex, surface] of (contract.surfaces || []).entries()) {
    const label = `surfaces[${surfaceIndex}]`;
    const newTitleSurface = contract.contractProfile === TITLE_PROFILE
      && surface?.id === 'title'
      && surface?.baselinePolicy === 'new-surface-no-runtime';
    add(errors, typeof surface?.id === 'string' && surface.id.trim(), `${label}.id is required`);
    add(errors, !ids.has(surface?.id), `${label}.id is duplicated: ${surface?.id}`);
    ids.add(surface?.id);
    add(errors, TREATMENTS.has(surface?.treatment), `${label}.treatment is invalid`);
    add(errors, typeof surface?.motionCritical === 'boolean', `${label}.motionCritical must be boolean`);
    if (REQUIRED_MOTION_CRITICAL_SURFACES.has(surface?.id)) {
      add(errors, surface?.motionCritical === true, `${label}.motionCritical must be true for protected surface ${surface?.id}`);
    }
    if (surface?.id === 'title') {
      add(errors, contract.contractProfile === TITLE_PROFILE, `${label} title surface requires contractProfile=${TITLE_PROFILE}`);
      add(errors, newTitleSurface, `${label}.baselinePolicy must be new-surface-no-runtime for the title profile`);
      add(errors, surface?.motionCritical === false, `${label}.motionCritical must be false until a real runtime title baseline exists`);
    } else {
      add(errors, surface?.baselinePolicy == null || surface.baselinePolicy === 'existing-runtime', `${label}.baselinePolicy is invalid for an existing runtime surface`);
    }
    add(errors, Array.isArray(surface?.ownerFiles) && surface.ownerFiles.length > 0, `${label}.ownerFiles must not be empty`);
    for (const [ownerIndex, owner] of (surface?.ownerFiles || []).entries()) {
      await assertEvidenceFile(root, owner?.path, `${label}.ownerFiles[${ownerIndex}].path`, errors);
      add(errors, nonEmptyStrings(owner?.anchors), `${label}.ownerFiles[${ownerIndex}].anchors must not be empty`);
    }

    const minimumStills = newTitleSurface ? 0 : (['upgrade', 'redesign'].includes(surface?.treatment) ? 2 : 1);
    add(errors, Array.isArray(surface?.baselineStills) && surface.baselineStills.length >= minimumStills, `${label}.baselineStills requires at least ${minimumStills}`);
    if (newTitleSurface) {
      add(errors, (surface.baselineStills || []).length === 0, `${label}.baselineStills must be empty because #title has no runtime implementation`);
      add(errors, Array.isArray(surface?.contextStills) && surface.contextStills.length >= 2, `${label}.contextStills requires at least 2 real Home references`);
      const contextPaths = new Set();
      const contextHashes = new Set();
      for (const [stillIndex, still] of (surface?.contextStills || []).entries()) {
        const file = await assertEvidenceFile(root, still?.path, `${label}.contextStills[${stillIndex}].path`, errors, ['.webp']);
        if (file?.relative) {
          add(errors, !contextPaths.has(file.relative), `${label}.contextStills reuses path: ${file.relative}`);
          contextPaths.add(file.relative);
        }
        if (file?.sha256) {
          add(errors, !contextHashes.has(file.sha256), `${label}.contextStills reuses content hash: ${file.sha256}`);
          contextHashes.add(file.sha256);
        }
        add(errors, still?.sourceSurface === 'home', `${label}.contextStills[${stillIndex}].sourceSurface must be home`);
        add(errors, typeof still?.purpose === 'string' && still.purpose.trim(), `${label}.contextStills[${stillIndex}].purpose is required`);
      }
    }
    const baselineFiles = [];
    const baselinePaths = new Set();
    const baselineHashes = new Set();
    const baselineTuples = new Set();
    for (const [stillIndex, still] of (surface?.baselineStills || []).entries()) {
      const file = await assertEvidenceFile(root, still?.path, `${label}.baselineStills[${stillIndex}].path`, errors, ['.webp']);
      baselineFiles.push({ still, file });
      if (file?.relative) {
        add(errors, !baselinePaths.has(file.relative), `${label}.baselineStills reuses path: ${file.relative}`);
        baselinePaths.add(file.relative);
      }
      if (file?.sha256) {
        add(errors, !baselineHashes.has(file.sha256), `${label}.baselineStills reuses content hash: ${file.sha256}`);
        baselineHashes.add(file.sha256);
      }
      for (const field of ['viewport', 'locale', 'state']) add(errors, typeof still?.[field] === 'string' && still[field].trim(), `${label}.baselineStills[${stillIndex}].${field} is required`);
      const tuple = `${still?.viewport}/${still?.locale}/${still?.state}`;
      add(errors, !baselineTuples.has(tuple), `${label}.baselineStills duplicates proof context: ${tuple}`);
      baselineTuples.add(tuple);
    }

    if (surface?.motionCritical) {
      const videos = surface.motionEvidence?.videos;
      const keyframes = surface.motionEvidence?.keyframes;
      add(errors, Array.isArray(videos) && videos.length > 0, `${label}.motionEvidence.videos must not be empty`);
      add(errors, Array.isArray(keyframes) && keyframes.length >= 3, `${label}.motionEvidence.keyframes requires at least 3 beats`);
      const motionPaths = new Set();
      const motionHashes = new Set();
      for (const [videoIndex, video] of (videos || []).entries()) {
        const file = await assertEvidenceFile(root, video?.path, `${label}.motionEvidence.videos[${videoIndex}].path`, errors, ['.webm', '.mp4']);
        if (file?.relative) {
          add(errors, !motionPaths.has(file.relative), `${label}.motionEvidence reuses path: ${file.relative}`);
          motionPaths.add(file.relative);
        }
        if (file?.sha256) {
          add(errors, !motionHashes.has(file.sha256), `${label}.motionEvidence reuses content hash: ${file.sha256}`);
          motionHashes.add(file.sha256);
        }
        add(errors, typeof video?.viewport === 'string' && video.viewport.trim(), `${label}.motionEvidence.videos[${videoIndex}].viewport is required`);
        add(errors, typeof video?.locale === 'string' && video.locale.trim(), `${label}.motionEvidence.videos[${videoIndex}].locale is required`);
        add(errors, typeof video?.state === 'string' && video.state.trim(), `${label}.motionEvidence.videos[${videoIndex}].state is required`);
      }
      const beats = new Set();
      for (const [frameIndex, frame] of (keyframes || []).entries()) {
        const file = await assertEvidenceFile(root, frame?.path, `${label}.motionEvidence.keyframes[${frameIndex}].path`, errors, ['.webp']);
        if (file?.relative) {
          add(errors, !motionPaths.has(file.relative), `${label}.motionEvidence reuses path: ${file.relative}`);
          motionPaths.add(file.relative);
        }
        if (file?.sha256) {
          add(errors, !motionHashes.has(file.sha256), `${label}.motionEvidence reuses content hash: ${file.sha256}`);
          motionHashes.add(file.sha256);
        }
        add(errors, Number.isFinite(frame?.timestampMs) && frame.timestampMs >= 0, `${label}.motionEvidence.keyframes[${frameIndex}].timestampMs must be >= 0`);
        add(errors, typeof frame?.beat === 'string' && frame.beat.trim(), `${label}.motionEvidence.keyframes[${frameIndex}].beat is required`);
        add(errors, !beats.has(frame?.beat), `${label}.motionEvidence.keyframes beat is duplicated: ${frame?.beat}`);
        beats.add(frame?.beat);
      }
    }

    add(errors, Array.isArray(surface?.signatures) && surface.signatures.length > 0, `${label}.signatures must not be empty`);
    for (const [signatureIndex, signature] of (surface?.signatures || []).entries()) {
      const signatureLabel = `${label}.signatures[${signatureIndex}]`;
      add(errors, typeof signature?.id === 'string' && signature.id.trim(), `${signatureLabel}.id is required`);
      add(errors, nonEmptyStrings(signature?.dimensions) && signature.dimensions.every((item) => DIMENSIONS.includes(item)), `${signatureLabel}.dimensions are invalid`);
      add(errors, nonEmptyStrings(signature?.mustRetain), `${signatureLabel}.mustRetain must not be empty`);
      add(errors, nonEmptyStrings(signature?.forbiddenRegressions), `${signatureLabel}.forbiddenRegressions must not be empty`);
      add(errors, nonEmptyStrings(signature?.evidence), `${signatureLabel}.evidence must not be empty`);
      add(errors, nonEmptyStrings(signature?.sourceAnchors), `${signatureLabel}.sourceAnchors must not be empty`);
      for (const [evidenceIndex, evidence] of (signature?.evidence || []).entries()) {
        await assertEvidenceFile(root, evidence, `${signatureLabel}.evidence[${evidenceIndex}]`, errors);
      }
    }

    add(errors, Array.isArray(surface?.components) && surface.components.length > 0, `${label}.components must not be empty`);
    const componentIds = new Set();
    for (const [componentIndex, component] of (surface?.components || []).entries()) {
      const componentLabel = `${label}.components[${componentIndex}]`;
      add(errors, typeof component?.id === 'string' && component.id.trim(), `${componentLabel}.id is required`);
      add(errors, !componentIds.has(component?.id), `${componentLabel}.id is duplicated: ${component?.id}`);
      componentIds.add(component?.id);
      add(errors, TREATMENTS.has(component?.treatment), `${componentLabel}.treatment is invalid`);
      validateAuthority(component, componentLabel, errors);
    }
    for (const requiredComponent of REQUIRED_COMPONENTS_BY_SURFACE[surface?.id] || []) {
      add(errors, componentIds.has(requiredComponent), `${label}.components is missing protected runtime component: ${requiredComponent}`);
    }

    add(errors, nonEmptyStrings(surface?.untouchedDetails), `${label}.untouchedDetails must not be empty`);
    const plan = surface?.comparisonPlan;
    add(errors, plan && typeof plan === 'object', `${label}.comparisonPlan is required`);
    add(errors, uniqueStrings(plan?.viewports), `${label}.comparisonPlan.viewports must be unique non-empty strings`);
    add(errors, uniqueStrings(plan?.locales), `${label}.comparisonPlan.locales must be unique non-empty strings`);
    add(errors, uniqueStrings(plan?.states), `${label}.comparisonPlan.states must be unique non-empty strings`);
    add(errors, uniqueStrings(plan?.stillComparisons), `${label}.comparisonPlan.stillComparisons must be unique non-empty strings`);
    const baselineViewports = new Set(baselineFiles.map(({ still }) => still?.viewport).filter(Boolean));
    const baselineLocales = new Set(baselineFiles.map(({ still }) => still?.locale).filter(Boolean));
    const baselineStates = new Set(baselineFiles.map(({ still }) => still?.state).filter(Boolean));
    for (const { still } of baselineFiles) {
      add(errors, plan?.viewports?.includes(still?.viewport), `${label}.baselineStills viewport is outside comparisonPlan: ${still?.viewport}`);
      add(errors, plan?.locales?.includes(still?.locale), `${label}.baselineStills locale is outside comparisonPlan: ${still?.locale}`);
      add(errors, plan?.states?.includes(still?.state), `${label}.baselineStills state is outside comparisonPlan: ${still?.state}`);
    }
    if (!newTitleSurface) {
      for (const viewport of plan?.viewports || []) add(errors, baselineViewports.has(viewport), `${label}.baselineStills is missing comparison viewport: ${viewport}`);
      for (const locale of plan?.locales || []) add(errors, baselineLocales.has(locale), `${label}.baselineStills is missing comparison locale: ${locale}`);
    }
    if (!newTitleSurface && ['upgrade', 'redesign'].includes(surface?.treatment)) {
      add(errors, baselineStates.size >= Math.min(2, plan?.states?.length || 0), `${label}.baselineStills must cover at least two distinct comparison states`);
    }
    if (newTitleSurface) {
      add(errors, hasExactValues(plan?.viewports, TITLE_VIEWPORTS), `${label}.comparisonPlan.viewports must contain exactly: ${TITLE_VIEWPORTS.join(', ')}`);
      add(errors, hasExactValues(plan?.locales, ['zh', 'en']), `${label}.comparisonPlan.locales must contain exactly zh, en`);
      add(errors, hasExactValues(plan?.states, TITLE_STATES), `${label}.comparisonPlan.states must contain every required title state`);
    }
    if (surface?.motionCritical) {
      add(errors, uniqueStrings(plan?.motionStates), `${label}.comparisonPlan.motionStates must be unique non-empty strings`);
      add(errors, uniqueStrings(plan?.motionComparisons) && plan.motionComparisons.length >= 3, `${label}.comparisonPlan.motionComparisons requires at least 3 unique beats`);
      for (const [videoIndex, video] of (surface.motionEvidence?.videos || []).entries()) {
        add(errors, plan?.viewports?.includes(video?.viewport), `${label}.motionEvidence.videos[${videoIndex}].viewport is outside comparisonPlan`);
        add(errors, plan?.locales?.includes(video?.locale), `${label}.motionEvidence.videos[${videoIndex}].locale is outside comparisonPlan`);
        add(errors, plan?.motionStates?.includes(video?.state), `${label}.motionEvidence.videos[${videoIndex}].state is outside comparisonPlan.motionStates`);
      }
    } else {
      add(errors, plan?.motionStates == null || plan.motionStates.length === 0, `${label}.comparisonPlan.motionStates must be empty for a non-motion-critical surface`);
      add(errors, Array.isArray(plan?.motionComparisons) && plan.motionComparisons.length === 0, `${label}.comparisonPlan.motionComparisons must be empty for a non-motion-critical surface`);
    }
    for (const expectedLocale of options.expectedLocales || []) {
      add(errors, plan?.locales?.includes(expectedLocale), `${label}.comparisonPlan.locales is missing expected locale: ${expectedLocale}`);
    }
  }

  for (const expected of options.expectedSurfaces || []) add(errors, ids.has(expected), `missing expected preservation surface: ${expected}`);
  if (errors.length) throw new Error(`Invalid preservation contract:\n- ${errors.join('\n- ')}`);
  return { ok: true, surfaces: ids.size, motionCritical: (contract.surfaces || []).filter((surface) => surface.motionCritical).length };
}

export async function readAndValidatePreservationContract(contractPath, options = {}) {
  const absolute = path.resolve(contractPath);
  const contract = JSON.parse(await fs.readFile(absolute, 'utf8'));
  const result = await validatePreservationContract(contract, { ...options, root: options.root || path.dirname(absolute) });
  return { contract, result, path: absolute };
}
