// Exercise the deadline over the real authenticated Unix transport with a disposable peer.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DAEMON_DIR, createSandbox, installedPackageDir, sleep } from "./harness.mjs";
import { forwardSearchWithDeadline, unixFetch } from "../managed-daemon/unix-bridge.mjs";

test("search deadline bounds pre-request and synchronous peer stalls without late stale results, and recovers", { timeout: 12000 }, async (t) => {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, "peer.sock");
  const marker = join(sandbox.root, "native-started");
  const script = `
    import http from 'node:http';
    import { chmodSync, writeFileSync } from 'node:fs';
    const [socket, marker] = process.argv.slice(1);
    let identities = 0;
    const server = http.createServer((req, res) => {
      res.setHeader('x-managed-instance', 'test-instance');
      if (req.url === '/managed/identity') {
        identities++;
        if (identities === 1) return setTimeout(() => res.end('{}'), 900);
        return res.end('{}');
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const { mode } = JSON.parse(body);
        if (mode === 'block') {
          writeFileSync(marker, 'started');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900);
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ mode, result: mode === 'block' ? 'STALE' : 'FRESH' }));
      });
    });
    server.listen(socket, () => { chmodSync(socket, 0o600); console.log('ready'); });
  `;
  const peer = sandbox.spawn(process.execPath, ["--input-type=module", "-e", script, socket, marker]);
  t.after(async () => { peer.child.kill(); await peer.closed; sandbox.cleanup(); });
  for (let i = 0; i < 100 && !peer.out.stdout.includes("ready"); i++) await sleep(20);
  assert.match(peer.out.stdout, /ready/, peer.out.stderr);
  const fetch = unixFetch(socket, "test-instance");
  const call = (mode) => forwardSearchWithDeadline(async (signal) => {
    const response = await fetch("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }), signal });
    return response.json();
  }, 200);
  const timed = async (mode) => {
    const start = Date.now();
    const result = await call(mode);
    assert.ok(Date.now() - start < 750, `deadline exceeded: ${Date.now() - start}ms`);
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.match(result.content[0].text, /native Grep|\brg\b/i);
    return result;
  };
  await timed("normal"); // The identity probe is delayed before the request can reach the peer.
  await sleep(1000);
  await timed("block");
  assert.ok(existsSync(marker), "the synchronous peer stall was not reached");
  await timed("normal"); // The blocked peer cannot answer a subsequent request either.
  await sleep(1000);
  assert.deepEqual(await call("normal"), { mode: "normal", result: "FRESH" });
  await sleep(200);
  assert.equal(readFileSync(marker, "utf8"), "started");
  assert.deepEqual(sandbox.egressEvents(), []);
});

test("MCP bridge enforces the deadline around a synchronously stalled Unix peer", { timeout: 10000 }, async (t) => {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, "mcp.sock");
  const marker = join(sandbox.root, "blocked");
  const serverScript = `
    import http from 'node:http';
    import { chmodSync, writeFileSync } from 'node:fs';
    const [socket, marker] = process.argv.slice(1);
    let calls = 0;
    const server = http.createServer((req, res) => {
      res.setHeader('x-managed-instance', 'test-instance');
      if (req.url === '/managed/identity') return res.end('{}');
      if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const msg = JSON.parse(body);
        if (msg.id === undefined) { res.statusCode = 202; return res.end(); }
        let result;
        if (msg.method === 'server/discover') result = { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } };
        else if (msg.method === 'tools/call') {
          calls++;
          if (calls === 1) { writeFileSync(marker, 'started'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 900); }
          result = { resultType: 'complete', content: [{ type: 'text', text: calls === 1 ? 'STALE' : 'FRESH' }] };
        } else result = {};
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      });
    });
    server.listen(socket, () => { chmodSync(socket, 0o600); console.log('ready'); });
  `;
  const peer = sandbox.spawn(process.execPath, ["--input-type=module", "-e", serverScript, socket, marker]);
  let bridge;
  t.after(async () => { bridge?.kill(); peer.child.kill(); await peer.closed; sandbox.cleanup(); });
  for (let i = 0; i < 100 && !peer.out.stdout.includes("ready"); i++) await sleep(20);
  assert.match(peer.out.stdout, /ready/, peer.out.stderr);
  const bridgeScript = `
    const { loadPackage } = await import(${JSON.stringify(pathToFileURL(join(DAEMON_DIR, "package.mjs")).href)});
    const { runUnixBridge } = await import(${JSON.stringify(pathToFileURL(join(DAEMON_DIR, "unix-bridge.mjs")).href)});
    await runUnixBridge({ pkg: loadPackage(), socketPath: process.argv[1], instanceToken: 'test-instance', isAlive: () => true, searchDeadlineMs: 200 });
  `;
  bridge = spawn(process.execPath, ["--input-type=module", "-e", bridgeScript, socket], { cwd: sandbox.workspace, env: sandbox.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir() ?? "" }), stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  bridge.stderr.on("data", chunk => { stderr += chunk; });
  const pending = new Map();
  const unexpected = [];
  createInterface({ input: bridge.stdout }).on("line", line => {
    const message = JSON.parse(line);
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); } else if (message.id !== undefined) unexpected.push(message);
  });
  let id = 0;
  const request = async (method, params) => {
    const requestId = ++id;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`bridge response timeout: ${stderr}`)), 3000);
      pending.set(requestId, value => { clearTimeout(timer); resolve(value); });
    });
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    return response;
  };
  const init = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.ok(init.result?.protocolVersion, JSON.stringify(init));
  bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const params = { name: "zvec_grep_search", arguments: { root: sandbox.workspace, query: "test" } };
  const started = Date.now();
  const first = await request("tools/call", params);
  assert.ok(Date.now() - started < 750);
  assert.equal(first.result?.isError, true, JSON.stringify(first));
  assert.match(first.result.content[0].text, /native Grep|\brg\b/i);
  assert.ok(existsSync(marker), "peer did not enter the synchronous stall");
  const secondStarted = Date.now();
  const second = await request("tools/call", params);
  assert.ok(Date.now() - secondStarted < 750, "repeat search exceeded deadline");
  assert.equal(second.result?.isError, true, JSON.stringify(second));
  await sleep(1000);
  const recovered = await request("tools/call", params);
  assert.equal(recovered.result?.content?.[0]?.text, "FRESH", JSON.stringify(recovered));
  await sleep(200);
  assert.deepEqual(unexpected, [], "late responses escaped to the client");
  assert.deepEqual(sandbox.egressEvents(), []);
});
