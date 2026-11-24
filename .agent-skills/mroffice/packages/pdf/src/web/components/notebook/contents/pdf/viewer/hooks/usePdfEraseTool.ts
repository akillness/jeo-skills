/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isTypingTarget } from "../../../../../../lib/pdf/keyboard-nav";
import {
  PDF_ERASE_AUTOMATIC_COVER_COLOR,
  PDF_ERASE_DEFAULT_BRUSH_WIDTH,
  normalizePdfEraseRect,
  samplePdfEraseAutoColor,
  thinPdfEraseBrushPoints,
  type PdfEraseBrushWidth,
  type PdfEraseDisplaySize,
  type PdfEraseOutcome,
  type PdfErasePoint,
  type PdfEraseRect,
  type PdfEraseShape,
  type PdfEraseStroke,
  type PdfEraseTargets,
} from "../../../../../../lib/pdf/page-erase";

/** The stroke being drawn, before it is a colour on the page. */
export type PdfEraseDraft =
  | Readonly<{
      shape: "rect";
      page: number;
      start: PdfErasePoint;
      current: PdfErasePoint;
    }>
  | Readonly<{ shape: "brush"; page: number; points: readonly PdfErasePoint[] }>;

/** A stroke's geometry; the colour is settled when it is painted. */
type PdfEraseGeometry =
  | Omit<Extract<PdfEraseStroke, { shape: "rect" }>, "color">
  | Omit<Extract<PdfEraseStroke, { shape: "brush" }>, "color">;

/** What the page layer needs to draw and drive the eraser. */
export interface PdfEraseToolView {
  readonly armed: boolean;
  readonly shape: PdfEraseShape;
  readonly brushWidth: PdfEraseBrushWidth;
  /** The colour the live stroke is drawn in (the sampled one for 自动). */
  readonly previewColor: string | null;
  readonly draft: PdfEraseDraft | null;
  /** Strokes written or being written, held over the page until it repaints. */
  readonly pending: readonly PdfEraseStroke[];
  readonly handlePointerDown: (
    page: number,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  readonly handlePointerMove: (
    page: number,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  readonly finish: (page: number, event: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface UsePdfEraseToolOptions {
  /** The host writes erase strokes and the document is open. */
  readonly writable: boolean;
  readonly onEraseRegion?: (
    stroke: PdfEraseStroke,
  ) => Promise<boolean | PdfEraseOutcome> | boolean | PdfEraseOutcome;
  /** What a rectangle holds (WPS 擦除 takes it off the page); null when the
   * page cannot be read, and the rectangle only covers. */
  readonly readTargets?: (
    page: number,
    rect: PdfEraseRect,
  ) => Promise<PdfEraseTargets | null>;
  /** Part of a rectangle was covered, not erased (「存在无法擦除内容」). */
  readonly onCovered?: () => void;
  readonly pointerToPagePercent: (
    wrapper: HTMLDivElement,
    event: { clientX: number; clientY: number },
  ) => PdfErasePoint | null;
  readonly readPageCanvas: (page: number) => HTMLCanvasElement | null;
  readonly readDisplaySize: (page: number) => PdfEraseDisplaySize | null;
  /** Say why a stroke was not painted (a toast). */
  readonly onRefused: (message: string) => void;
  readonly messages: Readonly<{
    autoColorUnreadable: string;
    failed: string;
  }>;
}

/** How long a written stroke stays drawn over the page while it repaints. */
const PENDING_HOLD_AFTER_WRITE_MS = 900;

/**
 * WPS 擦除 on the reader: a rectangle drag erases what it holds (the host
 * takes text and pictures off the page and covers the rest, 自动 in white);
 * a freehand brush covers in the chosen colour (or the page's own, 自动).
 * Each stroke is handed to the host as one step, strictly one after another.
 */
export function usePdfEraseTool({
  writable,
  onEraseRegion,
  readTargets,
  onCovered,
  pointerToPagePercent,
  readPageCanvas,
  readDisplaySize,
  onRefused,
  messages,
}: UsePdfEraseToolOptions) {
  const [armed, setArmed] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [shape, setShape] = useState<PdfEraseShape>("rect");
  const [brushWidth, setBrushWidth] = useState<PdfEraseBrushWidth>(
    PDF_ERASE_DEFAULT_BRUSH_WIDTH,
  );
  const [draft, setDraft] = useState<PdfEraseDraft | null>(null);
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [pending, setPending] = useState<readonly PdfEraseStroke[]>([]);
  const dragRef = useRef<
    | (PdfEraseDraft & { pointerId: number })
    | null
  >(null);
  // Strokes are written one after another: the next one starts from the
  // revision the previous one produced.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const disarm = useCallback(() => {
    setArmed(false);
    dragRef.current = null;
    setDraft(null);
  }, []);
  const arm = useCallback(() => setArmed(true), []);

  // A host that stops offering the writer puts the tool away (adjusted
  // while rendering, as React prescribes for state that follows a prop). A
  // document that only stops taking writes for a moment does not: the
  // stroke itself waits, or says why it was not painted.
  const hasWriter = Boolean(onEraseRegion);
  const [writerOffered, setWriterOffered] = useState(hasWriter);
  if (writerOffered !== hasWriter) {
    setWriterOffered(hasWriter);
    if (!hasWriter) {
      setArmed(false);
      setDraft(null);
    }
  }

  // Escape puts the tool away (a stroke in progress is dropped).
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTypingTarget(event.target)) return;
      disarm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [armed, disarm]);

  const sampleStartColor = useCallback(
    (page: number, point: PdfErasePoint): string | null => {
      if (color) return color;
      if (shape === "rect") return PDF_ERASE_AUTOMATIC_COVER_COLOR;
      const size = readDisplaySize(page);
      if (!size) return null;
      // A small square around the press: enough to see the page's colour
      // past the edge of a letter.
      const half = 1.2;
      return samplePdfEraseAutoColor(
        readPageCanvas(page),
        {
          shape: "rect",
          page,
          color: "#000000",
          rect: {
            x1: Math.max(0, point.x - half),
            y1: Math.max(0, point.y - half),
            x2: Math.min(100, point.x + half),
            y2: Math.min(100, point.y + half),
          },
        },
        size,
      );
    },
    [color, readDisplaySize, readPageCanvas, shape],
  );

  const commit = useCallback(
    (stroke: PdfEraseGeometry) => {
      const write = onEraseRegion;
      if (!write) return;
      const size = readDisplaySize(stroke.page);
      const resolved =
        color ??
        (stroke.shape === "rect"
          ? PDF_ERASE_AUTOMATIC_COVER_COLOR
          : size
            ? samplePdfEraseAutoColor(
                readPageCanvas(stroke.page),
                { ...stroke, color: "#000000" } as PdfEraseStroke,
                size,
              )
            : null);
      if (!resolved) {
        onRefused(messages.autoColorUnreadable);
        return;
      }
      const painted = { ...stroke, color: resolved } as PdfEraseStroke;
      setPending((current) => [...current, painted]);
      const release = (delay: number) => {
        const drop = () => {
          if (!mountedRef.current) return;
          setPending((current) => current.filter((entry) => entry !== painted));
        };
        if (delay > 0) window.setTimeout(drop, delay);
        else drop();
      };
      queueRef.current = queueRef.current.then(async () => {
        try {
          // A rectangle is read when its turn comes: the strokes before it
          // have changed the page it reads.
          const targets =
            painted.shape === "rect" && readTargets
              ? await readTargets(painted.page, painted.rect).catch(() => null)
              : null;
          const outcome = await write(
            targets && painted.shape === "rect" ? { ...painted, targets } : painted,
          );
          const written = typeof outcome === "object" ? outcome.written : outcome;
          if (written === false) {
            release(0);
            onRefused(messages.failed);
            return;
          }
          release(PENDING_HOLD_AFTER_WRITE_MS);
          if (typeof outcome === "object" && outcome.covered) onCovered?.();
        } catch (error) {
          release(0);
          onRefused(
            error instanceof Error && error.message
              ? error.message
              : messages.failed,
          );
        }
      });
    },
    [
      color,
      messages.autoColorUnreadable,
      messages.failed,
      onCovered,
      onEraseRegion,
      onRefused,
      readDisplaySize,
      readPageCanvas,
      readTargets,
    ],
  );

  const handlePointerDown = useCallback(
    (page: number, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!armed || !writable || !onEraseRegion) return;
      if (event.button !== 0) return;
      const wrapper = event.currentTarget;
      const point = pointerToPagePercent(wrapper, event);
      if (!point) return;
      event.preventDefault();
      try {
        wrapper.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
      setPreviewColor(sampleStartColor(page, point));
      const next: PdfEraseDraft =
        shape === "rect"
          ? { shape: "rect", page, start: point, current: point }
          : { shape: "brush", page, points: [point] };
      dragRef.current = { ...next, pointerId: event.pointerId };
      setDraft(next);
    },
    [armed, onEraseRegion, pointerToPagePercent, sampleStartColor, shape, writable],
  );

  const handlePointerMove = useCallback(
    (page: number, event: ReactPointerEvent<HTMLDivElement>) => {
      const active = dragRef.current;
      if (!active || active.page !== page || active.pointerId !== event.pointerId) {
        return;
      }
      const wrapper = event.currentTarget;
      const samples =
        typeof event.nativeEvent.getCoalescedEvents === "function" &&
        active.shape === "brush"
          ? event.nativeEvent.getCoalescedEvents()
          : [event.nativeEvent];
      const points = samples
        .map((sample) => pointerToPagePercent(wrapper, sample))
        .filter((point): point is PdfErasePoint => point !== null);
      if (points.length === 0) return;
      event.preventDefault();
      const next: PdfEraseDraft =
        active.shape === "rect"
          ? {
              shape: "rect",
              page,
              start: active.start,
              current: points[points.length - 1],
            }
          : { shape: "brush", page, points: [...active.points, ...points] };
      dragRef.current = { ...next, pointerId: active.pointerId };
      setDraft(next);
    },
    [pointerToPagePercent],
  );

  const finish = useCallback(
    (page: number, event: ReactPointerEvent<HTMLDivElement>) => {
      const active = dragRef.current;
      if (!active || active.page !== page || active.pointerId !== event.pointerId) {
        return;
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* best-effort */
      }
      dragRef.current = null;
      setDraft(null);
      // The browser took the pointer (a scroll, a pinch): nothing is painted.
      if (event.type === "pointercancel") return;
      if (active.shape === "rect") {
        const rect = normalizePdfEraseRect(active.start, active.current);
        if (!rect) return;
        commit({ shape: "rect", page, rect });
        return;
      }
      const points = thinPdfEraseBrushPoints(active.points);
      if (points.length === 0) return;
      commit({ shape: "brush", page, points, width: brushWidth });
    },
    [brushWidth, commit],
  );

  const view: PdfEraseToolView = {
    armed,
    shape,
    brushWidth,
    previewColor: color ?? previewColor,
    draft,
    pending,
    handlePointerDown,
    handlePointerMove,
    finish,
  };

  return {
    view,
    armed,
    color,
    shape,
    brushWidth,
    arm,
    disarm,
    setColor,
    setShape,
    setBrushWidth,
  };
}
