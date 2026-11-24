/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Note Classic's printer: the local API's PDF exports drawn by the editor
 * itself, in this app's own Chromium (docs/desktop-classic.md, "导出 PDF 与打印").
 *
 * Online, the API prints a document, deck or workbook by opening the web
 * app's print route (/render/page-preview, /render/presentation-print,
 * /render/spreadsheet-print) in a headless Chromium driven by Playwright
 * (apps/api/app/services/page_preview_render.py). The desktop app ships no
 * such browser, and drew those PDFs with the server's old ReportLab painter
 * (other faces, other line breaks, no charts as drawn). Here the shell is
 * that browser: the API hands it a print job, a hidden window of a private
 * in-memory session loads the print route from the local web server (with
 * the shell's cookie, which that server requires) and `printToPDF` prints it,
 * the way the Playwright drivers do, step by step.
 *
 * Only the local API can ask:
 *  - the job server listens on 127.0.0.1 only, on a port chosen at launch;
 *  - every job carries the launch's printer token (Authorization: Bearer),
 *    compared in constant time; a request with an Origin header (a browser
 *    page) or another Host than 127.0.0.1:<port> is refused;
 *  - a job names one of the three print routes, and files under this
 *    computer's temporary folder only (the API's work files);
 *  - the print windows reach the local web server alone (everything else is
 *    cancelled), hold no sign-in, may not download, ask for permissions or
 *    navigate away, and are destroyed after each job.
 */

import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { BrowserWindow, session, type Session, type WebContents } from "electron";

const SHELL_COOKIE = "mrai_desktop_shell";
/** The routes a job may print (apps/web/app/[locale]/render/*). */
const PRINT_ROUTES = new Set(["/render/page-preview", "/render/presentation-print", "/render/spreadsheet-print"]);
const PRINT_SURFACES = new Set(["lean", "editor"]);
/** Paths the print page reads from its driver (page_preview_render.py). */
const OFFICE_DATA_PATH = "/__mrai-print-office-data/";
const PRINT_FONT_PATH = "/__mrai-print-font/";
const PAYLOAD_PATH = "/__mrai-print-payload";
const ENGINE_PATH = "/api/v1/engine/";
const ENGINE_CHARTS_PATH = "/api/v1/engine/charts/";
/** Two prints at once (an export and the AI's look at a page), each in a session of its own. */
const SLOTS = 2;
const MAX_JOB_BYTES = 256 * 1024;

/** The printer is on unless MRAI_CLASSIC_PRINTER=0 (a support switch: the API then draws PDFs the old way). */
export function printerEnabled(): boolean {
  return process.env.MRAI_CLASSIC_PRINTER !== "0";
}

export interface PrinterLaunch {
  readonly printerPort: number;
  readonly printerToken: string;
  readonly webOrigin: string;
  readonly apiOrigin: string;
  readonly shellSecret: string;
}

type JobKind = "document-pdf" | "deck-pdf" | "sheet-pdf" | "document-pictures";

interface Job {
  kind: JobKind;
  path: string;
  locale: string;
  payloadFile: string;
  outDir: string;
  timeoutMs: number;
  officeData: Record<string, string>;
  fontPaths: Record<string, string>;
  /** The API's engine relay for this print (decks, workbooks). */
  relay: string | null;
  /** Document pictures: the 1-based page numbers wanted. */
  pages: number[];
}

interface JobAnswer {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

class PrintError extends Error {}

// --- files ---------------------------------------------------------------------

const realpath = (file: string): string => fs.realpathSync.native(file);

/** This computer's temporary folders: where the API writes a job's files. */
function temporaryRoots(): string[] {
  const roots = new Set<string>();
  for (const candidate of [os.tmpdir(), process.env.TMPDIR, process.env.TEMP, process.env.TMP]) {
    if (!candidate) continue;
    try {
      roots.add(realpath(candidate));
    } catch {
      // Not there.
    }
  }
  return [...roots];
}

function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** `file` as a real path under a temporary folder, of the kind wanted; else a PrintError. */
function temporaryPath(value: unknown, kind: "file" | "directory"): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new PrintError(`not an absolute path: ${String(value)}`);
  let real: string;
  try {
    real = realpath(value);
  } catch {
    throw new PrintError(`no such ${kind}`);
  }
  const roots = temporaryRoots();
  const fold = (text: string) => (process.platform === "win32" ? text.toLowerCase() : text);
  if (!roots.some((root) => inside(fold(root), fold(real)))) throw new PrintError(`${kind} outside the temporary folder`);
  const stat = fs.statSync(real);
  if (kind === "file" ? !stat.isFile() : !stat.isDirectory()) throw new PrintError(`not a ${kind}`);
  return real;
}

function fileMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [name, file] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[\w.-]{1,128}$/.test(name)) throw new PrintError(`bad file name ${name}`);
    out[name] = temporaryPath(file, "file");
  }
  return out;
}

function loopbackOrigin(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new PrintError("bad relay");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/") {
    throw new PrintError("the relay must be http://127.0.0.1:<port>");
  }
  return url.origin;
}

function readJob(body: unknown): Job {
  if (!body || typeof body !== "object") throw new PrintError("no job");
  const raw = body as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "document-pdf" && kind !== "deck-pdf" && kind !== "sheet-pdf" && kind !== "document-pictures") {
    throw new PrintError("unknown kind");
  }
  const route = new URL(String(raw.path ?? ""), "http://print.invalid");
  if (route.origin !== "http://print.invalid" || !PRINT_ROUTES.has(route.pathname)) throw new PrintError("not a print route");
  for (const [name, value] of route.searchParams) {
    if (name !== "surface" || !PRINT_SURFACES.has(value)) throw new PrintError("unexpected query");
  }
  const locale = String(raw.locale ?? "zh-CN");
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) throw new PrintError("bad locale");
  const timeoutMs = Number(raw.timeout_ms);
  const pages = Array.isArray(raw.pages) ? raw.pages.filter((page): page is number => Number.isInteger(page) && page >= 1) : [];
  return {
    kind,
    path: `${route.pathname}${route.search}`,
    locale,
    payloadFile: temporaryPath(raw.payload_file, "file"),
    outDir: temporaryPath(raw.out_dir, "directory"),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30 * 60_000) : 45_000,
    officeData: fileMap(raw.office_data),
    fontPaths: fileMap(raw.font_paths),
    relay: loopbackOrigin(raw.relay),
    pages: pages.slice(0, 50),
  };
}

// --- the print windows -----------------------------------------------------------------

interface Slot {
  readonly session: Session;
  job: Job | null;
  busy: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fileResponse(file: string | undefined, contentType: string): Response {
  if (!file) return new Response("", { status: 404 });
  // Streamed: a document's payload can be a few hundred MB (its pictures),
  // and a whole read would hold the main process meanwhile.
  const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

/** A page's engine call answered by the API's relay for this print (decks, workbooks). */
async function relayEngine(request: Request, url: URL, relay: string, origin: string): Promise<Response> {
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, x-csrf-token, x-requested-with",
    "access-control-allow-methods": "POST, DELETE, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const remove = request.method === "DELETE";
    const answer = await fetch(relay + url.pathname + url.search, {
      method: remove ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body: remove ? undefined : Buffer.from(await request.arrayBuffer()),
    });
    const retry = answer.headers.get("retry-after");
    return new Response(Buffer.from(await answer.arrayBuffer()), {
      status: answer.status,
      headers: { ...cors, "content-type": "application/json", ...(retry ? { "retry-after": retry } : {}) },
    });
  } catch {
    return new Response("", { status: 503, headers: cors });
  }
}

/** A document's chart call, sent to the API itself under the web app's origin (as `_PDF_DRIVER` does). */
async function forwardCharts(request: Request, url: URL, apiOrigin: string, origin: string): Promise<Response> {
  const cors = {
    "access-control-allow-origin": request.headers.get("origin") || origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers.get("access-control-request-headers") || "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const headers: Record<string, string> = { origin };
    for (const name of ["content-type", "accept", "x-mrai-engine-blob-sha256"]) {
      const value = request.headers.get(name);
      if (value) headers[name] = value;
    }
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const answer = await fetch(apiOrigin + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
    });
    const kept: Record<string, string> = {};
    answer.headers.forEach((value, name) => {
      if (!/^(content-encoding|content-length|transfer-encoding|connection)$/i.test(name)) kept[name] = value;
    });
    return new Response(Buffer.from(await answer.arrayBuffer()), { status: answer.status, headers: { ...kept, ...cors } });
  } catch {
    return Response.error();
  }
}

function makeSlot(index: number, launch: PrinterLaunch): Slot {
  // In memory (no "persist:"): nothing a print leaves is kept on disk.
  const ses = session.fromPartition(`mrai-printer-${index}`, { cache: true });
  const slot: Slot = { session: ses, job: null, busy: false };
  const origin = launch.webOrigin;
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
  // Nothing but the local web server: every other address, scheme or socket is cancelled.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith(`${origin}/`) || url === origin || url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank";
    callback({ cancel: !allowed });
  });
  ses.protocol.handle("http", async (request) => {
    const job = slot.job;
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return Response.error();
    }
    if (!job || url.origin !== origin) return Response.error();
    const name = (prefix: string) => {
      try {
        return decodeURIComponent(url.pathname.slice(prefix.length));
      } catch {
        return "";
      }
    };
    if (url.pathname === PAYLOAD_PATH) return fileResponse(job.payloadFile, "application/json");
    if (url.pathname.startsWith(OFFICE_DATA_PATH)) {
      const table = name(OFFICE_DATA_PATH);
      return fileResponse(Object.hasOwn(job.officeData, table) ? job.officeData[table] : undefined, "application/json");
    }
    if (url.pathname.startsWith(PRINT_FONT_PATH)) {
      const face = name(PRINT_FONT_PATH);
      return fileResponse(Object.hasOwn(job.fontPaths, face) ? job.fontPaths[face] : undefined, "application/octet-stream");
    }
    if (job.relay && url.pathname === "/api/v1/auth/csrf") {
      // The window asks for a CSRF token before an engine call; the relay needs none.
      return new Response(JSON.stringify({ csrf_token: "print" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname.startsWith(ENGINE_PATH)) {
      if (job.relay) return relayEngine(request, url, job.relay, origin);
      if (url.pathname.startsWith(ENGINE_CHARTS_PATH)) return forwardCharts(request, url, launch.apiOrigin, origin);
    }
    // The web app itself, with the shell's cookie this session holds.
    if (request.method === "GET" || request.method === "HEAD") {
      return ses.fetch(request, { bypassCustomProtocolHandlers: true });
    }
    return ses.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: Buffer.from(await request.arrayBuffer()),
      redirect: "manual",
      bypassCustomProtocolHandlers: true,
    });
  });
  return slot;
}

/** A page's state, read by an expression; null while the page cannot answer. */
async function evaluate<T>(contents: WebContents, expression: string): Promise<T | null> {
  if (contents.isDestroyed()) throw new PrintError("the print window closed");
  try {
    return (await Promise.race([
      contents.executeJavaScript(`(() => { try { return (${expression}); } catch { return null; } })()`, true),
      sleep(15_000).then(() => null),
    ])) as T | null;
  } catch {
    return null;
  }
}

/** Waits until `expression` is truthy (its value), like Playwright's waitForFunction. */
async function waitFor<T>(contents: WebContents, expression: string, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await evaluate<T>(contents, expression);
    if (value) return value;
    if (Date.now() >= deadline) throw new PrintError(`Timeout ${Math.round(timeoutMs)}ms exceeded waiting for ${what}`);
    await sleep(100);
  }
}

async function settleAnimations(contents: WebContents): Promise<void> {
  await evaluate(
    contents,
    "Promise.race([Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))), new Promise(done => setTimeout(done, 10000))]).then(() => true)",
  );
  await evaluate(contents, "new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");
}

const PDF_OPTIONS = {
  preferCSSPageSize: true,
  printBackground: true,
  generateTaggedPDF: true,
  // Playwright's page.pdf prints edge to edge; Electron's default is 1 cm.
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
} as const;

/** The init script: the job's payload under `global` before the page's own scripts run. */
function initScript(origin: string, global: string, documentMarks: boolean): string {
  const marks = documentMarks
    ? `localStorage.setItem("mrnote.docs.formatting-marks.v1", ${JSON.stringify(
        JSON.stringify({ showAll: false, chosen: ["paragraphs"], preferences: { paragraphs: false } }),
      )});`
    : "";
  return `(() => {
  if (window.top !== window || location.origin !== ${JSON.stringify(origin)}) return;
  // A throwaway profile: necessary cookies only, so no banner covers a page.
  try { localStorage.setItem("mrnote_consent", "denied"); ${marks} } catch {}
  // No service worker in a print window (Playwright's serviceWorkers: "block").
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error("print")); } catch {}
  const request = new XMLHttpRequest();
  request.open("GET", ${JSON.stringify(PAYLOAD_PATH)}, false);
  request.send();
  if (request.status === 200) window[${JSON.stringify(global)}] = JSON.parse(request.responseText);
})();`;
}

interface OpenedPage {
  readonly window: BrowserWindow;
  readonly contents: WebContents;
  /** The windows the page opened (a document's print copy). */
  readonly opened: BrowserWindow[];
}

async function openPrintPage(
  slot: Slot,
  launch: PrinterLaunch,
  job: Job,
  options: { width: number; height: number; global: string; printMedia: boolean; allowCopy: boolean },
): Promise<OpenedPage> {
  const window = new BrowserWindow({
    show: false,
    width: options.width,
    height: options.height,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      session: slot.session,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  const contents = window.webContents;
  const opened: BrowserWindow[] = [];
  contents.setWindowOpenHandler(({ url }) =>
    options.allowCopy && (url === "" || url === "about:blank")
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            show: false,
            width: options.width,
            height: options.height,
            paintWhenInitiallyHidden: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
          },
        }
      : { action: "deny" },
  );
  contents.on("did-create-window", (child) => {
    opened.push(child);
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    void emulate(child.webContents, job, options.width, options.height, false).catch(() => null);
  });
  const leave = (event: { url: string; preventDefault(): void }) => {
    if (!event.url.startsWith(`${launch.webOrigin}/`)) event.preventDefault();
  };
  contents.on("will-navigate", leave);
  contents.on("will-redirect", leave);
  // DevTools commands need a document: the blank one first.
  await window.loadURL("about:blank");
  await emulate(contents, job, options.width, options.height, options.printMedia);
  await contents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
    source: initScript(launch.webOrigin, options.global, job.kind === "document-pdf" || job.kind === "document-pictures"),
  });
  await Promise.race([
    window.loadURL(`${launch.webOrigin}${job.path}`).catch((error) => {
      // A load the page itself aborts (a client-side redirect) is not a failure.
      if (!/ERR_ABORTED/.test(String(error))) throw error;
    }),
    sleep(job.timeoutMs).then(() => {
      throw new PrintError(`Timeout ${job.timeoutMs}ms exceeded loading the print page`);
    }),
  ]);
  return { window, contents, opened };
}

/** Playwright's context settings: the viewport at 1x, the job's locale, print media for a deck. */
async function emulate(contents: WebContents, job: Job, width: number, height: number, printMedia: boolean): Promise<void> {
  if (!contents.debugger.isAttached()) contents.debugger.attach("1.3");
  const send = (method: string, params: Record<string, unknown>) =>
    contents.debugger.sendCommand(method, params).catch(() => null);
  // Init scripts (Page.addScriptToEvaluateOnNewDocument) run only with the Page domain on.
  await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setLocaleOverride", { locale: job.locale });
  if (printMedia) await send("Emulation.setEmulatedMedia", { media: "print" });
}

function closeAll(page: OpenedPage | null): void {
  if (!page) return;
  // destroy(): no beforeunload prompt from a print page.
  for (const child of page.opened) if (!child.isDestroyed()) child.destroy();
  if (!page.window.isDestroyed()) page.window.destroy();
}

async function assertOfficeDataHanded(contents: WebContents): Promise<void> {
  const failed = await evaluate<string[]>(
    contents,
    "(window.__MRAI_PAGE_PREVIEW_OFFICE_DATA && window.__MRAI_PAGE_PREVIEW_OFFICE_DATA.failed) || []",
  );
  if (failed && failed.length) throw new PrintError(`office data not handed: ${failed.join(",")}`);
}

async function printPdf(contents: WebContents, file: string, extra: Record<string, unknown> = {}): Promise<void> {
  const data = await contents.printToPDF({ ...PDF_OPTIONS, ...extra });
  fs.writeFileSync(file, data);
}

/** `_PDF_DRIVER`: the document's print copy (the editor's own Print), printed to a file. */
async function printDocument(slot: Slot, launch: PrinterLaunch, job: Job, deadline: number): Promise<JobAnswer> {
  const left = () => Math.max(1_000, Math.min(job.timeoutMs, deadline - Date.now()));
  const page = await openPrintPage(slot, launch, job, {
    width: 1200,
    height: 1700,
    global: "__MRAI_PAGE_PREVIEW",
    printMedia: false,
    allowCopy: true,
  });
  try {
    const { contents } = page;
    await waitFor(
      contents,
      "window.__MRAI_PAGE_PREVIEW_READY && typeof window.__MRAI_PAGE_PREVIEW_PRINT === 'function'",
      left(),
      "the document",
    );
    const fonts = await evaluate<{ ticket?: string; kept: number; expected: number }>(contents, "window.__MRAI_PAGE_PREVIEW_FONTS || null");
    if (fonts && fonts.ticket === "initial" && fonts.kept < fonts.expected) {
      throw new PrintError(`fonts not handed ${fonts.kept}/${fonts.expected}`);
    }
    await assertOfficeDataHanded(contents);
    await settleAnimations(contents);
    // Every chart drawn before the copy is made (its picture is the chart's print snapshot).
    await waitFor(
      contents,
      `[...document.querySelectorAll('[data-chart-print-source="echarts"]')].every((shell) => ["ready", "error"].includes(shell.dataset.chartRenderStatus))`,
      Math.min(120_000, left()),
      "the charts",
    ).catch(() => null);
    const before = page.opened.length;
    const asked = await evaluate<boolean>(contents, "window.__MRAI_PAGE_PREVIEW_PRINT()");
    if (!asked) throw new PrintError("print copy refused");
    const copyDeadline = Date.now() + left();
    while (page.opened.length === before) {
      if (Date.now() > copyDeadline) throw new PrintError("Timeout exceeded waiting for the print copy");
      await sleep(50);
    }
    const copy = page.opened[page.opened.length - 1].webContents;
    const state = await waitFor<string>(
      copy,
      `["true", "failed"].includes(document.documentElement.getAttribute("data-mrai-print-ready")) && document.documentElement.getAttribute("data-mrai-print-ready")`,
      left(),
      "the print copy",
    );
    if (state !== "true") throw new PrintError("print copy could not be made");
    const file = path.join(job.outDir, "document.pdf");
    await printPdf(copy, file, { generateDocumentOutline: true });
    const pages = await evaluate<number>(copy, `document.querySelectorAll("article[data-page-sheet]").length`);
    return { ok: true, file, pages: pages ?? 0 };
  } finally {
    closeAll(page);
  }
}

/** `_PRESENTATION_PDF_DRIVER`: the deck laid out for print by the slide renderer, printed. */
async function printDeck(slot: Slot, launch: PrinterLaunch, job: Job, deadline: number): Promise<JobAnswer> {
  const left = () => Math.max(1_000, Math.min(job.timeoutMs, deadline - Date.now()));
  const page = await openPrintPage(slot, launch, job, {
    width: 1600,
    height: 1200,
    global: "__MRAI_DECK_PRINT",
    // Laid out for print from the start: switching the media after the ready
    // cue re-measured the charts, and the PDF caught them blank.
    printMedia: true,
    allowCopy: false,
  });
  try {
    const ready = await waitFor<{ incomplete?: unknown; pages?: number }>(
      page.contents,
      "window.__MRAI_DECK_PRINT_READY",
      left(),
      "the deck",
    );
    if (ready && ready.incomplete) throw new PrintError(`deck print incomplete: ${JSON.stringify(ready)}`);
    const file = path.join(job.outDir, "deck.pdf");
    await printPdf(page.contents, file);
    return { ok: true, file, pages: ready.pages ?? null };
  } finally {
    closeAll(page);
  }
}

/** `_SPREADSHEET_PDF_DRIVER`: each batch of the workbook's pages printed as a part. */
async function printWorkbook(slot: Slot, launch: PrinterLaunch, job: Job, deadline: number): Promise<JobAnswer> {
  const left = () => Math.max(1_000, Math.min(job.timeoutMs, deadline - Date.now()));
  const page = await openPrintPage(slot, launch, job, {
    width: 1600,
    height: 1200,
    global: "__MRAI_SHEET_PRINT",
    printMedia: false,
    allowCopy: false,
  });
  try {
    const { contents } = page;
    const parts: string[] = [];
    for (let seq = 0; ; seq += 1) {
      const state = await waitFor<{ ready?: { incomplete?: unknown; pages?: number; notes?: unknown }; batch?: unknown }>(
        contents,
        `(() => {
          const ready = window.__MRAI_SHEET_PRINT_READY;
          if (ready && ready.ticket === "initial") return { ready };
          const batch = window.__MRAI_SHEET_PRINT_BATCH;
          return batch && batch.ticket === "initial" && batch.seq === ${seq} ? { batch: true } : false;
        })()`,
        left(),
        "the workbook",
      );
      if (state.ready) {
        if (state.ready.incomplete || !state.ready.pages || !parts.length) {
          throw new PrintError(`workbook print incomplete: ${JSON.stringify(state.ready)}`);
        }
        return { ok: true, parts, pages: state.ready.pages, ...(state.ready.notes ? { notes: state.ready.notes } : {}) };
      }
      await assertOfficeDataHanded(contents);
      const file = path.join(job.outDir, `workbook.${seq}.pdf`);
      await printPdf(contents, file);
      parts.push(file);
      if (!(await evaluate<boolean>(contents, `window.__MRAI_SHEET_PRINT_CONTINUE(${seq})`))) {
        throw new PrintError("the print page lost the batch");
      }
    }
  } finally {
    closeAll(page);
  }
}

/** `_DRIVER`: the document's pages as JPEGs, as the editor lays them out. */
async function photographDocument(slot: Slot, launch: PrinterLaunch, job: Job, deadline: number): Promise<JobAnswer> {
  const left = () => Math.max(1_000, Math.min(job.timeoutMs, deadline - Date.now()));
  const page = await openPrintPage(slot, launch, job, {
    width: 1200,
    height: 1700,
    global: "__MRAI_PAGE_PREVIEW",
    printMedia: false,
    allowCopy: false,
  });
  try {
    const { contents } = page;
    await waitFor(contents, "window.__MRAI_PAGE_PREVIEW_READY", left(), "the document");
    await evaluate(
      contents,
      `(() => { const style = document.createElement("style"); style.textContent = ".math-block-wrapper[data-selected] .math-block-preview,.inline-math-wrapper[data-selected] .inline-math-preview{outline:none!important}"; document.head.appendChild(style); return true; })()`,
    );
    await settleAnimations(contents);
    const boxes =
      (await evaluate<Array<{ x: number; y: number; width: number; height: number }>>(
        contents,
        `[...document.querySelectorAll("article[data-page-sheet]")].map((sheet) => { const rect = sheet.getBoundingClientRect(); return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height }; })`,
      )) ?? [];
    const files: string[] = [];
    for (const number of job.pages) {
      const box = boxes[number - 1];
      if (!box) break;
      const shot = (await contents.debugger.sendCommand("Page.captureScreenshot", {
        format: "jpeg",
        quality: 85,
        captureBeyondViewport: true,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
      })) as { data: string };
      const file = path.join(job.outDir, `page-${number}.jpg`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      files.push(file);
    }
    return { ok: true, total: boxes.length, files };
  } finally {
    closeAll(page);
  }
}

// --- the job server -------------------------------------------------------------------------

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function startPrinter(launch: PrinterLaunch): Promise<http.Server | null> {
  const slots = Array.from({ length: SLOTS }, (_, index) => makeSlot(index, launch));
  const waiting: Array<(slot: Slot) => void> = [];

  const take = (): Promise<Slot> => {
    const free = slots.find((slot) => !slot.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const give = (slot: Slot) => {
    slot.job = null;
    const next = waiting.shift();
    if (next) next(slot);
    else slot.busy = false;
  };

  const run = async (job: Job): Promise<JobAnswer> => {
    // The job's own ceiling, its wait for a free slot included (the API waits a little longer).
    const deadline = Date.now() + job.timeoutMs + 15_000;
    const slot = await Promise.race([
      take(),
      sleep(job.timeoutMs).then(() => null),
    ]);
    if (!slot) return { ok: false, error: "Timeout exceeded waiting for a free printer" };
    try {
      await slot.session.clearStorageData({
        storages: ["localstorage", "indexdb", "serviceworkers", "cachestorage", "filesystem"],
      });
      await slot.session.cookies.set({
        url: launch.webOrigin,
        name: SHELL_COOKIE,
        value: launch.shellSecret,
        httpOnly: true,
        sameSite: "strict",
      });
      await slot.session.setUserAgent(slot.session.getUserAgent(), job.locale);
      slot.job = job;
      const work =
        job.kind === "document-pdf"
          ? printDocument(slot, launch, job, deadline)
          : job.kind === "deck-pdf"
            ? printDeck(slot, launch, job, deadline)
            : job.kind === "sheet-pdf"
              ? printWorkbook(slot, launch, job, deadline)
              : photographDocument(slot, launch, job, deadline);
      return await Promise.race([
        work,
        sleep(Math.max(1_000, deadline - Date.now())).then(() => {
          throw new PrintError(`Timeout ${job.timeoutMs}ms exceeded`);
        }),
      ]);
    } catch (error) {
      return { ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 2000) };
    } finally {
      // The page is gone before the next job takes this session.
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed() && window.webContents.session === slot.session) window.destroy();
      }
      give(slot);
    }
  };

  const server = http.createServer((req, res) => {
    const answer = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const auth = req.headers.authorization ?? "";
    if (
      req.method !== "POST" ||
      req.url !== "/v1/jobs" ||
      req.headers.host !== `127.0.0.1:${launch.printerPort}` ||
      req.headers.origin !== undefined ||
      !auth.startsWith("Bearer ") ||
      !sameSecret(auth.slice("Bearer ".length), launch.printerToken)
    ) {
      req.resume();
      answer(404, { ok: false, error: "not found" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_JOB_BYTES) {
        answer(413, { ok: false, error: "job too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_JOB_BYTES) return;
      let job: Job;
      try {
        job = readJob(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        answer(400, { ok: false, error: error instanceof Error ? error.message : "bad job" });
        return;
      }
      const began = Date.now();
      void run(job).then((result) => {
        console.log(
          `[classic] printer ${job.kind} ${result.ok ? "ok" : `failed: ${String(result.error).slice(0, 300)}`} in ${Date.now() - began} ms`,
        );
        answer(200, result);
      });
    });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 10_000;
  return new Promise((resolve) => {
    server.once("error", (error) => {
      console.error(`[classic] printer could not listen: ${error.message}`);
      resolve(null);
    });
    server.listen(launch.printerPort, "127.0.0.1", () => resolve(server));
  });
}
