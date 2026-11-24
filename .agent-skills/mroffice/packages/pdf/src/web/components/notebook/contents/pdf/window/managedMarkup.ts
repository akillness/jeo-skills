/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { nativeNoteRepliesForRoundTrip } from "@mrnote/core/web/lib/pdf/native-note-roundtrip.ts";
import type {
  NativePdfTextMarkupAnnotation,
} from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";
import {
  pdfMarkupColorToHex,
  sanitizeManagedPdfTextMarkup,
  type ManagedPdfTextMarkupSync,
} from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";
import type { PdfAnnotation } from "../../../../../lib/pdf/page-content-model";
import type { PdfAnnotationReply } from "@mrnote/core/web/lib/pdf/annotation-replies.ts";

export function pdfAnnotationFromManagedTextMarkupSync(
  sync: ManagedPdfTextMarkupSync,
  current?: PdfAnnotation,
): PdfAnnotation | null {
  const geometry = sanitizeManagedPdfTextMarkup({
    ...sync.managedMarkup,
    subtype: sync.managedMarkup.subtype,
    quote: sync.quote,
    hasReaderOnlyFeatures: sync.hasReaderOnlyFeatures === true,
  });
  if (!geometry) return null;
  const suppliedReplies =
    sync.replies === undefined
      ? undefined
      : nativeNoteRepliesForRoundTrip(sync.replies);
  if (suppliedReplies === null) return null;
  const currentHasReplies = Boolean(
    current && Object.prototype.hasOwnProperty.call(current, "replies"),
  );
  return {
    id: sync.id,
    text: sync.note?.trim() ?? "",
    quote: sync.quote,
    page: sync.page,
    rect: geometry.rect,
    createdAt: sync.createdAt ?? current?.createdAt ?? new Date().toISOString(),
    ...(sync.author ? { author: sync.author } : {}),
    color: pdfMarkupColorToHex(sync.color),
    managedMarkup: geometry,
    ...(sync.replies !== undefined
      ? { replies: suppliedReplies ?? [] }
      : currentHasReplies
        ? { replies: current?.replies ?? [] }
        : {}),
    ...(current?.nativeReplyRoundTripBlocked
      ? { nativeReplyRoundTripBlocked: true as const }
      : {}),
  };
}

export const NATIVE_MARKUP_LABEL: Record<
  NativePdfTextMarkupAnnotation["nativeSource"]["subtype"],
  string
> = {
  Highlight: "Highlight",
  Underline: "Underline",
  StrikeOut: "Strikethrough",
  Squiggly: "Squiggly",
};
export const NATIVE_MARKUP_COLORS = [
  "#FFD600",
  "#FF8A65",
  "#E85D75",
  "#4FC3F7",
  "#66BB6A",
  "#9B72CF",
] as const;

export function isNativeMarkupAnnotation(
  annotation: Pick<
    PdfAnnotation,
    "nativeSource" | "managedMarkup" | "managedProofing"
  >,
): boolean {
  return (
    annotation.nativeSource?.kind === "pdf_text_markup_annotation" ||
    annotation.managedMarkup !== undefined ||
    annotation.managedProofing !== undefined
  );
}

export function nativeMarkupLabel(
  annotation: Pick<
    PdfAnnotation,
    "nativeSource" | "managedMarkup" | "managedProofing"
  >,
): string | null {
  if (annotation.managedProofing) {
    return annotation.managedProofing.kind === "replace"
      ? "Replace Text"
      : "Insert Text";
  }
  const subtype =
    annotation.nativeSource?.kind === "pdf_text_markup_annotation"
      ? annotation.nativeSource.subtype
      : annotation.managedMarkup?.subtype;
  return subtype ? NATIVE_MARKUP_LABEL[subtype] : null;
}

export function isManagedMarkupAnnotation(
  annotation: Pick<PdfAnnotation, "managedMarkup">,
): boolean {
  return annotation.managedMarkup !== undefined;
}

export function isManagedProofingAnnotation(
  annotation: Pick<PdfAnnotation, "managedProofing">,
): boolean {
  return annotation.managedProofing !== undefined;
}

export interface PdfManagedNoteSync {
  readonly id: string;
  readonly text: string;
  readonly page: number;
  readonly rect: [number, number, number, number];
  readonly color: string;
  readonly createdAt?: string;
  readonly author?: string;
  readonly replies?: readonly PdfAnnotationReply[];
}
