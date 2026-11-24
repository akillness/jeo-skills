/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Note Classic for macOS and Windows (docs/desktop-classic.md), and MR
 * Office, the same app entered as an office suite only (./product.ts,
 * ../../products.cjs: its own name, data folder, link scheme and update
 * feed; its windows pinned to the web app's office surface, ./surface.ts).
 *
 * Unlike the online app (../main.ts), which is a window onto the site, this
 * app runs MR Note's notebooks and editors on the person's own computer: it
 * starts the local API and web server (services.ts), shows their pages in
 * its windows, and keeps every notebook and file on this computer. Only AI
 * reaches the internet, through the person's MR Note sign-in (ai-account.ts).
 *
 * Security:
 * - the two services listen on 127.0.0.1 only, on ports chosen at launch;
 *   the web server serves only requests carrying this launch's secret, which
 *   only the app's own session holds (a cookie set here), and the API signs
 *   the windows in with a launch token only the two services know;
 * - every page runs sandboxed with context isolation and no Node; it reaches
 *   the app only through the preload bridge (preload.ts), answered for the
 *   main frame of the app's own origin only;
 * - other links open in the default browser; nothing else loads.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Session,
  type WebContents,
} from "electron";

import { showContextMenu } from "../context-menu";
import { configureDefaultApp, defaultAppExtensions, defaultAppState, makeDefaultApp } from "../default-app";
import { LaunchOffer, readDefaultAppChoice, shouldOfferDefaultApp, writeDefaultAppChoice } from "../default-app-offer";
import { isOpenablePath, MAX_OPEN_FILE_PART_BYTES, openablePathsFromArgv, readOpenedFiles, readOpenFilePart } from "../files";
import { loadBundledPage } from "../bundled-page";
import { FocusOrder } from "../document-target";
import { aiScreenEnabled, autoSaveToOriginalEnabled, readLanding, writeLanding, writeSettings } from "./desktop-settings";
import { registerAiScreen } from "./ai-screen";
import {
  countOpened,
  countUsage,
  countWrite,
  setUsageReportsEnabled,
  startUsageReports,
  usageReportsEnabled,
} from "./usage-report";
import {
  linkOf,
  linkOriginal,
  nameLocalFilesAtStart,
  originalLinksStore,
  originalOf,
  pageOfUnchangedFile,
  pathOfToken,
  registerLocalFile,
  savedStateOf,
  unchangedSinceLinked,
  writeFileAtomically,
} from "./local-files";
import { buildMenu } from "../menu";
import { allowPermission } from "../permissions";
import {
  checkForUpdatesAfterSignIn,
  checkForUpdatesNow,
  checkInline,
  downloadUpdateNow,
  installUpdateNow,
  isLocalFeedBuild,
  onUpdateStatus,
  setBetaUpdates,
  setSettleBeforeInstall,
  startUpdateChecks,
  updateStatus,
} from "../updates";
import { setUpdateLocale } from "../update-text";
import {
  type AiAccount,
  challengeFor,
  CLASSIC_PROTOCOL,
  codeFromLink,
  connectUrl,
  fetchProfile,
  forgetAccount,
  linksFromArgv,
  newVerifier,
  readAccount,
  redeem,
  refreshAccount,
  revoke,
  saveAccount,
} from "./ai-account";
import { CONNECT_TTL_MS, PendingConnect } from "./connect-pending";
import {
  installLibreOffice,
  type LibreOfficeContext,
  libreOfficeSpace,
  libreOfficeStatus,
  removeLibreOffice,
  prefetchLibreOffice,
} from "./libreoffice";
import {
  cancelLocalModelDownload,
  type LocalModelContext,
  localModelDir,
  localModelStatus,
  pauseLocalModelDownload,
  removeLocalModelFiles,
  startLocalModelDownload,
} from "./local-model";
import { chooseWebPort, lastWebServerHolds, parseLastWebServer, usablePort } from "./web-port";
import {
  apiEnv,
  dataDir,
  cloudOrigin,
  layout,
  markApiUp,
  apiUp,
  type Launch,
  type Layout,
  prepareLaunch,
  profileFile,
  type Service,
  API_LATE_ENV,
  splitLateEnv,
  startService,
  stopService,
  stopServiceGracefully,
  WEB_LATE_ENV,
  webEnv,
} from "./services";
import { printerEnabled, startPrinter } from "./printer";
import { PRODUCT, productDisplayName, productWords } from "./product";
import { officeSurfaceRedirect, withOfficeSurface } from "./surface";
import { registerAgentComputer } from "./agent-computer";
import { registerPlaces } from "./places-ipc";
import { startAgentControl } from "./agent-control";
import { vibeCheckerEnabled } from "./vibe-checker";
import { startVibeCheckerProcess } from "./vibe-checker-process";
import {
  applyPrelaunchDefault,
  BACKGROUND_ARG,
  choosePrelaunch,
  launchedInBackground,
  prelaunchAvailable,
  prelaunchEnabled,
} from "./prelaunch";
import { keepInTrayOnClose, setKeepInTrayOnClose, showTray, trayAvailable } from "./tray";
import { launchCacheKey, usableLaunchCache } from "./launch-cache";
import {
  coverWindow,
  documentThumbnail,
  instantDocument,
  hasHomeSnapshot,
  type InstantCover,
  type InstantKind,
  registerInstantScheme,
  saveHomeSnapshot,
} from "./instant-view";

export const APP_NAME = PRODUCT.displayName.en;
/**
 * The name the app runs under, never changed: its data folder (notebooks,
 * sign-in), its logs and its Keychain item ("<name> Safe Storage") are all
 * named after it. The brand's spelling (APP_NAME) is only for what people
 * read; renaming the app itself moved 0.1.2's users onto an empty folder and
 * a Keychain item that could not read their sign-in.
 */
const APP_RUNTIME_NAME = PRODUCT.runtimeName;
const APP_ID = PRODUCT.appId;
const SHELL_COOKIE = "mrai_desktop_shell";
/** MR Office's routes carry the office surface (./surface.ts), from the first load on. */
const onSurface = (route: string) => (PRODUCT.surface === "office" ? withOfficeSurface(route) : route);
const HOME_ROUTE = onSurface(PRODUCT.homeRoute);
const OPEN_ROUTE = onSurface(PRODUCT.openRoute);
const NOTEBOOK_WARM_ROUTE = onSurface("/app/notebooks/00000000-0000-4000-8000-000000000000");
/** How often a running app asks the site for its switches again. */
const PROFILE_REFRESH_MS = 30 * 60_000;

const zh = () => app.getLocale().toLowerCase().startsWith("zh");
/** Automated checks: windows render but never come on screen. */
const HIDDEN = process.env.MRAI_CLASSIC_HIDDEN === "1";
const say = (zhText: string, enText: string) => (zh() ? zhText : enText);
/** The product's name as people read it, in the app's language. */
const appName = () => productDisplayName(zh());

let where: Layout;
/** Ends the window checker's process (./vibe-checker-process.ts). */
let stopVibeChecker: (() => void) | null = null;
let launch: Launch | null = null;
let api: Service | null = null;
let web: Service | null = null;
let quitting = false;
let ready = false;
let account: AiAccount | null = null;

/** Documents and links that arrived before the windows could show them. */
let pendingAtLaunch: string[] = openablePathsFromArgv(process.argv.slice(1));
let linksAtLaunch: string[] = linksFromArgv(process.argv.slice(1));
/** Documents waiting for the window that will show them, by webContents id. */
const pendingByContents = new Map<number, string[]>();
/** The files each window opened, by webContents id (save back, below). */
const originalsByContents = new Map<number, string[]>();
/** The app's page windows, last focused last: a document opened from the
 * system while the app runs goes to the one in use (openDocuments). */
const pageWindows = new FocusOrder<BrowserWindow>();
/** Pages that take a document opened from the system where they are (a
 * notebook's page: mrai:documents-in-place), by webContents id: the document
 * is handed to them without loading the window again. Forgotten as the
 * window leaves the page. */
const takesDocumentsInPlace = new Set<number>();
/** Of those, the notebook each shows, when it shows a document opened again
 * where it is (mrai:documents-in-place's second argument): a document opened
 * before and unchanged since, a page of that notebook, is handed to it as
 * that page instead of the window going to the open route. */
const reopensInPlace = new Map<number, string>();
/** The documents handed to a page as the pages they became, by webContents
 * id and page id: handed over again as new documents should the page find
 * one gone (mrai:reopened-pages-missing). */
const reopenedByContents = new Map<number, Map<string, string>>();

// --- windows -----------------------------------------------------------------

const appUrl = (route: string) => `${launch!.webOrigin}${route}`;

/** The app's tray icon (Windows, ./tray.ts): opens a window, or quits. */
function showAppTray(): Promise<void> {
  return showTray({
    name: APP_NAME,
    openLabel: say(`打开 ${appName()}`, `Open ${APP_NAME}`),
    quitLabel: say("退出", "Quit"),
    open: () => {
      const window = pageWindows.target();
      if (window) bringForward(window);
      else if (ready) openHomeWindow();
    },
    quit: () => app.quit(),
  });
}

/** Started at login to be ready in the background (./prelaunch.ts), with
 * nothing to open: the services only, no window until the app is opened. */
function startedInBackground(): boolean {
  return launchedInBackground() && !pendingAtLaunch.length && !linksAtLaunch.length;
}

function isAppUrl(url: string): boolean {
  if (!launch) return false;
  try {
    return new URL(url).origin === launch.webOrigin;
  } catch {
    return false;
  }
}

function securePreferences(): BrowserWindowConstructorOptions["webPreferences"] {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    spellcheck: true,
    // MR Office: the preload pins the page to the office surface (preload.ts).
    ...(PRODUCT.surface ? { additionalArguments: [`--mrai-surface=${PRODUCT.surface}`] } : {}),
  };
}

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function readWindowState(): WindowState {
  try {
    const value = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as WindowState;
    if (value.width > 400 && value.height > 300) return value;
  } catch {
    // First run.
  }
  return { width: 1440, height: 920 };
}

function rememberWindowState(window: BrowserWindow): void {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
  } catch {
    // Not worth failing a close over.
  }
}

/** The instant views covering windows until their live page shows the same (./instant-view.ts), by webContents id. */
const instantCovers = new Map<number, InstantCover>();

/**
 * The launch's window made before the web server serves, under an instant
 * view: the deck double-clicked (its first slide, when the file carries a
 * picture of it) or the home (its snapshot). Null when there is nothing to
 * cover it with.
 */
function earlyWindow(): { window: BrowserWindow; route: string; documents: string[] } | null {
  const documents = pendingAtLaunch.slice();
  // One document the app opens: its first page (the picture it carries, or
  // Quick Look's on macOS) until the editor shows it (./instant-view.ts).
  const deck =
    documents.length === 1 && instantDocument(documents[0]) && (documentThumbnail(documents[0]) || process.platform === "darwin")
      ? documents[0]
      : undefined;
  const kind: InstantKind | null = deck ? "deck" : hasHomeSnapshot(where.webDir) ? "home" : null;
  if (!kind) return null;
  const route = documents.length ? OPEN_ROUTE : HOME_ROUTE;
  const window = createWindow(route, documents, { load: false });
  const cover = coverWindow(window, where.webDir, kind, {
    deck,
    onShown: () => {
      console.log("[classic] instant view shown");
      if (!HIDDEN && !window.isDestroyed()) window.show();
    },
  });
  if (!cover) {
    window.destroy();
    return null;
  }
  const contents = window.webContents;
  instantCovers.set(contents.id, cover);
  // The live page went somewhere the cover does not show (a settings page,
  // an error): the cover goes, so it never hides what the page shows instead.
  const followed = (_event: unknown, url: string) => {
    if (coveredPath(url) || !instantCovers.has(contents.id)) return;
    instantCovers.delete(contents.id);
    console.log(`[classic] instant view: the page went elsewhere`);
    cover.remove();
  };
  contents.on("did-navigate", followed);
  contents.on("did-navigate-in-page", followed);
  return { window, route, documents };
}

/** The pages an instant view stands in for: the open page, the home, a notebook (a deck opens in it). */
function coveredPath(url: string): boolean {
  try {
    return /^\/(?:open|app\/recent|app\/notebooks)(?:\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// The live page shows what its instant view showed (the home with its files,
// the deck on its canvas): the cover goes.
ipcMain.handle("mrai:instant-done", (event, kind: unknown) => {
  if (!fromApp(event)) return;
  const cover = instantCovers.get(event.sender.id);
  if (!cover || (kind !== cover.kind && kind !== "any")) return;
  instantCovers.delete(event.sender.id);
  cover.remove();
});

// The double-clicked document a window's cover shows the first page of: the
// page takes the cover off when that document is drawn, not another one.
ipcMain.handle("mrai:instant-document", (event) => {
  if (!fromApp(event)) return null;
  const cover = instantCovers.get(event.sender.id);
  return cover?.kind === "deck" && cover.document ? path.basename(cover.document) : null;
});

// The page watches for the document a cover shows (mrai:instant-watch): the
// cover stays as long as at a launch, the page taking it off.
ipcMain.handle("mrai:instant-watching", (event) => {
  if (!fromApp(event)) return false;
  const cover = instantCovers.get(event.sender.id);
  if (!cover || cover.kind !== "deck") return false;
  cover.keepFor(45_000);
  return true;
});

// The home as the page shows it, kept for the next launch's instant view.
ipcMain.handle("mrai:instant-save", (event, html: unknown) =>
  fromApp(event) && typeof html === "string" ? saveHomeSnapshot(html) : false,
);

// --- the spare home window -----------------------------------------------------------------

/**
 * A home window made and loaded, hidden, once the last window has closed and
 * the app stays (macOS; Windows in its tray): opened again (the Dock, the
 * tray, the app started again, a document opened from the system), it is
 * shown at once instead of being made and loaded then (0.5-1 s). Its page is
 * loaded again every half hour it waits, so what it shows is never old; any
 * other window made meanwhile takes its place (it goes).
 */
let spare: BrowserWindow | null = null;
let spareTimer: NodeJS.Timeout | null = null;
let leaving = false;
const SPARE_AFTER_MS = 1_500;
const SPARE_REFRESH_MS = 30 * 60_000;

function prepareSpare(): void {
  if (spare || spareTimer || leaving || !ready) return;
  spareTimer = setTimeout(() => {
    spareTimer = null;
    if (spare || leaving || BrowserWindow.getAllWindows().some((window) => window !== splash && !window.isDestroyed())) return;
    const window = createWindow(HOME_ROUTE, [], { spare: true });
    spare = window;
    const refresh = setInterval(() => {
      if (spare === window && !window.isDestroyed()) window.webContents.reload();
    }, SPARE_REFRESH_MS);
    const taken = () => {
      clearInterval(refresh);
      if (spare === window) spare = null;
    };
    window.once("show", taken);
    window.once("closed", taken);
  }, SPARE_AFTER_MS);
}

/** How long a start in the background waits, at most, for the API's start
 * to settle before it makes the spare (``untilApiStartSettled``). */
const START_SETTLE_MAX_MS = 120_000;








async function untilApiStartSettled(): Promise<void> {
  if (!launch) return;
  const started = Date.now();
  while (Date.now() - started < START_SETTLE_MAX_MS && !leaving) {
    try {
      const response = await fetch(`${launch.apiOrigin}/api/v1/desktop/start-up`, {
        headers: { origin: launch.webOrigin, "x-mrai-desktop-launch": launch.launchToken },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return;
      const state = (await response.json()) as { settled?: unknown };
      if (state.settled !== false) return;
    } catch {
      // A moment's refusal on a busy computer: asked again.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/** The Dock icon a start in the background at login hid (./prelaunch.ts). */
function showDockIcon(): void {
  if (process.platform === "darwin" && app.dock && !app.dock.isVisible()) void app.dock.show();
}

/** The spare, shown (null when there is none). */
function takeSpare(): BrowserWindow | null {
  const window = spare && !spare.isDestroyed() ? spare : null;
  if (window) bringForward(window);
  return window;
}

/** A home window: the spare shown, or a new one. */
function openHomeWindow(route = HOME_ROUTE): void {
  if (route === HOME_ROUTE && takeSpare()) return;
  createWindow(route);
}

function createWindow(route: string, documents: string[] = [], options: { load?: boolean; spare?: boolean } = {}): BrowserWindow {
  // Another window: the spare is not needed (and must not take its documents).
  if (!options.spare && spare && !spare.isDestroyed()) {
    const old = spare;
    spare = null;
    old.destroy();
  }
  // Started in the background at login (./prelaunch.ts): the Dock icon comes
  // with the first window shown (the spare, hidden, brings it when taken).
  if (!options.spare) showDockIcon();
  const state = readWindowState();
  const others = BrowserWindow.getAllWindows().filter((window) => window !== splash).length;
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x + others * 24, y: state.y + others * 24 } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    backgroundColor: "#f3f7f6",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: { ...securePreferences(), backgroundThrottling: !HIDDEN },
    paintWhenInitiallyHidden: true,
  });
  if (state.maximized && others === 0) window.maximize();
  const contents = window.webContents;
  if (documents.length) {
    pendingByContents.set(contents.id, documents);
    originalsByContents.set(contents.id, documents);
  }
  window.once("ready-to-show", () => {
    if (!HIDDEN && !options.spare) window.show();
    if (splash && !splash.isDestroyed()) splash.close();
  });
  window.on("close", (event) => {
    rememberWindowState(window);
    // Its page's edits settled before it goes (a quit has settled them all).
    if (quitSettled || closeSettled.has(contents.id) || !settlesEdits.has(contents.id)) return;
    event.preventDefault();
    if (closeSettling.has(contents.id)) return;
    closeSettling.add(contents.id);
    void settleEdits([contents]).finally(() => {
      closeSettling.delete(contents.id);
      closeSettled.add(contents.id);
      if (!window.isDestroyed()) window.close();
    });
  });
  pageWindows.add(window);
  window.on("focus", () => pageWindows.focused(window));
  window.on("closed", () => {
    pageWindows.remove(window);
    pendingByContents.delete(contents.id);
    originalsByContents.delete(contents.id);
    takesDocumentsInPlace.delete(contents.id);
    reopensInPlace.delete(contents.id);
    reopenedByContents.delete(contents.id);
    settlesEdits.delete(contents.id);
    closeSettled.delete(contents.id);
  });
  // A new document in the window: its page says again whether it takes
  // documents in place once it is there.
  contents.on("did-start-navigation", (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      takesDocumentsInPlace.delete(contents.id);
      reopensInPlace.delete(contents.id);
      reopenedByContents.delete(contents.id);
      settlesEdits.delete(contents.id);
    }
  });
  let lastCrashReload = 0;
  contents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") countUsage("renderer_crashes");
    if (details.reason === "clean-exit" || Date.now() - lastCrashReload < 30_000) return;
    lastCrashReload = Date.now();
    contents.reload();
  });
  contents.once("destroyed", () => instantCovers.delete(contents.id));
  // Made before the web server serves (an instant view covers it): loaded then.
  if (options.load !== false) void window.loadURL(appUrl(route));
  return window;
}

let splash: BrowserWindow | null = null;

function showSplash(): void {
  splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#f3f7f6",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  splash.once("ready-to-show", () => {
    if (!HIDDEN) splash?.show();
  });
  splash.on("closed", () => {
    splash = null;
  });
  void loadBundledPage(
    splash,
    path.join(__dirname, "..", "..", PRODUCT.splash),
    `${zh() ? "lang=zh" : "lang=en"}${PRODUCT.id === "classic" ? "" : `&product=${PRODUCT.id}`}`,
  );
}

// --- every page --------------------------------------------------------------

function guardContents(contents: WebContents): void {
  const route = (url: string, event: { preventDefault(): void }) => {
    if (isAppUrl(url) && PRODUCT.surface === "office" && launch) {
      // MR Office: a page that leads off the office surface, or to a page
      // the office host has nothing for, goes where mroffice.ai would
      // (./surface.ts); the request rule alone misses pages the service
      // worker answers.
      const instead = officeSurfaceRedirect(url, launch.webOrigin);
      if (instead) {
        event.preventDefault();
        void contents.loadURL(instead).catch(() => undefined);
      }
      return;
    }
    if (isAppUrl(url) || url.startsWith("file:")) return;
    event.preventDefault();
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
  };
  contents.on("will-navigate", (event) => route(event.url, event));
  contents.on("will-redirect", (event) => {
    if (event.isMainFrame) route(event.url, event);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    // A page's own scratch window: a blank one it writes into (Docs Print,
    // PowerPoint's presenter view) or a file it made (a PDF to print). The
    // page needs the window it opened (a refused one comes back null and
    // Print fails as "pop-up blocked"); nothing in it can navigate away
    // (guardContents covers it like every page).
    if (url === "" || url === "about:blank" || (url.startsWith("blob:") && isAppUrl(url))) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          show: !HIDDEN,
          backgroundColor: "#ffffff",
          autoHideMenuBar: process.platform !== "darwin",
          webPreferences: { ...securePreferences(), backgroundThrottling: !HIDDEN },
        },
      };
    }
    if (isAppUrl(url)) {
      const parsed = new URL(PRODUCT.surface === "office" && launch ? (officeSurfaceRedirect(url, launch.webOrigin) ?? url) : url);
      createWindow(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    } else if (/^(https?|mailto):/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  contents.on("will-prevent-unload", (event) => {
    const owner = BrowserWindow.fromWebContents(contents);
    const options = {
      type: "question" as const,
      buttons: [say("离开", "Leave"), say("留下", "Stay")],
      defaultId: 1,
      cancelId: 1,
      message: say("更改可能尚未保存", "Changes may not be saved"),
      detail: say("现在离开，尚未保存的更改可能会丢失。", "If you leave now, changes that haven't been saved may be lost."),
    };
    const choice = owner ? dialog.showMessageBoxSync(owner, options) : dialog.showMessageBoxSync(options);
    if (choice === 0) event.preventDefault();
    else {
      // Stay: the close or the quit is off; the next one settles again.
      closeSettled.delete(contents.id);
      quitCancelled();
    }
  });
  contents.on("context-menu", (_event, params) => showContextMenu(contents, params));
}

function fromApp(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && isAppUrl(frame.url));
}

// --- documents from the system -------------------------------------------------

/** ``into``: the window that asked (a document chosen in its sidebar's
 * places, ./places-ipc.ts), opened there as the window in use opens one
 * from Finder. */
function openDocuments(paths: string[], into?: BrowserWindow | null): void {
  const documents = paths.filter((item) => fs.existsSync(item));
  if (!documents.length) return;
  for (const document of documents) countOpened(document);
  if (!ready) {
    pendingAtLaunch.push(...documents);
    return;
  }
  // The API learns each file's place now, while a window gets ready to ask
  // for its token (mrai:take-open-files reads the one kept here): a deck or
  // a large workbook starts its conversion server meanwhile (the API's
  // /desktop/local-files), seconds before the window asks for the import.
  for (const document of documents) void registerLocalFile(launch, document);
  const target = into && !into.isDestroyed() ? into : pageWindows.target();
  if (!target) {
    createWindow(OPEN_ROUTE, documents);
    return;
  }
  
  // a second window): its open page takes these documents as a new window's
  // would, the page there first asked to leave when it has unsaved changes
  // (will-prevent-unload, guardContents).
  const contents = target.webContents;
  originalsByContents.set(contents.id, [...(originalsByContents.get(contents.id) ?? []), ...documents]);
  // The window comes up for these documents (the spare home of a start in
  // the background, a window not on the screen): nothing of the person's is
  // under a cover of the document's first page.
  const comesUpForThem = target === spare || !target.isVisible();
  bringForward(target);
  // A file opened before and unchanged since opens as the page it became
  // (the open route finds it); one that cannot be read now counts as such.
  const pages = documents.map((document) => {
    try {
      return pageOfUnchangedFile(document, fs.statSync(document));
    } catch {
      return undefined;
    }
  });
  const reopenNotebook = reopensInPlace.get(contents.id);
  const reopened = pages.filter((page): page is { pageId: string; notebookId: string } => Boolean(page));
  if (
    reopenNotebook !== undefined &&
    takesDocumentsInPlace.has(contents.id) &&
    reopened.length === documents.length &&
    reopened.every((page) => page.notebookId === reopenNotebook)
  ) {
    // Pages of the notebook the window shows: shown there, where it is (a
    // window of one restored with the desk comes to the front), not the
    // window loaded twice -- the open route, then this notebook again --
    
    // prelaunch: a document opened again 1.6-2.9 s to editable).
    const handed = reopenedByContents.get(contents.id) ?? new Map<string, string>();
    reopened.forEach((page, index) => handed.set(page.pageId, documents[index]));
    reopenedByContents.set(contents.id, handed);
    contents.send("mrai:documents-opened", {
      reopened: reopened.map((page) => ({ pageId: page.pageId, notebookId: page.notebookId })),
    });
    return;
  }
  handDocumentsTo(target, documents, pages.some((page) => page !== null), comesUpForThem);
}

/** ``documents`` to the page ``target`` shows: imported there, where it is,
 * when it takes them in place and none of them is ``known`` (opened before
 * and unchanged since: the open route opens the page it became); else the
 * window goes to the open route, which takes them. */
function handDocumentsTo(target: BrowserWindow, documents: string[], known: boolean, covered = false): void {
  const contents = target.webContents;
  pendingByContents.set(contents.id, [...(pendingByContents.get(contents.id) ?? []), ...documents]);
  if (!known && takesDocumentsInPlace.has(contents.id)) {
    // A notebook's page imports them where it is, as a drop: the window is
    // not loaded again twice (the open route, then the notebook), which was
    // 1.5 s of every document opened before its import began (MR Office
    
    if (covered) coverForDocument(target, documents);
    contents.send("mrai:documents-opened");
    return;
  }
  target.loadURL(appUrl(OPEN_ROUTE)).catch(() => {
    // Stayed on the page (unsaved changes) or the load was replaced.
  });
}











function coverForDocument(target: BrowserWindow, documents: readonly string[]): void {
  const contents = target.webContents;
  if (documents.length !== 1 || !instantDocument(documents[0]) || instantCovers.has(contents.id)) return;
  if (!documentThumbnail(documents[0]) && process.platform !== "darwin") return;
  const cover = coverWindow(target, where.webDir, "deck", {
    deck: documents[0],
    giveUpMs: 12_000,
    plain: true,
    onShown: () => console.log("[classic] instant view shown"),
  });
  if (!cover) return;
  instantCovers.set(contents.id, cover);
  void cover.gone.then(() => {
    if (instantCovers.get(contents.id) === cover) instantCovers.delete(contents.id);
  });
  contents.send("mrai:instant-watch");
}

/** The documents of these that are imported when opened: not one opened
 * before and unchanged since, which opens the page it became. */
function documentsToImport(documents: readonly string[]): string[] {
  return documents.filter((document) => {
    try {
      return !pageOfUnchangedFile(document, fs.statSync(document));
    } catch {
      return false;
    }
  });
}

/** The window comes to the front, out of the Dock or the taskbar, over the
 * app the document was opened from. */
function bringForward(window: BrowserWindow): void {
  if (HIDDEN) {
    // Automated runs: never on the screen; the spare is taken all the same.
    if (window === spare) {
      spare = null;
      console.log("[classic] spare window taken");
    }
    return;
  }
  if (window.isMinimized()) window.restore();
  showDockIcon();
  window.show();
  window.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
}

const openFileTokens = new Map<string, { path: string; size: number; contentsId: number }>();

ipcMain.handle("mrai:take-open-files", async (event, keep: unknown) => {
  if (!fromApp(event)) return [];
  const paths = pendingByContents.get(event.sender.id) ?? [];
  // Kept: the open page only looks (a file opened before opens its page);
  // the notebook it leads to takes them to import (openFiles=desktop).
  if (keep !== true) pendingByContents.delete(event.sender.id);
  const contentsId = event.sender.id;
  return readOpenedFiles(
    paths,
    (filePath, size) => {
      const token = randomUUID();
      openFileTokens.set(token, { path: filePath, size, contentsId });
      event.sender.once("destroyed", () => openFileTokens.delete(token));
      return token;
    },
    async (filePath, stat) => {
      // The open page only looks (keep): it is told the files at once, not
      // after the API has started and registered them (most of a launch
      // started by a double-click); the registration goes on for the
      // notebook's page, which takes them for its import.
      if (keep === true) {
        void registerLocalFile(launch, filePath);
        return { existingPage: pageOfUnchangedFile(filePath, stat) ?? undefined };
      }
      return {
        localToken: (await registerLocalFile(launch, filePath)) ?? undefined,
        existingPage: pageOfUnchangedFile(filePath, stat) ?? undefined,
      };
    },
  );
});

ipcMain.handle("mrai:remember-landing", (event, notebookId: unknown) => {
  if (!fromApp(event)) return false;
  return writeLanding(typeof notebookId === "string" ? notebookId : null);
});

/** The kinds a launch's documents are loaded straight into a notebook with. */
const DIRECT_LANDING_KINDS = new Set([".docx", ".xlsx", ".pptx", ".pdf"]);












function openRouteFor(documents: readonly string[]): string {
  const notebookId = readLanding();
  if (!notebookId || documents.length === 0) return OPEN_ROUTE;
  for (const document of documents) {
    if (!DIRECT_LANDING_KINDS.has(path.extname(document).toLowerCase())) return OPEN_ROUTE;
    try {
      if (pageOfUnchangedFile(document, fs.statSync(document))) return OPEN_ROUTE;
    } catch {
      return OPEN_ROUTE;
    }
  }
  return onSurface(`/app/notebooks/${notebookId}?openFiles=desktop&landing=desktop`);
}

// A notebook's page takes documents opened from the system where it is
// (true), or no longer (false): openDocuments hands them to it.
// --- quitting and closing: the pages' edits settled first ------------------------
// A speaker-notes draft, a save waiting out its pause, a room's last update:
// quitting stopped the services first and closed the windows after, and what

// Now each page that says it can (preload onSettleEdits) settles its edits

// written); then the windows close -- a page with nothing left unsaved goes
// without asking, one that could not settle in time (a sheet's cell still in
// edit mode, a save refused) still asks, as it always did -- and the services
// stop once every window has closed (will-quit), never under a page saving.
const SETTLE_EDITS_MS = 5000;
/** The most a page may ask to be waited on for (once per settle) to write a
 * pending autosave back to the file it came from (preload onSettleEdits'
 * ``extend``): an export of a long document takes a few seconds. */
const SETTLE_ORIGINAL_WRITE_MAX_MS = 20_000;
const settlesEdits = new Set<number>();
const settleReplies = new Map<string, () => void>();
const settleExtensions = new Map<string, (ms: number) => void>();
const closeSettling = new Set<number>();
const closeSettled = new Set<number>();
let quitSettling = false;
let quitSettled = false;

ipcMain.handle("mrai:settles-edits", (event, settles: unknown) => {
  if (!fromApp(event)) return;
  if (settles === true) settlesEdits.add(event.sender.id);
  else settlesEdits.delete(event.sender.id);
});
ipcMain.handle("mrai:edits-settled", (event, nonce: unknown, result: unknown) => {
  if (!fromApp(event)) return;
  const done = settleReplies.get(String(nonce));
  if (!done) return;
  const settled = (result as { settled?: unknown } | null)?.settled === true;
  if (!settled) console.warn(`[classic] a page's edits were not all saved in ${SETTLE_EDITS_MS} ms: it asks before closing`);
  done();
});
ipcMain.handle("mrai:edits-settle-extend", (event, nonce: unknown, ms: unknown) => {
  if (!fromApp(event)) return false;
  const extend = settleExtensions.get(String(nonce));
  const wait = Number(ms);
  if (!extend || !Number.isFinite(wait) || wait <= 0) return false;
  extend(Math.min(wait, SETTLE_ORIGINAL_WRITE_MAX_MS));
  return true;
});

function settleEdits(pages: WebContents[]): Promise<void> {
  const asked = pages.filter((contents) => !contents.isDestroyed() && settlesEdits.has(contents.id));
  return Promise.all(
    asked.map(
      (contents) =>
        new Promise<void>((resolve) => {
          const nonce = randomUUID();
          const finish = () => {
            clearTimeout(timer);
            settleReplies.delete(nonce);
            settleExtensions.delete(nonce);
            resolve();
          };
          // The page's own wait, and a little for its answer.
          let timer = setTimeout(finish, SETTLE_EDITS_MS + 700);
          settleReplies.set(nonce, finish);
          // Once: a page writing its pending autosave back to its file.
          settleExtensions.set(nonce, (ms) => {
            settleExtensions.delete(nonce);
            clearTimeout(timer);
            timer = setTimeout(finish, ms + 700);
          });
          contents.send("mrai:settle-edits", nonce, SETTLE_EDITS_MS);
        }),
    ),
  ).then(() => undefined);
}

function quitWhenSettled(event: Electron.Event): void {
  if (quitSettled) return;
  event.preventDefault();
  if (quitSettling) return;
  quitSettling = true;
  const pages = BrowserWindow.getAllWindows()
    .filter((window) => !window.isDestroyed())
    .map((window) => window.webContents);
  void settleEdits(pages).finally(() => {
    quitSettled = true;
    app.quit();
  });
}

/** A page that asked to stay (its edits not saved): the quit is off, and the
 * next one settles again. */
function quitCancelled(): void {
  quitSettling = false;
  quitSettled = false;
}

ipcMain.handle("mrai:documents-in-place", (event, takes: unknown, reopensFor: unknown) => {
  if (!fromApp(event)) return false;
  if (takes === true) takesDocumentsInPlace.add(event.sender.id);
  else takesDocumentsInPlace.delete(event.sender.id);
  // And the notebook it shows, when it shows a document opened again there.
  if (takes === true && typeof reopensFor === "string" && reopensFor) reopensInPlace.set(event.sender.id, reopensFor);
  else reopensInPlace.delete(event.sender.id);
  return true;
});

// Pages handed over as documents opened again that the page found gone: their
// documents, handed over again as new ones (imported, as any other).
ipcMain.handle("mrai:reopened-pages-missing", (event, pageIds: unknown) => {
  if (!fromApp(event) || !Array.isArray(pageIds)) return false;
  const handed = reopenedByContents.get(event.sender.id);
  const documents: string[] = [];
  for (const pageId of pageIds) {
    const document = handed?.get(String(pageId));
    handed?.delete(String(pageId));
    if (document && fs.existsSync(document)) documents.push(document);
  }
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!documents.length || !target || target.isDestroyed()) return false;
  handDocumentsTo(target, documents, false);
  return true;
});

// A file the page holds (dropped or picked): the preload names its path.
ipcMain.handle("mrai:local-file-token", async (event, filePath: unknown) => {
  if (!fromApp(event) || typeof filePath !== "string" || !filePath) return null;
  countOpened(filePath);
  return registerLocalFile(launch, filePath);
});

ipcMain.handle(
  "mrai:link-original",
  async (event, pageId: unknown, localToken: unknown, notebookId: unknown) => {
    if (!fromApp(event) || typeof pageId !== "string" || typeof localToken !== "string") return false;
    const filePath = pathOfToken(localToken);
    if (!filePath) return false;
    linkOriginal(pageId, filePath, typeof notebookId === "string" ? notebookId : undefined);
    return true;
  },
);

ipcMain.handle("mrai:original-of", async (event, pageId: unknown) => {
  if (!fromApp(event) || typeof pageId !== "string") return null;
  const filePath = originalOf(pageId);
  return filePath ? { name: path.basename(filePath), savedState: savedStateOf(pageId) } : null;
});

/** What the window's autosave asks before it exports a page: whether the page
 * is linked to a file, whether that file is still there and as the app last
 * saw it (opened or written), and whether autosave is on. */
ipcMain.handle("mrai:original-status", async (event, pageId: unknown) => {
  if (!fromApp(event) || typeof pageId !== "string") return null;
  const link = linkOf(pageId);
  const autosave = autoSaveToOriginalEnabled();
  if (!link) return { linked: false, autosave };
  const missing = !fs.existsSync(link.path);
  return {
    linked: true,
    autosave,
    name: path.basename(link.path),
    missing,
    changedElsewhere: !missing && !unchangedSinceLinked(pageId),
    savedState: missing ? null : savedStateOf(pageId),
  };
});

ipcMain.handle("mrai:original-autosave", async (event, on: unknown) => {
  if (!fromApp(event)) return null;
  if (typeof on === "boolean") {
    try {
      writeSettings({ autoSaveToOriginal: on });
    } catch (error) {
      console.error(`[classic] autosave setting not saved: ${error instanceof Error ? error.message : error}`);
    }
  }
  return autoSaveToOriginalEnabled();
});

/** Save: the page written back to the file it came from; a page that came
 * from none asks where once, and is linked to that file from then on. The
 * file as the person had it is copied first (original-links writeOriginal).
 * ``auto`` (the window's autosave once edits settle): only the page's own
 * linked file, only while it is there and unchanged since the app last saw
 * it, and only while autosave is on -- never a dialog. */
ipcMain.handle("mrai:save-to-original", async (event, request: unknown) => {
  if (!fromApp(event) || !request || typeof request !== "object") return null;
  const { pageId, bytes, filename, state, auto } = request as {
    pageId?: string;
    bytes?: ArrayBuffer;
    filename?: string;
    state?: string;
    auto?: boolean;
  };
  if (typeof pageId !== "string" || !(bytes instanceof ArrayBuffer) || typeof filename !== "string" || !filename) {
    return null;
  }
  const savedState = typeof state === "string" ? state : undefined;
  if (auto === true) {
    if (!autoSaveToOriginalEnabled()) return { error: "autosave_off", code: "autosave_off" };
    const written = await originalLinksStore.writeOriginal(pageId, null, new Uint8Array(bytes), { auto: true, savedState });
    if (!written.ok) return { error: written.message ?? written.error, code: written.error };
    countWrite("autosave", false);
    return { path: written.path, name: path.basename(written.path) };
  }
  let target = originalOf(pageId);
  const linked = Boolean(target);
  if (!target) {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: path.join(app.getPath("documents"), path.basename(filename)) };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  const created = !fs.existsSync(target);
  const written = await originalLinksStore.writeOriginal(pageId, target, new Uint8Array(bytes), { savedState });
  if (!written.ok) return { error: written.message ?? written.error, code: written.error };
  countWrite(linked ? "writeback" : "save_as", created);
  return { path: written.path, name: path.basename(written.path) };
});

ipcMain.handle("mrai:read-open-file", async (event, token: unknown, start: unknown, end: unknown) => {
  if (!fromApp(event) || typeof token !== "string") return null;
  const entry = openFileTokens.get(token);
  if (!entry || entry.contentsId !== event.sender.id) return null;
  const from = Number(start);
  const to = Number(end);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from) return null;
  if (to - from > MAX_OPEN_FILE_PART_BYTES || from >= entry.size) return null;
  return readOpenFilePart(entry.path, from, Math.min(to, entry.size));
});

// The installer registers this build's types under these ProgIDs
// (electron-builder.classic.config.cjs fileAssociations).
configureDefaultApp({ windowsProgIdPrefix: PRODUCT.progIdPrefix, ...(PRODUCT.registeredApp ? { windowsRegisteredApp: PRODUCT.registeredApp } : {}) });
const defaultAppChoiceFile = () => path.join(app.getPath("userData"), "default-app-choice.json");
/** The launch question: once per run, held by the page that shows it until
 * the person answers (../default-app-offer.ts LaunchOffer). */
const launchOffer = new LaunchOffer();

ipcMain.handle("mrai:default-app-state", async (event) => (fromApp(event) ? defaultAppState() : null));
ipcMain.handle("mrai:make-default-app", async (event, extensions: unknown) => {
  if (!fromApp(event)) return null;
  launchOffer.answer();
  // Making it the default (at launch or from Settings) takes back an earlier
  // "No thanks": a type another app takes later is asked about again.
  if (readDefaultAppChoice(defaultAppChoiceFile()).declined) {
    writeDefaultAppChoice(defaultAppChoiceFile(), { declined: false });
  }
  return makeDefaultApp(defaultAppExtensions(extensions));
});
/** At launch: whether to ask to open the documents by default (docs in
 * ../default-app-offer.ts). A page that reloads or goes elsewhere while the
 * system is being asked, or before the person answers, does not keep it:
 * the next page to ask shows it. */
ipcMain.handle("mrai:default-app-offer", async (event) => {
  if (!fromApp(event) || !launchOffer.open()) return null;
  const choice = readDefaultAppChoice(defaultAppChoiceFile());
  if (choice.declined) return null;
  const sender = event.sender;
  let moved = false;
  const onMove = () => {
    moved = true;
  };
  sender.once("did-navigate", onMove);
  sender.once("destroyed", onMove);
  // A double-clicked document's first page covers the window until its
  // editor shows it (./instant-view.ts): the question waits for that. Asked
  // at once it was the page's first dialog, and a dialog takes the cover off
  // (lib/desktop-instant.ts): the picture went 3-8 s before the document
  // came, the launch showing the home and a question instead (MR Office
  
  const cover = instantCovers.get(sender.id);
  if (cover?.kind === "deck") await cover.gone;
  const state = await defaultAppState().finally(() => {
    if (!sender.isDestroyed()) {
      sender.removeListener("did-navigate", onMove);
      sender.removeListener("destroyed", onMove);
    }
  });
  // The page that asked is gone (a reload of the window at launch): its answer would reach nobody.
  if (moved || sender.isDestroyed() || !shouldOfferDefaultApp(state, choice) || !launchOffer.take(sender.id)) return null;
  const release = () => launchOffer.release(sender.id);
  sender.once("did-navigate", release);
  sender.once("destroyed", release);
  return { supported: state.supported, missing: state.extensions.filter((ext) => !state.defaultFor.includes(ext)) };
});
ipcMain.handle("mrai:default-app-decline", async (event) => {
  if (!fromApp(event)) return false;
  launchOffer.answer();
  writeDefaultAppChoice(defaultAppChoiceFile(), { declined: true });
  return true;
});

/** A file opened from the system that a download of the same name and type
 * would replace (save back to the original, after the person confirms). */
function originalFor(contentsId: number, filename: string): string | null {
  const stem = (name: string) => path.parse(name).name.toLowerCase();
  const ext = path.extname(filename).toLowerCase();
  for (const original of originalsByContents.get(contentsId) ?? []) {
    if (path.extname(original).toLowerCase() === ext && stem(original) === stem(filename)) return original;
  }
  return null;
}

ipcMain.handle("mrai:save-file", async (event, request: unknown) => {
  if (!fromApp(event) || !request || typeof request !== "object") return null;
  const { bytes, filename, originalPath, saveAs } = request as {
    bytes?: ArrayBuffer;
    filename?: string;
    originalPath?: string | null;
    saveAs?: boolean;
  };
  if (!(bytes instanceof ArrayBuffer) || typeof filename !== "string" || !filename) return null;
  const owner = BrowserWindow.fromWebContents(event.sender);
  let target = !saveAs && originalPath && fs.existsSync(originalPath) ? originalPath : null;
  if (!target) {
    const options = {
      defaultPath: path.join(app.getPath("documents"), path.basename(filename)),
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  const created = !fs.existsSync(target);
  await writeFileAtomically(target, new Uint8Array(bytes));
  // Back to the file it came from, or to one chosen in the dialog.
  countWrite(target === originalPath ? "writeback" : "save_as", created);
  return target;
});

/** Settings › General › "Send usage statistics" (./usage-report.ts). */
ipcMain.handle("mrai:usage-reports", async (event, on: unknown) => {
  if (!fromApp(event)) return null;
  if (typeof on === "boolean") {
    try {
      return setUsageReportsEnabled(on);
    } catch (error) {
      console.error(`[classic] usage statistics setting not saved: ${error instanceof Error ? error.message : error}`);
    }
  }
  return usageReportsEnabled();
});

// --- AI sign-in -----------------------------------------------------------------

/** The sign-in for AI waiting on its link from the browser (connect-pending.ts). */
const pendingConnect = new PendingConnect(newVerifier, challengeFor);
let connectSweep: NodeJS.Timeout | null = null;

/** Open (again) the connect page of the waiting sign-in, starting one if none waits. */
function openConnectPage(): Promise<boolean> {
  const { challenge, done } = pendingConnect.begin();
  // The waiting sign-in lapses after CONNECT_TTL_MS: whoever waits is answered then.
  if (connectSweep) clearTimeout(connectSweep);
  connectSweep = setTimeout(() => pendingConnect.sweep(), CONNECT_TTL_MS + 1_000);
  connectSweep.unref?.();
  const url = connectUrl(cloudOrigin(), challenge);
  // Automated checks open the page themselves (the challenge only; the
  // verifier never leaves this process).
  if (HIDDEN) console.log(`[classic] connect: ${url}`);
  else void shell.openExternal(url);
  return done;
}

/**
 * The person's sign-in to the API (or that there is none). At start-up it is
 * sent beside the first window, not before it: the API holds that window's
 * requests until it has been answered (apps/api app/desktop/account_gate.py),
 * so the page never sees the API without it; `notify` is false then, as the
 * page asks after it anyway.
 */
async function pushAccountToApi(notify = true): Promise<void> {
  if (!launch) return;
  await apiUp();
  const headers = {
    "content-type": "application/json",
    origin: launch.webOrigin,
    "x-mrai-desktop-launch": launch.launchToken,
  };
  try {
    if (account) {
      await fetch(`${launch.apiOrigin}/api/v1/desktop/ai-account`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ token: account.token, email: account.email, display_name: account.displayName, plan: account.plan }),
      });
    } else {
      await fetch(`${launch.apiOrigin}/api/v1/desktop/ai-account`, { method: "DELETE", headers });
    }
  } catch {
    // The API restarts with the account read again at launch.
  }
  if (notify) notifyAccountChanged();
  // At every start and sign-in: the profile card follows the account's
  // (apps/api/app/desktop/profile_card.py). Not awaited: offline, it must
  // not hold the windows up.
  if (account) void pullProfileCard();
}

function notifyAccountChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window !== splash) window.webContents.send("mrai:ai-account-changed");
  }
}

/** Send pending local profile edits to the account, then take its card. */
async function pullProfileCard(): Promise<void> {
  if (!launch) return;
  try {
    const response = await fetch(`${launch.apiOrigin}/api/v1/desktop/profile-card/pull`, {
      method: "POST",
      headers: { origin: launch.webOrigin, "x-mrai-desktop-launch": launch.launchToken },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) return;
    const result = (await response.json()) as { changed?: boolean };
    // Open pages read the card again (the profile page, the avatar in the sidebar).
    if (result.changed) notifyAccountChanged();
  } catch {
    // Offline: the next start or sign-in tries again; the profile page asks too.
  }
}

registerAgentComputer(() => launch, fromApp);
registerPlaces(fromApp, (paths, window) => openDocuments(paths, window));
// AI apps on this computer (terminal assistants, AI editors) use the app as their
// screen through its local MCP endpoint (./ai-screen): started once the
// windows can be made, stopped as the app quits.
const aiScreen = registerAiScreen({
  appName: () => appName(),
  product: PRODUCT.id,
  zh,
  hidden: HIDDEN,
  fromApp,
  openDocuments: (paths) => openDocuments(paths),
  targetWindow: () => pageWindows.target() ?? null,
  ready: () => ready,
  pagesOfFile: (filePath) => originalLinksStore.pagesOfFile(filePath),
  linkPath: (pageId) => linkOf(pageId)?.path ?? null,
  isOpenable: isOpenablePath,
  writeFileAtomically,
  enabled: aiScreenEnabled,
  setEnabled: (on) => writeSettings({ aiScreen: on }),
});

ipcMain.handle("mrai:ai-account", async (event) => {
  if (!fromApp(event)) return null;
  return account
    ? { signedIn: true, email: account.email, displayName: account.displayName, plan: account.plan }
    : { signedIn: false };
});

ipcMain.handle("mrai:ai-sign-in", async (event, reason: unknown) => {
  if (!fromApp(event)) return false;
  if (account) return true;
  const owner = BrowserWindow.fromWebContents(event.sender);
  // An explicit sign-in button (Settings, Messages) needs no AI explanation
  // first, nor does a press while a sign-in already waits.
  if (reason !== "settings" && reason !== "messages" && !HIDDEN && !pendingConnect.waiting()) {
    const options = {
      type: "info" as const,
      buttons: [say("登录", "Sign In"), say("取消", "Cancel")],
      defaultId: 0,
      cancelId: 1,
      message: productWords(say("登录 MR Note 以使用 AI", "Sign in to MR Note to use AI")),
      detail: productWords(
        say(
          "AI 窗口、Copilot 和选区操作会使用你 MR Note 账号的 AI 额度。登录会在你的默认浏览器中完成；你的笔记本和文件始终保存在这台电脑上。",
          "The AI window, Copilot and selection actions use your MR Note account's AI allowance. You sign in in your default browser; your notebooks and files stay on this computer.",
        ),
      ),
    };
    const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
    if (response !== 0) return false;
  }
  // A press while a sign-in already waits joins it: the same page opens
  // again (it may be behind other windows), and the page the person allows,
  // this one or an earlier one, still signs the app in.
  return openConnectPage();
});

ipcMain.handle("mrai:ai-sign-out", async (event) => {
  if (!fromApp(event)) return;
  const previous = account;
  account = null;
  forgetAccount();
  await pushAccountToApi();
  if (previous) await revoke(cloudOrigin(), previous);
});

// --- LibreOffice, downloaded when first needed (libreoffice.ts) -------------------------

const libreOfficeContext: LibreOfficeContext = {
  displayName: APP_NAME,
  hidden: HIDDEN,
  notify: () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== splash) window.webContents.send("mrai:libreoffice-changed");
    }
  },
};

ipcMain.handle("mrai:libreoffice-status", async (event) => {
  if (!fromApp(event)) return null;
  return { ...libreOfficeStatus(), space: libreOfficeSpace() };
});

ipcMain.handle("mrai:libreoffice-install", async (event) => {
  if (!fromApp(event)) return { ok: false };
  return installLibreOffice(libreOfficeContext, BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle("mrai:libreoffice-remove", async (event) => {
  if (!fromApp(event)) return { ok: false };
  return removeLibreOffice(libreOfficeContext, BrowserWindow.fromWebContents(event.sender));
});

// --- the model on this computer, downloaded when the person asks (local-model.ts) -------

const localModelContext: LocalModelContext = {
  hidden: HIDDEN,
  notify: () => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== splash) window.webContents.send("mrai:local-model-changed");
    }
  },
  // Its files are held open by the server the API runs (Windows cannot
  // delete them then): the API stops it first.
  stopServer: async () => {
    if (!launch) return;
    await fetch(`${launch.apiOrigin}/api/v1/desktop/local-model/stop`, {
      method: "POST",
      headers: { origin: launch.webOrigin, "x-mrai-desktop-launch": launch.launchToken },
      signal: AbortSignal.timeout(20_000),
    });
  },
};

ipcMain.handle("mrai:local-model-status", async (event) => (fromApp(event) ? localModelStatus() : null));

ipcMain.handle("mrai:local-model-download", async (event, request: unknown) => {
  if (!fromApp(event)) return { ok: false };
  const asked = request && typeof request === "object" ? (request as { key?: unknown; mirror?: unknown }) : {};
  return startLocalModelDownload(localModelContext, { key: asked.key, mirror: asked.mirror });
});

ipcMain.handle("mrai:local-model-pause", async (event) => (fromApp(event) ? pauseLocalModelDownload() : { ok: false }));

ipcMain.handle("mrai:local-model-cancel", async (event) => (fromApp(event) ? cancelLocalModelDownload(localModelContext) : { ok: false }));

ipcMain.handle("mrai:local-model-remove", async (event) => {
  if (!fromApp(event)) return { ok: false };
  return removeLocalModelFiles(localModelContext, BrowserWindow.fromWebContents(event.sender));
});

// --- new versions of the app (../updates.ts): Settings › Software Update ----------------

onUpdateStatus(() => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && window !== splash) window.webContents.send("mrai:update-changed");
  }
});

ipcMain.handle("mrai:update-status", async (event, locale: unknown) => {
  if (!fromApp(event)) return null;
  // The page's language: the update dialogs speak it too.
  if (typeof locale === "string") setUpdateLocale(locale);
  return updateStatus();
});

ipcMain.handle("mrai:update-check", async (event) => (fromApp(event) ? checkInline() : null));

ipcMain.handle("mrai:update-download", async (event) => {
  if (fromApp(event)) await downloadUpdateNow();
});

ipcMain.handle("mrai:update-install", async (event) => {
  if (fromApp(event)) installUpdateNow();
});

ipcMain.handle("mrai:update-set-beta", async (event, on: unknown) => {
  if (fromApp(event)) setBetaUpdates(on === true);
});

 
function handleLink(url: string): void {
  if (!ready) {
    linksAtLaunch.push(url);
    return;
  }
  const window = pageWindows.target();
  if (window) bringForward(window);
  const code = codeFromLink(url);
  if (!code) return;
  const taken = pendingConnect.take();
  if (taken.kind === "busy") return; // the same link opened twice: one redeem runs
  if (taken.kind === "none") {
    // Signed in already (a page allowed twice), or a link this run of the
    // app never asked for, or one that came back after the sign-in lapsed:
    
    if (account) return;
    void offerSignInAgain(window, say("这个登录链接已失效", "This sign-in link has expired"));
    return;
  }
  void redeem(cloudOrigin(), code, taken.verifier).then(
    async (signedIn) => {
      account = signedIn;
      saveAccount(signedIn);
      try {
        await pushAccountToApi();
        await refreshProfile();
      } catch (error) {
        console.warn(`[classic] signed in; the API takes it at its next start: ${error instanceof Error ? error.message : error}`);
      }
      pendingConnect.finish(true);
      checkForUpdatesAfterSignIn();
    },
    async (error: unknown) => {
      console.warn(`[classic] sign-in not redeemed: ${error instanceof Error ? error.message : error}`);
      // The sign-in still waits: its page can be allowed again.
      pendingConnect.finish(false);
      await offerSignInAgain(window, say("登录没有完成", "Sign-in did not finish"));
    },
  );
}

/** Tell the person a sign-in did not go through, and open its page again if they want. */
async function offerSignInAgain(window: BrowserWindow | null | undefined, message: string): Promise<void> {
  const options = {
    type: "warning" as const,
    buttons: [say("重新登录", "Sign In Again"), say("取消", "Cancel")],
    defaultId: 0,
    cancelId: 1,
    message,
    detail: say(
      "会在浏览器里再打开一次登录页，在那里点“允许”即可。",
      "The sign-in page opens in your browser again; choose Allow there.",
    ),
  };
  if (HIDDEN) {
    console.warn(`[classic] ${message}`);
    return;
  }
  const owner = window && !window.isDestroyed() ? window : null;
  const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
  if (response === 0 && !account) void openConnectPage();
}

// --- the hosted profile ------------------------------------------------------------

/** Fetch and save the hosted profile; whether a new one was saved. */
async function fetchFreshProfile(): Promise<boolean> {
  const profile = await fetchProfile(cloudOrigin(), account);
  if (!profile) return false;
  try {
    // Whole or not at all: the API may be reading it while it starts.
    const partial = `${profileFile()}.partial`;
    fs.writeFileSync(partial, JSON.stringify(profile));
    fs.renameSync(partial, profileFile());
    return true;
  } catch {
    // The last one (or the build's) stays.
    return false;
  }
}

async function refreshProfile(): Promise<void> {
  if (await fetchFreshProfile()) await reloadProfile();
}

/** The running API takes the saved profile now, not at its next start. */
async function reloadProfile(): Promise<void> {
  // A running API applied the profile it started with; the model routing
  // only comes once signed in, so it takes this one now, not at the next start.
  if (!launch) return;
  await apiUp();
  try {
    await fetch(`${launch.apiOrigin}/api/v1/desktop/profile/reload`, {
      method: "POST",
      headers: { origin: launch.webOrigin, "x-mrai-desktop-launch": launch.launchToken },
    });
  } catch {
    // The API reads it again at its next start.
  }
}

function ensureProfile(): void {
  if (fs.existsSync(profileFile()) || !where.bundledProfile || !fs.existsSync(where.bundledProfile)) return;
  fs.copyFileSync(where.bundledProfile, profileFile());
}

// --- services ------------------------------------------------------------------------

/** Whether `port` on 127.0.0.1 can be listened on now. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/**
 * The web server's port, the same at every launch (./web-port.ts): a page's
 * storage, AutoRecover's drafts included, belongs to its origin, port
 * included. The remembered port is only ever written at the first launch.
 */
function rememberedWebPort(): number {
  try {
    return Number(fs.readFileSync(path.join(app.getPath("userData"), "web-port"), "utf8").trim());
  } catch {
    return 0; // First launch.
  }
}

/** The last launch's web server (process and port), recorded as it started. */
const lastWebServerFile = () => path.join(app.getPath("userData"), "web-server.json");

function lastWebServer() {
  try {
    return parseLastWebServer(fs.readFileSync(lastWebServerFile(), "utf8"));
  } catch {
    return null;
  }
}

function recordWebServer(pid: number | undefined, port: number): void {
  if (!pid) return;
  try {
    fs.writeFileSync(lastWebServerFile(), JSON.stringify({ pid, port }));
  } catch {
    // Not recorded: the next launch waits for a held port as before.
  }
}

function processRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Running as someone else: still running.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function withStableWebPort(fresh: Launch, remembered: number): Promise<Launch> {
  const choice = await chooseWebPort({
    remembered,
    fresh: fresh.webPort,
    isFree: portFree,
    // A held port is waited for only while the last launch's server, on it, is still on its way out.
    heldByLastLaunch: lastWebServerHolds(lastWebServer(), remembered, processRunning),
  });
  if (choice.remember !== remembered) {
    try {
      fs.writeFileSync(path.join(app.getPath("userData"), "web-port"), String(choice.remember));
    } catch {
      // Not remembered: the next launch picks again.
    }
  }
  if (!choice.remembered && usablePort(remembered)) {
    console.warn(`[classic] web port ${remembered} is held by another program: this launch serves on ${choice.port}, and its drafts are kept there`);
  }
  return choice.port === fresh.webPort ? fresh : { ...fresh, webPort: choice.port, webOrigin: `http://127.0.0.1:${choice.port}` };
}

/**
 * The API's start, begun with the web server's by startServices and going on
 * after it: the first window is made once the web server serves, while the
 * API still imports (most of a launch). The window's requests to the API wait
 * for it in the web server (desktop-server.mjs), the shell's own in apiUp.
 * Rejects when the API does not start.
 */
let apiStarted: Promise<void> = Promise.resolve();
let apiStarting: Promise<Service> | null = null;

/**
 * Both services started. ``known`` resolves at the app's ready, once what
 * the launch learns then is set (the documents macOS hands it, a start in the
 * background, the sign-in; the single-instance lock held), or rejects when
 * this launch quits instead. ``early``: they are spawned now, with what is
 * known before the app is ready, and given the rest at its ready
 * (``startService``'s ``lateEnv``); else spawned at the ready with all of it.
 * ``spawned`` resolves once both are spawned and the app is ready;
 * ``webReady`` once the web server serves.
 */
function startServices(known: Promise<void>, early: boolean): { spawned: Promise<void>; webReady: Promise<void> } {
  let spawnedResolve: () => void = () => undefined;
  let spawnedReject: (error: unknown) => void = () => undefined;
  const spawned = new Promise<void>((resolve, reject) => {
    spawnedResolve = resolve;
    spawnedReject = reject;
  });
  spawned.catch(() => undefined);
  const webReady = (async () => {
    const remembered = rememberedWebPort();
    launch = await withStableWebPort(await prepareLaunch(remembered), remembered);
    const at = launch;
    const facts = known.then(() => {
      // The first screen's data kept at the last quit, when the database is
      // as the API left it then (./launch-cache.ts): checked before the API
      // opens it (an API spawned early reads this first: serve.py).
      const cacheKey = launchCacheKey(app.getVersion(), where.webDir, PRODUCT.id, account?.email ?? null);
      const launchCache = usableLaunchCache(dataDir(), cacheKey);
      // Signed out: the API is told so as it starts, and nothing is handed
      // over once it answers (apiEnv). A sign-in made later is pushed as always.
      const signedIn = account !== null;
      const firstRoute = pendingAtLaunch.length ? openRouteFor(pendingAtLaunch) : HOME_ROUTE;
      return {
        signedIn,
        api: {
          ...apiEnv(where, at, startedInBackground(), pendingAtLaunch.length > 0, documentsToImport(pendingAtLaunch), {
            signedIn,
            localFiles: nameLocalFilesAtStart(pendingAtLaunch.filter((document) => fs.existsSync(document))),
          }),
          MRAI_DESKTOP_LAUNCH_CACHE_KEY: cacheKey,
        },
        web: {
          // A document double-clicked to start the app opens the open route.
          // Then a notebook's page, which both lead to (the remembered
          // notebook, ../../web/lib/desktop-landing.ts): its server code
          // loaded before the window asks for it. Any id: the page is drawn
          // in the window.
          ...webEnv(where, at, firstRoute, firstRoute === OPEN_ROUTE || firstRoute === HOME_ROUTE ? [NOTEBOOK_WARM_ROUTE] : []),
          ...(launchCache ? { MRAI_DESKTOP_LAUNCH_CACHE: launchCache } : {}),
        },
      };
    });
    facts.catch(() => undefined);
    // Spawned at the ready: everything is known by then.
    const ready = early ? null : await facts;
    const children: Service[] = [];
    // Both at once: the web server needs nothing of the API to start, and
    // the API's import is most of a launch (seconds the web server used to wait).
    apiStarting = startService(
      "api",
      where.python,
      // app/desktop/serve.py: the Windows stand-ins first, then uvicorn; it
      // ends itself when this process does, even after a crash.
      ["-m", "app.desktop.serve", "--host", "127.0.0.1", "--port", String(at.apiPort), "--parent-pid", String(process.pid)],
      {
        cwd: where.apiDir,
        env: ready ? ready.api : splitLateEnv(apiEnv(where, at), API_LATE_ENV).now,
        ...(ready ? {} : { lateEnv: facts.then((known) => splitLateEnv(known.api, API_LATE_ENV).late) }),
        ready: { url: `${at.apiOrigin}/health` },
        timeoutMs: 300_000,
        onSpawn: (child) => children.push({ name: "api", child, log: "" }),
      },
    );
    const webEntry = path.join(where.webDir, "desktop-server.mjs");
    const webStarting = startService("web", where.node, [webEntry], {
      cwd: where.webDir,
      env: ready ? ready.web : splitLateEnv(webEnv(where, at, undefined, [NOTEBOOK_WARM_ROUTE]), WEB_LATE_ENV).now,
      ...(ready ? {} : { lateEnv: facts.then((known) => splitLateEnv(known.web, WEB_LATE_ENV).late) }),
      ready: /mrai-desktop-web ready/,
      timeoutMs: where.development ? 600_000 : 180_000,
      onSpawn: (child) => {
        children.push({ name: "web", child, log: "" });
        recordWebServer(child.pid, at.webPort);
      },
    });
    apiStarting.catch(() => undefined);
    let signedInAtStart: boolean;
    try {
      ({ signedIn: signedInAtStart } = ready ?? (await facts));
    } catch (error) {
      // This launch quits instead (another copy of the app runs): what it
      // spawned early goes at once.
      for (const service of children) stopService(service);
      spawnedReject(error);
      throw error;
    }
    // Both processes are on their way and the app is ready: what the shell
    // does next (the window) no longer holds them up.
    spawnedResolve();
    apiStarted = apiStarting.then((service) => {
      api = service;
      watchService(service);
      markApiUp();
      // Not awaited: the API holds the windows' requests until it is answered
      // (pushAccountToApi). Signed out at its start, it was told so then.
      if (signedInAtStart) void pushAccountToApi(false);
    });
    // Handled where the launch goes on (whenReady), once the window is made.
    apiStarted.catch(() => undefined);
    try {
      web = await webStarting;
    } catch (error) {
      // The API is stopped with the launch.
      void apiStarting.then(stopService, () => undefined);
      throw error;
    }
    watchService(web);
  })();
  webReady.catch((error) => spawnedReject(error));
  return { spawned, webReady };
}

function watchService(service: Service): void {
  service.child.once("exit", (code) => {
    if (quitting) return;
    countUsage("service_crashes");
    void serviceStopped(service.name, code);
  });
}

async function serviceStopped(name: string, code: number | null): Promise<void> {
  console.error(`[classic] ${name} stopped (${code})`);
  if (HIDDEN) {
    app.quit();
    return;
  }
  const choice = await dialog.showMessageBox({
    type: "error",
    buttons: [say("重新启动", "Restart"), say("退出", "Quit")],
    defaultId: 0,
    message: say(`${appName()} 的后台服务意外停止了`, `A background part of ${appName()} stopped`),
    detail: say(
      `「${name}」已退出（${code ?? "?"}）。重新启动后会回到刚才打开的文件，已保存的内容不会丢失。日志在：${app.getPath("logs")}`,
      `"${name}" exited (${code ?? "?"}). Restarting returns you to your pages; saved work is kept. Logs: ${app.getPath("logs")}`,
    ),
  });
  if (choice.response === 0) {
    app.relaunch();
  }
  app.quit();
}

/** Windows: the API was asked to stop at this quit (will-quit). */
let apiAskedToStop = false;
/** How long a quit waits for the API to stop on its own (Windows). */
const API_STOP_MS = 7_000;

function stopServices(): void {
  quitting = true;
  stopVibeChecker?.();
  stopVibeChecker = null;
  for (const service of [web, api]) if (service) stopService(service);
  // Quit while the API was still starting: it goes as soon as it has.
  if (!api && apiStarting) void apiStarting.then(stopService, () => undefined);
}

// --- session ---------------------------------------------------------------------------

async function configureSession(ses: Session): Promise<void> {
  if (!launch) return;
  await ses.cookies.set({
    url: launch.webOrigin,
    name: SHELL_COOKIE,
    value: launch.shellSecret,
    httpOnly: true,
    sameSite: "strict",
  });
  ses.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      allowPermission(
        {
          permission,
          kind: "request",
          requesting: details.requestingUrl,
          topLevel: contents.getURL(),
          mediaTypes: "mediaTypes" in details ? details.mediaTypes : undefined,
          externalUrl: "externalURL" in details ? details.externalURL : undefined,
        },
        launch!.webOrigin,
      ),
    ),
  );
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    allowPermission(
      {
        permission,
        kind: "check",
        notificationsAllowed: false,
        requesting: requestingOrigin,
        topLevel: contents?.getURL() ?? details.embeddingOrigin,
        mediaTypes: details.mediaType && details.mediaType !== "unknown" ? [details.mediaType] : undefined,
      },
      launch!.webOrigin,
    ),
  );
  ses.setDevicePermissionHandler(() => false);
  // Exports: the save dialog starts at the file the window opened (saving
  // back over it, after the system asks to replace), else in Documents.
  ses.on("will-download", (_event, item, contents) => {
    const original = contents ? originalFor(contents.id, item.getFilename()) : null;
    item.setSaveDialogOptions({
      defaultPath: original ?? path.join(app.getPath("documents"), item.getFilename()),
    });
  });
  ses.setUserAgent(`${ses.getUserAgent()} ${PRODUCT.userAgent}/${app.getVersion()}`);
  if (PRODUCT.surface === "office") pinOfficeSurface(ses);
}

/**
 * MR Office: every page document of the app's origin loads on the office
 * surface, and the office host's landing pages lead to the most recent
 * notebook (./surface.ts). Nothing a page links to, types or bookmarks
 * turns the app into MR Note.
 */
function pinOfficeSurface(ses: Session): void {
  if (!launch) return;
  const origin = launch.webOrigin;
  // Every URL, page documents only; officeSurfaceRedirect leaves any other
  // origin alone (a match pattern's port is not one Chromium filters on).
  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"], types: ["mainFrame", "subFrame"] }, (details, callback) => {
    if (details.resourceType !== "mainFrame" && details.resourceType !== "subFrame") {
      callback({});
      return;
    }
    const redirectURL = officeSurfaceRedirect(details.url, origin, details.method);
    callback(redirectURL ? { redirectURL } : {});
  });
}

// --- lifecycle ---------------------------------------------------------------------------

{
  // Before the app is ready, as Electron requires (./instant-view.ts).
  registerInstantScheme();
  app.setName(APP_RUNTIME_NAME);
  // Its own folder: never the online app's (cookies, window state, data).
  // An unpackaged run (automated checks, benchmarks), or a packed test build
  // whose update feed is this computer (scripts/classic-update-check.mjs),
  // may name another one, so a test's imports never land in the person's
  // own notebooks and its single-instance lock is its own.
  const dataArgument = process.argv.find((argument) => argument.startsWith("--user-data-dir="));
  const testData = dataArgument ? path.resolve(dataArgument.slice("--user-data-dir=".length)) : !app.isPackaged ? process.env.MRAI_CLASSIC_USER_DATA : undefined;
  app.setPath("userData", testData || path.join(app.getPath("appData"), APP_RUNTIME_NAME));
  // Its logs go with it: a test run must not append to (or turn over) the
  
  if (testData) app.setAppLogsPath(path.join(testData, "logs"));
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 MRNote. The editors: GNU AGPL-3.0",
    ...(PRODUCT.id === "office" ? { website: "https://mroffice.ai" } : {}),
  });
  
  // packaged macOS app declares the scheme in its Info.plist, which is all
  // Launch Services needs. A development run must not register on macOS: the
  // arguments are dropped there, so the bare Electron.app would become the
  // handler and every sign-in would open Electron's default window.
  if (process.platform === "win32" && !app.isDefaultProtocolClient(CLASSIC_PROTOCOL)) {
    if (process.defaultApp && process.argv[1]) {
      app.setAsDefaultProtocolClient(CLASSIC_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(CLASSIC_PROTOCOL);
    }
  }

  app.on("web-contents-created", (_event, contents) => guardContents(contents));

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    openDocuments([filePath]);
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleLink(url);
  });
  app.on("second-instance", (_event, argv, _workingDirectory, handed) => {
    const args = argv.slice(1);
    const handedOver = (key: "documents" | "links"): string[] => {
      const value = (handed as Record<string, unknown> | null | undefined)?.[key];
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    };
    // Windows names a document both in the second launch's arguments and in
    // what it hands over (taken from the same arguments): once each, or the
    // file was imported twice. macOS hands it over only.
    const links = [...new Set(linksFromArgv([...args, ...handedOver("links")]))];
    const documents = [...new Set(openablePathsFromArgv([...args, ...handedOver("documents")]))];
    links.forEach(handleLink);
    if (documents.length) openDocuments(documents);
    if (links.length || documents.length) return;
    // The login's background start, the app already running: nothing to do.
    if (args.includes(BACKGROUND_ARG)) return;
    // Started again with nothing to open: this app comes forward.
    const window = pageWindows.target();
    if (window) bringForward(window);
    else if (ready) openHomeWindow();
  });
  app.on("before-quit", quitWhenSettled);
  // Every window closed (each page settled or its person chose to leave):
  // only now do the services stop.
  app.on("will-quit", (event) => {
    // No AI app reaches a quitting app: its endpoint and discovery file go first.
    aiScreen.stop();
    // Windows has no SIGTERM: the API is asked to stop and given a moment,
    // so its shutdown runs as on macOS (the launch cache is kept there:
    // ./launch-cache.ts) instead of a forced kill.
    if (process.platform === "win32" && api && launch && !apiAskedToStop) {
      apiAskedToStop = true;
      event.preventDefault();
      const service = api;
      const origin = launch.apiOrigin;
      const headers = { origin: launch.webOrigin, "x-mrai-desktop-launch": launch.launchToken };
      void stopServiceGracefully(
        service,
        () => fetch(`${origin}/api/v1/desktop/shutdown`, { method: "POST", headers, signal: AbortSignal.timeout(2_000) }),
        API_STOP_MS,
      ).finally(() => app.quit());
      return;
    }
    stopServices();
  });
  setSettleBeforeInstall(async () => {
    await settleEdits(BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed()).map((window) => window.webContents));
    quitSettled = true;
  });
  // Ended by a signal (a launcher, a terminal): the same orderly quit.
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => app.quit());
  app.on("before-quit", () => {
    leaving = true;
  });
  app.on("window-all-closed", () => {
    // macOS keeps the app (and its services) until Quit, like a document app.
    if (process.platform === "darwin") {
      prepareSpare();
      return;
    }
    // Windows keeps it in the tray, unless the person turned that off
    // (./tray.ts): opened again, it is there at once.
    if (keepInTrayOnClose()) {
      void showAppTray();
      prepareSpare();
      return;
    }
    app.quit();
  });
  app.on("activate", () => {
    if (!ready || takeSpare()) return;
    if (!BrowserWindow.getAllWindows().some((window) => window !== splash)) createWindow(HOME_ROUTE);
  });

  // macOS: the services are spawned now, as this code loads, not at the
  
  // the API's import, most of a launch, waiting behind it. What only the
  // ready brings (the documents macOS hands over just before it, a start in
  // the background, the sign-in) reaches them then (startServices' late
  // environment), before either uses any of it. Windows (a second launch
  // for every document opened while the app runs, which must not start
  // services of its own): at the ready, as before.
  let knownResolve: () => void = () => undefined;
  let knownReject: (error: unknown) => void = () => undefined;
  const known = new Promise<void>((resolve, reject) => {
    knownResolve = resolve;
    knownReject = reject;
  });
  known.catch(() => undefined);
  let services: ReturnType<typeof startServices> | null = null;
  if (process.platform === "darwin") {
    // Its logs folder named now (the default one), before the ready, which
    // would have named it: the services' logs go there.
    if (!testData) app.setAppLogsPath();
    where = layout();
    services = startServices(known, true);
  }

  void app.whenReady().then(async () => {
    // One app per data folder: the lock lives in it, so another copy of the
    // app on the disk (an older one, the other processor's build, a mounted
    // disk image) that the system starts for a document finds this one too.
    // Asked only now, once macOS has handed this launch its documents and
    // links (open-file / open-url, before ready, never in argv): a second
    // launch passes them to the first and quits, instead of opening a second
    // app on the same notebooks.
    if (!app.requestSingleInstanceLock({ documents: pendingAtLaunch, links: linksAtLaunch })) {
      // Services spawned early end with this launch.
      knownReject(new Error("another copy of the app runs"));
      app.quit();
      return;
    }
    if (!services) where = layout();
    console.log(`[classic] starting ${PRODUCT.id} (${where.development ? "development" : "packaged layout"}, data in ${app.getPath("userData")})`);
    // The AI screen's endpoint at once (an AI app started with the app waits
    // for it, some only 10 s): its tools wait for the windows.
    void aiScreen.start().catch((error: unknown) =>
      console.error(`[classic] AI screen not started: ${error instanceof Error ? error.message : error}`),
    );
    account = readAccount();
    // The day's usage counts, sent while signed in and "Send usage
    // statistics" is on (./usage-report.ts).
    startUsageReports({ cloudOrigin: cloudOrigin(), localModelDir: localModelDir() });
    // An unpackaged build only (automated checks, or a developer trying the
    // AI against a local service): a token handed in, never saved.
    if (!app.isPackaged && process.env.MRAI_CLASSIC_TEST_AI_TOKEN) {
      account = {
        token: process.env.MRAI_CLASSIC_TEST_AI_TOKEN,
        email: "test@example.com",
        displayName: "Test",
        plan: process.env.MRAI_CLASSIC_TEST_AI_PLAN || "free",
      };
    }
    ensureProfile();
    
    // the person turned it off (./prelaunch.ts).
    applyPrelaunchDefault(APP_ID);
    // The services start at once with the saved profile (or the build's); a
    // fresh one fetched meanwhile is applied to the running API when it is up
    // (refreshProfile's reload). Waiting for the fetch first cost up to 5 s of
    
    const profileRefresh = fetchFreshProfile().catch(() => false);
    // The services are started before the splash is drawn: its window took
    
    // import is most of a launch.
    // Started at login to be ready in the background (./prelaunch.ts): the
    // services only, no window and no Dock icon until the app is opened.
    const background = startedInBackground();
    if (background && process.platform === "darwin") app.dock?.hide();
    // Windows: no window, so the tray says the app is there (and quits it).
    if (background && trayAvailable()) void showAppTray();
    // The window as soon as both services are spawned (making it first held
    // the API's start up by its 0.1-0.3 s), covered by its instant view
    // (./instant-view.ts: the home as it was last shown, or a double-clicked
    // deck's first slide) while the web server and the API start; its page
    // loads underneath once the web server serves. Nothing to show yet (a
    // first launch): the splash, and the window once the web server serves,
    // as before.
    let early: ReturnType<typeof earlyWindow> = null;
    knownResolve();
    services ??= startServices(known, false);
    const servicesStarting = services.webReady;
    void services.spawned.then(() => {
      if (background) return;
      try {
        early = earlyWindow();
      } catch (error) {
        console.error(`[classic] no instant view: ${error instanceof Error ? error.message : error}`);
      }
      if (!early) showSplash();
      // A packed app's Dock and window icons come from its bundle
      // (build/classic/icon.icns, .ico); an unpacked run shows Classic's too,
      // set once the services are on their way: 0.12-0.15 s of the main
      // thread, which an unpacked launch's timing spent ahead of them.
      if (!app.isPackaged && process.platform === "darwin" && fs.existsSync(path.join(__dirname, "..", "..", PRODUCT.iconDir, "icon.png"))) {
        app.dock?.setIcon(path.join(__dirname, "..", "..", PRODUCT.iconDir, "icon.png"));
      }
    }, () => undefined);
    let failed = false;
    const couldNotStart = async (error: unknown): Promise<void> => {
      if (failed) return;
      failed = true;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[classic] could not start: ${detail}`);
      if (!HIDDEN) {
        await dialog.showMessageBox({
          type: "error",
          message: say(`${appName()} 无法启动`, `${appName()} could not start`),
          detail,
        });
      }
      stopServices();
      app.quit();
    };
    try {
      // The web server only: the window is made while the API still starts.
      await servicesStarting;
    } catch (error) {
      await couldNotStart(error);
      return;
    }
    void apiStarted.catch(couldNotStart);
    // A profile fetched while the services started: the API takes it now.
    void profileRefresh.then((saved) => (saved ? reloadProfile() : undefined));
    await configureSession(session.defaultSession);
    // The API's PDF exports, drawn by the editor in this app's Chromium (./printer.ts).
    if (printerEnabled()) void startPrinter(launch!);
    // The AI's windows checked, and shared windows' actions run, in this app's Chromium (./vibe-checker.ts).
    // In a process of its own, with the site checker's network rules (./vibe-checker-process.ts).
    if (vibeCheckerEnabled()) stopVibeChecker = startVibeCheckerProcess(launch!, where.vibeRuntimeDir, where.pyodideDir);
    void startAgentControl(launch!);
    ready = true;
    Menu.setApplicationMenu(
      buildMenu({
        origin: launch!.webOrigin,
        appName: APP_NAME,
        openInBrowser: false,
        newWindow: (route) => openHomeWindow(route === "/app" ? HOME_ROUTE : route),
        checkForUpdates: checkForUpdatesNow,
        appItems: [
          ...(prelaunchAvailable()
            ? [
                {
                  type: "checkbox" as const,
                  label: say("登录时在后台准备好（打开更快）", "Ready in the Background at Login"),
                  checked: prelaunchEnabled(APP_ID),
                  click: (item: Electron.MenuItem) => {
                    try {
                      choosePrelaunch(APP_ID, item.checked);
                    } catch (error) {
                      console.error(`[classic] login item not changed: ${error instanceof Error ? error.message : error}`);
                      item.checked = !item.checked;
                    }
                  },
                },
              ]
            : []),
          ...(trayAvailable()
            ? [
                {
                  type: "checkbox" as const,
                  label: say("关闭窗口后在托盘中继续运行（打开更快）", "Keep Running in the Tray When Closed"),
                  checked: keepInTrayOnClose(),
                  click: (item: Electron.MenuItem) => {
                    try {
                      setKeepInTrayOnClose(item.checked);
                    } catch (error) {
                      console.error(`[classic] tray setting not saved: ${error instanceof Error ? error.message : error}`);
                      item.checked = !item.checked;
                    }
                  },
                },
              ]
            : []),
        ],
        helpItems: [
          {
            label: say("许可证", "License"),
            click: () => void shell.openExternal("https://www.gnu.org/licenses/agpl-3.0.html"),
          },
        ],
      }),
    );
    const launchDocuments = pendingAtLaunch;
    const links = linksAtLaunch;
    pendingAtLaunch = [];
    linksAtLaunch = [];
    const made = early as ReturnType<typeof earlyWindow>;
    if (made) {
      // Documents that arrived since it was made go to it too.
      const later = launchDocuments.filter((document) => !made.documents.includes(document));
      if (later.length) {
        const id = made.window.webContents.id;
        pendingByContents.set(id, [...(pendingByContents.get(id) ?? []), ...later]);
        originalsByContents.set(id, [...(originalsByContents.get(id) ?? []), ...later]);
      }
      // The home's window now takes documents: it opens them (the open page).
      const route = launchDocuments.length ? openRouteFor(launchDocuments) : made.route;
      if (!made.window.isDestroyed()) void made.window.loadURL(appUrl(route));
    } else if (launchDocuments.length) createWindow(openRouteFor(launchDocuments), launchDocuments);
    else if (!background) createWindow(HOME_ROUTE);
    // Started in the background at login: the spare home window, made once
    // the API's start has settled, as after the last window has closed. The
    // first document opened after login then goes to a loaded notebook
    // page, imported where it is, instead of a window made then that loads
    // the open route and the notebook (2-2.7 s of a first open before its
    
    else void apiStarted.then(untilApiStartSettled).then(prepareSpare, () => undefined);
    links.forEach(handleLink);
    // LibreOffice is fetched in the background once the app is up, so it is
    
    setTimeout(() => prefetchLibreOffice(libreOfficeContext), 15_000);
    
    // 网页版怎么开，本地版就怎么开): a switch turned on the site, or one a
    // release adds, reaches a running app within the half hour, applied live
    // (POST /desktop/profile/reload), not at its next start only. A start
    // before the release that added 35 switches ran the evening without them.
    setInterval(() => void refreshProfile().catch(() => undefined), PROFILE_REFRESH_MS).unref();
    if (account && !process.env.MRAI_CLASSIC_TEST_AI_TOKEN) {
      // The token may have been revoked from the site meanwhile.
      void refreshAccount(cloudOrigin(), account).then(async (latest) => {
        if (latest === "offline") return;
        account = latest;
        if (latest) saveAccount(latest);
        else forgetAccount();
        await pushAccountToApi();
      });
    }
    // On macOS the app installs its updates itself (../mac-self-update.ts).
    if (app.isPackaged) {
      startUpdateChecks({ displayName: APP_NAME, macSelfInstall: true, hidden: HIDDEN, betaChannel: PRODUCT.betaChannel });
    }
  });
}
