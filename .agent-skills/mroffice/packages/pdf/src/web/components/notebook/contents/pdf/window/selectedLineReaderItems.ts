/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PdfNativeListTextSelectionItemEvidence } from "../../../../../lib/pdf/engine/native/list-text-fidelity";

/** A reader (pdf.js) item where it stands: its text and origin. */
export type PdfReaderItemAt = Readonly<{ str: string; x: number; y: number }>;

/** How far a reader item's origin may sit from the line's baseline and ends
 * and still be one of its items: the delete compares origins rounded to
 * hundredths of a point. */
const ORIGIN_TOLERANCE = 0.02;














export function pdfReaderItemOnSelectedLine(
  entry: PdfReaderItemAt,
  lineItems: readonly PdfNativeListTextSelectionItemEvidence[],
): boolean {
  const text = entry.str.replace(/\s+/gu, "");
  if (!text) return false;
  return lineItems.some((item) => {
    const [a, b, , , originX, originY] = item.transform;
    const scale = Math.hypot(a, b);
    if (!(scale > 0)) return false;
    const dx = entry.x - originX, dy = entry.y - originY;
    const along = (dx * a + dy * b) / scale;
    const across = (dy * a - dx * b) / scale;
    return Math.abs(across) <= ORIGIN_TOLERANCE &&
      along >= -ORIGIN_TOLERANCE &&
      along <= item.width + ORIGIN_TOLERANCE &&
      item.str.replace(/\s+/gu, "").includes(text);
  });
}

/** The reader item a delete's count key (`str@x,y`, origin in hundredths)
 * names. */
export function pdfReaderItemFromKey(key: string): PdfReaderItemAt | null {
  const at = key.lastIndexOf("@");
  if (at < 0) return null;
  const [x, y] = key.slice(at + 1).split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { str: key.slice(0, at), x, y } : null;
}

/**
 * Whether a delete read back takes only the line's reader items: no item is
 * read more often than before, and every item read less often stands on the
 * line. With `whole`, nothing of the line is read after it either.
 */
export function pdfReaderCountsLoseOnlyLine(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  onLine: (key: string) => boolean,
  whole = false,
): boolean {
  for (const [key, count] of after) {
    if (count > (before.get(key) ?? 0)) return false;
    if (whole && onLine(key)) return false;
  }
  for (const [key, count] of before) {
    if ((after.get(key) ?? 0) < count && !onLine(key)) return false;
  }
  return true;
}
