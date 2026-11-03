import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { superviseBridge } from "../managed-daemon/stdio-supervisor.mjs";
import { sleep } from "./harness.mjs";

function fixture(t, script, deadlineMs = 100) {
  const worker = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["pipe", "pipe", "pipe"] });
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  createInterface({ input: output }).on("line", line => messages.push(JSON.parse(line)));
  const stopped = superviseBridge({ child: worker, input, output, deadlineMs });
  t.after(async () => { input.end(); worker.kill("SIGKILL"); await Promise.race([stopped.catch(() => {}), sleep(1000)]); });
  const send = message => input.write(`${JSON.stringify(message)}\n`);
  return { worker, send, messages, stopped };
}
const search = (id, token) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "zvec_grep_search", arguments: { root: "/tmp", query: "x" }, ...(token === undefined ? {} : { _meta: { progressToken: token } }) } });
async function waitFor(predicate, ms = 1500) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (predicate()) return; await sleep(10); }
  assert.fail("timed out waiting for expected event");
}

test("cancel maps worker ID and live progress restores the original token", async t => {
  const f = fixture(t, `
    import { createInterface } from 'node:readline';
    let id;
    createInterface({ input: process.stdin }).on('line', line => {
      const msg = JSON.parse(line);
      if (msg.method === 'tools/call') {
        id = msg.id;
        console.log(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:msg.params._meta.progressToken,progress:1}}));
      } else if (msg.method === 'notifications/cancelled') {
        console.log(JSON.stringify({jsonrpc:'2.0',method:'test/cancel',params:{matched:msg.params.requestId === id}}));
        console.log(JSON.stringify({jsonrpc:'2.0',id,result:{content:[{type:'text',text:'cancelled'}]}}));
      }
    });
  `, 1000);
  f.send(search(17, "client-token"));
  await waitFor(() => f.messages.some(m => m.method === "notifications/progress"));
  assert.equal(f.messages.find(m => m.method === "notifications/progress").params.progressToken, "client-token");
  f.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 17, reason: "stop" } });
  await waitFor(() => f.messages.some(m => m.id === 17));
  assert.equal(f.messages.find(m => m.method === "test/cancel")?.params.matched, true);
  assert.equal(f.messages.find(m => m.id === 17).result.content[0].text, "cancelled");
});

test("overdue worker result and progress cannot escape as fresh", async t => {
  const f = fixture(t, `
    import { createInterface } from 'node:readline';
    createInterface({ input: process.stdin }).on('line', line => {
      const msg = JSON.parse(line);
      setTimeout(() => {
        console.log(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:msg.params._meta.progressToken,progress:1}}));
        console.log(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:'STALE'}]}}));
      }, 250);
    });
  `);
  f.send(search(5, "token"));
  await waitFor(() => f.messages.some(m => m.id === 5));
  assert.equal(f.messages.find(m => m.id === 5).result.isError, true);
  await sleep(450);
  assert.equal(f.messages.filter(m => m.id === 5).length, 1);
  assert.equal(f.messages.some(m => m.method === "notifications/progress"), false);
});

test("pending search remains bounded when worker exits before inherited stdout closes", async t => {
  const f = fixture(t, `
    import { spawn } from 'node:child_process';
    import { createInterface } from 'node:readline';
    createInterface({ input: process.stdin }).once('line', () => {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 450)'], { stdio: ['ignore', 1, 'ignore'] });
      child.unref();
      process.exit(0);
    });
  `);
  f.send(search(8));
  await waitFor(() => f.messages.some(m => m.id === 8), 1000);
  assert.equal(f.messages.find(m => m.id === 8).result.isError, true);
  assert.match(f.messages.find(m => m.id === 8).result.content[0].text, /Grep|\brg\b/i);
});

test("broken worker stdin still returns a bounded search failure", async t => {
  const f = fixture(t, "setTimeout(() => {}, 1000)");
  f.worker.stdin.destroy();
  f.send(search(9));
  await waitFor(() => f.messages.some(m => m.id === 9), 750);
  const response = f.messages.find(m => m.id === 9);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Grep|\brg\b/i);
});

test("timed-out search cancellation cannot target a later request reusing its client ID", async t => {
  const f = fixture(t, `
    import { createInterface } from 'node:readline';
    let searchId;
    let searchCancelled = false;
    let unexpectedCancel = false;
    createInterface({ input: process.stdin }).on('line', line => {
      const msg = JSON.parse(line);
      if (msg.method === 'tools/call') searchId = msg.id;
      else if (msg.method === 'notifications/cancelled') {
        if (msg.params.requestId === searchId) searchCancelled = true;
        else unexpectedCancel = true;
      } else if (msg.method === 'tools/list') {
        console.log(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{unique:msg.id !== searchId,searchCancelled,unexpectedCancel}}));
        setTimeout(() => console.log(JSON.stringify({jsonrpc:'2.0',id:searchId,result:{content:[{type:'text',text:'STALE'}]}})), 50);
      }
    });
  `);
  f.send(search(12));
  await waitFor(() => f.messages.some(m => m.id === 12));
  assert.equal(f.messages[0].result.isError, true);
  f.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 12 } });
  f.send({ jsonrpc: "2.0", id: 12, method: "tools/list", params: {} });
  await waitFor(() => f.messages.filter(m => m.id === 12).length === 2);
  const result = f.messages.filter(m => m.id === 12)[1].result;
  assert.equal(result.unique, true, "reused client ID must not reuse the timed-out worker ID");
  assert.equal(result.searchCancelled, true, "deadline cancellation must target the original worker request");
  assert.equal(result.unexpectedCancel, false, "unknown cancellation must not be forwarded");
  await sleep(200);
  assert.equal(f.messages.filter(m => m.id === 12).length, 2, "late search result leaked after ID reuse");
});

test("saturated worker stdin rejects a subsequent search without killing the daemon", async t => {
  const f = fixture(t, "setTimeout(() => {}, 3000)");
  const daemon = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore" });
  t.after(() => daemon.kill("SIGKILL"));
  process.kill(f.worker.pid, "SIGSTOP");
  t.after(() => { try { process.kill(f.worker.pid, "SIGCONT"); } catch {} });
  f.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { padding: "x".repeat(1024 * 1024) } });
  const started = Date.now();
  f.send(search(2));
  await waitFor(() => f.messages.some(m => m.id === 2), 750);
  assert.ok(Date.now() - started < 750);
  const response = f.messages.find(m => m.id === 2);
  assert.equal(response.result?.isError, true);
  assert.match(response.result.content[0].text, /Grep|\brg\b/i);
  assert.equal(daemon.exitCode, null);
  assert.equal(daemon.signalCode, null);
  assert.equal(f.worker.exitCode, null);
  assert.equal(f.worker.signalCode, null);
});

test("repeated output while client is blocked closes bridge without unbounded buffering", async t => {
  const worker = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: ["pipe", "pipe", "pipe"] });
  const sentinel = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], { stdio: "ignore" });
  const input = new PassThrough();
  const output = new PassThrough({ highWaterMark: 1 });
  const stopped = superviseBridge({ child: worker, input, output, deadlineMs: 100 });
  t.after(async () => {
    input.end();
    worker.kill("SIGKILL");
    sentinel.kill("SIGKILL");
    await Promise.race([stopped.catch(() => {}), sleep(1000)]);
  });
  input.write(`${JSON.stringify(search(1))}\n${JSON.stringify(search(2))}\n`);
  await waitFor(() => output.destroyed, 1000);
  await Promise.race([stopped, sleep(1000).then(() => { throw new Error("bridge did not stop"); })]);
  assert.ok(output.readableLength < 1024, "output buffered an unbounded response queue");
  assert.notEqual(worker.signalCode, null, "blocked bridge worker was not terminated");
  assert.equal(sentinel.exitCode, null);
  assert.equal(sentinel.signalCode, null);
});

test("client EOF terminates a stopped bridge worker without killing an independent process", { timeout: 5000 }, async t => {
  const worker = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: ["pipe", "pipe", "pipe"] });
  const sentinel = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: "ignore" });
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const stopped = superviseBridge({ child: worker, input, output, deadlineMs: 100 });
  t.after(async () => {
    try { process.kill(worker.pid, "SIGCONT"); } catch {}
    worker.kill("SIGKILL");
    sentinel.kill("SIGKILL");
    await Promise.race([stopped.catch(() => {}), sleep(1000)]);
  });
  process.kill(worker.pid, "SIGSTOP");
  const started = Date.now();
  input.end();
  await Promise.race([stopped, sleep(2200).then(() => { throw new Error("stopped worker survived client EOF"); })]);
  assert.ok(Date.now() - started < 2200);
  assert.equal(worker.signalCode, "SIGKILL");
  assert.equal(sentinel.exitCode, null);
  assert.equal(sentinel.signalCode, null);
});
