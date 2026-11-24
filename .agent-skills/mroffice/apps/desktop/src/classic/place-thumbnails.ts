/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import fs from "node:fs";

import type { Places } from "./places";

export type PlaceThumbnailAnswer =
  | { readonly ok: true; readonly pageId: string; readonly notebookId: string }
  | { readonly ok: true; readonly image: string }
  | { readonly ok: false };

export interface PlaceThumbnailOptions {
  readonly places: Pick<Places, "entry" | "openable">;
  /** The page a file became while it is unchanged since (original-links). */
  readonly linkedPage: (real: string, stat: { size: number; mtimeMs: number }) => { pageId: string; notebookId: string } | null;
  /** A PNG data URL of the file's first page at most ``px`` on its longer side, or null. */
  readonly render: (real: string, px: number) => Promise<string | null>;
  readonly maxCached?: number;
  readonly concurrency?: number;
}

/** The pixel sizes asked for: a row's picture at twice its size, at most a tile's. */
export const MIN_THUMBNAIL_PX = 16;
export const MAX_THUMBNAIL_PX = 256;
/** A data URL larger than this is not handed to the page. */
const MAX_IMAGE_CHARS = 512 * 1024;

export class PlaceThumbnails {
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly waiting: (() => void)[] = [];
  private running = 0;
  private readonly maxCached: number;
  private readonly concurrency: number;

  constructor(private readonly options: PlaceThumbnailOptions) {
    this.maxCached = options.maxCached ?? 400;
    this.concurrency = Math.max(1, options.concurrency ?? 2);
  }

  async thumbnail(candidate: unknown, size: unknown): Promise<PlaceThumbnailAnswer> {
    const px =
      typeof size === "number" && Number.isFinite(size)
        ? Math.min(MAX_THUMBNAIL_PX, Math.max(MIN_THUMBNAIL_PX, Math.round(size)))
        : 96;
    // Listed by the tree (its folder shown, a document the app opens), and
    // resolved through links a file inside home.
    if (!this.options.places.entry(candidate)) return { ok: false };
    const real = this.options.places.openable(candidate);
    if (!real) return { ok: false };
    let stat: fs.Stats;
    try {
      stat = fs.statSync(real);
    } catch {
      return { ok: false };
    }
    if (!stat.isFile()) return { ok: false };
    // linked by the path it was opened by, or by its resolved one
    const stamp = { size: stat.size, mtimeMs: stat.mtimeMs };
    const linked =
      this.options.linkedPage(real, stamp) ??
      (candidate !== real ? this.options.linkedPage(String(candidate), stamp) : null);
    if (linked) return { ok: true, pageId: linked.pageId, notebookId: linked.notebookId };

    const key = `${real}\u0000${stat.mtimeMs}\u0000${stat.size}\u0000${px}`;
    let made = this.cache.get(key);
    if (made) {
      // most recently used last
      this.cache.delete(key);
      this.cache.set(key, made);
    } else {
      made = this.scheduled(() => this.options.render(real, px))
        .then((image) => (typeof image === "string" && image.startsWith("data:image/") && image.length <= MAX_IMAGE_CHARS ? image : null))
        .catch(() => null);
      this.cache.set(key, made);
      while (this.cache.size > this.maxCached) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    const image = await made;
    return image ? { ok: true, image } : { ok: false };
  }

  private async scheduled<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running += 1;
    try {
      return await task();
    } finally {
      this.running -= 1;
      this.waiting.shift()?.();
    }
  }
}
