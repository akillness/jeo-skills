"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "@mrnote/core/web/components/office-ribbon/icons/houseIcons.tsx";

import {
  officeDialogClassName,
  officeDialogParts as parts,
} from "@mrnote/core/web/components/office-ribbon/officeDialogChrome.tsx";

import {
  ChartV2DataEditor,
  chartValidationIssueMessageKey,
  type ChartV2DataEditorLabels,
  type ChartV2DataEditorProps,
} from "./ChartV2DataEditor";

/** The data window's words, from the notebook catalogue (every editor's
 * chart without a workbook: a document's, a PDF page's). */
export function chartDataWindowLabels(t: (key: string) => string): ChartV2DataEditorLabels {
  return {
    category: t("block.chart.category"),
    series: t("block.chart.series"),
    addCategory: t("block.chart.addCategory"),
    addSeries: t("block.chart.addSeries"),
    removeCategory: t("block.chart.removeCategory"),
    removeSeries: t("block.chart.removeSeries"),
    title: t("block.chart.titleLabel"),
    done: t("block.chart.done"),
    value: t("block.chart.v2.value"),
    xValues: t("block.chart.v2.xValues"),
    yValues: t("block.chart.v2.yValues"),
    bubbleSizes: t("block.chart.v2.bubbleSizes"),
    role: t("block.chart.v2.role"),
    pointKind: t("block.chart.v2.pointKind.label"),
    pointKindValue: t("block.chart.v2.pointKind.value"),
    pointKindSubtotal: t("block.chart.v2.pointKind.subtotal"),
    pointKindTotal: t("block.chart.v2.pointKind.total"),
    id: t("block.chart.v2.id"),
    parentId: t("block.chart.v2.parentId"),
    label: t("block.chart.v2.label"),
    samples: t("block.chart.v2.samples"),
    regionCode: t("block.chart.v2.regionCode"),
    addRow: t("block.chart.v2.addRow"),
    removeRow: t("block.chart.v2.removeRow"),
    validationTitle: t("block.chart.v2.validationTitle"),
    validationIssue: (issue) => t(chartValidationIssueMessageKey(issue.code)),
  };
}

const WINDOW_MARGIN = 16;
const TITLE_BAR_HEIGHT = 42;
let nextWindowZIndex = 7_000;

// This editor lives in a body portal, outside every ProseMirror/page selector.
// The window itself is an Office dialog card (tone document), so its surface,
// title row, close button and plain fields take the shared chrome in light,
// dark and high contrast. This sheet only lays out the workbook inside it and
// draws what the chrome has no part for (the cell grid, the push buttons),
// reading the card's --office-dialog-* tokens, so inputs and table cells
// cannot fall back to browser-default, concatenated inline text.
export const CHART_DATA_WINDOW_STYLES = `
.chart-data-window,
.chart-data-window * {
  box-sizing: border-box;
}

.chart-data-window.chart-data-window {
  gap: 10px;
  padding: 12px 14px 14px;
}

.chart-data-window .chart-data-window__titlebar {
  cursor: move;
  user-select: none;
  /* The window is moved with a pointer-capture drag (startDrag); a finger or
     an iPad trackpad press must not become the browser's pan. */
  touch-action: none;
}

.chart-data-window__body {
  color: var(--office-dialog-ink);
  font-size: 12px;
}

.chart-data-window .chart-block__grid {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.chart-data-window .chart-block__grid-title {
  display: grid;
  width: min(100%, 620px);
  grid-template-columns: max-content minmax(220px, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--office-dialog-ink);
  font-size: 12px;
}

.chart-data-window .chart-block__grid-table {
  width: max-content;
  min-width: 100%;
  border: 1px solid var(--office-dialog-control-border);
  border-collapse: collapse;
  table-layout: auto;
  background: var(--office-dialog-surface);
  color: var(--office-dialog-ink);
  font-size: 12px;
}

.chart-data-window .chart-block__grid-table th,
.chart-data-window .chart-block__grid-table td {
  min-width: 104px;
  height: 34px;
  border: 1px solid var(--office-dialog-divider);
  padding: 0;
  text-align: left;
  vertical-align: middle;
}

.chart-data-window .chart-block__grid-table th {
  background: var(--office-dialog-surface-muted);
  color: var(--office-dialog-muted);
  font-weight: 600;
}

.chart-data-window .chart-block__grid-table th:first-child {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 116px;
  padding: 0 9px;
  background: var(--office-dialog-surface-muted);
}

.chart-data-window [data-chart-worksheet] th:first-child {
  width: 36px;
  min-width: 36px;
  padding: 0 6px;
  text-align: center;
  font-weight: 400;
}

.chart-data-window [data-chart-worksheet] thead th {
  text-align: center;
  font-weight: 400;
}

/* Cells are part of the sheet, not fields on the card: no frame, no radius,
   the row's full height. One step above the chrome's field rules. */
.office-dialog.chart-data-window .chart-block__grid-table.chart-block__grid-table :is(input, select) {
  width: calc(100% - 26px);
  min-width: 78px;
  height: 33px;
  min-height: 33px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--office-dialog-ink);
  outline: none;
  padding: 5px 8px;
}

.chart-data-window .chart-block__grid-table td > input:only-child,
.chart-data-window .chart-block__grid-table td > select:only-child {
  width: 100%;
}

.office-dialog.chart-data-window .chart-block__grid-table.chart-block__grid-table :is(input, select):focus {
  position: relative;
  z-index: 1;
  background: var(--office-dialog-surface);
  box-shadow: inset 0 0 0 2px var(--office-dialog-accent);
}

/* The workbook's own commands (Add row, Done) as the chrome's push buttons;
   the last action is the default one. */
.chart-data-window .chart-data-window__body button {
  height: 28px;
  border: 1px solid var(--office-dialog-control-border);
  border-radius: 7px;
  background: var(--office-dialog-button);
  box-shadow: var(--office-dialog-button-shadow);
  color: var(--office-dialog-ink);
  cursor: pointer;
  font: inherit;
  font-weight: 500;
  padding: 0 14px;
}

.chart-data-window .chart-data-window__body button:hover:not(:disabled) {
  border-color: var(--office-dialog-control-border-hover);
  background: var(--office-dialog-button-hover);
}

.chart-data-window .chart-data-window__body button:focus-visible {
  outline: 3px solid var(--office-dialog-focus-ring);
  outline-offset: 0;
}

.chart-data-window .chart-data-window__body button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* The in-cell delete marks stay bare icons, not push buttons. */
.chart-data-window .chart-block__grid-table button {
  height: auto;
  min-width: 22px;
  min-height: 22px;
  margin: 0 2px;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--office-dialog-muted);
  padding: 1px 5px;
}

.chart-data-window .chart-block__grid-table button:hover:not(:disabled) {
  border: 0;
  background: var(--office-dialog-hover);
  color: var(--office-dialog-ink);
}

.chart-data-window .chart-block__grid-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  border-top: 1px solid var(--office-dialog-divider);
  background: var(--office-dialog-glass-solid);
  padding-top: 10px;
}

.chart-data-window .chart-block__grid-actions button:last-child {
  border-color: transparent;
  background: var(--office-dialog-accent);
  color: var(--office-dialog-on-accent);
}

.chart-data-window .chart-block__grid-actions button:last-child:hover:not(:disabled) {
  border-color: transparent;
  background: var(--office-dialog-accent-hover);
}

/* A group of fields is a titled section, not a box inside the card. */
.chart-data-window .chart-block__grid > fieldset {
  display: grid;
  grid-template-columns: minmax(140px, 0.7fr) minmax(220px, 1.3fr);
  align-items: center;
  gap: 8px 12px;
  margin: 0 !important;
  border: 0;
  padding: 0;
}

.chart-data-window .chart-block__grid > fieldset label {
  display: contents;
  color: var(--office-dialog-muted);
  font-size: 12px;
}

.chart-data-window [data-testid="chart-block-v2-editor-validation"] {
  border: 1px solid var(--office-dialog-danger-line);
  border-radius: 6px;
  background: var(--office-dialog-danger-soft);
  color: var(--office-dialog-danger);
  padding: 8px 10px;
}
`;

function initialWindowPosition() {
  if (typeof window === "undefined") return { x: WINDOW_MARGIN, y: 72 };
  const estimatedWidth = Math.min(820, window.innerWidth - WINDOW_MARGIN * 2);
  return {
    x: Math.max(
      WINDOW_MARGIN,
      Math.round((window.innerWidth - estimatedWidth) / 2),
    ),
    y: Math.max(WINDOW_MARGIN, Math.round((window.innerHeight - 600) / 2)),
  };
}

export interface ChartDataWindowProps extends ChartV2DataEditorProps {
  windowId: string;
  windowTitle: string;
  closeLabel: string;
  children?: ReactNode;
  expanded?: boolean;
}

/**
 * A modeless chart workbook window. It is portalled outside the ProseMirror
 * node so spreadsheet rows never become part of the paginated document flow.
 */
export function ChartDataWindow({
  windowId,
  windowTitle,
  closeLabel,
  onDone,
  children,
  expanded,
  ...editorProps
}: ChartDataWindowProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    windowX: number;
    windowY: number;
  } | null>(null);
  const [position, setPosition] = useState(()=>expanded && typeof window!=="undefined"
    ? {x:Math.max(WINDOW_MARGIN,(window.innerWidth-Math.min(1280,window.innerWidth-32))/2),y:32}
    : initialWindowPosition());
  const [zIndex, setZIndex] = useState(() => ++nextWindowZIndex);

  const bringToFront = useCallback(() => {
    setZIndex(++nextWindowZIndex);
  }, []);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      frameRef.current
        ?.querySelector<HTMLElement>(
          ".chart-data-window__body input:not(:disabled), .chart-data-window__body select:not(:disabled), .chart-data-window__body button:not(:disabled)",
        )
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;
      bringToFront();
      dragRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        windowX: position.x,
        windowY: position.y,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    },
    [bringToFront, position.x, position.y],
  );

  const moveWindow = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const frame = frameRef.current?.getBoundingClientRect();
    const width = frame?.width ?? 960;
    const nextX = drag.windowX + event.clientX - drag.pointerX;
    const nextY = drag.windowY + event.clientY - drag.pointerY;
    setPosition({
      x: Math.min(
        Math.max(WINDOW_MARGIN, nextX),
        Math.max(WINDOW_MARGIN, window.innerWidth - Math.min(width, 180)),
      ),
      y: Math.min(
        Math.max(WINDOW_MARGIN, nextY),
        Math.max(WINDOW_MARGIN, window.innerHeight - TITLE_BAR_HEIGHT),
      ),
    });
  }, []);

  const stopDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      id={windowId}
      ref={frameRef}
      className={`${officeDialogClassName({ tone: "document" })} chart-data-window`}
      data-testid="chart-data-window"
      role="dialog"
      aria-modal="false"
      aria-label={windowTitle}
      onPointerDownCapture={bringToFront}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex,
        width: expanded ? "min(1280px, calc(100vw - 32px))" : "min(820px, calc(100vw - 32px))",
        height: expanded ? "min(720px, calc(100vh - 64px))" : "min(440px, calc(100vh - 32px))",
        minWidth: "min(380px, calc(100vw - 32px))",
        minHeight: 280,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        overflow: "hidden",
        resize: "both",
      }}
    >
      <style data-testid="chart-data-window-styles">
        {children ? "" : CHART_DATA_WINDOW_STYLES}
      </style>
      <header
        className={`${parts.header} chart-data-window__titlebar`}
        data-testid="chart-data-window-titlebar"
        onPointerDown={startDrag}
        onPointerMove={moveWindow}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <strong className={parts.title}>
          {windowTitle}
        </strong>
        <button
          type="button"
          className={parts.close}
          data-testid="chart-data-window-close"
          aria-label={closeLabel}
          title={closeLabel}
          onClick={onDone}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <div
        className="chart-data-window__body"
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {children ?? <ChartV2DataEditor {...editorProps} onDone={onDone} />}
      </div>
    </div>,
    document.body,
  );
}
