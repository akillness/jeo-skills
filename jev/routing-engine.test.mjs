import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decomposeIntents,
  detectConversationalAbstention,
  extractExplicitNegations,
  finalizeDynamicSelection,
  formatDeferredAdvisoryContext,
  matchesFunctionalPolarityVeto,
  rerankWithCrossEncoder,
  scoreLexicalBoundaryAware,
  tokenizeClean,
} from './routing-engine.mjs';
import { splitBoundaryDescription } from '../scripts/build-skill-routing-index.mjs';

test('splitBoundaryDescription separates positive purpose from negative route-out clauses and redirects', () => {
  const valid = new Set(['hwp', 'rhwp-edit', 'playwriter', 'browser-harness', 'log-analysis', 'game-build-log-triage']);

  const hwp = splitBoundaryDescription(
    'Use kordoc for agent-native HWP/HWPX parsing and JSON extraction (read/convert only — for binary editing use rhwp-edit).',
    'hwp',
    valid,
  );
  assert.match(hwp.positiveText, /kordoc/);
  assert.doesNotMatch(hwp.positiveText, /rhwp-edit/);
  assert.match(hwp.negativeText, /rhwp-edit/);
  assert.deepEqual(hwp.redirects[0]?.targets, ['rhwp-edit']);

  const pw = splitBoundaryDescription(
    'Reuse an already-open logged-in Chrome tab session. Route repeatable fresh-browser or CI-style checks to browser-harness instead.',
    'playwriter',
    valid,
  );
  assert.match(pw.positiveText, /already-open/);
  assert.doesNotMatch(pw.positiveText, /browser-harness/);
  assert.match(pw.negativeText, /browser-harness/);
  assert.deepEqual(pw.redirects[0]?.targets, ['browser-harness']);

  // Positive opening "Route ... into one ..." must stay positive
  const posLead = splitBoundaryDescription(
    'Route observability work into one monitoring brief. Route engine-specific Unity logs to game-build-log-triage.',
    'log-analysis',
    valid,
  );
  assert.match(posLead.positiveText, /Route observability work/);
  assert.match(posLead.negativeText, /game-build-log-triage/);
});

test('detectConversationalAbstention catches choice replies, ok, and greetings without blocking real tasks', () => {
  const known = new Set(['okf', 'brainstorm-okrs', 'blender-skills', 'react-best-practices']);
  for (const chat of [
    '1.c, 2.a, 3. 2~3초 ok, 응 허용 4. 엉뚱한걸 체크하는거같아',
    '1. c, 2. a, 3. a',
    'ok',
    '응 그렇게 진행해줘',
    '고마워, 잘 됐어!',
    '계속 진행해',
    '좋아, 2번 옵션으로 가자',
    'Thanks, looks good to me!',
    'hello there',
    '잠깐만, 방금 말한 거 다시 설명해줄래?',
    'Sounds great, let\'s do option B.',
  ]) {
    const res = detectConversationalAbstention(chat, known);
    assert.equal(res.abstain, true, `expected abstention for: ${chat}`);
  }

  for (const real of [
    '블렌더에서 캐릭터 리깅하고 웨이트 페인팅 자동화하는 방법 알려줘',
    'Audit React component re-render waterfalls in Next.js',
    'Create an okf bundle for this docs repo',
    '1.c 말고 react-best-practices 적용해서 번들 최적화해줘',
  ]) {
    const res = detectConversationalAbstention(real, known);
    assert.equal(res.abstain, false, `must not abstain for real task: ${real}`);
  }
});

test('scoreLexicalBoundaryAware eliminates the unanchored "ok" substring false-positive bug', () => {
  const okf = {
    name: 'okf',
    category: 'knowledge',
    subcategory: 'bundles',
    tags: ['okf', 'knowledge'],
    positiveText: 'Create and validate Open Knowledge Format bundles.',
    koAliases: '',
  };
  const okr = {
    name: 'brainstorm-okrs',
    category: 'product',
    subcategory: 'strategy',
    tags: ['okr'],
    positiveText: 'Brainstorm quarterly OKRs and measurable key results.',
    koAliases: '',
  };
  const toks = tokenizeClean('1.c, 2.a, 3. 2~3초 ok, 응 허용 4. 엉뚱한걸 체크하는거같아');
  assert.equal(scoreLexicalBoundaryAware(toks, okf), 0);
  assert.equal(scoreLexicalBoundaryAware(toks, okr), 0);
  assert.equal(scoreLexicalBoundaryAware(tokenizeClean('ok'), okf), 0);
  assert.equal(scoreLexicalBoundaryAware(tokenizeClean('ok'), okr), 0);
});

test('decomposeIntents splits compound tasks and filters out negation tails', () => {
  const mi = decomposeIntents('React/Next.js 대시보드 렌더링 성능 최적화하고, 새로운 깨끗한 브라우저로 E2E 테스트 자동화까지 붙여줘');
  assert.equal(mi.length, 2);

  const singleWithNeg = decomposeIntents('Build a playable 3D browser action game with Three.js combat, not Unity');
  assert.equal(singleWithNeg.length, 0);

  const negs = extractExplicitNegations('Create a blue-green rollout strategy (not Vercel) without Docker');
  assert.ok(negs.some(n => n.includes('vercel')));
  assert.ok(negs.some(n => n.includes('docker')));
});

test('finalizeDynamicSelection enforces veto exclusion and renders 2-stage deferred advisory format', () => {
  const stage1 = {
    candidates: [
      {
        entry: { name: 'browser-harness', category: 'web', subcategory: 'browser', path: 'browser-harness/SKILL.md', positiveText: 'Fresh headless browser automation for repeatable E2E checks.' },
        skill: { description: 'Fresh headless browser automation.' },
        denseScore: 0.72,
        lexScore: 4.5,
        rrf: 0.04,
        vetoPenalty: 0,
        explicitNegated: false,
        semanticNegVeto: false,
        clauseOwner: 0,
        denseBySub: [0.72],
      },
      {
        entry: { name: 'playwriter', category: 'web', subcategory: 'browser', path: 'playwriter/SKILL.md', positiveText: 'Reuse already-open logged-in Chrome tabs.' },
        skill: { description: 'Reuse Chrome tabs.' },
        denseScore: 0.61,
        lexScore: 2.0,
        rrf: 0.02,
        vetoPenalty: 0.55,
        explicitNegated: true,
        semanticNegVeto: true,
        clauseOwner: -1,
        denseBySub: [0.61],
      },
    ],
    denseActive: true,
    isMultiIntent: false,
    hasKorean: false,
    subQueries: [],
    companionsBySkill: new Map(),
    stats: { maxDense: 0.72, denseGap: 0.18, maxLex: 4.5 },
  };
  const qevAnswers = {
    'gate::prose_suffices': { probability: 0.05 },
    'fits::browser-harness': { probability: 0.92 },
    'fits::playwriter': { probability: 0.35 },
  };
  const out = finalizeDynamicSelection({ stage1, qevAnswers, topK: 10 });
  assert.equal(out.abstained, false);
  assert.deepEqual(out.topK.map(s => s.name), ['browser-harness']);
  const note = formatDeferredAdvisoryContext(out.topK);
  assert.match(note, /browser-harness/);
  assert.match(note, /SKILL\.toon|SKILL\.md/);
});

test('tokenizeClean keeps 1-char Korean tech terms, drops particles, and expands compound stems', () => {
  const toks = tokenizeClean('웹 앱 깃푸시하고 딥리서치와 실동작검증까지 진행');
  assert.ok(toks.includes('웹') && toks.includes('web'), `expected 웹/web in ${toks}`);
  assert.ok(toks.includes('앱') && toks.includes('app'), `expected 앱/app in ${toks}`);
  assert.ok(toks.includes('git') && toks.includes('push'), `expected git/push in ${toks}`);
  assert.ok(toks.includes('deep-research') && toks.includes('research'), `expected deep-research/research in ${toks}`);
  assert.ok(toks.includes('verify') || toks.includes('verification'), `expected verify in ${toks}`);
  assert.ok(!toks.includes('은') && !toks.includes('는'), 'must not retain 1-char particles');
});

test('decomposeIntents splits Korean multi-sentence prompts into atomic clauses including short action tails', () => {
  const clauses = decomposeIntents('subagent 이용해. 추가 리뷰 및 딥리서치하고 개선사항있는지 실측하고 개선해서 깃푸시. 그리고 설치해서 실동작검증까지 진행해');
  assert.ok(clauses.length >= 4 && clauses.length <= 5, `expected 4..5 clauses, got ${JSON.stringify(clauses)}`);
  assert.ok(clauses.some(c => c.includes('딥리서치')), `missing 딥리서치 clause in ${JSON.stringify(clauses)}`);
  assert.ok(clauses.some(c => c.includes('깃푸시')), `missing 깃푸시 clause in ${JSON.stringify(clauses)}`);
});

test('matchesFunctionalPolarityVeto blocks read-only skills on edit prompts and game skills on non-game prompts', () => {
  const hwpReadOnly = {
    name: 'hwp',
    category: 'document-processing',
    positiveText: 'Use kordoc for agent-native HWP parsing (read/convert only — for binary editing use rhwp-edit).',
    negativeText: 'for binary editing use rhwp-edit',
  };
  const vEdit = matchesFunctionalPolarityVeto('HWP 파일 본문을 직접 편집하고 텍스트 치환해줘', hwpReadOnly);
  assert.equal(vEdit.hardVeto, true);
  assert.ok(vEdit.penalty > 0);

  const vRead = matchesFunctionalPolarityVeto('HWP 문서를 Markdown으로 변환해서 읽어줘', hwpReadOnly);
  assert.equal(vRead.hardVeto, false);

  const gameSkill = {
    name: 'game-build-log-triage',
    category: 'game-development',
    positiveText: 'Triage Unity and Unreal build failures.',
    negativeText: '',
  };
  assert.equal(matchesFunctionalPolarityVeto('Nginx 서버 로그 분석해줘', gameSkill).hardVeto, true);
  assert.equal(matchesFunctionalPolarityVeto('Unity 게임 빌드 로그 에러 분석해줘', gameSkill).hardVeto, false);
});

test('finalizeDynamicSelection handles cross-encoder rerank scores, runner-up rescue, and mutual vs one-way redirects', () => {
  const mkCand = (name, dense, redirects = [], hasNegativeText = false) => ({
    entry: {
      name,
      category: 'development',
      subcategory: 'ops',
      path: `${name}/SKILL.md`,
      positiveText: `Skill ${name}`,
      negativeText: hasNegativeText ? 'redirect clause' : '',
      redirects,
    },
    skill: { description: `Skill ${name}` },
    denseScore: dense,
    lexScore: 2.0,
    rrf: 0.02,
    vetoPenalty: 0,
    explicitNegated: false,
    semanticNegVeto: false,
    functionalHardVeto: false,
    clauseOwner: -1,
    denseBySub: [dense],
  });

  // Mutual redirect (e.g. log-analysis <-> monitoring-observability) rescues #2 at logit >= -2.5
  const mutualStage1 = {
    candidates: [
      mkCand('log-analysis', 0.72, [{ targets: ['monitoring-observability'] }], true),
      mkCand('monitoring-observability', 0.66, [{ targets: ['log-analysis'] }], true),
      mkCand('noise-skill', 0.42, [], false),
    ],
    denseActive: true,
    isMultiIntent: false,
    hasKorean: true,
    subQueries: [],
    companionsBySkill: new Map(),
    stats: { maxDense: 0.72, denseGap: 0.12, maxLex: 3.0 },
  };
  const mkRerank = (entries) => ({
    byName: new Map(entries.map(([name, raw, prob]) => [name, { bestLogit: raw, prob, fullLogit: raw, clauseLogit: null }])),
    rerankMs: 90,
  });
  const mutualRerank = mkRerank([
    ['log-analysis', 1.9, 0.87],
    ['monitoring-observability', -2.1, 0.11],
    ['noise-skill', -7.5, 0.0005],
  ]);
  const mutualOut = finalizeDynamicSelection({ stage1: mutualStage1, rerankScores: mutualRerank, topK: 10 });
  assert.deepEqual(mutualOut.topK.map(s => s.name), ['log-analysis', 'monitoring-observability']);

  // One-way redirect (e.g. legacy-tool -> modern-tool) still vetoes the redirected sibling
  const oneWayStage1 = {
    ...mutualStage1,
    candidates: [
      mkCand('modern-tool', 0.72, [], false),
      mkCand('legacy-tool', 0.60, [{ targets: ['modern-tool'] }], true),
    ],
  };
  const oneWayRerank = mkRerank([
    ['modern-tool', 1.8, 0.86],
    ['legacy-tool', -2.0, 0.12],
  ]);
  const oneWayOut = finalizeDynamicSelection({ stage1: oneWayStage1, rerankScores: oneWayRerank, topK: 10 });
  assert.deepEqual(oneWayOut.topK.map(s => s.name), ['modern-tool']);

  // Runner-up rescue admits logit >= -4.6 & score >= 0.34 while blocking weak noise (< -5.8)
  const runnerStage1 = {
    ...mutualStage1,
    candidates: [
      mkCand('react-best-practices', 0.78),
      mkCand('performance-optimization', 0.68),
      mkCand('random-noise', 0.68),
    ],
  };
  const runnerRerank = mkRerank([
    ['react-best-practices', 3.1, 0.96],
    ['performance-optimization', -4.4, 0.012],
    ['random-noise', -6.5, 0.0015],
  ]);
  const runnerOut = finalizeDynamicSelection({ stage1: runnerStage1, rerankScores: runnerRerank, topK: 10 });
  assert.deepEqual(runnerOut.topK.map(s => s.name), ['react-best-practices', 'performance-optimization']);
});

test('rerankWithCrossEncoder degrades gracefully to null when endpoint is unreachable', async () => {
  const stage1 = {
    candidates: [
      {
        entry: { name: 'git-workflow', category: 'development', subcategory: 'git', positiveText: 'Git branch and PR workflow' },
        skill: { description: 'Git workflow' },
        denseScore: 0.7,
        lexScore: 2,
        rrf: 0.02,
      },
    ],
    hasKorean: false,
    isMultiIntent: false,
    subQueries: [],
  };
  const res = await rerankWithCrossEncoder('git push', stage1, {
    endpoint: 'http://127.0.0.1:1/v1/rerank',
    timeoutMs: 150,
  });
  assert.equal(res, null);
});