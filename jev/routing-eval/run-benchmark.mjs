#!/usr/bin/env node
/**
 * Jev Skill Routing Golden Benchmark Runner
 *
 * Evaluates baseline and upgraded skill routers on jev/routing-eval/golden-prompts.json.
 *
 * Usage:
 *   node jev/routing-eval/run-benchmark.mjs --mode jev-fast --out jev/routing-eval/results/baseline-jev-fast.json
 *   node jev/routing-eval/run-benchmark.mjs --mode jev-full --out jev/routing-eval/results/baseline-jev-full.json
 *   node jev/routing-eval/run-benchmark.mjs --mode jeo-code --out jev/routing-eval/results/baseline-jeo-code.json
 *   node jev/routing-eval/run-benchmark.mjs --compare jev/routing-eval/results/baseline-jev-fast.json jev/routing-eval/results/v2.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const GOLDEN_PATH = resolve(HERE, 'golden-prompts.json');
const CATALOG_PATH = resolve(REPO_ROOT, '.agent-skills', 'skills.json');

function parseArgs(argv) {
  const opts = {
    mode: 'jev-fast',
    out: null,
    limit: null,
    strata: null,
    compare: [],
    noCache: true,
    concurrency: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--strata') opts.strata = new Set(argv[++i].split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--compare') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.compare.push(argv[++i]);
    } else if (a === '--cache') opts.noCache = false;
  }
  return opts;
}

// Reproduces ../jeo-code/src/agent/skill-router.ts exact algorithm for objective baseline comparison
const JEO_CODE_TOKEN_RE = /[a-z0-9][a-z0-9._-]*/gi;
const JEO_CODE_STOPWORDS = new Set([
  'the', 'are', 'you', 'your', 'and', 'for', 'with', 'that', 'this', 'have',
  'has', 'had', 'what', 'when', 'where', 'which', 'how', 'why', 'who', 'whom',
  'there', 'here', 'today', 'hello', 'please', 'just', 'like', 'from', 'into',
  'over', 'under', 'about', 'after', 'before', 'then', 'than', 'also', 'only',
  'very', 'much', 'more', 'most', 'some', 'such', 'will', 'would', 'could',
  'should', 'does', 'did', 'not', 'but', 'all',
]);

function jeoCodeTokens(text) {
  const out = new Set();
  for (const m of String(text || '').toLowerCase().matchAll(JEO_CODE_TOKEN_RE)) {
    const t = m[0];
    if (t.length >= 3 && !JEO_CODE_STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

function buildJeoCodeRouter(catalog) {
  const docs = catalog.skills.map(s => ({
    name: s.name,
    textTokens: jeoCodeTokens(`${s.name} ${s.description || ''} ${(s.tags || []).join(' ')}`),
    nameTokens: jeoCodeTokens(s.name.replace(/[:/_-]/g, ' ')),
  }));
  return async function routeJeoCode(prompt) {
    const t0 = performance.now();
    const taskTokens = jeoCodeTokens(prompt);
    if (taskTokens.size === 0) {
      return { topK: [], latencyMs: performance.now() - t0, meta: { reason: 'gate' } };
    }
    const scored = docs.map(d => {
      let overlap = 0;
      for (const t of taskTokens) if (d.textTokens.has(t)) overlap++;
      let nameHits = 0;
      for (const t of taskTokens) if (d.nameTokens.has(t)) nameHits++;
      const score = overlap / taskTokens.size + Math.min(nameHits * 1.0, 1.5);
      return { name: d.name, score };
    });
    scored.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
    const topK = scored.filter(c => c.score >= 0.3).slice(0, 3);
    return { topK, latencyMs: performance.now() - t0, meta: { reason: topK.length ? 'ok' : 'gate' } };
  };
}

function dcg(rels) {
  let s = 0;
  for (let i = 0; i < rels.length; i++) {
    s += (Math.pow(2, rels[i]) - 1) / Math.log2(i + 2);
  }
  return s;
}

function evaluateCase(testCase, result) {
  const names = (result.topK || []).map(x => (typeof x === 'string' ? x : x.name));
  const expected = new Set(testCase.expected || []);
  const primary = new Set(testCase.primary || []);
  const forbidden = new Set(testCase.forbidden || []);

  const isAbstain = testCase.stratum === 'abstention';
  const count = names.length;

  const forbiddenHits = names.filter(n => forbidden.has(n));
  const forbiddenViolated = forbiddenHits.length > 0;

  if (isAbstain) {
    return {
      id: testCase.id,
      stratum: testCase.stratum,
      prompt: testCase.prompt,
      predicted: names,
      count,
      abstainCorrect: count === 0,
      falsePositive: count > 0,
      forbiddenHits,
      forbiddenViolated,
      latencyMs: Number(result.latencyMs.toFixed(1)),
      meta: result.meta || {},
    };
  }

  const recallAt = k => {
    if (expected.size === 0) return 1;
    const top = new Set(names.slice(0, k));
    let hit = 0;
    for (const e of expected) if (top.has(e)) hit++;
    return hit / expected.size;
  };

  const primaryHitAt = k => {
    if (primary.size === 0) return 1;
    const top = new Set(names.slice(0, k));
    let hit = 0;
    for (const p of primary) if (top.has(p)) hit++;
    return hit / primary.size;
  };

  let mrr = 0;
  for (let i = 0; i < names.length; i++) {
    if (expected.has(names[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  const top10 = names.slice(0, 10);
  const rels = top10.map(n => (primary.has(n) ? 2 : expected.has(n) ? 1 : 0));
  const idealRels = [
    ...Array(primary.size).fill(2),
    ...Array(Math.max(0, expected.size - primary.size)).fill(1),
  ].slice(0, 10);
  const idcg = dcg(idealRels);
  const ndcg10 = idcg > 0 ? dcg(rels) / idcg : 0;

  const precision = count > 0 ? names.filter(n => expected.has(n)).length / count : 0;

  let intentCoverage = null;
  if (Array.isArray(testCase.intent_groups) && testCase.intent_groups.length > 0) {
    const predSet = new Set(names);
    let covered = 0;
    for (const grp of testCase.intent_groups) {
      if (grp.some(s => predSet.has(s))) covered++;
    }
    intentCoverage = covered / testCase.intent_groups.length;
  }

  return {
    id: testCase.id,
    stratum: testCase.stratum,
    prompt: testCase.prompt,
    expected: testCase.expected,
    primary: testCase.primary,
    predicted: names,
    count,
    recall3: recallAt(3),
    recall5: recallAt(5),
    recall10: recallAt(10),
    primaryHit3: primaryHitAt(3),
    primaryHit5: primaryHitAt(5),
    primaryHit10: primaryHitAt(10),
    precision,
    mrr,
    ndcg10,
    intentCoverage,
    forbiddenHits,
    forbiddenViolated,
    latencyMs: Number(result.latencyMs.toFixed(1)),
    meta: result.meta || {},
  };
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(records) {
  const pos = records.filter(r => r.stratum !== 'abstention');
  const abs = records.filter(r => r.stratum === 'abstention');
  const mi = records.filter(r => r.stratum === 'multi_intent');
  const bn = records.filter(r => r.stratum === 'boundary_negative');
  const ko = records.filter(r => r.stratum === 'ko_single');
  const en = records.filter(r => r.stratum === 'en_single');
  const latencies = records.map(r => r.latencyMs);

  const byStratum = group => ({
    n: group.length,
    recall3: Number(mean(group.map(r => r.recall3)).toFixed(4)),
    recall5: Number(mean(group.map(r => r.recall5)).toFixed(4)),
    recall10: Number(mean(group.map(r => r.recall10)).toFixed(4)),
    primaryHit5: Number(mean(group.map(r => r.primaryHit5)).toFixed(4)),
    primaryHit10: Number(mean(group.map(r => r.primaryHit10)).toFixed(4)),
    mrr: Number(mean(group.map(r => r.mrr)).toFixed(4)),
    ndcg10: Number(mean(group.map(r => r.ndcg10)).toFixed(4)),
    avgCount: Number(mean(group.map(r => r.count)).toFixed(2)),
    zeroCountRate: Number(mean(group.map(r => (r.count === 0 ? 1 : 0))).toFixed(4)),
    forbiddenViolationRate: Number(mean(group.map(r => (r.forbiddenViolated ? 1 : 0))).toFixed(4)),
  });

  return {
    totalCases: records.length,
    positiveOverall: byStratum(pos),
    strata: {
      ko_single: byStratum(ko),
      en_single: byStratum(en),
      multi_intent: {
        ...byStratum(mi),
        intentCoverage: Number(mean(mi.map(r => r.intentCoverage ?? 0)).toFixed(4)),
      },
      boundary_negative: byStratum(bn),
      abstention: {
        n: abs.length,
        abstentionAccuracy: Number(mean(abs.map(r => (r.abstainCorrect ? 1 : 0))).toFixed(4)),
        falsePositiveRate: Number(mean(abs.map(r => (r.falsePositive ? 1 : 0))).toFixed(4)),
        avgCount: Number(mean(abs.map(r => r.count)).toFixed(2)),
      },
    },
    latencyMs: {
      mean: Number(mean(latencies).toFixed(1)),
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
    },
  };
}

function printSummary(label, summary) {
  const p = summary.positiveOverall;
  const s = summary.strata;
  console.log(`\n==================== ${label} ====================`);
  console.log(`Positive Overall (n=${p.n}): R@3=${(p.recall3*100).toFixed(1)}% | R@5=${(p.recall5*100).toFixed(1)}% | R@10=${(p.recall10*100).toFixed(1)}% | Prim@5=${(p.primaryHit5*100).toFixed(1)}% | MRR=${p.mrr.toFixed(3)} | nDCG@10=${p.ndcg10.toFixed(3)} | avgK=${p.avgCount} | zeroRate=${(p.zeroCountRate*100).toFixed(1)}%`);
  console.log(`  ko_single         (n=${s.ko_single.n}): R@5=${(s.ko_single.recall5*100).toFixed(1)}% | R@10=${(s.ko_single.recall10*100).toFixed(1)}% | Prim@5=${(s.ko_single.primaryHit5*100).toFixed(1)}% | avgK=${s.ko_single.avgCount} | zero=${(s.ko_single.zeroCountRate*100).toFixed(1)}%`);
  console.log(`  en_single         (n=${s.en_single.n}): R@5=${(s.en_single.recall5*100).toFixed(1)}% | R@10=${(s.en_single.recall10*100).toFixed(1)}% | Prim@5=${(s.en_single.primaryHit5*100).toFixed(1)}% | avgK=${s.en_single.avgCount} | zero=${(s.en_single.zeroCountRate*100).toFixed(1)}%`);
  console.log(`  multi_intent      (n=${s.multi_intent.n}): R@5=${(s.multi_intent.recall5*100).toFixed(1)}% | R@10=${(s.multi_intent.recall10*100).toFixed(1)}% | IntentCov=${(s.multi_intent.intentCoverage*100).toFixed(1)}% | avgK=${s.multi_intent.avgCount}`);
  console.log(`  boundary_negative (n=${s.boundary_negative.n}): Prim@5=${(s.boundary_negative.primaryHit5*100).toFixed(1)}% | ForbiddenViol=${(s.boundary_negative.forbiddenViolationRate*100).toFixed(1)}% | avgK=${s.boundary_negative.avgCount}`);
  console.log(`  abstention        (n=${s.abstention.n}): AbstainAcc=${(s.abstention.abstentionAccuracy*100).toFixed(1)}% | FPR=${(s.abstention.falsePositiveRate*100).toFixed(1)}% | avgK=${s.abstention.avgCount}`);
  console.log(`  Latency: mean=${summary.latencyMs.mean}ms | p50=${summary.latencyMs.p50}ms | p95=${summary.latencyMs.p95}ms`);
}

function compareReports(paths) {
  const reports = paths.map(p => JSON.parse(readFileSync(p, 'utf8')));
  console.log('\n=== A/B COMPARISON TABLE ===');
  const header = ['Mode', 'R@5', 'R@10', 'Prim@5', 'nDCG@10', 'KO R@5', 'MI Cov', 'Bnd Viol', 'Abstain', 'FPR', 'avgK(MI)', 'p50ms', 'p95ms'];
  console.log(header.join('\t'));
  for (const r of reports) {
    const s = r.summary;
    const row = [
      r.mode,
      `${(s.positiveOverall.recall5 * 100).toFixed(1)}%`,
      `${(s.positiveOverall.recall10 * 100).toFixed(1)}%`,
      `${(s.positiveOverall.primaryHit5 * 100).toFixed(1)}%`,
      s.positiveOverall.ndcg10.toFixed(3),
      `${(s.strata.ko_single.recall5 * 100).toFixed(1)}%`,
      `${(s.strata.multi_intent.intentCoverage * 100).toFixed(1)}%`,
      `${(s.strata.boundary_negative.forbiddenViolationRate * 100).toFixed(1)}%`,
      `${(s.strata.abstention.abstentionAccuracy * 100).toFixed(1)}%`,
      `${(s.strata.abstention.falsePositiveRate * 100).toFixed(1)}%`,
      s.strata.multi_intent.avgCount.toFixed(2),
      `${s.latencyMs.p50}`,
      `${s.latencyMs.p95}`,
    ];
    console.log(row.join('\t'));
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.compare.length >= 2) {
    compareReports(opts.compare);
    return;
  }

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const validSkills = new Set(catalog.skills.map(s => s.name));
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

  // Integrity check: every expected/primary/forbidden/intent_group skill must exist
  const badNames = [];
  for (const c of golden.cases) {
    for (const field of ['expected', 'primary', 'forbidden']) {
      for (const n of c[field] || []) if (!validSkills.has(n)) badNames.push(`${c.id}.${field}:${n}`);
    }
    for (const grp of c.intent_groups || []) {
      for (const n of grp) if (!validSkills.has(n)) badNames.push(`${c.id}.intent_groups:${n}`);
    }
  }
  if (badNames.length) {
    console.error('Golden dataset contains unknown skill names:', badNames.join(', '));
    process.exit(1);
  }

  let cases = golden.cases;
  if (opts.strata) cases = cases.filter(c => opts.strata.has(c.stratum));
  if (opts.limit) cases = cases.slice(0, opts.limit);

  process.env.JEV_CATALOG_PATH = CATALOG_PATH;
  process.env.JEV_PROFILE = process.env.JEV_PROFILE || 'jeo';
  if (opts.noCache) process.env.JEV_NO_CACHE = '1';

  let routerFn;
  if (opts.mode === 'jeo-code') {
    routerFn = buildJeoCodeRouter(catalog);
  } else {
    const harness = await import(resolve(REPO_ROOT, 'jev', 'jev-harness.mjs'));
    routerFn = async prompt => {
      const t0 = performance.now();
      let res;
      if (opts.mode === 'jev-fast') {
        res = await harness.routeSkills(prompt, { topK: 3, fast: true, localOnly: true });
      } else if (opts.mode === 'jev-full') {
        res = await harness.routeSkills(prompt, { topK: 10, fast: false, localOnly: true });
      } else if (opts.mode === 'jev-v2') {
        res = await harness.routeSkills(prompt, { topK: 10, localOnly: true });
      } else if (opts.mode === 'jev-v2-fast') {
        res = await harness.routeSkills(prompt, { topK: 10, fast: true, localOnly: true });
      } else if (opts.mode === 'jev-v2-dense-only') {
        res = await harness.routeSkills(prompt, { topK: 10, localOnly: true, denseOnly: true });
      } else {
        throw new Error(`Unknown mode: ${opts.mode}`);
      }
      return {
        topK: res?.topK || [],
        latencyMs: performance.now() - t0,
        meta: {
          strategy: res?.selection?.strategy || null,
          reason: res?.selection?.reason || res?.reason || null,
          gate: res?.selection?.gate ?? null,
          abstained: res?.selection?.abstained ?? null,
          error: res?.error || null,
        },
      };
    };
  }

  const records = [];
  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const res = await routerFn(tc.prompt);
    const ev = evaluateCase(tc, res);
    records.push(ev);
    const status = tc.stratum === 'abstention'
      ? (ev.abstainCorrect ? 'ABSTAIN-OK' : `FP(${ev.predicted.join(',')})`)
      : `K=${ev.count} R@5=${(ev.recall5*100).toFixed(0)}%${ev.forbiddenViolated ? ' FORB!' : ''}`;
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${tc.id} (${ev.latencyMs}ms): ${status}\n`);
  }

  const summary = summarize(records);
  printSummary(opts.mode, summary);

  if (opts.out) {
    const outPath = resolve(REPO_ROOT, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({
      mode: opts.mode,
      timestamp: new Date().toISOString(),
      catalogCount: catalog.skills.length,
      summary,
      records,
    }, null, 2));
    console.log(`\nSaved benchmark report to ${outPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
