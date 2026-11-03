// Pure in-process unit tests for the byte-level envelope scanner. No child
// processes, no index, no network: the scanner is the one component that may
// run on the deadline-owning event loop, so it must never parse frame contents.
import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import {
  createEnvelopeScanner,
  createLineFramer,
  scanFrame,
  decodeScalar,
  DEFAULT_CLIENT_TARGETS,
  DEFAULT_WORKER_TARGETS,
  DEFAULT_MAX_CAPTURE,
  MAX_PATH_DEPTH,
} from "../managed-daemon/envelope-scanner.mjs";

const TARGETS = {
  id: ["id"],
  method: ["method"],
  requestId: ["params", "requestId"],
  progressToken: ["params", "_meta", "progressToken"],
};
const VALUE_TYPES = ["string", "number", "true", "false", "null", "object", "array"];

/** Run `fn` while JSON.parse/JSON.stringify are poisoned; the scanner must not need them. */
function withJsonForbidden(fn) {
  const { parse, stringify } = JSON;
  JSON.parse = () => { throw new Error("scanner called JSON.parse"); };
  JSON.stringify = () => { throw new Error("scanner called JSON.stringify"); };
  try { return fn(); } finally { JSON.parse = parse; JSON.stringify = stringify; }
}

/** Scan a byte sequence as a stream in the given chunks and return every frame (including end()). */
function scanChunks(chunks, options = { targets: TARGETS }) {
  return withJsonForbidden(() => {
    const scanner = createEnvelopeScanner(options);
    const frames = [];
    for (const chunk of chunks) frames.push(...scanner.push(Buffer.from(chunk)));
    const tail = scanner.end();
    if (tail) frames.push(tail);
    return frames;
  });
}

const text = bytes => Buffer.from(bytes).toString();
/** The full raw span of a captured value, taken from the retained frame bytes (never from the capped copy). */
const span = (frame, name) => text(frame.bytes.subarray(frame.values[name].start, frame.values[name].end));

/** Comparable projection of a frame: offsets, flags, retained bytes and captured value text. */
function shape(frame) {
  const values = {};
  for (const [name, value] of Object.entries(frame.values ?? {})) {
    values[name] = { start: value.start, end: value.end, type: value.type, bytes: text(value.bytes), truncated: value.truncated };
  }
  return { start: frame.start, end: frame.end, valid: frame.valid, empty: frame.empty, type: frame.type, object: frame.object, hasError: typeof frame.error === "string", bytes: text(frame.bytes), values };
}

/** readline (crlfDelay: Infinity) is the framing oracle the supervisor historically used. */
async function readlineLines(chunks) {
  const input = new PassThrough();
  const lines = [];
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on("line", line => lines.push(line));
  const closed = new Promise(resolve => rl.once("close", resolve));
  for (const chunk of chunks) input.write(Buffer.from(chunk));
  input.end();
  await closed;
  return lines;
}

const FRAMING_CASES = [
  ["{\"id\":1}\n{\"id\":2}\n"],
  ["{\"id\":1}\r{\"id\":2}\r"],
  ["{\"id\":1}\r\n{\"id\":2}\r\n"],
  ["{\"id\":1}\r", "\n{\"id\":2}\n"],
  ["{\"id\":1}\r", "\r{\"id\":2}\n"],
  ["{\"id\":1}", "\n", "{\"id\":2}"],
  ["{\"id\":1}\n\n{\"id\":2}\n"],
  ["\r\n"],
  ["\n"],
  ["{\"id\":1}"],
  ["{\"id\":1}\r"],
  [""],
];

test("framing matches readline for LF, CR, CRLF and CR|LF split across chunks", async () => {
  for (const chunks of FRAMING_CASES) {
    const expected = await readlineLines(chunks);
    const all = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const frames = scanChunks(chunks);
    assert.deepEqual(frames.map(f => text(all.subarray(f.start, f.end))), expected, `offsets for chunks ${JSON.stringify(chunks)}`);
    assert.deepEqual(frames.map(f => text(f.bytes)), expected, `retained bytes for chunks ${JSON.stringify(chunks)}`);
  }
});

test("createLineFramer splits with readline parity and copies frames out of the chunks", async () => {
  for (const chunks of FRAMING_CASES) {
    const expected = await readlineLines(chunks);
    const frames = withJsonForbidden(() => {
      const framer = createLineFramer();
      const out = [];
      for (const chunk of chunks) out.push(...framer.push(Buffer.from(chunk)));
      const tail = framer.end();
      if (tail) out.push(tail);
      return out;
    });
    assert.ok(frames.every(f => f instanceof Uint8Array), "frames are byte views");
    assert.deepEqual(frames.map(text), expected, `chunks ${JSON.stringify(chunks)}`);
  }
  const source = Buffer.from("{\"id\":1}\n");
  const [frame] = withJsonForbidden(() => createLineFramer().push(source));
  source.fill(0x78);
  assert.equal(text(frame), "{\"id\":1}", "frame must not alias the caller's chunk");
});

test("end() flushes only a pending unterminated frame", () => {
  withJsonForbidden(() => {
    const idle = createEnvelopeScanner({ targets: TARGETS });
    assert.equal(idle.end(), null);
    const flushed = createEnvelopeScanner({ targets: TARGETS });
    assert.deepEqual(flushed.push(Buffer.from("{\"id\":9}")), []);
    const tail = flushed.end();
    assert.equal(tail.valid, true);
    assert.equal(text(tail.values.id.bytes), "9");
    assert.equal(flushed.end(), null, "end() is idempotent once flushed");
    const terminated = createEnvelopeScanner({ targets: TARGETS });
    assert.equal(terminated.push(Buffer.from("{\"id\":9}\n")).length, 1);
    assert.equal(terminated.end(), null);
  });
});

test("empty lines are reported as empty invalid frames with offsets", () => {
  const [a, empty, b] = scanChunks(["{\"id\":1}\n\n{\"id\":2}\n"]);
  assert.equal(empty.empty, true);
  assert.equal(empty.valid, false);
  assert.equal(empty.object, false);
  assert.equal(empty.type, undefined);
  assert.equal(typeof empty.error, "string");
  assert.deepEqual(empty.values, {});
  assert.equal(empty.bytes.length, 0);
  assert.equal(empty.start, empty.end);
  assert.equal(empty.start, a.end + 1);
  assert.equal(b.start, empty.end + 1);
  assert.equal(a.empty, false);
  assert.equal(b.empty, false);
});

test("strict RFC 8259 validity agrees with JSON.parse on a grammar corpus", () => {
  const samples = [
    "{}", "[]", "1", "-0", "0.5", "1e5", "1E-5", "-1.5e+3", "\"\"", "\"a\\\"b\"", "\"\\u00e9\\ud83d\\ude00\"",
    "true", "false", "null", " { \"a\" : [ 1 , 2 ] } ", "{\"a\":{\"b\":{\"c\":{\"d\":{\"e\":1}}}}}",
    "{\"a\":\"\\/\\b\\f\\n\\r\\t\"}", "[1,[2,[3,[4]]]]", "{\"a\":1,\"a\":2}", "\"한글\"", "{\"\":1}", "\t1\t", "[\"\\ud800\"]",
    "{", "}", "{\"a\":1,}", "[1,]", "{'a':1}", "{a:1}", "01", "1.", ".5", "+1", "NaN", "Infinity", "-", "1e", "--1", "1e+",
    "\"\\x41\"", "\"\\u12\"", "\"\\u12g4\"", "\"tab\there\"", "\"\n\"", "tru", "nul", "truex", "{\"a\":1}x", "1 2", "[1 2]",
    "{\"a\" 1}", "{\"a\":}", "\"", "[,1]", "{,}", "\"\\\"", "{\"a\":1}}", "[[]", "{\"a\":[}", "{1:2}", "{\"a\":1 \"b\":2}",
  ];
  for (const sample of samples) {
    let parses = true;
    try { JSON.parse(sample); } catch { parses = false; }
    const frame = withJsonForbidden(() => scanFrame(Buffer.from(sample), { targets: TARGETS }));
    assert.equal(frame.valid, parses, `sample ${JSON.stringify(sample)}`);
    if (!parses) {
      assert.equal(typeof frame.error, "string", `error text for ${JSON.stringify(sample)}`);
      assert.match(frame.error, /byte \d+/, `error offset for ${JSON.stringify(sample)}`);
      assert.equal(frame.type, undefined);
      assert.deepEqual(frame.values, {});
    } else {
      assert.equal(frame.error, undefined);
      assert.ok(VALUE_TYPES.includes(frame.type), `type of ${JSON.stringify(sample)}: ${frame.type}`);
    }
  }
});

test("root type and object flag distinguish object roots from arrays and scalars", () => {
  const roots = { "{\"id\":1}": "object", "[{\"id\":1}]": "array", "\"id\"": "string", "7": "number", "null": "null", "true": "true", "false": "false", " {} ": "object" };
  for (const [source, type] of Object.entries(roots)) {
    const frame = withJsonForbidden(() => scanFrame(Buffer.from(source), { targets: TARGETS }));
    assert.equal(frame.valid, true, source);
    assert.equal(frame.type, type, source);
    assert.equal(frame.object, type === "object", source);
  }
});

test("captured values carry raw JSON text, type and frame-relative offsets into the retained bytes", () => {
  const source = "{ \"jsonrpc\":\"2.0\", \"id\" : \"x\\u0041\\\"y\" , \"method\":\"tools/call\",\"params\":{\"requestId\":12345678901234567890,\"_meta\":{\"progressToken\":null}}}\n";
  const [prefix, frame] = scanChunks(["prefix-frame\n", source]);
  assert.equal(prefix.valid, false);
  assert.equal(frame.valid, true);
  assert.equal(frame.start, "prefix-frame\n".length, "frame offsets are absolute");
  assert.equal(text(frame.bytes), source.slice(0, -1));
  const expected = {
    id: { bytes: "\"x\\u0041\\\"y\"", type: "string" },
    method: { bytes: "\"tools/call\"", type: "string" },
    requestId: { bytes: "12345678901234567890", type: "number" },
    progressToken: { bytes: "null", type: "null" },
  };
  for (const [name, { bytes, type }] of Object.entries(expected)) {
    const value = frame.values[name];
    assert.ok(value, `missing ${name}`);
    assert.equal(text(value.bytes), bytes, name);
    assert.equal(span(frame, name), bytes, `${name} offsets are frame-relative`);
    assert.equal(source.indexOf(bytes), value.start, `${name} start`);
    assert.equal(value.type, type, `${name} type`);
    assert.equal(value.truncated, false, name);
    assert.ok(value.start >= 0 && value.end <= frame.end - frame.start, `${name} inside frame`);
  }
});

test("every JSON value kind is typed and captured verbatim", () => {
  const kinds = {
    "\"s\"": "string", "-12.5e2": "number", "true": "true", "false": "false", "null": "null",
    "{\"k\":[1,{\"n\":\"}\"}]}": "object", "[1,\"]\",{\"a\":null}]": "array", "\"\"": "string", "0": "number",
  };
  for (const [raw, type] of Object.entries(kinds)) {
    const [frame] = scanChunks([`{"id":${raw},"method":"m"}\n`]);
    assert.equal(frame.valid, true, raw);
    assert.equal(frame.type, "object");
    assert.equal(frame.values.id.type, type, raw);
    assert.equal(text(frame.values.id.bytes), raw, raw);
    assert.equal(span(frame, "id"), raw, raw);
    assert.equal(text(frame.values.method.bytes), "\"m\"");
  }
});

test("only object-key paths at the targeted depth capture; arrays and decoys are ignored", () => {
  const decoys = [
    "{\"result\":{\"id\":5}}",
    "{\"params\":{\"id\":5}}",
    "{\"params\":[{\"requestId\":5}]}",
    "[{\"id\":5}]",
    "{\"method\":\"\\\"id\\\":9,\\\"requestId\\\":9\"}",
    "{\"_meta\":{\"progressToken\":\"t\"}}",
    "{\"params\":{\"_meta\":[{\"progressToken\":\"t\"}]}}",
    "{\"params\":{\"x\":{\"requestId\":5}}}",
    "{\"\\\"id\\\"\":5}",
  ];
  for (const source of decoys) {
    const [frame] = scanChunks([`${source}\n`]);
    assert.equal(frame.valid, true, source);
    assert.deepEqual(Object.keys(frame.values).filter(k => k !== "method"), [], source);
  }
  const [deep] = scanChunks(["{\"params\":{\"_meta\":{\"progressToken\":\"tok\"},\"requestId\":\"r\"},\"id\":0}\n"]);
  assert.equal(text(deep.values.progressToken.bytes), "\"tok\"");
  assert.equal(text(deep.values.requestId.bytes), "\"r\"");
  assert.equal(text(deep.values.id.bytes), "0");
});

test("duplicate keys resolve last-wins like JSON.parse, and escaped keys match", () => {
  const [dup] = scanChunks(["{\"id\":1,\"params\":{\"requestId\":\"a\"},\"id\":2,\"params\":{\"requestId\":\"b\"}}\n"]);
  assert.equal(text(dup.values.id.bytes), "2");
  assert.equal(text(dup.values.requestId.bytes), "\"b\"");
  assert.equal(JSON.parse("{\"id\":1,\"id\":2}").id, 2);
  const [escaped] = scanChunks(["{\"i\\u0064\":\"e1\",\"\\u006dethod\":\"m\",\"params\":{\"request\\u0049d\":\"r\"}}\n"]);
  assert.equal(text(escaped.values.id.bytes), "\"e1\"");
  assert.equal(text(escaped.values.method.bytes), "\"m\"");
  assert.equal(text(escaped.values.requestId.bytes), "\"r\"");
  const [nearMiss] = scanChunks(["{\"Id\":1,\"id \":2,\"ids\":3,\"i\":4,\"\\u0069\":5}\n"]);
  assert.equal(nearMiss.values.id, undefined);
});

test("maxCapture caps captured bytes but keeps the full value extent", () => {
  const big = "\"" + "q".repeat(10_000) + "\"";
  const source = `{"id":${big},"method":"m"}\n`;
  const [frame] = scanChunks([source], { targets: TARGETS, maxCapture: 256 });
  assert.equal(frame.valid, true);
  const id = frame.values.id;
  assert.equal(id.truncated, true);
  assert.equal(id.bytes.length, 256);
  assert.equal(text(id.bytes), big.slice(0, 256));
  assert.equal(id.end - id.start, big.length);
  assert.equal(span(frame, "id"), big);
  assert.equal(frame.values.method.truncated, false);
  const [untouched] = scanChunks([source], { targets: TARGETS, maxCapture: big.length });
  assert.equal(untouched.values.id.truncated, false);
  assert.equal(untouched.values.id.bytes.length, big.length);
  const [zero] = scanChunks([source], { targets: TARGETS, maxCapture: 0 });
  assert.equal(zero.values.id.bytes.length, 0);
  assert.equal(zero.values.id.truncated, true);
  assert.equal(span(zero, "id"), big);
  const [defaults] = scanChunks([source], { targets: TARGETS });
  assert.equal(defaults.values.id.bytes.length, DEFAULT_MAX_CAPTURE);
  assert.equal(defaults.values.id.truncated, true);
});

test("results are identical for every single-byte split point of a frame", () => {
  const source = "{\"id\":\"한\\u00e9😀\",\"params\":{\"requestId\":-1.5e3,\"_meta\":{\"progressToken\":true}},\"method\":\"tools/call\"}\r\n{\"id\":2}\n";
  const bytes = Buffer.from(source);
  const reference = scanChunks([bytes]).map(shape);
  assert.equal(reference.length, 2);
  assert.equal(reference[0].values.id.bytes, "\"한\\u00e9😀\"");
  for (let i = 1; i < bytes.length; i++) {
    const split = scanChunks([bytes.subarray(0, i), bytes.subarray(i)]).map(shape);
    assert.deepEqual(split, reference, `split at ${i} (${JSON.stringify(source.slice(Math.max(0, i - 3), i + 3))})`);
  }
  for (let i = 1; i < bytes.length - 1; i += 7) {
    const triple = scanChunks([bytes.subarray(0, i), bytes.subarray(i, i + 1), bytes.subarray(i + 1)]).map(shape);
    assert.deepEqual(triple, reference, `three-way split at ${i}`);
  }
  const single = scanChunks([...bytes].map(b => Buffer.from([b]))).map(shape);
  assert.deepEqual(single, reference);
});

test("frame offsets stay absolute across many pushes while value offsets stay frame-relative", () => {
  const frames = ["{\"id\":1}\n", "{\"id\":\"two\"}\n", "\n", "{\"id\":[3]}\n", "{\"id\":4}"];
  const all = Buffer.from(frames.join(""));
  const results = scanChunks(frames);
  assert.equal(results.length, 5);
  let cursor = 0;
  for (const [index, frame] of results.entries()) {
    const content = frames[index].replace(/\n$/, "");
    assert.equal(frame.start, cursor, `frame ${index} start`);
    assert.equal(frame.end, cursor + content.length, `frame ${index} end`);
    assert.equal(text(all.subarray(frame.start, frame.end)), content);
    assert.equal(text(frame.bytes), content);
    cursor += frames[index].length;
    if (frame.values.id) {
      const raw = JSON.stringify(JSON.parse(content).id);
      assert.equal(span(frame, "id"), raw);
      assert.equal(frame.values.id.start, content.indexOf(raw), `frame ${index} id offset is frame-relative`);
    }
  }
});

test("multi-megabyte frames in odd fragments are scanned quickly, and retainBytes:false drops the payload", () => {
  const payload = "z".repeat(3 * 1024 * 1024);
  const source = `{"jsonrpc":"2.0","id":"large-id","method":"tools/call","params":{"name":"zvec_grep_search","arguments":{"query":"${payload}"}}}\n{"id":"after"}\n`;
  const bytes = Buffer.from(source);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 65_521) chunks.push(bytes.subarray(i, i + 65_521));
  const started = performance.now();
  const frames = scanChunks(chunks, { targets: TARGETS, retainBytes: false });
  const elapsed = performance.now() - started;
  assert.equal(frames.length, 2);
  assert.equal(frames[0].valid, true);
  assert.equal(frames[0].bytes, undefined, "retainBytes:false must not accumulate the frame");
  assert.equal(frames[0].end - frames[0].start, source.indexOf("\n"));
  assert.equal(text(frames[0].values.id.bytes), "\"large-id\"");
  assert.equal(text(frames[0].values.method.bytes), "\"tools/call\"");
  assert.equal(text(frames[1].values.id.bytes), "\"after\"");
  assert.ok(elapsed < 2000, `scan of ${bytes.length} bytes took ${elapsed.toFixed(0)}ms`);
  withJsonForbidden(() => {
    const partial = createEnvelopeScanner({ targets: TARGETS });
    assert.deepEqual(partial.push(chunks[0]), [], "no frame is reported before its terminator");
  });
});

test("invalid frames still report their extent so the stream can resynchronise", () => {
  const source = "{\"id\":1,}\n{\"id\":2}\n";
  const all = Buffer.from(source);
  const [bad, good] = scanChunks([source]);
  assert.equal(bad.valid, false);
  assert.equal(bad.empty, false);
  assert.match(bad.error, /byte \d+/);
  assert.deepEqual(bad.values, {});
  assert.equal(text(all.subarray(bad.start, bad.end)), "{\"id\":1,}");
  assert.equal(text(bad.bytes), "{\"id\":1,}");
  assert.equal(good.valid, true);
  assert.equal(text(good.values.id.bytes), "2");
});

test("scanFrame treats the whole input as one frame and exposes the input view", () => {
  const pretty = "{\n  \"jsonrpc\": \"2.0\",\n  \"id\": 42,\n  \"method\": \"tools/list\"\n}\n";
  const frame = withJsonForbidden(() => scanFrame(Buffer.from(pretty), { targets: TARGETS }));
  assert.equal(frame.valid, true);
  assert.equal(frame.object, true);
  assert.equal(text(frame.bytes), pretty);
  assert.equal(span(frame, "id"), "42");
  assert.equal(span(frame, "method"), "\"tools/list\"");
  assert.equal(withJsonForbidden(() => scanFrame(Buffer.from("{\"id\":\"a\nb\"}"), { targets: TARGETS })).valid, false);
  assert.equal(withJsonForbidden(() => scanFrame(Buffer.from("{\"id\":\"a\\nb\"}"), { targets: TARGETS })).valid, true);
  const empty = withJsonForbidden(() => scanFrame(Buffer.alloc(0), { targets: TARGETS }));
  assert.equal(empty.valid, false);
  assert.equal(empty.empty, true);
  assert.deepEqual(empty.values, {});
});

test("decodeScalar decodes scalars exactly like JSON.parse and returns undefined for everything else", () => {
  const scalars = ["\"abc\"", "\"x\\u0041\\\"y\"", "\"한\\ud83d\\ude00\"", "\"\\/\\b\\f\\n\\r\\t\\\\\"", "12", "-1.5e3", "12345678901234567890", "0", "-0", "null", "true", "false", "\"\""];
  for (const raw of scalars) {
    assert.deepEqual(withJsonForbidden(() => decodeScalar(Buffer.from(raw))), JSON.parse(raw), raw);
  }
  assert.ok(Object.is(withJsonForbidden(() => decodeScalar(Buffer.from("-0"))), -0));
  for (const raw of ["{}", "[]", "{\"a\":1}", "[1]", "\"unterminated", "", "tru", "1x", "\"\\u12\"", "\"a\"b\"", "01", "\"\\x\"", "1.", "nul", "\"a\nb\"", " 1"]) {
    assert.equal(withJsonForbidden(() => decodeScalar(Buffer.from(raw))), undefined, raw);
  }
});

test("target tables are validated up front and never reach the hot path", () => {
  withJsonForbidden(() => {
    assert.throws(() => createEnvelopeScanner({ targets: { id: [] } }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: { id: Array.from({ length: MAX_PATH_DEPTH + 1 }, () => "k") } }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: { id: ["id", ""] } }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: { id: ["id", 3] } }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: { a: ["id"], b: ["id"] } }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: TARGETS, maxCapture: -1 }), TypeError);
    assert.throws(() => createEnvelopeScanner({ targets: TARGETS }).push("not bytes"), TypeError);
    const deepest = createEnvelopeScanner({ targets: { x: Array.from({ length: MAX_PATH_DEPTH }, (_, i) => `k${i}`) } });
    const nested = Array.from({ length: MAX_PATH_DEPTH }, (_, i) => `{"k${i}":`).join("") + "\"deep\"" + "}".repeat(MAX_PATH_DEPTH) + "\n";
    const [frame] = deepest.push(Buffer.from(nested));
    assert.equal(text(frame.values.x.bytes), "\"deep\"");
  });
});

test("default target tables capture the identities the supervisor must preserve", () => {
  for (const [name, table] of Object.entries({ DEFAULT_CLIENT_TARGETS, DEFAULT_WORKER_TARGETS })) {
    assert.ok(Object.isFrozen(table), `${name} is frozen`);
    for (const [target, path] of Object.entries(table)) {
      assert.ok(Array.isArray(path) && path.length >= 1 && path.length <= MAX_PATH_DEPTH, `${name}.${target}`);
      assert.ok(path.every(segment => typeof segment === "string" && segment.length > 0), `${name}.${target}`);
    }
  }
  const request = Buffer.from("{\"jsonrpc\":\"2.0\",\"id\":\"req\",\"method\":\"tools/call\",\"params\":{\"name\":\"zvec_grep_search\",\"_meta\":{\"progressToken\":\"tok\"},\"arguments\":{\"query\":\"q\"}}}");
  const cancel = Buffer.from("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":\"req\",\"reason\":\"stop\"}}");
  const response = Buffer.from("{\"jsonrpc\":\"2.0\",\"id\":\"managed-supervisor-x-1\",\"result\":{\"content\":[]}}");
  const progress = Buffer.from("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{\"progressToken\":\"managed-supervisor-x-1-progress\",\"progress\":1}}");
  const [clientRequest, clientCancel] = withJsonForbidden(() => [scanFrame(request, { targets: DEFAULT_CLIENT_TARGETS }), scanFrame(cancel, { targets: DEFAULT_CLIENT_TARGETS })]);
  const [workerResponse, workerProgress] = withJsonForbidden(() => [scanFrame(response, { targets: DEFAULT_WORKER_TARGETS }), scanFrame(progress, { targets: DEFAULT_WORKER_TARGETS })]);
  const captured = frame => Object.values(frame.values).map(v => text(v.bytes));
  assert.deepEqual(captured(clientRequest).sort(), ["\"req\"", "\"tok\"", "\"tools/call\"", "\"zvec_grep_search\""].sort(), "client request identities");
  assert.deepEqual(captured(clientCancel).sort(), ["\"notifications/cancelled\"", "\"req\""].sort(), "client cancel identities");
  assert.ok(captured(workerResponse).includes("\"managed-supervisor-x-1\""), "worker response id");
  assert.ok(captured(workerProgress).includes("\"managed-supervisor-x-1-progress\"") && captured(workerProgress).includes("\"notifications/progress\""), "worker progress identities");
});
