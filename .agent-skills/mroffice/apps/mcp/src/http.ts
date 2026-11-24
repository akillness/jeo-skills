// The HTTP side: the MCP endpoint (Streamable HTTP, /mcp), the editor page a
// link opens (/_mcp/view/<id>), that page's document API (/_mcp/api/doc/<id>),
// downloads (/_mcp/file/<id>) and, when configured, the open editors' built
// page and assets at the root.

import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { BearerEngine } from "./engine.ts";
import { safeFileName } from "./formats.ts";
import { createServer, exportFile, type Services } from "./server.ts";
import { RevisionConflict } from "./store.ts";
import { tokenGate } from "./token-gate.ts";
import { editorPage } from "./widget.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

const MAX_BODY = 40 * 1024 * 1024;

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += (chunk as Buffer).length;
    if (total > MAX_BODY) throw Object.assign(new Error("request too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, { "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", ...headers });
  response.end(text);
}

/** A hosted server's callers (MROFFICE_MCP_AUTH=oauth): RFC 9728 metadata,
 * and each bearer token checked with MR Office (token-gate.ts: any of our
 * scopes, each answer kept 5 s so a disconnected app is refused within 5 s). */
function oauthGate(services: Services) {
  const { config } = services;
  const apiUrl = config.engine.kind === "account" ? config.engine.apiUrl : "";
  const resource = `${config.publicUrl}/mcp`;
  const metadataUrl = `${config.publicUrl}/.well-known/oauth-protected-resource/mcp`;
  const tokens = tokenGate({ apiUrl });
  const metadata = { resource, authorization_servers: [apiUrl], scopes_supported: ["office.convert", "account.read"], bearer_methods_supported: ["header"], resource_name: "MR Office" };
  const challenge = (error?: string) => `Bearer resource_metadata="${metadataUrl}", scope="office.convert account.read"${error ? `, error="${error}"` : ""}`;
  // MCP clients of the specification's first authorization revision look
  // for the authorization server's metadata on the MCP host itself: answer
  // MR Office's own (its issuer and endpoints stay https://mroffice.ai),
  // kept 5 minutes.
  let asMetadata: { body: unknown; until: number } | null = null;
  const authorizationServer = async (): Promise<unknown> => {
    if (asMetadata && asMetadata.until > Date.now()) return asMetadata.body;
    const response = await fetch(`${apiUrl}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw Object.assign(new Error("MR Office's sign-in could not be reached"), { status: 503 });
    asMetadata = { body: await response.json(), until: Date.now() + 300_000 };
    return asMetadata.body;
  };
  return { metadata, challenge, authorizationServer, check: (token: string) => tokens.check(token) };
}

function bearerOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization ?? "";
  const [scheme, value] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}

export function startHttp(services: Services): Promise<Server> {
  const { config, store } = services;
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const gate = config.auth === "oauth" ? oauthGate(services) : null;
  /** The latest token each hosted session sent. */
  const sessionTokens = new Map<string, string>();
  /** The MR Office account each hosted session belongs to: a later request
   * on the session must carry a token of the same account. */
  const sessionOwners = new Map<string, string>();
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(config.publicUrl);
  const distRoot = config.editorDist ? resolve(config.editorDist) : null;

  async function handleMcp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const sessionId = request.headers["mcp-session-id"];
    let token: string | null = null;
    let subject: string | undefined;
    if (gate) {
      token = bearerOf(request);
      const checked = token ? await gate.check(token) : null;
      if (checked?.state === "unavailable") {
        // not the caller's fault: their app should retry, not sign in again
        send(response, 503, { error: "temporarily_unavailable", error_description: "MR Office could not be reached. Try again shortly." }, { "retry-after": "5" });
        return;
      }
      if (!token || checked?.state !== "active") {
        send(response, 401, { error: "invalid_token", error_description: "Sign in to MR Office." }, { "www-authenticate": gate.challenge(token ? "invalid_token" : undefined) });
        return;
      }
      subject = checked.sub;
      if (typeof sessionId === "string" && sessions.has(sessionId)) {
        if (sessionOwners.get(sessionId) !== subject) {
          send(response, 403, { error: "invalid_token", error_description: "This session belongs to another MR Office account." });
          return;
        }
        sessionTokens.set(sessionId, token);
      }
    }
    let transport = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
    let body: unknown;
    if (request.method === "POST") body = JSON.parse((await readBody(request)).toString("utf8") || "null");
    if (!transport) {
      if (request.method !== "POST" || !isInitializeRequest(body)) {
        send(response, 400, { jsonrpc: "2.0", error: { code: -32000, message: "No session: initialize first" }, id: null });
        return;
      }
      const created: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string): void => {
          sessions.set(id, created);
          if (subject) sessionOwners.set(id, subject);
        },
        // a page on another site must not drive a server on this machine
        ...(local ? { enableDnsRebindingProtection: true, allowedHosts: [`127.0.0.1:${config.port}`, `localhost:${config.port}`] } : {}),
      });
      created.onclose = () => {
        if (created.sessionId) {
          sessions.delete(created.sessionId);
          sessionTokens.delete(created.sessionId);
          sessionOwners.delete(created.sessionId);
        }
      };
      let sessionServices = services;
      if (gate && config.engine.kind === "account") {
        // each caller converts with their own token, never this server's
        let first: string | null = token;
        const engine = new BearerEngine(config.engine.apiUrl, () => (created.sessionId ? sessionTokens.get(created.sessionId) : undefined) ?? first);
        sessionServices = { ...services, engine, account: undefined };
        created.onclose = ((previous) => () => {
          previous?.();
          first = null;
        })(created.onclose);
      }
      // a server reached from elsewhere does not list one person's documents to another
      await createServer(sessionServices, { listAll: local, owner: subject }).connect(created);
      transport = created;
    }
    await transport!.handleRequest(request, response, body);
  }

  async function handleDocApi(request: IncomingMessage, response: ServerResponse, id: string, token: string | null): Promise<void> {
    if (!store.authorize(id, token)) return send(response, 404, { error: "No such document, or the link is not valid." });
    if (request.method === "GET") {
      const doc = store.get(id);
      return send(response, 200, { id: doc.id, title: doc.title, format: doc.format, name: doc.current.name, rev: doc.current.rev, by: doc.current.by, base64: Buffer.from(doc.bytes).toString("base64") });
    }
    if (request.method === "PUT") {
      // the page posts from its own origin only
      const origin = request.headers.origin;
      if (origin && origin !== config.publicUrl) return send(response, 403, { error: "Saving is allowed from the editor page only." });
      const input = JSON.parse((await readBody(request)).toString("utf8")) as { name?: string; base64?: string; baseRev?: number };
      if (typeof input.base64 !== "string" || typeof input.name !== "string") return send(response, 400, { error: "name and base64 are required" });
      try {
        const saved = store.save(id, { name: safeFileName(input.name), bytes: new Uint8Array(Buffer.from(input.base64, "base64")), by: "person", baseRev: input.baseRev });
        return send(response, 200, { rev: saved.current.rev, name: saved.current.name });
      } catch (error) {
        if (error instanceof RevisionConflict) return send(response, 409, { error: error.message });
        throw error;
      }
    }
    return send(response, 405, { error: "method not allowed" });
  }

  function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string): boolean {
    if (!distRoot || (request.method !== "GET" && request.method !== "HEAD")) return false;
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
    const path = resolve(distRoot, relative || "index.html");
    if (path !== distRoot && !path.startsWith(distRoot + sep)) return false;
    if (!existsSync(path) || !statSync(path).isFile()) return false;
    response.writeHead(200, {
      "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      "content-length": String(statSync(path).size),
      // the editor's assets load into views served from the hosts' own origins
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "cache-control": relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path).pipe(response);
    return true;
  }

  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", config.publicUrl);
    try {
      if (url.pathname === "/mcp") return await handleMcp(request, response);
      // a liveness answer only: a shared server says nothing about what it holds
      if (url.pathname === "/_mcp/health") return send(response, 200, local ? { ok: true, documents: store.list().length } : { ok: true });
      if (gate && (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp")) {
        return send(response, 200, gate.metadata, { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });
      }
      if (gate && url.pathname === "/.well-known/oauth-authorization-server") {
        return send(response, 200, await gate.authorizationServer(), { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });
      }
      let match = url.pathname.match(/^\/_mcp\/view\/([a-z0-9]{12})$/);
      if (match) {
        const token = url.searchParams.get("t");
        if (!store.authorize(match[1], token)) return send(response, 404, "No such document, or the link is not valid.");
        const html = await editorPage(config, { kind: "page", id: match[1], token: token!, api: `${config.publicUrl}/_mcp/api`, render: url.searchParams.get("render") === "1" });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" });
        return response.end(html);
      }
      match = url.pathname.match(/^\/_mcp\/api\/doc\/([a-z0-9]{12})$/);
      if (match) return await handleDocApi(request, response, match[1], url.searchParams.get("t"));
      match = url.pathname.match(/^\/_mcp\/file\/([a-z0-9]{12})$/);
      if (match) {
        if (!store.authorize(match[1], url.searchParams.get("t"))) return send(response, 404, "No such document, or the link is not valid.");
        const doc = store.get(match[1]);
        const file = await exportFile(services, doc, url.searchParams.get("format") || doc.format);
        response.writeHead(200, { "content-type": file.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "cache-control": "no-store" });
        return response.end(Buffer.from(file.bytes));
      }
      if (serveStatic(request, response, url.pathname)) return;
      send(response, 404, "not found");
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      if (!response.headersSent) send(response, status, { error: error instanceof Error ? error.message : String(error) });
      else response.end();
    }
  });
  if (config.retentionDays) {
    // a hosted server's documents are working copies: the ones nobody saved
    // for retentionDays go, checked hourly
    const maxAge = config.retentionDays * 24 * 3600_000;
    const sweep = () => {
      try {
        const removed = store.prune(maxAge);
        if (removed) process.stderr.write(`[mroffice-mcp] removed ${removed} document(s) unsaved for ${config.retentionDays} days\n`);
      } catch (error) {
        process.stderr.write(`[mroffice-mcp] retention sweep failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    };
    sweep();
    setInterval(sweep, 3600_000).unref();
  }
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.listenHost, () => resolveListen(server));
  });
}

