// The tool contracts a host and the model rely on, over an in-memory MCP
// connection: which tools carry the view, what a host without views gets
// instead, the person's edits reaching get_document, stale saves refused,
// Office files refused without the engine, private URLs refused, and the
// source free of what the open-source scan bans.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../src/config.ts";
import type { Engine } from "../src/engine.ts";
import { fetchDocumentUrl } from "../src/fetch-url.ts";
import { mrdocBytes } from "../src/formats.ts";
import type { Renderer } from "../src/render.ts";
import { createServer, VIEW_URI, type Services } from "../src/server.ts";
import { DocumentStore } from "../src/store.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function services(engine?: Partial<Engine>): Services {
  const dist = mkdtempSync(join(tmpdir(), "mro-dist-"));
  writeFileSync(join(dist, "index.html"), '<script type="module" crossorigin src="/assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="/assets/index-abc.css">');
  const config = loadConfig({ MROFFICE_MCP_EDITOR_DIST: dist, MROFFICE_MCP_DATA_DIR: mkdtempSync(join(tmpdir(), "mro-data-")), MROFFICE_MCP_PUBLIC_URL: "http://127.0.0.1:3999" });
  const renderer: Renderer = {
    render: async () => PNG,
    materialize: async (doc) => ({ format: "mrnote.document", version: 1, title: doc.title, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "materialized" }] }] } }),
    close: async () => {},
  };
  const none: Engine = {
    available: false,
    importOffice: async () => {
      throw new Error("Opening needs MR Office's Office engine, which this server is not connected to.");
    },
    exportDocx: async () => {
      throw new Error("no engine");
    },
    exportOffice: async () => {
      throw new Error("no engine");
    },
  };
  return { config, store: new DocumentStore(config.dataDir), engine: { ...none, ...engine }, renderer };
}

async function connect(svc: Services, views: boolean, listAll = true, owner?: string): Promise<Client> {
  const server = createServer(svc, { listAll, owner });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const capabilities = views ? { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } } } : {};
  const client = new Client({ name: "test-host", version: "0" }, { capabilities: capabilities as never });
  await client.connect(clientSide);
  return client;
}

const text = (result: unknown) => (((result as { content?: unknown }).content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

test("the view's tools name it, the view-only tools are hidden from the model, reads are read-only", async () => {
  const client = await connect(services(), true);
  const { tools } = await client.listTools();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const name of ["create_document", "open_document", "update_document"]) {
    assert.equal((byName.get(name)?._meta as { ui?: { resourceUri?: string } })?.ui?.resourceUri, VIEW_URI, name);
  }
  for (const name of ["widget_load", "widget_save"]) {
    assert.deepEqual((byName.get(name)?._meta as { ui?: { visibility?: string[] } })?.ui?.visibility, ["app"], name);
  }
  for (const name of ["get_document", "render_page", "export_document", "list_documents"]) assert.equal(byName.get(name)?.annotations?.readOnlyHint, true, name);
});

test("the view resource is an MCP App page that loads the editor from the declared origin", async () => {
  const svc = services();
  const client = await connect(svc, true);
  const read = await client.readResource({ uri: VIEW_URI });
  const content = read.contents[0] as { mimeType: string; text: string; _meta?: { ui?: { csp?: { resourceDomains?: string[]; connectDomains?: string[] } } } };
  assert.equal(content.mimeType, RESOURCE_MIME_TYPE);
  assert.ok(content._meta?.ui?.csp?.resourceDomains?.includes(svc.config.editorOrigin));
  assert.ok(content._meta?.ui?.csp?.connectDomains?.includes(svc.config.editorOrigin));
  assert.match(content.text, /globalThis\.mrofficeEditorsDesktop = \{/);
  assert.match(content.text, /globalThis\.McpApps=\{/);
  assert.ok(content.text.includes(`src="${svc.config.editorOrigin}/assets/index-abc.js"`));
});

test("a host that shows views gets the view; one that does not gets the link and a picture", async () => {
  const svc = services();
  const withViews = await connect(svc, true);
  const shown = await withViews.callTool({ name: "create_document", arguments: { title: "Plan", content: "# Plan\n\nHello" } });
  assert.ok(!(shown.content as { type: string }[]).some((c) => c.type === "image"));
  assert.match(text(shown), /open in the MR Office editor in this conversation/);

  const toolsOnly = await connect(svc, false);
  const linked = await toolsOnly.callTool({ name: "create_document", arguments: { title: "Plan", content: "# Plan\n\nHello" } });
  const document = (linked.structuredContent as { document: { id: string; viewUrl: string } }).document;
  assert.ok((linked.content as { type: string }[]).some((c) => c.type === "image"));
  assert.ok(text(linked).includes(document.viewUrl));
  assert.ok(document.viewUrl.startsWith("http://127.0.0.1:3999/_mcp/view/"));
});

test("the person's save reaches get_document; a save over an older revision is refused", async () => {
  const svc = services();
  const client = await connect(svc, true);
  const created = await client.callTool({ name: "create_document", arguments: { title: "Notes", content: "# Notes" } });
  const id = (created.structuredContent as { document: { id: string } }).document.id;
  const edited = mrdocBytes("Notes", { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Notes" }] }, { type: "paragraph", content: [{ type: "text", text: "Added by the person" }] }] });
  const saved = await client.callTool({ name: "widget_save", arguments: { id, name: "Notes.mrdoc", base64: Buffer.from(edited).toString("base64"), baseRev: 1 } });
  assert.equal((saved.structuredContent as { rev: number }).rev, 2);
  const read = await client.callTool({ name: "get_document", arguments: { id } });
  assert.match(text(read), /Added by the person/);
  assert.equal((read.structuredContent as { document: { lastEditedBy: string; personEdited: boolean } }).document.lastEditedBy, "person");
  const stale = await client.callTool({ name: "widget_save", arguments: { id, name: "Notes.mrdoc", base64: Buffer.from(edited).toString("base64"), baseRev: 1 } });
  assert.equal(stale.isError, true);
  assert.match(text(stale), /changed since revision 1/);
});

test("a Word file without the engine is refused plainly; with it, it opens as the editor's document", async () => {
  const docx = Buffer.from("PK\u0003\u0004 not really").toString("base64");
  const refused = await (await connect(services(), true)).callTool({ name: "open_document", arguments: { name: "a.docx", content_base64: docx } });
  assert.equal(refused.isError, true);
  assert.match(text(refused), /Office engine/);

  const engine: Partial<Engine> = {
    available: true,
    importOffice: async (name) => ({ name: name.replace(/\.docx$/, ".mrdoc"), bytes: mrdocBytes("a", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "from Word" }] }] }), losses: [] }),
  };
  const opened = await (await connect(services(engine), true)).callTool({ name: "open_document", arguments: { name: "a.docx", content_base64: docx } });
  const document = (opened.structuredContent as { document: { editorFile: string; format: string } }).document;
  assert.equal(document.editorFile, "a.mrdoc");
  assert.equal(document.format, "docx");
  assert.match(text(opened), /from Word/);
});

test("one person's machine lists every document; a shared server lists only the connection's own", async () => {
  const svc = services();
  const first = await connect(svc, true, false);
  await first.callTool({ name: "create_document", arguments: { title: "Mine", content: "# Mine" } });
  const other = await connect(svc, true, false);
  assert.equal(text(await other.callTool({ name: "list_documents", arguments: {} })), "No documents yet.");
  assert.match(text(await first.callTool({ name: "list_documents", arguments: {} })), /Mine/);
  assert.match(text(await (await connect(svc, true)).callTool({ name: "list_documents", arguments: {} })), /Mine/);
});

test("a signed-in server keeps each account's documents to that account, across its sessions, for its retention time", async () => {
  const svc = services();
  const alice = await connect(svc, true, false, "user-a");
  const made = await alice.callTool({ name: "create_document", arguments: { title: "Alice's", content: "# Hers" } });
  const id = (made.structuredContent as { document: { id: string } }).document.id;
  // Alice's next session (a reconnect, a new chat) still has it; Bob reaches nothing of hers, even by id
  assert.match(text(await (await connect(svc, true, false, "user-a")).callTool({ name: "list_documents", arguments: {} })), /Alice's/);
  const bob = await connect(svc, true, false, "user-b");
  assert.equal(text(await bob.callTool({ name: "list_documents", arguments: {} })), "No documents yet.");
  for (const [name, args] of [["get_document", { id }], ["export_document", { id, format: "md" }], ["render_page", { id }], ["update_document", { id, content: "x" }], ["widget_save", { id, name: "x.html", base64: "eA==" }]] as const) {
    const answer = await bob.callTool({ name, arguments: args });
    assert.equal(answer.isError, true, name);
    assert.match(text(answer), /No document/, name);
  }
  assert.equal(svc.store.get(id).current.rev, 1);
  // documents nobody saved for the retention time go
  assert.equal(svc.store.prune(24 * 3600_000, Date.now() + 2 * 24 * 3600_000), 1);
  assert.equal(text(await alice.callTool({ name: "list_documents", arguments: {} })), "No documents yet.");
});

test("open_document never fetches from this machine or a private network", async () => {
  const config = loadConfig({});
  await assert.rejects(fetchDocumentUrl("https://127.0.0.1/a.docx", config), /not a public address/);
  await assert.rejects(fetchDocumentUrl("https://10.1.2.3/a.docx", config), /not a public address/);
  await assert.rejects(fetchDocumentUrl("http://example.com/a.docx", config), /Only https/);
});

// the scan's rules live in the private repository; the open tree has no copy
const SCAN_RULES = new URL("../../../scripts/open-editors/config.mjs", import.meta.url);

test("the source holds nothing the open-source scan bans", { skip: !existsSync(SCAN_RULES) && "the scan rules are not in this tree" }, async () => {
  const { BANNED } = (await import(SCAN_RULES.href)) as { BANNED: RegExp[] };
  const root = new URL("../", import.meta.url).pathname;
  // and the README the open tree gets in place of this package's (which names the apps that run it)
  const openReadme = new URL("../../../scripts/open-editors/overlay/apps/mcp/README.md", import.meta.url).pathname;
  const files = [...readdirSync(join(root, "src")).map((name) => join(root, "src", name)), join(root, "package.json"), join(root, "server.json"), openReadme];
  const hits = files.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => BANNED.filter((pattern) => pattern.test(line)).map(() => `${file}:${index + 1}: ${line.trim().slice(0, 120)}`)));
  assert.deepEqual(hits, []);
});
