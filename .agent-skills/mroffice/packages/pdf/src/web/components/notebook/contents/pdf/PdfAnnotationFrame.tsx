"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Selection frame for a placed PDF annotation (shape / signature / redaction
 * box): the Office drawing selection chrome every MRAI editor shares
 * (OfficeDrawingSelection: 1px frame, eight white grips, round rotate grip)
 * over a move surface, plus a delete affordance. Rendered by the viewer
 * inside a page wrapper (percent positioning) on top of the selected
 * annotation; the drag math is the pure percent-space transform in
 * lib/pdf/annotation-transform.ts and the pointer plumbing is the shared
 * usePdfBoxDrag hook.
 *
 * The frame previews the gesture as a live outline; `onCommit` fires once on
 * pointer-up (and only when the geometry actually changed) so the caller can
 * PATCH the annotation's persisted percent geometry.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RotateCw } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";

import {
  ANNOTATION_MIN_SIZE,
  annotationBoxesEqual,
  moveAnnotationBoxPartlyOffPage,
  resizeAnnotationBoxAcross,
  resizeAnnotationBoxPartlyOffPage,
  transformAnnotationBox,
  type MirrorablePercentBox,
  type PercentBox,
} from "../../../../lib/pdf/annotation-transform";
import { RESIZE_HANDLES } from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";
import {
  angleFromPointer,
  normalizeRotationDegrees,
} from "@mrnote/core/web/lib/presentation-drag.ts";

import { isCompatMouseFromTouch } from "@mrnote/core/web/lib/pointer-capability.ts";

import { PDF_BOX_DRAG_CLICK_SLOP_PX, usePdfBoxDrag, type PdfBoxDragMode } from "./usePdfBoxDrag";

export interface PdfAnnotationFrameProps {
  /** Committed geometry of the selected annotation (page percent). */
  rect: PercentBox;
  /** Logical PDF viewport size before any notebook-canvas transform. */
  pageWidth: number;
  pageHeight: number;
  /** Minimum size (percent) a resize may reach; defaults suit every family. */
  minWidth?: number;
  minHeight?: number;
  /** False renders a move-only frame (no resize handles). */
  resizable?: boolean;
  /**
   * A straight line lying along this axis, framed as WPS frames one: the
   * frame hugs the line's thickness, a round dot at each end resizes it
   * along its length, a capsule at its middle takes its thickness (one
   * capsule growing the side it is dragged toward while the line is thin,
   * then one on each side), and there is no corner grip, which would slant
   * it. A thickness drag never mirrors.
   */
  lineAxis?: "horizontal" | "vertical";
  /**
   * The object may reach past the page, as WPS lets a shape: a move or a
   * resize is stopped only where less than this much of it (page percent,
   * per axis; all of it when it is smaller) would still be on the page.
   * Without it the box stays on the page. What lies outside is cut by the
   * page, frame and grips included.
   */
  pageKeep?: Readonly<{ x: number; y: number }>;
  /** Disables interactions while the annotation is saving / deleting. */
  busy?: boolean;
  /**
   * A handle may be pulled across the opposite edge, as in WPS: the box then
   * lies on the other side and the preview and commit carry `mirrorX` /
   * `mirrorY` (MirrorablePercentBox) for the object to come out mirrored.
   */
  mirrorable?: boolean;
  /**
   * The frame stands at `rect` (shown, or its committed geometry changed):
   * what a drag of it will need can be made ready before the drag starts.
   * Not fired by a gesture's own preview.
   */
  onShown?: (rect: PercentBox) => void;
  /** Fired once per gesture with the new geometry (only when it changed). */
  onCommit: (rect: PercentBox) => void;
  /** Fired by Delete / Backspace on the focused frame. */
  onDelete: () => void;
  


  deleteLabel?: string;
  /** False keeps deletion in the consumer's own dialog (form controls). */
  showDelete?: boolean;
  




  autoFocus?: boolean;
  /** Distinguish contextual consumers while preserving the annotation default. */
  testId?: string;
  /** Clockwise object rotation around the box centre. */
  rotation?: number;
  /** Enables the Office-style rotation handle when supplied. */
  onRotate?: (rotation: number) => void;
  /**
   * Live geometry while a pointer drag is in flight, with the geometry it
   * started from; null once the gesture ends (after `onCommit`, if any).
   */
  onPreview?: (
    preview: PercentBox | null,
    start: PercentBox,
    mode: PdfBoxDragMode | null,
  ) => void;
  /** A double-click on the frame (a text box comment: its text is edited). */
  onEditContent?: () => void;
  /**
   * Where the object is drawn when that is not where the frame's geometry
   * says (a gesture in flight or just let go, and the object's pixels not
   * ready to follow it: the page canvas still draws it where it was). The
   * frame stands with what is drawn, never apart from it, and moves on
   * together with it. Null or absent: the object is drawn where the frame
   * is.
   */
  contentRect?: PercentBox | null;
  /**
   * Live clockwise angle (degrees, normalised like `rotation`) while the
   * rotation handle is dragged, with the geometry the gesture turns about;
   * null once the gesture ends (after `onRotate`, if it committed).
   */
  onRotatePreview?: (rotation: number | null, start: PercentBox) => void;
  /**
   * The gesture math, in place of the page-axis move/resize: a turned
   * picture resizes along its own axes, and an object may be dragged partly
   * off the page. Called for drags and the arrow-key nudge alike.
   */
  transformBox?: (
    start: PercentBox,
    mode: PdfBoxDragMode,
    dx: number,
    dy: number,
  ) => PercentBox;
  /** `wps`: round corner dots and edge capsules on a thin red frame, as WPS
   * draws a selected object (wps/tabs/image-frame.png). */
  gripStyle?: "office" | "wps";
}

const HANDLE_PX = 10;
/** WPS's selection hairline and its grips' ring (wps/tabs/hline-frame.png),
 * as the shared drawing selection's WPS look paints them
 * (OfficeDrawingSelection.module.css, data-office-drawing-look="wps"). */
export const WPS_FRAME_COLOR = "#e65046";
const WPS_GRIP_BORDER = "#a8aeb8";
/** The shared grip paints its 8px square centred in the PDF's own 10px
 * target, so wearing the Office chrome leaves every hit area where it was. */
const GRIP_HIT_STYLE = {
  "--office-drawing-grip-size": `${HANDLE_PX}px`,
  "--office-drawing-grip-edge": `${-HANDLE_PX / 2}px`,
} as CSSProperties;
const KEYBOARD_NUDGE_PERCENT = 0.5;
const KEYBOARD_FAST_NUDGE_PERCENT = 2;
/** A line's thickness capsule: long side, short side (px). */
const LINE_CAPSULE_PX = [18, 8] as const;

/**
 * Where a WPS line grip sits and what it looks like: the two ends are round
 * dots on the line's ends; the thickness capsules lie along the line, the
 * lone one on its middle, a pair on its two long sides.
 */
function lineGripPlacement(
  handle: "n" | "s" | "e" | "w" | "thickness",
  horizontal: boolean,
): CSSProperties {
  const half = HANDLE_PX / 2;
  const [long, short] = LINE_CAPSULE_PX;
  const capsule: CSSProperties = horizontal
    ? { width: long, height: short, borderRadius: short / 2 }
    : { width: short, height: long, borderRadius: short / 2 };
  const dot: CSSProperties = { width: HANDLE_PX, height: HANDLE_PX, borderRadius: "50%" };
  const middleX = `calc(50% - ${(horizontal ? long : short) / 2}px)`;
  const middleY = `calc(50% - ${(horizontal ? short : long) / 2}px)`;
  // A thin line's one capsule stands just past the line, on its lower (or
  // right) edge: laid over the line's middle it took the press of a reader
  // dragging the line from there, and the move thickened the line into a
  
  if (handle === "thickness") {
    return horizontal
      ? { ...capsule, left: middleX, top: "calc(100% + 2px)" }
      : { ...capsule, top: middleY, left: "calc(100% + 2px)" };
  }
  if (horizontal) {
    if (handle === "w") return { ...dot, left: -half, top: `calc(50% - ${half}px)` };
    if (handle === "e") return { ...dot, right: -half, top: `calc(50% - ${half}px)` };
    return handle === "n"
      ? { ...capsule, left: middleX, top: -short / 2 }
      : { ...capsule, left: middleX, bottom: -short / 2 };
  }
  if (handle === "n") return { ...dot, top: -half, left: `calc(50% - ${half}px)` };
  if (handle === "s") return { ...dot, bottom: -half, left: `calc(50% - ${half}px)` };
  return handle === "w"
    ? { ...capsule, top: middleY, left: -short / 2 }
    : { ...capsule, top: middleY, right: -short / 2 };
}

export default function PdfAnnotationFrame({
  rect,
  pageWidth,
  pageHeight,
  minWidth = ANNOTATION_MIN_SIZE,
  minHeight = ANNOTATION_MIN_SIZE,
  resizable = true,
  lineAxis,
  pageKeep,
  busy = false,
  mirrorable = false,
  onShown,
  onCommit,
  onDelete,
  showDelete = true,
  autoFocus = false,
  testId = "pdf-annotation-frame",
  rotation = 0,
  onRotate,
  onPreview,
  onEditContent,
  contentRect = null,
  onRotatePreview,
  transformBox,
  gripStyle = "office",
}: PdfAnnotationFrameProps) {
  const t = useTranslations("console-notebooks");
  const frameRef = useRef<HTMLDivElement>(null);
  const rotationCleanupRef = useRef<(() => void) | null>(null);
  const [rotationPreview, setRotationPreview] = useState<number | null>(null);
  const onRotatePreviewRef = useRef(onRotatePreview);
  onRotatePreviewRef.current = onRotatePreview;
  const onShownRef = useRef(onShown);
  useLayoutEffect(() => {
    onShownRef.current = onShown;
  });
  useEffect(() => {
    onShownRef.current?.({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }, [rect.x, rect.y, rect.width, rect.height]);
  /** The box a rotation gesture turns about, set while one is in flight. */
  const rotationStartRef = useRef<PercentBox | null>(null);
  // A focused frame that goes (its object deleted, deselected, replaced while
  // it saves) leaves the keyboard in this window: focus fell to the page
  // body, where the window's own shortcuts (Cmd+Z, Escape) never arrive --
  
  
  const frameHadFocusRef = useRef(false);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    let host = frame?.parentElement ?? null;
    while (host && !host.hasAttribute("tabindex")) host = host.parentElement;
    const onFocus = () => { frameHadFocusRef.current = true; };
    const onBlur = (event: FocusEvent) => {
      if (!frame?.contains(event.relatedTarget as Node | null)) frameHadFocusRef.current = false;
    };
    frame?.addEventListener("focusin", onFocus);
    frame?.addEventListener("focusout", onBlur);
    return () => {
      frame?.removeEventListener("focusin", onFocus);
      frame?.removeEventListener("focusout", onBlur);
      const active = document.activeElement;
      const lost =
        frameHadFocusRef.current &&
        (!active || active === document.body || (frame?.contains(active) ?? false));
      if (lost && host?.isConnected) host.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (!autoFocus) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
    ) {
      return;
    }
    frameRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(
    () => () => {
      rotationCleanupRef.current?.();
      // A frame taken away mid-turn still ends its live preview.
      const start = rotationStartRef.current;
      rotationStartRef.current = null;
      if (start) onRotatePreviewRef.current?.(null, start);
    },
    [],
  );

  /** Set while a line's lone thickness capsule is dragged: it grows the side
   * the pointer goes toward, so its handle is picked from the drag. */
  const thicknessGripRef = useRef(false);
  // Where the frame was last pressed: a tap ends where it began, a move does not.
  const framePressRef = useRef<{ x: number; y: number } | null>(null);
  const keepX = pageKeep?.x;
  const keepY = pageKeep?.y;
  const apply = useCallback(
    (start: PercentBox, mode: PdfBoxDragMode, dx: number, dy: number): MirrorablePercentBox => {
      // A caller with its own geometry (a picture edited in place) owns
      // every gesture.
      if (transformBox) return transformBox(start, mode, dx, dy);
      const offPage = keepX !== undefined && keepY !== undefined;
      if (mode === "move") {
        return offPage
          ? moveAnnotationBoxPartlyOffPage(start, dx, dy, keepX, keepY)
          : transformAnnotationBox(start, mode, dx, dy, minWidth, minHeight);
      }
      // A line's thickness grips change its stroke, which has no mirror.
      const across = lineAxis === "horizontal" ? /[ns]/ : lineAxis === "vertical" ? /[ew]/ : null;
      if (across && across.test(mode)) {
        const handle = !thicknessGripRef.current
          ? mode
          : lineAxis === "horizontal"
            ? dy < 0 ? "n" : "s"
            : dx < 0 ? "w" : "e";
        return offPage
          ? resizeAnnotationBoxPartlyOffPage(start, handle, dx, dy, minWidth, minHeight, keepX, keepY, false)
          : transformAnnotationBox(start, handle, dx, dy, minWidth, minHeight);
      }
      if (offPage) {
        return resizeAnnotationBoxPartlyOffPage(
          start, mode, dx, dy, minWidth, minHeight, keepX, keepY, mirrorable,
        );
      }
      return mirrorable
        ? resizeAnnotationBoxAcross(start, mode, dx, dy, minWidth, minHeight)
        : transformAnnotationBox(start, mode, dx, dy, minWidth, minHeight);
    },
    [keepX, keepY, lineAxis, minWidth, minHeight, mirrorable, transformBox],
  );
  const commit = useCallback(
    (_key: string, next: MirrorablePercentBox) => {
      // A plain click (or a fully clamped-out drag) must not PATCH; a mirror
      // onto the same box is still a change.
      if (annotationBoxesEqual(next, rect) && !next.mirrorX && !next.mirrorY) return;
      onCommit(next);
    },
    [onCommit, rect],
  );
  const getRenderedPageSize = useCallback(() => {
    const page = frameRef.current?.closest<HTMLElement>(".pdf-viewer__page");
    if (!page) return null;
    const { width, height } = page.getBoundingClientRect();
    return { width, height };
  }, []);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const rectRef = useRef(rect);
  rectRef.current = rect;
  // Straight from the pointer events (see usePdfBoxDrag's onPreview), with
  // the box the gesture started from.
  const reportPreview = useCallback(
    (preview: PercentBox | null, mode: PdfBoxDragMode | null) =>
      onPreviewRef.current?.(preview, rectRef.current, mode),
    [],
  );
  const { dragKey, previewRect, beginDrag } = usePdfBoxDrag<MirrorablePercentBox>({
    pageWidth,
    pageHeight,
    unitsPerPage: 100,
    getRenderedPageSize,
    apply,
    onCommit: commit,
    onPreview: reportPreview,
  });
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!showDelete) return;
        event.preventDefault();
        // The viewer's own listener would delete a placed annotation again.
        event.stopPropagation();
        // Not gated on `busy`: a page shape's frame is busy while its page
        // reloads after a click, and a Delete pressed then was dropped
        
        // command until the page is ready.
        onDelete();
        return;
      }
      if (busy) return;
      const step = event.shiftKey
        ? KEYBOARD_FAST_NUDGE_PERCENT
        : KEYBOARD_NUDGE_PERCENT;
      const delta =
        event.key === "ArrowLeft"
          ? { x: -step, y: 0 }
          : event.key === "ArrowRight"
            ? { x: step, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: -step }
              : event.key === "ArrowDown"
                ? { x: 0, y: step }
                : null;
      if (!delta) return;
      event.preventDefault();
      const next = transformBox
        ? transformBox(rect, "move", delta.x, delta.y)
        : keepX !== undefined && keepY !== undefined
          ? moveAnnotationBoxPartlyOffPage(rect, delta.x, delta.y, keepX, keepY)
          : transformAnnotationBox(
              rect,
              "move",
              delta.x,
              delta.y,
              minWidth,
              minHeight,
            );
      if (!annotationBoxesEqual(next, rect)) {
        onCommit(next);
      }
    },
    [busy, keepX, keepY, minHeight, minWidth, onCommit, onDelete, rect, showDelete, transformBox],
  );

  // A frame with no depth on one axis (a straight line's bounding box) has
  // its handles for that axis lying on top of its body: a drag meant to
  // move the line took a handle, pulled the box across its own zero height
  // and mirrored it back and forth with every pixel, until the line landed
  
  // handles on its long axis; its body moves it, as a line's does in WPS.
  const thinY = (rect.height / 100) * pageHeight < 2 * HANDLE_PX;
  const thinX = (rect.width / 100) * pageWidth < 2 * HANDLE_PX;
  const shownHandles = RESIZE_HANDLES.filter(({ handle }) =>
    !(thinY && /[ns]/.test(handle)) && !(thinX && /[ew]/.test(handle)),
  );

  const beginRotate = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (busy || !onRotate || event.button !== 0) return;
      const page = frameRef.current?.closest<HTMLElement>(".pdf-viewer__page");
      if (!page) return;
      const bounds = page.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      rotationCleanupRef.current?.();
      const center = {
        x: bounds.left + ((rect.x + rect.width / 2) / 100) * bounds.width,
        y: bounds.top + ((rect.y + rect.height / 2) / 100) * bounds.height,
      };
      const startRotation = normalizeRotationDegrees(rotation);
      const startPointerAngle = angleFromPointer(
        { x: event.clientX, y: event.clientY },
        center,
      );
      let latest = startRotation;
      const turnStart = rect;
      rotationStartRef.current = turnStart;
      setRotationPreview(startRotation);
      onRotatePreviewRef.current?.(startRotation, turnStart);

      const handleMove = (moveEvent: PointerEvent) => {
        const pointerAngle = angleFromPointer(
          { x: moveEvent.clientX, y: moveEvent.clientY },
          center,
        );
        let delta = ((pointerAngle - startPointerAngle + 540) % 360) - 180;
        if (moveEvent.shiftKey) delta = Math.round(delta / 15) * 15;
        latest = normalizeRotationDegrees(startRotation + delta);
        setRotationPreview(latest);
        onRotatePreviewRef.current?.(latest, turnStart);
      };
      const detach = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleCancel);
        rotationCleanupRef.current = null;
        setRotationPreview(null);
      };
      // The end is reported after the pointer-up's `onRotate`.
      const endTurn = () => {
        if (rotationStartRef.current !== turnStart) return;
        rotationStartRef.current = null;
        onRotatePreviewRef.current?.(null, turnStart);
      };
      const handleUp = () => {
        const committed = latest;
        detach();
        if (committed !== startRotation) onRotate(committed);
        endTurn();
      };
      const handleCancel = () => {
        detach();
        endTurn();
      };
      rotationCleanupRef.current = detach;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
    },
    [busy, onRotate, rect, rotation],
  );

  const shown = contentRect ?? (dragKey && previewRect ? previewRect : rect);
  // Thinner than a handle on an axis: the frame takes a handle's size there,
  // centred on the shape.
  const tinyX = (shown.width / 100) * pageWidth < HANDLE_PX;
  const tinyY = (shown.height / 100) * pageHeight < HANDLE_PX;
  const shownRotation = normalizeRotationDegrees(rotationPreview ?? rotation);
  // A line's frame hugs its thickness (WPS) even where the grabbable frame
  // around it is a handle tall: the box is drawn on an inner strip.
  const lineThicknessPx = lineAxis === "horizontal"
    ? (shown.height / 100) * pageHeight
    : lineAxis === "vertical"
      ? (shown.width / 100) * pageWidth
      : 0;
  const hugLine =
    (lineAxis === "horizontal" && tinyY) || (lineAxis === "vertical" && tinyX);
  // Thin across, one capsule takes the thickness; thick enough for two to
  // stand apart, each side has its own.
  const lineThicknessHandles: readonly ("n" | "s" | "e" | "w" | "thickness")[] =
    !lineAxis
      ? []
      : lineThicknessPx < 2 * HANDLE_PX
        ? ["thickness"]
        : lineAxis === "horizontal"
          ? ["n", "s"]
          : ["w", "e"];
  const lineEndHandles: readonly ("n" | "s" | "e" | "w")[] =
    lineAxis === "horizontal" ? ["w", "e"] : lineAxis === "vertical" ? ["n", "s"] : [];
  return (
    <div
      ref={frameRef}
      data-pdf-annotation-frame
      data-pdf-grip-style={gripStyle === "wps" ? "wps" : undefined}
      // The shared drawing selection paints WPS's look from this.
      data-office-drawing-look={gripStyle === "wps" ? "wps" : undefined}
      data-testid={testId}
      // The frame is also the move surface: it wears the shared Office
      // drawing frame (1px #686868) and keeps its own pointer ownership.
      className={officeDrawingSelectionStyles.frame}
      title={t("pdfAnnotation.moveHint")}
      aria-label={t("pdfAnnotation.moveHint")}
      aria-disabled={busy}
      tabIndex={busy ? -1 : 0}
      onKeyDown={handleKeyDown}
      onDoubleClick={onEditContent && !busy ? (event) => {
        event.stopPropagation();
        onEditContent();
      } : undefined}
      // A finger has no double-click: its tap on the selected text box puts
      // the words in edit, as Office and WPS take a tap on a selected text
      // box on a touch screen. A move that ended here is not a tap.
      onClick={onEditContent && !busy ? (event) => {
        const press = framePressRef.current;
        if (
          !isCompatMouseFromTouch(event.nativeEvent) ||
          !press ||
          Math.hypot(event.clientX - press.x, event.clientY - press.y) >= PDF_BOX_DRAG_CLICK_SLOP_PX
        ) {
          return;
        }
        event.stopPropagation();
        onEditContent();
      } : undefined}
      onPointerDown={(event) => {
        framePressRef.current = { x: event.clientX, y: event.clientY };
        if (busy || event.button !== 0) return;
        thicknessGripRef.current = false;
        beginDrag("frame", rect, "move", event, { immediate: true });
      }}
      style={{
        position: "absolute",
        // A thin shape's frame (a line's bounding box has ~0 height) is kept
        // grabbable at a handle's size, grown evenly about the shape: grown
        // downward from its top edge, the frame hung below the line with a
        
        left: tinyX ? `calc(${shown.x + shown.width / 2}% - ${HANDLE_PX / 2}px)` : `${shown.x}%`,
        top: tinyY ? `calc(${shown.y + shown.height / 2}% - ${HANDLE_PX / 2}px)` : `${shown.y}%`,
        width: tinyX ? HANDLE_PX : `${shown.width}%`,
        height: tinyY ? HANDLE_PX : `${shown.height}%`,
        boxSizing: "border-box",
        ...(hugLine ? { borderColor: "transparent" } : {}),
        background: "transparent",
        cursor: "move",
        pointerEvents: "auto",
        touchAction: "none",
        zIndex: 7,
        transform:
          shownRotation === 0 ? undefined : `rotate(${shownRotation}deg)`,
        transformOrigin: "center center",
      }}
    >
      {hugLine ? (
        <div
          aria-hidden="true"
          data-testid="pdf-annotation-frame-line-box"
          style={{
            position: "absolute",
            boxSizing: "border-box",
            border: `1px solid ${gripStyle === "wps" ? WPS_FRAME_COLOR : "#686868"}`,
            pointerEvents: "none",
            ...(lineAxis === "horizontal"
              ? {
                  left: 0,
                  right: 0,
                  top: `calc(50% - ${Math.max(1, lineThicknessPx) / 2}px)`,
                  height: Math.max(1, lineThicknessPx),
                }
              : {
                  top: 0,
                  bottom: 0,
                  left: `calc(50% - ${Math.max(1, lineThicknessPx) / 2}px)`,
                  width: Math.max(1, lineThicknessPx),
                }),
          }}
        />
      ) : null}
      {resizable && lineAxis
        ? [...lineEndHandles, ...lineThicknessHandles].map((handle) => {
            const end = (lineEndHandles as readonly string[]).includes(handle);
            const horizontal = lineAxis === "horizontal";
            return (
              <div
                key={handle}
                data-testid="pdf-annotation-frame-handle"
                data-handle={handle}
                data-line-grip={end ? "end" : "thickness"}
                onPointerDown={(event) => {
                  if (busy || event.button !== 0) return;
                  thicknessGripRef.current = handle === "thickness";
                  const mode: PdfBoxDragMode =
                    handle === "thickness" ? (horizontal ? "s" : "e") : handle;
                  beginDrag(handle, rect, mode, event);
                }}
                style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  border: `1px solid ${gripStyle === "wps" ? WPS_GRIP_BORDER : "#686868"}`,
                  background: "#fff",
                  // An end dot drags along the line, a capsule across it.
                  cursor: end === horizontal ? "ew-resize" : "ns-resize",
                  pointerEvents: "auto",
                  touchAction: "none",
                  zIndex: 8,
                  ...lineGripPlacement(handle, horizontal),
                }}
              />
            );
          })
        : null}
      {resizable && !lineAxis
        ? shownHandles.map(({ handle }) => (
            <div
              key={handle}
              className={officeDrawingSelectionStyles.resize}
              data-testid="pdf-annotation-frame-handle"
              data-handle={handle}
              data-office-drawing-handle={handle}
              onPointerDown={(event) => {
                if (busy || event.button !== 0) return;
                thicknessGripRef.current = false;
                beginDrag(handle, rect, handle, event);
              }}
              style={GRIP_HIT_STYLE}
            />
          ))
        : null}
      {onRotate ? (
        // The shared round grip draws its own stem down to the frame.
        <div
          className={officeDrawingSelectionStyles.rotate}
          data-office-drawing-rotate="true"
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          aria-label={t("presentation.rotateHandle")}
          title={t("presentation.rotateHandle")}
          data-testid="pdf-annotation-frame-rotate"
          onPointerDown={beginRotate}
          onKeyDown={(event) => {
            if (busy) return;
            const step = event.shiftKey ? 15 : 1;
            const delta =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? step
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -step
                  : null;
            if (delta === null && event.key !== "Home") return;
            event.preventDefault();
            event.stopPropagation();
            onRotate(
              event.key === "Home"
                ? 0
                : normalizeRotationDegrees(shownRotation + (delta ?? 0)),
            );
          }}
          style={busy ? { cursor: "default" } : undefined}
        >
          <RotateCw size={9} aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
