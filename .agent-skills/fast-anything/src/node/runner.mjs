// Node side of fast-anything. The CLI copies this file to <project>/.fast/runner.mjs and runs
//     node runner.mjs <mode> <job.json>
// Modes: profile (analyse a V8 .cpuprofile), verify. Not meant to be run by hand.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKIP_DIRS = new Set([".fast", ".git", "node_modules"]);
const IO =
  /\b(console|fs|process|fetch|require|XMLHttpRequest|document|window|localStorage|sessionStorage|setTimeout|setInterval|setImmediate|queueMicrotask|Bun|Deno)\b|\bimport\s*\(/g;
const NONDET = /\bMath\.random\b|\bDate\.now\b|\bnew\s+Date\b|\bperformance\.now\b|\bcrypto\.\w+/g;
const IDENT = "[A-Za-z_$][\\w$]*";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ------------------------------------------------------------------ source scanning

/** The source with string contents and comments blanked out (same length, same lines). */
function codeOnly(src) {
  const out = src.split("");
  const blank = (a, b) => {
    for (let k = a; k < b && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? src.length : end + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

function matching(code, open) {
  const close = { "(": ")", "{": "}", "[": "]" }[code[open]];
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === code[open]) depth++;
    else if (code[i] === close && --depth === 0) return i;
  }
  return -1;
}

function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if ("([{<".includes(c)) depth++;
    if (")]}>".includes(c)) depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function defaultAt(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if ("([{<".includes(s[i])) depth++;
    else if (")]}>".includes(s[i]) && s[i - 1] !== "=") depth--;
    else if (s[i] === "=" && depth === 0 && s[i + 1] !== ">" && s[i + 1] !== "=") return i;
  }
  return -1;
}

function parseParams(text) {
  return splitTop(text).map((p) => {
    let name = p;
    let annotation = null;
    const eq = defaultAt(p);
    if (eq >= 0) name = p.slice(0, eq).trim();
    const rest = name.startsWith("...");
    if (rest) name = name.slice(3);
    const colon = name.indexOf(":");
    if (colon >= 0) {
      annotation = name.slice(colon + 1).trim();
      name = name.slice(0, colon).trim();
    }
    const optional = name.endsWith("?") || eq >= 0;
    name = name.replace(/\?$/, "").trim();
    if (optional && annotation) annotation += " | undefined";
    return { name, annotation, rest, destructured: /^[[{]/.test(name) };
  });
}

function topLevelFunctions(src) {
  const re = new RegExp(
    "^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(" + IDENT + ")" +
      "|^(?:export\\s+)?(?:let|var|const)\\s+(" + IDENT + ")\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\(|" + IDENT + "\\s*=>)",
    "gm",
  );
  return new Set([...src.matchAll(re)].map((m) => m[1] || m[2]));
}

const parsed = new Map();

function describe(file, line0, name, entry, root) {
  if (!parsed.has(file)) {
    try {
      const src = readFileSync(file, "utf8");
      parsed.set(file, { src, code: codeOnly(src), top: topLevelFunctions(src) });
    } catch {
      parsed.set(file, null);
    }
  }
  const f = parsed.get(file);
  if (!f) return null;
  const { src, code, top } = f;
  const lines = code.split("\n");
  const n = esc(name);
  const patterns = [
    ["function", new RegExp("^(\\s*)(export\\s+)?(default\\s+)?(async\\s+)?function\\s*(\\*)?\\s*" + n + "\\s*(<[^(]*>)?\\s*\\(")],
    ["binding", new RegExp("^(\\s*)(export\\s+)?(const|let|var)\\s+" + n + "\\s*(:[^=]+)?=\\s*(async\\s*)?(function\\s*\\*?\\s*[\\w$]*\\s*\\(|\\()")],
    ["method", new RegExp("^(\\s*)(static\\s+)?(async\\s+)?(\\*)?\\s*" + n + "\\s*\\(")],
  ];
  let hit = null;
  for (const l of [line0, line0 - 1, line0 - 2, line0 + 1]) {
    if (l < 0 || l >= lines.length) continue;
    for (const [kind, re] of patterns) {
      const m = lines[l].match(re);
      if (m) {
        hit = { kind, m, l };
        break;
      }
    }
    if (hit) break;
  }
  if (!hit) return null;
  const { kind, m, l } = hit;
  const lineStart = lines.slice(0, l).reduce((a, s) => a + s.length + 1, 0);
  const open = lineStart + m[0].length - 1;
  const close = matching(code, open);
  if (close < 0) return null;

  const blockers = [];
  const warnings = [];
  let factor = 1;
  const indent = m[1].length;
  const rel = path.relative(root, file);
  const isEntry = entry && path.resolve(entry) === path.resolve(file);
  const module = isEntry ? "__main__" : rel.replace(/\.[cm]?[jt]sx?$/, "").split(path.sep).join(".");
  if (isEntry) {
    // like Python's if __name__ == "__main__": the main code must not run when verify imports the script
    const guard = code.search(/^if\s*\(\s*(import\.meta\.main|require\.main\s*===\s*module|module\s*===\s*require\.main)\s*\)/m);
    if (guard < 0)
      blockers.push("lives in the entry script, which runs on import: put its main code under if (import.meta.main) (or require.main === module)");
    else if (lineStart > guard) blockers.push("defined inside or after the if (import.meta.main) block");
  }
  if (kind === "method" || indent > 0) blockers.push("method or nested function (top-level functions only for now)");
  if (kind === "function" && m[4]) blockers.push("async");
  if (kind === "function" && m[5]) blockers.push("generator (function*)");
  if (kind === "binding" && m[5]) blockers.push("async");
  if (kind === "binding" && m[3] === "const") warnings.push("declared with const, it's declared with let while the port is switched on");

  const after = close + 1;
  const sig = src.slice(after, after + 400).match(/^\s*:\s*([^{=]+?)\s*(\{|=>)/);
  const returns = sig ? sig[1].trim() : null;
  let bodyStart = code.indexOf("{", after);
  const between = code.slice(after, bodyStart < 0 ? code.length : bodyStart + 1);
  let bodyEnd;
  if (bodyStart >= 0 && !/=>\s*[^\s{]/.test(between)) bodyEnd = matching(code, bodyStart);
  else {
    bodyStart = after;
    const semi = code.indexOf(";", after);
    const nl = code.indexOf("\n", after);
    bodyEnd = Math.min(semi < 0 ? code.length : semi, nl < 0 ? code.length : nl);
  }
  if (bodyEnd < 0) return null;
  const body = code.slice(bodyStart, bodyEnd + 1);

  const io = new Set([...body.matchAll(IO)].map((x) => x[0]));
  const nondet = new Set([...body.matchAll(NONDET)].map((x) => x[0]));
  if (/\byield\b/.test(body) && !blockers.some((b) => b.startsWith("generator"))) blockers.push("generator (yield)");
  if (/\bawait\b/.test(body) && !blockers.includes("async")) blockers.push("async");
  if (/\bthis\b/.test(body)) blockers.push("uses this");
  if (io.size) blockers.push("does I/O: " + [...io].slice(0, 3).join(", "));
  if (nondet.size) blockers.push("not deterministic: " + [...nondet].slice(0, 3).join(", "));
  const helpers = [...top].filter((h) => h !== name && new RegExp("\\b" + esc(h) + "\\s*\\(").test(body));
  if (helpers.length) warnings.push("calls " + helpers.slice(0, 3).join(", ") + ", they get ported together with it");

  const params = parseParams(src.slice(open + 1, close));
  if (params.some((p) => p.rest)) {
    warnings.push("takes ...rest parameters");
    factor *= 0.7;
  }
  if (params.some((p) => p.destructured)) {
    warnings.push("destructures its parameters");
    factor *= 0.8;
  }
  if (returns === null || params.some((p) => !p.annotation)) {
    warnings.push("no TypeScript types, types are inferred from recorded calls");
    factor *= 0.9;
  }
  return {
    qualname: name,
    module,
    kind: kind === "method" || indent > 0 ? "method" : "function",
    end_line: src.slice(0, bodyEnd + 1).split("\n").length,
    params: params.map(({ name, annotation }) => ({ name, annotation })),
    returns,
    blockers,
    warnings,
    portability: blockers.length ? 0 : factor,
    calls: helpers,
    source: src.slice(lineStart, bodyEnd + 1),
  };
}

function projectRelative(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (rel.split(path.sep).slice(0, -1).some((p) => SKIP_DIRS.has(p))) return null;
  return rel;
}

// ------------------------------------------------------------------ profile

function profile(job) {
  const names = readdirSync(job.dir).filter((f) => f.endsWith(".cpuprofile"));
  if (!names.length) throw new Error("node wrote no .cpuprofile");
  // one profile per thread (worker_threads) and process: add them all up. The run took as long as
  // the longest one, the main thread's.
  const key = (n) => `${n.callFrame.url}:${n.callFrame.lineNumber}:${n.callFrame.columnNumber}:${n.callFrame.functionName}`;
  const funcs = new Map();
  let total = 0;
  for (const name of names) {
    const prof = JSON.parse(readFileSync(path.join(job.dir, name), "utf8"));
    total = Math.max(total, (prof.endTime - prof.startTime) / 1e6);
    const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const parent = new Map();
    for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const selfUs = new Map();
    prof.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) || 0) + (prof.timeDeltas[i] || 0)));
    for (const n of prof.nodes) if (!funcs.has(key(n))) funcs.set(key(n), { frame: n.callFrame, self: 0, cum: 0 });
    for (const [id, us] of selfUs) {
      let node = byId.get(id);
      funcs.get(key(node)).self += us;
      const seen = new Set();
      while (node) {
        const k = key(node);
        if (!seen.has(k)) {
          seen.add(k);
          funcs.get(k).cum += us;
        }
        node = byId.get(parent.get(node.id));
      }
    }
  }

  const rows = [];
  for (const f of funcs.values()) {
    const { url, functionName, lineNumber } = f.frame;
    if (!functionName || !url.startsWith("file:")) continue;
    const file = fileURLToPath(url);
    const rel = projectRelative(job.root, file);
    if (rel) rows.push({ file, rel, line0: lineNumber, name: functionName, self: f.self / 1e6, cum: f.cum / 1e6 });
  }
  rows.sort((a, b) => b.cum - a.cum);
  const functions = [];
  for (const r of rows.slice(0, 40)) {
    const info = describe(r.file, r.line0, r.name, job.entry, job.root);
    if (info)
      functions.push({ ...info, file: r.rel.split(path.sep).join("/"), line: r.line0 + 1, name: r.name, ncalls: 0, tottime: r.self, cumtime: r.cum });
  }
  writeFileSync(job.out, JSON.stringify({ wall: total, base: ".", functions }));
}

// ------------------------------------------------------------------ verify

function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v === null || typeof v !== "object") return v;
  const [[tag, x]] = Object.entries(v);
  switch (tag) {
    case "$float": return Number(x);
    case "$undefined": return undefined;
    case "$bigint": return BigInt(x);
    case "$typed": return new globalThis[x[0]](x[1].map((e) => (x[0].startsWith("Big") ? BigInt(e) : e)));
    case "$map": return new Map(x.map(([k, e]) => [dec(k), dec(e)]));
    case "$set": return new Set(x.map(dec));
    case "$object": return Object.fromEntries(x.map(([k, e]) => [k, dec(e)]));
  }
  throw new Error("unknown tag " + tag);
}

function same(a, b) {
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
    return a === b || Math.abs(a - b) <= Math.max(1e-12, 1e-9 * Math.max(Math.abs(a), Math.abs(b)));
  }
  if (typeof a === "bigint" || typeof b === "bigint") {
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  }
  const seq = (x) => Array.isArray(x) || (ArrayBuffer.isView(x) && !(x instanceof DataView));
  if (seq(a) && seq(b)) return a.length === b.length && Array.from(a).every((x, i) => same(x, b[i]));
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => b.has(x));
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, x]) => b.has(k) && same(x, b.get(k)));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
  }
  return a === b;
}

function show(v, limit = 160) {
  let s;
  try {
    s = v === undefined ? "undefined" : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x + "n" : x)) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length <= limit ? s : s.slice(0, limit - 1) + "…";
}

const SLICE_LENGTHS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];

/** Smaller versions of an array/string/typed-array argument: empty, tiny, and random slices. */
function variants(value, rand) {
  const sliceable = typeof value === "string" || Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
  if (!sliceable || value.length < 2) return [];
  return SLICE_LENGTHS.filter((len) => len < value.length).flatMap((len) =>
    Array.from({ length: len < 2 ? 1 : 3 }, () => {
      const start = Math.floor(rand() * (value.length - len + 1));
      return value.slice(start, start + len);
    }),
  );
}

const NON_ASCII = ["\u{e9}", "\u{65e5}\u{672c}", "\u{1f44d}\u{1f3fd}", "e\u{301}"];
const BIG = 4096; // the longest "huge" input, in items or characters
const EDGE_SAMPLE = 20;
const EDGE_LIMIT = 100;
const GROW = [4, 16, 64, 256, 512]; // how much bigger, step by step, than the short version of an input

/** Inputs where ports and originals tend to part ways, of the same type as the recorded value. */
function edges(v) {
  if (typeof v === "number") {
    return Number.isInteger(v) ? [0, 1, -1].filter((x) => x !== v) : [NaN, Infinity, -Infinity, -0, 0, 1e308, 5e-324];
  }
  if (typeof v === "bigint") return [0n, 1n, -1n].filter((x) => x !== v);
  if (typeof v === "string") {
    const cs = [...v];
    const mid = cs.length >> 1;
    return [cs.slice(0, mid).join("") + NON_ASCII[0] + cs.slice(mid).join(""), v + NON_ASCII[1], NON_ASCII[2] + v, v + NON_ASCII[3], ""];
  }
  if (Array.isArray(v) && v.length) return [[], ...edges(v[0]).slice(0, 4).map((e) => [e, ...v.slice(1)])];
  if (ArrayBuffer.isView(v) && !(v instanceof DataView) && v.length) {
    const empty = new v.constructor(0);
    const variants = edges(v[0]).slice(0, 4).map((e) => {
      const copy = new v.constructor(v);
      copy[0] = e;
      return copy;
    });
    return [empty, ...variants];
  }
  return [];
}

/** A short version of a recorded value, so edge cases stay cheap when the real inputs are big. */
function small(v) {
  if (Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView))) return v.slice(0, 8);
  if (typeof v === "string") return [...v].slice(0, 64).join("");
  return v;
}

/** The value repeated factor times (null past BIG items or characters). */
function bigger(v, factor) {
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    if (!v.length || v.length * factor > BIG) return null;
    const res = new v.constructor(v.length * factor);
    for (let i = 0; i < factor; i++) res.set(v, i * v.length);
    return res;
  }
  if (!(typeof v === "string" || Array.isArray(v)) || !v.length || v.length * factor > BIG) return null;
  return typeof v === "string" ? v.repeat(factor) : Array.from({ length: factor }, () => v).flat(1);
}

/** Edge cases from a sample of recorded calls: special numbers, non-ASCII text, empty and much bigger
 *  inputs. The original answers them; inputs it rejects are skipped. */
function deriveEdges(original, cases, budget, limit) {
  const derived = [];
  const seen = new Set();
  const start = performance.now();
  const left = () => budget - (performance.now() - start) / 1000;
  const attempt = (args) => {
    let encoded;
    let took;
    try {
      encoded = { args: args.map(enc) };
      const key = JSON.stringify(encoded);
      if (seen.has(key)) return null;
      seen.add(key);
      const t = performance.now();
      const r = original(...structuredClone(args));
      took = (performance.now() - t) / 1000;
      encoded.result = enc(r);
    } catch {
      return null; // outside the function's domain: not a fair test
    }
    encoded.derived = "edge";
    derived.push(encoded);
    return took;
  };
  const grown = new Set();
  for (const c of cases.filter((c) => !("raises" in c)).slice(0, EDGE_SAMPLE)) {
    const args = dec(c.args);
    const base = args.map(small);
    for (let i = 0; i < args.length; i++) {
      for (const e of edges(base[i])) {
        if (derived.length >= limit || left() <= 0) return derived;
        attempt(base.map((a, j) => (j === i ? e : a)));
      }
      if (grown.has(i) || bigger(base[i], 4) === null) continue;
      // much bigger inputs, only while their time (assumed quadratic) fits the budget
      grown.add(i);
      let took;
      try {
        const t = performance.now();
        original(...structuredClone(base));
        took = (performance.now() - t) / 1000;
      } catch {
        continue;
      }
      for (const factor of GROW) {
        const big = bigger(base[i], factor);
        if (big === null || derived.length >= limit || took * 16 > left() / 2) break;
        took = attempt(base.map((a, j) => (j === i ? big : a)));
        if (took === null) break;
      }
    }
  }
  return derived;
}

/** Extra test cases: edge cases, then recorded calls with smaller inputs, answered by the original. */
function derive(original, cases, budget, limit) {
  let seed = 0xfa57;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const derived = deriveEdges(original, cases, budget / 2, EDGE_LIMIT);
  limit += derived.length;
  const seen = new Set();
  const start = performance.now();
  for (const c of cases) {
    if ("raises" in c) continue;
    const args = dec(c.args);
    for (let i = 0; i < args.length; i++) {
      for (const smaller of variants(args[i], rand)) {
        if (derived.length >= limit || (performance.now() - start) / 1000 > budget) return derived;
        const next = args.slice();
        next[i] = smaller;
        let encoded;
        try {
          encoded = { args: next.map(enc) };
          const key = JSON.stringify(encoded);
          if (seen.has(key)) continue;
          seen.add(key);
          encoded.result = enc(original(...structuredClone(next)));
        } catch {
          continue; // outside the function's domain: not a fair test
        }
        encoded.derived = true;
        derived.push(encoded);
      }
    }
  }
  return derived;
}

function enc(v) {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? (Object.is(v, -0) ? { $float: "-0" } : v) : { $float: String(v) };
  if (v === undefined) return { $undefined: 0 };
  if (typeof v === "bigint") return { $bigint: v.toString() };
  if (Array.isArray(v)) return v.map(enc);
  if (ArrayBuffer.isView(v) && !(v instanceof DataView))
    return { $typed: [v.constructor.name, Array.from(v, (x) => (typeof x === "bigint" ? x.toString() : x))] };
  if (v instanceof Map) return { $map: [...v].map(([k, x]) => [enc(k), enc(x)]) };
  if (v instanceof Set) return { $set: [...v].map(enc) };
  if (typeof v === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) return { $object: Object.entries(v).map(([k, x]) => [k, enc(x)]) };
  }
  throw new Error("unsupported");
}

function bestPass(fn, calls, budget) {
  let best = Infinity;
  let spent = 0;
  let passes = 0;
  while (passes < 3 || (spent < budget && passes < 2000)) {
    const t = performance.now();
    for (const args of calls) {
      try {
        fn(...args);
      } catch {}
    }
    const took = (performance.now() - t) / 1000;
    best = Math.min(best, took);
    spent += took;
    passes++;
  }
  return best;
}

async function verify(job) {
  process.env.FAST_ANYTHING_DISABLE = "1";
  const fast = createRequire(import.meta.url)(job.addon)[job.js_name];
  if (typeof fast !== "function") throw new Error(job.addon + " doesn't export " + job.js_name);
  let original = null;
  let handed = null; // from a block fast-anything appended to the module, so unexported functions work too
  globalThis.__fastAnythingOriginal = (fn) => {
    handed = fn;
  };
  try {
    const mod = await import(pathToFileURL(job.module_file).href);
    original = handed ?? mod[job.func] ?? mod.default?.[job.func] ?? null;
  } catch {}

  const cases = readFileSync(job.cases, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const recorded = cases.length;
  const derived = typeof original === "function" ? derive(original, cases, job.derive_budget ?? 3, job.derive_limit ?? 200) : [];
  cases.push(...derived);
  const report = { total: cases.length, derived: derived.length, edges: derived.filter((c) => c.derived === "edge").length, passed: 0, failed: 0, failures: [] };
  const calls = [];
  cases.forEach((c, i) => {
    const args = dec(c.args);
    calls.push(args);
    let got;
    let err = null;
    try {
      got = fast(...args);
    } catch (e) {
      err = e;
    }
    let ok;
    let expected;
    if ("raises" in c) [ok, expected] = [err !== null, "throws " + c.raises];
    else {
      const want = dec(c.result);
      [ok, expected] = [err === null && same(want, got), show(want)];
    }
    if (ok) {
      report.passed++;
      return;
    }
    report.failed++;
    if (report.failures.length < 8)
      report.failures.push({
        case: i,
        call: (c.derived === "edge" ? "(edge) " : c.derived ? "(derived) " : "") + job.func + "(" + args.map((a) => show(a, 80)).join(", ") + ")",
        expected,
        got: err === null ? show(got) : "threw " + (err?.name ?? "Error") + ": " + show(String(err?.message ?? err), 200),
      });
  });

  if (cases.length && report.failed === 0 && typeof original === "function") {
    calls.length = recorded;
    const js = bestPass(original, calls, job.budget ?? 0.5);
    const rs = bestPass(fast, calls, job.budget ?? 0.5);
    report.micro = { original_ns: (js / calls.length) * 1e9, rust_ns: (rs / calls.length) * 1e9, speedup: rs > 0 ? js / rs : 0 };
  }
  writeFileSync(job.out, JSON.stringify(report));
}

const [mode, jobPath] = process.argv.slice(2);
const job = JSON.parse(readFileSync(jobPath, "utf8"));
if (mode === "profile") profile(job);
else if (mode === "verify") await verify(job);
else throw new Error("unknown mode " + mode);
