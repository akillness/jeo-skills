/**
 * Jev Unified Skill Routing Engine (v2)
 *
 * Single source of truth for skill routing across Jev harness, host plugins, and jeo-code:
 *  - Stage 0: Conversational / choice-reply abstention pre-gate (<1ms)
 *  - Stage 1: Multi-intent clause decomposition + boundary-aware hybrid retrieval
 *             (clean BM25 + local BGE-M3 dense + internal OpenSpace prior + RRF)
 *             + semantic/explicit Negative-Trigger Veto + semantic density floor
 *  - Stage 2: Calibrated qev-0.8b independent `fits` verification (no `which` softmax
 *             collapse, full positive + explicit `not_for` context)
 *  - Stage 3: Dynamic score-cliff cutoff (0 abstain / 2-5 single / 5-10 multi-intent)
 *             + relationship_groups companion promotion + 2-stage deferred metadata
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_ROUTING_INDEX_PATH = process.env.JEV_ROUTING_INDEX_PATH
  || join(homedir(), '.agents', 'jev', 'routing-index.v1.json');
export const DEFAULT_EMBED_ENDPOINT = process.env.JEV_EMBED_ENDPOINT
  || 'http://127.0.0.1:18018/v1/embeddings';
export const DEFAULT_EMBED_MODEL = process.env.JEV_EMBED_MODEL || 'bge-m3-Q8_0';
export const DEFAULT_RERANK_ENDPOINT = process.env.JEV_RERANK_ENDPOINT
  || 'http://127.0.0.1:18019/v1/rerank';
export const DEFAULT_RERANK_MODEL = process.env.JEV_RERANK_MODEL || 'bge-reranker-v2-m3';

const SINGLE_CHAR_KO_TECH = new Set(['웹', '앱', '깃', '봇', '맵', '뷰', '툴']);
// Expanded EN + KO stopwords — critically includes short confirmation words like "ok"
const STOPWORDS = new Set([
  // English function + conversational words
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'have', 'has', 'had',
  'what', 'when', 'where', 'which', 'how', 'why', 'who', 'whom', 'does', 'did', 'not',
  'but', 'all', 'any', 'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might',
  'are', 'was', 'were', 'been', 'being', 'you', 'your', 'our', 'their', 'they', 'them',
  'its', 'it', 'just', 'like', 'also', 'only', 'very', 'much', 'more', 'most', 'some',
  'such', 'then', 'than', 'about', 'after', 'before', 'over', 'under', 'here', 'there',
  'use', 'using', 'used', 'make', 'need', 'want', 'help', 'please', 'work', 'task', 'skill',
  'ok', 'okay', 'yes', 'yep', 'yeah', 'nope', 'no', 'nah', 'sure', 'fine', 'good', 'great',
  'thanks', 'thank', 'hello', 'hey', 'hi', 'bye', 'proceed', 'continue', 'ahead', 'looks',
  'sounds', 'option', 'choice', 'mean', 'means', 'difference', 'between', 'simple', 'terms',
  'explain', 'today', 'first', 'second', 'third', 'let', 'lets', 'one', 'two', 'three',
  'to', 'me', 'in', 'on', 'at', 'by', 'of', 'or', 'as', 'is', 'be', 'do', 'so', 'up', 'we', 'he', 'my', 'us', 'if', 'an',
  // Korean conversational / filler / particle stems
  '응', '네', '예', 'ㅇㅇ', '오키', '오케이', '좋아', '좋아요', '알겠어', '알겠습니다',
  '고마워', '고맙습니다', '감사', '감사해', '감사합니다', '계속', '진행', '진행해', '진행해줘',
  '허용', '옵션', '정도', '같아', '같은데', '잠깐만', '잠깐', '방금', '다시', '말한', '설명',
  '설명해줘', '설명해줄래', '알려줘', '해줘', '해주세요', '부탁해', '부탁합니다', '좀', '그냥',
  '그렇게', '이거', '그거', '저거', '말고', '아니', '맞아', '맞아요', '가자', '하자', '할게',
  '뭐야', '뭔가요', '무엇', '차이', '차이점', '개념', '간단하게', '간단히', '어떨까', '어때',
  '오늘', '내일', '어제', '현재', '우리', '에서', '으로', '이랑', '하고', '그리고', '다음',
  '까지', '통해', '대한', '위한', '관련', '방법', '체크', '하는', '거같아', '엉뚱한걸',
]);

// Lightweight KO -> EN query expansion for lexical stage (supplements BGE-M3 dense search)
const KO_QUERY_EXPANSIONS = {
  블렌더: ['blender'],
  리깅: ['rigging', 'rig'],
  웨이트: ['weight', 'skinning'],
  믹사모: ['mixamo'],
  모션: ['motion'],
  한글: ['hwp', 'hwpx'],
  파싱: ['parse', 'parsing', 'extract'],
  치환: ['replace', 'edit'],
  리액트: ['react'],
  넥스트: ['nextjs'],
  성능: ['performance', 'optimization'],
  최적화: ['optimization', 'performance'],
  코드리뷰: ['code-review', 'review'],
  리뷰: ['review'],
  스키마: ['schema', 'database'],
  데이터베이스: ['database', 'schema', 'sql'],
  마이그레이션: ['migration', 'schema'],
  쇼츠: ['shorts', 'video'],
  유튜브: ['youtube'],
  영상: ['video'],
  크롬: ['chrome', 'browser'],
  브라우저: ['browser', 'chrome'],
  헤드리스: ['headless', 'browser', 'cdp'],
  로그인: ['login', 'session', 'authentication'],
  세션: ['session'],
  로그: ['log', 'logs'],
  스택트레이스: ['stacktrace', 'log', 'debugging'],
  장애: ['outage', 'incident', 'log'],
  머지: ['merge', 'conflict'],
  충돌: ['conflict', 'merge'],
  기획서: ['prd', 'spec'],
  보안: ['security'],
  취약점: ['security', 'vulnerability'],
  인증: ['authentication', 'auth'],
  특허: ['patent', 'kipris'],
  옵시디언: ['obsidian'],
  세컨드: ['second-brain'],
  브레인: ['second-brain'],
  볼트: ['vault', 'obsidian'],
  위키: ['wiki'],
  조명: ['lighting'],
  셰이더: ['shaders', 'shader'],
  경쟁사: ['competitor', 'competitive'],
  배틀카드: ['battlecard', 'competitor'],
  포지셔닝: ['positioning'],
  리팩토링: ['refactoring', 'refactor'],
  아키텍처: ['architecture'],
  테스트: ['testing', 'test'],
  배포: ['deploy', 'deployment'],
  모니터링: ['monitoring', 'observability'],
  알림: ['alerting', 'monitoring'],
  접근성: ['accessibility', 'wcag', 'aria'],
  반응형: ['responsive'],
  디자인: ['design'],
  대시보드: ['dashboard'],
  도커: ['docker'],
  환경변수: ['env', 'environment'],
  인터뷰: ['interview', 'grill'],
  요구사항: ['requirements', 'spec'],
  리서치: ['research'],
  딥리서치: ['deep-research', 'research'],
  깃: ['git'],
  깃푸시: ['git', 'push', 'git-workflow'],
  깃허브: ['github', 'git'],
  커밋: ['commit', 'git'],
  푸시: ['push', 'git'],
  브랜치: ['branch', 'git'],
  서브에이전트: ['subagent', 'multi-agent', 'team'],
  에이전트: ['agent'],
  실측: ['benchmark', 'measure', 'eval'],
  검증: ['verification', 'verify', 'testing'],
  실동작검증: ['verification', 'verify', 'testing'],
  설치: ['install', 'setup'],
  개선: ['improve', 'optimize'],
  숏폼: ['shorts', 'video'],
  썸네일: ['thumbnail', 'youtube'],
  편집: ['edit', 'editing'],
  수정: ['edit', 'modify'],
  세컨브레인: ['second-brain', 'wiki'],
  지식: ['knowledge', 'wiki'],
  리렌더링: ['rerender', 'render', 'performance'],
  렌더링: ['rendering', 'render'],
  자동화: ['automation'],
  워크플로우: ['workflow'],
  프롬프트: ['prompt'],
  음성: ['tts', 'voice', 'audio'],
  나레이션: ['tts', 'voice'],
  사운드: ['sound', 'audio'],
  이펙트: ['vfx'],
  시장: ['market'],
  가격: ['pricing'],
  그래프: ['graph'],
  시맨틱: ['semantic', 'search'],
  온톨로지: ['ontology', 'rdf', 'owl'],
  벤치마크: ['benchmark', 'hyperfine'],
  프로파일링: ['profiling', 'profiler'],
  유니티: ['unity'],
  고도: ['godot'],
  언리얼: ['unreal'],
  쓰리제이에스: ['threejs', '3d'],
  스킬: ['skill'],
  웹: ['web'],
  앱: ['app'],
  봇: ['bot'],
  맵: ['map'],
  뷰: ['view'],
  툴: ['tool'],
};

// Conversational / non-skill pre-gate regexes
const CHOICE_ENUM_RE = /(?:^|[\s,])\d+\s*[.)]\s*[a-e](?=$|[\s,.)])/i;
const CHOICE_OPTION_KO_EN_RE = /\b(?:option\s*[a-e1-9]|choice\s*[a-e1-9])\b|(?:[1-9]\s*번\s*(?:옵션|으로|로|선택|가자)?|첫\s*번째|두\s*번째|세\s*번째)/i;
const META_FOLLOWUP_KO_RE = /(?:방금\s*(?:말한|설명한|보여준)|다시\s*설명|그거\s*말고|그렇게\s*(?:진행|해줘|하자)|계속\s*진행)/i;

// Concrete workflow/domain anchors that prevent Stage 0 from accidentally blocking real tasks
const DOMAIN_ANCHOR_RE = /\b(?:react|next\.?js|vue|svelte|angular|three\.?js|webgl|blender|unity|unreal|godot|mixamo|hwp|hwpx|kordoc|rhwp|sql|postgres|postgresql|mysql|bigquery|looker|supabase|firebase|genkit|vercel|docker|kubernetes|k8s|terraform|playwright|puppeteer|cdp|chrome|browser|mcp|fastmcp|langgraph|langsmith|langfuse|pydantic|dspy|a2a|rdf|owl|shacl|ontology|git|github|pr|ci\/cd|tdd|e2e|wcag|aria|a11y|csrf|xss|oauth|jwt|api|rest|graphql|prd|okr|gtm|kpi|tts|vfx|glb|gltf|fbx|smpl|obsidian|zvec|semble|graphify|mex|jev|openspace|harness|hyperfine|skill\.md|kipris|subagent|push|commit|review)\b|(?:블렌더|리깅|한글|리액트|넥스트|코드\s*리뷰|리뷰|스키마|마이그레이션|유튜브|쇼츠|숏폼|크롬|브라우저|로그\s*분석|스택트레이스|머지\s*충돌|기획서|보안|취약점|특허|옵시디언|세컨드?\s*브레인|쓰리제이에스|셰이더|경쟁사|배틀카드|리팩토링|아키텍처|배포|모니터링|접근성|반응형|디자인\s*시스템|대시보드|도커|환경변수|인터뷰|딥리서치|리서치|나레이션|이펙트|사운드|프로파일링|벤치마크|온톨로지|시맨틱\s*검색|지식\s*위키|코드\s*그래프|서브에이전트|깃푸시|깃허브|커밋|브랜치|실동작\s*검증)/i;
// Pure general-knowledge trivia/definition detector (only applied when NO domain anchor AND low dense score)
const PURE_CONCEPT_QA_RE = /(?:차이점?이?\s*뭐야|개념\s*(?:간단|쉽게)?\s*설명|무슨\s*뜻이야|날씨\s*(?:어떨까|어때)|what\s+is\s+the\s+difference\s+between|what\s+does\s+[^?]+\s+mean\b|explain\s+[^?]+\s+in\s+simple\s+terms)/i;

let cachedIndex = null;
let cachedIndexPath = null;
let cachedIndexMtimeMs = 0;

export function loadOfflineRoutingIndex(indexPath = DEFAULT_ROUTING_INDEX_PATH) {
  try {
    if (!existsSync(indexPath)) return null;
    const st = statSync(indexPath);
    if (cachedIndex && cachedIndexPath === indexPath && cachedIndexMtimeMs === st.mtimeMs) {
      return cachedIndex;
    }
    const meta = JSON.parse(readFileSync(indexPath, 'utf8'));
    let vectors = null;
    if (meta.vectorsFile && meta.dim > 0) {
      const binPath = join(dirname(indexPath), meta.vectorsFile);
      if (existsSync(binPath)) {
        const buf = readFileSync(binPath);
        vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      }
    }
    const byName = new Map();
    const skillNames = new Set();
    for (let i = 0; i < (meta.skills || []).length; i++) {
      const s = meta.skills[i];
      byName.set(s.name, { ...s, _idx: i });
      skillNames.add(s.name);
    }
    // Build member -> companion group members map from relationshipGroups
    const companionsBySkill = new Map();
    for (const [groupId, group] of Object.entries(meta.relationshipGroups || {})) {
      const members = Array.isArray(group?.members) ? group.members : (Array.isArray(group) ? group : []);
      for (const m of members) {
        if (!companionsBySkill.has(m)) companionsBySkill.set(m, new Set());
        for (const other of members) {
          if (other !== m) companionsBySkill.get(m).add(other);
        }
      }
    }

    cachedIndex = { meta, vectors, byName, skillNames, companionsBySkill, indexPath };
    cachedIndexPath = indexPath;
    cachedIndexMtimeMs = st.mtimeMs;
    return cachedIndex;
  } catch {
    return null;
  }
}

export function tokenizeClean(text) {
  const lower = String(text || '').toLowerCase();
  const raw = lower.match(/[a-z0-9][a-z0-9.+#/-]*|[가-힣]+/g) || [];
  const out = [];
  const seen = new Set();
  const add = t => {
    if (!t || STOPWORDS.has(t) || seen.has(t)) return;
    // Skip pure numbers, single-char Latin tokens, or non-tech single-char Hangul
    if (/^\d+$/.test(t) || (/^[a-z0-9]+$/.test(t) && t.length < 2)) return;
    if (/^[가-힣]$/.test(t) && !SINGLE_CHAR_KO_TECH.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const tok of raw) {
    if (/^[가-힣]$/.test(tok) && !SINGLE_CHAR_KO_TECH.has(tok)) continue;
    // Strip common trailing Korean postpositions/connectives for better matching
    let clean = tok;
    if (/^[가-힣]{3,}$/.test(tok)) {
      clean = tok.replace(/(?:에서|으로|이랑|까지|부터|하고|해서|처럼|보다|은|는|이|가|을|를|도|만|와|과|랑|로|에|의)$/, '');
      if (clean.length < 2) clean = tok;
    }
    add(clean);
    if (clean !== tok) add(tok);
    // Split hyphenated/slashed compounds while preserving the full token too
    if (/[/-]/.test(tok)) {
      for (const part of tok.split(/[/-]+/)) {
        if (part.length >= 2) add(part);
      }
    }
    // Expand known Korean technical stems to English equivalents (prefix or >=3-char compound match)
    for (const [koStem, enTerms] of Object.entries(KO_QUERY_EXPANSIONS)) {
      if (
        clean === koStem
        || (koStem.length >= 2 && tok.startsWith(koStem))
        || (koStem.length >= 3 && tok.includes(koStem))
      ) {
        for (const en of enTerms) add(en);
      }
    }
  }
  return out;
}

export function detectConversationalAbstention(task, knownSkillNames = null) {
  const trimmed = String(task || '').trim();
  if (!trimmed || trimmed.length < 2) {
    return { abstain: true, reason: 'abstention-empty' };
  }

  // If the prompt explicitly mentions a real catalog skill name (kebab-case >= 4 chars), never Stage-0 abstain
  const lower = trimmed.toLowerCase();
  if (knownSkillNames) {
    for (const m of lower.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)) {
      if (knownSkillNames.has(m[0])) return { abstain: false, reason: null };
    }
  }

  // If the prompt contains concrete technical/workflow domain anchors, do not Stage-0 abstain
  if (DOMAIN_ANCHOR_RE.test(trimmed)) {
    return { abstain: false, reason: null };
  }

  // 1. Numbered multiple-choice replies ("1.c, 2.a, 3. 2~3초 ok...", "1. c, 2. a, 3. a")
  if (CHOICE_ENUM_RE.test(trimmed) && trimmed.length <= 160) {
    return { abstain: true, reason: 'abstention-choice-reply' };
  }

  // 2. Short option picks ("좋아, 2번 옵션으로 가자", "Sounds great, let's do option B", "아니 그거 말고 첫 번째 걸로 해줘")
  if (CHOICE_OPTION_KO_EN_RE.test(trimmed) && trimmed.length <= 90) {
    return { abstain: true, reason: 'abstention-option-selection' };
  }

  // 3. Short meta-conversation follow-ups ("잠깐만, 방금 말한 거 다시 설명해줄래?", "응 그렇게 진행해줘")
  if (META_FOLLOWUP_KO_RE.test(trimmed) && trimmed.length <= 80) {
    return { abstain: true, reason: 'abstention-meta-followup' };
  }

  // 4. Pure acknowledgments / greetings / confirmations: zero substantive tokens left after clean tokenization
  const tokens = tokenizeClean(trimmed);
  if (tokens.length === 0) {
    return { abstain: true, reason: 'abstention-acknowledgment' };
  }

  // Very short 1-token chat utterances without any technical signal (e.g. "ok", "hello there")
  if (trimmed.length <= 24 && tokens.length <= 1 && !/[/-]/.test(trimmed)) {
    const single = tokens[0];
    if (single.length <= 4 || /^(?:hello|thanks|great|sounds|looks|good|nice|cool|awesome|perfect|alright|gotcha|understood|ready|wait|stop|cancel)$/.test(single)) {
      return { abstain: true, reason: 'abstention-short-chat' };
    }
  }

  return { abstain: false, reason: null };
}

export function decomposeIntents(task) {
  const full = String(task || '').trim();
  if (!full) return [];
  // Split compound prompts on Korean & English multi-task delimiters (including sentence periods and 해서/하고)
  const rawParts = full
    .split(/(?:(?:\.|!|\?)\s+|\s+(?:그리고|및|그다음|다음으로|and then|and also|and|then)\s+|(?:하고|해서|한\s*뒤|한\s*다음|한\s*후|으면서|며)(?=[,\s])|[,;+\n]+)/i)
    .map(p => p.trim().replace(/[.!?]+$/, '').trim())
    .filter(p => p.length >= 3);

  // Deduplicate and cap to at most 5 meaningful atomic positive clauses (skip negation-only tails like "not Unity")
  const unique = [];
  const seen = new Set();
  for (const p of rawParts) {
    const k = p.toLowerCase();
    if (k === full.toLowerCase() || seen.has(k)) continue;
    if (/^(?:not|never|without|instead\s+of|rather\s+than|말고|없이|제외)\b/i.test(p)) continue;
    const toks = tokenizeClean(p);
    const hasAnchor = DOMAIN_ANCHOR_RE.test(p);
    if (toks.length < 2 && !(hasAnchor && p.length >= 3 && toks.length >= 1)) continue;
    if (!hasAnchor && p.length < 10) continue;
    seen.add(k);
    unique.push(p);
    if (unique.length >= 5) break;
  }
  return unique.length >= 2 ? unique : [];
}

/**
 * Detect explicit user negations in the prompt ("not Vercel", "not Unity", "without Docker",
 * "without reusing my logged-in Chrome tab", "rather than building a Looker dashboard",
 * "without rewriting our whole design token system").
 */
export function extractExplicitNegations(task) {
  const lower = String(task || '').toLowerCase();
  const negatedPhrases = [];
  const patterns = [
    /\(\s*not\s+([^)]{2,50})\)/gi,
    /\b(?:not|never)\s+(?:using\s+|for\s+|a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9._-]*(?:\s+[a-z0-9][a-z0-9._-]*){0,3})/gi,
    /\b(?:without|instead\s+of|rather\s+than)\s+([^,.;!?]{3,65})/gi,
    /([가-힣a-z0-9][가-힣a-z0-9\s._-]{1,30}?)\s*(?:말고|없이|제외하고|대신에)/gi,
  ];
  for (const re of patterns) {
    for (const m of lower.matchAll(re)) {
      const phrase = (m[1] || '').trim();
      if (phrase.length >= 2) negatedPhrases.push(phrase);
    }
  }
  return negatedPhrases;
}

function matchesExplicitNegation(skillName, positiveText, negatedPhrases) {
  if (!negatedPhrases.length) return false;
  const nameLower = skillName.toLowerCase();
  const nameParts = nameLower.split('-').filter(p => p.length >= 3 && !STOPWORDS.has(p));

  for (const phrase of negatedPhrases) {
    // 1. Direct skill name or distinctive brand/tool token negated ("not Vercel" -> vercel-deploy, "not Unity" -> unity-gamedev-skill-pack, "rather than Looker" -> looker-studio-bigquery)
    if (phrase.includes(nameLower)) return true;
    const brandTokens = nameParts.filter(p => !['system', 'setup', 'best', 'practices', 'design', 'web', 'game', 'development', 'analysis', 'automation', 'performance', 'optimization', 'testing', 'code', 'review', 'agent', 'skills', 'skill', 'pack', 'fundamentals'].includes(p));
    for (const bt of brandTokens) {
      if (new RegExp(`\\b${bt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(phrase)) {
        return true;
      }
    }
    // 2. Semantic phrase matches core identity of a sibling skill
    if (skillName === 'system-environment-setup' && /\b(?:docker|devcontainer|local\s+machine|toolchain)\b/i.test(phrase)) return true;
    if (skillName === 'playwriter' && /\b(?:reus(?:e|ing)\b.*(?:chrome|tab|session|login|logged-in)|already[- ]open\s+tab)\b/i.test(phrase)) return true;
    if (skillName === 'design-system' && /\b(?:design\s+token|design\s+system)\b/i.test(phrase)) return true;
    if (skillName === 'looker-studio-bigquery' && /\b(?:looker|dashboard)\b/i.test(phrase)) return true;
    if (skillName === 'vercel-deploy' && /\bvercel\b/i.test(phrase)) return true;
    if (skillName === 'unity-gamedev-skill-pack' && /\bunity\b/i.test(phrase)) return true;
  }
  return false;
}

/**
 * Clean, boundary-aware lexical scorer (fixes the unanchored `includes("ok")` bug and
 * scores strictly against positiveText + structured metadata + koAliases — NEVER negativeText).
 */
export function scoreLexicalBoundaryAware(queryTokens, entry) {
  if (!queryTokens.length) return 0;
  const nameLower = entry.name.toLowerCase();
  const nameTokens = new Set(nameLower.split(/[-_]+/));
  const tagTokens = new Set((entry.tags || []).flatMap(t => String(t).toLowerCase().split(/[-_\s]+/)));
  const posLower = (entry.positiveText || entry.description || '').toLowerCase();
  const koLower = (entry.koAliases || '').toLowerCase();
  const koTokens = new Set(koLower.split(/\s+/).filter(Boolean));
  const catLower = `${entry.category || ''} ${entry.subcategory || ''}`.toLowerCase();

  let score = 0;
  let hits = 0;

  for (const term of queryTokens) {
    let termScore = 0;
    const isHangul = /^[가-힣]+$/.test(term);

    if (term === nameLower) {
      termScore = Math.max(termScore, 5.0);
    } else if (nameTokens.has(term)) {
      termScore = Math.max(termScore, 2.8);
    }

    if (tagTokens.has(term)) {
      termScore = Math.max(termScore, 1.8);
    }

    if (isHangul) {
      if (koTokens.has(term)) {
        termScore = Math.max(termScore, 2.1);
      } else if (term.length >= 2 && koLower.includes(term)) {
        termScore = Math.max(termScore, 1.4);
      } else if (term.length >= 2 && posLower.includes(term)) {
        termScore = Math.max(termScore, 1.5);
      }
    } else if (term.length >= 3) {
      // Strict word-boundary match in positive description / category (NO unanchored substring hits!)
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
      if (re.test(posLower)) termScore = Math.max(termScore, 1.2);
      else if (re.test(catLower)) termScore = Math.max(termScore, 0.8);
    }

    if (termScore > 0) {
      score += termScore;
      hits++;
    }
  }

  // Coverage bonus rewards matching multiple distinct query tokens
  if (hits >= 2) score += Math.min(2.5, (hits / queryTokens.length) * 2.0);
  return score;
}

export async function embedTexts(texts, { endpoint = DEFAULT_EMBED_ENDPOINT, model = DEFAULT_EMBED_MODEL, timeoutMs = 1500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const rows = (payload.data || []).sort((a, b) => a.index - b.index);
    return rows.map(r => {
      const v = Float32Array.from(r.embedding);
      let norm = 0;
      for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < v.length; i++) v[i] /= norm;
      return v;
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function dotAt(qVec, flatVectors, vecIdx, dim) {
  if (!qVec || !flatVectors || dim <= 0 || qVec.length !== dim) return 0;
  const off = vecIdx * dim;
  if (off < 0 || off + dim > flatVectors.length) return 0;
  let sum = 0;
  for (let i = 0; i < dim; i++) sum += qVec[i] * flatVectors[off + i];
  return Number.isFinite(sum) ? sum : 0;
}

const EDIT_MUTATE_INTENT_RE = /(?:편집|수정|치환|바꿔|바꾸|변경|덮어쓰|작성\s*저장|\bedit(?:ing)?\b|\bmodif(?:y|ying)\b|\breplace\b|\bmutate\b|\bwrite\s+back\b)/i;
const READ_ONLY_SKILL_RE = /\b(?:read[-\s]?only|read\/convert\s+only|parse[-\s]?only|do not use for (?:binary )?editing|for (?:binary )?editing[^.;]{0,50}\buse\b)/i;
const LOCAL_OSS_INTENT_RE = /(?:로컬|오픈소스|무료\s*로컬|\blocal\b|\bopen[- ]?source\b|\bself[- ]?hosted\b)/i;
const PAID_CLOUD_ONLY_RE = /\b(?:higgsfield|paid\s+cloud|commercial\s+api|hosted\s+saas|subscription\s+required)\b/i;
const GAME_INTENT_RE = /\b(?:game|games|gaming|unity|unreal|godot|shader|shaders|vfx|fps|rpg|npc|mixamo|rigging|voxel|sprite|gameplay|player|level\s+design|boss|ability|three\.?js|webgl|blender|3d\s+(?:model|scene|character|asset|game|animation))\b|(?:게임|유니티|언리얼|고도|셰이더|보스|캐릭터\s*리깅|스킬\s*이펙트|블렌더|쓰리제이에스|복셀|이펙트|사운드|게임\s*개발|게임\s*엔진|게임\s*빌드)/i;

/**
 * General functional & domain polarity veto (zero skill-name hardcoding):
 *  - Prevents read-only/parse-only skills from leaking onto binary edit/mutate prompts
 *  - Prevents game-development domain skills from leaking onto non-game web/backend/devops prompts
 *  - Nudges cloud-only paid skills down when the prompt explicitly asks for local/open-source tools
 */
export function matchesFunctionalPolarityVeto(task, entry) {
  const prompt = String(task || '');
  const desc = `${entry?.positiveText || ''} ${entry?.negativeText || ''}`;
  let penalty = 0;
  let hardVeto = false;
  if (EDIT_MUTATE_INTENT_RE.test(prompt) && READ_ONLY_SKILL_RE.test(desc)) {
    penalty += 0.65;
    hardVeto = true;
  }
  const isGameSkill = entry?.category === 'game-development' || /^game-/.test(entry?.name || '');
  if (isGameSkill && !GAME_INTENT_RE.test(prompt)) {
    penalty += 0.40;
    hardVeto = true;
  }
  if (
    LOCAL_OSS_INTENT_RE.test(prompt)
    && PAID_CLOUD_ONLY_RE.test(desc)
    && !/\b(?:open[- ]?source|self[- ]?hosted|local)\b/i.test(entry?.positiveText || '')
  ) {
    penalty += 0.35;
  }
  return { penalty, hardVeto };
}

/**
 * Stage 1: Hybrid Multi-Intent Retrieval + Negative-Trigger Veto + Semantic Floor
 */
export async function retrieveHybridShortlist(task, catalogSkills, {
  shortlistLimit = 18,
  openspacePriorMap = null,
  indexPath = DEFAULT_ROUTING_INDEX_PATH,
  embedEndpoint = DEFAULT_EMBED_ENDPOINT,
  embedModel = DEFAULT_EMBED_MODEL,
  disableDense = false,
} = {}) {
  const t0 = performance.now();
  const offline = loadOfflineRoutingIndex(indexPath);
  const knownSkillNames = offline?.skillNames || new Set(catalogSkills.map(s => s.name));

  // Stage 0: Deterministic conversational / choice-reply abstention pre-gate
  const preAbstain = detectConversationalAbstention(task, knownSkillNames);
  if (preAbstain.abstain) {
    return {
      abstained: true,
      abstainReason: preAbstain.reason,
      subQueries: [],
      candidates: [],
      denseActive: false,
      stats: { maxDense: 0, denseGap: 0, maxLex: 0, stage1Ms: performance.now() - t0 },
    };
  }

  const subQueries = decomposeIntents(task);
  const isMultiIntent = subQueries.length >= 2;
  const negatedPhrases = extractExplicitNegations(task);
  const fullTokens = tokenizeClean(task);
  const subTokenLists = subQueries.map(q => tokenizeClean(q));

  // Map catalogSkills onto index entries (fallback to raw catalog if offline index missing)
  const items = catalogSkills.map(skill => {
    const idxEntry = offline?.byName.get(skill.name) || null;
    return {
      skill,
      entry: idxEntry || {
        name: skill.name,
        category: skill.category || '',
        subcategory: skill.subcategory || '',
        path: skill.path || `${skill.name}/SKILL.md`,
        tags: skill.tags || [],
        positiveText: skill.description || '',
        negativeText: '',
        redirects: [],
        koAliases: '',
        toonHint: '',
        posVecIndex: -1,
        negVecIndex: -1,
      },
    };
  });

  // Batch embed [fullPrompt, ...subQueries] in ONE HTTP round-trip (~20-35ms on M2 Pro Metal)
  let qVecs = null;
  const dim = offline?.meta.dim || 0;
  const canDense = !disableDense && Boolean(offline?.vectors && dim > 0);
  if (canDense) {
    qVecs = await embedTexts([task, ...subQueries], { endpoint: embedEndpoint, model: embedModel });
  }
  const denseActive = Boolean(qVecs && qVecs.length >= 1 && qVecs[0]?.length === dim);
  const flatVecs = offline?.vectors || null;
  const negOffset = offline?.meta.negOffset || 0;

  // Score every skill across dense + lexical + negative boundary
  const scored = items.map(({ skill, entry }) => {
    const lexFull = scoreLexicalBoundaryAware(fullTokens, entry);
    let lexSubMax = 0;
    const lexBySub = subTokenLists.map(toks => {
      const s = scoreLexicalBoundaryAware(toks, entry);
      if (s > lexSubMax) lexSubMax = s;
      return s;
    });
    const lexScore = isMultiIntent ? Math.max(lexFull, lexSubMax * 1.15) : lexFull;

    let denseFull = 0;
    let denseSubMax = 0;
    let denseBySub = [];
    let negSim = 0;

    if (denseActive && entry.posVecIndex >= 0) {
      denseFull = dotAt(qVecs[0], flatVecs, entry.posVecIndex, dim);
      if (isMultiIntent) {
        denseBySub = qVecs.slice(1).map(sv => dotAt(sv, flatVecs, entry.posVecIndex, dim));
        denseSubMax = Math.max(...denseBySub);
      }
      if (entry.negVecIndex >= 0) {
        negSim = dotAt(qVecs[0], flatVecs, negOffset + entry.negVecIndex, dim);
        if (isMultiIntent) {
          for (const sv of qVecs.slice(1)) {
            const ns = dotAt(sv, flatVecs, negOffset + entry.negVecIndex, dim);
            if (ns > negSim) negSim = ns;
          }
        }
      }
    }

    const denseScore = isMultiIntent
      ? Math.max(denseFull, 0.30 * denseFull + 0.70 * denseSubMax)
      : denseFull;

    const explicitNegated = matchesExplicitNegation(entry.name, entry.positiveText, negatedPhrases);
    const polarityVeto = matchesFunctionalPolarityVeto(task, entry);
    // Semantic negative boundary veto: only fires when negative clause strictly beats positive cosine
    // (subtle sibling boundaries like playwriter <-> browser-harness are resolved in Stage 3 via Redirect-Sibling Dominance).
    const negMargin = denseActive && entry.negVecIndex >= 0 ? (negSim - denseScore) : -1;
    const semanticNegVeto = negSim >= 0.56 && negMargin >= 0.01;
    let vetoPenalty = polarityVeto.penalty;
    if (explicitNegated) vetoPenalty += 0.55;
    if (semanticNegVeto) vetoPenalty += Math.min(0.42, (negMargin + 0.05) * 2.8);
    const openspacePrior = openspacePriorMap?.get(entry.name) || 0;
    return {
      skill,
      entry,
      lexFull,
      lexSubMax,
      lexBySub,
      lexScore,
      denseFull,
      denseSubMax,
      denseBySub,
      denseScore,
      negSim,
      negMargin,
      explicitNegated,
      functionalVeto: polarityVeto.hardVeto,
      semanticNegVeto,
      vetoPenalty,
      openspacePrior,
      rrf: 0,
      clauseOwner: -1,
    };
  });

  // Compute global dense distribution stats BEFORE veto/ranking for calibrated abstention
  let maxDense = 0;
  let denseGap = 0;
  let maxLex = 0;
  for (const s of scored) {
    if (s.lexScore > maxLex) maxLex = s.lexScore;
  }
  if (denseActive) {
    const denseSorted = scored.map(s => s.denseFull).sort((a, b) => b - a);
    maxDense = denseSorted[0] || 0;
    const top20 = denseSorted[Math.min(19, denseSorted.length - 1)] || 0;
    denseGap = maxDense - top20;
    const maxEffectiveDense = Math.max(maxDense, ...scored.map(s => s.denseScore));

    // Pre-Stage-2 Semantic Density Floor:
    // Empirical distribution over 471 skills:
    //  - General Q&A / trivia / chat ("TCP vs UDP", "HTTP 429", "서울 날씨", "list vs tuple"):
    //    maxDense = 0.396..0.487, gap = 0.024..0.062
    //  - Valid technical skill prompts: maxDense = 0.545..0.811, gap = 0.064..0.301
    const isPureConceptQa = PURE_CONCEPT_QA_RE.test(task) && !DOMAIN_ANCHOR_RE.test(task);
    if (isPureConceptQa && maxEffectiveDense < 0.57) {
      return {
        abstained: true,
        abstainReason: 'abstention-concept-qa',
        subQueries,
        candidates: [],
        denseActive: true,
        stats: { maxDense, maxEffectiveDense, denseGap, maxLex, stage1Ms: performance.now() - t0 },
      };
    }
    if (maxEffectiveDense < 0.515 && maxLex < 2.5) {
      return {
        abstained: true,
        abstainReason: 'abstention-semantic-floor',
        subQueries,
        candidates: [],
        denseActive: true,
        stats: { maxDense, maxEffectiveDense, denseGap, maxLex, stage1Ms: performance.now() - t0 },
      };
    }
    if (maxEffectiveDense < 0.54 && denseGap < 0.055 && maxLex < 2.2) {
      return {
        abstained: true,
        abstainReason: 'abstention-flat-distribution',
        subQueries,
        candidates: [],
        denseActive: true,
        stats: { maxDense, maxEffectiveDense, denseGap, maxLex, stage1Ms: performance.now() - t0 },
      };
    }
  } else if (maxLex <= 0) {
    return {
      abstained: true,
      abstainReason: 'abstention-no-lexical-signal',
      subQueries,
      candidates: [],
      denseActive: false,
      stats: { maxDense: 0, denseGap: 0, maxLex: 0, stage1Ms: performance.now() - t0 },
    };
  }

  // Reciprocal Rank Fusion (k = 60) across full dense, full lexical, sub-clause dense/lexical, and OpenSpace prior
  const RRF_K = 60;
  const addRankList = (list, weight, limit = 60) => {
    for (let i = 0; i < Math.min(list.length, limit); i++) {
      list[i].rrf += weight / (RRF_K + i + 1);
    }
  };

  if (denseActive) {
    const byDenseFull = [...scored].sort((a, b) => (b.denseFull - b.vetoPenalty * 0.4) - (a.denseFull - a.vetoPenalty * 0.4));
    addRankList(byDenseFull, 1.5, 80);
  }
  const byLexFull = scored.filter(s => s.lexFull > 0).sort((a, b) => b.lexFull - a.lexFull);
  addRankList(byLexFull, denseActive ? 0.95 : 1.8, 60);

  // Per-clause ranking & guaranteed representation for multi-intent queries
  const clauseTopWinners = [];
  if (isMultiIntent) {
    const clauseWeight = 1.35 / subQueries.length;
    for (let ci = 0; ci < subQueries.length; ci++) {
      if (denseActive) {
        const bySubDense = [...scored].sort((a, b) =>
          ((b.denseBySub[ci] || 0) - b.vetoPenalty * 0.4) - ((a.denseBySub[ci] || 0) - a.vetoPenalty * 0.4)
        );
        addRankList(bySubDense, clauseWeight * 1.3, 40);
        // Reserve top-3 non-negated winners from each intent clause
        let picked = 0;
        for (const cand of bySubDense) {
          if (cand.explicitNegated || cand.functionalVeto) continue;
          if ((cand.denseBySub[ci] || 0) >= 0.48) {
            if (cand.clauseOwner === -1) cand.clauseOwner = ci;
            clauseTopWinners.push({ cand, ci });
            if (++picked >= 3) break;
          }
        }
      }
      const bySubLex = scored.filter(s => (s.lexBySub[ci] || 0) > 0).sort((a, b) => (b.lexBySub[ci] || 0) - (a.lexBySub[ci] || 0));
      addRankList(bySubLex, clauseWeight * 0.95, 30);
      // Always reserve top-2 strong lexical clause winners (e.g. exact KO/EN terms like 딥리서치, 깃푸시)
      for (const cand of bySubLex.slice(0, 2)) {
        if (!cand.explicitNegated && !cand.functionalVeto && (!denseActive || (cand.lexBySub[ci] || 0) >= 2.2)) {
          if (cand.clauseOwner === -1) cand.clauseOwner = ci;
          clauseTopWinners.push({ cand, ci });
        }
      }
    }
  }

  // Internal OpenSpace prior boost
  if (openspacePriorMap && openspacePriorMap.size > 0) {
    for (const s of scored) {
      if (s.openspacePrior > 0 && !s.explicitNegated && !s.functionalVeto) {
        s.rrf += 0.008 * s.openspacePrior;
      }
    }
  }

  // Redirect boost: if a high-dense skill was vetoed (negative boundary / functional polarity hit), nudge its validated redirect targets!
  const byNameScored = new Map(scored.map(s => [s.entry.name, s]));
  for (const s of scored) {
    if ((s.semanticNegVeto || s.explicitNegated || s.functionalVeto) && s.entry.redirects?.length && (s.denseScore >= 0.46 || s.negSim >= 0.50 || s.lexScore >= 2.0)) {
      for (const red of s.entry.redirects) {
        for (const targetName of red.targets || []) {
          const target = byNameScored.get(targetName);
          if (target && !target.explicitNegated && !target.functionalVeto && (!denseActive || target.denseScore >= 0.42 || target.lexScore >= 1.5)) {
            target.rrf += 0.014;
          }
        }
      }
    }
  }

  // Apply veto penalty to RRF ordering
  for (const s of scored) {
    if (s.explicitNegated || s.functionalVeto) s.rrf *= 0.12;
    else if (s.semanticNegVeto || s.vetoPenalty > 0) s.rrf *= Math.max(0.30, 1 - s.vetoPenalty * 1.4);
  }

  scored.sort((a, b) => b.rrf - a.rrf || b.denseScore - a.denseScore || b.lexScore - a.lexScore);

  // Build diverse shortlist: interleave per-clause winners first on multi-intent prompts so
  // every sub-intent enters Stage 2 before filling remaining slots by global RRF, with a
  // subcategory diversity cap so one loud domain cannot monopolize a compound prompt's slots.
  const selected = [];
  const selectedNames = new Set();
  const subcatCounts = new Map();
  const limit = isMultiIntent
    ? Math.min(Math.max(shortlistLimit, 20), 24)
    : Math.min(Math.max(shortlistLimit, 14), 18);
  const maxPerSubcat = isMultiIntent ? 4 : 7;
  const subcatKey = cand => `${cand.entry.category || ''}/${cand.entry.subcategory || ''}`;
  const trySelect = cand => {
    if (!cand || selectedNames.has(cand.entry.name) || cand.explicitNegated || cand.functionalVeto || selected.length >= limit) return false;
    const k = subcatKey(cand);
    const cnt = subcatCounts.get(k) || 0;
    if (cnt >= maxPerSubcat) return false;
    selected.push(cand);
    selectedNames.add(cand.entry.name);
    subcatCounts.set(k, cnt + 1);
    return true;
  };

  if (isMultiIntent) {
    // Round-robin pick top 3 winners per clause first (preserving both dense & lexical hits)
    const byClause = new Map();
    for (const { cand, ci } of clauseTopWinners) {
      if (!byClause.has(ci)) byClause.set(ci, []);
      const arr = byClause.get(ci);
      if (!arr.includes(cand)) arr.push(cand);
    }
    for (let rank = 0; rank < 3; rank++) {
      for (let ci = 0; ci < subQueries.length; ci++) {
        const list = byClause.get(ci) || [];
        trySelect(list[rank]);
      }
    }
  }

  for (const cand of scored) {
    if (selected.length >= limit) break;
    if (denseActive ? (cand.denseScore < 0.42 && cand.lexScore < 1.5) : (cand.lexScore <= 0)) continue;
    trySelect(cand);
  }

  return {
    abstained: selected.length === 0,
    abstainReason: selected.length === 0 ? 'abstention-empty-shortlist' : null,
    subQueries,
    isMultiIntent,
    hasKorean: /[가-힣]/.test(task),
    candidates: selected,
    denseActive,
    companionsBySkill: offline?.companionsBySkill || new Map(),
    stats: {
      maxDense: Number(maxDense.toFixed(4)),
      denseGap: Number(denseGap.toFixed(4)),
      maxLex: Number(maxLex.toFixed(2)),
      stage1Ms: Number((performance.now() - t0).toFixed(1)),
      negatedPhrases,
    },
  };
}

/**
 * Build calibrated Stage-2 qev-0.8b questions:
 *  - NO `which` single-choice softmax (prevents multi-intent cannibalization!)
 *  - Full positive description + explicit `not_for` boundary exclusions (prevents false positives!)
 *  - Includes `ko_hints` for Korean prompts so 0.8B SLM bridges brand/domain terms cleanly
 *  - Improved `gate::prose_suffices` wording
 */
export function buildCalibratedStage2Questions(task, stage1Candidates, { includeGate = true } = {}) {
  const hasKorean = /[가-힣]/.test(task);
  const questions = {};
  if (includeGate) {
    questions['gate::prose_suffices'] = {
      type: 'noul',
      instructions: "Can a knowledgeable assistant answer the user's request completely in plain prose (e.g. a greeting, choice reply, confirmation, or simple general concept explanation) WITHOUT loading any specialized domain skill workflow?",
      state: {
        request: task,
        top_candidate_names: stage1Candidates.slice(0, 6).map(c => c.entry.name),
      },
    };
  }
  for (const c of stage1Candidates) {
    const candidateState = {
      name: c.entry.name,
      category: `${c.entry.category}/${c.entry.subcategory}`,
      purpose: (c.entry.positiveText || c.skill.description || '').slice(0, 400),
    };
    if (hasKorean && c.entry.koAliases) {
      candidateState.ko_hints = c.entry.koAliases.slice(0, 140);
    }
    if (c.entry.negativeText) {
      candidateState.not_for_exclusions = c.entry.negativeText.slice(0, 240);
    }
    if (c.entry.tags?.length) {
      candidateState.tags = c.entry.tags.slice(0, 8);
    }
    questions[`fits::${c.entry.name}`] = {
      type: 'noul',
      instructions: `Does the skill \`${c.entry.name}\` genuinely help accomplish at least one concrete part of the user's \`request\`, without falling under its \`not_for_exclusions\`?`,
      state: {
        request: task,
        candidate: candidateState,
      },
    };
  }
  return questions;
}

export function rerankLogitToProb(logit) {
  if (!Number.isFinite(logit)) return 0;
  // Smooth calibration across bge-reranker-v2-m3 raw logit range [-11, +6]:
  //   +4.0 -> 0.916, 0.0 -> 0.700, -1.5 -> 0.567, -3.5 -> 0.378, -6.5 -> 0.161, -9.5 -> 0.057
  return 1 / (1 + Math.exp(-(logit + 2.2) / 2.6));
}

function buildRerankDoc(c, hasKorean) {
  // NEVER inject `negativeText` ("NOT FOR: ...") into the cross-encoder doc — cross-encoders
  // attend to mentioned keywords rather than logically negating them. Negative boundary vetoes
  // are handled by Stage-1's dedicated `negVecIndex` + explicit/polarity veto filters.
  const pos = (c.entry.positiveText || c.skill.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const tags = (c.entry.tags || []).slice(0, 6).join(', ');
  const ko = hasKorean && c.entry.koAliases ? ` | ${c.entry.koAliases.slice(0, 110)}` : '';
  return `${c.entry.name} (${c.entry.category}/${c.entry.subcategory}): ${pos}${tags ? ` [${tags}]` : ''}${ko}`;
}

async function fetchRerankBatch(query, documents, { endpoint, model, timeoutMs }) {
  if (!documents.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, query, documents }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const rows = Array.isArray(payload.results) ? payload.results : [];
    if (rows.length !== documents.length) return null;
    const logits = new Array(documents.length).fill(-10);
    for (const r of rows) {
      if (Number.isInteger(r.index) && r.index >= 0 && r.index < documents.length && Number.isFinite(r.relevance_score)) {
        logits[r.index] = r.relevance_score;
      }
    }
    return logits;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stage 2A: Multilingual Cross-Encoder Reranking via local BAAI/bge-reranker-v2-m3.
 *  - Single-intent / compact prompts: ONE batched /v1/rerank call across Stage-1 candidates (~300-420ms on Metal).
 *  - Long compound multi-intent prompts: Parallel full-query + top-3 clause batches (6 candidates/clause),
 *    blended as `effectiveLogit = 0.52 * fullLogit + 0.48 * max(fullLogit, maxSubLogit)` so secondary intents
 *    get a strong lift without allowing domain-mismatched isolated clause matches to hijack full-query context.
 *  - Returns `null` on timeout/connection failure so caller falls back seamlessly to qev-0.8b.
 */
export async function rerankWithCrossEncoder(task, stage1, {
  endpoint = DEFAULT_RERANK_ENDPOINT,
  model = DEFAULT_RERANK_MODEL,
  timeoutMs = Number(process.env.JEV_RERANK_TIMEOUT_MS) || 2200,
} = {}) {
  const candidates = stage1?.candidates || [];
  if (!candidates.length) return null;
  const t0 = performance.now();
  const hasKorean = Boolean(stage1.hasKorean);
  const docs = candidates.map(c => buildRerankDoc(c, hasKorean));
  const useClauseRerank = Boolean(stage1.isMultiIntent && String(task || '').trim().length >= 50);
  const subQueries = useClauseRerank ? (stage1.subQueries || []).slice(0, 5) : [];
  const perClauseDocs = 5;

  const fullPromise = fetchRerankBatch(task, docs, { endpoint, model, timeoutMs });

  const clauseSpecs = subQueries.map((sq, ci) => {
    const idxs = candidates
      .map((c, idx) => ({
        idx,
        aff: (c.clauseOwner === ci ? 0.25 : 0) + (c.denseBySub?.[ci] || 0) + Math.min(0.4, (c.lexBySub?.[ci] || 0) * 0.08),
      }))
      .sort((a, b) => b.aff - a.aff)
      .slice(0, Math.min(perClauseDocs, candidates.length))
      .map(x => x.idx);
    return { ci, sq, idxs, docs: idxs.map(i => docs[i]) };
  });

  const [fullLogits, ...clauseLogitLists] = await Promise.all([
    fullPromise,
    ...clauseSpecs.map(spec => fetchRerankBatch(spec.sq, spec.docs, { endpoint, model, timeoutMs })),
  ]);

  if (!fullLogits) return null;

  const byName = new Map();
  for (let i = 0; i < candidates.length; i++) {
    const name = candidates[i].entry.name;
    const fullLogit = fullLogits[i];
    const subLogits = new Array(subQueries.length).fill(null);
    let maxSubLogit = -Infinity;
    for (let s = 0; s < clauseSpecs.length; s++) {
      const list = clauseLogitLists[s];
      if (!list) continue;
      const pos = clauseSpecs[s].idxs.indexOf(i);
      if (pos !== -1) {
        subLogits[s] = list[pos];
        if (list[pos] > maxSubLogit) maxSubLogit = list[pos];
      }
    }
    // Context-preserving blend: boosts genuine secondary intents while preventing
    // an isolated sub-clause from overriding a strong full-query domain mismatch.
    const bestLogit = Number.isFinite(maxSubLogit)
      ? (0.52 * fullLogit + 0.48 * Math.max(fullLogit, maxSubLogit))
      : fullLogit;
    byName.set(name, {
      fullLogit,
      maxSubLogit: Number.isFinite(maxSubLogit) ? maxSubLogit : null,
      bestLogit,
      subLogits,
      prob: rerankLogitToProb(bestLogit),
    });
  }

  return {
    byName,
    model,
    endpoint,
    rerankMs: Number((performance.now() - t0).toFixed(1)),
    clauseBatches: clauseSpecs.length,
  };
}

function summarizeFitReason(entry, skill) {
  const src = (entry?.positiveText || skill?.description || '').replace(/\s+/g, ' ').trim();
  const firstSentence = src.split(/(?<=[.!?])\s+/)[0] || src;
  return firstSentence.length > 115 ? `${firstSentence.slice(0, 112).trim()}...` : firstSentence;
}

/**
 * Stage 3: Fuse Stage-1 hybrid signals + Stage-2 (cross-encoder reranker OR calibrated qev `fits`)
 * + Redirect-Sibling Dominance + dynamic Score/Logit-Cliff cutoff + companion promotion + 2-stage deferred formatting.
 */
export function finalizeDynamicSelection({
  stage1,
  rerankScores = null,
  qevAnswers = null,
  topK = 10,
  catalogRoot = null,
}) {
  const { candidates, denseActive, isMultiIntent, hasKorean, subQueries, companionsBySkill, stats } = stage1;
  if (!candidates.length) {
    return { topK: [], gate: 0, abstained: true, reason: stage1.abstainReason || 'abstention-empty' };
  }

  const rerankActive = Boolean(rerankScores?.byName && rerankScores.byName.size > 0);
  const maxLex = Math.max(1, ...candidates.map(c => c.lexScore));
  const proseSuffices = qevAnswers?.['gate::prose_suffices']?.probability ?? null;
  const gateScore = proseSuffices !== null ? (1 - proseSuffices) : null;

  // Compute unified calibrated score per candidate
  const ranked = candidates.map(c => {
    const rr = rerankActive ? (rerankScores.byName.get(c.entry.name) || null) : null;
    const fitsRaw = qevAnswers?.[`fits::${c.entry.name}`]?.probability ?? null;
    // Calibrate BGE-M3 cosine [0.42 .. 0.78] -> [0 .. 1]
    const denseCal = denseActive ? Math.max(0, Math.min(1, (c.denseScore - 0.42) / 0.34)) : 0;
    const lexCal = Math.min(1, c.lexScore / Math.max(4.5, maxLex));
    const rrfCal = Math.min(1, c.rrf / 0.045);

    let score;
    if (rr !== null) {
      if (denseActive) {
        score = 0.46 * rr.prob + 0.36 * denseCal + 0.11 * lexCal + 0.07 * rrfCal;
      } else {
        score = 0.72 * rr.prob + 0.20 * lexCal + 0.08 * rrfCal;
      }
    } else if (fitsRaw !== null) {
      if (denseActive) {
        score = hasKorean
          ? (0.36 * fitsRaw + 0.44 * denseCal + 0.12 * lexCal + 0.08 * rrfCal)
          : (0.44 * fitsRaw + 0.38 * denseCal + 0.10 * lexCal + 0.08 * rrfCal);
      } else {
        score = (0.65 * fitsRaw + 0.25 * lexCal + 0.10 * rrfCal);
      }
    } else {
      score = denseActive
        ? (0.68 * denseCal + 0.20 * lexCal + 0.12 * rrfCal)
        : (0.75 * lexCal + 0.25 * rrfCal);
    }

    score = Math.max(0, score - c.vetoPenalty * 0.90);

    const skillPath = c.entry.path || `${c.entry.name}/SKILL.md`;
    const toonRel = skillPath.replace(/\/SKILL\.md$/, '/SKILL.toon');
    const resolvedPath = catalogRoot ? resolve(catalogRoot, skillPath) : `.agent-skills/${skillPath}`;
    const resolvedToon = catalogRoot ? resolve(catalogRoot, toonRel) : `.agent-skills/${toonRel}`;

    return {
      name: c.entry.name,
      category: c.entry.category,
      subcategory: c.entry.subcategory,
      score: Number(score.toFixed(4)),
      rerank: rr !== null ? Number(rr.prob.toFixed(4)) : null,
      rerankLogit: rr !== null ? Number(rr.bestLogit.toFixed(3)) : null,
      fits: fitsRaw !== null ? Number(fitsRaw.toFixed(4)) : null,
      dense: denseActive ? Number(c.denseScore.toFixed(4)) : null,
      lexical: Number(c.lexScore.toFixed(2)),
      vetoed: Boolean(c.explicitNegated || c.functionalVeto || c.semanticNegVeto),
      hasNegativeText: Boolean(c.entry.negativeText),
      redirects: c.entry.redirects || [],
      clauseOwner: c.clauseOwner,
      denseBySub: c.denseBySub,
      subLogits: rr?.subLogits || null,
      reason: summarizeFitReason(c.entry, c.skill),
      path: resolvedPath,
      toonPath: resolvedToon,
    };
  });

  // Redirect-Sibling Dominance (100% metadata-driven via entry.redirects, zero hardcoded names):
  // - Forward redirect (cand -> peer): if peer clearly beats cand, suppress cand.
  // - Reverse boundary sibling (peer -> cand): suppress cand only when cand itself declares boundary exclusions
  //   and peer overwhelmingly dominates cand (>= 3.5 logits), protecting complementary sibling pairs.
  const byNameRanked = new Map(ranked.map(r => [r.name, r]));
  const forwardRedirects = new Map();
  const reverseRedirects = new Map();
  const addLink = (map, a, b) => {
    if (!a || !b || a === b) return;
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const r of ranked) {
    for (const red of r.redirects || []) {
      for (const targetName of red.targets || []) {
        addLink(forwardRedirects, r.name, targetName);
        addLink(reverseRedirects, targetName, r.name);
      }
    }
  }
  for (const cand of ranked) {
    if (cand.vetoed) continue;
    for (const peerName of forwardRedirects.get(cand.name) || []) {
      const peer = byNameRanked.get(peerName);
      if (!peer || peer.vetoed) continue;
      const isMutual = Boolean(forwardRedirects.get(peerName)?.has(cand.name));
      if (isMutual && rerankActive && cand.rerankLogit !== null && cand.rerankLogit >= -2.5) continue;
      const logitBeat = rerankActive
        && peer.rerankLogit !== null
        && cand.rerankLogit !== null
        && (peer.rerankLogit - cand.rerankLogit) >= 2.0
        && cand.rerankLogit < -0.5;
      const scoreBeat = (peer.score - cand.score) >= 0.18 && (!rerankActive || (cand.rerankLogit ?? -10) < -1.0);
      if (logitBeat || scoreBeat) {
        cand.vetoed = true;
        break;
      }
    }
    if (cand.vetoed || !cand.hasNegativeText) continue;
    for (const peerName of reverseRedirects.get(cand.name) || []) {
      const peer = byNameRanked.get(peerName);
      if (!peer || peer.vetoed) continue;
      const isMutual = Boolean(forwardRedirects.get(cand.name)?.has(peerName));
      if (isMutual && rerankActive && cand.rerankLogit !== null && cand.rerankLogit >= -2.5) continue;
      if (
        rerankActive
        && peer.rerankLogit !== null
        && cand.rerankLogit !== null
        && (peer.rerankLogit - cand.rerankLogit) >= 3.5
        && cand.rerankLogit < -1.5
      ) {
        cand.vetoed = true;
        break;
      }
    }
  }

  ranked.sort((a, b) => b.score - a.score || (b.rerank ?? b.fits ?? 0) - (a.rerank ?? a.fits ?? 0) || (b.dense ?? 0) - (a.dense ?? 0));

  const top1 = ranked.find(r => !r.vetoed) || ranked[0];

  // Abstention Check (Cross-Encoder OR qev gate)
  if (rerankActive) {
    if (
      top1.vetoed
      || top1.score < 0.22
      || ((top1.rerankLogit ?? -10) < -6.2 && (!denseActive || top1.dense < 0.54) && top1.lexical < 2.0)
    ) {
      return {
        topK: [],
        gate: top1.rerank,
        abstained: true,
        reason: 'abstention-rerank-floor',
        stage2Mode: 'bge-reranker-v2-m3',
        candidates: ranked.map(({ denseBySub, subLogits, redirects, hasNegativeText, ...rest }) => rest),
      };
    }
  } else {
    if (gateScore !== null && gateScore < 0.22) {
      const strongOverride = (top1.fits !== null && top1.fits >= 0.78 && (!denseActive || top1.dense >= 0.58))
        || (hasKorean && denseActive && top1.dense >= 0.65 && (top1.fits === null || top1.fits >= 0.30));
      if (!strongOverride) {
        return { topK: [], gate: Number(gateScore.toFixed(4)), abstained: true, reason: 'abstention-gate', candidates: ranked };
      }
    }
    if (top1.score < 0.35 || (top1.fits !== null && top1.fits < 0.35 && (!denseActive || top1.dense < 0.59))) {
      return { topK: [], gate: gateScore !== null ? Number(gateScore.toFixed(4)) : null, abstained: true, reason: 'abstention-low-confidence', candidates: ranked };
    }
  }

  // Dynamic Score-Cliff Cutoff:
  // - Single-intent: focused 2-6 skills (or up to topK if smaller)
  // - Multi-intent: broader 5-10 skills ensuring every detected clause keeps its top verified winner
  const targetMax = isMultiIntent ? Math.min(Math.max(topK, 6), 10) : Math.min(topK, 6);
  const kept = [];
  const keptNames = new Set();

  if (rerankActive) {
    const absFloor = isMultiIntent ? 0.39 : 0.34;
    const relRatio = isMultiIntent ? 0.47 : 0.44;
    const logitFloor = isMultiIntent ? -3.8 : -4.6;
    const scoreCut = Math.max(absFloor, top1.score * relRatio);
    const top1Sibs = companionsBySkill?.get(top1.name) || null;
    const top1Logit = top1.rerankLogit ?? -10;

    for (const cand of ranked) {
      if (kept.length >= targetMax) break;
      if (cand.vetoed) continue;
      const candLogit = cand.rerankLogit ?? -10;
      const isCompanion = Boolean(top1Sibs?.has(cand.name));
      const hasStrongClause = isMultiIntent && Array.isArray(cand.subLogits)
        && cand.subLogits.some(sl => sl !== null && sl >= -2.5);
      // Relative logit cliff: keep complementary #2/#3 skills cleanly while pruning distant tail noise.
      const minDeferred = isMultiIntent ? 3 : 2;
      const logitCliffFail = kept.length >= minDeferred
        && !isCompanion && !hasStrongClause
        && top1Logit >= 0.0
        && (top1Logit - candLogit) > (isMultiIntent ? 4.4 : 4.2)
        && candLogit < -1.8;
      if (logitCliffFail) continue;
      const logitOk = candLogit >= logitFloor
        || (hasStrongClause && candLogit >= -4.8)
        || (denseActive && cand.dense >= 0.60 && candLogit >= -5.4);
      const runnerUpOk = kept.length === 1 && targetMax >= 2
        && cand.score >= 0.34
        && (
          candLogit >= -4.6
          || (candLogit >= -5.5 && (!denseActive || cand.dense >= 0.54))
        );
      if ((cand.score >= scoreCut && logitOk) || runnerUpOk) {
        kept.push(cand);
        keptNames.add(cand.name);
      }
    }

    // Multi-intent clause coverage guarantee (requires solid clause signal so noisy skills never enter)
    if (isMultiIntent && kept.length < targetMax) {
      for (let ci = 0; ci < subQueries.length; ci++) {
        const alreadyCovered = kept.some(k =>
          k.clauseOwner === ci
          || ((k.subLogits?.[ci] ?? -10) >= -2.2)
          || ((k.denseBySub?.[ci] || 0) >= 0.60)
        );
        if (alreadyCovered) continue;
        const clauseBest = ranked
          .filter(r => !keptNames.has(r.name) && !r.vetoed && (
            ((r.subLogits?.[ci] ?? -10) >= -2.8 && (r.rerankLogit ?? -10) >= -5.2)
            || (r.clauseOwner === ci && (r.denseBySub?.[ci] || 0) >= 0.57 && (r.rerankLogit ?? -10) >= -4.5)
          ))
          .sort((a, b) => (b.subLogits?.[ci] ?? b.rerankLogit ?? -10) - (a.subLogits?.[ci] ?? a.rerankLogit ?? -10))[0];
        if (clauseBest) {
          kept.push({ ...clauseBest, clausePromoted: ci });
          keptNames.add(clauseBest.name);
          if (kept.length >= targetMax) break;
        }
      }
    }

    // Companion promotion for verified high-affinity siblings
    if (kept.length > 0 && kept.length < targetMax && companionsBySkill?.size) {
      const primaries = kept.slice(0, isMultiIntent ? 3 : 2);
      for (const p of primaries) {
        const sibs = companionsBySkill.get(p.name);
        if (!sibs) continue;
        for (const cand of ranked) {
          if (kept.length >= targetMax) break;
          if (keptNames.has(cand.name) || cand.vetoed || !sibs.has(cand.name)) continue;
          if ((cand.rerankLogit ?? -10) >= -4.2 && (!denseActive || cand.dense >= 0.50)) {
            kept.push({ ...cand, companionOf: p.name });
            keptNames.add(cand.name);
          }
        }
      }
    }
  } else {
    const absFloor = isMultiIntent ? 0.29 : 0.38;
    const relRatio = isMultiIntent ? 0.48 : 0.64;
    const fitsFloor = isMultiIntent ? 0.25 : 0.36;
    const scoreCut = Math.max(absFloor, top1.score * relRatio);

    // First pass: keep skills clearing the score-cliff cutoff (never keep vetoed skills unless extraordinarily verified)
    for (const cand of ranked) {
      if (kept.length >= targetMax) break;
      if (cand.vetoed && (cand.fits === null || cand.fits < 0.88)) continue;
      const denseRescue = denseActive && cand.dense >= (hasKorean ? 0.58 : 0.64) && cand.fits >= (hasKorean ? 0.20 : 0.28);
      const fitsOk = cand.fits === null ? true : (cand.fits >= fitsFloor || denseRescue);
      if (cand.score >= scoreCut && fitsOk) {
        kept.push(cand);
        keptNames.add(cand.name);
      }
    }

    // Second pass (Multi-Intent Coverage guarantee): ensure each clause's best verified skill is included
    if (isMultiIntent && kept.length < targetMax) {
      for (let ci = 0; ci < subQueries.length; ci++) {
        const alreadyCovered = kept.some(k => k.clauseOwner === ci || ((k.denseBySub?.[ci] || 0) >= 0.58));
        if (alreadyCovered) continue;
        const clauseBest = ranked
          .filter(r => !keptNames.has(r.name) && !r.vetoed && ((r.denseBySub?.[ci] || 0) >= 0.52 || r.clauseOwner === ci))
          .sort((a, b) => ((b.denseBySub?.[ci] || 0) + (b.fits ?? 0.5) * 0.4) - ((a.denseBySub?.[ci] || 0) + (a.fits ?? 0.5) * 0.4))[0];
        if (clauseBest && (clauseBest.fits === null || clauseBest.fits >= 0.22)) {
          kept.push({ ...clauseBest, clausePromoted: ci });
          keptNames.add(clauseBest.name);
          if (kept.length >= targetMax) break;
        }
      }
    }

    // Third pass: relationship_groups companion promotion (only from already-evaluated high-affinity siblings)
    if (kept.length > 0 && kept.length < targetMax && companionsBySkill?.size) {
      const primaries = kept.slice(0, isMultiIntent ? 3 : 2);
      for (const p of primaries) {
        const sibs = companionsBySkill.get(p.name);
        if (!sibs) continue;
        for (const cand of ranked) {
          if (kept.length >= targetMax) break;
          if (keptNames.has(cand.name) || cand.vetoed || !sibs.has(cand.name)) continue;
          const sibOk = cand.fits !== null
            ? (cand.fits >= 0.48 && (!denseActive || cand.dense >= 0.50))
            : (denseActive && cand.dense >= 0.55);
          if (sibOk) {
            kept.push({ ...cand, companionOf: p.name });
            keptNames.add(cand.name);
          }
        }
      }
    }
  }

  // Always return at least top1 if we cleared abstention
  if (kept.length === 0 && !top1.vetoed) {
    kept.push(top1);
  }

  // Strip internal per-clause arrays from final output payload
  const cleanTopK = kept.map(({ denseBySub, subLogits, redirects, hasNegativeText, ...rest }) => rest);

  return {
    topK: cleanTopK,
    gate: rerankActive ? top1.rerank : (gateScore !== null ? Number(gateScore.toFixed(4)) : null),
    abstained: cleanTopK.length === 0,
    reason: cleanTopK.length ? (isMultiIntent ? 'ok-multi-intent' : 'ok-single-intent') : 'abstention-filtered',
    stage2Mode: rerankActive ? 'bge-reranker-v2-m3' : (qevAnswers ? 'qev-0.8b' : 'stage1-only'),
    isMultiIntent,
    subQueries,
    stage1Stats: stats,
    candidates: ranked.map(({ denseBySub, subLogits, redirects, hasNegativeText, ...rest }) => rest),
  };
}

/**
 * Format 2-stage deferred advisory list (user decision 2.a):
 * Compact name + score + 1-line fit reason + path, NO full SKILL.md bodies injected upfront!
 */
export function formatDeferredAdvisoryContext(topK, { header = '[Jev route-skills] (advisory — load SKILL.toon/SKILL.md on demand)' } = {}) {
  if (!Array.isArray(topK) || topK.length === 0) return '';
  const lines = [header];
  for (const s of topK) {
    const scoreStr = typeof s.score === 'number' ? s.score.toFixed(2) : (typeof s.fits === 'number' ? s.fits.toFixed(2) : '');
    const tag = scoreStr ? ` (${scoreStr})` : '';
    const why = s.reason ? ` — ${s.reason}` : '';
    const ref = s.toonPath || s.path || '';
    lines.push(`- ${s.name}${tag}${why}${ref ? ` [${ref}]` : ''}`);
  }
  return lines.join('\n');
}
