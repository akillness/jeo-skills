"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useTranslations } from "@mrnote/core/host/next-intl.tsx";
import {
  Eraser,
  Highlighter,
  Pencil,
  Redo2,
  Trash2,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import { OfficeDialogShell } from "@mrnote/core/web/components/office-ribbon/OfficeDialogShell.tsx";
import { officeDialogParts as parts } from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";
import { tryCapturePointer } from "@mrnote/core/web/components/console/editor/native-document/pointerCapture.ts";

export type DocumentPictureDrawMime = "image/png" | "image/jpeg" | "image/webp";

type DrawTool = "pen" | "highlighter" | "eraser";

interface DrawPoint {
  readonly x: number;
  readonly y: number;
}

interface DrawStroke {
  readonly tool: DrawTool;
  readonly color: string;
  readonly widthPx: number;
  readonly points: readonly DrawPoint[];
}

export interface DocumentPictureDrawDialogProps {
  readonly open: boolean;
  readonly canEdit: boolean;
  readonly source: string;
  readonly mimeType: DocumentPictureDrawMime;
  readonly locale: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onApply: (source: string) => boolean;
  readonly onClose: () => void;
}

const DRAW_COLORS = ["#dc2626", "#2563eb", "#111827", "#f59e0b"] as const;
const MAX_DRAWING_PIXELS = 24_000_000;
const MAX_DRAWING_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_STROKES = 500;
const MAX_POINTS_PER_STROKE = 4_000;

export function DocumentPictureDrawIcon({
  size = 24,
}: {
  readonly size?: number;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="docs-home-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect
        className="docs-home-icon__paper"
        x="2.8"
        y="4"
        width="16"
        height="14"
        rx="1.4"
      />
      <circle className="docs-home-icon__warm-fill" cx="7.2" cy="8.2" r="1.4" />
      <path
        className="docs-home-icon__accent-soft-fill"
        d="m4.5 16 4.1-4.2 2.8 2.5 2.2-2 3.5 3.7z"
      />
      <path
        className="docs-home-icon__ink-soft"
        d="m4.5 16 4.1-4.2 2.8 2.5 2.2-2 3.5 3.7"
      />
      <path
        className="docs-home-icon__accent"
        d="m15.2 18.7 4.9-4.9 1.6 1.6-4.9 4.9-2.3.7z"
      />
      <path
        className="docs-home-icon__accent-fill"
        d="m20.1 13.8.8-.8 1.6 1.6-.8.8z"
      />
    </svg>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function base64DataUrlBytes(value: string): number | null {
  const comma = value.indexOf(",");
  if (comma < 0 || !value.slice(0, comma).endsWith(";base64")) return null;
  const payload = value.slice(comma + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawStroke,
): void {
  const first = stroke.points[0];
  if (!first) return;
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  context.globalAlpha = stroke.tool === "highlighter" ? 0.32 : 1;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.widthPx;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(first.x, first.y, stroke.widthPx / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  context.restore();
}

function redrawInk(
  canvas: HTMLCanvasElement | null,
  strokes: readonly DrawStroke[],
  activeStroke: DrawStroke | null = null,
): void {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) paintStroke(context, stroke);
  if (activeStroke) paintStroke(context, activeStroke);
}








export function containedCanvasRect(
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const scale = Math.min(bounds.width / width, bounds.height / height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return {
    left: bounds.left + (bounds.width - drawnWidth) / 2,
    top: bounds.top + (bounds.height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  };
}

function pointFromPointer(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
): DrawPoint | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const rect = containedCanvasRect(bounds, canvas.width, canvas.height);
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
  };
}

export function DocumentPictureDrawDialog({
  open,
  canEdit,
  source,
  mimeType,
  returnFocusRef,
  onApply,
  onClose,
}: DocumentPictureDrawDialogProps): React.JSX.Element {
  const t = useTranslations("console-notebooks");
  const copy = useMemo(
    () => ({
      title: t("toolbar.pictureDrawDialog.title"),
      description: t("toolbar.pictureDrawDialog.description"),
      pen: t("toolbar.pictureDrawDialog.pen"),
      highlighter: t("toolbar.pictureDrawDialog.highlighter"),
      eraser: t("toolbar.pictureDrawDialog.eraser"),
      width: t("toolbar.pictureDrawDialog.width"),
      undoStroke: t("toolbar.pictureDrawDialog.undoStroke"),
      clear: t("toolbar.pictureDrawDialog.clear"),
      canvas: t("toolbar.pictureDrawDialog.canvas"),
      apply: t("toolbar.pictureDrawDialog.apply"),
      cancel: t("toolbar.pictureDrawDialog.cancel"),
      loadError: t("toolbar.pictureDrawDialog.loadError"),
      tooLarge: t("toolbar.pictureDrawDialog.tooLarge"),
      stale: t("toolbar.pictureDrawDialog.stale"),
    }),
    [t],
  );
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<(typeof DRAW_COLORS)[number]>(
    DRAW_COLORS[0],
  );
  const [width, setWidth] = useState(5);
  const [strokes, setStrokes] = useState<readonly DrawStroke[]>([]);
  const [dimensions, setDimensions] = useState<{
    readonly width: number;
    readonly height: number;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;

    const image = new Image();
    image.onload = () => {
      if (!live) return;
      const widthPx = image.naturalWidth;
      const heightPx = image.naturalHeight;
      if (
        !Number.isInteger(widthPx) ||
        !Number.isInteger(heightPx) ||
        widthPx <= 0 ||
        heightPx <= 0 ||
        widthPx * heightPx > MAX_DRAWING_PIXELS
      ) {
        setError(copy.tooLarge);
        return;
      }
      const imageCanvas = imageCanvasRef.current;
      const inkCanvas = inkCanvasRef.current;
      const imageContext = imageCanvas?.getContext("2d");
      if (!imageCanvas || !inkCanvas || !imageContext) {
        setError(copy.loadError);
        return;
      }
      imageCanvas.width = widthPx;
      imageCanvas.height = heightPx;
      inkCanvas.width = widthPx;
      inkCanvas.height = heightPx;
      imageContext.clearRect(0, 0, widthPx, heightPx);
      imageContext.drawImage(image, 0, 0, widthPx, heightPx);
      setDimensions({ width: widthPx, height: heightPx });
      setReady(true);
    };
    image.onerror = () => {
      if (live) setError(copy.loadError);
    };
    image.src = source;
    return () => {
      live = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [copy.loadError, copy.tooLarge, open, source]);

  useEffect(() => {
    redrawInk(inkCanvasRef.current, strokes, activeStrokeRef.current);
  }, [strokes]);

  const beginStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (
        !ready ||
        !canEdit ||
        (typeof event.button === "number" && event.button !== 0)
      ) {
        return;
      }
      const point = pointFromPointer(event.currentTarget, event);
      if (!point) return;
      event.preventDefault();
      tryCapturePointer(event.currentTarget, event.pointerId);
      const bounds = event.currentTarget.getBoundingClientRect();
      const scale = Math.max(
        event.currentTarget.width / bounds.width,
        event.currentTarget.height / bounds.height,
      );
      activeStrokeRef.current = {
        tool,
        color,
        widthPx:
          width *
          scale *
          (tool === "highlighter" ? 2.5 : tool === "eraser" ? 2 : 1),
        points: [point],
      };
      redrawInk(event.currentTarget, strokes, activeStrokeRef.current);
    },
    [canEdit, color, ready, strokes, tool, width],
  );

  const continueStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const active = activeStrokeRef.current;
      if (!active || !canEdit) return;
      const point = pointFromPointer(event.currentTarget, event);
      if (!point || active.points.length >= MAX_POINTS_PER_STROKE) return;
      event.preventDefault();
      activeStrokeRef.current = {
        ...active,
        points: [...active.points, point],
      };
      redrawInk(event.currentTarget, strokes, activeStrokeRef.current);
    },
    [canEdit, strokes],
  );

  const finishStroke = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const active = activeStrokeRef.current;
      if (!active) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      activeStrokeRef.current = null;
      setStrokes((current) => [...current, active].slice(-MAX_STROKES));
    },
    [],
  );

  const apply = () => {
    if (!canEdit || !ready || strokes.length === 0 || !dimensions) return;
    const imageCanvas = imageCanvasRef.current;
    const inkCanvas = inkCanvasRef.current;
    if (!imageCanvas || !inkCanvas) return;
    const output = document.createElement("canvas");
    output.width = dimensions.width;
    output.height = dimensions.height;
    const context = output.getContext("2d");
    if (!context) {
      setError(copy.loadError);
      return;
    }
    context.drawImage(imageCanvas, 0, 0);
    context.drawImage(inkCanvas, 0, 0);
    let nextSource = "";
    try {
      nextSource = output.toDataURL(
        mimeType,
        mimeType === "image/jpeg" ? 0.94 : undefined,
      );
    } catch {
      setError(copy.loadError);
      return;
    }
    const outputBytes = base64DataUrlBytes(nextSource);
    if (
      !nextSource.startsWith(`data:${mimeType};base64,`) ||
      outputBytes === null ||
      outputBytes <= 0 ||
      outputBytes > MAX_DRAWING_OUTPUT_BYTES
    ) {
      setError(
        outputBytes && outputBytes > MAX_DRAWING_OUTPUT_BYTES
          ? copy.tooLarge
          : copy.loadError,
      );
      return;
    }
    if (onApply(nextSource)) {
      onClose();
    } else {
      setError(copy.stale);
    }
  };

  const toolButton = (id: DrawTool, label: string, Icon: typeof Pencil) => (
    <button
      ref={id === "pen" ? initialFocusRef : undefined}
      type="button"
      className={parts.button}
      aria-pressed={tool === id}
      data-testid={`document-picture-draw-tool-${id}`}
      disabled={!canEdit || !ready}
      onClick={() => setTool(id)}
    >
      <Icon size={18} aria-hidden />
      {label}
    </button>
  );
  const visibleError = error ?? (!canEdit ? copy.stale : null);

  return (
    <OfficeDialogShell
      open={open}
      title={copy.title}
      description={copy.description}
      defaultActionLabel={copy.apply}
      cancelActionLabel={copy.cancel}
      defaultActionDisabled={!canEdit || !ready || strokes.length === 0}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      onDefaultAction={apply}
      onCancel={onClose}
      className="sm:max-w-[820px]"
      testIdPrefix="document-picture-draw"
    >
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label={copy.title}
      >
        {toolButton("pen", copy.pen, Pencil)}
        {toolButton("highlighter", copy.highlighter, Highlighter)}
        {toolButton("eraser", copy.eraser, Eraser)}
        {DRAW_COLORS.map((value) => (
          <button
            key={value}
            type="button"
            className={parts.iconButton}
            aria-label={value}
            aria-pressed={color === value}
            data-testid={`document-picture-draw-color-${value.slice(1)}`}
            disabled={!canEdit || !ready || tool === "eraser"}
            data-chrome-preview=""
            style={{
              backgroundColor: value,
              boxShadow:
                color === value
                  ? "0 0 0 2px var(--office-dialog-surface), 0 0 0 4px var(--office-dialog-accent)"
                  : undefined,
            }}
            onClick={() => setColor(value)}
          />
        ))}
        <label className={`${parts.field} ml-auto min-w-36`}>
          <span className={parts.label}>{copy.width}</span>
          <input
            type="range"
            min={2}
            max={18}
            value={width}
            data-testid="document-picture-draw-width"
            disabled={!canEdit || !ready}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className={parts.iconButton}
          aria-label={copy.undoStroke}
          title={copy.undoStroke}
          data-testid="document-picture-draw-undo-stroke"
          disabled={!canEdit || strokes.length === 0}
          onClick={() => setStrokes((current) => current.slice(0, -1))}
        >
          <Redo2 size={18} className="-scale-x-100" aria-hidden />
        </button>
        <button
          type="button"
          className={parts.iconButton}
          aria-label={copy.clear}
          title={copy.clear}
          data-testid="document-picture-draw-clear"
          disabled={!canEdit || strokes.length === 0}
          onClick={() => setStrokes([])}
        >
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      <div
        className={`${parts.well} relative mx-auto w-full overflow-hidden`}
        style={{
          aspectRatio: dimensions
            ? `${dimensions.width} / ${dimensions.height}`
            : "16 / 9",
          maxHeight: 480,
        }}
      >
        <canvas
          ref={imageCanvasRef}
          className="absolute inset-0 h-full w-full object-contain"
          aria-hidden="true"
        />
        <canvas
          ref={inkCanvasRef}
          className="absolute inset-0 h-full w-full object-contain cursor-crosshair touch-none"
          role="img"
          aria-label={copy.canvas}
          tabIndex={ready ? 0 : -1}
          data-testid="document-picture-draw-canvas"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>
      {visibleError ? (
        <p role="alert" className={parts.error}>
          {visibleError}
        </p>
      ) : null}
    </OfficeDialogShell>
  );
}

export default DocumentPictureDrawDialog;
