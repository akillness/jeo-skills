/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The instant view (MR Office / MRNote Classic): what the window shows from
 * the moment it is made, before the web server and the API have started.
 *
 * A launch's own pages come from the web server (Node, ~0.7 s) and their data
 * from the API (Python, 3-7 s). The window is now made at once and covered by
 * a view of its own, served from the app's own files (the `mrai-instant:`
 * scheme, no server): the home as the window last showed it (a snapshot the
 * page wrote then: its HTML, the app's own style sheets and fonts from the
 * build on disk), or, for a document double-clicked to start the app, its
 * first page: the picture the file itself carries (its OOXML thumbnail) or,
 * on macOS, Quick Look's (a Word document, a workbook, a PDF: drawn while the
 * card shows the file's name). The live page loads underneath and says when
 * it shows the same (the home with its files, the document drawn in its
 * window); the cover goes then. It is a picture, never the editor.
 *
 * The cover runs no script (JavaScript off), never navigates, and its scheme
 * is served only to its own session: the snapshot, and the build's static
 * files and public folder, nothing else.
 */
import fs from "node:fs";
import path from "node:path";
import { app, protocol, session, type BrowserWindow, type Session, WebContentsView } from "electron";

import { documentThumbnail, instantDocument, quickLookThumbnail } from "./document-thumbnail";
import { holdAnimations } from "./held-animations";

export { documentThumbnail, instantDocument } from "./document-thumbnail";

export const INSTANT_SCHEME = "mrai-instant";
const PARTITION = "mrai-instant";
const SNAPSHOT_MAX_BYTES = 3 * 1024 * 1024;

export type InstantKind = "home" | "deck";

/** Before the app is ready (Electron requires it then). */
export function registerInstantScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: INSTANT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } },
  ]);
}

function snapshotFile(): string {
  return path.join(app.getPath("userData"), "instant", "home.html");
}

/** A home snapshot this build can draw (read once; the cover then serves it). */
export function hasHomeSnapshot(webDir: string): boolean {
  homePage = homeSnapshot(webDir);
  return homePage !== null;
}

/**
 * The snapshot, when this build can still draw it: every style sheet it
 * names is in the build on disk (an update replaces them; an unstyled home
 * is worse than the splash). Null otherwise.
 */
function homeSnapshot(webDir: string): string | null {
  let html: string;
  try {
    html = fs.readFileSync(snapshotFile(), "utf8");
  } catch {
    return null;
  }
  const staticRoot = path.join(webDir, ".next", "static");
  for (const [, href] of html.matchAll(/<link[^>]*\bhref="\/_next\/static\/([^"?#]+\.css)[^"]*"/g)) {
    const file = fileUnder(staticRoot, decodeURIComponent(href));
    if (!file || !fs.existsSync(file)) return null;
  }
  return html;
}

/** The home as the live page last showed it (mrai:instant-save). */
export function saveHomeSnapshot(html: string): boolean {
  if (typeof html !== "string" || !html.startsWith("<!doctype html>") || Buffer.byteLength(html) > SNAPSHOT_MAX_BYTES) {
    return false;
  }
  const file = snapshotFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.partial`, html);
    fs.renameSync(`${file}.partial`, file);
    return true;
  } catch {
    return false;
  }
}

let homePage: string | null = null;

// --- the cover --------------------------------------------------------------------------

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

/** A file under `root` (never outside it), or null. */
function fileUnder(root: string, relative: string): string | null {
  const resolved = path.resolve(root, `.${path.posix.normalize(`/${relative}`)}`);
  return resolved.startsWith(path.resolve(root) + path.sep) ? resolved : null;
}

/** The double-clicked document's first page: its own picture, or (macOS) Quick
 * Look's once drawn; `bytes` null meanwhile (the card shows its name alone). */
let deckPicture: { bytes: Buffer | null; type: string; name: string; large?: boolean; plain?: boolean } | null = null;
let served: Session | null = null;











function deckPage(name: string, picture: boolean, large = false, plain = false): string {
  const title = name.replace(/[<>&"]/g, "");
  const style = `<style>
.mrai-instant-deck{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(243,247,246,.72);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.mrai-instant-deck .card{display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 22px 18px;background:#fff;border-radius:10px;box-shadow:0 18px 50px rgba(15,23,42,.18)}
.mrai-instant-deck img{display:block;width:auto;height:auto;max-width:min(56vw,640px);max-height:56vh;min-width:min(40vw,420px);object-fit:contain;border:1px solid #e5e7eb;border-radius:3px;background:#fff}
.mrai-instant-deck .card.page{gap:10px;padding:12px 12px 10px}
.mrai-instant-deck .card.page img{max-width:min(80vw,1100px);max-height:calc(100vh - 96px);min-width:0}
.mrai-instant-deck .name{max-width:min(56vw,640px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:#374151}
.mrai-instant-deck .bar{position:relative;width:180px;height:3px;overflow:hidden;border-radius:2px;background:#e5e7eb}
.mrai-instant-deck .bar::after{content:"";position:absolute;inset:0 auto 0 -40%;width:40%;background:#0f766e;animation:mrai-instant-bar 1.2s steps(12,end) infinite!important}
@keyframes mrai-instant-bar{to{left:100%}}
</style>`;
  const image = picture ? `<img src="/deck-picture?${Date.now()}" alt="">` : "";
  const card = `<div class="mrai-instant-deck"><div class="card${picture && large ? " page" : ""}">${image}<div class="name">${title}</div><div class="bar"></div></div></div>`;
  // The home's snapshot stills every animation (!important); the bar's own,
  // more specific and !important too, still runs.
  if (homePage && !plain) {
    const at = homePage.lastIndexOf("</body>");
    if (at >= 0) return `${homePage.slice(0, at)}${style}${card}${homePage.slice(at)}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${style}<style>html,body{margin:0;height:100%;background:#f3f7f6}</style></head><body>${card}</body></html>`;
}

function instantSession(webDir: string): Session {
  if (served) return served;
  const ses = session.fromPartition(PARTITION);
  const staticRoot = path.join(webDir, ".next", "static");
  const publicRoot = path.join(webDir, "public");
  ses.protocol.handle(INSTANT_SCHEME, async (request) => {
    const url = new URL(request.url);
    const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (url.pathname === "/home" && homePage) return html(homePage);
    if (url.pathname === "/deck" && deckPicture) {
      return html(deckPage(deckPicture.name, deckPicture.bytes !== null, deckPicture.large === true, deckPicture.plain === true));
    }
    if (url.pathname === "/deck-picture" && deckPicture?.bytes) {
      return new Response(new Uint8Array(deckPicture.bytes), { headers: { "content-type": deckPicture.type } });
    }
    const file = url.pathname.startsWith("/_next/static/")
      ? fileUnder(staticRoot, decodeURIComponent(url.pathname.slice("/_next/static/".length)))
      : fileUnder(publicRoot, decodeURIComponent(url.pathname.slice(1)));
    const type = file ? TYPES[path.extname(file).toLowerCase()] : undefined;
    if (!file || !type) return new Response("", { status: 404 });
    try {
      return new Response(new Uint8Array(await fs.promises.readFile(file)), { headers: { "content-type": type } });
    } catch {
      return new Response("", { status: 404 });
    }
  });
  served = ses;
  return ses;
}

export interface InstantCover {
  readonly kind: InstantKind;
  /** The double-clicked document it shows the first page of (kind "deck"). */
  readonly document?: string;
  /** Take the cover off (the live page shows the same now, or gave up). */
  remove(): void;
  /** Settles once the cover is off, whatever took it off. */
  readonly gone: Promise<void>;
  /** The page watches for what it shows: the cover's own limit becomes ``ms`` from now. */
  keepFor(ms: number): void;
}

/**
 * Cover `window` with the home's snapshot (kind "home") or a deck's first
 * slide ("deck", `deck` the file); null when there is nothing to show.
 * `onShown` runs once the cover has drawn.
 */
export function coverWindow(
  window: BrowserWindow,
  webDir: string,
  kind: InstantKind,
  options: { deck?: string; onShown?: () => void; giveUpMs?: number; plain?: boolean } = {},
): InstantCover | null {
  if (kind === "home") {
    homePage ??= homeSnapshot(webDir);
    if (!homePage) return null;
  }
  let quickLook = false;
  if (kind === "deck") {
    // A document the app opens: the first page it carries a picture of, else
    // (macOS) Quick Look's, drawn meanwhile; the card shows its name at once.
    if (!options.deck || !instantDocument(options.deck)) return null;
    const picture = documentThumbnail(options.deck);
    // Quick Look draws it at a page's size on screen (macOS): asked for even
    // when the file carries a picture of its own, which is a thumbnail
    // (PowerPoint's: 256 px wide) shown until Quick Look's is drawn.
    quickLook = process.platform === "darwin";
    if (!picture && !quickLook) return null;
    // `plain`: the card alone, not over the home's snapshot -- a window that
    // comes up for a document opened while the app runs shows its live home
    // already, and the snapshot (every stylesheet of the app, the home laid
    // out, twice: before and after Quick Look's picture) was a second
    // renderer's work beside the import it covers.
    const plain = options.plain === true;
    deckPicture = picture
      ? { ...picture, name: path.basename(options.deck), plain }
      : { bytes: null, type: "image/png", name: path.basename(options.deck), plain };
    if (!plain) homePage ??= homeSnapshot(webDir);
  }
  const view = new WebContentsView({
    webPreferences: {
      session: instantSession(webDir),
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  view.setBackgroundColor("#f3f7f6");
  const fit = () => {
    const { width, height } = window.getContentBounds();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  window.on("resize", fit);
  window.contentView.addChildView(view);
  const contents = view.webContents;
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.once("did-finish-load", () => {
    // A picture the file carries is part of the first load: the document's
    // first page is on screen with it (Quick Look's comes with a later load).
    if (kind === "deck" && deckPicture?.bytes) console.log("[classic] instant view: first page shown");
    options.onShown?.();
  });
  void contents.loadURL(`${INSTANT_SCHEME}://app/${kind}`).catch(() => undefined);
  let removed = false;
  let settleGone: () => void = () => undefined;
  const gone = new Promise<void>((resolve) => {
    settleGone = resolve;
  });
  // The page's CSS animations wait under the cover (./held-animations.ts).
  const releaseCovered = holdAnimations(window.webContents);
  const remove = (reason = "shown") => {
    if (removed) return;
    removed = true;
    console.log(`[classic] instant view off (${reason})`);
    releaseCovered();
    clearTimeout(giveUp);
    window.removeListener("resize", fit);
    if (!window.isDestroyed()) window.contentView.removeChildView(view);
    if (!contents.isDestroyed()) contents.close();
    deckPicture = null;
    homePage = null;
    settleGone();
  };
  // The live page never said so (it failed, or this is an older one): gone anyway.
  let giveUp = setTimeout(() => remove("timed out"), options.giveUpMs ?? 45_000);
  const keepFor = (ms: number) => {
    if (removed) return;
    clearTimeout(giveUp);
    giveUp = setTimeout(() => remove("timed out"), ms);
  };
  if (quickLook && options.deck) {
    const shown = deckPicture;
    void quickLookThumbnail(options.deck, path.join(app.getPath("userData"), "instant", "quick-look")).then((picture) => {
      if (!picture || removed || deckPicture !== shown || contents.isDestroyed()) return;
      // Quick Look draws the page at 1400 px: shown at the size of a page
      // on screen, as the document's window will, not a thumbnail's.
      deckPicture = { ...picture, name: shown!.name, large: true, plain: shown!.plain };
      console.log("[classic] instant view: first page drawn");
      contents.once("did-finish-load", () => {
        if (!removed) console.log("[classic] instant view: first page shown");
      });
      void contents.loadURL(`${INSTANT_SCHEME}://app/deck?page`).catch(() => undefined);
    });
  }
  window.once("closed", () => remove("closed"));
  return { kind, document: kind === "deck" ? options.deck : undefined, remove: () => remove(), gone, keepFor };
}
