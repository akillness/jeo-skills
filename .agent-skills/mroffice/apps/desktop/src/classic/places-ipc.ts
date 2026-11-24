/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The sidebar's places on this computer (apps/web components/console
 * DesktopPlacesTree, lib/desktop-places): what the page asks of the app for
 * them, answered for the main frame of the app's own pages only (``fromApp``)
 * and checked by ./places.ts before any path is touched.
 *
 * - A document chosen in the tree, or in the system's Open dialog, opens as a
 *   document double-clicked in Finder does (``open``: main.ts openDocuments,
 *   into the window that asked): linked to its file, so Save writes back to
 *   it, and opened again unchanged it is the page it already became.
 * - A new page's file is written into the folder chosen in the tree, never
 *   over an existing file, and the page is linked to it as Save links one.
 * - Rename follows the links (./original-links.ts followRename); Move to
 *   Trash uses the system's Trash, never a deletion.
 * - Each window's expanded folders are watched while it shows them.
 * - A listed document's picture for the tree (./place-thumbnails.ts): the
 *   page it became, else the system's thumbnail (Quick Look, the Windows
 *   shell) or the picture an Office file carries, small, kept by path and time.
 */

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, type NativeImage, type WebContents } from "electron";

import { OPENABLE_TYPES } from "../files";
import { documentThumbnail } from "./document-thumbnail";
import { followRenamedOriginals, originalLinksStore, pageOfUnchangedFile } from "./local-files";
import { PlaceThumbnails } from "./place-thumbnails";
import { type PlaceListing, type PlaceRoot, Places, placeRoots } from "./places";

/** Whether a picture is one flat colour: the blank thumbnail python-docx's and
 * python-pptx's templates carry into every file made from them. */
function blankPicture(image: NativeImage): boolean {
  const small = image.resize({ width: 16, height: 16 });
  const pixels = small.toBitmap();
  if (pixels.length < 4) return true;
  for (let at = 4; at < pixels.length; at += 1) {
    if (Math.abs(pixels[at]! - pixels[at % 4]!) > 6) return false;
  }
  return true;
}

/** A document's first page as a PNG data URL at most ``px`` on its longer
 * side: the system's thumbnail (Quick Look on macOS, the shell's on Windows;
 * none on Linux), else the picture an Office file carries (docProps/thumbnail,
 * when it is not a template's blank one). */
export async function renderPlaceThumbnail(real: string, px: number): Promise<string | null> {
  let image: NativeImage | null = null;
  if (process.platform === "darwin" || process.platform === "win32") {
    try {
      const made = await nativeImage.createThumbnailFromPath(real, { width: px, height: px });
      // Its size says the square asked for; its pixels (a 2x picture on a
      // Mac) have the page's own shape: read back as one plain picture.
      const plain = made.isEmpty() ? null : nativeImage.createFromBuffer(made.toPNG());
      if (plain && !plain.isEmpty()) image = plain;
    } catch {
      // no system thumbnail for it: the one the file carries, if any
    }
  }
  if (!image) {
    const carried = documentThumbnail(real);
    const decoded = carried ? nativeImage.createFromBuffer(carried.bytes) : null;
    if (decoded && !decoded.isEmpty() && !blankPicture(decoded)) image = decoded;
  }
  if (!image) return null;
  const { width, height } = image.getSize();
  const scale = Math.min(1, px / Math.max(1, width, height));
  if (scale < 1) {
    image = image.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: "good",
    });
  }
  return image.toDataURL();
}

/** What the app remembers of the tree between launches. */
interface PlacesMemory {
  selected?: string;
  expanded?: string[];
}

const MAX_REMEMBERED_EXPANDED = 64;
const MAX_WATCHED_PER_WINDOW = 64;
const CHANGE_SETTLE_MS = 250;
/** A new page's file: a blank or a template's document, never this large. */
const MAX_CREATED_FILE_BYTES = 512 * 1024 * 1024;

export function registerPlaces(
  fromApp: (event: Electron.IpcMainInvokeEvent) => boolean,
  open: (paths: string[], window: BrowserWindow | null) => void,
): void {
  const home = app.getPath("home");
  const places = new Places(home);
  const memoryFile = () => path.join(app.getPath("userData"), "places.json");

  const known = (name: "desktop" | "documents" | "downloads"): string | undefined => {
    try {
      return app.getPath(name);
    } catch {
      return undefined;
    }
  };
  const roots = (): PlaceRoot[] =>
    placeRoots(home, { desktop: known("desktop"), documents: known("documents"), downloads: known("downloads") });
  const rootReals = (): Set<string> => {
    const reals = new Set<string>();
    for (const root of roots()) {
      const real = places.resolve(root.path);
      if (real) reals.add(real);
    }
    return reals;
  };

  const readMemory = (): PlacesMemory => {
    try {
      const value = JSON.parse(fs.readFileSync(memoryFile(), "utf8")) as PlacesMemory;
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };

  ipcMain.handle("mrai:places-state", (event) => {
    if (!fromApp(event)) return null;
    const list = roots();
    const memory = readMemory();
    // A remembered folder still there and inside home; else Documents, the
    // first time and after it is gone.
    const selected =
      typeof memory.selected === "string" && places.folder(memory.selected)
        ? memory.selected
        : (list.find((root) => root.id === "documents") ?? list[0])?.path ?? null;
    const expanded = Array.isArray(memory.expanded)
      ? memory.expanded.filter((item): item is string => typeof item === "string").slice(0, MAX_REMEMBERED_EXPANDED)
      : [];
    return { roots: list, selected, expanded, separator: path.sep };
  });

  ipcMain.handle("mrai:places-remember", (event, selected: unknown, expanded: unknown) => {
    if (!fromApp(event)) return false;
    const memory: PlacesMemory = {
      selected: typeof selected === "string" && places.folder(selected) ? selected : undefined,
      expanded: Array.isArray(expanded)
        ? expanded.filter((item): item is string => typeof item === "string" && item.length < 4096).slice(0, MAX_REMEMBERED_EXPANDED)
        : [],
    };
    try {
      fs.mkdirSync(path.dirname(memoryFile()), { recursive: true });
      const temp = `${memoryFile()}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(memory));
      fs.renameSync(temp, memoryFile());
      return true;
    } catch {
      return false;
    }
  });

  const thumbnails = new PlaceThumbnails({ places, linkedPage: pageOfUnchangedFile, render: renderPlaceThumbnail });
  ipcMain.handle("mrai:places-thumbnail", async (event, target: unknown, size: unknown) => {
    if (!fromApp(event)) return { ok: false };
    return thumbnails.thumbnail(target, size);
  });

  // One reading of a folder at a time: while macOS is still asking the person
  // about a protected folder (Desktop, Documents, Downloads) the reading
  // waits, and every further one (the window coming to the front, a change
  // note) would wait beside it on one of Node's four file threads -- four
  // waiting readings and no folder anywhere is listed until the person
  // answers. A place the tree shows as a row of its own is not listed again
  // inside another (Desktop inside the home folder).
  const listings = new Map<string, Promise<PlaceListing>>();
  ipcMain.handle("mrai:places-list", (event, dir: unknown): Promise<PlaceListing> | PlaceListing => {
    if (!fromApp(event)) return { ok: false, error: "invalid" };
    if (typeof dir !== "string") return places.list(dir);
    const reading = listings.get(dir);
    if (reading) return reading;
    const beside = rootReals();
    const own = places.resolve(dir);
    if (own) beside.delete(own);
    const started = places.list(dir, undefined, beside).finally(() => listings.delete(dir));
    listings.set(dir, started);
    return started;
  });

  // --- watching the folders a window shows ------------------------------------------
  const watchers = new Map<number, Map<string, { watcher: fs.FSWatcher; timer: NodeJS.Timeout | null }>>();
  const closesWatchers = new Set<number>();
  const stopAll = (contentsId: number) => {
    for (const watch of watchers.get(contentsId)?.values() ?? []) {
      if (watch.timer) clearTimeout(watch.timer);
      watch.watcher.close();
    }
    watchers.delete(contentsId);
  };
  const watchFolder = (contents: WebContents, shown: string): { watcher: fs.FSWatcher; timer: NodeJS.Timeout | null } | null => {
    const real = places.folder(shown);
    if (!real) return null;
    try {
      const watch: { watcher: fs.FSWatcher; timer: NodeJS.Timeout | null } = {
        watcher: fs.watch(real, { persistent: false }),
        timer: null,
      };
      watch.watcher.on("change", () => {
        if (watch.timer) clearTimeout(watch.timer);
        watch.timer = setTimeout(() => {
          watch.timer = null;
          if (!contents.isDestroyed()) contents.send("mrai:places-changed", shown);
        }, CHANGE_SETTLE_MS);
      });
      watch.watcher.on("error", () => {
        // The folder went away or cannot be watched: the window still reads
        // it again when it comes to the front.
        watch.watcher.close();
      });
      return watch;
    } catch {
      return null;
    }
  };

  ipcMain.handle("mrai:places-watch", (event, dirs: unknown) => {
    if (!fromApp(event)) return false;
    const contents = event.sender;
    const wanted = new Set(
      (Array.isArray(dirs) ? dirs : []).filter((item): item is string => typeof item === "string").slice(0, MAX_WATCHED_PER_WINDOW),
    );
    let current = watchers.get(contents.id);
    if (!current) {
      current = new Map();
      watchers.set(contents.id, current);
    }
    if (!closesWatchers.has(contents.id)) {
      const id = contents.id;
      closesWatchers.add(id);
      contents.once("destroyed", () => {
        closesWatchers.delete(id);
        stopAll(id);
      });
    }
    for (const [shown, watch] of current) {
      if (wanted.has(shown)) continue;
      if (watch.timer) clearTimeout(watch.timer);
      watch.watcher.close();
      current.delete(shown);
    }
    for (const shown of wanted) {
      if (current.has(shown)) continue;
      const watch = watchFolder(contents, shown);
      if (watch) current.set(shown, watch);
    }
    if (!current.size) watchers.delete(contents.id);
    return true;
  });

  // --- opening, as Finder opens a document --------------------------------------------
  ipcMain.handle("mrai:open-local-paths", (event, paths: unknown) => {
    if (!fromApp(event) || !Array.isArray(paths)) return 0;
    const documents = paths.map((item) => places.openable(item)).filter((item): item is string => item !== null);
    if (!documents.length) return 0;
    open(documents, BrowserWindow.fromWebContents(event.sender));
    return documents.length;
  });

  ipcMain.handle("mrai:places-open-dialog", async (event, folder: unknown) => {
    if (!fromApp(event)) return 0;
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      defaultPath: places.folder(folder) ?? app.getPath("documents"),
      filters: [
        {
          name: "Documents",
          extensions: OPENABLE_TYPES.flatMap((type) => type.extensions.map((extension) => extension.slice(1))),
        },
      ],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return 0;
    // Chosen by the person in the system's dialog: any place they could
    // choose there, as Finder's Open With.
    const documents = result.filePaths.filter((item) => fs.existsSync(item));
    if (documents.length) open(documents, owner);
    return documents.length;
  });

  ipcMain.handle("mrai:places-reveal", (event, target: unknown) => {
    if (!fromApp(event)) return false;
    const real = places.resolve(target);
    if (!real) return false;
    shell.showItemInFolder(real);
    return true;
  });

  // --- making, renaming, moving to the Trash ------------------------------------------
  ipcMain.handle("mrai:places-create-folder", async (event, parent: unknown, name: unknown) => {
    if (!fromApp(event)) return { ok: false, error: "invalid" };
    return places.createFolder(parent, name);
  });

  ipcMain.handle("mrai:places-create-file", async (event, request: unknown) => {
    if (!fromApp(event) || !request || typeof request !== "object") return { ok: false, error: "invalid" };
    const { folder, baseName, extension, bytes, pageId, notebookId, state } = request as Record<string, unknown>;
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > MAX_CREATED_FILE_BYTES || typeof pageId !== "string") {
      return { ok: false, error: "invalid" };
    }
    const created = await places.createFile(folder, baseName, extension, new Uint8Array(bytes));
    if (!created.ok) return created;
    // The page is that file's from now on, as a page saved to a file is:
    // Save and autosave write back to it, and the link records the file as
    // it now is -- the app's own write (``written``), so autosave sees it
    // unchanged and nothing of the person's needs a copy before the next.
    const real = places.resolve(created.path) ?? created.path;
    originalLinksStore.linkOriginal(
      pageId,
      real,
      typeof notebookId === "string" ? notebookId : undefined,
      typeof state === "string" ? state : undefined,
      true,
    );
    return created;
  });

  ipcMain.handle("mrai:places-rename", async (event, target: unknown, name: unknown) => {
    if (!fromApp(event)) return { ok: false, error: "invalid" };
    const entry = places.entry(target);
    if (!entry || rootReals().has(places.resolve(target) ?? "")) return { ok: false, error: "invalid" };
    const renamed = await places.rename(target, name);
    if (!renamed.ok) return renamed;
    // The pages linked to it (or to files inside a folder) follow it.
    followRenamedOriginals([String(target), renamed.from], places.resolve(renamed.path) ?? renamed.path);
    return { ok: true, path: renamed.path, name: renamed.name };
  });

  ipcMain.handle("mrai:places-trash", async (event, target: unknown) => {
    if (!fromApp(event)) return { ok: false, error: "invalid" };
    const entry = places.entry(target);
    if (!entry || rootReals().has(places.resolve(target) ?? "")) return { ok: false, error: "invalid" };
    try {
      await shell.trashItem(entry.path);
      return { ok: true };
    } catch {
      return { ok: false, error: "failed" };
    }
  });

  /** The system's privacy settings for files and folders: a place the app
   * was not allowed to read (macOS asks once; after a No, only there). */
  ipcMain.handle("mrai:places-privacy-settings", async (event) => {
    if (!fromApp(event)) return false;
    const url =
      process.platform === "darwin"
        ? "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders"
        : process.platform === "win32"
          ? "ms-settings:privacy-broadfilesystemaccess"
          : null;
    if (!url) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });
}
