/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Which page each file on this computer became, kept in `originals.json`
 * (the app's data folder; ./local-files.ts names it). No Electron here: the
 * shell's windows (Save, opening a file again) and the AI's computer tools
 * (`/v1/originals` on the agent control port, ./agent-control.ts) read and
 * write the same links through it.
 *
 * The file is read again whenever it changed on disk since this process last
 * read or wrote it (its size, modification time and inode): a link written by
 * the other side, or by another copy of the app, is seen at once instead of
 * the copy read at start (the AI's import linked a page the window's Save
 * never saw).
 *
 * Writing a page over its file (`writeOriginal`: ⌘S, the window's autosave,
 * the AI's write) first copies a file the app did not write itself -- the
 * person's own, untouched file, or one Word changed since -- into
 * `originals-backup/<yyyy-mm-dd>/` beside the data folder, so what was
 * there before the app's first overwrite can always be had back. A write
 * whose copy fails writes nothing.
 */

import fs from "node:fs";
import path from "node:path";

export interface OriginalLink {
  path: string;
  /** The notebook the page is in: opening the file again opens it there. */
  notebookId?: string;
  /** The file as it was when linked or last saved: unchanged, it opens as
   * that page again instead of being imported again. */
  size?: number;
  mtimeMs?: number;
  /** The page body the file holds (last saved: its content version and
   * causal revision): Save of a page still at it writes nothing. */
  savedState?: string;
  /** The size and time above are the app's own write of the file (not the
   * file as the person had it): written over again, it is not copied first. */
  written?: boolean;
}

/** Why a write of a page over its file was refused (nothing written). */
export type OriginalWriteRefusal =
  /** Autosave only: the page is linked to no file (it never asks where). */
  | "not_linked"
  /** Autosave only: the file was moved or deleted. */
  | "missing"
  /** Autosave only: the file changed on disk since it was opened or last
   * written (Word saved it): never written over without the person's ⌘S. */
  | "changed_elsewhere"
  /** The copy of the person's file could not be made. */
  | "backup_failed"
  | "write_failed";

export type OriginalWriteAnswer =
  | { ok: true; path: string; backup: string | null }
  | { ok: false; error: OriginalWriteRefusal; message?: string };

/** How many copies of originals are kept, and for how long (the oldest go first). */
export const ORIGINAL_BACKUPS_MAX_FILES = 200;
export const ORIGINAL_BACKUPS_MAX_AGE_DAYS = 30;

const PAGE_ID = /^[A-Za-z0-9-]{8,64}$/;
const SAVED_STATE = /^[A-Za-z0-9_=&:.%+-]{1,400}$/;

interface Stamp {
  size: number;
  mtimeMs: number;
  ino: number;
}

function sameStamp(a: Stamp | null, b: Stamp | null): boolean {
  return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino;
}

function stampOf(file: string): Stamp | null {
  try {
    const stat = fs.statSync(file);
    return { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino };
  } catch {
    return null;
  }
}

/** One path or the other through a symbolic link (macOS's /var and
 * /private/var): the same file. */
function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

/** Write ``bytes`` over ``target`` in one step: a reader never sees half a file. */
export async function writeFileAtomically(target: string, bytes: Uint8Array): Promise<void> {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.mrnote-saving`);
  await fs.promises.writeFile(temp, bytes);
  try {
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true });
    throw error;
  }
}

function dayFolder(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Copy ``file`` into ``backupRoot/<yyyy-mm-dd>/`` under its own name (`name (2).docx`
 * beside one already there); the copy's path. Throws when it cannot be made. */
export async function backupOriginal(file: string, backupRoot: string, now: Date = new Date()): Promise<string> {
  const folder = path.join(backupRoot, dayFolder(now));
  await fs.promises.mkdir(folder, { recursive: true });
  const { name, ext } = path.parse(path.basename(file));
  for (let n = 1; n < 10_000; n += 1) {
    const target = path.join(folder, n === 1 ? `${name}${ext}` : `${name} (${n})${ext}`);
    try {
      // A clone on APFS (no second copy of the bytes), a copy elsewhere; never over another copy.
      await fs.promises.copyFile(file, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("no free name for the copy");
}

/** Keep the copies bounded: day folders older than ``maxAgeDays`` go, then the
 * oldest copies past ``maxFiles``; ``keep`` (the copy just made) always stays. */
export function pruneOriginalBackups(
  backupRoot: string,
  { maxFiles = ORIGINAL_BACKUPS_MAX_FILES, maxAgeDays = ORIGINAL_BACKUPS_MAX_AGE_DAYS, now = new Date(), keep }: {
    maxFiles?: number;
    maxAgeDays?: number;
    now?: Date;
    keep?: string;
  } = {},
): void {
  let days: string[];
  try {
    days = fs.readdirSync(backupRoot).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
  } catch {
    return;
  }
  const oldest = dayFolder(new Date(now.getTime() - maxAgeDays * 86_400_000));
  const copies: { day: string; file: string; madeMs: number }[] = [];
  for (const day of days) {
    const folder = path.join(backupRoot, day);
    if (day < oldest && !(keep && keep.startsWith(folder + path.sep))) {
      fs.rmSync(folder, { recursive: true, force: true });
      continue;
    }
    try {
      for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder, name);
        try {
          const stat = fs.statSync(file);
          copies.push({ day, file, madeMs: stat.birthtimeMs || stat.mtimeMs });
        } catch {
          // gone meanwhile
        }
      }
    } catch {
      // not a folder
    }
  }
  if (copies.length <= maxFiles) return;
  // A copy may keep its original's modification time: the day it was copied
  // decides first, then when the copy was made.
  copies.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.madeMs - b.madeMs));
  let excess = copies.length - maxFiles;
  for (const copy of copies) {
    if (excess <= 0) break;
    if (copy.file === keep) continue;
    fs.rmSync(copy.file, { force: true });
    excess -= 1;
  }
}

export interface OriginalLinks {
  linkOriginal(pageId: string, filePath: string, notebookId?: string, savedState?: string, written?: boolean): boolean;
  originalOf(pageId: string): string | null;
  savedStateOf(pageId: string): string | null;
  linkOf(pageId: string): OriginalLink | null;
  /** The file is as it was when it was linked or last saved. */
  unchangedSinceLinked(pageId: string): boolean;
  pageOfUnchangedFile(filePath: string, stat: { size: number; mtimeMs: number }): { pageId: string; notebookId: string } | null;
  /** Every page linked to ``filePath`` (however it is on disk now), the file's newest record first. */
  pagesOfFile(filePath: string): string[];
  /**
   * Write a page's file over ``target`` (the file it is linked to, or the one
   * the person picked) and link the page to it as written. The file on disk
   * that is not the app's own last write is copied first (`backupOriginal`).
   * ``auto``: the window's autosave, which writes only the page's own linked
   * file, only while it is there and unchanged since it was opened or last
   * written (``target`` is ignored).
   */
  writeOriginal(
    pageId: string,
    target: string | null,
    bytes: Uint8Array,
    options?: { auto?: boolean; savedState?: string },
  ): Promise<OriginalWriteAnswer>;
  /** Where the copies of originals go. */
  backupRoot(): string;
  /** An item renamed or moved on disk from any of ``from`` (the spellings of
   * its old path) to ``to``: each link to it, or to a file inside it (a
   * folder renamed), follows it, keeping what it recorded of the file.
   * Returns how many links followed. */
  followRename(from: readonly string[], to: string): number;
}

/** ``storeFile``: `<data folder>/data/originals.json`; the copies of originals
 * go to `<data folder>/originals-backup` unless ``backupRoot`` says otherwise. */
export function originalLinks(storeFile: () => string, backupRoot?: () => string): OriginalLinks {
  const backups = backupRoot ?? (() => path.join(path.dirname(path.dirname(storeFile())), "originals-backup"));
  let links: Record<string, OriginalLink> | null = null;
  let stamp: Stamp | null = null;

  const read = (): Record<string, OriginalLink> => {
    const now = stampOf(storeFile());
    if (links && (now === null || sameStamp(now, stamp))) {
      // Unchanged, or not on disk (a write that failed keeps its links until
      // the app quits).
      return links;
    }
    try {
      const value = JSON.parse(fs.readFileSync(storeFile(), "utf8")) as Record<string, OriginalLink>;
      links = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      stamp = now;
    } catch {
      // Half written by another writer, or never written: what was read last.
      links = links ?? {};
    }
    return links;
  };

  const write = (): void => {
    try {
      const file = storeFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(links ?? {}));
      fs.renameSync(temp, file);
      stamp = stampOf(file);
    } catch {
      // The link lasts until the app quits.
    }
  };

  const unchanged = (link: OriginalLink): boolean => {
    try {
      const stat = fs.statSync(link.path);
      return (
        typeof link.size === "number" &&
        typeof link.mtimeMs === "number" &&
        stat.size === link.size &&
        Math.abs(stat.mtimeMs - link.mtimeMs) < 1
      );
    } catch {
      return false;
    }
  };

  const linkOf = (pageId: string): OriginalLink | null => {
    if (!PAGE_ID.test(pageId)) return null;
    const link = read()[pageId];
    return link && typeof link.path === "string" ? link : null;
  };

  const store: OriginalLinks = {
    /** Link a page to the file it came from (or was saved to), as the file is now. */
    linkOriginal(pageId, filePath, notebookId, savedState, written) {
      if (!PAGE_ID.test(pageId) || !path.isAbsolute(filePath)) return false;
      // Read again first: a link written since by the other side is kept.
      const current = read();
      const known = current[pageId];
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(filePath);
      } catch {
        stat = null;
      }
      current[pageId] = {
        path: filePath,
        notebookId: notebookId && PAGE_ID.test(notebookId) ? notebookId : known?.notebookId,
        ...(stat ? { size: stat.size, mtimeMs: stat.mtimeMs } : {}),
        ...(savedState && SAVED_STATE.test(savedState) ? { savedState } : {}),
        ...(written && stat ? { written: true } : {}),
      };
      links = current;
      write();
      return true;
    },

    /** The file a page came from, while it is still there. */
    originalOf(pageId) {
      const linked = linkOf(pageId)?.path;
      return linked && fs.existsSync(linked) ? linked : null;
    },

    /** The page body that file holds, while it is unchanged on disk. */
    savedStateOf(pageId) {
      const link = linkOf(pageId);
      return link?.savedState && unchanged(link) ? link.savedState : null;
    },

    linkOf,

    unchangedSinceLinked(pageId) {
      const link = linkOf(pageId);
      return !!link && unchanged(link);
    },

    /** The page a file became, while the file is as it was then (opening it
     * again opens that page, as Word opens a document, instead of importing
     * a copy); null when it was never opened or changed since. */
    pageOfUnchangedFile(filePath, stat) {
      let found: { pageId: string; notebookId: string; mtimeMs: number } | null = null;
      for (const [pageId, link] of Object.entries(read())) {
        if (
          link &&
          typeof link.path === "string" &&
          link.notebookId &&
          link.size === stat.size &&
          typeof link.mtimeMs === "number" &&
          Math.abs(link.mtimeMs - stat.mtimeMs) < 1 &&
          (!found || link.mtimeMs > found.mtimeMs) &&
          samePath(link.path, filePath)
        ) {
          found = { pageId, notebookId: link.notebookId, mtimeMs: link.mtimeMs };
        }
      }
      return found ? { pageId: found.pageId, notebookId: found.notebookId } : null;
    },

    pagesOfFile(filePath) {
      return Object.entries(read())
        .filter(([pageId, link]) => PAGE_ID.test(pageId) && link && typeof link.path === "string" && samePath(link.path, filePath))
        .sort(([, a], [, b]) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
        .map(([pageId]) => pageId);
    },

    async writeOriginal(pageId, target, bytes, options = {}) {
      const link = linkOf(pageId);
      let file = target;
      if (options.auto) {
        if (!link) return { ok: false, error: "not_linked" };
        if (!fs.existsSync(link.path)) return { ok: false, error: "missing" };
        if (!unchanged(link)) return { ok: false, error: "changed_elsewhere" };
        file = link.path;
      }
      if (!file || !path.isAbsolute(file)) return { ok: false, error: "write_failed", message: "no file to write" };
      let backup: string | null = null;
      let present: fs.Stats | null = null;
      try {
        present = fs.statSync(file);
      } catch {
        present = null;
      }
      if (present?.isDirectory()) return { ok: false, error: "write_failed", message: "The path is a folder." };
      // The app's own last write of this very file, unchanged since: nothing of
      // the person's to keep. Anything else (their untouched file, Word's save
      // of it since, a file picked in Save's dialog) is copied first.
      const ours = !!link && link.written === true && samePath(link.path, file) && unchanged(link);
      if (present && !ours) {
        try {
          backup = await backupOriginal(file, backups());
        } catch (error) {
          return { ok: false, error: "backup_failed", message: error instanceof Error ? error.message : String(error) };
        }
        try {
          pruneOriginalBackups(backups(), { keep: backup });
        } catch {
          // the copy is made; tidying is for the next one
        }
      }
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await writeFileAtomically(file, bytes);
      } catch (error) {
        return { ok: false, error: "write_failed", message: error instanceof Error ? error.message : String(error) };
      }
      store.linkOriginal(pageId, file, undefined, options.savedState, true);
      return { ok: true, path: file, backup };
    },

    backupRoot: backups,

    followRename(from, to) {
      if (!path.isAbsolute(to)) return 0;
      // Each old spelling, and the same through its folder's links (macOS's
      // /var and /private/var): the item itself is gone from there now.
      const olds = [
        ...new Set(
          from
            .filter((item) => path.isAbsolute(item))
            .flatMap((item) => {
              const resolved = path.resolve(item);
              try {
                return [resolved, path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved))];
              } catch {
                return [resolved];
              }
            }),
        ),
      ];
      if (!olds.length) return 0;
      const current = read();
      let followed = 0;
      for (const link of Object.values(current)) {
        if (!link || typeof link.path !== "string") continue;
        const linked = path.resolve(link.path);
        for (const old of olds) {
          const relative = path.relative(old, linked);
          if (linked !== old && (relative === "" || relative.startsWith("..") || path.isAbsolute(relative))) continue;
          // The rename keeps the file's size and time: the link still says
          // the file is unchanged since it was linked or saved.
          link.path = linked === old ? to : path.join(to, relative);
          followed += 1;
          break;
        }
      }
      if (followed) {
        links = current;
        write();
      }
      return followed;
    },
  };
  return store;
}

// --- the AI's computer tools (`POST /v1/originals`) ---------------------------------

export type OriginalsAnswer = Record<string, unknown> & { ok: boolean };

function refuse(error: string, message: string): OriginalsAnswer {
  return { ok: false, error, message };
}

/**
 * One request of the API's computer tools (app/desktop/computer/control.py):
 *
 * - `lookup` {path}: the page an unchanged file already is.
 * - `link` {page_id, path, notebook_id?, saved_state?}: link a page to a file.
 * - `of` {page_id}: the file a page is linked to, whether it is unchanged
 *   since, and the page body it holds.
 * - `write` {path, bytes_base64, page_id?, saved_state?}: write a file in one
 *   step. With page_id it is that page's own file, written only while it is
 *   still the file linked and unchanged since (someone else's edit of it is
 *   never written over), and the link then records what it holds.
 *
 * The person approved the step in the API (its cards); the shell only does it.
 */
export async function originalsAct(store: OriginalLinks, request: Record<string, unknown>): Promise<OriginalsAnswer> {
  const action = String(request.action ?? "");
  const pageId = typeof request.page_id === "string" ? request.page_id : "";
  const filePath = typeof request.path === "string" ? request.path : "";
  if (action === "lookup") {
    if (!path.isAbsolute(filePath)) return refuse("bad_request", "path must be absolute");
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return refuse("not_found", "The file does not exist.");
    }
    if (!stat.isFile()) return refuse("not_a_file", "The path is not a file.");
    const page = store.pageOfUnchangedFile(filePath, stat);
    return { ok: true, page_id: page?.pageId ?? null, notebook_id: page?.notebookId ?? null };
  }
  if (action === "link") {
    const notebookId = typeof request.notebook_id === "string" ? request.notebook_id : undefined;
    const savedState = typeof request.saved_state === "string" ? request.saved_state : undefined;
    if (!fs.existsSync(filePath)) return refuse("not_found", "The file does not exist.");
    return store.linkOriginal(pageId, filePath, notebookId, savedState)
      ? { ok: true }
      : refuse("bad_request", "page_id or path is invalid");
  }
  if (action === "of") {
    const link = store.linkOf(pageId);
    if (!link || !fs.existsSync(link.path)) return { ok: true, path: null };
    return {
      ok: true,
      path: link.path,
      name: path.basename(link.path),
      notebook_id: link.notebookId ?? null,
      unchanged: store.unchangedSinceLinked(pageId),
      saved_state: store.savedStateOf(pageId),
    };
  }
  if (action === "write") {
    if (!path.isAbsolute(filePath)) return refuse("bad_request", "path must be absolute");
    if (typeof request.bytes_base64 !== "string") return refuse("bad_request", "bytes_base64 is required");
    const bytes = Buffer.from(request.bytes_base64, "base64");
    if (pageId) {
      const link = store.linkOf(pageId);
      if (!link || !samePath(link.path, filePath)) {
        return refuse("not_linked", "This page is not linked to that file.");
      }
      if (!store.unchangedSinceLinked(pageId)) {
        return refuse("original_changed", "The file was changed outside MR Note since it was opened or last saved.");
      }
    }
    try {
      if (fs.statSync(filePath, { throwIfNoEntry: false })?.isDirectory()) {
        return refuse("is_a_folder", "The path is a folder.");
      }
    } catch (error) {
      return refuse("write_failed", error instanceof Error ? error.message : String(error));
    }
    if (pageId) {
      // The page's own file: the person's untouched file is copied first.
      const savedState = typeof request.saved_state === "string" ? request.saved_state : undefined;
      const written = await store.writeOriginal(pageId, store.linkOf(pageId)?.path ?? filePath, bytes, { savedState });
      if (!written.ok) return refuse(written.error, written.message ?? written.error);
      return { ok: true, path: filePath, size: bytes.length };
    }
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await writeFileAtomically(filePath, bytes);
    } catch (error) {
      return refuse("write_failed", error instanceof Error ? error.message : String(error));
    }
    return { ok: true, path: filePath, size: bytes.length };
  }
  return refuse("bad_request", `unknown action ${action}`);
}
