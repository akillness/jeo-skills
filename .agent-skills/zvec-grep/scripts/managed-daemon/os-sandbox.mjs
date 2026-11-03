// OS-level boundary for the managed daemon (macOS sandbox-exec).
//
// The in-process guard in egress-guard.mjs cannot cover native code (zvec
// bindings, ripgrep, model runtimes), so the daemon only starts inside a
// kernel-enforced sandbox, and children (ripgrep, workers) inherit it
// irrevocably:
//   * network: all outbound connections and TCP listeners are denied; the
//     daemon accepts requests only through an owner-only Unix socket;
//   * exec: only the node binary and the bundled ripgrep;
//   * writes: only explicitly granted daemon state and registered index homes;
//     workspace source files outside those grants cannot be modified.
// Hosts without an enforceable boundary fail closed.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
export const SANDBOX_MODE = "darwin-sandbox-exec";

// RFC 5737 TEST-NET-1: never routable, so only a sandbox deny yields EPERM.
const PROBE_REMOTE = { host: "192.0.2.1", port: 9 };
const CREDENTIAL_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;
const KEEP_CREDENTIAL_ENV = new Set(["ZVEC_GREP_SERVER_TOKEN", "ZVEC_GREP_SERVER_TOKEN_FILE"]);

export class SandboxUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "SandboxUnavailableError";
    this.code = "OS_EGRESS_BOUNDARY_UNAVAILABLE";
  }
}

const quote = (value) => `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/** @param {{port:number, nodePath:string, rgPath:string, writableRoots:string[], indexHomes?:string[], home:string}} input */
export function buildProfile({ port, nodePath, rgPath, writableRoots, indexHomes = [], home }) {
  const writable = [...writableRoots, ...indexHomes].map((root) => `(subpath ${quote(root)})`).join(" ");
  return [
    "(version 1)",
    "(allow default)",
    "(deny network-outbound)",
    "(deny network-bind)",
    "(allow network-bind (local unix-socket))",
    "(deny process-exec*)",
    `(allow process-exec* (literal ${quote(nodePath)}) (literal ${quote(rgPath)}))`,
    "(deny file-write*)",
    `(allow file-write* ${writable} (literal "/dev/null"))`,
    // Kernel-level no-create: a `.zvec-grep` directory can only be created for
    // the daemon's own home, and an existing index's top-level entries can be
    // neither created nor removed (collection internals stay writable).
    '(deny file-write-create (regex #"/\\.zvec-grep$"))',
    '(deny file-write-unlink (regex #"/\\.zvec-grep$"))',
    `(allow file-write-create (literal ${quote(home)}))`,
    '(deny file-write-create file-write-unlink (regex #"/\\.zvec-grep/(index\\.zvec|files\\.zvec|manifest\\.json)$"))',
  ].join("");
}

export function sandboxSupported() {
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC);
}

/** Refuses to start unless sandbox-exec exists and can still apply a profile (it cannot when nested). */
export function assertSandboxSupported() {
  if (!sandboxSupported()) {
    throw new SandboxUnavailableError(
      `no enforceable OS egress boundary on ${process.platform}; the managed daemon only runs under macOS sandbox-exec and refuses to start elsewhere`,
    );
  }
  const probe = spawnSync(SANDBOX_EXEC, ["-p", "(version 1)(allow default)", "/usr/bin/true"], { stdio: "ignore" });
  if (probe.status !== 0) {
    throw new SandboxUnavailableError(
      "sandbox-exec cannot apply a profile here (already inside another sandbox, or sandboxing is unavailable)",
    );
  }
}

export function scrubbedEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !CREDENTIAL_NAME.test(name) || KEEP_CREDENTIAL_ENV.has(name)),
  );
}

/**
 * Re-exec the current entry point inside the sandbox and mirror its exit.
 * Never returns control to unsandboxed code.
 */
export function relaunchInSandbox({ entry, args, env, profile }) {
  assertSandboxSupported();
  return new Promise((resolve, reject) => {
    const child = spawn(SANDBOX_EXEC, ["-p", profile, process.execPath, entry, ...args], {
      stdio: "inherit",
      env: scrubbedEnvironment(env),
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.on(signal, () => child.kill(signal));
    }
    child.on("error", reject);
    child.on("close", (code, signal) => resolve(signal ? 128 : (code ?? 1)));
  });
}

/** Prove IP egress and TCP listeners are denied before creating state. */
export async function proveEgressBoundary({ port, timeoutMs = 2_000 }) {
  const expectDenied = async (label, outcome) => {
    const result = await outcome;
    if (result !== "EPERM") {
      throw new SandboxUnavailableError(`OS sandbox did not deny ${label} (probe outcome: ${result})`);
    }
  };
  await expectDenied("remote egress", connectOutcome(PROBE_REMOTE, timeoutMs));
  await expectDenied("loopback egress", connectOutcome({ host: "127.0.0.1", port }, timeoutMs));
  await expectDenied("IPv4 loopback listener", bindOutcome({ host: "127.0.0.1", port }));
  await expectDenied("IPv4 wildcard listener", bindOutcome({ host: "0.0.0.0", port }));
  await expectDenied("IPv6 wildcard listener", bindOutcome({ host: "::", port, ipv6Only: true }));
  return {
    mode: SANDBOX_MODE,
    loopback: "denied",
    remote: "denied",
    bind: "unix-only",
  };
}


function connectOutcome(target, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ ...target });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("TIMEOUT");
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve("connected");
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(error.code ?? "ERROR");
    });
  });
}

function bindOutcome(target) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code ?? "ERROR"));
    server.listen(target, () => server.close(() => resolve("bound")));
  });
}
