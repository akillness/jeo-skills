"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Picking an image the PDF already contains, and saying what to do with it.
 *
 * The layer sits over the rendered page and draws one box per placement the
 * walker found. Selecting is deliberately not a hover affordance: figures
 * overlap, and a box that lights up under the pointer while reading would be
 * noise. Only the selected image gets a toolbar.
 *
 * Nothing here touches the document. It reports intent; the host turns that
 * into edits and hands them to the applier.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import { officeDrawingSelectionStyles } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";

import gripStyles from "./PdfEmbeddedImageLayer.module.css";

import type {
  EmbeddedImageCropRect,
  EmbeddedImageEdit,
  FractionRect,
} from "@/lib/pdf/embedded-image-edits";
import {
  currentRectFor,
  imageAtPoint,
  imageEditAt,
  type EmbeddedImageEdits,
} from "../../../../lib/pdf/embedded-image-session";
import type { PlacedImage } from "../../../../lib/pdf/embedded-images";
import {
  nativeVectorDragGhostBox,
  paintNativeVectorDragGhost,
  type PdfVectorDragModel,
} from "../../../../lib/pdf/native-vector-drag-backdrop";
import { isTouchLikePointer } from "@mrnote/core/web/lib/pointer-capability.ts";
import { pointerRetainsPdfObjectSelection } from "../../../../lib/pdf/object-selection-retain";
import {
  adjustCropEdge,
  clampCropRect,
  type CropEdge,
} from "@mrnote/core/web/lib/presentation-crop-group.ts";
import {
  RESIZE_HANDLES,
  resizeBox,
  type ResizeHandle,
} from "@mrnote/core/web/lib/pdf/text-box-geometry.ts";

export interface PdfEmbeddedImageLayerProps {
  /** 1-based page these placements belong to. */
  page: number;
  /** Significant placements on this page, in paint order. */
  images: ReadonlyArray<PlacedImage>;
  edits: EmbeddedImageEdits;
  previewUrls?: Readonly<Record<string, string>>;
  /** Paint order of the selected placement, or null. */
  selectedOrder: number | null;
  onSelectedOrderChange: (order: number | null) => void;
  onDelete: (image: PlacedImage) => void;
  onReplace: (image: PlacedImage, file: File) => void;
  /** Drop the edit on this image, putting it back as it was. */
  onRestore: (image: PlacedImage) => void;
  onOpacity?: (image: PlacedImage, opacity: number) => void;
  onCrop?: (
    image: PlacedImage,
    crop: EmbeddedImageCropRect,
    rect: FractionRect,
  ) => void;
  /** Page/image transforms whose captured pixels cannot be replayed exactly. */
  cropDisabled?: boolean;
  onRotate?: (
    image: PlacedImage,
    direction: "left" | "right",
    rect: FractionRect,
  ) => void;
  rotateDisabled?: boolean;
  onFlip?: (
    image: PlacedImage,
    axis: "horizontal" | "vertical",
    rect: FractionRect,
  ) => void;
  flipDisabled?: boolean;
  onResize?: (image: PlacedImage, rect: FractionRect) => void;
  resizeDisabled?: boolean;
  /** Commit a drag. Only called when the image actually moved. */
  onMove?: (image: PlacedImage, to: FractionRect) => void;
  /**
   * The picture as painted, to follow the pointer while it is dragged and to
   * stand at the drop until the host's draft has its pixels; `maskColor`
   * covers the old place meanwhile. Without it only the frame moves.
   */
  dragGhostFor?: (image: PlacedImage) => PdfEmbeddedImageDragGhost | null;
  /** A gesture the host holds until the write before it lands: its frame
   * (and dropped picture) stay where the user let go meanwhile. */
  heldRect?: { order: number; rect: FractionRect } | null;
  /** The host is saving an earlier picture write and queues what comes
   * next: commands that could not be combined with a draft of their own
   * kind are passed on to wait their turn instead of being dropped. */
  writePending?: boolean;
  /** The page itself paints what the drafts show: they render nothing. */
  previewsHidden?: boolean;
  /** Busy applying — the layer stays visible but stops accepting gestures. */
  disabled?: boolean;
  /**
   * The host rewrites paint instances in place, so a rotated or skewed
   * source paint keeps every gesture; without it the overlay writer cannot
   * reproduce such a paint and the gestures stay off.
   */
  rotatedEditable?: boolean;
  /** Contextual-ribbon request for the currently selected source image. */
  contextCommand?: PdfEmbeddedImageContextCommand | null;
  /** Standalone editors keep the compact page toolbar; ribbon hosts disable it. */
  showInlineToolbar?: boolean;
}

/** What the host hands over when a picture starts to move. */
export interface PdfEmbeddedImageDragGhost {
  /** The picture's pixels as the page shows them, available at once. */
  canvas: HTMLCanvasElement;
  /** A flat colour for the old place until (or unless) `refine` delivers. */
  maskColor: string;
  /**
   * Asked once the gesture is really a drag or a resize (a click that only
   * selects costs nothing): the page without the picture and the picture's
   * own contribution. It resolves null (never rejects) when the host cannot
   * tell; the flat mask and the plain crop then stay.
   */
  refine?: () => Promise<PdfEmbeddedImageDragBackdrop | null>;
}

export interface PdfEmbeddedImageDragBackdrop {
  model: PdfVectorDragModel;
  /** The box the model was cut at, page fractions as displayed. It must be
   * where the gesture started, or the patch would erase the wrong place. */
  bounds: FractionRect;
}

export interface PdfEmbeddedImageContextCommand {
  requestId: number;
  page: number;
  order: number;
  action:
    | "replace"
    | "delete"
    | "restore"
    | "opacity"
    | "crop"
    | "rotate-left"
    | "rotate-right"
    | "flip-horizontal"
    | "flip-vertical"
    | "resize";
  opacity?: number;
  /** Target size for `resize`, page fractions in display orientation. */
  width?: number;
  height?: number;
}

const ACCEPTED = "image/png,image/jpeg";
/** Below this, a drag is a click that wobbled. */
const DRAG_THRESHOLD = 0.004;
/** How far a model's box may sit from the gesture's start (sub-pixel). */
const BACKDROP_BOUNDS_TOLERANCE = 5e-4;
const CROP_HANDLE_EDGES: readonly CropEdge[] = [
  "left",
  "right",
  "top",
  "bottom",
];

function percent(value: number): string {
  return `${value * 100}%`;
}

const IDENTITY_IMAGE_CROP: Readonly<EmbeddedImageCropRect> = Object.freeze({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
});

function normalizedImageCrop(
  value: EmbeddedImageCropRect | undefined,
): EmbeddedImageCropRect {
  const crop = clampCropRect(
    value
      ? { x: value.x, y: value.y, w: value.width, h: value.height }
      : {
          x: IDENTITY_IMAGE_CROP.x,
          y: IDENTITY_IMAGE_CROP.y,
          w: IDENTITY_IMAGE_CROP.width,
          h: IDENTITY_IMAGE_CROP.height,
        },
  );
  return { x: crop.x, y: crop.y, width: crop.w, height: crop.h };
}

function adjustedImageCrop(
  value: EmbeddedImageCropRect,
  edge: CropEdge,
  delta: number,
): EmbeddedImageCropRect {
  const crop = adjustCropEdge(
    { x: value.x, y: value.y, w: value.width, h: value.height },
    edge,
    delta,
  );
  return { x: crop.x, y: crop.y, width: crop.w, height: crop.h };
}

function cropPlacement(
  startCrop: EmbeddedImageCropRect,
  startRect: FractionRect,
  nextCrop: EmbeddedImageCropRect,
): FractionRect {
  return {
    x:
      startRect.x +
      ((nextCrop.x - startCrop.x) / startCrop.width) * startRect.width,
    y:
      startRect.y +
      ((nextCrop.y - startCrop.y) / startCrop.height) * startRect.height,
    width: (nextCrop.width / startCrop.width) * startRect.width,
    height: (nextCrop.height / startCrop.height) * startRect.height,
  };
}

function sameImageCrop(
  left: EmbeddedImageCropRect,
  right: EmbeddedImageCropRect,
): boolean {
  return (
    Math.abs(left.x - right.x) <= 1e-9 &&
    Math.abs(left.y - right.y) <= 1e-9 &&
    Math.abs(left.width - right.width) <= 1e-9 &&
    Math.abs(left.height - right.height) <= 1e-9
  );
}

function percentRect(rect: FractionRect): FractionRect {
  return {
    x: rect.x * 100,
    y: rect.y * 100,
    width: rect.width * 100,
    height: rect.height * 100,
  };
}

function percentStyle(box: FractionRect) {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

function nearFractionRect(left: FractionRect, right: FractionRect): boolean {
  return (
    Math.abs(left.x - right.x) <= BACKDROP_BOUNDS_TOLERANCE &&
    Math.abs(left.y - right.y) <= BACKDROP_BOUNDS_TOLERANCE &&
    Math.abs(left.width - right.width) <= BACKDROP_BOUNDS_TOLERANCE &&
    Math.abs(left.height - right.height) <= BACKDROP_BOUNDS_TOLERANCE
  );
}

function sameFractionRect(left: FractionRect, right: FractionRect): boolean {
  return (
    Math.abs(left.x - right.x) <= 1e-9 &&
    Math.abs(left.y - right.y) <= 1e-9 &&
    Math.abs(left.width - right.width) <= 1e-9 &&
    Math.abs(left.height - right.height) <= 1e-9
  );
}

export default function PdfEmbeddedImageLayer({
  page,
  images,
  edits,
  previewUrls = {},
  selectedOrder,
  onSelectedOrderChange,
  onDelete,
  onReplace,
  onRestore,
  onOpacity,
  onCrop,
  cropDisabled = false,
  onRotate,
  rotateDisabled = false,
  onFlip,
  flipDisabled = false,
  onResize,
  resizeDisabled = false,
  onMove,
  dragGhostFor,
  heldRect = null,
  writePending = false,
  previewsHidden = false,
  disabled = false,
  rotatedEditable = false,
  contextCommand,
  showInlineToolbar = true,
}: PdfEmbeddedImageLayerProps) {
  const t = useTranslations("console-notebooks");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState<{
    order: number;
    dx: number;
    dy: number;
  } | null>(null);
  const [dragTo, setDragTo] = useState<{ x: number; y: number } | null>(null);
  // The dragged picture's own pixels: under the pointer while dragging, then
  // at the drop (with its old place covered) until the draft is painted, so
  // the picture never blinks out or snaps back between the two. With a
  // `model` the old place shows the real page without the picture and the
  // ghost is the picture recomposed over wherever it is.
  const [ghost, setGhost] = useState<{
    id: number;
    order: number;
    canvas: HTMLCanvasElement;
    maskColor: string;
    from: FractionRect;
    settle: FractionRect | null;
    model: PdfVectorDragModel | null;
  } | null>(null);
  const ghostIdRef = useRef(0);
  // The host's refine for the gesture in progress, asked for once the
  // gesture turns out to be a real drag or resize.
  const pendingRefineRef = useRef<{
    id: number;
    from: FractionRect;
    refine: () => Promise<PdfEmbeddedImageDragBackdrop | null>;
  } | null>(null);
  // Draft previews whose pixels have decoded: their mask waits for them, or
  // the old place empties a frame before the new one fills.
  const [loadedPreviews, setLoadedPreviews] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [cropOrder, setCropOrder] = useState<number | null>(null);
  const [cropPreview, setCropPreview] = useState<{
    order: number;
    crop: EmbeddedImageCropRect;
    rect: FractionRect;
  } | null>(null);
  const [cropGesture, setCropGesture] = useState<{
    order: number;
    edge: CropEdge;
    startX: number;
    startY: number;
    startCrop: EmbeddedImageCropRect;
    startRect: FractionRect;
  } | null>(null);
  const cropPreviewRef = useRef<typeof cropPreview>(null);
  const [resizeGesture, setResizeGesture] = useState<{
    order: number;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startRect: FractionRect;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    order: number;
    rect: FractionRect;
  } | null>(null);
  const resizePreviewRef = useRef<typeof resizePreview>(null);
  const lastContextCommandRef = useRef(0);

  const selected =
    selectedOrder === null
      ? undefined
      : images.find((image) => image.order === selectedOrder);
  const selectedEdit = selected
    ? imageEditAt(edits, page, selected.order)
    : undefined;

  /** Pointer position as a page fraction. */
  const pointToFraction = useCallback(
    (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    },
    [],
  );

  /** A ghost for a gesture starting at `from`, or null without a host one. */
  const beginGhost = useCallback(
    (image: PlacedImage, from: FractionRect) => {
      const captured = dragGhostFor?.(image) ?? null;
      pendingRefineRef.current = null;
      if (!captured) {
        setGhost(null);
        return;
      }
      ghostIdRef.current += 1;
      const id = ghostIdRef.current;
      if (captured.refine) {
        pendingRefineRef.current = { id, from: { ...from }, refine: captured.refine };
      }
      setGhost({
        id,
        order: image.order,
        canvas: captured.canvas,
        maskColor: captured.maskColor,
        from: { ...from },
        settle: null,
        model: null,
      });
    },
    [dragGhostFor],
  );

  /** The gesture is real: ask the host for the page without the picture. */
  const requestGhostRefine = useCallback(() => {
    const pending = pendingRefineRef.current;
    if (!pending) return;
    pendingRefineRef.current = null;
    let request: Promise<PdfEmbeddedImageDragBackdrop | null>;
    try {
      request = pending.refine();
    } catch {
      return;
    }
    void Promise.resolve(request).then(
      (result) => {
        // A model cut anywhere else would erase the wrong place.
        if (!result || !nearFractionRect(result.bounds, pending.from)) return;
        const canvas = document.createElement("canvas");
        setGhost((current) =>
          current && current.id === pending.id
            ? { ...current, canvas, model: result.model }
            : current,
        );
      },
      () => undefined,
    );
  }, []);

  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const point = pointToFraction(event);
      if (!point) return;
      const hit = imageAtPoint(images, point);
      if (hit?.order !== selectedOrder) setCropOrder(null);
      onSelectedOrderChange(hit ? hit.order : null);
    },
    [disabled, images, onSelectedOrderChange, pointToFraction, selectedOrder],
  );

  /** The one pointer a picture move follows (a second finger is ignored). */
  const dragPointerRef = useRef<number | undefined>(undefined);
  const handleBoxPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, image: PlacedImage) => {
      if (disabled) return;
      event.stopPropagation();
      const wasSelected = selectedOrder === image.order;
      if (!wasSelected) setCropOrder(null);
      onSelectedOrderChange(image.order);
      if (!onMove || cropOrder === image.order) return;
      // Office's touch rule: tap a picture to select it, then drag it. A
      // finger on a picture not yet selected only selects it, so a swipe
      // across the page still scrolls; a selected one wears
      // touch-action: none and moves at once.
      if (isTouchLikePointer(event) && !wasSelected) return;
      const point = pointToFraction(event);
      if (!point) return;
      // Where the picture is shown: a held gesture's drop, else its draft.
      const rect =
        heldRect?.order === image.order
          ? heldRect.rect
          : currentRectFor(image, imageEditAt(edits, page, image.order));
      setDrag({
        order: image.order,
        dx: point.x - rect.x,
        dy: point.y - rect.y,
      });
      setDragTo(null);
      dragPointerRef.current = event.pointerId;
      beginGhost(image, rect);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [
      beginGhost,
      cropOrder,
      disabled,
      edits,
      heldRect,
      onMove,
      onSelectedOrderChange,
      page,
      pointToFraction,
      selectedOrder,
    ],
  );

  useEffect(() => {
    if (!drag) return;
    const otherPointer = (event: PointerEvent) =>
      dragPointerRef.current !== undefined &&
      event.pointerId !== undefined &&
      event.pointerId !== dragPointerRef.current;
    const move = (event: PointerEvent) => {
      if (disabled || otherPointer(event)) return;
      const point = pointToFraction(event);
      if (!point) return;
      const image = images.find((candidate) => candidate.order === drag.order);
      if (!image) return;
      const rect =
        heldRect?.order === image.order
          ? heldRect.rect
          : currentRectFor(image, imageEditAt(edits, page, image.order));
      const to = {
        x: Math.min(1 - rect.width, Math.max(0, point.x - drag.dx)),
        y: Math.min(1 - rect.height, Math.max(0, point.y - drag.dy)),
      };
      if (
        Math.abs(to.x - rect.x) >= DRAG_THRESHOLD ||
        Math.abs(to.y - rect.y) >= DRAG_THRESHOLD
      ) {
        requestGhostRefine();
      }
      setDragTo(to);
    };
    const end = (event: PointerEvent) => {
      if (otherPointer(event)) return;
      const image = images.find((candidate) => candidate.order === drag.order);
      const to = dragTo;
      setDrag(null);
      setDragTo(null);
      if (disabled || !image || !to || !onMove) {
        setGhost(null);
        return;
      }
      const from =
        heldRect?.order === image.order
          ? heldRect.rect
          : currentRectFor(image, imageEditAt(edits, page, image.order));
      // A click that wobbled is not a move: committing one would push an edit
      // (and a mask) onto an image the user only meant to select.
      if (
        Math.abs(to.x - from.x) < DRAG_THRESHOLD &&
        Math.abs(to.y - from.y) < DRAG_THRESHOLD
      ) {
        setGhost(null);
        return;
      }
      const target = { ...from, x: to.x, y: to.y };
      setGhost((current) =>
        current && current.order === image.order
          ? { ...current, settle: target }
          : null,
      );
      onMove(image, target);
    };
    const cancel = (event: PointerEvent) => {
      if (otherPointer(event)) return;
      setDrag(null);
      setDragTo(null);
      setGhost(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [
    disabled,
    drag,
    dragTo,
    edits,
    heldRect,
    images,
    onMove,
    page,
    pointToFraction,
    requestGhostRefine,
  ]);

  // The settled picture hands over to the draft when the draft's pixels
  // have loaded (its <img> onLoad); a draft that never comes (refused,
  // failed) releases it.
  const ghostHeld = ghost !== null && heldRect?.order === ghost.order;
  // A settled ghost that knows the page around it (its model) stands in for
  // the draft until the page itself paints the move. The draft's flat mask
  // and pasted picture covered what the page paints over the old place (text
  
  const ghostDraft =
    ghost?.settle && ghost.model ? imageEditAt(edits, page, ghost.order) : undefined;
  const ghostStandsForDraft =
    ghostDraft !== undefined &&
    (ghostDraft.kind === "move" || ghostDraft.kind === "resize");
  const ghostSawDraftRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ghost?.settle || !ghost.model) {
      ghostSawDraftRef.current = null;
      return;
    }
    if (ghostStandsForDraft) {
      ghostSawDraftRef.current = ghost.id;
      return;
    }
    // The draft is gone (written and painted, or dropped): so is the ghost.
    if (ghostSawDraftRef.current === ghost.id && !ghostHeld) {
      ghostSawDraftRef.current = null;
      setGhost(null);
    }
  }, [ghost, ghostHeld, ghostStandsForDraft]);
  useEffect(() => {
    if (!ghost?.settle || ghostHeld || ghostStandsForDraft) return;
    const timer = window.setTimeout(() => setGhost(null), 2_500);
    return () => window.clearTimeout(timer);
  }, [ghost, ghostHeld, ghostStandsForDraft]);

  // Where the ghost stands now: the drop once let go, else under the pointer
  // or the handle.
  const ghostRect = useMemo((): FractionRect | null => {
    if (!ghost) return null;
    if (ghost.settle) return ghost.settle;
    if (drag?.order === ghost.order && dragTo) {
      return { ...ghost.from, x: dragTo.x, y: dragTo.y };
    }
    if (resizePreview?.order === ghost.order) return resizePreview.rect;
    return null;
  }, [drag, dragTo, ghost, resizePreview]);

  // With a model the ghost is recomposed for every step and at the drop:
  // the picture over what lies where it is now, not over its old backdrop.
  useLayoutEffect(() => {
    if (!ghost?.model || !ghostRect) return;
    try {
      paintNativeVectorDragGhost(
        ghost.model,
        ghost.canvas,
        nativeVectorDragGhostBox(
          ghost.model,
          percentRect(ghostRect),
          percentRect(ghost.from),
        ).pixels,
      );
    } catch {
      // A canvas that refuses the paint keeps its last pixels.
    }
  }, [ghost, ghostRect]);

  const beginCropGesture = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      image: PlacedImage,
      edit: EmbeddedImageEdit | undefined,
      edge: CropEdge,
    ) => {
      if (disabled || cropDisabled || !onCrop || (image.rotated && !rotatedEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      const startCrop = normalizedImageCrop(edit?.sourceCrop);
      const startRect = currentRectFor(image, edit);
      const preview = { order: image.order, crop: startCrop, rect: startRect };
      cropPreviewRef.current = preview;
      setCropPreview(preview);
      setCropGesture({
        order: image.order,
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startCrop,
        startRect,
      });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [cropDisabled, disabled, onCrop],
  );

  useEffect(() => {
    if (!cropGesture) return;
    const image = images.find(
      (candidate) => candidate.order === cropGesture.order,
    );
    if (!image) {
      queueMicrotask(() => {
        setCropGesture(null);
        setCropPreview(null);
        cropPreviewRef.current = null;
      });
      return;
    }
    const update = (event: PointerEvent) => {
      if (disabled) return;
      const pageRect = rootRef.current?.getBoundingClientRect();
      if (!pageRect || pageRect.width <= 0 || pageRect.height <= 0) return;
      const horizontal =
        cropGesture.edge === "left" || cropGesture.edge === "right";
      const pageDelta = horizontal
        ? (event.clientX - cropGesture.startX) / pageRect.width
        : (event.clientY - cropGesture.startY) / pageRect.height;
      const sourceSpan = horizontal ? image.width : image.height;
      if (!(sourceSpan > 0)) return;
      const crop = adjustedImageCrop(
        cropGesture.startCrop,
        cropGesture.edge,
        pageDelta / sourceSpan,
      );
      const preview = {
        order: image.order,
        crop,
        rect: cropPlacement(
          cropGesture.startCrop,
          cropGesture.startRect,
          crop,
        ),
      };
      cropPreviewRef.current = preview;
      setCropPreview(preview);
    };
    const finish = (commit: boolean) => {
      const preview = cropPreviewRef.current;
      setCropGesture(null);
      setCropPreview(null);
      cropPreviewRef.current = null;
      if (
        commit &&
        !disabled &&
        preview?.order === image.order &&
        !sameImageCrop(preview.crop, cropGesture.startCrop) &&
        onCrop
      ) {
        onCrop(image, preview.crop, preview.rect);
      }
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [cropGesture, disabled, images, onCrop]);

  const beginResizeGesture = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      image: PlacedImage,
      edit: EmbeddedImageEdit | undefined,
      handle: ResizeHandle,
    ) => {
      if (disabled || resizeDisabled || !onResize || (image.rotated && !rotatedEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      const startRect = currentRectFor(image, edit);
      const preview = { order: image.order, rect: startRect };
      resizePreviewRef.current = preview;
      setResizePreview(preview);
      setResizeGesture({
        order: image.order,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startRect,
      });
      // The picture's own pixels stretch with the handle, as they follow a
      // drag: with only the frame moving, the picture appeared to jump to
      
      beginGhost(image, startRect);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [beginGhost, disabled, onResize, resizeDisabled],
  );

  useEffect(() => {
    if (!resizeGesture) return;
    const image = images.find(
      (candidate) => candidate.order === resizeGesture.order,
    );
    if (!image) {
      queueMicrotask(() => {
        setResizeGesture(null);
        setResizePreview(null);
        resizePreviewRef.current = null;
      });
      return;
    }
    const update = (event: PointerEvent) => {
      if (disabled) return;
      const pageRect = rootRef.current?.getBoundingClientRect();
      if (!pageRect || pageRect.width <= 0 || pageRect.height <= 0) return;
      const rect = resizeBox(
        resizeGesture.startRect,
        resizeGesture.handle,
        (event.clientX - resizeGesture.startX) / pageRect.width,
        (event.clientY - resizeGesture.startY) / pageRect.height,
      );
      const preview = { order: image.order, rect };
      if (!sameFractionRect(rect, resizeGesture.startRect)) requestGhostRefine();
      resizePreviewRef.current = preview;
      setResizePreview(preview);
    };
    const finish = (commit: boolean) => {
      const preview = resizePreviewRef.current;
      setResizeGesture(null);
      setResizePreview(null);
      resizePreviewRef.current = null;
      if (
        commit &&
        !disabled &&
        preview?.order === image.order &&
        !sameFractionRect(preview.rect, resizeGesture.startRect) &&
        onResize
      ) {
        const target = preview.rect;
        setGhost((current) =>
          current && current.order === image.order
            ? { ...current, settle: { ...target } }
            : null,
        );
        onResize(image, preview.rect);
        return;
      }
      setGhost((current) =>
        current && current.order === image.order && !current.settle ? null : current,
      );
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [disabled, images, onResize, requestGhostRefine, resizeGesture]);

  const handleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Clearing lets the same file be chosen again after an undo; without it
      // the input reports no change and the button appears dead.
      event.target.value = "";
      if (!disabled && file && selected) onReplace(selected, file);
    },
    [disabled, onReplace, selected],
  );

  useEffect(() => {
    if (!disabled || selectedOrder === null) return;
    onSelectedOrderChange(null);
  }, [disabled, onSelectedOrderChange, selectedOrder]);

  useEffect(() => {
    if (!selected || disabled) return;
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      if (pointerRetainsPdfObjectSelection(event)) return;
      setCropOrder(null);
      onSelectedOrderChange(null);
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (cropOrder === selected.order) {
        setCropOrder(null);
        setCropPreview(null);
        cropPreviewRef.current = null;
        return;
      }
      onSelectedOrderChange(null);
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleDocumentPointerDown,
        true,
      );
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [cropOrder, disabled, onSelectedOrderChange, selected]);

  useEffect(() => {
    if (
      disabled ||
      !selected ||
      !contextCommand ||
      contextCommand.requestId === lastContextCommandRef.current ||
      contextCommand.page !== page ||
      contextCommand.order !== selected.order
    ) {
      return;
    }
    lastContextCommandRef.current = contextCommand.requestId;
    // While an earlier write is saving, the command waits in the host's
    // queue and runs on the revision that write produces: the draft's kind
    // does not limit it.
    const guardEdit = writePending ? undefined : selectedEdit;
    if (contextCommand.action === "replace") {
      fileRef.current?.click();
    } else if (contextCommand.action === "delete") {
      onDelete(selected);
      onSelectedOrderChange(null);
    } else if (contextCommand.action === "crop") {
      if (
        !cropDisabled &&
        (!selected.rotated || rotatedEditable) &&
        guardEdit?.kind !== "replace" &&
        onCrop
      ) {
        queueMicrotask(() => {
          setCropOrder((current) =>
            current === selected.order ? null : selected.order,
          );
        });
      }
    } else if (
      (contextCommand.action === "rotate-left" ||
        contextCommand.action === "rotate-right") &&
      !rotateDisabled &&
      (!selected.rotated || rotatedEditable) &&
      guardEdit?.kind !== "crop" &&
      guardEdit?.kind !== "replace" &&
      guardEdit?.kind !== "rotate" &&
      onRotate
    ) {
      onRotate(
        selected,
        contextCommand.action === "rotate-right" ? "right" : "left",
        currentRectFor(selected, selectedEdit),
      );
    } else if (
      (contextCommand.action === "flip-horizontal" ||
        contextCommand.action === "flip-vertical") &&
      !flipDisabled &&
      (!selected.rotated || rotatedEditable) &&
      guardEdit?.kind !== "crop" &&
      guardEdit?.kind !== "replace" &&
      guardEdit?.kind !== "rotate" &&
      guardEdit?.kind !== "flip" &&
      onFlip
    ) {
      onFlip(
        selected,
        contextCommand.action === "flip-horizontal"
          ? "horizontal"
          : "vertical",
        currentRectFor(selected, selectedEdit),
      );
    } else if (
      contextCommand.action === "opacity" &&
      Number.isFinite(contextCommand.opacity) &&
      onOpacity
    ) {
      onOpacity(selected, Number(contextCommand.opacity));
    } else if (
      contextCommand.action === "resize" &&
      !resizeDisabled &&
      (!selected.rotated || rotatedEditable) &&
      guardEdit?.kind !== "replace" &&
      onResize &&
      Number.isFinite(contextCommand.width) &&
      Number.isFinite(contextCommand.height) &&
      Number(contextCommand.width) > 0 &&
      Number(contextCommand.height) > 0
    ) {
      const current = currentRectFor(selected, selectedEdit);
      onResize(selected, {
        x: current.x,
        y: current.y,
        width: Math.min(Number(contextCommand.width), 1 - current.x),
        height: Math.min(Number(contextCommand.height), 1 - current.y),
      });
    } else if (selectedEdit) {
      onRestore(selected);
    }
  }, [
    contextCommand,
    cropDisabled,
    disabled,
    onDelete,
    onFlip,
    onCrop,
    onRestore,
    onRotate,
    onOpacity,
    onResize,
    onSelectedOrderChange,
    page,
    resizeDisabled,
    rotatedEditable,
    selected,
    selectedEdit,
    flipDisabled,
    rotateDisabled,
    writePending,
  ]);

  if (images.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20"
      data-testid="pdf-embedded-image-layer"
      data-disabled={disabled ? "true" : undefined}
      onPointerDown={handleBackgroundPointerDown}
      role="presentation"
    >
      {images.map((image) => {
        const edit = imageEditAt(edits, page, image.order);
        if (!edit || previewsHidden) return null;
        if (ghostStandsForDraft && ghost?.order === image.order) return null;
        const previewUrl = edit.dataItemId
          ? previewUrls[edit.dataItemId]
          : undefined;
        if (edit.kind !== "delete" && !previewUrl) return null;
        const origin = edit.origin;
        const target = currentRectFor(image, edit);
        const overshoot = 0.002;
        const maskLeft = Math.max(0, origin.x - overshoot);
        const maskTop = Math.max(0, origin.y - overshoot);
        const maskRight = Math.min(1, origin.x + origin.width + overshoot);
        const maskBottom = Math.min(1, origin.y + origin.height + overshoot);
        const mask = {
          x: maskLeft,
          y: maskTop,
          width: maskRight - maskLeft,
          height: maskBottom - maskTop,
        };
        const previewPainted =
          edit.kind === "delete" ||
          (previewUrl !== undefined && loadedPreviews.has(previewUrl));
        return (
          <div key={`preview:${image.order}`} className="contents">
            {previewPainted ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-[1]"
              data-testid={`pdf-embedded-image-preview-mask-${image.order}`}
              style={{
                background: edit.maskColor ?? "#ffffff",
                left: percent(mask.x),
                top: percent(mask.y),
                width: percent(mask.width),
                height: percent(mask.height),
              }}
            />
            ) : null}
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute z-[2] object-contain"
                data-testid={`pdf-embedded-image-preview-${image.order}`}
                draggable={false}
                src={previewUrl}
                onLoad={() => {
                  setLoadedPreviews((current) =>
                    current.has(previewUrl)
                      ? current
                      : new Set(current).add(previewUrl),
                  );
                  // A draft of an earlier write does not release a dropped
                  // picture the host still holds for the next one.
                  setGhost((current) =>
                    current?.settle &&
                    current.order === image.order &&
                    heldRect?.order !== current.order
                      ? null
                      : current,
                  );
                }}
                style={{
                  left: percent(target.x),
                  top: percent(target.y),
                  width: percent(target.width),
                  height: percent(target.height),
                  opacity: edit.opacity ?? 1,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {ghost && ghostRect && !(ghost.settle && previewsHidden && !ghostHeld)
        ? (() => {
            const rect = ghostRect;
            const model = ghost.model;
            const mount =
              (canvas: HTMLCanvasElement) => (node: HTMLDivElement | null) => {
                if (!node || canvas.parentElement === node) return;
                Object.assign(canvas.style, {
                  display: "block",
                  width: "100%",
                  height: "100%",
                });
                node.replaceChildren(canvas);
              };
            const from = percentRect(ghost.from);
            return (
              <div key={`ghost:${ghost.order}`} className="contents">
                {



}
                {model ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-[3]"
                    data-testid={`pdf-embedded-image-drag-origin-patch-${ghost.order}`}
                    ref={mount(model.patch)}
                    style={percentStyle(
                      nativeVectorDragGhostBox(model, from, from).percent,
                    )}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-[3]"
                    data-testid={`pdf-embedded-image-drag-origin-mask-${ghost.order}`}
                    style={{
                      background: ghost.maskColor,
                      left: percent(Math.max(0, ghost.from.x - 0.002)),
                      top: percent(Math.max(0, ghost.from.y - 0.002)),
                      width: percent(ghost.from.width + 0.004),
                      height: percent(ghost.from.height + 0.004),
                    }}
                  />
                )}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-[4] overflow-hidden"
                  data-testid={`pdf-embedded-image-drag-ghost-${ghost.order}`}
                  data-settled={ghost.settle ? "true" : undefined}
                  data-backdrop={model ? "page" : undefined}
                  ref={mount(ghost.canvas)}
                  style={
                    model
                      ? percentStyle(
                          nativeVectorDragGhostBox(model, percentRect(rect), from)
                            .percent,
                        )
                      : {
                          left: percent(rect.x),
                          top: percent(rect.y),
                          width: percent(rect.width),
                          height: percent(rect.height),
                        }
                  }
                />
                {/* What lies over the picture (a caption set on it) stays
                    where it is, above the moving picture. */}
                {model?.overlay ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-[4]"
                    data-testid={`pdf-embedded-image-drag-overlay-${ghost.order}`}
                    ref={mount(model.overlay)}
                    style={percentStyle(
                      nativeVectorDragGhostBox(model, from, from).percent,
                    )}
                  />
                ) : null}
              </div>
            );
          })()
        : null}
      {images.map((image) => {
        const edit = imageEditAt(edits, page, image.order);
        const rect =
          heldRect?.order === image.order
            ? heldRect.rect
            : ghost?.settle && ghost.order === image.order
            ? ghost.settle
            : cropPreview?.order === image.order
            ? cropPreview.rect
            : resizePreview?.order === image.order
              ? resizePreview.rect
            : drag?.order === image.order && dragTo
            ? { ...currentRectFor(image, edit), x: dragTo.x, y: dragTo.y }
            : currentRectFor(image, edit);
        const isSelected = image.order === selectedOrder;
        const isCropActive =
          !disabled && isSelected && cropOrder === image.order;
        const state = edit?.kind ?? "none";
        return (
          <div
            key={`${image.order}:${image.name}`}
            data-testid={`pdf-embedded-image-${image.order}`}
            data-state={state}
            data-selected={isSelected ? "true" : "false"}
            data-crop-active={isCropActive ? "true" : "false"}
            role={isCropActive || (isSelected && onResize) ? "group" : "button"}
            tabIndex={disabled || isCropActive ? -1 : 0}
            aria-pressed={
              isCropActive || (isSelected && onResize) ? undefined : isSelected
            }
            aria-label={t("pdfViewer.imageEditBoxLabel", {
              index: image.order + 1,
            })}
            aria-keyshortcuts="Delete Backspace Escape ArrowLeft ArrowRight ArrowUp ArrowDown"
            onPointerDown={(event) => handleBoxPointerDown(event, image)}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "Escape" && isSelected && !isCropActive) {
                event.preventDefault();
                event.stopPropagation();
                onSelectedOrderChange(null);
                return;
              }
              if (
                (event.key === "Delete" || event.key === "Backspace") &&
                isSelected &&
                !isCropActive
              ) {
                event.preventDefault();
                event.stopPropagation();
                onDelete(image);
                onSelectedOrderChange(null);
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectedOrderChange(image.order);
                return;
              }
              if (
                isSelected &&
                !isCropActive &&
                onMove &&
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                event.stopPropagation();
                const step = event.shiftKey
                  ? 0.02
                  : event.metaKey || event.ctrlKey
                    ? 0.001
                    : 0.005;
                const current = currentRectFor(image, edit);
                const xDelta =
                  event.key === "ArrowLeft"
                    ? -step
                    : event.key === "ArrowRight"
                      ? step
                      : 0;
                const yDelta =
                  event.key === "ArrowUp"
                    ? -step
                    : event.key === "ArrowDown"
                      ? step
                      : 0;
                const next = {
                  ...current,
                  x: Math.min(
                    1 - current.width,
                    Math.max(0, current.x + xDelta),
                  ),
                  y: Math.min(
                    1 - current.height,
                    Math.max(0, current.y + yDelta),
                  ),
                };
                if (!sameFractionRect(current, next)) onMove(image, next);
              }
            }}
            className={[
              "absolute z-10 rounded-sm border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
              // Selected, the 2px border stays (the grips are placed against
              // it) but turns transparent: the shared Office frame below is
              // the visible selection.
              isSelected
                ? "border-2 border-transparent"
                : "border-dashed border-[var(--accent)]/45 hover:bg-[var(--accent)]/5",
              state === "delete" ? "bg-[var(--muted)]/40" : "",
              disabled ? "cursor-default" : "cursor-pointer",
            ].join(" ")}
            style={{
              left: percent(rect.x),
              top: percent(rect.y),
              width: percent(rect.width),
              height: percent(rect.height),
              touchAction: isSelected && onMove ? "none" : undefined,
            }}
          >
            {isSelected ? (
              // The shared Office drawing frame on the picture's own edge
              // (the box's border edge, 2px outside its padding box).
              <span
                aria-hidden="true"
                className={officeDrawingSelectionStyles.frame}
                data-testid={`pdf-embedded-image-selection-frame-${image.order}`}
                style={{ top: -2, right: -2, bottom: -2, left: -2 }}
              />
            ) : null}
            {isCropActive && onCrop
              ? CROP_HANDLE_EDGES.map((edge) => {
                  const vertical = edge === "left" || edge === "right";
                  const handleStyle =
                    edge === "left"
                      ? { left: -22, top: "50%", transform: "translateY(-50%)" }
                      : edge === "right"
                        ? {
                            right: -22,
                            top: "50%",
                            transform: "translateY(-50%)",
                          }
                        : edge === "top"
                          ? {
                              left: "50%",
                              top: -22,
                              transform: "translateX(-50%)",
                            }
                          : {
                              bottom: -22,
                              left: "50%",
                              transform: "translateX(-50%)",
                            };
                  return (
                    <button
                      key={edge}
                      type="button"
                      className={`${gripStyles.grip} absolute z-20 flex h-11 w-11 cursor-ns-resize items-center justify-center border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
                      style={{
                        ...handleStyle,
                        cursor: vertical ? "ew-resize" : "ns-resize",
                      }}
                      aria-label={`${t("pdfViewer.imageEditBoxLabel", {
                        index: image.order + 1,
                      })} crop ${edge}`}
                      data-testid={`pdf-embedded-image-crop-${edge}`}
                      onPointerDown={(event) =>
                        beginCropGesture(event, image, edit, edge)
                      }
                      onKeyDown={(event) => {
                        if (disabled || cropDisabled || (image.rotated && !rotatedEditable)) return;
                        const horizontal = edge === "left" || edge === "right";
                        const delta = horizontal
                          ? event.key === "ArrowLeft"
                            ? -0.01
                            : event.key === "ArrowRight"
                              ? 0.01
                              : null
                          : event.key === "ArrowUp"
                            ? -0.01
                            : event.key === "ArrowDown"
                              ? 0.01
                              : null;
                        if (delta === null) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const startCrop = normalizedImageCrop(edit?.sourceCrop);
                        const startRect = currentRectFor(image, edit);
                        const crop = adjustedImageCrop(startCrop, edge, delta);
                        if (sameImageCrop(crop, startCrop)) return;
                        onCrop(
                          image,
                          crop,
                          cropPlacement(startCrop, startRect, crop),
                        );
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className="block rounded-[1px] bg-slate-950 shadow-[0_0_0_1px_white]"
                        style={
                          vertical
                            ? { height: 18, width: 3 }
                            : { height: 3, width: 18 }
                        }
                      />
                    </button>
                  );
                })
              : null}
            {isSelected &&
            !isCropActive &&
            !resizeDisabled &&
            (!image.rotated || rotatedEditable) &&
            onResize
              ? RESIZE_HANDLES.map(({ handle, cx, cy, cursor }) => (
                  <button
                    key={handle}
                    type="button"
                    className={`${gripStyles.grip} absolute z-20 flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
                    style={{
                      cursor,
                      left: `calc(${cx * 100}% - 22px)`,
                      top: `calc(${cy * 100}% - 22px)`,
                    }}
                    aria-label={`${t("pdfViewer.imageEditBoxLabel", {
                      index: image.order + 1,
                    })} resize ${handle}`}
                    data-testid={`pdf-embedded-image-resize-${handle}`}
                    onPointerDown={(event) =>
                      beginResizeGesture(event, image, edit, handle)
                    }
                    onKeyDown={(event) => {
                      if (disabled) return;
                      const dx =
                        event.key === "ArrowLeft"
                          ? -0.01
                          : event.key === "ArrowRight"
                            ? 0.01
                            : 0;
                      const dy =
                        event.key === "ArrowUp"
                          ? -0.01
                          : event.key === "ArrowDown"
                            ? 0.01
                            : 0;
                      if (dx === 0 && dy === 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const startRect = currentRectFor(image, edit);
                      const next = resizeBox(startRect, handle, dx, dy);
                      if (!sameFractionRect(startRect, next)) {
                        onResize(image, next);
                      }
                    }}
                  >
                    {/* The shared Office grip square, centred in the
                        PDF's own 44px target. */}
                    <span
                      aria-hidden="true"
                      className={`block h-2 w-2 ${officeDrawingSelectionStyles.resizeMark}`}
                    />
                  </button>
                ))
              : null}
          </div>
        );
      })}

      {selected && showInlineToolbar ? (
        <div
          data-testid="pdf-embedded-image-toolbar"
          className="absolute z-30 flex items-center gap-1 rounded-md border border-[var(--border)] bg-popover px-1.5 py-1 text-xs text-popover-foreground shadow-md"
          style={{
            left: percent(currentRectFor(selected, selectedEdit).x),
            // Sit just under the image: above it would be off-screen for
            // anything at the top of the page, which figures usually are.
            top: `calc(${percent(
              currentRectFor(selected, selectedEdit).y +
                currentRectFor(selected, selectedEdit).height,
            )} + 6px)`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {selectedEdit ? (
            <button
              type="button"
              className="min-h-11 min-w-11 rounded px-2 py-0.5 hover:bg-[var(--muted)]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={() => onRestore(selected)}
              disabled={disabled}
            >
              {t("pdfViewer.imageEditRestore")}
            </button>
          ) : null}
          <button
            type="button"
            className="min-h-11 min-w-11 rounded px-2 py-0.5 hover:bg-[var(--muted)]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            {t("pdfViewer.imageEditReplace")}
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded px-2 py-0.5 text-[var(--danger)] hover:bg-[var(--muted)]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => {
              onDelete(selected);
              onSelectedOrderChange(null);
            }}
            disabled={disabled}
          >
            {t("pdfViewer.imageEditDelete")}
          </button>
          {selected.rotated && !rotatedEditable ? (
            <span
              className="px-1 text-[var(--muted-foreground)]"
              title={t("pdfViewer.imageEditRotatedHint")}
            >
              {t("pdfViewer.imageEditRotated")}
            </span>
          ) : null}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        data-testid="pdf-embedded-image-file"
        onChange={handleFile}
      />
    </div>
  );
}

export type { EmbeddedImageEdit };
