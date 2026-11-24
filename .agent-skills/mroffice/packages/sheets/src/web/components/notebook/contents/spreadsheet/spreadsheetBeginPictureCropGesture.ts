"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { spreadsheetObjectRotation } from "../../../../lib/spreadsheet/drawing-buttons";
import { type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { officeShapeLocalPoint } from "@mrnote/core/web/lib/office-shape-adjust-handles.ts";
import { clampCropRect, canonicalizeDrawingMlCropRect, normalizeSignedCropRect, sameCropRect } from "@mrnote/core/web/lib/presentation-crop-group.ts";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { type SpreadsheetObjectResizeHandle, type SpreadsheetPictureCropGesture, adjustSpreadsheetPictureCrop, type SpreadsheetPictureCropPreview } from "./spreadsheetObjectGestures";
import { type PictureFormatWriterControlId } from "./spreadsheetMutationReceipts";
import { type Dispatch, type SetStateAction } from "react";

/** What spreadsheetBeginPictureCropGesture reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetBeginPictureCropGestureInputs {
  executePictureFormatMutation: (controlId: PictureFormatWriterControlId, parameter: string | number, surface?: "visible" | "keyboard" | "navigation") => Promise<boolean | void>;
  pictureCropDisabledReason: string | undefined;
  pictureCropEditingIdRef: RefObject<string | null>;
  pictureCropGestureCleanupRef: RefObject<(() => void) | null>;
  pictureCropGestureRef: RefObject<SpreadsheetPictureCropGesture | null>;
  setPictureCropPreview: Dispatch<SetStateAction<SpreadsheetPictureCropPreview | null>>;
  sheet: SheetModel;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function spreadsheetBeginPictureCropGesture({
  executePictureFormatMutation,
  pictureCropDisabledReason,
  pictureCropEditingIdRef,
  pictureCropGestureCleanupRef,
  pictureCropGestureRef,
  setPictureCropPreview,
  sheet,
}: SpreadsheetBeginPictureCropGestureInputs) {
  const beginPictureCropGesture = (
    event: ReactPointerEvent<HTMLButtonElement>,
    object: SpreadsheetObject,
    handle: SpreadsheetObjectResizeHandle,
  ) => {
    if (
      object.type !== "image" ||
      pictureCropEditingIdRef.current !== object.id ||
      pictureCropDisabledReason
    ) {
      return;
    }
    const frame = event.currentTarget.closest(
      ".spreadsheet-window__object-selection-frame",
    ) as HTMLElement | null;
    const bounds = frame?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    // A Fit's crop reaches past the picture (an outset above and below, or
    // either side): it is cropped as it is. Clamped into the picture first,
    // the outset was dropped, and cropping one edge stretched what remained
    // to fill the frame (live audit S-061).
    const startCrop = normalizeSignedCropRect(object.cropRect) ?? clampCropRect(object.cropRect);
    // A turned picture crops along its own sides (B356): the pointer's move
    // is turned back into the picture's frame, and the frame's own size (not
    // the turned box around it) sets how far a pixel crops.
    const rotation = spreadsheetObjectRotation(object.anchor) || 0;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localWidth = frame?.offsetWidth || bounds.width;
    const localHeight = frame?.offsetHeight || bounds.height;
    const turnedWidth = localWidth * Math.abs(cos) + localHeight * Math.abs(sin);
    const scale = turnedWidth > 0 ? bounds.width / turnedWidth : 1;
    const gesture: SpreadsheetPictureCropGesture = {
      objectId: object.id,
      sheetId: sheet.id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      fractionPerPixelX: startCrop.w / Math.max(1, localWidth * scale),
      fractionPerPixelY: startCrop.h / Math.max(1, localHeight * scale),
      rotation,
      startCrop,
      latestCrop: startCrop,
    };
    pictureCropGestureRef.current = gesture;
    setPictureCropPreview({
      sheetId: sheet.id,
      objectId: object.id,
      crop: startCrop,
    });

    function onMove(moveEvent: PointerEvent) {
      const current = pictureCropGestureRef.current;
      if (!current) return;
      // The move about a zero box: the shape's own turned-back offset.
      const local = officeShapeLocalPoint(
        {
          x: moveEvent.clientX - current.startClientX,
          y: moveEvent.clientY - current.startClientY,
        },
        { left: 0, top: 0, width: 0, height: 0 },
        current.rotation,
      );
      const next = adjustSpreadsheetPictureCrop(
        current.startCrop,
        current.handle,
        local.x,
        local.y,
        current.fractionPerPixelX,
        current.fractionPerPixelY,
      );
      current.latestCrop = next;
      setPictureCropPreview({
        sheetId: current.sheetId,
        objectId: current.objectId,
        crop: next,
      });
    }
    function detach() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      pictureCropGestureRef.current = null;
      pictureCropGestureCleanupRef.current = null;
      setPictureCropPreview(null);
    }
    function onUp() {
      const current = pictureCropGestureRef.current;
      const next = current
        ? canonicalizeDrawingMlCropRect(current.latestCrop)
        : null;
      const changed = Boolean(
        current && next && !sameCropRect(next, current.startCrop),
      );
      detach();
      if (current && next && changed) {
        // A handle crops with the frame: its edge moves with the crop's.
        void executePictureFormatMutation(
          "XLSCTL.CONTEXT.PICTURE.CROP.MRAI.APPLY",
          JSON.stringify({ crop: next, frame: "follow" }),
        );
      }
    }
    function onCancel() {
      detach();
    }
    pictureCropGestureCleanupRef.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };
  return {
    beginPictureCropGesture,
  };
}
