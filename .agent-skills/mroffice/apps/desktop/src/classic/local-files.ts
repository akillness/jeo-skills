/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Files on this computer, worked on where they are (docs/desktop-classic.md).
 *
 * - A file the person opens or drops is registered with the app's own API by
 *   its path (`POST /api/v1/desktop/local-files`, launch token only): the
 *   page sends the token it gets instead of the file's bytes, and the API
 *   reads the file from disk (apps/api app/desktop/local_files.py).
 * - The page a file became is linked to that file (`originals.json` in the
 *   app's data folder), so Save (⌘S / Ctrl+S) writes the page back to it in
 *   its own format, without asking where.
 */

import { randomBytes } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { originalLinks, writeFileAtomically, type OriginalLink } from "./original-links";
import { apiUp, type Launch } from "./services";

const tokensByPath = new Map<string, string>();
const pathsByToken = new Map<string, string>();

const registering = new Map<string, Promise<string | null>>();

export async function registerLocalFile(launch: Launch | null, filePath: string): Promise<string | null> {
  if (!launch || !path.isAbsolute(filePath)) return null;
  const known = tokensByPath.get(filePath);
  if (known) return known;
  // One registration per file: the window's ask for its token while the
  // registration begun when the file was opened is on its way waits for it.
  const pending = registering.get(filePath);
  if (pending) return pending;
  const started = registerNow(launch, filePath);
  registering.set(filePath, started);
  try {
    return await started;
  } finally {
    registering.delete(filePath);
  }
}

async function registerNow(launch: Launch, filePath: string): Promise<string | null> {
  // A document double-clicked to start the app: its window is there before
  // the API is (./services.ts apiUp).
  await apiUp();
  try {
    const response = await fetch(`${launch.apiOrigin}/api/v1/desktop/local-files`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: launch.webOrigin,
        "x-mrai-desktop-launch": launch.launchToken,
      },
      body: JSON.stringify({ path: filePath }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const { token } = (await response.json()) as { token: string };
    tokensByPath.set(filePath, token);
    pathsByToken.set(token, filePath);
    return token;
  } catch {
    // The page sends the bytes, as a browser does.
    return null;
  }
}

/** The most launch documents named at the API's start; any others register as before. */
const NAMED_AT_START_MAX = 16;

/**
 * The documents a launch opens, named before the API starts: each gets its
 * token here, and the API registers them under these tokens as it starts
 * (``apiEnv``'s ``localFiles``; apps/api app/desktop/local_files.py
 * ``register_named``), so the window's ask for its files is answered without
 * waiting for the API and a registration call once it answers. Call only
 * when the API is started with what this returns.
 */
export function nameLocalFilesAtStart(filePaths: readonly string[]): { path: string; token: string }[] {
  const named: { path: string; token: string }[] = [];
  for (const filePath of filePaths) {
    if (named.length >= NAMED_AT_START_MAX) break;
    if (!path.isAbsolute(filePath) || tokensByPath.has(filePath)) continue;
    // As the API's own tokens (secrets.token_urlsafe(24)).
    const token = randomBytes(24).toString("base64url");
    tokensByPath.set(filePath, token);
    pathsByToken.set(token, filePath);
    named.push({ path: filePath, token });
  }
  return named;
}

export function pathOfToken(token: string): string | null {
  return pathsByToken.get(token) ?? null;
}

// --- pages and the files they came from ---------------------------------------------

/** The links of pages to files, read again whenever originals.json changed
 * on disk (./original-links.ts): the AI's computer tools write them too. */
export const originalLinksStore = originalLinks(() => path.join(app.getPath("userData"), "data", "originals.json"));

/** Link a page to the file it came from (or was saved to), as the file is now. */
export function linkOriginal(pageId: string, filePath: string, notebookId?: string, savedState?: string): void {
  originalLinksStore.linkOriginal(pageId, filePath, notebookId, savedState);
}

/** The file a page came from, while it is still there. */
export function originalOf(pageId: string): string | null {
  return originalLinksStore.originalOf(pageId);
}

/** The page's link (its file, whether or not still there). */
export function linkOf(pageId: string): OriginalLink | null {
  return originalLinksStore.linkOf(pageId);
}

/** The page's file is as it was when it was linked or last written. */
export function unchangedSinceLinked(pageId: string): boolean {
  return originalLinksStore.unchangedSinceLinked(pageId);
}

/** The page body that file holds, while it is unchanged on disk. */
export function savedStateOf(pageId: string): string | null {
  return originalLinksStore.savedStateOf(pageId);
}

/** The page a file became, while the file is as it was then (opening it
 * again opens that page, as Word opens a document, instead of importing a
 * copy); null when it was never opened or changed since. */
export function pageOfUnchangedFile(filePath: string, stat: { size: number; mtimeMs: number }): { pageId: string; notebookId: string } | null {
  return originalLinksStore.pageOfUnchangedFile(filePath, stat);
}

/** A file or folder renamed on disk (the sidebar's places, ./places-ipc.ts):
 * the links to it, or to files inside it, follow it. */
export function followRenamedOriginals(from: readonly string[], to: string): number {
  return originalLinksStore.followRename(from, to);
}

export { writeFileAtomically };
