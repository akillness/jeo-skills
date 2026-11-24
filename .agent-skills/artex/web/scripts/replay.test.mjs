import ts from "typescript";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = ts.transpileModule(fs.readFileSync(path.join(web, "src/lib/replay.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(output, { exports });
const { parseRawRequest, splitReplayHeaders } = exports;

// Objects built inside the vm context have another Object prototype, so
// compare through JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("parses an LF request with a body", () => {
  const r = parseRawRequest(
    'POST /api/login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{"user":"a"}',
  );
  assert.equal(r.method, "POST");
  assert.equal(r.target, "/api/login");
  assert.deepEqual(plain(r.headers), [
    { name: "Host", value: "example.com" },
    { name: "Content-Type", value: "application/json" },
  ]);
  assert.equal(r.body, '{"user":"a"}');
  assert.equal(r.binary, false);
  assert.equal(r.bodyPreviewOnly, false);
});

test("parses a CRLF request and keeps the body's CRLFs", () => {
  const r = parseRawRequest("PUT /x HTTP/1.1\r\nAccept: */*\r\nX-A: 1\r\n\r\nline1\r\nline2");
  assert.equal(r.method, "PUT");
  assert.deepEqual(plain(r.headers), [
    { name: "Accept", value: "*/*" },
    { name: "X-A", value: "1" },
  ]);
  assert.equal(r.body, "line1\r\nline2");
});

test("a request without a body has an empty body", () => {
  for (const raw of ["GET / HTTP/1.1\nAccept: */*", "GET / HTTP/1.1\r\nAccept: */*\r\n\r\n"]) {
    const r = parseRawRequest(raw);
    assert.equal(r.body, "");
    assert.deepEqual(plain(r.headers), [{ name: "Accept", value: "*/*" }]);
  }
});

test("a header value keeps the colons after the first one", () => {
  const r = parseRawRequest("GET / HTTP/1.1\nReferer: https://example.com:8443/a?b=c:d\nX-Time: 12:34:56");
  assert.deepEqual(plain(r.headers), [
    { name: "Referer", value: "https://example.com:8443/a?b=c:d" },
    { name: "X-Time", value: "12:34:56" },
  ]);
});

test("a request without Host parses, and no Host is invented", () => {
  const r = parseRawRequest("GET /only HTTP/1.1\nAccept: text/html\n\n");
  assert.equal(r.target, "/only");
  assert.equal(
    r.headers.some((h) => h.name.toLowerCase() === "host"),
    false,
  );
  const { sent, notSent } = splitReplayHeaders(r.headers);
  assert.deepEqual(plain(sent), [{ name: "Accept", value: "text/html" }]);
  assert.deepEqual(plain(notSent), []);
});

test("Host and hop-by-hop headers are not sent, including those named in Connection", () => {
  const r = parseRawRequest(
    [
      "POST /p HTTP/1.1",
      "Host: example.com",
      "Content-Length: 3",
      "Connection: keep-alive, X-Hop",
      "Keep-Alive: timeout=5",
      "Proxy-Authorization: Basic eA==",
      "Proxy-Connection: keep-alive",
      "Transfer-Encoding: chunked",
      "TE: trailers",
      "Trailer: X-T",
      "Expect: 100-continue",
      "Upgrade: websocket",
      "x-hop: 1",
      "Cookie: a=b",
      "Authorization: Bearer t",
      "",
      "abc",
    ].join("\r\n"),
  );
  const { sent, notSent } = splitReplayHeaders(r.headers);
  assert.deepEqual(plain(sent), [
    { name: "Cookie", value: "a=b" },
    { name: "Authorization", value: "Bearer t" },
  ]);
  assert.deepEqual(plain(notSent), [
    "Host",
    "Content-Length",
    "Connection",
    "Keep-Alive",
    "Proxy-Authorization",
    "Proxy-Connection",
    "Transfer-Encoding",
    "TE",
    "Trailer",
    "Expect",
    "Upgrade",
    "x-hop",
  ]);
  assert.equal(r.body, "abc");
});

test("a NUL byte marks the request as binary", () => {
  const r = parseRawRequest("POST /u HTTP/1.1\nContent-Type: application/octet-stream\n\nab\u0000cd");
  assert.equal(r.binary, true);
});

test("the blob marker of a spilled body is removed and flagged", () => {
  const marker = `\n…[truncated] @blob sha256:${"a".repeat(64)} (len=99999)`;
  const r = parseRawRequest(`POST /big HTTP/1.1\nContent-Type: text/plain\n\npreview text${marker}`);
  assert.equal(r.body, "preview text");
  assert.equal(r.bodyPreviewOnly, true);
});
