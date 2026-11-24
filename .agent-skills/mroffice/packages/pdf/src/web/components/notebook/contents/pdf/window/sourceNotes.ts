/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  NativePdfAnnotationSource,
} from "@mrnote/core/web/lib/pdf/native-text-annotations.ts";
import {
  type PdfAnnotation,
  getAnnotations,
  getAnnotationTombstones,
} from "../../../../../lib/pdf/page-content-model";

/**
 * The source PDF's own comments that the reader projected into the note list
 * (pdf.js discovery, mergeNativePdfText*Annotations) and that no save has
 * written into the stored edit layer: they are the PDF itself, not a change.
 * The page-size writer replays the stored layer onto the original bytes and
 * refuses any note directive beside a resize, while its resize_page primitive
 * already carries these objects (fit-center transforms their /Rect and
 * QuadPoints, unchanged leaves them where they are). A page-size save
 * therefore leaves exactly these notes out. A note that any save has written
 * (same id or same source object) is layer-owned and still blocks, and so
 * does one whose text, colour or replies differ from what the reader last
 * read out of the PDF: that is an edit whose save has not landed yet.
 */
export function pdfSourceNoteProjectionKey(source: NativePdfAnnotationSource): string {
  return `${source.kind}:${source.objectRef}`;
}

export function pdfSourceNoteFingerprint(note: {
  readonly page?: number;
  readonly text: string;
  readonly color?: string;
  readonly replies?: readonly { readonly id: string; readonly text: string }[];
}): string {
  return JSON.stringify([
    note.page ?? null,
    note.text,
    note.color ?? null,
    (note.replies ?? []).map((reply) => [reply.id, reply.text]),
  ]);
}

export function pdfSourceNoteIdsOutsideEditLayer(
  annotations: readonly PdfAnnotation[],
  storedContent: Record<string, unknown> | undefined,
  sourceProjection: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  if (!annotations.some((annotation) => annotation.nativeSource)) {
    return new Set();
  }
  const storedIds = new Set<string>();
  const storedObjectRefs = new Set<string>();
  for (const stored of [
    ...getAnnotations(storedContent),
    ...getAnnotationTombstones(storedContent),
  ]) {
    storedIds.add(stored.id);
    if (stored.nativeSource) storedObjectRefs.add(stored.nativeSource.objectRef);
  }
  const untouched = new Set<string>();
  for (const annotation of annotations) {
    const source = annotation.nativeSource;
    if (
      source &&
      annotation.managedMarkup === undefined &&
      annotation.managedProofing === undefined &&
      annotation.nativeReplyRoundTripBlocked !== true &&
      !storedIds.has(annotation.id) &&
      !storedObjectRefs.has(source.objectRef) &&
      sourceProjection.get(pdfSourceNoteProjectionKey(source)) ===
        pdfSourceNoteFingerprint(annotation)
    ) {
      untouched.add(annotation.id);
    }
  }
  return untouched;
}
