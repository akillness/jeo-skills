/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The AI's own browser in MR Note Classic: a window of its own, with its own
 * cookies and sign-ins (never the app's pages'), that the AI drives through
 * Chromium's own protocol and the person watches and can take over at any
 * time. The local API asks for each step over the agent control port
 * (agent-control.ts). It reads a page as a list of the things one can act on
 * (each with a ref), clicks and types with real input events, scrolls, goes
 * back, and takes a picture of what it shows. A password box is never typed
 * into by the AI: the person signs in themselves.
 */

import { app, BrowserWindow, session as electronSession, shell } from "electron";
import path from "node:path";
import fs from "node:fs";

import { PRODUCT } from "./product";

const PARTITION = "persist:mrnote-agent-browser";
const WIDTH = 1280;
const HEIGHT = 860;
const LOAD_TIMEOUT_MS = 30_000;
const MAX_TEXT = 12_000;
const MAX_ELEMENTS = 300;

let window: BrowserWindow | null = null;
let attached = false;
let downloads: string[] = [];

export type BrowserAnswer = Record<string, unknown> & { ok: boolean };

function downloadFolder(): string {
  const folder = path.join(app.getPath("downloads"), PRODUCT.aiFolder);
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

// The AI's own window for the web: named for what it is, never "browser"

// Read when the window is made: the locale is known only once the app is ready.
function windowTitle(): string {
  const name = app.getLocale().toLowerCase().startsWith("zh") ? "AI 联网窗口" : "AI Web Window";
  return `${PRODUCT.id === "office" ? "MR Office" : "MR Note"} · ${name}`;
}

function ensureWindow(): BrowserWindow {
  if (window && !window.isDestroyed()) return window;
  const agentSession = electronSession.fromPartition(PARTITION);
  agentSession.setPermissionRequestHandler((_contents, permission, callback) => {
    // The AI's browser asks for nothing on the person's behalf (camera,
    // microphone, location, notifications): the person can allow it in
    // their own browser instead.
    callback(permission === "clipboard-sanitized-write" || permission === "fullscreen");
  });
  agentSession.on("will-download", (_event, item) => {
    const target = path.join(downloadFolder(), item.getFilename());
    item.setSavePath(target);
    item.once("done", (_e, state) => {
      if (state === "completed") downloads = [...downloads.slice(-19), target];
    });
  });
  window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    title: windowTitle(),
    // Shown once it has a page to show (open), without taking the person's
    // keyboard: a reply that is not a page is read without a window at all.
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    // A new tab opens here, in the one window the AI and the person share.
    if (/^https?:/i.test(url)) void window?.loadURL(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!/^https?:|^about:blank/i.test(url)) {
      event.preventDefault();
      if (/^(mailto|tel):/i.test(url)) void shell.openExternal(url);
    }
  });
  window.on("page-title-updated", (event, title) => {
    // Always named as the app's: titled by the page alone, a window of raw
    
    event.preventDefault();
    window?.setTitle(title ? `${windowTitle()} — ${title}` : windowTitle());
  });
  window.on("closed", () => {
    window = null;
    attached = false;
  });
  attached = false;
  return window;
}

async function cdp(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const current = ensureWindow();
  if (!attached) {
    try {
      current.webContents.debugger.attach("1.3");
    } catch {
      // Already attached (a reload keeps it).
    }
    attached = true;
  }
  return current.webContents.debugger.sendCommand(method, params);
}

async function waitForLoad(): Promise<void> {
  const contents = ensureWindow().webContents;
  if (!contents.isLoading()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, LOAD_TIMEOUT_MS);
    contents.once("did-stop-loading", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function settle(ms = 600): Promise<void> {
  await waitForLoad();
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate<T>(expression: string): Promise<T> {
  const answer = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (answer.exceptionDetails) throw new Error(String(answer.exceptionDetails.exception?.description ?? "script failed"));
  return answer.result?.value as T;
}












let nextRef = 1;
const refsByPage = new Map<string, Record<string, string>>();
const MAX_PAGES_REMEMBERED = 50;
const MAX_REFS_PER_PAGE = 3_000;

/** Every element one can act on gets a ref (a disabled one is listed as such); the page's text comes with them. */
const snapshotScript = (start: number, known: Record<string, string>) => `(() => {
  const MAX = ${MAX_ELEMENTS};
  const known = ${JSON.stringify(known)};
  const seen = [];
  const used = new Set();
  const keys = {};
  const counts = {};
  let next = ${start};
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value ||
    el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  // A site search, as the page itself makes it: Enter there looks something up, it sends nothing.
  const SEARCH_FIELD = /^(q|query|search|keywords?|kw|wd|w|term|search_?query|searchtext)$/i;
  const searchBox = (el) => {
    if (el.type === 'search' || el.getAttribute('role') === 'searchbox') return true;
    if (/^search$/i.test(el.getAttribute('inputmode') || '') || /^search$/i.test(el.getAttribute('enterkeyhint') || '')) return true;
    if (el.closest('[role=search],search')) return true;
    const form = el.form;
    if (!form) return false;
    if (String(form.method || 'get').toLowerCase() === 'get' && SEARCH_FIELD.test(el.name || '')) return true;
    const action = form.getAttribute('action');
    if (!action) return false;
    try { return /(^|[\\/_.-])(search|find|query)([\\/_.-]|$)/i.test(new URL(action, location.href).pathname); }
    catch { return false; }
  };
  const selector = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=option],[role=combobox],[contenteditable=true],[onclick]';
  for (const el of document.querySelectorAll(selector)) {
    if (seen.length >= MAX) break;
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const name = nameOf(el);
    const type = tag === 'input' ? (el.type || 'text') : '';
    const href = tag === 'a' ? el.href.slice(0, 200) : '';
    const kind = [tag, el.getAttribute('role') || '', type, name, href].join('|');
    counts[kind] = (counts[kind] || 0) + 1;
    const key = kind + '|' + counts[kind];
    let ref = el.getAttribute('data-mrai-ref');
    // A copied element carries its original's ref: it gets one of its own.
    if (!ref || !/^e[0-9]+$/.test(ref) || used.has(ref)) {
      ref = known[key] && !used.has(known[key]) ? known[key] : 'e' + next++;
      el.setAttribute('data-mrai-ref', ref);
    }
    used.add(ref);
    keys[key] = ref;
    const r = el.getBoundingClientRect();
    const disabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    seen.push({
      ref, tag, role: el.getAttribute('role') || undefined,
      type: type || undefined,
      name,
      href: href || undefined,
      value: (tag === 'input' || tag === 'textarea' || tag === 'select') && el.type !== 'password' ? String(el.value || '').slice(0, 80) : undefined,
      checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : undefined,
      disabled: disabled || undefined,
      search: (tag === 'input' || tag === 'textarea') && searchBox(el) ? true : undefined,
      inView: r.bottom > 0 && r.top < innerHeight,
    });
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').slice(0, ${MAX_TEXT});
  return { url: location.href, title: document.title, text, elements: seen, nextRef: next, refKeys: keys,
    scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight } };
})()`;

async function snapshot(): Promise<Record<string, unknown>> {
  const page = ensureWindow().webContents.getURL();
  const known = refsByPage.get(page) ?? {};
  const read = await evaluate<Record<string, unknown>>(snapshotScript(nextRef, known));
  const reached = Number(read?.nextRef);
  if (Number.isFinite(reached) && reached > nextRef) nextRef = reached;
  if (read) {
    const keys = read.refKeys && typeof read.refKeys === "object" ? (read.refKeys as Record<string, string>) : {};
    const address = typeof read.url === "string" ? read.url : page;
    const merged = { ...(refsByPage.get(address) ?? {}), ...keys };
    refsByPage.delete(address);
    refsByPage.set(address, Object.fromEntries(Object.entries(merged).slice(-MAX_REFS_PER_PAGE)));
    while (refsByPage.size > MAX_PAGES_REMEMBERED) refsByPage.delete(refsByPage.keys().next().value as string);
    delete read.nextRef;
    delete read.refKeys;
  }
  return read;
}

async function centerOf(ref: string): Promise<{ x: number; y: number; password: boolean } | null> {
  return evaluate(`(() => {
    const el = document.querySelector('[data-mrai-ref="${ref.replace(/[^a-z0-9]/gi, "")}"]');
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, password: el.type === 'password' };
  })()`);
}

async function mouseClick(x: number, y: number, clicks = 1): Promise<void> {
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (let count = 1; count <= clicks; count += 1) {
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: count });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: count });
  }
}

const KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  enter: { key: "Enter", code: "Enter", keyCode: 13 },
  tab: { key: "Tab", code: "Tab", keyCode: 9 },
  escape: { key: "Escape", code: "Escape", keyCode: 27 },
  backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  delete: { key: "Delete", code: "Delete", keyCode: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  home: { key: "Home", code: "Home", keyCode: 36 },
  end: { key: "End", code: "End", keyCode: 35 },
  space: { key: " ", code: "Space", keyCode: 32 },
};

async function pressKey(name: string): Promise<boolean> {
  const key = KEYS[name.toLowerCase()];
  if (!key) return false;
  const base = { key: key.key, code: key.code, windowsVirtualKeyCode: key.keyCode, nativeVirtualKeyCode: key.keyCode };
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...(key.key === "Enter" ? { text: "\r" } : {}) });
  if (key.key === "Enter") await cdp("Input.dispatchKeyEvent", { type: "char", ...base, text: "\r" });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  return true;
}

async function picture(): Promise<string> {
  const shot = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 72 });
  return String(shot.data);
}

export async function browserAct(request: Record<string, unknown>): Promise<BrowserAnswer> {
  const action = String(request.action ?? "");
  try {
    if (action === "close") {
      if (window && !window.isDestroyed()) window.destroy();
      return { ok: true };
    }
    const current = ensureWindow();
    if (action === "open") {
      const url = String(request.url ?? "");
      if (!/^https?:\/\//i.test(url)) return { ok: false, error: "only http(s) addresses open here" };
      await current.loadURL(url).catch(() => undefined);
      await settle();
      // A page is shown beside the person's work, never in front of their
      // keyboard; a data reply (JSON, plain text) is read and not shown.
      const kind = await evaluate<string>("document.contentType").catch(() => "text/html");
      if (/html|xml\+svg|image\//i.test(kind)) {
        if (!current.isVisible()) current.showInactive();
      } else if (current.isVisible()) {
        current.hide();
      }
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "snapshot") {
      await waitForLoad();
      return { ok: true, ...(await snapshot()), downloads };
    }
    if (action === "click") {
      let x = Number(request.x);
      let y = Number(request.y);
      if (typeof request.ref === "string") {
        const center = await centerOf(request.ref);
        if (!center) return { ok: false, error: `no element ${request.ref} on the page now: take a new snapshot` };
        x = center.x;
        y = center.y;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "name a ref, or x and y" };
      await mouseClick(x, y, request.double ? 2 : 1);
      await settle(800);
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "type") {
      if (typeof request.ref === "string") {
        const center = await centerOf(request.ref);
        if (!center) return { ok: false, error: `no element ${request.ref} on the page now: take a new snapshot` };
        if (center.password) return { ok: false, error: "password_box", message: "A password is typed by the person, never by the AI." };
        await mouseClick(center.x, center.y);
        if (request.replace !== false) {
          await evaluate(`(() => { const el = document.activeElement; if (el && 'select' in el) el.select(); else document.execCommand('selectAll'); })()`);
        }
      }
      const focusedPassword = await evaluate<boolean>(`document.activeElement && document.activeElement.type === 'password'`);
      if (focusedPassword) return { ok: false, error: "password_box", message: "A password is typed by the person, never by the AI." };
      await cdp("Input.insertText", { text: String(request.text ?? "") });
      if (request.submit) await pressKey("enter");
      await settle(request.submit ? 1200 : 300);
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "key") {
      if (!(await pressKey(String(request.key ?? "")))) return { ok: false, error: `unknown key ${String(request.key)}` };
      await settle(500);
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "scroll") {
      const dy = Number(request.dy ?? 700);
      await cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: WIDTH / 2, y: HEIGHT / 2, deltaX: 0, deltaY: dy });
      await settle(400);
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "back" || action === "forward" || action === "reload") {
      if (action === "back" && current.webContents.navigationHistory.canGoBack()) current.webContents.navigationHistory.goBack();
      if (action === "forward" && current.webContents.navigationHistory.canGoForward()) current.webContents.navigationHistory.goForward();
      if (action === "reload") current.webContents.reload();
      await settle();
      return { ok: true, ...(await snapshot()) };
    }
    if (action === "screenshot") {
      await waitForLoad();
      return { ok: true, url: current.webContents.getURL(), title: current.webContents.getTitle(), jpeg: await picture() };
    }
    return { ok: false, error: `unknown action ${action}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : "failed" };
  }
}
