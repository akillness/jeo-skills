"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import styles from "./SlidingSegmentedControl.module.css";

export interface SlidingSegmentOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  /** Quiet trailing detail, e.g. a count; not part of the accessible name. */
  badge?: ReactNode;
  testId?: string;
  /** Shown but not choosable: skipped by the keyboard, the pointer and clicks. */
  disabled?: boolean;
}

interface SlidingSegmentedControlProps<Value extends string> {
  value: Value;
  /** Two or more segments; the thumb is one segment wide. */
  options: readonly [
    SlidingSegmentOption<Value>,
    SlidingSegmentOption<Value>,
    ...SlidingSegmentOption<Value>[],
  ];
  onChange: (value: Value) => void;
  ariaLabel: string;
  testId?: string;
  semantic?: "tabs" | "radiogroup";
  className?: string;
  /** Every segment is unavailable (the thumb stays where the value is). */
  disabled?: boolean;
  /** `compact` is the dense row variant: smaller, and without its own blur. */
  size?: "regular" | "compact";
}

const DRAG_THRESHOLD_PX = 4;

export function SlidingSegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
  semantic = "radiogroup",
  className,
  disabled = false,
  size = "regular",
}: SlidingSegmentedControlProps<Value>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartXRef = useRef(0);
  const pointerIndexRef = useRef(0);
  const pointerMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const resolvedIndex = options.findIndex((option) => option.value === value);
  const activeIndex = resolvedIndex >= 0 ? resolvedIndex : 0;
  const selectable = (index: number) =>
    !disabled && index >= 0 && index < options.length &&
    options[index].disabled !== true;

  const selectIndex = (index: number, focus = false) => {
    const nextIndex = Math.max(0, Math.min(options.length - 1, index));
    if (!selectable(nextIndex)) return;
    onChange(options[nextIndex].value);
    if (focus) buttonRefs.current[nextIndex]?.focus();
  };

  /** The next choosable segment from `index` in `step` direction, wrapping. */
  const nextSelectable = (index: number, step: 1 | -1) => {
    const count = options.length;
    for (let hop = 1; hop <= count; hop += 1) {
      const candidate = (((index + step * hop) % count) + count) % count;
      if (selectable(candidate)) return candidate;
    }
    return null;
  };

  const indexFromClientX = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return activeIndex;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return activeIndex;
    const ratio = Math.max(
      0,
      Math.min(0.999, (clientX - rect.left) / rect.width),
    );
    const visualIndex = Math.floor(ratio * options.length);
    return getComputedStyle(root).direction === "rtl"
      ? options.length - 1 - visualIndex
      : visualIndex;
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || event.isPrimary === false) return;
    pointerIdRef.current = event.pointerId;
    pointerStartXRef.current = event.clientX;
    pointerMovedRef.current = false;
    pointerIndexRef.current = indexFromClientX(event.clientX);
    selectIndex(pointerIndexRef.current);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable in embedded browser test surfaces.
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (
      Math.abs(event.clientX - pointerStartXRef.current) >= DRAG_THRESHOLD_PX
    ) {
      pointerMovedRef.current = true;
    }
    if (!pointerMovedRef.current) return;
    const nextIndex = indexFromClientX(event.clientX);
    if (nextIndex === pointerIndexRef.current || !selectable(nextIndex)) return;
    pointerIndexRef.current = nextIndex;
    selectIndex(nextIndex);
  };

  const finishPointerGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (pointerMovedRef.current) {
      suppressClickRef.current = true;
      buttonRefs.current[pointerIndexRef.current]?.focus();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    pointerIdRef.current = null;
    pointerMovedRef.current = false;
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const isRtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let nextIndex: number | null = null;
    if (event.key === "Home") nextIndex = nextSelectable(-1, 1);
    if (event.key === "End") nextIndex = nextSelectable(options.length, -1);
    if (event.key === "ArrowRight") nextIndex = nextSelectable(index, isRtl ? -1 : 1);
    if (event.key === "ArrowLeft") nextIndex = nextSelectable(index, isRtl ? 1 : -1);
    if (
      nextIndex === null &&
      ["Home", "End", "ArrowRight", "ArrowLeft"].includes(event.key)
    ) {
      // Nothing else is choosable: keep the key from scrolling the page.
      event.preventDefault();
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    selectIndex(nextIndex, true);
  };

  const offset = `${activeIndex * 100}%`;
  const controlStyle = {
    "--sliding-segment-count": options.length,
    "--sliding-segment-offset": offset,
    "--sliding-segment-offset-rtl": `${activeIndex * -100}%`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`${styles.control}${className ? ` ${className}` : ""}`}
      role={semantic === "tabs" ? "tablist" : "radiogroup"}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-disabled={disabled || undefined}
      data-active-index={activeIndex}
      data-size={size === "compact" ? "compact" : undefined}
      data-testid={testId}
      style={controlStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerGesture}
      onPointerCancel={finishPointerGesture}
    >
      <span className={styles.indicator} aria-hidden="true" />
      {options.map((option, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role={semantic === "tabs" ? "tab" : "radio"}
            aria-selected={semantic === "tabs" ? active : undefined}
            aria-checked={semantic === "radiogroup" ? active : undefined}
            aria-label={option.label}
            tabIndex={active ? 0 : -1}
            disabled={disabled || option.disabled === true}
            className={styles.option}
            data-state={active ? "active" : "inactive"}
            data-testid={option.testId}
            onClick={() => {
              if (suppressClickRef.current) return;
              selectIndex(index);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.icon ? (
              <span className={styles.icon} aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span className={styles.label}>{option.label}</span>
            {option.badge !== undefined && option.badge !== null ? (
              <span className={styles.badge} aria-hidden="true">
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
