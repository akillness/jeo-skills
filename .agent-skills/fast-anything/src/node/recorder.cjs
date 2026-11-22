// fast-anything call recorder, preloaded with "node --require". Not meant to be used by hand.
"use strict";
const fs = require("node:fs");

const out = process.env.FAST_ANYTHING_RECORD_OUT;
const meta = process.env.FAST_ANYTHING_RECORD_META;
const limit = Number(process.env.FAST_ANYTHING_RECORD_LIMIT || 500);
const kept = [];
const unsupported = new Set();
let mutates = false;
let calls = 0;
let skipped = 0;
let seed = 0xfa57;
const rand = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed % n;
};

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
  throw new Error(typeof v === "object" ? (v.constructor?.name ?? "object") : typeof v);
}

function store(slot, c) {
  if (kept.length < limit) kept.push(c);
  else kept[slot % limit] = c;
}

globalThis.__fastAnythingWrap = (fn) =>
  function (...args) {
    calls++;
    const slot = kept.length < limit ? kept.length : rand(calls);
    let c = null;
    if (slot < limit) {
      try {
        c = { args: args.map(enc) };
      } catch (e) {
        skipped++;
        unsupported.add(e.message);
      }
    }
    let result;
    try {
      result = fn.apply(this, args);
    } catch (e) {
      if (c) {
        c.raises = (e && e.name) || "Error";
        store(slot, c);
      }
      throw e;
    }
    if (c) {
      try {
        if (JSON.stringify(args.map(enc)) !== JSON.stringify(c.args)) mutates = true;
      } catch {}
      try {
        c.result = enc(result);
        store(slot, c);
      } catch (e) {
        skipped++;
        unsupported.add(e.message);
      }
    }
    return result;
  };

// Each worker thread loads this too (workers inherit --require): it writes its calls next to the main
// thread's files, and the main thread adds them in when the app exits.
const { isMainThread, threadId } = require("node:worker_threads");
const workerFile = (file, id) => `${file}.t${id}`;

function write(outFile, metaFile) {
  fs.writeFileSync(outFile, kept.map((c) => JSON.stringify(c)).join("\n") + (kept.length ? "\n" : ""));
  fs.writeFileSync(metaFile, JSON.stringify({ calls, kept: kept.length, skipped, unsupported: [...unsupported], mutates }));
}

function workerIds() {
  const dir = require("node:path").dirname(out);
  const prefix = require("node:path").basename(workerFile(out, ""));
  return fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length));
}

if (isMainThread) {
  for (const id of workerIds()) for (const f of [workerFile(out, id), workerFile(meta, id)]) fs.rmSync(f, { force: true });
}

process.on("exit", () => {
  if (!isMainThread) return write(workerFile(out, threadId), workerFile(meta, threadId));
  for (const id of workerIds()) {
    try {
      const m = JSON.parse(fs.readFileSync(workerFile(meta, id), "utf8"));
      const cases = fs.readFileSync(workerFile(out, id), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
      calls += m.calls;
      skipped += m.skipped;
      for (const u of m.unsupported) unsupported.add(u);
      mutates = mutates || m.mutates;
      kept.push(...cases);
    } catch {} // a worker that was stopped before it finished writing
    for (const f of [workerFile(out, id), workerFile(meta, id)]) fs.rmSync(f, { force: true });
  }
  if (kept.length > limit) {
    // keep a sample of `limit` calls across all threads
    for (let i = 0; i < limit; i++) {
      const j = i + rand(kept.length - i);
      [kept[i], kept[j]] = [kept[j], kept[i]];
    }
    kept.length = limit;
  }
  write(out, meta);
});
