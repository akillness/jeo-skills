"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The Draw tab's Ruler on a drawing surface (lib/office-ink-ruler): a
 * straightedge the hand drags, turns with the wheel, two fingers or the
 * arrow keys, and inks along. The wheel and two fingers turn it about the
 * point under them, so it stays under the hand that turns it; the dial at its
 * middle turns it about its centre by a drag around the dial. Shared by the
 * Docs page column, the slide and the worksheet; the host keeps the ruler's
 * state in the surface's own pixels and snaps its strokes with
 * `inkRulerGuideFor`.
 */

import { doubleClickOnDoubleTap } from "../../lib/double-tap";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import {
  INK_RULER_THICKNESS_PX,
  inkRulerContains,
  inkRulerMoved,
  inkRulerTurned,
  inkRulerTurnedAbout,
  normalizeInkRulerAngle,
  type InkRulerPoint,
  type InkRulerState,
} from "../../lib/office-ink-ruler";

export interface OfficeInkRulerProps {
  ruler: InkRulerState;
  onChange: (next: InkRulerState) => void;
  /** The ruler's length (px); long enough to cross the surface. */
  length: number;
  /**
   * How many screen pixels one surface pixel is, where the ruler cannot
   * measure it. It measures the surface it is laid on (the workspace's
   * scale times the editor's zoom), which is what a drag must follow.
   */
  zoom?: number;
  label: string;
  testId?: string;
}

/**
 * A wheel gesture's notches come this close together (ms); a longer pause
 * ends it. A turn the wheel started keeps the rest of its gesture, and a
 * scroll of the page that runs into the ruler stays the page's.
 */
export const INK_RULER_WHEEL_GESTURE_IDLE_MS = 500;

interface WheelTurnSession {
  /** Where the turn pivots, in surface pixels: the point under the pointer. */
  pivot: InkRulerPoint | null;
  /** The pointer when the session began: its surface point, to follow it after. */
  origin: { clientX: number; clientY: number; at: InkRulerPoint } | null;
  scale: number;
  timer: ReturnType<typeof setTimeout> | null;
  detach: () => void;
}

/** The turning dial at the ruler's middle (px across). */
export const INK_RULER_DIAL_PX = 44;
/** Nearer the dial's centre than this a drag has no direction yet (px). */
const INK_RULER_DIAL_DEAD_ZONE_PX = 6;

/** The dial's rim: twelve ticks, a longer one at its top for the grip. */
function dialTicks(size: number): string {
  const c = size / 2;
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i * Math.PI) / 6;
    const inner = c - (i === 0 ? 8 : 5);
    const outer = c - 2;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    parts.push(
      `M${(c + inner * sin).toFixed(2)} ${(c - inner * cos).toFixed(2)}L${(c + outer * sin).toFixed(2)} ${(c - outer * cos).toFixed(2)}`,
    );
  }
  return parts.join("");
}

/** The ruler's tick marks: one every 8 px, a taller one every 40. */
function ticks(length: number): string {
  const parts: string[] = [];
  const half = length / 2;
  for (let x = -Math.floor(half / 8) * 8; x <= half; x += 8) {
    const tall = x % 40 === 0;
    parts.push(`M${x} 0v${tall ? 12 : 6}`);
    parts.push(`M${x} ${INK_RULER_THICKNESS_PX}v${tall ? -12 : -6}`);
  }
  return parts.join("");
}

export function OfficeInkRuler({ ruler, onChange, length, zoom = 1, label, testId = "office-ink-ruler" }: OfficeInkRulerProps) {
  // The ruler as last asked for: a move or a notch builds on the one before
  // it even when the host has not rendered it yet.
  const rulerRef = useRef(ruler);
  rulerRef.current = ruler;
  // The ruler as the screen shows it (its box is measured against this).
  const shownRef = useRef(ruler);
  const lengthRef = useRef(length);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    shownRef.current = ruler;
    lengthRef.current = length;
    zoomRef.current = zoom;
  });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const change = useCallback((next: InkRulerState) => {
    rulerRef.current = next;
    onChangeRef.current(next);
  }, []);
  // The pointers on the ruler: one drags it, two turn it (and drag it).
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const [turning, setTurning] = useState(false);
  const elementRef = useRef<HTMLDivElement | null>(null);

  /**
   * Screen pixels per surface pixel: the surface's box on screen over its
   * own width. The host's `zoom` stood for it, and a worksheet passed its
   * sheet zoom alone: in a workspace zoomed to 80% a drag left the ruler
   * behind the pointer.
   */
  const surfaceScale = useCallback((): number => {
    const element = elementRef.current;
    const surface = (element?.offsetParent ?? element?.parentElement) as HTMLElement | null | undefined;
    if (surface && surface.offsetWidth > 0) {
      const width = surface.getBoundingClientRect().width;
      if (width > 0) return width / surface.offsetWidth;
    }
    return zoomRef.current > 0 ? zoomRef.current : 1;
  }, []);
  /** A client point in surface pixels, from where the ruler's centre is on screen. */
  const surfacePointAt = useCallback((clientX: number, clientY: number, scale: number): InkRulerPoint | null => {
    const box = elementRef.current?.getBoundingClientRect();
    if (!box || (box.width <= 0 && box.height <= 0)) return null;
    const shown = shownRef.current;
    return {
      x: shown.x + (clientX - (box.left + box.width / 2)) / scale,
      y: shown.y + (clientY - (box.top + box.height / 2)) / scale,
    };
  }, []);

  const pairAngle = () => {
    const [a, b] = [...pointersRef.current.values()];
    return a && b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : null;
  };
  const pairCentre = () => {
    const points = [...pointersRef.current.values()];
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x, y };
  };
  const lastAngleRef = useRef<number | null>(null);
  const lastCentreRef = useRef<{ x: number; y: number } | null>(null);
  // A fraction of a degree carried between moves, so slow turns add up.
  const turnCarryRef = useRef(0);
  const dragScaleRef = useRef(1);
  // Two fingers turn the ruler about the point between them, which moves
  // with them: the ruler stays under the hand that turns it.
  const pairPivotRef = useRef<InkRulerPoint | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragScaleRef.current = surfaceScale();
    const centre = pairCentre();
    lastCentreRef.current = centre;
    lastAngleRef.current = pairAngle();
    turnCarryRef.current = 0;
    pairPivotRef.current =
      pointersRef.current.size === 2 ? surfacePointAt(centre.x, centre.y, dragScaleRef.current) : null;
    if (pointersRef.current.size === 2) setTurning(true);
    event.currentTarget.focus({ preventScroll: true });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.stopPropagation();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const centre = pairCentre();
    const last = lastCentreRef.current ?? centre;
    const scale = dragScaleRef.current;
    const dx = (centre.x - last.x) / scale;
    const dy = (centre.y - last.y) / scale;
    let next = inkRulerMoved(rulerRef.current, dx, dy);
    lastCentreRef.current = centre;
    const pivot = pairPivotRef.current;
    if (pivot) pairPivotRef.current = { x: pivot.x + dx, y: pivot.y + dy };
    const angle = pairAngle();
    if (angle !== null && lastAngleRef.current !== null) {
      let delta = angle - lastAngleRef.current;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      turnCarryRef.current += delta;
      const whole = Math.trunc(turnCarryRef.current);
      if (whole !== 0) {
        next = pairPivotRef.current ? inkRulerTurnedAbout(next, whole, pairPivotRef.current) : inkRulerTurned(next, whole);
        turnCarryRef.current -= whole;
      }
    }
    lastAngleRef.current = angle;
    change(next);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.stopPropagation();
    pointersRef.current.delete(event.pointerId);
    lastCentreRef.current = pointersRef.current.size > 0 ? pairCentre() : null;
    lastAngleRef.current = pairAngle();
    pairPivotRef.current = null;
    if (pointersRef.current.size < 2) setTurning(false);
  };

  // The dial turns the ruler about its centre -- which is the dial's, so the
  // dial stays under the hand -- by the angle the pointer sweeps around it, a
  // degree at a time (fifteen with Shift, as the wheel steps).
  const dialRef = useRef<{ pointerId: number; cx: number; cy: number; from: number; angle: number } | null>(null);
  const onDialPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dialRef.current = {
      pointerId: event.pointerId,
      cx,
      cy,
      from: (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI,
      angle: rulerRef.current.angle,
    };
    setTurning(true);
    elementRef.current?.focus({ preventScroll: true });
  };
  const onDialPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dial = dialRef.current;
    if (!dial || dial.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - dial.cx;
    const dy = event.clientY - dial.cy;
    if (Math.hypot(dx, dy) < INK_RULER_DIAL_DEAD_ZONE_PX) return;
    const swept = (Math.atan2(dy, dx) * 180) / Math.PI - dial.from;
    const step = event.shiftKey ? 15 : 1;
    const angle = normalizeInkRulerAngle(Math.round((dial.angle + swept) / step) * step);
    if (angle !== rulerRef.current.angle) change({ ...rulerRef.current, angle });
  };
  const onDialPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dial = dialRef.current;
    if (!dial || dial.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dialRef.current = null;
    setTurning(false);
  };

  // The wheel turns the ruler a degree a notch (fifteen with Shift), as
  // Office's ruler turns under the wheel, about the point under the pointer.
  // A turn the wheel started on the ruler is a session that keeps every
  // notch of that gesture, wherever the pointer drifts, so the page does not
  // scroll under it; a pause, a press elsewhere or Esc ends it, and the page
  // has its wheel back. The session's listener is on the window only while
  // it lasts: a non-passive window wheel listener holds up every scroll.
  const sessionRef = useRef<WheelTurnSession | null>(null);
  // When a wheel last scrolled something else (the event's own clock).
  const pageWheelAtRef = useRef(Number.NEGATIVE_INFINITY);
  const endWheelSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    if (session.timer !== null) clearTimeout(session.timer);
    session.detach();
  }, []);
  const turnByWheel = useCallback(
    (event: WheelEvent, session: WheelTurnSession) => {
      event.preventDefault();
      event.stopPropagation();
      if (session.timer !== null) clearTimeout(session.timer);
      session.timer = setTimeout(endWheelSession, INK_RULER_WHEEL_GESTURE_IDLE_MS);
      const direction = Math.sign(event.deltaY || event.deltaX);
      if (direction === 0) return;
      const current = rulerRef.current;
      // The pivot follows the pointer while it is on the ruler.
      const origin = session.origin;
      if (origin) {
        const at = {
          x: origin.at.x + (event.clientX - origin.clientX) / session.scale,
          y: origin.at.y + (event.clientY - origin.clientY) / session.scale,
        };
        if (inkRulerContains(current, at, lengthRef.current)) session.pivot = at;
      }
      const step = (event.shiftKey ? 15 : 1) * direction;
      change(session.pivot ? inkRulerTurnedAbout(current, step, session.pivot) : inkRulerTurned(current, step));
    },
    [change, endWheelSession],
  );
  const onWheel = useCallback(
    (event: WheelEvent) => {
      // A live session's window listener has the event before it gets here.
      if (sessionRef.current) {
        turnByWheel(event, sessionRef.current);
        return;
      }
      // A scroll of the page that ran into the ruler goes on scrolling it.
      if (event.timeStamp - pageWheelAtRef.current < INK_RULER_WHEEL_GESTURE_IDLE_MS) {
        pageWheelAtRef.current = event.timeStamp;
        return;
      }
      const element = elementRef.current;
      const view = element?.ownerDocument.defaultView;
      if (!element || !view) return;
      const scale = surfaceScale();
      const at = surfacePointAt(event.clientX, event.clientY, scale);
      const onSessionWheel = (sessionEvent: WheelEvent) => {
        if (sessionRef.current === session) turnByWheel(sessionEvent, session);
      };
      const onPressElsewhere = (press: PointerEvent) => {
        if (!(press.target instanceof Node && element.contains(press.target))) endWheelSession();
      };
      const onEscape = (key: KeyboardEvent) => {
        if (key.key === "Escape") endWheelSession();
      };
      const session: WheelTurnSession = {
        pivot: at,
        origin: at ? { clientX: event.clientX, clientY: event.clientY, at } : null,
        scale,
        timer: null,
        detach: () => {
          view.removeEventListener("wheel", onSessionWheel, true);
          view.removeEventListener("pointerdown", onPressElsewhere, true);
          view.removeEventListener("keydown", onEscape, true);
        },
      };
      sessionRef.current = session;
      view.addEventListener("wheel", onSessionWheel, { capture: true, passive: false });
      view.addEventListener("pointerdown", onPressElsewhere, true);
      view.addEventListener("keydown", onEscape, true);
      turnByWheel(event, session);
    },
    [endWheelSession, surfacePointAt, surfaceScale, turnByWheel],
  );
  useEffect(() => {
    const element = elementRef.current;
    const view = element?.ownerDocument.defaultView;
    if (!element || !view) return;
    // Passive: it only notes a scroll going on elsewhere.
    const onAnyWheel = (event: WheelEvent) => {
      if (sessionRef.current) return;
      if (event.target instanceof Node && element.contains(event.target)) return;
      pageWheelAtRef.current = event.timeStamp;
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    view.addEventListener("wheel", onAnyWheel, { capture: true, passive: true });
    return () => {
      element.removeEventListener("wheel", onWheel);
      view.removeEventListener("wheel", onAnyWheel, true);
      endWheelSession();
    };
  }, [endWheelSession, onWheel]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 1;
    const nudge = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowLeft":
        onChange(event.altKey ? inkRulerMoved(ruler, -nudge, 0) : inkRulerTurned(ruler, -step));
        break;
      case "ArrowRight":
        onChange(event.altKey ? inkRulerMoved(ruler, nudge, 0) : inkRulerTurned(ruler, step));
        break;
      case "ArrowUp":
        onChange(inkRulerMoved(ruler, 0, -nudge));
        break;
      case "ArrowDown":
        onChange(inkRulerMoved(ruler, 0, nudge));
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const style: CSSProperties = {
    position: "absolute",
    left: ruler.x - length / 2,
    top: ruler.y - INK_RULER_THICKNESS_PX / 2,
    width: length,
    height: INK_RULER_THICKNESS_PX,
    transform: `rotate(${ruler.angle}deg)`,
    transformOrigin: "50% 50%",
    pointerEvents: "auto",
    touchAction: "none",
    userSelect: "none",
    cursor: "move",
    zIndex: 2,
    borderRadius: 6,
    background: "linear-gradient(180deg, rgba(255,255,255,0.86), rgba(236,240,245,0.86))",
    boxShadow: "0 1px 2px rgba(15,23,42,0.18), 0 6px 18px rgba(15,23,42,0.18), inset 0 0 0 1px rgba(15,23,42,0.22)",
    backdropFilter: "blur(2px)",
    WebkitBackdropFilter: "blur(2px)",
    outline: "none",
  };
  return (
    <div
      ref={elementRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={ruler.angle}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuetext={`${ruler.angle}°`}
      data-testid={testId}
      data-angle={ruler.angle}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange({ ...ruler, angle: 0 })}
      // A finger's double tap sets it straight as a double-click does.
      onClick={doubleClickOnDoubleTap}
    >
      <svg aria-hidden="true" width={length} height={INK_RULER_THICKNESS_PX} style={{ display: "block", overflow: "visible" }}>
        <path
          d={ticks(length)}
          transform={`translate(${length / 2} 0)`}
          stroke="rgba(15, 23, 42, 0.55)"
          strokeWidth={1}
          fill="none"
        />
      </svg>
      <div
        aria-hidden="true"
        data-testid={`${testId}-dial`}
        onPointerDown={onDialPointerDown}
        onPointerMove={onDialPointerMove}
        onPointerUp={onDialPointerUp}
        onPointerCancel={onDialPointerUp}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: INK_RULER_DIAL_PX,
          height: INK_RULER_DIAL_PX,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          cursor: turning ? "grabbing" : "grab",
          touchAction: "none",
          background: "radial-gradient(circle at 50% 35%, #ffffff, #e8edf3)",
          boxShadow: turning
            ? "0 0 0 2px rgba(37, 99, 235, 0.55), 0 2px 6px rgba(15, 23, 42, 0.25)"
            : "inset 0 0 0 1px rgba(15, 23, 42, 0.28), 0 1px 3px rgba(15, 23, 42, 0.22)",
        }}
      >
        <svg
          width={INK_RULER_DIAL_PX}
          height={INK_RULER_DIAL_PX}
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          <path d={dialTicks(INK_RULER_DIAL_PX)} stroke="rgba(15, 23, 42, 0.45)" strokeWidth={1.2} strokeLinecap="round" fill="none" />
        </svg>
        <span
          style={{
            position: "relative",
            font: "600 11px/1 system-ui, sans-serif",
            color: "rgba(15, 23, 42, 0.85)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {ruler.angle}°
        </span>
      </div>
    </div>
  );
}
