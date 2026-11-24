/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
export const DOCUMENT_PICTURE_COMPRESSION_PRESETS = [
  { id: "print", ppi: 220, quality: 0.9 },
  { id: "web", ppi: 150, quality: 0.82 },
  { id: "email", ppi: 96, quality: 0.72 },
] as const;

export type DocumentPictureCompressionPresetId =
  (typeof DOCUMENT_PICTURE_COMPRESSION_PRESETS)[number]["id"];
export type DocumentPictureCompressionMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_RASTER_DIMENSION = 8192;
const MAX_RASTER_PIXELS = 40_000_000;

export interface DecodedPictureRaster {
  readonly width: number;
  readonly height: number;
  readonly encode: (
    width: number,
    height: number,
    mimeType: DocumentPictureCompressionMime,
    quality: number,
  ) => Promise<Blob | null>;
  readonly dispose: () => void;
}

export interface DocumentPictureCompressionAdapter {
  readonly decode: (source: Blob) => Promise<DecodedPictureRaster>;
}

export type DocumentPictureCompressionResult =
  | {
      readonly status: "compressed";
      readonly dataUrl: string;
      readonly beforeBytes: number;
      readonly afterBytes: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly status: "unchanged";
      readonly reason: "already-optimized" | "not-smaller";
    };

function preset(id: DocumentPictureCompressionPresetId) {
  return DOCUMENT_PICTURE_COMPRESSION_PRESETS.find((item) => item.id === id)!;
}

function validPictureBytes(
  bytes: Uint8Array,
  mimeType: DocumentPictureCompressionMime,
): boolean {
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
    );
  }
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export async function pictureBlobFromDataUrl(
  value: string,
): Promise<{ blob: Blob; mimeType: DocumentPictureCompressionMime } | null> {
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const mimeType = match[1].toLowerCase() as DocumentPictureCompressionMime;
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_SOURCE_BYTES) return null;
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length > MAX_SOURCE_BYTES || !validPictureBytes(bytes, mimeType)) {
    return null;
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("picture-compression-read-failed"));
    reader.onabort = () =>
      reject(new Error("picture-compression-read-aborted"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("picture-compression-read-failed"));
    reader.readAsDataURL(blob);
  });
}

export function documentPictureCompressionSize(
  naturalWidth: number,
  naturalHeight: number,
  displayWidth: number,
  displayHeight: number,
  ppi: number,
): { width: number; height: number } | null {
  if (
    ![naturalWidth, naturalHeight, displayWidth, displayHeight, ppi].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }
  const scale = Math.min(
    1,
    (displayWidth * ppi) / 96 / naturalWidth,
    (displayHeight * ppi) / 96 / naturalHeight,
  );
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

export async function browserPictureCompressionAdapter(): Promise<DocumentPictureCompressionAdapter> {
  const decode = async (source: Blob): Promise<DecodedPictureRaster> => {
    if (typeof createImageBitmap === "function") {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(source, {
          imageOrientation: "from-image",
        });
      } catch {
        bitmap = await createImageBitmap(source);
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        encode: (width, height, mimeType, quality) => {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) return Promise.resolve(null);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(bitmap, 0, 0, width, height);
          return new Promise((resolve) =>
            canvas.toBlob(
              resolve,
              mimeType,
              mimeType === "image/png" ? undefined : quality,
            ),
          );
        },
        dispose: () => bitmap.close(),
      };
    }
    const objectUrl = URL.createObjectURL(source);
    const image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      encode: (width, height, mimeType, quality) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return Promise.resolve(null);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        return new Promise((resolve) =>
          canvas.toBlob(
            resolve,
            mimeType,
            mimeType === "image/png" ? undefined : quality,
          ),
        );
      },
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  };
  return { decode };
}

export async function compressDocumentPictureDataUrl({
  source,
  displayWidth,
  displayHeight,
  presetId,
  adapter,
}: {
  source: string;
  displayWidth: number;
  displayHeight: number;
  presetId: DocumentPictureCompressionPresetId;
  adapter?: DocumentPictureCompressionAdapter;
}): Promise<DocumentPictureCompressionResult> {
  const decodedSource = await pictureBlobFromDataUrl(source);
  if (!decodedSource) throw new Error("picture-compression-source-unsupported");
  const activeAdapter = adapter ?? (await browserPictureCompressionAdapter());
  const raster = await activeAdapter.decode(decodedSource.blob);
  try {
    if (
      !Number.isInteger(raster.width) ||
      !Number.isInteger(raster.height) ||
      raster.width <= 0 ||
      raster.height <= 0 ||
      raster.width > MAX_RASTER_DIMENSION ||
      raster.height > MAX_RASTER_DIMENSION ||
      raster.width * raster.height > MAX_RASTER_PIXELS
    ) {
      throw new Error("picture-compression-raster-unsupported");
    }
    const selectedPreset = preset(presetId);
    const target = documentPictureCompressionSize(
      raster.width,
      raster.height,
      displayWidth,
      displayHeight,
      selectedPreset.ppi,
    );
    if (!target) throw new Error("picture-compression-size-invalid");
    if (
      decodedSource.mimeType === "image/png" &&
      target.width === raster.width &&
      target.height === raster.height
    ) {
      return { status: "unchanged", reason: "already-optimized" };
    }
    const output = await raster.encode(
      target.width,
      target.height,
      decodedSource.mimeType,
      selectedPreset.quality,
    );
    if (!output || output.type !== decodedSource.mimeType) {
      throw new Error("picture-compression-encode-failed");
    }
    const outputBytes = new Uint8Array(await output.arrayBuffer());
    if (
      outputBytes.length <= 0 ||
      outputBytes.length > MAX_SOURCE_BYTES ||
      !validPictureBytes(outputBytes, decodedSource.mimeType)
    ) {
      throw new Error("picture-compression-output-invalid");
    }
    if (outputBytes.length >= decodedSource.blob.size) {
      return { status: "unchanged", reason: "not-smaller" };
    }
    return {
      status: "compressed",
      dataUrl: await blobDataUrl(output),
      beforeBytes: decodedSource.blob.size,
      afterBytes: outputBytes.length,
      width: target.width,
      height: target.height,
    };
  } finally {
    raster.dispose();
  }
}
