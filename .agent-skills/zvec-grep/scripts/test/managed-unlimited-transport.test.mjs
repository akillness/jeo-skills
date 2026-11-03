// Disposable mock bridge workers exercise framing, not a native index.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import http from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PassThrough } from 'node:stream';
import { superviseBridge } from '../managed-daemon/stdio-supervisor.mjs';
import { createSandbox, DAEMON_DIR, sleep } from './harness.mjs';

const large = '가'.repeat(600_000);
const search = (id, query = 'fixture') => ({jsonrpc:'2.0', id, method:'tools/call', params:{name:'zvec_grep_search', arguments:{root:'/tmp', query}}});

function fixture(t, source, deadlineMs = 500) {
  const sandbox = createSandbox();
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {stdio:['pipe','pipe','pipe'], cwd:sandbox.workspace, env:sandbox.env()});
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  createInterface({input:output}).on('line', line => messages.push(JSON.parse(line)));
  const stopped = superviseBridge({child, input, output, deadlineMs});
  t.after(async () => { input.destroy(); child.kill('SIGKILL'); await Promise.race([stopped.catch(() => {}), sleep(1500)]); sandbox.cleanup(); });
  return {child, input, output, messages, stopped, stderr:() => stderr};
}
async function waitFor(predicate, message, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (predicate()) return; await sleep(10); }
  assert.fail(message);
}

test('stdio accepts fragmented complete multi-megabyte requests and responses without truncation', {timeout:10000}, async t => {
  const f = fixture(t, `
    import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line', line => {
      const m = JSON.parse(line);
      if (!Object.hasOwn(m, 'id')) return;
      const frame = Buffer.from(JSON.stringify({jsonrpc:'2.0', id:m.id, result:{echo:m.params.arguments.query}})+'\\n');
      for (let i=0; i<frame.length; i+=7919) process.stdout.write(frame.subarray(i,i+7919));
    });
  `, 3000);
  const frame = Buffer.from(JSON.stringify(search('large-id', large)) + '\n');
  assert.ok(frame.length > 1024 * 1024);
  for (let i=0; i<frame.length; i+=8191) f.input.write(frame.subarray(i,i+8191));
  await waitFor(() => f.messages.some(m => m.id === 'large-id'), f.stderr(), 7000);
  assert.equal(f.messages.find(m => m.id === 'large-id').result.echo, large);
});

test('stdio keeps a concurrent search deadline independent of a large complete response', {timeout:7000}, async t => {
  const f = fixture(t, `
    import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line', line => {
      const m=JSON.parse(line);
      if (m.method === 'tools/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0', id:m.id, result:{payload:'z'.repeat(2*1024*1024)}})+'\\n');
    });
    setTimeout(()=>{}, 5000);
  `, 300);
  const start = performance.now();
  f.input.write(JSON.stringify({jsonrpc:'2.0',id:'list',method:'tools/list'}) + '\n' + JSON.stringify(search('search')) + '\n');
  await waitFor(() => f.messages.some(m => m.id === 'list') && f.messages.some(m => m.id === 'search'), 'concurrent replies did not arrive', 2500);
  assert.equal(f.messages.find(m => m.id === 'list').result.payload, 'z'.repeat(2*1024*1024));
  assert.equal(f.messages.find(m => m.id === 'search').result?.isError, true);
  assert.ok(performance.now() - start < 2500);
});

test('slow partial worker frame survives while an independent search times out', {timeout:7000}, async t => {
  const f = fixture(t, `
    import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line', line => {
      const m=JSON.parse(line);
      if (m.method === 'tools/call') {
        process.stdout.write('{"jsonrpc":"2.0","method":"test/slow","params":');
        setTimeout(()=>process.stdout.write('{"ok":true}}\\n'), 900);
      }
    });
    setTimeout(()=>{}, 5000);
  `, 250);
  const start = performance.now();
  f.input.write(JSON.stringify(search(42)) + '\n');
  await waitFor(() => f.messages.some(m => m.id === 42), 'search did not fail on time', 2000);
  const response = f.messages.find(m => m.id === 42);
  assert.equal(response.result?.isError, true);
  assert.match(response.result.content[0].text, /Grep|\brg\b/i);
  assert.ok(performance.now() - start < 2000);
  await waitFor(() => f.messages.some(m => m.method === 'test/slow'), 'slow frame was lost', 2500);
  assert.deepEqual(f.messages.find(m => m.method === 'test/slow').params, {ok:true});
  assert.equal(f.child.exitCode, null);
  assert.equal(f.child.signalCode, null);
});

test('stdio interrupted input never forwards a partial request', {timeout:5000}, async t => {
  const f = fixture(t, `
    process.stdin.on('data', chunk => process.stdout.write(JSON.stringify({jsonrpc:'2.0', method:'test/received', params:{bytes:chunk.length}})+'\\n'));
    process.stdin.on('end', ()=>process.exit(0));
  `);
  f.input.end('{"jsonrpc":"2.0","id":13,"method":"tools/call"');
  await Promise.race([f.stopped, sleep(3000).then(() => { throw new Error('incomplete input did not close'); })]);
  assert.equal(f.messages.some(m => m.method === 'test/received'), false);
  assert.equal(f.messages.some(m => m.id === 13 && m.result && !m.result.isError), false);
});

async function unixFixture(t, deadlineMs = 500) {
  const sandbox = createSandbox();
  const socket = join(sandbox.root, 'ingress.sock');
  const script = `
    import http from 'node:http';
    const {launchUnixSupervisor, attachPrivateChannels} = await import(process.argv[1]);
    const server=http.createServer((req,res)=>{
      let chunks=[]; req.on('data', c=>chunks.push(c)); req.on('end',()=>{
        const msg=JSON.parse(Buffer.concat(chunks).toString());
        if (msg.params?.arguments?.query === 'hang') return;
        res.writeHead(200, {'content-type':'application/json', 'mcp-session-id':'fixture-session'});
        res.end(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:{echo:msg.params?.arguments?.query}}));
      });
    });
    const {child,ready}=launchUnixSupervisor({socketPath:process.argv[2],deadlineMs:Number(process.argv[3]),instanceToken:'fixture',channels:8});
    attachPrivateChannels(server,child); child.stderr.pipe(process.stderr);
    await ready; console.log('ready');
    process.on('SIGTERM',()=>{child.kill('SIGKILL');process.exit(0)});
  `;
  const peer = sandbox.spawn(process.execPath, ['--input-type=module','-e',script,pathToFileURL(join(DAEMON_DIR,'unix-supervisor.mjs')).href,socket,String(deadlineMs)]);
  t.after(async () => { peer.child.kill('SIGTERM'); await Promise.race([peer.closed,sleep(1500)]); peer.child.kill('SIGKILL'); sandbox.cleanup(); });
  await waitFor(() => peer.out.stdout.includes('ready'), 'Unix supervisor failed to start', 5000);
  return {sandbox,socket,peer};
}
function unixCall(socket, message) {
  return new Promise((resolve,reject)=>{
    const req=http.request({socketPath:socket,path:'/mcp',method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-session-id':'fixture-session'}},res=>{
      const chunks=[]; res.on('data', c=>chunks.push(c)); res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()})); res.on('error',reject);
    });
    req.on('socket', socket => socket.on('error', () => {}));
    req.on('error',reject); req.setTimeout(3000,()=>req.destroy(new Error('request watchdog')));
    const data=Buffer.from(JSON.stringify(message));
    for (let i=0;i<data.length;i+=8191) req.write(data.subarray(i,i+8191));
    req.end();
  });
}
test('Unix ingress preserves fragmented requests below the 1 MiB limit and rejects larger requests', {timeout:10000}, async t=>{
  const f=await unixFixture(t, 2000);
  const below='가'.repeat(300_000);
  const response=await unixCall(f.socket,search('large-unix',below));
  assert.equal(response.status,200,response.body.slice(0,500));
  const parsed=JSON.parse(response.body);
  assert.equal(parsed.id,'large-unix');
  assert.equal(parsed.result.echo,below);
  const rejected=await unixCall(f.socket,search('too-large',large));
  assert.equal(rejected.status,413,rejected.body);
  assert.deepEqual(f.sandbox.egressEvents(),[]);
});

test('Unix incomplete request cannot delay a separate complete search timeout', {timeout:8000}, async t=>{
  const f=await unixFixture(t);
  const partial=http.request({socketPath:f.socket,path:'/mcp',method:'POST',headers:{'content-type':'application/json','content-length':9999999}});
  partial.on('error',()=>{}); partial.write('{"jsonrpc":"2.0"');
  t.after(()=>partial.destroy());
  const start=performance.now();
  const response=await unixCall(f.socket,search('bounded','hang'));
  assert.ok(performance.now()-start<2500);
  const parsed=JSON.parse(response.body);
  assert.equal(parsed.id,'bounded');
  assert.equal(parsed.result?.isError,true);
  assert.match(parsed.result.content[0].text,/Grep|\brg\b/i);
  assert.deepEqual(f.sandbox.egressEvents(),[]);
});
