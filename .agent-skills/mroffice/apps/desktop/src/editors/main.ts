/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * MR Office Editors without the MR Office component (src/component.ts): the
 * open-source editors in a desktop app. A Word, Excel or PowerPoint file
 * opened here says where the free component is, which opens them.
 *
 * The windows show the editors' own page (the playground's build, served by
 * editors-server.ts), the same page as in a browser tab. What the app adds is
 * what a browser tab cannot: documents opened from the system (a
 * double-click, Open With, the command line, a drop on the window) and saved
 * back into the same file, the native menus and shortcuts, recent files, and
 * a window per person's choice.
 *
 * Nothing here talks to a server: no account, no update feed, no telemetry.
 * Links to the web open in the default browser.
 *
 * Security:
 * - every page runs sandboxed with context isolation and no Node; the page
 *   reaches the app only through the preload bridge (preload.ts), and the
 *   app answers only the main frame of the editors' own origin;
 * - only the editors' pages load in a window (navigation.ts); the page names
 *   files by handles and never sees a path; it writes only to a file it was
 *   given or one the person chose in a Save dialog;
 * - the editors' page gets the web permissions its editors use, nothing else
 *   does (permissions.ts).
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
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
  type IpcMainInvokeEvent,
  type Session,
  type WebContents,
} from "electron";

import { COMPONENT_RELEASES_URL, componentState } from "../component";
import { APP_DISPLAY_NAME, APP_ID } from "./brand";
import { showContextMenu } from "../context-menu";
import { FocusOrder } from "../document-target";
import { startEditorsServer, type EditorsServer } from "./editors-server";
import { OPENABLE_EXTENSIONS, isOpenablePath, openablePathsFromArgv, readOpenedFiles, safeFileName, saveTarget, writeFileAtomically } from "./files";
import { buildMenu } from "./menu";
import { classifyNavigation, classifyWindowOpen, isAppUrl } from "./navigation";
import { allowPermission } from "../permissions";

// (--user-data-dir=<folder> is read by src/entry.ts)

/** Open windows without bringing the app to the front (`open -g`, scripts). */
const BACKGROUND = process.env.MROFFICE_EDITORS_BACKGROUND === "1";

/** The editors' build: in the package, its resources; from source, the
 * playground's (npm run build at the repository's root). */
const EDITORS_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "editors")
  : path.resolve(process.env.MROFFICE_EDITORS_DIST ?? path.join(__dirname, "..", "..", "..", "playground", "dist"));

let server: EditorsServer | null = null;
const origin = () => server?.origin ?? "http://127.0.0.1";

/** Word, Excel and PowerPoint files (and their OpenDocument kin): the component's. */
const OFFICE_FILE = /\.(docx|docm|doc|dotx|dotm|dot|rtf|odt|xlsx|xlsm|xlsb|xls|xltx|xltm|ods|pptx|pptm|ppt|potx|potm|pot|ppsx|ppsm|pps|odp)$/i;

function officePathsFromArgv(argv: readonly string[], cwd = process.cwd()): string[] {
  return argv.filter((argument) => argument && !argument.startsWith("-") && OFFICE_FILE.test(argument)).map((argument) => path.resolve(cwd, argument));
}

/** Documents waiting for the window that will show them, by webContents id. */
const pendingByContents = new Map<number, string[]>();
/** Documents that arrived before the app was ready. */
let pendingAtLaunch: string[] = [...openablePathsFromArgv(process.argv.slice(1)), ...officePathsFromArgv(process.argv.slice(1))];
/** Menu commands for a window whose page has not asked for them yet. */
const commandsByContents = new Map<number, string[]>();
let ready = false;

const zh = () => app.getLocale().toLowerCase().startsWith("zh");

// --- windows -------------------------------------------------------------

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

function securePreferences(): BrowserWindowConstructorOptions["webPreferences"] {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    spellcheck: true,
  };
}

function reveal(window: BrowserWindow): void {
  if (BACKGROUND) {
    window.showInactive();
    return;
  }
  if (window.isMinimized()) window.restore();
  window.show();
}

/** The app's windows, last focused last: a document opened from the system
 * while the app runs goes to the one in use. */
const pageWindows = new FocusOrder<BrowserWindow>();

function bringForward(window: BrowserWindow): void {
  reveal(window);
  if (BACKGROUND) return;
  window.focus();
  if (process.platform === "darwin") app.focus({ steal: true });
}

function createWindow(documents: string[] = [], commands: string[] = []): BrowserWindow {
  const state = readWindowState();
  const others = BrowserWindow.getAllWindows().length;
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x + others * 24, y: state.y + others * 24 } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_DISPLAY_NAME,
    backgroundColor: "#f3f7f6",
    // Windows and Linux: the editors have their own ribbons; Alt shows the menu bar.
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: securePreferences(),
  });
  if (state.maximized && others === 0) window.maximize();
  const contents = window.webContents;
  if (documents.length) pendingByContents.set(contents.id, documents);
  if (commands.length) commandsByContents.set(contents.id, commands);

  window.once("ready-to-show", () => reveal(window));
  window.on("close", () => rememberWindowState(window));
  pageWindows.add(window);
  window.on("focus", () => pageWindows.focused(window));
  window.on("closed", () => {
    pageWindows.remove(window);
    pendingByContents.delete(contents.id);
    commandsByContents.delete(contents.id);
  });
  let lastCrashReload = 0;
  contents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit" || Date.now() - lastCrashReload < 30_000) return;
    lastCrashReload = Date.now();
    contents.reload();
  });

  void window.loadURL(`${origin()}/`);
  return window;
}

// --- every page: navigation, popups, leaving with unsaved work -------------

function guardContents(contents: WebContents): void {
  const route = (url: string, event: { preventDefault(): void }) => {
    const verdict = classifyNavigation(url, origin());
    if (verdict.kind === "app") return;
    event.preventDefault();
    if (verdict.kind === "external") void shell.openExternal(url);
  };
  contents.on("will-navigate", (event) => route(event.url, event));
  contents.on("will-redirect", (event) => {
    if (event.isMainFrame) route(event.url, event);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());

  contents.setWindowOpenHandler(({ url }) => {
    const verdict = classifyWindowOpen(url, origin());
    if (verdict.kind === "popup" && isAppUrl(contents.getURL(), origin())) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: "#ffffff", webPreferences: securePreferences() },
      };
    }
    if (verdict.kind === "external") void shell.openExternal(url);
    return { action: "deny" };
  });

  // A page asking to stay (unsaved changes): ask the person, as a browser
  // does; Electron would otherwise keep the window open without a word.
  contents.on("will-prevent-unload", (event) => {
    const options = {
      type: "question" as const,
      buttons: zh() ? ["不保存，离开", "留下"] : ["Leave Without Saving", "Stay"],
      defaultId: 1,
      cancelId: 1,
      message: zh() ? "有未保存的更改。" : "You have unsaved changes.",
      detail: zh() ? "离开后，这些更改将丢失。" : "If you leave, they will be lost.",
    };
    const owner = BrowserWindow.fromWebContents(contents);
    const choice = owner ? dialog.showMessageBoxSync(owner, options) : dialog.showMessageBoxSync(options);
    if (choice === 0) event.preventDefault();
  });

  contents.on("context-menu", (_event, params) => showContextMenu(contents, params));
}

// --- the MR Office component ----------------------------------------------------

/** Say why these files did not open, and where the free component is. */
function componentNeeded(names: readonly string[], window?: BrowserWindow | null): void {
  const state = componentState();
  const listed = names.slice(0, 3).map((name) => path.basename(name)).join(", ") + (names.length > 3 ? ` (+${names.length - 3})` : "");
  const where = path.join(app.getPath("userData"), "component");
  const options = {
    type: "info" as const,
    buttons: zh() ? ["获取 MR Office 组件", "好"] : ["Get the MR Office Component", "OK"],
    defaultId: 0,
    cancelId: 1,
    message: names.length
      ? zh()
        ? `打开 ${listed} 需要 MR Office 组件。`
        : `${listed}: Word, Excel and PowerPoint files open with the MR Office component.`
      : zh()
        ? "MR Office 组件不可用。"
        : "The MR Office component is not available.",
    detail:
      (state?.kind === "unusable"
        ? zh()
          ? `${state.root} 中的组件不可用：${state.reason}。\n\n`
          : `The component in ${state.root} cannot be used: ${state.reason}.\n\n`
        : "") +
      (zh()
        ? `该组件免费（不开源），在 GitHub Releases 下载与本应用版本对应的组件，解压到：\n${where}\n然后重新打开 ${APP_DISPLAY_NAME}。`
        : `The component is free (not open source). Download the one for this version of the app from GitHub Releases, unpack it into:\n${where}\nand open ${APP_DISPLAY_NAME} again.`),
  };
  const choice = window && !window.isDestroyed() ? dialog.showMessageBoxSync(window, options) : dialog.showMessageBoxSync(options);
  if (choice === 0) void shell.openExternal(COMPONENT_RELEASES_URL);
}

// --- documents from the system ----------------------------------------------

function remember(filePath: string): void {
  if (process.platform === "darwin" || process.platform === "win32") app.addRecentDocument(filePath);
}

/** Documents go to the window in use (a new one when there is none). */
function openDocuments(paths: string[], into?: BrowserWindow | null): void {
  if (!ready) {
    pendingAtLaunch.push(...paths);
    return;
  }
  const office = paths.filter((item) => OFFICE_FILE.test(item) && !isOpenablePath(item));
  if (office.length) componentNeeded(office, into ?? pageWindows.target());
  const documents = paths.filter((item) => isOpenablePath(item) && fs.existsSync(item));
  if (!documents.length) return;
  const target = into && !into.isDestroyed() ? into : pageWindows.target();
  if (!target) {
    createWindow(documents);
    return;
  }
  const contents = target.webContents;
  pendingByContents.set(contents.id, [...(pendingByContents.get(contents.id) ?? []), ...documents]);
  contents.send("editors:files-waiting");
  bringForward(target);
}

async function showOpenDialog(window: BrowserWindow | null): Promise<void> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: zh() ? "编辑器能打开的文件" : "Files the editors open", extensions: [...new Set(OPENABLE_EXTENSIONS.map((extension) => extension.split(".").pop() ?? ""))].filter(Boolean) },
      { name: zh() ? "所有文件" : "All Files", extensions: ["*"] },
    ],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (!result.canceled) openDocuments(result.filePaths, window);
}

// --- the page's bridge ----------------------------------------------------

function fromEditors(event: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && isAppUrl(frame.url, origin()));
}

/** The files a window holds, by the handles it names them with. */
const handles = new Map<string, { path: string; contentsId: number }>();

function issueHandle(contents: WebContents, filePath: string): string {
  for (const [handle, entry] of handles) if (entry.contentsId === contents.id && entry.path === filePath) return handle;
  const handle = randomUUID();
  handles.set(handle, { path: filePath, contentsId: contents.id });
  return handle;
}

app.on("web-contents-created", (_event, contents) => {
  contents.once("destroyed", () => {
    for (const [handle, entry] of handles) if (entry.contentsId === contents.id) handles.delete(handle);
  });
});

ipcMain.handle("editors:take-open-files", async (event) => {
  if (!fromEditors(event)) return { files: [], refused: [], commands: [] };
  const paths = pendingByContents.get(event.sender.id) ?? [];
  const commands = commandsByContents.get(event.sender.id) ?? [];
  pendingByContents.delete(event.sender.id);
  commandsByContents.delete(event.sender.id);
  const opened = await readOpenedFiles(paths, (filePath) => {
    remember(filePath);
    return issueHandle(event.sender, filePath);
  });
  return { ...opened, commands };
});

ipcMain.handle("editors:open-dialog", async (event) => {
  if (!fromEditors(event)) return;
  await showOpenDialog(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle("editors:open-paths", async (event, paths: unknown) => {
  if (!fromEditors(event) || !Array.isArray(paths)) return 0;
  const documents = paths.filter((item): item is string => typeof item === "string" && path.isAbsolute(item) && (isOpenablePath(item) || OFFICE_FILE.test(item)));
  openDocuments(documents, BrowserWindow.fromWebContents(event.sender));
  return documents.length;
});

ipcMain.handle("editors:save", async (event, request: unknown) => {
  if (!fromEditors(event) || !request || typeof request !== "object") throw new Error("refused");
  const { handle, name, bytes, saveAs } = request as Record<string, unknown>;
  if (!(bytes instanceof Uint8Array)) throw new Error("refused");
  const entry = typeof handle === "string" ? handles.get(handle) : undefined;
  const opened = entry && entry.contentsId === event.sender.id ? entry.path : null;
  const target = saveTarget(opened, safeFileName(name), { saveAs: saveAs === true, documentsFolder: app.getPath("documents") });
  let filePath: string;
  if (target.kind === "write") {
    filePath = target.path;
  } else {
    const window = BrowserWindow.fromWebContents(event.sender);
    const extension = path.extname(target.defaultPath).slice(1);
    const options: Electron.SaveDialogOptions = {
      defaultPath: target.defaultPath,
      ...(extension ? { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] } : {}),
    };
    const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (chosen.canceled || !chosen.filePath) return null;
    filePath = chosen.filePath;
  }
  const written = await writeFileAtomically(filePath, bytes);
  remember(filePath);
  return { handle: issueHandle(event.sender, filePath), name: path.basename(filePath), written };
});

ipcMain.on("editors:edited", (event, edited: unknown) => {
  if (!fromEditors(event) || process.platform !== "darwin") return;
  BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(edited === true);
});

// --- the session ------------------------------------------------------------

function configureSession(ses: Session): void {
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
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
        origin(),
      ),
    );
  });
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
      origin(),
    ),
  );
  ses.setDevicePermissionHandler(() => false);
  // Exports and downloads: the save dialog starts in Downloads.
  ses.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
  });
}

// --- lifecycle --------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({ applicationName: APP_DISPLAY_NAME, applicationVersion: app.getVersion() });

  app.on("web-contents-created", (_event, contents) => guardContents(contents));

  app.on("open-file", (event, filePath) => {
    // macOS: a document opened with the app, before or after it is ready.
    event.preventDefault();
    openDocuments([filePath]);
  });

  app.on("second-instance", (_event, argv, workingDirectory) => {
    // Windows and Linux (and a second start from a shell): the second process
    // hands its arguments here and quits.
    const documents = [...openablePathsFromArgv(argv.slice(1), workingDirectory), ...officePathsFromArgv(argv.slice(1), workingDirectory)];
    if (documents.length) {
      openDocuments(documents);
      return;
    }
    const window = pageWindows.target();
    if (window) bringForward(window);
    else createWindow();
  });

  void app.whenReady().then(async () => {
    try {
      server = await startEditorsServer(EDITORS_ROOT, app.getPath("userData"));
    } catch {
      dialog.showErrorBox(
        APP_DISPLAY_NAME,
        `The editors are not built (no index.html in ${EDITORS_ROOT}). Run "npm run build" at the repository's root first.`,
      );
      app.exit(1);
      return;
    }
    ready = true;
    configureSession(session.defaultSession);
    Menu.setApplicationMenu(
      buildMenu({
        newWindow: () => createWindow(),
        open: (window) => void showOpenDialog(window),
        command: (window, command) => {
          const target = window ?? pageWindows.target();
          if (target) target.webContents.send("editors:command", command);
          // macOS, no window open: File > New opens one with the new file
          else if (command.startsWith("new:")) createWindow([], [command]);
        },
      }),
    );
    const launch = pendingAtLaunch;
    pendingAtLaunch = [];
    const window = createWindow(launch.filter(isOpenablePath));
    const office = launch.filter((item) => OFFICE_FILE.test(item) && !isOpenablePath(item));
    if (office.length) window.once("ready-to-show", () => componentNeeded(office, window));
    else if (componentState()?.kind === "unusable") window.once("ready-to-show", () => componentNeeded([], window));
  });

  app.on("activate", () => {
    if (ready && BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("will-quit", () => {
    void server?.close();
  });
}
