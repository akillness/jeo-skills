/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PDF_JS_DOCUMENT_ASSETS } from "@mrnote/core/web/lib/pdf/pdfjs-runtime.ts";
import { pdfRedactionReachabilityV2Enabled } from "../../../../../lib/pdf/pdf-flags";
import {
  createPdfPrintPageInventory,
  PDF_PRINT_INVENTORY_MAX_PAGES,
  type PdfPrintPageInventory,
  type PdfPrintPageInventoryInput,
} from "../../../../../lib/pdf/print-preflight";
import { verifyRedaction } from "../../../../../lib/pdf/redaction-plan";
import { normalizeRotation, type PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";
import {
  replaceRedactedPages,
  type FlattenExportMeasurementsInput,
} from "../../../../../lib/pdf/remote/pdf-export";
import {
  PDF_IMAGE_ONLY_MAX_PAGES,
  PDF_IMAGE_ONLY_MAX_PAGE_POINTS,
  PDF_IMAGE_ONLY_MAX_CANVAS_DIMENSION,
  PDF_IMAGE_ONLY_MAX_PAGE_PIXELS,
  PDF_IMAGE_ONLY_MAX_AGGREGATE_PIXELS,
  PDF_IMAGE_ONLY_MAX_OUTPUT_BYTES,
} from "./outputLimits";
import { PDF_VERIFIED_PDFA_MAX_OUTPUT_BYTES } from "./verifiedPdfa";
import { type PdfDocument, loadPdfApi } from "./pdfApi";
import type { PageRecord } from "./pageRecord";
import { canvasToPngBytes } from "./exportRendering";

export interface PdfImageOnlyPageInventoryEntry {
  readonly pageNumber: number;
  readonly sourceRotation: PdfRotation;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export async function verifyPdfaClientReopen(
  bytes: Uint8Array,
  expectedPageCount: number,
): Promise<boolean> {
  if (
    bytes.byteLength < 8 ||
    bytes.byteLength > PDF_VERIFIED_PDFA_MAX_OUTPUT_BYTES ||
    !Number.isSafeInteger(expectedPageCount) ||
    expectedPageCount < 1 ||
    expectedPageCount > 4_096
  ) {
    return false;
  }
  const pdfjs = await loadPdfApi();
  const witnessBytes = new Uint8Array(bytes);
  const loadingTask = pdfjs.getDocument({ data: witnessBytes });
  let document: PdfDocument | null = null;
  try {
    document = await loadingTask.promise;
    if (document.numPages !== expectedPageCount) return false;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      if (
        page.pageNumber !== pageNumber ||
        !Number.isFinite(viewport.width) ||
        viewport.width <= 0 ||
        !Number.isFinite(viewport.height) ||
        viewport.height <= 0
      ) {
        return false;
      }
      await page.getTextContent();
      page.cleanup?.();
    }
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (document) await document.destroy();
      else await loadingTask.destroy();
    } catch {
      // The semantic witness result above remains authoritative.
    }
  }
}

export async function readPdfPrintPageInventory(
  bytes: Uint8Array,
): Promise<PdfPrintPageInventory> {
  const pdfjs = await loadPdfApi();
  // pdf.js may transfer/detach its input. The exact bytes offered to Blob must
  // remain untouched after this witness, so the loader receives a private copy.
  const witnessBytes = new Uint8Array(bytes.byteLength);
  witnessBytes.set(bytes);
  const loadingTask = pdfjs.getDocument({ data: witnessBytes });
  let document: PdfDocument | null = null;
  try {
    document = await loadingTask.promise;
    if (
      !Number.isSafeInteger(document.numPages) ||
      document.numPages < 0 ||
      document.numPages > PDF_PRINT_INVENTORY_MAX_PAGES
    ) {
      throw new Error("Invalid final PDF page count");
    }
    const pages: PdfPrintPageInventoryInput[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      pages.push({
        page: page.pageNumber,
        widthPt: viewport.width,
        heightPt: viewport.height,
        rotation: page.rotate,
      });
      page.cleanup?.();
    }
    return createPdfPrintPageInventory(pages);
  } finally {
    try {
      if (document) await document.destroy();
      else await loadingTask.destroy();
    } catch {
      // The semantic witness above is complete; cleanup remains best-effort.
    }
  }
}

export function createPdfImageOnlyPageInventory(
  document: PdfDocument,
  records: readonly PageRecord[],
  dpi: number,
): readonly PdfImageOnlyPageInventoryEntry[] | null {
  if (
    !Number.isSafeInteger(dpi) ||
    ![96, 150, 300].includes(dpi) ||
    !Number.isSafeInteger(document.numPages) ||
    document.numPages < 1 ||
    document.numPages > PDF_IMAGE_ONLY_MAX_PAGES ||
    records.length !== document.numPages
  ) {
    return null;
  }

  let aggregatePixels = 0;
  const inventory: PdfImageOnlyPageInventoryEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const rotation = normalizeRotation(record.nativeRotation);
    if (
      record.pageNumber !== index + 1 ||
      rotation !== record.nativeRotation ||
      !Number.isFinite(record.width) ||
      !Number.isFinite(record.height) ||
      record.width <= 0 ||
      record.height <= 0 ||
      record.width > PDF_IMAGE_ONLY_MAX_PAGE_POINTS ||
      record.height > PDF_IMAGE_ONLY_MAX_PAGE_POINTS
    ) {
      return null;
    }
    const swapsAxes = rotation === 90 || rotation === 270;
    const widthPt = swapsAxes ? record.height : record.width;
    const heightPt = swapsAxes ? record.width : record.height;
    const pixelWidth = ceilPdfRasterDimension(
      (widthPt * dpi) / 72,
    );
    const pixelHeight = ceilPdfRasterDimension(
      (heightPt * dpi) / 72,
    );
    const pagePixels = pixelWidth * pixelHeight;
    aggregatePixels += pagePixels;
    if (
      !Number.isSafeInteger(pixelWidth) ||
      !Number.isSafeInteger(pixelHeight) ||
      pixelWidth < 1 ||
      pixelHeight < 1 ||
      pixelWidth > PDF_IMAGE_ONLY_MAX_CANVAS_DIMENSION ||
      pixelHeight > PDF_IMAGE_ONLY_MAX_CANVAS_DIMENSION ||
      !Number.isSafeInteger(pagePixels) ||
      pagePixels > PDF_IMAGE_ONLY_MAX_PAGE_PIXELS ||
      !Number.isSafeInteger(aggregatePixels) ||
      aggregatePixels > PDF_IMAGE_ONLY_MAX_AGGREGATE_PIXELS
    ) {
      return null;
    }
    inventory.push(
      Object.freeze({
        pageNumber: index + 1,
        sourceRotation: rotation,
        widthPt,
        heightPt,
        pixelWidth,
        pixelHeight,
      }),
    );
  }
  return Object.freeze(inventory);
}

export function ceilPdfRasterDimension(value: number): number {
  const nearestInteger = Math.round(value);
  return Math.abs(value - nearestInteger) <= 1e-7
    ? nearestInteger
    : Math.ceil(value);
}

export async function verifyPdfImageOnlyOutput(
  bytes: Uint8Array,
  expected: readonly PdfImageOnlyPageInventoryEntry[],
): Promise<boolean> {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > PDF_IMAGE_ONLY_MAX_OUTPUT_BYTES ||
    expected.length < 1 ||
    expected.length > PDF_IMAGE_ONLY_MAX_PAGES
  ) {
    return false;
  }
  const pdfjs = await loadPdfApi();
  const witnessBytes = new Uint8Array(bytes.byteLength);
  witnessBytes.set(bytes);
  const loadingTask = pdfjs.getDocument({ data: witnessBytes });
  let document: PdfDocument | null = null;
  try {
    document = await loadingTask.promise;
    if (document.numPages !== expected.length) return false;
    for (let pageNumber = 1; pageNumber <= expected.length; pageNumber += 1) {
      const expectedPage = expected[pageNumber - 1];
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      const annotations = await page.getAnnotations();
      if (
        page.pageNumber !== expectedPage.pageNumber ||
        normalizeRotation(page.rotate) !== 0 ||
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        Math.abs(viewport.width - expectedPage.widthPt) > 0.01 ||
        Math.abs(viewport.height - expectedPage.heightPt) > 0.01 ||
        annotations.length !== 0
      ) {
        return false;
      }
      const textContent = await page.getTextContent();
      if (
        !Array.isArray(textContent.items) ||
        textContent.items.some(
          (item) =>
            item === null ||
            typeof item !== "object" ||
            ("str" in item &&
              (typeof item.str !== "string" || item.str.trim().length > 0)),
        )
      ) {
        return false;
      }
      page.cleanup?.();
    }
    return true;
  } catch {
    return false;
  } finally {
    try {
      if (document) await document.destroy();
      else await loadingTask.destroy();
    } catch {
      // The verification result is authoritative; cleanup is best-effort.
    }
  }
}

export async function rasterizeAndVerifyRedactedPdfPages(
  flattenedBytes: Uint8Array,
  redactedPages: ReadonlySet<number>,
  measurements?: FlattenExportMeasurementsInput,
): Promise<Uint8Array> {
  if (redactedPages.size === 0) return flattenedBytes;
  if (!pdfRedactionReachabilityV2Enabled()) {
    throw new Error("Secure redaction apply is unavailable");
  }
  if (typeof document === "undefined") {
    throw new Error("Secure redaction apply requires a browser renderer");
  }

  const pdfjs = await loadPdfApi();
  const bytesForPdfJs = new Uint8Array(flattenedBytes.byteLength);
  bytesForPdfJs.set(flattenedBytes);
  const task = pdfjs.getDocument({
    data: bytesForPdfJs,
    useSystemFonts: true,
    ...PDF_JS_DOCUMENT_ASSETS,
  });
  const rendered = await task.promise;
  const expectedPageCount = rendered.numPages;
  const pageNumbers = [...redactedPages];
  // The engine host swaps each redacted page for the raster drawn here,
  // strips its form fields, points the outline at the replacement and prunes
  // what only the old pages reached (replaceRedactedPages); the browser
  // draws the pages and proves the result below.
  const rasters: Array<{
    pageNumber: number;
    png: Uint8Array;
    width: number;
    height: number;
  }> = [];
  try {
    if (
      pageNumbers.some(
        (pageNumber) =>
          !Number.isInteger(pageNumber) ||
          pageNumber < 1 ||
          pageNumber > expectedPageCount,
      )
    ) {
      throw new Error("Redacted PDF semantic proof failed");
    }
    pageNumbers.sort((a, b) => b - a);
    for (const pageNumber of pageNumbers) {
      const pdfPage = await rendered.getPage(pageNumber);
      const mediaWidth = pdfPage.getViewport({ scale: 1, rotation: 0 }).width;
      const scale = Math.min(3, Math.max(1.5, 1800 / Math.max(mediaWidth, 1)));
      // pdf.js renders at the page's effective /Rotate (a 90/270 page swaps the
      // viewport axes), so the replacement image page must take the ROTATED
      // dimensions — sizing it from the unrotated media box would stretch a
      // rotated raster (e.g. a page the user rotated before redacting).
      const viewport = pdfPage.getViewport({ scale });
      const width = viewport.width / scale;
      const height = viewport.height / scale;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Unable to render redacted PDF page");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({
        canvas,
        viewport,
        background: "white",
      }).promise;
      const pngBytes = await canvasToPngBytes(canvas);
      if (!pngBytes) {
        throw new Error("Unable to encode redacted PDF page image");
      }
      rasters.push({ pageNumber, png: pngBytes, width, height });
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await rendered.destroy?.();
    await task.destroy?.();
  }

  // The swap, the prune and the measurements (written after the rasters so
  // they cannot be eaten) happen in one server call; no PDF mutation follows,
  // so the semantic witness below sees the exact bytes that return to
  // Blob/download/remember.
  const { bytes: finalBytes } = await replaceRedactedPages(
    flattenedBytes,
    rasters,
    measurements,
  );

  // The reachability walk proves the old page objects cannot be reached from
  // the final graph. Independently reopen the EXACT serialized bytes and prove
  // that every supervisor-mapped replacement page has no semantic text layer.
  // Neither the successful renderer nor the transport bytes are a substitute
  // for this witness, and no Blob/download side effect occurs until it passes.
  const proofBytes = new Uint8Array(finalBytes.byteLength);
  proofBytes.set(finalBytes);
  const proofTask = pdfjs.getDocument({
    data: proofBytes,
    useSystemFonts: true,
    ...PDF_JS_DOCUMENT_ASSETS,
  });
  let proofDocument: PdfDocument | null = null;
  try {
    proofDocument = await proofTask.promise;
    if (proofDocument.numPages !== expectedPageCount) {
      throw new Error("page count changed");
    }
    const appliedPageTexts = Array.from(
      { length: expectedPageCount },
      () => "",
    );
    const proofPages = new Set<number>();
    for (const pageNumber of [...pageNumbers].sort((a, b) => a - b)) {
      if (
        proofPages.has(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > proofDocument.numPages
      ) {
        throw new Error("redacted page identity changed");
      }
      const page = await proofDocument.getPage(pageNumber);
      if (page.pageNumber !== pageNumber || proofPages.has(page.pageNumber)) {
        throw new Error("redacted page identity changed");
      }
      proofPages.add(page.pageNumber);
      const textContent = await page.getTextContent();
      appliedPageTexts[pageNumber - 1] = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join("");
    }
    if (proofPages.size !== pageNumbers.length) {
      throw new Error("redacted page identity changed");
    }
    const verification = verifyRedaction(
      {
        marks: [],
        wholePages: [...proofPages],
        invalidCustomPattern: false,
      },
      appliedPageTexts,
    );
    if (!verification.verified || verification.survivingPages.length > 0) {
      throw new Error("semantic text survived redaction");
    }
  } catch {
    throw new Error("Redacted PDF semantic proof failed");
  } finally {
    await proofDocument?.destroy?.();
    await proofTask.destroy?.();
  }
  return finalBytes;
}
