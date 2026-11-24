// The editor page, in two places:
//
// * the MCP Apps view (`ui://mroffice/editor.html`), which a host that renders
//   MCP Apps shows in the conversation: it talks to this server through the
//   host (tools/call), and tells the model what the person changed
//   (ui/update-model-context);
// * the same page at a link (/_mcp/view/<id>?t=<secret>), for hosts that only
//   call tools: it talks to this server over HTTP.
//
// Both are the open editors' own page (the playground, built), unchanged: it
// already takes files from, and saves them to, a host bridge
// (globalThis.mrofficeEditorsDesktop, apps/playground/src/desktop.ts). The
// page here supplies that bridge, hides what belongs to the stand-alone page
// (its banner, footer, New/Open buttons), and loads the editor's scripts,
// styles and fonts from the editor origin.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import type { Config } from "./config.ts";

const require = createRequire(import.meta.url);

export interface EditorEntry {
  readonly scripts: readonly string[];
  readonly styles: readonly string[];
  readonly preloads: readonly string[];
}

/** The built page's entry script, its module preloads and its stylesheet. */
export function parseEditorIndex(html: string): EditorEntry {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
  const tags = html.match(/<(script|link)\b[^>]*>/g) ?? [];
  const scripts: string[] = [];
  const styles: string[] = [];
  const preloads: string[] = [];
  for (const tag of tags) {
    if (tag.startsWith("<script") && attr(tag, "type") === "module" && attr(tag, "src")) scripts.push(attr(tag, "src")!);
    if (tag.startsWith("<link") && attr(tag, "rel") === "stylesheet" && attr(tag, "href")) styles.push(attr(tag, "href")!);
    if (tag.startsWith("<link") && attr(tag, "rel") === "modulepreload" && attr(tag, "href")) preloads.push(attr(tag, "href")!);
  }
  if (!scripts.length) throw new Error("the editors' page has no entry script (is it the built apps/playground/dist/index.html?)");
  return { scripts, styles, preloads };
}

let entry: Promise<EditorEntry> | null = null;
export function editorEntry(config: Config): Promise<EditorEntry> {
  if (!entry) {
    entry = (async () => {
      if (config.editorDist) return parseEditorIndex(readFileSync(join(config.editorDist, "index.html"), "utf8"));
      const response = await fetch(`${config.editorOrigin}/index.html`);
      if (!response.ok) throw new Error(`the editors' page at ${config.editorOrigin} answered ${response.status}`);
      return parseEditorIndex(await response.text());
    })();
    entry.catch(() => {
      entry = null;
    });
  }
  return entry;
}

let appsBundle: string | null = null;
/** The MCP Apps client (the official @modelcontextprotocol/ext-apps App,
 * with its dependencies) as a classic script that sets globalThis.McpApps:
 * inline, because a view loads nothing its CSP does not name. */
function mcpAppsScript(): string {
  if (appsBundle) return appsBundle;
  const path = require.resolve("@modelcontextprotocol/ext-apps/app-with-deps");
  const source = readFileSync(path, "utf8");
  const exports = source.match(/export\{([^}]*)\};?\s*$/);
  if (!exports) throw new Error("the MCP Apps bundle no longer ends in one export list");
  const names = exports[1].split(",").map((pair) => {
    const [local, exported] = pair.trim().split(/\s+as\s+/);
    return `${JSON.stringify(exported ?? local)}:${local}`;
  });
  appsBundle = `${source.slice(0, exports.index)}globalThis.McpApps={${names.join(",")}};`.replace(/<\/script/gi, "<\\/script");
  return appsBundle;
}

export type PageMode =
  | { readonly kind: "app" }
  | { readonly kind: "page"; readonly id: string; readonly token: string; readonly api: string; readonly render: boolean };

const CHROME_CSS = `
  html, body, #root { margin: 0; height: 100%; }
  html[data-mro-display="inline"], html[data-mro-display="inline"] body { height: var(--mro-inline-height, 680px); }
  .pg-banner, .pg-foot, .pg-tabs, .pg-empty .pg-kinds { display: none !important; }
  .pg-actions > button:not(:last-of-type) { display: none !important; }
  .pg-notice:has(> button.pg-alt:not(.pg-alt-primary)) { display: none !important; }
  .pg-shell { height: calc(100% - 30px) !important; min-height: 0 !important; }
  #mro-bar { position: fixed; left: 0; right: 0; bottom: 0; height: 30px; display: flex; align-items: center; gap: 12px;
    padding: 0 12px; font: 12px/1 system-ui, sans-serif; color: #444; background: #f6f6f4; border-top: 1px solid #e3e3e0; z-index: 2147483000; }
  #mro-bar .mro-status { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  #mro-bar button, #mro-bar a { font: inherit; color: #1a56db; background: none; border: 0; cursor: pointer; padding: 4px 6px; text-decoration: none; }
  #mro-bar button[hidden] { display: none; }
  html[data-mro-render] .pg-bar, html[data-mro-render] #mro-bar, html[data-mro-render] .pg-notice { display: none !important; }
  html[data-mro-render] .pg-shell { height: 100% !important; }
  html[data-mro-render] .mrnote-formatting-mark { visibility: hidden !important; }
  @media (prefers-color-scheme: dark) { #mro-bar { background: #1f1f1e; color: #ccc; border-color: #333; } #mro-bar button, #mro-bar a { color: #8ab4f8; } }
`;

/** Runs before the editors' modules: process.env (as the built page does),
 * the editor origin for root-relative requests and for workers the page
 * cannot start from another origin, and the host bridge. */
function bridgeScript(origin: string, mode: PageMode): string {
  const settings = JSON.stringify({ origin, mode });
  return `
(function () {
  var S = ${settings};
  globalThis.process = globalThis.process || { env: {} };
  globalThis.process.env = globalThis.process.env || {};
  globalThis.process.env.NODE_ENV = globalThis.process.env.NODE_ENV || "production";
  // A host may run the view in an opaque origin (a sandbox without
  // allow-same-origin): cookies and storage throw there. The editors keep
  // nothing in them that must outlive the view, so they get stand-ins.
  try { void document.cookie; } catch (error) {
    try { Object.defineProperty(Document.prototype, "cookie", { configurable: true, get: function () { return ""; }, set: function () {} }); } catch (inner) {}
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try { void globalThis[name]; } catch (error) {
      var data = new Map();
      var stand = { getItem: function (k) { return data.has(String(k)) ? data.get(String(k)) : null; }, setItem: function (k, v) { data.set(String(k), String(v)); },
        removeItem: function (k) { data.delete(String(k)); }, clear: function () { data.clear(); }, key: function (i) { return Array.from(data.keys())[i] ?? null; } };
      Object.defineProperty(stand, "length", { get: function () { return data.size; } });
      try { Object.defineProperty(globalThis, name, { configurable: true, value: stand }); } catch (inner) {}
    }
  });
  var ORIGIN = S.origin;
  var other = ORIGIN !== location.origin;
  function onEditorOrigin(url) {
    if (typeof url === "string" && url.charAt(0) === "/" && url.charAt(1) !== "/") return ORIGIN + url;
    return url;
  }
  if (other) {
    var nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = function (input, init) {
      // the service's own endpoints (error reports and the like) are not here
      var href = typeof input === "string" ? input : input instanceof URL ? input.href : input && input.url;
      if (typeof href === "string" && (href.indexOf("/api/") === 0 || href.indexOf(ORIGIN + "/api/") === 0)) return Promise.resolve(new Response(null, { status: 204 }));
      return nativeFetch(typeof input === "string" ? onEditorOrigin(input) : input, init);
    };
    var nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = onEditorOrigin(String(url));
      return nativeOpen.apply(this, args);
    };
    var NativeWorker = globalThis.Worker;
    if (NativeWorker) {
      var PatchedWorker = function (url, options) {
        try {
          var resolved = new URL(String(url), ORIGIN + "/");
          if (resolved.origin !== location.origin && resolved.protocol !== "blob:" && resolved.protocol !== "data:") {
            var source = options && options.type === "module" ? "import " + JSON.stringify(resolved.href) + ";" : "importScripts(" + JSON.stringify(resolved.href) + ");";
            return new NativeWorker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })), options);
          }
        } catch (error) {}
        return new NativeWorker(url, options);
      };
      PatchedWorker.prototype = NativeWorker.prototype;
      globalThis.Worker = PatchedWorker;
    }
  }

  // ---- the host bridge the editors' page reads (apps/playground/src/desktop.ts)
  var waiting = [];
  var fileListeners = [];
  var commandListeners = [];
  var transport = null; // set by the app or page script: { save(name, bytes, baseRev), edited(flag) }
  var doc = null; // { id, rev, title, name }
  var saveTimer = null;
  var MRO = (globalThis.__mro = {
    settings: S,
    setTransport: function (value) { transport = value; },
    open: function (loaded) {
      doc = { id: loaded.id, rev: loaded.rev, title: loaded.title, name: loaded.name, format: loaded.format };
      waiting.push({ handle: loaded.id, name: loaded.name, bytes: loaded.bytes });
      fileListeners.forEach(function (listener) { try { listener(); } catch (error) {} });
      MRO.status("Revision " + loaded.rev + (loaded.by === "person" ? " (your edits)" : ""));
    },
    doc: function () { return doc; },
    status: function (text) { var el = document.getElementById("mro-status"); if (el) el.textContent = text; },
    command: function (name) { commandListeners.forEach(function (listener) { try { listener(name); } catch (error) {} }); }
  });
  globalThis.mrofficeEditorsDesktop = {
    platform: "mcp",
    takeOpenFiles: function () { var files = waiting; waiting = []; return Promise.resolve({ files: files, refused: [], commands: [] }); },
    onFilesWaiting: function (listener) { fileListeners.push(listener); return function () { fileListeners = fileListeners.filter(function (x) { return x !== listener; }); }; },
    onCommand: function (listener) { commandListeners.push(listener); return function () { commandListeners = commandListeners.filter(function (x) { return x !== listener; }); }; },
    showOpenDialog: function () { return Promise.resolve(); },
    openDropped: function () { return Promise.resolve(0); },
    saveFile: function (request) {
      if (!transport || !doc) return Promise.reject(new Error("This editor is not connected to the conversation yet."));
      MRO.status("Saving…");
      return transport.save(request.name, request.bytes, doc.rev).then(function (saved) {
        doc.rev = saved.rev;
        doc.name = saved.name;
        MRO.status("Saved · revision " + saved.rev + " · the assistant can read it now");
        // what the page calls the file: the document as the person knows it
        return { handle: doc.id, name: doc.title + "." + (doc.format || "mrdoc"), written: true };
      }, function (error) {
        MRO.status(error && error.message ? error.message : String(error));
        throw error;
      });
    },
    setEdited: function (edited) {
      if (transport && transport.edited) transport.edited(edited);
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      // the person's edits reach the conversation without a Save click
      if (edited && !S.mode.render) saveTimer = setTimeout(function () { saveTimer = null; MRO.command("save"); }, 1500);
    }
  };
})();
`;
}

/** The page-mode transport: this server's HTTP side, with the link's secret. */
function pageScript(): string {
  return `
(function () {
  var MRO = globalThis.__mro;
  var mode = MRO.settings.mode;
  var base = mode.api + "/doc/" + encodeURIComponent(mode.id) + "?t=" + encodeURIComponent(mode.token);
  function toBase64(bytes) { var s = ""; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function fromBase64(text) { var s = atob(text); var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i); return out; }
  MRO.setTransport({
    save: function (name, bytes, baseRev) {
      return fetch(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name, base64: toBase64(bytes), baseRev: baseRev }) })
        .then(function (response) { return response.json().then(function (body) { if (!response.ok) throw new Error(body.error || ("Saving failed (" + response.status + ")")); return body; }); });
    }
  });
  fetch(base).then(function (response) { return response.json(); }).then(function (body) {
    if (body.error) throw new Error(body.error);
    document.title = body.title + " — MR Office";
    MRO.open({ id: body.id, rev: body.rev, title: body.title, name: body.name, by: body.by, format: body.format, bytes: fromBase64(body.base64) });
  }).catch(function (error) { MRO.status(error.message || String(error)); });
})();
`;
}

/** The app-mode transport: the host, through the official MCP Apps client. */
function appScript(): string {
  return `
(function () {
  var MRO = globalThis.__mro;
  var Apps = globalThis.McpApps;
  var app = new Apps.App({ name: "MR Office", version: "0.1.0" }, { availableDisplayModes: ["inline", "fullscreen"] }, { autoResize: false });
  var loadedId = null;
  function fromBase64(text) { var s = atob(text); var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i); return out; }
  function toBase64(bytes) { var s = ""; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function display(mode) {
    document.documentElement.setAttribute("data-mro-display", mode === "fullscreen" ? "fullscreen" : "inline");
    var expand = document.getElementById("mro-expand");
    if (expand) expand.textContent = mode === "fullscreen" ? "Exit full screen" : "Full screen";
  }
  function load(id) {
    if (!id || id === loadedId) return;
    loadedId = id;
    MRO.status("Opening…");
    app.callServerTool({ name: "widget_load", arguments: { id: id } }).then(function (result) {
      var data = result.structuredContent;
      if (result.isError || !data) throw new Error((result.content && result.content[0] && result.content[0].text) || "The document could not be opened.");
      var open = document.getElementById("mro-open");
      if (open && data.viewUrl) { open.hidden = false; open.onclick = function () { app.openLink({ url: data.viewUrl }); }; }
      MRO.open({ id: data.id, rev: data.rev, title: data.title, name: data.name, by: data.by, format: data.format, bytes: fromBase64(data.base64) });
    }).catch(function (error) { loadedId = null; MRO.status(error.message || String(error)); });
  }
  MRO.setTransport({
    save: function (name, bytes, baseRev) {
      var doc = MRO.doc();
      return app.callServerTool({ name: "widget_save", arguments: { id: doc.id, name: name, base64: toBase64(bytes), baseRev: baseRev } }).then(function (result) {
        var data = result.structuredContent;
        if (result.isError || !data) throw new Error((result.content && result.content[0] && result.content[0].text) || "Saving failed.");
        var caps = app.getHostCapabilities() || {};
        if (caps.updateModelContext) {
          app.updateModelContext({ content: [{ type: "text", text: "The person edited \\"" + doc.title + "\\" (document " + doc.id + ") in the MR Office editor; it is now at revision " + data.rev + ". Call get_document with this id to read the current content before relying on it." }] }).catch(function () {});
        }
        return data;
      });
    }
  });
  app.ontoolresult = function (params) {
    var data = params && params.structuredContent;
    var id = data && (data.document ? data.document.id : data.id);
    if (id) load(id);
  };
  app.onhostcontextchanged = function (context) { if (context && context.displayMode) display(context.displayMode); };
  app.onteardown = function () { return {}; };
  display("inline");
  app.connect().then(function () {
    var context = app.getHostContext() || {};
    if (context.displayMode) display(context.displayMode);
    var modes = context.availableDisplayModes || [];
    var expand = document.getElementById("mro-expand");
    if (expand && modes.indexOf("fullscreen") >= 0) {
      expand.hidden = false;
      expand.onclick = function () {
        var now = document.documentElement.getAttribute("data-mro-display");
        app.requestDisplayMode({ mode: now === "fullscreen" ? "inline" : "fullscreen" }).then(function (result) { display(result.mode); }).catch(function () {});
      };
    }
    app.sendSizeChanged({ height: 680 }).catch(function () {});
  }).catch(function (error) { MRO.status("Not connected to the conversation: " + (error.message || error)); });
})();
`;
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export async function editorPage(config: Config, mode: PageMode): Promise<string> {
  const origin = config.editorOrigin;
  const files = await editorEntry(config);
  const absolute = (path: string) => (/^https?:/.test(path) ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`);
  const render = mode.kind === "page" && mode.render;
  return `<!doctype html>
<html lang="en" data-mro-display="${mode.kind === "app" ? "inline" : "page"}"${render ? " data-mro-render" : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MR Office</title>
<base href="${escapeAttribute(origin)}/">
<style>${CHROME_CSS}</style>
${files.styles.map((href) => `<link rel="stylesheet" crossorigin href="${escapeAttribute(absolute(href))}">`).join("\n")}
${files.preloads.map((href) => `<link rel="modulepreload" crossorigin href="${escapeAttribute(absolute(href))}">`).join("\n")}
<script>${bridgeScript(origin, mode)}</script>
${mode.kind === "app" ? `<script>${mcpAppsScript()}</script>\n<script>${appScript()}</script>` : `<script>${pageScript()}</script>`}
</head>
<body>
<div id="root"></div>
<div id="mro-bar"><span class="mro-status" id="mro-status">Waiting for the document…</span><button type="button" id="mro-open" hidden>Open in a browser tab</button><button type="button" id="mro-expand" hidden>Full screen</button></div>
${files.scripts.map((src) => `<script type="module" crossorigin src="${escapeAttribute(absolute(src))}"></script>`).join("\n")}
</body>
</html>
`;
}

/** What the view's CSP must allow: the editor origin for scripts, styles,
 * fonts, images and requests, and as the document's base. */
export function editorCsp(config: Config): { connectDomains: string[]; resourceDomains: string[]; baseUriDomains: string[] } {
  // data: and blob: for the fonts, pictures and icons the editors make in the page
  return { connectDomains: [config.editorOrigin], resourceDomains: [config.editorOrigin, "data:", "blob:"], baseUriDomains: [config.editorOrigin] };
}
