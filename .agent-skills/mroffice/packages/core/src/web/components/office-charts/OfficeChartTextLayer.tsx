"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * A chart's texts -- the title and the axis titles -- drawn by the editor,
 * over the engine's picture that keeps their place but not their words.
 *
 * Office edits a chart title as the text box it is: one click selects it,
 * another puts the caret where it lands, Enter starts a new line, the words'
 * runs keep their format and WordArt, and a click outside ends the edit
 * (Microsoft Support, "Edit titles or data labels in a chart"). So the words
 * exist once on the page: this layer draws them, and the edit makes the same
 * element editable -- nothing is laid over the picture and kept in step with
 * it (the old overlay box drifted off the title in Safari, lost the WordArt
 * and drew the words twice).
 *
 * The layer works in the picture's own pixels: a stage of the picture's size
 * scaled to the frame it is shown in, as the picture's SVG is, so a zoomed,
 * scaled or resized frame keeps the words on their place.
 */

import { chartTextSmallCapsPieces, chartWholePointSpacing, officeSmallCapsSizePx } from "../../lib/office-charts/chart-letter-spacing";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { ChartRenderPicture, ChartTextFrame, ChartTextLook, ChartTextPart } from "../../lib/engine-host/charts-types";
import {
  CHART_TEXT_RUN_ATTRIBUTE,
  chartTextSelection,
  appendChartTextSentinel,
  insertChartText,
  keepChartTextSelectionInside,
  placeChartTextCaret,
  readChartTextHost,
  rememberChartTextSelection,
  selectAllChartText,
  selectChartText,
  type OfficeChartTextValue,
} from "../../lib/office-charts/chart-text-editing";
import type { OfficeChartTextEdit } from "../../lib/office-charts/chart-text-edit-store";
import { officeBlurWentIntoChrome } from "../../lib/office-inactive-selection";
import { normalizeOfficeTextPaint, officeTextPaintCss } from "../../lib/office-text-paint";
import { cssFontFamilyOrUndefined } from "../../lib/css-font-family";
import { isImeKeydown } from "../../lib/soft-keyboard";

const PARTS: readonly ChartTextPart[] = ["title", "axisX", "axisY"];

/** How long a committed edit's words stand in for a picture still being drawn. */
const PENDING_MS = 8000;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** The browser's own width of `text` in `font` (a CSS font), NaN where it has no canvas to measure with. */
function browserTextWidth(text: string, font: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      measureContext = null;
    }
  }
  if (!measureContext) return Number.NaN;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/**
 * A run of a fractional size (10.64 pt) drawn as the picture draws it: its
 * glyphs at whole points, as wide as its own size lays it out -- the whole
 * size and, on top of the run's own spacing, the share of the difference each
 * character takes (`chartWholePointSpacing`, measured by this browser in the
 * face it draws). The words stay one text: typed in, the caret and the
 * selection walk the same characters; a character typed into the run takes
 * the run's share until the words are laid out again.
 */
function wholePointCss(look: ChartTextLook, words: string | undefined): CSSProperties {
  if (words === undefined) return {};
  const family = cssFontFamilyOrUndefined(look.fontFamily) ?? "sans-serif";
  const whole = chartWholePointSpacing(words, { ...look, fontFamily: family }, browserTextWidth);
  if (!whole || !Number.isFinite(whole.spacing)) return {};
  const spacing = (look.letterSpacing ?? 0) + whole.spacing;
  return { fontSize: whole.fontSize, ...(spacing ? { letterSpacing: spacing } : {}) };
}

function lookCss(look: ChartTextLook | undefined, painted: boolean, wraps = false, shown = false, words?: string): CSSProperties {
  // Every run keeps its line breaks and spaces (a page's span rules, such
  // as the deck's `nowrap`, would fold a new line into a space); a text the
  // drawing wrapped (`ChartTextFrame.wrapWidth`) also wraps at its spaces.
  const whiteSpace = wraps ? "pre-wrap" : "pre";
  if (!look) return { whiteSpace };
  return {
    whiteSpace,
    fontFamily: cssFontFamilyOrUndefined(look.fontFamily),
    fontSize: look.fontSize,
    fontWeight: look.fontWeight as CSSProperties["fontWeight"],
    fontStyle: look.fontStyle,
    // Character Spacing and Small Caps, as the picture draws them (`chart-letter-spacing`).
    ...(look.letterSpacing ? { letterSpacing: look.letterSpacing } : {}),
    // (Shown, Small Caps are drawn as smaller capitals; typed in, the
    // browser's small capitals stand for them: the words stay as typed.)
    ...(look.caps === "small" ? (shown ? {} : { fontVariantCaps: "small-caps" }) : look.caps === "all" ? { textTransform: "uppercase" } : {}),
    // WordArt paints every run from the text box itself.
    ...(painted ? {} : { color: look.color }),
    ...wholePointCss(look, words),
  };
}

/** Unitless CSS properties: a number there is the value itself. */
const UNITLESS_CSS = new Set(["fontWeight", "lineHeight", "opacity", "zIndex", "flexGrow", "flexShrink", "order"]);

/**
 * A look for an element's `style` written directly (not through React): a
 * number a length takes must carry its unit. React writes `fontSize: 14` as
 * "14px"; `Object.assign(element.style, ...)` wrote 14, which a browser
 * drops, so a title being typed in fell back to an inherited 12px and shrank
 * on entering edit mode.
 */
function domCss(css: CSSProperties): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(css)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "number" && !UNITLESS_CSS.has(key) ? `${value}px` : String(value);
  }
  return out;
}

function paintCss(paint: Record<string, unknown> | undefined): CSSProperties | null {
  if (!paint) return null;
  try {
    const normalized = normalizeOfficeTextPaint(paint);
    return normalized ? officeTextPaintCss(normalized) : null;
  } catch {
    return null;
  }
}

/** The runs as the frame lays them out, with each run's look by its index. */
function runLooks(frame: ChartTextFrame): Map<number, ChartTextLook> {
  const looks = new Map<number, ChartTextLook>();
  for (const run of frame.runs) if (!looks.has(run.run)) looks.set(run.run, run.look);
  return looks;
}

/** Fill an editable host with the runs as spans (the DOM is the text while it is typed). */
function fillHost(host: HTMLElement, pieces: { text: string; run: number }[], frame: ChartTextFrame, painted: boolean): void {
  const looks = runLooks(frame);
  const fallback = frame.runs[0]?.look;
  const doc = host.ownerDocument;
  host.replaceChildren();
  let span: HTMLElement | null = null;
  for (const piece of pieces) {
    if (!piece.text) continue;
    span = doc.createElement("span");
    span.setAttribute(CHART_TEXT_RUN_ATTRIBUTE, String(piece.run));
    Object.assign(span.style, domCss(lookCss(looks.get(piece.run) ?? fallback, painted, Boolean(frame.wrapWidth), false, piece.text)));
    // A line break as a `<br>`, the one a browser edits (chart-text-editing).
    piece.text.split("\n").forEach((line, index) => {
      if (index > 0) span!.appendChild(doc.createElement("br"));
      if (line) span!.appendChild(doc.createTextNode(line));
    });
    host.appendChild(span);
  }
  // Words that end in a line break: its empty last line shows.
  if (span && pieces.map((piece) => piece.text).join("").endsWith("\n")) appendChartTextSentinel(span);
}

interface Pending {
  text: string;
  pieces: { text: string; run: number }[];
  /** The frame the words were typed in (their place and the runs' looks). */
  frame: ChartTextFrame;
  until: number;
}

/** One data label as a text frame (its words, its look, its place), to be
 * typed in place while the picture leaves its own drawing of it out. */
export function chartLabelTextFrame(label: NonNullable<ChartRenderPicture["labels"]>[number]): ChartTextFrame {
  const box = label.box;
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    width: box.width,
    height: box.height,
    rotation: 0,
    text: label.text,
    runs: [
      {
        text: label.text,
        run: 0,
        look: {
          fontFamily: box.fontFamily ?? "sans-serif",
          fontSize: box.fontSize ?? 12,
          fontWeight: box.fontWeight ?? "normal",
          fontStyle: "normal",
          color: box.color ?? "#333333",
        },
      },
    ],
  };
}

export interface OfficeChartTextLayerProps {
  texts: Partial<Record<ChartTextPart, ChartTextFrame>>;
  /** The picture's data labels (one of them may be typed in). */
  labels?: ChartRenderPicture["labels"];
  /** The picture's own size (px). */
  width: number;
  height: number;
  /** The text being typed, if any. */
  edit?: OfficeChartTextEdit | null;
  /** The edit ended (after its `onFinish`). */
  onEditEnd?: (edit: OfficeChartTextEdit) => void;
  /** Words faded with the picture (a drawing that is not current). */
  faded?: boolean;
  testId?: string;
}

export function OfficeChartTextLayer({
  texts,
  labels,
  width,
  height,
  edit = null,
  onEditEnd,
  faded = false,
  testId = "office-chart-text",
}: OfficeChartTextLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const measure = () => {
      // Layout pixels (a CSS transform above the chart does not change
      // them): the stage maps the picture's pixels onto the frame's.
      const w = layer.offsetWidth, h = layer.offsetHeight;
      if (w > 0 && h > 0 && width > 0 && height > 0) {
        const next = { x: w / width, y: h / height };
        setScale((current) =>
          Math.abs(current.x - next.x) < 1e-4 && Math.abs(current.y - next.y) < 1e-4 ? current : next,
        );
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [width, height]);

  // A committed edit's words stand until the picture of them arrives: the
  // words never jump back to what they were while the chart is redrawn.
  const [pending, setPending] = useState<Partial<Record<ChartTextPart, Pending>>>({});
  useEffect(() => {
    const now = Date.now();
    const stale = PARTS.filter((part) => {
      const entry = pending[part];
      return entry && (texts[part]?.text === entry.text || entry.until < now);
    });
    if (stale.length) {
      setPending((current) => {
        const next = { ...current };
        for (const part of stale) delete next[part];
        return next;
      });
      return;
    }
    const soonest = Math.min(...PARTS.map((part) => pending[part]?.until ?? Infinity));
    if (!Number.isFinite(soonest)) return;
    const timer = setTimeout(() => setPending((current) => ({ ...current })), Math.max(0, soonest - now) + 10);
    return () => clearTimeout(timer);
  }, [texts, pending]);

  const finished = (part: ChartTextPart, frame: ChartTextFrame, value: OfficeChartTextValue, changed: boolean) => {
    if (!changed) return;
    setPending((current) => ({
      ...current,
      [part]: { text: value.text, pieces: value.pieces, frame, until: Date.now() + PENDING_MS },
    }));
  };

  return (
    <div
      ref={layerRef}
      aria-hidden={edit ? undefined : "true"}
      data-testid={testId}
      // Over a 3-D chart's live canvas, which hides the flat drawing beside
      // this layer (data-chart-flat-covered) and leaves its texts here.
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 1 }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: scale.x === 1 && scale.y === 1 ? undefined : `scale(${scale.x}, ${scale.y})`,
          transformOrigin: "0 0",
          ...(faded ? { opacity: 0.35 } : {}),
        }}
      >
        {(() => {
          // One data label typed in place: drawn here while it is typed.
          const typed = edit?.part.startsWith("label:") ? /^label:(\d+):(\d+)$/.exec(edit.part) : null;
          const label = typed
            ? labels?.find((entry) => entry.series === Number(typed[1]) && entry.point === Number(typed[2]))
            : undefined;
          return label && edit ? (
            <ChartTextBox
              key={`${edit.part}:${edit.serial}`}
              part={edit.part}
              frame={chartLabelTextFrame(label)}
              current={null}
              words={null}
              edit={edit}
              testId={`${testId}-label`}
              onFinished={() => onEditEnd?.(edit)}
            />
          ) : null;
        })()}
        {PARTS.map((part) => {
          const shown = texts[part];
          const waiting = pending[part];
          const frame = shown ?? waiting?.frame;
          if (!frame) return null;
          const editing = edit?.part === part ? edit : null;
          return (
            <ChartTextBox
              key={`${part}:${editing?.serial ?? "drawn"}`}
              part={part}
              frame={waiting && !editing ? waiting.frame : frame}
              current={shown ?? null}
              words={waiting && !editing ? waiting.pieces : null}
              edit={editing}
              testId={`${testId}-${part}`}
              onFinished={(value, changed) => {
                finished(part, frame, value, changed);
                if (editing) onEditEnd?.(editing);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChartTextBox({
  part,
  frame,
  current,
  words,
  edit,
  testId,
  onFinished,
}: {
  part: string;
  frame: ChartTextFrame;
  /** The picture's frame now (it moves on while the words are typed). */
  current: ChartTextFrame | null;
  /** Words standing in for the picture's (a committed edit being drawn). */
  words: { text: string; run: number }[] | null;
  edit: OfficeChartTextEdit | null;
  testId: string;
  onFinished: (value: OfficeChartTextValue, changed: boolean) => void;
}) {
  const painted = useMemo(() => paintCss(frame.paint), [frame.paint]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);
  const latest = useRef({ edit, onFinished, frame });
  latest.current = { edit, onFinished, frame };
  const startText = useRef(frame.text);
  // When the edit began, and how the editor takes its focus back; how many
  // times it began (a run superseded by the next is not an end).
  const beganAt = useRef(0);
  const runs = useRef(0);
  const retake = useRef<() => void>(() => {});

  // `target`: the text the edit was typed in (React lets go of the ref when
  // the text leaves the page; its words are still in it).
  const finish = (commit: boolean, target: HTMLDivElement | null = hostRef.current) => {
    const host = target;
    const active = latest.current.edit;
    if (finishedRef.current || !host || !active) return;
    finishedRef.current = true;
    const value = readChartTextHost(host);
    // Words left as they were are nothing to write (a label kept its own,
    // automatic words; a title its runs).
    const changed = commit && value.text !== startText.current;
    active.onFinish(changed, value);
    latest.current.onFinished(value, changed);
  };

  // The edit begins: the words become the DOM's (uncontrolled while typed),
  // the caret goes where the click landed, else every character is selected.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!edit || !host) return;
    finishedRef.current = false;
    startText.current = frame.text;
    fillHost(host, frame.runs.map((run) => ({ text: run.text, run: run.run })), frame, Boolean(painted));
    runs.current += 1;
    beganAt.current = performance.now();
    // The focus once the click that began the edit is over: the object the
    // click landed on takes the focus back in its own click handling (the
    // deck's slide object does), which would end the edit at once.
    const take = () => {
      if (finishedRef.current || !host.isConnected) return;
      host.focus({ preventScroll: true });
      const placed = edit.at ? placeChartTextCaret(host, edit.at.clientX, edit.at.clientY) : false;
      if (!placed) selectAllChartText(host);
      rememberChartTextSelection(host);
    };
    const timer = window.setTimeout(take, 0);
    retake.current = () => {
      if (finishedRef.current || !host.isConnected || host.ownerDocument.activeElement === host) return;
      const selected = chartTextSelection(host);
      host.focus({ preventScroll: true });
      if (selected) selectChartText(host, selected.start, selected.end);
    };
    const doc = host.ownerDocument;
    const onSelection = () => {
      keepChartTextSelectionInside(host);
      rememberChartTextSelection(host);
    };
    doc.addEventListener("selectionchange", onSelection);
    return () => {
      window.clearTimeout(timer);
      doc.removeEventListener("selectionchange", onSelection);
      // Taken away while typed (the chart deselected, the slide changed):
      // the words typed are kept, as a click outside keeps them -- unless
      // the edit begins again at once (React's development run of every
      // effect twice), which leaves the text in place and the edit going on.
      const run = runs.current;
      queueMicrotask(() => {
        if (runs.current === run) finish(true, host);
      });
    };
    // The edit's identity is its serial; the frame is read once at its start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.serial]);

  // A ribbon command changed the runs while typing (Home's Font group on the
  // characters selected): the picture of the same words comes back with the
  // runs' new looks; the words and the selection stay.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!edit || !host || !current) return;
    const typed = readChartTextHost(host);
    if (typed.text !== current.text) {
      // Still the words the edit began with: what differs is the typing.
      if (current.text === startText.current) return;
      // The words were written from elsewhere while the text was in edit
      // (the Format pane's title box, which keeps the edit going): the text
      // takes them as its start, so it never shows the old words and a click
      // outside has nothing of its own to write back over the later write.
      startText.current = current.text;
      const focused = host.ownerDocument.activeElement === host;
      fillHost(host, current.runs.map((run) => ({ text: run.text, run: run.run })), current, Boolean(painted));
      if (focused) selectAllChartText(host);
      return;
    }
    const sameRuns =
      typed.pieces.length === current.runs.length &&
      typed.pieces.every((piece, index) => piece.run === current.runs[index].run && piece.text === current.runs[index].text);
    const looks = Array.from(host.querySelectorAll<HTMLElement>(`[${CHART_TEXT_RUN_ATTRIBUTE}]`)).map((span) => span.style.cssText);
    const next = current.runs.map((run) => {
      const probe = host.ownerDocument.createElement("span");
      Object.assign(probe.style, domCss(lookCss(run.look, Boolean(painted), Boolean(current.wrapWidth), false, run.text)));
      return probe.style.cssText;
    });
    if (sameRuns && looks.length === next.length && looks.every((css, index) => css === next[index])) return;
    const selected = chartTextSelection(host);
    fillHost(host, current.runs.map((run) => ({ text: run.text, run: run.run })), current, Boolean(painted));
    if (selected && host.ownerDocument.activeElement === host) selectChartText(host, selected.start, selected.end);
  }, [current, edit, painted]);

  const firstLook = frame.runs[0]?.look;
  const editing = Boolean(edit);
  const shownRuns = words
    ? words.map((piece) => ({ ...piece, look: runLooks(frame).get(piece.run) ?? firstLook }))
    : frame.runs;
  return (
    <div
      data-chart-text-part={part}
      style={{
        position: "absolute",
        left: frame.cx - frame.width / 2,
        top: frame.cy - frame.height / 2,
        width: frame.width,
        height: frame.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        pointerEvents: "none",
      }}
    >
      <div
        ref={hostRef}
        data-testid={editing ? edit!.testId ?? testId : testId}
        data-office-chart-title={editing ? part : undefined}
        // Editor chrome while typed: a press here is the text's, never the
        // start of moving the chart (Docs' object gestures skip chrome).
        data-document-selection-chrome={editing ? "true" : undefined}
        role={editing ? "textbox" : undefined}
        aria-multiline={editing ? true : undefined}
        aria-label={editing ? edit!.label : undefined}
        contentEditable={editing ? true : undefined}
        suppressContentEditableWarning
        spellCheck={false}
        style={{
          ...lookCss(firstLook, Boolean(painted)),
          ...(painted ?? {}),
          // A title the drawing wrapped at its spaces wraps the same way.
          whiteSpace: frame.wrapWidth ? "pre-wrap" : "pre",
          maxWidth: frame.wrapWidth,
          textAlign: "center",
          // A wrapped title's lines at Office's 1.2, as the picture draws them
          // (a worksheet chart's at its face's line).
          lineHeight: frame.lineEm ?? (frame.wrapWidth ? 1.2 : 1),
          flex: "0 0 auto",
          minWidth: editing ? 2 : undefined,
          minHeight: editing ? (firstLook?.fontSize ?? 12) : undefined,
          textTransform: frame.caps ? "uppercase" : undefined,
          // Text direction Stacked: a character under the one before, each
          // upright, lines (a typed line break) side by side (X-178).
          ...(frame.stacked ? { writingMode: "vertical-lr" as const, textOrientation: "upright" as const } : {}),
          // Its words take the click (the picture finds the element there):
          // over a 3-D chart's canvas, and inside a host that passes no
          // pointer to its picture, the title is still clicked.
          pointerEvents: "auto",
          userSelect: editing ? "text" : "none",
          WebkitUserSelect: editing ? "text" : "none",
          cursor: editing ? "text" : undefined,
          outline: editing ? "1px solid #9ca3af" : "none",
          outlineOffset: editing ? 2 : undefined,
          caretColor: editing ? (firstLook?.color && firstLook.color !== "transparent" ? firstLook.color : "#000000") : undefined,
        }}
        onKeyDown={
          editing
            ? (event) => {
                // The chart's own keys (Delete, the arrows, Enter) stay in the text.
                event.stopPropagation();
                if (isImeKeydown(event)) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertChartText(event.currentTarget, "\n");
                  return;
                }
                // Select All is the text's words only: WebKit's own selects
                // the outermost editable around it (a Docs page, whose
                // content the next key then replaced).
                if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a") {
                  event.preventDefault();
                  selectAllChartText(event.currentTarget);
                  rememberChartTextSelection(event.currentTarget);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  finish(true);
                  return;
                }
                if (event.key === "Tab") event.preventDefault();
              }
            : undefined
        }
        onPaste={
          editing
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
                if (text) insertChartText(event.currentTarget, text);
              }
            : undefined
        }
        onDrop={editing ? (event) => event.preventDefault() : undefined}
        onBlur={
          editing
            ? (event) => {
                // Into the ribbon (a tab, the Font group, a menu): the text
                // stays in edit, its selection kept, as Office keeps the
                // title in edit while its ribbon is used.
                if (officeBlurWentIntoChrome(event.relatedTarget)) {
                  rememberChartTextSelection(event.currentTarget);
                  return;
                }
                // Still the click that began the edit (its object refocusing
                // itself): not the user leaving the text.
                if (performance.now() - beganAt.current < 400) {
                  window.setTimeout(() => retake.current(), 0);
                  return;
                }
                finish(true);
              }
            : undefined
        }
        onPointerDown={editing ? (event) => event.stopPropagation() : undefined}
        onMouseDown={editing ? (event) => event.stopPropagation() : undefined}
        onClick={editing ? (event) => event.stopPropagation() : undefined}
        onDoubleClick={editing ? (event) => event.stopPropagation() : undefined}
      >
        {editing
          ? null
          : shownRuns.map((run, index) =>
              run.text ? (
                <span key={index} data-chart-run={run.run} style={lookCss(run.look, Boolean(painted), Boolean(frame.wrapWidth), true, frame.stacked ? undefined : run.text)}>
                  {/* Stacked: Excel stands each word in a column of its own
                      ("Vertical" beside "Title", O13); a line break is the
                      next column in vertical writing. */}
                  {frame.stacked
                    ? run.text.replace(/ +/g, "\n")
                    : run.look.caps === "small"
                      ? // Small Caps as the picture draws them: a lower-case
                        // letter as its capital at Office's smaller size.
                        chartTextSmallCapsPieces(run.text).map((piece, at) =>
                          piece.small ? (
                            <span key={at} style={{ fontSize: officeSmallCapsSizePx(run.look.fontSize) }}>
                              {piece.text}
                            </span>
                          ) : (
                            piece.text
                          ),
                        )
                      : run.text}
                </span>
              ) : null,
            )}
      </div>
    </div>
  );
}
