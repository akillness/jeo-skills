"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { createInkPenDynamics } from "@mrnote/core/web/lib/office-ink-pen-dynamics.ts";
import { inkPenGestures } from "@mrnote/core/web/lib/office-ink-pen-gestures.ts";
import { EMU_PER_CSS_PIXEL, type SpreadsheetObjectAnchor } from "../../../../lib/spreadsheet/drawing-buttons";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { documentInkEraserRadiusPx } from "@mrnote/core/web/lib/document-ink.ts";
import { eraseSpreadsheetInkUnder } from "../../../../lib/spreadsheet/ink-erase";
import { spreadsheetInkWidthPx } from "../../../../lib/spreadsheet/ink-pens";
import { type SpreadsheetRibbonTabId } from "../../../../lib/spreadsheet/SpreadsheetRibbon";
import { type SheetProtectionPermission } from "@mrnote/core/web/lib/spreadsheet/protection.ts";
import { MAX_SPREADSHEET_INK_POINTS, createSpreadsheetInkShapeObject, spreadsheetInkOpacityForTool, type SpreadsheetInkPoint } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { inkPathIdsHitByEraser, inkPathIdsInLasso } from "@mrnote/core/web/lib/presentation-annotation.ts";
import {
  anchorInkLassoLoop,
  inkLassoUnionBox,
  isInkLassoOverlayTarget,
  type InkLassoAnchoredLoop,
  type InkLassoBox,
} from "@mrnote/core/web/lib/office-ink-lasso-selection.ts";
import { type SpreadsheetObject, type SheetModel } from "./spreadsheetSheetModel";
import { SPREADSHEET_HEADER_WIDTH_PX, SPREADSHEET_HEADER_HEIGHT_PX } from "./spreadsheetGridConstants";
import { type SpreadsheetInkGesture, type SpreadsheetInkInteractionMode } from "./spreadsheetObjectGestures";
import { inkAcceptsPointer } from "@mrnote/core/web/lib/draw-with-touch.ts";
import {
  INK_HOLD_SHAPE_MIN_LENGTH_PX,
  INK_HOLD_SHAPE_STILL_PX,
  type InkHoldRestWait,
  waitForInkHoldRest,
  inkHeldShape,
  inkHeldShapeAtLift,
  inkHeldShapeFollow,
  type InkHeldShape,
  inkHoldShapeFit,
  inkHoldShapeOutline,
  inkPathLength,
} from "@mrnote/core/web/lib/office-ink-hold-shape.ts";
import {
  INK_CAPTURE_MAX_POINTS,
  inkCornerDegreesForTool,
  inkLandedSampleIndexes,
  inkPressuresVary,
  inkSteadyPressureWidthFactor,
  inkStrokePathData,
  inkVariableWidthOutlinePathData,
  thinInkSamples,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";
import { InkLiveCanvas, inkLiveEffectStyle } from "@mrnote/core/web/lib/office-ink-live.ts";
import { appendInkEffectSvg, inkEffectPaint, inkEffectSvgPlan, isInkEffect } from "@mrnote/core/web/lib/office-ink-effects.ts";
import { WetInkBatcher } from "@mrnote/core/web/lib/office-wet-ink.ts";
import { wetInkSvgElement } from "@mrnote/core/web/lib/office-wet-ink-layer.ts";
import { inkRulerGuideFor, type InkRulerState } from "@mrnote/core/web/lib/office-ink-ruler.ts";
import {
  inkPointerArbiter,
  inkPointerSamples,
  inkPredictedSamples,
  inkSamplePressure,
} from "@mrnote/core/web/lib/ink-pointer-policy.ts";
import { runInkPressSetup } from "@mrnote/core/web/lib/ink-press-deferral.ts";
import { yieldTouchHold } from "@mrnote/core/web/lib/touch-hold.ts";
import { startInkHoldToErase } from "@mrnote/core/web/lib/pen-first-draw.ts";
import { isOfficeInkTap } from "@mrnote/core/web/lib/office-ink-conversion.ts";
import { inkPresetForTilt } from "@mrnote/core/web/lib/office-ink-tilt.ts";
import { MAX_SHAPE_STROKE_WIDTH } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";
import { isInkCircleGesture } from "@mrnote/core/web/lib/office-ink-lasso-selection.ts";
import { INK_CIRCLE_OFFER_MS, inkCircleOfferAt, type OfficeInkCircleOffer } from "@mrnote/core/web/components/office-ribbon/OfficeInkCircleSelect.tsx";
import { inkPathIdsUnderScratchOut, inkScratchOutEnabled, inkScratchOutTakes, inkToolScratchesOut, isInkScratchOut } from "@mrnote/core/web/lib/office-ink-scratch-out.ts";
import { MAX_SHEET_OBJECTS, spreadsheetInkPaths, spreadsheetInkToShapeObject, isSpreadsheetDrawnShapeObject, isSpreadsheetInkObject, isSpreadsheetLassoObject, spreadsheetInkObjectSignature } from "./spreadsheetObjectContext";
import { type SheetViewMappedCellMutation, type SheetViewMappedDrawingMutation, type SheetViewMappedLineMutation, type SheetViewMappedPageMutation } from "./spreadsheetSheetViews";
import { type DocumentInkPreset } from "@mrnote/core/web/lib/document-ink.ts";
import { type Dispatch, type SetStateAction } from "react";
import { type SpreadsheetInkTool, type SpreadsheetShapeStyle } from "@mrnote/core/web/lib/spreadsheet/shapes.ts";

/**
 * The eraser's reach in grid pixels. Its radius is on screen, as on the page
 * and the slide and as its trail is drawn, whatever the sheet's and the
 * workspace's zoom: the grid-pixel radius it rubbed with at 200% erased
 * twice the trail it showed.
 */
function spreadsheetEraserReachPx(eraser: SpreadsheetInkGesture["eraser"], contentPerScreen: number): number {
  return documentInkEraserRadiusPx(eraser) * (contentPerScreen > 0 ? contentPerScreen : 1);
}

/** What useSpreadsheetBeginInkGesture reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetBeginInkGestureInputs {
  inkEraserRef: RefObject<"medium" | "stroke" | "small">;
  inkGestureCleanupRef: RefObject<(() => void) | null>;
  inkGestureRef: RefObject<SpreadsheetInkGesture | null>;
  /** The running stroke's canvas over the draw surface (lib/office-ink-live). */
  inkLiveRef: RefObject<InkLiveCanvas | null>;
  /** The Draw tab's Ruler, in the surface's pixels, when shown (lib/office-ink-ruler). */
  inkRulerRef: RefObject<InkRulerState | null>;
  /** The finished strokes not yet in the worksheet (lib/office-wet-ink). */
  inkWetRef: RefObject<WetInkBatcher<SpreadsheetWetStroke> | null>;
  /** Sends the strokes in hand to the others in the room (lib/collab/ink-presence). */
  inkLivePublishRef?: RefObject<(() => void) | null>;
  /** Commit a sheet by id (one the user may have left since drawing on it). */
  replaceSheetById: (sheetId: string, nextSheet: SheetModel) => void;
  inkInteractionModeRef: RefObject<SpreadsheetInkInteractionMode | null>;
  inkPaneOrigin: (stageRect: { left: number; top: number; width: number; height: number; }, clientX: number, clientY: number) => { left: number; top: number; };
  inkPresetRef: RefObject<DocumentInkPreset>;
  /** Ink to Math / Ink to Text: a stroke that landed as ink (not as a fitted shape) joins the writing being read. */
  inkStrokeLandedRef: RefObject<(objectId: string, fitted: boolean) => void>;
  /** A pen tap at a client point: true when it opened the corrections of text Ink to Text made (no dot then). */
  inkCorrectionTapRef: RefObject<(clientX: number, clientY: number) => boolean>;
  inkToShapeRef: RefObject<boolean>;
  liveActiveSheetIndexRef: RefObject<number>;
  liveSheetsRef: RefObject<SheetModel[]>;
  /** The sheet's whole stage, in content pixels. */
  gridStageSize: { readonly totalWidth: number; readonly totalHeight: number };
  replaceActiveSheet: (nextSheet: SheetModel, nextTitle?: string, calculationMutation?: "content" | "coordinate", sheetViewMutation?: SheetViewMappedCellMutation | SheetViewMappedDrawingMutation | SheetViewMappedLineMutation | SheetViewMappedPageMutation, followOnOtherSheets?: (candidate: SheetModel) => SheetModel) => SheetModel[];
  ribbonTab: SpreadsheetRibbonTabId;
  selectedInkIdsRef: RefObject<ReadonlySet<string>>;
  setInkGesturePreview: Dispatch<SetStateAction<readonly SpreadsheetInkPoint[] | null>>;
  setInkMovePreview: Dispatch<SetStateAction<{ dx: number; dy: number; } | null>>;
  setInkPreviewShift: Dispatch<SetStateAction<{ x: number; y: number; }>>;
  sheet: SheetModel;
  sheetInkObjects: (SpreadsheetObject & { type: "shape"; shape: SpreadsheetShapeStyle & { kind: "ink"; inkPoints: string; inkTool: SpreadsheetInkTool; inkOpacity: number; }; anchor: SpreadsheetObjectAnchor & { kind: "absolute"; }; })[];
  sheetObjects: SpreadsheetObject[];
  sheetProtectionAllowsRef: RefObject<(candidate: SheetModel | null | undefined, permission: SheetProtectionPermission) => boolean>;
  writeSelectedInkIds: (ids: ReadonlySet<string>) => void;
  /**
   * Lasso Select's loop, kept relative to the frame around the strokes it
   * took (OfficeInkLassoSelection draws both), or null when it took none.
   */
  writeInkLasso: (lasso: SpreadsheetInkLasso | null) => void;
}

/** What Lasso Select left on a sheet: the strokes it took and its loop. */
export interface SpreadsheetInkLasso {
  readonly sheetId: string;
  readonly ids: ReadonlySet<string>;
  readonly loop: InkLassoAnchoredLoop | null;
}

/** The frame around ink objects, in sheet pixels (their anchors' boxes). */
/**
 * The sheet's objects with the selected strokes moved by (dx, dy) content
 * pixels, kept inside the sheet's [0, max] extent; null when none moves.
 * The lasso's frame and a stroke dragged by its own body move them alike.
 */
export function spreadsheetInkObjectsMoved<T extends SpreadsheetObject>(
  objects: readonly T[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
  maxX = Number.POSITIVE_INFINITY,
  maxY = Number.POSITIVE_INFINITY,
): T[] | null {
  let changed = false;
  const moved = objects.map((object) => {
    if (!ids.has(object.id) || !isSpreadsheetLassoObject(object)) return object;
    const width = Number(object.anchor.widthEmu) / EMU_PER_CSS_PIXEL;
    const height = Number(object.anchor.heightEmu) / EMU_PER_CSS_PIXEL;
    const currentX = Number(object.anchor.xEmu) / EMU_PER_CSS_PIXEL;
    const currentY = Number(object.anchor.yEmu) / EMU_PER_CSS_PIXEL;
    const nextX = Math.max(0, Math.min(maxX - width, currentX + dx));
    const nextY = Math.max(0, Math.min(maxY - height, currentY + dy));
    if (nextX === currentX && nextY === currentY) return object;
    changed = true;
    return {
      ...object,
      anchor: {
        ...object.anchor,
        xEmu: Math.max(0, Math.round(nextX * EMU_PER_CSS_PIXEL)),
        yEmu: Math.max(0, Math.round(nextY * EMU_PER_CSS_PIXEL)),
      },
    };
  });
  return changed ? moved : null;
}

export function spreadsheetInkLassoBox(
  objects: readonly SpreadsheetObject[],
  ids: ReadonlySet<string>,
): InkLassoBox | null {
  return inkLassoUnionBox(
    objects.flatMap((object) => {
      if (!ids.has(object.id) || !isSpreadsheetLassoObject(object)) return [];
      return [
        {
          left: Number(object.anchor.xEmu) / EMU_PER_CSS_PIXEL,
          top: Number(object.anchor.yEmu) / EMU_PER_CSS_PIXEL,
          width: Number(object.anchor.widthEmu) / EMU_PER_CSS_PIXEL,
          height: Number(object.anchor.heightEmu) / EMU_PER_CSS_PIXEL,
        },
      ];
    }),
  );
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetBeginInkGesture({
  inkEraserRef,
  inkGestureCleanupRef,
  inkGestureRef,
  inkLiveRef,
  inkRulerRef,
  inkWetRef,
  inkLivePublishRef,
  replaceSheetById,
  inkInteractionModeRef,
  inkPaneOrigin,
  inkPresetRef,
  inkStrokeLandedRef,
  inkCorrectionTapRef,
  inkToShapeRef,
  liveActiveSheetIndexRef,
  liveSheetsRef,
  gridStageSize,
  replaceActiveSheet,
  ribbonTab,
  selectedInkIdsRef,
  setInkGesturePreview,
  setInkMovePreview,
  setInkPreviewShift,
  sheet,
  sheetInkObjects,
  sheetObjects,
  sheetProtectionAllowsRef,
  writeSelectedInkIds,
  writeInkLasso,
}: SpreadsheetBeginInkGestureInputs) {
  // Pen Gestures ▸ Circle to Lasso: a pen circle around ink waits wet for
  // its Select chip (OfficeInkCircleSelect, in sheet pixels); tapped, the
  // circle goes and the ink inside is the lasso's selection, else it lands.
  const inkCircleOfferRef = useRef<{
    readonly stroke: SpreadsheetWetStroke;
    readonly sheetId: string;
    readonly loop: readonly SpreadsheetInkPoint[];
    readonly timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [inkCircleOffer, setInkCircleOffer] = useState<(OfficeInkCircleOffer & { readonly sheetId: string }) | null>(null);
  const endInkCircleOffer = useCallback((land: boolean) => {
    const offer = inkCircleOfferRef.current;
    if (!offer) return null;
    clearTimeout(offer.timer);
    inkCircleOfferRef.current = null;
    setInkCircleOffer(null);
    if (land) inkWetRef.current?.resume();
    return offer;
  }, [inkWetRef]);
  const takeInkCircleOffer = useCallback(() => {
    const offer = endInkCircleOffer(false);
    // Already landed (the sheet took the batch): it is ink now.
    if (!offer || !inkWetRef.current?.remove((stroke) => stroke === offer.stroke)) return;
    // The writing just before the circle lands first, and is selected once
    // the sheet holds it.
    inkWetRef.current.flush();
    requestAnimationFrame(() => {
      const liveSheet = liveSheetsRef.current[liveActiveSheetIndexRef.current];
      if (!liveSheet || liveSheet.id !== offer.sheetId) return;
      const objects = liveSheet.objects || [];
      const taken = inkPathIdsInLasso(spreadsheetInkPaths(objects), offer.loop);
      writeSelectedInkIds(taken);
      const frame = taken.size > 0 ? spreadsheetInkLassoBox(objects, taken) : null;
      writeInkLasso(frame ? { sheetId: offer.sheetId, ids: taken, loop: anchorInkLassoLoop(offer.loop, frame) } : null);
    });
  }, [endInkCircleOffer, inkWetRef, liveActiveSheetIndexRef, liveSheetsRef, writeInkLasso, writeSelectedInkIds]);
  /**
   * Draw-tab gesture authority over the worksheet stage. Draw and whole-stroke
   * Eraser each enter history once on pointerup; Lasso is session-only until a
   * move/recolour/delete commits one worksheet transaction.
   */
  const beginSpreadsheetInkGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      // The lasso's command card is portalled out of the surface yet reaches
      // here through React's tree: a press on it (between its commands) is
      // the card's, never a new loop drawn from it.
      if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
      // A grip of the lasso's frame scales the strokes it took (its own
      // gesture); the frame's inside moves them, below.
      if (isInkLassoOverlayTarget(event.target) && (event.target as Element).closest("button")) return;
      // The pen down again past a circle's chip: the circle was ink.
      endInkCircleOffer(true);
      // Draw with Touch off, or a pen about: the pen alone inks and a finger
      // pans the sheet (lib/draw-with-touch). The surface is mounted only
      // while a Draw tool is picked.
      if (!inkAcceptsPointer(event, true)) return;
      // A palm, a second finger, a pen over the palm's finger: the shared
      // policy decides (lib/ink-pointer-policy).
      const verdict = inkPointerArbiter.verdict(event.nativeEvent);
      if (verdict === "ignore") return;
      if (verdict === "pinch") {
        inkGestureCleanupRef.current?.();
        return;
      }
      if (verdict === "replace") inkGestureCleanupRef.current?.();
      const mode = inkInteractionModeRef.current;
      const stage = event.currentTarget.parentElement;
      // The eraser and the lasso measure the sheet's strokes: the wet ones
      // land first, and the gesture reads the objects as they then are.
      if (mode && mode !== "draw") inkWetRef.current?.flush();
      const liveNow = liveSheetsRef.current[liveActiveSheetIndexRef.current];
      const currentObjects =
        mode !== "draw" && liveNow && liveNow.id === sheet.id ? liveNow.objects ?? [] : sheetObjects;
      {
        return;
      }
      event.preventDefault();
      const target = event.currentTarget;
      const down = event.nativeEvent;
      target.focus({ preventScroll: true });
      inkPointerArbiter.begin(down);
      yieldTouchHold(event.pointerId);
      // The rest of the setup reads layout and builds the live canvas: on
      // iPadOS WebKit it waits for the press's own task to answer the touch
      // (lib/ink-press-deferral); the moves meanwhile are replayed into it.
      const deferred = runInkPressSetup(event.pointerId, (downAt) => {
      // Where the pen went down: the press, or the first sample when the press came too late to say (lib/ink-press-deferral).
      const pressX = downAt?.clientX ?? event.clientX;
      const pressY = downAt?.clientY ?? event.clientY;
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0) {
        inkPointerArbiter.end();
        inkGestureCleanupRef.current = null;
        return null;
      }
      const contentPerScreenX = gridStageSize.totalWidth / stageRect.width;
      const contentPerScreenY = gridStageSize.totalHeight / stageRect.height;
      // The pane under the pen: a stroke over the frozen rows or columns is
      // measured from the scrollport, as those cells are, whatever the body
      // has scrolled to.
      const paneOrigin = inkPaneOrigin(stageRect, pressX, pressY);
      const pointAt = (clientX: number, clientY: number) => ({
        x: Math.max(
          SPREADSHEET_HEADER_WIDTH_PX,
          Math.min(
            gridStageSize.totalWidth,
            (clientX - paneOrigin.left) * contentPerScreenX,
          ),
        ),
        y: Math.max(
          SPREADSHEET_HEADER_HEIGHT_PX,
          Math.min(
            gridStageSize.totalHeight,
            (clientY - paneOrigin.top) * contentPerScreenY,
          ),
        ),
      });
      setInkPreviewShift({
        x: (paneOrigin.left - stageRect.left) * contentPerScreenX,
        y: (paneOrigin.top - stageRect.top) * contentPerScreenY,
      });
      const start = pointAt(pressX, pressY);
      const downClientX = pressX;
      const downClientY = pressY;
      const selectedAtStart = new Set(selectedInkIdsRef.current);
      const selectedPaths = spreadsheetInkPaths(currentObjects).filter((path) =>
        selectedAtStart.has(path.id),
      );
      // A press inside the lasso's frame (around every stroke it took) moves
      // them all, as on the strokes themselves; outside it draws a new loop.
      const lassoFrame = selectedAtStart.size > 0 ? spreadsheetInkLassoBox(currentObjects, selectedAtStart) : null;
      const beginsMove =
        mode === "lasso" &&
        selectedAtStart.size > 0 &&
        ((lassoFrame !== null &&
          start.x >= lassoFrame.left &&
          start.x <= lassoFrame.left + lassoFrame.width &&
          start.y >= lassoFrame.top &&
          start.y <= lassoFrame.top + lassoFrame.height) ||
          inkPathIdsHitByEraser(selectedPaths, [start], 7).size > 0);
      const gesture: SpreadsheetInkGesture = {
        mode: beginsMove ? "move" : mode,
        pointerId: event.pointerId,
        sheetId: sheet.id,
        points: [start],
        stageLeft: paneOrigin.left,
        stageTop: paneOrigin.top,
        contentPerScreenX,
        contentPerScreenY,
        maxX: gridStageSize.totalWidth,
        maxY: gridStageSize.totalHeight,
        sourceObjects: currentObjects,
        selectedIds: selectedAtStart,
        times: [performance.now()],
        // A pencil laid on its side shades: the stroke is as wide as its
        // tilt at touch-down makes it (lib/office-ink-tilt).
        preset: mode === "draw" ? inkPresetForTilt(inkPresetRef.current, down, (MAX_SHAPE_STROKE_WIDTH * 3) / 4) : inkPresetRef.current,
        eraser: inkEraserRef.current,
      };
      inkGestureRef.current = gesture;
      // The pen's feel (type, tip, pressure sensitivity, stabilization)
      // shapes every sample; Pressure off draws one width.
      const dynamics = createInkPenDynamics(gesture.preset, spreadsheetInkWidthPx(gesture.preset.widthPt));
      dynamics.pressure(inkSamplePressure(down), start);
      // A pen or eraser stroke is drawn on the live canvas over the surface
      // as the pointer moves, with no render of the window per sample; the
      // lasso's polygon (and a move's offset) still go through state.
      const paneShift = {
        x: (paneOrigin.left - stageRect.left) * contentPerScreenX,
        y: (paneOrigin.top - stageRect.top) * contentPerScreenY,
      };
      // A canvas that cannot draw is not used: the state preview takes the stroke.
      const live =
        (gesture.mode === "draw" || gesture.mode === "eraser") && inkLiveRef.current?.usable
          ? inkLiveRef.current
          : null;
      const liveHost = live?.element.parentElement ?? null;
      const toLive = (point: SpreadsheetInkPoint & { p?: number }) => ({
        x: point.x - SPREADSHEET_HEADER_WIDTH_PX + paneShift.x,
        y: point.y - SPREADSHEET_HEADER_HEIGHT_PX + paneShift.y,
        ...(point.p !== undefined ? { p: point.p } : {}),
      });
      const fromLive = (point: { x: number; y: number }) => ({
        x: point.x + SPREADSHEET_HEADER_WIDTH_PX - paneShift.x,
        y: point.y + SPREADSHEET_HEADER_HEIGHT_PX - paneShift.y,
      });
      // A stroke starting along the ruler's edge runs along it.
      const rulerGuide = gesture.mode === "draw" ? inkRulerGuideFor(inkRulerRef.current, toLive(start)) : null;
      if (rulerGuide) Object.assign(start, fromLive(rulerGuide.place(toLive(start))));
      if (live && liveHost) {
        const zoom = contentPerScreenX > 0 ? 1 / contentPerScreenX : 1;
        live.begin(
          { left: 0, top: 0, width: liveHost.offsetWidth, height: liveHost.offsetHeight },
          gesture.mode === "draw"
            ? {
                color: gesture.preset.color,
                ...inkLiveEffectStyle(gesture.preset),
                widthPx: spreadsheetInkWidthPx(gesture.preset.widthPt),
                opacity: spreadsheetInkOpacityForTool(gesture.preset.tool),
                multiply: gesture.preset.tool === "highlighter",
                pressure: dynamics.varies,
                corner: inkCornerDegreesForTool(gesture.preset.tool),
                pencil: gesture.preset.tool === "pencil",
              }
            : {
                color: "#dc2626",
                widthPx: spreadsheetEraserReachPx(gesture.eraser, gesture.contentPerScreenX) * 2,
                opacity: 0.35,
                dash: gesture.eraser === "stroke" ? [4, 3] : undefined,
                trace: true,
              },
          zoom,
        );
        live.extend([toLive(start)]);
      } else if (!beginsMove) {
        setInkGesturePreview([start]);
      }
      // Press and hold the pen (lib/pen-first-draw): a stroke that rested
      // where it landed becomes the eraser from there, the Eraser's kind as
      // the tab has it; once the pen lifts it is the pen again.
      const hold =
        gesture.mode === "draw" && live && liveHost
          ? startInkHoldToErase(down, () => {
              if (inkGestureRef.current !== gesture || gesture.mode !== "draw") return;
              // The eraser measures the sheet's strokes: the wet ones land first.
              inkWetRef.current?.flush();
              const nowSheet = liveSheetsRef.current[liveActiveSheetIndexRef.current];
              if (!nowSheet || nowSheet.id !== gesture.sheetId) return;
              const objects = nowSheet.objects ?? [];
              if (!objects.some((object) => isSpreadsheetLassoObject(object))) return;
              const at = gesture.points[gesture.points.length - 1] ?? start;
              gesture.mode = "eraser";
              gesture.eraser = inkEraserRef.current;
              gesture.sourceObjects = objects;
              gesture.points = [{ x: at.x, y: at.y }];
              gesture.times = [performance.now()];
              live.clear();
              live.begin(
                { left: 0, top: 0, width: liveHost.offsetWidth, height: liveHost.offsetHeight },
                {
                  color: "#dc2626",
                  widthPx: spreadsheetEraserReachPx(gesture.eraser, gesture.contentPerScreenX) * 2,
                  opacity: 0.35,
                  dash: gesture.eraser === "stroke" ? [4, 3] : undefined,
                  trace: true,
                },
                contentPerScreenX > 0 ? 1 / contentPerScreenX : 1,
              );
              live.extend([toLive(at)]);
            })
          : null;

      const nextPoint = (clientX: number, clientY: number) => ({
        x: Math.max(
          SPREADSHEET_HEADER_WIDTH_PX,
          Math.min(
            gesture.maxX,
            (clientX - gesture.stageLeft) * gesture.contentPerScreenX,
          ),
        ),
        y: Math.max(
          SPREADSHEET_HEADER_HEIGHT_PX,
          Math.min(
            gesture.maxY,
            (clientY - gesture.stageTop) * gesture.contentPerScreenY,
          ),
        ),
      });
      /** The least distance between two samples; doubles each time the stroke is thinned. */
      const spacing = { spacing: 1 };
      // Draw and hold (lib/office-ink-hold-shape): the pen comes to rest at
      // the stroke's end and the stroke snaps to its clean shape (in grid
      // pixels, as Ink to Shape reads it); held on, the shape follows the pen.
      let rest: { at: SpreadsheetInkPoint; timer: InkHoldRestWait } | null = null;
      let held: InkHeldShape | null = null;
      const drawHeld = () => {
        if (!held) return;
        const outline = inkHoldShapeOutline(held.fit);
        if (live && liveHost) {
          live.clear();
          live.begin(
            { left: 0, top: 0, width: liveHost.offsetWidth, height: liveHost.offsetHeight },
            {
              color: gesture.preset.color,
              ...inkLiveEffectStyle(gesture.preset),
              widthPx: spreadsheetInkWidthPx(gesture.preset.widthPt),
              opacity: spreadsheetInkOpacityForTool(gesture.preset.tool),
              multiply: gesture.preset.tool === "highlighter",
              pressure: false,
              corner: inkCornerDegreesForTool(gesture.preset.tool),
              pencil: gesture.preset.tool === "pencil",
            },
            contentPerScreenX > 0 ? 1 / contentPerScreenX : 1,
          );
          live.extend(outline.map(toLive));
        } else {
          setInkGesturePreview(outline);
        }
      };
      const snapHeld = () => {
        rest = null;
        const liveGesture = inkGestureRef.current;
        if (!liveGesture || liveGesture.mode !== "draw" || held) return;
        const screenScale = contentPerScreenX > 0 ? 1 / contentPerScreenX : 1;
        if (inkPathLength(liveGesture.points) * screenScale < INK_HOLD_SHAPE_MIN_LENGTH_PX) return;
        const fit = inkHoldShapeFit(liveGesture.points);
        const anchor = liveGesture.points[liveGesture.points.length - 1];
        if (!fit || !anchor) return;
        held = inkHeldShape(fit, anchor);
        drawHeld();
      };
      const watchRest = (at: SpreadsheetInkPoint) => {
        if (held) return;
        const still = INK_HOLD_SHAPE_STILL_PX * (contentPerScreenX > 0 ? contentPerScreenX : 1);
        if (rest && Math.hypot(at.x - rest.at.x, at.y - rest.at.y) <= still) return;
        rest?.timer.cancel();
        // Draw and hold to snap is a pen gesture the reader can switch off.
        if (!inkPenGestures().holdShape) return;
        rest = { at, timer: waitForInkHoldRest(snapHeld) };
      };
      const handleMove = (moveEvent: PointerEvent) => {
        inkPointerArbiter.observe(moveEvent);
        const liveGesture = inkGestureRef.current;
        // Only the stroke's own pointer adds points: a palm's moves are not
        // the pen's.
        if (!liveGesture || moveEvent.pointerId !== liveGesture.pointerId) return;
        hold?.move(moveEvent);
        if (held) {
          // Snapped: the pen moves the shape, no more ink is drawn.
          inkHeldShapeFollow(held, nextPoint(moveEvent.clientX, moveEvent.clientY), INK_HOLD_SHAPE_STILL_PX * (contentPerScreenX > 0 ? contentPerScreenX : 1));
          drawHeld();
          return;
        }
        let point = liveGesture.points[liveGesture.points.length - 1];
        const added: (SpreadsheetInkPoint & { p?: number })[] = [];
        for (const sample of inkPointerSamples(moveEvent)) {
          const next: SpreadsheetInkPoint & { p?: number } = liveGesture.mode === "draw"
            ? dynamics.place(nextPoint(sample.clientX, sample.clientY))
            : nextPoint(sample.clientX, sample.clientY);
          if (rulerGuide && liveGesture.mode === "draw") Object.assign(next, fromLive(rulerGuide.place(toLive(next))));
          // The pen's feel shapes the pressure; Pressure off draws one width.
          const pressure = liveGesture.mode === "draw"
            ? dynamics.pressure(inkSamplePressure(sample), next)
            : liveGesture.preset.steady ? undefined : inkSamplePressure(sample);
          if (pressure !== undefined) next.p = pressure;
          const previous = liveGesture.points[liveGesture.points.length - 1];
          if (Math.hypot(next.x - previous.x, next.y - previous.y) < spacing.spacing) continue;
          // A stroke longer than one ink object holds is thinned (its times
          // with it) and goes on: it used to stop taking samples while the
          // pen was still down.
          if (liveGesture.points.length >= INK_CAPTURE_MAX_POINTS) {
            const budget = { spacing: spacing.spacing };
            thinInkSamples(liveGesture.points, INK_CAPTURE_MAX_POINTS, budget);
            thinInkSamples(liveGesture.times, INK_CAPTURE_MAX_POINTS, spacing);
          }
          liveGesture.points.push(next);
          liveGesture.times.push(performance.now());
          point = next;
          added.push(next);
        }
        if (liveGesture.mode === "draw" && !rulerGuide && added.length > 0) watchRest(point);
        if (liveGesture.mode === "draw" && added.length > 0) inkLivePublishRef?.current?.();
        if (live && liveHost) {
          const predicted = inkPredictedSamples(moveEvent).map((sample) =>
            toLive(nextPoint(sample.clientX, sample.clientY)),
          );
          if (added.length > 0 || predicted.length > 0) live.extend(added.map(toLive), predicted);
          return;
        }
        if (added.length === 0) return;
        if (liveGesture.mode === "move") {
          const origin = liveGesture.points[0];
          setInkMovePreview({ dx: point.x - origin.x, dy: point.y - origin.y });
        } else {
          setInkGesturePreview([...liveGesture.points]);
        }
      };
      let detach: () => void = () => {};
      const commitGesture = () => {
        const finished = inkGestureRef.current;
        const liveSheet =
          liveSheetsRef.current[liveActiveSheetIndexRef.current] ?? null;
        if (!finished || !liveSheet || liveSheet.id !== finished.sheetId) {
          return;
        }
        const liveObjects = liveSheet.objects || [];
        const sourceStillCurrent =
          liveSheet.objects === finished.sourceObjects ||
          (!liveSheet.objects && finished.sourceObjects.length === 0);
        // A new stroke is an append: it needs no unchanged source, only the
        // sheet still open to objects (the erasers and the lasso change what
        // they measured, so they do).
        if (!sheetProtectionAllowsRef.current(liveSheet, "editObjects")) return;
        if (finished.mode !== "draw" && !sourceStillCurrent) return;

        if (finished.mode === "draw") {
          // Scribbled to and fro over ink: the ink under it is erased, wet
          // or landed, and the scribble is not kept (lib/office-ink-scratch-out).
          if (
            !held &&
            inkToolScratchesOut(finished.preset.tool) &&
            inkScratchOutEnabled() &&
            isInkScratchOut(finished.points)
          ) {
            const reach =
              spreadsheetInkWidthPx(finished.preset.widthPt) / 2 +
              3 * (finished.contentPerScreenX > 0 ? finished.contentPerScreenX : 1);
            const scratchable = liveObjects.filter((object) => inkScratchOutTakes(
              isSpreadsheetInkObject(object) ? { tool: object.shape.inkTool } : { shape: true },
            ));
            const covered = inkPathIdsUnderScratchOut(spreadsheetInkPaths(scratchable), finished.points, reach);
            const wetGone =
              inkWetRef.current?.remove(
                (stroke) =>
                  stroke.sheetId === finished.sheetId &&
                  inkScratchOutTakes({ tool: stroke.preset.tool, shape: (stroke as { held?: boolean }).held === true }) &&
                  inkPathIdsUnderScratchOut([{ id: "wet", points: stroke.points }], finished.points, reach).size > 0,
              ) ?? 0;
            if (covered.size > 0) {
              replaceActiveSheet({
                ...liveSheet,
                objects: liveObjects.filter((object) => !covered.has(object.id)),
              });
              writeSelectedInkIds(new Set());
            }
            if (covered.size > 0 || wetGone > 0) return;
          }
          if (liveObjects.length >= MAX_SHEET_OBJECTS) return;
          // The stroke stays wet on the surface and lands with the next
          // pause of the hand (landSpreadsheetWetInk).
          // As it stood just before the lift: the pen's slide off the glass is not the shape's.
          const heldOutline = held ? inkHoldShapeOutline(inkHeldShapeAtLift(held)) : null;
          const wetStroke: SpreadsheetWetStroke = {
            sheetId: finished.sheetId,
            // Drawn and held: the clean shape lands, as a shape, at the pen's width.
            points: heldOutline ?? finished.points,
            times: heldOutline ? heldOutline.map(() => performance.now()) : finished.times,
            // A steady pressure is drawn at its width, as the running stroke
            // was (it landed at the stated width and thinned).
            preset:
              heldOutline || finished.preset.tool === "highlighter"
                ? finished.preset
                : {
                    ...finished.preset,
                    widthPt:
                      Math.round(
                        finished.preset.widthPt * inkSteadyPressureWidthFactor(finished.points.map((point) => point.p)) * 100,
                      ) / 100,
                  },
            paneShift,
            toShape: heldOutline ? true : inkToShapeRef.current,
            ...(heldOutline ? { held: true } : {}),
          };
          // Circled ink with the pen: the circle waits for its Select chip.
          const circles =
            !heldOutline &&
            finished.preset.tool === "pen" &&
            inkPenGestures().circleLasso &&
            isInkCircleGesture(finished.points, 24 * (finished.contentPerScreenX > 0 ? finished.contentPerScreenX : 1)) &&
            (inkPathIdsInLasso(spreadsheetInkPaths(liveObjects), finished.points).size > 0 ||
              (inkWetRef.current?.pending ?? []).some(
                (stroke) =>
                  stroke.sheetId === finished.sheetId &&
                  inkPathIdsInLasso([{ id: "wet", points: stroke.points }], finished.points).size > 0,
              ));
          inkWetRef.current?.add(wetStroke, circles ? { waits: true } : undefined);
          if (circles) {
            endInkCircleOffer(false);
            inkCircleOfferRef.current = {
              stroke: wetStroke,
              sheetId: finished.sheetId,
              loop: finished.points,
              timer: setTimeout(() => endInkCircleOffer(true), INK_CIRCLE_OFFER_MS),
            };
            const perScreen = finished.contentPerScreenX > 0 ? finished.contentPerScreenX : 1;
            setInkCircleOffer({ ...inkCircleOfferAt(finished.points, 48 * perScreen, 8 * perScreen), sheetId: finished.sheetId });
          }
          return;
        }

        if (finished.mode === "eraser" && finished.eraser !== "stroke") {
          // The Small and Medium Erasers rub out the ink under the pointer:
          // what is left of a stroke becomes one stroke per unbroken run, in
          // the stroke's own pen, all in one history step. Only strokes the
          // gesture saw unchanged are touched.
          const sourceById = new Map(
            finished.sourceObjects.map((object) => [object.id, object]),
          );
          const nextObjects = eraseSpreadsheetInkUnder(
            liveObjects,
            finished.points,
            spreadsheetEraserReachPx(finished.eraser, finished.contentPerScreenX),
            (object) => {
              const before = sourceById.get(object.id);
              return Boolean(
                before &&
                  isSpreadsheetInkObject(object) &&
                  spreadsheetInkObjectSignature(before) ===
                    spreadsheetInkObjectSignature(object),
              );
            },
          );
          // A drawn shape is one outline, not ink to cut: the eraser that
          // touches it takes all of it, as the Stroke Eraser does.
          const shapeHits = inkPathIdsHitByEraser(
            spreadsheetInkPaths(finished.sourceObjects.filter((object) => isSpreadsheetDrawnShapeObject(object))),
            finished.points,
            spreadsheetEraserReachPx(finished.eraser, finished.contentPerScreenX),
          );
          const shapesTaken = new Set(
            [...shapeHits].filter((id) => {
              const before = sourceById.get(id);
              const now = liveObjects.find((object) => object.id === id);
              return Boolean(
                before && now && isSpreadsheetDrawnShapeObject(now) &&
                  spreadsheetInkObjectSignature(before) === spreadsheetInkObjectSignature(now),
              );
            }),
          );
          const remaining = (nextObjects ?? (shapesTaken.size > 0 ? liveObjects : null))?.filter(
            (object) => !shapesTaken.has(object.id),
          );
          if (!remaining || remaining.length > MAX_SHEET_OBJECTS) return;
          replaceActiveSheet({
            ...liveSheet,
            objects: remaining as unknown as SpreadsheetObject[],
          });
          writeSelectedInkIds(new Set());
          return;
        }

        if (finished.mode === "eraser") {
          const hitIds = inkPathIdsHitByEraser(
            spreadsheetInkPaths(finished.sourceObjects),
            finished.points,
            spreadsheetEraserReachPx("stroke", finished.contentPerScreenX),
          );
          if (hitIds.size === 0) return;
          const liveById = new Map(
            liveObjects.map((object) => [object.id, object]),
          );
          const authorized = [...hitIds].every((id) => {
            const before = finished.sourceObjects.find(
              (object) => object.id === id,
            );
            const now = liveById.get(id);
            return (
              before &&
              now &&
              isSpreadsheetLassoObject(now) &&
              spreadsheetInkObjectSignature(before) ===
                spreadsheetInkObjectSignature(now)
            );
          });
          if (!authorized) return;
          replaceActiveSheet({
            ...liveSheet,
            objects: liveObjects.filter((object) => !hitIds.has(object.id)),
          });
          writeSelectedInkIds(new Set());
          return;
        }

        if (finished.mode === "lasso") {
          const taken = inkPathIdsInLasso(
            spreadsheetInkPaths(finished.sourceObjects),
            finished.points,
          );
          writeSelectedInkIds(taken);
          // The strokes wear one frame; the loop stays drawn around them,
          // closed, kept relative to that frame so it follows them.
          const frame = taken.size > 0 ? spreadsheetInkLassoBox(finished.sourceObjects, taken) : null;
          writeInkLasso(
            frame
              ? { sheetId: finished.sheetId, ids: taken, loop: anchorInkLassoLoop(finished.points, frame) }
              : null,
          );
          return;
        }

        const finalPoint = finished.points[finished.points.length - 1];
        const origin = finished.points[0];
        const dx = finalPoint.x - origin.x;
        const dy = finalPoint.y - origin.y;
        if (Math.hypot(dx, dy) < 1 || finished.selectedIds.size === 0) return;
        const moved = spreadsheetInkObjectsMoved(liveObjects, finished.selectedIds, dx, dy, finished.maxX, finished.maxY);
        if (moved) replaceActiveSheet({ ...liveSheet, objects: moved });
      };
      const handleUp = (upEvent: PointerEvent) => {
        // A palm lifting is not the pen lifting.
        if (upEvent.pointerId !== gesture.pointerId) return;
        // A tap on text Ink to Text made opens its corrections instead of
        // leaving a dot (a dot written anywhere else stays a dot).
        const finished = inkGestureRef.current;
        if (upEvent.type === "pointerup" && finished?.mode === "draw" && finished.points.length > 0) {
          const onScreen = finished.points.map((point) => ({
            x: point.x / contentPerScreenX,
            y: point.y / contentPerScreenY,
          }));
          if (isOfficeInkTap(onScreen) && inkCorrectionTapRef.current(downClientX, downClientY)) {
            detach();
            return;
          }
        }
        commitGesture();
        detach();
      };
      // The browser taking the pointer ends the stroke as a lift would:
      // what was drawn stays.
      const handleCancel = handleUp;
      detach = () => {
        hold?.cancel();
        rest?.timer.cancel();
        rest = null;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
        inkGestureRef.current = null;
        inkPointerArbiter.end();
        inkGestureCleanupRef.current = null;
        inkLivePublishRef?.current?.();
        // The object that took the stroke renders in the same task (React
        // flushes before the next paint), so no frame shows neither.
        live?.clear();
        setInkGesturePreview(null);
        setInkMovePreview(null);
      };
      inkGestureCleanupRef.current = detach;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
      return { move: handleMove, up: handleUp, cancel: handleCancel };
      }, undefined, { clientX: event.clientX, clientY: event.clientY });
      if (deferred) {
        // Until the setup runs, a palm or a pinch that replaces the press
        // cancels it instead of a stroke.
        inkGestureCleanupRef.current = () => {
          deferred.cancel();
          inkPointerArbiter.end();
          inkGestureCleanupRef.current = null;
        };
      }
    },
    [
      endInkCircleOffer,
      gridStageSize.totalHeight,
      gridStageSize.totalWidth,
      replaceActiveSheet,
      ribbonTab,
      sheet,
      sheetInkObjects.length,
      sheetObjects,
      writeInkLasso,
      writeSelectedInkIds,
    ],
  );
  /**
   * The wet strokes land: each becomes an ink object (or, with Ink to Shape
   * on, the shape it plainly is) on the sheet it was drawn on, all of one
   * sheet in one commit and one Undo step. A sheet the user has since left
   * takes its strokes by id.
   */
  const landSpreadsheetWetInk = useCallback(
    (strokes: readonly SpreadsheetWetStroke[]) => {
      const bySheet = new Map<string, SpreadsheetWetStroke[]>();
      for (const wet of strokes) {
        const group = bySheet.get(wet.sheetId);
        if (group) group.push(wet);
        else bySheet.set(wet.sheetId, [wet]);
      }
      for (const [sheetId, group] of bySheet) {
        const liveSheets = liveSheetsRef.current;
        const liveSheet = liveSheets.find((candidate) => candidate.id === sheetId);
        if (!liveSheet || !sheetProtectionAllowsRef.current(liveSheet, "editObjects")) continue;
        const liveObjects = liveSheet.objects || [];
        const landed: { object: SpreadsheetObject; fitted: boolean }[] = [];
        for (const wet of group) {
          if (liveObjects.length + landed.length >= MAX_SHEET_OBJECTS) break;
          // XLS-A032: with Ink to Shape on, a stroke that plainly is a shape
          // lands as that shape; anything else stays ink.
          const fitted = wet.toShape ? spreadsheetInkToShapeObject(wet.points, wet.preset, { held: wet.held }) : null;
          // The samples one ink object holds, every tip and turn kept
          // (inkLandedSampleIndexes; cutting at the limit dropped a long
          // stroke's end); its times with them.
          const kept = fitted ? [] : inkLandedSampleIndexes(wet.points, 0.2, MAX_SPREADSHEET_INK_POINTS);
          const inkObject =
            fitted ??
            createSpreadsheetInkShapeObject({
              points: kept.map((index) => wet.points[index]!),
              tool: wet.preset.tool,
              color: wet.preset.color,
              width: spreadsheetInkWidthPx(wet.preset.widthPt),
              effect: wet.preset.effect,
              times: wet.times ? kept.map((index) => wet.times![index]!) : wet.times,
            });
          if (inkObject) landed.push({ object: inkObject as unknown as SpreadsheetObject, fitted: fitted !== null });
        }
        if (landed.length === 0) continue;
        const nextSheet = { ...liveSheet, objects: [...liveObjects, ...landed.map((entry) => entry.object)] };
        if (liveSheet === liveSheets[liveActiveSheetIndexRef.current]) replaceActiveSheet(nextSheet);
        else replaceSheetById(sheetId, nextSheet);
        // Ink to Math / Ink to Text: the strokes join the writing being read.
        for (const entry of landed) {
          if (!entry.fitted) inkStrokeLandedRef.current(entry.object.id, false);
        }
      }
    },
    [replaceActiveSheet, replaceSheetById],
  );
  return {
    beginSpreadsheetInkGesture,
    landSpreadsheetWetInk,
    inkCircleOffer,
    takeInkCircleOffer,
  };
}

/** A finished stroke the worksheet has not taken yet (lib/office-wet-ink). */
export interface SpreadsheetWetStroke {
  readonly sheetId: string;
  /** Grid pixels (header offsets included), in drawing order. */
  readonly points: readonly SpreadsheetInkPoint[];
  readonly times: readonly number[];
  readonly preset: DocumentInkPreset;
  /** The frozen pane's offset the stroke is drawn with (`inkPreviewShift`). */
  readonly paneShift: { readonly x: number; readonly y: number };
  readonly toShape: boolean;
  /** Drawn and held: `points` are the clean shape it snapped to, landing as that shape. */
  readonly held?: boolean;
}

/**
 * One wet stroke as the draw surface shows it (lib/office-wet-ink-layer):
 * painted once, when the pen lifts, in the grid's pixels past the headers.
 */
let spreadsheetWetEffectSerial = 0;

export function paintSpreadsheetWetStroke(stroke: SpreadsheetWetStroke, ownerDocument: Document): Element {
  const group = wetInkSvgElement(ownerDocument, "g", {
    transform:
      stroke.paneShift.x || stroke.paneShift.y ? `translate(${stroke.paneShift.x} ${stroke.paneShift.y})` : null,
  });
  const corner = inkCornerDegreesForTool(stroke.preset.tool);
  if (stroke.preset.tool === "pen" && stroke.preset.effect && isInkEffect(stroke.preset.effect)) {
    // A pen's effect: its layers, as the landed stroke paints them
    // (lib/office-ink-effects).
    spreadsheetWetEffectSerial += 1;
    const defs = wetInkSvgElement(ownerDocument, "defs", {});
    group.append(defs);
    const points = stroke.points.map((point) => ({
      x: point.x - SPREADSHEET_HEADER_WIDTH_PX,
      y: point.y - SPREADSHEET_HEADER_HEIGHT_PX,
      ...(point.p !== undefined ? { p: point.p } : {}),
    }));
    const plan = inkEffectSvgPlan(
      inkEffectPaint(stroke.preset.effect),
      {
        points,
        widthPx: spreadsheetInkWidthPx(stroke.preset.widthPt),
        // Pressure off leaves no pressures; a pen type's own (a fountain
        // nib's) are drawn.
        pressured: inkPressuresVary(points.map((point) => point.p)),
        corner,
      },
      `spreadsheet-wet-ink-effect-${spreadsheetWetEffectSerial}`,
    );
    appendInkEffectSvg(ownerDocument, group, defs, plan, {}, { "data-testid": "spreadsheet-draw-wet-stroke" });
    return group;
  }
  if (stroke.preset.tool !== "highlighter" && inkPressuresVary(stroke.points.map((point) => point.p))) {
    group.append(
      wetInkSvgElement(ownerDocument, "path", {
        "data-testid": "spreadsheet-draw-wet-stroke",
        "data-ink-pressure": "true",
        d: inkVariableWidthOutlinePathData(
          stroke.points.map((point) => ({
            x: point.x - SPREADSHEET_HEADER_WIDTH_PX,
            y: point.y - SPREADSHEET_HEADER_HEIGHT_PX,
            p: point.p,
          })),
          spreadsheetInkWidthPx(stroke.preset.widthPt),
          { corner },
        ),
        fill: stroke.preset.color,
        "fill-opacity": spreadsheetInkOpacityForTool(stroke.preset.tool),
        stroke: "none",
      }),
    );
    return group;
  }
  const path = wetInkSvgElement(ownerDocument, "path", {
    "data-testid": "spreadsheet-draw-wet-stroke",
    d: inkStrokePathData(
      stroke.points.map((point) => ({
        x: point.x - SPREADSHEET_HEADER_WIDTH_PX,
        y: point.y - SPREADSHEET_HEADER_HEIGHT_PX,
      })),
      { corner },
    ),
    fill: "none",
    stroke: stroke.preset.color,
    "stroke-width": spreadsheetInkWidthPx(stroke.preset.widthPt),
    "stroke-opacity": spreadsheetInkOpacityForTool(stroke.preset.tool),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "vector-effect": "non-scaling-stroke",
  });
  if (stroke.preset.tool === "highlighter") path.style.mixBlendMode = "multiply";
  group.append(path);
  return group;
}
