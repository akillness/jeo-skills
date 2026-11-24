/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { sanitizeSignatureImage } from "@mrnote/core/web/lib/pdf/signatures.ts";

export const PDF_IMAGE_OVERLAY_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * A PNG or JPEG's bytes within ``maxBytes``: the file itself when it fits,
 * else re-encoded at a smaller size (lib/office-picture-envelope), as a page
 * that can embed only so much keeps a compressed copy. Null when it cannot.
 */
export async function fittedPdfImageBytes(
  file: Blob,
  mimeType: string,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (file.size <= maxBytes) return new Uint8Array(await file.arrayBuffer());
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") return null;
  const [{ fitOfficePictureBlob }, { pictureBlobFromDataUrl }] = await Promise.all([
    import("@mrnote/core/web/lib/office-picture-envelope.ts"),
    import("@mrnote/core/web/components/console/editor/native-document/documentPictureCompression.ts"),
  ]);
  const fitted = await fitOfficePictureBlob(
    file,
    mimeType,
    undefined,
    Math.floor(maxBytes / 3) * 4 + 32,
  ).catch(() => null);
  const decoded = fitted ? await pictureBlobFromDataUrl(fitted) : null;
  return decoded ? new Uint8Array(await decoded.blob.arrayBuffer()) : null;
}

export function isSupportedPdfImageOverlayFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  if (PDF_IMAGE_OVERLAY_MIME_TYPES.has(type)) return true;
  return /\.(png|jpe?g)$/i.test(file.name);
}

/** The largest picture an image stamp holds inline. */
export const PDF_RASTER_STAMP_MAX_BYTES = 1024 * 1024;

export function pdfRasterDataUrl(bytes: Uint8Array, declaredMime?: string | null) {
  if (bytes.length === 0 || bytes.length > PDF_RASTER_STAMP_MAX_BYTES) return null;
  const normalizedMime = declaredMime?.split(";", 1)[0]?.trim().toLowerCase();
  const mimeCandidates =
    normalizedMime === "image/png" || normalizedMime === "image/jpeg"
      ? [normalizedMime]
      : ["image/png", "image/jpeg"];
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const payload = globalThis.btoa(binary);
  for (const mime of mimeCandidates) {
    const image = sanitizeSignatureImage(`data:${mime};base64,${payload}`);
    if (image) return image;
  }
  return null;
}
