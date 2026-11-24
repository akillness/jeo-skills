"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useOpenedOnce } from "../../lib/use-opened-once";
import {
  Check,
  ChevronDown,
  RotateCcw,
} from "../office-ribbon/icons/houseIcons";
import { useTranslations } from "../../../host/next-intl";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  ContinuousZoomDialPopover,
  ContinuousZoomPanelContext,
} from "./ContinuousZoomDialPopover";
import styles from "./ContinuousZoomDial.module.css";



















/** Wheel sensitivity, in unit positions per pixel. */
const WHEEL_POSITION_PER_PIXEL = 0.25 / (4 * 360);
const WHEEL_COMMIT_DELAY_MS = 180;
/** A level, a typed value, a reset or a track click eases over this long. */
const TRANSITION_MS = 420;
const DEFAULT_KEYBOARD_POSITION_STEP = 6 / (4 * 360);
const DEFAULT_KEYBOARD_PAGE_POSITION_STEP = 90 / (4 * 360);
/** A press that moves less than this is a click (it opens the levels). */
const DRAG_SLOP_PX = 3;
/** The levels a percentage offers, where they fall inside its range. */
const PERCENT_LEVELS = [25, 50, 75, 100, 125, 150, 200, 300, 400];
const EPSILON = 1e-6;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function validPositionStep(
  value: number | undefined,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/** Wrap a pointer-angle difference across 0° without jumping a full turn. */
export function shortestContinuousZoomDialAngleDelta(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export interface ContinuousZoomDialIconProps {
  className?: string;
  size?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}

export interface ContinuousZoomDialProps {
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  valueToPosition: (value: number, min: number, max: number) => number;
  positionToValue: (position: number, min: number, max: number) => number;
  formatter: (value: number) => string;
  ariaValueText: (value: number) => string;
  ariaValueNow?: (value: number) => number;
  label: string;
  resetLabel: string;
  disabled?: boolean;
  /** Disable only the reset action while leaving the zoom adjustable. */
  resetDisabled?: boolean;
  /** Truthful machine-readable explanation for an independently disabled reset. */
  resetDisabledReason?: string;
  testIdPrefix: string;
  className?: string;
  ResetIcon?: ComponentType<ContinuousZoomDialIconProps>;
  resolveResetValue?: () => number;
  onResetCommit?: (value: number) => void;
  onPreview?: (value: number) => void;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  keyboardPositionStep?: number;
  keyboardPagePositionStep?: number;
  /** The levels the thumb's menu offers (values in the caller's unit).
   *  Without them: Office's percentages for a percentage, every whole level
   *  for a short whole-number scale, else seven even stops of the range. */
  presets?: readonly number[];
  /** The levels list's name; a zoom's by default ("Zoom levels"), another
   *  scale names its own (the memory graph's certainty filter). */
  listLabel?: string;
  /** Where the levels open from the thumb: above it on a status bar. */
  menuSide?: "top" | "bottom";
  menuAlign?: "start" | "center" | "end";
}

interface ZoomScale {
  /** Percentage points per value unit, when the reading is a percentage. */
  percentPerUnit: number | null;
  levels: number[];
}

/** What the caller's reading is: a percentage (and its unit), or a scale. */
function zoomScaleOf(
  min: number,
  max: number,
  defaultValue: number,
  formatter: (value: number) => string,
  positionToValue: (position: number, min: number, max: number) => number,
  presets: readonly number[] | undefined,
): ZoomScale {
  const inRange = (v: number) =>
    Number.isFinite(v) && v >= min - EPSILON && v <= max + EPSILON;
  const reading = formatter(defaultValue).trim();
  const shown = Number.parseFloat(
    reading.replace(/[^\d.,-]/g, "").replace(",", "."),
  );
  const percentPerUnit =
    /%$/.test(reading) && Number.isFinite(shown) && shown > 0 && defaultValue > 0
      ? shown / defaultValue
      : null;
  let levels: number[];
  if (presets && presets.length > 0) {
    levels = presets.filter(inRange);
  } else if (percentPerUnit !== null) {
    levels = PERCENT_LEVELS.map((p) => p / percentPerUnit).filter(inRange);
  } else if (Number.isInteger(min) && Number.isInteger(max) && max - min <= 24) {
    levels = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  } else {
    levels = Array.from({ length: 7 }, (_, i) =>
      positionToValue(i / 6, min, max),
    ).filter(inRange);
  }
  return {
    percentPerUnit,
    levels: [...new Set(levels)].sort((a, b) => a - b),
  };
}

type ControlStyle = CSSProperties & { "--continuous-zoom-position": string };

interface ZoomMotion {
  frame: number | null;
  target: number;
  /** a reset lands with onResetCommit too */
  reset: boolean;
}

/**
 * The shared zoom slider: the thumb reads the zoom and opens its levels.
 * Callers own value mapping, display text, persistence and placement.
 */
export function ContinuousZoomDial({
  value,
  min,
  max,
  defaultValue,
  valueToPosition,
  positionToValue,
  formatter,
  ariaValueText,
  ariaValueNow,
  label,
  resetLabel,
  disabled = false,
  resetDisabled = false,
  resetDisabledReason,
  testIdPrefix,
  className,
  ResetIcon = RotateCcw,
  resolveResetValue,
  onResetCommit,
  onPreview,
  onChange,
  onCommit,
  keyboardPositionStep,
  keyboardPagePositionStep,
  presets,
  listLabel,
  menuSide = "bottom",
  menuAlign = "center",
}: ContinuousZoomDialProps) {
  const t = useTranslations("common");
  const panel = useContext(ContinuousZoomPanelContext);
  const position = clampUnit(valueToPosition(value, min, max));
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const thumbTextRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef(position);
  const pendingPositionRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const pendingWheelValueRef = useRef<number | null>(null);
  const motionRef = useRef<ZoomMotion | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    grab: number;
    startX: number;
    moved: boolean;
    /** The thumb's travel (track less thumb) when the drag began. */
    span: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const wasOpenRef = useRef(false);
  const callbacksRef = useRef({
    onPreview,
    onChange,
    onCommit,
    onResetCommit,
    resolveResetValue,
  });
  const disabledRef = useRef(disabled);
  const modelRef = useRef({
    min,
    max,
    defaultValue,
    valueToPosition,
    positionToValue,
    formatter,
  });
  const [moving, setMoving] = useState<"reset" | "transition" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Every editor's status bar has a dial, and a Radix menu re-anchors after
  // each render even while closed: a desk of twenty code windows kept twenty
  // of them scheduling updates while it loaded. Until its menu is first
  // opened the dial renders just the anchor.
  const menuMounted = useOpenedOnce(menuOpen && !disabled);
  const menuOpenRef = useRef(false);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);
  const scale = useMemo(
    () =>
      zoomScaleOf(min, max, defaultValue, formatter, positionToValue, presets),
    [defaultValue, formatter, max, min, positionToValue, presets],
  );

  // An active gesture stays independent of callback identity churn: a caller
  // may rebuild a large view for every preview.
  useLayoutEffect(() => {
    callbacksRef.current = {
      onPreview,
      onChange,
      onCommit,
      onResetCommit,
      resolveResetValue,
    };
    disabledRef.current = disabled;
    modelRef.current = {
      min,
      max,
      defaultValue,
      valueToPosition,
      positionToValue,
      formatter,
    };
  });

  useEffect(() => {
    if (
      previewFrameRef.current === null &&
      motionRef.current === null &&
      dragRef.current === null
    ) {
      positionRef.current = position;
    }
  }, [position]);

  const valueAt = useCallback((nextPosition: number) => {
    const model = modelRef.current;
    return model.positionToValue(clampUnit(nextPosition), model.min, model.max);
  }, []);
  const positionOf = useCallback((nextValue: number) => {
    const model = modelRef.current;
    const bounded = Math.min(model.max, Math.max(model.min, nextValue));
    return clampUnit(model.valueToPosition(bounded, model.min, model.max));
  }, []);

  /** Paint the thumb at once, without waiting for the caller's render. */
  const paint = useCallback(
    (nextPosition: number) => {
      const bounded = clampUnit(nextPosition);
      rootRef.current?.style.setProperty(
        "--continuous-zoom-position",
        `${bounded * 100}%`,
      );
      if (thumbTextRef.current) {
        thumbTextRef.current.textContent = modelRef.current.formatter(
          valueAt(bounded),
        );
      }
    },
    [valueAt],
  );

  const cancelQueuedPreview = useCallback(() => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPositionRef.current = null;
  }, []);

  const publishPosition = useCallback(
    (nextPosition: number, commit: boolean) => {
      const bounded = clampUnit(nextPosition);
      positionRef.current = bounded;
      cancelQueuedPreview();
      const nextValue = valueAt(bounded);
      paint(bounded);
      callbacksRef.current.onChange(nextValue);
      if (commit) callbacksRef.current.onCommit(nextValue);
      return nextValue;
    },
    [cancelQueuedPreview, paint, valueAt],
  );

  const queuePreview = useCallback(
    (nextPosition: number) => {
      const bounded = clampUnit(nextPosition);
      positionRef.current = bounded;
      pendingPositionRef.current = bounded;
      paint(bounded);
      if (previewFrameRef.current !== null) return;
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = null;
        const pending = pendingPositionRef.current;
        pendingPositionRef.current = null;
        if (pending !== null && !disabledRef.current) {
          const nextValue = valueAt(pending);
          const preview = callbacksRef.current.onPreview;
          if (preview) preview(nextValue);
          else callbacksRef.current.onChange(nextValue);
        }
      });
    },
    [paint, valueAt],
  );

  const clearWheelCommit = useCallback(() => {
    if (wheelCommitTimerRef.current !== null) {
      window.clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = null;
    }
    pendingWheelValueRef.current = null;
  }, []);

  const cancelMotion = useCallback(() => {
    const motion = motionRef.current;
    if (motion?.frame != null) cancelAnimationFrame(motion.frame);
    motionRef.current = null;
    if (motion) cancelQueuedPreview();
    setMoving(null);
  }, [cancelQueuedPreview]);

  // Unmounting mid-gesture still lands what was asked for: a running
  // transition commits its target (a reset also reports itself), a pending
  
  useEffect(
    () => () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      if (wheelCommitTimerRef.current !== null) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      const motion = motionRef.current;
      motionRef.current = null;
      if (motion) {
        if (motion.frame != null) cancelAnimationFrame(motion.frame);
        const model = modelRef.current;
        const landed = model.positionToValue(
          clampUnit(motion.target),
          model.min,
          model.max,
        );
        callbacksRef.current.onChange(landed);
        callbacksRef.current.onCommit(landed);
        if (motion.reset) callbacksRef.current.onResetCommit?.(landed);
      }
      const pendingWheelValue = pendingWheelValueRef.current;
      if (pendingWheelValue !== null) {
        callbacksRef.current.onCommit(pendingWheelValue);
      }
    },
    [],
  );

  useEffect(() => {
    if (!disabled) return;
    cancelQueuedPreview();
    clearWheelCommit();
    cancelMotion();
    dragRef.current = null;
    positionRef.current = position;
    paint(position);
    setMenuOpen(false);
  }, [
    cancelMotion,
    cancelQueuedPreview,
    clearWheelCommit,
    disabled,
    paint,
    position,
  ]);

  useEffect(() => {
    if (resetDisabled && motionRef.current?.reset) cancelMotion();
  }, [cancelMotion, resetDisabled]);

  /* A transition to `targetPosition`: eased previews, then one landing
     (change + commit, and onResetCommit for a reset). A level, a typed
     value or a reset lands on that exact value (`exact`), not on what its
     position maps back to. */
  const moveTo = useCallback(
    (targetPosition: number, reset: boolean, exact?: number) => {
      cancelMotion();
      clearWheelCommit();
      const target = clampUnit(targetPosition);
      const start = positionRef.current;
      const land = () => {
        motionRef.current = null;
        setMoving(null);
        let landed: number;
        if (exact === undefined) {
          landed = publishPosition(target, true);
        } else {
          positionRef.current = target;
          cancelQueuedPreview();
          paint(target);
          landed = exact;
          callbacksRef.current.onChange(exact);
          callbacksRef.current.onCommit(exact);
        }
        if (reset) callbacksRef.current.onResetCommit?.(landed);
      };
      const reduceMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      if (reduceMotion || Math.abs(target - start) <= Number.EPSILON) {
        land();
        return;
      }
      const motion: ZoomMotion = { frame: null, target, reset };
      motionRef.current = motion;
      setMoving(reset ? "reset" : "transition");
      const startedAt = performance.now();
      const ease = reset ? easeOutCubic : easeInOutCubic;
      // timed on the same clock it started on (a frame's own timestamp may
      // run on another)
      const frame = () => {
        if (motionRef.current !== motion || disabledRef.current) return;
        const progress = clampUnit(
          (performance.now() - startedAt) / TRANSITION_MS,
        );
        if (progress >= 1) {
          land();
          return;
        }
        queuePreview(start + (target - start) * ease(progress));
        motion.frame = requestAnimationFrame(frame);
      };
      motion.frame = requestAnimationFrame(frame);
    },
    [
      cancelMotion,
      cancelQueuedPreview,
      clearWheelCommit,
      paint,
      publishPosition,
      queuePreview,
    ],
  );
  /* A value chosen outright, clamped to the range: eased there. */
  const moveToValue = useCallback(
    (nextValue: number, reset = false) => {
      const model = modelRef.current;
      const bounded = Math.min(model.max, Math.max(model.min, nextValue));
      moveTo(positionOf(bounded), reset, bounded);
    },
    [moveTo, positionOf],
  );

  const reset = useCallback(() => {
    if (disabledRef.current || resetDisabled) return;
    const model = modelRef.current;
    const requested =
      callbacksRef.current.resolveResetValue?.() ?? model.defaultValue;
    moveToValue(requested, true);
  }, [moveToValue, resetDisabled]);

  const scheduleWheelCommit = useCallback((nextValue: number) => {
    pendingWheelValueRef.current = nextValue;
    if (wheelCommitTimerRef.current !== null) {
      window.clearTimeout(wheelCommitTimerRef.current);
    }
    wheelCommitTimerRef.current = window.setTimeout(() => {
      wheelCommitTimerRef.current = null;
      const pending = pendingWheelValueRef.current;
      pendingWheelValueRef.current = null;
      if (pending !== null && !disabledRef.current) {
        callbacksRef.current.onCommit(pending);
      }
    }, WHEEL_COMMIT_DELAY_MS);
  }, []);

  // The wheel over the control zooms continuously. React's wheel listeners
  // are passive and cannot keep the page from scrolling, so listen natively.
  const onWheel = useCallback(
    (event: WheelEvent) => {
      if (disabledRef.current) return;
      event.preventDefault();
      cancelMotion();
      const pixels =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * 120
            : event.deltaY;
      const nextPosition = clampUnit(
        positionRef.current - pixels * WHEEL_POSITION_PER_PIXEL,
      );
      queuePreview(nextPosition);
      scheduleWheelCommit(valueAt(nextPosition));
    },
    [cancelMotion, queuePreview, scheduleWheelCommit, valueAt],
  );
  const onWheelRef = useRef(onWheel);
  useLayoutEffect(() => {
    onWheelRef.current = onWheel;
  }, [onWheel]);
  useEffect(() => {
    const target = rootRef.current;
    if (!target) return undefined;
    const listener = (event: WheelEvent) => onWheelRef.current(event);
    target.addEventListener("wheel", listener, { passive: false });
    return () => target.removeEventListener("wheel", listener);
  }, []);

  /* Where on the track a thumb whose left edge is at `left` (px from the
     track's start) sits, as a unit position: the thumb travels the track's
     width less its own. */
  const positionAtLeft = (left: number, span?: number) => {
    if (span !== undefined) return clampUnit(left / Math.max(1, span));
    const track = trackRef.current?.getBoundingClientRect();
    const thumb = thumbRef.current?.getBoundingClientRect();
    if (!track || !thumb) return positionRef.current;
    return clampUnit(left / Math.max(1, track.width - thumb.width));
  };

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    wasOpenRef.current = menuOpenRef.current;
    if (disabled || event.button !== 0) return;
    event.stopPropagation();
    const thumb = event.currentTarget.getBoundingClientRect();
    const track = trackRef.current?.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      grab: event.clientX - thumb.left,
      startX: event.clientX,
      moved: false,
      // The thumb shows the value, so its width changes as it is dragged
      // ("9.8%", "45.9%", "100%"). Measuring the travel afresh on every
      // move turned one steady drag into values that went back and forth,
      
      span: track ? Math.max(1, track.width - thumb.width) : 1,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onThumbPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < DRAG_SLOP_PX) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      cancelMotion();
      clearWheelCommit();
      setMenuOpen(false);
      rootRef.current?.setAttribute("data-dragging", "true");
    }
    const track = trackRef.current?.getBoundingClientRect();
    if (!track) return;
    queuePreview(
      positionAtLeft(event.clientX - track.left - drag.grab, drag.span),
    );
  };
  const endThumbDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    rootRef.current?.removeAttribute("data-dragging");
    suppressClickRef.current = true;
    if (!disabledRef.current) publishPosition(positionRef.current, true);
  };
  /* A click on the thumb (not a drag) opens the levels; a second one, or a
     click while they are open, closes them. */
  const onThumbClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = false;
    if (panel || disabled) return;
    setMenuOpen(!wasOpen && !menuOpenRef.current);
  };
  /* A press on the track away from the thumb goes there. */
  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const track = trackRef.current?.getBoundingClientRect();
    const thumb = thumbRef.current?.getBoundingClientRect();
    if (!track || !thumb) return;
    moveTo(positionAtLeft(event.clientX - track.left - thumb.width / 2), false);
  };

  const keyStep = validPositionStep(
    keyboardPositionStep,
    DEFAULT_KEYBOARD_POSITION_STEP,
  );
  const keyPageStep = validPositionStep(
    keyboardPagePositionStep,
    DEFAULT_KEYBOARD_PAGE_POSITION_STEP,
  );
  /** Arrows, Page Up/Down, Home/End on the thumb: continuous, at once. */
  const onThumbKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      // a button's own click opens the levels
      wasOpenRef.current = false;
      return;
    }
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? keyStep
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -keyStep
          : event.key === "PageUp"
            ? keyPageStep
            : event.key === "PageDown"
              ? -keyPageStep
              : event.key === "Home"
                ? -Infinity
                : event.key === "End"
                  ? Infinity
                  : null;
    if (delta === null) return;
    event.preventDefault();
    event.stopPropagation();
    cancelMotion();
    clearWheelCommit();
    publishPosition(
      delta === Infinity
        ? 1
        : delta === -Infinity
          ? 0
          : clampUnit(positionRef.current + delta),
      true,
    );
  };

  const formattedValue = formatter(value);
  const ariaNow = ariaValueNow?.(value) ?? value;
  
  const ariaMin = ariaValueNow?.(min) ?? min;
  const ariaMax = ariaValueNow?.(max) ?? max;
  const testId = (suffix: string) => `${testIdPrefix}-zoom-${suffix}`;
  const style = {
    "--continuous-zoom-position": `${position * 100}%`,
  } as ControlStyle;
  const ticks = scale.levels.length <= 16 ? scale.levels : [];

  const slider = (
    <div
      ref={trackRef}
      className={styles.track}
      data-testid={testId("track")}
      onPointerDown={onTrackPointerDown}
    >
      <span className={styles.rail} aria-hidden="true">
        <span className={styles.fill} />
        {ticks.map((level, index) => (
          <span
            key={`${level}:${index}`}
            className={styles.tick}
            style={{
              left: `${clampUnit(valueToPosition(level, min, max)) * 100}%`,
            }}
          />
        ))}
      </span>
      <button
        ref={thumbRef}
        type="button"
        role="slider"
        className={styles.thumb}
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-valuemin={ariaMin}
        aria-valuemax={ariaMax}
        aria-valuenow={Number.isFinite(ariaNow) ? ariaNow : undefined}
        aria-valuetext={ariaValueText(value)}
        aria-haspopup={panel ? undefined : "dialog"}
        aria-expanded={panel ? undefined : menuOpen}
        tabIndex={disabled ? -1 : 0}
        data-testid={testId("dial")}
        data-open={menuOpen ? "true" : undefined}
        onPointerDown={onThumbPointerDown}
        onPointerMove={onThumbPointerMove}
        onPointerUp={endThumbDrag}
        onPointerCancel={endThumbDrag}
        onClick={onThumbClick}
        onKeyDown={onThumbKeyDown}
      >
        <span ref={thumbTextRef} className={styles.thumbText}>
          {formattedValue}
        </span>
        {panel ? null : (
          <ChevronDown
            className={styles.chevron}
            size={11}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );

  const list = (
    <ZoomLevelList
      levels={scale.levels}
      value={value}
      formatter={formatter}
      listLabel={listLabel ?? t("zoom.levels")}
      testId={testId}
      disabled={disabled}
      reset={{
        label: resetLabel,
        reason: resetDisabled ? resetDisabledReason : undefined,
        disabled: disabled || resetDisabled,
        resetting: moving === "reset",
        Icon: ResetIcon,
        onReset: () => {
          setMenuOpen(false);
          reset();
        },
      }}
      onPick={(level) => {
        setMenuOpen(false);
        moveToValue(level);
      }}
      field={
        scale.percentPerUnit !== null
          ? {
              percent: value * scale.percentPerUnit,
              label: t("zoom.custom"),
              onApply: (percent) => {
                setMenuOpen(false);
                moveToValue(percent / (scale.percentPerUnit ?? 1));
              },
            }
          : null
      }
    />
  );

  const rootProps = {
    ref: rootRef,
    className: [styles.control, panel ? styles.panel : styles.inline, className]
      .filter(Boolean)
      .join(" "),
    role: "group" as const,
    // Under a finger the slider zooms whole: its thumb is placed by script
    // along the track (styles/touch-sizing.css).
    "data-touch-scale": "region",
    "aria-label": label,
    "aria-disabled": disabled || undefined,
    "data-disabled": disabled ? "true" : undefined,
    "data-testid": testId("control"),
    "data-resetting": moving === "reset" ? "true" : "false",
    "data-moving": moving ? "true" : "false",
    style,
  };

  if (panel) {
    return (
      <div {...rootProps}>
        {slider}
        {list}
      </div>
    );
  }

  return (
    <div {...rootProps}>
      {slider}
      {menuMounted ? (
      <ContinuousZoomDialPopover
        open={menuOpen && !disabled}
        onOpenChange={(next) => setMenuOpen(next && !disabledRef.current)}
        anchorRef={thumbRef}
        label={label}
        testIdPrefix={testIdPrefix}
        side={menuSide}
        align={menuAlign}
        className={styles.menu}
        trigger={<span className={styles.menuAnchor} aria-hidden="true" />}
      >
        {list}
      </ContinuousZoomDialPopover>
      ) : (
        <span className={styles.menuAnchor} aria-hidden="true" />
      )}
    </div>
  );
}

interface ZoomLevelListProps {
  levels: readonly number[];
  value: number;
  formatter: (value: number) => string;
  listLabel: string;
  testId: (suffix: string) => string;
  disabled: boolean;
  reset: {
    label: string;
    reason: string | undefined;
    disabled: boolean;
    resetting: boolean;
    Icon: ComponentType<ContinuousZoomDialIconProps>;
    onReset: () => void;
  };
  onPick: (level: number) => void;
  field: {
    percent: number;
    label: string;
    onApply: (percent: number) => void;
  } | null;
}

/** The caller's reset/fit, the levels (the one in use checked) and the field. */
function ZoomLevelList({
  levels,
  value,
  formatter,
  listLabel,
  testId,
  disabled,
  reset,
  onPick,
  field,
}: ZoomLevelListProps) {
  const current = formatter(value);
  const resetName = reset.reason ? `${reset.label}: ${reset.reason}` : reset.label;
  // Up/Down walk the rows the way a menu's do; Tab still reaches the field.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.getAttribute("role") === "slider") {
      return;
    }
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled)",
      ),
    );
    const at = rows.indexOf(target);
    if (at < 0 || rows.length === 0) return;
    event.preventDefault();
    const next =
      rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length];
    next?.focus();
  };
  return (
    <div className={styles.list} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={styles.row}
        aria-label={resetName}
        title={resetName}
        disabled={reset.disabled}
        data-disabled-reason={reset.reason}
        data-testid={testId("reset")}
        data-resetting={reset.resetting ? "true" : "false"}
        onClick={reset.onReset}
      >
        <reset.Icon className={styles.rowIcon} size={14} aria-hidden="true" />
        <span className={styles.rowLabel}>{reset.label}</span>
      </button>
      <span className={styles.separator} aria-hidden="true" />
      <div role="group" aria-label={listLabel} className={styles.levels}>
        {levels.map((level, index) => {
          const text = formatter(level);
          const checked = text === current;
          return (
            <button
              key={`${level}:${index}`}
              type="button"
              className={styles.row}
              aria-pressed={checked}
              disabled={disabled}
              data-zoom-focus={checked ? "true" : undefined}
              data-testid={testId(`level-${index}`)}
              onClick={() => onPick(level)}
            >
              <Check
                className={styles.rowCheck}
                size={13}
                strokeWidth={2.4}
                aria-hidden="true"
              />
              <span className={styles.rowLabel}>{text}</span>
            </button>
          );
        })}
      </div>
      {field ? (
        <>
          <span className={styles.separator} aria-hidden="true" />
          <ZoomPercentField
            key={Math.round(field.percent)}
            percent={field.percent}
            label={field.label}
            testId={testId("field")}
            disabled={disabled}
            onApply={field.onApply}
          />
        </>
      ) : null}
    </div>
  );
}

/** A percentage typed outright, as in Office's Zoom dialog. */
function ZoomPercentField({
  percent,
  label,
  testId,
  disabled,
  onApply,
}: {
  percent: number;
  label: string;
  testId: string;
  disabled: boolean;
  onApply: (percent: number) => void;
}) {
  const id = useId();
  const shown = String(Math.round(percent));
  const [draft, setDraft] = useState(shown);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(typed) && typed > 0) onApply(typed);
    else setDraft(shown);
  };
  return (
    <form className={styles.field} onSubmit={submit}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <span className={styles.fieldBox}>
        <input
          id={id}
          className={styles.fieldInput}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          data-testid={testId}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
        />
        <span className={styles.fieldUnit} aria-hidden="true">
          %
        </span>
      </span>
    </form>
  );
}
