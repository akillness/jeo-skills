// One still of a recipe or cast: run a setup expression in the page, freeze the clock, step it, screenshot (env POST: an
// expression whose value is printed after). usage: node probe.mjs <out.jpg> <setup js> [steps] [dt]
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
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('${SETTINGS_KEY}',JSON.stringify({quality:'high',shadows:'high',reduced:false,sound:false}));}catch{}` });
const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const ready = () => evaluate(`(()=>{try{return !!window.${HOOK}&&!!(${READY});}catch{return false;}})()`);

// usage: node probe.mjs <out.jpg> <setup js> [steps] [dt]   (setup runs after the fixture loads; the clock is then frozen and stepped)
const [out, setup, steps = '10', dt = '.05'] = process.argv.slice(2);
await cdp('Page.navigate', { url: `${BASE}${PAGE(process.env.FIXTURE || 'combat')}` });
for (let i = 0; i < 900; i++) { await sleep(200); if (await ready().catch(() => false)) break; }
await sleep(4000);
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1440, y: 37 });
await evaluate(`window.${HOOK}.holdAI(true)`);
console.log('setup:', JSON.stringify(await evaluate(setup)));
await evaluate(`window.${HOOK}.freeze(true)`);
for (let i = 0; i < Number(steps); i++) await evaluate(`window.${HOOK}.step(${dt})`);
if (process.env.POST) console.log('post:', JSON.stringify(await evaluate(process.env.POST)));
const { data } = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 88 }); writeFileSync(out, Buffer.from(data, "base64")); console.log('saved', out);
if (logs.length) console.log('page errors:\n' + [...new Set(logs)].slice(0, 8).join('\n'));
ws.close(); chrome.kill(); process.exit(0);
