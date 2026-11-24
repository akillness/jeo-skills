/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The reader's Picture Format of a PDF picture (lib/pdf/picture-format): the
 * format each picture was given in this window, and the picture as it was
 * before any of it, so every change is drawn from that picture again --
 * Corrections, Color, Artistic Effects, Picture Styles, Border, Crop to Shape,
 * Reset Picture -- and written as one native replacement, its frame grown in
 * the same step where the drawing reaches past the picture (a shadow, a
 * border). A picture whose pixels changed since (an Undo, a Change Picture)
 * starts again from what it shows.
 */

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";

import { pdfNativeEmbeddedImagePaintMatrixMatches } from "../../../../../lib/pdf/engine/native/embedded-image-model";
import { encodePictureCanvas } from "../../../../../lib/pdf/picture-pixels";
import {
  PDF_PICTURE_FORMAT_NONE,
  normalizePdfPictureFormat,
  pdfPictureCompressedSize,
  pdfPictureFormatIsPlain,
  samePdfPictureFormat,
  type PdfPictureFormat,
} from "../../../../../lib/pdf/picture-format";

import type {
  PdfNativeImageTarget,
  PdfNativePictureCommitOutcome,
  PdfNativePictureCommitRequest,
  PdfNativePictureOrigin,
} from "./nativeImageTarget";
import {
  PDF_PICTURE_NO_EXTENT,
  renderPdfPictureFormat,
  type PdfPictureFormatExtent,
} from "./pdfPictureFormatRaster";
import {
  extentFrameTransform,
  multiplyAffine,
  paintDisplayBox,
  paintSizePoints,
  paintToTransform,
  properSizePoints,
  type PdfAffine,
} from "./readerPictureFormatGeometry";

export type PreviewFrame = Readonly<{
  box: Readonly<{ x: number; y: number; width: number; height: number }>;
  rotation: number;
}>;

/** A formatted picture is kept within the working copy's own write size, so
 * its pixels and its frame are one step (one Undo). */
const FORMAT_MAX_BYTES = 1000 * 1024;

type Translate = (key: string, values?: Record<string, string | number>) => string;

interface FormatSession {
  /** The picture before any format of this window. */
  readonly original: HTMLCanvasElement;
  readonly format: PdfPictureFormat;
  /** What the written drawing reaches past the picture. */
  readonly extent: PdfPictureFormatExtent;
  /** The paint the picture had before any format (Reset Picture & Size). */
  readonly originalMatrix: PdfAffine;
  /** The pixel size last written: another size means the picture changed since. */
  readonly written: Readonly<{ width: number; height: number }>;
  /** Started from what the file names (a picture formatted in an earlier session). */
  readonly fromFile?: boolean;
}

export interface ReaderPictureFormat {
  /** The selected picture's format (none for a picture not formatted here). */
  readonly formatOf: (target: PdfNativeImageTarget | null) => PdfPictureFormat;
  /** Whether Reset Picture has anything to take back. */
  readonly canReset: (target: PdfNativeImageTarget | null) => boolean;
  readonly busy: boolean;
  readonly apply: (change: (format: PdfPictureFormat) => Partial<PdfPictureFormat>) => Promise<void>;
  /** What `apply` would draw, and where, with nothing written: a format hovered. */
  readonly draw: (change: (format: PdfPictureFormat) => Partial<PdfPictureFormat>) =>
    Promise<Readonly<{ canvas: HTMLCanvasElement; frame: PreviewFrame; upright: boolean; target: PdfNativeImageTarget }> | null>;
  /** Reset Picture (formats) / Reset Picture & Size (and the frame it had). */
  readonly reset: (withSize: boolean) => Promise<void>;
  /** Rework the picture itself (Sharpen, Draw): later formats draw on it. */
  readonly reworkPicture: (
    rework: (picture: HTMLCanvasElement) => HTMLCanvasElement | Promise<HTMLCanvasElement | null> | null,
    messages?: Readonly<{ nothing?: string; done?: string }>,
  ) => Promise<void>;
  /** Compress Pictures: the picture kept at `ppi` for its size on the page. */
  readonly compress: (ppi: number) => Promise<"compressed" | "unchanged" | "rejected">;
  /** The picture as it is before any format, for Draw's canvas. */
  readonly basePicture: (target: PdfNativeImageTarget) => Promise<HTMLCanvasElement | null>;
  /** Forget a picture's format (Change Picture, Delete). */
  readonly forget: (target: PdfNativeImageTarget) => void;
  /** The picture moved in the page's paint order (Arrange). */
  readonly moved: (pageNumber: number, fromOrder: number, toOrder: number) => void;
  /** Read where the selected picture came from, as the file names it: a
   * picture formatted in an earlier session is reset and formatted from the
   * picture before any format. */
  readonly recall: (target: PdfNativeImageTarget | null) => void;
}

/** What a formatted picture's file keeps of its format (the record named
 * beside the picture it was drawn from). */
type FormatRecord = Readonly<{ format: PdfPictureFormat; extent: PdfPictureFormatExtent; paint: PdfAffine }>;

function formatRecordText(record: FormatRecord): string {
  return JSON.stringify({ v: 1, format: record.format, extent: record.extent, paint: record.paint })
    .replace(/[^\x20-\x7e]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function readFormatRecord(text: string): FormatRecord | null {
  try {
    const value = JSON.parse(text) as { v?: unknown; format?: unknown; extent?: unknown; paint?: unknown };
    const extent = value.extent as Record<string, unknown> | null;
    const paint = value.paint;
    if (value.v !== 1 || !value.format || typeof value.format !== "object" || !extent ||
      !["left", "top", "right", "bottom"].every((side) => typeof extent[side] === "number" &&
        Number.isFinite(extent[side]) && (extent[side] as number) >= 0) ||
      !Array.isArray(paint) || paint.length !== 6 || !paint.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return null;
    }
    return Object.freeze({
      format: normalizePdfPictureFormat(value.format as Partial<PdfPictureFormat>),
      extent: Object.freeze({ left: extent.left as number, top: extent.top as number,
        right: extent.right as number, bottom: extent.bottom as number }),
      paint: paint as unknown as PdfAffine,
    });
  } catch {
    return null;
  }
}

const keyOf = (pageNumber: number, order: number) => `${pageNumber}:${order}`;

async function pixelSize(bytes: Uint8Array, mimeType: string): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mimeType }));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return null;
  }
}










function formatPreviewOf(
  target: PdfNativeImageTarget,
  paint: PdfAffine,
  drawing: HTMLCanvasElement,
  extent: PdfPictureFormatExtent,
): Readonly<{ frame: PreviewFrame; canvas: HTMLCanvasElement; upright: boolean }> | null {
  const display = target.display;
  const matrix = target.matrix as PdfAffine | undefined;
  // A clip that cuts it (its own, the page's, one around it) shows as a
  // visible box smaller than its paint.
  if (!display || !matrix) return null;
  const shown = paintDisplayBox(matrix, display);
  const bounds = target.bounds;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;
  if (
    !near(shown.left / display.width, bounds.x) || !near(shown.top / display.height, bounds.y) ||
    !near((shown.right - shown.left) / display.width, bounds.width) ||
    !near((shown.bottom - shown.top) / display.height, bounds.height)
  ) return null;
  const drawn = multiplyAffine(paint, display.transform as PdfAffine);
  const [ux, uy, vx, vy] = drawn;
  const width = Math.hypot(ux, uy);
  const height = Math.hypot(vx, vy);
  // Displayed y runs down and the picture's rows run up its unit square:
  // a picture shown as it is drawn turns u onto v clockwise.
  if (!(width > 0) || !(height > 0) || ux * vy - uy * vx >= 0) return null;
  const rotation = (Math.atan2(uy, ux) * 180) / Math.PI;
  const cx = drawn[4] + (ux + vx) / 2;
  const cy = drawn[5] + (uy + vy) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = drawing.width;
  canvas.height = drawing.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // The picture's own area is opaque: what the page paints under it now
  // (the picture before) must not show through a shape's corners.
  const total = paintSizePoints(paint);
  const kx = drawing.width / total.width;
  const ky = drawing.height / total.height;
  context.fillStyle = "#ffffff";
  context.fillRect(extent.left * kx, extent.top * ky,
    (total.width - extent.left - extent.right) * kx, (total.height - extent.top - extent.bottom) * ky);
  context.drawImage(drawing, 0, 0);
  return {
    frame: {
      box: {
        x: ((cx - width / 2) / display.width) * 100,
        y: ((cy - height / 2) / display.height) * 100,
        width: (width / display.width) * 100,
        height: (height / display.height) * 100,
      },
      rotation: Math.abs(rotation) < 0.01 ? 0 : rotation,
    },
    canvas,
    upright: Math.abs(rotation) < 45,
  };
}

function copyCanvas(source: HTMLCanvasElement, width = source.width, height = source.height): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (context) {
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

async function readOriginRecord(
  readOrigin: (target: PdfNativeImageTarget) => Promise<PdfNativePictureOrigin | null>,
  target: PdfNativeImageTarget,
): Promise<Readonly<{ record: FormatRecord; pixels: PdfNativePictureOrigin["pixels"] }> | null> {
  const origin = await readOrigin(target).catch(() => null);
  const record = origin ? readFormatRecord(origin.data) : null;
  return origin && record ? Object.freeze({ record, pixels: origin.pixels }) : null;
}

export function useReaderPictureFormat(input: Readonly<{
  t: Translate;
  notify: (message: string | null, tone?: "error" | "status") => void;
  selectedRef: RefObject<PdfNativeImageTarget | null>;
  readPixels: (target: PdfNativeImageTarget) => Promise<HTMLCanvasElement | null>;
  runWrite: (
    request: PdfNativePictureCommitRequest,
    frame: PreviewFrame | null,
    preview: HTMLCanvasElement | null,
    /** Where `preview` stands when `frame` is not given (a turned picture). */
    place?: PreviewFrame | null,
  ) => Promise<PdfNativePictureCommitOutcome | null>;
  refuseWhenReadOnly: () => boolean;
  /** Where a picture came from, as the file names it. */
  readOrigin?: (target: PdfNativeImageTarget) => Promise<PdfNativePictureOrigin | null>;
}>): ReaderPictureFormat {
  const { t, notify, selectedRef, readPixels, runWrite, refuseWhenReadOnly, readOrigin } = input;
  /** What the file names for each picture shown (its revision's), read on
   * selection: a picture formatted in an earlier session. */
  const originsRef = useRef(new Map<string, Readonly<{ sha: string | undefined;
    origin: Promise<Readonly<{ record: FormatRecord; pixels: PdfNativePictureOrigin["pixels"] }> | null>;
    record: FormatRecord | null | undefined }>>());
  const originOf = useCallback((target: PdfNativeImageTarget) => {
    const key = keyOf(target.pageNumber, target.order);
    const known = originsRef.current.get(key);
    return known && known.sha === target.sourceSha256 ? known : null;
  }, []);
  const sessionsRef = useRef(new Map<string, FormatSession>());
  // Bumped by every write and forget: the returned value changes with it, so
  // a ribbon reading the format through it reads the new one.
  const [epoch, setEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  /** The picture's session, started from what it shows when there is none
   * or it changed since the last write. */
  const sessionFor = useCallback(
    async (target: PdfNativeImageTarget): Promise<{ session: FormatSession; shown: HTMLCanvasElement } | null> => {
      if (!target.matrix) return null;
      const key = keyOf(target.pageNumber, target.order);
      const kept = sessionsRef.current.get(key);
      const shown = await readPixels(target);
      // Between a write and the page read again the shown page may not hold
      // the picture under its old name (a replacement writes a new one): the
      // session goes on from what this window wrote.
      if (!shown) return kept ? { session: kept, shown: kept.original } : null;
      if (kept && kept.written.width === shown.width && kept.written.height === shown.height) {
        return { session: kept, shown };
      }
      // Formatted in an earlier session: the file names the picture before
      // any format, and the format drawn (Reset Picture went back only to
      
      const named = await (originOf(target)?.origin ?? Promise.resolve(null));
      const before = named ? await named.pixels() : null;
      if (named && before) {
        const session: FormatSession = {
          original: before,
          format: named.record.format,
          extent: named.record.extent,
          originalMatrix: named.record.paint,
          written: { width: shown.width, height: shown.height },
          fromFile: true,
        };
        sessionsRef.current.set(key, session);
        return { session, shown };
      }
      const session: FormatSession = {
        original: shown,
        format: PDF_PICTURE_FORMAT_NONE,
        extent: PDF_PICTURE_NO_EXTENT,
        originalMatrix: target.matrix as PdfAffine,
        written: { width: shown.width, height: shown.height },
      };
      sessionsRef.current.set(key, session);
      return { session, shown };
    },
    [originOf, readPixels],
  );

  /** Draw `format` on `original` and write it, the frame grown or shrunk to
   * what the drawing reaches (or put back to `paint`). */
  const write = useCallback(
    async (
      target: PdfNativeImageTarget,
      session: FormatSession,
      next: Readonly<{ original: HTMLCanvasElement; format: PdfPictureFormat; paint?: PdfAffine }>,
      messages?: Readonly<{ done?: string }>,
    ): Promise<boolean> => {
      const matrix = target.matrix as PdfAffine;
      const proper = properSizePoints(matrix, session.extent);
      const started = performance.now();
      const trace = (stage: string, detail?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== "production") {
          console.info(`[pdf-picture] format ${stage}`, { ms: Math.round(performance.now() - started), ...detail });
        }
      };
      const render = pdfPictureFormatIsPlain(next.format)
        ? { canvas: next.original, extent: PDF_PICTURE_NO_EXTENT }
        : await renderPdfPictureFormat({
            source: next.original,
            widthPt: proper.width,
            heightPt: proper.height,
            format: next.format,
          });
      if (!render) {
        trace("drawing failed");
        notify(t("pdf.viewer.picture.formatFailed"), "error");
        return false;
      }
      trace("drawn", { width: render.canvas.width, height: render.canvas.height, extent: render.extent });
      const encoded = await encodePictureCanvas(render.canvas, { maxBytes: FORMAT_MAX_BYTES, allowDownscale: true });
      trace("encoded", { bytes: encoded?.bytes.byteLength ?? null, mimeType: encoded?.mimeType ?? null });
      if (!encoded) {
        notify(t("pdf.viewer.picture.sharpenTooLarge"), "error");
        return false;
      }
      // The page read again meanwhile (the write before painted) lists the
      // same picture as a new target: the drawing goes to it. It returned
      // without a word before, and Artistic Effects given just after a
      
      const current = selectedRef.current;
      if (current !== target) {
        if (!current || current.pageNumber !== target.pageNumber || current.order !== target.order) return false;
        if (current.sourceSha256 !== target.sourceSha256 &&
          !pdfNativeEmbeddedImagePaintMatrixMatches(current.matrix, target.matrix)) {
          notify(t("pdf.viewer.picture.formatFailed"), "error");
          return false;
        }
        target = current;
      }
      const size = await pixelSize(encoded.bytes, encoded.mimeType);
      const pageTransform = next.paint
        ? paintToTransform(matrix, next.paint)
        : extentFrameTransform(matrix, session.extent, render.extent);
      // Shown at once in its new frame: the page paints the write seconds
      // later (a page read again under load took 6-33 s).
      const shown = formatPreviewOf(target, pageTransform ? multiplyAffine(matrix, pageTransform) : matrix,
        render.canvas, render.extent);
      trace("preview", { shown: Boolean(shown) });
      const outcome = await runWrite(
        {
          kind: "replace",
          target,
          bytes: encoded.bytes,
          mimeType: encoded.mimeType,
          ...(pageTransform ? { pageTransform } : {}),
          origin: formatRecordText({ format: next.format, extent: render.extent, paint: session.originalMatrix }),
        },
        shown?.upright ? shown.frame : null,
        shown?.canvas ?? null,
        shown && !shown.upright ? shown.frame : null,
      );
      trace("written", { ok: Boolean(outcome?.ok), frame: Boolean(pageTransform),
        reason: outcome && !outcome.ok ? outcome.reason : outcome === null ? "not run" : null });
      if (!outcome?.ok) return false;
      sessionsRef.current.set(keyOf(target.pageNumber, target.order), {
        ...session,
        original: next.original,
        format: next.format,
        extent: render.extent,
        written: size ?? { width: render.canvas.width, height: render.canvas.height },
      });
      setEpoch((epoch) => epoch + 1);
      if (messages?.done) notify(messages.done, "status");
      return true;
    },
    [notify, runWrite, selectedRef, t],
  );

  /** One format command at a time: a second waits for the first's write. */
  const exclusive = useCallback(async (run: () => Promise<void>) => {
    if (busyRef.current) {
      if (process.env.NODE_ENV !== "production") console.info("[pdf-picture] format busy");
      notify(t("pdf.viewer.picture.busy"), "status");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await run();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [notify, t]);

  const apply = useCallback<ReaderPictureFormat["apply"]>(
    (change) =>
      exclusive(async () => {
        const target = selectedRef.current;
        if (!target || refuseWhenReadOnly()) return;
        const found = await sessionFor(target);
        if (process.env.NODE_ENV !== "production") {
          console.info("[pdf-picture] format session", { found: Boolean(found), matrix: Boolean(target.matrix) });
        }
        if (!found) {
          notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
          return;
        }
        const { session } = found;
        const format = normalizePdfPictureFormat({ ...session.format, ...change(session.format) });
        if (samePdfPictureFormat(format, session.format)) return;
        await write(target, session, { original: session.original, format });
      }),
    [exclusive, notify, refuseWhenReadOnly, selectedRef, sessionFor, t, write],
  );

  // A format drawn stays for a return to it, until the picture is written again.
  const drawnRef = useRef(new Map<string, Readonly<{ canvas: HTMLCanvasElement; frame: PreviewFrame; upright: boolean; target: PdfNativeImageTarget }>>());
  const draw = useCallback<ReaderPictureFormat["draw"]>(async (change) => {
    const target = selectedRef.current;
    if (!target?.matrix) return null;
    const found = await sessionFor(target);
    if (!found) return null;
    const { session } = found;
    const format = normalizePdfPictureFormat({ ...session.format, ...change(session.format) });
    if (samePdfPictureFormat(format, session.format)) return null;
    const key = `${keyOf(target.pageNumber, target.order)}|${target.sourceSha256 ?? ""}|${JSON.stringify(format)}`;
    const known = drawnRef.current.get(key);
    if (known) return known;
    const matrix = target.matrix as PdfAffine;
    const proper = properSizePoints(matrix, session.extent);
    const render = pdfPictureFormatIsPlain(format)
      ? { canvas: session.original, extent: PDF_PICTURE_NO_EXTENT }
      : await renderPdfPictureFormat({ source: session.original, widthPt: proper.width, heightPt: proper.height, format });
    if (!render) return null;
    const pageTransform = extentFrameTransform(matrix, session.extent, render.extent);
    const shown = formatPreviewOf(target, pageTransform ? multiplyAffine(matrix, pageTransform) : matrix, render.canvas, render.extent);
    if (!shown) return null;
    const drawn = Object.freeze({ canvas: shown.canvas, frame: shown.frame, upright: shown.upright, target });
    if (drawnRef.current.size >= 12) drawnRef.current.clear();
    drawnRef.current.set(key, drawn);
    return drawn;
  }, [selectedRef, sessionFor]);

  const reset = useCallback<ReaderPictureFormat["reset"]>(
    (withSize) =>
      exclusive(async () => {
        const target = selectedRef.current;
        if (!target || refuseWhenReadOnly()) return;
        const kept = sessionsRef.current.get(keyOf(target.pageNumber, target.order));
        if (!kept && !originOf(target)) return;
        const found = await sessionFor(target);
        // Formatted here, or in an earlier session as the file says.
        if (!found || (kept ? found.session !== kept : !found.session.fromFile)) {
          notify(t("pdfContextRibbon.picture.noEditsToReset"), "status");
          return;
        }
        const session = found.session;
        await write(target, session, {
          original: session.original,
          format: PDF_PICTURE_FORMAT_NONE,
          ...(withSize ? { paint: session.originalMatrix } : {}),
        });
      }),
    [exclusive, notify, originOf, refuseWhenReadOnly, selectedRef, sessionFor, t, write],
  );

  const reworkPicture = useCallback<ReaderPictureFormat["reworkPicture"]>(
    (rework, messages) =>
      exclusive(async () => {
        const target = selectedRef.current;
        if (!target || refuseWhenReadOnly()) return;
        const found = await sessionFor(target);
        if (!found) {
          notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
          return;
        }
        const reworked = await rework(copyCanvas(found.session.original));
        if (!reworked) {
          if (messages?.nothing) notify(messages.nothing, "status");
          return;
        }
        await write(target, found.session, { original: reworked, format: found.session.format }, messages);
      }),
    [exclusive, notify, refuseWhenReadOnly, selectedRef, sessionFor, t, write],
  );

  const compress = useCallback<ReaderPictureFormat["compress"]>(
    async (ppi) => {
      let result: "compressed" | "unchanged" | "rejected" = "rejected";
      await exclusive(async () => {
        const target = selectedRef.current;
        if (!target?.matrix || refuseWhenReadOnly()) return;
        const found = await sessionFor(target);
        if (!found) {
          notify(t("pdf.viewer.picture.pixelsUnavailable"), "error");
          return;
        }
        const { session } = found;
        const points = properSizePoints(target.matrix as PdfAffine, session.extent);
        const size = pdfPictureCompressedSize(session.original, points, ppi);
        if (size.width >= session.original.width && size.height >= session.original.height) {
          notify(t("pdf.viewer.picture.compressNothing", { ppi }), "status");
          result = "unchanged";
          return;
        }
        const written = await write(
          target,
          session,
          { original: copyCanvas(session.original, size.width, size.height), format: session.format },
          { done: t("pdf.viewer.picture.compressed", { width: size.width, height: size.height }) },
        );
        result = written ? "compressed" : "rejected";
      });
      return result;
    },
    [exclusive, notify, refuseWhenReadOnly, selectedRef, sessionFor, t, write],
  );

  const basePicture = useCallback<ReaderPictureFormat["basePicture"]>(
    async (target) => (await sessionFor(target))?.session.original ?? null,
    [sessionFor],
  );

  const formatOf = useCallback<ReaderPictureFormat["formatOf"]>(
    (target) =>
      (target && (sessionsRef.current.get(keyOf(target.pageNumber, target.order))?.format ??
        originOf(target)?.record?.format)) ?? PDF_PICTURE_FORMAT_NONE,
    [originOf],
  );
  const canReset = useCallback<ReaderPictureFormat["canReset"]>((target) => {
    if (!target) return false;
    const session = sessionsRef.current.get(keyOf(target.pageNumber, target.order)) ??
      (() => {
        const record = originOf(target)?.record;
        return record ? { format: record.format, originalMatrix: record.paint } : null;
      })();
    if (!session) return false;
    if (!pdfPictureFormatIsPlain(session.format)) return true;
    const now = target.matrix ? paintSizePoints(target.matrix as PdfAffine) : null;
    const before = paintSizePoints(session.originalMatrix);
    return Boolean(now && (Math.abs(now.width - before.width) > 0.01 || Math.abs(now.height - before.height) > 0.01));
  }, [originOf]);
  const recall = useCallback<ReaderPictureFormat["recall"]>((target) => {
    if (!target || !readOrigin || sessionsRef.current.has(keyOf(target.pageNumber, target.order)) || originOf(target)) {
      return;
    }
    const key = keyOf(target.pageNumber, target.order);
    const entry: { sha: string | undefined; origin: ReturnType<typeof readOriginRecord>; record: FormatRecord | null | undefined } = {
      sha: target.sourceSha256,
      origin: Promise.resolve(null),
      record: undefined,
    };
    entry.origin = readOriginRecord(readOrigin, target).then((found) => {
      entry.record = found?.record ?? null;
      // The ribbon reads the format and Reset through the returned value.
      if (found && originsRef.current.get(key) === entry) setEpoch((epoch) => epoch + 1);
      return found;
    });
    originsRef.current.set(key, entry);
  }, [originOf, readOrigin]);
  const forget = useCallback<ReaderPictureFormat["forget"]>((target) => {
    if (sessionsRef.current.delete(keyOf(target.pageNumber, target.order))) setEpoch((epoch) => epoch + 1);
  }, []);
  const moved = useCallback<ReaderPictureFormat["moved"]>((pageNumber, fromOrder, toOrder) => {
    if (fromOrder === toOrder) return;
    const sessions = sessionsRef.current;
    const session = sessions.get(keyOf(pageNumber, fromOrder));
    // Every picture between the two places moved by one: their sessions are
    // let go rather than guessed at (they start again from what they show).
    for (const key of [...sessions.keys()]) {
      const [page, order] = key.split(":").map(Number);
      if (page === pageNumber && order >= Math.min(fromOrder, toOrder) && order <= Math.max(fromOrder, toOrder)) {
        sessions.delete(key);
      }
    }
    if (session) sessions.set(keyOf(pageNumber, toOrder), session);
    setEpoch((epoch) => epoch + 1);
  }, []);

  return useMemo(
    () => ({ formatOf, canReset, busy, apply, draw, reset, reworkPicture, compress, basePicture, forget, moved, recall }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- epoch: the sessions changed
    [apply, basePicture, busy, canReset, compress, epoch, forget, formatOf, moved, recall, reset, reworkPicture],
  );
}
