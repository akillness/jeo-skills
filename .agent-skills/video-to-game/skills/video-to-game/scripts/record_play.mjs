#!/usr/bin/env node
// Film the game while a scenario plays it with the keyboard, at its real frame rate.
//
//   node record_play.mjs http://127.0.0.1:8000/?autostart play.mjs -o take.mp4 [--seconds 18] [--size 1920x1080]
//
// play.mjs exports `async function play(page, { seconds, t0 })` and only presses keys (page.keyboard) and
// reads state the game exposes (window.__game). The take is encoded with each frame's real duration, so a
// slow moment stays slow instead of being stretched. Needs Node 18+, ffmpeg, and `npm i playwright-core`
// (or playwright). Uses the system Chrome when found, for real GPU WebGL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
const out = opt('-o', 'take.mp4'), seconds = +opt('--seconds', 18), [W, H] = opt('--size', '1920x1080').split('x').map(Number);
const [url, playFile] = argv;
if (!url || !playFile) { console.error('usage: node record_play.mjs URL play.mjs -o take.mp4 [--seconds 18]'); process.exit(1); }

let chromium;
try { ({ chromium } = await import('playwright-core')); } catch { ({ chromium } = await import('playwright')); }
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: chrome, headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=' + (process.platform === 'darwin' ? 'metal' : 'default'),
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2500);
await page.mouse.click(W / 2, H / 2).catch(() => {});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'take-'));
const cdp = await ctx.newCDPSession(page);
const times = []; let n = 0;
cdp.on('Page.screencastFrame', f => {
  fs.writeFileSync(path.join(dir, String(n++).padStart(5, '0') + '.jpg'), Buffer.from(f.data, 'base64'));
  times.push(f.metadata.timestamp);
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const { play } = await import(pathToFileURL(path.resolve(playFile)).href);
const t0 = Date.now();
await Promise.race([play(page, { seconds, t0 }).catch(e => errors.push('play: ' + e)), page.waitForTimeout((seconds + 15) * 1000)]);
await cdp.send('Page.stopScreencast');
await browser.close();

if (n < 2) { console.error('no frames captured', errors.slice(0, 3)); process.exit(1); }
const list = times.map((t, i) => `file '${String(i).padStart(5, '0')}.jpg'\nduration ${((times[i + 1] ?? t + 1 / 60) - t).toFixed(5)}`);
fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n') + `\nfile '${String(n - 1).padStart(5, '0')}.jpg'\n`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt',
  '-vf', `scale=${W}:${H}:flags=lanczos,fps=60,format=yuv420p`, '-c:v', 'libx264', '-crf', '20', path.resolve(out)], { cwd: dir });
fs.rmSync(dir, { recursive: true, force: true });
const dur = times.at(-1) - times[0];
console.log(`${out}: ${n} frames, ${dur.toFixed(1)} s, ${(n / dur).toFixed(1)} fps, ${errors.length} console errors`);
for (const e of errors.slice(0, 5)) console.log('  ' + e.slice(0, 200));
