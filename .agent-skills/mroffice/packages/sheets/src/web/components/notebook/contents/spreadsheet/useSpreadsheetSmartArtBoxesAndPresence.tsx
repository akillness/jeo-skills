"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { type SpreadsheetObjectBounds, objectBoundsPixels } from "../../../../lib/spreadsheet/drawing-buttons";
import { useMemo } from "react";
import { spreadsheetShapeSceneCamera } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { totalAxisSize, offsetOfLine } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type SheetModel, type SpreadsheetObject } from "./spreadsheetSheetModel";
import { SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX } from "./spreadsheetGridConstants";
import { columnLabel } from "./spreadsheetRangeA1";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { type WorkbookRemotePresence } from "@/lib/collab/workbook-presence";

/** What useSpreadsheetSmartArtBoxesAndPresence reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetSmartArtBoxesAndPresenceInputs {
  colWidth: SparseAxisSizeResolver;
  rowHeight: SparseAxisSizeResolver;
  sheetObjects: SpreadsheetObject[];
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetSmartArtBoxesAndPresence({
  colWidth,
  rowHeight,
  sheetObjects,
}: SpreadsheetSmartArtBoxesAndPresenceInputs) {
  /**
   * The BOX of every SmartArt diagram that carries a 3-D camera, by `groupId`.
   *
   * Styles `3d5`–`3d9` tilt the whole diagram, not each box about its own
   * centre, so every member needs one shared rotation origin: the union of the
   * members' rectangles (SMARTART-STYLES.md §3/§5). A worksheet has no group
   * object to hold it — a sheet diagram is exactly its members sharing a
   * `groupId` — so the box is derived here, from the same pixel geometry the
   * objects are laid out with. Empty (and free) for every workbook without a
   * 3-D diagram, which is all of them until a style is applied.
   */
  const smartArtDiagramBoxes = useMemo(() => {
    const boxes = new Map<string, SpreadsheetObjectBounds>();
    for (const object of sheetObjects) {
      // A group's own camera (`nativeGroupScene3d`) turns it about this box too.
      if (object.type !== "shape" || !object.groupId || !spreadsheetShapeSceneCamera(object.shape)) {
        continue;
      }
      const bounds = objectBoundsPixels(object, colWidth, rowHeight);
      const current = boxes.get(object.groupId);
      if (!current) {
        boxes.set(object.groupId, bounds);
        continue;
      }
      const left = Math.min(current.left, bounds.left);
      const top = Math.min(current.top, bounds.top);
      boxes.set(object.groupId, {
        left,
        top,
        width: Math.max(current.left + current.width, bounds.left + bounds.width) - left,
        height: Math.max(current.top + current.height, bounds.top + bounds.height) - top,
      });
    }
    return boxes;
  }, [sheetObjects, colWidth, rowHeight]);
  return {
    smartArtDiagramBoxes,
  };
}

/** Where each remote peer's range and active cell are drawn over the grid
 * (content px), for the presence overlay (SpreadsheetRemotePresenceOverlays). */
export function workbookRemotePresenceOverlayBoxes(
  remoteWorkbookPresence: readonly WorkbookRemotePresence[],
  {
    colWidth,
    gridRtl,
    rowHeight,
    sheet,
  }: {
    colWidth: SparseAxisSizeResolver;
    gridRtl: boolean;
    rowHeight: SparseAxisSizeResolver;
    sheet: Pick<SheetModel, "columnCount" | "rowCount">;
  },
) {
  const sheetWidth = totalAxisSize(sheet.columnCount, colWidth);
  const horizontalOffset = (column: number, end: number) => {
    const startOffset = offsetOfLine(column, sheet.columnCount, colWidth);
    const endOffset = offsetOfLine(end, sheet.columnCount, colWidth);
    return {
      left:
        SPREADSHEET_HEADER_WIDTH_PX +
        (gridRtl ? sheetWidth - endOffset : startOffset),
      width: Math.max(2, endOffset - startOffset),
    };
  };
  return remoteWorkbookPresence.map((presence) => {
    const rangeHorizontal = horizontalOffset(
      presence.range.c1,
      presence.range.c2 + 1,
    );
    const rangeTop =
      SPREADSHEET_HEADER_HEIGHT_PX +
      offsetOfLine(presence.range.r1, sheet.rowCount, rowHeight);
    const rangeBottom =
      SPREADSHEET_HEADER_HEIGHT_PX +
      offsetOfLine(presence.range.r2 + 1, sheet.rowCount, rowHeight);
    const activeHorizontal = horizontalOffset(
      presence.active.col,
      presence.active.col + 1,
    );
    const activeTop =
      SPREADSHEET_HEADER_HEIGHT_PX +
      offsetOfLine(presence.active.row, sheet.rowCount, rowHeight);
    const activeBottom =
      SPREADSHEET_HEADER_HEIGHT_PX +
      offsetOfLine(presence.active.row + 1, sheet.rowCount, rowHeight);
    const color = presence.user.color;
    return {
      presence,
      color,
      background:
        /^#[0-9a-f]{6}$/iu.test(color) ? `${color}18` : "transparent",
      label: `${presence.user.name} · ${columnLabel(presence.active.col)}${presence.active.row + 1}`,
      range: {
        left: rangeHorizontal.left,
        top: rangeTop,
        width: rangeHorizontal.width,
        height: Math.max(2, rangeBottom - rangeTop),
      },
      active: {
        left: activeHorizontal.left - rangeHorizontal.left,
        top: activeTop - rangeTop,
        width: activeHorizontal.width,
        height: Math.max(2, activeBottom - activeTop),
      },
    };
  });
}
