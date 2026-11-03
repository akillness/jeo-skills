#!/usr/bin/env node
// Managed zvec-grep daemon CLI.
//   main.mjs run    [--home DIR] [--listen HOST:PORT]
//   main.mjs start  [same options]   detached; waits until ready
//   main.mjs stop   [--home DIR]
//   main.mjs status [--home DIR] [--root ABS]
//   main.mjs bridge [--home DIR]   fail-closed MCP stdio bridge to the managed daemon
//   main.mjs trust add|remove|list [--home DIR] --root ABS   (explicit user registration)
//
// `run` relaunches itself under macOS sandbox-exec, probes network denial,
// then creates state and listens on a private Unix socket. Exit 78 means the
// kernel boundary probe failed; the daemon was not started.
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENTRY = fileURLToPath(import.meta.url);
const EXIT_BOUNDARY = 78;
const EXIT_FAILURE = 70;

export function parse(argv) {
  const [command = "", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!["--home", "--listen", "--token-file", "--root", "--barrier-ms"].includes(flag) || value === undefined) {
      throw new Error(`unknown or incomplete option: ${flag}`);
    }
    options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    index += 1;
  }
  return { command, options };
}

function resolveHome(options) {
  const configured = options.home ?? process.env.ZVEC_GREP_HOME;
  return resolve(configured ?? join(homedir(), ".zvec-grep"));
}

function readLock(home) {
  try {
    return JSON.parse(readFileSync(join(home, "daemon", "instance.lock"), "utf8"));
  } catch {
    return undefined;
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function socketRequest(socketPath, method, path, expectedToken, body) {
  return new Promise((resolveRequest, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(
      { socketPath, method, path, headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {} },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (response.headers["x-managed-instance"] !== expectedToken) {
            reject(new Error("socket peer identity mismatch"));
            return;
          }
          resolveRequest({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") });
        });
      },
    );
    request.setTimeout(10_000, () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end(payload);
  });
}

function liveManaged(home) {
  const lock = readLock(home);
  if (!lock?.managed || !lock.managedSocket || !processAlive(lock.pid)) return undefined;
  return lock;
}

function trustedIndexHomes(home, TrustStore, trustFile, indexIdentity) {
  const trust = new TrustStore(trustFile(home));
  const homes = [];
  for (const entry of trust.list()) {
    try {
      const root = realpathSync(entry.root);
      if (root !== entry.root) continue;
      const indexHome = join(root, ".zvec-grep");
      if (!lstatSync(indexHome).isDirectory() || realpathSync(indexHome) !== indexHome) continue;
      const identity = indexIdentity(indexHome);
      const manifest = JSON.parse(readFileSync(join(indexHome, "manifest.json"), "utf8"));
      if (identity === indexIdentity(indexHome) && trust.check(root, manifest, identity).trusted) homes.push(indexHome);
    } catch {
      // Missing or unsafe indexes do not receive a write grant.
    }
  }
  return homes;
}

export async function runCommand(options, sandboxed = false) {
  const sandbox = await import("./os-sandbox.mjs");
  const refuse = (error) => {
    console.error(`${error.code ?? "ERROR"}: ${error.message}`);
    process.exit(error.code === "OS_EGRESS_BOUNDARY_UNAVAILABLE" ? EXIT_BOUNDARY : EXIT_FAILURE);
  };
  const home = resolveHome(options);
  process.env.ZVEC_GREP_HOME = home;
  const { loadPackage } = await import("./package.mjs");
  const pkg = loadPackage();
  const config = await pkg.importInternal("daemon/config.js");
  const listen = config.configuredListenAddress(options.listen);
  if (listen.host !== "127.0.0.1" && listen.host !== "localhost") {
    throw new Error("the managed daemon listens on IPv4 loopback only (127.0.0.1:PORT)");
  }
  const { warningsDir } = await import("./state.mjs");
  const { socketLocation } = await import("./server.mjs");
  const { canonicalPath } = await import("./existing-index.mjs");
  const { TrustStore, trustFile, indexIdentity } = await import("./trust.mjs");
  const { createCanary, removeCanary, proveFilesystemAndExec } = await import("./sandbox-canary.mjs");

  if (!sandboxed) {
    let code;
    let canary;
    let failure;
    try {
      const rgPath = realpathSync(pkg.requireFromPackage("@vscode/ripgrep").rgPath);
      if (options.tokenFile || process.env.ZVEC_GREP_SERVER_TOKEN_FILE) {
        throw new Error("token-file configuration is unsupported by the Unix-only daemon");
      }
      const writableRoots = [
        home,
        socketLocation(home).dir,
        warningsDir(process.env),
        process.env.ZVEC_GREP_MODEL_CACHE,
      ]
        .filter(Boolean)
        .map(canonicalPath);
      const indexHomes = trustedIndexHomes(home, TrustStore, trustFile, indexIdentity);
      const userHome = realpathSync(homedir());
      for (const root of writableRoots) {
        if (root === "/" || userHome === root || userHome.startsWith(`${root}/`) || indexHomes.some((indexHome) => {
          const workspace = dirname(indexHome);
          return workspace === root || workspace.startsWith(`${root}/`) || root.startsWith(`${workspace}/`);
        })) {
          throw new Error("daemon state grant overlaps a workspace index or a protected home root");
        }
      }
      canary = createCanary();
      writableRoots.push(join(canary.root, "new"));
      indexHomes.push(...canary.indexHomes);
      code = await sandbox.relaunchInSandbox({
        entry: fileURLToPath(new URL("./daemon-entry.mjs", import.meta.url)),
        args: [...process.argv.slice(2), "--boundary-canary", canary.root],
        env: process.env,
        profile: sandbox.buildProfile({ port: listen.port, nodePath: realpathSync(process.execPath), rgPath, writableRoots, indexHomes, home: canonicalPath(home) }),
      });
    } catch (error) {
      failure = error;
    }
    if (canary) {
      try { removeCanary(canary); } catch (error) { failure ??= error; }
    }
    if (failure) refuse(failure);
    process.exit(code);
  }

  let proof;
  try {
    proof = await sandbox.proveEgressBoundary({ port: listen.port });
    if (!options.boundaryCanary) throw new sandbox.SandboxUnavailableError("missing kernel boundary canary");
    proveFilesystemAndExec(options.boundaryCanary);
  } catch (error) {
    refuse(error);
  }
  const fatal = (error) => {
    console.error(`FATAL: ${error?.code ?? "ERROR"}: ${error?.message ?? error}`);
    process.exit(EXIT_FAILURE);
  };
  process.on("uncaughtException", fatal);
  process.on("unhandledRejection", fatal);

  const { launchUnixSupervisor } = await import("./unix-supervisor.mjs");
  const unixSupervisor = launchUnixSupervisor({ deferred: true });
  let stoppingUnixSupervisor = false;
  unixSupervisor.child.once("exit", () => { if (!stoppingUnixSupervisor) fatal(new Error("Unix ingress supervisor stopped")); });
  unixSupervisor.stop = () => {
    stoppingUnixSupervisor = true;
    if (!unixSupervisor.child.pid || unixSupervisor.child.exitCode !== null || unixSupervisor.child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => unixSupervisor.child.kill("SIGKILL"), 2000);
      unixSupervisor.child.once("exit", () => { clearTimeout(timer); resolve(); });
      unixSupervisor.child.kill("SIGTERM");
    });
  };

  const { installGuards } = await import("./egress-guard.mjs");
  installGuards({
    allowedExecutables: [realpathSync(pkg.requireFromPackage("@vscode/ripgrep").rgPath)],
    createRoots: [
      home,
      socketLocation(home).dir,
      warningsDir(process.env),
      ...(process.env.ZVEC_GREP_MODEL_CACHE ? [process.env.ZVEC_GREP_MODEL_CACHE] : []),
    ],
    zvecCjsPath: pkg.requireFromPackage.resolve("@zvec/zvec"),
    guardModuleUrl: new URL("./egress-guard.mjs", import.meta.url).href,
  });

  // Fail closed before any vendor module is loaded if a guard is not effective.
  const { selfTestGuards } = await import("./egress-guard.mjs");
  const zvecCjs = pkg.requireFromPackage.resolve("@zvec/zvec");
  await selfTestGuards({ zvecEsmUrl: pathToFileURL(join(dirname(zvecCjs), "index.mjs")).href });

  const { loadEngine } = await import("./existing-index.mjs");
  const { createOfflineModelFactory } = await import("./offline-model.mjs");
  const { runManagedDaemon } = await import("./server.mjs");
  const engine = await loadEngine(pkg);
  const offline = await createOfflineModelFactory(pkg);
  const barrierMs = options.barrierMs
    ? Number(options.barrierMs)
    : process.env.ZVEC_GREP_MANAGED_BARRIER_MS
      ? Number(process.env.ZVEC_GREP_MANAGED_BARRIER_MS)
      : undefined;
  if (barrierMs !== undefined && !(Number.isFinite(barrierMs) && barrierMs >= 100 && barrierMs <= 600_000)) {
    throw new Error("barrier must be between 100 and 600000 milliseconds");
  }
  await runManagedDaemon({
    pkg,
    engine,
    offline,
    sandboxProof: proof,
    unixSupervisor,
    options: { home, listen: options.listen, tokenFile: options.tokenFile, barrierMs },
  });
}

async function startCommand(options) {
  const home = resolveHome(options);
  const args = ["run", "--home", home];
  for (const flag of ["listen", "tokenFile", "barrierMs"]) {
    if (options[flag] !== undefined) args.push(`--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, options[flag]);
  }
  const child = spawn(process.execPath, [ENTRY, ...args], { detached: true, stdio: "ignore", env: process.env });
  let exited;
  child.once("exit", (code) => {
    exited = code ?? 1;
  });
  child.unref();
  const startedAt = Date.now();
  const deadline = startedAt + 20_000;
  while (Date.now() < deadline) {
    if (exited !== undefined) {
      console.error(`managed daemon exited with code ${exited}${exited === EXIT_BOUNDARY ? " (OS_EGRESS_BOUNDARY_UNAVAILABLE)" : ""}`);
      process.exit(exited === EXIT_BOUNDARY ? EXIT_BOUNDARY : EXIT_FAILURE);
    }
    const lock = readLock(home);
    // The listening pid is the sandboxed node under the launcher, not child.pid.
    if (lock?.managed && lock.ready && lock.startedAt >= startedAt - 1_000 && processAlive(lock.pid)) {
      console.log(JSON.stringify({ pid: lock.pid, serverUrl: lock.serverUrl, managedSocket: lock.managedSocket }));
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  console.error("managed daemon did not become ready");
  process.exit(EXIT_FAILURE);
}

async function supervisedBridgeCommand(options) {
  const { superviseBridge } = await import("./stdio-supervisor.mjs");
  const child = spawn(process.execPath, [ENTRY, "bridge-worker", "--home", resolveHome(options)], {
    stdio: ["pipe", "pipe", "inherit"], env: process.env,
  });
  const { code, signal } = await superviseBridge({ child });
  if (signal || code) process.exitCode = code || EXIT_FAILURE;
}

async function bridgeCommand(options) {
  const home = resolveHome(options);
  process.env.ZVEC_GREP_HOME = home;
  const fail = (message) => {
    console.error(`managed zvec daemon unavailable: ${message}; not falling back to the stock daemon`);
    process.exit(69);
  };
  const lock = liveManaged(home);
  if (!lock) fail("not running");
  let identity;
  try {
    identity = (await socketRequest(lock.managedSocket, "GET", "/managed/identity", lock.instanceToken)).body;
  } catch (error) {
    fail(`identity check failed (${error.message})`);
  }
  if (identity.managed !== true || identity.pid !== lock.pid || identity.instance_token !== lock.instanceToken || identity.os_sandbox?.remote !== "denied") {
    fail("identity does not match the lock record");
  }
  const { loadPackage } = await import("./package.mjs");
  const pkg = loadPackage();
  const { runUnixBridge } = await import("./unix-bridge.mjs");
  process.stdin.once("end", () => process.exit(0));
  await runUnixBridge({ pkg, socketPath: lock.managedSocket, instanceToken: lock.instanceToken, isAlive: () => processAlive(lock.pid) });
  process.exit(0);
}

async function trustCommand(action, options) {
  const home = resolveHome(options);
  const { TrustStore, trustFile } = await import("./trust.mjs");
  const store = new TrustStore(trustFile(home));
  if (action === "list") {
    console.log(JSON.stringify(store.list()));
    return;
  }
  if (!options.root || !resolve(options.root)) throw new Error("--root ABS is required");
  const { loadPackage } = await import("./package.mjs");
  const { loadEngine, inspectExistingIndex, READY } = await import("./existing-index.mjs");
  const engine = await loadEngine(loadPackage());
  const inspection = inspectExistingIndex(engine, resolve(options.root));
  if (action === "remove") {
    const target = inspection.root ?? resolve(options.root);
    console.log(JSON.stringify({ removed: store.remove(target), root: target }));
    return;
  }
  if (action !== "add") throw new Error("usage: trust add|remove|list --root ABS");
  if (inspection.state !== READY) {
    console.error(`refusing to register ${options.root}: index state is ${inspection.state}${inspection.reason ? ` (${inspection.reason})` : ""}`);
    process.exit(EXIT_FAILURE);
  }
  store.add(inspection.root, inspection.manifest, inspection.identity);
  console.log(JSON.stringify({ registered: true, root: inspection.root, manifest_id: inspection.manifest.id }));
}

async function clientCommand(command, options) {
  const home = resolveHome(options);
  const lock = liveManaged(home);
  if (!lock) {
    console.error("no managed daemon is running for this home");
    process.exit(command === "stop" ? 0 : 1);
  }
  if (command === "stop") {
    await socketRequest(lock.managedSocket, "POST", "/managed/shutdown", lock.instanceToken, {});
    for (let attempt = 0; attempt < 100 && processAlive(lock.pid); attempt++) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    console.log(JSON.stringify({ stopped: !processAlive(lock.pid) }));
    return;
  }
  const query = options.root ? `?root=${encodeURIComponent(options.root)}` : "";
  const response = await socketRequest(lock.managedSocket, "GET", `/managed/status${query}`, lock.instanceToken);
  console.log(JSON.stringify(response.body));
}

if (process.argv[1] && resolve(process.argv[1]) === ENTRY) try {
  const argv = process.argv.slice(2);
  if (argv[0] === "trust") {
    await trustCommand(argv[1], parse(["trust", ...argv.slice(2)]).options);
  } else {
    const { command, options } = parse(argv);
    if (command === "run") await runCommand(options);
    else if (command === "start") await startCommand(options);
    else if (command === "stop" || command === "status") await clientCommand(command, options);
    else if (command === "bridge") await supervisedBridgeCommand(options);
    else if (command === "bridge-worker") await bridgeCommand(options);
    else {
      console.error("usage: main.mjs run|start|stop|status|bridge|trust [--home DIR] [--listen HOST:PORT] [--token-file FILE] [--root ABS]");
      process.exit(2);
    }
  }
} catch (error) {
  console.error(`${error.code ?? "ERROR"}: ${error.message}`);
  process.exit(EXIT_FAILURE);
}
