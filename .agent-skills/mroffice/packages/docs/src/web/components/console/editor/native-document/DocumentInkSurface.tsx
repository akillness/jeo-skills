"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Draw tab's drawing surface over the pages: while Draw or an eraser is
 * armed it covers the mounted page sheets, takes the pointer, previews the
 * gesture and hands the finished gesture to the Draw tab. The worksheet has
 * the same surface over its grid (`spreadsheet-draw-surface`); this one lives
 * in the page column with the sheets, so it scrolls, zooms and clips with
 * them and stacks under the window's ribbon: only the pages are the canvas.
 */

import { ptToPx } from "@mrnote/core/web/lib/office-units.ts";
import type { InkPresenceStroke } from "@mrnote/core/web/lib/collab/ink-presence.ts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

import {
  documentInkEffectPaint,
  documentInkEraserRadiusPx,
  documentInkStrokeOpacity,
  documentInkPencilFilter,
  documentInkEraserCut,
  documentInkPencilRegionFor,
  documentInkStrokeAttrs,
  type DocumentInkEraser,
  type DocumentInkPreset,
  type DocumentInkStrokePiece,
} from "@mrnote/core/web/lib/document-ink.ts";
import { inkPathIdsHitByEraser, inkPathIdsInLasso } from "@mrnote/core/web/lib/presentation-annotation.ts";
import {
  inkAcceptsPointer,
  installPenInkTouchGuard,
  useDrawWithTouch,
} from "@mrnote/core/web/lib/draw-with-touch.ts";
import {
  INK_STROKE_SILENCE_MS,
  inkPointerArbiter,
  inkPointerSamples,
  inkPredictedSamples,
  inkSamplePressure,
  watchPenHover,
} from "@mrnote/core/web/lib/ink-pointer-policy.ts";
import {
  OFFICE_WET_INK_FLUSH_EVENT,
  WET_INK_HOVER_RETRY_MS,
  wetInkMaxStrokes,
  wetInkSettleMs,
  wetInkWaitsForPen,
} from "@mrnote/core/web/lib/office-wet-ink.ts";
import { useInkTouchShield } from "@mrnote/core/web/lib/ink-touch-shield.ts";
import { useWetInkLayer, wetInkSvgElement, type WetInkPainter } from "@mrnote/core/web/lib/office-wet-ink-layer.ts";
import { pencilScribblePossible, useInkScribbleGuard } from "@mrnote/core/web/lib/ink-scribble-guard.ts";
import { INK_LIVE_PENCIL_SEED, InkLiveCanvas, type InkLivePainter, type InkLiveScreen, type InkLiveStyle } from "@mrnote/core/web/lib/office-ink-live.ts";
import { appendInkEffectSvg, inkEffectSvgPlan } from "@mrnote/core/web/lib/office-ink-effects.ts";
import { paintDocumentInkPreview } from "@mrnote/core/web/components/console/editor/native-document/documentShapeExtension.ts";
import { DOCUMENT_SHAPE_EMU_PER_PX } from "@mrnote/core/web/lib/document-shapes.ts";
import {
  INK_HOLD_SHAPE_MIN_LENGTH_PX,
  INK_HOLD_SHAPE_STILL_PX,
  type InkHoldRestWait,
  waitForInkHoldRest,
  inkHeldShape,
  inkHeldShapeAtLift,
  inkHeldShapeFollow,
  inkHoldShapeFit,
  inkHoldShapeOutline,
  inkPathLength,
  type InkHeldShape,
} from "@mrnote/core/web/lib/office-ink-hold-shape.ts";
import { isOfficeInkTap } from "@mrnote/core/web/lib/office-ink-conversion.ts";
import { inkRulerGuideFor, type InkRulerGuide, type InkRulerState } from "@mrnote/core/web/lib/office-ink-ruler.ts";
import { OfficeInkRuler } from "@mrnote/core/web/components/office-ribbon/OfficeInkRuler.tsx";
import {
  INK_CIRCLE_OFFER_MS,
  OfficeInkCircleSelect,
  inkCircleOfferAt,
  type OfficeInkCircleOffer,
} from "@mrnote/core/web/components/office-ribbon/OfficeInkCircleSelect.tsx";
import { isInkCircleGesture } from "@mrnote/core/web/lib/office-ink-lasso-selection.ts";
import {
  addInkLaserSample,
  createInkLaserTrail,
  inkLaserTrailLive,
  paintInkLaserTrail,
  type InkLaserTrail,
} from "@mrnote/core/web/lib/office-ink-laser.ts";
import {
  INK_CAPTURE_MAX_POINTS,
  inkCornerDegreesForTool,
  inkPressuresVary,
  inkSteadyPressureWidthFactor,
  inkStrokePathData,
  inkVariableWidthOutlinePathData,
  thinInkSamples,
} from "@mrnote/core/web/lib/office-ink-smooth.ts";
import { yieldTouchHold } from "@mrnote/core/web/lib/touch-hold.ts";
import { inkCancelsPenPointerDown, inkTraceNote } from "@mrnote/core/web/lib/ink-input-trace.ts";
import { startInkHoldToErase, type InkHoldToErase } from "@mrnote/core/web/lib/pen-first-draw.ts";
import { OfficeFreeformDrawLayer, OfficeShapeDrawLayer } from "@mrnote/core/web/components/office-ribbon/OfficeDrawingSelection.tsx";
import type { OfficeShapeDrawFrame } from "@mrnote/core/web/lib/office-drawing-overlays.ts";
import type {
  PresentationCustomGeometryTool,
  PresentationCustomShapeResult,
} from "@mrnote/core/web/lib/presentation-freeform.ts";
import {
  documentInkColumnCornerClient,
  documentInkLandingOrigin,
  documentInkPageAt,
  documentInkPagesJoined,
  documentInkPagesStrip,
  documentInkPaths,
  documentInkScratchablePaths,
  type DocumentInkClientPoint,
} from "@mrnote/core/web/components/console/editor/native-document/documentInk.ts";
import { inkPresetForTilt } from "@mrnote/core/web/lib/office-ink-tilt.ts";
import { createInkPenDynamics, type InkPenDynamics } from "@mrnote/core/web/lib/office-ink-pen-dynamics.ts";
import { inkPenGestures } from "@mrnote/core/web/lib/office-ink-pen-gestures.ts";
import { inkPendingStrokeSamples } from "@mrnote/core/web/lib/ink-press-deferral.ts";
import { inkPathIdsUnderScratchOut, inkScratchOutEnabled, inkScratchOutTakes, inkToolScratchesOut, isInkScratchOut } from "@mrnote/core/web/lib/office-ink-scratch-out.ts";
import { documentViewScale } from "@mrnote/core/web/components/console/editor/native-document/documentObjectResize.ts";
import { snapDocumentClientPoint } from "@mrnote/core/web/components/console/editor/native-document/documentObjectSnap.ts";

/** `laser`: Draw ▸ Laser Pointer, a fading line never saved (lib/office-ink-laser). */
export type DocumentInkMode = "draw" | "eraser" | "lasso" | "laser";

export interface DocumentInkSurfaceProps {
  view: EditorView;
  mode: DocumentInkMode;
  /**
   * Each stroke lands in the document at its lift (lib/office-wet-ink
   * `inkLandsAtLift`); off, the strokes stay wet until the hand pauses
   * (Ink to Text / Math read them as a group).
   */
  landAtLift?: boolean;
  /**
   * The pen as it writes on the page under `at` (client pixels), and
   * whether that page is dark: a handwriting document's black pens write
   * white on dark paper or a dark cover, and its highlighter lightens a
   * dark page instead of multiplying into it (lib/handwriting-paper).
   */
  penOnPage?: (pen: DocumentInkPreset, at: DocumentInkClientPoint) => { pen: DocumentInkPreset; dark: boolean };
  /**
   * The document cannot take the strokes yet (its room is still opening,
   * its write authority not yet in): the finished strokes stay on the
   * page, wet, and land the moment it can -- never dropped.
   */
  holdLanding?: boolean;
  eraser: DocumentInkEraser;
  preset: DocumentInkPreset;
  label: string;
  /** The strokes a hand finished, in client pixels, once at a time or a
   * few together: the surface shows each the moment the pen lifts (wet
   * ink) and hands them over in a batch a moment later, so the document's
   * work per stroke -- pagination, the save, the ribbon -- never holds the
   * next stroke back. */
  onStrokes: (
    strokes: readonly (readonly DocumentInkClientPoint[])[],
    preset: DocumentInkPreset,
    /** `held`: drawn and held, each stroke is the clean shape it snapped to (land it as that shape). */
    options?: { readonly held?: boolean },
  ) => void;
  /** `sourceDoc` is the document the gesture measured; a write re-checks it. */
  onErase: (ids: Set<string>, sourceDoc: ProseMirrorNode) => void;
  /** What a point eraser left of each stroke it touched (by stroke id). */
  onEraseSegments: (
    pieces: Map<string, DocumentInkStrokePiece[]>,
    sourceDoc: ProseMirrorNode,
  ) => void;
  /**
   * Draw ▸ Lasso Select: the strokes the loop took (touched or enclosed, by
   * stroke id), measured against `sourceDoc`.
   */
  onLasso?: (
    ids: Set<string>,
    sourceDoc: ProseMirrorNode,
    /** The loop as drawn, in client pixels (it stays drawn, closed). */
    loop: readonly DocumentInkClientPoint[],
  ) => void;
  /** The Draw tab's Ruler, in the surface's own pixels, when it is shown. */
  ruler?: InkRulerState | null;
  onRulerChange?: (next: InkRulerState) => void;
  rulerLabel?: string;
  /** The chip a circled stroke offers (Pen Gestures ▸ Circle to Lasso). */
  circleSelectLabel?: string;
  /** Mounted for the ruler alone (no pen picked): the pages keep the pointer. */
  passive?: boolean;
  /**
   * Whether strokes are wet (finished, not yet in the document). A wet
   * stroke is already something to undo: the host's Undo lands it first
   * (DOCUMENT_INK_FLUSH_EVENT) and takes it back.
   */
  onWetChange?: (pending: boolean) => void;
  /**
   * The strokes in hand, oldest first: the finished ones not yet landed and
   * the running one, in the surface's own pixels (lib/collab/ink-presence).
   * Called as they change; empty once they all landed.
   */
  onLiveInk?: (strokes: readonly InkPresenceStroke[]) => void;
  /**
   * A pen's (or finger's, or mouse's) tap with the pen picked, at a client
   * point: true when the host took it (a tap on converted text opens its
   * corrections), and then it leaves no dot of ink.
   */
  onTap?: (clientX: number, clientY: number) => boolean;
}

export interface SurfaceBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the surface is on screen: its client origin and zoom. */
export interface SurfaceFrame {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
}

/**
 * A press whose stroke has not begun yet (`beginStroke` runs after the
 * press's own event task): what the pointer sent meanwhile.
 */
interface PendingStroke {
  pointerId: number;
  /** The pointer's samples while the setup waits, with their own time (`t`). */
  samples: { clientX: number; clientY: number; p?: number; t?: number }[];
  lift: ReactPointerEvent<HTMLDivElement> | null;
}


interface InkGesture {
  /** The pen's feel shaping each sample (lib/office-ink-pen-dynamics). */
  dynamics?: InkPenDynamics;
  /** Samples in the surface's own pixels, so they stay on the page it carries. */
  points: DocumentInkClientPoint[];
  /** The frame the stroke began in. */
  startFrame: SurfaceFrame;
  pointerId: number;
  pointerType: string;
  /** The least distance between two samples; doubles each time a long stroke is thinned. */
  spacing: number;
  /** The ruler's edge the stroke started on, placing its samples (lib/office-ink-ruler). */
  guide: InkRulerGuide | null;
  /** A pen resting where it landed turns the stroke into the eraser (lib/pen-first-draw). */
  hold?: InkHoldToErase | null;
  /** The pen held still: this stroke erases, with the eraser picked on the tab. */
  erasing?: boolean;
  /** Where the running stroke's canvas was laid (surface pixels), for the eraser it may turn into. */
  canvasRect?: { left: number; top: number; width: number; height: number };
  /** The pen's line style on the live canvas, to draw a snapped shape in. */
  liveStyle?: InkLiveStyle;
  /** The pen this stroke draws with: the picked one, a pencil as wide as its tilt makes it (lib/office-ink-tilt). */
  pen?: DocumentInkPreset;
  /** The page it started on is dark (`penOnPage`). */
  dark?: boolean;
  /** Draw and hold (lib/office-ink-hold-shape): where the pen came to rest, and the wait for it to stay. */
  rest?: { at: DocumentInkClientPoint; timer: InkHoldRestWait } | null;
  /** The shape the stroke snapped to, as it snapped, and where the pen was then; `fit` follows the pen. */
  held?: InkHeldShape | null;
}

/** A finished stroke the document has not taken yet (see `wet`). */
interface WetStroke {
  points: DocumentInkClientPoint[];
  preset: DocumentInkPreset;
  /** Drawn and held: the points are the shape it snapped to, landing as that shape. */
  held?: boolean;
  /** Drawn on a dark page: a highlighter lightens it (`penOnPage`). */
  dark?: boolean;
  





  clip?: { left: number; top: number; width: number; height: number };
}

/** Dispatched on `window` to have the wet strokes land at once. */
export const DOCUMENT_INK_FLUSH_EVENT = "mrai:document-ink-flush";

export interface SurfaceLayout {
  /** The page column the surface lives in; none for a view without one. */
  host: HTMLElement | null;
  /** In the host's own CSS pixels, or client pixels without a host. */
  bounds: SurfaceBounds;
}

const PAGE_SHEET_SELECTOR = "article[data-page-sheet]";
/** NoteEditor's page column: the sheets' zoomed, isolated stacking context. */
const PAGE_SURFACE_SELECTOR = '[data-testid="note-editor-page-surface"]';

/**
 * The union of the page sheets, or the editor itself. A surface fixed over
 * the viewport covered whatever the pages scroll under (the window's sticky
 * ribbon, its title bar and status bar, other windows): it took their clicks
 * and wore the pen's cursor. Inside the page column the browser clips it to
 * the scrolled pages and paints the ribbon over it.
 */
function measure(view: EditorView, host: HTMLElement | null): SurfaceBounds {
  const sheets = Array.from(view.dom.querySelectorAll<HTMLElement>(PAGE_SHEET_SELECTOR));
  const rects = (sheets.length ? sheets : [view.dom]).map((element) =>
    element.getBoundingClientRect(),
  );
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  // A page not laid out yet (or a headless DOM) measures empty; the surface
  // still mounts and follows the next measurement.
  const client = {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
  if (!host) return client;
  // The column is zoomed (the document zoom, the canvas zoom): its own
  // pixels are client pixels over its scale, from inside its border.
  const hostRect = host.getBoundingClientRect();
  const { scaleX, scaleY } = documentViewScale(host);
  const sx = scaleX || 1;
  const sy = scaleY || 1;
  return {
    left: (client.left - hostRect.left) / sx - host.clientLeft,
    top: (client.top - hostRect.top) / sy - host.clientTop,
    width: client.width / sx,
    height: client.height / sy,
  };
}

export function surfaceLayout(view: EditorView): SurfaceLayout {
  const host = view.dom.closest<HTMLElement>(PAGE_SURFACE_SELECTOR);
  return { host, bounds: measure(view, host) };
}

function sameLayout(a: SurfaceLayout, b: SurfaceLayout): boolean {
  return (
    a.host === b.host &&
    a.bounds.left === b.bounds.left &&
    a.bounds.top === b.bounds.top &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
}

export function surfaceFrame(element: HTMLElement): SurfaceFrame {
  const rect = element.getBoundingClientRect();
  const { scaleX, scaleY } = documentViewScale(element);
  return { left: rect.left, top: rect.top, scaleX: scaleX || 1, scaleY: scaleY || 1 };
}

/** Where the surface's own pixels are on screen, for the floating live canvas. */
function screenOf(frame: SurfaceFrame): InkLiveScreen {
  return { left: frame.left, top: frame.top, scale: frame.scaleX };
}

export function toSurface(frame: SurfaceFrame, x: number, y: number): DocumentInkClientPoint {
  return { x: (x - frame.left) / frame.scaleX, y: (y - frame.top) / frame.scaleY };
}

function toClient(frame: SurfaceFrame, point: DocumentInkClientPoint): DocumentInkClientPoint {
  const client: DocumentInkClientPoint = { x: frame.left + point.x * frame.scaleX, y: frame.top + point.y * frame.scaleY };
  // The pen's pressure goes with the point: dropped here, a stroke drawn
  // with pressure landed one width (it changed under the pen as it landed).
  if (point.p !== undefined) client.p = point.p;
  return client;
}

/**
 * Above every floating object on the pages: a float's rank is its place in
 * the document's stack (1 .. the number of floats), and the surface shares
 * their stacking context. Under the pen, the running stroke's canvas is a
 * layer of its own; whatever paints over it and overlaps it is lifted into
 * a layer too, and in WebKit a lifted stroke moved by a fraction of a pixel
 * and lifted text lost its sharpness for as long as the pen was down (with
 * thirty-odd strokes on a page, the older ones ranked over a surface at 30).
 * Under the pen palette (10000), which floats over the same window.
 */
const DOCUMENT_INK_SURFACE_Z_INDEX = 9000;

let previewGradientCounter = 0;
function nextPreviewGradientId(): string {
  previewGradientCounter += 1;
  return `docs-ink-preview-${previewGradientCounter}`;
}

/** Ids for the wet strokes' clips and textures, unique on the page. */
let wetStrokeSerial = 0;

export default function DocumentInkSurface({
  view,
  mode,
  eraser,
  preset,
  label,
  onStrokes,
  onErase,
  onEraseSegments,
  onLasso,
  ruler = null,
  onRulerChange,
  rulerLabel,
  circleSelectLabel,
  passive = false,
  onWetChange,
  onLiveInk,
  onTap,
  landAtLift = false,
  penOnPage,
  holdLanding = false,
}: DocumentInkSurfaceProps) {
  const [layout, setLayout] = useState<SurfaceLayout>(() => surfaceLayout(view));
  const { host, bounds } = layout;
  const gestureRef = useRef<InkGesture | null>(null);
  // The wet strokes' page is dark (`penOnPage`): their layer lightens it.
  const [wetDark, setWetDark] = useState(false);
  const wetDarkRef = useRef(false);
  const pendingRef = useRef<PendingStroke | null>(null);
  // Wet ink: strokes the pen has finished and the document has not taken
  // yet, in the surface's own pixels, with the pen they were drawn with.
  // They are drawn here until they land, so a stroke is on screen the
  // moment the pen lifts however long the document takes to take it. Each
  // is drawn once, outside React (lib/office-wet-ink-layer): a lift paints
  // the new stroke alone and renders nothing.
  const paintWetRef = useRef<WetInkPainter<WetStroke>>(() => null);
  const wet = useWetInkLayer<WetStroke>((stroke, ownerDocument) => paintWetRef.current(stroke, ownerDocument));
  const { show: wetShow, layer: wetLayer } = wet;
  const mountWet = useCallback((node: SVGGElement | null) => wetLayer.mount(node), [wetLayer]);
  const wetRef = useRef<WetStroke[]>([]);
  const wetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * A circle the pen just drew around ink (Pen Gestures ▸ Circle to Lasso):
   * it stays wet, not landed, while its Select chip shows. Tapped, the loop
   * goes and what it circled is selected; left, it lands as the ink it is.
   */
  const circleOfferRef = useRef<{ stroke: WetStroke; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [circleOffer, setCircleOffer] = useState<OfficeInkCircleOffer | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const lastFrameRef = useRef<SurfaceFrame | null>(null);
  // The running stroke: drawn on a canvas as the pen moves (lib/office-ink-live),
  // with no render of this component per sample.
  const liveRef = useRef<InkLiveCanvas | null>(null);
  // The pen's hover ring and the point eraser's ring, moved by hand.
  const eraserRingRef = useRef<HTMLDivElement | null>(null);
  const onStrokesRef = useRef(onStrokes);
  onStrokesRef.current = onStrokes;
  // The strokes in hand, for the others in the room (lib/collab/ink-presence):
  // they see the writing as it goes, though it lands in batches.
  const liveInkRef = useRef({ onLiveInk, mode, preset });
  liveInkRef.current = { onLiveInk, mode, preset };
  const liveInkStrokesRef = useRef(new WeakMap<WetStroke, InkPresenceStroke>());
  const publishLiveInk = useCallback(() => {
    const { onLiveInk: publish, mode: currentMode, preset: currentPreset } = liveInkRef.current;
    if (!publish) return;
    const toStroke = (points: readonly DocumentInkClientPoint[], pen: DocumentInkPreset): InkPresenceStroke => ({
      color: pen.color,
      width: Math.max(1, ptToPx(pen.widthPt)),
      alpha: pen.tool === "highlighter" ? 0.4 : 1,
      points,
    });
    const strokes = wetRef.current.map((stroke) => {
      let shared = liveInkStrokesRef.current.get(stroke);
      if (!shared) {
        shared = toStroke(stroke.points, stroke.preset);
        liveInkStrokesRef.current.set(stroke, shared);
      }
      return shared;
    });
    const gesture = gestureRef.current;
    if (gesture && currentMode === "draw" && !gesture.erasing && gesture.points.length > 0) {
      strokes.push(toStroke(
        gesture.held ? inkHoldShapeOutline(gesture.held.fit) : gesture.points,
        gesture.pen ?? currentPreset,
      ));
    }
    publish(strokes);
  }, []);
  // Hand the wet strokes to the document, in one batch per pen.
  const holdLandingRef = useRef(holdLanding);
  holdLandingRef.current = holdLanding;
  const flushWet = useCallback(() => {
    if (wetTimerRef.current !== null) {
      clearTimeout(wetTimerRef.current);
      wetTimerRef.current = null;
    }
    // Held while the document cannot take them: they land when it can.
    if (holdLandingRef.current) return;
    const strokes = wetRef.current;
    if (circleOfferRef.current) {
      // The circle lands with the rest: its offer is over.
      clearTimeout(circleOfferRef.current.timer);
      circleOfferRef.current = null;
      setCircleOffer(null);
    }
    if (strokes.length === 0) return;
    wetRef.current = [];
    wetShow([], "land");
    // Where the samples are on screen now: a stroke is anchored to the page
    // as it is laid out when it lands.
    const frame = surfaceRef.current ? surfaceFrame(surfaceRef.current) : lastFrameRef.current;
    if (!frame) return;
    let batch: WetStroke[] = [];
    const hand = () => {
      if (batch.length === 0) return;
      onStrokesRef.current(
        batch.map((stroke) => stroke.points.map((point) => toClient(frame, point))),
        batch[0].preset,
        batch[0].held ? { held: true } : undefined,
      );
      batch = [];
    };
    for (const stroke of strokes) {
      if (batch.length > 0 && (batch[0].preset !== stroke.preset || Boolean(batch[0].held) !== Boolean(stroke.held))) hand();
      batch.push(stroke);
    }
    hand();
    // After the landing, so a peer has the document's strokes before these go.
    publishLiveInk();
  }, [publishLiveInk, wetShow]);
  const flushWetRef = useRef(flushWet);
  flushWetRef.current = flushWet;
  // The strokes land when the hand pauses, or after enough of them; and
  // before anything that must see them in the document: a mode or pen
  // change, the surface going away.
  const landAtLiftRef = useRef(landAtLift);
  landAtLiftRef.current = landAtLift;
  const scheduleWetFlush = useCallback(() => {
    if (wetTimerRef.current !== null) clearTimeout(wetTimerRef.current);
    if (landAtLiftRef.current || wetRef.current.length >= wetInkMaxStrokes()) {
      // In the task after the lift, not inside it: on an iPad the next
      // Pencil contact that lands while the page is still answering this
      
      
      // landed in the handler). A pen down again by then keeps the batch wet
      // until its own lift, which schedules it again.
      wetTimerRef.current = setTimeout(() => {
        wetTimerRef.current = null;
        if (gestureRef.current && inkPointerArbiter.strokeRunning()) return;
        flushWet();
      }, 0);
      return;
    }
    const land = (heldMs: number) => {
      wetTimerRef.current = null;
      // The pen is down again: the document's work for the batch would
      // hold this stroke's samples back (its long task queues the pointer
      // events). The lift of this stroke schedules the batch again -- and a
      // lift that never reached the surface (the pen silent this long) does
      // not keep the strokes before it out of the document.
      if (gestureRef.current && inkPointerArbiter.strokeRunning()) {
        wetTimerRef.current = setTimeout(() => land(0), INK_STROKE_SILENCE_MS);
        return;
      }
      // The pen hovers just above the page: the next stroke is coming.
      if (wetInkWaitsForPen(heldMs)) {
        wetTimerRef.current = setTimeout(() => land(heldMs + WET_INK_HOVER_RETRY_MS), WET_INK_HOVER_RETRY_MS);
        return;
      }
      flushWet();
    };
    const settleMs = wetInkSettleMs();
    wetTimerRef.current = setTimeout(() => land(settleMs), settleMs);
  }, [flushWet]);
  useEffect(() => {
    const releaseHoverWatch = watchPenHover();
    return () => {
      flushWetRef.current();
      releaseHoverWatch();
    };
  }, []);
  useEffect(() => {
    flushWetRef.current();
  }, [mode, eraser, preset]);
  // The document takes input again: the strokes held for it land now.
  useEffect(() => {
    if (!holdLanding) flushWetRef.current();
  }, [holdLanding]);
  // Anything that must see the strokes in the document now (a save, a
  // test) asks for them to land at once.
  // The editors' shared request (OFFICE_WET_INK_FLUSH_EVENT: the zoom
  // writing window, Slides and Sheet's own) lands them too.
  useEffect(() => {
    const onFlush = () => flushWetRef.current();
    window.addEventListener(DOCUMENT_INK_FLUSH_EVENT, onFlush);
    window.addEventListener(OFFICE_WET_INK_FLUSH_EVENT, onFlush);
    return () => {
      window.removeEventListener(DOCUMENT_INK_FLUSH_EVENT, onFlush);
      window.removeEventListener(OFFICE_WET_INK_FLUSH_EVENT, onFlush);
    };
  }, []);
  // Undo / Redo from the keyboard land the wet strokes before the editor
  // takes the key (capture on its own element, ahead of its keymap), so Undo
  // takes back the stroke just drawn, as Word's does, not the step before it.
  useEffect(() => {
    const dom = view.dom;
    const onHistoryKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") flushWetRef.current();
    };
    dom.addEventListener("keydown", onHistoryKey, true);
    return () => dom.removeEventListener("keydown", onHistoryKey, true);
  }, [view]);
  // The host's Undo is enabled while a stroke is wet.
  const wetPending = wet.pending;
  useEffect(() => {
    onWetChange?.(wetPending);
  }, [onWetChange, wetPending]);
  useEffect(() => () => onWetChange?.(false), [onWetChange]);
  // One id per mounted surface, taken once (a render must not count).
  const [gradientId] = useState(nextPreviewGradientId);
  
  // the pages under the surface and pinches them (the editor's zoom).
  const drawWithTouch = useDrawWithTouch();
  const [surfaceNode, setSurfaceNodeState] = useState<HTMLDivElement | null>(null);
  const setSurfaceNode = useCallback((node: HTMLDivElement | null) => {
    surfaceRef.current = node;
    setSurfaceNodeState(node);
  }, []);
  useEffect(() => (surfaceNode ? installPenInkTouchGuard(surfaceNode) : undefined), [surfaceNode]);
  // The live canvas lives in the surface, outside React's own children.
  useEffect(() => {
    if (!surfaceNode) return;
    // Floating over the page, outside its zoom transform (lib/office-ink-live).
    // A pencil stroke is drawn inside the surface, in the page's zoom: there
    // Safari draws its texture exactly as the landed stroke's (lib/office-ink-live).
    const live = new InkLiveCanvas(surfaceNode.ownerDocument, { floating: true, pageHost: surfaceNode });
    liveRef.current = live;
    return () => {
      liveRef.current = null;
      live.dispose();
    };
  }, [surfaceNode]);
  // A finished stroke onto the wet layer, and the canvas lets go of it in
  // the same task: no frame shows both, none shows neither.
  const showWet = (strokes: readonly WetStroke[]) => {
    wetShow(strokes, "add");
    if (!gestureRef.current) liveRef.current?.clear();
  };
  // The writing hand stays out of the page, and where a finger pans it pans
  // from script: the browser's own pan slid the page under the pen
  // (lib/ink-touch-shield). Fixed over the viewport the surface is outside
  // the page's scroll containers, so the editor stands in for it.
  useInkTouchShield(
    surfaceNode ? (host ? surfaceNode : view.dom) : null,
    !drawWithTouch,
    surfaceNode,
  );
  // With a pen, an eraser or the lasso picked, the Apple Pencil never starts
  // iPadOS Scribble on the pages: nothing on them stays editable until the
  // tool is put down (lib/ink-scribble-guard). Mounted for the ruler alone
  // (Select picked) the pages keep their text.
  useInkScribbleGuard(() => [host ?? view.dom], !passive, host ?? view.dom);

  const remeasure = useCallback(
    () =>
      setLayout((previous) => {
        const next = surfaceLayout(view);
        return sameLayout(previous, next) ? previous : next;
      }),
    [view],
  );

  useLayoutEffect(() => {
    remeasure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure);
    observer?.observe(view.dom);
    window.addEventListener("resize", remeasure);
    // In the page column the surface scrolls with the sheets; fixed over the
    // viewport it follows them.
    if (!host) window.addEventListener("scroll", remeasure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [host, remeasure, view]);

  const endGesture = useCallback(() => {
    pendingRef.current = null;
    gestureRef.current?.hold?.cancel();
    const rest = gestureRef.current?.rest;
    rest?.timer.cancel();
    gestureRef.current = null;
    inkPointerArbiter.end();
    liveRef.current?.clear();
    publishLiveInk();
  }, [publishLiveInk]);

  // Esc cancels the gesture under the pointer (Word: Esc stops inking).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gestureRef.current) {
        event.preventDefault();
        event.stopPropagation();
        endGesture();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [endGesture]);

  useEffect(() => endGesture, [endGesture, mode, eraser]);

  const segmentEraser = mode === "eraser" && eraser !== "stroke";
  const radiusPx = documentInkEraserRadiusPx(eraser);
  // The pen's width on the page: the column's zoom scales it as it scales
  // the stroke once drawn. The eraser's reach is in screen pixels.
  const strokeWidthPx = Math.max(1, ptToPx(preset.widthPt));
  const effect = mode === "draw" && preset.tool === "pen" && preset.effect
    ? documentInkEffectPaint(preset.effect)
    : null;

  const moveRing = (ring: HTMLDivElement | null, point: DocumentInkClientPoint | null, diameter: number) => {
    if (!ring) return;
    if (!point) {
      if (ring.style.display !== "none") ring.style.display = "none";
      return;
    }
    if (ring.style.display !== "block") ring.style.display = "block";
    // The size is written only when it changes: a width written on every
    // hover sample dirties layout, and the next sample's frame read then
    // lays the page out again (60 times a second with a pen in the air,
    // which is what kept the main thread busy when the pen came down).
    const size = `${diameter}px`;
    if (ring.style.width !== size) {
      ring.style.width = size;
      ring.style.height = size;
    }
    ring.style.transform = `translate(${point.x - diameter / 2}px, ${point.y - diameter / 2}px)`;
  };
  /** The surface's frame as a hovering pen last saw it (reused within a frame). */
  const hoverFrameRef = useRef<{ frame: SurfaceFrame; at: number } | null>(null);

  // Draw ▸ Laser Pointer: the trail, its pen, and the frame loop that fades it.
  const laserTrailRef = useRef<InkLaserTrail>(createInkLaserTrail());
  const laserPointerRef = useRef<number | null>(null);
  const laserGroupRef = useRef<SVGGElement | null>(null);
  const laserFrameRef = useRef<number | null>(null);
  const runLaser = () => {
    if (laserFrameRef.current !== null) return;
    const tick = () => {
      laserFrameRef.current = null;
      const group = laserGroupRef.current;
      const surface = surfaceRef.current;
      if (!group || !surface) return;
      const now = performance.now();
      const live = inkLaserTrailLive(laserTrailRef.current, now);
      paintInkLaserTrail(group, laserTrailRef.current, { width: surface.offsetWidth, height: surface.offsetHeight }, now);
      if (live) laserFrameRef.current = requestAnimationFrame(tick);
    };
    laserFrameRef.current = requestAnimationFrame(tick);
  };
  const addLaserSamples = (event: ReactPointerEvent<HTMLDivElement>) => {
    const surface = surfaceRef.current ?? event.currentTarget;
    const frame = surfaceFrame(surface);
    const space = { width: surface.offsetWidth, height: surface.offsetHeight };
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const now = performance.now();
    for (const sample of samples.length > 0 ? samples : [event.nativeEvent]) {
      const point = toSurface(frame, sample.clientX, sample.clientY);
      addInkLaserSample(laserTrailRef.current, point.x, point.y, space, now);
    }
    runLaser();
  };
  useEffect(() => () => {
    if (laserFrameRef.current !== null) cancelAnimationFrame(laserFrameRef.current);
    laserFrameRef.current = null;
  }, []);
  /** The circle's offer ends: it lands as ink (`land`) or is taken. */
  const endCircleOffer = (land: boolean) => {
    const offer = circleOfferRef.current;
    if (!offer) return null;
    clearTimeout(offer.timer);
    circleOfferRef.current = null;
    setCircleOffer(null);
    if (land) scheduleWetFlush();
    return offer;
  };
  /** Select tapped: the loop goes, and the landed ink inside it is selected. */
  const takeCircle = () => {
    const offer = endCircleOffer(false);
    if (!offer) return;
    wetRef.current = wetRef.current.filter((stroke) => stroke !== offer.stroke);
    showWet(wetRef.current);
    publishLiveInk();
    const surfaceNow = surfaceRef.current;
    const frameNow = surfaceNow ? surfaceFrame(surfaceNow) : lastFrameRef.current;
    if (!frameNow) return;
    const points = offer.stroke.points.map((point) => toClient(frameNow, point));
    const select = () => {
      const taken = inkPathIdsInLasso(documentInkPaths(view), points);
      if (taken.size > 0) onLasso?.(taken, view.state.doc, points);
    };
    if (wetRef.current.length === 0) {
      select();
      return;
    }
    // The writing just before the circle is still wet: it lands first, and
    // is selected once the page has laid it out.
    flushWet();
    requestAnimationFrame(() => requestAnimationFrame(select));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // The pen down again past a circle's chip: the circle was ink.
    endCircleOffer(true);
    // A finger with Draw with Touch turned off is the page's: it scrolls.
    // The surface is mounted only while a pen, highlighter or eraser is
    // picked on the Draw tab; `mode` names which.
    if (!inkAcceptsPointer(event, true, drawWithTouch)) {
      inkTraceNote(`D:no-${event.pointerType.charAt(0)}`);
      return;
    }
    // A palm, a second finger, a pen over the palm's finger: the shared
    // policy decides (lib/ink-pointer-policy); the running stroke is never
    // interrupted by another pointer.
    const verdict = inkPointerArbiter.verdict(event.nativeEvent);
    inkTraceNote(`D:${verdict}`);
    if (verdict === "ignore") return;
    if (verdict === "pinch") {
      endGesture();
      return;
    }
    if (mode === "laser") {
      // The laser points; it never inks, erases or selects.
      laserPointerRef.current = event.pointerId;
      laserTrailRef.current.down = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      addLaserSamples(event);
      return;
    }
    if (verdict === "replace") {
      // The pen (or mouse) pressing again while its stroke runs: that
      // stroke's lift never reached the surface, and it ended where the pen
      // was last seen -- it is kept, as a lift would keep it. A finger's
      // stroke the pen replaces was the palm: it goes.
      const stuck = gestureRef.current;
      stuck?.hold?.cancel();
      if (stuck && mode === "draw" && !stuck.erasing && stuck.pointerType !== "touch" && stuck.points.length > 0) {
        gestureRef.current = null;
        inkPointerArbiter.end();
        lastFrameRef.current = surfaceFrame(event.currentTarget);
        wetRef.current = [...wetRef.current, { points: stuck.points, preset: stuck.pen ?? preset, dark: stuck.dark, clip: stuck.canvasRect }];
        showWet(wetRef.current);
        publishLiveInk();
        scheduleWetFlush();
      } else {
        endGesture();
      }
    }
    if (event.pointerType !== "pen" || inkCancelsPenPointerDown()) event.preventDefault();
    yieldTouchHold(event.pointerId);
    // The eraser measures the document's strokes: the wet ones land first.
    if (mode !== "draw") flushWet();
    // The stroke's setup -- the page under the pen, the canvas, the landing
    // origin: layout reads and a canvas allocation, 10 to 100 ms on a long
    // document -- runs after this event's task (`beginStroke`). WebKit
    // answers a touchstart once the pointerdown it derives from it has been
    // handled, and a touchstart answered late meets its touch race: a
    // preventable touchmove already queued when the reply flips the contact
    // to unpreventable, the two coalesced, the reply's completion lost, every
    // deferring recognizer (and Scribble with them) blocked for seconds (the
    
    // at once, never met it. Until the setup runs, the pointer's samples and
    // its lift wait in `pendingRef`.
    const surfaceEl = event.currentTarget;
    const down = event.nativeEvent;
    const pending: PendingStroke = { pointerId: event.pointerId, samples: [], lift: null };
    pendingRef.current = pending;
    inkPointerArbiter.begin(down);
    try {
      surfaceEl.setPointerCapture?.(event.pointerId);
    } catch {
      // A synthetic pointer (tests, some touch emulations) has no capture.
    }
    if (!pencilScribblePossible()) {
      // Only iPadOS WebKit answers a touchstart and has the race; elsewhere
      // the stroke begins at once.
      pendingRef.current = null;
      beginStroke(down, surfaceEl, pending);
      return;
    }
    inkTraceNote("D:out");
    setTimeout(() => {
      if (pendingRef.current !== pending || !surfaceEl.isConnected) return;
      pendingRef.current = null;
      const started = performance.now();
      beginStroke(down, surfaceEl, pending);
      inkTraceNote(`B${Math.round(performance.now() - started)}`);
    }, 0);
  };

  const beginStroke = (event: PointerEvent, surfaceEl: HTMLDivElement, pending: PendingStroke) => {
    const frame = surfaceFrame(surfaceEl);
    const buffered = inkPendingStrokeSamples(event, pending.samples);
    if (buffered.begin) inkTraceNote("J:press-stale");
    // Where the pen went down: the press, or the first sample when the press is stale.
    const downAt = buffered.begin ?? event;
    const rawStart = toSurface(frame, downAt.clientX, downAt.clientY);
    // A stroke starting along the ruler's edge runs along it.
    const guide = mode === "draw" ? inkRulerGuideFor(ruler, rawStart) : null;
    const start: DocumentInkClientPoint = guide ? { ...guide.place(rawStart) } : rawStart;
    // The pen's feel (type, tip, pressure sensitivity, stabilization)
    // shapes every sample; Pressure off draws one width.
    const dynamics = createInkPenDynamics(preset, ptToPx(preset.widthPt));
    const pressure = dynamics.pressure(buffered.begin ? buffered.begin.p : inkSamplePressure(event), start);
    if (pressure !== undefined) start.p = pressure;
    // The pen inks on a page: a press between or beside the sheets draws
    // nothing.
    const sheet =
      mode === "draw"
        ? documentInkPageAt(view, { x: downAt.clientX, y: downAt.clientY })
        : undefined;
    if (sheet === null) {
      inkPointerArbiter.end();
      return;
    }
    // A pencil laid on its side shades: the stroke is as wide as its tilt
    // at touch-down makes it, from its first sample to its lift.
    const tilted = mode === "draw" ? inkPresetForTilt(preset, event) : preset;
    const onPage = mode === "draw" && penOnPage ? penOnPage(tilted, { x: downAt.clientX, y: downAt.clientY }) : null;
    const pen = onPage?.pen ?? tilted;
    const darkPage = onPage?.dark ?? false;
    if (darkPage !== wetDarkRef.current) {
      wetDarkRef.current = darkPage;
      setWetDark(darkPage);
    }
    gestureRef.current = {
      pen,
      dark: darkPage,
      points: [start],
      dynamics,
      startFrame: frame,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      spacing: 1,
      guide,
    };
    // The canvas covers what the stroke can reach: the page it started on
    // (a stroke stops at the page's edge, as the preview does), within the
    // part of the column on screen.
    const ownerWindow = surfaceEl.ownerDocument.defaultView;
    const viewport = {
      left: 0,
      top: 0,
      right: ownerWindow?.innerWidth ?? Number.POSITIVE_INFINITY,
      bottom: ownerWindow?.innerHeight ?? Number.POSITIVE_INFINITY,
    };
    const hostRect = host ? host.getBoundingClientRect() : null;
    // With the pages joined for drawing the stroke runs on across a seam
    // (it lands in a piece on each page), between the pages' side edges.
    const joined = mode === "draw" && sheet && documentInkPagesJoined(view) ? documentInkPagesStrip(view) : null;
    // A strip that does not hold the pen's own point is a stale measure:
    // the page the pen is on bounds the stroke instead.
    const strip = joined && joined.top <= downAt.clientY && joined.bottom >= downAt.clientY ? joined : null;
    const clipLeft = Math.max(viewport.left, hostRect?.left ?? viewport.left, sheet?.left ?? viewport.left);
    // Up and down the pages bound the stroke, never the page surface's own
    // box: on WebKit that box keeps the height of the first page as pages
    // are added (the pages overflow it), and its bottom above the pen cut
    // every stroke past the first page to a 1px sliver until it landed
    
    const clipTop = Math.max(viewport.top, (strip ?? sheet)?.top ?? hostRect?.top ?? viewport.top);
    const clipRight = Math.min(viewport.right, hostRect?.right ?? viewport.right, sheet?.right ?? viewport.right);
    const clipBottom = Math.min(viewport.bottom, (strip ?? sheet)?.bottom ?? viewport.bottom);
    const clipStart = toSurface(frame, clipLeft, clipTop);
    const clipEnd = toSurface(frame, clipRight, clipBottom);
    const canvasRect = {
      left: clipStart.x,
      top: clipStart.y,
      width: Math.max(1, clipEnd.x - clipStart.x),
      height: Math.max(1, clipEnd.y - clipStart.y),
    };
    const live = liveRef.current;
    if (live) {
      if (mode === "draw") {
        const liveStyle: InkLiveStyle = {
          color: effect ? effect.solid : pen.color,
          gradient: effect?.stops,
          ...(effect ? { effect } : {}),
          widthPx: Math.max(1, ptToPx(pen.widthPt)),
          opacity: documentInkStrokeOpacity({ inkTool: preset.tool, inkTape: preset.tape }),
          multiply: preset.tool === "highlighter" && !darkPage,
          screen: preset.tool === "highlighter" && darkPage,
          pressure: dynamics.varies,
          corner: inkCornerDegreesForTool(preset.tool),
          pencil: preset.tool === "pencil",
        };
        if (gestureRef.current) gestureRef.current.liveStyle = liveStyle;
        // The stroke being written is painted as it will land: the node
        // view's own painter on the attributes the landing will store, in
        // the page's pixels (one look before and after the lift), measured
        // from where the landing will measure it (the first sample's column
        // and block). Its box is laid out on a whole pixel of the surface
        // and moved on by the fraction with a `translate`, as the landed
        // stroke's canvas is (floatingTextBoxLayout `inkStageOnWholePixels`):
        // an inline SVG's drawing is snapped to whole pixels of its box's
        // place in its layer, and the box floored to a whole pixel of the
        // column (the surface itself at a fraction) drew every stroke up to
        // a pixel from where it landed, in every engine.
        let origin: { x: number; y: number } | null = null;
        const paint: InkLivePainter = (box, run) => {
          const first = run[0];
          if (!first) return null;
          if (!origin) {
            const landing = documentInkLandingOrigin(view, toClient(frame, first));
            origin = landing ? toSurface(frame, landing.columnLeftClient, landing.blockTopClient) : { x: 0, y: 0 };
          }
          const from = origin;
          const attrs = documentInkStrokeAttrs(
            run.map((point) => ({
              x: (point.x - from.x) * DOCUMENT_SHAPE_EMU_PER_PX,
              y: (point.y - from.y) * DOCUMENT_SHAPE_EMU_PER_PX,
              ...(point.p !== undefined ? { p: point.p } : {}),
            })),
            pen,
          );
          if (!attrs) return null;
          // One grain seed for the whole stroke while it is written: the
          // painter seeds a stroke by its outline, which grows with every
          // sample, and the pencil's specks re-rolled under the pen.
          const painted = paintDocumentInkPreview(box, attrs, { pencilSeed: INK_LIVE_PENCIL_SEED });
          const left = from.x + painted.originX;
          const top = from.y + painted.originY;
          const wholeLeft = Math.floor(left + 1e-6);
          const wholeTop = Math.floor(top + 1e-6);
          box.style.left = `${wholeLeft}px`;
          box.style.top = `${wholeTop}px`;
          box.style.translate = `${left - wholeLeft}px ${top - wholeTop}px`;
          return { svg: painted.svg, originX: left, originY: top };
        };
        live.begin(canvasRect, liveStyle, frame.scaleX, screenOf(frame), paint);
      } else if (mode === "lasso") {
        // The loop as Word draws it: a thin dashed line.
        live.begin(canvasRect, { color: "#475569", widthPx: 1.5, opacity: 0.9, dash: [5, 4], trace: true }, frame.scaleX, screenOf(frame));
      } else {
        live.begin(
          canvasRect,
          {
            color: "#94a3b8",
            widthPx: (radiusPx * 2) / (frame.scaleX || 1),
            opacity: 0.35,
            dash: eraser === "stroke" ? [4, 4] : undefined,
            trace: true,
          },
          frame.scaleX,
          screenOf(frame),
        );
      }
      live.extend([start]);
    }
    const begun = gestureRef.current;
    if (mode === "draw" && begun) {
      begun.canvasRect = canvasRect;
      begun.hold = startInkHoldToErase(event, () => turnToEraser(begun));
    }
    // What the pointer sent while the setup waited: its samples, then its lift.
    const gesture = gestureRef.current;
    if (gesture && buffered.samples.length > 0) {
      const added: DocumentInkClientPoint[] = [];
      for (const sample of buffered.samples) {
        const raw = gesture.dynamics?.place(toSurface(frame, sample.clientX, sample.clientY)) ?? toSurface(frame, sample.clientX, sample.clientY);
        const next: DocumentInkClientPoint = gesture.guide ? { ...gesture.guide.place(raw) } : raw;
        const p = gesture.dynamics ? gesture.dynamics.pressure(sample.p, next) : sample.p;
        if (p !== undefined) next.p = p;
        const previous = gesture.points[gesture.points.length - 1]!;
        if (Math.hypot(next.x - previous.x, next.y - previous.y) < gesture.spacing) continue;
        gesture.points.push(next);
        added.push(next);
      }
      if (added.length > 0) {
        publishLiveInk();
        liveRef.current?.extend(added);
      }
    }
    if (pending.lift) onPointerUp(pending.lift);
  };

  // Draw and hold (lib/office-ink-hold-shape): the pen comes to rest at the
  // end of a stroke and the stroke snaps to its clean shape; held on, the
  // shape follows the pen (a line's end; anything else's size).
  const drawHeldShape = (gesture: InkGesture, frame: SurfaceFrame) => {
    const live = liveRef.current;
    if (!live || !gesture.held || !gesture.canvasRect || !gesture.liveStyle) return;
    live.clear();
    // A clean shape is drawn at one width: the pen's.
    live.begin(gesture.canvasRect, { ...gesture.liveStyle, pressure: false }, frame.scaleX, screenOf(frame));
    live.extend(inkHoldShapeOutline(gesture.held.fit));
  };
  const snapHeldShape = (gesture: InkGesture) => {
    if (gestureRef.current !== gesture || gesture.erasing || gesture.held || mode !== "draw") return;
    gesture.rest = null;
    const frame = surfaceRef.current ? surfaceFrame(surfaceRef.current) : gesture.startFrame;
    if (inkPathLength(gesture.points) * (frame.scaleX || 1) < INK_HOLD_SHAPE_MIN_LENGTH_PX) return;
    const fit = inkHoldShapeFit(gesture.points);
    const anchor = gesture.points[gesture.points.length - 1];
    if (!fit || !anchor) return;
    gesture.held = inkHeldShape(fit, anchor);
    drawHeldShape(gesture, frame);
  };
  // The pen moved: a rest begins again from here (a tremble is no move).
  const watchRest = (gesture: InkGesture, at: DocumentInkClientPoint, frame: SurfaceFrame) => {
    // (a strip of tape stays the strip it was laid as)
    if (gesture.erasing || gesture.held || mode !== "draw" || gesture.guide || preset.tape) return;
    const still = INK_HOLD_SHAPE_STILL_PX / (frame.scaleX || 1);
    const rest = gesture.rest;
    if (rest && Math.hypot(at.x - rest.at.x, at.y - rest.at.y) <= still) return;
    rest?.timer.cancel();
    // Draw and hold to snap is a pen gesture the reader can switch off.
    if (!inkPenGestures().holdShape) return;
    gesture.rest = { at, timer: waitForInkHoldRest(() => snapHeldShape(gesture)) };
  };

  // Press and hold the pen (lib/pen-first-draw): the stroke that rested
  // where it landed becomes the eraser from there, the Eraser's kind as the
  // tab has it; once the pen lifts it is the pen again.
  const turnToEraser = (gesture: InkGesture) => {
    if (gestureRef.current !== gesture || gesture.erasing) return;
    // The eraser measures the document's strokes: the wet ones land first.
    flushWet();
    const at = gesture.points[gesture.points.length - 1];
    gesture.erasing = true;
    gesture.hold = null;
    gesture.guide = null;
    gesture.points = at ? [at] : [];
    const live = liveRef.current;
    if (!live || !gesture.canvasRect) return;
    live.clear();
    live.begin(
      gesture.canvasRect,
      {
        color: "#94a3b8",
        widthPx: (radiusPx * 2) / (gesture.startFrame.scaleX || 1),
        opacity: 0.35,
        dash: eraser === "stroke" ? [4, 4] : undefined,
        trace: true,
      },
      gesture.startFrame.scaleX,
      screenOf(gesture.startFrame),
    );
    if (at) live.extend([at]);
    if (at) moveRing(eraserRingRef.current, at, (radiusPx * 2) / (gesture.startFrame.scaleX || 1));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Field diagnosis: a move's own cost (M<ms>, from 3 ms), to tell the
    // script's share of a slow frame from the rendering's.
    const moveStarted = performance.now();
    try {
      handlePointerMove(event);
    } finally {
      const moveCost = performance.now() - moveStarted;
      if (moveCost >= 3) inkTraceNote(`M${Math.round(moveCost)}`);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (laserPointerRef.current === event.pointerId) {
      addLaserSamples(event);
      return;
    }
    inkPointerArbiter.observe(event.nativeEvent);
    const pending = pendingRef.current;
    if (pending && pending.pointerId === event.pointerId) {
      if (event.pointerType !== "touch" && event.buttons === 0) {
        pending.lift = event;
        return;
      }
      for (const sample of inkPointerSamples(event)) {
        // The pen's own pressure: its feel is applied as the stroke takes it.
        const p = inkSamplePressure(sample);
        const t = typeof sample.timeStamp === "number" && sample.timeStamp > 0 ? sample.timeStamp : undefined;
        pending.samples.push({
          clientX: sample.clientX,
          clientY: sample.clientY,
          ...(p === undefined ? {} : { p }),
          ...(t === undefined ? {} : { t }),
        });
      }
      return;
    }
    const gesture = gestureRef.current;
    const tracking = gesture !== null && gesture.pointerId === event.pointerId;
    // A pen or a mouse moving with no button down has lifted: its up went
    // elsewhere (the page changed under it). The stroke ends here, as a
    // lift would, instead of holding every later stroke and reading back.
    if (tracking && event.pointerType !== "touch" && event.buttons === 0) {
      onPointerUp(event);
      return;
    }
    if (!tracking) {
      // The point eraser shows its reach while the pen is in the air; a
      // pen's own stroke is not previewed (the disc at the tip was in the
      
      // so its contact is answered the moment it comes (WebKit's touch race).
      if (!segmentEraser) return;
      const hoverStarted = performance.now();
      const cached = hoverFrameRef.current;
      const hoverFrame = cached && hoverStarted - cached.at < 16 ? cached.frame : surfaceFrame(event.currentTarget);
      if (hoverFrame !== cached?.frame) hoverFrameRef.current = { frame: hoverFrame, at: hoverStarted };
      moveRing(eraserRingRef.current, toSurface(hoverFrame, event.clientX, event.clientY), (radiusPx * 2) / (hoverFrame.scaleX || 1));
      const hoverCost = performance.now() - hoverStarted;
      if (hoverCost >= 2) inkTraceNote(`V${Math.round(hoverCost)}`);
    }
    const frame = surfaceFrame(event.currentTarget);
    if (!gesture || !tracking) return;
    gesture.hold?.move(event);
    if (gesture.held) {
      // Snapped: the pen moves the shape, no more ink is drawn.
      inkHeldShapeFollow(
        gesture.held,
        toSurface(frame, event.clientX, event.clientY),
        INK_HOLD_SHAPE_STILL_PX / (frame.scaleX || 1),
      );
      drawHeldShape(gesture, frame);
      return;
    }
    if (segmentEraser || gesture.erasing) {
      moveRing(eraserRingRef.current, toSurface(frame, event.clientX, event.clientY), (radiusPx * 2) / (frame.scaleX || 1));
    }
    // Every coalesced sample: a fast stroke keeps its curve.
    const added: DocumentInkClientPoint[] = [];
    for (const sample of inkPointerSamples(event)) {
      const surfacePoint = toSurface(frame, sample.clientX, sample.clientY);
      const raw = gesture.dynamics?.place(surfacePoint) ?? surfacePoint;
      const next: DocumentInkClientPoint = gesture.guide ? { ...gesture.guide.place(raw) } : raw;
      const pressure = gesture.dynamics
        ? gesture.dynamics.pressure(inkSamplePressure(sample), next)
        : preset.steady ? undefined : inkSamplePressure(sample);
      if (pressure !== undefined) next.p = pressure;
      const previous = gesture.points[gesture.points.length - 1];
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < gesture.spacing) continue;
      // A stroke longer than the outline can hold is thinned and goes on:
      // it used to stop taking samples while the pen was still down.
      thinInkSamples(gesture.points, INK_CAPTURE_MAX_POINTS, gesture);
      gesture.points.push(next);
      added.push(next);
    }
    const restAt = gesture.points[gesture.points.length - 1];
    if (restAt && mode === "draw") watchRest(gesture, restAt, frame);
    if (added.length > 0) publishLiveInk();
    const live = liveRef.current;
    if (!live) return;
    // The canvas floats over the page: it goes where the surface is now.
    live.place(screenOf(frame));
    // The browser's guess at the next samples is drawn ahead of the pen's
    // tip (the eraser's and the lasso's trace stay on the real pointer).
    const predicted = inkPredictedSamples(event).map((sample) => {
      const raw = toSurface(frame, sample.clientX, sample.clientY);
      const guess: DocumentInkClientPoint = gesture.guide ? { ...gesture.guide.place(raw) } : raw;
      const pressure = gesture.dynamics
        ? gesture.dynamics.peek(inkSamplePressure(sample), guess)
        : preset.steady ? undefined : inkSamplePressure(sample);
      if (pressure !== undefined) guess.p = pressure;
      return guess;
    });
    if (added.length > 0 || predicted.length > 0) live.extend(added, predicted);
  };

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (laserPointerRef.current === event.pointerId) {
      // The line fades from here (the loop runs while any of it is left).
      laserPointerRef.current = null;
      laserTrailRef.current.down = false;
      runLaser();
      return;
    }
    const pending = pendingRef.current;
    if (pending && pending.pointerId === event.pointerId) {
      pending.lift = event;
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      inkTraceNote(gesture ? "U:other" : "U:none");
      // The stroke this pointer began was dropped (Esc, a press that drew
      // nothing): its lift still ends it for every surface.
      if (inkPointerArbiter.owns(event)) inkPointerArbiter.end();
      return;
    }
    gestureRef.current = null;
    gesture.hold?.cancel();
    gesture.rest?.timer.cancel();
    gesture.rest = null;
    inkPointerArbiter.end();
    if (gesture.erasing) moveRing(eraserRingRef.current, null, 0);
    if (mode === "draw" && !gesture.erasing) {
      // A tap on text the pen converted opens its corrections instead of
      // leaving a dot (a dot written anywhere else stays a dot).
      if (onTap && gesture.points.length > 0) {
        const client = gesture.points.map((point) => toClient(gesture.startFrame, point));
        if (isOfficeInkTap(client) && onTap(client[0]!.x, client[0]!.y)) {
          inkTraceNote("U:tap-host");
          liveRef.current?.clear();
          return;
        }
      }
      // The stroke stays on the surface as wet ink and lands with the next
      // pause of the hand (`flushWet`). The canvas lets go of it as the
      // wet layer takes it (`showWet`).
      // After a replayed lift (`beginStroke`) the event's target is gone.
      const surfaceNow = surfaceRef.current ?? event.currentTarget;
      if (surfaceNow) lastFrameRef.current = surfaceFrame(surfaceNow);
      // Scribbled to and fro over ink: the ink under it is erased, wet or
      // landed, and the scribble is not kept (lib/office-ink-scratch-out).
      if (!gesture.held && !preset.tape && inkToolScratchesOut(preset.tool) && gesture.points.length > 0 && inkScratchOutEnabled()) {
        const frame = gesture.startFrame;
        const scribble = gesture.points.map((point) => toClient(frame, point));
        if (isInkScratchOut(scribble)) {
          const reach = (strokeWidthPx / 2) * (frame.scaleX || 1) + 3;
          const covered = inkPathIdsUnderScratchOut(documentInkScratchablePaths(view), scribble, reach);
          const keptWet = wetRef.current.filter(
            (stroke) =>
              !inkScratchOutTakes({ tool: stroke.preset.tool, shape: stroke.held === true }) ||
              inkPathIdsUnderScratchOut(
                [{ id: "wet", points: stroke.points.map((point) => toClient(frame, point)) }],
                scribble,
                reach,
              ).size === 0,
          );
          const wetGone = keptWet.length !== wetRef.current.length;
          if (covered.size > 0 || wetGone) {
            inkTraceNote("U:scratch");
            liveRef.current?.clear();
            if (wetGone) {
              wetRef.current = keptWet;
              showWet(keptWet);
              publishLiveInk();
            }
            if (covered.size > 0) onErase(covered, view.state.doc);
            return;
          }
        }
      }
      if (gesture.held) {
        inkTraceNote("U:held");
        // Drawn and held: the clean shape lands, as a shape.
        wetRef.current = [
          ...wetRef.current,
          // As it stood just before the lift: the pen's slide off the glass is not the shape's.
          { points: inkHoldShapeOutline(inkHeldShapeAtLift(gesture.held)), preset: gesture.pen ?? preset, dark: gesture.dark, held: true, clip: gesture.canvasRect },
        ];
        showWet(wetRef.current);
        publishLiveInk();
        scheduleWetFlush();
        return;
      }
      inkTraceNote(`U:wet${gesture.points.length}`);
      if (gesture.points.length > 0) {
        const stroke: WetStroke = { points: gesture.points, preset: gesture.pen ?? preset, dark: gesture.dark, clip: gesture.canvasRect };
        wetRef.current = [...wetRef.current, stroke];
        showWet(wetRef.current);
        publishLiveInk();
        // Circled ink with the pen: the circle waits for its Select chip.
        if (onLasso && stroke.preset.tool === "pen" && !stroke.preset.tape && inkPenGestures().circleLasso) {
          const frame = gesture.startFrame;
          const loop = gesture.points.map((point) => toClient(frame, point));
          const encloses = () =>
            inkPathIdsInLasso(documentInkPaths(view), loop).size > 0 ||
            wetRef.current.some(
              (other) =>
                other !== stroke &&
                inkPathIdsInLasso([{ id: "wet", points: other.points.map((point) => toClient(frame, point)) }], loop).size > 0,
            );
          if (isInkCircleGesture(loop) && encloses()) {
            endCircleOffer(false);
            circleOfferRef.current = {
              stroke,
              timer: setTimeout(() => endCircleOffer(true), INK_CIRCLE_OFFER_MS),
            };
            setCircleOffer(inkCircleOfferAt(gesture.points));
            return;
          }
        }
        scheduleWetFlush();
      } else {
        liveRef.current?.clear();
      }
      return;
    }
    liveRef.current?.clear();
    // The strokes under the eraser (or inside the loop) are measured as they
    // stand at the lift, and the trace with them, from where the surface is
    // now. Measured when the pen went down, they were the page as it was
    // before the wet strokes that landed then were laid out, and any change
    // to the document during the scrub (the pages relaid after that
    // landing, a peer's edit) refused the whole erase: a scrub over what had
    
    
    const surfaceNow = surfaceRef.current;
    const frameNow = surfaceNow ? surfaceFrame(surfaceNow) : gesture.startFrame;
    const points = gesture.points.map((point) => toClient(frameNow, point));
    const paths = documentInkPaths(view);
    const sourceDoc = view.state.doc;
    if (mode === "lasso") {
      const taken = inkPathIdsInLasso(paths, points);
      if (taken.size === 0 || !onLasso) return;
      // Taking the strokes puts the Select tool in the lasso's place, which
      // takes this surface and its touch shield away. On an iPad that ran
      // inside the pen's lift, before WebKit had handed the same contact's
      // touchend to the page: a touch sequence whose touchstart was cancelled
      // ended on nothing, WebKit's gesture recognizer was left waiting, and
      
      // There the lift's own events finish first.
      if (pencilScribblePossible()) setTimeout(() => onLasso(taken, sourceDoc, points), 0);
      else onLasso(taken, sourceDoc, points);
      return;
    }
    if (eraser === "stroke") {
      const hit = inkPathIdsHitByEraser(paths, points, radiusPx);
      if (hit.size > 0) onErase(hit, sourceDoc);
      return;
    }
    const cuts = new Map<string, DocumentInkStrokePiece[]>();
    for (const path of paths) {
      const left = documentInkEraserCut(path.points, points, radiusPx, path.width, path.cutEnds);
      if (left) cuts.set(path.id, left);
    }
    if (cuts.size > 0) onEraseSegments(cuts, sourceDoc);
  }

  if (typeof document === "undefined") return null;
  // How a wet stroke is drawn, once, when it is added (lib/office-wet-ink-layer).
  paintWetRef.current = (stroke, ownerDocument) => {
    const wetEffect = stroke.preset.tool === "pen" && stroke.preset.effect
      ? documentInkEffectPaint(stroke.preset.effect)
      : null;
    const paint = stroke.preset.color;
    // A steady pressure is drawn at its width (the stroke lands so).
    const widthPx = Math.max(
      1,
      (ptToPx(stroke.preset.widthPt)) *
        (stroke.preset.tool === "highlighter" ? 1 : inkSteadyPressureWidthFactor(stroke.points.map((point) => point.p))),
    );
    const opacity = documentInkStrokeOpacity({ inkTool: stroke.preset.tool, inkTape: stroke.preset.tape });
    const corner = inkCornerDegreesForTool(stroke.preset.tool);
    const pressured =
      stroke.preset.tool !== "highlighter" && inkPressuresVary(stroke.points.map((point) => point.p));
    const serial = (wetStrokeSerial += 1);
    const holder = wetInkSvgElement(ownerDocument, "g");
    const group = wetInkSvgElement(ownerDocument, "g");
    if (stroke.clip) {
      const clipPath = wetInkSvgElement(ownerDocument, "clipPath", { id: `${gradientId}-wet-clip-${serial}` });
      clipPath.append(
        wetInkSvgElement(ownerDocument, "rect", {
          x: stroke.clip.left,
          y: stroke.clip.top,
          width: stroke.clip.width,
          height: stroke.clip.height,
        }),
      );
      holder.append(clipPath);
      group.setAttribute("clip-path", `url(#${clipPath.id})`);
    }
    // A pencil stroke wears its texture while it is wet, over its own box
    // only (the surface covers every page); the grain is the same at every
    // point of the page whatever the box (the noise is in page pixels).
    if (mode === "draw" && preset.tool === "pencil" && stroke.preset.tool === "pencil") {
      const spec = documentInkPencilFilter(
        strokeWidthPx,
        documentInkPencilRegionFor(stroke.points, strokeWidthPx),
        INK_LIVE_PENCIL_SEED,
      );
      const filter = wetInkSvgElement(ownerDocument, "filter", { id: `${gradientId}-wet-pencil-${serial}`, ...spec.attrs });
      for (const primitive of spec.primitives) filter.append(wetInkSvgElement(ownerDocument, primitive.tag, primitive.attrs));
      holder.append(filter);
      group.setAttribute("filter", `url(#${filter.id})`);
    }
    if (wetEffect) {
      // An effect's layers, as the landed stroke paints them
      // (lib/office-ink-effects), its gradient over the samples' box.
      const defs = wetInkSvgElement(ownerDocument, "defs", {});
      holder.append(defs);
      const plan = inkEffectSvgPlan(
        wetEffect,
        { points: stroke.points, widthPx, pressured, corner, opacity },
        `${gradientId}-wet-effect-${serial}`,
      );
      appendInkEffectSvg(ownerDocument, group, defs, plan, {}, { "data-testid": "document-draw-wet-stroke" });
      holder.append(group);
      return holder;
    }
    if (pressured) {
      group.append(
        wetInkSvgElement(ownerDocument, "path", {
          "data-testid": "document-draw-wet-stroke",
          "data-ink-pressure": "true",
          d: inkVariableWidthOutlinePathData(stroke.points, widthPx, { corner }),
          fill: paint,
          "fill-opacity": opacity,
          stroke: "none",
        }),
      );
    } else {
      const path = wetInkSvgElement(ownerDocument, "path", {
        "data-testid": "document-draw-wet-stroke",
        d: inkStrokePathData(stroke.points, { corner }),
        fill: "none",
        stroke: paint,
        "stroke-width": widthPx,
        "stroke-opacity": opacity,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke",
      });
      if (stroke.preset.tool === "highlighter") path.style.mixBlendMode = stroke.dark ? "screen" : "multiply";
      group.append(path);
    }
    holder.append(group);
    return holder;
  };
  // On whole pixels of the page column, the fraction moved by `translate`:
  // the wet ink draws exactly where it is, as the landed strokes do (their
  // stages are placed the same way, floatingTextBoxLayout). At the pages'
  // fractional corner the wet layer went onto whole pixels one way and each
  // landed stroke another, so a batch moved as it landed.
  const wholeLeft = Math.floor(bounds.left);
  const wholeTop = Math.floor(bounds.top);
  const style: CSSProperties = {
    position: host ? "absolute" : "fixed",
    left: wholeLeft,
    top: wholeTop,
    translate:
      bounds.left !== wholeLeft || bounds.top !== wholeTop
        ? `${bounds.left - wholeLeft}px ${bounds.top - wholeTop}px`
        : undefined,
    width: bounds.width,
    height: bounds.height,
    zIndex: DOCUMENT_INK_SURFACE_Z_INDEX,
    cursor: passive ? undefined : mode === "eraser" ? (segmentEraser ? "none" : "cell") : "crosshair",
    // Nothing native under the pen: a finger that pans does it through the
    // shield, which knows the hand from a finger. Mounted for the ruler
    // alone, the surface takes no pointer: the pages keep theirs.
    pointerEvents: passive ? "none" : undefined,
    touchAction: passive ? undefined : "none",
    userSelect: "none",
  };
  const ringStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    display: "none",
    borderRadius: "50%",
    pointerEvents: "none",
    boxSizing: "border-box",
  };
  return createPortal(
    <div
      ref={setSurfaceNode}
      role="application"
      tabIndex={0}
      aria-label={label}
      data-testid="document-draw-surface"
      data-ink-mode={mode}
      data-ink-eraser={mode === "eraser" ? eraser : undefined}
      style={style}
      data-ink-passive={passive ? "true" : undefined}
      onPointerDown={passive ? undefined : onPointerDown}
      onPointerMove={passive ? undefined : onPointerMove}
      onPointerUp={passive ? undefined : onPointerUp}
      // The browser taking the pointer ends the stroke as a lift would:
      // what was drawn stays.
      onPointerCancel={passive ? undefined : onPointerUp}
      onPointerLeave={() => {
        moveRing(eraserRingRef.current, null, 0);
      }}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
          mixBlendMode:
            mode === "draw" && preset.tool === "highlighter" ? (wetDark ? "screen" : "multiply") : "normal",
        }}
      >
        <g ref={mountWet} />
      </svg>
      {mode === "laser" ? (
        <svg
          aria-hidden="true"
          data-testid="document-draw-laser"
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
        >
          <g ref={laserGroupRef} />
        </svg>
      ) : null}
      <div
        ref={eraserRingRef}
        aria-hidden="true"
        data-testid="document-draw-eraser-ring"
        style={{
          ...ringStyle,
          border: "1px solid #475569",
          background: "rgba(148, 163, 184, 0.25)",
        }}
      />
      {circleOffer ? (
        <OfficeInkCircleSelect
          offer={circleOffer}
          label={circleSelectLabel ?? "Select"}
          testId="document-draw-circle-select"
          onSelect={takeCircle}
        />
      ) : null}
      {ruler && onRulerChange ? (
        <OfficeInkRuler
          ruler={ruler}
          onChange={onRulerChange}
          length={Math.ceil(Math.hypot(bounds.width, bounds.height) + 200)}
          zoom={lastFrameRef.current?.scaleX ?? (surfaceRef.current ? surfaceFrame(surfaceRef.current).scaleX : 1)}
          label={rulerLabel ?? "Ruler"}
          testId="document-draw-ruler"
        />
      ) : null}
    </div>,
    host ?? document.body,
  );
}

/**
 * Lines > Curve / Freeform: Shape / Freeform: Scribble over the pages: the
 * shared drawing layer (`OfficeFreeformDrawLayer`, the same one the worksheet
 * mounts) on a surface that follows the page sheets like the Draw tab's. The
 * finished outline comes back with its box in CLIENT pixels.
 */
export function DocumentFreeformSurface({
  view,
  tool,
  label,
  onComplete,
  onCancel,
}: {
  view: EditorView;
  tool: PresentationCustomGeometryTool;
  label: string;
  onComplete: (result: PresentationCustomShapeResult) => void;
  onCancel: () => void;
}) {
  const [bounds, setBounds] = useState<SurfaceBounds>(() => measure(view, null));
  const remeasure = useCallback(() => setBounds(measure(view, null)), [view]);
  useLayoutEffect(() => {
    remeasure();
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [remeasure]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="application"
      aria-label={label}
      data-testid="document-freeform-surface"
      data-freeform-tool={tool}
      style={{
        position: "fixed",
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: 30,
        userSelect: "none",
      }}
    >
      <OfficeFreeformDrawLayer
        tool={tool}
        testId="document-freeform-draw"
        onComplete={(result) =>
          onComplete({ ...result, left: result.left + bounds.left, top: result.top + bounds.top })
        }
        onCancel={onCancel}
      />
    </div>,
    document.body,
  );
}

/**
 * Insert > Shapes with the crosshair over the pages (Word's click-and-drag
 * insertion). The frame comes back in CLIENT pixels, like the freeform
 * surface's outline, so the caller places it with the same page origin.
 */
export function DocumentShapeDrawSurface({
  view,
  label,
  line,
  defaultSize = { width: 96, height: 96 },
  onComplete,
  onCancel,
}: {
  view: EditorView;
  label: string;
  line?: boolean;
  /**
   * What a plain click places, in page px at 100 % (a shape: 1" x 1"; a text
   * box: the caller's). The page's zoom scales it, so the inserted object is
   * that size on the page at every zoom.
   */
  defaultSize?: { readonly width: number; readonly height: number };
  onComplete: (frame: OfficeShapeDrawFrame) => void;
  onCancel: () => void;
}) {
  const [bounds, setBounds] = useState<SurfaceBounds>(() => measure(view, null));
  const sheet = view.dom.querySelector<HTMLElement>(PAGE_SHEET_SELECTOR) ?? view.dom;
  const zoom = documentViewScale(sheet);
  const clickSize = {
    width: defaultSize.width * (zoom.scaleX || 1),
    height: defaultSize.height * (zoom.scaleY || 1),
  };
  const remeasure = useCallback(() => setBounds(measure(view, null)), [view]);
  useLayoutEffect(() => {
    remeasure();
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [remeasure]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="application"
      aria-label={label}
      data-testid="document-shape-draw-surface"
      style={{
        position: "fixed",
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: 30,
        userSelect: "none",
      }}
    >
      <OfficeShapeDrawLayer
        testId="document-shape-draw"
        line={line}
        defaultSize={clickSize}
        // Word's alignment guides: the press and the far corner of a new
        // shape line up with the page's objects, edges and margins.
        snapPoint={(point, event) => {
          const client = point ? { x: point.x + bounds.left, y: point.y + bounds.top } : null;
          const snapped = snapDocumentClientPoint(view.dom, client, event);
          return snapped && point ? { x: snapped.x - bounds.left, y: snapped.y - bounds.top } : point;
        }}
        onComplete={(frame) =>
          onComplete({
            ...frame,
            left: frame.left + bounds.left,
            top: frame.top + bounds.top,
            start: { x: frame.start.x + bounds.left, y: frame.start.y + bounds.top },
            end: { x: frame.end.x + bounds.left, y: frame.end.y + bounds.top },
          })
        }
        onCancel={onCancel}
      />
    </div>,
    document.body,
  );
}

