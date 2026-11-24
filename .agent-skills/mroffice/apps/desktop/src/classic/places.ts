/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The places on this computer the sidebar shows as a folder tree (Desktop,
 * Documents, Downloads, the home folder, iCloud Drive), and what the page may
 * do in them: list a folder, make a folder or a new document's file, rename,
 * and find each item's place again. No Electron here (./places-ipc.ts answers
 * the page with it), so the rules are tested on their own.
 *
 * Security: the page names paths, so every path is checked here before it is
 * touched.
 * - it must be absolute, with no `.`/`..` segment and no NUL;
 * - resolved through every symbolic link, it must be inside the person's
 *   home folder (iCloud Drive is under it): a link that leads out of it is
 *   neither listed nor followed;
 * - a listing gives names, kinds, sizes and times only, never contents;
 * - a write only ever makes a new name in a folder that passed the check
 *   (a new document's file, a new folder, a rename in place), never writes
 *   over an existing file, and every name is cleaned as a file name.
 */

import fs from "node:fs";
import path from "node:path";
import { isOpenablePath } from "../files";

export type PlaceRootId = "desktop" | "documents" | "downloads" | "home" | "icloud";

export interface PlaceRoot {
  readonly id: PlaceRootId;
  readonly path: string;
}

export interface PlaceEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
  readonly size: number;
  readonly mtimeMs: number;
}

export type PlaceListing =
  | { readonly ok: true; readonly entries: PlaceEntry[]; readonly total: number }
  | { readonly ok: false; readonly error: PlaceError };

export type PlaceError = "denied" | "missing" | "invalid" | "exists" | "failed";

/** The most entries a listing hands the page: a folder of tens of thousands
 * of files is listed in part (the page says how many more there are). */
export const MAX_LISTED_ENTRIES = 5000;
/** How many items' details are read at once. */
const STAT_BATCH = 64;

/** Folders that are documents or apps of their own (Finder shows them as
 * one item) and not a place to look into. */
const PACKAGE_EXTENSIONS = new Set([
  ".app", ".bundle", ".framework", ".plugin", ".kext", ".pkg", ".mpkg", ".photoslibrary",
  ".musiclibrary", ".tvlibrary", ".imovielibrary", ".fcpbundle", ".rtfd", ".pages", ".numbers",
  ".key", ".xcodeproj", ".xcworkspace", ".playground", ".appex", ".prefpane", ".saver", ".qlgenerator",
]);

/** The home folder's own hidden folders that are not dot-files (macOS and
 * Windows hide them by a flag Node cannot read). */
const HIDDEN_IN_HOME = new Set(["Library", "AppData", "Application Data", "Local Settings", "NetHood", "PrintHood", "Recent", "SendTo", "Templates", "Start Menu", "Cookies", "My Documents"]);

/** Hidden items: dot-files (.DS_Store too), Office's `~$` lock files,
 * macOS's custom-icon file, Windows's `$RECYCLE.BIN` and desktop.ini. */
export function isHiddenName(name: string): boolean {
  return (
    name.startsWith(".") ||
    name.startsWith("~$") ||
    name.startsWith("$") ||
    name === "Icon\r" ||
    name.toLowerCase() === "desktop.ini" ||
    name.toLowerCase() === "thumbs.db"
  );
}

/** Whether ``child`` is ``parent`` or inside it (both already resolved). */
export function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function realpath(target: string): string | null {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return null;
  }
}

function errorOf(error: unknown): PlaceError {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EPERM" || code === "EACCES") return "denied";
  if (code === "ENOENT" || code === "ENOTDIR") return "missing";
  if (code === "EEXIST" || code === "ENOTEMPTY") return "exists";
  return "failed";
}

/** A page-named path written plainly: absolute, no `.`/`..` segment, no NUL. */
function plainAbsolute(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || !candidate || candidate.length > 4096 || candidate.includes("\0")) return false;
  if (!path.isAbsolute(candidate)) return false;
  return !candidate.split(/[\\/]+/).some((segment) => segment === "." || segment === "..");
}

/** A name of one item, cleaned as a file name (as ../originals.ts
 * `safeFileName`): no separators or characters a system refuses, no leading
 * dots, no trailing dots or spaces; null when nothing is left. */
export function cleanEntryName(raw: unknown, platform: NodeJS.Platform = process.platform): string | null {
  if (typeof raw !== "string") return null;
  let name = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (!name) return null;
  if (name.length > 200) {
    const extension = path.extname(name).slice(0, 16);
    name = `${name.slice(0, 200 - extension.length)}${extension}`;
  }
  if (platform === "win32" && /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = `_${name}`;
  return name;
}

/**
 * The places: the home folder's Desktop, Documents and Downloads, the home
 * folder itself, and iCloud Drive when this Mac has it. ``known`` are the
 * system's own answers (Electron's app.getPath), kept only inside home.
 */
export function placeRoots(home: string, known: { desktop?: string; documents?: string; downloads?: string }, platform: NodeJS.Platform = process.platform): PlaceRoot[] {
  const homeReal = realpath(home);
  if (!homeReal) return [];
  const roots: PlaceRoot[] = [];
  const add = (id: PlaceRootId, candidate: string | undefined) => {
    if (!candidate || roots.some((root) => root.id === id)) return;
    const real = realpath(candidate);
    if (!real || !isInside(real, homeReal)) return;
    try {
      if (!fs.statSync(real).isDirectory()) return;
    } catch {
      return;
    }
    roots.push({ id, path: candidate });
  };
  add("desktop", known.desktop ?? path.join(home, "Desktop"));
  add("documents", known.documents ?? path.join(home, "Documents"));
  add("downloads", known.downloads ?? path.join(home, "Downloads"));
  if (platform === "darwin") add("icloud", path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs"));
  add("home", home);
  return roots;
}

/** The documents a new page's file may be. */
const NEW_FILE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".md", ".csv"]);

export class Places {
  private readonly homeReal: string | null;
  private readonly hiddenAllowed: string[];

  /** ``shownHidden``: places inside home's hidden folders the tree shows
   * all the same (iCloud Drive, under ~/Library). */
  constructor(
    private readonly home: string,
    private readonly platform: NodeJS.Platform = process.platform,
    shownHidden: readonly string[] = [path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs")],
  ) {
    this.homeReal = realpath(home);
    this.hiddenAllowed = shownHidden.map((item) => realpath(item)).filter((item): item is string => item !== null);
  }

  /** Whether the tree shows this resolved path: nothing hidden on its way
   * from home (no dot-folder, not ~/Library), but for iCloud Drive. */
  private shown(real: string): boolean {
    if (!this.homeReal || !isInside(real, this.homeReal)) return false;
    if (this.hiddenAllowed.some((allowed) => isInside(real, allowed))) {
      const below = this.hiddenAllowed.find((allowed) => isInside(real, allowed)) as string;
      return path.relative(below, real).split(path.sep).filter(Boolean).every((segment) => !isHiddenName(segment));
    }
    const segments = path.relative(this.homeReal, real).split(path.sep).filter(Boolean);
    if (segments.length && HIDDEN_IN_HOME.has(segments[0])) return false;
    return segments.every((segment) => !isHiddenName(segment));
  }

  /** ``candidate``, resolved, when it is a plainly written path that stays
   * inside the home folder through every link, in a part of it the tree
   * shows; else null. */
  resolve(candidate: unknown): string | null {
    if (!this.homeReal || !plainAbsolute(candidate)) return null;
    const real = realpath(candidate);
    return real && this.shown(real) ? real : null;
  }

  /** A folder the page may list or make things in. */
  folder(candidate: unknown): string | null {
    const real = this.resolve(candidate);
    if (!real) return null;
    try {
      return fs.statSync(real).isDirectory() ? real : null;
    } catch {
      return null;
    }
  }

  /**
   * An item the page may rename or move to the Trash: its folder passes the
   * check and the item is there (the item itself, a link not followed), and
   * it is not the home folder or above it.
   */
  entry(candidate: unknown): { parent: string; name: string; path: string } | null {
    if (!plainAbsolute(candidate)) return null;
    const name = path.basename(candidate);
    if (!name || name === "." || name === "..") return null;
    const parent = this.folder(path.dirname(candidate));
    if (!parent || !this.shown(path.join(parent, name))) return null;
    const itemPath = path.join(parent, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(itemPath);
    } catch {
      return null;
    }
    // The home folder itself is a place, never an item to rename or trash.
    if (this.homeReal && isInside(this.homeReal, itemPath)) return null;
    // Only what the tree lists: a folder, or a document the app opens.
    if (stat.isDirectory() ? PACKAGE_EXTENSIONS.has(path.extname(name).toLowerCase()) : !isOpenablePath(name)) return null;
    return { parent, name, path: itemPath };
  }

  /** A document the page may open: a file inside home of a type the app opens. */
  openable(candidate: unknown): string | null {
    const real = this.resolve(candidate);
    if (!real || !isOpenablePath(real) || !isOpenablePath(String(candidate))) return null;
    try {
      return fs.statSync(real).isFile() ? real : null;
    } catch {
      return null;
    }
  }

  /**
   * A folder's folders and openable documents, folders first, in natural
   * order (2 before 10), hidden items left out; at most
   * ``MAX_LISTED_ENTRIES``, with ``total`` the count of all of them.
   * ``omit``: folders (resolved) left out of this listing: the places the
   * tree already shows beside this one (Desktop, Documents and Downloads are
   * rows of their own, so the home folder does not list them a second time).
   */
  async list(
    candidate: unknown,
    collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
    omit?: ReadonlySet<string>,
  ): Promise<PlaceListing> {
    if (!plainAbsolute(candidate)) return { ok: false, error: "invalid" };
    const dir = this.resolve(candidate);
    if (!dir) {
      // A folder that is gone answers so; one outside home is refused.
      return { ok: false, error: realpath(candidate) === null ? "missing" : "invalid" };
    }
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
    const atHome = this.homeReal !== null && dir === this.homeReal;
    const candidates = dirents.filter((dirent) => {
      const name = dirent.name;
      if (isHiddenName(name)) return false;
      if (atHome && HIDDEN_IN_HOME.has(name)) return false;
      if (dirent.isDirectory()) return !PACKAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
      if (dirent.isFile()) return isOpenablePath(name);
      // A link: decided by where it leads, below.
      return dirent.isSymbolicLink();
    });
    const entries: PlaceEntry[] = [];
    for (let start = 0; start < candidates.length; start += STAT_BATCH) {
      const batch = await Promise.all(
        candidates.slice(start, start + STAT_BATCH).map(async (dirent): Promise<PlaceEntry | null> => {
          const itemPath = path.join(dir, dirent.name);
          try {
            if (dirent.isSymbolicLink()) {
              const target = await fs.promises.realpath(itemPath);
              if (!this.homeReal || !isInside(target, this.homeReal)) return null;
            }
            const stat = await fs.promises.stat(itemPath);
            if (stat.isDirectory()) {
              if (PACKAGE_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())) return null;
              if (omit?.size && omit.has(await fs.promises.realpath(itemPath))) return null;
              return { name: dirent.name, kind: "folder", size: 0, mtimeMs: Math.round(stat.mtimeMs) };
            }
            if (stat.isFile() && isOpenablePath(dirent.name)) {
              return { name: dirent.name, kind: "file", size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
            }
            return null;
          } catch {
            // Gone since, a broken link, or not readable: not listed.
            return null;
          }
        }),
      );
      for (const entry of batch) if (entry) entries.push(entry);
    }
    entries.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === "folder" ? -1 : 1));
    return { ok: true, entries: entries.slice(0, MAX_LISTED_ENTRIES), total: entries.length };
  }

  /** ``name`` in ``folder`` when it is free there, else "name 2", "name 3"... */
  private freeName(folder: string, name: string, extension: string): string {
    for (let index = 1; index < 10_000; index += 1) {
      const candidate = `${index === 1 ? name : `${name} ${index}`}${extension}`;
      if (!fs.existsSync(path.join(folder, candidate))) return candidate;
    }
    throw Object.assign(new Error("no free name"), { code: "EEXIST" });
  }

  /** A new folder named ``name`` (or "name 2"...) in ``parent``. */
  async createFolder(parentCandidate: unknown, rawName: unknown): Promise<{ ok: true; path: string; name: string } | { ok: false; error: PlaceError }> {
    const parent = this.folder(parentCandidate);
    const name = cleanEntryName(rawName, this.platform);
    if (!parent || !name) return { ok: false, error: "invalid" };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const chosen = this.freeName(parent, name, "");
      try {
        // Not recursive: an existing folder of that name fails, never reused.
        await fs.promises.mkdir(path.join(parent, chosen));
        return { ok: true, path: path.join(String(parentCandidate), chosen), name: chosen };
      } catch (error) {
        if (errorOf(error) !== "exists") return { ok: false, error: errorOf(error) };
      }
    }
    return { ok: false, error: "exists" };
  }

  /**
   * A new document's file in ``folder``: ``baseName`` + ``extension`` (an
   * extension the app opens), or "baseName 2"... when that is taken. Written
   * whole beside it first and then given its name in one step that fails
   * when the name exists (a hard link), so no reader sees half a file and no
   * file is ever written over.
   */
  async createFile(
    folderCandidate: unknown,
    rawBaseName: unknown,
    extension: unknown,
    bytes: Uint8Array,
  ): Promise<{ ok: true; path: string; name: string } | { ok: false; error: PlaceError }> {
    const folder = this.folder(folderCandidate);
    const baseName = cleanEntryName(rawBaseName, this.platform);
    const ext = typeof extension === "string" && /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension.toLowerCase() : null;
    if (!folder || !baseName || !ext || !NEW_FILE_EXTENSIONS.has(ext)) return { ok: false, error: "invalid" };
    const temp = path.join(folder, `.${baseName.slice(0, 80)}.${process.pid}.${Date.now()}.mrnote-creating`);
    try {
      await fs.promises.writeFile(temp, bytes, { flag: "wx" });
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const chosen = this.freeName(folder, baseName, ext);
        const target = path.join(folder, chosen);
        try {
          await fs.promises.link(temp, target);
          return { ok: true, path: path.join(String(folderCandidate), chosen), name: chosen };
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EEXIST") continue;
          if (code !== "ENOTSUP" && code !== "EPERM" && code !== "EXDEV" && code !== "ENOSYS") return { ok: false, error: errorOf(error) };
          // A disk without hard links (exFAT, some shares): the name is
          // taken exclusively and written in place, still never over a file.
          try {
            await fs.promises.writeFile(target, bytes, { flag: "wx" });
            return { ok: true, path: path.join(String(folderCandidate), chosen), name: chosen };
          } catch (inner) {
            if ((inner as NodeJS.ErrnoException).code === "EEXIST") continue;
            await fs.promises.rm(target, { force: true }).catch(() => undefined);
            return { ok: false, error: errorOf(inner) };
          }
        }
      }
      return { ok: false, error: "exists" };
    } finally {
      await fs.promises.rm(temp, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Rename an item in place. Never over another item: a file takes its new
   * name by a hard link that fails when the name exists, then gives up the
   * old one; a folder is renamed after its new name was found free. A change
   * of letter case only (one item on a case-insensitive disk) is a rename.
   */
  async rename(candidate: unknown, rawName: unknown): Promise<{ ok: true; from: string; path: string; name: string } | { ok: false; error: PlaceError }> {
    const entry = this.entry(candidate);
    const name = cleanEntryName(rawName, this.platform);
    if (!entry || !name) return { ok: false, error: "invalid" };
    const shownParent = path.dirname(String(candidate));
    if (name === entry.name) return { ok: true, from: entry.path, path: String(candidate), name };
    // A document stays a document the app opens (its kind kept).
    const isFolder = fs.statSync(entry.path).isDirectory();
    if (!isFolder && (!isOpenablePath(name) || isHiddenName(name))) return { ok: false, error: "invalid" };
    const target = path.join(entry.parent, name);
    try {
      const before = fs.lstatSync(entry.path);
      const existing = fs.lstatSync(target, { throwIfNoEntry: false });
      if (existing) {
        const sameItem = existing.ino === before.ino && existing.dev === before.dev;
        if (!sameItem) return { ok: false, error: "exists" };
        await fs.promises.rename(entry.path, target);
      } else if (before.isFile()) {
        try {
          await fs.promises.link(entry.path, target);
          await fs.promises.unlink(entry.path);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "EEXIST") return { ok: false, error: "exists" };
          if (code !== "ENOTSUP" && code !== "EPERM" && code !== "EXDEV" && code !== "ENOSYS") throw error;
          if (fs.existsSync(target)) return { ok: false, error: "exists" };
          await fs.promises.rename(entry.path, target);
        }
      } else {
        await fs.promises.rename(entry.path, target);
      }
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
    return { ok: true, from: entry.path, path: path.join(shownParent, name), name };
  }
}
