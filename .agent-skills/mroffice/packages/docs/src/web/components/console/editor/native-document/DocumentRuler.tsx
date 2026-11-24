"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import { PX_PER_PT } from "@mrnote/core/web/lib/office-units.ts";
import {
  isCompatMouseFromTouch,
  isTouchLikePointer,
  latestPointerIsTouchLike,
} from "@mrnote/core/web/lib/pointer-capability.ts";
import { yieldTouchHold } from "@mrnote/core/web/lib/touch-hold.ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  MAX_TAB_POS,
  MIN_TAB_POS,
  normalizeTabStops,
  pxToTwips,
  twipsToPx,
  type TabStop,
} from "@mrnote/core/web/lib/document-tabstops.ts";
import { tryCapturePointer } from "@mrnote/core/web/components/console/editor/native-document/pointerCapture.ts";
import { createPortal } from "react-dom";
import {
  rulerIndentPatch,
  type RulerIndentPatch,
  type RulerMeasurement,
} from "./documentRulerGeometry";

const CSS_PX_PER_POINT = PX_PER_PT;
const KEYBOARD_STEP_PT = 3;

type IndentMarker = "left" | "firstLine" | "right";

interface DragState {
  marker: IndentMarker;
  pointerId: number;
  valuePt: number;
}

export interface DocumentRulerLabels {
  ruler: string;
  leftIndent: string;
  firstLineIndent: string;
  rightIndent: string;
  tabStop: string;
}

export interface DocumentRulerProps {
  editable: boolean;
  firstLineIndentPt: number;
  indentLeftPt: number;
  indentRightPt: number;
  labels: DocumentRulerLabels;
  marginLeftPx: number;
  marginRightPx: number;
  onChangeIndents: (patch: RulerIndentPatch) => void;
  onChangeTabStops: (stops: TabStop[]) => void;
  onRememberSelection: () => void;
  onRestoreEditorFocus: () => void;
  pageWidthPx: number;
  tabStops: readonly TabStop[];
  testId?: string;
  /** Reads the ruler's placement over the page and the current paragraph's
   * drawn indents (documentRulerGeometry). Without it the ruler draws the
   * stored indents at the page's nominal size. */
  measure?: (strip: HTMLElement) => RulerMeasurement | null;
  /** Calls back whenever the page or selection may have moved. */
  subscribe?: (listener: () => void) => () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointsToPx(points: number): number {
  return points * CSS_PX_PER_POINT;
}

function pxToPoints(px: number): number {
  return px / CSS_PX_PER_POINT;
}

function roundedPoints(value: number): number {
  return Math.round(value * 2) / 2;
}

function markerTitle(label: string, valuePt: number): string {
  return `${label}: ${roundedPoints(valuePt)} pt`;
}

/**
 * Docs' horizontal paragraph ruler. Visibility is session-only, while every
 * marker edit uses the existing paragraph/tab-stop model owned by the editor.
 * A pointer gesture previews locally and commits once on pointer-up, preserving
 * the one-gesture/one-Undo contract.
 */
export function DocumentRuler({
  editable,
  firstLineIndentPt: storedFirstLineIndentPt,
  indentLeftPt: storedIndentLeftPt,
  indentRightPt: storedIndentRightPt,
  labels,
  marginLeftPx: nominalMarginLeftPx,
  marginRightPx: nominalMarginRightPx,
  onChangeIndents,
  onChangeTabStops,
  onRememberSelection,
  onRestoreEditorFocus,
  pageWidthPx: nominalPageWidthPx,
  tabStops,
  testId = "document-ruler",
  measure,
  subscribe,
}: DocumentRulerProps) {
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragTargetRef = useRef<HTMLButtonElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [measurement, setMeasurement] = useState<RulerMeasurement | null>(null);
  const [guide, setGuide] = useState<{ top: number; left: number } | null>(null);

  // Follow the page: its zoom, where it sits (and scrolls) under the ribbon,
  // and the paragraph the caret is in.
  useEffect(() => {
    if (!measure) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const strip = stripRef.current;
      if (!strip) return;
      const next = measure(strip);
      setMeasurement((previous) =>
        previous && next && JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    const unsubscribe = subscribe?.(schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("transitionend", schedule, true);
    // Zooming the page changes neither the document nor the scroll position
    // (and may animate): keep re-reading the page's place while the ruler shows.
    const poll = window.setInterval(schedule, 250);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(poll);
      unsubscribe?.();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("transitionend", schedule, true);
    };
  }, [measure, subscribe]);

  const scale = measurement?.scale ?? 1;
  const pageWidthPx = measurement?.pageWidthPx ?? nominalPageWidthPx;
  const marginLeftPx = measurement?.marginLeftPx ?? nominalMarginLeftPx;
  const marginRightPx = measurement?.marginRightPx ?? nominalMarginRightPx;
  const paragraph = measurement?.paragraph ?? null;
  // Drawn where the paragraph's text is, not where one of its attributes says.
  const indentLeftPt = paragraph?.leftPt ?? storedIndentLeftPt;
  const firstLineIndentPt = paragraph?.firstLinePt ?? storedFirstLineIndentPt;
  const indentRightPt = paragraph?.rightPt ?? storedIndentRightPt;
  // A typed list's number belongs to the list; its marker shows, not drags.
  const firstLineLocked = paragraph?.list === "plain";
  const contentStart = clamp(marginLeftPx, 0, pageWidthPx);
  const contentEnd = clamp(
    pageWidthPx - marginRightPx,
    contentStart,
    pageWidthPx,
  );
  const contentWidth = Math.max(1, contentEnd - contentStart);
  const contentWidthPt = pxToPoints(contentWidth);
  const effectiveLeftPt = roundedPoints(
    clamp(
      Math.max(0, indentLeftPt),
      0,
      Math.max(0, contentWidthPt - Math.max(0, indentRightPt)),
    ),
  );
  const effectiveRightPt = roundedPoints(
    clamp(
      Math.max(0, indentRightPt),
      0,
      Math.max(0, contentWidthPt - effectiveLeftPt),
    ),
  );
  const effectiveFirstLinePt = roundedPoints(
    clamp(
      firstLineIndentPt,
      -effectiveLeftPt,
      Math.max(0, contentWidthPt - effectiveLeftPt - effectiveRightPt),
    ),
  );

  const currentLeftPt =
    editable && drag?.marker === "left" ? drag.valuePt : effectiveLeftPt;
  const currentFirstLinePt =
    editable && drag?.marker === "firstLine"
      ? drag.valuePt
      : effectiveFirstLinePt;
  const currentRightPt =
    editable && drag?.marker === "right" ? drag.valuePt : effectiveRightPt;

  const maxLeftX = Math.max(
    contentStart,
    contentEnd - pointsToPx(currentRightPt),
  );
  const leftX = clamp(
    contentStart + pointsToPx(currentLeftPt),
    contentStart,
    maxLeftX,
  );
  const minRightX = Math.min(
    contentEnd,
    contentStart + pointsToPx(currentLeftPt),
  );
  const rightX = clamp(
    contentEnd - pointsToPx(currentRightPt),
    minRightX,
    contentEnd,
  );
  const firstLineX = clamp(
    leftX + pointsToPx(currentFirstLinePt),
    contentStart,
    rightX,
  );

  const normalizedStops = useMemo(
    () => normalizeTabStops(tabStops) ?? [],
    [tabStops],
  );

  const valueFromPointer = useCallback(
    (marker: IndentMarker, clientX: number): number | null => {
      const ruler = rulerRef.current;
      if (!ruler) return null;
      const rawX = (clientX - ruler.getBoundingClientRect().left) / scale;
      if (marker === "left") {
        const x = clamp(rawX, contentStart, maxLeftX);
        return roundedPoints(pxToPoints(x - contentStart));
      }
      if (marker === "right") {
        const x = clamp(rawX, minRightX, contentEnd);
        return roundedPoints(pxToPoints(contentEnd - x));
      }
      const x = clamp(rawX, contentStart, rightX);
      const maxFirstLinePt = pxToPoints(rightX - leftX);
      const minFirstLinePt = -Math.max(0, currentLeftPt);
      return roundedPoints(
        clamp(pxToPoints(x - leftX), minFirstLinePt, maxFirstLinePt),
      );
    },
    [
      contentEnd,
      contentStart,
      currentLeftPt,
      leftX,
      maxLeftX,
      minRightX,
      rightX,
      scale,
    ],
  );

  const commitIndent = useCallback(
    (marker: IndentMarker, valuePt: number) => {
      if (!editable) {
        onRestoreEditorFocus();
        return;
      }
      const nextValuePt = roundedPoints(valuePt);
      const previousValuePt =
        marker === "left"
          ? effectiveLeftPt
          : marker === "right"
            ? effectiveRightPt
            : effectiveFirstLinePt;
      if (nextValuePt === previousValuePt) {
        onRestoreEditorFocus();
        return;
      }
      if (paragraph) {
        onChangeIndents(
          rulerIndentPatch(
            {
              indentLeftPt: storedIndentLeftPt,
              indentRightPt: storedIndentRightPt,
              firstLineIndentPt: storedFirstLineIndentPt,
            },
            paragraph,
            {
              leftPt: marker === "left" ? nextValuePt : paragraph.leftPt,
              firstLinePt:
                marker === "firstLine" ? nextValuePt : paragraph.firstLinePt,
              rightPt: marker === "right" ? nextValuePt : paragraph.rightPt,
            },
          ),
        );
        onRestoreEditorFocus();
        return;
      }
      if (marker === "left") {
        onChangeIndents({ indentLeftPt: nextValuePt });
      }
      if (marker === "right") {
        onChangeIndents({ indentRightPt: nextValuePt });
      }
      if (marker === "firstLine") {
        onChangeIndents({ firstLineIndentPt: nextValuePt });
      }
      onRestoreEditorFocus();
    },
    [
      effectiveFirstLinePt,
      effectiveLeftPt,
      effectiveRightPt,
      editable,
      onChangeIndents,
      onRestoreEditorFocus,
      paragraph,
      storedFirstLineIndentPt,
      storedIndentLeftPt,
      storedIndentRightPt,
    ],
  );

  const cancelDrag = useCallback(() => {
    const activeDrag = drag;
    const target = dragTargetRef.current;
    if (activeDrag && target?.hasPointerCapture(activeDrag.pointerId)) {
      target.releasePointerCapture(activeDrag.pointerId);
    }
    dragTargetRef.current = null;
    setDrag(null);
    setGuide(null);
  }, [drag]);

  useEffect(() => {
    if (editable || !drag) return;
    const target = dragTargetRef.current;
    if (target?.hasPointerCapture(drag.pointerId)) {
      target.releasePointerCapture(drag.pointerId);
    }
    dragTargetRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      setDrag((current) => (current === drag ? null : current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drag, editable]);

  const beginDrag = useCallback(
    (marker: IndentMarker, event: PointerEvent<HTMLButtonElement>) => {
      if (!editable || event.button !== 0) return;
      event.preventDefault();
      onRememberSelection();
      const valuePt = valueFromPointer(marker, event.clientX);
      if (valuePt === null) return;
      tryCapturePointer(event.currentTarget, event.pointerId);
      // the marker has the finger: no press-and-hold name card mid-drag
      yieldTouchHold(event.pointerId);
      dragTargetRef.current = event.currentTarget;
      setDrag({ marker, pointerId: event.pointerId, valuePt });
      // Word draws a dotted line down the page from the marker while it moves.
      const rulerRect = rulerRef.current?.getBoundingClientRect();
      if (rulerRect) setGuide({ top: rulerRect.bottom, left: rulerRect.left });
    },
    [editable, onRememberSelection, valueFromPointer],
  );

  const updateDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!editable || !drag || drag.pointerId !== event.pointerId) return;
      const valuePt = valueFromPointer(drag.marker, event.clientX);
      if (valuePt !== null) setDrag({ ...drag, valuePt });
    },
    [drag, editable, valueFromPointer],
  );

  const finishDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const completed = drag;
      dragTargetRef.current = null;
      setDrag(null);
      setGuide(null);
      if (!editable) {
        onRestoreEditorFocus();
        return;
      }
      commitIndent(completed.marker, completed.valuePt);
    },
    [commitIndent, drag, editable, onRestoreEditorFocus],
  );

  const handleMarkerKeyDown = useCallback(
    (
      marker: IndentMarker,
      currentValue: number,
      event: KeyboardEvent<HTMLButtonElement>,
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDrag();
        onRestoreEditorFocus();
        return;
      }
      if (
        !editable ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }
      event.preventDefault();
      onRememberSelection();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const maxIndentPt =
        marker === "left"
          ? Math.max(0, pxToPoints(contentWidth) - currentRightPt)
          : marker === "right"
            ? Math.max(0, pxToPoints(contentWidth) - currentLeftPt)
            : Math.max(0, pxToPoints(rightX - leftX));
      const min = marker === "firstLine" ? -Math.max(0, currentLeftPt) : 0;
      const control = event.currentTarget;
      commitIndent(
        marker,
        roundedPoints(
          clamp(currentValue + direction * KEYBOARD_STEP_PT, min, maxIndentPt),
        ),
      );
      // The indent command runs in the editor and takes the focus with it.
      // A keyboard step is one of several: the marker keeps the focus (now
      // and after the editor's own deferred focus), so the next arrow steps
      
      // to the text.
      const keepFocus = () => {
        if (control.isConnected && document.activeElement !== control) {
          control.focus({ preventScroll: true });
        }
      };
      keepFocus();
      requestAnimationFrame(() => {
        keepFocus();
        requestAnimationFrame(keepFocus);
      });
    },
    [
      commitIndent,
      cancelDrag,
      contentWidth,
      currentLeftPt,
      currentRightPt,
      editable,
      leftX,
      onRememberSelection,
      onRestoreEditorFocus,
      rightX,
    ],
  );

  const addTabStopAtPointer = useCallback(
    (event: {
      button: number;
      clientX: number;
      target: EventTarget;
      currentTarget: EventTarget;
      preventDefault: () => void;
    }) => {
      if (
        !editable ||
        event.button !== 0 ||
        event.target !== event.currentTarget
      ) {
        return;
      }
      const ruler = rulerRef.current;
      if (!ruler) return;
      const x = (event.clientX - ruler.getBoundingClientRect().left) / scale;
      if (x <= contentStart || x >= contentEnd) return;
      event.preventDefault();
      onRememberSelection();
      const pos = clamp(
        pxToTwips(x - contentStart),
        MIN_TAB_POS,
        Math.min(MAX_TAB_POS, pxToTwips(contentWidth)),
      );
      onChangeTabStops([
        ...normalizedStops,
        { pos, align: "left", leader: "none" },
      ]);
      onRestoreEditorFocus();
    },
    [
      contentEnd,
      contentStart,
      contentWidth,
      editable,
      normalizedStops,
      onChangeTabStops,
      onRememberSelection,
      onRestoreEditorFocus,
      scale,
    ],
  );

  const removeTabStop = useCallback(
    (pos: number) => {
      if (!editable) return;
      onRememberSelection();
      onChangeTabStops(normalizedStops.filter((stop) => stop.pos !== pos));
      onRestoreEditorFocus();
    },
    [
      editable,
      normalizedStops,
      onChangeTabStops,
      onRememberSelection,
      onRestoreEditorFocus,
    ],
  );

  const marker = (
    kind: IndentMarker,
    x: number,
    valuePt: number,
    label: string,
    className: string,
  ) => (
    <button
      type="button"
      className={className}
      disabled={!editable || (kind === "firstLine" && firstLineLocked)}
      role="slider"
      aria-label={label}
      aria-valuemin={kind === "firstLine" ? -currentLeftPt : 0}
      aria-valuemax={pxToPoints(contentWidth)}
      aria-valuenow={roundedPoints(valuePt)}
      aria-valuetext={markerTitle(label, valuePt)}
      title={markerTitle(label, valuePt)}
      style={{ left: x * scale } as CSSProperties}
      data-testid={`${testId}-${kind}-indent`}
      onPointerDown={(event) => beginDrag(kind, event)}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onKeyDown={(event) => handleMarkerKeyDown(kind, valuePt, event)}
    />
  );

  return (
    <div
      ref={stripRef}
      // The ruler measures the page, which keeps its ltr geometry under an
      // rtl interface.
      dir="ltr"
      className="docs-document-ruler-viewport"
      data-testid={`${testId}-viewport`}
      data-follows-page={measurement ? "true" : undefined}
    >
      <div
        ref={rulerRef}
        className="docs-document-ruler"
        role="toolbar"
        aria-label={labels.ruler}
        data-testid={testId}
        style={
          (measurement
            ? {
                width: pageWidthPx * scale,
                marginLeft: measurement.offsetPx,
                "--docs-ruler-scale": String(scale),
              }
            : { width: pageWidthPx }) as CSSProperties
        }
        onPointerDown={(event) => {
          // A finger swiping the ruler strip scrolls it: a tab stop is set
          
          if (isTouchLikePointer(event)) return;
          addTabStopAtPointer(event);
        }}
        onClick={(event) => {
          if (isCompatMouseFromTouch(event.nativeEvent)) {
            addTabStopAtPointer(event);
          }
        }}
      >
        <span
          className="docs-document-ruler__margin docs-document-ruler__margin--left"
          style={{ width: contentStart * scale }}
          aria-hidden
        />
        <span
          className="docs-document-ruler__margin docs-document-ruler__margin--right"
          style={{ width: Math.max(0, pageWidthPx - contentEnd) * scale }}
          aria-hidden
        />
        {normalizedStops.map((stop) => {
          const x = clamp(
            contentStart + twipsToPx(stop.pos),
            contentStart,
            contentEnd,
          );
          return (
            <button
              key={stop.pos}
              type="button"
              className="docs-document-ruler__tab-stop"
              disabled={!editable}
              aria-label={`${labels.tabStop}: ${stop.pos}`}
              title={`${labels.tabStop}: ${stop.pos}`}
              style={{ left: x * scale } as CSSProperties}
              data-testid={`${testId}-tab-stop-${stop.pos}`}
              onDoubleClick={() => removeTabStop(stop.pos)}
              // A finger: press and hold a tab stop to clear it (a double
              // tap is not dependable on a touch screen).
              onContextMenu={(event) => {
                if (!editable || !latestPointerIsTouchLike()) return;
                event.preventDefault();
                removeTabStop(stop.pos);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onRestoreEditorFocus();
                } else if (
                  event.key === "Delete" ||
                  event.key === "Backspace"
                ) {
                  event.preventDefault();
                  removeTabStop(stop.pos);
                }
              }}
            />
          );
        })}
        {marker(
          "left",
          leftX,
          currentLeftPt,
          labels.leftIndent,
          "docs-document-ruler__indent docs-document-ruler__indent--left",
        )}
        {marker(
          "firstLine",
          firstLineX,
          currentFirstLinePt,
          labels.firstLineIndent,
          "docs-document-ruler__indent docs-document-ruler__indent--first-line",
        )}
        {marker(
          "right",
          rightX,
          currentRightPt,
          labels.rightIndent,
          "docs-document-ruler__indent docs-document-ruler__indent--right",
        )}
      </div>
      {guide && drag && typeof document !== "undefined"
        ? createPortal(
            <span
              className="docs-document-ruler__guide"
              data-testid={`${testId}-guide`}
              aria-hidden
              style={{
                left:
                  guide.left +
                  (drag.marker === "left"
                    ? leftX
                    : drag.marker === "right"
                      ? rightX
                      : firstLineX) *
                    scale,
                top: guide.top,
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
