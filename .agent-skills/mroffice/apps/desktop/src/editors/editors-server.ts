/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The editors' pages, served to the app's windows from its own files.
 *
 * The editors are the playground's build (apps/playground/dist; in a package,
 * resources/editors). They load their fonts, workers and sandbox pages by
 * absolute path (/fonts/..., /pdf.worker.min.mjs), and the code editor runs
 * Python in a sandbox page on another origin than its own. A small read-only
 * server on the loopback address gives them both: the pages at
 * http://127.0.0.1:<port>, and the sandbox at http://localhost:<port>, the
 * other origin of the same server (apps/playground/index.html).
 *
 * - Only files under the build's folder are served, only GET and HEAD, and
 *   only to a request that names this server as its host (a page elsewhere
 *   that points a name of its own at 127.0.0.1 is refused).
 * - Documents never pass through it: the windows get their files through the
 *   preload bridge (preload.ts).
 * - The port stays the same from one launch to the next (web-port.ts): the
 *   editors keep their preferences and drafts in the page's storage, which
 *   belongs to its origin, port included.
 *
 * No Electron here (test/editors-server.test.mjs).
 */

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { chooseWebPort, lastWebServerHolds, parseLastWebServer, usablePort } from "../classic/web-port";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

/** The file a request path names under `root`, or null when it names none
 * (outside the folder, hidden, or malformed). "/" is the page itself. */
export function servedPath(root: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const parts = (decoded === "/" ? "/index.html" : decoded).split("/").filter(Boolean);
  // no step up, nothing hidden
  if (!parts.length || parts.some((part) => part.startsWith("."))) return null;
  const full = path.resolve(root, ...parts);
  return full.startsWith(path.resolve(root) + path.sep) ? full : null;
}

/** Whether a request's Host header names this server. */
export function isOwnHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

export interface EditorsServer {
  readonly origin: string;
  readonly port: number;
  close(): Promise<void>;
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file: string): Promise<string> {
  return fs.readFile(file, "utf8").catch(() => "");
}

/**
 * Serve `root` on the loopback address, on the port remembered in
 * `dataFolder` (the first launch's, kept from then on).
 */
export async function startEditorsServer(root: string, dataFolder: string): Promise<EditorsServer> {
  await fs.access(path.join(root, "index.html"));
  const portFile = path.join(dataFolder, "editors-port.json");
  const serverFile = path.join(dataFolder, "editors-server.json");
  const remembered = Number((JSON.parse((await readJson(portFile)) || "{}") as { port?: unknown }).port);
  const last = parseLastWebServer(await readJson(serverFile));
  const choice = await chooseWebPort({
    remembered: usablePort(remembered) ? remembered : 0,
    fresh: await freePort(),
    isFree: canListen,
    heldByLastLaunch: lastWebServerHolds(last, remembered, processAlive),
  });

  const server = http.createServer((request, response) => {
    void (async () => {
      if (!isOwnHost(request.headers.host, choice.port)) {
        response.writeHead(421).end();
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const file = servedPath(root, request.url ?? "/");
      const stat = file ? await fs.stat(file).catch(() => null) : null;
      if (!file || !stat?.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(file).on("error", () => response.destroy()).pipe(response);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(choice.port, "127.0.0.1", () => resolve());
  });
  await fs.mkdir(dataFolder, { recursive: true });
  await fs.writeFile(portFile, JSON.stringify({ port: choice.remember })).catch(() => undefined);
  await fs.writeFile(serverFile, JSON.stringify({ pid: process.pid, port: choice.port })).catch(() => undefined);
  return {
    origin: `http://127.0.0.1:${choice.port}`,
    port: choice.port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
