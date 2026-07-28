import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AUTHORITY_AXES, DIMENSIONS, readAndValidatePreservationContract } from '../../open-design-game-ui-handoff/scripts/preservation_contract.mjs';
import { validateGenerationEvidence } from '../../open-design-game-ui-concept/scripts/open_design_generation_evidence.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function relativeInside(root, candidate, label, errors) {
  add(errors, typeof candidate === 'string' && candidate.trim(), `${label} must be a non-empty path`);
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const normalized = path.posix.normalize(candidate.replaceAll('\\', '/'));
  add(errors, !path.isAbsolute(candidate), `${label} must be relative`);
  add(errors, normalized !== '..' && !normalized.startsWith('../'), `${label} escapes the evidence root`);
  const absolute = path.resolve(root, normalized);
  add(errors, absolute.startsWith(`${path.resolve(root)}${path.sep}`), `${label} escapes the evidence root`);
  return { normalized, absolute };
}

async function fileEvidence(root, candidate, label, errors, extensions = []) {
  const resolved = relativeInside(root, candidate, label, errors);
  if (!resolved) return null;
  if (extensions.length) add(errors, extensions.includes(path.extname(resolved.normalized).toLowerCase()), `${label} must use ${extensions.join(' or ')}`);
  const stat = await fs.stat(resolved.absolute).catch(() => null);
  add(errors, stat?.isFile(), `${label} is missing: ${resolved.normalized}`);
  if (!stat?.isFile()) return null;
  const bytes = await fs.readFile(resolved.absolute);
  const extension = path.extname(resolved.normalized).toLowerCase();
  if (extension === '.webp') {
    add(errors, bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', `${label} is not a valid WebP`);
  } else if (extension === '.webm') {
    add(errors, bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), `${label} is not a valid WebM`);
  } else if (extension === '.mp4') {
    add(errors, bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp', `${label} is not a valid MP4`);
  }
  return { ...resolved, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function readJsonEvidence(root, candidate, label, errors) {
  const file = await fileEvidence(root, candidate, label, errors, ['.json']);
  if (!file) return { file: null, value: null };
  try {
    return { file, value: JSON.parse(await fs.readFile(file.absolute, 'utf8')) };
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return { file, value: null };
  }
}

function exactAuthority(actual, expected) {
  return actual && expected && AUTHORITY_AXES.every((axis) => actual[axis] === expected[axis])
    && Object.keys(actual).length === AUTHORITY_AXES.length;
}

function exactStringSet(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected)
    && actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((value) => actual.includes(value));
}

function exactObjectKeys(actual, expected) {
  return actual && typeof actual === 'object' && !Array.isArray(actual)
    && exactStringSet(Object.keys(actual), expected);
}

function resolveTakeoverScope(rawScope, preservation, errors) {
  const allSurfaces = (preservation?.surfaces || []).map((surface) => surface.id);
  if (rawScope == null) {
    return { explicit: false, surfaces: allSurfaces, outOfScope: [] };
  }

  add(errors, rawScope && typeof rawScope === 'object' && !Array.isArray(rawScope), 'takeoverScope must be an object');
  if (!rawScope || typeof rawScope !== 'object' || Array.isArray(rawScope)) {
    return { explicit: true, surfaces: allSurfaces, outOfScope: [] };
  }
  add(errors, exactObjectKeys(rawScope, ['surfaces', 'outOfScope']), 'takeoverScope must contain exactly surfaces and outOfScope');
  add(errors, Array.isArray(rawScope.surfaces) && rawScope.surfaces.length > 0, 'takeoverScope.surfaces must be a non-empty array');
  add(errors, Array.isArray(rawScope.surfaces) && new Set(rawScope.surfaces).size === rawScope.surfaces.length, 'takeoverScope.surfaces must not contain duplicates');
  for (const [index, surface] of (rawScope.surfaces || []).entries()) {
    add(errors, typeof surface === 'string' && surface.trim(), `takeoverScope.surfaces[${index}] must be a non-empty string`);
    add(errors, allSurfaces.includes(surface), `takeoverScope.surfaces[${index}] references unknown preservation surface: ${surface}`);
  }
  const selected = allSurfaces.filter((surface) => rawScope.surfaces?.includes(surface));
  const activeSurfaces = selected.length ? selected : allSurfaces;
  const expectedOutOfScope = allSurfaces.filter((surface) => !activeSurfaces.includes(surface));

  add(errors, Array.isArray(rawScope.outOfScope), 'takeoverScope.outOfScope must be an array');
  const outOfScopeRows = Array.isArray(rawScope.outOfScope) ? rawScope.outOfScope : [];
  const outOfScopeIds = [];
  for (const [index, row] of outOfScopeRows.entries()) {
    const label = `takeoverScope.outOfScope[${index}]`;
    add(errors, exactObjectKeys(row, ['surface', 'policy']), `${label} must contain exactly surface and policy`);
    add(errors, typeof row?.surface === 'string' && row.surface.trim(), `${label}.surface is required`);
    add(errors, allSurfaces.includes(row?.surface), `${label}.surface references unknown preservation surface: ${row?.surface}`);
    add(errors, !activeSurfaces.includes(row?.surface), `${label}.surface is inside takeoverScope.surfaces: ${row?.surface}`);
    add(errors, row?.policy === 'frozen-runtime-no-change', `${label}.policy must be frozen-runtime-no-change`);
    outOfScopeIds.push(row?.surface);
  }
  add(errors, new Set(outOfScopeIds).size === outOfScopeIds.length, 'takeoverScope.outOfScope must not contain duplicate surfaces');
  add(errors, exactStringSet(outOfScopeIds, expectedOutOfScope), `takeoverScope.outOfScope must exactly cover the frozen complement: ${expectedOutOfScope.join(', ') || '(none)'}`);

  return {
    explicit: true,
    surfaces: activeSurfaces,
    outOfScope: expectedOutOfScope.map((surface) => ({ surface, policy: 'frozen-runtime-no-change' })),
  };
}

function exactTakeoverScope(actual, expected) {
  if (!expected?.explicit) return actual == null;
  if (!exactObjectKeys(actual, ['surfaces', 'outOfScope'])) return false;
  if (!exactStringSet(actual.surfaces, expected.surfaces)) return false;
  if (!Array.isArray(actual.outOfScope) || actual.outOfScope.length !== expected.outOfScope.length) return false;
  const bySurface = new Map(actual.outOfScope.map((row) => [row?.surface, row]));
  return bySurface.size === actual.outOfScope.length
    && expected.outOfScope.every((row) => bySurface.get(row.surface)?.policy === row.policy);
}

function cartesian(...groups) {
  return groups.reduce((rows, group) => rows.flatMap((row) => group.map((value) => [...row, value])), [[]]);
}

function comparisonKey(row) {
  return `${row?.surface}/${row?.component}/${row?.viewport}/${row?.locale}/${row?.state}`;
}

function motionKey(row) {
  return `${row?.surface}/${row?.component}/${row?.viewport}/${row?.locale}/${row?.state}`;
}

function previewScenarioTupleKey(scenario) {
  return `${scenario?.surface}/${scenario?.locale}/${scenario?.viewport}/${scenario?.state}`;
}

function validIsoDate(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function validateDistinctEvidence(files, label, errors) {
  const present = files.filter(Boolean);
  if (present.length !== files.length) return;
  add(errors, new Set(present.map((file) => file.normalized)).size === present.length, `${label} must use distinct files`);
  add(errors, new Set(present.map((file) => file.sha256)).size === present.length, `${label} must use distinct file hashes`);
}

function registerEvidence(registry, file, binding, label, errors) {
  if (!file) return;
  for (const [kind, value] of [['path', file.normalized], ['content hash', file.sha256]]) {
    const map = kind === 'path' ? registry.paths : registry.hashes;
    const prior = map.get(value);
    add(errors, !prior || prior === binding, `${label} reuses a ${kind} already bound to ${prior}`);
    if (!prior) map.set(value, binding);
  }
}

export async function validateTakeoverEvidence(evidence, options = {}) {
  const errors = [];
  const root = path.resolve(options.root || process.cwd());
  const phase = options.phase || 'review';
  add(errors, ['review', 'approval'].includes(phase), 'phase must be review or approval');
  add(errors, evidence?.schemaVersion === 1, 'schemaVersion must be 1');
  add(errors, evidence?.approvalPolicy === 'upgrade-only', 'approvalPolicy must be upgrade-only');
  add(errors, evidence?.authorityMatrixVerified === true, 'authorityMatrixVerified must be true');
  add(errors, Array.isArray(evidence?.regressions) && evidence.regressions.length === 0, 'regressions must be empty');
  add(errors, Array.isArray(evidence?.unexplainedOmissions) && evidence.unexplainedOmissions.length === 0, 'unexplainedOmissions must be empty');

  const contractRef = relativeInside(root, evidence?.preservationContract, 'preservationContract', errors);
  let preservation = null;
  let preservationSha256 = null;
  if (contractRef) {
    try {
      ({ contract: preservation } = await readAndValidatePreservationContract(contractRef.absolute));
      preservationSha256 = createHash('sha256').update(await fs.readFile(contractRef.absolute)).digest('hex');
    } catch (error) {
      errors.push(`preservationContract is invalid: ${error.message}`);
    }
  }

  const binding = evidence?.artifactBinding;
  add(errors, binding && typeof binding === 'object', 'artifactBinding is required');
  for (const field of ['projectId', 'revisionId']) {
    add(errors, typeof binding?.[field] === 'string' && binding[field].trim(), `artifactBinding.${field} is required`);
  }
  for (const field of ['artifactSha256', 'previewManifestSha256', 'preservationContractSha256', 'generationEvidenceSha256']) {
    add(errors, SHA256_RE.test(binding?.[field] || ''), `artifactBinding.${field} must be a lowercase SHA-256`);
  }
  const hasArchiveReplay = binding?.archiveReplayManifest != null || binding?.archiveReplayManifestSha256 != null;
  if (hasArchiveReplay) {
    add(errors, typeof binding?.archiveReplayManifest === 'string' && binding.archiveReplayManifest.trim(), 'artifactBinding.archiveReplayManifest is required when archival replay is used');
    add(errors, SHA256_RE.test(binding?.archiveReplayManifestSha256 || ''), 'artifactBinding.archiveReplayManifestSha256 must be a lowercase SHA-256');
  }
  const artifactFile = await fileEvidence(root, binding?.artifact, 'artifactBinding.artifact', errors, ['.html']);
  const { file: previewManifestFile, value: previewManifest } = await readJsonEvidence(
    root,
    binding?.previewManifest,
    'artifactBinding.previewManifest',
    errors,
  );
  const { file: generationEvidenceFile, value: generationEvidence } = await readJsonEvidence(
    root,
    binding?.generationEvidence,
    'artifactBinding.generationEvidence',
    errors,
  );
  const { file: archiveReplayManifestFile, value: archiveReplayManifest } = hasArchiveReplay
    ? await readJsonEvidence(root, binding?.archiveReplayManifest, 'artifactBinding.archiveReplayManifest', errors)
    : { file: null, value: null };
  if (artifactFile) add(errors, artifactFile.sha256 === binding?.artifactSha256, 'artifactBinding.artifactSha256 does not match artifact');
  if (previewManifestFile) add(errors, previewManifestFile.sha256 === binding?.previewManifestSha256, 'artifactBinding.previewManifestSha256 does not match preview manifest');
  if (generationEvidenceFile) add(errors, generationEvidenceFile.sha256 === binding?.generationEvidenceSha256, 'artifactBinding.generationEvidenceSha256 does not match generation evidence');
  if (archiveReplayManifestFile) add(errors, archiveReplayManifestFile.sha256 === binding?.archiveReplayManifestSha256, 'artifactBinding.archiveReplayManifestSha256 does not match archival replay manifest');
  if (preservationSha256) add(errors, preservationSha256 === binding?.preservationContractSha256, 'artifactBinding.preservationContractSha256 does not match preservation contract');
  let generationResult = null;
  if (generationEvidence) {
    try {
      generationResult = validateGenerationEvidence(generationEvidence, {
        projectId: binding?.projectId,
        revisionId: binding?.revisionId,
        file: path.basename(binding?.artifact || ''),
        artifactSha256: binding?.artifactSha256,
      });
    } catch (error) {
      errors.push(`artifactBinding.generationEvidence is invalid: ${error.message}`);
    }
  }
  if (previewManifest) {
    add(errors, previewManifest.ok === true, 'artifactBinding.previewManifest must have ok === true');
    add(errors, previewManifest.scenarioSet === 'full', 'artifactBinding.previewManifest must be a full scenario capture');
    add(errors, previewManifest.projectId === binding?.projectId, 'preview manifest projectId does not match artifactBinding');
    add(errors, previewManifest.revisionId === binding?.revisionId, 'preview manifest revisionId does not match artifactBinding');
    add(errors, previewManifest.file === path.basename(binding?.artifact || ''), 'preview manifest file does not match artifactBinding.artifact');
    add(errors, previewManifest.artifactSha256 === binding?.artifactSha256, 'preview manifest artifactSha256 does not match artifactBinding');
    add(errors, previewManifest.preservationContractSha256 === binding?.preservationContractSha256, 'preview manifest preservation contract does not match artifactBinding');
    add(errors, previewManifest.generationEvidence?.sha256 === binding?.generationEvidenceSha256, 'preview manifest generation evidence does not match artifactBinding');
    add(errors, previewManifest.generationEvidence?.runId === generationResult?.runId, 'preview manifest generation run does not match generation evidence');
    add(errors, previewManifest.generationEvidence?.model === generationResult?.model, 'preview manifest generation model does not match generation evidence');
    add(errors, previewManifest.generationEvidence?.reasoning === generationResult?.reasoning, 'preview manifest generation reasoning does not match generation evidence');
    add(errors, previewManifest.fullCoverage?.scenarioCount === previewManifest.scenarios?.length, 'preview manifest full coverage count does not match scenarios');
    try {
      const previewUrl = new URL(previewManifest.previewUrl);
      const expectedPrefix = `/api/projects/${encodeURIComponent(binding?.projectId || '')}/preview/${encodeURIComponent(binding?.revisionId || '')}/`;
      add(errors, previewUrl.pathname.startsWith(expectedPrefix), 'preview manifest URL is not bound to artifactBinding project/revision');
    } catch {
      errors.push('preview manifest previewUrl is invalid');
    }
  }
  if (archiveReplayManifest) {
    add(errors, archiveReplayManifest.schemaVersion === 'darkbone-open-design-archive-replay/v1', 'archival replay manifest schema is invalid');
    add(errors, archiveReplayManifest.captureKind === 'archival-replay', 'archival replay manifest captureKind must be archival-replay');
    add(errors, archiveReplayManifest.artifactSource === 'local-exact-bytes', 'archival replay manifest must declare local-exact-bytes');
    add(errors, archiveReplayManifest.ok === true, 'archival replay manifest must have ok === true');
    add(errors, archiveReplayManifest.scenarioSet === 'contract-cartesian', 'archival replay manifest must be a contract-cartesian capture');
    add(errors, archiveReplayManifest.projectId === binding?.projectId, 'archival replay projectId does not match artifactBinding');
    add(errors, archiveReplayManifest.revisionId === binding?.revisionId, 'archival replay revisionId does not match artifactBinding');
    add(errors, archiveReplayManifest.file === path.basename(binding?.artifact || ''), 'archival replay file does not match artifactBinding.artifact');
    add(errors, archiveReplayManifest.artifactSha256 === binding?.artifactSha256, 'archival replay artifactSha256 does not match artifactBinding');
    add(errors, archiveReplayManifest.preservationContractSha256 === binding?.preservationContractSha256, 'archival replay preservation contract does not match artifactBinding');
    add(errors, archiveReplayManifest.generationEvidence?.sha256 === binding?.generationEvidenceSha256, 'archival replay generation evidence does not match artifactBinding');
    add(errors, archiveReplayManifest.generationEvidence?.runId === generationResult?.runId, 'archival replay generation run does not match generation evidence');
    add(errors, archiveReplayManifest.generationEvidence?.model === generationResult?.model, 'archival replay generation model does not match generation evidence');
    add(errors, archiveReplayManifest.generationEvidence?.reasoning === generationResult?.reasoning, 'archival replay generation reasoning does not match generation evidence');
    add(errors, archiveReplayManifest.sourcePreviewManifestSha256 === binding?.previewManifestSha256, 'archival replay source preview manifest does not match artifactBinding.previewManifestSha256');
    add(errors, archiveReplayManifest.previewUrl === previewManifest?.previewUrl, 'archival replay source preview URL does not match the immutable preview manifest');
    add(errors, archiveReplayManifest.fullCoverage?.scenarioCount === archiveReplayManifest.scenarios?.length, 'archival replay coverage count does not match scenarios');
  }
  const previewScenarios = new Map();
  const immutableScenarioTuples = new Set();
  for (const [index, scenario] of (previewManifest?.scenarios || []).entries()) {
    const manifestLabel = 'preview manifest';
    add(errors, typeof scenario?.id === 'string' && scenario.id.trim(), `${manifestLabel} scenarios[${index}].id is required`);
    add(errors, !previewScenarios.has(scenario?.id), `${manifestLabel} scenario id is duplicated across bound preview evidence: ${scenario?.id}`);
    add(errors, scenario?.ok === true, `${manifestLabel} scenarios[${index}] must have ok === true`);
    add(errors, SHA256_RE.test(scenario?.sha256 || ''), `${manifestLabel} scenarios[${index}] is missing screenshot SHA-256`);
    immutableScenarioTuples.add(previewScenarioTupleKey(scenario));
    previewScenarios.set(scenario?.id, { scenario, manifest: previewManifest, source: manifestLabel });
  }
  const replayScenarioTuples = new Set();
  for (const [index, scenario] of (archiveReplayManifest?.scenarios || []).entries()) {
    const manifestLabel = 'archival replay manifest';
    const tuple = previewScenarioTupleKey(scenario);
    add(errors, typeof scenario?.id === 'string' && scenario.id.trim(), `${manifestLabel} scenarios[${index}].id is required`);
    add(errors, !previewScenarios.has(scenario?.id), `${manifestLabel} scenario id is duplicated across bound preview evidence: ${scenario?.id}`);
    add(errors, !immutableScenarioTuples.has(tuple), `${manifestLabel} scenario duplicates immutable preview tuple: ${tuple}`);
    add(errors, !replayScenarioTuples.has(tuple), `${manifestLabel} scenario tuple is duplicated: ${tuple}`);
    add(errors, scenario?.ok === true, `${manifestLabel} scenarios[${index}] must have ok === true`);
    add(errors, SHA256_RE.test(scenario?.sha256 || ''), `${manifestLabel} scenarios[${index}] is missing screenshot SHA-256`);
    replayScenarioTuples.add(tuple);
    previewScenarios.set(scenario?.id, { scenario, manifest: archiveReplayManifest, source: manifestLabel });
  }
  add(errors, previewScenarios.size > 0, 'preview manifest scenarios must not be empty');

  const takeoverScope = resolveTakeoverScope(evidence?.takeoverScope, preservation, errors);
  const scopedSurfaceIds = new Set(takeoverScope.surfaces);

  const allComponentsByKey = new Map();
  const componentsByKey = new Map();
  const allComponents = [];
  const changedComponents = [];
  const surfacesById = new Map((preservation?.surfaces || []).filter((surface) => scopedSurfaceIds.has(surface.id)).map((surface) => [surface.id, surface]));
  for (const surface of preservation?.surfaces || []) {
    for (const component of surface.components || []) {
      const key = `${surface.id}/${component.id}`;
      allComponentsByKey.set(key, component);
      if (!scopedSurfaceIds.has(surface.id)) continue;
      componentsByKey.set(key, component);
      allComponents.push({ key, surface, component });
      if (['upgrade', 'redesign'].includes(component.treatment)) changedComponents.push({ key, surface, component });
    }
  }

  const matrix = Array.isArray(evidence?.authorityMatrix) ? evidence.authorityMatrix : [];
  add(errors, matrix.length > 0, 'authorityMatrix must not be empty');
  const matrixByKey = new Map();
  for (const [index, row] of matrix.entries()) {
    const key = `${row?.surface}/${row?.component}`;
    add(errors, !matrixByKey.has(key), `authorityMatrix[${index}] duplicates ${key}`);
    matrixByKey.set(key, row);
    const component = componentsByKey.get(key);
    add(errors, !!component, allComponentsByKey.has(key)
      ? `authorityMatrix[${index}] references component outside takeoverScope: ${key}`
      : `authorityMatrix[${index}] references unknown component ${key}`);
    if (!component) continue;
    add(errors, row.treatment === component.treatment, `authorityMatrix treatment drifted for ${key}`);
    add(errors, exactAuthority(row.authority, component.authority), `authorityMatrix authority drifted for ${key}`);
    add(errors, exactStringSet(row.changeScope || [], component.changeScope || []), `authorityMatrix changeScope drifted for ${key}`);
    add(errors, row.standaloneMotionPolicy === component.standaloneMotionPolicy, `authorityMatrix standaloneMotionPolicy drifted for ${key}`);
    add(errors, row.runtimeMotionImplementation === component.runtimeMotionImplementation, `authorityMatrix runtimeMotionImplementation drifted for ${key}`);
    add(errors, exactStringSet(row.runtimeOwnerAnchors || [], component.runtimeOwnerAnchors || []), `authorityMatrix runtimeOwnerAnchors drifted for ${key}`);
  }
  for (const key of componentsByKey.keys()) add(errors, matrixByKey.has(key), `authorityMatrix is missing ${key}`);

  const continuity = Array.isArray(evidence?.runtimeContinuity) ? evidence.runtimeContinuity : [];
  const continuityByKey = new Map();
  for (const [index, row] of continuity.entries()) {
    const label = `runtimeContinuity[${index}]`;
    const key = `${row?.surface}/${row?.component}`;
    add(errors, !continuityByKey.has(key), `${label} duplicates ${key}`);
    continuityByKey.set(key, row);
    const component = componentsByKey.get(key);
    add(errors, !!component, allComponentsByKey.has(key)
      ? `${label} references component outside takeoverScope: ${key}`
      : `${label} references unknown component ${key}`);
    if (!component) continue;
    const frozenAxes = AUTHORITY_AXES.filter((axis) => component.authority[axis] === 'runtime');
    add(errors, exactStringSet(row.frozenAxes, frozenAxes), `${label}.frozenAxes must exactly match runtime-owned axes for ${key}`);
    add(errors, ['unchanged', 'moved-intact'].includes(row.frozenAxesAction), `${label}.frozenAxesAction must be unchanged or moved-intact`);
    add(errors, row.standaloneMotionPolicy === component.standaloneMotionPolicy, `${label}.standaloneMotionPolicy drifted for ${key}`);
    add(errors, row.motionImplementation === component.runtimeMotionImplementation, `${label}.motionImplementation drifted for ${key}`);
    add(errors, exactStringSet(row.runtimeOwnerAnchors, component.runtimeOwnerAnchors), `${label}.runtimeOwnerAnchors drifted for ${key}`);
  }
  for (const { key } of changedComponents) add(errors, continuityByKey.has(key), `missing runtime continuity proof for changed component ${key}`);

  const expectedComparisonKeys = new Set();
  for (const { surface, component } of allComponents) {
    const plan = surface.comparisonPlan;
    for (const [viewport, locale, state] of cartesian(plan.viewports, plan.locales, plan.states)) {
      expectedComparisonKeys.add(`${surface.id}/${component.id}/${viewport}/${locale}/${state}`);
    }
  }
  const comparisons = Array.isArray(evidence?.comparisons) ? evidence.comparisons : [];
  add(errors, comparisons.length > 0, 'comparisons must not be empty');
  const comparisonKeys = new Set();
  const staticEvidenceRegistry = { paths: new Map(), hashes: new Map() };
  const resolvedComparisons = [];
  for (const [index, comparison] of comparisons.entries()) {
    const label = `comparisons[${index}]`;
    const key = comparisonKey(comparison);
    add(errors, !comparisonKeys.has(key), `${label} duplicates ${key}`);
    comparisonKeys.add(key);
    add(errors, expectedComparisonKeys.has(key), `${label} is outside the preservation comparison matrix: ${key}`);
    for (const field of ['surface', 'component', 'viewport', 'locale', 'state', 'standaloneScenarioId']) {
      add(errors, typeof comparison?.[field] === 'string' && comparison[field].trim(), `${label}.${field} is required`);
    }
    const current = await fileEvidence(root, comparison?.current, `${label}.current`, errors, ['.webp']);
    const standalone = await fileEvidence(root, comparison?.standalone, `${label}.standalone`, errors, ['.webp']);
    const integrated = await fileEvidence(root, comparison?.integrated, `${label}.integrated`, errors, ['.webp']);
    validateDistinctEvidence([current, standalone, integrated], `${label} current/standalone/integrated`, errors);
    const proofContext = `${comparison?.surface}/${comparison?.viewport}/${comparison?.locale}/${comparison?.state}`;
    registerEvidence(staticEvidenceRegistry, current, `${proofContext}/current`, `${label}.current`, errors);
    registerEvidence(staticEvidenceRegistry, standalone, `${proofContext}/standalone`, `${label}.standalone`, errors);
    registerEvidence(staticEvidenceRegistry, integrated, `${proofContext}/integrated`, `${label}.integrated`, errors);
    add(errors, comparison?.verdicts && typeof comparison.verdicts === 'object', `${label}.verdicts is required`);
    add(errors, comparison?.verdicts && Object.keys(comparison.verdicts).length === DIMENSIONS.length, `${label}.verdicts must contain exactly seven dimensions`);
    for (const dimension of DIMENSIONS) add(errors, ['preserved', 'upgraded'].includes(comparison?.verdicts?.[dimension]), `${label}.verdicts.${dimension} must be preserved or upgraded`);

    const scenarioRecord = previewScenarios.get(comparison?.standaloneScenarioId);
    add(errors, !!scenarioRecord, `${label}.standaloneScenarioId is absent from the bound preview evidence`);
    let standaloneEvidenceSource = null;
    if (scenarioRecord) {
      const { scenario, manifest, source } = scenarioRecord;
      standaloneEvidenceSource = source;
      const viewport = manifest.viewports?.find((item) => item.id === scenario.viewport);
      add(errors, scenario.ok === true, `${label} standalone scenario must have ok === true`);
      add(errors, scenario.surface === comparison.surface, `${label} standalone scenario surface does not match`);
      add(errors, scenario.locale === comparison.locale, `${label} standalone scenario locale does not match`);
      add(errors, scenario.state === comparison.state, `${label} standalone scenario state does not match`);
      add(errors, viewport && `${viewport.width}x${viewport.height}` === comparison.viewport, `${label} standalone scenario viewport does not match`);
      add(errors, SHA256_RE.test(scenario.sha256 || ''), `${label} standalone scenario is missing screenshot SHA-256`);
      if (standalone) add(errors, standalone.sha256 === scenario.sha256, `${label} standalone screenshot does not match bound preview scenario`);
    }
    resolvedComparisons.push({
      key,
      standaloneScenarioId: comparison?.standaloneScenarioId,
      standaloneEvidenceSource,
      current: current && { path: current.normalized, sha256: current.sha256 },
      standalone: standalone && { path: standalone.normalized, sha256: standalone.sha256 },
      integrated: integrated && { path: integrated.normalized, sha256: integrated.sha256 },
      verdicts: comparison?.verdicts,
    });
  }
  for (const key of expectedComparisonKeys) add(errors, comparisonKeys.has(key), `missing rendered comparison for ${key}`);

  const expectedMotionKeys = new Set();
  for (const surface of (preservation?.surfaces || []).filter((item) => item.motionCritical && scopedSurfaceIds.has(item.id))) {
    const plan = surface.comparisonPlan;
    for (const component of surface.components || []) {
      for (const [viewport, locale, state] of cartesian(plan.viewports, plan.locales, plan.motionStates)) {
        expectedMotionKeys.add(`${surface.id}/${component.id}/${viewport}/${locale}/${state}`);
      }
    }
  }
  const motionComparisons = Array.isArray(evidence?.motionComparisons) ? evidence.motionComparisons : [];
  const motionKeys = new Set();
  const motionEvidenceRegistry = { paths: new Map(), hashes: new Map() };
  const resolvedMotionComparisons = [];
  for (const [index, comparison] of motionComparisons.entries()) {
    const label = `motionComparisons[${index}]`;
    const key = motionKey(comparison);
    add(errors, !motionKeys.has(key), `${label} duplicates ${key}`);
    motionKeys.add(key);
    add(errors, expectedMotionKeys.has(key), `${label} is outside the preservation motion matrix: ${key}`);
    for (const field of ['surface', 'component', 'viewport', 'locale', 'state']) {
      add(errors, typeof comparison?.[field] === 'string' && comparison[field].trim(), `${label}.${field} is required`);
    }
    const componentKey = `${comparison?.surface}/${comparison?.component}`;
    add(errors, componentsByKey.has(componentKey), `${label}.component must be a declared component in the same surface`);
    const currentVideo = await fileEvidence(root, comparison?.currentVideo, `${label}.currentVideo`, errors, ['.webm', '.mp4']);
    const standaloneVideo = await fileEvidence(root, comparison?.standaloneVideo, `${label}.standaloneVideo`, errors, ['.webm', '.mp4']);
    const integratedVideo = await fileEvidence(root, comparison?.integratedVideo, `${label}.integratedVideo`, errors, ['.webm', '.mp4']);
    validateDistinctEvidence([currentVideo, standaloneVideo, integratedVideo], `${label} current/standalone/integrated videos`, errors);
    const motionContext = `${comparison?.surface}/${comparison?.viewport}/${comparison?.locale}/${comparison?.state}`;
    registerEvidence(motionEvidenceRegistry, currentVideo, `${motionContext}/current-video`, `${label}.currentVideo`, errors);
    registerEvidence(motionEvidenceRegistry, standaloneVideo, `${motionContext}/standalone-video`, `${label}.standaloneVideo`, errors);
    registerEvidence(motionEvidenceRegistry, integratedVideo, `${motionContext}/integrated-video`, `${label}.integratedVideo`, errors);
    add(errors, ['preserved', 'upgraded'].includes(comparison?.verdict), `${label}.verdict must be preserved or upgraded`);
    const expectedBeats = surfacesById.get(comparison?.surface)?.comparisonPlan?.motionComparisons || [];
    const triples = comparison?.keyframeTriples || [];
    add(errors, exactStringSet(triples.map((triple) => triple?.beat), expectedBeats), `${label}.keyframeTriples must exactly cover required beats: ${expectedBeats.join(', ')}`);
    const resolvedTriples = [];
    for (const [tripleIndex, triple] of triples.entries()) {
      const current = await fileEvidence(root, triple?.current, `${label}.keyframeTriples[${tripleIndex}].current`, errors, ['.webp']);
      const standalone = await fileEvidence(root, triple?.standalone, `${label}.keyframeTriples[${tripleIndex}].standalone`, errors, ['.webp']);
      const integrated = await fileEvidence(root, triple?.integrated, `${label}.keyframeTriples[${tripleIndex}].integrated`, errors, ['.webp']);
      validateDistinctEvidence([current, standalone, integrated], `${label}.keyframeTriples[${tripleIndex}] current/standalone/integrated`, errors);
      const beatContext = `${motionContext}/${triple?.beat}`;
      registerEvidence(motionEvidenceRegistry, current, `${beatContext}/current-frame`, `${label}.keyframeTriples[${tripleIndex}].current`, errors);
      registerEvidence(motionEvidenceRegistry, standalone, `${beatContext}/standalone-frame`, `${label}.keyframeTriples[${tripleIndex}].standalone`, errors);
      registerEvidence(motionEvidenceRegistry, integrated, `${beatContext}/integrated-frame`, `${label}.keyframeTriples[${tripleIndex}].integrated`, errors);
      resolvedTriples.push({
        beat: triple?.beat,
        current: current && { path: current.normalized, sha256: current.sha256 },
        standalone: standalone && { path: standalone.normalized, sha256: standalone.sha256 },
        integrated: integrated && { path: integrated.normalized, sha256: integrated.sha256 },
      });
    }
    resolvedMotionComparisons.push({
      key,
      component: comparison?.component,
      currentVideo: currentVideo && { path: currentVideo.normalized, sha256: currentVideo.sha256 },
      standaloneVideo: standaloneVideo && { path: standaloneVideo.normalized, sha256: standaloneVideo.sha256 },
      integratedVideo: integratedVideo && { path: integratedVideo.normalized, sha256: integratedVideo.sha256 },
      verdict: comparison?.verdict,
      keyframeTriples: resolvedTriples,
    });
  }
  for (const key of expectedMotionKeys) add(errors, motionKeys.has(key), `missing motion comparison for ${key}`);

  const reviewEvidenceSha256 = sha256Json({
    schemaVersion: evidence?.schemaVersion,
    approvalPolicy: evidence?.approvalPolicy,
    preservationContract: contractRef && { path: contractRef.normalized, sha256: preservationSha256 },
    artifactBinding: {
      projectId: binding?.projectId,
      revisionId: binding?.revisionId,
      artifact: artifactFile && { path: artifactFile.normalized, sha256: artifactFile.sha256 },
      previewManifest: previewManifestFile && { path: previewManifestFile.normalized, sha256: previewManifestFile.sha256 },
      archiveReplayManifest: archiveReplayManifestFile && { path: archiveReplayManifestFile.normalized, sha256: archiveReplayManifestFile.sha256 },
      generationEvidence: generationEvidenceFile && { path: generationEvidenceFile.normalized, sha256: generationEvidenceFile.sha256 },
      preservationContractSha256: binding?.preservationContractSha256,
    },
    takeoverScope: takeoverScope.explicit ? {
      surfaces: takeoverScope.surfaces,
      outOfScope: takeoverScope.outOfScope,
    } : null,
    authorityMatrixVerified: evidence?.authorityMatrixVerified,
    authorityMatrix: [...matrix].sort((a, b) => `${a?.surface}/${a?.component}`.localeCompare(`${b?.surface}/${b?.component}`)),
    runtimeContinuity: [...continuity].sort((a, b) => `${a?.surface}/${a?.component}`.localeCompare(`${b?.surface}/${b?.component}`)),
    comparisons: resolvedComparisons.sort((a, b) => a.key.localeCompare(b.key)),
    motionComparisons: resolvedMotionComparisons.sort((a, b) => a.key.localeCompare(b.key)),
    regressions: evidence?.regressions,
    unexplainedOmissions: evidence?.unexplainedOmissions,
  });

  add(errors, evidence?.ownerApproval?.required === true, 'ownerApproval.required must be true');
  if (phase === 'approval') {
    add(errors, evidence?.ownerApproval?.status === 'approved', 'ownerApproval.status must be approved for approval phase');
    add(errors, SHA256_RE.test(evidence?.ownerApproval?.evidenceSha256 || ''), 'ownerApproval.evidenceSha256 must be a lowercase SHA-256');
    const { file: approvalFile, value: approval } = await readJsonEvidence(root, evidence?.ownerApproval?.evidence, 'ownerApproval.evidence', errors);
    if (approvalFile) add(errors, approvalFile.sha256 === evidence?.ownerApproval?.evidenceSha256, 'ownerApproval.evidenceSha256 does not match approval evidence');
    if (approval) {
      add(errors, approval.schemaVersion === 1, 'owner approval schemaVersion must be 1');
      add(errors, approval.decision === 'approved', 'owner approval decision must be approved');
      add(errors, typeof approval.approvedBy === 'string' && approval.approvedBy.trim(), 'owner approval approvedBy is required');
      add(errors, validIsoDate(approval.approvedAt), 'owner approval approvedAt must be an ISO date');
      add(errors, typeof approval.source === 'string' && approval.source.trim(), 'owner approval source is required');
      add(errors, SHA256_RE.test(approval.reviewEvidenceSha256 || ''), 'owner approval reviewEvidenceSha256 must be a lowercase SHA-256');
      add(errors, approval.reviewEvidenceSha256 === reviewEvidenceSha256, 'owner approval reviewEvidenceSha256 does not match current takeover review evidence');
      add(errors, exactTakeoverScope(approval.takeoverScope, takeoverScope), 'owner approval takeoverScope does not match takeover evidence');
      for (const field of ['projectId', 'revisionId', 'artifactSha256', 'previewManifestSha256', 'preservationContractSha256', 'generationEvidenceSha256', 'archiveReplayManifestSha256']) {
        add(errors, approval.artifactBinding?.[field] === binding?.[field], `owner approval artifactBinding.${field} does not match takeover evidence`);
      }
    }
  } else {
    add(errors, ['pending', 'approved'].includes(evidence?.ownerApproval?.status), 'ownerApproval.status must be pending or approved');
  }

  if (errors.length) throw new Error(`Invalid takeover evidence:\n- ${errors.join('\n- ')}`);
  return {
    ok: true,
    phase,
    comparisons: comparisons.length,
    expectedComparisons: expectedComparisonKeys.size,
    motionComparisons: motionComparisons.length,
    expectedMotionComparisons: expectedMotionKeys.size,
    reviewEvidenceSha256,
    projectId: binding.projectId,
    revisionId: binding.revisionId,
    takeoverScope: takeoverScope.explicit ? {
      surfaces: takeoverScope.surfaces,
      outOfScope: takeoverScope.outOfScope,
    } : null,
  };
}

export async function readAndValidateTakeoverEvidence(evidencePath, options = {}) {
  const absolute = path.resolve(evidencePath);
  const evidence = JSON.parse(await fs.readFile(absolute, 'utf8'));
  const result = await validateTakeoverEvidence(evidence, { ...options, root: options.root || path.dirname(absolute) });
  return { evidence, result, path: absolute };
}
