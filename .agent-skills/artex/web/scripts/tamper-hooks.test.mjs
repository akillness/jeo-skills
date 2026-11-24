import ts from "typescript";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadTsModule(relPath, deps = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(web, relPath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const require = (id) => {
    if (deps[id]) return deps[id];
    throw new Error(`Unexpected require(${id})`);
  };
  vm.runInNewContext(output, { exports, require, atob, TextDecoder });
  return exports;
}

const replay = loadTsModule("src/lib/replay.ts");
const hooks = loadTsModule("src/lib/tamper-hooks.ts", { "./replay": replay });
const plain = (v) => JSON.parse(JSON.stringify(v));

test("parseRawResponse parses status, multi-value headers, and body", () => {
  const r = hooks.parseRawResponse(
    'HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n\r\n{"id":42}',
  );
  assert.equal(r.status, 201);
  assert.deepEqual(plain(r.headers), {
    "Content-Type": ["application/json"],
    "Set-Cookie": ["a=1", "b=2"],
  });
  assert.equal(r.body, '{"id":42}');
  assert.equal(r.binary, false);
  assert.equal(r.bodyPreviewOnly, false);
});

test("exchangeDetailToDryRunIO derives URL from Host header and strips Host from headers map", () => {
  const conv = hooks.exchangeDetailToDryRunIO({
    req: 'POST /api/v1/test?x=1 HTTP/1.1\r\nHost: api.example.test\r\nX-Token: secret\r\n\r\n{"a":1}',
    resp: 'HTTP/1.1 200 OK\r\nX-Resp: ok\r\n\r\n{"b":2}',
  });
  assert.equal(conv.io.request.method, "POST");
  assert.equal(conv.io.request.url, "https://api.example.test/api/v1/test?x=1");
  assert.deepEqual(plain(conv.io.request.headers), { "X-Token": ["secret"] });
  assert.equal(conv.io.request.body, '{"a":1}');
  assert.equal(conv.io.response.status, 200);
  assert.deepEqual(plain(conv.io.response.headers), { "X-Resp": ["ok"] });
  assert.equal(conv.io.response.body, '{"b":2}');
});

test("parseHeaderMatcherLines handles presence-only and regex header matchers", () => {
  const m = hooks.parseHeaderMatcherLines("X-Api-Key\nContent-Type: ^application/json\n");
  assert.deepEqual(plain(m), [{ name: "X-Api-Key" }, { name: "Content-Type", value_regex: "^application/json" }]);
  assert.equal(hooks.formatHeaderMatcherLines(m), "X-Api-Key\nContent-Type: ^application/json");
});

test("buildMatchers omits response-only matchers for request phase", () => {
  const m = hooks.buildMatchers({
    phase: "request",
    methods: "post, get",
    host: "*.example.test",
    urlRegex: "^/api",
    headers: "X-Auth",
    bodyRegex: "role",
    status: "200, 4xx",
    respHeaders: "X-Resp",
    respBodyRegex: "secret",
  });
  assert.deepEqual(plain(m), {
    methods: ["POST", "GET"],
    host: "*.example.test",
    url_regex: "^/api",
    headers: [{ name: "X-Auth" }],
    body_regex: "role",
  });
});

test("decodeTraceAfter decodes base64 UTF-8 and isTraceLineMasked flags HMAC-masked fields", () => {
  assert.equal(hooks.decodeTraceAfter(Buffer.from("hello-hook", "utf8").toString("base64")), "hello-hook");
  assert.equal(hooks.decodeTraceAfter(null), null);

  assert.equal(
    hooks.isTraceLineMasked({
      Outcome: "applied",
      After: null,
      BeforeHash: "0123456789abcdef0123456789abcdef",
      AfterHash: "fedcba9876543210fedcba9876543210",
    }),
    true,
  );
  assert.equal(
    hooks.isTraceLineMasked({
      Outcome: "applied",
      After: Buffer.from("ok", "utf8").toString("base64"),
      BeforeHash: "a".repeat(64),
      AfterHash: "b".repeat(64),
    }),
    false,
  );
});
