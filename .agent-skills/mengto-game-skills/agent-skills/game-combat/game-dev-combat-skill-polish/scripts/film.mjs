// Film skill casts headlessly on a stopped, stepped clock: one Chrome, one page, each scenario staged through the review
// fixture's hook load(), cast with act(), then frozen (freeze(true)) and stepped DT seconds a frame (step(dt)). The page must
// expose window[HOOK] with: state, load(json), holdAI(on), act(command), look(col,row), project(col,row), withWorld(fn),
// freeze(on), step(seconds) (resolving after the frame is drawn), pace(k). The staging block assumes a turn-based board of
// units ({id, col, row, team, hp, ap}) and a turnIndex; adapt it to your game.
// usage: node film.mjs <scenarios.mjs> [ids...]   env: BASE (dev server), OUT (frames dir), SPAN (camera span, 10), DT (.05),
//   SETTINGS (JSON merged into the review settings), HIDE (comma list of mesh-name prefixes to hide, e.g. the HUD's helpers).
// Per scenario: maxFrames (90), tail (idle frames kept after the cast, 8), span, frame [col,row], points [[col,row]] to keep in the crop.
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Game-specific settings, all from the environment: HOOK (the page's review-hook global, default __review), PAGE (the
// review URL, {fixture} replaced, default /?review={fixture}), READY (an extra page expression that must be true before
// staging), SETTINGS_KEY (localStorage key for review settings), CHROME (a Chrome/Chromium binary).
const HOOK = process.env.HOOK || '__review', READY = process.env.READY || 'true';
const PAGE = fixture => (process.env.PAGE || '/?review={fixture}').replace('{fixture}', fixture);
const SETTINGS_KEY = process.env.SETTINGS_KEY || 'review-settings';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = resolve(process.env.OUT || 'qa/captures/skill-motion/frames');
const PACE = Number(process.env.PACE || .5), SPAN = Number(process.env.SPAN || 10), REAL = Number(process.env.REAL || 9);
const [scenarioPath, ...only] = process.argv.slice(2);
const { default: SCENARIOS } = await import(pathToFileURL(resolve(scenarioPath)).href);
const list = only.length ? SCENARIOS.filter(s => only.includes(s.id)) : SCENARIOS;
const port = 9700 + Math.floor(Math.random() * 90), profile = `/tmp/skill-film-${port}`;
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', `--remote-debugging-port=${port}`, '--no-first-run', `--user-data-dir=${profile}`, '--window-size=1600,900', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(1));
let version; for (let i = 0; i < 600 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
const ws = new WebSocket(version.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(); const logs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') logs.push((m.params.exceptionDetails?.exception?.description || JSON.stringify(m.params)).slice(0, 600)); };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='#toast{display:none!important}';document.head.append(st);});` });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('${SETTINGS_KEY}',JSON.stringify({quality:'high',shadows:'high',reduced:false,sound:false,...${process.env.SETTINGS||'{}'}}));}catch{}` });
const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const ready = () => evaluate(`(()=>{try{return !!window.${HOOK}&&!!(${READY});}catch{return false;}})()`);
let loaded = null;
async function open(fixture) {
  if (loaded === fixture) return;
  await cdp('Page.navigate', { url: `${BASE}${PAGE(fixture)}` });
  for (let i = 0; i < 900; i++) { await sleep(200); if (await ready().catch(() => false)) break; }
  await sleep(4000); loaded = fixture;
}
async function shot(file) { const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); writeFileSync(file, Buffer.from(data, 'base64')); }
for (const s of list) {
  const t0 = Date.now();
  try {
    await open(s.fixture || 'combat');
    // Stage: positions, full AP, the caster's turn. Every scenario starts from the fixture's own state.
    const staged = await evaluate(`(()=>{const S=window.${HOOK};S.holdAI(true);S.pace(1);
      if(!window.__base)window.__base=JSON.stringify(S.state);
      const st=JSON.parse(window.__base),place=${JSON.stringify(s.place || [])},prep=${s.prep ? `(${s.prep})` : 'null'};
      for(const [id,col,row,extra] of place){const u=st.units.find(u=>u.id===id);if(!u)continue;Object.assign(u,{col,row,ap:6,hp:Math.max(u.hp,1)},extra||{});}
      for(const u of st.units)if(!place.some(p=>p[0]===u.id)&&${s.hideOthers ? 'true' : 'false'}&&u.team){u.hp=0;}
      if(prep)prep(st);
      let got=null;for(let i=0;i<st.units.length+4;i++){st.turnIndex=i;try{got=S.load(JSON.stringify(st));}catch(e){return 'load failed: '+e.message;}if(got===${s.caster})break;}
      S.holdAI(true);return got;})()`);
    if (staged !== s.caster) throw new Error('staging: active ' + staged);
    await sleep(2500);
    const [fc, fr] = s.frame || s.place[0].slice(1, 3);
    await evaluate(`(()=>{const S=window.${HOOK};S.look(${fc},${fr});S.withWorld(w=>{if(w.rig){w.rig.desiredSpan=${s.span || SPAN};w.rig.span=${s.span || SPAN};}});return true;})()`);
    // Park the pointer on the day plaque, off the board.
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1440, y: 37 });
    await sleep(2500);
    const where = await evaluate(`(()=>{const S=window.${HOOK};const o={};for(const [id,col,row] of ${JSON.stringify(s.place)})o[id]=S.project(col,row);${JSON.stringify(s.points||[])}.forEach(([c,r],i)=>o['p'+i]=S.project(c,r));return o;})()`);
    const dir = `${OUT}/${s.id}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    await shot(`${dir}/000-before.jpg`);
    if (process.env.HIDE) console.log('hidden', await evaluate(`(()=>{const names=${JSON.stringify((process.env.HIDE||'').split(','))};let n=[];window.${HOOK}.withWorld(w=>{const root=w.scene||w.world?.scene;(root||w).traverse?.(o=>{if(o.isMesh&&names.some(x=>o.name.startsWith(x))){o.material.visible=false;n.push(o.name);}});});return n.join('|');})()`));
    const DT = Number(s.dt || process.env.DT || .05);
    await evaluate(`window.${HOOK}.freeze(true)`);
    const cmd = s.cmd;
    const result = await evaluate(`JSON.stringify(window.${HOOK}.act(${JSON.stringify(cmd)}))`);
    const frames = [];let idle = 0, t = 0;
    const probe = `(()=>{let o=null;window.${HOOK}.withWorld(w=>{const m=w.nodes.get(${s.caster})?.model;o=[w.busy,m?.sample?.id||m?.currentAction||null,+(m?.sample?.elapsed||0).toFixed(3)];});return o;})()`;
    for (let i = 1; i <= (s.maxFrames || 90); i++) {
      await evaluate(`window.${HOOK}.step(${DT})`); t += DT;
      // Let the stepped moment reach the screen before it is shot (a loaded machine otherwise shoots the frame before).
      await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))`);
      const f = `${dir}/${String(i).padStart(3, '0')}.jpg`; await shot(f);
      const [busy, action, elapsed] = await evaluate(probe).catch(() => [true, null, 0]); frames.push({ f, at: +t.toFixed(3), action, elapsed, busy });
      if (!busy && t > .6) { if (++idle >= (s.tail || 8)) break; } else idle = 0;
    }
    await evaluate(`window.${HOOK}.freeze(false)`);
    await evaluate(`window.${HOOK}.pace(1)`);
    writeFileSync(`${dir}/meta.json`, JSON.stringify({ id: s.id, cmd, result: JSON.parse(result), where, frames: frames.length, pace: 1, dt: DT, times: frames.map(f => f.at), actions: frames.map(f => [f.action, f.elapsed, f.busy]) }, null, 1));
    console.log(s.id, 'ok', result, frames.length, 'frames', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  } catch (e) { console.log(s.id, 'FAILED', e.message.slice(0, 300)); }
}
if (logs.length) console.log('page errors:\n' + [...new Set(logs)].slice(0, 8).join('\n'));
ws.close(); chrome.kill(); process.exit(0);
