/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * "Download and enable LibreOffice" in MR Note Classic (docs/desktop-classic.md).
 *
 * Old Office formats (.doc/.xls/.ppt), OpenDocument and RTF files, EMF/WMF
 * pictures and ODF exports need LibreOffice. The app ships none; when a page
 * needs it, its prompt offers to fetch one (libreoffice-installer.ts): a
 * pinned official release, checked, unpacked into the app's own data
 * folder. This file is the app's side of that: the pages' bridge
 * (`window.mraiDesktop.libreOffice`, preload.ts), the progress window (the
 * same one updates use) and the Dock / taskbar bar, cancelling, retrying,
 * the disk-space check, and removing the copy again (Settings).
 *
 * The download runs in this process, asynchronously: the windows stay
 * responsive. The local API is told the copy's path at launch
 * (MRAI_DESKTOP_LIBREOFFICE, services.ts) and looks for it at every
 * conversion, so no restart is needed either way.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, net } from "electron";

import {
  bytesNeeded,
  downloadedBytes,
  freeBytes,
  install,
  InstallError,
  missingRequiredFonts,
  placeWindowsFonts,
  type InstalledRecord,
  LIBREOFFICE_VERSION,
  packageFor,
  type Phase,
  readRecord,
  runtimePaths,
  type RuntimePaths,
  uninstall,
} from "./libreoffice-installer";
import { loadBundledPage } from "../bundled-page";
import { productDisplayName } from "./product";
import { layout } from "./services";

const zh = () => app.getLocale().toLowerCase().startsWith("zh");
const say = (zhText: string, enText: string) => (zh() ? zhText : enText);

/**
 * Where the copy lives. macOS: <userData>/runtime. Windows: under Local
 * AppData (a roaming profile must not carry a gigabyte of program files).
 */
export function libreOfficeRoot(): string {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local");
    return path.join(local, app.getName(), "runtime");
  }
  return path.join(app.getPath("userData"), "runtime");
}

export function libreOfficePaths(): RuntimePaths {
  return runtimePaths(libreOfficeRoot());
}

/** The soffice the API is told about (there or not yet). */
export function libreOfficeBinary(): string {
  return libreOfficePaths().binary;
}

/**
 * Windows, when the API starts: the app's LibreOffice still carries the
 * packaged faces as pinned (libreoffice-installer placeWindowsFonts); any
 * that went missing or changed are put back from the app's own copy. One
 * that cannot be is logged, and the Word render check then says
 * "writer_fonts_missing_desktop_libreoffice" instead of drawing the page in
 * another face.
 */
export function ensureLibreOfficeFonts(): void {
  if (process.platform !== "win32") return;
  const paths = libreOfficePaths();
  if (!readRecord(paths)) return;
  const missing = missingRequiredFonts(paths.install);
  if (!missing.length) return;
  console.warn(`[libreoffice] packaged fonts missing or altered: ${missing.join(", ")}; putting them back`);
  try {
    placeWindowsFonts(paths.install, layout().fontsDir);
    console.log("[libreoffice] packaged fonts in place again");
  } catch (error) {
    console.warn(`[libreoffice] packaged fonts could not be put back: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function thisPackage() {
  return packageFor(process.platform, process.arch, app.runningUnderARM64Translation === true);
}

export interface LibreOfficeContext {
  readonly displayName: string;
  /** Automated checks: no windows, no questions. */
  readonly hidden: boolean;
  /** Tell every window that something changed. */
  readonly notify: () => void;
}

export interface LibreOfficeStatus {
  /** The release this app downloads, and about how much. */
  offered: { version: string; downloadBytes: number } | null;
  /** The app's own copy, when installed. */
  installed: InstalledRecord | null;
  installing: { phase: Phase; received: number; total: number } | null;
}

type Outcome = { ok: true; version: string } | { ok: false; cancelled?: boolean; error?: string };

let running: Promise<Outcome> | null = null;
let abort: AbortController | null = null;
let progressState: { phase: Phase; received: number; total: number } | null = null;
let progressWindow: BrowserWindow | null = null;
let lastNotified = 0;
let quitting = false;

app.on("before-quit", () => {
  quitting = true;
  // A download still running is stopped; the part kept resumes next time.
  abort?.abort();
});

/** What the app offers and holds (which LibreOffice conversions use, the
 * page asks the API: GET /api/v1/desktop/libreoffice). */
export function libreOfficeStatus(): LibreOfficeStatus {
  const pkg = thisPackage();
  return {
    offered: pkg ? { version: pkg.version, downloadBytes: pkg.size } : null,
    installed: readRecord(libreOfficePaths()),
    installing: running ? progressState : null,
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

function phaseText(phase: Phase, received: number, total: number): [string, string, number | null] {
  switch (phase) {
    case "download":
      return [
        say(`正在下载 LibreOffice ${LIBREOFFICE_VERSION}`, `Downloading LibreOffice ${LIBREOFFICE_VERSION}`),
        `${formatBytes(received)} / ${formatBytes(total)}`,
        total ? received / total : null,
      ];
    case "verify":
      return [say("正在校验下载的文件…", "Verifying the download…"), say("对照官方发布的 SHA-256", "Against the published SHA-256"), null];
    case "unpack":
      return [say("正在解包 LibreOffice…", "Unpacking LibreOffice…"), say(`放进 ${productDisplayName(true)} 自己的文件夹，不安装到系统`, `Into ${productDisplayName(false)}'s own folder, not into the system`), null];
    case "check":
      return [say("正在试运行 LibreOffice…", "Trying LibreOffice…"), say("第一次启动要多等几秒", "Its first start takes a few seconds"), null];
    case "done":
      return [say("LibreOffice 已启用", "LibreOffice is ready"), "", 1];
    default:
      return [say("正在准备下载 LibreOffice…", "Getting ready to download LibreOffice…"), "", null];
  }
}

function render(): void {
  const window = progressWindow;
  if (!window || window.isDestroyed() || !progressState) return;
  const [title, detail, fraction] = phaseText(progressState.phase, progressState.received, progressState.total);
  window.setProgressBar(fraction === null ? 2 : fraction);
  if (!window.webContents.isLoading()) {
    const cancellable = progressState.phase !== "done";
    void window.webContents
      .executeJavaScript(`window.show && show(${[title, detail, fraction, cancellable].map((value) => JSON.stringify(value)).join(",")})`)
      .catch(() => undefined);
  }
}

function showProgress(context: LibreOfficeContext): void {
  if (context.hidden) return;
  if (progressWindow && !progressWindow.isDestroyed()) {
    progressWindow.show();
    return;
  }
  const window = new BrowserWindow({
    width: 440,
    height: 148,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: context.displayName,
    backgroundColor: "#f3f7f6",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  progressWindow = window;
  window.on("close", (event) => {
    // Closing it keeps the download going (the Dock / taskbar still shows it).
    if (!quitting && running) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (progressWindow === window) progressWindow = null;
  });
  window.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    if (title.startsWith("hide:")) window.hide();
    if (title.startsWith("cancel:")) abort?.abort();
  });
  window.webContents.on("did-finish-load", render);
  window.once("ready-to-show", () => window.show());
  void loadBundledPage(window, path.join(__dirname, "..", "..", "assets", "update-progress.html"), zh() ? "lang=zh" : "lang=en");
}

function closeProgress(): void {
  const window = progressWindow;
  progressWindow = null;
  if (window && !window.isDestroyed()) {
    window.setProgressBar(-1);
    window.destroy();
  }
}

function describe(error: unknown): string {
  if (error instanceof InstallError) {
    switch (error.code) {
      case "no_space": {
        const need = Number(error.details.need) || 0;
        const free = Number(error.details.free) || 0;
        return say(
          `磁盘空间不够：需要约 ${formatBytes(need)} 可用空间，现在只有 ${formatBytes(free)}。清理一些空间后再试。`,
          `Not enough disk space: about ${formatBytes(need)} must be free, ${formatBytes(free)} is. Free some space and try again.`,
        );
      }
      case "download":
        return say(`下载没有完成（${error.message}）。检查网络连接后重试，已下载的部分会接着下载。`, `The download did not finish (${error.message}). Check the connection and try again; it resumes where it stopped.`);
      case "checksum":
        return say("下载的文件和 LibreOffice 官方发布的校验值不符，已删除。请重试。", "The download does not match LibreOffice's published checksum and was deleted. Try again.");
      case "locked":
        return say(
          "新的 LibreOffice 装好了，但它的文件一直被别的程序占用（常见是杀毒软件在扫描），没能放到位。稍等片刻再试一次。",
          "The new LibreOffice was ready but another program kept one of its files open (often an antivirus scan), so it could not be put in place. Wait a moment and try again.",
        );
      case "busy":
        return say("正在使用的 LibreOffice 无法替换：请等转换完成后重试。", "The LibreOffice in use could not be replaced: try again once conversions finish.");
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function installOnce(context: LibreOfficeContext, quiet = false): Promise<Outcome> {
  const pkg = thisPackage();
  if (!pkg) return { ok: false, error: say("这台电脑的系统没有可用的 LibreOffice 下载。", "There is no LibreOffice download for this system.") };
  const paths = libreOfficePaths();
  const controller = new AbortController();
  abort = controller;
  progressState = { phase: "space", received: downloadedBytes(pkg, paths), total: pkg.size };
  if (!quiet) showProgress(context);
  render();
  context.notify();
  const started = Date.now();
  try {
    const record = await install(pkg, paths, {
      fetch: (input, init) => net.fetch(String(input), init as RequestInit),
      signal: controller.signal,
      fontsDir: layout().fontsDir,
      log: (line) => console.log(`[libreoffice] ${line}`),
      onProgress: (phase, received, total) => {
        progressState = { phase, received, total };
        render();
        if (phase !== "download" || Date.now() - lastNotified > 1000) {
          lastNotified = Date.now();
          context.notify();
        }
      },
    });
    console.log(`[libreoffice] ${record.version} ready at ${paths.install} (${Math.round(record.bytes / 1e6)} MB, ${Math.round((Date.now() - started) / 1000)} s)`);
    return { ok: true, version: record.version };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof InstallError && error.code === "cancelled")) {
      console.log("[libreoffice] cancelled");
      return { ok: false, cancelled: true };
    }
    console.warn(`[libreoffice] not installed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error: describe(error) };
  } finally {
    abort = null;
    progressState = null;
    closeProgress();
  }
}

/**
 * Download and enable it (or join the download already running). A failure
 * offers "Try Again" until it works or the person closes the question.
 */
export function installLibreOffice(context: LibreOfficeContext, owner: BrowserWindow | null): Promise<Outcome> {
  if (running) {
    // A download started in the background is joined, and shown from now on.
    showProgress(context);
    return running;
  }
  running = (async () => {
    try {
      for (;;) {
        const outcome = await installOnce(context);
        if (outcome.ok || outcome.cancelled || context.hidden || quitting) return outcome;
        const options = {
          type: "warning" as const,
          buttons: [say("重试", "Try Again"), say("关闭", "Close")],
          defaultId: 0,
          cancelId: 1,
          message: say("LibreOffice 没有启用", "LibreOffice was not enabled"),
          detail: outcome.error ?? "",
        };
        const live = owner && !owner.isDestroyed() ? owner : null;
        const { response } = live ? await dialog.showMessageBox(live, options) : await dialog.showMessageBox(options);
        if (response !== 0) return outcome;
      }
    } finally {
      running = null;
      context.notify();
    }
  })();
  return running;
}

/** Written when the person removes the app's LibreOffice: it is not fetched
 * again by itself (they asked for it gone), only when a file needs it. */
function declinedMarker(paths: RuntimePaths): string {
  return path.join(paths.root, "auto-download-declined");
}

/** A LibreOffice the person installed themselves (the API uses it as it is). */
function systemLibreOffice(): boolean {
  const candidates =
    process.platform === "darwin"
      ? ["/Applications/LibreOffice.app", path.join(os.homedir(), "Applications", "LibreOffice.app")]
      : process.platform === "win32"
        ? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramW6432]
            .filter((root): root is string => Boolean(root))
            .map((root) => path.join(root, "LibreOffice", "program", "soffice.exe"))
        : [];
  return candidates.some((candidate) => fs.existsSync(candidate));
}








export function prefetchLibreOffice(context: LibreOfficeContext): void {
  if (context.hidden || running || quitting) return;
  const pkg = thisPackage();
  if (!pkg) return;
  const paths = libreOfficePaths();
  if (readRecord(paths) || systemLibreOffice() || fs.existsSync(declinedMarker(paths))) return;
  const space = libreOfficeSpace();
  if (space && space.free !== null && space.free < space.need) {
    console.log("[libreoffice] not fetched in the background: not enough disk space");
    return;
  }
  console.log("[libreoffice] fetching in the background");
  running = (async () => {
    try {
      return await installOnce(context, true);
    } finally {
      running = null;
      context.notify();
    }
  })();
}

/** Before the download: is there room? (the page's button says so at once). */
export function libreOfficeSpace(): { need: number; free: number | null } | null {
  const pkg = thisPackage();
  if (!pkg) return null;
  const paths = libreOfficePaths();
  return { need: bytesNeeded(pkg, downloadedBytes(pkg, paths)), free: freeBytes(paths.root) };
}

/** Settings ▸ Remove: the copy and its downloads, after asking. */
export async function removeLibreOffice(context: LibreOfficeContext, owner: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
  if (running) return { ok: false, error: say("LibreOffice 正在下载。", "LibreOffice is being downloaded.") };
  const paths = libreOfficePaths();
  const record = readRecord(paths);
  if (!context.hidden) {
    const options = {
      type: "question" as const,
      buttons: [say("移除", "Remove"), say("取消", "Cancel")],
      defaultId: 1,
      cancelId: 1,
      message: say(`移除 ${productDisplayName(true)} 的 LibreOffice？`, `Remove ${productDisplayName(false)}'s LibreOffice?`),
      detail: say(
        `会删除应用自己下载的 LibreOffice${record ? ` ${record.version}（约 ${formatBytes(record.bytes)}）` : ""}。之后打开 .doc/.xls/.ppt 等文件、显示 EMF/WMF 图和导出 OpenDocument 时需要重新下载（这台电脑上另装的 LibreOffice 不受影响）。`,
        `This deletes the LibreOffice the app downloaded${record ? ` (${record.version}, about ${formatBytes(record.bytes)})` : ""}. Opening .doc/.xls/.ppt files, drawing EMF/WMF pictures and OpenDocument exports will need it downloaded again (a LibreOffice installed separately on this computer is not affected).`,
      ),
    };
    const live = owner && !owner.isDestroyed() ? owner : null;
    const { response } = live ? await dialog.showMessageBox(live, options) : await dialog.showMessageBox(options);
    if (response !== 0) return { ok: false };
  }
  try {
    uninstall(paths);
    try {
      fs.mkdirSync(paths.root, { recursive: true });
      fs.writeFileSync(declinedMarker(paths), new Date().toISOString());
    } catch {
      // Only means it may be fetched in the background again.
    }
    console.log("[libreoffice] removed");
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[libreoffice] not removed: ${detail}`);
    return {
      ok: false,
      error: say(`没能移除（可能正在转换文件，稍后再试）：${detail}`, `It could not be removed (a conversion may be running; try again shortly): ${detail}`),
    };
  } finally {
    context.notify();
  }
}

