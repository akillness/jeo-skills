// Production daemon entry under its kernel profile; all state and the native index are disposable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildLocalIndex, createSandbox, DAEMON_DIR, installedPackageDir, localModelArtifactAvailable, OS_SANDBOX_AVAILABLE, readInstanceRecord, realZg, sleep, trustRoot } from './harness.mjs';
import { buildProfile } from '../managed-daemon/os-sandbox.mjs';
import { createCanary, removeCanary } from '../managed-daemon/sandbox-canary.mjs';

function request(socket, message, session) {
  return new Promise((resolve,reject) => {
    const req = http.request({socketPath:socket,path:'/mcp',method:'POST',headers:{accept:'application/json, text/event-stream','content-type':'application/json',...(session ? {'mcp-session-id':session,'mcp-protocol-version':'2025-03-26'} : {})}}, res => {
      let text=''; res.on('data',chunk => text+=chunk); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text})); res.on('error',reject);
    });
    req.setTimeout(35000,()=>req.destroy(new Error('MCP watchdog'))); req.on('error',reject); req.end(JSON.stringify(message));
  });
}
function messages(text) {
  if (text.trimStart().startsWith('{')) return [JSON.parse(text)];
  return text.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)));
}

test('confined production daemon serves real indexed search through inherited supervisor', {timeout:180000}, async t => {
  assert.ok(process.platform === 'darwin' && OS_SANDBOX_AVAILABLE, 'macOS kernel sandbox is required');
  assert.ok(realZg() && localModelArtifactAvailable(), 'installed zg and cached local model are required');
  const sb=createSandbox(); let child, canary, secondCanary, rival, supervisorStopped=false, output='';
  t.after(async () => {
    if (supervisorStopped) { try { process.kill(supervisorStopped,'SIGCONT'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    if (rival && rival.exitCode === null && rival.signalCode === null) rival.kill('SIGKILL');
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3000)]); if (child.exitCode === null) child.kill('SIGKILL'); }
    t.diagnostic(`daemon output: ${output}`);
    if (canary && existsSync(canary.root)) removeCanary(canary);
    if (secondCanary && existsSync(secondCanary.root)) removeCanary(secondCanary);
    sb.cleanup();
  });
  const previousTmp=process.env.TMPDIR; process.env.TMPDIR=sb.tmp;
  try { canary=createCanary(); } finally { if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR=previousTmp; }
  sb.writeWorkspaceFiles({'src/search.ts':'export function nativefixtureunique() { return "found"; }\n'});
  await buildLocalIndex(sb); await trustRoot(sb);
  const requirePkg=createRequire(join(installedPackageDir(),'package.json'));
  const warnings=join(sb.home,'.local','state','zvec-grep','warnings'); mkdirSync(warnings,{recursive:true});
  const profile=buildProfile({port:47991,nodePath:realpathSync(process.execPath),rgPath:realpathSync(requirePkg('@vscode/ripgrep').rgPath),writableRoots:[sb.zvecHome,sb.modelCache,warnings,join(canary.root,'new')].map(p=>realpathSync(p)),indexHomes:[sb.indexDir,...canary.indexHomes].map(p=>realpathSync(p)),home:realpathSync(sb.zvecHome)});
  child=spawn('/usr/bin/sandbox-exec',['-p',profile,process.execPath,join(DAEMON_DIR,'daemon-entry.mjs'),'run','--home',sb.zvecHome,'--listen','127.0.0.1:47991','--boundary-canary',canary.root],{cwd:sb.workspace,env:sb.env({ZVEC_GREP_PACKAGE_DIR:installedPackageDir(),NODE_OPTIONS:''}),stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>output+=chunk); child.stderr.on('data',chunk=>output+=chunk);
  let record; const deadline=Date.now()+45000;
  while(Date.now()<deadline && child.exitCode===null) { try {record=readInstanceRecord(sb);if(record.ready && existsSync(record.managedSocket))break;}catch{} await sleep(100); }
  assert.ok(record?.ready && existsSync(record.managedSocket),`daemon not ready: ${output}`);
  assert.equal(record.pid, child.pid, 'only signal the sandbox-owned daemon process');
  assert.ok(Number.isInteger(record.supervisorPid) && record.supervisorPid > 0 && record.supervisorPid !== record.pid, `missing separate supervisor: ${JSON.stringify(record)}`);
  process.kill(record.supervisorPid, 0);
  const init=await request(record.managedSocket,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'native-test',version:'1'}}});
  assert.equal(init.status,200,init.text); const session=init.headers['mcp-session-id']; assert.ok(session,init.text);
  assert.ok(messages(init.text)[0].result?.protocolVersion,init.text);
  const initialized=await request(record.managedSocket,{jsonrpc:'2.0',method:'notifications/initialized'},session); assert.equal(initialized.status,202,initialized.text);
  const found=await request(record.managedSocket,{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'zvec_grep_search',arguments:{root:sb.workspace,query:'nativefixtureunique',fts:['nativefixtureunique']}}},session);
  assert.equal(found.status,200,found.text); const result=messages(found.text).find(m=>m.id===2); assert.ok(result?.result && !result.result.isError,found.text);
  assert.match(JSON.stringify(result.result),/src\/search\.ts/,found.text);
  const searchMessage = id => ({jsonrpc:'2.0',id,method:'tools/call',params:{name:'zvec_grep_search',arguments:{root:sb.workspace,query:'nativefixtureunique',fts:['nativefixtureunique']}}});
  const beforeStop = performance.now();
  let fallback;
  process.kill(child.pid, 'SIGSTOP');
  try {
    fallback = await request(record.managedSocket,searchMessage(3),session);
    assert.ok(performance.now()-beforeStop < 30000, 'fallback exceeded 30 seconds');
    assert.equal(fallback.status,200,fallback.text);
    const timed = messages(fallback.text).find(m=>m.id===3);
    assert.equal(timed?.result?.isError,true,fallback.text);
    assert.match(JSON.stringify(timed),/native Grep|\brg\b/i);
    process.kill(child.pid,0);
  } finally {
    process.kill(child.pid,'SIGCONT');
  }
  const after = readInstanceRecord(sb);
  assert.equal(after.pid,record.pid);
  assert.equal(after.instanceToken,record.instanceToken);
  assert.equal(after.supervisorPid,record.supervisorPid);
  const recovered = await request(record.managedSocket,searchMessage(4),session);
  const recoveredResult = messages(recovered.text).find(m=>m.id===4);
  assert.ok(recoveredResult?.result && !recoveredResult.result.isError,recovered.text);
  assert.match(JSON.stringify(recoveredResult.result),/src\/search\.ts/,recovered.text);
  process.env.TMPDIR=sb.tmp;
  try { secondCanary=createCanary(); } finally { if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR=previousTmp; }
  const rivalProfile=buildProfile({port:47991,nodePath:realpathSync(process.execPath),rgPath:realpathSync(requirePkg('@vscode/ripgrep').rgPath),writableRoots:[sb.zvecHome,sb.modelCache,warnings,join(secondCanary.root,'new')].map(p=>realpathSync(p)),indexHomes:[sb.indexDir,...secondCanary.indexHomes].map(p=>realpathSync(p)),home:realpathSync(sb.zvecHome)});
  supervisorStopped=record.supervisorPid;
  process.kill(supervisorStopped,'SIGSTOP');
  child.kill('SIGTERM');
  await sleep(150);
  assert.equal(readInstanceRecord(sb).instanceToken,record.instanceToken,'lock released while supervisor remained alive');
  process.kill(supervisorStopped,0);
  rival=spawn('/usr/bin/sandbox-exec',['-p',rivalProfile,process.execPath,join(DAEMON_DIR,'daemon-entry.mjs'),'run','--home',sb.zvecHome,'--listen','127.0.0.1:47991','--boundary-canary',secondCanary.root],{cwd:sb.workspace,env:sb.env({ZVEC_GREP_PACKAGE_DIR:installedPackageDir(),NODE_OPTIONS:''}),stdio:['ignore','pipe','pipe']});
  let rivalOutput=''; rival.stdout.on('data',c=>rivalOutput+=c); rival.stderr.on('data',c=>rivalOutput+=c);
  const rivalExit=await Promise.race([new Promise(resolve=>rival.once('close',(code,signal)=>resolve({code,signal}))),sleep(1200).then(()=>null)]);
  assert.ok(rivalExit && rivalExit.code !== 0, `competing daemon did not reject the live lock: ${rivalOutput}`);
  assert.match(rivalOutput,/already running with PID/,rivalOutput);
  assert.equal(readInstanceRecord(sb).instanceToken,record.instanceToken,'competing daemon replaced the lock');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(5000).then(()=>{throw new Error('daemon shutdown timed out');})]);
  assert.throws(()=>process.kill(record.supervisorPid,0),error=>error.code==='ESRCH','supervisor still alive after daemon exit');
  assert.equal(existsSync(join(sb.zvecHome,'daemon','instance.lock')),false,'lock remains after daemon exit');
  supervisorStopped=false;
  assert.deepEqual(sb.egressEvents(),[]);
});
