/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, session, type Session, type WebContents } from "electron";

import { DomProbe, type ProbeCdp } from "./vibe-probe";
import { loadVibeRuntime, readPyodideAsset, type RuntimeLane, type VibeRuntime, VibeRuntimeError } from "./vibe-runtime";

export const CHECKER_PROTOCOL = 1;
/** The host page's origin: intercepted, never served by anything (as the site's checker). */
export const CHECKER_ORIGIN = "http://127.0.0.1:3399";
const SANDBOX_PATH = "/code-sandbox.html";
const SANDBOX_QUERY = "?profile=vibe-shared-v1";
const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; worker-src blob:; frame-ancestors 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";
const HOST_HTML = '<!doctype html><meta charset="utf-8"><script src="/runtime.js"></script>';
export const PARTITION_PREFIX = "mrai-vibe-checker-";
const PROBE_BINDING = "__mraiProbeCall";
/** No link's host is resolved ahead (anchors; a `<link rel=dns-prefetch>` is
 * the process's host rules' to stop, which this header does not). */
const NO_DNS_PREFETCH = { "x-dns-prefetch-control": "off" };


















export const SIDE_EFFECT_GUARD = `(() => {
  const g = globalThis;
  const keep = (target, name, value) => {
    try { Object.defineProperty(target, name, { value, writable: false, configurable: false, enumerable: false }); } catch (e) {}
  };
  if (g.Clipboard) {
    // As the site's checker answers: its page never has the focus the clipboard needs.
    const refuse = () => {
      const error = new DOMException("Document is not focused.", "NotAllowedError");
      // A stack as the browser's own gives it ("NotAllowedError: ..."), which
      // the window's error reporter reads the error's class from.
      try { Error.captureStackTrace(error, refuse); } catch (e) {}
      return Promise.reject(error);
    };
    keep(g.Clipboard.prototype, "writeText", function writeText() { return refuse(); });
    keep(g.Clipboard.prototype, "write", function write() { return refuse(); });
  }
  if (g.Document) {
    const exec = g.Document.prototype.execCommand;
    keep(g.Document.prototype, "execCommand", function execCommand(command, ...rest) {
      const name = String(command).toLowerCase();
      if (name === "copy" || name === "cut") {
        try {
          const target = this.activeElement || this.body || this.documentElement;
          if (target) target.dispatchEvent(new ClipboardEvent(name, { bubbles: true, cancelable: true, composed: true, clipboardData: new DataTransfer() }));
        } catch (e) {}
        return true;
      }
      return exec.call(this, command, ...rest);
    });
  }
  if (g.SpeechSynthesis) {
    keep(g.SpeechSynthesis.prototype, "speak", function speak(utterance) {
      setTimeout(() => { try { utterance.dispatchEvent(new SpeechSynthesisEvent("end", { utterance })); } catch (e) {} }, 0);
    });
  }
  if (g.HTMLInputElement) {
    const show = g.HTMLInputElement.prototype.showPicker;
    keep(g.HTMLInputElement.prototype, "showPicker", function showPicker() {
      if (String(this.type).toLowerCase() === "color") return undefined;
      return show.call(this);
    });
    g.addEventListener("click", (event) => {
      const target = event.composedPath ? event.composedPath()[0] : event.target;
      if (target instanceof g.HTMLInputElement && String(target.type).toLowerCase() === "color") event.preventDefault();
    }, true);
  }
})();`;

/** The checker window's preferences; nothing is added to them anywhere else. */
export const CHECKER_WEB_PREFERENCES = Object.freeze({
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  nodeIntegrationInWorker: false,
  webviewTag: false,
  javascript: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  enableWebSQL: false,
  navigateOnDragDrop: false,
  spellcheck: false,
  backgroundThrottling: false,
  disableDialogs: true,
  safeDialogs: true,
  autoplayPolicy: "document-user-activation-required" as const,
});
/** The site's checker's network lockdown (shared-runtime-browser.mjs NETWORK_LOCKDOWN_ARGS), per session. */
export const CHECKER_PROXY = Object.freeze({ mode: "fixed_servers" as const, proxyRules: "http://127.0.0.1:9", proxyBypassRules: "<-loopback>" });
export const CHECKER_WEBRTC_POLICY = "disable_non_proxied_udp" as const;

/** Playwright's default context: 1024×768 at 1x, light, no reduced motion (shared-runtime-browser.mjs newContext). */
const VIEWPORT = { width: 1024, height: 768 };
const MEDIA_FEATURES = [
  { name: "prefers-color-scheme", value: "light" },
  { name: "prefers-reduced-motion", value: "no-preference" },
  { name: "forced-colors", value: "none" },
  { name: "prefers-contrast", value: "no-preference" },
];

 
const PREFLIGHT_SECONDS = 40;
const DOM_RUN_SECONDS = 25;
const PREFLIGHT_MAX_ANSWER = 8192;
const ACTION_MAX_ANSWER = 300_000;
const MAX_REQUEST_BYTES = 700_000;
const MAX_SLOTS = 4;
const IDLE_MS = 10 * 60_000;
const START_MS = 25_000;
const SHOT_MAX_BYTES = 2 * 1024 * 1024;

export interface VibeCheckerLaunch {
  readonly vibePort: number;
  readonly vibeToken: string;
}

const checkerSessions = new WeakSet<Session>();

/** Whether a page's session is the checker's: such a page is guarded here, not by the app's window rules. */
export function isVibeCheckerSession(ses: Session | undefined | null): boolean {
  return Boolean(ses && checkerSessions.has(ses));
}

/** The checker is on unless MRAI_CLASSIC_VIBE_CHECKER=0 (a support switch: windows are then refused or unchecked, as with no checker). */
export function vibeCheckerEnabled(): boolean {
  return process.env.MRAI_CLASSIC_VIBE_CHECKER !== "0";
}

/** This checker's own code, by digest: receipts are bound to it and to the closure's manifest. */
export function checkerSha256(): string {
  const digest = createHash("sha256");
  for (const name of ["vibe-checker.js", "vibe-probe.js", "vibe-runtime.js"]) {
    digest.update(name);
    digest.update(fs.readFileSync(path.join(__dirname, name)));
  }
  return digest.digest("hex");
}

 
export function isSharedSource(source: unknown): boolean {
  if (typeof source !== "string" || !source.trimStart().startsWith("{")) return false;
  try {
    const value = JSON.parse(source);
    if (value && typeof value === "object" && !Array.isArray(value) && String(value.schema_version ?? "").startsWith("mrai.shared-app.")) {
      return true;
    }
  } catch {
    // The marker test below, as the API does.
  }
  return source.includes('"mrai.shared-app.');
}

class CheckerUnavailable extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64");
const SESSION_GONE = /no session|session with given id|target closed|not attached|detached|cannot find context|could not find/i;

// --- the sessions -------------------------------------------------------------------------------------

interface SessionGate {
  /** Pinned asset URLs this session's page may GET (Pyodide, after a Python check asked for them). */
  readonly assets: Set<string>;
  /** Every URL the gate cancelled (for the checks and the tests). */
  readonly blocked: string[];
}

const gates = new WeakMap<Session, SessionGate>();

/** Whether the gate lets a request through to the debugger's interception: the host page's three URLs and the pinned assets. */
export function gateAllows(url: string, method: string, assets: ReadonlySet<string>): boolean {
  if (url.startsWith("data:") || url.startsWith("blob:") || url === "about:blank" || url === "about:srcdoc") return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (assets.has(parsed.href)) return method === "GET";
  if (parsed.origin !== CHECKER_ORIGIN) return false;
  return parsed.pathname === "/" || parsed.pathname === "/runtime.js" || (parsed.pathname === SANDBOX_PATH && parsed.search === SANDBOX_QUERY);
}

function checkerSession(name: string): Session {
  // In memory (no "persist:"): nothing a check leaves is kept on disk.
  const ses = session.fromPartition(`${PARTITION_PREFIX}${name}`, { cache: false });
  if (checkerSessions.has(ses)) return ses;
  checkerSessions.add(ses);
  const gate: SessionGate = { assets: new Set(), blocked: [] };
  gates.set(ses, gate);
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  ses.setSpellCheckerEnabled(false);
  ses.on("will-download", (event) => event.preventDefault());
  ses.on("select-hid-device", (event, _details, callback) => {
    event.preventDefault();
    callback(null);
  });
  ses.on("select-serial-port", (event, _ports, _contents, callback) => {
    event.preventDefault();
    callback("");
  });
  ses.on("select-usb-device", (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = gateAllows(details.url, details.method, gate.assets);
    if (!allowed && gate.blocked.length < 256) gate.blocked.push(details.url.slice(0, 300));
    callback({ cancel: !allowed });
  });
  void ses.setProxy(CHECKER_PROXY);
  // A plain Chrome's user agent, as the site's checker's browser has: not
  // this app's name and version, nor Electron's.
  const own = `${app.getName()}/${app.getVersion()}`;
  ses.setUserAgent(
    ses
      .getUserAgent()
      .split(own)
      .join("")
      .replace(/\sElectron\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return ses;
}

// --- one host page --------------------------------------------------------------------------------------

interface ChildSession {
  readonly targetId: string;
  readonly type: string;
}

/** The site's checker's page: the host bundle in a locked-down window, driven over the DevTools protocol. */
class Host implements ProbeCdp {
  readonly window: BrowserWindow;
  readonly contents: WebContents;
  private readonly gate: SessionGate;
  private readonly children = new Map<string, ChildSession>();
  private readonly frames = new Map<string, { sessionId: string; parent: string | null }>();
  private readonly contexts = new Map<string, Map<number, { frameId: string; isDefault: boolean }>>();
  private main = "";
  private readonly assets = new Map<string, Buffer>();
  private probe: DomProbe | null = null;
  private picture: Buffer | null = null;
  private failed: string | null = null;
  private closed = false;
  /** Fetch saw these and failed them (nothing outside the host page's own is fulfilled). */
  readonly refused: string[] = [];
  /** File choosers the page opened, intercepted (none is shown). */
  fileChoosers = 0;

  constructor(
    readonly lane: RuntimeLane,
    readonly ses: Session,
    private readonly runtime: VibeRuntime,
  ) {
    this.gate = gates.get(ses)!;
    this.window = new BrowserWindow({
      show: false,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      useContentSize: true,
      paintWhenInitiallyHidden: true,
      webPreferences: { ...CHECKER_WEB_PREFERENCES, session: ses },
    });
    const contents = (this.contents = this.window.webContents);
    contents.setWebRTCIPHandlingPolicy(CHECKER_WEBRTC_POLICY);
    contents.setAudioMuted(true);
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    // The page itself never navigates (the window loads it, which is no
    // navigation event); a frame that does is failed at the gate, as the
    // site's checker fails it (route.abort): the frame then shows an error.
    contents.on("will-navigate", (event) => event.preventDefault());
    contents.on("will-frame-navigate", (event) => {
      if (event.isMainFrame) event.preventDefault();
    });
    contents.on("will-redirect", (event) => {
      if (event.isMainFrame) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-prevent-unload", (event) => event.preventDefault());
    contents.on("login", (event, _details, _auth, callback) => {
      event.preventDefault();
      callback();
    });
    contents.on("select-bluetooth-device", (event, _devices, callback) => {
      event.preventDefault();
      callback("");
    });
    contents.on("ipc-message", () => this.fail("ipc"));
    contents.on("ipc-message-sync", (event) => {
      event.returnValue = null;
      this.fail("ipc");
    });
    contents.on("render-process-gone", () => this.fail("renderer-gone"));
    contents.on("unresponsive", () => this.fail("unresponsive"));
    this.window.on("closed", () => {
      this.closed = true;
    });
  }

  get usable(): boolean {
    return !this.failed && !this.closed && !this.contents.isDestroyed();
  }

  get failure(): string | null {
    return this.failed;
  }

  fail(reason: string): void {
    if (!this.failed) this.failed = reason;
    this.close();
  }

  close(): void {
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  // ProbeCdp

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    if (!this.usable) return Promise.reject(new CheckerUnavailable(`checker host retired (${this.failed ?? "closed"})`));
    const debuggerApi = this.contents.debugger;
    return sessionId ? debuggerApi.sendCommand(method, params, sessionId) : debuggerApi.sendCommand(method, params);
  }

  mainFrameId(): string {
    return this.main;
  }

  sessionOf(frameId: string): string | null {
    return this.frames.get(frameId)?.sessionId ?? null;
  }

  parentOf(frameId: string): string | null {
    return this.frames.get(frameId)?.parent ?? null;
  }

  frameOfSession(sessionId: string): string | null {
    if (sessionId === "") return this.main;
    return this.children.get(sessionId)?.targetId ?? null;
  }

  mainWorld(frameId: string): number | null {
    const sessionId = this.sessionOf(frameId);
    if (sessionId === null) return null;
    for (const [id, context] of this.contexts.get(sessionId) ?? []) {
      if (context.frameId === frameId && context.isDefault) return id;
    }
    return null;
  }

  alive(sessionId: string, contextId: number): boolean {
    return this.contexts.get(sessionId)?.has(contextId) ?? false;
  }

  // The protocol's events

  private onMessage(method: string, params: any, sessionId: string): void {
    switch (method) {
      case "Target.attachedToTarget":
        void this.attached(params, sessionId);
        return;
      case "Target.detachedFromTarget":
        this.detached(params.sessionId);
        return;
      case "Fetch.requestPaused":
        void this.paused(params, sessionId).catch(() => undefined);
        return;
      case "Runtime.executionContextCreated": {
        const context = params.context;
        const table = this.contexts.get(sessionId) ?? new Map();
        this.contexts.set(sessionId, table);
        const frameId = String(context.auxData?.frameId ?? "");
        const isDefault = Boolean(context.auxData?.isDefault);
        // A frame's new document's main world replaces the one before it at
        // once, before that one's "destroyed" comes (Playwright's
        // _contextCreated): a handle is never made in a world already gone.
        if (isDefault) for (const [id, known] of table) if (known.frameId === frameId && known.isDefault) table.delete(id);
        table.set(context.id, { frameId, isDefault });
        return;
      }
      case "Runtime.executionContextDestroyed":
        this.contexts.get(sessionId)?.delete(params.executionContextId);
        return;
      case "Runtime.executionContextsCleared":
        this.contexts.get(sessionId)?.clear();
        return;
      case "Page.frameAttached":
        this.frames.set(params.frameId, { sessionId, parent: params.parentFrameId ?? null });
        return;
      case "Page.frameNavigated": {
        const frame = params.frame;
        if (!frame?.id) return;
        if (!frame.parentId && sessionId === "") this.main = frame.id;
        const known = this.frames.get(frame.id);
        this.frames.set(frame.id, { sessionId, parent: frame.parentId ?? known?.parent ?? null });
        return;
      }
      case "Page.frameDetached":
        // A "swap" moves the frame to another process: its session comes with the new target.
        if (params.reason !== "swap" && this.frames.get(params.frameId)?.sessionId === sessionId) this.frames.delete(params.frameId);
        return;
      case "Runtime.bindingCalled":
        if (params.name === PROBE_BINDING) void this.probeCalled(params, sessionId);
        return;
      case "Page.fileChooserOpened":
        // Intercepted: no dialog is shown; the page sees no file, as in a headless browser.
        this.fileChoosers += 1;
        return;
      case "Page.javascriptDialogOpening":
        // Playwright dismisses a dialog nobody listens for.
        void this.send("Page.handleJavaScriptDialog", { accept: false }, sessionId || undefined).catch(() => undefined);
        return;
      case "Inspector.targetCrashed":
        this.fail("renderer-crashed");
        return;
      default:
    }
  }

  private registerTree(tree: any, sessionId: string, parent: string | null): void {
    const frame = tree?.frame;
    if (!frame?.id) return;
    this.frames.set(frame.id, { sessionId, parent: frame.parentId ?? parent ?? this.frames.get(frame.id)?.parent ?? null });
    for (const child of tree.childFrames ?? []) this.registerTree(child, sessionId, frame.id);
  }

  /** What every frame session gets before its target may run (crPage FrameSession._initialize, as the site's checker gets it). */
  private frameSessionSetup(sessionId: string): Array<Promise<unknown>> {
    const id = sessionId || undefined;
    const fonts = (this.runtime.fontFamilies as Record<string, unknown>)[process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux"];
    return [
      this.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, id),
      this.send("Page.enable", {}, id),
      this.send("Runtime.enable", {}, id),
      this.send("Network.enable", {}, id),
      this.send("Network.setCacheDisabled", { cacheDisabled: true }, id),
      this.send("Emulation.setEmulatedMedia", { media: "", features: MEDIA_FEATURES }, id),
      this.send("Page.setInterceptFileChooserDialog", { enabled: true }, id),
      this.send("Page.addScriptToEvaluateOnNewDocument", { source: SIDE_EFFECT_GUARD, runImmediately: true }, id),
      ...(fonts ? [this.send("Page.setFontFamilies", fonts as Record<string, unknown>, id)] : []),
      this.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, id),
    ];
  }

  private async attached(params: any, parentSession: string): Promise<void> {
    const sessionId: string = params.sessionId;
    const info = params.targetInfo ?? {};
    const type = String(info.type ?? "");
    this.children.set(sessionId, { targetId: String(info.targetId ?? ""), type });
    try {
      if (type === "iframe") {
        const known = this.frames.get(info.targetId);
        this.frames.set(info.targetId, { sessionId, parent: known?.parent ?? null });
        await Promise.all(this.frameSessionSetup(sessionId));
        const { frameTree } = await this.send("Page.getFrameTree", {}, sessionId);
        this.registerTree(frameTree, sessionId, known?.parent ?? null);
      } else if (type !== "worker") {
        // A shared or service worker, a page: nothing the host page makes;
        // it stays paused and the host is retired.
        this.fail(`unexpected-target:${type}`);
        return;
      }
      // A dedicated Worker's requests are its frame's, intercepted there (measured).
      await this.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A frame removed while it was being attached is no hole; anything else
      // is a frame running without interception: fail closed.
      if (!this.children.has(sessionId) || SESSION_GONE.test(message)) return;
      this.fail(`attach:${parentSession ? "nested" : "child"}:${message.slice(0, 80)}`);
    }
  }

  private detached(sessionId: string): void {
    this.children.delete(sessionId);
    this.contexts.delete(sessionId);
    for (const [frameId, frame] of this.frames) if (frame.sessionId === sessionId) this.frames.delete(frameId);
  }

  /** The site checker's context.route, request by request. */
  private async paused(params: any, sessionId: string): Promise<void> {
    const id = sessionId || undefined;
    const request = params.request ?? {};
    const fail = () => {
      if (this.refused.length < 256) this.refused.push(String(request.url ?? "").slice(0, 300));
      return this.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }, id);
    };
    const fulfill = (body: Buffer | string, headers: Record<string, string>) => {
      const bytes = Buffer.from(body);
      const responseHeaders = Object.entries(headers).map(([name, value]) => ({ name, value }));
      if (bytes.length) responseHeaders.push({ name: "content-length", value: String(bytes.length) });
      return this.send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders, body: b64(bytes) }, id);
    };
    let url: URL;
    try {
      url = new URL(String(request.url));
    } catch {
      await fail();
      return;
    }
    const method = String(request.method ?? "GET");
    const asset = this.assets.get(url.href);
    if (asset && method === "GET") {
      await fulfill(asset, { "access-control-allow-origin": "*" });
      return;
    }
    if (url.origin !== CHECKER_ORIGIN) {
      await fail();
      return;
    }
    if (url.pathname === SANDBOX_PATH && url.search === SANDBOX_QUERY) {
      await fulfill(method === "HEAD" ? "" : this.runtime.sandboxPage, { "content-type": "text/html", "content-security-policy": SANDBOX_CSP, ...NO_DNS_PREFETCH });
      return;
    }
    if (url.pathname === "/runtime.js") {
      await fulfill(this.runtime.bundles[this.lane], { "content-type": "text/javascript" });
      return;
    }
    if (url.pathname === "/") {
      await fulfill(HOST_HTML, { "content-type": "text/html", ...NO_DNS_PREFETCH });
      return;
    }
    await fail();
  }

  /** The DOM probe's binding: only the host page's own main world may call it. */
  private async probeCalled(params: any, sessionId: string): Promise<void> {
    const context = params.executionContextId as number;
    if (sessionId !== "" || context !== this.mainWorld(this.main) || !this.probe) return;
    let call: { id?: unknown; op?: unknown; index?: unknown };
    try {
      call = JSON.parse(String(params.payload));
    } catch {
      return;
    }
    if (!Number.isSafeInteger(call.id)) return;
    let ok = true;
    let value: unknown;
    try {
      value = await this.probe.op(call.op, call.index);
    } catch (error) {
      ok = false;
      value = error instanceof Error ? error.message : String(error);
    }
    const expression = `window.__mraiProbeSettle(${call.id}, ${ok}, ${JSON.stringify(value ?? null)})`;
    await this.send("Runtime.evaluate", { expression, contextId: context }).catch(() => undefined);
  }

  // Lifecycle

  async open(): Promise<void> {
    const contents = this.contents;
    // The debugger needs a document: the blank one first (no request).
    await this.window.loadURL("about:blank");
    const debuggerApi = contents.debugger;
    debuggerApi.attach("1.3");
    debuggerApi.on("message", (_event, method, params, sessionId) => this.onMessage(method, params, sessionId || ""));
    debuggerApi.on("detach", () => this.fail("debugger-detached"));
    const { frameTree } = await this.send("Page.getFrameTree");
    this.main = frameTree.frame.id;
    this.registerTree(frameTree, "", null);
    await Promise.all([
      ...this.frameSessionSetup(""),
      this.send("Emulation.setFocusEmulationEnabled", { enabled: true }),
      this.send("Emulation.setDeviceMetricsOverride", {
        mobile: false,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        screenWidth: VIEWPORT.width,
        screenHeight: VIEWPORT.height,
        deviceScaleFactor: 1,
        screenOrientation: { angle: 0, type: "landscapePrimary" },
      }),
    ]);
    if (this.lane === "dom") {
      this.probe = new DomProbe(this, this.runtime.injectedScript, (jpeg) => {
        if (jpeg.length <= SHOT_MAX_BYTES) this.picture = jpeg;
      });
      await this.send("Runtime.addBinding", { name: PROBE_BINDING });
      await this.send("Page.addScriptToEvaluateOnNewDocument", { source: probeShim() });
    }
    await this.window.loadURL(`${CHECKER_ORIGIN}/`);
    if (!this.usable) throw new CheckerUnavailable(this.failed ?? "closed");
    // Chromium's own process sandbox, as the site's checker requires it.
    const pid = contents.getOSProcessId();
    const metric = app.getAppMetrics().find((item) => item.pid === pid);
    if (process.platform !== "linux" && metric?.sandboxed !== true) {
      this.fail("sandbox-unavailable");
      throw new CheckerUnavailable("sandbox-unavailable");
    }
    const ready = await this.evaluate<boolean>("typeof window.MraiSharedHost === 'object' && window.MraiSharedHost !== null");
    if (!ready) throw new CheckerUnavailable("host-bundle-missing");
  }

  private async evaluate<T>(expression: string): Promise<T> {
    const contextId = this.mainWorld(this.main);
    if (contextId === null) throw new CheckerUnavailable("no-main-world");
    const answer = await this.send("Runtime.evaluate", { expression, contextId, returnByValue: true, awaitPromise: true });
    if (answer.exceptionDetails) throw new CheckerUnavailable("evaluation-failed");
    return answer.result?.value as T;
  }

  /** page.evaluate(({ method, input }) => window.MraiSharedHost[method](input)). */
  async run(method: string, input: unknown): Promise<unknown> {
    const contextId = this.mainWorld(this.main);
    if (contextId === null) throw new CheckerUnavailable("no-main-world");
    const answer = await this.send("Runtime.callFunctionOn", {
      functionDeclaration: "function (method, input) { return window.MraiSharedHost[method](input); }",
      executionContextId: contextId,
      arguments: [{ value: method }, { value: input }],
      awaitPromise: true,
      returnByValue: true,
    });
    if (answer.exceptionDetails) {
      if (process.env.MRAI_VIBE_CHECKER_DEBUG) console.error(`[classic] ${method}: ${JSON.stringify(answer.exceptionDetails).slice(0, 1500)}`);
      throw new Error("runtime-method-failed");
    }
    return answer.result?.value;
  }

  /** shared-runtime-browser.mjs prepare: the pinned Pyodide files, from the app's copy, for a Python check. */
  async prepare(language: unknown): Promise<void> {
    if (language !== "python") return;
    const pins = await this.evaluate<Array<{ url: unknown; bytes: unknown; sha256: unknown }>>("window.MraiSharedHost.pythonAssets");
    for (const pin of Array.isArray(pins) ? pins : []) {
      if (typeof pin.url === "string" && this.assets.has(pin.url)) continue;
      const bytes = readPyodideAsset(this.runtime, pin);
      this.assets.set(pin.url as string, bytes);
      this.gate.assets.add(pin.url as string);
    }
  }

  takePicture(): Buffer | null {
    const picture = this.picture;
    this.picture = null;
    return picture;
  }

  get blocked(): readonly string[] {
    return this.gate.blocked;
  }
}

/** The page side of the probe binding: Playwright's exposeBinding, for the host page's own frame only. */
function probeShim(): string {
  return `(() => {
  if (window.top !== window || location.origin !== ${JSON.stringify(CHECKER_ORIGIN)}) return;
  const call = globalThis[${JSON.stringify(PROBE_BINDING)}];
  if (typeof call !== "function") return;
  const pending = new Map();
  let next = 0;
  Object.defineProperty(window, "__mraiProbeSettle", {
    value: (id, ok, value) => {
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      if (ok) waiter.resolve(value); else waiter.reject(new Error(String(value)));
    },
  });
  window.__mraiDomPreflightProbe = (op, index) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    call(JSON.stringify({ id, op, index: index === undefined ? null : index }));
  });
})();`;
}



interface Slot {
  host: Host | null;
  generation: number;
  queue: Promise<unknown>;
  idle: NodeJS.Timeout | null;
}

export interface CheckerIdentity {
  readonly protocol: number;
  readonly checker_sha256: string;
  readonly manifest_sha256: string;
}

interface Answer {
  readonly checker: CheckerIdentity;
  readonly generation: number;
  readonly cold: boolean;
  readonly host_start_ms?: number;
  readonly result?: unknown;
  readonly error?: string;
  /** The window's picture as it opened (a DOM check of an html view), base64 JPEG. */
  readonly shot_jpeg?: string;
}

export class VibeChecker {
  private readonly slots = new Map<string, Slot>();
  readonly identity: CheckerIdentity;

  constructor(private readonly runtime: VibeRuntime) {
    this.identity = Object.freeze({ protocol: CHECKER_PROTOCOL, checker_sha256: checkerSha256(), manifest_sha256: runtime.manifestSha256 });
  }

   
  request(lane: RuntimeLane, slotIndex: number, request: unknown, cancelled: AbortSignal): Promise<Answer> {
    const key = `${lane}:${slotIndex}`;
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { host: null, generation: 0, queue: Promise.resolve(), idle: null };
      this.slots.set(key, slot);
    }
    const run = slot.queue.then(() => this.serve(lane, slotIndex, slot!, request, cancelled));
    slot.queue = run.catch(() => undefined);
    return run;
  }

  private async serve(lane: RuntimeLane, slotIndex: number, slot: Slot, request: unknown, cancelled: AbortSignal): Promise<Answer> {
    if (slot.idle) clearTimeout(slot.idle);
    const base = () => ({ checker: this.identity, generation: slot.generation });
    let cold = false;
    let startMs: number | undefined;
    const retire = () => {
      slot.host?.close();
      slot.host = null;
    };
    const onCancel = () => retire();
    cancelled.addEventListener("abort", onCancel);
    try {
      if (cancelled.aborted) return { ...base(), cold, error: "cancelled" };
      if (!slot.host || !slot.host.usable) {
        retire();
        const started = Date.now();
        cold = true;
        slot.generation += 1;
        const ses = checkerSession(`${lane}-${slotIndex}`);
        await ses.clearStorageData();
        await ses.clearCache();
        const host = new Host(lane, ses, this.runtime);
        slot.host = host;
        try {
          await Promise.race([
            host.open(),
            sleep(START_MS).then(() => {
              throw new CheckerUnavailable("start-timeout");
            }),
          ]);
        } catch (error) {
          const failure = host.failure;
          retire();
          const code = failure === "sandbox-unavailable" ? "sandbox-unavailable" : "unavailable";
          console.error(`[classic] window checker (${lane}) did not start: ${error instanceof Error ? error.message : error}`);
          return { ...base(), cold, host_start_ms: Date.now() - started, error: code };
        }
        startMs = Date.now() - started;
      }
      const host = slot.host!;
      const answer = await (lane === "action" ? this.action(host, request) : this.preflight(host, lane, request));
      if (!host.usable) retire();
      return { ...base(), cold, ...(startMs !== undefined ? { host_start_ms: startMs } : {}), ...answer };
    } catch (error) {
      retire();
      return { ...base(), cold, error: error instanceof CheckerUnavailable ? "unavailable" : "unavailable" };
    } finally {
      cancelled.removeEventListener("abort", onCancel);
      if (slot.host) {
        slot.idle = setTimeout(() => {
          slot.host?.close();
          slot.host = null;
        }, IDLE_MS);
        slot.idle.unref?.();
      }
    }
  }

  /** shared-app-server.mjs, one line. */
  private async action(host: Host, request: unknown): Promise<{ result: unknown }> {
    const value = (request ?? {}) as { kind?: unknown; language?: unknown; input?: { language?: unknown } };
    try {
      await host.prepare(value.kind === "prepare" ? value.language : value.input?.language);
    } catch {
      return { result: { ok: false, code: "shared_runtime_unavailable" } };
    }
    try {
      if (value.kind === "prepare") return { result: { ok: true } };
      if (value.kind !== "action") throw new Error("invalid-operation");
      const result = await raceHost(host, host.run("executeSharedAction", value.input), 30_000, "action-timeout");
      if (Buffer.byteLength(JSON.stringify({ id: "x", result })) > ACTION_MAX_ANSWER) throw new Error("output-too-large");
      return { result };
    } catch {
      return { result: { ok: false, code: "shared_action_rejected" } };
    }
  }

   
  private async preflight(host: Host, lane: RuntimeLane, request: unknown): Promise<{ result: unknown; shot_jpeg?: string }> {
    const unavailable = { result: { ok: false, code: "shared_preflight_unavailable", stage: "infrastructure" } };
    const value = (request ?? {}) as { kind?: unknown; source?: unknown; language?: unknown };
    if (value.kind !== "preflight") return unavailable;
    if (isSharedSource(value.source) !== (lane === "shared")) return unavailable;
    const input = { source: value.source, language: value.language };
    try {
      let result: unknown;
      if (lane === "dom") {
        host.takePicture();
        result = await raceHost(host, host.run("preflightDomWidget", input), DOM_RUN_SECONDS * 1000, "dom-preflight-timeout");
      } else {
        result = await raceHost(
          host,
          (async () => {
            await host.prepare(input.language);
            return host.run("preflightSharedApp", input);
          })(),
          PREFLIGHT_SECONDS * 1000,
          "preflight-timeout",
        );
      }
      if (JSON.stringify(result).length > PREFLIGHT_MAX_ANSWER) return unavailable;
      const picture = lane === "dom" ? host.takePicture() : null;
      const ok = (result as { ok?: unknown } | null)?.ok === true;
      return { result, ...(ok && picture ? { shot_jpeg: picture.toString("base64") } : {}) };
    } catch (error) {
      if (process.env.MRAI_VIBE_CHECKER_DEBUG) console.error(`[classic] window check (${lane}) failed: ${error instanceof Error ? error.stack : error}`);
      return unavailable;
    }
  }

  close(): void {
    for (const slot of this.slots.values()) {
      if (slot.idle) clearTimeout(slot.idle);
      slot.host?.close();
      slot.host = null;
    }
  }

  /** For the tests: the hosts' windows and what their gates and interception refused. */
  inspect(): Array<{ lane: string; contents: WebContents; session: Session; blocked: readonly string[]; refused: readonly string[]; fileChoosers: number }> {
    const out = [];
    for (const [key, slot] of this.slots) {
      const host = slot.host;
      if (host && host.usable) {
        out.push({ lane: key, contents: host.contents, session: host.ses, blocked: host.blocked, refused: host.refused, fileChoosers: host.fileChoosers });
      }
    }
    return out;
  }
}

/** A run that does not answer in time leaves a busy page: the host is retired (vibe-preflight-server.mjs exits). */
async function raceHost<T>(host: Host, work: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          host.fail(code);
          reject(new CheckerUnavailable(code));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// --- the port the API asks on ---------------------------------------------------------------------------

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LANE_NAMES = new Set<RuntimeLane>(["shared", "dom", "action"]);

/** Starts the checker's port; null when the closure cannot be trusted or the port cannot be had. */
export function startVibeChecker(
  launch: VibeCheckerLaunch,
  runtimeDir: string | null,
  pyodideDir: string | null,
): Promise<{ server: http.Server; checker: VibeChecker } | null> {
  if (!runtimeDir) {
    console.error("[classic] window checker: no closure in this build");
    return Promise.resolve(null);
  }
  let runtime: VibeRuntime;
  try {
    runtime = loadVibeRuntime(runtimeDir, pyodideDir);
  } catch (error) {
    console.error(`[classic] window checker unavailable: ${error instanceof VibeRuntimeError ? error.message : String(error)}`);
    return Promise.resolve(null);
  }
  const checker = new VibeChecker(runtime);
  const server = http.createServer((req, res) => {
    const answer = (status: number, body: unknown) => {
      if (res.headersSent || res.writableEnded) return;
      const encoded = Buffer.from(JSON.stringify(body));
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-length": String(encoded.length) });
      res.end(encoded);
    };
    const auth = req.headers.authorization ?? "";
    if (
      req.method !== "POST" ||
      req.url !== "/v1/check" ||
      req.headers.host !== `127.0.0.1:${launch.vibePort}` ||
      req.headers.origin !== undefined ||
      !auth.startsWith("Bearer ") ||
      !sameSecret(auth.slice("Bearer ".length), launch.vibeToken)
    ) {
      req.resume();
      answer(404, { error: "not found" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        answer(413, { error: "too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_REQUEST_BYTES) return;
      let body: { lane?: unknown; slot?: unknown; request?: unknown };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        answer(400, { error: "bad request" });
        return;
      }
      const lane = body?.lane as RuntimeLane;
      const slot = body?.slot;
      if (!LANE_NAMES.has(lane) || !Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= MAX_SLOTS) {
        answer(400, { error: "bad request" });
        return;
      }
      // The API gave up (its own deadline, a cancelled check): the page that
      // was busy with it is retired, as the site's host process is.
      const abort = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) abort.abort();
      });
      void checker.request(lane, slot as number, body.request, abort.signal).then((result) => answer(200, result));
    });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 10_000;
  return new Promise((resolve) => {
    server.once("error", (error) => {
      console.error(`[classic] window checker could not listen: ${error.message}`);
      checker.close();
      resolve(null);
    });
    server.listen(launch.vibePort, "127.0.0.1", () => resolve({ server, checker }));
  });
}
