/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { itemsForRange, type PdfTextMatch } from "@mrnote/core/web/lib/pdf/text-search.ts";
import {
  rawRangeForNormalizedRange,
  type PdfPageSearchText,
} from "../../../../../lib/pdf/find-normalize";
import type { PdfTextItemSpans } from "../../../../../lib/pdf/text-layer-item-spans";

// ---- Find-match highlight measurement -------------------------------------

/** One tinted overlay rect for a find match, in page-wrapper percentages. */
export interface PdfFindHighlightRect {
  /** Index into the flat match list (the active match gets a stronger tint). */
  matchIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A match in a text box's text: painted over the box, not under it. */
  textBox?: true;
}

export const EMPTY_FIND_HIGHLIGHTS: PdfFindHighlightRect[] = [];

/**
 * Cap on highlight rects painted per page, so a 1-char query on a dense page
 * can't flood the overlay stack with thousands of DOM nodes.
 */
export const MAX_FIND_HIGHLIGHTS_PER_PAGE = 500;

// ---- Smart reference jumping (Eq./图/Fig./Theorem/[k] mentions) ------------

/** One clickable overlay rect for a reference mention, in page-wrapper %. */
export interface PdfReferenceOverlayRect {
  /** Target key the click resolves through the reference index. */
  refKey: string;
  /** The mention's visible text ("式(1.2)"), for the tooltip. */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EMPTY_REFERENCE_OVERLAYS: PdfReferenceOverlayRect[] = [];

/** Cap on clickable reference rects per page (dense bibliographies). */
export const MAX_REFERENCE_OVERLAYS_PER_PAGE = 300;

/**
 * The reference index needs a whole-document text pass (targets can live on
 * any page). Bound that always-on cost: larger documents simply don't get
 * reference links (find/search are unaffected — they scan on demand).
 */
export const MAX_REFERENCE_INDEX_PAGES = 400;

/** Let first paint / initial page renders settle before the index pass. */
export const REFERENCE_INDEX_DELAY_MS = 350;

/**
 * Measure the overlay rect(s) for ONE match: map its folded-text range back
 * to raw offsets, find the text-layer spans it overlaps, and measure the
 * covered sub-range of each span with a DOM Range (falling back to the whole
 * span when the range can't be measured). Returns [] when nothing on the
 * page is measurable yet (text layer still rendering / hidden page).
 */
export function measureFindMatchRects(
  match: PdfTextMatch,
  matchIndex: number,
  entry: PdfPageSearchText,
  spans: PdfTextItemSpans,
  wrapperRect: DOMRect,
): PdfFindHighlightRect[] {
  const raw = rawRangeForNormalizedRange(entry, match.start, match.end);
  if (raw.end <= raw.start) return [];
  const itemIndexes = itemsForRange(
    entry.itemStarts,
    raw.start,
    raw.end,
    entry.rawText.length,
  );
  const rects: PdfFindHighlightRect[] = [];
  for (const idx of itemIndexes) {
    const span = spans.item(idx);
    if (!span) continue;
    let rect: Pick<DOMRect, "left" | "top" | "right" | "bottom"> | null = null;
    const textNode = span.firstChild;
    const spanLength =
      textNode && textNode.nodeType === Node.TEXT_NODE
        ? (textNode.textContent?.length ?? 0)
        : 0;
    // A tagged span must still carry this item's text; a stale layer is
    // skipped rather than painting (or redacting) another word.
    if (
      spans.tagged &&
      spanLength > 0 &&
      !entry.rawText.startsWith(
        textNode?.textContent ?? "",
        entry.itemStarts[idx] ?? 0,
      )
    ) {
      continue;
    }
    if (spanLength > 0) {
      const itemStart = entry.itemStarts[idx] ?? 0;
      const localStart = Math.max(
        0,
        Math.min(raw.start - itemStart, spanLength),
      );
      const localEnd = Math.max(
        localStart,
        Math.min(raw.end - itemStart, spanLength),
      );
      // The match only overlaps this item's SEPARATOR (inter-item gap), not
      // its text — nothing of this span to paint.
      if (localEnd <= localStart) continue;
      if (localStart > 0 || localEnd < spanLength) {
        try {
          const range = span.ownerDocument.createRange();
          range.setStart(textNode as Text, localStart);
          range.setEnd(textNode as Text, localEnd);
          const r = range.getBoundingClientRect();
          if (r && (r.width > 0 || r.height > 0)) rect = r;
        } catch {
          // Fall back to the whole span below.
        }
      }
    }
    if (!rect) {
      const r = span.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      rect = r;
    }
    rects.push({
      matchIndex,
      x: ((rect.left - wrapperRect.left) / wrapperRect.width) * 100,
      y: ((rect.top - wrapperRect.top) / wrapperRect.height) * 100,
      width: ((rect.right - rect.left) / wrapperRect.width) * 100,
      height: ((rect.bottom - rect.top) / wrapperRect.height) * 100,
    });
  }
  return rects;
}
