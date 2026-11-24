"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { exceedsPanThreshold as exceedsObjectMoveThreshold } from "@mrnote/pdf/web/lib/pdf/hand-tool.ts";
import { objectAspectLocked, objectBoundsPixels, spreadsheetObjectBoundsFloor, spreadsheetObjectRotation, type SpreadsheetObjectBounds } from "../../../../lib/spreadsheet/drawing-buttons";
import { useCallback, type KeyboardEvent as ReactKeyboardEvent, useEffect, type RefObject } from "react";
import { SHEET_DRAWING_HANDLE } from "../../../../lib/spreadsheet/drawing-selection";
import { applyMultiResize, selectionBoundingBox } from "@mrnote/core/web/lib/presentation-multi-transform.ts";
import { constrainedMoveAxis } from "@mrnote/core/web/lib/presentation-drag.ts";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { isSpreadsheetInkObject } from "./spreadsheetObjectContext";
import { SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX, SPREADSHEET_SMARTART_MEMBER_MIN_PX } from "./spreadsheetGridConstants";
import { type SpreadsheetObjectResizeHandle, resizeObjectBounds, nearestGridLineAtPixels, snapMovedObjectBounds, frameMembersMoved, frameGestureResult, resizeObjectBoundsThroughZero, releaseObjectMoveCapture, type SpreadsheetObjectTransformPreview, type SpreadsheetObjectTransformGesture } from "./spreadsheetObjectGestures";
import { type SparseAxisSizeResolver } from "@mrnote/core/web/lib/spreadsheet/grid-sizing.ts";
import { endOfficeTextEditingForHandle } from "@mrnote/core/web/lib/office-text-edit-mode.ts";
import { snapObjectMove, snapObjectResize } from "@mrnote/core/web/lib/office-object-snap.ts";
import { paintSpreadsheetObjectSnapGuides, spreadsheetObjectSnapScene, type SpreadsheetObjectSnapEntries } from "./spreadsheetObjectSnap";
import { officeFrameAxesDelta } from "@mrnote/core/web/lib/office-object-frame.ts";

/** What useSpreadsheetObjectKeyboardTransform reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetObjectKeyboardTransformInputs {
  colWidth: SparseAxisSizeResolver;
  commitObjectTransformPreview: (preview: SpreadsheetObjectTransformPreview, gesture: SpreadsheetObjectTransformGesture) => boolean;
  drawingClickConsumedRef: RefObject<boolean>;
  drawingDragDeltaRef: RefObject<(from: { x: number; y: number; }, to: { x: number; y: number; }) => { dx: number; dy: number; }>;
  objectSnapToGrid: boolean;
  objectSnapToShape: boolean;
  /** The sheet's drawings and selection, for Snap to Shape's scene. */
  objectSnapEntriesRef: RefObject<SpreadsheetObjectSnapEntries | null>;
  objectTransformGestureRef: RefObject<SpreadsheetObjectTransformGesture | null>;
  objectTransformPreviewRef: RefObject<SpreadsheetObjectTransformPreview | null>;
  rowHeight: SparseAxisSizeResolver;
  sheet: SheetModel;
  sheetObjects: SpreadsheetObject[];
  sheetZoom: number;
  smartArtFrameGestureRef: RefObject<string | null>;
  writeObjectTransformPreview: (preview: SpreadsheetObjectTransformPreview | null) => void;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetObjectKeyboardTransform({
  colWidth,
  commitObjectTransformPreview,
  drawingClickConsumedRef,
  drawingDragDeltaRef,
  objectSnapToGrid,
  objectSnapToShape,
  objectSnapEntriesRef,
  objectTransformGestureRef,
  objectTransformPreviewRef,
  rowHeight,
  sheet,
  sheetObjects,
  sheetZoom,
  smartArtFrameGestureRef,
  writeObjectTransformPreview,
}: SpreadsheetObjectKeyboardTransformInputs) {
  const keyboardResizeObject = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      object: SpreadsheetObject,
      handle: SpreadsheetObjectResizeHandle,
    ) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const deltaX =
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0;
      const deltaY =
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const startBounds = objectBoundsPixels(object, colWidth, rowHeight);
      // Lock aspect ratio holds for the handle's arrows as for its drag.
      const next = resizeObjectBounds(
        startBounds,
        handle,
        deltaX,
        deltaY,
        objectAspectLocked(object) ? startBounds.width / Math.max(1, startBounds.height) : null,
      );
      if (
        next.left === startBounds.left &&
        next.top === startBounds.top &&
        next.width === startBounds.width &&
        next.height === startBounds.height
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startRotation = spreadsheetObjectRotation(object.anchor);
      commitObjectTransformPreview(
        {
          sheetId: sheet.id,
          objectId: object.id,
          ...next,
          rotation: startRotation,
        },
        {
          kind: "resize",
          pointerId: -1,
          objectId: object.id,
          sheetId: sheet.id,
          startClientX: 0,
          startClientY: 0,
          startBounds,
          startRotation,
          handle,
          sourceObject: object,
          sourceObjects: sheetObjects,
        },
      );
    },
    [colWidth, commitObjectTransformPreview, rowHeight, sheet.id, sheetObjects],
  );

  const keyboardRotateObject = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      object: SpreadsheetObject,
    ) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 15 : 1;
      const direction =
        event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
      const startBounds = objectBoundsPixels(object, colWidth, rowHeight);
      const startRotation = spreadsheetObjectRotation(object.anchor);
      const rotation = Math.round((startRotation + direction * step) * 10) / 10;
      commitObjectTransformPreview(
        {
          sheetId: sheet.id,
          objectId: object.id,
          ...startBounds,
          rotation,
        },
        {
          kind: "rotate",
          pointerId: -1,
          objectId: object.id,
          sheetId: sheet.id,
          centerClientX: 0,
          centerClientY: 0,
          startPointerAngle: 0,
          startBounds,
          startRotation,
          sourceObject: object,
          sourceObjects: sheetObjects,
        },
      );
    },
    [colWidth, commitObjectTransformPreview, rowHeight, sheet.id, sheetObjects],
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const gesture = objectTransformGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.kind === "move" && !gesture.moved) {
        // Reuse the PDF hand tool's screen-pixel click tolerance: zoom does
        // not turn an ordinary press jitter into a committed object move.
        if (!exceedsObjectMoveThreshold(
          { clientX: gesture.startClientX, clientY: gesture.startClientY }, event,
        )) return;
        gesture.moved = true;
        drawingClickConsumedRef.current = true;
        try {
          gesture.captureTarget.setPointerCapture?.(gesture.pointerId);
        } catch {
          // Window listeners still finish/cancel if capture is unavailable.
        }
      }
      event.preventDefault();
      if (gesture.kind === "move") {
        const carried = drawingDragDeltaRef.current(
          { x: gesture.startClientX, y: gesture.startClientY },
          { x: event.clientX, y: event.clientY },
        );
        // Shift keeps the drag on one line, horizontal or vertical (Excel's
        // drawing layer, as the slide's and the page's).
        const along = constrainedMoveAxis(carried.dx, carried.dy, event.shiftKey);
        // Stopped at the sheet's corner, where the release writes it: let
        // over the headings, the drawing jumped back to A1 on release.
        const floor = spreadsheetObjectBoundsFloor(gesture.sourceObject.anchor);
        const rawBounds: SpreadsheetObjectBounds = {
          ...gesture.startBounds,
          left: Math.max(floor.left, gesture.startBounds.left + (along === "vertical" ? 0 : carried.dx)),
          top: Math.max(floor.top, gesture.startBounds.top + (along === "horizontal" ? 0 : carried.dy)),
        };
        let next = rawBounds;
        const alt = event.altKey === true;
        // Excel: Alt while dragging snaps the object to the cell gridlines
        // when Snap to Grid is off, and frees it when Snap to Grid is on
        // (Microsoft Support, "Align or arrange objects": hold ALT to align
        // to cell gridlines); it frees it from Snap to Shape too. The grid,
        // when it snaps, takes the move: no object guides.
        if (objectSnapToGrid !== alt) {
          const xAnchors = [
            rawBounds.left,
            rawBounds.left + rawBounds.width / 2,
            rawBounds.left + rawBounds.width,
          ];
          const yAnchors = [
            rawBounds.top,
            rawBounds.top + rawBounds.height / 2,
            rawBounds.top + rawBounds.height,
          ];
          const snapped = snapMovedObjectBounds(
            rawBounds,
            xAnchors.map((value) =>
              nearestGridLineAtPixels(value, SPREADSHEET_HEADER_WIDTH_PX, sheet.columnCount, colWidth, "column"),
            ),
            yAnchors.map((value) =>
              nearestGridLineAtPixels(value, SPREADSHEET_HEADER_HEIGHT_PX, sheet.rowCount, rowHeight, "row"),
            ),
          );
          // A snap never moves the object off the line Shift holds it on.
          next =
            along === "horizontal"
              ? { ...snapped, top: rawBounds.top }
              : along === "vertical"
                ? { ...snapped, left: rawBounds.left }
                : snapped;
          paintSpreadsheetObjectSnapGuides(null, null, sheetZoom);
        } else if (objectSnapToShape && !alt) {
          // Snap to Shape: the selection's edges and centres to the other
          // drawings' and the sheet's corner, or an even gap between them,
          // with the guides drawn (lib/office-object-snap).
          const { moving, scene } = spreadsheetObjectSnapScene(
            objectSnapEntriesRef.current,
            gesture.sheetId,
            gesture.objectId,
            sheetZoom,
            gesture.frameMembers?.map((member) => member.blockId),
          );
          const snapped = snapObjectMove(
            [gesture.startBounds, ...moving],
            rawBounds.left - gesture.startBounds.left,
            rawBounds.top - gesture.startBounds.top,
            scene,
            { lock: along },
          );
          next = {
            ...rawBounds,
            left: Math.max(floor.left, gesture.startBounds.left + snapped.dx),
            top: Math.max(floor.top, gesture.startBounds.top + snapped.dy),
          };
          paintSpreadsheetObjectSnapGuides(gesture.captureTarget, snapped.guides, sheetZoom);
        } else {
          paintSpreadsheetObjectSnapGuides(null, null, sheetZoom);
        }
        writeObjectTransformPreview({
          sheetId: gesture.sheetId,
          objectId: gesture.objectId,
          ...next,
          rotation: gesture.startRotation,
          ...(gesture.frameMembers
            ? { members: frameMembersMoved(gesture.frameMembers, next.left - gesture.startBounds.left, next.top - gesture.startBounds.top) }
            : {}),
        });
        return;
      }
      if (gesture.kind === "resize") {
        const local = officeFrameAxesDelta(
          { rotation: gesture.startRotation },
          event.clientX - gesture.startClientX,
          event.clientY - gesture.startClientY,
        );
        const localDeltaX = local.x / sheetZoom;
        const localDeltaY = local.y / sheetZoom;
        if (gesture.frameMembers) {
          // The diagram frame: the shared multi-selection resize (the rule a
          // slide's SmartArt frame and a multi-selection follow) scales every
          // member about the box's anchored edge, floors the SCALE so no
          // member collapses, and the frame is the members' union again.
          // The shared helper rounds to whole units (EMU on a slide); run it
          // in thousandths of a pixel so a fractional sheet box keeps its size.
          const unit = 1000;
          const scaled = applyMultiResize(
            gesture.frameMembers.map(({ blockId, startGeom }) => ({ blockId, startGeom: {
              left: startGeom.left * unit, top: startGeom.top * unit, width: startGeom.width * unit, height: startGeom.height * unit,
            } })),
            SHEET_DRAWING_HANDLE[gesture.handle],
            localDeltaX * unit,
            localDeltaY * unit,
            { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY },
            { maintainAspect: event.shiftKey, minSize: SPREADSHEET_SMARTART_MEMBER_MIN_PX * unit },
          );
          const members = new Map([...scaled].map(([blockId, geom]) => [blockId, {
            left: geom.left / unit, top: geom.top / unit, width: geom.width / unit, height: geom.height / unit,
          }]));
          const box = selectionBoundingBox(
            [...members].map(([blockId, startGeom]) => ({ blockId, startGeom })),
          );
          if (!box) return;
          writeObjectTransformPreview({
            sheetId: gesture.sheetId,
            objectId: gesture.objectId,
            ...box,
            rotation: gesture.startRotation,
            members: frameGestureResult(members),
          });
          return;
        }
        // Lock aspect ratio (the object's own, a picture's by default, or
        // Shift while dragging, as in Excel): the start proportions hold.
        const aspect =
          objectAspectLocked(gesture.sourceObject) || event.shiftKey
            ? gesture.startBounds.width / Math.max(1, gesture.startBounds.height)
            : null;
        // A shape or picture dragged through the pinned edge mirrors in the
        // same gesture, as Excel flips it; a chart or diagram never mirrors.
        const mirrors =
          gesture.sourceObject.type === "shape" || gesture.sourceObject.type === "image";
        // Stretched no farther than the sheet's corner, where the release
        // puts it (the move stops there too).
        const floor = spreadsheetObjectBoundsFloor(gesture.sourceObject.anchor);
        const resized = (deltaX: number, deltaY: number) => mirrors
          ? resizeObjectBoundsThroughZero(gesture.startBounds, gesture.handle, deltaX, deltaY, aspect, floor)
          : { bounds: resizeObjectBounds(gesture.startBounds, gesture.handle, deltaX, deltaY, aspect, floor), flipX: false, flipY: false };
        // Snap to Shape sizes the dragged edges onto the other drawings'
        // edges and centres (points only); never a turned object, whose
        // edges are not the sheet's, and never while the grid snaps.
        let sizeX = localDeltaX;
        let sizeY = localDeltaY;
        // A stroke of ink scales freely: snapped edge by edge, its width and
        
        if (
          objectSnapToShape &&
          event.altKey !== true &&
          !objectSnapToGrid &&
          !isSpreadsheetInkObject(gesture.sourceObject) &&
          Math.round(gesture.startRotation) % 360 === 0
        ) {
          const { scene } = spreadsheetObjectSnapScene(
            objectSnapEntriesRef.current,
            gesture.sheetId,
            gesture.objectId,
            sheetZoom,
          );
          const snapped = snapObjectResize({
            evaluate: (deltaX, deltaY) => resized(deltaX, deltaY).bounds,
            dx: localDeltaX,
            dy: localDeltaY,
            handle: SHEET_DRAWING_HANDLE[gesture.handle],
            scene,
            lockAspect: aspect !== null,
          });
          sizeX = snapped.dx;
          sizeY = snapped.dy;
          paintSpreadsheetObjectSnapGuides(
            document.querySelector(`[data-drawing-preview-id="drawing:${CSS.escape(gesture.objectId)}"]`),
            snapped.guides,
            sheetZoom,
          );
        }
        const through = resized(sizeX, sizeY);
        writeObjectTransformPreview({
          sheetId: gesture.sheetId,
          objectId: gesture.objectId,
          ...through.bounds,
          rotation: gesture.startRotation,
          ...(mirrors
            ? {
                flipH: (gesture.sourceObject.anchor?.flipH === true) !== through.flipX,
                flipV: (gesture.sourceObject.anchor?.flipV === true) !== through.flipY,
              }
            : {}),
        });
        return;
      }
      const angle = Math.atan2(
        event.clientY - gesture.centerClientY,
        event.clientX - gesture.centerClientX,
      );
      const degrees =
        gesture.startRotation +
        ((angle - gesture.startPointerAngle) * 180) / Math.PI;
      const snapped = event.shiftKey ? Math.round(degrees / 15) * 15 : degrees;
      writeObjectTransformPreview({
        sheetId: gesture.sheetId,
        objectId: gesture.objectId,
        ...gesture.startBounds,
        rotation: Math.round(snapped * 10) / 10,
      });
    };
    const finish = (event: PointerEvent) => {
      const gesture = objectTransformGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      onPointerMove(event);
      const preview = objectTransformPreviewRef.current;
      releaseObjectMoveCapture(gesture);
      objectTransformGestureRef.current = null;
      writeObjectTransformPreview(null);
      paintSpreadsheetObjectSnapGuides(null, null, sheetZoom);
      if (!preview) return;
      const changed =
        preview.left !== gesture.startBounds.left ||
        preview.top !== gesture.startBounds.top ||
        preview.width !== gesture.startBounds.width ||
        preview.height !== gesture.startBounds.height ||
        preview.rotation !== gesture.startRotation ||
        (preview.flipH !== undefined && preview.flipH !== (gesture.sourceObject.anchor?.flipH === true)) ||
        (preview.flipV !== undefined && preview.flipV !== (gesture.sourceObject.anchor?.flipV === true));
      if (changed) commitObjectTransformPreview(preview, gesture);
      // Only now: the commit above is the frame gesture's own write.
      smartArtFrameGestureRef.current = null;
      // Office ends the typing in a shape whose handle was dragged. After the
      // commit: the words written on blur replace the object the gesture
      // checks its write against, which would refuse the resize.
      endOfficeTextEditingForHandle(
        document.querySelector('[data-testid="spreadsheet-grid-viewport"]'),
      );
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", finish);
    const cancel = () => {
      releaseObjectMoveCapture(objectTransformGestureRef.current);
      objectTransformGestureRef.current = null;
      smartArtFrameGestureRef.current = null;
      writeObjectTransformPreview(null);
      paintSpreadsheetObjectSnapGuides(null, null, sheetZoom);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && objectTransformGestureRef.current) cancel();
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onEscape);
    };
  }, [
    colWidth,
    commitObjectTransformPreview,
    objectSnapToGrid,
    objectSnapToShape,
    rowHeight,
    sheet.columnCount,
    sheet.rowCount,
    sheetZoom,
    writeObjectTransformPreview,
  ]);
  return {
    keyboardResizeObject,
    keyboardRotateObject,
  };
}
