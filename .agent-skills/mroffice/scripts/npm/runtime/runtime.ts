/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// What the npm packages add to the editors (scripts/npm/pack.mjs builds it
// into mroffice-core): where the editors' heavy files are fetched from, and
// the settings a page would otherwise put in process.env.
//
// The fonts, the PDF worker and its data, the spelling dictionaries, the
// code runners' WebAssembly and the interface text in languages other than
// English are not in the installed packages: they are fetched on demand from
// `assetsBaseUrl`, by default jsDelivr's copy of the npm package
// mroffice-assets of the same version. A site that hosts them itself copies
// node_modules/mroffice-assets/ (npm i -D mroffice-assets) to a folder it
// serves and names that folder here.

declare const __MROFFICE_NPM_VERSION__: string;

export const MROFFICE_VERSION: string = __MROFFICE_NPM_VERSION__;
export const DEFAULT_ASSETS_BASE_URL = `https://cdn.jsdelivr.net/npm/mroffice-assets@${__MROFFICE_NPM_VERSION__}/`;

export interface EditorsConfig {
  /** Where the assets of mroffice-assets are served from (a URL or a path on
   * this site, ending in "/"). Default: jsDelivr's copy of the same version. */
  assetsBaseUrl?: string;
  /** Python runs in a sandbox page on another origin than the editors (the
   * python-sandbox.html of mroffice-assets, served from that origin). */
  sandboxOrigin?: string;
}

type Global = typeof globalThis & {
  MROFFICE_ASSETS_BASE_URL?: string;
  MROFFICE_ENV?: Record<string, string | undefined>;
};
const global = globalThis as Global;

/**
 * Configures the editors. Call it before the editor modules load (in a module
 * imported ahead of them, or before importing them lazily): some of them read
 * their asset URLs when they load. Setting `globalThis.MROFFICE_ASSETS_BASE_URL`
 * in a script before the page's modules does the same.
 */
export function configureEditors(config: EditorsConfig): void {
  if (config.assetsBaseUrl !== undefined) {
    global.MROFFICE_ASSETS_BASE_URL = config.assetsBaseUrl;
    stylesheetLinked = false;
  }
  if (config.sandboxOrigin !== undefined) {
    global.MROFFICE_ENV = { ...(global.MROFFICE_ENV ?? {}), NEXT_PUBLIC_SANDBOX_ORIGIN: config.sandboxOrigin };
  }
}

/** The base the assets are fetched from: absolute, ending in "/". */
export function assetsBaseUrl(): string {
  let base = global.MROFFICE_ASSETS_BASE_URL || DEFAULT_ASSETS_BASE_URL;
  if (!base.endsWith("/")) base += "/";
  if (typeof location !== "undefined" && !/^[a-z][a-z0-9+.-]*:/i.test(base)) {
    try {
      base = new URL(base, location.href).href;
    } catch {
      /* left as given */
    }
  }
  return base;
}

/** A file of mroffice-assets, named as the editors name it on their own site
 * ("/fonts/office/...", "/pdf.worker.min.mjs"). */
export function mrofficeAsset(path: string): string {
  return assetsBaseUrl() + path.replace(/^mroffice-asset:/, "").replace(/^\/+/, "");
}

const sameOrigin = (url: string): boolean => {
  if (typeof location === "undefined") return true;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return true;
  }
};

/**
 * A worker from mroffice-assets. A browser starts workers only from the
 * page's own origin; from another one (the CDN) the worker is started from a
 * small script of this page that loads it, and the paths it fetches
 * ("/lua-execution.wasm", "dictionaries/...") are taken from the same base.
 */
export function mrofficeWorker(url: string, options?: WorkerOptions): Worker {
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : mrofficeAsset(url);
  if (sameOrigin(absolute)) return new Worker(absolute, options);
  const base = absolute.slice(0, absolute.lastIndexOf("/") + 1);
  const root = assetsBaseUrl();
  const prelude = [
    `const __root = ${JSON.stringify(root)}, __base = ${JSON.stringify(base)};`,
    `const __at = (u) => typeof u === "string" && !/^[a-z][a-z0-9+.-]*:/i.test(u) ? (u.startsWith("/") && !u.startsWith("//") ? __root + u.slice(1) : new URL(u, __base).href) : u;`,
    `const __fetch = self.fetch.bind(self); self.fetch = (u, o) => __fetch(__at(u), o);`,
    `const __open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...rest) { return __open.call(this, m, __at(u), ...rest); };`,
  ].join("\n");
  const source =
    options?.type === "module"
      ? `${prelude}\nconst __queue = []; const __hold = (e) => __queue.push(e.data); self.addEventListener("message", __hold);\nawait import(${JSON.stringify(absolute)});\nself.removeEventListener("message", __hold); for (const data of __queue) self.dispatchEvent(new MessageEvent("message", { data }));\n`
      : `${prelude}\nimportScripts(${JSON.stringify(absolute)});\n`;
  const blob = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(blob, options);
  setTimeout(() => URL.revokeObjectURL(blob), 60_000);
  return worker;
}

let stylesheetLinked = false;
/**
 * The fonts the editors measure and draw text with are declared in style.css
 * (from the default base). A page that imports style.self-hosted.css instead
 * gets them from `<assetsBaseUrl>fonts.css`, linked here when the editors
 * start (or put that link in the page's <head> to have them from the first
 * paint).
 */
export function linkEditorFonts(): void {
  if (stylesheetLinked || typeof document === "undefined") return;
  stylesheetLinked = true;
  if (document.querySelector("[data-mroffice-fonts]")) return;
  const probe = getComputedStyle(document.documentElement).getPropertyValue("--mroffice-fonts").trim();
  if (probe === "declared") return;
  const href = `${assetsBaseUrl()}fonts.css`;
  if ([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((link) => link.href === href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.mrofficeFonts = "";
  document.head.appendChild(link);
}
