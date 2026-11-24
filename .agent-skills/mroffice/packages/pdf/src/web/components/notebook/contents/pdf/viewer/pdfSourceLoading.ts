/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { fetchPdfSource } from "../../../../../lib/pdf/fetch-source";
import { getDecryptedPdfBytes } from "../../../../../lib/pdf/pdf-password";
import type { PdfDocument } from "./pdfApi";

/**
 * The bytes of the document the reader has open, read once per pdf.js
 * document and shared by every reader of form metadata (/Tabs, terminal
 * field /TU). The viewer already downloaded the source to open it, so this
 * asks pdf.js for the loaded bytes rather than fetching the URL again; the
 * displayed document is also the one whose widgets are on screen. Decrypted
 * bytes come from their session cache. Only a document double without
 * `getData` (unit tests) falls back to the source request, still once.
 */
export const loadedPdfBytesByDocument = new WeakMap<object, Promise<Uint8Array | ArrayBuffer>>();
export function loadedPdfBytesForMetadata(
  document: object,
  url: string,
): Promise<Uint8Array | ArrayBuffer> {
  const decrypted = getDecryptedPdfBytes(url);
  if (decrypted) return Promise.resolve(decrypted);
  let pending = loadedPdfBytesByDocument.get(document);
  if (!pending) {
    const getData = (document as { getData?: () => Promise<Uint8Array> }).getData;
    pending =
      typeof getData === "function"
        ? getData.call(document).then((bytes) => Uint8Array.from(bytes))
        : fetchPdfSource(url).then((response) => response.arrayBuffer());
    // A failed read is not remembered: the next reader may try again.
    pending.catch(() => loadedPdfBytesByDocument.delete(document));
    loadedPdfBytesByDocument.set(document, pending);
  }
  return pending;
}

export async function fetchPdfSourceWithOneNetworkRetry(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetchPdfSource(url, { signal });
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    // A restored workspace can mount several PDF windows together. If the
    // browser drops one binary request while those windows reconnect, retry
    // that NETWORK failure once. HTTP refusals are returned (and handled)
    // unchanged below, so permissions and server errors remain fail-closed.
    return fetchPdfSource(url, { signal });
  }
}

/**
 * The page (and fit) a document's /OpenAction asks the reader to open at.
 * Null when the document names none, names something that is not an
 * internal page destination, or cannot be read. Never executes an action.
 */
export async function readPdfOpenActionPage(
  doc: PdfDocument,
): Promise<{ pageNumber: number; fit: "page" | "width" | null } | null> {
  const proxy = doc as unknown as {
    getOpenAction?: () => Promise<unknown>;
    getDestination?: (name: string) => Promise<unknown>;
    getPageIndex?: (ref: unknown) => Promise<number>;
  };
  if (typeof proxy.getOpenAction !== "function") return null;
  try {
    const openAction = (await proxy.getOpenAction()) as
      | { dest?: unknown; action?: unknown }
      | null
      | undefined;
    let dest = openAction?.dest;
    if (typeof dest === "string" && typeof proxy.getDestination === "function") {
      dest = await proxy.getDestination(dest);
    }
    if (!Array.isArray(dest) || dest.length === 0) return null;
    const [ref, kind] = dest as [unknown, { name?: unknown } | undefined];
    let pageIndex: number;
    if (typeof ref === "number" && Number.isInteger(ref) && ref >= 0) {
      pageIndex = ref;
    } else if (
      ref &&
      typeof ref === "object" &&
      typeof proxy.getPageIndex === "function"
    ) {
      pageIndex = await proxy.getPageIndex(ref);
    } else {
      return null;
    }
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
    const fitName = kind && typeof kind === "object" ? kind.name : undefined;
    const fit =
      fitName === "Fit" || fitName === "FitB"
        ? "page"
        : fitName === "FitH" || fitName === "FitBH"
          ? "width"
          : null;
    return { pageNumber: pageIndex + 1, fit };
  } catch {
    return null;
  }
}

/** The view a document asks to open in: its navigation pane (/PageMode) and
 * the page and fit of its /OpenAction. */
export interface PdfOpeningView {
  readonly pageMode: unknown;
  readonly target: { pageNumber: number; fit: "page" | "width" | null } | null;
}

/** Both read at once; a part that cannot be read is null. Never rejects. */
export function readPdfOpeningView(doc: PdfDocument): Promise<PdfOpeningView> {
  const pageMode = Promise.resolve()
    .then(() => (doc as unknown as { getPageMode?: () => Promise<unknown> }).getPageMode?.())
    .then((mode) => mode ?? null, () => null);
  return Promise.all([pageMode, readPdfOpenActionPage(doc)])
    .then(([mode, target]) => ({ pageMode: mode, target }));
}
