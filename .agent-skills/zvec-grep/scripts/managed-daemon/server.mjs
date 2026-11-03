// Managed agent MCP and control endpoints on an owner-only Unix socket.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createManagedApi } from "./api.mjs";
import { createManagedBackend } from "./backend.mjs";
import { ReservationStore, WarningStore, warningsDir } from "./state.mjs";
import { guardStatus } from "./egress-guard.mjs";
import { TrustStore, trustFile } from "./trust.mjs";
import { attachPrivateChannels } from "./unix-supervisor.mjs";

const MAX_BODY_BYTES = 1024 * 1024;

export function socketLocation(home) {
  const daemonDir = join(resolve(home), "daemon");
  const preferred = join(daemonDir, "managed.sock");
  if (Buffer.byteLength(preferred) <= 100) return { dir: daemonDir, path: preferred };
  const key = createHash("sha256").update(resolve(home)).digest("hex").slice(0, 8);
  const dir = join(tmpdir(), `zvg-${process.getuid()}-${key}`);
  return { dir, path: join(dir, "managed.sock") };
}

function ensurePrivateDirectory(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Check ownership and symlinks before tightening the mode.
  const before = lstatSync(dir);
  if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== process.getuid()) {
    throw new Error(`${dir} is not a directory owned by this user`);
  }
  chmodSync(dir, 0o700);
  if ((lstatSync(dir).mode & 0o777) !== 0o700) throw new Error(`${dir} is not an owner-only directory`);
}


async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error("body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (bytes === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON"), { statusCode: 400 });
  }
}

export async function runManagedDaemon({ pkg, engine, offline, sandboxProof, options, unixSupervisor }) {
  const [serverController, httpServerModule, loggerModule, configModule, requestState, runtimeManager] =
    await Promise.all([
      pkg.importInternal("daemon/server-controller.js"),
      pkg.importInternal("daemon/http-server.js"),
      pkg.importInternal("daemon/logger.js"),
      pkg.importInternal("daemon/config.js"),
      pkg.importInternal("mcp/request-state.js"),
      pkg.importInternal("daemon/runtime-manager.js"),
    ]);
  const home = resolve(options.home);
  const listen = configModule.configuredListenAddress(options.listen);
  const displayAddress = "unix://managed/mcp";

  // The boundary was proven before this function; only now is state created.
  const instanceLock = await serverController.DaemonInstanceLock.acquire(home, displayAddress, "agent");
  const daemonDir = configModule.daemonHome(home);
  const socket = socketLocation(home);
  let backend;
  let mcpServer;
  let unixServer;
  const cleanup = async () => {
    await unixSupervisor.stop();
    await backend?.close().catch(() => undefined);
    await mcpServer?.mcpEndpoint.close().catch(() => undefined);
    await mcpServer?.adminMcpEndpoint.close().catch(() => undefined);
    if (unixServer) unixServer.closeAllConnections();
    rmSync(socket.path, { force: true });
    await instanceLock.release();
  };
  try {
    ensurePrivateDirectory(daemonDir);
    ensurePrivateDirectory(socket.dir);
    const logger = loggerModule.createDaemonLogger(home);
    const requestStateKey = await requestState.loadOrCreateMcpRequestStateKey(home);

    const managedDir = join(daemonDir, "managed");
    ensurePrivateDirectory(managedDir);
    const reservationsDir = join(managedDir, "reservations");
    ensurePrivateDirectory(reservationsDir);
    const warningStore = new WarningStore(warningsDir(process.env));
    const reservationStore = new ReservationStore(reservationsDir);
    const trust = new TrustStore(trustFile(home));

    let requestStop;
    backend = await createManagedBackend(pkg, engine, offline, {
      version: pkg.version,
      logger,
      runtimeIdleTtlMs: configModule.configuredWatcherIdleTimeoutMs(),
      warnings: warningStore,
      reservations: reservationStore,
      trust,
      barrierMs: options.barrierMs,
    });
    backend.controller.adoptPersistedRoots();

    const identity = {
      pid: process.pid,
      instanceToken: instanceLock.record.instanceToken,
      osSandbox: sandboxProof,
      warningsDir: resolve(warningsDir(process.env)),
      guards: { ...guardStatus(), createRoots: undefined },
      packageVersion: pkg.version,
    };
    const api = createManagedApi({
      backend,
      controller: backend.controller,
      engine,
      trust,
      resolveRequestedRoot: runtimeManager.resolveRequestedRoot,
      identity,
    });

    const respond = async (request, response, transport) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("x-managed-instance", identity.instanceToken);
      const write = (status, body) => {
        response.statusCode = status;
        response.end(JSON.stringify(body));
      };
      try {
        if (url.pathname === "/managed/shutdown") {
          if (request.method !== "POST") return write(405, { status: "failed", error: { code: "METHOD_NOT_ALLOWED" } });
          write(202, { status: "stopping" });
          setImmediate(() => requestStop?.());
          return;
        }
        const body = request.method === "POST" ? await readJson(request) : undefined;
        const result = await api({
          method: request.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          body,
          transport,
        });
        write(result.status, result.body);
      } catch (error) {
        write(error.statusCode ?? 500, { status: "failed", error: { code: "BAD_REQUEST", message: String(error.message).slice(0, 128) } });
      }
    };


    mcpServer = new httpServerModule.DaemonHttpServer({
      ...listen,
      token: undefined,
      version: pkg.version,
      mcpToolset: "agent",
      backend,
      requestStateKey,
      requestStateReplayGuard: new requestState.PersistentRemoteEmbeddingRequestStateReplayGuard(home),
      logger,
      onShutdown: () => requestStop?.(),
    });
    unixServer = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/managed/")) {
        void respond(request, response, "unix");
        return;
      }
      if (url.pathname !== "/mcp") {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("x-managed-instance", identity.instanceToken);
      const requestId = randomUUID();
      void mcpServer.handleRequest(request, response, requestId).catch(() => {
        if (!response.headersSent) response.statusCode = 500;
        response.end();
      }).finally(() => mcpServer.requestTraceIds.delete(requestId));
    });
    rmSync(socket.path, { force: true });
    attachPrivateChannels(unixServer, unixSupervisor.child);
    unixSupervisor.activate({ socketPath: socket.path, instanceToken: identity.instanceToken });
    await unixSupervisor.ready;

    const stopped = new Promise((resolveStopped) => {
      let stopping = false;
      requestStop = () => {
        if (stopping) return;
        stopping = true;
        void cleanup().finally(async () => {
          logger.event("server.stopped", { pid: process.pid });
          await logger.flush();
          resolveStopped();
        });
      };
      process.once("SIGINT", requestStop);
      process.once("SIGTERM", requestStop);
    });

    Object.assign(instanceLock.record, {
      managed: true,
      managed_api: 1,
      supervisorPid: unixSupervisor.child.pid,
      managedSocket: socket.path,
      warnings_dir: identity.warningsDir,
      osSandbox: sandboxProof.mode,
    });
    await instanceLock.markReady();
    logger.event("server.ready", { transport: "unix", pid: process.pid });
    console.log(
      JSON.stringify({
        managed: true,
        pid: process.pid,
        serverUrl: displayAddress,
        managedSocket: socket.path,
        osSandbox: sandboxProof,
      }),
    );
    await stopped;
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
