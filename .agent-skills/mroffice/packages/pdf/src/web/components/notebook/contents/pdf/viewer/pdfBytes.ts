/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  PDF_PAGE_PACKAGE_MAX_SOURCE_BYTES,
  PDF_PAGE_PACKAGE_MAX_STREAM_CHUNKS,
} from "./outputLimits";

export async function pdfBytesSha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  try {
    const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
    return Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    copy.fill(0);
  }
}

export async function readBoundedPdfResponse(response: Response): Promise<Uint8Array> {
  const declaredLengthText = response.headers.get("content-length");
  if (declaredLengthText !== null) {
    const normalized = declaredLengthText.trim();
    if (!/^[1-9]\d*$/.test(normalized)) {
      throw new Error("Invalid PDF source Content-Length");
    }
    const declaredLength = Number(normalized);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength > PDF_PAGE_PACKAGE_MAX_SOURCE_BYTES
    ) {
      throw new Error("PDF source exceeds the editable PDF inspection limit");
    }
  }
  if (!response.body) {
    throw new Error("Bounded PDF source streaming is unavailable");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancelled = false;
  const cancel = async () => {
    if (cancelled) return;
    cancelled = true;
    try {
      await reader.cancel("PDF source byte limit reached");
    } catch {
      // The source is already failed/closed; retaining no chunks is sufficient.
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
      if (!chunk) {
        throw new Error("Invalid PDF source stream chunk");
      }
      total += chunk.byteLength;
      if (
        !Number.isSafeInteger(total) ||
        total > PDF_PAGE_PACKAGE_MAX_SOURCE_BYTES
      ) {
        throw new Error("PDF source exceeds the editable PDF inspection limit");
      }
      if (chunk.byteLength === 0) continue;
      if (chunks.length >= PDF_PAGE_PACKAGE_MAX_STREAM_CHUNKS) {
        throw new Error("PDF source stream chunk budget exceeded");
      }
      chunks.push(chunk.slice());
    }
    if (total < 1) throw new Error("PDF source is empty");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    await cancel();
    throw error;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    try {
      reader.releaseLock();
    } catch {
      // A failed stream can already have released its lock.
    }
  }
}
