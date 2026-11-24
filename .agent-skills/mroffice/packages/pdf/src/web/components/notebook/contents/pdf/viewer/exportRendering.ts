/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { renderKatexInto } from "@mrnote/core/web/lib/katex-render.ts";
import { isSafeHexColor } from "@mrnote/core/web/lib/pdf/safe-color.ts";
import {
  resolveSignatureFont,
  sanitizeSignatureImage,
  type SignatureAnnotation,
} from "@mrnote/core/web/lib/pdf/signatures.ts";
import type { FlattenImageBytes } from "@/lib/pdf/flatten-apply";
import {
  normalizePdfFormulaForRender,
  PDF_FORMULA_KATEX_RENDER_OPTIONS,
} from "@mrnote/core/web/lib/pdf/formula-render.ts";
import { absolutizeCssUrls } from "../../../../../lib/pdf/formula-export-css";
import type { SignatureImageOp, TextOp } from "@mrnote/core/web/lib/pdf/flatten.ts";
import type { PageRecord } from "./pageRecord";

export function formulaExportColor(op: TextOp): string {
  const r = Math.round(Math.min(1, Math.max(0, op.color.r)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, op.color.g)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, op.color.b)) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function katexExportCssText(): string {
  if (typeof document === "undefined") return "";
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList | null = null;
    try {
      cssRules = sheet.cssRules;
    } catch {
      cssRules = null;
    }
    if (!cssRules) continue;
    for (const rule of Array.from(cssRules)) {
      const text = rule.cssText;
      if (text.includes(".katex") || text.includes("KaTeX_")) {
        rules.push(absolutizeCssUrls(text, sheet.href ?? document.baseURI));
      }
    }
  }
  rules.push(
    ".katex-display{margin:0}",
    ".katex{color:inherit}",
    ".pdf-formula-export-root{display:inline-block;background:transparent;box-sizing:border-box;overflow:visible;max-width:none}",
  );
  return rules.join("\n");
}

export async function waitForFormulaExportFonts(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return;
  try {
    await fonts.ready;
  } catch {
    // A font-loading failure is surfaced by the subsequent raster/blank checks.
  }
}

export function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Formula SVG image failed to load."));
    image.src = dataUrl;
  });
}

export function canvasToEncodedImageBytes(
  canvas: HTMLCanvasElement,
  mimeType: "image/png" | "image/jpeg",
  quality?: number,
): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, mimeType, quality);
  });
}

export function canvasToPngBytes(
  canvas: HTMLCanvasElement,
): Promise<Uint8Array | null> {
  return canvasToEncodedImageBytes(canvas, "image/png");
}

export function canvasHasVisiblePixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const pixels = ctx.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function renderFormulaTextOpToImage(
  op: TextOp,
): Promise<FlattenImageBytes | null> {
  const normalizedLatex = normalizePdfFormulaForRender(op.latex ?? "");
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !normalizedLatex.trim()
  ) {
    return null;
  }
  const host = document.createElement("div");
  host.className = "pdf-formula-export-root";
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.style.display = "inline-block";
  host.style.padding = "4px";
  host.style.boxSizing = "border-box";
  host.style.overflow = "visible";
  host.style.maxWidth = "none";
  host.style.fontSize = `${Math.max(6, op.fontSize)}px`;
  host.style.color = formulaExportColor(op);
  host.style.lineHeight = "1.2";
  host.style.background = "transparent";
  try {
    renderKatexInto(host, normalizedLatex, PDF_FORMULA_KATEX_RENDER_OPTIONS);
    document.body.appendChild(host);
    await waitForFormulaExportFonts();
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    const css = katexExportCssText();
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<foreignObject x="0" y="0" width="${width}" height="${height}">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" class="pdf-formula-export-root" style="display:inline-block;box-sizing:border-box;overflow:visible;max-width:none;font-size:${Math.max(6, op.fontSize)}px;color:${formulaExportColor(op)};line-height:1.2;background:transparent;padding:4px;">`,
      `<style>${css}</style>`,
      host.innerHTML,
      "</div>",
      "</foreignObject>",
      "</svg>",
    ].join("");
    const image = await loadImageFromDataUrl(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Formula export canvas is unavailable.");
    }
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    if (!canvasHasVisiblePixels(ctx, canvas.width, canvas.height)) {
      throw new Error("Formula export produced a blank image.");
    }
    const bytes = await canvasToPngBytes(canvas);
    if (!bytes) {
      throw new Error("Formula export produced no PNG bytes.");
    }
    return {
      bytes,
      mimeType: "image/png",
      displayWidth: width,
      displayHeight: height,
    };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Formula export rasterization failed.");
  } finally {
    host.remove();
  }
}

/** Typed-signature ink color, mirroring the `.pdf-viewer__signature-text` CSS. */
export const SIGNATURE_EXPORT_TEXT_COLOR = "#0f172a";

/**
 * Rasterize a TYPED signature op into a PNG for flatten-export. The base-14
 * standard fonts have no cursive face, so the styled script text is drawn onto
 * a canvas in the same allow-listed CSS font stack the overlay uses (see
 * lib/pdf/signatures.ts) at 2-3x devicePixelRatio, exactly like
 * {@link renderFormulaTextOpToImage}. The op rect (PDF points) is the CSS-px
 * layout basis; `displayWidth`/`displayHeight` map the high-DPI raster back
 * onto the placed box. Throws on a blank/failed raster so the export fails
 * instead of silently dropping the signature. DRAWN signatures never reach
 * this resolver — they carry their own data URL.
 */
export async function renderTypedSignatureOpToImage(
  op: SignatureImageOp,
): Promise<FlattenImageBytes | null> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }
  const text = op.text.trim();
  if (!text) return null;
  const width = Math.max(1, Math.ceil(op.width));
  const height = Math.max(1, Math.ceil(op.height));
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Signature export canvas is unavailable.");
  }
  ctx.scale(scale, scale);
  const isStamp = op.source === "stamp";
  // A rubber STAMP op renders as bold bordered sans text in its preset color
  // (mirroring the stamp overlay); a typed signature as script text in ink.
  const family = isStamp
    ? '"Helvetica Neue", Arial, sans-serif'
    : resolveSignatureFont(op.font);
  const fontPrefix = isStamp ? "bold " : "";
  const color =
    isStamp && isSafeHexColor(op.color ?? "")
      ? (op.color as string)
      : isStamp
        ? "#b91c1c"
        : SIGNATURE_EXPORT_TEXT_COLOR;
  // Rounded border frame for the stamp; the text must fit inside it.
  const borderWidth = isStamp ? Math.max(1, height * 0.06) : 0;
  const inset = borderWidth * 1.5;
  const textMaxWidth = isStamp ? (width - 2 * inset) * 0.88 : width * 0.96;
  // The overlay centers one nowrap line in the box: start from a height-based
  // size and shrink until the measured line fits the box width (a small slack
  // keeps script-font glyph overhangs off the box edges).
  let fontSize = Math.max(6, Math.floor(height * (isStamp ? 0.5 : 0.6)));
  for (; fontSize > 6; fontSize -= 1) {
    ctx.font = `${fontPrefix}${fontSize}px ${family}`;
    if (ctx.measureText(text).width <= textMaxWidth) break;
  }
  ctx.font = `${fontPrefix}${fontSize}px ${family}`;
  if (isStamp) {
    ctx.strokeStyle = color;
    ctx.lineWidth = borderWidth;
    const radius = Math.min(height * 0.12, 8);
    const bw = Math.max(1, width - 2 * inset);
    const bh = Math.max(1, height - 2 * inset);
    ctx.beginPath();
    // roundRect is missing from older canvas impls (and jsdom); a square
    // frame is an acceptable degradation there.
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(inset, inset, bw, bh, radius);
    } else {
      ctx.rect(inset, inset, bw, bh);
    }
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  if (!canvasHasVisiblePixels(ctx, canvas.width, canvas.height)) {
    throw new Error("Signature export produced a blank image.");
  }
  const bytes = await canvasToPngBytes(canvas);
  if (!bytes) {
    throw new Error("Signature export produced no PNG bytes.");
  }
  return {
    bytes,
    mimeType: "image/png",
    displayWidth: width,
    displayHeight: height,
  };
}

export function rasterBytesToDataUrl(
  bytes: Uint8Array | ArrayBuffer,
  mimeType: string,
): string | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  try {
    for (let offset = 0; offset < view.length; offset += 0x8000) {
      binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
    }
    return sanitizeSignatureImage(
      `data:${mimeType};base64,${globalThis.btoa(binary)}`,
    );
  } catch {
    return null;
  }
}

/**
 * Build the exact raster stored in a native visual-signature `/AP`. Drawn and
 * uploaded-image signatures retain their strict source image; the backend centers it with
 * aspect-preserving `contain` geometry. Typed signatures are rasterized in the
 * browser so their selected script/serif/sans/mono face cannot change across
 * PDF viewers. Failure is explicit: the caller refuses the create instead of
 * saving a reader-only signature.
 */
export async function renderManagedSignatureAppearance(
  signature: Pick<
    SignatureAnnotation,
    "page" | "width" | "height" | "kind" | "image" | "text" | "font"
  >,
  page: Pick<PageRecord, "width" | "height"> | undefined,
): Promise<string | null> {
  if (signature.kind !== "typed") {
    return sanitizeSignatureImage(signature.image);
  }
  if (!page) return null;
  const width = Math.max(1, (page.width * signature.width) / 100);
  const height = Math.max(1, (page.height * signature.height) / 100);
  const rendered = await renderTypedSignatureOpToImage({
    kind: "signature-image",
    page: signature.page,
    x: 0,
    y: 0,
    width,
    height,
    signatureKind: "typed",
    image: "",
    text: signature.text,
    font: signature.font,
    source: "signature",
  });
  if (!rendered) return null;
  return rasterBytesToDataUrl(rendered.bytes, rendered.mimeType || "image/png");
}

/**
 * The generic reader-annotation endpoint intentionally accepts only the
 * historical visual-signature payload. Native appearance bytes live in the
 * editable-page shadow that patches the original PDF, avoiding both schema
 * rejection and a second multi-kilobyte raster copy in `annotations`.
 */
export function signatureReaderPayload<
  T extends {
    nativeAppearanceImage?: string;
  },
>(signature: T): Omit<T, "nativeAppearanceImage"> {
  const { nativeAppearanceImage, ...payload } = signature;
  void nativeAppearanceImage;
  return payload;
}

/**
 * A formula box's picture for the page's own `/FreeText` (插入 › 公式, a box
 * turned into a formula): the equation as the export draws it, fitted into
 * the box's frame and centred, as a PNG data URL the box writer takes.
 */
export async function renderFormulaBoxAppearance(
  box: Readonly<{ latex?: string; fontSize?: number; color?: string; width: number; height: number }>,
  pageSize: Readonly<{ width: number; height: number }>,
): Promise<string | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const latex = typeof box.latex === "string" ? box.latex : "";
  if (!latex.trim()) return null;
  const frameWidth = Math.max(1, box.width * pageSize.width);
  const frameHeight = Math.max(1, box.height * pageSize.height);
  const fontSize = Math.max(6, (Number(box.fontSize) || 0.02) * pageSize.height);
  const hex = typeof box.color === "string" && isSafeHexColor(box.color) ? box.color : "#000000";
  const channel = (offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const drawn = await renderFormulaTextOpToImage({
    latex,
    fontSize,
    color: { r: channel(1), g: channel(3), b: channel(5) },
  } as TextOp).catch(() => null);
  if (!drawn) return null;
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(frameWidth * scale);
  canvas.height = Math.ceil(frameHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = await loadImageFromDataUrl(
    `data:image/png;base64,${bytesToBase64(drawn.bytes instanceof Uint8Array ? drawn.bytes : new Uint8Array(drawn.bytes))}`,
  );
  const naturalWidth = drawn.displayWidth ?? image.width;
  const naturalHeight = drawn.displayHeight ?? image.height;
  // Fitted to the frame, never past it: the box's size is the reader's.
  const fit = Math.min(frameWidth / naturalWidth, frameHeight / naturalHeight, 1);
  const width = naturalWidth * fit;
  const height = naturalHeight * fit;
  ctx.scale(scale, scale);
  ctx.drawImage(image, (frameWidth - width) / 2, (frameHeight - height) / 2, width, height);
  return canvas.toDataURL("image/png");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
