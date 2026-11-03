// Exercises the installed MCP SDK's stateful HTTP transport, not a simulated MCP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { realpathSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSandbox, DAEMON_DIR, realZg, sleep } from './harness.mjs';

const fixtureScript = `
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const [supervisorUrl, serverUrl, nodeUrl, zodUrl, socket, events] = process.argv.slice(1);
const { launchUnixSupervisor, attachPrivateChannels } = await import(supervisorUrl);
const { McpServer } = await import(serverUrl);
const { NodeStreamableHTTPServerTransport } = await import(nodeUrl);
const { z } = await import(zodUrl);
const log = x => appendFileSync(events, JSON.stringify(x) + '\\n');
const mcp = new McpServer({name:'sdk-fixture',version:'1'});
mcp.registerTool('zvec_grep_search', {inputSchema: z.object({query:z.string()})}, async ({query}, ctx) => {
  log({event:'start',query,session:ctx.sessionId,id:ctx.mcpReq.id});
  ctx.mcpReq.signal.addEventListener('abort', () => log({event:'abort',query}), {once:true});
  if (query !== 'fast') {
    await ctx.mcpReq.notify({method:'notifications/progress',params:{progressToken:ctx.mcpReq._meta.progressToken,progress:1,total:2}});
    await new Promise(resolve => setTimeout(resolve, 850));
  }
  log({event:'finish',query});
  return {content:[{type:'text',text:query === 'fast' ? 'FRESH' : 'LATE'}]};
});
const transport = new NodeStreamableHTTPServerTransport({sessionIdGenerator:()=> 'sdk-session'});
await mcp.connect(transport);
const server = http.createServer((req,res) => { transport.handleRequest(req,res).catch(error => { log({event:'error',message:error.message}); if (!res.headersSent) res.writeHead(500); res.end(); }); });
const {child,ready} = launchUnixSupervisor({socketPath:socket,deadlineMs:400,instanceToken:'sdk',channels:16});
attachPrivateChannels(server,child);
child.stderr.pipe(process.stderr);
await ready; console.log('ready');
process.on('SIGTERM', () => { child.kill('SIGKILL'); process.exit(0); });
`;

function call(socket, method, message, session) {
  return new Promise((resolve, reject) => {
    const req = http.request({socketPath:socket,path:'/mcp',method,headers:{accept:'application/json, text/event-stream','content-type':'application/json',...(session ? {'mcp-session-id':session,'mcp-protocol-version':'2025-03-26'} : {})}}, res => {
      let text=''; res.on('data', c => text += c); res.on('end', () => resolve({status:res.statusCode,headers:res.headers,text})); res.on('error',reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('watchdog'))); req.on('error',reject); req.end(message ? JSON.stringify(message) : undefined);
  });
}
const request = (id,query) => ({jsonrpc:'2.0',id,method:'tools/call',params:{name:'zvec_grep_search',arguments:{query},_meta:{progressToken:'token'}}});
const parse = text => text.startsWith('event:') ? text.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => JSON.parse(x.slice(5))) : [JSON.parse(text)];
const events = path => existsSync(path) ? readFileSync(path,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
async function waitFor(fn) { for(let i=0;i<150;i++){ if(fn()) return; await sleep(10); } assert.fail('fixture event missing'); }

test('installed SDK session, SSE progress, timeout, cancellation and disconnect over inherited sockets', {timeout:12000}, async t => {
  const zg = realZg(); assert.ok(zg, 'installed zg required');
  const resolve = createRequire(realpathSync(zg));
  const urls = ['@modelcontextprotocol/server','@modelcontextprotocol/node','zod'].map(name => pathToFileURL(resolve.resolve(name)).href);
  const sandbox = createSandbox();
  const socket = join(sandbox.root,'sdk.sock'), log = join(sandbox.root,'sdk-events');
  const peer = sandbox.spawn(process.execPath,['--input-type=module','-e',fixtureScript,pathToFileURL(join(DAEMON_DIR,'unix-supervisor.mjs')).href,...urls,socket,log]);
  t.after(async () => { peer.child.kill('SIGTERM'); await Promise.race([peer.closed,sleep(1500)]); peer.child.kill('SIGKILL'); t.diagnostic(`SDK fixture events: ${JSON.stringify(events(log))}; stderr: ${peer.out.stderr}`); sandbox.cleanup(); });
  await waitFor(() => peer.out.stdout.includes('ready') || peer.child.exitCode !== null);
  assert.match(peer.out.stdout,/ready/,peer.out.stderr);
  const init = await call(socket,'POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}});
  assert.equal(init.status,200,init.text); const session=init.headers['mcp-session-id']; assert.equal(session,'sdk-session');
  assert.equal(parse(init.text)[0].result.serverInfo.name,'sdk-fixture');
  assert.equal((await call(socket,'POST',{jsonrpc:'2.0',method:'notifications/initialized'},session)).status,202);
  const fast=await call(socket,'POST',request(2,'fast'),session);
  assert.equal(parse(fast.text).at(-1).result.content[0].text,'FRESH');
  const started = performance.now();
  const timeoutResponse = await call(socket,'POST',request(7,'timeout'),session);
  assert.ok(performance.now() - started < 800, 'timeout must precede the 850ms backend result');
  const timeoutMessages = parse(timeoutResponse.text);
  assert.ok(timeoutMessages.some(m => m.method === 'notifications/progress'), timeoutResponse.text);
  assert.ok(timeoutMessages.some(m => m.id === 7 && m.result?.isError), timeoutResponse.text);
  assert.doesNotMatch(timeoutResponse.text,/LATE/);
  await waitFor(() => events(log).some(e => e.event === 'finish' && e.query === 'timeout'));
  assert.doesNotMatch(timeoutResponse.text,/LATE/);
  const delayed=call(socket,'POST',request(3,'slow'),session);
  await waitFor(() => events(log).some(e => e.query === 'slow' && e.event === 'start'));
  const cancel=await call(socket,'POST',{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:3,reason:'test'}},session);
  assert.equal(cancel.status,202,cancel.text);
  const timed=await delayed; const messages=parse(timed.text);
  assert.ok(messages.some(m => m.method === 'notifications/progress' && m.params.progressToken === 'token'),timed.text);
  assert.ok(messages.some(m => m.id === 3 && m.result?.isError),timed.text);
  assert.doesNotMatch(timed.text,/LATE/);
  await waitFor(() => events(log).some(e => e.event === 'abort' && e.query === 'slow'));
  const disconnected = http.request({socketPath:socket,path:'/mcp',method:'POST',headers:{accept:'application/json, text/event-stream','content-type':'application/json','mcp-session-id':session,'mcp-protocol-version':'2025-03-26'}});
  disconnected.on('error',()=>{}); disconnected.end(JSON.stringify(request(4,'disconnect')));
  await new Promise((resolve,reject) => { disconnected.once('response',res => {res.once('data',()=>{disconnected.destroy();resolve();});res.once('error',reject);}); });
  assert.equal(parse((await call(socket,'POST',request(5,'fast'),session)).text).at(-1).result.content[0].text,'FRESH');
  assert.equal((await call(socket,'DELETE',null,session)).status,200);
  const after=await call(socket,'POST',request(6,'fast'),session); assert.equal(after.status,404,after.text);
  assert.deepEqual(sandbox.egressEvents(),[]);
});
