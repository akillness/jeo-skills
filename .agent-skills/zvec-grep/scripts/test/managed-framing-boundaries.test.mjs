import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { superviseBridge } from "../managed-daemon/stdio-supervisor.mjs";
import { sleep } from "./harness.mjs";

const search = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "zvec_grep_search", arguments: { root: "/tmp", query: "fixture" } } };

function setup(t, script) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["pipe", "pipe", "pipe"] });
  const sentinel = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: "ignore" });
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  createInterface({ input: output }).on("line", line => messages.push(JSON.parse(line)));
  const stopped = superviseBridge({ child, input, output, deadlineMs: 150 });
  t.after(async () => {
    input.destroy();
    child.kill("SIGKILL");
    sentinel.kill("SIGKILL");
    await Promise.race([stopped.catch(() => {}), sleep(1200)]);
  });
  return { child, sentinel, input, output, messages, stopped };
}

async function waitFor(predicate, ms = 2000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail("fixture timed out waiting for boundary enforcement");
}

test("large incomplete worker frame cannot block the independent search deadline", { timeout: 5000 }, async t => {
  const f = setup(t, `
    import { createInterface } from 'node:readline';
    createInterface({input: process.stdin}).once('line', () => {
      process.stdout.write('x'.repeat(2 * 1024 * 1024));
      setTimeout(() => {}, 4000);
    });
  `);
  f.input.write(`${JSON.stringify(search)}\n`);
  await waitFor(() => f.messages.some(m => m.id === 7));
  const result = f.messages.find(m => m.id === 7);
  assert.equal(result.result?.isError, true);
  assert.match(result.result.content[0].text, /Grep|\brg\b/i);
  assert.equal(f.messages.filter(m => m.id === 7).length, 1);
  assert.equal(f.sentinel.exitCode, null);
});

test("large incomplete client frame is never forwarded before completion", { timeout: 5000 }, async t => {
  const f = setup(t, `
    import { createInterface } from 'node:readline';
    createInterface({input: process.stdin}).on('line', line => {
      const request = JSON.parse(line);
      process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:request.id, result:{length:request.params.payload.length}}) + '\\n');
    });
  `);
  const request = JSON.stringify({jsonrpc:'2.0', id:'large-client-id', method:'custom', params:{payload:'x'.repeat(2 * 1024 * 1024)}});
  f.input.write(request);
  await sleep(200);
  assert.equal(f.messages.length, 0);
  assert.equal(f.child.exitCode, null);
  f.input.write('\n');
  await waitFor(() => f.messages.some(m => m.id === 'large-client-id'));
  assert.deepEqual(f.messages.find(m => m.id === 'large-client-id').result, {length: 2 * 1024 * 1024});
  assert.equal(f.sentinel.exitCode, null);
});

test("fragmented UTF-8 and coalesced client frames preserve independent responses", { timeout: 5000 }, async t => {
  const f = setup(t, `
    import { createInterface } from 'node:readline';
    createInterface({input: process.stdin}).on('line', line => {
      const request = JSON.parse(line);
      if (!Object.hasOwn(request, 'id')) return;
      const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: request.id, result: {echo: request.params?.arguments?.query ?? 'second'}}) + '\\n');
      const split = bytes.indexOf(Buffer.from('한')) + 1;
      if (split > 0) { process.stdout.write(bytes.subarray(0, split)); process.stdout.write(bytes.subarray(split)); }
      else process.stdout.write(bytes);
    });
  `);
  const first = { ...search, params: { ...search.params, arguments: { ...search.params.arguments, query: "한글" } } };
  const second = { jsonrpc: "2.0", id: 8, method: "tools/list" };
  const bytes = Buffer.from(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  const split = bytes.indexOf(Buffer.from("한")) + 1;
  f.input.write(bytes.subarray(0, split));
  f.input.write(bytes.subarray(split));
  await waitFor(() => f.messages.some(m => m.id === 7) && f.messages.some(m => m.id === 8));
  assert.deepEqual(f.messages.find(m => m.id === 7).result, { echo: "한글" });
  assert.deepEqual(f.messages.find(m => m.id === 8).result, { echo: "second" });
  assert.equal(f.messages.filter(m => m.id === 7 || m.id === 8).length, 2);
});

test("large valid non-search response does not corrupt a concurrent search", { timeout: 5000 }, async t => {
  const f = setup(t, `
    import { createInterface } from 'node:readline';
    createInterface({input: process.stdin}).on('line', line => {
      const request = JSON.parse(line);
      if (!Object.hasOwn(request, 'id')) return;
      const result = request.method === 'tools/list' ? {payload: 'x'.repeat(512 * 1024)} : {content: [{type: 'text', text: 'fresh'}]};
      process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: request.id, result}) + '\\n');
    });
  `);
  f.input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list" })}\n${JSON.stringify(search)}\n`);
  await waitFor(() => f.messages.some(m => m.id === 7) && f.messages.some(m => m.id === 8));
  assert.equal(f.messages.find(m => m.id === 8).result.payload, "x".repeat(512 * 1024));
  assert.equal(f.messages.find(m => m.id === 7).result.content[0].text, "fresh");
});
