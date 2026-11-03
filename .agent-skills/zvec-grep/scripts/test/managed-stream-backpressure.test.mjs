// Disposable subprocess fixtures only; these tests do not exercise a native index.
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

const search = id => ({ jsonrpc:'2.0', id, method:'tools/call', params:{ name:'zvec_grep_search', arguments:{ root:'/tmp', query:'fixture' } } });
async function waitFor(fn, message, ms=4000) {
  const end=Date.now()+ms;
  while (Date.now()<end) { if (fn()) return; await sleep(10); }
  assert.fail(message);
}
function stdio(t, code, deadlineMs=300) {
  const sb=createSandbox();
  const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:sb.workspace,env:sb.env(),stdio:['pipe','pipe','pipe']});
  const input=new PassThrough(), output=new PassThrough({highWaterMark:1024});
  let stderr=''; child.stderr.on('data',d=>stderr+=d);
  const stopped=superviseBridge({child,input,output,deadlineMs});
  t.after(async()=>{input.destroy();output.destroy();child.kill('SIGKILL');await Promise.race([stopped.catch(()=>{}),sleep(1500)]);sb.cleanup();});
  return {input,output,child,stderr:()=>stderr};
}

test('backpressured stdio response preserves bytes and concurrent search deadline', {timeout:10000}, async t=>{
  const f=stdio(t,`import {createInterface} from 'node:readline';
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line); if(m.method==='tools/list') process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{payload:'x'.repeat(2*1024*1024)}})+'\\n');}); setTimeout(()=>{},8000);`);
  f.input.write(JSON.stringify({jsonrpc:'2.0',id:'list',method:'tools/list'})+'\n'+JSON.stringify(search('search'))+'\n');
  await sleep(750); // The response destination deliberately does not drain during the deadline.
  const lines=[]; createInterface({input:f.output}).on('line',line=>lines.push(JSON.parse(line)));
  await waitFor(()=>lines.length===2,`missing responses: ${f.stderr()}`,5000);
  assert.equal(lines.find(m=>m.id==='list')?.result.payload,'x'.repeat(2*1024*1024));
  assert.equal(lines.find(m=>m.id==='search')?.result.isError,true);
});

test('slowly arriving complete stdio request remains valid', {timeout:8000}, async t=>{
  const f=stdio(t,`import {createInterface} from 'node:readline'; createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line); process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n')}); setTimeout(()=>{},6000);`,300);
  const lines=[]; createInterface({input:f.output}).on('line',line=>lines.push(JSON.parse(line)));
  const frame=JSON.stringify(search('slow'))+'\n';
  f.input.write(frame.slice(0,20)); await sleep(700); f.input.write(frame.slice(20));
  await waitFor(()=>lines.length>0,`no slow-frame response: ${f.stderr()}`);
  assert.equal(lines[0].id,'slow'); assert.deepEqual(lines[0].result,{ok:true});
});

test('large search frame and cancellation retain their identities', {timeout:8000}, async t=>{
  const f=stdio(t,`import {createInterface} from 'node:readline';let request;
    createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
      if(m.method==='tools/call') request=m;
      if(m.method==='notifications/cancelled') {
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'fixture/cancel',params:{matched:m.params.requestId===request.id,length:request.params.arguments.query.length}})+'\\n');
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result:{cancelled:true}})+'\\n');
      }
    });setTimeout(()=>{},6000);`,3000);
  const lines=[];createInterface({input:f.output}).on('line',line=>lines.push(JSON.parse(line)));
  const request=search('large-id');request.params.arguments.query='z'.repeat(2*1024*1024);
  f.input.write(JSON.stringify(request)+'\n');
  f.input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'large-id',reason:'stop'}})+'\n');
  await waitFor(()=>lines.some(m=>m.id==='large-id'),`cancel response missing: ${f.stderr()}`,5000);
  assert.deepEqual(lines.find(m=>m.method==='fixture/cancel')?.params,{matched:true,length:2*1024*1024});
  assert.deepEqual(lines.find(m=>m.id==='large-id')?.result,{cancelled:true});
});

test('backpressured Unix SSE streams the full response without truncation', {timeout:12000}, async t=>{
  const sb=createSandbox(), socket=join(sb.root,'stream.sock');
  const code=`import http from 'node:http';
    const {launchUnixSupervisor,attachPrivateChannels}=await import(process.argv[1]);
    const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'text/event-stream','mcp-session-id':'fixture-session'});res.end('data: '+JSON.stringify({jsonrpc:'2.0',id:'sse',result:{payload:'y'.repeat(2*1024*1024)}})+'\\n\\n');});});
    const {child,ready}=launchUnixSupervisor({socketPath:process.argv[2],deadlineMs:3000,instanceToken:'fixture',channels:8}); attachPrivateChannels(server,child); child.stderr.pipe(process.stderr); await ready; console.log('ready'); process.on('SIGTERM',()=>{child.kill('SIGKILL');process.exit(0)});`;
  const peer=sb.spawn(process.execPath,['--input-type=module','-e',code,pathToFileURL(join(DAEMON_DIR,'unix-supervisor.mjs')).href,socket]);
  t.after(async()=>{peer.child.kill('SIGTERM');await Promise.race([peer.closed,sleep(1500)]);peer.child.kill('SIGKILL');sb.cleanup();});
  await waitFor(()=>peer.out.stdout.includes('ready'),`supervisor not ready: ${peer.out.stderr}`,5000);
  const result=await new Promise((resolve,reject)=>{
    const req=http.request({socketPath:socket,path:'/mcp',method:'POST',headers:{'content-type':'application/json',accept:'text/event-stream','mcp-session-id':'fixture-session'}},res=>{
      res.pause(); setTimeout(()=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type'],body:Buffer.concat(chunks).toString()}));res.on('error',reject);res.resume();},500);
    }); req.on('error',reject); req.setTimeout(6000,()=>req.destroy(new Error('request watchdog')));req.end(JSON.stringify({jsonrpc:'2.0',id:'sse',method:'tools/list'}));
  });
  assert.equal(result.status,200); assert.match(result.type,/text\/event-stream/);
  assert.match(result.body,/^data: /); assert.ok(result.body.endsWith('\n\n'));
  const message=JSON.parse(result.body.slice(6,-2)); assert.equal(message.id,'sse'); assert.equal(message.result.payload,'y'.repeat(2*1024*1024));
  assert.deepEqual(sb.egressEvents(),[]);
});

test('a stalled response serializer cannot postpone another search deadline', {timeout:6000}, async t=>{
  const sb=createSandbox();
  const script=`import {spawn} from 'node:child_process';
    const {superviseBridge}=await import(process.argv[1]);
    const child=spawn(process.execPath,['--input-type=module','-e',process.argv[2]],{stdio:['pipe','pipe','inherit'],env:{...process.env,NODE_OPTIONS:''}});
    superviseBridge({child,deadlineMs:300}).catch(()=>process.exit(1)); console.log('ready');`;
  const childCode=`import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.method==='tools/list')setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{stallSerializer:true}})+'\\n'),30)});setTimeout(()=>{},5000);`;
  const preload=`const original=JSON.stringify;JSON.stringify=function(value,...rest){if(value?.result?.stallSerializer){process.stderr.write('SERIALIZER_STALLED\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200)}return original.call(this,value,...rest)};`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,pathToFileURL(join(DAEMON_DIR,'stdio-supervisor.mjs')).href,childCode],{cwd:sb.workspace,env:sb.env({NODE_OPTIONS:`--import=data:text/javascript,${encodeURIComponent(preload)}`}),stdio:['pipe','pipe','pipe']});
  const peer={child,out:{stdout:'',stderr:''},closed:new Promise(resolve=>child.once('close',resolve))};
  child.stdout.on('data',chunk=>peer.out.stdout+=chunk); child.stderr.on('data',chunk=>peer.out.stderr+=chunk);
  t.after(async()=>{peer.child.kill('SIGTERM');await Promise.race([peer.closed,sleep(1500)]);peer.child.kill('SIGKILL');sb.cleanup();});
  await waitFor(()=>peer.out.stdout.includes('ready'),`fixture not ready: ${peer.out.stderr}`);
  const start=performance.now();
  peer.child.stdin.write(JSON.stringify(search('deadline'))+'\n'+JSON.stringify({jsonrpc:'2.0',id:'list',method:'tools/list'})+'\n');
  await waitFor(()=>peer.out.stdout.includes('"id":"deadline"'),`no deadline response: ${peer.out.stderr}`,3000);
  assert.match(peer.out.stderr,/SERIALIZER_STALLED/,'serializer fault injection was not reached');
  assert.ok(performance.now()-start<800,'serializer blocked the independent search deadline');
  const response=peer.out.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(m=>m.id==='deadline');
  assert.equal(response?.result?.isError,true);
});

test('a stalled response parser cannot postpone another search deadline', {timeout:6000}, async t=>{
  const sb=createSandbox();
  const script=`import {spawn} from 'node:child_process';
    const {superviseBridge}=await import(process.argv[1]);
    const child=spawn(process.execPath,['--input-type=module','-e',process.argv[2]],{stdio:['pipe','pipe','inherit'],env:{...process.env,NODE_OPTIONS:''}});
    superviseBridge({child,deadlineMs:300}).catch(()=>process.exit(1)); console.log('ready');`;
  const childCode=`import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.method==='tools/list')setTimeout(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{stallParser:true}})+'\\n'),30)});setTimeout(()=>{},5000);`;
  const preload=`const original=JSON.parse;JSON.parse=function(value,...rest){if(typeof value==='string' && value.includes('"stallParser":true')){process.stderr.write('PARSER_STALLED\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200)}return original.call(this,value,...rest)};`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,pathToFileURL(join(DAEMON_DIR,'stdio-supervisor.mjs')).href,childCode],{cwd:sb.workspace,env:sb.env({NODE_OPTIONS:`--import=data:text/javascript,${encodeURIComponent(preload)}`}),stdio:['pipe','pipe','pipe']});
  const peer={child,out:{stdout:'',stderr:''},closed:new Promise(resolve=>child.once('close',resolve))};
  child.stdout.on('data',chunk=>peer.out.stdout+=chunk); child.stderr.on('data',chunk=>peer.out.stderr+=chunk);
  t.after(async()=>{peer.child.kill('SIGTERM');await Promise.race([peer.closed,sleep(1500)]);peer.child.kill('SIGKILL');sb.cleanup();});
  await waitFor(()=>peer.out.stdout.includes('ready'),`fixture not ready: ${peer.out.stderr}`);
  const start=performance.now();
  peer.child.stdin.write(JSON.stringify(search('parser-deadline'))+'\n'+JSON.stringify({jsonrpc:'2.0',id:'list',method:'tools/list'})+'\n');
  await waitFor(()=>peer.out.stdout.includes('"id":"parser-deadline"'),`no deadline response: ${peer.out.stderr}`,3000);
  assert.match(peer.out.stderr,/PARSER_STALLED/,'parser fault injection was not reached');
  assert.ok(performance.now()-start<800,'parser blocked the independent search deadline');
  const response=peer.out.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)).find(m=>m.id==='parser-deadline');
  assert.equal(response?.result?.isError,true);
});

test('stdio EOF allows a slow pending non-search response to finish', {timeout:6000}, async t=>{
  const f=stdio(t,`import {createInterface} from 'node:readline';createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);setTimeout(()=>{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{ok:true}})+'\\n');process.exit(0)},1400)});`,300);
  const lines=[];createInterface({input:f.output}).on('line',line=>lines.push(JSON.parse(line)));
  f.input.end(JSON.stringify({jsonrpc:'2.0',id:'slow-eof',method:'tools/list'})+'\n');
  await waitFor(()=>lines.length>0,`slow response lost: ${f.stderr()}`,3500);
  assert.equal(lines[0].id,'slow-eof');assert.deepEqual(lines[0].result,{ok:true});
});
