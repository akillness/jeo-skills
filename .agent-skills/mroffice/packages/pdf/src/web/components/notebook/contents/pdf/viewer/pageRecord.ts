/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { normalizeRotation, type PdfRotation } from "@mrnote/core/web/lib/pdf/page-ops.ts";

export interface PageRecord {
  pageNumber: number;
  width: number;
  height: number;
  nativeRotation: PdfRotation;
  /** The page's /UserUnit: how many points one unit of its space is. */
  userUnit?: number;
  /** The crop box's lower-left corner in user space (0,0 when uncropped). */
  originX?: number;
  originY?: number;
}

/** What a page set paints as: order, size and rotation of each page. */
export function renderPagesKey(pages: readonly PageRecord[]): string {
  return pages
    .map((page) => `${page.pageNumber}:${page.width}x${page.height}@${page.nativeRotation}`)
    .join(",");
}



export function pageCropOrigin(page: { view?: unknown }): { originX?: number; originY?: number } {
  const view = Array.isArray(page.view) ? page.view : null;
  if (!view || view.length < 2 || !Number.isFinite(view[0]) || !Number.isFinite(view[1])) return {};
  return { originX: Number(view[0]), originY: Number(view[1]) };
}

/** A page's record in unrotated PDF user space: every render and layout
 * consumer applies the resolved absolute rotation exactly once. */
export function pageRecordOf(
  page: {
    rotate: number;
    view?: unknown;
    userUnit?: number;
    getViewport(options: { scale: number; rotation: number }): { width: number; height: number };
  },
  pageNumber: number,
): PageRecord {
  const viewport = page.getViewport({ scale: 1.0, rotation: 0 });
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    nativeRotation: normalizeRotation(page.rotate),
    ...pageCropOrigin(page),
    userUnit:
      typeof page.userUnit === "number" && Number.isFinite(page.userUnit) && page.userUnit > 0
        ? page.userUnit
        : 1,
  };
}
