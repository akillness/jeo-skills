// Experimental fixture transport. Not wired into the managed daemon lifecycle.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BODY = 1024 * 1024;
const MAX_DEADLINE = 29_000;
const timeoutResult = { isError: true, content: [{ type: "text", text: "Fresh search timed out; use native Grep or rg instead." }] };

export function launchUnixSupervisor({ socketPath, deadlineMs = MAX_DEADLINE, instanceToken, channels = 16, deferred = false }) {
  if (!Number.isInteger(channels) || channels < 4 || channels > 64 || !Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > MAX_DEADLINE) throw new Error("invalid supervisor limits");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--fixture"], {
    stdio: ["ignore", "ignore", "pipe", "ipc", ...Array(channels).fill("pipe")],
  });
  const ready = new Promise((resolve, reject) => {
    const failed = (error) => reject(error instanceof Error ? error : new Error("supervisor stopped before ready"));
    child.once("error", failed);
    child.once("exit", failed);
    child.once("message", (message) => {
      child.off("error", failed);
      child.off("exit", failed);
      if (message?.ready) resolve();
      else reject(new Error(message?.error || "supervisor startup failed"));
    });
  });
  let activated = false;
  const activate = (config = {}) => {
    if (activated || !child.connected) throw new Error("supervisor cannot be activated");
    activated = true;
    child.send({ socketPath: config.socketPath ?? socketPath, deadlineMs, instanceToken: config.instanceToken ?? instanceToken, channels });
  };
  if (!deferred) activate();
  return { child, ready, activate };
}

export function attachPrivateChannels(server, child) {
  for (const socket of child.stdio.slice(4)) server.emit("connection", socket);
  const generations = Array(child.stdio.length - 4).fill(0);
  const nonces = Array(generations.length).fill(undefined);
  child.on("message", (message, socket) => {
    if (message?.type === "ackQuery" && !socket && Number.isInteger(message.index) && message.index >= 0 && message.index < generations.length && Number.isInteger(message.generation) && message.generation > 0 && typeof message.nonce === "string") {
      if (child.connected && message.generation === generations[message.index] && message.nonce === nonces[message.index]) child.send({ type: "attached", index: message.index, generation: message.generation, nonce: message.nonce });
      else if (child.connected && message.generation === generations[message.index] + 1) child.send({ type: "missing", index: message.index, generation: message.generation, nonce: message.nonce });
      return;
    }
    if (message?.type !== "attach" || !Number.isInteger(message.index) || message.index < 0 || message.index >= generations.length || message.generation !== generations[message.index] + 1 || typeof message.nonce !== "string" || message.nonce.length !== 36 || !(socket instanceof net.Socket)) {
      socket?.destroy();
      return;
    }
    generations[message.index] = message.generation;
    nonces[message.index] = message.nonce;
    server.emit("connection", socket);
    if (child.connected) child.send({ type: "attached", index: message.index, generation: message.generation, nonce: message.nonce });
  });
}

async function start({ socketPath, deadlineMs, instanceToken, channels }) {
  const pool = new Array(channels);
  const helpers = new Set();
  let closing = false;
  const retry = (index, previous, attempts) => {
    if (closing || !process.connected || pool[index] !== previous || attempts >= 3) return;
    const timer = setTimeout(() => replace(index, previous, attempts + 1), 200);
    timer.unref();
  };
  const replace = (index, previous, attempts = 0) => {
    if (closing || !process.connected || pool[index] !== previous) return;
    let helper;
    try { helper = spawn(process.execPath, [fileURLToPath(import.meta.url), "--channel-helper"], { stdio: ["ignore", "ignore", "ignore", "ipc", "pipe"] }); }
    catch { retry(index, previous, attempts); return; }
    helpers.add(helper);
    let received = false;
    let failed = false;
    const helperTimer = setTimeout(() => helper.kill("SIGKILL"), 2000);
    helperTimer.unref();
    const onFailure = () => { clearTimeout(helperTimer); helpers.delete(helper); if (!received && !failed) { failed = true; retry(index, previous, attempts); } };
    helper.once("error", onFailure);
    helper.once("exit", onFailure);
    helper.once("message", (message, replacement) => {
      if (closing || pool[index] !== previous || message?.type !== "channel" || !(replacement instanceof net.Socket) || !process.connected) { replacement?.destroy(); helper.kill(); return; }
      received = true;
      const next = previous.generation + 1;
      install(index, replacement, next, false);
      const pending = pool[index];
      pending.nonce = randomUUID();
      pending.attempts = attempts;
      pending.peer = helper.stdio[4];
      pending.retry = setTimeout(() => {
        if (!closing && pool[index] === pending && pending.awaiting && process.connected) {
          try { process.send({ type: "ackQuery", index, generation: next, nonce: pending.nonce }); } catch { /* leave slot unavailable */ }
        }
      }, 500);
      pending.retry.unref();
      try {
        process.send({ type: "attach", index, generation: next, nonce: pending.nonce }, pending.peer, (error) => {
          if (error && process.connected && pool[index] === pending && pending.awaiting) {
            try { process.send({ type: "ackQuery", index, generation: next, nonce: pending.nonce }); } catch { /* leave slot unavailable */ }
          }
        });
      } catch {
        if (process.connected) { try { process.send({ type: "ackQuery", index, generation: next, nonce: pending.nonce }); } catch { /* leave slot unavailable */ } }
      }
    });
  };
  const install = (index, socket, generation, ready) => {
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    agent.createConnection = () => socket;
    const slot = { agent, socket, busy: false, dead: !ready, awaiting: !ready, generation };
    pool[index] = slot;
    socket.on("error", () => { slot.dead = true; });
    socket.on("close", () => {
      slot.dead = true;
      if (!slot.awaiting) replace(index, slot);
    });
  };
  for (let index = 0; index < channels; index++) install(index, new net.Socket({ fd: index + 4, readable: true, writable: true }), 0, true);
  process.on("message", (message) => {
    if (!Number.isInteger(message?.index) || message.index < 0 || message.index >= channels) return;
    const slot = pool[message.index];
    if (!slot.awaiting || slot.generation !== message.generation || slot.nonce !== message.nonce) return;
    if (message.type === "attached" && !slot.socket.destroyed) { clearTimeout(slot.retry); slot.awaiting = false; slot.dead = false; }
    else if (message.type === "missing") {
      clearTimeout(slot.retry);
      slot.peer?.destroy();
      slot.socket.destroy();
      slot.generation -= 1;
      retry(message.index, slot, slot.attempts);
    }
  });
  const server = http.createServer({ headersTimeout: deadlineMs, connectionsCheckingInterval: 250 }, (request, response) => {
    let ingressPath;
    try { ingressPath = new URL(request.url, "http://localhost").pathname; } catch { response.writeHead(400); response.end(); request.resume(); return; }
    const boundedBody = request.method === "POST" && (ingressPath === "/mcp" || ingressPath.startsWith("/managed/"));
    let bodyTimeout = setTimeout(() => { if (!response.writableEnded && !response.destroyed) response.destroy(); }, deadlineMs);
    let chunks = [];
    let bytes = 0;
    let oversized = false;
    let requestMessage;
    let timer;
    let backend;
    let timedOut = false;
    let isSearch = false;
    let stream = false;
    let sseTail = "";
    let sseBoundary = true;
    let slot;
    let upstreamComplete = false;
    response.on("close", () => {
      clearTimeout(bodyTimeout);
      if (!response.writableFinished && backend) { slot.dead = true; backend.destroy(); }
    });
    const finishTimeout = () => {
      if (timedOut || response.writableEnded || response.destroyed) return;
      timedOut = true;
      const message = JSON.stringify({ jsonrpc: "2.0", id: requestMessage.id, result: timeoutResult });
      if (response.headersSent) {
        if (stream && sseBoundary) response.end(`event: message\ndata: ${message}\n\n`);
        else response.destroy();
      } else {
        response.writeHead(200, { "content-type": "application/json", "x-managed-instance": instanceToken });
        response.end(message);
      }
      if (backend) { slot.dead = true; backend.destroy(); }
    };
    const finishControlTimeout = () => {
      if (timedOut || response.writableEnded || response.destroyed) return;
      timedOut = true;
      if (response.headersSent) response.destroy();
      else { response.writeHead(503, { "content-type": "application/json", "x-managed-instance": instanceToken }); response.end('{"status":"failed","error":{"code":"BACKEND_TIMEOUT"}}'); }
      if (backend) { slot.dead = true; backend.destroy(); }
    };
    request.on("error", () => { clearTimeout(bodyTimeout); response.destroy(); });
    request.on("data", (chunk) => {
      if (oversized) return;
      bytes += chunk.length;
      if (boundedBody && bytes > MAX_BODY) { oversized = true; clearTimeout(bodyTimeout); chunks = []; response.writeHead(413); response.end(); return; }
      chunks.push(chunk);
    });
    request.on("end", async () => {
      clearTimeout(bodyTimeout);
      if (oversized) return;
      const body = Buffer.concat(chunks);
      chunks = [];
      const started = performance.now();
      try { requestMessage = JSON.parse(body.toString("utf8")); } catch { requestMessage = undefined; }
      let pathname;
      try { pathname = new URL(request.url, "http://localhost").pathname; } catch { response.writeHead(400); response.end(); return; }
      if (pathname === "/mcp" && Array.isArray(requestMessage)) { response.writeHead(400); response.end(); return; }
      isSearch = pathname === "/mcp" && request.method === "POST" && requestMessage?.method === "tools/call" && requestMessage.params?.name === "zvec_grep_search" && Object.hasOwn(requestMessage, "id");
      if (isSearch) {
        timer = setTimeout(finishTimeout, Math.max(0, started + deadlineMs - performance.now()));
        if (performance.now() >= started + deadlineMs) { finishTimeout(); return; }
      }
      const control = pathname.startsWith("/managed/") || (pathname === "/mcp" && requestMessage?.method === "notifications/cancelled");
      if (control) timer = setTimeout(finishControlTimeout, Math.max(0, started + deadlineMs - performance.now()));
      while (!closing && !timedOut && !response.destroyed) {
        slot = pool.find((item, index) => (control || index >= 2) && !item.busy && !item.dead);
        if (slot) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (closing || timedOut || response.destroyed) return;
      slot.busy = true;
      const headers = { ...request.headers, host: "localhost", connection: "keep-alive" };
      delete headers["transfer-encoding"];
      headers["content-length"] = body.length;
      backend = http.request({ host: "localhost", path: request.url, method: request.method, headers, agent: slot.agent }, (upstream) => {
        const outHeaders = { ...upstream.headers, "x-managed-instance": instanceToken };
        delete outHeaders["content-length"];
        delete outHeaders["transfer-encoding"];
        stream = String(upstream.headers["content-type"] ?? "").toLowerCase().startsWith("text/event-stream");
        if (stream && isSearch) upstream.on("data", (chunk) => {
          const suffix = sseTail + chunk.subarray(Math.max(0, chunk.length - 4)).toString("latin1");
          sseTail = suffix.slice(-4);
          sseBoundary = /(?:\n\n|\r\n\r\n|\r\r)$/.test(sseTail);
        });
        if (!timedOut && !response.destroyed) {
          response.writeHead(upstream.statusCode, outHeaders);
          upstream.pipe(response);
        }
        upstream.on("end", () => {
          upstreamComplete = true;
          slot.busy = false;
          clearTimeout(timer);
        });
        upstream.on("close", () => { if (!upstreamComplete) { slot.dead = true; slot.busy = false; clearTimeout(timer); if (!response.writableEnded) response.destroy(); } });
        upstream.on("error", () => { slot.dead = true; slot.busy = false; clearTimeout(timer); if (!response.writableEnded) response.destroy(); });
      });
      backend.on("error", () => { slot.dead = true; slot.busy = false; clearTimeout(timer); if (!response.writableEnded) response.destroy(); });
      backend.end(body);
    });
  });
  const dir = lstatSync(dirname(socketPath));
  if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid() || (dir.mode & 0o077)) throw new Error("socket directory is not owner-private");
  const mask = process.umask(0o177);
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    chmodSync(socketPath, 0o600);
  } finally { process.umask(mask); }
  process.send?.({ ready: true });
  process.on("disconnect", () => {
    closing = true;
    server.close();
    server.closeAllConnections();
    for (const helper of helpers) helper.kill("SIGKILL");
    for (const { agent } of pool) agent.destroy();
  });
}

if (process.argv[2] === "--fixture") {
  process.once("message", (config) => { start(config).catch((error) => { process.send?.({ error: error.message }); process.exitCode = 1; }); });
}

if (process.argv[2] === "--channel-helper") {
  const socket = new net.Socket({ fd: 4, readable: true, writable: true });
  process.send({ type: "channel" }, socket, () => process.disconnect());
}
