// `mroffice-mcp` with MR Office's desktop app as the screen (src/desktop.ts):
// stdio finds the running app by its discovery file and hands the AI app's
// connection to the app's endpoint, as it is (the app sees the AI app's own
// name); a file left by an app that is gone, or one naming another host, is
// not used; with no app, stdio is this server's own, as before.
//
// Never starts a real app: every run names its own discovery file and turns
// the app's launch off (MROFFICE_MCP_DESKTOP_LAUNCH=0).

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { discoveryFiles, findDesktop } from "../src/desktop.ts";

const TOKEN = "desktop-test-token-0123456789abcdef0123456";

/** A stand-in for the app's endpoint: MCP over JSON, the token checked, what it was asked kept. */
async function fakeDesktop() {
  const seen: { method: string; client?: string; authorized: boolean }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const authorized = req.headers.authorization === `Bearer ${TOKEN}`;
    if (req.url === "/health") {
      res.writeHead(authorized ? 200 : 401, { "content-type": "application/json" }).end(JSON.stringify({ ok: authorized }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (!authorized) {
        res.writeHead(401).end();
        return;
      }
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      seen.push({ method: message.method, client: message.params?.clientInfo?.name, authorized });
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const result =
        message.method === "initialize"
          ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "mroffice-desktop", version: "0.1.6" } }
          : message.method === "tools/list"
            ? { tools: [{ name: "edit_document", description: "Edit a document in its window", inputSchema: { type: "object", properties: {} } }] }
            : { content: [{ type: "text", text: `the window ran ${message.params?.name}` }] };
      res.writeHead(200, { "content-type": "application/json", ...(message.method === "initialize" ? { "mcp-session-id": "session-1" } : {}) });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port, seen };
}

function discoveryFile(dir: string, record: Record<string, unknown>): string {
  const file = join(dir, "ai-screen.json");
  writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
  return file;
}

const cli = join(import.meta.dirname, "..", "src", "cli.ts");

function connect(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli],
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MROFFICE_MCP_DESKTOP_LAUNCH: "0", MROFFICE_MCP_ENGINE: "none", ...env },
    stderr: "pipe",
  });
  return { client: new Client({ name: "example-agent", version: "9.9.9" }), transport };
}

test("the app's discovery file is found where the app writes it, or where MROFFICE_DESKTOP_DISCOVERY says", () => {
  assert.deepEqual(discoveryFiles({ HOME: "/Users/a" }, "darwin"), [
    "/Users/a/Library/Application Support/MR Office/ai-screen.json",
    "/Users/a/Library/Application Support/MRNote Classic/ai-screen.json",
  ]);
  assert.equal(discoveryFiles({ APPDATA: "C:\\Users\\a\\AppData\\Roaming" }, "win32")[0], join("C:\\Users\\a\\AppData\\Roaming", "MR Office", "ai-screen.json"));
  assert.deepEqual(discoveryFiles({ MROFFICE_DESKTOP_DISCOVERY: "/tmp/x.json" }, "darwin"), ["/tmp/x.json"]);
});

test("a running app is used; a file of an app that is gone, a wrong token or another host is not", async () => {
  const desktop = await fakeDesktop();
  const dir = mkdtempSync(join(tmpdir(), "mroffice-desktop-"));
  try {
    const record = { v: 1, app: "MR Office", product: "office", version: "0.1.6", url: `http://127.0.0.1:${desktop.port}/mcp`, port: desktop.port, token: TOKEN, pid: process.pid };
    const env = { MROFFICE_DESKTOP_DISCOVERY: discoveryFile(dir, record) };
    assert.equal((await findDesktop(env))?.discovery.port, desktop.port);
    discoveryFile(dir, { ...record, pid: 2_147_483_000 });
    assert.equal(await findDesktop(env), null);
    discoveryFile(dir, { ...record, token: "stale" });
    assert.equal(await findDesktop(env), null);
    discoveryFile(dir, { ...record, url: `http://192.168.1.4:${desktop.port}/mcp` });
    assert.equal(await findDesktop(env), null);
  } finally {
    desktop.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stdio hands the AI app's connection to the running app, its own name and all", async () => {
  const desktop = await fakeDesktop();
  const dir = mkdtempSync(join(tmpdir(), "mroffice-desktop-"));
  const file = discoveryFile(dir, { v: 1, app: "MR Office", product: "office", version: "0.1.6", url: `http://127.0.0.1:${desktop.port}/mcp`, port: desktop.port, token: TOKEN, pid: process.pid });
  const { client, transport } = connect({ MROFFICE_DESKTOP_DISCOVERY: file });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, "mroffice-desktop");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ["edit_document"]);
    const ran = await client.callTool({ name: "edit_document", arguments: {} });
    assert.deepEqual(ran.content, [{ type: "text", text: "the window ran edit_document" }]);
    assert.deepEqual(desktop.seen.map((item) => item.method), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
    assert.equal(desktop.seen[0]!.client, "example-agent");
    assert.ok(desktop.seen.every((item) => item.authorized));
  } finally {
    await client.close();
    desktop.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("with no app running, stdio is this server's own; --desktop says the app is needed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mroffice-desktop-"));
  const missing = join(dir, "ai-screen.json");
  const { client, transport } = connect({ MROFFICE_DESKTOP_DISCOVERY: missing, MROFFICE_MCP_DATA_DIR: join(dir, "docs"), MROFFICE_MCP_PORT: "0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "create_document"));
  } finally {
    await client.close();
  }
  const forced = connect({ MROFFICE_DESKTOP_DISCOVERY: missing });
  forced.transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "--desktop"],
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MROFFICE_MCP_DESKTOP_LAUNCH: "0", MROFFICE_DESKTOP_DISCOVERY: missing },
    stderr: "pipe",
  });
  let stderr = "";
  forced.transport.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  await assert.rejects(forced.client.connect(forced.transport));
  assert.match(stderr, /desktop app is not running/);
  rmSync(dir, { recursive: true, force: true });
});
