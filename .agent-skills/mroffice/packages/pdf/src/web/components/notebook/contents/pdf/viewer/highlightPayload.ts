/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  isHighlightMarkupStyle,
  normalizeHighlightQuads,
} from "@mrnote/core/web/lib/pdf/highlight-markup.ts";
import {
  parseAnnotationAuthor,
  parseReplies,
} from "@mrnote/core/web/lib/pdf/annotation-replies.ts";
import type { HighlightDraft, HighlightLink } from "../HighlightEditDialog";
import { normalizeXfdfSourceId } from "@mrnote/core/web/lib/pdf/xfdf-import.ts";
import {
  highlightMarkupStyleToPdfSubtype,
  type ManagedPdfTextMarkupSync,
} from "@mrnote/core/web/lib/pdf/native-text-markup-writeback.ts";
import { isSafeCssColor } from "@mrnote/core/web/lib/pdf/safe-color.ts";
import type { HighlightAnnotation } from "./annotationModels";

export const PDF_HIGHLIGHT_COLOR_OPTIONS = [
  "rgba(252, 211, 77, 0.45)",
  "rgba(96, 165, 250, 0.35)",
  "rgba(167, 139, 250, 0.35)",
  "rgba(52, 211, 153, 0.35)",
  "rgba(248, 113, 113, 0.35)",
] as const;
export const PDF_HIGHLIGHT_COLORS = new Set<string>(PDF_HIGHLIGHT_COLOR_OPTIONS);
export const PDF_AREA_HIGHLIGHT_OPACITIES = [0.15, 0.3, 0.5, 0.7] as const;
export const PDF_HIGHLIGHT_MAX_RECTS = 64;
export const PDF_HIGHLIGHT_MAX_TEXT = 4000;
export const PDF_HIGHLIGHT_MAX_LINKS = 20;
export const DEFAULT_HIGHLIGHT_COLOR = "rgba(252, 211, 77, 0.45)";

export function sanitizeHighlightPayload(
  id: string,
  payload: Record<string, unknown>,
): HighlightAnnotation | null {
  const page = Number(payload.page) || 0;
  if (!Number.isInteger(page) || page < 1 || page > 10000) return null;
  const rawRects = Array.isArray(payload.rects) ? payload.rects : [];
  if (rawRects.length < 1 || rawRects.length > PDF_HIGHLIGHT_MAX_RECTS) {
    return null;
  }
  const rects = rawRects
    .map((rect) => {
      if (!rect || typeof rect !== "object") return null;
      const source = rect as Record<string, unknown>;
      const x = Number(source.x);
      const y = Number(source.y);
      const width = Number(source.width);
      const height = Number(source.height);
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        x < 0 ||
        y < 0 ||
        width <= 0 ||
        height <= 0 ||
        x + width > 100 ||
        y + height > 100
      ) {
        return null;
      }
      return { x, y, width, height };
    })
    .filter(
      (rect): rect is { x: number; y: number; width: number; height: number } =>
        Boolean(rect),
    );
  if (rects.length !== rawRects.length) return null;
  const quads = normalizeHighlightQuads(payload.quads, rects.length);
  if (quads === null) return null;

  const text = typeof payload.text === "string" ? payload.text : "";
  if (text.length > PDF_HIGHLIGHT_MAX_TEXT) return null;
  // Accept a palette color OR a safe FREE color (a strict hex / numeric rgba the
  // `<input type=color>` swatch emits). `isSafeCssColor` rejects anything that
  // isn't an inert color literal, so a free highlight color can't inject CSS.
  const color =
    typeof payload.color === "string" &&
    (PDF_HIGHLIGHT_COLORS.has(payload.color) || isSafeCssColor(payload.color))
      ? payload.color
      : DEFAULT_HIGHLIGHT_COLOR;
  const note =
    typeof payload.note === "string" && payload.note.length <= 2000
      ? payload.note
      : undefined;
  const rawLinks = Array.isArray(payload.links) ? payload.links : [];
  if (rawLinks.length > PDF_HIGHLIGHT_MAX_LINKS) return null;
  const links = rawLinks.filter(
    (link): link is HighlightLink =>
      Boolean(link) &&
      typeof link === "object" &&
      typeof (link as HighlightLink).id === "string" &&
      ((link as HighlightLink).kind === "page" ||
        (link as HighlightLink).kind === "memory"),
  );
  if (links.length !== rawLinks.length) return null;

  const markupStyle = isHighlightMarkupStyle(payload.style)
    ? payload.style
    : undefined;

  const author = parseAnnotationAuthor(payload.author);
  // Persisted replies always carry id + createdAt (client + server stamp
  // them); the fallbacks only fire on hand-crafted payloads.
  const replies = parseReplies(
    payload.replies,
    (index) => `${id}:reply:${index}`,
    () => new Date().toISOString(),
  );
  const xfdfSourceId = normalizeXfdfSourceId(payload.xfdfSourceId);

  return {
    id,
    page,
    text,
    color,
    rects,
    ...(quads ? { quads } : {}),
    note,
    links,
    markupStyle,
    ...(author ? { author } : {}),
    ...(replies.length > 0 ? { replies } : {}),
    ...(xfdfSourceId ? { xfdfSourceId } : {}),
  };
}

export function buildHighlightReaderPayload(
  highlight: HighlightDraft,
): Record<string, unknown> {
  return {
    page: highlight.page,
    text: highlight.text,
    rects: highlight.rects,
    ...(highlight.quads ? { quads: highlight.quads } : {}),
    color: highlight.color,
    note: highlight.note,
    links: highlight.links ?? [],
    style: highlight.markupStyle ?? "highlight",
    ...(highlight.author ? { author: highlight.author } : {}),
    ...(highlight.replies !== undefined
      ? { replies: highlight.replies }
      : {}),
    ...(normalizeXfdfSourceId(highlight.xfdfSourceId)
      ? { xfdfSourceId: normalizeXfdfSourceId(highlight.xfdfSourceId) }
      : {}),
  };
}

export function managedTextMarkupSyncFromHighlight(
  highlight: HighlightDraft,
): ManagedPdfTextMarkupSync | null {
  if (!highlight.nativeMarkup) return null;
  const markupStyle = highlight.markupStyle ?? "highlight";
  const hasReaderOnlyFeatures = (highlight.links?.length ?? 0) > 0;
  return {
    id: highlight.id,
    page: highlight.page,
    quote: highlight.text,
    note: highlight.note,
    color: highlight.color,
    createdAt: highlight.createdAt,
    markupStyle,
    author: highlight.author?.displayName,
    replies: highlight.replies,
    hasReaderOnlyFeatures,
    managedMarkup: {
      ...highlight.nativeMarkup,
      subtype: highlightMarkupStyleToPdfSubtype(markupStyle),
      quote: highlight.text,
      hasReaderOnlyFeatures,
    },
  };
}
