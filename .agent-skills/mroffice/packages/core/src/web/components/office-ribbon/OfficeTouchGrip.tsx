"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type { PointerEvent as ReactPointerEvent } from "react";

import { TOUCH_TARGET_MIN_PX } from "../../lib/touch-gestures";

import styles from "./OfficeTouchGrip.module.css";

/**
 * One touch grip (Office's selection handles on a touch screen): a small
 * visible mark centred on a point of the editor's overlay layer, inside a
 * transparent target at least 44 × 44 CSS px, so the mark can stay as small
 * as the mouse affordance it stands for while a finger still hits it.
 *
 * - `selection`: the round handle at a selection corner (Excel's cell range,
 *   Word's text selection).
 * - `fill`: the square fill handle Excel shows below the selection handle on
 *   a touch screen.
 * - `resize-col` / `resize-row`: the double line on a heading's edge that a
 *   finger drags to change a column width or row height.
 *
 * The grip knows nothing about what it drives; `onPointerDown` hands the press
 * to the editor's adapter. `x` / `y` are in the positioned parent's pixels.
 */
export type OfficeTouchGripVariant = "selection" | "fill" | "resize-col" | "resize-row";

export function OfficeTouchGrip({
  x,
  y,
  variant,
  testId,
  label,
  hitWidth = TOUCH_TARGET_MIN_PX,
  hitHeight = TOUCH_TARGET_MIN_PX,
  hitOffsetX = 0,
  hitOffsetY = 0,
  emphasis = false,
  zIndex,
  onPointerDown,
}: {
  readonly x: number;
  readonly y: number;
  readonly variant: OfficeTouchGripVariant;
  readonly testId?: string;
  /** A name for assistive technology; a grip without one is decorative. */
  readonly label?: string;
  readonly hitWidth?: number;
  readonly hitHeight?: number;
  /** Shift the target off the mark (toward the side a neighbouring target
   * does not claim); the mark stays on (x, y). */
  readonly hitOffsetX?: number;
  readonly hitOffsetY?: number;
  /** Draw attention to the grip (just armed, or just appeared by a hold). */
  readonly emphasis?: boolean;
  readonly zIndex?: number;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void;
}): React.JSX.Element {
  const width = Math.max(TOUCH_TARGET_MIN_PX, hitWidth);
  const height = Math.max(TOUCH_TARGET_MIN_PX, hitHeight);
  return (
    <span
      className={styles.grip}
      data-variant={variant}
      data-emphasis={emphasis ? "true" : undefined}
      data-testid={testId}
      data-office-touch-grip=""
      role={label ? "button" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onPointerDown={onPointerDown}
      // A grip is pressed, never focused or text-selected.
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: Math.round(x - width / 2 + hitOffsetX),
        top: Math.round(y - height / 2 + hitOffsetY),
        width,
        height,
        zIndex,
      }}
    >
      <span
        className={styles.mark}
        aria-hidden="true"
        style={{ left: width / 2 - hitOffsetX, top: height / 2 - hitOffsetY }}
      />
    </span>
  );
}
