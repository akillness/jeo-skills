"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import type { PdfSplitLineAxis, PdfSplitPageModeView } from "./hooks/usePdfSplitPageMode";
import styles from "./PdfSplitPage.module.css";

const KEY_STEP = 0.005;
const KEY_STEP_LARGE = 0.05;

/**
 * The split lines of one page in WPS 分割页面 mode: red dashed lines through
 * the page as displayed, each dragged (or nudged with the arrow keys) into
 * place; the selected one is solid.
 */
export function PdfSplitPageOverlay({
  page,
  mode,
}: {
  readonly page: number;
  readonly mode: PdfSplitPageModeView;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ axis: PdfSplitLineAxis; index: number; pointerId: number } | null>(null);
  const grid = mode.active ? mode.gridFor(page) : null;
  if (!grid) return null;

  const fractionAt = (axis: PdfSplitLineAxis, event: PointerEvent<HTMLElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return axis === "columns"
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
  };

  const lineProps = (axis: PdfSplitLineAxis, index: number, at: number) => {
    const selected =
      mode.selected?.page === page &&
      mode.selected.axis === axis &&
      mode.selected.index === index;
    return {
      key: `${axis}-${index}`,
      role: "separator" as const,
      tabIndex: 0,
      "aria-orientation": axis === "columns" ? ("vertical" as const) : ("horizontal" as const),
      "aria-label": mode.label,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Math.round(at * 100),
      "data-selected": selected ? "true" : "false",
      "data-testid": `pdf-split-line-${axis}-${index}`,
      className: `${styles.line} ${axis === "columns" ? styles.lineColumn : styles.lineRow}`,
      style: axis === "columns" ? { left: `${at * 100}%` } : { top: `${at * 100}%` },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (mode.busy || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        mode.select({ page, axis, index });
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* capture is best-effort */
        }
        dragRef.current = { axis, index, pointerId: event.pointerId };
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const fraction = fractionAt(drag.axis, event);
        if (fraction === null) return;
        event.preventDefault();
        mode.moveLine({ page, axis: drag.axis, index: drag.index }, fraction);
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* best-effort */
        }
      },
      onPointerCancel: () => {
        dragRef.current = null;
      },
      onFocus: () => mode.select({ page, axis, index }),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        const back = axis === "columns" ? "ArrowLeft" : "ArrowUp";
        const forward = axis === "columns" ? "ArrowRight" : "ArrowDown";
        if (event.key !== back && event.key !== forward) return;
        event.preventDefault();
        event.stopPropagation();
        mode.moveLine({ page, axis, index }, at + (event.key === forward ? step : -step));
      },
    };
  };

  const selectedHere = mode.selected?.page === page;
  return (
    <div ref={rootRef} className={styles.overlay} data-testid={`pdf-split-overlay-${page}`}>
      {selectedHere ? (
        <div
          className={styles.catcher}
          onPointerDown={(event) => {
            event.stopPropagation();
            mode.select(null);
          }}
        />
      ) : null}
      {grid.columns.map((at, index) => {
        const { key, ...props } = lineProps("columns", index, at);
        return <div key={key} {...props} />;
      })}
      {grid.rows.map((at, index) => {
        const { key, ...props } = lineProps("rows", index, at);
        return <div key={key} {...props} />;
      })}
    </div>
  );
}
