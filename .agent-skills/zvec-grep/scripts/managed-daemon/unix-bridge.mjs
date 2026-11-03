// MCP stdio-to-Streamable-HTTP bridge over the managed daemon's private socket.
// The protocol forwarding mirrors the pinned package's stdio-bridge.js.
import http from "node:http";
import { lstatSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const MCP_URL = new URL("http://localhost/mcp");

// Leave time for MCP serialization and delivery within the 30-second limit.
const SEARCH_DEADLINE_MS = 29_000;

export async function forwardSearchWithDeadline(forwardRequest, timeoutMs = SEARCH_DEADLINE_MS, signal) {
  const controller = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let timer;
  const expiresAt = performance.now() + timeoutMs;
  const expired = () => performance.now() >= expiresAt;
  const timeoutResult = () => {
    controller.abort();
    return { isError: true, content: [{ type: "text", text: "Fresh search timed out; use native Grep or rg instead." }] };
  };
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(timeoutResult()), timeoutMs);
  });
  try {
    const result = await Promise.race([Promise.resolve().then(() => forwardRequest(combinedSignal, expired)), deadline]);
    return expired() ? timeoutResult() : result;
  } catch (error) {
    if (expired()) return timeoutResult();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// The identity probe and the MCP request must use the same live connection.
// An agent is allocated per fetch so concurrent calls cannot swap sockets.
export function unixFetch(socketPath, instanceToken) {
  if (typeof instanceToken !== "string" || !instanceToken) throw new Error("managed daemon instance identity is missing");
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== MCP_URL.origin || url.pathname !== MCP_URL.pathname || url.search || url.hash) {
      throw new Error("unexpected MCP transport destination");
    }
    const dir = lstatSync(dirname(socketPath));
    const socket = lstatSync(socketPath);
    if (!dir.isDirectory() || dir.uid !== process.getuid() || (dir.mode & 0o077) ||
        !socket.isSocket() || socket.uid !== process.getuid() || (socket.mode & 0o077)) {
      throw new Error("managed socket is not owner-private");
    }
    const headers = new Headers(init.headers);
    headers.set("host", "localhost");
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const verifiedSocket = await new Promise((resolve, reject) => {
        const probe = http.request({ socketPath, path: "/managed/identity", method: "GET", agent, signal: init.signal, headers: { host: "localhost" } }, (response) => {
          if (response.statusCode !== 200 || response.headers["x-managed-instance"] !== instanceToken) {
            response.destroy();
            reject(new Error("managed daemon peer identity mismatch"));
            return;
          }
          const peer = response.socket;
          const disconnected = () => reject(new Error("managed daemon connection closed during identity check"));
          peer.once("close", disconnected);
          response.once("error", reject);
          agent.once("free", (released) => {
            peer.off("close", disconnected);
            if (released !== peer || peer.destroyed) reject(new Error("managed daemon connection changed"));
            else resolve(peer);
          });
          response.resume();
        });
        probe.once("error", reject);
        probe.end();
      });
      return await new Promise((resolve, reject) => {
        const request = http.request({ socketPath, path: url.pathname, method: init.method ?? "GET", headers: Object.fromEntries(headers), agent, signal: init.signal }, (response) => {
          if (response.socket !== verifiedSocket || response.headers["x-managed-instance"] !== instanceToken) {
            response.destroy();
            reject(new Error("managed daemon peer identity mismatch"));
            return;
          }
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item);
            else if (value !== undefined) responseHeaders.set(key, value);
          }
          const status = response.statusCode ?? 500;
          response.once("close", () => agent.destroy());
          const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(response);
          if (!body) response.resume();
          resolve(new Response(body, { status, statusText: response.statusMessage, headers: responseHeaders }));
        });
        request.once("error", reject);
        request.once("socket", (actual) => {
          if (actual !== verifiedSocket || actual.destroyed) {
            request.destroy(new Error("managed daemon connection changed"));
          } else if (init.body == null) request.end();
          else if (typeof init.body === "string" || Buffer.isBuffer(init.body) || init.body instanceof Uint8Array) request.end(init.body);
          else request.destroy(new Error("unsupported MCP request body"));
        });
      });
    } catch (error) {
      agent.destroy();
      throw error;
    }
  };
}

export async function runUnixBridge({ pkg, socketPath, instanceToken, isAlive, searchDeadlineMs = SEARCH_DEADLINE_MS }) {
  if (!Number.isFinite(searchDeadlineMs) || searchDeadlineMs <= 0 || searchDeadlineMs > SEARCH_DEADLINE_MS) throw new Error("invalid search deadline");
  const load = (name) => import(pathToFileURL(pkg.requireFromPackage.resolve(name)).href);
  const [{ Client, StreamableHTTPClientTransport }, { ResultSchema }, { Server }, { StdioServerTransport }, nativeBridge, heartbeat] = await Promise.all([
    load("@modelcontextprotocol/client"),
    load("@modelcontextprotocol/core"),
    load("@modelcontextprotocol/server"),
    load("@modelcontextprotocol/server/stdio"),
    pkg.importInternal("mcp/stdio-bridge.js"),
    pkg.importInternal("mcp/progress-heartbeat.js"),
  ]);
  let downstream;
  let closed = false;
  let resolveClosed;
  const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });
  const finish = () => { if (!closed) { closed = true; resolveClosed(); } };
  const forward = (peer, request, signal, meta, notify) => peer.request(
    meta ? { ...request, params: { ...(request.params ?? {}), _meta: meta } } : request,
    ResultSchema,
    {
      signal,
      timeout: heartbeat.LONG_RUNNING_MCP_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      onprogress: meta?.progressToken === undefined || !notify ? undefined : (progress) => notify({
        method: "notifications/progress", params: { ...progress, progressToken: meta.progressToken },
      }),
    },
  );
  const upstream = new Client({ name: "zvec-grep-stdio-bridge", version: pkg.version }, {
    capabilities: { elicitation: { form: {}, url: {} }, roots: { listChanged: true }, sampling: {} },
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  upstream.fallbackRequestHandler = (request, context) => {
    if (!downstream) throw new Error("stdio MCP client is not connected");
    return forward(downstream, request, context.mcpReq.signal, context.mcpReq._meta);
  };
  nativeBridge.registerStdioBridgeElicitationForwarding(upstream, () => downstream);
  upstream.fallbackNotificationHandler = async (notification) => { await downstream?.notification(notification); };
  upstream.onerror = (error) => console.error(error.message);
  upstream.onclose = finish;
  let monitor;
  let daemonFailure;
  try {
    await upstream.connect(new StreamableHTTPClientTransport(MCP_URL, { fetch: unixFetch(socketPath, instanceToken) }));
    downstream = new Server(upstream.getServerVersion() ?? { name: "zvec-grep", version: pkg.version }, {
      capabilities: upstream.getServerCapabilities() ?? {}, instructions: upstream.getInstructions(),
    });
    downstream.fallbackRequestHandler = (request, context) => {
      if (request.method !== "tools/call" || request.params?.name !== "zvec_grep_search") {
        return forward(upstream, request, context.mcpReq.signal, context.mcpReq._meta, context.mcpReq.notify);
      }
      return forwardSearchWithDeadline((signal, expired) => forward(
        upstream, request, signal, context.mcpReq._meta,
        (notification) => { if (!expired()) return context.mcpReq.notify(notification); },
      ), searchDeadlineMs, context.mcpReq.signal);
    };
    downstream.fallbackNotificationHandler = async (notification) => { await upstream.notification(notification); };
    downstream.onerror = (error) => console.error(error.message);
    downstream.onclose = finish;
    let monitoring = false;
    monitor = setInterval(() => {
      if (closed || monitoring) return;
      monitoring = true;
      Promise.resolve().then(isAlive).then(async (alive) => {
        if (alive) return;
        daemonFailure = new Error("managed daemon stopped while the stdio bridge was connected");
        finish();
        await downstream.close().catch(() => undefined);
      }).catch(async () => {
        daemonFailure = new Error("managed daemon identity check failed");
        finish();
        await downstream.close().catch(() => undefined);
      }).finally(() => { monitoring = false; });
    }, 2000);
    monitor.unref?.();
    await downstream.connect(new StdioServerTransport());
    await closedPromise;
  } finally {
    clearInterval(monitor);
    await Promise.allSettled([upstream.close(), downstream?.close()]);
  }
  if (daemonFailure) throw daemonFailure;
}
