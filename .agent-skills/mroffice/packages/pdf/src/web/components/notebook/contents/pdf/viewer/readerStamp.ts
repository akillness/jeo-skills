/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  buildStampPayload,
  sanitizeStampPayload,
  type StampAnnotation,
} from "../../../../../lib/pdf/stamps-annotation";

export type PdfManagedStampCommandOrigin =
  | "comment-stamp"
  | "image-insert";

export type ReaderStampAnnotation = StampAnnotation & {
  readonly nativeCommandOrigin: PdfManagedStampCommandOrigin;
};

export const PDF_STAMP_COMMAND_ORIGIN_FIELD = "mrnote_native_command_origin";

export function sanitizeReaderStampPayload(
  id: string,
  payload: Record<string, unknown> | null | undefined,
): ReaderStampAnnotation | null {
  const stamp = sanitizeStampPayload(id, payload);
  if (!stamp) return null;
  const rawOrigin = payload?.[PDF_STAMP_COMMAND_ORIGIN_FIELD];
  const nativeCommandOrigin: PdfManagedStampCommandOrigin =
    rawOrigin === "comment-stamp" || rawOrigin === "image-insert"
      ? rawOrigin
      : stamp.kind === "preset"
        ? "comment-stamp"
        : "image-insert";
  return Object.freeze({ ...stamp, nativeCommandOrigin });
}

export function buildReaderStampPayload(
  input: Parameters<typeof buildStampPayload>[0],
  nativeCommandOrigin: PdfManagedStampCommandOrigin,
) {
  const payload = buildStampPayload(input);
  return payload
    ? Object.freeze({
        ...payload,
        [PDF_STAMP_COMMAND_ORIGIN_FIELD]: nativeCommandOrigin,
      })
    : null;
}
