"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { useState, useMemo, useRef, useEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SHEET_DRAWING_PANES, type SheetDrawingPane, type SheetDrawingBox, sheetDrawingPanes } from "../../../../lib/spreadsheet/drawing-panes";

/** What useSpreadsheetDrawingPaneHosts reads from SpreadsheetWindow's render scope. */
export interface SpreadsheetDrawingPaneHostsInputs {
  drawingPanesActive: boolean;
  freezeBand: { bottom: number; right: number; };
  gridWrapRef: RefObject<HTMLDivElement | null>;
  /** The sheet's whole stage, in content pixels. */
  gridStageSize: { readonly totalWidth: number; readonly totalHeight: number };
  toContentPx: (screenPx: number) => number;
}

/** Moved verbatim from SpreadsheetWindow (called at the same position, so hook order is unchanged). */
export function useSpreadsheetDrawingPaneHosts({
  drawingPanesActive,
  freezeBand,
  gridWrapRef,
  gridStageSize,
  toContentPx,
}: SpreadsheetDrawingPaneHostsInputs) {
  const [drawingPaneHosts, setDrawingPaneHosts] = useState<
    Readonly<Record<string, HTMLElement | null>>
  >({});
  const drawingPaneHostRefs = useMemo(() => {
    const refs: Record<string, (element: HTMLElement | null) => void> = {};
    for (const pane of SHEET_DRAWING_PANES) {
      for (const kind of ["objects", "charts"] as const) {
        const key = `${pane}:${kind}`;
        refs[key] = (element) =>
          setDrawingPaneHosts((current) =>
            (current[key] ?? null) === element ? current : { ...current, [key]: element },
          );
      }
    }
    return refs;
  }, []);
  // The frozen cells cover the panes that scroll under them, but not along
  // the grid lines between them (collapsed borders are the table's own, under
  // every pane): each scrolling pane is also cut at the frozen edge it passes
  // under, which moves with the scroll.
  const drawingPaneBoxRefs = useRef<Partial<Record<SheetDrawingPane, HTMLDivElement | null>>>({});
  useEffect(() => {
    const wrap = gridWrapRef.current;
    if (!drawingPanesActive || !wrap) return;
    const FAR = "-99999px";
    const cut = () => {
      const left = toContentPx(Math.abs(wrap.scrollLeft)) + freezeBand.right;
      const top = toContentPx(wrap.scrollTop) + freezeBand.bottom;
      const boxes = drawingPaneBoxRefs.current;
      if (boxes.body) {
        boxes.body.style.clipPath = `inset(${freezeBand.bottom > 0 ? top : 0}px 0 0 ${freezeBand.right > 0 ? left : 0}px)`;
      }
      // A pinned box is zero-size at the sheet's origin: negative insets
      // reach out to everything on the sides it is not cut on.
      if (boxes.top) {
        boxes.top.style.clipPath =
          freezeBand.right > 0 ? `inset(${FAR} ${FAR} ${FAR} ${left}px)` : "";
      }
      if (boxes.left) {
        boxes.left.style.clipPath =
          freezeBand.bottom > 0 ? `inset(${top}px ${FAR} ${FAR} ${FAR})` : "";
      }
    };
    cut();
    wrap.addEventListener("scroll", cut, { passive: true });
    return () => wrap.removeEventListener("scroll", cut);
  }, [drawingPanesActive, freezeBand, toContentPx, drawingPaneHosts]);
  /**
   * Draw `node` in every pane its boxes reach (in place without frozen
   * panes). `boxes` is the committed frame and, during a gesture, the frame
   * being dragged: a pane is only ever added under the pointer, so the piece
   * holding the gesture is never remounted.
   *
   * An object over a freeze line is cut there: its piece in a frozen band
   * ends at the band's edge, the next pane shows the rest. Only such a piece
   * is cut, so an object wholly inside a band keeps its selection handles
   * past the band's edge. `whole` draws the object once and uncut, in the
   * most frozen pane it reaches: an object whose words are being edited has
   * one editor, not one per piece.
   */
  const inDrawingPane = (
    node: ReactNode,
    boxes: readonly SheetDrawingBox[],
    kind: "objects" | "charts",
    key = "",
    whole = false,
  ): ReactNode => {
    if (!drawingPanesActive || boxes.length === 0) return node;
    const panes = new Set<SheetDrawingPane>();
    if (whole) {
      // The most frozen pane it reaches: that piece is always on screen
      // (the body's may have scrolled under the band, and an editor focused
      // there would drag the sheet back to it).
      const [pinned] = sheetDrawingPanes(boxes[boxes.length - 1], freezeBand);
      if (pinned) panes.add(pinned);
    } else {
      for (const box of boxes) {
        for (const pane of sheetDrawingPanes(box, freezeBand)) panes.add(pane);
      }
    }
    const hosts = [...panes].map((pane) => [pane, drawingPaneHosts[`${pane}:${kind}`]] as const);
    if (hosts.length === 0 || hosts.some(([, host]) => !host)) return node;
    const cut = panes.size > 1;
    return hosts.map(([pane, host]) =>
      createPortal(
        pane === "body" ? (
          node
        ) : (
          // Always present, so cutting a piece (or not) restyles this box
          // and never remounts the object in it.
          <div
            data-drawing-pane-piece={cut ? "cut" : "whole"}
            style={
              cut
                ? {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: pane === "top" ? gridStageSize.totalWidth : freezeBand.right,
                    height: pane === "left" ? gridStageSize.totalHeight : freezeBand.bottom,
                    overflow: "clip",
                    pointerEvents: "none",
                  }
                : { position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none" }
            }
          >
            {kind === "charts" ? (
              <div style={{ display: "contents", pointerEvents: "auto" }}>{node}</div>
            ) : (
              node
            )}
          </div>
        ),
        host!,
        `${key}:${pane}`,
      ),
    );
  };
  return {
    drawingPaneBoxRefs,
    drawingPaneHostRefs,
    inDrawingPane,
  };
}
