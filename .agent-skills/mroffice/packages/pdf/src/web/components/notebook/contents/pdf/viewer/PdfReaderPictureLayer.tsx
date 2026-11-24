"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A source picture selected in place on the reading canvas (WPS 图片编辑,
 * wps/image-selected.png): the WPS frame on the picture's own rectangle --
 * it turns with the picture -- with eight grips and a rotation handle, the
 * picture's pixels following the gesture, and the floating vertical tools
 * beside it (收起 · 裁剪 · 替换 · 提取文字 · 编辑 · 完成). While cropping, the
 * frame gives way to the crop edges.
 *
 * The layer lives inside the page, which clips it: a part of the frame that
 * runs past the page is neither drawn nor grabbed, as in WPS. It only
 * reports gestures; the reader turns them into native writes.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  Check,
  Crop,
  Minus,
  Plus,
  Replace,
  RotateCcw,
  RotateCw,
  ScanText,
  SquarePen,
} from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";
import type { PercentBox } from "../../../../../lib/pdf/annotation-transform";
import {
  readerPictureBounds,
  readerPictureBoxFromPercent,
  readerPictureDisplayTransform,
  readerPictureTurn,
  transformReaderPictureFrame,
  type ReaderPictureAffine,
} from "../../../../../lib/pdf/reader-picture-geometry";
import { normalizeRotationDegrees } from "@mrnote/core/web/lib/presentation-drag.ts";

import PdfAnnotationFrame, { WPS_FRAME_COLOR } from "../PdfAnnotationFrame";

export interface PdfReaderPictureLayerLabels {
  readonly frame: string;
  readonly toolbar: string;
  readonly collapse: string;
  readonly expand: string;
  readonly crop: string;
  readonly rotateLeft: string;
  readonly rotateRight: string;
  readonly replace: string;
  readonly extractText: string;
  readonly edit: string;
  readonly done: string;
  readonly applyCrop: string;
  readonly cancelCrop: string;
  readonly cropEdge: string;
}

/** The crop drawn on the frame, in the frame's own fractions. */
export interface PdfReaderPictureCropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The reader's drag stage, bound to this picture: it carries the picture by
 * its own paint (the page split around it), so the picture leaves its place
 * as it moves and what is painted over it stays. `preview` / `turn` answer
 * false when the stage cannot carry it; the layer then carries a copy of the
 * picture's pixels itself.
 */
export interface PdfReaderPictureCarry {
  readonly preview: (preview: PercentBox | null, start: PercentBox) => boolean;
  readonly turn: (turn: number | null, start: PercentBox) => boolean;
  readonly settle: (box: PercentBox, turn?: number) => void;
}

export interface PdfReaderPictureLayerProps {
  /** Logical displayed page size (CSS px before any canvas transform). */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** The frame: the picture's unturned rectangle in page percent. */
  readonly box: PercentBox;
  /** Clockwise angle of the frame, degrees. */
  readonly rotation: number;
  /** A write is saving and a gesture cannot be held for it. */
  readonly busy: boolean;
  /** Writes are refused (read-only); the frame only selects. */
  readonly readOnly: boolean;
  readonly labels: PdfReaderPictureLayerLabels;
  /** The pixels to carry while a gesture runs (cut from the page canvas). */
  readonly captureGhost?: () => HTMLCanvasElement | null;
  /** The reader's stage, carrying an upright picture in its own place in
   * the page's paint (preferred to the copy above). */
  readonly carry?: PdfReaderPictureCarry | null;
  /** Changes when the page shows the written picture: the ghost goes. */
  readonly settledKey: string;
  /** A Picture Format write's drawing, shown filling the frame from the
   * moment it is drawn until the page paints the written picture (a page
   * read again under load took 6-33 s). */
  readonly formatPreview?: HTMLCanvasElement | null;
  /** Where `formatPreview` stands when it is the page around the picture
   * (Transparency, Position) rather than the picture in its frame. */
  readonly formatPreviewBox?: PercentBox | null;
  /** The turn `formatPreview` is drawn at in `formatPreviewBox` (a picture
   * turned past 45 degrees, whose frame is not the box it stands in). */
  readonly formatPreviewTurn?: number;
  readonly cropping: PdfReaderPictureCropRect | null;
  readonly onCropChange: (crop: PdfReaderPictureCropRect) => void;
  readonly onCropApply: () => void;
  readonly onCropCancel: () => void;
  /** A move or resize: the new frame (rotation unchanged). */
  readonly onFrameCommit: (box: PercentBox) => void;
  /** A turn by the handle: the frame's new clockwise angle. */
  readonly onRotateCommit: (rotation: number) => void;
  readonly onDelete: () => void;
  readonly onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  readonly onCrop: () => void;
  /** A quarter turn by the toolbar (WPS Picture Floatbar: Rotate left / right). */
  readonly onRotate: (direction: "left" | "right") => void;
  readonly onReplace: () => void;
  readonly onExtractText: () => void;
  readonly onEdit: () => void;
  /** 编辑 opens a menu of the host's (the shared 校正 gallery): the menu is
   * built around the tool button, which becomes its trigger. */
  readonly editMenu?: (trigger: ReactNode) => ReactNode;
  readonly onDone: () => void;
}

const TOOLBAR_GAP = 10;
const TOOL_SIZE = 30;
const TOOLBAR_HEIGHT = 22 + 7 * TOOL_SIZE + 7 * 6;
const MIN_CROP = 0.04;

/** The ghost canvas: the captured pixels, drawn once. */
const GhostCanvas = memo(function GhostCanvas({
  source,
  style,
}: {
  source: HTMLCanvasElement;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const target = ref.current;
    if (!target) return;
    target.width = source.width;
    target.height = source.height;
    target.getContext("2d")?.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} aria-hidden="true" data-testid="pdf-native-picture-ghost" style={style} />;
});







export function PdfReaderPicturePendingPreview({
  source,
  box,
  turn = 0,
}: {
  source: HTMLCanvasElement;
  box: PercentBox;
  turn?: number;
}) {
  return (
    <div data-pdf-native-picture-pending-preview aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8 }}>
      <GhostCanvas
        source={source}
        style={{
          position: "absolute",
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.width}%`,
          height: `${box.height}%`,
          transform: turn ? `rotate(${turn}deg)` : undefined,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export function PdfReaderPictureLayer({
  pageWidth,
  pageHeight,
  box,
  rotation,
  busy,
  readOnly,
  labels,
  captureGhost,
  carry = null,
  settledKey,
  formatPreview = null,
  formatPreviewBox = null,
  formatPreviewTurn = 0,
  cropping,
  onCropChange,
  onCropApply,
  onCropCancel,
  onFrameCommit,
  onRotateCommit,
  onDelete,
  onContextMenu,
  onCrop,
  onRotate,
  onReplace,
  onExtractText,
  onEdit,
  editMenu,
  onDone,
}: PdfReaderPictureLayerProps) {
  const page = useMemo(() => ({ width: pageWidth, height: pageHeight }), [pageHeight, pageWidth]);
  const [collapsed, setCollapsed] = useState(false);
  // Shift held during a resize keeps the proportions; the frame's gesture
  // math reads it from here (pointer events carry it on every move).
  const keepRatioRef = useRef(false);
  useEffect(() => {
    const track = (event: PointerEvent | KeyboardEvent) => {
      keepRatioRef.current = event.shiftKey;
    };
    window.addEventListener("pointermove", track, true);
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("keydown", track, true);
    window.addEventListener("keyup", track, true);
    return () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("keydown", track, true);
      window.removeEventListener("keyup", track, true);
    };
  }, []);
  const transformBox = useCallback(
    (start: PercentBox, mode: Parameters<typeof transformReaderPictureFrame>[1], dx: number, dy: number) =>
      transformReaderPictureFrame(start, mode, dx, dy, {
        rotation,
        pageWidth,
        pageHeight,
        keepRatio: keepRatioRef.current,
        minSide: 6,
      }),
    [pageHeight, pageWidth, rotation],
  );

  // The picture's pixels following the gesture, then standing at the drop
  // until the page shows the write.
  // A ghost belongs to the page it was cut from (`key`): once the page
  // shows the write (`settledKey` moves on) it is no longer drawn.
  const [ghostState, setGhost] = useState<{
    key: string;
    canvas: HTMLCanvasElement;
    from: { box: PercentBox; rotation: number };
    motion: ReaderPictureAffine | null;
    settled: boolean;
  } | null>(null);
  const ghost = ghostState && ghostState.key === settledKey ? ghostState : null;
  const ghostRef = useRef(ghost);
  useLayoutEffect(() => {
    ghostRef.current = ghost;
  });
  useEffect(() => {
    if (!ghost?.settled) return;
    const timer = window.setTimeout(() => setGhost(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [ghost?.settled]);
  const startGhost = useCallback(
    (from: PercentBox, fromRotation: number) => {
      const current = ghostRef.current;
      if (current && !current.settled) return current;
      const canvas = captureGhost?.() ?? null;
      if (!canvas) return null;
      const next = {
        key: settledKey,
        canvas,
        from: { box: from, rotation: fromRotation },
        motion: null,
        settled: false,
      };
      setGhost(next);
      return next;
    },
    [captureGhost, settledKey],
  );
  const moveGhost = useCallback(
    (toBox: PercentBox, toRotation: number) => {
      setGhost((current) => {
        if (!current) return current;
        const motion = readerPictureDisplayTransform(
          readerPictureBoxFromPercent(current.from.box, current.from.rotation, page),
          readerPictureBoxFromPercent(toBox, toRotation, page),
        );
        return { ...current, motion };
      });
    },
    [page],
  );
  // Whether the gesture in flight is carried by the reader's stage (decided
  // at its first step: an upright picture whose page layers are in hand).
  // The stage moves the picture in the same commit as the frame and takes
  // it out of its old place; the copy below stays at 85% over the original.
  const carriedRef = useRef<boolean | null>(null);
  const carryRef = useRef(carry);
  useLayoutEffect(() => {
    carryRef.current = carry;
  });
  const upright = normalizeRotationDegrees(rotation) === 0;
  // A gesture in flight: the frame moves with it, the on-page outline below
  // (which stands on the committed box) steps aside until it ends.
  const [gesturing, setGesturing] = useState(false);
  const handlePreview = useCallback(
    (preview: PercentBox | null, start: PercentBox) => {
      const stage = carryRef.current;
      setGesturing(preview !== null);
      if (!preview) {
        if (carriedRef.current) stage?.preview(null, start);
        else setGhost((current) => (current && !current.settled ? null : current));
        carriedRef.current = null;
        return;
      }
      if (carriedRef.current === null) {
        carriedRef.current = Boolean(stage && upright && stage.preview(preview, start));
      } else if (carriedRef.current) {
        stage?.preview(preview, start);
      }
      if (carriedRef.current) return;
      if (startGhost(start, rotation)) moveGhost(preview, rotation);
    },
    [moveGhost, rotation, startGhost, upright],
  );
  const handleRotatePreview = useCallback(
    (turn: number | null, start: PercentBox) => {
      const stage = carryRef.current;
      if (turn === null) {
        if (carriedRef.current) stage?.turn(null, start);
        else setGhost((current) => (current && !current.settled ? null : current));
        carriedRef.current = null;
        return;
      }
      // The stage turns the picture by the turn made since the gesture began.
      const made = normalizeRotationDegrees(turn - rotation);
      if (carriedRef.current === null) {
        carriedRef.current = Boolean(stage && upright && stage.turn(made, start));
      } else if (carriedRef.current) {
        stage?.turn(made, start);
      }
      if (carriedRef.current) return;
      if (!startGhost(start, rotation)) return;
      setGhost((current) => {
        if (!current) return current;
        const from = readerPictureBoxFromPercent(current.from.box, current.from.rotation, page);
        return { ...current, motion: readerPictureTurn(from, turn - normalizeRotationDegrees(rotation)) };
      });
    },
    [page, rotation, startGhost, upright],
  );
  const settleGhost = useCallback(() => {
    setGhost((current) => (current ? { ...current, settled: true } : current));
  }, []);
  // Let go: the carried picture waits at the drop (turned by the turn) until
  // the page paints the write, as the frame does.
  const settleCarried = useCallback((box: PercentBox, turn?: number) => {
    if (carriedRef.current) carryRef.current?.settle(box, turn);
  }, []);

  const shownBox = readerPictureBoxFromPercent(box, rotation, page);
  const bounds = readerPictureBounds(shownBox);
  const ghostElement = ghost
    ? (() => {
        const from = readerPictureBoxFromPercent(ghost.from.box, ghost.from.rotation, page);
        const area = readerPictureBounds(from);
        const motion = ghost.motion ?? [1, 0, 0, 1, 0, 0];
        // The CSS transform of an element placed at the start box's corner:
        // the page-space motion seen from that corner.
        const [a, b, c, d, e, f] = motion;
        const tx = a * area.x + c * area.y + e - area.x;
        const ty = b * area.x + d * area.y + f - area.y;
        return (
          <GhostCanvas
            source={ghost.canvas}
            style={{
              position: "absolute",
              left: `${(area.x / page.width) * 100}%`,
              top: `${(area.y / page.height) * 100}%`,
              width: `${(area.width / page.width) * 100}%`,
              height: `${(area.height / page.height) * 100}%`,
              transformOrigin: "0 0",
              transform: `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`,
              opacity: ghost.settled ? 1 : 0.85,
              pointerEvents: "none",
              zIndex: 6,
            }}
          />
        );
      })()
    : null;

  // Tools to the right of the picture, or to its left where the page leaves
  // no room, or over its right edge when neither side has any.
  const toolbarRight = bounds.x + bounds.width + TOOLBAR_GAP;
  const side: "right" | "left" | "inside" =
    toolbarRight + TOOL_SIZE <= page.width
      ? "right"
      : bounds.x - TOOLBAR_GAP - TOOL_SIZE >= 0
        ? "left"
        : "inside";
  const toolbarLeft =
    side === "right"
      ? toolbarRight
      : side === "left"
        ? bounds.x - TOOLBAR_GAP - TOOL_SIZE
        : Math.max(0, Math.min(page.width - TOOL_SIZE, bounds.x + bounds.width - TOOL_SIZE - 6));
  const toolbarTop = Math.max(
    0,
    Math.min(page.height - (collapsed ? 22 : TOOLBAR_HEIGHT), bounds.y),
  );
  const tool = (
    testId: string,
    label: string,
    icon: ReactNode,
    onClick: (() => void) | null,
    disabled = false,
  ) => (
    <button
      key={testId}
      type="button"
      className="pdf-viewer__picture-tool"
      data-label={label}
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(event) => {
        // A menu trigger opens on pointer down; the page must not see it.
        if (onClick) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
  const toolbar = (
    <div
      role="toolbar"
      aria-label={labels.toolbar}
      aria-orientation="vertical"
      className="pdf-viewer__picture-toolbar"
      data-side={side}
      data-testid="pdf-native-picture-toolbar"
      style={{
        left: `${(toolbarLeft / page.width) * 100}%`,
        top: `${(toolbarTop / page.height) * 100}%`,
      }}
    >
      <button
        type="button"
        className="pdf-viewer__picture-tool pdf-viewer__picture-tool--round"
        data-testid="pdf-native-picture-tool-collapse"
        aria-label={collapsed ? labels.expand : labels.collapse}
        aria-expanded={!collapsed}
        title={collapsed ? labels.expand : labels.collapse}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setCollapsed((value) => !value);
        }}
      >
        {collapsed ? <Plus size={14} /> : <Minus size={14} />}
      </button>
      {collapsed
        ? null
        : cropping
          ? [
              tool("pdf-native-picture-tool-crop-apply", labels.applyCrop, <Check size={16} />, onCropApply),
              tool("pdf-native-picture-tool-crop-cancel", labels.cancelCrop, <Minus size={16} />, onCropCancel),
            ]
          : [
              tool("pdf-native-picture-tool-crop", labels.crop, <Crop size={16} />, onCrop, readOnly),
              tool("pdf-native-picture-tool-rotate-left", labels.rotateLeft, <RotateCcw size={16} />, () => onRotate("left"), readOnly),
              tool("pdf-native-picture-tool-rotate-right", labels.rotateRight, <RotateCw size={16} />, () => onRotate("right"), readOnly),
              tool("pdf-native-picture-tool-replace", labels.replace, <Replace size={16} />, onReplace, readOnly),
              tool("pdf-native-picture-tool-extract-text", labels.extractText, <ScanText size={16} />, onExtractText),
              editMenu && !readOnly ? (
                <span key="pdf-native-picture-tool-edit" style={{ display: "contents" }}>
                  {editMenu(
                    tool("pdf-native-picture-tool-edit", labels.edit, <SquarePen size={16} />, null),
                  )}
                </span>
              ) : (
                tool("pdf-native-picture-tool-edit", labels.edit, <SquarePen size={16} />, onEdit, readOnly)
              ),
              tool("pdf-native-picture-tool-done", labels.done, <Check size={16} />, onDone),
            ]}
    </div>
  );

  // A picture reaching past the page (a poster's photo bled off every edge)
  // has its frame and grips cut by the page, and was selected with nothing
  
  const onPage = {
    left: Math.max(0, bounds.x),
    top: Math.max(0, bounds.y),
    right: Math.min(page.width, bounds.x + bounds.width),
    bottom: Math.min(page.height, bounds.y + bounds.height),
  };
  const overhangs = !cropping && !gesturing && !ghost && onPage.right > onPage.left && onPage.bottom > onPage.top && (
    onPage.left > bounds.x + 0.5 || onPage.top > bounds.y + 0.5 ||
    onPage.right < bounds.x + bounds.width - 0.5 || onPage.bottom < bounds.y + bounds.height - 0.5);
  const onPageOutline = overhangs ? (
    <div
      aria-hidden="true"
      data-testid="pdf-native-picture-on-page"
      style={{
        position: "absolute",
        left: `${(onPage.left / page.width) * 100}%`,
        top: `${(onPage.top / page.height) * 100}%`,
        width: `${((onPage.right - onPage.left) / page.width) * 100}%`,
        height: `${((onPage.bottom - onPage.top) / page.height) * 100}%`,
        boxSizing: "border-box",
        border: `2px solid ${WPS_FRAME_COLOR}`,
        pointerEvents: "none",
      }}
    />
  ) : null;

  return (
    <div
      data-pdf-native-picture-layer
      data-testid="pdf-native-picture-layer"
      // Over the reader's drag stage (7), which carries the picture while
      // its frame is dragged.
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8 }}
      onContextMenu={(event) => {
        if (!(event.target as Element | null)?.closest?.("[data-pdf-native-picture-hit]")) return;
        onContextMenu(event);
      }}
    >
      {ghostElement}
      {formatPreview && !ghost ? (
        <GhostCanvas
          source={formatPreview}
          style={{
            position: "absolute",
            left: `${(formatPreviewBox ?? box).x}%`,
            top: `${(formatPreviewBox ?? box).y}%`,
            width: `${(formatPreviewBox ?? box).width}%`,
            height: `${(formatPreviewBox ?? box).height}%`,
            transform: formatPreviewBox
              ? formatPreviewTurn ? `rotate(${formatPreviewTurn}deg)` : undefined
              : rotation ? `rotate(${rotation}deg)` : undefined,
            pointerEvents: "none",
            zIndex: 6,
          }}
        />
      ) : null}
      {onPageOutline}
      {cropping ? (
        <PdfReaderPictureCrop
          box={box}
          rotation={rotation}
          crop={cropping}
          label={labels.cropEdge}
          onChange={onCropChange}
          onApply={onCropApply}
          onCancel={onCropCancel}
        />
      ) : (
        <div data-pdf-native-picture-hit style={{ display: "contents" }}>
          <PdfAnnotationFrame
            rect={box}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            minWidth={0.1}
            minHeight={0.1}
            resizable={!readOnly}
            busy={busy}
            rotation={rotation}
            transformBox={transformBox}
            gripStyle="wps"
            onPreview={readOnly ? undefined : handlePreview}
            onCommit={(next) => {
              if (readOnly) return;
              settleGhost();
              settleCarried(next);
              onFrameCommit(next);
            }}
            onRotatePreview={readOnly ? undefined : handleRotatePreview}
            onRotate={
              readOnly
                ? undefined
                : (next) => {
                    settleGhost();
                    settleCarried(box, normalizeRotationDegrees(next - rotation));
                    onRotateCommit(next);
                  }
            }
            onDelete={onDelete}
            showDelete={!readOnly}
            autoFocus
            testId="pdf-native-picture-frame"
          />
        </div>
      )}
      {toolbar}
    </div>
  );
}

/** The crop edges on the picture's frame (Office's black crop marks), the
 * part cut away dimmed; Enter or ✓ applies, Escape cancels. */
function PdfReaderPictureCrop({
  box,
  rotation,
  crop,
  label,
  onChange,
  onApply,
  onCancel,
}: {
  box: PercentBox;
  rotation: number;
  crop: PdfReaderPictureCropRect;
  label: string;
  onChange: (crop: PdfReaderPictureCropRect) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);
  const begin = (
    event: ReactPointerEvent<HTMLElement>,
    edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean },
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pageElement = containerRef.current?.closest<HTMLElement>(".pdf-viewer__page");
    const rendered = pageElement?.getBoundingClientRect();
    if (!rendered || rendered.width <= 0 || rendered.height <= 0) return;
    const boxWidthPx = (box.width / 100) * rendered.width;
    const boxHeightPx = (box.height / 100) * rendered.height;
    if (!(boxWidthPx > 0) || !(boxHeightPx > 0)) return;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = crop;
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      // Into the frame's own axes, then fractions of its sides.
      const fx = (dx * cos + dy * sin) / boxWidthPx;
      const fy = (-dx * sin + dy * cos) / boxHeightPx;
      let left = start.x;
      let right = start.x + start.width;
      let top = start.y;
      let bottom = start.y + start.height;
      if (edges.left) left = Math.min(right - MIN_CROP, Math.max(0, start.x + fx));
      if (edges.right) right = Math.max(left + MIN_CROP, Math.min(1, start.x + start.width + fx));
      if (edges.top) top = Math.min(bottom - MIN_CROP, Math.max(0, start.y + fy));
      if (edges.bottom) bottom = Math.max(top + MIN_CROP, Math.min(1, start.y + start.height + fy));
      onChange({ x: left, y: top, width: right - left, height: bottom - top });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const handle = (
    key: string,
    style: CSSProperties,
    edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean },
    cursor: string,
  ) => (
    <div
      key={key}
      className="pdf-viewer__picture-crop-handle"
      data-testid={`pdf-native-picture-crop-${key}`}
      aria-label={label}
      role="presentation"
      style={{ ...style, cursor }}
      onPointerDown={(event) => begin(event, edges)}
    />
  );
  const left = crop.x * 100;
  const top = crop.y * 100;
  const right = (crop.x + crop.width) * 100;
  const bottom = (crop.y + crop.height) * 100;
  const dim = "rgba(15, 23, 42, 0.45)";
  const bar = 14;
  const thick = 4;
  return (
    <div
      ref={containerRef}
      data-testid="pdf-native-picture-crop"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onApply();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      style={{
        position: "absolute",
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
        outline: "1px dashed #8b8b8b",
        pointerEvents: "auto",
        zIndex: 8,
      }}
    >
      {/* What the crop cuts away, dimmed. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: `${top}%`, background: dim }} />
      <div style={{ position: "absolute", left: 0, top: `${bottom}%`, width: "100%", height: `${100 - bottom}%`, background: dim }} />
      <div style={{ position: "absolute", left: 0, top: `${top}%`, width: `${left}%`, height: `${bottom - top}%`, background: dim }} />
      <div style={{ position: "absolute", left: `${right}%`, top: `${top}%`, width: `${100 - right}%`, height: `${bottom - top}%`, background: dim }} />
      <div
        style={{
          position: "absolute",
          left: `${left}%`,
          top: `${top}%`,
          width: `${right - left}%`,
          height: `${bottom - top}%`,
          outline: "1px solid #fff",
          boxShadow: "0 0 0 1px #1f2328",
          pointerEvents: "none",
        }}
      />
      {handle("left", { left: `calc(${left}% - ${thick / 2}px)`, top: `calc(${(top + bottom) / 2}% - ${bar / 2}px)`, width: thick, height: bar }, { left: true }, "ew-resize")}
      {handle("right", { left: `calc(${right}% - ${thick / 2}px)`, top: `calc(${(top + bottom) / 2}% - ${bar / 2}px)`, width: thick, height: bar }, { right: true }, "ew-resize")}
      {handle("top", { left: `calc(${(left + right) / 2}% - ${bar / 2}px)`, top: `calc(${top}% - ${thick / 2}px)`, width: bar, height: thick }, { top: true }, "ns-resize")}
      {handle("bottom", { left: `calc(${(left + right) / 2}% - ${bar / 2}px)`, top: `calc(${bottom}% - ${thick / 2}px)`, width: bar, height: thick }, { bottom: true }, "ns-resize")}
      {handle("top-left", { left: `calc(${left}% - ${thick / 2}px)`, top: `calc(${top}% - ${thick / 2}px)`, width: bar / 2 + thick, height: bar / 2 + thick }, { left: true, top: true }, "nwse-resize")}
      {handle("top-right", { left: `calc(${right}% - ${bar / 2 + thick / 2}px)`, top: `calc(${top}% - ${thick / 2}px)`, width: bar / 2 + thick, height: bar / 2 + thick }, { right: true, top: true }, "nesw-resize")}
      {handle("bottom-left", { left: `calc(${left}% - ${thick / 2}px)`, top: `calc(${bottom}% - ${bar / 2 + thick / 2}px)`, width: bar / 2 + thick, height: bar / 2 + thick }, { left: true, bottom: true }, "nesw-resize")}
      {handle("bottom-right", { left: `calc(${right}% - ${bar / 2 + thick / 2}px)`, top: `calc(${bottom}% - ${bar / 2 + thick / 2}px)`, width: bar / 2 + thick, height: bar / 2 + thick }, { right: true, bottom: true }, "nwse-resize")}
    </div>
  );
}
