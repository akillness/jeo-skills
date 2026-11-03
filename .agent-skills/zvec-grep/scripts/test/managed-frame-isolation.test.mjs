// Disposable mock bridge workers only; no native index, no network, no daemon state.
// Contract under test: the deadline-owning supervisor never parses or serialises
// frame contents itself. A stalled per-request worker may delay that request's
// own frames, but never another request's deadline, progress, cancel or response;
// client ids are restored from the captured raw bytes; started frames always
// finish (EOF drains), and every emitted line is one intact JSON frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { superviseBridge } from '../managed-daemon/stdio-supervisor.mjs';
import { createSandbox, DAEMON_DIR, sleep } from './harness.mjs';

const SUPERVISOR_URL = pathToFileURL(join(DAEMON_DIR, 'stdio-supervisor.mjs')).href;
const search = (id, extra = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'zvec_grep_search', arguments: { root: '/tmp', query: 'fixture' }, ...extra } });
const GUIDANCE = /Grep|\brg\b/i;

async function waitFor(fn, message, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(10); }
  assert.fail(typeof message === 'function' ? message() : message);
}

/** Mock bridge child: replies to every request with `reply(m)` unless the request is a search it should hold. */
const ECHO_CHILD = `import {createInterface} from 'node:readline';
  const held=new Map();
  createInterface({input:process.stdin}).on('line',line=>{
    const m=JSON.parse(line);
    if(m.method==='notifications/cancelled'){const req=held.get(m.params.requestId); if(req){held.delete(m.params.requestId); process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'fixture/cancel',params:{matched:true,reason:m.params.reason}})+'\\n'); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{cancelled:true}})+'\\n');} return;}
    if(!Object.hasOwn(m,'id')) return;
    const hold=m.params?.arguments?.hold===true;
    if(hold){held.set(m.id,m); if(m.params._meta?.progressToken!==undefined) process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:m.params._meta.progressToken,progress:1,total:2}})+'\\n'); return;}
    const size=m.params?.size??0;
    const query=m.params?.arguments?.query;
    // 'stall-marker' asks the child to synthesise a response-only fault marker: the request bytes never carry it.
    const echo=query==='stall-marker'?{stallParser:true}:(query??m.method);
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{echo,payload:'p'.repeat(size)}})+'\\n');
  });
  setTimeout(()=>{},8000);`;

/** In-process supervisor over PassThrough streams; `raw` keeps the exact output bytes. */
function inProcess(t, code = ECHO_CHILD, { deadlineMs = 300, highWaterMark } = {}) {
  const sb = createSandbox();
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: sb.workspace, env: sb.env(), stdio: ['pipe', 'pipe', 'pipe'] });
  const input = new PassThrough();
  const output = new PassThrough(highWaterMark === undefined ? {} : { highWaterMark });
  const lines = [];
  let raw = '';
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const attach = () => { createInterface({ input: output }).on('line', line => { raw += `${line}\n`; lines.push(JSON.parse(line)); }); };
  if (highWaterMark === undefined) attach();
  const stopped = superviseBridge({ child, input, output, deadlineMs });
  t.after(async () => { input.destroy(); output.destroy(); child.kill('SIGKILL'); await Promise.race([stopped.catch(() => {}), sleep(1500)]); sb.cleanup(); });
  const send = m => input.write(`${JSON.stringify(m)}\n`);
  return { input, output, child, lines, send, stopped, attach, raw: () => raw, stderr: () => stderr, sb };
}

/**
 * Out-of-process supervisor whose JSON.parse / JSON.stringify are patched by a
 * NODE_OPTIONS preload so that any frame carrying a stall marker blocks the
 * thread that touches it for `stallMs`. The mock child clears NODE_OPTIONS so
 * only the supervisor process (main thread + its workers) is instrumented.
 */
function stalling(t, { stallMs = 1200, deadlineMs = 300, childCode = ECHO_CHILD } = {}) {
  const sb = createSandbox();
  const script = `import {spawn} from 'node:child_process';
    const {superviseBridge}=await import(process.argv[1]);
    const child=spawn(process.execPath,['--input-type=module','-e',process.argv[2]],{stdio:['pipe','pipe','inherit'],env:{...process.env,NODE_OPTIONS:''}});
    superviseBridge({child,deadlineMs:${deadlineMs}}).then(r=>{process.stderr.write('STOPPED '+JSON.stringify(r)+'\\n');}).catch(()=>process.exit(1)); console.log('ready');`;
  const preload = `const stall=(label)=>{process.stderr.write(label+'\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${stallMs});};
    const parse=JSON.parse, stringify=JSON.stringify;
    JSON.parse=function(value,...rest){if(typeof value==='string'&&value.includes('"stallParser":true'))stall('PARSER_STALLED');return parse.call(this,value,...rest)};
    JSON.stringify=function(value,...rest){const text=stringify.call(this,value,...rest);if(typeof text==='string'&&text.includes('"stallSerializer":true'))stall('SERIALIZER_STALLED');return text};`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, SUPERVISOR_URL, childCode], {
    cwd: sb.workspace, env: sb.env({ NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}` }), stdio: ['pipe', 'pipe', 'pipe'],
  });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', c => { out.stdout += c; });
  child.stderr.on('data', c => { out.stderr += c; });
  const closed = new Promise(resolve => child.once('close', resolve));
  t.after(async () => { child.kill('SIGTERM'); await Promise.race([closed, sleep(1500)]); child.kill('SIGKILL'); sb.cleanup(); });
  const frames = () => out.stdout.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
  const send = m => child.stdin.write(`${JSON.stringify(m)}\n`);
  const count = label => out.stderr.split('\n').filter(l => l === label).length;
  return { child, out, closed, frames, send, count };
}

test('a stalled worker parser on one response does not delay another request\'s progress, cancel or response', { timeout: 8000 }, async t => {
  const f = stalling(t, { deadlineMs: 3000 });
  await waitFor(() => f.out.stdout.includes('ready'), () => `fixture not ready: ${f.out.stderr}`);
  // The marker exists only in the child's response, so the stall hits the egress worker owning stall-echo and nothing on ingress.
  f.send({ jsonrpc: '2.0', id: 'stall-echo', method: 'tools/call', params: { name: 'other', arguments: { query: 'stall-marker' } } });
  await waitFor(() => f.count('PARSER_STALLED') >= 1, () => `parser fault not reached: ${f.out.stderr}`, 2000);
  const start = performance.now();
  f.send(search('live', { arguments: { root: '/tmp', query: 'fixture', hold: true }, _meta: { progressToken: 'client-token' } }));
  await waitFor(() => f.frames().some(m => m.method === 'notifications/progress' && m.params.progressToken === 'client-token'), () => `progress blocked: ${f.out.stderr}`, 900);
  f.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'live', reason: 'client stop' } });
  await waitFor(() => f.frames().some(m => m.id === 'live'), () => `cancel response blocked: ${f.out.stderr}`, 900);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `independent request waited ${elapsed.toFixed(0)}ms behind a stalled worker`);
  assert.deepEqual(f.frames().find(m => m.id === 'live').result, { cancelled: true });
  assert.deepEqual(f.frames().find(m => m.method === 'fixture/cancel').params, { matched: true, reason: 'client stop' });
  assert.equal(f.frames().some(m => m.id === 'stall-echo'), false, 'stalled response escaped before its worker finished');
  await waitFor(() => f.frames().some(m => m.id === 'stall-echo'), () => `stalled response lost: ${f.out.stderr}`, 2500);
  assert.deepEqual(f.frames().find(m => m.id === 'stall-echo').result.echo, { stallParser: true });
  assert.equal(f.frames().filter(m => m.id === 'stall-echo').length, 1);
});

test('three concurrent searches: one stalled serializer, the others still fail on their own deadlines', { timeout: 8000 }, async t => {
  const childCode = `import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
      if(m.method!=='tools/call') return;
      if(m.params.arguments.query==='stall') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{stallSerializer:true,content:[{type:'text',text:'late'}]}})+'\\n');
    }); setTimeout(()=>{},8000);`;
  const f = stalling(t, { deadlineMs: 300, stallMs: 1500, childCode });
  await waitFor(() => f.out.stdout.includes('ready'), () => `fixture not ready: ${f.out.stderr}`);
  const start = performance.now();
  f.send(search('s-stall', { arguments: { root: '/tmp', query: 'stall' } }));
  f.send(search('s-a'));
  f.send(search('s-b'));
  await waitFor(() => f.count('SERIALIZER_STALLED') >= 1, () => `serializer fault not reached: ${f.out.stderr}`, 1000);
  await waitFor(() => ['s-a', 's-b', 's-stall'].every(id => f.frames().some(m => m.id === id)), () => `deadline frames missing: ${f.out.stderr}\n${f.out.stdout}`, 1200);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1200, `deadlines waited ${elapsed.toFixed(0)}ms behind a stalled serializer`);
  for (const id of ['s-a', 's-b', 's-stall']) {
    const frame = f.frames().find(m => m.id === id);
    assert.equal(frame.result?.isError, true, id);
    assert.match(frame.result.content[0].text, GUIDANCE, id);
  }
  await sleep(1700);
  assert.equal(f.frames().filter(m => m.id === 's-stall').length, 1, 'late stalled result escaped after the timeout');
  assert.equal(f.frames().some(m => m.result?.content?.[0]?.text === 'late'), false);
});

test('an ingress parser stall delays forwarding but not the independent search deadline', { timeout: 8000 }, async t => {
  const f = stalling(t, { deadlineMs: 300, stallMs: 1500 });
  await waitFor(() => f.out.stdout.includes('ready'), () => `fixture not ready: ${f.out.stderr}`);
  const start = performance.now();
  f.send({ jsonrpc: '2.0', id: 'in-stall', method: 'tools/call', params: { name: 'other', arguments: { query: 'x', stallParser: true } } });
  f.send(search('in-deadline'));
  await waitFor(() => f.count('PARSER_STALLED') >= 1, () => `ingress fault not reached: ${f.out.stderr}`, 1000);
  await waitFor(() => f.frames().some(m => m.id === 'in-deadline'), () => `deadline postponed by ingress stall: ${f.out.stderr}`, 800);
  assert.ok(performance.now() - start < 1000);
  assert.equal(f.frames().find(m => m.id === 'in-deadline').result?.isError, true);
  await waitFor(() => f.frames().some(m => m.id === 'in-stall'), () => `stalled request never completed: ${f.out.stderr}`, 2500);
  assert.equal(f.frames().find(m => m.id === 'in-stall').result.echo, 'x');
  assert.equal(f.frames().filter(m => m.id === 'in-deadline').length, 1);
});

const RAW_IDS = ['12345678901234567890', '1.0', '1e2', '-0', '"x\\u0041\\"y"', '""', '"한\\ud83d\\ude00"', '7'];
function rawRequest(rawId, method, params) {
  return `{"jsonrpc":"2.0","id":${rawId},"method":${JSON.stringify(method)}${params === undefined ? '' : `,"params":${JSON.stringify(params)}`}}\n`;
}
function linesWithRawId(raw, rawId) {
  return raw.split('\n').filter(line => line.includes(`"id":${rawId},`) || line.includes(`"id":${rawId}}`));
}

test('normal responses restore every client id byte-exact from the original request', { timeout: 8000 }, async t => {
  const f = inProcess(t, ECHO_CHILD, { deadlineMs: 2000 });
  for (const rawId of RAW_IDS) f.input.write(rawRequest(rawId, 'tools/call', { name: 'other', arguments: { query: `q${rawId.length}` } }));
  await waitFor(() => f.lines.length === RAW_IDS.length, () => `responses missing (${f.lines.length}/${RAW_IDS.length}): ${f.stderr()}`);
  for (const rawId of RAW_IDS) {
    const matches = linesWithRawId(f.raw(), rawId);
    assert.equal(matches.length, 1, `raw id ${rawId} not restored byte-exact in: ${f.raw()}`);
    assert.equal(JSON.parse(matches[0]).result.echo, `q${rawId.length}`);
  }
  assert.equal(f.raw().includes('managed-supervisor-'), false, 'internal id leaked to the client');
});

test('timeout and bridge-stop responses carry the original id bytes without parsing the frame', { timeout: 8000 }, async t => {
  const f = inProcess(t, ECHO_CHILD, { deadlineMs: 250 });
  const timeoutIds = RAW_IDS.slice(0, 4);
  const stopIds = RAW_IDS.slice(4);
  for (const rawId of timeoutIds) f.input.write(rawRequest(rawId, 'tools/call', { name: 'zvec_grep_search', arguments: { root: '/tmp', query: 'fixture', hold: true } }));
  await waitFor(() => f.lines.filter(m => Object.hasOwn(m, 'id')).length === timeoutIds.length, () => `timeouts missing: ${f.stderr()}`, 4000);
  for (const rawId of timeoutIds) {
    const matches = linesWithRawId(f.raw(), rawId);
    assert.equal(matches.length, 1, `timeout for ${rawId} not byte-exact: ${f.raw()}`);
    const frame = JSON.parse(matches[0]);
    assert.equal(frame.result.isError, true);
    assert.match(frame.result.content[0].text, GUIDANCE);
  }
  await waitFor(() => f.lines.filter(m => m.method === 'fixture/cancel').length === timeoutIds.length, () => `fixture/cancel missing: ${f.stderr()}`, 4000);
  await sleep(100);
  assert.equal(f.lines.some(m => m.result?.cancelled === true), false, 'late cancelled response must not leak');
  const notifies = f.lines.filter(m => !Object.hasOwn(m, 'id'));
  assert.equal(notifies.length, timeoutIds.length, `unexpected notifications count: ${JSON.stringify(notifies)}`);
  for (const rawId of stopIds) f.input.write(rawRequest(rawId, 'tools/call', { name: 'zvec_grep_search', arguments: { root: '/tmp', query: 'fixture', hold: true } }));
  await sleep(100);
  f.child.kill('SIGKILL');
  await Promise.race([f.stopped, sleep(2000).then(() => assert.fail('bridge did not stop'))]);
  await waitFor(() => f.lines.filter(m => Object.hasOwn(m, 'id')).length === RAW_IDS.length, () => `stop responses missing: ${f.raw()}`, 1000);
  for (const rawId of stopIds) {
    const matches = linesWithRawId(f.raw(), rawId);
    assert.equal(matches.length, 1, `stop response for ${rawId} not byte-exact: ${f.raw()}`);
    const frame = JSON.parse(matches[0]);
    assert.equal(frame.result.isError, true);
    assert.match(frame.result.content[0].text, GUIDANCE);
  }
});

test('large request cancel and progress round-trip with the original identities', { timeout: 10000 }, async t => {
  const f = inProcess(t, ECHO_CHILD, { deadlineMs: 4000 });
  const query = 'z'.repeat(2 * 1024 * 1024);
  f.send(search('large-id', { arguments: { root: '/tmp', query, hold: true }, _meta: { progressToken: 'client-token' } }));
  await waitFor(() => f.lines.some(m => m.method === 'notifications/progress'), () => `progress missing: ${f.stderr()}`, 6000);
  assert.deepEqual(f.lines.find(m => m.method === 'notifications/progress').params, { progressToken: 'client-token', progress: 1, total: 2 });
  f.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'large-id', reason: 'stop' } });
  await waitFor(() => f.lines.some(m => m.id === 'large-id'), () => `cancel response missing: ${f.stderr()}`, 4000);
  assert.deepEqual(f.lines.find(m => m.id === 'large-id').result, { cancelled: true });
  assert.deepEqual(f.lines.find(m => m.method === 'fixture/cancel').params, { matched: true, reason: 'stop' });
  assert.equal(f.lines.filter(m => m.id === 'large-id').length, 1);
  assert.equal(f.raw().includes('managed-supervisor-'), false);
});

test('client EOF drains a multi-megabyte request already in flight and relays its response', { timeout: 10000 }, async t => {
  const f = inProcess(t, ECHO_CHILD, { deadlineMs: 300 });
  const query = 'e'.repeat(2 * 1024 * 1024);
  const frame = Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id: 'eof-large', method: 'tools/call', params: { name: 'other', arguments: { query } } })}\n`);
  f.input.write(frame.subarray(0, frame.length - 1024));
  f.input.end(frame.subarray(frame.length - 1024));
  await waitFor(() => f.lines.some(m => m.id === 'eof-large'), () => `drained request lost after EOF: ${f.stderr()}`, 6000);
  assert.equal(f.lines.find(m => m.id === 'eof-large').result.echo, query);
  assert.equal(f.lines.filter(m => m.id === 'eof-large').length, 1);
});

test('child exit after a multi-megabyte response drains the response before the bridge stops', { timeout: 10000 }, async t => {
  const code = `import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).once('line',line=>{const m=JSON.parse(line);
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{payload:'d'.repeat(2*1024*1024)}})+'\\n',()=>process.exit(0));});`;
  const f = inProcess(t, code, { deadlineMs: 300 });
  f.send({ jsonrpc: '2.0', id: 'exit-large', method: 'tools/list' });
  const result = await Promise.race([f.stopped, sleep(6000).then(() => assert.fail('bridge did not stop'))]);
  assert.equal(result.code, 0);
  await waitFor(() => f.lines.some(m => m.id === 'exit-large'), () => `response lost at child exit: ${f.stderr()}`, 2000);
  const frames = f.lines.filter(m => m.id === 'exit-large');
  assert.equal(frames.length, 1, `duplicate or missing frames: ${JSON.stringify(frames.map(m => m.error ?? 'result'))}`);
  assert.equal(frames[0].result.payload, 'd'.repeat(2 * 1024 * 1024));
  assert.equal(frames[0].error, undefined);
});

test('ingress order is preserved across large and small requests', { timeout: 10000 }, async t => {
  const code = `import {createInterface} from 'node:readline';
    const order=[];
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line); order.push(m.id);
      if(m.method==='fixture/flush') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{order}})+'\\n');});
    setTimeout(()=>{},8000);`;
  const f = inProcess(t, code, { deadlineMs: 4000 });
  const big = 'o'.repeat(1024 * 1024);
  for (let i = 0; i < 12; i++) {
    f.send({ jsonrpc: '2.0', id: `r${i}`, method: 'tools/call', params: { name: 'other', arguments: { query: i % 3 === 0 ? big : 'small' } } });
  }
  f.send({ jsonrpc: '2.0', id: 'flush', method: 'fixture/flush' });
  await waitFor(() => f.lines.some(m => m.id === 'flush'), () => `flush missing: ${f.stderr()}`, 8000);
  assert.deepEqual(f.lines.find(m => m.id === 'flush').result.order.length, 13);
  const mapped = f.lines.find(m => m.id === 'flush').result.order;
  assert.ok(mapped.every(id => typeof id === 'string' && id.startsWith('managed-supervisor-')), 'child saw unmapped ids');
  const sequence = mapped.map(id => Number(id.slice(id.lastIndexOf('-') + 1)));
  assert.deepEqual(sequence, [...sequence].sort((a, b) => a - b), `child received requests out of arrival order: ${sequence}`);
});

test('per-request egress order keeps progress before the final result for large frames', { timeout: 10000 }, async t => {
  const code = `import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line); if(m.method!=='tools/call') return;
      const token=m.params._meta.progressToken;
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:token,progress:1,total:3,note:'g'.repeat(1024*1024)}})+'\\n');
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:token,progress:2,total:3}})+'\\n');
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'done'}]}})+'\\n');});
    setTimeout(()=>{},8000);`;
  const f = inProcess(t, code, { deadlineMs: 4000 });
  f.send(search('ordered', { _meta: { progressToken: 42 } }));
  await waitFor(() => f.lines.some(m => m.id === 'ordered'), () => `final result missing: ${f.stderr()}`, 6000);
  const events = f.lines.map(m => m.method === 'notifications/progress' ? `progress:${m.params.progress}` : `result:${m.id}`);
  assert.deepEqual(events, ['progress:1', 'progress:2', 'result:ordered']);
  assert.ok(f.lines.filter(m => m.method === 'notifications/progress').every(m => m.params.progressToken === 42));
  assert.equal(f.lines[0].params.note.length, 1024 * 1024);
});

test('every output line is one intact frame under backpressure with concurrent large responses and a timeout', { timeout: 12000 }, async t => {
  // Three independent large non-search responses plus one search that must time out while the client is not draining.
  const f = inProcess(t, `import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
      if(m.method==='tools/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{payload:m.params.fill.repeat(1024*1024)}})+'\\n');});
    setTimeout(()=>{},8000);`, { deadlineMs: 300, highWaterMark: 512 });
  for (const fill of ['a', 'b', 'c']) f.send({ jsonrpc: '2.0', id: `big-${fill}`, method: 'tools/list', params: { fill } });
  f.send(search('deadline'));
  await sleep(900); // nothing drains during the deadline window
  f.attach();
  await waitFor(() => f.lines.length === 4, () => `frames missing (${f.lines.length}): ${f.stderr()}`, 8000);
  for (const fill of ['a', 'b', 'c']) assert.equal(f.lines.find(m => m.id === `big-${fill}`)?.result.payload, fill.repeat(1024 * 1024));
  const timeout = f.lines.find(m => m.id === 'deadline');
  assert.equal(timeout?.result?.isError, true);
  assert.match(timeout.result.content[0].text, GUIDANCE);
  const rawLines = f.raw().split('\n').filter(Boolean);
  assert.equal(rawLines.length, 4);
  for (const line of rawLines) assert.doesNotThrow(() => JSON.parse(line), 'interleaved frame bytes');
});
