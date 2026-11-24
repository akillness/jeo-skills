// The MCP server: tools that open, create, change, read, render and export
// documents, and the editor view a host that renders MCP Apps shows with
// them. One server for every host: where the host shows the view, the
// person edits in the conversation; where it does not, the same tools answer
// with a link to the editor page and a picture of the document.

import { readFileSync } from "node:fs";

import { RESOURCE_MIME_TYPE, getUiCapability, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

import type { Account } from "./auth.ts";
import type { Config } from "./config.ts";
import type { Engine } from "./engine.ts";
import { FORMATS, csvWorkbook, documentMarkdown, extensionOf, htmlToMarkdown, markdownToHtml, parseMrdoc, safeFileName, stem, workbookCsv } from "./formats.ts";
import { fetchDocumentUrl } from "./fetch-url.ts";
import type { Renderer } from "./render.ts";
import { DocumentNotFound, type DocumentStore, type StoredDocument } from "./store.ts";
import { editorCsp, editorPage } from "./widget.ts";

export const VIEW_URI = "ui://mroffice/editor.html";
/** The package's version (src/ and the built dist/ both sit next to package.json). */
export const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
const decoder = new TextDecoder();

export interface Services {
  readonly config: Config;
  readonly store: DocumentStore;
  readonly engine: Engine;
  readonly renderer: Renderer;
  /** The person's MR Office sign-in on this machine (the `account` engine), when the tools may start it. */
  readonly account?: Account;
}

export function viewUrl(config: Config, doc: { id: string; token: string }): string {
  return `${config.publicUrl}/_mcp/view/${doc.id}?t=${encodeURIComponent(doc.token)}`;
}

export function fileUrl(config: Config, doc: { id: string; token: string }, format: string): string {
  return `${config.publicUrl}/_mcp/file/${doc.id}?t=${encodeURIComponent(doc.token)}&format=${encodeURIComponent(format)}`;
}

/** What the model reads of a document: Markdown for documents, CSV per sheet. */
export function documentText(doc: StoredDocument): { text: string; kind: string } {
  const extension = extensionOf(doc.current.name);
  const raw = () => decoder.decode(doc.bytes);
  switch (extension) {
    case "mrdoc":
      return { text: documentMarkdown(parseMrdoc(doc.bytes).content), kind: "document" };
    case "html":
    case "htm":
      return { text: htmlToMarkdown(raw()), kind: "document" };
    case "md":
    case "markdown":
    case "txt":
      return { text: raw(), kind: "document" };
    case "csv":
    case "tsv":
      return { text: raw(), kind: "spreadsheet" };
    case "mrsheet":
      return {
        text: workbookCsv(doc.bytes)
          .map((sheet) => `## Sheet "${sheet.name}" (${sheet.rows} rows x ${sheet.columns} columns)\n\n\`\`\`csv\n${sheet.csv}\n\`\`\``)
          .join("\n\n"),
        kind: "spreadsheet",
      };
    case "mrslides": {
      const deck = JSON.parse(raw()) as { slides?: unknown[] };
      const texts = (deck.slides ?? []).map((slide, index) => `## Slide ${index + 1}\n\n${slideText(slide)}`);
      return { text: texts.join("\n\n"), kind: "presentation" };
    }
    case "pdf":
      return { text: "(A PDF: render_page shows its pages.)", kind: "pdf" };
    default:
      return { text: raw().slice(0, 200_000), kind: "text" };
  }
}

function slideText(slide: unknown): string {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string" && record.text.trim()) out.push(record.text.trim());
    for (const [key, child] of Object.entries(record)) if (key !== "text" && typeof child === "object") walk(child);
  };
  walk(slide);
  return [...new Set(out)].join("\n");
}

function summary(doc: StoredDocument): Record<string, unknown> {
  return {
    id: doc.id,
    title: doc.title,
    format: doc.format,
    editorFile: doc.current.name,
    revision: doc.current.rev,
    lastEditedBy: doc.current.by,
    personEdited: doc.revisions.some((revision) => revision.by === "person"),
  };
}

function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: message }] };
}

export interface ServerOptions {
  /** list_documents names every document in the data directory (one person's
   * own machine: stdio, loopback HTTP). A server reached by many people lists
   * only the documents this connection made: ids are not to be handed out. */
  readonly listAll?: boolean;
  /** A server people sign in to: the caller's MR Office account. Documents
   * this connection makes are theirs, and every tool reaches only that
   * account's documents (an id of someone else's is "no such document"). */
  readonly owner?: string;
}

export function createServer(services: Services, options: ServerOptions = {}): McpServer {
  const { config, store, engine, renderer } = services;
  const owner = options.owner;
  const listAll = (options.listAll ?? true) && !owner;
  const made = new Set<string>();
  /** A document this connection may use: on a signed-in server, its owner's only. */
  const own = (id: string, rev?: number): StoredDocument => {
    const doc = store.get(id, rev);
    if (owner && doc.owner !== owner) throw new DocumentNotFound(id);
    return doc;
  };
  const created = (doc: StoredDocument): StoredDocument => {
    made.add(doc.id);
    if (owner) store.capOwner(owner, config.maxDocumentsPerPerson);
    return doc;
  };
  const server = new McpServer(
    { name: "mroffice", title: "MR Office", version: VERSION, websiteUrl: config.webAppUrl },
    {
      instructions:
        "MR Office's editors for documents, spreadsheets and PDFs. Use create_document or open_document to put a document in front of the person; " +
        "they can edit it in the editor shown in the conversation (or at the link the tool returns). Before relying on a document's content, " +
        "call get_document: the person may have changed it. render_page shows a page as an image so you can check the layout. " +
        "export_document gives the file (Word .docx, Markdown, CSV ...).",
    },
  );
  const hostShowsViews = () => Boolean(getUiCapability(server.server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE));

  // ------------------------------------------------------------ the view
  const resourceMeta = () => ({
    ui: {
      csp: editorCsp(config),
      prefersBorder: true,
      ...(config.uiDomain ? { domain: config.uiDomain } : {}),
    },
  });
  registerAppResource(server, "MR Office editor", VIEW_URI, { description: "The MR Office editor for one document", _meta: resourceMeta() }, async () => ({
    contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: await editorPage(config, { kind: "app" }), _meta: resourceMeta() }],
  }));

  /** The answer of a tool that put a document in front of the person. */
  async function shown(doc: StoredDocument, verb: string): Promise<CallToolResult> {
    const link = viewUrl(config, doc);
    const { text, kind } = documentText(doc);
    const views = hostShowsViews();
    const preview = text.length > 4000 ? `${text.slice(0, 4000)}\n…(${text.length - 4000} more characters; get_document reads all of it)` : text;
    const lines = [
      `${verb} "${doc.title}" (document ${doc.id}, ${kind}, revision ${doc.current.rev}).`,
      views
        ? "It is open in the MR Office editor in this conversation; the person can edit it there."
        : `The person can open and edit it in MR Office here: ${link}`,
      "Call get_document with this id to read the person's edits.",
      ...(doc.importLosses?.length ? [`The Office engine reported what it could not carry over: ${doc.importLosses.join(", ")}.`] : []),
      "",
      preview,
    ];
    const content: ContentBlock[] = [{ type: "text", text: lines.join("\n") }];
    if (!views) {
      // a host that shows no view still lets the model (and, in most, the
      // person) see the document as the editor draws it
      try {
        const png = await renderer.render(doc, 1);
        content.push({ type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" });
      } catch (error) {
        content.push({ type: "text", text: `(No picture of the page: ${error instanceof Error ? error.message : String(error)})` });
      }
    }
    return { content, structuredContent: { document: { ...summary(doc), viewUrl: link } } };
  }

  const viewMeta = { ui: { resourceUri: VIEW_URI } };

  // ------------------------------------------------------------ tools the model calls
  registerAppTool(
    server,
    "create_document",
    {
      title: "Create a document",
      description:
        "Create a new document or spreadsheet and open it in the MR Office editor for the person to see and edit. " +
        "A document's content is Markdown (headings, lists, tables, emphasis); a spreadsheet's is CSV. " +
        "`format` is the file it is exported as by default (docx or md for documents, csv for spreadsheets).",
      inputSchema: {
        title: z.string().min(1).max(200).describe("The document's title"),
        kind: z.enum(["document", "spreadsheet"]).default("document"),
        content: z.string().max(2_000_000).describe("Markdown for a document, CSV for a spreadsheet"),
        format: z.enum(["docx", "md", "csv"]).optional().describe("Default export format"),
      },
      annotations: { title: "Create a document", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: viewMeta,
    },
    async ({ title, kind, content, format }) => {
      try {
        const name = safeFileName(title);
        const doc =
          kind === "spreadsheet"
            ? store.create({ format: "csv", title: name, name: `${name}.csv`, bytes: new TextEncoder().encode(content), by: "model", owner })
            : store.create({
                format: format ?? (engine.available ? "docx" : "md"),
                title: name,
                name: `${name}.html`,
                bytes: new TextEncoder().encode(markdownToHtml(content, name)),
                by: "model",
                owner,
              });
        created(doc);
        return await shown(doc, "Created");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppTool(
    server,
    "open_document",
    {
      title: "Open a file",
      description:
        "Open a file in the MR Office editor for the person to see and edit: Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF, Markdown, HTML, text, CSV. " +
        "Give the file's bytes as base64 (`content_base64`), its text (`text`, for text formats), or an https `url` to fetch it from.",
      inputSchema: {
        name: z.string().min(1).max(255).describe("The file name, with its extension (it says which editor opens it)"),
        content_base64: z.string().optional(),
        text: z.string().max(5_000_000).optional(),
        url: z.string().url().optional(),
      },
      annotations: { title: "Open a file", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: viewMeta,
    },
    async ({ name, content_base64, text, url }) => {
      try {
        const sources = [content_base64, text, url].filter((value) => value !== undefined);
        if (sources.length !== 1) throw new Error("Give exactly one of content_base64, text or url.");
        const fileName = safeFileName(name);
        const extension = extensionOf(fileName);
        const format = FORMATS[extension];
        if (!format) throw new Error(`MR Office opens ${Object.keys(FORMATS).map((key) => `.${key}`).join(" ")}; ${fileName} is none of them.`);
        let bytes: Uint8Array;
        if (url !== undefined) bytes = await fetchDocumentUrl(url, config);
        else if (text !== undefined) bytes = new TextEncoder().encode(text);
        else bytes = new Uint8Array(Buffer.from(content_base64!, "base64"));
        if (bytes.byteLength > config.maxFileBytes) throw new Error(`${fileName} is larger than ${config.maxFileBytes} bytes.`);
        if (!bytes.byteLength) throw new Error(`${fileName} is empty.`);
        let editorName = fileName;
        let editorBytes = bytes;
        let losses: readonly string[] = [];
        if (format.office) {
          const imported = await engine.importOffice(fileName, bytes);
          editorName = imported.name;
          editorBytes = imported.bytes;
          losses = imported.losses;
        }
        const doc = store.create({ format: extension === "markdown" ? "md" : extension, title: stem(fileName), name: editorName, bytes: editorBytes, by: "model", importLosses: losses, owner });
        created(doc);
        return await shown(doc, "Opened");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppTool(
    server,
    "update_document",
    {
      title: "Replace a document's content",
      description:
        "Replace the content of a document created or opened here with new Markdown (documents) or CSV (spreadsheets), as a new revision, and show it. " +
        "Read it with get_document first: the person may have edited it.",
      inputSchema: {
        id: z.string().describe("The document's id"),
        content: z.string().max(2_000_000),
        expected_revision: z.number().int().optional().describe("The revision you read; the change is refused if the document moved on"),
      },
      annotations: { title: "Replace a document's content", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      _meta: viewMeta,
    },
    async ({ id, content, expected_revision }) => {
      try {
        const doc = own(id);
        const { kind } = documentText(doc);
        if (kind !== "document" && kind !== "spreadsheet") throw new Error(`A ${kind} is changed in the editor, not by replacing its content.`);
        const saved =
          kind === "spreadsheet"
            ? store.save(id, { name: `${doc.title}.csv`, bytes: new TextEncoder().encode(content), by: "model", baseRev: expected_revision })
            : store.save(id, { name: `${doc.title}.html`, bytes: new TextEncoder().encode(markdownToHtml(content, doc.title)), by: "model", baseRev: expected_revision });
        return await shown(saved, "Updated");
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_document",
    {
      title: "Read a document",
      description:
        "Read a document's current content, including the person's edits in the editor: Markdown for documents, CSV per sheet for spreadsheets. " +
        "Set include_file to also get the editor's file.",
      inputSchema: { id: z.string(), include_file: z.boolean().default(false) },
      annotations: { title: "Read a document", readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, include_file }) => {
      try {
        const doc = own(id);
        const { text, kind } = documentText(doc);
        const header = `"${doc.title}" (document ${doc.id}, ${kind}), revision ${doc.current.rev}, last saved by ${doc.current.by === "person" ? "the person in the editor" : "you"} at ${doc.current.at}.`;
        const content: ContentBlock[] = [{ type: "text", text: `${header}\n\n${text}` }];
        if (include_file) {
          content.push({
            type: "resource",
            resource: { uri: `mroffice-mcp://documents/${doc.id}/revisions/${doc.current.rev}/${encodeURIComponent(doc.current.name)}`, mimeType: FORMATS[extensionOf(doc.current.name)]?.mime ?? "application/octet-stream", blob: Buffer.from(doc.bytes).toString("base64") },
          });
        }
        return { content, structuredContent: { document: summary(doc), text } };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "render_page",
    {
      title: "Picture a page",
      description: "A picture (PNG) of one page of a document as the MR Office editor draws it, to check the layout of your work.",
      inputSchema: { id: z.string(), page: z.number().int().min(1).default(1) },
      annotations: { title: "Picture a page", readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, page }) => {
      try {
        const doc = own(id);
        const png = await renderer.render(doc, page);
        return {
          content: [
            { type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" },
            { type: "text", text: `Page ${page} of "${doc.title}" at revision ${doc.current.rev}.` },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "export_document",
    {
      title: "Export a document",
      description:
        "The document as a file: docx (Word), md, html or mrdoc for documents; xlsx (Excel), csv or mrsheet for spreadsheets; pptx (PowerPoint) or mrslides for presentations. " +
        "Word, Excel and PowerPoint files are written by MR Office's engine and need the person signed in (sign_in). " +
        "Returns the file and a download link for the person.",
      inputSchema: { id: z.string(), format: z.enum(["docx", "xlsx", "pptx", "md", "html", "mrdoc", "csv", "mrsheet", "mrslides", "pdf"]).optional() },
      annotations: { title: "Export a document", readOnlyHint: true, openWorldHint: false },
    },
    async ({ id, format }) => {
      try {
        const doc = own(id);
        const file = await exportFile(services, doc, format ?? doc.format);
        const link = fileUrl(config, doc, file.format);
        return {
          content: [
            { type: "text", text: `${file.name} (${file.bytes.byteLength} bytes, revision ${doc.current.rev}). The person can download it here: ${link}` },
            { type: "resource", resource: { uri: `mroffice-mcp://documents/${doc.id}/revisions/${doc.current.rev}/${encodeURIComponent(file.name)}`, mimeType: file.mime, blob: Buffer.from(file.bytes).toString("base64") } },
          ],
          structuredContent: { document: summary(doc), file: { name: file.name, format: file.format, bytes: file.bytes.byteLength, downloadUrl: link } },
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        `The documents created or opened with this server${owner ? " with your MR Office account" : ""}, newest first.` +
        (config.retentionDays ? ` Each is kept ${config.retentionDays} days after its last save; export what you keep.` : ""),
      inputSchema: {},
      annotations: { title: "List documents", readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const documents = store.list().filter((meta) => listAll || (owner ? meta.owner === owner : made.has(meta.id))).map((meta) => ({ id: meta.id, title: meta.title, format: meta.format, revisions: meta.revisions.length, lastEditedBy: meta.revisions.at(-1)?.by }));
      return {
        content: [{ type: "text", text: documents.length ? documents.map((doc) => `${doc.id}  ${doc.title} (${doc.format}, revision ${doc.revisions}, last by ${doc.lastEditedBy})`).join("\n") : "No documents yet." }],
        structuredContent: { documents },
      };
    },
  );

  // ------------------------------------------------------------ signing in (this machine's account)
  const account = services.account;
  if (account) {
    server.registerTool(
      "sign_in",
      {
        title: "Sign in to MR Office",
        description:
          "Sign the person in to their MR Office account, which opening and saving Word, Excel and PowerPoint files needs. " +
          "Opens MR Office's sign-in page in the person's browser and returns its link; the person signs in and allows it there, then the Office tools work. " +
          "Says who is signed in when that is already done.",
        inputSchema: {},
        annotations: { title: "Sign in to MR Office", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      async () => {
        try {
          const current = account.credentials();
          if (current) {
            return { content: [{ type: "text", text: `Signed in to MR Office${current.account ? ` as ${current.account.email}` : ""}.` }], structuredContent: { signedIn: true, email: current.account?.email ?? null } };
          }
          const { url, done } = await account.startLogin(true);
          // a quick sign-in (already signed in to MR Office in the browser) answers in the same call
          const finished = await Promise.race([done.then((value) => value), new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000))]).catch(() => null);
          if (finished) {
            return { content: [{ type: "text", text: `Signed in to MR Office${finished.account ? ` as ${finished.account.email}` : ""}.` }], structuredContent: { signedIn: true, email: finished.account?.email ?? null } };
          }
          return {
            content: [{ type: "text", text: `MR Office's sign-in page is open in the person's browser. If it did not open, the person can open this link: ${url}\nAfter they allow it, try the Office file again.` }],
            structuredContent: { signedIn: false, signInUrl: url },
          };
        } catch (error) {
          return errorResult(error);
        }
      },
    );
    server.registerTool(
      "sign_out",
      {
        title: "Sign out of MR Office",
        description: "Sign this app out of the person's MR Office account and revoke its access.",
        inputSchema: {},
        annotations: { title: "Sign out of MR Office", readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      },
      async () => {
        try {
          const was = await account.logout();
          return { content: [{ type: "text", text: was ? "Signed out of MR Office; its access is revoked." : "Not signed in." }] };
        } catch (error) {
          return errorResult(error);
        }
      },
    );
  }

  // ------------------------------------------------------------ tools only the view calls
  registerAppTool(
    server,
    "widget_load",
    {
      title: "Load the editor's file",
      description: "The editor view reads the document it shows.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VIEW_URI, visibility: ["app"] } },
    },
    async ({ id }) => {
      try {
        const doc = own(id);
        return {
          content: [{ type: "text", text: `Loaded ${doc.current.name}` }],
          structuredContent: { id: doc.id, title: doc.title, format: doc.format, name: doc.current.name, rev: doc.current.rev, by: doc.current.by, base64: Buffer.from(doc.bytes).toString("base64"), viewUrl: viewUrl(config, doc) },
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerAppTool(
    server,
    "widget_save",
    {
      title: "Save the person's edits",
      description: "The editor view saves what the person changed, as a new revision.",
      inputSchema: { id: z.string(), name: z.string().max(255), base64: z.string(), baseRev: z.number().int().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: { ui: { resourceUri: VIEW_URI, visibility: ["app"] } },
    },
    async ({ id, name, base64, baseRev }) => {
      try {
        const bytes = new Uint8Array(Buffer.from(base64, "base64"));
        if (bytes.byteLength > config.maxFileBytes) throw new Error("The document is larger than this server keeps.");
        own(id);
        const saved = store.save(id, { name: safeFileName(name), bytes, by: "person", baseRev });
        return { content: [{ type: "text", text: `Saved revision ${saved.current.rev}` }], structuredContent: { rev: saved.current.rev, name: saved.current.name } };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

export interface ExportedFile {
  readonly name: string;
  readonly format: string;
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** A document as a file of `format`. Documents whose current revision the
 * editor has not written yet (HTML, Markdown from the model) are first read
 * by the editor itself (headless), so every export is the editor's reading. */
export async function exportFile(services: Services, doc: StoredDocument, format: string): Promise<ExportedFile> {
  const { engine, renderer } = services;
  const extension = extensionOf(doc.current.name);
  const encoder = new TextEncoder();
  const named = (ext: string, bytes: Uint8Array): ExportedFile => ({ name: `${doc.title}.${ext}`, format: ext, mime: FORMATS[ext]?.mime ?? "application/octet-stream", bytes });
  const kind = FORMATS[extension]?.kind;
  if (format === "pdf") {
    if (extension !== "pdf") throw new Error("PDF export of documents and spreadsheets is not in this version; docx, md or csv are.");
    return named("pdf", doc.bytes);
  }
  if (kind === "spreadsheet") {
    if (format === "csv") {
      if (extension === "csv") return named("csv", doc.bytes);
      if (extension === "mrsheet") return named("csv", encoder.encode(`${workbookCsv(doc.bytes)[0]?.csv ?? ""}\n`));
    }
    if (format === "mrsheet" && extension === "mrsheet") return named("mrsheet", doc.bytes);
    if (format === "xlsx") {
      // the editor's workbook, or the CSV the model wrote read as one
      const book = extension === "mrsheet" ? (JSON.parse(new TextDecoder().decode(doc.bytes)) as Record<string, unknown>) : csvWorkbook(new TextDecoder().decode(doc.bytes), doc.title, extension === "tsv" ? "\t" : ",");
      return named("xlsx", await engine.exportOffice("spreadsheet", doc.title, book));
    }
    throw new Error(`A spreadsheet exports as xlsx or csv${extension === "mrsheet" ? " or mrsheet" : ""}.`);
  }
  if (kind === "presentation") {
    if (format === "pptx" && extension === "mrslides") {
      return named("pptx", await engine.exportOffice("presentation", doc.title, JSON.parse(new TextDecoder().decode(doc.bytes)) as Record<string, unknown>));
    }
    if (format === "mrslides" || extension === "mrslides") return named("mrslides", doc.bytes);
  }
  if (kind !== "document") throw new Error(`${doc.current.name} exports only as itself.`);
  if (format === "md") {
    if (extension === "md" || extension === "markdown" || extension === "txt") return named("md", doc.bytes);
    return named("md", encoder.encode(`${documentText(doc).text}\n`));
  }
  if (format === "html" && (extension === "html" || extension === "htm")) return named("html", doc.bytes);
  // Word, the editor's own file, or HTML of an edited document: the editor's JSON
  const mrdoc = extension === "mrdoc" ? parseMrdoc(doc.bytes) : await renderer.materialize(doc);
  if (format === "mrdoc") return named("mrdoc", encoder.encode(`${JSON.stringify(mrdoc)}\n`));
  if (format === "docx") return named("docx", await engine.exportDocx(mrdoc.title || doc.title, mrdoc.content));
  if (format === "html") throw new Error("This document has been edited in the editor; export it as docx, md or mrdoc.");
  throw new Error(`A document exports as docx, md, html or mrdoc, not ${format}.`);
}
