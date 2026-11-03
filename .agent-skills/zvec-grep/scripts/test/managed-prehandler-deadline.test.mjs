// The supervisor must bound requests even if its bridge worker cannot dispatch them.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DAEMON_DIR, createSandbox, installedPackageDir, sleep } from "./harness.mjs";

test("supervised stdio bounds pre-dispatch stall, discards late replies and recovers", { timeout: 10000 }, async (t) => {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, "peer.sock");
  const peerScript = `
    import http from 'node:http';
    import { chmodSync } from 'node:fs';
    const server = http.createServer((req, res) => {
      res.setHeader('x-managed-instance', 'test-instance');
      if (req.url === '/managed/identity') return res.end('{}');
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const msg = JSON.parse(body);
        if (msg.id === undefined) { res.statusCode = 202; return res.end(); }
        const result = msg.method === 'server/discover'
          ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } }
          : msg.method === 'tools/call' ? { resultType: 'complete', content: [{ type: 'text', text: 'FRESH' }] } : {};
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      });
    });
    server.listen(process.argv[1], () => { chmodSync(process.argv[1], 0o600); console.log('ready'); });
  `;
  const peer = sandbox.spawn(process.execPath, ["--input-type=module", "-e", peerScript, socket]);
  let parent, workerPid;
  t.after(async () => {
    if (workerPid) { try { process.kill(workerPid, "SIGCONT"); process.kill(workerPid, "SIGKILL"); } catch {} }
    parent?.kill("SIGKILL");
    peer.child.kill("SIGKILL");
    await peer.closed;
    sandbox.cleanup();
  });
  for (let i = 0; i < 100 && !peer.out.stdout.includes("ready"); i++) await sleep(20);
  assert.match(peer.out.stdout, /ready/, peer.out.stderr);
  const bridgeScript = `
    const { loadPackage } = await import(${JSON.stringify(pathToFileURL(join(DAEMON_DIR, "package.mjs")).href)});
    const { runUnixBridge } = await import(${JSON.stringify(pathToFileURL(join(DAEMON_DIR, "unix-bridge.mjs")).href)});
    await runUnixBridge({ pkg: loadPackage(), socketPath: process.argv[1], instanceToken: 'test-instance', isAlive: () => true, searchDeadlineMs: 5000 });
  `;
  const supervisorScript = `
    import { spawn } from 'node:child_process';
    const { superviseBridge } = await import(${JSON.stringify(pathToFileURL(join(DAEMON_DIR, "stdio-supervisor.mjs")).href)});
    const child = spawn(process.execPath, ['--input-type=module', '-e', process.argv[1], process.argv[2]], { stdio: ['pipe', 'pipe', 'inherit'] });
    console.error('worker-pid:' + child.pid);
    await superviseBridge({ child, input: process.stdin, output: process.stdout, deadlineMs: 200 });
  `;
  parent = spawn(process.execPath, ["--input-type=module", "-e", supervisorScript, bridgeScript, socket], {
    cwd: sandbox.workspace,
    env: sandbox.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir() ?? "" }),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  parent.stderr.on("data", chunk => { stderr += chunk; });
  const pending = new Map();
  const unexpected = [];
  createInterface({ input: parent.stdout }).on("line", line => {
    const message = JSON.parse(line);
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); }
    else if (message.id !== undefined) unexpected.push(message);
  });
  const send = (id, method, params) => {
    const response = new Promise(resolve => pending.set(id, resolve));
    parent.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return response;
  };
  const bounded = async (promise) => Promise.race([promise, sleep(1000).then(() => { throw new Error(`external watchdog: ${stderr}`); })]);
  const initialized = await Promise.race([send(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } }), sleep(3000).then(() => { throw new Error(`initialize watchdog: ${stderr}`); })]);
  assert.ok(initialized.result?.protocolVersion, JSON.stringify(initialized));
  parent.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const match = stderr.match(/worker-pid:(\d+)/);
  assert.ok(match, stderr);
  workerPid = Number(match[1]);
  process.kill(workerPid, "SIGSTOP");
  const args = { name: "zvec_grep_search", arguments: { root: sandbox.workspace, query: "test" } };
  for (const id of [2, 3]) {
    const started = Date.now();
    const result = await bounded(send(id, "tools/call", args));
    assert.ok(Date.now() - started < 750, "response exceeded deadline");
    assert.equal(result.id, id);
    assert.equal(result.result?.isError, true, JSON.stringify(result));
    assert.match(result.result.content[0].text, /native Grep|\brg\b/i);
  }
  process.kill(workerPid, "SIGCONT");
  await sleep(500);
  const recovered = await bounded(send(4, "tools/call", args));
  assert.equal(recovered.id, 4);
  assert.equal(recovered.result?.content?.[0]?.text, "FRESH", JSON.stringify(recovered));
  await sleep(200);
  assert.deepEqual(unexpected, [], "late responses escaped to the client");
  assert.deepEqual(sandbox.egressEvents(), []);
});

test("actual bridge CLI serves stdio through its supervised worker", { timeout: 8000 }, async (t) => {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, "peer.sock");
  const peerScript = `
    import http from 'node:http';
    import { chmodSync } from 'node:fs';
    const server = http.createServer((req, res) => {
      res.setHeader('x-managed-instance', 'test-instance');
      if (req.url === '/managed/identity') return res.end(JSON.stringify({ managed: true, pid: process.pid, instance_token: 'test-instance', os_sandbox: { remote: 'denied' } }));
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const msg = JSON.parse(body);
        if (msg.id === undefined) { res.statusCode = 202; return res.end(); }
        const result = msg.method === 'server/discover'
          ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } }
          : msg.method === 'tools/call' ? { resultType: 'complete', content: [{ type: 'text', text: 'FRESH' }] } : {};
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }));
      });
    });
    server.listen(process.argv[1], () => { chmodSync(process.argv[1], 0o600); console.log('ready:' + process.pid); });
  `;
  const peer = sandbox.spawn(process.execPath, ["--input-type=module", "-e", peerScript, socket]);
  let bridge;
  t.after(async () => {
    bridge?.stdin.end();
    await Promise.race([new Promise(resolve => bridge?.once("close", resolve)), sleep(1000)]);
    bridge?.kill("SIGKILL");
    peer.child.kill("SIGKILL");
    await peer.closed;
    sandbox.cleanup();
  });
  for (let i = 0; i < 100 && !peer.out.stdout.includes("ready:"); i++) await sleep(20);
  const pid = Number(peer.out.stdout.match(/ready:(\d+)/)?.[1]);
  assert.ok(pid, peer.out.stderr);
  mkdirSync(join(sandbox.zvecHome, "daemon"), { recursive: true });
  writeFileSync(join(sandbox.zvecHome, "daemon", "instance.lock"), JSON.stringify({ managed: true, managedSocket: socket, pid, instanceToken: "test-instance" }));
  bridge = spawn(process.execPath, [join(DAEMON_DIR, "main.mjs"), "bridge", "--home", sandbox.zvecHome], {
    cwd: sandbox.workspace, env: sandbox.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir() ?? "" }), stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  bridge.stderr.on("data", chunk => { stderr += chunk; });
  const pending = new Map();
  createInterface({ input: bridge.stdout }).on("line", line => {
    const message = JSON.parse(line);
    const resolve = pending.get(message.id);
    if (resolve) { pending.delete(message.id); resolve(message); }
  });
  const request = (id, method, params) => {
    const result = new Promise(resolve => pending.set(id, resolve));
    bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return Promise.race([result, sleep(3000).then(() => { throw new Error(`CLI response timeout: ${stderr}`); })]);
  };
  const initialized = await request(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.ok(initialized.result?.protocolVersion, JSON.stringify(initialized));
  bridge.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const result = await request(2, "tools/call", { name: "zvec_grep_search", arguments: { root: sandbox.workspace, query: "test" } });
  assert.equal(result.id, 2);
  assert.equal(result.result?.content?.[0]?.text, "FRESH", JSON.stringify(result));
  assert.deepEqual(sandbox.egressEvents(), []);
});
