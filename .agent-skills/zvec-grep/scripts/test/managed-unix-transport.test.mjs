// Black-box MCP transport tests. Every child uses a disposable HOME and daemon home.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { buildProfile } from "../managed-daemon/os-sandbox.mjs";
import { createCanary, removeCanary } from "../managed-daemon/sandbox-canary.mjs";
import { unixFetch } from "../managed-daemon/unix-bridge.mjs";
import { DAEMON_DIR, DAEMON_MAIN, createSandbox, installedPackageDir, sleep } from "./harness.mjs";

const mac = { skip: process.platform !== "darwin" && "managed daemon requires macOS", timeout: 90_000 };

async function launch(t) {
  const sandbox = createSandbox();
  const env = sandbox.env({ ZVEC_GREP_PACKAGE_DIR: installedPackageDir() ?? "", NODE_OPTIONS: "" });
  const previousTmp = process.env.TMPDIR;
  process.env.TMPDIR = sandbox.tmp;
  let canary;
  try { canary = createCanary(); } finally { if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp; }
  const warnings = join(sandbox.home, ".local", "state", "zvec-grep", "warnings");
  mkdirSync(warnings, { recursive: true });
  const requirePkg = createRequire(join(installedPackageDir(), "package.json"));
  const profile = buildProfile({ port: 47991, nodePath: realpathSync(process.execPath), rgPath: realpathSync(requirePkg("@vscode/ripgrep").rgPath), writableRoots: [sandbox.zvecHome, sandbox.modelCache, warnings, join(canary.root, "new")].map(p => realpathSync(p)), indexHomes: canary.indexHomes.map(p => realpathSync(p)), home: realpathSync(sandbox.zvecHome) });
  const child = spawn("/usr/bin/sandbox-exec", ["-p", profile, process.execPath, join(DAEMON_DIR, "daemon-entry.mjs"), "run", "--home", sandbox.zvecHome, "--boundary-canary", canary.root], {
    env, cwd: sandbox.workspace, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let lock;
  t.after(async () => {
    if (lock?.pid && lock.pid !== process.pid) {
      try { process.kill(lock.pid, "SIGTERM"); } catch { /* already stopped */ }
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("close", resolve)), sleep(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    if (existsSync(canary.root)) removeCanary(canary);
    sandbox.cleanup();
  });
  const lockPath = join(sandbox.zvecHome, "daemon", "instance.lock");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(lockPath)) {
      try { lock = JSON.parse(readFileSync(lockPath, "utf8")); } catch { /* write in progress */ }
      if (lock?.ready && lock.managedSocket) break;
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await sleep(50);
  }
  assert.ok(lock?.ready && lock.managedSocket, `managed daemon failed to start: ${stderr}`);
  return { sandbox, env, lock, child };
}

function connectBridge(t, fixture) {
  const child = spawn(process.execPath, [DAEMON_MAIN, "bridge", "--home", fixture.sandbox.zvecHome], {
    env: fixture.env, cwd: fixture.sandbox.workspace, stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    const resolve = pending.get(response.id);
    if (resolve) { pending.delete(response.id); resolve(response); }
  });
  t.after(() => { lines.close(); child.kill(); });
  let id = 0;
  return {
    child,
    async request(method, params = {}) {
      const requestId = ++id;
      let timer;
      const reply = new Promise((resolve, reject) => {
        pending.set(requestId, resolve);
        timer = setTimeout(() => reject(new Error(`MCP ${method} timed out; stderr: ${stderr}`)), 15_000);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
      try { return await reply; } finally { clearTimeout(timer); pending.delete(requestId); }
    },
    notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`); },
  };
}

test("Unix bridge carries MCP initialize, list and tool call without creating an index", mac, async (t) => {
  const fixture = await launch(t);
  const socket = lstatSync(fixture.lock.managedSocket);
  const directory = lstatSync(dirname(fixture.lock.managedSocket));
  assert.ok(socket.isSocket());
  assert.equal(socket.uid, process.getuid());
  assert.equal(socket.mode & 0o077, 0);
  assert.equal(directory.uid, process.getuid());
  assert.equal(directory.mode & 0o077, 0);
  const bridge = connectBridge(t, fixture);
  const init = await bridge.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "transport-test", version: "1" } });
  assert.equal(init.jsonrpc, "2.0");
  assert.ok(init.result?.protocolVersion, JSON.stringify(init));
  bridge.notify("notifications/initialized");
  const list = await bridge.request("tools/list");
  assert.ok(Array.isArray(list.result?.tools), JSON.stringify(list));
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ["zvec_grep_search"]);
  const call = await bridge.request("tools/call", { name: "zvec_grep_search", arguments: { root: fixture.sandbox.workspace, query: "fixture" } });
  assert.ok(call.error || call.result?.isError, JSON.stringify(call));
  assert.equal(existsSync(join(fixture.sandbox.workspace, ".zvec-grep")), false);
  assert.deepEqual(fixture.sandbox.egressEvents(), []);
});

test("a running stdio session fails closed when its daemon exits", mac, async (t) => {
  const fixture = await launch(t);
  const bridge = connectBridge(t, fixture);
  const init = await bridge.request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "transport-test", version: "1" } });
  assert.ok(init.result?.protocolVersion, JSON.stringify(init));
  const exited = new Promise((resolve) => bridge.child.once("exit", resolve));
  process.kill(fixture.lock.pid, "SIGTERM");
  const result = await Promise.race([exited.then(() => "exited"), sleep(8000).then(() => "timeout")]);
  assert.equal(result, "exited", "bridge must close instead of reconnecting to a replacement daemon");
});

test("Unix fetch streams authenticated responses and rejects a spoofed peer", async (t) => {
  const sandbox = createSandbox();
  const socketPath = join(sandbox.root, "mcp.sock");
  let finishStream;
  const server = createServer((request, response) => {
    response.setHeader("x-managed-instance", request.headers["x-test-spoof"] ? "impostor" : "expected");
    if (request.url === "/managed/identity") { response.end("{}"); return; }
    response.setHeader("content-type", "text/event-stream");
    response.write("data: first\n\n");
    finishStream = () => response.end("data: second\n\n");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  chmodSync(socketPath, 0o600);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); sandbox.cleanup(); });
  const fetchUnix = unixFetch(socketPath, "expected");
  const response = await fetchUnix("http://localhost/mcp", { method: "POST", body: "{}" });
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  finishStream();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: second\n\n");
  assert.equal((await reader.read()).done, true);
  await assert.rejects(fetchUnix("http://localhost/mcp", { headers: { "x-test-spoof": "1" } }), /identity mismatch/i);
  chmodSync(socketPath, 0o666);
  await assert.rejects(fetchUnix("http://localhost/mcp"), /owner-private/i);
  await assert.rejects(fetchUnix("http://example.invalid/mcp"), /destination/i);
});

test("Unix fetch propagates abort to a pending daemon request", async (t) => {
  const sandbox = createSandbox();
  const socketPath = join(sandbox.root, "mcp.sock");
  let sawRequest;
  const received = new Promise((resolve) => { sawRequest = resolve; });
  const server = createServer((request, response) => {
    if (request.url === "/managed/identity") {
      response.setHeader("x-managed-instance", "expected");
      response.end("{}");
    } else sawRequest();
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  chmodSync(socketPath, 0o600);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); sandbox.cleanup(); });
  const controller = new AbortController();
  const pending = unixFetch(socketPath, "expected")("http://localhost/mcp", { signal: controller.signal });
  await received;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(unixFetch(socketPath, "expected")("http://localhost/mcp", { signal: AbortSignal.timeout(100) }), { name: "AbortError" });
});

test("Unix fetch fails closed when the authenticated connection is closed before the MCP request", async (t) => {
  const sandbox = createSandbox();
  const socketPath = join(sandbox.root, "mcp.sock");
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ path: request.url, headers: request.headers });
    response.setHeader("x-managed-instance", "secret-instance-id");
    response.setHeader("connection", "close");
    response.end("{}");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  chmodSync(socketPath, 0o600);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); sandbox.cleanup(); });
  await assert.rejects(unixFetch(socketPath, "secret-instance-id")("http://localhost/mcp", { method: "POST", body: "{}", signal: AbortSignal.timeout(3000) }));
  assert.deepEqual(seen.map((entry) => entry.path), ["/managed/identity"]);
  assert.ok(!JSON.stringify(seen).includes("secret-instance-id"), "the identity secret must never be sent to the peer");
});

test("Unix fetch never sends MCP data or the instance secret to a spoofed peer", async (t) => {
  const sandbox = createSandbox();
  const socketPath = join(sandbox.root, "mcp.sock");
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ path: request.url, headers: request.headers });
    response.setHeader("x-managed-instance", "impostor");
    response.end("{}");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  chmodSync(socketPath, 0o600);
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); sandbox.cleanup(); });
  await assert.rejects(unixFetch(socketPath, "secret-instance-id")("http://localhost/mcp", { method: "POST", body: "private request" }), /identity mismatch/i);
  assert.deepEqual(seen.map((entry) => entry.path), ["/managed/identity"]);
  assert.ok(!JSON.stringify(seen).includes("secret-instance-id"));
});
