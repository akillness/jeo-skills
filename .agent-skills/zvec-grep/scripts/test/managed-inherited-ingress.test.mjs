
// Black-box tests of the experimental Unix ingress, with a mock MCP backend.
// The backend is a separate process whose event loop really blocks; no index or native daemon is started.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createSandbox, DAEMON_DIR, OS_SANDBOX_AVAILABLE, TRIPWIRE, sleep } from "./harness.mjs";
import { launchUnixSupervisor } from "../managed-daemon/unix-supervisor.mjs";
import { buildProfile } from "../managed-daemon/os-sandbox.mjs";

const script = `
  import http from 'node:http';
  import { appendFileSync, writeFileSync } from 'node:fs';
  const { launchUnixSupervisor, attachPrivateChannels } = await import(process.argv[1]);
  const [socketPath, marker, events, mode] = process.argv.slice(2);
  const server = http.createServer((req, res) => {
    if (req.url === '/managed/identity') { res.setHeader('x-managed-instance', 'fixture'); return res.end('{}'); }
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const msg = JSON.parse(body || '{}');
      appendFileSync(events, JSON.stringify({method: msg.method, id: msg.id, session: req.headers['mcp-session-id'], params: msg.params}) + '\\n');
      if (msg.method === 'notifications/cancelled' || msg.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
      if (msg.method === 'initialize') { res.writeHead(200, {'content-type':'application/json', 'mcp-session-id':'session-1'}); return res.end(JSON.stringify({jsonrpc:'2.0', id:msg.id, result:{protocolVersion:'2025-03-26', capabilities:{}, serverInfo:{name:'fixture',version:'1'}}})); }
      const mode = msg.params?.arguments?.query;
      if (mode === 'flood') {
        res.writeHead(200, {'content-type':'text/event-stream'});
        const frame = 'data: ' + 'x'.repeat(32000) + '\\n\\n';
        for (let i = 0; i < 500; i++) res.write(frame);
        return;
      }
      if (mode === 'block') { writeFileSync(marker, 'blocked'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000); }
      if (mode === 'progress') {
        res.writeHead(200, {'content-type':'text/event-stream', 'mcp-session-id':'session-1'});
        res.write('event: message\\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:'p',progress:1}})+'\\n\\n');
        return setTimeout(() => res.end('event: message\\ndata: '+JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'LATE'}]}})+'\\n\\n'), 700);
      }
      res.writeHead(200, {'content-type':'application/json', 'mcp-session-id':'session-1'});
      res.end(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:mode === 'block' ? 'STALE' : 'FRESH'}]}}));
    });
  });
  const {child, ready} = launchUnixSupervisor({socketPath, deadlineMs:200, instanceToken:'fixture', channels:8});
  if (mode === 'no-ack') {
    for (const socket of child.stdio.slice(4)) server.emit('connection', socket);
    const dropped = new Set();
    child.on('message', (message, socket) => {
      if (message?.type === 'ackQuery' && dropped.has(message.index)) {
        child.send({type:'attached', index:message.index, generation:message.generation, nonce:message.nonce});
        return;
      }
      if (message?.type !== 'attach' || !socket) return;
      server.emit('connection', socket);
      if (dropped.has(message.index)) child.send({type:'attached', index:message.index, generation:message.generation, nonce:message.nonce});
      else dropped.add(message.index);
    });
  } else if (mode === 'reorder') {
    for (const socket of child.stdio.slice(4)) server.emit('connection', socket);
    const old = new Map();
    child.on('message', (message, socket) => {
      if (message?.type === 'ackQuery' && !old.has(message.index)) {
        old.set(message.index, message.nonce);
        child.send({type:'missing', index:message.index, generation:message.generation, nonce:message.nonce});
      } else if (message?.type === 'attach' && socket) {
        server.emit('connection', socket);
        child.send({type:'missing', index:message.index, generation:message.generation, nonce:old.get(message.index)});
        child.send({type:'attached', index:message.index, generation:message.generation, nonce:old.get(message.index)});
        appendFileSync(events, JSON.stringify({stale:message.index}) + '\\n');
        setTimeout(() => child.send({type:'attached', index:message.index, generation:message.generation, nonce:message.nonce}), 1200);
      }
    });
  } else attachPrivateChannels(server, child);
  child.stderr.pipe(process.stderr);
  await ready; console.log('ready');
  process.on('SIGTERM', () => { child.kill('SIGKILL'); process.exit(0); });
`;

async function fixture(t, kernelSandbox = false, noAck = false, fault = "") {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, "ingress.sock");
  const marker = join(sandbox.root, "blocked");
  const events = join(sandbox.root, "events");
  const faults = join(sandbox.root, "faults");
  const preload = join(sandbox.root, "fault-preload.mjs");
  writeFileSync(preload, `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { appendFileSync } from 'node:fs';
    if (process.argv[2] === '--channel-helper' && process.env.FAULT_MODE === 'hang') {
      appendFileSync(process.env.FAULT_LOG, String(process.pid) + '\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
    }
    if (process.argv[2] === '--fixture') {
      let count = 0;
      if (process.env.FAULT_MODE === 'spawn') {
        const original = childProcess.spawn;
        childProcess.spawn = (...args) => {
          if (args[1]?.includes('--channel-helper') && count++ < 6) { appendFileSync(process.env.FAULT_LOG, 'spawn\\n'); throw new Error('injected spawn failure'); }
          return original(...args);
        };
        syncBuiltinESMExports();
      }
      if (process.env.FAULT_MODE === 'send') {
        const original = process.send.bind(process);
        process.send = (message, ...args) => {
          if (message?.type === 'attach' && count++ < 6) {
            appendFileSync(process.env.FAULT_LOG, 'send\\n');
            const callback = args.find(arg => typeof arg === 'function');
            queueMicrotask(() => callback?.(new Error('injected IPC failure')));
            return false;
          }
          return original(message, ...args);
        };
      }
    }
  `);
  const args = ["--input-type=module", "-e", script, pathToFileURL(join(DAEMON_DIR, "unix-supervisor.mjs")).href, socket, marker, events, noAck === "reorder" ? "reorder" : noAck ? "no-ack" : "normal"];
  const profile = kernelSandbox && buildProfile({ port: 47991, nodePath: realpathSync(process.execPath), rgPath: realpathSync(process.execPath), writableRoots: [sandbox.root], home: sandbox.zvecHome });
  const options = fault ? {env: {NODE_OPTIONS: `--import=${TRIPWIRE} --import=${preload}`, FAULT_MODE: fault, FAULT_LOG: faults}} : {};
  const peer = kernelSandbox
    ? sandbox.spawn("/usr/bin/sandbox-exec", ["-p", profile, process.execPath, ...args], {...options, wrap: false})
    : sandbox.spawn(process.execPath, args, options);
  t.after(async () => { peer.child.kill("SIGTERM"); await Promise.race([peer.closed, sleep(1500)]); peer.child.kill("SIGKILL"); sandbox.cleanup(); });
  for (let i = 0; i < 150 && !peer.out.stdout.includes("ready"); i++) await sleep(20);
  assert.match(peer.out.stdout, /ready/, peer.out.stderr);
  return { sandbox, socket, marker, events, faults, peer };
}

function call(socket, message, session, path = "/mcp") {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(message);
    const req = http.request({ socketPath: socket, path, method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(session ? { "mcp-session-id": session } : {}) } }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text })); res.on("error", reject);
    });
    req.setTimeout(2500, () => req.destroy(new Error("external watchdog")));
    req.on("error", error => reject(new Error(`${message.method} ${message.id ?? "notification"}: ${error.message}`, { cause: error }))); req.end(body);
  });
}
const search = (id, query) => ({jsonrpc:"2.0", id, method:"tools/call", params:{name:"zvec_grep_search", arguments:{root:"/fixture", query}, _meta:{progressToken:"p"}}});
const fallback = result => { assert.equal(result.result?.isError, true, JSON.stringify(result)); assert.match(result.result.content[0].text, /native Grep|\brg\b/i); };

async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await sleep(10); }
  assert.fail("fixture event did not occur");
}

test("public inherited ingress bounds an actually blocked backend and drops late results", { timeout: 8000 }, async t => {
  const f = await fixture(t);
  const start = Date.now();
  const firstPromise = call(f.socket, search(10, "block"), "session-1");
  await waitFor(() => existsSync(f.marker));
  const first = await firstPromise;
  assert.ok(Date.now() - start < 800, "first response exceeded deadline");
  fallback(JSON.parse(first.text));
  const secondStart = Date.now();
  const second = await call(f.socket, search(11, "fresh"), "session-1");
  assert.ok(Date.now() - secondStart < 800, "second response exceeded deadline");
  fallback(JSON.parse(second.text));
  await sleep(1100);
  assert.doesNotMatch(first.text + second.text, /STALE|FRESH/);
  const recovered = await call(f.socket, search(12, "fresh"), "session-1");
  assert.equal(JSON.parse(recovered.text).result.content[0].text, "FRESH");
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

test("public ingress preserves session, progress and cancellation without a late SSE result", { timeout: 8000 }, async t => {
  const f = await fixture(t);
  const init = await call(f.socket, {jsonrpc:"2.0", id:1, method:"initialize", params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"test",version:"1"}}});
  assert.equal(init.headers["mcp-session-id"], "session-1");
  assert.equal(JSON.parse(init.text).id, 1);
  await call(f.socket, {jsonrpc:"2.0", method:"notifications/initialized"}, "session-1");
  const progress = call(f.socket, search(20, "progress"), "session-1");
  await waitFor(() => existsSync(f.events) && readFileSync(f.events, "utf8").includes('"id":20'));
  const cancel = await call(f.socket, {jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:20,reason:"stop"}}, "session-1");
  assert.equal(cancel.status, 202);
  const result = await progress;
  assert.match(result.text, /notifications\/progress/);
  assert.match(result.text, /"progressToken":"p"/);
  assert.match(result.text, /native Grep|\brg\b/i);
  assert.doesNotMatch(result.text, /LATE/);
  await sleep(800);
  const events = readFileSync(f.events, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(events.some(e => e.id === 20 && e.session === "session-1"));
  assert.ok(events.some(e => e.method === "notifications/cancelled" && e.session === "session-1" && e.params.requestId === 20));
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

test("supervisor rejects deadlines above the 29-second delivery budget", () => {
  assert.throws(() => launchUnixSupervisor({socketPath:"/unused", instanceToken:"fixture", deadlineMs:29_001}), /invalid supervisor limits/);
});

test("query-bearing MCP searches remain bounded and batches never reach the backend", { timeout: 8000 }, async t => {
  const f = await fixture(t);
  const batch = await call(f.socket, [search(30, "fresh")], "session-1", "/mcp?x=1");
  assert.equal(batch.status, 400);
  assert.equal(existsSync(f.events), false);
  const started = Date.now();
  const response = await call(f.socket, search(31, "block"), "session-1", "/mcp?x=1");
  assert.ok(existsSync(f.marker));
  assert.ok(Date.now() - started < 800);
  fallback(JSON.parse(response.text));
  assert.doesNotMatch(response.text, /STALE/);
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

test("incomplete request body is disconnected within ingress deadline", { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const socket = net.createConnection({ path: f.socket });
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write("POST /mcp HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{");
  const start = Date.now();
  await Promise.race([new Promise(resolve => { socket.on("error", resolve); socket.on("close", resolve); }), sleep(1500).then(() => { throw new Error("stalled body was not closed"); })]);
  assert.ok(Date.now() - start < 1200);
  assert.equal(existsSync(f.events), false);
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

test("partial headers are closed in bounded time", { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const socket = net.createConnection({ path: f.socket });
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write("POST /mcp HTTP/1.1\r\nHost: localhost\r\n");
  const start = Date.now();
  await Promise.race([new Promise(resolve => { socket.on("error", resolve); socket.on("close", resolve); socket.resume(); }), sleep(1800).then(() => { throw new Error("partial headers were not closed"); })]);
  assert.ok(Date.now() - start < 1500);
  assert.equal(existsSync(f.events), false);
});

test("client disconnect during progress leaves ingress responsive", { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const req = http.request({ socketPath: f.socket, path: "/mcp", method: "POST", headers: { "content-type": "application/json" } });
  req.on("error", () => {});
  req.end(JSON.stringify(search(40, "progress")));
  await new Promise((resolve, reject) => { req.once("response", res => { res.once("data", () => { req.destroy(); resolve(); }); res.once("error", reject); }); });
  const response = await call(f.socket, search(41, "fresh"), "session-1");
  assert.equal(JSON.parse(response.text).result.content[0].text, "FRESH");
});

test("blocked SSE consumer is closed instead of unbounded output buffering", { timeout: 6000 }, async t => {
  const f = await fixture(t);
  const req = http.request({ socketPath: f.socket, path: "/mcp", method: "POST", headers: { "content-type": "application/json" } });
  req.on("error", () => {});
  req.end(JSON.stringify(search(50, "flood")));
  const res = await new Promise(resolve => req.once("response", resolve));
  res.pause();
  const closed = new Promise(resolve => { res.on("error", resolve); res.on("close", resolve); res.on("end", resolve); });
  await sleep(500);
  res.resume();
  await Promise.race([closed, sleep(2000).then(() => { throw new Error("blocked SSE response stayed open"); })]);
  const fresh = await call(f.socket, search(51, "fresh"), "session-1");
  assert.equal(JSON.parse(fresh.text).result.content[0].text, "FRESH");
});

test("repeated client disconnects do not exhaust inherited channels", { timeout: 10000 }, async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) {
    const req = http.request({ socketPath: f.socket, path: "/mcp", method: "POST", headers: { "content-type": "application/json" } });
    req.on("error", () => {});
    req.end(JSON.stringify(search(100 + i, "progress")));
    await Promise.race([new Promise((resolve, reject) => {
      req.once("response", res => {
        if (res.statusCode !== 200) return reject(new Error(`disconnect ${i}: HTTP ${res.statusCode}`));
        res.once("data", chunk => { if (!chunk.toString().includes("notifications/progress")) return reject(new Error(`disconnect ${i}: missing progress: ${chunk}`)); req.destroy(); resolve(); });
        res.once("error", reject);
      });
    }), sleep(1000).then(() => { throw new Error(`disconnect ${i} timed out`); })]);
  }
  const result = await call(f.socket, search(200, "fresh"), "session-1");
  assert.equal(JSON.parse(result.text).result.content[0].text, "FRESH");
});

test("concurrent timed-out searches release channels for later recovery", { timeout: 8000 }, async t => {
  const f = await fixture(t);
  const requests = Array.from({length: 10}, (_, i) => call(f.socket, search(300 + i, i === 0 ? "block" : "fresh"), "session-1"));
  const replies = await Promise.all(requests);
  assert.ok(existsSync(f.marker));
  for (const reply of replies) fallback(JSON.parse(reply.text));
  await sleep(1400);
  const recovered = await call(f.socket, search(400, "fresh"), "session-1");
  assert.equal(JSON.parse(recovered.text).result.content[0].text, "FRESH");
});

test("cancellation is forwarded while search channels are saturated", { timeout: 6000 }, async t => {
  const f = await fixture(t);
  const searches = Array.from({length: 6}, (_, i) => call(f.socket, search(500 + i, "progress"), "session-1"));
  await waitFor(() => existsSync(f.events) && readFileSync(f.events, "utf8").trim().split("\n").length >= 6);
  const cancel = await call(f.socket, {jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:500}}, "session-1");
  assert.equal(cancel.status, 202);
  await Promise.all(searches);
  const events = readFileSync(f.events, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(events.some(e => e.method === "notifications/cancelled" && e.params.requestId === 500));
});

test("channel replacement and timeout recovery work under daemon kernel profile", { skip: !OS_SANDBOX_AVAILABLE && "macOS sandbox-exec unavailable", timeout: 10000 }, async t => {
  const f = await fixture(t, true);
  for (let i = 0; i < 10; i++) {
    const req = http.request({socketPath:f.socket, path:"/mcp", method:"POST", headers:{"content-type":"application/json"}});
    req.on("error", () => {});
    req.end(JSON.stringify(search(600 + i, "progress")));
    await Promise.race([new Promise((resolve, reject) => {
      req.once("response", res => { res.once("data", chunk => { if (!chunk.toString().includes("notifications/progress")) return reject(new Error(`missing progress ${i}: ${chunk}`)); req.destroy(); resolve(); }); res.once("error", reject); });
    }), sleep(1500).then(() => { throw new Error(`disconnect ${i} timed out`); })]);
  }
  const timed = await call(f.socket, search(700, "block"), "session-1");
  fallback(JSON.parse(timed.text));
  assert.ok(existsSync(f.marker));
  await sleep(1200);
  const recovered = await call(f.socket, search(701, "fresh"), "session-1");
  assert.equal(JSON.parse(recovered.text).result.content[0].text, "FRESH");
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

test("lost replacement acknowledgments fail closed and recover", { timeout: 9000 }, async t => {
  const f = await fixture(t, false, true);
  for (let i = 0; i < 6; i++) {
    const req = http.request({socketPath:f.socket, path:"/mcp", method:"POST", headers:{"content-type":"application/json"}});
    req.on("error", () => {});
    req.end(JSON.stringify(search(800 + i, "progress")));
    await Promise.race([new Promise((resolve, reject) => {
      req.once("response", res => { res.once("data", chunk => { if (!chunk.toString().includes("notifications/progress")) return reject(new Error(`missing progress ${i}: ${chunk}`)); req.destroy(); resolve(); }); res.once("error", reject); });
    }), sleep(1500).then(() => { throw new Error(`disconnect ${i} timed out`); })]);
  }
  const started = Date.now();
  const response = await call(f.socket, search(900, "fresh"), "session-1");
  assert.ok(Date.now() - started < 800);
  fallback(JSON.parse(response.text));
  await sleep(2500);
  const after = await call(f.socket, search(901, "fresh"), "session-1");
  assert.equal(JSON.parse(after.text).result.content[0].text, "FRESH");
  assert.deepEqual(f.sandbox.egressEvents(), []);
});

for (const fault of ["spawn", "send"]) {
  test(`transient ${fault} failure does not permanently exhaust search channels`, {timeout: 12000}, async t => {
    const f = await fixture(t, false, false, fault);
    for (let i = 0; i < 6; i++) {
      const req = http.request({socketPath:f.socket, path:"/mcp", method:"POST", headers:{"content-type":"application/json"}});
      req.on("error", () => {});
      req.end(JSON.stringify(search(1000 + i, "progress")));
      await Promise.race([new Promise((resolve, reject) => {
        req.once("response", res => { res.once("data", chunk => { if (!chunk.toString().includes("notifications/progress")) return reject(new Error(`missing progress ${i}: ${chunk}`)); req.destroy(); resolve(); }); res.once("error", reject); });
      }), sleep(1500).then(() => { throw new Error(`disconnect ${i} timed out`); })]);
    }
    await waitFor(() => existsSync(f.faults) && readFileSync(f.faults, "utf8").trim().split("\n").length === 6);
    await sleep(2500);
    const response = await call(f.socket, search(1100, "fresh"), "session-1");
    assert.equal(JSON.parse(response.text).result.content[0].text, "FRESH");
    assert.deepEqual(f.sandbox.egressEvents(), []);
  });
}

test("writer death closes stalled ingress and stops its Unix listener", {timeout: 6000}, async t => {
  const f = await fixture(t);
  const socket = net.createConnection({path:f.socket});
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  const closed = new Promise(resolve => { socket.on("error", resolve); socket.on("close", resolve); });
  socket.write("POST /mcp HTTP/1.1\r\nHost: localhost\r\n");
  f.peer.child.kill("SIGKILL");
  await f.peer.closed;
  await Promise.race([closed, sleep(2000).then(() => { throw new Error("stalled connection survived writer death"); })]);
  const connected = await new Promise(resolve => {
    const probe = net.createConnection({path:f.socket});
    probe.once("connect", () => { probe.destroy(); resolve(true); });
    probe.once("error", () => resolve(false));
  });
  assert.equal(connected, false, "listener still accepts after writer death");
});

test("stuck channel helper is terminated by watchdog", {timeout: 6000}, async t => {
  const f = await fixture(t, false, false, "hang");
  const req = http.request({socketPath:f.socket, path:"/mcp", method:"POST", headers:{"content-type":"application/json"}});
  req.on("error", () => {});
  req.end(JSON.stringify(search(1200, "progress")));
  await new Promise((resolve, reject) => { req.once("response", res => { res.once("data", () => { req.destroy(); resolve(); }); res.once("error", reject); }); });
  await waitFor(() => existsSync(f.faults));
  const pid = Number(readFileSync(f.faults, "utf8").trim());
  assert.ok(Number.isInteger(pid) && pid > 1);
  await sleep(2400);
  assert.throws(() => process.kill(pid, 0), {code:"ESRCH"});
  const response = await call(f.socket, search(1201, "fresh"), "session-1");
  assert.equal(JSON.parse(response.text).result.content[0].text, "FRESH");
});

test("stale same-generation ACK cannot authorize a replacement before its own ACK", {timeout:10000}, async t => {
  const f = await fixture(t, false, "reorder", "send");
  for (let i = 0; i < 6; i++) {
    const req = http.request({socketPath:f.socket, path:"/mcp", method:"POST", headers:{"content-type":"application/json"}});
    req.on("error", () => {});
    req.end(JSON.stringify(search(1300 + i, "progress")));
    await Promise.race([new Promise((resolve, reject) => {
      req.once("response", res => { res.once("data", chunk => { if (!chunk.toString().includes("notifications/progress")) return reject(new Error(`missing progress ${i}: ${chunk}`)); req.destroy(); resolve(); }); res.once("error", reject); });
    }), sleep(1500).then(() => { throw new Error(`disconnect ${i} timed out`); })]);
  }
  await waitFor(() => existsSync(f.events) && readFileSync(f.events, "utf8").split('"stale":').length - 1 >= 6);
  const early = await call(f.socket, search(1400, "fresh"), "session-1");
  fallback(JSON.parse(early.text));
  await sleep(1400);
  const recovered = await call(f.socket, search(1401, "fresh"), "session-1");
  assert.equal(JSON.parse(recovered.text).result.content[0].text, "FRESH");
});
