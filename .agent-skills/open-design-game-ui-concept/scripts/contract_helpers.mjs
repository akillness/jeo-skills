import path from 'node:path';

export const VIEWPORTS = [
  { id: 'phone-landscape', label: 'Phone landscape 852x393', width: 852, height: 393, input: 'touch' },
  { id: 'ipad-landscape', label: 'iPad landscape 1180x820', width: 1180, height: 820, input: 'touch-trackpad' },
  { id: 'desktop-1440', label: 'Desktop 1440x900', width: 1440, height: 900, input: 'mouse-keyboard' },
  { id: 'steam-1920', label: 'Steam desktop 1920x1080', width: 1920, height: 1080, input: 'controller-mouse-keyboard' },
];

export const SCREENS = ['home', 'mapselect', 'talent', 'masks', 'fusion', 'victory'];

export const TITLE_VIEWPORTS = [
  { id: 'phone-landscape', label: 'Phone landscape 852x393', width: 852, height: 393, input: 'touch' },
  { id: 'ipad-landscape', label: 'iPad landscape 1180x820', width: 1180, height: 820, input: 'touch-trackpad' },
  { id: 'steam-deck', label: 'Steam Deck 1280x800', width: 1280, height: 800, input: 'controller-touch' },
  { id: 'desktop-1440', label: 'Desktop 1440x900', width: 1440, height: 900, input: 'mouse-keyboard' },
  { id: 'steam-1920', label: 'Steam desktop 1920x1080', width: 1920, height: 1080, input: 'controller-mouse-keyboard' },
];

export const TITLE_SCREENS = ['title'];

export const TITLE_STATES = [
  'title-first-run',
  'title-returning',
  'title-cloud-checking',
  'title-offline',
  'title-route-loading',
  'title-settings',
  'title-credits',
  'title-reset-confirm',
  'title-cloud-conflict',
  'title-quit-confirm',
];

export const DEFAULT_STATES = {
  home: 'home-overview',
  mapselect: 'mapselect-overview',
  talent: 'talent-overview',
  masks: 'masks-overview',
  fusion: 'fusion-empty',
  victory: 'victory-reveal',
};

export const SCREEN_CONTRACTS = {
  home: {
    rootSelector: '[data-od-id="home-screen"]',
    title: { zh: '承魂者整备厅', en: 'Soulbearer Command' },
    actionSelectors: ['[data-od-id="home-deploy-command"]', '[data-action="deploy"]'],
    actionMarker: { zh: '出战', en: 'Deploy' },
  },
  mapselect: {
    rootSelector: '[data-od-id="mapselect-screen"]',
    title: { zh: '冥途征程', en: 'Journey Through the Duat' },
    actionSelectors: ['[data-od-id="map-enter-command"]'],
    actionMarker: { zh: '进入', en: 'Enter' },
  },
  talent: {
    rootSelector: '[data-od-id="talent-screen"]',
    title: { zh: '影矢永世天赋', en: 'Shadow Mastery' },
    actionSelectors: ['[data-od-id="talent-invest-command"]'],
    actionMarker: { zh: '投入', en: 'Invest' },
  },
  masks: {
    rootSelector: '[data-od-id="masks-screen"]',
    title: { zh: '神祇魂面阁', en: 'Deity Reliquary' },
    actionSelectors: ['[data-od-id="mask-equip-command"]'],
    actionMarker: { zh: '装备', en: 'Equip' },
  },
  fusion: {
    rootSelector: '[data-od-id="fusion-screen"], [data-od-id="fusion-result-choice-screen"]',
    title: { zh: '融魂祭坛', en: 'Fusion Altar' },
    actionSelectors: ['[data-od-id="fusion-commit-command"]'],
    actionMarker: { zh: '融魂', en: 'Fuse' },
  },
  victory: {
    rootSelector: '[data-od-id="victory-screen"]',
    title: { zh: '通关结算', en: 'Victory Settlement' },
    actionSelectors: ['[data-od-id="victory-report-command"]'],
    actionMarker: { zh: '查看战报', en: 'View Report' },
  },
};

export const TITLE_SCREEN_CONTRACTS = {
  title: {
    rootSelector: '[data-od-id="title-screen"]',
    title: { zh: '冥骨魂殿', en: 'Bone Halls' },
    actionSelectors: ['[data-od-id="title-enter-hall-command"]'],
    actionMarker: { zh: '进入骨殿', en: 'Enter Hall' },
  },
};

export const STATE_CONTRACTS = {
  'home-overview': { marker: { zh: '影矢者', en: 'Shadow Marksman' } },
  'home-loadout': {
    selector: '[data-od-id="home-loadout-pool"]',
    marker: { zh: '配装展开', en: 'Loadout Open' },
  },
  'home-locked': {
    selector: '[data-od-id="home-locked-hero-message"]',
    marker: { zh: '魂火尚未回应', en: 'Soulfire Has Not Answered' },
  },
  'home-loading': {
    selector: '[data-od-id="home-loading-state"]',
    marker: { zh: '唤醒', en: 'Awakening' },
    actionSelectors: ['[data-od-id="home-loading-state"]'],
    actionMarker: { zh: '唤醒', en: 'Awakening' },
  },
  'mapselect-overview': { marker: { zh: '沉没冥城', en: 'Sunken Necropolis' } },
  'mapselect-detail': { marker: { zh: '边境前哨', en: 'Border Outpost' } },
  'mapselect-locked-tier': {
    selector: '.difficulty-button.locked[aria-disabled="true"]',
    marker: { zh: '梦魇', en: 'Nightmare' },
  },
  'mapselect-loading': {
    selector: '[data-od-id="map-loading-state"]',
    marker: { zh: '准备远征', en: 'Preparing Run' },
    actionSelectors: ['[data-od-id="map-loading-state"]'],
    actionMarker: { zh: '准备远征', en: 'Preparing Run' },
  },
  'talent-overview': { marker: { zh: '影矢之核', en: 'Shadow Core' } },
  'talent-node-detail': { marker: { zh: '穿魂会心', en: 'Soulpiercer Critical' } },
  'talent-insufficient': {
    selector: '.talent-cost.insufficient',
    marker: { zh: '仅余 1', en: '1 left' },
  },
  'talent-invested': { marker: { zh: '魂脉已贯通', en: 'Meridian linked' } },
  'talent-reset-confirm': {
    selector: '[data-od-id="talent-reset-modal"]',
    marker: { zh: '重置影矢天赋', en: 'Reset Shadow Mastery' },
    actionSelectors: ['[data-action="confirm-talent-reset"]'],
    actionMarker: { zh: '确认重置', en: 'Reset' },
  },
  'masks-overview': { marker: { zh: '哈皮', en: 'Hapi' } },
  'masks-detail': { marker: { zh: '阿努比斯', en: 'Anubis' } },
  'masks-detail-level-gate': {
    selector: '[data-od-id="mask-rank-gate"]',
    marker: { zh: '需魂阶', en: 'Requires Rank' },
  },
  'masks-full-loadout': { marker: { zh: '日轮 · 称量 · 王权', en: 'Sun · Weighing · Kingship' } },
  'fusion-empty': { marker: { zh: '等待献祭', en: 'Awaiting Sacrifice' } },
  'fusion-ready-lock': { marker: { zh: '因果链已建立', en: 'Causal Chain Ready' } },
  'fusion-ready-three': { marker: { zh: '因果链已建立', en: 'Causal Chain Ready' } },
  'fusion-insufficient-seals': {
    selector: '.rank-gate',
    marker: { zh: '锁印不足', en: 'Not enough Seals' },
  },
  'fusion-confirm': {
    selector: '[data-od-id="fusion-confirm-modal"]',
    marker: { zh: '确认闭合祭坛', en: 'Commit the Fusion' },
    actionSelectors: ['[data-action="confirm-fusion"]'],
    actionMarker: { zh: '确认融魂', en: 'Fuse' },
  },
  'fusion-result-choice': {
    selector: '[data-od-id="fusion-fresh-affix-choices"]',
    marker: { zh: '为新生魂面选择', en: 'Choose one fresh affix' },
    actionSelectors: ['[data-od-id="fusion-confirm-fresh-command"]'],
    actionMarker: { zh: '刻入', en: 'Inscribe' },
  },
  'fusion-complete': {
    selector: '[data-od-id="fusion-return-reliquary-command"]',
    marker: { zh: '魂脉已闭合', en: 'Meridian Closed' },
    actionSelectors: ['[data-od-id="fusion-return-reliquary-command"]'],
    actionMarker: { zh: '归入魂面阁', en: 'Archive' },
  },
  'victory-reveal': {
    selector: '[data-od-id="victory-verdict"]',
    marker: { zh: '通关', en: 'Victory' },
    actionSelectors: ['[data-od-id="victory-skip-command"]'],
    actionMarker: { zh: '跳过揭示', en: 'Skip Reveal' },
  },
  'victory-reward-land': {
    selector: '[data-od-id="victory-rewards"]',
    marker: { zh: '本程所得', en: 'Spoils Recovered' },
    actionSelectors: ['[data-od-id="victory-skip-command"]'],
    actionMarker: { zh: '跳过揭示', en: 'Skip Reveal' },
  },
  'victory-growth': {
    selector: '[data-od-id="victory-growth"]',
    marker: { zh: '魂阶成长', en: 'Rank Growth' },
    actionSelectors: ['[data-od-id="victory-skip-command"]'],
    actionMarker: { zh: '跳过揭示', en: 'Skip Reveal' },
  },
  'victory-ready-dashboard': {
    selector: '[data-od-id="victory-report-command"]',
    marker: { zh: '揭示完成', en: 'Reveal Complete' },
  },
  'victory-dashboard': {
    selector: '[data-od-id="victory-dashboard"]',
    marker: { zh: '战报', en: 'Battle Report' },
    actionSelectors: ['[data-od-id="victory-home-command"]'],
    actionMarker: { zh: '返回主菜单', en: 'Return Home' },
  },
};

export const TITLE_STATE_CONTRACTS = {
  'title-first-run': {
    selector: '[data-od-state="title-first-run"]',
    marker: { zh: '进度将先保存在此设备', en: 'Progress will be saved on this device' },
  },
  'title-returning': {
    selector: '[data-od-state="title-returning"]',
    marker: { zh: '本机进度', en: 'Progress on this device' },
  },
  'title-cloud-checking': {
    selector: '[data-od-state="title-cloud-checking"]',
    marker: { zh: '正在检查云端安全', en: 'Checking cloud safety' },
  },
  'title-offline': {
    selector: '[data-od-state="title-offline"]',
    marker: { zh: '离线 · 本机进度仍安全', en: 'Offline · device progress remains safe' },
  },
  'title-route-loading': {
    selector: '[data-od-state="title-route-loading"]',
    marker: { zh: '正在开启魂殿', en: 'Opening the hall' },
  },
  'title-settings': {
    selector: '[data-od-id="title-settings-panel"]',
    marker: { zh: '设置', en: 'Settings' },
  },
  'title-credits': {
    selector: '[data-od-id="title-credits-panel"]',
    marker: { zh: '人员名单', en: 'Credits' },
  },
  'title-reset-confirm': {
    selector: '[data-od-id="title-reset-confirm"]',
    marker: { zh: '重置本机进度？', en: 'Reset device progression?' },
    actionSelectors: ['[data-od-safe-default="cancel"]'],
    actionMarker: { zh: '取消', en: 'Cancel' },
  },
  'title-cloud-conflict': {
    selector: '[data-od-id="title-cloud-conflict"]',
    marker: { zh: '选择要保留的进度', en: 'Choose the progress to keep' },
    actionSelectors: ['[data-od-safe-default="cancel"]'],
    actionMarker: { zh: '取消', en: 'Cancel' },
  },
  'title-quit-confirm': {
    selector: '[data-od-id="title-quit-confirm"]',
    marker: { zh: '退出冥骨魂殿？', en: 'Quit Bone Halls?' },
    actionSelectors: ['[data-od-safe-default="cancel"]'],
    actionMarker: { zh: '取消', en: 'Cancel' },
  },
};

const CONTRACT_PROFILES = {
  'meta-ui': {
    id: 'meta-ui',
    artifactFile: 'darkbone-steam-meta-ui-concept.html',
    viewports: VIEWPORTS,
    screens: SCREENS,
    preservationSurfaces: SCREENS,
    defaultStates: DEFAULT_STATES,
    screenContracts: SCREEN_CONTRACTS,
    stateContracts: STATE_CONTRACTS,
  },
  'steam-title': {
    id: 'steam-title',
    artifactFile: 'bone-halls-steam-title-concept.html',
    viewports: TITLE_VIEWPORTS,
    screens: TITLE_SCREENS,
    preservationSurfaces: [...TITLE_SCREENS, ...SCREENS],
    defaultStates: { title: 'title-first-run' },
    screenContracts: TITLE_SCREEN_CONTRACTS,
    stateContracts: TITLE_STATE_CONTRACTS,
  },
};

export function contractProfileFor(id = 'meta-ui') {
  const profile = CONTRACT_PROFILES[id || 'meta-ui'];
  if (!profile) throw new Error(`Unknown contract profile: ${id}`);
  return profile;
}

const PHONE_STATES = [
  ['home', 'home-locked'],
  ['mapselect', 'mapselect-locked-tier'],
  ['talent', 'talent-insufficient'],
  ['masks', 'masks-detail-level-gate'],
  ['fusion', 'fusion-ready-lock'],
  ['fusion', 'fusion-insufficient-seals'],
  ['victory', 'victory-reward-land'],
];

const DESKTOP_STATES = [
  ['home', 'home-loadout'],
  ['mapselect', 'mapselect-detail'],
  ['talent', 'talent-node-detail'],
  ['talent', 'talent-invested'],
  ['talent', 'talent-reset-confirm'],
  ['masks', 'masks-detail'],
  ['masks', 'masks-full-loadout'],
  ['fusion', 'fusion-confirm'],
  ['fusion', 'fusion-result-choice'],
  ['fusion', 'fusion-complete'],
  ['victory', 'victory-growth'],
  ['victory', 'victory-ready-dashboard'],
  ['victory', 'victory-dashboard'],
];

function scenario(group, locale, viewport, screen, state, extra = {}) {
  return { group, locale, viewport, screen, state, reducedMotion: false, probes: [], ...extra };
}

function attachInputProbes(spec) {
  const probes = [];
  if (spec.contractProfile === 'steam-title') {
    if (spec.locale === 'en' && spec.viewport.id === 'desktop-1440' && ['title-first-run', 'title-returning'].includes(spec.state)) probes.push('title-keyboard-navigation');
    if (spec.locale === 'en' && spec.viewport.id === 'steam-deck' && ['title-first-run', 'title-returning'].includes(spec.state)) probes.push('title-controller-navigation');
    if (spec.locale === 'en' && spec.viewport.id === 'desktop-1440' && spec.state === 'title-settings') probes.push('back-navigation');
    if (spec.locale === 'en' && spec.viewport.id === 'desktop-1440' && spec.state === 'title-reset-confirm') probes.push('title-safe-default', 'modal-focus-trap');
    if (spec.locale === 'en' && spec.viewport.id === 'steam-deck' && spec.state === 'title-cloud-conflict') probes.push('title-safe-default', 'modal-focus-trap');
    if (spec.locale === 'en' && spec.viewport.id === 'steam-deck' && spec.state === 'title-quit-confirm') probes.push('title-safe-default', 'modal-focus-trap', 'title-quit-capability');
    if (spec.locale === 'zh' && spec.viewport.id === 'phone-landscape' && ['title-first-run', 'title-returning'].includes(spec.state)) probes.push('title-quit-capability');
    if (spec.locale === 'zh' && spec.viewport.id === 'desktop-1440' && spec.state === 'title-cloud-checking') probes.push('title-local-first-frame');
    if (spec.locale === 'en' && spec.viewport.id === 'phone-landscape' && spec.state === 'title-route-loading') probes.push('title-local-first-frame');
    return { ...spec, probes };
  }
  if (spec.group === 'matrix' && spec.locale === 'en' && spec.viewport.id === 'desktop-1440' && spec.screen === 'home') probes.push('keyboard-focus');
  if (spec.group === 'matrix' && spec.locale === 'en' && spec.viewport.id === 'desktop-1440' && spec.screen === 'masks') probes.push('hover');
  if (spec.group === 'matrix' && spec.locale === 'en' && spec.viewport.id === 'steam-1920' && spec.screen === 'mapselect') probes.push('gamepad-focus');
  if (spec.group === 'desktop-states' && spec.locale === 'zh' && spec.state === 'fusion-confirm') probes.push('back-navigation');
  if (spec.group === 'desktop-states' && spec.locale === 'en' && spec.state === 'talent-reset-confirm') probes.push('modal-focus-trap');
  return { ...spec, probes };
}

export function buildPreviewScenarios({
  locales = ['zh', 'en'],
  viewportIds,
  screens,
  scenarioSet = 'full',
  contractProfile = 'meta-ui',
} = {}) {
  const profile = contractProfileFor(contractProfile);
  viewportIds ||= profile.viewports.map((viewport) => viewport.id);
  screens ||= [...profile.screens];
  const selectedViewports = profile.viewports.filter((viewport) => viewportIds.includes(viewport.id));
  const selected = (spec) => locales.includes(spec.locale)
    && viewportIds.includes(spec.viewport.id)
    && screens.includes(spec.screen);
  const scenarios = [];
  if (profile.id === 'steam-title') {
    const states = scenarioSet === 'full' ? TITLE_STATES : [profile.defaultStates.title];
    if (!['defaults', 'full'].includes(scenarioSet)) throw new Error(`Unknown scenario set: ${scenarioSet}`);
    for (const locale of locales) {
      for (const viewport of selectedViewports) {
        for (const state of states) {
          scenarios.push(scenario('title-matrix', locale, viewport, 'title', state, {
            contractProfile: profile.id,
            capabilities: { desktopQuit: state === 'title-quit-confirm' },
          }));
        }
      }
    }
    if (scenarioSet === 'full') {
      for (const locale of ['zh', 'en']) {
        const steamDeck = profile.viewports.find((viewport) => viewport.id === 'steam-deck');
        scenarios.push(scenario('reduced-motion', locale, steamDeck, 'title', 'title-returning', {
          contractProfile: profile.id,
          reducedMotion: true,
          capabilities: { desktopQuit: false },
        }));
      }
    }
    const deduped = new Map();
    for (const spec of scenarios.filter(selected).map(attachInputProbes)) {
      const key = `${spec.group}/${spec.locale}/${spec.viewport.id}/${spec.screen}/${spec.state}/${spec.reducedMotion}`;
      deduped.set(key, spec);
    }
    return [...deduped.values()];
  }
  for (const locale of locales) {
    for (const viewport of selectedViewports) {
      for (const screen of screens) {
        scenarios.push(scenario('matrix', locale, viewport, screen, profile.defaultStates[screen], { contractProfile: profile.id }));
      }
    }
  }
  if (scenarioSet === 'full') {
    const phone = VIEWPORTS.find((viewport) => viewport.id === 'phone-landscape');
    const desktop = VIEWPORTS.find((viewport) => viewport.id === 'desktop-1440');
    const steam = VIEWPORTS.find((viewport) => viewport.id === 'steam-1920');
    for (const locale of ['zh', 'en']) {
      for (const [screen, state] of PHONE_STATES) scenarios.push(scenario('phone-states', locale, phone, screen, state));
      for (const [screen, state] of DESKTOP_STATES) scenarios.push(scenario('desktop-states', locale, desktop, screen, state));
    }
    for (const locale of ['zh', 'en']) {
      scenarios.push(scenario('loading-states', locale, phone, 'mapselect', 'mapselect-loading'));
      scenarios.push(scenario('loading-states', locale, desktop, 'home', 'home-loading'));
    }
    scenarios.push(scenario('reduced-motion', 'zh', steam, 'home', 'home-overview', { reducedMotion: true }));
    scenarios.push(scenario('reduced-motion', 'en', steam, 'fusion', 'fusion-ready-lock', { reducedMotion: true }));
    scenarios.push(scenario('reduced-motion', 'zh', steam, 'victory', 'victory-ready-dashboard', { reducedMotion: true }));
  } else if (scenarioSet !== 'defaults') {
    throw new Error(`Unknown scenario set: ${scenarioSet}`);
  }
  const deduped = new Map();
  for (const spec of scenarios.filter(selected).map(attachInputProbes)) {
    const key = `${spec.group}/${spec.locale}/${spec.viewport.id}/${spec.screen}/${spec.state}/${spec.reducedMotion}`;
    deduped.set(key, spec);
  }
  return [...deduped.values()];
}

export function buildContractCartesianScenarios({
  contract,
  locales = ['zh', 'en'],
  viewportIds,
  screens,
  contractProfile = 'meta-ui',
} = {}) {
  const profile = contractProfileFor(contractProfile);
  viewportIds ||= profile.viewports.map((viewport) => viewport.id);
  screens ||= [...profile.screens];
  const surfaces = new Map((contract?.surfaces || []).map((surface) => [surface.id, surface]));
  const scenarios = [];
  for (const screen of screens) {
    const surface = surfaces.get(screen);
    if (!surface) continue;
    for (const locale of locales) {
      for (const viewportId of viewportIds) {
        const viewport = profile.viewports.find((item) => item.id === viewportId);
        if (!viewport) continue;
        for (const state of surface.comparisonPlan?.states || []) {
          scenarios.push(scenario('contract-cartesian', locale, viewport, screen, state, {
            contractProfile: profile.id,
            capabilities: { desktopQuit: state === 'title-quit-confirm' },
          }));
        }
      }
    }
  }
  return scenarios.map(attachInputProbes);
}

function exactStringSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((value) => actual.includes(value));
}

export function viewportIdForSize(size, contractProfile = 'meta-ui') {
  return contractProfileFor(contractProfile).viewports.find((viewport) => `${viewport.width}x${viewport.height}` === size)?.id || null;
}

export function scenarioTupleKey(spec) {
  const surface = spec?.screen || spec?.surface || '';
  const viewport = typeof spec?.viewport === 'string' ? spec.viewport : spec?.viewport?.id || '';
  return `${surface}/${spec?.locale || ''}/${viewport}/${spec?.state || ''}`;
}

export function validateFullPreviewCoverage({ scenarios, contract, locales, viewportIds, screens, contractProfile = 'meta-ui' }) {
  const errors = [];
  const profile = contractProfileFor(contractProfile);
  const requiredLocales = ['zh', 'en'];
  const requiredViewportIds = profile.viewports.map((viewport) => viewport.id);
  if (!exactStringSet(locales, requiredLocales)) errors.push(`full preview locales must be exactly: ${requiredLocales.join(', ')}`);
  if (!exactStringSet(viewportIds, requiredViewportIds)) errors.push(`full preview viewports must be exactly: ${requiredViewportIds.join(', ')}`);
  if (!exactStringSet(screens, profile.screens)) errors.push(`full preview screens must be exactly: ${profile.screens.join(', ')}`);
  if (!contract || typeof contract !== 'object') errors.push('full preview requires a preservation contract');

  const surfaces = new Map((contract?.surfaces || []).map((surface) => [surface.id, surface]));
  if (!exactStringSet([...surfaces.keys()], profile.preservationSurfaces)) errors.push(`preservation contract surfaces must be exactly: ${profile.preservationSurfaces.join(', ')}`);
  const scenarioKeys = new Set((scenarios || []).map((spec) => `${spec.screen}/${spec.locale}/${spec.viewport.id}/${spec.state}`));
  let requiredDefaultRows = 0;
  let requiredStateRows = 0;
  for (const screen of profile.screens) {
    const surface = surfaces.get(screen);
    if (!surface) continue;
    const plan = surface.comparisonPlan || {};
    if (!exactStringSet(plan.locales, requiredLocales)) errors.push(`${screen}.comparisonPlan.locales must be exactly zh,en`);
    const planViewportIds = (plan.viewports || []).map((size) => viewportIdForSize(size, profile.id));
    if (planViewportIds.some((id) => !id) || !exactStringSet(planViewportIds, requiredViewportIds)) {
      errors.push(`${screen}.comparisonPlan.viewports must cover all ${requiredViewportIds.length} contract viewports`);
    }
    for (const locale of requiredLocales) {
      for (const viewportId of requiredViewportIds) {
        requiredDefaultRows += 1;
        const key = `${screen}/${locale}/${viewportId}/${profile.defaultStates[screen]}`;
        if (!scenarioKeys.has(key)) errors.push(`missing full default preview scenario: ${key}`);
      }
      for (const state of plan.states || []) {
        requiredStateRows += 1;
        if (!profile.stateContracts[state]) errors.push(`${screen}.comparisonPlan references unknown preview state: ${state}`);
        if (profile.id === 'steam-title') {
          for (const viewportId of requiredViewportIds) {
            const key = `${screen}/${locale}/${viewportId}/${state}`;
            if (!scenarioKeys.has(key)) errors.push(`missing contract preview state: ${key}`);
          }
        } else {
          const present = (scenarios || []).some((spec) => spec.screen === screen && spec.locale === locale && spec.state === state);
          if (!present) errors.push(`missing contract preview state: ${screen}/${locale}/${state}`);
        }
      }
    }
  }
  if (errors.length) throw new Error(`Invalid full Open Design preview coverage:\n- ${errors.join('\n- ')}`);
  return { ok: true, requiredDefaultRows, requiredStateRows, scenarioCount: scenarios.length };
}

export function validateContractCartesianCoverage({ scenarios, sourceScenarios = [], contract, locales, viewportIds, screens, contractProfile = 'meta-ui' }) {
  const errors = [];
  const profile = contractProfileFor(contractProfile);
  const surfaces = new Map((contract?.surfaces || []).map((surface) => [surface.id, surface]));
  if (!contract || typeof contract !== 'object') errors.push('contract Cartesian capture requires a preservation contract');
  if (!Array.isArray(screens) || screens.length === 0) errors.push('contract Cartesian capture requires at least one surface');
  const scenarioList = scenarios || [];
  const scenarioKeys = new Set(scenarioList.map(scenarioTupleKey));
  const sourceScenarioKeys = new Set((sourceScenarios || []).map(scenarioTupleKey));
  if (scenarioKeys.size !== scenarioList.length) errors.push('contract Cartesian replay contains duplicate semantic tuples');
  for (const key of scenarioKeys) {
    if (sourceScenarioKeys.has(key)) errors.push(`contract Cartesian replay duplicates source preview scenario: ${key}`);
  }
  let requiredRows = 0;
  const requiredKeys = new Set();
  for (const screen of screens || []) {
    const surface = surfaces.get(screen);
    if (!surface) {
      errors.push(`unknown preservation surface: ${screen}`);
      continue;
    }
    const plan = surface.comparisonPlan || {};
    if (!exactStringSet(locales, plan.locales || [])) {
      errors.push(`${screen} capture locales must exactly match its comparisonPlan.locales`);
    }
    const planViewportIds = (plan.viewports || []).map((size) => viewportIdForSize(size, profile.id));
    if (planViewportIds.some((id) => !id) || !exactStringSet(viewportIds, planViewportIds)) {
      errors.push(`${screen} capture viewports must exactly match its comparisonPlan.viewports`);
    }
    for (const state of plan.states || []) {
      if (!profile.stateContracts[state]) errors.push(`${screen}.comparisonPlan references unknown preview state: ${state}`);
      for (const locale of plan.locales || []) {
        for (const viewportId of planViewportIds) {
          requiredRows += 1;
          const key = `${screen}/${locale}/${viewportId}/${state}`;
          requiredKeys.add(key);
          if (!scenarioKeys.has(key) && !sourceScenarioKeys.has(key)) errors.push(`missing contract Cartesian preview scenario: ${key}`);
        }
      }
    }
  }
  for (const key of scenarioKeys) {
    if (!requiredKeys.has(key)) errors.push(`contract Cartesian replay contains a scenario outside the requested matrix: ${key}`);
  }
  const sourceRows = [...requiredKeys].filter((key) => sourceScenarioKeys.has(key)).length;
  const replayRows = [...requiredKeys].filter((key) => scenarioKeys.has(key)).length;
  if (sourceRows + replayRows !== requiredRows) {
    errors.push(`contract Cartesian combined scenario count ${sourceRows + replayRows} does not equal required rows ${requiredRows}`);
  }
  if (errors.length) throw new Error(`Invalid contract Cartesian Open Design coverage:\n- ${errors.join('\n- ')}`);
  return { ok: true, requiredRows, sourceRows, replayRows, scenarioCount: scenarioList.length };
}

export function previewContractFor(spec) {
  const profile = contractProfileFor(spec.contractProfile || 'meta-ui');
  const screen = profile.screenContracts[spec.screen];
  const state = profile.stateContracts[spec.state];
  if (!screen) throw new Error(`Missing screen contract: ${spec.screen}`);
  if (!state) throw new Error(`Missing state contract: ${spec.state}`);
  return {
    rootSelector: screen.rootSelector,
    title: screen.title[spec.locale],
    stateSelector: state.selector || null,
    stateMarker: state.marker[spec.locale],
    actionSelectors: state.actionSelectors || screen.actionSelectors,
    actionMarker: (state.actionMarker || screen.actionMarker)[spec.locale],
  };
}

export function classifyTargetGeometry(rect, clippingBounds, requireTouchSize) {
  const intersection = {
    width: Math.max(0, Math.min(rect.right, clippingBounds.right) - Math.max(rect.left, clippingBounds.left)),
    height: Math.max(0, Math.min(rect.bottom, clippingBounds.bottom) - Math.max(rect.top, clippingBounds.top)),
  };
  const rendered = intersection.width > 0 && intersection.height > 0;
  const partiallyClipped = rendered && (
    rect.left < clippingBounds.left - 0.5
    || rect.top < clippingBounds.top - 0.5
    || rect.right > clippingBounds.right + 0.5
    || rect.bottom > clippingBounds.bottom + 0.5
  );
  return {
    rendered,
    partiallyClipped,
    meetsTouchTarget: !requireTouchSize || (rect.width >= 44 && rect.height >= 44),
    intersection,
  };
}

export function buildPreviewAssertions({ spec, evidence, pageErrors = [], consoleErrors = [], screenshotBytes = 0 }) {
  const contract = previewContractFor(spec);
  const targetAudit = evidence.targetAudit || {};
  const imageFailures = (evidence.images || []).filter((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0);
  const assertions = [
    { label: 'artifact rendered visible content', ok: screenshotBytes > 4096 && evidence.textLength > 20, expected: 'WebP >4096 bytes and text >20 chars', actual: `${screenshotBytes} bytes / ${evidence.textLength || 0} chars` },
    { label: 'design review API exposed and ready', ok: evidence.reviewApi === true && evidence.ready === true, expected: true, actual: evidence.reviewApi === true && evidence.ready === true },
    { label: 'snapshot matches requested screen, locale, and state', ok: evidence.snapshot?.screen === spec.screen && evidence.snapshot?.locale === spec.locale && evidence.snapshot?.state === spec.state, expected: `${spec.screen}/${spec.locale}/${spec.state}`, actual: `${evidence.snapshot?.screen}/${evidence.snapshot?.locale}/${evidence.snapshot?.state}` },
    { label: 'independent DOM root matches requested screen', ok: evidence.dom?.rootCount === 1 && evidence.dom?.rootAriaLabel === contract.title, expected: `${contract.rootSelector} aria-label=${contract.title}`, actual: evidence.dom?.rootSummary },
    { label: 'independent DOM state sentinel is visible', ok: evidence.dom?.stateMarkerFound === true && evidence.dom?.stateSelectorFound === true, expected: `${contract.stateMarker}${contract.stateSelector ? ` / ${contract.stateSelector}` : ''}`, actual: evidence.dom?.stateSummary },
    { label: 'primary action is visible and has localized nonblank copy', ok: evidence.dom?.primaryActionCount > 0 && evidence.dom?.primaryActionMarkerFound === true, expected: contract.actionMarker, actual: evidence.dom?.primaryActionText || '' },
    { label: 'document locale and visible copy match request', ok: evidence.dom?.langMatches === true && evidence.dom?.localeCopyMatches === true, expected: spec.locale, actual: evidence.dom?.localeSummary },
    { label: 'snapshot matches responsive mode', ok: evidence.snapshot?.responsiveMode === spec.viewport.id, expected: spec.viewport.id, actual: evidence.snapshot?.responsiveMode },
    { label: 'snapshot matches exact viewport', ok: evidence.viewport?.width === spec.viewport.width && evidence.viewport?.height === spec.viewport.height, expected: `${spec.viewport.width}x${spec.viewport.height}`, actual: `${evidence.viewport?.width}x${evidence.viewport?.height}` },
    { label: 'document has no viewport overflow', ok: evidence.scrollWidth <= spec.viewport.width + 1 && evidence.scrollHeight <= spec.viewport.height + 1, expected: `<=${spec.viewport.width + 1}x${spec.viewport.height + 1}`, actual: `${evidence.scrollWidth}x${evidence.scrollHeight}` },
    { label: 'page emitted no uncaught errors', ok: pageErrors.length === 0, expected: 0, actual: pageErrors },
    { label: 'console emitted no errors', ok: consoleErrors.length === 0, expected: 0, actual: consoleErrors },
    { label: 'all rendered images loaded', ok: imageFailures.length === 0, expected: 0, actual: imageFailures },
    { label: 'visible actionable controls exist', ok: Number(targetAudit.targetCount || 0) > 0, expected: '>0', actual: targetAudit.targetCount || 0 },
    { label: 'visible actionable targets are not partially clipped', ok: (targetAudit.partiallyClipped || []).length === 0, expected: 0, actual: targetAudit.partiallyClipped || [] },
    { label: 'actionable labels are not clipped', ok: (targetAudit.textClipped || []).length === 0, expected: 0, actual: targetAudit.textClipped || [] },
    { label: 'visible actionable targets do not overlap', ok: (targetAudit.overlaps || []).length === 0, expected: 0, actual: targetAudit.overlaps || [] },
  ];
  if (spec.viewport.input.includes('touch')) {
    assertions.push({ label: 'all visible actionable targets are at least 44x44 CSS px', ok: (targetAudit.touchFailures || []).length === 0, expected: 0, actual: targetAudit.touchFailures || [] });
  }
  if (spec.reducedMotion) {
    assertions.push({ label: 'reduced motion removes long-running animation', ok: evidence.reducedMotion?.matches === true && evidence.reducedMotion?.longRunningAnimations === 0, expected: 'match + 0 long animations', actual: evidence.reducedMotion });
  }
  if (spec.screen === 'talent') {
    const signature = evidence.signatures?.talent || {};
    assertions.push(
      { label: 'Talent retains a rich full tree', ok: Number(signature.nodeCount || 0) >= 18, expected: '>=18 nodes', actual: signature.nodeCount || 0 },
      { label: 'Talent nodes retain detailed Wedjat eye construction', ok: Number(signature.nodeCount || 0) > 0 && Number(signature.wedjatCount || 0) >= Math.ceil(Number(signature.nodeCount || 0) * 0.8), expected: '>=80% complex Wedjat nodes', actual: `${signature.wedjatCount || 0}/${signature.nodeCount || 0}` },
      { label: 'Talent retains all five branch identities', ok: Number(signature.branchColorCount || 0) >= 5, expected: '>=5 branch colors', actual: signature.branchColors || [] },
    );
  }
  if (spec.contractProfile === 'steam-title') {
    const title = evidence.signatures?.title || {};
    const commands = title.commands || {};
    assertions.push(
      { label: 'title first frame is local and keeps the product visible', ok: title.localFirstFrame === true && title.productNameMatches === true, expected: `${contract.title}; data-local-first-frame=true`, actual: title },
      { label: 'title uses a full-screen hall, character, and carved command composition', ok: title.hallScene === true && title.characterScene === true && title.commandArea === true, expected: 'hall + character + command area sentinels', actual: title },
      { label: 'title command model is Enter Hall, Settings, Credits, and capability-gated Quit only', ok: commands.enterHall === true && commands.settings === true && commands.credits === true && commands.forbidden.length === 0, expected: 'Enter Hall / Settings / Credits / gated Quit; no New Game or Continue Run', actual: commands },
      { label: 'Enter Hall targets the existing #home route', ok: commands.enterHallTarget === '#home', expected: '#home', actual: commands.enterHallTarget },
      { label: 'desktop Quit visibility matches the simulated capability', ok: commands.quitVisible === (spec.capabilities?.desktopQuit === true), expected: spec.capabilities?.desktopQuit === true, actual: commands.quitVisible },
      { label: 'snapshot reports the requested desktop Quit capability', ok: evidence.snapshot?.capabilities?.desktopQuit === (spec.capabilities?.desktopQuit === true), expected: spec.capabilities?.desktopQuit === true, actual: evidence.snapshot?.capabilities?.desktopQuit },
      { label: 'player copy does not expose lab or fake save-slot language', ok: title.forbiddenCopy.length === 0, expected: [], actual: title.forbiddenCopy },
      { label: 'self-contained title artifact loads no external resources', ok: Number(title.externalResourceCount || 0) === 0, expected: 0, actual: title.externalResources || [] },
    );
  }
  for (const probe of spec.probes || []) {
    assertions.push({ label: `input probe: ${probe}`, ok: evidence.probes?.[probe]?.ok === true, expected: true, actual: evidence.probes?.[probe] || null });
  }
  return assertions;
}

export function buildRuntimeAssertions({ locale, viewport, geometry, pageErrors = [], consoleErrors = [], screenshotBytes = 0 }) {
  const imageFailures = (geometry.images || []).filter((image) => !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0);
  return [
    { label: 'runtime surface mounted', ok: !!geometry.root, expected: true, actual: !!geometry.root },
    { label: 'runtime viewport matches capture contract', ok: geometry.viewport?.width === viewport.width && geometry.viewport?.height === viewport.height, expected: `${viewport.width}x${viewport.height}`, actual: `${geometry.viewport?.width}x${geometry.viewport?.height}` },
    { label: 'runtime surface stays inside viewport', ok: geometry.rootWithinViewport === true, expected: true, actual: geometry.rootWithinViewport },
    { label: 'runtime document has no viewport overflow', ok: geometry.document?.scrollWidth <= viewport.width + 1 && geometry.document?.scrollHeight <= viewport.height + 1, expected: `<=${viewport.width + 1}x${viewport.height + 1}`, actual: `${geometry.document?.scrollWidth}x${geometry.document?.scrollHeight}` },
    { label: 'runtime emitted no page errors', ok: pageErrors.length === 0, expected: 0, actual: pageErrors },
    { label: 'runtime emitted no console errors', ok: consoleErrors.length === 0, expected: 0, actual: consoleErrors },
    { label: 'runtime referenced images loaded', ok: imageFailures.length === 0, expected: 0, actual: imageFailures },
    { label: 'runtime visible actionable controls exist including Shadow DOM', ok: geometry.visibleButtons > 0, expected: '>0', actual: geometry.visibleButtons },
    { label: 'runtime locale and visible copy match request', ok: geometry.langMatches === true && geometry.localeCopyMatches === true, expected: locale, actual: geometry.localeSummary },
    { label: 'runtime screenshot has visible content', ok: screenshotBytes > 4096 && geometry.visibleTextLength > 20, expected: 'WebP >4096 bytes and text >20 chars', actual: `${screenshotBytes} bytes / ${geometry.visibleTextLength || 0} chars` },
  ];
}

export function hasExactIds(items, expectedIds) {
  const ids = items.map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean);
  const unique = new Set(ids);
  return ids.length === expectedIds.length && unique.size === expectedIds.length
    && expectedIds.every((id) => unique.has(id));
}

export function parseOpenDesignPreviewIdentity(value) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/preview\/([^/]+)\/(.+)$/);
    if (!match) return null;
    return {
      daemonUrl: url.origin,
      projectId: decodeURIComponent(match[1]),
      revisionId: decodeURIComponent(match[2]),
      file: decodeURIComponent(match[3]),
    };
  } catch {
    return null;
  }
}

export function resolveInside(root, candidate, label = 'path') {
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(`${label} must be a non-empty relative path`);
  if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\')) {
    throw new Error(`${label} must be relative to the handoff: ${candidate}`);
  }
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the handoff: ${candidate}`);
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}
