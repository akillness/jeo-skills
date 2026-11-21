#!/usr/bin/env node
// brand.mjs - capture a website's brand (copy, colours, fonts, logo, screenshots) with headless Chrome over CDP.
//
// Usage:  node brand.mjs <url> [outDir=brand]        (zero dependencies; needs Google Chrome)
//
// Loads the page at 1920x1080, dismisses cookie banners when trivial, scrolls through to trigger lazy content, then writes:
//   outDir/brand.json   everything (copy, colour roles, fonts, logo candidates, warnings)
//   outDir/BRAND.md     human-readable summary (palette with role guess, fonts, logo path, copy lines, CTA texts)
//   outDir/board.png    ONE image to look at: palette, font specimen (real font if downloaded), logo, 4 screenshots, key copy
//   outDir/logo/        logo.svg|png (best candidate; inline SVG gets computed fills), favicon.*, app-icon.*
//   outDir/fonts/       downloaded .woff2/.woff/.ttf/.otf that the page actually uses
//   outDir/screens/NN.jpg   hero viewport + 3-5 viewports down the page
//   outDir/media/NN.jpg     element screenshots of large imagery / app UI (img, video, canvas > 500px wide), plus og-image
// Colour roles: ground(s) = area-weighted backgrounds (DOM + screenshot pixels),
//   ink = the computed colour of the LARGEST HEADING (h1 / hero line; text-volume weighted inside it) = headline / logo ink,
//   ink-soft = the most used body-text colour when it differs from ink (body copy grey on dark sites), ink muted = a third, dimmer neutral,
//   accent(s) = CTA background / brand CSS variables / link / logo / saturated pixels; theme = dark|light from the main ground.
//   When no CSS accent exists (monochrome sites) saturated dominant colours are sampled from screens/ and media/ images in a small
//   in-page canvas and listed as "accent candidates (from imagery)" with their source file (colors.accentCandidates in brand.json).
// Media hygiene: blank images (pixel std-dev ~0, e.g. a WebGL canvas that did not paint) are dropped; images whose top 8% matches the
//   site nav strip of a screenshot are kept but flagged "screenshot, not product media"; near-blank dark gradients (std < 8, mean luma < 40)
//   are flagged "near-blank" (brand.json media[].flag, BRAND.md).
//   <img>/<canvas>/<video> element shots are taken isolated (everything else on the page hidden) so fixed navs and hero text do not leak in.
// Exit: 0 ok (warnings are listed in brand.json and printed), 1 when the page cannot be loaded.
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, parseArgs, die, helpFrom } from './_cdp.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), { help: 'bool' });
if (opt.help || !pos[0]) { console.log(helpFrom(import.meta.url)); process.exit(opt.help ? 0 : 1); }
let startUrl = pos[0]; if (!/^(https?|file):/i.test(startUrl)) startUrl = 'https://' + startUrl;
const out = path.resolve(pos[1] || 'brand');
const warnings = [];
const warn = (m) => { warnings.push(m); console.error('warn: ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('error: overall timeout (180s)'); process.exit(1); }, 180000).unref();

// ====================================================================== colour helpers (node side)
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dist = (a, b) => { const p = hex2rgb(a), q = hex2rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hsl = (h) => { let [r, g, b] = hex2rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(hh * 60 + 360) % 360, s, l]; };
const chromatic = (h) => { const [, s, l] = hsl(h); return s > 0.3 && l > 0.12 && l < 0.88; };
function mergeColors(cands, thr = 18) { // [{hex,w,src}] -> clusters sorted by weight
  const cl = [];
  for (const c of [...cands].sort((a, b) => b.w - a.w)) {
    const m = cl.find((x) => dist(x.hex, c.hex) < thr);
    if (m) { m.w += c.w; m.src.push(...[].concat(c.src)); } else cl.push({ hex: c.hex, w: c.w, src: [].concat(c.src) });
  }
  return cl.sort((a, b) => b.w - a.w);
}

// ====================================================================== in-page functions (serialised into the page)
function pageDismiss() {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const txt = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const accept = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i (agree|accept)|agree|got it|ok(ay)?|continue|accept (&|and) close|yes,? i agree|understood|allow all|accept all cookies|agree (&|and) continue)$/;
  const ctr = '[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[class*=gdpr i],[id*=onetrust],[id*=usercentrics],[class*=cc-],[id*=cmp],[class*=cmp-],[aria-label*=cookie i],[aria-label*=consent i],[role=dialog],[aria-modal=true]';
  const direct = ['#onetrust-accept-btn-handler', '#truste-consent-button', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#accept-all-cookies', '.cc-allow', '.cc-dismiss', '[data-testid="uc-accept-all-button"]', 'button[id*=accept][id*=cookie i]', 'button[class*=accept][class*=cookie i]'];
  let clicked = null;
  for (const s of direct) { const b = document.querySelector(s); if (b && vis(b)) { b.click(); clicked = s; break; } }
  if (!clicked) {
    for (const b of document.querySelectorAll('button,[role=button],a[role=button],a.button,a.btn,input[type=button],input[type=submit]')) {
      if (!vis(b)) continue;
      const t = txt(b);
      if (accept.test(t) && (b.closest(ctr) || /accept|allow|agree/.test(t) && /cookie/.test(t))) { b.click(); clicked = t; break; }
    }
  }
  for (const e of document.querySelectorAll(ctr)) {
    const p = getComputedStyle(e).position;
    if ((p === 'fixed' || p === 'sticky') && e.getBoundingClientRect().height < innerHeight * 0.9 || e.matches('[class*=cookie i],[id*=cookie i],[id*=onetrust],[id*=usercentrics]') && p === 'fixed') e.style.setProperty('display', 'none', 'important');
  }
  document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
  document.body && document.body.style.removeProperty('overflow');
  return clicked;
}

async function pageScroll() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = Math.round(innerHeight * 0.7); let y = 0, n = 0;
  while (n++ < 70 && y < Math.min(document.documentElement.scrollHeight, 26000)) { scrollTo(0, y); await sleep(170); y += step; }
  await sleep(500); scrollTo(0, 0); await sleep(300);
  try { await document.fonts.ready; } catch (e) {}
  return Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
}

function pageExtract() {
  const W = innerWidth, H = innerHeight, SY = scrollY;
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const txt = (e) => clean(e.innerText || e.textContent);
  const meta = (s) => { const m = document.querySelector(s); return m ? clean(m.getAttribute('content')) || null : null; };
  const cls = (e) => (e.getAttribute && e.getAttribute('class')) || '';
  const isVis = (e) => { try { return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && e.getBoundingClientRect().width > 0; } catch (x) { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } };
  const doc = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), y: Math.round(r.top + SY), w: Math.round(r.width), h: Math.round(r.height) }; };
  // --- colour parsing (any CSS colour -> #rrggbb + alpha) via canvas fallback
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const col = (s) => {
    if (!s) return null; if (cache.has(s)) return cache.get(s);
    let r = null;
    const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(s);
    if (m) { let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); r = { r: Math.round(m[1]), g: Math.round(m[2]), b: Math.round(m[3]), a }; }
    else if (s !== 'transparent' && s !== 'currentcolor' && s !== 'inherit' && s !== 'initial') {
      try { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#010203'; const before = cx.fillStyle; cx.fillStyle = s; if (cx.fillStyle !== before || /^#010203$/i.test(s)) { cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; r = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; } } catch (x) {}
    } else r = { r: 0, g: 0, b: 0, a: 0 };
    if (r) r.hex = '#' + [r.r, r.g, r.b].map((v) => v.toString(16).padStart(2, '0')).join('');
    cache.set(s, r); return r;
  };
  const colsIn = (s) => { const out = []; for (const m of (s || '').matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|(?:oklch|oklab|lab|lch|hsl|color)\([^)]*\))/gi)) { const c = col(m[1]); if (c && c.a > 0.3) out.push(c.hex); } return out; };

  // --- meta / names
  const title = clean(document.title);
  const nameMeta = meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]') || meta('meta[name="apple-mobile-web-app-title"]');
  const titleParts = title.split(/\s+[|\u2013\u2014\u00b7:-]\s+|\s*[|\u00b7]\s*/).map(clean).filter((p) => p.length > 1 && !/^(home|welcome|homepage|official site|official website)$/i.test(p));
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]') || meta('meta[name="twitter:description"]');

  // --- headings, hero line, paragraphs
  const collapse = (t) => { const h = t.length >> 1, a = t.slice(0, h).trim(); return a.length > 3 && t.slice(h).trim() === a ? a : t; };
  const heads = (sel, max, maxLen) => { const seen = new Set(), o = []; for (const e of document.querySelectorAll(sel)) { if (!isVis(e)) continue; const t = collapse(txt(e)); if (t.length < 2 || t.length > maxLen || seen.has(t)) continue; seen.add(t); o.push(t); if (o.length >= max) break; } return o; };
  const h1 = heads('h1', 4, 220), h2 = heads('h2', 12, 160), h3 = heads('h3', 8, 120);
  let heroEl = null, heroSize = 0;
  const textEls = [];
  const all = [...document.querySelectorAll('body *')].slice(0, 9000);
  const fam = {};
  const txtCol = new Map();
  for (const e of all) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'TEMPLATE'].includes(e.tagName.toUpperCase())) continue;
    let own = ''; for (const n of e.childNodes) if (n.nodeType === 3) own += n.textContent; own = clean(own);
    if (own.length < 2) continue;
    if (!isVis(e)) continue;
    const cs = getComputedStyle(e), r = e.getBoundingClientRect(), fs = parseFloat(cs.fontSize) || 16;
    if (r.top + SY > docH) continue;
    const c = col(cs.color);
    const wgt = own.length * fs;
    if (c && c.a > 0.2) { const k = c.hex; const o = txtCol.get(k) || { w: 0, n: 0 }; o.w += wgt; o.n += own.length; txtCol.set(k, o); }
    const f = clean(cs.fontFamily.split(',')[0]).replace(/^["']|["']$/g, ''); const fk = f + '|' + cs.fontWeight; fam[fk] = (fam[fk] || 0) + wgt;
    if (r.top + SY < H * 1.6 && own.length >= 6 && own.length <= 160 && fs > heroSize && !e.closest('nav,header a,button,a')) { heroSize = fs; heroEl = e; }
  }
  const heroLine = heroEl ? clean(heroEl.innerText) : null;
  // headline ink: colour of the largest visible heading (h1, else the hero element), weighted by text length inside it
  let inkEl = null, inkSize = 0;
  for (const e of document.querySelectorAll('h1')) { if (!isVis(e)) continue; const f = parseFloat(getComputedStyle(e).fontSize) || 0; if (f > inkSize && clean(e.innerText).length > 1) { inkSize = f; inkEl = e; } }
  const inkSrc = inkEl ? 'h1' : (heroEl ? 'hero line' : null);
  if (!inkEl) inkEl = heroEl;
  let heroInk = null;
  if (inkEl) {
    const hist = {};
    for (const x of [inkEl, ...inkEl.querySelectorAll('*')]) {
      let own = ''; for (const n of x.childNodes) if (n.nodeType === 3) own += n.textContent; own = clean(own); if (!own.length) continue;
      const c = col(getComputedStyle(x).color); if (!c || c.a < 0.2) continue; hist[c.hex] = (hist[c.hex] || 0) + own.length;
    }
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0];
    const own = col(getComputedStyle(inkEl).color);
    heroInk = { hex: top ? top[0] : (own && own.a > 0.2 ? own.hex : null), size: inkSize || parseFloat(getComputedStyle(inkEl).fontSize) || 0, source: inkSrc, text: clean(inkEl.innerText).slice(0, 60), all: Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => h) };
    if (!heroInk.hex) heroInk = null;
  }
  const sentences = []; const seenS = new Set();
  for (const e of document.querySelectorAll('p, main li, [class*=description i], [class*=subtitle i], [class*=subhead i]')) {
    if (sentences.length >= 8) break;
    if (!isVis(e) || e.closest('footer,nav,header,[aria-hidden=true],[class*=cookie i],[id*=cookie i],[class*=consent i],[class*=mock i],form,button,a[href],code,pre')) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < 15) continue;
    const t = collapse(txt(e)); if (t.length < 40 || t.length > 260 || t.split(' ').length < 7 || t === t.toUpperCase() || /cookie|©|all rights reserved|privacy policy|terms of/i.test(t)) continue;
    if (e.children.length > 3 || [...seenS].some((x) => x.includes(t) || t.includes(x))) continue;
    seenS.add(t); sentences.push(t);
  }

  // --- CTAs
  const isBtnCls = /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i;
  const top0 = (r) => r.top + SY;
  const ctas = []; const ctaEls = [];
  for (const e of document.querySelectorAll('button, a, [role=button], input[type=submit], input[type=button]')) {
    if (!isVis(e)) continue;
    const t = collapse(clean(e.value || e.innerText || e.getAttribute('aria-label'))); if (t.length < 2 || t.length > 34 || t.split(' ').length > 6) continue;
    if (/cookie|consent|reject|decline|toggle menu|open menu|close|^menu$|^search$/i.test(t) || e.closest('[aria-hidden=true],[inert]') || parseFloat(getComputedStyle(e).fontSize) < 12) continue;
    const cs = getComputedStyle(e), bg = col(cs.backgroundColor), bc = col(cs.borderTopColor), r = e.getBoundingClientRect();
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), rad = parseFloat(cs.borderTopLeftRadius) || 0, bw = parseFloat(cs.borderTopWidth) || 0;
    const filled = !!bg && bg.a > 0.5;
    const like = e.tagName === 'BUTTON' || e.getAttribute('role') === 'button' || isBtnCls.test(cls(e)) || (filled && padX >= 14 && r.height >= 24) || (bw > 0 && rad >= 4 && padX >= 14 && r.height >= 24);
    if (!like) continue;
    if (e.tagName === 'BUTTON' && !filled && bw === 0 && !isBtnCls.test(cls(e)) && !e.closest('header,nav') && r.width < 90) continue;
    const top = r.top + SY;
    const verb = /^(get|start|try|book|sign|log|demo|contact|buy|join|download|request|talk|watch|learn|explore|see|view|install|create|schedule|apply|shop|subscribe|read|build|deploy|launch|open|use|begin|claim|order)/i.test(t);
    const border = bw > 0 && bc && bc.a > 0.3;
    if (!filled && !border && !verb && !isBtnCls.test(cls(e))) continue;
    if (e.tagName === 'BUTTON' && !filled && !border && e.closest('header,nav')) continue;
    if (!(top0(r) < H * 1.3) && !filled && !verb) continue;
    ctas.push({ text: t, verb, bg: filled ? bg.hex : null, color: (col(cs.color) || {}).hex || null, border: bw > 0 && bc && bc.a > 0.3 ? bc.hex : null, radius: Math.round(rad), filled, inHeader: !!e.closest('header,nav,[role=banner]'), inHero: top < H * 1.3, top: Math.round(top), w: Math.round(r.width), h: Math.round(r.height), _e: e });
  }
  const seenC = new Set(); const ctaOut = [];
  ctas.sort((a, b) => (b.inHero - a.inHero) || (b.filled - a.filled) || (b.verb - a.verb) || (a.top - b.top));
  for (const c of ctas) { const k = c.text.toLowerCase(); if (seenC.has(k)) continue; seenC.add(k); ctaEls.push(c._e); const { _e, verb, ...rest } = c; ctaOut.push(rest); if (ctaOut.length >= 12) break; }

  // --- nav
  const nav = []; const seenN = new Set(); const ctaSet = new Set(ctaOut.map((c) => c.text.toLowerCase()));
  for (const a of document.querySelectorAll('header a, nav a, [role=navigation] a, [role=banner] a, header button, nav button')) {
    if (!isVis(a)) continue; const r = a.getBoundingClientRect(); if (r.top + SY > 180) continue;
    const t = collapse(clean(a.innerText)); if (t.length < 2 || t.length > 26 || /^(menu|search|close|open|toggle)/i.test(t) || seenN.has(t.toLowerCase()) || ctaSet.has(t.toLowerCase())) continue;
    seenN.add(t.toLowerCase()); nav.push(t); if (nav.length >= 14) break;
  }

  // --- links colour
  const linkHist = {};
  for (const a of document.querySelectorAll('a[href]')) {
    if (!isVis(a) || a.closest('button,[role=button]') || isBtnCls.test(cls(a))) continue;
    const c = col(getComputedStyle(a).color); if (!c) continue;
    const w = (a.closest('p,li,article,main') ? 3 : 1) * Math.min(txt(a).length, 40); linkHist[c.hex] = (linkHist[c.hex] || 0) + w;
  }
  const link = Object.entries(linkHist).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // --- backgrounds (area weighted, minus opaque children)
  const infos = new Map();
  const consider = [document.documentElement, document.body, ...all];
  for (const e of consider) {
    if (!e || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect(); let w = Math.min(r.right, W) - Math.max(r.left, 0), h = r.height;
    const isRoot = e === document.documentElement || e === document.body;
    if (isRoot) { w = W; h = docH; }
    if (w < 8 || h < 8) continue;
    const bg = col(cs.backgroundColor); const grad = cs.backgroundImage && cs.backgroundImage !== 'none' ? colsIn(cs.backgroundImage) : [];
    if ((!bg || bg.a < 0.04) && !grad.length) continue;
    infos.set(e, { bg: bg && bg.a >= 0.04 ? bg : null, grad, area: w * Math.min(h, docH), opaque: !!bg && bg.a > 0.9 });
  }
  const bgW = new Map();
  for (const [e, i] of infos) {
    let own = i.area; for (const c of e.children) { const ci = infos.get(c); if (ci && ci.opaque) own -= ci.area; }
    own = Math.max(own, 0);
    if (i.bg) bgW.set(i.bg.hex, (bgW.get(i.bg.hex) || 0) + own * i.bg.a);
    if (i.grad.length) for (const g of i.grad) bgW.set(g, (bgW.get(g) || 0) + own * 0.25 / i.grad.length);
  }

  // --- CSS variables, @font-face, blocked sheets
  const faces = [], blocked = [], varNames = new Set();
  const walk = (sheet, depth) => {
    let rules; try { rules = sheet.cssRules; } catch (x) { if (sheet.href) blocked.push(sheet.href); return; }
    const base = sheet.href || document.baseURI;
    for (const r of rules) {
      if (r.type === 3 && r.styleSheet && depth < 3) walk(r.styleSheet, depth + 1);
      else if (r.type === 5) {
        const s = r.style, src = s.getPropertyValue('src'); const urls = [];
        for (const m of src.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)(?:\s*format\(\s*["']?([\w-]+)["']?\s*\))?/g)) { try { urls.push({ url: m[2].startsWith('data:') ? m[2] : new URL(m[2], base).href, format: m[3] || null }); } catch (x) {} }
        faces.push({ family: clean(s.getPropertyValue('font-family')).replace(/^["']|["']$/g, ''), weight: s.getPropertyValue('font-weight') || '400', style: s.getPropertyValue('font-style') || 'normal', range: s.getPropertyValue('unicode-range') || null, urls });
      } else if (r.cssRules && r.cssRules.length && r.type !== 1) { for (const rr of r.cssRules) { if (rr.type === 5) walk({ cssRules: [rr], href: sheet.href }, depth + 1); } }
      else if (r.type === 1 && /^(:root|html|body|\*|:host)\b/.test(r.selectorText || '')) { for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) varNames.add(r.style[i]); }
    }
  };
  for (const s of document.styleSheets) walk(s, 0);
  const rootCs = getComputedStyle(document.documentElement); const cssVars = [];
  for (const n of varNames) {
    const v = rootCs.getPropertyValue(n).trim(); if (!v || v.length > 90 || /^[\d.]+(px|rem|em|%|s|ms)?$/.test(v)) continue;
    if (!/^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(v)) continue;
    const c = col(v); if (c && c.a > 0.3) cssVars.push({ name: n, value: v, hex: c.hex });
  }

  // --- fonts per role
  const fontOf = (e) => { if (!e) return null; const cs = getComputedStyle(e); return { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, style: cs.fontStyle, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight, textTransform: cs.textTransform, color: (col(cs.color) || {}).hex }; };
  const q1 = (s) => [...document.querySelectorAll(s)].find(isVis) || null;
  const firstP = [...document.querySelectorAll('p')].find((p) => isVis(p) && txt(p).length > 40);
  const fonts = { h1: fontOf(q1('h1') || heroEl), h2: fontOf(q1('h2')), body: fontOf(firstP || document.body), button: fontOf(ctaEls[0]), nav: fontOf([...document.querySelectorAll('nav a, header a')].find(isVis)) };
  const loaded = [...document.fonts].map((f) => ({ family: clean(f.family).replace(/^["']|["']$/g, ''), weight: f.weight, style: f.style, status: f.status }));

  // --- logo
  const logoRe = /logo|brand|wordmark|logotype|site-title|navbar-brand|masthead/i;
  const badRe = /arrow|chevron|caret|menu|search|close|hamburger|burger|social|twitter|facebook|linkedin|github|youtube|instagram|tiktok|spinner|check|star|play|avatar|flag|payment|visa|mastercard/i;
  const attrs = (e) => [e.id, cls(e), e.getAttribute('aria-label'), e.getAttribute('alt'), e.getAttribute('title'), e.getAttribute('src'), e.getAttribute('data-testid'), e.getAttribute('name')].join(' ');
  const isHome = (a) => { try { const u = new URL(a.href, location.href); return u.origin === location.origin && (u.pathname === '/' || /^\/(index|home)(\.html?)?\/?$/i.test(u.pathname) || /^\/[a-z]{2}([-_][a-z]{2})?\/?$/i.test(u.pathname)); } catch (x) { return false; } };
  const STY = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'fill-rule', 'clip-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'color'];
  const GFX = /^(svg|g|path|circle|rect|ellipse|line|polyline|polygon|text|tspan|use)$/i;
  const styled = (el) => {
    const c = el.cloneNode(true), o = [el, ...el.querySelectorAll('*')], n = [c, ...c.querySelectorAll('*')];
    o.forEach((e, i) => {
      const t = n[i]; if (!t.style) return; const cs = getComputedStyle(e);
      if (cs.display === 'none' && !/^(defs|symbol|clippath|mask|lineargradient|radialgradient|pattern|filter)$/i.test(e.tagName)) { t.setAttribute('display', 'none'); return; }
      if (GFX.test(e.tagName)) for (const p of STY) { const v = cs.getPropertyValue(p); if (v) t.style.setProperty(p, v); }
      if (e.tagName.toLowerCase() === 'text' || e.tagName.toLowerCase() === 'tspan') for (const p of ['font-family', 'font-size', 'font-weight', 'letter-spacing']) t.style.setProperty(p, cs.getPropertyValue(p));
      t.removeAttribute('class'); t.removeAttribute('data-testid');
      for (const a of [...t.attributes]) if (/^on/i.test(a.name)) t.removeAttribute(a.name);
    });
    return c;
  };
  const refIds = (clone) => { const ids = new Set(); for (const e of [clone, ...clone.querySelectorAll('*')]) { const blob = (e.getAttribute('style') || '') + ' ' + ['fill', 'stroke', 'clip-path', 'mask', 'filter'].map((a) => e.getAttribute(a) || '').join(' '); for (const m of blob.matchAll(/url\(\s*["']?#([^)"'\s]+)/g)) ids.add(m[1]); const h = e.getAttribute('href') || e.getAttribute('xlink:href'); if (h && h[0] === '#') ids.add(h.slice(1)); } return ids; };
  const withRefs = (clone) => { // pull in gradients / clipPaths / symbols that live outside the clone
    const have = new Set([...clone.querySelectorAll('[id]')].map((x) => x.id)); let defs = null;
    for (let round = 0; round < 6; round++) {
      const miss = [...refIds(clone)].filter((i) => !have.has(i)); if (!miss.length) break;
      for (const id of miss) { have.add(id); const t = document.getElementById(id); if (!t) continue; if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); clone.insertBefore(defs, clone.firstChild); } const rc = t.cloneNode(true); rc.querySelectorAll('[class]').forEach((x) => x.removeAttribute('class')); defs.appendChild(rc); }
    }
    return clone;
  };
  const svgString = (svg) => {
    const r = svg.getBoundingClientRect(); let c = withRefs(styled(svg));
    if (!c.getAttribute('viewBox')) { let vb = null; try { const b = svg.getBBox(); if (b.width && b.height) vb = [b.x, b.y, b.width, b.height].map((v) => +v.toFixed(2)).join(' '); } catch (x) {} c.setAttribute('viewBox', vb || `0 0 ${parseFloat(svg.getAttribute('width')) || r.width} ${parseFloat(svg.getAttribute('height')) || r.height}`); }
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    c.setAttribute('width', Math.round(r.width * 100) / 100); c.setAttribute('height', Math.round(r.height * 100) / 100);
    c.querySelectorAll('script').forEach((s) => s.remove());
    return new XMLSerializer().serializeToString(c);
  };
  const fillsOf = (svg) => { const s = new Set(); for (const e of svg.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,text,use')) { const cs = getComputedStyle(e); if (e.tagName.toLowerCase() === 'use') { const h = (e.getAttribute('href') || e.getAttribute('xlink:href') || '').slice(1); const t = h && document.getElementById(h); if (t && (t.getAttribute('fill') === 'currentColor' || t.querySelector('[fill=currentColor],[stroke=currentColor]'))) { const c = col(cs.color); if (c && c.a > 0.3) s.add(c.hex); continue; } } for (const p of [cs.fill, cs.stroke]) { const c = col(p); if (c && c.a > 0.3) s.add(c.hex); } } const rc = col(getComputedStyle(svg).fill); if (!s.size && rc) s.add(rc.hex); return [...s]; };
  const groups = new Map();
  for (const e of document.querySelectorAll('svg, img, [class*=logo i], [id*=logo i], [class*=brand i]')) {
    const tag = e.tagName.toLowerCase();
    if (tag === 'svg' && e.closest('svg') !== e) continue;
    if (!isVis(e)) continue;
    const r = e.getBoundingClientRect(); const top = r.top + SY;
    let bgUrl = null;
    if (tag !== 'svg' && tag !== 'img') { const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(e).backgroundImage || ''); if (!m || !logoRe.test(attrs(e))) continue; bgUrl = new URL(m[1], location.href).href; }
    if (r.width < 8 || r.height < 8) continue;
    let s = 0; const why = [];
    let anc = e; for (let i = 0; i < 4 && anc && anc !== document.body; i++) { if (logoRe.test(attrs(anc))) { s += 5; why.push('logo-attr'); break; } anc = anc.parentElement; }
    if (tag === 'svg') { const t = e.querySelector('title'); if (t && /logo/i.test(t.textContent)) { s += 4; why.push('svg-title'); } }
    const a = e.closest('a'); if (a && isHome(a)) { s += 4; why.push('home-link'); }
    if (e.closest('header,nav,[role=banner]')) { s += 3; why.push('header'); }
    if (top < 160) { s += 2; why.push('top'); }
    if (r.width >= 20 && r.width <= 420 && r.height >= 12 && r.height <= 140) s += 2; else if (r.width > 700 || r.height > 240) s -= 6;
    if (e.closest('button,[role=button]') && !why.includes('logo-attr')) s -= 4;
    let pa = e, bad = false; for (let i = 0; i < 3 && pa; i++) { if (badRe.test(attrs(pa)) && !logoRe.test(attrs(pa))) bad = true; pa = pa.parentElement; } if (bad) s -= 6;
    if (e.closest('footer')) s -= 3;
    if (top > 900) s -= 3;
    if (s <= 2) continue;
    const container = (a && (isHome(a) || logoRe.test(attrs(a)))) ? a : (anc && anc !== document.body && logoRe.test(attrs(anc)) ? anc : e);
    const g = groups.get(container) || { score: 0, why: new Set(), members: [], el: container };
    g.score = Math.max(g.score, s) + (g.members.length ? 1 : 0); why.forEach((w) => g.why.add(w));
    g.members.push({ el: e, tag, bgUrl, s });
    groups.set(container, g);
  }
  const glist = [...groups.values()].sort((a, b) => b.score - a.score).slice(0, 4).map((g) => {
    const members = g.members.map((m) => {
      const r = doc(m.el); const o = { tag: m.tag, rect: r, score: m.s };
      if (m.tag === 'svg') { try { o.svg = svgString(m.el); o.fills = fillsOf(m.el); } catch (x) { o.err = String(x); } }
      else if (m.tag === 'img') { o.src = m.el.currentSrc || m.el.src; o.alt = m.el.alt || null; o.natural = [m.el.naturalWidth, m.el.naturalHeight]; }
      else o.src = m.bgUrl;
      return o;
    });
    const lab = [g.el, ...g.members.map((m) => m.el)].map((e) => clean(e.getAttribute('aria-label') || e.getAttribute('alt') || e.getAttribute('title') || (e.querySelector && e.querySelector('title') ? e.querySelector('title').textContent : ''))).find((x) => x && !/^logo$/i.test(x));
    const out = { score: g.score, why: [...g.why], rect: doc(g.el), members, label: lab ? clean(lab.replace(/\b(logo|home(page)?|go to|link|wordmark)\b/gi, '')) : null };
    const svgs = members.filter((m) => m.svg);
    if (svgs.length > 1 && svgs.length === members.length) { // lockup: nested svgs positioned in the container box
      const R = out.rect; const parts = svgs.map((m) => { const d = new DOMParser().parseFromString(m.svg, 'image/svg+xml').documentElement; d.setAttribute('x', m.rect.x - R.x); d.setAttribute('y', m.rect.y - R.y); return new XMLSerializer().serializeToString(d); });
      out.lockup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${R.w} ${R.h}" width="${R.w}" height="${R.h}">${parts.join('')}</svg>`;
    }
    const home = g.el.closest && g.el.closest('a'); const t = home ? clean(home.innerText) : '';
    if (!members.length && t) out.text = t;
    return out;
  });
  // text-only logo (home link with text, no svg/img)
  let textLogo = null;
  const hl = [...document.querySelectorAll('a[href]')].find((a) => isHome(a) && isVis(a) && a.getBoundingClientRect().top + SY < 200 && clean(a.innerText).length > 1 && !a.querySelector('svg,img'));
  if (hl) { const cs = getComputedStyle(hl); textLogo = { text: clean(hl.innerText), font: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, color: (col(cs.color) || {}).hex }; }

  // --- icons / social images
  const icons = [...document.querySelectorAll('link[rel*=icon i], link[rel=mask-icon i]')].map((l) => ({ rel: l.rel, href: l.href, sizes: l.getAttribute('sizes'), type: l.type || null })).filter((i) => i.href);
  const manifest = (document.querySelector('link[rel=manifest]') || {}).href || null;
  const ogImage = meta('meta[property="og:image"]') ? new URL(meta('meta[property="og:image"]'), location.href).href : null;

  // --- large media
  const media = []; const seenM = new Set();
  for (const e of document.querySelectorAll('img, video, canvas, picture img')) {
    if (!isVis(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 500 || r.height < 140) continue;
    if (e.closest('header,nav,footer')) continue;
    const src = e.currentSrc || e.src || e.poster || ''; const k = src || (e.tagName + Math.round(r.width) + Math.round(r.height) + Math.round(r.top + SY)); if (seenM.has(k)) continue; seenM.add(k);
    const d = doc(e); media.push({ kind: e.tagName.toLowerCase(), src: src || null, alt: e.alt || null, rect: d, area: d.w * d.h });
  }
  media.sort((a, b) => b.area - a.area);

  return {
    finalUrl: location.href, lang: document.documentElement.lang || null, title, nameMeta, titleParts, description, themeColorMeta: meta('meta[name="theme-color"]'), colorScheme: meta('meta[name="color-scheme"]'),
    h1, h2, h3, heroLine, heroInk, sentences, ctas: ctaOut, nav, link, bgW: [...bgW].sort((a, b) => b[1] - a[1]).slice(0, 24), txtCol: [...txtCol].map(([h, o]) => [h, o.w]).sort((a, b) => b[1] - a[1]).slice(0, 12),
    faces, blocked, cssVars, fonts, loaded, fam: Object.entries(fam).sort((a, b) => b[1] - a[1]).slice(0, 8), logoGroups: glist, textLogo, icons, manifest, ogImage, media: media.slice(0, 14), docH, W, H,
  };
}

// Hide everything except one media element (and its contents) so fixed navs / hero text on top of it are not captured with it.
function pageIsolate(rect, kind, src) {
  const cands = [...document.querySelectorAll(kind === 'img' ? 'img' : kind)];
  const el = cands.find((e) => (src ? (e.currentSrc || e.src || e.poster) === src : false)) || cands.find((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.width - rect.w) < 3 && Math.abs(r.height - rect.h) < 3 && Math.abs(r.top + scrollY - rect.y) < 6; });
  if (!el) return false;
  document.querySelectorAll('[data-md-el],[data-md-anc]').forEach((n) => { n.removeAttribute('data-md-el'); n.removeAttribute('data-md-anc'); });
  el.setAttribute('data-md-el', '1'); for (let p = el.parentElement; p; p = p.parentElement) p.setAttribute('data-md-anc', '1');
  const st = document.createElement('style'); st.id = '__md_iso';
  st.textContent = 'html *:not([data-md-anc]):not([data-md-el]):not([data-md-el] *){visibility:hidden!important}[data-md-anc]{background-image:none!important;box-shadow:none!important}';
  document.head.appendChild(st);
  return true;
}

// Per image: luma std-dev (blank test), top-8% luma strip (nav match) and the saturated dominant colours. Runs in a scratch page.
async function pageImageStats(items) {
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true }); const res = [];
  for (const it of items) {
    const img = new Image(); img.src = it.url; await img.decode();
    const w = Math.min(640, img.width), h = Math.max(8, Math.round(w * img.height / img.width)); cv.width = w; cv.height = h; cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, N = w * h;
    let sum = 0, sq = 0; const lumArr = new Float32Array(N);
    const bk = new Map(); let satN = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i], g = d[i + 1], b = d[i + 2]; const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; lumArr[p] = L; sum += L; sq += L * L;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn >= 45 && (mx - mn) / mx >= 0.45 && mx >= 100) { satN++; const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); let e = bk.get(k); if (!e) { e = [0, 0, 0, 0]; bk.set(k, e); } e[0]++; e[1] += r; e[2] += g; e[3] += b; }
    }
    const mean = sum / N, std = Math.sqrt(Math.max(0, sq / N - mean * mean));
    // top 8% strip, 96 columns x 8 rows, area-averaged
    const sh = Math.max(1, Math.round(h * 0.08)), strip = [];
    for (let ry = 0; ry < 8; ry++) for (let cxn = 0; cxn < 96; cxn++) {
      const x0 = Math.floor(cxn * w / 96), x1 = Math.max(x0 + 1, Math.floor((cxn + 1) * w / 96)), y0 = Math.floor(ry * sh / 8), y1 = Math.max(y0 + 1, Math.floor((ry + 1) * sh / 8));
      let t = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t += lumArr[y * w + x]; n++; } strip.push(Math.round(t / n));
    }
    const list = [...bk.values()].map((e) => ({ n: e[0], r: e[1] / e[0], g: e[2] / e[0], b: e[3] / e[0] })).sort((a, b) => b.n - a.n);
    const cl = [];   // cluster buckets; the cluster colour is its purest member (n x chroma^2), not the dull mean of antialiased edges
    for (const e of list) {
      const ch = Math.max(e.r, e.g, e.b) - Math.min(e.r, e.g, e.b), sc = e.n * ch * ch;
      const c = cl.find((c) => Math.hypot(c.r - e.r, c.g - e.g, c.b - e.b) < 48);
      if (c) { c.n += e.n; if (sc > c.sc) { c.sc = sc; c.r = e.r; c.g = e.g; c.b = e.b; } } else if (cl.length < 40) cl.push({ ...e, sc });
    }
    res.push({ file: it.file, w: img.width, h: img.height, std: +std.toFixed(2), mean: +mean.toFixed(1), strip, satShare: satN / N, sat: cl.sort((a, b) => b.n - a.n).slice(0, 4).map((c) => ({ rgb: [Math.round(c.r), Math.round(c.g), Math.round(c.b)], n: c.n, share: c.n / N })) });
  }
  return res;
}

async function pagePixels(urls) {
  const buckets = new Map(); let total = 0;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
  for (const u of urls) {
    const img = new Image(); img.src = u; await img.decode();
    const w = 240, h = Math.max(1, Math.round(240 * img.height / img.width)); cv.width = w; cv.height = h; cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < d.length; i += 4) { const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3); let e = buckets.get(k); if (!e) { e = [0, 0, 0, 0]; buckets.set(k, e); } e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2]; total++; }
  }
  const list = [...buckets.values()].map((e) => ({ n: e[0], r: e[1] / e[0], g: e[2] / e[0], b: e[3] / e[0] })).sort((a, b) => b.n - a.n);
  const cl = [];
  for (const e of list) { const c = cl.find((c) => Math.hypot(c.r - e.r, c.g - e.g, c.b - e.b) < 24); if (c) { const t = c.n + e.n; c.r = (c.r * c.n + e.r * e.n) / t; c.g = (c.g * c.n + e.g * e.n) / t; c.b = (c.b * c.n + e.b * e.n) / t; c.n = t; } else if (cl.length < 60) cl.push({ ...e }); }
  return cl.sort((a, b) => b.n - a.n).slice(0, 16).map((c) => ({ rgb: [Math.round(c.r), Math.round(c.g), Math.round(c.b)], share: c.n / total }));
}

// ====================================================================== node-side helpers
const UA_HDR = (ref) => ({ 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', accept: '*/*', ...(ref ? { referer: ref } : {}) });
async function fetchBuf(u, ref, max = 12e6) {
  if (u.startsWith('data:')) { const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(u); if (!m) throw new Error('bad data uri'); return { buf: m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])), type: m[1] }; }
  const r = await fetch(u, { headers: UA_HDR(ref), signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ab = Buffer.from(await r.arrayBuffer()); if (ab.length > max) throw new Error('too large');
  return { buf: ab, type: (r.headers.get('content-type') || '').split(';')[0] };
}
const slug = (s) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const extOf = (u, type, buf) => {
  if (buf && buf.slice(0, 4).toString() === 'wOF2') return 'woff2'; if (buf && buf.slice(0, 4).toString() === 'wOFF') return 'woff';
  if (buf && buf.slice(0, 4).toString('hex') === '00010000') return 'ttf'; if (buf && buf.slice(0, 4).toString() === 'OTTO') return 'otf';
  if (buf && buf.slice(0, 5).toString().toLowerCase() === '<?xml' || buf && /<svg/i.test(buf.slice(0, 400).toString())) return 'svg';
  if (buf && buf[0] === 0x89 && buf[1] === 0x50) return 'png'; if (buf && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'; if (buf && buf.slice(0, 4).toString() === 'RIFF') return 'webp'; if (buf && buf.slice(0, 3).toString() === 'GIF') return 'gif';
  if (buf && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) return 'ico';
  const m = /\.(woff2|woff|ttf|otf|svg|png|jpe?g|webp|gif|ico|avif)(?:[?#]|$)/i.exec(u || ''); if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return ({ 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' })[type] || 'bin';
};
const generic = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|emoji|math|fangsong|inherit|initial)$/i;
const firstFamily = (stack) => { for (const f of (stack || '').split(',')) { const n = f.trim().replace(/^["']|["']$/g, ''); if (n && !generic.test(n)) return n; } return null; };
const normFam = (s) => String(s || '').toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim();
const wnum = (w) => { const n = parseFloat(String(w).split(' ')[0]); return Number.isFinite(n) ? n : (w === 'bold' ? 700 : 400); };
const wcover = (w, want) => { const p = String(w).trim().split(/\s+/).map(wnum); return p.length > 1 ? (want >= p[0] && want <= p[1] ? 0 : Math.min(Math.abs(want - p[0]), Math.abs(want - p[1]))) : Math.abs(p[0] - want); };
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026' : s; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ====================================================================== main
(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const d of ['logo', 'fonts', 'screens', 'media']) fs.mkdirSync(path.join(out, d), { recursive: true });
  const br = await launchChrome({ width: 1920, height: 1080 });
  try { await run(br); } finally { await br.close(); }
})().catch((e) => { console.error('error: ' + e.message); process.exit(1); });

async function run(br) {
  const page = await br.newPage({ width: 1920, height: 1080 });
  const ua = (await br.cdp.send('Browser.getVersion')).userAgent.replace('HeadlessChrome', 'Chrome');
  await page.send('Network.enable');
  await page.send('Network.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en;q=0.9' });
  const fontReqs = new Map(); let inflight = 0;
  page.on('Network.requestWillBeSent', () => { inflight++; });
  page.on('Network.loadingFinished', () => { inflight = Math.max(0, inflight - 1); });
  page.on('Network.loadingFailed', () => { inflight = Math.max(0, inflight - 1); });
  page.on('Network.responseReceived', (p) => { if (p.type === 'Font') fontReqs.set(p.response.url, p.response.mimeType); });
  page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}));
  const idle = async (max = 5000) => { const t0 = Date.now(); let quiet = 0; while (Date.now() - t0 < max) { quiet = inflight <= 2 ? quiet + 150 : 0; if (quiet >= 700) return true; await sleep(150); } return false; };

  console.error(`loading ${startUrl} ...`);
  let loaded;
  try { loaded = await page.goto(startUrl, { timeout: 35000 }); } catch (e) { die(e.message); }
  if (!loaded) warn('load event did not fire in 35s; continuing with what rendered');
  await idle(6000); await sleep(1200);
  const clicked = await page.eval(`(${pageDismiss})()`).catch(() => null);
  if (clicked) { console.error('cookie banner dismissed: ' + clicked); await sleep(600); }
  const docH = await page.eval(`(${pageScroll})()`, { timeout: 90000 }).catch((e) => { warn('scroll step failed: ' + e.message); return 3000; });
  await idle(4000);
  await page.eval(`(${pageDismiss})()`).catch(() => {});
  await sleep(600);

  const X = await page.eval(`(${pageExtract})()`, { timeout: 90000 });
  if (!X || (!X.h1.length && !X.h2.length && !X.title)) warn('page looks empty (blocked or JS-only?)');
  const origin = new URL(X.finalUrl).origin;
  const hostLabel = (() => { try { const h = new URL(X.finalUrl).hostname.replace(/^www\./, '').split('.'); return (h.length > 1 ? h[h.length - 2] : h[0]).toLowerCase(); } catch { return ''; } })();
  const nk = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lab = (X.logoGroups.find((g) => g.label) || {}).label;
  X.name = X.nameMeta || X.titleParts.find((p) => hostLabel.length > 2 && (nk(p).includes(hostLabel) || hostLabel.includes(nk(p)))) || (lab && X.titleParts.find((p) => nk(p) === nk(lab) || nk(p).includes(nk(lab)))) || (lab && lab.length < 30 ? lab : null) || (X.titleParts[0] && X.titleParts[0].length <= 28 ? X.titleParts[0] : [...X.titleParts].sort((a, b) => a.length - b.length)[0]) || (hostLabel ? hostLabel[0].toUpperCase() + hostLabel.slice(1) : null);
  console.error(`extracted: "${X.name}" docH=${docH} h1=${X.h1.length} ctas=${X.ctas.length} logoGroups=${X.logoGroups.length}`);

  // ---------------------------------------------------------- screenshots
  const screens = [];
  const vh = 1080, maxY = Math.max(0, docH - vh);
  const nShots = Math.min(5, Math.max(0, Math.ceil(docH / vh) - 1));
  const ys = [0]; for (let i = 1; i <= Math.max(nShots, Math.min(3, nShots)); i++) ys.push(Math.round((maxY * i) / nShots));
  for (let i = 0; i < ys.length; i++) {
    await page.eval(`scrollTo(0, ${ys[i]})`); await sleep(i === 0 ? 900 : 750);
    const f = `screens/${String(i + 1).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(out, f), await page.shot({ format: 'jpeg', quality: 86 }));
    screens.push({ file: f, scrollY: ys[i] });
  }
  if (screens.length < 4) warn(`page is short (${docH}px): only ${screens.length} screenshots`);

  // ---------------------------------------------------------- media element screenshots
  const mediaOut = []; let mi = 0;
  for (const m of X.media) {
    if (mi >= 6) break;
    const r = m.rect; const clip = { x: Math.max(0, r.x), y: r.y, width: Math.min(r.w, 1920), height: Math.min(r.h, 1400), scale: 1 };
    try {
      await page.eval(`scrollTo(0, ${Math.max(0, r.y - 100)})`); await sleep(500);
      const f = `media/${String(++mi).padStart(2, '0')}.jpg`;
      const isolated = process.env.BRAND_NO_ISOLATE ? false : await page.eval(`(${pageIsolate})(${JSON.stringify(m.rect)}, ${JSON.stringify(m.kind)}, ${JSON.stringify(m.src)})`).catch(() => false);
      if (isolated) await sleep(120);
      try { fs.writeFileSync(path.join(out, f), await page.shot({ format: 'jpeg', quality: 88, clip, beyond: true })); }
      finally { if (isolated) await page.eval('(() => { const s = document.getElementById("__md_iso"); if (s) s.remove(); document.querySelectorAll("[data-md-el],[data-md-anc]").forEach((n) => { n.removeAttribute("data-md-el"); n.removeAttribute("data-md-anc"); }); })()').catch(() => {}); }
      mediaOut.push({ file: f, kind: m.kind, src: m.src, alt: m.alt, w: r.w, h: r.h });
    } catch (e) { warn(`media screenshot failed (${m.src || m.kind}): ${e.message}`); mi--; }
  }
  await page.eval('scrollTo(0,0)');

  // ---------------------------------------------------------- logo
  const logo = { file: null, kind: null, source: null, fills: [], onDark: null, favicon: null, appIcon: null, text: X.textLogo, candidates: [] };
  X.logoGroups.forEach((g) => logo.candidates.push({ score: g.score, why: g.why, members: g.members.map((m) => `${m.tag} ${m.rect.w}x${m.rect.h} ${m.src || ''}`.trim()), lockup: !!g.lockup }));
  const saveLogo = (buf, ext, source, kind) => { for (const f of fs.readdirSync(path.join(out, 'logo'))) if (/^logo\./.test(f)) fs.unlinkSync(path.join(out, 'logo', f)); logo.file = `logo/logo.${ext}`; logo.kind = kind; logo.source = source; fs.writeFileSync(path.join(out, logo.file), buf); };
  for (const g of X.logoGroups) {
    if (logo.file) break;
    try {
      if (g.lockup) { saveLogo(g.lockup, 'svg', 'inline svg lockup (' + g.why.join(',') + ')', 'svg'); logo.fills = [...new Set(g.members.flatMap((m) => m.fills || []))]; break; }
      const svg = g.members.filter((m) => m.svg).sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
      if (svg) { saveLogo(svg.svg, 'svg', 'inline svg (' + g.why.join(',') + ')', 'svg'); logo.fills = svg.fills || []; break; }
      const img = g.members.filter((m) => m.src).sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0];
      if (img) {
        try { const { buf, type } = await fetchBuf(img.src, X.finalUrl); const ext = extOf(img.src, type, buf); if (ext === 'bin' || ext === 'ico') throw new Error('unusable type ' + type); saveLogo(buf, ext, 'img ' + img.src, ext === 'svg' ? 'svg' : 'raster'); break; }
        catch (e) { // fall back to an element screenshot
          const r = g.rect; saveLogo(await page.shot({ format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 2 }, beyond: true }), 'png', `screenshot of ${img.src} (download failed: ${e.message})`, 'raster'); break;
        }
      }
    } catch (e) { warn('logo candidate failed: ' + e.message); }
  }
  // icons
  const best = (arr) => arr.sort((a, b) => (parseInt((b.sizes || '0').split('x')[0]) || 0) - (parseInt((a.sizes || '0').split('x')[0]) || 0));
  const apple = best(X.icons.filter((i) => /apple-touch/i.test(i.rel)))[0];
  const fav = X.icons.find((i) => /svg/.test(i.type || '') || /\.svg(\?|$)/i.test(i.href)) || best(X.icons.filter((i) => !/apple|mask/i.test(i.rel)))[0] || (origin !== 'null' ? { href: origin + '/favicon.ico' } : null);
  for (const [item, name, key] of [[fav, 'favicon', 'favicon'], [apple, 'app-icon', 'appIcon']]) {
    if (!item) continue;
    try { const { buf, type } = await fetchBuf(item.href, X.finalUrl, 3e6); const ext = extOf(item.href, type, buf); if (ext === 'bin') throw new Error('unknown type'); const f = `logo/${name}.${ext}`; fs.writeFileSync(path.join(out, f), buf); logo[key] = f; } catch (e) { warn(`${name} fetch failed (${item.href}): ${e.message}`); }
  }
  if (!logo.file) {
    const fb = logo.appIcon || logo.favicon;
    if (fb) { const ext = fb.split('.').pop(); fs.copyFileSync(path.join(out, fb), path.join(out, `logo/logo.${ext}`)); logo.file = `logo/logo.${ext}`; logo.kind = ext === 'svg' ? 'svg' : 'raster'; logo.source = 'FALLBACK: ' + fb + ' (no page logo found)'; warn('no logo found in page; used icon as fallback'); }
    else warn('no logo found at all' + (X.textLogo ? ` (text wordmark "${X.textLogo.text}" in ${X.textLogo.font})` : ''));
  }
  if (logo.fills.length) { const ls = logo.fills.map(lum); logo.onDark = ls.reduce((a, b) => a + b, 0) / ls.length > 0.5; } // true = light mark meant for dark grounds
  // og:image + manifest
  let ogFile = null;
  if (X.ogImage) { try { const { buf, type } = await fetchBuf(X.ogImage, X.finalUrl, 8e6); ogFile = `media/og-image.${extOf(X.ogImage, type, buf)}`; fs.writeFileSync(path.join(out, ogFile), buf); } catch (e) { warn('og:image fetch failed: ' + e.message); } }
  let manifest = null;
  if (X.manifest) { try { const j = JSON.parse((await fetchBuf(X.manifest, X.finalUrl, 1e6)).buf.toString()); manifest = { name: j.name, short_name: j.short_name, theme_color: j.theme_color, background_color: j.background_color }; } catch (e) { /* optional */ } }

  // ---------------------------------------------------------- pixels (board + palette truth)
  const tool = await br.newPage({ width: 1920, height: 1000 });
  const shotUrls = screens.map((s) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(out, s.file)).toString('base64'));
  let px = [];
  try { px = (await tool.eval(`(${pagePixels})(${JSON.stringify(shotUrls)})`, { timeout: 60000 })).map((c) => ({ hex: rgb2hex(...c.rgb), share: c.share })); } catch (e) { warn('pixel analysis failed: ' + e.message); }

  // ---------------------------------------------------------- image hygiene (blank / nav screenshots) + imagery colours
  let imgStats = [];
  try {
    const items = [...screens, ...mediaOut].map((m) => ({ file: m.file, url: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(out, m.file)).toString('base64') }));
    imgStats = await tool.eval(`(${pageImageStats})(${JSON.stringify(items)})`, { timeout: 90000 });
  } catch (e) { warn('image analysis failed: ' + e.message); }
  const stat = new Map(imgStats.map((x) => [x.file, x]));
  const mediaDropped = [], mediaFlagged = [];
  {
    const keep = [];
    for (const m of mediaOut) {
      const st = stat.get(m.file);
      if (st && st.std < 3) { mediaDropped.push({ capturedAs: m.file, kind: m.kind, w: m.w, h: m.h, src: m.src, reason: `blank (pixel std-dev ${st.std})` }); warn(`dropped a blank ${m.kind} ${m.w}x${m.h} (captured as ${m.file}, pixel std-dev ${st.std}); media/ is renumbered`); try { fs.unlinkSync(path.join(out, m.file)); } catch {} stat.delete(m.file); }
      else keep.push({ m, st });
    }
    mediaOut.length = 0;
    keep.forEach(({ m, st }, i) => {          // renumber so media/ stays contiguous (new index <= old index, ascending: no collisions)
      const nf = `media/${String(i + 1).padStart(2, '0')}.jpg`;
      if (nf !== m.file) { fs.renameSync(path.join(out, m.file), path.join(out, nf)); stat.delete(m.file); if (st) stat.set(nf, { ...st, file: nf }); m.file = nf; }
      mediaOut.push(m);
    });
    for (const m of mediaOut) { const st = stat.get(m.file); if (st && st.std < 8 && st.mean < 40) { m.flag = `near-blank dark image (pixel std-dev ${st.std}, mean luma ${st.mean}): background art, not product media`; warn(`${m.file}: ${m.flag}`); } }
    const scr = screens.map((x) => stat.get(x.file)).filter(Boolean);
    // nav match: horizontal luma profile of the top 8% (rows averaged, so a few px of vertical offset or a top banner do not matter)
    const profile = (st) => Array.from({ length: 96 }, (_, c) => { let t = 0; for (let r = 0; r < 8; r++) t += st.strip[r * 96 + c]; return t / 8; });
    const sd = (a) => { const mu = a.reduce((p, q) => p + q, 0) / a.length; return Math.sqrt(a.reduce((p, q) => p + (q - mu) ** 2, 0) / a.length); };
    for (const m of mediaOut) {
      const st = stat.get(m.file); if (!st || m.flag || st.w < 0.8 * 1920) continue;     // the nav spans the full page width
      const a = profile(st), sa = sd(a); if (sa < 2.5) continue;
      for (const sc of scr) {
        const b = profile(sc), sb = sd(b); if (sb < 2.5) continue;
        const ma = a.reduce((p, q) => p + q, 0) / a.length, mb = b.reduce((p, q) => p + q, 0) / b.length;
        const corr = a.reduce((p, q, i) => p + (q - ma) * (b[i] - mb), 0) / (a.length * sa * sb);
        if (corr > 0.85) { m.flag = 'screenshot, not product media'; m.matchesScreen = sc.file; mediaFlagged.push(m.file); warn(`${m.file} contains the site nav (top 8% profile matches ${sc.file}, r=${corr.toFixed(2)}): screenshot, not product media`); break; }
      }
    }
  }
  // saturated dominant colours of the imagery (product media 1.0, page screenshots 0.7; blank/nav shots skipped)
  const imgAc = [];
  for (const f of [...screens.map((x) => [x.file, 0.7]), ...mediaOut.filter((m) => !m.flag).map((x) => [x.file, 1.0])]) {
    const st = stat.get(f[0]); if (!st) continue;
    for (const c of st.sat) {
      if (c.n < 6) continue; const hex = rgb2hex(...c.rgb);
      if (dist(hex, '#000000') < 60 || dist(hex, '#ffffff') < 60) continue;
      const hit = imgAc.find((x) => dist(x.hex, hex) < 40);
      const sc = c.share * f[1];
      if (hit) { hit.w += sc; if (sc > hit.best) { hit.best = sc; hit.file = f[0]; hit.share = c.share; } } else imgAc.push({ hex, w: sc, best: sc, file: f[0], share: c.share });
    }
  }
  imgAc.sort((a, b) => b.w - a.w);

  // ---------------------------------------------------------- colour roles
  const bgTot = X.bgW.reduce((s, [, w]) => s + w, 0) || 1, pxTot = px.reduce((s, c) => s + c.share, 0) || 1;
  const groundCands = [...X.bgW.map(([hex, w]) => ({ hex, w: (w / bgTot) * 0.5, src: ['dom'] })), ...px.map((c) => ({ hex: c.hex, w: (c.share / pxTot) * 0.5, src: ['pixels'] }))];
  const grounds = mergeColors(groundCands, 16).slice(0, 6);
  const primary = grounds[0] ? grounds[0].hex : '#ffffff';
  const groundOut = grounds.filter((g, i) => i === 0 || g.w > 0.05).slice(0, 3).map((g) => ({ hex: g.hex, share: +g.w.toFixed(3), sources: [...new Set(g.src)] }));
  const theme = contrast(primary, '#ffffff') > contrast(primary, '#000000') ? 'dark' : 'light';
  const txtTot = X.txtCol.reduce((s, [, w]) => s + w, 0) || 1;
  const textCl = mergeColors(X.txtCol.map(([hex, w]) => ({ hex, w: w / txtTot, src: ['text'] })), 14).filter((c) => contrast(c.hex, primary) >= 1.6);
  const topW = textCl.length ? textCl[0].w : 0;
  const inkPool = textCl.filter((c) => c.w >= topW * 0.25 && contrast(c.hex, primary) >= 3).sort((a, b) => contrast(b.hex, primary) - contrast(a.hex, primary));
  const bodyInk = inkPool[0] || textCl.filter((c) => contrast(c.hex, primary) >= 3)[0] || textCl[0] || { hex: theme === 'dark' ? '#ffffff' : '#000000', w: 0 };
  // ink = colour of the largest heading (headline / logo ink); body copy is "ink-soft"
  const hi = X.heroInk && X.heroInk.hex && contrast(X.heroInk.hex, primary) >= 3 ? X.heroInk : null;
  const ink = hi ? { hex: hi.hex, w: bodyInk.w } : bodyInk;
  const inkSource = hi ? `computed colour of the largest heading (${hi.source}${hi.text ? ' "' + hi.text + '"' : ''}, ${Math.round(hi.size)}px)` : 'most used text colour (no heading colour found)';
  const soft = textCl.find((c) => c.w >= topW * 0.4 && dist(c.hex, ink.hex) > 12 && contrast(c.hex, primary) >= 3 && !chromatic(c.hex)) || null;
  const muted = textCl.find((c) => !chromatic(c.hex) && dist(c.hex, ink.hex) > 20 && (!soft || dist(c.hex, soft.hex) > 14) && contrast(c.hex, primary) >= 2 && contrast(c.hex, primary) < contrast((soft || ink).hex, primary));
  const primaryCta = X.ctas.find((c) => c.inHero && c.filled && c.bg) || X.ctas.find((c) => c.filled && c.bg) || null;
  const ac = [];
  const add = (hex, w, src) => { if (hex) ac.push({ hex, w, src }); };
  if (primaryCta) add(primaryCta.bg, chromatic(primaryCta.bg) ? 100 : 30, 'CTA background');
  for (const c of X.ctas) if (c.filled && c.bg && chromatic(c.bg)) add(c.bg, 25, 'button');
  for (const v of X.cssVars) if (/(^|-)(brand|primary|accent)(-|$)/i.test(v.name) && !/text|bg|background|border|gray|grey|neutral|highlight|console|syntax|chart|code|shadow|ring|focus|selection/i.test(v.name)) add(v.hex, chromatic(v.hex) ? 60 : 5, 'css var ' + v.name);
  X.link.forEach(([hex, w], i) => { if (chromatic(hex) && hex !== '#0000ee') add(hex, i === 0 ? 45 : 15, 'link'); });
  for (const f of logo.fills) if (chromatic(f)) add(f, 55, 'logo');
  for (const [hex, w] of X.bgW) if (chromatic(hex)) add(hex, Math.min(40, (w / bgTot) * 400), 'background');
  for (const [hex, w] of X.txtCol) if (chromatic(hex)) add(hex, Math.min(30, (w / txtTot) * 120), 'text');
  for (const c of px) if (chromatic(c.hex)) add(c.hex, Math.min(60, c.share * 300), 'screenshot pixels');
  if (X.themeColorMeta) { const t = X.themeColorMeta; if (/^#[0-9a-f]{6}$/i.test(t) && chromatic(t.toLowerCase())) add(t.toLowerCase(), 20, 'meta theme-color'); }
  if (manifest && manifest.theme_color && /^#[0-9a-f]{6}$/i.test(manifest.theme_color) && chromatic(manifest.theme_color.toLowerCase())) add(manifest.theme_color.toLowerCase(), 20, 'manifest theme_color');
  const merged = mergeColors(ac.filter((a) => dist(a.hex, primary) > 30 && dist(a.hex, ink.hex) > 12 || a.src === 'CTA background'), 26);
  const corroborated = merged.filter((c) => c.src.some((x) => !/^css var/.test(x)));
  const accentsRaw = (corroborated.length ? corroborated : merged).filter((c) => c.w >= 10).slice(0, 4).map((c, i) => ({ hex: c.hex, role: i === 0 ? 'accent (primary)' : 'accent ' + (i + 1), score: Math.round(c.w), sources: [...new Set(c.src)] }));
  let accents = accentsRaw;
  const monochrome = !accents.some((a) => chromatic(a.hex) && a.score >= 25);
  if (monochrome) accents.forEach((a) => { if (!chromatic(a.hex)) a.role += ' [neutral]'; });
  if (!accents.length && primaryCta && primaryCta.bg) accents = [{ hex: primaryCta.bg, role: 'accent (neutral CTA colour)', score: 0, sources: ['CTA background'] }];
  const accentCandidates = imgAc.filter((c) => dist(c.hex, primary) > 40 && dist(c.hex, ink.hex) > 40).slice(0, 4).map((c) => ({ hex: c.hex, file: c.file, share: +c.share.toFixed(5), sharePct: +(c.share * 100).toFixed(2) }));
  const palette = [
    ...groundOut.map((g, i) => ({ hex: g.hex, role: i === 0 ? `ground (${theme} theme)` : `surface/ground ${i + 1}`, share: g.share })),
    { hex: ink.hex, role: hi ? 'ink (headline / logo ink)' : 'ink (main text)', contrast: +contrast(ink.hex, primary).toFixed(1) },
    ...(soft ? [{ hex: soft.hex, role: 'ink-soft (body copy)', contrast: +contrast(soft.hex, primary).toFixed(1) }] : []),
    ...(muted ? [{ hex: muted.hex, role: 'ink muted', contrast: +contrast(muted.hex, primary).toFixed(1) }] : []),
    ...accents.map((a) => ({ hex: a.hex, role: a.role, sources: a.sources })),
    ...(monochrome ? accentCandidates.map((a) => ({ hex: a.hex, role: 'accent candidate (from imagery)', sources: [`${a.file} ${a.sharePct}% of pixels`] })) : []),
  ];
  const seenH = new Set(); const paletteU = palette.filter((p) => !seenH.has(p.hex) && seenH.add(p.hex));

  // ---------------------------------------------------------- fonts
  const faces = X.faces.slice();
  for (const href of [...new Set(X.blocked)]) { // cross-origin stylesheets: parse @font-face from the css text
    try {
      const css = (await fetchBuf(href, X.finalUrl, 3e6)).buf.toString();
      for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const b = m[1], g = (p) => ((new RegExp(p + '\\s*:\\s*([^;]+)', 'i').exec(b)) || [])[1]; const urls = [];
        for (const u of (g('src') || '').matchAll(/url\(\s*(["']?)(.*?)\1\s*\)(?:\s*format\(\s*["']?([\w-]+)["']?\s*\))?/g)) { try { urls.push({ url: u[2].startsWith('data:') ? u[2] : new URL(u[2], href).href, format: u[3] || null }); } catch {} }
        faces.push({ family: (g('font-family') || '').trim().replace(/^["']|["']$/g, ''), weight: (g('font-weight') || '400').trim(), style: (g('font-style') || 'normal').trim(), range: (g('unicode-range') || null), urls });
      }
    } catch (e) { warn(`could not read stylesheet ${href}: ${e.message}`); }
  }
  const roles = { heading: X.fonts.h1 || X.fonts.h2, body: X.fonts.body, button: X.fonts.button, nav: X.fonts.nav };
  const want = new Map(); // family(norm) -> Set(weights)
  for (const f of Object.values(roles)) { if (!f) continue; const fam = firstFamily(f.family); if (!fam) continue; const k = normFam(fam); if (!want.has(k)) want.set(k, new Set()); want.get(k).add(wnum(f.weight)); }
  for (const [k, v] of X.fam.slice(0, 3).map(([fw]) => fw.split('|'))) { const nk = normFam(k); if (!want.has(nk)) want.set(nk, new Set()); want.get(nk).add(wnum(v)); }
  const pickUrl = (f) => (f.urls.find((u) => /woff2/i.test(u.format || u.url)) || f.urls.find((u) => /woff|ttf|otf|truetype|opentype/i.test((u.format || '') + u.url)) || f.urls[0] || {}).url;
  const latin = (f) => !f.range || /U\+0(000|020)|U\+00[0-9a-f]{2}-/i.test(f.range) || /U\+0000-00FF/i.test(f.range);
  const chosen = new Map();
  for (const f of faces) {
    const k = normFam(f.family); const u = pickUrl(f); if (!u) continue;
    const used = [...fontReqs.keys()].includes(u);
    const w = want.get(k);
    if (w && latin(f) && ([...w].some((x) => wcover(f.weight, x) < 1) || used)) chosen.set(u, { ...f, url: u, used });
    else if (used && !chosen.has(u)) chosen.set(u, { ...f, url: u, used });
  }
  for (const [u, mime] of fontReqs) if (!chosen.has(u) && chosen.size < 14) chosen.set(u, { family: null, weight: '400', style: 'normal', url: u, used: true, mime });
  const fontFiles = []; let fi = 0;
  for (const f of [...chosen.values()].slice(0, 14)) {
    try {
      const { buf, type } = await fetchBuf(f.url, X.finalUrl, 6e6); const ext = extOf(f.url, type, buf); if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) throw new Error('not a font (' + type + ')');
      const name = `${slug(f.family || path.basename(f.url.split('?')[0]).replace(/\.[a-z0-9]+$/i, ''))}-${slug(String(f.weight))}${/italic|oblique/.test(f.style) ? '-italic' : ''}${fi++ ? '' : ''}.${ext}`;
      let fn = name, n = 1; while (fs.existsSync(path.join(out, 'fonts', fn))) fn = name.replace(/(\.[a-z0-9]+)$/, `-${++n}$1`);
      fs.writeFileSync(path.join(out, 'fonts', fn), buf); fontFiles.push({ family: f.family, weight: f.weight, style: f.style, url: f.url.startsWith('data:') ? 'data-uri' : f.url, file: `fonts/${fn}`, bytes: buf.length, used: f.used, range: f.range });
    } catch (e) { warn(`font download failed (${f.url.slice(0, 80)}): ${e.message}`); }
  }
  // platform fonts actually used at h1/body (CDP)
  const platform = {};
  try {
    await page.send('DOM.enable'); await page.send('CSS.enable'); const doc = await page.send('DOM.getDocument', { depth: 0 });
    for (const [k, sel] of [['h1', 'h1'], ['body', 'p']]) { try { const n = await page.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel }); if (!n.nodeId) continue; const pf = await page.send('CSS.getPlatformFontsForNode', { nodeId: n.nodeId }); platform[k] = pf.fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount })); } catch {} }
  } catch {}
  const matchFile = (fontRole) => {
    if (!fontRole) return null; const fam = firstFamily(fontRole.family); if (!fam) return null; const k = normFam(fam), w = wnum(fontRole.weight);
    const it = /italic|oblique/.test(fontRole.style || ''); const c = fontFiles.filter((f) => f.family && normFam(f.family) === k && /^woff2?$|ttf|otf/.test(f.file.split('.').pop()) && (!f.range || latin(f)) && /italic|oblique/.test(f.style || '') === it); if (!c.length) return null;
    return c.sort((a, b) => wcover(a.weight, w) - wcover(b.weight, w) || (/woff2$/.test(a.file) ? -1 : 1))[0];
  };
  const fontsOut = {};
  for (const [role, f] of Object.entries(roles)) if (f) { const m = matchFile(f); fontsOut[role] = { ...f, primaryFamily: firstFamily(f.family) || f.family.split(',')[0].replace(/["']/g, '').trim(), file: m ? m.file : null, fileWeight: m ? m.weight : null }; }
  for (const r of ['heading', 'body']) if (fontsOut[r] && !fontsOut[r].file) warn(`${r} font "${fontsOut[r].primaryFamily}" has no downloadable file (system font or blocked)`);

  // ---------------------------------------------------------- brand.json
  const brand = {
    url: startUrl, finalUrl: X.finalUrl, capturedAt: new Date().toISOString(), viewport: { w: 1920, h: 1080 }, docHeight: docH,
    name: X.name, title: X.title, description: X.description, tagline: (X.h1[0] ? (X.h1[0].length <= 140 ? X.h1[0] : (X.h1[0].match(/^.{12,140}?[.!?](?=\s|$)/) || [null])[0]) : null) || (!X.h1.length ? X.heroLine : null) || (X.description || '').split(/(?<=[.!?])\s/)[0] || null,
    lang: X.lang, themeColorMeta: X.themeColorMeta, colorSchemeMeta: X.colorScheme, manifest,
    copy: { h1: X.h1, h2: X.h2, h3: X.h3, heroLine: X.heroLine, ctas: X.ctas, nav: X.nav, sentences: X.sentences },
    colors: { theme, monochrome, ground: groundOut, ink: { hex: ink.hex, contrastOnGround: +contrast(ink.hex, primary).toFixed(2), source: inkSource }, inkSoft: soft ? { hex: soft.hex, contrastOnGround: +contrast(soft.hex, primary).toFixed(2), note: 'body copy' } : null, accentCandidates: { note: monochrome ? 'no CSS/DOM accent: saturated dominant colours sampled from screens/ and media/ imagery' : 'saturated colours sampled from imagery (a CSS/DOM accent exists, these are extra)', items: accentCandidates }, inkMuted: muted ? { hex: muted.hex, contrastOnGround: +contrast(muted.hex, primary).toFixed(2) } : null, accents, ctaBg: primaryCta ? primaryCta.bg : null, link: (X.link.find(([h]) => h !== '#0000ee') || [null])[0], palette: paletteU, pixelPalette: px.slice(0, 10).map((c) => ({ hex: c.hex, share: +c.share.toFixed(3) })), domBackgrounds: X.bgW.slice(0, 10).map(([hex, w]) => ({ hex, share: +(w / bgTot).toFixed(3) })), textColors: X.txtCol.slice(0, 8).map(([hex, w]) => ({ hex, share: +(w / txtTot).toFixed(3) })), cssVars: X.cssVars.slice(0, 60) },
    fonts: { roles: fontsOut, faces: fontFiles, loadedByPage: X.loaded, mostUsed: X.fam.map(([k, w]) => ({ key: k, weight: Math.round(w) })), platformFonts: platform },
    logo, ogImage: ogFile, screens, media: mediaOut, mediaDropped, warnings,
  };
  fs.writeFileSync(path.join(out, 'brand.json'), JSON.stringify(brand, null, 1));

  // ---------------------------------------------------------- BRAND.md
  const L = [];
  L.push(`# ${brand.name || X.title || startUrl}`, '', `Source: ${X.finalUrl}  |  captured ${brand.capturedAt.slice(0, 10)}  |  theme: **${theme}**${monochrome ? ' (monochrome brand)' : ''}`, '');
  if (brand.tagline) L.push(`Tagline / hero: **${brand.tagline}**`, '');
  if (X.description) L.push(`Description: ${X.description}`, '');
  L.push('## Palette', '', '| hex | role | notes |', '|---|---|---|');
  for (const p of paletteU) L.push(`| \`${p.hex}\` | ${p.role} | ${p.share ? Math.round(p.share * 100) + '% of area' : p.contrast ? 'contrast ' + p.contrast + ':1 on ground' : (p.sources || []).join(', ')} |`);
  if (accentCandidates.length) L.push('', `Accent candidates (from imagery)${monochrome ? ' - the site has no CSS accent' : ''}: ` + accentCandidates.map((a) => `\`${a.hex}\` from ${a.file} (${a.sharePct}% of pixels)`).join(', '));
  if (X.cssVars.length) L.push('', 'Brand CSS variables: ' + X.cssVars.filter((v) => /brand|primary|accent|bg|background|text|fg/i.test(v.name)).slice(0, 10).map((v) => `${v.name}=${v.hex}`).join(', '));
  L.push('', '## Fonts', '');
  for (const [role, f] of Object.entries(fontsOut)) L.push(`- ${role}: **${f.primaryFamily || f.family}** weight ${f.weight}, ${f.size}${f.letterSpacing && f.letterSpacing !== 'normal' ? ', tracking ' + f.letterSpacing : ''}${f.file ? ` -> \`${f.file}\`` : ' (no file: system/fallback)'}`);
  if (fontFiles.length) L.push('', 'Downloaded: ' + fontFiles.map((f) => f.file).join(', '));
  L.push('', '## Logo', '', logo.file ? `- \`${logo.file}\` (${logo.source})${logo.fills.length ? ` fills: ${logo.fills.join(', ')}${logo.onDark ? ' (light mark: place on dark ground)' : ' (dark mark: place on light ground)'}` : ''}` : `- none found${X.textLogo ? `; text wordmark "${X.textLogo.text}" set in ${X.textLogo.font}` : ''}`);
  if (logo.favicon) L.push(`- favicon: \`${logo.favicon}\``); if (logo.appIcon) L.push(`- app icon: \`${logo.appIcon}\``);
  L.push('', '## Copy', '');
  if (X.h1.length) L.push('H1: ' + X.h1.map((t) => `"${t}"`).join(' / '));
  if (X.heroLine && !X.h1.includes(X.heroLine)) L.push(`Hero line: "${X.heroLine}"`);
  if (X.h2.length) L.push('', 'H2:', ...X.h2.map((t) => `- ${t}`));
  L.push('', 'CTAs: ' + (X.ctas.map((c) => `"${c.text}"${c.bg ? ` (${c.bg})` : ''}`).join(', ') || 'none found'), '', 'Nav: ' + (X.nav.join(' | ') || 'none'));
  if (X.sentences.length) L.push('', 'Product sentences:', ...X.sentences.map((t) => `- ${t}`));
  L.push('', '## Assets', '', ...screens.map((s) => `- ${s.file} (scroll ${s.scrollY}px)`), ...mediaOut.map((m) => `- ${m.file}: ${m.kind} ${m.w}x${m.h}${m.alt ? ' "' + m.alt + '"' : ''}${m.flag ? ' **FLAG: ' + m.flag + '**' : ''}`), ...mediaDropped.map((m) => `- (dropped ${m.kind} ${m.w}x${m.h}, ${m.reason}; was captured as ${m.capturedAs}, media/ renumbered)`), ...(ogFile ? [`- ${ogFile} (og:image)`] : []), '- board.png (one-image overview)');
  if (warnings.length) L.push('', '## Warnings', '', ...warnings.map((w) => `- ${w}`));
  fs.writeFileSync(path.join(out, 'BRAND.md'), L.join('\n') + '\n');

  // ---------------------------------------------------------- board.png
  await makeBoard(tool, brand, fontsOut);
  console.log(JSON.stringify({ out, name: brand.name, theme, ground: groundOut[0].hex, ink: ink.hex, inkSoft: soft ? soft.hex : null, accents: accents.map((a) => a.hex), accentCandidates: accentCandidates.map((a) => `${a.hex} (${a.file})`), mediaDropped: mediaDropped.map((m) => `${m.kind} ${m.w}x${m.h} (was ${m.capturedAs})`), mediaFlagged, fonts: Object.fromEntries(Object.entries(fontsOut).map(([k, v]) => [k, v.primaryFamily + (v.file ? '' : ' (no file)')])), logo: logo.file, screens: screens.length, media: mediaOut.length, fontFiles: fontFiles.length, warnings: warnings.length }, null, 1));
}

async function makeBoard(tool, B, fontsOut) {
  const b64 = (f) => fs.readFileSync(path.join(out, f)).toString('base64');
  const C = B.colors, g0 = C.ground[0].hex, ink = C.ink.hex, line = ink + '2e';
  const mime = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
  let faceCss = '', hFam = 'system-ui,sans-serif', bFam = 'system-ui,sans-serif';
  const emb = (role, alias) => { const f = fontsOut[role]; if (!f || !f.file) return null; const ff = B.fonts.faces.find((x) => x.file === f.file); faceCss += `@font-face{font-family:"${alias}";src:url(data:${mime[f.file.split('.').pop()]};base64,${b64(f.file)});font-weight:${ff && /^\d+( \d+)?$/.test(String(ff.weight)) ? ff.weight : '100 900'};font-style:normal}`; return `"${alias}"`; };
  const hE = emb('heading', 'BrandH'); if (hE) hFam = hE + ',system-ui,sans-serif'; else if (fontsOut.heading) hFam = fontsOut.heading.family;
  const bE = emb('body', 'BrandB'); if (bE) bFam = bE + ',system-ui,sans-serif'; else if (fontsOut.body) bFam = fontsOut.body.family;
  const sw = B.colors.palette.slice(0, 6).map((p) => { const t = contrast(p.hex, '#000000') > contrast(p.hex, '#ffffff') ? '#000000' : '#ffffff'; return `<div class="sw" style="background:${p.hex};color:${t}"><b>${p.hex}</b><span>${esc(p.role)}</span></div>`; }).join('');
  const tileBg = B.logo.onDark === true ? '#111' : B.logo.onDark === false ? '#f2f2f2' : g0;
  const logoHtml = B.logo.file ? `<img src="data:${B.logo.file.endsWith('.svg') ? 'image/svg+xml' : B.logo.file.endsWith('.png') ? 'image/png' : B.logo.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'};base64,${b64(B.logo.file)}" style="width:340px;height:170px;object-fit:contain">` : `<div style="font:700 56px ${hFam}">${esc(B.name)}</div>`;
  const pickShots = [0, 1, 2, 3].map((i) => B.screens[Math.min(B.screens.length - 1, Math.round((i * (B.screens.length - 1)) / 3))]).filter(Boolean);
  const shots = pickShots.map((s) => `<img src="data:image/jpeg;base64,${b64(s.file)}">`).join('');
  const ctas = B.copy.ctas.slice(0, 5).map((c) => `<span class="chip" style="${c.bg ? `background:${c.bg};color:${c.color || ink};border-color:${c.bg}` : ''}">${esc(c.text)}</span>`).join('');
  const hf = fontsOut.heading, bf = fontsOut.body;
  const html = `<!doctype html><meta charset=utf-8><style>${faceCss}
*{box-sizing:border-box;margin:0}body{width:1920px;height:1000px;background:${g0};color:${ink};font:16px ${bFam};overflow:hidden}
.board{display:grid;grid-template-columns:420px 1fr 800px;grid-template-rows:330px 290px 254px;gap:22px;padding:34px;height:100%}
.p{border:1px solid ${line};border-radius:14px;padding:22px;overflow:hidden;position:relative}
.lab{position:absolute;top:8px;left:14px;font:600 11px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;opacity:.5}
.logo{display:flex;align-items:center;justify-content:center;background:${tileBg}}.logo .lab{color:#888;opacity:1}
h1{font:${hf ? hf.weight : 600} 50px/1.08 ${hFam};letter-spacing:-.01em;margin-top:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sub{margin-top:14px;font-size:19px;line-height:1.4;opacity:.75;max-width:880px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin-top:16px;font:13px ui-monospace,monospace;opacity:.6}
.pal{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:10px;padding:14px}.sw{border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;border:1px solid ${line}}.sw b{font:700 18px ui-monospace,monospace}.sw span{font-size:12px;opacity:.85;margin-top:3px}
.spec{display:grid;grid-template-columns:260px 1fr;gap:20px}.big{font:${hf ? hf.weight : 600} 150px/1 ${hFam};letter-spacing:-.02em}.h2{font:${hf ? hf.weight : 600} 34px/1.15 ${hFam};margin-bottom:12px}.bd{font:${bf ? bf.weight : 400} 18px/1.45 ${bFam};opacity:.85;max-width:640px}
.fn{font:12px ui-monospace,monospace;opacity:.6;margin-top:10px;line-height:1.5}
.copy .t{font-size:15px;line-height:1.4;margin-top:8px}.copy .t b{opacity:.55;font:600 11px ui-monospace,monospace;letter-spacing:.1em;margin-right:6px}
.chip{display:inline-block;margin:6px 8px 0 0;padding:7px 14px;border-radius:9px;border:1px solid ${line};font:600 14px ${bFam}}
.shots{grid-column:1/4;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:0;border:0}.shots img{width:100%;height:100%;object-fit:cover;border-radius:12px;border:1px solid ${line}}
</style><div class=board>
<div class="p logo"><div class=lab>logo${B.logo.file ? '' : ' (none found: text)'}</div>${logoHtml}</div>
<div class=p><div class=lab>identity</div><h1>${esc(B.tagline || B.name)}</h1><div class=sub>${esc(cut(B.description || B.copy.sentences[0] || '', 200))}</div><div class=meta>${esc(B.name)} &middot; ${esc(new URL(B.finalUrl).host)} &middot; ${C.theme} theme${C.monochrome ? ' &middot; monochrome' : ''}</div></div>
<div class="p pal"><div class=lab>palette</div>${sw}</div>
<div class="p spec" style="grid-column:1/3"><div class=lab>type</div><div class=big>Aa</div><div><div class=h2>${esc(cut(B.copy.h2[0] || 'The quick brown fox jumps over the lazy dog', 60))}</div><div class=bd>${esc(cut(B.copy.sentences[0] || 'Sphinx of black quartz, judge my vow. 0123456789', 200))}</div><div class=fn>heading: ${esc(hf ? hf.primaryFamily : '-')} ${hf ? hf.weight : ''} ${hf && hf.file ? '' : '(not downloaded: showing fallback)'}<br>body: ${esc(bf ? bf.primaryFamily : '-')} ${bf ? bf.weight : ''} ${bf && bf.file ? '' : '(not downloaded: showing fallback)'}</div></div></div>
<div class="p copy"><div class=lab>copy</div><div class=t><b>H1</b>${esc(cut(B.copy.h1[0] || B.copy.heroLine || '-', 130))}</div><div class=t><b>H2</b>${esc(cut(B.copy.h2.slice(0, 2).join('  /  '), 170) || '-')}</div><div class=t><b>NAV</b>${esc(B.copy.nav.slice(0, 7).join(' | '))}</div><div>${ctas}</div></div>
<div class="p shots">${shots}</div></div>`;
  const ft = await tool.send('Page.getFrameTree');
  await tool.send('Page.setDocumentContent', { frameId: ft.frameTree.frame.id, html });
  await tool.eval('document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>0)))).then(()=>true)', { timeout: 30000 });
  await sleep(150);
  fs.writeFileSync(path.join(out, 'board.png'), await tool.shot({ format: 'png' }));
}
