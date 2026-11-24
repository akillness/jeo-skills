#!/usr/bin/env node
/**
 * Build offline boundary-aware multilingual routing index for Jev unified skill router.
 *
 * Strictly read-only against `.agent-skills/skills.json` and `SKILL.md`/`SKILL.toon`.
 * Outputs derived artifacts to `~/.agents/jev/routing-index.v1.json` + `.f32` (or --out-dir).
 *
 * Features:
 *  - Boundary-aware split: separates positive triggers from negative/route-out clauses
 *    ("Do not use...", "Not for...", "Route X to `skill`...", "use `skill` instead").
 *  - Extracts validated redirect edges from negative clauses.
 *  - Generates deterministic bilingual KO/EN domain aliases from category/subcategory/tags/tokens.
 *  - Computes unit-normalized 1024-dim BGE-M3 embeddings for positive documents and
 *    negative boundary clauses via local llama-server (--embedding --pooling cls).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_CATALOG = resolve(REPO_ROOT, '.agent-skills', 'skills.json');
const DEFAULT_OUT_DIR = join(homedir(), '.agents', 'jev');
const DEFAULT_EMBED_URL = process.env.JEV_EMBED_ENDPOINT || 'http://127.0.0.1:18018/v1/embeddings';
const DEFAULT_EMBED_MODEL = process.env.JEV_EMBED_MODEL || 'bge-m3-Q8_0';

// General domain-level bilingual glossary (EN concept -> KO domain terms)
// Applied systematically to skill category, subcategory, tags, name tokens, and positive descriptions.
const EN_TO_KO_DOMAIN_GLOSSARY = {
  // 3D, Blender, Game, VFX
  blender: '블렌더 3D 모델링 스컬핑 셰이딩',
  rigging: '리깅 뼈대 웨이트 페인팅 스키닝',
  rig: '리깅 캐릭터 리그 관절',
  mixamo: '믹사모 모션 리타겟팅 애니메이션',
  motion: '모션 움직임 애니메이션 추적',
  threejs: '쓰리제이에스 웹3D 씬 렌더링 GLB',
  webgl: '웹GL 3D 그래픽 셰이더',
  shader: '셰이더 재질 조명 렌더링',
  lighting: '조명 라이팅 그림자',
  loaders: '로더 GLB GLTF 3D 모델 불러오기',
  unity: '유니티 C# 게임 엔진',
  unreal: '언리얼 게임 엔진',
  godot: '고도 엔진 게임 개발',
  vfx: '이펙트 시각효과 파티클 VFX',
  audio: '오디오 사운드 효과음 음성',
  sound: '사운드 효과음 음향',
  tts: '음성합성 나레이션 더빙 TTS',
  voice: '음성 목소리 나레이션',
  game: '게임 개발 플레이',
  voxel: '복셀 3D 블록',
  sprite: '스프라이트 픽셀아트 2D',
  // Web, Frontend, UI, Browser
  react: '리액트 컴포넌트 리렌더링 훅',
  nextjs: '넥스트JS SSR 번들 최적화',
  frontend: '프론트엔드 웹 UI 화면',
  'design-system': '디자인 시스템 토큰 컴포넌트 UI 규칙',
  responsive: '반응형 레이아웃 모바일 브레이크포인트',
  accessibility: '접근성 a11y WCAG 키보드 스크린리더 ARIA',
  css: 'CSS 스타일 레이아웃',
  animation: '애니메이션 모션 트랜지션',
  browser: '브라우저 크롬 웹 자동화',
  chrome: '크롬 브라우저 탭 세션',
  cdp: '크롬 CDP 헤드리스 브라우저 자동화',
  playwright: '플레이라이트 E2E 브라우저 테스트',
  scrape: '웹 스크래핑 크롤링 수집',
  scraping: '웹 스크래핑 크롤링 데이터 수집',
  // Backend, Data, DB, Infra, Security
  api: 'API REST 엔드포인트 계약 스펙',
  database: '데이터베이스 DB 스키마 테이블 마이그레이션',
  schema: '스키마 데이터 모델 마이그레이션 인덱스',
  sql: 'SQL 쿼리 집계 데이터베이스',
  postgresql: '포스트그레스 PostgreSQL DB',
  supabase: '수파베이스 Supabase DB 인증',
  firebase: '파이어베이스 Firebase 호스팅 에뮬레이터',
  bigquery: '빅쿼리 BigQuery 데이터 웨어하우스',
  looker: '루커 스튜디오 BI 대시보드 리포트',
  authentication: '인증 로그인 JWT OAuth 세션 쿠키',
  security: '보안 취약점 CSRF XSS 하드닝 점검',
  deploy: '배포 릴리즈 스테이징 프로덕션 롤백',
  deployment: '배포 파이프라인 롤아웃 롤백 전략',
  vercel: '버셀 Vercel 프리뷰 도메인 배포',
  docker: '도커 컨테이너 로컬 개발환경',
  environment: '환경변수 .env 설정 로컬 툴체인',
  logging: '로그 분석 에러 스택트레이스 장애 원인',
  logs: '로그 에러 스택트레이스 장애 분석',
  observability: '옵저버빌리티 모니터링 알림 대시보드 트레이싱',
  monitoring: '모니터링 메트릭 알림 대시보드 관측성',
  tracing: '트레이싱 OpenTelemetry 추적',
  // Engineering, Code quality, Git, Testing
  review: '코드 리뷰 PR 검토 변경사항 점검',
  refactor: '리팩토링 코드 구조 개선 중복 제거',
  refactoring: '리팩토링 코드 정리 구조 개선',
  architecture: '아키텍처 구조 설계 모듈화',
  debug: '디버깅 버그 원인 추적 수정',
  debugging: '디버깅 오류 진단 근본 원인',
  performance: '성능 최적화 속도 프로파일링 병목',
  profiling: '프로파일링 CPU 메모리 프레임 병목 측정',
  benchmark: '벤치마크 성능 비교 측정',
  test: '테스트 단위테스트 통합테스트 E2E',
  testing: '테스트 전략 자동화 검증',
  tdd: 'TDD 테스트 주도 개발 단위 테스트',
  git: '깃 깃푸시 깃허브 Git 브랜치 커밋 푸시 PR',
  merge: '머지 병합 충돌 해결 conflict',
  conflict: '충돌 해결 merge conflict',
  guardrails: '가드레일 안전장치 보호 규칙',
  // AI Agents, Skills, Memory, Search, MCP, Ontology
  agent: '에이전트 AI 워크플로우 자동화',
  subagent: '서브에이전트 멀티에이전트 병렬 위임 에이전트',
  'multi-agent': '서브에이전트 멀티에이전트 팀 조율 병렬',
  verification: '검증 실동작검증 확인 테스트',
  routing: '라우팅 스킬 선택 도구 매칭',
  skill: '스킬 SKILL.md 작성 표준화',
  mcp: 'MCP 서버 도구 연동 프로토콜',
  a2a: '에이전트 간 통신 A2A 프로토콜 메시징',
  langgraph: '랭그래프 상태 그래프 인간 승인 인터럽트',
  langsmith: '랭스미스 LLM 트레이싱 평가',
  langfuse: '랭퓨즈 LLM 관측성 트레이싱 프롬프트 평가',
  pydantic: '파이단틱 타입 구조화 출력 검증',
  memory: '메모리 장기 기억 지식 저장',
  wiki: '위키 지식 베이스 문서 정리',
  obsidian: '옵시디언 세컨드 브레인 볼트 노트 정리',
  graph: '지식 그래프 코드 그래프 의존성',
  search: '검색 시맨틱 검색 코드 탐색 인덱스',
  ontology: '온톨로지 RDF OWL SHACL 지식 모델',
  eval: '평가 벤치마크 테스트 하네스',
  interview: '인터뷰 요구사항 정리 질문 명세',
  spec: '명세서 스펙 요구사항 정리',
  // Research, Documents, Korean utilities, Media, Business
  research: '딥리서치 리서치 조사 심층 분석 웹 검색 보고서',
  patent: '특허 선행기술 KIPRIS 침해 분석',
  hwp: '한글 HWP HWPX 공문서 문서',
  video: '영상 비디오 편집 제작',
  shorts: '쇼츠 숏폼 유튜브 짧은 영상',
  youtube: '유튜브 채널 쇼츠 썸네일 성장 전략',
  thumbnail: '썸네일 이미지 디자인',
  presentation: '발표자료 프레젠테이션 슬라이드',
  diagram: '다이어그램 아키텍처 도식 플로우차트',
  prd: 'PRD 기획서 제품 요구사항 정의서',
  roadmap: '로드맵 일정 마일스톤',
  competitor: '경쟁사 비교 분석 배틀카드',
  pricing: '가격 정책 수익화 요금제',
  market: '시장 규모 분석 세그먼트 조사',
  gtm: 'GTM 출시 전략 마케팅 성장',
  cohort: '코호트 리텐션 잔존율 퍼널 분석',
  analytics: '데이터 분석 지표 KPI 통계',
  meeting: '회의록 요약 정리',
  resume: '이력서 검토 피드백',
  okr: 'OKR 목표 핵심결과',
};

const NEGATIVE_SENTENCE_RE = new RegExp(
  [
    '\\b(?:do not use|don\'t use|never use|not for|not meant for|avoid using|skip when|outside scope)\\b',
    '(?:^|[;:])\\s*(?:route|redirect|defer|hand off|delegate)\\b[^.]*\\bto\\b',
    '\\broute\\s+[^.;]{3,120}\\bto\\s+`?[a-z0-9][a-z0-9-]+`?',
    '\\buse\\s+`?[a-z0-9][a-z0-9-]+`?\\s+instead\\b',
    '\\binstead of\\s+(?:using\\s+)?`?[a-z0-9][a-z0-9-]+`?',
  ].join('|'),
  'i'
);

// Matches opening routing boilerplate like "Route observability work from the current packet into one monitoring brief."
// which IS a positive description, NOT a route-out negation!
const POSITIVE_SELF_ROUTE_RE = /^route\s+[^.]*\binto\s+(?:one|a|either|the)\b/i;

function splitSentences(text) {
  if (!text) return [];
  const raw = String(text).replace(/\s+/g, ' ').trim();
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    buf += ch;
    if (depth === 0 && (ch === '.' || ch === ';' || ch === '!' || ch === '?')) {
      const next = raw[i + 1] || '';
      const prev = raw[i - 1] || '';
      const isDecimalOrExt = ch === '.' && ((/[0-9]/.test(prev) && /[0-9]/.test(next)) || /(?:\.js|\.ts|\.py|\.md|\.json|\.env|v\d)$/i.test(buf));
      if (!isDecimalOrExt && (!next || /\s/.test(next))) {
        parts.push(buf.trim());
        buf = '';
      }
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function extractSkillMentions(text, validSkillSet, selfName) {
  const found = new Set();
  for (const m of text.matchAll(/`([a-z0-9][a-z0-9-]+)`|\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/gi)) {
    const candidate = (m[1] || m[2] || '').toLowerCase();
    if (candidate && candidate !== selfName && validSkillSet.has(candidate)) {
      found.add(candidate);
    }
  }
  return [...found];
}

export function splitBoundaryDescription(description, selfName, validSkillSet) {
  const sentences = splitSentences(description);
  const pos = [];
  const neg = [];
  const redirects = [];

  for (const s of sentences) {
    const parenNegMatch = s.match(/\(([^)]*(?:only|not for|do not use|instead|use\s+[a-z0-9-]+)[^)]*)\)/i);
    if (POSITIVE_SELF_ROUTE_RE.test(s)) {
      pos.push(s);
      continue;
    }
    if (NEGATIVE_SENTENCE_RE.test(s)) {
      neg.push(s);
      const targets = extractSkillMentions(s, validSkillSet, selfName);
      if (targets.length) redirects.push({ clause: s, targets });
      continue;
    }
    if (parenNegMatch && /\b(for\s+[^)]*\buse\b|not for|do not use|instead)\b/i.test(parenNegMatch[1])) {
      const cleaned = s.replace(parenNegMatch[0], '').replace(/\s+/g, ' ').trim();
      if (cleaned) pos.push(cleaned);
      neg.push(parenNegMatch[1].trim());
      const targets = extractSkillMentions(parenNegMatch[1], validSkillSet, selfName);
      if (targets.length) redirects.push({ clause: parenNegMatch[1].trim(), targets });
      continue;
    }
    // Handle trailing inline negation like ", not an already-open tab..." or "; not for ..."
    const inlineNegMatch = s.match(/([,;]\s*(?:not\s+(?:an?|for|when|general|generic|broad)\b.*))$/i);
    if (inlineNegMatch && inlineNegMatch.index > 30) {
      const cleaned = s.slice(0, inlineNegMatch.index).trim();
      const negPart = inlineNegMatch[1].replace(/^[,;\s]+/, '').trim();
      if (cleaned) pos.push(cleaned);
      if (negPart) {
        neg.push(negPart);
        const targets = extractSkillMentions(negPart, validSkillSet, selfName);
        if (targets.length) redirects.push({ clause: negPart, targets });
      }
      continue;
    }
    pos.push(s);
  }

  const positiveText = (pos.length ? pos : sentences.slice(0, 1)).join(' ').trim();
  const negativeText = neg.join(' ').trim();
  return { positiveText, negativeText, redirects };
}

function buildKoAliases(skill) {
  const bag = new Set();
  // Match domain glossary strictly against structured identity fields (name, category, subcategory, tags)
  // to prevent spurious cross-domain alias leakage from incidental prose words.
  const structuredHay = `${skill.name} ${skill.category || ''} ${skill.subcategory || ''} ${(skill.tags || []).join(' ')}`.toLowerCase();
  const nameTokens = new Set(skill.name.toLowerCase().split(/[-_]+/));
  const tagSet = new Set((skill.tags || []).map(t => String(t).toLowerCase()));

  for (const [enKey, koPhrase] of Object.entries(EN_TO_KO_DOMAIN_GLOSSARY)) {
    if (enKey === 'skill' && skill.subcategory !== 'skill-authoring' && !nameTokens.has('skill')) continue;
    if (enKey === 'agent' && skill.category !== 'ai-agents' && !nameTokens.has('agent')) continue;
    if (enKey === 'game' && skill.category !== 'game' && !nameTokens.has('game')) continue;
    if (enKey === 'review' && !nameTokens.has('review') && !tagSet.has('code-review')) continue;
    const matched = enKey.includes('-')
      ? structuredHay.includes(enKey)
      : (nameTokens.has(enKey) || tagSet.has(enKey) || new RegExp(`\\b${enKey}\\b`, 'i').test(structuredHay));
    if (matched) {
      for (const w of koPhrase.split(/\s+/)) bag.add(w);
    }
  }

  // Disambiguating Korean cues for common sibling pairs based strictly on each skill's own role
  if (skill.name === 'hwp') bag.add('파싱').add('읽기').add('추출').add('변환').add('JSON').add('마크다운');
  if (skill.name === 'rhwp-edit') bag.add('편집').add('수정').add('치환').add('표').add('셀');
  if (skill.name === 'playwriter') bag.add('열려있는').add('기존').add('로그인').add('세션').add('탭');
  if (skill.name === 'browser-harness') bag.add('새로운').add('깨끗한').add('헤드리스').add('반복').add('CI');
  if (skill.name === 'environment-setup') bag.add('환경변수').add('.env').add('설정');
  if (skill.name === 'system-environment-setup') bag.add('도커').add('컨테이너').add('로컬').add('툴체인').add('온보딩');
  if (skill.name === 'obsidian-second-brain') bag.add('옵시디언').add('세컨드').add('브레인').add('볼트').add('회의록').add('지식노트');
  if (skill.name === 'grill-me') bag.add('인터뷰').add('요구사항').add('질문').add('정리');

  return [...bag].slice(0, 24).join(' ');
}

function readToonTriggers(skillPath) {
  try {
    const toonPath = join(REPO_ROOT, '.agent-skills', skillPath.replace(/\/SKILL\.md$/, '/SKILL.toon'));
    if (!existsSync(toonPath)) return '';
    const txt = readFileSync(toonPath, 'utf8');
    // Extract concise trigger / heading lines (max 240 chars)
    const lines = txt.split('\n').filter(l => /^(?:D:|T:|W:|U:|triggers?:|when:)/i.test(l.trim())).slice(0, 4);
    return lines.join(' ').replace(/\s+/g, ' ').slice(0, 240);
  } catch {
    return '';
  }
}

async function embedBatch(endpoint, model, texts) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Embedding server error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const payload = await res.json();
  const rows = (payload.data || []).sort((a, b) => a.index - b.index);
  return rows.map(r => {
    const vec = Float32Array.from(r.embedding);
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
  });
}

function parseCliArgs(argv) {
  const opts = {
    catalog: DEFAULT_CATALOG,
    outDir: DEFAULT_OUT_DIR,
    embedUrl: DEFAULT_EMBED_URL,
    embedModel: DEFAULT_EMBED_MODEL,
    batchSize: 16,
    skipEmbed: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--catalog') opts.catalog = resolve(argv[++i]);
    else if (a === '--out-dir') opts.outDir = resolve(argv[++i]);
    else if (a === '--embed-url') opts.embedUrl = argv[++i];
    else if (a === '--embed-model') opts.embedModel = argv[++i];
    else if (a === '--batch-size') opts.batchSize = Number(argv[++i]) || 16;
    else if (a === '--skip-embed') opts.skipEmbed = true;
  }
  return opts;
}

async function main() {
  const t0 = performance.now();
  const opts = parseCliArgs(process.argv.slice(2));
  const rawCatalog = readFileSync(opts.catalog, 'utf8');
  const catalogSha256 = createHash('sha256').update(rawCatalog).digest('hex');
  const catalog = JSON.parse(rawCatalog);
  const skills = catalog.skills || [];
  const validSkillSet = new Set(skills.map(s => s.name));

  const entries = [];
  const posDocs = [];
  const negJobs = [];

  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    const { positiveText, negativeText, redirects } = splitBoundaryDescription(s.description || '', s.name, validSkillSet);
    const koAliases = buildKoAliases(s, positiveText);
    const toonHint = readToonTriggers(s.path || `${s.name}/SKILL.md`);
    const tags = Array.isArray(s.tags) ? s.tags : [];

    // Positive document for dense embedding: clean name + taxonomy + positive description + tags + KO aliases
    const posDoc = [
      `${s.name} (${s.category || ''}/${s.subcategory || ''})`,
      positiveText,
      tags.length ? `Tags: ${tags.join(', ')}` : '',
      koAliases ? `KO: ${koAliases}` : '',
    ].filter(Boolean).join('. ');

    posDocs.push(posDoc);

    let negVecIndex = -1;
    if (negativeText) {
      negVecIndex = negJobs.length;
      negJobs.push({ skillIndex: i, text: `${s.name} (${s.category || ''}/${s.subcategory || ''}): ${negativeText}` });
    }

    entries.push({
      name: s.name,
      category: s.category || '',
      subcategory: s.subcategory || '',
      path: String(s.path || `${s.name}/SKILL.md`).replace(/\\/g, '/'),
      tags,
      positiveText,
      negativeText,
      redirects,
      koAliases,
      toonHint,
      posVecIndex: i,
      negVecIndex,
    });
  }

  let dim = 0;
  let posVecs = [];
  let negVecs = [];

  if (!opts.skipEmbed) {
    console.log(`Embedding ${posDocs.length} positive skill docs + ${negJobs.length} negative boundary clauses via ${opts.embedUrl}...`);
    for (let i = 0; i < posDocs.length; i += opts.batchSize) {
      const chunk = posDocs.slice(i, i + opts.batchSize);
      const vecs = await embedBatch(opts.embedUrl, opts.embedModel, chunk);
      posVecs.push(...vecs);
      if ((i / opts.batchSize) % 8 === 0) {
        process.stdout.write(`  pos ${Math.min(i + opts.batchSize, posDocs.length)}/${posDocs.length}\r`);
      }
    }
    console.log(`  pos ${posDocs.length}/${posDocs.length} done.`);

    const negTexts = negJobs.map(j => j.text);
    for (let i = 0; i < negTexts.length; i += opts.batchSize) {
      const chunk = negTexts.slice(i, i + opts.batchSize);
      const vecs = await embedBatch(opts.embedUrl, opts.embedModel, chunk);
      negVecs.push(...vecs);
    }
    console.log(`  neg ${negTexts.length}/${negTexts.length} done.`);
    dim = posVecs[0]?.length || 0;
  }

  // Pack float32 binary: [all posVecs..., all negVecs...]
  mkdirSync(opts.outDir, { recursive: true });
  const binFile = 'routing-index.v1.f32';
  const jsonFile = 'routing-index.v1.json';
  const binPath = join(opts.outDir, binFile);
  const jsonPath = join(opts.outDir, jsonFile);

  if (dim > 0) {
    const totalVecs = posVecs.length + negVecs.length;
    const packed = new Float32Array(totalVecs * dim);
    let offset = 0;
    for (const v of posVecs) { packed.set(v, offset); offset += dim; }
    for (const v of negVecs) { packed.set(v, offset); offset += dim; }
    const binTmp = `${binPath}.${process.pid}.tmp`;
    writeFileSync(binTmp, Buffer.from(packed.buffer));
    renameSync(binTmp, binPath);
  }

  const indexMeta = {
    version: 1,
    builtAt: new Date().toISOString(),
    catalogPath: opts.catalog,
    catalogSha256,
    skillCount: entries.length,
    negativeCount: negJobs.length,
    redirectCount: entries.reduce((sum, e) => sum + e.redirects.length, 0),
    embedModel: opts.embedModel,
    embedEndpoint: opts.embedUrl,
    dim,
    posOffset: 0,
    negOffset: posVecs.length,
    vectorsFile: dim > 0 ? binFile : null,
    relationshipGroups: catalog.relationship_groups || {},
    skills: entries,
  };

  const jsonTmp = `${jsonPath}.${process.pid}.tmp`;
  writeFileSync(jsonTmp, JSON.stringify(indexMeta, null, 2));
  renameSync(jsonTmp, jsonPath);

  const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`\nBuilt offline routing index in ${elapsedSec}s:`);
  console.log(`  JSON: ${jsonPath} (${entries.length} skills, ${negJobs.length} negative boundary clauses, ${indexMeta.redirectCount} redirect edges)`);
  if (dim > 0) console.log(`  BIN:  ${binPath} (${posVecs.length + negVecs.length} x ${dim} float32)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
