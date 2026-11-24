/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The AI's way into one app at a time (computer_screen's app actions): list
 * the apps, read an app's own window — its outline of elements and a picture
 * of that window alone, whether it is in front or not, the app opened in the
 * background when it is not running — and act on an element by its id, with
 * keys and text going to that app only. After a step the window is read
 * again once it has stopped changing (app-state.ts settle), so the answer is
 * the window as it now is.
 *
 * macOS: the bundled helper (native/mac/computer-control.swift) kept running
 * (`serve`), so an element keeps its id between reads. Windows: UI
 * Automation and user32 through PowerShell (agent-apps-win.ts).
 *
 * No Electron here (agent-screen.ts passes the helper's path), so the parts
 * that need no system are tested with node --test.
 */

import { ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AppEntry, AppNode, Snapshot, WindowGeometry, matchApp, pictureSize, pictureToScreen, screenToPicture, settle, snapshotOf, treeAnswer,
} from "./app-state";
import { winScript } from "./agent-apps-win";

export type Answer = Record<string, unknown> & { ok: boolean };

function run(file: string, args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      const code = error ? Number((error as NodeJS.ErrnoException & { code?: unknown }).code) || 1 : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });
}

// ------------------------------------------------------------ the Mac helper, kept running

/** One helper process answering one JSON line per request. */
export class HelperProcess {
  private child: ChildProcess | null = null;
  private buffer = "";
  private next = 1;
  private pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; timer: NodeJS.Timeout }>();
  /** Bumped each time a new process starts: element ids of an earlier one mean nothing to it. */
  generation = 0;

  constructor(private readonly file: () => string, private readonly args: string[] = ["serve"]) {}

  private start(): ChildProcess {
    const child = spawn(this.file(), this.args, { stdio: ["pipe", "pipe", "ignore"] });
    this.generation += 1;
    this.buffer = "";
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      this.buffer += chunk;
      let end = this.buffer.indexOf("\n");
      while (end >= 0) {
        const text = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        end = this.buffer.indexOf("\n");
        let value: Record<string, unknown>;
        try {
          value = JSON.parse(text);
        } catch {
          continue;
        }
        const waiting = this.pending.get(Number(value.id));
        if (!waiting) continue;
        this.pending.delete(Number(value.id));
        clearTimeout(waiting.timer);
        delete value.id;
        waiting.resolve(value);
      }
    });
    const ended = () => {
      if (this.child === child) this.child = null;
      for (const [id, waiting] of this.pending) {
        clearTimeout(waiting.timer);
        waiting.resolve({ error: "helper_exited" });
        this.pending.delete(id);
      }
    };
    child.on("exit", ended);
    child.on("error", ended);
    this.child = child;
    return child;
  }

  request(body: Record<string, unknown>, timeoutMs = 25_000): Promise<Record<string, unknown>> {
    const child = this.child && this.child.exitCode === null ? this.child : this.start();
    const id = this.next++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // A hung app can hold the helper: it is started again, ids and all.
        this.pending.delete(id);
        resolve({ error: "helper_timeout", message: "The app did not answer in time." });
        this.stop();
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      child.stdin!.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) child.kill();
  }
}

let helperFile: () => string = () => "mrai-computer";
let helper: HelperProcess | null = null;

/** Where the Mac helper is (agent-screen.ts knows the package's layout). */
export function useHelper(file: () => string): void {
  helperFile = file;
}

function mac(body: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>> {
  helper ??= new HelperProcess(() => helperFile());
  return helper.request(body, timeoutMs);
}

// ------------------------------------------------------------ Windows

async function powershell(script: string, timeout = 60_000): Promise<Record<string, unknown>> {
  // From a file: a step's text can be longer than a command line takes. With
  // a byte-order mark, which Windows PowerShell needs to read it as UTF-8.
  const file = path.join(os.tmpdir(), `mrai-apps-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(file, `\ufeff${script}`, "utf8");
  let result: { stdout: string; stderr: string; code: number };
  try {
    result = await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], timeout);
  } finally {
    fs.rmSync(file, { force: true });
  }
  const last = result.stdout.trim().split("\n").pop() || "";
  try {
    const value = JSON.parse(last);
    return value && typeof value === "object" ? value : { error: "bad_answer" };
  } catch {
    return { error: "powershell_failed", message: (result.stderr || result.stdout || "powershell failed").slice(0, 300) };
  }
}

function win(op: string, request: Record<string, unknown>, timeout?: number): Promise<Record<string, unknown>> {
  return powershell(winScript(op, request), timeout);
}

// ------------------------------------------------------------ what the AI was shown of each app

interface Seen {
  generation: number;
  windowKey: string;
  snapshot: Snapshot;
  geometry: WindowGeometry | null;
  /** Windows: the window and its process, as the last read found them. */
  hwnd?: number;
  pid?: number;
  /** Mac: the window server's number of the window, for events sent to it. */
  windowNumber?: number;
}

/** Per app (by bundle id or path): the last read, to answer the next with what changed. */
const seen = new Map<string, Seen>();
/** Windows: element ids the AI reads (small numbers) for UI Automation's runtime ids. */
const winIds = new Map<string, { byRuntime: Map<string, number>; byId: Map<number, string>; next: number }>();

function shortId(appKey: string, runtime: string): number {
  let book = winIds.get(appKey);
  if (!book) {
    book = { byRuntime: new Map(), byId: new Map(), next: 1 };
    winIds.set(appKey, book);
  }
  let id = book.byRuntime.get(runtime);
  if (id === undefined) {
    id = book.next++;
    book.byRuntime.set(runtime, id);
    book.byId.set(id, runtime);
  }
  return id;
}

export function runtimeIdOf(appKey: string, id: number): string | undefined {
  return winIds.get(appKey)?.byId.get(id);
}

function appKeyOf(app: Record<string, unknown> | undefined): string {
  return String(app?.bundle || app?.id || app?.path || app?.name || "");
}

export const PAUSED_WHILE_LOCKED =
  "The screen is locked: actions on this computer are paused until the person unlocks it. Nothing was done. Tell them, or try again later.";

async function locked(): Promise<boolean> {
  if (process.platform === "darwin") return (await mac({ cmd: "locked" }, 5_000)).locked === true;
  if (process.platform === "win32") return (await win("locked", {}, 20_000)).locked === true;
  return false;
}

/**
 * Waits (up to a minute) while the screen is locked: a step is never made
 * on a locked computer. Null when it is unlocked (at once or later).
 */
export async function pausedWhileLocked(waitMs = 60_000): Promise<Answer | null> {
  if (!(await locked())) return null;
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (!(await locked())) return null;
  }
  return { ok: false, error: "screen_locked", message: PAUSED_WHILE_LOCKED };
}

// ------------------------------------------------------------ listing

export async function listApps(limit = 300): Promise<Answer> {
  if (process.platform === "darwin") {
    const answer = await mac({ cmd: "apps", limit }, 30_000);
    if (answer.error) return { ok: false, ...answer };
    return { ok: true, apps: answer.apps };
  }
  if (process.platform === "win32") {
    const apps = await winApps(true);
    if (!Array.isArray(apps)) return apps;
    return { ok: true, apps: apps.slice(0, limit).map(({ hwnd: _hwnd, names: _names, ...app }) => app) };
  }
  return { ok: false, error: "unsupported_system" };
}

// ------------------------------------------------------------ reading an app

interface Read {
  ok: boolean;
  error?: unknown;
  app?: Record<string, unknown>;
  window?: Record<string, unknown>;
  windows?: unknown;
  menus?: unknown;
  nodes?: AppNode[];
  busy?: boolean;
  focused?: unknown;
  truncated?: boolean;
  offscreen?: unknown;
  launched?: boolean;
  reopened?: boolean;
  matched?: unknown;
  [key: string]: unknown;
}

/** Windows: the app the AI named, found among the Start menu's apps and the running ones. */
let winAppsCache: { at: number; apps: Array<AppEntry & Record<string, unknown>> } | null = null;

async function winApps(fresh = false): Promise<Array<AppEntry & Record<string, unknown>> | Answer> {
  if (!fresh && winAppsCache && Date.now() - winAppsCache.at < 20_000) return winAppsCache.apps;
  const listed = await win("apps", {});
  if (listed.error) return { ok: false, ...listed };
  winAppsCache = { at: Date.now(), apps: (listed.apps as Array<AppEntry & Record<string, unknown>> | undefined) ?? [] };
  return winAppsCache.apps;
}

async function winTarget(name: string): Promise<{ ok: true; target: Record<string, unknown> } | { ok: false; answer: Answer }> {
  let apps = await winApps();
  if (!Array.isArray(apps)) return { ok: false, answer: apps };
  let found = matchApp(name, apps);
  if (!found || !found.app.running) {
    // Started or closed since the list was made: the list again, now.
    apps = await winApps(true);
    if (!Array.isArray(apps)) return { ok: false, answer: apps };
    found = matchApp(name, apps);
  }
  if (!found) {
    return { ok: false, answer: { ok: false, error: "app_not_found", message: `No app named ${name} on this computer; list_apps lists them.` } };
  }
  return { ok: true, target: { ...found.app, matched: found.matched } };
}

async function readApp(request: Record<string, unknown>): Promise<Read> {
  const name = String(request.app ?? "").trim();
  if (!name) return { ok: false, error: "name_an_app" };
  if (process.platform === "darwin") {
    const answer = await mac({ cmd: "state", app: name, window: request.window, limit: request.limit });
    if (answer.error) return { ok: false, ...answer } as Read;
    const window = answer.window as Record<string, unknown> | undefined;
    return { ok: true, ...answer, nodes: (answer.nodes as AppNode[] | undefined) ?? [], window } as Read;
  }
  if (process.platform === "win32") {
    const target = await winTarget(name);
    if (!target.ok) return target.answer as Read;
    const answer = await win("state", { target: target.target, window: request.window, limit: request.limit }, 90_000);
    if (answer.error) return { ok: false, ...answer } as Read;
    const key = appKeyOf(answer.app as Record<string, unknown>);
    const nodes = ((answer.nodes as AppNode[] | undefined) ?? []).map((node) => ({ ...node, rid: String(node.id), id: shortId(key, String(node.id)) }));
    return { ok: true, ...answer, nodes } as Read;
  }
  return { ok: false, error: "unsupported_system" };
}

function geometryOf(window: Record<string, unknown> | undefined): WindowGeometry | null {
  if (!window || !Number(window.w) || !Number(window.h)) return null;
  const size = pictureSize(Number(window.w), Number(window.h), Number(window.scale ?? 1));
  return { x: Number(window.x), y: Number(window.y), w: Number(window.w), h: Number(window.h), pictureWidth: size.width, pictureHeight: size.height };
}

/** The window's own picture (not the screen's): Mac screencapture -l, Windows PrintWindow. */
async function windowPicture(read: Read, geometry: WindowGeometry | null): Promise<{ jpeg: string; width: number; height: number } | { note: string }> {
  const window = read.window;
  if (!window || !geometry) return { note: "no window to show" };
  if (window.minimized) return { note: "the window is minimized: no picture of it" };
  const file = path.join(os.tmpdir(), `mrai-window-${process.pid}-${Date.now()}.jpg`);
  try {
    if (process.platform === "darwin") {
      const granted = await mac({ cmd: "permissions" }, 5_000);
      if (!granted.screen) return { note: "Screen Recording is not allowed for MR Note: no picture, the outline only" };
      if (!window.number) return { note: "the window's picture is not available" };
      const taken = await run("/usr/sbin/screencapture", ["-x", "-o", `-l${Number(window.number)}`, "-t", "jpg", file]);
      if (taken.code !== 0 || !fs.existsSync(file)) return { note: "the window's picture could not be taken" };
      await run("/usr/bin/sips", ["--resampleWidth", String(geometry.pictureWidth), "-s", "formatOptions", "70", file]);
    } else if (process.platform === "win32") {
      const shot = await win("shot", { hwnd: window.hwnd, file, width: geometry.pictureWidth, height: geometry.pictureHeight }, 30_000);
      if (shot.error || !fs.existsSync(file)) return { note: "the window's picture could not be taken" };
    } else {
      return { note: "no picture on this system" };
    }
    return { jpeg: fs.readFileSync(file).toString("base64"), width: geometry.pictureWidth, height: geometry.pictureHeight };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** The answer the AI reads about an app's window. */
async function present(read: Read, request: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<Answer> {
  const app = read.app ?? {};
  const key = appKeyOf(app);
  const window = read.window;
  const geometry = geometryOf(window);
  const windowKey = `${window?.id ?? window?.hwnd ?? ""}`;
  const generation = process.platform === "darwin" ? helper?.generation ?? 0 : 0;
  const before = seen.get(key);
  const previous = before && before.generation === generation && before.windowKey === windowKey ? before.snapshot : null;
  const nodes = read.nodes ?? [];
  const tree = treeAnswer(nodes, geometry, previous, { full: request.full === true });
  seen.set(key, {
    generation, windowKey, snapshot: snapshotOf(nodes), geometry,
    hwnd: window?.hwnd as number | undefined, pid: app.pid as number | undefined,
    windowNumber: window?.number as number | undefined,
  });
  const out: Answer = {
    ok: true,
    app: { name: app.name, bundle: app.bundle ?? app.id, pid: app.pid, front: Boolean(app.front) },
    ...(read.matched && read.matched !== "name" && read.matched !== "exact" ? { matched: read.matched } : {}),
    ...(read.launched ? { launched: true } : {}),
    ...(read.reopened ? { reopened: true } : {}),
    windows: read.windows,
    ...(read.menus ? { menus: read.menus } : {}),
    ...extra,
  };
  if (!window) {
    out.window = null;
    out.tree = [];
    out.note = "The app is running with no window open. Open one from its menus (action menu) or with open_app.";
    return out;
  }
  out.window = { title: window.title, ...(geometry ? { width: geometry.pictureWidth, height: geometry.pictureHeight } : {}), ...(window.minimized ? { minimized: true } : {}) };
  out.tree = tree.lines;
  out.diff = tree.diff;
  if (tree.diff && tree.lines.length === 0) out.tree = ["(nothing changed since the last read)"];
  if (read.truncated) out.truncated = true;
  if (read.busy) out.busy = true;
  if (read.focused !== undefined) {
    const focused = nodes.find((node) => String((node as AppNode & { rid?: string }).rid ?? node.id) === String(read.focused) || node.id === read.focused);
    if (focused) out.focused = focused.id;
  }
  // Every element the window has now, as the runtime checks a step's risk by
  // (the API keeps it; the AI reads the tree).
  out.controls = nodes.map((node) => {
    const row: unknown[] = [node.id, node.role, node.label ?? "", node.sub ?? "", (node.flags ?? []).join(",")];
    if (geometry && node.w && node.h && node.x !== undefined && node.y !== undefined) {
      // Its box in the picture's pixels: a click at x,y is judged by what is there.
      const from = screenToPicture(geometry, node.x, node.y);
      const to = screenToPicture(geometry, node.x + node.w, node.y + node.h);
      row.push([from.x, from.y, to.x, to.y]);
    }
    return row;
  });
  if (request.picture !== false) {
    const picture = await windowPicture(read, geometry);
    if ("jpeg" in picture) Object.assign(out, picture);
    else out.picture_note = picture.note;
  }
  return out;
}

export async function appState(request: Record<string, unknown>): Promise<Answer> {
  const read = await readApp(request);
  if (!read.ok) return read as Answer;
  return present(read, request);
}

// ------------------------------------------------------------ acting on an app

const ELEMENT_OPS = new Set(["set_value", "select_text", "action"]);

export async function appAct(action: string, request: Record<string, unknown>): Promise<Answer> {
  const name = String(request.app ?? "").trim();
  if (!name) return { ok: false, error: "name_an_app" };
  const op = action === "secondary_action" ? "action" : action === "type" && request.paste === true ? "paste" : action;
  if (ELEMENT_OPS.has(op) && request.element === undefined) return { ok: false, error: "name_an_element", message: `${action} needs an element id from get_app_state.` };
  // Where the app's window was when the AI was shown it: a point of that picture.
  let key = "";
  let known: Seen | undefined;
  let winApp: Record<string, unknown> = {};
  if (process.platform === "darwin") {
    const resolved = await mac({ cmd: "resolve", app: name }, 15_000);
    if (resolved.error) return { ok: false, ...resolved };
    key = appKeyOf(resolved.app as Record<string, unknown>);
  } else if (process.platform === "win32") {
    const target = await winTarget(name);
    if (!target.ok) return target.answer;
    winApp = target.target;
    key = appKeyOf(target.target);
  }
  known = seen.get(key);
  const body: Record<string, unknown> = {
    op, element: request.element, button: request.button, count: request.count, key: request.key, repeat: request.repeat,
    text: request.text, value: request.value, name: request.name, path: request.menu, start: request.start, length: request.length,
    dx: request.dx, dy: request.dy, background_only: request.background_only === true ? true : undefined,
  };
  for (const [from, to] of [["x", "y"], ["to_x", "to_y"]] as const) {
    if (request[from] !== undefined && request[to] !== undefined) {
      if (!known?.geometry) return { ok: false, error: "read_the_app_first", message: "Read the app (get_app_state) before pointing at its picture." };
      const point = pictureToScreen(known.geometry, Number(request[from]), Number(request[to]));
      body[from] = point.x;
      body[to] = point.y;
    }
  }
  let done: Record<string, unknown>;
  if (process.platform === "darwin") {
    if (body.element !== undefined && known && known.generation !== helper?.generation) {
      return { ok: false, error: "element_unknown", message: "The app was read before the helper restarted: read it again (get_app_state)." };
    }
    done = await mac({ cmd: "act", app: name, ...body, window_number: known?.windowNumber });
  } else if (process.platform === "win32") {
    if (body.element !== undefined) {
      const runtime = runtimeIdOf(key, Number(body.element));
      if (!runtime) return { ok: false, error: "element_unknown", message: "Read the app again (get_app_state): that id is not from its last read." };
      body.element = runtime;
    }
    done = await win("act", { target: { ...winApp, pid: known?.pid ?? winApp.pid, hwnd: known?.hwnd ?? winApp.hwnd }, window: request.window, ...body }, 60_000);
  } else {
    return { ok: false, error: "unsupported_system" };
  }
  if (done.error) return { ok: false, ...done };
  const step = { method: done.method, ...(done.target ? { target: done.target } : {}), ...(done.brought_forward_briefly ? { brought_forward_briefly: true } : {}),
    ...(done.clipboard_restored !== undefined ? { clipboard_restored: done.clipboard_restored } : {}) };
  if (request.after === "none") return { ok: true, done: step };
  // The window once it has stopped changing: about a second, up to five while it loads.
  const settled = await settle(() => readApp({ app: name, window: request.window, limit: request.limit }));
  if (!settled.state.ok) return { ok: true, done: step, note: "The step was made; the app could not be read after it." };
  return present(settled.state, request, { done: step, waited_ms: Math.round(settled.waitedMs), ...(settled.settled ? {} : { still_changing: true }) });
}

/** Opens (or reopens the window of) an app in the background, then reads it. */
export async function openApp(request: Record<string, unknown>): Promise<Answer> {
  const name = String(request.app ?? request.name ?? "").trim();
  if (!name) return { ok: false, error: "name_an_app" };
  return appState({ ...request, app: name });
}

export function stopHelper(): void {
  helper?.stop();
}
