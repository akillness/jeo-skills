"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pen Gestures ▸ Circle to Lasso: the Select chip a pen circle around ink
 * offers for a moment (lib/office-ink-pen-gestures). Tapped, the circle goes
 * and what it enclosed is selected as the lasso would select it; left alone,
 * the circle stays the ink it is. Docs, the deck and the worksheet show the
 * same chip, each placing it in its own surface's pixels.
 */

import { Lasso } from "lucide-react";

import { INK_LASSO_OVERLAY_ATTRIBUTE } from "../../lib/office-ink-lasso-selection";

import styles from "./OfficeInkCircleSelect.module.css";

/** How long the chip waits for its tap before the circle lands as ink. */
export const INK_CIRCLE_OFFER_MS = 2600;

export interface OfficeInkCircleOffer {
  /** The chip's anchor: the circle's top middle (or its bottom, near the top edge). */
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

/** Where the chip stands for a circle drawn over these points. */
export function inkCircleOfferAt(
  points: readonly { x: number; y: number }[],
  roomAbove = 48,
  gap = 8,
): OfficeInkCircleOffer {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  const below = top < roomAbove;
  return { x: (left + right) / 2, y: below ? bottom + gap : top - gap, below };
}

export function OfficeInkCircleSelect({
  offer,
  label,
  testId,
  space,
  onSelect,
}: {
  offer: OfficeInkCircleOffer;
  label: string;
  testId: string;
  /** The offer's unit spans this box (the deck's slide EMU): placed in percent of it. Else pixels. */
  space?: { readonly width: number; readonly height: number };
  onSelect: () => void;
}) {
  const at = (value: number, span: number | undefined) =>
    span ? `${(value / span) * 100}%` : value;
  return (
    <button
      type="button"
      className={styles.chip}
      data-testid={testId}
      data-no-press
      // The editors' ink presses pass over the lasso's own controls.
      {...{ [INK_LASSO_OVERLAY_ATTRIBUTE]: "true" }}
      style={{
        left: at(offer.x, space?.width),
        top: at(offer.y, space?.height),
        transform: `translate(-50%, ${offer.below ? "0" : "-100%"})`,
      }}
      // Not a stroke: the drawing surface under it never sees the press.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <Lasso size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
