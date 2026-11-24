/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Note Classic's two local processes (docs/desktop-classic.md): the
 * API (Python, apps/api in desktop mode) and the web server (Node,
 * apps/web/desktop-server.mjs). Both listen on 127.0.0.1 only, on ports
 * chosen at each launch, and get the launch's secrets in their environment
 * (never on a command line, which other programs can read).
 *
 * Packaged, everything comes from the app's resources (runtime/, api/,
 * web/, engine-host/); `npm run dev:classic` runs them from the checkout.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { app } from "electron";
import { ensureLibreOfficeFonts, libreOfficeBinary } from "./libreoffice";
import { localModelDir } from "./local-model";

import { printerEnabled } from "./printer";
import { checkerSha256, vibeCheckerEnabled } from "./vibe-checker";
import { openServiceLog } from "./service-log";
import { portsAvoiding } from "./web-port";
import { componentRoot } from "../component";

export interface Layout {
  /** The Python interpreter. */
  readonly python: string;
  /** The Node binary that runs the web server and the engines. */
  readonly node: string;
  /** apps/api (its `app` package). */
  readonly apiDir: string;
  /** The built web app (or apps/web in development). */
  readonly webDir: string;
  /** The engine host closure, absent in development (the checkout's). */
  readonly engineHostRoot: string | null;
  /**
   * The editor-command host (host.cjs and its node_modules,
   * scripts/classic-editor-host.mjs); absent in development (the checkout's
   * own build, tmp/editor-command-host).
   */
  readonly editorCommandHostDir: string | null;
  /** Fonts the API's exports embed. */
  readonly fontsDir: string;
  /** The profile carried by this build (resources/profile.json). */
  readonly bundledProfile: string | null;
  /** The window checker's closure (./vibe-runtime.ts), absent when the build has none. */
  readonly vibeRuntimeDir: string | null;
  /** The pinned Pyodide files a shared Python window is checked with (the code window's copy). */
  readonly pyodideDir: string | null;
  readonly development: boolean;
}

export interface Launch {
  readonly apiPort: number;
  readonly webPort: number;
  readonly objectStorePort: number;
  /** The shell's printer (./printer.ts): the API's PDF exports drawn in this app's Chromium. */
  readonly printerPort: number;
  readonly printerToken: string;
  /** The shell's window checker (./vibe-checker.ts): the AI's windows checked in this app's Chromium. */
  readonly vibePort: number;
  readonly vibeToken: string;
  /** The shell's agent control (./agent-control.ts): the AI's browser and the screen. */
  readonly agentPort: number;
  readonly agentToken: string;
  readonly launchToken: string;
  readonly shellSecret: string;
  readonly webOrigin: string;
  readonly apiOrigin: string;
}

const CLOUD_ORIGIN = (process.env.MRAI_CLASSIC_CLOUD_ORIGIN || "https://mr-note.com").replace(/\/$/, "");

export function cloudOrigin(): string {
  return CLOUD_ORIGIN;
}

export function layout(): Layout {
  // MRAI_CLASSIC_RESOURCES: an unpackaged run on a staged layout
  // (.classic-stage/<target>, scripts/classic-assemble.mjs), to try a build
  // before packing it.
  const staged = componentRoot() ?? undefined;
  if (staged) {
    const resources = staged || process.resourcesPath;
    const windows = process.platform === "win32";
    return {
      // An unpackaged run may put a wrapper in front of the staged Python
      // (a profiler, for a benchmark); a packed app never reads it.
      python: (!app.isPackaged && process.env.MRAI_CLASSIC_PYTHON) || (windows
        ? path.join(resources, "runtime", "python", "python.exe")
        : path.join(resources, "runtime", "python", "bin", "python3")),
      node: windows
        ? path.join(resources, "runtime", "node", "node.exe")
        : path.join(resources, "runtime", "node", "bin", "node"),
      // A small copy of the repository's layout (scripts/classic-assemble.mjs):
      // the API finds the web app's fonts and data where a checkout has them.
      apiDir: path.join(resources, "mrnote", "apps", "api"),
      webDir: path.join(resources, "mrnote", "apps", "web"),
      engineHostRoot: path.join(resources, "mrnote", "engine-host"),
      editorCommandHostDir: path.join(resources, "mrnote", "editor-command-host"),
      fontsDir: path.join(resources, "mrnote", "apps", "web", "public", "fonts"),
      bundledProfile: path.join(resources, "mrnote", "profile.json"),
      vibeRuntimeDir: path.join(resources, "mrnote", "vibe-runtime"),
      pyodideDir: path.join(resources, "mrnote", "apps", "web", "pyodide", "v0.26.2", "full"),
      development: false,
    };
  }
  // npm run dev:classic, from apps/desktop.
  const repo = path.resolve(__dirname, "..", "..", "..", "..");
  return {
    python: process.env.MRAI_CLASSIC_PYTHON || path.join(repo, "apps", "api", ".venv", "bin", "python"),
    node: process.env.MRAI_CLASSIC_NODE || "node",
    apiDir: path.join(repo, "apps", "api"),
    webDir: path.join(repo, "apps", "web"),
    engineHostRoot: null,
    editorCommandHostDir: null,
    fontsDir: path.join(repo, "apps", "web", "public", "fonts"),
    bundledProfile: null,
    // node apps/web/scripts/build-vibe-runtime.mjs <dir> --desktop
    vibeRuntimeDir: process.env.MRAI_CLASSIC_VIBE_RUNTIME || null,
    pyodideDir: process.env.MRAI_CLASSIC_VIBE_PYODIDE || null,
    development: true,
  };
}

/** The app's data: SQLite database, objects, profile, secrets. */
export function dataDir(): string {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

const secret = (bytes = 32) => randomBytes(bytes).toString("hex");

/**
 * The signing key of the local sessions, kept across launches so a window
 * reopened after a restart is still signed in. Readable by this user only.
 */
function sessionKey(): string {
  const file = path.join(dataDir(), "session-key");
  try {
    const value = fs.readFileSync(file, "utf8").trim();
    if (value.length >= 64) return value;
  } catch {
    // First launch.
  }
  const value = secret(48);
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

/** `keepFree`: the web server's remembered port (./web-port.ts), which none
 * of this launch's other services may take. */
export async function prepareLaunch(keepFree = 0): Promise<Launch> {
  const picked = await Promise.all([freePort(), freePort(), freePort(), freePort(), freePort(), freePort()]);
  const [apiPort, webPort, objectStorePort, printerPort, agentPort, vibePort] = await portsAvoiding(picked, keepFree, freePort);
  return {
    apiPort,
    webPort,
    objectStorePort,
    printerPort,
    printerToken: secret(),
    vibePort,
    // New at every launch: only this launch's API can ask the checker.
    vibeToken: secret(),
    agentPort,
    agentToken: secret(),
    launchToken: secret(),
    shellSecret: secret(),
    webOrigin: `http://127.0.0.1:${webPort}`,
    apiOrigin: `http://127.0.0.1:${apiPort}`,
  };
}

export function profileFile(): string {
  return path.join(dataDir(), "profile.json");
}

function baseEnv(): NodeJS.ProcessEnv {
  // Only what a process needs: nothing of the shell's own environment leaks
  // into the services (and nothing of theirs into the engines).
  const keep = ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "APPDATA", "LOCALAPPDATA"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) if (process.env[key]) env[key] = process.env[key];
  return env;
}







export function apiEnv(
  where: Layout,
  launch: Launch,
  background = false,
  /** Started to open a document: the conversion zygote is forked before the
   * API imports itself, and is warm when the document's import is asked for
   * (app/desktop/serve.py). */
  openingDocuments = false,
  /** The documents to be imported (not ones that open the page they became):
   * each read in a process of its own while the API imports itself, for
   * their import to take (app/desktop/launch_preread.py). */
  readAhead: readonly string[] = [],
  /** What the shell already knows as it starts the API (both handed over
   * here instead of by a call once it answers, each a round trip at the
   * busiest moment of a launch, ahead of the window's own requests):
   * `signedIn`, whether it has a sign-in to hand over (none: the API starts
   * signed out and holds no request for it); `localFiles`, the documents the
   * launch opens with the tokens the shell named them by (./local-files.ts). */
  atStart: { signedIn: boolean; localFiles?: readonly { path: string; token: string }[] } = { signedIn: true },
): NodeJS.ProcessEnv {
  const data = dataDir();
  const opening = openingDocuments && !background;
  const env: NodeJS.ProcessEnv = {
    ...baseEnv(),
    ...(background ? { IMPORT_CONVERSION_ZYGOTE_ENABLED: "false" } : {}),
    ...(opening ? { MRAI_DESKTOP_OPENING_FILE: "1" } : {}),
    ...(opening && readAhead.length ? { MRAI_DESKTOP_OPENING_PATHS: JSON.stringify(readAhead.slice(0, 2)) } : {}),
    ENV: "local",
    MRAI_DESKTOP_MODE: "classic",
    MRAI_DESKTOP_DATA_DIR: data,
    MRAI_DESKTOP_LAUNCH_TOKEN: launch.launchToken,
    MRAI_DESKTOP_OBJECT_STORE_PORT: String(launch.objectStorePort),
    MRAI_DESKTOP_WEB_ORIGIN: launch.webOrigin,
    MRAI_DESKTOP_CLOUD_ORIGIN: CLOUD_ORIGIN,
    MRAI_DESKTOP_PROFILE_FILE: profileFile(),
    // No .env file is read: everything is set here.
    MRNOTE_ENV_FILE: path.join(data, "no-such.env"),
    DATABASE_URL: `sqlite:///${path.join(data, "mrai.db").replace(/\\/g, "/")}`,
    RUNTIME_STATE_BACKEND: "memory",
    // Nothing listens there: clients that would use Redis fail at once and
    // take their in-process paths.
    REDIS_URL: "redis://127.0.0.1:1/0",
    S3_ENDPOINT: `http://127.0.0.1:${launch.objectStorePort}`,
    S3_ACCESS_KEY: secret(16),
    S3_SECRET_KEY: secret(16),
    JWT_SECRET: sessionKey(),
    CORS_ORIGINS: launch.webOrigin,
    PDF_PARSER_SANDBOX_MODE: "local",
    PDF_CJK_FONT_PATH: path.join(where.fontsDir, "NotoSansSC-Regular.ttf"),
    MRAI_OFFICE_FONTS_DIR: path.join(where.fontsDir, "office"),
    // PDF exports and prints drawn by the editor, in the shell's own Chromium
    // (./printer.ts; page_preview_render.py's desktop printer): its job
    // address and token. MRAI_CLASSIC_PRINTER=0 leaves it out (the old drawing).
    ...(printerEnabled()
      ? { MRAI_DESKTOP_PRINTER_URL: `http://127.0.0.1:${launch.printerPort}`, MRAI_DESKTOP_PRINTER_TOKEN: launch.printerToken }
      : {}),
    // The AI's windows checked in the shell's own Chromium (./vibe-checker.ts;
    // app/services/desktop_vibe_checker.py): its address, token, and what it
    // runs (the closure's manifest and the checker's own code, by digest,
    // which the API binds each check's receipt to). MRAI_CLASSIC_VIBE_CHECKER=0
    // or a build without the closure leaves it out (no checker, as before).
    ...(vibeCheckerEnabled() && where.vibeRuntimeDir && fs.existsSync(path.join(where.vibeRuntimeDir, "manifest.json"))
      ? {
          MRAI_DESKTOP_VIBE_URL: `http://127.0.0.1:${launch.vibePort}`,
          MRAI_DESKTOP_VIBE_TOKEN: launch.vibeToken,
          MRAI_DESKTOP_VIBE_MANIFEST: path.join(where.vibeRuntimeDir, "manifest.json"),
          MRAI_DESKTOP_VIBE_CHECKER: checkerSha256(),
        }
      : {}),
    // The AI's browser and the screen (./agent-control.ts): its address and token.
    MRAI_DESKTOP_AGENT_URL: `http://127.0.0.1:${launch.agentPort}`,
    MRAI_DESKTOP_AGENT_TOKEN: launch.agentToken,
    // A Word page's original is read once (docx_original_warmup, the first
    // save or export) and kept for the session: one person, this computer's
    // memory. The server's 5-minute idle drop made a save after a pause read
    // a long document again (MS-OI29500: ~3 minutes).
    MRAI_DOCX_INCREMENTAL_IDLE_SECONDS: "86400",
    // A sign-in is handed over beside the first window, not before it: the
    // API holds the window's requests until it has (apps/api
    // app/desktop/account_gate.py). None: the API is told so now and starts
    // signed out (app/desktop/runtime.py), and nothing is held or handed
    // over (the gate and the shell's DELETE were 0.1 s of every signed-out
    
    ...(atStart.signedIn ? { MRAI_DESKTOP_ACCOUNT_PUSH: "1" } : { MRAI_DESKTOP_ACCOUNT_AT_START: "signed-out" }),
    // The launch's documents, registered by the API as it starts (apps/api
    // app/desktop/local_files.py), under the tokens the shell gives the window.
    ...(atStart.localFiles?.length ? { MRAI_DESKTOP_LOCAL_FILES: JSON.stringify(atStart.localFiles) } : {}),
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONUTF8: "1",
    PYTHONPATH: where.apiDir,
  };
  // The app's own LibreOffice (libreoffice.ts): where its soffice is once
  // downloaded. The API looks there at every conversion, so a copy enabled
  // or removed while it runs is used or dropped without a restart.
  ensureLibreOfficeFonts();
  env.MRAI_DESKTOP_LIBREOFFICE = libreOfficeBinary();
  // Automated checks of an unpacked build: "nothing installed on this
  // computer" on one that has a LibreOffice (apps/api app/desktop/libreoffice.py).
  if (!app.isPackaged && process.env.MRAI_CLASSIC_IGNORE_SYSTEM_LIBREOFFICE === "1") env.MRAI_DESKTOP_LIBREOFFICE_SYSTEM = "off";
  // The model on this computer (local-model.ts): its folder, there or not
  // yet. The API reads what is installed there at every use and runs the
  // server itself (apps/api app/desktop/local_model.py).
  env.MRAI_DESKTOP_LOCAL_MODEL_DIR = localModelDir();
  if (where.engineHostRoot) env.MRAI_ENGINE_HOST_ROOT = where.engineHostRoot;
  // The engines run on the app's own Node (a closure's node/bin/node is not
  // shipped: it would be the build machine's).
  if (where.node !== "node") env.MRAI_ENGINE_HOST_NODE = where.node;
  Object.assign(env, editorCommandHostEnv(where, data));
  return env;
}

/**
 * The editors' buttons the AI presses by name (apps/api
 * editor_command_runner.py): the packaged host, started by the API on the
 * app's own Node (named, not looked up on PATH), with an empty environment
 * of its own. Its compiled-code cache goes to the data folder: the app's
 * resources are signed and may not be writable.
 */
export function editorCommandHostEnv(where: Layout, data: string): NodeJS.ProcessEnv {
  if (!where.editorCommandHostDir) return {};
  return {
    MRAI_EDITOR_COMMAND_HOST: path.join(where.editorCommandHostDir, "host.cjs"),
    MRAI_EDITOR_COMMAND_NODE_PATH: path.join(where.editorCommandHostDir, "node_modules"),
    MRAI_EDITOR_COMMAND_NODE: where.node,
    MRAI_EDITOR_COMMAND_COMPILE_CACHE: path.join(data, "editor-command-cache"),
  };
}

/** `firstPage`: the page the first window opens, which the server loads as it starts (desktop-server.mjs);
 * `warmPages`: the pages it leads to, loaded after it. */
export function webEnv(where: Layout, launch: Launch, firstPage?: string, warmPages: readonly string[] = []): NodeJS.ProcessEnv {
  return {
    ...baseEnv(),
    NODE_ENV: where.development ? "development" : "production",
    PORT: String(launch.webPort),
    HOSTNAME: "127.0.0.1",
    INTERNAL_API_BASE_URL: launch.apiOrigin,
    MRAI_DESKTOP_MODE: "classic",
    MRAI_DESKTOP_LAUNCH_TOKEN: launch.launchToken,
    MRAI_DESKTOP_SHELL_SECRET: launch.shellSecret,
    // It ends itself when the shell does, even after a crash (desktop-server.mjs).
    MRAI_DESKTOP_PARENT_PID: String(process.pid),
    MRAI_DESKTOP_WEB_DIR: where.webDir,
    ...(firstPage ? { MRAI_DESKTOP_FIRST_PAGE: firstPage } : {}),
    ...(warmPages.length ? { MRAI_DESKTOP_WARM_PAGES: warmPages.join(",") } : {}),
    // Node keeps the server's compiled code here (desktop-server.mjs flushes
    // it once the first page is served): the next launch's server is ready
    // and serves its first page 0.3-0.35 s sooner. Checked against each
    // file's contents, so an update's new code is compiled afresh.
    ...(where.development ? {} : { NODE_COMPILE_CACHE: path.join(app.getPath("userData"), "web-compile-cache") }),
    NEXT_TELEMETRY_DISABLED: "1",
    ...(where.development
      ? { MRAI_DESKTOP_WEB_DEV: "1", NEXT_PUBLIC_MRAI_DESKTOP: "classic", NODE_OPTIONS: "--max-old-space-size=16384" }
      : { NODE_OPTIONS: "--max-old-space-size=4096" }),
  };
}

/**
 * What a launch learns only once the app is ready (the documents macOS hands
 * it, a start in the background, the sign-in): the names of the services'
 * environment that carry it. Services started before (``startService``'s
 * ``lateEnv``) are given these then; the API and the web server take only
 * these names from the late line.
 */
export const API_LATE_ENV = [
  "IMPORT_CONVERSION_ZYGOTE_ENABLED",
  "MRAI_DESKTOP_OPENING_FILE",
  "MRAI_DESKTOP_OPENING_PATHS",
  "MRAI_DESKTOP_LOCAL_FILES",
  "MRAI_DESKTOP_ACCOUNT_PUSH",
  "MRAI_DESKTOP_ACCOUNT_AT_START",
  "MRAI_DESKTOP_LAUNCH_CACHE_KEY",
] as const;
export const WEB_LATE_ENV = ["MRAI_DESKTOP_FIRST_PAGE", "MRAI_DESKTOP_WARM_PAGES", "MRAI_DESKTOP_LAUNCH_CACHE"] as const;

/** ``env`` split into what goes at the spawn and what (``names``) comes late. */
export function splitLateEnv(env: NodeJS.ProcessEnv, names: readonly string[]): { now: NodeJS.ProcessEnv; late: NodeJS.ProcessEnv } {
  const now: NodeJS.ProcessEnv = {};
  const late: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (names.includes(name)) late[name] = value;
    else now[name] = value;
  }
  return { now, late };
}

export interface Service {
  readonly name: string;
  readonly child: ChildProcess;
  readonly log: string;
}

// app.getPath("logs"): the person's log folder, or, for a test run with its
// own MRAI_CLASSIC_USER_DATA, <that>/logs (main.ts), so a check never writes
// into the app the person has open.
const serviceLogs = () => app.getPath("logs");

/** Start one service; resolves once `ready` matches its output (or rejects). */
export function startService(
  name: string,
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    /** A line of its output, or a URL that answers, once it is ready. */
    ready: RegExp | { url: string };
    timeoutMs: number;
    /** Told the process as soon as it is spawned. */
    onSpawn?: (child: ChildProcess) => void;
    /**
     * Started before the shell knows all of its environment: the rest comes
     * as one JSON line on its stdin once this resolves (EOF, nothing taken,
     * if it rejects); the service reads it before it uses any of it
     * (MRAI_DESKTOP_LATE_ENV=stdin: apps/api app/desktop/serve.py,
     * apps/web desktop-server.mjs).
     */
    lateEnv?: Promise<NodeJS.ProcessEnv>;
  },
): Promise<Service> {
  const out = openServiceLog(serviceLogs(), name);
  const log = out.file;
  const { lateEnv } = options;
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: lateEnv ? { ...options.env, MRAI_DESKTOP_LATE_ENV: "stdin" } : options.env,
    stdio: [lateEnv ? "pipe" : "ignore", "pipe", "pipe"],
    windowsHide: true,
    // Its own process group on POSIX, so stopping it stops what it started.
    detached: process.platform !== "win32",
  });
  if (lateEnv && child.stdin) {
    const stdin = child.stdin;
    // A service that ended first: its closed pipe is not this process's error.
    stdin.on("error", () => undefined);
    void lateEnv.then(
      (late) => stdin.end(`${JSON.stringify(late)}\n`),
      () => stdin.end(),
    );
  }
  options.onSpawn?.(child);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`${name} did not start in ${options.timeoutMs / 1000}s (log: ${log})`)), options.timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        stopService({ name, child, log });
        reject(error);
      } else resolve({ name, child, log });
    };
    const { ready } = options;
    const watch = (chunk: Buffer) => {
      out.write(chunk);
      if (!settled && ready instanceof RegExp && ready.test(chunk.toString("utf8"))) finish();
    };
    if (!(ready instanceof RegExp)) {
      // Asked, not read from its log (the API reconfigures its logging and
      // uvicorn's own "startup complete" line does not reach it).
      const poll = async () => {
        while (!settled) {
          try {
            await fetch(ready.url, { signal: AbortSignal.timeout(3_000) });
            finish();
            return;
          } catch {
            // Often: the app's window waits for this answer (a refused
            // connection costs nothing).
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
      };
      void poll();
    }
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      out.end();
      finish(new Error(`${name} exited (${signal ?? code}) while starting (log: ${log})`));
    });
  });
}

/**
 * The API answering: the app's window is made as soon as the web server is
 * up, not after the API's start (most of a launch), so every call of the
 * shell's own to the API waits for this first (local files, the account,
 * the profile). It never rejects: a failed start ends the app.
 */
let apiUpResolve: () => void = () => undefined;
const apiUpPromise = new Promise<void>((resolve) => {
  apiUpResolve = resolve;
});

export function apiUp(): Promise<void> {
  return apiUpPromise;
}

export function markApiUp(): void {
  apiUpResolve();
}

export function stopService(service: Service): void {
  const { child } = service;
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // The whole tree: the API starts engine workers of its own.
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    return;
  }
  try {
    process.kill(-(child.pid as number), "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    try {
      process.kill(-(child.pid as number), "SIGKILL");
    } catch {
      // Already gone.
    }
  }, 8_000).unref();
}

/**
 * Windows: a service asked to stop by `ask` (no SIGTERM there; the API's
 * POST /api/v1/desktop/shutdown) has `waitMs` to end on its own -- its
 * shutdown runs, the launch cache kept -- before stopService ends it. True
 * when it ended on its own.
 */
export async function stopServiceGracefully(service: Service, ask: () => Promise<unknown>, waitMs: number): Promise<boolean> {
  const { child } = service;
  if (child.exitCode !== null || child.signalCode !== null) return true;
  const ended = new Promise<boolean>((resolve) => child.once("exit", () => resolve(true)));
  try {
    await ask();
  } catch {
    return false;
  }
  return Promise.race([ended, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs).unref())]);
}

/** Wait until `url` answers (any HTTP status). */
export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3_000) });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`${url} did not answer`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
