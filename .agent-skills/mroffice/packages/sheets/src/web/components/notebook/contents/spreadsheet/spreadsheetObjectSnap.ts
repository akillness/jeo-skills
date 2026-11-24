/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The sheet's adapter to the shared object snapping (lib/office-object-snap):
 * Shape Format > Align > Snap to Shape lines a dragged, sized or drawn
 * object up with the sheet's other drawings (pictures, shapes, text boxes,
 * charts, SmartArt frames) and the sheet's corner, in grid px, with the
 * guides drawn over the drawing layer.
 */

import {
  objectSnapThreshold,
  officeShapeSnapsRound,
  paintObjectSnapGuides,
  type ObjectSnapGuides,
  type ObjectSnapRect,
  type ObjectSnapScene,
} from "@mrnote/core/web/lib/office-object-snap.ts";

import { SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_HEADER_WIDTH_PX } from "./spreadsheetGridConstants";

/** One drawing on the sheet, as the window lays it out (grid px). */
export interface SpreadsheetObjectSnapEntry {
  /** `drawing:<object id>` or `native:<chart id>`. */
  readonly id: string;
  readonly frame: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly hidden?: boolean;
  /** The preset shape kind, for an ellipse's or a diamond's snap points. */
  readonly shapeKind?: string;
}

/** What the window publishes for the next gesture: the active sheet's
 * drawings and the ones selected together (they move as one). */
export interface SpreadsheetObjectSnapEntries {
  readonly sheetId: string;
  readonly entries: readonly SpreadsheetObjectSnapEntry[];
  readonly selected: readonly string[];
}

/** The drawing layer the guides are drawn over. */
export const SPREADSHEET_DRAWING_LAYER_SELECTOR = '[data-testid="spreadsheet-drawing-layer"]';

const rectOf = (entry: SpreadsheetObjectSnapEntry): ObjectSnapRect => ({
  ...entry.frame,
  round: officeShapeSnapsRound(entry.shapeKind),
});

/**
 * The scene for a gesture on `primaryId`: the boxes that move with it (the
 * selection it belongs to, a SmartArt frame's members) and everything else
 * on the sheet, plus the sheet's corner (the top-left of cell A1).
 */
export function spreadsheetObjectSnapScene(
  published: SpreadsheetObjectSnapEntries | null,
  sheetId: string,
  primaryId: string,
  zoom: number,
  carried: readonly string[] = [],
): { moving: ObjectSnapRect[]; scene: ObjectSnapScene } {
  const entries = published?.sheetId === sheetId ? published.entries : [];
  const primary = `drawing:${primaryId}`;
  const movingIds = new Set<string>([primary, ...carried.map((id) => `drawing:${id}`)]);
  if (published?.sheetId === sheetId && published.selected.includes(primary)) {
    for (const id of published.selected) movingIds.add(id);
  }
  const visible = entries.filter((entry) => !entry.hidden && entry.frame.width >= 0 && entry.frame.height >= 0);
  return {
    moving: visible.filter((entry) => movingIds.has(entry.id) && entry.id !== primary).map(rectOf),
    scene: {
      others: visible.filter((entry) => !movingIds.has(entry.id)).map(rectOf),
      frames: [{ left: SPREADSHEET_HEADER_WIDTH_PX, top: SPREADSHEET_HEADER_HEIGHT_PX, width: 0, height: 0 }],
      threshold: objectSnapThreshold(1 / (zoom > 0 ? zoom : 1)),
    },
  };
}

/**
 * Draw `guides` (grid px) over the drawing layer `anchor` sits in, or take
 * them away with null.
 */
export function paintSpreadsheetObjectSnapGuides(
  anchor: Element | null,
  guides: ObjectSnapGuides | null,
  zoom: number,
): void {
  const doc = anchor?.ownerDocument ?? (typeof document === "undefined" ? null : document);
  if (!doc) return;
  if (!guides || !anchor) {
    paintObjectSnapGuides(doc, null);
    return;
  }
  const layer = (anchor.closest(SPREADSHEET_DRAWING_LAYER_SELECTOR) ?? anchor) as HTMLElement;
  const rect = layer.getBoundingClientRect();
  const scale = layer.offsetWidth > 0 && rect.width > 0 ? rect.width / layer.offsetWidth : zoom || 1;
  paintObjectSnapGuides(
    doc,
    guides,
    (x, y) => ({ x: rect.left + x * scale, y: rect.top + y * scale }),
    layer,
  );
}
