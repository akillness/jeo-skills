#!/usr/bin/env node
// Headless screenshot of a real page over the Chrome DevTools Protocol, no dependencies (Node 22+ has WebSocket).
// Use it when the in-app browser pane is hidden (a hidden pane stalls requestAnimationFrame and returns stale or black
// frames) or when you need exact, repeatable framing.
//
//   node capture.mjs <url> <out.png|out.jpg> [more "<js-step>" ...]
// env:
//   WIDTH=1600 HEIGHT=900 SCALE=1 MOBILE=0     viewport (MOBILE=1 → 390x844 at 2x with a phone user agent)
//   WAIT_FOR="<js expression>"                  poll until truthy before shooting (e.g. "window.__app?.ready")
//   SETTLE=1500                                 ms to wait after load / WAIT_FOR (use 3000-5000 for WebGL scenes)
//   STEP_WAIT=800                               ms to wait after each js step
//   CHROME=/path/to/chrome                      override the browser binary
// Each extra argument is a JS step run in the page, in order (click something, open a panel, scroll), before the shot.
// Prints the result of each step and any page errors, so a broken page is caught rather than photographed.
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [url, out, ...steps] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node capture.mjs <url> <out.png|jpg> ["<js step>" ...]'); process.exit(1); }
const mobile = process.env.MOBILE === '1';
const W = Number(process.env.WIDTH || (mobile ? 390 : 1600)), H = Number(process.env.HEIGHT || (mobile ? 844 : 900));
const SCALE = Number(process.env.SCALE || (mobile ? 2 : 1)), SETTLE = Number(process.env.SETTLE || 1500), STEP_WAIT = Number(process.env.STEP_WAIT || 800);

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(pw)) {
    for (const dir of readdirSync(pw).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const rel of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
        if (existsSync(join(pw, dir, rel))) return join(pw, dir, rel);
      }
    }
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'])
    if (existsSync(p)) return p;
  throw new Error('No Chrome found: set CHROME=/path/to/chrome');
}

const port = 9300 + Math.floor(Math.random() * 600), profile = join(tmpdir(), `capture-${process.pid}-${port}`);
const chrome = spawn(findChrome(), ['--headless=new', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal',
  '--disable-frame-rate-limit', `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let version;
for (let i = 0; i < 150 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); } }
if (!version) { console.error('Chrome did not start'); process.exit(1); }
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let seq = 0; const pending = new Map(), errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile });
if (mobile) await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
const evaluate = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? `EXCEPTION ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}` : r.result?.value; };

await cdp('Page.navigate', { url });
for (let i = 0; i < 300; i++) { await sleep(200); if (await evaluate('document.readyState') === 'complete') break; }
if (process.env.WAIT_FOR) {
  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) { await sleep(200); ready = Boolean(await evaluate(`(()=>{try{return !!(${process.env.WAIT_FOR})}catch{return false}})()`)); }
  console.log(ready ? 'ready' : 'WAIT_FOR never became true: shooting anyway');
}
await sleep(SETTLE);
for (const step of steps) { console.log('step:', step.slice(0, 80), '→', JSON.stringify(await evaluate(step))); await sleep(STEP_WAIT); }
const jpeg = /\.jpe?g$/i.test(out);
const { data } = await cdp('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 88 } : { format: 'png' });
writeFileSync(out, Buffer.from(data, 'base64'));
console.log(`saved ${out} (${W}x${H}${SCALE !== 1 ? ` @${SCALE}x` : ''}${mobile ? ', phone viewport' : ''})`);
if (errors.length) console.log(`page errors (${errors.length}):\n  ` + errors.slice(0, 8).join('\n  '));
ws.close(); cleanup(); process.exit(0);
