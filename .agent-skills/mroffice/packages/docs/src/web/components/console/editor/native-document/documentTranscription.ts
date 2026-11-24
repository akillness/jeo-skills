"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { Editor } from "@tiptap/react";
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { Selection } from "@tiptap/pm/state";

import { apiGet, apiPost, apiPostFormData } from "@mrnote/core/web/lib/api.ts";

const MAX_TRANSCRIPTION_SEGMENTS = 20_000;
const MAX_SEGMENT_TEXT_BYTES = 16_384;
const MAX_TRANSCRIPT_TEXT_BYTES = 1_048_576;

export type DocumentTranscriptionStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed";

export interface DocumentTranscriptionSegment {
  readonly index: number;
  readonly beginMs: number;
  readonly endMs: number;
  readonly speakerId: string | null;
  readonly text: string;
}

export interface DocumentTranscriptionCapability {
  readonly available: boolean;
  readonly providerAvailable: boolean;
  readonly reasonCode: string | null;
  readonly supportsRecording: boolean;
  readonly supportsUpload: boolean;
  readonly supportsDiarization: boolean;
}

export interface DocumentTranscriptionRecord {
  readonly attachmentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly status: DocumentTranscriptionStatus;
  readonly segments: readonly DocumentTranscriptionSegment[];
  readonly errorCode: string | null;
  readonly updatedAt: string;
}

export interface DocumentTranscriptionPayload {
  readonly capability: DocumentTranscriptionCapability;
  readonly transcription: DocumentTranscriptionRecord | null;
}

export interface DocumentTranscriptionInsertionTarget {
  readonly editor: Editor;
  readonly doc: ProseMirrorNode;
  readonly selection: Selection;
}

interface UploadedAudioAttachment {
  readonly attachment_id: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly size_bytes: number;
}

function boundedString(
  value: unknown,
  maximum: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | null {
  if (typeof value !== "string" || value.length > maximum) return null;
  if (!allowEmpty && !value.trim()) return null;
  return value;
}

function finiteInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function normalizeCapability(
  value: unknown,
): DocumentTranscriptionCapability | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const reasonCode =
    record.reason_code === null ? null : boundedString(record.reason_code, 100);
  if (
    typeof record.available !== "boolean" ||
    typeof record.provider_available !== "boolean" ||
    typeof record.supports_recording !== "boolean" ||
    typeof record.supports_upload !== "boolean" ||
    typeof record.supports_diarization !== "boolean" ||
    (record.reason_code !== null && reasonCode === null)
  ) {
    return null;
  }
  return {
    available: record.available,
    providerAvailable: record.provider_available,
    reasonCode,
    supportsRecording: record.supports_recording,
    supportsUpload: record.supports_upload,
    supportsDiarization: record.supports_diarization,
  };
}

function normalizeSegments(
  value: unknown,
): readonly DocumentTranscriptionSegment[] | null {
  if (!Array.isArray(value) || value.length > MAX_TRANSCRIPTION_SEGMENTS) {
    return null;
  }
  let totalTextBytes = 0;
  const segments: DocumentTranscriptionSegment[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const segmentIndex = finiteInteger(
      record.index,
      0,
      MAX_TRANSCRIPTION_SEGMENTS,
    );
    const beginMs = finiteInteger(record.begin_ms, 0, 86_400_000);
    const endMs = finiteInteger(record.end_ms, 0, 86_400_000);
    const speakerId =
      record.speaker_id === null ? null : boundedString(record.speaker_id, 64);
    const text = boundedString(record.text, MAX_SEGMENT_TEXT_BYTES);
    if (
      segmentIndex !== index ||
      beginMs === null ||
      endMs === null ||
      endMs < beginMs ||
      (record.speaker_id !== null && speakerId === null) ||
      text === null
    ) {
      return null;
    }
    const textBytes = new TextEncoder().encode(text).byteLength;
    totalTextBytes += textBytes;
    if (
      textBytes > MAX_SEGMENT_TEXT_BYTES ||
      totalTextBytes > MAX_TRANSCRIPT_TEXT_BYTES
    ) {
      return null;
    }
    segments.push({ index, beginMs, endMs, speakerId, text });
  }
  return segments;
}

function normalizeTranscription(
  value: unknown,
): DocumentTranscriptionRecord | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const attachmentId = boundedString(record.attachment_id, 64);
  const filename = boundedString(record.filename, 512);
  const mimeType = boundedString(record.mime_type, 255);
  const sizeBytes = finiteInteger(
    record.size_bytes,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const status = record.status;
  const segments = normalizeSegments(record.segments);
  const errorCode =
    record.error_code === null ? null : boundedString(record.error_code, 100);
  const updatedAt = boundedString(record.updated_at, 64);
  if (
    attachmentId === null ||
    filename === null ||
    mimeType === null ||
    sizeBytes === null ||
    !["pending", "processing", "succeeded", "failed"].includes(
      String(status),
    ) ||
    segments === null ||
    (record.error_code !== null && errorCode === null) ||
    updatedAt === null
  ) {
    return undefined;
  }
  return {
    attachmentId,
    filename,
    mimeType,
    sizeBytes,
    status: status as DocumentTranscriptionStatus,
    segments,
    errorCode,
    updatedAt,
  };
}

export function normalizeDocumentTranscriptionPayload(
  value: unknown,
): DocumentTranscriptionPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const capability = normalizeCapability(record.capability);
  const transcription = normalizeTranscription(record.transcription);
  if (!capability || transcription === undefined) return null;
  return { capability, transcription };
}

function transcriptionPath(pageId: string, suffix = ""): string {
  return `/api/v1/attachments/page/${encodeURIComponent(pageId)}/transcription${suffix}`;
}

async function normalizedResponse(
  request: Promise<unknown>,
): Promise<DocumentTranscriptionPayload> {
  const payload = normalizeDocumentTranscriptionPayload(await request);
  if (!payload) throw new Error("transcription_response_invalid");
  return payload;
}

export function loadDocumentTranscription(
  pageId: string,
  signal?: AbortSignal,
): Promise<DocumentTranscriptionPayload> {
  return normalizedResponse(
    apiGet<unknown>(transcriptionPath(pageId), signal ? { signal } : undefined),
  );
}

export async function uploadDocumentTranscriptionAudio(
  pageId: string,
  file: File,
  signal?: AbortSignal,
): Promise<UploadedAudioAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", file.name);
  const attachment = await apiPostFormData<UploadedAudioAttachment>(
    `/api/v1/pages/${encodeURIComponent(pageId)}/attachments/upload`,
    formData,
    signal ? { signal } : undefined,
  );
  if (
    !boundedString(attachment.attachment_id, 64) ||
    !boundedString(attachment.filename, 512) ||
    !boundedString(attachment.mime_type, 255) ||
    finiteInteger(attachment.size_bytes, 0, Number.MAX_SAFE_INTEGER) === null
  ) {
    throw new Error("transcription_attachment_invalid");
  }
  return attachment;
}

export function startDocumentTranscription(
  pageId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<DocumentTranscriptionPayload> {
  return normalizedResponse(
    apiPost<unknown>(
      transcriptionPath(pageId, "/start"),
      { attachment_id: attachmentId, privacy_acknowledged: true },
      signal ? { signal } : undefined,
    ),
  );
}

export function refreshDocumentTranscription(
  pageId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<DocumentTranscriptionPayload> {
  return normalizedResponse(
    apiPost<unknown>(
      transcriptionPath(pageId, "/refresh"),
      { attachment_id: attachmentId },
      signal ? { signal } : undefined,
    ),
  );
}

export function captureDocumentTranscriptionInsertionTarget(
  editor: Editor,
): DocumentTranscriptionInsertionTarget | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  return {
    editor,
    doc: editor.state.doc,
    selection: editor.state.selection,
  };
}

export function insertDocumentTranscriptionSegments(
  target: DocumentTranscriptionInsertionTarget,
  segments: readonly DocumentTranscriptionSegment[],
): boolean {
  const { editor } = target;
  if (
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.state.doc !== target.doc ||
    editor.state.selection !== target.selection ||
    segments.length === 0 ||
    segments.length > MAX_TRANSCRIPTION_SEGMENTS
  ) {
    return false;
  }
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return false;
  const nodes: ProseMirrorNode[] = [];
  let totalBytes = 0;
  for (const segment of segments) {
    if (!segment || !Number.isInteger(segment.index)) return false;
    const text = segment.text;
    if (!text.trim()) return false;
    const textBytes = new TextEncoder().encode(text).byteLength;
    totalBytes += textBytes;
    if (
      textBytes > MAX_SEGMENT_TEXT_BYTES ||
      totalBytes > MAX_TRANSCRIPT_TEXT_BYTES
    ) {
      return false;
    }
    nodes.push(paragraph.create(null, editor.state.schema.text(text)));
  }
  const transaction = closeHistory(editor.state.tr).replaceSelection(
    new Slice(Fragment.fromArray(nodes), 0, 0),
  );
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}
