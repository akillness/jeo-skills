/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
// Pictures from this computer, for editors that keep them in the file itself:
// nothing here stores files on a server, so a picture goes into the document
// as a data: URL. A very large picture is scaled down first so the saved file
// stays a reasonable size.

const PICTURE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml"]);
const PICTURE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
/** Past this many bytes a raster picture is redrawn at most MAX_EDGE wide. */
const KEEP_AS_IS_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 2400;

export function isLocalPictureFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  return type ? PICTURE_TYPES.has(type) : PICTURE_NAME.test(file.name);
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The picture could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function scaledDown(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const keepsAlpha = file.type === "image/png" || file.type === "image/gif" || file.type === "image/webp";
    return keepsAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The picture as a data: URL (scaled down when it is very large). */
export async function localPictureDataUrl(file: File): Promise<string> {
  const vector = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!vector && file.size > KEEP_AS_IS_BYTES) {
    const scaled = await scaledDown(file);
    if (scaled) return scaled;
  }
  return readAsDataUrl(file);
}

/** The document editor's picture nodes for these files (others are skipped). */
export async function localImageNodes(files: readonly File[]): Promise<Record<string, unknown>[]> {
  const nodes: Record<string, unknown>[] = [];
  for (const file of files) {
    if (!isLocalPictureFile(file)) continue;
    const src = await localPictureDataUrl(file);
    nodes.push({
      type: "image",
      attrs: { src, alt: file.name.replace(/\.[^.]+$/, ""), filename: file.name, mime_type: file.type || null, size_bytes: file.size },
    });
  }
  return nodes;
}

let sequence = 0;
/** An id for a picture kept in the file (no stored copy anywhere else). */
export function localAssetId(): string {
  sequence += 1;
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${sequence}`;
  return `local-${random}`;
}
