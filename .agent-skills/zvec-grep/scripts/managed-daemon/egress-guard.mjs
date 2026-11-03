// In-process guards for the managed daemon (defence in depth beneath the OS
// sandbox in os-sandbox.mjs, which is the authoritative egress boundary).
//
//  * network: fetch/WebSocket, net/tls/http connect, dns, dgram refuse every
//    non-loopback destination;
//  * processes: only the bundled ripgrep binary may be spawned;
//  * workers: new Worker() threads load this guard before their own code;
//  * index lifecycle: a `.zvec-grep` directory is never created, index files
//    are never removed or replaced, and the native ZVecCreateAndOpen is
//    replaced by a function that throws, so a race that removes an index can
//    only produce an error, never a fresh empty index.
import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import fs from "node:fs";
import module from "node:module";
import net from "node:net";
import os from "node:os";
import { basename, isAbsolute, resolve, sep } from "node:path";
import { promisify } from "node:util";
import workerThreads from "node:worker_threads";

export const GUARD_ENV = "ZVEC_MANAGED_GUARD";
const INDEX_BASENAMES = new Set(["index.zvec", "files.zvec", "manifest.json"]);
const HOME_SEGMENT = ".zvec-grep";
const LOOPBACK_HOST =
  /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|\[?::ffff:127(\.\d{1,3}){3}\]?|0\.0\.0\.0|\[?::\]?)$/i;

export class GuardError extends Error {
  constructor(code, message) {
    super(`[${code}] ${message}`);
    this.name = "ManagedGuardError";
    this.code = code;
  }
}

const state = { installed: false, config: undefined };

export function guardStatus() {
  return { installed: state.installed, ...state.config };
}

/**
 * @param {{allowedExecutables:string[], createRoots:string[], guardModuleUrl?:string, zvecCjsPath?:string}} config
 */
export function installGuards(config) {
  if (state.installed) return guardStatus();
  const normalized = {
    allowedExecutables: config.allowedExecutables.map((path) => resolve(path)),
    createRoots: config.createRoots.map((path) => resolve(path)),
    zvecCjsPath: config.zvecCjsPath,
    guardModuleUrl: config.guardModuleUrl ?? import.meta.url,
  };
  state.config = normalized;
  process.env[GUARD_ENV] = JSON.stringify(normalized);
  guardNetwork();
  guardProcesses(normalized);
  guardWorkers(normalized);
  guardFilesystem(normalized);
  if (normalized.zvecCjsPath) guardNativeCreate(normalized.zvecCjsPath);
  module.syncBuiltinESMExports();
  state.installed = true;
  return guardStatus();
}

/** Worker bootstrap: reinstall the same guards inside a worker thread. */
export function installGuardsFromEnvironment() {
  const raw = process.env[GUARD_ENV];
  if (!raw) {
    throw new GuardError("GUARD_CONFIG_MISSING", "worker started without guard config");
  }
  return installGuards(JSON.parse(raw));
}

function deny(code, what) {
  throw new GuardError(code, `${what} is not permitted in the managed zvec daemon`);
}

// ---------------------------------------------------------------- network

function isLocalHost(host) {
  return host === undefined || host === null || host === "" || LOOPBACK_HOST.test(String(host));
}

function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first !== null && typeof first === "object") {
    if (typeof first.path === "string") return { host: "localhost" };
    return { host: first.host ?? "localhost" };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) return { host: "localhost" };
  return { host: typeof args[1] === "string" ? args[1] : "localhost" };
}

function guardNetwork() {
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    const { host } = connectTarget(args);
    if (!isLocalHost(host)) deny("EGRESS_DENIED", `connecting to ${host}`);
    return connect.apply(this, args);
  };
  globalThis.fetch = async function deniedFetch() {
    deny("EGRESS_DENIED", "fetch");
  };
  if ("WebSocket" in globalThis) {
    globalThis.WebSocket = function DeniedWebSocket() {
      deny("EGRESS_DENIED", "WebSocket");
    };
  }
  for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveMx", "resolveTxt", "resolveSrv", "resolveCname", "resolveNs", "reverse"]) {
    const original = dns[name];
    if (typeof original !== "function") continue;
    dns[name] = function guardedDns(hostname, ...rest) {
      if (name === "reverse" || !isLocalHost(hostname)) {
        deny("EGRESS_DENIED", `dns.${name}(${String(hostname)})`);
      }
      return original.call(this, hostname, ...rest);
    };
    if (original[promisify.custom]) dns[name][promisify.custom] = original[promisify.custom];
  }
  for (const name of Object.keys(dns.promises)) {
    const original = dns.promises[name];
    if (typeof original !== "function") continue;
    dns.promises[name] = async function guardedDnsPromise(hostname, ...rest) {
      if (name === "reverse" || !isLocalHost(hostname)) {
        deny("EGRESS_DENIED", `dns.promises.${name}(${String(hostname)})`);
      }
      return original.call(this, hostname, ...rest);
    };
  }
  dgram.createSocket = function deniedDgram() {
    deny("EGRESS_DENIED", "UDP sockets");
  };
}

// -------------------------------------------------------------- processes

function guardProcesses({ allowedExecutables }) {
  const allowed = new Set(allowedExecutables);
  const check = (name, file, options) => {
    if (typeof file !== "string" || !isAbsolute(file) || !allowed.has(resolve(file))) {
      deny("EXEC_DENIED", `child_process.${name}(${String(file)})`);
    }
    if (options && typeof options === "object" && options.shell) {
      deny("EXEC_DENIED", `child_process.${name} with a shell`);
    }
  };
  const optionsOf = (args) => args.find((arg) => arg !== null && typeof arg === "object" && !Array.isArray(arg));
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync"]) {
    const original = childProcess[name];
    const wrapped = function guardedProcess(file, ...rest) {
      check(name, file, optionsOf(rest));
      return original.call(this, file, ...rest);
    };
    if (original[promisify.custom]) {
      wrapped[promisify.custom] = (file, ...rest) => {
        check(name, file, optionsOf(rest));
        return original[promisify.custom](file, ...rest);
      };
    }
    childProcess[name] = wrapped;
  }
  for (const name of ["exec", "execSync", "fork"]) {
    childProcess[name] = function deniedProcess() {
      deny("EXEC_DENIED", `child_process.${name}`);
    };
  }
}

// ---------------------------------------------------------------- workers

function guardWorkers({ guardModuleUrl }) {
  const BaseWorker = workerThreads.Worker;
  const preload = bootstrapUrl(guardModuleUrl);
  class GuardedWorker extends BaseWorker {
    constructor(filename, options = {}) {
      // Eval workers run before --import preloads finish, so they could not be
      // guarded; the package only starts file-based workers.
      if (options.eval) deny("WORKER_DENIED", "eval worker threads");
      super(filename, {
        ...options,
        env: options.env === workerThreads.SHARE_ENV ? options.env : { ...process.env, ...(options.env ?? {}) },
        execArgv: ["--import", preload, ...(options.execArgv ?? [])],
      });
    }
  }
  workerThreads.Worker = GuardedWorker;
}

function bootstrapUrl(guardModuleUrl) {
  return new URL("./worker-bootstrap.mjs", guardModuleUrl).href;
}

// ------------------------------------------------------------- filesystem

function lastHomeSegment(absolute) {
  const segments = absolute.split(sep);
  const index = segments.lastIndexOf(HOME_SEGMENT);
  return index < 0 ? undefined : segments.slice(0, index + 1).join(sep) || sep;
}

function insideAny(path, roots) {
  return roots.some((root) => path === root || path.startsWith(root + sep));
}

function isRealDirectory(path) {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function guardFilesystem({ createRoots }) {
  const checkCreate = (target) => {
    if (typeof target !== "string" && !(target instanceof URL)) return;
    const absolute = resolve(target instanceof URL ? target.pathname : target);
    const home = lastHomeSegment(absolute);
    if (!home || insideAny(absolute, createRoots)) return;
    if (!isRealDirectory(home)) {
      throw new GuardError(
        "MANAGED_NO_CREATE",
        `refusing to create ${absolute}: ${home} does not exist (the managed daemon never creates an index)`,
      );
    }
  };
  const checkDestroy = (target) => {
    if (typeof target !== "string" && !(target instanceof URL)) return;
    const absolute = resolve(target instanceof URL ? target.pathname : target);
    if (INDEX_BASENAMES.has(basename(absolute)) && lastHomeSegment(absolute) && !insideAny(absolute, createRoots)) {
      throw new GuardError("MANAGED_NO_DESTROY", `refusing to remove or replace ${absolute}`);
    }
    if (basename(absolute) === HOME_SEGMENT && !insideAny(absolute, createRoots)) {
      throw new GuardError("MANAGED_NO_DESTROY", `refusing to remove ${absolute}`);
    }
  };
  const wrapSync = (object, name, check, argIndexes = [0]) => {
    const original = object[name];
    if (typeof original !== "function") return;
    object[name] = function guardedFs(...args) {
      for (const index of argIndexes) check(args[index]);
      return original.apply(this, args);
    };
  };
  const wrapPromise = (object, name, check, argIndexes = [0]) => {
    const original = object[name];
    if (typeof original !== "function") return;
    object[name] = async function guardedFsPromise(...args) {
      for (const index of argIndexes) check(args[index]);
      return original.apply(this, args);
    };
  };
  wrapSync(fs, "mkdirSync", checkCreate);
  wrapSync(fs, "mkdir", checkCreate);
  wrapPromise(fs.promises, "mkdir", checkCreate);
  for (const name of ["rmSync", "rm", "unlinkSync", "unlink", "rmdirSync", "rmdir"]) {
    wrapSync(fs, name, checkDestroy);
  }
  for (const name of ["rm", "unlink", "rmdir"]) wrapPromise(fs.promises, name, checkDestroy);
  for (const name of ["renameSync", "rename"]) wrapSync(fs, name, checkDestroy, [0, 1]);
  wrapPromise(fs.promises, "rename", checkDestroy, [0, 1]);
}

function guardNativeCreate(zvecCjsPath) {
  const cjs = module.createRequire(import.meta.url)(zvecCjsPath);
  cjs.ZVecCreateAndOpen = function deniedCreate(path) {
    throw new GuardError(
      "MANAGED_NO_CREATE",
      `refusing to create a zvec collection at ${String(path)}`,
    );
  };
}

/**
 * Post-install proof that every guard is effective in this process, including
 * the ESM snapshot of ZVecCreateAndOpen (which a premature import of the
 * native package would have captured unguarded) and worker threads. Nothing
 * here can create a collection: the native probe passes no schema.
 */
export async function selfTestGuards({ zvecEsmUrl }) {
  const failures = [];
  const expect = async (name, code, action) => {
    try {
      await action();
      failures.push(`${name}: not denied`);
    } catch (error) {
      if (error?.code !== code) failures.push(`${name}: expected ${code}, got ${error?.code ?? error?.message}`);
    }
  };
  const probeDirectory = resolve(os.tmpdir(), `zvec-selftest-${process.pid}`, HOME_SEGMENT, "locks");
  await expect("mkdir of an absent .zvec-grep", "MANAGED_NO_CREATE", () => fs.mkdirSync(probeDirectory, { recursive: true }));
  await expect("native create (ESM snapshot)", "MANAGED_NO_CREATE", async () => {
    const native = await import(zvecEsmUrl);
    native.ZVecCreateAndOpen(resolve(probeDirectory, "index.zvec"));
  });
  await expect("fetch", "EGRESS_DENIED", () => fetch("http://zvec-selftest.invalid/"));
  await expect("socket connect", "EGRESS_DENIED", () => {
    net.connect({ host: "192.0.2.1", port: 9 }).on("error", () => {});
  });
  await expect("spawn", "EXEC_DENIED", () => childProcess.spawn("/usr/bin/true"));
  const workerCode = await new Promise((resolveWorker) => {
    const worker = new workerThreads.Worker(new URL("./worker-selftest.mjs", import.meta.url));
    worker.once("message", resolveWorker);
    worker.once("error", () => resolveWorker("WORKER_ERROR"));
  });
  if (workerCode !== "EGRESS_DENIED") failures.push(`worker thread egress: expected EGRESS_DENIED, got ${workerCode}`);
  if (failures.length > 0) {
    throw new GuardError("GUARD_SELF_TEST_FAILED", failures.join("; "));
  }
}
