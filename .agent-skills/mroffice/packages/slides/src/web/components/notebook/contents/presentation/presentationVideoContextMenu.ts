/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * PowerPoint's right-click menu on a video (PPT-C012).
 *
 * Truth: PowerPoint for Mac 16.86 (audit dumps/ppt-ctxmenu-video.txt):
 *
 *   Cut · Copy · Paste · Save as Picture... · Save Media as...
 *   | Reorder Objects · Reorder Overlapping Objects
 *   | Group ▸ · Bring to Front ▸ · Send to Back ▸ · Lock
 *   | View Alt Text... · Format Video...
 *   | Action Settings...
 *   | Insert Captions · Remove All Captions
 *   | New Comment
 *
 * The window builds every row against its own commands (the object menu's
 * rows plus the video's own); this module only orders them the way
 * PowerPoint does and keeps the product's rows (Hide, Animation Painter,
 * Delete) after Office's, as every other deck menu does. Merge Shapes and
 * Size and Position are not on PowerPoint's video menu and are dropped.
 *
 * The two file commands are here too: Save Media as... saves the clip the
 * slide plays, Save as Picture... the frame it shows (the poster before it
 * plays), both as browser downloads.
 */

import type {
  PointerContextMenuAction,
  PointerContextMenuEntry,
} from "@mrnote/core/web/components/ui/PointerContextMenu.tsx";
import { downloadBlobFile, downloadUrlFile, isBrowserDownloadAvailable } from "@mrnote/core/web/lib/download-file.ts";
import { saveOfficeShapeAsPicture } from "@mrnote/core/web/lib/office-save-as-picture.ts";

/** The video's own rows, which the generic object menu does not carry. */
export interface PresentationVideoContextMenuRows {
  readonly saveAsPicture: PointerContextMenuAction;
  readonly saveMedia: PointerContextMenuAction;
  readonly reorderObjects: PointerContextMenuAction;
  readonly reorderOverlapping: PointerContextMenuAction;
  readonly insertCaptions: PointerContextMenuAction;
  readonly removeAllCaptions: PointerContextMenuAction;
}

/** Object-menu rows PowerPoint shows on a video, by the window's row id. */
const OFFICE_ROWS = {
  clipboard: ["cut", "copy", "paste"],
  arrange: ["group-menu", "bring-to-front-menu", "send-to-back-menu", "lock"],
  format: ["alt-text", "format-object"],
  action: ["action-settings"],
  comment: ["new-comment"],
} as const;
/** The product's own rows, kept after Office's (the other deck menus' rule). */
const PRODUCT_ROWS = ["hide-block", "show-all-hidden", "animation-painter", "delete"] as const;

function isAction(entry: PointerContextMenuEntry): entry is PointerContextMenuAction {
  return !("separator" in entry);
}

/**
 * The video menu in PowerPoint's order, from the object menu the window
 * built (`objectEntries`) and the video's own rows. A row the object menu
 * did not build (no Action Settings in a read-only realm, say) is skipped
 * rather than invented.
 */
export function presentationVideoContextMenuEntries(
  objectEntries: readonly PointerContextMenuEntry[],
  rows: PresentationVideoContextMenuRows,
): PointerContextMenuEntry[] {
  const byId = new Map<string, PointerContextMenuAction>();
  for (const entry of objectEntries) {
    if (isAction(entry)) byId.set(entry.id, entry);
  }
  const pick = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  const separator = (id: string): PointerContextMenuEntry => ({
    id: `separator-${id}`,
    separator: true,
  });
  const groups: PointerContextMenuEntry[][] = [
    [...pick(OFFICE_ROWS.clipboard), rows.saveAsPicture, rows.saveMedia],
    [rows.reorderObjects, rows.reorderOverlapping],
    pick(OFFICE_ROWS.arrange),
    pick(OFFICE_ROWS.format),
    pick(OFFICE_ROWS.action),
    [rows.insertCaptions, rows.removeAllCaptions],
    pick(OFFICE_ROWS.comment),
    pick(PRODUCT_ROWS),
  ];
  const entries: PointerContextMenuEntry[] = [];
  groups.forEach((group, index) => {
    if (group.length === 0) return;
    if (entries.length > 0) entries.push(separator(`video-${index}`));
    entries.push(...group);
  });
  return entries;
}

/** Characters a file name cannot carry on any of the systems a download lands on. */
function fileBaseName(raw: string, fallback: string): string {
  const name = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 80);
  return name || fallback;
}

const VIDEO_EXTENSIONS: Readonly<Record<string, string>> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/x-m4v": "m4v",
  "video/x-msvideo": "avi",
  "video/x-ms-wmv": "wmv",
};

/** The clip's extension: the served type first, the URL's own extension next. */
export function presentationVideoFileExtension(mimeType: string, url: string): string {
  const fromType = VIDEO_EXTENSIONS[mimeType.split(";")[0]?.trim().toLowerCase() ?? ""];
  if (fromType) return fromType;
  try {
    const path = new URL(url, "https://invalid.example/").pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(path);
    if (match) return match[1].toLowerCase();
  } catch {
    // An unparsable URL has no extension to offer.
  }
  return "mp4";
}

export type PresentationVideoSaveResult = "saved" | "opened" | "unavailable";

/**
 * Save Media as...: the clip the slide's player plays, downloaded under the
 * video's name. The bytes are read through a CORS request so the file keeps
 * its name; a source that refuses that is handed to the browser as a plain
 * navigation instead (it plays or saves it, as it would any media link).
 */
export async function savePresentationVideoMedia(
  video: HTMLVideoElement | null,
  baseName: string,
): Promise<PresentationVideoSaveResult> {
  const source = video?.currentSrc || video?.getAttribute("src") || "";
  if (!source || !/^(https?:|blob:)/i.test(source) || !isBrowserDownloadAvailable()) {
    return "unavailable";
  }
  const name = fileBaseName(baseName, "video");
  try {
    const response = await fetch(source, { mode: "cors", credentials: "omit" });
    if (response.ok) {
      const blob = await response.blob();
      const extension = presentationVideoFileExtension(blob.type, source);
      if (downloadBlobFile(`${name}.${extension}`, blob)) return "saved";
    }
  } catch {
    // A source without CORS: fall through to a navigation.
  }
  if (/^blob:/i.test(source)) return "unavailable";
  return downloadUrlFile(`${name}.${presentationVideoFileExtension("", source)}`, source)
    ? "opened"
    : "unavailable";
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      // A frame from another origin taints the canvas.
      resolve(null);
    }
  });
}

async function drawablePng(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (!(width > 0) || !(height > 0)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, width, height);
  } catch {
    return null;
  }
  return canvasPng(canvas);
}

/**
 * Save as Picture... on a video: the frame the slide shows, as a PNG -- the
 * player's current frame where the browser lets the page read it, else the
 * poster frame drawn before the clip plays, else the block as the slide
 * draws it (the shared shape rasterizer).
 */
export async function savePresentationVideoAsPicture(
  root: Element,
  baseName: string,
): Promise<"png" | "svg" | "unavailable"> {
  const name = fileBaseName(baseName, "video");
  if (typeof document !== "undefined" && isBrowserDownloadAvailable()) {
    const video = root.querySelector("video");
    if (video && video.readyState >= 2) {
      const png = await drawablePng(video, video.videoWidth, video.videoHeight);
      if (png && downloadBlobFile(`${name}.png`, png)) return "png";
    }
    const poster = root.querySelector("img");
    if (poster && poster.complete) {
      const png = await drawablePng(poster, poster.naturalWidth, poster.naturalHeight);
      if (png && downloadBlobFile(`${name}.png`, png)) return "png";
    }
  }
  return saveOfficeShapeAsPicture(root, name);
}
