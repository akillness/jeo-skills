// Isolation harness for the managed zvec daemon contract tests.
//
// Guarantees every test process runs with:
//   * HOME, ZVEC_GREP_HOME, ZVEC_GREP_MODEL_CACHE, XDG_*, TMPDIR inside one
//     disposable sandbox directory (never the real HOME);
//   * the network tripwire preloaded (records and refuses non-loopback traffic);
//   * on macOS, an OS sandbox denies non-loopback outbound network and all
//     file writes outside the sandbox, so native code is covered too.
// The real user's ~/.zvec-grep and the repo's own .zvec-grep are never opened
// for writing by anything started through this module.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = resolve(HERE, "..", "..");
export const REPO_ROOT = resolve(SKILL_DIR, "..", "..");
export const TRIPWIRE = join(HERE, "network-tripwire.mjs");
export const REAL_HOME = realpathSync(homedir());
export const LOCAL_MODEL = "local/potion-code-16m-v2";
const REAL_MODEL_CACHE = join(REAL_HOME, ".zvec-grep", "models");
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export const OS_SANDBOX_AVAILABLE =
  process.platform === "darwin" && existsSync(SANDBOX_EXEC) && osSandboxWorks();

function osSandboxWorks() {
  const probe = spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], { stdio: "ignore" });
  return probe.status === 0;
}

export function realZg() {
  const found = spawnSync("sh", ["-c", "command -v zg"], { encoding: "utf8" });
  const path = found.stdout.trim();
  return path || null;
}

/** True when a complete local model artifact exists to copy into a sandbox. */
export function localModelArtifactAvailable() {
  try {
    const family = join(REAL_MODEL_CACHE, "model2vec", "minishlab--potion-code-16M-v2");
    return readdirSync(family).some((revision) =>
      readdirSync(join(family, revision)).some((name) => name.endsWith(".complete")));
  } catch {
    return false;
  }
}

function sbplString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** Sandbox profile: allow everything except non-loopback egress and writes outside the sandbox. */
export function sandboxProfile(sandboxRoot) {
  return [
    "(version 1)",
    "(allow default)",
    "(deny network-outbound)",
    '(allow network-outbound (remote ip "localhost:*"))',
    "(allow network-outbound (remote unix-socket))",
    "(deny file-write*)",
    `(allow file-write* (subpath ${sbplString(sandboxRoot)}))`,
    // Device nodes used by every process.
    '(allow file-write* (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/(fd|ttys?)[0-9]*"))',
  ].join("");
}

export class Sandbox {
  constructor(root, { osSandbox }) {
    this.root = root;
    this.home = join(root, "home");
    this.zvecHome = join(root, "zvec-home");
    this.modelCache = join(root, "model-cache");
    this.workspace = join(root, "workspace");
    this.tmp = join(root, "tmp");
    // Inside the daemon home on purpose: the managed daemon's own kernel sandbox only
    // permits writes to its state roots, and an event log it cannot append to would make
    // every "no egress" assertion vacuously true. startDaemon() proves the listener logs.
    this.tripwireLog = join(this.zvecHome, "test-tripwire.jsonl");
    this.osSandbox = osSandbox && OS_SANDBOX_AVAILABLE;
    for (const dir of [this.home, this.zvecHome, this.modelCache, this.workspace, this.tmp]) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.tripwireLog, "");
  }

  get indexDir() { return join(this.workspace, ".zvec-grep"); }

  env(extra = {}) {
    return {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: this.home,
      TMPDIR: this.tmp,
      XDG_CACHE_HOME: join(this.home, ".cache"),
      XDG_CONFIG_HOME: join(this.home, ".config"),
      XDG_DATA_HOME: join(this.home, ".local", "share"),
      HF_HOME: join(this.home, ".hf"),
      CODEX_HOME: join(this.home, ".codex"),
      CLAUDE_CONFIG_DIR: join(this.home, ".claude"),
      ZVEC_GREP_HOME: this.zvecHome,
      ZVEC_GREP_MODEL_CACHE: this.modelCache,
      ZVEC_GREP_MODE: "direct",
      ZVEC_TRIPWIRE_LOG: this.tripwireLog,
      NODE_OPTIONS: `--import=${TRIPWIRE}`,
      NO_COLOR: "1",
      ...extra,
    };
  }

  /** Spawn a command inside the sandbox. Resolves with exit info, never rejects on non-zero exit. */
  run(command, args = [], { env = {}, cwd = this.workspace, timeoutMs = 120_000, input, wrap = this.osSandbox } = {}) {
    const [file, argv] = wrap
      ? [SANDBOX_EXEC, ["-p", sandboxProfile(this.root), command, ...args]]
      : [command, args];
    return new Promise((resolvePromise) => {
      const child = spawn(file, argv, { cwd, env: this.env(env), stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        resolvePromise({ code, signal, stdout, stderr, timedOut });
      });
      child.stdin.end(input ?? "");
    });
  }

  /** Spawn without waiting, for interrupt/race tests. */
  spawn(command, args = [], { env = {}, cwd = this.workspace, wrap = this.osSandbox } = {}) {
    const [file, argv] = wrap
      ? [SANDBOX_EXEC, ["-p", sandboxProfile(this.root), command, ...args]]
      : [command, args];
    const child = spawn(file, argv, { cwd, env: this.env(env), stdio: ["ignore", "pipe", "pipe"] });
    const out = { stdout: "", stderr: "" };
    child.stdout.on("data", (chunk) => { out.stdout += chunk; });
    child.stderr.on("data", (chunk) => { out.stderr += chunk; });
    const closed = new Promise((resolvePromise) => {
      child.on("close", (code, signal) => resolvePromise({ code, signal, ...out }));
    });
    return { child, out, closed };
  }

  tripwireEvents() {
    return readFileSync(this.tripwireLog, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  }

  egressEvents() {
    return this.tripwireEvents().filter((event) => event.kind === "egress");
  }

  /** Daemon-owned kernel boundary probes (single raw connect to 192.0.2.1:9, expected EPERM). */
  kernelProbeEvents() {
    return this.tripwireEvents().filter((event) => event.kind === "kernel_probe");
  }

  writeWorkspaceFiles(files) {
    for (const [name, body] of Object.entries(files)) {
      const target = join(this.workspace, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }

  /** Copy the already-downloaded local model artifact into the sandbox cache. Reads the real cache only. */
  seedLocalModel() {
    if (!localModelArtifactAvailable()) return false;
    cpSync(REAL_MODEL_CACHE, this.modelCache, { recursive: true });
    return true;
  }

  cleanup() {
    rmSync(this.root, { recursive: true, force: true });
  }
}

export function createSandbox({ osSandbox = true } = {}) {
  // realpath: macOS tmpdir lives behind /var -> /private/var; locks and
  // canonical-root checks compare real paths. /tmp is preferred where it exists
  // because Unix-domain socket paths are limited to ~104 bytes and the macOS
  // per-user tmpdir alone is ~50 bytes.
  const base = realpathSync(existsSync("/tmp") ? "/tmp" : tmpdir());
  const root = mkdtempSync(join(base, "zmt-"));
  if (root.startsWith(REAL_HOME + sep)) {
    throw new Error(`sandbox ${root} would live under the real HOME`);
  }
  return new Sandbox(root, { osSandbox });
}

/** Deterministic fingerprint of a directory tree: relative path, type, size and content hash. */
export function fingerprintTree(dir) {
  const entries = {};
  if (!existsSync(dir)) return entries;
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = lstatSync(full);
      const rel = relative(dir, full);
      if (stat.isDirectory()) {
        entries[rel] = "dir";
        walk(full);
      } else if (stat.isSymbolicLink()) {
        entries[rel] = "symlink";
      } else {
        entries[rel] = `${stat.size}:${createHash("sha256").update(readFileSync(full)).digest("hex")}`;
      }
    }
  };
  walk(dir);
  return entries;
}

export function diffFingerprints(before, after) {
  const added = Object.keys(after).filter((key) => !(key in before));
  const removed = Object.keys(before).filter((key) => !(key in after));
  const changed = Object.keys(after).filter((key) => key in before && before[key] !== after[key]);
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length };
}

/** Run `zg` (the installed 0.2.2 CLI) inside a sandbox. Used only to build fixtures and as the oracle. */
export function zg(sandbox, args, options) {
  const bin = realZg();
  if (!bin) throw new Error("zg is not on PATH");
  return sandbox.run(bin, args, options);
}

/** Build a genuine local index with the installed zg, offline, from the copied local model. */
export async function buildLocalIndex(sandbox) {
  if (!sandbox.seedLocalModel()) throw new Error("no local model artifact to copy");
  const result = await zg(sandbox, ["index", sandbox.workspace, "--embedding", LOCAL_MODEL, "--mode", "direct"]);
  if (result.code !== 0) {
    throw new Error(`fixture index failed (${result.code}): ${result.stderr || result.stdout}`);
  }
  return result;
}

export const FIXTURE_FILES = {
  "src/auth.ts": "export function validateCredentials(user: string, pass: string) {\n  return user.length > 0 && pass.length > 7;\n}\n",
  "src/theme.ts": "export function loadTheme(name: string) {\n  return `theme:${name}`;\n}\n",
  "notes.md": "# Notes\n\nThe quarterly report covers budget approvals and vendor onboarding.\n",
};

// ---------------------------------------------------------------------------
// Managed daemon launcher (black box: CLI + loopback HTTP, as published by
// scripts/managed-daemon/main.mjs).
// ---------------------------------------------------------------------------
export const DAEMON_MAIN = process.env.ZVEC_MANAGED_DAEMON_MAIN
  ?? join(SKILL_DIR, "scripts", "managed-daemon", "main.mjs");
export const EXISTING_INDEX_MODULE = join(dirname(DAEMON_MAIN), "existing-index.mjs");
export const PACKAGE_MODULE = join(dirname(DAEMON_MAIN), "package.mjs");

/** Directory of the installed @zvec/zvec-grep package (the oracle the daemon wraps). */
export function installedPackageDir() {
  const bin = realZg();
  if (!bin) return null;
  // <pkg>/dist/cli/index.js
  return resolve(dirname(realpathSync(bin)), "..", "..");
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
export { sleep };

export class DaemonHandle {
  constructor(sandbox, process_, port, token) {
    this.sandbox = sandbox;
    this.process = process_;
    this.port = port;
    this.token = token;
    this.url = `http://127.0.0.1:${port}`;
  }

  get output() { return this.process.out; }
  get exited() { return this.process.closed; }

  headers(extra = {}) {
    return { "content-type": "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  async request(method, path, body, { headers, timeoutMs = 120_000 } = {}) {
    const response = await fetch(`${this.url}${path}`, {
      method,
      headers: headers ?? this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, json, text };
  }

  refresh(root, extra = {}, options) {
    return this.request("POST", "/managed/refresh", { root, reason: "turn_end", ...extra }, options);
  }

  status(root) {
    return this.request("GET", `/managed/status?root=${encodeURIComponent(root)}`);
  }

  /** Poll status until `predicate(json)` holds. Returns the last status body. */
  async waitStatus(root, predicate, { timeoutMs = 60_000, intervalMs = 50 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = (await this.status(root)).json;
      if (last && predicate(last)) return last;
      await sleep(intervalMs);
    }
    throw new Error(`timed out waiting for daemon status; last=${JSON.stringify(last)}\n${this.output.stderr}`);
  }

  /**
   * The daemon is two processes: the launcher this harness spawned and the
   * sandboxed node (re-exec under sandbox-exec) that actually listens. Signals
   * must reach the listener, so it is tracked by pid from the instance record.
   */
  get listenerPid() {
    return this.listener ?? null;
  }

  trackListener() {
    try {
      this.listener = JSON.parse(readFileSync(join(this.sandbox.zvecHome, "daemon", "instance.lock"), "utf8")).pid;
    } catch {
      this.listener = listenerPid(this.port);
    }
    if (this.listener) LIVE_LISTENERS.add(this.listener);
    return this.listener;
  }

  async waitGone(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!pidAlive(pid)) return true;
      await sleep(25);
    }
    return !pidAlive(pid);
  }

  /** SIGKILL the whole daemon (listener first, then the launcher) and wait until both are gone. */
  async kill() {
    const pid = this.listener ?? this.trackListener();
    if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
    try { this.process.child.kill("SIGKILL"); } catch { /* already gone */ }
    if (pid) {
      await this.waitGone(pid, 10_000);
      LIVE_LISTENERS.delete(pid);
    }
    await Promise.race([this.exited, sleep(5_000)]);
  }

  async stop() {
    const pid = this.listener ?? this.trackListener();
    if (pid && pidAlive(pid)) {
      try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
      if (!(await this.waitGone(pid, 10_000))) {
        try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
        await this.waitGone(pid, 5_000);
      }
    }
    if (pid) LIVE_LISTENERS.delete(pid);
    if (this.process.child.exitCode === null && !this.process.child.signalCode) {
      try { this.process.child.kill("SIGTERM"); } catch { /* already gone */ }
      await Promise.race([this.exited, sleep(5_000)]);
      try { this.process.child.kill("SIGKILL"); } catch { /* already gone */ }
    }
  }
}

const LIVE_LISTENERS = new Set();
process.once("exit", () => {
  for (const pid of LIVE_LISTENERS) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
});

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/**
 * Start the managed daemon on a free loopback port with sandbox-owned state.
 *
 * The daemon applies its own kernel sandbox (it re-execs under sandbox-exec and
 * refuses to run if it cannot), and macOS does not allow nesting profiles, so
 * it is NOT wrapped in the harness sandbox. Isolation here is env-based
 * (HOME/ZVEC_GREP_HOME/model cache in the sandbox), the JS network tripwire
 * (inherited through the re-exec), and the daemon's own kernel boundary, which
 * the tests attest separately via kernelDeniesOutbound().
 *
 * `token`: explicit Bearer token (default: a random one passed via --token-file);
 * `token: null` lets the daemon create its default token file under ZVEC_GREP_HOME.
 */
export async function startDaemon(sandbox, { env = {}, token = randomBytes(18).toString("hex"), extraArgs = [], packageDir = installedPackageDir() } = {}) {
  throw new Error("daemon integration disabled: macOS rejects nested sandbox profiles; no fixture-confined production launcher is proven");
  const port = await freePort();
  const args = [DAEMON_MAIN, "run", "--listen", `127.0.0.1:${port}`, ...extraArgs];
  if (token) {
    const tokenFile = join(sandbox.root, "daemon.token");
    writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    args.push("--token-file", tokenFile);
  }
  const child = sandbox.spawn(process.execPath, args, {
    wrap: false,
    env: { ...(packageDir ? { ZVEC_GREP_PACKAGE_DIR: packageDir } : {}), ...env },
  });
  const handle = new DaemonHandle(sandbox, child, port, token || undefined);
  const deadline = Date.now() + 45_000;
  let exited = false;
  child.closed.then(() => { exited = true; });
  while (Date.now() < deadline) {
    if (exited) {
      const result = await child.closed;
      throw new Error(`managed daemon exited during startup (code ${result.code}, signal ${result.signal})\n${result.stderr}${result.stdout}`);
    }
    try {
      // /healthz is the only unauthenticated endpoint; any answer proves the listener is up.
      const health = await fetch(`${handle.url}/healthz`, { signal: AbortSignal.timeout(2_000) });
      if (health.status < 500) {
        if (!token) handle.token = readDefaultToken(sandbox);
        const pid = handle.trackListener();
        const armed = sandbox.tripwireEvents().some((event) => event.kind === "armed" && event.pid === pid);
        if (!armed) {
          await handle.stop();
          throw new Error(`network tripwire is not recording inside the daemon's sandbox (listener pid ${pid}); no-egress assertions would be vacuous`);
        }
        return handle;
      }
    } catch {
      /* not listening yet */
    }
    await sleep(100);
  }
  await handle.stop();
  throw new Error(`managed daemon did not start listening on ${handle.url}\n${child.out.stderr}`);
}

export function defaultTokenPath(sandbox) {
  return join(sandbox.zvecHome, "daemon", "token");
}

function readDefaultToken(sandbox) {
  return readFileSync(defaultTokenPath(sandbox), "utf8").trim();
}

/** pid of the process listening on a loopback TCP port (the daemon after its sandbox re-exec). */
export function listenerPid(port) {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  const pid = Number(result.stdout.split("\n").find(Boolean));
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * Ask the kernel (sandbox_check, a pure policy query: no packet is sent) whether
 * `pid` is denied general outbound network. true = denied, false = allowed,
 * null = cannot be determined on this host.
 */
export function kernelDeniesOutbound(pid) {
  if (process.platform !== "darwin") return null;
  const script = [
    "import ctypes,sys",
    "lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib')",
    "lib.sandbox_check.restype=ctypes.c_int",
    "print(lib.sandbox_check(int(sys.argv[1]),b'network-outbound',0x40000000))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", script, String(pid)], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const verdict = Number(result.stdout.trim());
  return verdict === 1 ? true : verdict === 0 ? false : null;
}

/**
 * Fingerprint of real-user state that no test may change: the downloaded model
 * cache, global config/keys and the set of top-level entries of ~/.zvec-grep.
 * (Daemon logs, instance.lock and the repo's own live index are deliberately
 * excluded: a production daemon is running and legitimately writes those.)
 */
export function realStateFingerprint() {
  const base = join(REAL_HOME, ".zvec-grep");
  const state = { entries: existsSync(base) ? readdirSync(base).filter((name) => name !== "daemon" && name !== ".DS_Store").sort() : [] };
  state.models = fingerprintTree(join(base, "models"));
  for (const name of ["config.json", "mcp-request-state.key", "authorization.json"]) {
    const path = join(base, name);
    state[name] = existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
  }
  return state;
}

/** `zg query --fts TOKEN` against a workspace with an existing index. Never refreshes; never creates. */
export async function ftsHits(sandbox, token) {
  const result = await zg(sandbox, ["query", "--fts", token, "--refresh", "off", "--mode", "direct"]);
  const files = [...result.stdout.matchAll(/^#\d+ matchedBy=\S+ (\S+?):\d+/gm)].map((match) => match[1]);
  return { ...result, files: [...new Set(files)] };
}

/** Sorted relative paths of the on-disk index artifacts that must never appear or vanish by themselves. */
export function indexArtifacts(sandbox) {
  const present = {};
  for (const name of ["index.zvec", "files.zvec", "manifest.json"]) {
    present[name] = existsSync(join(sandbox.indexDir, name));
  }
  return present;
}

/**
 * Run the daemon's pure read-only readiness predicate (inspectExistingIndex) for
 * each root in a throwaway child inside the sandbox. Returns [{state, root, reason}].
 */
export async function inspectStates(sandbox, roots) {
  const script = `
    import { pathToFileURL } from 'node:url';
    const pkg = (await import(${JSON.stringify(pathToFileURL(PACKAGE_MODULE).href)})).loadPackage(process.env);
    const mod = await import(${JSON.stringify(pathToFileURL(EXISTING_INDEX_MODULE).href)});
    const engine = await mod.loadEngine(pkg);
    const out = JSON.parse(process.argv[1]).map((root) => {
      const r = mod.inspectExistingIndex(engine, root);
      return { state: r.state, root: r.root ?? null, reason: r.reason ?? null };
    });
    console.log(JSON.stringify(out));`;
  const result = await sandbox.run(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(roots)], {
    env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() },
  });
  if (result.code !== 0) throw new Error(`inspectExistingIndex child failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

export const HOST_EVENTS = join(SKILL_DIR, "scripts", "host-events.py");

/** One HTTP request to the managed daemon over its owner-only Unix socket. */
export async function socketRequest(socketPath, method, path, body) {
  const { request } = await import("node:http");
  return await new Promise((resolveRequest, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      socketPath, method, path,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
      timeout: 60_000,
    }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        resolveRequest({ status: response.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("socket request timed out")));
    req.end(payload);
  });
}

/** The daemon's stock-compatible instance record, as the host bridge reads it. */
export function readInstanceRecord(sandbox) {
  return JSON.parse(readFileSync(join(sandbox.zvecHome, "daemon", "instance.lock"), "utf8"));
}

/**
 * Register a root in the daemon's user-owned trust registry exactly as a user
 * would (`main.mjs trust add --root ABS`). Registration is CLI-only by design.
 */
export async function trustRoot(sandbox, root = sandbox.workspace, { expectOk = true } = {}) {
  const result = await sandbox.run(process.execPath, [DAEMON_MAIN, "trust", "add", "--root", root], {
    env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() },
  });
  if (expectOk && result.code !== 0) throw new Error(`trust add failed (${result.code}): ${result.stderr || result.stdout}`);
  return result;
}

export function trustRegistryPath(sandbox) {
  return join(sandbox.zvecHome, "daemon", "managed", "trusted-roots.json");
}

// ---------------------------------------------------------------------------
// MCP client (the installed package's own @modelcontextprotocol/client) for the
// daemon's /mcp endpoint. Runs in the test process and talks to loopback only.
// ---------------------------------------------------------------------------
import { createRequire } from "node:module";

async function loadMcpClient() {
  const requireFromPackage = createRequire(join(installedPackageDir(), "package.json"));
  return await import(pathToFileURL(requireFromPackage.resolve("@modelcontextprotocol/client")).href);
}

/** Open an authenticated MCP session; `close()` it when done. */
export async function mcpConnect(daemon) {
  const { Client, StreamableHTTPClientTransport } = await loadMcpClient();
  const client = new Client({ name: "zvec-managed-contract-test", version: "1" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  const transport = new StreamableHTTPClientTransport(new URL(`${daemon.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${daemon.token}` } },
  });
  await client.connect(transport);
  return client;
}

/** One zvec_grep_search call. Resolves { isError, text, ms }; transport failures resolve { isError: true, transportError }. */
export async function mcpSearch(daemon, args, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  const client = await mcpConnect(daemon);
  try {
    const result = await client.callTool({ name: "zvec_grep_search", arguments: args }, undefined, { timeout: timeoutMs });
    return {
      isError: result.isError === true,
      text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
      ms: Date.now() - started,
    };
  } catch (error) {
    return { isError: true, transportError: String(error?.message ?? error), text: String(error?.message ?? error), ms: Date.now() - started };
  } finally {
    await client.close().catch(() => {});
  }
}

export async function mcpToolNames(daemon) {
  const client = await mcpConnect(daemon);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close().catch(() => {});
  }
}

/** Call any tool by name (including ones that must not exist). Resolves { isError, text }. */
export async function mcpCallTool(daemon, name, args, { timeoutMs = 30_000 } = {}) {
  const client = await mcpConnect(daemon);
  try {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    return { isError: result.isError === true, text: (result.content ?? []).map((part) => part.text ?? "").join("\n") };
  } catch (error) {
    return { isError: true, transportError: true, text: String(error?.message ?? error) };
  } finally {
    await client.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Model-free fixtures and probes used by the regression tests.
// ---------------------------------------------------------------------------

/**
 * A structurally "ready" index (valid manifest, empty store directories) with no
 * native content. Enough for every code path that only inspects/registers an index;
 * anything that would open the native collection must use a real index instead.
 */
export function fabricateIndex(sandbox, { rootPaths } = {}) {
  const home = sandbox.indexDir;
  mkdirSync(join(home, "files.zvec"), { recursive: true });
  mkdirSync(join(home, "index.zvec"), { recursive: true });
  const now = Date.now();
  writeFileSync(join(home, "manifest.json"), `${JSON.stringify({
    manifestVersion: 1,
    id: "00000000-0000-4000-8000-00000000fab1",
    name: "workspace",
    path: realpathSync(home),
    rootPaths: rootPaths ?? [{ absolutePath: realpathSync(sandbox.workspace), recursive: true }],
    indexPolicy: "enabled",
    embedding: { provider: "local", model: "potion-code-16m-v2", dimension: 256, metric: "cosine" },
    indexVersion: 1,
    createdTime: now,
    updatedTime: now,
    embeddingRuntime: { device: "auto" },
  }, null, 2)}\n`);
  return home;
}

export const DAEMON_DIR = dirname(DAEMON_MAIN);
export const OS_SANDBOX_MODULE = join(DAEMON_DIR, "os-sandbox.mjs");
export const EGRESS_GUARD_MODULE = join(DAEMON_DIR, "egress-guard.mjs");
export const PROBE_PRELOAD = join(HERE, "daemon-probe.mjs");

/**
 * Run a module-level script (ESM, top-level await) in the harness sandbox (OS
 * sandbox + tripwire) and return its last stdout line parsed as JSON.
 */
export async function runScript(sandbox, script, args = [], options = {}) {
  const result = await sandbox.run(process.execPath, ["--input-type=module", "-e", script, ...args], {
    env: { ZVEC_GREP_PACKAGE_DIR: installedPackageDir() }, ...options,
  });
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  let json;
  try { json = JSON.parse(lines.at(-1)); } catch { json = undefined; }
  return { ...result, json };
}

/** mtime (ms) of every entry below `dir`, for "was this touched?" checks that content hashes miss. */
export function mtimeTree(dir) {
  const entries = {};
  if (!existsSync(dir)) return entries;
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      const stat = lstatSync(full);
      entries[relative(dir, full)] = stat.mtimeMs;
      if (stat.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return entries;
}

/**
 * Run `script` under the managed daemon's REAL kernel sandbox profile
 * (os-sandbox.buildProfile with the same inputs main.mjs derives) and no JS guard,
 * so the result reflects the kernel alone. Returns the script's last stdout line as JSON.
 */
export async function runUnderDaemonProfile(sandbox, { port, indexHomes = [] }, script, scriptArgs = []) {
  const { buildProfile } = await import(pathToFileURL(OS_SANDBOX_MODULE).href);
  const requireFromPackage = createRequire(join(installedPackageDir(), "package.json"));
  const rgPath = realpathSync(requireFromPackage("@vscode/ripgrep").rgPath);
  const writableRoots = [sandbox.zvecHome, join(sandbox.zvecHome, "daemon"), join(sandbox.home, ".local", "state", "zvec-grep", "warnings"), sandbox.modelCache]
    .map((path) => { mkdirSync(path, { recursive: true }); return realpathSync(path); });
  const profile = buildProfile({ port, nodePath: realpathSync(process.execPath), rgPath, writableRoots, indexHomes: indexHomes.map((path) => realpathSync(path)), home: realpathSync(sandbox.zvecHome) });
  const run = spawnSync(SANDBOX_EXEC, ["-p", profile, realpathSync(process.execPath), "--input-type=module", "-e", script, ...scriptArgs], {
    cwd: sandbox.workspace, env: sandbox.env({ NODE_OPTIONS: "" }), encoding: "utf8", timeout: 60_000,
  });
  const lines = (run.stdout ?? "").trim().split("\n").filter(Boolean);
  let json;
  try { json = JSON.parse(lines.at(-1)); } catch { json = undefined; }
  return { code: run.status, stdout: run.stdout, stderr: run.stderr, json, profile };
}
